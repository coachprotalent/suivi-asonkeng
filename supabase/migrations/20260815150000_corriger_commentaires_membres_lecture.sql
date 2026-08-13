-- Corrige deux légendes devenues fausses ou trompeuses après l'amendement de
-- membres_lecture (Task 5, design 2b §5.5). Migration additive : ni
-- 20260812120000_membres.sql ni 20260815140000_membres_lecture_demandeur.sql ne
-- sont modifiés — on réémet seulement les `comment on` correspondants, en base.

-- 1) Le commentaire posé sur prive.est_demandeur_de affirmait que l'appelant
-- n'avait « par construction pas encore le droit d'accéder à demandes_membre sous
-- RLS normale » à l'instant de l'appel. C'est faux : demandes_membre_lecture
-- (20260815110000, lignes 43-49) autorise déjà demandeur_profil_id = auth.uid().
-- SECURITY DEFINER reste le bon choix, mais pour découpler membres_lecture du sort
-- futur de la RLS de demandes_membre, pas pour contourner un refus déjà présent.
comment on function prive.est_demandeur_de(uuid) is
  'Vrai si le compte appelant est le demandeur d''une ligne demandes_membre référençant ce membre (design 2b §5.5). SECURITY DEFINER : non pas pour contourner un refus — demandes_membre_lecture autorise déjà l''appelant à lire ses propres lignes (demandeur_profil_id = auth.uid()) — mais pour découpler membres_lecture du sort futur de la RLS de demandes_membre, même raisonnement de principe que prive.est_admin().';

-- 2) La légende de la politique membres_lecture, dans 20260812120000_membres.sql
-- (lignes 63-64, commentaire de fichier, donc jamais persisté en base), disait
-- « les fiches en attente et archivées restent réservées à l'administrateur » —
-- vrai à l'époque, faux depuis cette Task 5 pour la fiche en_attente que son
-- propre demandeur a soumise. On pose ici, en base, la légende exacte.
comment on policy membres_lecture on public.membres is
  'Lecture (design 2b §5.5) : annuaire actif ouvert à tout compte actif (spec D2). Une fiche en_attente est visible de l''administrateur et de son seul demandeur (prive.est_demandeur_de). Les fiches archivées, ainsi que les fiches en_attente pour tout compte qui n''en est pas le demandeur, restent réservées à l''administrateur.';
