import { createClient } from '@supabase/supabase-js'
import { expect, test, type Page } from '@playwright/test'
import { identifiantVersEmail } from '../../src/lib/domaine/identifiant'
import {
  MESSAGE_SEANCE_SANS_ENSEIGNANT,
  MESSAGE_SEANCE_SANS_THEME,
} from '../../src/app/ael/seances/[id]/messages'

// Plusieurs sessions par test (admin, modérateur, parfois compte simple) : même
// discipline que `tests/e2e/antennes-membres.spec.ts` (mode serial, budget relevé).
test.describe.configure({ mode: 'serial', timeout: 60_000 })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const MDP = `Test-${crypto.randomUUID()}`
const IDENT_ADMIN = 'test.e2e.ael.admin'
const IDENT_MODERATEUR = 'test.e2e.ael.moderateur'
const IDENT_SIMPLE = 'test.e2e.ael.simple'
// Préfixe de FAMILLE stable pour le nettoyage (I6 de la ronde de correction) — voir
// `tests/e2e/ael-pointage.spec.ts` pour le raisonnement complet, même motif partout.
const FAMILLE = 'ZZAelSeanceDetail-'
const PREFIXE = `${FAMILLE}${crypto.randomUUID().slice(0, 8)}`

let idAntenne: string
let idEnseignant: string

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

async function creerCompte(identifiant: string, role: 'administrateur' | 'moderateur' | null) {
  const { data, error } = await admin.auth.admin.createUser({
    email: identifiantVersEmail(identifiant),
    password: MDP,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`création du compte ${identifiant} impossible : ${error?.message}`)
  const { error: erreurProfil } = await admin
    .from('profils')
    .insert({ id: data.user.id, identifiant, nom_affichage: `Test ${identifiant}` })
  if (erreurProfil) {
    await admin.auth.admin.deleteUser(data.user.id)
    throw new Error(`insertion du profil ${identifiant} impossible : ${erreurProfil.message}`)
  }
  if (role) {
    const { error: erreurRole } = await admin.from('roles_profil').insert({ profil_id: data.user.id, role })
    if (erreurRole) throw new Error(`attribution du rôle ${role} impossible : ${erreurRole.message}`)
  }
}

/**
 * Si `page` est déjà authentifiée, le middleware redirige toute visite de
 * `/connexion` directement vers `/tableau-de-bord` (`src/middleware.ts`) : le
 * formulaire n'est jamais rendu et `getByLabel('Identifiant')` attend en vain
 * jusqu'au délai (bogue déjà rencontré et corrigé à la Task 5-6, voir le registre
 * de la phase). Passer par `/deconnexion` avant de changer de compte DANS LA MÊME
 * page évite de reproduire ce même bogue ici.
 */
async function seConnecter(page: Page, identifiant: string) {
  await page.goto('/deconnexion')
  await page.goto('/connexion')
  await page.getByLabel('Identifiant').fill(identifiant)
  await page.getByLabel('Mot de passe', { exact: true }).fill(MDP)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page).toHaveURL(/\/tableau-de-bord/)
}

