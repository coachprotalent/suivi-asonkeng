import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { identifiantVersEmail } from '@/lib/domaine/identifiant'

/**
 * Phase 7, D130 / D131 / D132 — les preuves de la colonne `membres.contact_id`.
 *
 * ═══ CE QUE CETTE SUITE ÉTABLIT, ET POURQUOI CHAQUE PREUVE EXISTE ═══
 *
 * La colonne elle-même est banale ; ce qui ne l'est pas, ce sont les DEUX ABSENCES qu'elle
 * revendique et qu'aucune lecture de code ne suffit à établir :
 *
 *   1. AUCUN ANTI-CYCLE (D131). L'arbre des faiseurs de disciple porte un déclencheur qui
 *      refuse tout rattachement fermant un cycle. Le contact N'EN A PAS, délibérément. La
 *      preuve du contact réciproque le mesure : si un jour quelqu'un « harmonisait » les
 *      trois relations en posant un déclencheur commun, elle tomberait — c'est exactement
 *      ce qu'on veut qu'elle fasse.
 *
 *   2. AUCUN EFFET RLS (D132). Le contact n'ouvre RIEN. La dernière preuve mesure les deux
 *      moitiés de cette affirmation : une fiche ACTIVE est lisible du compte contact — mais
 *      elle l'est de TOUT compte actif, ce n'est donc pas le contact qui l'ouvre — et une
 *      fiche ARCHIVÉE ne l'est PAS, alors même que le compte en est le contact.
 *
 * Fixtures et balayage repris de `tests/rls/membres.test.ts`, à l'identique : famille STABLE
 * pour le rattrapage d'une exécution interrompue, suffixe aléatoire pour distinguer les noms
 * de cette exécution-ci, nettoyage VÉRIFIÉ PAR COMPTAGE.
 */

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const CLE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const CLE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

const MDP = `Test-${crypto.randomUUID()}`
const IDENT_SIMPLE = 'test.contact.simple'
const FAMILLE = 'ZZContact-'
const SUFFIXE = crypto.randomUUID().slice(0, 8)
const NOM_A = `${FAMILLE}a-${SUFFIXE}`
const NOM_B = `${FAMILLE}b-${SUFFIXE}`
const NOM_JETABLE = `${FAMILLE}jetable-${SUFFIXE}`
const NOM_LIE_AU_COMPTE = `${FAMILLE}moi-${SUFFIXE}`
const NOM_SUIVI_ACTIF = `${FAMILLE}suivi-actif-${SUFFIXE}`
const NOM_SUIVI_ARCHIVE = `${FAMILLE}suivi-archive-${SUFFIXE}`
// Archivé DÈS LA CRÉATION et sans aucun contact : c'est le contrôle négatif de la dernière
// section. Une fiche distincte, et non `idJetable` — celle-là est SUPPRIMÉE par la preuve
// du `on delete set null` et n'existe plus à ce stade.
const NOM_TEMOIN_ARCHIVE = `${FAMILLE}temoin-archive-${SUFFIXE}`

const admin = createClient(URL, CLE_SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
})

let clientSimple: SupabaseClient
let idSimple: string
let idA: string
let idB: string
let idJetable: string
let idLieAuCompte: string
let idSuiviActif: string
let idSuiviArchive: string
let idTemoinArchive: string

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
  // Balayage de FAMILLE, pas `.in()` sur les noms de CETTE exécution : ce dernier ne
  // rattraperait rien d'une exécution antérieure interrompue.
  //
  // `contact_id` est en `on delete set null` : l'ordre de suppression est donc indifférent
  // ici, contrairement à `antenne_id` (`restrict`). C'est précisément ce que la preuve
  // « remet contact_id à null » établit, et ce balayage en dépend.
  await admin.from('membres').delete().like('nom', `${FAMILLE}%`)
}

/** Lit `contact_id` avec la clé de service — jamais sous RLS : on mesure la BASE, pas la vue. */
async function contactDe(id: string): Promise<string | null> {
  const { data, error } = await admin.from('membres').select('contact_id').eq('id', id).single()
  if (error) throw new Error(`lecture du contact impossible : ${error.message}`)
  return data.contact_id as string | null
}

