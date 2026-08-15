import type { SupabaseClient } from '@supabase/supabase-js'
import { totalObligatoire, verifierTaillePage, type PageLue } from './pagination'
import type { MembreBref } from './membres'

/**
 * PAS de `import 'server-only'` ici, à la différence de `src/lib/donnees/arbre.ts` —
 * délibéré, même motif que `membres-lots.ts`, `presences-lots.ts` et
 * `evenements-lots.ts` : les fonctions ci-dessous reçoivent leur client Supabase DÉJÀ
 * CONSTRUIT, en paramètre, et ne touchent ni cookies ni clé de service. L'isoler permet à
 * `tests/rls/arborescence.test.ts` (vitest, hors Next.js) de faire tourner EXACTEMENT ce
 * code de production contre la vraie base, avec une taille de page abaissée — chose
 * impossible si ces fonctions vivaient dans un module `server-only`, dont le `throw` nu
 * n'est neutralisé que par l'alias du bundler Next.
 *
 * `import type { MembreBref }` est un import de TYPE : il est effacé à la compilation et
 * ne tire donc PAS `membres.ts` (server-only) dans ce module. Même astuce que
 * `membres-lots.ts`.
 */

/**
 * D94, D95 — LES DEUX LECTURES DE L'ARBRE SONT PAGINÉES, AVEC UN TRI TOTAL.
 *
 * PostgREST tronque EN SILENCE au-delà de `max_rows = 1000` (`supabase/config.toml:18`).
 * Sur l'arbre, une troncature ne produirait pas une page incomplète : elle produirait une
 * BRANCHE AMPUTÉE SANS LE MOINDRE SIGNAL, indistinguable d'un faiseur de disciple qui
 * aurait exactement mille disciples.
 *
 * Les deux tailles sont EXPORTÉES : la preuve de non-troncature
 * (`tests/rls/arborescence.test.ts`) appelle ces fonctions avec une taille ramenée à deux
 * ou trois lignes, pour franchir une VRAIE frontière de page sans créer un millier de
 * lignes en base de PRODUCTION.
 */
export const TAILLE_PAGE_DISCIPLES = 25
export const TAILLE_PAGE_RACINES = 50

/**
 * D102 — AUCUN INDEX NOUVEAU, ET LE CANDIDAT EST NOMMÉ ICI POUR N'AVOIR PAS À ÊTRE
 * REDÉCOUVERT :
 *
 *   create index membres_arbre_idx on public.membres (faiseur_de_disciple_id, nom, prenom, id)
 *     where etat = 'actif';
 *
 * Il rendrait le tri des enfants ET celui des racines ORDONNÉS PAR L'INDEX, donc sans tri
 * explicite. `membres_faiseur_de_disciple_id_idx` (20260812120000) existe déjà et sert le
 * filtre, y compris `is null` — un B-tree indexe les NULL. À l'échelle de D18, le tri
 * porte sur une poignée de lignes par nœud, et la liste des racines n'est pas plus lourde
 * que l'annuaire, qui vit sans index de tri depuis la 1c. ON POSE L'INDEX QUAND UNE MESURE
 * LE DEMANDERA, PAS SUR UNE INTUITION.
 */

/**
 * Compte les disciples ACTIFS d'un membre, sans `range` — REPLI de `disciplesParPage`
 * quand PostgREST refuse sa lecture paginée (`PGRST103`), cas où son `count` normal
 * n'arrive jamais. JAMAIS appelée EN AMONT pour pré-calculer une borne : ce serait ouvrir
 * la fenêtre de course que la ronde I1 du 2026-08-14 a refermée.
 */
async function compterDisciples(supabase: SupabaseClient, membreId: string): Promise<number> {
  const { count, error } = await supabase
    .from('membres')
    .select('id', { count: 'exact', head: true })
    .eq('faiseur_de_disciple_id', membreId)
    .eq('etat', 'actif')
  if (error) {
    throw new Error(`Comptage des disciples impossible : ${error.message}`)
  }
  return totalObligatoire(count, 'compterDisciples')
}

