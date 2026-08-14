import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'

// `timeout` relevé bien au-dessus des 30 s de `playwright.config.ts` : chacun de ces
// tests enchaîne DEUX connexions complètes (navigation, saisie, soumission, attente
// d'URL) et crée un second `browser.newContext()`. Ce n'est pas le contournement d'un
// défaut applicatif — c'est le coût réel de deux sessions dans un même test, et le
// budget par défaut a été calibré pour des tests à une seule session.
test.describe.configure({ mode: 'serial', timeout: 60_000 })

const IDENT_MODERATEUR = 'test.e2e.antennes.moderateur'
const IDENT_SIMPLE = 'test.e2e.antennes.simple'
const MDP_MODERATEUR = `Test-${crypto.randomUUID()}`
const MDP_SIMPLE = `Test-${crypto.randomUUID()}`
// Préfixe de FAMILLE stable pour le nettoyage (I6 de la ronde de correction) — voir
// `tests/e2e/ael-pointage.spec.ts` pour le raisonnement complet, même motif partout.
const FAMILLE = 'ZZAntennesMembres-'
const PREFIXE = `${FAMILLE}${crypto.randomUUID().slice(0, 8)}`
const NOM_ANTENNE = `${PREFIXE}-Antenne`

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

let idAntenne: string
let idAntenneInactive: string
let idMembreCible: string
let idMembreCanari: string

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

async function creerCompte(identifiant: string, mdp: string, role: 'moderateur' | null) {
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
    if (erreurRole) throw new Error(`attribution du rôle impossible : ${erreurRole.message}`)
  }
}

async function nettoyer() {
  await supprimerCompte(IDENT_MODERATEUR)
  await supprimerCompte(IDENT_SIMPLE)
  // Balayage de FAMILLE (I6), pas seulement `PREFIXE` de cette exécution : retrouve
  // aussi ce qu'une exécution ANTÉRIEURE interrompue avant sa propre fin a laissé, sous
  // un AUTRE suffixe aléatoire. LES MEMBRES D'ABORD, jamais après : `membres.antenne_id`
  // référence `antennes` en `on delete restrict` (migration 20260812120000, vérifié dans
  // le fichier avant d'écrire ce commentaire) — supprimer l'antenne avant ses membres
  // encore rattachés échouerait, laissant l'antenne de test en base de PRODUCTION.
  await admin.from('membres').delete().like('nom', `${FAMILLE}%`)
  const { error: erreurAntennes } = await admin.from('antennes').delete().like('nom', `${FAMILLE}%`)
  if (erreurAntennes) {
    throw new Error(`nettoyage des antennes de la famille impossible : ${erreurAntennes.message}`)
  }
}

test.beforeAll(async () => {
  await nettoyer()

  const { data: antenne, error: erreurAntenne } = await admin
    .from('antennes')
    .insert({ nom: NOM_ANTENNE, pays: 'Test' })
    .select('id')
    .single()
  if (erreurAntenne || !antenne) throw new Error(`création de l'antenne impossible : ${erreurAntenne?.message}`)
  idAntenne = antenne.id as string

  const { data: antenneInactive, error: erreurAntenneInactive } = await admin
    .from('antennes')
    .insert({ nom: `${NOM_ANTENNE}-inactive`, pays: 'Test', actif: false })
    .select('id')
    .single()
  if (erreurAntenneInactive || !antenneInactive) {
    throw new Error(`création de l'antenne inactive impossible : ${erreurAntenneInactive?.message}`)
  }
  idAntenneInactive = antenneInactive.id as string

  idMembreCible = await creerMembre('cible')
  idMembreCanari = await creerMembre('canari')

  await creerCompte(IDENT_MODERATEUR, MDP_MODERATEUR, 'moderateur')
  await creerCompte(IDENT_SIMPLE, MDP_SIMPLE, null)
})

test.afterAll(nettoyer)

async function seConnecter(page: import('@playwright/test').Page, identifiant: string, mdp: string) {
  await page.goto('/connexion')
  await page.getByLabel('Identifiant').fill(identifiant)
  await page.getByLabel('Mot de passe', { exact: true }).fill(mdp)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page).toHaveURL(/\/tableau-de-bord/)
}

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

