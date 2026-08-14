-- Catalogue des types d'événement (spec §4.4, D13). Colonnes du §4.4 (id, libelle,
-- actif), plus `ordre` (même rôle que sur `statuts` : l'ordre d'affichage d'un référentiel
-- est une donnée, pas un tri alphabétique subi) et `cree_le` (convention du dépôt).

create table public.types_evenement (
  id uuid primary key default gen_random_uuid(),
  libelle text not null,
  actif boolean not null default true,
  ordre integer not null default 0,
  cree_le timestamptz not null default now(),
  constraint types_evenement_libelle_non_vide check (length(trim(libelle)) > 0),
  -- Clé naturelle, ET ancre de l'idempotence de l'amorçage ci-dessous (D57). Unicité
  -- SIMPLE : `libelle` est NOT NULL, `nulls not distinct` n'aurait donc aucun sens ici.
  constraint types_evenement_libelle_unique unique (libelle)
);

comment on table public.types_evenement is
  'Type d''événement attribuable (spec §4.4). Désactivable, JAMAIS supprimable : les événements passés doivent rester lisibles avec leur type — même régime que public.statuts, d''où le on delete restrict porté par evenements.type_id.';
comment on constraint types_evenement_libelle_unique on public.types_evenement is
  'Clé naturelle du catalogue, et ancre du `on conflict (libelle) do nothing` de l''amorçage (D57).';

create index types_evenement_actif_idx on public.types_evenement (actif, ordre);

revoke all on public.types_evenement from anon, authenticated;
grant select on public.types_evenement to authenticated;

alter table public.types_evenement enable row level security;
alter table public.types_evenement force row level security;

-- Tout compte actif (spec §5.3, ligne « antennes, statuts, groupes_statut,
-- types_evenement »). Aucune politique d'écriture : la gestion du catalogue passe par une
-- Server Action réservée à l'administrateur (spec §5.2, ligne « Créer statuts, groupes,
-- antennes, types d'événement »).
create policy types_evenement_lecture on public.types_evenement
  for select
  to authenticated
  using ((select prive.est_actif()));

-- AMORÇAGE IDEMPOTENT (D57). `on conflict (libelle) do nothing` s'appuie sur la contrainte
-- ci-dessus. Rejouer cette migration — ou la rejouer sur une base où un administrateur
-- aurait déjà créé « Webinaire » à la main — ne crée AUCUN doublon et ne lève AUCUNE
-- erreur. Le dépôt porte un commit qui signale que l'amorçage du catalogue des statuts
-- n'a PAS cette propriété : dette connue, documentée, et qu'on ne reproduit pas ici.
insert into public.types_evenement (libelle, ordre) values
  ('Webinaire', 1),
  ('Séminaire académique', 2),
  ('Pic-nic', 3),
  ('Retraite spirituelle', 4)
on conflict (libelle) do nothing;
