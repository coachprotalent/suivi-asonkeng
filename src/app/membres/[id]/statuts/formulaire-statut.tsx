'use client'

import { useActionState } from 'react'
import type { GroupeStatut } from '@/lib/donnees/statuts'
import { attribuerStatut, type EtatStatut } from './actions'

const etatInitial: EtatStatut = { erreur: null }

export function FormulaireStatut({
  membreId,
  groupes,
}: {
  membreId: string
  groupes: GroupeStatut[]
}) {
  const [etat, envoyer, enCours] = useActionState(attribuerStatut, etatInitial)
  const aujourdhui = new Date().toISOString().slice(0, 10)

  return (
    <form action={envoyer} className="flex flex-col gap-4">
      <input type="hidden" name="membreId" value={membreId} />

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Statut (obligatoire)</span>
        <select
          name="statutId"
          required
          defaultValue=""
          className="rounded-md border border-neutral-300 px-3 py-2"
        >
          <option value="" disabled>
            Choisir un statut…
          </option>
          {groupes.map((groupe) => (
            <optgroup
              key={groupe.id}
              label={groupe.exclusif ? `${groupe.nom} (un seul à la fois)` : groupe.nom}
            >
              {groupe.statuts.map((statut) => (
                <option key={statut.id} value={statut.id}>
                  {statut.libelle}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Date d&apos;acquisition</span>
        <input
          name="dateAcquisition"
          type="date"
          max={aujourdhui}
          className="rounded-md border border-neutral-300 px-3 py-2"
        />
        <span className="text-xs text-neutral-500">
          Facultative. Elle n&apos;est pas toujours connue. Sur un statut déjà porté,
          laisser vide conserve la date enregistrée.
        </span>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Note</span>
        <input
          name="note"
          maxLength={500}
          className="rounded-md border border-neutral-300 px-3 py-2"
        />
        {/*
          Cette mention n'est pas un ornement. `attribuer_statut` applique un
          `coalesce` : sur un statut déjà porté, un champ vide veut dire « ne change
          pas », jamais « efface ». Sans cette phrase, un administrateur qui vide la
          note pour la supprimer verrait une redirection de succès et retrouverait
          l'ancienne note intacte, sans le moindre avertissement.
        */}
        <span className="text-xs text-neutral-500">
          Facultative. Sur un statut déjà porté, laisser vide conserve la note
          enregistrée.
        </span>
      </label>

      {etat.erreur ? (
        <p role="alert" className="text-sm text-red-600">
          {etat.erreur}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={enCours}
        className="self-start rounded-md bg-neutral-900 px-4 py-2 font-medium text-white disabled:opacity-50"
      >
        {enCours ? 'Enregistrement…' : 'Attribuer ce statut'}
      </button>
    </form>
  )
}
