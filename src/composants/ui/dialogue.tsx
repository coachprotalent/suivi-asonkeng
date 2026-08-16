'use client'

import { useEffect, useId, useRef } from 'react'
import { Bouton } from './bouton'

/*
  ═══ D124 / D125 — LE DIXIÈME COMPOSANT, ET LE SEUL QUI CRÉE UN COMPORTEMENT ═══

  Quinze `window.confirm()` dans le dépôt, ZÉRO `<dialog>`, ZÉRO `role="dialog"`.
  `window.confirm()` n'est pas stylable, BLOQUE le fil d'exécution, se présente hors de la
  page, et sur mobile s'affiche comme une alerte système que rien ne rattache à
  l'application. Le remplacer est le SEUL geste de cette phase qui change un comportement
  perceptible.

  ═══ POURQUOI LE `<dialog>` NATIF, ET PAS UN MODAL ÉCRIT À LA MAIN ═══

  `showModal()` donne les TROIS comportements qui font la valeur de ce composant, sans une
  ligne de piégeage :
    - FOCUS PIÉGÉ : le contenu passe dans la couche supérieure et le reste du document
      devient inerte. La tabulation ne peut pas en sortir.
    - `Échap` FERME : le navigateur émet `cancel`, puis `close`.
    - RESTITUTION DU FOCUS : le navigateur rend le focus au dernier élément focalisé.
  Un piège de focus écrit à la main, c'est cent lignes de `keydown`, une liste de sélecteurs
  focalisables à maintenir, et un défaut par navigateur.

  ═══ `<form method="dialog">` — LE MÉCANISME QUI DISTINGUE CONFIRMER D'ANNULER ═══

  Un `<button value="…">` dans un `<form method="dialog">` ferme le dialogue ET pose sa
  valeur dans `dialog.returnValue`. `Échap`, lui, ferme SANS poser de valeur :
  `returnValue` reste la chaîne vide. UN SEUL gestionnaire `onClose` suffit donc à
  distinguer les trois issues — confirmé, annulé au bouton, annulé par `Échap` — et il n'y a
  aucun chemin par lequel le dialogue se ferme sans qu'une de nos deux fonctions de rappel
  soit appelée. C'est ce qui rend impossible l'état « dialogue fermé, appelant qui attend
  encore ».

  ═══ LA RESTITUTION EXPLICITE DU FOCUS, EN PLUS DE CELLE DU NAVIGATEUR ═══

  Le navigateur restitue déjà. On le refait quand même, pour deux raisons : la restitution
  native n'est pas OBSERVABLE par une preuve qui ne saurait pas si elle vient du navigateur
  ou du code, et surtout `surConfirmation` re-soumet souvent le formulaire du déclencheur
  (Task 13) — il FAUT que le focus soit revenu AVANT, faute de quoi un `requestSubmit`
  déclenché depuis un `<body>` focalisé laisserait l'utilisateur clavier en haut de page.

  ═══ CE COMPOSANT NE DÉCIDE DE RIEN ═══

  Il ne construit aucun message, n'en préfixe aucun, ne titre rien. Les quinze messages
  arrivent tels quels de leur site d'appel, INCHANGÉS À L'OCTET PRÈS (D117), et sont rendus
  en `whitespace-pre-line` pour que leurs `\n\n` produisent la même coupure de paragraphe
  que dans la boîte native.
*/
export const LIBELLE_CONFIRMER = 'Confirmer'
export const LIBELLE_ANNULER = 'Annuler'

const VALEUR_CONFIRMER = 'confirmer'

export type ProprietesDialogue = {
  ouvert: boolean
  /** Le message de confirmation, tel quel. Ses `\n` sont préservés. */
  message: string
  surConfirmation: () => void
  surAnnulation: () => void
}

export function Dialogue({ ouvert, message, surConfirmation, surAnnulation }: ProprietesDialogue) {
  const reference = useRef<HTMLDialogElement | null>(null)
  const declencheur = useRef<HTMLElement | null>(null)
  const idMessage = useId()

  useEffect(() => {
    const element = reference.current
    if (!element) return

    /*
      Les deux gardes `element.open` ferment la boucle : `surAnnulation` met `ouvert` à
      `false`, ce qui rejoue cet effet — mais le dialogue est DÉJÀ fermé à ce moment
      (`close` a précédé le rappel), donc `element.close()` n'est pas rappelé, et `close`
      n'est pas réémis. Sans ces gardes, `showModal()` sur un dialogue déjà ouvert lèverait
      un `InvalidStateError`.
    */
    if (ouvert && !element.open) {
      declencheur.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null
      element.showModal()
    } else if (!ouvert && element.open) {
      element.close()
    }
  }, [ouvert])

  function terminer() {
    const element = reference.current
    const confirme = element?.returnValue === VALEUR_CONFIRMER
    // Remise à zéro : sans elle, une deuxième ouverture fermée par `Échap` hériterait de la
    // valeur de la première, et serait lue comme une confirmation.
    if (element) element.returnValue = ''

    // AVANT le rappel : voir le commentaire de tête.
    const cible = declencheur.current
    declencheur.current = null
    cible?.focus()

    if (confirme) surConfirmation()
    else surAnnulation()
  }

  return (
    <dialog
      ref={reference}
      onClose={terminer}
      aria-labelledby={idMessage}
      className="m-auto max-w-md rounded-bord border border-bord-carte bg-surface p-esp-6 text-encre backdrop:bg-voile"
    >
      {/*
        `method="dialog"` : les deux boutons ferment le dialogue nativement et posent leur
        `value` dans `returnValue`. Aucun `preventDefault`, aucun gestionnaire de clic.
      */}
      <form method="dialog" className="flex flex-col gap-esp-6">
        <p id={idMessage} className="text-corps whitespace-pre-line">
          {message}
        </p>
        <div className="flex flex-wrap justify-end gap-esp-3">
          {/*
            ANNULER EN PREMIER DANS L'ORDRE DE TABULATION. Le premier élément focalisable
            reçoit le focus à l'ouverture d'un `<dialog>` modal : sur une confirmation de
            geste irréversible — archivage d'une fiche, révocation d'un token, conversion
            définitive d'un participant —, un `Entrée` réflexe doit renoncer, pas valider.
          */}
          <Bouton type="submit" value="" variante="secondaire">
            {LIBELLE_ANNULER}
          </Bouton>
          <Bouton type="submit" value={VALEUR_CONFIRMER} variante="principal">
            {LIBELLE_CONFIRMER}
          </Bouton>
        </div>
      </form>
    </dialog>
  )
}
