import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'

// État partagé par les tests : ils modifient et lisent la même fiche membre, et
// l'ordre choisi ci-dessous fait partie du scénario (éviction, cumul, etc.). Le
// mode série verrouille cet ordre — sans lui, une seule option comme `retries`
// pourrait un jour réexécuter un test isolément et le faire échouer sur un état
// qu'il ne prépare pas lui-même.
test.describe.configure({ mode: 'serial' })

const IDENT_ADMIN = 'test.e2e.statuts.admin'
const IDENT_SIMPLE = 'test.e2e.statuts.simple'
// Tirés à chaque exécution : jamais de mot de passe littéral dans un dépôt public.
const MDP_ADMIN = `Test-${crypto.randomUUID()}`
const MDP_SIMPLE = `Test-${crypto.randomUUID()}`
const NOM_MEMBRE = `ZZStatuts-${crypto.randomUUID().slice(0, 8)}`

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const ALERTE = '[role="alert"]:not(#__next-route-announcer__)'

let idMembre: string

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
  // `membre_statuts` et `journal_statuts` disparaissent en cascade avec le membre.
  await admin.from('membres').delete().like('nom', 'ZZStatuts-%')
  await supprimerCompte(IDENT_ADMIN)
  await supprimerCompte(IDENT_SIMPLE)
}

async function creerCompte(identifiant: string, mdp: string, estAdmin: boolean) {
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

  if (estAdmin) {
    const { error: erreurRole } = await admin
      .from('roles_profil')
      .insert({ profil_id: data.user.id, role: 'administrateur' })
    if (erreurRole) {
      await admin.auth.admin.deleteUser(data.user.id)
      throw new Error(`attribution du rôle impossible : ${erreurRole.message}`)
    }
  }
}

