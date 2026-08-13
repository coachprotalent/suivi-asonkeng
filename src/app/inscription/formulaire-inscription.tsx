'use client'

import { useActionState, useId } from 'react'
import type { Antenne } from '@/lib/donnees/antennes'
import { sInscrire, type EtatInscription } from './actions'

const etatInitial: EtatInscription = { erreur: null }

/**
 * `useActionState` et NON un `<form action={...}>` nu : une action liée
 * directement à `action` ne peut rien dire à l'utilisateur — `src/app/error.tsx`
 * affiche un texte statique et ne lit jamais `error.message`. Un message d'erreur
 * renvoyé autrement n'atteindrait jamais l'écran.
 */
export function FormulaireInscription({ antennes }: { antennes: Antenne[] }) {
  const [etat, envoyer, enCours] = useActionState(sInscrire, etatInitial)
  const prefixe = useId()
  const idCode = `${prefixe}-code`
  const idIdentifiant = `${prefixe}-identifiant`
  const idMotDePasse = `${prefixe}-mdp`

  return (
    <form action={envoyer} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={idCode} className="text-sm font-medium">
          Code d&apos;inscription
        </label>
        <input
          id={idCode}
          name="code"
          required
          autoCapitalize="none"
          spellCheck={false}
          aria-describedby={`${idCode}-aide`}
          className="rounded-md border border-neutral-300 px-3 py-2"
        />
        <span id={`${idCode}-aide`} className="text-xs text-neutral-500">
          Fourni par un administrateur de l&apos;équipe.
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={idIdentifiant} className="text-sm font-medium">
          Identifiant choisi
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

      <div className="flex flex-col gap-1.5">
        <label htmlFor={idMotDePasse} className="text-sm font-medium">
          Mot de passe choisi
        </label>
        <input
          id={idMotDePasse}
          name="motDePasse"
          type="password"
          required
          autoComplete="new-password"
          aria-describedby={`${idMotDePasse}-aide`}
          className="rounded-md border border-neutral-300 px-3 py-2"
        />
        <span id={`${idMotDePasse}-aide`} className="text-xs text-neutral-500">
          Au moins 12 caractères.
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Prénom</span>
          <input name="prenom" required className="rounded-md border border-neutral-300 px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Nom</span>
          <input name="nom" required className="rounded-md border border-neutral-300 px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Téléphone</span>
          <input name="telephone" type="tel" className="rounded-md border border-neutral-300 px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Ville</span>
          <input name="ville" className="rounded-md border border-neutral-300 px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-sm font-medium">Antenne</span>
          <select name="antenneId" defaultValue="" className="rounded-md border border-neutral-300 px-3 py-2">
            <option value="">Non rattaché</option>
            {antennes.map((antenne) => (
              <option key={antenne.id} value={antenne.id}>
                {antenne.nom}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/*
        D30 : ce formulaire est le SEUL et reste identique quel que soit le code
        saisi. Les champs prénom/nom/téléphone/ville/antenne sont TOUJOURS
        affichés, même s'ils seront ignorés en mode nominatif (design 2b §7.1) —
        les masquer selon une supposition sur le mode reviendrait à recréer un
        oracle par la forme de la page, exactement ce que D30 interdit.
      */}

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
        {enCours ? 'Inscription…' : "S'inscrire"}
      </button>
    </form>
  )
}
