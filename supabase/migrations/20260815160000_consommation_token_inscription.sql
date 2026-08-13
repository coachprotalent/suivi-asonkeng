-- Consommation atomique d'un token d'inscription (D25, D27, D31, D34, D36, design
-- 2b §7.1). Voir l'en-tête de la Task 8 du plan pour le détail de chaque exigence
-- ET pour la raison pour laquelle cette fonction REND UN STATUT au lieu de LEVER
-- pour un refus métier : Postgres n'a pas de transaction autonome à l'intérieur
-- d'une fonction, donc une exception aurait annulé l'insertion de la tentative
-- elle-même, rendant le plafond de D34/D36 inopérant contre tout échec.

create type public.statut_consommation_token as enum ('ok', 'invalide', 'trop_de_tentatives');

create or replace function public.consommer_token_inscription(
  p_code_hash text,
  p_adresse inet
)
returns table (
  statut public.statut_consommation_token,
  token_id uuid,
  mode public.mode_token,
  membre_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tentatives integer;
  v_token record;
begin
  -- 1. AVANT tout autre test (D34) : même une tentative sur un code totalement
  --    inconnu compte. CETTE LIGNE DOIT SURVIVRE À TOUT REFUS QUI SUIT : aucune
  --    branche plus bas ne doit plus jamais lever pour un refus métier, sous
  --    peine d'annuler cette insertion avec le reste de la transaction — voir
  --    l'en-tête de ce fichier.
  insert into public.tentatives_token_inscription (adresse) values (p_adresse);

  -- 2. Plafond (D34, D36) : 10 tentatives par adresse, fenêtre glissante de
  --    15 minutes, tentative EN COURS comprise (elle vient d'être insérée ci-dessus).
  --    RETOURNE un statut plutôt que de LEVER : l'insertion ci-dessus doit être
  --    validée même sur ce refus.
  select count(*) into v_tentatives
  from public.tentatives_token_inscription t
  where t.adresse = p_adresse
    and t.tente_le > now() - interval '15 minutes';

  if v_tentatives > 10 then
    return query select 'trop_de_tentatives'::public.statut_consommation_token, null::uuid, null::public.mode_token, null::uuid;
    return;
  end if;

  -- 3. Verrou DE LIGNE (D31), par code_hash — pas le verrou consultatif global de
  --    definir_arbre / definir_roles : l'invariant protégé ici (« ce code précis
  --    n'est consommé qu'une fois ») porte sur UNE ligne, pas sur l'état de toute
  --    la table. Deux inscriptions sur deux codes différents ne s'attendent donc
  --    jamais l'une l'autre.
  select t.id, t.mode, t.membre_id, t.expire_le, t.revoque_le, t.utilise_le
    into v_token
  from public.tokens_inscription t
  where t.code_hash = p_code_hash
  for update;

  -- 4. Quatre causes, UNE seule branche, UN seul statut (D30, design 2b §6) :
  --    code inconnu, expiré, révoqué, ou déjà utilisé sont INDISCERNABLES pour
  --    l'appelant. NE JAMAIS ajouter de branche supplémentaire ici : ce serait
  --    recréer l'oracle que ce statut unique existe pour fermer. RETOURNE, ne
  --    LÈVE PAS : même raison qu'à l'étape 2 — la tentative doit survivre.
  if v_token.id is null
     or v_token.expire_le < now()
     or v_token.revoque_le is not null
     or v_token.utilise_le is not null
  then
    return query select 'invalide'::public.statut_consommation_token, null::uuid, null::public.mode_token, null::uuid;
    return;
  end if;

  -- 5. utilise_par_profil_id reste NULL ici : le compte n'existe pas encore (D27).
  --    sInscrire le pose séparément, une fois le compte créé (Task 14).
  update public.tokens_inscription
     set utilise_le = now()
   where id = v_token.id;

  return query select 'ok'::public.statut_consommation_token, v_token.id, v_token.mode, v_token.membre_id;
end;
$$;

comment on function public.consommer_token_inscription(text, inet) is
  'Consomme un token d''inscription de façon atomique (D25, D27, D31, D34, D36, design 2b §7.1) : verrou de ligne par code_hash, plafond de 10 tentatives par adresse et par fenêtre de 15 minutes (toute tentative comptée, réussie ou non). RETOURNE un statut (ok, invalide, trop_de_tentatives) pour tout refus métier PLUTÔT QUE DE LEVER : la ligne insérée dans tentatives_token_inscription à l''étape 1 doit survivre à un refus, ce qu''une exception empêcherait (Postgres n''a pas de transaction autonome à l''intérieur d''une fonction). Les exceptions restent réservées aux pannes réellement inattendues. SECURITY DEFINER, EXECUTE réservé à service_role. Voir public.relacher_token_inscription pour le geste inverse si la création du compte échoue ensuite.';

revoke execute on function public.consommer_token_inscription(text, inet) from public, anon, authenticated;
grant execute on function public.consommer_token_inscription(text, inet) to service_role;

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
   where id = p_token_id;
end;
$$;

comment on function public.relacher_token_inscription(uuid) is
  'Relâche un token consommé par consommer_token_inscription dont la création du compte a ensuite échoué (D27, design 2b §7.1) : remet utilise_le et utilise_par_profil_id à NULL. SECURITY DEFINER, EXECUTE réservé à service_role.';

revoke execute on function public.relacher_token_inscription(uuid) from public, anon, authenticated;
grant execute on function public.relacher_token_inscription(uuid) to service_role;
