import { createClient } from '@supabase/supabase-js'
import { expect, test, type Page } from '@playwright/test'

test.describe.configure({ mode: 'serial' })

// `profils_identifiant_format` limite l'identifiant à 32 caractères
// (`^[a-z][a-z0-9.-]{2,31}$`, voir tests/e2e/evenements-types.spec.ts).
const IDENT_ADMIN = 'test.e2e.evliste.admin'
const IDENT_MODERATEUR = 'test.e2e.evliste.mod'
const IDENT_SIMPLE = 'test.e2e.evliste.simple'
const MDP_ADMIN = `Test-${crypto.randomUUID()}`
const MDP_MODERATEUR = `Test-${crypto.randomUUID()}`
const MDP_SIMPLE = `Test-${crypto.randomUUID()}`
// M9 DE LA REVUE FINALE — NETTOYAGE SUR LA FAMILLE, PAS SUR LE SUFFIXE ALÉATOIRE.
// Le suffixe évite une collision entre deux exécutions ; le BALAYAGE, lui, doit porter sur
// la FAMILLE, sans quoi une seule exécution interrompue laisse en base de PRODUCTION des
// lignes que plus rien ne retrouvera jamais — leur suffixe étant mort avec le processus.
// La revue signale que ce défaut se nourrit d'un autre : `test.e2e.autorite.lie` fuit sous
// exécution CONCURRENTE, et c'est exactement une exécution concurrente interrompue qui
// produit des résidus. Convention reprise de `tests/rls/evenements.test.ts:14-19`.
// TIRET LITTÉRAL dans la famille : `ZZEvListe-%` ne peut pas ramasser une famille voisine
// qui commencerait par les mêmes lettres.
const FAMILLE = 'ZZEvListe-'
const PREFIXE = `${FAMILLE}${crypto.randomUUID().slice(0, 8)}`
const TYPE_LIBELLE = 'Séminaire académique'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const ALERTE = '[role="alert"]:not(#__next-route-announcer__)'

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
  const { error } = await admin.from('evenements').delete().like('titre', `${FAMILLE}%`)
  if (error) throw new Error(`nettoyage des évènements impossible : ${error.message}`)
  await supprimerCompte(IDENT_ADMIN)
  await supprimerCompte(IDENT_MODERATEUR)
  await supprimerCompte(IDENT_SIMPLE)
}

/** NETTOYAGE VÉRIFIÉ PAR COMPTAGE, sur la MÊME famille que la suppression (M9). */
async function verifierAucunResidu() {
  const { count, error } = await admin
    .from('evenements')
    .select('id', { count: 'exact', head: true })
    .like('titre', `${FAMILLE}%`)
  if (error) throw new Error(`comptage des résidus impossible : ${error.message}`)
  expect(count, 'résidu dans evenements').toBe(0)
}