beforeAll(async () => {
  await supprimerCompte(IDENT_SIMPLE)
  await supprimerMembres()

  const { data: cree, error: erreurMembres } = await admin
    .from('membres')
    .insert([
      { nom: NOM_A, prenom: 'Alpha', etat: 'actif' },
      { nom: NOM_B, prenom: 'Beta', etat: 'actif' },
      { nom: NOM_JETABLE, prenom: 'Jetable', etat: 'actif' },
      { nom: NOM_LIE_AU_COMPTE, prenom: 'Moi', etat: 'actif' },
      { nom: NOM_SUIVI_ACTIF, prenom: 'Actif', etat: 'actif' },
      { nom: NOM_SUIVI_ARCHIVE, prenom: 'Archive', etat: 'archive' },
      { nom: NOM_TEMOIN_ARCHIVE, prenom: 'Temoin', etat: 'archive' },
    ])
    .select('id, nom')
  if (erreurMembres || !cree) {
    throw new Error(`insertion des membres impossible : ${erreurMembres?.message}`)
  }
  const parNom = new Map(cree.map((m) => [m.nom as string, m.id as string]))
  idA = parNom.get(NOM_A)!
  idB = parNom.get(NOM_B)!
  idJetable = parNom.get(NOM_JETABLE)!
  idLieAuCompte = parNom.get(NOM_LIE_AU_COMPTE)!
  idSuiviActif = parNom.get(NOM_SUIVI_ACTIF)!
  idSuiviArchive = parNom.get(NOM_SUIVI_ARCHIVE)!
  idTemoinArchive = parNom.get(NOM_TEMOIN_ARCHIVE)!

  const { data, error } = await admin.auth.admin.createUser({
    email: identifiantVersEmail(IDENT_SIMPLE),
    password: MDP,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`création du compte impossible : ${error?.message}`)
  idSimple = data.user.id

  const { error: erreurProfil } = await admin.from('profils').insert({
    id: idSimple,
    identifiant: IDENT_SIMPLE,
    nom_affichage: 'Test contact',
    membre_id: idLieAuCompte,
  })
  if (erreurProfil) {
    await admin.auth.admin.deleteUser(idSimple)
    throw new Error(`insertion du profil impossible : ${erreurProfil.message}`)
  }

  // Les DEUX fiches suivies désignent le membre lié au compte comme leur contact : c'est
  // le décor de la dernière preuve (D132).
  const { error: erreurContacts } = await admin
    .from('membres')
    .update({ contact_id: idLieAuCompte })
    .in('id', [idSuiviActif, idSuiviArchive])
  if (erreurContacts) {
    await admin.auth.admin.deleteUser(idSimple)
    throw new Error(`désignation des contacts impossible : ${erreurContacts.message}`)
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

  // Nettoyage VÉRIFIÉ PAR COMPTAGE, sur la FAMILLE.
  const { count, error } = await admin
    .from('membres')
    .select('id', { count: 'exact', head: true })
    .like('nom', `${FAMILLE}%`)
  expect(error).toBeNull()
  expect(count).toBe(0)
})

describe('membres.contact_id', () => {
  it('accepte un contact désignant un autre membre', async () => {
    const { error } = await admin.from('membres').update({ contact_id: idB }).eq('id', idA)
    expect(error).toBeNull()
    expect(await contactDe(idA)).toBe(idB)
  })

  it('refuse un membre comme son propre contact', async () => {
    const { error } = await admin.from('membres').update({ contact_id: idA }).eq('id', idA)
    expect(error).not.toBeNull()
    // `23514` : violation de contrainte `check`. On discrimine sur le CODE, jamais sur la
    // prose — le nom de la contrainte, lui, n'apparaît que dans le message anglais de
    // Postgres.
    expect(error!.code).toBe('23514')
    // La valeur précédente n'a pas bougé : le refus n'a rien écrit.
    expect(await contactDe(idA)).toBe(idB)
  })

  it('accepte un contact RÉCIPROQUE — aucun anti-cycle sur cette colonne (D131)', async () => {
    // A a déjà B pour contact (première preuve). On pose l'inverse.
    //
    // ═══ CETTE PREUVE EXISTE POUR TOMBER SI QUELQU'UN « HARMONISE » LES TROIS RELATIONS ═══
    // Le même geste sur `faiseur_de_disciple_id` serait refusé par le déclencheur
    // `membres_anti_cycle` avec `detail = 'cycle_faiseur_de_disciple'`. Sur le contact, il
    // DOIT réussir : deux personnes peuvent parfaitement être en bonne relation l'une avec
    // l'autre, et rien ne parcourt cette colonne récursivement.
    const { error } = await admin.from('membres').update({ contact_id: idA }).eq('id', idB)
    expect(error).toBeNull()
    expect(await contactDe(idB)).toBe(idA)
    expect(await contactDe(idA)).toBe(idB)
  })

  it('remet contact_id à null quand la fiche contact est supprimée', async () => {
    const { error: erreurDesignation } = await admin
      .from('membres')
      .update({ contact_id: idJetable })
      .eq('id', idA)
    expect(erreurDesignation).toBeNull()
    expect(await contactDe(idA)).toBe(idJetable)

    // `on delete set null` : la suppression RÉUSSIT et détache, au lieu d'échouer comme le
    // ferait `antenne_id`, qui est en `restrict`.
    const { error: erreurSuppression } = await admin.from('membres').delete().eq('id', idJetable)
    expect(erreurSuppression).toBeNull()
    expect(await contactDe(idA)).toBeNull()

    // On rétablit le décor des preuves précédentes.
    await admin.from('membres').update({ contact_id: idB }).eq('id', idA)
  })
})

describe('le contact ne change RIEN aux lectures (D132)', () => {
  it("lit la fiche ACTIVE dont il est le contact — comme n'importe quelle fiche active", async () => {
    const { data, error } = await clientSimple.from('membres').select('nom').eq('id', idSuiviActif)
    expect(error).toBeNull()
    expect(data).toEqual([{ nom: NOM_SUIVI_ACTIF }])
  })

  it('ne lit PAS la fiche ARCHIVÉE dont il est pourtant le contact', async () => {
    // LA MOITIÉ QUI COMPTE. Si une branche `contact_id = mon membre_id` était un jour
    // ajoutée à `membres_lecture`, cette preuve tomberait — et c'est ce qu'on veut : la
    // décision de l'utilisateur est que le contact n'ouvre RIEN.
    const { data, error } = await clientSimple.from('membres').select('nom').eq('id', idSuiviArchive)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it("ne lit pas davantage une fiche archivée dont il n'est PAS le contact", async () => {
    // Contrôle NÉGATIF, sur une fiche archivée SANS contact : il établit que c'est bien
    // l'archivage qui ferme la lecture, et non une particularité de la fiche précédente.
    // Les deux preuves ensemble disent la chose complète : l'état décide, le contact n'a
    // aucune voix au chapitre.
    const { data, error } = await clientSimple.from('membres').select('nom').eq('id', idTemoinArchive)
    expect(error).toBeNull()
    expect(data).toEqual([])
    // Et la prémisse de la preuve précédente est bien vérifiée : le compte EST le contact
    // de la fiche archivée, ce qui ne lui sert à rien.
    expect(await contactDe(idSuiviArchive)).toBe(idLieAuCompte)
    expect(await contactDe(idTemoinArchive)).toBeNull()
  })

  it("un compte ne peut toujours pas écrire contact_id lui-même", async () => {
    // Aucune politique d'écriture n'existe sur `membres`, et cette colonne n'en crée pas.
    //
    // `idA` — un membre RÉEL — et non un identifiant de profil : avec une valeur qui
    // violerait de toute façon la clé étrangère, ce test passerait au vert pour la
    // mauvaise raison, et resterait vert même si une politique d'écriture était ouverte.
    const { error } = await clientSimple
      .from('membres')
      .update({ contact_id: idA })
      .eq('id', idSuiviActif)
      .select()
    expect(error).not.toBeNull()
    expect(await contactDe(idSuiviActif)).toBe(idLieAuCompte)
  })
})
