import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'

// `timeout` relevé au-dessus des 30 s de `playwright.config.ts` : le test central
// enchaîne une connexion complète, une recherche de membre par le sélecteur serveur,
// une transition d'état, deux pointages unitaires et plusieurs relectures en base sous
// `toPass()`. Ce n'est pas le contournement d'un défaut applicatif, c'est le coût réel
// de ce parcours.
test.describe.configure({ mode: 'serial', timeout: 60_000 })

// Mineur 4 de la revue finale de branche — COLLISION D'IDENTIFIANT LEVÉE. Ce fichier
// déclarait `test.e2e.ael.moderateur`, EXACTEMENT le même identifiant que
// `tests/e2e/ael-seance-detail.spec.ts:21`, deux fichiers neufs de la même phase : chaque
// `nettoyer()` supprimait donc le compte de l'autre. Sans effet sous `workers: 1`
// (`playwright.config.ts`, exécution séquentielle), mais le registre atteste que des
// exécutions CONCURRENTES ont réellement eu lieu sur cette base. L'identifiant suit
// désormais la famille de ce fichier (`ZZAelPointage-`), donc il est unique par
// construction plutôt que par convention.
const IDENT_MODERATEUR = 'test.e2e.aelpointage.moderateur'
const MDP_MODERATEUR = `Test-${crypto.randomUUID()}`
// Préfixe de FAMILLE stable pour le nettoyage (I6 de la ronde de correction) : une
// exécution interrompue entre `beforeAll` et `afterAll` laisse une antenne, des
// membres et une séance nommés sous ce préfixe FIXE, que le `nettoyer()` d'une
// exécution ULTÉRIEURE retrouve. `PREFIXE`, lui, reste suffixé aléatoirement par
// exécution — motif éprouvé du projet (`tests/e2e/demandes.spec.ts:24-25`,
// `tests/e2e/arbre.spec.ts:8,44`) : la partie stable sert au balayage de
// RATTRAPAGE, la partie aléatoire distingue les noms individuels DE CETTE exécution.
const FAMILLE = 'ZZAelPointage-'
const PREFIXE = `${FAMILLE}${crypto.randomUUID().slice(0, 8)}`
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
  // Mineur 6 de la revue de la Task 19 — MÊME FAMILLE QUE C1, sur une autre API.
  // `listUsers()` rend 50 comptes PAR PAGE par défaut : sans parcours, ce rattrapage
  // d'un compte orphelin (profil supprimé, utilisateur auth resté) échouerait EN SILENCE
  // dès le 51e compte, laissant un compte de test actif en production — et le
  // `createUser` de l'exécution suivante échouerait alors sur un doublon d'adresse, pour
  // une raison introuvable. On parcourt donc jusqu'à épuisement — DANS CE FICHIER.
  //
  // Mineur 1 de la revue finale de branche : ce commentaire disait « comme partout
  // ailleurs », et c'est FAUX. 25 des 27 fichiers de test du dépôt appellent encore
  // `listUsers()` sans parcours, et le README le documente comme une limite connue et
  // non traitée. Un commentaire qui promet plus que le dépôt ne tient, écrit dans le
  // correctif d'un constat : le motif exact que cette phase traque. La phrase ne décrit
  // plus que ce fichier.
  const PAR_PAGE = 200
  for (let page = 1; ; page++) {
    const { data: comptes, error } = await admin.auth.admin.listUsers({ page, perPage: PAR_PAGE })
    if (error) throw new Error(`liste des comptes impossible : ${error.message}`)
    const utilisateurs = comptes?.users ?? []
    const orphelin = utilisateurs.find((u) => u.email === `${identifiant}@asonkeng.local`)
    if (orphelin) {
      await admin.auth.admin.deleteUser(orphelin.id)
      return
    }
    if (utilisateurs.length < PAR_PAGE) return
  }
}

