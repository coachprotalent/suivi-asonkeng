/*
  ═══ LA POSITION DU BANDEAU DE REFUS EST PROUVÉE, PLUS SUPPOSÉE (revue des Tasks 8/9) ═══

  Ce fichier existe à cause d'un défaut que RIEN n'avait vu : `Formulaire` rendait
  `{children}` puis `<Refus/>`, et comme le bouton de soumission faisait partie de
  `children`, le bandeau de refus s'affichait SOUS le bouton d'envoi — sur `/membres/nouveau`
  et `/membres/[id]/modifier`, deux écrans de production. Les 46 bandeaux du dépôt le
  précèdent.

  POURQUOI AUCUNE PORTE NE POUVAIT LE VOIR :
    - les preuves de bout en bout vérifient le TEXTE d'un bandeau, jamais sa POSITION ;
    - `tsc` et le lint ne connaissent pas l'ordre de lecture ;
    - et l'atténuation était réelle mais trompeuse — le focus porté sur le bandeau (D113)
      fait défiler le navigateur jusqu'à lui QUELLE QUE SOIT sa position, de sorte que
      l'utilisateur voyait probablement le message. Seul l'ordre de lecture était rompu.

  ═══ POURQUOI `react-dom/server` ET NON UN NAVIGATEUR ═══

  `renderToStaticMarkup` rend le composant en une chaîne, dans l'environnement `node` de
  `vitest.config.ts`, SANS jsdom et sans dépendance nouvelle : `react-dom` est déjà là. On
  n'a besoin de rien de plus, puisque la question porte sur l'ORDRE DU BALISAGE et non sur un
  comportement d'exécution. `useEffect` — donc le focus de D113 — ne s'exécute pas au rendu
  serveur, et c'est sans importance ici : ce fichier ne prouve QUE la position.

  ═══ POURQUOI `createElement` ET NON DU JSX ═══

  `vitest.config.ts` ne ramasse que les fichiers `.test.ts` sous `src` — jamais un `.tsx`.
  Élargir ce motif pour un seul fichier changerait la surface de la porte de tous les
  commits à venir. `createElement` dit exactement la même chose que du JSX.
*/
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Formulaire } from './formulaire'

const MESSAGE_REFUS = 'Le prénom est obligatoire.'
const LIBELLE_BOUTON = 'Créer la fiche'

function rendre(erreur: string | null): string {
  /*
    `children` est passé DANS les propriétés, et non en troisième argument de
    `createElement` : sur cette surcharge, TypeScript ne déduit pas le troisième argument
    vers la propriété `children` OBLIGATOIRE du type, et `tsc` refuse l'appel.

    `react/no-children-prop` vise l'écriture JSX, où `children={…}` à côté d'enfants réels
    est une confusion. Ici il n'y a pas de JSX — `vitest.config.ts` ne ramasse que les
    `.test.ts` —, et c'est `tsc` qui impose cette forme. La règle est donc désactivée SUR
    CETTE LIGNE, avec sa raison, et nulle part ailleurs.
  */
  return renderToStaticMarkup(
    // eslint-disable-next-line react/no-children-prop
    createElement(Formulaire, {
      action: () => {},
      erreur,
      enCours: false,
      children: createElement('input', { name: 'prenom', readOnly: true, value: '' }),
      actions: createElement('button', { type: 'submit' }, LIBELLE_BOUTON),
    }),
  )
}

describe('Formulaire — l ordre de lecture du refus', () => {
  /*
    ═══ L'ASSERTION QUI TOMBE SI L'ORDRE S'INVERSE ═══

    Elle compare les POSITIONS des deux éléments dans le balisage. Rendre `{actions}` avant
    `<Refus/>` — c'est-à-dire le défaut qu'on vient de corriger — fait passer la position du
    bouton avant celle du bandeau, et cette preuve rougit.
  */
  it('rend le bandeau de refus AVANT le bouton de soumission', () => {
    const html = rendre(MESSAGE_REFUS)

    const positionRefus = html.indexOf('role="alert"')
    const positionBouton = html.indexOf('<button')

    // FILET : sans lui, deux `-1` se compareraient joyeusement et la preuve serait verte
    // en n'ayant rien trouvé. Un `indexOf` qui rend `-1` doit faire échouer, pas passer.
    const filetRefus = 'aucun bandeau de refus rendu : cette preuve ne prouve plus rien'
    const filetBouton = 'aucun bouton rendu : cette preuve ne prouve plus rien'
    expect(positionRefus, filetRefus).toBeGreaterThanOrEqual(0)
    expect(positionBouton, filetBouton).toBeGreaterThanOrEqual(0)

    expect(
      positionRefus,
      'le bandeau de refus est rendu APRÈS le bouton : l ordre de lecture des 46 bandeaux du depot est rompu',
    ).toBeLessThan(positionBouton)
  })

  /*
    Le CHAMP reste avant les deux : l'ordre complet est champs → refus → geste. Sans cette
    preuve, remonter le bandeau EN TÊTE du formulaire satisferait la précédente tout en
    déplaçant un élément visible sur vingt-cinq écrans, ce que la Task 4 refusait déjà.
  */
  it('rend les champs AVANT le bandeau de refus', () => {
    const html = rendre(MESSAGE_REFUS)

    const positionChamp = html.indexOf('name="prenom"')
    expect(positionChamp).toBeGreaterThanOrEqual(0)
    expect(positionChamp).toBeLessThan(html.indexOf('role="alert"'))
  })

  /*
    D117 — LE BANDEAU NE PRÉFIXE, NE SUFFIXE ET NE REFORMULE RIEN. Le message arrive tel
    quel de l'action.
  */
  it('rend le message du refus tel quel', () => {
    expect(rendre(MESSAGE_REFUS)).toContain(MESSAGE_REFUS)
  })

  /*
    Sans refus, aucun bandeau — et le bouton reste rendu. Une fente `actions` qui
    disparaîtrait avec le bandeau retirerait le geste de soumission de tous les formulaires
    en état normal, ce qui serait un défaut bien plus visible mais qu'aucune autre preuve
    d'ici n'exercerait.
  */
  it('ne rend aucun bandeau quand il n y a pas de refus, et garde le bouton', () => {
    const html = rendre(null)
    expect(html).not.toContain('role="alert"')
    expect(html).toContain(LIBELLE_BOUTON)
  })
})
