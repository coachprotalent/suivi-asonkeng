'use client'

import { useActionState, useState } from 'react'
import type { SeanceAelDetail } from '@/lib/donnees/ael'
import { Bouton } from '@/composants/ui/bouton'
import { Champ } from '@/composants/ui/champ'
import { Formulaire } from '@/composants/ui/formulaire'
import { ChampIntervenant } from './champ-intervenant'
import { enregistrerSeance, type EtatSeance } from './actions'

const etatInitial: EtatSeance = { erreur: null }

/** Les deux champs libres de ce fichier (Task 23) : date et thème, fermés par `Champ`. */
export function FormulaireSeance({ seance }: { seance: SeanceAelDetail }) {
  const [etat, envoyer, enCours] = useActionState(enregistrerSeance, etatInitial)
  const [date, setDate] = useState(seance.date)
  const [theme, setTheme] = useState(seance.theme ?? '')

  return (
    <Formulaire
      action={envoyer}
      erreur={etat.erreur}
      enCours={enCours}
      actions={
        <div className="flex flex-wrap gap-esp-3">
          <Bouton
            type="submit"
            name="intention"
            value="enregistrer"
            variante="secondaire"
            enCours={enCours}
            libelleAttente="Enregistrement…"
          >
            Enregistrer
          </Bouton>
          {seance.etat !== 'tenue' ? (
            <Bouton
              type="submit"
              name="intention"
              value="tenir"
              enCours={enCours}
              libelleAttente="Enregistrement…"
            >
              Marquer tenue
            </Bouton>
          ) : null}
        </div>
      }
    >
      <input type="hidden" name="seanceId" value={seance.id} />

      <Champ
        label="Date"
        name="date"
        type="date"
        required
        value={date}
        onChange={(evenement) => setDate(evenement.target.value)}
      />

      <Champ
        label="Thème"
        name="theme"
        type="text"
        value={theme}
        onChange={(evenement) => setTheme(evenement.target.value)}
      />

      {/*
        `membreIdInitial` (la colonne brute) EN PLUS de `membreInitial` (l'embed) : les
        deux diffèrent quand la fiche de l'intervenant est cachée à ce compte par la RLS
        — typiquement une fiche archivée vue par un modérateur. `ChampIntervenant` en
        déduit ce cas et conserve alors la valeur d'origine au lieu de l'effacer. Passer
        le seul embed ferait perdre l'enseignant en base au premier « Enregistrer ».
      */}
      <ChampIntervenant
        nomChampMembre="enseignantMembreId"
        nomChampLibre="enseignantLibre"
        label="Enseignant"
        membreIdInitial={seance.enseignantMembreId}
        membreInitial={seance.enseignantMembre}
        libreInitial={seance.enseignantLibre}
      />

      <ChampIntervenant
        nomChampMembre="moderateurMembreId"
        nomChampLibre="moderateurLibre"
        label="Modérateur"
        membreIdInitial={seance.moderateurMembreId}
        membreInitial={seance.moderateurMembre}
        libreInitial={seance.moderateurLibre}
      />
    </Formulaire>
  )
}
