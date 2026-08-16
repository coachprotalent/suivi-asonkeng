'use client'

import Link from 'next/link'
import { useActionState, useEffect, useId, useRef, useState } from 'react'
import { formaterDateSeule } from '@/lib/format/date'
import type { ParticipantLigne } from '@/lib/donnees/evenements-lots'
import type { MembreBref } from '@/lib/donnees/membres'
import { SelecteurMembre } from '@/app/membres/selecteur-membre'
import { Bouton } from '@/composants/ui/bouton'
import { Dialogue } from '@/composants/ui/dialogue'
import { ChampsDesirs, DESIRS_VIDES, type ValeursDesirs } from './champs-desirs'
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
  const [desirs, setDesirs] = useState<ValeursDesirs>(DESIRS_VIDES)
  const prefixe = useId()

  // Vidé au SUCCÈS d'une VRAIE soumission, jamais au montage — même garde que
  // `formulaire-type.tsx` (tester seulement `etat.erreur === null` serait aussi vrai pour
  // `etatInitial`, et déclencherait l'effet dès le montage).
  const enCoursPrecedent = useRef(enCours)
  useEffect(() => {
    if (enCoursPrecedent.current && !enCours && etat.erreur === null) {
      setMembre(null)
      setDesirs(DESIRS_VIDES)
    }
    enCoursPrecedent.current = enCours
  }, [enCours, etat])

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
      <ChampsDesirs prefixe={prefixe} valeurs={desirs} onChange={setDesirs} />
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

  // CONTRÔLÉ — voir l'encadré de `champs-desirs.tsx`. Initialisé UNE FOIS depuis
  // `participant` (au montage) : après un enregistrement réussi, cet état local est déjà
  // ce qui vient d'être écrit, et la nouvelle valeur du prop (revalidation) coïncide —
  // aucune resynchronisation n'est nécessaire pour ce formulaire, qui ne se démonte pas
  // au succès (à la différence des deux formulaires de création).
  const [desirs, setDesirs] = useState<ValeursDesirs>({
    mentorat: participant.desirMentoratAcademique,
    suivi: participant.desirSuiviSpirituel,
    cpeap: participant.desirCpeap,
    note: participant.note ?? '',
  })

  // ═══ D124 — voir le commentaire de tête de `antennes/bouton-bascule-antenne.tsx`, le
  // gabarit des dix confirmations de famille A. Ce site est couvert par
  // `tests/e2e-prod/refus-evenements-production.spec.ts:235-240`, l'une des DIX preuves de
  // production, qui ASSERTE LE MESSAGE : il ne change pas d'un octet.
  const [suppressionConfirmationDemandee, setSuppressionConfirmationDemandee] = useState(false)
  const boutonSuppression = useRef<HTMLButtonElement | null>(null)

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
          {/* I3 de la revue finale — L'ÉTAT « CLASSÉ » ÉTAIT INVISIBLE PARTOUT. La ligne
              affichait « · converti » mais jamais « · classé », et la vue « à traiter »
              excluant les classés (D74), un modérateur ne pouvait apprendre NULLE PART
              qu'une personne avait été classée sans suite — ni pourquoi, le
              `motif_classement` étant obligatoire, validé deux fois, et affiché nulle
              part. Cette fiche d'évènement est le seul écran qui liste encore ces
              personnes : c'est donc ici que l'information doit vivre. */}
          {participant.externeClasseLe ? ' · classé sans suite' : ''}
        </span>
      </div>

      {participant.externeClasseLe ? (
        <p className="mt-1 text-sm text-neutral-600">
          Classé sans suite le {formaterDateSeule(participant.externeClasseLe)}
          {participant.externeMotifClassement ? ` — ${participant.externeMotifClassement}` : ''}
        </p>
      ) : null}

      <details className="mt-2">
        <summary className="cursor-pointer text-sm underline underline-offset-4">
          Corriger les désirs et la note
        </summary>
        {/* D77 — modifiable après coup : un désir se recueille souvent APRÈS l'évènement.
            `saisi_par` et `saisi_le` ne sont jamais touchés (D60). */}
        <form action={modifier} className="mt-3 flex flex-col gap-3">
          <input type="hidden" name="evenementId" value={evenementId} />
          <input type="hidden" name="participationId" value={participant.id} />
          <ChampsDesirs prefixe={prefixe} valeurs={desirs} onChange={setDesirs} />
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
        <Bouton
          ref={boutonSuppression}
          type="submit"
          variante="lien-danger"
          enCours={suppressionEnCours}
          onClick={(evenement) => {
            evenement.preventDefault()
            setSuppressionConfirmationDemandee(true)
          }}
        >
          Supprimer cette participation
        </Bouton>

        {/*
          D124 — `Dialogue` PORTE lui-même son `<dialog>` vers `document.body` par
          `createPortal` (`dialogue.tsx`) : c'est CE PORTAIL, et non la seule promotion
          visuelle dans la couche supérieure de `showModal()`, qui rend son appel ici, à
          côté du bouton et DANS le même `<form>`, sans risque. Sans le portail, ce serait
          un `<form method="dialog">` imbriqué dans le `<form>` ancêtre — HTML invalide,
          désaccord d'hydratation — précisément le défaut trouvé et corrigé après la Task
          15 (`afa178a`), qui avait fait expirer trois fichiers de preuve sans aucun
          rapport avec les confirmations. C'est la méprise exacte qui a produit cette
          régression une première fois ; ne pas la réécrire.
        */}
        <Dialogue
          ouvert={suppressionConfirmationDemandee}
          message={`Supprimer la participation de ${libelle} ? Les trois désirs et la note saisis pour cet évènement seront effacés, et l'évènement disparaîtra des séminaires assistés de cette personne.`}
          surConfirmation={() => {
            setSuppressionConfirmationDemandee(false)
            boutonSuppression.current?.form?.requestSubmit(boutonSuppression.current)
          }}
          surAnnulation={() => setSuppressionConfirmationDemandee(false)}
        />

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
