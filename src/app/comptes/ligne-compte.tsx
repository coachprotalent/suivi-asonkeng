'use client'

import { useActionState, useId, useState, useTransition, type FormEvent } from 'react'
import type { CompteListe } from '@/lib/donnees/comptes'
import type { MembreBref } from '@/lib/donnees/membres'
import { SelecteurMembre } from '../membres/selecteur-membre'
import {
  basculerActivation,
  definirRoles,
  lierFiche,
  reinitialiserMotDePasse,
  type EtatCompte,
} from './actions'

const LIBELLE_ROLE: Record<string, string> = {
  administrateur: 'Administrateur',
  moderateur: 'Modérateur',
}

const etatInitial: EtatCompte = {
  erreur: null,
  identifiantCree: null,
  motDePasseTemporaire: null,
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

  const [erreurRoles, setErreurRoles] = useState<string | null>(null)
  const [rolesEnCours, demarrerRoles] = useTransition()
  const [erreurActivation, setErreurActivation] = useState<string | null>(null)
  const [activationEnCours, demarrerActivation] = useTransition()

  // Correction au brief de la Task 15 (signalée par l'orchestrateur avant l'écriture) :
  // le brief affirmait que `definirRoles` et `basculerActivation`, en levant plutôt
  // qu'en renvoyant un état, s'afficheraient « par la page d'erreur de Next, avec le
  // message porté par l'exception ». C'est faux : `src/app/error.tsx` affiche un texte
  // STATIQUE et ne lit jamais `error.message` — le refus du dernier administrateur ne
  // serait donc jamais vu, exactement le défaut déjà trouvé sur `lierFiche` à la Task
  // 14 (voir le commentaire de `soumettre` ci-dessus). Même remède : on appelle
  // l'action directement depuis un `useTransition`, avec `try`/`catch`, pour intercepter
  // le rejet ici plutôt que de le laisser remonter au périmètre d'erreur générique.
  // Confirmation UNIQUEMENT sur sa propre ligne (`estMoi`), motif de
  // `BoutonArchiver` (`src/app/membres/[id]/bouton-archiver.tsx`) : passer la main
  // reste une action légitime pour n'importe quel compte, et aucun bouton n'est
  // verrouillé. Mais la protection du dernier administrateur (spec §7) est livrée
  // SANS PREUVE dans cet environnement (voir README) — c'est la seule chose qui
  // se tient entre un clic mal ciblé sur sa propre ligne et une application sans
  // administrateur, sans moyen d'en recréer un depuis l'interface.
  function soumettreRoles(evenement: FormEvent<HTMLFormElement>) {
    evenement.preventDefault()
    if (
      estMoi &&
      !window.confirm(
        'Modifier vos propres rôles ?\n\n' +
          'Si vous retirez votre rôle administrateur, vous perdrez ce pouvoir immédiatement.',
      )
    ) {
      return
    }
    const donnees = new FormData(evenement.currentTarget)
    setErreurRoles(null)
    demarrerRoles(async () => {
      try {
        await definirRoles(donnees)
      } catch (erreur) {
        setErreurRoles(erreur instanceof Error ? erreur.message : String(erreur))
      }
    })
  }

  function soumettreActivation(evenement: FormEvent<HTMLFormElement>) {
    evenement.preventDefault()
    if (
      estMoi &&
      !window.confirm(
        compte.actif
          ? 'Désactiver votre propre compte ?\n\n' +
            "Vous serez déconnecté et ne pourrez plus vous reconnecter tant qu'un autre " +
            'administrateur ne vous aura pas réactivé.'
          : 'Réactiver votre propre compte ?',
      )
    ) {
      return
    }
    const donnees = new FormData(evenement.currentTarget)
    setErreurActivation(null)
    demarrerActivation(async () => {
      try {
        await basculerActivation(donnees)
      } catch (erreur) {
        setErreurActivation(erreur instanceof Error ? erreur.message : String(erreur))
      }
    })
  }

  const [etatMdp, reinitialiser, reinitialisationEnCours] = useActionState(
    reinitialiserMotDePasse,
    etatInitial,
  )
  const prefixe = useId()
  const idAdmin = `${prefixe}-administrateur`
  const idModerateur = `${prefixe}-moderateur`

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

      {/*
        Depuis D24 (migration 20260814160000), archiver une fiche désactive
        automatiquement le compte ACTIF qui lui est lié : ce cas ne se produit donc
        plus dans le déroulement courant. Cette mention reste utile pour le cas
        résiduel — un administrateur qui réactive ce compte séparément, plus bas sur
        cette même ligne, SANS rétablir la fiche (D24 ne l'impose pas) — où elle
        redeviendrait à nouveau vraie : ce compte garderait alors sa portée
        d'autorité sur les statuts de ses subordonnés malgré une fiche archivée.
      */}
      {compte.membreId && compte.membreEtat && compte.membreEtat !== 'actif' ? (
        <p role="alert" className="mt-1 text-sm text-amber-700">
          {compte.membreEtat === 'archive' ? 'Fiche archivée' : 'Fiche en attente de validation'}
        </p>
      ) : null}

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

      <div className="mt-3 flex flex-wrap items-center gap-4">
        <form onSubmit={soumettreRoles} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="profilId" value={compte.id} />
          <label htmlFor={idAdmin} className="flex items-center gap-2 text-sm">
            <input
              id={idAdmin}
              name="administrateur"
              type="checkbox"
              defaultChecked={compte.roles.includes('administrateur')}
            />
            Administrateur
          </label>
          <label htmlFor={idModerateur} className="flex items-center gap-2 text-sm">
            <input
              id={idModerateur}
              name="moderateur"
              type="checkbox"
              defaultChecked={compte.roles.includes('moderateur')}
            />
            Modérateur
          </label>
          <button
            type="submit"
            disabled={rolesEnCours}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-50"
          >
            {rolesEnCours ? 'Enregistrement…' : 'Enregistrer les rôles'}
          </button>
        </form>

        <form onSubmit={soumettreActivation}>
          <input type="hidden" name="profilId" value={compte.id} />
          {/* La valeur envoyée est l'état VOULU, pas l'état courant : sans cette
              inversion explicite, un double-clic ou un onglet périmé rejouerait
              l'état déjà en place au lieu de le basculer. */}
          <input type="hidden" name="actif" value={compte.actif ? '0' : '1'} />
          <button
            type="submit"
            disabled={activationEnCours}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-50"
          >
            {activationEnCours ? 'Enregistrement…' : compte.actif ? 'Désactiver' : 'Réactiver'}
          </button>
        </form>

        <form action={reinitialiser}>
          <input type="hidden" name="profilId" value={compte.id} />
          <input type="hidden" name="identifiant" value={compte.identifiant} />
          <button
            type="submit"
            disabled={reinitialisationEnCours}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-50"
          >
            {reinitialisationEnCours ? 'Réinitialisation…' : 'Réinitialiser le mot de passe'}
          </button>
        </form>
      </div>

      {erreurRoles ? (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {erreurRoles}
        </p>
      ) : null}

      {erreurActivation ? (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {erreurActivation}
        </p>
      ) : null}

      {etatMdp.erreur ? (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {etatMdp.erreur}
        </p>
      ) : null}

      {etatMdp.motDePasseTemporaire ? (
        <div role="alert" className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm text-amber-900">
            Nouveau mot de passe temporaire de « {etatMdp.identifiantCree} », à transmettre de
            vive voix :{' '}
            <code className="rounded bg-white px-2 py-1 font-mono">
              {etatMdp.motDePasseTemporaire}
            </code>
          </p>
          <p className="mt-2 text-xs text-amber-800">
            Il ne sera plus jamais affiché. La personne devra en choisir un autre à sa
            prochaine connexion.
          </p>
        </div>
      ) : null}
    </li>
  )
}
