import { useId, type ChangeEvent, type ComponentPropsWithoutRef } from 'react'

/*
  ═══ D111 — `defaultValue` EST IMPOSSIBLE À ÉCRIRE, PAS DÉCONSEILLÉ ═══

  React réinitialise les champs NON CONTRÔLÉS d'un `<form action>` à TOUTE complétion de
  l'action, Y COMPRIS sur un refus RETOURNÉ. Et c'est la BONNE PRATIQUE du projet qui
  déclenche le piège : la règle « une action RETOURNE son refus, elle ne le lève pas » —
  posée pour que le message survive au build de production — est exactement ce qui fait
  passer l'action par le chemin « complétion normale », donc par la remise à zéro. Une
  action qui LÈVE ne vide rien, mais perd son message en production.

  `value` et `onChange` sont OBLIGATOIRES. `defaultValue` et `defaultChecked` sont
  `never`. Un champ non contrôlé n'est donc pas « à éviter » : il n'est PAS EXPRIMABLE par
  ce composant.

  POURQUOI `Omit` ET `?: never`, ET PAS L'UN DES DEUX :
    - `Omit` seul ferme le littéral JSX (`<Champ defaultValue="x" />` — propriété
      excédentaire refusée) mais PAS l'étalement (`<Champ {...p} />` où `p.defaultValue`
      existe) : le contrôle des propriétés excédentaires ne s'applique pas aux étalements.
    - `?: never` seul serait ambigu à lire, et laisserait `defaultValue` dans le type de
      base pour quiconque le manipule par `Parameters<typeof Champ>`.
  Les deux ensemble ferment les deux chemins.
*/
export type LargeurChamp = 'pleine' | 'flexible' | 'etroite'

/**
 * EXPORTÉE, et employée telle quelle par `Selecteur`. Une seule table de largeurs pour
 * les trois composants de saisie : trois copies divergeraient, et c'est précisément ce que
 * la phase corrige ailleurs.
 */
export const CLASSES_LARGEUR: Record<LargeurChamp, string> = {
  pleine: 'w-full',
  /** Pour une barre de filtres : le champ prend la place restante et ne descend pas sous 12 rem. */
  flexible: 'min-w-48 flex-1',
  /** Pour un nombre de jours, un compteur : la largeur dit déjà ce qu'on attend. */
  etroite: 'w-32',
}

/**
 * ═══ LA CLASSE DE CHAMP, UNE SEULE FOIS POUR TOUT LE DÉPÔT ═══
 *
 * EXPORTÉE, et pour la même raison que `CLASSES_VARIANTE` l'est de `bouton.tsx` : quelques
 * sites ont besoin de l'APPARENCE d'un champ sans pouvoir passer par le composant, et une
 * recopie de la chaîne en ferait des vérités séparées qui divergeraient au premier
 * ajustement.
 *
 * Le décompte du 2026-08-16 en trouvait QUATRE copies exactes — `champ.tsx`, `selecteur.tsx`,
 * `membres/page.tsx` (`CLASSE_CHAMP_FILTRE`) et `membres/nouveau/bloc-enrichissement.tsx`
 * (`CLASSE_SELECT_STATUT`). La Task 11 les ramène à une : la quatrième a disparu avec
 * l'élargissement de `Selecteur` aux groupes, les deux autres importent celle-ci.
 *
 * LE SEUL SITE LÉGITIME QUI RESTE HORS COMPOSANT est le formulaire GET de `/membres` — voir
 * son commentaire de tête : un `<form method="get">` navigue, ses champs sont NON CONTRÔLÉS
 * par nécessité, et `Champ` rend `value`/`onChange` obligatoires par D111. Deux formulaires
 * GET dans tout le dépôt, très loin du seuil de dix de D110 : on n'élargit pas `Champ` pour
 * eux, on leur donne la classe.
 */
export const CLASSES_CHAMP =
  'cible-tactile rounded-bord border border-bord-carte bg-surface px-esp-3 py-esp-2 text-corps text-encre'

export type ProprietesChamp = Omit<
  ComponentPropsWithoutRef<'input'>,
  'className' | 'style' | 'value' | 'onChange' | 'defaultValue' | 'defaultChecked'
