-- Phase 8, D157 / D158 — une demande survit à la suppression de son auteur.
--
-- ═══ POURQUOI, ET CE QUI A ÉTÉ MESURÉ ═══
-- `demandeur_profil_id` était en `on delete cascade` (20260815110000) : supprimer un compte
-- aurait effacé, EN SILENCE, toutes ses demandes — l'historique de qui a proposé qui.
--
-- L'utilisateur a d'abord voulu REFUSER la suppression dans ce cas, puis est revenu dessus
-- une fois MESURÉ que :
--   • une demande n'est JAMAIS supprimée — `annuler_demande_membre` passe son état à
--     `annulee` et la ligne reste (20260815200000) ;
--   • TOUTE inscription par token en crée une (`origine: 'auto_inscription'`,
--     src/app/inscription/actions.ts:568).
-- Ce refus aurait donc rendu TOUT COMPTE AUTO-INSCRIT DÉFINITIVEMENT INDESTRUCTIBLE —
-- c'est-à-dire exactement le « compte créé par erreur » que la demande vise.
--
-- Le remède retenu est celui que le projet a DÉJÀ employé pour
-- `journal_statuts.par_nom_affichage` (20260813160000), et pour la même raison : un registre
-- d'audit doit rester lisible sans dépendre de l'existence du compte auteur.
--
-- ═══ LE NOM EST FIGÉ PAR UN DÉCLENCHEUR, JAMAIS PAR LES APPELANTS (D158) ═══
-- Le dépôt compte TROIS sites d'insertion, relevés :
--   • src/app/inscription/actions.ts:566
--   • src/app/demandes/nouvelle/actions.ts:51
--   • public.convertir_participant_externe — EN SQL (20260818280000, dernière version).
-- CE TROISIÈME SITE EST DÉCISIF : aucune modification applicative ne l'aurait couvert, et le
-- nom aurait manqué précisément sur les demandes nées d'une conversion de participant
-- externe. Un site oublié écrit une ligne muette, invisible jusqu'au jour où son auteur est
-- supprimé. Un déclencheur ne peut être oublié par aucun des trois.
--
-- ═══ CONSÉQUENCE SUR LA LECTURE, ÉNONCÉE ═══
-- La politique `demandes_membre_lecture` (20260815110000) compare
-- `demandeur_profil_id = auth.uid()`. Une fois la colonne à `null`, cette comparaison rend
-- `null`, donc jamais vrai : la demande devient invisible aux comptes ordinaires et ne reste
-- lisible que de l'administrateur. C'est le comportement voulu — son auteur n'existe plus,
-- il n'y a plus personne à qui elle appartienne.

alter table public.demandes_membre add column demandeur_nom_affichage text;

comment on column public.demandes_membre.demandeur_nom_affichage is
  'Nom d''affichage du demandeur, capturé au moment de l''insertion par le déclencheur demandes_membre_nom_demandeur (phase 8, D158), pour que la demande reste lisible après la suppression de son auteur. Nul uniquement pour une ligne dont le profil auteur était déjà introuvable à l''insertion : un défaut cosmétique de résolution du nom ne doit pas empêcher une demande par ailleurs valide.';

-- ORDRE IMPOSÉ : la colonne devient nullable AVANT que la clé étrangère ne passe en
-- `set null`. L'inverse ferait échouer la contrainte sur une colonne encore `not null`.
alter table public.demandes_membre alter column demandeur_profil_id drop not null;

-- Nom par défaut d'une clé étrangère déclarée EN LIGNE (20260815110000:14) :
-- <table>_<colonne>_fkey. Si ce `drop` échoue, c'est que le nom réel diffère — le lire dans
-- `pg_constraint` et corriger ici plutôt que de contourner.
alter table public.demandes_membre
  drop constraint demandes_membre_demandeur_profil_id_fkey;
alter table public.demandes_membre
  add constraint demandes_membre_demandeur_profil_id_fkey
  foreign key (demandeur_profil_id) references public.profils (id) on delete set null;

create or replace function prive.figer_nom_demandeur()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- `security definer` : cette lecture de `profils` n'est pas bridée par `profils_lecture`,
  -- qui ne laisse un non-administrateur voir que son propre profil. Sans cela, une demande
  -- créée par un compte ordinaire n'aurait pas pu résoudre son propre nom depuis certaines
  -- voies. Même raisonnement que prive.attribuer_statut (20260813160000).
  --
  -- LA CONDITION `is null` N'EST PAS DÉCORATIVE : si un appelant fournit déjà la valeur, on
  -- ne l'écrase pas. Cela laisse une porte à une reprise de données ou à un import, sans
  -- que le déclencheur n'ait à connaître ces cas.
  --
  -- UN PROFIL INTROUVABLE LAISSE LA COLONNE À `null`, SANS LEVER : un défaut cosmétique de
  -- résolution du nom ne doit pas empêcher une demande par ailleurs valide. C'est le même
  -- arbitrage que `journal_statuts.par_nom_affichage`, et il est délibéré.
  if new.demandeur_nom_affichage is null and new.demandeur_profil_id is not null then
    select p.nom_affichage into new.demandeur_nom_affichage
    from public.profils p
    where p.id = new.demandeur_profil_id;
  end if;
  return new;
end;
$$;

create trigger demandes_membre_nom_demandeur
  before insert on public.demandes_membre
  for each row execute function prive.figer_nom_demandeur();

comment on function prive.figer_nom_demandeur() is
  'Déclencheur before insert sur public.demandes_membre (phase 8, D158) : capture le nom d''affichage du demandeur au moment de l''écriture, pour que la demande reste lisible après la suppression de son auteur. Placé en DÉCLENCHEUR et non chez les appelants parce que le dépôt compte trois sites d''insertion, dont un EN SQL (public.convertir_participant_externe) qu''aucune modification applicative n''aurait couvert. N''écrase jamais une valeur fournie, et ne lève jamais : un profil introuvable laisse la colonne à null.';

-- RATTRAPAGE des lignes existantes, DANS LA MÊME MIGRATION. Sans lui, toutes les demandes
-- antérieures à cette phase perdraient leur auteur à la première suppression de compte — et
-- le déclencheur, qui ne porte que sur les insertions, ne les rattraperait jamais.
update public.demandes_membre d
   set demandeur_nom_affichage = p.nom_affichage
  from public.profils p
 where p.id = d.demandeur_profil_id
   and d.demandeur_nom_affichage is null;
