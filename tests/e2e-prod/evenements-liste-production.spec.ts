import { createClient } from '@supabase/supabase-js'
import { expect, test, type Page } from '@playwright/test'
import { identifiantVersEmail } from '../../src/lib/domaine/identifiant'
import { MESSAGE_PERIODE_INCOHERENTE } from '../../src/app/evenements/messages'

/**
 * PREUVE REJOUABLE contre un build de PRODUCTION — même motif que
 * `tests/e2e-prod/refus-metier-production.spec.ts` et
 * `tests/e2e-prod/evenements-types-production.spec.ts`.
 *
 * `creerEvenement` (src/app/evenements/actions.ts) RETOURNE son refus de période
 * incohérente, il ne le LÈVE pas. Rejoué ici contre un vrai build de production, pour
 * la même raison que les deux fichiers ci-dessus : le mécanisme qui remplace un message
 * levé par un digest React n'existe qu'en production, `npm run dev` ne peut pas le voir.
 */

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const MDP = `Test-${crypto.randomUUID()}`
const IDENT_MODERATEUR = 'test.e2e.prod.evliste'
const PREFIXE_FAMILLE = 'ZZEvListeProdE2E-'
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

test('en production, une période incohérente affiche son message exact et conserve la saisie — pas un digest React', async ({
  page,
}) => {
  await creerCompteModerateur(IDENT_MODERATEUR)
  const titre = `${PREFIXE}-Periode`

  await connecter(page, IDENT_MODERATEUR)
  await page.goto('/evenements')
  await page.getByText('Nouvel évènement').click()
  const formulaire = page.locator('details').filter({ has: page.getByRole('button', { name: 'Créer' }) })

  await formulaire.getByLabel('Titre').fill(titre)
  await formulaire.getByLabel('Type').selectOption({ index: 1 })
  await formulaire.getByLabel('Date de début').fill('2026-09-10')
  await formulaire.getByLabel('Date de fin').fill('2026-09-01')
  await formulaire.getByRole('button', { name: 'Créer' }).click()

  await expect(formulaire.locator('[role="alert"]:not(#__next-route-announcer__)')).toHaveText(
    MESSAGE_PERIODE_INCOHERENTE,
  )
  await expect(formulaire.getByLabel('Titre')).toHaveValue(titre)

  const { data } = await admin.from('evenements').select('id').eq('titre', titre)
  expect(data ?? []).toHaveLength(0)
})
