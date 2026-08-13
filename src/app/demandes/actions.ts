'use server'

import { revalidatePath } from 'next/cache'
import { exigerAdministrateur, exigerProfilActif } from '@/lib/securite/garde'
import { clientAdmin } from '@/lib/supabase/admin'
import {
  MESSAGE_DEMANDE_NON_VALIDABLE,
  MESSAGE_ECHEC_ANNULATION,
  MESSAGE_ECHEC_RATTACHEMENT,
  MESSAGE_ECHEC_REJET,
  MESSAGE_ECHEC_VALIDATION,
  MESSAGE_MEMBRE_DEJA_RATTACHE,
  MESSAGE_MEMBRE_INCONNU,
  MESSAGE_MOTIF_OBLIGATOIRE,
  MESSAGE_RATTACHEMENT_VERS_FICHE_JETABLE,
} from './messages'

const DETAIL_DEMANDE_NON_ANNULABLE = 'demande_non_annulable'
const DETAIL_MEMBRE_INCONNU = 'membre_inconnu'
const DETAIL_DEMANDE_NON_VALIDABLE = 'demande_non_validable'
const DETAIL_RATTACHEMENT_VERS_FICHE_JETABLE = 'rattachement_vers_fiche_jetable'
const DETAIL_MEMBRE_DEJA_RATTACHE = 'membre_deja_rattache'

/**
 * Marque lues (D41) les notifications `nouvelle_demande` déjà envoyées aux
 * administrateurs pour CETTE demande, par symétrie avec les fonctions
 * SECURITY DEFINER de la Task 10 (`annuler_demande_membre`,
 * `valider_demande_rattachement`, migrations 20260815250000/260000), qui le font
 * dans la même transaction que leur traitement. `validerDemandeNouvellePersonne`
 * et `rejeterDemande` ne passent PAS par une fonction dédiée (voir le
 * commentaire de la Task 17 sur l'absence d'atomicité choisie pour ces deux
 * actions) : ce marquage est donc une écriture SÉPARÉE, tout comme l'insertion
 * de la notification de décision. Un échec ici ne doit pas faire échouer la
 * décision déjà actée en base — journalisé, pas levé, même politique que
 * l'insertion de notification elle-même.
 */
async function marquerNouvelleDemandeLue(admin: ReturnType<typeof clientAdmin>, demandeId: string): Promise<void> {
  const { error } = await admin
    .from('notifications')
    .update({ lu_le: new Date().toISOString() })
    .eq('type', 'nouvelle_demande')
    .eq('demande_id', demandeId)
    .is('lu_le', null)
  if (error) {
    console.error('marquerNouvelleDemandeLue : échec du marquage', { demandeId, message: error.message })
  }
}

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

/**
 * Valide une demande comme NOUVELLE PERSONNE (design 2b §7.3) — les deux origines
 * partagent cette action, avec un comportement différent selon `origine`, lue
 * dans le formulaire :
 * - auto_inscription : fiche -> actif, profils.membre_id de demandeurProfilId
 *   posé sur cette fiche. Aucune écriture d'arbre.
 * - demande_suivi : fiche -> actif, faiseur_de_disciple_id = la fiche du
 *   demandeur (demandeurMembreId, PEUT être NULL si le demandeur n'a pas de
 *   fiche liée — cas du compte racine, registre 1c piège n°3 : traité en
 *   silence, pas en échec), dirigeant_id et dirigeant_force selon le formulaire.
 *
 * NON ATOMIQUE À TRAVERS SES TROIS ÉCRITURES (membres, éventuellement profils,
 * demandes_membre) : voir la Task 17 du plan pour la justification de ce choix.
 */
