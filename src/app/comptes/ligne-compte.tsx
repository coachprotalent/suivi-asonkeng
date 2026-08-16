'use client'

/*
  ═══ D123 (phase 6) — CE FICHIER N'EST PAS CORRIGÉ SUR LE FOND, ET C'EST DÉLIBÉRÉ ═══

  Trois des quatre formulaires de cette ligne appellent leur Server Action DIRECTEMENT depuis
  un `useTransition`, au lieu de `<form action={…}>`. Ce n'est pas un oubli : c'est un
  contournement, expliqué plus bas (lignes du commentaire de `soumettre` et de
  `soumettreRoles`), reposant sur une hypothèse au sujet de `src/app/error.tsx` — il affiche
  un texte STATIQUE et ne lit jamais `error.message`.

  L'HYPOTHÈSE EST FRAGILE, et la corriger changerait le COMPORTEMENT D'ERREUR d'un écran
  d'administration des comptes. C'est un changement de métier, pas de présentation ; la
  phase 6 ne touche à aucun chemin d'écriture (D118), et D123 trace explicitement la ligne :
  ISOLER ET DOCUMENTER, PAS CORRIGER.

  ⚠️ TOUTE NOUVELLE SERVER ACTION DE GESTION DE COMPTE QUI LÈVE au lieu de retourner un état
  retombera dans le même piège si elle est câblée en `<form action>` simple. C'est le
  véritable coût de ce contournement, et c'est pour le dire ici qu'il est documenté plutôt
  que corrigé en passant.
*/

