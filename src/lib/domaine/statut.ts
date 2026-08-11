const FORMAT_DATE = /^\d{4}-\d{2}-\d{2}$/
const LONGUEUR_NOTE_MAXIMALE = 500

export class StatutInvalideError extends Error {
  constructor(raison: string) {
    super(raison)
    this.name = 'StatutInvalideError'
  }
}

function texteOuNull(brut: unknown, champ: string): string | null {
  if (brut === null || brut === undefined) return null
  if (typeof brut !== 'string') {
    throw new StatutInvalideError(`Le champ « ${champ} » a reçu une valeur inattendue.`)
  }
  const nettoye = brut.trim()
  return nettoye.length === 0 ? null : nettoye
}

/**
 * Date d'acquisition au format `AAAA-MM-JJ`, ou `null` si non renseignée.
 *
 * Une date future est refusée : un statut se constate, il ne se planifie pas.
 * Une date inexistante au calendrier l'est aussi — `2025-02-30` passerait une
 * simple vérification de forme et deviendrait une autre date en base.
 */
export function normaliserDateAcquisition(brut: unknown): string | null {
  const valeur = texteOuNull(brut, "date d'acquisition")
  if (valeur === null) return null

  if (!FORMAT_DATE.test(valeur)) {
    throw new StatutInvalideError("La date doit être au format AAAA-MM-JJ.")
  }

  const [annee, mois, jour] = valeur.split('-').map(Number)
  const date = new Date(Date.UTC(annee, mois - 1, jour))
  const existe =
    date.getUTCFullYear() === annee && date.getUTCMonth() === mois - 1 && date.getUTCDate() === jour
  if (!existe) {
    throw new StatutInvalideError("Cette date n'existe pas au calendrier.")
  }

  const aujourdhui = new Date().toISOString().slice(0, 10)
  if (valeur > aujourdhui) {
    throw new StatutInvalideError("La date d'acquisition ne peut pas être dans le futur.")
  }

  return valeur
}

/** Note libre accompagnant un statut, ou `null`. */
export function normaliserNote(brut: unknown): string | null {
  const valeur = texteOuNull(brut, 'note')
  if (valeur !== null && valeur.length > LONGUEUR_NOTE_MAXIMALE) {
    throw new StatutInvalideError(
      `La note ne doit pas dépasser ${LONGUEUR_NOTE_MAXIMALE} caractères.`,
    )
  }
  return valeur
}
