import { createClient } from '@supabase/supabase-js'
import { expect, test, type Browser, type Page } from '@playwright/test'
import { identifiantVersEmail } from '../../src/lib/domaine/identifiant'
import { MESSAGE_DEMANDE_NON_VALIDABLE, MESSAGE_MEMBRE_DEJA_RATTACHE } from '../../src/app/demandes/messages'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const MDP = `Test-${crypto.randomUUID()}`
const PREFIXE_MEMBRE = `ZZDemandesE2E-${crypto.randomUUID().slice(0, 8)}`

/**
 * Comptes de test, tous préfixés `test.e2e.demandes.` (contrainte projet #6).
 * `admin`/`a`/`b` couvrent le cycle de vie ordinaire (brief). `c` à `i` sont
 * dédiés au rattachement (D26) et aux requêtes forgées, qui n'étaient pas
 * couverts par le brief initial — voir le rapport de la Task 17.
 */
const IDENTIFIANTS = {
  admin: 'test.e2e.demandes.admin',
  a: 'test.e2e.demandes.a',
  b: 'test.e2e.demandes.b',
  c: 'test.e2e.demandes.c',
  d: 'test.e2e.demandes.d',
  e: 'test.e2e.demandes.e',
  f: 'test.e2e.demandes.f',
  g: 'test.e2e.demandes.g',
  h: 'test.e2e.demandes.h',
  i: 'test.e2e.demandes.i',
} as const

const idsProfil = {} as Record<keyof typeof IDENTIFIANTS, string>

/**
 * Notifications existantes AVANT toute donnée de test, relevées par IDENTIFIANT
 * (pas par comptage absolu — registre du projet, piège n°1). `notifierAdministrateurs`
 * (Task 14/16) écrit sur TOUS les administrateurs actifs, y compris des comptes de
 * PRODUCTION réels : ces lignes ne portent aucun préfixe de test et ne peuvent être
 * retrouvées par un motif. Seule la cascade `demande_id -> demandes_membre` (migration
 * 20260815240000), déclenchée par la suppression des profils de test en fin de suite,
 * les efface. On vérifie ce nettoyage par DELTA en fin de suite : c'est aussi un filet
 * de régression, si un jour un appel omettait `demande_id`, ces notifications
 * survivraient à la suppression des comptes et le delta ne serait plus vide.
 */
let notificationsAvant = new Set<string>()

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

/**
 * Vérifie CHAQUE insertion de préparation au lieu de la jeter en silence — un
 * `insert` de préparation dont l'erreur est ignorée rend le test vert en
 * éprouvant un tout autre chemin (registre du projet, trouvé trois fois dans
 * cette phase). Sans ce contrôle, un compte auth orphelin sans profil
 * survivrait, introuvable par `supprimerCompte`, qui interroge `profils`.
 */
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
    .insert({ id: data.user.id, identifiant, nom_affichage: `Test demandes ${identifiant}` })
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

/**
 * Le bouton « Se déconnecter » ne vit que sur `/tableau-de-bord`
 * (src/app/tableau-de-bord/page.tsx) — ni `/demandes` ni `/demandes/nouvelle`
 * ne le rendent. On y navigue explicitement plutôt que de supposer sa présence
 * sur l'écran courant.
 */
async function deconnecter(page: Page) {
  await page.goto('/tableau-de-bord')
  await page.getByRole('button', { name: 'Se déconnecter' }).click()
  await expect(page).toHaveURL(/\/connexion/)
}

type RequeteCapturee = { url: string; headers: Record<string, string>; postData: Buffer }

/**
 * Capture la requête RÉELLE qu'une Server Action appelée directement (pas via
 * `<form action={...}>`) envoie au serveur, puis l'AVORTE avant qu'elle
 * n'atteigne celui-ci — l'écriture que `cliquer` déclenche ne doit JAMAIS
 * réellement se produire ici. Aucune des trois actions de cet écran n'est liée
 * par `<form action={fn}>` (elles sont toutes appelées depuis `onSubmit`/`onClick`
 * avec `useTransition`) : il n'existe donc pas de champs `$ACTION_*` à extraire du
 * HTML, contrairement au motif de `tests/e2e/tokens.spec.ts` et
 * `tests/e2e/statuts.spec.ts`. Le mécanisme sous-jacent est le même RPC Server
 * Actions (en-tête `Next-Action`) ; on l'intercepte au niveau réseau à la place.
 */
