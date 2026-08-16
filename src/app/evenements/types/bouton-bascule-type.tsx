'use client'

import { useRef, useState } from 'react'
import { Bouton } from '@/composants/ui/bouton'
import { Dialogue } from '@/composants/ui/dialogue'

type Props = { libelle: string; actif: boolean }

/**
 * Confirmation avant bascule. Un type désactivé disparaît des NOUVELLES attributions mais
 * reste visible sur les événements passés (spec §7, même régime que les statuts) : la
 * confirmation le dit, sans quoi « désactiver » se lirait comme « supprimer ».
 *
 * ═══ D124 — `window.confirm` BLOQUE, UN `<dialog>` NE BLOQUE PAS ═══
 * Voir le commentaire de tête de `antennes/bouton-bascule-antenne.tsx`, le gabarit des dix
 * confirmations de famille A. LE MESSAGE NE CHANGE PAS D'UN OCTET (D117). La classe reste
 * `lien` dans les deux états — ce fichier ne portait déjà pas de variante danger avant
 * migration, et ce n'est pas à cette tâche de le décider.
 */
export function BoutonBasculeType({ libelle, actif }: Props) {
  const texte = actif
    ? `Désactiver « ${libelle} » ? Il ne sera plus proposé pour un nouvel événement, mais restera affiché sur les événements passés.`
    : `Réactiver « ${libelle} » ?`

  const [confirmationDemandee, setConfirmationDemandee] = useState(false)
  const bouton = useRef<HTMLButtonElement | null>(null)

  return (
    <>
      <Bouton
        ref={bouton}
        type="submit"
        variante="lien"
        onClick={(evenement) => {
          evenement.preventDefault()
          setConfirmationDemandee(true)
        }}
      >
        {actif ? 'Désactiver' : 'Réactiver'}
      </Bouton>

      <Dialogue
        ouvert={confirmationDemandee}
        message={texte}
        surConfirmation={() => {
          setConfirmationDemandee(false)
          bouton.current?.form?.requestSubmit(bouton.current)
        }}
        surAnnulation={() => setConfirmationDemandee(false)}
      />
    </>
  )
}
