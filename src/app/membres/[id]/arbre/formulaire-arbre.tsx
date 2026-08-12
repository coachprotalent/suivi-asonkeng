'use client'

import { useActionState, useState, useTransition } from 'react'
import type { MembreBref } from '@/lib/donnees/membres'
import { SelecteurMembre } from '../../selecteur-membre'
import { definirArbre, proposerDirigeant, type EtatArbre } from './actions'

const etatInitial: EtatArbre = { erreur: null }

type Props = {
  membreId: string
  faiseurInitial: MembreBref | null
  dirigeantInitial: MembreBref | null
  dirigeantForceInitial: boolean
  propositionInitiale: MembreBref | null
}

export function FormulaireArbre({
  membreId,
  faiseurInitial,
  dirigeantInitial,
  dirigeantForceInitial,
  propositionInitiale,
}: Props) {
  const [etat, envoyer, enCours] = useActionState(definirArbre, etatInitial)
  const [faiseur, setFaiseur] = useState(faiseurInitial)
  // Correction apportée en revue (voir le rapport de tâche) : `dirigeant_id` vaut
  // `null` sur un membre dont personne n'a encore fixé le dirigeant, y compris quand
  // il est CALCULABLE (faiseur de disciple connu, jamais encore enregistré). Initialiser
  // simplement avec `dirigeantInitial` afficherait « Calculé à partir du faiseur de
  // disciple. » tout en gardant un champ cache à `null` — enregistrer sans rien
  // toucher écrirait alors `null` en base au lieu de la proposition annoncée à l'écran.
  // Un dirigeant FORCÉ à « aucun » (dirigeantForceInitial vrai, dirigeantInitial null)
  // doit, lui, rester à `null` : c'est un choix délibéré de l'administrateur, pas un
  // calcul jamais fait.
  const [dirigeant, setDirigeant] = useState(
    dirigeantInitial ?? (dirigeantForceInitial ? null : propositionInitiale),
  )
  const [force, setForce] = useState(dirigeantForceInitial)
  const [proposition, setProposition] = useState(propositionInitiale)
  const [calculEnCours, demarrerCalcul] = useTransition()

  function changerFaiseur(membre: MembreBref | null) {
    setFaiseur(membre)
    demarrerCalcul(async () => {
      const propose = await proposerDirigeant(membre?.id ?? null)
      setProposition(propose)
      // La proposition ne s'impose PAS à un dirigeant défini à la main : l'admin qui a
      // délibérément forcé une valeur ne doit pas la voir disparaître parce qu'il
      // corrige le faiseur de disciple. C'est le sens du drapeau (spec §4.2).
      if (!force) {
        setDirigeant(propose)
      }
    })
  }

  function changerDirigeant(membre: MembreBref | null) {
    setDirigeant(membre)
    // Toucher soi-même à ce champ, c'est forcer. Le bouton ci-dessous est la seule
    // façon de revenir au calcul, et il est toujours offert.
    setForce(true)
  }

  function revenirAuCalcul() {
    setDirigeant(proposition)
    setForce(false)
  }

  return (
    <form action={envoyer} className="flex flex-col gap-6">
      <input type="hidden" name="membreId" value={membreId} />
      <input type="hidden" name="dirigeantForce" value={force ? '1' : '0'} />

      <SelecteurMembre
        nom="faiseurDeDiscipleId"
        label="Faiseur de disciple"
        aide="Laisser vide fait de ce membre une racine de l'arbre."
        valeur={faiseur}
        surChoix={changerFaiseur}
        exclureId={membreId}
      />

      <div className="flex flex-col gap-1.5">
        <SelecteurMembre
          nom="dirigeantId"
          label="Dirigeant"
          aide="Proposé à partir du faiseur de disciple. Vous pouvez en choisir un autre."
          valeur={dirigeant}
          surChoix={changerDirigeant}
          exclureId={membreId}
        />
        <p className="text-xs text-neutral-500">
          {calculEnCours
            ? 'Calcul de la proposition…'
            : force
              ? 'Défini manuellement.'
              : 'Calculé à partir du faiseur de disciple.'}
          {force ? (
            <>
              {' '}
              <button
                type="button"
                onClick={revenirAuCalcul}
                className="underline underline-offset-4"
              >
                Revenir au dirigeant calculé
              </button>
              {proposition ? ` (${proposition.prenom} ${proposition.nom})` : ' (aucun)'}
            </>
          ) : null}
        </p>
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
        {enCours ? 'Enregistrement…' : 'Enregistrer le rattachement'}
      </button>
    </form>
  )
}
