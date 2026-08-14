-- D72 : la règle de visibilité d'une fiche membre est EXTRAITE dans une fonction, pour
-- que la vue `seminaires_assistes` (migration suivante) et la politique `membres_lecture`
-- ne puissent pas diverger. La vue contourne délibérément la RLS de `participations`
-- (D71) et contourne DU MÊME GESTE celle de `membres` : sans prédicat, un compte
-- ordinaire y lirait les couples (membre, événement) de fiches `archive` ou `en_attente`
-- qu'il n'a pas le droit de lire. Recopier l'expression dans la vue la ferait dériver en
-- silence le jour où la politique changerait.
--
-- Migration additive : `drop policy` puis `create policy` DANS UN FICHIER NEUF —
-- l'additivité du projet porte sur les FICHIERS de migration, pas sur l'immuabilité d'une
-- politique. Précédent exact : 20260815140000.
--
-- L'EXPRESSION CI-DESSOUS EST CELLE DE LA POLITIQUE DÉPLOYÉE (20260815140000), pas celle,
-- plus large, du §5.5 du design de la phase 4 : le troisième terme y est gardé par
-- `etat = ''en_attente''`, sans quoi un demandeur lirait la fiche ARCHIVÉE dont il fut un
-- jour demandeur. Extraire une règle ne doit rien élargir.
--
-- SECURITY DEFINER, et la fonction lit bien `public.membres` : elle s'exécute avec les
-- privilèges de son propriétaire, lequel possède BYPASSRLS (hypothèse du projet,
-- documentée au §5.3 de la spécification maîtresse pour prive.est_admin() et vérifiée
-- empiriquement). Sans cela, l'appel depuis la politique DE membres serait récursif.
-- `auth.uid()` continue de désigner l'APPELANT à l'intérieur : la fonction contourne la
-- RLS, pas l'identité.

create or replace function prive.peut_lire_membre(p_membre_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select prive.est_actif())
     and exists (
       select 1
       from public.membres m
       where m.id = p_membre_id
         and (
           m.etat = 'actif'
           or (select prive.est_admin())
           or (m.etat = 'en_attente' and (select prive.est_demandeur_de(m.id)))
         )
     );
$$;

comment on function prive.peut_lire_membre(uuid) is
  'Règle de visibilité d''une fiche membre (spec §5.3), extraite pour être partagée par la politique membres_lecture et par la vue seminaires_assistes (D72) : une seule définition, jamais deux. Actif pour tout compte actif ; en_attente pour l''administrateur et pour le demandeur de la fiche ; archive pour l''administrateur seul. SECURITY DEFINER : contourne la RLS (BYPASSRLS du propriétaire), jamais l''identité — auth.uid() désigne toujours l''appelant.';

revoke execute on function prive.peut_lire_membre(uuid) from public, anon, service_role;
grant execute on function prive.peut_lire_membre(uuid) to authenticated;

drop policy membres_lecture on public.membres;

-- APPEL NU, sans l'enveloppe `(select …)` employée ailleurs dans le dépôt : cette
-- enveloppe sert à faire hisser un appel SANS PARAMÈTRE en InitPlan, évalué UNE FOIS pour
-- toute la requête. Ici l'appel est CORRÉLÉ à la ligne (`id`) : il sera évalué ligne à
-- ligne quoi qu'il arrive, et l'enveloppe n'apporterait qu'une illusion d'optimisation.
create policy membres_lecture on public.membres
  for select
  to authenticated
  using (prive.peut_lire_membre(id));