export async function validerDemandeNouvellePersonne(donnees: FormData): Promise<void> {
  const adminProfil = await exigerAdministrateur()

  const demandeId = String(donnees.get('demandeId') ?? '')
  const origine = String(donnees.get('origine') ?? '')
  const membreId = String(donnees.get('membreId') ?? '')
  const demandeurProfilId = String(donnees.get('demandeurProfilId') ?? '')
  if (
    demandeId.length === 0 ||
    membreId.length === 0 ||
    demandeurProfilId.length === 0 ||
    (origine !== 'auto_inscription' && origine !== 'demande_suivi')
  ) {
    console.error('validerDemandeNouvellePersonne : champs manquants ou origine invalide', {
      demandeId,
      origine,
      membreId,
      demandeurProfilId,
    })
    throw new Error(MESSAGE_ECHEC_VALIDATION)
  }

  const admin = clientAdmin()

  const colonnesMembre: Record<string, unknown> = { etat: 'actif' }
  if (origine === 'demande_suivi') {
    const demandeurMembreId = String(donnees.get('demandeurMembreId') ?? '') || null
    colonnesMembre.faiseur_de_disciple_id = demandeurMembreId
    colonnesMembre.dirigeant_id = String(donnees.get('dirigeantId') ?? '') || null
    colonnesMembre.dirigeant_force = donnees.get('dirigeantForce') === '1'
  }

  const { data: ficheMaj, error: erreurFiche } = await admin
    .from('membres')
    .update(colonnesMembre)
    .eq('id', membreId)
    .select('id')
  if (erreurFiche || !ficheMaj || ficheMaj.length === 0) {
    console.error('validerDemandeNouvellePersonne : échec de la mise à jour de la fiche', {
      membreId,
      code: erreurFiche?.code,
      message: erreurFiche?.message,
    })
    throw new Error(MESSAGE_ECHEC_VALIDATION)
  }

  if (origine === 'auto_inscription') {
    const { error: erreurProfil } = await admin.from('profils').update({ membre_id: membreId }).eq('id', demandeurProfilId)
    if (erreurProfil) {
      console.error('validerDemandeNouvellePersonne : échec de la liaison du profil', {
        demandeurProfilId,
        membreId,
        message: erreurProfil.message,
      })
      throw new Error(MESSAGE_ECHEC_VALIDATION)
    }
  }

  const { data: demandeMaj, error: erreurDemande } = await admin
    .from('demandes_membre')
    .update({ etat: 'validee', traite_par: adminProfil.id, traite_le: new Date().toISOString() })
    .eq('id', demandeId)
    .select('id')
  if (erreurDemande || !demandeMaj || demandeMaj.length === 0) {
    console.error('validerDemandeNouvellePersonne : échec de la mise à jour de la demande', {
      demandeId,
      code: erreurDemande?.code,
      message: erreurDemande?.message,
    })
    throw new Error(MESSAGE_ECHEC_VALIDATION)
  }

  // `lien` reste réservé à la NAVIGATION (`/demandes`, la seule route qui existe
  // dans cette phase) ; `demande_id` porte la corrélation (migration
  // 20260815240000) — contrat ajouté après la rédaction initiale du plan, voir
  // le rapport de la Task 17.
  const { error: erreurNotif } = await admin.from('notifications').insert({
    profil_id: demandeurProfilId,
    type: 'demande_validee',
    titre: 'Votre demande a été validée',
    corps: 'Votre demande a été validée par un administrateur.',
    lien: '/demandes',
    demande_id: demandeId,
  })
  if (erreurNotif) {
    console.error('validerDemandeNouvellePersonne : échec de la notification', {
      demandeurProfilId,
      message: erreurNotif.message,
    })
  }

  await marquerNouvelleDemandeLue(admin, demandeId)

  revalidatePath('/demandes')
}

/**
 * Valide une auto_inscription par RATTACHEMENT à une fiche existante (D26). Passe
 * par la fonction SECURITY DEFINER de la Task 10 : voir son commentaire pour
 * l'ordre des écritures et la raison d'une fonction dédiée plutôt que d'écritures
 * séquentielles.
 */