> & {
  label: string
  value: string
  onChange: (evenement: ChangeEvent<HTMLInputElement>) => void
  aide?: string
  largeur?: LargeurChamp
  /** D111 — jamais assignable. Voir le commentaire de tête. */
  defaultValue?: never
  /** D111 — idem. Les 9 cases à cocher du dépôt sont hors de ce composant (voir plus bas). */
  defaultChecked?: never
}

export function Champ({
  label,
  value,
  onChange,
  aide,
  largeur = 'pleine',
  id,
  ...reste
}: ProprietesChamp) {
  /*
    ═══ POURQUOI `htmlFor` EXPLICITE ET NON LE `<label>` ENVELOPPANT ═══

    Le dépôt emploie les deux formes : 89 `<label>` pour 26 `htmlFor`, donc 63 associations
    implicites (le champ est enfant du label — forme valide en HTML). La règle qui les
    départage est écrite en commentaire dans `evenements/formulaire-evenement.tsx:178-182`
    et rappelée dans `membres/formulaire-membre.tsx:77-81` : UNE AIDE LAISSÉE DANS LE
    `<label>` EST CONCATÉNÉE AU NOM ACCESSIBLE DU CHAMP.

    Ce composant porte une aide OPTIONNELLE. S'il enveloppait, l'aide entrerait dans le nom
    accessible dès qu'elle est fournie, et pas sinon — un comportement d'accessibilité qui
    dépend d'une prop facultative est exactement le genre de piège qu'on ne remarque jamais.
    Donc : `htmlFor` explicite TOUJOURS, aide SORTIE du label, reliée par `aria-describedby`.

    `useId` et non un compteur : deux instances du même formulaire sur une page (une par
    ligne de liste — c'est le cas de `/comptes`, `/tokens`, `/evenements/a-traiter`)
    produiraient sinon des `id` en collision, et le label du premier pointerait le champ du
    second.
  */
  const idGenere = useId()
  const idChamp = id ?? idGenere
  const idAide = `${idChamp}-aide`

  /*
    ═══ LE LIBELLÉ GARDE SA GRAISSE. QUESTION TRANCHÉE À LA TASK 11, QUESTION N°3. ═══

    Les 89 `<label>` du dépôt portaient `text-sm font-medium` (0.875 rem / 500). L'échelle de
    la conception (§4.2) n'a que CINQ degrés — titre, section, corps, nom, petit — et AUCUN
    n'est un « libellé de champ ». `--text-petit` (0.85 rem / 400) est le plus proche par la
    taille, mais il perdait la graisse, et la Task 3 avait laissé la question ouverte.

    CE QUE LES DIX CHAMPS DE `/membres/nouveau` ONT RENDU OBSERVABLE : le libellé et son
    texte d'aide portaient EXACTEMENT le même degré, et ne se distinguaient que par une
    NUANCE DE COULEUR (`--encre` contre `--encre-attenuee`). Sur un formulaire de dix champs,
    le seul repère disant « ici commence un nouveau champ » était donc un écart de teinte —
    le canal le plus faible, et celui que D126 réserve au SECOND rôle.

    LA RÉPONSE N'AJOUTE PAS UN SIXIÈME DEGRÉ : `libelle-champ` (globals.css) ne porte QUE la
    graisse, par le jeton `--poids-libelle`. La taille et l'interligne restent ceux de
    `text-petit`. Employer `--text-nom` (0.95 rem / 600) aurait fait d'un libellé de champ un
    élément AUSSI marqué qu'un nom de personne en liste, ce qui est faux — cette voie-là est
    écartée, pas oubliée.

    JAMAIS `font-medium` ÉCRIT ICI (D109) : la valeur vit dans `globals.css`, et elle seule.
  */

  return (
    <div className={`flex flex-col gap-esp-1 ${CLASSES_LARGEUR[largeur]}`}>
      <label htmlFor={idChamp} className="libelle-champ text-petit text-encre">
        {label}
      </label>
      <input
        {...reste}
        id={idChamp}
        value={value}
        onChange={onChange}
        aria-describedby={aide ? idAide : undefined}
        className={CLASSES_CHAMP}
      />
      {aide ? (
        <span id={idAide} className="text-petit text-encre-attenuee">
          {aide}
        </span>
      ) : null}
    </div>
  )
}
