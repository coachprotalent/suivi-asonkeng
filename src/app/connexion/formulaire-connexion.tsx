'use client'

import { useActionState, useState } from 'react'
import { Bouton } from '@/composants/ui/bouton'
import { Champ } from '@/composants/ui/champ'
import { Formulaire } from '@/composants/ui/formulaire'
import { seConnecter, type EtatConnexion } from './actions'

const etatInitial: EtatConnexion = { erreur: null }

/**
 * Extrait de `page.tsx`, devenue un composant serveur pour pouvoir lire `searchParams`
 * (l'accusé d'inscription). `useActionState`, sans quoi `MESSAGE_ECHEC_CONNEXION`
 * n'atteindrait pas l'écran.
 *
 * ═══ LES DEUX CHAMPS DEVIENNENT CONTRÔLÉS (D111), ET LE MOT DE PASSE AUSSI ═══
 *
 * `seConnecter` RETOURNE son refus (`EtatConnexion.erreur`) : le formulaire passe donc par
 * le chemin « complétion normale » de React, qui réinitialise les champs NON CONTRÔLÉS. Sur
 * un identifiant mal tapé, l'utilisateur retapait TOUT, y compris l'identifiant qui était
 * juste. `Champ` rend le cas inexprimable.
 *
 * LE MOT DE PASSE SURVIT DÉSORMAIS À UN REFUS, et c'est un changement de comportement
 * assumé : c'est ce que fait tout formulaire de connexion, et retaper un mot de passe long
 * après une faute de frappe sur l'identifiant est précisément ce qui pousse à en choisir un
 * court. La valeur reste dans l'état du composant client, jamais dans le DOM au-delà de la
 * vie de la page — rien n'est persisté.
 */
export function FormulaireConnexion() {
  const [etat, action, enCours] = useActionState(seConnecter, etatInitial)
  const [identifiant, setIdentifiant] = useState('')
  const [motDePasse, setMotDePasse] = useState('')

  return (
    <Formulaire
      action={action}
      erreur={etat.erreur}
      enCours={enCours}
      actions={
        <Bouton type="submit" enCours={enCours} libelleAttente="Connexion…">
          Se connecter
        </Bouton>
      }
    >
      <Champ
        label="Identifiant"
        name="identifiant"
        type="text"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        required
        value={identifiant}
        onChange={(evenement) => setIdentifiant(evenement.target.value)}
      />
      <Champ
        label="Mot de passe"
        name="motDePasse"
        type="password"
        autoComplete="current-password"
        required
        value={motDePasse}
        onChange={(evenement) => setMotDePasse(evenement.target.value)}
      />
    </Formulaire>
  )
}
