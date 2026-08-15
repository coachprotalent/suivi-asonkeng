'use client'

import { useId, useRef, useState, useTransition } from 'react'
import { proposerDirigeant } from '@/app/membres/[id]/arbre/actions'
import { SelecteurMembre } from '@/app/membres/selecteur-membre'
import type { MembreBref } from '@/lib/donnees/membres'
import type { GroupeStatut } from '@/lib/donnees/statuts'

/**
 * Les trois enrichissements de la création (D86) : les statuts, le faiseur de disciple et
 * le dirigeant. TOUS FACULTATIFS ET INDÉPENDANTS LES UNS DES AUTRES — un dirigeant sans
 * faiseur de disciple est légitime (§4.2 le prévoit), des statuts sans place dans l'arbre
 * aussi, et une création sans aucun des trois produit exactement ce que l'ancienne
 * `creerMembre` produisait.
 *
 * ═══ TOUT CE COMPOSANT EST CONTRÔLÉ (D85). ═══
 * Chaque champ tire sa valeur d'un `useState` de ce composant, y compris les champs
 * cachés. La saisie survit donc à un refus RETOURNÉ par l'action : ce composant n'est pas
 * remonté, seul le `<form>` parent est re-rendu.
 *
 * LES STATUTS NE SONT PAS DES CASES POUR TOUT LE CATALOGUE. Le motif est celui de
 * `FormulaireStatut` — un choix dans un `<select>` GROUPÉ PAR GROUPE, avec sa date et sa
 * note — répété à la demande, la liste des lignes vivant dans l'état de ce composant.
 * Contrôlé par construction, et cohérent avec l'écran de gestion des statuts que
 * l'utilisateur retrouvera ensuite.
 *
 * TROIS CHAMPS RÉPÉTÉS, ALIGNÉS PAR INDICE : `statutId`, `statutDateAcquisition`,
 * `statutNote`. `lignesStatutsDepuisFormData` (couche domaine) les relit par `getAll` et
 * REFUSE tout décalage entre les trois longueurs — ce contrôle est la seule chose qui
 * distingue « ce composant a changé » d'un décalage silencieux qui associerait la date
 * d'une ligne au statut d'une autre. NE JAMAIS rendre une ligne partielle.
 */

type Props = {
  groupes: GroupeStatut[]
}

type LigneStatut = {
  cle: string
  statutId: string
  dateAcquisition: string
  note: string
}

function nomComplet(membre: MembreBref | null): string {
  return membre ? `${membre.prenom} ${membre.nom}` : 'aucun'
}

