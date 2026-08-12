import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'

const IDENTIFIANT = 'test.e2e.annuaire'
const EMAIL = `${IDENTIFIANT}@asonkeng.local`
// Tiré à chaque exécution : jamais de mot de passe littéral dans un dépôt public.
const MDP = `Test-${crypto.randomUUID()}`

// Second compte, délibérément sans rôle administrateur : c'est celui qui éprouve le
// garde `exigerAdministrateur` sur le chemin d'écriture privilégié.
const IDENTIFIANT_SIMPLE = 'test.e2e.annuaire.simple'
const EMAIL_SIMPLE = `${IDENTIFIANT_SIMPLE}@asonkeng.local`
const MDP_SIMPLE = `Test-${crypto.randomUUID()}`

const NOM_MEMBRE = `ZZAnnuaire-${crypto.randomUUID().slice(0, 8)}`

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

async function supprimerCompte(identifiant: string, email: string) {
  const { data } = await admin.from('profils').select('id').eq('identifiant', identifiant).maybeSingle()
  if (data) {
    await admin.auth.admin.deleteUser(data.id)
    return
  }
  const { data: comptes } = await admin.auth.admin.listUsers()
  const orphelin = comptes?.users.find((u) => u.email === email)
  if (orphelin) await admin.auth.admin.deleteUser(orphelin.id)
}

async function nettoyer() {
  await admin.from('membres').delete().like('nom', 'ZZAnnuaire-%')
  await supprimerCompte(IDENTIFIANT, EMAIL)
  await supprimerCompte(IDENTIFIANT_SIMPLE, EMAIL_SIMPLE)
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

  // Compte simple, sans rôle administrateur : « Utilisateur » est le socle implicite
  // (voir `rolesDuProfil`), donc aucune ligne dans `roles_profil` ne suffit.
  const { data: donneesSimple, error: erreurSimple } = await admin.auth.admin.createUser({
    email: EMAIL_SIMPLE,
    password: MDP_SIMPLE,
    email_confirm: true,
  })
  if (erreurSimple || !donneesSimple.user) throw new Error(erreurSimple?.message)

  const { error: erreurProfilSimple } = await admin.from('profils').insert({
    id: donneesSimple.user.id,
    identifiant: IDENTIFIANT_SIMPLE,
    nom_affichage: 'Test annuaire simple',
  })
  if (erreurProfilSimple) {
    await admin.auth.admin.deleteUser(donneesSimple.user.id)
    throw new Error(`insertion du profil simple impossible : ${erreurProfilSimple.message}`)
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
  // Une ville contenant un point : c'est ce caractère qui cassait la requête
  // PostgREST avant le correctif de la tâche 5, preuve alors faite sur des fiches
  // temporaires depuis supprimées, et donc jamais rejouée depuis.
  await page.getByLabel('Ville').fill('St. Etienne')
  await page.getByRole('button', { name: 'Créer la fiche' }).click()

  await expect(page).toHaveURL(/\/membres/)
  await expect(page.getByText(`Jérôme ${NOM_MEMBRE}`)).toBeVisible()

  // La recherche doit retrouver la fiche par sa ville, y compris quand le terme
  // recherché contient lui-même un point.
  await page.getByLabel('Rechercher').fill('St.')
  await page.getByRole('button', { name: 'Filtrer' }).click()
  await expect(page.getByText(`Jérôme ${NOM_MEMBRE}`)).toBeVisible()

  // Et ne rien renvoyer pour une recherche qui ne correspond à personne.
  await page.getByLabel('Rechercher').fill('VilleQuiNExistePas')
  await page.getByRole('button', { name: 'Filtrer' }).click()
  await expect(page.getByText('Aucun membre ne correspond à cette recherche.')).toBeVisible()
})

/*
  Barrière d'accessibilité, pas un ornement. Un texte d'aide laissé DANS le <label>
  est concaténé au nom accessible du champ : un lecteur d'écran annonçait
  « AEL déjà suivis Avant la mise en service de l'application. » comme nom du champ.
  Vérifié dans un vrai navigateur avant correction, et verrouillé ici.

  Les trois assertions ne sont pas redondantes :
   1. le nom EXACT correspond — tombe si l'aide revient dans le <label> ;
   2. aucun champ ne porte l'aide dans son NOM — dit la faute d'origine en propre ;
   3. `aria-describedby` pointe sur un élément qui existe VRAIMENT et porte l'aide —
      sans elle, un identifiant mal orthographié laisserait les deux premières vertes
      tout en supprimant l'aide de l'arbre d'accessibilité, ce qui serait pire
      qu'avant.
*/
test('le champ « AEL déjà suivis » porte un nom accessible propre', async ({ page }) => {
  await seConnecter(page)
  await page.goto('/membres/nouveau')

  const champ = page.getByRole('spinbutton', { name: 'AEL déjà suivis', exact: true })
  await expect(champ).toHaveCount(1)

  await expect(
    page.getByRole('spinbutton', { name: /Avant la mise en service/ }),
  ).toHaveCount(0)

  const idAide = await champ.getAttribute('aria-describedby')
  expect(idAide, "le champ doit déclarer une description").toBeTruthy()
  // Sélecteur d'ATTRIBUT et non `#id` : `useId()` produit des identifiants qui
  // contiennent des caractères non valides dans un sélecteur CSS sans échappement.
  await expect(page.locator(`[id="${idAide}"]`)).toHaveText(/Avant la mise en service/)
})