async function capturerRequeteAbandonnee(
  page: Page,
  motif: string,
  cliquer: () => Promise<void>,
): Promise<RequeteCapturee> {
  let capture: RequeteCapturee | null = null
  await page.route(motif, async (route, request) => {
    if (request.method() === 'POST') {
      const corps = request.postDataBuffer()
      capture = { url: request.url(), headers: request.headers(), postData: corps ?? Buffer.alloc(0) }
      await route.abort()
    } else {
      await route.continue()
    }
  })
  await cliquer()
  await expect.poll(() => capture, 'Capture invalide : aucune requête POST interceptée.').not.toBeNull()
  await page.unroute(motif)
  return capture!
}

/** Rejoue une requête capturée depuis une session DISTINCTE (nouveau contexte, nouveaux cookies). */
async function rejouerSousIdentite(
  browser: Browser,
  baseURL: string | undefined,
  identifiant: string,
  requete: RequeteCapturee,
) {
  const contexte = await browser.newContext({ baseURL })
  try {
    const pageForgee = await contexte.newPage()
    await connecter(pageForgee, identifiant)
    return await pageForgee.request.post(requete.url, {
      headers: {
        'next-action': requete.headers['next-action'],
        'content-type': requete.headers['content-type'],
        accept: requete.headers['accept'],
      },
      data: requete.postData,
    })
  } finally {
    await contexte.close()
  }
}

/**
 * Falsifie la valeur d'un champ dans un corps multipart déjà capturé — sert à
 * éprouver une garde SERVEUR que le client empêche par construction (le
 * sélecteur exclut la fiche jetable de ses résultats de recherche), donc
 * inatteignable par une simple interaction UI. Lève si le champ recherché est
 * absent : un remplacement silencieusement sans effet rendrait le test vert en
 * éprouvant un tout autre corps que celui annoncé.
 */
function remplacerChampMultipart(corpsBrut: Buffer, suffixeChamp: string, nouvelleValeur: string): Buffer {
  const texte = corpsBrut.toString('utf8')
  const motif = new RegExp(`(name="[^"]*${suffixeChamp}"\\r?\\n\\r?\\n)([^\\r\\n]*)`)
  if (!motif.test(texte)) {
    throw new Error(`Capture invalide : champ « ${suffixeChamp} » introuvable — la forge ne peut pas être fiable.`)
  }
  const tampere = texte.replace(motif, (_correspondance, entete: string) => `${entete}${nouvelleValeur}`)
  return Buffer.from(tampere, 'utf8')
}

test.beforeAll(async () => {
  // Nettoyage résiduel d'une exécution précédente avortée, AVANT le relevé des
  // notifications existantes.
  await admin.from('membres').delete().like('nom', `${PREFIXE_MEMBRE}%`)
  for (const identifiant of Object.values(IDENTIFIANTS)) {
    await supprimerCompte(identifiant)
  }

  const { data: notifsAvant } = await admin.from('notifications').select('id')
  notificationsAvant = new Set((notifsAvant ?? []).map((l) => l.id as string))

  idsProfil.admin = await creerCompte(IDENTIFIANTS.admin, true)
  idsProfil.a = await creerCompte(IDENTIFIANTS.a, false)
  idsProfil.b = await creerCompte(IDENTIFIANTS.b, false)
  idsProfil.c = await creerCompte(IDENTIFIANTS.c, false)
  idsProfil.d = await creerCompte(IDENTIFIANTS.d, false)
  idsProfil.e = await creerCompte(IDENTIFIANTS.e, false)
  idsProfil.f = await creerCompte(IDENTIFIANTS.f, false)
  idsProfil.g = await creerCompte(IDENTIFIANTS.g, false)
  idsProfil.h = await creerCompte(IDENTIFIANTS.h, false)
  idsProfil.i = await creerCompte(IDENTIFIANTS.i, false)
})

