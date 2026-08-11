-- Primitive de sécurité réutilisable par toutes les politiques de la phase 1.
-- La phase 0 vérifiait « compte actif » à un seul endroit, dans une fonction TypeScript.
-- Chaque politique devait s'en souvenir seule. Cette fonction en fait une brique nommée.

create or replace function prive.est_actif()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profils p
    where p.id = (select auth.uid())
      and p.actif
  );
$$;

comment on function prive.est_actif() is
  'Vrai si le compte appelant possède une fiche profil active. À employer dans toute politique de lecture ouverte « à tout compte actif » (spec §5.3).';

-- Les expressions de politique s'évaluent avec les privilèges du rôle appelant :
-- `authenticated` doit donc pouvoir exécuter la fonction.
revoke execute on function prive.est_actif() from public, anon, service_role;
grant execute on function prive.est_actif() to authenticated;