test('une fiche archivée disparaît de l’annuaire', async ({ page }) => {
  await seConnecter(page)

  await page.goto('/membres')
  await page.getByText(`Jérôme ${NOM_MEMBRE}`).click()
  await expect(page.getByRole('heading', { name: `Jérôme ${NOM_MEMBRE}` })).toBeVisible()

  // On retient le message du dialogue au lieu de simplement l'accepter : sans cette
  // assertion, le test resterait vert si la confirmation venait à disparaître du
  // bouton, et rien ne protégerait plus contre un archivage en un seul clic.
  let messageConfirmation: string | null = null
  page.once('dialog', (dialogue) => {
    messageConfirmation = dialogue.message()
    return dialogue.accept()
  })

  await page.getByRole('button', { name: 'Archiver' }).click()
  await expect(page).toHaveURL(/\/membres$/)
  expect(messageConfirmation).toContain('Archiver la fiche')
  expect(messageConfirmation).toContain("rien n'est supprimé")
  await expect(page.getByText(`Jérôme ${NOM_MEMBRE}`)).toHaveCount(0)
})

test("l'annuaire pagine au-delà d'une page", async ({ page }) => {
  const PREFIXE_PAGINATION = `ZZPagination-${crypto.randomUUID().slice(0, 8)}`
  const lignes = Array.from({ length: 51 }, (_, i) => ({
    nom: `${PREFIXE_PAGINATION}-${String(i).padStart(3, '0')}`,
    prenom: 'Test',
  }))
  const { error: erreurInsertion } = await admin.from('membres').insert(lignes)
  // Vérifier l'insertion : une précondition qui échoue en silence rendrait ce test
  // vert pour de mauvaises raisons (défaut réel de la Task 10 de la 1b).
  expect(erreurInsertion).toBeNull()

  try {
    await seConnecter(page)
    await page.goto(`/membres?recherche=${PREFIXE_PAGINATION}`)

    await expect(page.getByRole('link', { name: /Test ZZPagination/ })).toHaveCount(50)
    await expect(page.getByRole('link', { name: 'Page suivante' })).toHaveCount(1)

    await page.getByRole('link', { name: 'Page suivante' }).click()
    await expect(page).toHaveURL(/page=2/)
    await expect(page.getByRole('link', { name: /Test ZZPagination/ })).toHaveCount(1)
    await expect(page.getByRole('link', { name: 'Page précédente' })).toHaveCount(1)

    // Le formulaire de filtre n'a pas de champ « page » caché : le soumettre depuis la
    // page 2 doit donc revenir à la page 1, plutôt que de garder une page qui n'a
    // peut-être plus de sens pour le nouveau résultat filtré. On vérifie le fait, pas
    // seulement l'intention : soumettre le même terme depuis la page 2 doit retomber
    // sur la première page (50 résultats), sans `page=` dans l'adresse.
    await page.getByLabel('Rechercher').fill(PREFIXE_PAGINATION)
    await page.getByRole('button', { name: 'Filtrer' }).click()
    await expect(page).not.toHaveURL(/page=/)
    await expect(page.getByRole('link', { name: /Test ZZPagination/ })).toHaveCount(50)
  } finally {
    const { error: erreurSuppression, count } = await admin
      .from('membres')
      .delete({ count: 'exact' })
      .like('nom', `${PREFIXE_PAGINATION}-%`)
    expect(erreurSuppression).toBeNull()
    expect(count).toBe(51)
  }
})

test("un compte non administrateur ne peut pas atteindre la création", async ({ page }) => {
  await page.goto('/connexion')
  await page.getByLabel('Identifiant').fill(IDENTIFIANT_SIMPLE)
  await page.getByLabel('Mot de passe').fill(MDP_SIMPLE)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page).toHaveURL(/\/tableau-de-bord/)

  // L'annuaire est ouvert à tout compte actif, mais sans le bouton de création.
  await page.goto('/membres')
  await expect(page.getByRole('link', { name: 'Nouveau membre' })).toHaveCount(0)

  // Et surtout : atteindre l'adresse directement doit être refusé. Masquer un lien
  // ne protège rien ; c'est le garde de la page qui protège, et c'est lui qu'on
  // éprouve ici. Sans ce test, la seule barrière du chemin d'écriture privilégié
  // n'était vérifiée nulle part.
  await page.goto('/membres/nouveau')
  await expect(page).toHaveURL(/\/tableau-de-bord/)

  await page.goto('/antennes')
  await expect(page).toHaveURL(/\/tableau-de-bord/)
})
