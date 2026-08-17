import 'server-only'
import { clientServeur } from '@/lib/supabase/serveur'

export type Profil = {
  id: string
  identifiant: string
  nomAffichage: string
  membreId: string | null
  estRacine: boolean
  actif: boolean
  /** Date de création du compte, affichée par `/profil` (phase 7). */
  creeLe: string
}

/**
 * Profil du compte connecté, ou `null`. Trois situations renvoient `null` et ne sont
 * volontairement pas distinguées, parce qu'elles appellent toutes la même réaction —
 * renvoyer vers l'écran de connexion : personne n'est connecté, le compte n'a pas de
 * fiche profil, ou le compte est désactivé.
 *
 * Le filtre `actif` est un contrôle d'accès, pas un confort. Désactiver un compte ne
 * révoque pas son jeton : sans ce filtre, la personne garderait l'accès jusqu'à
 * expiration, environ une heure. La politique RLS ne filtre pas non plus sur `actif`.
 *
 * `null` reste réservé à ces trois cas — pas de session, pas de fiche, compte
 * désactivé. Une erreur de lecture sur `profils` est un quatrième cas, différent :
 * elle ne veut pas dire « ce compte n'a pas accès », elle veut dire « la base ne
 * répond pas ». La confondre avec `null` provoquerait une déconnexion forcée
 * (`exigerProfilActif` redirige vers `/deconnexion`) à la première panne passagère.
 */
export async function profilCourant(): Promise<Profil | null> {
  const supabase = await clientServeur()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('profils')
    .select('id, identifiant, nom_affichage, membre_id, est_racine, actif, cree_le')
    .eq('id', user.id)
    .eq('actif', true)
    .maybeSingle()

  if (error) {
    throw new Error(`Lecture du profil impossible : ${error.message}`)
  }
  if (!data) return null

  return {
    id: data.id,
    identifiant: data.identifiant,
    nomAffichage: data.nom_affichage,
    membreId: data.membre_id,
    estRacine: data.est_racine,
    actif: data.actif,
    creeLe: data.cree_le,
  }
}

export type RoleApp = 'administrateur' | 'moderateur'

/** Rôles explicitement attribués. Les droits « Utilisateur » sont le socle implicite. */
export async function rolesDuProfil(profilId: string): Promise<RoleApp[]> {
  const supabase = await clientServeur()
  const { data, error } = await supabase
    .from('roles_profil')
    .select('role')
    .eq('profil_id', profilId)

  // Ne jamais retomber sur une liste vide : « aucun rôle » et « la requête a
  // échoué » auraient alors le même effet, et un administrateur verrait ses
  // fonctions disparaître de l'écran sans qu'aucun message ne le lui dise.
  if (error) {
    throw new Error(`Lecture des rôles impossible : ${error.message}`)
  }

  return (data ?? []).map((ligne) => ligne.role as RoleApp)
}
