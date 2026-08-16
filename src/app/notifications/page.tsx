import Link from 'next/link'
import { EnTetePage } from '@/composants/ui/en-tete-page'
import { LigneListe, Liste } from '@/composants/ui/ligne-liste'
import { mesNotifications } from '@/lib/donnees/notifications'
import { exigerProfilActif } from '@/lib/securite/garde'
import { FormulaireMarquage } from './formulaire-marquage'

export default async function PageNotifications() {
  const profil = await exigerProfilActif()
  const notifications = await mesNotifications(profil.id)
  const nonLues = notifications.filter((n) => !n.luLe)

  return (
    <main className="mx-auto max-w-2xl px-esp-6 py-esp-10">
      <EnTetePage
        retour={{ href: '/tableau-de-bord', libelle: 'Retour au tableau de bord' }}
        titre="Notifications"
      />

      {notifications.length === 0 ? (
        <p className="text-petit text-encre-attenuee">Aucune notification.</p>
      ) : (
        <Liste>
          {notifications.map((notification) => (
            <LigneListe
              key={notification.id}
              /*
                ⚠️ HORS DU CHOIX FIXE DE `LigneListe` (D126) : `principal` porte deux
                canaux — la couleur ET la graisse — pour distinguer lu de non lu, jamais
                la couleur seule. `text-nom` (le style ambiant de `principal`) fixe déjà
                une graisse marquée ; le `<span>` imbriqué la ramène à `font-normal` en
                plus d'atténuer la couleur, exactement comme `font-medium` disparaissait
                sans remplacement pour une notification lue avant cette migration.
              */
              principal={
                notification.luLe ? (
                  <span className="font-normal text-encre-attenuee">{notification.titre}</span>
                ) : (
                  notification.titre
                )
              }
              actions={!notification.luLe ? <FormulaireMarquage notificationId={notification.id} /> : null}
              complement={
                <div className="flex flex-col gap-esp-1">
                  <p className="text-petit text-encre-attenuee">{notification.corps}</p>
                  {notification.lien ? (
                    <Link
                      href={notification.lien}
                      className="cible-tactile self-start text-petit text-action underline underline-offset-4"
                    >
                      Voir
                    </Link>
                  ) : null}
                </div>
              }
            />
          ))}
        </Liste>
      )}

      {nonLues.length === 0 && notifications.length > 0 ? (
        <p className="mt-esp-6 text-petit text-encre-attenuee">Tout est lu.</p>
      ) : null}
    </main>
  )
}
