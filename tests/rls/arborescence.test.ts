import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  disciplesParPage,
  nomsMaillonsActifs,
  pageContenantDisciple,
  racinesParPage,
} from '../../src/lib/donnees/arbre-lots'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const IDENT_ADMIN = 'test.rls.arborescence.admin'
const IDENT_SIMPLE = 'test.rls.arborescence.simple'
const MDP = `Test-${crypto.randomUUID()}`

const PREFIXE_FAMILLE = 'ZZArborescence-'
const PREFIXE = `${PREFIXE_FAMILLE}${crypto.randomUUID().slice(0, 8)}`

// Le nom des HOMONYMES : identique pour deux fiches, à un suffixe près sur AUCUN des deux
// champs de tri (nom, prenom). Seul `id` les départage — c'est tout le point.
//
// LE SUFFIXE `-disciple-m` N'EST PAS ARBITRAIRE. Il place le couple au MILIEU de l'ordre
// alphabétique des cinq disciples (`-disciple-a`, `-disciple-m`, `-disciple-m`,
// `-disciple-y`, `-disciple-z`), donc À CHEVAL sur la frontière entre la page 1 et la
// page 2 avec une taille de page de 2. Un nom hors de la famille `-disciple-*` — par
// exemple `-homonyme` — trierait APRÈS `-disciple-z` (« d » < « h ») et le couple ne
// serait plus à cheval : la preuve resterait verte, mais pour une raison qui n'est pas
// celle qu'on écrit. Ne pas renommer sans refaire ce calcul.
const NOM_HOMONYME = `${PREFIXE}-disciple-m`
const PRENOM_HOMONYME = 'Alex'

// Cinq disciples : assez pour franchir DEUX frontières avec une page de 2, et pour que le
// couple d'homonymes tombe À CHEVAL sur l'une d'elles.
const NOMBRE_DISCIPLES = 5
// Trois racines créées par cette suite : le delta attendu sur le total.
const NOMBRE_RACINES = 3

let clientAdminSession: SupabaseClient
let clientSimple: SupabaseClient
let idFaiseur: string
let idsDisciplesAttendus: string[] = []
let idsRacinesAttendues: string[] = []
/** Les mêmes, dans l'ORDRE (nom, prenom, id) attendu en sortie de `racinesParPage`. */
let idsRacinesTriees: string[] = []
let idArchive: string
let idEnAttente: string

// ═══ POUR `pageContenantDisciple` : un faiseur DISTINCT, isolé des cinq disciples
// ci-dessus, pour ne pas perturber leurs propres décomptes (D94, D95). ═══
let idFaiseurCitation: string
// Le DERNIER dans l'ordre (nom, prenom, id) — donc sur la PAGE 2 avec `TAILLE_CITATION`.
// Son NOM PORTE les cinq caractères qu'une expression `or(...)` de PostgREST lit comme
// syntaxe si on ne les cite pas : virgule, parenthèses, guillemet double, antislash.
// `citerValeurPostgrest` (arbre-lots.ts) est le SEUL code de ce module qui les échappe —
// et rien, avant cette suite, ne l'exerçait.
const NOM_CITATION_CIBLE = `${PREFIXE}-cit-d, (parenthèses) "guillemets" \\antislash`
let idCitationCible: string

/*
  ═══ POUR LE FILTRE `etat = 'actif'` DES DISCIPLES : UN FAISEUR À TROIS ÉTATS ═══

  UN FAISEUR DISTINCT, comme celui de la citation, et pour la même raison : les cinq
  disciples d'`idFaiseur` servent les preuves n°9 et n°13, dont les décomptes ne doivent
  dépendre de rien d'autre.

  CE QUE CETTE FRATRIE-CI EXISTE POUR ÉPROUVER, et que RIEN n'éprouvait avant elle : les
  cinq disciples d'`idFaiseur` sont TOUS ACTIFS, et les seules fiches non actives de cette
  suite (`idArchive`, `idEnAttente`) sont SANS FAISEUR DE DISCIPLE — elles ne peuvent donc
  JAMAIS apparaître dans `disciplesParPage`. L'égalité admin/ordinaire de la preuve n°13
  comparait ainsi deux fois le même ensemble de cinq actifs : elle serait restée
  IDENTIQUEMENT VERTE si l'on retirait `.eq('etat', 'actif')` d'`arbre-lots.ts`.

  Il faut donc des fiches NON ACTIVES RATTACHÉES À UN FAISEUR ACTIF. Rien ne l'interdit :
  les déclencheurs vérifient l'état du FAISEUR, pas celui de l'enfant.

  Le TÉMOIN ACTIF n'est pas décoratif : sans lui, tout ce qui suit serait satisfait par deux
  listes vides. Même protocole que le bloc `nomsMaillonsActifs` plus bas.
*/
let idFaiseurEtats: string
let idDiscipleActif: string
let idDiscipleArchive: string
let idDiscipleEnAttente: string

async function supprimerCompte(identifiant: string) {
  const { data } = await admin.from('profils').select('id').eq('identifiant', identifiant).maybeSingle()
  if (data) {
    await admin.auth.admin.deleteUser(data.id)
    return
  }
  const { data: comptes } = await admin.auth.admin.listUsers()
  const orphelin = comptes?.users.find((u) => u.email === `${identifiant}@asonkeng.local`)
  if (orphelin) await admin.auth.admin.deleteUser(orphelin.id)
}

async function creerSession(identifiant: string, roles: string[]): Promise<SupabaseClient> {
  const { data, error } = await admin.auth.admin.createUser({
    email: `${identifiant}@asonkeng.local`,
    password: MDP,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`création du compte ${identifiant} : ${error?.message}`)
  const { error: erreurProfil } = await admin
    .from('profils')
    .insert({ id: data.user.id, identifiant, nom_affichage: `Test arborescence ${identifiant}` })
  if (erreurProfil) throw new Error(`insertion du profil ${identifiant} : ${erreurProfil.message}`)
  for (const role of roles) {
    const { error: erreurRole } = await admin
      .from('roles_profil')
      .insert({ profil_id: data.user.id, role })
    if (erreurRole) throw new Error(`rôle ${role} pour ${identifiant} : ${erreurRole.message}`)
  }
  const client = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error: erreurConnexion } = await client.auth.signInWithPassword({
    email: `${identifiant}@asonkeng.local`,
    password: MDP,
  })
  if (erreurConnexion) throw new Error(`connexion ${identifiant} : ${erreurConnexion.message}`)
  return client
}

/** Comptage INDÉPENDANT du total, pour ne pas le comparer à lui-même. */
async function compterRacinesIndependamment(client: SupabaseClient): Promise<number> {
  const { count, error } = await client
    .from('membres')
    .select('id', { count: 'exact', head: true })
    .is('faiseur_de_disciple_id', null)
    .eq('etat', 'actif')
  if (error) throw new Error(`comptage indépendant impossible : ${error.message}`)
  if (count === null) throw new Error('comptage absent de la réponse PostgREST')
  return count
}

