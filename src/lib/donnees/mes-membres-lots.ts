import type { SupabaseClient } from '@supabase/supabase-js'
import { nomsMaillonsActifs } from './arbre-lots'
import { totalObligatoire, verifierTaillePage, type PageLue } from './pagination'
import type { MembreBref } from './membres'

/**
 * PAS de `import 'server-only'` ici — délibéré, même motif que `arbre-lots.ts`,
 * `membres-lots.ts`, `presences-lots.ts` et `evenements-lots.ts` : ces fonctions reçoivent
 * leur client Supabase DÉJÀ CONSTRUIT, en paramètre, et ne touchent ni cookies ni clé de
 * service. L'isoler permet à `tests/rls/descendants.test.ts` de faire tourner EXACTEMENT ce
 * code de production contre la vraie base, avec une taille de page abaissée — impossible si
 * ces fonctions vivaient dans un module `server-only`, dont le `throw` nu n'est neutralisé
 * que par l'alias du bundler Next.
 *
 * `import type { MembreBref }` est un import de TYPE : effacé à la compilation, il ne tire
 * donc PAS `membres.ts` (server-only) dans ce module. Même astuce que `arbre-lots.ts`.
 */

export const TAILLE_PAGE_MES_MEMBRES = 25

/** Les trois colonnes de `membres` qui désignent « moi » depuis la fiche de quelqu'un d'autre. */
export type ColonneRelation = 'faiseur_de_disciple_id' | 'dirigeant_id' | 'contact_id'

/**
 * Une page de membres ACTIFS liés à `valeur` par `colonne`.
 *
 * ═══ UNE SEULE FONCTION POUR TROIS SECTIONS ═══
 * Ce n'est pas de la coquetterie : les trois lectures ne diffèrent QUE par le nom de la
 * colonne. Trois copies, ce seraient trois occasions d'oublier `etat = 'actif'`, le tri
 * total, ou le repli `PGRST103` — et la divergence ne se verrait qu'à l'usage, sur la
 * section qu'on regarde le moins.
 *
 * `colonne` est un type union FERMÉ, jamais une chaîne libre : il n'existe aucun chemin par
 * lequel une valeur venue d'une requête HTTP atteindrait ce paramètre.
 *
 * ═══ `etat = 'actif'` EXPLICITEMENT, ET PAS SEULEMENT VIA LA RLS (D93) ═══
 * La politique `membres_lecture` laisse un administrateur voir les fiches archivées, or cet
 * écran est la liste des personnes EN COURS DE SUIVI. Sans ce filtre, un administrateur et
 * un compte ordinaire verraient deux listes différentes sans que rien ne le dise — un filtre
 * explicite est une RÈGLE ÉNONCÉE, un trou creusé par la RLS est un MENSONGE.
 *
 * ═══ TRI TOTAL, `id` EN TROISIÈME CRITÈRE ═══
 * `(nom, prenom)` n'est pas unique. Deux homonymes exacts à cheval sur une frontière de page
 * seraient rendus DEUX FOIS ou JAMAIS — et « jamais », ici, c'est la disparition silencieuse
 * d'un disciple de la liste de son propre faiseur de disciple. Sur un fichier de membres
 * d'église, les homonymes ne sont pas une hypothèse d'école.
 */
