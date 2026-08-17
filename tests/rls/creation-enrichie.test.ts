import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const IDENT_SIMPLE = 'test.rls.creation.simple'
const MDP_SIMPLE = `Test-${crypto.randomUUID()}`
// L'AUTEUR DES ÉCRITURES DE CETTE SUITE, PAR IDENTIFIANT DÉDIÉ — jamais un profil pris au
// hasard en base. `profilAdminId` alimente `p_par`, donc `membres.cree_par` ET
// `journal_statuts.par_profil_id` de chaque fiche créée par ce fichier (une dizaine par
// exécution). `admin.from('profils').select('id').limit(1)`, sans `order` ni filtre,
// rendait `racine` (mesuré contre la base liée par la revue de la Task 7 : trois profils
// en base, aucun tri, et c'est celui-là qui sortait) — polluant son `cree_par` et son
// `journal_statuts` en production à chaque lancement. Défaut de la même famille que celle
// que ce projet traque depuis la phase 2b (« polluer racine sans le toucher »).
// TOUS LES AUTRES FICHIERS `tests/rls/*.ts` résolvent leur auteur par un identifiant
// dédié (`ael.test.ts`, `arbre.test.ts`, `archivage-comptes.test.ts`, `comptes.test.ts`) ;
// ce fichier reprend exactement ce motif.
const IDENT_AUTEUR = 'test.rls.creation.auteur'
const MDP_AUTEUR = `Test-${crypto.randomUUID()}`

// PRÉFIXE DE FAMILLE STABLE : ce qu'une exécution interrompue laisse derrière elle doit
// rester retrouvable par la suivante. Le suffixe aléatoire ne sert qu'à ne jamais
// collisionner avec un résidu.
const PREFIXE_FAMILLE = 'ZZCreationEnrichie-'
const PREFIXE = `${PREFIXE_FAMILLE}${crypto.randomUUID().slice(0, 8)}`

let clientSimple: SupabaseClient
let profilAdminId: string
let idFaiseurArchive: string
let idFaiseurEnAttente: string
let statutExclusifA: string
let statutExclusifB: string
let statutCumulable: string

/** Arguments complets de la passerelle. Nommés, JAMAIS positionnels. */
function argumentsCreation(surcharges: Record<string, unknown> = {}) {
  return {
    p_nom: `${PREFIXE}-${crypto.randomUUID().slice(0, 8)}`,
    p_prenom: 'Test',
    p_telephone: null,
    p_email_contact: null,
    p_ville: null,
    p_pays: null,
    p_antenne_id: null,
    p_situation: null,
    p_domaine_etude: null,
    p_report_initial_ael: 0,
    // Phase 7, D130 : une colonne de la FICHE, placée avec les colonnes de fiche et non
    // avec les trois paramètres d'arbre qui suivent. Le défaut est `null` — le contact est
    // facultatif, comme les trois enrichissements de D86.
    p_contact: null,
    p_faiseur_de_disciple: null,
    p_dirigeant: null,
    p_dirigeant_force: false,
    p_statuts: [],
    p_par: profilAdminId,
    ...surcharges,
  }
}

async function compterMembresDuPrefixe(): Promise<number> {
  const { count, error } = await admin
    .from('membres')
    .select('id', { count: 'exact', head: true })
    .like('nom', `${PREFIXE_FAMILLE}%`)
  if (error) throw new Error(`comptage des membres impossible : ${error.message}`)
  if (count === null) throw new Error('comptage absent de la réponse PostgREST')
  return count
}

/**
 * Lignes de `journal_statuts` portées par les fiches DE CETTE FAMILLE DE PRÉFIXE.
 *
 * DEUX RAISONS, ET AUCUNE N'EST DÉCORATIVE.
 *
 * 1. L'ERREUR EST VÉRIFIÉE, ET UN `count` ABSENT LÈVE. Un comptage écrit
 *    `const { count } = await …` sans vérifier `error` rend `null` sur échec ; comparer
 *    `null` à `null` fait PASSER l'assertion de delta, et le test devient un contrôle qui
 *    ne peut plus échouer. Même discipline que `compterMembresDuPrefixe` ci-dessus.
 * 2. LE DELTA EST RESTREINT AU PRÉFIXE, JAMAIS GLOBAL. Un comptage global filtré sur
 *    `statut_id` porterait sur TOUTE la base : le groupe exclusif amorcé est celui du
 *    « Cheminement », soit exactement les statuts qu'attribue `tests/e2e/statuts.spec.ts`.
 *    Un lancement concurrent de `test:e2e` produirait alors un faux échec, pour une raison
 *    étrangère à ce qu'on éprouve.
 *
 * `.in('membre_id', [])` sur une famille vide rend 0, ce qui est la bonne réponse : sans
 * fiche du préfixe, il ne peut y avoir aucune ligne de journal du préfixe.
 */
