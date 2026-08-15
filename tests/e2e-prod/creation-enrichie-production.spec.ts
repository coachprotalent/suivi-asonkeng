import { createClient } from '@supabase/supabase-js'
import { expect, test, type Page } from '@playwright/test'
import { identifiantVersEmail } from '../../src/lib/domaine/identifiant'
import { MESSAGE_FAISEUR_ARCHIVE } from '../../src/app/membres/[id]/arbre/messages'
import { MESSAGE_CODE_INVALIDE } from '../../src/app/inscription/messages'

/**
 * PREUVES REJOUABLES CONTRE UN BUILD DE PRODUCTION (`next build` + `next start`, voir
 * `playwright.prod.config.ts`).
 *
 * PREUVE N°6 — LA SAISIE SURVIT À UN REFUS. C'est la PREMIÈRE preuve de cette classe dans
 * le projet : les quatorze composants recensés au README n'en avaient aucune. Elle porte
 * sur les DEUX formulaires que la phase 5 corrige — le pire cas administratif
 * (`membres/formulaire-membre.tsx`, 9 champs) et le pire cas TOUT COURT
 * (`inscription/formulaire-inscription.tsx`, 8 champs, écran PUBLIC, en production).
 *
 * PREUVE N°7 — LE REFUS EST RETOURNÉ, PAS LEVÉ : le texte affiché est celui de
 * l'application, jamais `Minified React error #441` ni le texte statique de
 * `src/app/error.tsx`.
 */

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const MDP = `Test-${crypto.randomUUID()}`
const IDENT_ADMIN = 'test.e2e.prod.creation.admin'
// IDENTIFIANT PUBLIC DÉTERMINISTE, jamais tiré par exécution : le chemin d'inscription
// qu'éprouve la troisième preuve pourrait un jour créer l'utilisateur `auth` AVANT
// d'échouer. Un identifiant aléatoire rendrait cet orphelin introuvable, et il
// s'accumulerait EN PRODUCTION sans qu'aucune assertion ne le voie. Format conforme au
// contrôle d'identifiant du projet : lettres, chiffres, points ou tirets, commençant par
// une lettre.
const IDENT_PUBLIC = 'zz.prod.creation.publique'
const PREFIXE_FAMILLE = 'ZZCreationProdE2E-'
const PREFIXE = `${PREFIXE_FAMILLE}${crypto.randomUUID().slice(0, 8)}`

/*
  DEUX TEXTES À NE JAMAIS VOIR SUR CES ÉCRANS, ET ILS NE DISENT PAS LA MÊME CHOSE.

  `FRAGMENT_DIGEST_REACT` — le digest anglais que React substitue au message d'une
  exception en build de production, LORSQUE le composant l'attrape pour l'afficher.
  `comptes/ligne-compte.tsx` est le seul composant du dépôt dans ce cas. **Sur les écrans
  visés ici, ce texte est IMPOSSIBLE**, et le plan de cette tâche le démontre plus haut :
  le composant lit `etat.erreur` d'un `useActionState` et n'attrape aucune exception ; un
  `throw` y remonterait à `src/app/error.tsx`. La sonde est conservée parce qu'elle coûte
  une ligne et qu'elle deviendrait pertinente si un jour un `try/catch` apparaissait — mais
  **elle ne vise pas le symptôme réel de cet écran**.

  `FRAGMENT_LIMITE_ERREUR` — LE symptôme réel. C'est le titre statique de
  `src/app/error.tsx` (vérifié : `<h1>Une erreur est survenue</h1>`). S'il apparaît, c'est
  qu'une exception a remonté à la limite d'erreur au lieu d'un refus RETOURNÉ : le motif
  nommé est perdu, en développement comme en production. C'est exactement ce que la
  preuve n°7 verrouille.

  Recopiés et non importés : `error.tsx` est un composant client, et l'importer ici
  tirerait React dans la suite. Si l'un des deux textes changeait, ces sondes deviendraient
  des faux négatifs silencieux — d'où l'assertion POSITIVE qui les accompagne toujours
  (« le message ATTENDU est là »), qui, elle, tomberait.
*/
const FRAGMENT_DIGEST_REACT = 'Minified React error'
const FRAGMENT_LIMITE_ERREUR = 'Une erreur est survenue'

