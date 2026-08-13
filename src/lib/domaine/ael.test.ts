import { describe, expect, it } from 'vitest'
import {
  calculerOccurrences,
  compteurAel,
  HORIZON_GENERATION_SEMAINES,
  seanceEstComplete,
  type CalendrierRecurrent,
  type JourSemaine,
} from './ael'

// Convertit une date ISO en jour de semaine, convention du projet (1 = lundi ... 7 =
// dimanche, spec §4.5). Systématiquement CALCULÉ dans les tests ci-dessous, jamais
// mémorisé : aucune assertion ne dépend de savoir quel jour réel tombe une date donnée.
function jourIsoDe(dateIso: string): JourSemaine {
  const jourJs = new Date(`${dateIso}T00:00:00Z`).getUTCDay()
  return (jourJs === 0 ? 7 : jourJs) as JourSemaine
}

describe('calculerOccurrences', () => {
  it("inclut la première ET la dernière semaine de l'horizon", () => {
    const aPartirDe = '2026-08-18'
    const calendrier: CalendrierRecurrent = { jourSemaine: jourIsoDe(aPartirDe), actif: true }
    expect(calculerOccurrences(calendrier, aPartirDe, 1)).toEqual([aPartirDe, '2026-08-25'])
  })

  it('un calendrier inactif ne produit aucune occurrence', () => {
    const calendrier: CalendrierRecurrent = { jourSemaine: jourIsoDe('2026-08-18'), actif: false }
    expect(calculerOccurrences(calendrier, '2026-08-18', 8)).toEqual([])
  })

  it('deux calendriers de jours différents ne se mélangent pas', () => {
    const aPartirDe = '2026-08-18'
    const jourA = jourIsoDe(aPartirDe)
    const jourB = ((jourA % 7) + 1) as JourSemaine // jour suivant, structurellement distinct
    const occurrencesA = calculerOccurrences({ jourSemaine: jourA, actif: true }, aPartirDe, 3)
    const occurrencesB = calculerOccurrences({ jourSemaine: jourB, actif: true }, aPartirDe, 3)
    expect(occurrencesA.length).toBeGreaterThan(0)
    expect(occurrencesB.length).toBeGreaterThan(0)
    for (const date of occurrencesA) {
      expect(occurrencesB).not.toContain(date)
    }
  })

  it("calcule le bon nombre d'occurrences sur l'horizon de D40 (8 semaines)", () => {
    const aPartirDe = '2026-08-18'
    const calendrier: CalendrierRecurrent = { jourSemaine: jourIsoDe(aPartirDe), actif: true }
    const occurrences = calculerOccurrences(calendrier, aPartirDe, HORIZON_GENERATION_SEMAINES)
    // Bornes incluses (voir le premier test) : HORIZON+1 occurrences, la première et la
    // dernière valant respectivement `aPartirDe` et `aPartirDe + HORIZON*7 jours`.
    expect(occurrences).toHaveLength(HORIZON_GENERATION_SEMAINES + 1)
    expect(occurrences[0]).toBe(aPartirDe)
    expect(occurrences[occurrences.length - 1]).toBe('2026-10-13')
  })

  it('ne produit aucune occurrence avant la borne de départ', () => {
    const aPartirDe = '2026-08-18'
    const calendrier: CalendrierRecurrent = { jourSemaine: jourIsoDe(aPartirDe), actif: true }
    const occurrences = calculerOccurrences(calendrier, aPartirDe, 4)
    for (const date of occurrences) {
      expect(date >= aPartirDe).toBe(true)
    }
  })
})

describe('compteurAel', () => {
  it('additionne le report initial et les présences aux séances tenues', () => {
    expect(compteurAel(5, 3)).toBe(8)
  })

  it('un report initial sans aucune présence reste inchangé', () => {
    expect(compteurAel(12, 0)).toBe(12)
  })

  it('aucun report, seulement des présences', () => {
    expect(compteurAel(0, 4)).toBe(4)
  })
})

describe('seanceEstComplete', () => {
  it('signale le thème manquant en priorité', () => {
    expect(
      seanceEstComplete({ theme: null, enseignantMembreId: 'x', enseignantLibre: null }),
    ).toBe('theme')
  })

  it('signale un thème réduit à des espaces comme manquant', () => {
    expect(
      seanceEstComplete({ theme: '   ', enseignantMembreId: 'x', enseignantLibre: null }),
    ).toBe('theme')
  })

  it("signale l'enseignant manquant quand le thème est présent", () => {
    expect(
      seanceEstComplete({ theme: 'Un thème', enseignantMembreId: null, enseignantLibre: null }),
    ).toBe('enseignant')
  })

  it('accepte un enseignant membre sans enseignant libre', () => {
    expect(
      seanceEstComplete({ theme: 'Un thème', enseignantMembreId: 'x', enseignantLibre: null }),
    ).toBeNull()
  })

  it('accepte un enseignant libre sans enseignant membre', () => {
    expect(
      seanceEstComplete({
        theme: 'Un thème',
        enseignantMembreId: null,
        enseignantLibre: 'Un intervenant',
      }),
    ).toBeNull()
  })
})
