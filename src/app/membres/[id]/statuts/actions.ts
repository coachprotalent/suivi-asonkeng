'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { normaliserDateAcquisition, normaliserNote, StatutInvalideError } from '@/lib/domaine/statut'
import { exigerAdministrateur } from '@/lib/securite/garde'
import { clientAdmin } from '@/lib/supabase/admin'
import {
  MESSAGE_ECHEC_STATUT,
  MESSAGE_MEMBRE_INCONNU,
  MESSAGE_STATUT_EXCLUSIF,
  MESSAGE_STATUT_INCONNU,
} from './messages'

export type EtatStatut = { erreur: string | null }

function texteObligatoire(donnees: FormData, champ: string): string | null {
  const valeur = donnees.get(champ)
  return typeof valeur === 'string' && valeur.length > 0 ? valeur : null
}

// Marqueurs posés par les fonctions Postgres via `using detail = '...'`
// (migration 20260813140000_marqueurs_erreurs_statuts.sql). On discrimine sur
// `error.details` et `error.code`, jamais sur le texte français du message : une
// reformulation de la prose casserait la correspondance en silence.
const DETAIL_MEMBRE_INCONNU = 'membre_inconnu'
const DETAIL_STATUT_INCONNU = 'statut_inconnu'
const DETAIL_STATUT_ABSENT = 'statut_absent'
const CODE_INVARIANT_EXCLUSIF = '23514' // check_violation, déclencheur d'exclusivité

export async function attribuerStatut(
  _etat: EtatStatut,
  donnees: FormData,
): Promise<EtatStatut> {
  const profil = await exigerAdministrateur()

  const membreId = texteObligatoire(donnees, 'membreId')
  const statutId = texteObligatoire(donnees, 'statutId')
  if (!membreId || !statutId) {
    // Champs cachés absents : une requête forgée ou un bug d'appel, pas une saisie à
    // corriger. On journalise quand même — un cas qui ne devrait jamais arriver et qui
    // arrive est un symptôme.
    console.error('attribuerStatut : identifiants manquants dans le formulaire', {
      membreId,
      statutId,
    })
    return { erreur: MESSAGE_ECHEC_STATUT }
  }

  let dateAcquisition: string | null
  let note: string | null
  try {
    dateAcquisition = normaliserDateAcquisition(donnees.get('dateAcquisition'))
    note = normaliserNote(donnees.get('note'))
  } catch (erreur) {
    // Le seul cas qui relève vraiment de la saisie : `StatutInvalideError` porte déjà
    // un message précis et actionnable, on le relaie tel quel.
    if (erreur instanceof StatutInvalideError) {
      return { erreur: erreur.message }
    }
    console.error('attribuerStatut : échec inattendu de la normalisation de la saisie', {
      membreId,
      statutId,
      erreur,
    })
    return { erreur: MESSAGE_ECHEC_STATUT }
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
    // Trace serveur systématique, y compris pour les cas classifiés ci-dessous : un
    // administrateur qui signale « ça ne marche pas » doit trouver quelque chose
    // d'exploitable dans les journaux, pas seulement un message générique à l'écran.
    console.error('attribuerStatut : échec RPC attribuer_statut', {
      membreId,
      statutId,
      code: error.code,
      details: error.details,
      message: error.message,
    })

    if (error.details === DETAIL_MEMBRE_INCONNU) {
      return { erreur: MESSAGE_MEMBRE_INCONNU }
    }
    if (error.details === DETAIL_STATUT_INCONNU) {
      return { erreur: MESSAGE_STATUT_INCONNU }
    }
    if (error.code === CODE_INVARIANT_EXCLUSIF) {
      return { erreur: MESSAGE_STATUT_EXCLUSIF }
    }
    return { erreur: MESSAGE_ECHEC_STATUT }
  }

  revalidatePath(`/membres/${membreId}`)
  revalidatePath(`/membres/${membreId}/statuts`)
  redirect(`/membres/${membreId}/statuts`)
}

/**
 * Normalise le motif de retrait sans jamais lever.
 *
 * Aucun écran ne fournit encore ce champ (question en attente d'arbitrage), et
 * `retirerStatut` n'a pas de canal pour renvoyer un message de validation à l'écran :
 * ce chemin doit simplement être incapable de planter. `normaliserNote` nomme aussi
 * son champ « note » dans ses messages d'erreur — les laisser remonter tels quels
 * pour un motif désignerait le mauvais champ. On les intercepte donc ici, on
 * journalise avec la bonne étiquette, et on retombe sur `null` : un motif refusé ne
 * doit pas bloquer un retrait par ailleurs valide.
 */
function normaliserMotifSansLever(brut: unknown, membreId: string, statutId: string): string | null {
  try {
    return normaliserNote(brut)
  } catch (erreur) {
    console.error('retirerStatut : motif invalide, ignoré (champ « motif », pas « note »)', {
      membreId,
      statutId,
      raison: erreur instanceof Error ? erreur.message : erreur,
    })
    return null
  }
}

export async function retirerStatut(donnees: FormData): Promise<void> {
  const profil = await exigerAdministrateur()

  const membreId = texteObligatoire(donnees, 'membreId')
  const statutId = texteObligatoire(donnees, 'statutId')
  if (!membreId || !statutId) {
    // Même nature que côté attribution : une requête forgée, pas une saisie à
    // corriger. On la traite pareil — trace serveur puis échec visible — plutôt que
    // de rediriger en silence comme si de rien n'était.
    console.error('retirerStatut : identifiants manquants dans le formulaire', {
      membreId,
      statutId,
    })
    throw new Error("Le statut n'a pas pu être retiré : identifiants manquants.")
  }

  const motif = normaliserMotifSansLever(donnees.get('motif'), membreId, statutId)

  const { error } = await clientAdmin()
    .rpc('retirer_statut', {
      p_membre: membreId,
      p_statut: statutId,
      p_par: profil.id,
      p_motif: motif,
    })

  if (error) {
    if (error.details === DETAIL_STATUT_ABSENT) {
      // Succès idempotent : l'état voulu par l'administrateur — ce statut n'est pas
      // porté — est déjà atteint. Le cas survient sur une double soumission, deux
      // administrateurs sur la même fiche, ou un onglet resté ouvert : dans tous les
      // cas, annoncer un échec inviterait à recommencer une opération qui ne peut
      // jamais réussir. On journalise quand même : si ce chemin se déclenche souvent,
      // c'est un symptôme à regarder.
      console.warn('retirerStatut : statut déjà absent, traité comme un succès idempotent', {
        membreId,
        statutId,
      })
      revalidatePath(`/membres/${membreId}`)
      revalidatePath(`/membres/${membreId}/statuts`)
      redirect(`/membres/${membreId}/statuts`)
    }

    // Trace serveur systématique pour tout ce qui reste réellement inattendu.
    console.error('retirerStatut : échec RPC retirer_statut', {
      membreId,
      statutId,
      code: error.code,
      details: error.details,
      message: error.message,
    })
    throw new Error(`Le statut n'a pas pu être retiré : ${error.message}`)
  }

  revalidatePath(`/membres/${membreId}`)
  revalidatePath(`/membres/${membreId}/statuts`)
  redirect(`/membres/${membreId}/statuts`)
}
