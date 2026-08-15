import { createClient } from '@supabase/supabase-js'
import { expect, test, type Page } from '@playwright/test'
import { identifiantVersEmail } from '../../src/lib/domaine/identifiant'

test.describe.configure({ mode: 'serial' })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const MDP = `Test-${crypto.randomUUID()}`
const IDENT_ADMIN = 'test.e2e.creation.admin'
const IDENT_SIMPLE = 'test.e2e.creation.simple'
const IDENT_MODERATEUR = 'test.e2e.creation.moderateur'

// PRÉFIXE DE FAMILLE STABLE : retrouvable après une interruption.
const PREFIXE_FAMILLE = 'ZZCreationE2E-'
const PREFIXE = `${PREFIXE_FAMILLE}${crypto.randomUUID().slice(0, 8)}`
// Trois noms DÉDIÉS : un par forge, un pour le canari. Partager un nom rendrait le canari
// indistinguable d'un refus qui aurait fuité.
const NOM_FORGE_SIMPLE = `${PREFIXE}-forge-simple`
const NOM_FORGE_MODERATEUR = `${PREFIXE}-forge-moderateur`
const NOM_CANARI = `${PREFIXE}-canari`

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
 *  qu'un test qui, silencieusement, ne teste plus rien. */
function verifierCaptureAction(champs: Record<string, string>): void {
  const trouve = Object.keys(champs).some((nom) => nom.startsWith('$ACTION'))
  if (!trouve) {
    throw new Error(
      `Capture invalide : aucun champ « $ACTION* » parmi ${JSON.stringify(Object.keys(champs))}. ` +
        "L'encodage des Server Actions a peut-être changé — ce test ne peut plus prouver ce qu'il prétend.",
    )
  }
}

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

async function creerCompte(identifiant: string, roles: string[]): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email: identifiantVersEmail(identifiant),
    password: MDP,
    email_confirm: true,
  })
  if (error || !data.user) {
    throw new Error(`création du compte ${identifiant} impossible : ${error?.message}`)
  }
  const { error: erreurProfil } = await admin
    .from('profils')
    .insert({ id: data.user.id, identifiant, nom_affichage: `Test création ${identifiant}` })
  if (erreurProfil) {
    await admin.auth.admin.deleteUser(data.user.id)
    throw new Error(`insertion du profil ${identifiant} impossible : ${erreurProfil.message}`)
  }
  for (const role of roles) {
    const { error: erreurRole } = await admin
      .from('roles_profil')
      .insert({ profil_id: data.user.id, role })
    if (erreurRole) {
      await admin.auth.admin.deleteUser(data.user.id)
      throw new Error(`attribution du rôle ${role} impossible : ${erreurRole.message}`)
    }
  }
  return data.user.id
}

async function seConnecter(page: Page, identifiant: string) {
  await page.goto('/connexion')
  await page.getByLabel('Identifiant').fill(identifiant)
  await page.getByLabel('Mot de passe').fill(MDP)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page).toHaveURL(/\/tableau-de-bord/)
}

async function compterFichesNommees(nom: string): Promise<number> {
  const { count, error } = await admin
    .from('membres')
    .select('id', { count: 'exact', head: true })
    .eq('nom', nom)
  if (error) throw new Error(`comptage impossible : ${error.message}`)
  // `count === null` LÈVE, il ne retombe PAS sur 0. Ce compteur sert trois assertions de
  // SÉCURITÉ (« ce rôle n'a écrit aucune fiche ») : un comptage absent de la réponse
  // PostgREST y deviendrait « aucune fiche », c'est-à-dire un refus RÉUSSI, pour une
  // panne. Même discipline que `totalObligatoire` dans `pagination.ts`.
  if (count === null) throw new Error(`comptage absent de la réponse PostgREST pour « ${nom} »`)
  return count
}

