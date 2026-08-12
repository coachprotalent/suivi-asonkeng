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