// Sélecteur d'alerte PORTÉ : Next.js pose son propre `<div role="alert"
// id="__next-route-announcer__">` sur chaque page. Un `getByRole('alert')` nu en trouve
// donc toujours DEUX et viole le mode strict de Playwright. Motif déjà constantisé dans
// `tests/e2e/statuts.spec.ts` et repris trois fois dans `tests/e2e-prod/`.
const ALERTE = '[role="alert"]:not(#__next-route-announcer__)'

let idFaiseurArchive: string

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
  // L'identifiant PUBLIC aussi : un résidu d'exécution interrompue ferait échouer
  // l'inscription pour « identifiant déjà pris » au lieu de « code invalide », et la
  // preuve porterait alors sur un tout autre refus.
  await supprimerCompte(IDENT_PUBLIC)

  const { data: compte, error } = await admin.auth.admin.createUser({
    email: identifiantVersEmail(IDENT_ADMIN),
    password: MDP,
    email_confirm: true,
  })
  if (error || !compte.user) throw new Error(`création du compte impossible : ${error?.message}`)
  const { error: erreurProfil } = await admin
    .from('profils')
    .insert({ id: compte.user.id, identifiant: IDENT_ADMIN, nom_affichage: 'Test prod création' })
  if (erreurProfil) throw new Error(`insertion du profil impossible : ${erreurProfil.message}`)
  const { error: erreurRole } = await admin
    .from('roles_profil')
    .insert({ profil_id: compte.user.id, role: 'administrateur' })
  if (erreurRole) throw new Error(`attribution du rôle impossible : ${erreurRole.message}`)

  // ═══ LE FAISEUR DE DISCIPLE EST CRÉÉ **ACTIF**, ET ARCHIVÉ PLUS TARD ═══
  // Il doit être ACTIF ici pour être trouvable par le sélecteur de l'écran, qui ne propose
  // que des membres actifs. La preuve l'archivera juste avant de soumettre. C'est le refus
  // le plus sûr à provoquer depuis l'écran, parce qu'il ne dépend d'AUCUNE particularité
  // du catalogue de statuts.
  const { data: faiseur, error: erreurFaiseur } = await admin
    .from('membres')
    .insert({ nom: `${PREFIXE}-faiseur`, prenom: 'Test' })
    .select('id')
    .single()
  if (erreurFaiseur || !faiseur) {
    throw new Error(`création du faiseur impossible : ${erreurFaiseur?.message}`)
  }
  idFaiseurArchive = faiseur.id as string
})

test.afterAll(async () => {
  await admin.from('membres').delete().like('nom', `${PREFIXE_FAMILLE}%`)
  await supprimerCompte(IDENT_ADMIN)
  await supprimerCompte(IDENT_PUBLIC)

  const { count } = await admin
    .from('membres')
    .select('id', { count: 'exact', head: true })
    .like('nom', `${PREFIXE_FAMILLE}%`)
  expect(count).toBe(0)

  // LES DEUX PROFILS AUSSI, VÉRIFIÉS PAR COMPTAGE. L'absence d'erreur au nettoyage ne
  // prouve rien : une suppression qui ne touche personne ne rend aucune erreur. Et
  // `IDENT_PUBLIC` est le cas qui compte vraiment — si le chemin d'inscription créait un
  // jour l'utilisateur `auth` avant d'échouer, l'orphelin s'accumulerait EN PRODUCTION.
  const { data: residus, error: erreurResidus } = await admin
    .from('profils')
    .select('id')
    .in('identifiant', [IDENT_ADMIN, IDENT_PUBLIC])
  if (erreurResidus) throw new Error(`lecture des profils résiduels impossible : ${erreurResidus.message}`)
  expect(residus).toHaveLength(0)
})