async function nettoyer() {
  await supprimerCompte(IDENT_MODERATEUR)
  // Rattrapage EXPLICITE de cette exécution (variables déjà connues, chemin le moins
  // coûteux quand rien n'a été interrompu).
  if (idSeance) {
    await admin.from('presences_ael').delete().eq('seance_id', idSeance)
    await admin.from('seances_ael_antennes').delete().eq('seance_id', idSeance)
    await admin.from('seances_ael').delete().eq('id', idSeance)
  }

  // Balayage de FAMILLE (I6) : retrouve aussi ce qu'une exécution ANTÉRIEURE
  // interrompue avant sa propre fin a laissé — une antenne et des membres nommés sous
  // `FAMILLE` mais avec un AUTRE suffixe que celui de cette exécution, que le bloc
  // ci-dessus ne peut pas connaître. Séances d'abord (leur jonction, puis elles-mêmes)
  // : `seances_ael_antennes.antenne_id` est en `on delete restrict`.
  const { data: antennesFamille, error: erreurAntennesFamille } = await admin
    .from('antennes')
    .select('id')
    .like('nom', `${FAMILLE}%`)
  if (erreurAntennesFamille) {
    throw new Error(`balayage des antennes de la famille impossible : ${erreurAntennesFamille.message}`)
  }
  const idsAntennesFamille = (antennesFamille ?? []).map((a) => a.id as string)
  if (idsAntennesFamille.length > 0) {
    const { data: jonctions, error: erreurJonctions } = await admin
      .from('seances_ael_antennes')
      .select('seance_id')
      .in('antenne_id', idsAntennesFamille)
    if (erreurJonctions) {
      throw new Error(`balayage des jonctions de la famille impossible : ${erreurJonctions.message}`)
    }
    const idsSeancesFamille = [...new Set((jonctions ?? []).map((j) => j.seance_id as string))]
    if (idsSeancesFamille.length > 0) {
      await admin.from('presences_ael').delete().in('seance_id', idsSeancesFamille)
      await admin.from('seances_ael_antennes').delete().in('seance_id', idsSeancesFamille)
      await admin.from('seances_ael').delete().in('id', idsSeancesFamille)
    }
  }

  await admin.from('membres').delete().like('nom', `${FAMILLE}%`)
  await admin.from('antennes').delete().like('nom', `${FAMILLE}%`)
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
  // Comptage sur FAMILLE, pas seulement sur PREFIXE (I6) : couvre aussi ce que le
  // balayage de rattrapage était censé nettoyer, pas seulement les entités de CETTE
  // exécution.
  const { count: comptesMembres } = await admin
    .from('membres')
    .select('id', { count: 'exact', head: true })
    .like('nom', `${FAMILLE}%`)
  expect(comptesMembres).toBe(0)
  const { count: comptesAntennes } = await admin
    .from('antennes')
    .select('id', { count: 'exact', head: true })
    .like('nom', `${FAMILLE}%`)
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

// IMPORTANT 5 de la revue de la Task 19 : « rendre le TOTAL visible AUX GESTIONNAIRES »
// était l'arbitrage explicite d'I1, le code le fait (`pointage.tsx:38`, `:78-80`), et
// AUCUN test ne l'assertait — un total figé à zéro passait toutes les portes, très
// exactement le trou refermé pour le compteur AEL de la fiche membre dans la même ronde
// et rouvert sur l'autre écran par le même commit.
//
// IMPORTANT 1 : la suppression du `revalidatePath` (correction I2) laissait subsister le
// CACHE CLIENT de Next — « An in-memory cache in the browser that stores RSC Payload for
// visited and prefetched routes […] reused during browser back/forward navigation »
// (`node_modules/next/dist/docs/01-app/04-glossary.md:45-49`), que `revalidatePath`
// invalidait. Ce test EXERCE le chemin banal décrit par la revue — pointer, revenir à la
// liste, appuyer sur Précédent — plutôt que de le tenir pour acquis dans un commentaire :
// la phase compte trois hypothèses tenues pour acquises et démenties par l'exécution.
test('le total est rendu AU GESTIONNAIRE, et il survit à un retour arrière du navigateur (cache client)', async ({
  page,
}) => {
  const totalAffiche = page.getByText(/^\d+ présents?\.$/)

  await seConnecter(page, IDENT_MODERATEUR, MDP_MODERATEUR)
  await page.goto(`/ael/seances/${idSeance}`)

  // Le total est VISIBLE pour un gestionnaire — et il vaut vraiment zéro ici, ce que la
  // base confirme : sans ce contrôle, « 0 présent » ne distinguerait pas un compteur
  // juste d'un compteur mort.
  expect(await presencesEnBase()).toEqual([])
  await expect(totalAffiche).toHaveText('0 présent.')

  // Armé AVANT le clic : le rafraîchissement différé de `pointage.tsx` est une requête
  // RSC vers CETTE route, et `waitForRequest` REJETTE à l'expiration — si le correctif
  // disparaissait, ce test échouerait ici, bruyamment, avant même le retour arrière.
  // Les préchargements sont exclus (`next-router-prefetch`) : eux ne purgent rien.
  const attenteRafraichissement = page.waitForRequest(
    (requete) =>
      requete.url().includes(`/ael/seances/${idSeance}`) &&
      requete.headers()['rsc'] === '1' &&
      requete.headers()['next-router-prefetch'] === undefined,
    { timeout: 20_000 },
  )

  await page.getByLabel(`Test ${PREFIXE}-membre1`, { exact: false }).check()
  // Le total suit la case cochée immédiatement, sans attendre le serveur (I2).
  await expect(totalAffiche).toHaveText('1 présent.')
  // …et l'écriture a réellement eu lieu : le total pourrait sinon n'être qu'optimiste.
  await expect(async () => {
    const presences = await presencesEnBase()
    expect(presences).toHaveLength(1)
    expect(presences[0].present).toBe(true)
  }).toPass()

  await attenteRafraichissement

  // LE CHEMIN DE LA REVUE : quitter l'écran par le lien, puis revenir par le bouton
  // Précédent du navigateur. Next sert alors la charge RSC mise en cache — celle d'AVANT
  // le pointage si rien ne l'a invalidée.
  await page.getByRole('link', { name: 'Retour aux séances' }).click()
  await expect(page).toHaveURL(/\/ael\/seances$/)
  await page.goBack()
  await expect(page).toHaveURL(new RegExp(`/ael/seances/${idSeance}$`))

  await expect(page.getByLabel(`Test ${PREFIXE}-membre1`, { exact: false })).toBeChecked()
  await expect(totalAffiche).toHaveText('1 présent.')
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

// Ajouté suite à la revue des Tasks 17-18 : le compteur AEL affiché sur la fiche
// membre (`src/app/membres/[id]/page.tsx:68`) était correct en lecture de code, mais
// sa SEULE preuve d'affichage réel était un script Playwright JETÉ, non committé —
// une recherche de « Compteur AEL » dans `tests/` ne rendait rien. Un compteur bloqué
// à zéro est indiscernable d'un « rien à compter », et `seances_ael`/`presences_ael`
// sont VIDES en production (au 2026-08-14) : un affichage figé à zéro serait
// aujourd'hui rigoureusement conforme aux apparences. D'où les DEUX membres, dans la
// MÊME preuve : idMembre1 (pointé par le test précédent, total réel 1, NON NUL) et
// idEnseignant (jamais pointé, jamais visé par aucune présence de ce fichier, vrai
// ZÉRO) — sans les deux, la preuve ne discriminerait rien. Placée ICI, entre le
// pointage et la réversibilité : c'est la seule fenêtre du fichier où idMembre1 vaut
// EXACTEMENT 1 en base (le test de réversibilité le fait ensuite redescendre à 0 puis
// remonter).
test('le compteur AEL affiché sur la fiche membre est réellement non nul après un pointage, et vraiment zéro sans historique', async ({
  page,
}) => {
  await seConnecter(page, IDENT_MODERATEUR, MDP_MODERATEUR)

  // Contrôle en base D'ABORD : si ce total n'était plus 1 pour une raison étrangère à
  // ce test (ordre d'exécution changé, test précédent modifié), l'assertion d'écran
  // qui suit ne prouverait plus ce qu'elle prétend.
  expect(await compteurAelEnBase(idMembre1)).toBe(1)

  await page.goto(`/membres/${idMembre1}`)
  const ligneCompteurNonNul = page
    .locator('dl > div')
    .filter({ has: page.locator('dt', { hasText: 'Compteur AEL' }) })
  await expect(ligneCompteurNonNul.locator('dd')).toHaveText('1')

  await page.goto(`/membres/${idEnseignant}`)
  const ligneCompteurZero = page
    .locator('dl > div')
    .filter({ has: page.locator('dt', { hasText: 'Compteur AEL' }) })
  await expect(ligneCompteurZero.locator('dd')).toHaveText('0')
})

test("réversibilité (D49) : repasser à prévue préserve le pointage, le compteur suit", async ({ page }) => {
  const totalAvant = await compteurAelEnBase(idMembre1)
  expect(totalAvant).toBe(1)
  const presencesAvant = await presencesEnBase()
  expect(presencesAvant).toHaveLength(2)

  await seConnecter(page, IDENT_MODERATEUR, MDP_MODERATEUR)
  await page.goto(`/ael/seances/${idSeance}`)
  // Task 15 (D124) : window.confirm est remplacé par le <dialog> natif de Dialogue — le
  // clic n'ouvre plus qu'un dialogue, il ne soumet plus rien tout seul. « Confirmer » est
  // donc cliqué explicitement, à la place de l'ancien page.once('dialog', (d) => d.accept()).
  await page.getByRole('button', { name: 'Repasser à prévue' }).click()
  await page.locator('dialog[open]').getByRole('button', { name: 'Confirmer' }).click()

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
