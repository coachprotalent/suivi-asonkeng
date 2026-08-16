import { createClient } from '@supabase/supabase-js'
import { expect, test, type Page } from '@playwright/test'
import { identifiantVersEmail } from '../../src/lib/domaine/identifiant'
import {
  MESSAGE_FICHE_CIBLE_NON_ACTIVE,
  MESSAGE_MOTIF_OBLIGATOIRE_CLASSEMENT,
} from '../../src/app/evenements/a-traiter/messages'

/**
 * PREUVE REJOUABLE CONTRE UN BUILD DE PRODUCTION (`next build` + `next start`, voir
 * `playwright.prod.config.ts`).
 *
 * ⚠️ AFFIRMATION CORRIGÉE (revue du dernier lot). Ce bloc concluait que « `npm run test:e2e`
 * sert `npm run dev`, et ce mode NE PEUT PAS révéler la classe de défaut éprouvée ici ».
 * C'ÉTAIT TROP GÉNÉRAL, et le mécanisme invoqué ne tient pas dans ce cas précis. Mesuré :
 *
 *  - AUCUN test de `tests/e2e/` n'assère `MESSAGE_MOTIF_OBLIGATOIRE_CLASSEMENT` (grep : zéro
 *    occurrence). La suite ordinaire est verte parce qu'elle NE COUVRE PAS ce chemin, pas
 *    parce qu'elle serait aveugle par nature ;
 *  - `ligne-a-traiter.tsx` consomme les deux actions par `useActionState`, SANS AUCUN
 *    `try`/`catch`. Une exception levée n'est donc transmise à personne : elle remonte à la
 *    limite d'erreur EN DÉVELOPPEMENT COMME EN PRODUCTION. C'est exactement ce que la
 *    mutation de la Task 27 a produit — « element(s) not found », toute la ligne disparue —
 *    et NON le « Minified React error #441 » que le brief annonçait.
 *
 * LE DÉFAUT DU DIGEST RESTE RÉEL : il a été observé directement en phase 2b, avec le message
 * exact. Mais il ne se manifeste QUE là où le composant ATTRAPE l'exception et affiche
 * `error.message` — dans ce dépôt, `src/app/comptes/ligne-compte.tsx` (`useTransition` +
 * `try`/`catch`, trois sites) est le seul de cette forme. Ailleurs, un refus levé ne devient
 * pas un digest : il devient un écran d'erreur, ce qui est un autre défaut.
 *
 * CE QUE CE FICHIER ÉTABLIT DONC, ET C'EST DÉJÀ BEAUCOUP : qu'un refus métier RETOURNÉ
 * atteint réellement l'écran contre un VRAI BUILD DE PRODUCTION (`next build` + `next start`,
 * voir `playwright.prod.config.ts`) — et, par sa mutation, qu'un refus LEVÉ n'y est affichable
 * d'aucune manière. Un refus doit être RETOURNÉ pour être affichable ; c'est cela qui est
 * prouvé, pas une cécité de principe de la suite ordinaire.
 *
 * Les messages sont IMPORTÉS depuis `src/`, jamais recopiés : recopiés, ce fichier
 * resterait vert le jour où le message change, et n'éprouverait plus rien.
 *
 * Deux refus, deux chemins de retour distincts : `motif_classement_vide` vient du contrôle
 * AMONT (aucun aller-retour en base) ; `membre_cible_non_actif` vient d'un marqueur
 * POSTGRES remonté par la passerelle. Aucun des deux n'emprunte le chemin 1, donc aucune
 * notification n'est émise et le compte racine n'est pas pollué.
 */

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const MDP = `Test-${crypto.randomUUID()}`
const IDENT_ADMIN = 'test.e2e.prod.evt.admin'
const FAMILLE = 'ZZEvtProd-'
const PREFIXE = `${FAMILLE}${crypto.randomUUID().slice(0, 8)}`

let idType: string
let idEvenement: string
let idMembreArchive: string
let idExterne: string

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
  await page.getByLabel('Mot de passe', { exact: true }).fill(MDP)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page).toHaveURL(/\/tableau-de-bord/)
}

async function nettoyer() {
  const { data: evts } = await admin.from('evenements').select('id').like('titre', `${FAMILLE}%`)
  const idsEvts = (evts ?? []).map((l) => l.id as string)
  const { data: externes } = await admin.from('participants_externes').select('id').like('nom', `${FAMILLE}%`)
  const idsExternes = (externes ?? []).map((l) => l.id as string)
  const { data: membres } = await admin.from('membres').select('id').like('nom', `${FAMILLE}%`)
  const idsMembres = (membres ?? []).map((l) => l.id as string)

  for (const [colonne, ids] of [
    ['evenement_id', idsEvts],
    ['participant_externe_id', idsExternes],
    ['membre_id', idsMembres],
  ] as const) {
    if (ids.length > 0) await admin.from('participations').delete().in(colonne, ids)
  }
  if (idsExternes.length > 0) await admin.from('participants_externes').delete().in('id', idsExternes)
  if (idsMembres.length > 0) await admin.from('membres').delete().in('id', idsMembres)
  if (idsEvts.length > 0) await admin.from('evenements').delete().in('id', idsEvts)
  await admin.from('types_evenement').delete().like('libelle', `${FAMILLE}%`)
}

