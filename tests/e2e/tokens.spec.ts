import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { expect, test, type Page } from '@playwright/test'
import { identifiantVersEmail } from '../../src/lib/domaine/identifiant'
import { MESSAGE_TOKEN_DEJA_CLOS } from '../../src/app/tokens/messages'
import { VALIDITE_JOURS_DEFAUT } from '../../src/app/tokens/constantes'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const MDP = `Test-${crypto.randomUUID()}`
const IDENT_ADMIN = 'test.e2e.tokens.admin'
const IDENT_SIMPLE = 'test.e2e.tokens.simple'

/**
 * TEST-NET-3 (RFC 5737), distincte de celle de `tests/e2e/inscription.spec.ts`
 * (203.0.113.77) : les deux suites peuvent s'exécuter dans la même fenêtre de
 * 15 minutes (contrainte projet #4, plafond de D34/D36), et partager une adresse
 * ferait courir à CETTE suite le risque d'hériter du compteur de l'autre.
 */
const ADRESSE_CONSOMMATION = '203.0.113.211'

function hacher(code: string): string {
  return createHash('sha256').update(code, 'utf8').digest('hex')
}

/**
 * Hachages des tokens créés par CETTE exécution, pour un nettoyage ciblé et
 * vérifié par comptage — même motif que `tests/e2e/inscription.spec.ts` : un
 * filtre par préfixe sur `code_hash` ne supprimerait jamais rien, puisque
 * `code_hash` est un SHA-256 qui ne porte aucune trace du code en clair.
 */
const hachagesCrees: string[] = []

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
 * Le nom AFFICHÉ des comptes de cette suite. Il paraît dans la méta de chaque ligne de
 * `/tokens` (« Créé le … par … »), et c'est ce qui permet d'y désigner LA ligne de ce test
 * plutôt qu'une ligne étrangère — voir la révocation plus bas.
 */
function nomAffichage(identifiant: string): string {
  return `Test tokens ${identifiant}`
}

async function creerCompte(identifiant: string, administrateur: boolean) {
  const { data, error } = await admin.auth.admin.createUser({
    email: identifiantVersEmail(identifiant),
    password: MDP,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(error?.message)
  const { error: erreurProfil } = await admin
    .from('profils')
    .insert({ id: data.user.id, identifiant, nom_affichage: nomAffichage(identifiant) })
  // Erreur d'insertion VÉRIFIÉE, pas jetée en silence : un insert de préparation
  // dont l'erreur est ignorée rendrait ce test vert en éprouvant un tout autre
  // chemin (registre du projet — trouvé trois fois dans cette phase). Sans ce
  // contrôle, un compte auth orphelin sans profil survivrait, introuvable par le
  // nettoyage qui interroge `profils`.
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
      throw new Error(`attribution du rôle administrateur impossible : ${erreurRole.message}`)
    }
  }
}

async function nettoyer() {
  await supprimerCompte(IDENT_ADMIN)
  await supprimerCompte(IDENT_SIMPLE)
  if (hachagesCrees.length > 0) {
    await admin.from('tokens_inscription').delete().in('code_hash', hachagesCrees)
  }
  await admin.from('tentatives_token_inscription').delete().eq('adresse', ADRESSE_CONSOMMATION)
}

test.beforeAll(async () => {
  await nettoyer()
  await creerCompte(IDENT_ADMIN, true)
  await creerCompte(IDENT_SIMPLE, false)
})

test.afterAll(async () => {
  await nettoyer()

  // Nettoyage vérifié PAR COMPTAGE (contrainte projet #7), pas seulement par
  // l'absence d'erreur sur les suppressions ci-dessus.
  const { data: residusComptes } = await admin
    .from('profils')
    .select('id')
    .in('identifiant', [IDENT_ADMIN, IDENT_SIMPLE])
  expect(residusComptes ?? []).toHaveLength(0)

  if (hachagesCrees.length > 0) {
    const { data: residusTokens } = await admin
      .from('tokens_inscription')
      .select('id')
      .in('code_hash', hachagesCrees)
    expect(residusTokens ?? []).toHaveLength(0)
  }

  const { data: residusTentatives } = await admin
    .from('tentatives_token_inscription')
    .select('id')
    .eq('adresse', ADRESSE_CONSOMMATION)
  expect(residusTentatives ?? []).toHaveLength(0)
})

