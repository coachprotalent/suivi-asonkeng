-- Annulation d'une demande par son propre auteur (D40, D42, design 2b §7.2). Voir
-- l'en-tête de la Task 9 du plan pour le raisonnement sur l'atomicité et le risque
-- documenté qui l'accompagne.

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
  -- demande survit, la référence ne pointe plus vers rien.
  if v_membre is not null then
    delete from public.membres where id = v_membre;
  end if;

  -- D41 : les notifications déjà envoyées aux administrateurs pour CETTE demande
  -- sont marquées lues — sans quoi la cloche d'un administrateur pointerait vers
  -- une demande qui n'existe plus à traiter.
  update public.notifications
     set lu_le = now()
   where type = 'nouvelle_demande'
     and lien = '/demandes/' || p_demande::text
     and lu_le is null;
end;
$$;

comment on function public.annuler_demande_membre(uuid, uuid) is
  'Annule une demande en_attente à la demande de son propre auteur (D40) : fait passer etat à annulee ET supprime la fiche en_attente qu''elle portait (D42), dans une transaction unique — voir le plan, Task 9, pour la garantie d''atomicité et son risque documenté. Marque lues les notifications nouvelle_demande déjà envoyées pour cette demande (D41). SECURITY DEFINER, EXECUTE réservé à service_role.';

revoke execute on function public.annuler_demande_membre(uuid, uuid) from public, anon, authenticated;
grant execute on function public.annuler_demande_membre(uuid, uuid) to service_role;
