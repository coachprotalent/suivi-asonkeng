import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'
import { MESSAGE_TYPE_EXISTE_DEJA } from '../../src/app/evenements/types/messages'

// Même discipline que tests/e2e/statuts.spec.ts et autorite.spec.ts : ordre du scénario
// et comptes partagés entre les tests de ce fichier.
test.describe.configure({ mode: 'serial' })

// `profils_identifiant_format` limite l'identifiant à 32 caractères
// (`^[a-z][a-z0-9.-]{2,31}$`) : constaté à l'exécution, un identifiant plus long que ça
// est refusé par la contrainte, et l'échec de préparation du test (avant toute
// assertion de sécurité) se lirait à tort comme une régression de ce fichier.
const IDENT_ADMIN = 'test.e2e.evtypes.admin'
const IDENT_MODERATEUR = 'test.e2e.evtypes.mod'
const IDENT_SIMPLE = 'test.e2e.evtypes.simple'
const MDP_ADMIN = `Test-${crypto.randomUUID()}`
const MDP_MODERATEUR = `Test-${crypto.randomUUID()}`
const MDP_SIMPLE = `Test-${crypto.randomUUID()}`
// M9 DE LA REVUE FINALE — NETTOYAGE SUR LA FAMILLE, PAS SUR LE SUFFIXE ALÉATOIRE. Le
// suffixe évite une collision entre deux exécutions ; le BALAYAGE doit porter sur la
// FAMILLE, sans quoi une exécution interrompue laisse en base de PRODUCTION des lignes que
// plus rien ne retrouvera — leur suffixe étant mort avec le processus. Convention reprise de
// `tests/rls/evenements.test.ts:14-19`, tiret littéral compris.
const FAMILLE = 'ZZEvenementsType-'
const PREFIXE = `${FAMILLE}${crypto.randomUUID().slice(0, 8)}`

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
  const { error } = await admin.from('types_evenement').delete().like('libelle', `${FAMILLE}%`)
  if (error) throw new Error(`nettoyage des types impossible : ${error.message}`)
  await supprimerCompte(IDENT_ADMIN)
  await supprimerCompte(IDENT_MODERATEUR)
  await supprimerCompte(IDENT_SIMPLE)
}

/** NETTOYAGE VÉRIFIÉ PAR COMPTAGE, sur la MÊME famille que la suppression (M9). */
async function verifierAucunResidu() {
  const { count, error } = await admin
    .from('types_evenement')
    .select('id', { count: 'exact', head: true })
    .like('libelle', `${FAMILLE}%`)
  if (error) throw new Error(`comptage des résidus impossible : ${error.message}`)
  expect(count, 'résidu dans types_evenement').toBe(0)
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

test.beforeAll(async () => {
  await nettoyer()
  await creerCompte(IDENT_ADMIN, MDP_ADMIN, 'administrateur')
  await creerCompte(IDENT_MODERATEUR, MDP_MODERATEUR, 'moderateur')
  await creerCompte(IDENT_SIMPLE, MDP_SIMPLE, null)
})

test.afterAll(async () => {
  await nettoyer()
  await verifierAucunResidu()
})

async function seConnecter(page: import('@playwright/test').Page, identifiant: string, mdp: string) {
  await page.goto('/connexion')
  await page.getByLabel('Identifiant').fill(identifiant)
  await page.getByLabel('Mot de passe', { exact: true }).fill(mdp)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page).toHaveURL(/\/tableau-de-bord/)
}

async function libelleExiste(libelle: string): Promise<boolean> {
  const { data, error } = await admin.from('types_evenement').select('id').eq('libelle', libelle)
  if (error) throw new Error(`lecture de types_evenement impossible : ${error.message}`)
  return (data ?? []).length > 0
}

test("un administrateur ajoute un type, qui apparaît aussitôt dans le catalogue", async ({ page }) => {
  const libelle = `${PREFIXE}-Ajout`
  await seConnecter(page, IDENT_ADMIN, MDP_ADMIN)
  await page.goto('/evenements/types')

  await page.getByLabel('Libellé').fill(libelle)
  await page.getByRole('button', { name: 'Ajouter' }).click()

  await expect(page.locator('li').filter({ hasText: libelle })).toBeVisible()
  expect(await libelleExiste(libelle)).toBe(true)
})

