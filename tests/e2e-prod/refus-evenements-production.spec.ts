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
 * `npm run test:e2e` sert `npm run dev`, et ce mode NE PEUT PAS révéler la classe de défaut
 * éprouvée ici : une exception LEVÉE depuis une Server Action est transmise intacte au
 * client en développement, mais perd son message EN PRODUCTION SEULEMENT — React la
 * remplace par un digest interne (« Minified React error #441 »). Ce motif est apparu CINQ
 * FOIS dans ce projet.
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
  await champCache.evaluate((element, valeur) => {
    ;(element as HTMLInputElement).value = valeur
  }, idMembreArchive)
  // GARDE : sans elle, un re-rendu React qui réinitialiserait le champ contrôlé rendrait le
  // formulaire vide, le contrôle amont `champManquantConversion` renverrait
  // MESSAGE_FICHE_CIBLE_OBLIGATOIRE, et le test échouerait sur l'assertion suivante SANS
  // qu'on sache que c'est la forge qui a raté, pas le refus qui manque.
  await expect(champCache).toHaveValue(idMembreArchive)
  await ligne.getByRole('button', { name: 'Convertir' }).click()

  await expect(ligne.getByRole('alert')).toContainText(MESSAGE_FICHE_CIBLE_NON_ACTIVE)

  const { data } = await admin
    .from('participants_externes')
    .select('converti_en_membre_id')
    .eq('id', idExterne)
    .single()
  expect(data!.converti_en_membre_id).toBeNull()
})