test('en production, un refus de création affiche son motif NOMMÉ et la saisie survit ENTIÈREMENT', async ({
  page,
}) => {
  await seConnecter(page, IDENT_ADMIN)
  await page.goto('/membres/nouveau')

  // On remplit TOUS les champs libres du formulaire — c'est le point de la preuve.
  const valeurs = {
    prenom: 'Saisie',
    nom: `${PREFIXE}-survivante`,
    telephone: '0102030405',
    emailContact: 'saisie@example.test',
    ville: 'Saint-Étienne',
    pays: 'France',
    reportInitialAel: '7',
  }
  await page.getByLabel('Prénom (obligatoire)', { exact: true }).fill(valeurs.prenom)
  await page.getByLabel('Nom (obligatoire)', { exact: true }).fill(valeurs.nom)
  await page.getByLabel('Téléphone').fill(valeurs.telephone)
  await page.getByLabel('Adresse de contact').fill(valeurs.emailContact)
  await page.getByLabel('Ville').fill(valeurs.ville)
  await page.getByLabel('Pays').fill(valeurs.pays)
  await page.getByRole('spinbutton', { name: 'AEL déjà suivis', exact: true }).fill(valeurs.reportInitialAel)
  await page.getByLabel('Situation').selectOption('etudiant')
  await page.getByLabel("Domaine d'étude").fill('Théologie')

  // Un statut, avec sa note : il doit survivre lui aussi.
  await page.getByRole('button', { name: 'Ajouter un statut' }).click()
  const selectStatut = page.getByLabel('Statut', { exact: true })
  const valeurStatut = await selectStatut.locator('option').nth(1).getAttribute('value')
  expect(valeurStatut, 'catalogue vide : cette preuve ne porterait sur rien').toBeTruthy()
  await selectStatut.selectOption(valeurStatut!)
  await page.getByLabel('Note').fill('note qui doit survivre')

  /*
    ═══ LE REFUS : UN FAISEUR DE DISCIPLE ARCHIVÉ — CHOISI PAR L'INTERFACE, PUIS ARCHIVÉ ═══

    NE PAS FORGER LE CHAMP CACHÉ. `src/app/membres/selecteur-membre.tsx` rend
    `<input type="hidden" name={nom} value={valeur?.id ?? ''} />` : ce champ est CONTRÔLÉ,
    et toute passe de rendu restaure `''`. Écrire `champ.value = …` par `evaluate` fait
    dépendre le test d'une course entre l'écriture DOM et le prochain rendu React : si la
    course tourne mal, la valeur repart vide, **la création RÉUSSIT**, l'assertion tombe, et
    l'échec est attribué au mauvais mécanisme — on croirait le message perdu alors que le
    refus n'a jamais eu lieu.

    On choisit donc le faiseur PAR L'ÉCRAN, comme un utilisateur (le sélecteur ne propose
    que des membres actifs, d'où un faiseur créé actif), et on l'archive EN BASE juste avant
    de soumettre. Le refus vient alors de la même barrière — `public.definir_arbre` et son
    déclencheur —, sans dépendre du cycle de rendu.
  */
  const zoneFaiseur = page.locator('div').filter({ hasText: /^Faiseur de disciple/ }).last()
  await zoneFaiseur.getByPlaceholder('Chercher par nom ou prénom').fill(`${PREFIXE}-faiseur`)
  await page.getByRole('button', { name: `Test ${PREFIXE}-faiseur` }).click()
  // Le champ caché porte bien l'identifiant : sans cette assertion, l'archivage ci-dessous
  // porterait sur une fiche que le formulaire n'a jamais retenue, et le refus attendu
  // n'aurait aucune raison de se produire.
  await expect(page.locator('input[name="faiseurDeDiscipleId"]')).toHaveValue(idFaiseurArchive)

  const { error: erreurArchivage } = await admin
    .from('membres')
    .update({ etat: 'archive' })
    .eq('id', idFaiseurArchive)
    .select('id')
  expect(erreurArchivage, "l'archivage de préparation a échoué : le refus attendu ne peut pas se produire").toBeNull()

  await page.getByRole('button', { name: 'Créer la fiche' }).click()

  // ═══ PREUVE N°7 : LE MOTIF NOMMÉ ATTEINT L'ÉCRAN ═══
  // Sélecteur PORTÉ : Next.js pose son propre `<div role="alert">` sur chaque page, et un
  // `getByRole('alert')` nu en trouverait deux — violation du mode strict.
  const alerte = page.locator(ALERTE)
  await expect(alerte).toHaveText(MESSAGE_FAISEUR_ARCHIVE)
  // Ni le digest React (impossible sur cet écran, sonde conservée par précaution)…
  await expect(page.locator('body')).not.toContainText(FRAGMENT_DIGEST_REACT)
  // …NI le titre de la limite d'erreur, qui est LE symptôme réel : s'il apparaissait, une
  // exception aurait remonté à `src/app/error.tsx` au lieu d'un refus RETOURNÉ, et le
  // motif nommé serait perdu.
  await expect(page.locator('body')).not.toContainText(FRAGMENT_LIMITE_ERREUR)

  // ═══ PREUVE N°6 : CHAQUE CHAMP PORTE ENCORE SA VALEUR ═══
  await expect(page.getByLabel('Prénom (obligatoire)', { exact: true })).toHaveValue(valeurs.prenom)
  await expect(page.getByLabel('Nom (obligatoire)', { exact: true })).toHaveValue(valeurs.nom)
  await expect(page.getByLabel('Téléphone')).toHaveValue(valeurs.telephone)
  await expect(page.getByLabel('Adresse de contact')).toHaveValue(valeurs.emailContact)
  await expect(page.getByLabel('Ville')).toHaveValue(valeurs.ville)
  await expect(page.getByLabel('Pays')).toHaveValue(valeurs.pays)
  await expect(page.getByRole('spinbutton', { name: 'AEL déjà suivis', exact: true })).toHaveValue(
    valeurs.reportInitialAel,
  )
  await expect(page.getByLabel('Situation')).toHaveValue('etudiant')
  await expect(page.getByLabel("Domaine d'étude")).toHaveValue('Théologie')
  // La ligne de statut aussi : c'est de l'état de composant, pas un champ du DOM initial.
  await expect(page.getByLabel('Statut', { exact: true })).toHaveValue(valeurStatut!)
  await expect(page.getByLabel('Note')).toHaveValue('note qui doit survivre')

  // ET RIEN N'A ÉTÉ ÉCRIT : l'atomicité vue depuis l'écran.
  const { count } = await admin
    .from('membres')
    .select('id', { count: 'exact', head: true })
    .eq('nom', valeurs.nom)
  expect(count).toBe(0)
})

