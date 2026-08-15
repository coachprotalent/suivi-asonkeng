'use server'

import { revalidatePath } from 'next/cache'
import { dirigeantPropose } from '@/lib/domaine/arbre'
import { champManquantConversion, motifClassementValide, type CheminConversion } from '@/lib/domaine/evenements'
import { maillonArbre } from '@/lib/donnees/arbre'
import { notifierAdministrateurs } from '@/lib/donnees/notifications'
import { exigerAdministrateur } from '@/lib/securite/garde'
import { clientAdmin } from '@/lib/supabase/admin'
import {
  MESSAGE_CHEMIN_INCONNU,
  MESSAGE_CLASSEMENT_DEFINITIF,
  MESSAGE_ECHEC_CLASSEMENT,
  MESSAGE_ECHEC_CONVERSION,
  MESSAGE_FAISEUR_ARCHIVE,
  MESSAGE_FAISEUR_OBLIGATOIRE,
  MESSAGE_FICHE_CIBLE_INTROUVABLE,
  MESSAGE_FICHE_CIBLE_NON_ACTIVE,
  MESSAGE_FICHE_CIBLE_OBLIGATOIRE,
  MESSAGE_MOTIF_OBLIGATOIRE_CLASSEMENT,
  MESSAGE_NOM_PRENOM_OBLIGATOIRES,
  MESSAGE_PARTICIPANT_DEJA_CONVERTI,
  MESSAGE_PARTICIPANT_INTROUVABLE,
} from './messages'

export type EtatConversion = { erreur: string | null }

// Marqueurs posés par les deux passerelles via `using detail`. LA DISCRIMINATION PORTE
// UNIQUEMENT SUR `error.details`, jamais sur le texte français du message Postgres.
const DETAIL_PARTICIPANT_INCONNU = 'participant_inconnu'
const DETAIL_PARTICIPANT_DEJA_CONVERTI = 'participant_deja_converti'
const DETAIL_MEMBRE_CIBLE_INCONNU = 'membre_cible_inconnu'
const DETAIL_MEMBRE_CIBLE_NON_ACTIF = 'membre_cible_non_actif'
const DETAIL_CHEMIN_INCONNU = 'chemin_inconnu'
const DETAIL_CLASSEMENT_DEFINITIF = 'classement_definitif'
const DETAIL_MOTIF_VIDE = 'motif_classement_vide'
// Posé par le déclencheur membres_faiseur_de_disciple_archive (20260814150000), atteignable
// depuis le chemin 2 : la passerelle ne duplique pas cette règle, elle la laisse remonter.
const DETAIL_FAISEUR_ARCHIVE = 'faiseur_de_disciple_archive'

// LISTE FERMÉE DES MARQUEURS QUE `convertir_participant_externe` PEUT POSER — employée
// UNIQUEMENT pour décider ce qui a le droit d'atteindre le journal serveur, dans
// `convertirParticipant` plus bas. Même défaut, même remède qu'ailleurs (commit d48db7d,
// et sa reprise sur `definir_arbre`) : cette passerelle écrit dans `public.membres`
// (`insert into public.membres (nom, prenom, telephone, email_contact, ville, pays, …)`,
// migration 20260818220000, chemins `fiche_en_attente` ET `fiche_active`) sur une fiche
// NEUVE porteuse de coordonnées. Une violation de contrainte `check` ferait porter à
// `error.details` la ligne ENTIÈRE — nom, prénom, téléphone, adresse de contact, ville,
// pays — au lieu d'un marqueur applicatif. `classer_participant_externe`
// (`classerParticipant`, plus bas) n'écrit PAS dans `public.membres` et ne porte donc pas
// ce risque ; son `details` reste journalisé tel quel.
const MARQUEURS_CONNUS_CONVERSION: ReadonlySet<string> = new Set([
  DETAIL_PARTICIPANT_INCONNU,
  DETAIL_PARTICIPANT_DEJA_CONVERTI,
  DETAIL_MEMBRE_CIBLE_INCONNU,
  DETAIL_MEMBRE_CIBLE_NON_ACTIF,
  DETAIL_CHEMIN_INCONNU,
  DETAIL_FAISEUR_ARCHIVE,
])

