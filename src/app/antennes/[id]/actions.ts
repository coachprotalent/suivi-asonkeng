'use server'

import { revalidatePath } from 'next/cache'
import { antenneParId } from '@/lib/donnees/antennes'
import { exigerModerateurOuAdministrateur } from '@/lib/securite/garde'
import { clientAdmin } from '@/lib/supabase/admin'
import {
  MESSAGE_ANTENNE_INACTIVE,
  MESSAGE_ANTENNE_INCONNUE,
  MESSAGE_ECHEC_RATTACHEMENT,
  MESSAGE_MEMBRE_MANQUANT,
} from './messages'

export type EtatRattachement = { erreur: string | null }

function champOuNull(donnees: FormData, champ: string): string | null {
  const valeur = donnees.get(champ)
  return typeof valeur === 'string' && valeur.length > 0 ? valeur : null
}

/**
 * Affecte OU retire l'antenne d'un membre, sur le modèle de `definir_arbre` (1c,
 * design phase 3 §4.7). `antenneId` absent du formulaire (donc `null`) DÉTACHE — ce
 * n'est pas « ne change pas ». UNE SEULE fonction, nommée comme le §4.7 la nomme : le
 * rattachement (Task 4, `FormulaireRattachement`) et le détachement (Task 4,
 * `LigneMembreDetachable`) postent tous deux vers elle, chacun avec sa propre instance
 * de `useActionState` — le piège n°10 du §9 du design recense nommément cette fonction
 * comme un des deux chemins d'écriture de `membres.antenne_id` à ne pas oublier en
 * revue ; la scinder en deux aurait rendu ce recensement faux.
 *
 * Réservée au modérateur et à l'administrateur (D50). Aucune passerelle SQL :
 * contrairement à l'arbre ou aux statuts, aucun invariant ici ne dépasse la ligne
 * écrite — même raisonnement que D38 pour l'idempotence de la génération.
 */
export async function definirAntenneMembre(
  _etat: EtatRattachement,
  donnees: FormData,
): Promise<EtatRattachement> {
  await exigerModerateurOuAdministrateur()

  const membreId = champOuNull(donnees, 'membreId')
  if (!membreId) {
    // Atteignable par une soumission sans JavaScript du formulaire de rattachement
    // (Task 4) : le bouton n'y est désactivé que côté client tant qu'aucun membre
    // n'est choisi. Message dédié, pas le message générique : la cause est connue.
    return { erreur: MESSAGE_MEMBRE_MANQUANT }
  }

  const antenneId = champOuNull(donnees, 'antenneId')
  // `pageAntenneId` sert UNIQUEMENT à revalider la bonne page après un détachement,
  // où `antenneId` lui-même vaut `null` : voir l'encadré de cette tâche.
  const pageAntenneId = champOuNull(donnees, 'pageAntenneId')

  if (antenneId) {
    // Contrôle amont, nommé : le sélecteur ne propose que des membres actifs, mais
    // rien n'empêche une antenne désactivée de rester ciblable par un identifiant déjà
    // en mémoire dans le formulaire (onglet resté ouvert pendant qu'un administrateur
    // désactive l'antenne ailleurs). Sans ce contrôle, l'écriture réussirait quand
    // même : aucune contrainte en base ne porte cette règle (§6 du design de la
    // phase 3). Un DÉTACHEMENT (`antenneId` null) ne passe jamais par cette branche —
    // détacher d'une antenne désactivée reste toujours permis.
    const antenne = await antenneParId(antenneId)
    if (!antenne) {
      return { erreur: MESSAGE_ANTENNE_INCONNUE }
    }
    if (!antenne.actif) {
      return { erreur: MESSAGE_ANTENNE_INACTIVE }
    }
  }

  const { data, error } = await clientAdmin()
    .from('membres')
    .update({ antenne_id: antenneId })
    .eq('id', membreId)
    .select('id')

  if (error) {
    console.error('definirAntenneMembre : échec de la mise à jour', {
      antenneId,
      membreId,
      code: error.code,
      details: error.details,
      message: error.message,
    })
    return { erreur: MESSAGE_ECHEC_RATTACHEMENT }
  }
  // Une mise à jour qui ne touche aucune ligne ne renvoie aucune erreur : un
  // identifiant de membre forgé ou périmé produirait sinon un succès apparent.
  if (!data || data.length === 0) {
    console.error('definirAntenneMembre : aucune ligne mise à jour', { antenneId, membreId })
    return { erreur: MESSAGE_ECHEC_RATTACHEMENT }
  }

  if (pageAntenneId) {
    revalidatePath(`/antennes/${pageAntenneId}`)
  }
  if (antenneId && antenneId !== pageAntenneId) {
    revalidatePath(`/antennes/${antenneId}`)
  }
  revalidatePath('/membres')
  revalidatePath(`/membres/${membreId}`)
  return { erreur: null }
}
