'use client'

import { useActionState } from 'react'
import { changerMotDePasse, type EtatChangement } from './actions'
import { LONGUEUR_MDP_MINIMALE } from './constantes'

const etatInitial: EtatChangement = { erreur: null }

export default function PageChangementMotDePasse() {
  const [etat, action, enCours] = useActionState(changerMotDePasse, etatInitial)

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="mb-1 text-2xl font-semibold">Choisissez un mot de passe</h1>
      <p className="mb-8 text-sm text-neutral-500">
        Votre mot de passe actuel est temporaire. Choisissez-en un nouveau d&apos;au moins{' '}
        {LONGUEUR_MDP_MINIMALE} caractères pour continuer.
      </p>

      <form action={action} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Nouveau mot de passe</span>
          <input
            name="motDePasse"
            type="password"
            autoComplete="new-password"
            required
            minLength={LONGUEUR_MDP_MINIMALE}
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Confirmation</span>
          <input
            name="confirmation"
            type="password"
            autoComplete="new-password"
            required
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
        </label>

        {etat.erreur ? (
          <p role="alert" className="text-sm text-red-600">
            {etat.erreur}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={enCours}
          className="rounded-md bg-neutral-900 px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          {enCours ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </form>
    </main>
  )
}
