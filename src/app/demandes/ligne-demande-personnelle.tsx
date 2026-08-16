'use client'

import { useState, useTransition } from 'react'
import { Bouton } from '@/composants/ui/bouton'
import { Dialogue } from '@/composants/ui/dialogue'
import type { DemandeListe } from '@/lib/donnees/demandes'
import { annulerDemandeSuivi } from './actions'

const LIBELLE_ETAT: Record<DemandeListe['etat'], string> = {
  en_attente: 'En attente',
  validee: 'Validée',
  rejetee: 'Rejetée',
  annulee: 'Annulée',
}

export function LigneDemandePersonnelle({ demande }: { demande: DemandeListe }) {
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, demarrer] = useTransition()

  // ═══ D124 — voir le commentaire de tête de `comptes/ligne-compte.tsx`. Ce site est
  // « sans danger » (relevé d'avance) : aucun `evenement.currentTarget` n'est en jeu, la
  // `FormData` est construite de zéro à partir de `demande.id`, disponible que la
  // confirmation soit immédiate ou différée.
  const [confirmationDemandee, setConfirmationDemandee] = useState(false)

  function executerAnnulation() {
    const donnees = new FormData()
    donnees.set('demandeId', demande.id)
    setErreur(null)
    demarrer(async () => {
      // `annulerDemandeSuivi` RETOURNE son refus, elle ne le lève plus
      // (correction post-Task-17 : un `throw` perd son message en production,
      // voir le commentaire de tête de `src/app/demandes/actions.ts`).
      const { erreur } = await annulerDemandeSuivi(donnees)
      if (erreur) {
        setErreur(erreur)
      }
    })
  }

  return (
    <li className="py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">
          {demande.membrePrenom ?? '—'} {demande.membreNom ?? ''}
        </span>
        <span className="text-sm text-neutral-500">{LIBELLE_ETAT[demande.etat]}</span>
      </div>
      {demande.etat === 'rejetee' && demande.motifRejet ? (
        <p className="mt-1 text-sm text-neutral-600">Motif : {demande.motifRejet}</p>
      ) : null}
      {/*
        D64 — le bouton d'annulation n'est PAS proposé pour une demande issue d'une
        CONVERSION. L'annulation supprime la fiche `en_attente` (D42, phase 2b), et
        `participants_externes.converti_en_membre_id` pointe sur elle : le participant
        serait DÉCONVERTI en silence, son historique de séminaire perdu, et il
        réapparaîtrait dans la liste « à traiter ».
        DEUX barrières le refusent déjà côté serveur — `annuler_demande_membre` amendée
        (marqueur `demande_conversion_non_annulable`) et la contrainte `on delete restrict`
        — mais AFFICHER UN BOUTON QUI ÉCHOUE TOUJOURS est un mensonge d'interface, et
        l'administrateur convertisseur est précisément celui à qui il s'afficherait.
      */}
      {demande.etat === 'en_attente' && demande.origine !== 'conversion_participant' ? (
        <div className="mt-esp-2">
          <Bouton
            type="button"
            variante="lien-danger"
            enCours={enCours}
            libelleAttente="Annulation…"
            onClick={() => setConfirmationDemandee(true)}
          >
            Annuler
          </Bouton>

          <Dialogue
            ouvert={confirmationDemandee}
            message="Annuler cette demande ? La fiche créée sera supprimée."
            surConfirmation={() => {
              setConfirmationDemandee(false)
              executerAnnulation()
            }}
            surAnnulation={() => setConfirmationDemandee(false)}
          />
        </div>
      ) : null}
      {demande.etat === 'en_attente' && demande.origine === 'conversion_participant' ? (
        <p className="mt-2 text-sm text-neutral-500">
          Cette fiche vient d&apos;une conversion de participant : elle ne peut pas être
          annulée, sous peine de perdre l&apos;historique de séminaire de cette personne.
        </p>
      ) : null}
      {erreur ? (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {erreur}
        </p>
      ) : null}
    </li>
  )
}
