import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { identifiantVersEmail } from '@/lib/domaine/identifiant'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const CLE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const CLE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Tiré à chaque exécution : un mot de passe fixe dans un dépôt public ouvrirait
// tout compte de test qu'une exécution interrompue aurait laissé derrière elle.
const MDP = `Test-${crypto.randomUUID()}`
const IDENT_SIMPLE = 'test.membres.simple'
const NOM_MEMBRE_ACTIF = `ZZTest-actif-${crypto.randomUUID().slice(0, 8)}`
const NOM_MEMBRE_ARCHIVE = `ZZTest-archive-${crypto.randomUUID().slice(0, 8)}`

const admin = createClient(URL, CLE_SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const clientAnonyme = createClient(URL, CLE_ANON, {
  auth: { autoRefreshToken: false, persistSession: false },
})

let idSimple: string
let clientSimple: SupabaseClient
let idMembreActif: string
let idMembreArchive: string

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
  await admin.from('membres').delete().in('nom', [NOM_MEMBRE_ACTIF, NOM_MEMBRE_ARCHIVE])
}

beforeAll(async () => {
  await supprimerCompte(IDENT_SIMPLE)
  await supprimerMembres()

  const { data, error } = await admin.auth.admin.createUser({
    email: identifiantVersEmail(IDENT_SIMPLE),
    password: MDP,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`création impossible : ${error?.message}`)
  idSimple = data.user.id

  const { error: erreurProfil } = await admin
    .from('profils')
    .insert({ id: idSimple, identifiant: IDENT_SIMPLE, nom_affichage: 'Test membres' })
  if (erreurProfil) {
    await admin.auth.admin.deleteUser(idSimple)
    throw new Error(`insertion du profil impossible : ${erreurProfil.message}`)
  }

  const { data: cree, error: erreurMembres } = await admin
    .from('membres')
    .insert([
      { nom: NOM_MEMBRE_ACTIF, prenom: 'Actif', etat: 'actif' },
      { nom: NOM_MEMBRE_ARCHIVE, prenom: 'Archive', etat: 'archive' },
    ])
    .select('id, nom')
  if (erreurMembres || !cree) {
    await admin.auth.admin.deleteUser(idSimple)
    throw new Error(`insertion des membres impossible : ${erreurMembres?.message}`)
  }
  idMembreActif = cree.find((m) => m.nom === NOM_MEMBRE_ACTIF)!.id
  idMembreArchive = cree.find((m) => m.nom === NOM_MEMBRE_ARCHIVE)!.id

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
  await supprimerMembres()
  await supprimerCompte(IDENT_SIMPLE)
})

describe('lecture des membres', () => {
  it('un utilisateur actif lit les membres actifs', async () => {
    const { data } = await clientSimple.from('membres').select('nom').eq('id', idMembreActif)
    expect(data).toEqual([{ nom: NOM_MEMBRE_ACTIF }])
  })

  it('un utilisateur non administrateur ne lit pas les fiches archivées', async () => {
    const { data } = await clientSimple.from('membres').select('nom').eq('id', idMembreArchive)
    expect(data).toEqual([])
  })

  it('un visiteur anonyme se voit refuser la lecture des membres', async () => {
    const { data, error } = await clientAnonyme.from('membres').select('id')
    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')
    expect(data).toBeNull()
  })

  it('un visiteur anonyme se voit refuser la lecture des antennes', async () => {
    const { data, error } = await clientAnonyme.from('antennes').select('id')
    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')
    expect(data).toBeNull()
  })

  it('un utilisateur actif lit les antennes', async () => {
    const { data } = await clientSimple.from('antennes').select('nom').eq('nom', 'France')
    expect(data).toEqual([{ nom: 'France' }])
  })
})

describe('écriture refusée par défaut', () => {
  it("un utilisateur ne peut pas créer de membre", async () => {
    const nomIntrus = `ZZTest-intrus-${crypto.randomUUID().slice(0, 8)}`
    const { error } = await clientSimple
      .from('membres')
      .insert({ nom: nomIntrus, prenom: 'Intrus' })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')

    const { data } = await admin.from('membres').select('id').eq('nom', nomIntrus)
    expect(data).toEqual([])
  })

  it('un utilisateur ne peut pas modifier un membre', async () => {
    const { error } = await clientSimple
      .from('membres')
      .update({ ville: 'Piratée' })
      .eq('id', idMembreActif)
      .select()
    expect(error).not.toBeNull()

    const { data } = await admin.from('membres').select('ville').eq('id', idMembreActif).single()
    expect(data!.ville).not.toBe('Piratée')
  })

  it('un utilisateur ne peut pas supprimer un membre', async () => {
    const { error } = await clientSimple.from('membres').delete().eq('id', idMembreActif).select()
    expect(error).not.toBeNull()

    const { data } = await admin.from('membres').select('id').eq('id', idMembreActif).maybeSingle()
    expect(data).not.toBeNull()
  })

  it('un utilisateur ne peut pas créer une antenne', async () => {
    const nomIntrus = `ZZAntenne-${crypto.randomUUID().slice(0, 8)}`
    const { error } = await clientSimple
      .from('antennes')
      .insert({ nom: nomIntrus, pays: 'Nulle part' })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')

    const { data } = await admin.from('antennes').select('id').eq('nom', nomIntrus)
    expect(data).toEqual([])
  })
})

describe('compte désactivé', () => {
  // Ces deux tests sont la seule preuve d'exécution de `prive.est_actif()`. La fonction
  // est `SECURITY DEFINER` — elle échappe volontairement à la RLS — et vérifier sa
  // signature ne prouve rien de sa logique. Ici on la met réellement à l'épreuve, sur
  // les deux tables dont les politiques en dépendent.
  it('un compte désactivé ne lit plus les membres', async () => {
    await admin.from('profils').update({ actif: false }).eq('id', idSimple)
    try {
      const { data } = await clientSimple.from('membres').select('id').eq('id', idMembreActif)
      expect(data).toEqual([])
    } finally {
      await admin.from('profils').update({ actif: true }).eq('id', idSimple)
    }
  })

  it('un compte désactivé ne lit plus les antennes', async () => {
    await admin.from('profils').update({ actif: false }).eq('id', idSimple)
    try {
      const { data } = await clientSimple.from('antennes').select('id')
      expect(data).toEqual([])
    } finally {
      await admin.from('profils').update({ actif: true }).eq('id', idSimple)
    }
  })

  it('un compte réactivé lit de nouveau les membres', async () => {
    // Contrôle positif : sans lui, les deux tests ci-dessus passeraient aussi si la
    // lecture était cassée pour une raison sans rapport avec `actif`.
    const { data } = await clientSimple.from('membres').select('id').eq('id', idMembreActif)
    expect(data).toHaveLength(1)
  })
})
