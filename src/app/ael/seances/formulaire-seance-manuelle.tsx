'use client'

import { useActionState, useState } from 'react'
import type { Antenne } from '@/lib/donnees/antennes'
import { Bouton } from '@/composants/ui/bouton'
import { CLASSES_CHAMP } from '@/composants/ui/champ'
import { Formulaire } from '@/composants/ui/formulaire'
import { creerSeanceManuelle, type EtatSeanceManuelle } from './actions'

const etatInitial: EtatSeanceManuelle = { erreur: null }

/*
  ⚠️ LES DEUX CHAMPS LIBRES DE CE FICHIER (Task 23) — date et heure — N'ONT JAMAIS PORTÉ DE
  `<label>` VISIBLE, seulement un `aria-label` (« Date », « Heure (optionnelle) »). Passer
  par `Champ` ajouterait ce texte à l'écran — un changement affiché non déclaré (D117).
  Même voie que le champ « motif » de `membres/[id]/statuts` : `CLASSES_CHAMP` nu, avec un
  état local pour fermer D111 sans ajouter de label.
*/
export function FormulaireSeanceManuelle({ antennes }: { antennes: Antenne[] }) {
  const [etat, envoyer, enCours] = useActionState(creerSeanceManuelle, etatInitial)
  const [date, setDate] = useState('')
  const [heure, setHeure] = useState('')

  return (
    <Formulaire
      action={envoyer}
      erreur={etat.erreur}
      enCours={enCours}
      actions={
        <Bouton type="submit" alignement="debut" enCours={enCours} libelleAttente="Création…">
          Créer la séance
        </Bouton>
      }
    >
      <div className="flex flex-wrap gap-esp-3">
        <input
          type="date"
          name="date"
          required
          value={date}
          onChange={(evenement) => setDate(evenement.target.value)}
          aria-label="Date"
          className={CLASSES_CHAMP}
        />
        <input
          type="time"
          name="heure"
          value={heure}
          onChange={(evenement) => setHeure(evenement.target.value)}
          aria-label="Heure (optionnelle)"
          className={CLASSES_CHAMP}
        />
      </div>
      <fieldset className="flex flex-col gap-esp-1">
        <legend className="libelle-champ text-petit text-encre">Antennes ciblées</legend>
        {antennes.map((antenne) => (
          <label
            key={antenne.id}
            className="cible-tactile flex items-center gap-esp-2 text-petit text-encre"
          >
            <input type="checkbox" name="antenneIds" value={antenne.id} />
            {antenne.nom}
          </label>
        ))}
      </fieldset>
    </Formulaire>
  )
}
