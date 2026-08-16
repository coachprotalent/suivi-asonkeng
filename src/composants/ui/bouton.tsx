import type { ComponentPropsWithoutRef, ReactNode, Ref } from 'react'

/*
  ═══ UN BOUTON, ET CINQ VARIANTES ÉNUMÉRÉES ═══

  L'inventaire relève 60 `<button>` et AU MOINS SIX FORMULATIONS DISTINCTES pour ce qui
  devrait être un seul bouton principal — mêmes rôles, classes divergentes selon le
  fichier. Décompte exact des chaînes de classe, mesuré le 2026-08-16 :

    "rounded-md bg-neutral-900 px-4 py-2 text-white disabled:opacity-50"                     7x
    "self-start rounded-md bg-neutral-900 px-4 py-2 font-medium text-white ..."              6x
    "self-start rounded-md bg-neutral-900 px-4 py-2 text-white disabled:opacity-50"          3x
    "self-start rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white ..."      3x
    "self-start rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white ..."                3x
    "rounded-md bg-neutral-900 px-4 py-2 font-medium text-white disabled:opacity-50"         2x

  `text-sm` présent ou non, `font-medium` présent ou non, `self-start` présent ou non,
  padding `px-4 py-2` ou `px-3 py-1.5`. Aucune de ces divergences ne porte de sens : ce
  sont des recopies imparfaites. UNE SEULE forme survit ici, et `self-start` — la seule
  divergence qui portait vraiment une intention de mise en page — devient la prop
  `alignement`.
*/
export type VarianteBouton =
  | 'principal'
  | 'secondaire'
  | 'lien'
  | 'lien-danger'
  | 'bordure-danger'

export type ProprietesBouton = Omit<
  ComponentPropsWithoutRef<'button'>,
  'className' | 'style' | 'children'
> & {
  variante?: VarianteBouton
  /**
   * Attente en cours. Désactive le bouton ET bascule son libellé vers `libelleAttente`.
   *
   * CONVENTION REPRISE TELLE QUELLE, PAS INVENTÉE : le dépôt compte 39 `disabled={enCours}`
   * et 38 libellés au participe présent suivi de « … » (`Enregistrement…`, `Envoi…`,
   * `Création…`, `Connexion…`, `Génération…`). C'est le motif le plus homogène du dépôt
   * après la classe de champ. Ce composant l'ABSORBE ; il ne le remplace pas, et surtout
   * il ne change AUCUN de ces 38 libellés (D117).
   */
  enCours?: boolean
  libelleAttente?: string
  /**
   * `'debut'` rend `self-start` — le bouton ne s'étire pas à la largeur de son conteneur
   * flex. C'est la seule des quatre divergences mesurées qui exprimait une intention de
   * mise en page, et non une recopie imparfaite : elle est donc conservée, mais NOMMÉE.
   */
  alignement?: 'auto' | 'debut'
  /**
   * `ComponentPropsWithoutRef` n'inclut PAS `ref` : il faut le redéclarer. En React 19,
   * `ref` est une propriété ordinaire d'un composant fonction — aucun `forwardRef`.
   *
   * NÉCESSAIRE, ET PAS PAR SYMÉTRIE : les dix boutons de confirmation de la Task 13 ont
   * besoin de l'élément DOM pour appeler `bouton.form?.requestSubmit(bouton)` après la
   * confirmation du dialogue. Sans cette prop, ils devraient sortir de `Bouton`.
   */
  ref?: Ref<HTMLButtonElement>
  children: ReactNode
}

