'use server'

import { revalidatePath } from 'next/cache'
import { exigerModerateurOuAdministrateur } from '@/lib/securite/garde'
import { clientAdmin } from '@/lib/supabase/admin'
import type { EtatEvenement } from '../actions'
// `champOuNull` et `colonnesEvenementDepuisFormulaire` viennent de `../champs`, un module
// ORDINAIRE : `../actions` porte `'use server'` et ne peut exporter que des fonctions
// ASYNCHRONES (échec au `npm run build`, pas au `tsc`). Le TYPE `EtatEvenement`, lui, est
// effacé à la compilation et reste importable de `../actions`.
import { champOuNull, colonnesEvenementDepuisFormulaire } from '../champs'
import { MESSAGE_ECHEC_EVENEMENT, MESSAGE_PERIODE_INCOHERENTE } from '../messages'
import { MESSAGE_EVENEMENT_INTROUVABLE } from './messages'

const CODE_VIOLATION_CHECK = '23514'

/**
 * Édition d'un évènement, ouverte au modérateur autant qu'à l'administrateur (D23).
 *
 * La MÊME validation que la création (`colonnesEvenementDepuisFormulaire`, Task 17) :
 * deux copies seraient deux occasions de les faire diverger, et la divergence ne se
 * verrait qu'au moment où le `check` de la base refuserait une écriture que l'écran avait
 * laissé passer.
 */
export async function modifierEvenement(
  _etat: EtatEvenement,
  donnees: FormData,
): Promise<EtatEvenement> {
  await exigerModerateurOuAdministrateur()

  const evenementId = champOuNull(donnees, 'evenementId')
  if (!evenementId) {
    console.error("modifierEvenement : identifiant de l'évènement manquant dans le formulaire")
    return { erreur: MESSAGE_ECHEC_EVENEMENT }
  }

  const resultat = colonnesEvenementDepuisFormulaire(donnees)
  if ('erreur' in resultat) {
    return { erreur: resultat.erreur }
  }

  const { data, error } = await clientAdmin()
    .from('evenements')
    .update(resultat.colonnes)
    .eq('id', evenementId)
    .select('id')

  if (error) {
    console.error('modifierEvenement : échec de la mise à jour', {
      evenementId,
      code: error.code,
      details: error.details,
      message: error.message,
    })
    if (error.code === CODE_VIOLATION_CHECK) {
      return { erreur: MESSAGE_PERIODE_INCOHERENTE }
    }
    return { erreur: MESSAGE_ECHEC_EVENEMENT }
  }
  // Une mise à jour qui ne touche AUCUNE ligne ne renvoie AUCUNE erreur : sans ce contrôle,
  // un identifiant périmé (évènement supprimé dans un autre onglet, requête forgée)
  // produirait un succès apparent.
  if (!data || data.length === 0) {
    console.error('modifierEvenement : aucune ligne mise à jour', { evenementId })
    return { erreur: MESSAGE_EVENEMENT_INTROUVABLE }
  }

  revalidatePath('/evenements')
  revalidatePath(`/evenements/${evenementId}`)
  // AUCUN `redirect()` ici : on reste sur la fiche, et `useActionState` conserve son état.
  return { erreur: null }
}
