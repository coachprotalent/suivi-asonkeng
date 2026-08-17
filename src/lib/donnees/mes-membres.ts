import 'server-only'
import { clientAdmin } from '@/lib/supabase/admin'
import { clientServeur } from '@/lib/supabase/serveur'
import { descendanceParPage, membresParRelation } from './mes-membres-lots'
import type { MembreBref } from './membres'
import type { PageLue } from './pagination'

/**
 * Les quatre lectures de l'écran `/mes-membres` (phase 7, lot C).
 *
 * Ce module est la couche `server-only` : il CONSTRUIT les clients et délègue tout le reste
 * à `./mes-membres-lots`, qui n'en construit aucun. Ce découpage n'est pas un rangement —
 * c'est ce qui permet à `tests/rls/` de faire tourner le code de production hors de Next.js,
 * avec une taille de page abaissée. Même partage que `arbre.ts` / `arbre-lots.ts`.
 */

export { TAILLE_PAGE_MES_MEMBRES, type LigneDescendance } from './mes-membres-lots'

/** Section 1 — mes disciples DIRECTS, actifs. */
export async function mesDisciplesPage(
  membreId: string,
  page: number,
): Promise<PageLue<MembreBref>> {
  return membresParRelation(await clientServeur(), 'faiseur_de_disciple_id', membreId, { page })
}

/** Section 3 — ceux dont je suis le DIRIGEANT désigné, actifs. */
export async function mesDirigesPage(
  membreId: string,
  page: number,
): Promise<PageLue<MembreBref>> {
  return membresParRelation(await clientServeur(), 'dirigeant_id', membreId, { page })
}

/** Section 4 — ceux qui m'ont désigné comme CONTACT, actifs. */
export async function mesContactsPage(
  membreId: string,
  page: number,
): Promise<PageLue<MembreBref>> {
  return membresParRelation(await clientServeur(), 'contact_id', membreId, { page })
}

/**
 * Section 2 — ma descendance AU-DELÀ du niveau 1.
 *
 * DEUX CLIENTS : la clé de service pour la FORME de l'arbre, la lecture sous RLS pour les
 * NOMS (D141). C'est la seule des quatre sections qui en a besoin, et `descendanceParPage`
 * explique pourquoi.
 */
export async function maDescendancePage(
  membreId: string,
  page: number,
): Promise<PageLue<import('./mes-membres-lots').LigneDescendance>> {
  return descendanceParPage(clientAdmin(), await clientServeur(), membreId, { page })
}
