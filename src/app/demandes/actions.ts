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
 * Un refus MÉTIER est RETOURNÉ, jamais LEVÉ (correction post-Task-17, constat
 * établi empiriquement — voir le rapport). En production, une exception levée
 * depuis une Server Action perd son message avant même d'atteindre le `catch`
 * du composant client : React la remplace par un digest interne (« Minified
 * React error #441… »), quel que soit le texte écrit ici. Ce n'est PAS un
 * texte générique de l'application qui se substitue — c'est React lui-même,
 * documenté sur react.dev/errors/441 : « The specific message is omitted in
 * production builds ». Observé pour de vrai : `npm run build` + `next start`
 * sur un port dédié, un refus `membre_deja_rattache` provoquant un clic réel,
 * affichait littéralement ce texte au lieu de « Cette fiche est déjà
 * rattachée à un autre compte. ». Le même mécanisme touchait déjà
 * `MESSAGE_ECHEC_CONNEXION` (`seConnecter`, non levé — voir son commentaire) ;
 * il n'avait simplement jamais été vérifié contre un build de production pour
 * les actions de cet écran. Preuve rejouable : `tests/e2e-prod/`.
 *
 * `redirect()` reste une exception à part : elle DOIT continuer de traverser
 * sans être attrapée ni convertie — Next.js la reconnaît spécifiquement côté
 * serveur et ne la fait jamais passer par le mécanisme de digest décrit
 * ci-dessus. Aucune des quatre fonctions de ce fichier n'appelle `redirect()`.
 *
 * Une vraie panne technique (readable uniquement dans les logs serveur, sans
 * texte utile pour l'utilisateur) peut continuer de lever : c'est le cas des
 * erreurs Supabase inattendues, déjà traduites ici en un message MESSAGE_*
 * avant d'être RETOURNÉES — donc aucune ne lève plus dans ce fichier.
 */
export type ResultatDemande = { erreur: string | null }

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
export async function annulerDemandeSuivi(donnees: FormData): Promise<ResultatDemande> {
  const profil = await exigerProfilActif()

  const demandeId = String(donnees.get('demandeId') ?? '')
  if (demandeId.length === 0) {
    console.error('annulerDemandeSuivi : identifiant de demande manquant dans le formulaire')
    return { erreur: MESSAGE_ECHEC_ANNULATION }
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
      return { erreur: MESSAGE_ECHEC_ANNULATION }
    }
    return { erreur: MESSAGE_ECHEC_ANNULATION }
  }

  revalidatePath('/demandes')
  return { erreur: null }
}

/**
 * Valide une demande comme NOUVELLE PERSONNE (design 2b §7.3) — les deux origines
 * partagent cette action, avec un comportement différent selon l'`origine` de la
 * demande, RELUE depuis `demandes_membre` (voir plus bas — I2, revue post-Task-17) :
 * - auto_inscription : fiche -> actif, profils.membre_id du demandeur posé sur
 *   cette fiche. Aucune écriture d'arbre.
 * - demande_suivi : fiche -> actif, faiseur_de_disciple_id = la fiche du
 *   demandeur (demandeurMembreId, PEUT être NULL si le demandeur n'a pas de
 *   fiche liée — cas du compte racine, registre 1c piège n°3 : traité en
 *   silence, pas en échec), dirigeant_id et dirigeant_force selon le formulaire.
 *
 * NON ATOMIQUE À TRAVERS SES TROIS ÉCRITURES (membres, éventuellement profils,
 * demandes_membre) : voir la Task 17 du plan pour la justification de ce choix.
 *
 * I2 (revue post-Task-17) : la version initiale faisait confiance à `membreId`
 * et `demandeurProfilId`, soumis par le FORMULAIRE, sans vérifier qu'ils
 * désignaient bien la demande visée par `demandeId` — un formulaire falsifié
 * aurait pu, avec un `demandeId` réel, faire valider une fiche et notifier un
 * compte appartenant à une AUTRE demande. `origine`, `membreId` et
 * `demandeurProfilId` sont désormais RELUS depuis `demandes_membre`, jamais pris
 * du formulaire. `etat = 'en_attente'` est exigé à la lecture ET à l'écriture
 * finale (comme `rejeterDemande` et `valider_demande_rattachement` le font déjà) :
 * une demande annulée ou rejetée ne peut plus être revalidée.
 */
export async function validerDemandeNouvellePersonne(donnees: FormData): Promise<ResultatDemande> {
  const adminProfil = await exigerAdministrateur()

  const demandeId = String(donnees.get('demandeId') ?? '')
  if (demandeId.length === 0) {
    console.error('validerDemandeNouvellePersonne : identifiant de demande manquant dans le formulaire')
    return { erreur: MESSAGE_ECHEC_VALIDATION }
  }

  const admin = clientAdmin()

  const { data: demandeLue, error: erreurLecture } = await admin
    .from('demandes_membre')
    .select('id, origine, membre_id, demandeur_profil_id')
    .eq('id', demandeId)
    .eq('etat', 'en_attente')
    .maybeSingle()

  if (
    erreurLecture ||
    !demandeLue ||
    !demandeLue.membre_id ||
    (demandeLue.origine !== 'auto_inscription' && demandeLue.origine !== 'demande_suivi')
  ) {
    console.error('validerDemandeNouvellePersonne : demande introuvable, déjà traitée, ou sans fiche', {
      demandeId,
      code: erreurLecture?.code,
      message: erreurLecture?.message,
    })
    return { erreur: MESSAGE_ECHEC_VALIDATION }
  }

  const origine = demandeLue.origine
  const membreId = demandeLue.membre_id
  const demandeurProfilId = demandeLue.demandeur_profil_id

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
    return { erreur: MESSAGE_ECHEC_VALIDATION }
  }

  if (origine === 'auto_inscription') {
    const { error: erreurProfil } = await admin.from('profils').update({ membre_id: membreId }).eq('id', demandeurProfilId)
    if (erreurProfil) {
      console.error('validerDemandeNouvellePersonne : échec de la liaison du profil', {
        demandeurProfilId,
        membreId,
        message: erreurProfil.message,
      })
      return { erreur: MESSAGE_ECHEC_VALIDATION }
    }
  }

  const { data: demandeMaj, error: erreurDemande } = await admin
    .from('demandes_membre')
    .update({ etat: 'validee', traite_par: adminProfil.id, traite_le: new Date().toISOString() })
    .eq('id', demandeId)
    .eq('etat', 'en_attente')
    .select('id')
  if (erreurDemande || !demandeMaj || demandeMaj.length === 0) {
    console.error('validerDemandeNouvellePersonne : échec de la mise à jour de la demande', {
      demandeId,
      code: erreurDemande?.code,
      message: erreurDemande?.message,
    })
    return { erreur: MESSAGE_ECHEC_VALIDATION }
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
  return { erreur: null }
}

/**
 * Valide une auto_inscription par RATTACHEMENT à une fiche existante (D26). Passe
 * par la fonction SECURITY DEFINER de la Task 10 : voir son commentaire pour
 * l'ordre des écritures et la raison d'une fonction dédiée plutôt que d'écritures
 * séquentielles.
 */
export async function validerDemandeRattachement(donnees: FormData): Promise<ResultatDemande> {
  const adminProfil = await exigerAdministrateur()

  const demandeId = String(donnees.get('demandeId') ?? '')
  const membreExistantId = String(donnees.get('membreExistantId') ?? '')
  if (demandeId.length === 0 || membreExistantId.length === 0) {
    console.error('validerDemandeRattachement : champs manquants', { demandeId, membreExistantId })
    return { erreur: MESSAGE_ECHEC_RATTACHEMENT }
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
      return { erreur: MESSAGE_MEMBRE_INCONNU }
    }
    if (error.details === DETAIL_RATTACHEMENT_VERS_FICHE_JETABLE) {
      return { erreur: MESSAGE_RATTACHEMENT_VERS_FICHE_JETABLE }
    }
    if (error.details === DETAIL_MEMBRE_DEJA_RATTACHE) {
      return { erreur: MESSAGE_MEMBRE_DEJA_RATTACHE }
    }
    if (error.details === DETAIL_DEMANDE_NON_VALIDABLE) {
      return { erreur: MESSAGE_DEMANDE_NON_VALIDABLE }
    }
    // Marqueur inconnu ou absent (panne technique) : seul cas qui retombe sur le
    // message générique.
    return { erreur: MESSAGE_ECHEC_RATTACHEMENT }
  }

  revalidatePath('/demandes')
  return { erreur: null }
}

/** Rejette une demande, motif obligatoire, demandeur notifié (design 2b §7.3). */
export async function rejeterDemande(donnees: FormData): Promise<ResultatDemande> {
  const adminProfil = await exigerAdministrateur()

  const demandeId = String(donnees.get('demandeId') ?? '')
  const demandeurProfilId = String(donnees.get('demandeurProfilId') ?? '')
  const motif = String(donnees.get('motif') ?? '').trim()
  if (demandeId.length === 0 || demandeurProfilId.length === 0) {
    console.error('rejeterDemande : champs manquants', { demandeId, demandeurProfilId })
    return { erreur: MESSAGE_ECHEC_REJET }
  }
  if (motif.length === 0) {
    return { erreur: MESSAGE_MOTIF_OBLIGATOIRE }
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
    return { erreur: MESSAGE_ECHEC_REJET }
  }
  if (!data || data.length === 0) {
    return { erreur: MESSAGE_ECHEC_REJET }
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
  return { erreur: null }
}
