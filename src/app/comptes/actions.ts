'use server'

import { revalidatePath } from 'next/cache'
import { IdentifiantInvalideError, identifiantVersEmail, normaliserIdentifiant } from '@/lib/domaine/identifiant'
import { tirerChaineLisible } from '@/lib/domaine/tirage'
import { estDernierAdministrateurActif } from '@/lib/donnees/comptes'
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
  MESSAGE_ECHEC_SUPPRESSION,
  MESSAGE_FICHE_DEJA_LIEE,
  MESSAGE_IDENTIFIANT_PRIS,
  MESSAGE_RACINE_INDESTRUCTIBLE,
  MESSAGE_RACINE_SANS_FICHE,
  MESSAGE_SUPPRESSION_DE_SOI,
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
// confusion à l'oral coûterait un compte inaccessible. Tirage partagé avec le code
// d'inscription (D38, `src/lib/domaine/tirage.ts`) : un seul mécanisme à maintenir.
const LONGUEUR_MDP_TEMPORAIRE = 14

function motDePasseTemporaire(): string {
  return tirerChaineLisible(LONGUEUR_MDP_TEMPORAIRE)
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
    // Phase 8, D154. La passerelle n'a plus qu'UNE signature, à quatre paramètres : omettre
    // celui-ci ne retomberait pas sur un défaut, PostgREST refuserait l'appel (PGRST202).
    // C'est voulu — une case cochée sans effet serait pire qu'un échec visible.
    p_leader: donnees.get('leader') === 'on',
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

/**
 * Supprime DÉFINITIVEMENT un compte (phase 8, D159).
 *
 * ═══ ELLE SUPPRIME LE COMPTE D'AUTHENTIFICATION, JAMAIS `public.profils` DIRECTEMENT ═══
 * `profils.id` référence `auth.users` en `on delete cascade` : la suppression cascade vers le
 * profil et déclenche `profils_refuser_suppression` DANS LA MÊME TRANSACTION — un refus
 * annule donc les deux, sans compensation applicative à écrire.
 *
 * Faire l'inverse (`delete from public.profils`) laisserait un compte d'authentification
 * ORPHELIN, capable de se connecter sans profil. Ce n'est pas une hypothèse : un balayage de
 * la phase 7 en a trouvé un en base, créé le 2026-08-13. NE JAMAIS ÉCRIRE CE `delete`.
 *
 * ═══ LES CONTRÔLES AMONT EXPLIQUENT, LE DÉCLENCHEUR PROTÈGE ═══
 * Les marqueurs Postgres NE TRAVERSENT PAS GoTrue : `error.details` n'est pas exposé par
 * l'API d'administration. Sans ces contrôles amont, tout refus s'afficherait comme un échec
 * générique. Ils ne sont pas la barrière : une rétrogradation concurrente entre la lecture et
 * la suppression passerait ici et serait arrêtée en base, avec le message générique — partage
 * assumé, identique à celui d'`archiverMembre`.
 *
 * ═══ CE QUI N'EST PAS SUPPRIMÉ ═══
 * La FICHE MEMBRE liée (D161) : compte et fiche sont deux objets distincts, et les confondre
 * effacerait une personne du suivi pour une erreur de compte. Les DEMANDES non plus (D157) —
 * elles perdent leur auteur mais gardent son nom. Les NOTIFICATIONS, elles, disparaissent
 * (D162) : elles lui étaient adressées et n'ont aucun sens sans destinataire. La confirmation
 * de l'écran énonce ces deux dernières conséquences.
 */
export async function supprimerCompte(donnees: FormData): Promise<void> {
  const profil = await exigerAdministrateur()

  const profilId = String(donnees.get('profilId') ?? '')
  if (profilId.length === 0) {
    console.error('supprimerCompte : identifiant de compte manquant dans le formulaire')
    throw new Error(MESSAGE_ECHEC_SUPPRESSION)
  }

  // D160 — GARDE D'ACTION, PAS BARRIÈRE DE BASE. Le déclencheur ne peut pas voir qui
  // supprime : derrière la clé de service, `auth.uid()` vaut `null`. Voir
  // MESSAGE_SUPPRESSION_DE_SOI pour ce que cela implique.
  if (profilId === profil.id) {
    throw new Error(MESSAGE_SUPPRESSION_DE_SOI)
  }

  const { data: cible, error: erreurCible } = await clientAdmin()
    .from('profils')
    .select('est_racine')
    .eq('id', profilId)
    .maybeSingle()
  if (erreurCible) {
    console.error('supprimerCompte : lecture du compte impossible', {
      profilId,
      message: erreurCible.message,
    })
    throw new Error(MESSAGE_ECHEC_SUPPRESSION)
  }
  if (!cible) {
    throw new Error(MESSAGE_COMPTE_INCONNU)
  }
  if (cible.est_racine) {
    throw new Error(MESSAGE_RACINE_INDESTRUCTIBLE)
  }
  if (await estDernierAdministrateurActif(profilId)) {
    throw new Error(MESSAGE_DERNIER_ADMINISTRATEUR)
  }

  const { error } = await clientAdmin().auth.admin.deleteUser(profilId)
  if (error) {
    // `error.details` N'EXISTE PAS ICI : GoTrue n'expose pas le diagnostic Postgres. On
    // journalise ce qu'on a, et l'écran reçoit le message générique — c'est précisément
    // pourquoi les contrôles amont ci-dessus existent, et pourquoi on ne prétend nulle part
    // discriminer sur un marqueur qu'on ne peut pas lire.
    console.error('supprimerCompte : échec de la suppression du compte auth', {
      profilId,
      code: error.code,
      status: error.status,
      message: error.message,
    })
    throw new Error(MESSAGE_ECHEC_SUPPRESSION)
  }

  revalidatePath('/comptes')
}
