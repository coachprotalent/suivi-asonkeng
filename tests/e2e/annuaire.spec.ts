import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'

const IDENTIFIANT = 'test.e2e.annuaire'
const EMAIL = `${IDENTIFIANT}@asonkeng.local`
// Tiré à chaque exécution : jamais de mot de passe littéral dans un dépôt public.
const MDP = `Test-${crypto.randomUUID()}`
const NOM_MEMBRE = `ZZAnnuaire-${crypto.randomUUID().slice(0, 8)}`

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

async function nettoyer() {
  await admin.from('membres').delete().like('nom', 'ZZAnnuaire-%')
  const { data } = await admin.from('profils').select('id').eq('identifiant', IDENTIFIANT).maybeSingle()
  if (data) {
    await admin.auth.admin.deleteUser(data.id)
    return
  }
  const { data: comptes } = await admin.auth.admin.listUsers()
  const orphelin = comptes?.users.find((u) => u.email === EMAIL)
  if (orphelin) await admin.auth.admin.deleteUser(orphelin.id)
}

test.beforeAll(async () => {
  await nettoyer()

  const { data, error } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: MDP,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(error?.message)

  const { error: erreurProfil } = await admin
    .from('profils')
    .insert({ id: data.user.id, identifiant: IDENTIFIANT, nom_affichage: 'Test annuaire' })
  if (erreurProfil) {
    await admin.auth.admin.deleteUser(data.user.id)
    throw new Error(`insertion du profil impossible : ${erreurProfil.message}`)
  }

  const { error: erreurRole } = await admin
    .from('roles_profil')
    .insert({ profil_id: data.user.id, role: 'administrateur' })
  if (erreurRole) {
    await admin.auth.admin.deleteUser(data.user.id)
    throw new Error(`attribution du rôle impossible : ${erreurRole.message}`)
  }
})

test.afterAll(nettoyer)

async function seConnecter(page: import('@playwright/test').Page) {
  await page.goto('/connexion')
  await page.getByLabel('Identifiant').fill(IDENTIFIANT)
  await page.getByLabel('Mot de passe').fill(MDP)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page).toHaveURL(/\/tableau-de-bord/)
}

test("l'annuaire est protégé par la connexion", async ({ page }) => {
  await page.goto('/membres')
  await expect(page).toHaveURL(/\/connexion/)
})

test('un administrateur crée une fiche et la retrouve dans l’annuaire', async ({ page }) => {
  await seConnecter(page)

  await page.goto('/membres/nouveau')
  // Libellés réels du formulaire (voir src/app/membres/formulaire-membre.tsx) :
  // les champs obligatoires portent la mention « (obligatoire) ». `exact: true`
  // est nécessaire : « Prénom (obligatoire) » contient la sous-chaîne
  // « nom (obligatoire) », ce qui rend `getByLabel('Nom (obligatoire)')` ambigu.
  await page.getByLabel('Prénom (obligatoire)', { exact: true }).fill('Jérôme')
  await page.getByLabel('Nom (obligatoire)', { exact: true }).fill(NOM_MEMBRE)
  await page.getByLabel('Ville').fill('Yaoundé')
  await page.getByRole('button', { name: 'Créer la fiche' }).click()

  await expect(page).toHaveURL(/\/membres/)
  await expect(page.getByText(`Jérôme ${NOM_MEMBRE}`)).toBeVisible()

  // La recherche doit retrouver la fiche par sa ville.
  await page.getByLabel('Rechercher').fill('Yaoundé')
  await page.getByRole('button', { name: 'Filtrer' }).click()
  await expect(page.getByText(`Jérôme ${NOM_MEMBRE}`)).toBeVisible()

  // Et ne rien renvoyer pour une recherche qui ne correspond à personne.
  await page.getByLabel('Rechercher').fill('VilleQuiNExistePas')
  await page.getByRole('button', { name: 'Filtrer' }).click()
  await expect(page.getByText('Aucun membre ne correspond à cette recherche.')).toBeVisible()
})

test('une fiche archivée disparaît de l’annuaire', async ({ page }) => {
  await seConnecter(page)

  await page.goto('/membres')
  await page.getByText(`Jérôme ${NOM_MEMBRE}`).click()
  await expect(page.getByRole('heading', { name: `Jérôme ${NOM_MEMBRE}` })).toBeVisible()

  // Le bouton « Archiver » ouvre une confirmation via window.confirm : Playwright
  // refuse les dialogues natifs par défaut, il faut donc l'accepter explicitement.
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Archiver' }).click()
  await expect(page).toHaveURL(/\/membres/)
  await expect(page.getByText(`Jérôme ${NOM_MEMBRE}`)).toHaveCount(0)
})
