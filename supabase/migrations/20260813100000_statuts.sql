-- Catalogue des statuts (spec §4.3, décision D6).
-- Les statuts sont cumulables, sauf à l'intérieur d'un groupe marqué exclusif :
-- « non-croyant » et « repenti » décrivent le même axe et s'excluent, alors qu'un
-- baptême et un service en commission se cumulent sans difficulté.

create table public.groupes_statut (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique,
  exclusif boolean not null default false,
  ordre integer not null default 0,
  cree_le timestamptz not null default now(),
  constraint groupes_statut_nom_non_vide check (length(trim(nom)) > 0)
);

comment on column public.groupes_statut.exclusif is
  'Vrai si un membre ne peut porter qu''un seul statut de ce groupe à la fois.';

create table public.statuts (
  id uuid primary key default gen_random_uuid(),
  groupe_id uuid not null references public.groupes_statut (id) on delete restrict,
  libelle text not null,
  actif boolean not null default true,
  ordre integer not null default 0,
  cree_le timestamptz not null default now(),
  constraint statuts_libelle_non_vide check (length(trim(libelle)) > 0),
  constraint statuts_libelle_unique_par_groupe unique (groupe_id, libelle)
);

comment on table public.statuts is
  'Statut attribuable à un membre. Désactivable, jamais supprimable : les attributions passées doivent rester lisibles.';

create index statuts_groupe_id_idx on public.statuts (groupe_id);

revoke all on public.groupes_statut from anon, authenticated;
revoke all on public.statuts from anon, authenticated;
grant select on public.groupes_statut to authenticated;
grant select on public.statuts to authenticated;

alter table public.groupes_statut enable row level security;
alter table public.groupes_statut force row level security;
alter table public.statuts enable row level security;
alter table public.statuts force row level security;

create policy groupes_statut_lecture on public.groupes_statut
  for select to authenticated using ((select prive.est_actif()));

create policy statuts_lecture on public.statuts
  for select to authenticated using ((select prive.est_actif()));

-- Aucune politique d'écriture : les mutations passent par des Server Actions.

-- Amorçage : les statuts nommés par la spécification (§4.3).
insert into public.groupes_statut (nom, exclusif, ordre) values
  ('Cheminement', true, 1),
  ('Engagements', false, 2);

insert into public.statuts (groupe_id, libelle, ordre)
select g.id, v.libelle, v.ordre
from public.groupes_statut g
join (values
  ('Cheminement', 'Non-croyant', 1),
  ('Cheminement', 'Repenti', 2),
  ('Engagements', 'Baptisé d''eau', 1),
  ('Engagements', 'Baptisé du Saint-Esprit', 2),
  ('Engagements', 'Sert dans une commission', 3)
) as v(groupe, libelle, ordre) on v.groupe = g.nom;
