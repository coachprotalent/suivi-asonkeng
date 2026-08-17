import { createClient } from '@supabase/supabase-js'
import { expect, test, type Page } from '@playwright/test'
import { identifiantVersEmail } from '../../src/lib/domaine/identifiant'

/**
 * Phase 7, D142 / D143 / D146 — l'écran « Mes membres ».
 *
 * ═══ LE DÉCOR ═══
 *
 *   MOI  ← fiche du compte de test
 *   ├── DISCIPLE          niveau 1, dont MOI est le faiseur de disciple
 *   │   └── PETIT         niveau 2, « via DISCIPLE »
 *   DIRIGE   → dirigeant_id = MOI
 *   CONTACT  → contact_id  = MOI
 *
 * `DIRIGE` et `CONTACT` n'ont PAS MOI pour faiseur de disciple : les quatre sections
 * répondent à quatre questions différentes, et il faut pouvoir vérifier qu'aucune ne déborde
 * sur les autres.
 *
 * ═══ CE QUE CETTE SUITE ÉPROUVE ET QUE LES PREUVES RLS NE PEUVENT PAS ÉPROUVER ═══
 * L'ASYMÉTRIE DE LA SECTION « CONTACT » (D143) : trois sections proposent « Gérer les
 * statuts », la quatrième non — parce que le contact ne confère aucun droit. C'est une
 * décision de produit qui ne vit que dans le rendu, et une absence de bouton se « corrige »
 * toute seule au premier passage d'un relecteur pressé si rien ne la verrouille.
 */

test.describe.configure({ mode: 'serial' })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const MDP = `Test-${crypto.randomUUID()}`
const IDENT_SIMPLE = 'test.e2e.mesmembres.simple'
const IDENT_SANS_FICHE = 'test.e2e.mesmembres.sansfiche'

const PREFIXE_FAMILLE = 'ZZMesMembresE2E-'
const SUFFIXE = crypto.randomUUID().slice(0, 8)
const NOM_MOI = `${PREFIXE_FAMILLE}moi-${SUFFIXE}`
const NOM_DISCIPLE = `${PREFIXE_FAMILLE}disciple-${SUFFIXE}`
const NOM_PETIT = `${PREFIXE_FAMILLE}petit-${SUFFIXE}`
const NOM_DIRIGE = `${PREFIXE_FAMILLE}dirige-${SUFFIXE}`
const NOM_CONTACT = `${PREFIXE_FAMILLE}contact-${SUFFIXE}`

const ids: Record<string, string> = {}

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

async function creerMembre(nom: string, colonnes: Record<string, unknown> = {}): Promise<string> {
  const { data, error } = await admin
    .from('membres')
    .insert({ nom, prenom: 'Test', etat: 'actif', ...colonnes })
    .select('id')
    .single()
  if (error || !data) throw new Error(`création de ${nom} impossible : ${error?.message}`)
  return data.id
}

async function creerCompte(identifiant: string, membreId: string | null) {
  const { data, error } = await admin.auth.admin.createUser({
    email: identifiantVersEmail(identifiant),
    password: MDP,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`création du compte impossible : ${error?.message}`)
  const { error: erreurProfil } = await admin.from('profils').insert({
    id: data.user.id,
    identifiant,
    nom_affichage: `Test mes membres ${identifiant}`,
    membre_id: membreId,
  })
  if (erreurProfil) {
    await admin.auth.admin.deleteUser(data.user.id)
    throw new Error(`insertion du profil impossible : ${erreurProfil.message}`)
  }
}

async function seConnecter(page: Page, identifiant: string) {
  await page.goto('/connexion')
  await page.getByLabel('Identifiant').fill(identifiant)
  await page.getByLabel('Mot de passe').fill(MDP)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page).toHaveURL(/\/tableau-de-bord/)
}

/** La section portant ce titre, avec ses lignes et ses actions. */
function section(page: Page, titre: string) {
  return page.locator('section').filter({ has: page.getByRole('heading', { name: titre }) })
}

