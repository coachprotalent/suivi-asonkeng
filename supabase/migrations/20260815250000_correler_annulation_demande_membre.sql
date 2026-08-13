-- Suite de 20260815240000 : annuler_demande_membre filtre désormais sur
-- demande_id (corrélation explicite) plutôt que sur lien (qui ne distingue plus
-- les demandes entre elles depuis que son unique rôle est la navigation).
-- annuler_demande_membre n'insère aucune notification, seul le filtre de
-- marquage-lues change.

create or replace function public.annuler_demande_membre(
  p_demande uuid,
  p_demandeur uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membre uuid;
begin
  -- Verrou DE LIGNE : cette demande précise, pas l'arbre ni les comptes. La
  -- condition WHERE porte à la fois sur la propriété et sur l'état : une demande
  -- inexistante, appartenant à quelqu'un d'autre, ou déjà traitée produit le MÊME
  -- refus — pas de branche séparée qui distinguerait ces trois cas.
  select d.membre_id into v_membre
  from public.demandes_membre d
  where d.id = p_demande
    and d.demandeur_profil_id = p_demandeur
    and d.etat = 'en_attente'
  for update;

  if not found then
    raise exception 'Cette demande ne peut plus être annulée.'
      using detail = 'demande_non_annulable';
  end if;

  update public.demandes_membre
     set etat = 'annulee',
         traite_par = p_demandeur,
         traite_le = now()
   where id = p_demande;

  -- D42 : suppression de la fiche en_attente. membre_id de CETTE ligne devient
  -- NULL automatiquement (on delete set null, migration 20260815110000) : la
  -- demande survit, la référence ne pointe plus vers rien. GARDE (I2) :
  -- `and etat = 'en_attente'` — cette fonction ne doit JAMAIS supprimer une fiche
  -- qui ne serait plus la fiche jetable en_attente d'origine.
  if v_membre is not null then
    delete from public.membres where id = v_membre and etat = 'en_attente';
  end if;

  -- D41 : les notifications déjà envoyées aux administrateurs POUR CETTE
  -- DEMANDE sont marquées lues — sans quoi la cloche d'un administrateur
  -- pointerait vers une demande qui n'existe plus à traiter. Filtre sur
  -- demande_id (corrélation explicite, migration 20260815240000), PAS sur lien :
  -- lien est désormais un simple lien de navigation (/demandes, la liste),
  -- identique pour toutes les notifications nouvelle_demande — un filtre dessus
  -- ne sélectionnerait plus rien de spécifique à cette demande.
  update public.notifications
     set lu_le = now()
   where type = 'nouvelle_demande'
     and demande_id = p_demande
     and lu_le is null;
end;
$$;

comment on function public.annuler_demande_membre(uuid, uuid) is
  'Annule une demande en_attente à la demande de son propre auteur (D40) : fait passer etat à annulee ET supprime la fiche en_attente qu''elle portait (D42), dans une transaction unique — voir le plan, Task 9, pour la garantie d''atomicité et son risque documenté. La suppression de la fiche est gardée par etat = ''en_attente'' (I2). Marque lues les notifications nouvelle_demande dont demande_id correspond (D41) — corrélation explicite (migration 20260815240000), PAS le lien de navigation, qui ne distingue plus les demandes entre elles. SECURITY DEFINER, EXECUTE réservé à service_role.';

revoke execute on function public.annuler_demande_membre(uuid, uuid) from public, anon, authenticated;
grant execute on function public.annuler_demande_membre(uuid, uuid) to service_role;
