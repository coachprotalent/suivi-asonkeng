'use client'

import { useRef, useState } from 'react'
import { Bouton } from '@/composants/ui/bouton'
import { CLASSES_CHAMP } from '@/composants/ui/champ'
import { Dialogue } from '@/composants/ui/dialogue'
import { retirerStatut } from './actions'

/**
 * ═══ D124 — `window.confirm` BLOQUE, UN `<dialog>` NE BLOQUE PAS ═══
 * Voir le commentaire de tête de `antennes/bouton-bascule-antenne.tsx`, le gabarit des dix
 * confirmations de famille A. LE MESSAGE NE CHANGE PAS D'UN OCTET (D117). CETTE PARTIE DU
 * FICHIER N'EST PAS RETOUCHÉE PAR LA TASK 22 (site A9, converti à la Task 13) — seule la
 * présentation autour d'elle change.
 *
 * ═══ RENOMMÉ DEPUIS `BoutonRetirerStatut` (Task 22) ═══
 * Le fichier absorbe désormais aussi le champ « motif », auparavant un `<input>` NU rendu
 * directement par `page.tsx` — le seul champ libre de ce fichier serveur (D111). Un champ
 * non contrôlé dans un `<form action>` ne survit pas à la complétion de l'action ; il n'y
 * avait ici ni `value` ni `onChange`. Fermer ce champ suppose un état local, donc un
 * composant client — celui-ci, qui portait déjà le bouton et le `Dialogue` de la même
 * ligne.
 *
 * `Champ` n'est PAS employé pour ce champ : son `<label>` est TOUJOURS visible, et ce
 * champ n'en a jamais eu — seulement un `aria-label`, repris ici À L'IDENTIQUE (D117). Le
 * composer avec `Champ` ajouterait un texte affiché nouveau, non déclaré. `CLASSES_CHAMP`
 * (exportée par `champ.tsx` pour exactement ce cas) donne l'apparence sans le label.
 */
export function FormulaireRetraitStatut({
  membreId,
  statutId,
  libelle,
}: {
  membreId: string
  statutId: string
  libelle: string
}) {
  const message =
    `Retirer le statut « ${libelle} » ?\n\n` +
    'Le retrait est enregistré au journal et reste consultable ; le statut ' +
    'pourra être réattribué.'

  const [motif, setMotif] = useState('')
  const [confirmationDemandee, setConfirmationDemandee] = useState(false)
  const bouton = useRef<HTMLButtonElement | null>(null)

  return (
    <form action={retirerStatut} className="flex flex-wrap items-center gap-esp-2">
      <input type="hidden" name="membreId" value={membreId} />
      <input type="hidden" name="statutId" value={statutId} />
      {/*
        `maxLength` n'est pas décoratif : `retirerStatut` n'a aucun canal pour renvoyer
        un message de validation, et un motif trop long y serait journalisé puis
        remplacé par null — le retrait réussirait sans le motif, sans un mot à
        l'utilisateur. La limite se voit donc au moment où l'on écrit, pas après coup.
      */}
      <input
        type="text"
        name="motif"
        value={motif}
        onChange={(evenement) => setMotif(evenement.target.value)}
        maxLength={500}
        placeholder="Motif du retrait (facultatif)"
        aria-label={`Motif du retrait du statut « ${libelle} »`}
        className={CLASSES_CHAMP}
      />

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
    </form>
  )
}
