import { createClient } from '@supabase/supabase-js'
import { expect, test, type Page } from '@playwright/test'
import { identifiantVersEmail } from '../../src/lib/domaine/identifiant'

/**
 * Phase 8, D150 / D151 / D152 / D153 — le rôle « leader », vu de l'écran.
 *
 * ═══ CE QUE CETTE SUITE ÉPROUVE, ET QUE LES AUTRES NE PEUVENT PAS ÉPROUVER ═══
 * `tests/rls/leader.test.ts` établit que la valeur d'énumération existe et que
 * `definir_roles` sait l'écrire. `src/lib/domaine/arbre.test.ts` établit que `peutModifier`
 * court-circuite. NI L'UN NI L'AUTRE n'établit que le rôle DONNE réellement quelque chose :
 * l'autorité du leader ne vit dans aucune politique RLS (D151), elle se décide dans le garde
 * applicatif. Seul un parcours de bout en bout peut le montrer.
 *
 * Les quatre preuves, dans l'ordre :
 *   1. un administrateur attribue le rôle depuis /comptes ;
 *   2. le leader gère les statuts de quelqu'un dont il n'est NI ancêtre NI dirigeant (D152) ;
 *   3. un compte SANS le rôle n'a rien de tout cela — sans ce contrôle négatif, la preuve 2
 *      passerait aussi si le formulaire avait été ouvert à tout le monde ;
 *   4. le leader ne voit toujours PAS une fiche archivée (D153) — son autorité est totale,
 *      sa LECTURE ne l'est pas, et c'est la décision de l'utilisateur.
 *
 * ═══ LE DÉCOR ═══
 *   ETRANGER  — fiche active, SANS faiseur de disciple et SANS dirigeant : le leader n'a
 *               donc sur elle aucun lien d'arbre. C'est le point.
 *   ARCHIVEE  — fiche archivée, pour la preuve 4.
 *   LEADER    — fiche du compte leader, pour qu'il ait une place dans l'arbre... ailleurs.
 */

test.describe.configure({ mode: 'serial' })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const MDP = `Test-${crypto.randomUUID()}`
const IDENT_ADMIN = 'test.e2e.leader.admin'
const IDENT_LEADER = 'test.e2e.leader.porteur'
const IDENT_SIMPLE = 'test.e2e.leader.simple'

const PREFIXE_FAMILLE = 'ZZLeaderE2E-'
const SUFFIXE = crypto.randomUUID().slice(0, 8)
const NOM_LEADER = `${PREFIXE_FAMILLE}leader-${SUFFIXE}`
const NOM_SIMPLE = `${PREFIXE_FAMILLE}simple-${SUFFIXE}`
const NOM_ETRANGER = `${PREFIXE_FAMILLE}etranger-${SUFFIXE}`
const NOM_ARCHIVEE = `${PREFIXE_FAMILLE}archivee-${SUFFIXE}`

const ids: Record<string, string> = {}
let idProfilLeader: string

/**
 * Supprime un compte de test, ET VÉRIFIE QUE C'EST FAIT.
 *
 * ═══ POURQUOI CETTE VERSION DIFFÈRE DE CELLE DES AUTRES SUITES ═══
 * Le motif répandu dans le dépôt appelle `deleteUser` SANS regarder son erreur. Une
 * défaillance passagère de GoTrue y passe donc inaperçue, et le compte de test survit —
 * mesuré sur cette suite précisément : après une exécution complète, `test.e2e.leader.porteur`
 * subsistait avec `membre_id` à `null`, preuve que la suppression avait échoué en silence
 * PUIS que le nettoyage des fiches l'avait détaché. Une seconde tentative, à la main, a
 * réussi immédiatement — donc bien un aléa, pas un refus.
 *
 * UNE REPRISE PLUTÔT QU'UN ÉCHEC SEC : lever à la première erreur rendrait la suite instable
 * pour un aléa réseau. Lever à la SECONDE distingue l'aléa du vrai refus, et transforme une
 * fuite silencieuse en échec visible.
 */
