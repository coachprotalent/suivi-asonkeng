import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { identifiantVersEmail } from '@/lib/domaine/identifiant'
// Import depuis `mes-membres-lots`, PAS depuis `mes-membres` : ce dernier porte
// `import 'server-only'`, qui lève inconditionnellement hors du bundler Next. Le module de
// lots est délibérément séparé pour que cette suite fasse tourner EXACTEMENT le code de
// production contre la vraie base, avec une taille de page abaissée.
import { descendanceParPage, membresParRelation } from '@/lib/donnees/mes-membres-lots'

/**
 * Phase 7, D141 / D148 — les preuves de `descendants_membre` et de `compter_descendants`.
 *
 * ═══ LE DÉCOR ═══
 *
 *   A                      (racine de l'essai)
 *   └── B                  niveau 1, actif
 *       ├── C              niveau 2, actif
 *       │   └── D          niveau 3, actif
 *       └── E   ARCHIVÉ    niveau 2
 *           └── F  ARCHIVÉ niveau 3
 *
 * ═══ POURQUOI E ET F SONT TOUS DEUX ARCHIVÉS, ALORS QUE LE PLAN PRÉVOYAIT UN F ACTIF ═══
 *
 * Le décor initialement prévu plaçait un `F` ACTIF sous un `E` ARCHIVÉ, pour éprouver que la
 * récursion ne s'arrête pas au maillon archivé. LA BASE INTERDIT CET ÉTAT, mesuré en tentant
 * de le construire : archiver `E` alors que `F` est actif est refusé par un déclencheur —
 * « Ce membre est encore faiseur de disciple de 1 personne(s) active(s). »
 *
 * Trois barrières maintiennent ensemble l'invariant « un membre non actif n'a jamais de
 * disciple actif » : le refus d'archivage ci-dessus, le refus de rétablir un membre dont le
 * faiseur est archivé (20260814140000), et le refus de rattacher un disciple à un faiseur
 * non actif (`definir_arbre`, 20260819100000).
 *
 * Conséquence pour cette suite : elle n'invente pas une mise en scène impossible. Elle
 * éprouve L'INVARIANT LUI-MÊME (dernier bloc), puis le comportement de la fonction sur les
 * états réellement atteignables. Le placement du filtre `etat = 'actif'` après la récursion
 * reste la sémantique correcte, mais il est INERTE tant que l'invariant tient — c'est écrit
 * ainsi dans la migration, plutôt que présenté comme un garde-fou actif.
 *
 * ═══ LA PAGINATION EST ÉPROUVÉE À TAILLE RÉDUITE ═══
 * `p_limite = 2` sur quatre descendants franchit une VRAIE frontière de page, au lieu des
 * centaines de fiches qu'il faudrait créer en base de PRODUCTION pour atteindre le plafond
 * réel. Même méthode que `tests/rls/arborescence.test.ts`.
 */

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const CLE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const CLE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

const MDP = `Test-${crypto.randomUUID()}`
const IDENT_SIMPLE = 'test.descendants.simple'
const FAMILLE = 'ZZDescendants-'
const SUFFIXE = crypto.randomUUID().slice(0, 8)

// Les noms portent leur rang pour que le TRI (profondeur, nom, prenom, id) soit prévisible.
const NOM_A = `${FAMILLE}a-${SUFFIXE}`
const NOM_B = `${FAMILLE}b-${SUFFIXE}`
const NOM_C = `${FAMILLE}c-${SUFFIXE}`
const NOM_D = `${FAMILLE}d-${SUFFIXE}`
const NOM_E = `${FAMILLE}e-archive-${SUFFIXE}`
const NOM_F = `${FAMILLE}f-${SUFFIXE}`

const admin = createClient(URL, CLE_SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
})

let clientSimple: SupabaseClient
let idProfilSimple: string
const ids: Record<string, string> = {}

type LigneDescendant = { membre_id: string; parent_id: string | null; profondeur: number; total: number }

async function descendants(
  membreId: string,
  options: { profondeurMin?: number; decalage?: number; limite?: number } = {},
): Promise<LigneDescendant[]> {
  const { data, error } = await admin.rpc('descendants_membre', {
    p_membre: membreId,
    p_profondeur_min: options.profondeurMin ?? 1,
    p_decalage: options.decalage ?? 0,
    p_limite: options.limite ?? 25,
  })
  if (error) throw new Error(`descendants_membre : ${error.message}`)
  return (data ?? []) as LigneDescendant[]
}