test.afterAll(async () => {
  await admin.from('membres').delete().like('nom', `${PREFIXE_MEMBRE}%`)
  for (const identifiant of Object.values(IDENTIFIANTS)) {
    await supprimerCompte(identifiant)
  }
  const { data: residus } = await admin
    .from('profils')
    .select('id')
    .in('identifiant', Object.values(IDENTIFIANTS))
  expect(residus ?? []).toHaveLength(0)

  // Vérification par DELTA (pas un comptage absolu, registre du projet piège
  // n°1) : aucune notification apparue pendant cette suite ne doit survivre à
  // la suppression des comptes de test — y compris celles écrites sur de VRAIS
  // comptes administrateur de production par `notifierAdministrateurs`. Seule
  // la cascade de `demande_id`, déclenchée ci-dessus, les efface.
  const { data: notifsApres } = await admin.from('notifications').select('id')
  const idsResiduels = (notifsApres ?? []).map((l) => l.id as string).filter((id) => !notificationsAvant.has(id))
  expect(idsResiduels).toHaveLength(0)
})

test("un compte ordinaire propose une personne, la voit dans « mes demandes », puis l'annule", async ({ page }) => {
  await connecter(page, IDENTIFIANTS.a)
  await page.goto('/demandes/nouvelle')
  await page.getByLabel('Prénom (obligatoire)', { exact: true }).fill('Test')
  await page.getByLabel('Nom (obligatoire)', { exact: true }).fill(`${PREFIXE_MEMBRE}-suivi`)
  await page.getByRole('button', { name: 'Envoyer la demande' }).click()
  await expect(page).toHaveURL(/\/demandes\?demandeCreee=1/)

  await expect(page.getByText('En attente')).toBeVisible()

  const { data: demandeA } = await admin
    .from('demandes_membre')
    .select('id')
    .eq('demandeur_profil_id', idsProfil.a)
    .eq('etat', 'en_attente')
    .single()

  page.once('dialog', (dialogue) => dialogue.accept())
  await page.getByRole('button', { name: 'Annuler' }).click()
  await expect(page.getByText('Annulée')).toBeVisible()

  // ÉTAT FINAL en base, pas seulement l'affichage : la fiche a disparu, la
  // demande porte etat = annulee.
  const { data: demandeRelue } = await admin
    .from('demandes_membre')
    .select('etat, membre_id')
    .eq('id', demandeA!.id)
    .single()
  expect(demandeRelue?.etat).toBe('annulee')
  expect(demandeRelue?.membre_id).toBeNull()
})

test(
  "un compte ordinaire sans aucune demande ne voit ni la file d'attente admin ni aucune demande, " +
    "l'écran restant fonctionnel (contrôle positif)",
  async ({ page }) => {
    await connecter(page, IDENTIFIANTS.b)
    await page.goto('/demandes')
    // Contrôle POSITIF : le titre de la section s'affiche bel et bien — une
    // page cassée ou une session expirée ne rendraient pas ce texte non plus,
    // ce qui distingue « correctement vide » de « ne fonctionne pas ».
    await expect(page.getByRole('heading', { name: 'Mes demandes' })).toBeVisible()
    await expect(page.getByText("Vous n'avez soumis aucune demande.")).toBeVisible()
    await expect(page.getByText('À traiter')).toHaveCount(0)
  },
)

test("un AUTRE compte ordinaire voit sa propre demande, jamais celle d'autrui ni la file d'attente admin", async ({
  page,
}) => {
  await connecter(page, IDENTIFIANTS.a)
  await page.goto('/demandes/nouvelle')
  await page.getByLabel('Prénom (obligatoire)', { exact: true }).fill('Test')
  await page.getByLabel('Nom (obligatoire)', { exact: true }).fill(`${PREFIXE_MEMBRE}-visibilite-a`)
  await page.getByRole('button', { name: 'Envoyer la demande' }).click()
  await expect(page).toHaveURL(/\/demandes\?demandeCreee=1/)
  await deconnecter(page)

  await connecter(page, IDENTIFIANTS.b)
  await page.goto('/demandes/nouvelle')
  await page.getByLabel('Prénom (obligatoire)', { exact: true }).fill('Test')
  await page.getByLabel('Nom (obligatoire)', { exact: true }).fill(`${PREFIXE_MEMBRE}-visibilite-b`)
  await page.getByRole('button', { name: 'Envoyer la demande' }).click()
  await expect(page).toHaveURL(/\/demandes\?demandeCreee=1/)

  // Contrôle POSITIF, dans la MÊME situation que les contrôles négatifs
  // ci-dessous : B voit SA PROPRE demande.
  await expect(page.getByText(`${PREFIXE_MEMBRE}-visibilite-b`)).toBeVisible()
  // Contrôles négatifs : ni la demande d'A, ni la file d'attente admin.
  await expect(page.getByText(`${PREFIXE_MEMBRE}-visibilite-a`)).toHaveCount(0)
  await expect(page.getByText('À traiter')).toHaveCount(0)
})