async function supprimerCompte(identifiant: string) {
  for (const tentative of [1, 2]) {
    const { data } = await admin
      .from('profils')
      .select('id')
      .eq('identifiant', identifiant)
      .maybeSingle()
    if (data) {
      const { error } = await admin.auth.admin.deleteUser(data.id)
      if (!error) return
      if (tentative === 2) {
        throw new Error(`suppression de ${identifiant} impossible : ${error.message}`)
      }
      continue
    }
    // Rattrapage par email : un compte auth créé sans fiche profil resterait introuvable
    // par la requête ci-dessus.
    const { data: comptes } = await admin.auth.admin.listUsers()
    const orphelin = comptes?.users.find((u) => u.email === identifiantVersEmail(identifiant))
    if (!orphelin) return
    const { error } = await admin.auth.admin.deleteUser(orphelin.id)
    if (!error) return
    if (tentative === 2) {
      throw new Error(`suppression de l'orphelin ${identifiant} impossible : ${error.message}`)
    }
  }
}

async function creerMembre(nom: string): Promise<string> {
  const { data, error } = await admin
    .from('membres')
    .insert({ nom, prenom: 'Test', etat: 'actif' })
    .select('id')
    .single()
  if (error || !data) throw new Error(`création de ${nom} impossible : ${error?.message}`)
  return data.id
}

async function creerCompte(
  identifiant: string,
  membreId: string | null,
  roles: string[],
): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email: identifiantVersEmail(identifiant),
    password: MDP,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`création du compte impossible : ${error?.message}`)
  const { error: erreurProfil } = await admin.from('profils').insert({
    id: data.user.id,
    identifiant,
    nom_affichage: `Test leader ${identifiant}`,
    membre_id: membreId,
  })
  if (erreurProfil) {
    await admin.auth.admin.deleteUser(data.user.id)
    throw new Error(`insertion du profil impossible : ${erreurProfil.message}`)
  }
  for (const role of roles) {
    const { error: erreurRole } = await admin
      .from('roles_profil')
      .insert({ profil_id: data.user.id, role })
    if (erreurRole) {
      await admin.auth.admin.deleteUser(data.user.id)
      throw new Error(`attribution du rôle ${role} impossible : ${erreurRole.message}`)
    }
  }
  return data.user.id
}

async function seConnecter(page: Page, identifiant: string) {
  await page.goto('/connexion')
  await page.getByLabel('Identifiant').fill(identifiant)
  await page.getByLabel('Mot de passe', { exact: true }).fill(MDP)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page).toHaveURL(/\/tableau-de-bord/)
}

test.beforeAll(async () => {
  for (const identifiant of [IDENT_ADMIN, IDENT_LEADER, IDENT_SIMPLE]) {
    await supprimerCompte(identifiant)
  }
  await admin.from('membres').delete().like('nom', `${PREFIXE_FAMILLE}%`)

  ids.leader = await creerMembre(NOM_LEADER)
  ids.simple = await creerMembre(NOM_SIMPLE)
  // SANS faiseur de disciple ni dirigeant : le leader n'a aucun lien d'arbre avec elle.
  ids.etranger = await creerMembre(NOM_ETRANGER)
  ids.archivee = await creerMembre(NOM_ARCHIVEE)
  const { error } = await admin
    .from('membres')
    .update({ etat: 'archive' })
    .eq('id', ids.archivee)
    .select('id')
  if (error) throw new Error(`archivage impossible : ${error.message}`)

  await creerCompte(IDENT_ADMIN, null, ['administrateur'])
  // Créé SANS le rôle : c'est la preuve 1 qui le lui donnera, par l'écran.
  idProfilLeader = await creerCompte(IDENT_LEADER, ids.leader, [])
  await creerCompte(IDENT_SIMPLE, ids.simple, [])
})