/**
 * Une page de disciples ACTIFS d'un membre (D94).
 *
 * `etat = 'actif'` EXPLICITEMENT, et pas seulement via la RLS (D93). Un filtre explicite
 * est une RÈGLE ÉNONCÉE ; un trou creusé par la RLS est un MENSONGE — le contenu de
 * l'écran dépendrait alors du lecteur sans que rien ne le dise. Conséquence directe et
 * voulue : un compte ordinaire et un administrateur voient LE MÊME ARBRE.
 *
 * `count: 'exact'` : le nœud affiche « N disciples », JAMAIS la longueur de la page.
 * `totalObligatoire` refuse un `count` absent — retomber sur la longueur de la page
 * annoncerait « 25 disciples » pour un faiseur qui en a deux cents.
 *
 * TRI TOTAL, `id` en TROISIÈME critère : `(nom, prenom)` n'est pas unique, et deux
 * homonymes exacts à cheval sur une frontière de page seraient rendus deux fois ou JAMAIS.
 *
 * `disciplesDe` N'EST NI APPELÉE NI MODIFIÉE (D94) : elle a un second appelant porteur, le
 * contrôle amont d'`archiverMembre`, qui doit rester COMPLET.
 */
export async function disciplesParPage(
  supabase: SupabaseClient,
  membreId: string,
  options?: { page?: number; taillePage?: number },
): Promise<PageLue<MembreBref>> {
  const taillePage = options?.taillePage ?? TAILLE_PAGE_DISCIPLES
  verifierTaillePage(taillePage, 'disciplesParPage')
  const page = Math.max(1, options?.page ?? 1)
  const debut = (page - 1) * taillePage

  const { data, error, count } = await supabase
    .from('membres')
    .select('id, nom, prenom', { count: 'exact' })
    .eq('faiseur_de_disciple_id', membreId)
    .eq('etat', 'actif')
    .order('nom')
    .order('prenom')
    .order('id')
    .range(debut, debut + taillePage - 1)

  if (error) {
    // `PGRST103` ATTRAPÉE ICI, SUR LA LECTURE ELLE-MÊME — motif éprouvé de
    // `listerMembres`, PAS le motif fragile qu'il a remplacé : pré-calculer la borne par
    // un premier aller-retour ouvre une fenêtre de course qu'une suppression concurrente
    // franchit. Page hors bornes (signet périmé, ou branche qui a rétréci depuis) :
    // PostgREST refuse la requête ENTIÈRE, `count` compris.
    if (error.code === 'PGRST103') {
      return { lignes: [], total: await compterDisciples(supabase, membreId) }
    }
    // Un échec ne doit pas être indistinguable d'un nœud sans disciple : annoncer
    // « aucun disciple » alors que la requête a échoué ferait croire à un faiseur de
    // disciple sans personne, ce qui est la même famille de mensonge que la troncature.
    throw new Error(`Lecture des disciples impossible : ${error.message}`)
  }

  return {
    lignes: (data ?? []).map((ligne) => ({
      id: ligne.id as string,
      nom: ligne.nom as string,
      prenom: ligne.prenom as string,
    })),
    total: totalObligatoire(count, 'disciplesParPage'),
  }
}

/** Repli de `racinesParPage`, même rôle et même interdiction que `compterDisciples`. */
async function compterRacines(supabase: SupabaseClient): Promise<number> {
  const { count, error } = await supabase
    .from('membres')
    .select('id', { count: 'exact', head: true })
    .is('faiseur_de_disciple_id', null)
    .eq('etat', 'actif')
  if (error) {
    throw new Error(`Comptage des membres sans faiseur de disciple impossible : ${error.message}`)
  }
  return totalObligatoire(count, 'compterRacines')
}

/**
 * Une page de membres ACTIFS SANS FAISEUR DE DISCIPLE (D95).
 *
 * ═══ « MEMBRES SANS FAISEUR DE DISCIPLE », PAS « RACINES » ═══
 * Le §6 de la spécification maîtresse SUPPOSE les racines peu nombreuses — « les tout
 * premiers sans faiseur de disciple, ce sont les racines de l'arbre ». RIEN NE LE
 * GARANTIT, et le code disait le contraire : `creerMembre` n'a jamais écrit de
 * `faiseur_de_disciple_id`, donc toute fiche créée depuis la 1a est une racine tant que
 * personne n'ouvre l'écran de rattachement. Appeler « racine » une fiche simplement jamais
 * rattachée prêterait une INTENTION à un OUBLI. L'écran le dit donc autrement, et
 * « racines de l'arbre » n'y est qu'une glose.
 *
 * LE TOTAL EST AFFICHÉ, sans euphémisme : c'est LA MESURE qui dira si la création enrichie
 * (volet 1) réduit le nombre de racines involontaires.
 *
 * `.is('faiseur_de_disciple_id', null)` : le B-tree
 * `membres_faiseur_de_disciple_id_idx` indexe les NULL et sert donc ce filtre.
 */
