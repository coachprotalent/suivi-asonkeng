'use server'

import { revalidatePath } from 'next/cache'
import { antenneParId } from '@/lib/donnees/antennes'
import { exigerModerateurOuAdministrateur } from '@/lib/securite/garde'
import { clientAdmin } from '@/lib/supabase/admin'
import {
  MESSAGE_ANTENNE_INACTIVE,
  MESSAGE_ANTENNE_INCONNUE,
  MESSAGE_ANTENNE_OBLIGATOIRE,
  MESSAGE_CRENEAU_EXISTANT,
  MESSAGE_ECHEC_CALENDRIER,
  MESSAGE_JOUR_INVALIDE,
} from './messages'

export type EtatCalendrier = { erreur: string | null }

// Code Postgres du unique_violation, discriminé sur `error.code` et jamais sur le texte
// français du message — même standard que `creerAntenne` (`src/app/antennes/actions.ts`)
// et `src/app/statuts/actions.ts`. Ici, il ne peut venir que de
// `calendriers_ael_creneau_unique` (Task 6), la seule contrainte d'unicité de la table.
const CODE_VIOLATION_UNICITE = '23505'

export async function ajouterCalendrier(
  _etat: EtatCalendrier,
  donnees: FormData,
): Promise<EtatCalendrier> {
  await exigerModerateurOuAdministrateur()

  const antenneId = String(donnees.get('antenneId') ?? '').trim()
  if (antenneId.length === 0) {
    return { erreur: MESSAGE_ANTENNE_OBLIGATOIRE }
  }

  const jourSemaine = Number.parseInt(String(donnees.get('jourSemaine') ?? ''), 10)
  if (!Number.isInteger(jourSemaine) || jourSemaine < 1 || jourSemaine > 7) {
    return { erreur: MESSAGE_JOUR_INVALIDE }
  }

  // Contrôle amont, nommé, symétrique de celui de `definirAntenneMembre` (Task 3) et
  // pour le même scénario : `listerAntennes()` ne propose que des antennes actives, mais
  // rien n'empêche un onglet resté ouvert de reposter l'identifiant d'une antenne
  // désactivée entre-temps. Sans ce contrôle, l'écriture réussirait — aucune contrainte
  // en base ne porte cette règle — et la génération produirait des séances pour une
  // antenne hors service.
  const antenne = await antenneParId(antenneId)
  if (!antenne) {
    return { erreur: MESSAGE_ANTENNE_INCONNUE }
  }
  if (!antenne.actif) {
    return { erreur: MESSAGE_ANTENNE_INACTIVE }
  }

  const heureBrute = String(donnees.get('heure') ?? '').trim()
  const heure = heureBrute.length > 0 ? heureBrute : null

  const { error } = await clientAdmin()
    .from('calendriers_ael')
    .insert({ antenne_id: antenneId, jour_semaine: jourSemaine, heure })

  if (error) {
    console.error("ajouterCalendrier : échec de l'insertion", {
      antenneId,
      jourSemaine,
      heure,
      code: error.code,
      details: error.details,
      message: error.message,
    })
    // Un doublon de créneau doit être annoncé franchement : chaque ligne de calendrier
    // génère SA propre séance (D41), donc un doublon produirait deux séances identiques
    // à chaque occurrence, indistinguables et sans geste de suppression prévu.
    if (error.code === CODE_VIOLATION_UNICITE) {
      return { erreur: MESSAGE_CRENEAU_EXISTANT }
    }
    return { erreur: MESSAGE_ECHEC_CALENDRIER }
  }

  revalidatePath('/ael/calendriers')
  return { erreur: null }
}

export async function desactiverCalendrier(donnees: FormData): Promise<void> {
  await exigerModerateurOuAdministrateur()
  await basculerCalendrier(donnees, false)
}

export async function reactiverCalendrier(donnees: FormData): Promise<void> {
  await exigerModerateurOuAdministrateur()
  await basculerCalendrier(donnees, true)
}

async function basculerCalendrier(donnees: FormData, actif: boolean): Promise<void> {
  const id = donnees.get('id')
  if (typeof id !== 'string' || id.length === 0) {
    console.error('basculerCalendrier : identifiant manquant dans le formulaire', { actif })
    return
  }

  const { data, error } = await clientAdmin()
    .from('calendriers_ael')
    .update({ actif })
    .eq('id', id)
    .select('id')

  if (error || !data || data.length === 0) {
    throw new Error("Le créneau n'a pas pu être mis à jour : aucun créneau ne correspond.")
  }

  revalidatePath('/ael/calendriers')
}
