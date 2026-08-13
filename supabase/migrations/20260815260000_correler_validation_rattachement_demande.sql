-- Suite de 20260815240000/250000 : valider_demande_rattachement écrit désormais
-- demande_id à la création de sa notification demande_validee, ET filtre sur
-- demande_id (corrélation explicite) plutôt que sur lien pour marquer lues les
-- notifications nouvelle_demande de CETTE demande — même raisonnement que
-- 20260815250000 sur annuler_demande_membre.

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
  -- en_attente d'origine.
  if v_fiche_jetable is not null then
    delete from public.membres where id = v_fiche_jetable and etat = 'en_attente';
  end if;

  -- demande_id écrit à la création (corrélation explicite, migration
  -- 20260815240000). lien reste `/demandes` (la liste) : c'est désormais son
  -- SEUL rôle, la navigation — plus jamais réutilisé pour filtrer.
  insert into public.notifications (profil_id, type, titre, corps, lien, demande_id)
  values (
    v_demandeur,
    'demande_validee',
    'Votre inscription a été validée',
    'Votre compte a été rattaché à une fiche existante.',
    '/demandes',
    p_demande
  );

  -- I4a : symétrique à annuler_demande_membre (D41) — les notifications
  -- nouvelle_demande déjà envoyées aux administrateurs POUR CETTE DEMANDE sont
  -- marquées lues une fois la demande traitée. Filtre sur demande_id
  -- (corrélation explicite), PAS sur lien — voir 20260815250000 pour le même
  -- raisonnement sur annuler_demande_membre.
  update public.notifications
     set lu_le = now()
   where type = 'nouvelle_demande'
     and demande_id = p_demande
     and lu_le is null;
end;
$$;

comment on function public.valider_demande_rattachement(uuid, uuid, uuid) is
  'Valide une demande auto_inscription en rattachant le compte du demandeur à une fiche existante (D26, design 2b §7.3) : repointe demandes_membre vers la fiche définitive PUIS supprime la fiche en_attente jetable, dans cet ordre. Gardes : la fiche ciblée ne peut pas être la fiche jetable elle-même (I5, marqueur rattachement_vers_fiche_jetable) ; la suppression de la fiche jetable est gardée par etat = ''en_attente'' (I2) ; un rattachement vers une fiche déjà liée à un autre compte (profils.membre_id UNIQUE) rend le marqueur membre_deja_rattache au lieu d''un 23505 nu (I6). La notification demande_validee porte demande_id (corrélation explicite, migration 20260815240000) et lien = /demandes (navigation seulement). Marque lues les notifications nouvelle_demande dont demande_id correspond, par symétrie avec annuler_demande_membre (I4a, D41). SECURITY DEFINER, EXECUTE réservé à service_role.';

revoke execute on function public.valider_demande_rattachement(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.valider_demande_rattachement(uuid, uuid, uuid) to service_role;