async function compterJournalDuPrefixe(): Promise<number> {
  const { data: fiches, error: erreurFiches } = await admin
    .from('membres')
    .select('id')
    .like('nom', `${PREFIXE_FAMILLE}%`)
  if (erreurFiches) throw new Error(`lecture des fiches du préfixe impossible : ${erreurFiches.message}`)
  const ids = (fiches ?? []).map((ligne) => ligne.id as string)

  const { count, error } = await admin
    .from('journal_statuts')
    .select('id', { count: 'exact', head: true })
    .in('membre_id', ids)
  if (error) throw new Error(`comptage du journal impossible : ${error.message}`)
  if (count === null) throw new Error('comptage absent de la réponse PostgREST')
  return count
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

/** Deux statuts ACTIFS d'un même groupe EXCLUSIF, et un statut d'un groupe qui ne l'est
 *  pas. Lus en base, jamais devinés : le catalogue amorcé peut changer. */
async function reperersStatuts() {
  const { data, error } = await admin
    .from('groupes_statut')
    .select('id, exclusif, statuts(id, actif)')
  if (error) throw new Error(`lecture du catalogue impossible : ${error.message}`)

  type Groupe = { id: string; exclusif: boolean; statuts: Array<{ id: string; actif: boolean }> }
  const groupes = (data ?? []) as unknown as Groupe[]

  const exclusif = groupes.find((g) => g.exclusif && g.statuts.filter((s) => s.actif).length >= 2)
  if (!exclusif) {
    throw new Error(
      "aucun groupe exclusif ne porte deux statuts actifs : la preuve du couple exclusif ne peut pas être faite, et la faire passer sans elle serait un mensonge",
    )
  }
  const actifs = exclusif.statuts.filter((s) => s.actif)
  statutExclusifA = actifs[0].id
  statutExclusifB = actifs[1].id

  const cumulable = groupes.find((g) => !g.exclusif && g.statuts.some((s) => s.actif))
  // Pas d'échec ici : un catalogue sans groupe cumulable est concevable. Le seul test qui
  // s'en sert le saute explicitement.
  statutCumulable = cumulable ? cumulable.statuts.filter((s) => s.actif)[0].id : ''
}

beforeAll(async () => {
  await admin.from('membres').delete().like('nom', `${PREFIXE_FAMILLE}%`)
  await supprimerCompte(IDENT_SIMPLE)
  await supprimerCompte(IDENT_AUTEUR)

  // Le profil auteur : `p_par` alimente `cree_par` et `journal_statuts.par_profil_id`.
  // Un compte DÉDIÉ, créé pour cette suite et par elle — jamais un profil pris au hasard
  // en base (voir le commentaire de `IDENT_AUTEUR` en tête de fichier : cette lecture
  // rendait `racine` avant ce correctif). `p_par` exige seulement une clé étrangère
  // valide vers `profils`, pas un rôle particulier : un compte simple suffit.
  const { data: compteAuteur, error: erreurCompteAuteur } = await admin.auth.admin.createUser({
    email: `${IDENT_AUTEUR}@asonkeng.local`,
    password: MDP_AUTEUR,
    email_confirm: true,
  })
  if (erreurCompteAuteur || !compteAuteur.user) {
    throw new Error(`création du compte auteur impossible : ${erreurCompteAuteur?.message}`)
  }
  const { error: erreurProfilAuteur } = await admin
    .from('profils')
    .insert({ id: compteAuteur.user.id, identifiant: IDENT_AUTEUR, nom_affichage: 'Test création (auteur)' })
  if (erreurProfilAuteur) throw new Error(`insertion du profil auteur impossible : ${erreurProfilAuteur.message}`)
  profilAdminId = compteAuteur.user.id

  const { data: archive, error: erreurArchive } = await admin
    .from('membres')
    .insert({ nom: `${PREFIXE}-faiseur-archive`, prenom: 'Test', etat: 'archive' })
    .select('id')
    .single()
  if (erreurArchive || !archive) {
    throw new Error(`création du faiseur archivé impossible : ${erreurArchive?.message}`)
  }
  idFaiseurArchive = archive.id as string

  // Un faiseur EN ATTENTE. `public.etat_membre` a TROIS valeurs, pas deux, et
  // l'arborescence exclut `en_attente` exactement comme `archive` : un faiseur en attente
  // rendrait toute sa descendance active inatteignable depuis la liste des racines.
  const { data: enAttente, error: erreurEnAttente } = await admin
    .from('membres')
    .insert({ nom: `${PREFIXE}-faiseur-en-attente`, prenom: 'Test', etat: 'en_attente' })
    .select('id')
    .single()
  if (erreurEnAttente || !enAttente) {
    throw new Error(`création du faiseur en attente impossible : ${erreurEnAttente?.message}`)
  }
  idFaiseurEnAttente = enAttente.id as string

  await reperersStatuts()

  const { data: compte, error: erreurCompte } = await admin.auth.admin.createUser({
    email: `${IDENT_SIMPLE}@asonkeng.local`,
    password: MDP_SIMPLE,
    email_confirm: true,
  })
  if (erreurCompte || !compte.user) {
    throw new Error(`création du compte simple impossible : ${erreurCompte?.message}`)
  }
  const { error: erreurInsertion } = await admin
    .from('profils')
    .insert({ id: compte.user.id, identifiant: IDENT_SIMPLE, nom_affichage: 'Test création' })
  if (erreurInsertion) throw new Error(`insertion du profil impossible : ${erreurInsertion.message}`)

  clientSimple = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error: erreurConnexion } = await clientSimple.auth.signInWithPassword({
    email: `${IDENT_SIMPLE}@asonkeng.local`,
    password: MDP_SIMPLE,
  })
  if (erreurConnexion) throw new Error(`connexion impossible : ${erreurConnexion.message}`)
})