import { useActionState, useId, useRef, useState, useTransition, type FormEvent } from 'react'
import type { CompteListe } from '@/lib/donnees/comptes'
import type { MembreBref } from '@/lib/donnees/membres'
import { Bouton } from '@/composants/ui/bouton'
import { Carte } from '@/composants/ui/carte'
import { Dialogue } from '@/composants/ui/dialogue'
import { EtatBadge } from '@/composants/ui/etat-badge'
import { Formulaire } from '@/composants/ui/formulaire'
import { LigneListe } from '@/composants/ui/ligne-liste'
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
  /*
    ═══ D124 — `window.confirm` BLOQUE, UN `<dialog>` NE BLOQUE PAS, ET ICI ÇA MORD ═══

    `evenement.currentTarget` ne survit PAS à la fin de la répartition synchrone de
    l'évènement — comportement DOM standard que React reproduit sur son évènement
    synthétique, INDÉPENDANT du pooling (retiré depuis React 17). Tant que
    `window.confirm` BLOQUAIT, lire `evenement.currentTarget` juste après restait dans le
    même passage synchrone : sans danger. Différer la confirmation à un rappel
    asynchrone (`surConfirmation`) et Y LIRE `evenement.currentTarget` planterait
    (`TypeError`, cible `null`) — c'est le défaut nommé d'avance pour ce fichier.

    LE REMÈDE : construire la `FormData` — un CLICHÉ, indépendant de l'évènement — tout
    de suite, avant toute confirmation, jamais dans le rappel. `donneesEnAttente` la
    porte jusqu'à la confirmation.
  */
  const [confirmationRolesDemandee, setConfirmationRolesDemandee] = useState(false)
  const donneesRolesEnAttente = useRef<FormData | null>(null)

  function executerRoles(donnees: FormData) {
    setErreurRoles(null)
    demarrerRoles(async () => {
      try {
        await definirRoles(donnees)
      } catch (erreur) {
        setErreurRoles(erreur instanceof Error ? erreur.message : String(erreur))
      }
    })
  }

  function soumettreRoles(evenement: FormEvent<HTMLFormElement>) {
    evenement.preventDefault()
    const donnees = new FormData(evenement.currentTarget)
    if (estMoi) {
      donneesRolesEnAttente.current = donnees
      setConfirmationRolesDemandee(true)
      return
    }
    executerRoles(donnees)
  }

  const [confirmationActivationDemandee, setConfirmationActivationDemandee] = useState(false)
  const donneesActivationEnAttente = useRef<FormData | null>(null)

  function executerActivation(donnees: FormData) {
    setErreurActivation(null)
    demarrerActivation(async () => {
      try {
        await basculerActivation(donnees)
      } catch (erreur) {
        setErreurActivation(erreur instanceof Error ? erreur.message : String(erreur))
      }
    })
  }

  function soumettreActivation(evenement: FormEvent<HTMLFormElement>) {
    evenement.preventDefault()
    const donnees = new FormData(evenement.currentTarget)
    if (estMoi) {
      donneesActivationEnAttente.current = donnees
      setConfirmationActivationDemandee(true)
      return
    }
    executerActivation(donnees)
  }

  const [etatMdp, reinitialiser, reinitialisationEnCours] = useActionState(
    reinitialiserMotDePasse,
    etatInitial,
  )
  const prefixe = useId()
  const idAdmin = `${prefixe}-administrateur`
  const idModerateur = `${prefixe}-moderateur`

  return (
    <LigneListe
      principal={
        <>
          {compte.nomAffichage}
          {estMoi ? (
            <span className="ml-esp-2 text-petit text-encre-attenuee">C&apos;est votre compte.</span>
          ) : null}
        </>
      }
      meta={compte.identifiant}
      complement={
        <div className="flex flex-col gap-esp-3">
          <div className="flex flex-wrap items-center gap-esp-3">
            <EtatBadge ton={compte.actif ? 'acquis' : 'refus'} libelle={compte.actif ? 'Actif' : 'Désactivé'} />
            <span className="text-petit text-encre-attenuee">
              {compte.roles.length > 0
                ? compte.roles.map((role) => LIBELLE_ROLE[role] ?? role).join(', ')
                : 'Utilisateur'}
            </span>
          </div>

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
            <Carte ton="avertissement" role="alert">
              {compte.membreEtat === 'archive' ? 'Fiche archivée' : 'Fiche en attente de validation'}
            </Carte>
          ) : null}

          {compte.estRacine ? (
            // Une contrainte CHECK sur `profils` interdit cette liaison (spec D11) : le
            // compte racine n'a jamais de fiche membre. Proposer un formulaire qui ne peut
            // qu'échouer serait pire que ne rien proposer.
            <p className="text-petit text-encre-attenuee">
              Compte racine : sans place dans l&apos;arbre, donc sans fiche liée.
            </p>
          ) : (
            <Formulaire
              onSubmit={soumettre}
              erreur={erreurLiaison}
              enCours={enCours}
              actions={
                <Bouton type="submit" variante="secondaire" alignement="debut" enCours={enCours} libelleAttente="Enregistrement…">
                  Enregistrer la fiche
                </Bouton>
              }
            >
              <input type="hidden" name="profilId" value={compte.id} />
              <SelecteurMembre
                nom="membreId"
                label="Fiche liée"
                aide="Détacher la fiche retire la portée d'autorité de ce compte."
                valeur={fiche}
                surChoix={setFiche}
                exclureId={null}
              />
            </Formulaire>
          )}

          <Formulaire
            onSubmit={soumettreRoles}
            erreur={erreurRoles}
            enCours={rolesEnCours}
            actions={
              <Bouton type="submit" variante="secondaire" enCours={rolesEnCours} libelleAttente="Enregistrement…">
                Enregistrer les rôles
              </Bouton>
            }
          >
            <input type="hidden" name="profilId" value={compte.id} />
            {/*
              ⚠️ LES DEUX CASES `defaultChecked` RESTENT NON CONTRÔLÉES (D123). Ce
              formulaire soumet par `onSubmit`, jamais par `<form action>` : le mécanisme
              de remise à zéro de React après une action ne s'y applique pas. Les
              contrôler serait corriger un défaut qui n'existe pas.
            */}
            <fieldset className="flex flex-wrap items-center gap-esp-3">
              <label htmlFor={idAdmin} className="cible-tactile flex items-center gap-esp-2 text-petit text-encre">
                <input
                  id={idAdmin}
                  name="administrateur"
                  type="checkbox"
                  defaultChecked={compte.roles.includes('administrateur')}
                />
                Administrateur
              </label>
              <label htmlFor={idModerateur} className="cible-tactile flex items-center gap-esp-2 text-petit text-encre">
                <input
                  id={idModerateur}
                  name="moderateur"
                  type="checkbox"
                  defaultChecked={compte.roles.includes('moderateur')}
                />
                Modérateur
              </label>
            </fieldset>
          </Formulaire>

          <Dialogue
            ouvert={confirmationRolesDemandee}
            message={
              'Modifier vos propres rôles ?\n\n' +
              'Si vous retirez votre rôle administrateur, vous perdrez ce pouvoir immédiatement.'
            }
            surConfirmation={() => {
              setConfirmationRolesDemandee(false)
              if (donneesRolesEnAttente.current) executerRoles(donneesRolesEnAttente.current)
            }}
            surAnnulation={() => setConfirmationRolesDemandee(false)}
          />

          <Formulaire
            onSubmit={soumettreActivation}
            erreur={erreurActivation}
            enCours={activationEnCours}
            actions={
              <Bouton type="submit" variante="secondaire" alignement="debut" enCours={activationEnCours} libelleAttente="Enregistrement…">
                {compte.actif ? 'Désactiver' : 'Réactiver'}
              </Bouton>
            }
          >
            <input type="hidden" name="profilId" value={compte.id} />
            {/* La valeur envoyée est l'état VOULU, pas l'état courant : sans cette
                inversion explicite, un double-clic ou un onglet périmé rejouerait
                l'état déjà en place au lieu de le basculer. */}
            <input type="hidden" name="actif" value={compte.actif ? '0' : '1'} />
          </Formulaire>

          <Dialogue
            ouvert={confirmationActivationDemandee}
            message={
              compte.actif
                ? 'Désactiver votre propre compte ?\n\n' +
                  "Vous serez déconnecté et ne pourrez plus vous reconnecter tant qu'un autre " +
                  'administrateur ne vous aura pas réactivé.'
                : 'Réactiver votre propre compte ?'
            }
            surConfirmation={() => {
              setConfirmationActivationDemandee(false)
              if (donneesActivationEnAttente.current) executerActivation(donneesActivationEnAttente.current)
            }}
            surAnnulation={() => setConfirmationActivationDemandee(false)}
          />

          <Formulaire
            action={reinitialiser}
            erreur={etatMdp.erreur}
            enCours={reinitialisationEnCours}
            actions={
              <Bouton type="submit" variante="secondaire" alignement="debut" enCours={reinitialisationEnCours} libelleAttente="Réinitialisation…">
                Réinitialiser le mot de passe
              </Bouton>
            }
          >
            <input type="hidden" name="profilId" value={compte.id} />
            <input type="hidden" name="identifiant" value={compte.identifiant} />
          </Formulaire>

          {etatMdp.motDePasseTemporaire ? (
            <Carte ton="avertissement" role="alert">
              <p className="text-corps">
                Nouveau mot de passe temporaire de « {etatMdp.identifiantCree} », à transmettre de
                vive voix :{' '}
                <code className="rounded-bord bg-fond px-esp-2 py-esp-1 font-mono">
                  {etatMdp.motDePasseTemporaire}
                </code>
              </p>
              <p className="mt-esp-2 text-petit text-encre-attenuee">
                Il ne sera plus jamais affiché. La personne devra en choisir un autre à sa
                prochaine connexion.
              </p>
            </Carte>
          ) : null}
        </div>
      }
    />
  )
}
