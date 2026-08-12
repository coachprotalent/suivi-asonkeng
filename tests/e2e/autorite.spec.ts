import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'

// L'ordre des tests fait partie du scénario, et les comptes sont partagés.
test.describe.configure({ mode: 'serial' })

const IDENT_LIE = 'test.e2e.autorite.lie'
const IDENT_AUTRE = 'test.e2e.autorite.autre'
const IDENT_SANS_FICHE = 'test.e2e.autorite.sansfiche'
const MDP_LIE = `Test-${crypto.randomUUID()}`
const MDP_AUTRE = `Test-${crypto.randomUUID()}`
const MDP_SANS_FICHE = `Test-${crypto.randomUUID()}`
const PREFIXE = `ZZAutorite-${crypto.randomUUID().slice(0, 8)}`

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

let idRacine: string
let idEnfant: string
let idPetitEnfant: string
let idEtranger: string

async function creerMembre(suffixe: string, faiseurDeDiscipleId: string | null): Promise<string> {
  const { data, error } = await admin
    .from('membres')
    .insert({ nom: `${PREFIXE}-${suffixe}`, prenom: 'Test', faiseur_de_disciple_id: faiseurDeDiscipleId })
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

/**
 * Crée un compte NON administrateur et le lie éventuellement à une fiche.
 *
 * La liaison est posée directement en base : l'écran qui la pose n'arrive qu'à la
 * Task 14, et un test n'a pas à passer par l'interface pour préparer son état.
 */
async function creerCompte(identifiant: string, mdp: string, membreId: string | null) {
  const { data, error } = await admin.auth.admin.createUser({
    email: `${identifiant}@asonkeng.local`,
    password: mdp,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(error?.message)
  const { error: erreurProfil } = await admin.from('profils').insert({
    id: data.user.id,
    identifiant,
    nom_affichage: `Test ${identifiant}`,
    membre_id: membreId,
  })
  if (erreurProfil) {
    await admin.auth.admin.deleteUser(data.user.id)
    throw new Error(`insertion du profil impossible : ${erreurProfil.message}`)
  }
}

async function nettoyer() {
  for (const identifiant of [IDENT_LIE, IDENT_AUTRE, IDENT_SANS_FICHE]) {
    await supprimerCompte(identifiant)
  }
  // Les comptes d'abord : `profils.membre_id` est en `on delete set null`, mais
  // supprimer les fiches avant les comptes laisserait des profils à moitié nettoyés
  // si la suppression des comptes échouait ensuite.
  await admin.from('membres').delete().like('nom', 'ZZAutorite-%')
}

test.beforeAll(async () => {
  await nettoyer()

  idRacine = await creerMembre('racine', null)
  idEnfant = await creerMembre('enfant', idRacine)
  idPetitEnfant = await creerMembre('petit-enfant', idEnfant)
  idEtranger = await creerMembre('etranger', null)

  await creerCompte(IDENT_LIE, MDP_LIE, idRacine)
  await creerCompte(IDENT_AUTRE, MDP_AUTRE, idEtranger)
  await creerCompte(IDENT_SANS_FICHE, MDP_SANS_FICHE, null)
})

test.afterAll(nettoyer)

async function seConnecter(
  page: import('@playwright/test').Page,
  identifiant: string,
  mdp: string,
) {
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

/** Lève si la capture n'a trouvé aucun champ `$ACTION*` : mieux vaut un échec bruyant
 *  ici qu'un test qui, silencieusement, ne teste plus rien. */
function verifierCaptureAction(champs: Record<string, string>): void {
  const trouve = Object.keys(champs).some((nom) => nom.startsWith('$ACTION'))
  if (!trouve) {
    throw new Error(
      `Capture invalide : aucun champ « $ACTION* » parmi ${JSON.stringify(Object.keys(champs))}. ` +
        "L'encodage des Server Actions a peut-être changé — ce test ne peut plus prouver ce qu'il prétend.",
    )
  }
}

async function statutParLibelle(libelle: string): Promise<string> {
  const { data, error } = await admin.from('statuts').select('id').eq('libelle', libelle).single()
  if (error || !data) throw new Error(`statut « ${libelle} » introuvable : ${error?.message}`)
  return data.id as string
}

async function compterMembreStatut(membreId: string, statutId: string): Promise<number> {
  const { data, error } = await admin
    .from('membre_statuts')
    .select('statut_id')
    .eq('membre_id', membreId)
    .eq('statut_id', statutId)
  if (error) throw new Error(`lecture de membre_statuts impossible : ${error.message}`)
  return (data ?? []).length
}

/**
 * Relève les champs cachés du formulaire d'attribution depuis une session QUI A
 * l'autorité — c'est la seule qui se voit rendre ce formulaire.
 */
async function capturerChampsAttribution(
  page: import('@playwright/test').Page,
  membreId: string,
): Promise<Record<string, string>> {
  await seConnecter(page, IDENT_LIE, MDP_LIE)
  await page.goto(`/membres/${membreId}/statuts`)
  const formulaire = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Attribuer ce statut' }) })
  const champs = extraireChampsCaches(await formulaire.evaluate((el) => el.outerHTML))
  verifierCaptureAction(champs)
  return champs
}

test("un compte lié a autorité sur un membre de son sous-arbre", async ({ page }) => {
  // La branche « ancêtre à n'importe quelle profondeur » du §5.1 : le compte est lié à
  // la RACINE, la cible est deux niveaux plus bas.
  const idStatut = await statutParLibelle('Repenti')
  expect(await compterMembreStatut(idPetitEnfant, idStatut)).toBe(0)

  await seConnecter(page, IDENT_LIE, MDP_LIE)
  await page.goto(`/membres/${idPetitEnfant}/statuts`)

  await page.getByLabel('Statut (obligatoire)').selectOption({ label: 'Repenti' })
  await page.getByRole('button', { name: 'Attribuer ce statut' }).click()

  // Assertion EN BASE, et non sur l'écran : c'est l'écriture qui compte.
  await expect(async () => {
    expect(await compterMembreStatut(idPetitEnfant, idStatut)).toBe(1)
  }).toPass()
})

test("un compte lié hors du sous-arbre ne peut pas écrire, par requête forgée", async ({
  page,
  browser,
  baseURL,
}) => {
  const idStatut = await statutParLibelle('Sert dans une commission')
  expect(await compterMembreStatut(idPetitEnfant, idStatut)).toBe(0)

  const champs = await capturerChampsAttribution(page, idPetitEnfant)

  const contexte = await browser.newContext({ baseURL })
  try {
    const autrePage = await contexte.newPage()
    await seConnecter(autrePage, IDENT_AUTRE, MDP_AUTRE)

    await autrePage.request.post(`/membres/${idPetitEnfant}/statuts`, {
      multipart: { ...champs, statutId: idStatut },
    })

    // Seule assertion qui compte : rien n'a été écrit, quel qu'ait été le code HTTP.
    expect(await compterMembreStatut(idPetitEnfant, idStatut)).toBe(0)
  } finally {
    await contexte.close()
  }
})

test("un compte sans membre lié ne peut pas écrire, par requête forgée", async ({
  page,
  browser,
  baseURL,
}) => {
  // LE PIÈGE DU COMPTE RACINE, éprouvé pour de vrai : `membre_id` vaut null. Si
  // `peutModifier` laissait ce null atteindre ses comparaisons, ce compte aurait
  // autorité sur toute fiche sans dirigeant — c'est-à-dire presque toutes.
  const idStatut = await statutParLibelle("Baptisé d'eau")
  expect(await compterMembreStatut(idPetitEnfant, idStatut)).toBe(0)

  const champs = await capturerChampsAttribution(page, idPetitEnfant)

  const contexte = await browser.newContext({ baseURL })
  try {
    const autrePage = await contexte.newPage()
    await seConnecter(autrePage, IDENT_SANS_FICHE, MDP_SANS_FICHE)

    await autrePage.request.post(`/membres/${idPetitEnfant}/statuts`, {
      multipart: { ...champs, statutId: idStatut },
    })

    expect(await compterMembreStatut(idPetitEnfant, idStatut)).toBe(0)
  } finally {
    await contexte.close()
  }
})

test("canari : la même requête forgée réussit depuis un compte qui a l'autorité", async ({
  page,
}) => {
  // Contrôle positif. Si les deux refus ci-dessus passaient un jour parce que la forge
  // est cassée — encodage `$ACTION_*` changé, formulaire remanié — et non parce que le
  // garde refuse, rien ne le dirait sans ce test. Ici, exactement le même mécanisme,
  // depuis une session AUTORISÉE : l'écriture doit réussir.
  //
  // Les deux classes d'échec ont des signatures qui ne se recouvrent pas. Forge cassée
  // => `verifierCaptureAction` lève, avec un message explicite, dans les TROIS tests
  // qui l'emploient. Garde régressé => un test de refus échoue sur un compteur pendant
  // que ce canari, lui, RÉUSSIT.
  const idStatut = await statutParLibelle('Baptisé du Saint-Esprit')
  expect(await compterMembreStatut(idPetitEnfant, idStatut)).toBe(0)

  try {
    const champs = await capturerChampsAttribution(page, idPetitEnfant)

    await page.request.post(`/membres/${idPetitEnfant}/statuts`, {
      multipart: { ...champs, statutId: idStatut },
    })

    expect(await compterMembreStatut(idPetitEnfant, idStatut)).toBe(1)
  } finally {
    await admin
      .from('membre_statuts')
      .delete()
      .eq('membre_id', idPetitEnfant)
      .eq('statut_id', idStatut)
  }
})
