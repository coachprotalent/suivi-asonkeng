'use client'

import Link from 'next/link'
import { useActionState, useId, useState } from 'react'
import type { ParticipantLigne } from '@/lib/donnees/evenements-lots'
import type { MembreBref } from '@/lib/donnees/membres'
import { SelecteurMembre } from '@/app/membres/selecteur-membre'
import { ChampsDesirs } from './champs-desirs'
import { FormulaireParticipantExterne } from './formulaire-participant-externe'
import {
  ajouterParticipantMembre,
  modifierParticipation,
  supprimerParticipation,
  type EtatParticipation,
} from './participants-actions'

const etatInitial: EtatParticipation = { erreur: null }

function FormulaireAjoutMembre({ evenementId }: { evenementId: string }) {
  const [etat, envoyer, enCours] = useActionState(ajouterParticipantMembre, etatInitial)
  const [membre, setMembre] = useState<MembreBref | null>(null)
  const prefixe = useId()

  return (
    <form action={envoyer} className="flex flex-col gap-3">
      <input type="hidden" name="evenementId" value={evenementId} />
      {/* D76 — `SelecteurMembre` (1c) RÉUTILISÉ TEL QUEL, aucun composant de recherche
          nouveau. Recherche serveur bornée à 20 résultats, membres ACTIFS seulement. */}
      <SelecteurMembre
        nom="membreId"
        label="Membre de l'équipe"
        aide="Cherche parmi les membres actifs."
        valeur={membre}
        surChoix={setMembre}
        exclureId={null}
      />
      <ChampsDesirs prefixe={prefixe} />
      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={enCours || !membre}
          className="self-start rounded-md bg-neutral-900 px-4 py-2 text-white disabled:opacity-50"
        >
          Ajouter ce membre
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

function LigneParticipant({
  evenementId,
  participant,
}: {
  evenementId: string
  participant: ParticipantLigne
}) {
  const [etatModification, modifier, modificationEnCours] = useActionState(
    modifierParticipation,
    etatInitial,
  )
  const [etatSuppression, supprimer, suppressionEnCours] = useActionState(
    supprimerParticipation,
    etatInitial,
  )
  const prefixe = useId()

  // Un membre DÉSIGNÉ dont la fiche n'est pas consultable par ce compte (typiquement
  // archivée, vue par un modérateur) : `membreId` non nul, embed nul. Les deux
  // informations sont DIFFÉRENTES, et les confondre afficherait « — » là où un
  // administrateur voit un nom. Même discipline que `libelleFiliation` (1c).
  const libelle = participant.membreId
    ? participant.membreNom
      ? `${participant.membrePrenom ?? ''} ${participant.membreNom}`.trim()
      : 'Fiche non consultable'
    : `${participant.externePrenom ?? ''} ${participant.externeNom ?? ''}`.trim() ||
      'Participant externe'

  return (
    <li className="py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">
          {participant.membreId ? (
            <Link href={`/membres/${participant.membreId}`} className="underline underline-offset-4">
              {libelle}
            </Link>
          ) : (
            libelle
          )}
        </span>
        <span className="text-sm text-neutral-500">
          {participant.membreId ? 'Membre' : 'Externe'}
          {participant.externeConvertiEnMembreId ? ' · converti' : ''}
        </span>
      </div>

      <details className="mt-2">
        <summary className="cursor-pointer text-sm underline underline-offset-4">
          Corriger les désirs et la note
        </summary>
        {/* D77 — modifiable après coup : un désir se recueille souvent APRÈS l'évènement.
            `saisi_par` et `saisi_le` ne sont jamais touchés (D60). */}
        <form action={modifier} className="mt-3 flex flex-col gap-3">
          <input type="hidden" name="evenementId" value={evenementId} />
          <input type="hidden" name="participationId" value={participant.id} />
          <ChampsDesirs
            prefixe={prefixe}
            valeurs={{
              mentorat: participant.desirMentoratAcademique,
              suivi: participant.desirSuiviSpirituel,
              cpeap: participant.desirCpeap,
              note: participant.note ?? '',
            }}
          />
          <button
            type="submit"
            disabled={modificationEnCours}
            className="self-start rounded-md border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-50"
          >
            Enregistrer
          </button>
          {etatModification.erreur ? (
            <p role="alert" className="text-sm text-red-600">
              {etatModification.erreur}
            </p>
          ) : null}
        </form>
      </details>

      {/* D78 — SEUL GESTE DESTRUCTIF DE LA PHASE. La confirmation dit ce qui disparaît :
          les trois désirs partent avec la ligne, et l'étiquette de séminaire du membre
          aussi. */}
      <form action={supprimer} className="mt-2">
        <input type="hidden" name="evenementId" value={evenementId} />
        <input type="hidden" name="participationId" value={participant.id} />
        <button
          type="submit"
          disabled={suppressionEnCours}
          onClick={(evenement) => {
            if (
              !window.confirm(
                `Supprimer la participation de ${libelle} ? Les trois désirs et la note saisis pour cet évènement seront effacés, et l'évènement disparaîtra des séminaires assistés de cette personne.`,
              )
            ) {
              evenement.preventDefault()
            }
          }}
          className="text-sm text-red-600 underline underline-offset-4 disabled:opacity-50"
        >
          Supprimer cette participation
        </button>
        {etatSuppression.erreur ? (
          <p role="alert" className="mt-2 text-sm text-red-600">
            {etatSuppression.erreur}
          </p>
        ) : null}
      </form>
    </li>
  )
}

export function SectionParticipants({
  evenementId,
  participants,
  total,
  page,
  pages,
}: {
  evenementId: string
  participants: ParticipantLigne[]
  total: number
  page: number
  pages: number
}) {
  return (
    <section className="mt-10">
      <h2 className="mb-4 text-lg font-medium">
        Participants ({total})
      </h2>

      <div className="mb-8 flex flex-col gap-8">
        <FormulaireAjoutMembre evenementId={evenementId} />
        <details>
          <summary className="cursor-pointer text-sm underline underline-offset-4">
            Ajouter un participant externe
          </summary>
          <div className="mt-4">
            <FormulaireParticipantExterne evenementId={evenementId} />
          </div>
        </details>
      </div>

      {participants.length === 0 ? (
        <p className="text-sm text-neutral-600">Aucun participant enregistré.</p>
      ) : (
        <ul className="divide-y divide-neutral-200">
          {participants.map((participant) => (
            <LigneParticipant
              key={participant.id}
              evenementId={evenementId}
              participant={participant}
            />
          ))}
        </ul>
      )}

      {pages > 1 ? (
        <nav className="mt-6 flex items-center gap-4 text-sm">
          {page > 1 ? (
            <Link
              href={`/evenements/${evenementId}?pageParticipants=${page - 1}`}
              className="underline underline-offset-4"
            >
              Page précédente
            </Link>
          ) : null}
          <span className="text-neutral-500">
            Page {page} sur {pages}
          </span>
          {page < pages ? (
            <Link
              href={`/evenements/${evenementId}?pageParticipants=${page + 1}`}
              className="underline underline-offset-4"
            >
              Page suivante
            </Link>
          ) : null}
        </nav>
      ) : null}
    </section>
  )
}
