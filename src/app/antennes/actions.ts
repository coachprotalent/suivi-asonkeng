'use server'

import { revalidatePath } from 'next/cache'
import { exigerAdministrateur } from '@/lib/securite/garde'
import { clientAdmin } from '@/lib/supabase/admin'

export type EtatAntenne = { erreur: string | null }

// Code Postgres du unique_violation. On discrimine sur `error.code`, jamais sur le
// texte du message : un doublon réel doit être annoncé franchement, mais tout autre
// échec (panne, colonne refusée, droits) ne doit pas laisser croire à un doublon qui
// n'en est pas un. Même standard que `src/app/statuts/actions.ts`.
const CODE_VIOLATION_UNICITE = '23505'

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
    // Trace serveur systématique : un administrateur qui signale « ça ne marche
    // pas » doit trouver quelque chose d'exploitable dans les journaux, pas
    // seulement un message générique à l'écran.
    console.error("creerAntenne : échec de l'insertion", {
      nom,
      pays,
      code: error.code,
      details: error.details,
      message: error.message,
    })
    if (error.code === CODE_VIOLATION_UNICITE) {
      return { erreur: 'Cette antenne existe déjà.' }
    }
    return { erreur: "L'antenne n'a pas pu être créée." }
  }

  revalidatePath('/antennes')
  return { erreur: null }
}

/*
  Désactivation et non suppression : les membres déjà rattachés doivent conserver
  leur historique. La contrainte `on delete restrict` refuserait d'ailleurs la
  suppression d'une antenne encore utilisée.
*/
export async function desactiverAntenne(donnees: FormData): Promise<void> {
  await exigerAdministrateur()
  await basculerAntenne(donnees, false)
}

/** Remet une antenne en service. Sans elle, une désactivation serait sans retour. */
export async function reactiverAntenne(donnees: FormData): Promise<void> {
  await exigerAdministrateur()
  await basculerAntenne(donnees, true)
}

async function basculerAntenne(donnees: FormData, actif: boolean): Promise<void> {
  const id = donnees.get('id')
  if (typeof id !== 'string' || id.length === 0) {
    // Champ caché absent : atteignable seulement par une requête forgée, jamais par
    // l'interface. Le risque est donc faible, mais on journalise quand même — un cas
    // qui ne devrait jamais arriver et qui arrive est un symptôme. Même raisonnement
    // que `basculerStatut` dans `src/app/statuts/actions.ts`.
    console.error('basculerAntenne : identifiant manquant dans le formulaire', { actif })
    return
  }

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
