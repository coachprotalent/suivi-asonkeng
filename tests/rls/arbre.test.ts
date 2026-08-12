import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const IDENT_SIMPLE = 'test.rls.arbre.simple'
const MDP_SIMPLE = `Test-${crypto.randomUUID()}`
const PREFIXE = `ZZArbre-${crypto.randomUUID().slice(0, 8)}`

let idRacine: string
let idEnfant: string
let idPetitEnfant: string
let clientSimple: SupabaseClient

async function creerMembre(nom: string, faiseurDeDiscipleId: string | null): Promise<string> {
  const { data, error } = await admin
    .from('membres')
    .insert({ nom: `${PREFIXE}-${nom}`, prenom: 'Test', faiseur_de_disciple_id: faiseurDeDiscipleId })
    .select('id')
    .single()
  if (error || !data) throw new Error(`création du membre ${nom} impossible : ${error?.message}`)
  return data.id
}

async function supprimerCompte(identifiant: string) {
  const { data } = await admin.from('profils').select('id').eq('identifiant', identifiant).maybeSingle()
  if (data) {
    await admin.auth.admin.deleteUser(data.id)
    return
  }
  const { data: comptes } = await admin.auth.admin.listUsers()
  const orphelin = comptes?.users.find((u) => u.email === `${identifiant}@asonkeng.local`)
  if (orphelin) await admin.auth.admin.deleteUser(orphelin.id)
}

