import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { expect, test, type Page } from '@playwright/test'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const PREFIXE_COMPTE = 'test.e2e.inscription.'
const PREFIXE_CODE = 'test-e2e-inscription-'
const PREFIXE_FICHE = 'ZZ-E2E-Inscription-'
const IDENTIFIANT_ADMIN = `${PREFIXE_COMPTE}admin`
const EMAIL_ADMIN = `${IDENTIFIANT_ADMIN}@asonkeng.local`

/**
 * TEST-NET-3 (RFC 5737) : bloc réservé à la documentation, jamais routable, donc
 * jamais l'adresse d'un visiteur réel. Injectée dans `x-forwarded-for` pour DEUX
 * raisons, toutes deux essentielles :
 *
 * 1. PREUVE que `sInscrire` transmet à `consommer_token_inscription` l'adresse
 *    RÉELLE de l'appelant et non une constante partagée : le test relit ensuite
 *    `tentatives_token_inscription` sur cette adresse précise. Une implémentation
 *    qui passerait une constante n'y laisserait AUCUNE ligne, et l'assertion de
 *    comptage tomberait.
 * 2. NETTOYAGE déterministe du seau de tentatives. `tentatives_token_inscription`
 *    n'est jamais purgée (migration 20260815130000) et le plafond de D36 est de
 *    10 tentatives par adresse et par fenêtre de 15 minutes : sans remise à zéro
 *    en `beforeAll`, deux exécutions rapprochées de cette suite feraient franchir
 *    le plafond et échouer les suivantes — exactement la bombe à retardement des
 *    comptages absolus sur une base jamais réinitialisée.
 *
 * En production, Vercel ÉCRASE `x-forwarded-for` : la valeur qu'un client y
 * injecterait n'atteint jamais le code applicatif. Cette injection n'est donc pas
 * la démonstration d'une faille, seulement le moyen pour ce test de se donner une
 * identité d'appelant connue.
 */
const ADRESSE_TEST = '203.0.113.77'

test.use({ extraHTTPHeaders: { 'x-forwarded-for': ADRESSE_TEST } })

function hacher(code: string): string {
  return createHash('sha256').update(code, 'utf8').digest('hex')
}

/**
 * Hachages des tokens créés par CETTE exécution, pour un nettoyage ciblé. Un
 * filtre par motif est impossible : `code_hash` est un SHA-256, il ne porte aucune
 * trace du préfixe du code en clair — le `like('code_hash', 'test-e2e-...%')` qui
 * viendrait naturellement à l'esprit ne supprimerait JAMAIS rien.
 */
const hachagesCrees: string[] = []

/**
 * 10 minutes, pas 24 heures : une exécution interrompue avant l'`afterAll`
 * laisserait un token vivant sur une base qui sert aussi de production. Le code en
 * clair est tiré au hasard et n'est écrit nulle part, mais une fenêtre courte vaut
 * mieux qu'une confiance dans le hasard.
 */
const DUREE_TOKEN_MS = 600_000

async function creerTokenGenerique(
  code: string,
  options: { expireDansMs?: number; revoque?: boolean } = {},
): Promise<string> {
  const codeHash = hacher(code)
  const { error } = await admin.from('tokens_inscription').insert({
    code_hash: codeHash,
    mode: 'generique',
    expire_le: new Date(Date.now() + (options.expireDansMs ?? DUREE_TOKEN_MS)).toISOString(),
    revoque_le: options.revoque ? new Date().toISOString() : null,
  })
  // Erreur d'insertion VÉRIFIÉE : un insert de préparation qui échoue en silence
  // rendrait ce fichier vert en éprouvant un tout autre chemin — le token
  // « expiré » et le token « révoqué » n'existeraient tout simplement pas, et le
  // test comparerait quatre fois le cas « code inconnu » en croyant recouper
  // quatre causes distinctes.
  if (error) throw new Error(`création du token de test impossible : ${error.message}`)
  hachagesCrees.push(codeHash)
  return codeHash
}

