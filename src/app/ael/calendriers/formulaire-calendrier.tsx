'use client'

import { useActionState } from 'react'
import type { Antenne } from '@/lib/donnees/antennes'
import { ajouterCalendrier, type EtatCalendrier } from './actions'

const etatInitial: EtatCalendrier = { erreur: null }

const JOURS: Array<{ valeur: number; libelle: string }> = [
  { valeur: 1, libelle: 'Lundi' },
  { valeur: 2, libelle: 'Mardi' },
  { valeur: 3, libelle: 'Mercredi' },
  { valeur: 4, libelle: 'Jeudi' },
  { valeur: 5, libelle: 'Vendredi' },
  { valeur: 6, libelle: 'Samedi' },
  { valeur: 7, libelle: 'Dimanche' },
]

export function FormulaireCalendrier({ antennes }: { antennes: Antenne[] }) {
  const [etat, envoyer, enCours] = useActionState(ajouterCalendrier, etatInitial)

  return (
    <form action={envoyer} className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <select
          name="antenneId"
          required
          defaultValue=""
          aria-label="Antenne"
          className="rounded-md border border-neutral-300 px-3 py-2"
        >
          <option value="" disabled>
            Choisir une antenne
          </option>
          {antennes.map((antenne) => (
            <option key={antenne.id} value={antenne.id}>
              {antenne.nom}
            </option>
          ))}
        </select>
        <select
          name="jourSemaine"
          required
          defaultValue={2}
          aria-label="Jour de la semaine"
          className="rounded-md border border-neutral-300 px-3 py-2"
        >
          {JOURS.map((jour) => (
            <option key={jour.valeur} value={jour.valeur}>
              {jour.libelle}
            </option>
          ))}
        </select>
        <input
          type="time"
          name="heure"
          aria-label="Heure (optionnelle)"
          className="rounded-md border border-neutral-300 px-3 py-2"
        />
        <button
          type="submit"
          disabled={enCours}
          className="rounded-md bg-neutral-900 px-4 py-2 text-white disabled:opacity-50"
        >
          {enCours ? 'Ajout…' : 'Ajouter'}
        </button>
      </div>

      {etat.erreur ? (
        <p role="alert" className="text-sm text-red-600">
          {etat.erreur}
        </p>
      ) : null}
    </form>
  )
}
