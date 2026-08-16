/**
 * ═══ LES DEUX BARRIÈRES ANTI-CYCLE DE L'AFFICHAGE DE L'ARBRE (D105, D122) ═══
 *
 * Les deux barrières de la DONNÉE — le déclencheur `membres_anti_cycle` et la vérification
 * de `public.definir_arbre` — rendent un cycle IMPOSSIBLE EN BASE. **L'AFFICHAGE NE DOIT PAS
 * EN DÉPENDRE** : un dépliage automatique piloté par la recherche, sur une donnée corrompue,
 * BOUCLERAIT DANS LE NAVIGATEUR — l'onglet se fige, et rien n'indique pourquoi. Même
 * raisonnement que la borne à 64 niveaux des fonctions récursives, « la seule protection
 * restante si une donnée corrompue franchissait un jour les barrières » (1c, piège n°5).
 *
 * CES DEUX FONCTIONS SONT EXTRAITES DE `arborescence.tsx` PAR LA PHASE 6, SANS UN
 * CARACTÈRE DE LOGIQUE CHANGÉ. Elles vivent ici pour une seule raison : une barrière noyée
 * dans 548 lignes de JSX ne se teste pas. `arbre-affichage.test.ts` en porte une preuve
 * chacune.
 *
 * PAS de `import 'server-only'` : c'est de la logique de PRÉSENTATION, employée par un
 * composant client, et l'environnement `node` de `vitest.config.ts` doit pouvoir la faire
 * tourner telle quelle.
 */

/**
 * BARRIÈRE N°1 — LE CLIC. Refuse de déplier un nœud DÉJÀ PRÉSENT DANS LA BRANCHE COURANTE.
 *
 * `ancetres` porte les identifiants des nœuds AU-DESSUS de celui-ci dans la branche
 * **RENDUE** — pas dans l'arbre en base : c'est bien le cycle d'AFFICHAGE qu'on ferme.
 *
 * ⚠️ CE REFUS-CI NE FERME QUE LE CLIC, ET IL NE SUFFIT PAS. `allerA` (la recherche) écrit
 * dans `deplies` sans passer par lui. La barrière qui BORNE RÉELLEMENT LA RÉCURSION est
 * `noeudDeplie`, appliquée au rendu. Celle-ci existe parce qu'elle est la seule à pouvoir
 * DIRE quelque chose : son appelant journalise une trace à l'instant du geste. NE PAS LA
 * SUPPRIMER SOUS PRÉTEXTE QUE L'AUTRE SUFFIT — elles ne font pas le même travail.
 */
export function basculeRefusee(membreId: string, ancetres: readonly string[]): boolean {
  return ancetres.includes(membreId)
}

/**
 * BARRIÈRE N°2 — LE RENDU. **C'est celle qui borne réellement la récursion.**
 *
 * `deplies` est une liste GLOBALE, pas une liste par branche. Sur une donnée porteuse d'un
 * cycle A → B → A, les deux identifiants seraient dépliés et `Noeud(A) → Noeud(B) →
 * Noeud(A) → …` récurserait sans borne : l'onglet se fige. C'est LITTÉRALEMENT le scénario
 * que D105 nomme dans sa justification, et c'est le RENDU qu'elle vise.
 *
 * `ancetres` s'allonge d'un cran à chaque niveau : refuser de déplier un nœud qui s'y trouve
 * déjà BORNE la récursion au nombre de nœuds distincts chargés, quelle que soit la donnée.
 *
 * ⚠️ SUR UNE DONNÉE SAINE, CETTE CONDITION NE CHANGE STRICTEMENT RIEN — dans un arbre sans
 * cycle, aucun nœud n'est son propre ancêtre. C'EST EXACTEMENT CE QUI REND SA DISPARITION
 * INVISIBLE, et c'est pourquoi `arbre-affichage.test.ts` en porte un test d'INVARIANT et pas
 * seulement un test de comportement.
 *
 * Le nœud répété reste AFFICHÉ — l'effacer cacherait le cycle —, simplement replié. Le clic
 * dessus retombe sur `basculeRefusee`, qui, lui, le journalise. ON NE JOURNALISE PAS ICI :
 * un rendu peut se rejouer autant de fois que React le décide.
 */
export function noeudDeplie(
  membreId: string,
  deplies: readonly string[],
  ancetres: readonly string[],
): boolean {
  return deplies.includes(membreId) && !ancetres.includes(membreId)
}

