'use client'

import { useActionState } from 'react'
import { seConnecter, type EtatConnexion } from './actions'

const etatInitial: EtatConnexion = { erreur: null }

/**
 * Extrait de `page.tsx`, devenue un composant serveur pour pouvoir lire
 * `searchParams` (l'accusé d'inscription). Le formulaire lui-même est inchangé :
 * `useActionState`, sans quoi `MESSAGE_ECHEC_CONNEXION` n'atteindrait pas l'écran.
 */
export function FormulaireConnexion() {
  const [etat, action, enCours] = useActionState(seConnecter, etatInitial)

  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Identifiant</span>
        <input
          name="identifiant"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          className="rounded-md border border-neutral-300 px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Mot de passe</span>
        <input
          name="motDePasse"
          type="password"
          autoComplete="current-password"
          required
          className="rounded-md border border-neutral-300 px-3 py-2"
        />
      </label>

      {etat.erreur ? (
        <p role="alert" className="text-sm text-red-600">
          {etat.erreur}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={enCours}
        className="rounded-md bg-neutral-900 px-4 py-2 font-medium text-white disabled:opacity-50"
      >
        {enCours ? 'Connexion…' : 'Se connecter'}
      </button>
    </form>
  )
}