async function creerCompte(identifiant: string, mdp: string, role: 'administrateur' | 'moderateur' | null) {
  const { data, error } = await admin.auth.admin.createUser({
    email: `${identifiant}@asonkeng.local`,
    password: mdp,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(error?.message)

  const { error: erreurProfil } = await admin
    .from('profils')
    .insert({ id: data.user.id, identifiant, nom_affichage: `Test ${identifiant}` })
  if (erreurProfil) {
    await admin.auth.admin.deleteUser(data.user.id)
    throw new Error(`insertion du profil impossible : ${erreurProfil.message}`)
  }

  if (role) {
    const { error: erreurRole } = await admin.from('roles_profil').insert({ profil_id: data.user.id, role })
    if (erreurRole) {
      await admin.auth.admin.deleteUser(data.user.id)
      throw new Error(`attribution du rôle impossible : ${erreurRole.message}`)
    }
  }
}

// M3 — TÉMOIN DE LISTE NON VIDE. Le premier test de ce fichier s'exécute AVANT que le
// moindre évènement de la famille n'existe (ils sont créés par les tests suivants) : c'est
// ce qui avait conduit à un contrôle positif inerte, satisfait par « Aucun évènement pour le
// moment. » Ce témoin existe donc dès le montage, et il porte le PRÉFIXE, donc `nettoyer()`
// le ramasse avec le reste.
const TITRE_VISIBLE_PAR_TOUS = `${PREFIXE}-Temoin`

test.beforeAll(async () => {
  await nettoyer()
  await creerCompte(IDENT_ADMIN, MDP_ADMIN, 'administrateur')
  await creerCompte(IDENT_MODERATEUR, MDP_MODERATEUR, 'moderateur')
  await creerCompte(IDENT_SIMPLE, MDP_SIMPLE, null)

  const { data: type, error: erreurType } = await admin
    .from('types_evenement')
    .select('id')
    .eq('libelle', TYPE_LIBELLE)
    .single()
  if (erreurType || !type) throw new Error(`type « ${TYPE_LIBELLE} » introuvable : ${erreurType?.message}`)
  const { error: erreurTemoin } = await admin
    .from('evenements')
    .insert({ titre: TITRE_VISIBLE_PAR_TOUS, type_id: type.id as string, date_debut: '2026-09-20' })
  if (erreurTemoin) throw new Error(`création du témoin impossible : ${erreurTemoin.message}`)
})

test.afterAll(async () => {
  await nettoyer()
  await verifierAucunResidu()
})

async function seConnecter(page: Page, identifiant: string, mdp: string) {
  await page.goto('/connexion')
  await page.getByLabel('Identifiant').fill(identifiant)
  await page.getByLabel('Mot de passe', { exact: true }).fill(mdp)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page).toHaveURL(/\/tableau-de-bord/)
}

/** Le formulaire de création, scopé : la page porte AUSSI un <select> « Type » dans le
 * filtre GET, et `getByLabel('Type')` seul serait ambigu. */
function formulaireCreation(page: Page) {
  return page.locator('details').filter({ has: page.getByRole('button', { name: 'Créer' }) })
}

async function ouvrirNouvelEvenement(page: Page) {
  await page.getByText('Nouvel évènement').click()
}

async function evenementExiste(titre: string): Promise<boolean> {
  const { data, error } = await admin.from('evenements').select('id').eq('titre', titre)
  if (error) throw new Error(`lecture de evenements impossible : ${error.message}`)
  return (data ?? []).length > 0
}

test("un compte simple voit la liste, sans le bloc de création ni le lien réservé au modérateur/administrateur", async ({
  page,
}) => {
  await seConnecter(page, IDENT_SIMPLE, MDP_SIMPLE)
  await page.goto('/evenements')

  // Contrôle POSITIF : la page fonctionne réellement pour ce compte (pas une page cassée
  // qui masquerait tout par accident).
  await expect(page.getByRole('heading', { name: 'Évènements' })).toBeVisible()
  // M3 DE LA REVUE FINALE — LE CONTRÔLE POSITIF ÉTAIT INERTE. Il lisait
  // `page.getByText(/évènement/).first()`, satisfait aussi bien par « Aucun évènement pour
  // le moment. » (page.tsx:111) que par « 0 évènement » (page.tsx:107) : il aurait été vert
  // sur une liste que ce compte ne voit PAS DU TOUT, c'est-à-dire dans le cas même qu'il
  // était censé écarter. On assère désormais que l'évènement CRÉÉ PAR CE FICHIER est
  // réellement rendu — une chaîne qui ne peut apparaître que si la liste est peuplée et
  // lisible par ce compte.
  await expect(page.getByText(TITRE_VISIBLE_PAR_TOUS)).toBeVisible()

  await expect(page.getByText('Nouvel évènement')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Participants à traiter' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Gérer les types' })).toHaveCount(0)
})