beforeAll(async () => {
  await admin.from('membres').delete().like('nom', `${PREFIXE_FAMILLE}%`)
  await supprimerCompte(IDENT_ADMIN)
  await supprimerCompte(IDENT_SIMPLE)

  clientAdminSession = await creerSession(IDENT_ADMIN, ['administrateur'])
  clientSimple = await creerSession(IDENT_SIMPLE, [])

  const { data: faiseur, error: erreurFaiseur } = await admin
    .from('membres')
    .insert({ nom: `${PREFIXE}-faiseur`, prenom: 'Test' })
    .select('id')
    .single()
  if (erreurFaiseur || !faiseur) throw new Error(`création du faiseur : ${erreurFaiseur?.message}`)
  idFaiseur = faiseur.id as string

  // Les cinq disciples, dont DEUX HOMONYMES EXACTS.
  //
  // ORDRE RÉEL, calculé et non supposé — le tri est (nom, prenom, id), et les cinq noms
  // partagent le préfixe `${PREFIXE}-disciple-` :
  //     -disciple-a, -disciple-m, -disciple-m, -disciple-y, -disciple-z
  // Avec une taille de page de 2 : page 1 = [a, m], page 2 = [m, y], page 3 = [z]. LE
  // COUPLE D'HOMONYMES EST DONC À CHEVAL sur la frontière 1/2, ce qui est exactement le cas
  // que `.order('id')` existe pour rendre déterministe. Si l'un de ces noms change, refaire
  // ce calcul : une preuve qui fonctionne par accident ne prouve rien de durable.
  const aInserer = [
    { nom: `${PREFIXE}-disciple-a`, prenom: 'Test' },
    { nom: NOM_HOMONYME, prenom: PRENOM_HOMONYME },
    { nom: NOM_HOMONYME, prenom: PRENOM_HOMONYME },
    { nom: `${PREFIXE}-disciple-y`, prenom: 'Test' },
    { nom: `${PREFIXE}-disciple-z`, prenom: 'Test' },
  ].map((ligne) => ({ ...ligne, faiseur_de_disciple_id: idFaiseur }))
  expect(aInserer).toHaveLength(NOMBRE_DISCIPLES)

  const { data: disciples, error: erreurDisciples } = await admin
    .from('membres')
    .insert(aInserer)
    .select('id')
  // Toute préparation vérifie son erreur et LÈVE : un `insert` dont l'erreur est jetée
  // rendrait le test vert en éprouvant un tout autre chemin.
  if (erreurDisciples || !disciples) throw new Error(`création des disciples : ${erreurDisciples?.message}`)
  idsDisciplesAttendus = disciples.map((ligne) => ligne.id as string)

  // ═══ INSÉRÉES DANS LE DÉSORDRE, DÉLIBÉRÉMENT ═══
  // 3, puis 1, puis 2 — jamais 1, 2, 3. La preuve d'ORDRE de `racinesParPage` les cherche
  // triées ; insérées dans l'ordre, elles ressortiraient très probablement dans cet ordre
  // d'un parcours de table SANS AUCUN TRI, et cette preuve passerait sans rien mesurer. Ne
  // pas « remettre en ordre » cette liste.
  const { data: racines, error: erreurRacines } = await admin
    .from('membres')
    .insert([
      { nom: `${PREFIXE}-racine-3`, prenom: 'Test' },
      { nom: `${PREFIXE}-racine-1`, prenom: 'Test' },
      { nom: `${PREFIXE}-racine-2`, prenom: 'Test' },
    ])
    .select('id, nom')
  if (erreurRacines || !racines) throw new Error(`création des racines : ${erreurRacines?.message}`)
  idsRacinesAttendues = racines.map((ligne) => ligne.id as string)
  // L'ORDRE ATTENDU EN SORTIE, calculé sur le `nom` et non sur l'ordre d'insertion. Les
  // trois noms ne diffèrent que par un chiffre ASCII sur un préfixe identique : le tri de
  // JavaScript et celui de PostgreSQL y coïncident nécessairement.
  idsRacinesTriees = [...racines]
    .sort((a, b) => (a.nom as string).localeCompare(b.nom as string))
    .map((ligne) => ligne.id as string)

  // Une fiche ARCHIVÉE et une fiche EN ATTENTE, toutes deux SANS faiseur de disciple : ni
  // l'une ni l'autre ne doit apparaître dans les racines, pour PERSONNE — y compris pour
  // un administrateur, dont la RLS, elle, les laisserait passer.
  const { data: hors, error: erreurHors } = await admin
    .from('membres')
    .insert([
      { nom: `${PREFIXE}-archive`, prenom: 'Test', etat: 'archive' },
      { nom: `${PREFIXE}-en-attente`, prenom: 'Test', etat: 'en_attente' },
    ])
    .select('id, etat')
  if (erreurHors || !hors) throw new Error(`création des fiches hors état actif : ${erreurHors?.message}`)
  idArchive = hors.find((l) => l.etat === 'archive')!.id as string
  idEnAttente = hors.find((l) => l.etat === 'en_attente')!.id as string

  // ═══ LE FAISEUR ET LES QUATRE FRÈRES DE LA PREUVE DE CITATION ═══
  // Ordre RÉEL (nom, prenom, id) : `-cit-a` < `-cit-b` < `-cit-c` < NOM_CITATION_CIBLE
  // (« d » > « c », et le reste du nom ne compte plus une fois le premier caractère
  // départagé). La cible est donc en RANG 3 (zéro-indexé), DERNIÈRE des quatre.
  const { data: faiseurCitation, error: erreurFaiseurCitation } = await admin
    .from('membres')
    .insert({ nom: `${PREFIXE}-citation-faiseur`, prenom: 'Test' })
    .select('id')
    .single()
  if (erreurFaiseurCitation || !faiseurCitation) {
    throw new Error(`création du faiseur de citation : ${erreurFaiseurCitation?.message}`)
  }
  idFaiseurCitation = faiseurCitation.id as string

  const freresCitation = [
    { nom: `${PREFIXE}-cit-a`, prenom: 'Test' },
    { nom: `${PREFIXE}-cit-b`, prenom: 'Test' },
    { nom: `${PREFIXE}-cit-c`, prenom: 'Test' },
    { nom: NOM_CITATION_CIBLE, prenom: 'Test' },
  ].map((ligne) => ({ ...ligne, faiseur_de_disciple_id: idFaiseurCitation }))
  const { data: citation, error: erreurCitation } = await admin
    .from('membres')
    .insert(freresCitation)
    .select('id, nom')
  if (erreurCitation || !citation) throw new Error(`création des frères de citation : ${erreurCitation?.message}`)
  idCitationCible = citation.find((l) => l.nom === NOM_CITATION_CIBLE)!.id as string

  // ═══ LE FAISEUR À TROIS ÉTATS (voir le commentaire de sa déclaration) ═══
  const { data: faiseurEtats, error: erreurFaiseurEtats } = await admin
    .from('membres')
    .insert({ nom: `${PREFIXE}-etats-faiseur`, prenom: 'Test' })
    .select('id')
    .single()
  if (erreurFaiseurEtats || !faiseurEtats) {
    throw new Error(`création du faiseur à trois états : ${erreurFaiseurEtats?.message}`)
  }
  idFaiseurEtats = faiseurEtats.id as string

  const { data: etats, error: erreurEtats } = await admin
    .from('membres')
    .insert([
      { nom: `${PREFIXE}-etats-a-actif`, prenom: 'Test', etat: 'actif' },
      { nom: `${PREFIXE}-etats-b-archive`, prenom: 'Test', etat: 'archive' },
      { nom: `${PREFIXE}-etats-c-en-attente`, prenom: 'Test', etat: 'en_attente' },
    ].map((ligne) => ({ ...ligne, faiseur_de_disciple_id: idFaiseurEtats })))
    .select('id, etat')
  // Toute préparation vérifie son erreur et LÈVE : sans les deux fiches non actives, la
  // preuve ci-dessous redeviendrait exactement celle qu'elle remplace — verte sans filtre.
  if (erreurEtats || !etats) {
    throw new Error(`création des disciples à trois états : ${erreurEtats?.message}`)
  }
  idDiscipleActif = etats.find((l) => l.etat === 'actif')!.id as string
  idDiscipleArchive = etats.find((l) => l.etat === 'archive')!.id as string
  idDiscipleEnAttente = etats.find((l) => l.etat === 'en_attente')!.id as string
})

