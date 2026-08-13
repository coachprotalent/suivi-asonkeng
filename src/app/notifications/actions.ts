'use server'

import { revalidatePath } from 'next/cache'
import { exigerProfilActif } from '@/lib/securite/garde'
import { clientAdmin } from '@/lib/supabase/admin'
import { MESSAGE_ECHEC_NOTIFICATION } from './messages'

/**
 * Marque une notification comme lue (design 2b §7.4). `.eq('profil_id',
 * profil.id)` : même garde que `lierFiche` (1c) contre une mise à jour qui ne
 * toucherait aucune ligne — une notification d'autrui, filtrée ici, ne renvoie
 * aucune erreur mais ne touche rien non plus, d'où la vérification explicite du
 * nombre de lignes modifiées avant de rendre un succès.
 */
export async function marquerNotificationLue(donnees: FormData): Promise<void> {
  const profil = await exigerProfilActif()

  const notificationId = String(donnees.get('notificationId') ?? '')
  if (notificationId.length === 0) {
    console.error('marquerNotificationLue : identifiant de notification manquant')
    throw new Error(MESSAGE_ECHEC_NOTIFICATION)
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
    throw new Error(MESSAGE_ECHEC_NOTIFICATION)
  }
  if (!data || data.length === 0) {
    throw new Error(MESSAGE_ECHEC_NOTIFICATION)
  }

  revalidatePath('/notifications')
}