test(
  'un administrateur valide une demande de suivi comme nouvelle personne, avec le dirigeant proposé, ' +
    'et marque lue la notification associée (D41)',
  async ({ page }) => {
    await connecter(page, IDENTIFIANTS.a)
    await page.goto('/demandes/nouvelle')
    await page.getByLabel('Prénom (obligatoire)', { exact: true }).fill('Test')
    await page.getByLabel('Nom (obligatoire)', { exact: true }).fill(`${PREFIXE_MEMBRE}-validation`)
    await page.getByRole('button', { name: 'Envoyer la demande' }).click()
    await expect(page).toHaveURL(/\/demandes\?demandeCreee=1/)

    const { data: ficheAvant } = await admin
      .from('membres')
      .select('id')
      .eq('nom', `${PREFIXE_MEMBRE}-validation`)
      .single()
    const { data: demandeAvant } = await admin
      .from('demandes_membre')
      .select('id')
      .eq('membre_id', ficheAvant!.id)
      .single()

    await deconnecter(page)

    await connecter(page, IDENTIFIANTS.admin)
    await page.goto('/demandes')
    await expect(page.getByText(`${PREFIXE_MEMBRE}-validation`)).toBeVisible()
    const ligne = page.locator('li', { hasText: `${PREFIXE_MEMBRE}-validation` })
    await ligne.getByRole('button', { name: 'Valider comme nouvelle personne' }).click()
    await expect(page.getByText(`${PREFIXE_MEMBRE}-validation`)).toHaveCount(0)

    const { data: fiche } = await admin
      .from('membres')
      .select('etat, faiseur_de_disciple_id')
      .eq('id', ficheAvant!.id)
      .single()
    expect(fiche?.etat).toBe('actif')
    // Le faiseur de disciple posé est la fiche du DEMANDEUR (IDENT_A), pas son
    // compte : IDENT_A n'a lui-même pas de fiche liée dans ce test (registre 1c,
    // piège n°3) — la valeur attendue est donc NULL, traitée en silence, pas en
    // échec.
    expect(fiche?.faiseur_de_disciple_id).toBeNull()

    const { data: demandeApres } = await admin
      .from('demandes_membre')
      .select('etat, traite_par')
      .eq('id', demandeAvant!.id)
      .single()
    expect(demandeApres?.etat).toBe('validee')
    expect(demandeApres?.traite_par).toBe(idsProfil.admin)

    // Notification de décision : demande_id corrèle (migration 20260815240000),
    // lien reste réservé à la navigation (/demandes).
    const { data: notifDecision } = await admin
      .from('notifications')
      .select('lien, demande_id')
      .eq('profil_id', idsProfil.a)
      .eq('type', 'demande_validee')
      .eq('demande_id', demandeAvant!.id)
      .maybeSingle()
    expect(notifDecision).not.toBeNull()
    expect(notifDecision?.lien).toBe('/demandes')

    // D41 : la notification nouvelle_demande envoyée aux administrateurs POUR
    // CETTE demande est marquée lue une fois la décision actée — même
    // comportement que les fonctions SECURITY DEFINER de la Task 10, bien que
    // validerDemandeNouvellePersonne n'en soit pas une (voir actions.ts).
    const { data: notifOrigine } = await admin
      .from('notifications')
      .select('lu_le')
      .eq('type', 'nouvelle_demande')
      .eq('demande_id', demandeAvant!.id)
      .maybeSingle()
    expect(notifOrigine?.lu_le).not.toBeNull()
  },
)

