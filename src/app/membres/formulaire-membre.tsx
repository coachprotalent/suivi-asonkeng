'use client'

import { useActionState } from 'react'
import type { Antenne } from '@/lib/donnees/antennes'
import type { MembreDetail } from '@/lib/donnees/membres'
import type { EtatFormulaireMembre } from './actions'

const etatInitial: EtatFormulaireMembre = { erreur: null }

type Props = {
  action: (etat: EtatFormulaireMembre, donnees: FormData) => Promise<EtatFormulaireMembre>
  antennes: Antenne[]
  membre?: MembreDetail
  libelleBouton: string
}

export function FormulaireMembre({ action, antennes, membre, libelleBouton }: Props) {
  const [etat, envoyer, enCours] = useActionState(action, etatInitial)

  // L'antenne actuelle du membre doit figurer dans la liste même si elle a été
  // désactivée depuis. Sans cela, sa valeur n'existerait pas parmi les options : le
  // navigateur retomberait sur « Non rattaché » et le simple fait d'enregistrer une
  // autre modification détacherait le membre de son antenne, sans que personne ne
  // l'ait demandé ni vu.
  const optionsAntennes: Array<{ id: string; nom: string; inactive: boolean }> = [
    ...antennes.map((a) => ({ id: a.id, nom: a.nom, inactive: false })),
  ]
  if (membre?.antenneId && !antennes.some((a) => a.id === membre.antenneId)) {
    optionsAntennes.push({
      id: membre.antenneId,
      nom: membre.antenneNom ?? 'Antenne inconnue',
      inactive: true,
    })
  }

  return (
    <form action={envoyer} className="flex flex-col gap-4">
      {membre ? <input type="hidden" name="id" value={membre.id} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Prénom</span>
          <input
            name="prenom"
            defaultValue={membre?.prenom ?? ''}
            required
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Nom</span>
          <input
            name="nom"
            defaultValue={membre?.nom ?? ''}
            required
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Téléphone</span>
          <input
            name="telephone"
            type="tel"
            defaultValue={membre?.telephone ?? ''}
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Adresse de contact</span>
          <input
            name="emailContact"
            type="email"
            defaultValue={membre?.emailContact ?? ''}
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Ville</span>
          <input
            name="ville"
            defaultValue={membre?.ville ?? ''}
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Pays</span>
          <input
            name="pays"
            defaultValue={membre?.pays ?? ''}
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Antenne</span>
          <select
            name="antenneId"
            defaultValue={membre?.antenneId ?? ''}
            className="rounded-md border border-neutral-300 px-3 py-2"
          >
            <option value="">Non rattaché</option>
            {optionsAntennes.map((antenne) => (
              <option key={antenne.id} value={antenne.id}>
                {antenne.nom}
                {antenne.inactive ? ' (désactivée)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Situation</span>
          <select
            name="situation"
            defaultValue={membre?.situation ?? ''}
            className="rounded-md border border-neutral-300 px-3 py-2"
          >
            <option value="">Non renseignée</option>
            <option value="etudiant">Étudiant</option>
            <option value="travailleur">Travailleur</option>
            <option value="autre">Autre</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Domaine d&apos;étude</span>
          <input
            name="domaineEtude"
            defaultValue={membre?.domaineEtude ?? ''}
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
          <span className="text-xs text-neutral-500">
            Conservé uniquement si la situation est « Étudiant ».
          </span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">AEL déjà suivis</span>
          <input
            name="reportInitialAel"
            type="number"
            min={0}
            step={1}
            defaultValue={membre?.reportInitialAel ?? 0}
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
          <span className="text-xs text-neutral-500">
            Avant la mise en service de l&apos;application.
          </span>
        </label>
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
        {enCours ? 'Enregistrement…' : libelleBouton}
      </button>
    </form>
  )
}
