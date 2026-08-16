import Link from 'next/link'
import { compterNotificationsNonLues } from '@/lib/donnees/notifications'
import { profilCourant } from '@/lib/donnees/profils'
import { CLASSES_VARIANTE } from '@/composants/ui/bouton'

/**
 * Composant SERVEUR, monté depuis `layout.tsx` sur TOUTE page (design 2b §8 :
 * « cloche dans l'en-tête »). Utilise `profilCourant()`, PAS
 * `exigerProfilActif()` — voir la Task 18 du plan pour la raison : ce composant
 * s'affiche aussi sur /connexion et /inscription, où aucun profil n'existe, et
 * ne doit jamais y provoquer de redirection.
 *
 * ⚠️ LE SEUL COMPOSANT COMMUN À TOUT LE PROJET (Task 24). Il n'y a AUCUNE barre de
 * navigation dans ce dépôt : ce fragment n'en devient pas une — ce serait un écran
 * de plus, que personne n'a demandé.
 */
export async function Cloche() {
  const profil = await profilCourant()
  if (!profil) {
    return null
  }

  const nonLues = await compterNotificationsNonLues(profil.id)

  return (
    <div className="border-b border-filet bg-surface px-esp-6 py-esp-2 text-right">
      <Link href="/notifications" className={CLASSES_VARIANTE.lien}>
        Notifications{nonLues > 0 ? ` (${nonLues})` : ''}
      </Link>
    </div>
  )
}
