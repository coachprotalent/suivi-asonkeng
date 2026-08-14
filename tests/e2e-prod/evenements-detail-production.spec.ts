import { createClient } from '@supabase/supabase-js'
import { expect, test, type Page } from '@playwright/test'
import { identifiantVersEmail } from '../../src/lib/domaine/identifiant'
import { MESSAGE_PERIODE_INCOHERENTE } from '../../src/app/evenements/messages'

/**
 * PREUVE REJOUABLE contre un build de PRODUCTION — même motif que les autres fichiers de
 * `tests/e2e-prod/`. `modifierEvenement` (src/app/evenements/[id]/actions.ts) est une
 * action DISTINCTE de `creerEvenement` (déjà couverte par
 * `evenements-liste-production.spec.ts`) : elle RETOURNE elle aussi son refus de période
 * incohérente, et ce test le rejoue sur SON propre chemin de code, contre un vrai build.
 */

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const MDP = `Test-${crypto.randomUUID()}`
const IDENT_MODERATEUR = 'test.e2e.prod.evdetail'
const PREFIXE_FAMILLE = 'ZZEvDetailProdE2E-'
const PREFIXE = `${PREFIXE_FAMILLE}${crypto.randomUUID().slice(0, 8)}`

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

async function creerCompteModerateur(identifiant: string): Promise<void> {
  const { data, error } = await admin.auth.admin.createUser({
    email: identifiantVersEmail(identifiant),
    password: MDP,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`création du compte auth ${identifiant} impossible : ${error?.message}`)
  const { error: erreurProfil } = await admin
    .from('profils')
    .insert({ id: data.user.id, identifiant, nom_affichage: `Test prod ${identifiant}` })
  if (erreurProfil) {
    await admin.auth.admin.deleteUser(data.user.id)
    throw new Error(`insertion du profil ${identifiant} impossible : ${erreurProfil.message}`)
  }
  const { error: erreurRole } = await admin
    .from('roles_profil')
    .insert({ profil_id: data.user.id, role: 'moderateur' })
  if (erreurRole) {
    await admin.auth.admin.deleteUser(data.user.id)
    throw new Error(`attribution du rôle modérateur à ${identifiant} impossible : ${erreurRole.message}`)
  }
}

async function connecter(page: Page, identifiant: string) {
  await page.goto('/connexion')
  await page.getByLabel('Identifiant').fill(identifiant)
  await page.getByLabel('Mot de passe').fill(MDP)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page).toHaveURL(/\/tableau-de-bord/)
}

async function nettoyer() {
  await admin.from('evenements').delete().like('titre', `${PREFIXE_FAMILLE}%`)
  await supprimerCompte(IDENT_MODERATEUR)
}

test.beforeAll(nettoyer)
test.afterAll(async () => {
  await nettoyer()
  const { data: residu } = await admin.from('profils').select('id').eq('identifiant', IDENT_MODERATEUR).maybeSingle()
  expect(residu).toBeNull()
})

test('en production, éditer un évènement avec une période incohérente affiche son message exact — pas un digest React', async ({
  page,
}) => {
  await creerCompteModerateur(IDENT_MODERATEUR)

  // M16 DE LA REVUE FINALE — SEUL APPEL DE PRÉPARATION DU FICHIER DONT L'ERREUR N'ÉTAIT PAS
  // VÉRIFIÉE. Un catalogue sans aucun type actif faisait échouer ce test sur une `TypeError`
  // à `type!.id`, sans aucun rapport avec ce qu'il annonce éprouver — le piège de l'`insert`
  // de préparation dont l'erreur est jetée, trouvé quatre fois dans ce projet.
  const { data: type, error: erreurType } = await admin
    .from('types_evenement')
    .select('id')
    .eq('actif', true)
    .limit(1)
    .single()
  if (erreurType || !type) {
    throw new Error(`préparation impossible : aucun type actif au catalogue (${erreurType?.message})`)
  }
  const titre = `${PREFIXE}-Edition`
  const { data: evenement, error } = await admin
    .from('evenements')
    .insert({ titre, type_id: type!.id, date_debut: '2026-10-01' })
    .select('id')
    .single()
  if (error || !evenement) throw new Error(`préparation impossible : ${error?.message}`)

  await connecter(page, IDENT_MODERATEUR)
  await page.goto(`/evenements/${evenement.id}`)
  await page.getByText("Modifier l'évènement").click()
  const formulaire = page.locator('details').filter({ has: page.getByRole('button', { name: 'Enregistrer' }) })

  await formulaire.getByLabel('Date de fin').fill('2026-01-01')
  await formulaire.getByRole('button', { name: 'Enregistrer' }).click()

  await expect(formulaire.locator('[role="alert"]:not(#__next-route-announcer__)')).toHaveText(
    MESSAGE_PERIODE_INCOHERENTE,
  )

  const { data: verif } = await admin.from('evenements').select('date_fin').eq('id', evenement.id).single()
  expect(verif?.date_fin).toBeNull()
})
