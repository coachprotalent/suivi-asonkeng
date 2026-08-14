import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
// Import depuis `evenements-lots`, PAS depuis `evenements` : ce dernier porte
// `import 'server-only'`, un `throw` nu hors du bundler Next. Ce module séparé permet à
// cette suite vitest de faire tourner EXACTEMENT le code de production contre la vraie
// base — plutôt qu'une paraphrase, qui ne prouverait rien du tri lui-même.
import {
  evenementsParPage,
  participantsATraiterParPage,
  participantsDEvenementParPage,
} from '@/lib/donnees/evenements-lots'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const CLE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

const FAMILLE = 'ZZEvtPage-'
const PREFIXE = `${FAMILLE}${crypto.randomUUID().slice(0, 8)}`
// MÊME date sur les trois évènements : sans ex æquo sur la clé NON unique, un tri sans
// `.order('id')` final passerait ce test et le défaut resterait ouvert.
const DATE_COMMUNE = '2026-09-15'

const admin: SupabaseClient = createClient(URL, CLE_SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
})

let idType: string
let idsEvenements: string[] = []
let idEvenementPrincipal: string
let idsParticipations: string[] = []
let idsExternesATraiter: string[] = []

/**
 * Parcourt TOUTES les pages et rend l'ensemble des identifiants collectés, plus le total
 * annoncé par la dernière page lue. L'assertion se fait ensuite sur cet ENSEMBLE, jamais
 * sur le compte d'une page : c'est la seule forme qui attrape à la fois une ligne rendue
 * DEUX FOIS et une ligne rendue JAMAIS.
 */
async function parcourir<T>(
  lire: (page: number) => Promise<{ lignes: T[]; total: number }>,
  cle: (ligne: T) => string,
): Promise<{ ids: string[]; total: number; pages: number }> {
  const ids: string[] = []
  let total = 0
  let pages = 0
  // Le plafond de pages est DÉRIVÉ du total annoncé par la première page, jamais une
  // constante arbitraire : la liste « à traiter » est GLOBALE (aucun filtre par famille
  // possible), et un plafond fixe la tronquerait le jour où la production compterait plus
  // de lignes que prévu — le test échouerait alors pour une raison qui n'aurait RIEN à voir
  // avec ce qu'il éprouve. `+ 2` laisse la page vide de fin et une marge d'une page.
  let plafond = 2
  for (let page = 1; page <= plafond; page++) {
    const { lignes, total: t } = await lire(page)
    total = t
    pages = page
    if (page === 1) {
      const taille = Math.max(1, lignes.length)
      plafond = Math.ceil(total / taille) + 2
    }
    ids.push(...lignes.map(cle))
    if (lignes.length === 0) break
    // Garde-fou : une pagination cassée qui rendrait toujours la MÊME page tomberait ici,
    // franchement, au lieu de boucler jusqu'au plafond puis d'échouer sur une assertion
    // dont le message ne dirait pas ce qui s'est passé.
    if (ids.length > total + 10) {
      throw new Error(`parcours divergent : ${ids.length} identifiants collectés pour un total annoncé de ${total}.`)
    }
  }
  return { ids, total, pages }
}

async function nettoyerFamille() {
  const { data: evts, error: e1 } = await admin.from('evenements').select('id').like('titre', `${FAMILLE}%`)
  if (e1) throw new Error(`balayage des évènements impossible : ${e1.message}`)
  const idsEvts = (evts ?? []).map((l) => l.id as string)

  const { data: externes, error: e2 } = await admin
    .from('participants_externes')
    .select('id')
    .like('nom', `${FAMILLE}%`)
  if (e2) throw new Error(`balayage des externes impossible : ${e2.message}`)
  const idsExternes = (externes ?? []).map((l) => l.id as string)

  const { data: membres, error: e3 } = await admin.from('membres').select('id').like('nom', `${FAMILLE}%`)
  if (e3) throw new Error(`balayage des membres impossible : ${e3.message}`)
  const idsMembres = (membres ?? []).map((l) => l.id as string)

  for (const [colonne, ids] of [
    ['evenement_id', idsEvts],
    ['participant_externe_id', idsExternes],
    ['membre_id', idsMembres],
  ] as const) {
    if (ids.length > 0) {
      const { error } = await admin.from('participations').delete().in(colonne, ids)
      if (error) throw new Error(`nettoyage des participations par ${colonne} impossible : ${error.message}`)
    }
  }
  if (idsExternes.length > 0) {
    const { error } = await admin.from('participants_externes').delete().in('id', idsExternes)
    if (error) throw new Error(`nettoyage des externes impossible : ${error.message}`)
  }
  if (idsMembres.length > 0) {
    const { error } = await admin.from('membres').delete().in('id', idsMembres)
    if (error) throw new Error(`nettoyage des membres impossible : ${error.message}`)
  }
  if (idsEvts.length > 0) {
    const { error } = await admin.from('evenements').delete().in('id', idsEvts)
    if (error) throw new Error(`nettoyage des évènements impossible : ${error.message}`)
  }
  const { error: e4 } = await admin.from('types_evenement').delete().like('libelle', `${FAMILLE}%`)
  if (e4) throw new Error(`nettoyage des types impossible : ${e4.message}`)
}