afterAll(async () => {
  // Suppression EN VRAC PAR PRÉFIXE : elle prend disciples et faiseur ENSEMBLE. Supprimer
  // le faiseur d'abord détacherait ses disciples EN SILENCE (`on delete set null`) et en
  // ferait des racines — on ne les retrouverait plus par la prise qu'on croyait avoir.
  await admin.from('membres').delete().like('nom', `${PREFIXE_FAMILLE}%`)
  await supprimerCompte(IDENT_ADMIN)
  await supprimerCompte(IDENT_SIMPLE)

  // COMPTAGE DE CONTRÔLE, INDÉPENDANT du balayage : un `delete` qui ne touche aucune ligne
  // ne rend AUCUNE erreur.
  const { count } = await admin
    .from('membres')
    .select('id', { count: 'exact', head: true })
    .like('nom', `${PREFIXE_FAMILLE}%`)
  expect(count).toBe(0)
  const { data: residus } = await admin
    .from('profils')
    .select('id')
    .in('identifiant', [IDENT_ADMIN, IDENT_SIMPLE])
  expect(residus ?? []).toHaveLength(0)
})

// ───────────────────────────────────────────────────────────────────────────────
// PREUVE N°9 — PAGINATION ET TRI TOTAL DES DISCIPLES (D94)
// ───────────────────────────────────────────────────────────────────────────────

describe('disciplesParPage', () => {
  it('parcourt TOUTES les pages sans doublon ni manquant, homonymes à cheval compris', async () => {
    // TAILLE DE PAGE ABAISSÉE : on franchit de VRAIES frontières sans créer 1001 lignes en
    // base de PRODUCTION. C'est la seule raison d'être d'`arbre-lots.ts`.
    const TAILLE = 2
    const collectes: string[] = []
    let total = -1
    let page = 1
    // Borne dure : sans elle, un défaut de pagination boucle indéfiniment et le test se
    // fige au lieu de tomber.
    for (; page <= 20; page += 1) {
      const resultat = await disciplesParPage(admin, idFaiseur, { page, taillePage: TAILLE })
      if (total === -1) total = resultat.total
      collectes.push(...resultat.lignes.map((ligne) => ligne.id))
      if (page * TAILLE >= resultat.total) break
    }
    expect(page).toBeLessThan(20)

    // Le TOTAL annoncé est le total RÉEL, pas la longueur d'une page.
    expect(total).toBe(NOMBRE_DISCIPLES)

    // AUCUN DOUBLON.
    expect(new Set(collectes).size).toBe(collectes.length)
    // AUCUN MANQUANT — et c'est l'assertion qui tomberait si un homonyme disparaissait à
    // la frontière : « jamais rendu » est la disparition silencieuse d'une personne de la
    // branche de son propre faiseur de disciple.
    expect([...collectes].sort()).toEqual([...idsDisciplesAttendus].sort())
  })

  it('rend les DEUX homonymes exacts, chacun une seule fois', async () => {
    const TAILLE = 2
    const collectes: string[] = []
    for (let page = 1; page <= 20; page += 1) {
      const resultat = await disciplesParPage(admin, idFaiseur, { page, taillePage: TAILLE })
      collectes.push(...resultat.lignes.map((ligne) => ligne.id))
      if (page * TAILLE >= resultat.total) break
    }
    const { data: homonymes } = await admin
      .from('membres')
      .select('id')
      .eq('nom', NOM_HOMONYME)
      .eq('prenom', PRENOM_HOMONYME)
    expect(homonymes).toHaveLength(2)
    for (const homonyme of homonymes ?? []) {
      expect(collectes.filter((identifiant) => identifiant === homonyme.id as string)).toHaveLength(1)
    }
  })

  it('LÈVE sur une taille de page qui atteint max_rows, au lieu de borner en douce', async () => {
    await expect(
      disciplesParPage(admin, idFaiseur, { page: 1, taillePage: 1000 }),
    ).rejects.toThrow(/taillePage invalide/)
  })

  it('rend un total juste et une page vide sur un nœud sans disciple', async () => {
    const resultat = await disciplesParPage(admin, idsRacinesAttendues[0], { taillePage: 2 })
    expect(resultat.total).toBe(0)
    expect(resultat.lignes).toEqual([])
  })
})

// ───────────────────────────────────────────────────────────────────────────────
// `pageContenantDisciple` — TROU DE COUVERTURE COMBLÉ EN CLÔTURE DE PHASE.
//
// Signalé par l'implémenteur des Tasks 9-10 : cette fonction n'était exercée par AUCUN
// test permanent, vérifiée seulement À LA MAIN puis le script supprimé. C'est pourtant le
// code le plus fragile du lot (relevé par la revue des Tasks 8-13) : elle fabrique une
// expression `or(...)` PostgREST À LA MAIN, avec une citation maison
// (`citerValeurPostgrest`) que rien n'exerçait, et suppose que l'ordre `.order('nom')` de
// PostgreSQL coïncide avec ce que `nom.lt.` compare textuellement.
//
// La preuve de bout en bout (`tests/e2e/arborescence.spec.ts`, « la recherche atteint une
// personne située AU-DELÀ de la première page de son faiseur ») couvre déjà la FRONTIÈRE
// DE PAGE avec la vraie constante de production (`TAILLE_PAGE_DISCIPLES`, 25 frères plus
// la cible), mais avec des noms qui ne contiennent que lettres, chiffres et tirets. Elle
// ne peut donc PAS exercer `citerValeurPostgrest` : c'est le rôle de ce bloc-ci, avec une
// taille de page réduite (même motif que `disciplesParPage` plus haut) et des noms qui
// portent les cinq caractères qu'une expression `or(...)` non citée lirait comme syntaxe.
// ───────────────────────────────────────────────────────────────────────────────