// CONTRÔLE POSITIF, ET IL N'EST PAS INERTE : sans lui, tout ce qui précède serait
// satisfait par un formulaire qui REFUSE TOUT. Ce test-ci exige une redirection vers une
// fiche RÉELLE, et vérifie la ligne EN BASE — une page en erreur ne le satisferait pas.
test('en production, une création valide aboutit et redirige vers la fiche', async ({ page }) => {
  await seConnecter(page, IDENT_ADMIN)
  await page.goto('/membres/nouveau')
  await page.getByLabel('Prénom (obligatoire)', { exact: true }).fill('Valide')
  await page.getByLabel('Nom (obligatoire)', { exact: true }).fill(`${PREFIXE}-valide`)
  await page.getByRole('button', { name: 'Créer la fiche' }).click()

  await expect(page).toHaveURL(/\/membres\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { name: `Valide ${PREFIXE}-valide` })).toBeVisible()

  const { count } = await admin
    .from('membres')
    .select('id', { count: 'exact', head: true })
    .eq('nom', `${PREFIXE}-valide`)
  expect(count).toBe(1)
})

/**
 * LE CAS PUBLIC — le pire des quatorze, et le seul écran de l'application ouvert à des
 * gens qui ne la connaissent pas.
 *
 * Le §7 impose ici un message INDIFFÉRENCIÉ (D30) : la personne ne peut pas comprendre
 * son erreur. La saisie conservée est donc LA SEULE CHOSE qui lui reste pour réessayer.
 * Aucune session n'est nécessaire : cet écran s'affiche sans.
 */
