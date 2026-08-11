import { describe, expect, it } from 'vitest'
import {
  DOMAINE_EMAIL_INTERNE,
  IdentifiantInvalideError,
  identifiantVersEmail,
  normaliserIdentifiant,
} from './identifiant'

describe('normaliserIdentifiant', () => {
  it('met en minuscules', () => {
    expect(normaliserIdentifiant('JDupont')).toBe('jdupont')
  })

  it('retire les espaces de début et de fin', () => {
    expect(normaliserIdentifiant('  jdupont  ')).toBe('jdupont')
  })

  it('retire les espaces internes', () => {
    expect(normaliserIdentifiant('jean dupont')).toBe('jeandupont')
  })

  it('retire les accents', () => {
    expect(normaliserIdentifiant('Jérôme')).toBe('jerome')
    expect(normaliserIdentifiant('Nguém')).toBe('nguem')
  })

  it('accepte le point et le tiret', () => {
    expect(normaliserIdentifiant('jean-marc.dupont')).toBe('jean-marc.dupont')
  })

  it('accepte les chiffres après la première lettre', () => {
    expect(normaliserIdentifiant('jdupont2')).toBe('jdupont2')
  })

  it('refuse une chaîne vide', () => {
    expect(() => normaliserIdentifiant('')).toThrow(IdentifiantInvalideError)
  })

  it('refuse moins de trois caractères', () => {
    expect(() => normaliserIdentifiant('ab')).toThrow(IdentifiantInvalideError)
  })

  it('refuse plus de trente-deux caractères', () => {
    expect(() => normaliserIdentifiant('a'.repeat(33))).toThrow(IdentifiantInvalideError)
  })

  it('refuse un identifiant ne commençant pas par une lettre', () => {
    expect(() => normaliserIdentifiant('1jdupont')).toThrow(IdentifiantInvalideError)
    expect(() => normaliserIdentifiant('.jdupont')).toThrow(IdentifiantInvalideError)
  })

  it('refuse les caractères interdits', () => {
    expect(() => normaliserIdentifiant('j@dupont')).toThrow(IdentifiantInvalideError)
    expect(() => normaliserIdentifiant('jdupont/admin')).toThrow(IdentifiantInvalideError)
    expect(() => normaliserIdentifiant("j'dupont")).toThrow(IdentifiantInvalideError)
  })

  it('est idempotente', () => {
    const une = normaliserIdentifiant('  Jérôme NGUÉM ')
    expect(normaliserIdentifiant(une)).toBe(une)
  })
})

describe('identifiantVersEmail', () => {
  it('suffixe avec le domaine interne', () => {
    expect(identifiantVersEmail('jdupont')).toBe(`jdupont@${DOMAINE_EMAIL_INTERNE}`)
  })

  it('normalise avant de suffixer', () => {
    expect(identifiantVersEmail('  JDupont ')).toBe(`jdupont@${DOMAINE_EMAIL_INTERNE}`)
  })

  it('propage l\'erreur de validation', () => {
    expect(() => identifiantVersEmail('ab')).toThrow(IdentifiantInvalideError)
  })
})