describe('pageContenantDisciple', () => {
  // Quatre frères, taille de page 2 : page 1 = [-cit-a, -cit-b], page 2 = [-cit-c, CIBLE].
  const TAILLE_CITATION = 2

  it('cite correctement un nom porteur de virgule, parenthèses, guillemet et antislash — franchit la frontière de page', async () => {
    const page = await pageContenantDisciple(admin, idFaiseurCitation, idCitationCible, TAILLE_CITATION)

    // SANS LA CITATION : `nom.lt.${nom}` casserait la syntaxe `or(...)` sur la virgule et
    // les parenthèses du nom de la cible, PostgREST refuserait la requête, et
    // `pageContenantDisciple` NE PEUT PAS distinguer cette erreur d'un « je ne sais pas » —
    // elle LÈVE (voir le code : seul un `maybeSingle()` vide rend `1`, pas une erreur de
    // syntaxe sur le second aller-retour). Un `await` qui n'aurait pas levé ici, ET rendu
    // la MAUVAISE page, serait donc le signe d'une citation qui a cessé de fonctionner.
    expect(page).toBe(2)

    // ═══ CONTRÔLE POSITIF : LA PAGE CALCULÉE CONTIENT RÉELLEMENT LA CIBLE ═══
    // Sans lui, un calcul qui rendrait TOUJOURS 2 par accident (une constante figée, par
    // exemple) satisferait l'assertion ci-dessus sans que la fonction ait rien calculé.
    const pageCalculee = await disciplesParPage(admin, idFaiseurCitation, {
      page,
      taillePage: TAILLE_CITATION,
    })
    expect(pageCalculee.lignes.map((l) => l.id)).toContain(idCitationCible)

    // ET ELLE EST ABSENTE DE LA PAGE 1 : sans cette absence, un calcul qui rendrait
    // TOUJOURS 1 (le repli documenté pour « je ne sais pas ») passerait aussi le contrôle
    // positif ci-dessus, puisque la page 1 contiendrait alors la totalité des quatre
    // frères sur une taille de page mal appliquée. Ici, la page 1 a exactement DEUX
    // frères, et la cible n'y est pas.
    const page1 = await disciplesParPage(admin, idFaiseurCitation, { page: 1, taillePage: TAILLE_CITATION })
    expect(page1.lignes.map((l) => l.id)).not.toContain(idCitationCible)
    expect(page1.lignes).toHaveLength(TAILLE_CITATION)
  })

  it('rend 1 quand le disciple visé est introuvable — elle ne prétend pas savoir où il est', async () => {
    const page = await pageContenantDisciple(
      admin,
      idFaiseurCitation,
      '00000000-0000-0000-0000-000000000000',
      TAILLE_CITATION,
    )
    expect(page).toBe(1)
  })

  it("rend 1 quand le disciple visé n'est plus actif, même s'il existe réellement", async () => {
    // Fiche dédiée, ARCHIVÉE : distincte d'`idArchive` (sans faiseur, réservée aux preuves
    // de racines) pour ne coupler aucune des deux mesures à l'autre.
    const { data, error } = await admin
      .from('membres')
      .insert({
        nom: `${PREFIXE}-cit-archive`,
        prenom: 'Test',
        faiseur_de_disciple_id: idFaiseurCitation,
        etat: 'archive',
      })
      .select('id')
      .single()
    if (error || !data) throw new Error(`préparation impossible : ${error?.message}`)

    const page = await pageContenantDisciple(admin, idFaiseurCitation, data.id as string, TAILLE_CITATION)
    expect(page).toBe(1)
  })
})

// ───────────────────────────────────────────────────────────────────────────────
// PREUVE N°10 — PAGINATION ET TRI TOTAL DES RACINES (D95)
// ───────────────────────────────────────────────────────────────────────────────

