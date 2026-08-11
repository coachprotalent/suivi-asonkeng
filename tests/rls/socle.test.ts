import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { identifiantVersEmail } from '@/lib/domaine/identifiant'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const CLE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const CLE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

const MDP = 'MotDePasseDeTest!2026'
const IDENT_SIMPLE = 'test.rls.simple'
const IDENT_ADMIN = 'test.rls.admin'

const admin = createClient(URL, CLE_SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function creerCompte(identifiant: string, estAdmin: boolean): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email: identifiantVersEmail(identifiant),
    password: MDP,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`création impossible : ${error?.message}`)

  await admin
    .from('profils')
    .insert({ id: data.user.id, identifiant, nom_affichage: `Test ${identifiant}` })
  if (estAdmin) {
    await admin.from('roles_profil').insert({ profil_id: data.user.id, role: 'administrateur' })
  }
  return data.user.id
}

async function connecter(identifiant: string): Promise<SupabaseClient> {
  const client = createClient(URL, CLE_ANON, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error } = await client.auth.signInWithPassword({
    email: identifiantVersEmail(identifiant),
    password: MDP,
  })
  if (error) throw new Error(`connexion impossible : ${error.message}`)
  return client
}

async function supprimerCompte(identifiant: string) {
  const { data } = await admin.from('profils').select('id').eq('identifiant', identifiant).maybeSingle()
  if (data) await admin.auth.admin.deleteUser(data.id)
}

let idSimple: string
let idAdmin: string
let clientSimple: SupabaseClient
let clientAdministrateur: SupabaseClient
const clientAnonyme = createClient(URL, CLE_ANON, {
  auth: { autoRefreshToken: false, persistSession: false },
})

beforeAll(async () => {
  await supprimerCompte(IDENT_SIMPLE)
  await supprimerCompte(IDENT_ADMIN)
  idSimple = await creerCompte(IDENT_SIMPLE, false)
  idAdmin = await creerCompte(IDENT_ADMIN, true)
  clientSimple = await connecter(IDENT_SIMPLE)
  clientAdministrateur = await connecter(IDENT_ADMIN)
})

afterAll(async () => {
  await supprimerCompte(IDENT_SIMPLE)
  await supprimerCompte(IDENT_ADMIN)
})

describe('lecture de profils', () => {
  it('un utilisateur lit son propre profil', async () => {
    const { data } = await clientSimple.from('profils').select('identifiant').eq('id', idSimple)
    expect(data).toEqual([{ identifiant: IDENT_SIMPLE }])
  })

  it("un utilisateur ne lit pas le profil d'autrui", async () => {
    const { data } = await clientSimple.from('profils').select('identifiant').eq('id', idAdmin)
    expect(data).toEqual([])
  })

  it('un administrateur lit tous les profils', async () => {
    const { data } = await clientAdministrateur.from('profils').select('id')
    expect(data!.map((l) => l.id)).toEqual(expect.arrayContaining([idSimple, idAdmin]))
  })

  it('un visiteur anonyme ne lit aucun profil', async () => {
    const { data } = await clientAnonyme.from('profils').select('id')
    expect(data ?? []).toEqual([])
  })
})

describe('écriture refusée par défaut', () => {
  it("un utilisateur ne peut pas modifier son propre profil", async () => {
    const { error } = await clientSimple
      .from('profils')
      .update({ nom_affichage: 'Piraté' })
      .eq('id', idSimple)
      .select()
    expect(error).not.toBeNull()

    const { data } = await admin.from('profils').select('nom_affichage').eq('id', idSimple).single()
    expect(data!.nom_affichage).not.toBe('Piraté')
  })

  it('un utilisateur ne peut pas insérer un profil', async () => {
    const { error } = await clientSimple
      .from('profils')
      .insert({ id: idSimple, identifiant: 'test.rls.intrus', nom_affichage: 'Intrus' })
    expect(error).not.toBeNull()
  })

  it('un utilisateur ne peut pas supprimer un profil', async () => {
    const { error } = await clientSimple.from('profils').delete().eq('id', idSimple).select()
    expect(error).not.toBeNull()

    const { data } = await admin.from('profils').select('id').eq('id', idSimple).maybeSingle()
    expect(data).not.toBeNull()
  })

  it("un utilisateur ne peut pas s'attribuer le rôle administrateur", async () => {
    const { error } = await clientSimple
      .from('roles_profil')
      .insert({ profil_id: idSimple, role: 'administrateur' })
    expect(error).not.toBeNull()

    const { data } = await admin.from('roles_profil').select('role').eq('profil_id', idSimple)
    expect(data ?? []).toEqual([])
  })

  it('un administrateur non plus ne peut pas écrire depuis le client', async () => {
    const { error } = await clientAdministrateur
      .from('profils')
      .update({ nom_affichage: 'Modifié' })
      .eq('id', idSimple)
      .select()
    expect(error).not.toBeNull()
  })
})