async function supprimerComptesDePrefixe() {
  const { data: comptes, error } = await admin
    .from('profils')
    .select('id')
    .like('identifiant', `${PREFIXE_COMPTE}%`)
  if (error) throw new Error(`lecture des comptes de test impossible : ${error.message}`)
  for (const compte of comptes ?? []) {
    await admin.auth.admin.deleteUser(compte.id)
  }
  // Rattrapage par email, comme partout ailleurs dans le projet : un compte auth
  // créé sans fiche profil resterait introuvable par la requête ci-dessus.
  const { data: tousComptes } = await admin.auth.admin.listUsers()
  const orphelins = (tousComptes?.users ?? []).filter((u) => u.email?.startsWith(PREFIXE_COMPTE))
  for (const orphelin of orphelins) {
    await admin.auth.admin.deleteUser(orphelin.id)
  }
}

async function nettoyer() {
  // Ordre : comptes d'abord (la suppression du profil cascade sur
  // `demandes_membre`, qui cascade à son tour sur `notifications.demande_id`),
  // puis les fiches — `demandes_membre.membre_id` est `on delete set null`, la
  // fiche en_attente ne part JAMAIS avec la demande.
  await supprimerComptesDePrefixe()
  await admin.from('membres').delete().like('nom', `${PREFIXE_FICHE}%`)
  if (hachagesCrees.length > 0) {
    await admin.from('tokens_inscription').delete().in('code_hash', hachagesCrees)
    hachagesCrees.length = 0
  }
  await admin.from('tentatives_token_inscription').delete().eq('adresse', ADRESSE_TEST)
}

/** Identifiant de l'administrateur de test, destinataire attendu des notifications. */
let idAdminTest = ''

/**
 * Nombre de notifications `nouvelle_demande` ORPHELINES (sans `demande_id`) avant
 * que cette suite ne s'exécute. Mesuré pour être recomparé à la fin.
 *
 * Pourquoi cette mesure existe : `notifierAdministrateurs` écrit à TOUS les
 * administrateurs actifs — donc aussi aux comptes RÉELS de la base partagée, pas
 * seulement à l'administrateur de test. Ces lignes-là ne portent aucun préfixe de
 * test et aucun nettoyage par motif ne peut les retrouver. Elles disparaissent
 * uniquement par la cascade de `notifications.demande_id`, quand la demande de test
 * est supprimée avec son demandeur.
 *
 * Autrement dit : la propreté de la cloche des administrateurs RÉELS dépend de la
 * corrélation `demande_id` que cette suite vérifie par ailleurs. Si elle
 * régressait à NULL, la cascade ne mordrait plus et chaque exécution laisserait un
 * non-lu inextinguible sur des comptes de production. C'est exactement ce qui est
 * arrivé pendant la mise au point de cette tâche, et rien ne l'a signalé.
 *
 * DELTA et non absolu (base jamais réinitialisée) : on compare avant et après.
 */
let orphelinesAvant = 0

async function compterNotificationsOrphelines(): Promise<number> {
  const { data, error } = await admin
    .from('notifications')
    .select('id')
    .eq('type', 'nouvelle_demande')
    .is('demande_id', null)
  if (error) throw new Error(`comptage des notifications orphelines impossible : ${error.message}`)
  return (data ?? []).length
}

