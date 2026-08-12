'use server'

import { revalidatePath } from 'next/cache'
import { IdentifiantInvalideError, identifiantVersEmail, normaliserIdentifiant } from '@/lib/domaine/identifiant'
import { exigerAdministrateur } from '@/lib/securite/garde'
import { clientAdmin } from '@/lib/supabase/admin'
import {
  MESSAGE_CHAMPS_OBLIGATOIRES,
  MESSAGE_COMPTE_INCONNU,
  MESSAGE_DERNIER_ADMINISTRATEUR,
  MESSAGE_ECHEC_ACTIVATION,
  MESSAGE_ECHEC_COMPTE,
  MESSAGE_ECHEC_LIAISON,
  MESSAGE_ECHEC_REINITIALISATION,
  MESSAGE_ECHEC_ROLES,
  MESSAGE_FICHE_DEJA_LIEE,
  MESSAGE_IDENTIFIANT_PRIS,
  MESSAGE_RACINE_SANS_FICHE,
} from './messages'

export type EtatCompte = {
  erreur: string | null
  identifiantCree: string | null
  motDePasseTemporaire: string | null
}

const CODE_VIOLATION_UNICITE = '23505'
const CODE_VIOLATION_CHECK = '23514'
// Code structuré renvoyé par GoTrue (Supabase Auth) pour un doublon d'email, vérifié
// par essai réel contre le projet : `admin.createUser` sur un email déjà pris renvoie
// `{ name: 'AuthApiError', status: 422, code: 'email_exists' }`. On discrimine sur ce
// code, jamais sur le texte du message (contrainte globale 5) : celui-ci pourrait
// changer entre versions de Supabase, ou être partagé par une tout autre erreur.
const CODE_AUTH_EMAIL_PRIS = 'email_exists'

// Sans 0/O ni 1/l/I : ce mot de passe se dicte de vive voix (spec §5.4), et une
// confusion à l'oral coûterait un compte inaccessible.
const ALPHABET_LISIBLE = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
const LONGUEUR_MDP_TEMPORAIRE = 14

function motDePasseTemporaire(): string {
  const seuil = Math.floor(0xffffffff / ALPHABET_LISIBLE.length) * ALPHABET_LISIBLE.length
  const caracteres: string[] = []
  const tampon = new Uint32Array(1)
  while (caracteres.length < LONGUEUR_MDP_TEMPORAIRE) {
    crypto.getRandomValues(tampon)
    // Rejet des valeurs qui déborderaient le dernier bloc complet de l'alphabet. Sans
    // lui, les premiers caractères seraient très légèrement plus probables. Le biais
    // serait minuscule — il n'y a simplement aucune raison de l'accepter.
    if (tampon[0] < seuil) {
      caracteres.push(ALPHABET_LISIBLE[tampon[0] % ALPHABET_LISIBLE.length])
    }
  }
  return caracteres.join('')
}