test.afterAll(async () => {
  for (const identifiant of [IDENT_ADMIN, IDENT_LEADER, IDENT_SIMPLE]) {
    await supprimerCompte(identifiant)
  }
  await admin.from('membres').delete().like('nom', `${PREFIXE_FAMILLE}%`)

  const { count, error } = await admin
    .from('membres')
    .select('id', { count: 'exact', head: true })
    .like('nom', `${PREFIXE_FAMILLE}%`)
  if (error) throw new Error(`comptage de contrôle impossible : ${error.message}`)
  expect(count).toBe(0)

  // CONTRÔLE DES COMPTES, et pas seulement des fiches. C'est l'assertion qui manquait :
  // sans elle, un compte de test survivant à `supprimerCompte` restait invisible, et
  // `test.e2e.leader.porteur` a réellement traversé une exécution complète.
  const { data: residus, error: erreurResidus } = await admin
    .from('profils')
    .select('identifiant')
    .in('identifiant', [IDENT_ADMIN, IDENT_LEADER, IDENT_SIMPLE])
  if (erreurResidus) throw new Error(`lecture des profils résiduels : ${erreurResidus.message}`)
  expect(residus ?? [], 'comptes de test résiduels').toHaveLength(0)
})

test('un administrateur attribue le rôle leader depuis /comptes', async ({ page }) => {
  await seConnecter(page, IDENT_ADMIN)
  await page.goto('/comptes')

  const ligne = page.locator('li').filter({ hasText: IDENT_LEADER })
  await ligne.getByLabel('Leader', { exact: true }).check()
  await ligne.getByRole('button', { name: 'Enregistrer les rôles' }).click()

  // La base porte réellement le rôle — l'écran pourrait afficher une case cochée sans que
  // rien n'ait été écrit, ce qui est exactement le mode de défaillance qu'une surcharge de
  // `definir_roles` aurait produit (D154).
  await expect(async () => {
    const { data } = await admin
      .from('roles_profil')
      .select('role')
      .eq('profil_id', idProfilLeader)
    expect((data ?? []).map((l) => l.role)).toEqual(['leader'])
  }).toPass({ timeout: 10_000 })
})

test("un leader gère les statuts de quelqu'un dont il n'est ni ancêtre ni dirigeant (D152)", async ({
  page,
}) => {
  // ═══ LA PREUVE QUI DIT CE QUE LE RÔLE APPORTE ═══
  await seConnecter(page, IDENT_LEADER)

  // Sur la fiche, le lien passe de « Journal » à « Gérer » : c'est `aAutoriteSur` qui en
  // décide, et c'est le premier signe visible du rôle.
  await page.goto(`/membres/${ids.etranger}`)
  await expect(page.getByRole('link', { name: 'Gérer' })).toBeVisible()

  await page.goto(`/membres/${ids.etranger}/statuts`)
  await expect(page.getByRole('button', { name: 'Attribuer ce statut' })).toBeVisible()

  await page.getByLabel('Statut (obligatoire)').selectOption({ index: 1 })
  await page.getByRole('button', { name: 'Attribuer ce statut' }).click()

  // Écrit en base, et pas seulement affiché.
  await expect(async () => {
    const { count } = await admin
      .from('membre_statuts')
      .select('statut_id', { count: 'exact', head: true })
      .eq('membre_id', ids.etranger)
    expect(count).toBe(1)
  }).toPass({ timeout: 10_000 })
})

test("un compte SANS le rôle n'a rien de tout cela", async ({ page }) => {
  // CONTRÔLE NÉGATIF. Sans lui, la preuve précédente passerait aussi si le formulaire
  // d'attribution avait été ouvert à tout le monde par mégarde.
  await seConnecter(page, IDENT_SIMPLE)
  await page.goto(`/membres/${ids.etranger}`)
  await expect(page.getByRole('link', { name: 'Journal' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Gérer' })).toHaveCount(0)

  await page.goto(`/membres/${ids.etranger}/statuts`)
  await expect(page.getByRole('button', { name: 'Attribuer ce statut' })).toHaveCount(0)
})

test('le leader ne voit toujours PAS une fiche archivée (D153)', async ({ page }) => {
  // Son AUTORITÉ est totale, sa LECTURE ne l'est pas : `prive.peut_lire_membre` n'a pas été
  // touchée, décision de l'utilisateur. Autorité et visibilité sont donc DÉCOUPLÉES pour ce
  // rôle — la spec le dit en D153 plutôt que de laisser croire à une fermeture totale.
  await seConnecter(page, IDENT_LEADER)
  const reponse = await page.goto(`/membres/${ids.archivee}`)
  expect(reponse?.status()).toBe(404)
})
