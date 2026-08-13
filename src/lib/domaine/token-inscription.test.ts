import { describe, expect, it } from 'vitest'
import { ALPHABET_LISIBLE } from './tirage'
import { LONGUEUR_CODE_TOKEN, genererCodeInscription, hacherCodeInscription } from './token-inscription'

describe('genererCodeInscription', () => {
  it("D38 : rend un code d'au moins 16 caractères", () => {
    expect(LONGUEUR_CODE_TOKEN).toBeGreaterThanOrEqual(16)
    expect(genererCodeInscription()).toHaveLength(LONGUEUR_CODE_TOKEN)
  })

  it('ne rend que des caractères de ALPHABET_LISIBLE (D38)', () => {
    const code = genererCodeInscription()
    for (const caractere of code) {
      expect(ALPHABET_LISIBLE).toContain(caractere)
    }
  })

  it('produit des codes différents à deux appels successifs', () => {
    expect(genererCodeInscription()).not.toBe(genererCodeInscription())
  })
})

describe('hacherCodeInscription', () => {
  it('est déterministe : le même code produit toujours le même hachage', () => {
    const code = genererCodeInscription()
    expect(hacherCodeInscription(code)).toBe(hacherCodeInscription(code))
  })

  it('rend des hachages différents pour deux codes différents', () => {
    expect(hacherCodeInscription('CodeUnPourLeTest2026')).not.toBe(
      hacherCodeInscription('CodeDeuxPourLeTest26'),
    )
  })

  it('rend un hachage hexadécimal SHA-256 (64 caractères, [0-9a-f])', () => {
    const hachage = hacherCodeInscription('CodeDeTestPourLeHachage')
    expect(hachage).toHaveLength(64)
    expect(hachage).toMatch(/^[0-9a-f]{64}$/)
  })

  // CONTRÔLE POSITIF distinct du test de déterminisme : deux CASSES différentes
  // d'un même code ne sont PAS le même code. Sans ce test, une implémentation qui
  // normaliserait la casse avant de hacher passerait le test de déterminisme tout
  // en introduisant une collision que le design n'a jamais demandée.
  it('ne normalise PAS la casse : deux codes de casse différente hachent différemment', () => {
    expect(hacherCodeInscription('abcdef')).not.toBe(hacherCodeInscription('ABCDEF'))
  })

  // VECTEUR TÉMOIN : la valeur attendue ci-dessous n'a JAMAIS été obtenue en
  // appelant hacherCodeInscription (ce serait circulaire — la fonction ne
  // prouverait plus que « la fonction fait ce qu'elle fait »). Elle a été
  // calculée par un chemin indépendant :
  //   node -e "console.log(require('crypto').createHash('sha256').update('CodeTemoinSha256Fixe2026Xy','utf8').digest('hex'))"
  // et recoupée avec `printf '%s' 'CodeTemoinSha256Fixe2026Xy' | openssl dgst -sha256`.
  // Ce vecteur épingle l'algorithme ENTIER (SHA-256, encodage UTF-8 de l'entrée,
  // encodage hexadécimal de la sortie) : toute fuite par encodage, tout
  // changement silencieux d'algorithme le ferait tomber immédiatement — ce
  // qu'aucun test à entrée générée aléatoirement ne peut garantir.
  it('hache une entrée fixe vers la valeur SHA-256 attendue, calculée hors implémentation', () => {
    expect(hacherCodeInscription('CodeTemoinSha256Fixe2026Xy')).toBe(
      'ede42a3a2b7099d5543ba769f353fe893c3cb1d9b2b2c30e49681274287ca159',
    )
  })
})
