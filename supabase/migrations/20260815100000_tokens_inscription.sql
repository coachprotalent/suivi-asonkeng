-- Tokens d'inscription (spec maîtresse §4.6, design 2b §5.1). D8 : deux modes,
-- nominatif et générique. D25/D27 : code long haché, jamais stocké en clair ; la
-- consommation atomique est ajoutée dans une migration séparée
-- (20260815150000_consommation_token_inscription.sql) une fois la table en place.

create type public.mode_token as enum ('nominatif', 'generique');

create table public.tokens_inscription (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  mode public.mode_token not null,
  membre_id uuid references public.membres (id) on delete cascade,
  cree_par uuid references public.profils (id) on delete set null,
  cree_le timestamptz not null default now(),
  expire_le timestamptz not null,
  -- D33 : distinct d'expire_le, absent du §4.6. Un token dont revoque_le est
  -- renseigné est traité, à la consommation, exactement comme un token expiré —
  -- même branche, même message (design 2b §5.1, §6). Sert à l'administrateur pour
  -- distinguer, dans SA PROPRE liste, un token qu'il a coupé d'un token simplement
  -- arrivé à échéance.
  revoque_le timestamptz,
  -- Posé par consommer_token_inscription, AVANT même que le compte existe (D27).
  utilise_le timestamptz,
  -- Posé SÉPARÉMENT, une fois le compte créé (design 2b §7.1) : au moment où
  -- utilise_le est posé, aucun profil n'existe encore pour porter cette valeur.
  utilise_par_profil_id uuid references public.profils (id) on delete set null,
  constraint tokens_inscription_membre_selon_mode check (
    (mode = 'nominatif' and membre_id is not null) or
    (mode = 'generique' and membre_id is null)
  )
);

comment on table public.tokens_inscription is
  'Tokens d''inscription (D8, design 2b §5.1). Le code en clair n''est JAMAIS stocké : seul son hachage (code_hash) l''est. Un token nominatif référence une fiche existante ; un token générique laisse l''inscrit la créer.';
comment on column public.tokens_inscription.revoque_le is
  'D33 : distinct d''expire_le. Un token dont revoque_le est renseigné est traité, à la consommation, exactement comme un token expiré — même branche, même statut invalide (consommer_token_inscription, migration 20260815150000).';

create index tokens_inscription_membre_id_idx on public.tokens_inscription (membre_id);
create index tokens_inscription_cree_par_idx on public.tokens_inscription (cree_par);

revoke all on public.tokens_inscription from anon, authenticated;
grant select on public.tokens_inscription to authenticated;

alter table public.tokens_inscription enable row level security;
alter table public.tokens_inscription force row level security;

-- Lecture : administrateur seul (design 2b §5.5). Aucune politique d'écriture :
-- génération, révocation et consommation passent toutes par service_role, la
-- consommation via une fonction SECURITY DEFINER dédiée (Task 8).
create policy tokens_inscription_lecture on public.tokens_inscription
  for select
  to authenticated
  using ((select prive.est_admin()));
