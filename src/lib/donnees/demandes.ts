import 'server-only'
import { clientServeur } from '@/lib/supabase/serveur'

export type DemandeListe = {
  id: string
  origine: 'auto_inscription' | 'demande_suivi'
  demandeurProfilId: string
  demandeurNom: string
  membreId: string | null
  membreNom: string | null
  membrePrenom: string | null
  etat: 'en_attente' | 'validee' | 'rejetee' | 'annulee'
  motifRejet: string | null
  traiteParNom: string | null
  traiteLe: string | null
  creeLe: string
  demandeurMembreId: string | null
}

const COLONNES =
  'id, origine, demandeur_profil_id, membre_id, etat, motif_rejet, traite_le, cree_le, ' +
  'membres(nom, prenom), ' +
  'demandeur:profils!demandes_membre_demandeur_profil_id_fkey(nom_affichage, membre_id), ' +
  'traiteur:profils!demandes_membre_traite_par_fkey(nom_affichage)'

type LigneMembre = { nom: string; prenom: string } | { nom: string; prenom: string }[] | null
type LigneProfil =
  | { nom_affichage: string; membre_id?: string | null }
  | { nom_affichage: string; membre_id?: string | null }[]
  | null

function premier<T>(valeur: T | T[] | null): T | null {
  if (!valeur) return null
  return Array.isArray(valeur) ? (valeur[0] ?? null) : valeur
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function versDemandeListe(ligne: any): DemandeListe {
  const membre = premier(ligne.membres as LigneMembre)
  // `demandeur` ne peut PAS être absent : demandeur_profil_id est NOT NULL et la
  // clé étrangère garantit qu'un profil existe. `?? 'Compte supprimé'` est un
  // filet, pas un cas normal attendu.
  const demandeur = premier(ligne.demandeur as LigneProfil)
  const traiteur = premier(ligne.traiteur as LigneProfil)
  return {
    id: ligne.id as string,
    origine: ligne.origine as DemandeListe['origine'],
    demandeurProfilId: ligne.demandeur_profil_id as string,
    demandeurNom: demandeur?.nom_affichage ?? 'Compte supprimé',
    membreId: ligne.membre_id as string | null,
    membreNom: membre?.nom ?? null,
    membrePrenom: membre?.prenom ?? null,
    etat: ligne.etat as DemandeListe['etat'],
    motifRejet: ligne.motif_rejet as string | null,
    traiteParNom: traiteur?.nom_affichage ?? null,
    traiteLe: ligne.traite_le as string | null,
    creeLe: ligne.cree_le as string,
    demandeurMembreId: demandeur?.membre_id ?? null,
  }
}

/**
 * Demandes en_attente, les deux origines confondues (design 2b §4, écran
 * `/demandes`). Sous RLS : réservée à l'administrateur par la politique
 * `demandes_membre_lecture`, l'écran est de toute façon derrière
 * `exigerAdministrateur`.
 */
export async function listerDemandesEnAttente(): Promise<DemandeListe[]> {
  const supabase = await clientServeur()
  const { data, error } = await supabase
    .from('demandes_membre')
    .select(COLONNES)
    .eq('etat', 'en_attente')
    .order('cree_le')

  if (error) {
    throw new Error(`Lecture des demandes impossible : ${error.message}`)
  }
  return (data ?? []).map(versDemandeListe)
}

/**
 * Toutes les demandes d'un compte, quel que soit leur état, les plus récentes en
 * tête. `profilId` filtre EXPLICITEMENT, en plus de la RLS : la politique
 * `demandes_membre_lecture` laisserait un ADMINISTRATEUR voir toutes les demandes
 * si `profilId` référait un compte administrateur — ce filtre garantit que « mes
 * demandes » ne montre jamais que les siennes, même pour un administrateur.
 */
export async function mesDemandes(profilId: string): Promise<DemandeListe[]> {
  const supabase = await clientServeur()
  const { data, error } = await supabase
    .from('demandes_membre')
    .select(COLONNES)
    .eq('demandeur_profil_id', profilId)
    .order('cree_le', { ascending: false })

  if (error) {
    throw new Error(`Lecture de mes demandes impossible : ${error.message}`)
  }
  return (data ?? []).map(versDemandeListe)
}

/** Une demande précise, ou `null` si elle n'existe pas ou n'est pas visible. */
export async function demandeParId(id: string): Promise<DemandeListe | null> {
  const supabase = await clientServeur()
  const { data, error } = await supabase.from('demandes_membre').select(COLONNES).eq('id', id).maybeSingle()

  if (error) {
    throw new Error(`Lecture de la demande impossible : ${error.message}`)
  }
  if (!data) return null
  return versDemandeListe(data)
}
