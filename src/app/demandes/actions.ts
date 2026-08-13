'use server'

import { revalidatePath } from 'next/cache'
import { exigerProfilActif } from '@/lib/securite/garde'
import { clientAdmin } from '@/lib/supabase/admin'
import { MESSAGE_ECHEC_ANNULATION } from './messages'

const DETAIL_DEMANDE_NON_ANNULABLE = 'demande_non_annulable'

/**
 * Annulation par le demandeur lui-même (D40), tant que sa demande est
 * `en_attente` (design 2b §7.2). Passe par la fonction SECURITY DEFINER dédiée
 * (migration 20260815200000, corrigée en 20260815220000, corrélée aux
 * notifications en 20260815250000) : voir son en-tête pour la garantie
 * d'atomicité. NE JAMAIS scinder cet appel en deux écritures PostgREST séparées
 * — ce serait rouvrir silencieusement l'atomicité que la fonction garantit.
 */
export async function annulerDemandeSuivi(donnees: FormData): Promise<void> {
  const profil = await exigerProfilActif()

  const demandeId = String(donnees.get('demandeId') ?? '')
  if (demandeId.length === 0) {
    console.error('annulerDemandeSuivi : identifiant de demande manquant dans le formulaire')
    throw new Error(MESSAGE_ECHEC_ANNULATION)
  }

  const { error } = await clientAdmin().rpc('annuler_demande_membre', {
    p_demande: demandeId,
    p_demandeur: profil.id,
  })

  if (error) {
    console.error('annulerDemandeSuivi : échec RPC annuler_demande_membre', {
      demandeId,
      profilId: profil.id,
      code: error.code,
      details: error.details,
      message: error.message,
    })
    if (error.details === DETAIL_DEMANDE_NON_ANNULABLE) {
      throw new Error(MESSAGE_ECHEC_ANNULATION)
    }
    throw new Error(MESSAGE_ECHEC_ANNULATION)
  }

  revalidatePath('/demandes')
}
