-- Correction de commentaire issue de la revue de la Task 1 : migration additive,
-- 20260814100000 est déjà appliquée et ne se réécrit pas.
--
-- Le commentaire du déclencheur `membres_anti_cycle`, posé dans 20260814100000,
-- le présente comme « barrière de dernier recours, y compris pour une écriture
-- directe ». Vrai ligne à ligne, faux pour une écriture MULTI-LIGNES en une seule
-- instruction : un déclencheur `before ... for each row` évalue chaque ligne sans
-- voir les autres lignes que la même commande modifie. Un `upsert` de deux lignes
-- passé par la clé de service (par exemple deux membres qui échangent leur faiseur
-- de disciple dans un seul appel) franchit à la fois le verrou consultatif de
-- `public.definir_arbre` — qui ne s'applique qu'aux appels successifs de cette
-- passerelle, pas à une écriture directe multi-lignes — et le déclencheur, qui ne
-- voit toujours que l'état déjà validé table. Aucun code applicatif n'émet
-- aujourd'hui une telle écriture ; c'est une limite assumée, pas une régression
-- corrigée ici.
comment on function public.definir_arbre(uuid, uuid, uuid, boolean) is
  'Passerelle service_role vers l''écriture de l''arbre (faiseur de disciple, dirigeant). Le verrou consultatif pg_advisory_xact_lock(20260814, 1), posé en première instruction, sérialise les appels concurrents à CETTE passerelle ; le déclencheur membres_anti_cycle reste la barrière de dernier recours pour toute écriture DIRECTE, ligne par ligne. Ni l''un ni l''autre ne ferme un cycle produit par une écriture MULTI-LIGNES en une seule instruction (par exemple un upsert de plusieurs lignes qui se pointent l''une l''autre) : un déclencheur `before ... for each row` ne voit pas les autres lignes de la même commande, et le verrou ne protège que les appels successifs de cette passerelle, pas une commande unique qui modifierait plusieurs lignes à la fois. Aucun code applicatif n''émet aujourd''hui une telle écriture multi-lignes ; cette limite est assumée, pas comblée.';
