'use client'

import { useRef, useState } from 'react'
import { Bouton } from '@/composants/ui/bouton'
import { Dialogue } from '@/composants/ui/dialogue'

/**
 * ═══ D124 — `window.confirm` BLOQUE, UN `<dialog>` NE BLOQUE PAS ═══
 *
 * Le code appelant CHANGE DE FORME. Là où `if (!window.confirm(…)) evenement.preventDefault()`
 * suffisait — parce qu'au retour de `confirm` on savait déjà —, il faut désormais :
 *   1. TOUJOURS `preventDefault()` : le dialogue s'ouvre, la soumission n'a pas lieu ;
 *   2. REJOUER la soumission dans le rappel de confirmation.
 *
 * `form.requestSubmit(bouton)` et NON `form.submit()` :
 *   - `submit()` ne déclenche PAS l'événement `submit`. React ne verrait jamais la
 *     soumission, et la Server Action ne partirait pas ;
 *   - `requestSubmit(déclencheur)` conserve le DÉCLENCHEUR, donc les champs cachés que le
 *     formulaire porte et son `action` ;
 *   - `requestSubmit()` applique la VALIDATION DE CONTRAINTE, exactement comme un vrai clic.
 *
 * `requestSubmit(déclencheur)` NE REFIRE PAS de `click` sur le déclencheur (algorithme de
 * soumission du HTML) : aucun garde de ré-entrée n'est nécessaire.
 *
 * LE MESSAGE NE CHANGE PAS D'UN OCTET (D117). Ses `\n\n` sont rendus par le
 * `whitespace-pre-line` du `Dialogue`, et produisent la même coupure de paragraphe que dans
 * la boîte native.
 */
export function BoutonBasculeAntenne({ nom, desactiver }: { nom: string; desactiver: boolean }) {
  const message = desactiver
    ? `Désactiver l'antenne « ${nom} » ?\n\n` +
      "Elle n'apparaîtra plus dans les formulaires, mais les membres qui y sont " +
      'rattachés le restent, et vous pourrez la réactiver.'
    : `Réactiver l'antenne « ${nom} » ?`

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
          // `bouton.current.form` : le `<form action={…}>` parent, écrit par la page.
          bouton.current?.form?.requestSubmit(bouton.current)
        }}
        surAnnulation={() => setConfirmationDemandee(false)}
      />
    </>
  )
}
