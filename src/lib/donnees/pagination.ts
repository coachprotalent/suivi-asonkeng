/**
 * PLOMBERIE COMMUNE DE LA PAGINATION — extraite d'`evenements-lots.ts` par la vague de
 * correction post-revue (I4), pour qu'une seconde liste puisse s'y appuyer sans recopier
 * les garde-fous.
 *
 * PAS de `import 'server-only'`, pour la même raison qu'`evenements-lots.ts` : ces trois
 * outils ne touchent ni cookies ni clé de service, et `tests/rls/` doit pouvoir faire
 * tourner EXACTEMENT ce code hors de Next.js.
 *
 * POURQUOI UN MODULE À PART plutôt qu'un export de plus depuis `evenements-lots.ts` : la
 * lecture des demandes est de la phase 2b et n'a rien à voir avec les évènements. La faire
 * dépendre d'un module de la phase 4 pour deux garde-fous génériques aurait créé une
 * dépendance qui ne dit pas la vérité sur ce qui appelle quoi.
 */

/** Une page lue, avec le TOTAL de l'ensemble filtré — jamais la longueur de la page. */
export type PageLue<T> = { lignes: T[]; total: number }

/**
 * PostgREST tronque EN SILENCE au-delà de `max_rows = 1000` (`supabase/config.toml:18`).
 * Une taille de page qui l'atteint rendrait la pagination inutile : la page serait rognée
 * sans que rien ne le dise. On LÈVE plutôt que de borner en douce — borner masquerait un
 * appel erroné derrière un comportement différent de celui demandé.
 */
export function verifierTaillePage(taillePage: number, fonction: string): void {
  if (!Number.isInteger(taillePage) || taillePage < 1 || taillePage >= 1000) {
    throw new Error(
      `${fonction} : taillePage invalide (${taillePage}) — doit être un entier compris entre 1 et 999 inclus (max_rows PostgREST = 1000, supabase/config.toml:18).`,
    )
  }
}

/**
 * `count` absent de la réponse PostgREST : retomber sur la longueur de la page serait un
 * MENSONGE — l'écran annoncerait « 25 lignes » pour une base qui en compte mille, et la
 * pagination s'arrêterait à la première page. Même discipline que `listerMembres`.
 */
export function totalObligatoire(count: number | null, fonction: string): number {
  if (count === null) {
    throw new Error(`${fonction} : comptage absent de la réponse PostgREST.`)
  }
  return count
}

/**
 * Numéro de page tiré d'un paramètre d'URL. `Number.parseInt` et NON `Number(...)` :
 * `Number('2.5') || 1` vaut `2.5`, un nombre non entier qui franchit le garde `page > pages`
 * des écrans (`2.5 > 2` est vrai, mais une fois redirigé vers une page entière il ne
 * redéclenche plus jamais rien) et s'affiche sous l'étiquette « Page 2.5 sur N » tout en
 * rendant le contenu de la page 1 — M5 de la ronde du 2026-08-14.
 */
export function pageDemandee(brut: string | undefined): number {
  const valeur = Number.parseInt(brut ?? '1', 10)
  return Number.isFinite(valeur) && valeur > 0 ? valeur : 1
}

/**
 * Nombre de pages d'un ensemble filtré. **Toujours au moins 1**, même pour un total nul.
 *
 * CE `Math.max(1, …)` N'EST PAS UNE COQUETTERIE : c'est ce qui rend le bornage de page
 * NON BOUCLANT. La cible de la redirection est `pages` lui-même ; si `pages` pouvait valoir
 * 0 sur une liste vide, la page rechargée porterait `page=0`, que `pageDemandee` ramène à
 * 1, qui redéclenche `1 > 0` — et l'écran tournerait en rond. Les six écrans paginés du
 * dépôt écrivent tous ce `Math.max(1, …)` à la main, et chacun l'explique en commentaire.
 *
 * PAS de `import 'server-only'` ici, comme dans tout ce module : ces outils ne touchent ni
 * cookies ni clé de service, et `tests/rls/` doit pouvoir faire tourner EXACTEMENT ce code
 * hors de Next.js. C'est aussi ce qui rend cette fonction testable dans l'environnement
 * `node` de `vitest.config.ts`.
 */
export function nombreDePages(total: number, taillePage: number): number {
  return Math.max(1, Math.ceil(total / taillePage))
}
