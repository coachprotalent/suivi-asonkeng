'use client'

import { useActionState, useRef, useState } from 'react'
import { Bouton } from '@/composants/ui/bouton'
import { Dialogue } from '@/composants/ui/dialogue'
import { LigneListe } from '@/composants/ui/ligne-liste'
import { Refus } from '@/composants/ui/refus'
import type { MembreBref } from '@/lib/donnees/membres'
import { definirAntenneMembre, type EtatRattachement } from './actions'

const etatInitial: EtatRattachement = { erreur: null }

/**
 * ═══ D124 — `window.confirm` BLOQUE, UN `<dialog>` NE BLOQUE PAS ═══
 * Voir le commentaire de tête de `antennes/bouton-bascule-antenne.tsx`, le gabarit des dix
 * confirmations de famille A (site A4, CETTE CONVERSION N'EST PAS RETOUCHÉE À LA TASK 22).
 * LE MESSAGE NE CHANGE PAS D'UN OCTET (D117). `disabled={enCours}` devient `enCours={enCours}`
 * sur `Bouton`, avec `libelleAttente="Détachement…"` — le libellé basculait déjà ainsi, ce
 * n'est pas un texte neuf.
 *
 * ⚠️ PAS DE RAIL DE FILIATION (D106) : voir `page.tsx`.
 */
export function LigneMembreDetachable({
  membre,
  antenneId,
}: {
  membre: MembreBref
  antenneId: string
}) {
  const [etat, envoyer, enCours] = useActionState(definirAntenneMembre, etatInitial)
  const [confirmationDemandee, setConfirmationDemandee] = useState(false)
  const bouton = useRef<HTMLButtonElement | null>(null)

  const message =
    `Détacher ${membre.prenom} ${membre.nom} de cette antenne ?\n\n` +
    "Cette personne n'apparaîtra plus dans les listes de pointage " +
    'pré-remplies des prochaines séances de cette antenne. Son historique ' +
    'de présence reste intact.'

  return (
    <LigneListe
      principal={`${membre.prenom} ${membre.nom}`}
      lien={`/membres/${membre.id}`}
      actions={
        <form action={envoyer}>
          <input type="hidden" name="membreId" value={membre.id} />
          <input type="hidden" name="pageAntenneId" value={antenneId} />
          {/*
            Pas de champ `antenneId` : `champOuNull` (Task 3) le lit `null`, ce qui
            DÉTACHE. `pageAntenneId` sert uniquement à revalider la bonne page.
          */}
          <Bouton
            ref={bouton}
            type="submit"
            variante="lien-danger"
            enCours={enCours}
            libelleAttente="Détachement…"
            onClick={(evenement) => {
              evenement.preventDefault()
              setConfirmationDemandee(true)
            }}
          >
            Détacher
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
        </form>
      }
      complement={etat.erreur ? <Refus message={etat.erreur} /> : undefined}
    />
  )
}
