import { createClient } from '@supabase/supabase-js'
import { expect, test, type Page } from '@playwright/test'
import { identifiantVersEmail } from '../../src/lib/domaine/identifiant'
import { MESSAGE_TYPE_EXISTE_DEJA } from '../../src/app/evenements/types/messages'

/**
 * PREUVE REJOUABLE contre un build de PRODUCTION (`next build` + `next start`, voir
 * `playwright.prod.config.ts`) — même motif que `tests/e2e-prod/refus-metier-production.spec.ts`.
 *
 * `creerTypeEvenement` (src/app/evenements/types/actions.ts) RETOURNE son refus de
 * doublon (`{ erreur: MESSAGE_TYPE_EXISTE_DEJA }`), il ne le LÈVE pas — mais c'est
 * précisément le genre d'affirmation que ce projet interdit de tenir sur la seule
 * lecture du code (règle du dépôt : « N'AFFIRMER AUCUN CODE D'ERREUR SANS L'AVOIR
 * VÉRIFIÉ »). Ce test le rejoue pour de vrai contre un build de production, avec le
 * mécanisme qui, historiquement, a déjà fait perdre un message dans ce projet
 * (digest React #441, react.dev/errors/441).
 */

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const MDP = `Test-${crypto.randomUUID()}`
const IDENT_ADMIN = 'test.e2e.prod.evtypes'
const PREFIXE_FAMILLE = 'ZZEvtypesProdE2E-'
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

async function creerCompteAdmin(identifiant: string): Promise<void> {
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
    .insert({ profil_id: data.user.id, role: 'administrateur' })
  if (erreurRole) {
    await admin.auth.admin.deleteUser(data.user.id)
    throw new Error(`attribution du rôle administrateur à ${identifiant} impossible : ${erreurRole.message}`)
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
  await admin.from('types_evenement').delete().like('libelle', `${PREFIXE_FAMILLE}%`)
  await supprimerCompte(IDENT_ADMIN)
}

test.beforeAll(nettoyer)
test.afterAll(async () => {
  await nettoyer()
  const { data: residu } = await admin.from('profils').select('id').eq('identifiant', IDENT_ADMIN).maybeSingle()
  expect(residu).toBeNull()
})

test('en production, le doublon de casse du catalogue des types affiche son message exact — pas un digest React', async ({
  page,
}) => {
  await creerCompteAdmin(IDENT_ADMIN)

  const libelleOriginal = `${PREFIXE}-Webinaire`
  const { error: erreurPreparation } = await admin
    .from('types_evenement')
    .insert({ libelle: libelleOriginal, ordre: 0 })
  if (erreurPreparation) throw new Error(`préparation impossible : ${erreurPreparation.message}`)

  await connecter(page, IDENT_ADMIN)
  await page.goto('/evenements/types')

  // Casse différente du type qui vient d'être posé : refusé par l'index unique
  // normalisé (lower(trim(libelle))), PAS par l'unicité littérale.
  await page.getByLabel('Libellé').fill(libelleOriginal.toLowerCase())
  await page.getByRole('button', { name: 'Ajouter' }).click()

  // L'ASSERTION QUI COMPTE : le texte RÉELLEMENT affiché, contre un vrai build de
  // production, doit être le message métier exact — pas un digest React.
  // `getByRole('alert')` seul est ambigu : Next pose un second `role="alert"`
  // (`#__next-route-announcer__`, toujours présent, vide) — exclu ici, même motif que
  // `ALERTE` dans tests/e2e/evenements-types.spec.ts.
  await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toHaveText(
    MESSAGE_TYPE_EXISTE_DEJA,
  )

  // Et la saisie n'est pas perdue (étape 5 du brief) : vérifié ici aussi, contre le
  // build qui compte réellement pour un administrateur en production.
  await expect(page.getByLabel('Libellé')).toHaveValue(libelleOriginal.toLowerCase())
})
