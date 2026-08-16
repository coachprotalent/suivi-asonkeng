'use client'

import { useActionState } from 'react'
import { Bouton } from '@/composants/ui/bouton'
import { Formulaire } from '@/composants/ui/formulaire'
import { marquerNotificationLue, type ResultatNotification } from './actions'

const ETAT_INITIAL: ResultatNotification = { erreur: null }

/**
 * Le composant qui rend `MESSAGE_ECHEC_NOTIFICATION` ATTEIGNABLE (I3 de la revue
 * finale de branche). Auparavant, `<form action={marquerNotificationLue}>` était
 * lié DIRECTEMENT à la Server Action depuis le composant serveur de la page : le
 * refus levé par l'action partait dans `src/app/error.tsx`, dont le texte est
 * STATIQUE — le message n'a jamais pu s'afficher, dans aucun mode.
 *
 * `useActionState` plutôt que `useTransition` (le motif de `ligne-token.tsx`),
 * pour une raison précise à cet écran : il conserve les champs cachés `$ACTION_*`
 * du formulaire, donc l'amélioration progressive ET les preuves par requête forgée
 * de `tests/e2e/notifications.spec.ts`, qui capturent ces champs pour rejouer
 * l'appel depuis une AUTRE session. Un passage à `useTransition` aurait fait
 * disparaître ces champs et cassé la seule preuve que le garde `profil_id` de
 * l'action tient face à un appel direct.
 */
export function FormulaireMarquage({ notificationId }: { notificationId: string }) {
  const [etat, envoyer, enCours] = useActionState(marquerNotificationLue, ETAT_INITIAL)

  return (
    <Formulaire
      action={envoyer}
      erreur={etat.erreur}
      enCours={enCours}
      actions={
        // LIBELLÉ STABLE PENDANT L'ENVOI, et ce n'est pas cosmétique : le renommer en
        // « Marquage… » pendant la transition faisait disparaître le bouton du
        // sélecteur `getByRole('button', { name: 'Marquer comme lue' })` DÈS LE CLIC.
        // L'assertion « il ne reste qu'un bouton » de tests/e2e/notifications.spec.ts
        // passait alors AVANT que le serveur ait répondu, et la navigation qui
        // suivait interrompait la requête : la notification n'était jamais marquée
        // lue. Un état visuel transitoire qui modifie un libellé sur lequel des tests
        // s'appuient pour attendre est un piège à part entière. `libelleAttente` n'est
        // donc PAS passé ici — seul `disabled` (porté par `enCours`) signale l'envoi.
        <Bouton type="submit" variante="lien" enCours={enCours}>
          Marquer comme lue
        </Bouton>
      }
    >
      <input type="hidden" name="notificationId" value={notificationId} />
    </Formulaire>
  )
}
