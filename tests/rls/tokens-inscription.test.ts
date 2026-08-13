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
  // I5 (constat de revue) : tentatives_token_inscription n'a AUCUNE purge
  // automatique (migration 20260815130000, design 2b §5.4/§13 : « croissance non
  // bornée, assumée »), et ce projet n'a qu'UNE seule base, partagée dev/prod,
  // JAMAIS réinitialisée (contrainte projet #1). Sans cette purge, chaque
  // lancement de cette suite dépose ~11 lignes définitives sur la plage
  // 198.51.100.2-.12 (adresseFraiche()) et .200 (ADRESSE_PLAFOND, qui se purge
  // déjà elle-même, mais en défense en profondeur seulement — un lancement
  // interrompu avant son propre nettoyage laisserait des résidus). À raison de
  // dix lancements en quinze minutes, 198.51.100.2 dépasserait le plafond de 10
  // tentatives, et le tout premier appel d'un futur lancement recevrait
  // 'trop_de_tentatives' au lieu du statut attendu.
  //
  // Cette plage est TEST-NET-2 (RFC 5737), réservée à la documentation : aucune
  // adresse réelle ne peut s'y trouver, la purge est donc sans risque pour des
  // données légitimes. `.like()` échoue sur une colonne inet via PostgREST
  // (`operator does not exist: inet ~~ unknown`, vérifié empiriquement) : la
  // plage est donc bornée par comparaison d'ordre, qu'inet supporte nativement.
  await admin
    .from('tentatives_token_inscription')
    .delete()
    .gte('adresse', '198.51.100.0')
    .lte('adresse', '198.51.100.255')

  // Nettoyage vérifié PAR COMPTAGE (contrainte projet #8), pas seulement par
  // l'absence d'erreur sur le DELETE ci-dessus.
  const { count: tentativesRestantes, error: erreurComptage } = await admin
    .from('tentatives_token_inscription')
    .select('id', { count: 'exact', head: true })
    .gte('adresse', '198.51.100.0')
    .lte('adresse', '198.51.100.255')
  expect(erreurComptage).toBeNull()
  expect(tentativesRestantes).toBe(0)

  // Purge des tokens de test créés par le bloc consommer_token_inscription
  // (préfixe test-consommation-), distincts du idToken créé ci-dessus.
  await admin.from('tokens_inscription').delete().like('code_hash', 'test-consommation-%')
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

describe("politique de tentatives_token_inscription : ZÉRO lecture accordée", () => {
  it('interdit la lecture à un administrateur authentifié', async () => {
    const { data, error } = await clientAdminAuth.from('tentatives_token_inscription').select('id')
    // À la différence de tokens_inscription et de ses tables sœurs, aucun
    // `grant select` n'est redonné à authenticated sur cette table (migration
    // 20260815130000) : le refus tombe au niveau du PRIVILÈGE Postgres (42501),
    // avant même que la RLS n'ait à filtrer quoi que ce soit — vérifié
    // empiriquement, pas seulement RLS activée + zéro politique.
    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')
    expect(data).toBeNull()
  })

  it('interdit la lecture à un compte ordinaire authentifié', async () => {
    const { data, error } = await clientSimple.from('tentatives_token_inscription').select('id')
    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')
    expect(data).toBeNull()
  })

  it('interdit la lecture au rôle anon', async () => {
    const { data, error } = await anon.from('tentatives_token_inscription').select('id')
    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')
    expect(data).toBeNull()
  })

  // CONTRÔLE POSITIF : sans lui, les trois refus ci-dessus seraient satisfaits par
  // une table qui n'existe pas, ou par une erreur de nom de colonne. On prouve que
  // service_role, LUI, atteint réellement la table.
  it('laisse la clé de service lire et écrire la table', async () => {
    const { data: inseree, error: erreurInsertion } = await admin
      .from('tentatives_token_inscription')
      .insert({ adresse: '203.0.113.9' })
      .select('id')
      .single()
    expect(erreurInsertion).toBeNull()
    expect(inseree?.id).toBeTruthy()

    const { data: lue, error: erreurLecture } = await admin
      .from('tentatives_token_inscription')
      .select('id')
      .eq('id', inseree!.id)
    expect(erreurLecture).toBeNull()
    expect(lue).toHaveLength(1)

    await admin.from('tentatives_token_inscription').delete().eq('id', inseree!.id)
  })
})