async function connecter(page: Page, identifiant: string) {
  await page.goto('/connexion')
  await page.getByLabel('Identifiant').fill(identifiant)
  await page.getByLabel('Mot de passe').fill(MDP)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page).toHaveURL(/\/tableau-de-bord/)
}

/**
 * Task 15 (D124) — `window.confirm` est remplacé par le `<dialog>` natif de `Dialogue` :
 * le clic déclencheur n'ouvre plus qu'un dialogue, il ne soumet plus rien tout seul.
 * Accepte le dialogue OUVERT en cliquant son bouton « Confirmer » — l'équivalent de
 * l'ancien `page.once('dialog', (d) => d.accept())` sur la boîte native.
 */
async function accepterDialogue(page: Page) {
  await page.locator('dialog[open]').getByRole('button', { name: 'Confirmer' }).click()
}

/**
 * Génère un token générique depuis un `/tokens` déjà chargé (page déjà connectée
 * en administrateur), et rend le code en clair affiché. Le hachage est
 * immédiatement enregistré pour le nettoyage — voir `hachagesCrees`.
 */
async function genererTokenGenerique(page: Page): Promise<string> {
  await page.goto('/tokens')
  await page.getByLabel(/Générique/).check()
  await page.getByRole('button', { name: 'Générer le token' }).click()

  const code = await page.locator('code').first().textContent()
  expect(code).toBeTruthy()
  hachagesCrees.push(hacher(code!))
  return code!
}

test('un compte ordinaire ne voit pas le lien et /tokens le renvoie au tableau de bord', async ({ page }) => {
  await connecter(page, IDENT_SIMPLE)
  // ⚠️ PAR `href`, ET NON PAR NOM ACCESSIBLE. Ce test cherchait `name: /tokens/i`, ce qui a
  // cessé de convenir en phase 7 : le tableau de bord rend désormais l'état de session comme
  // un LIEN vers `/profil`, et son libellé contient l'identifiant du compte — ici
  // « test.e2e.tokens.simple », qui satisfait le motif. L'assertion tombait donc sur un lien
  // parfaitement légitime, pour une raison sans aucun rapport avec ce qu'elle éprouve.
  //
  // La destination est d'ailleurs le critère JUSTE : ce qu'on veut établir, c'est qu'un
  // compte ordinaire n'a aucun chemin vers `/tokens`, pas qu'aucun texte de la page ne
  // contient le mot.
  await expect(page.locator('a[href="/tokens"]')).toHaveCount(0)
  await page.goto('/tokens')
  await expect(page).toHaveURL(/\/tableau-de-bord/)
})

