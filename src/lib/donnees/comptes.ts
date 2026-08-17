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
 *
 * COUVERTURE DE TEST : la branche qui rend `true` (« c'est bien le dernier
 * administrateur ») n'est exercée par aucun test dans cet environnement — même limite
 * arithmétique que le reste (compte racine réel, administrateur actif intouchable, voir
 * README). Mais l'inoffensivité de ce trou ne tient PAS qu'à cette impossibilité de
 * test : si cette fonction régressait au point de toujours rendre `false` (bug, code
 * mort, mauvais refactor), le comportement final resterait IDENTIQUE pour
 * l'utilisateur. `archiverMembre` (src/app/membres/actions.ts) fait correspondre le
 * marqueur `dernier_administrateur` levé par le déclencheur — `catch` sur l'échec de
 * `changerEtatMembre` — au MÊME `redirect(...archivageRefuseAdministrateur=1)` et donc
 * au même message affiché que ce contrôle amont. Le déclencheur, verrouillé et seul
 * décisif, rattrape intégralement toute défaillance de cette fonction : elle n'est
 * qu'une amélioration du message affiché (nommer la cause avant d'écrire), jamais la
 * dernière ligne de défense. Une régression ici ne rouvrirait donc PAS de brèche de
 * sécurité — elle ferait seulement perdre le message précis au profit du même refus,
 * un instant plus tard.
 */
export async function compteLieEstDernierAdministrateurActif(membreId: string): Promise<boolean> {
  const compte = await compteLieBrut(membreId)
  if (!compte) {
    return false
  }
  // DÉLÈGUE, ne recopie pas : voir `estDernierAdministrateurActif` juste en dessous. Le
  // contrôle du compte `actif` s'y trouve aussi — le dupliquer ici ne servirait qu'à créer
  // une seconde vérité à maintenir.
  return estDernierAdministrateurActif(compte.id)
}

/**
 * Ce COMPTE est-il le DERNIER administrateur actif du projet ?
 *
 * ═══ EXTRAITE, PAS RECOPIÉE (phase 8) ═══
 * `compteLieEstDernierAdministrateurActif` ci-dessus posait déjà exactement cette question,
 * mais à partir d'une FICHE MEMBRE. La suppression d'un compte la pose à partir d'un PROFIL.
 * Deux copies de ce verdict divergeraient au premier changement, et c'est un contrôle de
 * sécurité : les deux appelants doivent répondre la même chose au même instant.
 *
 * ═══ CE N'EST PAS LA DERNIÈRE LIGNE DE DÉFENSE ═══
 * Le déclencheur `profils_refuser_suppression` (20260821130000) reste seul décisif, et
 * rattrape intégralement une défaillance d'ici — comme le fait déjà le déclencheur
 * d'archivage pour l'autre appelante. Cette fonction n'améliore que le MESSAGE : nommer la
 * cause avant d'écrire, plutôt que de laisser remonter un échec générique. Une régression ici
 * ne rouvrirait donc AUCUNE brèche ; elle ferait perdre un message précis au profit du même
 * refus, un instant plus tard.
 *
 * Lue SOUS RLS : les deux appelants sont gardés par `exigerAdministrateur`, et
 * `profils_lecture` ouvre tous les profils à l'administrateur.
 */
export async function estDernierAdministrateurActif(profilId: string): Promise<boolean> {
  const supabase = await clientServeur()

  const { data: profil, error: erreurProfil } = await supabase
    .from('profils')
    .select('actif')
    .eq('id', profilId)
    .maybeSingle()
  if (erreurProfil) {
    throw new Error(`Lecture du compte impossible : ${erreurProfil.message}`)
  }
  // Un compte DÉSACTIVÉ n'est déjà plus compté parmi les administrateurs actifs : le
  // supprimer ne peut pas faire passer ce nombre de 1 à 0. Même raisonnement que la clause
  // `old.actif` du déclencheur.
  if (!profil || !profil.actif) {
    return false
  }

  const { data: role, error: erreurRole } = await supabase
    .from('roles_profil')
    .select('profil_id')
    .eq('profil_id', profilId)
    .eq('role', 'administrateur')
    .maybeSingle()
  if (erreurRole) {
    throw new Error(`Lecture du rôle du compte impossible : ${erreurRole.message}`)
  }
  if (!role) {
    return false
  }

  const { data: autresAdmins, error: erreurAutres } = await supabase
    .from('roles_profil')
    .select('profil_id')
    .eq('role', 'administrateur')
    .neq('profil_id', profilId)
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
