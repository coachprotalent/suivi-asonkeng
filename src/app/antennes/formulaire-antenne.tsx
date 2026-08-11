'use client'

import { useActionState } from 'react'
import { creerAntenne, type EtatAntenne } from './actions'

const etatInitial: EtatAntenne = { erreur: null }

export function FormulaireAntenne() {
  const [etat, envoyer, enCours] = useActionState(creerAntenne, etatInitial)

  return (
    <form action={envoyer} className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <input
          name="nom"
          placeholder="Nom"
          required
          aria-label="Nom de l'antenne"
          className="flex-1 rounded-md border border-neutral-300 px-3 py-2"
        />
        <input
          name="pays"
          placeholder="Pays"
          required
          aria-label="Pays de l'antenne"
          className="flex-1 rounded-md border border-neutral-300 px-3 py-2"
        />
        <button
          type="submit"
          disabled={enCours}
          className="rounded-md bg-neutral-900 px-4 py-2 text-white disabled:opacity-50"
        >
          {enCours ? 'Ajout…' : 'Ajouter'}
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
