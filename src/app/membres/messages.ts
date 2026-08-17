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
 * Ce message vit ici, dans `src/app/membres/messages.ts`, parce que c'est ici qu'il est né
 * — avec `creerMembreEnrichi`, premier chemin à discriminer le marqueur. IL EST IMPORTÉ,
 * jamais recopié, par les DEUX autres chemins qui peuvent recevoir ce même marqueur du même
 * `public.definir_arbre` (`src/app/membres/[id]/arbre/actions.ts` et
 * `src/app/demandes/actions.ts`) : un fait unique en base ne doit pas produire trois vérités
 * différentes sur trois écrans.
 *
 * RECTIFICATIF (revue finale de la phase 5). La rédaction précédente justifiait ce
 * placement par « ce dossier appartient à un écran que cette phase laisse rigoureusement
 * inchangé, et un balayage de la phase vérifie que son diff est vide ». LES DEUX MOITIÉS
 * ÉTAIENT FAUSSES, mesurées : la phase a modifié `src/app/membres/[id]/arbre/` deux fois
 * (`065555a`, `4f52d3e`), et aucun balayage de ce genre n'a jamais existé dans le dépôt. Un
 * renvoi à une preuve inexistante ferme les yeux mieux qu'une absence de preuve : il n'y a
 * donc ici AUCUNE promesse de vérification, seulement la raison réelle du placement.
 */
export const MESSAGE_FAISEUR_NON_ACTIF =
  "Le faiseur de disciple choisi n'est pas un membre actif : ce rattachement n'est pas autorisé."

/**
 * Le contact désigné n'existe pas (phase 7, D136).
 *
 * ═══ PRODUIT PAR UN CONTRÔLE AMONT, JAMAIS PAR LA VIOLATION DE CLÉ ÉTRANGÈRE ═══
 * PostgREST ne rend le nom de la contrainte `membres_contact_id_fkey` que dans
 * `error.message`, de la prose anglaise de Postgres — et la contrainte globale du projet
 * interdit de discriminer sur la prose. D'où le contrôle amont de `actions.ts`.
 *
 * Comme partout dans ce dépôt : le contrôle amont EXPLIQUE, la clé étrangère PROTÈGE. Une
 * suppression concurrente de la fiche contact, entre la vérification et l'écriture,
 * passerait ici et serait arrêtée par la contrainte, avec le message générique. C'est le
 * partage voulu, pas une faiblesse.
 *
 * ═══ IL NE VÉRIFIE PAS QUE LE CONTACT EST ACTIF, ET C'EST DÉLIBÉRÉ (D136) ═══
 * Le faiseur de disciple l'exige parce qu'une chaîne de discipulat rattachée à une fiche
 * archivée est cassée — d'où le déclencheur `membres_faiseur_de_disciple_archive`. Le
 * contact ne porte aucun invariant de ce genre : il ne confère rien (D132) et n'est
 * parcouru par rien (D131). Exiger « actif » dans l'application sans l'exiger en base
 * INVENTERAIT UNE RÈGLE QUE LA BASE NE TIENT PAS : un appel forgé la contournerait sans que
 * rien ne s'y oppose, et cette phrase-ci serait fausse. Un contact archivé s'affiche par
 * `libelleFiche`, comme n'importe quelle fiche non consultable.
 */
export const MESSAGE_CONTACT_INCONNU =
  "La personne choisie comme contact est introuvable. Choisissez-en une autre, puis recommencez."

/**
 * Refus du couple exclusif NOMMÉ, produit par le contrôle amont `statutsIncompatibles`
 * (D84). C'est le chemin normal : il EXPLIQUE, là où la passerelle PROTÈGE.
 */
export function messageStatutsIncompatibles(couple: CoupleIncompatible): string {
  return `« ${couple.premier} » et « ${couple.second} » appartiennent tous deux au groupe « ${couple.groupe} », qui est exclusif : un membre ne peut porter que l'un des deux. Retirez-en un, puis recommencez.`
}
