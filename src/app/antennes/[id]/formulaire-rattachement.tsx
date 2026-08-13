'use client'

import { useActionState, useState } from 'react'
import type { MembreBref } from '@/lib/donnees/membres'
import { SelecteurMembre } from '../../membres/selecteur-membre'
import { definirAntenneMembre, type EtatRattachement } from './actions'

const etatInitial: EtatRattachement = { erreur: null }

export function FormulaireRattachement({ antenneId }: { antenneId: string }) {
  const [etat, envoyer, enCours] = useActionState(definirAntenneMembre, etatInitial)
  const [membre, setMembre] = useState<MembreBref | null>(null)

  return (
    <form action={envoyer} className="flex flex-col gap-3">
      <input type="hidden" name="antenneId" value={antenneId} />
      <input type="hidden" name="pageAntenneId" value={antenneId} />
      <SelecteurMembre
        nom="membreId"
        label="Membre à rattacher"
        aide="Cherche parmi les membres actifs, y compris ceux déjà rattachés ailleurs."
        valeur={membre}
        surChoix={setMembre}
        exclureId={null}
      />

      {etat.erreur ? (
        <p role="alert" className="text-sm text-red-600">
          {etat.erreur}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={enCours || !membre}
        className="self-start rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {enCours ? 'Rattachement…' : 'Rattacher'}
      </button>
    </form>
  )
}
