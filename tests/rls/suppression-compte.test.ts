import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { identifiantVersEmail } from '@/lib/domaine/identifiant'

/**
 * Phase 8, D157 à D163 — la suppression d'un compte, et ce qui lui survit.
 *
 * ═══ CE QUE CETTE SUITE DOIT ÉTABLIR ═══
 * Supprimer un compte touche, par cascade ou par `set null`, DIX-SEPT clés étrangères
 * (relevé en D163). Les preuves ci-dessous portent sur les trois qui ont un enjeu, et sur
 * elles seules :
 *
 *   • `demandes_membre` — passée de `cascade` à `set null` par cette phase : la demande DOIT
 *     survivre, avec le nom de son auteur (D157, D158) ;
 *   • `notifications` — reste en `cascade`, et c'est VOULU : une notification sans
 *     destinataire n'a aucun sens (D162) ;
 *   • `membres` — la fiche n'est PAS supprimée avec le compte (D161).
 *
 * Plus les refus eux-mêmes (D160).
 *
 * ═══ LES MARQUEURS NE SONT PAS ASSERTÉS, ET C'EST UN CHOIX ═══
 * Les refus passent par `auth.admin.deleteUser`, donc par GoTrue, qui n'expose pas
 * `error.details` de Postgres. On assert sur L'ÉCHEC et sur la PERSISTANCE de ce qui devait
 * être protégé — jamais sur un marqueur qu'on n'a pas les moyens de lire. Écrire
 * `expect(error.details).toBe('compte_racine')` ici produirait un test qui échoue pour la
 * mauvaise raison.
 */

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const CLE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

const MDP = `Test-${crypto.randomUUID()}`
const IDENT_AUTEUR = 'test.rls.suppression.auteur'
const IDENT_ADMIN_A = 'test.rls.suppression.admina'
const IDENT_ADMIN_B = 'test.rls.suppression.adminb'
// Compte marqué `est_racine` FABRIQUÉ PAR LA SUITE : le vrai compte racine n'est jamais visé.
// Voir l'encadré du test correspondant pour pourquoi cette règle existe.
const IDENT_RACINE_FACTICE = 'test.rls.suppression.racine'

const FAMILLE = 'ZZSuppression-'
const SUFFIXE = crypto.randomUUID().slice(0, 8)
const NOM_MEMBRE = `${FAMILLE}fiche-${SUFFIXE}`
const NOM_AFFICHAGE_AUTEUR = 'Test suppression auteur'

const admin = createClient(URL, CLE_SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
})

let idAuteur: string
let idMembre: string

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

async function creerCompte(
  identifiant: string,
  nomAffichage: string,
  roles: string[],
  actif = true,
): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email: identifiantVersEmail(identifiant),
    password: MDP,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`création du compte impossible : ${error?.message}`)
  const id = data.user.id
  const { error: erreurProfil } = await admin
    .from('profils')
    .insert({ id, identifiant, nom_affichage: nomAffichage, actif })
  if (erreurProfil) {
    await admin.auth.admin.deleteUser(id)
    throw new Error(`insertion du profil impossible : ${erreurProfil.message}`)
  }
  for (const role of roles) {
    const { error: erreurRole } = await admin.from('roles_profil').insert({ profil_id: id, role })
    if (erreurRole) {
      await admin.auth.admin.deleteUser(id)
      throw new Error(`attribution du rôle impossible : ${erreurRole.message}`)
    }
  }
  return id
}

/** Le profil existe-t-il encore ? Lu à la clé de service, `error` vérifié. */
async function profilExiste(id: string): Promise<boolean> {
  const { data, error } = await admin.from('profils').select('id').eq('id', id).maybeSingle()
  if (error) throw new Error(`lecture du profil impossible : ${error.message}`)
  return data !== null
}

