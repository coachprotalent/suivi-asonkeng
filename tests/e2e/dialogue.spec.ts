import { createClient } from '@supabase/supabase-js'
import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  accepterConfirmation,
  fermerConfirmationParEchap,
  refuserConfirmation,
} from '../confirmation'

/*
  ═══ D125 — LE `Dialogue` CRÉE UN COMPORTEMENT, IL N'EN EXTRAIT AUCUN ═══

  Les neuf autres composants de la phase 6 extraient un motif déjà écrit dix à vingt-cinq
  fois : leur risque est la DIVERGENCE, et les 128 preuves existantes la détectent. Celui-ci
  n'a AUCUN antécédent dans le dépôt — zéro `<dialog>`, zéro `role="dialog"` avant la
  phase 6 — et son risque est le DÉFAUT. D'où ce fichier.

  LES TROIS PREMIERS TESTS NE MUTENT RIEN : ils ferment par `Échap` ou par « Annuler ». Le
  quatrième confirme, et son effet est nettoyé par famille.

  Écran choisi : `/evenements/types`, dont la bascule actif/inactif porte une confirmation
  (`BoutonBasculeType`), est réservée à l'administrateur, et n'a aucune conséquence en
  cascade — une réactivation la défait entièrement.

  ═══ CE FICHIER N'AURAIT JAMAIS DÛ MANQUER (revue des Tasks 12-15) ═══

  Le plan de la Task 15 le listait en création, avec `tests/confirmation.ts`. Aucun des
  deux n'existait avant ce commit : zéro preuve du piège de focus, de la fermeture par
  `Échap`, de la restitution du focus — les trois comportements qui sont l'unique raison
  d'être du `<dialog>` natif, et qui justifiaient de remplacer quinze `window.confirm()`.
*/
test.describe.configure({ mode: 'serial' })

const IDENT_ADMIN = 'test.e2e.dialogue.admin'
const MDP_ADMIN = `Test-${crypto.randomUUID()}`
// NETTOYAGE SUR LA FAMILLE, PAS SUR LE SUFFIXE ALÉATOIRE (M9) : une exécution interrompue
// laisserait sinon en base de PRODUCTION des lignes que plus rien ne retrouverait, leur
// suffixe étant mort avec le processus.
const FAMILLE = 'ZZDialogue-'
const LIBELLE_TYPE = `${FAMILLE}${crypto.randomUUID().slice(0, 8)}`

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

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
  const { error } = await admin.from('types_evenement').delete().like('libelle', `${FAMILLE}%`)
  if (error) throw new Error(`nettoyage des types impossible : ${error.message}`)
  await supprimerCompte(IDENT_ADMIN)
}

/** NETTOYAGE VÉRIFIÉ PAR COMPTAGE, sur la MÊME famille que la suppression (M9). */
async function verifierAucunResidu() {
  const { count, error } = await admin
    .from('types_evenement')
    .select('id', { count: 'exact', head: true })
    .like('libelle', `${FAMILLE}%`)
  if (error) throw new Error(`comptage des résidus impossible : ${error.message}`)
  expect(count, 'résidu dans types_evenement').toBe(0)
}

