import { createClient } from '@supabase/supabase-js'
import { expect, test, type Locator, type Page } from '@playwright/test'

test.describe.configure({ mode: 'serial' })

const IDENT_ADMIN = 'test.e2e.evdetail.admin'
const IDENT_MODERATEUR = 'test.e2e.evdetail.mod'
const IDENT_SIMPLE = 'test.e2e.evdetail.simple'
const MDP_ADMIN = `Test-${crypto.randomUUID()}`
const MDP_MODERATEUR = `Test-${crypto.randomUUID()}`
const MDP_SIMPLE = `Test-${crypto.randomUUID()}`
// M9 DE LA REVUE FINALE — NETTOYAGE SUR LES FAMILLES, PAS SUR LES SUFFIXES ALÉATOIRES. Le
// suffixe évite une collision entre deux exécutions ; le BALAYAGE doit porter sur la
// FAMILLE, sans quoi une exécution interrompue laisse en base de PRODUCTION des lignes que
// plus rien ne retrouvera — leur suffixe étant mort avec le processus. Convention reprise de
// `tests/rls/evenements.test.ts:14-19`.
// LE TIRET LITTÉRAL EST INDISPENSABLE ICI, ET PAS SEULEMENT PAR CONVENTION : `ZZEvDetail`
// est un PRÉFIXE de `ZZEvDetailType`. Balayer `ZZEvDetail%` ramasserait les types avec les
// évènements et violerait l'ordre de suppression (`type_id` en `on delete restrict`).
// `ZZEvDetail-%` s'arrête au tiret et ne peut pas atteindre `ZZEvDetailType-...`.
const FAMILLE_EVENEMENTS = 'ZZEvDetail-'
const FAMILLE_TYPES = 'ZZEvDetailType-'
const PREFIXE_EVENEMENTS = `${FAMILLE_EVENEMENTS}${crypto.randomUUID().slice(0, 8)}`
const PREFIXE_TYPES = `${FAMILLE_TYPES}${crypto.randomUUID().slice(0, 8)}`

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

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
  // Les événements d'abord (`type_id` est en `on delete restrict` : supprimer un type
  // encore référencé échouerait). L'ORDRE compte davantage encore depuis le balayage par
  // famille : il ramasse aussi les résidus d'exécutions antérieures, donc des évènements
  // qu'aucune ligne de ce processus n'a créés.
  const { error: erreurEvts } = await admin
    .from('evenements')
    .delete()
    .like('titre', `${FAMILLE_EVENEMENTS}%`)
  if (erreurEvts) throw new Error(`nettoyage des évènements impossible : ${erreurEvts.message}`)
  const { error: erreurTypes } = await admin
    .from('types_evenement')
    .delete()
    .like('libelle', `${FAMILLE_TYPES}%`)
  if (erreurTypes) throw new Error(`nettoyage des types impossible : ${erreurTypes.message}`)
  await supprimerCompte(IDENT_ADMIN)
  await supprimerCompte(IDENT_MODERATEUR)
  await supprimerCompte(IDENT_SIMPLE)
}

