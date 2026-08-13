-- Validation par rattachement à une fiche existante (D26, design 2b §7.3). Un des
-- DEUX SEULS `delete` sur membres de tout le projet, avec annuler_demande_membre
-- (migration 20260815200000) : le reste de l'application archive et ne supprime
-- jamais (cf. le commentaire de journal_statuts, phase 1b).

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

  -- Ordre délibéré (design 2b §7.3) : la ligne demandes_membre est REPOINTÉE avant
  -- que la fiche jetable ne soit supprimée, pour que l'historique de la demande
  -- reste lisible sans dépendre d'une suppression en cascade qui l'effacerait.
  update public.demandes_membre
     set membre_id = p_membre_existant,
         etat = 'validee',
         traite_par = p_admin,
         traite_le = now()
   where id = p_demande;

  update public.profils
     set membre_id = p_membre_existant
   where id = v_demandeur;

  if v_fiche_jetable is not null then
    delete from public.membres where id = v_fiche_jetable;
  end if;

  insert into public.notifications (profil_id, type, titre, corps, lien)
  values (
    v_demandeur,
    'demande_validee',
    'Votre inscription a été validée',
    'Votre compte a été rattaché à une fiche existante.',
    null
  );
end;
$$;

comment on function public.valider_demande_rattachement(uuid, uuid, uuid) is
  'Valide une demande auto_inscription en rattachant le compte du demandeur à une fiche existante (D26, design 2b §7.3) : repointe demandes_membre vers la fiche définitive PUIS supprime la fiche en_attente jetable, dans cet ordre. SECURITY DEFINER, EXECUTE réservé à service_role.';

revoke execute on function public.valider_demande_rattachement(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.valider_demande_rattachement(uuid, uuid, uuid) to service_role;