/** Crée une séance `prevue` directement en base, avec l'enseignant donné (ou aucun). */
async function creerSeance(options: {
  theme?: string | null
  enseignantMembreId?: string | null
}): Promise<string> {
  const { data, error } = await admin
    .from('seances_ael')
    .insert({
      date: '2026-09-01',
      theme: options.theme ?? null,
      enseignant_membre_id: options.enseignantMembreId ?? null,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`création de la séance impossible : ${error?.message}`)
  await admin.from('seances_ael_antennes').insert({ seance_id: data.id, antenne_id: idAntenne })
  return data.id as string
}

async function nettoyer() {
  // Retrouve les séances par le NOM de l'antenne (jointure `!inner`), sur `FAMILLE`
  // et non sur `PREFIXE` (I6 de la ronde de correction) : `PREFIXE` embarque un
  // identifiant tiré À CETTE EXÉCUTION, donc un nettoyage borné à lui ne retrouve
  // jamais ce qu'une exécution ANTÉRIEURE interrompue avant sa propre fin a laissé —
  // antenne, membres et séance sous un AUTRE suffixe de la même famille. `FAMILLE`,
  // stable d'une exécution à l'autre, les retrouve toutes. Ordre imposé par les FK
  // `on delete restrict` / le déclencheur de complétude (migration 20260817110000,
  // commentaire de `seances_ael.enseignant_membre_id`) : les séances d'abord, les
  // membres et l'antenne ensuite.
  const { data: jonctions } = await admin
    .from('seances_ael_antennes')
    .select('seance_id, antennes!inner(nom)')
    .like('antennes.nom', `${FAMILLE}%`)
  if (jonctions && jonctions.length > 0) {
    await admin.from('seances_ael').delete().in('id', jonctions.map((j) => j.seance_id))
  }
  await admin.from('membres').delete().like('nom', `${FAMILLE}%`)
  // Erreur VÉRIFIÉE, pas ignorée : `seances_ael_antennes.antenne_id` est en
  // `on delete restrict` (migration 20260817110000) — si une jonction vers une
  // antenne de cette famille subsistait (séance non retrouvée ci-dessus, par exemple
  // une jonction orpheline), cette suppression échouerait plutôt que de laisser une
  // antenne de test définitivement en base de PRODUCTION sans que rien ne le dise.
  const { error: erreurAntennes } = await admin.from('antennes').delete().like('nom', `${FAMILLE}%`)
  if (erreurAntennes) {
    throw new Error(`nettoyage des antennes de la famille impossible : ${erreurAntennes.message}`)
  }
  await supprimerCompte(IDENT_ADMIN)
  await supprimerCompte(IDENT_MODERATEUR)
  await supprimerCompte(IDENT_SIMPLE)
}

test.beforeAll(async () => {
  await nettoyer()

  const { data: antenne, error: erreurAntenne } = await admin
    .from('antennes')
    .insert({ nom: PREFIXE, pays: 'Test' })
    .select('id')
    .single()
  if (erreurAntenne || !antenne) throw new Error(`création de l'antenne impossible : ${erreurAntenne?.message}`)
  idAntenne = antenne.id as string

  const { data: enseignant, error: erreurEnseignant } = await admin
    .from('membres')
    .insert({ nom: `${PREFIXE}-enseignant`, prenom: 'Test', etat: 'actif' })
    .select('id')
    .single()
  if (erreurEnseignant || !enseignant) {
    throw new Error(`création de l'enseignant impossible : ${erreurEnseignant?.message}`)
  }
  idEnseignant = enseignant.id as string

  await creerCompte(IDENT_ADMIN, 'administrateur')
  await creerCompte(IDENT_MODERATEUR, 'moderateur')
  await creerCompte(IDENT_SIMPLE, null)
})

test.afterAll(async () => {
  await nettoyer()
  // Nettoyage vérifié par comptage, pas seulement par l'absence d'erreur de suppression
  // — sur FAMILLE (I6), pas seulement sur `PREFIXE` de cette exécution. Les SÉANCES ne
  // sont pas comptées séparément ici : chaque `creerSeance` de ce fichier les lie
  // TOUJOURS à une antenne de cette famille via `seances_ael_antennes`, laquelle est en
  // `on delete restrict` (migration 20260817110000) — `comptesAntennes === 0` ci-dessous
  // ne peut donc être vrai QUE si aucune jonction, et donc aucune séance de ce fichier,
  // ne subsiste (la suppression des antennes aurait échoué bruyamment sinon, voir
  // `nettoyer()`).
  const { count: comptesMembres } = await admin
    .from('membres')
    .select('id', { count: 'exact', head: true })
    .like('nom', `${FAMILLE}%`)
  expect(comptesMembres).toBe(0)
  const { count: comptesAntennes } = await admin
    .from('antennes')
    .select('id', { count: 'exact', head: true })
    .like('nom', `${FAMILLE}%`)
  expect(comptesAntennes).toBe(0)
  const { data: comptesResiduels } = await admin
    .from('profils')
    .select('id')
    .in('identifiant', [IDENT_ADMIN, IDENT_MODERATEUR, IDENT_SIMPLE])
  expect(comptesResiduels ?? []).toHaveLength(0)
})

test('un compte simple voit la fiche en lecture seule, sans formulaire ni bouton', async ({ page }) => {
  const idSeance = await creerSeance({ theme: `${PREFIXE}-theme-lecture`, enseignantMembreId: idEnseignant })

  await seConnecter(page, IDENT_SIMPLE)
  await page.goto(`/ael/seances/${idSeance}`)

  await expect(page.getByText(`${PREFIXE}-theme-lecture`)).toBeVisible()
  await expect(page.getByLabel('Thème')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Enregistrer' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Marquer tenue' })).toHaveCount(0)
})

test('un modérateur édite une séance normale sans rien perdre', async ({ page }) => {
  const idSeance = await creerSeance({ theme: `${PREFIXE}-theme-initial`, enseignantMembreId: idEnseignant })

  await seConnecter(page, IDENT_MODERATEUR)
  await page.goto(`/ael/seances/${idSeance}`)

  await expect(page.getByLabel('Thème')).toHaveValue(`${PREFIXE}-theme-initial`)
  await page.getByLabel('Thème').fill(`${PREFIXE}-theme-modifie`)
  await page.getByRole('button', { name: 'Enregistrer' }).click()

  await expect(async () => {
    const { data } = await admin.from('seances_ael').select('theme').eq('id', idSeance).single()
    expect(data!.theme).toBe(`${PREFIXE}-theme-modifie`)
  }).toPass()
})

