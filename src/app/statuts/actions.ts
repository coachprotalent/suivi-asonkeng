'use server'

import { revalidatePath } from 'next/cache'
import { exigerAdministrateur } from '@/lib/securite/garde'
import { clientAdmin } from '@/lib/supabase/admin'

export type EtatCatalogue = { erreur: string | null }

export async function creerGroupe(
  _etat: EtatCatalogue,
  donnees: FormData,
): Promise<EtatCatalogue> {
  await exigerAdministrateur()

  const nom = String(donnees.get('nom') ?? '').trim()
  if (nom.length === 0) {
    return { erreur: 'Le nom du groupe est obligatoire.' }
  }
  const exclusif = donnees.get('exclusif') === 'on'

  const { error } = await clientAdmin().from('groupes_statut').insert({ nom, exclusif })
  if (error) {
    return { erreur: "Ce groupe existe déjà, ou n'a pas pu être créé." }
  }

  revalidatePath('/statuts')
  return { erreur: null }
}

export async function creerStatut(
  _etat: EtatCatalogue,
  donnees: FormData,
): Promise<EtatCatalogue> {
  await exigerAdministrateur()

  const groupeId = String(donnees.get('groupeId') ?? '')
  const libelle = String(donnees.get('libelle') ?? '').trim()
  if (groupeId.length === 0 || libelle.length === 0) {
    return { erreur: 'Le groupe et le libellé sont obligatoires.' }
  }

  const { error } = await clientAdmin()
    .from('statuts')
    .insert({ groupe_id: groupeId, libelle })
  if (error) {
    return { erreur: "Ce statut existe déjà dans ce groupe, ou n'a pas pu être créé." }
  }

  revalidatePath('/statuts')
  // Les écrans qui AFFICHENT un libellé de statut sont les fiches membres et leurs
  // écrans de statuts, pas l'annuaire — celui-ci ne montre aucun statut. Le `type`
  // est obligatoire sur un segment dynamique, et `/membres/[id]` n'invalide PAS
  // `/membres/[id]/statuts` : chacun se déclare.
  revalidatePath('/membres/[id]', 'page')
  revalidatePath('/membres/[id]/statuts', 'page')
  return { erreur: null }
}

export async function desactiverStatut(donnees: FormData): Promise<void> {
  await exigerAdministrateur()
  await basculerStatut(donnees, false)
}

/** Sans elle, désactiver un statut par erreur serait sans retour depuis l'interface. */
export async function reactiverStatut(donnees: FormData): Promise<void> {
  await exigerAdministrateur()
  await basculerStatut(donnees, true)
}

async function basculerStatut(donnees: FormData, actif: boolean): Promise<void> {
  const id = donnees.get('id')
  if (typeof id !== 'string' || id.length === 0) return

  // `.select('id')` puis vérification : une mise à jour qui ne touche aucune ligne
  // ne renvoie aucune erreur, et le bouton aurait l'air d'avoir fonctionné.
  const { data, error } = await clientAdmin()
    .from('statuts')
    .update({ actif })
    .eq('id', id)
    .select('id')

  if (error || !data || data.length === 0) {
    throw new Error("Le statut n'a pas pu être mis à jour : aucun statut ne correspond.")
  }

  revalidatePath('/statuts')
  revalidatePath('/membres/[id]', 'page')
  revalidatePath('/membres/[id]/statuts', 'page')
}
