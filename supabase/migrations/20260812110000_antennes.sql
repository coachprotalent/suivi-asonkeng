-- Antennes : regroupement géographique des membres (spec D3).

create table public.antennes (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique,
  pays text not null,
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  constraint antennes_nom_non_vide check (length(trim(nom)) > 0),
  constraint antennes_pays_non_vide check (length(trim(pays)) > 0)
);

comment on table public.antennes is
  'Regroupement géographique des membres. Sert à pré-remplir les listes de présence des AEL.';

revoke all on public.antennes from anon, authenticated;
grant select on public.antennes to authenticated;

alter table public.antennes enable row level security;
alter table public.antennes force row level security;

-- Lecture ouverte à tout compte actif (spec D2). Aucune politique d'écriture.
create policy antennes_lecture on public.antennes
  for select
  to authenticated
  using ((select prive.est_actif()));

insert into public.antennes (nom, pays) values
  ('Cameroun', 'Cameroun'),
  ('Batouri', 'Cameroun'),
  ('France', 'France');