test('un modérateur crée un évènement, qui redirige vers sa fiche', async ({ page }) => {
  const titre = `${PREFIXE}-Moderateur`
  await seConnecter(page, IDENT_MODERATEUR, MDP_MODERATEUR)
  await page.goto('/evenements')

  // Positif : le bloc de création EST là, contrairement au compte simple ci-dessus.
  await expect(page.getByText('Nouvel évènement')).toBeVisible()
  // ÉCART SIGNALÉ (pas corrigé en silence) : l'étape 6 du brief dit « Administrateur :
  // idem, PLUS le lien "Gérer les types" », donnant à penser que ce lien serait absent
  // pour un modérateur. Le code du brief, lui, le rend dès que `peutGerer` est vrai —
  // soit modérateur OU administrateur (même condition que le bloc « Nouvel évènement »)
  // — donc un modérateur LE VOIT AUSSI. Constaté à l'exécution : ce n'est pas une faille
  // de sécurité (`/evenements/types` reste gardée par `exigerAdministrateur()`, page ET
  // Server Actions, Task 16), seulement un lien affiché qui redirigera un modérateur qui
  // le suit. Ce test vérifie donc la réalité du code livré, pas la phrase du brief.
  await expect(page.getByRole('link', { name: 'Gérer les types' })).toBeVisible()

  await ouvrirNouvelEvenement(page)
  const formulaire = formulaireCreation(page)
  await formulaire.getByLabel('Titre').fill(titre)
  await formulaire.getByLabel('Type').selectOption({ label: TYPE_LIBELLE })
  await formulaire.getByLabel('Date de début').fill('2026-09-01')
  await formulaire.getByRole('button', { name: 'Créer' }).click()

  // La redirection cible `/evenements/<id>` : cette page n'existe qu'à partir de la
  // Task 18 (`src/app/evenements/[id]/page.tsx`, pas encore livrée à ce stade). On
  // vérifie donc ici l'EFFET qui appartient à cette tâche — la redirection elle-même et
  // l'écriture en base — pas le rendu de la fiche, hors périmètre de la Task 17.
  await expect(page).toHaveURL(/\/evenements\/[0-9a-f-]{36}$/)
  expect(await evenementExiste(titre)).toBe(true)
})

test("un administrateur voit en plus le lien « Gérer les types » et peut créer un évènement", async ({ page }) => {
  const titre = `${PREFIXE}-Admin`
  await seConnecter(page, IDENT_ADMIN, MDP_ADMIN)
  await page.goto('/evenements')

  await expect(page.getByRole('link', { name: 'Gérer les types' })).toBeVisible()

  await ouvrirNouvelEvenement(page)
  const formulaire = formulaireCreation(page)
  await formulaire.getByLabel('Titre').fill(titre)
  await formulaire.getByLabel('Type').selectOption({ label: TYPE_LIBELLE })
  await formulaire.getByLabel('Date de début').fill('2026-09-02')
  await formulaire.getByRole('button', { name: 'Créer' }).click()

  await expect(page).toHaveURL(/\/evenements\/[0-9a-f-]{36}$/)
  expect(await evenementExiste(titre)).toBe(true)
})

test('une date de fin antérieure à la date de début est refusée avec un message clair, et la saisie est conservée', async ({
  page,
}) => {
  const titre = `${PREFIXE}-PeriodeIncoherente`
  await seConnecter(page, IDENT_MODERATEUR, MDP_MODERATEUR)
  await page.goto('/evenements')
  await ouvrirNouvelEvenement(page)
  const formulaire = formulaireCreation(page)

  await formulaire.getByLabel('Titre').fill(titre)
  await formulaire.getByLabel('Type').selectOption({ label: TYPE_LIBELLE })
  await formulaire.getByLabel('Date de début').fill('2026-09-10')
  await formulaire.getByLabel('Date de fin').fill('2026-09-05')
  await formulaire.getByLabel('Lieu').fill('Yaoundé')
  await formulaire.getByRole('button', { name: 'Créer' }).click()

  await expect(formulaire.locator(ALERTE)).toContainText(
    'La date de fin ne peut pas précéder la date de début.',
  )
  // La saisie n'est PAS perdue : sans quoi le modérateur devrait tout retaper. Défaut
  // trouvé et corrigé à la Task 16 sur un formulaire jumeau (React réinitialise un
  // <form action={...}> non contrôlé dès qu'une action se termine sans lever, refus
  // métier RETOURNÉ compris) — ce test verrouille que la même correction tient ici.
  await expect(formulaire.getByLabel('Titre')).toHaveValue(titre)
  await expect(formulaire.getByLabel('Date de début')).toHaveValue('2026-09-10')
  await expect(formulaire.getByLabel('Date de fin')).toHaveValue('2026-09-05')
  await expect(formulaire.getByLabel('Lieu')).toHaveValue('Yaoundé')

  expect(await evenementExiste(titre)).toBe(false)
})

