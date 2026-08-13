-- Corrige un défaut de public.relacher_token_inscription, livrée par
-- 20260815160000_consommation_token_inscription.sql (déjà appliquée, jamais
-- modifiée — d'où cette migration additive qui la redéfinit par
-- `create or replace`).
--
-- LE DÉFAUT (constat de revue) : l'UPDATE de la version d'origine remettait
-- utilise_par_profil_id (et utilise_le) à NULL SANS AUCUNE CONDITION sur l'état
-- du token. Son propre commentaire promettait pourtant de ne viser que « les
-- tokens dont la création du compte a ensuite échoué » — c'est-à-dire les tokens
-- consommés par consommer_token_inscription (Task 8) mais dont
-- utilise_par_profil_id N'A JAMAIS ÉTÉ POSÉ, faute de compte créé (D27 : ce champ
-- n'est posé qu'une fois le compte créé, séparément — voir Task 14). Sur un token
-- déjà rattaché à un compte RÉEL (utilise_par_profil_id déjà renseigné), la
-- version d'origine le dé-consommait quand même : le token redevenait utilisable
-- alors qu'il avait servi, ce qu'aucun appelant légitime ne demande jamais.
--
-- LE CORRECTIF : `and utilise_par_profil_id is null` restreint l'UPDATE à
-- exactement la fenêtre de compensation que le commentaire décrit — un token
-- consommé (utilise_le renseigné) mais dont le compte n'a jamais été créé
-- (utilise_par_profil_id encore NULL). Sur un token déjà rattaché à un profil,
-- l'UPDATE ne touche plus aucune ligne : silencieusement sans effet, comme il se
-- doit pour un appel hors de son cas d'usage prévu (aucun appelant légitime ne
-- devrait jamais l'invoquer sur un tel token, mais la fonction ne doit pas
-- pouvoir être détournée pour le faire).

create or replace function public.relacher_token_inscription(p_token_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.tokens_inscription
     set utilise_le = null,
         utilise_par_profil_id = null
   where id = p_token_id
     and utilise_par_profil_id is null;
end;
$$;

comment on function public.relacher_token_inscription(uuid) is
  'Relâche un token consommé par consommer_token_inscription dont la création du compte a ensuite échoué (D27, design 2b §7.1) : remet utilise_le et utilise_par_profil_id à NULL. GARDE (migration 20260815180000) : `and utilise_par_profil_id is null` — restreint l''effet aux tokens dont le compte n''a JAMAIS été créé. Sans cette garde, un appel sur un token déjà rattaché à un profil réel le dé-consommerait à tort, le rendant de nouveau utilisable après usage. Sur un token déjà rattaché, cet appel ne touche donc plus aucune ligne. SECURITY DEFINER, EXECUTE réservé à service_role.';

revoke execute on function public.relacher_token_inscription(uuid) from public, anon, authenticated;
grant execute on function public.relacher_token_inscription(uuid) to service_role;