beforeAll(async () => {
  await nettoyerFamille()

  const { data: type, error: erreurType } = await admin
    .from('types_evenement')
    .insert({ libelle: `${PREFIXE}-type` })
    .select('id')
    .single()
  if (erreurType || !type) throw new Error(`création du type impossible : ${erreurType?.message}`)
  idType = type.id as string

  // TROIS évènements à la MÊME date : les ex æquo sont le cœur de cette preuve.
  const { data: evts, error: erreurEvts } = await admin
    .from('evenements')
    .insert([1, 2, 3].map((n) => ({ titre: `${PREFIXE}-evt${n}`, type_id: idType, date_debut: DATE_COMMUNE })))
    .select('id')
  if (erreurEvts || !evts || evts.length !== 3) throw new Error(`création des évènements impossible : ${erreurEvts?.message}`)
  idsEvenements = evts.map((l) => l.id as string)
  idEvenementPrincipal = idsEvenements[0]

  // QUATRE membres, QUATRE participations au même évènement, avec un `saisi_le` IDENTIQUE
  // posé explicitement : sans cet ex æquo, `.order('saisi_le')` suffirait par accident.
  const { data: membres, error: erreurMembres } = await admin
    .from('membres')
    .insert([1, 2, 3, 4].map((n) => ({ nom: `${PREFIXE}-m${n}`, prenom: 'Test', etat: 'actif' })))
    .select('id')
  if (erreurMembres || !membres || membres.length !== 4) {
    throw new Error(`création des membres impossible : ${erreurMembres?.message}`)
  }
  const instantCommun = '2026-09-15T10:00:00.000Z'
  const { data: parts, error: erreurParts } = await admin
    .from('participations')
    .insert(
      membres.map((m) => ({
        evenement_id: idEvenementPrincipal,
        membre_id: m.id,
        saisi_le: instantCommun,
      })),
    )
    .select('id')
  if (erreurParts || !parts || parts.length !== 4) {
    throw new Error(`création des participations impossible : ${erreurParts?.message}`)
  }
  idsParticipations = parts.map((l) => l.id as string)

  // TROIS externes avec désir, tous rattachés au MÊME évènement : leur
  // `premiere_expression` est donc identique, et c'est l'ex æquo qui compte ici.
  const { data: externes, error: erreurExternes } = await admin
    .from('participants_externes')
    .insert([1, 2, 3].map((n) => ({ nom: `${PREFIXE}-x${n}`, prenom: 'Test' })))
    .select('id')
  if (erreurExternes || !externes || externes.length !== 3) {
    throw new Error(`création des externes impossible : ${erreurExternes?.message}`)
  }
  idsExternesATraiter = externes.map((l) => l.id as string)
  const { error: erreurPartsExternes } = await admin.from('participations').insert(
    externes.map((x) => ({
      evenement_id: idEvenementPrincipal,
      participant_externe_id: x.id,
      desir_suivi_spirituel: true,
    })),
  )
  if (erreurPartsExternes) throw new Error(`participations d externes impossibles : ${erreurPartsExternes.message}`)
})

afterAll(async () => {
  await nettoyerFamille()
  for (const [table, colonne] of [
    ['evenements', 'titre'],
    ['participants_externes', 'nom'],
    ['membres', 'nom'],
    ['types_evenement', 'libelle'],
  ] as const) {
    const { count, error } = await admin
      .from(table)
      .select('id', { count: 'exact', head: true })
      .like(colonne, `${FAMILLE}%`)
    expect(error).toBeNull()
    expect(count).toBe(0)
  }
})

