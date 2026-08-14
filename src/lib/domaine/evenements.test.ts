import { describe, expect, it } from 'vitest'
import {
  champManquantConversion,
  champsRequisConversion,
  estATraiter,
  motifClassementValide,
  periodeValide,
  type CheminConversion,
} from './evenements'

describe('periodeValide', () => {
  it('accepte une date de fin absente : un événement d un seul jour est le cas courant', () => {
    expect(periodeValide('2026-09-01', null)).toBeNull()
    expect(periodeValide('2026-09-01', '')).toBeNull()
    expect(periodeValide('2026-09-01', '   ')).toBeNull()
  })

  it('accepte une date de fin postérieure ou égale', () => {
    expect(periodeValide('2026-09-01', '2026-09-10')).toBeNull()
    expect(periodeValide('2026-09-01', '2026-09-01')).toBeNull()
  })

  it('refuse une date de fin antérieure', () => {
    expect(periodeValide('2026-09-10', '2026-09-01')).toBe('periode_incoherente')
  })

  it('refuse une date de début absente, et le distingue de la période incohérente', () => {
    expect(periodeValide(null, '2026-09-01')).toBe('date_debut_manquante')
    expect(periodeValide('   ', null)).toBe('date_debut_manquante')
  })

  it("compare des chaînes AAAA-MM-JJ, jamais des Date : le changement d'année et de mois est ordonné correctement", () => {
    // Contrôle qui attraperait un passage par `new Date(...)` mal fait autant qu'une
    // comparaison naïve sur des dates au format français.
    expect(periodeValide('2026-12-31', '2027-01-01')).toBeNull()
    expect(periodeValide('2027-01-01', '2026-12-31')).toBe('periode_incoherente')
    expect(periodeValide('2026-09-09', '2026-09-10')).toBeNull()
  })
})

describe('estATraiter', () => {
  it('est vrai pour un désir exprimé, ni converti ni classé', () => {
    expect(
      estATraiter({ desirSuiviSpirituel: true, convertiEnMembreId: null, classeLe: null }),
    ).toBe(true)
  })

  it('est faux sans désir exprimé — CONTRÔLE POSITIF de la ligne précédente', () => {
    expect(
      estATraiter({ desirSuiviSpirituel: false, convertiEnMembreId: null, classeLe: null }),
    ).toBe(false)
  })

  it('est faux une fois converti (D69), et faux une fois classé (D61) : les deux seules sorties', () => {
    expect(
      estATraiter({ desirSuiviSpirituel: true, convertiEnMembreId: 'un-id', classeLe: null }),
    ).toBe(false)
    expect(
      estATraiter({ desirSuiviSpirituel: true, convertiEnMembreId: null, classeLe: '2026-09-01T00:00:00Z' }),
    ).toBe(false)
  })

  it('est faux quand les deux sont posés : D62 les laisse coexister, la liste les exclut quand même', () => {
    expect(
      estATraiter({ desirSuiviSpirituel: true, convertiEnMembreId: 'un-id', classeLe: '2026-09-01T00:00:00Z' }),
    ).toBe(false)
  })
})

describe('motifClassementValide', () => {
  it('refuse le vide, le null et les espaces seuls', () => {
    expect(motifClassementValide(null)).toBe(false)
    expect(motifClassementValide('')).toBe(false)
    expect(motifClassementValide('   ')).toBe(false)
  })

  it('accepte un motif réel — CONTRÔLE POSITIF', () => {
    expect(motifClassementValide('Injoignable')).toBe(true)
    expect(motifClassementValide('  Injoignable  ')).toBe(true)
  })
})

describe('champsRequisConversion et champManquantConversion', () => {
  it('exige nom et prénom pour le chemin 1, sans faiseur de disciple', () => {
    expect(champsRequisConversion('fiche_en_attente')).toEqual(['nom', 'prenom'])
  })

  it("exige le faiseur de disciple pour le chemin 2 — sans lui, la fiche naîtrait ACTIVE et DÉTACHÉE, sans le moindre signal", () => {
    expect(champsRequisConversion('fiche_active')).toEqual(['nom', 'prenom', 'faiseur'])
    expect(
      champManquantConversion('fiche_active', { nom: 'Mbarga', prenom: 'Alice', faiseur: null }),
    ).toBe('faiseur')
  })

  it("n'exige que la fiche cible pour le chemin 3 : le nom de la fiche existante ne doit surtout pas être écrasé", () => {
    expect(champsRequisConversion('membre_existant')).toEqual(['membreCible'])
    expect(champManquantConversion('membre_existant', { membreCible: 'un-id' })).toBeNull()
    expect(champManquantConversion('membre_existant', { nom: 'Mbarga', prenom: 'Alice' })).toBe(
      'membreCible',
    )
  })

  it('rend null quand tout est là — CONTRÔLE POSITIF des trois assertions négatives ci-dessus', () => {
    expect(champManquantConversion('fiche_en_attente', { nom: 'Mbarga', prenom: 'Alice' })).toBeNull()
    expect(
      champManquantConversion('fiche_active', { nom: 'Mbarga', prenom: 'Alice', faiseur: 'un-id' }),
    ).toBeNull()
  })

  it('rend le PREMIER manquant, dans l ordre des champs à l écran', () => {
    expect(champManquantConversion('fiche_active', {})).toBe('nom')
    expect(champManquantConversion('fiche_active', { nom: 'Mbarga' })).toBe('prenom')
  })

  it('refuse un chemin inconnu : le champ arrive d un select, donc d une soumission falsifiable', () => {
    expect(champManquantConversion('autre_chose' as CheminConversion, {})).toBe('chemin')
  })

  it('traite les espaces seuls comme un champ manquant', () => {
    expect(champManquantConversion('fiche_en_attente', { nom: '   ', prenom: 'Alice' })).toBe('nom')
  })
})
