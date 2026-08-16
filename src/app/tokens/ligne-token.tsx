'use client'

import { useState, useTransition } from 'react'
import { Bouton } from '@/composants/ui/bouton'
import { Dialogue } from '@/composants/ui/dialogue'
import { EtatBadge, type TonEtat } from '@/composants/ui/etat-badge'
import { LigneListe } from '@/composants/ui/ligne-liste'
import { Refus } from '@/composants/ui/refus'
import type { TokenListe } from '@/lib/donnees/tokens'
import { revoquerToken } from './actions'

/*
  `etatToken` rend DÉJÀ une chaîne composée (« Utilisé le … », « Révoqué le … », « Expiré »,
  « Valide »). NE PAS LA DÉCOMPOSER : elle est assertée par `tests/e2e/tokens.spec.ts`. Une
  seconde fonction rend le TON, à partir des mêmes champs (D126) — voir `tonToken` plus bas.
*/
function etatToken(token: TokenListe): string {
  if (token.utiliseLe) return `Utilisé le ${new Date(token.utiliseLe).toLocaleString('fr-FR')}`
  if (token.revoqueLe) return `Révoqué le ${new Date(token.revoqueLe).toLocaleString('fr-FR')}`
  if (new Date(token.expireLe) < new Date()) return 'Expiré'
  return 'Valide'
}

function tonToken(token: TokenListe): TonEtat {
  if (token.utiliseLe) return 'acquis'
  if (token.revoqueLe) return 'refus'
  if (new Date(token.expireLe) < new Date()) return 'refus'
  return 'attente'
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
    <LigneListe
      principal={
        token.mode === 'nominatif' ? `Nominatif — ${token.membreNom ?? 'fiche inconnue'}` : 'Générique'
      }
      meta={
        <>
          Créé le {new Date(token.creeLe).toLocaleString('fr-FR')}
          {token.creeParNom ? ` par ${token.creeParNom}` : ''} · Expire le{' '}
          {new Date(token.expireLe).toLocaleString('fr-FR')}
          {token.utiliseParNom ? ` · Utilisé par ${token.utiliseParNom}` : ''}
        </>
      }
      actions={<EtatBadge ton={tonToken(token)} libelle={etatToken(token)} />}
      complement={
        revocable || erreur ? (
          <div className="flex flex-col gap-esp-2">
            {revocable ? (
              <div>
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
            <Refus message={erreur} />
          </div>
        ) : undefined
      }
    />
  )
}