describe('racinesParPage', () => {
  it('annonce un total ÉGAL à un comptage calculé indépendamment', async () => {
    const independant = await compterRacinesIndependamment(admin)
    const resultat = await racinesParPage(admin, { page: 1, taillePage: 3 })
    // NON contre la somme des pages parcourues, qui vient de la MÊME requête et ne
    // prouverait rien.
    expect(resultat.total).toBe(independant)
  })

  /*
    ═══ CE PARCOURS EST CONSTRUIT POUR TENIR SUR UNE BASE DE PRODUCTION ═══

    Trois choix, et chacun ferme un défaut précis.

    1. AUCUN COMPTAGE ABSOLU. Pas de `expect(collectes).toHaveLength(total)` : le parcours
       dure plusieurs allers-retours SÉQUENTIELS, et une seule racine créée par
       l'administrateur réel pendant ce temps le ferait tomber. On assert sur ce que cette
       suite a créé — un DELTA —, jamais sur le total de la base.

    2. UNE TAILLE DE PAGE DE 200, ET NON DE 3. La pagination par DÉCALAGE est instable sous
       écriture concurrente : une insertion de nom bas décale toutes les pages suivantes et
       produit un VRAI doublon. `new Set(collectes).size === collectes.length` tomberait
       alors pour une raison ÉTRANGÈRE au code éprouvé, en accusant le tri total d'un
       défaut qui n'est pas le sien. Moins il y a de pages, moins il y a de fenêtres. Le
       cas homonyme à cheval, lui, est déjà prouvé plus haut avec une taille de 2 et un cas
       CONSTRUIT : ce parcours-ci n'a pas à le refaire.

    3. UNE BORNE EN LIGNES, PAS EN PAGES. Une borne de 500 pages à 3 lignes ne se
       déclencherait qu'au-delà de 1 500 racines, alors que le parcours coûte déjà
       beaucoup trop cher bien avant. La borne est donc posée sur le NOMBRE DE LIGNES,
       assertée AVANT la boucle, et le nombre de pages en découle.

    ═══ ET CE QUE CE PARCOURS NE PROUVE PAS, ÉCRIT FRANCHEMENT ═══

    IL NE PORTE PAS SUR L'AXE PAGINATION. Avec une taille de page de 200 et une base qui
    compte une dizaine de racines, LA BOUCLE NE FAIT QU'UN TOUR : aucune frontière n'est
    franchie, et `new Set(collectes).size === collectes.length` est vrai PAR CONSTRUCTION —
    une seule requête ne peut pas rendre deux fois la même ligne. Ces deux assertions
    resteraient vertes sur une pagination entièrement cassée. La frontière de page, elle,
    est réellement franchie par `disciplesParPage` plus haut (taille 2, cinq disciples,
    homonymes à cheval) : c'est LÀ qu'elle est prouvée, pas ici.

    CE PARCOURS PROUVE DONC DEUX CHOSES, ET ELLES SONT RÉELLES : que les racines créées par
    cette suite sont bien rendues, chacune une fois ; et — depuis la revue finale de la
    phase 5, qui a constaté qu'AUCUNE assertion d'ordre n'existait sur les racines, nulle
    part — que la liste rendue est bien TRIÉE sur `(nom, prenom, id)`. Cette dernière
    tomberait si l'un des trois `.order(...)` d'`arbre-lots.ts` disparaissait : sans tri
    explicite, PostgreSQL rend les lignes dans l'ordre qui l'arrange, et il n'y a aucune
    raison qu'il coïncide avec celui-là sur une dizaine de fiches.
  */
  it("parcourt toutes les pages sans doublon, dans l'ordre (nom, prenom, id), et retrouve les trois racines créées", async () => {
    const TAILLE = 200
    const totalInitial = await compterRacinesIndependamment(admin)
    expect(
      totalInitial,
      "plus de 20 000 racines : le parcours exhaustif de cette preuve n'est plus tenable sur une base de production, revoir le protocole avant de la faire passer",
    ).toBeLessThan(20_000)
    const PAGES_MAX = Math.ceil(totalInitial / TAILLE) + 2

    // L'ORDRE DE COLLECTE EST CONSERVÉ : c'est lui qu'on assert plus bas, et non seulement
    // l'appartenance.
    const collectes: string[] = []
    let page = 1
    for (; page <= PAGES_MAX; page += 1) {
      const resultat = await racinesParPage(admin, { page, taillePage: TAILLE })
      collectes.push(...resultat.lignes.map((ligne) => ligne.id))
      if (page * TAILLE >= resultat.total) break
    }
    expect(
      page,
      'la boucle a atteint sa borne : la pagination ne progresse pas, ou la liste grandit plus vite que le parcours',
    ).toBeLessThanOrEqual(PAGES_MAX)

    // AUCUN DOUBLON. Le `+2` de la borne absorbe une insertion concurrente sans faire
    // tomber la boucle ; ce doublon-ci, en revanche, dirait quelque chose du tri.
    expect(new Set(collectes).size).toBe(collectes.length)

    /*
      ═══ L'ORDRE, ASSERTÉ POUR DE VRAI ═══

      Les trois racines de cette suite sont INSÉRÉES DANS LE DÉSORDRE (voir le `beforeAll` :
      `-racine-3`, puis `-racine-1`, puis `-racine-2`) et doivent RESSORTIR DANS L'ORDRE.
      C'est ce désordre délibéré qui rend l'assertion discriminante : insérées 1, 2, 3, elles
      seraient très probablement rendues 1, 2, 3 par un simple parcours de table SANS AUCUN
      TRI, et l'assertion passerait sans rien mesurer.

      ON N'ASSERT PAS LA MONOTONIE DE TOUTE LA LISTE, et c'est délibéré : la comparaison de
      JavaScript porte sur les unités de code UTF-16, celle de PostgreSQL sur sa COLLATION —
      les deux divergent sur les accents et la casse, que les vrais noms de cette base
      portent. Une telle assertion produirait un ROUGE ÉTRANGER au code éprouvé. Nos trois
      noms, eux, ne diffèrent que par un chiffre ASCII sur un préfixe identique : les deux
      ordres y coïncident nécessairement.
    */
    const rangs = idsRacinesTriees.map((identifiant) => collectes.indexOf(identifiant))
    expect(
      rangs,
      "une racine de cette suite est absente du parcours : l'ordre ne peut pas être mesuré",
    ).not.toContain(-1)
    expect(
      rangs,
      "les racines de cette suite ne sortent pas dans l'ordre (nom, prenom, id) : le tri de racinesParPage ne tient pas",
    ).toEqual([...rangs].sort((a, b) => a - b))

    // ET LE DELTA : les trois racines de cette suite ont été rendues, chacune UNE FOIS.
    // C'est la seule assertion de complétude qui soit vraie sur une base partagée.
    for (const identifiant of idsRacinesAttendues) {
      expect(
        collectes.filter((collecte) => collecte === identifiant),
        'une racine créée par cette suite est absente du parcours, ou rendue deux fois',
      ).toHaveLength(1)
    }
    expect(idsRacinesAttendues).toHaveLength(NOMBRE_RACINES)
    // NON INERTE : le parcours doit avoir rendu quelque chose. Une base en panne rendrait
    // trois listes vides et les assertions ci-dessus tomberaient — mais celle-ci le dit
    // plus clairement.
    expect(collectes.length).toBeGreaterThanOrEqual(NOMBRE_RACINES)
  })

  it('rend une page vide et un total JUSTE quand la page demandée est hors bornes', async () => {
    const total = await compterRacinesIndependamment(admin)
    const resultat = await racinesParPage(admin, { page: 100000, taillePage: 3 })
    // Repli `PGRST103` attrapé SUR LA LECTURE ELLE-MÊME : la requête entière est refusée,
    // `count` compris, et on retombe sur un comptage sans `range`.
    expect(resultat.lignes).toEqual([])
    expect(resultat.total).toBe(total)
  })
})

// ───────────────────────────────────────────────────────────────────────────────
// PREUVE N°12 — L'ARBRE NE MONTRE QUE DES MEMBRES ACTIFS (D93),
// ET LE PROUVE DEPUIS L'ADMINISTRATEUR, DONT LA RLS LES LAISSERAIT PASSER
// ───────────────────────────────────────────────────────────────────────────────