/**
 * Nombre total de lignes de `membre_statuts` et de `journal_statuts`, SANS AUCUN FILTRE.
 *
 * Employé en DELTA, jamais en absolu. C'est la seule mesure qui puisse voir une écriture
 * partielle sous un `membre_id` que le NOM ne trahit pas — précisément le scénario que
 * cette preuve prétend fermer, et qu'un balayage par préfixe de nom ne peut pas voir.
 *
 * `error` vérifié et `count === null` levé aux deux comptages : sans cela, une panne de
 * lecture rendrait deux `null`, et `null === null` ferait passer le delta.
 */
async function compterEcrituresDeStatuts(): Promise<{ statuts: number; journal: number }> {
  const { count: statuts, error: erreurStatuts } = await admin
    .from('membre_statuts')
    .select('statut_id', { count: 'exact', head: true })
  if (erreurStatuts) throw new Error(`comptage des statuts impossible : ${erreurStatuts.message}`)
  if (statuts === null) throw new Error('comptage des statuts absent de la réponse PostgREST')

  const { count: journal, error: erreurJournal } = await admin
    .from('journal_statuts')
    .select('id', { count: 'exact', head: true })
  if (erreurJournal) throw new Error(`comptage du journal impossible : ${erreurJournal.message}`)
  if (journal === null) throw new Error('comptage du journal absent de la réponse PostgREST')

  return { statuts, journal }
}

test.beforeAll(async () => {
  await admin.from('membres').delete().like('nom', `${PREFIXE_FAMILLE}%`)
  for (const identifiant of [IDENT_ADMIN, IDENT_SIMPLE, IDENT_MODERATEUR]) {
    await supprimerCompte(identifiant)
  }
  await creerCompte(IDENT_ADMIN, ['administrateur'])
  await creerCompte(IDENT_SIMPLE, [])
  await creerCompte(IDENT_MODERATEUR, ['moderateur'])
})

test.afterAll(async () => {
  await admin.from('membres').delete().like('nom', `${PREFIXE_FAMILLE}%`)
  for (const identifiant of [IDENT_ADMIN, IDENT_SIMPLE, IDENT_MODERATEUR]) {
    await supprimerCompte(identifiant)
  }
  // COMPTAGE DE CONTRÔLE INDÉPENDANT du balayage.
  const { count } = await admin
    .from('membres')
    .select('id', { count: 'exact', head: true })
    .like('nom', `${PREFIXE_FAMILLE}%`)
  expect(count).toBe(0)
  const { data: residus, error: erreurResidus } = await admin
    .from('profils')
    .select('id')
    .in('identifiant', [IDENT_ADMIN, IDENT_SIMPLE, IDENT_MODERATEUR])
  // `error` VÉRIFIÉ, et assertion SANS `?? []` : sur échec de lecture, `data` vaut `null`,
  // et `residus ?? []` convertirait la panne en « aucun résidu ». Un contrôle de nettoyage
  // qui ne peut plus échouer ne contrôle plus rien.
  if (erreurResidus) throw new Error(`lecture des profils résiduels impossible : ${erreurResidus.message}`)
  expect(residus).toHaveLength(0)
})

/**
 * PREUVE N°8 — LE GARDE DE LA CRÉATION ENRICHIE (D90), FORGÉ DEPUIS DEUX RÔLES, AVEC
 * CANARI PAR LE MÊME CANAL.
 *
 * Un compte SIMPLE et un compte MODÉRATEUR forgent tous deux l'appel. Le modérateur n'est
 * pas un doublon du simple : il a des pouvoirs réels ailleurs dans l'application (AEL,
 * évènements, rattachement d'antenne), et c'est précisément le rôle dont on pourrait
 * croire qu'il crée aussi des fiches. Il ne le peut pas : la création est réservée à
 * l'administrateur (§5.2).
 */
