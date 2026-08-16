'use client'

import { useRef, useState } from 'react'
import { Bouton } from '@/composants/ui/bouton'
import { Dialogue } from '@/composants/ui/dialogue'

/**
 * ═══ D124 — `window.confirm` BLOQUE, UN `<dialog>` NE BLOQUE PAS ═══
 * Voir le commentaire de tête de `antennes/bouton-bascule-antenne.tsx`, le gabarit des dix
 * confirmations de famille A. La forme d'origine calculait `confirme` puis testait sa
 * négation ; la variable intermédiaire disparaît avec l'appel bloquant — `preventDefault()`
 * est désormais inconditionnel, la soumission est rejouée dans `surConfirmation`.
 * LE MESSAGE NE CHANGE PAS D'UN OCTET (D117).
 */
export function BoutonRetirerStatut({ libelle }: { libelle: string }) {
  const message =
    `Retirer le statut « ${libelle} » ?\n\n` +
    'Le retrait est enregistré au journal et reste consultable ; le statut ' +
    'pourra être réattribué.'

  const [confirmationDemandee, setConfirmationDemandee] = useState(false)
  const bouton = useRef<HTMLButtonElement | null>(null)

  return (
    <>
      <Bouton
        ref={bouton}
        type="submit"
        variante="lien-danger"
        onClick={(evenement) => {
          evenement.preventDefault()
          setConfirmationDemandee(true)
        }}
      >
        Retirer
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