/**
 * Crée un membre ACTIF, rattaché à `faiseurId`.
 *
 * TOUJOURS actif à la création, même pour `E` : le déclencheur
 * `membres_faiseur_de_disciple_archive` refuse de rattacher un disciple à un faiseur déjà
 * archivé. On construit donc la branche entière active, PUIS on archive le maillon — ce qui
 * est aussi l'ordre des événements dans la vraie vie, et ce qui rend le décor réaliste
 * plutôt qu'artificiel.
 */
async function creerMembre(nom: string, faiseurId: string | null): Promise<string> {
  const { data, error } = await admin
    .from('membres')
    .insert({ nom, prenom: 'Test', etat: 'actif', faiseur_de_disciple_id: faiseurId })
    .select('id')
    .single()
  if (error || !data) throw new Error(`création de ${nom} impossible : ${error?.message}`)
  return data.id
}

async function supprimerCompte(identifiant: string) {
  const { data } = await admin.from('profils').select('id').eq('identifiant', identifiant).maybeSingle()
  if (data) {
    await admin.auth.admin.deleteUser(data.id)
    return
  }
  const { data: comptes } = await admin.auth.admin.listUsers()
  const orphelin = comptes?.users.find((u) => u.email === identifiantVersEmail(identifiant))
  if (orphelin) await admin.auth.admin.deleteUser(orphelin.id)
}

async function supprimerMembres() {
  // DES FEUILLES VERS LA RACINE : `faiseur_de_disciple_id` est en `on delete set null`, donc
  // l'ordre n'est pas imposé par une contrainte — mais le déclencheur d'archivage, lui, peut
  // refuser certaines transitions. Une simple suppression de famille suffit ici.
  await admin.from('membres').delete().like('nom', `${FAMILLE}%`)
}

beforeAll(async () => {
  await supprimerCompte(IDENT_SIMPLE)
  await supprimerMembres()

  ids.a = await creerMembre(NOM_A, null)
  ids.b = await creerMembre(NOM_B, ids.a)
  ids.c = await creerMembre(NOM_C, ids.b)
  ids.d = await creerMembre(NOM_D, ids.c)
  ids.e = await creerMembre(NOM_E, ids.b)
  ids.f = await creerMembre(NOM_F, ids.e)

  // ORDRE IMPOSÉ PAR LA BASE : F d'abord, E ensuite. L'inverse est refusé — « Ce membre est
  // encore faiseur de disciple de 1 personne(s) active(s). » C'est cet invariant que le
  // dernier bloc de cette suite éprouve explicitement.
  for (const id of [ids.f, ids.e]) {
    const { error } = await admin
      .from('membres')
      .update({ etat: 'archive' })
      .eq('id', id)
      .select('id')
    if (error) throw new Error(`archivage impossible : ${error.message}`)
  }

  const { data, error: erreurCompte } = await admin.auth.admin.createUser({
    email: identifiantVersEmail(IDENT_SIMPLE),
    password: MDP,
    email_confirm: true,
  })
  if (erreurCompte || !data.user) throw new Error(`création du compte : ${erreurCompte?.message}`)
  idProfilSimple = data.user.id
  const { error: erreurProfil } = await admin
    .from('profils')
    .insert({ id: idProfilSimple, identifiant: IDENT_SIMPLE, nom_affichage: 'Test descendants' })
  if (erreurProfil) {
    await admin.auth.admin.deleteUser(idProfilSimple)
    throw new Error(`insertion du profil : ${erreurProfil.message}`)
  }

  clientSimple = createClient(URL, CLE_ANON, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error: erreurConnexion } = await clientSimple.auth.signInWithPassword({
    email: identifiantVersEmail(IDENT_SIMPLE),
    password: MDP,
  })
  if (erreurConnexion) throw new Error(`connexion impossible : ${erreurConnexion.message}`)
})

afterAll(async () => {
  await supprimerCompte(IDENT_SIMPLE)
  await supprimerMembres()

  const { count, error } = await admin
    .from('membres')
    .select('id', { count: 'exact', head: true })
    .like('nom', `${FAMILLE}%`)
  expect(error).toBeNull()
  expect(count).toBe(0)
})

