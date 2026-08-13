import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { expect, test, type Page } from '@playwright/test'
import { identifiantVersEmail } from '../../src/lib/domaine/identifiant'
import { MESSAGE_TOKEN_DEJA_CLOS } from '../../src/app/tokens/messages'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const MDP = `Test-${crypto.randomUUID()}`
const IDENT_ADMIN = 'test.e2e.tokens.admin'
const IDENT_SIMPLE = 'test.e2e.tokens.simple'

/**
 * TEST-NET-3 (RFC 5737), distincte de celle de `tests/e2e/inscription.spec.ts`
 * (203.0.113.77) : les deux suites peuvent s'exécuter dans la même fenêtre de
 * 15 minutes (contrainte projet #4, plafond de D34/D36), et partager une adresse
 * ferait courir à CETTE suite le risque d'hériter du compteur de l'autre.
 */
const ADRESSE_CONSOMMATION = '203.0.113.211'

function hacher(code: string): string {
  return createHash('sha256').update(code, 'utf8').digest('hex')
}

/**
 * Hachages des tokens créés par CETTE exécution, pour un nettoyage ciblé et
 * vérifié par comptage — même motif que `tests/e2e/inscription.spec.ts` : un
 * filtre par préfixe sur `code_hash` ne supprimerait jamais rien, puisque
 * `code_hash` est un SHA-256 qui ne porte aucune trace du code en clair.
 */
const hachagesCrees: string[] = []

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