test('un doublon de casse est refusé avec un message clair, et la saisie est conservée', async ({ page }) => {
  // Le catalogue porte un index unique NORMALISÉ (lower(trim(libelle))) : "webinaire" est
  // refusé alors que "Webinaire" (amorcé en base, Task 4) existe déjà, casse différente.
  // Vérifié empiriquement contre la vraie base avant d'écrire ce test : l'insertion rend
  // error.code === '23505' sur la contrainte types_evenement_libelle_normalise_unique.
  const libelleDoublon = 'webinaire'
  await seConnecter(page, IDENT_ADMIN, MDP_ADMIN)
  await page.goto('/evenements/types')

  await page.getByLabel('Libellé').fill(libelleDoublon)
  await page.getByRole('button', { name: 'Ajouter' }).click()

  // Le message métier, PAS la page d'erreur générique de digest React (#441) : si l'action
  // levait au lieu de retourner, cette assertion échouerait — c'est exactement ce que ce
  // test vise à distinguer.
  // CHAÎNE IMPORTÉE DEPUIS `src/`, plus recopiée à la main (M17) : la version en dur avait
  // figé l'ancienne graphie « événement » et aurait fait échouer ce test sur une correction
  // d'orthographe plutôt que sur un défaut. Son jumeau de production importait déjà la
  // constante.
  await expect(page.locator(ALERTE)).toContainText(MESSAGE_TYPE_EXISTE_DEJA)
  // La saisie n'est pas perdue : l'administrateur n'a pas à retaper son libellé.
  await expect(page.getByLabel('Libellé')).toHaveValue(libelleDoublon)
  // Et surtout : aucune ligne n'a été créée sous cette casse.
  expect(await libelleExiste(libelleDoublon)).toBe(false)
})

test('un administrateur désactive puis réactive un type', async ({ page }) => {
  const libelle = `${PREFIXE}-Bascule`
  await seConnecter(page, IDENT_ADMIN, MDP_ADMIN)
  await page.goto('/evenements/types')
  await page.getByLabel('Libellé').fill(libelle)
  await page.getByRole('button', { name: 'Ajouter' }).click()
  const ligne = page.locator('li').filter({ hasText: libelle })
  await expect(ligne).toBeVisible()

  page.once('dialog', (d) => d.accept())
  await ligne.getByRole('button', { name: 'Désactiver' }).click()
  await expect(ligne.getByText('(désactivé)')).toBeVisible()
  await expect(async () => {
    const { data, error } = await admin.from('types_evenement').select('actif').eq('libelle', libelle).single()
    if (error) throw error
    expect(data.actif).toBe(false)
  }).toPass()

  page.once('dialog', (d) => d.accept())
  await ligne.getByRole('button', { name: 'Réactiver' }).click()
  await expect(ligne.getByText('(désactivé)')).toHaveCount(0)
  await expect(async () => {
    const { data, error } = await admin.from('types_evenement').select('actif').eq('libelle', libelle).single()
    if (error) throw error
    expect(data.actif).toBe(true)
  }).toPass()
})

test('un modérateur qui visite /evenements/types est redirigé vers le tableau de bord', async ({ page }) => {
  await seConnecter(page, IDENT_MODERATEUR, MDP_MODERATEUR)
  await page.goto('/evenements/types')
  await expect(page).toHaveURL(/\/tableau-de-bord/)
})

test('un compte simple qui visite /evenements/types est redirigé vers le tableau de bord', async ({ page }) => {
  await seConnecter(page, IDENT_SIMPLE, MDP_SIMPLE)
  await page.goto('/evenements/types')
  await expect(page).toHaveURL(/\/tableau-de-bord/)
})

