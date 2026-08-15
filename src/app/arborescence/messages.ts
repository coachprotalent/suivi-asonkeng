/**
 * Messages STATIQUES, affichés par le composant client quand une lecture échoue.
 *
 * ═══ POURQUOI DES CONSTANTES, ET JAMAIS `error.message` ═══
 * Les actions de ce dossier LÈVENT sur un échec de lecture — jamais `[]` : rendre une
 * liste vide sur une erreur ferait croire à un faiseur de disciple sans personne, ce qui
 * est la même famille de mensonge que la troncature silencieuse.
 *
 * Mais le composant client, lui, ATTRAPE cette exception pour rester utilisable — et c'est
 * précisément le cas où le message serait remplacé par un digest React en build de
 * PRODUCTION (`Minified React error #441`). `comptes/ligne-compte.tsx` est le seul autre
 * composant du dépôt dans ce cas, et il est connu, mesuré, non corrigé.
 *
 * On n'affiche donc JAMAIS `error.message` ici : on affiche ces constantes, et l'objet
 * d'erreur part dans `console.error` côté navigateur, où il reste exploitable.
 */

export const MESSAGE_ECHEC_LECTURE_NOEUD =
  "Les disciples de ce membre n'ont pas pu être chargés. Réessayez ; si le problème persiste, contactez un administrateur technique."

export const MESSAGE_ECHEC_LECTURE_CHEMIN =
  "Le chemin de cette personne dans l'arbre n'a pas pu être chargé. Réessayez ; si le problème persiste, contactez un administrateur technique."

/**
 * Le chemin a été chargé, mais l'arbre n'a pas pu être déplié JUSQU'À la personne visée.
 *
 * ═══ POURQUOI CE MESSAGE EXISTE, ET POURQUOI SON ABSENCE SERAIT GRAVE ═══
 * L'écran déplie le chemin maillon par maillon, en chargeant pour chacun la page de
 * disciples qui contient le maillon suivant. Si ce calcul ne peut pas aboutir — maillon
 * intermédiaire devenu illisible ou non actif, branche modifiée entre les deux lectures —,
 * la personne cherchée n'apparaît PAS dans l'arbre, alors que le fil d'Ariane, lui,
 * continue d'afficher son chemin complet. Deux vérités contradictoires sur le même écran :
 * exactement ce que cet écran refuse ailleurs. Le dire est le minimum.
 */
export const MESSAGE_CHEMIN_PARTIEL =
  "Le chemin de cette personne est affiché ci-dessus, mais l'arbre n'a pas pu être déplié jusqu'à elle. Ouvrez sa fiche depuis le chemin, ou dépliez la branche à la main."
