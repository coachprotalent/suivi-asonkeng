-- Participants externes à un événement (spec §4.4, D13). Colonnes du §4.4, plus les
-- colonnes d'auteur (D60), de conversion et de classement sans suite (D61).
--
-- D60 — pourquoi `cree_par` : deux raisons indépendantes, chacune suffisante. (1) D23
-- élargit le cercle qui voit et saisit une confidence ; savoir QUI a fait entrer une
-- personne est la contrepartie directe de cet élargissement. (2) Les suites de tests
-- écrivent en base de PRODUCTION, et `cree_par` est déjà, sur seances_ael, la seule prise
-- du balayage de rattrapage après une exécution interrompue.

create table public.participants_externes (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  prenom text,
  telephone text,
  email text,
  ville text,
  pays text,
  -- D64 — `on delete restrict`, JAMAIS `set null`. Le réflexe `set null` (et ce que porte
  -- déjà demandes_membre.membre_id) DÉCONVERTIRAIT SILENCIEUSEMENT le participant : sa
  -- fiche disparaît, son lien devient NULL, il RÉAPPARAÎT dans la liste « à traiter » et
  -- son historique de séminaire est perdu — sans une seule erreur. Le chemin 1 de la
  -- conversion crée une fiche `en_attente`, et le projet compte exactement DEUX delete sur
  -- membres (D26 rattachement, D42 (2b) annulation) : le second est atteignable, puisque
  -- l'administrateur convertisseur est le demandeur. Deux barrières le ferment : cette
  -- contrainte refuse la suppression même par écriture directe, et
  -- public.annuler_demande_membre, amendée, explique.
  converti_en_membre_id uuid references public.membres (id) on delete restrict,
  converti_le timestamptz,
  converti_par uuid references public.profils (id) on delete set null,
  -- D61 — le classement vit sur la PERSONNE, jamais sur la participation. Une personne qui
  -- a exprimé le désir d'un suivi à DEUX séminaires produit DEUX participations ; classer
  -- l'une la laisserait dans la liste par l'autre, et le classement paraîtrait sans effet.
  classe_le timestamptz,
  classe_par uuid references public.profils (id) on delete set null,
  motif_classement text,
  cree_par uuid references public.profils (id) on delete set null,
  cree_le timestamptz not null default now(),
  constraint participants_externes_nom_non_vide check (length(trim(nom)) > 0),
  -- ATTENTION À L'APOSTROPHE : la chaîne vide s'écrit '' (DEUX apostrophes) dans un
  -- fichier .sql. Le §5.3 du document de design l'écrit '''' parce qu'il CITE du SQL ;
  -- transcrire quatre apostrophes ici produirait la chaîne d'UN caractère « ' », dont la
  -- longueur après trim vaut 1 — la moitié droite de cette contrainte serait alors
  -- TOUJOURS VRAIE, donc inerte, sans la moindre erreur.
  constraint participants_externes_classement_coherent
    check (
      (classe_le is null and classe_par is null and motif_classement is null)
      or (classe_le is not null and length(trim(coalesce(motif_classement, ''))) > 0)
    ),
  constraint participants_externes_conversion_coherente
    check ((converti_en_membre_id is null) = (converti_le is null))
  -- AUCUNE contrainte n'oppose `classe_le` et `converti_en_membre_id` (D62) : « pas de
  -- réouverture » porte sur la LISTE, pas sur le sort de la personne. Quelqu'un classé
  -- sans suite il y a deux ans qui reprend contact doit pouvoir être converti, et cette
  -- conversion ne repeuple aucune liste.
);

comment on table public.participants_externes is
  'Personne rencontrée lors d''un événement sans être membre de l''équipe (spec §4.4, D13). AUCUNE unicité sur l''identité, et ce n''est pas un oubli : deux homonymes sont possibles, et la même personne peut être saisie deux fois à deux séminaires par deux modérateurs. Aucune combinaison de nom, téléphone et ville n''est fiable ; le cas se traite par le chemin 3 de la conversion — rattacher les deux à la même fiche membre —, sans rien détruire (D26 exclut la fusion générale de fiches).';
comment on column public.participants_externes.converti_en_membre_id is
  'Fiche membre issue de la conversion (D63) : posée UNE FOIS, jamais modifiée — le déclencheur participants_externes_liens_definitifs le refuse avec le marqueur participant_deja_converti. La vue seminaires_assistes résout les séminaires d''un converti PAR CETTE COLONNE : la changer déplacerait silencieusement une participation d''une fiche à une autre. on delete restrict (D64) : une suppression de la fiche déconvertirait le participant en silence.';
comment on column public.participants_externes.motif_classement is
  'Motif du classement sans suite (D61), obligatoire et non vide dès que classe_le est renseigné (participants_externes_classement_coherent). Le classement porte sur la PERSONNE, pas sur une participation.';

-- La seconde branche de seminaires_assistes (D70) joint sur cette colonne.
create index participants_externes_converti_en_membre_id_idx
  on public.participants_externes (converti_en_membre_id);
-- Prise du balayage de rattrapage des suites de test (D60).
create index participants_externes_cree_par_idx on public.participants_externes (cree_par);
-- Index PARTIEL servant la liste « à traiter » (D74, D75) : son tri de pagination est
-- (premiere_expression, participant_externe_id), mais le filtre de la vue porte
-- exactement sur ces deux prédicats, et ils écartent la très grande majorité des lignes
-- une fois le projet en régime.
create index participants_externes_a_traiter_idx
  on public.participants_externes (cree_le desc, id)
  where converti_en_membre_id is null and classe_le is null;

-- DÉCLENCHEUR DES LIENS DÉFINITIFS (D62, D63).
--
-- `is distinct from`, JAMAIS `<>`. Un déclencheur `before` s'exécute AVANT la vérification
-- des not null : `new.x <> 'v'` rend NULL quand `x` est nul, et fait tomber dans la
-- MAUVAISE branche. Le projet a déjà payé ce piège une fois, migration
-- 20260817150000_corriger_marqueur_completude_null.sql. Ici, le cas concret est direct :
-- un `update … set converti_en_membre_id = null` sur une ligne déjà convertie doit être
-- REFUSÉ, et c'est exactement le cas où `<>` rendrait NULL et laisserait passer.
--
-- Double contrôle assumé, motif établi depuis l'archivage en 1c : le déclencheur protège
-- même une écriture DIRECTE, la passerelle amont explique.
create or replace function prive.refuser_reouverture_participant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.converti_en_membre_id is not null
     and new.converti_en_membre_id is distinct from old.converti_en_membre_id then
    raise exception 'Ce participant a déjà été converti en membre.'
      using detail = 'participant_deja_converti';
  end if;

  if old.classe_le is not null
     and new.classe_le is distinct from old.classe_le then
    raise exception 'Ce participant a déjà été classé sans suite.'
      using detail = 'classement_definitif';
  end if;

  return new;
end;
$$;

comment on function prive.refuser_reouverture_participant() is
  'Déclencheur before update sur public.participants_externes : refuse de modifier converti_en_membre_id une fois posé (marqueur participant_deja_converti, D63) et de modifier classe_le une fois posé, y compris pour le remettre à NULL (marqueur classement_definitif, D62). `is distinct from` et non `<>` : un déclencheur before s''exécute avant la vérification des not null, et `<>` sur une valeur nulle rend NULL, donc tombe dans la mauvaise branche — piège déjà payé une fois par ce projet (migration 20260817150000). Barrière de dernier recours, y compris pour une écriture directe : les passerelles convertir_participant_externe et classer_participant_externe portent le même refus en amont, pour produire un message avant d''écrire.';

create trigger participants_externes_liens_definitifs
  before update on public.participants_externes
  for each row execute function prive.refuser_reouverture_participant();

revoke all on public.participants_externes from anon, authenticated;
grant select on public.participants_externes to authenticated;

alter table public.participants_externes enable row level security;
alter table public.participants_externes force row level security;

-- Administrateur OU modérateur (spec §5.3, amendée par D23 ; D80). PREMIÈRE table du
-- projet, avec participations, dont la LECTURE dépend d'un rôle autre qu'administrateur.
create policy participants_externes_lecture on public.participants_externes
  for select
  to authenticated
  using (
    (select prive.est_actif())
    and (select prive.est_moderateur_ou_admin())
  );
