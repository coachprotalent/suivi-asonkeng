import { createClient } from '@supabase/supabase-js'
import { expect, request as requestPlaywright, test, type Page } from '@playwright/test'
import { identifiantVersEmail } from '../../src/lib/domaine/identifiant'
// La CONSTANTE de production, jamais un 25 recopié : le jour où la taille de page change,
// ce test doit franchir la NOUVELLE frontière, pas l'ancienne. `arbre-lots.ts` n'est pas
// `server-only` — c'est exactement pour cela qu'il existe.
import { TAILLE_PAGE_DISCIPLES } from '../../src/lib/donnees/arbre-lots'

test.describe.configure({ mode: 'serial' })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const MDP = `Test-${crypto.randomUUID()}`
const IDENT_ADMIN = 'test.e2e.arborescence.admin'
const IDENT_SIMPLE = 'test.e2e.arborescence.simple'

const PREFIXE_FAMILLE = 'ZZArborescenceE2E-'
const PREFIXE = `${PREFIXE_FAMILLE}${crypto.randomUUID().slice(0, 8)}`

const NOM_RACINE = `${PREFIXE}-racine`
const NOM_DISCIPLE = `${PREFIXE}-disciple`
const NOM_PETIT = `${PREFIXE}-petit`
const NOM_FEUILLE = `${PREFIXE}-feuille`
const NOM_ARCHIVE = `${PREFIXE}-archive`

/*
  ═══ LA GRANDE FRATRIE : LE CAS QUE LA RECHERCHE DOIT FRANCHIR ═══

  `NOM_FRATRIE` porte `TAILLE_PAGE_DISCIPLES + 1` disciples, et la personne cherchée est le
  DERNIER dans l'ordre `(nom, prenom, id)` — donc SEULE SUR LA PAGE 2.

  SANS LE CALCUL DE PAGE, LA RECHERCHE CHARGERAIT LA PAGE 1 DE CHAQUE MAILLON, la cible ne
  serait JAMAIS rendue dans l'arbre, rien ne la mettrait en évidence, et le fil d'Ariane
  afficherait pourtant son chemin complet. Un arbre à deux disciples ne peut pas voir ce
  défaut : il n'a qu'une page. C'est pour cela que ce cas est CONSTRUIT, et non supposé —
  sans lui, retirer le calcul de page ne ferait tomber aucune preuve.

  `-frere-zz-cible` trie après `-frere-00` … `-frere-NN` : « z » > un chiffre.

  LES NOMS SONT CHOISIS POUR NE PAS SE CONTENIR L'UN L'AUTRE. Les locateurs de cette suite
  sont des expressions régulières sur le nom du bouton : si le nom du parent était un
  PRÉFIXE de celui de ses enfants, `new RegExp(NOM_FRATRIE)` en trouverait vingt-sept et
  violerait le mode strict de Playwright. D'où `-fratrie` pour le parent et `-frere-…` pour
  les enfants — deux familles disjointes.
*/
const NOM_FRATRIE = `${PREFIXE}-fratrie`
const NOM_CIBLE_PAGE_2 = `${PREFIXE}-frere-zz-cible`

let idRacine: string
let idDisciple: string
let idFeuille: string
let idFratrie: string

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

async function creerCompte(identifiant: string, roles: string[]) {
  const { data, error } = await admin.auth.admin.createUser({
    email: identifiantVersEmail(identifiant),
    password: MDP,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`création du compte ${identifiant} : ${error?.message}`)
  const { error: erreurProfil } = await admin
    .from('profils')
    .insert({ id: data.user.id, identifiant, nom_affichage: `Test arbo ${identifiant}` })
  if (erreurProfil) throw new Error(`insertion du profil ${identifiant} : ${erreurProfil.message}`)
  for (const role of roles) {
    const { error: erreurRole } = await admin
      .from('roles_profil')
      .insert({ profil_id: data.user.id, role })
    if (erreurRole) throw new Error(`rôle ${role} : ${erreurRole.message}`)
  }
}

async function creerMembre(nom: string, faiseur: string | null, etat = 'actif'): Promise<string> {
  const { data, error } = await admin
    .from('membres')
    .insert({ nom, prenom: 'Test', faiseur_de_disciple_id: faiseur, etat })
    .select('id')
    .single()
  // Toute préparation vérifie son erreur et LÈVE.
  if (error || !data) throw new Error(`création de ${nom} impossible : ${error?.message}`)
  return data.id as string
}

async function seConnecter(page: Page, identifiant: string) {
  await page.goto('/connexion')
  await page.getByLabel('Identifiant').fill(identifiant)
  await page.getByLabel('Mot de passe').fill(MDP)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page).toHaveURL(/\/tableau-de-bord/)
}

