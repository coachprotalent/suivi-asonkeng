import { createClient } from '@supabase/supabase-js'
import { expect, test, type Page } from '@playwright/test'
import { identifiantVersEmail } from '../../src/lib/domaine/identifiant'

/**
 * Phase 8, D159 à D162 — la suppression d'un compte, vue de l'écran.
 *
 * ═══ CE QUE CETTE SUITE AJOUTE AUX PREUVES RLS ═══
 * `tests/rls/suppression-compte.test.ts` établit ce que la BASE fait et refuse. Elle ne dit
 * rien de l'écran, et trois choses ne vivent que là :
 *
 *   1. le parcours complet — bouton, confirmation, disparition de la liste ;
 *   2. la CONFIRMATION ANNONCE ce qui survit et ce qui disparaît (D161, D162). Sans cela,
 *      l'administrateur croirait effacer la fiche membre avec le compte ;
 *   3. le bouton n'est proposé NI sur le compte racine NI sur sa propre ligne — proposer un
 *      geste dont on connaît d'avance le refus se lit comme un défaut.
 *
 * ⚠️ CETTE SUITE NE CRÉE NI NE VISE AUCUN COMPTE RÉEL. Elle ne lit le compte racine que pour
 * vérifier l'ABSENCE d'un bouton sur sa ligne — jamais pour tenter quoi que ce soit dessus.
 * La raison de cette insistance est consignée dans `tests/rls/suppression-compte.test.ts` :
 * une première version d'un test de refus avait réellement détruit le compte racine du
 * projet, son étape « rouge » s'étant exécutée avant que la protection n'existe.
 */

test.describe.configure({ mode: 'serial' })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const MDP = `Test-${crypto.randomUUID()}`
const IDENT_ADMIN = 'test.e2e.suppression.admin'
const IDENT_JETABLE = 'test.e2e.suppression.jetable'

const PREFIXE_FAMILLE = 'ZZSuppressionE2E-'
const NOM_MEMBRE = `${PREFIXE_FAMILLE}${crypto.randomUUID().slice(0, 8)}`
const NOM_AFFICHAGE_JETABLE = 'Test compte jetable'

let idJetable: string
let idMembre: string
let idDemande: string

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

async function creerCompte(identifiant: string, nomAffichage: string, roles: string[]): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email: identifiantVersEmail(identifiant),
    password: MDP,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`création du compte impossible : ${error?.message}`)
  const { error: erreurProfil } = await admin
    .from('profils')
    .insert({ id: data.user.id, identifiant, nom_affichage: nomAffichage })
  if (erreurProfil) {
    await admin.auth.admin.deleteUser(data.user.id)
    throw new Error(`insertion du profil impossible : ${erreurProfil.message}`)
  }
  for (const role of roles) {
    const { error: erreurRole } = await admin
      .from('roles_profil')
      .insert({ profil_id: data.user.id, role })
    if (erreurRole) {
      await admin.auth.admin.deleteUser(data.user.id)
      throw new Error(`attribution du rôle impossible : ${erreurRole.message}`)
    }
  }
  return data.user.id
}

async function seConnecter(page: Page, identifiant: string) {
  await page.goto('/connexion')
  await page.getByLabel('Identifiant').fill(identifiant)
  await page.getByLabel('Mot de passe', { exact: true }).fill(MDP)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page).toHaveURL(/\/tableau-de-bord/)
}

/** La ligne de `/comptes` portant cet identifiant. */
function ligne(page: Page, identifiant: string) {
  return page.locator('li').filter({ hasText: identifiant })
}

test.beforeAll(async () => {
  for (const identifiant of [IDENT_ADMIN, IDENT_JETABLE]) await supprimerCompte(identifiant)
  const { data: fiches } = await admin.from('membres').select('id').like('nom', `${PREFIXE_FAMILLE}%`)
  const ids = (fiches ?? []).map((l) => l.id as string)
  if (ids.length > 0) await admin.from('demandes_membre').delete().in('membre_id', ids)
  await admin.from('membres').delete().like('nom', `${PREFIXE_FAMILLE}%`)

  const { data: membre, error: erreurMembre } = await admin
    .from('membres')
    .insert({ nom: NOM_MEMBRE, prenom: 'Test', etat: 'actif' })
    .select('id')
    .single()
  if (erreurMembre || !membre) throw new Error(`création de la fiche : ${erreurMembre?.message}`)
  idMembre = membre.id

  await creerCompte(IDENT_ADMIN, 'Test suppression admin', ['administrateur'])
  idJetable = await creerCompte(IDENT_JETABLE, NOM_AFFICHAGE_JETABLE, [])

  // Une demande au nom du compte jetable : c'est elle qui doit SURVIVRE.
  const { data: demande, error: erreurDemande } = await admin
    .from('demandes_membre')
    .insert({ origine: 'demande_suivi', demandeur_profil_id: idJetable, membre_id: idMembre })
    .select('id')
    .single()
  if (erreurDemande || !demande) throw new Error(`création de la demande : ${erreurDemande?.message}`)
  idDemande = demande.id
})