function champOuNull(donnees: FormData, champ: string): string | null {
  const valeur = donnees.get(champ)
  return typeof valeur === 'string' && valeur.trim().length > 0 ? valeur.trim() : null
}

/**
 * Convertit un participant externe en membre par l'un des trois chemins (D65 à D68).
 *
 * D55 — RÉSERVÉE À L'ADMINISTRATEUR SEUL, comme le classement. La spec §5.2 le dit déjà
 * pour la conversion (« Convertir un participant externe en membre : ❌ ❌ ✅ ») ; D23 n'a
 * jamais élargi ce geste.
 *
 * ⚠️ UN SEUL `.rpc()`, ET IL NE SE SCINDE JAMAIS. L'atomicité est tenue PAR CONSTRUCTION
 * (D65) : une exception à n'importe quel point du corps de la passerelle annule tout ce
 * qu'elle a écrit. Remplacer cet appel par « créer la fiche via clientAdmin() puis poser le
 * lien » ferait disparaître l'atomicité EN SILENCE et rouvrirait la fenêtre où la fiche
 * existe sans lien — le participant resterait dans la liste alors qu'il a déjà une fiche,
 * et un second clic créerait un doublon. Même discipline que `annulerDemandeSuivi`.
 */
export async function convertirParticipant(
  _etat: EtatConversion,
  donnees: FormData,
): Promise<EtatConversion> {
  const adminProfil = await exigerAdministrateur()

  const participantId = champOuNull(donnees, 'participantId')
  if (!participantId) {
    console.error('convertirParticipant : identifiant du participant manquant')
    return { erreur: MESSAGE_ECHEC_CONVERSION }
  }

  const chemin = (champOuNull(donnees, 'chemin') ?? '') as CheminConversion
  const nom = champOuNull(donnees, 'nom')
  const prenom = champOuNull(donnees, 'prenom')
  const faiseurId = champOuNull(donnees, 'faiseurId')
  const membreCibleId = champOuNull(donnees, 'membreCibleId')

  // Contrôle AMONT (design §6) : la seule règle réellement combinatoire de la phase, et
  // celle où une erreur produirait une FICHE MUETTE plutôt qu'une erreur — un chemin 2
  // sans faiseur crée une fiche active DÉTACHÉE de l'arbre, sans le moindre signal.
  const manquant = champManquantConversion(chemin, {
    nom,
    prenom,
    faiseur: faiseurId,
    membreCible: membreCibleId,
  })
  if (manquant === 'chemin') {
    return { erreur: MESSAGE_CHEMIN_INCONNU }
  }
  if (manquant === 'nom' || manquant === 'prenom') {
    return { erreur: MESSAGE_NOM_PRENOM_OBLIGATOIRES }
  }
  if (manquant === 'faiseur') {
    return { erreur: MESSAGE_FAISEUR_OBLIGATOIRE }
  }
  if (manquant === 'membreCible') {
    return { erreur: MESSAGE_FICHE_CIBLE_OBLIGATOIRE }
  }

  // Chemin 2 : le dirigeant est PROPOSÉ par la règle du §4.2, réutilisée TELLE QUELLE
  // (`dirigeantPropose`, 1c) et jamais réécrite. L'administrateur peut la remplacer, et
  // `dirigeant_force` enregistre lequel des deux s'est produit — ce drapeau atteste
  // seulement que la valeur n'a pas été saisie à la main, il n'autorise rien.
  let dirigeantId: string | null = null
  let dirigeantForce = false
  if (chemin === 'fiche_active') {
    const dirigeantChoisi = champOuNull(donnees, 'dirigeantId')
    if (dirigeantChoisi) {
      dirigeantId = dirigeantChoisi
      dirigeantForce = true
    } else {
      const maillon = await maillonArbre(faiseurId as string)
      dirigeantId = dirigeantPropose(maillon)
      dirigeantForce = false
    }
  }

  const { data, error } = await clientAdmin().rpc('convertir_participant_externe', {
    p_participant: participantId,
    p_chemin: chemin,
    p_membre_cible: membreCibleId,
    p_nom: nom,
    p_prenom: prenom,
    p_faiseur: chemin === 'fiche_active' ? faiseurId : null,
    p_dirigeant: dirigeantId,
    p_dirigeant_force: dirigeantForce,
    p_par: adminProfil.id,
  })

  if (error) {
    // `details` N'EST JAMAIS JOURNALISÉ TEL QUEL — voir `MARQUEURS_CONNUS_CONVERSION` plus
    // haut : cette passerelle écrit dans `public.membres`, et une violation de contrainte
    // `check` peut faire porter à `details` la ligne entière (fuite vie privée, même défaut
    // que sur `creerMembreEnrichi` et `definir_arbre`).
    console.error('convertirParticipant : échec RPC convertir_participant_externe', {
      participantId,
      chemin,
      code: error.code,
      details:
        error.details && MARQUEURS_CONNUS_CONVERSION.has(error.details) ? error.details : undefined,
      message: error.message,
    })
    // Chaque marqueur reçoit son PROPRE message, distinct des autres : un texte générique
    // commun les rendrait indiscernables à l'écran alors que le geste correctif attendu
    // diffère dans chaque cas. Discrimination sur `error.details` UNIQUEMENT.
    if (error.details === DETAIL_PARTICIPANT_INCONNU) {
      return { erreur: MESSAGE_PARTICIPANT_INTROUVABLE }
    }
    if (error.details === DETAIL_PARTICIPANT_DEJA_CONVERTI) {
      return { erreur: MESSAGE_PARTICIPANT_DEJA_CONVERTI }
    }
    if (error.details === DETAIL_MEMBRE_CIBLE_INCONNU) {
      return { erreur: MESSAGE_FICHE_CIBLE_INTROUVABLE }
    }
    if (error.details === DETAIL_MEMBRE_CIBLE_NON_ACTIF) {
      return { erreur: MESSAGE_FICHE_CIBLE_NON_ACTIVE }
    }
    if (error.details === DETAIL_CHEMIN_INCONNU) {
      return { erreur: MESSAGE_CHEMIN_INCONNU }
    }
    if (error.details === DETAIL_FAISEUR_ARCHIVE) {
      return { erreur: MESSAGE_FAISEUR_ARCHIVE }
    }
    return { erreur: MESSAGE_ECHEC_CONVERSION }
  }

  // `.rpc()` sur une fonction `returns table` rend un TABLEAU, et son type est `any` (aucun
  // type Database n'est généré dans ce projet). Une ligne exactement.
  const ligne = (Array.isArray(data) ? data[0] : data) as { membre_id: string; demande_id: string | null } | null
  const demandeId = ligne?.demande_id ?? null

  // LE CHEMIN CONNAÎT SA PROPRE ATTENTE, ET IL LA DIT. `chemin === 'fiche_en_attente'`
  // implique qu'une ligne `demandes_membre` vient d'être créée, donc qu'un `demande_id` a
  // été rendu. Si ce n'est pas le cas — forme de retour changée, `data` vide, colonne
  // renommée —, le `if` ci-dessous sauterait la notification SANS UNE LIGNE DE JOURNAL, et
  // la demande créée en base ne serait signalée à personne : exactement le mode de
  // défaillance que le commentaire du `if` déclare vouloir empêcher. On ne lève pas et on
  // ne retourne pas d'erreur — la conversion est acquise en base et refuser ici la ferait
  // paraître échouée —, mais le silence, lui, n'est pas acceptable.
  if (chemin === 'fiche_en_attente' && !demandeId) {
    console.error('convertirParticipant : chemin 1 sans demande_id — notification impossible', { participantId })
  }

  if (demandeId) {
    // Chemin 1 uniquement. La notification est HORS de la transaction, comme
    // `creerDemandeSuivi` (2b) : une notification manquée ne doit pas faire échouer une
    // conversion déjà acquise en base — on journalise bruyamment plutôt que de lever
    // (`notifierAdministrateurs` le fait déjà elle-même).
    //
    // `demandeId` est OBLIGATOIRE : sans lui, `demande_id` resterait NULL en base, et la
    // cloche des administrateurs garderait indéfiniment un non-lu que plus aucun geste ne
    // peut éteindre (migration 20260815240000).
    //
    // ⚠️ CETTE NOTIFICATION ATTEINT TOUS LES COMPTES ADMINISTRATEURS ACTIFS, LE COMPTE
    // RACINE COMPRIS. Toute suite de tests qui emprunte le chemin 1 DOIT nettoyer les
    // notifications par `demande_id` — on peut polluer le compte racine sans jamais le
    // toucher.
    await notifierAdministrateurs({
      type: 'nouvelle_demande',
      titre: 'Participant externe converti, à valider',
      corps: `${adminProfil.nomAffichage} a converti un participant externe en fiche à valider.`,
      lien: '/demandes',
      demandeId,
    })
  }

  revalidatePath('/evenements/a-traiter')
  revalidatePath('/demandes')
  // Une conversion fait apparaître l'historique de séminaire du converti sur sa fiche
  // (seconde branche de la vue, D70).
  revalidatePath('/membres/[id]', 'page')
  // MINEUR CORRIGÉ (ronde du 2026-08-14, I3) : la fiche de CHAQUE évènement où ce
  // participant a une participation affiche `externeConvertiEnMembreId` (` · converti`,
  // `SectionParticipants`/`LigneParticipant`) — sans cette revalidation, un modérateur qui
  // garderait la fiche d'évènement ouverte dans un autre onglet continuerait d'y voir la
  // ligne comme non convertie jusqu'à sa prochaine navigation. Le participant pouvant avoir
  // participé à PLUSIEURS évènements, `'page'` invalide la route dynamique entière — même
  // motif que la ligne ci-dessus pour `/membres/[id]`, pas un chemin unique qu'il faudrait
  // reconstruire depuis `demandeId` ou `participantId`.
  revalidatePath('/evenements/[id]', 'page')
  return { erreur: null }
}

