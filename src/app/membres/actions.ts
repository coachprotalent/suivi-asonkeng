'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import {
  FicheMembreInvalideError,
  ficheMembreDepuisFormData,
  ficheMembreVersColonnes,
  type EtatMembre,
} from '@/lib/domaine/membre'
import {
  StatutInvalideError,
  lignesStatutsDepuisFormData,
  statutsIncompatibles,
  type LigneStatutSaisie,
} from '@/lib/domaine/statut'
import { cheminArbre, disciplesDe } from '@/lib/donnees/arbre'
import { compteLieEstDernierAdministrateurActif } from '@/lib/donnees/comptes'
import { membreParId } from '@/lib/donnees/membres'
import { listerCatalogue } from '@/lib/donnees/statuts'
import { exigerAdministrateur } from '@/lib/securite/garde'
import { clientAdmin } from '@/lib/supabase/admin'
import {
  MESSAGE_DIRIGEANT_INCONNU,
  MESSAGE_FAISEUR_ARCHIVE,
  MESSAGE_FAISEUR_INCONNU,
  messageCycle,
} from './[id]/arbre/messages'
import { MESSAGE_STATUT_INCONNU } from './[id]/statuts/messages'
import {
  MESSAGE_ECHEC_ENREGISTREMENT,
  MESSAGE_FAISEUR_NON_ACTIF,
  MESSAGE_STATUTS_EXCLUSIFS_PASSERELLE,
  messageStatutsIncompatibles,
} from './messages'

const DETAIL_DISCIPLES_A_REAFFECTER = 'disciples_a_reaffecter'
const DETAIL_FAISEUR_DE_DISCIPLE_ARCHIVE = 'faiseur_de_disciple_archive'
// Même marqueur que public.definir_roles / public.definir_actif_compte (migration
// 20260814130000) : c'est le même fait — plus aucun administrateur actif ne
// subsisterait — découvert par une autre porte (D24, migration 20260814160000).
const DETAIL_DERNIER_ADMINISTRATEUR = 'dernier_administrateur'

// Marqueurs RÉUTILISÉS, jamais réinventés — conséquence directe de D82 : la passerelle
// `creer_membre_enrichi` COMPOSE `public.definir_arbre` et `public.attribuer_statut`, donc
// elle rend LEURS marqueurs, avec LEUR sens. La phase 5 n'ajoute que DEUX marqueurs :
// `statuts_exclusifs_incompatibles` (posé par la passerelle elle-même) et
// `faiseur_de_disciple_inactif` (posé par `public.definir_arbre` et par le déclencheur
// `membres_faiseur_de_disciple_archive` quand le faiseur visé existe mais n'est ni actif
// ni archivé). Tous les autres sont préexistants.
const DETAIL_STATUTS_EXCLUSIFS_INCOMPATIBLES = 'statuts_exclusifs_incompatibles'
const DETAIL_MEMBRE_INCONNU = 'membre_inconnu'
const DETAIL_STATUT_INCONNU = 'statut_inconnu'
const DETAIL_FAISEUR_INCONNU = 'faiseur_inconnu'
// `DETAIL_FAISEUR_DE_DISCIPLE_ARCHIVE` existe DÉJÀ, juste au-dessus, et vaut
// 'faiseur_de_disciple_archive' : on la réutilise, on n'en déclare pas une seconde sous un
// autre nom. Celle-ci est son voisin, et le voisinage est le point : deux marqueurs, deux
// faits DIFFÉRENTS, deux messages différents — « archivé » et « pas actif » ne se
// remplacent pas l'un l'autre. Les confondre afficherait « ce faiseur est archivé » à
// propos d'une fiche en attente de validation.
const DETAIL_FAISEUR_NON_ACTIF = 'faiseur_de_disciple_inactif'
const DETAIL_DIRIGEANT_INCONNU = 'dirigeant_inconnu'
const DETAIL_CYCLE = 'cycle_faiseur_de_disciple'

function champOuNull(donnees: FormData, champ: string): string | null {
  const valeur = donnees.get(champ)
  return typeof valeur === 'string' && valeur.length > 0 ? valeur : null
}

export type EtatFormulaireMembre = { erreur: string | null }

