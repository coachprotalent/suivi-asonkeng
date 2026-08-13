import 'server-only'
import { redirect } from 'next/navigation'
import { peutModifier } from '@/lib/domaine/arbre'
import { cibleAutorite } from '@/lib/donnees/arbre'
import { profilCourant, rolesDuProfil, type Profil } from '@/lib/donnees/profils'

/**
 * EXCEPTION UNIQUE DU PROJET (design phase 2b, §9) : `src/app/inscription/
 * actions.ts` (`sInscrire`) est la SEULE Server Action de toute l'application qui
 * n'appelle AUCUNE fonction de ce fichier. Ce n'est pas un oubli : `/inscription`
 * s'affiche sans session, par construction — il n'existe littéralement aucun
 * profil à exiger à ce stade. Sa fermeture ne repose sur AUCUN garde ci-dessous ;
 * elle repose entièrement sur l'absence de politique RLS ouverte au rôle `anon`
 * et sur les privilèges `EXECUTE` de `consommer_token_inscription` /
 * `relacher_token_inscription`, retirés à tous les rôles sauf `service_role`
 * (migration `20260815160000_consommation_token_inscription.sql`). Si un futur
 * changement fait apparaître un second appel à une Server Action DEPUIS
 * `src/app/inscription/`, sans passer par ce fichier, vérifier qu'il s'agit
 * toujours de cette même exception documentée et non d'une régression.
 */

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
 * C'est la SEULE protection des écritures de STATUTS : `attribuerStatut` et
 * `retirerStatut` (src/app/membres/[id]/statuts/actions.ts) sont les deux seuls
 * appelants, et ces écritures passent par la clé de service, qui contourne la RLS.
 * Les autres écritures concernant un membre — `creerMembre`, `modifierMembre`,
 * `archiverMembre`, `desarchiverMembre`, `definirArbre` — ne passent PAS par ici :
 * elles restent réservées aux administrateurs par leur propre garde,
 * `exigerAdministrateur`.
 */
export async function exigerAutoriteSur(membreId: string): Promise<Profil> {
  const { profil, autorise } = await deciderAutorite(membreId)
  if (!autorise) {
    redirect('/tableau-de-bord')
  }
  return profil
}

/**
 * Décision « ce compte gère-t-il le calendrier AEL, les séances, le pointage, ou le
 * rattachement d'un membre à une antenne ? », écrite une seule fois. Les deux fonctions
 * exportées ci-dessous en dérivent, sur le modèle de `deciderAutorite` plus haut.
 */
async function deciderModerateurOuAdministrateur(): Promise<{ profil: Profil; autorise: boolean }> {
  const profil = await exigerProfilActif()
  const roles = await rolesDuProfil(profil.id)
  const autorise = roles.includes('administrateur') || roles.includes('moderateur')
  return { profil, autorise }
}

/**
 * Le compte connecté gère-t-il le calendrier AEL, les séances ou le rattachement d'une
 * antenne ? Rend un booléen, ne redirige pas.
 *
 * À n'employer que pour DÉCIDER D'AFFICHER un formulaire ou un bouton (D22, D50). La
 * protection réelle, c'est `exigerModerateurOuAdministrateur`, et elle seule.
 */
export async function estModerateurOuAdministrateur(): Promise<boolean> {
  const { autorise } = await deciderModerateurOuAdministrateur()
  return autorise
}

/**
 * Réserve une action au modérateur et à l'administrateur (D22, D42, D50).
 *
 * Contrairement à `exigerAutoriteSur`, l'autorisation ici est PAR RÔLE, pas par portée
 * sur un membre précis : le calendrier, la génération, la tenue d'une séance, le
 * pointage et le rattachement d'un membre à une antenne ne dépendent d'aucune
 * arborescence de faiseurs de disciple. `exigerAutoriteSur` répond à une question
 * différente et ne s'applique pas ici.
 */
export async function exigerModerateurOuAdministrateur(): Promise<Profil> {
  const { profil, autorise } = await deciderModerateurOuAdministrateur()
  if (!autorise) {
    redirect('/tableau-de-bord')
  }
  return profil
}
