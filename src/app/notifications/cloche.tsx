import Link from 'next/link'
import { compterNotificationsNonLues } from '@/lib/donnees/notifications'
import { profilCourant } from '@/lib/donnees/profils'

/**
 * Composant SERVEUR, monté depuis `layout.tsx` sur TOUTE page (design 2b §8 :
 * « cloche dans l'en-tête »). Utilise `profilCourant()`, PAS
 * `exigerProfilActif()` — voir la Task 18 du plan pour la raison : ce composant
 * s'affiche aussi sur /connexion et /inscription, où aucun profil n'existe, et
 * ne doit jamais y provoquer de redirection.
 */
export async function Cloche() {
  const profil = await profilCourant()
  if (!profil) {
    return null
  }

  const nonLues = await compterNotificationsNonLues(profil.id)

  return (
    <div className="border-b border-neutral-200 bg-neutral-50 px-6 py-2 text-right">
      <Link href="/notifications" className="text-sm underline underline-offset-4">
        Notifications{nonLues > 0 ? ` (${nonLues})` : ''}
      </Link>
    </div>
  )
}