/**
 * Crée une fiche membre, la place dans l'arbre et lui attribue ses statuts — EN UNE SEULE
 * TRANSACTION (D81).
 *
 * REMPLACE `creerMembre` (D87) : un seul chemin d'écriture pour la création d'une fiche
 * par un administrateur. Deux chemins pour un même geste, c'est l'un des deux qui cesse
 * d'être exercé et qui dérive.
 *
 * ═══ LA GARANTIE TIENT TANT QUE L'APPEL RESTE UN UNIQUE `rpc`. ═══
 * Scinder un jour cet appel en deux ferait disparaître l'atomicité EN SILENCE : deux
 * transactions séparées, chacune capable de réussir sans l'autre, et rien dans le code ne
 * l'empêcherait mécaniquement. Même discipline que D65 (conversion d'un participant) et
 * que le §7.2 de la 2b.
 *
 * ═══ LE DIAGNOSTIC SE JOURNALISE ICI, ET NULLE PART AILLEURS. ═══
 * Postgres n'a pas de transaction autonome : AUCUNE trace écrite depuis l'intérieur de
 * `creer_membre_enrichi` ne survivrait à son échec. Le projet l'a déjà payé (D43, 2b) —
 * `consommer_token_inscription` insérait une tentative puis levait, l'exception annulait
 * toute la transaction, l'insertion comprise, et le plafond anti-force-brute était
 * ENTIÈREMENT INOPÉRANT. D'où le `console.error` systématique ci-dessous, avec `code`,
 * `details` et `message`.
 *
 * LES TROIS ENRICHISSEMENTS SONT FACULTATIFS ET INDÉPENDANTS (D86). Une création sans
 * aucun enrichissement produit EXACTEMENT ce que `creerMembre` produisait : fiche `actif`,
 * arbre nul, aucun statut, aucune ligne de journal. Un dirigeant sans faiseur de disciple
 * est légitime (§4.2 le prévoit) ; des statuts sans place dans l'arbre aussi.
 *
 * LE GARDE EST `exigerAdministrateur`, EN PREMIÈRE INSTRUCTION, ET IL NE DESCEND PAS À
 * `exigerAutoriteSur` MALGRÉ LES ÉCRITURES DE STATUTS (D90). La création est réservée à
 * l'administrateur (§5.2) et un administrateur a autorité partout : les deux gardes
 * coïncident ici. C'EST UNE COÏNCIDENCE, PAS UNE CONSTRUCTION — voir le
 * `comment on function` de la passerelle.
 */
