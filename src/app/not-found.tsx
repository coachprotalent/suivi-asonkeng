import Link from 'next/link'
import { CLASSES_VARIANTE } from '@/composants/ui/bouton'
import { EnTetePage } from '@/composants/ui/en-tete-page'

/**
 * ⚠️ POINTE VERS `/membres`, JAMAIS VERS `/tableau-de-bord` (Task 24) — l'inventaire le
 * relève comme « incohérence mineure possible » avec le hub employé partout ailleurs.
 * NE PAS LA CORRIGER : ce serait changer une destination de navigation, pas une
 * présentation (piège n°4). Signalée, pas corrigée.
 *
 * LA SECONDE DES DEUX EXCEPTIONS DE TAILLE DE `<h1>` DU DÉPÔT DISPARAÎT ICI, même
 * raison que `error.tsx`.
 */
export default function Introuvable() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-esp-6">
      <EnTetePage
        titre="Page introuvable"
        soustitre="Cette adresse ne correspond à rien. Le lien est peut-être périmé, ou la fiche a été supprimée."
      />
      <Link href="/membres" className={`${CLASSES_VARIANTE.lien} self-start`}>
        Revenir à l&apos;annuaire
      </Link>
    </main>
  )
}
