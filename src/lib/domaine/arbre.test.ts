import { describe, expect, it } from 'vitest'
import { dirigeantPropose } from './arbre'

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
