'use client'

import { useActionState, useState } from 'react'
import type { MembreBref } from '@/lib/donnees/membres'
import { Bouton } from '@/composants/ui/bouton'
import { Formulaire } from '@/composants/ui/formulaire'
import { SelecteurMembre } from '../../membres/selecteur-membre'
import { definirAntenneMembre, type EtatRattachement } from './actions'

const etatInitial: EtatRattachement = { erreur: null }

export function FormulaireRattachement({ antenneId }: { antenneId: string }) {
  const [etat, envoyer, enCours] = useActionState(definirAntenneMembre, etatInitial)
  const [membre, setMembre] = useState<MembreBref | null>(null)

  return (
    <Formulaire
      action={envoyer}
      erreur={etat.erreur}
      enCours={enCours}
      actions={
        <Bouton
          type="submit"
          alignement="debut"
          disabled={!membre}
          enCours={enCours}
          libelleAttente="Rattachement…"
        >
          Rattacher
        </Bouton>
      }
    >
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
    </Formulaire>
  )
}
