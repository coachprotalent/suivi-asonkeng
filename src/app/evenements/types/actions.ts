'use server'

import { revalidatePath } from 'next/cache'
import { exigerAdministrateur } from '@/lib/securite/garde'
import { clientAdmin } from '@/lib/supabase/admin'
import {
  MESSAGE_ECHEC_TYPE,
  MESSAGE_LIBELLE_OBLIGATOIRE,
  MESSAGE_TYPE_EXISTE_DEJA,
} from './messages'

export type EtatTypeEvenement = { erreur: string | null }

// Discrimination sur `error.code`, JAMAIS sur le texte français du message : un doublon
// réel doit être annoncé franchement, mais tout autre échec ne doit pas laisser croire à
// un doublon qui n'en est pas un. Même principe que `creerGroupe`.
//
// La détection du doublon ne repose PAS sur une normalisation côté application : cette
// action `trim()` seulement les espaces de bord, et c'est l'index unique normalisé en
// base (`types_evenement_libelle_normalise_unique`, sur `lower(trim(libelle))`) qui ferme
// le doublon de casse. Vérifié empiriquement contre la vraie base avant d'écrire ce
// fichier : l'insertion de « webinaire » alors que « Webinaire » existe rend
// `error.code === '23505'` (contrainte `types_evenement_libelle_normalise_unique`), donc
// cette discrimination l'attrape sans le moindre calcul supplémentaire ici.
const CODE_VIOLATION_UNICITE = '23505'

export async function creerTypeEvenement(
  _etat: EtatTypeEvenement,
  donnees: FormData,
): Promise<EtatTypeEvenement> {
  await exigerAdministrateur()

  const libelle = String(donnees.get('libelle') ?? '').trim()
  if (libelle.length === 0) {
    return { erreur: MESSAGE_LIBELLE_OBLIGATOIRE }
  }
  const ordreBrut = String(donnees.get('ordre') ?? '').trim()
  const ordre = ordreBrut.length > 0 && Number.isInteger(Number(ordreBrut)) ? Number(ordreBrut) : 0

  const { error } = await clientAdmin().from('types_evenement').insert({ libelle, ordre })
  if (error) {
    console.error("creerTypeEvenement : échec de l'insertion", {
      libelle,
      ordre,
      code: error.code,
      details: error.details,
      message: error.message,
    })
    if (error.code === CODE_VIOLATION_UNICITE) {
      return { erreur: MESSAGE_TYPE_EXISTE_DEJA }
    }
    // RETOURNÉ, jamais levé : un `throw` ici perdrait son message en production (digest
    // React #441) et l'administrateur perdrait sa saisie.
    return { erreur: MESSAGE_ECHEC_TYPE }
  }

  revalidatePath('/evenements/types')
  // Les écrans qui affichent un libellé de type sont la liste et la fiche d'un événement.
  // Le `type` est obligatoire sur un segment dynamique, et `/evenements` n'invalide PAS
  // `/evenements/[id]` : chacun se déclare.
  revalidatePath('/evenements')
  revalidatePath('/evenements/[id]', 'page')
  return { erreur: null }
}

export async function desactiverTypeEvenement(donnees: FormData): Promise<void> {
  await exigerAdministrateur()
  await basculerType(donnees, false)
}

/** Sans elle, désactiver un type par erreur serait sans retour depuis l'interface. */
export async function reactiverTypeEvenement(donnees: FormData): Promise<void> {
  await exigerAdministrateur()
  await basculerType(donnees, true)
}

async function basculerType(donnees: FormData, actif: boolean): Promise<void> {
  const id = donnees.get('id')
  if (typeof id !== 'string' || id.length === 0) {
    // Atteignable seulement par une requête forgée, jamais par l'interface. Journalisé
    // quand même : un cas qui ne devrait jamais arriver et qui arrive est un symptôme.
    console.error('basculerType : identifiant manquant dans le formulaire', { actif })
    return
  }

  // `.select('id')` puis vérification : une mise à jour qui ne touche aucune ligne ne
  // renvoie AUCUNE erreur, et le bouton aurait l'air d'avoir fonctionné.
  const { data, error } = await clientAdmin()
    .from('types_evenement')
    .update({ actif })
    .eq('id', id)
    .select('id')

  if (error || !data || data.length === 0) {
    // LEVÉE assumée ici, et c'est le seul endroit de cette tâche où elle l'est : ces deux
    // actions sont liées DIRECTEMENT à `<form action={...}>`, sans `useActionState`, donc
    // sans canal de retour vers l'écran. Il n'y a pas de message à perdre — seulement une
    // panne technique à rendre visible. Même choix que `basculerStatut`.
    throw new Error("Le type d'événement n'a pas pu être mis à jour : aucun type ne correspond.")
  }

  revalidatePath('/evenements/types')
  revalidatePath('/evenements')
  revalidatePath('/evenements/[id]', 'page')
}
