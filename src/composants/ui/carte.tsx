import type { ReactNode } from 'react'

/*
  ═══ `Carte` N'A AUCUN ANTÉCÉDENT À EXTRAIRE, ET C'EST SON RISQUE ═══

  L'inventaire du vocabulaire est formel : « pas de carte neutre (fond blanc/gris clair,
  ombre, contenu libre) identifiée en dehors des listes en <ul> — à considérer comme motif
  ABSENT plutôt que divergent ». Les seules boîtes encadrées du dépôt sont les bandeaux
  d'avertissement (`bg-amber-50`, 8 occurrences) et de succès (`bg-green-50`, 2 occurrences,
  `connexion/page.tsx:32` et `demandes/page.tsx:103`).

  Le risque de ce composant n'est donc PAS la divergence avec ce qui existait, c'est
  l'USAGE : un composant neuf que les écrans n'adoptent pas uniformément recrée exactement
  le désordre que la phase corrige. Le décompte de ses appelants est une preuve (§7, n°5),
  faite à la Task 24.

  ═══ LES TONS N'ONT PAS DE FOND COLORÉ, ET C'EST UNE DÉCISION ═══

  Les bandeaux d'aujourd'hui remplissent leur fond (`bg-amber-50`, `bg-green-50`). Le
  système de jetons de la conception (§4.1) ne fournit AUCUNE couleur de fond d'état : les
  quatre couleurs d'état y sont déclarées « utilisées UNIQUEMENT en pastille » (D126), et
  `--etat-refus` y est nommée comme couleur de TEXTE sur `--surface`, jamais comme fond. En
  inventer deux (un ambre pâle, un vert pâle) ajouterait deux valeurs que la conception n'a
  pas arbitrées, dans un fichier dont la raison d'être est de porter les valeurs arbitrées.

  Donc : fond `--surface` pour les trois tons, et le ton s'exprime par la BORDURE et par la
  couleur du texte. Le contraste texte/fond y gagne, et la couleur reste un second canal,
  conformément à l'esprit de D126.

  ⚠️ CE N'EST PAS UN RAIL. La bordure de ton fait le tour de la carte ; le rail de filiation
  est un bord GAUCHE de 2 px en `--filiation`, posé par la prop `rail`. Les deux sont
  visuellement distincts, et ils doivent le rester : le rail marque une RELATION DE
  DISCIPULAT, et s'il apparaissait là où aucune relation n'existe, il deviendrait une
  décoration qui affirme quelque chose de faux (piège n°6).
*/
export type TonCarte = 'neutre' | 'avertissement' | 'succes'

const CLASSES_TON: Record<TonCarte, string> = {
  neutre: 'border-bord-carte text-encre',
  avertissement: 'border-etat-attente text-encre',
  succes: 'border-etat-acquis text-encre',
}

export type ProprietesCarte = {
  children: ReactNode
  ton?: TonCarte
  /** Le rail de filiation (D106). NE LE POSER QUE LÀ OÙ UNE RELATION DE DISCIPULAT EXISTE. */
  rail?: boolean
  /**
   * `role="alert"` pour un avertissement, `role="status"` pour un succès — c'est ce que
   * portent les bandeaux existants, et le changer changerait la façon dont un lecteur
   * d'écran les annonce. Facultatif : une carte neutre n'a pas de rôle live.
   */
  role?: 'alert' | 'status'
}

export function Carte({ children, ton = 'neutre', rail = false, role }: ProprietesCarte) {
  return (
    <div
      role={role}
      className={`rounded-bord border bg-surface p-esp-4 ${CLASSES_TON[ton]}${
        rail ? ' rail-filiation' : ''
      }`}
    >
      {children}
    </div>
  )
}
