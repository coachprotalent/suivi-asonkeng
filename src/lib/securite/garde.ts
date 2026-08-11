import 'server-only'
import { redirect } from 'next/navigation'
import { profilCourant, rolesDuProfil, type Profil } from '@/lib/donnees/profils'

/**
 * Passage obligé de toute page et de toute Server Action de l'application.
 *
 * Un contrôle écrit une fois par écran finit par manquer quelque part : ce garde
 * existe pour qu'il n'y ait qu'une seule façon d'entrer. `profilCourant()` renvoie
 * `null` aussi bien pour une session absente que pour un compte désactivé ou sans
 * fiche — les trois appellent la même réaction.
 *
 * Vers `/deconnexion` et non `/connexion` : le jeton peut rester valide alors que le
 * profil ne l'est plus, et le middleware ferait rebondir indéfiniment.
 */
export async function exigerProfilActif(): Promise<Profil> {
  const profil = await profilCourant()
  if (!profil) {
    redirect('/deconnexion')
  }
  return profil
}

/** Réserve une page ou une action aux administrateurs. */
export async function exigerAdministrateur(): Promise<Profil> {
  const profil = await exigerProfilActif()
  const roles = await rolesDuProfil(profil.id)
  if (!roles.includes('administrateur')) {
    redirect('/tableau-de-bord')
  }
  return profil
}
