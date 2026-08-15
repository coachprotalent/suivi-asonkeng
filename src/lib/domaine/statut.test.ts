import { describe, expect, it } from 'vitest'
import {
  lignesStatutsDepuisFormData,
  normaliserDateAcquisition,
  normaliserNote,
  statutsIncompatibles,
  StatutInvalideError,
} from './statut'

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

  it("refuse une valeur qui n'est pas du texte plutôt que de la perdre", () => {
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

  it("refuse une valeur qui n'est pas du texte", () => {
    expect(() => normaliserNote(42)).toThrow(StatutInvalideError)
  })

  it('refuse une note démesurée', () => {
    expect(() => normaliserNote('x'.repeat(501))).toThrow(StatutInvalideError)
  })
})

describe('statutsIncompatibles', () => {
  const catalogue = [
    {
      id: 'g-exclusif',
      nom: 'Situation spirituelle',
      exclusif: true,
      statuts: [
        { id: 's-non-croyant', libelle: 'Non-croyant' },
        { id: 's-repenti', libelle: 'Repenti' },
      ],
    },
    {
      id: 'g-cumulable',
      nom: 'Engagements',
      exclusif: false,
      statuts: [
        { id: 's-choriste', libelle: 'Choriste' },
        { id: 's-intercesseur', libelle: 'Intercesseur' },
      ],
    },
  ]

  it('nomme LES DEUX statuts quand ils appartiennent au même groupe exclusif', () => {
    const couple = statutsIncompatibles(['s-non-croyant', 's-repenti'], catalogue)
    expect(couple).not.toBeNull()
    expect(couple?.groupe).toBe('Situation spirituelle')
    // Les DEUX libellés, pas seulement un : sans les deux, l'utilisateur ne sait pas
    // lequel retirer.
    expect([couple?.premier, couple?.second].sort()).toEqual(['Non-croyant', 'Repenti'])
  })

  it('accepte deux statuts du même groupe NON exclusif', () => {
    expect(statutsIncompatibles(['s-choriste', 's-intercesseur'], catalogue)).toBeNull()
  })

  it('accepte un statut de chaque groupe', () => {
    expect(statutsIncompatibles(['s-repenti', 's-choriste'], catalogue)).toBeNull()
  })

  it('accepte une sélection vide', () => {
    expect(statutsIncompatibles([], catalogue)).toBeNull()
  })

  it("ne prend pas un doublon du MÊME statut pour un couple exclusif", () => {
    expect(statutsIncompatibles(['s-repenti', 's-repenti'], catalogue)).toBeNull()
  })

  // ÉCHEC FERMÉ — le cœur de cette fonction. Un catalogue tronqué ne doit JAMAIS se lire
  // comme « aucun conflit ».
  it('REFUSE, et ne rend pas null, un statut absent du catalogue fourni', () => {
    expect(() => statutsIncompatibles(['s-inconnu'], catalogue)).toThrow(StatutInvalideError)
  })

  it('refuse aussi quand le statut absent accompagne des statuts connus', () => {
    expect(() => statutsIncompatibles(['s-choriste', 's-inconnu'], catalogue)).toThrow(
      StatutInvalideError,
    )
  })

  // CONTRÔLE POSITIF DE L'ÉCHEC FERMÉ : sans lui, les deux refus ci-dessus seraient
  // satisfaits par une fonction qui lèverait sur TOUT, y compris une sélection valide.
  it('ne lève pas sur une sélection entièrement présente au catalogue', () => {
    expect(() => statutsIncompatibles(['s-choriste'], catalogue)).not.toThrow()
  })
})

describe('lignesStatutsDepuisFormData', () => {
  function formulaire(
    lignes: Array<{ statutId: string; date: string; note: string }>,
  ): FormData {
    const donnees = new FormData()
    for (const ligne of lignes) {
      donnees.append('statutId', ligne.statutId)
      donnees.append('statutDateAcquisition', ligne.date)
      donnees.append('statutNote', ligne.note)
    }
    return donnees
  }

  it("rend une liste vide quand aucune ligne n'est soumise", () => {
    expect(lignesStatutsDepuisFormData(new FormData())).toEqual([])
  })

  it("lit deux lignes en gardant l'alignement date/note avec leur statut", () => {
    const lignes = lignesStatutsDepuisFormData(
      formulaire([
        { statutId: 'a', date: '2020-01-02', note: 'note-a' },
        { statutId: 'b', date: '', note: '' },
      ]),
    )
    expect(lignes).toEqual([
      { statutId: 'a', dateAcquisition: '2020-01-02', note: 'note-a' },
      { statutId: 'b', dateAcquisition: null, note: null },
    ])
  })

  it("REFUSE une ligne sans statut choisi plutôt que de l'ignorer", () => {
    expect(() =>
      lignesStatutsDepuisFormData(formulaire([{ statutId: '', date: '2020-01-02', note: 'perdue' }])),
    ).toThrow(StatutInvalideError)
  })

  it('REFUSE un décalage entre les trois champs répétés', () => {
    const donnees = new FormData()
    donnees.append('statutId', 'a')
    donnees.append('statutId', 'b')
    donnees.append('statutDateAcquisition', '')
    donnees.append('statutNote', '')
    expect(() => lignesStatutsDepuisFormData(donnees)).toThrow(StatutInvalideError)
  })

  it("relaie le refus de date d'acquisition future de normaliserDateAcquisition", () => {
    expect(() =>
      lignesStatutsDepuisFormData(formulaire([{ statutId: 'a', date: '2999-01-01', note: '' }])),
    ).toThrow(StatutInvalideError)
  })
})