test(
  'un administrateur rejette une demande avec un motif, le demandeur le voit, ' +
    'et la notification associée est marquée lue (D41)',
  async ({ page }) => {
    await connecter(page, IDENTIFIANTS.a)
    await page.goto('/demandes/nouvelle')
    await page.getByLabel('Prénom (obligatoire)', { exact: true }).fill('Test')
    await page.getByLabel('Nom (obligatoire)', { exact: true }).fill(`${PREFIXE_MEMBRE}-rejet`)
    await page.getByRole('button', { name: 'Envoyer la demande' }).click()
    await expect(page).toHaveURL(/\/demandes\?demandeCreee=1/)

    const { data: ficheRejet } = await admin.from('membres').select('id').eq('nom', `${PREFIXE_MEMBRE}-rejet`).single()
    const { data: demandeRejet } = await admin
      .from('demandes_membre')
      .select('id')
      .eq('membre_id', ficheRejet!.id)
      .single()

    await deconnecter(page)

    await connecter(page, IDENTIFIANTS.admin)
    await page.goto('/demandes')
    const ligne = page.locator('li', { hasText: `${PREFIXE_MEMBRE}-rejet` })
    await ligne.getByLabel('Motif de rejet').fill('Doublon suspecté')
    await ligne.getByRole('button', { name: 'Rejeter' }).click()
    await expect(page.getByText(`${PREFIXE_MEMBRE}-rejet`)).toHaveCount(0)
    await deconnecter(page)

    await connecter(page, IDENTIFIANTS.a)
    await page.goto('/demandes')
    await expect(page.getByText('Rejetée')).toBeVisible()
    await expect(page.getByText('Motif : Doublon suspecté')).toBeVisible()

    const { data: notifDecision } = await admin
      .from('notifications')
      .select('lien, demande_id')
      .eq('profil_id', idsProfil.a)
      .eq('type', 'demande_rejetee')
      .eq('demande_id', demandeRejet!.id)
      .maybeSingle()
    expect(notifDecision).not.toBeNull()
    expect(notifDecision?.lien).toBe('/demandes')

    const { data: notifOrigine } = await admin
      .from('notifications')
      .select('lu_le')
      .eq('type', 'nouvelle_demande')
      .eq('demande_id', demandeRejet!.id)
      .maybeSingle()
    expect(notifOrigine?.lu_le).not.toBeNull()
  },
)

// --- Rattachement (D26) : non couvert par la liste de tests du brief initial,
// ajouté ici (voir le rapport de la Task 17) parce que le contrat des
// notifications signale explicitement trois marqueurs de refus
// (`rattachement_vers_fiche_jetable`, `membre_deja_rattache`,
// `demande_non_validable`) qui doivent chacun produire un message DISTINCT et
// ATTEIGNABLE à l'écran.

test('un administrateur valide une auto-inscription par rattachement à une fiche existante (D26)', async ({ page }) => {
  const { data: jetable } = await admin
    .from('membres')
    .insert({ nom: `${PREFIXE_MEMBRE}-rattachement-jetable`, prenom: 'Test', etat: 'en_attente' })
    .select('id')
    .single()
  const { data: cible } = await admin
    .from('membres')
    .insert({ nom: `${PREFIXE_MEMBRE}-rattachement-cible`, prenom: 'Test', etat: 'actif' })
    .select('id')
    .single()
  const { data: demande } = await admin
    .from('demandes_membre')
    .insert({ origine: 'auto_inscription', demandeur_profil_id: idsProfil.c, membre_id: jetable!.id, etat: 'en_attente' })
    .select('id')
    .single()

  await connecter(page, IDENTIFIANTS.admin)
  await page.goto('/demandes')
  const ligne = page.locator('li', { hasText: `${PREFIXE_MEMBRE}-rattachement-jetable` })
  await ligne.getByLabel('Ou rattacher à une fiche existante').fill(`${PREFIXE_MEMBRE}-rattachement-cible`)
  await ligne.getByRole('button', { name: `Test ${PREFIXE_MEMBRE}-rattachement-cible` }).click()
  await ligne.getByRole('button', { name: 'Rattacher' }).click()
  await expect(page.getByText(`${PREFIXE_MEMBRE}-rattachement-jetable`)).toHaveCount(0)

  const { data: demandeApres } = await admin.from('demandes_membre').select('etat').eq('id', demande!.id).single()
  expect(demandeApres?.etat).toBe('validee')
  const { data: jetableApres } = await admin.from('membres').select('id').eq('id', jetable!.id).maybeSingle()
  expect(jetableApres).toBeNull()
  const { data: profilC } = await admin.from('profils').select('membre_id').eq('id', idsProfil.c).single()
  expect(profilC?.membre_id).toBe(cible!.id)
})

