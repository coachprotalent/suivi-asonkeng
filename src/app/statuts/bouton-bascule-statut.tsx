'use client'

import { useRef, useState } from 'react'
import { Bouton } from '@/composants/ui/bouton'
import { Dialogue } from '@/composants/ui/dialogue'

/**
 * ═══ D124 — `window.confirm` BLOQUE, UN `<dialog>` NE BLOQUE PAS ═══
 * Voir le commentaire de tête de `antennes/bouton-bascule-antenne.tsx`, le gabarit des dix
 * confirmations de famille A. LE MESSAGE NE CHANGE PAS D'UN OCTET (D117).
 */
export function BoutonBasculeStatut({
  libelle,
  desactiver,
}: {
  libelle: string
  desactiver: boolean
}) {
  const message = desactiver
    ? `Désactiver le statut « ${libelle} » ?\n\n` +
      "Il ne pourra plus être attribué, mais les membres qui le portent le " +
      'conservent, et vous pourrez le réactiver.'
    : `Réactiver le statut « ${libelle} » ?`

  const [confirmationDemandee, setConfirmationDemandee] = useState(false)
  const bouton = useRef<HTMLButtonElement | null>(null)

  return (
    <>
      <Bouton
        ref={bouton}
        type="submit"
        variante={desactiver ? 'lien-danger' : 'lien'}
        onClick={(evenement) => {
          evenement.preventDefault()
          setConfirmationDemandee(true)
        }}
      >
        {desactiver ? 'Désactiver' : 'Réactiver'}
      </Bouton>

      <Dialogue
        ouvert={confirmationDemandee}
        message={message}
        surConfirmation={() => {
          setConfirmationDemandee(false)
          bouton.current?.form?.requestSubmit(bouton.current)
        }}
        surAnnulation={() => setConfirmationDemandee(false)}
      />
    </>
  )
}
