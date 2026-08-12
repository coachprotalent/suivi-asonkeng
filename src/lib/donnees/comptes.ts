import 'server-only'
import type { EtatMembre } from '@/lib/domaine/membre'
import { clientServeur } from '@/lib/supabase/serveur'
import type { RoleApp } from './profils'

export type CompteListe = {
  id: string
  identifiant: string
  nomAffichage: string
  membreId: string | null
  membreNom: string | null
  // Depuis D24 (migration 20260814160000), archiver une fiche désactive automatiquement
  // le compte ACTIF qui lui est lié : ce champ n'a donc plus, dans le cas courant, à
  // signaler un compte qui garderait tout pouvoir malgré une fiche archivée. Il reste
  // utile pour le cas résiduel — un administrateur qui réactive ce compte séparément,
  // sur cet écran, sans rétablir la fiche : la ligne afficherait alors « Actif » à côté
  // d'une fiche archivée, sans que rien d'autre ne le signale. Voir `ligne-compte.tsx`.
  membreEtat: EtatMembre | null
  estRacine: boolean
  actif: boolean
  roles: RoleApp[]
}

type LigneMembre =
  | { nom: string; prenom: string; etat: EtatMembre }
  | { nom: string; prenom: string; etat: EtatMembre }[]
  | null

function membreDeLaLigne(valeur: LigneMembre): { nom: string; prenom: string; etat: EtatMembre } | null {
  if (!valeur) return null
  return Array.isArray(valeur) ? (valeur[0] ?? null) : valeur
}

function nomMembre(valeur: LigneMembre): string | null {
  const membre = membreDeLaLigne(valeur)
  return membre ? `${membre.prenom} ${membre.nom}` : null
}

/**
 * Tous les comptes, avec leur fiche liée et leurs rôles.
 *
 * Sous RLS : la politique `profils_lecture` ne laisse un non-administrateur voir que son
 * propre profil. L'écran est de toute façon derrière `exigerAdministrateur`, mais
 * s'appuyer sur la RLS plutôt que sur la clé de service maintient le filet : une erreur
 * de garde ne suffirait pas à faire fuiter la liste des comptes.
 */
export async function listerComptes(): Promise<CompteListe[]> {
  const supabase = await clientServeur()
  const { data, error } = await supabase
    .from('profils')
    // `membres!profils_membre_id_fkey` et non `membres` seul : `profils` et `membres` sont
    // reliés par DEUX relations distinctes (`profils.membre_id -> membres.id`, celle
    // voulue ici, et `membres.cree_par -> profils.id`, la fiche créée par ce compte).
    // Sans le nom de contrainte, PostgREST refuse d'embarquer et répond « more than one
    // relationship was found for 'profils' and 'membres' » — observé au rejeu contre la
    // vraie base, pas déduit du schéma.
    .select(
      'id, identifiant, nom_affichage, membre_id, est_racine, actif, membres!profils_membre_id_fkey(nom, prenom, etat), roles_profil(role)',
    )
    .order('identifiant')

  if (error) {
    // Un échec ne doit pas être indistinguable d'une liste vide : annoncer « aucun
    // compte » quand la requête a échoué inviterait à en recréer un qui existe déjà.
    throw new Error(`Lecture des comptes impossible : ${error.message}`)
  }

  return (data ?? []).map((ligne) => ({
    id: ligne.id as string,
    identifiant: ligne.identifiant as string,
    nomAffichage: ligne.nom_affichage as string,
    membreId: ligne.membre_id as string | null,
    membreNom: nomMembre(ligne.membres as LigneMembre),
    membreEtat: membreDeLaLigne(ligne.membres as LigneMembre)?.etat ?? null,
    estRacine: ligne.est_racine as boolean,
    actif: ligne.actif as boolean,
    roles: ((ligne.roles_profil ?? []) as Array<{ role: RoleApp }>).map((r) => r.role),
  }))
}

/**
 * Le compte lié à cette fiche, ou `null` si aucun. Interne : sert de base commune à
 * `etatCompteLie` (affichage) et `compteLieEstDernierAdministrateurActif` (contrôle),
 * juste en dessous.
 */
