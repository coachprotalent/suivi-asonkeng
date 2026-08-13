-- Amendement nécessaire à membres_lecture (design 2b §5.5, spec maîtresse §5.3).

create or replace function prive.est_demandeur_de(p_membre_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.demandes_membre d
    where d.membre_id = p_membre_id
      and d.demandeur_profil_id = (select auth.uid())
  );
$$;

comment on function prive.est_demandeur_de(uuid) is
  'Vrai si le compte appelant est le demandeur d''une ligne demandes_membre référençant ce membre (design 2b §5.5). SECURITY DEFINER : lit demandes_membre en s''affranchissant de sa propre RLS, même raisonnement que prive.est_admin() — la politique de membres n''a pas encore statué au moment de cet appel, l''appelant n''a donc par construction pas encore le droit d''accéder à demandes_membre sous RLS normale à cet instant précis.';

revoke execute on function prive.est_demandeur_de(uuid) from public, anon, service_role;
grant execute on function prive.est_demandeur_de(uuid) to authenticated;

drop policy membres_lecture on public.membres;

create policy membres_lecture on public.membres
  for select
  to authenticated
  using (
    (select prive.est_actif())
    and (
      etat = 'actif'
      or (select prive.est_admin())
      or (etat = 'en_attente' and (select prive.est_demandeur_de(id)))
    )
  );
