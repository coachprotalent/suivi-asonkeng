-- Nuance (mineur, constat de revue) le commentaire de
-- public.consommer_token_inscription (migration 20260815160000, déjà appliquée,
-- non modifiée — d'où cette migration additive qui réémet seulement son
-- `comment on function`, sans toucher au corps de la fonction) : le plafond de
-- tentatives n'est PAS étanche à la concurrence sous READ COMMITTED. Le
-- `select count(*)` de l'étape 2 ne voit que les lignes déjà COMMIT au moment où
-- l'instruction démarre ; des appels réellement concurrents sur la même adresse
-- pourraient donc chacun sous-compter les tentatives des autres et laisser passer
-- légèrement plus de 10 tentatives avant que le plafond ne se referme. C'est une
-- limite acceptée (protection best-effort contre la force brute, pas une garantie
-- dure), mais le commentaire précédent l'énonçait sans réserve — corrigé pour
-- écrire cette limite plutôt que de la taire.
comment on function public.consommer_token_inscription(text, inet) is
  'Consomme un token d''inscription de façon atomique (D25, D27, D31, D34, D36, design 2b §7.1) : verrou de ligne par code_hash, plafond de 10 tentatives par adresse et par fenêtre de 15 minutes (toute tentative comptée, réussie ou non). RETOURNE un statut (ok, invalide, trop_de_tentatives) pour tout refus métier PLUTÔT QUE DE LEVER : la ligne insérée dans tentatives_token_inscription à l''étape 1 doit survivre à un refus, ce qu''une exception empêcherait (Postgres n''a pas de transaction autonome à l''intérieur d''une fonction). Les exceptions restent réservées aux pannes réellement inattendues. NUANCE (migration 20260815190000) : le plafond est une protection best-effort, PAS une garantie dure sous concurrence réelle — sous READ COMMITTED, des appels vraiment concurrents sur la même adresse peuvent chacun sous-compter les tentatives des autres et laisser passer un peu plus de 10 tentatives avant que le refus ne se referme ; le verrou de ligne (D31), lui, reste strict, car il porte sur tokens_inscription, pas sur ce comptage. SECURITY DEFINER, EXECUTE réservé à service_role. Voir public.relacher_token_inscription pour le geste inverse si la création du compte échoue ensuite.';
