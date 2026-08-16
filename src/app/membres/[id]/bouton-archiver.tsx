'use client'

import { useRef, useState } from 'react'
import { Bouton } from '@/composants/ui/bouton'
import { Dialogue } from '@/composants/ui/dialogue'

/**
 * ═══ D124 — `window.confirm` BLOQUE, UN `<dialog>` NE BLOQUE PAS ═══
 * Voir le commentaire de tête de `antennes/bouton-bascule-antenne.tsx`, le gabarit des dix
 * confirmations de famille A. SEUL LE `onClick` CHANGE : la construction du message en
 * quatre branches ci-dessous n'est pas touchée — elle est déjà hors du `onClick`, déjà
 * correcte, et `tests/e2e/annuaire.spec.ts:183-190` et
 * `tests/e2e/archivage-compte.spec.ts:151-160` l'assertent au mot près.
 */
export function BoutonArchiver({
  nomComplet,
  archiver,
  // `true` : compte lié actif ; `false` : compte lié désactivé ; `null`/`undefined` :
  // aucun compte lié. Sert UNIQUEMENT à choisir le bon avertissement ci-dessous — voir
  // `etatCompteLie` (src/lib/donnees/comptes.ts). Empêcher vaut mieux qu'avertir, mais
  // avertir vaut infiniment mieux que surprendre (D24) : un bouton qui révoque aussi
  // l'accès de quelqu'un doit le dire avant qu'on clique, pas après.
  compteLie,
}: {
  nomComplet: string
  archiver: boolean
  compteLie?: boolean | null
}) {
  let message: string
  if (archiver) {
    message =
      `Archiver la fiche de ${nomComplet} ?\n\n` +
      "Elle disparaîtra de l'annuaire, mais rien n'est supprimé : " +
      'la fiche et son historique restent consultables.'
    if (compteLie === true) {
      message +=
        `\n\nLe compte de connexion lié à cette fiche sera désactivé : ${nomComplet} ne ` +
        "pourra plus se connecter tant qu'un administrateur ne l'aura pas réactivé, sur " +
        "l'écran des comptes."
    }
  } else {
    message = `Rétablir la fiche de ${nomComplet} ?\n\nElle réapparaîtra dans l'annuaire.`
    if (compteLie === false) {
      // D24 : la réciproque n'est PAS vraie, rétablir ne réactive rien — dit ici pour
      // que l'asymétrie ne passe pas pour un bug.
      message +=
        '\n\nLe compte de connexion lié à cette fiche reste désactivé : rétablir la fiche ' +
        "ne le réactive pas. Cela se fait séparément, sur l'écran des comptes."
    }
  }

  const [confirmationDemandee, setConfirmationDemandee] = useState(false)
  const bouton = useRef<HTMLButtonElement | null>(null)

  return (
    <>
      <Bouton
        ref={bouton}
        type="submit"
        variante={archiver ? 'lien-danger' : 'lien'}
        onClick={(evenement) => {
          evenement.preventDefault()
          setConfirmationDemandee(true)
        }}
      >
        {archiver ? 'Archiver' : 'Rétablir'}
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
