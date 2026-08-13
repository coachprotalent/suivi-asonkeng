import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { identifiantVersEmail } from '@/lib/domaine/identifiant'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const CLE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const CLE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

const admin = createClient(URL, CLE_SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })
const anon = createClient(URL, CLE_ANON, { auth: { autoRefreshToken: false, persistSession: false } })

const MDP = `Test-${crypto.randomUUID()}`
const PREFIXE = 'test.rls.demandes.'
const IDENT_ADMIN = `${PREFIXE}admin`
const IDENT_DEMANDEUR_A = `${PREFIXE}demandeura`
const IDENT_DEMANDEUR_B = `${PREFIXE}demandeurb`
const PREFIXE_MEMBRE = `ZZDemandes-${crypto.randomUUID().slice(0, 8)}`

let idAdmin: string
let idDemandeurA: string
let idDemandeurB: string
let idMembreA: string
let idDemandeA: string
let clientAdminAuth: SupabaseClient
let clientDemandeurA: SupabaseClient
let clientDemandeurB: SupabaseClient

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
    .insert({ id: data.user.id, identifiant, nom_affichage: `Test demandes ${identifiant}` })
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
  await admin.from('membres').delete().like('nom', `${PREFIXE_MEMBRE}%`)
  await supprimerCompte(IDENT_ADMIN)
  await supprimerCompte(IDENT_DEMANDEUR_A)
  await supprimerCompte(IDENT_DEMANDEUR_B)

  idAdmin = await creerCompte(IDENT_ADMIN, true)
  idDemandeurA = await creerCompte(IDENT_DEMANDEUR_A, false)
  idDemandeurB = await creerCompte(IDENT_DEMANDEUR_B, false)

  const { data: membre, error: erreurMembre } = await admin
    .from('membres')
    .insert({ nom: `${PREFIXE_MEMBRE}-a`, prenom: 'Test', etat: 'en_attente' })
    .select('id')
    .single()
  if (erreurMembre || !membre) throw new Error(`création du membre impossible : ${erreurMembre?.message}`)
  idMembreA = membre.id

  const { data: demande, error: erreurDemande } = await admin
    .from('demandes_membre')
    .insert({
      origine: 'demande_suivi',
      demandeur_profil_id: idDemandeurA,
      membre_id: idMembreA,
      etat: 'en_attente',
    })
    .select('id')
    .single()
  if (erreurDemande || !demande) throw new Error(`création de la demande impossible : ${erreurDemande?.message}`)
  idDemandeA = demande.id

  clientAdminAuth = await connecter(IDENT_ADMIN)
  clientDemandeurA = await connecter(IDENT_DEMANDEUR_A)
  clientDemandeurB = await connecter(IDENT_DEMANDEUR_B)
})

afterAll(async () => {
  await admin.from('membres').delete().like('nom', `${PREFIXE_MEMBRE}%`)
  await supprimerCompte(IDENT_ADMIN)
  await supprimerCompte(IDENT_DEMANDEUR_A)
  await supprimerCompte(IDENT_DEMANDEUR_B)
})

describe('politique demandes_membre_lecture', () => {
  it('laisse le demandeur lire sa propre demande', async () => {
    const { data, error } = await clientDemandeurA.from('demandes_membre').select('id').eq('id', idDemandeA)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  it("interdit à un AUTRE demandeur de lire cette demande", async () => {
    const { data, error } = await clientDemandeurB.from('demandes_membre').select('id').eq('id', idDemandeA)
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it('laisse un administrateur lire toutes les demandes', async () => {
    const { data, error } = await clientAdminAuth.from('demandes_membre').select('id').eq('id', idDemandeA)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  it('interdit toute lecture au rôle anon', async () => {
    const { data, error } = await anon.from('demandes_membre').select('id')

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