beforeAll(async () => {
  await admin.from('membres').delete().like('nom', 'ZZArbre-%')
  await supprimerCompte(IDENT_SIMPLE)

  idRacine = await creerMembre('racine', null)
  idEnfant = await creerMembre('enfant', idRacine)
  idPetitEnfant = await creerMembre('petit-enfant', idEnfant)

  const { data, error } = await admin.auth.admin.createUser({
    email: `${IDENT_SIMPLE}@asonkeng.local`,
    password: MDP_SIMPLE,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`création du compte impossible : ${error?.message}`)
  const { error: erreurProfil } = await admin
    .from('profils')
    .insert({ id: data.user.id, identifiant: IDENT_SIMPLE, nom_affichage: 'Test arbre' })
  if (erreurProfil) throw new Error(`insertion du profil impossible : ${erreurProfil.message}`)

  clientSimple = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
  const { error: erreurConnexion } = await clientSimple.auth.signInWithPassword({
    email: `${IDENT_SIMPLE}@asonkeng.local`,
    password: MDP_SIMPLE,
  })
  if (erreurConnexion) throw new Error(`connexion impossible : ${erreurConnexion.message}`)
})

afterAll(async () => {
  // L'ordre compte : les enfants d'abord, `faiseur_de_disciple_id` est en
  // `on delete set null` mais la suppression en vrac par préfixe suffit ici.
  await admin.from('membres').delete().like('nom', 'ZZArbre-%')
  await supprimerCompte(IDENT_SIMPLE)
})

describe('déclencheur anti-cycle', () => {
  it("refuse de faire d'un membre le disciple de son propre disciple", async () => {
    const { error } = await admin
      .from('membres')
      .update({ faiseur_de_disciple_id: idPetitEnfant })
      .eq('id', idRacine)
    expect(error).not.toBeNull()
    expect(error?.details).toBe('cycle_faiseur_de_disciple')
  })

  it("refuse de faire d'un membre son propre faiseur de disciple", async () => {
    const { error } = await admin
      .from('membres')
      .update({ faiseur_de_disciple_id: idEnfant })
      .eq('id', idEnfant)
    expect(error).not.toBeNull()
    // Ce cas est déjà couvert par la contrainte CHECK membres_pas_son_propre_fdd,
    // indépendamment du déclencheur : sans cette assertion sur le marqueur, ce test
    // resterait vert même si la branche `new.faiseur_de_disciple_id = new.id` du
    // déclencheur disparaissait, alors que sa seule raison d'être est d'unifier le
    // marqueur d'erreur pour cette longueur de cycle avec celui des cycles plus longs.
    expect(error?.details).toBe('cycle_faiseur_de_disciple')
  })

  // CONTRÔLE POSITIF : sans lui, les deux refus ci-dessus seraient satisfaits par une
  // table qui refuse TOUTE écriture, ce qui ne prouverait rien sur la détection de cycle.
  it('laisse passer un rattachement qui ne ferme aucun cycle', async () => {
    const idAutre = await creerMembre('autre', null)
    const { error } = await admin
      .from('membres')
      .update({ faiseur_de_disciple_id: idRacine })
      .eq('id', idAutre)
    expect(error).toBeNull()
  })
})

describe('passerelle definir_arbre réservée à service_role', () => {
  it('refuse son exécution à un compte authentifié ordinaire', async () => {
    const { error } = await clientSimple.rpc('definir_arbre', {
      p_membre: idPetitEnfant,
      p_faiseur_de_disciple: idRacine,
      p_dirigeant: null,
      p_dirigeant_force: false,
    })
    expect(error).not.toBeNull()
    expect(error?.code).toBe('42501')

    // Et vérifier qu'AUCUNE écriture n'a eu lieu : un refus qui écrirait quand même
    // serait le pire des cas, et le code d'erreur seul ne le dirait pas.
    const { data } = await admin
      .from('membres')
      .select('faiseur_de_disciple_id')
      .eq('id', idPetitEnfant)
      .single()
    expect(data?.faiseur_de_disciple_id).toBe(idEnfant)
  })

  // CONTRÔLE POSITIF : le refus ci-dessus ne prouve rien si la passerelle est cassée
  // pour tout le monde.
  it('laisse la clé de service exécuter la passerelle', async () => {
    const { error } = await admin.rpc('definir_arbre', {
      p_membre: idPetitEnfant,
      p_faiseur_de_disciple: idRacine,
      p_dirigeant: idRacine,
      p_dirigeant_force: true,
    })
    expect(error).toBeNull()

    const { data } = await admin
      .from('membres')
      .select('faiseur_de_disciple_id, dirigeant_id, dirigeant_force')
      .eq('id', idPetitEnfant)
      .single()
    expect(data?.faiseur_de_disciple_id).toBe(idRacine)
    expect(data?.dirigeant_id).toBe(idRacine)
    expect(data?.dirigeant_force).toBe(true)

    // Rétablir, les tests suivants dépendent de la forme de l'arbre. Vérifier
    // l'erreur : un échec silencieux ici invaliderait leur précondition sans que
    // rien ne le signale, et ferait échouer des tests plus tard pour une raison
    // sans rapport avec ce qu'ils prétendent vérifier.
    const { error: erreurRetablissement } = await admin.rpc('definir_arbre', {
      p_membre: idPetitEnfant,
      p_faiseur_de_disciple: idEnfant,
      p_dirigeant: null,
      p_dirigeant_force: false,
    })
    expect(erreurRetablissement).toBeNull()
  })

  it('détache un membre quand le faiseur de disciple passé est null', async () => {
    const idDetachable = await creerMembre('detachable', idRacine)
    const { error } = await admin.rpc('definir_arbre', {
      p_membre: idDetachable,
      p_faiseur_de_disciple: null,
      p_dirigeant: null,
      p_dirigeant_force: false,
    })
    expect(error).toBeNull()

    // Le point exact que `coalesce` aurait cassé : un null doit DÉTACHER, pas
    // « ne rien changer ». Une racine de l'arbre est un état légitime.
    const { data } = await admin
      .from('membres')
      .select('faiseur_de_disciple_id')
      .eq('id', idDetachable)
      .single()
    expect(data?.faiseur_de_disciple_id).toBeNull()
  })

  it('refuse un membre inconnu avec un marqueur stable', async () => {
    const { error } = await admin.rpc('definir_arbre', {
      p_membre: '00000000-0000-0000-0000-000000000000',
      p_faiseur_de_disciple: null,
      p_dirigeant: null,
      p_dirigeant_force: false,
    })
    expect(error).not.toBeNull()
    expect(error?.details).toBe('membre_inconnu')
  })

  it('refuse un faiseur de disciple inconnu avec un marqueur stable', async () => {
    const { error } = await admin.rpc('definir_arbre', {
      p_membre: idPetitEnfant,
      p_faiseur_de_disciple: '00000000-0000-0000-0000-000000000000',
      p_dirigeant: null,
      p_dirigeant_force: false,
    })
    expect(error).not.toBeNull()
    expect(error?.details).toBe('faiseur_inconnu')
  })

  it('refuse un dirigeant inconnu avec un marqueur stable', async () => {
    const { error } = await admin.rpc('definir_arbre', {
      p_membre: idPetitEnfant,
      p_faiseur_de_disciple: null,
      p_dirigeant: '00000000-0000-0000-0000-000000000000',
      p_dirigeant_force: false,
    })
    expect(error).not.toBeNull()
    expect(error?.details).toBe('dirigeant_inconnu')
  })

  it('refuse le cycle jusque depuis la passerelle', async () => {
    const { error } = await admin.rpc('definir_arbre', {
      p_membre: idRacine,
      p_faiseur_de_disciple: idPetitEnfant,
      p_dirigeant: null,
      p_dirigeant_force: false,
    })
    expect(error).not.toBeNull()
    expect(error?.details).toBe('cycle_faiseur_de_disciple')
  })
})

describe("parcours de l'arbre", () => {
  it('remonte les ancêtres du plus proche au plus lointain', async () => {
    const { data, error } = await admin.rpc('ancetres_membre', { p_membre: idPetitEnfant })
    expect(error).toBeNull()
    expect(data).toEqual([
      { membre_id: idEnfant, profondeur: 1 },
      { membre_id: idRacine, profondeur: 2 },
    ])
  })

  it('exclut le membre lui-même', async () => {
    const { data } = await admin.rpc('ancetres_membre', { p_membre: idPetitEnfant })
    const identifiants = (data ?? []).map((l: { membre_id: string }) => l.membre_id)
    expect(identifiants).not.toContain(idPetitEnfant)
  })

  it('renvoie une liste vide pour une racine', async () => {
    const { data, error } = await admin.rpc('ancetres_membre', { p_membre: idRacine })
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('refuse son exécution à un compte authentifié ordinaire', async () => {
    const { error } = await clientSimple.rpc('ancetres_membre', { p_membre: idPetitEnfant })
    expect(error).not.toBeNull()
    expect(error?.code).toBe('42501')
  })

  it("donne le chemin nommé, membre inclus, pour l'affichage", async () => {
    const { data, error } = await admin.rpc('chemin_arbre', { p_membre: idPetitEnfant })
    expect(error).toBeNull()
    expect(data).toHaveLength(3)
    expect(data?.[0].membre_id).toBe(idPetitEnfant)
    expect(data?.[0].profondeur).toBe(0)
    expect(data?.[2].membre_id).toBe(idRacine)
  })
})
