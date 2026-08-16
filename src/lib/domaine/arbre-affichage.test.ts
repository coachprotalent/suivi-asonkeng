import { describe, expect, it } from 'vitest'
import {
  basculeRefusee,
  classeDeRetrait,
  CLASSES_RETRAIT,
  niveauDeRetrait,
  noeudDeplie,
  PROFONDEUR_MAX_INDENTATION,
} from './arbre-affichage'

describe('basculeRefusee — BARRIERE N°1, le clic', () => {
  it('refuse de deplier un noeud deja present dans la branche affichee', () => {
    expect(basculeRefusee('a', ['racine', 'a'])).toBe(true)
  })

  it('laisse passer un noeud absent de la branche', () => {
    expect(basculeRefusee('b', ['racine', 'a'])).toBe(false)
  })

  it('laisse passer une racine, dont la branche est vide', () => {
    expect(basculeRefusee('racine', [])).toBe(false)
  })

  /*
    LE CAS QUI A JUSTIFIÉ LA BARRIÈRE : un membre qui serait son PROPRE faiseur de disciple.
    Impossible en base (déclencheur `membres_anti_cycle`), et c'est précisément pourquoi
    l'affichage ne doit pas en dépendre.
  */
  it('refuse un noeud qui serait son propre ancetre immediat', () => {
    expect(basculeRefusee('a', ['a'])).toBe(true)
  })
})

describe('noeudDeplie — BARRIERE N°2, le rendu, celle qui borne la recursion', () => {
  it('deplie un noeud present dans deplies et absent de la branche', () => {
    expect(noeudDeplie('a', ['a'], ['racine'])).toBe(true)
  })

  it('ne deplie pas un noeud absent de deplies', () => {
    expect(noeudDeplie('a', ['b'], ['racine'])).toBe(false)
  })

  /*
    ═══ LE CAS QUE LA BARRIÈRE EXISTE POUR FERMER ═══

    `deplies` est une liste GLOBALE. Sur un cycle A → B → A, `allerA` y met les deux
    identifiants SANS passer par `basculeRefusee`. Sans cette condition, `Noeud(A)` rendrait
    `Noeud(B)` qui rendrait `Noeud(A)` — sans borne, jusqu'au figement de l'onglet.
  */
  it('REFUSE de deplier un noeud deja present dans la branche, MEME s il est dans deplies', () => {
    expect(noeudDeplie('a', ['a', 'b'], ['a', 'b'])).toBe(false)
  })

  /*
    ═══ L'INVARIANT, ET NON SEULEMENT LE COMPORTEMENT ═══

    Cette barrière a été posée en TOUTE FIN DE PHASE 5 et, SUR UNE DONNÉE SAINE, ELLE NE
    CHANGE STRICTEMENT RIEN : dans un arbre sans cycle, aucun nœud n'est son propre ancêtre.
    C'est exactement ce qui rendrait sa disparition invisible à un test de comportement
    ordinaire, et c'est pourquoi le test suivant existe.

    Il asserte les DEUX moitiés de l'invariant :
      - sur une branche saine, `noeudDeplie` est ÉQUIVALENT à `deplies.includes` ;
      - dès que l'identifiant apparaît dans la branche, l'équivalence CESSE.
    Un `noeudDeplie` amputé de sa seconde condition satisferait la première moitié et
    TOMBERAIT sur la seconde.
  */
  it('est equivalent a deplies.includes tant que la branche est saine, et cesse de l etre sinon', () => {
    const deplies = ['a', 'b', 'c']
    const brancheSaine = ['racine', 'x', 'y']
    for (const identifiant of ['a', 'b', 'c', 'd', 'racine', 'x']) {
      expect(noeudDeplie(identifiant, deplies, brancheSaine)).toBe(deplies.includes(identifiant))
    }

    const brancheCyclique = ['racine', 'a']
    expect(deplies.includes('a')).toBe(true)
    expect(noeudDeplie('a', deplies, brancheCyclique)).toBe(false)
  })
})

describe('niveauDeRetrait — D104, l indentation plafonnee', () => {
  it('plafonne au-dela de la profondeur maximale', () => {
    expect(niveauDeRetrait(PROFONDEUR_MAX_INDENTATION)).toBe(PROFONDEUR_MAX_INDENTATION)
    expect(niveauDeRetrait(PROFONDEUR_MAX_INDENTATION + 1)).toBe(PROFONDEUR_MAX_INDENTATION)
    expect(niveauDeRetrait(99)).toBe(PROFONDEUR_MAX_INDENTATION)
  })

  it('rend la profondeur telle quelle en deca du plafond', () => {
    expect(niveauDeRetrait(0)).toBe(0)
    expect(niveauDeRetrait(3)).toBe(3)
  })

  /*
    L'INVARIANT QUI PERMET DE SUPPRIMER LES DEUX `style={{ marginLeft }}` : l'image de cette
    fonction est un ENSEMBLE FINI de cinq entiers, donc cinq classes suffisent.
  */
  it('ne rend jamais que cinq valeurs distinctes', () => {
    const valeurs = new Set(Array.from({ length: 50 }, (_, i) => niveauDeRetrait(i)))
    expect(valeurs.size).toBe(PROFONDEUR_MAX_INDENTATION + 1)
  })
})

/*
  ═══ LA TABLE DES CLASSES, ET POURQUOI ELLE EST TESTÉE ═══

  Tailwind balaye le SOURCE à la recherche de noms de classe COMPLETS : une classe
  construite par gabarit (`retrait-${n}`) ne produit AUCUNE RÈGLE, et le nœud sort sans
  indentation, SANS ERREUR ET SANS MESSAGE. Le défaut est donc entièrement silencieux, et
  seul un nom écrit en toutes lettres le ferme.

  Ces trois preuves verrouillent le plafond ET sa table ENSEMBLE : déplacer
  `PROFONDEUR_MAX_INDENTATION` sans ajouter la classe correspondante fait tomber la
  première ; renommer l'utilitaire CSS sans reprendre la table fait tomber la deuxième.
*/
describe('CLASSES_RETRAIT — une classe LITTÉRALE par niveau possible', () => {
  it('porte exactement autant d entrees que niveauDeRetrait a de valeurs', () => {
    expect(CLASSES_RETRAIT.length).toBe(PROFONDEUR_MAX_INDENTATION + 1)
  })

  it('nomme chaque classe d apres son indice, sans gabarit', () => {
    CLASSES_RETRAIT.forEach((classe, indice) => {
      expect(classe).toBe(`retrait-${indice}`)
    })
  })

  it('ne rend jamais une classe hors de la table, quelle que soit la profondeur', () => {
    const rendues = new Set(Array.from({ length: 50 }, (_, i) => classeDeRetrait(i)))
    expect(rendues.size).toBe(PROFONDEUR_MAX_INDENTATION + 1)
    for (const classe of rendues) {
      expect(CLASSES_RETRAIT).toContain(classe)
    }
    // La profondeur 0 et le plafond, nommément — les deux bornes que `Noeud` atteint.
    expect(classeDeRetrait(0)).toBe('retrait-0')
    expect(classeDeRetrait(99)).toBe(`retrait-${PROFONDEUR_MAX_INDENTATION}`)
  })
})