describe('pagination et tri total (preuve n°14)', () => {
  it("evenementsParPage : trois évènements À LA MÊME DATE, taille de page 2 — aucun rendu deux fois, aucun manquant", async () => {
    // Le filtre par type restreint le parcours aux lignes de CETTE exécution : la base de
    // production en contient d'autres, et compter sur un total absolu serait faux dès la
    // seconde exécution.
    const { ids, total } = await parcourir(
      (page) => evenementsParPage(admin, { page, typeId: idType, taillePage: 2 }),
      (l) => l.id,
    )
    // Aucun doublon : l'ensemble des identifiants collectés a exactement la taille de la
    // liste collectée.
    expect(new Set(ids).size).toBe(ids.length)
    // Aucun manquant : les trois identifiants créés sont tous là.
    expect(new Set(ids)).toEqual(new Set(idsEvenements))
    // Le total ANNONCÉ est le total RÉEL.
    expect(total).toBe(3)
    expect(ids.length).toBe(total)
  })

  it("participantsDEvenementParPage : quatre participations au MÊME `saisi_le`, taille de page 3 — dernière page partielle", async () => {
    const { ids, total } = await parcourir(
      (page) => participantsDEvenementParPage(admin, idEvenementPrincipal, { page, taillePage: 3 }),
      (l) => l.id,
    )
    // 7 lignes au total : 4 membres + 3 externes, tous sur cet évènement.
    expect(new Set(ids).size).toBe(ids.length)
    expect(total).toBe(7)
    expect(ids.length).toBe(total)
    for (const idParticipation of idsParticipations) {
      expect(ids).toContain(idParticipation)
    }
  })

  it("participantsDEvenementParPage : taille de page 2 — le total est un MULTIPLE… non, 7 n'en est pas un ; on éprouve donc aussi une taille qui DIVISE exactement", async () => {
    // Cas particulier réel : quand le total est un multiple EXACT de la taille de page, la
    // dernière page demandée démarre au nombre total de lignes. Établi contre cette base en
    // phase 3 : PostgREST répond alors une PAGE VIDE, jamais PGRST103. Le parcours doit
    // s'arrêter proprement, sans lever et sans perdre de ligne.
    const { ids, total } = await parcourir(
      (page) => participantsDEvenementParPage(admin, idEvenementPrincipal, { page, taillePage: 7 }),
      (l) => l.id,
    )
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.length).toBe(total)
    expect(total).toBe(7)
  })

  it("participantsATraiterParPage : trois personnes à la MÊME `premiere_expression`, taille de page 2", async () => {
    const { ids, total } = await parcourir(
      (page) => participantsATraiterParPage(admin, { page, taillePage: 2 }),
      (l) => l.participantExterneId,
    )
    expect(new Set(ids).size).toBe(ids.length)
    // La liste « à traiter » est GLOBALE (aucun filtre possible sur la famille) : on ne
    // compare donc pas un total absolu — qui serait faux dès qu'une autre suite laisse une
    // ligne —, mais on vérifie (a) l'absence de doublon sur l'ensemble parcouru, (b) que le
    // total annoncé est le nombre réellement collecté, et (c) que NOS TROIS lignes y sont.
    expect(ids.length).toBe(total)
    for (const idExterne of idsExternesATraiter) {
      expect(ids).toContain(idExterne)
    }
  })

  it('refuse une taille de page hors bornes plutôt que de la borner en silence', async () => {
    // Borner (`Math.min(taille, 999)`) masquerait un appel erroné derrière un comportement
    // différent de celui demandé — et une taille >= max_rows ferait tronquer la page PAR
    // POSTGREST, la boucle conclurait « dernière page », et la fonction rendrait une liste
    // tronquée COMME COMPLÈTE : le défaut d'origine, réintroduit par la porte ouverte pour
    // le corriger.
    await expect(evenementsParPage(admin, { taillePage: 1000 })).rejects.toThrow(/taillePage invalide/)
    await expect(evenementsParPage(admin, { taillePage: 0 })).rejects.toThrow(/taillePage invalide/)
    await expect(
      participantsDEvenementParPage(admin, idEvenementPrincipal, { taillePage: -1 }),
    ).rejects.toThrow(/taillePage invalide/)
    await expect(participantsATraiterParPage(admin, { taillePage: 1500 })).rejects.toThrow(
      /taillePage invalide/,
    )
  })
})