/** NETTOYAGE VÉRIFIÉ PAR COMPTAGE, sur les MÊMES familles que la suppression (M9). */
async function verifierAucunResidu() {
  for (const [table, colonne, famille] of [
    ['evenements', 'titre', FAMILLE_EVENEMENTS],
    ['types_evenement', 'libelle', FAMILLE_TYPES],
  ] as const) {
    const { count, error } = await admin
      .from(table)
      .select('id', { count: 'exact', head: true })
      .like(colonne, `${famille}%`)
    if (error) throw new Error(`comptage des résidus impossible : ${error.message}`)
    expect(count, `résidu dans ${table}`).toBe(0)
  }
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

let idTypeA: string
let idEvenement: string
let titreEvenement: string

test.beforeAll(async () => {
  await nettoyer()
  await creerCompte(IDENT_ADMIN, MDP_ADMIN, 'administrateur')
  await creerCompte(IDENT_MODERATEUR, MDP_MODERATEUR, 'moderateur')
  await creerCompte(IDENT_SIMPLE, MDP_SIMPLE, null)

  const { data: typeA, error: erreurType } = await admin
    .from('types_evenement')
    .insert({ libelle: `${PREFIXE_TYPES}-A`, ordre: 0 })
    .select('id')
    .single()
  if (erreurType || !typeA) throw new Error(`création du type impossible : ${erreurType?.message}`)
  idTypeA = typeA.id as string

  titreEvenement = `${PREFIXE_EVENEMENTS}-Principal`
  const { data: evenement, error: erreurEvenement } = await admin
    .from('evenements')
    .insert({
      titre: titreEvenement,
      type_id: idTypeA,
      date_debut: '2026-10-01',
      lieu: 'Douala',
    })
    .select('id')
    .single()
  if (erreurEvenement || !evenement) throw new Error(`création de l'évènement impossible : ${erreurEvenement?.message}`)
  idEvenement = evenement.id as string
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

function formulaireEdition(page: Page) {
  return page.locator('details').filter({ has: page.getByRole('button', { name: 'Enregistrer' }) })
}

test("un compte simple voit l'en-tête, sans le bloc de modification", async ({ page }) => {
  await seConnecter(page, IDENT_SIMPLE, MDP_SIMPLE)
  await page.goto(`/evenements/${idEvenement}`)

  // Contrôle POSITIF : la fiche affiche réellement les vraies données de l'évènement,
  // pas une page cassée qui masquerait tout par accident.
  await expect(page.getByRole('heading', { name: titreEvenement })).toBeVisible()
  await expect(page.getByText('Douala')).toBeVisible()

  await expect(page.getByText("Modifier l'évènement")).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Enregistrer' })).toHaveCount(0)
})

test('un modérateur modifie un évènement, sans redirection, et la modification est écrite en base', async ({
  page,
}) => {
  await seConnecter(page, IDENT_MODERATEUR, MDP_MODERATEUR)
  await page.goto(`/evenements/${idEvenement}`)

  await page.getByText("Modifier l'évènement").click()
  const formulaire = formulaireEdition(page)
  await formulaire.getByLabel('Lieu').fill('Bafoussam')
  await formulaire.getByRole('button', { name: 'Enregistrer' }).click()

  // AUCUN redirect() : on reste sur la même URL.
  await expect(page).toHaveURL(new RegExp(`/evenements/${idEvenement}$`))

  await expect(async () => {
    const { data, error } = await admin.from('evenements').select('lieu').eq('id', idEvenement).single()
    if (error) throw error
    expect(data.lieu).toBe('Bafoussam')
  }).toPass()
})

test('désactiver le type courant ne le fait PAS basculer silencieusement à un enregistrement ultérieur', async ({
  page,
}) => {
  // LE CAS QUI COMPTE (brief, étape 4, point 4). `typesEvenementActifs()` ne rend que les
  // types ACTIFS : sans `typeCourant`, le <select> ne proposerait même plus le type A, et
  // enregistrer sans y toucher basculerait l'évènement vers le premier type actif de la
  // liste — un changement de type qu'AUCUN utilisateur n'aurait demandé.
  const { error } = await admin.from('types_evenement').update({ actif: false }).eq('id', idTypeA)
  if (error) throw new Error(`désactivation du type impossible : ${error.message}`)

  try {
    await seConnecter(page, IDENT_ADMIN, MDP_ADMIN)
    await page.goto(`/evenements/${idEvenement}`)
    await page.getByText("Modifier l'évènement").click()
    const formulaire = formulaireEdition(page)

    // Le type courant, désactivé, doit rester PROPOSÉ et SÉLECTIONNÉ, marqué comme tel.
    // `<option>` n'est jamais "visible" au sens de Playwright (rendu par le widget natif
    // du navigateur) : on vérifie sa PRÉSENCE et son texte, pas sa visibilité.
    const selectType = formulaire.getByLabel('Type')
    await expect(selectType).toHaveValue(idTypeA)
    const optionTypeA = formulaire.locator(`option[value="${idTypeA}"]`)
    await expect(optionTypeA).toHaveCount(1)
    await expect(optionTypeA).toHaveText(`${PREFIXE_TYPES}-A (désactivé)`)

    // Enregistrement SANS toucher au type.
    await formulaire.getByLabel('Lieu').fill('Bafoussam, salle 2')
    await formulaire.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(async () => {
      const { data: verif, error: erreurVerif } = await admin
        .from('evenements')
        .select('lieu')
        .eq('id', idEvenement)
        .single()
      if (erreurVerif) throw erreurVerif
      expect(verif.lieu).toBe('Bafoussam, salle 2')
    }).toPass()

    // L'ASSERTION QUI COMPTE : le type n'a PAS bougé.
    const { data, error: erreurLecture } = await admin
      .from('evenements')
      .select('type_id')
      .eq('id', idEvenement)
      .single()
    if (erreurLecture) throw new Error(`lecture impossible : ${erreurLecture.message}`)
    expect(data.type_id).toBe(idTypeA)
  } finally {
    await admin.from('types_evenement').update({ actif: true }).eq('id', idTypeA)
  }
})

test("visiter la fiche d'un évènement inexistant rend une page 404, pas une erreur", async ({ page }) => {
  await seConnecter(page, IDENT_ADMIN, MDP_ADMIN)
  const reponse = await page.goto('/evenements/00000000-0000-0000-0000-000000000000')
  expect(reponse?.status()).toBe(404)
})

// --- Requête forgée contre modifierEvenement ------------------------------------

function verifierCaptureAction(champs: Record<string, string>): void {
  const trouve = Object.keys(champs).some((nom) => nom.startsWith('$ACTION'))
  if (!trouve) {
    throw new Error(
      `Capture invalide : aucun champ « $ACTION* » parmi ${JSON.stringify(Object.keys(champs))}. ` +
        "L'encodage des Server Actions a peut-être changé — ce test ne peut plus prouver ce qu'il prétend.",
    )
  }
}

/**
 * Contrairement au formulaire d'attribution de statut (un seul <select> obligatoire),
 * celui-ci porte PLUSIEURS champs obligatoires visibles (titre, type, date de début) qui
 * ne sont PAS des `<input type="hidden">` : `extraireChampsCaches` seule les manquerait,
 * et la requête forgée échouerait sur `colonnesEvenementDepuisFormulaire` (titre absent)
 * AVANT MÊME D'ATTEINDRE `exigerModerateurOuAdministrateur` — un refus qui ressemblerait
 * à un refus d'autorité sans en être un, pour le compte simple COMME pour le canari.
 * Constaté à l'exécution : le canari échouait avec cette seule capture. `new
 * FormData(form)` (exécuté dans la page) capture TOUT ce qu'un vrai navigateur enverrait,
 * hidden ou non.
 */
async function extraireDonneesFormulaire(formulaire: Locator): Promise<Record<string, string>> {
  return formulaire.locator('form').evaluate((form: HTMLFormElement) => {
    const donnees = new FormData(form)
    const objet: Record<string, string> = {}
    for (const [cle, valeur] of donnees.entries()) {
      if (typeof valeur === 'string') objet[cle] = valeur
    }
    return objet
  })
}

test("un compte simple ne peut pas modifier un évènement par une requête forgée ; le même rejeu réussit en modérateur (canari)", async ({
  page,
  browser,
  baseURL,
}) => {
  await seConnecter(page, IDENT_MODERATEUR, MDP_MODERATEUR)
  await page.goto(`/evenements/${idEvenement}`)
  await page.getByText("Modifier l'évènement").click()
  const formulaire = formulaireEdition(page)
  const champs = await extraireDonneesFormulaire(formulaire)
  verifierCaptureAction(champs)

  const contexteSimple = await browser.newContext({ baseURL })
  try {
    const pageSimple = await contexteSimple.newPage()
    await seConnecter(pageSimple, IDENT_SIMPLE, MDP_SIMPLE)

    await pageSimple.request.post(`/evenements/${idEvenement}`, {
      multipart: { ...champs, lieu: 'Forgé-Refuse' },
    })

    const { data } = await admin.from('evenements').select('lieu').eq('id', idEvenement).single()
    expect(data?.lieu).not.toBe('Forgé-Refuse')
  } finally {
    await contexteSimple.close()
  }

  // Canari : exactement le même mécanisme, depuis une session modératrice, doit réussir.
  await page.request.post(`/evenements/${idEvenement}`, {
    multipart: { ...champs, lieu: 'Forgé-Reussi' },
  })
  await expect(async () => {
    const { data, error } = await admin.from('evenements').select('lieu').eq('id', idEvenement).single()
    if (error) throw error
    expect(data.lieu).toBe('Forgé-Reussi')
  }).toPass()
})
