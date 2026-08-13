export const MESSAGE_ECHEC_ANNULATION = "Cette demande n'a pas pu être annulée."
export const MESSAGE_ECHEC_VALIDATION = "La demande n'a pas pu être validée."
export const MESSAGE_ECHEC_RATTACHEMENT = "Le rattachement n'a pas pu être enregistré."
export const MESSAGE_MEMBRE_INCONNU = "La fiche choisie pour le rattachement n'existe plus."
export const MESSAGE_MOTIF_OBLIGATOIRE = 'Un motif est obligatoire pour rejeter une demande.'
export const MESSAGE_ECHEC_REJET = "La demande n'a pas pu être rejetée."

// Les trois marqueurs suivants sont posés par valider_demande_rattachement
// (migration 20260815230000/260000) via `using detail`. Chacun reçoit son PROPRE
// message, distinct des trois autres : un texte générique commun les rendrait
// indiscernables à l'écran, alors que le diagnostic (et le geste correctif
// attendu de l'administrateur) diffère dans chaque cas.
export const MESSAGE_RATTACHEMENT_VERS_FICHE_JETABLE =
  'Ce rattachement ne peut pas cibler la fiche créée par cette demande elle-même.'
export const MESSAGE_MEMBRE_DEJA_RATTACHE = 'Cette fiche est déjà rattachée à un autre compte.'
export const MESSAGE_DEMANDE_NON_VALIDABLE = 'Cette demande ne peut plus être validée par rattachement.'
