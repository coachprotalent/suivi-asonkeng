import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'

test.describe.configure({ mode: 'serial' })

const IDENT_ADMIN = 'test.e2e.arbre.admin'
const MDP_ADMIN = `Test-${crypto.randomUUID()}`
const PREFIXE = `ZZArbreE2E-${crypto.randomUUID().slice(0, 8)}`

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const ALERTE = '[role="alert"]:not(#__next-route-announcer__)'

let idRacine: string
let idEnfant: string
let idPetitEnfant: string

async function creerMembre(suffixe: string, faiseurDeDiscipleId: string | null): Promise<string> {
  const { data, error } = await admin
    .from('membres')
    .insert({ nom: `${PREFIXE}-${suffixe}`, prenom: 'Test', faiseur_de_disciple_id: faiseurDeDiscipleId })
    .select('id')
    .single()
  if (error || !data) throw new Error(`création du membre ${suffixe} impossible : ${error?.message}`)
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

async function nettoyer() {
  await admin.from('membres').delete().like('nom', 'ZZArbreE2E-%')
  await supprimerCompte(IDENT_ADMIN)
}

test.beforeAll(async () => {
  await nettoyer()

  const { data, error } = await admin.auth.admin.createUser({
    email: `${IDENT_ADMIN}@asonkeng.local`,
    password: MDP_ADMIN,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(error?.message)
  const { error: erreurProfil } = await admin
    .from('profils')
    .insert({ id: data.user.id, identifiant: IDENT_ADMIN, nom_affichage: 'Test arbre admin' })
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

  idRacine = await creerMembre('racine', null)
  idEnfant = await creerMembre('enfant', idRacine)
  idPetitEnfant = await creerMembre('petit-enfant', idEnfant)
})

test.afterAll(nettoyer)

async function seConnecter(page: import('@playwright/test').Page) {
  await page.goto('/connexion')
  await page.getByLabel('Identifiant').fill(IDENT_ADMIN)
  await page.getByLabel('Mot de passe', { exact: true }).fill(MDP_ADMIN)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page).toHaveURL(/\/tableau-de-bord/)
}

async function choisirDansSelecteur(
  page: import('@playwright/test').Page,
  label: string,
  terme: string,
  nomComplet: string,
) {
  // Le sélecteur porte son propre champ de recherche, dont le libellé est celui du
  // champ lui-même : c'est ce libellé que l'on vise, pas un placeholder.
  await page.getByLabel(label, { exact: true }).fill(terme)
  await page.getByRole('button', { name: nomComplet }).click()
}

test('un administrateur rattache un membre et le dirigeant est proposé', async ({ page }) => {
  await seConnecter(page)
  await page.goto(`/membres/${idPetitEnfant}/arbre`)

  // L'état initial est déjà rattaché : le dirigeant proposé doit être la racine
  // (faiseur du faiseur), et l'écran doit l'annoncer comme CALCULÉ.
  await expect(page.getByText('Calculé à partir du faiseur de disciple.')).toBeVisible()

  await page.getByRole('button', { name: 'Enregistrer le rattachement' }).click()
  await expect(page).toHaveURL(new RegExp(`/membres/${idPetitEnfant}$`))

  const { data } = await admin
    .from('membres')
    .select('faiseur_de_disciple_id, dirigeant_id, dirigeant_force')
    .eq('id', idPetitEnfant)
    .single()
  expect(data?.faiseur_de_disciple_id).toBe(idEnfant)
  expect(data?.dirigeant_id).toBe(idRacine)
  expect(data?.dirigeant_force).toBe(false)
})

test('un rattachement qui fermerait un cycle est refusé, avec le chemin fautif', async ({ page }) => {
  await seConnecter(page)
  await page.goto(`/membres/${idRacine}/arbre`)

  await choisirDansSelecteur(page, 'Faiseur de disciple', `${PREFIXE}-petit-enfant`, `Test ${PREFIXE}-petit-enfant`)
  await page.getByRole('button', { name: 'Enregistrer le rattachement' }).click()

  const alerte = page.locator(ALERTE)
  await expect(alerte).toContainText('créerait un cycle')
  // Le §7 exige le CHEMIN, pas seulement le refus : sans cette assertion, un message
  // générique passerait et l'exigence serait perdue sans que rien ne le signale.
  await expect(alerte).toContainText(`${PREFIXE}-petit-enfant`)
  await expect(alerte).toContainText(`${PREFIXE}-racine`)

  // Et rien n'a été écrit — sur les TROIS colonnes que `definir_arbre` écrit dans la
  // même instruction. Se limiter à `faiseur_de_disciple_id` serait une assertion
  // négative sur une valeur déjà nulle avant le test : elle resterait verte même si
  // `dirigeant_id`/`dirigeant_force` avaient été écrits malgré le refus du cycle.
  const { data } = await admin
    .from('membres')
    .select('faiseur_de_disciple_id, dirigeant_id, dirigeant_force')
    .eq('id', idRacine)
    .single()
  expect(data?.faiseur_de_disciple_id).toBeNull()
  expect(data?.dirigeant_id).toBeNull()
  expect(data?.dirigeant_force).toBe(false)
})

test("un compte non administrateur ne peut pas atteindre l'écran de rattachement", async ({ page }) => {
  // Compte ordinaire créé à la volée : l'écran doit rediriger, pas seulement masquer.
  const identifiant = 'test.e2e.arbre.simple'
  const mdp = `Test-${crypto.randomUUID()}`
  await supprimerCompte(identifiant)
  const { data, error } = await admin.auth.admin.createUser({
    email: `${identifiant}@asonkeng.local`,
    password: mdp,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(error?.message)
  const { error: erreurProfil } = await admin
    .from('profils')
    .insert({ id: data.user.id, identifiant, nom_affichage: 'Test simple' })
  if (erreurProfil) {
    // Sans ce contrôle, un profil manquant se manifesterait plus bas comme un échec
    // de connexion inexplicable — `seConnecter` échouerait sur un compte qui existe
    // en authentification mais n'a pas de fiche `profils`, sans dire pourquoi.
    await admin.auth.admin.deleteUser(data.user.id)
    throw new Error(`insertion du profil impossible : ${erreurProfil.message}`)
  }

  try {
    await page.goto('/connexion')
    await page.getByLabel('Identifiant').fill(identifiant)
    await page.getByLabel('Mot de passe', { exact: true }).fill(mdp)
    await page.getByRole('button', { name: 'Se connecter' }).click()
    await expect(page).toHaveURL(/\/tableau-de-bord/)

    await page.goto(`/membres/${idPetitEnfant}/arbre`)
    await expect(page).toHaveURL(/\/tableau-de-bord/)
  } finally {
    await supprimerCompte(identifiant)
  }
})

test('la filiation est visible de tous, le lien de rattachement des seuls administrateurs', async ({
  page,
}) => {
  await seConnecter(page)
  await page.goto(`/membres/${idPetitEnfant}`)
  await expect(page.getByText('Faiseur de disciple')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Rattacher' })).toHaveCount(1)

  // La racine doit voir ses disciples.
  await page.goto(`/membres/${idRacine}`)
  await expect(page.getByRole('link', { name: `Test ${PREFIXE}-enfant` })).toHaveCount(1)
})
