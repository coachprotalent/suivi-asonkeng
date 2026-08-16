import { useId, type ChangeEvent, type ComponentPropsWithoutRef } from 'react'
import { CLASSES_CHAMP, CLASSES_LARGEUR, type LargeurChamp } from './champ'

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

  ═══ LES GROUPES, AJOUTÉS À LA TASK 11 SUR UN DÉCOMPTE, PAS SUR UNE INTUITION ═══

  La Task 9 a laissé le `<select>` des statuts EN DEHORS de ce composant, parce qu'il rend
  des `<optgroup>` et une première option désactivée, et elle a explicitement renvoyé la
  décision à la revue de dimensionnement (D120).

  DÉCOMPTE DU 2026-08-16 — `grep -rn "optgroup" src --include="*.tsx"` rend trois fichiers,
  dont un est le commentaire ci-dessus. Les DEUX appelants réels sont :
    - `membres/nouveau/bloc-enrichissement.tsx:209`
    - `membres/[id]/statuts/formulaire-statut.tsx:49`
  Même forme, même donnée, même besoin : choisir un statut dans un catalogue groupé, avec la
  mention « (un seul à la fois) » sur les groupes exclusifs, précédé d'une option désactivée
  qui sert d'invite.

  DEUX appelants, et non un : D110 refuse un composant qui grandit pour un seul appelant,
  parce qu'un tel composant dérive. Ici le seuil est franchi, et la forme est identique des
  deux côtés — c'est le cas que la revue de dimensionnement existe pour trancher. Le second
  appelant adopte à la Task 22.

  `groupes` et `options` sont MUTUELLEMENT EXCLUSIFS dans le type : porter les deux
  laisserait l'appelant croire qu'ils se concatènent, et l'ordre du résultat dépendrait
  d'une décision que personne n'a prise.
*/
export type OptionSelecteur = { valeur: string; libelle: string }

/** Un `<optgroup>` : son libellé, et ses options. */
export type GroupeSelecteur = { libelle: string; options: OptionSelecteur[] }

type ProprietesSelecteurBase = Omit<
  ComponentPropsWithoutRef<'select'>,
  'className' | 'style' | 'value' | 'onChange' | 'defaultValue' | 'children'
> & {
  label: string
  value: string
  onChange: (evenement: ChangeEvent<HTMLSelectElement>) => void
  aide?: string
  largeur?: LargeurChamp
  /**
   * L'option de tête, de valeur vide — l'invite (« Choisir un statut… »).
   *
   * `desactivee` rend l'option `disabled` : elle reste VISIBLE et sélectionnée tant que
   * rien n'a été choisi, mais on ne peut pas y revenir. C'est ce que fait le `<select>` des
   * statuts, et c'est ce qui, combiné à `required`, force un choix explicite. Une option
   * vide NON désactivée est un choix légitime — « Non rattaché », « Non renseignée » — et
   * celle-là passe par `options`, comme n'importe quelle autre valeur.
   */
  optionVide?: { libelle: string; desactivee?: boolean }
  /** D111 — jamais assignable. */
  defaultValue?: never
}

export type ProprietesSelecteur =
  | (ProprietesSelecteurBase & { options: OptionSelecteur[]; groupes?: never })
  | (ProprietesSelecteurBase & { groupes: GroupeSelecteur[]; options?: never })

export function Selecteur({
  label,
  value,
  onChange,
  options,
  groupes,
  aide,
  largeur = 'pleine',
  optionVide,
  id,
  ...reste
}: ProprietesSelecteur) {
  const idGenere = useId()
  const idChamp = id ?? idGenere
  const idAide = `${idChamp}-aide`

  return (
    <div className={`flex flex-col gap-esp-1 ${CLASSES_LARGEUR[largeur]}`}>
      <label htmlFor={idChamp} className="libelle-champ text-petit text-encre">
        {label}
      </label>
      <select
        {...reste}
        id={idChamp}
        value={value}
        onChange={onChange}
        aria-describedby={aide ? idAide : undefined}
        className={CLASSES_CHAMP}
      >
        {/*
          L'INVITE EN PREMIER, TOUJOURS. `formulaire-statut.tsx` et `bloc-enrichissement.tsx`
          la rendent en tête, et la preuve de bout en bout de la création enrichie prend
          « la deuxième `<option>` » comme premier statut réel
          (`tests/e2e/creation-enrichie.spec.ts:319`). La déplacer changerait ce que ce test
          sélectionne.
        */}
        {optionVide ? (
          <option value="" disabled={optionVide.desactivee}>
            {optionVide.libelle}
          </option>
        ) : null}

        {options?.map((option) => (
          <option key={option.valeur} value={option.valeur}>
            {option.libelle}
          </option>
        ))}

        {groupes?.map((groupe) => (
          <optgroup key={groupe.libelle} label={groupe.libelle}>
            {groupe.options.map((option) => (
              <option key={option.valeur} value={option.valeur}>
                {option.libelle}
              </option>
            ))}
          </optgroup>
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
