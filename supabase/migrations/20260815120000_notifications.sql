-- Notifications in-app (spec maîtresse §4.6, design 2b §5.3). D41 : marquées lues
-- automatiquement quand leur objet est traité, jamais supprimées.

create type public.type_notification as enum (
  'nouvelle_demande', 'demande_validee', 'demande_rejetee'
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  profil_id uuid not null references public.profils (id) on delete cascade,
  type public.type_notification not null,
  titre text not null,
  corps text not null,
  lien text,
  lu_le timestamptz,
  cree_le timestamptz not null default now()
);

comment on table public.notifications is
  'File de notifications in-app (design 2b §5.3). type est extensible par migration additive aux phases suivantes. nouvelle_demande est diffusée à TOUS les administrateurs actifs, jamais à un seul (design 2b §7.3).';

create index notifications_profil_id_idx on public.notifications (profil_id);
create index notifications_profil_non_lues_idx on public.notifications (profil_id) where lu_le is null;

revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;

alter table public.notifications enable row level security;
alter table public.notifications force row level security;

-- Lecture (design 2b §5.5) : SES PROPRES notifications uniquement, jamais celles
-- d'autrui — même pour un administrateur. Ce sont des notifications personnelles,
-- pas un journal d'équipe.
create policy notifications_lecture on public.notifications
  for select
  to authenticated
  using (profil_id = (select auth.uid()));
