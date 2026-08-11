'use client'

import { useActionState } from 'react'
import type { GroupeStatut } from '@/lib/donnees/statuts'
import { creerGroupe, creerStatut, type EtatCatalogue } from './actions'

const etatInitial: EtatCatalogue = { erreur: null }

export function FormulaireGroupe() {
  const [etat, envoyer, enCours] = useActionState(creerGroupe, etatInitial)

  return (
    <form action={envoyer} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium">Nom du groupe</span>
          <input name="nom" required className="rounded-md border border-neutral-300 px-3 py-2" />
        </label>
        <label className="flex items-center gap-2 py-2">
          <input name="exclusif" type="checkbox" />
          <span className="text-sm">Un seul statut à la fois</span>
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

export function FormulaireStatutCatalogue({ groupes }: { groupes: GroupeStatut[] }) {
  const [etat, envoyer, enCours] = useActionState(creerStatut, etatInitial)

  return (
    <form action={envoyer} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium">Libellé</span>
          <input
            name="libelle"
            required
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Groupe</span>
          <select
            name="groupeId"
            required
            defaultValue=""
            className="rounded-md border border-neutral-300 px-3 py-2"
          >
            <option value="" disabled>
              Choisir…
            </option>
            {groupes.map((groupe) => (
              <option key={groupe.id} value={groupe.id}>
                {groupe.nom}
              </option>
            ))}
          </select>
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