export async function validerDemandeRattachement(donnees: FormData): Promise<void> {
  const adminProfil = await exigerAdministrateur()

  const demandeId = String(donnees.get('demandeId') ?? '')
  const membreExistantId = String(donnees.get('membreExistantId') ?? '')
  if (demandeId.length === 0 || membreExistantId.length === 0) {
    console.error('validerDemandeRattachement : champs manquants', { demandeId, membreExistantId })
    throw new Error(MESSAGE_ECHEC_RATTACHEMENT)
  }

  const { error } = await clientAdmin().rpc('valider_demande_rattachement', {
    p_demande: demandeId,
    p_membre_existant: membreExistantId,
    p_admin: adminProfil.id,
  })

  if (error) {
    console.error('validerDemandeRattachement : échec RPC valider_demande_rattachement', {
      demandeId,
      membreExistantId,
      code: error.code,
      details: error.details,
      message: error.message,
    })
    // Chacun des quatre marqueurs posés par valider_demande_rattachement (§10,
    // migrations 20260815230000/260000) reçoit son PROPRE message, distinct des
    // trois autres — jamais un texte générique commun qui les rendrait
    // indiscernables à l'écran (correction post-brief : la version initiale de
    // cette fonction ne distinguait que membre_inconnu, voir le rapport de la
    // Task 17). La discrimination porte UNIQUEMENT sur `error.details`, jamais
    // sur le texte français du message Postgres.
    if (error.details === DETAIL_MEMBRE_INCONNU) {
      throw new Error(MESSAGE_MEMBRE_INCONNU)
    }
    if (error.details === DETAIL_RATTACHEMENT_VERS_FICHE_JETABLE) {
      throw new Error(MESSAGE_RATTACHEMENT_VERS_FICHE_JETABLE)
    }
    if (error.details === DETAIL_MEMBRE_DEJA_RATTACHE) {
      throw new Error(MESSAGE_MEMBRE_DEJA_RATTACHE)
    }
    if (error.details === DETAIL_DEMANDE_NON_VALIDABLE) {
      throw new Error(MESSAGE_DEMANDE_NON_VALIDABLE)
    }
    // Marqueur inconnu ou absent (panne technique) : seul cas qui retombe sur le
    // message générique.
    throw new Error(MESSAGE_ECHEC_RATTACHEMENT)
  }

  revalidatePath('/demandes')
}

/** Rejette une demande, motif obligatoire, demandeur notifié (design 2b §7.3). */
export async function rejeterDemande(donnees: FormData): Promise<void> {
  const adminProfil = await exigerAdministrateur()

  const demandeId = String(donnees.get('demandeId') ?? '')
  const demandeurProfilId = String(donnees.get('demandeurProfilId') ?? '')
  const motif = String(donnees.get('motif') ?? '').trim()
  if (demandeId.length === 0 || demandeurProfilId.length === 0) {
    console.error('rejeterDemande : champs manquants', { demandeId, demandeurProfilId })
    throw new Error(MESSAGE_ECHEC_REJET)
  }
  if (motif.length === 0) {
    throw new Error(MESSAGE_MOTIF_OBLIGATOIRE)
  }

  const admin = clientAdmin()
  const { data, error } = await admin
    .from('demandes_membre')
    .update({ etat: 'rejetee', motif_rejet: motif, traite_par: adminProfil.id, traite_le: new Date().toISOString() })
    .eq('id', demandeId)
    .eq('etat', 'en_attente')
    .select('id')

  if (error) {
    console.error('rejeterDemande : échec', { demandeId, code: error.code, message: error.message })
    throw new Error(MESSAGE_ECHEC_REJET)
  }
  if (!data || data.length === 0) {
    throw new Error(MESSAGE_ECHEC_REJET)
  }

  // Même contrat que validerDemandeNouvellePersonne : lien = navigation seule,
  // demande_id = corrélation.
  const { error: erreurNotif } = await admin.from('notifications').insert({
    profil_id: demandeurProfilId,
    type: 'demande_rejetee',
    titre: 'Votre demande a été rejetée',
    corps: motif,
    lien: '/demandes',
    demande_id: demandeId,
  })
  if (erreurNotif) {
    console.error('rejeterDemande : échec de la notification', { demandeurProfilId, message: erreurNotif.message })
  }

  await marquerNouvelleDemandeLue(admin, demandeId)

  revalidatePath('/demandes')
}
