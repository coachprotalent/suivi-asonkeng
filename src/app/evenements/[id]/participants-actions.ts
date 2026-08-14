'use server'

import { revalidatePath } from 'next/cache'
import { exigerModerateurOuAdministrateur } from '@/lib/securite/garde'
import { clientAdmin } from '@/lib/supabase/admin'
import {
  MESSAGE_ECHEC_PARTICIPATION,
  MESSAGE_NOM_EXTERNE_OBLIGATOIRE,
  MESSAGE_PARTICIPANT_DEJA_INSCRIT,
  MESSAGE_PARTICIPANT_MANQUANT,
  MESSAGE_PARTICIPATION_INTROUVABLE,
} from './messages'

export type EtatParticipation = { erreur: string | null }

// Discrimination sur `error.code`, jamais sur le texte français. `23505` est le code du
// unique_violation levé par les DEUX index partiels de D58 — participations_membre_unique
// et participations_externe_unique. Le message est le même dans les deux cas parce que le
// FAIT est le même : cette personne est déjà inscrite.
const CODE_VIOLATION_UNICITE = '23505'

function champOuNull(donnees: FormData, champ: string): string | null {
  const valeur = donnees.get(champ)
  return typeof valeur === 'string' && valeur.trim().length > 0 ? valeur.trim() : null
}

/** Les trois désirs et la note, lus d'un formulaire. Une case non cochée est ABSENTE. */
function desirsDepuisFormulaire(donnees: FormData) {
  return {
    desir_mentorat_academique: donnees.get('desirMentoratAcademique') === 'on',
    desir_suivi_spirituel: donnees.get('desirSuiviSpirituel') === 'on',
    desir_cpeap: donnees.get('desirCpeap') === 'on',
    note: champOuNull(donnees, 'note'),
  }
}

/** Ajoute un MEMBRE actif comme participant (D76). */
export async function ajouterParticipantMembre(
  _etat: EtatParticipation,
  donnees: FormData,
): Promise<EtatParticipation> {
  const profil = await exigerModerateurOuAdministrateur()

  const evenementId = champOuNull(donnees, 'evenementId')
  if (!evenementId) {
    console.error('ajouterParticipantMembre : identifiant de l évènement manquant')
    return { erreur: MESSAGE_ECHEC_PARTICIPATION }
  }
  const membreId = champOuNull(donnees, 'membreId')
  if (!membreId) {
    // Atteignable par une soumission sans JavaScript : le bouton n'est désactivé que côté
    // client tant qu'aucun membre n'est choisi. Message dédié, pas le générique.
    return { erreur: MESSAGE_PARTICIPANT_MANQUANT }
  }

  const { error } = await clientAdmin().from('participations').insert({
    evenement_id: evenementId,
    membre_id: membreId,
    ...desirsDepuisFormulaire(donnees),
    saisi_par: profil.id,
  })

  if (error) {
    console.error('ajouterParticipantMembre : échec de l insertion', {
      evenementId,
      membreId,
      code: error.code,
      details: error.details,
      message: error.message,
    })
    if (error.code === CODE_VIOLATION_UNICITE) {
      return { erreur: MESSAGE_PARTICIPANT_DEJA_INSCRIT }
    }
    return { erreur: MESSAGE_ECHEC_PARTICIPATION }
  }

  revalidatePath(`/evenements/${evenementId}`)
  // Une nouvelle participation peut faire apparaître une étiquette de séminaire sur une
  // fiche membre, et une ligne dans la liste « à traiter ».
  revalidatePath('/membres/[id]', 'page')
  revalidatePath('/evenements/a-traiter')
  return { erreur: null }
}

/**
 * Crée un participant EXTERNE à la volée et l'inscrit dans la foulée (D76).
 *
 * DEUX ÉCRITURES, NON ATOMIQUES, et c'est assumé — contrairement à la conversion (D65), où
 * l'atomicité est la raison d'être de la passerelle. La différence : ici, l'état
 * intermédiaire possible est un participant externe SANS participation, qui n'apparaît
 * dans AUCUN écran (la liste « à traiter » part des participations, la fiche d'évènement
 * aussi) et ne fausse RIEN. Là-bas, l'état intermédiaire était une fiche membre sans lien,
 * qui laissait le participant dans la liste « à traiter » alors qu'il avait déjà une fiche,
 * et un second clic créait un doublon. Une passerelle SQL ici ne protégerait donc de rien
 * de visible.
 *
 * Le nettoyage de l'orphelin est BEST-EFFORT et JOURNALISÉ, exactement comme
 * `creerDemandeSuivi` (2b) le fait pour sa fiche jetable.
 */
