'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import type { MembreBref } from '@/lib/donnees/membres'
import { definirAntenneMembre, type EtatRattachement } from './actions'

const etatInitial: EtatRattachement = { erreur: null }

export function LigneMembreDetachable({
  membre,
  antenneId,
}: {
  membre: MembreBref
  antenneId: string
}) {
  const [etat, envoyer, enCours] = useActionState(definirAntenneMembre, etatInitial)

  return (
    <li className="flex flex-col gap-1 py-2">
      <div className="flex items-center justify-between gap-4">
        <Link href={`/membres/${membre.id}`} className="text-sm">
          {membre.prenom} {membre.nom}
        </Link>
        <form action={envoyer}>
          <input type="hidden" name="membreId" value={membre.id} />
          <input type="hidden" name="pageAntenneId" value={antenneId} />
          {/*
            Pas de champ `antenneId` : `champOuNull` (Task 3) le lit `null`, ce qui
            DÉTACHE. `pageAntenneId` sert uniquement à revalider la bonne page.
          */}
          <button
            type="submit"
            disabled={enCours}
            onClick={(evenement) => {
              if (
                !window.confirm(
                  `Détacher ${membre.prenom} ${membre.nom} de cette antenne ?\n\n` +
                    "Cette personne n'apparaîtra plus dans les listes de pointage " +
                    'pré-remplies des prochaines séances de cette antenne. Son historique ' +
                    'de présence reste intact.',
                )
              ) {
                evenement.preventDefault()
              }
            }}
            className="text-sm text-red-600 underline underline-offset-4 disabled:opacity-50"
          >
            {enCours ? 'Détachement…' : 'Détacher'}
          </button>
        </form>
      </div>
      {etat.erreur ? (
        <p role="alert" className="text-xs text-red-600">
          {etat.erreur}
        </p>
      ) : null}
    </li>
  )
}
