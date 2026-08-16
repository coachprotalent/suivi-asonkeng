'use client'

import type { Ref } from 'react'

/*
  ═══ D113 — LE BANDEAU DE REFUS REÇOIT LE FOCUS, ET LE FOCUS SE VOIT ═══

  46 `role="alert"` dans le dépôt (`grep -rn 'role="alert"' src --include="*.tsx" | wc -l`),
  un bandeau de refus par formulaire, motif quasi universel. `aria-live` explicite : ZÉRO
  occurrence — inutile, `role="alert"` implique déjà une région live assertive.

  MAIS L'ANNONCE NE DÉPLACE RIEN. Deux formulaires sur vingt-cinq portent le focus sur le
  message ; les vingt-trois autres laissent l'utilisateur clavier exactement où il était,
  souvent bien au-dessus d'un message qu'il ne verra pas. Sur mobile — où l'inscription et
  la création de fiche sont le plus employées — le refus s'affiche fréquemment hors du
  champ visuel, et rien ne semble s'être passé au clic.

  `tabIndex={-1}` rend le paragraphe focusable PAR PROGRAMME sans l'insérer dans l'ordre de
  tabulation : personne ne « tombe » dessus en tabulant, mais `.focus()` l'atteint.

  ═══ POURQUOI `refus-focus` ET NON `:focus-visible` ═══

  L'anneau global de D114 est posé sur `:focus-visible`, qui ne se déclenche PAS de façon
  fiable lors d'un focus PROGRAMMATIQUE sur un élément NON INTERACTIF : les navigateurs y
  appliquent leur propre heuristique, fondée sur la dernière modalité d'interaction. S'en
  remettre à `:focus-visible` ici, ce serait laisser au navigateur le soin de décider si
  l'utilisateur voit ou non où le focus vient d'atterrir. `refus-focus` (globals.css) pose
  donc une règle `:focus` NUE, réservée à ce seul cas.

  C'est LE REMPLACEMENT des deux `outline-none` du dépôt
  (`inscription/formulaire-inscription.tsx:230`, `membres/formulaire-membre.tsx:275`), et
  non leur simple retrait : leur intention — ne pas entourer d'un halo un texte non
  interactif — était plausible, mais elle laissait l'utilisateur clavier voyant sans aucun
  indice à l'endroit exact où le focus venait d'arriver.

  ═══ LE MESSAGE N'EST JAMAIS CONSTRUIT ICI ═══

  `message` arrive tel quel de l'action. Ce composant ne préfixe rien, ne suffixe rien, ne
  reformule rien : D117 interdit de modifier un texte affiché, et un bandeau qui ajouterait
  « Erreur : » devant 46 messages en changerait 46 d'un coup.
*/
export type ProprietesRefus = {
  message: string | null
  ref?: Ref<HTMLParagraphElement>
}

export function Refus({ message, ref }: ProprietesRefus) {
  if (!message) return null
  return (
    <p ref={ref} tabIndex={-1} role="alert" className="refus-focus text-petit text-etat-refus">
      {message}
    </p>
  )
}
