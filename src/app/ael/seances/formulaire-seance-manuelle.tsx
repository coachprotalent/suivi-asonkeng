'use client'

import { useActionState } from 'react'
import type { Antenne } from '@/lib/donnees/antennes'
import { creerSeanceManuelle, type EtatSeanceManuelle } from './actions'

const etatInitial: EtatSeanceManuelle = { erreur: null }

export function FormulaireSeanceManuelle({ antennes }: { antennes: Antenne[] }) {
  const [etat, envoyer, enCours] = useActionState(creerSeanceManuelle, etatInitial)

  return (
    <form action={envoyer} className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <input
          type="date"
          name="date"
          required
          aria-label="Date"
          className="rounded-md border border-neutral-300 px-3 py-2"
        />
        <input
          type="time"
          name="heure"
          aria-label="Heure (optionnelle)"
          className="rounded-md border border-neutral-300 px-3 py-2"
        />
      </div>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-sm font-medium">Antennes ciblées</legend>
        {antennes.map((antenne) => (
          <label key={antenne.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="antenneIds" value={antenne.id} />
            {antenne.nom}
          </label>
        ))}
      </fieldset>

      {etat.erreur ? (
        <p role="alert" className="text-sm text-red-600">
          {etat.erreur}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={enCours}
        className="self-start rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {enCours ? 'Création…' : 'Créer la séance'}
      </button>
    </form>
  )
}