afterAll(async () => {
  // Suppression EN VRAC PAR PRÉFIXE : elle prend disciples et faiseurs ensemble, ce qui
  // évite le piège de `on delete set null` — supprimer un faiseur d'abord détacherait ses
  // disciples EN SILENCE et en ferait des racines, qu'on ne retrouverait plus.
  // `membre_statuts` et `journal_statuts` partent en cascade avec la fiche.
  await admin.from('membres').delete().like('nom', `${PREFIXE_FAMILLE}%`)
  await supprimerCompte(IDENT_SIMPLE)
  await supprimerCompte(IDENT_AUTEUR)

  // COMPTAGE DE CONTRÔLE INDÉPENDANT du balayage : l'absence d'erreur au `delete` ne
  // prouve rien — un `delete` qui ne touche aucune ligne ne rend aucune erreur.
  expect(await compterMembresDuPrefixe()).toBe(0)
  const { data: residus, error: erreurResidus } = await admin
    .from('profils')
    .select('id')
    .in('identifiant', [IDENT_SIMPLE, IDENT_AUTEUR])
  // `error` VÉRIFIÉ, et assertion SANS `?? []` : sur échec de lecture, `data` vaut `null`,
  // et `residus ?? []` convertirait la panne en « aucun résidu ». Toute la valeur de ce
  // contrôle est d'être INDÉPENDANT du balayage ; un contrôle qui ne peut plus échouer ne
  // l'est plus de rien.
  if (erreurResidus) throw new Error(`lecture des profils résiduels impossible : ${erreurResidus.message}`)
  expect(residus).toHaveLength(0)
})

// ───────────────────────────────────────────────────────────────────────────────
// PREUVE N°3 — `revoke execute`, avec son contrôle positif
// ───────────────────────────────────────────────────────────────────────────────

describe('exécution de public.creer_membre_enrichi réservée à service_role', () => {
  it("la refuse à un compte authentifié ordinaire, et n'écrit rien", async () => {
    const avant = await compterMembresDuPrefixe()
    const { error } = await clientSimple.rpc('creer_membre_enrichi', argumentsCreation())
    expect(error).not.toBeNull()
    // DELTA, jamais un absolu : la base sert aussi de production.
    expect(await compterMembresDuPrefixe()).toBe(avant)
  })

  // CONTRÔLE POSITIF : sans lui, le refus ci-dessus serait aussi satisfait par une
  // fonction qui n'existe pas, ou par un appel mal formé.
  it('service_role réussit le MÊME appel', async () => {
    const avant = await compterMembresDuPrefixe()
    const { data, error } = await admin.rpc('creer_membre_enrichi', argumentsCreation())
    expect(error).toBeNull()
    expect(typeof data).toBe('string')
    expect(await compterMembresDuPrefixe()).toBe(avant + 1)
  })
})

// ───────────────────────────────────────────────────────────────────────────────
// PREUVE N°4 — une création NUE est identique à l'ancienne (D86)
// C'est la preuve qui AUTORISE D87 ; sans elle, le remplacement serait un pari.
// ───────────────────────────────────────────────────────────────────────────────

describe('création nue, sans aucun enrichissement', () => {
  it('produit exactement ce que creerMembre produisait — colonne par colonne', async () => {
    const { data: identifiant, error } = await admin.rpc(
      'creer_membre_enrichi',
      argumentsCreation(),
    )
    expect(error).toBeNull()

    const { data: fiche, error: erreurLecture } = await admin
      .from('membres')
      .select('etat, faiseur_de_disciple_id, dirigeant_id, dirigeant_force, cree_par')
      .eq('id', identifiant)
      .single()
    if (erreurLecture) throw new Error(`lecture de la fiche impossible : ${erreurLecture.message}`)

    expect(fiche?.etat).toBe('actif')
    expect(fiche?.faiseur_de_disciple_id).toBeNull()
    expect(fiche?.dirigeant_id).toBeNull()
    expect(fiche?.dirigeant_force).toBe(false)
    expect(fiche?.cree_par).toBe(profilAdminId)

    const { count: statuts } = await admin
      .from('membre_statuts')
      .select('statut_id', { count: 'exact', head: true })
      .eq('membre_id', identifiant)
    expect(statuts).toBe(0)

    const { count: journal } = await admin
      .from('journal_statuts')
      .select('id', { count: 'exact', head: true })
      .eq('membre_id', identifiant)
    expect(journal).toBe(0)
  })

  // D86 : les trois enrichissements sont INDÉPENDANTS. Un dirigeant SANS faiseur de
  // disciple est légitime — le §4.2 le prévoit, `dirigeantPropose` rend `null` et
  // l'administrateur force une valeur.
  it('accepte un dirigeant SANS faiseur de disciple', async () => {
    const { data: autre, error: erreurAutre } = await admin
      .from('membres')
      .insert({ nom: `${PREFIXE}-dirigeant`, prenom: 'Test' })
      .select('id')
      .single()
    if (erreurAutre || !autre) throw new Error(`préparation impossible : ${erreurAutre?.message}`)

    const { data: identifiant, error } = await admin.rpc(
      'creer_membre_enrichi',
      argumentsCreation({ p_dirigeant: autre.id, p_dirigeant_force: true }),
    )
    expect(error).toBeNull()

    const { data: fiche } = await admin
      .from('membres')
      .select('faiseur_de_disciple_id, dirigeant_id, dirigeant_force')
      .eq('id', identifiant)
      .single()
    expect(fiche?.faiseur_de_disciple_id).toBeNull()
    expect(fiche?.dirigeant_id).toBe(autre.id)
    expect(fiche?.dirigeant_force).toBe(true)
  })

  // D86, l'autre sens : des statuts SANS place dans l'arbre.
  it('accepte des statuts SANS faiseur de disciple ni dirigeant', async () => {
    const { data: identifiant, error } = await admin.rpc(
      'creer_membre_enrichi',
      argumentsCreation({
        p_statuts: [{ statut_id: statutExclusifA, date_acquisition: '2020-01-02', note: 'preuve' }],
      }),
    )
    expect(error).toBeNull()

    const { data: porte } = await admin
      .from('membre_statuts')
      .select('statut_id, date_acquisition, note')
      .eq('membre_id', identifiant)
    expect(porte).toHaveLength(1)
    expect(porte?.[0]?.statut_id).toBe(statutExclusifA)
    // La date et la note traversent le `jsonb` INTACTES : sans ces deux assertions, une
    // clé mal orthographiée passerait pour un succès en laissant deux colonnes nulles —
    // exactement le mode de défaillance que le typage de `jsonb_to_recordset` ferme.
    expect(porte?.[0]?.date_acquisition).toBe('2020-01-02')
    expect(porte?.[0]?.note).toBe('preuve')

    const { data: journal } = await admin
      .from('journal_statuts')
      .select('action')
      .eq('membre_id', identifiant)
    expect(journal).toHaveLength(1)
    expect(journal?.[0]?.action).toBe('ajout')
  })
})

