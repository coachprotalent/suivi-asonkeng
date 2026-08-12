'use client'

import { useState, useTransition, type FormEvent } from 'react'
import type { CompteListe } from '@/lib/donnees/comptes'
import type { MembreBref } from '@/lib/donnees/membres'
import { SelecteurMembre } from '../membres/selecteur-membre'
import { lierFiche } from './actions'

const LIBELLE_ROLE: Record<string, string> = {
  administrateur: 'Administrateur',
  moderateur: 'Modérateur',
}

export function LigneCompte({ compte, estMoi }: { compte: CompteListe; estMoi: boolean }) {
  // `membreNom` porte déjà « Prénom Nom » : on le passe comme `nom` avec un `prenom`
  // vide, forme que `SelecteurMembre` sait afficher telle quelle.
  const [fiche, setFiche] = useState<MembreBref | null>(
    compte.membreId && compte.membreNom
      ? { id: compte.membreId, nom: compte.membreNom, prenom: '' }
      : null,
  )
  const [erreurLiaison, setErreurLiaison] = useState<string | null>(null)
  const [enCours, demarrer] = useTransition()

  // `lierFiche` lève plutôt que de renvoyer un état (contrat de la Task 14) : la lier à
  // `<form action={lierFiche}>` directement ferait remonter cette exception jusqu'au
  // périmètre d'erreur le plus proche (`error.tsx`), qui affiche un message générique,
  // pas le message dédié — vérifié à l'essai contre l'application réelle : « Cette
  // fiche est déjà liée à un autre compte. » n'apparaissait jamais, seulement « Une
  // erreur est survenue ». On appelle donc l'action directement, comme le fait déjà
  // `SelecteurMembre` pour `chercherMembres`, pour intercepter le rejet ici.
  function soumettre(evenement: FormEvent<HTMLFormElement>) {
    evenement.preventDefault()
    const donnees = new FormData(evenement.currentTarget)
    setErreurLiaison(null)
    demarrer(async () => {
      try {
        await lierFiche(donnees)
      } catch (erreur) {
        setErreurLiaison(erreur instanceof Error ? erreur.message : String(erreur))
      }
    })
  }

  return (
    <li className="py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">
          {compte.nomAffichage}
          {estMoi ? <span className="ml-2 text-xs text-neutral-500">C&apos;est votre compte.</span> : null}
        </span>
        <span className="text-sm text-neutral-500">{compte.identifiant}</span>
      </div>

      <p className="mt-1 text-sm text-neutral-600">
        {compte.actif ? 'Actif' : 'Désactivé'}
        {' · '}
        {compte.roles.length > 0
          ? compte.roles.map((role) => LIBELLE_ROLE[role] ?? role).join(', ')
          : 'Utilisateur'}
      </p>

      {compte.estRacine ? (
        // Une contrainte CHECK sur `profils` interdit cette liaison (spec D11) : le
        // compte racine n'a jamais de fiche membre. Proposer un formulaire qui ne peut
        // qu'échouer serait pire que ne rien proposer.
        <p className="mt-3 text-sm text-neutral-600">
          Compte racine : sans place dans l&apos;arbre, donc sans fiche liée.
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          <form onSubmit={soumettre} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="profilId" value={compte.id} />
            <div className="min-w-64 flex-1">
              <SelecteurMembre
                nom="membreId"
                label="Fiche liée"
                aide="Détacher la fiche retire la portée d'autorité de ce compte."
                valeur={fiche}
                surChoix={setFiche}
                exclureId={null}
              />
            </div>
            <button
              type="submit"
              disabled={enCours}
              className="rounded-md border border-neutral-300 px-4 py-2 text-sm disabled:opacity-50"
            >
              {enCours ? 'Enregistrement…' : 'Enregistrer la fiche'}
            </button>
          </form>
          {erreurLiaison ? (
            <p role="alert" className="text-sm text-red-600">
              {erreurLiaison}
            </p>
          ) : null}
        </div>
      )}
    </li>
  )
}