test('le déclencheur de complétude refuse « tenue » sans thème puis sans enseignant, avec le bon message', async ({
  page,
}) => {
  const idSeance = await creerSeance({})

  await seConnecter(page, IDENT_MODERATEUR)
  await page.goto(`/ael/seances/${idSeance}`)

  await page.getByRole('button', { name: 'Marquer tenue' }).click()
  await expect(page.locator('p[role="alert"]')).toHaveText(MESSAGE_SEANCE_SANS_THEME)

  await page.getByLabel('Thème').fill(`${PREFIXE}-theme-completude`)
  await page.getByRole('button', { name: 'Marquer tenue' }).click()
  await expect(page.locator('p[role="alert"]')).toHaveText(MESSAGE_SEANCE_SANS_ENSEIGNANT)

  // Aucune des deux tentatives refusées n'a écrit quoi que ce soit sur `etat`.
  const { data } = await admin.from('seances_ael').select('etat').eq('id', idSeance).single()
  expect(data!.etat).toBe('prevue')
})

test("un enseignant DÉSIGNÉ mais ARCHIVÉ (fiche non consultable pour un modérateur) n'est jamais effacé par un enregistrement", async ({
  page,
}) => {
  const idSeance = await creerSeance({
    theme: `${PREFIXE}-theme-masque`,
    enseignantMembreId: idEnseignant,
  })

  // Archivé PAR UN ADMINISTRATEUR : la politique `membres_lecture` n'ouvre alors la
  // fiche qu'à un administrateur (supabase/migrations/20260812120000_membres.sql).
  const { error: erreurArchivage } = await admin.from('membres').update({ etat: 'archive' }).eq('id', idEnseignant)
  if (erreurArchivage) throw new Error(`archivage de l'enseignant impossible : ${erreurArchivage.message}`)

  try {
    await seConnecter(page, IDENT_MODERATEUR)
    await page.goto(`/ael/seances/${idSeance}`)

    // Le sélecteur normal ne doit PAS apparaître : la fiche est désignée mais masquée.
    await expect(page.getByText('Fiche non consultable')).toBeVisible()
    await expect(page.getByLabel("Enseignant (membre de l'équipe)")).toHaveCount(0)

    // Un modérateur corrige le thème et enregistre — LE CAS CRITIQUE du brief.
    await page.getByLabel('Thème').fill(`${PREFIXE}-theme-masque-corrige`)
    await page.getByRole('button', { name: 'Enregistrer' }).click()

    await expect(async () => {
      const { data } = await admin
        .from('seances_ael')
        .select('theme, enseignant_membre_id')
        .eq('id', idSeance)
        .single()
      expect(data!.theme).toBe(`${PREFIXE}-theme-masque-corrige`)
      // L'ASSERTION QUI COMPTE : l'enseignant archivé, invisible au modérateur, N'EST
      // PAS EFFACÉ par l'enregistrement.
      expect(data!.enseignant_membre_id).toBe(idEnseignant)
    }).toPass()

    // Contrôle positif : un ADMINISTRATEUR, lui, voit toujours la fiche (elle n'est pas
    // masquée dans l'absolu, seulement à ce compte modérateur) — sans quoi le test ne
    // discriminerait pas « masqué par la RLS » de « toujours affiché en texte fixe ».
    await seConnecter(page, IDENT_ADMIN)
    await page.goto(`/ael/seances/${idSeance}`)
    await expect(page.getByText('Fiche non consultable')).toHaveCount(0)
    await expect(page.getByLabel("Enseignant (membre de l'équipe)")).toBeVisible()
  } finally {
    await admin.from('membres').update({ etat: 'actif' }).eq('id', idEnseignant)
  }
})

test('réversibilité : marquer tenue, repasser à prévue, puis annuler — le pointage et les champs déjà saisis ne sont jamais perdus', async ({
  page,
}) => {
  const idSeance = await creerSeance({
    theme: `${PREFIXE}-theme-reversible`,
    enseignantMembreId: idEnseignant,
  })

  await seConnecter(page, IDENT_MODERATEUR)
  await page.goto(`/ael/seances/${idSeance}`)
  await page.getByRole('button', { name: 'Marquer tenue' }).click()

  await expect(async () => {
    const { data } = await admin.from('seances_ael').select('etat').eq('id', idSeance).single()
    expect(data!.etat).toBe('tenue')
  }).toPass()

  page.once('dialog', (dialogue) => dialogue.accept())
  await page.getByRole('button', { name: 'Repasser à prévue' }).click()

  await expect(async () => {
    const { data } = await admin.from('seances_ael').select('etat, theme').eq('id', idSeance).single()
    expect(data!.etat).toBe('prevue')
    // Le thème n'a pas été perdu par l'aller-retour : `remettrePrevue` n'écrit QUE
    // sur `etat` (D49).
    expect(data!.theme).toBe(`${PREFIXE}-theme-reversible`)
  }).toPass()

  await expect(page.getByLabel('Thème')).toHaveValue(`${PREFIXE}-theme-reversible`)
  await expect(page.getByRole('button', { name: 'Marquer tenue' })).toBeVisible()

  page.once('dialog', (dialogue) => dialogue.accept())
  await page.getByRole('button', { name: 'Annuler la séance' }).click()

  await expect(async () => {
    const { data } = await admin.from('seances_ael').select('etat').eq('id', idSeance).single()
    expect(data!.etat).toBe('annulee')
  }).toPass()
})