export function BlocEnrichissement({ groupes }: Props) {
  const prefixe = useId()
  const aujourdhui = new Date().toISOString().slice(0, 10)

  const [lignes, setLignes] = useState<LigneStatut[]>([])
  const [faiseur, setFaiseur] = useState<MembreBref | null>(null)
  const [dirigeant, setDirigeant] = useState<MembreBref | null>(null)
  const [force, setForce] = useState(false)
  const [proposition, setProposition] = useState<MembreBref | null>(null)
  const [calculEnCours, demarrerCalcul] = useTransition()

  // Miroir SYNCHRONE de `force`, lu par le rappel asynchrone de `changerFaiseur` : lire
  // l'état React `force` directement y capturerait sa valeur au moment où la fermeture a
  // été créée, pas sa valeur au moment où la réponse arrive. Un choix manuel pendant
  // l'aller-retour réseau serait alors écrasé par la proposition. Motif repris tel quel de
  // `src/app/membres/[id]/arbre/formulaire-arbre.tsx`, où il a été établi en revue.
  const forceRef = useRef(false)

  // Numéro du dernier événement qui fait autorité sur `dirigeant` / `proposition`. Un
  // changement de faiseur en démarre un, mais une intervention manuelle sur le dirigeant
  // en démarre un aussi, alors qu'elle n'appelle pas `proposerDirigeant`. Même parade que
  // `dernierAppel` dans `SelecteurMembre` : un rappel asynchrone n'applique son résultat
  // que s'il porte encore le numéro courant. Referme d'un seul mécanisme le cas où deux
  // changements de faiseur rapprochés répondent dans le désordre.
  const sequence = useRef(0)

  /**
   * D88 — LE DIRIGEANT EST PROPOSÉ À LA CRÉATION, à chaque changement de faiseur de
   * disciple, en réutilisant `proposerDirigeant` (1c) TELLE QUELLE.
   *
   * Le §4.2 de la spécification maîtresse le promet depuis le 2026-08-11 : « Elle est
   * proposée à la création d'un membre et à chaque changement de faiseur de disciple. » La
   * 1c n'avait livré que la seconde moitié, faute d'un faiseur de disciple saisissable à
   * la création. Cette phase n'invente donc rien : elle HONORE une phrase qui était fausse
   * depuis quatre phases.
   */
  function changerFaiseur(membre: MembreBref | null) {
    setFaiseur(membre)
    const numero = ++sequence.current
    demarrerCalcul(async () => {
      const propose = await proposerDirigeant(membre?.id ?? null)
      if (numero !== sequence.current) {
        // Réponse périmée : un événement plus récent a eu lieu entretemps. L'appliquer
        // quand même écraserait cet événement plus récent.
        return
      }
      setProposition(propose)
      // La proposition ne s'impose PAS à un dirigeant défini à la main.
      // `forceRef.current`, pas `force` : voir le commentaire sur `forceRef` plus haut.
      if (!forceRef.current) {
        setDirigeant(propose)
      }
    })
  }

  function changerDirigeant(membre: MembreBref | null) {
    sequence.current += 1
    setDirigeant(membre)
    // Toucher soi-même à ce champ, c'est forcer.
    forceRef.current = true
    setForce(true)
  }

  function revenirAuCalcul() {
    sequence.current += 1
    setDirigeant(proposition)
    forceRef.current = false
    setForce(false)
  }

  const proposeDiffere = (dirigeant?.id ?? null) !== (proposition?.id ?? null)

  function mentionDirigeant(): string {
    if (force) {
      return 'Défini manuellement.'
    }
    if (!faiseur) {
      // Techniquement vrai mais trompeur : calculer à partir de rien ne « calcule » rien.
      return "Aucun dirigeant n'est proposé, faute de faiseur de disciple."
    }
    if (!proposeDiffere) {
      return 'Calculé à partir du faiseur de disciple.'
    }
    return `La proposition a changé : ${nomComplet(proposition)}.`
  }

  function ajouterLigne() {
    setLignes((precedentes) => [
      ...precedentes,
      { cle: crypto.randomUUID(), statutId: '', dateAcquisition: '', note: '' },
    ])
  }

  function modifierLigne(cle: string, champs: Partial<Omit<LigneStatut, 'cle'>>) {
    setLignes((precedentes) =>
      precedentes.map((ligne) => (ligne.cle === cle ? { ...ligne, ...champs } : ligne)),
    )
  }

  function retirerLigne(cle: string) {
    setLignes((precedentes) => precedentes.filter((ligne) => ligne.cle !== cle))
  }

  return (
    <div className="flex flex-col gap-8 border-t border-neutral-200 pt-6">
      <p className="text-sm text-neutral-500">
        Les trois sections ci-dessous sont facultatives et indépendantes. Elles sont
        enregistrées <strong>en même temps</strong> que la fiche : si l&apos;une est
        refusée, rien n&apos;est créé et votre saisie reste à l&apos;écran.
      </p>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium">Statuts</h2>
        {lignes.length === 0 ? (
          <p className="text-sm text-neutral-600">Aucun statut à attribuer.</p>
        ) : null}

        {lignes.map((ligne, indice) => {
          const idStatut = `${prefixe}-statut-${ligne.cle}`
          const idDate = `${prefixe}-date-${ligne.cle}`
          const idNote = `${prefixe}-note-${ligne.cle}`
          return (
            <fieldset
              key={ligne.cle}
              className="flex flex-col gap-3 rounded-md border border-neutral-300 p-4"
            >
              <legend className="px-1 text-sm font-medium">Statut {indice + 1}</legend>

              <div className="flex flex-col gap-1.5">
                <label htmlFor={idStatut} className="text-sm font-medium">
                  Statut
                </label>
                <select
                  id={idStatut}
                  name="statutId"
                  value={ligne.statutId}
                  onChange={(evenement) =>
                    modifierLigne(ligne.cle, { statutId: evenement.target.value })
                  }
                  required
                  className="rounded-md border border-neutral-300 px-3 py-2"
                >
                  <option value="" disabled>
                    Choisir un statut…
                  </option>
                  {groupes.map((groupe) => (
                    <optgroup
                      key={groupe.id}
                      label={groupe.exclusif ? `${groupe.nom} (un seul à la fois)` : groupe.nom}
                    >
                      {groupe.statuts.map((statut) => (
                        <option key={statut.id} value={statut.id}>
                          {statut.libelle}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              {/*
                RÈGLE D'ASSOCIATION DES LIBELLÉS, posée en tête de
                `src/app/membres/[id]/statuts/formulaire-statut.tsx` et vérifiée dans un
                vrai navigateur : un texte d'aide laissé DANS le <label> est CONCATÉNÉ au
                nom accessible du champ. Champ AVEC aide => `htmlFor` explicite et l'aide
                sortie du label, rattachée par `aria-describedby`.
              */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor={idDate} className="text-sm font-medium">
                  Date d&apos;acquisition
                </label>
                <input
                  id={idDate}
                  name="statutDateAcquisition"
                  type="date"
                  max={aujourdhui}
                  value={ligne.dateAcquisition}
                  onChange={(evenement) =>
                    modifierLigne(ligne.cle, { dateAcquisition: evenement.target.value })
                  }
                  aria-describedby={`${idDate}-aide`}
                  className="rounded-md border border-neutral-300 px-3 py-2"
                />
                <span id={`${idDate}-aide`} className="text-xs text-neutral-500">
                  Facultative. Elle n&apos;est pas toujours connue.
                </span>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor={idNote} className="text-sm font-medium">
                  Note
                </label>
                <input
                  id={idNote}
                  name="statutNote"
                  maxLength={500}
                  value={ligne.note}
                  onChange={(evenement) => modifierLigne(ligne.cle, { note: evenement.target.value })}
                  className="rounded-md border border-neutral-300 px-3 py-2"
                />
              </div>

              <button
                type="button"
                onClick={() => retirerLigne(ligne.cle)}
                className="self-start text-sm underline underline-offset-4"
              >
                Retirer ce statut
              </button>
            </fieldset>
          )
        })}

        <button
          type="button"
          onClick={ajouterLigne}
          className="self-start rounded-md border border-neutral-300 px-4 py-2 text-sm"
        >
          Ajouter un statut
        </button>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium">Place dans l&apos;arbre</h2>

        {/* Champ caché CONTRÔLÉ : sa valeur vient de l'état, jamais du DOM. */}
        <input type="hidden" name="dirigeantForce" value={force ? '1' : '0'} />

        <SelecteurMembre
          nom="faiseurDeDiscipleId"
          label="Faiseur de disciple"
          aide="Facultatif. Laisser vide fait de ce membre une racine de l'arbre."
          valeur={faiseur}
          surChoix={changerFaiseur}
          // La fiche n'existe pas encore : il n'y a AUCUN identifiant à exclure. Ce n'est
          // pas un oubli — l'exclusion de `/membres/[id]/arbre` sert à empêcher qu'un
          // membre soit son propre faiseur de disciple, cas impossible ici.
          exclureId={null}
        />

        <div className="flex flex-col gap-1.5">
          <SelecteurMembre
            nom="dirigeantId"
            label="Dirigeant"
            aide="Facultatif. Proposé à partir du faiseur de disciple. Vous pouvez en choisir un autre."
            valeur={dirigeant}
            surChoix={changerDirigeant}
            exclureId={null}
          />
          <p className="text-xs text-neutral-500">
            {calculEnCours ? 'Calcul de la proposition…' : mentionDirigeant()}
            {!calculEnCours && (force || proposeDiffere) ? (
              <>
                {' '}
                <button
                  type="button"
                  onClick={revenirAuCalcul}
                  className="underline underline-offset-4"
                >
                  Revenir au dirigeant calculé
                </button>
                {` (${nomComplet(proposition)})`}
              </>
            ) : null}
          </p>
        </div>
      </section>
    </div>
  )
}
