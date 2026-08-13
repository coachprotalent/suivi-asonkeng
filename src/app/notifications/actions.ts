'use server'

import { revalidatePath } from 'next/cache'
import { exigerProfilActif } from '@/lib/securite/garde'
import { clientAdmin } from '@/lib/supabase/admin'
import { MESSAGE_ECHEC_NOTIFICATION } from './messages'

export type ResultatNotification = { erreur: string | null }

/**
 * Marque une notification comme lue (design 2b §7.4). `.eq('profil_id',
 * profil.id)` : même garde que `lierFiche` (1c) contre une mise à jour qui ne
 * toucherait aucune ligne — une notification d'autrui, filtrée ici, ne renvoie
 * aucune erreur mais ne touche rien non plus, d'où la vérification explicite du
 * nombre de lignes modifiées avant de rendre un succès.
 *
 * I3 (revue finale de branche) — CINQUIÈME INCARNATION DU MOTIF DOMINANT, ET ELLE
 * ÉTAIT TOTALE : cette fonction LEVAIT `MESSAGE_ECHEC_NOTIFICATION` trois fois,
 * depuis une action liée à un `<form action={…}>` NU. Une exception levée là part
 * dans `src/app/error.tsx`, qui affiche un texte STATIQUE et ne lit JAMAIS
 * `error.message`. Ce message n'a donc jamais pu s'afficher — ni en
 * développement, ni en production, et pas davantage sur un build de production
 * (le piège du digest React #441 est un AUTRE mécanisme, et il ne s'appliquait
 * même pas ici : celui-ci perdait le message plus tôt encore). Le fichier
 * `messages.ts` a été créé par cette phase pour porter cette seule constante, qui
 * n'a jamais atteint un écran.
 *
 * Le remède est celui déjà éprouvé dans cette phase sur `seConnecter`,
 * `revoquerToken` et les quatre actions de `/demandes` : L'ACTION RETOURNE SON
 * REFUS, le composant lit la valeur retournée et l'affiche
 * (`formulaire-marquage.tsx`, `useActionState`). Aucun `throw` ne subsiste ici.
 */
export async function marquerNotificationLue(
  _etat: ResultatNotification,
  donnees: FormData,
): Promise<ResultatNotification> {
  const profil = await exigerProfilActif()

  const notificationId = String(donnees.get('notificationId') ?? '')
  if (notificationId.length === 0) {
    console.error('marquerNotificationLue : identifiant de notification manquant')
    return { erreur: MESSAGE_ECHEC_NOTIFICATION }
  }

  const { data, error } = await clientAdmin()
    .from('notifications')
    .update({ lu_le: new Date().toISOString() })
    .eq('id', notificationId)
    .eq('profil_id', profil.id)
    .select('id')

  if (error) {
    console.error('marquerNotificationLue : échec', {
      notificationId,
      profilId: profil.id,
      code: error.code,
      message: error.message,
    })
    return { erreur: MESSAGE_ECHEC_NOTIFICATION }
  }
  if (!data || data.length === 0) {
    // Aucune ligne touchée : notification inexistante, ou appartenant à un autre
    // compte (le filtre `profil_id` l'a écartée sans erreur). Même message dans
    // les deux cas — distinguer révélerait l'existence de la notification d'autrui.
    console.error('marquerNotificationLue : aucune ligne modifiée', {
      notificationId,
      profilId: profil.id,
    })
    return { erreur: MESSAGE_ECHEC_NOTIFICATION }
  }

  revalidatePath('/notifications')
  return { erreur: null }
}