export async function creerMembreEnrichi(
  _etat: EtatFormulaireMembre,
  donnees: FormData,
): Promise<EtatFormulaireMembre> {
  const profil = await exigerAdministrateur()

  let fiche
  let lignesStatuts: LigneStatutSaisie[]
  try {
    fiche = ficheMembreDepuisFormData(donnees)
    lignesStatuts = lignesStatutsDepuisFormData(donnees)
  } catch (erreur) {
    if (erreur instanceof FicheMembreInvalideError || erreur instanceof StatutInvalideError) {
      // Les deux portent déjà un message précis et actionnable : on le relaie tel quel.
      return { erreur: erreur.message }
    }
    console.error('creerMembreEnrichi : échec inattendu de la lecture du formulaire', { erreur })
    return { erreur: MESSAGE_ECHEC_ENREGISTREMENT }
  }

  // CONTRÔLE AMONT DU COUPLE EXCLUSIF (D84) : il EXPLIQUE, en nommant les deux statuts.
  // La passerelle PROTÈGE, en relisant les groupes EN BASE. Les deux existent, et aucun
  // ne remplace l'autre : `listerCatalogue` est non bornée, donc ce contrôle-ci peut être
  // trompé par une troncature — c'est précisément pourquoi `statutsIncompatibles` ÉCHOUE
  // FERMÉ sur un identifiant absent du catalogue qu'on lui donne, au lieu de conclure
  // « aucun conflit ».
  if (lignesStatuts.length > 0) {
    let catalogue
    try {
      // `listerCatalogue(true)` — INACTIFS COMPRIS, et ce n'est pas un détail.
      // `listerCatalogue()` filtre `actif === true`. Un statut RÉEL mais DÉSACTIVÉ,
      // soumis par un onglet resté ouvert ou par un appel forgé, serait alors absent du
      // catalogue passé à `statutsIncompatibles`, qui échoue fermé : l'utilisateur lirait
      // « un statut sélectionné est introuvable dans le catalogue » là où la vérité est
      // « ce statut a été désactivé ». La passerelle, elle, ne filtre pas sur `st.actif`
      // et laisse `attribuer_statut` refuser avec `statut_inconnu`, dont le message dit
      // « inconnu OU désactivé ». On donne donc ici le catalogue COMPLET, pour que le
      // contrôle amont ne s'arroge pas un refus qui appartient à la passerelle.
      catalogue = await listerCatalogue(true)
    } catch (erreur) {
      console.error('creerMembreEnrichi : lecture du catalogue impossible', { erreur })
      return { erreur: MESSAGE_ECHEC_ENREGISTREMENT }
    }
    try {
      const couple = statutsIncompatibles(
        lignesStatuts.map((ligne) => ligne.statutId),
        catalogue,
      )
      if (couple) {
        return { erreur: messageStatutsIncompatibles(couple) }
      }
    } catch (erreur) {
      if (erreur instanceof StatutInvalideError) {
        return { erreur: erreur.message }
      }
      console.error("creerMembreEnrichi : échec inattendu du contrôle d'exclusivité", { erreur })
      return { erreur: MESSAGE_ECHEC_ENREGISTREMENT }
    }
  }

  const faiseurId = champOuNull(donnees, 'faiseurDeDiscipleId')
  const dirigeantId = champOuNull(donnees, 'dirigeantId')
  const dirigeantForce = donnees.get('dirigeantForce') === '1'

  // UN SEUL `rpc`, ET TOUS LES ARGUMENTS SONT NOMMÉS — jamais positionnels : une
  // permutation silencieuse entre deux paramètres de même type (`p_ville` et `p_pays`,
  // par exemple) est indétectable autrement.
  const { data, error } = await clientAdmin().rpc('creer_membre_enrichi', {
    p_nom: fiche.nom,
    p_prenom: fiche.prenom,
    p_telephone: fiche.telephone,
    p_email_contact: fiche.emailContact,
    p_ville: fiche.ville,
    p_pays: fiche.pays,
    p_antenne_id: fiche.antenneId,
    p_situation: fiche.situation,
    p_domaine_etude: fiche.domaineEtude,
    p_report_initial_ael: fiche.reportInitialAel,
    p_faiseur_de_disciple: faiseurId,
    p_dirigeant: dirigeantId,
    p_dirigeant_force: dirigeantForce,
    p_statuts: lignesStatuts.map((ligne) => ({
      statut_id: ligne.statutId,
      date_acquisition: ligne.dateAcquisition,
      note: ligne.note,
    })),
    p_par: profil.id,
  })

  if (error) {
    // Trace serveur SYSTÉMATIQUE, y compris pour les cas classifiés ci-dessous : c'est la
    // SEULE trace qui subsistera, la transaction ayant tout annulé côté base.
    console.error('creerMembreEnrichi : échec RPC creer_membre_enrichi', {
      faiseurId,
      dirigeantId,
      dirigeantForce,
      nombreStatuts: lignesStatuts.length,
      code: error.code,
      details: error.details,
      message: error.message,
    })

    // On discrimine sur `error.details` et `error.code`, JAMAIS sur la prose française.
    if (error.details === DETAIL_STATUTS_EXCLUSIFS_INCOMPATIBLES) {
      return { erreur: MESSAGE_STATUTS_EXCLUSIFS_PASSERELLE }
    }
    if (error.details === DETAIL_FAISEUR_INCONNU) {
      return { erreur: MESSAGE_FAISEUR_INCONNU }
    }
    // Le nom exact de la constante existante est `DETAIL_FAISEUR_DE_DISCIPLE_ARCHIVE`
    // (déclarée plus haut dans ce même fichier depuis la 1c) : il n'y a PAS de
    // `DETAIL_FAISEUR_ARCHIVE` dans ce module, et l'écrire ainsi ne compilerait pas.
    if (error.details === DETAIL_FAISEUR_DE_DISCIPLE_ARCHIVE) {
      return { erreur: MESSAGE_FAISEUR_ARCHIVE }
    }
    // Faiseur de disciple qui existe mais n'est NI actif NI archivé. Message DISTINCT du
    // précédent : dire « est archivé » d'une fiche en attente de validation serait une
    // phrase que le code ne tient pas.
    if (error.details === DETAIL_FAISEUR_NON_ACTIF) {
      return { erreur: MESSAGE_FAISEUR_NON_ACTIF }
    }
    if (error.details === DETAIL_DIRIGEANT_INCONNU) {
      return { erreur: MESSAGE_DIRIGEANT_INCONNU }
    }
    if (error.details === DETAIL_STATUT_INCONNU) {
      return { erreur: MESSAGE_STATUT_INCONNU }
    }
    // ═══ AUCUNE BRANCHE SUR LE CODE 23514 ICI, ET C'EST DÉLIBÉRÉ ═══
    // Une telle branche afficherait « ce membre porte déjà un statut du groupe exclusif ».
    // Pour cette cause, elle est MORTE : la passerelle refuse le couple exclusif avant
    // toute écriture, et la fiche vient de naître sans aucun statut — le déclencheur
    // `membre_statuts_exclusivite` ne peut pas lever. Pour une AUTRE cause, elle est bien
    // vivante et NUISIBLE : contrairement à `/membres/[id]/statuts`, ce chemin écrit aussi
    // `public.membres`, porteuse de SIX contraintes `check` (`membres_nom_non_vide`,
    // `membres_prenom_non_vide`, `membres_report_positif`,
    // `membres_domaine_reserve_etudiant`, `membres_pas_son_propre_fdd`,
    // `membres_pas_son_propre_dirigeant`), toutes en 23514. L'utilisateur lirait un message
    // sur les statuts pour un problème de colonne de fiche. On retombe donc sur
    // MESSAGE_ECHEC_ENREGISTREMENT, et le code réel reste JOURNALISÉ ci-dessus, là où il
    // sert au diagnostic.
    if (error.details === DETAIL_CYCLE) {
      // INATTEIGNABLE PAR CONSTRUCTION sur ce chemin : la fiche vient d'être insérée dans
      // la même transaction, elle n'a aucun descendant, aucun cycle ne peut se refermer
      // sur elle. Traité quand même — et c'est la bonne direction : ce qui « ne peut pas
      // arriver » et arrive doit produire un message juste, pas un message générique.
      //
      // `cheminArbre` LÈVE sur un échec de lecture (elle ne rend jamais `[]` en silence).
      // On l'enveloppe donc : sur cette branche déjà anormale, laisser une seconde panne
      // remonter en exception ferait perdre le refus MÉTIER qu'on est en train de rendre —
      // or une action RETOURNE son refus, elle ne le lève pas. `messageCycle([])` a déjà
      // son texte de repli, sans le chemin. Aucun `redirect()` dans ce `try` : il n'y en a
      // pas dans cette fonction avant sa dernière instruction.
      let chemin: Awaited<ReturnType<typeof cheminArbre>> = []
      if (faiseurId) {
        try {
          chemin = await cheminArbre(faiseurId)
        } catch (erreurChemin) {
          console.error('creerMembreEnrichi : lecture du chemin fautif impossible', {
            faiseurId,
            erreur: erreurChemin,
          })
        }
      }
      return { erreur: messageCycle(chemin) }
    }
    if (error.details === DETAIL_MEMBRE_INCONNU) {
      // Même remarque : `definir_arbre` ne peut pas ne pas trouver la fiche que la même
      // transaction vient d'insérer. Rangé avec l'inattendu, sans message propre.
      return { erreur: MESSAGE_ECHEC_ENREGISTREMENT }
    }
    return { erreur: MESSAGE_ECHEC_ENREGISTREMENT }
  }

  // `returns uuid` : supabase-js rend la valeur scalaire directement. Contrôle de forme et
  // non décoration — `rpc()` rend `any` faute de types `Database` générés, et un jour où
  // la signature changerait, `redirect(`/membres/undefined`)` mènerait à une page 404 en
  // annonçant un succès.
  const identifiant = typeof data === 'string' && data.length > 0 ? data : null
  if (!identifiant) {
    console.error('creerMembreEnrichi : identifiant absent de la réponse', { data })
    return { erreur: MESSAGE_ECHEC_ENREGISTREMENT }
  }

  revalidatePath('/membres')
  // PAS dans un `try` : `redirect()` lève une exception de contrôle Next.js, et c'est la
  // DERNIÈRE instruction. Vers la FICHE et non vers l'annuaire : on vient d'enrichir cette
  // personne, c'est son écran qui montre ce qui a été écrit.
  redirect(`/membres/${identifiant}`)
}