test.beforeAll(async () => {
  await admin.from('membres').delete().like('nom', `${PREFIXE_FAMILLE}%`)
  await supprimerCompte(IDENT_ADMIN)
  await supprimerCompte(IDENT_SIMPLE)
  await creerCompte(IDENT_ADMIN, ['administrateur'])
  await creerCompte(IDENT_SIMPLE, [])

  // ORDRE DE CRÉATION : la racine d'abord, ses descendants ensuite.
  idRacine = await creerMembre(NOM_RACINE, null)
  idDisciple = await creerMembre(NOM_DISCIPLE, idRacine)
  await creerMembre(NOM_PETIT, idDisciple)
  idFeuille = await creerMembre(NOM_FEUILLE, idRacine)
  // Une fiche archivée SANS faiseur de disciple : elle ne doit apparaître nulle part dans
  // l'arbre, pour personne.
  await creerMembre(NOM_ARCHIVE, null, 'archive')

  // La GRANDE FRATRIE : `TAILLE_PAGE_DISCIPLES` frères qui remplissent la page 1, plus la
  // cible, qui trie après eux et se retrouve donc SEULE SUR LA PAGE 2.
  idFratrie = await creerMembre(NOM_FRATRIE, idRacine)
  const freres = Array.from({ length: TAILLE_PAGE_DISCIPLES }, (_, indice) => ({
    // Indice sur DEUX chiffres : sans le zéro de tête, « 10 » trierait avant « 2 ». Le
    // rang de la cible ne changerait pas — elle trie de toute façon après tous les
    // chiffres —, mais l'ordre écrit ici ne serait plus l'ordre réel, et la prochaine
    // personne à lire ce test partirait sur une fausse idée.
    nom: `${PREFIXE}-frere-${String(indice).padStart(2, '0')}`,
    prenom: 'Test',
    faiseur_de_disciple_id: idFratrie,
  }))
  const { error: erreurFreres } = await admin.from('membres').insert(freres)
  // Toute préparation vérifie son erreur et LÈVE : une fratrie incomplète ramènerait la
  // cible en page 1 et rendrait ce test vert sans qu'il ait rien franchi.
  if (erreurFreres) throw new Error(`création de la fratrie impossible : ${erreurFreres.message}`)
  await creerMembre(NOM_CIBLE_PAGE_2, idFratrie)
})

test.afterAll(async () => {
  // ORDRE DE SUPPRESSION : la suppression en vrac par préfixe prend disciples ET faiseurs
  // ensemble — supprimer un faiseur d'abord détacherait ses disciples en silence
  // (`on delete set null`) et en ferait des racines.
  await admin.from('membres').delete().like('nom', `${PREFIXE_FAMILLE}%`)
  await supprimerCompte(IDENT_ADMIN)
  await supprimerCompte(IDENT_SIMPLE)

  const { count } = await admin
    .from('membres')
    .select('id', { count: 'exact', head: true })
    .like('nom', `${PREFIXE_FAMILLE}%`)
  expect(count).toBe(0)
})

test("l'arborescence est protégée par la connexion", async ({ page }) => {
  await page.goto('/arborescence')
  await expect(page).toHaveURL(/\/connexion/)
})