// --- Requête forgée contre creerEvenement --------------------------------------

function decoderEntitesHtml(valeur: string): string {
  return valeur
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function extraireChampsCaches(formHtml: string): Record<string, string> {
  const champs: Record<string, string> = {}
  const regex = /<input type="hidden" name="([^"]+)"(?:\s+value="([^"]*)")?/g
  let correspondance: RegExpExecArray | null
  while ((correspondance = regex.exec(formHtml))) {
    champs[decoderEntitesHtml(correspondance[1])] = decoderEntitesHtml(correspondance[2] ?? '')
  }
  return champs
}

function verifierCaptureAction(champs: Record<string, string>): void {
  const trouve = Object.keys(champs).some((nom) => nom.startsWith('$ACTION'))
  if (!trouve) {
    throw new Error(
      `Capture invalide : aucun champ « $ACTION* » parmi ${JSON.stringify(Object.keys(champs))}. ` +
        "L'encodage des Server Actions a peut-être changé — ce test ne peut plus prouver ce qu'il prétend.",
    )
  }
}

async function typeIdParLibelle(libelle: string): Promise<string> {
  const { data, error } = await admin.from('types_evenement').select('id').eq('libelle', libelle).single()
  if (error || !data) throw new Error(`type « ${libelle} » introuvable : ${error?.message}`)
  return data.id as string
}

test("un compte simple ne peut pas créer d'évènement par une requête forgée ; le même rejeu réussit en modérateur (canari)", async ({
  page,
  browser,
  baseURL,
}) => {
  const titreForge = `${PREFIXE}-Forge`
  expect(await evenementExiste(titreForge)).toBe(false)
  const typeId = await typeIdParLibelle(TYPE_LIBELLE)

  // Capturé depuis une session qui A le droit (le formulaire ne se rend qu'à elle) : même
  // motif que tests/e2e/autorite.spec.ts (`capturerChampsAttribution`).
  await seConnecter(page, IDENT_MODERATEUR, MDP_MODERATEUR)
  await page.goto('/evenements')
  await ouvrirNouvelEvenement(page)
  const formulaire = formulaireCreation(page)
  const champs = extraireChampsCaches(await formulaire.locator('form').evaluate((el) => el.outerHTML))
  verifierCaptureAction(champs)

  const contexteSimple = await browser.newContext({ baseURL })
  try {
    const pageSimple = await contexteSimple.newPage()
    await seConnecter(pageSimple, IDENT_SIMPLE, MDP_SIMPLE)

    await pageSimple.request.post('/evenements', {
      multipart: { ...champs, titre: titreForge, typeId, dateDebut: '2026-09-15' },
    })

    // Seule assertion qui compte : aucune ligne créée, quel qu'ait été le code HTTP (la
    // réponse d'un `redirect()` réussi ou d'un refus se ressemblent trop pour en tirer
    // quoi que ce soit ici).
    expect(await evenementExiste(titreForge)).toBe(false)
  } finally {
    await contexteSimple.close()
  }

  // Canari : exactement le même mécanisme, depuis une session modératrice, doit réussir.
  await page.request.post('/evenements', {
    multipart: { ...champs, titre: titreForge, typeId, dateDebut: '2026-09-15' },
  })
  expect(await evenementExiste(titreForge)).toBe(true)
})
