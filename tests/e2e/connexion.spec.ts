import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'

const IDENTIFIANT = 'test.e2e.connexion'
const EMAIL = `${IDENTIFIANT}@asonkeng.local`
// Tiré à chaque exécution : un mot de passe fixe dans un dépôt public ouvrirait
// tout compte de test qu'une exécution interrompue aurait laissé derrière elle.
const MDP_TEMPORAIRE = `Test-${crypto.randomUUID()}`
const MDP_CHOISI = `Test-${crypto.randomUUID()}`

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

async function supprimerCompte() {
  const { data } = await admin.from('profils').select('id').eq('identifiant', IDENTIFIANT).maybeSingle()
  if (data) {
    await admin.auth.admin.deleteUser(data.id)
    return
  }

  // Rattrapage par email. Sans lui, un compte d'authentification créé mais privé de
  // fiche profil resterait introuvable — et la création suivante échouerait pour
  // toujours sur « adresse déjà enregistrée », bloquant la suite entière.
  const { data: comptes } = await admin.auth.admin.listUsers()
  const orphelin = comptes?.users.find((u) => u.email === EMAIL)
  if (orphelin) await admin.auth.admin.deleteUser(orphelin.id)
}

test.beforeAll(async () => {
  await supprimerCompte()
  const { data, error } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: MDP_TEMPORAIRE,
    email_confirm: true,
    app_metadata: { doit_changer_mdp: true },
  })
  if (error || !data.user) throw new Error(error?.message)

  // Cette insertion doit être vérifiée. Si elle échoue en silence, le compte
  // d'authentification survit sans fiche profil : le nettoyage le cherchant par
  // `profils`, il devient introuvable, et toutes les exécutions suivantes échouent
  // définitivement sur « adresse déjà enregistrée ».
  const { error: erreurProfil } = await admin
    .from('profils')
    .insert({ id: data.user.id, identifiant: IDENTIFIANT, nom_affichage: 'Compte de test E2E' })
  if (erreurProfil) {
    await admin.auth.admin.deleteUser(data.user.id)
    throw new Error(`insertion du profil de test impossible : ${erreurProfil.message}`)
  }
})

test.afterAll(supprimerCompte)

test('une route protégée renvoie vers la connexion', async ({ page }) => {
  await page.goto('/tableau-de-bord')
  await expect(page).toHaveURL(/\/connexion/)
})

// `page.locator('[role="alert"]:not(#__next-route-announcer__)')` plutôt que
// `page.getByRole('alert')` : Next.js 16 injecte son propre
// `<div role="alert" id="__next-route-announcer__">` pour l'annonce de navigation, ce
// qui rend `getByRole('alert')` ambigu (2 correspondances). On reste ancré sur le rôle
// d'accessibilité — pas sur la balise HTML de l'alerte applicative — en excluant
// seulement l'élément injecté par Next.js.
test('des identifiants faux affichent un message indifférencié', async ({ page }) => {
  await page.goto('/connexion')
  await page.getByLabel('Identifiant').fill(IDENTIFIANT)
  await page.getByLabel('Mot de passe').fill('MauvaisMotDePasse!1')
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toHaveText(
    'Identifiant ou mot de passe incorrect.',
  )

  await page.getByLabel('Identifiant').fill('inexistant.total')
  await page.getByLabel('Mot de passe').fill('MauvaisMotDePasse!1')
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toHaveText(
    'Identifiant ou mot de passe incorrect.',
  )
})

test('le parcours complet mène au tableau de bord', async ({ page }) => {
  await page.goto('/connexion')
  await page.getByLabel('Identifiant').fill(IDENTIFIANT)
  await page.getByLabel('Mot de passe').fill(MDP_TEMPORAIRE)
  await page.getByRole('button', { name: 'Se connecter' }).click()

  await expect(page).toHaveURL(/\/changer-mot-de-passe/)

  await page.getByLabel('Nouveau mot de passe').fill(MDP_CHOISI)
  await page.getByLabel('Confirmation').fill('AutreChose!2026')
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toHaveText(
    'Les deux mots de passe ne correspondent pas.',
  )

  await page.getByLabel('Nouveau mot de passe').fill(MDP_CHOISI)
  await page.getByLabel('Confirmation').fill(MDP_CHOISI)
  await page.getByRole('button', { name: 'Enregistrer' }).click()

  await expect(page).toHaveURL(/\/tableau-de-bord/)
  await expect(page.getByText('Compte de test E2E')).toBeVisible()

  await page.goto('/tableau-de-bord')
  await expect(page).toHaveURL(/\/tableau-de-bord/)

  await page.getByRole('button', { name: 'Se déconnecter' }).click()
  await expect(page).toHaveURL(/\/connexion/)
})