test('un compte SIMPLE puis un compte MODÉRATEUR ne peuvent pas créer de fiche par requête forgée', async ({
  page,
  browser,
  baseURL,
}) => {
  // PRÉCONDITION : les trois noms visés n'existent pas encore. Sans elle, l'assertion
  // finale pourrait passer sur un résidu.
  expect(await compterFichesNommees(NOM_FORGE_SIMPLE)).toBe(0)
  expect(await compterFichesNommees(NOM_FORGE_MODERATEUR)).toBe(0)
  expect(await compterFichesNommees(NOM_CANARI)).toBe(0)

  // ÉCRITURES DE STATUTS AVANT LES FORGES. Voir plus bas pour ce que ce delta ferme, et
  // pourquoi il est GLOBAL.
  const ecrituresAvant = await compterEcrituresDeStatuts()

  // Capture des champs `$ACTION_*` depuis une session ADMINISTRATEUR : ce sont des
  // références déterministes à la fonction serveur pour cette version du code, pas un
  // secret lié à la session.
  await seConnecter(page, IDENT_ADMIN)
  await page.goto('/membres/nouveau')
  const formulaire = page.locator('form').filter({
    has: page.getByRole('button', { name: 'Créer la fiche' }),
  })
  const champs = extraireChampsCaches(await formulaire.evaluate((el) => el.outerHTML))
  verifierCaptureAction(champs)

  for (const [identifiant, nomVise] of [
    [IDENT_SIMPLE, NOM_FORGE_SIMPLE],
    [IDENT_MODERATEUR, NOM_FORGE_MODERATEUR],
  ] as const) {
    const contexte = await browser.newContext({ baseURL })
    try {
      const autrePage = await contexte.newPage()
      await seConnecter(autrePage, identifiant)
      await autrePage.request.post('/membres/nouveau', {
        multipart: { ...champs, prenom: 'Forge', nom: nomVise, reportInitialAel: '0' },
      })
    } finally {
      await contexte.close()
    }

    // SEULE ASSERTION QUI COMPTE : aucune ligne créée, quel qu'ait été le code HTTP.
    expect(await compterFichesNommees(nomVise), `${identifiant} a écrit une fiche`).toBe(0)
  }

  /*
    ═══ AUCUNE ÉCRITURE DE STATUT NI DE JOURNAL, ET LA MESURE EST UN DELTA GLOBAL ═══

    Une écriture PARTIELLE — la fiche refusée mais un `membre_statuts` laissé derrière —
    serait le pire des résultats, et c'est ce que ces deux nombres ferment.

    POURQUOI GLOBAL, ET NON RESTREINT AUX FICHES DU PRÉFIXE. Un balayage par préfixe de nom
    ne peut voir que les lignes rattachées à une fiche que le NOM trahit. Or le scénario
    craint est justement celui d'une écriture sous un `membre_id` que le nom ne trahit pas —
    une fiche partiellement créée puis annulée laisserait des lignes orphelines qu'aucun
    `like 'ZZ…%'` ne retrouverait. Un tel balayage, de surcroît, serait ici INERTE : ce test
    est le premier de la suite en mode `serial`, aucune fiche du préfixe n'existe encore, et
    `.in('membre_id', [])` ne matcherait rien — vrai par construction, donc sans valeur.

    POURQUOI UN DELTA, ET NON UN ABSOLU. Ces deux tables portent des lignes RÉELLES : la
    base sert aussi de production. Un absolu y serait faux dès le premier vrai statut
    attribué. Le prix du delta est connu et assumé : une attribution de statut faite par un
    administrateur réel PENDANT ce test le ferait échouer. Les suites e2e sont sérialisées
    (`workers: 1`) et durent quelques secondes ; c'est le meilleur compromis disponible.

    LA MESURE EST PRISE ICI, AVANT LE CANARI : celui-ci crée légitimement une fiche, sans
    aucun statut — mais mesurer après lui ferait dépendre le résultat d'un succès attendu.
  */
  const ecrituresApres = await compterEcrituresDeStatuts()
  expect(
    ecrituresApres.statuts,
    'une forge refusée a laissé une ligne dans membre_statuts',
  ).toBe(ecrituresAvant.statuts)
  expect(
    ecrituresApres.journal,
    'une forge refusée a laissé une ligne dans journal_statuts',
  ).toBe(ecrituresAvant.journal)

  // ═══ CANARI PAR LE MÊME CANAL ═══
  // Exactement le même `request.post`, depuis la session qui a le droit. S'il échoue,
  // c'est le MÉCANISME DE FORGE qui est cassé — et les deux refus ci-dessus ne prouvent
  // plus rien du tout. Un canari passant par l'interface ne dirait pas cela.
  await page.request.post('/membres/nouveau', {
    multipart: { ...champs, prenom: 'Canari', nom: NOM_CANARI, reportInitialAel: '0' },
  })
  expect(
    await compterFichesNommees(NOM_CANARI),
    "la forge n'atteint plus l'action : les refus ci-dessus ne prouvent plus rien",
  ).toBe(1)
})

