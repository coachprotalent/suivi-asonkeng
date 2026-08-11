'use server'

import { revalidatePath } from 'next/cache'
import { exigerAdministrateur } from '@/lib/securite/garde'
import { clientAdmin } from '@/lib/supabase/admin'

export type EtatAntenne = { erreur: string | null }

export async function creerAntenne(
  _etat: EtatAntenne,
  donnees: FormData,
): Promise<EtatAntenne> {
  await exigerAdministrateur()

  const nom = String(donnees.get('nom') ?? '').trim()
  const pays = String(donnees.get('pays') ?? '').trim()
  if (nom.length === 0 || pays.length === 0) {
    return { erreur: 'Le nom et le pays sont obligatoires.' }
  }

  const { error } = await clientAdmin().from('antennes').insert({ nom, pays })
  if (error) {
    // La contrainte d'unicité est le cas de loin le plus probable.
    return { erreur: "Cette antenne existe déjà, ou n'a pas pu être créée." }
  }

  revalidatePath('/antennes')
  return { erreur: null }
}

export async function desactiverAntenne(donnees: FormData): Promise<void> {
  await exigerAdministrateur()

  const id = donnees.get('id')
  if (typeof id !== 'string' || id.length === 0) return

  // Désactivation et non suppression : les membres déjà rattachés doivent conserver
  // leur historique. La contrainte `on delete restrict` refuserait d'ailleurs la
  // suppression d'une antenne encore utilisée.
  await basculerAntenne(id, false)
}

/** Remet une antenne en service. Sans elle, une désactivation serait sans retour. */
export async function reactiverAntenne(donnees: FormData): Promise<void> {
  await exigerAdministrateur()

  const id = donnees.get('id')
  if (typeof id !== 'string' || id.length === 0) return

  await basculerAntenne(id, true)
}

async function basculerAntenne(id: string, actif: boolean): Promise<void> {
  // `.select('id')` et la vérification qui suit ne sont pas décoratifs : une mise à
  // jour qui ne touche aucune ligne ne renvoie **aucune erreur**. Sans ce contrôle,
  // un identifiant invalide, une écriture refusée ou une antenne déjà dans cet état
  // produiraient tous le même résultat visible — rien ne change, et le bouton a l'air
  // d'avoir fonctionné. Même exigence que pour l'archivage d'un membre.
  const { data, error } = await clientAdmin()
    .from('antennes')
    .update({ actif })
    .eq('id', id)
    .select('id')

  if (error || !data || data.length === 0) {
    throw new Error("L'antenne n'a pas pu être mise à jour : aucune antenne ne correspond.")
  }

  revalidatePath('/antennes')
  revalidatePath('/membres')
}
