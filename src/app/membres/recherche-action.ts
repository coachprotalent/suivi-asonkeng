'use server'

import { rechercherMembres, type MembreBref } from '@/lib/donnees/membres'
import { exigerProfilActif } from '@/lib/securite/garde'

/**
 * Recherche de membres pour un sélecteur. Derrière `exigerProfilActif` : la lecture de
 * l'annuaire est ouverte à tout compte actif (spec D2), mais pas aux visiteurs — et
 * toute Server Action exportée est appelable depuis le navigateur, donc doit avoir son
 * garde, même quand elle ne fait que lire.
 */
export async function chercherMembres(
  terme: string,
  exclureId: string | null,
): Promise<MembreBref[]> {
  await exigerProfilActif()
  return rechercherMembres(terme, exclureId ?? undefined)
}