/**
 * Classe un participant sans suite, avec motif (D55, D61, D62).
 *
 * D55 — ADMINISTRATEUR SEUL, comme la conversion : ce sont les DEUX SEULES façons de vider
 * la liste, et en ouvrir une au modérateur lui permettrait de vider la liste de travail de
 * l'administrateur sans convertir personne.
 */
export async function classerParticipant(
  _etat: EtatConversion,
  donnees: FormData,
): Promise<EtatConversion> {
  const adminProfil = await exigerAdministrateur()

  const participantId = champOuNull(donnees, 'participantId')
  if (!participantId) {
    console.error('classerParticipant : identifiant du participant manquant')
    return { erreur: MESSAGE_ECHEC_CLASSEMENT }
  }

  const motif = String(donnees.get('motif') ?? '')
  // Moitié applicative de `participants_externes_classement_coherent` : nomme la cause
  // AVANT d'écrire, plutôt que de laisser remonter un 23514 opaque.
  if (!motifClassementValide(motif)) {
    return { erreur: MESSAGE_MOTIF_OBLIGATOIRE_CLASSEMENT }
  }

  const { error } = await clientAdmin().rpc('classer_participant_externe', {
    p_participant: participantId,
    p_motif: motif,
    p_par: adminProfil.id,
  })

  if (error) {
    console.error('classerParticipant : échec RPC classer_participant_externe', {
      participantId,
      code: error.code,
      details: error.details,
      message: error.message,
    })
    if (error.details === DETAIL_MOTIF_VIDE) {
      return { erreur: MESSAGE_MOTIF_OBLIGATOIRE_CLASSEMENT }
    }
    if (error.details === DETAIL_PARTICIPANT_INCONNU) {
      return { erreur: MESSAGE_PARTICIPANT_INTROUVABLE }
    }
    if (error.details === DETAIL_PARTICIPANT_DEJA_CONVERTI) {
      return { erreur: MESSAGE_PARTICIPANT_DEJA_CONVERTI }
    }
    if (error.details === DETAIL_CLASSEMENT_DEFINITIF) {
      return { erreur: MESSAGE_CLASSEMENT_DEFINITIF }
    }
    return { erreur: MESSAGE_ECHEC_CLASSEMENT }
  }

  revalidatePath('/evenements/a-traiter')
  return { erreur: null }
}
