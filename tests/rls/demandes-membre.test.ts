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
let idMembreArchive: string
let idMembreOrphelin: string
let idMembreActifZZ: string
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

  // Fiche ARCHIVÉE, mais référencée par une demande de demandeurA (I3a) : sert à
  // prouver que la conjonction etat = 'en_attente' de la politique n'est pas
  // superflue — sans elle, un demandeur lirait sa fiche dans n'importe quel état.
  const { data: membreArchive, error: erreurMembreArchive } = await admin
    .from('membres')
    .insert({ nom: `${PREFIXE_MEMBRE}-archive`, prenom: 'Test', etat: 'archive' })
    .select('id')
    .single()
  if (erreurMembreArchive || !membreArchive) {
    throw new Error(`création du membre archivé impossible : ${erreurMembreArchive?.message}`)
  }
  idMembreArchive = membreArchive.id

  const { error: erreurDemandeArchive } = await admin.from('demandes_membre').insert({
    origine: 'demande_suivi',
    demandeur_profil_id: idDemandeurA,
    membre_id: idMembreArchive,
    etat: 'en_attente',
  })
  if (erreurDemandeArchive) {
    throw new Error(`création de la demande sur la fiche archivée impossible : ${erreurDemandeArchive.message}`)
  }

  // Fiche en_attente SANS AUCUNE demande (I3b) : sert à prouver que la corrélation
  // d.membre_id = p_membre_id, dans prive.est_demandeur_de, n'est pas superflue —
  // sans elle, avoir NE SERAIT-CE QU'UNE demande (sur idMembreA) suffirait à lire
  // n'importe quelle fiche en_attente, celle-ci comprise.
  const { data: membreOrphelin, error: erreurMembreOrphelin } = await admin
    .from('membres')
    .insert({ nom: `${PREFIXE_MEMBRE}-orphelin`, prenom: 'Test', etat: 'en_attente' })
    .select('id')
    .single()
  if (erreurMembreOrphelin || !membreOrphelin) {
    throw new Error(`création du membre orphelin impossible : ${erreurMembreOrphelin?.message}`)
  }
  idMembreOrphelin = membreOrphelin.id

  // Fiche ACTIVE propre à cette suite (M3) : remplace une lecture arbitraire dans
  // la base partagée dev/prod pour les contrôles positifs sur l'annuaire actif.
  const { data: membreActifZZ, error: erreurMembreActifZZ } = await admin
    .from('membres')
    .insert({ nom: `${PREFIXE_MEMBRE}-actif`, prenom: 'Test', etat: 'actif' })
    .select('id')
    .single()
  if (erreurMembreActifZZ || !membreActifZZ) {
    throw new Error(`création du membre actif impossible : ${erreurMembreActifZZ?.message}`)
  }
  idMembreActifZZ = membreActifZZ.id

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

  it("laisse un administrateur lire une demande qu'il n'a pas soumise", async () => {
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

describe('amendement de membres_lecture pour le demandeur (design 2b §5.5)', () => {
  it("laisse le demandeur lire la fiche en_attente qu'il a proposée", async () => {
    const { data, error } = await clientDemandeurA.from('membres').select('id').eq('id', idMembreA)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  it("interdit à un AUTRE compte ordinaire de lire cette même fiche en_attente", async () => {
    const { data, error } = await clientDemandeurB.from('membres').select('id').eq('id', idMembreA)
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  // CONTRÔLE POSITIF (M4) : sans lui, les zéro lignes ci-dessus pourraient venir
  // tout autant d'un compte B cassé ou déconnecté que de la politique elle-même.
  // On prouve que la session de B fonctionne bel et bien, sur l'annuaire actif.
  it("contrôle positif : la session de ce compte B lit par ailleurs l'annuaire actif", async () => {
    const { data, error } = await clientDemandeurB.from('membres').select('id').eq('id', idMembreActifZZ)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  it('laisse toujours un administrateur lire la fiche en_attente', async () => {
    const { data, error } = await clientAdminAuth.from('membres').select('id').eq('id', idMembreA)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  // I3(a) : éprouve la conjonction etat = 'en_attente' de la politique, séparément
  // de prive.est_demandeur_de. Sans elle, un demandeur lirait sa fiche dans
  // n'importe quel état — y compris archivée, alors que l'archivage doit rester
  // réservé à l'administrateur quel que soit le demandeur d'origine.
  it("interdit au demandeur de lire une fiche ARCHIVÉE que sa propre demande référence", async () => {
    const { data, error } = await clientDemandeurA.from('membres').select('id').eq('id', idMembreArchive)
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  // I3(b) : éprouve la corrélation d.membre_id = p_membre_id dans le corps de
  // prive.est_demandeur_de, séparément de la conjonction etat = 'en_attente' de la
  // politique. demandeurA A une demande (sur idMembreA) mais PAS sur idMembreOrphelin :
  // sans cette corrélation, avoir ne serait-ce qu'une demande suffirait à lire
  // n'importe quelle fiche en_attente.
  it("interdit au demandeur de lire une fiche en_attente qu'il n'a PAS proposée, même s'il a une demande par ailleurs", async () => {
    const { data, error } = await clientDemandeurA.from('membres').select('id').eq('id', idMembreOrphelin)
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  // CONTRÔLE POSITIF : ne prouve PAS qu'une politique qui refuserait TOUJOURS
  // l'accès à en_attente serait détectée — les tests ci-dessus, qui attendent
  // toHaveLength(1) pour le demandeur et pour l'administrateur, tomberaient déjà
  // les premiers dans ce cas. Ce contrôle prouve autre chose : que le drop+create
  // de cette migration n'a pas RÉTRÉCI la branche etat = 'actif' préexistante — le
  // demandeur lit toujours l'annuaire actif ordinaire, par ailleurs. Fiche propre à
  // cette suite (M3), pas une lecture arbitraire de la base partagée dev/prod.
  it("le demandeur continue de lire l'annuaire actif ordinaire par ailleurs", async () => {
    const { data, error } = await clientDemandeurA.from('membres').select('id').eq('id', idMembreActifZZ)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })
})

describe('annuler_demande_membre', () => {
  async function creerDemandeEtFiche(demandeurId: string) {
    const { data: fiche, error: erreurFiche } = await admin
      .from('membres')
      .insert({ nom: `${PREFIXE_MEMBRE}-annulation`, prenom: 'Test', etat: 'en_attente' })
      .select('id')
      .single()
    if (erreurFiche || !fiche) throw new Error(`création de la fiche impossible : ${erreurFiche?.message}`)

    const { data: demande, error: erreurDemande } = await admin
      .from('demandes_membre')
      .insert({ origine: 'demande_suivi', demandeur_profil_id: demandeurId, membre_id: fiche.id, etat: 'en_attente' })
      .select('id')
      .single()
    if (erreurDemande || !demande) throw new Error(`création de la demande impossible : ${erreurDemande?.message}`)

    return { ficheId: fiche.id as string, demandeId: demande.id as string }
  }

  it("annule sa propre demande : LES DEUX EFFETS constatés dans le MÊME test", async () => {
    const { ficheId, demandeId } = await creerDemandeEtFiche(idDemandeurA)

    const { error } = await admin.rpc('annuler_demande_membre', {
      p_demande: demandeId,
      p_demandeur: idDemandeurA,
    })
    expect(error).toBeNull()

    // Un test qui ne vérifierait que l'un des deux effets ne prouverait pas
    // l'atomicité, seulement qu'une moitié a eu lieu.
    const { data: demandeRelue } = await admin.from('demandes_membre').select('etat').eq('id', demandeId).single()
    expect(demandeRelue?.etat).toBe('annulee')

    const { data: ficheRelue } = await admin.from('membres').select('id').eq('id', ficheId)
    expect(ficheRelue).toHaveLength(0)
  })

  it("refuse d'annuler la demande d'AUTRUI, avec un marqueur stable", async () => {
    const { demandeId } = await creerDemandeEtFiche(idDemandeurA)

    const { error } = await admin.rpc('annuler_demande_membre', {
      p_demande: demandeId,
      p_demandeur: idDemandeurB,
    })
    expect(error).not.toBeNull()
    expect(error?.details).toBe('demande_non_annulable')

    // Rien n'a bougé : la demande reste en_attente.
    const { data } = await admin.from('demandes_membre').select('etat').eq('id', demandeId).single()
    expect(data?.etat).toBe('en_attente')
  })

  it("refuse d'annuler une demande déjà traitée", async () => {
    const { demandeId } = await creerDemandeEtFiche(idDemandeurA)
    await admin.from('demandes_membre').update({ etat: 'validee' }).eq('id', demandeId)

    const { error } = await admin.rpc('annuler_demande_membre', {
      p_demande: demandeId,
      p_demandeur: idDemandeurA,
    })
    expect(error).not.toBeNull()
    expect(error?.details).toBe('demande_non_annulable')
  })

  it('marque lues les notifications nouvelle_demande liées à cette demande (D41)', async () => {
    const { demandeId } = await creerDemandeEtFiche(idDemandeurA)
    const { data: notif, error: erreurNotif } = await admin
      .from('notifications')
      .insert({
        profil_id: idAdmin,
        type: 'nouvelle_demande',
        titre: 'Test',
        corps: 'Corps de test',
        lien: `/demandes/${demandeId}`,
      })
      .select('id')
      .single()
    if (erreurNotif || !notif) throw new Error(`création de la notification impossible : ${erreurNotif?.message}`)

    await admin.rpc('annuler_demande_membre', { p_demande: demandeId, p_demandeur: idDemandeurA })

    const { data: notifRelue } = await admin.from('notifications').select('lu_le').eq('id', notif.id).single()
    expect(notifRelue?.lu_le).not.toBeNull()
  })

  it('refuse son exécution à un compte authentifié ordinaire (42501)', async () => {
    const { error } = await clientDemandeurA.rpc('annuler_demande_membre', {
      p_demande: idDemandeA,
      p_demandeur: idDemandeurA,
    })
    expect(error).not.toBeNull()
    expect(error?.code).toBe('42501')
  })
})

describe('valider_demande_rattachement (D26)', () => {
  async function creerAutoInscription() {
    const { data: fiche, error: erreurFiche } = await admin
      .from('membres')
      .insert({ nom: `${PREFIXE_MEMBRE}-jetable`, prenom: 'Test', etat: 'en_attente' })
      .select('id')
      .single()
    if (erreurFiche || !fiche) throw new Error(`création de la fiche jetable impossible : ${erreurFiche?.message}`)

    const { data: demande, error: erreurDemande } = await admin
      .from('demandes_membre')
      .insert({ origine: 'auto_inscription', demandeur_profil_id: idDemandeurA, membre_id: fiche.id, etat: 'en_attente' })
      .select('id')
      .single()
    if (erreurDemande || !demande) throw new Error(`création de la demande impossible : ${erreurDemande?.message}`)

    return { ficheJetableId: fiche.id as string, demandeId: demande.id as string }
  }

  it('rattache le compte, repointe la demande, ET supprime réellement la fiche jetable', async () => {
    const { ficheJetableId, demandeId } = await creerAutoInscription()
    const { data: ficheExistante, error: erreurExistante } = await admin
      .from('membres')
      .insert({ nom: `${PREFIXE_MEMBRE}-existante`, prenom: 'Test' })
      .select('id')
      .single()
    if (erreurExistante || !ficheExistante) throw new Error(`création de la fiche existante impossible`)

    const { error } = await admin.rpc('valider_demande_rattachement', {
      p_demande: demandeId,
      p_membre_existant: ficheExistante.id,
      p_admin: idAdmin,
    })
    expect(error).toBeNull()

    const { data: demandeRelue } = await admin
      .from('demandes_membre')
      .select('etat, membre_id')
      .eq('id', demandeId)
      .single()
    expect(demandeRelue?.etat).toBe('validee')
    expect(demandeRelue?.membre_id).toBe(ficheExistante.id)

    const { data: profilRelu } = await admin.from('profils').select('membre_id').eq('id', idDemandeurA).single()
    expect(profilRelu?.membre_id).toBe(ficheExistante.id)

    // La fiche jetable a RÉELLEMENT disparu de la base — pas seulement « l'appel
    // n'a pas levé d'erreur » (design 2b §10).
    const { data: ficheJetableRelue } = await admin.from('membres').select('id').eq('id', ficheJetableId)
    expect(ficheJetableRelue).toHaveLength(0)

    // Rétablir profils.membre_id à NULL : les tests suivants du fichier ne
    // s'attendent pas à un demandeur déjà lié.
    await admin.from('profils').update({ membre_id: null }).eq('id', idDemandeurA)
  })

  it("refuse une demande d'origine demande_suivi (le rattachement n'est proposé que pour auto_inscription)", async () => {
    const { demandeId } = await (async () => {
      const { data: fiche } = await admin
        .from('membres')
        .insert({ nom: `${PREFIXE_MEMBRE}-suivi`, prenom: 'Test', etat: 'en_attente' })
        .select('id')
        .single()
      const { data: demande } = await admin
        .from('demandes_membre')
        .insert({ origine: 'demande_suivi', demandeur_profil_id: idDemandeurA, membre_id: fiche!.id, etat: 'en_attente' })
        .select('id')
        .single()
      return { demandeId: demande!.id as string }
    })()

    const { error } = await admin.rpc('valider_demande_rattachement', {
      p_demande: demandeId,
      p_membre_existant: idMembreA,
      p_admin: idAdmin,
    })
    expect(error).not.toBeNull()
    expect(error?.details).toBe('demande_non_validable')
  })

  it('refuse une fiche existante inconnue, avec un marqueur stable', async () => {
    const { demandeId } = await creerAutoInscription()
    const { error } = await admin.rpc('valider_demande_rattachement', {
      p_demande: demandeId,
      p_membre_existant: '00000000-0000-0000-0000-000000000000',
      p_admin: idAdmin,
    })
    expect(error).not.toBeNull()
    expect(error?.details).toBe('membre_inconnu')
  })

  it('refuse son exécution à un compte authentifié ordinaire (42501)', async () => {
    const { error } = await clientDemandeurA.rpc('valider_demande_rattachement', {
      p_demande: idDemandeA,
      p_membre_existant: idMembreA,
      p_admin: idAdmin,
    })
    expect(error).not.toBeNull()
    expect(error?.code).toBe('42501')
  })
})
