'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { exigerModerateurOuAdministrateur } from '@/lib/securite/garde'
import { clientAdmin } from '@/lib/supabase/admin'
import { colonnesEvenementDepuisFormulaire } from './champs'
import { MESSAGE_ECHEC_EVENEMENT, MESSAGE_PERIODE_INCOHERENTE } from './messages'

// SEUL export non fonctionnel autorisé ici : un TYPE est effacé à la compilation. Toute
// fonction exportée d'un module `'use server'` doit être ASYNCHRONE — c'est pourquoi
// `champOuNull` et `colonnesEvenementDepuisFormulaire` vivent dans `./champs`.
export type EtatEvenement = { erreur: string | null }

const CODE_VIOLATION_CHECK = '23514'

/**
 * D23 — création ouverte au MODÉRATEUR autant qu'à l'administrateur. La spécification
 * maîtresse a longtemps dit « l'admin crée l'événement » au §6 ; c'était faux depuis
 * l'amendement du 2026-08-12, et le texte a été corrigé le 2026-08-14 (D54).
 */
export async function creerEvenement(
  _etat: EtatEvenement,
  donnees: FormData,
): Promise<EtatEvenement> {
  const profil = await exigerModerateurOuAdministrateur()

  const resultat = colonnesEvenementDepuisFormulaire(donnees)
  if ('erreur' in resultat) {
    return { erreur: resultat.erreur }
  }

  const { data, error } = await clientAdmin()
    .from('evenements')
    .insert({ ...resultat.colonnes, cree_par: profil.id })
    .select('id')
    .single()

  if (error || !data) {
    console.error("creerEvenement : échec de l'insertion", {
      code: error?.code,
      details: error?.details,
      message: error?.message,
    })
    // Filet si le contrôle amont et le `check` divergeaient un jour : la base sait
    // exactement ce qui cloche, et le message le dit. Discrimination sur `error.code`,
    // jamais sur le texte français.
    if (error?.code === CODE_VIOLATION_CHECK) {
      return { erreur: MESSAGE_PERIODE_INCOHERENTE }
    }
    return { erreur: MESSAGE_ECHEC_EVENEMENT }
  }

  revalidatePath('/evenements')
  // `redirect()` lève une exception de CONTRÔLE que Next reconnaît : elle DOIT traverser
  // sans être attrapée, et elle n'est donc JAMAIS dans un `try`. Elle est la dernière
  // instruction de cette fonction.
  redirect(`/evenements/${data.id}`)
}
