'use client'

import { useActionState, useId } from 'react'
import { creerCompte, type EtatCompte } from './actions'

const etatInitial: EtatCompte = {
  erreur: null,
  identifiantCree: null,
  motDePasseTemporaire: null,
}

export function FormulaireCompte() {
  const [etat, envoyer, enCours] = useActionState(creerCompte, etatInitial)
  const prefixe = useId()
  const idIdentifiant = `${prefixe}-identifiant`

  return (
    <div className="mb-10 flex flex-col gap-4">
      <form action={envoyer} className="flex flex-wrap items-end gap-3">
        {/* Champ AVEC texte d'aide : `htmlFor` explicite et aide sortie du <label>
            (contrainte globale 7 : un texte d'aide ne vit jamais dans un <label>). */}
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor={idIdentifiant} className="text-sm font-medium">
            Identifiant
          </label>
          <input
            id={idIdentifiant}
            name="identifiant"
            required
            autoCapitalize="none"
            spellCheck={false}
            aria-describedby={`${idIdentifiant}-aide`}
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
          <span id={`${idIdentifiant}-aide`} className="text-xs text-neutral-500">
            3 à 32 caractères : lettres, chiffres, points ou tirets, commençant par une
            lettre.
          </span>
        </div>

        {/* Champ SANS aide : le <label> enveloppant suffit et donne un nom correct. */}
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium">Nom d&apos;affichage</span>
          <input
            name="nomAffichage"
            required
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
        </label>

        <button
          type="submit"
          disabled={enCours}
          className="rounded-md bg-neutral-900 px-4 py-2 text-white disabled:opacity-50"
        >
          {enCours ? 'Création…' : 'Créer le compte'}
        </button>
      </form>

      {etat.erreur ? (
        <p role="alert" className="text-sm text-red-600">
          {etat.erreur}
        </p>
      ) : null}

      {etat.motDePasseTemporaire ? (
        <div role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">
            Compte « {etat.identifiantCree} » créé.
          </p>
          <p className="mt-2 text-sm text-amber-900">
            Mot de passe temporaire, à transmettre de vive voix :{' '}
            <code className="rounded bg-white px-2 py-1 font-mono">
              {etat.motDePasseTemporaire}
            </code>
          </p>
          <p className="mt-2 text-xs text-amber-800">
            Il ne sera plus jamais affiché. La personne devra en choisir un autre à sa
            première connexion.
          </p>
        </div>
      ) : null}
    </div>
  )
}
