-- Primitive de sécurité lue par les politiques de la phase 4 (D80).
-- Contrepartie SQL du garde applicatif `exigerModerateurOuAdministrateur` (D42, phase 3),
-- livré sans elle parce qu'aucune POLITIQUE n'avait alors besoin de la question : toutes
-- les tables AEL sont ouvertes à tout compte actif. `participations` et
-- `participants_externes` sont les PREMIÈRES tables du projet dont la LECTURE dépend d'un
-- rôle autre qu'administrateur (spec §5.3, amendée par D23) : la primitive manquait.
--
-- Régime des primitives LUES PAR LES POLITIQUES, distinct de celui des passerelles
-- métier : les expressions de politique s'évaluent avec les privilèges du rôle appelant,
-- donc `authenticated` doit pouvoir l'exécuter, et `service_role` n'en a aucun besoin.

create or replace function prive.est_moderateur_ou_admin()
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
      and rp.role in ('administrateur', 'moderateur')
      and p.actif
  );
$$;

comment on function prive.est_moderateur_ou_admin() is
  'Vrai si le compte appelant est actif ET porte le rôle administrateur OU moderateur (D80, spec §5.3 amendée par D23). SECURITY DEFINER pour la même raison que prive.est_admin() : elle lit roles_profil et profils en s''affranchissant de leur propre RLS. Le test p.actif n''est PAS redondant avec prive.est_actif() employé à côté dans les politiques : cette fonction doit rester vraie de bout en bout par elle-même, sans dépendre de ce qu''un appelant pense avoir déjà vérifié.';

revoke execute on function prive.est_moderateur_ou_admin() from public, anon, service_role;
grant execute on function prive.est_moderateur_ou_admin() to authenticated;
