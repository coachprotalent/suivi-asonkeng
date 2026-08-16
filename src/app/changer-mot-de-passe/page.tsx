'use client'

import { useActionState, useState } from 'react'
import { Bouton } from '@/composants/ui/bouton'
import { Champ } from '@/composants/ui/champ'
import { EnTetePage } from '@/composants/ui/en-tete-page'
import { Formulaire } from '@/composants/ui/formulaire'
import { changerMotDePasse, type EtatChangement } from './actions'
import { LONGUEUR_MDP_MINIMALE } from './constantes'

const etatInitial: EtatChangement = { erreur: null }

/**
 * ⚠️ ÉCRAN D'ÉTAT FORCÉ (Task 24) — atteint uniquement par `middleware.ts` (drapeau
 * `doit_changer_mdp`) ou par redirection depuis `connexion/actions.ts`, JAMAIS la
 * cible d'un `<Link>` de navigation volontaire : `EnTetePage` sans `retour`, même
 * gabarit que `/connexion` et `/inscription`. Les 2 champs libres (motDePasse,
 * confirmation) sont fermés par `Champ`. Le lien de déconnexion reste.
 */
export default function PageChangementMotDePasse() {
  const [etat, action, enCours] = useActionState(changerMotDePasse, etatInitial)
  const [motDePasse, setMotDePasse] = useState('')
  const [confirmation, setConfirmation] = useState('')

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-esp-6">
      <EnTetePage
        titre="Choisissez un mot de passe"
        soustitre={
          <>
            Votre mot de passe actuel est temporaire. Choisissez-en un nouveau d&apos;au moins{' '}
            {LONGUEUR_MDP_MINIMALE} caractères pour continuer.
          </>
        }
      />

      <Formulaire
        action={action}
        erreur={etat.erreur}
        enCours={enCours}
        actions={
          <Bouton type="submit" enCours={enCours} libelleAttente="Enregistrement…">
            Enregistrer
          </Bouton>
        }
      >
        <Champ
          label="Nouveau mot de passe"
          name="motDePasse"
          type="password"
          autoComplete="new-password"
          required
          minLength={LONGUEUR_MDP_MINIMALE}
          value={motDePasse}
          onChange={(evenement) => setMotDePasse(evenement.target.value)}
        />

        <Champ
          label="Confirmation"
          name="confirmation"
          type="password"
          autoComplete="new-password"
          required
          value={confirmation}
          onChange={(evenement) => setConfirmation(evenement.target.value)}
        />
      </Formulaire>

      {/*
        Seule issue depuis cet écran. Le middleware renvoie ici toute navigation
        tant que le drapeau est actif : sans ce lien, quelqu'un de bloqué n'aurait
        aucun moyen de sortir, et cette application n'offre aucune réinitialisation
        autonome. Un lien simple, car la déconnexion est une route, pas une action.
      */}
      <a
        href="/deconnexion"
        className="cible-tactile mt-esp-6 justify-center text-petit text-encre-attenuee underline underline-offset-4"
      >
        Se déconnecter
      </a>
    </main>
  )
}
