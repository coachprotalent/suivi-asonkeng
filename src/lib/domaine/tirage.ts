/**
 * Alphabet sans caractères ambigus à l'oral ou à l'écrit (0/O, 1/l/I) : un code tiré
 * dans cet alphabet se dicte de vive voix ou se recopie à la main sans risque de
 * confusion. Employé pour les mots de passe temporaires (`src/app/comptes/actions.ts`)
 * et, depuis D38, pour les codes d'inscription (`src/lib/domaine/token-inscription.ts`).
 */
export const ALPHABET_LISIBLE = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'

/**
 * Tire une chaîne de `longueur` caractères dans `ALPHABET_LISIBLE`, par rejet
 * d'échantillonnage : sans ce rejet, les premiers caractères de l'alphabet seraient
 * très légèrement plus probables que les derniers (le débordement du dernier bloc
 * complet de `0xffffffff / longueur alphabet` favoriserait les petits restes du
 * modulo). Le biais serait minuscule — il n'y a simplement aucune raison de
 * l'accepter pour un secret.
 */
export function tirerChaineLisible(longueur: number): string {
  const seuil = Math.floor(0xffffffff / ALPHABET_LISIBLE.length) * ALPHABET_LISIBLE.length
  const caracteres: string[] = []
  const tampon = new Uint32Array(1)
  while (caracteres.length < longueur) {
    crypto.getRandomValues(tampon)
    if (tampon[0] < seuil) {
      caracteres.push(ALPHABET_LISIBLE[tampon[0] % ALPHABET_LISIBLE.length])
    }
  }
  return caracteres.join('')
}