test.beforeAll(async () => {
  for (const identifiant of [IDENT_SIMPLE, IDENT_SANS_FICHE]) await supprimerCompte(identifiant)
  await admin.from('membres').delete().like('nom', `${PREFIXE_FAMILLE}%`)

  ids.moi = await creerMembre(NOM_MOI)
  ids.disciple = await creerMembre(NOM_DISCIPLE, { faiseur_de_disciple_id: ids.moi })
  ids.petit = await creerMembre(NOM_PETIT, { faiseur_de_disciple_id: ids.disciple })
  ids.dirige = await creerMembre(NOM_DIRIGE, { dirigeant_id: ids.moi })
  ids.contact = await creerMembre(NOM_CONTACT, { contact_id: ids.moi })

  // AUCUN RÔLE : c'est le compte ordinaire dont cette phase élargit les écrans. En
  // administrateur, tout serait visible de toute façon et la preuve ne dirait rien.
  await creerCompte(IDENT_SIMPLE, ids.moi)
  await creerCompte(IDENT_SANS_FICHE, null)
})

test.afterAll(async () => {
  for (const identifiant of [IDENT_SIMPLE, IDENT_SANS_FICHE]) await supprimerCompte(identifiant)
  await admin.from('membres').delete().like('nom', `${PREFIXE_FAMILLE}%`)

  const { count, error } = await admin
    .from('membres')
    .select('id', { count: 'exact', head: true })
    .like('nom', `${PREFIXE_FAMILLE}%`)
  if (error) throw new Error(`comptage de contrôle impossible : ${error.message}`)
  expect(count).toBe(0)
})

test('les quatre sections sont présentes et chacune ne contient que les siens', async ({ page }) => {
  await seConnecter(page, IDENT_SIMPLE)
  await page.goto('/mes-membres')

  await expect(section(page, 'Mes disciples directs')).toContainText(NOM_DISCIPLE)
  await expect(section(page, 'Disciples de mes disciples')).toContainText(NOM_PETIT)
  await expect(section(page, 'Ceux dont je suis dirigeant')).toContainText(NOM_DIRIGE)
  await expect(section(page, 'Ceux dont je suis contact')).toContainText(NOM_CONTACT)

  // AUCUNE SECTION NE DÉBORDE SUR L'AUTRE. Sans ces assertions négatives, une requête qui
  // ignorerait son paramètre `colonne` et rendrait la même liste quatre fois passerait les
  // quatre assertions ci-dessus.
  //
  // ⚠️ ON VÉRIFIE LES LIENS DE LIGNE, PAS LE TEXTE BRUT DE LA SECTION. Le nom du DISCIPLE
  // apparaît LÉGITIMEMENT dans la section « Disciples de mes disciples » — c'est la mention
  // « via Test … » qui dit par qui la branche passe. Chercher son nom dans le texte y
  // trouverait donc cette mention et ferait échouer une assertion pourtant juste. Ce qui
  // distingue « figurer dans la section » de « être cité comme parent », c'est la présence
  // d'une LIGNE menant à sa fiche.
  const lignesVers = (titre: string, id: string) =>
    section(page, titre).locator(`li a[href="/membres/${id}"]`)

  await expect(lignesVers('Mes disciples directs', ids.disciple)).toHaveCount(1)
  await expect(lignesVers('Mes disciples directs', ids.petit)).toHaveCount(0)
  await expect(lignesVers('Mes disciples directs', ids.dirige)).toHaveCount(0)
  await expect(lignesVers('Disciples de mes disciples', ids.petit)).toHaveCount(1)
  await expect(lignesVers('Disciples de mes disciples', ids.disciple)).toHaveCount(0)
  await expect(lignesVers('Ceux dont je suis dirigeant', ids.dirige)).toHaveCount(1)
  await expect(lignesVers('Ceux dont je suis dirigeant', ids.contact)).toHaveCount(0)
  await expect(lignesVers('Ceux dont je suis contact', ids.contact)).toHaveCount(1)
  await expect(lignesVers('Ceux dont je suis contact', ids.disciple)).toHaveCount(0)
})