test.beforeAll(async () => {
  await nettoyer()
  await supprimerCompte(IDENT_ADMIN)

  const { data: compte, error: erreurCompte } = await admin.auth.admin.createUser({
    email: identifiantVersEmail(IDENT_ADMIN),
    password: MDP,
    email_confirm: true,
  })
  if (erreurCompte || !compte.user) throw new Error(`création du compte impossible : ${erreurCompte?.message}`)
  const { error: erreurProfil } = await admin
    .from('profils')
    .insert({ id: compte.user.id, identifiant: IDENT_ADMIN, nom_affichage: 'Test prod évènements' })
  if (erreurProfil) throw new Error(`insertion du profil impossible : ${erreurProfil.message}`)
  const { error: erreurRole } = await admin
    .from('roles_profil')
    .insert({ profil_id: compte.user.id, role: 'administrateur' })
  if (erreurRole) throw new Error(`attribution du rôle impossible : ${erreurRole.message}`)

  const { data: type, error: erreurType } = await admin
    .from('types_evenement')
    .insert({ libelle: `${PREFIXE}-type` })
    .select('id')
    .single()
  if (erreurType || !type) throw new Error(`création du type impossible : ${erreurType?.message}`)
  idType = type.id as string

  const { data: evt, error: erreurEvt } = await admin
    .from('evenements')
    .insert({ titre: `${PREFIXE}-evenement`, type_id: idType, date_debut: '2026-09-01' })
    .select('id')
    .single()
  if (erreurEvt || !evt) throw new Error(`création de l évènement impossible : ${erreurEvt?.message}`)
  idEvenement = evt.id as string

  const { data: membre, error: erreurMembre } = await admin
    .from('membres')
    .insert({ nom: `${PREFIXE}-archive`, prenom: 'Test', etat: 'archive' })
    .select('id')
    .single()
  if (erreurMembre || !membre) throw new Error(`création du membre archivé impossible : ${erreurMembre?.message}`)
  idMembreArchive = membre.id as string

  const { data: externe, error: erreurExterne } = await admin
    .from('participants_externes')
    .insert({ nom: `${PREFIXE}-externe`, prenom: 'Test' })
    .select('id')
    .single()
  if (erreurExterne || !externe) throw new Error(`création de l externe impossible : ${erreurExterne?.message}`)
  idExterne = externe.id as string

  const { error: erreurPart } = await admin.from('participations').insert({
    evenement_id: idEvenement,
    participant_externe_id: idExterne,
    desir_suivi_spirituel: true,
  })
  if (erreurPart) throw new Error(`participation impossible : ${erreurPart.message}`)
})

test.afterAll(async () => {
  await nettoyer()
  for (const [table, colonne] of [
    ['evenements', 'titre'],
    ['participants_externes', 'nom'],
    ['membres', 'nom'],
    ['types_evenement', 'libelle'],
  ] as const) {
    const { count } = await admin
      .from(table)
      .select('id', { count: 'exact', head: true })
      .like(colonne, `${FAMILLE}%`)
    expect(count, `résidu dans ${table}`).toBe(0)
  }
  await supprimerCompte(IDENT_ADMIN)
})

test("le refus « motif obligatoire » s'affiche TEL QUEL contre un build de production", async ({ page }) => {
  await seConnecter(page, IDENT_ADMIN)
  await page.goto('/evenements/a-traiter')

  const ligne = page.locator('li').filter({ hasText: `${PREFIXE}-externe` })
  await ligne.getByText('Classer sans suite').first().click()
  // Le champ `required` du navigateur bloquerait un envoi vide : on saisit des ESPACES,
  // qui passent la validation HTML et déclenchent le refus SERVEUR — c'est ce refus-là,
  // et lui seul, que ce fichier existe pour éprouver.
  await ligne.getByLabel('Motif').fill('   ')
  await ligne.getByRole('button', { name: 'Classer sans suite' }).click()

  // LE TEXTE RÉELLEMENT AFFICHÉ, importé depuis `src/`. S'il devenait « Minified React
  // error #441 », c'est que l'action LÈVE au lieu de RETOURNER.
  // ÉCART SIGNALÉ PAR RAPPORT AU BRIEF : `page.getByRole('alert')` seul viole le mode
  // strict Playwright — Next.js pose son propre `<div role="alert"
  // id="__next-route-announcer__">` sur CHAQUE page, en plus du `<p role="alert">`
  // applicatif. Vérifié à l'exécution (« resolved to 2 elements »). Scopé à `ligne`, motif
  // déjà suivi par tests/e2e-prod/refus-metier-production.spec.ts:149.
  await expect(ligne.getByRole('alert')).toContainText(MESSAGE_MOTIF_OBLIGATOIRE_CLASSEMENT)

  // Et rien n'a été écrit : le refus est un refus, pas un demi-succès.
  const { data } = await admin
    .from('participants_externes')
    .select('classe_le')
    .eq('id', idExterne)
    .single()
  expect(data!.classe_le).toBeNull()
})