async function compteLieBrut(membreId: string): Promise<{ id: string; actif: boolean } | null> {
  const supabase = await clientServeur()
  const { data, error } = await supabase
    .from('profils')
    .select('id, actif')
    .eq('membre_id', membreId)
    .maybeSingle()
  if (error) {
    throw new Error(`Lecture du compte lié impossible : ${error.message}`)
  }
  return data
}

/**
 * `true` si un compte ACTIF est lié à cette fiche, `false` si le compte lié est déjà
 * désactivé, `null` si aucun compte n'y est lié.
 *
 * Sert uniquement à choisir le bon avertissement dans `BoutonArchiver` (D24,
 * `src/app/membres/[id]/bouton-archiver.tsx`) — ce n'est PAS une décision de sécurité :
 * le déclencheur `membres_archivage_desactive_compte` (migration 20260814160000) reste
 * seul décisif sur ce que l'archivage fait réellement au compte.
 */
export async function etatCompteLie(membreId: string): Promise<boolean | null> {
  const compte = await compteLieBrut(membreId)
  return compte ? compte.actif : null
}

/**
 * Vrai si le compte lié à ce membre est actif, porte le rôle administrateur, ET est le
 * SEUL administrateur actif de l'application — c'est-à-dire si archiver cette fiche
 * désactiverait ce compte (déclencheur `membres_archivage_desactive_compte`, migration
 * 20260814160000) et laisserait l'application sans administrateur (spec §7, D24 croise
 * la protection du dernier administrateur).
 *
 * Contrôle EN AMONT, pour produire un message qui nomme la cause avant d'écrire — même
 * partage que `disciplesDe` pour `archiverMembre` (src/app/membres/actions.ts) : le
 * déclencheur reste la barrière, sous le verrou consultatif (clé (20260814, 2)) que
 * `definir_roles` / `definir_actif_compte` emploient déjà. CETTE LECTURE NE PREND PAS ce
 * verrou — elle peut donc se tromper sous une mutation concurrente survenant entre
 * cette lecture et l'écriture qui suit — et n'a pas à s'y soustraire : c'est le
 * déclencheur, lui verrouillé, qui reste seul décisif.
 *
 * Lecture sous RLS (`clientServeur`) et non par la clé de service : l'appelant a déjà
 * passé `exigerAdministrateur`, et la politique `profils_lecture` laisse un
 * administrateur voir TOUS les profils et rôles — le même univers que compte
 * `prive.compter_administrateurs_actifs`, jamais exposée à l'API.
 */
export async function compteLieEstDernierAdministrateurActif(membreId: string): Promise<boolean> {
  const compte = await compteLieBrut(membreId)
  if (!compte || !compte.actif) {
    return false
  }

  const supabase = await clientServeur()

  const { data: role, error: erreurRole } = await supabase
    .from('roles_profil')
    .select('profil_id')
    .eq('profil_id', compte.id)
    .eq('role', 'administrateur')
    .maybeSingle()
  if (erreurRole) {
    throw new Error(`Lecture du rôle du compte lié impossible : ${erreurRole.message}`)
  }
  if (!role) {
    return false
  }

  const { data: autresAdmins, error: erreurAutres } = await supabase
    .from('roles_profil')
    .select('profil_id')
    .eq('role', 'administrateur')
    .neq('profil_id', compte.id)
  if (erreurAutres) {
    throw new Error(`Lecture des autres administrateurs impossible : ${erreurAutres.message}`)
  }
  const idsAutres = (autresAdmins ?? []).map((l) => l.profil_id as string)
  if (idsAutres.length === 0) {
    return true
  }

  const { data: profilsActifs, error: erreurProfilsActifs } = await supabase
    .from('profils')
    .select('id')
    .in('id', idsAutres)
    .eq('actif', true)
  if (erreurProfilsActifs) {
    throw new Error(
      `Lecture des comptes administrateurs impossible : ${erreurProfilsActifs.message}`,
    )
  }
  return (profilsActifs ?? []).length === 0
}
