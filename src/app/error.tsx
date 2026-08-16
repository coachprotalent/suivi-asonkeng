'use client'

import { Bouton } from '@/composants/ui/bouton'
import { EnTetePage } from '@/composants/ui/en-tete-page'

/**
 * ⚠️ CE MESSAGE RESTE STATIQUE (Task 24) — il n'a jamais lu `error.message`, et
 * `comptes/ligne-compte.tsx` REPOSE sur ce fait (D123, Task 20). Le rendre dynamique
 * changerait le comportement d'erreur de l'écran des comptes.
 *
 * L'UNE DES DEUX EXCEPTIONS DE TAILLE DE `<h1>` DU DÉPÔT (`text-xl` au lieu de
 * `text-2xl`) DISPARAÎT ICI : `EnTetePage` sans `retour` rend `text-titre`, comme
 * partout ailleurs.
 */
export default function Erreur({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-esp-6">
      <EnTetePage
        titre="Une erreur est survenue"
        soustitre="L'opération n'a pas pu aboutir. Réessayez ; si le problème persiste, signalez-le à un administrateur."
      />
      <Bouton type="button" alignement="debut" onClick={reset}>
        Réessayer
      </Bouton>
    </main>
  )
}
