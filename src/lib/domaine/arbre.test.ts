import { describe, expect, it } from 'vitest'
import { LIBELLE_FICHE_NON_CONSULTABLE } from './membre'
import { cheminAvecLibelles, dirigeantPropose, peutModifier } from './arbre'

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
    expect(peutModifier({ membreLieId: null, estAdmin: true, estLeader: false }, cible)).toBe(true)
  })

  it('accorde au faiseur de disciple direct', () => {
    expect(peutModifier({ membreLieId: 'parent', estAdmin: false, estLeader: false }, cible)).toBe(true)
  })

  it('accorde à un ancêtre lointain', () => {
    expect(peutModifier({ membreLieId: 'grand-parent', estAdmin: false, estLeader: false }, cible)).toBe(true)
  })

  it("accorde au dirigeant désigné, même hors de l'arbre", () => {
    expect(peutModifier({ membreLieId: 'chef', estAdmin: false, estLeader: false }, cible)).toBe(true)
  })

  it("refuse à quelqu'un sans aucun lien", () => {
    expect(peutModifier({ membreLieId: 'inconnu', estAdmin: false, estLeader: false }, cible)).toBe(false)
  })

  // LE PIÈGE DU COMPTE RACINE : sans le court-circuit sur `null`, ce cas passerait à
  // `true` dès que la cible n'a pas de dirigeant — donc presque toujours.
  it("refuse à un compte sans membre lié qui n'est pas administrateur", () => {
    expect(
      peutModifier({ membreLieId: null, estAdmin: false, estLeader: false }, { ...cible, dirigeantId: null }),
    ).toBe(false)
  })

  it("refuse à un compte sans membre lié même quand la liste d'ancêtres est vide", () => {
    expect(
      peutModifier(
        { membreLieId: null, estAdmin: false, estLeader: false },
        { membreId: 'cible', ancetres: [], dirigeantId: null },
      ),
    ).toBe(false)
  })

  // Conséquence voulue du §5.1, figée ici pour qu'elle ne soit pas « corrigée » par
  // mégarde : nul n'est son propre ancêtre.
  it('refuse à un utilisateur sur sa propre fiche', () => {
    expect(
      peutModifier(
        { membreLieId: 'cible', estAdmin: false, estLeader: false },
        { membreId: 'cible', ancetres: ['parent'], dirigeantId: 'chef' },
      ),
    ).toBe(false)
  })

  it("refuse quand la cible n'a ni ancêtre ni dirigeant", () => {
    expect(
      peutModifier(
        { membreLieId: 'quelquun', estAdmin: false, estLeader: false },
        { membreId: 'racine', ancetres: [], dirigeantId: null },
      ),
    ).toBe(false)
  })

  // ENTRÉE HOSTILE, pas un cas d'usage : `ancetres_membre` exclut aujourd'hui la cible
  // de sa propre liste d'ancêtres, donc cette entrée est impossible en base actuellement.
  // Elle est testée quand même, pour figer une défense en profondeur qui ne doit RIEN à
  // cette garantie externe : si la requête récursive de `ancetres_membre` se mettait un
  // jour à inclure la cible (régression du filtre de profondeur), la fonction doit
  // continuer de refuser l'autorité sur soi-même plutôt que de basculer côté accord.
  it("refuse même si la liste d'ancêtres contient (à tort) l'identifiant de la cible", () => {
    expect(
      peutModifier(
        { membreLieId: 'cible', estAdmin: false, estLeader: false },
        { membreId: 'cible', ancetres: ['cible', 'parent'], dirigeantId: null },
      ),
    ).toBe(false)
  })

  // ENTRÉE HOSTILE, pas un cas d'usage : une contrainte CHECK interdit aujourd'hui
  // `dirigeant_id = id` en base, donc cette entrée est impossible actuellement. Testée
  // quand même : si cette contrainte était un jour levée, la fonction doit continuer de
  // refuser l'autorité sur soi-même plutôt que de basculer côté accord.
  it("refuse même si le dirigeant désigné de la cible est (à tort) elle-même", () => {
    expect(
      peutModifier(
        { membreLieId: 'cible', estAdmin: false, estLeader: false },
        { membreId: 'cible', ancetres: [], dirigeantId: 'cible' },
      ),
    ).toBe(false)
  })
})

