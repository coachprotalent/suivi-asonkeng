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
 *
 * CHAMPS CONTRÔLÉS (`valeurs` + `onChange`), et ce n'est pas un simple choix de style :
 * React réinitialise les champs NON contrôlés d'un `<form action={...}>` dès que l'action
 * se termine SANS LEVER, y compris quand elle RETOURNE un refus métier — défaut trouvé et
 * verrouillé à la tâche précédente (`src/app/evenements/formulaire-evenement.tsx`,
 * `src/app/evenements/types/formulaire-type.tsx`). Une note déjà rédigée ou un désir déjà
 * coché ne doivent pas disparaître parce qu'un AUTRE champ du même formulaire (le membre
 * choisi, le nom du participant externe…) a été refusé.
 */
export type ValeursDesirs = { mentorat: boolean; suivi: boolean; cpeap: boolean; note: string }

export const DESIRS_VIDES: ValeursDesirs = {
  mentorat: false,
  suivi: false,
  cpeap: false,
  note: '',
}

export function ChampsDesirs({
  prefixe,
  valeurs,
  onChange,
}: {
  prefixe: string
  valeurs: ValeursDesirs
  onChange: (valeurs: ValeursDesirs) => void
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
          checked={valeurs.mentorat}
          onChange={(evenement) => onChange({ ...valeurs, mentorat: evenement.target.checked })}
        />
        Mentorat académique
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          name="desirSuiviSpirituel"
          type="checkbox"
          checked={valeurs.suivi}
          onChange={(evenement) => onChange({ ...valeurs, suivi: evenement.target.checked })}
        />
        Suivi spirituel
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          name="desirCpeap"
          type="checkbox"
          checked={valeurs.cpeap}
          onChange={(evenement) => onChange({ ...valeurs, cpeap: evenement.target.checked })}
        />
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
          value={valeurs.note}
          onChange={(evenement) => onChange({ ...valeurs, note: evenement.target.value })}
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
