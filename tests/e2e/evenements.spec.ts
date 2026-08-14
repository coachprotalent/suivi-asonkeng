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
// I2 (revue FINALE de branche) : deux cibles DÉDIÉES aux canaris qui rejouent la forge
// depuis le rôle autorisé. Elles ne peuvent pas être partagées avec `idExterneAConvertir` :
// convertir celui-ci le ferait DISPARAÎTRE de `participants_a_traiter` (la vue exclut les
// convertis, D74) et la capture du formulaire de classement, faite depuis cette liste,
// n'aurait plus de ligne où s'accrocher ; et `classer_participant_externe` refuse un
// participant déjà converti (`participant_deja_converti`, 20260818230000:52).
let idExterneCanariConversion: string
let idExterneCanariClassement: string

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
/**
 * M11 — la conversion porte désormais une confirmation `window.confirm`. Playwright
 * REJETTE automatiquement toute boîte de dialogue non gérée : sans ce branchement, le clic
 * sur « Convertir » serait annulé et le test échouerait sur l'assertion suivante, sans que
 * rien ne dise que c'est la confirmation qui l'a bloqué.
 *
 * Le message est CAPTURÉ ET RENDU, pas seulement accepté : l'appelant s'en sert comme
 * CONTRÔLE POSITIF de l'existence de la confirmation. Une confirmation retirée par
 * inadvertance laisserait sinon ces tests parfaitement verts — exactement le défaut que ce
 * fichier corrige par ailleurs.
 */