test("un compte ORDINAIRE parcourt l'arbre : il déplie, voit le total, et atteint une feuille", async ({
  page,
}) => {
  await seConnecter(page, IDENT_SIMPLE)
  await page.goto('/arborescence')

  // D95 : l'intitulé est « Membres sans faiseur de disciple ». « Racines de l'arbre » n'en
  // est que la glose — et cette assertion tomberait si l'écran reprenait l'intitulé que le
  // design refuse.
  await expect(page.getByRole('heading', { name: 'Membres sans faiseur de disciple' })).toBeVisible()

  // La fiche ARCHIVÉE n'y figure pas (D93) — pour un compte ordinaire ici, pour un
  // administrateur dans `tests/rls/arborescence.test.ts`, où la RLS ne la cacherait pas.
  await expect(page.getByText(NOM_ARCHIVE)).toHaveCount(0)

  // Déplier la racine.
  await page.getByRole('button', { name: new RegExp(NOM_RACINE) }).click()

  // D101 : le nœud annonce SON total, pas la longueur de la page. La racine porte TROIS
  // disciples — `-disciple`, `-feuille` et `-fratrie` —, et les trois tiennent sur une
  // page. Ce nombre suit la préparation : si un descendant direct est ajouté au `beforeAll`
  // sans reprendre cette ligne, c'est ICI que la suite tombera, et c'est voulu.
  await expect(page.getByText('3 disciples')).toBeVisible()
  await expect(page.getByRole('button', { name: new RegExp(NOM_DISCIPLE) })).toBeVisible()
  await expect(page.getByRole('button', { name: new RegExp(NOM_FEUILLE) })).toBeVisible()

  // Déplier une FEUILLE : D101 exige un message, pas un silence — et ce message doit être
  // celui-là, pas « aucun élément ».
  await page.getByRole('button', { name: new RegExp(NOM_FEUILLE) }).click()
  await expect(page.getByText('Aucun disciple actif rattaché.')).toBeVisible()

  // Déplier un nœud INTERMÉDIAIRE : sa descendance apparaît.
  await page.getByRole('button', { name: new RegExp(NOM_DISCIPLE) }).click()
  await expect(page.getByRole('button', { name: new RegExp(NOM_PETIT) })).toBeVisible()
})

test("la recherche mène au chemin déplié d'une personne, avec son fil d'Ariane", async ({ page }) => {
  await seConnecter(page, IDENT_SIMPLE)
  await page.goto('/arborescence')

  await page.getByLabel('Aller à une personne').fill(NOM_PETIT)
  await page.getByRole('button', { name: `Test ${NOM_PETIT}` }).click()

  // D104 : le fil d'Ariane porte le chemin depuis la racine.
  const filAriane = page.getByRole('navigation', { name: 'Chemin depuis la racine' })
  await expect(filAriane).toContainText(NOM_RACINE)
  await expect(filAriane).toContainText(NOM_DISCIPLE)
  await expect(filAriane).toContainText(NOM_PETIT)

  // D97 : le chemin est DÉPLIÉ — les trois maillons sont visibles dans l'arbre lui-même,
  // pas seulement dans le fil d'Ariane —, la personne est mise en évidence, ET sa
  // première page de disciples est chargée (ici : aucune, et l'écran le dit).
  await expect(page.getByRole('button', { name: new RegExp(NOM_DISCIPLE) })).toBeVisible()
  await expect(page.getByRole('button', { name: new RegExp(NOM_PETIT) })).toBeVisible()
  await expect(page.getByText('Aucun disciple actif rattaché.')).toBeVisible()

  // Et l'on peut revenir.
  await page.getByRole('button', { name: 'Revenir aux membres sans faiseur de disciple' }).click()
  await expect(page.getByRole('heading', { name: 'Membres sans faiseur de disciple' })).toBeVisible()
})

/**
 * LA RECHERCHE ATTEINT UNE PERSONNE SITUÉE AU-DELÀ DE LA PREMIÈRE PAGE DE SON FAISEUR.
 *
 * ═══ CE TEST EST LA RAISON D'ÊTRE DE LA GRANDE FRATRIE ═══
 * Le rendu d'un nœud ne montre que les disciples de la page CHARGÉE. Une recherche qui
 * chargerait toujours la page 1 s'arrêterait au premier maillon à plus de
 * `TAILLE_PAGE_DISCIPLES` disciples dont le suivant n'est pas dans cette première page :
 * la personne cherchée ne serait JAMAIS rendue, rien ne la surlignerait, et le fil
 * d'Ariane afficherait pourtant son chemin complet — deux vérités contradictoires sur le
 * même écran.
 *
 * Un arbre à deux disciples ne peut pas voir ce défaut : il n'a qu'une page. Le cas est
 * donc CONSTRUIT — `TAILLE_PAGE_DISCIPLES + 1` frères, la cible triant après tous les
 * autres, donc SEULE sur la page 2.
 */
