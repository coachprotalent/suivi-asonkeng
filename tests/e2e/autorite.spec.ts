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

function emailDe(identifiant: string): string {
  return `${identifiant}@asonkeng.local`
}

/**
 * TOUS les comptes `auth`, page par page.
 *
 * `listUsers()` SANS ARGUMENT NE REND QUE LA PREMIÈRE PAGE (50 comptes par défaut). Le
 * repli orphelin de `supprimerCompte` s'appuyait dessus : passé cinquante comptes dans le
 * projet, il aurait cessé de trouver l'orphelin qu'il cherchait — en silence, en rendant
 * simplement « pas trouvé ». On pagine donc, avec une borne dure : une pagination qui ne
 * progresse pas doit LEVER, jamais tourner sans fin.
 */
async function listerTousLesComptes(): Promise<{ id: string; email?: string }[]> {
  const PAR_PAGE = 200
  const PAGES_MAX = 200
  const tous: { id: string; email?: string }[] = []
  for (let page = 1; page <= PAGES_MAX; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PAR_PAGE })
    if (error) throw new Error(`listUsers (page ${page}) impossible : ${error.message}`)
    const utilisateurs = data?.users ?? []
    tous.push(...utilisateurs.map((u) => ({ id: u.id, email: u.email })))
    if (utilisateurs.length < PAR_PAGE) return tous
  }
  throw new Error(
    `listUsers : ${PAGES_MAX} pages parcourues sans atteindre la fin — la pagination ne progresse pas.`,
  )
}

/**
 * Supprime le compte `auth` d'un identifiant — profil compris, par la cascade de
 * `profils_id_fkey`.
 *
 * ═══ L'ERREUR DE `deleteUser` EST VÉRIFIÉE, ET ELLE LÈVE ═══
 * Elle était IGNORÉE. Un nettoyage dont l'échec est invisible par construction GARANTIT le
 * retour du résidu : c'est exactement ce qui s'est produit avec `test.e2e.autorite.lie`,
 * revenu en base après chaque exécution, profil ET compte `auth` présents, `membre_id` à
 * NULL alors que la clé étrangère est `on delete set null` — donc des fiches supprimées
 * pendant que le compte, lui, ne l'était pas. On ne sait pas trancher entre les causes
 * possibles APRÈS COUP, et c'est précisément le défaut : il faut que l'échec se voie AU
 * MOMENT où il a lieu.
 */
async function supprimerCompte(identifiant: string) {
  const { data, error: erreurProfil } = await admin
    .from('profils')
    .select('id')
    .eq('identifiant', identifiant)
    .maybeSingle()
  if (erreurProfil) {
    throw new Error(`lecture du profil ${identifiant} impossible : ${erreurProfil.message}`)
  }
  if (data) {
    const { error } = await admin.auth.admin.deleteUser(data.id)
    if (error) {
      throw new Error(`suppression du compte ${identifiant} (${data.id}) impossible : ${error.message}`)
    }
    return
  }
  const orphelin = (await listerTousLesComptes()).find((u) => u.email === emailDe(identifiant))
  if (orphelin) {
    const { error } = await admin.auth.admin.deleteUser(orphelin.id)
    if (error) {
      throw new Error(
        `suppression du compte orphelin ${identifiant} (${orphelin.id}) impossible : ${error.message}`,
      )
    }
  }
}

/**
 * Crée un compte NON administrateur et le lie éventuellement à une fiche.
 *
 * La liaison est posée directement en base : l'écran qui la pose n'arrive qu'à la
 * Task 14, et un test n'a pas à passer par l'interface pour préparer son état.
 */
