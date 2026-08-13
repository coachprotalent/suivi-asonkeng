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
    const { data: demandeRelue } = await admin.from('demandes_membre').select('etat, membre_id').eq('id', demandeId).single()
    expect(demandeRelue?.etat).toBe('annulee')
    // Mineur (revue) : le commentaire de la migration promet que membre_id passe
    // à NULL (on delete set null, la fiche venant d'être supprimée) — jamais
    // assere jusqu'ici.
    expect(demandeRelue?.membre_id).toBeNull()

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
    const { demandeId, ficheId } = await creerDemandeEtFiche(idDemandeurA)
    const { error: erreurPreparation } = await admin.from('demandes_membre').update({ etat: 'validee' }).eq('id', demandeId)
    if (erreurPreparation) throw new Error(`préparation (passage à validee) impossible : ${erreurPreparation.message}`)

    const { error } = await admin.rpc('annuler_demande_membre', {
      p_demande: demandeId,
      p_demandeur: idDemandeurA,
    })
    expect(error).not.toBeNull()
    expect(error?.details).toBe('demande_non_annulable')

    // Contrôle complet (I3, revue) : ni l'état (déjà validee, PAS en_attente —
    // c'est l'état préparé ci-dessus) ni la survie de la fiche ne doivent avoir
    // bougé — pas seulement l'un des deux.
    const { data } = await admin.from('demandes_membre').select('etat').eq('id', demandeId).single()
    expect(data?.etat).toBe('validee')
    const { data: ficheEncore } = await admin.from('membres').select('id').eq('id', ficheId)
    expect(ficheEncore).toHaveLength(1)
  })

  // I2 (revue) : le DELETE sur membres doit être gardé par etat = 'en_attente'.
  // Aucun des deux helpers existants (creerDemandeEtFiche, creerAutoInscription)
  // ne peut éprouver ce défaut : ils créent toujours une fiche en_attente. Il faut
  // donc sortir du helper et construire explicitement une demande en_attente qui
  // référence une fiche dans un AUTRE état, exactement comme le beforeAll du
  // fichier le fait déjà pour idMembreArchive.
  it("NE SUPPRIME PAS une fiche référencée qui n'est plus en_attente (I2, revue)", async () => {
    const { data: ficheArchivee, error: erreurFiche } = await admin
      .from('membres')
      .insert({ nom: `${PREFIXE_MEMBRE}-garde-annulation`, prenom: 'Test', etat: 'archive' })
      .select('id')
      .single()
    if (erreurFiche || !ficheArchivee) throw new Error(`création de la fiche archivée impossible : ${erreurFiche?.message}`)

    const { data: demande, error: erreurDemande } = await admin
      .from('demandes_membre')
      .insert({
        origine: 'demande_suivi',
        demandeur_profil_id: idDemandeurA,
        membre_id: ficheArchivee.id,
        etat: 'en_attente',
      })
      .select('id')
      .single()
    if (erreurDemande || !demande) throw new Error(`création de la demande impossible : ${erreurDemande?.message}`)

    const { error } = await admin.rpc('annuler_demande_membre', {
      p_demande: demande.id,
      p_demandeur: idDemandeurA,
    })
    expect(error).toBeNull()

    // La demande est bien annulée...
    const { data: demandeRelue } = await admin.from('demandes_membre').select('etat').eq('id', demande.id).single()
    expect(demandeRelue?.etat).toBe('annulee')

    // ...mais la fiche ARCHIVÉE, elle, survit : ce n'était pas la fiche jetable
    // en_attente que D42 vise.
    const { data: ficheEncore } = await admin.from('membres').select('id, etat').eq('id', ficheArchivee.id)
    expect(ficheEncore).toHaveLength(1)
    expect(ficheEncore?.[0]?.etat).toBe('archive')
  })

  it('marque lues les notifications nouvelle_demande de CETTE demande (D41), et PAS celles d\'une AUTRE demande distincte (sélectivité, I4b/revue)', async () => {
    // Preuve de SÉLECTIVITÉ demandée explicitement par la revue (même piège que
    // I3, sous un autre visage) : deux demandes DISTINCTES, chacune sa propre
    // notification nouvelle_demande corrélée par demande_id. Une seule
    // notification en base ne distinguerait pas « le filtre agit » de « il n'y
    // avait rien d'autre à filtrer ».
    const { demandeId } = await creerDemandeEtFiche(idDemandeurA)
    const { demandeId: autreDemandeId } = await creerDemandeEtFiche(idDemandeurB)

    const { data: notif, error: erreurNotif } = await admin
      .from('notifications')
      .insert({
        profil_id: idAdmin,
        type: 'nouvelle_demande',
        titre: 'Test',
        corps: 'Corps de test',
        lien: '/demandes',
        demande_id: demandeId,
      })
      .select('id')
      .single()
    if (erreurNotif || !notif) throw new Error(`création de la notification impossible : ${erreurNotif?.message}`)

    const { data: notifAutreDemande, error: erreurNotifAutre } = await admin
      .from('notifications')
      .insert({
        profil_id: idAdmin,
        type: 'nouvelle_demande',
        titre: 'Autre demande',
        corps: 'Ne doit pas être touchée',
        lien: '/demandes',
        demande_id: autreDemandeId,
      })
      .select('id')
      .single()
    if (erreurNotifAutre || !notifAutreDemande) {
      throw new Error(`création de la notification de l'autre demande impossible : ${erreurNotifAutre?.message}`)
    }

    await admin.rpc('annuler_demande_membre', { p_demande: demandeId, p_demandeur: idDemandeurA })

    const { data: notifRelue } = await admin.from('notifications').select('lu_le').eq('id', notif.id).single()
    expect(notifRelue?.lu_le).not.toBeNull()

    // SÉLECTIVITÉ : la notification de l'AUTRE demande reste non lue, malgré le
    // même lien de navigation ('/demandes') sur les deux — seul demande_id les
    // distingue désormais.
    const { data: notifAutreDemandeRelue } = await admin
      .from('notifications')
      .select('lu_le')
      .eq('id', notifAutreDemande.id)
      .single()
    expect(notifAutreDemandeRelue?.lu_le).toBeNull()
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

  it('rattache le compte, repointe la demande, ET supprime réellement la fiche jetable — la notification va au BON destinataire (I1, revue)', async () => {
    const { ficheJetableId, demandeId } = await creerAutoInscription()
    const { data: ficheExistante, error: erreurExistante } = await admin
      .from('membres')
      .insert({ nom: `${PREFIXE_MEMBRE}-existante`, prenom: 'Test' })
      .select('id')
      .single()
    if (erreurExistante || !ficheExistante) throw new Error(`création de la fiche existante impossible : ${erreurExistante?.message}`)

    try {
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

      // I1 (revue) : la notification demande_validee va au DEMANDEUR, jamais à
      // l'administrateur qui valide — notifications n'étant lisible que par son
      // propre destinataire, un mauvais destinataire serait resté silencieux et
      // invisible à l'écran. Contrôle positif ET négatif dans le MÊME test :
      // après une transaction RÉUSSIE (pas avortée, où un comptage à zéro ne
      // prouverait rien pour personne).
      const { data: notifDemandeur } = await admin
        .from('notifications')
        .select('id')
        .eq('profil_id', idDemandeurA)
        .eq('type', 'demande_validee')
      expect(notifDemandeur).toHaveLength(1)

      const { data: notifAdmin } = await admin
        .from('notifications')
        .select('id')
        .eq('profil_id', idAdmin)
        .eq('type', 'demande_validee')
      expect(notifAdmin).toHaveLength(0)
    } finally {
      // Rétablir profils.membre_id à NULL : les tests suivants du fichier ne
      // s'attendent pas à un demandeur déjà lié. Dans un `finally` (I1/revue) :
      // sans lui, une assertion qui tombe AU-DESSUS laisserait le rattachement
      // en place pour les tests suivants du fichier.
      await admin.from('profils').update({ membre_id: null }).eq('id', idDemandeurA)
    }
  })

  it("marque lues les notifications nouvelle_demande de CETTE demande (I4a, symétrie D41), et PAS celles d'une AUTRE demande distincte (sélectivité, I4b/revue)", async () => {
    // Même preuve de sélectivité que sur annuler_demande_membre : DEUX demandes
    // distinctes, chacune sa notification nouvelle_demande corrélée par
    // demande_id. Traiter la première ne doit PAS toucher celle de la seconde.
    const { demandeId } = await creerAutoInscription()
    const { demandeId: autreDemandeId } = await creerAutoInscription()
    const { data: ficheExistante, error: erreurExistante } = await admin
      .from('membres')
      .insert({ nom: `${PREFIXE_MEMBRE}-existante-i4a`, prenom: 'Test' })
      .select('id')
      .single()
    if (erreurExistante || !ficheExistante) throw new Error(`création de la fiche existante impossible : ${erreurExistante?.message}`)

    const { data: notif, error: erreurNotif } = await admin
      .from('notifications')
      .insert({
        profil_id: idAdmin,
        type: 'nouvelle_demande',
        titre: 'Test',
        corps: 'Corps de test',
        lien: '/demandes',
        demande_id: demandeId,
      })
      .select('id')
      .single()
    if (erreurNotif || !notif) throw new Error(`création de la notification impossible : ${erreurNotif?.message}`)

    const { data: notifAutreDemande, error: erreurNotifAutre } = await admin
      .from('notifications')
      .insert({
        profil_id: idAdmin,
        type: 'nouvelle_demande',
        titre: 'Autre demande',
        corps: 'Ne doit pas être touchée',
        lien: '/demandes',
        demande_id: autreDemandeId,
      })
      .select('id')
      .single()
    if (erreurNotifAutre || !notifAutreDemande) {
      throw new Error(`création de la notification de l'autre demande impossible : ${erreurNotifAutre?.message}`)
    }

    try {
      const { error } = await admin.rpc('valider_demande_rattachement', {
        p_demande: demandeId,
        p_membre_existant: ficheExistante.id,
        p_admin: idAdmin,
      })
      expect(error).toBeNull()

      const { data: notifRelue } = await admin.from('notifications').select('lu_le').eq('id', notif.id).single()
      expect(notifRelue?.lu_le).not.toBeNull()

      // SÉLECTIVITÉ : la notification de l'AUTRE demande reste non lue.
      const { data: notifAutreDemandeRelue } = await admin
        .from('notifications')
        .select('lu_le')
        .eq('id', notifAutreDemande.id)
        .single()
      expect(notifAutreDemandeRelue?.lu_le).toBeNull()
    } finally {
      await admin.from('profils').update({ membre_id: null }).eq('id', idDemandeurA)
    }
  })

  it("refuse une demande d'origine demande_suivi (le rattachement n'est proposé que pour auto_inscription)", async () => {
    const { data: fiche, error: erreurFiche } = await admin
      .from('membres')
      .insert({ nom: `${PREFIXE_MEMBRE}-suivi`, prenom: 'Test', etat: 'en_attente' })
      .select('id')
      .single()
    if (erreurFiche || !fiche) throw new Error(`création de la fiche impossible : ${erreurFiche?.message}`)
    const { data: demande, error: erreurDemande } = await admin
      .from('demandes_membre')
      .insert({ origine: 'demande_suivi', demandeur_profil_id: idDemandeurA, membre_id: fiche.id, etat: 'en_attente' })
      .select('id')
      .single()
    if (erreurDemande || !demande) throw new Error(`création de la demande impossible : ${erreurDemande?.message}`)

    const { error } = await admin.rpc('valider_demande_rattachement', {
      p_demande: demande.id,
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

  // Mineur (revue) : idempotence de la validation, jamais éprouvée jusqu'ici —
  // rien ne tombait si la conjonction `and d.etat = 'en_attente'` du SELECT
  // disparaissait. Valider une demande déjà validée doit refuser une SECONDE
  // fois, avec le même marqueur que les autres refus (une seule branche,
  // I2/design : validee, rejetee et annulee sont indiscernables ici).
  it('refuse de valider une seconde fois une demande déjà validee (idempotence, revue)', async () => {
    const { demandeId } = await creerAutoInscription()
    const { data: ficheExistante, error: erreurExistante } = await admin
      .from('membres')
      .insert({ nom: `${PREFIXE_MEMBRE}-existante-idempotence`, prenom: 'Test' })
      .select('id')
      .single()
    if (erreurExistante || !ficheExistante) throw new Error(`création de la fiche existante impossible : ${erreurExistante?.message}`)

    try {
      const { error: erreurPremiere } = await admin.rpc('valider_demande_rattachement', {
        p_demande: demandeId,
        p_membre_existant: ficheExistante.id,
        p_admin: idAdmin,
      })
      expect(erreurPremiere).toBeNull()

      const { error: erreurSeconde } = await admin.rpc('valider_demande_rattachement', {
        p_demande: demandeId,
        p_membre_existant: ficheExistante.id,
        p_admin: idAdmin,
      })
      expect(erreurSeconde).not.toBeNull()
      expect(erreurSeconde?.details).toBe('demande_non_validable')
    } finally {
      await admin.from('profils').update({ membre_id: null }).eq('id', idDemandeurA)
    }
  })

  // I5 (revue) : rien n'empêchait de rattacher une demande à SA PROPRE fiche
  // jetable — les deux clés étrangères étant on delete set null, la fonction
  // « réussissait » en supprimant la seule fiche visée, laissant le demandeur
  // rattaché à rien, silencieusement.
  it('refuse de rattacher une demande à sa propre fiche jetable (I5, revue), avec un marqueur stable', async () => {
    const { ficheJetableId, demandeId } = await creerAutoInscription()

    const { error } = await admin.rpc('valider_demande_rattachement', {
      p_demande: demandeId,
      p_membre_existant: ficheJetableId,
      p_admin: idAdmin,
    })
    expect(error).not.toBeNull()
    expect(error?.details).toBe('rattachement_vers_fiche_jetable')

    // Rien n'a bougé : la demande reste en_attente et la fiche jetable existe
    // toujours.
    const { data: demandeRelue } = await admin.from('demandes_membre').select('etat').eq('id', demandeId).single()
    expect(demandeRelue?.etat).toBe('en_attente')
    const { data: ficheEncore } = await admin.from('membres').select('id').eq('id', ficheJetableId)
    expect(ficheEncore).toHaveLength(1)
  })

  // I2 (revue) : même défaut, même garde, que sur annuler_demande_membre — le
  // DELETE sur membres doit être gardé par etat = 'en_attente'. Il faut sortir
  // du helper creerAutoInscription (qui crée toujours une fiche en_attente) pour
  // l'éprouver : ici, la fiche « jetable » référencée par la demande est en
  // réalité déjà archivée au moment de la validation.
  it("NE SUPPRIME PAS la fiche jetable si elle n'est plus en_attente (I2, revue)", async () => {
    const { data: ficheArchivee, error: erreurFicheArchivee } = await admin
      .from('membres')
      .insert({ nom: `${PREFIXE_MEMBRE}-garde-validation`, prenom: 'Test', etat: 'archive' })
      .select('id')
      .single()
    if (erreurFicheArchivee || !ficheArchivee) {
      throw new Error(`création de la fiche archivée impossible : ${erreurFicheArchivee?.message}`)
    }
    const { data: demande, error: erreurDemande } = await admin
      .from('demandes_membre')
      .insert({
        origine: 'auto_inscription',
        demandeur_profil_id: idDemandeurA,
        membre_id: ficheArchivee.id,
        etat: 'en_attente',
      })
      .select('id')
      .single()
    if (erreurDemande || !demande) throw new Error(`création de la demande impossible : ${erreurDemande?.message}`)

    const { data: ficheExistante, error: erreurExistante } = await admin
      .from('membres')
      .insert({ nom: `${PREFIXE_MEMBRE}-existante-i2`, prenom: 'Test' })
      .select('id')
      .single()
    if (erreurExistante || !ficheExistante) throw new Error(`création de la fiche existante impossible : ${erreurExistante?.message}`)

    try {
      const { error } = await admin.rpc('valider_demande_rattachement', {
        p_demande: demande.id,
        p_membre_existant: ficheExistante.id,
        p_admin: idAdmin,
      })
      expect(error).toBeNull()

      const { data: demandeRelue } = await admin.from('demandes_membre').select('etat').eq('id', demande.id).single()
      expect(demandeRelue?.etat).toBe('validee')

      // La fiche ARCHIVÉE survit : ce n'était plus la fiche jetable en_attente
      // que la fonction est censée nettoyer.
      const { data: ficheEncore } = await admin.from('membres').select('id, etat').eq('id', ficheArchivee.id)
      expect(ficheEncore).toHaveLength(1)
      expect(ficheEncore?.[0]?.etat).toBe('archive')
    } finally {
      await admin.from('profils').update({ membre_id: null }).eq('id', idDemandeurA)
    }
  })

  // I6 (revue) : profils.membre_id est UNIQUE (migration 20260811120000). Un
  // rattachement en doublon (fiche déjà rattachée à un AUTRE compte) levait donc
  // un 23505 nu ; désormais attrapé et rendu avec un marqueur homogène.
  it('refuse un rattachement en doublon (fiche déjà rattachée à un AUTRE compte), avec un marqueur stable (I6, revue)', async () => {
    const { demandeId: demandeAId } = await creerAutoInscription()
    const { data: ficheCible, error: erreurCible } = await admin
      .from('membres')
      .insert({ nom: `${PREFIXE_MEMBRE}-cible-doublon`, prenom: 'Test' })
      .select('id')
      .single()
    if (erreurCible || !ficheCible) throw new Error(`création de la fiche cible impossible : ${erreurCible?.message}`)

    try {
      // Premier rattachement (demandeurA → ficheCible) : réussit.
      const { error: erreurA } = await admin.rpc('valider_demande_rattachement', {
        p_demande: demandeAId,
        p_membre_existant: ficheCible.id,
        p_admin: idAdmin,
      })
      expect(erreurA).toBeNull()

      // Second rattachement (demandeurB → LA MÊME ficheCible) : refusé.
      const { data: ficheJetableB, error: erreurFicheB } = await admin
        .from('membres')
        .insert({ nom: `${PREFIXE_MEMBRE}-jetable-doublon`, prenom: 'Test', etat: 'en_attente' })
        .select('id')
        .single()
      if (erreurFicheB || !ficheJetableB) throw new Error(`création de la fiche jetable B impossible : ${erreurFicheB?.message}`)
      const { data: demandeB, error: erreurDemandeB } = await admin
        .from('demandes_membre')
        .insert({
          origine: 'auto_inscription',
          demandeur_profil_id: idDemandeurB,
          membre_id: ficheJetableB.id,
          etat: 'en_attente',
        })
        .select('id')
        .single()
      if (erreurDemandeB || !demandeB) throw new Error(`création de la demande B impossible : ${erreurDemandeB?.message}`)

      const { error: erreurB } = await admin.rpc('valider_demande_rattachement', {
        p_demande: demandeB.id,
        p_membre_existant: ficheCible.id,
        p_admin: idAdmin,
      })
      expect(erreurB).not.toBeNull()
      expect(erreurB?.details).toBe('membre_deja_rattache')

      // Rien n'a bougé côté B : la demande B reste en_attente, sa fiche jetable
      // survit, et profils.membre_id de B reste NULL — l'échec du rattrapage a
      // bien annulé la TRANSACTION ENTIÈRE de ce second appel, pas seulement
      // l'UPDATE profils qui a levé.
      const { data: demandeBRelue } = await admin.from('demandes_membre').select('etat').eq('id', demandeB.id).single()
      expect(demandeBRelue?.etat).toBe('en_attente')
      const { data: ficheJetableBEncore } = await admin.from('membres').select('id').eq('id', ficheJetableB.id)
      expect(ficheJetableBEncore).toHaveLength(1)
      const { data: profilBRelu } = await admin.from('profils').select('membre_id').eq('id', idDemandeurB).single()
      expect(profilBRelu?.membre_id).toBeNull()
    } finally {
      await admin.from('profils').update({ membre_id: null }).eq('id', idDemandeurA)
      await admin.from('profils').update({ membre_id: null }).eq('id', idDemandeurB)
    }
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