test("le refus « fiche cible non active » — remonté d'un MARQUEUR POSTGRES — s'affiche tel quel en production", async ({ page }) => {
  await seConnecter(page, IDENT_ADMIN)
  await page.goto('/evenements/a-traiter')

  const ligne = page.locator('li').filter({ hasText: `${PREFIXE}-externe` })
  await ligne.getByText('Convertir en membre').click()
  await ligne.getByLabel('Rattacher à une fiche membre existante').check()

  // `SelecteurMembre` ne propose que des membres ACTIFS : la fiche archivée n'y apparaît
  // pas, et c'est voulu (double dispositif de D68). On force donc la valeur du champ caché,
  // ce qui reproduit EXACTEMENT le cas réel visé — un onglet resté ouvert qui reposte un
  // identifiant devenu invalide entre-temps.
  const champCache = ligne.locator('input[name="membreCibleId"]')
  async function forcerChampCache() {
    await champCache.evaluate((element, valeur) => {
      ;(element as HTMLInputElement).value = valeur
    }, idMembreArchive)
    // GARDE : sans elle, un re-rendu React qui réinitialiserait le champ contrôlé rendrait
    // le formulaire vide, le contrôle amont `champManquantConversion` renverrait
    // MESSAGE_FICHE_CIBLE_OBLIGATOIRE, et le test échouerait sur l'assertion suivante SANS
    // qu'on sache que c'est la forge qui a raté, pas le refus qui manque.
    await expect(champCache).toHaveValue(idMembreArchive)
  }
  await forcerChampCache()
  // M11 — la conversion porte une confirmation. Depuis la Task 15 (D124), ce n'est plus une
  // boîte native mais le `<dialog>` de `Dialogue` : le clic sur « Convertir » n'ouvre que le
  // dialogue, sans lui ce test échouerait sur l'absence du refus, en donnant à croire que le
  // refus a disparu. Le message est asséré, ce qui en fait aussi le contrôle positif de la
  // confirmation.
  //
  // ⚠️ DEUXIÈME FORÇAGE, DÉCOUVERT EN FAISANT TOURNER CETTE PREUVE (Task 15) : ouvrir le
  // dialogue appelle `setConversionConfirmationDemandee(true)` dans `LigneATraiter`, ce qui
  // RE-RESTITUE `SelecteurMembre` — et son champ caché est CONTRÔLÉ (`value={valeur?.id ?? ''}`),
  // donc ce re-rendu écrase silencieusement le premier forçage et revide le champ. Avant la
  // Task 13, aucun rendu React ne s'intercalait entre le forçage et la soumission native
  // (`window.confirm` ne déclenche aucun état) : le premier forçage suffisait. Ce n'est plus
  // le cas — il faut reforcer APRÈS l'ouverture du dialogue, juste avant « Confirmer », qui
  // est le DERNIER moment où `LigneATraiter` se re-rend avant `requestSubmit`.
  await ligne.getByRole('button', { name: 'Convertir' }).click()
  const dialogueOuvert = page.locator('dialog[open]')
  const texteConfirmation = await dialogueOuvert.locator('p').first().innerText()
  await forcerChampCache()
  await dialogueOuvert.getByRole('button', { name: 'Confirmer' }).click()
  // `expect.poll` inchangé bien que la valeur soit déjà résolue : ne pas modifier la forme
  // de l'assertion elle-même (Task 15, D124 — seuls les gestionnaires de dialogue natif
  // sont adaptés).
  await expect.poll(() => texteConfirmation).toContain('DÉFINITIVE')

  await expect(ligne.getByRole('alert')).toContainText(MESSAGE_FICHE_CIBLE_NON_ACTIVE)

  const { data } = await admin
    .from('participants_externes')
    .select('converti_en_membre_id')
    .eq('id', idExterne)
    .single()
  expect(data!.converti_en_membre_id).toBeNull()
})
