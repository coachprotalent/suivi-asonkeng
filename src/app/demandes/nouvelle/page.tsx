'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { creerDemandeSuivi, type EtatDemandeSuivi } from './actions'

const etatInitial: EtatDemandeSuivi = { erreur: null }

export default function PageNouvelleDemande() {
  const [etat, envoyer, enCours] = useActionState(creerDemandeSuivi, etatInitial)

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Link href="/demandes" className="text-sm underline underline-offset-4">
        Retour aux demandes
      </Link>
      <h1 className="mt-4 mb-8 text-2xl font-semibold">Proposer une personne à suivre</h1>

      <form action={envoyer} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Prénom (obligatoire)</span>
            <input name="prenom" required className="rounded-md border border-neutral-300 px-3 py-2" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Nom (obligatoire)</span>
            <input name="nom" required className="rounded-md border border-neutral-300 px-3 py-2" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Téléphone</span>
            <input name="telephone" type="tel" className="rounded-md border border-neutral-300 px-3 py-2" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Ville</span>
            <input name="ville" className="rounded-md border border-neutral-300 px-3 py-2" />
          </label>
        </div>

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
          {enCours ? 'Envoi…' : 'Envoyer la demande'}
        </button>
      </form>
    </main>
  )
}
