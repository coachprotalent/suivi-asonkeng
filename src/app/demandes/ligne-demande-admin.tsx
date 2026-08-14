'use client'

import Link from 'next/link'
import { useState, useTransition, type FormEvent } from 'react'
import type { DemandeListe } from '@/lib/donnees/demandes'
import type { MembreBref } from '@/lib/donnees/membres'
import { SelecteurMembre } from '@/app/membres/selecteur-membre'
import {
  rejeterDemande,
  validerDemandeNouvellePersonne,
  validerDemandeRattachement,
  type ResultatDemande,
} from './actions'
import { FormulaireValidationSuivi } from './formulaire-validation-suivi'

// Table exhaustive plutôt qu'un ternaire : `Record<DemandeListe['origine'], string>` fait
// ÉCHOUER `tsc` le jour où une quatrième origine sera ajoutée à l'énumération, là où un
// ternaire l'aurait silencieusement étiquetée comme la branche `else`. C'est exactement ce
// qui serait arrivé à `conversion_participant`, affichée « Demande de suivi ».
const LIBELLE_ORIGINE: Record<DemandeListe['origine'], string> = {
  auto_inscription: 'Auto-inscription',
  demande_suivi: 'Demande de suivi',
  conversion_participant: 'Conversion de participant',
}

export function LigneDemandeAdmin({
  demande,
  dirigeantInitial,
}: {
  demande: DemandeListe
  dirigeantInitial: MembreBref | null
}) {
  const [ficheRattachement, setFicheRattachement] = useState<MembreBref | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, demarrer] = useTransition()

  // Les trois actions RETOURNENT leur refus, elles ne le lèvent plus
  // (correction post-Task-17 : un `throw` perd son message en production —
  // voir le commentaire de tête de `src/app/demandes/actions.ts`).
  function appeler(action: (donnees: FormData) => Promise<ResultatDemande>, donnees: FormData) {
    setErreur(null)
    demarrer(async () => {
      const { erreur } = await action(donnees)
      if (erreur) {
        setErreur(erreur)
      }
    })
  }

  function validerNouvellePersonne() {
    const donnees = new FormData()
    donnees.set('demandeId', demande.id)
    appeler(validerDemandeNouvellePersonne, donnees)
  }

  function soumettreRattachement(evenement: FormEvent<HTMLFormElement>) {
    evenement.preventDefault()
    if (!ficheRattachement) return
    const donnees = new FormData()
    donnees.set('demandeId', demande.id)
    donnees.set('membreExistantId', ficheRattachement.id)
    appeler(validerDemandeRattachement, donnees)
  }

  function soumettreRejet(evenement: FormEvent<HTMLFormElement>) {
    evenement.preventDefault()
    appeler(rejeterDemande, new FormData(evenement.currentTarget))
  }

  return (
    <li className="py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">
          {demande.membrePrenom} {demande.membreNom}
        </span>
        <span className="text-sm text-neutral-500">
          {LIBELLE_ORIGINE[demande.origine]} · par {demande.demandeurNom}
        </span>
      </div>

      {demande.origine === 'auto_inscription' ? (
        <div className="mt-3 flex flex-col gap-3">
          <button
            type="button"
            onClick={validerNouvellePersonne}
            disabled={enCours}
            className="self-start rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            Valider comme nouvelle personne
          </button>

          <form onSubmit={soumettreRattachement} className="flex flex-wrap items-end gap-3">
            <div className="min-w-64 flex-1">
              <SelecteurMembre
                nom="membreExistantId"
                label="Ou rattacher à une fiche existante"
                aide="La fiche en_attente créée à l'inscription sera supprimée."
                valeur={ficheRattachement}
                surChoix={setFicheRattachement}
                exclureId={demande.membreId}
              />
            </div>
            <button
              type="submit"
              disabled={enCours || !ficheRattachement}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-50"
            >
              Rattacher
            </button>
          </form>
        </div>
      ) : demande.origine === 'demande_suivi' ? (
        <FormulaireValidationSuivi
          demandeId={demande.id}
          membreId={demande.membreId ?? ''}
          dirigeantInitial={dirigeantInitial}
        />
      ) : (
        // D66 — origine `conversion_participant`. LE BOUTON DE VALIDATION, SEUL.
        //
        // PAS le formulaire de rattachement (§7.3 de la 2b le réserve à auto_inscription),
        // PAS `FormulaireValidationSuivi` : ce dernier poserait le DEMANDEUR comme faiseur
        // de disciple, et le demandeur est ici l'administrateur qui a converti — il n'est
        // pas le faiseur de disciple de la personne convertie.
        //
        // MAIS LA VALIDATION, OUI, ET ELLE EST INDISPENSABLE : c'est LE SEUL GESTE DE TOUTE
        // L'APPLICATION qui passe une fiche `en_attente` à `actif`. Sans elle, la fiche née
        // du chemin 1 resterait invisible de tout compte ordinaire, son historique de
        // séminaire n'apparaîtrait nulle part, et la conversion serait irréversible ET
        // inachevable. Pour cette origine, la validation écrit `etat = 'actif'` ET RIEN
        // D'AUTRE — aucun faiseur de disciple n'est posé.
        <div className="mt-3 flex flex-col gap-2">
          <button
            type="button"
            onClick={validerNouvellePersonne}
            disabled={enCours}
            className="self-start rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            Valider comme nouvelle personne
          </button>
          <p className="text-sm text-neutral-600">
            Fiche créée par conversion d&apos;un participant externe. La validation la fait
            passer à l&apos;état actif, sans lui donner de faiseur de disciple : rattachez-la
            ensuite depuis{' '}
            <Link href={`/membres/${demande.membreId}/arbre`} className="underline underline-offset-4">
              son arborescence
            </Link>
            . Le rejet, lui, ne défait pas la conversion : la fiche resterait en attente,
            sans plus aucun geste pour l&apos;activer.
          </p>
        </div>
      )}

      <form onSubmit={soumettreRejet} className="mt-3 flex flex-wrap items-end gap-3">
        <input type="hidden" name="demandeId" value={demande.id} />
        {/* `demandeurProfilId` N'EST PLUS TRANSMIS (I6 de la revue finale) :
            `rejeterDemande` le relit depuis `demandes_membre`. Le laisser ici
            laisserait croire que le serveur s'en sert, et rouvrirait la porte à
            un formulaire falsifié qui ferait partir le motif de rejet vers le
            compte d'un tiers. */}
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium">Motif de rejet</span>
          <input name="motif" required className="rounded-md border border-neutral-300 px-3 py-2" />
        </label>
        <button
          type="submit"
          disabled={enCours}
          className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-600 disabled:opacity-50"
        >
          Rejeter
        </button>
      </form>

      {erreur ? (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {erreur}
        </p>
      ) : null}
    </li>
  )
}
