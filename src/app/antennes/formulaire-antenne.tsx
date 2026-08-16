'use client'

import { useActionState, useState } from 'react'
import { Bouton } from '@/composants/ui/bouton'
import { Champ } from '@/composants/ui/champ'
import { Formulaire } from '@/composants/ui/formulaire'
import { creerAntenne, type EtatAntenne } from './actions'

const etatInitial: EtatAntenne = { erreur: null }

export function FormulaireAntenne() {
  const [etat, envoyer, enCours] = useActionState(creerAntenne, etatInitial)

  /*
    CONTRÔLÉS (D111) : les deux champs n'avaient jusqu'ici qu'un `aria-label` (« Nom de
    l'antenne », « Pays de l'antenne ») et un `placeholder` (« Nom », « Pays ») — aucun
    `<label>` visible. `Champ` en exige un. Le texte du `label` ci-dessous reprend le
    libellé qui existait DÉJÀ dans le fichier — celui de l'`aria-label`, plus explicite
    que le `placeholder` isolé — et non un texte inventé : aucun mot n'est ajouté au
    dépôt, il change seulement de canal (de l'arbre d'accessibilité vers l'écran).
  */
  const [nom, setNom] = useState('')
  const [pays, setPays] = useState('')

  return (
    <Formulaire
      action={envoyer}
      erreur={etat.erreur}
      enCours={enCours}
      actions={
        <Bouton type="submit" alignement="debut" enCours={enCours} libelleAttente="Ajout…">
          Ajouter
        </Bouton>
      }
    >
      <div className="flex flex-wrap gap-esp-3">
        <Champ
          label="Nom de l'antenne"
          name="nom"
          value={nom}
          onChange={(evenement) => setNom(evenement.target.value)}
          required
          largeur="flexible"
        />
        <Champ
          label="Pays de l'antenne"
          name="pays"
          value={pays}
          onChange={(evenement) => setPays(evenement.target.value)}
          required
          largeur="flexible"
        />
      </div>
    </Formulaire>
  )
}