async function antenneIdDuMembre(membreId: string): Promise<string | null> {
  const { data, error } = await admin.from('membres').select('antenne_id').eq('id', membreId).single()
  if (error) throw new Error(`lecture du membre impossible : ${error.message}`)
  return data.antenne_id as string | null
}

/** Capture les champs cachés du formulaire de rattachement, rendu à un compte autorisé. */
async function capturerChampsRattachement(
  page: import('@playwright/test').Page,
  antenneId: string,
): Promise<Record<string, string>> {
  await seConnecter(page, IDENT_MODERATEUR, MDP_MODERATEUR)
  await page.goto(`/antennes/${antenneId}`)
  const formulaire = page.locator('form').filter({ has: page.getByRole('button', { name: 'Rattacher' }) })
  const champs = extraireChampsCaches(await formulaire.evaluate((el) => el.outerHTML))
  verifierCaptureAction(champs)
  return champs
}

test("un modérateur rattache un membre à une antenne, par l'interface", async ({ page }) => {
  expect(await antenneIdDuMembre(idMembreCible)).toBeNull()

  await seConnecter(page, IDENT_MODERATEUR, MDP_MODERATEUR)
  await page.goto(`/antennes/${idAntenne}`)
  await page.getByLabel('Membre à rattacher').fill(`${PREFIXE}-cible`)
  await page.getByRole('button', { name: `${PREFIXE}-cible`, exact: false }).first().click()
  await page.getByRole('button', { name: 'Rattacher' }).click()

  await expect(async () => {
    expect(await antenneIdDuMembre(idMembreCible)).toBe(idAntenne)
  }).toPass()
})

test('un compte simple ne peut pas rattacher, par requête forgée', async ({ page, browser, baseURL }) => {
  // Repart d'un membre non rattaché : idMembreCanari, jamais touché par le test précédent.
  expect(await antenneIdDuMembre(idMembreCanari)).toBeNull()

  const champs = await capturerChampsRattachement(page, idAntenne)

  const contexte = await browser.newContext({ baseURL })
  try {
    const autrePage = await contexte.newPage()
    await seConnecter(autrePage, IDENT_SIMPLE, MDP_SIMPLE)

    await autrePage.request.post(`/antennes/${idAntenne}`, {
      multipart: { ...champs, antenneId: idAntenne, membreId: idMembreCanari },
    })

    // Seule assertion qui compte : rien n'a été écrit, quel qu'ait été le code HTTP.
    expect(await antenneIdDuMembre(idMembreCanari)).toBeNull()

    // Masquage d'interface, dans la même session.
    await autrePage.goto(`/antennes/${idAntenne}`)
    await expect(autrePage.getByRole('heading', { name: /Membres rattachés/ })).toBeVisible()
    await expect(autrePage.getByLabel('Membre à rattacher')).toHaveCount(0)
    await expect(autrePage.getByRole('button', { name: 'Détacher' })).toHaveCount(0)
  } finally {
    await contexte.close()
  }
})

test('canari : le même geste forgé réussit depuis un compte modérateur', async ({ page, browser, baseURL }) => {
  // Membre PROPRE à ce canari, créé ici et nulle part ailleurs. Réutiliser
  // `idMembreCanari` (celui du test précédent) coûterait cher : le fichier est en
  // `mode: 'serial'`, et lors de la PREUVE PAR MUTATION de l'étape 3 — garde neutralisé
  // — le test précédent écrirait réellement sur ce membre, faisant tomber la
  // précondition de ce canari par simple cascade. L'implémenteur verrait trois échecs
  // au lieu de deux, conclurait que la mutation a cassé autre chose, et serait tenté
  // d'« ajuster » le canari, c'est-à-dire d'affaiblir précisément le contrôle qui
  // garantit que le refus ne vient pas d'un mécanisme de forge cassé.
  const idMembreCanari2 = await creerMembre('canari-2')
  expect(await antenneIdDuMembre(idMembreCanari2)).toBeNull()

  const champs = await capturerChampsRattachement(page, idAntenne)

  const contexte = await browser.newContext({ baseURL })
  try {
    const autrePage = await contexte.newPage()
    await seConnecter(autrePage, IDENT_MODERATEUR, MDP_MODERATEUR)

    await autrePage.request.post(`/antennes/${idAntenne}`, {
      multipart: { ...champs, antenneId: idAntenne, membreId: idMembreCanari2 },
    })

    await expect(async () => {
      expect(await antenneIdDuMembre(idMembreCanari2)).toBe(idAntenne)
    }).toPass()
  } finally {
    await contexte.close()
  }
})

