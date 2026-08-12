'use client'

import { useActionState, useId } from 'react'
import type { GroupeStatut } from '@/lib/donnees/statuts'
import { attribuerStatut, type EtatStatut } from './actions'

const etatInitial: EtatStatut = { erreur: null }

/*
  RÈGLE D'ASSOCIATION DES LIBELLÉS, vérifiée dans un vrai navigateur avant d'être
  posée : un <label> qui enveloppe son champ donne un nom accessible correct TANT
  QUE le label ne contient rien d'autre. Dès qu'un texte d'aide entre dans le
  <label>, il est CONCATÉNÉ au nom : un lecteur d'écran annonçait ici
  « Date d'acquisition Facultative. Elle n'est pas toujours connue. Sur un statut
  déjà porté, laisser vide conserve la date enregistrée. » comme nom du champ.
  Donc : champ SANS aide => <label> enveloppant (le reste du projet) ; champ AVEC
  aide => `htmlFor` explicite et l'aide sortie du label, rattachée par
  `aria-describedby`, qui la rend disponible en DESCRIPTION et non en nom.
*/
export function FormulaireStatut({
  membreId,
  groupes,
}: {
  membreId: string
  groupes: GroupeStatut[]
}) {
  const [etat, envoyer, enCours] = useActionState(attribuerStatut, etatInitial)
  const aujourdhui = new Date().toISOString().slice(0, 10)
  const prefixe = useId()
  const idDate = `${prefixe}-date`
  const idNote = `${prefixe}-note`

  return (
    <form action={envoyer} className="flex flex-col gap-4">
      <input type="hidden" name="membreId" value={membreId} />

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Statut (obligatoire)</span>
        <select
          name="statutId"
          required
          defaultValue=""
          className="rounded-md border border-neutral-300 px-3 py-2"
        >
          <option value="" disabled>
            Choisir un statut…
          </option>
          {groupes.map((groupe) => (
            <optgroup
              key={groupe.id}
              label={groupe.exclusif ? `${groupe.nom} (un seul à la fois)` : groupe.nom}
            >
              {groupe.statuts.map((statut) => (
                <option key={statut.id} value={statut.id}>
                  {statut.libelle}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={idDate} className="text-sm font-medium">
          Date d&apos;acquisition
        </label>
        <input
          id={idDate}
          name="dateAcquisition"
          type="date"
          max={aujourdhui}
          aria-describedby={`${idDate}-aide`}
          className="rounded-md border border-neutral-300 px-3 py-2"
        />
        <span id={`${idDate}-aide`} className="text-xs text-neutral-500">
          Facultative. Elle n&apos;est pas toujours connue. Sur un statut déjà porté,
          laisser vide conserve la date enregistrée.
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={idNote} className="text-sm font-medium">
          Note
        </label>
        <input
          id={idNote}
          name="note"
          maxLength={500}
          aria-describedby={`${idNote}-aide`}
          className="rounded-md border border-neutral-300 px-3 py-2"
        />
        {/*
          Cette mention n'est pas un ornement. `attribuer_statut` applique un
          `coalesce` : sur un statut déjà porté, un champ vide veut dire « ne change
          pas », jamais « efface ». Sans cette phrase, un administrateur qui vide la
          note pour la supprimer verrait une redirection de succès et retrouverait
          l'ancienne note intacte, sans le moindre avertissement.
        */}
        <span id={`${idNote}-aide`} className="text-xs text-neutral-500">
          Facultative. Sur un statut déjà porté, laisser vide conserve la note
          enregistrée.
        </span>
      </div>

      {etat.erreur ? (
        <p role="alert" className="text-sm text-red-600">
          {etat.erreur}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={enCours}
        className="self-start rounded-md bg-neutral-900 px-4 py-2 font-medium text-white disabled:opacity-50"
      >
        {enCours ? 'Enregistrement…' : 'Attribuer ce statut'}
      </button>
    </form>
  )
}
