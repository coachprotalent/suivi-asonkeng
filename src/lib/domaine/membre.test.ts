import { describe, expect, it } from 'vitest'
import {
  FicheMembreInvalideError,
  LIBELLE_FICHE_NON_CONSULTABLE,
  coordonneesPersonnellesDepuisFormData,
  ficheMembreVersColonnes,
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

// Phase 7, D130 — le contact est une colonne ORDINAIRE de la fiche, pas une relation
// d'arbre : il traverse la même normalisation que l'antenne, sans validation de format
// (la clé étrangère en est juge), et ressort dans les mêmes colonnes.
describe('normaliserFicheMembre - contact', () => {
  it('lit un contact renseigné', () => {
    expect(normaliserFicheMembre({ ...minimal, contactId: 'c1' }).contactId).toBe('c1')
  })

  it('ramène un contact vide à null', () => {
    expect(normaliserFicheMembre({ ...minimal, contactId: '   ' }).contactId).toBeNull()
  })

  it('ramène un contact absent à null', () => {
    expect(normaliserFicheMembre(minimal).contactId).toBeNull()
  })

  it("refuse un contact reçu sous une forme inattendue plutôt que de le perdre", () => {
    expect(() => normaliserFicheMembre({ ...minimal, contactId: 42 })).toThrow(
      FicheMembreInvalideError,
    )
  })

  it('porte contact_id dans les colonnes destinées à la base', () => {
    const colonnes = ficheMembreVersColonnes(normaliserFicheMembre({ ...minimal, contactId: 'c1' }))
    expect(colonnes.contact_id).toBe('c1')
  })
})

// Phase 7, D138 — la moitié APPLICATIVE de la liste blanche de l'auto-édition. L'autre
// moitié, structurelle, est la signature de `public.modifier_mon_profil`.
describe('coordonneesPersonnellesDepuisFormData', () => {
  function formulaire(champs: Record<string, string>): FormData {
    const donnees = new FormData()
    for (const [cle, valeur] of Object.entries(champs)) donnees.set(cle, valeur)
    return donnees
  }

  it('lit les six champs autorisés', () => {
    expect(
      coordonneesPersonnellesDepuisFormData(
        formulaire({
          telephone: '0600000000',
          emailContact: 'jerome@example.com',
          ville: 'Douala',
          pays: 'Cameroun',
          situation: 'etudiant',
          domaineEtude: 'Informatique',
        }),
      ),
    ).toEqual({
      telephone: '0600000000',
      emailContact: 'jerome@example.com',
      ville: 'Douala',
      pays: 'Cameroun',
      situation: 'etudiant',
      domaineEtude: 'Informatique',
    })
  })

  it("efface le domaine d'étude hors situation étudiante, comme la fiche complète", () => {
    expect(
      coordonneesPersonnellesDepuisFormData(
        formulaire({ situation: 'travailleur', domaineEtude: 'Informatique' }),
      ).domaineEtude,
    ).toBeNull()
  })

  it('refuse une adresse de contact mal formée, comme la fiche complète', () => {
    expect(() =>
      coordonneesPersonnellesDepuisFormData(formulaire({ emailContact: 'pas-un-email' })),
    ).toThrow(FicheMembreInvalideError)
  })

  it('refuse une situation inconnue, comme la fiche complète', () => {
    expect(() =>
      coordonneesPersonnellesDepuisFormData(formulaire({ situation: 'retraite' })),
    ).toThrow(FicheMembreInvalideError)
  })

  it('ramène les champs absents à null', () => {
    expect(coordonneesPersonnellesDepuisFormData(formulaire({}))).toEqual({
      telephone: null,
      emailContact: null,
      ville: null,
      pays: null,
      situation: null,
      domaineEtude: null,
    })
  })

  it('NE LIT AUCUN CHAMP FERMÉ, même présent dans le formulaire (D138)', () => {
    // LA PREUVE CENTRALE DE CE BLOC. Un onglet forgé ou un appel direct peut poster
    // n'importe quel champ ; ceux-ci ne sont pas « ignorés par prudence », ils ne sont
    // JAMAIS LUS. La forme de l'assertion — l'ensemble EXACT des clés — est ce qui la rend
    // capable de tomber : un champ ajouté un jour à cette fonction sans passer par la revue
    // de sécurité du lot B ferait échouer ce test, ce qui est précisément le but.
    const coordonnees = coordonneesPersonnellesDepuisFormData(
      formulaire({
        nom: 'Usurpateur',
        prenom: 'Malveillant',
        antenneId: 'a1',
        contactId: 'c1',
        faiseurDeDiscipleId: 'f1',
        dirigeantId: 'd1',
        reportInitialAel: '999',
        etat: 'archive',
      }),
    )
    expect(Object.keys(coordonnees).sort()).toEqual([
      'domaineEtude',
      'emailContact',
      'pays',
      'situation',
      'telephone',
      'ville',
    ])
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
