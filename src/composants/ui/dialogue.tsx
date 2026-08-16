'use client'

import { useEffect, useId, useRef, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { Bouton } from './bouton'

/*
  `useSyncExternalStore` sans magasin réel : le « magasin » ne change jamais après le
  montage, `abonner` ne fait donc rien et son désabonnement non plus. Ce triplet est le
  patron RECOMMANDÉ par React pour détecter le client APRÈS l'hydratation SANS l'anti-
  patron `useEffect` + `setState` (voir le commentaire de `monte` plus bas) : React appelle
  `instantane_serveur` pour le rendu serveur ET pour la passe d'hydratation côté client —
  donc `false` aux DEUX — puis, une fois l'hydratation terminée, React force de lui-même un
  rendu client supplémentaire avec `instantane_client`, sans qu'aucun `setState` explicite
  ne soit nécessaire ici.
*/
function abonner() {
  return () => {}
}
function instantaneClient() {
  return true
}
function instantaneServeur() {
  return false
}

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

  /*
    ═══ `monte`, ET NON `typeof document === 'undefined'` — TROUVÉ EN FAISANT TOURNER LA
    VRAIE SUITE E2E APRÈS UN PREMIER CORRECTIF FAUX (Task 15) ═══

    Un premier correctif testait `typeof document === 'undefined'` pour décider de rendre
    le portail. MESURÉ FAUX : côté serveur, `typeof document` vaut `undefined` — mais côté
    client, DÈS LA PASSE D'HYDRATATION (celle qui doit encore correspondre au HTML du
    serveur), `typeof document` vaut déjà `"object"`. Le composant rendait donc DEUX FORMES
    DIFFÉRENTES selon l'environnement AU MOMENT MÊME où React compare serveur et client —
    exactement l'anti-patron que le message d'erreur de React nomme explicitement : « A
    server/client branch `if (typeof window !== 'undefined')` ». Observé RÉELLEMENT dans
    les journaux du serveur de dev : « Hydration failed », avec un `<dialog>` en trop dans
    l'arbre client — sur `/ael/seances/[id]` (`BoutonTransitionEtat`) ET `/antennes/[id]`
    (`LigneMembreDetachable`), pas seulement le premier site trouvé.

    UN DEUXIÈME CORRECTIF (`useState` + `useEffect(() => setMonte(true), [])`) a lui-même
    été refusé par la porte `lint` — `react-hooks/set-state-in-effect`, à raison : un
    `setState` synchrone dans un effet est exactement le « cascading render » que la règle
    signale, même quand l'intention (détecter le client après l'hydratation) est légitime.

    `useSyncExternalStore` ferme le cas PAR CONSTRUCTION, sans `setState` dans un effet :
    `instantaneServeur` (donc `false`) sert pour le rendu serveur ET pour la passe
    d'hydratation côté client — les deux rendent `null`, rien à réconcilier. React lui-même,
    une fois l'hydratation terminée, redemande `instantaneClient` (donc `true`) et provoque
    le rendu supplémentaire qui affiche le portail — un rendu client ORDINAIRE, jamais
    comparé au HTML du serveur. C'est le patron OFFICIELLEMENT RECOMMANDÉ par React pour ce
    cas précis, pas une invention de ce fichier.
  */
  const monte = useSyncExternalStore(abonner, instantaneClient, instantaneServeur)

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
    /*
      ⚠️ `monte` DANS LE TABLEAU DE DÉPENDANCES (revue des Tasks 12-15, Mineur) — absent
      jusqu'ici, sans conséquence AUJOURD'HUI puisque les quinze sites partent tous fermés
      (`ouvert` false au premier rendu) : cet effet ne fait rien tant que `ouvert` ne
      devient pas `true`, ce qui ne peut arriver qu'APRÈS le montage, donc après que
      `monte` soit passé à `true` et que `reference.current` pointe un vrai `<dialog>`.
      Mais un site qui monterait un jour avec `ouvert={true}` D'EMBLÉE romprait cet ordre :
      la première passe (serveur et hydratation, `monte` encore `false`) rendrait `null`,
      `reference.current` resterait `null`, et cet effet — dont les dépendances
      n'incluaient QUE `ouvert`, inchangé — ne serait jamais rejoué au rendu client
      supplémentaire qui suit. Le dialogue ne s'ouvrirait jamais, et aucune règle de lint
      ne peut le voir : `reference` est un ref, pas une dépendance déclarable.
    */
  }, [ouvert, monte])

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

  const noeud = (
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

  /*
    ═══ PORTAIL VERS `document.body` — TROUVÉ EN FAISANT TOURNER LA VRAIE SUITE E2E, PAS EN
    LA LISANT (Task 15) ═══

    `showModal()` place le `<dialog>` dans la COUCHE SUPÉRIEURE visuellement, mais NE LE
    DÉPLACE PAS dans l'arbre DOM : sans portail, l'élément reste physiquement là où
    `Dialogue` est appelé. Or NEUF des dix confirmations de famille A (Task 13) et trois
    des cinq de famille B (Task 14) l'appellent À L'INTÉRIEUR d'un `<form>` ancêtre —
    celui du bouton de soumission qu'elles confirment. `Dialogue` porte lui-même un
    `<form method="dialog">` : sans portail, c'est un `<form>` DANS un `<form>`, invalide
    en HTML — observé RÉELLEMENT dans les journaux du serveur de dev pendant la suite e2e,
    sur `/antennes/[id]` (`LigneMembreDetachable`, A4) ET `/ael/seances/[id]`
    (`BoutonTransitionEtat`, A2) : « In HTML, `<form>` cannot be a descendant of `<form>`.
    This will cause a hydration error. »

    AUCUNE PREUVE STATIQUE NE POUVAIT LE VOIR : le harnais Playwright de la Task 7 testait
    `Dialogue` SEUL, jamais niché dans un `<form>` ambiant — exactement la configuration que
    les Tasks 13/14 lui ont donnée en le distribuant dans dix-sept fichiers réels.

    `createPortal(noeud, document.body)` sort le `<dialog>` de l'arbre DOM local : plus de
    nidification de `<form>`, quel que soit l'endroit où `Dialogue` est appelé. Le reste du
    mécanisme (focus piégé, `Échap`, restitution du focus, `returnValue`) ne dépend QUE de
    la référence DOM (`reference`), jamais de la position dans l'arbre : rien d'autre ne
    change.

    `monte`, PAS `typeof document === 'undefined'` — voir le commentaire de tête sur
    `monte` : un premier correctif basé sur `typeof document` a RÉELLEMENT ÉCHOUÉ, mesuré
    sur cette même suite, en rougissant sur la MÊME erreur d'hydratation. `monte` la ferme
    par construction, `typeof document` ne faisait que la déguiser.
  */
  if (!monte) return null
  return createPortal(noeud, document.body)
}
