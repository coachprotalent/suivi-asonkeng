'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { calculerOccurrences, HORIZON_GENERATION_SEMAINES } from '@/lib/domaine/ael'
import { calendriersActifs } from '@/lib/donnees/ael'
import { antenneParId } from '@/lib/donnees/antennes'
import { exigerModerateurOuAdministrateur } from '@/lib/securite/garde'
import { clientAdmin } from '@/lib/supabase/admin'
import {
  MESSAGE_ANTENNE_INACTIVE,
  MESSAGE_ANTENNE_INCONNUE,
  MESSAGE_ANTENNE_MANQUANTE,
  MESSAGE_DATE_OBLIGATOIRE,
  MESSAGE_ECHEC_CREATION_MANUELLE,
  MESSAGE_ECHEC_GENERATION,
} from './messages'

/**
 * `creees: 0` et `aucunCalendrier: true` décrivent deux situations OPPOSÉES qu'un seul
 * chiffre confondrait : « tout est déjà généré sur cet horizon » et « aucun créneau
 * actif, rien ne sera jamais généré ». Sans ce troisième champ, un modérateur qui vient
 * de désactiver tous les créneaux d'une antenne recevrait la confirmation rassurante que
 * tout est à jour.
 */
export type EtatGeneration = {
  erreur: string | null
  creees: number | null
  aucunCalendrier: boolean
}

/**
 * Date du jour en UTC. Le serveur sert le Cameroun (UTC+1) et la France (UTC+1/+2) :
 * une génération lancée avant 01 h locale part donc de la VEILLE. Sans conséquence sur
 * un horizon de 8 semaines — la première occurrence est simplement incluse une fois de
 * plus, et l'idempotence de la passerelle (D38) l'absorbe sans créer de doublon. C'est
 * écrit ici pour être lu, pas découvert.
 */
function aujourdhuiIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Geste explicite, idempotent (D28). Le compte affiché à l'écran vient DIRECTEMENT du
 * nombre d'identifiants rendus par la passerelle — jamais du nombre d'occurrences
 * calculées côté application, qui inclut celles déjà générées lors d'un appel
 * précédent (la passerelle les omet, Task 10).
 */
export async function genererSeances(
  _etat: EtatGeneration,
  _donnees: FormData,
): Promise<EtatGeneration> {
  await exigerModerateurOuAdministrateur()

  const calendriers = await calendriersActifs()
  if (calendriers.length === 0) {
    // Cas DISTINCT de « rien de nouveau » : il n'y a aucun créneau actif sur une antenne
    // active, donc aucune séance ne sera jamais générée tant que rien n'est réactivé.
    // Annoncer « tout est déjà généré » ici décrirait une situation qui n'est pas
    // celle-là.
    revalidatePath('/ael/seances')
    return { erreur: null, creees: 0, aucunCalendrier: true }
  }

  const aujourdhui = aujourdhuiIso()

  // D41 : une séance par ligne de calendrier — chaque calendrier appelle
  // `calculerOccurrences` séparément, jamais fusionné avec un autre.
  const occurrences = calendriers.flatMap((calendrier) =>
    calculerOccurrences(calendrier, aujourdhui, HORIZON_GENERATION_SEMAINES).map((date) => ({
      calendrier_id: calendrier.id,
      antenne_id: calendrier.antenneId,
      date,
      heure: calendrier.heure ?? '',
    })),
  )

  if (occurrences.length === 0) {
    // Garde défensive : avec au moins un calendrier actif et un horizon non nul,
    // `calculerOccurrences` rend toujours au moins une date. On ne part donc pas en RPC
    // pour rien si cette hypothèse cessait d'être vraie. `aucunCalendrier: false` : la
    // cause ne serait PAS l'absence de créneau, et le message ne doit pas le prétendre.
    revalidatePath('/ael/seances')
    return { erreur: null, creees: 0, aucunCalendrier: false }
  }

  const { data, error } = await clientAdmin().rpc('generer_seances_ael', {
    p_occurrences: occurrences,
  })

  if (error) {
    console.error('genererSeances : échec RPC generer_seances_ael', {
      nombreOccurrences: occurrences.length,
      code: error.code,
      details: error.details,
      message: error.message,
    })
    return { erreur: MESSAGE_ECHEC_GENERATION, creees: null, aucunCalendrier: false }
  }

  revalidatePath('/ael/seances')
  return { erreur: null, creees: (data ?? []).length, aucunCalendrier: false }
}

