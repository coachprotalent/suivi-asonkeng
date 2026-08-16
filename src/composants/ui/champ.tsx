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

const CLASSES_CHAMP =
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
    ⚠️ LE LIBELLÉ PERD LE `font-medium` QU'IL AVAIT, ET C'EST UNE CONSÉQUENCE ASSUMÉE DE
    L'ÉCHELLE À CINQ DEGRÉS.

    Les 89 `<label>` du dépôt portent aujourd'hui `text-sm font-medium` (0.875 rem / 500).
    L'échelle de la conception (§4.2) n'a que CINQ degrés — titre, section, corps, nom,
    petit — et AUCUN n'est un « libellé de champ ». `--txt-petit` (0.85 rem / 400) est le
    plus proche par la taille, mais il perd la graisse.

    En ajouter un sixième contredirait « cinq degrés et pas un de plus ». Employer
    `--txt-nom` (0.95 rem / 600) ferait d'un libellé de champ un élément AUSSI marqué qu'un
    nom de personne en liste, ce qui est faux.

    C'EST UNE QUESTION DE DIMENSIONNEMENT DU SOCLE, ET ELLE EST POSÉE À LA TASK 11 (question
    n°3) — après que les dix champs de `/membres/nouveau` l'auront rendue observable, et pas
    avant.
  */

  return (
    <div className={`flex flex-col gap-esp-1 ${CLASSES_LARGEUR[largeur]}`}>
      <label htmlFor={idChamp} className="text-petit text-encre">
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
