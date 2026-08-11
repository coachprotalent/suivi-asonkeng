/** Domaine email interne : les comptes n'ont pas d'adresse réelle (spec §3.2). */
export const DOMAINE_EMAIL_INTERNE = 'asonkeng.local'

/** Doit rester synchronisé avec la contrainte CHECK `profils_identifiant_format`. */
const FORMAT_IDENTIFIANT = /^[a-z][a-z0-9.-]{2,31}$/

export class IdentifiantInvalideError extends Error {
  constructor(raison: string) {
    super(`Identifiant invalide : ${raison}`)
    this.name = 'IdentifiantInvalideError'
  }
}

/**
 * Ramène un identifiant saisi à sa forme canonique : minuscules, sans accents,
 * sans espaces. Lève si le résultat n'est pas un identifiant acceptable.
 */
export function normaliserIdentifiant(brut: string): string {
  const canonique = brut
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, '')
    .toLowerCase()

  if (canonique.length === 0) {
    throw new IdentifiantInvalideError('il est vide')
  }
  if (canonique.length < 3) {
    throw new IdentifiantInvalideError('il doit faire au moins 3 caractères')
  }
  if (canonique.length > 32) {
    throw new IdentifiantInvalideError('il ne doit pas dépasser 32 caractères')
  }
  if (!FORMAT_IDENTIFIANT.test(canonique)) {
    throw new IdentifiantInvalideError(
      'il doit commencer par une lettre et ne contenir que des lettres, chiffres, points ou tirets',
    )
  }

  return canonique
}

/** Traduit un identifiant en adresse interne pour Supabase Auth. */
export function identifiantVersEmail(brut: string): string {
  return `${normaliserIdentifiant(brut)}@${DOMAINE_EMAIL_INTERNE}`
}