test('un administrateur génère un token générique, le voit une seule fois, puis le révoque — et ce token révoqué est réellement refusé par la consommation', async ({ page }) => {
  await connecter(page, IDENT_ADMIN)
  const code = await genererTokenGenerique(page)
  expect(code.length).toBeGreaterThanOrEqual(16)

  // Recharger la page : le code ne doit PLUS être affiché nulle part — la seule
  // occasion de le voir était l'instant de sa génération.
  await page.reload()
  await expect(page.getByText(code)).toHaveCount(0)

  // `LigneToken` demande une confirmation avant de révoquer. Depuis la Task 15 (D124),
  // ce n'est plus une boîte native mais le `<dialog>` de `Dialogue` : le clic sur
  // « Révoquer » n'ouvre que le dialogue, la révocation part au clic sur « Confirmer ».
  // Même précaution que `tests/e2e/archivage-compte.spec.ts` pour son bouton « Archiver ».
  // COMPTAGE AVANT, ET C'EST TOUT L'OBJET DU CORRECTIF CI-DESSOUS.
  const revocablesAvant = await page.getByRole('button', { name: 'Révoquer' }).count()

  /*
    ⚠️ LA LIGNE DE CE TEST, ET NON « UNE LIGNE QUELCONQUE » (enquête statuts, §6).
    Les deux points de synchronisation qui suivaient cessaient de synchroniser dès qu'un
    token révoqué ÉTRANGER traînait en base — état régulier, la base servant aussi de
    production et n'étant jamais réinitialisée :
      - `getByText('Révoqué le').first()` était satisfait IMMÉDIATEMENT par la ligne de cet
        autre token, jamais par celle du test ;
      - le comptage était satisfait à l'instant où le bouton cliqué bascule sur son libellé
        d'attente « Révocation… », donc PENDANT que la Server Action est encore en vol.
    Le test lisait alors `consommer_token_inscription` avant que l'écriture ait atterri, et
    recevait 'ok'. Reproduit trois fois sur trois, et refermé par mutation dans les deux sens.
    La ligne est donc désignée par le nom du compte créateur, propre à cette suite, et son
    unicité est vérifiée AVANT le clic : une ambiguïté doit rougir ici, pas se traduire en
    attente satisfaite ailleurs.
  */
  const ligneCible = page.locator('li').filter({ hasText: nomAffichage(IDENT_ADMIN) })
  await expect(ligneCible, 'la ligne du token de CE test doit être identifiable seule').toHaveCount(1)

  await ligneCible.getByRole('button', { name: 'Révoquer' }).click()
  await accepterDialogue(page)
  await expect(ligneCible.getByText('Révoqué le')).toBeVisible()

  /*
    LA FIN DE L'ÉCRITURE, PAS SON DÉBUT. `revocable` se calcule sur les données RENDUES par
    le serveur (`!token.revoqueLe && !token.utiliseLe`) : tant que la revalidation n'a pas
    atterri, la ligne porte encore un bouton — « Révocation… » pendant l'attente, puis de
    nouveau « Révoquer » si l'action a échoué. Exiger qu'il n'en reste AUCUN des deux sur
    cette ligne attend donc l'aller-retour complet, et rougit si la révocation échoue.
  */
  await expect(ligneCible.getByRole('button', { name: /Révo/ })).toHaveCount(0)

  // Le bouton de CETTE ligne disparaît : preuve que `revocable` est bien retombé à faux
  // côté interface. Mais une ligne qui porte une date de révocation ne prouve rien du
  // comportement RÉEL de la consommation (avertissement du brief) — la preuve
  // suivante est la seule qui compte.
  //
  // ⚠️ DELTA, PAS UN TOTAL ABSOLU — CORRIGÉ PAR LA VAGUE POST-REVUE, APRÈS UN ÉCHEC RÉEL.
  // Cette ligne lisait `expect(...'Révoquer').toHaveCount(0)`, c'est-à-dire « PLUS AUCUN
  // bouton Révoquer SUR TOUTE LA PAGE ». Elle tenait tant que la seule ligne révocable de
  // la production était celle de ce test. Elle a cessé de tenir le jour où
  // l'administrateur RÉEL a émis une invitation nominative depuis l'application : ce token
  // légitime, non révoqué et non expiré, porte lui aussi un bouton « Révoquer », et la
  // suite est devenue ROUGE POUR TOUJOURS sans qu'une seule ligne de code applicatif ait
  // changé. C'est le piège que le registre nomme : sur une base JAMAIS réinitialisée, tout
  // comptage ABSOLU est une bombe à retardement — vraie au premier lancement, fausse
  // ensuite. Le delta, lui, ne dépend pas de ce que la production contient par ailleurs.
  await expect(page.getByRole('button', { name: 'Révoquer' })).toHaveCount(revocablesAvant - 1)

  // LA PREUVE QUI COMPTE : ce code, désormais révoqué, est réellement refusé par
  // `consommer_token_inscription` — pas seulement marqué en base. Un token
  // révoqué suit la MÊME branche qu'un token expiré ou inconnu (D30, migration
  // 20260815160000) : le statut attendu est 'invalide', jamais 'ok'.
  const { data: consommation, error: erreurConsommation } = await admin.rpc('consommer_token_inscription', {
    p_code_hash: hacher(code),
    p_adresse: ADRESSE_CONSOMMATION,
  })
  expect(erreurConsommation).toBeNull()
  expect(consommation).toHaveLength(1)
  expect(consommation![0].statut).toBe('invalide')
  // CONTRÔLE POSITIF de la ligne ci-dessus : un token qu'on n'aurait PAS révoqué,
  // avec le même hachage de départ, aurait rendu 'ok' — c'est exactement ce que
  // prouve la suite `consommer_token_inscription` de `tests/rls/tokens-inscription.test.ts`
  // pour un token fraîchement créé. La révocation est donc bien la cause du refus
  // ici, pas un défaut générique de la fonction.
})