export async function membresParRelation(
  supabase: SupabaseClient,
  colonne: ColonneRelation,
  valeur: string,
  options?: { page?: number; taillePage?: number },
): Promise<PageLue<MembreBref>> {
  const taillePage = options?.taillePage ?? TAILLE_PAGE_MES_MEMBRES
  verifierTaillePage(taillePage, 'membresParRelation')
  const page = Math.max(1, options?.page ?? 1)
  const debut = (page - 1) * taillePage

  const { data, error, count } = await supabase
    .from('membres')
    .select('id, nom, prenom', { count: 'exact' })
    .eq(colonne, valeur)
    .eq('etat', 'actif')
    .order('nom')
    .order('prenom')
    .order('id')
    .range(debut, debut + taillePage - 1)

  if (error) {
    // `PGRST103` ATTRAPÉE SUR LA LECTURE ELLE-MÊME — motif éprouvé de `listerMembres` et de
    // `disciplesParPage`, et PAS le motif fragile qu'il a remplacé : pré-calculer la borne
    // par un premier aller-retour ouvre une fenêtre de course qu'une suppression concurrente
    // franchit. Page hors bornes (signet périmé, ou liste qui a rétréci depuis) : PostgREST
    // refuse la requête ENTIÈRE, `count` compris.
    if (error.code === 'PGRST103') {
      return { lignes: [], total: await compterParRelation(supabase, colonne, valeur) }
    }
    // Un échec ne doit pas être indistinguable d'une section vide : annoncer « personne »
    // alors que la requête a échoué est un mensonge silencieux, et sur cet écran il ferait
    // croire à quelqu'un qu'il n'a plus de disciples.
    throw new Error(`Lecture de la section « ${colonne} » impossible : ${error.message}`)
  }

  return {
    lignes: (data ?? []).map((ligne) => ({
      id: ligne.id as string,
      nom: ligne.nom as string,
      prenom: ligne.prenom as string,
    })),
    total: totalObligatoire(count, 'membresParRelation'),
  }
}

/** Repli de `membresParRelation` sur `PGRST103`. JAMAIS appelé en amont pour pré-calculer
 *  une borne : ce serait ouvrir la fenêtre de course refermée par la ronde I1. */
async function compterParRelation(
  supabase: SupabaseClient,
  colonne: ColonneRelation,
  valeur: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('membres')
    .select('id', { count: 'exact', head: true })
    .eq(colonne, valeur)
    .eq('etat', 'actif')
  if (error) {
    throw new Error(`Comptage de la section « ${colonne} » impossible : ${error.message}`)
  }
  return totalObligatoire(count, 'compterParRelation')
}

/** Un descendant, son parent nommé, et sa profondeur dans l'arbre. */
export type LigneDescendance = {
  /** Fiche du descendant. `nom` et `prenom` vides si la RLS ne l'a pas rendue. */
  membre: MembreBref
  /** Identifiant de son faiseur de disciple, tel que la forme de l'arbre le donne. */
  parentId: string | null
  /** Fiche du parent, `null` si elle n'est ni lisible ni active. */
  parent: MembreBref | null
  profondeur: number
}

/**
 * Une page de la descendance d'un membre, AU-DELÀ du niveau 1 (D141, D148).
 *
 * ═══ DEUX CLIENTS, ET C'EST TOUT L'INTÉRÊT DE CETTE FONCTION ═══
 * `supabaseAdmin` (clé de service) appelle les fonctions récursives : la FORME de l'arbre ne
 * doit pas dépendre de ce que l'appelant a le droit de voir, sans quoi la branche serait
 * amputée sans signal. `supabaseLecture` (sous RLS) relit les NOMS.
 *
 * AUCUN NOM LU AVEC LA CLÉ DE SERVICE N'ATTEINT L'APPELANT : les deux appels RPC ci-dessous
 * ne rendent que des identifiants, par construction (voir le `comment on function` de
 * `public.descendants_membre`). C'est cette fonction-ci qui en répond, et elle ne peut le
 * tenir que tant qu'elle ne demande aucun nom à `supabaseAdmin`.
 *
 * Les noms des DESCENDANTS et ceux des PARENTS sont relus dans le MÊME appel à
 * `nomsMaillonsActifs` — un seul aller-retour, et le filtre `etat = 'actif'` s'applique aux
 * deux de la même façon.
 */
