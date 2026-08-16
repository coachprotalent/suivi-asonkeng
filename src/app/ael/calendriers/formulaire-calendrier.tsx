'use client'

import { useActionState, useState } from 'react'
import { Bouton } from '@/composants/ui/bouton'
import { Champ } from '@/composants/ui/champ'
import { Formulaire } from '@/composants/ui/formulaire'
import { Selecteur } from '@/composants/ui/selecteur'
import type { Antenne } from '@/lib/donnees/antennes'
import { ajouterCalendrier, type EtatCalendrier } from './actions'

const etatInitial: EtatCalendrier = { erreur: null }

const JOURS: Array<{ valeur: number; libelle: string }> = [
  { valeur: 1, libelle: 'Lundi' },
  { valeur: 2, libelle: 'Mardi' },
  { valeur: 3, libelle: 'Mercredi' },
  { valeur: 4, libelle: 'Jeudi' },
  { valeur: 5, libelle: 'Vendredi' },
  { valeur: 6, libelle: 'Samedi' },
  { valeur: 7, libelle: 'Dimanche' },
]

export function FormulaireCalendrier({ antennes }: { antennes: Antenne[] }) {
  const [etat, envoyer, enCours] = useActionState(ajouterCalendrier, etatInitial)

  /*
    CONTRÔLÉS (D111, D112) : les deux `<select defaultValue=…>` deviennent des
    `Selecteur`. Leurs options ne changent pas d'un mot — `JOURS` reste la source, et
    `antenneId`/`jourSemaine` reprennent les libellés qui n'existaient jusqu'ici que
    dans l'`aria-label` (« Antenne », « Jour de la semaine »), rendus visibles par
    `Selecteur`, qui exige un `<label>`.
  */
  const [antenneId, setAntenneId] = useState('')
  // `jourSemaine` valait `2` (nombre) par défaut ; `Selecteur` exige une `value` en
  // chaîne, comme toutes ses options (`String(jour.valeur)`).
  const [jourSemaine, setJourSemaine] = useState('2')
  const [heure, setHeure] = useState('')

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
        <Selecteur
          label="Antenne"
          name="antenneId"
          value={antenneId}
          onChange={(evenement) => setAntenneId(evenement.target.value)}
          required
          largeur="flexible"
          optionVide={{ libelle: 'Choisir une antenne', desactivee: true }}
          options={antennes.map((antenne) => ({ valeur: antenne.id, libelle: antenne.nom }))}
        />
        <Selecteur
          label="Jour de la semaine"
          name="jourSemaine"
          value={jourSemaine}
          onChange={(evenement) => setJourSemaine(evenement.target.value)}
          required
          largeur="flexible"
          options={JOURS.map((jour) => ({ valeur: String(jour.valeur), libelle: jour.libelle }))}
        />
        <Champ
          label="Heure (optionnelle)"
          name="heure"
          type="time"
          value={heure}
          onChange={(evenement) => setHeure(evenement.target.value)}
          largeur="etroite"
        />
      </div>
    </Formulaire>
  )
}
