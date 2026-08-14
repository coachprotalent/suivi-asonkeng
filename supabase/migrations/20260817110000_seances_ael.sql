-- Séances AEL, leurs antennes ciblées et le pointage des présences (spec §4.5, D14).
-- Design phase 3, §4.2-§4.4 : colonne additive `genere_pour_le` (D39), contraintes
-- d'exclusivité (D36) et d'unicité de génération (D38).

create type public.etat_seance_ael as enum ('prevue', 'tenue', 'annulee');

create table public.seances_ael (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  heure time,
  theme text,
  -- `on delete set null` ne décrit PAS tout ce qui se passe : supprimer un membre
  -- déclenche un UPDATE sur cette table, donc le déclencheur de complétude posé par la
  -- Task 8 (`before insert or update`, sans liste de colonnes). Pour une séance déjà
  -- `tenue` dont ce membre était l'enseignant et sans `enseignant_libre`, l'état
  -- résultant serait `tenue` sans enseignant : le déclencheur lève, et la SUPPRESSION
  -- DU MEMBRE ÉCHOUE. C'est voulu — la voie prévue pour retirer quelqu'un est
  -- l'archivage, jamais la suppression —, mais c'est écrit ici, dans le `comment on
  -- column` plus bas et dans le README (Task 20), parce que la déclaration seule
  -- promet l'inverse. Conséquence pratique pour toute suite de tests : SUPPRIMER LES
  -- SÉANCES AVANT LEURS MEMBRES, jamais l'inverse.
  enseignant_membre_id uuid references public.membres (id) on delete set null,
  enseignant_libre text,
  -- Aucun déclencheur ne surveille le modérateur : ici, `on delete set null` fait
  -- exactement ce qu'il dit.
  moderateur_membre_id uuid references public.membres (id) on delete set null,
  moderateur_libre text,
  etat public.etat_seance_ael not null default 'prevue',
  -- `restrict` : un calendrier n'est jamais supprimé par l'application (seulement
  -- désactivé, Task 13), mais si une suppression directe était un jour tentée, elle ne
  -- doit pas orpheliner silencieusement l'ancrage de génération de D39.
  calendrier_id uuid references public.calendriers_ael (id) on delete restrict,
  -- Ancre de la contrainte unique ci-dessous (D39). NULL pour une séance créée à la
  -- main. Fixée UNE FOIS par la génération, jamais modifiée ensuite : `date` reste
  -- seule visible et modifiable à l'écran (spec §4.5 : « c'est ainsi qu'une séance du
  -- samedi se déplace au dimanche »).
  genere_pour_le date,
  cree_par uuid references public.profils (id) on delete set null,
  cree_le timestamptz not null default now(),
  constraint seances_ael_enseignant_exclusif
    check (enseignant_membre_id is null or enseignant_libre is null),
  constraint seances_ael_moderateur_exclusif
    check (moderateur_membre_id is null or moderateur_libre is null),
  -- Deux NULL sont distincts en Postgres (comportement standard) : des séances créées
  -- à la main, sans `calendrier_id`, ne se bloquent jamais entre elles (design phase 3,
  -- §4.2).
  constraint seances_ael_generation_unique unique (calendrier_id, genere_pour_le)
);

comment on table public.seances_ael is
  'Séance AEL, générée depuis un calendrier récurrent ou créée à la main (spec §4.5, D14, D28).';
comment on column public.seances_ael.genere_pour_le is
  'Date CALCULÉE par la récurrence au moment de la génération, distincte et indépendante de `date` (D39). Ne bouge jamais : `date` seule est éditable, ce qui permet de déplacer une séance sans que le prochain geste de génération ne la recrée à sa date d''origine.';
comment on column public.seances_ael.enseignant_membre_id is
  'Enseignant de la séance, exclusif de `enseignant_libre` (D36). ATTENTION : malgré le `on delete set null`, supprimer un membre enseignant d''une séance déjà TENUE et sans `enseignant_libre` ÉCHOUE — la mise à null déclenche `seances_ael_tenue_complete` (Task 8), qui refuse une séance tenue sans enseignant. La voie prévue pour retirer quelqu''un est l''archivage, jamais la suppression ; toute suite de tests doit supprimer les séances avant leurs membres.';

create index seances_ael_date_idx on public.seances_ael (date);
create index seances_ael_etat_idx on public.seances_ael (etat);

revoke all on public.seances_ael from anon, authenticated;
grant select on public.seances_ael to authenticated;

alter table public.seances_ael enable row level security;
alter table public.seances_ael force row level security;

create policy seances_ael_lecture on public.seances_ael
  for select
  to authenticated
  using ((select prive.est_actif()));

-- Jonction séance/antenne(s) ciblée(s) (spec §4.5 : « une séance peut cibler plusieurs
-- antennes »). Peuplée par la génération (une ligne par séance, D41) ou à la main.
create table public.seances_ael_antennes (
  seance_id uuid not null references public.seances_ael (id) on delete cascade,
  antenne_id uuid not null references public.antennes (id) on delete restrict,
  primary key (seance_id, antenne_id)
);

comment on table public.seances_ael_antennes is
  'Antenne(s) ciblée(s) par une séance AEL. Base du pré-remplissage de la liste de pointage (D29, D46).';

create index seances_ael_antennes_antenne_id_idx on public.seances_ael_antennes (antenne_id);

revoke all on public.seances_ael_antennes from anon, authenticated;
grant select on public.seances_ael_antennes to authenticated;

alter table public.seances_ael_antennes enable row level security;
alter table public.seances_ael_antennes force row level security;

create policy seances_ael_antennes_lecture on public.seances_ael_antennes
  for select
  to authenticated
  using ((select prive.est_actif()));

-- Présences pointées (spec §4.5). Clé primaire composite : cible directe de l'`upsert`
-- ligne à ligne de D43 (`on conflict (seance_id, membre_id) do update`).
create table public.presences_ael (
  seance_id uuid not null references public.seances_ael (id) on delete cascade,
  membre_id uuid not null references public.membres (id) on delete cascade,
  present boolean not null,
  pointe_par uuid references public.profils (id) on delete set null,
  pointe_le timestamptz not null default now(),
  primary key (seance_id, membre_id)
);

comment on table public.presences_ael is
  'Pointage d''une présence : fait daté qui ne bouge jamais (D48). Ni l''archivage d''un membre ni un changement d''antenne ne modifient une présence enregistrée ou le compteur qui en découle.';

-- D44 : la clé primaire composite mène par `seance_id` et ne sert à rien pour un
-- regroupement par membre — sans cet index, chaque lecture du compteur (`compteurs_ael`,
-- Task 9) balaierait toute la table.
create index presences_ael_membre_id_idx on public.presences_ael (membre_id);

revoke all on public.presences_ael from anon, authenticated;
grant select on public.presences_ael to authenticated;

alter table public.presences_ael enable row level security;
alter table public.presences_ael force row level security;

create policy presences_ael_lecture on public.presences_ael
  for select
  to authenticated
  using ((select prive.est_actif()));
