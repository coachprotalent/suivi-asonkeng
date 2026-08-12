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
  // Archiver une fiche ne révoque PAS l'autorité du compte qui lui est liée (spec §7,
  // décision utilisateur hors périmètre de cette phase) : un dirigeant ou un faiseur
  // de disciple archivé garde tout pouvoir sur ses subordonnés tant que son compte
  // reste actif. Ce champ existe pour qu'un administrateur puisse au moins LE VOIR sur
  // `/comptes` — voir `ligne-compte.tsx`.
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
