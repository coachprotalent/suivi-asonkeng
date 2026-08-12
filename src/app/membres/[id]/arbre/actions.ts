'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { dirigeantPropose } from '@/lib/domaine/arbre'
import { cheminArbre, maillonArbre } from '@/lib/donnees/arbre'
import { membreBrefParId, type MembreBref } from '@/lib/donnees/membres'
import { exigerAdministrateur } from '@/lib/securite/garde'
import { clientAdmin } from '@/lib/supabase/admin'
import {
  MESSAGE_DIRIGEANT_INCONNU,
  MESSAGE_ECHEC_ARBRE,
  MESSAGE_FAISEUR_ARCHIVE,
  MESSAGE_FAISEUR_INCONNU,
  MESSAGE_MEMBRE_INCONNU,
  messageCycle,
} from './messages'

export type EtatArbre = { erreur: string | null }

// Marqueurs posés par `public.definir_arbre` et les déclencheurs anti-cycle
// (migration 20260814100000) et anti-faiseur-archivé (migration 20260814150000). On
// discrimine dessus, jamais sur la prose française.
const DETAIL_CYCLE = 'cycle_faiseur_de_disciple'
const DETAIL_MEMBRE_INCONNU = 'membre_inconnu'
const DETAIL_FAISEUR_INCONNU = 'faiseur_inconnu'
const DETAIL_DIRIGEANT_INCONNU = 'dirigeant_inconnu'
const DETAIL_FAISEUR_ARCHIVE = 'faiseur_de_disciple_archive'

function champOuNull(donnees: FormData, champ: string): string | null {
  const valeur = donnees.get(champ)
  return typeof valeur === 'string' && valeur.length > 0 ? valeur : null
}

/**
 * Dirigeant proposé pour un faiseur de disciple donné. Appelée depuis le formulaire à
 * chaque changement, pour que la proposition suive la saisie.
 */
export async function proposerDirigeant(
  faiseurDeDiscipleId: string | null,
): Promise<MembreBref | null> {
  await exigerAdministrateur()

  if (faiseurDeDiscipleId === null) {
    return null
  }
  const maillon = await maillonArbre(faiseurDeDiscipleId)
  const proposeId = dirigeantPropose(maillon)
  if (proposeId === null) {
    return null
  }
  return membreBrefParId(proposeId)
}

export async function definirArbre(
  _etat: EtatArbre,
  donnees: FormData,
): Promise<EtatArbre> {
  await exigerAdministrateur()

  const membreId = champOuNull(donnees, 'membreId')
  if (!membreId) {
    console.error('definirArbre : identifiant du membre manquant dans le formulaire')
    return { erreur: MESSAGE_ECHEC_ARBRE }
  }

  const faiseurId = champOuNull(donnees, 'faiseurDeDiscipleId')
  const dirigeantId = champOuNull(donnees, 'dirigeantId')
  const dirigeantForce = donnees.get('dirigeantForce') === '1'

  const { error } = await clientAdmin().rpc('definir_arbre', {
    p_membre: membreId,
    p_faiseur_de_disciple: faiseurId,
    p_dirigeant: dirigeantId,
    p_dirigeant_force: dirigeantForce,
  })

  if (error) {
    console.error('definirArbre : échec RPC definir_arbre', {
      membreId,
      faiseurId,
      dirigeantId,
      dirigeantForce,
      code: error.code,
      details: error.details,
      message: error.message,
    })

    if (error.details === DETAIL_CYCLE) {
      // Le chemin fautif part du faiseur de disciple PROPOSÉ et remonte : s'il passe
      // par le membre qu'on édite, c'est précisément là que le cycle se refermerait.
      // `faiseurId` ne peut pas être null ici — un détachement ne crée aucun cycle —
      // mais on ne s'appuie pas sur ce raisonnement pour éviter une panne : un `null`
      // rendrait simplement le message générique, jamais une exception.
      const chemin = faiseurId ? await cheminArbre(faiseurId) : []
      return { erreur: messageCycle(chemin) }
    }
    if (error.details === DETAIL_MEMBRE_INCONNU) {
      return { erreur: MESSAGE_MEMBRE_INCONNU }
    }
    if (error.details === DETAIL_FAISEUR_INCONNU) {
      return { erreur: MESSAGE_FAISEUR_INCONNU }
    }
    if (error.details === DETAIL_FAISEUR_ARCHIVE) {
      return { erreur: MESSAGE_FAISEUR_ARCHIVE }
    }
    if (error.details === DETAIL_DIRIGEANT_INCONNU) {
      return { erreur: MESSAGE_DIRIGEANT_INCONNU }
    }
    return { erreur: MESSAGE_ECHEC_ARBRE }
  }

  revalidatePath('/membres')
  revalidatePath(`/membres/${membreId}`)
  revalidatePath(`/membres/${membreId}/arbre`)
  redirect(`/membres/${membreId}`)
}