test('un disciple de disciple porte sa provenance « via X »', async ({ page }) => {
  await seConnecter(page, IDENT_SIMPLE)
  await page.goto('/mes-membres')

  // La descendance annonce PAR QUI elle passe : sans cela, une liste à plat de trente noms
  // ne dit rien de la branche à laquelle chacun appartient.
  await expect(section(page, 'Disciples de mes disciples')).toContainText(`via Test ${NOM_DISCIPLE}`)
})

test("la section « contact » ne propose PAS de gérer les statuts (D143)", async ({ page }) => {
  await seConnecter(page, IDENT_SIMPLE)
  await page.goto('/mes-membres')

  // LES DEUX MOITIÉS COMPTENT. Sans la première, l'assertion d'absence passerait aussi si le
  // lien avait disparu de tout l'écran.
  await expect(
    section(page, 'Mes disciples directs').getByRole('link', { name: 'Gérer les statuts' }),
  ).toHaveCount(1)
  await expect(
    section(page, 'Ceux dont je suis contact').getByRole('link', { name: 'Gérer les statuts' }),
  ).toHaveCount(0)

  // Et l'absence est ÉNONCÉE, pas muette.
  await expect(section(page, 'Ceux dont je suis contact')).toContainText(
    'ne donne aucun droit sur leur fiche',
  )
})

test('chaque section pagine indépendamment des trois autres', async ({ page }) => {
  await seConnecter(page, IDENT_SIMPLE)
  // Aucune section du décor n'a plus d'une page : on éprouve ici que les quatre paramètres
  // COEXISTENT et qu'aucun n'écrase les autres, ce qui est le défaut réel à craindre.
  await page.goto('/mes-membres?disciples=1&descendance=2&diriges=1&contacts=1')
  await expect(page).toHaveURL(/descendance=2/)
  // La section paginée hors bornes reste vide sans faire tomber l'écran, et les trois autres
  // rendent toujours leur contenu.
  await expect(section(page, 'Mes disciples directs')).toContainText(NOM_DISCIPLE)
  await expect(section(page, 'Ceux dont je suis dirigeant')).toContainText(NOM_DIRIGE)
})

test("un compte sans fiche membre voit l'encart, pas quatre listes vides (D146)", async ({
  page,
}) => {
  await seConnecter(page, IDENT_SANS_FICHE)
  await page.goto('/mes-membres')

  await expect(
    page.getByText("Ce compte n'est relié à aucune fiche de suivi", { exact: false }),
  ).toBeVisible()
  // Aucune des quatre sections n'est rendue : quatre listes vides feraient croire à un membre
  // sans disciples au lieu d'un compte sans fiche.
  await expect(page.getByRole('heading', { name: 'Mes disciples directs' })).toHaveCount(0)
})

test('le tableau de bord mène au profil et à mes membres', async ({ page }) => {
  await seConnecter(page, IDENT_SIMPLE)
  // Par `href` et non par nom accessible : le nom d'affichage du compte de test contient
  // lui-même « mes membres », et le lien « Connecté en tant que … » satisfait alors un filtre
  // par nom. Le lien de navigation, lui, se reconnaît sans ambiguïté à sa destination.
  await expect(page.locator('a[href="/mes-membres"]')).toBeVisible()
  await expect(page.locator('a[href="/profil"]')).toHaveCount(2)
  // DEUX liens vers /profil, et c'est voulu : l'entrée de navigation, et l'état de session
  // devenu cliquable. C'est ce dernier qu'on éprouve ici — il n'existait pas avant la phase 7.
  await page.getByRole('link', { name: /Connecté en tant que/ }).click()
  await expect(page).toHaveURL(/\/profil/)
})

test('mes membres est protégé par la connexion', async ({ page }) => {
  await page.goto('/mes-membres')
  await expect(page).toHaveURL(/\/connexion/)
})