// --- Requêtes forgées contre les Server Actions -------------------------------
//
// Les deux tests de redirection ci-dessus prouvent que la PAGE se ferme à un
// modérateur et à un compte simple. Ils ne prouvent pas que les Server Actions
// elles-mêmes refusent l'écriture : `creerTypeEvenement` et `basculerType` passent
// par `clientAdmin()`, qui contourne entièrement la RLS. Seul `exigerAdministrateur()`,
// première instruction de chaque action, protège réellement. Même motif que
// tests/e2e/statuts.spec.ts et autorite.spec.ts.

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

test("un modérateur ne peut pas créer de type par une requête forgée ; le même rejeu réussit en administrateur (canari)", async ({
  page,
  browser,
  baseURL,
}) => {
  const libelleForge = `${PREFIXE}-Forge-Creation`
  expect(await libelleExiste(libelleForge)).toBe(false)

  await seConnecter(page, IDENT_ADMIN, MDP_ADMIN)
  await page.goto('/evenements/types')
  const formulaireAjout = page.locator('form').filter({ has: page.getByRole('button', { name: 'Ajouter' }) })
  const champs = extraireChampsCaches(await formulaireAjout.evaluate((el) => el.outerHTML))
  verifierCaptureAction(champs)

  const contexteModerateur = await browser.newContext({ baseURL })
  try {
    const pageModerateur = await contexteModerateur.newPage()
    await seConnecter(pageModerateur, IDENT_MODERATEUR, MDP_MODERATEUR)

    await pageModerateur.request.post('/evenements/types', {
      multipart: { ...champs, libelle: libelleForge, ordre: '0' },
    })

    // Seule assertion qui compte : aucune ligne créée, quel qu'ait été le code HTTP.
    expect(await libelleExiste(libelleForge)).toBe(false)
  } finally {
    await contexteModerateur.close()
  }

  // Canari : exactement le même mécanisme, depuis une session administrateur, doit
  // réussir. Sans lui, un refus ci-dessus pourrait aussi bien signifier « la forge est
  // cassée » que « le garde tient » — indiscernables sans ce contrôle positif.
  await page.request.post('/evenements/types', {
    multipart: { ...champs, libelle: libelleForge, ordre: '0' },
  })
  expect(await libelleExiste(libelleForge)).toBe(true)
})

test("un compte simple ne peut pas désactiver un type par une requête forgée ; le même rejeu réussit en administrateur (canari)", async ({
  page,
  browser,
  baseURL,
}) => {
  const libelle = `${PREFIXE}-Forge-Bascule`
  const { data, error } = await admin.from('types_evenement').insert({ libelle, ordre: 0 }).select('id').single()
  if (error || !data) throw new Error(`préparation du test impossible : ${error?.message}`)
  const idType = data.id as string

  await seConnecter(page, IDENT_ADMIN, MDP_ADMIN)
  await page.goto('/evenements/types')
  const ligne = page.locator('li').filter({ hasText: libelle })
  const formulaireBascule = ligne.locator('form')
  const champs = extraireChampsCaches(await formulaireBascule.evaluate((el) => el.outerHTML))
  verifierCaptureAction(champs)

  const contexteSimple = await browser.newContext({ baseURL })
  try {
    const pageSimple = await contexteSimple.newPage()
    await seConnecter(pageSimple, IDENT_SIMPLE, MDP_SIMPLE)

    await pageSimple.request.post('/evenements/types', { multipart: { ...champs, id: idType } })

    const { data: apres } = await admin.from('types_evenement').select('actif').eq('id', idType).single()
    expect(apres?.actif).toBe(true)
  } finally {
    await contexteSimple.close()
  }

  // Canari : même requête forgée, session administrateur — doit réussir.
  await page.request.post('/evenements/types', { multipart: { ...champs, id: idType } })
  await expect(async () => {
    const { data: apresCanari, error: erreurCanari } = await admin
      .from('types_evenement')
      .select('actif')
      .eq('id', idType)
      .single()
    if (erreurCanari) throw erreurCanari
    expect(apresCanari.actif).toBe(false)
  }).toPass()
})