// ───────────────────────────────────────────────────────────────────────────────
// PHASE 7, D130 / D135 — LE CONTACT SAISI À LA CRÉATION
// ───────────────────────────────────────────────────────────────────────────────
//
// Le contact est une colonne de la FICHE, écrite dans l'`insert` initial. Il n'entre PAS
// dans la condition d'appel à `public.definir_arbre` : c'est ce que mesure la deuxième
// preuve ci-dessous, et ce n'est pas un détail d'implémentation. Si le contact entrait dans
// cette condition, une création « contact seul » prendrait le verrou consultatif anti-cycle
// et réécrirait trois `null` déjà en place — un coût et un risque pour rien.
describe('le contact à la création (D130)', () => {
  it('écrit le contact passé à la création', async () => {
    const { data: contact, error: erreurContact } = await admin
      .from('membres')
      .insert({ nom: `${PREFIXE}-contact`, prenom: 'Test' })
      .select('id')
      .single()
    if (erreurContact || !contact) throw new Error(`préparation impossible : ${erreurContact?.message}`)

    const { data: identifiant, error } = await admin.rpc(
      'creer_membre_enrichi',
      argumentsCreation({ p_contact: contact.id }),
    )
    expect(error).toBeNull()

    const { data: fiche, error: erreurLecture } = await admin
      .from('membres')
      .select('contact_id')
      .eq('id', identifiant)
      .single()
    if (erreurLecture) throw new Error(`lecture de la fiche impossible : ${erreurLecture.message}`)
    expect(fiche?.contact_id).toBe(contact.id)
  })

  it("un contact SEUL ne place PAS la fiche dans l'arbre (D130)", async () => {
    // LA PREUVE QUI DISTINGUE « colonne de fiche » DE « relation d'arbre ». Une création
    // avec un contact et RIEN d'autre doit laisser les trois colonnes d'arbre intactes.
    // Si le contact avait été rangé avec le faiseur de disciple et le dirigeant, la
    // condition d'appel à `definir_arbre` se déclencherait ici — sans effet visible sur ces
    // trois colonnes, mais en prenant le verrou consultatif pour rien.
    const { data: contact, error: erreurContact } = await admin
      .from('membres')
      .insert({ nom: `${PREFIXE}-contact-seul`, prenom: 'Test' })
      .select('id')
      .single()
    if (erreurContact || !contact) throw new Error(`préparation impossible : ${erreurContact?.message}`)

    const { data: identifiant, error } = await admin.rpc(
      'creer_membre_enrichi',
      argumentsCreation({ p_contact: contact.id }),
    )
    expect(error).toBeNull()

    const { data: fiche } = await admin
      .from('membres')
      .select('contact_id, faiseur_de_disciple_id, dirigeant_id, dirigeant_force')
      .eq('id', identifiant)
      .single()
    expect(fiche?.contact_id).toBe(contact.id)
    expect(fiche?.faiseur_de_disciple_id).toBeNull()
    expect(fiche?.dirigeant_id).toBeNull()
    expect(fiche?.dirigeant_force).toBe(false)
  })

  it('crée une fiche sans contact quand p_contact vaut null', async () => {
    const { data: identifiant, error } = await admin.rpc('creer_membre_enrichi', argumentsCreation())
    expect(error).toBeNull()

    const { data: fiche } = await admin
      .from('membres')
      .select('contact_id')
      .eq('id', identifiant)
      .single()
    expect(fiche?.contact_id).toBeNull()
  })

  it("AUCUNE SURCHARGE NE SUBSISTE : l'ancienne signature à 15 paramètres n'existe plus (D135)", async () => {
    // ═══ LA PREUVE QUE LE `drop` A BIEN EU LIEU, ET ELLE EST PERMANENTE ═══
    // `create or replace function` ne peut pas changer une signature : sans `drop`, la
    // migration aurait créé une SURCHARGE. Les deux fonctions auraient coexisté, PostgREST
    // aurait choisi l'ancienne pour tout appelant ne passant pas `p_contact`, et un contact
    // saisi aurait disparu EN SILENCE — sans qu'aucune autre preuve de ce fichier ne tombe,
    // puisqu'elles passent toutes `p_contact` désormais.
    //
    // Une vérification manuelle dans `pg_proc` aurait répondu une fois, le jour de la
    // migration. Celle-ci répond à chaque exécution de la suite.
    const avant = await compterMembresDuPrefixe()
    const { p_contact: _ignore, ...ancienneSignature } = argumentsCreation()
    const { error } = await admin.rpc('creer_membre_enrichi', ancienneSignature)
    expect(error).not.toBeNull()
    // `PGRST202` : aucune fonction ne correspond à ce jeu d'arguments nommés.
    expect(error!.code).toBe('PGRST202')
    // Et rien n'a été créé par une surcharge silencieuse.
    expect(await compterMembresDuPrefixe()).toBe(avant)
  })

  it("refuse un contact inexistant, et ne crée RIEN (atomicité, D81)", async () => {
    const avant = await compterMembresDuPrefixe()
    const { error } = await admin.rpc(
      'creer_membre_enrichi',
      argumentsCreation({ p_contact: crypto.randomUUID() }),
    )
    expect(error).not.toBeNull()
    // `23503` : violation de clé étrangère. On discrimine sur le CODE — le nom de la
    // contrainte n'apparaît que dans la prose anglaise de Postgres, dont on ne discrimine
    // jamais. C'est précisément pourquoi l'application s'appuie sur un contrôle amont
    // (D136) pour nommer ce cas à l'utilisateur.
    expect(error!.code).toBe('23503')
    // L'atomicité de D81 tient aussi pour cette cause-ci : la fiche insérée juste avant
    // l'échec ne subsiste pas.
    expect(await compterMembresDuPrefixe()).toBe(avant)
  })
})

