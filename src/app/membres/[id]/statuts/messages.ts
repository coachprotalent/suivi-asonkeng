// Ronde de correction 1 (Task 5) : le message générique d'origine, « Vérifiez les
// informations saisies », s'affichait aussi pour un membre inconnu, un statut
// désactivé, un uuid mal formé ou Supabase injoignable — aucun de ces cas n'est
// corrigeable en retapant le formulaire. Il est désormais réservé à ce qui reste
// réellement inattendu, et les causes compréhensibles par un administrateur ont
// chacune leur message précis ci-dessous.

/** Réservé à l'inattendu : jamais affiché pour une cause que l'administrateur pourrait corriger. */
export const MESSAGE_ECHEC_STATUT =
  "Une erreur inattendue est survenue. Réessayez ; si le problème persiste, contactez un administrateur technique."

export const MESSAGE_MEMBRE_INCONNU =
  "Ce membre est introuvable : sa fiche a peut-être été supprimée entre-temps."

export const MESSAGE_STATUT_INCONNU =
  "Ce statut est inconnu ou a été désactivé. Choisissez-en un autre dans la liste."

export const MESSAGE_STATUT_EXCLUSIF =
  "Ce membre porte déjà un statut du même groupe exclusif, et il n'a pas pu être remplacé automatiquement. Réessayez ; si le problème persiste, retirez l'ancien statut avant d'attribuer le nouveau."
