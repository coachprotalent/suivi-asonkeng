import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'

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
  // client. On la vérifie d'abord pour elle-même : le navigateur doit refuser
  // nativement une date au-delà de `max` (`validity.rangeOverflow`), avant même
  // qu'une requête ne parte.
  const validite = await dateInput.evaluate((el: HTMLInputElement) => ({
    rangeOverflow: el.validity.rangeOverflow,
    valid: el.validity.valid,
  }))
  expect(validite.rangeOverflow).toBe(true)
  expect(validite.valid).toBe(false)

  // Cette validation native intercepte le clic — la soumission est annulée avant
  // que `attribuerStatut` ne s'exécute — donc aucune alerte n'apparaît jamais,
  // quelle que soit la règle serveur : ce n'est pas un défaut du produit, c'est
  // une seconde défense (client et serveur) qui, laissée en place, empêcherait ce
  // test d'atteindre la règle serveur qu'il vise. On retire l'attribut pour
  // soumettre quand même et éprouver cette seconde défense séparément : la règle
  // serveur reste testée sans affaiblir l'assertion attendue.
  await dateInput.evaluate((el: HTMLInputElement) => el.removeAttribute('max'))
  await page.getByRole('button', { name: 'Attribuer ce statut' }).click()

  await expect(page.locator(ALERTE)).toContainText('ne peut pas être dans le futur')

  const { data } = await admin
    .from('membre_statuts')
    .select('statut_id, statuts(libelle)')
    .eq('membre_id', idMembre)
  const libelles = (data ?? []).map((l) => (l.statuts as { libelle: string }).libelle)
  expect(libelles).not.toContain('Baptisé du Saint-Esprit')
})

// --- Requête forgée contre les Server Actions -------------------------------
//
// Le test précédent prouve que l'écran cache le formulaire et le bouton à un
// non-administrateur. Il ne prouve pas que l'action serveur elle-même refuse
// l'écriture : ces écritures passent par `clientAdmin()`, la clé de service, qui
// contourne entièrement la RLS. La seule protection réelle est donc
// `exigerAdministrateur()` dans `actions.ts` — un masquage d'interface qui
// resterait vert même si cette ligne disparaissait ne protégerait rien.
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
// depuis une session différente. C'est exactement le scénario contre lequel
// `exigerAdministrateur()` existe.
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

const URL_BASE = 'http://localhost:3000'

test("un compte non administrateur ne peut pas attribuer de statut par une requete forgee", async ({
  page,
  browser,
}) => {
  await seConnecter(page, IDENT_ADMIN, MDP_ADMIN)
  await page.goto(`/membres/${idMembre}/statuts`)
  const formulaireAttribution = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Attribuer ce statut' }) })
  const champs = extraireChampsCaches(await formulaireAttribution.evaluate((el) => el.outerHTML))

  const { data: statutCible } = await admin
    .from('statuts')
    .select('id')
    .eq('libelle', 'Sert dans une commission')
    .single()

  // Session non-administrateur distincte : ce compte n'a jamais vu ce formulaire
  // (l'écran ne le lui rend pas), il ne fait que rejouer les champs capturés
  // ci-dessus sous sa propre identité authentifiée.
  const contexteSimple = await browser.newContext()
  const pageSimple = await contexteSimple.newPage()
  await seConnecter(pageSimple, IDENT_SIMPLE, MDP_SIMPLE)

  await pageSimple.request.post(`${URL_BASE}/membres/${idMembre}/statuts`, {
    multipart: { ...champs, statutId: statutCible!.id },
  })

  // Seule assertion qui compte : aucune ligne n'a été créée, quel qu'ait été le
  // code HTTP ou la redirection renvoyés.
  const { data } = await admin
    .from('membre_statuts')
    .select('statut_id')
    .eq('membre_id', idMembre)
    .eq('statut_id', statutCible!.id)
  expect(data).toHaveLength(0)

  await contexteSimple.close()
})

test("un compte non administrateur ne peut pas retirer un statut par une requete forgee", async ({
  page,
  browser,
}) => {
  // « Sert dans une commission » (groupe non exclusif « Engagements ») plutôt que
  // « Repenti » : ce dernier partage son groupe exclusif avec « Non-croyant », que
  // le premier test du fichier laisse déjà porté par ce membre. Un insert direct
  // (hors RPC `attribuer_statut`, donc sans l'éviction gérée par celle-ci) sur un
  // statut du même groupe exclusif est rejeté par la contrainte d'exclusivité —
  // silencieusement, faute de vérifier l'erreur ci-dessous — ce qui invaliderait
  // la précondition du test sans le signaler. Un statut non exclusif élimine ce
  // couplage à l'ordre d'exécution des autres tests du fichier.
  const { data: statutCible, error: erreurLecture } = await admin
    .from('statuts')
    .select('id')
    .eq('libelle', 'Sert dans une commission')
    .single()
  if (erreurLecture || !statutCible) throw new Error(`statut introuvable : ${erreurLecture?.message}`)
  const { error: erreurInsertion } = await admin
    .from('membre_statuts')
    .insert({ membre_id: idMembre, statut_id: statutCible.id })
  if (erreurInsertion) throw new Error(`préparation du test impossible : ${erreurInsertion.message}`)

  await seConnecter(page, IDENT_ADMIN, MDP_ADMIN)
  await page.goto(`/membres/${idMembre}/statuts`)
  // Le membre porte déjà d'autres statuts à ce stade (Non-croyant, Baptisé d'eau) :
  // plusieurs formulaires de retrait coexistent. On cible précisément celui de
  // « Sert dans une commission » par la ligne qui le contient, pas `.first()` —
  // sans quoi la requête forgée pourrait viser un autre statut que celui vérifié
  // ci-dessous, et le test ne prouverait rien sur le bon champ.
  const formulaireRetrait = page
    .locator('li')
    .filter({ hasText: 'Sert dans une commission' })
    .locator('form')
  const champs = extraireChampsCaches(await formulaireRetrait.evaluate((el) => el.outerHTML))

  const contexteSimple = await browser.newContext()
  const pageSimple = await contexteSimple.newPage()
  await seConnecter(pageSimple, IDENT_SIMPLE, MDP_SIMPLE)

  await pageSimple.request.post(`${URL_BASE}/membres/${idMembre}/statuts`, { multipart: champs })

  // Le statut doit toujours être là : ni supprimé, ni son absence masquée par un
  // succès idempotent qui n'aurait jamais dû s'appliquer à ce compte.
  const { data } = await admin
    .from('membre_statuts')
    .select('statut_id')
    .eq('membre_id', idMembre)
    .eq('statut_id', statutCible.id)
  expect(data).toHaveLength(1)

  await contexteSimple.close()
  await admin.from('membre_statuts').delete().eq('membre_id', idMembre).eq('statut_id', statutCible.id)
})

test("un compte non administrateur ne peut pas attribuer de statut", async ({ page }) => {
  await seConnecter(page, IDENT_SIMPLE, MDP_SIMPLE)
  await page.goto(`/membres/${idMembre}/statuts`)

  // Il consulte : les statuts et le journal lui sont ouverts.
  await expect(page.getByRole('heading', { name: /Statuts de/ })).toBeVisible()
  await expect(page.getByText('Non-croyant', { exact: true })).toBeVisible()

  // Mais il n'a ni formulaire d'attribution, ni bouton de retrait.
  await expect(page.getByRole('button', { name: 'Attribuer ce statut' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Retirer' })).toHaveCount(0)
})
