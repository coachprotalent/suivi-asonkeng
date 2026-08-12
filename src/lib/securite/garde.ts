import 'server-only'
import { redirect } from 'next/navigation'
import { peutModifier } from '@/lib/domaine/arbre'
import { cibleAutorite } from '@/lib/donnees/arbre'
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

/**
 * Décision d'autorité, écrite UNE seule fois. Les deux fonctions exportées ci-dessous
 * en dérivent : sans cette factorisation, `exigerAutoriteSur` appelant `aAutoriteSur`
 * relirait le profil et les rôles trois fois pour une seule décision.
 */
async function deciderAutorite(
  membreId: string,
): Promise<{ profil: Profil; autorise: boolean }> {
  const profil = await exigerProfilActif()
  const roles = await rolesDuProfil(profil.id)
  const estAdmin = roles.includes('administrateur')

  // Court-circuit : un administrateur a autorité partout, inutile de remonter l'arbre.
  if (estAdmin) {
    return { profil, autorise: true }
  }

  const cible = await cibleAutorite(membreId)
  // Membre inexistant : refus. Ne jamais rendre `true` par défaut sur une cible qu'on
  // n'a pas su lire — l'échec doit être fermé.
  if (!cible) {
    return { profil, autorise: false }
  }
  return {
    profil,
    autorise: peutModifier({ membreLieId: profil.membreId, estAdmin }, cible),
  }
}

/**
 * A-t-on autorité sur ce membre ? Rend un booléen, ne redirige pas.
 *
 * À n'employer que pour DÉCIDER D'AFFICHER quelque chose. Il ne protège rien : masquer
 * un formulaire n'empêche personne d'appeler l'action qu'il déclenche. La protection,
 * c'est `exigerAutoriteSur`, et elle seule.
 */
export async function aAutoriteSur(membreId: string): Promise<boolean> {
  const { autorise } = await deciderAutorite(membreId)
  return autorise
}

/**
 * Réserve une action aux comptes ayant autorité sur ce membre (spec §5.1).
 *
 * C'est la SEULE protection des écritures de statuts : elles passent par la clé de
 * service, qui contourne la RLS. Toute écriture concernant un membre passe par ici.
 */
export async function exigerAutoriteSur(membreId: string): Promise<Profil> {
  const { profil, autorise } = await deciderAutorite(membreId)
  if (!autorise) {
    redirect('/tableau-de-bord')
  }
  return profil
}
