-- Corrige le déclencheur de complétude posé par 20260817120000 (Q1 de la ronde de
-- correction) : un déclencheur `before` s'exécute AVANT que la contrainte `not null`
-- de la colonne ne soit vérifiée, si bien que `new.etat` peut valoir NULL au moment où
-- ce déclencheur s'exécute (par exemple un `insert` PostgREST en lot hétérogène où
-- `etat` est présent sur certaines lignes et absent sur d'autres — PostgREST insère
-- alors NULL explicite pour la ligne qui l'omet, jamais le défaut de colonne).
--
-- `new.etat <> 'tenue'` vaut NULL quand `new.etat` est NULL (comparaison à trois
-- valeurs de SQL), donc `if new.etat <> 'tenue' then return new; end if;` ne
-- court-circuite PAS : le NULL n'est ni vrai ni faux, la condition tombe dans l'autre
-- branche implicite et le déclencheur poursuit comme s'il visait `tenue`. Une ligne qui
-- ne visait pourtant PAS `tenue` (et aurait dû être acceptée, quitte à être refusée
-- ensuite par la contrainte `not null` elle-même) est alors rejetée avec le marqueur
-- `seance_sans_theme` — celui créé pour nommer le champ manquant nomme alors le
-- MAUVAIS champ : ce n'est pas le thème qui manque, c'est l'état qui n'a jamais été
-- fourni. Constaté en pratique par l'implémenteur des Tasks 9-10 (rapport
-- task-9-10-report.md, écart n°1) et contourné dans son propre fichier de test en
-- donnant à chaque ligne son `etat` explicite — mais la fragilité reste dans le
-- déclencheur tant qu'elle n'est pas corrigée ici.
--
-- Correctif : `is distinct from`, qui ne connaît que deux valeurs (vrai/faux, jamais
-- NULL) et traite NULL comme distinct de 'tenue' — donc comme un sens non-`tenue`,
-- exactement le comportement voulu par le court-circuit d'origine. Un état NULL n'est
-- de toute façon jamais un état `tenue` valide.
--
-- Migration 20260817120000 déjà APPLIQUÉE : on ne la modifie pas, on la remplace par
-- `create or replace function` (le corps de la fonction n'est pas versionné en soi,
-- seule la définition vivante compte) et on repose le même déclencheur, dont la
-- définition ne change pas.

create or replace function prive.refuser_seance_tenue_incomplete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Ne réagit QU'À l'état résultant `tenue` — jamais au sens retour (`prevue`,
  -- `annulee`), quelle qu'ait été la valeur avant cette écriture. C'est cette asymétrie
  -- volontaire qui rend la réversibilité de D49 possible sans deuxième migration : le
  -- même déclencheur sert les deux sens sans avoir à distinguer un aller-retour
  -- légitime d'une tentative de contournement.
  --
  -- `is distinct from`, PAS `<>` : ce déclencheur `before` s'exécute avant que la
  -- contrainte `not null` de la colonne ne soit vérifiée, donc `new.etat` peut valoir
  -- NULL ici (insertion PostgREST en lot hétérogène, entre autres). `<>` avec un NULL
  -- vaut NULL (ni vrai ni faux) et ne court-circuite pas ; `is distinct from` traite
  -- NULL comme distinct de 'tenue', ce qui est le comportement voulu : un état NULL
  -- n'est jamais un état `tenue`, il ne doit donc jamais être retenu ici comme visant
  -- `tenue` (Q1 de la ronde de correction, `task-9-10-report.md`).
  if new.etat is distinct from 'tenue' then
    return new;
  end if;

  if new.theme is null or trim(new.theme) = '' then
    raise exception 'Une séance ne peut pas être tenue sans thème.'
      using detail = 'seance_sans_theme';
  end if;

  if new.enseignant_membre_id is null
     and (new.enseignant_libre is null or trim(new.enseignant_libre) = '') then
    raise exception 'Une séance ne peut pas être tenue sans enseignant.'
      using detail = 'seance_sans_enseignant';
  end if;

  return new;
end;
$$;

comment on function prive.refuser_seance_tenue_incomplete() is
  'Déclencheur before insert or update (toute colonne) sur public.seances_ael : refuse tout état RÉSULTANT à ''tenue'' si le thème ou l''enseignant manquent, que la transition vienne de se produire ou que la ligne soit déjà tenue et modifiée ensuite. Ne réagit jamais au sens retour vers ''prevue'' ou ''annulee'' (D49), ni à un ''etat'' NULL (comparaison ''is distinct from'', jamais ''<>'' — ce déclencheur ''before'' s''exécute avant la contrainte ''not null'' de la colonne, corrigé par 20260817150000). Deux marqueurs distincts (spec §7 : indication du champ manquant), pas un seul déguisé en généralité.';