test('la recherche atteint une personne située AU-DELÀ de la première page de son faiseur', async ({
  page,
}) => {
  await seConnecter(page, IDENT_SIMPLE)
  await page.goto('/arborescence')

  await page.getByLabel('Aller à une personne').fill(NOM_CIBLE_PAGE_2)
  await page.getByRole('button', { name: `Test ${NOM_CIBLE_PAGE_2}` }).click()

  // Le fil d'Ariane porte le chemin complet…
  const filAriane = page.getByRole('navigation', { name: 'Chemin depuis la racine' })
  await expect(filAriane).toContainText(NOM_RACINE)
  await expect(filAriane).toContainText(NOM_FRATRIE)
  await expect(filAriane).toContainText(NOM_CIBLE_PAGE_2)

  // …ET L'ARBRE AUSSI. VOICI L'ASSERTION QUI TOMBE si la recherche charge toujours la
  // page 1 : la cible est SEULE sur la page 2 de son faiseur.
  await expect(
    page.getByRole('button', { name: new RegExp(NOM_CIBLE_PAGE_2) }),
    "la cible est absente de l'arbre : la branche s'est arrêtée à la première page de son faiseur",
  ).toBeVisible()

  // Le nœud de la fratrie est bien sur sa DEUXIÈME page. `TAILLE_PAGE_DISCIPLES + 1`
  // disciples font toujours exactement deux pages, quelle que soit la taille de page.
  await expect(page.getByText('page 2 sur 2')).toBeVisible()

  // Et AUCUN avertissement de dépliage partiel : la branche est complète. Sans cette
  // assertion, un écran qui renoncerait à déplier tout en affichant honnêtement son
  // message resterait indistinguable d'un écran qui a réussi.
  await expect(page.getByText("l'arbre n'a pas pu être déplié jusqu'à elle")).toHaveCount(0)
})

test("le lien « Rattacher » n'est offert qu'à l'administrateur — un lien, pas un pouvoir", async ({
  page,
  browser,
  baseURL,
}) => {
  await seConnecter(page, IDENT_ADMIN)
  await page.goto('/arborescence')
  await expect(page.getByRole('link', { name: 'Rattacher' }).first()).toBeVisible()

  const contexte = await browser.newContext({ baseURL })
  try {
    const pageSimple = await contexte.newPage()
    await seConnecter(pageSimple, IDENT_SIMPLE)
    await pageSimple.goto('/arborescence')
    // Le lien est absent…
    await expect(pageSimple.getByRole('link', { name: 'Rattacher' })).toHaveCount(0)
    // …ET l'écran qu'il désigne reste fermé. Le masquage n'est PAS la protection : sans
    // cette seconde assertion, ce test resterait vert si `exigerAdministrateur`
    // disparaissait de `/membres/[id]/arbre`.
    await pageSimple.goto(`/membres/${idRacine}/arbre`)
    await expect(pageSimple).toHaveURL(/\/tableau-de-bord/)
  } finally {
    await contexte.close()
  }
})

/**
 * PREUVE N°15 — LE DÉPLIAGE EST GARDÉ (D103), PAR APPEL FORGÉ, AVEC CANARI PAR LE MÊME
 * CANAL.
 *
 * `chargerDisciples` n'est liée à AUCUN `<form action>` : le motif `$ACTION_*` des autres
 * suites ne s'applique pas. On CAPTURE la requête réelle émise par le navigateur, puis on
 * la REJOUE — une fois SANS session, une fois AVEC. Le même canal, le même octet.
 */