describe('filtre etat = actif, explicite et non délégué à la RLS', () => {
  it("n'expose ni fiche archivée ni fiche en attente dans les racines, POUR UN ADMINISTRATEUR", async () => {
    // Même protocole que le parcours de la preuve n°10, et pour les mêmes raisons : taille
    // de page large (la pagination par décalage est instable sous écriture concurrente),
    // borne exprimée EN LIGNES et assertée avant la boucle, aucun comptage absolu.
    const TAILLE = 200
    const totalInitial = await compterRacinesIndependamment(clientAdminSession)
    expect(
      totalInitial,
      "plus de 20 000 racines : ce parcours n'est plus tenable sur une base de production",
    ).toBeLessThan(20_000)
    const PAGES_MAX = Math.ceil(totalInitial / TAILLE) + 2

    const collectes: string[] = []
    let page = 1
    for (; page <= PAGES_MAX; page += 1) {
      const resultat = await racinesParPage(clientAdminSession, { page, taillePage: TAILLE })
      collectes.push(...resultat.lignes.map((ligne) => ligne.id))
      if (page * TAILLE >= resultat.total) break
    }
    expect(page, 'la boucle a atteint sa borne : le parcours ne progresse pas').toBeLessThanOrEqual(
      PAGES_MAX,
    )

    /*
      ═══ LA COLLECTE DOIT AVOIR EU LIEU AVANT QUE SES ABSENCES NE VEUILLENT DIRE QUELQUE
      CHOSE — ET LA VÉRIFICATION EST DANS **CE** TEST, PAS DANS UN AUTRE ═══

      `expect(collectes).not.toContain(...)` est satisfait TRIVIALEMENT par une collecte
      VIDE : une requête en panne, une session expirée, une boucle qui sort au premier tour
      rendraient ce test vert en ne prouvant rien du tout. Un contrôle positif écrit dans un
      `it` VOISIN ne referme pas ce cas : les deux tests ne partagent pas cette collecte.

      Les trois racines de cette suite sont ACTIVES et SANS faiseur de disciple : elles
      DOIVENT figurer dans le parcours. Leur présence prouve que la collecte a réellement
      balayé la liste, et c'est cela seul qui donne un sens aux deux absences ci-dessous.
    */
    for (const identifiant of idsRacinesAttendues) {
      expect(
        collectes,
        'collecte vide ou incomplète : les absences vérifiées ensuite ne prouveraient rien',
      ).toContain(identifiant)
    }

    expect(collectes).not.toContain(idArchive)
    expect(collectes).not.toContain(idEnAttente)
  })

  // CONTRÔLE POSITIF, ET IL N'EST PAS INERTE : une absence dont on n'a pas prouvé que la
  // fiche EXISTE et est LISIBLE par ailleurs ne prouve rien du tout.
  it('mais ce même administrateur ouvre bien les deux fiches par lien direct', async () => {
    for (const identifiant of [idArchive, idEnAttente]) {
      const { data, error } = await clientAdminSession
        .from('membres')
        .select('id, etat')
        .eq('id', identifiant)
        .maybeSingle()
      expect(error).toBeNull()
      expect(data?.id).toBe(identifiant)
    }
  })
})

// ───────────────────────────────────────────────────────────────────────────────
// PREUVE N°13 — UN COMPTE ORDINAIRE VOIT LE MÊME ARBRE QU'UN ADMINISTRATEUR (D93)
// ───────────────────────────────────────────────────────────────────────────────

describe('un compte ordinaire et un administrateur voient le même arbre', () => {
  // CE TEST-CI NE MESURE PAS LE FILTRE `etat = 'actif'` : les cinq disciples d'`idFaiseur`
  // sont TOUS ACTIFS, donc les deux lectures comparent deux fois le même ensemble et
  // resteraient égales si le filtre disparaissait. Il mesure ce qu'il dit — que les deux
  // rôles voient le MÊME nœud —, et rien de plus. Le filtre, lui, est éprouvé par le bloc
  // suivant, sur un faiseur qui porte des disciples des TROIS états.
  it('rendent la même liste de disciples ET le même total sur le même nœud', async () => {
    const vuAdmin = await disciplesParPage(clientAdminSession, idFaiseur, { taillePage: 10 })
    const vuSimple = await disciplesParPage(clientSimple, idFaiseur, { taillePage: 10 })

    expect(vuSimple.total).toBe(vuAdmin.total)
    expect(vuSimple.lignes.map((l) => l.id)).toEqual(vuAdmin.lignes.map((l) => l.id))
    // Et la liste N'EST PAS VIDE : sans cette assertion, l'égalité serait celle de deux
    // résultats vides, satisfaite par une base en panne.
    expect(vuAdmin.total).toBe(NOMBRE_DISCIPLES)
  })

  // CONTRÔLE POSITIF DE LA DIFFÉRENCE DE DROITS : le compte ordinaire ne lit PAS une fiche
  // archivée par lien direct. Sans lui, l'égalité ci-dessus pourrait venir d'une RLS
  // ouverte à tout le monde, ce qui ne serait pas le même fait.
  it("mais le compte ordinaire ne lit PAS une fiche archivée par lien direct", async () => {
    const { data, error } = await clientSimple
      .from('membres')
      .select('id')
      .eq('id', idArchive)
      .maybeSingle()
    expect(error).toBeNull()
    expect(data).toBeNull()
  })
})

// ───────────────────────────────────────────────────────────────────────────────
// LES DISCIPLES D'UN NŒUD SONT FILTRÉS `etat = 'actif'` POUR TOUS LES RÔLES (D93)
//
// C'est la MOITIÉ DE D93 QUI PORTE SUR LES NŒUDS DE L'ARBRE — l'autre, celle des noms du
// chemin, est éprouvée quarante lignes plus bas, et c'est SON protocole qu'on reprend ici :
// un lot qui mélange les trois états, DEUX sessions réelles, un témoin actif qui rend la
// lecture non vide, et un contrôle positif de lisibilité directe.
//
// LE FILTRE VIT DANS `arbre-lots.ts` (`disciplesParPage`, `.eq('etat', 'actif')`). Il n'est
// PAS délégué à la RLS, et c'est tout l'enjeu : `membres_lecture` délègue à
// `prive.peut_lire_membre`, qui ouvre TOUTE fiche à l'administrateur. Sans le filtre
// explicite, un administrateur verrait sous ce nœud trois disciples là où un compte
// ordinaire en verrait un — deux arbres différents pour la même donnée, alors que l'écran
// annonce que seuls les membres actifs y figurent.
//
// DISCRIMINATION VÉRIFIÉE PAR MUTATION, PAS PAR RAISONNEMENT : `.eq('etat', 'actif')`
// retiré d'`arbre-lots.ts:101`, ce bloc ROUGIT (l'administrateur lit alors les trois
// disciples, et l'égalité avec le compte ordinaire tombe) ; remis, il REVERDIT.
// ───────────────────────────────────────────────────────────────────────────────