export async function ajouterParticipantExterne(
  _etat: EtatParticipation,
  donnees: FormData,
): Promise<EtatParticipation> {
  const profil = await exigerModerateurOuAdministrateur()

  const evenementId = champOuNull(donnees, 'evenementId')
  if (!evenementId) {
    console.error('ajouterParticipantExterne : identifiant de l évènement manquant')
    return { erreur: MESSAGE_ECHEC_PARTICIPATION }
  }
  const nom = champOuNull(donnees, 'nom')
  if (!nom) {
    return { erreur: MESSAGE_NOM_EXTERNE_OBLIGATOIRE }
  }

  const admin = clientAdmin()

  const { data: externe, error: erreurExterne } = await admin
    .from('participants_externes')
    .insert({
      nom,
      prenom: champOuNull(donnees, 'prenom'),
      telephone: champOuNull(donnees, 'telephone'),
      email: champOuNull(donnees, 'email'),
      ville: champOuNull(donnees, 'ville'),
      pays: champOuNull(donnees, 'pays'),
      cree_par: profil.id,
    })
    .select('id')
    .single()

  if (erreurExterne || !externe) {
    console.error('ajouterParticipantExterne : échec de la création du participant', {
      evenementId,
      code: erreurExterne?.code,
      message: erreurExterne?.message,
    })
    return { erreur: MESSAGE_ECHEC_PARTICIPATION }
  }

  const { error: erreurParticipation } = await admin.from('participations').insert({
    evenement_id: evenementId,
    participant_externe_id: externe.id,
    ...desirsDepuisFormulaire(donnees),
    saisi_par: profil.id,
  })

  if (erreurParticipation) {
    console.error('ajouterParticipantExterne : échec de l inscription, nettoyage du participant', {
      evenementId,
      participantExterneId: externe.id,
      code: erreurParticipation.code,
      message: erreurParticipation.message,
    })
    // Best-effort, journalisé : un participant externe sans aucune participation
    // n'apparaît dans aucun écran, mais le laisser serait un déchet silencieux en base de
    // production.
    const { error: erreurNettoyage } = await admin
      .from('participants_externes')
      .delete()
      .eq('id', externe.id)
      .is('converti_en_membre_id', null)
      .is('classe_le', null)
    if (erreurNettoyage) {
      console.error('ajouterParticipantExterne : le participant orphelin n a PAS été supprimé', {
        participantExterneId: externe.id,
        code: erreurNettoyage.code,
        message: erreurNettoyage.message,
      })
    }
    return { erreur: MESSAGE_ECHEC_PARTICIPATION }
  }

  revalidatePath(`/evenements/${evenementId}`)
  revalidatePath('/evenements/a-traiter')
  return { erreur: null }
}

/**
 * D77 — corrige les trois désirs et la note d'une participation existante.
 *
 * `saisi_par` et `saisi_le` NE SONT JAMAIS TOUCHÉS (D60) : ils portent l'origine.
 * `modifie_par` et `modifie_le` portent la dernière retouche. Confondre les deux ferait
 * perdre l'information que l'élargissement de D23 justifiait de garder.
 */
export async function modifierParticipation(
  _etat: EtatParticipation,
  donnees: FormData,
): Promise<EtatParticipation> {
  const profil = await exigerModerateurOuAdministrateur()

  const evenementId = champOuNull(donnees, 'evenementId')
  const participationId = champOuNull(donnees, 'participationId')
  if (!evenementId || !participationId) {
    console.error('modifierParticipation : champs manquants', { evenementId, participationId })
    return { erreur: MESSAGE_ECHEC_PARTICIPATION }
  }

  const { data, error } = await clientAdmin()
    .from('participations')
    .update({
      ...desirsDepuisFormulaire(donnees),
      modifie_par: profil.id,
      modifie_le: new Date().toISOString(),
    })
    .eq('id', participationId)
    .eq('evenement_id', evenementId)
    .select('id')

  if (error) {
    console.error('modifierParticipation : échec de la mise à jour', {
      participationId,
      code: error.code,
      details: error.details,
      message: error.message,
    })
    return { erreur: MESSAGE_ECHEC_PARTICIPATION }
  }
  // Une mise à jour qui ne touche aucune ligne ne renvoie AUCUNE erreur.
  if (!data || data.length === 0) {
    return { erreur: MESSAGE_PARTICIPATION_INTROUVABLE }
  }

  revalidatePath(`/evenements/${evenementId}`)
  revalidatePath('/evenements/a-traiter')
  return { erreur: null }
}

/**
 * D78 — SEUL GESTE DESTRUCTIF DE LA PHASE. Le projet archive et ne supprime jamais, mais
 * une participation n'est pas une fiche : c'est une DÉCLARATION, et une déclaration fausse
 * laissée en place FALSIFIE LES ÉTIQUETTES DE SÉMINAIRES D'UN MEMBRE INNOCENT, visibles de
 * toute l'équipe par D2. La supprimer efface aussi ses désirs, conséquence normale de
 * « cette ligne n'aurait pas dû exister ».
 *
 * Une participation dont l'externe a été CONVERTI reste supprimable : rien ne justifierait
 * qu'une erreur devienne indélébile parce qu'elle a été suivie d'une conversion. Aucune
 * contrainte ne s'y oppose — `participations` ne référence pas la conversion.
 */
export async function supprimerParticipation(
  _etat: EtatParticipation,
  donnees: FormData,
): Promise<EtatParticipation> {
  await exigerModerateurOuAdministrateur()

  const evenementId = champOuNull(donnees, 'evenementId')
  const participationId = champOuNull(donnees, 'participationId')
  if (!evenementId || !participationId) {
    console.error('supprimerParticipation : champs manquants', { evenementId, participationId })
    return { erreur: MESSAGE_ECHEC_PARTICIPATION }
  }

  const { data, error } = await clientAdmin()
    .from('participations')
    .delete()
    .eq('id', participationId)
    .eq('evenement_id', evenementId)
    .select('id')

  if (error) {
    console.error('supprimerParticipation : échec de la suppression', {
      participationId,
      code: error.code,
      details: error.details,
      message: error.message,
    })
    return { erreur: MESSAGE_ECHEC_PARTICIPATION }
  }
  // Une suppression qui ne touche aucune ligne ne renvoie AUCUNE erreur non plus.
  if (!data || data.length === 0) {
    return { erreur: MESSAGE_PARTICIPATION_INTROUVABLE }
  }

  revalidatePath(`/evenements/${evenementId}`)
  // Supprimer une participation peut faire DISPARAÎTRE une étiquette de séminaire et une
  // ligne de la liste « à traiter ».
  revalidatePath('/membres/[id]', 'page')
  revalidatePath('/evenements/a-traiter')
  return { erreur: null }
}
