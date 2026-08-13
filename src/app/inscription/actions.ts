'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { LONGUEUR_MDP_MINIMALE } from '@/app/changer-mot-de-passe/constantes'
import {
  IdentifiantInvalideError,
  identifiantVersEmail,
  normaliserIdentifiant,
} from '@/lib/domaine/identifiant'
import { hacherCodeInscription } from '@/lib/domaine/token-inscription'
import { notifierAdministrateurs } from '@/lib/donnees/notifications'
import { clientAdmin } from '@/lib/supabase/admin'
import {
  MESSAGE_CHAMPS_OBLIGATOIRES,
  MESSAGE_ECHEC_INSCRIPTION,
  MESSAGE_IDENTIFIANT_PRIS,
  MESSAGE_MDP_TROP_COURT,
  messageErreurConsommation,
} from './messages'

export type EtatInscription = { erreur: string | null }

const CODE_AUTH_EMAIL_PRIS = 'email_exists'
const CODE_VIOLATION_UNICITE = '23505'

/**
 * Adresse de repli, employée UNIQUEMENT lorsque aucun en-tête d'adresse n'est
 * présent — c'est-à-dire en développement local sans proxy. Derrière Vercel,
 * `x-forwarded-for` est toujours posé par la plateforme : ce repli n'est jamais
 * atteint en production. S'il l'était, le plafond de D36 resterait actif mais
 * partagé par tous les appelants, ce qui serait à la fois inefficace contre un
 * attaquant et bloquant pour les autres — d'où la journalisation ci-dessous.
 */
const ADRESSE_REPLI_LOCALE = '0.0.0.0'

function champTexte(donnees: FormData, nom: string): string {
  const valeur = donnees.get(nom)
  return typeof valeur === 'string' ? valeur.trim() : ''
}

function champTexteOptionnel(donnees: FormData, nom: string): string | null {
  const valeur = champTexte(donnees, nom)
  return valeur.length > 0 ? valeur : null
}

/**
 * Adresse de l'appelant, lue côté SERVEUR uniquement (design 2b §5.4) — jamais
 * fournie par le client dans un champ de formulaire, qu'il pourrait forger. C'est
 * l'argument `p_adresse` de `consommer_token_inscription`, donc le SEAU du plafond
 * anti-force-brute de D34/D36 : une valeur constante ici mettrait tous les
 * visiteurs dans le même seau — inefficace contre un attaquant qui en a besoin d'un
 * seul, et bloquant pour tous les autres.
 *
 * `x-forwarded-for` porte l'adresse d'origine sur Vercel, où la plateforme
 * l'ÉCRASE : la valeur qu'un client tenterait d'y injecter n'atteint jamais ce
 * code en production. Elle peut porter une liste « client, proxy1, proxy2 » : le
 * premier segment est l'adresse d'origine (Vercel la place en tête).
 */
async function adresseAppelant(): Promise<string> {
  const listeHeaders = await headers()
  const brut = listeHeaders.get('x-forwarded-for')
  // Le segment vide est traité comme une absence : `p_adresse` est de type `inet`,
  // une chaîne vide y produirait un 22P02 (panne technique) au lieu d'un comptage.
  const premier = brut?.split(',')[0]?.trim()
  if (!premier) {
    console.error(
      "sInscrire : aucun en-tête x-forwarded-for — repli sur une adresse partagée, le plafond anti-force-brute n'est pas discriminant sur cet appel",
    )
    return ADRESSE_REPLI_LOCALE
  }
  return premier
}

/**
 * L'UNIQUE Server Action atteignable sans session (design 2b §6, §9). AUCUN garde
 * de `src/lib/securite/garde.ts` en tête : il n'existe aucune session à ce stade,
 * exception unique et documentée du projet.
 *
 * NI LE CODE EN CLAIR NI LE MOT DE PASSE ne sont journalisés, renvoyés ou stockés :
 * le code ne sort d'ici que sous forme de hachage SHA-256 (D25), le mot de passe
 * n'est transmis qu'à Supabase Auth. Aucun `console.*` de ce fichier ne doit jamais
 * en recevoir un.
 */