/*
  Les classes sont des CONSTANTES LITTÉRALES et non des chaînes construites : Tailwind
  balaye le source à la recherche de noms de classe complets. `bg-${couleur}` ne produirait
  aucune règle, et le bouton sortirait sans fond — piège classique, et silencieux.

  AUCUNE VALEUR LITTÉRALE ICI (D109) : tout passe par un jeton de `globals.css`. Un
  balayage refusant toute couleur littérale sous `src/composants/` est la preuve n°2 du §7.
*/
/**
 * EXPORTÉE, et c'est délibéré : plusieurs écrans rendent un `<Link>` STYLÉ EN BOUTON —
 * `membres/page.tsx:79-84` (« Nouveau membre »), `evenements/page.tsx`, `ael/seances/page.tsx`.
 * Ce sont des NAVIGATIONS, pas des actions : les forcer dans un `<button>` leur retirerait
 * le clic-milieu, le « ouvrir dans un nouvel onglet » et l'adresse au survol.
 *
 * Ces écrans écrivent donc `<Link className={CLASSES_VARIANTE.principal}>`, et non une
 * recopie des classes. C'est la seule façon de garder UNE source de vérité sans créer un
 * treizième composant `LienBouton` — que D110 exclut, et qui dériverait de celui-ci au
 * premier ajustement.
 */
export const CLASSES_VARIANTE: Record<VarianteBouton, string> = {
  principal:
    'cible-tactile justify-center gap-esp-2 rounded-bord bg-action px-esp-4 py-esp-2 text-corps text-sur-action disabled:opacity-50',
  secondaire:
    'cible-tactile justify-center gap-esp-2 rounded-bord border border-bord-carte bg-surface px-esp-4 py-esp-2 text-corps text-encre disabled:opacity-50',
  lien: 'cible-tactile text-petit text-action underline underline-offset-4 disabled:no-underline disabled:opacity-50',
  'lien-danger':
    'cible-tactile text-petit text-etat-refus underline underline-offset-4 disabled:no-underline disabled:opacity-50',
  /*
    UN SEUL bouton du dépôt porte cette forme — `demandes/ligne-demande-admin.tsx:186`,
    « Rejeter la demande » (`rounded-md border border-red-300 px-3 py-1.5 text-sm
    text-red-600 disabled:opacity-50`). L'inventaire du vocabulaire le situe à
    `comptes/ligne-compte.tsx:254`, ce qui est FAUX : cette ligne-là porte une bordure
    neutre. Vérifié le 2026-08-16 par `grep -rn "border-red" src --include="*.tsx"`, qui
    rend exactement une ligne.

    Une variante à un seul appelant est normalement un composant qui dérive (D110). Elle
    survit ici parce qu'elle est une VARIANTE d'un composant à soixante appelants, pas un
    composant à part : le coût marginal est une entrée dans ce Record.
  */
  'bordure-danger':
    'cible-tactile justify-center gap-esp-2 rounded-bord border border-etat-refus bg-surface px-esp-4 py-esp-2 text-petit text-etat-refus disabled:opacity-50',
}

export function Bouton({
  variante = 'principal',
  enCours = false,
  libelleAttente,
  alignement = 'auto',
  ref,
  children,
  disabled,
  type = 'button',
  ...reste
}: ProprietesBouton) {
  /*
    `disabled || enCours`, jamais `disabled ?? enCours` : un appelant qui passe
    explicitement `disabled={false}` alors qu'une soumission est en cours obtiendrait
    sinon un bouton ACTIF pendant l'envoi, et deux soumissions au lieu d'une.
  */
  const inactif = disabled === true || enCours

  /*
    `type = 'button'` PAR DÉFAUT, alors que le défaut HTML est `submit`. Ce dépôt compte
    plus de boutons hors formulaire (bascules, dépliages, révocations pilotées par
    `useTransition`) que de boutons de soumission, et un `type` oublié dans un `<form>`
    soumet le formulaire sans que rien ne le dise. Les boutons de soumission écrivent
    `type="submit"` — explicitement, ce qui est de toute façon le cas dans les 60 boutons
    existants.
  */
  return (
    <button
      {...reste}
      ref={ref}
      type={type}
      disabled={inactif}
      className={`${CLASSES_VARIANTE[variante]}${alignement === 'debut' ? ' self-start' : ''}`}
    >
      {enCours && libelleAttente ? libelleAttente : children}
    </button>
  )
}