test("en production, un code d'inscription invalide laisse les HUIT champs remplis", async ({
  page,
}) => {
  await page.goto('/inscription')

  const valeurs = {
    code: 'code-manifestement-invalide',
    // DÉTERMINISTE, pas tiré par exécution : voir la déclaration d'`IDENT_PUBLIC`. C'est
    // la seule prise par laquelle le nettoyage peut retrouver un compte que ce chemin
    // aurait créé avant d'échouer.
    identifiant: IDENT_PUBLIC,
    motDePasse: 'MotDePasseAssezLong123',
    prenom: 'Publique',
    nom: `${PREFIXE}-publique`,
    telephone: '0605040302',
    ville: 'Douala',
  }
  await page.getByLabel("Code d'inscription").fill(valeurs.code)
  await page.getByLabel('Identifiant choisi').fill(valeurs.identifiant)
  await page.getByLabel('Mot de passe choisi').fill(valeurs.motDePasse)
  await page.getByLabel('Prénom').fill(valeurs.prenom)
  // `{ exact: true }` OBLIGATOIRE : `getByLabel` non exact cherche une SOUS-CHAÎNE et est
  // insensible à la casse — « nom » est contenu dans « Prénom », et ce formulaire rend les
  // deux. Sans `exact`, le locateur en trouve DEUX et viole le mode strict. Le dépôt le
  // sait déjà : `tests/e2e/inscription.spec.ts` l'écrit ainsi depuis la 2b.
  await page.getByLabel('Nom', { exact: true }).fill(valeurs.nom)
  await page.getByLabel('Téléphone').fill(valeurs.telephone)
  await page.getByLabel('Ville').fill(valeurs.ville)

  // L'antenne : la première réellement proposée. Le `<select>` est le HUITIÈME champ —
  // CELUI-LÀ MÊME du défaut de survie découvert en phase 5 (les `<select>` contrôlés ne
  // survivent pas à la remise à zéro native, contrairement aux `<input>`) — et son état
  // doit survivre comme les autres, INCONDITIONNELLEMENT : un catalogue d'antennes vide
  // rendrait cette assertion vacuellement vraie pour toujours, exactement comme le
  // catalogue de statuts ci-dessus (`valeurStatut`), d'où le même garde explicite.
  const antenne = page.getByLabel('Antenne')
  const valeurAntenne = await antenne.locator('option').nth(1).getAttribute('value')
  expect(valeurAntenne, "catalogue des antennes vide : cette preuve ne porterait pas sur le huitième champ").toBeTruthy()
  await antenne.selectOption(valeurAntenne!)

  await page.getByRole('button', { name: "S'inscrire" }).click()

  // Le refus indifférencié s'affiche, AVEC SON TEXTE EXACT : `MESSAGE_CODE_INVALIDE`, seul
  // message rendu par `messageErreurConsommation` pour les QUATRE causes de refus d'un
  // token (D30 : inconnu, expiré, révoqué, déjà utilisé partagent le même statut
  // `invalide` à la source). Une simple `toBeVisible()` serait satisfaite par N'IMPORTE
  // QUEL texte dans l'alerte — y compris un message qui aurait cessé d'être indifférencié
  // sans que ce test s'en aperçoive. (Sélecteur PORTÉ : Next.js pose son propre
  // `<div role="alert" id="__next-route-announcer__">` sur chaque page, et un
  // `getByRole('alert')` nu en trouverait deux — violation du mode strict.)
  await expect(page.locator(ALERTE)).toHaveText(MESSAGE_CODE_INVALIDE)
  await expect(page.locator('body')).not.toContainText(FRAGMENT_DIGEST_REACT)
  // Et surtout PAS la limite d'erreur : `sInscrire` RETOURNE son refus, elle ne le lève
  // pas. C'est ce texte-là, et non le digest, qui apparaîtrait si elle levait.
  await expect(page.locator('body')).not.toContainText(FRAGMENT_LIMITE_ERREUR)

  // …ET LES HUIT CHAMPS SONT ENCORE LÀ.
  await expect(page.getByLabel("Code d'inscription")).toHaveValue(valeurs.code)
  await expect(page.getByLabel('Identifiant choisi')).toHaveValue(valeurs.identifiant)
  await expect(page.getByLabel('Mot de passe choisi')).toHaveValue(valeurs.motDePasse)
  await expect(page.getByLabel('Prénom')).toHaveValue(valeurs.prenom)
  await expect(page.getByLabel('Nom', { exact: true })).toHaveValue(valeurs.nom)
  await expect(page.getByLabel('Téléphone')).toHaveValue(valeurs.telephone)
  await expect(page.getByLabel('Ville')).toHaveValue(valeurs.ville)
  // LE HUITIÈME CHAMP, INCONDITIONNEL : c'est lui que le remède `onReset` protège.
  await expect(antenne).toHaveValue(valeurAntenne!)

  // Et AUCUN compte n'a été créé : le code était invalide. `error` VÉRIFIÉ, et assertion
  // SANS `?? []` : sur échec de lecture, `data` vaut `null`, et `data ?? []` convertirait
  // la panne en « aucun compte créé » — l'assertion de sécurité deviendrait un contrôle
  // qui ne peut plus échouer.
  const { data, error } = await admin.from('profils').select('id').eq('identifiant', valeurs.identifiant)
  if (error) throw new Error(`lecture des profils impossible : ${error.message}`)
  expect(data).toHaveLength(0)
})
