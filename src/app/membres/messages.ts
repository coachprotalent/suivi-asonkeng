import type { CoupleIncompatible } from '@/lib/domaine/statut'

export const MESSAGE_ECHEC_ENREGISTREMENT =
  "La fiche n'a pas pu être enregistrée. Vérifiez les informations saisies."

/**
 * Refus du couple exclusif venu de la PASSERELLE (marqueur
 * `statuts_exclusifs_incompatibles`, D84), et non du contrôle amont.
 *
 * Distinct de `messageStatutsIncompatibles` ci-dessous, et ce n'est pas une redite : ce
 * message-ci ne peut PAS nommer les deux statuts. La passerelle relit les groupes en base
 * et ne rend que le nom du groupe dans sa prose française — dont on ne discrimine jamais
 * (contrainte globale). Atteindre ce message signifie donc que le contrôle amont a laissé
 * passer : catalogue tronqué, appel forgé, ou modification du catalogue entre les deux.
 * Le dire ainsi vaut mieux que d'inventer deux libellés qu'on n'a pas.
 */
export const MESSAGE_STATUTS_EXCLUSIFS_PASSERELLE =
  "Deux des statuts choisis appartiennent au même groupe exclusif : un membre ne peut porter que l'un des deux. Retirez-en un, puis recommencez."

/**
 * Le faiseur de disciple visé existe, mais il n'est NI actif NI archivé — donc en attente
 * de validation (marqueur `faiseur_de_disciple_inactif`).
 *
 * DISTINCT de `MESSAGE_FAISEUR_ARCHIVE`, et ce n'est pas une redite : ce message-là dit
 * « est archivé », et l'afficher pour une fiche en attente serait une phrase que le code
 * ne tient pas. Le marqueur est distinct EXACTEMENT pour cette raison ; le message doit
 * l'être aussi, sans quoi la distinction faite en base serait perdue à l'écran.
 *
 * Ce message est ici, dans `src/app/membres/messages.ts`, et NON dans
 * `src/app/membres/[id]/arbre/messages.ts` : ce dossier appartient à un écran que cette
 * phase laisse rigoureusement inchangé, et un balayage de la phase vérifie que son diff
 * est vide.
 */
export const MESSAGE_FAISEUR_NON_ACTIF =
  "Le faiseur de disciple choisi n'est pas un membre actif : ce rattachement n'est pas autorisé."

/**
 * Refus du couple exclusif NOMMÉ, produit par le contrôle amont `statutsIncompatibles`
 * (D84). C'est le chemin normal : il EXPLIQUE, là où la passerelle PROTÈGE.
 */
export function messageStatutsIncompatibles(couple: CoupleIncompatible): string {
  return `« ${couple.premier} » et « ${couple.second} » appartiennent tous deux au groupe « ${couple.groupe} », qui est exclusif : un membre ne peut porter que l'un des deux. Retirez-en un, puis recommencez.`
}
