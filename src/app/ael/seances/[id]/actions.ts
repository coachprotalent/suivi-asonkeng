'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { seanceEstComplete } from '@/lib/domaine/ael'
import { exigerModerateurOuAdministrateur } from '@/lib/securite/garde'
import { clientAdmin } from '@/lib/supabase/admin'
import {
  MESSAGE_DATE_OBLIGATOIRE,
  MESSAGE_ECHEC_SEANCE,
  MESSAGE_INTERVENANT_EXCLUSIF,
  MESSAGE_SEANCE_SANS_ENSEIGNANT,
  MESSAGE_SEANCE_SANS_THEME,
} from './messages'

export type EtatSeance = { erreur: string | null }

const DETAIL_SEANCE_SANS_THEME = 'seance_sans_theme'
const DETAIL_SEANCE_SANS_ENSEIGNANT = 'seance_sans_enseignant'
const CODE_VIOLATION_CHECK = '23514'

function champOuNull(donnees: FormData, champ: string): string | null {
  const valeur = donnees.get(champ)
  return typeof valeur === 'string' && valeur.length > 0 ? valeur : null
}

export async function enregistrerSeance(
  _etat: EtatSeance,
  donnees: FormData,
): Promise<EtatSeance> {
  await exigerModerateurOuAdministrateur()

  const seanceId = champOuNull(donnees, 'seanceId')
  if (!seanceId) {
    console.error('enregistrerSeance : identifiant de la séance manquant dans le formulaire')
    return { erreur: MESSAGE_ECHEC_SEANCE }
  }

  const date = champOuNull(donnees, 'date')
  if (!date) {
    return { erreur: MESSAGE_DATE_OBLIGATOIRE }
  }
  const theme = champOuNull(donnees, 'theme')
  const enseignantMembreId = champOuNull(donnees, 'enseignantMembreId')
  const enseignantLibre = champOuNull(donnees, 'enseignantLibre')
  const moderateurMembreId = champOuNull(donnees, 'moderateurMembreId')
  const moderateurLibre = champOuNull(donnees, 'moderateurLibre')
  const intention = donnees.get('intention')

  // `date` seule est modifiable ici — c'est ainsi qu'une séance du samedi se déplace
  // au dimanche (spec §4.5). `genere_pour_le` N'EST JAMAIS touché par cette action :
  // c'est précisément ce qui rend le déplacement sûr face à une regénération (D39,
  // preuve n°7 du design).
  const misAJour: Record<string, string | null> = {
    date,
    theme,
    enseignant_membre_id: enseignantMembreId,
    enseignant_libre: enseignantLibre,
    moderateur_membre_id: moderateurMembreId,
    moderateur_libre: moderateurLibre,
  }

  if (intention === 'tenir') {
    // Contrôle amont, nommé (D37) : produit le bon message AVANT d'écrire, sur les
    // valeurs telles que soumises par CE formulaire, pas celles déjà enregistrées.
    const champManquant = seanceEstComplete({ theme, enseignantMembreId, enseignantLibre })
    if (champManquant === 'theme') {
      return { erreur: MESSAGE_SEANCE_SANS_THEME }
    }
    if (champManquant === 'enseignant') {
      return { erreur: MESSAGE_SEANCE_SANS_ENSEIGNANT }
    }
    misAJour.etat = 'tenue'
  }

  const { data, error } = await clientAdmin()
    .from('seances_ael')
    .update(misAJour)
    .eq('id', seanceId)
    .select('id')

  if (error) {
    console.error('enregistrerSeance : échec de la mise à jour', {
      seanceId,
      intention,
      code: error.code,
      details: error.details,
      message: error.message,
    })
    // Marqueurs du déclencheur de complétude (Task 8 / 20260817150000) : filet en cas
    // de divergence avec le contrôle amont ci-dessus, jamais atteint par l'écran normal.
    // Discrimination sur `error.details` (le marqueur), jamais sur le texte français du
    // message.
    if (error.details === DETAIL_SEANCE_SANS_THEME) {
      return { erreur: MESSAGE_SEANCE_SANS_THEME }
    }
    if (error.details === DETAIL_SEANCE_SANS_ENSEIGNANT) {
      return { erreur: MESSAGE_SEANCE_SANS_ENSEIGNANT }
    }
    if (error.code === CODE_VIOLATION_CHECK) {
      return { erreur: MESSAGE_INTERVENANT_EXCLUSIF }
    }
    return { erreur: MESSAGE_ECHEC_SEANCE }
  }
  // Une mise à jour qui ne touche aucune ligne ne renvoie AUCUNE erreur : sans ce
  // contrôle, un identifiant de séance périmé (séance supprimée dans un autre onglet,
  // requête forgée) produirait un succès apparent.
  //
  // On REND le message, on ne lève pas. `enregistrerSeance` est une action
  // `useActionState` : c'est le seul canal par lequel un message atteint l'écran. Lever
  // ici ferait remonter l'erreur à `src/app/error.tsx`, qui affiche un texte STATIQUE et
  // ne lit jamais `error.message` — le message n'atteindrait personne, et l'utilisateur
  // perdrait en plus sa saisie au profit d'une page d'erreur pleine page. Même modèle
  // que `definirAntenneMembre` (Task 3) sur le cas symétrique.
  if (!data || data.length === 0) {
    console.error('enregistrerSeance : aucune ligne mise à jour', { seanceId, intention })
    return { erreur: MESSAGE_ECHEC_SEANCE }
  }

  revalidatePath('/ael/seances')
  revalidatePath(`/ael/seances/${seanceId}`)
  redirect(`/ael/seances/${seanceId}`)
}

async function changerEtatSeance(donnees: FormData, etat: 'prevue' | 'annulee'): Promise<void> {
  await exigerModerateurOuAdministrateur()

  const seanceId = champOuNull(donnees, 'seanceId')
  if (!seanceId) {
    console.error('changerEtatSeance : identifiant manquant dans le formulaire', { etat })
    return
  }

  // Jamais bloqué par le déclencheur de complétude (D49) : il ne surveille que la
  // transition VERS `tenue`. Les présences déjà pointées ne sont pas touchées : cette
  // écriture ne porte que sur `seances_ael.etat`.
  const { data, error } = await clientAdmin()
    .from('seances_ael')
    .update({ etat })
    .eq('id', seanceId)
    .select('id')

  if (error || !data || data.length === 0) {
    throw new Error("L'état de la séance n'a pas pu être mis à jour : aucune séance ne correspond.")
  }

  revalidatePath('/ael/seances')
  revalidatePath(`/ael/seances/${seanceId}`)
}

/** Ramène une séance à `prevue` — corrige un passage à `tenue` fait par erreur (D49). */
export async function remettrePrevue(donnees: FormData): Promise<void> {
  await changerEtatSeance(donnees, 'prevue')
}

export async function annulerSeance(donnees: FormData): Promise<void> {
  await changerEtatSeance(donnees, 'annulee')
}
