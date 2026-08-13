import { describe, expect, it } from 'vitest'
import { ALPHABET_LISIBLE, tirerChaineLisible } from './tirage'

describe('ALPHABET_LISIBLE', () => {
  it('ne contient aucun des caractères ambigus 0, O, 1, l, I', () => {
    for (const caractere of ['0', 'O', '1', 'l', 'I']) {
      expect(ALPHABET_LISIBLE).not.toContain(caractere)
    }
  })

  // CONTRÔLE POSITIF : sans lui, un alphabet VIDE satisferait aussi le test
  // ci-dessus, sans rien prouver sur son contenu réel.
  it("contient bien des lettres et des chiffres ordinaires", () => {
    expect(ALPHABET_LISIBLE).toContain('A')
    expect(ALPHABET_LISIBLE).toContain('a')
    expect(ALPHABET_LISIBLE).toContain('2')
    expect(ALPHABET_LISIBLE.length).toBeGreaterThan(20)
  })
})

describe('tirerChaineLisible', () => {
  it('rend une chaîne de la longueur demandée', () => {
    expect(tirerChaineLisible(14)).toHaveLength(14)
    expect(tirerChaineLisible(20)).toHaveLength(20)
  })

  it("ne rend que des caractères appartenant à ALPHABET_LISIBLE", () => {
    const chaine = tirerChaineLisible(200)
    for (const caractere of chaine) {
      expect(ALPHABET_LISIBLE).toContain(caractere)
    }
  })

  // Preuve que le tirage est réellement ALÉATOIRE et non une valeur figée : une
  // implémentation qui renverrait toujours le même caractère passerait le test de
  // longueur et le test d'appartenance à l'alphabet, sans être un tirage.
  it('produit des chaînes différentes à deux appels successifs', () => {
    const a = tirerChaineLisible(20)
    const b = tirerChaineLisible(20)
    expect(a).not.toBe(b)
  })
})
