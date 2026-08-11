-- RLS du socle. Principe (spec §5.3) : lecture ciblée, aucune écriture au rôle client.

-- Retirer les privilèges par défaut avant d'accorder le strict nécessaire.
revoke all on public.profils from anon, authenticated;
revoke all on public.roles_profil from anon, authenticated;

grant select on public.profils to authenticated;
grant select on public.roles_profil to authenticated;

alter table public.profils enable row level security;
alter table public.profils force row level security;
alter table public.roles_profil enable row level security;
alter table public.roles_profil force row level security;

-- Fonction d'aide : évite qu'une politique sur profils interroge profils (récursion).
-- SECURITY DEFINER, search_path vide, et vérification de l'appelant à l'intérieur.
create or replace function prive.est_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.roles_profil rp
    join public.profils p on p.id = rp.profil_id
    where rp.profil_id = (select auth.uid())
      and rp.role = 'administrateur'
      and p.actif
  );
$$;

-- Seul `authenticated` peut l'appeler : les expressions de politique sont évaluées
-- avec les privilèges du rôle appelant, il lui faut donc EXECUTE.
revoke execute on function prive.est_admin() from public, anon, service_role;
grant execute on function prive.est_admin() to authenticated;
grant usage on schema prive to authenticated;

-- Lecture : son propre profil, ou tous les profils si administrateur.
create policy profils_lecture on public.profils
  for select
  to authenticated
  using (id = (select auth.uid()) or (select prive.est_admin()));

create policy roles_profil_lecture on public.roles_profil
  for select
  to authenticated
  using (profil_id = (select auth.uid()) or (select prive.est_admin()));

-- Aucune politique INSERT, UPDATE ou DELETE n'est créée : RLS refuse par défaut.
-- Toutes les écritures passent par des Server Actions avec la clé de service.
