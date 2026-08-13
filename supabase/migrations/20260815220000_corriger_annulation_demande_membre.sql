-- Ronde de correction sur annuler_demande_membre (20260815200000, non modifiée —
-- déjà appliquée). Deux constats de revue (I2, I4b) :
--
-- I2 : le `delete from public.membres where id = v_membre` s'exécutait SANS
-- condition `etat = 'en_attente'`, alors que le commentaire promettait déjà que
-- seule la fiche en_attente était visée. Sans cette garde, une demande en_attente
-- qui référencerait une fiche dans un autre état (archivée, par exemple — le
-- beforeAll de tests/rls/demandes-membre.test.ts construit déjà ce cas) verrait
-- cette fiche supprimée par une simple annulation, alors que ce n'est PAS la
-- fiche jetable que D42 vise. La cascade `membres → journal_statuts` (on delete
-- cascade, migration 20260812120000) ferait alors disparaître l'historique des
-- statuts de cette personne — la seule voie d'effacement complet qu'un compte
-- ordinaire ne devrait jamais pouvoir déclencher (cf. le commentaire de
-- journal_statuts, phase 1b, migration 20260813170000).
--
-- I4b : le lien `'/demandes/' || p_demande::text` utilisé pour repérer les
-- notifications nouvelle_demande à marquer lues pointait vers une route
-- `/demandes/[id]` qui n'est pas planifiée dans cette phase (seules
-- `demandes/page.tsx` et `demandes/nouvelle/page.tsx` existent) : un clic sur
-- cette notification aurait mené à un not-found. Corrigé pour pointer vers
-- `/demandes`, la liste, où un administrateur agit réellement sur une demande.

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
  -- qui ne serait plus la fiche jetable en_attente d'origine (archivée, ou
  -- entre-temps devenue active par un autre chemin) ; dans ce cas la fiche
  -- survit intacte et membre_id de la demande annulée continue de la référencer.
  if v_membre is not null then
    delete from public.membres where id = v_membre and etat = 'en_attente';
  end if;

  -- D41 : les notifications déjà envoyées aux administrateurs pour CETTE demande
  -- sont marquées lues — sans quoi la cloche d'un administrateur pointerait vers
  -- une demande qui n'existe plus à traiter. I4b : lien corrigé vers `/demandes`
  -- (la liste), `/demandes/[id]` n'étant pas une route planifiée dans cette phase.
  update public.notifications
     set lu_le = now()
   where type = 'nouvelle_demande'
     and lien = '/demandes'
     and lu_le is null;
end;
$$;

comment on function public.annuler_demande_membre(uuid, uuid) is
  'Annule une demande en_attente à la demande de son propre auteur (D40) : fait passer etat à annulee ET supprime la fiche en_attente qu''elle portait (D42), dans une transaction unique — voir le plan, Task 9, pour la garantie d''atomicité et son risque documenté. La suppression de la fiche est gardée par etat = ''en_attente'' (ronde de correction, I2) : une fiche qui ne serait plus en_attente survit intacte. Marque lues les notifications nouvelle_demande de lien /demandes déjà envoyées (D41, lien corrigé en I4b — /demandes/[id] n''est pas une route planifiée dans cette phase). SECURITY DEFINER, EXECUTE réservé à service_role.';

revoke execute on function public.annuler_demande_membre(uuid, uuid) from public, anon, authenticated;
grant execute on function public.annuler_demande_membre(uuid, uuid) to service_role;
