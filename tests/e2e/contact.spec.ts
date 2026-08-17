import { createClient } from '@supabase/supabase-js'
import { expect, test, type Page } from '@playwright/test'
import { identifiantVersEmail } from '../../src/lib/domaine/identifiant'

/**
 * Phase 7, D130 / D133 / D134 — le contact, de la saisie à l'affichage.
 *
 * ═══ CE QUE CETTE SUITE ÉPROUVE, ET QUE LES PREUVES RLS NE PEUVENT PAS ÉPROUVER ═══
 * `tests/rls/contact.test.ts` et `tests/rls/creation-enrichie.test.ts` établissent que la
 * colonne existe, que la passerelle l'écrit et qu'elle n'ouvre aucun droit. Aucun des deux
 * ne touche à l'ÉCRAN. Or trois affirmations de la phase ne vivent que là :
 *
 *   1. le champ est réellement atteignable À LA CRÉATION (la demande explicite de
 *      l'utilisateur), et pas seulement en modification ;
 *   2. la fiche ne porte plus DEUX lignes nommées « Contact » (D133) ;
 *   3. la ligne « Contact » ne porte PAS le rail de filiation, alors que « Faiseur de
 *      disciple » et « Dirigeant » le portent (D134).
 *
 * La troisième est une assertion sur une CLASSE CSS, ce que ce dépôt évite d'ordinaire.
 * Elle est écrite quand même : D106 déclare trois emplacements légitimes et uniquement
 * trois, et c'est le genre de règle qu'une relecture distraite « corrige » en ajoutant la
 * marque partout. Sans cette preuve, la régression serait invisible.
 */

test.describe.configure({ mode: 'serial' })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const MDP = `Test-${crypto.randomUUID()}`
const IDENT_ADMIN = 'test.e2e.contact.admin'

// PRÉFIXE DE FAMILLE STABLE : retrouvable après une interruption.
const PREFIXE_FAMILLE = 'ZZContactE2E-'
const PREFIXE = `${PREFIXE_FAMILLE}${crypto.randomUUID().slice(0, 8)}`
const NOM_TEMOIN = `${PREFIXE}-temoin`
const NOM_SUIVI = `${PREFIXE}-suivi`

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

async function creerCompte(identifiant: string, roles: string[]): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email: identifiantVersEmail(identifiant),
    password: MDP,
    email_confirm: true,
  })
  if (error || !data.user) {
    throw new Error(`création du compte ${identifiant} impossible : ${error?.message}`)
  }
  const { error: erreurProfil } = await admin
    .from('profils')
    .insert({ id: data.user.id, identifiant, nom_affichage: `Test contact ${identifiant}` })
  if (erreurProfil) {
    await admin.auth.admin.deleteUser(data.user.id)
    throw new Error(`insertion du profil ${identifiant} impossible : ${erreurProfil.message}`)
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
  await page.getByLabel('Mot de passe').fill(MDP)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page).toHaveURL(/\/tableau-de-bord/)
}

/** La ligne du `<dl>` de la fiche portant cet intitulé, quel qu'y soit le contenu. */
function ligneFiche(page: Page, intitule: string) {
  return page.locator('dl > div').filter({ has: page.getByText(intitule, { exact: true }) })
}

test.beforeAll(async () => {
  await admin.from('membres').delete().like('nom', `${PREFIXE_FAMILLE}%`)
  await supprimerCompte(IDENT_ADMIN)
  await creerCompte(IDENT_ADMIN, ['administrateur'])

  const { error } = await admin
    .from('membres')
    .insert({ nom: NOM_TEMOIN, prenom: 'Temoin', etat: 'actif' })
  if (error) throw new Error(`création du témoin impossible : ${error.message}`)
})

test.afterAll(async () => {
  // `contact_id` est en `on delete set null` : aucun ordre de suppression à respecter, à la
  // différence d'`antenne_id` qui est en `restrict`.
  await admin.from('membres').delete().like('nom', `${PREFIXE_FAMILLE}%`)
  await supprimerCompte(IDENT_ADMIN)

  // COMPTAGE DE CONTRÔLE, indépendant du balayage. `count === null` n'est pas toléré : un
  // comptage absent passerait pour « rien à nettoyer ».
  const { count, error } = await admin
    .from('membres')
    .select('id', { count: 'exact', head: true })
    .like('nom', `${PREFIXE_FAMILLE}%`)
  if (error) throw new Error(`comptage de contrôle impossible : ${error.message}`)
  expect(count).toBe(0)
})

