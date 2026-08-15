import { libelleFiche, LIBELLE_FICHE_NON_CONSULTABLE } from './membre'

/**
 * Un maillon de l'arbre des faiseurs de disciple : l'identifiant d'un membre et celui
 * de son faiseur de disciple. C'est tout ce dont les règles d'arbre ont besoin.
 */
export type MaillonArbre = {
  id: string
  faiseurDeDiscipleId: string | null
}

/**
 * Dirigeant PROPOSÉ pour un membre, selon la règle du §4.2 de la spécification.
 *
 * Prend le faiseur de disciple du membre, et non le membre : c'est la seule
 * information nécessaire.
 *
 * La règle remonte d'au plus deux crans et ne cherche PAS la racine de la chaîne. Un
 * dirigeant est « un faiseur de disciple qui gère en plus l'ensemble des individus de
 * son arborescence » (glossaire), pas le sommet de l'organisation.
 *
 * La valeur est une PROPOSITION : l'administrateur l'accepte ou la remplace, et
 * `dirigeant_force` enregistre lequel des deux s'est produit. Ce drapeau n'interdit
 * rien — le lire comme une autorisation serait un contresens.
 */
export function dirigeantPropose(faiseurDeDisciple: MaillonArbre | null): string | null {
  if (faiseurDeDisciple === null) {
    return null
  }
  if (faiseurDeDisciple.faiseurDeDiscipleId === null) {
    return faiseurDeDisciple.id
  }
  return faiseurDeDisciple.faiseurDeDiscipleId
}

/** Qui demande : son membre lié (null pour le compte racine), et son rôle. */
export type ContexteAutorite = {
  membreLieId: string | null
  estAdmin: boolean
}

/** Sur qui : la fiche visée, ses ancêtres et son dirigeant désigné. */
export type CibleAutorite = {
  membreId: string
  ancetres: string[]
  dirigeantId: string | null
}

/**
 * Portée d'autorité du §5.1 : autorité sur un membre si l'on est administrateur, ou si
 * son membre lié est un ancêtre de la cible à n'importe quelle profondeur, ou s'il en
 * est le dirigeant désigné.
 *
 * Fonction PURE : elle ne lit pas la base. La chaîne d'ancêtres lui est fournie, ce qui
 * la rend testable sans base, comme l'annonce le §8 de la spécification.
 */
export function peutModifier(contexte: ContexteAutorite, cible: CibleAutorite): boolean {
  if (contexte.estAdmin) {
    return true
  }

  // Le compte racine n'a pas de membre lié (spec D11). Sans ce court-circuit, `null`
  // atteindrait la comparaison au dirigeant et rendrait `true` sur toute fiche sans
  // dirigeant. Ce n'est pas une précaution : c'est la règle. Un compte sans place dans
  // l'arbre n'a aucune portée d'autorité, il n'agit qu'en tant qu'administrateur.
  if (contexte.membreLieId === null) {
    return false
  }

  // Nul n'est son propre ancêtre (§5.1) : un utilisateur n'a jamais autorité sur sa
  // propre fiche. Ce court-circuit est LOCAL et NE DÉPEND D'AUCUNE GARANTIE EXTÉRIEURE :
  // même si `public.ancetres_membre` incluait un jour la cible dans sa propre liste
  // d'ancêtres (bug de la requête récursive), ou si la contrainte CHECK qui interdit
  // `dirigeant_id = id` était levée, cette fonction refuserait quand même l'autorité sur
  // soi-même. Les contraintes de la base restent une seconde ligne de défense, pas la
  // première : celle-ci ne dépend pas d'elles pour tenir.
  if (cible.membreId === contexte.membreLieId) {
    return false
  }

  if (cible.dirigeantId === contexte.membreLieId) {
    return true
  }
  return cible.ancetres.includes(contexte.membreLieId)
}

/** Un maillon du chemin, prêt à afficher. */
export type MaillonNomme = { id: string; libelle: string }

/**
 * Compose le chemin AFFICHABLE à partir de sa FORME et des noms qu'on a pu lire (D98).
 *
 * ═══ LES DEUX LECTURES N'ONT PAS LE MÊME RÉGIME, ET C'EST LE POINT ═══
 * La FORME du chemin — la suite d'identifiants — est lue AFFRANCHIE DE LA RLS, par
 * `public.ancetres_membre` (D19, `security definer`, réservée à `service_role`). Une
 * remontée soumise à la RLS s'arrêterait sur un ancêtre invisible et ferait MENTIR l'écran
 * sur la profondeur. Les NOMS, eux, sont lus SOUS RLS **et filtrés `etat = 'actif'`
 * explicitement**, par l'appelant — sans ce filtre, l'exclusion des fiches non actives
 * serait déléguée à la RLS, et un administrateur lirait un nom là où un compte ordinaire
 * lit « Fiche non consultable ».
 *
 * ═══ UN MAILLON ILLISIBLE GARDE SA PLACE ═══
 * Un identifiant présent dans la forme et absent de la lecture sous RLS devient
 * « Fiche non consultable », À SA PROFONDEUR, jamais effacé ni sauté. L'effacer ferait
 * mentir l'écran sur la profondeur et pourrait détacher toute la descendance.
 *
 * ═══ AUCUN NOM LU AFFRANCHI DE LA RLS N'ATTEINT JAMAIS L'ÉCRAN ═══
 * C'est la Server Action appelante qui en répond : elle ne rend que des identifiants
 * depuis la lecture affranchie, et relit les noms sous RLS. Cette fonction ne lit rien :
 * elle reçoit les deux listes et les assemble. Elle ne peut donc pas trahir cette règle —
 * mais elle ne peut pas non plus la garantir seule, et il faut le savoir.
 *
 * `identifiants` est ordonné de la RACINE au membre visé.
 */
export function cheminAvecLibelles(
  identifiants: readonly string[],
  brefs: ReadonlyArray<{ id: string; prenom: string; nom: string }>,
): MaillonNomme[] {
  const parId = new Map(brefs.map((bref) => [bref.id, bref]))
  return identifiants.map((identifiant) => ({
    id: identifiant,
    // `libelleFiche` ne rend `null` que sur un identifiant nul, ce qui ne peut pas
    // arriver ici : la forme du chemin ne contient que des identifiants réels. Le repli
    // est écrit quand même — un `null` affiché tel quel serait pire qu'un libellé
    // conservateur.
    libelle: libelleFiche(identifiant, parId.get(identifiant) ?? null) ?? LIBELLE_FICHE_NON_CONSULTABLE,
  }))
}
