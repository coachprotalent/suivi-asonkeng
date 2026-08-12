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

  // La règle s'arrête à deux crans : elle ne remonte JAMAIS jusqu'à la racine d'une
  // chaîne profonde. Sans ce test, une implémentation « remonter jusqu'en haut »
  // passerait les trois cas précédents et serait fausse partout ailleurs.
  it('ne remonte pas au-delà de deux crans sur une chaîne profonde', () => {
    expect(dirigeantPropose({ id: 'fdd', faiseurDeDiscipleId: 'arriere-grand-pere' })).toBe(
      'arriere-grand-pere',
    )
  })
})
