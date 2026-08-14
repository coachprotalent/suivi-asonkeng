import { createClient } from '@supabase/supabase-js'
import { expect, test, type Page } from '@playwright/test'

// L'ordre des tests fait partie du scénario, et les comptes sont partagés.
test.describe.configure({ mode: 'serial' })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const MDP = `Test-${crypto.randomUUID()}`
const IDENT_SIMPLE = 'test.e2e.evt.simple'
const IDENT_MODERATEUR = 'test.e2e.evt.moderateur'
const IDENT_ADMIN = 'test.e2e.evt.admin'
const IDENTS = [IDENT_SIMPLE, IDENT_MODERATEUR, IDENT_ADMIN]

const FAMILLE = 'ZZEvtE2E-'
const PREFIXE = `${FAMILLE}${crypto.randomUUID().slice(0, 8)}`
// Titre de l'évènement qu'un compte simple tentera de créer par requête forgée : il doit
// être RETROUVABLE en base pour prouver qu'il n'y est PAS.
const TITRE_FORGE = `${PREFIXE}-forge-simple`
const TITRE_CANARI = `${PREFIXE}-canari-moderateur`

let idType: string
let idEvenement: string
let idMembre: string
let idExterneAConvertir: string
let idExterneCanari: string
// I2 (revue des Tasks 22-24) : une conversion chemin 1 distincte, dédiée à la preuve que la
// garde ouverte par la Task 22 fonctionne par le VRAI CHEMIN APPLICATIF — pas par un rejeu
// RPC privilégié comme le fait tests/rls/conversion-participants.test.ts:346-363 (son propre
// commentaire le dit : « il les reproduit, il ne les observe pas »). Sans ce test, révoquer
// entièrement la Task 22 laisserait 191 tests RLS et 105 tests e2e verts.
let idExterneChemin1: string

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

