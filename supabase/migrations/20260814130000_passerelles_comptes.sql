-- Rôles et activation des comptes, avec la protection du dernier administrateur
-- (spec §7). Voir l'en-tête de 20260814100000 pour le raisonnement sur le verrou.

create or replace function prive.compter_administrateurs_actifs(p_hors uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int
  from public.roles_profil r
  join public.profils p on p.id = r.profil_id
  where r.role = 'administrateur'
    and p.actif
    and (p_hors is null or p.id <> p_hors);
$$;

comment on function prive.compter_administrateurs_actifs(uuid) is
  'Nombre d''administrateurs actifs, hors le profil passé en argument. Sert à refuser la rétrogradation ou la désactivation du dernier (spec §7).';

revoke execute on function prive.compter_administrateurs_actifs(uuid) from public, anon, authenticated;

create or replace function public.definir_roles(
  p_profil uuid,
  p_administrateur boolean,
  p_moderateur boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- PREMIÈRE instruction. Clé (20260814, 2) = rôles et activation des comptes.
  perform pg_advisory_xact_lock(20260814, 2);

  perform 1 from public.profils p where p.id = p_profil for update;
  if not found then
    raise exception 'Compte inconnu.' using detail = 'compte_inconnu';
  end if;

  -- La condition porte sur l'état COURANT du profil visé : retirer un rôle qu'il n'a
  -- pas ne doit rien refuser. Sans cette clause `exists`, un compte ordinaire deviendrait
  -- impossible à modifier dès qu'il ne reste qu'un seul administrateur.
  if not p_administrateur
     and exists (
       select 1 from public.roles_profil r
       where r.profil_id = p_profil and r.role = 'administrateur'
     )
     and prive.compter_administrateurs_actifs(p_profil) = 0
  then
    raise exception 'Il doit rester au moins un administrateur actif.'
      using detail = 'dernier_administrateur';
  end if;

  delete from public.roles_profil where profil_id = p_profil;
  if p_administrateur then
    insert into public.roles_profil (profil_id, role) values (p_profil, 'administrateur');
  end if;
  if p_moderateur then
    insert into public.roles_profil (profil_id, role) values (p_profil, 'moderateur');
  end if;
end;
$$;

create or replace function public.definir_actif_compte(p_profil uuid, p_actif boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(20260814, 2);

  perform 1 from public.profils p where p.id = p_profil for update;
  if not found then
    raise exception 'Compte inconnu.' using detail = 'compte_inconnu';
  end if;

  if not p_actif
     and exists (
       select 1 from public.roles_profil r
       where r.profil_id = p_profil and r.role = 'administrateur'
     )
     and prive.compter_administrateurs_actifs(p_profil) = 0
  then
    raise exception 'Il doit rester au moins un administrateur actif.'
      using detail = 'dernier_administrateur';
  end if;

  update public.profils set actif = p_actif where id = p_profil;
end;
$$;

revoke execute on function public.definir_roles(uuid, boolean, boolean) from public, anon, authenticated;
revoke execute on function public.definir_actif_compte(uuid, boolean) from public, anon, authenticated;
grant execute on function public.definir_roles(uuid, boolean, boolean) to service_role;
grant execute on function public.definir_actif_compte(uuid, boolean) to service_role;
