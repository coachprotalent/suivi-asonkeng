-- Refus par défaut pour toute table future du schéma public.
-- Sans ceci, une table créée en phase 1 hériterait des privilèges par défaut et
-- serait lisible par un appelant anonyme jusqu'à ce que quelqu'un pense à la
-- révoquer. La protection ne doit pas dépendre d'un réglage de plateforme.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