test('le dépliage refuse un appel forgé SANS session, et le canari réussit par le même canal', async ({
  page,
  baseURL,
}) => {
  await seConnecter(page, IDENT_SIMPLE)
  await page.goto('/arborescence')

  // Capturer la requête de la Server Action.
  const attente = page.waitForRequest(
    (requete) =>
      requete.method() === 'POST' && requete.headers()['next-action'] !== undefined,
  )
  await page.getByRole('button', { name: new RegExp(NOM_RACINE) }).click()
  const requete = await attente

  // COPIE des en-têtes, débarrassée des deux que le client DOIT recalculer lui-même.
  // `content-length` capturé vaudrait celui de la requête d'origine — juste ici, mais
  // faux dès qu'un octet du corps changerait —, et `host` capturé viendrait de la page et
  // non de l'URL rejouée. Playwright les recalcule s'ils sont absents ; les transmettre
  // tels quels, c'est parier sur une coïncidence.
  const entetes = { ...requete.headers() }
  delete entetes['content-length']
  delete entetes.host
  const corps = requete.postData()
  // FILET, exactement comme `verifierCaptureAction` dans les autres suites : si le
  // protocole des Server Actions changeait, cette capture cesserait d'être ce qu'on croit,
  // et le test ne prouverait plus rien — mieux vaut un échec bruyant.
  expect(
    entetes['next-action'],
    "aucun en-tête « next-action » capturé : le protocole des Server Actions a peut-être changé, ce test ne prouve plus ce qu'il prétend",
  ).toBeTruthy()
  expect(corps, 'corps de requête vide : la capture est inexploitable').toBeTruthy()

  // Le dépliage a bien abouti DANS LA PAGE : le compte ordinaire y a droit (D2).
  await expect(page.getByRole('button', { name: new RegExp(NOM_DISCIPLE) })).toBeVisible()

  // ═══ LA FORGE : la MÊME requête, depuis un contexte SANS AUCUNE SESSION ═══
  const sansSession = await requestPlaywright.newContext({ baseURL })
  try {
    // `maxRedirects: 0` : on veut le PREMIER saut, pas la page où il mène. Sans ce
    // réglage, Playwright suit la redirection et la ré-émet avec les MÊMES en-têtes
    // forgés (dont `next-action`) vers une route qui n'en attend pas — mesuré : la page de
    // connexion y répond alors `200 {}`, un artefact du protocole qui ne prouve rien.
    const reponse = await sansSession.post(requete.url(), {
      headers: { ...entetes, cookie: '' },
      data: corps!,
      maxRedirects: 0,
    })
    const texte = await reponse.text()
    // ASSERTION PRINCIPALE, par le COMPORTEMENT et non par un code interne : la réponse ne
    // porte AUCUN nom de disciple. Un visiteur ne doit rien apprendre de l'arbre.
    expect(texte).not.toContain(NOM_DISCIPLE)
    expect(texte).not.toContain(NOM_FEUILLE)
    /*
      Assertion secondaire, informative, sur le PREMIER saut : une redirection 3xx vers
      `/connexion`.

      MESURÉ, PAS SUPPOSÉ : la première rédaction de ce test attendait `/deconnexion`,
      sur la foi du commentaire d'`exigerProfilActif` («&nbsp;Vers `/deconnexion` et non
      `/connexion`&nbsp;») — et échouait, `texte` valant `{}`, `content-type:
      application/json`. Rejouée avec `maxRedirects: 0`, la réponse RÉELLE est un `307`
      dont l'en-tête `location` vaut `/connexion`. La raison : `src/middleware.ts:66-79`
      intercepte AVANT `exigerProfilActif` — une requête SANS AUCUN cookie n'a pas de
      `user` Supabase, et le middleware redirige vers `/connexion` sans jamais atteindre
      la Server Action. `/deconnexion` est le repli d'`exigerProfilActif` pour un cas
      différent, que cette forge n'exerce pas : un cookie de session PRÉSENT mais dont le
      profil est introuvable ou inactif (compte désactivé, jeton orphelin) — le middleware
      laisse alors passer (un `user` Supabase existe), et c'est la Server Action qui
      referme la porte plus loin.
    */
    expect(reponse.status(), 'pas une redirection : le premier saut a changé de forme').toBeGreaterThanOrEqual(300)
    expect(reponse.status()).toBeLessThan(400)
    expect(reponse.headers()['location']).toBe('/connexion')
  } finally {
    await sansSession.dispose()
  }

  // ═══ CANARI PAR LE MÊME CANAL ═══
  // La MÊME requête, rejouée depuis la session ORDINAIRE, qui a le droit. Si elle échoue,
  // c'est le MÉCANISME DE FORGE qui est cassé — et le refus ci-dessus ne prouve plus rien.
  const reponseCanari = await page.request.post(requete.url(), {
    headers: entetes,
    data: corps!,
  })
  const texteCanari = await reponseCanari.text()
  expect(
    texteCanari,
    "la forge n'atteint plus l'action : le refus ci-dessus ne prouve plus rien",
  ).toContain(NOM_DISCIPLE)
})

