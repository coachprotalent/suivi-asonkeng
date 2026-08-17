-- Phase 8, D159 / D160 — les refus de suppression d'un compte, EN BASE.
--
-- ═══ POURQUOI UN DÉCLENCHEUR PLUTÔT QU'UNE PASSERELLE ═══
-- `profils.id` référence `auth.users` en `on delete cascade` (20260811120000) : supprimer le
-- compte d'AUTHENTIFICATION cascade vers `public.profils` et DÉCLENCHE ce contrôle DANS LA
-- MÊME TRANSACTION. Un refus annule donc TOUT, Y COMPRIS la suppression du compte
-- d'authentification — l'atomicité est obtenue sans qu'aucune compensation applicative ne
-- soit nécessaire.
--
-- C'est aussi ce qui permet de NE PAS écrire à la main dans le schéma `auth`, dont Supabase
-- ne garantit pas la stabilité et dont les tables satellites (`auth.identities`,
-- `auth.sessions`, `auth.refresh_tokens`) ont leurs propres clés étrangères.
--
-- ⚠️ LE CHEMIN INVERSE EST EXPLICITEMENT REFUSÉ. Supprimer d'abord `public.profils`
-- laisserait un compte d'authentification ORPHELIN — exactement celui qu'un balayage de la
-- phase 7 a trouvé en base (`verif.privilege.…@example.com`, créé le 2026-08-13, jamais
-- connecté, sans profil). L'application ne doit JAMAIS émettre `delete from public.profils` ;
-- elle appelle `auth.admin.deleteUser`, et cette règle est écrite dans
-- `src/app/comptes/actions.ts` au point d'appel.
--
-- ═══ CE DÉCLENCHEUR NE PEUT PAS VOIR QUI SUPPRIME (D160) ═══
-- Appelé derrière la clé de service, `auth.uid()` vaut `null` ici : la base IGNORE l'identité
-- de l'appelant. Le refus d'AUTO-SUPPRESSION vit donc dans la Server Action, et LUI SEUL —
-- c'est un garde d'ACTION, pas une barrière. Une requête forgée par un administrateur contre
-- lui-même passerait ; la conséquence serait un administrateur qui se supprime, désagréable
-- et jamais dangereuse, le cas catastrophique restant tenu par le second refus ci-dessous.
--
-- ⚠️ LES MARQUEURS NE TRAVERSENT PAS GoTrue. `error.details` de Postgres n'est pas exposé par
-- l'API d'administration : l'application NE PEUT PAS discriminer dessus, et affichera son
-- message générique si ce déclencheur mord. C'est précisément pourquoi la Server Action porte
-- des CONTRÔLES AMONT qui nomment la cause avant d'écrire. Les marqueurs restent posés pour
-- le diagnostic en base, pas pour l'écran — on ne promet pas ici une discrimination qui ne
-- tiendrait pas côté application.

create or replace function prive.refuser_suppression_compte()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.est_racine then
    raise exception 'Le compte racine ne peut pas être supprimé.'
      using detail = 'compte_racine';
  end if;

  -- `old.actif` FAIT PARTIE DE LA CONDITION, et ce n'est pas une précaution : un compte
  -- administrateur DÉJÀ DÉSACTIVÉ n'est pas compté parmi les administrateurs actifs
  -- (`prive.compter_administrateurs_actifs` filtre sur `actif`), donc le supprimer ne peut
  -- pas faire passer ce nombre de 1 à 0. Sans cette clause, on refuserait la suppression
  -- d'un administrateur inactif dans un projet qui n'a de toute façon plus aucun
  -- administrateur actif — un refus qui ne protège rien et bloque un nettoyage légitime.
  if old.actif
     and exists (
       select 1 from public.roles_profil r
       where r.profil_id = old.id and r.role = 'administrateur'
     )
     and prive.compter_administrateurs_actifs(old.id) = 0
  then
    raise exception 'Il doit rester au moins un administrateur actif.'
      using detail = 'dernier_administrateur';
  end if;

  return old;
end;
$$;

create trigger profils_refuser_suppression
  before delete on public.profils
  for each row execute function prive.refuser_suppression_compte();

comment on function prive.refuser_suppression_compte() is
  'Déclencheur before delete sur public.profils (phase 8, D159/D160) : refuse la suppression du compte racine (detail = compte_racine) et celle du dernier administrateur ACTIF (detail = dernier_administrateur). Atteint par la CASCADE depuis auth.users, donc dans la même transaction que la suppression du compte d''authentification : un refus annule les deux, sans compensation applicative. Il ne peut PAS voir qui supprime — auth.uid() vaut null derrière la clé de service —, d''où le refus d''auto-suppression porté par la Server Action seule, qui est un garde d''action et non une barrière. Ses marqueurs ne traversent pas GoTrue et servent au diagnostic en base, jamais à l''affichage : les messages utiles viennent des contrôles amont de src/app/comptes/actions.ts.';
