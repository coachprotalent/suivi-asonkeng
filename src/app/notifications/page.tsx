import Link from 'next/link'
import { mesNotifications } from '@/lib/donnees/notifications'
import { exigerProfilActif } from '@/lib/securite/garde'
import { marquerNotificationLue } from './actions'

export default async function PageNotifications() {
  const profil = await exigerProfilActif()
  const notifications = await mesNotifications(profil.id)
  const nonLues = notifications.filter((n) => !n.luLe)

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Link href="/tableau-de-bord" className="text-sm underline underline-offset-4">
        Retour au tableau de bord
      </Link>
      <h1 className="mt-4 mb-8 text-2xl font-semibold">Notifications</h1>

      {notifications.length === 0 ? (
        <p className="text-sm text-neutral-500">Aucune notification.</p>
      ) : (
        <ul className="divide-y divide-neutral-200">
          {notifications.map((notification) => (
            <li key={notification.id} className="py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className={notification.luLe ? 'text-neutral-500' : 'font-medium'}>
                  {notification.titre}
                </span>
                {!notification.luLe ? (
                  <form action={marquerNotificationLue}>
                    <input type="hidden" name="notificationId" value={notification.id} />
                    <button type="submit" className="text-sm underline underline-offset-4">
                      Marquer comme lue
                    </button>
                  </form>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-neutral-600">{notification.corps}</p>
              {notification.lien ? (
                <Link href={notification.lien} className="mt-1 inline-block text-sm underline underline-offset-4">
                  Voir
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {nonLues.length === 0 && notifications.length > 0 ? (
        <p className="mt-6 text-sm text-neutral-500">Tout est lu.</p>
      ) : null}
    </main>
  )
}
