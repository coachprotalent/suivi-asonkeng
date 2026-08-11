'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { FicheMembreInvalideError, normaliserFicheMembre, type EtatMembre } from '@/lib/domaine/membre'
import { exigerAdministrateur } from '@/lib/securite/garde'
import { clientAdmin } from '@/lib/supabase/admin'
import { MESSAGE_ECHEC_ENREGISTREMENT } from './messages'

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
  if (error || !data || data.length === 0) {
    throw new Error("La fiche n'a pas pu être mise à jour : aucune fiche ne correspond.")
  }
}

export async function archiverMembre(donnees: FormData): Promise<void> {
  await exigerAdministrateur()

  const id = donnees.get('id')
  if (typeof id !== 'string' || id.length === 0) {
    redirect('/membres')
  }

  await changerEtatMembre(id, 'archive')

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

  await changerEtatMembre(id, 'actif')
  redirect(`/membres/${id}`)
}