export async function sInscrire(
  _etat: EtatInscription,
  donnees: FormData,
): Promise<EtatInscription> {
  const code = champTexte(donnees, 'code')
  const identifiantBrut = champTexte(donnees, 'identifiant')
  const motDePasse = String(donnees.get('motDePasse') ?? '')
  const nom = champTexte(donnees, 'nom')
  const prenom = champTexte(donnees, 'prenom')
  const telephone = champTexteOptionnel(donnees, 'telephone')
  const ville = champTexteOptionnel(donnees, 'ville')
  const antenneId = champTexteOptionnel(donnees, 'antenneId')

  if (
    code.length === 0 ||
    identifiantBrut.length === 0 ||
    motDePasse.length === 0 ||
    nom.length === 0 ||
    prenom.length === 0
  ) {
    return { erreur: MESSAGE_CHAMPS_OBLIGATOIRES }
  }

  // D39 : même règle que le changement de mot de passe volontaire. Contrôle EN
  // AMONT — confort seulement, Supabase Auth impose de toute façon sa propre
  // règle minimale à la création du compte, qui reste décisive (design 2b §7.1).
  if (motDePasse.length < LONGUEUR_MDP_MINIMALE) {
    return { erreur: MESSAGE_MDP_TROP_COURT }
  }

  let identifiant: string
  try {
    identifiant = normaliserIdentifiant(identifiantBrut)
  } catch (erreur) {
    if (erreur instanceof IdentifiantInvalideError) {
      return { erreur: erreur.message }
    }
    throw erreur
  }

  const adresse = await adresseAppelant()
  const codeHash = hacherCodeInscription(code)
  const admin = clientAdmin()

  const { data: resultat, error: erreurConsommation } = await admin.rpc(
    'consommer_token_inscription',
    { p_code_hash: codeHash, p_adresse: adresse },
  )

  // ICI, `error` NE PORTE JAMAIS un refus métier (migration 20260815160000, voir
  // son en-tête) : `consommer_token_inscription` rend un STATUT
  // (`'ok'` | `'invalide'` | `'trop_de_tentatives'`) plutôt que de lever, pour
  // que l'insertion de la tentative survive au refus. `error` non nul ici signale
  // donc une VRAIE panne technique (réseau, bug), pas un code invalide.
  if (erreurConsommation || !resultat || resultat.length === 0) {
    console.error(
      'sInscrire : appel de consommer_token_inscription en échec (panne technique)',
      { code: erreurConsommation?.code, message: erreurConsommation?.message },
    )
    return { erreur: MESSAGE_ECHEC_INSCRIPTION }
  }

  // Forme rendue par `returns table (statut public.statut_consommation_token,
  // token_id uuid, mode public.mode_token, membre_id uuid)` (migration
  // 20260815160000) : contrôle de forme, pas décoration — `rpc()` rend `any`
  // faute de types `Database` générés (piège connu du projet). Sans ce contrôle,
  // une colonne renommée produirait des `undefined` silencieux plutôt qu'un
  // échec visible.
  const ligne = resultat[0] as {
    statut?: unknown
    token_id?: unknown
    mode?: unknown
    membre_id?: unknown
  }
  if (
    ligne.statut !== 'ok' &&
    ligne.statut !== 'invalide' &&
    ligne.statut !== 'trop_de_tentatives'
  ) {
    console.error('sInscrire : forme inattendue rendue par consommer_token_inscription', {
      ligne,
    })
    return { erreur: MESSAGE_ECHEC_INSCRIPTION }
  }

  if (ligne.statut !== 'ok') {
    // D30 : le MESSAGE affiché est rigoureusement le même pour `invalide` et
    // `trop_de_tentatives` (voir `messageErreurConsommation`). L'indiscernabilité
    // exigée par D30 porte sur ce que voit l'UTILISATEUR, pas sur ce que reçoit
    // notre propre serveur : rien n'empêche de journaliser les deux causes
    // séparément ici, ce qui est précieux au diagnostic — mais `ligne.statut` ne
    // doit JAMAIS remonter au-delà de ce mappage uniforme.
    console.error('sInscrire : consommation refusée', { statut: ligne.statut })
    return { erreur: messageErreurConsommation(ligne.statut) }
  }

  // statut === 'ok' : contrôle de forme sur token_id/mode, même raison qu'au-dessus.
  if (
    typeof ligne.token_id !== 'string' ||
    (ligne.mode !== 'nominatif' && ligne.mode !== 'generique')
  ) {
    console.error(
      'sInscrire : forme inattendue rendue par consommer_token_inscription (statut ok)',
      { ligne },
    )
    // Le token VIENT D'ÊTRE CONSOMMÉ : sans relâche il serait perdu pour toujours
    // (D27). On ne peut la tenter que si l'identifiant rendu est exploitable — s'il
    // ne l'est pas, la perte est journalisée plutôt que masquée par un appel qui
    // n'aurait aucune chance d'aboutir.
    if (typeof ligne.token_id === 'string') {
      const { error: erreurRelache } = await admin.rpc('relacher_token_inscription', {
        p_token_id: ligne.token_id,
      })
      if (erreurRelache) {
        console.error('sInscrire : échec de la relâche du token après forme inattendue', {
          tokenId: ligne.token_id,
          message: erreurRelache.message,
        })
      }
    } else {
      console.error(
        'sInscrire : token consommé mais NON relâchable (token_id inexploitable) — intervention manuelle requise',
      )
    }
    return { erreur: MESSAGE_ECHEC_INSCRIPTION }
  }
  const tokenId = ligne.token_id
  const mode = ligne.mode
  const membreIdToken = (ligne.membre_id as string | null) ?? null

  const { data: compteCree, error: erreurCompte } = await admin.auth.admin.createUser({
    email: identifiantVersEmail(identifiant),
    password: motDePasse,
    email_confirm: true,
  })

  if (erreurCompte || !compteCree.user) {
    console.error('sInscrire : échec de la création du compte', {
      identifiant,
      code: erreurCompte?.code,
      status: erreurCompte?.status,
      message: erreurCompte?.message,
    })
    // D27 : le token est RELÂCHÉ, jamais laissé consommé sans compte au-delà de
    // cette fenêtre. La fenêtre résiduelle assumée par D27 (interruption entre la
    // consommation et cette relâche) reste possible mais jamais un double usage.
    const { error: erreurRelache } = await admin.rpc('relacher_token_inscription', {
      p_token_id: tokenId,
    })
    if (erreurRelache) {
      console.error(
        'sInscrire : échec de la relâche du token après échec de création du compte',
        { tokenId, message: erreurRelache.message },
      )
    }
    return {
      erreur:
        erreurCompte?.code === CODE_AUTH_EMAIL_PRIS
          ? MESSAGE_IDENTIFIANT_PRIS
          : MESSAGE_ECHEC_INSCRIPTION,
    }
  }

  const { error: erreurProfil } = await admin
    .from('profils')
    .insert({ id: compteCree.user.id, identifiant, nom_affichage: `${prenom} ${nom}` })

  if (erreurProfil) {
    const { error: erreurNettoyage } = await admin.auth.admin.deleteUser(compteCree.user.id)
    const { error: erreurRelache } = await admin.rpc('relacher_token_inscription', {
      p_token_id: tokenId,
    })
    console.error("sInscrire : échec de l'insertion du profil, nettoyage tenté", {
      identifiant,
      code: erreurProfil.code,
      details: erreurProfil.details,
      message: erreurProfil.message,
      nettoyageCompte: erreurNettoyage ? `ÉCHOUÉ : ${erreurNettoyage.message}` : 'compte auth supprimé',
      nettoyageToken: erreurRelache ? `ÉCHOUÉ : ${erreurRelache.message}` : 'token relâché',
    })
    return {
      erreur:
        erreurProfil.code === CODE_VIOLATION_UNICITE
          ? MESSAGE_IDENTIFIANT_PRIS
          : MESSAGE_ECHEC_INSCRIPTION,
    }
  }

  // Écriture SIMPLE, sans concurrence à fermer (design 2b §7.1) : un seul flux
  // touche cette ligne à ce stade, le compte venant d'être créé par CE flux.
  const { error: erreurMarquage } = await admin
    .from('tokens_inscription')
    .update({ utilise_par_profil_id: compteCree.user.id })
    .eq('id', tokenId)
  if (erreurMarquage) {
    // Non fatal pour l'inscrit : le compte existe et fonctionne. Seule la trace
    // d'audit « qui a utilisé ce token » resterait incomplète — journalisé pour
    // qu'un administrateur puisse la compléter à la main si besoin.
    console.error('sInscrire : échec du marquage utilise_par_profil_id', {
      tokenId,
      profilId: compteCree.user.id,
      message: erreurMarquage.message,
    })
  }

  if (mode === 'nominatif') {
    // SÉCURITÉ, pas économie d'écriture (design 2b §7.1) : nom, prénom, téléphone,
    // ville et antenne soumis dans le formulaire sont IGNORÉS — la fiche existe
    // déjà et ses valeurs ne doivent jamais être écrasées par une saisie publique
    // non vérifiée.
    const { error: erreurLiaison } = await admin
      .from('profils')
      .update({ membre_id: membreIdToken })
      .eq('id', compteCree.user.id)
    if (erreurLiaison) {
      console.error('sInscrire : échec de la liaison nominative', {
        profilId: compteCree.user.id,
        membreId: membreIdToken,
        message: erreurLiaison.message,
      })
    }
  } else {
    const { data: fiche, error: erreurFiche } = await admin
      .from('membres')
      .insert({ nom, prenom, telephone, ville, antenne_id: antenneId, etat: 'en_attente' })
      .select('id')
      .single()

    if (erreurFiche || !fiche) {
      console.error('sInscrire : échec de la création de la fiche en_attente', {
        profilId: compteCree.user.id,
        code: erreurFiche?.code,
        message: erreurFiche?.message,
      })
      // Le compte existe déjà et son mot de passe est déjà choisi : on ne
      // l'annule PAS pour un échec sur la fiche. La personne pourra se connecter ;
      // un administrateur devra créer la demande manuellement.
      return { erreur: MESSAGE_ECHEC_INSCRIPTION }
    }

    const { data: demande, error: erreurDemande } = await admin
      .from('demandes_membre')
      .insert({
        origine: 'auto_inscription',
        demandeur_profil_id: compteCree.user.id,
        membre_id: fiche.id,
        etat: 'en_attente',
      })
      .select('id')
      .single()

    if (erreurDemande || !demande) {
      console.error('sInscrire : échec de la création de la demande', {
        profilId: compteCree.user.id,
        ficheId: fiche.id,
        message: erreurDemande?.message,
      })
      return { erreur: MESSAGE_ECHEC_INSCRIPTION }
    }

    await notifierAdministrateurs({
      type: 'nouvelle_demande',
      titre: "Nouvelle demande d'inscription",
      corps: `${prenom} ${nom} s'est inscrit(e) par token générique.`,
      // NAVIGATION seule : la liste, pas la demande. Il n'existe pas de route
      // `/demandes/[id]` dans cette phase (migration 20260815240000).
      lien: '/demandes',
      // CORRÉLATION (migration 20260815240000) : ce que `annuler_demande_membre` et
      // `valider_demande_rattachement` cherchent pour marquer cette notification
      // lue. Sans lui, la cloche des administrateurs garderait un non-lu que plus
      // rien ne peut éteindre — silencieusement, sans aucune erreur.
      demandeId: demande.id,
    })
  }

  // PAS dans un try : `redirect()` lève une exception de contrôle que le projet
  // ne doit jamais avaler (contrainte globale, pitfall documenté).
  redirect('/connexion?inscrit=1')
}