export async function creerCompte(_etat: EtatCompte, donnees: FormData): Promise<EtatCompte> {
  await exigerAdministrateur()

  const identifiantBrut = String(donnees.get('identifiant') ?? '').trim()
  const nomAffichage = String(donnees.get('nomAffichage') ?? '').trim()
  if (identifiantBrut.length === 0 || nomAffichage.length === 0) {
    return { erreur: MESSAGE_CHAMPS_OBLIGATOIRES, identifiantCree: null, motDePasseTemporaire: null }
  }

  let identifiant: string
  try {
    identifiant = normaliserIdentifiant(identifiantBrut)
  } catch (erreur) {
    if (erreur instanceof IdentifiantInvalideError) {
      return { erreur: erreur.message, identifiantCree: null, motDePasseTemporaire: null }
    }
    throw erreur
  }

  const supabase = clientAdmin()
  const motDePasse = motDePasseTemporaire()

  const { data: cree, error: erreurAuth } = await supabase.auth.admin.createUser({
    email: identifiantVersEmail(identifiant),
    password: motDePasse,
    email_confirm: true,
    // Le parcours forcé existe depuis la phase 0 : le middleware renvoie vers
    // /changer-mot-de-passe tant que ce drapeau est vrai.
    app_metadata: { doit_changer_mdp: true },
  })

  if (erreurAuth || !cree.user) {
    // Le mot de passe n'apparaît nulle part dans cette trace, et ne doit jamais y
    // apparaître.
    console.error('creerCompte : échec de la création du compte auth', {
      identifiant,
      code: erreurAuth?.code,
      status: erreurAuth?.status,
      message: erreurAuth?.message,
    })
    return {
      erreur: erreurAuth?.code === CODE_AUTH_EMAIL_PRIS ? MESSAGE_IDENTIFIANT_PRIS : MESSAGE_ECHEC_COMPTE,
      identifiantCree: null,
      motDePasseTemporaire: null,
    }
  }

  const { error: erreurProfil } = await supabase
    .from('profils')
    .insert({ id: cree.user.id, identifiant, nom_affichage: nomAffichage })

  if (erreurProfil) {
    // Nettoyage du compte auth orphelin : sans lui, l'identifiant resterait pris sans
    // qu'aucun profil ne le montre, et l'administrateur ne pourrait plus le recréer
    // sans intervention en base. Même précaution que `scripts/creer-compte-racine.ts`.
    const { error: erreurNettoyage } = await supabase.auth.admin.deleteUser(cree.user.id)
    console.error("creerCompte : échec de l'insertion du profil", {
      identifiant,
      code: erreurProfil.code,
      details: erreurProfil.details,
      message: erreurProfil.message,
      nettoyage: erreurNettoyage ? `ÉCHOUÉ : ${erreurNettoyage.message}` : 'compte auth supprimé',
    })
    return {
      erreur: erreurProfil.code === CODE_VIOLATION_UNICITE ? MESSAGE_IDENTIFIANT_PRIS : MESSAGE_ECHEC_COMPTE,
      identifiantCree: null,
      motDePasseTemporaire: null,
    }
  }

  revalidatePath('/comptes')
  // PAS de `redirect` : il effacerait l'état, donc le mot de passe temporaire, avant
  // que l'administrateur ait pu le lire. C'est sa seule occasion de le voir.
  return { erreur: null, identifiantCree: identifiant, motDePasseTemporaire: motDePasse }
}

export async function lierFiche(donnees: FormData): Promise<void> {
  await exigerAdministrateur()

  const profilId = String(donnees.get('profilId') ?? '')
  const membreIdBrut = String(donnees.get('membreId') ?? '')
  const membreId = membreIdBrut.length > 0 ? membreIdBrut : null

  if (profilId.length === 0) {
    console.error('lierFiche : identifiant de compte manquant dans le formulaire')
    throw new Error(MESSAGE_ECHEC_LIAISON)
  }

  const { data, error } = await clientAdmin()
    .from('profils')
    .update({ membre_id: membreId })
    .eq('id', profilId)
    .select('id')

  if (error) {
    console.error('lierFiche : échec de la liaison', {
      profilId,
      membreId,
      code: error.code,
      details: error.details,
      message: error.message,
    })
    // `membre_id` est UNIQUE : une fiche déjà liée ailleurs produit 23505. Une contrainte
    // CHECK interdit par ailleurs de lier une fiche au compte racine et produit 23514 —
    // on discrimine sur ce code, jamais sur un nom de contrainte ni sur le texte du
    // message (contrainte globale 5).
    if (error.code === CODE_VIOLATION_UNICITE) {
      throw new Error(MESSAGE_FICHE_DEJA_LIEE)
    }
    if (error.code === CODE_VIOLATION_CHECK) {
      throw new Error(MESSAGE_RACINE_SANS_FICHE)
    }
    throw new Error(MESSAGE_ECHEC_LIAISON)
  }
  if (!data || data.length === 0) {
    // Une mise à jour qui ne touche aucune ligne ne renvoie AUCUNE erreur : sans ce
    // contrôle, un identifiant forgé produirait un succès apparent.
    throw new Error(MESSAGE_ECHEC_LIAISON)
  }

  revalidatePath('/comptes')
}

const DETAIL_DERNIER_ADMINISTRATEUR = 'dernier_administrateur'
const DETAIL_COMPTE_INCONNU = 'compte_inconnu'

