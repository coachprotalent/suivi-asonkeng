-- Phase 8, D154 — `definir_roles` accepte le troisième rôle.
--
-- MIGRATION ADDITIVE : 20260814130000 est déjà appliquée et ne se réécrit pas. Le corps
-- ci-dessous est RECOPIÉ À L'IDENTIQUE de cette migration, commentaires compris ; la seule
-- addition est marquée « PHASE 8 ».
--
-- ═══ POURQUOI UN `drop` ET PAS UN `create or replace` ═══
-- `create or replace function` NE PEUT PAS changer une signature. Sans le `drop` ci-dessous,
-- cette migration créerait une SURCHARGE : les deux fonctions coexisteraient, PostgREST
-- choisirait l'ANCIENNE pour tout appelant ne passant pas `p_leader`, et une case « Leader »
-- cochée resterait SANS EFFET, EN SILENCE — le pire mode de défaillance, puisque l'écran
-- annoncerait un succès. Les privilèges ne survivant pas au `drop`, le `revoke`/`grant` en
-- pied de fichier n'est pas décoratif : sans lui, l'écran des rôles tomberait EN PRODUCTION
-- sans que le déploiement ne signale rien. Même piège qu'en phase 7 sur
-- `creer_membre_enrichi` (D135), et une preuve permanente le mesure
-- (`tests/rls/leader.test.ts`, « AUCUNE SURCHARGE NE SUBSISTE »).
--
-- ═══ LE GARDE DU DERNIER ADMINISTRATEUR N'EST PAS ÉTENDU AU LEADER (D155) ═══
-- Il doit rester au moins un administrateur actif ; il n'a JAMAIS à rester un leader. Un
-- projet sans leader fonctionne exactement comme avant cette phase. La condition ci-dessous
-- ne porte donc que sur `p_administrateur`, et elle est inchangée.

drop function if exists public.definir_roles(uuid, boolean, boolean);

create function public.definir_roles(
  p_profil uuid,
  p_administrateur boolean,
  p_moderateur boolean,
  p_leader boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- PREMIÈRE instruction. Clé (20260814, 2) = rôles et activation des comptes.
  perform pg_advisory_xact_lock(20260814, 2);

  perform 1 from public.profils p where p.id = p_profil for update;
  if not found then
    raise exception 'Compte inconnu.' using detail = 'compte_inconnu';
  end if;

  -- La condition porte sur l'état COURANT du profil visé : retirer un rôle qu'il n'a
  -- pas ne doit rien refuser. Sans cette clause `exists`, un compte ordinaire deviendrait
  -- impossible à modifier dès qu'il ne reste qu'un seul administrateur.
  if not p_administrateur
     and exists (
       select 1 from public.roles_profil r
       where r.profil_id = p_profil and r.role = 'administrateur'
     )
     and prive.compter_administrateurs_actifs(p_profil) = 0
  then
    raise exception 'Il doit rester au moins un administrateur actif.'
      using detail = 'dernier_administrateur';
  end if;

  delete from public.roles_profil where profil_id = p_profil;
  if p_administrateur then
    insert into public.roles_profil (profil_id, role) values (p_profil, 'administrateur');
  end if;
  if p_moderateur then
    insert into public.roles_profil (profil_id, role) values (p_profil, 'moderateur');
  end if;
  -- ═══ PHASE 8, D154 — SEULE ADDITION AU CORPS ═══
  -- Aucun garde ne l'accompagne, et c'est délibéré (D155) : contrairement au rôle
  -- administrateur, le rôle leader peut disparaître entièrement du projet sans conséquence.
  if p_leader then
    insert into public.roles_profil (profil_id, role) values (p_profil, 'leader');
  end if;
end;
$$;

comment on function public.definir_roles(uuid, boolean, boolean, boolean) is
  'Rôles d''un compte, écrits sous verrou consultatif sérialisé (clé 20260814,2) : la protection du dernier administrateur est un lire-puis-écrire, et deux administrateurs se rétrogradant simultanément passeraient tous les deux sans lui. Étendue en phase 8 (D154) au rôle leader, qui donne autorité sur TOUS les membres — la décision se prend côté application, dans peutModifier — sans conférer aucun pouvoir de modérateur ni élargir aucune lecture. LE GARDE DU DERNIER ADMINISTRATEUR NE PORTE QUE SUR p_administrateur (D155) : un projet sans leader est parfaitement légitime. Lève avec detail = compte_inconnu ou dernier_administrateur, marqueurs stables destinés à l''application. Exécution réservée à service_role.';

revoke execute on function public.definir_roles(uuid, boolean, boolean, boolean) from public, anon, authenticated;
grant execute on function public.definir_roles(uuid, boolean, boolean, boolean) to service_role;