test('révoquer un token déjà révoqué par ailleurs (concurrence) échoue proprement et ne réécrit rien', async ({ page }) => {
  await connecter(page, IDENT_ADMIN)
  const code = await genererTokenGenerique(page)
  const codeHash = hacher(code)

  // Simule une révocation survenue depuis une AUTRE session pendant que cette
  // page reste ouverte, non rafraîchie : la Server Action doit refuser une
  // seconde révocation, pas la traiter comme un succès silencieux.
  const revoqueLeConcurrent = new Date().toISOString()
  const { error: erreurPreparation } = await admin
    .from('tokens_inscription')
    .update({ revoque_le: revoqueLeConcurrent })
    .eq('code_hash', codeHash)
  if (erreurPreparation) throw new Error(`préparation du token déjà révoqué impossible : ${erreurPreparation.message}`)

  await page.getByRole('button', { name: 'Révoquer' }).first().click()
  await accepterDialogue(page)

  await expect(page.getByText(MESSAGE_TOKEN_DEJA_CLOS)).toBeVisible()

  // AUCUNE réécriture : `revoque_le` reste EXACTEMENT la valeur posée ci-dessus,
  // pas une nouvelle date plus tardive qu'un remède mal gardé aurait pu poser.
  const { data: relu, error: erreurLecture } = await admin
    .from('tokens_inscription')
    .select('revoque_le')
    .eq('code_hash', codeHash)
    .single()
  expect(erreurLecture).toBeNull()
  expect(new Date(relu!.revoque_le as string).toISOString()).toBe(revoqueLeConcurrent)
})

test('révoquer un token déjà consommé par ailleurs échoue proprement et laisse la consommation intacte', async ({ page }) => {
  await connecter(page, IDENT_ADMIN)
  const code = await genererTokenGenerique(page)
  const codeHash = hacher(code)

  // Simule une consommation survenue depuis une AUTRE session (une inscription
  // réelle avec ce code) pendant que cette page reste ouverte, non rafraîchie.
  const { data: profilAdmin } = await admin.from('profils').select('id').eq('identifiant', IDENT_ADMIN).single()
  const { error: erreurPreparation } = await admin
    .from('tokens_inscription')
    .update({ utilise_le: new Date().toISOString(), utilise_par_profil_id: profilAdmin!.id })
    .eq('code_hash', codeHash)
  if (erreurPreparation) throw new Error(`préparation du token déjà consommé impossible : ${erreurPreparation.message}`)

  await page.getByRole('button', { name: 'Révoquer' }).first().click()
  await accepterDialogue(page)

  await expect(page.getByText(MESSAGE_TOKEN_DEJA_CLOS)).toBeVisible()

  // La révocation refusée ne doit ni poser `revoque_le`, ni toucher à la
  // consommation déjà enregistrée.
  const { data: relu, error: erreurLecture } = await admin
    .from('tokens_inscription')
    .select('revoque_le, utilise_le, utilise_par_profil_id')
    .eq('code_hash', codeHash)
    .single()
  expect(erreurLecture).toBeNull()
  expect(relu!.revoque_le).toBeNull()
  expect(relu!.utilise_le).not.toBeNull()
  expect(relu!.utilise_par_profil_id).toBe(profilAdmin!.id)
})

