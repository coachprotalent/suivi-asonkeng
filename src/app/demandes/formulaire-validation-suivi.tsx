'use client'

import { useState, useTransition, type FormEvent } from 'react'
import type { MembreBref } from '@/lib/donnees/membres'
import { Bouton } from '@/composants/ui/bouton'
import { Formulaire } from '@/composants/ui/formulaire'
import { SelecteurMembre } from '@/app/membres/selecteur-membre'
import { validerDemandeNouvellePersonne } from './actions'

type Props = {
  demandeId: string
  membreId: string
  dirigeantInitial: MembreBref | null
}

export function FormulaireValidationSuivi({ demandeId, membreId, dirigeantInitial }: Props) {
  const [dirigeant, setDirigeant] = useState<MembreBref | null>(dirigeantInitial)
  // Accepter la proposition laisse dirigeantForce à false ; toute correction
  // manuelle le passe à true — même sémantique que l'écran /membres/[id]/arbre
  // de la 1c (spec §4.2 : « défini manuellement » contre « calculé »).
  const [dirigeantForce, setDirigeantForce] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, demarrer] = useTransition()

  function choisirDirigeant(membre: MembreBref | null) {
    setDirigeant(membre)
    setDirigeantForce(true)
  }

  function soumettre(evenement: FormEvent<HTMLFormElement>) {
    evenement.preventDefault()
    const donnees = new FormData(evenement.currentTarget)
    setErreur(null)
    demarrer(async () => {
      // `validerDemandeNouvellePersonne` RETOURNE son refus, elle ne le lève
      // plus (correction post-Task-17 : un `throw` perd son message en
      // production, voir le commentaire de tête de `src/app/demandes/actions.ts`).
      const { erreur } = await validerDemandeNouvellePersonne(donnees)
      if (erreur) {
        setErreur(erreur)
      }
    })
  }

  return (
    <div className="rounded-bord border border-bord-carte p-esp-3">
      <Formulaire
        onSubmit={soumettre}
        erreur={erreur}
        enCours={enCours}
        actions={
          <Bouton type="submit" alignement="debut" enCours={enCours} libelleAttente="Validation…">
            Valider comme nouvelle personne
          </Bouton>
        }
      >
        <input type="hidden" name="demandeId" value={demandeId} />
        {/* `demandeurMembreId` N'EST PLUS TRANSMIS : `validerDemandeNouvellePersonne`
            relit la fiche du demandeur depuis `profils`. C'est un FAIT, pas une
            décision de l'administrateur ; le transmettre laissait un formulaire
            falsifié écrire dans l'arbre une filiation qui n'a jamais eu lieu. */}
        <input type="hidden" name="dirigeantForce" value={dirigeantForce ? '1' : '0'} />
        {/*
          ⚠️ LE RAIL DE FILIATION — l'un des CINQ sites légitimes (globals.css, D106). Ce
          sélecteur affiche et corrige une PROPOSITION RÉELLE de discipulat, calculée
          depuis l'arbre du demandeur (`dirigeantPropose`, `page.tsx`) : la relation
          existe, le rail ne ment pas.
        */}
        <div className="rail-filiation">
          <SelecteurMembre
            nom="dirigeantId"
            label="Dirigeant proposé"
            aide="Dirigeant proposé à partir du demandeur : corrigeable avant validation. Le faiseur de disciple, lui, est fixé au demandeur et n'est jamais modifiable ici."
            valeur={dirigeant}
            surChoix={choisirDirigeant}
            exclureId={membreId}
          />
        </div>
      </Formulaire>
    </div>
  )
}