async function creerCompte(identifiant: string, mdp: string, membreId: string | null) {
  // `emailDe`, jamais le littéral recopié : c'est la MÊME adresse que le repli orphelin de
  // `supprimerCompte` cherche, et deux écritures pourraient diverger.
  const { data, error } = await admin.auth.admin.createUser({
    email: emailDe(identifiant),
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

/**
 * ═══ CE NETTOYAGE SE VÉRIFIE — IL NE SE CONTENTE PLUS DE SUPPRIMER ═══
 *
 * Il n'avait AUCUNE assertion de comptage : il supprimait et ne regardait jamais. Un
 * `delete` PostgREST qui ne touche aucune ligne ne rend aucune erreur, et un `deleteUser`
 * en échec ne disait rien non plus. Le résidu `test.e2e.autorite.lie` pouvait donc revenir
 * indéfiniment sans que rien ne le signale — et il est revenu.
 *
 * Les trois comptages sont ABSOLUS SUR CETTE FAMILLE, jamais sur la base : le préfixe
 * `ZZAutorite-` et les trois identifiants de cette suite n'appartiennent qu'à elle.
 *
 * LE CONTRÔLE DES COMPTES `auth` NE PASSE PAS PAR `profils` : un orphelin `auth` n'a par
 * définition AUCUNE ligne dans `profils`, et un contrôle qui l'y chercherait serait vrai à
 * vide pour le cas même qu'il prétend fermer.
 *
 * ═══ ET L'ORDRE EST INVERSÉ : LES FICHES D'ABORD, LES COMPTES ENSUITE ═══
 *
 * C'EST LA CAUSE RÉELLE DU RÉSIDU, mesurée, et ce n'était pas « une exécution concurrente
 * d'une autre session ». L'ordre précédent — comptes d'abord — était justifié ainsi :
 * « supprimer les fiches avant les comptes laisserait des profils à moitié nettoyés si la
 * suppression des comptes échouait ensuite ». Le raisonnement ne tenait pas compte de ce
 * qui se passe réellement à la suppression d'un profil :
 *
 *   1. le premier test de cette suite attribue « Repenti » à `-petit-enfant` DEPUIS le
 *      compte `IDENT_LIE`, et ne le retire jamais — la ligne `membre_statuts` porte donc
 *      `attribue_par` = le profil de ce compte ;
 *   2. supprimer le profil doit donc TOUCHER cette ligne. La clé étrangère est
 *      `on delete set null` — vérifié dans `20260813110000_membre_statuts.sql:10` ET
 *      dans le catalogue déployé (`confdeltype = 'n'`). Ce n'est donc PAS un refus de
 *      clé étrangère : c'est l'écriture induite qui échoue. `deleteUser` s'exécute sous
 *      `supabase_auth_admin`, qui n'a `rolbypassrls` ni AUCUN privilège sur
 *      `public.membre_statuts` ni `public.journal_statuts` — mesuré dans
 *      `information_schema.role_table_grants`. Ce fait négatif est établi ; le chemin
 *      exact de l'échec ne l'est PAS, `set role supabase_auth_admin` étant refusé ici.
 *      Ne durcis pas cette phrase sans l'avoir reproduite ;
 *   3. `deleteUser` échouait donc — MESURÉ : « Database error deleting user » —, l'erreur
 *      était ignorée, et les fiches partaient juste après. La cascade emportait alors
 *      `membre_statuts` et `journal_statuts`, et `profils.membre_id` passait à NULL
 *      (`profils_membre_id_fkey`, `on delete set null`).
 *
 * D'où l'état constaté après chaque exécution : le profil ET son `auth.users` présents,
 * `membre_id` à NULL, zéro rôle. Exactement ce qu'on observait, sans aucune concurrence.
 *
 * DANS L'AUTRE ORDRE, la suppression des fiches emporte d'abord `membre_statuts` et
 * `journal_statuts` par cascade, et `deleteUser` PASSE — mesuré aussi, sur le résidu réel :
 * `membre_statuts` bloquants 1 → 0, `journal_statuts` 2 → 0, puis `deleteUser` : RÉUSSITE.
 * Le risque que l'ancien ordre voulait éviter — un demi-nettoyage muet — est fermé par les
 * deux autres corrections : l'erreur de `deleteUser` LÈVE, et les comptages ci-dessous
 * assertent.
 */
async function nettoyer() {
  const { error: erreurMembres } = await admin
    .from('membres')
    .delete()
    .like('nom', 'ZZAutorite-%')
  if (erreurMembres) throw new Error(`suppression des fiches impossible : ${erreurMembres.message}`)

  for (const identifiant of [IDENT_LIE, IDENT_AUTRE, IDENT_SANS_FICHE]) {
    await supprimerCompte(identifiant)
  }

  const identifiants = [IDENT_LIE, IDENT_AUTRE, IDENT_SANS_FICHE]
  const { data: profilsResiduels, error: erreurProfils } = await admin
    .from('profils')
    .select('identifiant')
    .in('identifiant', identifiants)
  if (erreurProfils) throw new Error(`lecture des profils résiduels : ${erreurProfils.message}`)
  expect(
    (profilsResiduels ?? []).map((p) => p.identifiant),
    'profil résiduel de cette suite : le nettoyage a échoué en silence',
  ).toEqual([])

  const emails = identifiants.map(emailDe)
  const comptesResiduels = (await listerTousLesComptes())
    .map((u) => u.email)
    .filter((email): email is string => email !== undefined && emails.includes(email))
  expect(
    comptesResiduels,
    "compte `auth` résiduel de cette suite : `deleteUser` a échoué, ou la fiche a été supprimée sans le compte",
  ).toEqual([])

  const { count, error: erreurComptage } = await admin
    .from('membres')
    .select('id', { count: 'exact', head: true })
    .like('nom', 'ZZAutorite-%')
  if (erreurComptage) throw new Error(`comptage des fiches résiduelles : ${erreurComptage.message}`)
  expect(count, 'fiche ZZAutorite- résiduelle : le nettoyage a échoué en silence').toBe(0)
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

    // Masquage d'interface, dans la même session : ce compte lit l'écran (le
    // journal reste ouvert à tout compte actif) mais n'y voit ni formulaire
    // d'attribution ni bouton de retrait. Cette garantie ne vivait auparavant
    // que dans un rapport et des captures d'écran supprimées après coup — elle
    // ne protégeait personne tant qu'aucun test permanent ne la vérifiait.
    await autrePage.goto(`/membres/${idPetitEnfant}/statuts`)
    await expect(autrePage.getByRole('heading', { name: /Statuts de/ })).toBeVisible()
    await expect(autrePage.getByRole('heading', { name: 'Journal' })).toBeVisible()
    await expect(autrePage.getByRole('heading', { name: 'Attribuer un statut' })).toHaveCount(0)
    await expect(autrePage.getByLabel('Statut (obligatoire)')).toHaveCount(0)
    await expect(autrePage.getByRole('button', { name: 'Retirer' })).toHaveCount(0)
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
  browser,
  baseURL,
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
  //
  // Rejeu depuis un `browser.newContext()`, comme les deux refus ci-dessus — et non
  // depuis le contexte de capture, dans le même `page`. Sans cet alignement, ce
  // canari certifierait le rejeu INTRA-contexte, pas le rejeu INTER-contextes que
  // les tests de refus exercent réellement : les deux mécanismes de rejeu pourraient
  // diverger un jour (un durcissement lié à l'origine ou au cookie de session, par
  // exemple) sans que ce canari le remarque.
  const idStatut = await statutParLibelle('Baptisé du Saint-Esprit')
  expect(await compterMembreStatut(idPetitEnfant, idStatut)).toBe(0)

  const champs = await capturerChampsAttribution(page, idPetitEnfant)

  const contexte = await browser.newContext({ baseURL })
  try {
    const autrePage = await contexte.newPage()
    await seConnecter(autrePage, IDENT_LIE, MDP_LIE)

    await autrePage.request.post(`/membres/${idPetitEnfant}/statuts`, {
      multipart: { ...champs, statutId: idStatut },
    })

    expect(await compterMembreStatut(idPetitEnfant, idStatut)).toBe(1)
  } finally {
    await contexte.close()
    await admin
      .from('membre_statuts')
      .delete()
      .eq('membre_id', idPetitEnfant)
      .eq('statut_id', idStatut)
  }
})
