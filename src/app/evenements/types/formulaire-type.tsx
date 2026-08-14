'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { creerTypeEvenement, type EtatTypeEvenement } from './actions'

const etatInitial: EtatTypeEvenement = { erreur: null }

export function FormulaireType() {
  const [etat, envoyer, enCours] = useActionState(creerTypeEvenement, etatInitial)
  // CONTRÔLÉS, et c'est ESSENTIEL — pas un simple choix de style. React réinitialise les
  // champs NON contrôlés d'un `<form action={...}>` dès que l'action se termine SANS
  // LEVER, y compris quand elle RETOURNE un refus métier (`{ erreur: "..." }` n'est pas
  // une exception pour React). Constaté à l'exécution : avec `defaultValue` au lieu de
  // `value`/`onChange` ci-dessous (le code du brief), le message d'erreur s'affichait
  // correctement mais le champ « Libellé » se vidait quand même — contredisant
  // directement l'étape 5 du brief (« la saisie n'est pas perdue »), preuve par
  // Playwright à l'appui (tests/e2e/evenements-types.spec.ts). Un champ contrôlé n'est
  // pas concerné par cette réinitialisation : sa valeur DOM est reposée par React à
  // chaque rendu, quoi que fasse la réinitialisation native du formulaire.
  const [libelle, setLibelle] = useState('')
  const [ordre, setOrdre] = useState('0')

  // Vidé au SUCCÈS d'une VRAIE soumission, jamais au montage. Un premier jet de cet
  // effet se contentait de tester `etat.erreur === null`, vrai aussi pour `etatInitial` :
  // l'effet se déclenchait donc AUSSI au montage, et pouvait — selon le timing du premier
  // rendu — écraser une saisie déjà tapée avant que l'utilisateur n'ait rien soumis.
  // Constaté à l'exécution : ce piège rendait le test Playwright correspondant FLAKY (un
  // échec sur trois environ), l'effet de montage entrant parfois en course avec le
  // remplissage du champ. On ne vide donc qu'à la transition « en cours » -> « terminé
  // sans erreur », jamais ailleurs.
  const enCoursPrecedent = useRef(enCours)
  useEffect(() => {
    if (enCoursPrecedent.current && !enCours && etat.erreur === null) {
      setLibelle('')
      setOrdre('0')
    }
    enCoursPrecedent.current = enCours
  }, [enCours, etat])

  return (
    <form action={envoyer} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium">Libellé</span>
          <input
            name="libelle"
            required
            value={libelle}
            onChange={(evenement) => setLibelle(evenement.target.value)}
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
        </label>
        <label className="flex w-24 flex-col gap-1.5">
          <span className="text-sm font-medium">Ordre</span>
          <input
            name="ordre"
            type="number"
            value={ordre}
            onChange={(evenement) => setOrdre(evenement.target.value)}
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
        </label>
        <button
          type="submit"
          disabled={enCours}
          className="rounded-md bg-neutral-900 px-4 py-2 text-white disabled:opacity-50"
        >
          Ajouter
        </button>
      </div>
      {etat.erreur ? (
        <p role="alert" className="text-sm text-red-600">
          {etat.erreur}
        </p>
      ) : null}
    </form>
  )
}
