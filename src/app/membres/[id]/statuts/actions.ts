'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { normaliserDateAcquisition, normaliserNote, StatutInvalideError } from '@/lib/domaine/statut'
import { exigerAutoriteSur } from '@/lib/securite/garde'
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

  // Le garde vient APRÈS la lecture de `membreId` parce qu'il en dépend — et
  // c'est le seul cas du projet où il n'est pas la toute première instruction.
  // Ce qui le précède ne lit RIEN et n'écrit RIEN : il ne fait que dépaqueter le
  // formulaire. Aucun effet de bord n'est possible avant le contrôle.
  const profil = await exigerAutoriteSur(membreId)

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
 * L'écran de la Task 6 exposera ce champ avec une limite de longueur visible à la
 * saisie (`maxLength`) : l'utilisateur verra la contrainte au moment où il écrit,
 * plutôt que de découvrir après coup que son texte a disparu. Le repli silencieux
 * ci-dessous n'est donc plus le chemin normal — c'est une défense contre une requête
 * forgée qui contournerait cette limite côté client, et `retirerStatut` n'a de toute
 * façon aucun canal pour renvoyer un message de validation à l'écran. `normaliserNote`
 * nomme aussi son champ « note » dans ses messages d'erreur — les laisser remonter
 * tels quels pour un motif désignerait le mauvais champ. On les intercepte donc ici,
 * on journalise avec la bonne étiquette, et on retombe sur `null` : un motif refusé
 * ne doit pas bloquer un retrait par ailleurs valide.
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

  // Le garde vient APRÈS la lecture de `membreId` parce qu'il en dépend — et
  // c'est le seul cas du projet où il n'est pas la toute première instruction.
  // Ce qui le précède ne lit RIEN et n'écrit RIEN : il ne fait que dépaqueter le
  // formulaire. Aucun effet de bord n'est possible avant le contrôle.
  const profil = await exigerAutoriteSur(membreId)

  const motif = normaliserMotifSansLever(donnees.get('motif'), membreId, statutId)

  const { error } = await clientAdmin()
    .rpc('retirer_statut', {
      p_membre: membreId,
      p_statut: statutId,
      p_par: profil.id,
      p_motif: motif,
    })

  if (error) {
    // `membre_inconnu` n'est pas un succès idempotent : sans la vérification ajoutée
    // par 20260813150000_retrait_membre_inconnu.sql, un `membreId` forgé ou périmé
    // supprimait zéro ligne — exactement le même signal qu'un statut déjà retiré — et
    // se retrouvait donc redirigé en silence vers la fiche d'un membre qui n'existe
    // pas. Seul `statut_absent` (le membre existe, il ne porte simplement pas ce
    // statut) reste un succès idempotent.
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

    // Trace serveur systématique pour tout ce qui reste réellement inattendu, y
    // compris `membre_inconnu`.
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
