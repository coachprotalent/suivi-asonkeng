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
    return { erreur: 'Cette antenne existe déjà, ou n’a pas pu être créée.' }
  }

  revalidatePath('/antennes')
  return { erreur: null }
}

export async function desactiverAntenne(donnees: FormData): Promise<void> {
  await exigerAdministrateur()

  const id = donnees.get('id')
  if (typeof id !== 'string' || id.length === 0) return

  // Désactivation et non suppression : les membres déjà rattachés doivent conserver
  // leur historique. La contrainte `on delete set null` protégerait les données, mais
  // effacerait l'information.
  await clientAdmin().from('antennes').update({ actif: false }).eq('id', id)
  revalidatePath('/antennes')
  revalidatePath('/membres')
}