describe('disciples du nœud, filtrés etat = actif explicitement', () => {
  it("n'expose NI le disciple archivé NI le disciple en attente, PAS MÊME À L'ADMINISTRATEUR", async () => {
    const vuAdmin = await disciplesParPage(clientAdminSession, idFaiseurEtats, { taillePage: 10 })
    const vuSimple = await disciplesParPage(clientSimple, idFaiseurEtats, { taillePage: 10 })

    // LE TÉMOIN ACTIF EST BIEN LÀ, POUR LES DEUX. Sans cette assertion, tout ce qui suit
    // serait satisfait par deux listes vides — une session expirée, une base en panne.
    expect(vuAdmin.lignes.map((m) => m.id)).toEqual([idDiscipleActif])
    expect(vuSimple.lignes.map((m) => m.id)).toEqual([idDiscipleActif])

    // ET LE TOTAL ANNONCÉ SUIT LE FILTRE, pas seulement la page rendue : le nœud affiche
    // « 1 disciple », jamais « 3 disciples » dont deux invisibles.
    expect(vuAdmin.total).toBe(1)
    expect(vuSimple.total).toBe(1)

    // ET L'ÉGALITÉ, qui est le fait de D93 : l'exclusion vient de la RÈGLE ÉNONCÉE, et non
    // du lecteur.
    expect(vuSimple.lignes.map((m) => m.id)).toEqual(vuAdmin.lignes.map((m) => m.id))
    expect(vuSimple.total).toBe(vuAdmin.total)
  })

  // CONTRÔLE POSITIF, ET IL N'EST PAS INERTE : une absence dont on n'a pas prouvé que la
  // fiche EXISTE et est LISIBLE par ailleurs ne prouve rien. Cet administrateur ouvre bien
  // les deux fiches par lien direct — c'est donc bien le FILTRE, et non la RLS, qui les a
  // écartées du nœud.
  it('mais ce même administrateur lit les deux disciples non actifs par lien direct', async () => {
    for (const identifiant of [idDiscipleArchive, idDiscipleEnAttente]) {
      const { data, error } = await clientAdminSession
        .from('membres')
        .select('id, faiseur_de_disciple_id')
        .eq('id', identifiant)
        .maybeSingle()
      expect(error).toBeNull()
      expect(data?.id).toBe(identifiant)
      // ET ILS SONT BIEN RATTACHÉS À CE FAISEUR : sans cette assertion, une préparation qui
      // aurait perdu le rattachement rendrait le test vert en n'éprouvant plus rien — les
      // deux fiches seraient absentes du nœud pour la raison la plus banale du monde.
      expect(data?.faiseur_de_disciple_id).toBe(idFaiseurEtats)
    }
  })

  // CONTRÔLE DE LA DIFFÉRENCE DE DROITS : le compte ordinaire, lui, ne les lit PAS par lien
  // direct. Sans lui, l'égalité ci-dessus pourrait venir d'une RLS ouverte à tout le monde,
  // ce qui ne serait pas le même fait.
  it("mais le compte ordinaire ne lit PAS ces deux fiches par lien direct", async () => {
    for (const identifiant of [idDiscipleArchive, idDiscipleEnAttente]) {
      const { data, error } = await clientSimple
        .from('membres')
        .select('id')
        .eq('id', identifiant)
        .maybeSingle()
      expect(error).toBeNull()
      expect(data).toBeNull()
    }
  })
})

// ───────────────────────────────────────────────────────────────────────────────
// LES NOMS DU CHEMIN SONT FILTRÉS `etat = 'actif'` POUR TOUS LES RÔLES (D93)
//
// C'est le seul endroit de l'écran où l'exclusion aurait pu être déléguée à la RLS. Elle
// ne l'est pas, et cette suite le mesure : la politique `membres_lecture` ouvre TOUTE
// fiche à l'administrateur, donc une lecture sans filtre d'état lui NOMMERAIT un maillon
// archivé ou en attente, là où un compte ordinaire lit « Fiche non consultable ». Les
// deux ne verraient plus le même arbre, et l'écran — qui annonce que seuls les membres
// actifs y figurent — mentirait à l'un des deux.
//
// AUCUNE AUTRE PREUVE DE CE PLAN N'EXERCE CE CHEMIN. `chargerChemin` est une Server Action
// et ne peut pas tourner ici ; `cheminAvecLibelles` est pure et ne lit rien. C'est
// `nomsMaillonsActifs` qui porte le filtre, et c'est donc elle qu'on éprouve — contre la
// vraie base, depuis DEUX sessions réelles.
// ───────────────────────────────────────────────────────────────────────────────

describe('noms des maillons du chemin, filtrés etat = actif explicitement', () => {
  it("n'expose NI la fiche archivée NI la fiche en attente, PAS MÊME À L'ADMINISTRATEUR", async () => {
    // Un lot qui MÉLANGE les trois états. `idFaiseur` est actif : c'est le témoin qui
    // rend la lecture non vide, sans quoi les deux absences seraient satisfaites par une
    // requête en panne.
    const lot = [idFaiseur, idArchive, idEnAttente]

    const vuAdmin = await nomsMaillonsActifs(clientAdminSession, lot)
    const vuSimple = await nomsMaillonsActifs(clientSimple, lot)

    // LE MAILLON ACTIF EST BIEN LÀ, POUR LES DEUX. Sans cette assertion, tout ce qui suit
    // serait satisfait par deux listes vides.
    expect(vuAdmin.map((m) => m.id)).toEqual([idFaiseur])
    expect(vuSimple.map((m) => m.id)).toEqual([idFaiseur])

    // ET LES DEUX AUTRES SONT ABSENTS DES DEUX CÔTÉS. C'est l'égalité qui compte : elle dit
    // que l'exclusion vient de la RÈGLE ÉNONCÉE, et non du lecteur.
    expect(vuSimple.map((m) => m.id)).toEqual(vuAdmin.map((m) => m.id))
  })

  // CONTRÔLE POSITIF, ET IL N'EST PAS INERTE : une absence dont on n'a pas prouvé que la
  // fiche EXISTE et est LISIBLE par ailleurs ne prouve rien. Cet administrateur ouvre bien
  // les deux fiches par lien direct — c'est donc bien le FILTRE, et non la RLS, qui les a
  // écartées du chemin.
  it('mais ce même administrateur lit les deux fiches par lien direct', async () => {
    for (const identifiant of [idArchive, idEnAttente]) {
      const { data, error } = await clientAdminSession
        .from('membres')
        .select('id')
        .eq('id', identifiant)
        .maybeSingle()
      expect(error).toBeNull()
      expect(data?.id).toBe(identifiant)
    }
  })

  it("rend une liste vide sur une liste d'identifiants vide, sans interroger la base", async () => {
    expect(await nomsMaillonsActifs(clientSimple, [])).toEqual([])
  })
})

// ───────────────────────────────────────────────────────────────────────────────
// L'INVARIANT D'ARBRE, MESURÉ SUR LA BASE RÉELLE (D99)
// ───────────────────────────────────────────────────────────────────────────────

