-- Plafond de tentatives de consommation d'un token d'inscription (D25, D34, D36).
-- Design 2b §5.4 : table conçue par cette phase, absente du §4.6 de la spécification
-- maîtresse. Une ligne par appel à consommer_token_inscription, réussi ou non (D34) :
-- compter uniformément ferme le canal par lequel le compteur trahirait l'issue d'une
-- tentative passée (design 2b §3, D34).

create table public.tentatives_token_inscription (
  id uuid primary key default gen_random_uuid(),
  adresse inet not null,
  tente_le timestamptz not null default now()
);

comment on table public.tentatives_token_inscription is
  'Une ligne par tentative de consommation d''un token d''inscription, réussie ou non (D34). Sert exclusivement à consommer_token_inscription (SECURITY DEFINER) : aucune politique de lecture n''est accordée, pas même à l''administrateur (design 2b §5.5). Aucune purge automatique (design 2b §5.4, §13) : croissance non bornée, assumée.';

create index tentatives_token_inscription_adresse_le_idx
  on public.tentatives_token_inscription (adresse, tente_le);

revoke all on public.tentatives_token_inscription from anon, authenticated;

alter table public.tentatives_token_inscription enable row level security;
alter table public.tentatives_token_inscription force row level security;

-- AUCUNE politique n'est créée, y compris pour l'administrateur (design 2b §5.5) :
-- avec force row level security et zéro politique, tout SELECT via PostgREST rend
-- un refus, quel que soit le rôle authentifié. Seule consommer_token_inscription
-- (Task 8), SECURITY DEFINER et propriétaire dérogeant à la RLS, y lit et y écrit.
