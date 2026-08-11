import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { identifiantVersEmail } from '@/lib/domaine/identifiant'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const CLE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const CLE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Tiré à chaque exécution : un mot de passe fixe dans un dépôt public ouvrirait
// tout compte de test qu'une exécution interrompue aurait laissé derrière elle.
const MDP = `Test-${crypto.randomUUID()}`
const IDENT = 'test.statuts.simple'
const NOM_ACTIF = `ZZStatut-actif-${crypto.randomUUID().slice(0, 8)}`
const NOM_ARCHIVE = `ZZStatut-archive-${crypto.randomUUID().slice(0, 8)}`

const admin = createClient(URL, CLE_SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const clientAnonyme = createClient(URL, CLE_ANON, {
  auth: { autoRefreshToken: false, persistSession: false },
})

let idProfil: string
let clientSimple: SupabaseClient
let idMembreActif: string
let idMembreArchive: string
let idStatutRepenti: string

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
  // `membre_statuts` et `journal_statuts` sont en `on delete cascade` sur `membres`.
  await admin.from('membres').delete().in('nom', [NOM_ACTIF, NOM_ARCHIVE])
}

beforeAll(async () => {
  await supprimerCompte(IDENT)
  await supprimerMembres()

  const { data, error } = await admin.auth.admin.createUser({
    email: identifiantVersEmail(IDENT),
    password: MDP,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`création impossible : ${error?.message}`)
  idProfil = data.user.id

  const { error: erreurProfil } = await admin
    .from('profils')
    .insert({ id: idProfil, identifiant: IDENT, nom_affichage: 'Test statuts' })
  if (erreurProfil) {
    await admin.auth.admin.deleteUser(idProfil)
    throw new Error(`insertion du profil impossible : ${erreurProfil.message}`)
  }

  const { data: membres, error: erreurMembres } = await admin
    .from('membres')
    .insert([
      { nom: NOM_ACTIF, prenom: 'Actif', etat: 'actif' },
      { nom: NOM_ARCHIVE, prenom: 'Archive', etat: 'archive' },
    ])
    .select('id, nom')
  if (erreurMembres || !membres) {
    await admin.auth.admin.deleteUser(idProfil)
    throw new Error(`insertion des membres impossible : ${erreurMembres?.message}`)
  }
  idMembreActif = membres.find((m) => m.nom === NOM_ACTIF)!.id
  idMembreArchive = membres.find((m) => m.nom === NOM_ARCHIVE)!.id

  const { data: statut } = await admin
    .from('statuts')
    .select('id')
    .eq('libelle', 'Repenti')
    .single()
  idStatutRepenti = statut!.id

  // Un statut sur chaque membre, posé par la fonction atomique.
  for (const membre of [idMembreActif, idMembreArchive]) {
    const { error: erreurRpc } = await admin.rpc('attribuer_statut', {
      p_membre: membre,
      p_statut: idStatutRepenti,
      p_date: null,
      p_note: null,
      p_par: idProfil,
    })
    if (erreurRpc) {
      await admin.auth.admin.deleteUser(idProfil)
      await supprimerMembres()
      throw new Error(`attribution impossible : ${erreurRpc.message}`)
    }
  }

  clientSimple = createClient(URL, CLE_ANON, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error: erreurConnexion } = await clientSimple.auth.signInWithPassword({
    email: identifiantVersEmail(IDENT),
    password: MDP,
  })
  if (erreurConnexion) throw new Error(`connexion impossible : ${erreurConnexion.message}`)
})

afterAll(async () => {
  await supprimerMembres()
  await supprimerCompte(IDENT)
})

describe('lecture du catalogue', () => {
  it('un utilisateur actif lit les groupes et les statuts', async () => {
    const { data: groupes } = await clientSimple.from('groupes_statut').select('nom')
    const { data: statuts } = await clientSimple.from('statuts').select('libelle')
    expect(groupes!.length).toBeGreaterThanOrEqual(2)
    expect(statuts!.length).toBeGreaterThanOrEqual(5)
  })

  it('un visiteur anonyme se voit refuser la lecture des statuts', async () => {
    const { data, error } = await clientAnonyme.from('statuts').select('id')
    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')
    expect(data).toBeNull()
  })

  it('un visiteur anonyme se voit refuser la lecture des groupes', async () => {
    const { data, error } = await clientAnonyme.from('groupes_statut').select('id')
    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')
    expect(data).toBeNull()
  })
})

describe("lecture des statuts d'un membre", () => {
  it("un utilisateur actif lit les statuts d'un membre actif", async () => {
    const { data } = await clientSimple
      .from('membre_statuts')
      .select('statut_id')
      .eq('membre_id', idMembreActif)
    expect(data).toEqual([{ statut_id: idStatutRepenti }])
  })

  it("un non-administrateur ne lit pas les statuts d'un membre archivé", async () => {
    const { data } = await clientSimple
      .from('membre_statuts')
      .select('statut_id')
      .eq('membre_id', idMembreArchive)
    expect(data).toEqual([])
  })

  it("un utilisateur actif lit le journal d'un membre actif", async () => {
    const { data } = await clientSimple
      .from('journal_statuts')
      .select('action')
      .eq('membre_id', idMembreActif)
    expect(data!.length).toBeGreaterThanOrEqual(1)
    expect(data![0].action).toBe('ajout')
  })
})

describe('écriture refusée par défaut', () => {
  it('un utilisateur ne peut pas attribuer un statut', async () => {
    const { error } = await clientSimple
      .from('membre_statuts')
      .insert({ membre_id: idMembreActif, statut_id: idStatutRepenti })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')

    const { data } = await admin
      .from('membre_statuts')
      .select('statut_id')
      .eq('membre_id', idMembreActif)
    expect(data).toHaveLength(1)
  })

  it('un utilisateur ne peut pas retirer un statut', async () => {
    const { error } = await clientSimple
      .from('membre_statuts')
      .delete()
      .eq('membre_id', idMembreActif)
      .select()
    expect(error).not.toBeNull()

    const { data } = await admin
      .from('membre_statuts')
      .select('statut_id')
      .eq('membre_id', idMembreActif)
    expect(data).toHaveLength(1)
  })

  it('un utilisateur ne peut pas écrire dans le journal', async () => {
    const { error } = await clientSimple.from('journal_statuts').insert({
      membre_id: idMembreActif,
      statut_id: idStatutRepenti,
      action: 'retrait',
    })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')
  })

  it('un utilisateur ne peut pas créer un statut au catalogue', async () => {
    const libelleIntrus = `ZZIntrus-${crypto.randomUUID().slice(0, 8)}`
    const { data: groupe } = await admin.from('groupes_statut').select('id').limit(1).single()
    const { error } = await clientSimple
      .from('statuts')
      .insert({ groupe_id: groupe!.id, libelle: libelleIntrus })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')

    const { data } = await admin.from('statuts').select('id').eq('libelle', libelleIntrus)
    expect(data).toEqual([])
  })
})

describe('compte désactivé', () => {
  // Ces trois tests prouvent le résultat observable : un compte désactivé ne lit
  // plus rien sur `membre_statuts` ni `journal_statuts`. Le troisième est un
  // contrôle positif : sans lui, les deux premiers passeraient aussi si la lecture
  // était cassée pour une raison sans rapport avec l'état du compte.
  //
  // Ils ne prouvent PAS que c'est la clause `prive.est_actif()` de
  // `membre_statuts_lecture` qui arrête un compte désactivé. Preuve par mutation
  // (retrait isolé de cette seule clause, hors de ce fichier) : la suite reste
  // entièrement verte, parce que la sous-requête vers `public.membres` reste
  // soumise à `membres_lecture`, qui exige déjà `prive.est_actif()`. La protection
  // vient donc par héritage de la politique de `membres` (phase antérieure,
  // couverte par `tests/rls/membres.test.ts`), pas d'une preuve isolée ici. La
  // clause de `membre_statuts_lecture` reste une défense en profondeur légitime —
  // si `membres_lecture` change un jour, celle-ci tient encore — mais cette suite
  // ne peut pas l'isoler pour la démontrer seule. Seule une mutation qui retire la
  // politique entière (`using (true)`) fait tomber ces tests.
  it('un compte désactivé ne lit plus les statuts', async () => {
    await admin.from('profils').update({ actif: false }).eq('id', idProfil)
    try {
      const { data } = await clientSimple
        .from('membre_statuts')
        .select('statut_id')
        .eq('membre_id', idMembreActif)
      expect(data).toEqual([])
    } finally {
      await admin.from('profils').update({ actif: true }).eq('id', idProfil)
    }
  })

  it('un compte désactivé ne lit plus le journal', async () => {
    await admin.from('profils').update({ actif: false }).eq('id', idProfil)
    try {
      const { data } = await clientSimple
        .from('journal_statuts')
        .select('id')
        .eq('membre_id', idMembreActif)
      expect(data).toEqual([])
    } finally {
      await admin.from('profils').update({ actif: true }).eq('id', idProfil)
    }
  })

  it('un compte réactivé lit de nouveau les statuts', async () => {
    const { data } = await clientSimple
      .from('membre_statuts')
      .select('statut_id')
      .eq('membre_id', idMembreActif)
    expect(data).toHaveLength(1)
  })
})

describe('journal protégé contre la réécriture', () => {
  // Contrôle positif de lecture, avec la clé de service : sans lui, le refus
  // d'`update` ci-dessous pourrait aussi bien signifier « cette entrée n'existe pas »
  // ou « la table est inaccessible », pas « la réécriture est spécifiquement bloquée ».
  it('la clé de service lit une entrée du journal', async () => {
    const { data, error } = await admin
      .from('journal_statuts')
      .select('id, action')
      .eq('membre_id', idMembreActif)
      .eq('statut_id', idStatutRepenti)
      .eq('action', 'ajout')
      .maybeSingle()
    expect(error).toBeNull()
    expect(data).not.toBeNull()
  })

  // Contrôle positif d'écriture : une attribution légitime, par le même chemin que
  // l'application, doit continuer à écrire dans le journal. Sans ce test, un refus
  // d'`update` pourrait aussi bien signifier « la table entière est verrouillée en
  // écriture », ce qui n'est pas la garantie voulue — seule la réécriture l'est.
  it('une attribution légitime écrit une nouvelle entrée dans le journal', async () => {
    const { data: statutBapteme } = await admin
      .from('statuts')
      .select('id')
      .eq('libelle', "Baptisé d'eau")
      .single()

    const { error: erreurRpc } = await admin.rpc('attribuer_statut', {
      p_membre: idMembreActif,
      p_statut: statutBapteme!.id,
      p_date: null,
      p_note: null,
      p_par: idProfil,
    })
    expect(erreurRpc).toBeNull()

    const { data } = await admin
      .from('journal_statuts')
      .select('action')
      .eq('membre_id', idMembreActif)
      .eq('statut_id', statutBapteme!.id)
      .eq('action', 'ajout')
    expect(data).toHaveLength(1)
  })

  // Le refus doit tenir même pour la clé de service : c'est précisément le chemin
  // que le déclencheur doit arrêter, puisque c'est le seul par lequel l'application
  // écrit jamais dans cette table (la RLS interdit déjà l'écriture aux utilisateurs,
  // testé plus haut — ça ne prouverait rien de plus ici).
  it('même la clé de service ne peut pas modifier une entrée existante', async () => {
    const { data: avant } = await admin
      .from('journal_statuts')
      .select('id, motif')
      .eq('membre_id', idMembreActif)
      .eq('statut_id', idStatutRepenti)
      .eq('action', 'ajout')
      .single()

    const { error } = await admin
      .from('journal_statuts')
      .update({ motif: 'Réécriture tentée' })
      .eq('id', avant!.id)
      .select()
    expect(error).not.toBeNull()
    expect(error!.message).toContain('ne se réécrit pas')

    const { data: apres } = await admin
      .from('journal_statuts')
      .select('motif')
      .eq('id', avant!.id)
      .single()
    expect(apres!.motif).toBe(avant!.motif)
  })
})