describe('consommer_token_inscription', () => {
  const ADRESSE_BASE = '198.51.100.'
  let compteurAdresse = 1

  function adresseFraiche(): string {
    // Une adresse différente par test évite qu'un test épuise par accident le
    // plafond d'un autre — le plafond de tentatives est testé À PART, plus bas,
    // avec une adresse dédiée.
    compteurAdresse += 1
    return `${ADRESSE_BASE}${compteurAdresse}`
  }

  async function creerTokenValide(mode: 'nominatif' | 'generique', membreId: string | null) {
    const code = `test-consommation-${crypto.randomUUID()}`
    const { data, error } = await admin
      .from('tokens_inscription')
      .insert({
        code_hash: code,
        mode,
        membre_id: membreId,
        cree_par: idAdmin,
        expire_le: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .select('id')
      .single()
    if (error || !data) throw new Error(`création du token de test impossible : ${error?.message}`)
    return { id: data.id as string, codeHash: code }
  }

  it('consomme un token valide : statut ok, token_id, mode et membre_id rendus', async () => {
    const { id, codeHash } = await creerTokenValide('nominatif', idMembre)
    const { data, error } = await admin.rpc('consommer_token_inscription', {
      p_code_hash: codeHash,
      p_adresse: adresseFraiche(),
    })
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data![0].statut).toBe('ok')
    // I1 (constat de revue) : sans cette assertion, une fonction qui rendrait
    // systématiquement `null::uuid` pour token_id (cf. migration l. 45/70) passerait
    // les dix tests de ce fichier sans qu'aucun ne s'en aperçoive — token_id est
    // pourtant ce dont la Task 14 a besoin pour poser utilise_par_profil_id ET pour
    // appeler relacher_token_inscription en cas d'échec de création du compte.
    expect(data![0].token_id).toBe(id)
    expect(data![0].mode).toBe('nominatif')
    expect(data![0].membre_id).toBe(idMembre)

    // État final en base, pas seulement l'absence d'erreur : utilise_le doit être
    // réellement posé. `relu` vérifié non nul AVANT d'inspecter son contenu : sans
    // ce garde, une relecture qui échouerait silencieusement (relu === undefined)
    // rendrait `relu?.utilise_le` égal à `undefined`, distinct de `null`, et
    // l'assertion `.not.toBeNull()` passerait quand même — un faux vert.
    const { data: relu, error: erreurLecture } = await admin
      .from('tokens_inscription')
      .select('utilise_le')
      .eq('code_hash', codeHash)
      .single()
    expect(erreurLecture).toBeNull()
    expect(relu).not.toBeNull()
    expect(relu!.utilise_le).not.toBeNull()
  })

  // DOUBLE CONSOMMATION SÉQUENTIELLE (PAS le verrou lui-même — constat de revue
  // I4). Le MÊME code, consommé deux fois DE SUITE : deux transactions séparées,
  // l'une COMMIT avant que l'autre ne démarre. Ce test établit que la consommation
  // est un événement unique, RÉELLEMENT ÉCRIT en base (mode/token_id rendus,
  // utilise_le posé), pas seulement qu'un second appel est refusé — mais il
  // resterait vert même SANS `select ... for update` : la première transaction a
  // déjà validé sa mise à jour avant que la seconde ne lise la ligne, donc rien
  // n'exige de verrou ici. La preuve du VERROU proprement dit — deux transactions
  // qui se CHEVAUCHENT — est le test suivant, avec `Promise.all`.
  // NOTER que la fonction NE LÈVE PLUS pour ce refus (voir l'en-tête de la Task 8
  // du plan) : `error` reste `null`, c'est `data[0].statut` qui porte le résultat.
  it('la seconde consommation SÉQUENTIELLE du même code rend le statut invalide, SANS erreur RPC', async () => {
    const { id, codeHash } = await creerTokenValide('generique', null)

    const premiere = await admin.rpc('consommer_token_inscription', {
      p_code_hash: codeHash,
      p_adresse: adresseFraiche(),
    })
    expect(premiere.error).toBeNull()
    expect(premiere.data![0].statut).toBe('ok')
    expect(premiere.data![0].token_id).toBe(id)
    expect(premiere.data![0].mode).toBe('generique')
    expect(premiere.data![0].membre_id).toBeNull()

    const seconde = await admin.rpc('consommer_token_inscription', {
      p_code_hash: codeHash,
      p_adresse: adresseFraiche(),
    })
    expect(seconde.error).toBeNull()
    expect(seconde.data![0].statut).toBe('invalide')
  })

  // PREUVE PAR VERROU (D31), CETTE FOIS RÉELLEMENT : deux appels RPC CONCURRENTS
  // (Promise.all, deux transactions qui SE CHEVAUCHENT dans le temps) sur le MÊME
  // code. Sans `select ... for update` à l'étape 3, les deux transactions
  // pourraient lire toutes deux utilise_le IS NULL avant que l'une n'ait posé sa
  // mise à jour, et rendre toutes deux 'ok' — double consommation d'un token qui
  // serait nominatif en production, donc deux comptes créés sur la même fiche
  // (D31). Avec le verrou, l'une des deux transactions attend que l'autre COMMIT
  // avant de lire la ligne, la voit alors déjà utilise_le renseigné, et rend
  // 'invalide' : exactement UN 'ok' et UN 'invalide' doivent sortir des deux appels.
  it('deux consommations CONCURRENTES du même code : exactement un ok et un invalide (verrou D31)', async () => {
    const { id, codeHash } = await creerTokenValide('generique', null)

    const [premier, second] = await Promise.all([
      admin.rpc('consommer_token_inscription', { p_code_hash: codeHash, p_adresse: adresseFraiche() }),
      admin.rpc('consommer_token_inscription', { p_code_hash: codeHash, p_adresse: adresseFraiche() }),
    ])
    expect(premier.error).toBeNull()
    expect(second.error).toBeNull()

    const statuts = [premier.data![0].statut, second.data![0].statut].sort()
    expect(statuts).toEqual(['invalide', 'ok'])

    // Le gagnant, quel qu'il soit, a bien consommé LE token créé pour ce test.
    const gagnant = premier.data![0].statut === 'ok' ? premier.data![0] : second.data![0]
    expect(gagnant.token_id).toBe(id)
  })

  it('un code inconnu rend le statut invalide, SANS erreur RPC', async () => {
    const { data, error } = await admin.rpc('consommer_token_inscription', {
      p_code_hash: `test-consommation-jamais-genere-${crypto.randomUUID()}`,
      p_adresse: adresseFraiche(),
    })
    expect(error).toBeNull()
    expect(data![0].statut).toBe('invalide')
  })

  it('un token expiré rend le statut invalide, SANS erreur RPC', async () => {
    const code = `test-consommation-${crypto.randomUUID()}`
    // I2 (constat de revue) : erreur d'insertion vérifiée, comme creerTokenValide
    // le fait déjà. Sans ce contrôle, un insert en échec laisserait le code
    // n'exister nulle part, et ce test éprouverait en réalité le chemin du code
    // INCONNU plutôt que celui du token EXPIRÉ — tout en restant vert, puisque les
    // deux rendent le même statut 'invalide'.
    const { error: erreurInsertion } = await admin.from('tokens_inscription').insert({
      code_hash: code,
      mode: 'generique',
      cree_par: idAdmin,
      expire_le: new Date(Date.now() - 1_000).toISOString(),
    })
    if (erreurInsertion) throw new Error(`création du token expiré de test impossible : ${erreurInsertion.message}`)
    const { data, error } = await admin.rpc('consommer_token_inscription', {
      p_code_hash: code,
      p_adresse: adresseFraiche(),
    })
    expect(error).toBeNull()
    expect(data![0].statut).toBe('invalide')
  })

  it('un token révoqué rend le statut invalide, SANS erreur RPC', async () => {
    const code = `test-consommation-${crypto.randomUUID()}`
    // I2 : même contrôle que ci-dessus, même raison — sinon ce test éprouverait le
    // chemin du code inconnu à la place de celui du token révoqué.
    const { error: erreurInsertion } = await admin.from('tokens_inscription').insert({
      code_hash: code,
      mode: 'generique',
      cree_par: idAdmin,
      expire_le: new Date(Date.now() + 86_400_000).toISOString(),
      revoque_le: new Date().toISOString(),
    })
    if (erreurInsertion) throw new Error(`création du token révoqué de test impossible : ${erreurInsertion.message}`)
    const { data, error } = await admin.rpc('consommer_token_inscription', {
      p_code_hash: code,
      p_adresse: adresseFraiche(),
    })
    expect(error).toBeNull()
    expect(data![0].statut).toBe('invalide')
  })

  // Les QUATRE cas ci-dessus (inconnu, déjà utilisé, expiré, révoqué) rendent
  // EXACTEMENT le même statut : c'est la preuve, à la couche SQL, de
  // l'indifférenciation exigée par D30 et le §6 du design. Regroupée ici plutôt
  // que dispersée, pour qu'un futur lecteur voie les quatre côte à côte.
  it('RÉCAPITULATIF : les quatre causes de refus rendent le même statut', async () => {
    const codeExpire = `test-consommation-${crypto.randomUUID()}`
    const codeRevoque = `test-consommation-${crypto.randomUUID()}`
    const codeUtilise = `test-consommation-${crypto.randomUUID()}`
    // I2 (constat de revue) : erreur d'insertion vérifiée. C'est ICI que l'oubli
    // était le plus grave — si les trois inserts échouaient silencieusement, les
    // trois codes (« expiré », « révoqué », « déjà utilisé ») n'existeraient nulle
    // part, et ce test comparerait EN RÉALITÉ quatre fois le même cas (code
    // inconnu) au lieu des quatre causes distinctes qu'il prétend recouper — son
    // propre commentaire ci-dessus serait alors un mensonge pur.
    const { error: erreurInsertion } = await admin.from('tokens_inscription').insert([
      { code_hash: codeExpire, mode: 'generique', cree_par: idAdmin, expire_le: new Date(Date.now() - 1_000).toISOString() },
      { code_hash: codeRevoque, mode: 'generique', cree_par: idAdmin, expire_le: new Date(Date.now() + 86_400_000).toISOString(), revoque_le: new Date().toISOString() },
      { code_hash: codeUtilise, mode: 'generique', cree_par: idAdmin, expire_le: new Date(Date.now() + 86_400_000).toISOString(), utilise_le: new Date().toISOString() },
    ])
    if (erreurInsertion) throw new Error(`création des tokens de test (récapitulatif) impossible : ${erreurInsertion.message}`)
    const codeInconnu = `test-consommation-jamais-${crypto.randomUUID()}`

    const resultats = await Promise.all(
      [codeInconnu, codeExpire, codeRevoque, codeUtilise].map((codeHash) =>
        admin.rpc('consommer_token_inscription', { p_code_hash: codeHash, p_adresse: adresseFraiche() }),
      ),
    )
    for (const resultat of resultats) {
      expect(resultat.error).toBeNull()
    }
    const statuts = resultats.map((r) => r.data?.[0]?.statut)
    expect(statuts).toEqual(['invalide', 'invalide', 'invalide', 'invalide'])
  })

  // LE DÉFAUT QUE CETTE FONCTION CORRIGE, PROUVÉ DIRECTEMENT : une tentative
  // REFUSÉE reste enregistrée en base. Une première rédaction de cette fonction
  // levait une exception sur ce refus, ce qui annulait l'insertion de la Task 8
  // Étape 1 avec le reste de la transaction — silencieusement, sans qu'aucun test
  // ne puisse l'établir tant que la fonction levait. Ce test est la preuve directe
  // que ce n'est plus le cas.
  it("une tentative REFUSÉE (statut invalide) reste enregistrée dans tentatives_token_inscription", async () => {
    const adresse = adresseFraiche()
    // Nettoyage préalable de cette adresse précise : tentatives_token_inscription
    // n'est JAMAIS purgée (migration 20260815130000, design 2b §5.4/§13), et ce
    // projet n'a qu'UNE seule base, partagée dev/prod, jamais réinitialisée
    // (contrainte projet #1) — adresseFraiche() rend la MÊME adresse à chaque
    // exécution de ce fichier (compteurAdresse repart de 1 à chaque lancement),
    // donc une exécution passée de cette suite peut avoir laissé une ligne ici.
    // Sans ce nettoyage, l'assertion `toHaveLength(1)` ci-dessous ne tiendrait que
    // lors du tout premier lancement jamais fait contre cette base — même
    // précaution que celle déjà prise plus bas pour ADRESSE_PLAFOND.
    await admin.from('tentatives_token_inscription').delete().eq('adresse', adresse)
    const { data, error } = await admin.rpc('consommer_token_inscription', {
      p_code_hash: `test-consommation-jamais-genere-${crypto.randomUUID()}`,
      p_adresse: adresse,
    })
    expect(error).toBeNull()
    expect(data![0].statut).toBe('invalide')

    const { data: tentatives } = await admin.from('tentatives_token_inscription').select('id').eq('adresse', adresse)
    expect(tentatives).toHaveLength(1)
  })

  it('refuse son exécution à un compte authentifié ordinaire (42501)', async () => {
    const { error } = await clientSimple.rpc('consommer_token_inscription', {
      p_code_hash: 'peu-importe',
      p_adresse: adresseFraiche(),
    })
    expect(error).not.toBeNull()
    expect(error?.code).toBe('42501')
  })

  it('refuse son exécution au rôle anon (42501)', async () => {
    const { error } = await anon.rpc('consommer_token_inscription', {
      p_code_hash: 'peu-importe',
      p_adresse: adresseFraiche(),
    })
    expect(error).not.toBeNull()
    expect(error?.code).toBe('42501')
  })

  describe('plafond de tentatives (D34, D36)', () => {
    const ADRESSE_PLAFOND = '198.51.100.200'

    // CETTE PREUVE EST DÉSORMAIS RÉELLE : avec la version qui levait une
    // exception, les 10 premières tentatives (toutes des refus « invalide »)
    // n'auraient JAMAIS été enregistrées dans tentatives_token_inscription — le
    // compteur de l'étape 2 de la fonction n'aurait donc jamais vu que des
    // ZÉROS, et la 11e tentative n'aurait jamais atteint le plafond. Ce test
    // aurait donc échoué net avec l'ancienne version, pour la bonne raison : il
    // ne pouvait pas passer par accident.
    // NUANCE (mineur, constat de revue) : ce test éprouve le plafond en séquence,
    // un appel après l'autre. Il ne prouve PAS que le plafond est étanche à la
    // concurrence : sous READ COMMITTED, le `select count(*)` de l'étape 2 ne voit
    // que les lignes déjà COMMIT au moment où l'instruction démarre — des appels
    // réellement concurrents sur la même adresse pourraient donc chacun sous-compter
    // les tentatives des autres et laisser passer légèrement plus de 10 avant que
    // le plafond ne se referme. C'est une limite acceptée (best-effort contre la
    // force brute, pas une garantie dure), pas un défaut à corriger ici — voir
    // aussi le commentaire de tête de public.consommer_token_inscription.
    it("laisse passer jusqu'à 10 tentatives incluses (statut invalide, SANS erreur), puis bascule sur trop_de_tentatives à la 11e", async () => {
      // Nettoyage de cette adresse précise, pour ne pas hériter de tentatives
      // d'une exécution précédente interrompue.
      await admin.from('tentatives_token_inscription').delete().eq('adresse', ADRESSE_PLAFOND)

      const statuts: Array<string | undefined> = []
      for (let i = 0; i < 11; i += 1) {
        const { data, error } = await admin.rpc('consommer_token_inscription', {
          p_code_hash: `code-plafond-inexistant-${i}`,
          p_adresse: ADRESSE_PLAFOND,
        })
        expect(error).toBeNull()
        statuts.push(data?.[0]?.statut)
      }

      // CONTRÔLE POSITIF : les 10 premières rendent invalide (code inexistant),
      // PAS trop_de_tentatives — la preuve que le plafond laisse réellement
      // passer en deçà du seuil, pas seulement qu'il refuse au-delà.
      expect(statuts.slice(0, 10)).toEqual(new Array(10).fill('invalide'))
      // La 11e, elle, bascule sur le plafond.
      expect(statuts[10]).toBe('trop_de_tentatives')

      // État final : exactement 11 lignes de tentative pour cette adresse, la
      // 11e comprise (D34 : TOUTE tentative compte, y compris celle qui est
      // elle-même refusée pour dépassement) — CE COMPTE EST LA PREUVE QUE LE
      // DÉFAUT EST CORRIGÉ : avec la version qui levait, il aurait valu 0.
      const { data: tentatives } = await admin
        .from('tentatives_token_inscription')
        .select('id')
        .eq('adresse', ADRESSE_PLAFOND)
      expect(tentatives).toHaveLength(11)

      await admin.from('tentatives_token_inscription').delete().eq('adresse', ADRESSE_PLAFOND)
    })
  })

  // I3 (constat de revue) : jusqu'ici, relacher_token_inscription n'avait AUCUN
  // test — ni de comportement, ni de droits d'exécution. Asymétrie injustifiée
  // avec consommer_token_inscription, qui a les deux. Corrigée ci-dessous.
  describe('relacher_token_inscription', () => {
    it("relâche un token consommé dont le compte n'a jamais été créé : utilise_le et utilise_par_profil_id repassent à NULL", async () => {
      const { id, codeHash } = await creerTokenValide('generique', null)
      const { data: consommation, error: erreurConsommation } = await admin.rpc('consommer_token_inscription', {
        p_code_hash: codeHash,
        p_adresse: adresseFraiche(),
      })
      expect(erreurConsommation).toBeNull()
      expect(consommation![0].statut).toBe('ok')
      // Cas visé par la fonction (design 2b §7.1) : consommé, mais le compte n'a
      // ensuite jamais été créé (Task 14 en échec) — utilise_par_profil_id reste
      // NULL puisque consommer_token_inscription ne le pose jamais elle-même (D27).
      const { data: avant } = await admin
        .from('tokens_inscription')
        .select('utilise_le, utilise_par_profil_id')
        .eq('id', id)
        .single()
      expect(avant?.utilise_le).not.toBeNull()
      expect(avant?.utilise_par_profil_id).toBeNull()

      const { data: relachee, error: erreurRelache } = await admin.rpc('relacher_token_inscription', {
        p_token_id: id,
        p_profil_id: null,
      })
      expect(erreurRelache).toBeNull()
      // La fonction REND son effet depuis la migration 20260815270000 : `true`
      // signifie qu'une ligne a bien été relâchée. Avant elle, `returns void` ne
      // distinguait pas ce succès d'une relâche entièrement sans effet.
      expect(relachee).toBe(true)

      const { data: apres, error: erreurLecture } = await admin
        .from('tokens_inscription')
        .select('utilise_le, utilise_par_profil_id')
        .eq('id', id)
        .single()
      expect(erreurLecture).toBeNull()
      expect(apres).not.toBeNull()
      expect(apres!.utilise_le).toBeNull()
      expect(apres!.utilise_par_profil_id).toBeNull()
    })

    // LA GARDE, PROUVÉE DIRECTEMENT (I3) : un token déjà rattaché à un compte RÉEL
    // (utilise_par_profil_id renseigné, comme après une création de compte réussie
    // — Task 14) ne doit JAMAIS être dé-consommé par un appel qui ne nomme PAS ce
    // compte. Avant la migration 20260815180000, l'UPDATE d'origine n'avait AUCUNE
    // condition sur utilise_par_profil_id : ce même appel aurait remis utilise_le
    // à NULL et rendu ce token de nouveau utilisable, alors qu'il a réellement
    // servi.
    //
    // DEUX APPELS, PAS UN (I1 de la revue finale) : `p_profil_id` NULL (« aucun
    // compte à excuser ») ET `p_profil_id` d'un AUTRE compte. Le second est celui
    // qui compte : la garde de 20260815270000 n'est plus absolue, elle est
    // DISCRIMINANTE — il fallait donc prouver qu'elle discrimine bien, et ne se
    // contente pas d'accepter tout `p_profil_id` non nul.
    it("refuse de relâcher un token rattaché à un AUTRE compte, que p_profil_id soit NULL ou celui d'un tiers", async () => {
      const { id } = await creerTokenValide('generique', null)
      // Simule une consommation suivie d'une création de compte RÉUSSIE (Task 14) :
      // utilise_le ET utilise_par_profil_id sont tous deux renseignés.
      const utiliseLeOrigine = new Date().toISOString()
      const { error: erreurPreparation } = await admin
        .from('tokens_inscription')
        .update({ utilise_le: utiliseLeOrigine, utilise_par_profil_id: idAdmin })
        .eq('id', id)
      if (erreurPreparation) throw new Error(`préparation du token rattaché impossible : ${erreurPreparation.message}`)

      for (const [cas, profil] of [
        ['aucun compte à excuser (NULL)', null],
        ["le compte d'un tiers", idSimple],
      ] as const) {
        const { data: relachee, error: erreurRelache } = await admin.rpc('relacher_token_inscription', {
          p_token_id: id,
          p_profil_id: profil,
        })
        expect(erreurRelache, cas).toBeNull()
        // AUCUNE ligne touchée, et la fonction le DIT — c'est précisément ce que
        // `returns void` taisait.
        expect(relachee, cas).toBe(false)

        const { data: apres, error: erreurLecture } = await admin
          .from('tokens_inscription')
          .select('utilise_le, utilise_par_profil_id')
          .eq('id', id)
          .single()
        expect(erreurLecture, cas).toBeNull()
        expect(apres, cas).not.toBeNull()
        // La garde a bloqué l'UPDATE : les deux colonnes restent renseignées, à
        // l'identique de ce qui a été posé ci-dessus.
        expect(apres!.utilise_par_profil_id, cas).toBe(idAdmin)
        expect(new Date(apres!.utilise_le as string).toISOString(), cas).toBe(utiliseLeOrigine)
      }
    })

    // ═══ I1 DE LA REVUE FINALE DE BRANCHE, PROUVÉ ICI ═══
    //
    // LE CAS EXACT : `compenserInscription` (src/app/inscription/actions.ts) tente
    // de supprimer la fiche, PUIS le compte, PUIS de relâcher le token. Si
    // `deleteUser` échoue — limitation connue et documentée de ce projet —, LE
    // COMPTE SURVIT, donc `profils` survit, donc la cascade `on delete set null`
    // ne joue PAS et `tokens_inscription.utilise_par_profil_id` reste renseignée.
    //
    // Avec la garde absolue de 20260815180000, la relâche ne touchait alors AUCUNE
    // ligne, et `returns void` ne le disait pas : le token était perdu à jamais
    // pour son destinataire, sans erreur et sans trace. Le test ci-dessus (« refuse
    // de relâcher ») décrit exactement ce blocage — ce qui suit prouve qu'il ne
    // s'applique plus au compte que l'on est précisément en train de compenser.
    //
    // L'ASSERTION DÉCISIVE N'EST PAS « les colonnes sont à NULL » mais « le token
    // se CONSOMME de nouveau » : c'est la seule qui constate ce qui importe
    // réellement à la personne à qui le code avait été remis. Deux colonnes remises
    // à NULL par une écriture qui aurait cassé autre chose (revoque_le posé,
    // expiration touchée) laisseraient le token tout aussi inutilisable.
    it('un compte qui a SURVÉCU à sa suppression (deleteUser en échec) : nommer ce compte relâche le token, qui redevient CONSOMMABLE', async () => {
      const { id, codeHash } = await creerTokenValide('generique', null)

      const { data: premiere, error: erreurPremiere } = await admin.rpc('consommer_token_inscription', {
        p_code_hash: codeHash,
        p_adresse: adresseFraiche(),
      })
      expect(erreurPremiere).toBeNull()
      expect(premiere![0].statut).toBe('ok')
      expect(premiere![0].token_id).toBe(id)

      // Reproduit à l'identique ce que fait `sInscrire` juste après avoir créé le
      // compte : le marquage `utilise_par_profil_id`. `idSimple` est un compte RÉEL
      // de cette suite, et il RESTERA en vie jusqu'à l'`afterAll` — c'est
      // exactement l'état laissé par un `deleteUser` en échec.
      const { error: erreurMarquage } = await admin
        .from('tokens_inscription')
        .update({ utilise_par_profil_id: idSimple })
        .eq('id', id)
      if (erreurMarquage) throw new Error(`marquage du token impossible : ${erreurMarquage.message}`)

      // CONTRÔLE : le compte est bien toujours là. Sans lui, la relâche pourrait
      // réussir par la cascade `on delete set null` — c'est-à-dire pour la MÊME
      // mauvaise raison que la preuve par injection de faute de la Task 14, qui
      // était passée parce que `deleteUser` avait réussi ce jour-là.
      const { data: compteSurvivant } = await admin.from('profils').select('id').eq('id', idSimple).maybeSingle()
      expect(
        compteSurvivant?.id,
        "le compte doit AVOIR SURVÉCU pour que ce test prouve ce qu'il annonce",
      ).toBe(idSimple)

      const { data: relachee, error: erreurRelache } = await admin.rpc('relacher_token_inscription', {
        p_token_id: id,
        p_profil_id: idSimple,
      })
      expect(erreurRelache).toBeNull()
      expect(relachee).toBe(true)

      const { data: apres } = await admin
        .from('tokens_inscription')
        .select('utilise_le, utilise_par_profil_id')
        .eq('id', id)
        .single()
      expect(apres!.utilise_le).toBeNull()
      expect(apres!.utilise_par_profil_id).toBeNull()

      // LE POINT DU TEST : le token REDEVIENT UTILISABLE pour son destinataire.
      const { data: seconde, error: erreurSeconde } = await admin.rpc('consommer_token_inscription', {
        p_code_hash: codeHash,
        p_adresse: adresseFraiche(),
      })
      expect(erreurSeconde).toBeNull()
      expect(seconde![0].statut, 'le token relâché doit se consommer de nouveau').toBe('ok')
      expect(seconde![0].token_id).toBe(id)
    })

    it('refuse son exécution à un compte authentifié ordinaire (42501)', async () => {
      const { error } = await clientSimple.rpc('relacher_token_inscription', {
        p_token_id: crypto.randomUUID(),
        p_profil_id: null,
      })
      expect(error).not.toBeNull()
      expect(error?.code).toBe('42501')
    })

    it('refuse son exécution au rôle anon (42501)', async () => {
      const { error } = await anon.rpc('relacher_token_inscription', {
        p_token_id: crypto.randomUUID(),
        p_profil_id: null,
      })
      expect(error).not.toBeNull()
      expect(error?.code).toBe('42501')
    })
  })
})
