'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { Bouton } from '@/composants/ui/bouton'
import { Refus } from '@/composants/ui/refus'
import { genererSeances, type EtatGeneration } from './actions'

const etatInitial: EtatGeneration = { erreur: null, creees: null, aucunCalendrier: false }

export function BoutonGenerer() {
  const [etat, envoyer, enCours] = useActionState(genererSeances, etatInitial)

  return (
    // Pas de champ dans ce formulaire (un seul bouton) : `Formulaire` ne s'y prête pas,
    // même précédent que `antennes/bouton-bascule-antenne.tsx`. `Refus` est réemployé nu
    // pour la même mise en forme du bandeau, SANS le report de focus (D113) — ce formulaire
    // n'en a jamais eu, et lui en ajouter serait un comportement nouveau, non déclaré.
    <form action={envoyer} className="flex flex-col gap-esp-2">
      <Bouton
        type="submit"
        alignement="debut"
        enCours={enCours}
        libelleAttente="Génération…"
      >
        Générer les séances
      </Bouton>

      <Refus message={etat.erreur} />

      {/*
        `aucunCalendrier` AVANT `creees` : les deux valent 0 séance créée, mais pour des
        raisons opposées. Annoncer « tout est déjà généré » alors qu'aucun créneau n'est
        actif décrirait une situation qui n'est pas celle-là. Les deux branches portent
        `role="status"` — l'un des sept du dépôt, CONSERVÉ (une attente non liée à un
        clic de bouton) : un test qui attend l'apparition du compte rendu (Task 19)
        reste valable dans les deux cas.
      */}
      {etat.aucunCalendrier ? (
        <p role="status" className="text-petit text-encre-attenuee">
          Aucun créneau actif : ajoutez ou réactivez un créneau dans{' '}
          <Link href="/ael/calendriers" className="text-action underline underline-offset-4">
            le calendrier
          </Link>{' '}
          avant de générer.
        </p>
      ) : etat.creees !== null ? (
        <p role="status" className="text-petit text-encre-attenuee">
          {etat.creees === 0
            ? 'Aucune nouvelle séance : tout est déjà généré sur cet horizon.'
            : `${etat.creees} séance${etat.creees > 1 ? 's' : ''} générée${etat.creees > 1 ? 's' : ''}.`}
        </p>
      ) : null}
    </form>
  )
}