export async function modifierMembre(
  _etat: EtatFormulaireMembre,
  donnees: FormData,
): Promise<EtatFormulaireMembre> {
  await exigerAdministrateur()

  const id = donnees.get('id')
  if (typeof id !== 'string' || id.length === 0) {
    return { erreur: MESSAGE_ECHEC_ENREGISTREMENT }
  }

  let colonnes
  try {
    colonnes = ficheMembreVersColonnes(ficheMembreDepuisFormData(donnees))
  } catch (erreur) {
    return {
      erreur:
        erreur instanceof FicheMembreInvalideError ? erreur.message : MESSAGE_ECHEC_ENREGISTREMENT,
    }
  }

  // `.select('id')` n'est pas décoratif : sans lui, une mise à jour qui ne touche
  // aucune ligne — identifiant inexistant ou forgé — ne renvoie **aucune erreur**,
  // et l'application annoncerait « enregistré » alors que rien ne l'a été.
  const { data, error } = await clientAdmin()
    .from('membres')
    .update(colonnes)
    .eq('id', id)
    .select('id')
  if (error || !data || data.length === 0) {
    return { erreur: MESSAGE_ECHEC_ENREGISTREMENT }
  }

  revalidatePath('/membres')
  revalidatePath(`/membres/${id}`)
  redirect(`/membres/${id}`)
}

