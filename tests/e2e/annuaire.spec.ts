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

/**
 * Ouvre l'annuaire FILTRÉ sur un terme, au lieu de lire sa première page.
 *
 * ═══ POURQUOI CE DÉTOUR EST NÉCESSAIRE, ET DEPUIS QUAND ═══
 * Trois assertions de ce fichier faisaient `goto('/membres')` puis cherchaient la fiche
 * `ZZAnnuaire-…` sur la page ainsi obtenue. Cela n'a JAMAIS été correct : l'annuaire pagine
 * à `TAILLE_PAGE_ANNUAIRE` (50) et trie par nom, or un nom commençant par « ZZ » trie en
 * DERNIER. Tant que la base comptait moins de cinquante membres actifs, la première page les
 * contenait tous et personne ne pouvait le voir. La base réelle en compte désormais 72 : la
 * fiche est en page 2, et les trois assertions se sont mises à mentir.
 *
 * ═══ DEUX DES TROIS ÉCHOUAIENT BRUYAMMENT. LA TROISIÈME ÉTAIT UN FAUX VERT ═══
 * Après archivage, `expect(getByText(nom)).toHaveCount(0)` passait — non parce que la fiche
 * avait disparu de l'annuaire, mais parce qu'elle n'avait jamais été sur la page regardée.
 * L'assertion la plus importante du test (« une fiche archivée disparaît ») ne prouvait donc
 * plus rien, et aurait continué à passer si l'archivage avait cessé de fonctionner.
 *
 * Ce correctif est ÉTRANGER à la phase 7 : il est fait ici parce que la porte du lot A l'a
 * mis au jour, et qu'un test qui ne peut plus échouer ne vaut pas mieux que pas de test.
 */
async function ouvrirAnnuaireFiltre(page: import('@playwright/test').Page, terme: string) {
  await page.goto('/membres')
  await page.getByLabel('Rechercher').fill(terme)
  await page.getByRole('button', { name: 'Filtrer' }).click()
  // On attend que le filtre soit RÉELLEMENT appliqué avant d'asserter quoi que ce soit :
  // sans cela, une assertion d'absence pourrait porter sur la page non filtrée.
  await expect(page).toHaveURL(/recherche=/)
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

  // La création REDIRIGE désormais vers la FICHE (phase 5) et non vers l'annuaire : on
  // vient d'enrichir cette personne, c'est son écran qui montre ce qui a été écrit.
  // L'assertion porte sur le TITRE de la fiche — un `getByText` du seul nom serait aussi
  // satisfait par une ligne d'annuaire, et ne distinguerait donc pas les deux écrans.
  await expect(page).toHaveURL(/\/membres\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { name: `Jérôme ${NOM_MEMBRE}` })).toBeVisible()

  // Puis l'annuaire, pour la suite du test : c'est lui qui porte la recherche.
  // FILTRÉ sur le nom, et non la première page brute : voir `ouvrirAnnuaireFiltre`.
  await ouvrirAnnuaireFiltre(page, NOM_MEMBRE)
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

  await ouvrirAnnuaireFiltre(page, NOM_MEMBRE)
  await page.getByText(`Jérôme ${NOM_MEMBRE}`).click()
  await expect(page.getByRole('heading', { name: `Jérôme ${NOM_MEMBRE}` })).toBeVisible()

  // On retient le message du dialogue au lieu de simplement l'accepter : sans cette
  // assertion, le test resterait vert si la confirmation venait à disparaître du
  // bouton, et rien ne protégerait plus contre un archivage en un seul clic.
  //
  // Task 15 (D124) : `window.confirm` est remplacé par le `<dialog>` natif de
  // `Dialogue` — le clic n'ouvre plus qu'un dialogue, il ne soumet plus rien tout seul.
  // Le message est lu dans le DOM (`<p>` du dialogue OUVERT) au lieu de
  // `dialogue.message()`, puis « Confirmer » est cliqué explicitement.
  await page.getByRole('button', { name: 'Archiver' }).click()
  const dialogueOuvert = page.locator('dialog[open]')
  const messageConfirmation = await dialogueOuvert.locator('p').first().innerText()
  await dialogueOuvert.getByRole('button', { name: 'Confirmer' }).click()

  await expect(page).toHaveURL(/\/membres$/)
  expect(messageConfirmation).toContain('Archiver la fiche')
  expect(messageConfirmation).toContain("rien n'est supprimé")

  // ⚠️ L'ASSERTION LA PLUS IMPORTANTE DE CE TEST, ET ELLE ÉTAIT UN FAUX VERT.
  // Elle portait sur la première page brute de l'annuaire, où cette fiche n'avait jamais
  // figuré (nom en « ZZ », 72 membres actifs, 50 par page) : elle passait donc quoi qu'il
  // arrive, et serait restée verte si l'archivage avait cessé de retirer la fiche.
  // On la FILTRE désormais sur le nom — la recherche ne rend que les fiches ACTIVES, donc
  // zéro résultat signifie réellement « archivée et sortie de l'annuaire ».
  await ouvrirAnnuaireFiltre(page, NOM_MEMBRE)
  await expect(page.getByText(`Jérôme ${NOM_MEMBRE}`)).toHaveCount(0)
  // Contrôle POSITIF du filtre : sans lui, un filtre cassé rendrait « aucun résultat » pour
  // toute recherche, et l'assertion ci-dessus passerait pour la mauvaise raison.
  await expect(page.getByText('Aucun membre ne correspond à cette recherche.')).toBeVisible()
})

test("l'annuaire pagine au-delà d'une page", async ({ page }) => {
  // Balayage de FAMILLE préventif (I6 de la ronde de correction, même défaut que
  // `tests/e2e/ael-pointage.spec.ts` : `PREFIXE_PAGINATION` embarque un identifiant
  // tiré À CETTE EXÉCUTION) : sans lui, une exécution antérieure interrompue APRÈS
  // l'insertion des 51 lignes mais AVANT le `finally` ci-dessous laisserait ces lignes
  // définitivement en base, introuvables par un run ultérieur qui tire un nouveau
  // suffixe. Balayer AVANT d'insérer garde aussi `count === 51` (plus bas) vrai — il ne
  // resterait sinon plus que les lignes de CETTE exécution au moment du comptage.
  const { error: erreurBalayage } = await admin.from('membres').delete().like('nom', 'ZZPagination-%')
  expect(erreurBalayage).toBeNull()

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

    // Une adresse pointant au-delà de la dernière page réelle (signet périmé, résultat
    // qui a rétréci) doit se corriger vers la dernière page réelle, pas afficher un
    // écran qui se contredit lui-même — l'en-tête annonçant « 51 membres » pendant que
    // le corps affirmerait qu'aucun membre ne correspond. Ce jeu n'a que 2 pages ;
    // page=99 doit donc retomber sur la page 2, avec son unique résultat affiché.
    await page.goto(`/membres?recherche=${PREFIXE_PAGINATION}&page=99`)
    await expect(page).toHaveURL(/page=2/)
    await expect(page.getByRole('link', { name: /Test ZZPagination/ })).toHaveCount(1)
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
