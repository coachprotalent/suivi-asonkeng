'use client'

import { useState, useTransition, type FormEvent } from 'react'
import type { MembreBref } from '@/lib/donnees/membres'
import { SelecteurMembre } from '@/app/membres/selecteur-membre'
import { validerDemandeNouvellePersonne } from './actions'

type Props = {
  demandeId: string
  membreId: string
  demandeurProfilId: string
  demandeurMembreId: string | null
  dirigeantInitial: MembreBref | null
}

export function FormulaireValidationSuivi({
  demandeId,
  membreId,
  demandeurProfilId,
  demandeurMembreId,
  dirigeantInitial,
}: Props) {
  const [dirigeant, setDirigeant] = useState<MembreBref | null>(dirigeantInitial)
  // Accepter la proposition laisse dirigeantForce à false ; toute correction
  // manuelle le passe à true — même sémantique que l'écran /membres/[id]/arbre
  // de la 1c (spec §4.2 : « défini manuellement » contre « calculé »).
  const [dirigeantForce, setDirigeantForce] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, demarrer] = useTransition()

  function choisirDirigeant(membre: MembreBref | null) {
    setDirigeant(membre)
    setDirigeantForce(true)
  }

  function soumettre(evenement: FormEvent<HTMLFormElement>) {
    evenement.preventDefault()
    const donnees = new FormData(evenement.currentTarget)
    setErreur(null)
    demarrer(async () => {
      try {
        await validerDemandeNouvellePersonne(donnees)
      } catch (e) {
        setErreur(e instanceof Error ? e.message : String(e))
      }
    })
  }

  return (
    <form onSubmit={soumettre} className="mt-3 flex flex-col gap-3 rounded-md border border-neutral-200 p-3">
      <input type="hidden" name="demandeId" value={demandeId} />
      <input type="hidden" name="origine" value="demande_suivi" />
      <input type="hidden" name="membreId" value={membreId} />
      <input type="hidden" name="demandeurProfilId" value={demandeurProfilId} />
      <input type="hidden" name="demandeurMembreId" value={demandeurMembreId ?? ''} />
      <input type="hidden" name="dirigeantForce" value={dirigeantForce ? '1' : '0'} />
      <SelecteurMembre
        nom="dirigeantId"
        label="Dirigeant proposé"
        aide="Calculé à partir du demandeur, posé comme faiseur de disciple par défaut (non modifiable ici). Corrigeable avant validation."
        valeur={dirigeant}
        surChoix={choisirDirigeant}
        exclureId={membreId}
      />
      <button
        type="submit"
        disabled={enCours}
        className="self-start rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
      >
        {enCours ? 'Validation…' : 'Valider comme nouvelle personne'}
      </button>
      {erreur ? (
        <p role="alert" className="text-sm text-red-600">
          {erreur}
        </p>
      ) : null}
    </form>
  )
}