export async function racinesParPage(
  supabase: SupabaseClient,
  options?: { page?: number; taillePage?: number },
): Promise<PageLue<MembreBref>> {
  const taillePage = options?.taillePage ?? TAILLE_PAGE_RACINES
  verifierTaillePage(taillePage, 'racinesParPage')
  const page = Math.max(1, options?.page ?? 1)
  const debut = (page - 1) * taillePage

  const { data, error, count } = await supabase
    .from('membres')
    .select('id, nom, prenom', { count: 'exact' })
    .is('faiseur_de_disciple_id', null)
    .eq('etat', 'actif')
    .order('nom')
    .order('prenom')
    .order('id')
    .range(debut, debut + taillePage - 1)

  if (error) {
    if (error.code === 'PGRST103') {
      return { lignes: [], total: await compterRacines(supabase) }
    }
    throw new Error(`Lecture des membres sans faiseur de disciple impossible : ${error.message}`)
  }

  return {
    lignes: (data ?? []).map((ligne) => ({
      id: ligne.id as string,
      nom: ligne.nom as string,
      prenom: ligne.prenom as string,
    })),
    total: totalObligatoire(count, 'racinesParPage'),
  }
}

/**
 * Noms des maillons d'un chemin, filtrés `etat = 'actif'` EXPLICITEMENT (D93).
 *
 * ═══ POURQUOI CETTE FONCTION EXISTE, ET POURQUOI ELLE N'EST PAS `membresBrefsParIds` ═══
 *
 * `membresBrefsParIds` (`src/lib/donnees/membres.ts`) ne porte AUCUN filtre d'état et lit
 * sous RLS. Or la politique `membres_lecture` délègue à `prive.peut_lire_membre`, qui ouvre
 * TOUTE fiche à l'administrateur. Employée pour nommer les maillons d'un chemin, elle
 * produirait donc deux arbres différents : un administrateur lirait le NOM d'un maillon
 * archivé ou en attente, là où un compte ordinaire lit « Fiche non consultable ». L'écran,
 * lui, annonce que seuls les membres actifs y figurent — il mentirait.
 *
 * C'est exactement ce que D93 refuse : un filtre explicite est une RÈGLE ÉNONCÉE, un trou
 * creusé par la RLS est un MENSONGE. Ici, la règle est énoncée POUR TOUS LES RÔLES, et
 * l'exclusion ne dépend plus du lecteur.
 *
 * ═══ ET `membresBrefsParIds` N'EST PAS MODIFIÉE ═══
 * Elle a CINQ autres appelants (`ael/seances/[id]`, `demandes`, `membres/[id]/arbre` —
 * action et page —, `membres/[id]`), dont plusieurs doivent au contraire nommer des fiches
 * NON actives. Lui ajouter un filtre les casserait en silence. Même raison qui protège
 * `disciplesDe` en D94 : deux besoins différents, deux fonctions.
 *
 * ═══ CE QU'ELLE NE FAIT PAS ═══
 * Elle ne complète pas les trous. Un identifiant absent du résultat — parce que la fiche
 * n'est pas active, ou parce que la RLS la cache — est simplement ABSENT. C'est
 * `cheminAvecLibelles` (couche domaine) qui le rend « Fiche non consultable », À SA PLACE
 * dans le chemin : l'effacer ferait mentir l'écran sur la profondeur.
 *
 * Découpée en lots de 500, comme `membresBrefsParIds` : `.in('id', lot)` sur la clé
 * primaire ne peut jamais rendre plus de lignes que `lot.length`, donc aucun `.range()`
 * n'est nécessaire — mais un `ids` un jour plus long que `max_rows` (1000) resterait
 * tronqué par PostgREST sans ce découpage.
 */
export async function nomsMaillonsActifs(
  supabase: SupabaseClient,
  ids: readonly string[],
): Promise<MembreBref[]> {
  if (ids.length === 0) {
    return []
  }
  const TAILLE_LOT = 500
  const resultat: MembreBref[] = []
  for (let debut = 0; debut < ids.length; debut += TAILLE_LOT) {
    const lot = ids.slice(debut, debut + TAILLE_LOT)
    const { data, error } = await supabase
      .from('membres')
      .select('id, nom, prenom')
      .in('id', lot)
      .eq('etat', 'actif')
    // Un échec de lecture ne doit pas être indistinguable d'un maillon illisible : rendre
    // `[]` ferait afficher « Fiche non consultable » sur TOUT le chemin, et personne ne
    // saurait que la base est en panne.
    if (error) {
      throw new Error(`Lecture des maillons du chemin impossible : ${error.message}`)
    }
    resultat.push(
      ...(data ?? []).map((ligne) => ({
        id: ligne.id as string,
        nom: ligne.nom as string,
        prenom: ligne.prenom as string,
      })),
    )
  }
  return resultat
}

