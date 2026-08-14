'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { genererSeances, type EtatGeneration } from './actions'

const etatInitial: EtatGeneration = { erreur: null, creees: null, aucunCalendrier: false }

export function BoutonGenerer() {
  const [etat, envoyer, enCours] = useActionState(genererSeances, etatInitial)

  return (
    <form action={envoyer} className="flex flex-col gap-2">
      <button
        type="submit"
        disabled={enCours}
        className="self-start rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {enCours ? 'Génération…' : 'Générer les séances'}
      </button>
      {etat.erreur ? (
        <p role="alert" className="text-sm text-red-600">
          {etat.erreur}
        </p>
      ) : null}
      {/*
        `aucunCalendrier` AVANT `creees` : les deux valent 0 séance créée, mais pour des
        raisons opposées. Annoncer « tout est déjà généré » alors qu'aucun créneau n'est
        actif décrirait une situation qui n'est pas celle-là. Les deux branches portent
        `role="status"` : un test qui attend l'apparition du compte rendu (Task 19) reste
        valable dans les deux cas.
      */}
      {etat.aucunCalendrier ? (
        <p role="status" className="text-sm text-neutral-600">
          Aucun créneau actif : ajoutez ou réactivez un créneau dans{' '}
          <Link href="/ael/calendriers" className="underline underline-offset-4">
            le calendrier
          </Link>{' '}
          avant de générer.
        </p>
      ) : etat.creees !== null ? (
        <p role="status" className="text-sm text-neutral-600">
          {etat.creees === 0
            ? 'Aucune nouvelle séance : tout est déjà généré sur cet horizon.'
            : `${etat.creees} séance${etat.creees > 1 ? 's' : ''} générée${etat.creees > 1 ? 's' : ''}.`}
        </p>
      ) : null}
    </form>
  )
}
