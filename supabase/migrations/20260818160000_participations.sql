-- Participations à un événement (spec §4.4, D13, D16 amendée par D23). Colonnes du §4.4,
-- plus les quatre colonnes d'auteur de D60.
--
-- D60 — `saisi_par`/`saisi_le` sont posés à la création et JAMAIS réécrits ;
-- `modifie_par`/`modifie_le` portent la dernière retouche. La séparation existe parce que
-- D77 rend une participation modifiable après coup : un désir se recueille souvent après
-- l'événement, dans une conversation. Sans cette séparation, corriger un désir obligerait
-- à supprimer puis resaisir, donc à perdre l'origine. Et une ligne de participations n'a
-- AUCUN champ nommable — ni titre, ni thème : sans `saisi_par`, une exécution de test
-- interrompue laisserait des participations irretrouvables.

create table public.participations (
  id uuid primary key default gen_random_uuid(),
  -- `cascade` : une participation n'a aucun sens sans son événement — même régime que
  -- presences_ael.seance_id.
  evenement_id uuid not null references public.evenements (id) on delete cascade,
  -- `restrict` sur les DEUX références : supprimer une personne ne doit pas effacer sans
  -- bruit son passage à un événement.
  membre_id uuid references public.membres (id) on delete restrict,
  participant_externe_id uuid references public.participants_externes (id) on delete restrict,
  desir_mentorat_academique boolean not null default false,
  desir_suivi_spirituel boolean not null default false,
  desir_cpeap boolean not null default false,
  note text,
  saisi_par uuid references public.profils (id) on delete set null,
  saisi_le timestamptz not null default now(),
  modifie_par uuid references public.profils (id) on delete set null,
  modifie_le timestamptz,
  -- D59 — « exactement une des deux références ». Condition LOCALE À LA LIGNE : elle ne
  -- dépend d'aucune autre table, donc un `check` et non un déclencheur — exactement le
  -- critère posé par D36 (phase 3) pour l'exclusivité enseignant/modérateur. Le motif qui
  -- justifiait un déclencheur pour l'exclusivité des statuts (la condition vit sur
  -- groupes_statut) ne s'applique pas ici.
  --
  -- `num_nonnulls` couvre LES DEUX SENS en une seule expression — les deux nulles ET les
  -- deux remplies —, ce qui évite d'écrire deux moitiés dont une seule serait éprouvée.
  -- La preuve n°1 les éprouve quand même toutes les deux, par écriture réelle en base.
  constraint participations_une_seule_reference
    check (num_nonnulls(membre_id, participant_externe_id) = 1)
);

comment on table public.participations is
  'Participation d''un membre OU d''un participant externe à un événement, avec les trois désirs et une note (spec §4.4). UNE PARTICIPATION EST UN FAIT DATÉ QUI NE BOUGE JAMAIS (D69, application directe de D48) : la conversion d''un participant externe ne repointe JAMAIS membre_id — la ligne reste attachée au participant externe, et le lien vers le membre se fait par participants_externes.converti_en_membre_id, résolu À LA LECTURE par la vue seminaires_assistes (D70). Repointer effacerait le fait que cette personne est entrée par un séminaire — précisément ce que D13 veut mesurer — et pourrait ÉCHOUER sur l''index unique (evenement_id, membre_id) dans le cas normal du chemin 3.';
comment on column public.participations.saisi_par is
  'Auteur de la SAISIE, posé à la création et jamais réécrit (D60). Contrepartie de l''élargissement de D23, et seule prise du balayage de rattrapage des suites de test sur une table sans champ nommable.';
comment on column public.participations.modifie_par is
  'Auteur de la DERNIÈRE RETOUCHE (D60, D77). NULL tant que la ligne n''a pas été modifiée.';

-- D58 — DEUX INDEX UNIQUES PARTIELS, et surtout PAS `unique nulls not distinct`.
--
-- La convention maison du dépôt est bien `unique nulls not distinct (...)` quand une
-- colonne nullable entre dans une clé d'unicité — calendriers_ael_creneau_unique l'emploie
-- À BON DROIT. Appliquée ICI, elle n'autoriserait qu'UN SEUL PARTICIPANT EXTERNE PAR
-- ÉVÉNEMENT : toutes les lignes d'externes partagent membre_id = NULL, donc s'écraseraient
-- sur la première unicité, et le deuxième externe ajouté recevrait un 23505 parfaitement
-- opaque. Les deux unicités du §4.4 fonctionnent telles quelles (deux NULL sont distincts
-- par défaut : chaque contrainte est active sur les lignes qu'elle vise et inerte sur les
-- autres) ; les index partiels ci-dessous DISENT cette intention au lieu de la laisser
-- déduire, et suppriment la tentation.
--
-- Effet secondaire utile : `evenement_id` étant en tête des deux, ils servent aussi la
-- lecture paginée des participants d'un événement (D75) sans index supplémentaire.
create unique index participations_membre_unique
  on public.participations (evenement_id, membre_id)
  where membre_id is not null;

create unique index participations_externe_unique
  on public.participations (evenement_id, participant_externe_id)
  where participant_externe_id is not null;

-- NI l'un NI l'autre ne ferme le doublon le PLUS PROBABLE : la même personne inscrite une
-- fois comme membre et une fois comme externe. Les deux index sont aveugles l'un à
-- l'autre, et aucune contrainte ne peut savoir que deux lignes désignent le même être
-- humain. C'est précisément pour cela que la vue seminaires_assistes déduplique par
-- `union` et non `union all` (D70).

create index participations_membre_id_idx on public.participations (membre_id);
create index participations_participant_externe_id_idx
  on public.participations (participant_externe_id);
create index participations_saisi_par_idx on public.participations (saisi_par);
-- La vue participants_a_traiter (D74) joint sur participant_externe_id en ne retenant que
-- les lignes portant le désir : index PARTIEL, qui reste petit quel que soit le volume.
create index participations_desir_suivi_idx
  on public.participations (participant_externe_id)
  where desir_suivi_spirituel;

revoke all on public.participations from anon, authenticated;
grant select on public.participations to authenticated;

alter table public.participations enable row level security;
alter table public.participations force row level security;

-- Administrateur OU modérateur (spec §5.3, amendée par D23 ; D80). Voir la note du §2 du
-- design de la phase 4 : le §4.4 disait « administrateur » seul, ce qui était FAUX depuis
-- l'amendement D23 du 2026-08-12 ; le texte de la spécification maîtresse a été corrigé
-- le 2026-08-14 (D54).
create policy participations_lecture on public.participations
  for select
  to authenticated
  using (
    (select prive.est_actif())
    and (select prive.est_moderateur_ou_admin())
  );