export type EtatSeanceManuelle = { erreur: string | null }

/**
 * Création manuelle (D41 : « regrouper plusieurs antennes dans une même séance reste un
 * geste manuel »). Aucune passerelle `security definer` : contrairement à la
 * génération, aucun invariant ne dépend d'un COUNT recalculé entre deux écritures —
 * seul l'ordre des deux insertions compte, couvert par un rattrapage explicite plutôt
 * que par une transaction SQL dédiée (le design de la phase 3 ne demande de passerelle
 * que pour la génération, §4.6).
 */
export async function creerSeanceManuelle(
  _etat: EtatSeanceManuelle,
  donnees: FormData,
): Promise<EtatSeanceManuelle> {
  await exigerModerateurOuAdministrateur()

  const date = String(donnees.get('date') ?? '').trim()
  if (date.length === 0) {
    return { erreur: MESSAGE_DATE_OBLIGATOIRE }
  }
  const heureBrute = String(donnees.get('heure') ?? '').trim()
  const heure = heureBrute.length > 0 ? heureBrute : null

  const antenneIds = donnees
    .getAll('antenneIds')
    .map((valeur) => String(valeur))
    .filter((valeur) => valeur.length > 0)
  if (antenneIds.length === 0) {
    return { erreur: MESSAGE_ANTENNE_MANQUANTE }
  }

  // I6 de la revue finale de branche — contrôle amont, nommé, sur le motif EXACT de ses
  // deux sœurs de la même phase (`ajouterCalendrier`, `src/app/ael/calendriers/actions.ts:46-52`
  // et `definirAntenneMembre`, `src/app/antennes/[id]/actions.ts:64-70`), et pour le même
  // scénario : le formulaire ne propose que des antennes actives, mais rien n'empêche un
  // onglet resté ouvert de reposter l'identifiant d'une antenne désactivée entre-temps.
  // RIEN NE RATTRAPE EN AVAL : la clé étrangère `seances_ael_antennes.antenne_id` n'exige
  // que l'EXISTENCE de l'antenne, jamais son état. Sans ce contrôle, une séance manuelle
  // pouvait être liée EN SILENCE à une antenne hors service — sa liste de pointage serait
  // alors vide (`membresDesAntennes` ne rend que des membres actifs, et
  // `definirAntenneMembre` refuse d'en rattacher à une antenne désactivée), c'est-à-dire
  // exactement la « séance fantôme que rien ne signale » contre laquelle la GÉNÉRATION est
  // protégée par `calendriersActifs` (`src/lib/donnees/ael.ts:70-88`) et que la création
  // manuelle laissait passer.
  // Séquentiel et non `Promise.all` : le refus doit nommer la PREMIÈRE antenne fautive
  // dans l'ordre du formulaire, et le nombre d'antennes cochées est de l'ordre de l'unité.
  for (const antenneId of antenneIds) {
    const antenne = await antenneParId(antenneId)
    if (!antenne) {
      return { erreur: MESSAGE_ANTENNE_INCONNUE }
    }
    if (!antenne.actif) {
      return { erreur: MESSAGE_ANTENNE_INACTIVE }
    }
  }

  const { data: seance, error } = await clientAdmin()
    .from('seances_ael')
    .insert({ date, heure })
    .select('id')
    .single()

  if (error || !seance) {
    console.error('creerSeanceManuelle : échec de la création', {
      date,
      heure,
      code: error?.code,
      details: error?.details,
      message: error?.message,
    })
    return { erreur: MESSAGE_ECHEC_CREATION_MANUELLE }
  }

  const { error: erreurJonction } = await clientAdmin()
    .from('seances_ael_antennes')
    .insert(antenneIds.map((antenneId) => ({ seance_id: seance.id, antenne_id: antenneId })))

  if (erreurJonction) {
    console.error("creerSeanceManuelle : échec de la jonction d'antenne", {
      seanceId: seance.id,
      antenneIds,
      code: erreurJonction.code,
      details: erreurJonction.details,
      message: erreurJonction.message,
    })
    // Rattrapage explicite : ne pas laisser une séance orpheline de toute antenne.
    // L'utilisateur recommande le geste entier plutôt que de recevoir une séance
    // à moitié créée.
    await clientAdmin().from('seances_ael').delete().eq('id', seance.id)
    return { erreur: MESSAGE_ECHEC_CREATION_MANUELLE }
  }

  revalidatePath('/ael/seances')
  redirect(`/ael/seances/${seance.id}`)
}
