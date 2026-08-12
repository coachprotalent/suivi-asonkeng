import { describe, expect, it } from 'vitest'
import { dirigeantPropose, peutModifier } from './arbre'

describe('dirigeantPropose', () => {
  it("ne propose rien quand le membre n'a pas de faiseur de disciple", () => {
    expect(dirigeantPropose(null)).toBeNull()
  })

  it('propose le faiseur de disciple lui-même quand celui-ci est une racine', () => {
    expect(dirigeantPropose({ id: 'fdd', faiseurDeDiscipleId: null })).toBe('fdd')
  })

  it('propose le faiseur de disciple du faiseur de disciple sur une chaîne plus longue', () => {
    expect(dirigeantPropose({ id: 'fdd', faiseurDeDiscipleId: 'grand-pere' })).toBe('grand-pere')
  })

  // La garantie « la règle s'arrête à deux crans » n'est pas testée ici, elle est TENUE
  // par le TYPE. Un MaillonArbre a id: string et faiseurDeDiscipleId: string (pas un
  // objet imbriqué). Donc la fonction ne voit structurellement jamais plus de deux
  // niveaux. Une implémentation qui « remonterait jusqu'à la racine » serait impossible
  // à écrire sans changer la signature. C'est une garantie plus forte qu'un test.
})

describe('peutModifier', () => {
  const cible = { membreId: 'cible', ancetres: ['parent', 'grand-parent'], dirigeantId: 'chef' }

  it('accorde tout à un administrateur, même sans membre lié', () => {
    expect(peutModifier({ membreLieId: null, estAdmin: true }, cible)).toBe(true)
  })

  it('accorde au faiseur de disciple direct', () => {
    expect(peutModifier({ membreLieId: 'parent', estAdmin: false }, cible)).toBe(true)
  })

  it('accorde à un ancêtre lointain', () => {
    expect(peutModifier({ membreLieId: 'grand-parent', estAdmin: false }, cible)).toBe(true)
  })

  it("accorde au dirigeant désigné, même hors de l'arbre", () => {
    expect(peutModifier({ membreLieId: 'chef', estAdmin: false }, cible)).toBe(true)
  })

  it("refuse à quelqu'un sans aucun lien", () => {
    expect(peutModifier({ membreLieId: 'inconnu', estAdmin: false }, cible)).toBe(false)
  })

  // LE PIÈGE DU COMPTE RACINE : sans le court-circuit sur `null`, ce cas passerait à
  // `true` dès que la cible n'a pas de dirigeant — donc presque toujours.
  it("refuse à un compte sans membre lié qui n'est pas administrateur", () => {
    expect(
      peutModifier({ membreLieId: null, estAdmin: false }, { ...cible, dirigeantId: null }),
    ).toBe(false)
  })

  it("refuse à un compte sans membre lié même quand la liste d'ancêtres est vide", () => {
    expect(
      peutModifier(
        { membreLieId: null, estAdmin: false },
        { membreId: 'cible', ancetres: [], dirigeantId: null },
      ),
    ).toBe(false)
  })

  // Conséquence voulue du §5.1, figée ici pour qu'elle ne soit pas « corrigée » par
  // mégarde : nul n'est son propre ancêtre.
  it('refuse à un utilisateur sur sa propre fiche', () => {
    expect(
      peutModifier(
        { membreLieId: 'cible', estAdmin: false },
        { membreId: 'cible', ancetres: ['parent'], dirigeantId: 'chef' },
      ),
    ).toBe(false)
  })

  it("refuse quand la cible n'a ni ancêtre ni dirigeant", () => {
    expect(
      peutModifier(
        { membreLieId: 'quelquun', estAdmin: false },
        { membreId: 'racine', ancetres: [], dirigeantId: null },
      ),
    ).toBe(false)
  })
})
