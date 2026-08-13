import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { identifiantVersEmail } from '@/lib/domaine/identifiant'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const CLE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const CLE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

const admin = createClient(URL, CLE_SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })
const anon = createClient(URL, CLE_ANON, { auth: { autoRefreshToken: false, persistSession: false } })

const MDP = `Test-${crypto.randomUUID()}`
const PREFIXE = 'test.rls.notifications.'
const IDENT_ADMIN = `${PREFIXE}admin`
const IDENT_A = `${PREFIXE}a`
const IDENT_B = `${PREFIXE}b`

let idAdmin: string
let idA: string
let idNotifA: string
let clientAdminAuth: SupabaseClient
let clientA: SupabaseClient
let clientB: SupabaseClient

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

async function creerCompte(identifiant: string, administrateur: boolean): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email: identifiantVersEmail(identifiant),
    password: MDP,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`création du compte ${identifiant} impossible : ${error?.message}`)
  const { error: erreurProfil } = await admin
    .from('profils')
    .insert({ id: data.user.id, identifiant, nom_affichage: `Test notifications ${identifiant}` })
  if (erreurProfil) {
    await admin.auth.admin.deleteUser(data.user.id)
    throw new Error(`insertion du profil ${identifiant} impossible : ${erreurProfil.message}`)
  }
  if (administrateur) {
    await admin.from('roles_profil').insert({ profil_id: data.user.id, role: 'administrateur' })
  }
  return data.user.id
}

async function connecter(identifiant: string): Promise<SupabaseClient> {
  const client = createClient(URL, CLE_ANON, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error } = await client.auth.signInWithPassword({ email: identifiantVersEmail(identifiant), password: MDP })
  if (error) throw new Error(`connexion ${identifiant} impossible : ${error.message}`)
  return client
}

beforeAll(async () => {
  await supprimerCompte(IDENT_ADMIN)
  await supprimerCompte(IDENT_A)
  await supprimerCompte(IDENT_B)

  idAdmin = await creerCompte(IDENT_ADMIN, true)
  idA = await creerCompte(IDENT_A, false)
  await creerCompte(IDENT_B, false)

  const { data: notif, error: erreurNotif } = await admin
    .from('notifications')
    .insert({ profil_id: idA, type: 'demande_validee', titre: 'Test', corps: 'Corps de test' })
    .select('id')
    .single()
  if (erreurNotif || !notif) throw new Error(`création de la notification impossible : ${erreurNotif?.message}`)
  idNotifA = notif.id

  clientAdminAuth = await connecter(IDENT_ADMIN)
  clientA = await connecter(IDENT_A)
  clientB = await connecter(IDENT_B)
})

afterAll(async () => {
  await supprimerCompte(IDENT_ADMIN)
  await supprimerCompte(IDENT_A)
  await supprimerCompte(IDENT_B)
})

describe('politique notifications_lecture', () => {
  it('laisse le destinataire lire sa propre notification', async () => {
    const { data, error } = await clientA.from('notifications').select('id').eq('id', idNotifA)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  it("interdit à un AUTRE compte de la lire", async () => {
    const { data, error } = await clientB.from('notifications').select('id').eq('id', idNotifA)
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  // Design 2b §5.5 : « jamais l'administrateur pour autrui ». Ici, « administrateur »
  // N'EST PAS synonyme de « voit tout » — à souligner, car un relecteur pressé
  // pourrait le lire comme un défaut plutôt que comme l'intention du design.
  it("interdit MÊME À UN ADMINISTRATEUR de lire la notification d'autrui", async () => {
    const { data, error } = await clientAdminAuth.from('notifications').select('id').eq('id', idNotifA)
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it('interdit toute lecture au rôle anon', async () => {
    const { data, error } = await anon.from('notifications').select('id')

    // Vérifier l'erreur, et pas seulement l'absence de données. `data` vaut `null`
    // pour n'importe quelle panne — table renommée, réseau coupé, mauvais projet —
    // et une assertion qui se contenterait de `data` resterait verte alors que la
    // sécurité serait cassée. Le code `42501` est le refus de privilège Postgres :
    // le rôle anonyme n'a aucun droit de lecture, le refus tombe même avant la RLS.
    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')
    expect(data).toBeNull()
  })
})
