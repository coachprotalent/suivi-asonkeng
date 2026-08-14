'use server'

import { revalidatePath } from 'next/cache'
import { exigerModerateurOuAdministrateur } from '@/lib/securite/garde'
import { clientAdmin } from '@/lib/supabase/admin'

export type ResultatPointage = { erreur: string | null }

/**
 * Écriture UNITAIRE, ligne à ligne (D43) : chaque case cochée ou décochée appelle
 * cette fonction séparément, jamais un formulaire global. `upsert` sur la clé
 * composite `(seance_id, membre_id)` fait de « dernière écriture gagnante » une
 * propriété VRAIE PAR CONSTRUCTION.
 */
export async function pointerPresence(
  seanceId: string,
  membreId: string,
  present: boolean,
): Promise<ResultatPointage> {
  const profil = await exigerModerateurOuAdministrateur()

  const { data, error } = await clientAdmin()
    .from('presences_ael')
    .upsert(
      {
        seance_id: seanceId,
        membre_id: membreId,
        present,
        pointe_par: profil.id,
        pointe_le: new Date().toISOString(),
      },
      { onConflict: 'seance_id,membre_id' },
    )
    .select('seance_id')

  if (error || !data || data.length === 0) {
    console.error('pointerPresence : échec de la mise à jour', {
      seanceId,
      membreId,
      present,
      code: error?.code,
      details: error?.details,
      message: error?.message,
    })
    return { erreur: "Le pointage n'a pas pu être enregistré." }
  }

  revalidatePath(`/ael/seances/${seanceId}`)
  return { erreur: null }
}