test('le rattachement refuse une fiche déjà rattachée à un autre compte, avec un message distinct (membre_deja_rattache)', async ({
  page,
}) => {
  const { data: cible } = await admin
    .from('membres')
    .insert({ nom: `${PREFIXE_MEMBRE}-dejarattache-cible`, prenom: 'Test', etat: 'actif' })
    .select('id')
    .single()
  // Simule une fiche déjà rattachée par un AUTRE compte (D, setup direct — pas
  // l'action sous test).
  await admin.from('profils').update({ membre_id: cible!.id }).eq('id', idsProfil.d)

  const { data: jetable } = await admin
    .from('membres')
    .insert({ nom: `${PREFIXE_MEMBRE}-dejarattache-jetable`, prenom: 'Test', etat: 'en_attente' })
    .select('id')
    .single()
  const { data: demande } = await admin
    .from('demandes_membre')
    .insert({ origine: 'auto_inscription', demandeur_profil_id: idsProfil.e, membre_id: jetable!.id, etat: 'en_attente' })
    .select('id')
    .single()

  await connecter(page, IDENTIFIANTS.admin)
  await page.goto('/demandes')
  const ligne = page.locator('li', { hasText: `${PREFIXE_MEMBRE}-dejarattache-jetable` })
  await ligne.getByLabel('Ou rattacher à une fiche existante').fill(`${PREFIXE_MEMBRE}-dejarattache-cible`)
  await ligne.getByRole('button', { name: `Test ${PREFIXE_MEMBRE}-dejarattache-cible` }).click()
  await ligne.getByRole('button', { name: 'Rattacher' }).click()

  await expect(ligne.getByRole('alert')).toHaveText(MESSAGE_MEMBRE_DEJA_RATTACHE)

  const { data: demandeApres } = await admin.from('demandes_membre').select('etat').eq('id', demande!.id).single()
  expect(demandeApres?.etat).toBe('en_attente')
  const { data: jetableApres } = await admin.from('membres').select('id').eq('id', jetable!.id).maybeSingle()
  expect(jetableApres).not.toBeNull()
})

test("le rattachement refuse une demande qui n'est plus en_attente, avec un message distinct (demande_non_validable)", async ({
  page,
}) => {
  const { data: jetable } = await admin
    .from('membres')
    .insert({ nom: `${PREFIXE_MEMBRE}-toctou-jetable`, prenom: 'Test', etat: 'en_attente' })
    .select('id')
    .single()
  await admin.from('membres').insert({ nom: `${PREFIXE_MEMBRE}-toctou-cible`, prenom: 'Test', etat: 'actif' })
  const { data: demande } = await admin
    .from('demandes_membre')
    .insert({ origine: 'auto_inscription', demandeur_profil_id: idsProfil.f, membre_id: jetable!.id, etat: 'en_attente' })
    .select('id')
    .single()

  await connecter(page, IDENTIFIANTS.admin)
  await page.goto('/demandes')
  const ligne = page.locator('li', { hasText: `${PREFIXE_MEMBRE}-toctou-jetable` })
  await ligne.getByLabel('Ou rattacher à une fiche existante').fill(`${PREFIXE_MEMBRE}-toctou-cible`)
  await ligne.getByRole('button', { name: `Test ${PREFIXE_MEMBRE}-toctou-cible` }).click()

  // Course simulée : la demande est traitée par ailleurs ENTRE le rendu du
  // formulaire (déjà chargé ci-dessus) et sa soumission.
  await admin.from('demandes_membre').update({ etat: 'rejetee', motif_rejet: 'course simulée' }).eq('id', demande!.id)

  await ligne.getByRole('button', { name: 'Rattacher' }).click()
  await expect(ligne.getByRole('alert')).toHaveText(MESSAGE_DEMANDE_NON_VALIDABLE)

  // L'état posé par la course simulée n'est PAS écrasé par le rattachement
  // refusé.
  const { data: demandeApres } = await admin.from('demandes_membre').select('etat').eq('id', demande!.id).single()
  expect(demandeApres?.etat).toBe('rejetee')
})

