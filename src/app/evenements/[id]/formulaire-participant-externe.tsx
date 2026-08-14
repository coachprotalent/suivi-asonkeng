'use client'

import { useActionState, useId } from 'react'
import { ChampsDesirs } from './champs-desirs'
import { ajouterParticipantExterne, type EtatParticipation } from './participants-actions'

const etatInitial: EtatParticipation = { erreur: null }

/**
 * Création d'un participant externe À LA VOLÉE (D76). Décalque `champ-intervenant.tsx`
 * (phase 3) dans son intention — « choisir une fiche OU saisir quelqu'un qui n'en a pas » —
 * sans en reprendre la contrainte d'exclusivité : ici les deux gestes vivent dans DEUX
 * formulaires distincts, donc aucune exclusivité côté client n'est nécessaire. C'est la
 * contrainte `participations_une_seule_reference` (D59) qui la garantit en base, et elle
 * n'est jamais atteignable depuis cet écran.
 */
export function FormulaireParticipantExterne({ evenementId }: { evenementId: string }) {
  const [etat, envoyer, enCours] = useActionState(ajouterParticipantExterne, etatInitial)
  const prefixe = useId()

  return (
    <form action={envoyer} className="flex flex-col gap-3">
      <input type="hidden" name="evenementId" value={evenementId} />

      <div className="flex flex-wrap gap-3">
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium">Nom</span>
          <input name="nom" required className="rounded-md border border-neutral-300 px-3 py-2" />
        </label>
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium">Prénom</span>
          <input name="prenom" className="rounded-md border border-neutral-300 px-3 py-2" />
        </label>
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium">Téléphone</span>
          <input name="telephone" className="rounded-md border border-neutral-300 px-3 py-2" />
        </label>
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium">Courriel</span>
          <input name="email" type="email" className="rounded-md border border-neutral-300 px-3 py-2" />
        </label>
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium">Ville</span>
          <input name="ville" className="rounded-md border border-neutral-300 px-3 py-2" />
        </label>
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium">Pays</span>
          <input name="pays" className="rounded-md border border-neutral-300 px-3 py-2" />
        </label>
      </div>

      <ChampsDesirs prefixe={prefixe} />

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={enCours}
          className="self-start rounded-md bg-neutral-900 px-4 py-2 text-white disabled:opacity-50"
        >
          Ajouter ce participant externe
        </button>
        {etat.erreur ? (
          <p role="alert" className="text-sm text-red-600">
            {etat.erreur}
          </p>
        ) : null}
      </div>
    </form>
  )
}