/**
 * Échappe une valeur destinée à une expression `or(...)` de PostgREST.
 *
 * NON DÉCORATIF. Dans `nom.lt.Dupont`, la valeur est lue jusqu'à la prochaine virgule ou
 * parenthèse : un nom contenant `,`, `(`, `)`, `.`, `"` ou `\` — « Dupont, Jean »,
 * « O'Neill (père) » — casserait l'expression, ou pire, la ferait porter sur autre chose
 * que ce qu'on croit. PostgREST accepte une valeur entre GUILLEMETS DOUBLES, dans lesquels
 * `"` et `\` s'échappent par `\`. On cite donc TOUJOURS, sans se demander si c'est
 * nécessaire : le jour où ça le devient, personne ne s'en apercevra autrement.
 */
function citerValeurPostgrest(valeur: string): string {
  return `"${valeur.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/**
 * Numéro de la page de `disciplesParPage(parentId, …)` qui CONTIENT `discipleId`.
 *
 * ═══ CE QUE CETTE FONCTION EMPÊCHE ═══
 * Sans elle, la recherche de l'écran `/arborescence` chargerait TOUJOURS la page 1 de
 * chaque maillon du chemin. Au premier maillon qui a plus de `TAILLE_PAGE_DISCIPLES`
 * disciples, si le maillon suivant n'est pas dans sa première page, la branche
 * s'arrêterait là : la personne cherchée ne serait JAMAIS rendue dans l'arbre, rien ne la
 * mettrait en évidence, et AUCUN message ne signalerait l'interruption — pendant que le
 * fil d'Ariane, lui, continuerait d'afficher le chemin complet. Deux vérités
 * contradictoires sur le même écran.
 *
 * ═══ COMMENT ═══
 * Le tri de `disciplesParPage` est `(nom, prenom, id)`. Le RANG du disciple visé est donc
 * le NOMBRE de ses frères actifs qui le précèdent strictement dans cet ordre, et sa page
 * est `floor(rang / taillePage) + 1`. Un seul aller-retour, un `count` exact, aucune ligne
 * ramenée.
 *
 * ═══ CE QU'ELLE RÉPOND QUAND ELLE NE SAIT PAS ═══
 * Si le disciple visé n'est pas lisible ou n'est pas actif, elle rend `1` — elle ne
 * prétend pas savoir où il est. **L'appelant ne doit donc PAS traiter son résultat comme
 * une garantie** : c'est à lui de constater, après chargement, que le maillon suivant
 * figure bien dans la page obtenue, et de le DIRE à l'écran sinon.
 */
export async function pageContenantDisciple(
  supabase: SupabaseClient,
  parentId: string,
  discipleId: string,
  taillePage: number,
): Promise<number> {
  verifierTaillePage(taillePage, 'pageContenantDisciple')

  const { data: cible, error: erreurCible } = await supabase
    .from('membres')
    .select('nom, prenom')
    .eq('id', discipleId)
    .eq('etat', 'actif')
    .maybeSingle()
  if (erreurCible) {
    throw new Error(`Lecture du disciple visé impossible : ${erreurCible.message}`)
  }
  if (!cible) {
    return 1
  }

  const nom = citerValeurPostgrest(cible.nom as string)
  const prenom = citerValeurPostgrest(cible.prenom as string)
  const { count, error } = await supabase
    .from('membres')
    .select('id', { count: 'exact', head: true })
    .eq('faiseur_de_disciple_id', parentId)
    .eq('etat', 'actif')
    .or(
      `nom.lt.${nom},` +
        `and(nom.eq.${nom},prenom.lt.${prenom}),` +
        `and(nom.eq.${nom},prenom.eq.${prenom},id.lt.${discipleId})`,
    )
  if (error) {
    throw new Error(`Comptage du rang du disciple impossible : ${error.message}`)
  }
  return Math.floor(totalObligatoire(count, 'pageContenantDisciple') / taillePage) + 1
}