test(
  "le rattachement refuse de cibler la fiche jetable de la demande elle-même " +
    "(rattachement_vers_fiche_jetable) — inatteignable depuis l'écran par construction, " +
    'la garde serveur est vérifiée par requête tamponnée',
  async ({ page }) => {
    const { data: jetable } = await admin
      .from('membres')
      .insert({ nom: `${PREFIXE_MEMBRE}-tamper-jetable`, prenom: 'Test', etat: 'en_attente' })
      .select('id')
      .single()
    await admin.from('membres').insert({ nom: `${PREFIXE_MEMBRE}-tamper-cible`, prenom: 'Test', etat: 'actif' })
    const { data: demande } = await admin
      .from('demandes_membre')
      .insert({
        origine: 'auto_inscription',
        demandeur_profil_id: idsProfil.g,
        membre_id: jetable!.id,
        etat: 'en_attente',
      })
      .select('id')
      .single()

    await connecter(page, IDENTIFIANTS.admin)
    await page.goto('/demandes')
    const ligne = page.locator('li', { hasText: `${PREFIXE_MEMBRE}-tamper-jetable` })
    // Le sélecteur EXCLUT explicitement la fiche jetable de ses résultats
    // (`exclureId={demande.membreId}`, src/app/demandes/ligne-demande-admin.tsx) :
    // aucune interaction légitime ne peut la choisir. On capture donc une
    // soumission valide vers une AUTRE fiche, avortée avant d'atteindre le
    // serveur, puis on falsifie `membreExistantId` pour viser la fiche jetable
    // elle-même — seule façon d'éprouver la garde SERVEUR (I5, migration
    // 20260815230000) que le client empêche par construction.
    await ligne.getByLabel('Ou rattacher à une fiche existante').fill(`${PREFIXE_MEMBRE}-tamper-cible`)
    await ligne.getByRole('button', { name: `Test ${PREFIXE_MEMBRE}-tamper-cible` }).click()

    const requete = await capturerRequeteAbandonnee(page, '**/demandes', () =>
      ligne.getByRole('button', { name: 'Rattacher' }).click(),
    )
    const corpsTampere = remplacerChampMultipart(requete.postData, 'membreExistantId', jetable!.id)

    await page.request.post(requete.url, {
      headers: {
        'next-action': requete.headers['next-action'],
        'content-type': requete.headers['content-type'],
        accept: requete.headers['accept'],
      },
      data: corpsTampere,
    })

    // Seule assertion qui compte : rien n'a changé — ni la demande, ni la fiche
    // jetable, ni le profil du demandeur.
    const { data: demandeApres } = await admin.from('demandes_membre').select('etat').eq('id', demande!.id).single()
    expect(demandeApres?.etat).toBe('en_attente')
    const { data: jetableApres } = await admin.from('membres').select('id').eq('id', jetable!.id).maybeSingle()
    expect(jetableApres).not.toBeNull()
    const { data: profilG } = await admin.from('profils').select('membre_id').eq('id', idsProfil.g).single()
    expect(profilG?.membre_id).toBeNull()
  },
)

