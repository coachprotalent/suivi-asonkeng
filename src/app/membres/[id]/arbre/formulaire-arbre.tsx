'use client'

import { useActionState, useRef, useState, useTransition } from 'react'
import type { MembreBref } from '@/lib/donnees/membres'
import { Bouton } from '@/composants/ui/bouton'
import { Formulaire } from '@/composants/ui/formulaire'
import { SelecteurMembre } from '../../selecteur-membre'
import { definirArbre, proposerDirigeant, type EtatArbre } from './actions'

const etatInitial: EtatArbre = { erreur: null }

type Props = {
  membreId: string
  faiseurInitial: MembreBref | null
  dirigeantInitial: MembreBref | null
  dirigeantForceInitial: boolean
  propositionInitiale: MembreBref | null
}

function nomComplet(membre: MembreBref | null): string {
  return membre ? `${membre.prenom} ${membre.nom}` : 'aucun'
}

export function FormulaireArbre({
  membreId,
  faiseurInitial,
  dirigeantInitial,
  dirigeantForceInitial,
  propositionInitiale,
}: Props) {
  const [etat, envoyer, enCours] = useActionState(definirArbre, etatInitial)
  const [faiseur, setFaiseur] = useState(faiseurInitial)
  // Correction apportée en revue (voir le rapport de tâche) : `dirigeant_id` vaut
  // `null` sur un membre dont personne n'a encore fixé le dirigeant, y compris quand
  // il est CALCULABLE (faiseur de disciple connu, jamais encore enregistré). Initialiser
  // simplement avec `dirigeantInitial` afficherait « Calculé à partir du faiseur de
  // disciple. » tout en gardant un champ cache à `null` — enregistrer sans rien
  // toucher écrirait alors `null` en base au lieu de la proposition annoncée à l'écran.
  // Un dirigeant FORCÉ à « aucun » (dirigeantForceInitial vrai, dirigeantInitial null)
  // doit, lui, rester à `null` : c'est un choix délibéré de l'administrateur, pas un
  // calcul jamais fait.
  const [dirigeant, setDirigeant] = useState(
    dirigeantInitial ?? (dirigeantForceInitial ? null : propositionInitiale),
  )
  const [force, setForce] = useState(dirigeantForceInitial)
  const [proposition, setProposition] = useState(propositionInitiale)
  const [calculEnCours, demarrerCalcul] = useTransition()

  /*
    ⚠️ MOTIF ORIGINAL DU `useRef` DE SÉQUENCE (Task 22) — cité en commentaire par
    `bloc-enrichissement.tsx:64` (« Motif repris tel quel de … formulaire-arbre.tsx »).
    NE PAS LE FACTORISER : ce serait une correction de fond, hors périmètre de cette
    tâche de présentation (D118, piège n°4). La logique ci-dessous n'est PAS modifiée,
    seule la présentation autour d'elle l'est.
  */
  // Miroir synchrone de `force`, lu par le rappel asynchrone de `changerFaiseur` : lire
  // l'état React `force` directement y capturerait sa valeur au moment où la fermeture a
  // été créée (rendu du clic sur le faiseur), pas sa valeur au moment où la réponse
  // arrive. Un `ref` reste à jour quel que soit le rendu qui a créé la fermeture — c'est
  // précisément ce qui manquait : un choix manuel pendant l'aller-retour réseau était
  // écrasé par la proposition, parce que le rappel testait l'ancien `force === false`.
  const forceRef = useRef(dirigeantForceInitial)

  // Numéro du dernier événement qui fait autorité sur `dirigeant` / `proposition` : un
  // changement de faiseur en démarre un nouveau, mais une intervention manuelle directe
  // sur le dirigeant (choix ou retour au calcul) en démarre un aussi, alors qu'elle
  // n'appelle pas `proposerDirigeant`. Même parade que `dernierAppel` dans
  // `SelecteurMembre` (Task 5) : un rappel asynchrone n'applique son résultat que s'il
  // porte encore le numéro courant. Cela referme, d'un seul mécanisme, le cas où deux
  // changements de faiseur rapprochés répondent dans le désordre — la première réponse
  // arrivée en second écraserait sinon la proposition la plus récente.
  const sequence = useRef(0)

  function changerFaiseur(membre: MembreBref | null) {
    setFaiseur(membre)
    const numero = ++sequence.current
    demarrerCalcul(async () => {
      const propose = await proposerDirigeant(membre?.id ?? null)
      if (numero !== sequence.current) {
        // Réponse périmée : un événement plus récent (nouveau changement de faiseur,
        // choix manuel du dirigeant, ou retour au calcul) a eu lieu entretemps. On ne
        // l'applique pas — l'appliquer quand même écraserait cet événement plus récent.
        return
      }
      setProposition(propose)
      // La proposition ne s'impose PAS à un dirigeant défini à la main : l'admin qui a
      // délibérément forcé une valeur ne doit pas la voir disparaître parce qu'il
      // corrige le faiseur de disciple. `forceRef.current`, pas `force` : voir le
      // commentaire sur `forceRef` plus haut.
      if (!forceRef.current) {
        setDirigeant(propose)
      }
    })
  }

  function changerDirigeant(membre: MembreBref | null) {
    sequence.current++
    setDirigeant(membre)
    // Toucher soi-même à ce champ, c'est forcer.
    forceRef.current = true
    setForce(true)
  }

  function revenirAuCalcul() {
    sequence.current++
    setDirigeant(proposition)
    forceRef.current = false
    setForce(false)
  }

  // Écart entre la valeur retenue et la proposition courante — jamais déduit du seul
  // drapeau `force`. Un dirigeant stocké « calculé » (force = false) peut devenir
  // périmé sans qu'aucune écriture ne le touche : `definir_arbre` ne modifie que le
  // membre visé, rien ne propage un changement de faiseur vers les descendants déjà
  // enregistrés. Rouvrir cet écran recalcule la proposition à la volée (`page.tsx`)
  // pendant que la valeur affichée vient de la colonne stockée : sans cette
  // comparaison, l'écran continuerait d'annoncer « Calculé » sur une valeur que le
  // calcul ne rendrait plus.
  const proposeDiffere = (dirigeant?.id ?? null) !== (proposition?.id ?? null)

  function mentionDirigeant(): string {
    if (force) {
      return 'Défini manuellement.'
    }
    if (!faiseur) {
      // Techniquement vrai mais trompeur : calculer à partir de rien ne « calcule »
      // rien. On le dit clairement plutôt que d'afficher un « Calculé » qui laisse
      // croire à un calcul qui n'a pas eu lieu.
      return "Aucun dirigeant n'est proposé, faute de faiseur de disciple."
    }
    if (!proposeDiffere) {
      return 'Calculé à partir du faiseur de disciple.'
    }
    return `La proposition a changé depuis le dernier enregistrement : ${nomComplet(proposition)}.`
  }

  // Offert dès que la valeur retenue n'est plus ce que le calcul rendrait aujourd'hui —
  // qu'elle ait été forcée, ou qu'elle soit simplement périmée. Même quand `force` est
  // vrai et que la valeur égale déjà la proposition, le bouton reste utile : il remet
  // le drapeau à « calculé » sans changer la valeur affichée.
  const afficherBoutonRevenir = force || proposeDiffere

  return (
    <Formulaire
      action={envoyer}
      erreur={etat.erreur}
      enCours={enCours}
      actions={
        <Bouton type="submit" alignement="debut" enCours={enCours} libelleAttente="Enregistrement…">
          Enregistrer le rattachement
        </Bouton>
      }
    >
      <input type="hidden" name="membreId" value={membreId} />
      <input type="hidden" name="dirigeantForce" value={force ? '1' : '0'} />

      {/*
        ⚠️ RAIL DE FILIATION (D106) — l'un des cinq seuls emplacements légitimes (voir
        globals.css) : c'est ICI que se décide la relation de discipulat de ce membre.
        `/antennes/[id]` N'EN PORTE PAS : le rattachement à une antenne n'est pas un
        lien de discipulat.
      */}
      <div className="rail-filiation flex flex-col gap-esp-6">
        <SelecteurMembre
          nom="faiseurDeDiscipleId"
          label="Faiseur de disciple"
          aide="Laisser vide fait de ce membre une racine de l'arbre."
          valeur={faiseur}
          surChoix={changerFaiseur}
          exclureId={membreId}
        />

        <div className="flex flex-col gap-esp-1">
          <SelecteurMembre
            nom="dirigeantId"
            label="Dirigeant"
            aide="Proposé à partir du faiseur de disciple. Vous pouvez en choisir un autre."
            valeur={dirigeant}
            surChoix={changerDirigeant}
            exclureId={membreId}
          />
          <p className="text-petit text-encre-attenuee">
            {calculEnCours ? 'Calcul de la proposition…' : mentionDirigeant()}
            {!calculEnCours && afficherBoutonRevenir ? (
              <>
                {' '}
                <Bouton type="button" variante="lien" onClick={revenirAuCalcul}>
                  Revenir au dirigeant calculé
                </Bouton>
                {` (${nomComplet(proposition)})`}
              </>
            ) : null}
          </p>
        </div>
      </div>
    </Formulaire>
  )
}
