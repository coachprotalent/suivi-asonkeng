'use client'

import { useActionState, useEffect, useId, useRef, useState } from 'react'
import { LONGUEUR_MDP_MINIMALE } from '@/app/changer-mot-de-passe/constantes'
import type { Antenne } from '@/lib/donnees/antennes'
import { sInscrire, type EtatInscription } from './actions'

const etatInitial: EtatInscription = { erreur: null }

/**
 * `useActionState` et NON un `<form action={...}>` nu : une action liée directement à
 * `action` ne peut rien dire à l'utilisateur — `src/app/error.tsx` affiche un texte
 * statique et ne lit jamais `error.message`. Un message d'erreur renvoyé autrement
 * n'atteindrait jamais l'écran.
 *
 * ═══ TOUS LES CHAMPS SONT CONTRÔLÉS, ET C'EST LE CŒUR DE CE FICHIER. ═══
 *
 * React réinitialise les champs NON CONTRÔLÉS d'un `<form action>` à TOUTE complétion de
 * l'action, Y COMPRIS sur un refus RETOURNÉ. Ce composant était le PIRE CAS DU DÉPÔT :
 * huit champs libres, sur le SEUL écran public de l'application, EN PRODUCTION, et sans
 * aucun rattrapage possible. Une personne saisissait son identité, son contact et son
 * antenne, se trompait de code d'inscription, et perdait les huit champs — sans pouvoir
 * comprendre son erreur, le §7 imposant ici un message indifférencié (D30) qui ne révèle
 * jamais qu'un code existe.
 *
 * NE JAMAIS REVENIR À `defaultValue` NI À UN CHAMP SANS `value` ICI. Le message d'erreur
 * de cet écran ne peut pas expliquer ; la saisie conservée est donc la SEULE chose qui
 * reste à l'utilisateur pour réessayer.
 *
 * LE MOT DE PASSE EST CONTRÔLÉ COMME LES AUTRES, et ce n'est pas une imprudence : sa
 * valeur vit dans l'état React du navigateur, exactement là où le DOM la gardait déjà.
 * Rien de nouveau n'est exposé — ni journalisé, ni envoyé ailleurs qu'à l'action. Le
 * perdre à chaque refus obligeait au contraire à le retaper, ce qui pousse aux mots de
 * passe courts.
 */
export function FormulaireInscription({ antennes }: { antennes: Antenne[] }) {
  const [etat, envoyer, enCours] = useActionState(sInscrire, etatInitial)
  const prefixe = useId()
  const idCode = `${prefixe}-code`
  const idIdentifiant = `${prefixe}-identifiant`
  const idMotDePasse = `${prefixe}-mdp`

  const [code, setCode] = useState('')
  const [identifiant, setIdentifiant] = useState('')
  const [motDePasse, setMotDePasse] = useState('')
  const [prenom, setPrenom] = useState('')
  const [nom, setNom] = useState('')
  const [telephone, setTelephone] = useState('')
  const [ville, setVille] = useState('')
  const [antenneId, setAntenneId] = useState('')

  const zoneErreur = useRef<HTMLParagraphElement | null>(null)

  /*
    ═══ POURQUOI CE `useRef` FERME LA COURSE AU MONTAGE PAR CONSTRUCTION ═══

    `enCoursPrecedent` est initialisé avec la valeur du PREMIER rendu, nécessairement
    `false`. La passe de montage ne peut donc jamais satisfaire
    `enCoursPrecedent.current && !enCours` : la condition exige une transition
    `true -> false`, c'est-à-dire une VRAIE soumission terminée. Tester `etat.erreur`
    seul se déclencherait dès le montage.

    Ce que l'effet fait : porter le FOCUS sur le refus. Sur mobile, où cet écran est le
    plus employé, le message peut être hors champ après une saisie longue, et rien ne
    semble se passer au clic. AUCUNE remise à zéro n'est faite au succès : `sInscrire`
    REDIRIGE. Si cette redirection disparaissait un jour, c'est EXACTEMENT ce garde qu'il
    faudrait réutiliser, avec `etat.erreur === null`.
  */
  const enCoursPrecedent = useRef(enCours)
  useEffect(() => {
    if (enCoursPrecedent.current && !enCours && etat.erreur !== null) {
      zoneErreur.current?.focus()
    }
    enCoursPrecedent.current = enCours
  }, [enCours, etat])

  return (
    <form action={envoyer} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={idCode} className="text-sm font-medium">
          Code d&apos;inscription
        </label>
        <input
          id={idCode}
          name="code"
          value={code}
          onChange={(evenement) => setCode(evenement.target.value)}
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
          value={identifiant}
          onChange={(evenement) => setIdentifiant(evenement.target.value)}
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
          value={motDePasse}
          onChange={(evenement) => setMotDePasse(evenement.target.value)}
          required
          // Interpolée, jamais écrite en dur : la page sœur `/changer-mot-de-passe` fait
          // de même, et une valeur recopiée à la main deviendrait un mensonge le jour où
          // la constante change.
          minLength={LONGUEUR_MDP_MINIMALE}
          autoComplete="new-password"
          aria-describedby={`${idMotDePasse}-aide`}
          className="rounded-md border border-neutral-300 px-3 py-2"
        />
        <span id={`${idMotDePasse}-aide`} className="text-xs text-neutral-500">
          Au moins {LONGUEUR_MDP_MINIMALE} caractères.
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Prénom</span>
          <input
            name="prenom"
            value={prenom}
            onChange={(evenement) => setPrenom(evenement.target.value)}
            required
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Nom</span>
          <input
            name="nom"
            value={nom}
            onChange={(evenement) => setNom(evenement.target.value)}
            required
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Téléphone</span>
          <input
            name="telephone"
            type="tel"
            value={telephone}
            onChange={(evenement) => setTelephone(evenement.target.value)}
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Ville</span>
          <input
            name="ville"
            value={ville}
            onChange={(evenement) => setVille(evenement.target.value)}
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-sm font-medium">Antenne</span>
          <select
            name="antenneId"
            value={antenneId}
            onChange={(evenement) => setAntenneId(evenement.target.value)}
            className="rounded-md border border-neutral-300 px-3 py-2"
          >
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
        D30 : ce formulaire est le SEUL et reste identique quel que soit le code saisi.
        Les champs prénom/nom/téléphone/ville/antenne sont TOUJOURS affichés, même s'ils
        seront ignorés en mode nominatif (design 2b §7.1) — les masquer selon une
        supposition sur le mode reviendrait à recréer un oracle par la forme de la page,
        exactement ce que D30 interdit.
      */}

      {etat.erreur ? (
        <p
          ref={zoneErreur}
          tabIndex={-1}
          role="alert"
          className="text-sm text-red-600 outline-none"
        >
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