describe('descendants_membre : le parcours', () => {
  it('rend toute la descendance ACTIVE sous A, le membre lui-même exclu', async () => {
    const lignes = await descendants(ids.a)
    // B, C, D — jamais A (profondeur 0), jamais E ni F (archivés).
    expect(new Set(lignes.map((l) => l.membre_id))).toEqual(new Set([ids.b, ids.c, ids.d]))
    expect(lignes.map((l) => l.membre_id)).not.toContain(ids.a)
  })

  it('exclut les membres archivés des lignes rendues', async () => {
    const rendus = (await descendants(ids.a)).map((l) => l.membre_id)
    expect(rendus).not.toContain(ids.e)
    expect(rendus).not.toContain(ids.f)
    // PRÉMISSE VÉRIFIÉE : E et F existent bel et bien, et sont bien sous A. Sans ce
    // contrôle, l'assertion ci-dessus passerait tout aussi bien si le décor n'avait jamais
    // été construit.
    const { data, error } = await admin
      .from('membres')
      .select('id, etat, faiseur_de_disciple_id')
      .in('id', [ids.e, ids.f])
    if (error) throw new Error(`lecture du décor impossible : ${error.message}`)
    expect(data).toHaveLength(2)
    for (const ligne of data!) expect(ligne.etat).toBe('archive')
  })

  it('rend le parent et la profondeur de chaque descendant', async () => {
    const lignes = await descendants(ids.a)
    const parId = new Map(lignes.map((l) => [l.membre_id, l]))
    expect(parId.get(ids.b)).toMatchObject({ parent_id: ids.a, profondeur: 1 })
    expect(parId.get(ids.c)).toMatchObject({ parent_id: ids.b, profondeur: 2 })
    // Profondeur 3 : la récursion descend bien au-delà de deux niveaux. C'est ce qui
    // distingue cette fonction d'une simple lecture des disciples directs.
    expect(parId.get(ids.d)).toMatchObject({ parent_id: ids.c, profondeur: 3 })
  })

  it('exclut le niveau 1 avec p_profondeur_min = 2', async () => {
    // C'est ce que fait l'écran : la section 1 rend déjà les disciples directs, et les
    // afficher aussi sous « Disciples de mes disciples » ferait mentir ce titre.
    const lignes = await descendants(ids.a, { profondeurMin: 2 })
    expect(new Set(lignes.map((l) => l.membre_id))).toEqual(new Set([ids.c, ids.d]))
    expect(lignes.map((l) => l.membre_id)).not.toContain(ids.b)
  })

  it('rend une liste vide pour un membre sans descendance', async () => {
    expect(await descendants(ids.d)).toEqual([])
  })
})

describe('descendants_membre : la pagination (D148)', () => {
  it('pagine et porte le total sur chaque ligne', async () => {
    const page1 = await descendants(ids.a, { limite: 2 })
    expect(page1).toHaveLength(2)
    // `count(*) over ()` : le total de l'ENSEMBLE, pas de la page.
    for (const ligne of page1) expect(Number(ligne.total)).toBe(3)
  })

  it('franchit une vraie frontière de page sans perdre ni dupliquer personne', async () => {
    const page1 = await descendants(ids.a, { limite: 2, decalage: 0 })
    const page2 = await descendants(ids.a, { limite: 2, decalage: 2 })
    expect(page1).toHaveLength(2)
    expect(page2).toHaveLength(1)
    const reunion = [...page1, ...page2].map((l) => l.membre_id)
    // Aucun doublon, aucun absent : c'est ce que le TRI TOTAL garantit. Une assertion
    // d'ENSEMBLE, pas de longueur : deux fois la même ligne et une absente donneraient la
    // même longueur.
    expect(new Set(reunion).size).toBe(3)
    expect(new Set(reunion)).toEqual(new Set([ids.b, ids.c, ids.d]))
  })

  it('rend une page vide au-delà de la fin, sans erreur et sans total', async () => {
    const horsBornes = await descendants(ids.a, { limite: 2, decalage: 99 })
    expect(horsBornes).toEqual([])
    // C'EST PRÉCISÉMENT POURQUOI `compter_descendants` EXISTE : aucune ligne ne porte de
    // total ici, et retomber sur `lignes.length` annoncerait « 0 descendant » à quelqu'un
    // qui en a trois.
  })

  it('borne p_limite, dans la fonction et non chez l’appelant', async () => {
    // Le décor n'a que trois descendants : on ne peut pas observer la coupure à 500
    // directement sans créer des centaines de fiches en base de PRODUCTION. Ce qu'on
    // éprouve, c'est que la fonction ACCEPTE une limite absurde sans lever et sans rendre
    // plus que ce qui existe — la borne est appliquée, pas ignorée.
    const lignes = await descendants(ids.a, { limite: 10_000 })
    expect(lignes).toHaveLength(3)
  })

  it('traite une limite ou un décalage négatifs comme les bornes les plus basses', async () => {
    // `greatest(..., 1)` et `greatest(..., 0)` : une valeur négative ne doit pas produire
    // une erreur SQL brute à la figure de l'utilisateur.
    const lignes = await descendants(ids.a, { limite: -5, decalage: -3 })
    expect(lignes).toHaveLength(1)
  })
})

