-- Calendrier récurrent par antenne (spec §4.5, D14). Cette table était supposée déjà
-- amorcée par une phase antérieure (design phase 3, §4.1) ; elle ne l'était pas dans ce
-- dépôt (recherche sur supabase/migrations/, aucune occurrence de « calendrier ») — le
-- §1 du même design le confirme explicitement. Cette migration comble l'écart, sans
-- rouvrir aucune décision de la phase 3 : le contenu est celui déjà fixé par le §4.5 de
-- la spécification maîtresse.

create table public.calendriers_ael (
  id uuid primary key default gen_random_uuid(),
  -- `restrict` et non `set null`, comme `membres.antenne_id` : supprimer une antenne
  -- encore dotée d'un créneau récurrent doit échouer bruyamment.
  antenne_id uuid not null references public.antennes (id) on delete restrict,
  -- 1 = lundi ... 7 = dimanche (spec §4.5).
  jour_semaine smallint not null,
  heure time,
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  constraint calendriers_ael_jour_semaine_valide check (jour_semaine between 1 and 7),
  -- Sans cette contrainte, rien n'empêcherait deux créneaux identiques pour la même
  -- antenne : chacun étant une ligne de calendrier distincte, D41 leur ferait générer
  -- CHACUN sa séance, soit deux séances identiques à chaque occurrence, indistinguables
  -- et sans geste de suppression prévu (la Task 13 ne propose que « Désactiver », qui
  -- n'efface pas les séances déjà générées).
  -- `nulls not distinct` (Postgres 15+, ce projet est en 17) est indispensable ici :
  -- `heure` est nullable et le créneau SANS heure est justement le cas amorcé par cette
  -- migration et le plus courant à la saisie. Avec le comportement par défaut (deux NULL
  -- distincts), (antenne, mardi, NULL) resterait duplicable à volonté et la contrainte
  -- ne couvrirait que les créneaux horodatés.
  constraint calendriers_ael_creneau_unique unique nulls not distinct (antenne_id, jour_semaine, heure)
);

comment on table public.calendriers_ael is
  'Créneau récurrent par antenne (mardi/mercredi/samedi par défaut). Source de la génération des séances AEL (spec D14, D28).';
comment on column public.calendriers_ael.jour_semaine is
  '1 = lundi ... 7 = dimanche, convention ISO-8601 (spec §4.5).';
comment on constraint calendriers_ael_creneau_unique on public.calendriers_ael is
  'Un seul créneau par (antenne, jour, heure), heures nulles comprises (nulls not distinct). Un doublon ferait générer deux séances identiques à chaque occurrence (D41), sans moyen de les distinguer ni de les supprimer depuis l''interface.';

create index calendriers_ael_antenne_id_idx on public.calendriers_ael (antenne_id);

revoke all on public.calendriers_ael from anon, authenticated;
grant select on public.calendriers_ael to authenticated;

alter table public.calendriers_ael enable row level security;
alter table public.calendriers_ael force row level security;

-- Lecture ouverte à tout compte actif (design phase 3, §6). Aucune politique
-- d'écriture : toutes les mutations passent par des Server Actions (Task 13).
create policy calendriers_ael_lecture on public.calendriers_ael
  for select
  to authenticated
  using ((select prive.est_actif()));

-- Amorçage : mardi (2), mercredi (3), samedi (6) pour chaque antenne ACTIVE
-- (spec §4.5 : « Amorcé pour chaque antenne avec mardi, mercredi et samedi »).
-- `where a.actif` n'est pas un raffinement : sans lui, une antenne désactivée recevrait
-- trois créneaux `actif = true`, la génération produirait des séances pour une antenne
-- hors service, et leur liste de pointage serait vide — aucun membre actif n'y étant
-- rattaché, puisque `definirAntenneMembre` (Task 3) refuse d'y rattacher qui que ce
-- soit. Un flot de séances fantômes que rien ne signale.
insert into public.calendriers_ael (antenne_id, jour_semaine)
select a.id, jours.jour
from public.antennes a
cross join (values (2), (3), (6)) as jours (jour)
where a.actif;