test.beforeAll(async () => {
  await nettoyer()
  orphelinesAvant = await compterNotificationsOrphelines()

  const { data, error } = await admin.auth.admin.createUser({
    email: EMAIL_ADMIN,
    password: `Test-${crypto.randomUUID()}`,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`création du compte admin de test impossible : ${error?.message}`)
  idAdminTest = data.user.id

  const { error: erreurProfil } = await admin
    .from('profils')
    .insert({ id: idAdminTest, identifiant: IDENTIFIANT_ADMIN, nom_affichage: 'Test inscription admin' })
  if (erreurProfil) {
    await admin.auth.admin.deleteUser(idAdminTest)
    throw new Error(`insertion du profil admin impossible : ${erreurProfil.message}`)
  }

  // Cet administrateur ACTIF existe pour une raison précise :
  // `notifierAdministrateurs` n'insère rien quand il n'y en a aucun. Sans lui,
  // l'assertion sur `demande_id` plus bas serait vraie de façon VIDE (zéro ligne
  // attendue, zéro ligne trouvée) et ne prouverait plus rien du tout.
  const { error: erreurRole } = await admin
    .from('roles_profil')
    .insert({ profil_id: idAdminTest, role: 'administrateur' })
  if (erreurRole) {
    await admin.auth.admin.deleteUser(idAdminTest)
    throw new Error(`attribution du rôle administrateur impossible : ${erreurRole.message}`)
  }
})

test.afterAll(async () => {
  // Photographié AVANT `nettoyer()`, qui vide la liste : sans cette copie, la
  // vérification des tokens plus bas porterait sur un tableau vide et serait vraie
  // sans rien prouver.
  const hachagesDeCetteExecution = [...hachagesCrees]

  await nettoyer()

  // Comptage indépendant, pas seulement l'absence d'erreur : le nettoyage des
  // données de test est fragile (registre 1c). Les QUATRE artefacts que cette
  // suite crée sont recomptés, aucun n'est exempté — c'est un token laissé VIVANT
  // en production qui était le défaut d'origine de ce fichier, et il aurait été le
  // seul dont aucune assertion n'aurait vu la réapparition. DELTA et non absolu :
  // chaque filtre porte sur un motif ou une adresse qui n'appartient qu'à cette
  // suite, jamais sur le contenu global d'une table partagée.
  const { data: residusComptes } = await admin
    .from('profils')
    .select('id')
    .like('identifiant', `${PREFIXE_COMPTE}%`)
  expect(residusComptes ?? [], 'comptes de test résiduels').toHaveLength(0)

  const { data: residusFiches } = await admin
    .from('membres')
    .select('id')
    .like('nom', `${PREFIXE_FICHE}%`)
  expect(residusFiches ?? [], 'fiches membres de test résiduelles').toHaveLength(0)

  // CONTRÔLE POSITIF : sans lui, une suite qui n'aurait créé aucun token ferait
  // passer l'assertion suivante sans qu'elle ait rien examiné.
  expect(
    hachagesDeCetteExecution.length,
    'la suite doit avoir créé au moins un token à recompter',
  ).toBeGreaterThan(0)
  const { data: residusTokens } = await admin
    .from('tokens_inscription')
    .select('id')
    .in('code_hash', hachagesDeCetteExecution)
  expect(residusTokens ?? [], 'tokens de test résiduels — un token vivant en production').toHaveLength(0)

  const { data: residusTentatives } = await admin
    .from('tentatives_token_inscription')
    .select('id')
    .eq('adresse', ADRESSE_TEST)
  expect(residusTentatives ?? [], 'tentatives de test résiduelles').toHaveLength(0)

  // Cinquième artefact, le seul qui atteigne des comptes RÉELS : voir le
  // commentaire d'`orphelinesAvant`. Aucun filtre par motif ne peut nettoyer ces
  // lignes ; seule la cascade de `demande_id` le fait. Ce delta est donc à la fois
  // un contrôle de propreté et un second témoin de la corrélation.
  expect(
    await compterNotificationsOrphelines(),
    "cette suite a laissé des notifications sans demande_id sur des comptes réels : la cascade n'a pas joué",
  ).toBe(orphelinesAvant)
})

function identifiantTest(): string {
  return `${PREFIXE_COMPTE}${crypto.randomUUID().slice(0, 8)}`
}

async function remplirEtSoumettre(
  page: Page,
  champs: { code: string; identifiant: string; nom: string },
): Promise<void> {
  await page.goto('/inscription')
  await page.getByLabel("Code d'inscription").fill(champs.code)
  await page.getByLabel('Identifiant choisi').fill(champs.identifiant)
  await page.getByLabel('Mot de passe choisi').fill(`Test-${crypto.randomUUID()}`)
  await page.getByLabel('Prénom').fill('ZZ-E2E')
  // `exact: true` : « Nom » est sous-chaîne de « Prénom », un libellé approché
  // remonterait les deux champs (violation du mode strict de Playwright).
  await page.getByLabel('Nom', { exact: true }).fill(champs.nom)
  await page.getByRole('button', { name: "S'inscrire" }).click()
}

/** Texte de l'alerte DU FORMULAIRE — jamais l'annonceur de route de Next, qui porte lui aussi `role="alert"`. */
async function messageRefus(page: Page): Promise<string> {
  const alerte = page.locator('form p[role="alert"]')
  await expect(alerte).toBeVisible()
  return (await alerte.textContent()) ?? ''
}

test('un visiteur SANS SESSION atteint /inscription (le middleware ne bloque pas cette route)', async ({
  page,
}) => {
  await page.goto('/inscription')
  await expect(page).toHaveURL(/\/inscription/)
  await expect(page.getByRole('heading', { name: 'Inscription' })).toBeVisible()
})

/**
 * CONTRÔLE POSITIF de l'exception de middleware : sans lui, un motif trop large
 * (`startsWith('/inscription')` nu, ou pire une exception posée sur toute route
 * non authentifiée) passerait le test ci-dessus sans que rien ne le révèle. On
 * vérifie ici que l'exception n'ouvre RIEN d'autre — ni une route protégée
 * ordinaire, ni un chemin dont le nom commence par « /inscription ».
 */
test("l'exception de middleware n'ouvre AUCUNE autre route", async ({ page }) => {
  for (const chemin of ['/membres', '/tableau-de-bord', '/inscriptions', '/inscription-admin']) {
    await page.goto(chemin)
    await expect(page, `${chemin} devrait rester derrière la connexion`).toHaveURL(/\/connexion/)
  }
})

test('les QUATRE causes de refus affichent le MÊME message indifférencié', async ({ page }) => {
  const codeConnu = `${PREFIXE_CODE}${crypto.randomUUID()}`
  const codeExpire = `${PREFIXE_CODE}${crypto.randomUUID()}`
  const codeRevoque = `${PREFIXE_CODE}${crypto.randomUUID()}`
  await creerTokenGenerique(codeConnu)
  await creerTokenGenerique(codeExpire, { expireDansMs: -1_000 })
  await creerTokenGenerique(codeRevoque, { revoque: true })

  // 1. Inscription RÉUSSIE : elle consomme `codeConnu`, ce qui fabrique la
  //    quatrième cause de refus (« déjà utilisé ») pour la suite du test.
  const identifiant1 = identifiantTest()
  const nomFiche1 = `${PREFIXE_FICHE}${crypto.randomUUID().slice(0, 8)}`
  await remplirEtSoumettre(page, { code: codeConnu, identifiant: identifiant1, nom: nomFiche1 })
  await expect(page).toHaveURL(/\/connexion\?inscrit=1/)
  // L'ACCUSÉ EST RÉELLEMENT AFFICHÉ. `?inscrit=1` promet une confirmation : tant
  // que `/connexion` était un composant client, il ne lisait jamais `searchParams`
  // et cette promesse n'atteignait pas l'écran. Sans cette assertion, la
  // redirection seule aurait continué de passer pour un accusé de réception.
  await expect(page.getByRole('status')).toContainText('compte a bien été créé')

  // 2. Les quatre causes, vues de l'extérieur. `codeInconnu` n'a JAMAIS été inséré.
  const codeInconnu = `${PREFIXE_CODE}${crypto.randomUUID()}`
  const messages: Record<string, string> = {}
  for (const [cause, code] of [
    ['deja_utilise', codeConnu],
    ['inconnu', codeInconnu],
    ['expire', codeExpire],
    ['revoque', codeRevoque],
  ] as const) {
    await remplirEtSoumettre(page, {
      code,
      identifiant: identifiantTest(),
      nom: `${PREFIXE_FICHE}${cause}`,
    })
    messages[cause] = await messageRefus(page)
  }

  const distincts = [...new Set(Object.values(messages))]
  expect(distincts, `messages observés : ${JSON.stringify(messages)}`).toHaveLength(1)
  // CONTRÔLE POSITIF : un message vide rendrait l'égalité ci-dessus vraie sans
  // qu'aucun refus n'ait eu lieu.
  expect(messages.inconnu.length).toBeGreaterThan(0)

  // 3. AUCUNE écriture au-delà de la première inscription : le token porte le
  //    profil du premier inscrit et lui seul, les quatre refus n'ont créé personne.
  const { data: compte1 } = await admin
    .from('profils')
    .select('id')
    .eq('identifiant', identifiant1)
    .maybeSingle()
  expect(compte1?.id).toBeTruthy()
  const { data: token } = await admin
    .from('tokens_inscription')
    .select('utilise_par_profil_id')
    .eq('code_hash', hacher(codeConnu))
    .single()
  expect(token?.utilise_par_profil_id).toBe(compte1?.id)
  const { data: comptes } = await admin
    .from('profils')
    .select('id')
    .like('identifiant', `${PREFIXE_COMPTE}%`)
  // L'administrateur de test + le seul inscrit : les quatre refus n'ont rien créé.
  expect(comptes ?? []).toHaveLength(2)

  // 4. LE SEAU DU PLAFOND EST BIEN CELUI DE L'APPELANT RÉEL (D34/D36). Cinq
  //    soumissions, cinq tentatives enregistrées sur l'adresse que CE test s'est
  //    donnée. Si `sInscrire` passait une constante partagée à
  //    `consommer_token_inscription`, ce comptage vaudrait 0 — c'est la preuve
  //    directe que l'en-tête d'adresse est bien lu et transmis.
  const { data: tentatives } = await admin
    .from('tentatives_token_inscription')
    .select('id')
    .eq('adresse', ADRESSE_TEST)
  expect(tentatives ?? []).toHaveLength(5)

  // 5. LA CORRÉLATION `demande_id` EST BIEN POSÉE (migration 20260815240000).
  //    Sans elle, la notification existerait quand même — avec `demande_id` à
  //    NULL — et les clauses de marquage-lues d'`annuler_demande_membre` et de
  //    `valider_demande_rattachement` ne la retrouveraient JAMAIS : la cloche de
  //    l'administrateur garderait un non-lu inextinguible, sans la moindre erreur.
  const { data: demande } = await admin
    .from('demandes_membre')
    .select('id, origine, membre_id')
    .eq('demandeur_profil_id', compte1!.id)
    .single()
  expect(demande?.origine).toBe('auto_inscription')
  const { data: notifications } = await admin
    .from('notifications')
    .select('id, type, lien, demande_id')
    .eq('profil_id', idAdminTest)
    .eq('type', 'nouvelle_demande')
  expect(notifications ?? []).toHaveLength(1)
  expect(notifications![0].demande_id).toBe(demande!.id)
  // `lien` reste un lien de NAVIGATION, jamais la clé de corrélation.
  expect(notifications![0].lien).toBe('/demandes')
})

test("une requête forgée sur consommer_token_inscription depuis le rôle anon échoue et n'écrit rien", async ({
  request,
}) => {
  const codeJamaisSoumis = `${PREFIXE_CODE}${crypto.randomUUID()}`
  const codeHash = await creerTokenGenerique(codeJamaisSoumis)

  const reponse = await request.post(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/consommer_token_inscription`,
    {
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      data: { p_code_hash: codeHash, p_adresse: '203.0.113.50' },
    },
  )
  expect(reponse.ok()).toBe(false)

  const { data: token } = await admin
    .from('tokens_inscription')
    .select('utilise_le')
    .eq('code_hash', codeHash)
    .single()
  expect(token?.utilise_le).toBeNull()

  // CANARI — sans lui, tout ce qui précède serait aussi vrai d'une URL mal
  // orthographiée, d'un nom de paramètre erroné ou d'un projet Supabase éteint :
  // « ça a échoué » ne prouve un refus de PRIVILÈGE que si la MÊME requête, au
  // même chemin, avec les mêmes paramètres, réussit sous un rôle autorisé. Seule
  // la clé change.
  const codeCanari = `${PREFIXE_CODE}${crypto.randomUUID()}`
  const hashCanari = await creerTokenGenerique(codeCanari)
  const reponseCanari = await request.post(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/consommer_token_inscription`,
    {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      data: { p_code_hash: hashCanari, p_adresse: '203.0.113.51' },
    },
  )
  expect(reponseCanari.ok(), "le canari doit aboutir : sinon le refus ci-dessus n'est pas un refus de privilège").toBe(true)
  expect((await reponseCanari.json())[0]?.statut).toBe('ok')

  await admin.from('tentatives_token_inscription').delete().in('adresse', ['203.0.113.50', '203.0.113.51'])
})

test("une antenne forgée est refusée AVANT que le token soit consommé", async ({ page }) => {
  const code = `${PREFIXE_CODE}${crypto.randomUUID()}`
  const codeHash = await creerTokenGenerique(code)

  // DELTA, pas absolu : les tests précédents de ce fichier ont déjà laissé des
  // comptes derrière eux (le nettoyage n'a lieu qu'en `afterAll`). Un comptage
  // absolu serait juste aujourd'hui et faux dès qu'un test serait ajouté au-dessus.
  const compterComptes = async () => {
    const { data } = await admin
      .from('profils')
      .select('id')
      .like('identifiant', `${PREFIXE_COMPTE}%`)
    return (data ?? []).length
  }
  const comptesAvant = await compterComptes()

  await page.goto('/inscription')
  await page.getByLabel("Code d'inscription").fill(code)
  await page.getByLabel('Identifiant choisi').fill(identifiantTest())
  await page.getByLabel('Mot de passe choisi').fill(`Test-${crypto.randomUUID()}`)
  await page.getByLabel('Prénom').fill('ZZ-E2E')
  await page.getByLabel('Nom', { exact: true }).fill(`${PREFIXE_FICHE}antenne-forgee`)

  // `antenne_id` est une clé étrangère `on delete restrict` alimentée par un
  // `<select>` PUBLIC : rien n'empêche un visiteur d'y poster autre chose que les
  // options proposées. On injecte donc une option qui n'existe pas en base.
  const idInexistant = crypto.randomUUID()
  await page.evaluate((valeur) => {
    const select = document.querySelector<HTMLSelectElement>('select[name="antenneId"]')!
    const option = document.createElement('option')
    option.value = valeur
    option.textContent = 'Antenne forgée'
    select.append(option)
    select.value = valeur
    // Le champ est CONTRÔLÉ depuis la phase 5 : écrire `select.value` ne met pas à jour
    // l'état React, et la première passe de rendu le restaurerait à ''. On dépêche donc
    // l'événement que React écoute, pour que la forge passe par le MÊME chemin qu'une
    // sélection humaine — ce que ce test prétend éprouver.
    select.dispatchEvent(new Event('change', { bubbles: true }))
  }, idInexistant)

  await page.getByRole('button', { name: "S'inscrire" }).click()
  expect(await messageRefus(page)).toContain("L'antenne choisie")

  // LE POINT DU TEST : le token n'a PAS été brûlé pour une saisie que nous
  // pouvions refuser d'avance. La validation a lieu avant la consommation.
  const { data: token } = await admin
    .from('tokens_inscription')
    .select('utilise_le')
    .eq('code_hash', codeHash)
    .single()
  expect(token?.utilise_le).toBeNull()

  // Et aucun compte n'a été créé.
  expect(await compterComptes()).toBe(comptesAvant)
})