function capterConfirmation(page: Page): { texte: string | null } {
  const capture: { texte: string | null } = { texte: null }
  page.once('dialog', async (dialogue) => {
    capture.texte = dialogue.message()
    await dialogue.accept()
  })
  return capture
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

/**
 * M10 / revue finale — DEUX CORRECTIONS ICI, et la seconde est la moins évidente.
 *
 * 1. CHAQUE `delete` VÉRIFIE SON ERREUR. Huit suppressions passaient auparavant sans le
 *    moindre contrôle : une seule refusée (`on delete restrict`, ordre changé) laissait des
 *    lignes en base de PRODUCTION sans que rien ne le dise.
 *
 * 2. `demandes_membre` ET `notifications` N'ONT AUCUNE COLONNE PRÉFIXABLE : une fois les
 *    membres supprimés, plus rien ne permet de retrouver a posteriori les lignes que ce
 *    fichier a créées — le comptage de résidus serait INVÉRIFIABLE APRÈS COUP. D'où le
 *    retour : les identifiants des demandes visées sont capturés AVANT la suppression et
 *    rendus à l'appelant, qui recompte dessus. C'est la discipline « un marqueur qui vit en
 *    base » appliquée à deux tables qui n'en ont pas.
 *
 * Le chemin 1, emprunté par le test I2, crée une demande ET notifie TOUS les administrateurs
 * actifs, LE COMPTE RACINE COMPRIS (`convertirParticipant`, actions.ts, le dit nommément) :
 * on peut polluer le compte racine sans jamais le toucher.
 */
async function nettoyer(): Promise<{ idsDemandes: string[] }> {
  async function verifier(libelle: string, promesse: PromiseLike<{ error: { message: string } | null }>) {
    const { error } = await promesse
    if (error) throw new Error(`nettoyage impossible (${libelle}) : ${error.message}`)
  }

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
    if (ids.length > 0) {
      await verifier(`participations.${colonne}`, admin.from('participations').delete().in(colonne, ids))
    }
  }
  // Demandes AVANT les membres (`on delete set null` effacerait la prise), et
  // notifications avant les demandes (`demande_id` en clé étrangère).
  let idsDemandes: string[] = []
  if (idsMembres.length > 0) {
    const { data: demandes, error: erreurDemandes } = await admin
      .from('demandes_membre')
      .select('id')
      .in('membre_id', idsMembres)
    if (erreurDemandes) throw new Error(`lecture des demandes impossible : ${erreurDemandes.message}`)
    idsDemandes = (demandes ?? []).map((l) => l.id as string)
    if (idsDemandes.length > 0) {
      await verifier('notifications', admin.from('notifications').delete().in('demande_id', idsDemandes))
      await verifier('demandes_membre', admin.from('demandes_membre').delete().in('id', idsDemandes))
    }
  }
  if (idsExternes.length > 0) {
    await verifier('participants_externes', admin.from('participants_externes').delete().in('id', idsExternes))
  }
  if (idsMembres.length > 0) await verifier('membres', admin.from('membres').delete().in('id', idsMembres))
  if (idsEvts.length > 0) await verifier('evenements', admin.from('evenements').delete().in('id', idsEvts))
  await verifier('types_evenement', admin.from('types_evenement').delete().like('libelle', `${FAMILLE}%`))
  return { idsDemandes }
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

  // Cinq externes avec désir, CINQ CIBLES DISTINCTES : la tentative FORGÉE du modérateur,
  // le CANARI par interface de l'administrateur, la preuve I2 du chemin 1 par le vrai
  // parcours, puis les deux cibles des canaris PAR LA FORGE (conversion et classement).
  // Sans cette séparation, les tests se coupleraient et l'un échouerait sur la précondition
  // de l'autre plutôt que sur l'assertion qu'il vise.
  const { data: externes, error: erreurExternes } = await admin
    .from('participants_externes')
    .insert([
      { nom: `${PREFIXE}-x-forge`, prenom: 'Test' },
      { nom: `${PREFIXE}-x-canari`, prenom: 'Test' },
      { nom: `${PREFIXE}-x-chemin1`, prenom: 'Test' },
      { nom: `${PREFIXE}-x-canforge-conv`, prenom: 'Test' },
      { nom: `${PREFIXE}-x-canforge-clas`, prenom: 'Test' },
    ])
    .select('id, nom')
  if (erreurExternes || !externes || externes.length !== 5) {
    throw new Error(`création des externes impossible : ${erreurExternes?.message}`)
  }
  idExterneAConvertir = externes.find((x) => (x.nom as string).endsWith('-x-forge'))!.id as string
  idExterneCanari = externes.find((x) => (x.nom as string).endsWith('-x-canari'))!.id as string
  idExterneChemin1 = externes.find((x) => (x.nom as string).endsWith('-x-chemin1'))!.id as string
  idExterneCanariConversion = externes.find((x) => (x.nom as string).endsWith('-x-canforge-conv'))!.id as string
  idExterneCanariClassement = externes.find((x) => (x.nom as string).endsWith('-x-canforge-clas'))!.id as string

  const { error: erreurParts } = await admin.from('participations').insert([
    { evenement_id: idEvenement, participant_externe_id: idExterneAConvertir, desir_suivi_spirituel: true },
    { evenement_id: idEvenement, participant_externe_id: idExterneCanari, desir_suivi_spirituel: true },
    { evenement_id: idEvenement, participant_externe_id: idExterneChemin1, desir_suivi_spirituel: true },
    { evenement_id: idEvenement, participant_externe_id: idExterneCanariConversion, desir_suivi_spirituel: true },
    { evenement_id: idEvenement, participant_externe_id: idExterneCanariClassement, desir_suivi_spirituel: true },
  ])
  if (erreurParts) throw new Error(`participations impossibles : ${erreurParts.message}`)
})