/**
 * Rôles d'un compte. Passe par la passerelle sérialisée : la protection du dernier
 * administrateur est un lire-puis-écrire, et deux administrateurs se rétrogradant
 * simultanément passeraient tous les deux sans le verrou (voir la migration
 * 20260814130000). Ne JAMAIS écrire directement dans `roles_profil`.
 */
export async function definirRoles(donnees: FormData): Promise<void> {
  await exigerAdministrateur()

  const profilId = String(donnees.get('profilId') ?? '')
  if (profilId.length === 0) {
    console.error('definirRoles : identifiant de compte manquant dans le formulaire')
    throw new Error(MESSAGE_ECHEC_ROLES)
  }

  const { error } = await clientAdmin().rpc('definir_roles', {
    p_profil: profilId,
    p_administrateur: donnees.get('administrateur') === 'on',
    p_moderateur: donnees.get('moderateur') === 'on',
  })

  if (error) {
    console.error('definirRoles : échec RPC definir_roles', {
      profilId,
      code: error.code,
      details: error.details,
      message: error.message,
    })
    if (error.details === DETAIL_DERNIER_ADMINISTRATEUR) {
      throw new Error(MESSAGE_DERNIER_ADMINISTRATEUR)
    }
    if (error.details === DETAIL_COMPTE_INCONNU) {
      throw new Error(MESSAGE_COMPTE_INCONNU)
    }
    throw new Error(MESSAGE_ECHEC_ROLES)
  }

  revalidatePath('/comptes')
}

export async function basculerActivation(donnees: FormData): Promise<void> {
  await exigerAdministrateur()

  const profilId = String(donnees.get('profilId') ?? '')
  const actif = donnees.get('actif') === '1'
  if (profilId.length === 0) {
    console.error('basculerActivation : identifiant de compte manquant dans le formulaire')
    throw new Error(MESSAGE_ECHEC_ACTIVATION)
  }

  const { error } = await clientAdmin().rpc('definir_actif_compte', {
    p_profil: profilId,
    p_actif: actif,
  })

  if (error) {
    console.error('basculerActivation : échec RPC definir_actif_compte', {
      profilId,
      actif,
      code: error.code,
      details: error.details,
      message: error.message,
    })
    if (error.details === DETAIL_DERNIER_ADMINISTRATEUR) {
      throw new Error(MESSAGE_DERNIER_ADMINISTRATEUR)
    }
    throw new Error(MESSAGE_ECHEC_ACTIVATION)
  }

  revalidatePath('/comptes')
}

/**
 * Réinitialisation par un administrateur (spec §5.4) : un mot de passe temporaire est
 * tiré, affiché UNE SEULE FOIS, et `doit_changer_mdp` est reposé — la personne devra en
 * choisir un autre à sa connexion suivante.
 *
 * Même précaution que `creerCompte` : rien ne redirige, sinon le mot de passe
 * disparaîtrait avant d'avoir été lu, et il n'apparaît dans aucune trace.
 */
export async function reinitialiserMotDePasse(
  _etat: EtatCompte,
  donnees: FormData,
): Promise<EtatCompte> {
  await exigerAdministrateur()

  const profilId = String(donnees.get('profilId') ?? '')
  const identifiant = String(donnees.get('identifiant') ?? '')
  if (profilId.length === 0) {
    return { erreur: MESSAGE_ECHEC_REINITIALISATION, identifiantCree: null, motDePasseTemporaire: null }
  }

  const motDePasse = motDePasseTemporaire()
  const { error } = await clientAdmin().auth.admin.updateUserById(profilId, {
    password: motDePasse,
    app_metadata: { doit_changer_mdp: true },
  })

  if (error) {
    console.error('reinitialiserMotDePasse : échec', { profilId, message: error.message })
    return { erreur: MESSAGE_ECHEC_REINITIALISATION, identifiantCree: null, motDePasseTemporaire: null }
  }

  revalidatePath('/comptes')
  return { erreur: null, identifiantCree: identifiant, motDePasseTemporaire: motDePasse }
}