/**
 * Écrit le nouvel état d'une fiche. Non exportée : dans un fichier `'use server'`,
 * toute fonction exportée devient une Server Action appelable depuis le client, or
 * celle-ci prend un état arbitraire — elle ne doit être atteignable que par
 * `archiverMembre` et `desarchiverMembre`, qui, elles, valident l'appelant et
 * n'exposent chacune qu'une seule transition.
 */
async function changerEtatMembre(id: string, etat: EtatMembre): Promise<void> {
  // `.select('id')` n'est pas décoratif : une mise à jour sans effet ne renvoie pas
  // d'erreur. Ces actions n'ont pas de canal de retour vers l'écran, alors plutôt
  // que de rediriger comme si tout allait bien, on lève — un changement d'état qui
  // ne change rien doit se voir.
  const { data, error } = await clientAdmin()
    .from('membres')
    .update({ etat })
    .eq('id', id)
    .select('id')
  if (error) {
    // Relayer l'objet d'origine : `details` porte le marqueur du déclencheur (par
    // exemple `disciples_a_reaffecter`), et le remplacer par un `Error` neuf le
    // perdrait — l'appelant ne pourrait plus distinguer un refus métier d'une panne.
    throw error
  }
  if (!data || data.length === 0) {
    throw new Error("La fiche n'a pas pu être mise à jour : aucune fiche ne correspond.")
  }
}