test.beforeAll(async () => {
  await nettoyer()
  await creerCompte(IDENT_ADMIN, MDP_ADMIN, true)
  await creerCompte(IDENT_SIMPLE, MDP_SIMPLE, false)

  const { data, error } = await admin
    .from('membres')
    .insert({ nom: NOM_MEMBRE, prenom: 'Jérôme' })
    .select('id')
    .single()
  if (error || !data) throw new Error(`création du membre impossible : ${error?.message}`)
  idMembre = data.id
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

async function attribuer(page: import('@playwright/test').Page, libelle: string) {
  await page.getByLabel('Statut (obligatoire)').selectOption({ label: libelle })
  await page.getByRole('button', { name: 'Attribuer ce statut' }).click()
}

// Piège de sélecteur constaté à l'exécution (absent du brief) : le libellé d'un
// statut porté apparaît deux fois dans le DOM pour un administrateur — une fois
// dans la liste « Statuts actuels », une fois comme <option> (invisible mais
// toujours présent) du <select> d'attribution. `page.getByText(libelle, { exact:
// true })` sans portée est donc ambigu en mode strict dès que le compte est
// administrateur. On scope à la section « Statuts actuels » pour lever
// l'ambiguïté sans dépendre d'une classe CSS.
function statutsActuels(page: import('@playwright/test').Page) {
  return page.locator('section', { has: page.getByRole('heading', { name: 'Statuts actuels', exact: true }) })
}

// Le client Supabase, faute de types `Database` générés, déclare un embed
// plusieurs-vers-un comme un tableau alors que PostgREST renvoie un objet au
// runtime (même contournement que `Imbrique<T>`/`premier<T>` dans
// `src/lib/donnees/statuts.ts`, qui est `server-only` et donc inimportable ici).
// Sans lui, `(l.statuts as { libelle: string }).libelle` compile en mentant sur
// la forme réelle : si l'embed était un jour un tableau, `.libelle` vaudrait
// `undefined`, et une assertion négative (`not.toContain`) ne verrait jamais la
// différence entre « la valeur cherchée est absente » et « je regarde du vide ».
type Imbrique<T> = T | T[] | null | undefined
function premier<T>(valeur: Imbrique<T>): T | null {
  if (valeur === null || valeur === undefined) return null
  return Array.isArray(valeur) ? (valeur[0] ?? null) : valeur
}
function libelleNonVide(embed: Imbrique<{ libelle: unknown }>): string {
  const statut = premier(embed)
  if (!statut || typeof statut.libelle !== 'string' || statut.libelle.length === 0) {
    throw new Error('Jointure statuts inattendue : libellé absent, vide, ou de forme imprévue.')
  }
  return statut.libelle
}

test("attribuer un second statut du meme groupe evince le premier", async ({ page }) => {
  await seConnecter(page, IDENT_ADMIN, MDP_ADMIN)
  await page.goto(`/membres/${idMembre}/statuts`)
  const panneau = statutsActuels(page)

  await attribuer(page, 'Repenti')
  await expect(panneau.getByText('Repenti', { exact: true })).toBeVisible()

  await attribuer(page, 'Non-croyant')

  // « Cheminement » est un groupe exclusif : le premier statut doit avoir disparu.
  await expect(panneau.getByText('Non-croyant', { exact: true })).toBeVisible()
  await expect(panneau.getByText('Repenti', { exact: true })).toHaveCount(0)

  // Le journal doit porter les trois mouvements, dont le retrait automatique.
  await expect(page.getByText('Remplacé par un autre statut du même groupe')).toBeVisible()
  const { data } = await admin
    .from('journal_statuts')
    .select('action')
    .eq('membre_id', idMembre)
  expect(data).toHaveLength(3)
})

test("un statut d'un autre groupe se cumule sans rien retirer", async ({ page }) => {
  await seConnecter(page, IDENT_ADMIN, MDP_ADMIN)
  await page.goto(`/membres/${idMembre}/statuts`)
  const panneau = statutsActuels(page)

  await attribuer(page, "Baptisé d'eau")

  // « Engagements » n'est pas exclusif : les deux statuts coexistent. Sans ce test,
  // l'exclusivité pourrait s'appliquer partout sans que rien ne le signale.
  await expect(panneau.getByText("Baptisé d'eau", { exact: true })).toBeVisible()
  await expect(panneau.getByText('Non-croyant', { exact: true })).toBeVisible()
})

test("une date d'acquisition dans le futur est refusee", async ({ page }) => {
  await seConnecter(page, IDENT_ADMIN, MDP_ADMIN)
  await page.goto(`/membres/${idMembre}/statuts`)

  const demain = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
  await page.getByLabel('Statut (obligatoire)').selectOption({ label: 'Baptisé du Saint-Esprit' })
  const dateInput = page.getByLabel("Date d'acquisition")
  await dateInput.fill(demain)

  // Évolution non répertoriée dans le contexte de tâche : le champ porte désormais
  // `max={aujourd'hui}` (voir formulaire-statut.tsx) — une première défense, côté
  // client. Ce qu'on vérifie ici, précisément : le navigateur déclare la valeur
  // invalide pour la contrainte `max` (`validity.rangeOverflow` et `valid`). On
  // n'observe pas directement l'annulation de la soumission dans ce bloc — c'est
  // la validation native standard des navigateurs pour `<input type="date"
  // max="...">`, qui empêche l'événement submit de partir tant que la contrainte
  // est violée.
  const validite = await dateInput.evaluate((el: HTMLInputElement) => ({
    rangeOverflow: el.validity.rangeOverflow,
    valid: el.validity.valid,
  }))
  expect(validite.rangeOverflow).toBe(true)
  expect(validite.valid).toBe(false)

  // Cette première défense, laissée en place, empêcherait ce test d'atteindre la
  // règle serveur qu'il vise : aucune alerte n'apparaîtrait jamais, quelle que
  // soit cette règle. On retire l'attribut pour soumettre quand même et éprouver
  // la seconde défense (serveur) séparément : la règle serveur reste testée sans
  // affaiblir l'assertion attendue.
  await dateInput.evaluate((el: HTMLInputElement) => el.removeAttribute('max'))
  await page.getByRole('button', { name: 'Attribuer ce statut' }).click()

  await expect(page.locator(ALERTE)).toContainText('ne peut pas être dans le futur')

  const { data, error } = await admin
    .from('membre_statuts')
    .select('statut_id, statuts(libelle)')
    .eq('membre_id', idMembre)
  if (error) throw new Error(`lecture des statuts impossible : ${error.message}`)
  const libelles = (data ?? []).map((l) => libelleNonVide(l.statuts as Imbrique<{ libelle: unknown }>))
  expect(libelles).not.toContain('Baptisé du Saint-Esprit')
})

/*
  Barrière d'accessibilité. Les deux champs facultatifs du formulaire portent un
  texte d'aide ; laissé DANS le <label>, ce texte est concaténé au nom accessible
  du champ. Vérifié dans un vrai navigateur avant correction : le champ date
  s'annonçait « Date d'acquisition Facultative. Elle n'est pas toujours connue.
  Sur un statut déjà porté, laisser vide conserve la date enregistrée. »

  Ce test ne modifie rien : il lit le formulaire, sans rien attribuer. Il peut
  donc vivre au milieu d'une suite en mode série sans en perturber le scénario.

  Le <select> « Statut (obligatoire) » est assuré ici LUI AUSSI, et délibérément :
  la revue qui a signalé ce défaut visait les <select>, alors que la mesure a
  montré qu'ils étaient déjà corrects. L'assertion fige ce fait au lieu de le
  laisser reposer sur une mesure ponctuelle.
*/
test('les champs du formulaire portent des noms accessibles propres', async ({ page }) => {
  await seConnecter(page, IDENT_ADMIN, MDP_ADMIN)
  await page.goto(`/membres/${idMembre}/statuts`)

  await expect(
    page.getByRole('combobox', { name: 'Statut (obligatoire)', exact: true }),
  ).toHaveCount(1)

  const champDate = page.getByRole('textbox', { name: "Date d'acquisition", exact: true })
  const champNote = page.getByRole('textbox', { name: 'Note', exact: true })
  await expect(champDate).toHaveCount(1)
  await expect(champNote).toHaveCount(1)

  // Dit la faute d'origine en propre : aucun champ ne doit porter son texte d'aide
  // dans son NOM.
  await expect(page.getByRole('textbox', { name: /Facultative/ })).toHaveCount(0)

  // Et l'aide doit rester accessible en DESCRIPTION. Sans cette moitié, un
  // identifiant mal orthographié laisserait tout le reste vert en ayant fait
  // disparaître l'aide de l'arbre d'accessibilité — pire qu'avant la correction.
  for (const [champ, attendu] of [
    [champDate, /laisser vide conserve la date enregistrée/],
    [champNote, /laisser vide conserve la note enregistrée/],
  ] as const) {
    const idAide = await champ.getAttribute('aria-describedby')
    expect(idAide, 'le champ doit déclarer une description').toBeTruthy()
    // Sélecteur d'ATTRIBUT et non `#id` : `useId()` produit des identifiants qui
    // contiennent des caractères non valides dans un sélecteur CSS sans échappement.
    await expect(page.locator(`[id="${idAide}"]`)).toHaveText(attendu)
  }
})

// --- Requêtes forgées contre les Server Actions ------------------------------
//
// Le test de masquage d'interface (plus bas) prouve que l'écran cache le
// formulaire et le bouton à un non-administrateur. Il ne prouve pas que l'action
// serveur elle-même refuse l'écriture : ces écritures passent par
// `clientAdmin()`, la clé de service, qui contourne entièrement la RLS. La seule
// protection réelle est donc `exigerAutoriteSur()` dans `actions.ts` (Task 11 —
// avant elle, `exigerAdministrateur()`) — un masquage d'interface qui resterait
// vert même si ce garde disparaissait ne protégerait rien (constaté par preuve
// de mutation, voir le rapport de tâche).
//
// Pour l'éprouver, on reproduit ce qu'un formulaire HTML ordinaire envoie sans
// JavaScript : des champs cachés qui référencent l'action serveur. Le formulaire
// de retrait (action directe, non liée à `useActionState`) porte un champ nommé
// littéralement `$ACTION_ID_<hash>`. Le formulaire d'attribution, enveloppé par
// `useActionState`, encode la même idée sur plusieurs champs
// (`$ACTION_REF_n`, `$ACTION_n:0`, `$ACTION_n:1`, `$ACTION_KEY`). Dans les deux
// cas, ce sont des références déterministes à la fonction serveur pour cette
// version du code — pas un secret lié à la session — donc quiconque a vu la
// page une seule fois (ici : un administrateur) peut les rejouer tels quels
// depuis une session différente.
//
// Un refus obtenu parce que la requête forgée est mal formée (encodage
// `$ACTION_*` différent, vérification d'origine durcie, formulaire remanié)
// serait indiscernable, dans ces seules assertions, d'un refus obtenu par le
// garde — les deux rendraient le test vert pour toujours. Deux filets contre ce
// risque : `verifierCaptureAction` lève si aucun champ `$ACTION*` n'a été
// capturé, et le test canari plus bas prouve, avec exactement le même
// mécanisme, qu'une session administrateur réussit — si le mécanisme lui-même
// casse un jour, c'est ce canari qui tombe, pas les tests de refus.
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

async function statutParLibelle(libelle: string): Promise<string> {
  const { data, error } = await admin.from('statuts').select('id').eq('libelle', libelle).single()
  if (error || !data) throw new Error(`statut « ${libelle} » introuvable : ${error?.message}`)
  return data.id as string
}

async function compterMembreStatut(statutId: string): Promise<number> {
  const { data, error } = await admin
    .from('membre_statuts')
    .select('statut_id')
    .eq('membre_id', idMembre)
    .eq('statut_id', statutId)
  if (error) throw new Error(`lecture de membre_statuts impossible : ${error.message}`)
  return (data ?? []).length
}

test("un compte sans autorité ne peut pas attribuer de statut par une requete forgee", async ({
  page,
  browser,
  baseURL,
}) => {
  // Cible dédiée à ce test, distincte de celle du test de retrait forgé
  // ci-dessous : les deux tests écrivent réellement en base (ou tentent de le
  // faire) sur le même membre, et un statut partagé les couplerait — si l'un
  // laissait une ligne derrière lui, l'autre échouerait sur sa propre
  // précondition plutôt que sur l'assertion de sécurité qu'il vise.
  const idStatutCible = await statutParLibelle('Sert dans une commission')
  expect(await compterMembreStatut(idStatutCible)).toBe(0)

  await seConnecter(page, IDENT_ADMIN, MDP_ADMIN)
  await page.goto(`/membres/${idMembre}/statuts`)
  const formulaireAttribution = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Attribuer ce statut' }) })
  const champs = extraireChampsCaches(await formulaireAttribution.evaluate((el) => el.outerHTML))
  verifierCaptureAction(champs)

  // Session non-administrateur distincte : ce compte n'a jamais vu ce formulaire
  // (l'écran ne le lui rend pas), il ne fait que rejouer les champs capturés
  // ci-dessus sous sa propre identité authentifiée.
  const contexteSimple = await browser.newContext({ baseURL })
  try {
    const pageSimple = await contexteSimple.newPage()
    await seConnecter(pageSimple, IDENT_SIMPLE, MDP_SIMPLE)

    await pageSimple.request.post(`/membres/${idMembre}/statuts`, {
      multipart: { ...champs, statutId: idStatutCible },
    })

    // Seule assertion qui compte : aucune ligne n'a été créée, quel qu'ait été le
    // code HTTP ou la redirection renvoyés.
    expect(await compterMembreStatut(idStatutCible)).toBe(0)
  } finally {
    await contexteSimple.close()
  }
})

test("un compte sans autorité ne peut pas retirer un statut par une requete forgee", async ({
  page,
  browser,
  baseURL,
}) => {
  // « Baptisé du Saint-Esprit » (groupe non exclusif « Engagements »), distinct
  // de la cible du test d'attribution forgée ci-dessus et de « Repenti » (groupe
  // exclusif « Cheminement » partagé avec « Non-croyant », déjà porté par ce
  // membre depuis le premier test du fichier — un insert direct dessus, hors RPC
  // `attribuer_statut`, entrerait en conflit avec la contrainte d'exclusivité).
  const idStatutCible = await statutParLibelle('Baptisé du Saint-Esprit')
  expect(await compterMembreStatut(idStatutCible)).toBe(0)
  const { error: erreurInsertion } = await admin
    .from('membre_statuts')
    .insert({ membre_id: idMembre, statut_id: idStatutCible })
  if (erreurInsertion) throw new Error(`préparation du test impossible : ${erreurInsertion.message}`)

  try {
    await seConnecter(page, IDENT_ADMIN, MDP_ADMIN)
    await page.goto(`/membres/${idMembre}/statuts`)
    // Le membre porte déjà d'autres statuts à ce stade (Non-croyant, Baptisé
    // d'eau) : plusieurs formulaires de retrait coexistent. On cible précisément
    // celui de « Baptisé du Saint-Esprit » par la ligne qui le contient, pas
    // `.first()` — sans quoi la requête forgée pourrait viser un autre statut que
    // celui vérifié ci-dessous, et le test ne prouverait rien sur le bon champ.
    const formulaireRetrait = page
      .locator('li')
      .filter({ hasText: 'Baptisé du Saint-Esprit' })
      .locator('form')
    const champs = extraireChampsCaches(await formulaireRetrait.evaluate((el) => el.outerHTML))
    verifierCaptureAction(champs)

    const contexteSimple = await browser.newContext({ baseURL })
    try {
      const pageSimple = await contexteSimple.newPage()
      await seConnecter(pageSimple, IDENT_SIMPLE, MDP_SIMPLE)

      await pageSimple.request.post(`/membres/${idMembre}/statuts`, { multipart: champs })

      // Le statut doit toujours être là : ni supprimé, ni son absence masquée par
      // un succès idempotent qui n'aurait jamais dû s'appliquer à ce compte.
      expect(await compterMembreStatut(idStatutCible)).toBe(1)
    } finally {
      await contexteSimple.close()
    }
  } finally {
    // À l'abri d'un échec d'assertion ci-dessus : sans ce `finally`, un test qui
    // tombe laisserait le statut derrière lui pour le suivant.
    await admin.from('membre_statuts').delete().eq('membre_id', idMembre).eq('statut_id', idStatutCible)
  }
})

test('masquage d\'interface : un compte non administrateur ne voit ni formulaire ni bouton de retrait', async ({
  page,
}) => {
  // Nommé précisément d'après ce qu'il vérifie : l'absence des éléments dans le
  // DOM, pas l'autorisation de l'action serveur. La preuve par mutation a montré
  // que ce test reste vert même sans `exigerAutoriteSur()` dans `actions.ts`
  // (avant la Task 11, `exigerAdministrateur()`) — ce sont les deux tests de
  // requête forgée ci-dessus qui protègent la barrière serveur ; celui-ci
  // protège seulement l'écran.
  await seConnecter(page, IDENT_SIMPLE, MDP_SIMPLE)
  await page.goto(`/membres/${idMembre}/statuts`)

  // Il consulte : les statuts et le journal lui sont ouverts.
  await expect(page.getByRole('heading', { name: /Statuts de/ })).toBeVisible()
  await expect(page.getByText('Non-croyant', { exact: true })).toBeVisible()

  // Mais il n'a ni formulaire d'attribution, ni bouton de retrait.
  await expect(page.getByRole('button', { name: 'Attribuer ce statut' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Retirer' })).toHaveCount(0)
})

test('canari : la meme requete forgee reussit depuis une session administrateur', async ({ page }) => {
  // Contrôle positif, exigé en revue : si les deux tests de refus ci-dessus
  // passaient un jour parce que la requête forgée est mal formée (encodage
  // `$ACTION_*` changé, vérification d'origine durcie, formulaire remanié) et
  // non parce que le garde refuse, ce serait indiscernable sans ce test. Ici,
  // exactement le même mécanisme de capture et de rejeu est utilisé, mais depuis
  // une session administrateur, et l'écriture doit réussir. S'il casse, c'est le
  // mécanisme de forge qui est en cause, pas la sécurité — personne ne pourra
  // confondre les deux.
  const idStatutCible = await statutParLibelle('Sert dans une commission')
  expect(await compterMembreStatut(idStatutCible)).toBe(0)

  try {
    await seConnecter(page, IDENT_ADMIN, MDP_ADMIN)
    await page.goto(`/membres/${idMembre}/statuts`)
    const formulaireAttribution = page
      .locator('form')
      .filter({ has: page.getByRole('button', { name: 'Attribuer ce statut' }) })
    const champs = extraireChampsCaches(await formulaireAttribution.evaluate((el) => el.outerHTML))
    verifierCaptureAction(champs)

    // Même session (déjà administrateur), même mécanisme de requête brute — seule
    // l'identité change par rapport aux deux tests de refus ci-dessus. `page`
    // vient du fixture par défaut : `page.request` suit déjà `baseURL` sans
    // qu'on ait à le répéter.
    await page.request.post(`/membres/${idMembre}/statuts`, {
      multipart: { ...champs, statutId: idStatutCible },
    })

    expect(await compterMembreStatut(idStatutCible)).toBe(1)
  } finally {
    await admin.from('membre_statuts').delete().eq('membre_id', idMembre).eq('statut_id', idStatutCible)
  }
})