/**
 * D104 — L'INDENTATION EST PLAFONNÉE, ET LE FIL D'ARIANE PORTE LE RESTE.
 *
 * Interface mobile d'abord (§3 de la spécification maîtresse). Une indentation
 * proportionnelle à la profondeur épuise la largeur d'un téléphone vers le cinquième niveau,
 * et l'arbre devient illisible LÀ OÙ IL EST LE PLUS CONSULTÉ. Au-delà du plafond, le niveau
 * est écrit en toutes lettres sur le nœud : c'est l'information que l'indentation ne peut
 * plus porter.
 *
 * VALEUR REPRISE TELLE QUELLE de `arborescence.tsx:26`.
 */
export const PROFONDEUR_MAX_INDENTATION = 4

/**
 * Le niveau de retrait effectif, plafonné. Rend un entier de 0 à
 * `PROFONDEUR_MAX_INDENTATION` inclus — donc CINQ valeurs possibles, et cinq seulement.
 *
 * C'est ce plafond qui permet de remplacer les DEUX SEULES LIGNES `style={{ marginLeft }}`
 * du dépôt (`arborescence.tsx:438` et `:521`) par une classe : un ensemble fini de cinq
 * valeurs n'a pas besoin d'être calculé en JavaScript.
 */
export function niveauDeRetrait(profondeur: number): number {
  return Math.min(Math.max(profondeur, 0), PROFONDEUR_MAX_INDENTATION)
}

/**
 * ═══ LES CINQ CLASSES, ÉCRITES EN TOUTES LETTRES, ET C'EST OBLIGATOIRE ═══
 *
 * ⚠️ NE JAMAIS CONSTRUIRE CES NOMS PAR GABARIT depuis `niveauDeRetrait(profondeur)`. C'est
 * le piège que `bouton.tsx` documente déjà : **Tailwind balaye le SOURCE à la recherche de
 * noms de classe COMPLETS**, il n'exécute pas le JavaScript. Une classe construite par
 * gabarit ne produit AUCUNE RÈGLE, et le nœud sort sans indentation — sans message, sans
 * erreur.
 *
 * CE N'EST PAS UNE PRÉCAUTION THÉORIQUE, C'EST UNE MESURE. Écrit par gabarit, le build du
 * 2026-08-16 n'émettait que trois des cinq règles :
 *   - le niveau 1, parce qu'il est écrit littéralement dans `noeud.tsx` (le décalage de la
 *     pagination d'un nœud) ;
 *   - les niveaux 0 et 4, PARCE QU'ILS ÉTAIENT NOMMÉS DANS UN COMMENTAIRE DE `globals.css`,
 *     que le balayeur lit comme le reste du fichier.
 * Les niveaux 2 et 3 — des profondeurs parfaitement ordinaires — n'existaient nulle part,
 * et ces nœuds s'affichaient collés à la marge.
 *
 * ⚠️ D'OÙ UNE SECONDE RÈGLE, QUE CE COMMENTAIRE-CI S'APPLIQUE À LUI-MÊME : AUCUN NOM DE
 * CLASSE COMPLET NE S'ÉCRIT HORS DE LA TABLE. Ce texte les portait encore tous les cinq au
 * moment de la revue finale de branche — il aurait donc régénéré à lui seul les cinq règles
 * si la table venait à être amputée ou remise en gabarit, et toutes les portes seraient
 * restées vertes : le défaut de la Task 10 restauré par la documentation écrite pour
 * l'empêcher. La leçon vaut au-delà d'ici : une vérification qui cherche un nom de classe
 * dans le CSS produit le TROUVE dans une règle fabriquée par sa propre documentation. C'est
 * la RÈGLE ÉMISE qu'il faut compter, pas l'occurrence du nom.
 *
 * La table vit DANS ce module, et non dans `noeud.tsx`, pour une seule raison : c'est ici
 * qu'est écrit le fait dont elle dépend — l'image de `niveauDeRetrait` est un ensemble FINI
 * de `PROFONDEUR_MAX_INDENTATION + 1` entiers. `arbre-affichage.test.ts` verrouille les
 * deux ensemble, de sorte qu'un plafond déplacé sans sa classe fasse tomber une preuve.
 */
export const CLASSES_RETRAIT = [
  'retrait-0',
  'retrait-1',
  'retrait-2',
  'retrait-3',
  'retrait-4',
] as const

/** La classe d'indentation d'un nœud, plafonnée. Toujours un des cinq littéraux ci-dessus. */
export function classeDeRetrait(profondeur: number): string {
  return CLASSES_RETRAIT[niveauDeRetrait(profondeur)]
}
