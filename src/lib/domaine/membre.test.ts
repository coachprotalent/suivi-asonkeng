import { describe, expect, it } from 'vitest'
import {
  FicheMembreInvalideError,
  LIBELLE_FICHE_NON_CONSULTABLE,
  libelleFiche,
  normaliserFicheMembre,
} from './membre'

const minimal = { nom: 'Nguem', prenom: 'Jérôme', reportInitialAel: 0 }

describe('normaliserFicheMembre', () => {
  it('conserve les accents du nom et du prénom', () => {
    const fiche = normaliserFicheMembre(minimal)
    expect(fiche.nom).toBe('Nguem')
    expect(fiche.prenom).toBe('Jérôme')
  })

  it('retire les espaces superflus', () => {
    const fiche = normaliserFicheMembre({ ...minimal, nom: '  Nguem  ', prenom: ' Jérôme ' })
    expect(fiche.nom).toBe('Nguem')
    expect(fiche.prenom).toBe('Jérôme')
  })

  it('ramène une chaîne vide à null pour les champs optionnels', () => {
    const fiche = normaliserFicheMembre({ ...minimal, ville: '   ', telephone: '' })
    expect(fiche.ville).toBeNull()
    expect(fiche.telephone).toBeNull()
  })

  it('refuse un nom vide', () => {
    expect(() => normaliserFicheMembre({ ...minimal, nom: '   ' })).toThrow(FicheMembreInvalideError)
  })

  it('refuse un prénom vide', () => {
    expect(() => normaliserFicheMembre({ ...minimal, prenom: '' })).toThrow(FicheMembreInvalideError)
  })

  it('accepte les trois situations prévues', () => {
    for (const situation of ['etudiant', 'travailleur', 'autre'] as const) {
      expect(normaliserFicheMembre({ ...minimal, situation }).situation).toBe(situation)
    }
  })

  it('refuse une situation inconnue', () => {
    expect(() => normaliserFicheMembre({ ...minimal, situation: 'retraite' })).toThrow(
      FicheMembreInvalideError,
    )
  })

  it('accepte une situation absente', () => {
    expect(normaliserFicheMembre(minimal).situation).toBeNull()
  })

  it('refuse un report initial négatif', () => {
    expect(() => normaliserFicheMembre({ ...minimal, reportInitialAel: -1 })).toThrow(
      FicheMembreInvalideError,
    )
  })

  it('refuse un report initial non entier', () => {
    expect(() => normaliserFicheMembre({ ...minimal, reportInitialAel: 2.5 })).toThrow(
      FicheMembreInvalideError,
    )
  })

  it('accepte un report initial absent et le ramène à zéro', () => {
    const { reportInitialAel } = normaliserFicheMembre({ nom: 'Nguem', prenom: 'Jérôme' })
    expect(reportInitialAel).toBe(0)
  })

  it('refuse un email de contact manifestement invalide', () => {
    expect(() => normaliserFicheMembre({ ...minimal, emailContact: 'pas-un-email' })).toThrow(
      FicheMembreInvalideError,
    )
  })

  it('accepte un email de contact valide', () => {
    const fiche = normaliserFicheMembre({ ...minimal, emailContact: 'jerome@example.com' })
    expect(fiche.emailContact).toBe('jerome@example.com')
  })

  it('met le domaine d\'étude à null quand la situation n\'est pas étudiant', () => {
    const fiche = normaliserFicheMembre({
      ...minimal,
      situation: 'travailleur',
      domaineEtude: 'Informatique',
    })
    expect(fiche.domaineEtude).toBeNull()
  })

  it('conserve le domaine d\'étude pour un étudiant', () => {
    const fiche = normaliserFicheMembre({
      ...minimal,
      situation: 'etudiant',
      domaineEtude: 'Informatique',
    })
    expect(fiche.domaineEtude).toBe('Informatique')
  })

  it('efface le domaine d\'étude quand la situation est absente', () => {
    const fiche = normaliserFicheMembre({ ...minimal, domaineEtude: 'Informatique' })
    expect(fiche.domaineEtude).toBeNull()
  })
})

// Ces tests couvrent le chemin réellement emprunté en production. Les données
// viennent d'un formulaire HTML : `FormData` ne rend que des chaînes, jamais des
// nombres. Sans eux, la conversion pourrait être cassée ou supprimée sans que la
// suite s'en aperçoive, et la fonction serait juste sous test et fausse en vrai.
describe('normaliserFicheMembre - valeurs telles que les rend un formulaire', () => {
  const minimal = { nom: 'Nguem', prenom: 'Jérôme', reportInitialAel: 0 }

  it('accepte un report initial donné sous forme de chaîne', () => {
    expect(normaliserFicheMembre({ ...minimal, reportInitialAel: '5' }).reportInitialAel).toBe(5)
  })

  it('traite un report initial vidé par l\'utilisateur comme zéro', () => {
    expect(normaliserFicheMembre({ ...minimal, reportInitialAel: '' }).reportInitialAel).toBe(0)
  })

  it('refuse un report initial non numérique', () => {
    expect(() => normaliserFicheMembre({ ...minimal, reportInitialAel: 'abc' })).toThrow(
      FicheMembreInvalideError,
    )
  })

  it('refuse un report initial décimal donné sous forme de chaîne', () => {
    expect(() => normaliserFicheMembre({ ...minimal, reportInitialAel: '2.5' })).toThrow(
      FicheMembreInvalideError,
    )
  })

  it('traite un champ optionnel absent comme non renseigné', () => {
    expect(normaliserFicheMembre({ ...minimal, ville: null }).ville).toBeNull()
    expect(normaliserFicheMembre({ ...minimal, ville: undefined }).ville).toBeNull()
  })

  it('refuse un champ texte reçu sous une forme inattendue plutôt que de le perdre', () => {
    expect(() => normaliserFicheMembre({ ...minimal, ville: 42 })).toThrow(
      FicheMembreInvalideError,
    )
  })
})

describe('libelleFiche', () => {
  it("rend null quand l'identifiant est nul — il n'y a personne à désigner", () => {
    expect(libelleFiche(null, null)).toBeNull()
    // Même sans identifiant, un `bref` fourni par erreur ne doit rien faire apparaître.
    expect(libelleFiche(null, { prenom: 'Jean', nom: 'Dupont' })).toBeNull()
  })

  it('rend le nom complet quand la fiche a pu être lue', () => {
    expect(libelleFiche('id-1', { prenom: 'Jean', nom: 'Dupont' })).toBe('Jean Dupont')
  })

  it("rend « Fiche non consultable » quand l'identifiant existe mais que la lecture RLS n'a rien rendu", () => {
    expect(libelleFiche('id-1', null)).toBe(LIBELLE_FICHE_NON_CONSULTABLE)
  })

  // Le cœur de D98 : les deux « rien » ne sont PAS le même « rien ».
  it('distingue « personne » de « fiche cachée »', () => {
    expect(libelleFiche(null, null)).not.toBe(libelleFiche('id-1', null))
  })
})
