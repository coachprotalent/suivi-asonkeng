import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'

// `timeout` relevé au-dessus des 30 s de `playwright.config.ts` : le test central
// enchaîne une connexion complète, une recherche de membre par le sélecteur serveur,
// une transition d'état, deux pointages unitaires et plusieurs relectures en base sous
// `toPass()`. Ce n'est pas le contournement d'un défaut applicatif, c'est le coût réel
// de ce parcours.
test.describe.configure({ mode: 'serial', timeout: 60_000 })

const IDENT_MODERATEUR = 'test.e2e.ael.moderateur'
const MDP_MODERATEUR = `Test-${crypto.randomUUID()}`
const PREFIXE = `ZZAelPointage-${crypto.randomUUID().slice(0, 8)}`
const NOM_ANTENNE = `${PREFIXE}-Antenne`

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

let idAntenne: string
let idMembre1: string
let idMembre2: string
let idEnseignant: string
let idSeance: string

async function creerMembre(suffixe: string, antenneId: string | null): Promise<string> {
  const { data, error } = await admin
    .from('membres')
    .insert({ nom: `${PREFIXE}-${suffixe}`, prenom: 'Test', antenne_id: antenneId })
    .select('id')
    .single()
  if (error || !data) throw new Error(`création du membre ${suffixe} impossible : ${error?.message}`)
  return data.id as string
}

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
  await supprimerCompte(IDENT_MODERATEUR)
  if (idSeance) {
    await admin.from('presences_ael').delete().eq('seance_id', idSeance)
    await admin.from('seances_ael_antennes').delete().eq('seance_id', idSeance)
    await admin.from('seances_ael').delete().eq('id', idSeance)
  }
  await admin.from('membres').delete().like('nom', `${PREFIXE}-%`)
  await admin.from('antennes').delete().eq('nom', NOM_ANTENNE)
}

test.beforeAll(async () => {
  await nettoyer()

  const { data: antenne, error: erreurAntenne } = await admin
    .from('antennes')
    .insert({ nom: NOM_ANTENNE, pays: 'Test' })
    .select('id')
    .single()
  if (erreurAntenne || !antenne) throw new Error(`création de l'antenne impossible : ${erreurAntenne?.message}`)
  idAntenne = antenne.id as string

  idMembre1 = await creerMembre('membre1', idAntenne)
  idMembre2 = await creerMembre('membre2', idAntenne)
  idEnseignant = await creerMembre('enseignant', null)

  const { data: seance, error: erreurSeance } = await admin
    .from('seances_ael')
    .insert({ date: '2026-09-15' })
    .select('id')
    .single()
  if (erreurSeance || !seance) throw new Error(`création de la séance impossible : ${erreurSeance?.message}`)
  idSeance = seance.id as string

  const { error: erreurJonction } = await admin
    .from('seances_ael_antennes')
    .insert({ seance_id: idSeance, antenne_id: idAntenne })
  if (erreurJonction) throw new Error(`jonction impossible : ${erreurJonction.message}`)

  const { data: compte, error: erreurCompte } = await admin.auth.admin.createUser({
    email: `${IDENT_MODERATEUR}@asonkeng.local`,
    password: MDP_MODERATEUR,
    email_confirm: true,
  })
  if (erreurCompte || !compte.user) throw new Error(erreurCompte?.message)
  const { error: erreurProfil } = await admin
    .from('profils')
    .insert({ id: compte.user.id, identifiant: IDENT_MODERATEUR, nom_affichage: 'Test AEL' })
  if (erreurProfil) throw new Error(`insertion du profil impossible : ${erreurProfil.message}`)
  const { error: erreurRole } = await admin
    .from('roles_profil')
    .insert({ profil_id: compte.user.id, role: 'moderateur' })
  if (erreurRole) throw new Error(`attribution du rôle impossible : ${erreurRole.message}`)
})

test.afterAll(async () => {
  await nettoyer()
  // Nettoyage vérifié par comptage, pas seulement par l'absence d'erreur de suppression
  // (règle globale de la phase — écart au brief signalé dans le rapport de la tâche).
  const { count: comptesPresences } = await admin
    .from('presences_ael')
    .select('seance_id', { count: 'exact', head: true })
    .eq('seance_id', idSeance)
  expect(comptesPresences).toBe(0)
  const { count: comptesSeances } = await admin
    .from('seances_ael')
    .select('id', { count: 'exact', head: true })
    .eq('id', idSeance)
  expect(comptesSeances).toBe(0)
  const { count: comptesMembres } = await admin
    .from('membres')
    .select('id', { count: 'exact', head: true })
    .like('nom', `${PREFIXE}-%`)
  expect(comptesMembres).toBe(0)
  const { count: comptesAntennes } = await admin
    .from('antennes')
    .select('id', { count: 'exact', head: true })
    .eq('nom', NOM_ANTENNE)
  expect(comptesAntennes).toBe(0)
  const { data: compteResiduel } = await admin
    .from('profils')
    .select('id')
    .eq('identifiant', IDENT_MODERATEUR)
  expect(compteResiduel ?? []).toHaveLength(0)
})

