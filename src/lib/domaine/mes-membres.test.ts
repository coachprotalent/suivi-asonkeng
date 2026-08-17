import { describe, expect, it } from 'vitest'
import { LIBELLE_FICHE_NON_CONSULTABLE } from './membre'
import { resumerSection } from './mes-membres'

const ada = { id: 'm1', nom: 'Lovelace', prenom: 'Ada' }

describe('resumerSection', () => {
  it('nomme chaque membre et joint ses statuts', () => {
    expect(resumerSection([ada], { m1: ['Baptisé'] }, {})).toEqual([
      { id: 'm1', libelle: 'Ada Lovelace', complement: null, statuts: ['Baptisé'] },
    ])
  })

  it('rend une liste vide pour une section vide', () => {
    expect(resumerSection([], {}, {})).toEqual([])
  })

  it('porte le compteur AEL en complément quand il est connu', () => {
    expect(resumerSection([ada], {}, { m1: 7 }).at(0)?.complement).toBe('7 AEL')
  })

  it('porte « 0 AEL » quand le compteur vaut RÉELLEMENT zéro', () => {
    // Zéro est une valeur, pas une absence : quelqu'un qui n'a suivi aucun AEL doit le lire.
    expect(resumerSection([ada], {}, { m1: 0 }).at(0)?.complement).toBe('0 AEL')
  })

  it("n'invente AUCUN compteur quand il est absent", () => {
    // ═══ LA DISTINCTION QUI COMPTE ═══
    // Un compteur absent (`compteurAelMembre` a rendu `null`, ligne de vue non visible) et un
    // compteur nul ne sont PAS le même fait. Écrire « 0 AEL » dans le premier cas ferait dire
    // à l'écran « cette personne n'a suivi aucun AEL », ce qu'aucune lecture n'établit.
    expect(resumerSection([ada], {}, {}).at(0)?.complement).toBeNull()
  })

  it('rend « Fiche non consultable » pour un membre sans nom lisible', () => {
    // `descendanceParPage` conserve la ligne d'un descendant que la RLS cache, avec un nom
    // vide — l'effacer ferait mentir le total de la section, qui vient du SQL. C'est ici
    // qu'elle reçoit son libellé, et jamais un blanc.
    expect(resumerSection([{ id: 'm9', nom: '', prenom: '' }], {}, {}).at(0)?.libelle).toBe(
      LIBELLE_FICHE_NON_CONSULTABLE,
    )
  })

  it('accepte un membre sans prénom sans laisser d’espace de tête', () => {
    expect(resumerSection([{ id: 'm2', nom: 'Lovelace', prenom: '' }], {}, {}).at(0)?.libelle).toBe(
      'Lovelace',
    )
  })

  it("rend une liste de statuts vide plutôt qu'indéfinie", () => {
    // L'écran itère dessus sans garde : `undefined` y jetterait.
    expect(resumerSection([ada], {}, {}).at(0)?.statuts).toEqual([])
  })

  it('préserve l’ordre reçu, sans retrier', () => {
    // Le tri est décidé par le SQL (tri TOTAL), et le refaire ici le contredirait : deux
    // pages successives seraient triées différemment de l'ensemble.
    const membres = [
      { id: 'z', nom: 'Zeta', prenom: 'A' },
      { id: 'a', nom: 'Alpha', prenom: 'B' },
    ]
    expect(resumerSection(membres, {}, {}).map((r) => r.id)).toEqual(['z', 'a'])
  })
})