/**
 * Masquage d'interface — utile, mais SECOND. Il ne protège rien : il dit seulement qu'un
 * compte non administrateur ne se voit pas proposer un geste qu'il ne peut pas faire.
 */
test("l'écran de création est inatteignable pour un compte non administrateur", async ({ page }) => {
  await seConnecter(page, IDENT_SIMPLE)
  await page.goto('/membres')
  await expect(page.getByRole('link', { name: 'Nouveau membre' })).toHaveCount(0)
  await page.goto('/membres/nouveau')
  await expect(page).toHaveURL(/\/tableau-de-bord/)
})

/**
 * CHEMIN NOMINAL COMPLET, DEPUIS L'ÉCRAN : fiche + statut + faiseur de disciple, en une
 * seule soumission, et les trois vérifiés EN BASE.
 *
 * Ce test n'est pas redondant avec la suite RLS : celle-ci appelle la passerelle
 * directement, celui-ci éprouve la chaîne complète — formulaire contrôlé, `FormData`,
 * `lignesStatutsDepuisFormData`, contrôle amont, `rpc`, redirection.
 */
test('un administrateur crée une fiche AVEC statut et faiseur de disciple en une soumission', async ({
  page,
}) => {
  const { data: faiseur, error } = await admin
    .from('membres')
    .insert({ nom: `${PREFIXE}-faiseur`, prenom: 'Test' })
    .select('id')
    .single()
  if (error || !faiseur) throw new Error(`préparation impossible : ${error?.message}`)

  await seConnecter(page, IDENT_ADMIN)
  await page.goto('/membres/nouveau')

  await page.getByLabel('Prénom (obligatoire)', { exact: true }).fill('Nominal')
  await page.getByLabel('Nom (obligatoire)', { exact: true }).fill(`${PREFIXE}-nominal`)

  await page.getByRole('button', { name: 'Ajouter un statut' }).click()
  const selectStatut = page.getByLabel('Statut', { exact: true })
  await expect(selectStatut).toHaveCount(1)
  // Le premier statut réellement proposé, quel qu'il soit : figer un libellé rendrait ce
  // test dépendant du catalogue amorcé.
  const valeurStatut = await selectStatut.locator('option').nth(1).getAttribute('value')
  expect(valeurStatut, 'aucun statut proposé : le catalogue est vide, ce test ne prouve rien').toBeTruthy()
  await selectStatut.selectOption(valeurStatut!)

  const zoneFaiseur = page.locator('div').filter({ hasText: /^Faiseur de disciple/ }).last()
  await zoneFaiseur.getByPlaceholder('Chercher par nom ou prénom').fill(`${PREFIXE}-faiseur`)
  await page.getByRole('button', { name: `Test ${PREFIXE}-faiseur` }).click()

  await page.getByRole('button', { name: 'Créer la fiche' }).click()
  await expect(page).toHaveURL(/\/membres\/[0-9a-f-]{36}$/)

  const { data: creee } = await admin
    .from('membres')
    .select('id, faiseur_de_disciple_id')
    .eq('nom', `${PREFIXE}-nominal`)
    .single()
  expect(creee?.faiseur_de_disciple_id).toBe(faiseur.id)

  const { count: statuts } = await admin
    .from('membre_statuts')
    .select('statut_id', { count: 'exact', head: true })
    .eq('membre_id', creee!.id)
  expect(statuts).toBe(1)

  const { count: journal } = await admin
    .from('journal_statuts')
    .select('id', { count: 'exact', head: true })
    .eq('membre_id', creee!.id)
  expect(journal).toBe(1)
})