describe("aucun membre actif n'a de faiseur qui ne soit pas actif", () => {
  it('le vérifie sur toutes les fiches, et DIT sur quoi la mesure a porté', async () => {
    const { data, error } = await admin.from('membres').select('id, nom, etat, faiseur_de_disciple_id')
    if (error) throw new Error(`lecture des fiches impossible : ${error.message}`)
    const fiches = data ?? []
    const parId = new Map(fiches.map((m) => [m.id as string, m]))

    const fautifs = fiches.filter((m) => {
      if (m.etat !== 'actif' || !m.faiseur_de_disciple_id) return false
      const parent = parId.get(m.faiseur_de_disciple_id as string)
      // `parent === undefined` est impossible (clé étrangère), mais on ne conclut pas d'un
      // raisonnement : on ne compte comme fautif que ce qu'on a pu constater.
      return parent !== undefined && parent.etat !== 'actif'
    })
    expect(
      fautifs.map((m) => m.nom),
      "un membre actif a un faiseur non actif : sa branche est un trou dans l'arborescence",
    ).toEqual([])

    /*
      ═══ CETTE MESURE PEUT ÊTRE VRAIE **À VIDE**, ET IL FAUT LE DIRE ═══

      Si la base ne contient AUCUNE fiche `archive` ni `en_attente`, l'assertion ci-dessus
      est vraie sans avoir rien éprouvé : elle ne dit alors pas « l'invariant tient », elle
      dit « le cas ne s'est pas présenté ». Au moment où ce plan a été écrit, la base
      comptait 8 fiches, TOUTES actives, et 2 racines réelles — la mesure y était donc
      VACUELLEMENT vraie.

      Les deux comptes rendus ci-dessous ne sont pas des assertions décoratives : le
      premier garantit que le balayage a porté sur quelque chose, le second ÉCRIT dans le
      rapport de test le nombre de fiches non actives réellement examinées. Un lecteur qui
      voit `0` sait que ce test n'a rien prouvé ce jour-là, et ne prendra pas cette mesure
      pour une preuve.

      Les preuves qui, elles, ÉPROUVENT vraiment les gardes construisent leurs propres
      fiches non actives : elles vivent dans `tests/rls/creation-enrichie.test.ts`.
    */
    expect(fiches.length, "aucune fiche en base : ce balayage n'a porté sur rien").toBeGreaterThan(0)
    const nonActives = fiches.filter((m) => m.etat !== 'actif').length
    console.info(
      `invariant d'arbre : ${fiches.length} fiche(s) examinée(s), dont ${nonActives} non active(s). ` +
        (nonActives === 0
          ? 'AUCUNE fiche non active en base : cette mesure est VACUELLEMENT vraie et ne prouve rien.'
          : 'la mesure a réellement porté sur des fiches non actives.'),
    )
  })
})

// ───────────────────────────────────────────────────────────────────────────────
// PREUVE N°16 — LE VOLET 2 N'ÉCRIT RIEN (D92). LA PREUVE D'UN VIDE EST UN BALAYAGE.
// ───────────────────────────────────────────────────────────────────────────────

describe("aucun chemin d'écriture dans src/app/arborescence/", () => {
  /*
    ═══ SI CE TEST EST ROUGE, LA RÉPONSE N'EST **JAMAIS** D'ÉLARGIR NI D'ASSOUPLIR
        `MOTIFS_ECRITURE`. ═══

    Ce motif est la barrière D92 elle-même. Le voir échouer sur un module qui n'écrit rien
    donne envie de le rétrécir — ou de supprimer le commentaire qui l'a fait échouer. Dans
    les deux cas, la barrière sortirait DÉGRADÉE DE SA PROPRE PREUVE, et plus personne ne
    remarquerait la première vraie écriture ajoutée ensuite.

    RÈGLE : si `fautifs` n'est pas vide, on OUVRE le fichier cité. Si c'est du CODE, on
    retire le code. Si c'est un COMMENTAIRE que `sansCommentaires` n'a pas su écarter, on
    corrige `sansCommentaires`. Le motif, lui, ne bouge pas.
  */
  const MOTIFS_ECRITURE = /clientAdmin|\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/

  /**
   * Retire les commentaires avant balayage.
   *
   * `src/app/arborescence/actions.ts` **PARLE** de la clé de service — il explique en
   * commentaire pourquoi il ne l'emploie pas, et où vit la frontière — **sans jamais
   * l'appeler**. Un balayage qui confond les deux ne prouve rien de plus qu'une
   * INTERDICTION DE VOCABULAIRE, et il rendrait rouge un fichier parfaitement correct : le
   * motif serait alors affaibli, ou le commentaire supprimé, et la barrière serait perdue
   * dans les deux cas.
   */
  function sansCommentaires(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  }

  function fichiersDe(dossier: string): string[] {
    return readdirSync(dossier, { withFileTypes: true }).flatMap((entree) => {
      const chemin = join(dossier, entree.name)
      return entree.isDirectory() ? fichiersDe(chemin) : [chemin]
    })
  }

  it('ne contient aucun clientAdmin, insert, update, delete, upsert ni rpc HORS COMMENTAIRES', () => {
    const fichiers = fichiersDe('src/app/arborescence')
    // Le balayage doit porter sur quelque chose : un dossier vide le rendrait vert pour
    // rien.
    expect(fichiers.length).toBeGreaterThanOrEqual(4)
    const fautifs = fichiers.filter((chemin) =>
      MOTIFS_ECRITURE.test(sansCommentaires(readFileSync(chemin, 'utf8'))),
    )
    expect(
      fautifs,
      "chemin d'écriture dans /arborescence : lire le fichier cité, retirer le CODE — jamais élargir le motif",
    ).toEqual([])
  })

  // CONTRÔLE POSITIF DU BALAYAGE LUI-MÊME, PAR LE MÊME FILTRE : sans lui, une expression
  // régulière cassée — ou un `sansCommentaires` qui effacerait tout — rendrait « aucun
  // fautif » pour toujours, y compris sur un dossier truffé d'écritures. Il passe par
  // `sansCommentaires` parce qu'un contrôle positif qui ne franchirait pas le filtre ne
  // prouverait pas que le filtre laisse passer le code.
  it('le même balayage, à travers le MÊME filtre, TROUVE les écritures là où il y en a', () => {
    const contenu = readFileSync('src/app/membres/actions.ts', 'utf8')
    expect(MOTIFS_ECRITURE.test(sansCommentaires(contenu))).toBe(true)
  })

  // CONTRÔLE DU FILTRE LUI-MÊME : `sansCommentaires` doit retirer les commentaires, et
  // RIEN D'AUTRE. Sans ce test, une expression trop gourmande — qui effacerait le fichier
  // entier — rendrait le balayage vert pour toujours, et le contrôle positif ci-dessus le
  // serait resté aussi longtemps qu'un `clientAdmin` traîne hors commentaire ailleurs.
  it('sansCommentaires retire les commentaires et conserve le code', () => {
    const source = [
      '/** clientAdmin() cité dans un bloc */',
      '// clientAdmin() cité dans une ligne',
      'const x = clientAdmin()',
    ].join('\n')
    const nettoye = sansCommentaires(source)
    expect(nettoye).toContain('const x = clientAdmin()')
    expect(nettoye).not.toContain('cité dans un bloc')
    expect(nettoye).not.toContain('cité dans une ligne')
  })
})
