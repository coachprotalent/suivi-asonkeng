'use client'

import { useActionState, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import type { Antenne } from '@/lib/donnees/antennes'
import type { MembreDetail } from '@/lib/donnees/membres'
import type { EtatFormulaireMembre } from './actions'

const etatInitial: EtatFormulaireMembre = { erreur: null }

type Props = {
  action: (etat: EtatFormulaireMembre, donnees: FormData) => Promise<EtatFormulaireMembre>
  antennes: Antenne[]
  membre?: MembreDetail
  libelleBouton: string
  /**
   * Bloc d'enrichissement rendu DANS le même `<form>`, juste avant la zone d'erreur.
   *
   * Une prop plutôt qu'une variante interne : l'enrichissement ne remonte PAS dans
   * `/membres/[id]/modifier` (D89). Porter les statuts dans l'écran de modification
   * exigerait d'y exprimer le RETRAIT, que la création n'a jamais à connaître ; et y
   * porter l'arbre mélangerait deux gardes différents sur un même écran —
   * `exigerAutoriteSur` pour les statuts, `exigerAdministrateur` pour l'arbre.
   */
  children?: ReactNode
}

export function FormulaireMembre({
  action,
  antennes,
  membre,
  libelleBouton,
  children,
}: Props) {
  const [etat, envoyer, enCours] = useActionState(action, etatInitial)

  /*
    ═══ TOUS LES CHAMPS SONT CONTRÔLÉS (D85). AUCUN `defaultValue` ICI. ═══

    React réinitialise les champs NON CONTRÔLÉS d'un `<form action>` à TOUTE complétion de
    l'action, Y COMPRIS sur un refus RETOURNÉ. L'utilisateur lisait alors son message
    d'erreur au-dessus d'un formulaire VIDE, et devait tout retaper — neuf champs ici,
    plus les enrichissements de la phase 5. C'est la BONNE PRATIQUE du projet qui
    déclenchait le piège : une action qui RETOURNE son refus passe par le chemin
    « complétion normale », donc par la remise à zéro ; une action qui LÈVE ne vide rien,
    mais perd son message en build de production.

    Un état par champ, et non un objet unique : c'est la forme employée par les cinq
    formulaires corrigés en phase 4, et elle évite qu'une frappe recrée l'objet entier.
  */
  const [prenom, setPrenom] = useState(membre?.prenom ?? '')
  const [nom, setNom] = useState(membre?.nom ?? '')
  const [telephone, setTelephone] = useState(membre?.telephone ?? '')
  const [emailContact, setEmailContact] = useState(membre?.emailContact ?? '')
  const [ville, setVille] = useState(membre?.ville ?? '')
  const [pays, setPays] = useState(membre?.pays ?? '')
  const [antenneId, setAntenneId] = useState(membre?.antenneId ?? '')
  const [situation, setSituation] = useState<string>(membre?.situation ?? '')
  const [domaineEtude, setDomaineEtude] = useState(membre?.domaineEtude ?? '')
  const [reportInitialAel, setReportInitialAel] = useState(
    String(membre?.reportInitialAel ?? 0),
  )

  // Voir la règle d'association posée en tête de
  // `src/app/membres/[id]/statuts/formulaire-statut.tsx` : un texte d'aide laissé DANS le
  // <label> est concaténé au nom accessible du champ. Seul « AEL déjà suivis » en porte un
  // ici ; les autres champs gardent le <label> enveloppant, qui leur donne déjà un nom
  // correct.
  const idAel = useId()

  const zoneErreur = useRef<HTMLParagraphElement | null>(null)

  /*
    ═══ POURQUOI CE `useRef` FERME LA COURSE AU MONTAGE PAR CONSTRUCTION ═══

    `enCoursPrecedent` est initialisé avec la valeur du PREMIER rendu, nécessairement
    `false`. La passe de montage ne peut donc JAMAIS satisfaire
    `enCoursPrecedent.current && !enCours`, quel que soit le timing : la condition exige
    une transition `true -> false`, c'est-à-dire une VRAIE soumission terminée. Tester
    `etat.erreur !== null` seul ne suffirait pas — l'effet se déclencherait dès le montage
    si un état d'erreur préexistait.

    Ce que l'effet fait ici : porter le FOCUS sur le message de refus. Sur un formulaire
    aussi long, le message s'affiche largement sous la ligne de flottaison, et un
    utilisateur qui vient de cliquer « Créer la fiche » ne voit rien se passer. C'est le
    seul geste qui a un consommateur réel ici : AUCUNE remise à zéro n'est faite au
    succès, parce qu'il n'y en a pas — l'action REDIRIGE. Si un jour cette redirection
    disparaissait et qu'on voulait vider le formulaire, c'est EXACTEMENT ce garde qu'il
    faudrait réutiliser, avec `etat.erreur === null` à la place.
  */
  const enCoursPrecedent = useRef(enCours)
  useEffect(() => {
    if (enCoursPrecedent.current && !enCours && etat.erreur !== null) {
      zoneErreur.current?.focus()
    }
    enCoursPrecedent.current = enCours
  }, [enCours, etat])

  // L'antenne actuelle du membre doit figurer dans la liste même si elle a été désactivée
  // depuis. Sans cela, sa valeur n'existerait pas parmi les options : le navigateur
  // retomberait sur « Non rattaché » et le simple fait d'enregistrer une autre
  // modification détacherait le membre de son antenne, sans que personne ne l'ait demandé
  // ni vu.
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
          <span className="text-sm font-medium">Prénom (obligatoire)</span>
          <input
            name="prenom"
            value={prenom}
            onChange={(evenement) => setPrenom(evenement.target.value)}
            required
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Nom (obligatoire)</span>
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
          <span className="text-sm font-medium">Adresse de contact</span>
          <input
            name="emailContact"
            type="email"
            value={emailContact}
            onChange={(evenement) => setEmailContact(evenement.target.value)}
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
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Pays</span>
          <input
            name="pays"
            value={pays}
            onChange={(evenement) => setPays(evenement.target.value)}
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Antenne</span>
          <select
            name="antenneId"
            value={antenneId}
            onChange={(evenement) => setAntenneId(evenement.target.value)}
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
            value={situation}
            onChange={(evenement) => setSituation(evenement.target.value)}
            className="rounded-md border border-neutral-300 px-3 py-2"
          >
            <option value="">Non renseignée</option>
            <option value="etudiant">Étudiant</option>
            <option value="travailleur">Travailleur</option>
            <option value="autre">Autre</option>
          </select>
        </label>
        {/*
          Le champ n'existe que pour un étudiant, au lieu d'être saisissable puis effacé en
          silence à l'enregistrement. Empêcher vaut mieux qu'avertir : un texte d'aide sous
          un champ ne se lit pas au moment où l'on bascule la situation, et la saisie
          disparaîtrait sans que personne ne le voie.

          La VALEUR, elle, survit au démontage du champ : elle vit dans `domaineEtude`, à
          côté et non dedans. Repasser « Travailleur » puis « Étudiant » retrouve donc la
          saisie. Ce que la fiche ENREGISTRE reste décidé par `normaliserFicheMembre`, qui
          met `domaine_etude` à `null` hors situation étudiante.
        */}
        {situation === 'etudiant' ? (
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Domaine d&apos;étude</span>
            <input
              name="domaineEtude"
              value={domaineEtude}
              onChange={(evenement) => setDomaineEtude(evenement.target.value)}
              className="rounded-md border border-neutral-300 px-3 py-2"
            />
          </label>
        ) : null}
        <div className="flex flex-col gap-1.5">
          <label htmlFor={idAel} className="text-sm font-medium">
            AEL déjà suivis
          </label>
          <input
            id={idAel}
            name="reportInitialAel"
            type="number"
            min={0}
            step={1}
            value={reportInitialAel}
            onChange={(evenement) => setReportInitialAel(evenement.target.value)}
            aria-describedby={`${idAel}-aide`}
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
          <span id={`${idAel}-aide`} className="text-xs text-neutral-500">
            Avant la mise en service de l&apos;application.
          </span>
        </div>
      </div>

      {children}

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
        {enCours ? 'Enregistrement…' : libelleBouton}
      </button>
    </form>
  )
}