// ───────────────────────────────────────────────────────────────────────────────
// PREUVE N°2 — LA COMPOSITION N'A PAS ÉTÉ REMPLACÉE PAR UNE COPIE (D82),
// prouvée PAR LE COMPORTEMENT : les vérifications des passerelles APPELÉES mordent
// bien à travers la nouvelle porte, et AUCUNE fiche ne subsiste.
// ───────────────────────────────────────────────────────────────────────────────

describe('les gardes des passerelles appelées mordent à travers la nouvelle porte', () => {
  // ⚠️ NON DISCRIMINANT (I1 de la revue de la Task 5-7), SIGNALÉ ICI POUR QU'IL NE SOIT
  // PLUS JAMAIS RECOMPTÉ COMME UNE PREUVE DE COMPOSITION. Le marqueur
  // `faiseur_de_disciple_archive` est posé par DEUX mécanismes au texte identique : la
  // passerelle `definir_arbre` (`p_faiseur_de_disciple is not null` puis lecture de
  // l'état) ET le déclencheur `membres_faiseur_de_disciple_archive`
  // (20260814150000), qui mord sur TOUT `insert`/`update` de `faiseur_de_disciple_id`,
  // qu'il passe par la passerelle ou par un `update` DIRECT — le test
  // « refuse le même rattachement par un INSERT DIRECT » plus bas le démontre lui-même en
  // obtenant CE MÊME marqueur sans passer par `definir_arbre`. Un `creer_membre_enrichi`
  // qui aurait été récrit pour écrire `faiseur_de_disciple_id` par un `insert` direct au
  // lieu d'appeler `definir_arbre` laisserait ce test VERT quand même — le déclencheur
  // suffit à produire le marqueur. Ce test éprouve donc que LA BARRIÈRE tient (utile en
  // soi), pas que la COMPOSITION tient. Les deux marqueurs qui discriminent réellement
  // `definir_arbre` sont `faiseur_inconnu` et `dirigeant_inconnu`, juste en dessous : ils
  // n'existent QUE dans cette fonction, et un `insert`/`update` direct sur une clé
  // étrangère absente rendrait `23503`, pas ce marqueur. Voir aussi le fil-piège
  // `pg_get_functiondef` (rapport de la Task 8-10), seule vérification qui sépare
  // vraiment l'appel de la recopie.
  it('refuse un faiseur de disciple ARCHIVÉ, et ne laisse AUCUNE fiche', async () => {
    const avant = await compterMembresDuPrefixe()
    const { error } = await admin.rpc(
      'creer_membre_enrichi',
      argumentsCreation({ p_faiseur_de_disciple: idFaiseurArchive }),
    )
    expect(error).not.toBeNull()
    // LE MARQUEUR, pas la prose : c'est lui qui identifie la barrière atteinte.
    expect(error?.details).toBe('faiseur_de_disciple_archive')
    // ET RIEN N'A PERSISTÉ.
    //
    // CE QUE CETTE ASSERTION FERME EXACTEMENT, ET RIEN DE PLUS. Elle ne prouve PAS
    // l'atomicité : un `select public.creer_membre_enrichi(…)` via PostgREST est une seule
    // instruction dans une transaction implicite, donc une exception annule de toute façon
    // l'insertion. Ce qu'elle ferme est le SEUL mode de défaillance réel qui reste ici :
    // un `exception when others` ajouté un jour dans le corps, qui avalerait le refus et
    // laisserait la fiche derrière lui. Coût nul, valeur réelle — mais l'atomicité, elle,
    // est prouvée par la mutation de l'étape 4, et par elle seule.
    expect(await compterMembresDuPrefixe()).toBe(avant)
  })

  it('refuse un faiseur de disciple INCONNU, et ne laisse AUCUNE fiche', async () => {
    const avant = await compterMembresDuPrefixe()
    const { error } = await admin.rpc(
      'creer_membre_enrichi',
      argumentsCreation({ p_faiseur_de_disciple: crypto.randomUUID() }),
    )
    expect(error?.details).toBe('faiseur_inconnu')
    expect(await compterMembresDuPrefixe()).toBe(avant)
  })

  it('refuse un dirigeant INCONNU, et ne laisse AUCUNE fiche', async () => {
    const avant = await compterMembresDuPrefixe()
    const { error } = await admin.rpc(
      'creer_membre_enrichi',
      argumentsCreation({ p_dirigeant: crypto.randomUUID() }),
    )
    expect(error?.details).toBe('dirigeant_inconnu')
    expect(await compterMembresDuPrefixe()).toBe(avant)
  })

  it('refuse un statut INCONNU, et ne laisse AUCUNE fiche', async () => {
    const avant = await compterMembresDuPrefixe()
    const { error } = await admin.rpc(
      'creer_membre_enrichi',
      argumentsCreation({
        p_statuts: [{ statut_id: crypto.randomUUID(), date_acquisition: null, note: null }],
      }),
    )
    expect(error?.details).toBe('statut_inconnu')
    expect(await compterMembresDuPrefixe()).toBe(avant)
  })

  // CONTRÔLE POSITIF DES QUATRE CI-DESSUS, dans la même situation : sans lui, ils
  // seraient tous satisfaits par une passerelle qui refuserait TOUT.
  it('accepte un faiseur de disciple ACTIF et un statut valide', async () => {
    const { data: faiseur, error: erreurFaiseur } = await admin
      .from('membres')
      .insert({ nom: `${PREFIXE}-faiseur-actif`, prenom: 'Test' })
      .select('id')
      .single()
    if (erreurFaiseur || !faiseur) throw new Error(`préparation impossible : ${erreurFaiseur?.message}`)

    const { data: identifiant, error } = await admin.rpc(
      'creer_membre_enrichi',
      argumentsCreation({
        p_faiseur_de_disciple: faiseur.id,
        p_statuts: [{ statut_id: statutExclusifA, date_acquisition: null, note: null }],
      }),
    )
    expect(error).toBeNull()

    const { data: fiche } = await admin
      .from('membres')
      .select('faiseur_de_disciple_id, dirigeant_id')
      .eq('id', identifiant)
      .single()
    expect(fiche?.faiseur_de_disciple_id).toBe(faiseur.id)
    // `definir_arbre` a bien été appelée avec les trois arguments : `p_dirigeant` valait
    // `null`, donc la colonne aussi. Assertion faible mais non vide — elle tomberait si
    // la passerelle écrivait le faiseur dans la colonne dirigeant.
    expect(fiche?.dirigeant_id).toBeNull()
  })
})

