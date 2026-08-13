import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { identifiantVersEmail } from '@/lib/domaine/identifiant'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const CLE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const CLE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

const admin = createClient(URL, CLE_SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const anon = createClient(URL, CLE_ANON, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const MDP = `Test-${crypto.randomUUID()}`
const PREFIXE = 'test.rls.tokens.'
const IDENT_ADMIN = `${PREFIXE}admin`
const IDENT_SIMPLE = `${PREFIXE}simple`
const PREFIXE_MEMBRE = `ZZTokens-${crypto.randomUUID().slice(0, 8)}`

let idAdmin: string
let idSimple: string
let idMembre: string
let idToken: string
let clientAdminAuth: SupabaseClient
let clientSimple: SupabaseClient

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
    .insert({ id: data.user.id, identifiant, nom_affichage: `Test tokens ${identifiant}` })
  if (erreurProfil) {
    await admin.auth.admin.deleteUser(data.user.id)
    throw new Error(`insertion du profil ${identifiant} impossible : ${erreurProfil.message}`)
  }
  if (administrateur) {
    const { error: erreurRole } = await admin
      .from('roles_profil')
      .insert({ profil_id: data.user.id, role: 'administrateur' })
    if (erreurRole) throw new Error(`attribution du rôle impossible : ${erreurRole.message}`)
  }
  return data.user.id
}

beforeAll(async () => {
  await admin.from('membres').delete().like('nom', `${PREFIXE_MEMBRE}%`)
  await supprimerCompte(IDENT_ADMIN)
  await supprimerCompte(IDENT_SIMPLE)

  idAdmin = await creerCompte(IDENT_ADMIN, true)
  idSimple = await creerCompte(IDENT_SIMPLE, false)

  const { data: membre, error: erreurMembre } = await admin
    .from('membres')
    .insert({ nom: `${PREFIXE_MEMBRE}-cible`, prenom: 'Test' })
    .select('id')
    .single()
  if (erreurMembre || !membre) throw new Error(`création du membre cible impossible : ${erreurMembre?.message}`)
  idMembre = membre.id

  const { data: token, error: erreurToken } = await admin
    .from('tokens_inscription')
    .insert({
      code_hash: `hash-test-${crypto.randomUUID()}`,
      mode: 'nominatif',
      membre_id: idMembre,
      cree_par: idAdmin,
      expire_le: new Date(Date.now() + 86_400_000).toISOString(),
    })
    .select('id')
    .single()
  if (erreurToken || !token) throw new Error(`création du token impossible : ${erreurToken?.message}`)
  idToken = token.id

  clientAdminAuth = createClient(URL, CLE_ANON, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error: erreurConnexionAdmin } = await clientAdminAuth.auth.signInWithPassword({
    email: identifiantVersEmail(IDENT_ADMIN),
    password: MDP,
  })
  if (erreurConnexionAdmin) throw new Error(`connexion admin impossible : ${erreurConnexionAdmin.message}`)

  clientSimple = createClient(URL, CLE_ANON, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error: erreurConnexionSimple } = await clientSimple.auth.signInWithPassword({
    email: identifiantVersEmail(IDENT_SIMPLE),
    password: MDP,
  })
  if (erreurConnexionSimple) throw new Error(`connexion simple impossible : ${erreurConnexionSimple.message}`)
})

afterAll(async () => {
  await admin.from('membres').delete().like('nom', `${PREFIXE_MEMBRE}%`)
  await supprimerCompte(IDENT_ADMIN)
  await supprimerCompte(IDENT_SIMPLE)
})

describe('politique tokens_inscription_lecture', () => {
  it('laisse un administrateur lire le token', async () => {
    const { data, error } = await clientAdminAuth.from('tokens_inscription').select('id').eq('id', idToken)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  it('interdit à un compte ordinaire de lire le token', async () => {
    const { data, error } = await clientSimple.from('tokens_inscription').select('id').eq('id', idToken)
    expect(error).toBeNull()
    // RLS ne rend pas d'erreur : elle filtre silencieusement à zéro ligne. C'est
    // pourquoi le contrôle positif ci-dessus, sur le MÊME id, n'est pas décoratif.
    expect(data).toHaveLength(0)
  })

  it('interdit toute lecture au rôle anon', async () => {
    const { data, error } = await anon.from('tokens_inscription').select('id')
    expect(error).not.toBeNull()
    expect(data).toBeNull()
  })
})
