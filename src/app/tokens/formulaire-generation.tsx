'use client'

import { useActionState, useState } from 'react'
import type { MembreBref } from '@/lib/donnees/membres'
import { SelecteurMembre } from '@/app/membres/selecteur-membre'
import { Bouton } from '@/composants/ui/bouton'
import { Carte } from '@/composants/ui/carte'
import { Champ } from '@/composants/ui/champ'
import { Formulaire } from '@/composants/ui/formulaire'
import { genererToken, type EtatToken } from './actions'
import { VALIDITE_JOURS_DEFAUT } from './constantes'

const etatInitial: EtatToken = { erreur: null, codeGenere: null }

export function FormulaireGeneration() {
  const [etat, envoyer, enCours] = useActionState(genererToken, etatInitial)
  const [mode, setMode] = useState<'nominatif' | 'generique'>('generique')
  const [membre, setMembre] = useState<MembreBref | null>(null)
  const [validiteJours, setValiditeJours] = useState(String(VALIDITE_JOURS_DEFAUT))

  return (
    <div className="flex flex-col gap-esp-4">
      <Formulaire
        action={envoyer}
        erreur={etat.erreur}
        enCours={enCours}
        actions={
          <Bouton type="submit" alignement="debut" enCours={enCours} libelleAttente="Génération…">
            Générer le token
          </Bouton>
        }
      >
        <fieldset className="flex flex-col gap-esp-2">
          <legend className="libelle-champ text-petit text-encre">Mode</legend>
          <label className="cible-tactile flex items-center gap-esp-2 text-petit text-encre">
            <input
              type="radio"
              name="mode"
              value="generique"
              checked={mode === 'generique'}
              onChange={() => setMode('generique')}
            />
            Générique — l&apos;inscrit renseigne lui-même sa fiche
          </label>
          <label className="cible-tactile flex items-center gap-esp-2 text-petit text-encre">
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

        <Champ
          label="Validité (jours)"
          name="validiteJours"
          type="number"
          min={1}
          step={1}
          value={validiteJours}
          onChange={(evenement) => setValiditeJours(evenement.target.value)}
          aide={`Proposée à ${VALIDITE_JOURS_DEFAUT} jours, modifiable.`}
          largeur="etroite"
        />
      </Formulaire>

      {etat.codeGenere ? (
        <Carte ton="avertissement" role="alert">
          <p className="text-corps">Token généré.</p>
          <p className="mt-esp-2 text-corps">
            Code, à transmettre de vive voix ou par écrit sécurisé :{' '}
            <code className="rounded-bord bg-fond px-esp-2 py-esp-1 font-mono">{etat.codeGenere}</code>
          </p>
          <p className="mt-esp-2 text-petit text-encre-attenuee">Il ne sera plus jamais affiché.</p>
        </Carte>
      ) : null}
    </div>
  )
}
