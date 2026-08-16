import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'

// D24 : archiver une fiche désactive le compte de connexion qui lui est lié
// (déclencheur `membres_archivage_desactive_compte`, migration 20260814160000).
// Parcours normal de bout en bout — le croisement avec le dernier administrateur est
// éprouvé côté RLS (`tests/rls/archivage-comptes.test.ts`), pas ici : ce fichier vérifie
// ce qu'un administrateur voit et déclenche réellement depuis l'écran de la fiche.
test.describe.configure({ mode: 'serial' })

const IDENT_ADMIN = 'test.e2e.archivcpt.admin'
const IDENT_LIE = 'test.e2e.archivcpt.lie'
const IDENT_RETABLIR = 'test.e2e.archivcpt.retablir'
const IDENT_ADMIN_SECONDAIRE = 'test.e2e.archivcpt.admin2'
const MDP_ADMIN = `Test-${crypto.randomUUID()}`
const MDP_LIE = `Test-${crypto.randomUUID()}`
// Préfixe de FAMILLE stable pour le nettoyage (I6 de la ronde de correction) — voir
// `tests/e2e/ael-pointage.spec.ts` pour le raisonnement complet, même motif partout.
const FAMILLE = 'ZZArchivCpt-'
const PREFIXE = `${FAMILLE}${crypto.randomUUID().slice(0, 8)}`
// Le route announcer de Next porte lui aussi `role="alert"`, toujours présent et
// invisible : l'exclure évite un faux `toHaveCount(1)` sans rapport avec un message
// applicatif. Même exclusion que `tests/e2e/arbre.spec.ts`.
const ALERTE = '[role="alert"]:not(#__next-route-announcer__)'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

let idMembreCible: string
let idMembreRetablir: string
let idMembreAdminSecondaire: string
let idCompteLie: string
let idCompteRetablir: string
let idCompteAdminSecondaire: string

