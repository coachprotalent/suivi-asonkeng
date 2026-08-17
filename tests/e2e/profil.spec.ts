import { createClient } from '@supabase/supabase-js'
import { expect, test, type Page } from '@playwright/test'
import { identifiantVersEmail } from '../../src/lib/domaine/identifiant'

/**
 * Phase 7, D137 / D138 / D139 — la page de profil et l'auto-édition, vues de l'écran.
 *
 * ═══ CE QUE CETTE SUITE AJOUTE AUX PREUVES RLS ═══
 * `tests/rls/profil-personnel.test.ts` établit ce que la PASSERELLE peut et ne peut pas
 * écrire. Elle ne dit rien de l'ÉCRAN, et deux affirmations de la phase ne vivent que là :
 *
 *   1. un compte ORDINAIRE — ni administrateur ni modérateur — modifie réellement ses
 *      coordonnées de bout en bout, ce qu'aucun écran ne lui permettait avant cette phase ;
 *   2. le formulaire ne PROPOSE aucun champ fermé (D138). C'est une preuve d'ABSENCE, et
 *      elle est le pendant visible de la liste blanche : la couche domaine ne lirait pas ces
 *      champs même s'ils étaient là, mais les afficher promettrait un pouvoir inexistant.
 *
 * La troisième preuve couvre D139 : un compte sans fiche voit un encart, pas un formulaire.
 */

test.describe.configure({ mode: 'serial' })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const MDP = `Test-${crypto.randomUUID()}`
const IDENT_SIMPLE = 'test.e2e.profil.simple'
const IDENT_SANS_FICHE = 'test.e2e.profil.sansfiche'

const PREFIXE_FAMILLE = 'ZZProfilE2E-'
const NOM_MOI = `${PREFIXE_FAMILLE}${crypto.randomUUID().slice(0, 8)}`
const VILLE_INITIALE = 'Ville initiale'
const VILLE_MODIFIEE = 'Douala modifiée'

let idMembre: string

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

async function creerCompte(identifiant: string, membreId: string | null): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email: identifiantVersEmail(identifiant),
    password: MDP,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`création du compte impossible : ${error?.message}`)
  const { error: erreurProfil } = await admin.from('profils').insert({
    id: data.user.id,
    identifiant,
    nom_affichage: `Test profil ${identifiant}`,
    membre_id: membreId,
  })
  if (erreurProfil) {
    await admin.auth.admin.deleteUser(data.user.id)
    throw new Error(`insertion du profil impossible : ${erreurProfil.message}`)
  }
  return data.user.id
}

async function seConnecter(page: Page, identifiant: string) {
  await page.goto('/connexion')
  await page.getByLabel('Identifiant').fill(identifiant)
  await page.getByLabel('Mot de passe').fill(MDP)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page).toHaveURL(/\/tableau-de-bord/)
}

test.beforeAll(async () => {
  for (const identifiant of [IDENT_SIMPLE, IDENT_SANS_FICHE]) await supprimerCompte(identifiant)
  await admin.from('membres').delete().like('nom', `${PREFIXE_FAMILLE}%`)

  const { data, error } = await admin
    .from('membres')
    .insert({ nom: NOM_MOI, prenom: 'Moi', etat: 'actif', ville: VILLE_INITIALE })
    .select('id')
    .single()
  if (error || !data) throw new Error(`création de la fiche impossible : ${error?.message}`)
  idMembre = data.id

  // AUCUN RÔLE : « Utilisateur » est le socle implicite, et c'est exactement le compte dont
  // cette phase élargit les pouvoirs. Le tester en administrateur ne prouverait rien.
  await creerCompte(IDENT_SIMPLE, idMembre)
  // Sans fiche : le cas D139, et celui du compte racine.
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

test('un compte ordinaire modifie lui-même ses coordonnées', async ({ page }) => {
  await seConnecter(page, IDENT_SIMPLE)
  await page.goto('/profil')

  // Le bloc « Mon compte » rend l'identité, en lecture.
  await expect(page.getByRole('heading', { name: 'Mon profil' })).toBeVisible()
  await expect(page.getByText(IDENT_SIMPLE, { exact: true })).toBeVisible()
  // Aucun rôle explicite : le socle implicite doit être NOMMÉ, pas laissé vide.
  await expect(page.getByText('Utilisateur', { exact: true })).toBeVisible()

  await page.getByLabel('Ville').fill(VILLE_MODIFIEE)
  await page.getByRole('button', { name: 'Enregistrer mes coordonnées' }).click()

  await expect(page).toHaveURL(/\/profil\?enregistre=1/)
  await expect(page.getByText('Vos coordonnées ont été enregistrées.')).toBeVisible()

  // La base porte réellement la valeur — l'écran pourrait afficher ce qu'il vient de
  // recevoir sans que rien n'ait été écrit.
  const { data, error } = await admin
    .from('membres')
    .select('ville, nom')
    .eq('id', idMembre)
    .single()
  if (error) throw new Error(`relecture impossible : ${error.message}`)
  expect(data?.ville).toBe(VILLE_MODIFIEE)
  // Et le nom n'a pas bougé : la fermeture tient de bout en bout, pas seulement en SQL.
  expect(data?.nom).toBe(NOM_MOI)
})

test('le formulaire de profil ne propose AUCUN champ fermé (D138)', async ({ page }) => {
  await seConnecter(page, IDENT_SIMPLE)
  await page.goto('/profil')

  // LES SIX CHAMPS OUVERTS SONT LÀ…
  for (const libelle of ['Téléphone', 'Adresse de contact', 'Ville', 'Pays', 'Situation']) {
    await expect(page.getByLabel(libelle, { exact: true })).toBeVisible()
  }

  // …ET AUCUN CHAMP FERMÉ N'EST PROPOSÉ. `getByLabel` couvre les champs de saisie ; le nom
  // d'affichage, lui, doit apparaître en LECTURE (dans le `<dl>`) et jamais en saisie —
  // les deux assertions ci-dessous disent précisément cela.
  for (const libelle of ['Prénom', 'Antenne', 'Contact', 'Faiseur de disciple', 'Dirigeant']) {
    await expect(page.getByLabel(libelle, { exact: true })).toHaveCount(0)
  }
  await expect(page.getByText("Nom d'affichage", { exact: true })).toBeVisible()
  await expect(page.getByLabel("Nom d'affichage", { exact: true })).toHaveCount(0)

  // Et la fermeture est ÉNONCÉE, pas seulement subie : une absence muette se lirait comme
  // un oubli, et quelqu'un « corrigerait » en ajoutant les champs.
  await expect(
    page.getByText(/gérés par l'administrateur/, { exact: false }).first(),
  ).toBeVisible()
})

test("un compte sans fiche membre voit l'encart, pas le formulaire (D139)", async ({ page }) => {
  await seConnecter(page, IDENT_SANS_FICHE)
  await page.goto('/profil')

  await expect(
    page.getByText("Ce compte n'est relié à aucune fiche de suivi", { exact: false }),
  ).toBeVisible()
  // Pas de formulaire du tout : il n'y a aucune fiche à modifier.
  await expect(page.getByRole('button', { name: 'Enregistrer mes coordonnées' })).toHaveCount(0)
  // Mais le bloc d'identité du compte, lui, reste rendu : la page n'est pas vide.
  await expect(page.getByText(IDENT_SANS_FICHE, { exact: true })).toBeVisible()
})

test('le profil est protégé par la connexion', async ({ page }) => {
  await page.goto('/profil')
  await expect(page).toHaveURL(/\/connexion/)
})
