import 'server-only'
import { clientServeur } from '@/lib/supabase/serveur'

export type TokenListe = {
  id: string
  mode: 'nominatif' | 'generique'
  membreId: string | null
  membreNom: string | null
  creeParNom: string | null
  creeLe: string
  expireLe: string
  revoqueLe: string | null
  utiliseLe: string | null
  utiliseParNom: string | null
}

const COLONNES =
  'id, mode, membre_id, cree_le, expire_le, revoque_le, utilise_le, ' +
  'membres(nom, prenom), ' +
  'createur:profils!tokens_inscription_cree_par_fkey(nom_affichage), ' +
  'utilisateur:profils!tokens_inscription_utilise_par_profil_id_fkey(nom_affichage)'

type LigneMembre = { nom: string; prenom: string } | { nom: string; prenom: string }[] | null
type LigneProfil = { nom_affichage: string } | { nom_affichage: string }[] | null

function premier<T>(valeur: T | T[] | null): T | null {
  if (!valeur) return null
  return Array.isArray(valeur) ? (valeur[0] ?? null) : valeur
}

/**
 * Tous les tokens d'inscription, quel que soit leur état, du plus récent au plus
 * ancien. Sous RLS (`clientServeur`) : la politique `tokens_inscription_lecture`
 * réserve cette lecture à l'administrateur — l'écran est de toute façon derrière
 * `exigerAdministrateur`, mais s'appuyer sur la RLS plutôt que sur la clé de
 * service maintient le filet, comme `listerComptes` en 1c.
 */
export async function listerTokens(): Promise<TokenListe[]> {
  const supabase = await clientServeur()
  const { data, error } = await supabase
    .from('tokens_inscription')
    .select(COLONNES)
    .order('cree_le', { ascending: false })

  if (error) {
    throw new Error(`Lecture des tokens impossible : ${error.message}`)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((ligne: any) => {
    const membre = premier(ligne.membres as LigneMembre)
    const createur = premier(ligne.createur as LigneProfil)
    const utilisateur = premier(ligne.utilisateur as LigneProfil)
    return {
      id: ligne.id as string,
      mode: ligne.mode as 'nominatif' | 'generique',
      membreId: ligne.membre_id as string | null,
      membreNom: membre ? `${membre.prenom} ${membre.nom}` : null,
      creeParNom: createur?.nom_affichage ?? null,
      creeLe: ligne.cree_le as string,
      expireLe: ligne.expire_le as string,
      revoqueLe: ligne.revoque_le as string | null,
      utiliseLe: ligne.utilise_le as string | null,
      utiliseParNom: utilisateur?.nom_affichage ?? null,
    }
  })
}