// ───────────────────────────────────────────────────────────────────────────────
// PREUVE N°5 (b) — LE COUPLE EXCLUSIF, PAR APPEL FORGÉ CONTOURNANT LA FONCTION PURE
// ───────────────────────────────────────────────────────────────────────────────

describe('refus du couple exclusif par la passerelle elle-même (D84)', () => {
  it("refuse deux statuts du même groupe exclusif, et n'écrit NI fiche NI statut NI journal", async () => {
    const avantMembres = await compterMembresDuPrefixe()
    const avantJournal = await compterJournalDuPrefixe()

    const { error } = await admin.rpc(
      'creer_membre_enrichi',
      argumentsCreation({
        p_statuts: [
          { statut_id: statutExclusifA, date_acquisition: null, note: null },
          { statut_id: statutExclusifB, date_acquisition: null, note: null },
        ],
      }),
    )

    const apresMembres = await compterMembresDuPrefixe()
    const apresJournal = await compterJournalDuPrefixe()

    /*
      ═══ LES QUATRE ASSERTIONS SONT `expect.soft`, ET C'EST LE POINT DE CE TEST ═══

      `expect()` LÈVE. Écrites en dur et dans l'ordre naturel — marqueur d'abord, delta du
      journal en dernier —, la première qui tombe empêcherait les suivantes de s'exécuter.
      Or le scénario que ce test existe pour attraper est précisément celui où la garde
      d'exclusivité n'existe pas et où l'ÉVICTION de `prive.attribuer_statut` a joué : dans
      ce monde-là, `error` est nul, l'assertion du marqueur tombe la première, et le delta
      du journal — LA SEULE ASSERTION QUI VERRAIT LE `retrait` MENSONGER — ne s'exécuterait
      JAMAIS. Le test dirait « marqueur absent » et tairait le fait le plus grave.

      En `soft`, les quatre s'exécutent et les quatre échecs sont rapportés. Le diagnostic
      dit alors ce qui s'est réellement passé, pas seulement ce qui a manqué en premier.
    */
    expect.soft(error, "la passerelle a ACCEPTÉ le couple exclusif").not.toBeNull()
    // La fiche n'existe pas : ni elle, ni rien de ce qui devait la suivre.
    expect.soft(apresMembres, 'une fiche a persisté malgré le refus').toBe(avantMembres)
    // LA PLUS IMPORTANTE. Si l'éviction de `prive.attribuer_statut` avait joué au lieu du
    // refus, le journal porterait un `retrait` d'un statut que personne n'a jamais porté
    // plus d'une transaction — et le journal mentirait sur ce qui s'est passé.
    expect
      .soft(apresJournal, "le journal a bougé : l'éviction a joué au lieu du refus")
      .toBe(avantJournal)
    // L'un des deux marqueurs NOUVEAUX de la phase, et le seul posé par la passerelle
    // elle-même.
    expect.soft(error?.details).toBe('statuts_exclusifs_incompatibles')
  })

  // CONTRÔLE POSITIF DANS LE MÊME TEST-CI : le MÊME appel avec UN SEUL des deux réussit.
  it('accepte UN SEUL des deux statuts du groupe exclusif', async () => {
    const { data: identifiant, error } = await admin.rpc(
      'creer_membre_enrichi',
      argumentsCreation({
        p_statuts: [{ statut_id: statutExclusifB, date_acquisition: null, note: null }],
      }),
    )
    expect(error).toBeNull()
    const { data: porte } = await admin
      .from('membre_statuts')
      .select('statut_id')
      .eq('membre_id', identifiant)
    expect(porte).toHaveLength(1)
    expect(porte?.[0]?.statut_id).toBe(statutExclusifB)
  })

  it("accepte deux statuts de groupes DIFFÉRENTS quand l'un n'est pas exclusif", async (contexte) => {
    if (statutCumulable === '') {
      // Aucun groupe cumulable au catalogue : ce cas ne peut pas être construit.
      //
      // `contexte.skip()` et NON un `return` : un `return` dans un `it` le rend VERT, pas
      // *skipped*, et le rapport de `npm test` afficherait un contrôle positif réussi qui
      // n'a rien exécuté. Le `console.warn` qui l'accompagnait, lui, se perd dans le bruit
      // de la sortie. Un cas non construit doit se VOIR dans le décompte.
      //
      // Sur le catalogue amorcé réel (20260813100000), cette branche ne se déclenche pas —
      // d'où la facilité avec laquelle un `return` y passerait inaperçu.
      contexte.skip()
      return
    }
    const { data: identifiant, error } = await admin.rpc(
      'creer_membre_enrichi',
      argumentsCreation({
        p_statuts: [
          { statut_id: statutExclusifA, date_acquisition: null, note: null },
          { statut_id: statutCumulable, date_acquisition: null, note: null },
        ],
      }),
    )
    expect(error).toBeNull()
    const { data: porte } = await admin
      .from('membre_statuts')
      .select('statut_id')
      .eq('membre_id', identifiant)
    expect(porte).toHaveLength(2)
  })
})

