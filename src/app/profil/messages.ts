export const MESSAGE_ECHEC_COORDONNEES =
  "Vos coordonnées n'ont pas pu être enregistrées. Vérifiez les informations saisies."

/**
 * Marqueur `profil_sans_membre` de `public.modifier_mon_profil` (phase 7, D139).
 *
 * Atteint quand le compte n'a pas de fiche — ou n'en a plus. L'écran n'affiche normalement
 * PAS le formulaire dans ce cas : y parvenir signifie qu'un onglet est resté ouvert pendant
 * qu'un administrateur détachait la fiche du compte, ou que le compte a été désactivé
 * entretemps (la passerelle vérifie `actif`, en défense en profondeur).
 *
 * Message DISTINCT du générique, et ce n'est pas une redite : « vérifiez les informations
 * saisies » ferait chercher une faute de frappe là où il n'y en a aucune, et la personne
 * retaperait indéfiniment des coordonnées parfaitement valides.
 */
export const MESSAGE_PROFIL_SANS_MEMBRE =
  "Ce compte n'est plus relié à une fiche de suivi : il n'y a pas de coordonnées à enregistrer. Rechargez la page, puis voyez avec un administrateur."
