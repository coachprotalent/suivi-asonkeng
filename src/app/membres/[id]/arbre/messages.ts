import type { MembreBref } from '@/lib/donnees/membres'

export const MESSAGE_ECHEC_ARBRE = "Le rattachement n'a pas pu être enregistré."
export const MESSAGE_MEMBRE_INCONNU = "Cette fiche n'existe plus."
export const MESSAGE_FAISEUR_INCONNU = "Le faiseur de disciple choisi n'existe plus."
export const MESSAGE_DIRIGEANT_INCONNU = "Le dirigeant choisi n'existe plus."
// Correctif post-1c : le sélecteur ne propose que des membres actifs, mais un appel
// RPC forgé ou une écriture directe pouvait rattacher un membre actif à un faiseur de
// disciple archivé — exactement l'état que l'archivage interdit (migration
// 20260814150000).
export const MESSAGE_FAISEUR_ARCHIVE =
  "Le faiseur de disciple choisi est archivé : ce rattachement n'est pas autorisé."

/**
 * Message d'un cycle refusé, avec le chemin fautif — le §7 de la spécification exige
 * qu'il soit affiché, et non seulement que le refus ait lieu.
 *
 * Sans le chemin, l'administrateur sait qu'il a tort sans savoir pourquoi : dans une
 * arborescence de plusieurs centaines de personnes, retrouver à la main la chaîne qui
 * boucle est hors de portée.
 */
export function messageCycle(chemin: MembreBref[]): string {
  if (chemin.length === 0) {
    return "Ce rattachement créerait un cycle dans l'arbre des faiseurs de disciple."
  }
  const noms = chemin.map((membre) => `${membre.prenom} ${membre.nom}`).join(' → ')
  return `Ce rattachement créerait un cycle dans l'arbre des faiseurs de disciple. Chemin fautif (chaque flèche se lit « a pour faiseur de disciple ») : ${noms}.`
}