test("une requête forgée sur validerDemandeNouvellePersonne depuis un compte non-administrateur échoue et n'écrit rien", async ({
  page,
  browser,
  baseURL,
}) => {
  // Le titre promet un appel DIRECT de la Server Action, pas une simple
  // navigation : une navigation vers /demandes renvoyée à l'écran ordinaire
  // resterait verte même si `exigerAdministrateur()` disparaissait de
  // `validerDemandeNouvellePersonne` tout en restant dans `page.tsx` — le garde
  // de la PAGE suffirait seul à faire passer ce test, sans jamais éprouver le
  // garde de l'ACTION (registre du projet : « le dernier en date prétendait
  // appeler l'action directement… »). On capture donc la requête RÉELLE qu'un
  // administrateur enverrait, on l'avorte AVANT qu'elle n'atteigne le serveur —
  // cette demande ne doit PAS être validée par ce test — puis on la rejoue sous
  // une session NON-administrateur.
  await connecter(page, IDENTIFIANTS.h)
  await page.goto('/demandes/nouvelle')
  await page.getByLabel('Prénom (obligatoire)', { exact: true }).fill('Test')
  await page.getByLabel('Nom (obligatoire)', { exact: true }).fill(`${PREFIXE_MEMBRE}-forge`)
  await page.getByRole('button', { name: 'Envoyer la demande' }).click()
  await expect(page).toHaveURL(/\/demandes\?demandeCreee=1/)
  await deconnecter(page)

  const { data: fiche } = await admin.from('membres').select('id, etat').eq('nom', `${PREFIXE_MEMBRE}-forge`).single()
  expect(fiche?.etat).toBe('en_attente')

  await connecter(page, IDENTIFIANTS.admin)
  await page.goto('/demandes')
  const ligne = page.locator('li', { hasText: `${PREFIXE_MEMBRE}-forge` })
  const requete = await capturerRequeteAbandonnee(page, '**/demandes', () =>
    ligne.getByRole('button', { name: 'Valider comme nouvelle personne' }).click(),
  )

  await rejouerSousIdentite(browser, baseURL, IDENTIFIANTS.b, requete)

  // Seule assertion qui compte : aucune écriture n'a eu lieu, quel qu'ait été le
  // code HTTP renvoyé par la requête forgée.
  const { data: ficheApres } = await admin.from('membres').select('etat').eq('id', fiche!.id).single()
  expect(ficheApres?.etat).toBe('en_attente')
  const { data: demandeApres } = await admin.from('demandes_membre').select('etat').eq('membre_id', fiche!.id).single()
  expect(demandeApres?.etat).toBe('en_attente')
})

test('canari : la même requête forgée réussit depuis un compte administrateur', async ({ page, browser, baseURL }) => {
  // Contrôle POSITIF du mécanisme de forge lui-même (même raisonnement que le
  // canari de tests/e2e/autorite.spec.ts et tests/e2e/statuts.spec.ts) : si le
  // test précédent passait un jour parce que la capture/le rejeu sont cassés —
  // encodage `Next-Action` changé, en-têtes insuffisants — et non parce que le
  // garde refuse, rien ne le dirait sans ce canari. Ici, EXACTEMENT le même
  // mécanisme, rejoué sous une session ADMINISTRATEUR : l'écriture doit
  // réussir.
  await connecter(page, IDENTIFIANTS.i)
  await page.goto('/demandes/nouvelle')
  await page.getByLabel('Prénom (obligatoire)', { exact: true }).fill('Test')
  await page.getByLabel('Nom (obligatoire)', { exact: true }).fill(`${PREFIXE_MEMBRE}-canari`)
  await page.getByRole('button', { name: 'Envoyer la demande' }).click()
  await expect(page).toHaveURL(/\/demandes\?demandeCreee=1/)
  await deconnecter(page)

  await connecter(page, IDENTIFIANTS.admin)
  await page.goto('/demandes')
  const ligne = page.locator('li', { hasText: `${PREFIXE_MEMBRE}-canari` })
  const requete = await capturerRequeteAbandonnee(page, '**/demandes', () =>
    ligne.getByRole('button', { name: 'Valider comme nouvelle personne' }).click(),
  )

  await rejouerSousIdentite(browser, baseURL, IDENTIFIANTS.admin, requete)

  await expect(async () => {
    const { data: fiche } = await admin.from('membres').select('etat').eq('nom', `${PREFIXE_MEMBRE}-canari`).single()
    expect(fiche?.etat).toBe('actif')
  }).toPass()
})
