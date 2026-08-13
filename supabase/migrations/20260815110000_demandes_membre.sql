-- Demandes de suivi et d'auto-inscription (spec maîtresse §4.6, design 2b §5.2).
-- D26 : pas de fusion générale de fiches, à la validation le compte est rattaché à
-- une fiche existante et la fiche en_attente est supprimée. D32 : colonne origine,
-- absente du §4.6, nécessaire parce que la validation ne fait pas la même chose
-- selon le parcours (design 2b §7.3). D40/D42 : état annulee, geste du demandeur
-- lui-même, sans motif.

create type public.origine_demande as enum ('auto_inscription', 'demande_suivi');
create type public.etat_demande as enum ('en_attente', 'validee', 'rejetee', 'annulee');

create table public.demandes_membre (
  id uuid primary key default gen_random_uuid(),
  origine public.origine_demande not null,
  demandeur_profil_id uuid not null references public.profils (id) on delete cascade,
  -- D42 : on delete SET NULL, pas cascade — quand une annulation supprime la fiche
  -- en_attente, la demande doit SURVIVRE, à l'état annulee, sans fiche.
  membre_id uuid references public.membres (id) on delete set null,
  etat public.etat_demande not null default 'en_attente',
  motif_rejet text,
  traite_par uuid references public.profils (id) on delete set null,
  traite_le timestamptz,
  cree_le timestamptz not null default now(),
  constraint demandes_membre_motif_reserve_rejet
    check (motif_rejet is null or etat = 'rejetee')
);

comment on table public.demandes_membre is
  'Demande de suivi ou d''auto-inscription (design 2b §5.2). origine distingue les deux parcours (D32) : la validation ne fait pas la même chose selon l''un ou l''autre (design 2b §7.3). membre_id devient NULL quand une annulation (D42) supprime la fiche en_attente ; la demande, elle, survit à l''état annulee.';

create index demandes_membre_demandeur_idx on public.demandes_membre (demandeur_profil_id);
create index demandes_membre_membre_id_idx on public.demandes_membre (membre_id);
create index demandes_membre_etat_idx on public.demandes_membre (etat);

revoke all on public.demandes_membre from anon, authenticated;
grant select on public.demandes_membre to authenticated;

alter table public.demandes_membre enable row level security;
alter table public.demandes_membre force row level security;

-- Lecture (design 2b §5.5) : administrateur, ou le demandeur pour SES PROPRES
-- lignes. Aucune politique d'écriture : création, annulation, validation et rejet
-- passent tous par service_role ou par des fonctions SECURITY DEFINER (Tasks 9, 10).
create policy demandes_membre_lecture on public.demandes_membre
  for select
  to authenticated
  using (
    (select prive.est_actif())
    and (demandeur_profil_id = (select auth.uid()) or (select prive.est_admin()))
  );
