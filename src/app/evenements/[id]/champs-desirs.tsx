'use client'

/**
 * Les trois cases de désir plus la note, partagées par les TROIS formulaires de cet écran
 * (ajout d'un membre, ajout d'un externe, correction d'une ligne). Une seule définition :
 * trois copies seraient trois occasions de renommer un champ d'un seul côté, et un désir
 * silencieusement perdu ne se verrait sur AUCUN écran.
 *
 * FICHIER À PART, et pas par goût du découpage : dans `participants.tsx`, ce composant
 * créerait un cycle d'imports avec `formulaire-participant-externe.tsx`, que
 * `participants.tsx` importe déjà. Les cycles ES « fonctionnent » jusqu'au jour où l'ordre
 * d'évaluation change et rend un export `undefined` au montage.
 *
 * `prefixe` vient d'un `useId()` du parent : sans lui, trois instances du composant sur la
 * même page partageraient les mêmes `id`, et les `<label htmlFor>` désigneraient tous le
 * premier champ.
 */
export function ChampsDesirs({
  prefixe,
  valeurs,
}: {
  prefixe: string
  valeurs?: { mentorat: boolean; suivi: boolean; cpeap: boolean; note: string }
}) {
  const idNote = `${prefixe}-note`
  const idAideNote = `${prefixe}-aide-note`

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">Trois désirs</legend>
      <label className="flex items-center gap-2 text-sm">
        <input
          name="desirMentoratAcademique"
          type="checkbox"
          defaultChecked={valeurs?.mentorat ?? false}
        />
        Mentorat académique
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input name="desirSuiviSpirituel" type="checkbox" defaultChecked={valeurs?.suivi ?? false} />
        Suivi spirituel
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input name="desirCpeap" type="checkbox" defaultChecked={valeurs?.cpeap ?? false} />
        CPEAP
      </label>

      {/* Champ AVEC aide : `htmlFor` explicite, aide SORTIE du label et rattachée par
          `aria-describedby`. Une aide laissée dans le `<label>` serait concaténée au nom
          accessible du champ. */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor={idNote} className="text-sm font-medium">
          Note
        </label>
        <textarea
          id={idNote}
          name="note"
          rows={2}
          defaultValue={valeurs?.note ?? ''}
          aria-describedby={idAideNote}
          className="rounded-md border border-neutral-300 px-3 py-2"
        />
        <span id={idAideNote} className="text-xs text-neutral-500">
          Visible des seuls modérateurs et administrateurs.
        </span>
      </div>
    </fieldset>
  )
}
