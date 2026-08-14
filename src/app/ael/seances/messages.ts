export const MESSAGE_ECHEC_GENERATION = 'La génération des séances a échoué.'
export const MESSAGE_ECHEC_CREATION_MANUELLE = "La séance n'a pas pu être créée."
export const MESSAGE_DATE_OBLIGATOIRE = 'La date est obligatoire.'
export const MESSAGE_ANTENNE_MANQUANTE = 'Choisissez au moins une antenne.'
// I6 de la revue finale de branche. Mêmes textes que ceux de ses deux sœurs
// (`src/app/ael/calendriers/messages.ts`, `src/app/antennes/[id]/messages.ts`) au geste
// près : c'est le même refus, sur le même scénario (un onglet resté ouvert sur une liste
// devenue périmée), et deux formulations différentes pour une seule règle feraient croire
// à deux règles.
export const MESSAGE_ANTENNE_INCONNUE = "Cette antenne n'existe plus."
export const MESSAGE_ANTENNE_INACTIVE =
  "Cette antenne est désactivée : aucune nouvelle séance n'y est autorisée."