async function creerMembre(suffixe: string): Promise<string> {
  const { data, error } = await admin
    .from('membres')
    .insert({ nom: `${PREFIXE}-${suffixe}`, prenom: 'Test' })
    .select('id')
    .single()
  if (error || !data) throw new Error(`création du membre ${suffixe} impossible : ${error?.message}`)
  return data.id as string
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

async function creerCompte(identifiant: string, mdp: string, membreId: string, administrateur: boolean) {
  const { data, error } = await admin.auth.admin.createUser({
    email: `${identifiant}@asonkeng.local`,
    password: mdp,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(error?.message)
  const { error: erreurProfil } = await admin
    .from('profils')
    .insert({ id: data.user.id, identifiant, nom_affichage: `Test ${identifiant}`, membre_id: membreId })
  if (erreurProfil) {
    await admin.auth.admin.deleteUser(data.user.id)
    throw new Error(`insertion du profil impossible : ${erreurProfil.message}`)
  }
  if (administrateur) {
    const { error: erreurRole } = await admin
      .from('roles_profil')
      .insert({ profil_id: data.user.id, role: 'administrateur' })
    if (erreurRole) {
      await admin.auth.admin.deleteUser(data.user.id)
      throw new Error(`attribution du rôle impossible : ${erreurRole.message}`)
    }
  }
  return data.user.id as string
}

async function nettoyer() {
  await supprimerCompte(IDENT_ADMIN)
  await supprimerCompte(IDENT_LIE)
  await supprimerCompte(IDENT_RETABLIR)
  await supprimerCompte(IDENT_ADMIN_SECONDAIRE)
  // Balayage de FAMILLE (I6), pas seulement `PREFIXE` de cette exécution : retrouve
  // aussi ce qu'une exécution ANTÉRIEURE interrompue avant sa propre fin a laissé, sous
  // un AUTRE suffixe aléatoire.
  await admin.from('membres').delete().like('nom', `${FAMILLE}%`)
}

test.beforeAll(async () => {
  await nettoyer()

  idMembreCible = await creerMembre('cible')
  idMembreRetablir = await creerMembre('a-retablir')
  idMembreAdminSecondaire = await creerMembre('admin-secondaire-fiche')

  await creerCompte(IDENT_ADMIN, MDP_ADMIN, await creerMembre('admin-fiche'), true)
  idCompteLie = await creerCompte(IDENT_LIE, MDP_LIE, idMembreCible, false)
  idCompteRetablir = await creerCompte(IDENT_RETABLIR, MDP_LIE, idMembreRetablir, false)
  idCompteAdminSecondaire = await creerCompte(
    IDENT_ADMIN_SECONDAIRE,
    MDP_LIE,
    idMembreAdminSecondaire,
    true,
  )

  // La fiche de test « à rétablir » est archivée d'avance, avec son compte déjà
  // désactivé par le même déclencheur — précondition du second test.
  const { error } = await admin.from('membres').update({ etat: 'archive' }).eq('id', idMembreRetablir)
  if (error) throw new Error(`archivage préalable impossible : ${error.message}`)
})

test.afterAll(async () => {
  await nettoyer()
  // Mineur traité au passage (constante globale n°8 : nettoyage vérifié par
  // comptage) — ce fichier appelait `nettoyer()` sans jamais vérifier son effet.
  const { count } = await admin
    .from('membres')
    .select('id', { count: 'exact', head: true })
    .like('nom', `${FAMILLE}%`)
  expect(count).toBe(0)
  const { data: comptesResiduels } = await admin
    .from('profils')
    .select('id')
    .in('identifiant', [IDENT_ADMIN, IDENT_LIE, IDENT_RETABLIR, IDENT_ADMIN_SECONDAIRE])
  expect(comptesResiduels ?? []).toHaveLength(0)
})

async function seConnecter(page: import('@playwright/test').Page) {
  await page.goto('/connexion')
  await page.getByLabel('Identifiant').fill(IDENT_ADMIN)
  await page.getByLabel('Mot de passe', { exact: true }).fill(MDP_ADMIN)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page).toHaveURL(/\/tableau-de-bord/)
}

/**
 * Task 15 (D124) — `window.confirm` est remplacé par le `<dialog>` natif de `Dialogue` :
 * le clic déclencheur n'ouvre plus qu'un dialogue, il ne soumet plus rien tout seul.
 * Accepte le dialogue OUVERT en cliquant son bouton « Confirmer » — l'équivalent de
 * l'ancien `page.once('dialog', (d) => d.accept())` sur la boîte native.
 */
async function accepterDialogue(page: import('@playwright/test').Page) {
  await page.locator('dialog[open]').getByRole('button', { name: 'Confirmer' }).click()
}

/** Idem, mais lit le message AVANT de confirmer — remplace `dialogue.message()`. */
async function messageDialogueOuvert(page: import('@playwright/test').Page): Promise<string> {
  return page.locator('dialog[open]').locator('p').first().innerText()
}

test("archiver une fiche à compte lié actif avertit, puis désactive réellement ce compte", async ({
  page,
}) => {
  await seConnecter(page)
  await page.goto(`/membres/${idMembreCible}`)

  await page.getByRole('button', { name: 'Archiver' }).click()
  const messageDialogue = await messageDialogueOuvert(page)
  await accepterDialogue(page)

  // L'HONNÊTETÉ DE L'INTERFACE (D24) : un bouton qui révoque aussi l'accès de
  // quelqu'un doit le dire AVANT qu'on clique, pas après.
  expect(messageDialogue).toContain('compte de connexion')
  expect(messageDialogue).toContain('désactivé')

  await expect(page).toHaveURL(new RegExp(`/membres/${idMembreCible}$`))

  // L'écriture qui compte : le compte est réellement désactivé en base, pas
  // seulement annoncé comme tel dans la boîte de dialogue.
  await expect(async () => {
    const { data } = await admin.from('profils').select('actif').eq('id', idCompteLie).single()
    expect(data?.actif).toBe(false)
  }).toPass()

  const { data: fiche } = await admin.from('membres').select('etat').eq('id', idMembreCible).single()
  expect(fiche?.etat).toBe('archive')
})

test("rétablir une fiche dont le compte lié est désactivé avertit que ce compte reste désactivé (D24, asymétrie)", async ({
  page,
}) => {
  await seConnecter(page)
  await page.goto(`/membres/${idMembreRetablir}`)

  await page.getByRole('button', { name: 'Rétablir' }).click()
  const messageDialogue = await messageDialogueOuvert(page)
  await accepterDialogue(page)

  expect(messageDialogue).toContain('reste désactivé')
  expect(messageDialogue).not.toContain('sera désactivé')

  // Attendre la bannière « Fiche archivée » DISPARAÎTRE, pas seulement l'URL : la
  // Server Action est soumise via un fetch asynchrone, et `toHaveURL` serait déjà vrai
  // avant même le clic (on ne quitte jamais cette page) — même piège que celui déjà
  // documenté sur ce projet (spec de la Task 6 de la 1c, minor M4). C'est la
  // disparition de la bannière qui prouve que le rendu suivant l'écriture est arrivé.
  await expect(page.getByText('Fiche archivée')).toHaveCount(0)

  // L'écriture qui compte : assertion EN BASE, avec réessai — la redirection peut
  // précéder de peu la visibilité de l'écriture pour une lecture indépendante.
  await expect(async () => {
    const { data: fiche } = await admin.from('membres').select('etat').eq('id', idMembreRetablir).single()
    expect(fiche?.etat).toBe('actif')
  }).toPass()

  // La fiche réapparaît active, mais son compte n'est PAS réactivé automatiquement —
  // exactement l'asymétrie que D24 exige.
  const { data: compte } = await admin.from('profils').select('actif').eq('id', idCompteRetablir).single()
  expect(compte?.actif).toBe(false)
})

// CONTRÔLE POSITIF, spécifique au CŒUR de ce correctif (D24 croise la protection du
// dernier administrateur) : sans lui, le contrôle en amont d'`archiverMembre`
// (`compteLieEstDernierAdministrateurActif`, src/lib/donnees/comptes.ts) pourrait
// refuser TOUT archivage d'une fiche liée à un administrateur — qu'il soit ou non le
// dernier — sans qu'aucun test ne le remarque : `tests/rls/archivage-comptes.test.ts`
// prouve que le DÉCLENCHEUR laisse passer ce cas, mais en écrivant directement dans
// `membres` avec la clé de service, ce qui contourne entièrement ce contrôle amont
// applicatif. Seul un vrai passage par l'écran l'exerce.
test("archiver la fiche d'un administrateur n'est pas refusé quand un autre administrateur actif subsiste", async ({
  page,
}) => {
  await seConnecter(page)
  await page.goto(`/membres/${idMembreAdminSecondaire}`)

  await page.getByRole('button', { name: 'Archiver' }).click()
  await accepterDialogue(page)

  await expect(page.locator(ALERTE)).toHaveCount(0)
  await expect(page.getByText('dernier administrateur actif')).toHaveCount(0)

  await expect(async () => {
    const { data } = await admin
      .from('profils')
      .select('actif')
      .eq('id', idCompteAdminSecondaire)
      .single()
    expect(data?.actif).toBe(false)
  }).toPass()

  const { data: fiche } = await admin.from('membres').select('etat').eq('id', idMembreAdminSecondaire).single()
  expect(fiche?.etat).toBe('archive')
})
