import { createHash } from 'node:crypto'
import { tirerChaineLisible } from './tirage'

/**
 * D38 : au moins 16 caractères de ALPHABET_LISIBLE. 20 caractères portent environ
 * 117 bits d'entropie — voir le commentaire de la Task 7 du plan pour le calcul.
 */
export const LONGUEUR_CODE_TOKEN = 20

/** Code en clair d'un token d'inscription, jamais stocké tel quel (D25). */
export function genererCodeInscription(): string {
  return tirerChaineLisible(LONGUEUR_CODE_TOKEN)
}

/**
 * Hachage DÉTERMINISTE (SHA-256 hexadécimal) du code saisi. Ce module utilise
 * `node:crypto`, indisponible dans un bundle navigateur : ce fichier ne doit être
 * importé que depuis du code serveur (Server Actions, tests). Un import accidentel
 * depuis un composant client échouerait bruyamment à la compilation — c'est le
 * comportement voulu, pas une lacune à combler par un `'server-only'` supplémentaire.
 *
 * Déterministe à dessein : `consommer_token_inscription` (migration
 * 20260815150000) retrouve la ligne par une égalité stricte sur `code_hash`. Un
 * hachage salé serait inutilisable ici — voir le commentaire de tête de la Task 7
 * du plan.
 */
export function hacherCodeInscription(code: string): string {
  return createHash('sha256').update(code, 'utf8').digest('hex')
}
