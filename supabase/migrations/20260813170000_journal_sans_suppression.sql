-- Correctif issu de la revue finale de la phase 1b. Migration séparée et additive :
-- les précédentes sont déjà appliquées et ne se réécrivent pas.
--
-- README.md et le commentaire de `public.journal_statuts` (20260813130000_durcir_statuts.sql)
-- affirment que la suppression en cascade avec le membre est la seule voie d'effacement
-- du journal. C'était à moitié vrai : le déclencheur `journal_statuts_sans_reecriture`
-- ne couvre que `update`. Rien n'empêchait une suppression ligne à ligne par
-- `service_role` — le seul chemin d'écriture de l'application — ce qui contredisait la
-- garantie annoncée.
--
-- Correctif : retirer à `service_role` le droit de `delete` sur la table. La suppression
-- en cascade déclenchée par `on delete cascade` depuis `membres` reste possible : une
-- action `on delete cascade` s'exécute avec les privilèges du système (le rôle
-- propriétaire de la contrainte), pas ceux de l'appelant qui a émis le `delete` sur
-- `membres` — elle n'est donc pas soumise à ce `revoke`. Vérifié par un test manuel
-- (compte-rendu du correctif), pas seulement supposé.
revoke delete on public.journal_statuts from service_role;

comment on table public.journal_statuts is
  'Trace de chaque mouvement de statut, protégée contre la réécriture et contre la suppression directe par des déclencheurs et des privilèges retirés à service_role : aucune modification ni suppression ligne à ligne n''est possible, par personne, pas même l''application. La suppression reste possible en cascade avec le membre — seule voie d''effacement complet d''une personne, portée par les privilèges système de la contrainte et non par ceux de l''appelant. L''application, elle, archive et ne supprime jamais.';
