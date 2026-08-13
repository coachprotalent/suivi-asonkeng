'use client'

import { useState, useTransition, type FormEvent } from 'react'
import type { DemandeListe } from '@/lib/donnees/demandes'
import type { MembreBref } from '@/lib/donnees/membres'
import { SelecteurMembre } from '@/app/membres/selecteur-membre'
import {
  rejeterDemande,
  validerDemandeNouvellePersonne,
  validerDemandeRattachement,
  type ResultatDemande,
} from './actions'
import { FormulaireValidationSuivi } from './formulaire-validation-suivi'

export function LigneDemandeAdmin({
  demande,
  dirigeantInitial,
}: {
  demande: DemandeListe
  dirigeantInitial: MembreBref | null
}) {
  const [ficheRattachement, setFicheRattachement] = useState<MembreBref | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, demarrer] = useTransition()

  // Les trois actions RETOURNENT leur refus, elles ne le lèvent plus
  // (correction post-Task-17 : un `throw` perd son message en production —
  // voir le commentaire de tête de `src/app/demandes/actions.ts`).
  function appeler(action: (donnees: FormData) => Promise<ResultatDemande>, donnees: FormData) {
    setErreur(null)
    demarrer(async () => {
      const { erreur } = await action(donnees)
      if (erreur) {
        setErreur(erreur)
      }
    })
  }

  function validerNouvellePersonneAutoInscription() {
    const donnees = new FormData()
    donnees.set('demandeId', demande.id)
    appeler(validerDemandeNouvellePersonne, donnees)
  }

  function soumettreRattachement(evenement: FormEvent<HTMLFormElement>) {
    evenement.preventDefault()
    if (!ficheRattachement) return
    const donnees = new FormData()
    donnees.set('demandeId', demande.id)
    donnees.set('membreExistantId', ficheRattachement.id)
    appeler(validerDemandeRattachement, donnees)
  }

  function soumettreRejet(evenement: FormEvent<HTMLFormElement>) {
    evenement.preventDefault()
    appeler(rejeterDemande, new FormData(evenement.currentTarget))
  }

  return (
    <li className="py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">
          {demande.membrePrenom} {demande.membreNom}
        </span>
        <span className="text-sm text-neutral-500">
          {demande.origine === 'auto_inscription' ? 'Auto-inscription' : 'Demande de suivi'} · par{' '}
          {demande.demandeurNom}
        </span>
      </div>

      {demande.origine === 'auto_inscription' ? (
        <div className="mt-3 flex flex-col gap-3">
          <button
            type="button"
            onClick={validerNouvellePersonneAutoInscription}
            disabled={enCours}
            className="self-start rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            Valider comme nouvelle personne
          </button>

          <form onSubmit={soumettreRattachement} className="flex flex-wrap items-end gap-3">
            <div className="min-w-64 flex-1">
              <SelecteurMembre
                nom="membreExistantId"
                label="Ou rattacher à une fiche existante"
                aide="La fiche en_attente créée à l'inscription sera supprimée."
                valeur={ficheRattachement}
                surChoix={setFicheRattachement}
                exclureId={demande.membreId}
              />
            </div>
            <button
              type="submit"
              disabled={enCours || !ficheRattachement}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-50"
            >
              Rattacher
            </button>
          </form>
        </div>
      ) : (
        <FormulaireValidationSuivi
          demandeId={demande.id}
          membreId={demande.membreId ?? ''}
          demandeurMembreId={demande.demandeurMembreId}
          dirigeantInitial={dirigeantInitial}
        />
      )}

      <form onSubmit={soumettreRejet} className="mt-3 flex flex-wrap items-end gap-3">
        <input type="hidden" name="demandeId" value={demande.id} />
        <input type="hidden" name="demandeurProfilId" value={demande.demandeurProfilId} />
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium">Motif de rejet</span>
          <input name="motif" required className="rounded-md border border-neutral-300 px-3 py-2" />
        </label>
        <button
          type="submit"
          disabled={enCours}
          className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-600 disabled:opacity-50"
        >
          Rejeter
        </button>
      </form>

      {erreur ? (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {erreur}
        </p>
      ) : null}
    </li>
  )
}
