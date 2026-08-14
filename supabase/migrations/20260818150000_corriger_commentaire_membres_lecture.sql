-- Ronde de correction pré-Task 7 (I2) : 20260818110000_peut_lire_membre.sql a fait
-- `drop policy membres_lecture` puis `create policy` SANS réémettre le `comment on
-- policy` que 20260815150000_corriger_commentaires_membres_lecture.sql avait posé en
-- base pour cette politique exacte — cette migration corrective entière n'existait que
-- pour ça. `drop policy` emporte son commentaire avec elle : en production, depuis
-- 20260818110000, `membres_lecture` n'a plus de légende du tout (vérifié :
-- `pg_policy`/`pg_description` rendait NULL avant cette migration).
--
-- Migration additive, précédent exact 20260815150000 : ni 20260815140000 ni
-- 20260818110000 ne sont modifiées, on réémet seulement le `comment on policy`
-- correspondant à la politique RÉELLEMENT déployée aujourd'hui — celle qui délègue à
-- prive.peut_lire_membre (D72), pas celle, antérieure, que 20260815150000 décrivait
-- (son `using` inline sur trois branches). Le texte ci-dessous décrit ce que le code
-- fait MAINTENANT, pas ce qu'il faisait avant la Task 2.
comment on policy membres_lecture on public.membres is
  'Lecture (spec §5.3, D72) : annuaire actif ouvert à tout compte actif. Une fiche en_attente est visible de l''administrateur et de son seul demandeur. Les fiches archivées, ainsi que les fiches en_attente pour tout compte qui n''en est pas le demandeur, restent réservées à l''administrateur. La règle est déléguée à prive.peut_lire_membre(id), seule définition partagée avec la vue seminaires_assistes (Task 8) : ne jamais la reformuler ici sans la faire évoluer là-bas du même geste.';