beforeAll(async () => {
  for (const identifiant of [IDENT_AUTEUR, IDENT_ADMIN_A, IDENT_ADMIN_B, IDENT_RACINE_FACTICE]) {
    await supprimerCompte(identifiant)
  }
  await admin.from('membres').delete().like('nom', `${FAMILLE}%`)

  const { data: membre, error: erreurMembre } = await admin
    .from('membres')
    .insert({ nom: NOM_MEMBRE, prenom: 'Test', etat: 'actif' })
    .select('id')
    .single()
  if (erreurMembre || !membre) throw new Error(`création de la fiche : ${erreurMembre?.message}`)
  idMembre = membre.id

  idAuteur = await creerCompte(IDENT_AUTEUR, NOM_AFFICHAGE_AUTEUR, [])
})

afterAll(async () => {
  for (const identifiant of [IDENT_AUTEUR, IDENT_ADMIN_A, IDENT_ADMIN_B, IDENT_RACINE_FACTICE]) {
    await supprimerCompte(identifiant)
  }
  // Les demandes du décor ne portent plus de profil (c'est le but de la suite) : on les
  // retrouve par leur fiche membre, qui est de la famille.
  const { data: fiches } = await admin.from('membres').select('id').like('nom', `${FAMILLE}%`)
  const ids = (fiches ?? []).map((l) => l.id as string)
  if (ids.length > 0) {
    await admin.from('demandes_membre').delete().in('membre_id', ids)
  }
  await admin.from('membres').delete().like('nom', `${FAMILLE}%`)

  const { count, error } = await admin
    .from('membres')
    .select('id', { count: 'exact', head: true })
    .like('nom', `${FAMILLE}%`)
  expect(error).toBeNull()
  expect(count).toBe(0)
})

describe('le nom du demandeur est figé à l’insertion (D158)', () => {
  it('capture le nom du profil auteur', async () => {
    const { data, error } = await admin
      .from('demandes_membre')
      .insert({ origine: 'demande_suivi', demandeur_profil_id: idAuteur, membre_id: idMembre })
      .select('id, demandeur_nom_affichage')
      .single()
    expect(error).toBeNull()
    expect(data?.demandeur_nom_affichage).toBe(NOM_AFFICHAGE_AUTEUR)

    await admin.from('demandes_membre').delete().eq('id', data!.id)
  })

  it("n'écrase PAS un nom déjà fourni", async () => {
    // Le déclencheur laisse une porte à une reprise de données ou à un import, sans avoir à
    // connaître ces cas.
    const { data, error } = await admin
      .from('demandes_membre')
      .insert({
        origine: 'demande_suivi',
        demandeur_profil_id: idAuteur,
        membre_id: idMembre,
        demandeur_nom_affichage: 'Fourni à la main',
      })
      .select('id, demandeur_nom_affichage')
      .single()
    expect(error).toBeNull()
    expect(data?.demandeur_nom_affichage).toBe('Fourni à la main')

    await admin.from('demandes_membre').delete().eq('id', data!.id)
  })
})

