const FORMAT_DATE_SEULE = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'short',
  // `date_acquisition` est une colonne Postgres `date`, sans heure ni fuseau,
  // sérialisée par PostgREST en `AAAA-MM-JJ`. `new Date("2026-01-15")` est interprété
  // comme minuit UTC : sans ce forçage, un formatage dans un fuseau situé à l'ouest de
  // Greenwich afficherait le 14 janvier au lieu du 15 — une date lisible mais fausse.
  timeZone: 'UTC',
})

// Exposé uniquement pour verrouiller l'invariant ci-dessus en test (voir date.test.ts) :
// le fuseau effectivement retenu par le formateur de dates seules, tel que résolu par
// Intl. On n'expose pas le formateur lui-même — cette seule valeur suffit à prouver
// l'épinglage, sans donner accès à autre chose.
export const fuseauDateSeule = FORMAT_DATE_SEULE.resolvedOptions().timeZone

const FORMAT_DATE_HEURE = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'short',
  timeStyle: 'short',
})

/**
 * Formate une date seule (`AAAA-MM-JJ`, colonne Postgres `date`) en date lisible en
 * français. Ne pas utiliser pour un horodatage réel : voir `formaterDateHeure`.
 */
export function formaterDateSeule(dateIso: string): string {
  return FORMAT_DATE_SEULE.format(new Date(dateIso))
}

/**
 * Formate un horodatage réel (`timestamptz`, un instant précis) dans le fuseau local.
 * Contrairement à `formaterDateSeule`, aucun forçage de fuseau : c'est voulu, l'instant
 * doit se lire dans le fuseau où il est consulté.
 */
export function formaterDateHeure(instant: string | Date): string {
  return FORMAT_DATE_HEURE.format(new Date(instant))
}
