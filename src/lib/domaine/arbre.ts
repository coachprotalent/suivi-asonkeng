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

  // Nul n'est son propre ancêtre : `ancetres` exclut la cible (voir
  // `public.ancetres_membre`), donc ce cas est déjà couvert — sauf si quelqu'un
  // désignait un membre comme son propre dirigeant, ce que les contraintes CHECK de
  // `membres` interdisent. Les deux branches ci-dessous sont donc sûres telles quelles.
  if (cible.dirigeantId === contexte.membreLieId) {
    return true
  }
  return cible.ancetres.includes(contexte.membreLieId)
}