test("un administrateur désigne un contact À LA CRÉATION, et le relit sur la fiche", async ({
  page,
}) => {
  await seConnecter(page, IDENT_ADMIN)
  await page.goto('/membres/nouveau')

  await page.getByLabel('Prénom (obligatoire)').fill('Suivi')
  // `exact` : « Nom (obligatoire) » est une SOUS-CHAÎNE de « Prénom (obligatoire) », et la
  // recherche par libellé de Playwright est partielle par défaut.
  await page.getByLabel('Nom (obligatoire)', { exact: true }).fill(NOM_SUIVI)

  // LE CHAMP EST BIEN SUR L'ÉCRAN DE CRÉATION — la demande explicite de l'utilisateur.
  // `SelecteurMembre` est un combobox : on tape, on attend le résultat, on le choisit.
  await page.getByLabel('Contact', { exact: true }).fill(NOM_TEMOIN)
  await page.getByRole('button', { name: `Temoin ${NOM_TEMOIN}` }).click()

  await page.getByRole('button', { name: 'Créer la fiche' }).click()

  // Redirection vers la fiche créée.
  await expect(page).toHaveURL(/\/membres\/[0-9a-f-]{36}$/)
  await expect(ligneFiche(page, 'Contact')).toContainText(`Temoin ${NOM_TEMOIN}`)

  // La base porte réellement la valeur — l'écran pourrait afficher un nom sans qu'il ait
  // été écrit.
  const { data, error } = await admin
    .from('membres')
    .select('contact_id')
    .eq('nom', NOM_SUIVI)
    .single()
  if (error) throw new Error(`relecture impossible : ${error.message}`)
  const { data: temoin, error: erreurTemoin } = await admin
    .from('membres')
    .select('id')
    .eq('nom', NOM_TEMOIN)
    .single()
  if (erreurTemoin) throw new Error(`lecture du témoin impossible : ${erreurTemoin.message}`)
  // L'identifiant EXACT, et pas seulement « non nul » : une écriture qui viserait la
  // mauvaise fiche passerait un `not.toBeNull()`.
  expect(data?.contact_id).toBe(temoin.id)
})

test("la fiche ne porte plus deux lignes « Contact » (D133)", async ({ page }) => {
  await seConnecter(page, IDENT_ADMIN)
  const { data, error } = await admin.from('membres').select('id').eq('nom', NOM_SUIVI).single()
  if (error) throw new Error(`lecture de la fiche impossible : ${error.message}`)
  await page.goto(`/membres/${data.id}`)

  // UNE SEULE ligne intitulée exactement « Contact » — celle de la PERSONNE.
  await expect(ligneFiche(page, 'Contact')).toHaveCount(1)
  // Et l'adresse e-mail porte désormais son propre libellé, celui du formulaire.
  await expect(ligneFiche(page, 'Adresse de contact')).toHaveCount(1)
})

test('la ligne « Contact » ne porte PAS le rail de filiation (D134)', async ({ page }) => {
  await seConnecter(page, IDENT_ADMIN)
  const { data, error } = await admin.from('membres').select('id').eq('nom', NOM_SUIVI).single()
  if (error) throw new Error(`lecture de la fiche impossible : ${error.message}`)
  await page.goto(`/membres/${data.id}`)

  // Les DEUX relations de discipulat la portent…
  await expect(ligneFiche(page, 'Faiseur de disciple')).toHaveClass(/rail-filiation/)
  await expect(ligneFiche(page, 'Dirigeant')).toHaveClass(/rail-filiation/)
  // …et le contact, non. Les deux moitiés comptent : sans la première, la preuve passerait
  // aussi si la classe avait disparu de tout l'écran.
  await expect(ligneFiche(page, 'Contact')).not.toHaveClass(/rail-filiation/)
})

test('le contact se modifie ensuite depuis la fiche, et se détache', async ({ page }) => {
  await seConnecter(page, IDENT_ADMIN)
  const { data, error } = await admin.from('membres').select('id').eq('nom', NOM_SUIVI).single()
  if (error) throw new Error(`lecture de la fiche impossible : ${error.message}`)

  await page.goto(`/membres/${data.id}/modifier`)
  // Le contact déjà désigné est AFFICHÉ dans le sélecteur — c'est ce que `contactInitial`
  // sert : le composant client ne peut pas résoudre le nom lui-même.
  await expect(page.getByText(`Temoin ${NOM_TEMOIN}`)).toBeVisible()

  await page.getByRole('button', { name: 'Détacher' }).click()
  await page.getByRole('button', { name: 'Enregistrer les modifications' }).click()

  await expect(page).toHaveURL(/\/membres\/[0-9a-f-]{36}$/)
  await expect(ligneFiche(page, 'Contact')).toContainText('—')

  const { data: apres, error: erreurApres } = await admin
    .from('membres')
    .select('contact_id')
    .eq('id', data.id)
    .single()
  if (erreurApres) throw new Error(`relecture impossible : ${erreurApres.message}`)
  expect(apres?.contact_id).toBeNull()
})