test.beforeAll(async () => {
  await nettoyer()
  // Création du compte administrateur, reprise MOT POUR MOT de
  // `tests/e2e/evenements-types.spec.ts` — pas réinventée : l'identifiant respecte le
  // format `^[a-z][a-z0-9.-]{2,31}$` (`profils_identifiant_format`), dont la violation
  // ferait échouer la PRÉPARATION, échec qui se lirait à tort comme une régression d'ici.
  const { data, error } = await admin.auth.admin.createUser({
    email: `${IDENT_ADMIN}@asonkeng.local`,
    password: MDP_ADMIN,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(error?.message)

  const { error: erreurProfil } = await admin
    .from('profils')
    .insert({ id: data.user.id, identifiant: IDENT_ADMIN, nom_affichage: `Test ${IDENT_ADMIN}` })
  if (erreurProfil) {
    await admin.auth.admin.deleteUser(data.user.id)
    throw new Error(`insertion du profil impossible : ${erreurProfil.message}`)
  }

  const { error: erreurRole } = await admin
    .from('roles_profil')
    .insert({ profil_id: data.user.id, role: 'administrateur' })
  if (erreurRole) {
    await admin.auth.admin.deleteUser(data.user.id)
    throw new Error(`attribution du rôle impossible : ${erreurRole.message}`)
  }

  // UN `insert` DE PRÉPARATION DONT L'ERREUR EST JETÉE REND LE TEST VERT EN ÉPROUVANT UN
  // TOUT AUTRE CHEMIN : trouvé trois fois dans ce projet. Toute préparation vérifie son
  // erreur et LÈVE.
  const { error: erreurType } = await admin
    .from('types_evenement')
    .insert({ libelle: LIBELLE_TYPE, actif: true })
  if (erreurType) throw new Error(`préparation impossible : ${erreurType.message}`)
})

test.afterAll(async () => {
  await nettoyer()
  await verifierAucunResidu()
})

async function seConnecter(page: Page) {
  await page.goto('/connexion')
  await page.getByLabel('Identifiant').fill(IDENT_ADMIN)
  await page.getByLabel('Mot de passe', { exact: true }).fill(MDP_ADMIN)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page).toHaveURL(/\/tableau-de-bord/)
}

/** Ouvre la confirmation de la ligne du type de test, et REND cette ligne. */
async function ouvrirLaConfirmation(page: Page): Promise<Locator> {
  await page.goto('/evenements/types')
  await expect(page.getByText(LIBELLE_TYPE)).toBeVisible()
  const ligne = page.locator('li').filter({ hasText: LIBELLE_TYPE })
  await ligne.getByRole('button', { name: 'Désactiver' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()

  /*
    ⚠️ LE PORTAIL — RIEN NE LE FIXAIT AVANT CETTE LIGNE (revue des Tasks 12-15, Important).
    `Dialogue` porte lui-même un `<form method="dialog">` : sans `createPortal` vers
    `document.body`, un appelant qui le rend À L'INTÉRIEUR d'un `<form>` ancêtre produirait
    un `<form>` imbriqué — HTML invalide, désaccord d'hydratation — exactement le défaut
    trouvé (et corrigé, `afa178a`) après qu'il a fait expirer trois fichiers de preuve SANS
    AUCUN RAPPORT avec les confirmations. `dialog[open]` ne l'aurait jamais vu : il est
    indifférent au portail. Cette assertion, elle, rougirait immédiatement si le portail
    disparaissait — le prochain qui y touche le saura ICI, pas trois fichiers plus loin.
  */
  await expect(page.locator('form dialog')).toHaveCount(0)
  return ligne
}

test("le dialogue PIÈGE le focus : la tabulation n'atteint jamais un élément interactif extérieur", async ({
  page,
}) => {
  await seConnecter(page)
  await ouvrirLaConfirmation(page)
  const boite = page.getByRole('dialog')

  /*
    ═══ INVARIANT CORRIGÉ, MESURÉ CONTRE CHROMIUM (Task 7, rejoué ici) ═══

    Chromium NE BOUCLE PAS la tabulation vers le premier élément focalisable du `<dialog>` :
    après le dernier, elle retombe sur `<body>`, qui n'est pas focalisable par
    l'utilisateur et reste inerte tant que le dialogue est modal. L'invariant réel n'est
    donc PAS « le focus reste toujours descendant du `<dialog>` » — un test écrit sur cette
    formulation rougirait À TORT — mais « le focus n'atteint JAMAIS un élément interactif
    EXTÉRIEUR ». `<body>` est le seul repli toléré ; tout AUTRE élément hors du dialogue
    serait une fuite du piège de focus.
  */
  const focalisesDansLeDialogue: string[] = []
  for (let i = 0; i < 6; i += 1) {
    await page.keyboard.press('Tab')
    const { interieurOuBody, texte } = await boite.evaluate((element) => {
      const actif = document.activeElement
      return {
        interieurOuBody: element.contains(actif) || actif === document.body,
        texte: actif === document.body ? null : (actif?.textContent ?? ''),
      }
    })
    expect(interieurOuBody, 'le focus a atteint un élément interactif hors du dialogue').toBe(true)
    if (texte) focalisesDansLeDialogue.push(texte)
  }
  // CONTRÔLE POSITIF : les DEUX boutons du dialogue ont réellement reçu le focus tour à
  // tour — sans lui, ce test serait satisfait par un dialogue où rien n'est focalisable,
  // l'état même que le piège de focus doit exclure.
  expect(focalisesDansLeDialogue.some((texte) => texte.includes('Annuler'))).toBe(true)
  expect(focalisesDansLeDialogue.some((texte) => texte.includes('Confirmer'))).toBe(true)

  await fermerConfirmationParEchap(page)
})

test('Échap ferme le dialogue SANS rien soumettre', async ({ page }) => {
  await seConnecter(page)
  await ouvrirLaConfirmation(page)
  const message = await fermerConfirmationParEchap(page)
  expect(message).toContain('Désactiver')

  // RIEN N'A ÉTÉ SOUMIS : le type est TOUJOURS actif, en BASE et non seulement à l'écran.
  const { data, error } = await admin
    .from('types_evenement')
    .select('actif')
    .eq('libelle', LIBELLE_TYPE)
    .single()
  if (error) throw new Error(`lecture impossible : ${error.message}`)
  expect(data.actif).toBe(true)
})

test('le focus REVIENT sur le bouton déclencheur après la fermeture', async ({ page }) => {
  await seConnecter(page)
  const ligne = await ouvrirLaConfirmation(page)
  await fermerConfirmationParEchap(page)

  /*
    Le bouton « Désactiver » de CETTE ligne doit avoir repris le focus. Sans restitution,
    l'utilisateur clavier se retrouve sur `<body>`, en haut de page, et doit re-tabuler
    jusqu'à l'endroit où il était.

    ⚠️ ON COMPARE L'ÉLÉMENT, JAMAIS SON TEXTE (revue finale de branche, I1). Cette assertion
    lisait `document.activeElement?.textContent` et y cherchait « Désactiver ». Or
    `activeElement` N'EST JAMAIS NUL dans un document rendu : sans restitution, il retombe
    sur `<body>`, dont le `textContent` concatène le texte de TOUTE la page — qui contient
    « Désactiver », puisque le test ferme par Échap et que rien n'a donc muté. L'assertion
    passait dans les deux cas, et le repli sur `<body>` est précisément celui que le test du
    piège de focus, dix lignes plus haut, gère explicitement. L'identité de nœud, elle,
    distingue les deux états.
  */
  const bouton = ligne.getByRole('button', { name: 'Désactiver' })
  await expect(bouton).toBeFocused()
})

test('Annuler ne soumet rien, Confirmer soumet une seule fois', async ({ page }) => {
  await seConnecter(page)
  await ouvrirLaConfirmation(page)
  await refuserConfirmation(page)

  const { data: apresAnnulation } = await admin
    .from('types_evenement')
    .select('actif')
    .eq('libelle', LIBELLE_TYPE)
    .single()
  expect(apresAnnulation?.actif).toBe(true)

  await ouvrirLaConfirmation(page)
  const message = await accepterConfirmation(page)
  expect(message).toContain('Désactiver')

  await expect(page.getByRole('button', { name: 'Réactiver' })).toBeVisible()
  const { data: apresConfirmation } = await admin
    .from('types_evenement')
    .select('actif')
    .eq('libelle', LIBELLE_TYPE)
    .single()
  expect(apresConfirmation?.actif).toBe(false)
})
