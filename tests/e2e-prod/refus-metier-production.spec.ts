import { createClient } from '@supabase/supabase-js'
import { expect, test, type Page } from '@playwright/test'
import { identifiantVersEmail } from '../../src/lib/domaine/identifiant'
import { MESSAGE_MEMBRE_DEJA_RATTACHE } from '../../src/app/demandes/messages'

/**
 * PREUVE REJOUABLE contre un build de PRODUCTION (`next build` + `next start`,
 * voir `playwright.prod.config.ts`) — exigée par la revue de la Task 17.
 *
 * `npm run test:e2e` (playwright.config.ts) sert `npm run dev`. Ce mode ne
 * peut PAS révéler le défaut corrigé ici : une exception LEVÉE depuis une
 * Server Action est transmise INTACTE au client en développement, mais perd
 * son message en PRODUCTION SEULEMENT — React la remplace par un digest
 * interne (« Minified React error #441… », react.dev/errors/441 : « The
 * specific message is omitted in production builds »). C'est ce mécanisme,
 * et rien d'autre, que ce fichier éprouve : un refus dont on connaît le texte
 * exact, déclenché par un clic RÉEL sur un build RÉEL de production, avec une
 * assertion sur le texte RÉELLEMENT affiché.
 *
 * Un seul cas suffit à faire la preuve du MÉCANISME (les actions de
 * `src/app/demandes/actions.ts` RETOURNENT désormais toutes leur refus au
 * lieu de le lever — voir son commentaire de tête) : `membre_deja_rattache`,
 * le même scénario que `tests/e2e/demandes.spec.ts` vérifie déjà en
 * développement. Si un jour une nouvelle action de ce fichier recommençait à
 * LEVER son refus, ce test resterait vert (il ne couvre que
 * `validerDemandeRattachement`) — mais il continuerait de garantir que LA
 * CLASSE DE DÉFAUT dont il porte la preuve reste fermée pour cette action-là,
 * contre un vrai build de production, à chaque exécution.
 */

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const MDP = `Test-${crypto.randomUUID()}`
const IDENT_ADMIN = 'test.e2e.prod.admin'
const IDENT_D = 'test.e2e.prod.d'
const IDENT_E = 'test.e2e.prod.e'
// Préfixe de FAMILLE stable pour le nettoyage (motif éprouvé du projet,
// tests/e2e/arbre.spec.ts:8,44) ; suffixe aléatoire PAR EXÉCUTION pour les
// noms individuels, afin de ne jamais collisionner avec une exécution
// interrompue dont le nettoyage aurait échoué.
const PREFIXE_FAMILLE = 'ZZDemandesProdE2E-'
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

async function creerCompte(identifiant: string, administrateur: boolean): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email: identifiantVersEmail(identifiant),
    password: MDP,
    email_confirm: true,
  })
  if (error || !data.user) {
    throw new Error(`création du compte auth ${identifiant} impossible : ${error?.message}`)
  }
  const { error: erreurProfil } = await admin
    .from('profils')
    .insert({ id: data.user.id, identifiant, nom_affichage: `Test prod ${identifiant}` })
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
      throw new Error(`attribution du rôle administrateur à ${identifiant} impossible : ${erreurRole.message}`)
    }
  }
  return data.user.id
}

async function connecter(page: Page, identifiant: string) {
  await page.goto('/connexion')
  await page.getByLabel('Identifiant').fill(identifiant)
  await page.getByLabel('Mot de passe').fill(MDP)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page).toHaveURL(/\/tableau-de-bord/)
}

test.beforeAll(async () => {
  await admin.from('membres').delete().like('nom', `${PREFIXE_FAMILLE}%`)
  await supprimerCompte(IDENT_ADMIN)
  await supprimerCompte(IDENT_D)
  await supprimerCompte(IDENT_E)
})

test.afterAll(async () => {
  await admin.from('membres').delete().like('nom', `${PREFIXE_FAMILLE}%`)
  await supprimerCompte(IDENT_ADMIN)
  await supprimerCompte(IDENT_D)
  await supprimerCompte(IDENT_E)
  const { data: residus } = await admin
    .from('profils')
    .select('id')
    .in('identifiant', [IDENT_ADMIN, IDENT_D, IDENT_E])
  expect(residus ?? []).toHaveLength(0)
})

test('en production, un refus métier affiche son message exact — pas un digest React (membre_deja_rattache)', async ({
  page,
}) => {
  await creerCompte(IDENT_ADMIN, true)
  const idD = await creerCompte(IDENT_D, false)
  const idE = await creerCompte(IDENT_E, false)

  const { data: cible } = await admin
    .from('membres')
    .insert({ nom: `${PREFIXE}-cible`, prenom: 'Test', etat: 'actif' })
    .select('id')
    .single()
  // Simule une fiche déjà rattachée à D (setup direct, pas l'action sous test).
  const { error: erreurLiaison } = await admin.from('profils').update({ membre_id: cible!.id }).eq('id', idD)
  if (erreurLiaison) throw new Error(`préparation (liaison D) impossible : ${erreurLiaison.message}`)

  const { data: jetable } = await admin
    .from('membres')
    .insert({ nom: `${PREFIXE}-jetable`, prenom: 'Test', etat: 'en_attente' })
    .select('id')
    .single()
  const { error: erreurDemande } = await admin
    .from('demandes_membre')
    .insert({ origine: 'auto_inscription', demandeur_profil_id: idE, membre_id: jetable!.id, etat: 'en_attente' })
  if (erreurDemande) throw new Error(`préparation (demande) impossible : ${erreurDemande.message}`)

  await connecter(page, IDENT_ADMIN)
  await page.goto('/demandes')
  const ligne = page.locator('li', { hasText: `${PREFIXE}-jetable` })
  await ligne.getByLabel('Ou rattacher à une fiche existante').fill(`${PREFIXE}-cible`)
  await ligne.getByRole('button', { name: `Test ${PREFIXE}-cible` }).click()
  await ligne.getByRole('button', { name: 'Rattacher' }).click()

  // L'ASSERTION QUI COMPTE : le texte RÉELLEMENT affiché, contre un vrai build
  // de production, doit être le message métier exact — pas un digest React.
  await expect(ligne.getByRole('alert')).toHaveText(MESSAGE_MEMBRE_DEJA_RATTACHE)
})