test.afterAll(async () => {
  const { idsDemandes } = await nettoyer()
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
  // LES DEUX TABLES QUE LE CHEMIN 1 ALIMENTE, recomptées sur les identifiants capturés
  // avant la suppression — voir l'encadré de `nettoyer()`. Aucun préfixe n'existe ici, et
  // `notifications` atteint le compte racine.
  if (idsDemandes.length > 0) {
    const { count: residuDemandes } = await admin
      .from('demandes_membre')
      .select('id', { count: 'exact', head: true })
      .in('id', idsDemandes)
    expect(residuDemandes, 'résidu dans demandes_membre').toBe(0)
    const { count: residuNotifs } = await admin
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .in('demande_id', idsDemandes)
    expect(residuNotifs, 'résidu dans notifications').toBe(0)
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

// M4 — INTITULÉ CORRIGÉ. Il annonçait « plus le lien vers le catalogue », laissant croire que
// ce lien distingue l'administrateur du modérateur. C'est faux : `/evenements` le rend sous
// `peutGerer` (page.tsx:83-102), donc au modérateur AUSSI. Ce test vérifie que
// l'administrateur a la même visibilité que le modérateur, rien de plus — et le lien du
// catalogue en fait partie.
test('compte administrateur : même visibilité que le modérateur, lien vers le catalogue compris', async ({ page }) => {
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

  // CANARI PAR LE MÊME CANAL — voir l'encadré « POURQUOI LE CANARI DOIT EMPRUNTER LA
  // FORGE » plus bas. Exactement le même `request.post`, depuis la session qui a le droit.
  await page.request.post('/evenements', {
    multipart: { ...champs, titre: TITRE_FORGE, typeId: idType, dateDebut: '2026-09-02' },
  })
  const { count: canari } = await admin
    .from('evenements')
    .select('id', { count: 'exact', head: true })
    .eq('titre', TITRE_FORGE)
  expect(canari, "la forge n'atteint plus l'action : le refus ci-dessus ne prouve plus rien").toBe(1)
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

  // CANARI PAR LE MÊME CANAL. C'est ici qu'il manquait le plus : avant cette correction, ce
  // test n'avait AUCUN contrôle positif d'aucune sorte — ni forge autorisée, ni geste
  // équivalent par l'interface —, et `expect(apres).toBe(0)` était une assertion purement
  // négative que rien n'accompagnait.
  await page.request.post(`/evenements/${idEvenement}`, {
    multipart: { ...champs, evenementId: idEvenement, membreId: idMembre },
  })
  const { count: canari } = await admin
    .from('participations')
    .select('id', { count: 'exact', head: true })
    .eq('evenement_id', idEvenement)
    .eq('membre_id', idMembre)
  expect(canari, "la forge n'atteint plus l'action : le refus ci-dessus ne prouve plus rien").toBe(1)
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

  // CANARI PAR LE MÊME CANAL, sur la garde LA PLUS CRITIQUE de la phase : `.rpc()` passant
  // par `clientAdmin()`, `exigerAdministrateur` est la SEULE protection de ce chemin, et la
  // conversion est IRRÉVERSIBLE. Même `request.post`, mêmes champs `$ACTION_*`, seule la
  // cible change (voir la déclaration d'`idExterneCanariConversion`).
  await page.request.post('/evenements/a-traiter', {
    multipart: {
      ...champs,
      participantId: idExterneCanariConversion,
      chemin: 'membre_existant',
      membreCibleId: idMembre,
    },
  })
  await expect
    .poll(async () => {
      const { data } = await admin
        .from('participants_externes')
        .select('converti_en_membre_id')
        .eq('id', idExterneCanariConversion)
        .single()
      return data?.converti_en_membre_id ?? null
    }, { message: "la forge n'atteint plus l'action : le refus ci-dessus ne prouve plus rien" })
    .toBe(idMembre)
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

  // CANARI PAR LE MÊME CANAL, sur une cible dédiée.
  await page.request.post('/evenements/a-traiter', {
    multipart: { ...champs, participantId: idExterneCanariClassement, motif: 'Canari de forge' },
  })
  await expect
    .poll(async () => {
      const { data } = await admin
        .from('participants_externes')
        .select('classe_le')
        .eq('id', idExterneCanariClassement)
        .single()
      return data?.classe_le ?? null
    }, { message: "la forge n'atteint plus l'action : le refus ci-dessus ne prouve plus rien" })
    .not.toBeNull()
})

// ————————————————————————————————————————————————————————————————
// POURQUOI LE CANARI DOIT EMPRUNTER LA FORGE, ET PAS L'INTERFACE
//
// AFFIRMATION FAUSSE CORRIGÉE ICI (revue finale de branche, I2). Ce bloc disait : « Sans ce
// canari, les quatre refus ci-dessus pourraient venir d'une requête MAL FORMÉE (encodage
// `$ACTION_*` changé, VÉRIFICATION D'ORIGINE DURCIE, formulaire remanié) et non du garde […]
// ICI, LE GESTE PASSE PAR L'INTERFACE ». Passer par l'interface est PRÉCISÉMENT ce qui rend
// un canari incapable d'exclure ce qu'il nommait :
//  - l'interface soumet par le canal JavaScript de `useActionState` (en-tête `Next-Action`) ;
//  - la forge soumet un `multipart` reconstitué depuis les champs `$ACTION_*`.
// DEUX CANAUX DIFFÉRENTS. Qu'un durcissement d'origine côté Next fasse échouer les quatre
// POST forgés POUR CE MOTIF-LÀ, et les quatre assertions « rien n'a été écrit » restent
// vertes, ces deux canaris-ci restent verts eux aussi — pendant que plus RIEN n'éprouve
// `exigerAdministrateur` devant `convertirParticipant`, seule protection d'un geste
// IRRÉVERSIBLE puisque le `.rpc()` passe par `clientAdmin()`.
//
// C'est le motif que le registre a nommé à propos de la preuve n°5 : le canal de
// vérification doit être capable de distinguer ce qu'on lui demande de distinguer. Le bon
// standard existait déjà dans cette branche (`evenements-liste.spec.ts:271-275`,
// `evenements-types.spec.ts:238` et `:275`, `evenements-detail.spec.ts:267` — ce dernier
// documentant que ce mode de défaillance S'EST DÉJÀ PRODUIT dans cette phase) ; les quatre
// forges ci-dessus le reprennent désormais.
//
// `verifierCaptureAction` ne comble pas ce trou : elle vérifie qu'un champ `$ACTION*` EXISTE
// dans le HTML, pas que le POST reconstitué est ACCEPTÉ.
//
// CE QUE LES DEUX CANARIS CI-DESSOUS PROUVENT RÉELLEMENT, et qui reste utile : que le geste
// aboutit par LE VRAI PARCOURS UTILISATEUR, formulaire compris. C'est une autre question que
// celle de la forge, et ils sont conservés pour elle — sous un intitulé qui ne promet plus
// de couvrir la première.
// ————————————————————————————————————————————————————————————————

test("PARCOURS RÉEL 1 : un MODÉRATEUR crée bien un évènement PAR L'INTERFACE, dans un contexte neuf", async ({ page }) => {
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

test("PARCOURS RÉEL 2 : un ADMINISTRATEUR convertit bien un participant PAR L'INTERFACE, dans un contexte neuf", async ({ page }) => {
  await seConnecter(page, IDENT_ADMIN)
  await page.goto('/evenements/a-traiter')
  const ligne = page.locator('li').filter({ hasText: `${PREFIXE}-x-canari` })
  await ligne.getByText('Convertir en membre').click()
  // Chemin 3 : aucune fiche créée, AUCUNE demande, donc AUCUNE notification — le compte
  // racine n'est pas pollué par ce canari.
  await ligne.getByLabel('Rattacher à une fiche membre existante').check()
  await ligne.getByPlaceholder('Chercher par nom ou prénom').fill(`${PREFIXE}-membre`)
  await ligne.getByRole('button', { name: new RegExp(`${PREFIXE}-membre`) }).click()
  const confirmation = capterConfirmation(page)
  await ligne.getByRole('button', { name: 'Convertir' }).click()
  // CONTRÔLE POSITIF de la confirmation de M11, et de la branche du chemin 3 en particulier.
  await expect.poll(() => confirmation.texte).toContain('rattachés à la fiche membre choisie')

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
    const confirmation = capterConfirmation(page)
    await ligneATraiter.getByRole('button', { name: 'Convertir' }).click()
    // CONTRÔLE POSITIF de la confirmation de M11, branche du chemin 1.
    await expect.poll(() => confirmation.texte).toContain("l'écran des demandes")

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