// Même motif de forge que `tests/e2e/statuts.spec.ts` et `tests/e2e/autorite.spec.ts` :
// un formulaire lié à une Server Action via `<form action={...}>` (ici,
// `envoyer` issu de `useActionState(genererToken, ...)`) rend des champs cachés
// `$ACTION_*` — des références déterministes à la fonction serveur pour cette
// version du code, pas un secret lié à la session. Quiconque a vu la page une
// seule fois peut les rejouer tels quels depuis une session différente : c'est
// exactement ce qu'un appel DIRECT à `genererToken` (par opposition à une simple
// navigation) doit démontrer.
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

/** Lève si la capture n'a trouvé aucun champ `$ACTION*` : mieux vaut un échec
 * bruyant ici qu'un test qui, silencieusement, ne teste plus rien. */
function verifierCaptureAction(champs: Record<string, string>): void {
  const trouve = Object.keys(champs).some((nom) => nom.startsWith('$ACTION'))
  if (!trouve) {
    throw new Error(
      `Capture invalide : aucun champ « $ACTION* » parmi ${JSON.stringify(Object.keys(champs))}. ` +
        "L'encodage des Server Actions a peut-être changé — ce test ne peut plus prouver ce qu'il prétend.",
    )
  }
}

test("un compte non-administrateur qui appelle genererToken directement échoue et n'écrit rien", async ({
  page,
  browser,
  baseURL,
}) => {
  // Le titre promet un appel DIRECT de la Server Action, pas une simple
  // navigation : une navigation vers /tokens renvoyée au tableau de bord
  // resterait verte même si `exigerAdministrateur()` disparaissait de
  // `genererToken` tout en restant dans `page.tsx` — le garde de la PAGE
  // suffirait à lui seul à faire passer ce test, sans jamais éprouver le garde
  // de l'ACTION. On capture donc les champs `$ACTION*` du vrai formulaire, pour
  // les rejouer par une requête HTTP brute, hors de toute interaction UI.
  await connecter(page, IDENT_ADMIN)
  await page.goto('/tokens')
  const formulaireGeneration = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Générer le token' }) })
  const champs = extraireChampsCaches(await formulaireGeneration.evaluate((el) => el.outerHTML))
  verifierCaptureAction(champs)

  const { count: avant } = await admin.from('tokens_inscription').select('id', { count: 'exact', head: true })

  // Session non-administrateur distincte : ce compte n'a jamais vu ce
  // formulaire (l'écran le renvoie au tableau de bord), il ne fait que rejouer
  // les champs capturés ci-dessus sous sa propre identité authentifiée.
  const contexteSimple = await browser.newContext({ baseURL })
  try {
    const pageSimple = await contexteSimple.newPage()
    await connecter(pageSimple, IDENT_SIMPLE)

    await pageSimple.request.post('/tokens', {
      multipart: { ...champs, mode: 'generique', validiteJours: String(VALIDITE_JOURS_DEFAUT) },
    })

    // Seule assertion qui compte : aucune ligne n'a été créée, quel qu'ait été
    // le code HTTP ou la redirection renvoyés par la requête forgée.
    const { count: apres } = await admin.from('tokens_inscription').select('id', { count: 'exact', head: true })
    expect(apres).toBe(avant)
  } finally {
    await contexteSimple.close()
  }
})