describe('compter_descendants : le repli', () => {
  it('rend le même total que descendants_membre', async () => {
    const { data, error } = await admin.rpc('compter_descendants', {
      p_membre: ids.a,
      p_profondeur_min: 1,
    })
    expect(error).toBeNull()
    expect(Number(data)).toBe(3)
  })

  it('respecte p_profondeur_min exactement comme descendants_membre', async () => {
    // Une divergence entre les deux ferait annoncer un total ne correspondant à aucune page
    // atteignable : le nombre de pages serait faux, et la dernière resterait vide.
    const { data, error } = await admin.rpc('compter_descendants', {
      p_membre: ids.a,
      p_profondeur_min: 2,
    })
    expect(error).toBeNull()
    expect(Number(data)).toBe(2)
    expect(await descendants(ids.a, { profondeurMin: 2 })).toHaveLength(2)
  })
})

describe('le code de production : descendanceParPage et membresParRelation', () => {
  /*
    Ces preuves appellent LE CODE DE L'APPLICATION, pas la fonction SQL directement. Elles
    éprouvent ce que le SQL seul ne peut pas dire : la composition des deux clients, le repli
    de total sur une page vide, et le fait qu'aucun nom lu avec la clé de service n'atteint
    l'appelant.

    `taillePage` est abaissée à 2 pour franchir une VRAIE frontière de page avec trois
    descendants, au lieu des centaines de fiches qu'il faudrait créer en base de PRODUCTION.
    Même méthode que `tests/rls/arborescence.test.ts` et `tests/rls/membres.test.ts`.
  */

  it('franchit une frontière de page sans perdre ni dupliquer personne', async () => {
    // `descendanceParPage` exclut le niveau 1 : sous A, elle rend C et D.
    const page1 = await descendanceParPage(admin, clientSimple, ids.a, { page: 1, taillePage: 1 })
    const page2 = await descendanceParPage(admin, clientSimple, ids.a, { page: 2, taillePage: 1 })
    expect(page1.lignes).toHaveLength(1)
    expect(page2.lignes).toHaveLength(1)
    // Chaque page porte le MÊME total, celui de l'ensemble.
    expect(page1.total).toBe(2)
    expect(page2.total).toBe(2)
    const reunion = [...page1.lignes, ...page2.lignes].map((l) => l.membre.id)
    expect(new Set(reunion)).toEqual(new Set([ids.c, ids.d]))
  })

  it('rend le bon total sur une page hors bornes, par le repli et non par la longueur', async () => {
    // ═══ SANS LE REPLI, CETTE PAGE ANNONCERAIT « 0 DESCENDANT » ═══
    // Une page vide ne porte aucune ligne, donc aucun `count(*) over ()`. Retomber sur
    // `lignes.length` ferait dire à l'écran que la personne n'a aucun disciple de disciple,
    // et le nombre de pages calculé par l'appelant s'effondrerait à 1 — l'utilisateur ne
    // pourrait plus revenir en arrière.
    const horsBornes = await descendanceParPage(admin, clientSimple, ids.a, {
      page: 99,
      taillePage: 2,
    })
    expect(horsBornes.lignes).toEqual([])
    expect(horsBornes.total).toBe(2)
  })

  it('nomme les descendants et leur parent, en une seule lecture sous RLS', async () => {
    const page = await descendanceParPage(admin, clientSimple, ids.a, { page: 1, taillePage: 25 })
    const d = page.lignes.find((l) => l.membre.id === ids.d)
    expect(d).toBeDefined()
    expect(d!.membre.nom).toBe(NOM_D)
    // Le parent est NOMMÉ, pas seulement identifié : c'est ce qui permet la mention
    // « via X » sans seconde remontée.
    expect(d!.parentId).toBe(ids.c)
    expect(d!.parent?.nom).toBe(NOM_C)
    expect(d!.profondeur).toBe(3)
  })

  it('membresParRelation rend les disciples directs, et jamais une fiche archivée', async () => {
    const disciples = await membresParRelation(clientSimple, 'faiseur_de_disciple_id', ids.b)
    // B a deux disciples en base — C (actif) et E (archivé) — et la lecture n'en rend qu'un.
    expect(disciples.total).toBe(1)
    expect(disciples.lignes.map((l) => l.id)).toEqual([ids.c])
  })

  it('membresParRelation lit les trois colonnes de relation', async () => {
    // Les trois passent par la même fonction : ce test établit que le paramètre `colonne`
    // est bien appliqué, et pas ignoré au profit d'une valeur en dur.
    for (const colonne of ['dirigeant_id', 'contact_id'] as const) {
      const page = await membresParRelation(clientSimple, colonne, ids.a)
      // Le décor ne pose ni dirigeant ni contact : zéro, sans erreur.
      expect(page.total).toBe(0)
      expect(page.lignes).toEqual([])
    }
  })
})