// ───────────────────────────────────────────────────────────────────────────────
// L'INVARIANT D'ARBRE COUVRE LES TROIS ÉTATS, PAS DEUX (D99)
//
// `public.etat_membre` a TROIS valeurs : `en_attente`, `actif`, `archive`
// (20260812120000). L'arborescence exclut `en_attente` EXACTEMENT comme `archive`
// (`.eq('etat','actif')` sur ses deux lectures paginées). Un faiseur `en_attente`
// produirait donc le même trou qu'un faiseur `archive`, avec une conséquence que le cas
// `archive` n'a pas : toute sa descendance ACTIVE deviendrait INATTEIGNABLE depuis la
// liste des racines — ces fiches ont un faiseur, donc ne sont pas racines, et leur parent
// n'est jamais rendu. Rien ne le signalerait.
//
// CES TROIS PREUVES SONT DURABLES, ET C'EST LEUR RAISON D'ÊTRE : les gardes vivent en
// base, où aucune porte de ce dépôt ne les relit. Sans elles, une réécriture future des
// déclencheurs pourrait rétrécir la garde à `archive` sans faire tomber quoi que ce soit.
// ───────────────────────────────────────────────────────────────────────────────

describe("les gardes d'état de l'arbre couvrent en_attente comme archive", () => {
  // ⚠️ NON DISCRIMINANT (I1 de la revue de la Task 5-7), MÊME RAISON QUE LE TEST
  // « faiseur de disciple ARCHIVÉ » PLUS HAUT — signalé ici pour la même garde contre une
  // recompte future. `faiseur_de_disciple_inactif` est posé par le MÊME déclencheur
  // (`prive.refuser_faiseur_de_disciple_archive`, amendé en 20260819110000) que
  // `faiseur_de_disciple_archive`, et mord donc tout aussi bien sur un `insert`/`update`
  // DIRECT que sur un appel via `definir_arbre` — le test juste en dessous
  // (« refuse le même rattachement par un INSERT DIRECT ») l'établit lui-même, dans ce
  // même fichier, en obtenant CE MÊME marqueur sans passer par la passerelle. Ce test
  // éprouve que LE DÉCLENCHEUR protège, pas que `creer_membre_enrichi` COMPOSE plutôt que
  // de recopier.
  it('refuse un faiseur de disciple EN ATTENTE, avec son marqueur propre, et ne laisse AUCUNE fiche', async () => {
    const avant = await compterMembresDuPrefixe()
    const { error } = await admin.rpc(
      'creer_membre_enrichi',
      argumentsCreation({ p_faiseur_de_disciple: idFaiseurEnAttente }),
    )
    expect(error).not.toBeNull()
    // MARQUEUR DISTINCT de `faiseur_de_disciple_archive`, et c'est le point : le message
    // que commande ce dernier dit « est archivé », ce qui serait faux ici. Deux faits
    // différents, deux marqueurs, deux messages.
    expect(error?.details).toBe('faiseur_de_disciple_inactif')
    expect(await compterMembresDuPrefixe()).toBe(avant)
  })

  it("refuse le même rattachement par un INSERT DIRECT, qui ne passe par aucune passerelle", async () => {
    // La passerelle explique ; le DÉCLENCHEUR protège. Sans cette preuve, une garde
    // retirée du déclencheur et laissée dans la passerelle resterait verte partout
    // ailleurs — alors qu'un `insert` direct la contournerait entièrement.
    const { error } = await admin.from('membres').insert({
      nom: `${PREFIXE}-sous-en-attente`,
      prenom: 'Test',
      faiseur_de_disciple_id: idFaiseurEnAttente,
    })
    expect(error).not.toBeNull()
    expect(error?.details).toBe('faiseur_de_disciple_inactif')
  })

  it("refuse de faire sortir de l'état actif un membre qui a encore un disciple actif", async () => {
    const { data: parent, error: erreurParent } = await admin
      .from('membres')
      .insert({ nom: `${PREFIXE}-parent-actif`, prenom: 'Test' })
      .select('id')
      .single()
    if (erreurParent || !parent) throw new Error(`préparation impossible : ${erreurParent?.message}`)
    const { error: erreurEnfant } = await admin
      .from('membres')
      .insert({
        nom: `${PREFIXE}-enfant-actif`,
        prenom: 'Test',
        faiseur_de_disciple_id: parent.id,
      })
    if (erreurEnfant) throw new Error(`préparation impossible : ${erreurEnfant.message}`)

    // `en_attente` et NON `archive` : c'est la transition que l'ancienne garde laissait
    // passer, parce qu'elle ne testait que `new.etat <> 'archive'`.
    const { error } = await admin
      .from('membres')
      .update({ etat: 'en_attente' })
      .eq('id', parent.id)
      .select('id')
    expect(error).not.toBeNull()
    expect(error?.details).toBe('disciples_a_reaffecter')

    // ET L'ÉTAT N'A PAS BOUGÉ : un refus qui laisserait l'écriture passer serait pire
    // qu'aucun refus.
    const { data: relu, error: erreurRelu } = await admin
      .from('membres')
      .select('etat')
      .eq('id', parent.id)
      .single()
    if (erreurRelu) throw new Error(`relecture impossible : ${erreurRelu.message}`)
    expect(relu?.etat).toBe('actif')
  })

  // CONTRÔLE POSITIF DES TROIS CI-DESSUS, ET IL N'EST PAS INERTE : sans lui, les trois
  // refus seraient aussi satisfaits par des gardes qui refuseraient TOUTE écriture d'arbre
  // et TOUT changement d'état. Il exige un succès RÉEL, vérifié en base.
  it("mais accepte un faiseur ACTIF, et laisse sortir de l'état actif un membre SANS disciple", async () => {
    const { data: faiseur, error: erreurFaiseur } = await admin
      .from('membres')
      .insert({ nom: `${PREFIXE}-faiseur-actif-controle`, prenom: 'Test' })
      .select('id')
      .single()
    if (erreurFaiseur || !faiseur) throw new Error(`préparation impossible : ${erreurFaiseur?.message}`)

    const { data: identifiant, error } = await admin.rpc(
      'creer_membre_enrichi',
      argumentsCreation({ p_faiseur_de_disciple: faiseur.id }),
    )
    expect(error).toBeNull()
    const { data: fiche, error: erreurFiche } = await admin
      .from('membres')
      .select('faiseur_de_disciple_id')
      .eq('id', identifiant)
      .single()
    if (erreurFiche) throw new Error(`relecture impossible : ${erreurFiche.message}`)
    expect(fiche?.faiseur_de_disciple_id).toBe(faiseur.id)

    // Une fiche SANS disciple : elle, on peut la sortir de l'état actif.
    const { data: seule, error: erreurSeule } = await admin
      .from('membres')
      .insert({ nom: `${PREFIXE}-sans-disciple`, prenom: 'Test' })
      .select('id')
      .single()
    if (erreurSeule || !seule) throw new Error(`préparation impossible : ${erreurSeule?.message}`)
    const { error: erreurArchivage } = await admin
      .from('membres')
      .update({ etat: 'archive' })
      .eq('id', seule.id)
      .select('id')
    expect(erreurArchivage).toBeNull()
  })
})

// ───────────────────────────────────────────────────────────────────────────────
// PREUVE N°2, FIL-PIÈGE COMPLÉMENTAIRE — ET IL EST PRÉSENTÉ COMME TEL
// ───────────────────────────────────────────────────────────────────────────────
//
// Une assertion sur un TEXTE DE DÉFINITION est fragile : un renommage, une reformulation,
// un commentaire suffiraient à la faire tomber sans qu'aucune propriété n'ait changé.
// Elle est écrite quand même parce que TOUTE LA VALEUR DE D81 EST DANS LA COMPOSITION, et
// qu'une recopie des gardes serait VERTE PARTOUT AILLEURS : les quatre refus ci-dessus
// passeraient tout aussi bien avec deux copies destinées à diverger.
//
// Ce fil-piège N'EST PAS EXÉCUTABLE DEPUIS supabase-js : `pg_get_functiondef` n'est pas
// exposé à PostgREST, et créer une fonction SQL pour l'exposer ouvrirait une porte
// permanente sur les définitions de la base — un coût sans commune mesure avec le
// bénéfice. Il est donc porté par l'ÉTAPE 3 DE CETTE TÂCHE, à la main, dans l'éditeur SQL,
// et sa sortie est consignée verbatim dans le rapport.