test.afterAll(async () => {
  for (const identifiant of [IDENT_ADMIN, IDENT_JETABLE]) await supprimerCompte(identifiant)
  // La demande n'a plus de profil : on la retrouve par sa fiche membre.
  await admin.from('demandes_membre').delete().eq('membre_id', idMembre)
  await admin.from('membres').delete().like('nom', `${PREFIXE_FAMILLE}%`)

  const { count, error } = await admin
    .from('membres')
    .select('id', { count: 'exact', head: true })
    .like('nom', `${PREFIXE_FAMILLE}%`)
  if (error) throw new Error(`comptage de contrôle impossible : ${error.message}`)
  expect(count).toBe(0)

  // GARDE-FOU : cette suite ne doit jamais avoir touché au compte racine du projet.
  const { data: racine } = await admin.from('profils').select('identifiant').eq('est_racine', true)
  expect(racine, 'le compte racine du projet doit exister').toHaveLength(1)
})

test('la confirmation ANNONCE ce qui survit et ce qui disparaît (D161, D162)', async ({ page }) => {
  await seConnecter(page, IDENT_ADMIN)
  await page.goto('/comptes')

  await ligne(page, IDENT_JETABLE).getByRole('button', { name: 'Supprimer ce compte' }).click()

  const dialogue = page.locator('dialog[open]')
  const message = await dialogue.locator('p').first().innerText()
  // Les TROIS conséquences, énoncées avant le geste. Sans elles, l'administrateur croirait
  // effacer la fiche membre avec le compte.
  expect(message).toContain("Sa fiche membre n'est PAS supprimée")
  expect(message).toContain('Ses demandes de suivi non plus')
  expect(message).toContain('Ses notifications, en revanche, disparaissent')
  expect(message).toContain('irréversible')

  // On ANNULE : ce test ne mesure que le message, et le compte doit survivre pour le suivant.
  await dialogue.getByRole('button', { name: 'Annuler' }).click()
  const { data } = await admin.from('profils').select('id').eq('id', idJetable).maybeSingle()
  expect(data).not.toBeNull()
})

test('un administrateur supprime un compte, et la demande lui survit', async ({ page }) => {
  await seConnecter(page, IDENT_ADMIN)
  await page.goto('/comptes')

  await ligne(page, IDENT_JETABLE).getByRole('button', { name: 'Supprimer ce compte' }).click()
  await page.locator('dialog[open]').getByRole('button', { name: 'Confirmer' }).click()

  // Le compte a disparu de la liste.
  await expect(ligne(page, IDENT_JETABLE)).toHaveCount(0)

  // …et de la base, compte d'authentification compris.
  const { data: profil } = await admin.from('profils').select('id').eq('id', idJetable).maybeSingle()
  expect(profil).toBeNull()
  const { data: comptes } = await admin.auth.admin.listUsers()
  expect(comptes?.users.some((u) => u.id === idJetable)).toBe(false)

  // ═══ CE QUI SURVIT — LA RAISON D'ÊTRE DU LOT ═══
  const { data: demande, error } = await admin
    .from('demandes_membre')
    .select('demandeur_profil_id, demandeur_nom_affichage')
    .eq('id', idDemande)
    .maybeSingle()
  if (error) throw new Error(`relecture de la demande impossible : ${error.message}`)
  expect(demande, 'la demande doit survivre à son auteur').not.toBeNull()
  expect(demande!.demandeur_profil_id).toBeNull()
  expect(demande!.demandeur_nom_affichage).toBe(NOM_AFFICHAGE_JETABLE)

  // Et la fiche membre est toujours au registre (D161).
  const { data: fiche } = await admin.from('membres').select('id').eq('id', idMembre).maybeSingle()
  expect(fiche).not.toBeNull()
})

test("le bouton n'est proposé ni sur le compte racine ni sur sa propre ligne", async ({ page }) => {
  // Proposer un geste dont on connaît d'avance le refus se lit comme un défaut. Masquer ne
  // protège rien pour autant : les deux refus restent en place côté action.
  await seConnecter(page, IDENT_ADMIN)
  await page.goto('/comptes')

  const { data: racine } = await admin
    .from('profils')
    .select('identifiant')
    .eq('est_racine', true)
    .maybeSingle()
  // PRÉMISSE : sans compte racine, cette assertion ne mesurerait rien.
  expect(racine, 'un compte racine doit exister pour que cette preuve ait un sens').not.toBeNull()

  await expect(
    ligne(page, racine!.identifiant).getByRole('button', { name: 'Supprimer ce compte' }),
  ).toHaveCount(0)
  await expect(
    ligne(page, IDENT_ADMIN).getByRole('button', { name: 'Supprimer ce compte' }),
  ).toHaveCount(0)
})
