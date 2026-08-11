'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { identifiantVersEmail } from '@/lib/domaine/identifiant'
import { clientServeur } from '@/lib/supabase/serveur'
import { MESSAGE_ECHEC_CONNEXION } from './messages'

export type EtatConnexion = { erreur: string | null }

const schema = z.object({
  identifiant: z.string().min(1),
  motDePasse: z.string().min(1),
})

export async function seConnecter(
  _etat: EtatConnexion,
  donnees: FormData,
): Promise<EtatConnexion> {
  const saisie = schema.safeParse({
    identifiant: donnees.get('identifiant'),
    motDePasse: donnees.get('motDePasse'),
  })
  if (!saisie.success) {
    return { erreur: MESSAGE_ECHEC_CONNEXION }
  }

  let email: string
  try {
    email = identifiantVersEmail(saisie.data.identifiant)
  } catch {
    return { erreur: MESSAGE_ECHEC_CONNEXION }
  }

  const supabase = await clientServeur()
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: saisie.data.motDePasse,
  })
  if (error || !data.user) {
    return { erreur: MESSAGE_ECHEC_CONNEXION }
  }

  // Un compte désactivé ne doit pas conserver de session.
  const { data: profil } = await supabase
    .from('profils')
    .select('actif')
    .eq('id', data.user.id)
    .maybeSingle()

  if (!profil?.actif) {
    await supabase.auth.signOut()
    return { erreur: MESSAGE_ECHEC_CONNEXION }
  }

  // La garde du changement de mot de passe doit aussi vivre ici, et pas seulement
  // dans le middleware : Next.js résout la redirection d'une Server Action côté
  // serveur, sans repasser par le middleware. Sans ce contrôle, le tableau de bord
  // s'affiche une fois avant d'être protégé — vérifié en conditions réelles.
  if (data.user.app_metadata?.doit_changer_mdp === true) {
    redirect('/changer-mot-de-passe')
  }

  redirect('/tableau-de-bord')
}

export async function seDeconnecter() {
  const supabase = await clientServeur()
  await supabase.auth.signOut()
  redirect('/connexion')
}
