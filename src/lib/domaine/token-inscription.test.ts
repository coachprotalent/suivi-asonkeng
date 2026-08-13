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

  // Le hachage doit être irréversible : le code en clair ne doit apparaître, sous
  // aucune forme reconnaissable, dans son propre hachage. Distinct du test de format
  // ci-dessus (qui prouve seulement que la SORTIE est hexadécimale, pas qu'elle ne
  // contient rien de l'ENTRÉE) : une implémentation bogue qui concatènerait le code à
  // un condensé partiel passerait le test de format sans satisfaire celui-ci.
  it('ne laisse aucun fragment reconnaissable du code en clair dans le hachage', () => {
    const code = genererCodeInscription()
    const hachage = hacherCodeInscription(code)
    expect(hachage).not.toContain(code)
    expect(hachage.toLowerCase()).not.toContain(code.toLowerCase())
  })
})
