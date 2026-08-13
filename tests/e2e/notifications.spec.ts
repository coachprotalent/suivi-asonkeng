import { createClient } from '@supabase/supabase-js'
import { expect, test, type Page } from '@playwright/test'
import { identifiantVersEmail } from '../../src/lib/domaine/identifiant'
import { MESSAGE_ECHEC_NOTIFICATION } from '../../src/app/notifications/messages'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const MDP = `Test-${crypto.randomUUID()}`
const IDENT_A = 'test.e2e.notifications.a'
const IDENT_B = 'test.e2e.notifications.b'

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

async function creerCompte(identifiant: string) {
  const { data, error } = await admin.auth.admin.createUser({
    email: identifiantVersEmail(identifiant),
    password: MDP,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(error?.message)
  const { error: erreurProfil } = await admin
    .from('profils')
    .insert({ id: data.user.id, identifiant, nom_affichage: `Test notifications ${identifiant}` })
  // Erreur d'insertion de préparation VÉRIFIÉE, pas jetée en silence (registre du
  // projet, piège n°2) : un compte auth orphelin sans profil survivrait sinon,
  // introuvable par `supprimerCompte`, qui interroge `profils`.
  if (erreurProfil) {
    await admin.auth.admin.deleteUser(data.user.id)
    throw new Error(`insertion du profil ${identifiant} impossible : ${erreurProfil.message}`)
  }
  return data.user.id
}

test.beforeAll(async () => {
  await supprimerCompte(IDENT_A)
  await supprimerCompte(IDENT_B)
  await creerCompte(IDENT_A)
  await creerCompte(IDENT_B)
})

test.afterAll(async () => {
  await supprimerCompte(IDENT_A)
  await supprimerCompte(IDENT_B)
  const { data: residus } = await admin.from('profils').select('id').in('identifiant', [IDENT_A, IDENT_B])
  expect(residus ?? []).toHaveLength(0)
})

async function connecter(page: Page, identifiant: string) {
  await page.goto('/connexion')
  await page.getByLabel('Identifiant').fill(identifiant)
  await page.getByLabel('Mot de passe').fill(MDP)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page).toHaveURL(/\/tableau-de-bord/)
}

test('la cloche annonce le nombre de notifications non lues, et le marquage les fait disparaître', async ({ page }) => {
  const { data: profilA } = await admin.from('profils').select('id').eq('identifiant', IDENT_A).single()
  await admin.from('notifications').insert([
    { profil_id: profilA!.id, type: 'demande_validee', titre: 'Notification une', corps: 'Corps un' },
    { profil_id: profilA!.id, type: 'demande_rejetee', titre: 'Notification deux', corps: 'Corps deux' },
  ])

  await connecter(page, IDENT_A)

  await expect(page.getByRole('link', { name: /Notifications \(2\)/ })).toBeVisible()

  await page.goto('/notifications')
  await expect(page.getByText('Notification une')).toBeVisible()
  await expect(page.getByText('Notification deux')).toBeVisible()

  await page.getByRole('button', { name: 'Marquer comme lue' }).first().click()
  await expect(page.getByRole('button', { name: 'Marquer comme lue' })).toHaveCount(1)

  await page.goto('/tableau-de-bord')
  await expect(page.getByRole('link', { name: /Notifications \(1\)/ })).toBeVisible()
})

test("un compte ne voit JAMAIS la notification d'un autre compte, cloche comprise", async ({ page }) => {
  const { data: profilA } = await admin.from('profils').select('id').eq('identifiant', IDENT_A).single()
  await admin
    .from('notifications')
    .delete()
    .eq('profil_id', profilA!.id)
  await admin.from('notifications').insert({
    profil_id: profilA!.id,
    type: 'demande_validee',
    titre: 'Notification privée de A',
    corps: 'Corps',
  })

  await connecter(page, IDENT_B)

  await expect(page.getByRole('link', { name: /Notifications \(\d/ })).toHaveCount(0)
  await page.goto('/notifications')
  await expect(page.getByText('Notification privée de A')).toHaveCount(0)
  await expect(page.getByText('Aucune notification.')).toBeVisible()
})

// ═══ I3 DE LA REVUE FINALE DE BRANCHE ═══
//
// `MESSAGE_ECHEC_NOTIFICATION` était LEVÉ par `marquerNotificationLue`, depuis une
// action liée à un `<form action={…}>` NU. Une exception levée là part dans
// `src/app/error.tsx`, dont le texte est STATIQUE et ne lit jamais
// `error.message` : ce message n'avait JAMAIS pu s'afficher, dans aucun mode.
// L'action le RETOURNE désormais, et `FormulaireMarquage` (`useActionState`)
// l'affiche.
//
// LE TEST CONSTATE LE TEXTE À L'ÉCRAN — pas l'absence d'écriture, pas un code
// HTTP. C'est la seule observation qui distingue « le refus est prononcé » de
// « le refus est DIT à la personne », et c'est précisément la seconde qui
// manquait.
test("le refus de marquage ATTEINT L'ÉCRAN (le message n'est plus perdu dans error.tsx)", async ({ page }) => {
  const { data: profilA } = await admin.from('profils').select('id').eq('identifiant', IDENT_A).single()
  await admin.from('notifications').delete().eq('profil_id', profilA!.id)
  const { error: erreurPreparation } = await admin.from('notifications').insert({
    profil_id: profilA!.id,
    type: 'demande_validee',
    titre: 'Notification refus visible',
    corps: 'Corps',
  })
  if (erreurPreparation) throw new Error(`préparation impossible : ${erreurPreparation.message}`)

  await connecter(page, IDENT_A)
  await page.goto('/notifications')
  await expect(page.getByText('Notification refus visible')).toBeVisible()

  // On falsifie le champ caché dans le DOM, comme le fait déjà
  // `tests/e2e/inscription.spec.ts` pour l'antenne : l'identifiant tiré au hasard
  // ne désigne AUCUNE notification, l'`update` ne touche donc aucune ligne — le
  // seul chemin de refus que l'interface légitime ne peut pas produire.
  const inexistant = crypto.randomUUID()
  await page.evaluate((valeur) => {
    document.querySelector<HTMLInputElement>('input[name="notificationId"]')!.value = valeur
  }, inexistant)

  await page.getByRole('button', { name: 'Marquer comme lue' }).click()

  const alerte = page.locator('form p[role="alert"]')
  await expect(alerte).toBeVisible()
  await expect(alerte).toHaveText(MESSAGE_ECHEC_NOTIFICATION)

  // CONTRÔLE : la vraie notification n'a pas été marquée au passage. Sans lui, un
  // refus affiché sur un écran qui aurait quand même écrit resterait invisible.
  const { data: apres } = await admin.from('notifications').select('lu_le').eq('profil_id', profilA!.id)
  expect(apres ?? []).toHaveLength(1)
  expect(apres![0].lu_le).toBeNull()
})

test('la cloche ne rend rien sur /connexion et /inscription (aucune session)', async ({ page }) => {
  await page.goto('/connexion')
  await expect(page.getByText(/Notifications/)).toHaveCount(0)

  await page.goto('/inscription')
  await expect(page.getByText(/Notifications/)).toHaveCount(0)
})

// --- Forge directe de `marquerNotificationLue` -----------------------------
//
// Le test « un compte ne voit JAMAIS la notification d'un autre » ci-dessus ne
// prouve que l'ABSENCE du bouton pour B — pas que le SERVEUR refuserait un
// appel direct si B en forgeait un. `<form action={marquerNotificationLue}>`
// (src/app/notifications/page.tsx) est lié DIRECTEMENT à la Server Action, sans
// `useActionState` : Next.js encode cette référence dans des champs cachés
// `$ACTION_*`, exactement comme `attribuerStatut` (tests/e2e/statuts.spec.ts) et
// `genererToken` (tests/e2e/tokens.spec.ts) — rejouables tels quels depuis une
// session différente. Même motif de forge ici.

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

/**
 * Relève, depuis la session de A déjà connectée sur /notifications, les champs
 * cachés du formulaire « Marquer comme lue » du <li> portant ce titre — y
 * compris `notificationId`, un champ NOMMÉ ordinaire (pas un secret lié à la
 * session), au même titre que `statutId` dans `tests/e2e/autorite.spec.ts`.
 */
async function capturerChampsMarquage(page: Page, titre: string): Promise<Record<string, string>> {
  await page.goto('/notifications')
  const ligne = page.locator('li').filter({ hasText: titre })
  const formulaire = ligne.locator('form').filter({ has: page.getByRole('button', { name: 'Marquer comme lue' }) })
  const champs = extraireChampsCaches(await formulaire.evaluate((el) => el.outerHTML))
  verifierCaptureAction(champs)
  return champs
}

test("un compte ne peut pas marquer lue la notification d'un autre, par appel direct forgé", async ({
  page,
  browser,
  baseURL,
}) => {
  const { data: profilA } = await admin.from('profils').select('id').eq('identifiant', IDENT_A).single()
  await admin.from('notifications').delete().eq('profil_id', profilA!.id)
  const { data: cible, error: erreurPreparation } = await admin
    .from('notifications')
    .insert({
      profil_id: profilA!.id,
      type: 'demande_validee',
      titre: 'Notification forge cible',
      corps: 'Corps',
    })
    .select('id')
    .single()
  if (erreurPreparation || !cible) {
    throw new Error(`préparation de la notification cible impossible : ${erreurPreparation?.message}`)
  }

  await connecter(page, IDENT_A)
  const champs = await capturerChampsMarquage(page, 'Notification forge cible')
  expect(champs.notificationId).toBe(cible.id)

  // Rejeu depuis une session B DISTINCTE : B n'a jamais vu ce formulaire (sa
  // propre liste de notifications est vide), il ne fait que rejouer les champs
  // capturés ci-dessus sous sa propre identité authentifiée.
  const contexteB = await browser.newContext({ baseURL })
  try {
    const pageB = await contexteB.newPage()
    await connecter(pageB, IDENT_B)
    await pageB.request.post('/notifications', { multipart: champs })
  } finally {
    await contexteB.close()
  }

  // Seule assertion qui compte : la notification de A reste NON lue, quel
  // qu'ait été le code HTTP renvoyé par la requête forgée.
  const { data: relue, error: erreurLecture } = await admin
    .from('notifications')
    .select('lu_le')
    .eq('id', cible.id)
    .single()
  expect(erreurLecture).toBeNull()
  expect(relue?.lu_le).toBeNull()
})

test('canari : la même requête forgée réussit depuis le compte propriétaire de la notification', async ({
  page,
  browser,
  baseURL,
}) => {
  // Contrôle POSITIF du mécanisme de forge lui-même (même raisonnement que les
  // canaris de tests/e2e/autorite.spec.ts et tests/e2e/demandes.spec.ts) : si le
  // test précédent passait un jour parce que la capture/le rejeu sont cassés —
  // encodage `$ACTION_*` changé, formulaire remanié — et non parce que le garde
  // `.eq('profil_id', profil.id)` refuse, rien ne le dirait sans ce canari. Ici,
  // EXACTEMENT le même mécanisme, rejoué depuis une session A DISTINCTE (nouveau
  // contexte, nouveaux cookies) : le marquage doit réussir.
  const { data: profilA } = await admin.from('profils').select('id').eq('identifiant', IDENT_A).single()
  await admin.from('notifications').delete().eq('profil_id', profilA!.id)
  const { data: cible, error: erreurPreparation } = await admin
    .from('notifications')
    .insert({
      profil_id: profilA!.id,
      type: 'demande_validee',
      titre: 'Notification forge canari',
      corps: 'Corps',
    })
    .select('id')
    .single()
  if (erreurPreparation || !cible) {
    throw new Error(`préparation de la notification cible impossible : ${erreurPreparation?.message}`)
  }

  await connecter(page, IDENT_A)
  const champs = await capturerChampsMarquage(page, 'Notification forge canari')

  const contexteRejeu = await browser.newContext({ baseURL })
  try {
    const pageRejeu = await contexteRejeu.newPage()
    await connecter(pageRejeu, IDENT_A)
    await pageRejeu.request.post('/notifications', { multipart: champs })
  } finally {
    await contexteRejeu.close()
  }

  await expect(async () => {
    const { data: relue } = await admin.from('notifications').select('lu_le').eq('id', cible.id).single()
    expect(relue?.lu_le).not.toBeNull()
  }).toPass()
})
