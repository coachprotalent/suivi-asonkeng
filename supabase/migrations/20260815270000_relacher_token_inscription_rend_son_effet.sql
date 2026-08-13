-- Corrige l'INTERSECTION de deux corrections justes prises séparément (constat I1
-- de la revue finale de branche). Migration ADDITIVE : ni 20260815160000 ni
-- 20260815180000 ne sont modifiées.
--
-- LE DÉFAUT, ET IL NAÎT DE LA RENCONTRE DE DEUX REMÈDES CORRECTS :
--
--  1. 20260815180000 a ajouté la garde `and utilise_par_profil_id is null`, pour
--     interdire de DÉ-CONSOMMER un token déjà rattaché à un compte réel. Juste.
--  2. La ronde de correction de la Task 14 a écrit `compenserInscription`
--     (src/app/inscription/actions.ts) : quand une écriture échoue APRÈS la
--     création du compte, elle supprime la fiche, supprime le compte, PUIS relâche
--     le token. Juste aussi.
--
-- Mais au moment où la compensation appelle la relâche, `utilise_par_profil_id`
-- vient précisément d'être POSÉE (actions.ts, marquage qui suit la création du
-- compte). La garde bloque donc l'UPDATE. La relâche ne fonctionnait que par EFFET
-- DE BORD de la cascade `auth.users -> profils -> tokens_inscription.
-- utilise_par_profil_id (on delete set null)`, c'est-à-dire UNIQUEMENT si le
-- `deleteUser` de l'étape 2 avait réussi.
--
-- Or l'échec silencieux de `admin.auth.admin.deleteUser` est une limitation
-- CONNUE ET DOCUMENTÉE de ce projet (README, « Attention »). Quand il se produit :
-- l'UPDATE ne touche aucune ligne, la fonction `returns void` ne rend rien,
-- l'appelant ne reçoit AUCUNE erreur — et le token est perdu à jamais pour la
-- personne à qui il était destiné, en silence.
--
-- LES DEUX MOITIÉS DU CORRECTIF :
--
--  A. LA FONCTION REND SON EFFET (`returns boolean`). Une relâche qui ne touche
--     aucune ligne cesse d'être muette : l'appelant peut la journaliser. C'est la
--     moitié qui vaut au-delà du cas d'usage d'aujourd'hui — tout futur appelant
--     saura ce qui s'est réellement passé.
--
--  B. LA GARDE DEVIENT DISCRIMINANTE au lieu d'être absolue :
--         utilise_par_profil_id is null
--      or (p_profil_id is not null and utilise_par_profil_id = p_profil_id)
--     Elle continue d'interdire de dé-consommer le token d'un AUTRE compte — ce
--     que visait 20260815180000, et qui reste vrai — tout en autorisant la relâche
--     du compte que l'appelant est précisément en train de compenser, et qu'il
--     doit nommer.
--
-- POURQUOI `p_profil_id` N'A PAS DE VALEUR PAR DÉFAUT, alors qu'un défaut à NULL
-- aurait épargné trois sites d'appel : un défaut rendrait l'omission SILENCIEUSE
-- et strictement équivalente à l'ancien comportement — donc un futur appelant qui
-- compense un compte et oublie ce paramètre reproduirait EXACTEMENT le défaut
-- corrigé ici, sans un bruit. Sans défaut, l'omission est un échec franc
-- (PGRST202 : aucune fonction de ce nom pour ces arguments). Le paramètre reste
-- nullable, et `null` veut dire « aucun compte à excuser », c'est-à-dire
-- exactement la garde stricte de 20260815180000 : les trois appels antérieurs à
-- toute création de compte passent `null` explicitement.
--
-- POURQUOI UN `drop` ICI, ALORS QUE LE PROJET S'INTERDIT DE DÉFAIRE : Postgres ne
-- sait changer NI le type de retour NI la signature d'une fonction par
-- `create or replace` — une signature différente créerait une SURCHARGE, laissant
-- vivante l'ancienne version `returns void` à un `revoke`/`grant` près, et
-- PostgREST pourrait y router un appel à un argument près. Laisser survivre la
-- version muette qu'on corrige serait le pire des deux mondes. Aucun objet de la
-- base ne dépend de cette fonction (aucune vue, aucun déclencheur, aucune autre
-- fonction ne l'appelle) : elle n'est invoquée que par RPC depuis l'application,
-- dont les quatre sites d'appel sont mis à jour dans le même commit.

drop function if exists public.relacher_token_inscription(uuid);

create or replace function public.relacher_token_inscription(
  p_token_id uuid,
  p_profil_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lignes integer;
begin
  update public.tokens_inscription
     set utilise_le = null,
         utilise_par_profil_id = null
   where id = p_token_id
     and (
       utilise_par_profil_id is null
       or (p_profil_id is not null and utilise_par_profil_id = p_profil_id)
     );

  get diagnostics v_lignes = row_count;
  return v_lignes > 0;
end;
$$;

comment on function public.relacher_token_inscription(uuid, uuid) is
  'Relâche un token consommé par consommer_token_inscription dont l''inscription a ensuite échoué (D27, design 2b §7.1) : remet utilise_le et utilise_par_profil_id à NULL. REND UN BOOLÉEN (migration 20260815270000) : true si une ligne a été relâchée, false si aucune — une relâche sans effet n''est plus silencieuse, l''appelant doit la journaliser. GARDE DISCRIMINANTE (même migration) : l''UPDATE ne mord que si utilise_par_profil_id est NULL (compte jamais créé) OU s''il vaut p_profil_id (le compte que l''appelant est en train de compenser). Dé-consommer le token d''un AUTRE compte reste impossible, ce qui était l''objet de la garde absolue de 20260815180000 ; celle-ci empêchait en revanche la compensation légitime de la Task 14 dès que la suppression du compte échouait, laissant le token perdu sans trace. p_profil_id n''a délibérément PAS de valeur par défaut : l''oublier doit échouer franchement (PGRST202), jamais retomber en silence sur l''ancien comportement. Passer NULL signifie « aucun compte à excuser » et redonne la garde stricte. SECURITY DEFINER, EXECUTE réservé à service_role.';

revoke execute on function public.relacher_token_inscription(uuid, uuid) from public, anon, authenticated;
grant execute on function public.relacher_token_inscription(uuid, uuid) to service_role;
