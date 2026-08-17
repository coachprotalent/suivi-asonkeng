import Link from 'next/link'
import type { ReactNode } from 'react'

/*
  ═══ IL N'Y A AUCUN `<table>` DANS TOUT LE DÉPÔT, ET C'EST UNE CHANCE ═══

  `grep -roh '<table' src --include="*.tsx" | wc -l` rend ZÉRO, vérifié non-piège. Toute
  donnée tabulaire passe par `<ul className="divide-y divide-neutral-200">` + `<li>`, avec
  une mise en page interne en `flex flex-wrap`. LE DÉBORDEMENT HORIZONTAL EST DONC
  STRUCTURELLEMENT IMPOSSIBLE : rien n'est disposé en colonnes fixes, et le dépôt ne compte
  aucun conteneur `overflow-x`.

  La contrepartie : AUCUNE LIGNE DE LISTE PARTAGÉE non plus. 29 `<ul>`, 26 `divide-y`, et
  chaque écran réimplémente sa propre disposition en `flex`. C'est ce que ce composant
  extrait.

  ═══ D115 — LA BASCULE EN CARTES EMPILÉES SOUS `md`, PORTÉE ICI ET NULLE PART AILLEURS ═══

  Le §3 de la spécification maîtresse promet « mobile d'abord » depuis le premier jour. Le
  dépôt compte QUATRE usages de point de rupture, tous en `sm:`, tous pour le même motif de
  grille de formulaire. Le reste du responsive repose sur `flex-wrap` (40 occurrences) : les
  éléments s'enroulent à l'étroit, mais AUCUNE réorganisation délibérée n'est pilotée par un
  point de rupture.

  `LigneListe` porte cette bascule UNE FOIS : sous 48 rem, le principal, la méta et les
  actions s'empilent ; au-dessus, ils s'alignent sur une ligne. C'est LE SEUL ENDROIT OÙ
  ELLE A BESOIN D'EXISTER, puisqu'aucun tableau n'existe.

  ═══ `lien` N'ENVELOPPE JAMAIS LES ACTIONS ═══

  Plusieurs listes rendent la ligne entière cliquable (`membres/page.tsx:121`,
  `antennes/page.tsx:24`). D'autres portent des boutons par ligne. Envelopper les deux dans
  un même `<Link>` produirait un élément interactif DANS un élément interactif — invalide en
  HTML, et le clic sur le bouton naviguerait en plus d'agir. `lien` n'enveloppe donc que le
  bloc `principal` + `meta` ; `actions` reste dehors, toujours.
*/
export function Liste({
  children,
  variante = 'standard',
}: {
  children: ReactNode
  variante?: 'standard' | 'navigation'
}) {
  return <ul className={variante === 'navigation' ? 'grille-navigation' : 'divide-y divide-filet'}>{children}</ul>
}

export type ProprietesLigneListe = {
  /** Le nom, le titre — ce qui identifie la ligne. */
  principal: ReactNode
  /** Antenne, ville, date, état — la métadonnée secondaire. */
  meta?: ReactNode
  /** Boutons et formulaires de la ligne. JAMAIS enveloppés par `lien`. */
  actions?: ReactNode
  /** Ce qui vit sous la ligne : bandeau de refus, formulaire replié, sous-liste. */
  complement?: ReactNode
  /** Rend `principal` + `meta` cliquables vers cette adresse. */
  lien?: string
  /** Le rail de filiation (D106). NE LE POSER QUE LÀ OÙ UNE RELATION DE DISCIPULAT EXISTE. */
  rail?: boolean
}

export function LigneListe({
  principal,
  meta,
  actions,
  complement,
  lien,
  rail = false,
}: ProprietesLigneListe) {
  const identite = (
    <div className="flex flex-col gap-esp-1">
      <span className="text-nom text-encre">{principal}</span>
      {meta ? <span className="chiffres-alignes text-petit text-encre-attenuee">{meta}</span> : null}
    </div>
  )

  return (
    <li className={`py-esp-3${rail ? ' rail-filiation' : ''}`}>
      {/*
        D115 — `flex-col` par défaut, `md:flex-row` au-dessus de 48 rem. C'est la
        RÉORGANISATION DÉLIBÉRÉE que `flex-wrap` ne savait pas faire : à l'étroit, la méta
        passe SOUS le nom au lieu de s'enrouler à côté de lui, et les actions passent sous
        les deux au lieu de se serrer contre le bord droit.
      */}
      <div className="flex flex-col gap-esp-2 md:flex-row md:items-baseline md:justify-between md:gap-esp-4">
        {lien ? (
          <Link href={lien} className="cible-tactile flex-1">
            {identite}
          </Link>
        ) : (
          <div className="flex-1">{identite}</div>
        )}
        {actions ? <div className="flex flex-wrap items-center gap-esp-3">{actions}</div> : null}
      </div>
      {complement ? <div className="mt-esp-2">{complement}</div> : null}
    </li>
  )
}
