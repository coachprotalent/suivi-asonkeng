'use client'

import { useActionState, useId, useState } from 'react'
import type { MembreBref } from '@/lib/donnees/membres'
import { SelecteurMembre } from '@/app/membres/selecteur-membre'
import { genererToken, type EtatToken } from './actions'
import { VALIDITE_JOURS_DEFAUT } from './constantes'

const etatInitial: EtatToken = { erreur: null, codeGenere: null }

export function FormulaireGeneration() {
  const [etat, envoyer, enCours] = useActionState(genererToken, etatInitial)
  const [mode, setMode] = useState<'nominatif' | 'generique'>('generique')
  const [membre, setMembre] = useState<MembreBref | null>(null)
  const prefixe = useId()
  const idJours = `${prefixe}-jours`

  return (
    <div className="mb-10 flex flex-col gap-4">
      <form action={envoyer} className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">Mode</legend>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="mode"
              value="generique"
              checked={mode === 'generique'}
              onChange={() => setMode('generique')}
            />
            Générique — l&apos;inscrit renseigne lui-même sa fiche
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="mode"
              value="nominatif"
              checked={mode === 'nominatif'}
              onChange={() => setMode('nominatif')}
            />
            Nominatif — rattaché à une fiche existante
          </label>
        </fieldset>

        {mode === 'nominatif' ? (
          <SelecteurMembre
            nom="membreId"
            label="Fiche visée"
            aide="La fiche à laquelle le compte créé sera automatiquement rattaché."
            valeur={membre}
            surChoix={setMembre}
            exclureId={null}
          />
        ) : null}

        <div className="flex flex-col gap-1.5">
          <label htmlFor={idJours} className="text-sm font-medium">
            Validité (jours)
          </label>
          <input
            id={idJours}
            name="validiteJours"
            type="number"
            min={1}
            step={1}
            defaultValue={VALIDITE_JOURS_DEFAUT}
            aria-describedby={`${idJours}-aide`}
            className="w-32 rounded-md border border-neutral-300 px-3 py-2"
          />
          <span id={`${idJours}-aide`} className="text-xs text-neutral-500">
            Proposée à {VALIDITE_JOURS_DEFAUT} jours, modifiable.
          </span>
        </div>

        <button
          type="submit"
          disabled={enCours}
          className="self-start rounded-md bg-neutral-900 px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          {enCours ? 'Génération…' : 'Générer le token'}
        </button>
      </form>

      {etat.erreur ? (
        <p role="alert" className="text-sm text-red-600">
          {etat.erreur}
        </p>
      ) : null}

      {etat.codeGenere ? (
        <div role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">Token généré.</p>
          <p className="mt-2 text-sm text-amber-900">
            Code, à transmettre de vive voix ou par écrit sécurisé :{' '}
            <code className="rounded bg-white px-2 py-1 font-mono">{etat.codeGenere}</code>
          </p>
          <p className="mt-2 text-xs text-amber-800">
            Il ne sera plus jamais affiché.
          </p>
        </div>
      ) : null}
    </div>
  )
}
