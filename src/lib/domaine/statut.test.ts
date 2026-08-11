import { describe, expect, it } from 'vitest'
import { normaliserDateAcquisition, normaliserNote, StatutInvalideError } from './statut'

describe('normaliserDateAcquisition', () => {
  it('accepte une date au format du formulaire', () => {
    expect(normaliserDateAcquisition('2025-03-12')).toBe('2025-03-12')
  })

  it('traite une valeur absente comme non renseignée', () => {
    expect(normaliserDateAcquisition(null)).toBeNull()
    expect(normaliserDateAcquisition(undefined)).toBeNull()
    expect(normaliserDateAcquisition('')).toBeNull()
    expect(normaliserDateAcquisition('   ')).toBeNull()
  })

  it('refuse une date mal formée', () => {
    expect(() => normaliserDateAcquisition('12/03/2025')).toThrow(StatutInvalideError)
    expect(() => normaliserDateAcquisition('2025-3-12')).toThrow(StatutInvalideError)
    expect(() => normaliserDateAcquisition('hier')).toThrow(StatutInvalideError)
  })

  it('refuse une date inexistante au calendrier', () => {
    expect(() => normaliserDateAcquisition('2025-02-30')).toThrow(StatutInvalideError)
    expect(() => normaliserDateAcquisition('2025-13-01')).toThrow(StatutInvalideError)
  })

  it('refuse une date dans le futur', () => {
    const demain = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
    expect(() => normaliserDateAcquisition(demain)).toThrow(StatutInvalideError)
  })

  it("accepte aujourd'hui", () => {
    const aujourdhui = new Date().toISOString().slice(0, 10)
    expect(normaliserDateAcquisition(aujourdhui)).toBe(aujourdhui)
  })

  it(`refuse une valeur qui n'est pas du texte plutôt que de la perdre`, () => {
    expect(() => normaliserDateAcquisition(20250312)).toThrow(StatutInvalideError)
  })
})

describe('normaliserNote', () => {
  it('retire les espaces superflus', () => {
    expect(normaliserNote('  Baptisé à Yaoundé  ')).toBe('Baptisé à Yaoundé')
  })

  it('traite une note vide comme absente', () => {
    expect(normaliserNote('')).toBeNull()
    expect(normaliserNote('   ')).toBeNull()
    expect(normaliserNote(null)).toBeNull()
  })

  it(`refuse une valeur qui n'est pas du texte`, () => {
    expect(() => normaliserNote(42)).toThrow(StatutInvalideError)
  })

  it('refuse une note démesurée', () => {
    expect(() => normaliserNote('x'.repeat(501))).toThrow(StatutInvalideError)
  })
})