describe('ce qui survit à la suppression du compte (D157, D161, D162)', () => {
  it('la demande SURVIT, avec son nom, et son profil passe à null', async () => {
    // ═══ LA PREUVE CENTRALE DU LOT ═══
    // Avant cette phase, `demandeur_profil_id` était en `on delete cascade` : cette ligne
    // aurait disparu EN SILENCE avec le compte, et l'historique de qui a proposé qui avec
    // elle.
    const { data: demande, error: erreurDemande } = await admin
      .from('demandes_membre')
      .insert({ origine: 'demande_suivi', demandeur_profil_id: idAuteur, membre_id: idMembre })
      .select('id')
      .single()
    if (erreurDemande || !demande) throw new Error(`insertion : ${erreurDemande?.message}`)

    // Une notification pour le même compte : elle, doit DISPARAÎTRE (D162).
    const { error: erreurNotif } = await admin.from('notifications').insert({
      profil_id: idAuteur,
      type: 'demande_validee',
      titre: 'Notification de test',
      corps: 'Corps',
    })
    expect(erreurNotif).toBeNull()

    const { error: erreurSuppression } = await admin.auth.admin.deleteUser(idAuteur)
    expect(erreurSuppression).toBeNull()
    expect(await profilExiste(idAuteur)).toBe(false)

    // D157 — la demande est TOUJOURS LÀ, sans auteur mais avec son nom.
    const { data: apres, error: erreurApres } = await admin
      .from('demandes_membre')
      .select('demandeur_profil_id, demandeur_nom_affichage')
      .eq('id', demande.id)
      .maybeSingle()
    expect(erreurApres).toBeNull()
    expect(apres).not.toBeNull()
    expect(apres!.demandeur_profil_id).toBeNull()
    expect(apres!.demandeur_nom_affichage).toBe(NOM_AFFICHAGE_AUTEUR)

    // D162 — la notification, elle, a disparu. C'est le SEUL `cascade` qu'on laisse agir :
    // une notification est adressée à une personne et n'a aucun sens sans destinataire.
    const { count: notifs, error: erreurNotifs } = await admin
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('profil_id', idAuteur)
    expect(erreurNotifs).toBeNull()
    expect(notifs).toBe(0)

    // D161 — la FICHE MEMBRE subsiste. Compte et fiche sont deux objets distincts ; les
    // confondre effacerait une personne du suivi pour une erreur de compte.
    const { data: fiche } = await admin.from('membres').select('id').eq('id', idMembre).maybeSingle()
    expect(fiche).not.toBeNull()
  })
})

