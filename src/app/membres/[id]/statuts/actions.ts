'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { normaliserDateAcquisition, normaliserNote, StatutInvalideError } from '@/lib/domaine/statut'
import { exigerAdministrateur } from '@/lib/securite/garde'
import { clientAdmin } from '@/lib/supabase/admin'
import { MESSAGE_ECHEC_STATUT } from './messages'

export type EtatStatut = { erreur: string | null }

function texteObligatoire(donnees: FormData, champ: string): string | null {
  const valeur = donnees.get(champ)
  return typeof valeur === 'string' && valeur.length > 0 ? valeur : null
}

export async function attribuerStatut(
  _etat: EtatStatut,
  donnees: FormData,
): Promise<EtatStatut> {
  const profil = await exigerAdministrateur()

  const membreId = texteObligatoire(donnees, 'membreId')
  const statutId = texteObligatoire(donnees, 'statutId')
  if (!membreId || !statutId) {
    return { erreur: MESSAGE_ECHEC_STATUT }
  }

  let dateAcquisition: string | null
  let note: string | null
  try {
    dateAcquisition = normaliserDateAcquisition(donnees.get('dateAcquisition'))
    note = normaliserNote(donnees.get('note'))
  } catch (erreur) {
    return {
      erreur: erreur instanceof StatutInvalideError ? erreur.message : MESSAGE_ECHEC_STATUT,
    }
  }

  // L'attribution peut évincer un statut exclusif et doit journaliser les deux
  // mouvements : c'est une fonction Postgres, donc atomique. Deux appels séparés
  // laisseraient la fiche sans statut si le second échouait.
  const { error } = await clientAdmin()
    .rpc('attribuer_statut', {
      p_membre: membreId,
      p_statut: statutId,
      p_date: dateAcquisition,
      p_note: note,
      p_par: profil.id,
    })

  if (error) {
    return { erreur: MESSAGE_ECHEC_STATUT }
  }

  revalidatePath(`/membres/${membreId}`)
  revalidatePath(`/membres/${membreId}/statuts`)
  redirect(`/membres/${membreId}/statuts`)
}

export async function retirerStatut(donnees: FormData): Promise<void> {
  const profil = await exigerAdministrateur()

  const membreId = texteObligatoire(donnees, 'membreId')
  const statutId = texteObligatoire(donnees, 'statutId')
  if (!membreId || !statutId) {
    redirect('/membres')
  }

  // La fonction lève si le membre ne porte pas ce statut : un retrait sans effet
  // ne doit pas passer pour un succès.
  const { error } = await clientAdmin()
    .rpc('retirer_statut', {
      p_membre: membreId,
      p_statut: statutId,
      p_par: profil.id,
      p_motif: normaliserNote(donnees.get('motif')),
    })

  if (error) {
    throw new Error(`Le statut n'a pas pu être retiré : ${error.message}`)
  }

  revalidatePath(`/membres/${membreId}`)
  revalidatePath(`/membres/${membreId}/statuts`)
  redirect(`/membres/${membreId}/statuts`)
}
