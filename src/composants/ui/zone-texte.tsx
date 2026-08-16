import { useId, type ChangeEvent, type ComponentPropsWithoutRef } from 'react'

/*
  5 `<textarea>` dans tout le dépôt, tous porteurs de la même classe de champ (inventaire
  §2 : « trop peu d'occurrences pour juger d'une variante »). Le composant existe malgré ce
  décompte faible parce que D111 vaut pour lui comme pour les deux autres : une zone de
  texte non contrôlée dans un `<form action>` se vide au refus exactement comme un
  `<input>`, et l'utilisateur y perd BEAUCOUP PLUS de saisie.

  Pas de prop `largeur` : une zone de texte occupe toujours la largeur disponible. En
  ajouter une créerait une variation dont aucun appelant n'a besoin.
*/
const CLASSES_ZONE =
  'w-full rounded-bord border border-bord-carte bg-surface px-esp-3 py-esp-2 text-corps text-encre'

export type ProprietesZoneTexte = Omit<
  ComponentPropsWithoutRef<'textarea'>,
  'className' | 'style' | 'value' | 'onChange' | 'defaultValue'
> & {
  label: string
  value: string
  onChange: (evenement: ChangeEvent<HTMLTextAreaElement>) => void
  aide?: string
  /** D111 — jamais assignable. */
  defaultValue?: never
}

export function ZoneTexte({ label, value, onChange, aide, id, rows = 3, ...reste }: ProprietesZoneTexte) {
  const idGenere = useId()
  const idChamp = id ?? idGenere
  const idAide = `${idChamp}-aide`

  return (
    <div className="flex w-full flex-col gap-esp-1">
      <label htmlFor={idChamp} className="text-petit text-encre">
        {label}
      </label>
      <textarea
        {...reste}
        id={idChamp}
        rows={rows}
        value={value}
        onChange={onChange}
        aria-describedby={aide ? idAide : undefined}
        className={CLASSES_ZONE}
      />
      {aide ? (
        <span id={idAide} className="text-petit text-encre-attenuee">
          {aide}
        </span>
      ) : null}
    </div>
  )
}