describe('les refus de suppression (D160)', () => {
  it('refuse la suppression d’un compte marqué racine', async () => {
    /*
      ═══════════════════════════════════════════════════════════════════════════════════
      ⚠️ CE TEST FABRIQUE SON PROPRE COMPTE RACINE. IL NE TOUCHE JAMAIS AU VRAI.
      ═══════════════════════════════════════════════════════════════════════════════════

      SA PREMIÈRE VERSION VISAIT LE COMPTE RACINE RÉEL, lu par `.eq('est_racine', true)`, et
      tentait de le supprimer pour vérifier le refus. Écrite en TDD, elle a été exécutée
      AVANT que le déclencheur de protection n'existe — c'était le but de l'étape « rouge ».

      LA SUPPRESSION A RÉUSSI. Le compte racine du projet a été détruit, sur une base qui
      sert aussi de PRODUCTION (README §« Attention »). Il a fallu le recréer par
      `npm run amorcer:racine`. Les dégâts collatéraux ont été mesurés et sont restés
      circonscrits — 73 fiches, 132 lignes de journal et 132 statuts intacts, aucune demande
      ni notification en base à ce moment-là — mais c'est une chance, pas une garantie.

      LA LEÇON, ET ELLE EST STRUCTURELLE : une étape « rouge » de TDD exécute le geste
      destructeur PAR CONSTRUCTION. Un test de refus ne doit donc JAMAIS viser une donnée
      qu'il n'a pas lui-même créée — sinon, entre l'écriture du test et celle de la
      protection, il EST l'attaque qu'il prétend éprouver.

      `est_racine` ne porte aucune contrainte d'unicité : un second compte marqué racine est
      donc parfaitement créable, et c'est ce qu'on fait ici. Le nettoyage retire le drapeau
      AVANT de supprimer, sans quoi le déclencheur refuserait aussi ce nettoyage-là et la
      suite laisserait un résidu indestructible derrière elle.
    */
    const idFauxRacine = await creerCompte(IDENT_RACINE_FACTICE, 'Test racine factice', [])
    const { error: erreurDrapeau } = await admin
      .from('profils')
      .update({ est_racine: true })
      .eq('id', idFauxRacine)
      .select('id')
    expect(erreurDrapeau).toBeNull()

    try {
      const { error } = await admin.auth.admin.deleteUser(idFauxRacine)
      expect(error).not.toBeNull()
      // On assert sur la PERSISTANCE, jamais sur `error.details` : GoTrue n'expose pas le
      // diagnostic Postgres, et l'asserter ferait échouer ce test pour la mauvaise raison.
      expect(await profilExiste(idFauxRacine)).toBe(true)
    } finally {
      // Retirer le drapeau AVANT de supprimer : le déclencheur refuserait sinon ce
      // nettoyage aussi, et ce compte de test deviendrait indestructible.
      await admin.from('profils').update({ est_racine: false }).eq('id', idFauxRacine)
      await admin.auth.admin.deleteUser(idFauxRacine)
    }
  })

  it('LE VRAI COMPTE RACINE EXISTE TOUJOURS, et cette suite ne l’a pas touché', async () => {
    // GARDE-FOU, ajouté après l'incident décrit ci-dessus. Il ne prouve rien du code : il
    // prouve que CETTE SUITE n'a pas détruit le compte racine du projet. Si elle le fait un
    // jour, on l'apprend ici et non trois heures plus tard.
    const { data, error } = await admin
      .from('profils')
      .select('identifiant')
      .eq('est_racine', true)
    expect(error).toBeNull()
    expect(data, 'le compte racine du projet doit exister').toHaveLength(1)
  })

  it("supprime un administrateur SANS refus tant qu'un autre reste actif", async () => {
    /*
      ═══ CE TEST NE MESURE PAS LE REFUS, ET SON NOM LE DIT ═══

      Le refus porte sur `prive.compter_administrateurs_actifs(old.id) = 0`, qui compte TOUS
      les administrateurs actifs de la base — y compris les comptes RÉELS du projet. Tant
      qu'il en existe un seul, ce compte n'est jamais nul : le refus est INATTEIGNABLE depuis
      cette suite.

      LE RENDRE ATTEIGNABLE EXIGERAIT DE DÉSACTIVER LES ADMINISTRATEURS RÉELS, sur une base
      qui sert aussi de PRODUCTION (README §« Attention »). Une suite interrompue entre la
      désactivation et son `finally` laisserait le projet sans aucun administrateur actif —
      un prix sans commune mesure avec le bénéfice, et exactement le genre de manœuvre que
      ce dépôt refuse ailleurs.

      CE QUI COUVRE RÉELLEMENT CE REFUS, ET QU'ON NE PRÉTEND PAS REMPLACER ICI : la même
      condition, sur la même primitive, est déjà éprouvée pour `public.definir_roles` et
      `public.definir_actif_compte` par `tests/rls/comptes.test.ts` et
      `tests/rls/archivage-comptes.test.ts` — là où elle est atteignable parce que la
      rétrogradation n'exige pas de toucher aux autres comptes.

      Ce test-ci mesure donc l'autre moitié, celle qui est vérifiable sans risque : un
      administrateur se supprime NORMALEMENT quand d'autres restent actifs. Sans lui, le
      refus du compte racine ci-dessus passerait aussi si TOUTE suppression était refusée.
    */
    const idAdminA = await creerCompte(IDENT_ADMIN_A, 'Test admin A', ['administrateur'])
    const { error } = await admin.auth.admin.deleteUser(idAdminA)
    expect(error).toBeNull()
    expect(await profilExiste(idAdminA)).toBe(false)
  })

  it('accepte la suppression d’un compte ordinaire', async () => {
    const id = await creerCompte(IDENT_ADMIN_B, 'Test ordinaire', [])
    const { error } = await admin.auth.admin.deleteUser(id)
    expect(error).toBeNull()
    expect(await profilExiste(id)).toBe(false)

    // Le compte d'AUTHENTIFICATION a disparu lui aussi : c'est lui qu'on supprime, et le
    // profil suit par cascade. L'inverse laisserait un orphelin.
    const { data: comptes } = await admin.auth.admin.listUsers()
    expect(comptes?.users.some((u) => u.id === id)).toBe(false)
  })
})