describe("l'invariant « un membre non actif n'a jamais de disciple actif »", () => {
  /*
    ═══ POURQUOI CE BLOC EXISTE, ET CE QU'IL REMPLACE ═══

    Le plan de cette tâche prévoyait une preuve « les disciples ACTIFS d'un membre ARCHIVÉ
    sont quand même rendus », censée établir que le filtre d'état porte sur les lignes et
    non sur le parcours. EN TENTANT DE CONSTRUIRE CE DÉCOR, la base l'a refusé.

    L'affirmation du plan n'était donc pas seulement invérifiable : elle décrivait un état
    que trois barrières empêchent d'exister. Plutôt que de la contourner — en écrivant le
    décor directement en base, ce que les déclencheurs interdisent aussi — on éprouve ici
    L'INVARIANT LUI-MÊME, qui est le fait réel.

    Conséquence assumée, écrite dans la migration : le placement du filtre après la
    récursion est la sémantique CORRECTE, mais il est INERTE tant que cet invariant tient.
    Le dire vaut mieux que de laisser un commentaire promettre une protection qui ne
    s'exerce sur rien.
  */

  it('refuse d’archiver un membre qui a encore un disciple actif', async () => {
    // C est actif et a D pour disciple actif.
    const { error } = await admin
      .from('membres')
      .update({ etat: 'archive' })
      .eq('id', ids.c)
      .select('id')
    expect(error).not.toBeNull()
    expect(error!.details).toBe('disciples_a_reaffecter')

    // Et rien n'a bougé : le refus n'a pas écrit à moitié.
    const { data } = await admin.from('membres').select('etat').eq('id', ids.c).single()
    expect(data?.etat).toBe('actif')
  })

  it('refuse de rétablir un membre dont le faiseur de disciple est archivé', async () => {
    // F est archivé, et son faiseur E l'est aussi. Le rétablir seul rouvrirait exactement
    // l'état que la preuve précédente ferme par l'autre bout.
    const { error } = await admin
      .from('membres')
      .update({ etat: 'actif' })
      .eq('id', ids.f)
      .select('id')
    expect(error).not.toBeNull()
    expect(error!.details).toBe('faiseur_de_disciple_archive')

    const { data } = await admin.from('membres').select('etat').eq('id', ids.f).single()
    expect(data?.etat).toBe('archive')
  })
})

describe('privilèges (D141)', () => {
  it("descendants_membre n'est PAS exécutable par le rôle authenticated", async () => {
    const { error } = await clientSimple.rpc('descendants_membre', {
      p_membre: ids.a,
      p_profondeur_min: 1,
      p_decalage: 0,
      p_limite: 25,
    })
    expect(error).not.toBeNull()
  })

  it("compter_descendants n'est PAS exécutable par le rôle authenticated", async () => {
    const { error } = await clientSimple.rpc('compter_descendants', {
      p_membre: ids.a,
      p_profondeur_min: 1,
    })
    expect(error).not.toBeNull()
  })
})
