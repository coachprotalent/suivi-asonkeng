-- Ronde de correction (revue des Tasks 4-6, constat 1) : `types_evenement_libelle_unique`
-- (20260818120000) est une unicité BRUTE — sensible à la casse et aux espaces de bord.
-- « Webinaire », « webinaire » et « Webinaire » (espace parasite) sont trois lignes
-- distinctes pour cette contrainte : rien ne les identifie comme le même type. Le
-- commentaire de tête de 20260818120000 affirmait que rejouer l'amorçage « sur une base où
-- un administrateur aurait déjà créé "Webinaire" à la main » ne crée AUCUN doublon — c'est
-- vrai UNIQUEMENT si la saisie manuelle a reproduit la chaîne littérale exacte, faux dès
-- qu'un administrateur a saisi une variante de casse ou d'espacement. La preuve rejouée par
-- la Task 4 (réinsertion de la même chaîne littérale) ne pouvait PAS voir ce trou : elle
-- rejoue exactement la même chaîne. 20260818120000 est une migration APPLIQUÉE et n'est
-- donc pas modifiée ici (le commentaire faux qu'elle porte dans le fichier .sql reste
-- inchangé, comme il se doit) ; cette migration additive pose le VRAI comportement en base
-- et corrige la légende attachée à la contrainte littérale.
--
-- Choix retenu : NORMALISER plutôt que documenter seulement. Le trou traverse aussi la
-- future action de création du catalogue (hors périmètre des Tasks 7-9, pas encore
-- écrite) : le §4.4 ne prévoit qu'un `trim` des espaces de bord côté formulaire, jamais de
-- normalisation de casse. Se contenter d'un commentaire laisserait ce trou ouvert jusqu'à
-- ce qu'un administrateur crée réellement un doublon silencieux du catalogue — un
-- référentiel partagé par toutes les fiches événement, où un doublon casse la lecture
-- « un type, un libellé » que l'écran /evenements/types présuppose.
--
-- Index UNIQUE sur la forme normalisée (minuscules, espaces de bord retirés) : c'est un
-- SECOND index, distinct de `types_evenement_libelle_unique`, qui reste tel quel (l'ancre
-- littérale du `on conflict (libelle) do nothing` de l'amorçage doit rester une clé
-- littérale — `on conflict` ne peut cibler qu'une contrainte/un index existant portant
-- EXACTEMENT les colonnes de son expression).
create unique index types_evenement_libelle_normalise_unique
  on public.types_evenement (lower(trim(libelle)));

comment on index public.types_evenement_libelle_normalise_unique is
  'Unicité NORMALISÉE (minuscules, espaces de bord retirés) du catalogue des types d''événement (ronde de correction, revue Tasks 4-6). Ferme le trou que types_evenement_libelle_unique, littérale, laisse ouvert : "Webinaire", "webinaire" et " Webinaire" y sont trois valeurs distinctes. Une future action de création qui ne ferait que trim() les espaces de bord (sans normaliser la casse) resterait donc protégée par CET index, pas par l''unicité littérale.';

-- Légende corrigée de la contrainte littérale : dit maintenant ce qui est vrai, pas ce que
-- 20260818120000 promettait en trop.
comment on constraint types_evenement_libelle_unique on public.types_evenement is
  'Clé naturelle LITTÉRALE, et ancre du `on conflict (libelle) do nothing` de l''amorçage (D57) : rejouer l''amorçage avec les QUATRE CHAÎNES LITTÉRALES du seed ne crée jamais de doublon. Cette contrainte ne protège PAS contre une variante de casse ou d''espacement saisie par un administrateur ("Webinaire" et "webinaire" sont deux lignes distinctes pour elle) — c''est types_evenement_libelle_normalise_unique (ronde de correction, revue Tasks 4-6) qui ferme ce doublon-là, sur lower(trim(libelle)). Le commentaire de tête du fichier de migration 20260818120000 (appliqué, non modifié) affirmait à tort qu''aucun doublon n''était possible dans ce second cas ; cette légende, elle, est exacte.';
