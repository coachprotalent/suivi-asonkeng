'use client'

import Link from 'next/link'
import { useRef, useState, useTransition, type FormEvent } from 'react'
import type { DemandeListe } from '@/lib/donnees/demandes'
import type { MembreBref } from '@/lib/donnees/membres'
import { Bouton } from '@/composants/ui/bouton'
import { Champ } from '@/composants/ui/champ'
import { Dialogue } from '@/composants/ui/dialogue'
import { LigneListe } from '@/composants/ui/ligne-liste'
import { Refus } from '@/composants/ui/refus'
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
  // ⚠️ UN SEUL REFUS PARTAGÉ PAR TROIS CHEMINS (validation directe, rattachement, rejet) —
  // c'est pourquoi ce fichier NE PASSE PAS par `Formulaire` (qui rendrait un `<Refus>` par
  // `<form>`, à un endroit différent selon le chemin qui a échoué). Le bandeau reste rendu
  // UNE SEULE FOIS, en bas de la ligne, comme avant cette migration : `Refus` est employé
  // nu, sans le `<form>` qui l'enveloppe ailleurs.
  const [erreur, setErreur] = useState<string | null>(null)
  const [motif, setMotif] = useState('')
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

  /**
   * M12 DE LA REVUE FINALE — LE REJET N'AVAIT AUCUNE CONFIRMATION, contrairement à tous les
   * autres gestes irréversibles du projet (suppression d'une participation, annulation d'une
   * demande, et désormais la conversion elle-même).
   *
   * ET IL EST PARTICULIÈREMENT DÉFINITIF POUR UNE ORIGINE : rejeter une demande
   * `conversion_participant` laisse la fiche `en_attente` POUR TOUJOURS — la validation exige
   * `etat = 'en_attente'` mais aussi une demande `en_attente`, l'annulation est refusée, et
   * le membre n'est pas supprimable. Aucun geste de l'application ne rattrape ce cas. La
   * confirmation le DIT, au lieu de le laisser découvrir après coup.
   *
   * ═══ D124 — voir le commentaire de tête de `comptes/ligne-compte.tsx` sur
   * `evenement.currentTarget` ═══ Ce site capturait DÉJÀ `formulaire` dans une variable
   * avant le `window.confirm`, ce qui l'aurait mis à l'abri du défaut — mais la `FormData`
   * elle-même est construite ici plus tôt encore, dans le clic, pour rester dans le MÊME
   * style que les deux sites de `ligne-compte.tsx` qui, eux, en avaient besoin.
   */
  const nomComplet = `${demande.membrePrenom ?? ''} ${demande.membreNom ?? ''}`.trim()
  const consequenceRejet =
    demande.origine === 'conversion_participant'
      ? "Cette personne a été convertie depuis un évènement : sa fiche restera « en attente » DÉFINITIVEMENT, et aucun geste de l'application ne pourra plus l'activer ni la supprimer."
      : 'Le demandeur en sera notifié avec le motif saisi.'
  const messageRejet = `Rejeter la demande concernant ${nomComplet} ? ${consequenceRejet}`

  const [confirmationRejetDemandee, setConfirmationRejetDemandee] = useState(false)
  const donneesRejetEnAttente = useRef<FormData | null>(null)

  function soumettreRejet(evenement: FormEvent<HTMLFormElement>) {
    evenement.preventDefault()
    donneesRejetEnAttente.current = new FormData(evenement.currentTarget)
    setConfirmationRejetDemandee(true)
  }

  return (
    <LigneListe
      principal={`${demande.membrePrenom} ${demande.membreNom}`}
      meta={
        <>
          {LIBELLE_ORIGINE[demande.origine]} · par {demande.demandeurNom}
        </>
      }
      complement={
        <div className="flex flex-col gap-esp-3">
          {demande.origine === 'auto_inscription' ? (
            <div className="flex flex-col gap-esp-3">
              <Bouton type="button" onClick={validerNouvellePersonne} enCours={enCours} alignement="debut">
                Valider comme nouvelle personne
              </Bouton>

              <form onSubmit={soumettreRattachement} className="flex flex-wrap items-end gap-esp-3">
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
                <Bouton type="submit" variante="secondaire" disabled={!ficheRattachement} enCours={enCours}>
                  Rattacher
                </Bouton>
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
            <div className="flex flex-col gap-esp-2">
              <Bouton type="button" onClick={validerNouvellePersonne} enCours={enCours} alignement="debut">
                Valider comme nouvelle personne
              </Bouton>
              <p className="text-petit text-encre-attenuee">
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

          <form onSubmit={soumettreRejet} className="flex flex-wrap items-end gap-esp-3">
            <input type="hidden" name="demandeId" value={demande.id} />
            {/* `demandeurProfilId` N'EST PLUS TRANSMIS (I6 de la revue finale) :
                `rejeterDemande` le relit depuis `demandes_membre`. Le laisser ici
                laisserait croire que le serveur s'en sert, et rouvrirait la porte à
                un formulaire falsifié qui ferait partir le motif de rejet vers le
                compte d'un tiers. */}
            <Champ
              label="Motif de rejet"
              name="motif"
              required
              value={motif}
              onChange={(evenement) => setMotif(evenement.target.value)}
              largeur="flexible"
            />
            <Bouton type="submit" variante="bordure-danger" enCours={enCours}>
              Rejeter
            </Bouton>
          </form>

          <Dialogue
            ouvert={confirmationRejetDemandee}
            message={messageRejet}
            surConfirmation={() => {
              setConfirmationRejetDemandee(false)
              if (donneesRejetEnAttente.current) appeler(rejeterDemande, donneesRejetEnAttente.current)
            }}
            surAnnulation={() => setConfirmationRejetDemandee(false)}
          />

          <Refus message={erreur} />
        </div>
      }
    />
  )
}
