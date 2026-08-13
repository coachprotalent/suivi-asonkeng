-- Ronde de correction sur valider_demande_rattachement (20260815210000, non
-- modifiée — déjà appliquée). Quatre constats de revue (I2, I4a, I4b, I5) plus un
-- marqueur homogénéisé (I6) :
--
-- I2 : même défaut que sur annuler_demande_membre (voir 20260815220000) —
-- `delete from public.membres where id = v_fiche_jetable` s'exécutait sans la
-- garde `etat = 'en_attente'` que son propre commentaire promettait déjà.
--
-- I5 : rien n'empêchait `p_membre_existant = v_fiche_jetable` — rattacher une
-- demande à SA PROPRE fiche jetable. Les deux clés étrangères étant
-- `on delete set null`, la fonction « réussissait » silencieusement : la demande
-- passait à validee, le demandeur recevait « votre inscription a été validée »,
-- et son compte se retrouvait rattaché à une fiche qui vient d'être supprimée —
-- donc à rien. Ajout d'une garde dédiée, avec marqueur.
--
-- I4a : la fonction ne marquait pas lues les notifications nouvelle_demande liées
-- à la demande traitée, contrairement à annuler_demande_membre — alors que D41
-- l'exige « quand leur objet est traité ». Ajouté par symétrie.
--
-- I4b : même correction de lien que 20260815220000 — `/demandes` (la liste),
-- `/demandes/[id]` n'étant pas une route planifiée dans cette phase.
--
-- I6 : `profils.membre_id` est UNIQUE (migration 20260811120000). Un rattachement
-- vers une fiche déjà rattachée à un AUTRE compte levait donc un 23505 nu, sans
-- marqueur — contrairement aux deux autres refus de cette fonction. Attrapé et
-- rendu homogène avec `using detail`.

create or replace function public.valider_demande_rattachement(
  p_demande uuid,
  p_membre_existant uuid,
  p_admin uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_demandeur uuid;
  v_fiche_jetable uuid;
begin
  select d.demandeur_profil_id, d.membre_id
    into v_demandeur, v_fiche_jetable
  from public.demandes_membre d
  where d.id = p_demande
    and d.origine = 'auto_inscription'
    and d.etat = 'en_attente'
  for update;

  if not found then
    raise exception 'Cette demande ne peut pas être validée par rattachement.'
      using detail = 'demande_non_validable';
  end if;

  if not exists (select 1 from public.membres m where m.id = p_membre_existant) then
    raise exception 'La fiche choisie pour le rattachement n''existe plus.'
      using detail = 'membre_inconnu';
  end if;

  -- I5 : la fiche choisie ne peut pas être la fiche jetable de CETTE demande —
  -- sans cette garde, le rattachement « réussirait » en supprimant la seule
  -- fiche visée, laissant le demandeur rattaché à rien, silencieusement.
  if p_membre_existant = v_fiche_jetable then
    raise exception 'Le rattachement ne peut pas cibler la fiche jetable elle-même.'
      using detail = 'rattachement_vers_fiche_jetable';
  end if;

  -- Ordre délibéré (design 2b §7.3) : la ligne demandes_membre est REPOINTÉE avant
  -- que la fiche jetable ne soit supprimée, pour que l'historique de la demande
  -- reste lisible sans dépendre d'une suppression en cascade qui l'effacerait.
  update public.demandes_membre
     set membre_id = p_membre_existant,
         etat = 'validee',
         traite_par = p_admin,
         traite_le = now()
   where id = p_demande;

  -- I6 : profils.membre_id est UNIQUE. Un rattachement en doublon (fiche déjà
  -- rattachée à un AUTRE compte) lèverait un 23505 nu ; attrapé ici pour porter
  -- un marqueur homogène avec les deux refus précédents. Le bloc BEGIN/EXCEPTION
  -- crée un point de sauvegarde implicite : SEUL cet UPDATE est annulé par le
  -- rattrapage, mais l'exception relevée ensuite se propage et annule TOUTE la
  -- transaction, y compris l'UPDATE demandes_membre ci-dessus — l'atomicité de la
  -- fonction n'est pas affectée par ce bloc.
  begin
    update public.profils
       set membre_id = p_membre_existant
     where id = v_demandeur;
  exception
    when unique_violation then
      raise exception 'Cette fiche est déjà rattachée à un autre compte.'
        using detail = 'membre_deja_rattache';
  end;

  -- GARDE (I2) : ne supprimer que si la fiche est TOUJOURS la fiche jetable
  -- en_attente d'origine — voir le raisonnement identique sur
  -- annuler_demande_membre (migration 20260815220000).
  if v_fiche_jetable is not null then
    delete from public.membres where id = v_fiche_jetable and etat = 'en_attente';
  end if;

  insert into public.notifications (profil_id, type, titre, corps, lien)
  values (
    v_demandeur,
    'demande_validee',
    'Votre inscription a été validée',
    'Votre compte a été rattaché à une fiche existante.',
    null
  );

  -- I4a : symétrique à annuler_demande_membre (D41) — les notifications
  -- nouvelle_demande déjà envoyées aux administrateurs pour cette demande sont
  -- marquées lues une fois la demande traitée. I4b : lien corrigé vers
  -- `/demandes` (la liste), `/demandes/[id]` n'étant pas une route planifiée
  -- dans cette phase.
  update public.notifications
     set lu_le = now()
   where type = 'nouvelle_demande'
     and lien = '/demandes'
     and lu_le is null;
end;
$$;

comment on function public.valider_demande_rattachement(uuid, uuid, uuid) is
  'Valide une demande auto_inscription en rattachant le compte du demandeur à une fiche existante (D26, design 2b §7.3) : repointe demandes_membre vers la fiche définitive PUIS supprime la fiche en_attente jetable, dans cet ordre. Gardes ajoutées en ronde de correction : la fiche ciblée ne peut pas être la fiche jetable elle-même (I5, marqueur rattachement_vers_fiche_jetable) ; la suppression de la fiche jetable est gardée par etat = ''en_attente'' (I2) ; un rattachement vers une fiche déjà liée à un autre compte (profils.membre_id UNIQUE) rend le marqueur membre_deja_rattache au lieu d''un 23505 nu (I6). Marque lues les notifications nouvelle_demande de lien /demandes déjà envoyées pour cette demande, par symétrie avec annuler_demande_membre (I4a, D41). SECURITY DEFINER, EXECUTE réservé à service_role.';

revoke execute on function public.valider_demande_rattachement(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.valider_demande_rattachement(uuid, uuid, uuid) to service_role;