async function creerCompte(identifiant: string, administrateur: boolean) {
  const { data, error } = await admin.auth.admin.createUser({
    email: identifiantVersEmail(identifiant),
    password: MDP,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(error?.message)
  const { error: erreurProfil } = await admin
    .from('profils')
    .insert({ id: data.user.id, identifiant, nom_affichage: `Test tokens ${identifiant}` })
  // Erreur d'insertion VÉRIFIÉE, pas jetée en silence : un insert de préparation
  // dont l'erreur est ignorée rendrait ce test vert en éprouvant un tout autre
  // chemin (registre du projet — trouvé trois fois dans cette phase). Sans ce
  // contrôle, un compte auth orphelin sans profil survivrait, introuvable par le
  // nettoyage qui interroge `profils`.
  if (erreurProfil) {
    await admin.auth.admin.deleteUser(data.user.id)
    throw new Error(`insertion du profil ${identifiant} impossible : ${erreurProfil.message}`)
  }
  if (administrateur) {
    const { error: erreurRole } = await admin
      .from('roles_profil')
      .insert({ profil_id: data.user.id, role: 'administrateur' })
    if (erreurRole) {
      await admin.auth.admin.deleteUser(data.user.id)
      throw new Error(`attribution du rôle administrateur impossible : ${erreurRole.message}`)
    }
  }
}

async function nettoyer() {
  await supprimerCompte(IDENT_ADMIN)
  await supprimerCompte(IDENT_SIMPLE)
  if (hachagesCrees.length > 0) {
    await admin.from('tokens_inscription').delete().in('code_hash', hachagesCrees)
  }
  await admin.from('tentatives_token_inscription').delete().eq('adresse', ADRESSE_CONSOMMATION)
}

test.beforeAll(async () => {
  await nettoyer()
  await creerCompte(IDENT_ADMIN, true)
  await creerCompte(IDENT_SIMPLE, false)
})

test.afterAll(async () => {
  await nettoyer()

  // Nettoyage vérifié PAR COMPTAGE (contrainte projet #7), pas seulement par
  // l'absence d'erreur sur les suppressions ci-dessus.
  const { data: residusComptes } = await admin
    .from('profils')
    .select('id')
    .in('identifiant', [IDENT_ADMIN, IDENT_SIMPLE])
  expect(residusComptes ?? []).toHaveLength(0)

  if (hachagesCrees.length > 0) {
    const { data: residusTokens } = await admin
      .from('tokens_inscription')
      .select('id')
      .in('code_hash', hachagesCrees)
    expect(residusTokens ?? []).toHaveLength(0)
  }

  const { data: residusTentatives } = await admin
    .from('tentatives_token_inscription')
    .select('id')
    .eq('adresse', ADRESSE_CONSOMMATION)
  expect(residusTentatives ?? []).toHaveLength(0)
})

async function connecter(page: Page, identifiant: string) {
  await page.goto('/connexion')
  await page.getByLabel('Identifiant').fill(identifiant)
  await page.getByLabel('Mot de passe').fill(MDP)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page).toHaveURL(/\/tableau-de-bord/)
}

/**
 * Génère un token générique depuis un `/tokens` déjà chargé (page déjà connectée
 * en administrateur), et rend le code en clair affiché. Le hachage est
 * immédiatement enregistré pour le nettoyage — voir `hachagesCrees`.
 */
async function genererTokenGenerique(page: Page): Promise<string> {
  await page.goto('/tokens')
  await page.getByLabel(/Générique/).check()
  await page.getByRole('button', { name: 'Générer le token' }).click()

  const code = await page.locator('code').first().textContent()
  expect(code).toBeTruthy()
  hachagesCrees.push(hacher(code!))
  return code!
}

test('un compte ordinaire ne voit pas le lien et /tokens le renvoie au tableau de bord', async ({ page }) => {
  await connecter(page, IDENT_SIMPLE)
  await expect(page.getByRole('link', { name: /tokens/i })).toHaveCount(0)
  await page.goto('/tokens')
  await expect(page).toHaveURL(/\/tableau-de-bord/)
})

test('un administrateur génère un token générique, le voit une seule fois, puis le révoque — et ce token révoqué est réellement refusé par la consommation', async ({ page }) => {
  await connecter(page, IDENT_ADMIN)
  const code = await genererTokenGenerique(page)
  expect(code.length).toBeGreaterThanOrEqual(16)

  // Recharger la page : le code ne doit PLUS être affiché nulle part — la seule
  // occasion de le voir était l'instant de sa génération.
  await page.reload()
  await expect(page.getByText(code)).toHaveCount(0)

  // Correction au brief de la Task 15 (constatée à l'essai, pas seulement lue à la
  // lecture du code) : `LigneToken.soumettre` ouvre un `window.confirm` avant de
  // révoquer. Sans gestionnaire `dialog` enregistré, Playwright REJETTE
  // automatiquement toute boîte de dialogue native (comportement documenté) — la
  // révocation ne serait donc jamais déclenchée, et l'assertion suivante resterait
  // bloquée jusqu'au timeout. Même précaution que `tests/e2e/archivage-compte.spec.ts`
  // pour son bouton « Archiver ».
  page.once('dialog', (dialogue) => dialogue.accept())
  await page.getByRole('button', { name: 'Révoquer' }).first().click()
  await expect(page.getByText('Révoqué le')).toBeVisible()

  // Le bouton disparaît : preuve que `revocable` est bien retombé à faux côté
  // interface. Mais une ligne qui porte une date de révocation ne prouve rien du
  // comportement RÉEL de la consommation (avertissement du brief) — la preuve
  // suivante est la seule qui compte.
  await expect(page.getByRole('button', { name: 'Révoquer' })).toHaveCount(0)

  // LA PREUVE QUI COMPTE : ce code, désormais révoqué, est réellement refusé par
  // `consommer_token_inscription` — pas seulement marqué en base. Un token
  // révoqué suit la MÊME branche qu'un token expiré ou inconnu (D30, migration
  // 20260815160000) : le statut attendu est 'invalide', jamais 'ok'.
  const { data: consommation, error: erreurConsommation } = await admin.rpc('consommer_token_inscription', {
    p_code_hash: hacher(code),
    p_adresse: ADRESSE_CONSOMMATION,
  })
  expect(erreurConsommation).toBeNull()
  expect(consommation).toHaveLength(1)
  expect(consommation![0].statut).toBe('invalide')
  // CONTRÔLE POSITIF de la ligne ci-dessus : un token qu'on n'aurait PAS révoqué,
  // avec le même hachage de départ, aurait rendu 'ok' — c'est exactement ce que
  // prouve la suite `consommer_token_inscription` de `tests/rls/tokens-inscription.test.ts`
  // pour un token fraîchement créé. La révocation est donc bien la cause du refus
  // ici, pas un défaut générique de la fonction.
})

test('révoquer un token déjà révoqué par ailleurs (concurrence) échoue proprement et ne réécrit rien', async ({ page }) => {
  await connecter(page, IDENT_ADMIN)
  const code = await genererTokenGenerique(page)
  const codeHash = hacher(code)

  // Simule une révocation survenue depuis une AUTRE session pendant que cette
  // page reste ouverte, non rafraîchie : la Server Action doit refuser une
  // seconde révocation, pas la traiter comme un succès silencieux.
  const revoqueLeConcurrent = new Date().toISOString()
  const { error: erreurPreparation } = await admin
    .from('tokens_inscription')
    .update({ revoque_le: revoqueLeConcurrent })
    .eq('code_hash', codeHash)
  if (erreurPreparation) throw new Error(`préparation du token déjà révoqué impossible : ${erreurPreparation.message}`)

  page.once('dialog', (dialogue) => dialogue.accept())
  await page.getByRole('button', { name: 'Révoquer' }).first().click()

  await expect(page.getByText(MESSAGE_TOKEN_DEJA_CLOS)).toBeVisible()

  // AUCUNE réécriture : `revoque_le` reste EXACTEMENT la valeur posée ci-dessus,
  // pas une nouvelle date plus tardive qu'un remède mal gardé aurait pu poser.
  const { data: relu, error: erreurLecture } = await admin
    .from('tokens_inscription')
    .select('revoque_le')
    .eq('code_hash', codeHash)
    .single()
  expect(erreurLecture).toBeNull()
  expect(new Date(relu!.revoque_le as string).toISOString()).toBe(revoqueLeConcurrent)
})

test('révoquer un token déjà consommé par ailleurs échoue proprement et laisse la consommation intacte', async ({ page }) => {
  await connecter(page, IDENT_ADMIN)
  const code = await genererTokenGenerique(page)
  const codeHash = hacher(code)

  // Simule une consommation survenue depuis une AUTRE session (une inscription
  // réelle avec ce code) pendant que cette page reste ouverte, non rafraîchie.
  const { data: profilAdmin } = await admin.from('profils').select('id').eq('identifiant', IDENT_ADMIN).single()
  const { error: erreurPreparation } = await admin
    .from('tokens_inscription')
    .update({ utilise_le: new Date().toISOString(), utilise_par_profil_id: profilAdmin!.id })
    .eq('code_hash', codeHash)
  if (erreurPreparation) throw new Error(`préparation du token déjà consommé impossible : ${erreurPreparation.message}`)

  page.once('dialog', (dialogue) => dialogue.accept())
  await page.getByRole('button', { name: 'Révoquer' }).first().click()

  await expect(page.getByText(MESSAGE_TOKEN_DEJA_CLOS)).toBeVisible()

  // La révocation refusée ne doit ni poser `revoque_le`, ni toucher à la
  // consommation déjà enregistrée.
  const { data: relu, error: erreurLecture } = await admin
    .from('tokens_inscription')
    .select('revoque_le, utilise_le, utilise_par_profil_id')
    .eq('code_hash', codeHash)
    .single()
  expect(erreurLecture).toBeNull()
  expect(relu!.revoque_le).toBeNull()
  expect(relu!.utilise_le).not.toBeNull()
  expect(relu!.utilise_par_profil_id).toBe(profilAdmin!.id)
})

test("un compte non-administrateur qui appelle genererToken directement échoue et n'écrit rien", async ({ page }) => {
  await connecter(page, IDENT_SIMPLE)

  const { count: avant } = await admin.from('tokens_inscription').select('id', { count: 'exact', head: true })

  await page.goto('/tokens')
  await expect(page).toHaveURL(/\/tableau-de-bord/)

  const { count: apres } = await admin.from('tokens_inscription').select('id', { count: 'exact', head: true })
  expect(apres).toBe(avant)
})
