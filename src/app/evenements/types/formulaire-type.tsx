'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { Bouton } from '@/composants/ui/bouton'
import { Champ } from '@/composants/ui/champ'
import { Formulaire } from '@/composants/ui/formulaire'
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
    <Formulaire
      action={envoyer}
      erreur={etat.erreur}
      enCours={enCours}
      actions={
        <Bouton type="submit" alignement="debut" enCours={enCours}>
          Ajouter
        </Bouton>
      }
    >
      <div className="flex flex-wrap items-end gap-esp-3">
        <Champ
          label="Libellé"
          name="libelle"
          value={libelle}
          onChange={(evenement) => setLibelle(evenement.target.value)}
          required
          largeur="flexible"
        />
        <Champ
          label="Ordre"
          name="ordre"
          type="number"
          value={ordre}
          onChange={(evenement) => setOrdre(evenement.target.value)}
          largeur="etroite"
        />
      </div>
    </Formulaire>
  )
}