/**
 * LES ACTIONS DE LA RECHERCHE SONT GARDÉES ELLES AUSSI (D103).
 *
 * ═══ POURQUOI CE SECOND TEST EXISTE ═══
 * Le test précédent ne forge QUE `chargerDisciples`. Le module `'use server'` de
 * l'arborescence en exporte trois — `chargerDisciples`, `chargerChemin` et
 * `pageContenant` —, et **toute fonction exportée d'un fichier `'use server'` est
 * appelable depuis le navigateur**. Un garde oublié sur l'une des deux autres ouvrirait la
 * forme de l'arbre à un visiteur sans session, et rien ne le verrait.
 *
 * ═══ ON NE DEVINE PAS LAQUELLE EST LAQUELLE ═══
 * Rien, dans une requête de Server Action, ne dit quelle fonction elle vise : l'en-tête
 * `next-action` porte un identifiant opaque. On capture donc TOUTES les requêtes émises
 * par la recherche, et on les rejoue TOUTES sans session. C'est plus robuste que de
 * prétendre reconnaître l'une d'elles — et cela reste vrai si une quatrième action
 * apparaît un jour.
 */
test('les actions de la recherche refusent un appel forgé SANS session, et le canari réussit', async ({
  page,
  baseURL,
}) => {
  await seConnecter(page, IDENT_SIMPLE)
  await page.goto('/arborescence')

  const capturees: Array<{ url: string; entetes: Record<string, string>; corps: string }> = []
  page.on('request', (requete) => {
    if (requete.method() !== 'POST' || requete.headers()['next-action'] === undefined) return
    const corps = requete.postData()
    if (!corps) return
    const entetes = { ...requete.headers() }
    delete entetes['content-length']
    delete entetes.host
    capturees.push({ url: requete.url(), entetes, corps })
  })

  await page.getByLabel('Aller à une personne').fill(NOM_PETIT)
  await page.getByRole('button', { name: `Test ${NOM_PETIT}` }).click()
  // On attend que la recherche ait ABOUTI dans la page : sans cela, la capture pourrait
  // être vide pour la seule raison qu'on a regardé trop tôt.
  await expect(page.getByRole('navigation', { name: 'Chemin depuis la racine' })).toContainText(
    NOM_PETIT,
  )

  // FILET, exactement comme dans le test précédent : une capture vide rendrait toute la
  // suite de ce test verte en n'éprouvant rien.
  expect(
    capturees.length,
    "aucune requête de Server Action capturée pendant la recherche : le protocole a peut-être changé, ce test ne prouve plus ce qu'il prétend",
  ).toBeGreaterThanOrEqual(2)

  // ═══ LA FORGE : chaque requête capturée, rejouée SANS AUCUNE SESSION ═══
  const sansSession = await requestPlaywright.newContext({ baseURL })
  try {
    for (const capturee of capturees) {
      const reponse = await sansSession.post(capturee.url, {
        headers: { ...capturee.entetes, cookie: '' },
        data: capturee.corps,
      })
      const texte = await reponse.text()
      // ASSERTION PRINCIPALE, par le COMPORTEMENT : aucune réponse ne porte le moindre nom
      // de l'arbre. Un visiteur ne doit rien apprendre — ni un disciple, ni un maillon du
      // chemin de qui que ce soit.
      expect(texte, "une action de la recherche a répondu un nom à un appel SANS session").not.toContain(
        NOM_PETIT,
      )
      expect(texte).not.toContain(NOM_DISCIPLE)
      expect(texte).not.toContain(NOM_RACINE)
    }
  } finally {
    await sansSession.dispose()
  }

  // ═══ CANARI PAR LE MÊME CANAL ═══
  // Les MÊMES requêtes, rejouées depuis la session ORDINAIRE, qui a le droit. Si AUCUNE ne
  // rend un nom, c'est le MÉCANISME DE FORGE qui est cassé — et les refus ci-dessus ne
  // prouvent plus rien. On n'exige pas que CHACUNE rende un nom : `pageContenant` ne rend
  // qu'un nombre, et c'est légitime.
  const textes: string[] = []
  for (const capturee of capturees) {
    const reponse = await page.request.post(capturee.url, {
      headers: capturee.entetes,
      data: capturee.corps,
    })
    textes.push(await reponse.text())
  }
  expect(
    textes.some((texte) => texte.includes(NOM_PETIT) || texte.includes(NOM_RACINE)),
    "la forge n'atteint plus les actions : les refus ci-dessus ne prouvent plus rien",
  ).toBe(true)
})