async function seConnecter(page: import('@playwright/test').Page, identifiant: string, mdp: string) {
  await page.goto('/connexion')
  await page.getByLabel('Identifiant').fill(identifiant)
  await page.getByLabel('Mot de passe', { exact: true }).fill(mdp)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page).toHaveURL(/\/tableau-de-bord/)
}

async function presencesEnBase(): Promise<Array<{ membre_id: string; present: boolean }>> {
  const { data, error } = await admin
    .from('presences_ael')
    .select('membre_id, present')
    .eq('seance_id', idSeance)
  if (error) throw new Error(`lecture des présences impossible : ${error.message}`)
  return (data ?? []) as Array<{ membre_id: string; present: boolean }>
}

async function etatSeanceEnBase(): Promise<string> {
  const { data, error } = await admin.from('seances_ael').select('etat').eq('id', idSeance).single()
  if (error) throw new Error(`lecture de l'état impossible : ${error.message}`)
  return data.etat as string
}

async function compteurAelEnBase(membreId: string): Promise<number> {
  const { data, error } = await admin.from('compteurs_ael').select('total').eq('membre_id', membreId).single()
  if (error) throw new Error(`lecture du compteur impossible : ${error.message}`)
  return data.total as number
}

test("CONTRÔLE POSITIF : la séance de test existe bien, à l'état prévue, sans présence", async () => {
  expect(await etatSeanceEnBase()).toBe('prevue')
  expect(await presencesEnBase()).toEqual([])
})

test('un modérateur tient la séance et pointe deux présences, écritures vérifiées en base', async ({ page }) => {
  await seConnecter(page, IDENT_MODERATEUR, MDP_MODERATEUR)
  await page.goto(`/ael/seances/${idSeance}`)

  await page.getByLabel('Thème').fill('Un thème de test')
  await page
    .getByLabel("Enseignant (membre de l'équipe)")
    .fill(`${PREFIXE}-enseignant`)
  await page.getByRole('button', { name: `${PREFIXE}-enseignant`, exact: false }).first().click()
  await page.getByRole('button', { name: 'Marquer tenue' }).click()

  await expect(async () => {
    expect(await etatSeanceEnBase()).toBe('tenue')
  }).toPass()

  // Libellé accessible d'une ligne de pointage : « {prénom} {nom} » (Task 16,
  // `pointage.tsx`) — les membres de test portent tous le prénom « Test ».
  await page.getByLabel(`Test ${PREFIXE}-membre1`, { exact: false }).check()
  await page.getByLabel(`Test ${PREFIXE}-membre2`, { exact: false }).check()

  // Assertion EN BASE, et non sur l'écran : c'est l'écriture qui compte (spec §8).
  await expect(async () => {
    const presences = await presencesEnBase()
    expect(presences).toHaveLength(2)
    expect(presences.every((p) => p.present)).toBe(true)
    expect(presences.map((p) => p.membre_id).sort()).toEqual([idMembre1, idMembre2].sort())
  }).toPass()

  // Le compteur suit d'elle-même (D4) : report initial (0 par défaut) + 1 présence.
  await expect(async () => {
    expect(await compteurAelEnBase(idMembre1)).toBe(1)
    expect(await compteurAelEnBase(idMembre2)).toBe(1)
  }).toPass()
})

test("réversibilité (D49) : repasser à prévue préserve le pointage, le compteur suit", async ({ page }) => {
  const totalAvant = await compteurAelEnBase(idMembre1)
  expect(totalAvant).toBe(1)
  const presencesAvant = await presencesEnBase()
  expect(presencesAvant).toHaveLength(2)

  await seConnecter(page, IDENT_MODERATEUR, MDP_MODERATEUR)
  await page.goto(`/ael/seances/${idSeance}`)
  page.once('dialog', (dialogue) => dialogue.accept())
  await page.getByRole('button', { name: 'Repasser à prévue' }).click()

  await expect(async () => {
    expect(await etatSeanceEnBase()).toBe('prevue')
  }).toPass()

  // Les présences SURVIVENT (D49) : même nombre de lignes, mêmes valeurs.
  const presencesApres = await presencesEnBase()
  expect(presencesApres).toHaveLength(2)
  expect(presencesApres.map((p) => p.membre_id).sort()).toEqual(
    presencesAvant.map((p) => p.membre_id).sort(),
  )

  // Le compteur, lui, ne compte plus cette séance tant qu'elle n'est pas tenue :
  // la présence n'est pas effacée, mais elle cesse d'être COMPTÉE.
  expect(await compteurAelEnBase(idMembre1)).toBe(0)

  // Remarquer tenue.
  await page.goto(`/ael/seances/${idSeance}`)
  await page.getByRole('button', { name: 'Marquer tenue' }).click()
  await expect(async () => {
    expect(await etatSeanceEnBase()).toBe('tenue')
  }).toPass()

  // Le compteur retrouve EXACTEMENT le total d'avant le retour en arrière — pas un de
  // plus (double compte), pas un de moins (perte).
  await expect(async () => {
    expect(await compteurAelEnBase(idMembre1)).toBe(totalAvant)
  }).toPass()
  const presencesFinales = await presencesEnBase()
  expect(presencesFinales).toHaveLength(2)
})
