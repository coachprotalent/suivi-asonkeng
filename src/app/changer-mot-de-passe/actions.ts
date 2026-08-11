'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { clientAdmin } from '@/lib/supabase/admin'
import { clientServeur } from '@/lib/supabase/serveur'
import { LONGUEUR_MDP_MINIMALE } from './constantes'

export type EtatChangement = { erreur: string | null }

const schema = z
  .object({
    motDePasse: z
      .string()
      .min(LONGUEUR_MDP_MINIMALE, `Le mot de passe doit faire au moins ${LONGUEUR_MDP_MINIMALE} caractères.`),
    confirmation: z.string(),
  })
  .refine((v) => v.motDePasse === v.confirmation, {
    message: 'Les deux mots de passe ne correspondent pas.',
  })

export async function changerMotDePasse(
  _etat: EtatChangement,
  donnees: FormData,
): Promise<EtatChangement> {
  const saisie = schema.safeParse({
    motDePasse: donnees.get('motDePasse'),
    confirmation: donnees.get('confirmation'),
  })
  if (!saisie.success) {
    return { erreur: saisie.error.issues[0]?.message ?? 'Saisie invalide.' }
  }

  const supabase = await clientServeur()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect('/connexion')
  }

  const { error } = await supabase.auth.updateUser({ password: saisie.data.motDePasse })
  if (error) {
    return { erreur: "Le mot de passe n'a pas pu être modifié. Réessayez." }
  }

  // Effacer le drapeau : seule la clé de service peut écrire dans app_metadata.
  const admin = clientAdmin()
  const { error: erreurDrapeau } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: { doit_changer_mdp: false },
  })
  if (erreurDrapeau) {
    return { erreur: 'Mot de passe modifié, mais la session n\'a pas pu être mise à jour. Reconnectez-vous.' }
  }

  // Rafraîchir la session pour que le nouveau JWT porte le drapeau à false.
  await supabase.auth.refreshSession()

  redirect('/tableau-de-bord')
}