async function creerCompte(identifiant: string, role: 'moderateur' | 'administrateur' | null) {
  const { data, error } = await admin.auth.admin.createUser({
    email: `${identifiant}@asonkeng.local`,
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
    const { error: erreurRole } = await admin
      .from('roles_profil')
      .insert({ profil_id: data.user.id, role })
    if (erreurRole) {
      await admin.auth.admin.deleteUser(data.user.id)
      throw new Error(`attribution du rôle ${role} impossible : ${erreurRole.message}`)
    }
  }
}

async function seConnecter(page: Page, identifiant: string) {
  await page.goto('/connexion')
  await page.getByLabel('Identifiant').fill(identifiant)
  await page.getByLabel('Mot de passe', { exact: true }).fill(MDP)
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

/**
 * Lève si la capture n'a trouvé aucun champ `$ACTION*` : mieux vaut un échec bruyant ici
 * qu'un test qui, silencieusement, ne teste plus rien. C'est le premier des deux filets
 * contre « le refus vient de la forge, pas du garde » ; le second est le canari.
 */
function verifierCaptureAction(champs: Record<string, string>): void {
  const trouve = Object.keys(champs).some((nom) => nom.startsWith('$ACTION'))
  if (!trouve) {
    throw new Error(
      `Capture invalide : aucun champ « $ACTION* » parmi ${JSON.stringify(Object.keys(champs))}. ` +
        "L'encodage des Server Actions a peut-être changé — ce test ne peut plus prouver ce qu'il prétend.",
    )
  }
}

async function nettoyer() {
  const { data: evts } = await admin.from('evenements').select('id').like('titre', `${FAMILLE}%`)
  const idsEvts = (evts ?? []).map((l) => l.id as string)
  const { data: externes } = await admin.from('participants_externes').select('id').like('nom', `${FAMILLE}%`)
  const idsExternes = (externes ?? []).map((l) => l.id as string)
  const { data: membres } = await admin.from('membres').select('id').like('nom', `${FAMILLE}%`)
  const idsMembres = (membres ?? []).map((l) => l.id as string)

  for (const [colonne, ids] of [
    ['evenement_id', idsEvts],
    ['participant_externe_id', idsExternes],
    ['membre_id', idsMembres],
  ] as const) {
    if (ids.length > 0) await admin.from('participations').delete().in(colonne, ids)
  }
  // Demandes AVANT les membres (`on delete set null` effacerait la prise), et
  // notifications avant les demandes : le chemin 1 emprunté par le test I2 en émet, et le
  // compte racine ne doit pas rester pollué — on peut le polluer sans jamais le toucher.
  if (idsMembres.length > 0) {
    const { data: demandes } = await admin.from('demandes_membre').select('id').in('membre_id', idsMembres)
    const idsDemandes = (demandes ?? []).map((l) => l.id as string)
    if (idsDemandes.length > 0) {
      await admin.from('notifications').delete().in('demande_id', idsDemandes)
      await admin.from('demandes_membre').delete().in('id', idsDemandes)
    }
  }
  if (idsExternes.length > 0) await admin.from('participants_externes').delete().in('id', idsExternes)
  if (idsMembres.length > 0) await admin.from('membres').delete().in('id', idsMembres)
  if (idsEvts.length > 0) await admin.from('evenements').delete().in('id', idsEvts)
  await admin.from('types_evenement').delete().like('libelle', `${FAMILLE}%`)
}

test.beforeAll(async () => {
  await nettoyer()
  for (const identifiant of IDENTS) await supprimerCompte(identifiant)

  await creerCompte(IDENT_SIMPLE, null)
  await creerCompte(IDENT_MODERATEUR, 'moderateur')
  await creerCompte(IDENT_ADMIN, 'administrateur')

  const { data: type, error: erreurType } = await admin
    .from('types_evenement')
    .insert({ libelle: `${PREFIXE}-type` })
    .select('id')
    .single()
  if (erreurType || !type) throw new Error(`création du type impossible : ${erreurType?.message}`)
  idType = type.id as string

  const { data: evt, error: erreurEvt } = await admin
    .from('evenements')
    .insert({ titre: `${PREFIXE}-evenement`, type_id: idType, date_debut: '2026-09-01' })
    .select('id')
    .single()
  if (erreurEvt || !evt) throw new Error(`création de l évènement impossible : ${erreurEvt?.message}`)
  idEvenement = evt.id as string

  const { data: membre, error: erreurMembre } = await admin
    .from('membres')
    .insert({ nom: `${PREFIXE}-membre`, prenom: 'Test', etat: 'actif' })
    .select('id')
    .single()
  if (erreurMembre || !membre) throw new Error(`création du membre impossible : ${erreurMembre?.message}`)
  idMembre = membre.id as string

  // Trois externes avec désir : l'un servira la tentative FORGÉE du modérateur, l'autre le
  // CANARI de l'administrateur, le troisième la preuve I2 du chemin 1 par le vrai parcours.
  // Trois cibles distinctes, sans quoi les tests se coupleraient et l'un échouerait sur la
  // précondition de l'autre plutôt que sur l'assertion qu'il vise.
  const { data: externes, error: erreurExternes } = await admin
    .from('participants_externes')
    .insert([
      { nom: `${PREFIXE}-x-forge`, prenom: 'Test' },
      { nom: `${PREFIXE}-x-canari`, prenom: 'Test' },
      { nom: `${PREFIXE}-x-chemin1`, prenom: 'Test' },
    ])
    .select('id, nom')
  if (erreurExternes || !externes || externes.length !== 3) {
    throw new Error(`création des externes impossible : ${erreurExternes?.message}`)
  }
  idExterneAConvertir = externes.find((x) => (x.nom as string).endsWith('-x-forge'))!.id as string
  idExterneCanari = externes.find((x) => (x.nom as string).endsWith('-x-canari'))!.id as string
  idExterneChemin1 = externes.find((x) => (x.nom as string).endsWith('-x-chemin1'))!.id as string

  const { error: erreurParts } = await admin.from('participations').insert([
    { evenement_id: idEvenement, participant_externe_id: idExterneAConvertir, desir_suivi_spirituel: true },
    { evenement_id: idEvenement, participant_externe_id: idExterneCanari, desir_suivi_spirituel: true },
    { evenement_id: idEvenement, participant_externe_id: idExterneChemin1, desir_suivi_spirituel: true },
  ])
  if (erreurParts) throw new Error(`participations impossibles : ${erreurParts.message}`)
})

test.afterAll(async () => {
  await nettoyer()
  // NETTOYAGE VÉRIFIÉ PAR COMPTAGE, sur la MÊME famille que la suppression.
  for (const [table, colonne] of [
    ['evenements', 'titre'],
    ['participants_externes', 'nom'],
    ['membres', 'nom'],
    ['types_evenement', 'libelle'],
  ] as const) {
    const { count } = await admin
      .from(table)
      .select('id', { count: 'exact', head: true })
      .like(colonne, `${FAMILLE}%`)
    expect(count, `résidu dans ${table}`).toBe(0)
  }
  for (const identifiant of IDENTS) await supprimerCompte(identifiant)
})

// ————————————————————————————————————————————————————————————————
// PREUVE N°15 — visibilité différenciée de /evenements/[id], DEPUIS CHAQUE RÔLE
// ————————————————————————————————————————————————————————————————

test("compte simple : l'en-tête de l'évènement s'affiche, la section participants est ABSENTE", async ({ page }) => {
  await seConnecter(page, IDENT_SIMPLE)
  await page.goto(`/evenements/${idEvenement}`)

  // CONTRÔLE POSITIF DANS LA MÊME SITUATION, ET IL EST OBLIGATOIRE : une assertion
  // négative seule ne distinguerait pas « la section est cachée » de « la page n'a pas
  // chargé ».
  await expect(page.getByRole('heading', { name: `${PREFIXE}-evenement` })).toBeVisible()
  await expect(page.getByText(`${PREFIXE}-type`)).toBeVisible()

  // La section n'est PAS VIDE, elle n'est PAS RENDUE. Un compte ordinaire qui lirait
  // `participations` sous RLS obtiendrait zéro ligne, et un évènement à cent participants
  // lui paraîtrait désert — un mensonge, pas une protection.
  await expect(page.getByRole('heading', { name: /^Participants/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Ajouter ce membre' })).toHaveCount(0)
  await expect(page.getByText('Trois désirs')).toHaveCount(0)
  // Ni le bloc de modification.
  await expect(page.getByText("Modifier l'évènement")).toHaveCount(0)
})

test('compte modérateur : la section participants et le bloc de modification sont présents', async ({ page }) => {
  await seConnecter(page, IDENT_MODERATEUR)
  await page.goto(`/evenements/${idEvenement}`)

  await expect(page.getByRole('heading', { name: `${PREFIXE}-evenement` })).toBeVisible()
  await expect(page.getByRole('heading', { name: /^Participants/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ajouter ce membre' })).toBeVisible()
  await expect(page.getByText("Modifier l'évènement")).toBeVisible()
})

test('compte administrateur : même visibilité que le modérateur, plus le lien vers le catalogue', async ({ page }) => {
  await seConnecter(page, IDENT_ADMIN)
  await page.goto(`/evenements/${idEvenement}`)
  await expect(page.getByRole('heading', { name: /^Participants/ })).toBeVisible()

  await page.goto('/evenements')
  await expect(page.getByRole('link', { name: 'Gérer les types' })).toBeVisible()
})

test("liste à traiter : le modérateur consulte mais ne voit NI conversion NI classement (D55)", async ({ page }) => {
  await seConnecter(page, IDENT_MODERATEUR)
  await page.goto('/evenements/a-traiter')

  // CONTRÔLE POSITIF : la liste est bien chargée et notre participant y figure.
  await expect(page.getByText(`${PREFIXE}-x-forge`)).toBeVisible()
  // Les deux gestes réservés à l'administrateur sont absents.
  await expect(page.getByText('Convertir en membre')).toHaveCount(0)
  await expect(page.getByText('Classer sans suite')).toHaveCount(0)
  // ÉCART SIGNALÉ PAR RAPPORT AU BRIEF : `getByText(...)` seul viole le mode strict de
  // Playwright dès que plus d'une ligne « à traiter » est présente (chacune porte son
  // propre paragraphe « réservés aux administrateurs ») — vérifié à l'exécution avec
  // les TROIS externes de cette suite. `.first()` vérifie ce que le test vise réellement
  // (au moins une ligne porte l'avertissement), sans dépendre du nombre de lignes.
  await expect(page.getByText('réservés aux administrateurs').first()).toBeVisible()
})

test("liste à traiter : un compte simple est redirigé vers le tableau de bord", async ({ page }) => {
  await seConnecter(page, IDENT_SIMPLE)
  await page.goto('/evenements/a-traiter')
  await expect(page).toHaveURL(/\/tableau-de-bord/)
})

// ————————————————————————————————————————————————————————————————
// PREUVE N°16 — gardes forgés, plus deux canaris
// ————————————————————————————————————————————————————————————————

test("un compte SIMPLE ne peut pas créer d'évènement par une requête forgée", async ({ page, browser, baseURL }) => {
  // Précondition : le titre visé n'existe pas encore. Sans elle, l'assertion finale
  // pourrait passer sur un résidu d'une exécution antérieure.
  const { count: avant } = await admin
    .from('evenements')
    .select('id', { count: 'exact', head: true })
    .eq('titre', TITRE_FORGE)
  expect(avant).toBe(0)

  await seConnecter(page, IDENT_ADMIN)
  await page.goto('/evenements')
  // Le `<details>` doit être ouvert pour que le formulaire soit dans le DOM.
  await page.getByText('Nouvel évènement').click()
  const formulaire = page.locator('form').filter({ has: page.getByRole('button', { name: 'Créer' }) })
  const champs = extraireChampsCaches(await formulaire.evaluate((el) => el.outerHTML))
  verifierCaptureAction(champs)

  const contexteSimple = await browser.newContext({ baseURL })
  try {
    const pageSimple = await contexteSimple.newPage()
    await seConnecter(pageSimple, IDENT_SIMPLE)
    await pageSimple.request.post('/evenements', {
      multipart: { ...champs, titre: TITRE_FORGE, typeId: idType, dateDebut: '2026-09-02' },
    })
  } finally {
    await contexteSimple.close()
  }

  // SEULE ASSERTION QUI COMPTE : aucune ligne n'a été créée, quel qu'ait été le code HTTP.
  const { count: apres } = await admin
    .from('evenements')
    .select('id', { count: 'exact', head: true })
    .eq('titre', TITRE_FORGE)
  expect(apres).toBe(0)
})

test("un compte SIMPLE ne peut pas ajouter une participation par une requête forgée", async ({ page, browser, baseURL }) => {
  const { count: avant } = await admin
    .from('participations')
    .select('id', { count: 'exact', head: true })
    .eq('evenement_id', idEvenement)
    .eq('membre_id', idMembre)
  expect(avant).toBe(0)

  await seConnecter(page, IDENT_ADMIN)
  await page.goto(`/evenements/${idEvenement}`)
  const formulaire = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Ajouter ce membre' }) })
  const champs = extraireChampsCaches(await formulaire.evaluate((el) => el.outerHTML))
  verifierCaptureAction(champs)

  const contexteSimple = await browser.newContext({ baseURL })
  try {
    const pageSimple = await contexteSimple.newPage()
    await seConnecter(pageSimple, IDENT_SIMPLE)
    await pageSimple.request.post(`/evenements/${idEvenement}`, {
      multipart: { ...champs, evenementId: idEvenement, membreId: idMembre },
    })
  } finally {
    await contexteSimple.close()
  }

  const { count: apres } = await admin
    .from('participations')
    .select('id', { count: 'exact', head: true })
    .eq('evenement_id', idEvenement)
    .eq('membre_id', idMembre)
  expect(apres).toBe(0)
})

test("un compte MODÉRATEUR ne peut pas convertir par une requête forgée (D55)", async ({ page, browser, baseURL }) => {
  const { data: avant } = await admin
    .from('participants_externes')
    .select('converti_en_membre_id')
    .eq('id', idExterneAConvertir)
    .single()
  expect(avant!.converti_en_membre_id).toBeNull()

  await seConnecter(page, IDENT_ADMIN)
  await page.goto('/evenements/a-traiter')
  await page
    .locator('li')
    .filter({ hasText: `${PREFIXE}-x-forge` })
    .getByText('Convertir en membre')
    .click()
  const formulaire = page
    .locator('li')
    .filter({ hasText: `${PREFIXE}-x-forge` })
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Convertir' }) })
  const champs = extraireChampsCaches(await formulaire.evaluate((el) => el.outerHTML))
  verifierCaptureAction(champs)

  const contexteModerateur = await browser.newContext({ baseURL })
  try {
    const pageModerateur = await contexteModerateur.newPage()
    await seConnecter(pageModerateur, IDENT_MODERATEUR)
    await pageModerateur.request.post('/evenements/a-traiter', {
      multipart: {
        ...champs,
        participantId: idExterneAConvertir,
        chemin: 'membre_existant',
        membreCibleId: idMembre,
      },
    })
  } finally {
    await contexteModerateur.close()
  }

  // VÉRIFICATION EN BASE : rien n'a été converti.
  const { data: apres } = await admin
    .from('participants_externes')
    .select('converti_en_membre_id')
    .eq('id', idExterneAConvertir)
    .single()
  expect(apres!.converti_en_membre_id).toBeNull()
})

test("un compte MODÉRATEUR ne peut pas classer sans suite par une requête forgée (D55)", async ({ page, browser, baseURL }) => {
  const { data: avant } = await admin
    .from('participants_externes')
    .select('classe_le')
    .eq('id', idExterneAConvertir)
    .single()
  expect(avant!.classe_le).toBeNull()

  await seConnecter(page, IDENT_ADMIN)
  await page.goto('/evenements/a-traiter')
  await page
    .locator('li')
    .filter({ hasText: `${PREFIXE}-x-forge` })
    .getByText('Classer sans suite')
    .first()
    .click()
  const formulaire = page
    .locator('li')
    .filter({ hasText: `${PREFIXE}-x-forge` })
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Classer sans suite' }) })
  const champs = extraireChampsCaches(await formulaire.evaluate((el) => el.outerHTML))
  verifierCaptureAction(champs)

  const contexteModerateur = await browser.newContext({ baseURL })
  try {
    const pageModerateur = await contexteModerateur.newPage()
    await seConnecter(pageModerateur, IDENT_MODERATEUR)
    await pageModerateur.request.post('/evenements/a-traiter', {
      multipart: { ...champs, participantId: idExterneAConvertir, motif: 'Tentative forgée' },
    })
  } finally {
    await contexteModerateur.close()
  }

  const { data: apres } = await admin
    .from('participants_externes')
    .select('classe_le, motif_classement')
    .eq('id', idExterneAConvertir)
    .single()
  expect(apres!.classe_le).toBeNull()
  expect(apres!.motif_classement).toBeNull()
})

test("CANARI 1 : un MODÉRATEUR RÉEL crée bien un évènement, dans un contexte neuf", async ({ page }) => {
  // Sans ce canari, les quatre refus ci-dessus pourraient venir d'une requête MAL FORMÉE
  // (encodage `$ACTION_*` changé, vérification d'origine durcie, formulaire remanié) et non
  // du garde — indiscernable, et vert pour toujours. Ici, le geste passe par l'INTERFACE,
  // depuis le rôle qui y a droit : s'il tombe, c'est l'application qui est en cause, pas la
  // sécurité, et personne ne pourra confondre les deux.
  await seConnecter(page, IDENT_MODERATEUR)
  await page.goto('/evenements')
  await page.getByText('Nouvel évènement').click()
  // ÉCART SIGNALÉ PAR RAPPORT AU BRIEF : `page.getByLabel('Type')` seul viole le mode
  // strict de Playwright — /evenements porte AUSSI un filtre par type au-dessus de la
  // liste (`<select name="typeId">` de la même page), et son propre `<label>` porte
  // aussi le texte « Type ». Vérifié à l'exécution (« resolved to 2 elements »). Scopé au
  // formulaire de création lui-même, motif déjà suivi par le test de forge ci-dessus.
  const formulaireCreation = page.locator('form').filter({ has: page.getByRole('button', { name: 'Créer' }) })
  await formulaireCreation.getByLabel('Titre').fill(TITRE_CANARI)
  await formulaireCreation.getByLabel('Type').selectOption({ label: `${PREFIXE}-type` })
  await formulaireCreation.getByLabel('Date de début').fill('2026-09-03')
  await formulaireCreation.getByRole('button', { name: 'Créer' }).click()

  await expect(page).toHaveURL(/\/evenements\/[0-9a-f-]{36}$/)
  const { count } = await admin
    .from('evenements')
    .select('id', { count: 'exact', head: true })
    .eq('titre', TITRE_CANARI)
  expect(count).toBe(1)
})

test("CANARI 2 : un ADMINISTRATEUR RÉEL convertit bien un participant, dans un contexte neuf", async ({ page }) => {
  await seConnecter(page, IDENT_ADMIN)
  await page.goto('/evenements/a-traiter')
  const ligne = page.locator('li').filter({ hasText: `${PREFIXE}-x-canari` })
  await ligne.getByText('Convertir en membre').click()
  // Chemin 3 : aucune fiche créée, AUCUNE demande, donc AUCUNE notification — le compte
  // racine n'est pas pollué par ce canari.
  await ligne.getByLabel('Rattacher à une fiche membre existante').check()
  await ligne.getByPlaceholder('Chercher par nom ou prénom').fill(`${PREFIXE}-membre`)
  await ligne.getByRole('button', { name: new RegExp(`${PREFIXE}-membre`) }).click()
  await ligne.getByRole('button', { name: 'Convertir' }).click()

  // VÉRIFICATION EN BASE, pas à l'écran : le lien est posé.
  await expect
    .poll(async () => {
      const { data } = await admin
        .from('participants_externes')
        .select('converti_en_membre_id')
        .eq('id', idExterneCanari)
        .single()
      return data?.converti_en_membre_id ?? null
    })
    .toBe(idMembre)
})

// ————————————————————————————————————————————————————————————————
// I2 (revue des Tasks 22-24, coordinateur) — LA GARDE OUVERTE PAR LA TASK 22 (D66),
// ÉPROUVÉE PAR LE VRAI CHEMIN APPLICATIF, PAS PAR UN REJEU RPC.
//
// `tests/rls/conversion-participants.test.ts:346-363` REJOUE les deux écritures de
// `validerDemandeNouvellePersonne` avec un client privilégié — son propre commentaire le
// dit : « il les reproduit, il ne les observe pas ». Aucun test, avant celui-ci, ne fait
// PASSER une demande d'origine `conversion_participant` PAR le bouton « Valider comme
// nouvelle personne » de /demandes. Révoquer entièrement la Task 22 (le passage de
// `conversion_participant` à travers la garde d'origine de `validerDemandeNouvellePersonne`,
// src/app/demandes/actions.ts:168) laisserait ce test-ci — et lui seul, ici — tomber :
// sans lui, 191 tests RLS et 105 tests e2e resteraient verts.
// ————————————————————————————————————————————————————————————————

test(
  "I2 : conversion chemin 1 achevée par le VRAI parcours de /demandes — la fiche passe " +
    'à `actif`, pas par un rejeu RPC',
  async ({ page }) => {
    await seConnecter(page, IDENT_ADMIN)
    await page.goto('/evenements/a-traiter')

    const ligneATraiter = page.locator('li').filter({ hasText: `${PREFIXE}-x-chemin1` })
    await ligneATraiter.getByText('Convertir en membre').click()
    // Chemin par défaut du composant : « Créer une fiche à valider » (`fiche_en_attente`),
    // déjà sélectionné — aucun radio à cliquer. Nom et prénom sont préremplis depuis le
    // participant externe (champs contrôlés).
    await ligneATraiter.getByRole('button', { name: 'Convertir' }).click()

    // La conversion crée une fiche `en_attente` ET une demande d'origine
    // `conversion_participant` (D65, D66) — attendu par sondage : la Server Action termine
    // avant que la revalidation de la liste n'ait fini de retirer la ligne.
    let idMembreChemin1: string | null = null
    await expect
      .poll(async () => {
        const { data } = await admin
          .from('participants_externes')
          .select('converti_en_membre_id')
          .eq('id', idExterneChemin1)
          .single()
        idMembreChemin1 = (data?.converti_en_membre_id as string | null) ?? null
        return idMembreChemin1
      })
      .not.toBeNull()

    const { data: membreAvant } = await admin
      .from('membres')
      .select('etat')
      .eq('id', idMembreChemin1!)
      .single()
    expect(membreAvant!.etat).toBe('en_attente')

    // LE VRAI PARCOURS APPLICATIF : /demandes, clic sur « Valider comme nouvelle personne »
    // — le SEUL geste de toute l'application qui fait passer une fiche `en_attente` à
    // `actif` (docblock de `ligne-demande-admin.tsx`, D66). C'est ce qui rend le chemin 1
    // ACHEVABLE, et c'est la raison d'être de la Task 22.
    await page.goto('/demandes')
    const ligneDemande = page.locator('li').filter({ hasText: `${PREFIXE}-x-chemin1` })
    // CONTRÔLE POSITIF : la demande est bien étiquetée « Conversion de participant », pas
    // « Demande de suivi » (I3 de la ronde du 2026-08-14, déjà refermé par la Task 22 —
    // reconfirmé ici en passant).
    // `.first()` : le texte « Conversion de participant » apparaît deux fois sur cette
    // ligne (l'étiquette d'origine ET la phrase d'explication qui suit), mode strict
    // Playwright oblige — vérifié à l'exécution.
    await expect(ligneDemande.getByText('Conversion de participant').first()).toBeVisible()
    await ligneDemande.getByRole('button', { name: 'Valider comme nouvelle personne' }).click()

    await expect
      .poll(async () => {
        const { data } = await admin.from('membres').select('etat').eq('id', idMembreChemin1!).single()
        return data?.etat ?? null
      })
      .toBe('actif')
  },
)
