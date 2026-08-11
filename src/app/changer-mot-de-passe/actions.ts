'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { profilCourant } from '@/lib/donnees/profils'
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

  // La phase 0 ne livre que le changement *forcé*. Sans ce contrôle, toute session
  // authentifiée pourrait changer le mot de passe sans connaître l'ancien — et la
  // personne dépossédée n'aurait aucun recours autonome (spec §5.4).
  if (user.app_metadata?.doit_changer_mdp !== true) {
    redirect('/tableau-de-bord')
  }

  // Une écriture par clé de service ne doit jamais reposer sur la seule présence
  // d'une session : un compte d'authentification sans fiche, ou désactivé, ne doit
  // pas l'atteindre. C'est le patron que les phases suivantes recopieront.
  const profil = await profilCourant()
  if (!profil) {
    redirect('/deconnexion')
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
    // Le mot de passe est bien changé, mais le drapeau reste actif en base : sans
    // aide, la personne serait renvoyée ici indéfiniment. Resoumettre le formulaire
    // rejoue les deux opérations et suffit à s'en sortir — c'est donc ce qu'on lui
    // demande. Surtout pas « reconnectez-vous » : le middleware la ferait rebondir
    // de l'écran de connexion vers celui-ci, et cette application n'a aucune
    // réinitialisation autonome pour la rattraper.
    return {
      erreur: "Le changement n'a pas pu être finalisé. Soumettez à nouveau le formulaire.",
    }
  }

  // Rafraîchir la session pour que le nouveau JWT porte le drapeau à false.
  // Si ce rafraîchissement échoue, le jeton conserve l'ancien drapeau et le
  // middleware renverrait ici à la navigation suivante, sans explication et
  // jusqu'à l'expiration naturelle du jeton. On envoie alors vers la déconnexion :
  // le drapeau étant déjà effacé en base, une reconnexion avec le nouveau mot de
  // passe aboutit directement au tableau de bord.
  const { error: erreurRafraichissement } = await supabase.auth.refreshSession()
  if (erreurRafraichissement) {
    redirect('/deconnexion')
  }

  redirect('/tableau-de-bord')
}
