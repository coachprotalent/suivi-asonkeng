'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { FicheMembreInvalideError, normaliserFicheMembre, type EtatMembre } from '@/lib/domaine/membre'
import { disciplesDe } from '@/lib/donnees/arbre'
import { membreParId } from '@/lib/donnees/membres'
import { exigerAdministrateur } from '@/lib/securite/garde'
import { clientAdmin } from '@/lib/supabase/admin'
import { MESSAGE_ECHEC_ENREGISTREMENT } from './messages'

const DETAIL_DISCIPLES_A_REAFFECTER = 'disciples_a_reaffecter'
const DETAIL_FAISEUR_DE_DISCIPLE_ARCHIVE = 'faiseur_de_disciple_archive'

export type EtatFormulaireMembre = { erreur: string | null }

function lireFiche(donnees: FormData) {
  return normaliserFicheMembre({
    nom: donnees.get('nom'),
    prenom: donnees.get('prenom'),
    telephone: donnees.get('telephone'),
    emailContact: donnees.get('emailContact'),
    ville: donnees.get('ville'),
    pays: donnees.get('pays'),
    antenneId: donnees.get('antenneId'),
    situation: donnees.get('situation'),
    domaineEtude: donnees.get('domaineEtude'),
    reportInitialAel: donnees.get('reportInitialAel'),
  })
}

function versColonnes(fiche: ReturnType<typeof lireFiche>) {
  return {
    nom: fiche.nom,
    prenom: fiche.prenom,
    telephone: fiche.telephone,
    email_contact: fiche.emailContact,
    ville: fiche.ville,
    pays: fiche.pays,
    antenne_id: fiche.antenneId,
    situation: fiche.situation,
    domaine_etude: fiche.domaineEtude,
    report_initial_ael: fiche.reportInitialAel,
  }
}

export async function creerMembre(
  _etat: EtatFormulaireMembre,
  donnees: FormData,
): Promise<EtatFormulaireMembre> {
  const profil = await exigerAdministrateur()

  let colonnes
  try {
    colonnes = versColonnes(lireFiche(donnees))
  } catch (erreur) {
    return {
      erreur:
        erreur instanceof FicheMembreInvalideError ? erreur.message : MESSAGE_ECHEC_ENREGISTREMENT,
    }
  }

  const { error } = await clientAdmin()
    .from('membres')
    .insert({ ...colonnes, cree_par: profil.id })
  if (error) {
    return { erreur: MESSAGE_ECHEC_ENREGISTREMENT }
  }

  revalidatePath('/membres')
  redirect('/membres')
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
    colonnes = versColonnes(lireFiche(donnees))
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

  try {
    await changerEtatMembre(id, 'archive')
  } catch (erreur) {
    const details = (erreur as { details?: string | null })?.details
    if (details !== DETAIL_DISCIPLES_A_REAFFECTER) {
      // Pas le refus métier attendu : une autre panne (fiche disparue entre-temps,
      // erreur de connexion...). La déguiser en « des disciples encore actifs »
      // mentirait à l'administrateur ; elle doit remonter comme une erreur réelle,
      // vers la page d'erreur générique de l'application (src/app/error.tsx).
      console.error('archiverMembre : échec inattendu', { id, erreur })
      throw erreur
    }
    // Filet : le déclencheur a refusé alors que le contrôle amont laissait passer
    // (archivage concurrent, ou réaffectation validée entre les deux lectures
    // ci-dessus). Le contrôle amont ne peut plus nommer les disciples ici — ils ont
    // été réaffectés ou l'archivage concurrent a déjà eu lieu — d'où un message
    // moins précis mais honnête.
    console.error('archiverMembre : archivage refusé par le déclencheur', { id, erreur })
    redirect(`/membres/${id}?archivageRefuse=${encodeURIComponent('des disciples encore actifs')}`)
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
