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

  it('consomme un token valide : statut ok, mode et membre_id rendus', async () => {
    const { codeHash } = await creerTokenValide('nominatif', idMembre)
    const { data, error } = await admin.rpc('consommer_token_inscription', {
      p_code_hash: codeHash,
      p_adresse: adresseFraiche(),
    })
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data![0].statut).toBe('ok')
    expect(data![0].mode).toBe('nominatif')
    expect(data![0].membre_id).toBe(idMembre)

    // État final en base, pas seulement l'absence d'erreur : utilise_le doit être
    // réellement posé.
    const { data: relu } = await admin
      .from('tokens_inscription')
      .select('utilise_le')
      .eq('code_hash', codeHash)
      .single()
    expect(relu?.utilise_le).not.toBeNull()
  })

  // PREUVE PAR VERROU (D31) : le MÊME code, consommé deux fois de suite dans le
  // même test. La seconde doit rendre le statut invalide — preuve d'une écriture
  // réelle et unique en base (utilise_le posé une fois), pas seulement d'un refus.
  // NOTER que la fonction NE LÈVE PLUS pour ce refus (voir l'en-tête de la Task 8
  // du plan) : `error` reste `null`, c'est `data[0].statut` qui porte le résultat.
  it('la seconde consommation du même code rend le statut invalide, SANS erreur RPC', async () => {
    const { codeHash } = await creerTokenValide('generique', null)

    const premiere = await admin.rpc('consommer_token_inscription', {
      p_code_hash: codeHash,
      p_adresse: adresseFraiche(),
    })
    expect(premiere.error).toBeNull()
    expect(premiere.data![0].statut).toBe('ok')

    const seconde = await admin.rpc('consommer_token_inscription', {
      p_code_hash: codeHash,
      p_adresse: adresseFraiche(),
    })
    expect(seconde.error).toBeNull()
    expect(seconde.data![0].statut).toBe('invalide')
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
    await admin.from('tokens_inscription').insert({
      code_hash: code,
      mode: 'generique',
      cree_par: idAdmin,
      expire_le: new Date(Date.now() - 1_000).toISOString(),
    })
    const { data, error } = await admin.rpc('consommer_token_inscription', {
      p_code_hash: code,
      p_adresse: adresseFraiche(),
    })
    expect(error).toBeNull()
    expect(data![0].statut).toBe('invalide')
  })

  it('un token révoqué rend le statut invalide, SANS erreur RPC', async () => {
    const code = `test-consommation-${crypto.randomUUID()}`
    await admin.from('tokens_inscription').insert({
      code_hash: code,
      mode: 'generique',
      cree_par: idAdmin,
      expire_le: new Date(Date.now() + 86_400_000).toISOString(),
      revoque_le: new Date().toISOString(),
    })
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
    await admin.from('tokens_inscription').insert([
      { code_hash: codeExpire, mode: 'generique', cree_par: idAdmin, expire_le: new Date(Date.now() - 1_000).toISOString() },
      { code_hash: codeRevoque, mode: 'generique', cree_par: idAdmin, expire_le: new Date(Date.now() + 86_400_000).toISOString(), revoque_le: new Date().toISOString() },
      { code_hash: codeUtilise, mode: 'generique', cree_par: idAdmin, expire_le: new Date(Date.now() + 86_400_000).toISOString(), utilise_le: new Date().toISOString() },
    ])
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
})
