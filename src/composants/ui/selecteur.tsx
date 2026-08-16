import { useId, type ChangeEvent, type ComponentPropsWithoutRef } from 'react'
import { CLASSES_LARGEUR, type LargeurChamp } from './champ'

/*
  ═══ DEUX FAMILLES DE `<select>` DANS LE DÉPÔT, ET UNE SEULE SURVIT ═══

  18 `<select>`, en deux familles radicalement différentes (inventaire §2) :
    - CONTRÔLÉE (`value=` + `onChange=`), 3 fichiers, tous protégés par un
      `onReset={(e) => e.preventDefault()}` posé à la main ;
    - NON CONTRÔLÉE (`defaultValue=`), 4 fichiers.

  Le composant n'absorbe PAS les deux régimes, contrairement à ce que l'inventaire
  suggérait : il n'en garde qu'un. La seconde famille est exactement le défaut que D111
  ferme, et un `<select>` a UN TRAVERS DE PLUS que les autres champs — voir D112 et le
  commentaire de `Formulaire` (Task 4) : un `<select>` CONTRÔLÉ ne survit pas à la
  réinitialisation automatique du formulaire après un refus, contrairement aux champs de
  saisie. Ce composant clôt le premier volet du dossier ; `Formulaire` clôt le second.

  `options` remplace `children` : passer des `<option>` en enfants laisserait un appelant
  y glisser un `<optgroup>` stylé, un `<option>` avec sa propre classe, ou un `defaultValue`
  déguisé en `selected`. Une liste de données ferme ces trois portes d'un coup.
*/
export type OptionSelecteur = { valeur: string; libelle: string }

const CLASSES_SELECTEUR =
  'cible-tactile rounded-bord border border-bord-carte bg-surface px-esp-3 py-esp-2 text-corps text-encre'

export type ProprietesSelecteur = Omit<
  ComponentPropsWithoutRef<'select'>,
  'className' | 'style' | 'value' | 'onChange' | 'defaultValue' | 'children'
> & {
  label: string
  value: string
  onChange: (evenement: ChangeEvent<HTMLSelectElement>) => void
  options: OptionSelecteur[]
  aide?: string
  largeur?: LargeurChamp
  /** D111 — jamais assignable. */
  defaultValue?: never
}

export function Selecteur({
  label,
  value,
  onChange,
  options,
  aide,
  largeur = 'pleine',
  id,
  ...reste
}: ProprietesSelecteur) {
  const idGenere = useId()
  const idChamp = id ?? idGenere
  const idAide = `${idChamp}-aide`

  return (
    <div className={`flex flex-col gap-esp-1 ${CLASSES_LARGEUR[largeur]}`}>
      <label htmlFor={idChamp} className="text-petit text-encre">
        {label}
      </label>
      <select
        {...reste}
        id={idChamp}
        value={value}
        onChange={onChange}
        aria-describedby={aide ? idAide : undefined}
        className={CLASSES_SELECTEUR}
      >
        {options.map((option) => (
          <option key={option.valeur} value={option.valeur}>
            {option.libelle}
          </option>
        ))}
      </select>
      {aide ? (
        <span id={idAide} className="text-petit text-encre-attenuee">
          {aide}
        </span>
      ) : null}
    </div>
  )
}