export async function archiverMembre(donnees: FormData): Promise<void> {
  await exigerAdministrateur()

  const id = donnees.get('id')
  if (typeof id !== 'string' || id.length === 0) {
    redirect('/membres')
  }

  // Contrôle EN AMONT, pour pouvoir nommer les personnes concernées. Le déclencheur
  // reste la barrière : ce contrôle explique, il ne protège pas. Deux archivages
  // concurrents, ou une réaffectation validée entre-temps, passeraient ici et seraient
  // arrêtés là — c'est le partage voulu.
  const disciples = await disciplesDe(id)
  if (disciples.length > 0) {
    const noms = disciples.map((d) => `${d.prenom} ${d.nom}`).join(', ')
    redirect(`/membres/${id}?archivageRefuse=${encodeURIComponent(noms)}`)
  }

  // Contrôle EN AMONT, même partage que le précédent : nommer la cause avant d'écrire.
  // Le déclencheur (20260814160000), lui verrouillé, reste la barrière — voir
  // `compteLieEstDernierAdministrateurActif`.
  if (await compteLieEstDernierAdministrateurActif(id)) {
    redirect(`/membres/${id}?archivageRefuseAdministrateur=1`)
  }

  try {
    await changerEtatMembre(id, 'archive')
  } catch (erreur) {
    const details = (erreur as { details?: string | null })?.details
    if (details === DETAIL_DISCIPLES_A_REAFFECTER) {
      // Filet : le déclencheur a refusé alors que le contrôle amont laissait passer
      // (archivage concurrent, ou réaffectation validée entre les deux lectures
      // ci-dessus). Le contrôle amont ne peut plus nommer les disciples ici — ils ont
      // été réaffectés ou l'archivage concurrent a déjà eu lieu — d'où un message
      // moins précis mais honnête.
      console.error('archiverMembre : archivage refusé par le déclencheur', { id, erreur })
      redirect(`/membres/${id}?archivageRefuse=${encodeURIComponent('des disciples encore actifs')}`)
    }
    if (details === DETAIL_DERNIER_ADMINISTRATEUR) {
      // Même filet, pour la même raison : une promotion/désactivation concurrente d'un
      // autre administrateur entre la lecture ci-dessus et l'écriture aurait pu rendre
      // le contrôle amont périmé.
      console.error(
        'archiverMembre : archivage refusé par le déclencheur (dernier administrateur)',
        { id, erreur },
      )
      redirect(`/membres/${id}?archivageRefuseAdministrateur=1`)
    }
    // Pas le refus métier attendu : une autre panne (fiche disparue entre-temps,
    // erreur de connexion...). La déguiser en un refus métier mentirait à
    // l'administrateur ; elle doit remonter comme une erreur réelle, vers la page
    // d'erreur générique de l'application (src/app/error.tsx).
    console.error('archiverMembre : échec inattendu', { id, erreur })
    throw erreur
  }

  revalidatePath('/membres')
  redirect('/membres')
}

/**
 * Rétablit une fiche archivée. Sans cette action, un archivage accidentel sur mobile
 * est définitif sans intervention en base — alors que la confirmation promet « rien
 * n'est supprimé ».
 */
export async function desarchiverMembre(donnees: FormData): Promise<void> {
  await exigerAdministrateur()

  const id = donnees.get('id')
  if (typeof id !== 'string' || id.length === 0) {
    redirect('/membres')
  }

  // Contrôle EN AMONT, pour pouvoir nommer le faiseur de disciple concerné — même
  // partage que dans archiverMembre : ce contrôle explique, le déclencheur
  // (20260814140000) reste la barrière. Un archivage concurrent du faiseur de
  // disciple, entre cette lecture et l'écriture ci-dessous, passerait ici et serait
  // arrêté par le déclencheur, avec un message moins précis mais honnête (voir le
  // `catch` plus bas).
  const membre = await membreParId(id)
  if (membre?.faiseurDeDiscipleId) {
    const faiseur = await membreParId(membre.faiseurDeDiscipleId)
    if (faiseur?.etat === 'archive') {
      redirect(
        `/membres/${id}?desarchivageRefuse=${encodeURIComponent(`${faiseur.prenom} ${faiseur.nom}`)}`,
      )
    }
  }

  try {
    await changerEtatMembre(id, 'actif')
  } catch (erreur) {
    const details = (erreur as { details?: string | null })?.details
    if (details !== DETAIL_FAISEUR_DE_DISCIPLE_ARCHIVE) {
      // Pas le refus métier attendu : une autre panne. La déguiser en « faiseur de
      // disciple archivé » mentirait à l'administrateur ; elle doit remonter comme
      // une erreur réelle, vers la page d'erreur générique (src/app/error.tsx).
      console.error('desarchiverMembre : échec inattendu', { id, erreur })
      throw erreur
    }
    // Filet : le déclencheur a refusé alors que le contrôle amont laissait passer
    // (le faiseur de disciple a été archivé entre les deux lectures ci-dessus, ou
    // directement en base). Le contrôle amont ne peut plus nommer le faiseur ici,
    // d'où un message moins précis mais honnête.
    console.error('desarchiverMembre : rétablissement refusé par le déclencheur', { id, erreur })
    redirect(`/membres/${id}?desarchivageRefuse=${encodeURIComponent('son faiseur de disciple')}`)
  }

  redirect(`/membres/${id}`)
}
