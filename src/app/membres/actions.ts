'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { FicheMembreInvalideError, normaliserFicheMembre } from '@/lib/domaine/membre'
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

  const { error } = await clientAdmin().from('membres').update(colonnes).eq('id', id)
  if (error) {
    return { erreur: MESSAGE_ECHEC_ENREGISTREMENT }
  }

  revalidatePath('/membres')
  revalidatePath(`/membres/${id}`)
  redirect(`/membres/${id}`)
}

export async function archiverMembre(donnees: FormData): Promise<void> {
  await exigerAdministrateur()

  const id = donnees.get('id')
  if (typeof id !== 'string' || id.length === 0) {
    redirect('/membres')
  }

  await clientAdmin().from('membres').update({ etat: 'archive' }).eq('id', id)
  revalidatePath('/membres')
  redirect('/membres')
}
