import { redirect } from 'next/navigation'
import { nombreDePages } from '@/lib/donnees/pagination'

/**
 * ═══ D121 — LE BORNAGE DE PAGE, RECOPIÉ DANS SEPT SITES SUR SIX FICHIERS, EXTRAIT ICI ═══
 *
 * Une adresse pointant au-delà de la dernière page réelle est un signet périmé, ou un
 * résultat qui a rétréci depuis. Sans ce garde, l'en-tête affichait « N membres · page 99
 * sur 2 » pendant que le corps affirmait qu'aucun membre ne correspond — DEUX VÉRITÉS
 * CONTRADICTOIRES SUR LE MÊME ÉCRAN. On corrige l'adresse vers la dernière page réelle
 * plutôt que de laisser tenir ce mensonge.
 *
 * ═══ POURQUOI UN MODULE À PART DE `src/lib/donnees/pagination.ts` ═══
 *
 * `pagination.ts` porte, DÉLIBÉRÉMENT et par commentaire de tête, l'absence de
 * `import 'server-only'`, pour que `tests/rls/` fasse tourner exactement ce code hors de
 * Next.js. Y importer `next/navigation` détruirait cette propriété : le module ne
 * s'évaluerait plus hors du contexte Next. Le CALCUL reste donc là-bas, pur et testable ;
 * la REDIRECTION vit ici.
 *
 * ═══ CE QUE CETTE FONCTION NE FAIT PAS, ET C'EST VOLONTAIRE ═══
 *
 * Elle NE LIT RIEN. Le `total` lui est DONNÉ, et il doit venir de la lecture elle-même,
 * jamais d'un aller-retour préalable : un pré-calcul de borne s'est révélé PLUS FRAGILE que
 * le motif qu'il imitait — une écriture concurrente entre les deux appels périmait la borne
 * déjà calculée et faisait échouer la lecture (`PGRST103`, non attrapée là), plantant
 * l'écran au lieu de rediriger (I1, ronde du 2026-08-14).
 *
 * Elle NE DÉCIDE D'AUCUN ACCÈS. Deux des sept sites sont sous condition — `if (peutGerer)`
 * dans `evenements/[id]/page.tsx`, `if (estAdmin)` dans `demandes/page.tsx`. Ces conditions
 * RESTENT AU SITE D'APPEL : les absorber ici ferait de cette fonction une décision
 * d'autorisation, ce qu'elle n'est pas, et ce que le projet interdit de confondre.
 *
 * ⚠️ `redirect()` LÈVE UNE EXCEPTION DE CONTRÔLE NEXT.JS. Cette fonction, et donc tout
 * appel à elle, DOIT rester HORS DE TOUT `try`. Aucun des six fichiers appelants n'en
 * contient — vérifié le 2026-08-16, et chacun le dit en commentaire.
 *
 * @returns le nombre de pages, pour que l'appelant l'affiche sans le recalculer.
 */
export function bornerPage(
  page: number,
  total: number,
  taillePage: number,
  lienVersPage: (page: number) => string,
): number {
  const pages = nombreDePages(total, taillePage)
  if (page > pages) {
    // PAS DE BOUCLE POSSIBLE : `pages` vaut toujours au moins 1, et la cible est `pages`
    // lui-même — la page rechargée aura `page === pages`, qui ne redéclenche pas la
    // condition.
    redirect(lienVersPage(pages))
  }
  return pages
}
