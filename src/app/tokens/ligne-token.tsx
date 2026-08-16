'use client'

import { useState, useTransition } from 'react'
import { Bouton } from '@/composants/ui/bouton'
import { Dialogue } from '@/composants/ui/dialogue'
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

  // `revoquerToken` RETOURNE son refus, elle ne le lève plus (correction
  // post-Task-17 : un `throw` levé depuis une Server Action perd son message
  // en production — voir le commentaire de tête de `src/app/tokens/actions.ts`).
  // Toujours appelée depuis un `useTransition` plutôt que liée à
  // `<form action={...}>` : la lier directement ferait passer par
  // `src/app/error.tsx`, qui affiche un texte STATIQUE, sur toute panne
  // technique imprévue qui, elle, peut encore lever.
  //
  // ═══ D124 — voir le commentaire de tête de `comptes/ligne-compte.tsx`. Site « sans
  // danger » (relevé d'avance) : aucun `evenement.currentTarget` en jeu, la `FormData`
  // est construite de zéro à partir de `token.id`.
  const messageRevocation = `Révoquer ce token ${token.mode === 'nominatif' ? `(${token.membreNom ?? 'fiche inconnue'})` : 'générique'} ?`
  const [confirmationDemandee, setConfirmationDemandee] = useState(false)

  function executerRevocation() {
    const donnees = new FormData()
    donnees.set('tokenId', token.id)
    setErreur(null)
    demarrer(async () => {
      const { erreur } = await revoquerToken(donnees)
      if (erreur) {
        setErreur(erreur)
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
        <div className="mt-esp-2">
          <Bouton
            type="button"
            variante="lien-danger"
            enCours={enCours}
            libelleAttente="Révocation…"
            onClick={() => setConfirmationDemandee(true)}
          >
            Révoquer
          </Bouton>

          <Dialogue
            ouvert={confirmationDemandee}
            message={messageRevocation}
            surConfirmation={() => {
              setConfirmationDemandee(false)
              executerRevocation()
            }}
            surAnnulation={() => setConfirmationDemandee(false)}
          />
        </div>
      ) : null}
      {erreur ? (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {erreur}
        </p>
      ) : null}
    </li>
  )
}