// Phase 8, D150 — « dirigeant de tout ». Le leader court-circuite l'arbre au MÊME RANG que
// l'administrateur : son pouvoir ne vient pas de sa place dans l'arbre, il vient de son rôle.
describe('peutModifier — le rôle leader', () => {
  const cible = { membreId: 'cible', ancetres: ['parent', 'grand-parent'], dirigeantId: 'chef' }

  it("accorde sur un membre dont il n'est ni ancêtre ni dirigeant", () => {
    expect(
      peutModifier({ membreLieId: 'etranger', estAdmin: false, estLeader: true }, cible),
    ).toBe(true)
  })

  it('accorde même sans membre lié', () => {
    // Le court-circuit est AVANT le contrôle `membreLieId === null`, exactement comme pour
    // l'administrateur. Un leader dont le compte n'est relié à aucune fiche garde son
    // autorité — sans quoi le rôle dépendrait d'une liaison qui n'a rien à voir avec lui.
    expect(peutModifier({ membreLieId: null, estAdmin: false, estLeader: true }, cible)).toBe(
      true,
    )
  })

  it('accorde sur SA PROPRE fiche, comme un administrateur', () => {
    // Conséquence ASSUMÉE du court-circuit : « nul n'est son propre ancêtre » vaut pour le
    // dirigeant ordinaire, pas pour l'administrateur — ni, désormais, pour le leader. On ne
    // crée pas une troisième règle pour un troisième rôle.
    expect(peutModifier({ membreLieId: 'cible', estAdmin: false, estLeader: true }, cible)).toBe(
      true,
    )
  })

  it('accorde même quand la cible n’a ni ancêtre ni dirigeant', () => {
    expect(
      peutModifier(
        { membreLieId: 'etranger', estAdmin: false, estLeader: true },
        { membreId: 'cible', ancetres: [], dirigeantId: null },
      ),
    ).toBe(true)
  })

  it("ne change RIEN pour un compte sans le rôle", () => {
    // CONTRÔLE NÉGATIF. Sans lui, un court-circuit écrit à tort en `true` inconditionnel
    // passerait les quatre preuves ci-dessus sans qu'aucune ne bronche.
    expect(
      peutModifier({ membreLieId: 'etranger', estAdmin: false, estLeader: false }, cible),
    ).toBe(false)
  })
})

describe('cheminAvecLibelles', () => {
  const brefs = [
    { id: 'racine', prenom: 'Anne', nom: 'Racine' },
    { id: 'petit', prenom: 'Zoé', nom: 'Feuille' },
  ]

  it("nomme chaque maillon lisible, dans l'ordre reçu", () => {
    expect(cheminAvecLibelles(['racine', 'petit'], brefs)).toEqual([
      { id: 'racine', libelle: 'Anne Racine' },
      { id: 'petit', libelle: 'Zoé Feuille' },
    ])
  })

  // PREUVE N°14, seconde moitié : un maillon ILLISIBLE conserve SA PLACE, et ne fait
  // disparaître aucun descendant.
  it("conserve la profondeur d'un maillon illisible, et garde ses descendants", () => {
    const chemin = cheminAvecLibelles(['racine', 'intermediaire', 'petit'], brefs)
    expect(chemin).toHaveLength(3)
    expect(chemin[1]).toEqual({ id: 'intermediaire', libelle: LIBELLE_FICHE_NON_CONSULTABLE })
    // Le descendant est TOUJOURS LÀ, et toujours nommé : c'est ce que « ne détache pas la
    // descendance » veut dire concrètement.
    expect(chemin[2]).toEqual({ id: 'petit', libelle: 'Zoé Feuille' })
  })

  it('ne saute ni ne réordonne quand TOUS les maillons sont illisibles', () => {
    const chemin = cheminAvecLibelles(['a', 'b', 'c'], [])
    expect(chemin.map((maillon) => maillon.id)).toEqual(['a', 'b', 'c'])
    expect(chemin.every((maillon) => maillon.libelle === LIBELLE_FICHE_NON_CONSULTABLE)).toBe(true)
  })

  it('rend un chemin vide pour une liste vide', () => {
    expect(cheminAvecLibelles([], brefs)).toEqual([])
  })
})
