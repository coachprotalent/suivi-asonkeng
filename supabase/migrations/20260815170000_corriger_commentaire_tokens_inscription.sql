-- Corrige une référence de migration erronée dans le commentaire posé par
-- 20260815100000_tokens_inscription.sql sur tokens_inscription.revoque_le. Ce
-- commentaire annonçait que consommer_token_inscription serait livrée dans la
-- migration 20260815150000 ; ce numéro a finalement été pris par une migration
-- correctrice sans rapport (20260815150000_corriger_commentaires_membres_lecture.sql),
-- et consommer_token_inscription a en réalité été livrée dans
-- 20260815160000_consommation_token_inscription.sql.
--
-- La migration d'origine est déjà appliquée et ne doit jamais être modifiée
-- (contrainte globale du projet). Le commentaire posé en base, lui, PEUT être
-- réémis : `comment on column` remplace la valeur précédente, sans DDL structurel.
comment on column public.tokens_inscription.revoque_le is
  'D33 : distinct d''expire_le. Un token dont revoque_le est renseigné est traité, à la consommation, exactement comme un token expiré — même branche, même statut invalide (consommer_token_inscription, migration 20260815160000).';
