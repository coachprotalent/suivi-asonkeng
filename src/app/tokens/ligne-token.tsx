'use client'

import { useState, useTransition } from 'react'
import type { TokenListe } from '@/lib/donnees/tokens'
import { revoquerToken } from './actions'

function etatToken(token: TokenListe): string {
  if (token.utiliseLe) return `Utilisé le ${new Date(token.utiliseLe).toLocaleString('fr-FR')}`
  if (token.revoqueLe) return `Révoqué le ${new Date(token.revoqueLe).toLocaleString('fr-FR')}`
  if (new Date(token.expireLe) < new Date()) return 'Expiré'
  return 'Valide'
}

export function LigneToken({ token }: { token: TokenListe }) {
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, demarrer] = useTransition()
  const revocable = !token.revoqueLe && !token.utiliseLe

  // `revoquerToken` LÈVE plutôt que de renvoyer un état (contrat de la Task 15) :
  // la lier à `<form action={...}>` directement ferait remonter l'exception
  // jusqu'à `src/app/error.tsx`, qui affiche un texte STATIQUE — même piège que
  // `lierFiche` en 1c. On l'appelle donc depuis un `useTransition` avec try/catch.
  function soumettre() {
    if (!window.confirm(`Révoquer ce token ${token.mode === 'nominatif' ? `(${token.membreNom ?? 'fiche inconnue'})` : 'générique'} ?`)) {
      return
    }
    const donnees = new FormData()
    donnees.set('tokenId', token.id)
    setErreur(null)
    demarrer(async () => {
      try {
        await revoquerToken(donnees)
      } catch (erreur) {
        setErreur(erreur instanceof Error ? erreur.message : String(erreur))
      }
    })
  }

  return (
    <li className="py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">
          {token.mode === 'nominatif' ? `Nominatif — ${token.membreNom ?? 'fiche inconnue'}` : 'Générique'}
        </span>
        <span className="text-sm text-neutral-500">{etatToken(token)}</span>
      </div>
      <p className="mt-1 text-sm text-neutral-600">
        Créé le {new Date(token.creeLe).toLocaleString('fr-FR')}
        {token.creeParNom ? ` par ${token.creeParNom}` : ''} · Expire le{' '}
        {new Date(token.expireLe).toLocaleString('fr-FR')}
        {token.utiliseParNom ? ` · Utilisé par ${token.utiliseParNom}` : ''}
      </p>
      {revocable ? (
        <button
          type="button"
          onClick={soumettre}
          disabled={enCours}
          className="mt-2 text-sm text-red-600 underline underline-offset-4 disabled:opacity-50"
        >
          {enCours ? 'Révocation…' : 'Révoquer'}
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