export async function descendanceParPage(
  supabaseAdmin: SupabaseClient,
  supabaseLecture: SupabaseClient,
  membreId: string,
  options?: { page?: number; taillePage?: number },
): Promise<PageLue<LigneDescendance>> {
  const taillePage = options?.taillePage ?? TAILLE_PAGE_MES_MEMBRES
  verifierTaillePage(taillePage, 'descendanceParPage')
  const page = Math.max(1, options?.page ?? 1)
  const decalage = (page - 1) * taillePage

  const { data, error } = await supabaseAdmin.rpc('descendants_membre', {
    p_membre: membreId,
    // 2 et non 1 : le niveau 1 est la section « Mes disciples directs », déjà rendue par
    // `membresParRelation`. L'afficher aussi ici ferait mentir le titre « Disciples de mes
    // disciples ».
    p_profondeur_min: 2,
    p_decalage: decalage,
    p_limite: taillePage,
  })
  if (error) {
    throw new Error(`Lecture de la descendance impossible : ${error.message}`)
  }

  const lignes = (data ?? []) as Array<{
    membre_id?: unknown
    parent_id?: unknown
    profondeur?: unknown
    total?: unknown
  }>

  // CONTRÔLE DE FORME, ET NON DÉCORATION. Faute de types `Database` générés, `rpc` rend
  // `any` : si une colonne était un jour renommée, chaque `membre_id` vaudrait `undefined`,
  // la section se viderait EN SILENCE, et l'écran annoncerait « aucun disciple de disciple »
  // à quelqu'un qui en a trente. Même discipline que `ancetresDeMembre`.
  for (const ligne of lignes) {
    if (typeof ligne.membre_id !== 'string' || ligne.membre_id.length === 0) {
      throw new Error(
        'Forme inattendue renvoyée par descendants_membre : colonne « membre_id » absente ou vide.',
      )
    }
  }

  const idsDescendants = lignes.map((ligne) => ligne.membre_id as string)
  const idsParents = lignes
    .map((ligne) => (typeof ligne.parent_id === 'string' ? ligne.parent_id : null))
    .filter((identifiant): identifiant is string => identifiant !== null)

  // UN SEUL appel, descendants et parents ensemble. `nomsMaillonsActifs` lit SOUS RLS et
  // filtre `etat = 'actif'` explicitement (D93) : c'est elle qui garantit qu'aucun nom lu
  // avec la clé de service n'atteint l'écran.
  const noms = await nomsMaillonsActifs(supabaseLecture, [
    ...new Set([...idsDescendants, ...idsParents]),
  ])
  const parId = new Map(noms.map((bref) => [bref.id, bref]))

  // `total` est porté par CHAQUE ligne (`count(*) over ()`). Une page vide n'en porte
  // aucune : on retombe alors sur `compter_descendants`, JAMAIS sur `lignes.length`, qui
  // annoncerait « 0 » pour une descendance de trois cents personnes.
  const total =
    lignes.length > 0
      ? Number(lignes[0]?.total)
      : await compterDescendants(supabaseAdmin, membreId)
  if (!Number.isFinite(total)) {
    throw new Error('Forme inattendue renvoyée par descendants_membre : total illisible.')
  }

  return {
    lignes: lignes.map((ligne) => {
      const identifiant = ligne.membre_id as string
      const parentId = typeof ligne.parent_id === 'string' ? ligne.parent_id : null
      return {
        // Un descendant dont le nom n'est pas lisible GARDE SA PLACE, avec un nom vide que
        // l'écran rend par « Fiche non consultable ». L'effacer ferait mentir le total de la
        // section, qui vient du SQL et compte cette ligne.
        membre: parId.get(identifiant) ?? { id: identifiant, nom: '', prenom: '' },
        parentId,
        parent: parentId ? (parId.get(parentId) ?? null) : null,
        profondeur: Number(ligne.profondeur),
      }
    }),
    total,
  }
}

/** Repli de `descendanceParPage` quand la page est vide et ne porte donc aucun total (D148). */
async function compterDescendants(
  supabaseAdmin: SupabaseClient,
  membreId: string,
): Promise<number> {
  const { data, error } = await supabaseAdmin.rpc('compter_descendants', {
    p_membre: membreId,
    p_profondeur_min: 2,
  })
  if (error) {
    throw new Error(`Comptage de la descendance impossible : ${error.message}`)
  }
  const total = Number(data)
  if (!Number.isFinite(total)) {
    throw new Error('Forme inattendue renvoyée par compter_descendants.')
  }
  return total
}
