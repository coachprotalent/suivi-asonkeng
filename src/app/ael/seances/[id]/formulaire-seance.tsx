'use client'

import { useActionState } from 'react'
import type { SeanceAelDetail } from '@/lib/donnees/ael'
import { ChampIntervenant } from './champ-intervenant'
import { enregistrerSeance, type EtatSeance } from './actions'

const etatInitial: EtatSeance = { erreur: null }

export function FormulaireSeance({ seance }: { seance: SeanceAelDetail }) {
  const [etat, envoyer, enCours] = useActionState(enregistrerSeance, etatInitial)

  return (
    <form action={envoyer} className="flex flex-col gap-6">
      <input type="hidden" name="seanceId" value={seance.id} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="date" className="text-sm font-medium">
          Date
        </label>
        <input
          id="date"
          name="date"
          type="date"
          required
          defaultValue={seance.date}
          className="rounded-md border border-neutral-300 px-3 py-2"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="theme" className="text-sm font-medium">
          Thème
        </label>
        <input
          id="theme"
          name="theme"
          type="text"
          defaultValue={seance.theme ?? ''}
          className="rounded-md border border-neutral-300 px-3 py-2"
        />
      </div>

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

      {etat.erreur ? (
        <p role="alert" className="text-sm text-red-600">
          {etat.erreur}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          name="intention"
          value="enregistrer"
          disabled={enCours}
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {enCours ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        {seance.etat !== 'tenue' ? (
          <button
            type="submit"
            name="intention"
            value="tenir"
            disabled={enCours}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {enCours ? 'Enregistrement…' : 'Marquer tenue'}
          </button>
        ) : null}
      </div>
    </form>
  )
}
