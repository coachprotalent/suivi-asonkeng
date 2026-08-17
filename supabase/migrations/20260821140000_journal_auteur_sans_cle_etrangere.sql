-- Phase 8, D164 — le journal des statuts cesse de dépendre de `public.profils`.
--
-- ═══ LA CONTRADICTION QUE CETTE MIGRATION LÈVE, ET COMMENT ELLE A ÉTÉ TROUVÉE ═══
--
-- Deux règles du projet, chacune juste séparément, se contredisaient depuis la phase 1b :
--
--   1. `journal_statuts.par_profil_id` est en `on delete set null` (20260813110000) —
--      supprimer un compte doit y écrire `null` ;
--   2. `journal_statuts` INTERDIT TOUTE RÉÉCRITURE — déclencheur
--      `journal_statuts_sans_reecriture` (20260813130000, `before update`), et son commentaire
--      de table annonce « aucune modification ni suppression ligne à ligne n'est possible,
--      par personne, pas même l'application ».
--
-- Or `on delete set null` EST un `update`. Les deux règles ensemble signifiaient donc :
-- **tout compte ayant écrit une seule ligne au journal était INDESTRUCTIBLE**. Personne ne
-- l'avait vu, parce que rien ne supprimait de compte avant la phase 8.
--
-- Le message rendu était « Le journal des statuts ne se réécrit pas. » (P0001), enveloppé par
-- GoTrue en « Database error deleting user » — donc parfaitement opaque côté application.
-- Mesuré sur un compte de test qui venait d'attribuer un statut, pas déduit.
--
-- ═══ POURQUOI ON RETIRE LA CLÉ ÉTRANGÈRE PLUTÔT QUE D'ASSOUPLIR LE DÉCLENCHEUR ═══
--
-- Assouplir le déclencheur — l'autoriser à mettre `par_profil_id` à `null` — percerait la
-- garantie d'inaltérabilité du journal pour la seule commodité de la suppression de compte,
-- et obligerait à réécrire son commentaire de table en « aucune modification… SAUF ».
--
-- Surtout, LE PROJET A DÉJÀ TRANCHÉ CETTE QUESTION, dans l'autre sens. La migration
-- 20260813160000 a ajouté `par_nom_affichage` en écrivant, mot pour mot : « la suppression
-- d'un compte administrateur perdrait l'auteur définitivement, pour tout le monde. Correctif
-- retenu : inscrire le nom de l'auteur dans le journal au moment de l'écriture, comme un
-- registre d'audit classique. Il devient autonome — lisible sans dépendre des permissions de
-- lecture courantes sur `profils` — et survit à la suppression du compte auteur. »
--
-- Le journal était donc DÉJÀ conçu pour survivre à `profils`. La clé étrangère était le
-- vestige qui contredisait cette décision. On la retire : `par_profil_id` devient une donnée
-- HISTORIQUE — l'identifiant de l'auteur tel qu'il était au moment de l'écriture — et non
-- plus une référence vivante. Le journal en sort PLUS complet qu'avec `on delete set null`,
-- qui effaçait cette information.
--
-- ═══ CE QUE CELA COÛTE, ÉNONCÉ ═══
-- `par_profil_id` peut désormais désigner un profil qui n'existe plus : c'est un identifiant
-- mort. Aucun code ne le JOINT à `profils` — l'affichage du journal passe par
-- `par_nom_affichage` depuis la 1b, précisément pour cette raison (`journalDuMembre`,
-- src/lib/donnees/statuts.ts). Toute jointure future devrait traiter l'absence, et ce
-- commentaire est là pour qu'on le sache avant de l'écrire.
--
-- LA GARANTIE D'INALTÉRABILITÉ N'EST PAS TOUCHÉE : le déclencheur `before update` et le
-- `revoke delete ... from service_role` restent en place, intacts. Cette migration retire une
-- contrainte de référence, pas une protection.

alter table public.journal_statuts
  drop constraint journal_statuts_par_profil_id_fkey;

comment on column public.journal_statuts.par_profil_id is
  'Identifiant du profil auteur AU MOMENT DE L''ÉCRITURE. Phase 8, D164 : la clé étrangère vers public.profils a été RETIRÉE, parce qu''elle était en on delete set null — donc un update — alors que journal_statuts interdit toute réécriture ; les deux règles ensemble rendaient indestructible tout compte ayant écrit une seule ligne. Cette colonne est désormais une donnée HISTORIQUE et non une référence vivante : elle peut désigner un profil supprimé. Aucun code ne la joint à profils — l''affichage passe par par_nom_affichage depuis la phase 1b, qui l''a ajoutée pour rendre le journal autonome. Toute jointure future doit traiter l''absence.';

comment on table public.journal_statuts is
  'Trace de chaque mouvement de statut, protégée contre la réécriture et contre la suppression directe par des déclencheurs et des privilèges retirés à service_role : aucune modification ni suppression ligne à ligne n''est possible, par personne, pas même l''application. La suppression reste possible en cascade avec le membre — seule voie d''effacement complet d''une personne, portée par les privilèges système de la contrainte et non par ceux de l''appelant. L''application, elle, archive et ne supprime jamais. Phase 8, D164 : le journal ne dépend PLUS de public.profils — la clé étrangère de par_profil_id a été retirée, l''auteur étant déjà conservé par par_nom_affichage depuis la phase 1b. Une trace ne doit pas empêcher la suppression du compte qui l''a écrite, ni perdre son auteur pour l''autoriser.';
