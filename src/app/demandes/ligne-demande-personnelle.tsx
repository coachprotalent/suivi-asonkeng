'use client'

import { useState, useTransition } from 'react'
import type { DemandeListe } from '@/lib/donnees/demandes'
import { annulerDemandeSuivi } from './actions'

const LIBELLE_ETAT: Record<DemandeListe['etat'], string> = {
  en_attente: 'En attente',
  validee: 'Validée',
  rejetee: 'Rejetée',
  annulee: 'Annulée',
}

export function LigneDemandePersonnelle({ demande }: { demande: DemandeListe }) {
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, demarrer] = useTransition()

  function annuler() {
    if (!window.confirm('Annuler cette demande ? La fiche créée sera supprimée.')) return
    const donnees = new FormData()
    donnees.set('demandeId', demande.id)
    setErreur(null)
    demarrer(async () => {
      // `annulerDemandeSuivi` RETOURNE son refus, elle ne le lève plus
      // (correction post-Task-17 : un `throw` perd son message en production,
      // voir le commentaire de tête de `src/app/demandes/actions.ts`).
      const { erreur } = await annulerDemandeSuivi(donnees)
      if (erreur) {
        setErreur(erreur)
      }
    })
  }

  return (
    <li className="py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">
          {demande.membrePrenom ?? '—'} {demande.membreNom ?? ''}
        </span>
        <span className="text-sm text-neutral-500">{LIBELLE_ETAT[demande.etat]}</span>
      </div>
      {demande.etat === 'rejetee' && demande.motifRejet ? (
        <p className="mt-1 text-sm text-neutral-600">Motif : {demande.motifRejet}</p>
      ) : null}
      {demande.etat === 'en_attente' ? (
        <button
          type="button"
          onClick={annuler}
          disabled={enCours}
          className="mt-2 text-sm text-red-600 underline underline-offset-4 disabled:opacity-50"
        >
          {enCours ? 'Annulation…' : 'Annuler'}
        </button>
      ) : null}
      {erreur ? (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {erreur}
        </p>
      ) : null}
    </li>
  )
}