test('une antenne désactivée refuse un nouveau rattachement, avec un contrôle positif', async ({ page }) => {
  const idMembreRefuse = await creerMembre('refuse')

  // Pas de `seConnecter` explicite ici : `capturerChampsRattachement` (ci-dessous) se
  // connecte déjà. Un appel préalable a été essayé puis retiré — voir le rapport de
  // tâche : le middleware redirige toute visite de `/connexion` déjà authentifiée
  // directement vers `/tableau-de-bord` (src/middleware.ts, `if (surConnexion)`), donc
  // une seconde connexion y trouve un tableau de bord, jamais le formulaire, et
  // `getByLabel('Identifiant')` attend en vain jusqu'au timeout.

  // Le formulaire n'est pas rendu pour une antenne désactivée (Task 4, étape 2) : le
  // refus doit donc être éprouvé par une REQUÊTE FORGÉE, capturée sur l'antenne ACTIVE
  // (dont le formulaire existe) et rejouée avec `antenneId` substitué vers l'antenne
  // désactivée — exactement le scénario qu'un onglet resté ouvert reproduirait.
  const champs = await capturerChampsRattachement(page, idAntenne)
  await page.request.post(`/antennes/${idAntenneInactive}`, {
    multipart: { ...champs, antenneId: idAntenneInactive, membreId: idMembreRefuse },
  })
  expect(await antenneIdDuMembre(idMembreRefuse)).toBeNull()

  // Contrôle positif, DANS LE MÊME TEST : le même compte, le même mécanisme de
  // rattachement, contre l'antenne ACTIVE, doit réussir. Sans lui, le refus ci-dessus
  // pourrait aussi bien signifier « le formulaire forgé ne fonctionne plus ».
  await page.request.post(`/antennes/${idAntenne}`, {
    multipart: { ...champs, antenneId: idAntenne, membreId: idMembreRefuse },
  })
  await expect(async () => {
    expect(await antenneIdDuMembre(idMembreRefuse)).toBe(idAntenne)
  }).toPass()
})

test('un compte simple ne peut pas détacher, avec canari modérateur', async ({ page, browser, baseURL }) => {
  // idMembreCible a été rattaché au premier test de ce fichier.
  expect(await antenneIdDuMembre(idMembreCible)).toBe(idAntenne)

  await seConnecter(page, IDENT_MODERATEUR, MDP_MODERATEUR)
  await page.goto(`/antennes/${idAntenne}`)
  const formulaireDetachement = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Détacher' }) })
    .first()
  const champs = extraireChampsCaches(await formulaireDetachement.evaluate((el) => el.outerHTML))
  verifierCaptureAction(champs)
  // Le formulaire de détachement (`LigneMembreDetachable`, Task 4) ne porte PAS de
  // champ `antenneId` — seulement `membreId` et `pageAntenneId`. Un `antenneId`
  // réapparu ici transformerait le POST forgé en RATTACHEMENT (vers la même antenne,
  // donc un test qui ne pourrait plus rien discriminer) : contrôle explicite avant de
  // forger quoi que ce soit, plutôt qu'une supposition sur la forme du formulaire.
  expect(champs.antenneId).toBeUndefined()

  const contexteSimple = await browser.newContext({ baseURL })
  try {
    const pageSimple = await contexteSimple.newPage()
    await seConnecter(pageSimple, IDENT_SIMPLE, MDP_SIMPLE)
    await pageSimple.request.post(`/antennes/${idAntenne}`, {
      multipart: { ...champs, membreId: idMembreCible },
    })
    expect(await antenneIdDuMembre(idMembreCible)).toBe(idAntenne)
  } finally {
    await contexteSimple.close()
  }

  const contexteModerateur = await browser.newContext({ baseURL })
  try {
    const pageModerateur = await contexteModerateur.newPage()
    await seConnecter(pageModerateur, IDENT_MODERATEUR, MDP_MODERATEUR)
    await pageModerateur.request.post(`/antennes/${idAntenne}`, {
      multipart: { ...champs, membreId: idMembreCible },
    })
    expect(await antenneIdDuMembre(idMembreCible)).toBeNull()
  } finally {
    await contexteModerateur.close()
  }
})
