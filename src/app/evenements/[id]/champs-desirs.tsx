'use client'

import { ZoneTexte } from '@/composants/ui/zone-texte'

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

  return (
    <fieldset className="flex flex-col gap-esp-2">
      <legend className="libelle-champ text-petit text-encre">Trois désirs</legend>
      <label className="cible-tactile flex items-center gap-esp-2 text-petit text-encre">
        <input
          name="desirMentoratAcademique"
          type="checkbox"
          checked={valeurs.mentorat}
          onChange={(evenement) => onChange({ ...valeurs, mentorat: evenement.target.checked })}
        />
        Mentorat académique
      </label>
      <label className="cible-tactile flex items-center gap-esp-2 text-petit text-encre">
        <input
          name="desirSuiviSpirituel"
          type="checkbox"
          checked={valeurs.suivi}
          onChange={(evenement) => onChange({ ...valeurs, suivi: evenement.target.checked })}
        />
        Suivi spirituel
      </label>
      <label className="cible-tactile flex items-center gap-esp-2 text-petit text-encre">
        <input
          name="desirCpeap"
          type="checkbox"
          checked={valeurs.cpeap}
          onChange={(evenement) => onChange({ ...valeurs, cpeap: evenement.target.checked })}
        />
        CPEAP
      </label>

      <ZoneTexte
        id={idNote}
        label="Note"
        name="note"
        rows={2}
        value={valeurs.note}
        onChange={(evenement) => onChange({ ...valeurs, note: evenement.target.value })}
        aide="Visible des seuls modérateurs et administrateurs."
      />
    </fieldset>
  )
}
