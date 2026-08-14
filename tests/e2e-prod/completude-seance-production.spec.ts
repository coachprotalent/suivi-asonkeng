import { createClient } from '@supabase/supabase-js'
import { expect, test, type Page } from '@playwright/test'
import { identifiantVersEmail } from '../../src/lib/domaine/identifiant'
import { MESSAGE_SEANCE_SANS_THEME } from '../../src/app/ael/seances/[id]/messages'

/**
 * PREUVE REJOUABLE contre un build de PRODUCTION (`next build` + `next start`, voir
 * `playwright.prod.config.ts`), sur le modèle de
 * `tests/e2e-prod/refus-metier-production.spec.ts` : `npm run test:e2e` (mode dev) ne
 * peut pas révéler qu'un message levé perdrait son texte en production (React le
 * remplace par un digest, « Minified React error #441 »).
 *
 * `enregistrerSeance` (`src/app/ael/seances/[id]/actions.ts`) RETOURNE son refus de
 * complétude au lieu de le lever — exigé par le brief de la Task 15 précisément à
 * cause de ce mécanisme. Ce fichier éprouve que le message atteint réellement l'écran
 * contre un vrai build, pas seulement contre `next dev`.
 *
 * Le contrôle amont (`seanceEstComplete`, D37) et le déclencheur SQL
 * (`prive.refuser_seance_tenue_incomplete`, migrations 20260817120000/150000)
 * partagent la même règle et produisent le même texte : ce test emprunte le chemin
 * amont (le seul atteignable par un formulaire normal, sans diverger du déclencheur)
 * pour prouver que CE texte précis — celui qui nomme le champ manquant — survit à la
 * minification de production. Une divergence entre les deux resterait fermée par le
 * déclencheur lui-même (filet, `error.details`), jamais par ce test.
 */

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const MDP = `Test-${crypto.randomUUID()}`
const IDENT_MODERATEUR = 'test.e2e.prod.ael.moderateur'
// Préfixe de FAMILLE stable pour le nettoyage (I6 de la ronde de correction) — sur une
// base qui sert AUSSI de production, le défaut est particulièrement coûteux ici : voir
// `tests/e2e/ael-pointage.spec.ts` pour le raisonnement complet, même motif partout.
const FAMILLE = 'ZZAelCompletudeProdE2E-'
const PREFIXE = `${FAMILLE}${crypto.randomUUID().slice(0, 8)}`

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

async function nettoyer() {
  // Sur FAMILLE, pas sur `PREFIXE` de cette exécution (I6) : `PREFIXE` embarque un
  // identifiant tiré À CETTE EXÉCUTION, donc un nettoyage borné à lui ne retrouve
  // jamais ce qu'une exécution ANTÉRIEURE interrompue avant sa propre fin a laissé —
  // antenne et séance sous un AUTRE suffixe de la même famille, EN PRODUCTION.
  const { data: jonctions } = await admin
    .from('seances_ael_antennes')
    .select('seance_id, antennes!inner(nom)')
    .like('antennes.nom', `${FAMILLE}%`)
  if (jonctions && jonctions.length > 0) {
    await admin.from('seances_ael').delete().in('id', jonctions.map((j) => j.seance_id))
  }
  const { error: erreurAntennes } = await admin.from('antennes').delete().like('nom', `${FAMILLE}%`)
  if (erreurAntennes) {
    throw new Error(`nettoyage des antennes de la famille impossible : ${erreurAntennes.message}`)
  }
  await supprimerCompte(IDENT_MODERATEUR)
}

async function seConnecter(page: Page, identifiant: string) {
  await page.goto('/connexion')
  await page.getByLabel('Identifiant').fill(identifiant)
  await page.getByLabel('Mot de passe').fill(MDP)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page).toHaveURL(/\/tableau-de-bord/)
}

test.beforeAll(async () => {
  await nettoyer()

  const { data: antenne, error: erreurAntenne } = await admin
    .from('antennes')
    .insert({ nom: PREFIXE, pays: 'Test' })
    .select('id')
    .single()
  if (erreurAntenne || !antenne) throw new Error(`création de l'antenne impossible : ${erreurAntenne?.message}`)

  const { data: profil, error: erreurCompte } = await admin.auth.admin.createUser({
    email: identifiantVersEmail(IDENT_MODERATEUR),
    password: MDP,
    email_confirm: true,
  })
  if (erreurCompte || !profil.user) throw new Error(`création du compte impossible : ${erreurCompte?.message}`)
  const { error: erreurProfil } = await admin
    .from('profils')
    .insert({ id: profil.user.id, identifiant: IDENT_MODERATEUR, nom_affichage: 'Test prod modérateur AEL' })
  if (erreurProfil) throw new Error(`insertion du profil impossible : ${erreurProfil.message}`)
  const { error: erreurRole } = await admin
    .from('roles_profil')
    .insert({ profil_id: profil.user.id, role: 'moderateur' })
  if (erreurRole) throw new Error(`attribution du rôle impossible : ${erreurRole.message}`)

  const { error: erreurSeance, data: seance } = await admin
    .from('seances_ael')
    .insert({ date: '2026-09-01' })
    .select('id')
    .single()
  if (erreurSeance || !seance) throw new Error(`création de la séance impossible : ${erreurSeance?.message}`)
  const { error: erreurJonction } = await admin
    .from('seances_ael_antennes')
    .insert({ seance_id: seance.id, antenne_id: antenne.id })
  if (erreurJonction) throw new Error(`jonction impossible : ${erreurJonction.message}`)
})

test.afterAll(async () => {
  await nettoyer()
  // Nettoyage vérifié par comptage (contrainte globale n°8/n°13), COUVRANT TOUT ce
  // que ce fichier crée (I6 de la ronde de correction) : la version d'origine ne
  // comptait que les profils, ni l'antenne ni la séance — sur une base qui sert AUSSI
  // de production, un défaut de ce fichier-ci en particulier ne se serait jamais
  // rattrapé tout seul.
  const { count: comptesAntennes } = await admin
    .from('antennes')
    .select('id', { count: 'exact', head: true })
    .like('nom', `${FAMILLE}%`)
  expect(comptesAntennes).toBe(0)
  const { data: residus } = await admin.from('profils').select('id').eq('identifiant', IDENT_MODERATEUR)
  expect(residus ?? []).toHaveLength(0)
})

test('en production, le message du déclencheur de complétude affiche son texte exact — pas un digest React', async ({
  page,
}) => {
  await seConnecter(page, IDENT_MODERATEUR)

  const { data: seance } = await admin
    .from('seances_ael_antennes')
    .select('seance_id, antennes!inner(nom)')
    .eq('antennes.nom', PREFIXE)
    .single()

  await page.goto(`/ael/seances/${seance!.seance_id}`)
  await page.getByRole('button', { name: 'Marquer tenue' }).click()

  // L'ASSERTION QUI COMPTE : le texte RÉELLEMENT affiché, contre un vrai build de
  // production, doit être le message métier exact — pas un digest React.
  await expect(page.locator('p[role="alert"]')).toHaveText(MESSAGE_SEANCE_SANS_THEME)
})
