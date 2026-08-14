import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const CLE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const CLE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

const MDP = `Test-${crypto.randomUUID()}`
const IDENT_SIMPLE = 'test.rls.conv.simple'
// ÉCART SIGNALÉ (introduit ici, absent du brief) : `p_par` est écrit tel quel dans
// `demandes_membre.demandeur_profil_id` par `convertir_participant_externe` (chemin 1) —
// c'est exactement ce que fait l'application (`src/app/evenements/a-traiter/actions.ts`,
// `p_par: adminProfil.id`). Toutes les conversions de ce fichier passent `idProfilSimple`
// en `p_par`. Si le test « chemin 1 » vérifie la visibilité AVANT validation avec
// `clientSimple`, ce compte N'EST PAS un tiers ordinaire pour CETTE fiche : il EST son
// demandeur, et `prive.peut_lire_membre` (D72) accorde explicitement la lecture d'une
// fiche `en_attente` à son demandeur, quel que soit son rôle. Un second compte, sans
// AUCUNE relation avec la demande, est nécessaire pour que l'assertion « un compte
// ORDINAIRE ne voit rien » porte sur ce qu'elle prétend prouver.
const IDENT_TIERS = 'test.rls.conv.tiers'
const FAMILLE = 'ZZEvtConv-'
const PREFIXE = `${FAMILLE}${crypto.randomUUID().slice(0, 8)}`

const admin = createClient(URL, CLE_SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
})

let clientSimple: SupabaseClient
let clientTiers: SupabaseClient
let idProfilSimple: string
let idType: string
let idEvenement: string
let idEvenementBis: string
let idMembreCible: string
let idMembreArchive: string
let idFaiseur: string

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

/** Crée un participant externe de la famille, avec une participation portant le désir. */
async function creerExterneAvecDesir(suffixe: string, evenementId = idEvenement): Promise<string> {
  const { data: externe, error: erreurExterne } = await admin
    .from('participants_externes')
    .insert({ nom: `${PREFIXE}-${suffixe}`, prenom: 'Test', ville: 'Douala' })
    .select('id')
    .single()
  // L'ERREUR EST LEVÉE, jamais ignorée : un insert de préparation dont l'erreur est jetée
  // rend le test vert en éprouvant un tout autre chemin — trouvé trois fois dans ce projet.
  if (erreurExterne || !externe) throw new Error(`création de l externe ${suffixe} impossible : ${erreurExterne?.message}`)

  const { error: erreurPart } = await admin.from('participations').insert({
    evenement_id: evenementId,
    participant_externe_id: externe.id,
    desir_suivi_spirituel: true,
  })
  if (erreurPart) throw new Error(`participation de ${suffixe} impossible : ${erreurPart.message}`)

  return externe.id as string
}

async function nettoyerFamille() {
  const { data: evts, error: e1 } = await admin.from('evenements').select('id').like('titre', `${FAMILLE}%`)
  if (e1) throw new Error(`balayage des évènements impossible : ${e1.message}`)
  const idsEvts = (evts ?? []).map((l) => l.id as string)

  const { data: externes, error: e2 } = await admin
    .from('participants_externes')
    .select('id')
    .like('nom', `${FAMILLE}%`)
  if (e2) throw new Error(`balayage des externes impossible : ${e2.message}`)
  const idsExternes = (externes ?? []).map((l) => l.id as string)

  const { data: membres, error: e3 } = await admin.from('membres').select('id').like('nom', `${FAMILLE}%`)
  if (e3) throw new Error(`balayage des membres impossible : ${e3.message}`)
  const idsMembres = (membres ?? []).map((l) => l.id as string)

  // 1. Participations : `membre_id` et `participant_externe_id` sont en `on delete
  //    restrict`, rien ne peut partir avant elles.
  for (const [colonne, ids] of [
    ['evenement_id', idsEvts],
    ['participant_externe_id', idsExternes],
    ['membre_id', idsMembres],
  ] as const) {
    if (ids.length > 0) {
      const { error } = await admin.from('participations').delete().in(colonne, ids)
      if (error) throw new Error(`nettoyage des participations par ${colonne} impossible : ${error.message}`)
    }
  }

  // 2. Demandes AVANT les membres : `demandes_membre.membre_id` est en `on delete set
  //    null`, et l'ordre inverse effacerait la prise juste avant qu'on la cherche.
  if (idsMembres.length > 0) {
    const { error } = await admin.from('demandes_membre').delete().in('membre_id', idsMembres)
    if (error) throw new Error(`nettoyage des demandes impossible : ${error.message}`)
  }

  // 3. Externes AVANT les membres : `converti_en_membre_id` est en `on delete restrict`.
  if (idsExternes.length > 0) {
    const { error } = await admin.from('participants_externes').delete().in('id', idsExternes)
    if (error) throw new Error(`nettoyage des externes impossible : ${error.message}`)
  }
  if (idsMembres.length > 0) {
    const { error } = await admin.from('membres').delete().in('id', idsMembres)
    if (error) throw new Error(`nettoyage des membres impossible : ${error.message}`)
  }
  if (idsEvts.length > 0) {
    const { error } = await admin.from('evenements').delete().in('id', idsEvts)
    if (error) throw new Error(`nettoyage des évènements impossible : ${error.message}`)
  }
  const { error: e4 } = await admin.from('types_evenement').delete().like('libelle', `${FAMILLE}%`)
  if (e4) throw new Error(`nettoyage des types impossible : ${e4.message}`)
}

beforeAll(async () => {
  await nettoyerFamille()
  await supprimerCompte(IDENT_SIMPLE)
  await supprimerCompte(IDENT_TIERS)

  const { data: compte, error: erreurCompte } = await admin.auth.admin.createUser({
    email: `${IDENT_SIMPLE}@asonkeng.local`,
    password: MDP,
    email_confirm: true,
  })
  if (erreurCompte || !compte.user) throw new Error(`création du compte impossible : ${erreurCompte?.message}`)
  idProfilSimple = compte.user.id
  const { error: erreurProfil } = await admin
    .from('profils')
    .insert({ id: idProfilSimple, identifiant: IDENT_SIMPLE, nom_affichage: 'Test conversion' })
  if (erreurProfil) throw new Error(`insertion du profil impossible : ${erreurProfil.message}`)
  clientSimple = createClient(URL, CLE_ANON, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error: erreurConnexion } = await clientSimple.auth.signInWithPassword({
    email: `${IDENT_SIMPLE}@asonkeng.local`,
    password: MDP,
  })
  if (erreurConnexion) throw new Error(`connexion impossible : ${erreurConnexion.message}`)

  // TIERS — compte sans AUCUNE relation avec les demandes créées par cette suite (jamais
  // passé en `p_par`, donc jamais `demandeur_profil_id` d'une `demandes_membre`). C'est le
  // seul compte de ce fichier qui puisse légitimement porter l'assertion « un compte
  // ORDINAIRE ne voit rien » sur une fiche `en_attente` : `clientSimple`, lui, EST le
  // demandeur de toutes les conversions ci-dessous (voir la note au-dessus de sa
  // déclaration).
  const { data: compteTiers, error: erreurCompteTiers } = await admin.auth.admin.createUser({
    email: `${IDENT_TIERS}@asonkeng.local`,
    password: MDP,
    email_confirm: true,
  })
  if (erreurCompteTiers || !compteTiers.user) {
    throw new Error(`création du compte tiers impossible : ${erreurCompteTiers?.message}`)
  }
  const { error: erreurProfilTiers } = await admin
    .from('profils')
    .insert({ id: compteTiers.user.id, identifiant: IDENT_TIERS, nom_affichage: 'Test tiers' })
  if (erreurProfilTiers) throw new Error(`insertion du profil tiers impossible : ${erreurProfilTiers.message}`)
  clientTiers = createClient(URL, CLE_ANON, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error: erreurConnexionTiers } = await clientTiers.auth.signInWithPassword({
    email: `${IDENT_TIERS}@asonkeng.local`,
    password: MDP,
  })
  if (erreurConnexionTiers) throw new Error(`connexion tiers impossible : ${erreurConnexionTiers.message}`)

  const { data: type, error: erreurType } = await admin
    .from('types_evenement')
    .insert({ libelle: `${PREFIXE}-type` })
    .select('id')
    .single()
  if (erreurType || !type) throw new Error(`création du type impossible : ${erreurType?.message}`)
  idType = type.id as string

  const { data: evts, error: erreurEvts } = await admin
    .from('evenements')
    .insert([
      { titre: `${PREFIXE}-evt1`, type_id: idType, date_debut: '2026-09-01', cree_par: idProfilSimple },
      { titre: `${PREFIXE}-evt2`, type_id: idType, date_debut: '2026-10-01', cree_par: idProfilSimple },
    ])
    .select('id, titre')
  if (erreurEvts || !evts || evts.length !== 2) {
    throw new Error(`création des évènements impossible : ${erreurEvts?.message}`)
  }
  idEvenement = evts.find((e) => (e.titre as string).endsWith('-evt1'))!.id as string
  idEvenementBis = evts.find((e) => (e.titre as string).endsWith('-evt2'))!.id as string

  const { data: membres, error: erreurMembres } = await admin
    .from('membres')
    .insert([
      { nom: `${PREFIXE}-cible`, prenom: 'Test', etat: 'actif' },
      { nom: `${PREFIXE}-archive`, prenom: 'Test', etat: 'archive' },
      { nom: `${PREFIXE}-faiseur`, prenom: 'Test', etat: 'actif' },
    ])
    .select('id, nom')
  if (erreurMembres || !membres || membres.length !== 3) {
    throw new Error(`création des membres impossible : ${erreurMembres?.message}`)
  }
  idMembreCible = membres.find((m) => (m.nom as string).endsWith('-cible'))!.id as string
  idMembreArchive = membres.find((m) => (m.nom as string).endsWith('-archive'))!.id as string
  idFaiseur = membres.find((m) => (m.nom as string).endsWith('-faiseur'))!.id as string
})

afterAll(async () => {
  await nettoyerFamille()

  for (const [table, colonne] of [
    ['evenements', 'titre'],
    ['participants_externes', 'nom'],
    ['membres', 'nom'],
    ['types_evenement', 'libelle'],
  ] as const) {
    const { count, error } = await admin
      .from(table)
      .select('id', { count: 'exact', head: true })
      .like(colonne, `${FAMILLE}%`)
    expect(error).toBeNull()
    expect(count).toBe(0)
  }

  // MINEUR CORRIGÉ (revue des Tasks 22-24) : `demandes_membre` n'était vérifiée par AUCUN
  // comptage — `nettoyerFamille` les supprime bien (par `membre_id`, AVANT les membres,
  // voir son corps), mais rien ne confirmait que ce nettoyage avait réellement joué. Un
  // comptage APRÈS coup sur `membre_id` serait vide de toute façon puisque les membres
  // eux-mêmes viennent d'être supprimés ci-dessus (`demandes_membre.membre_id` est en
  // `on delete set null`, pas `restrict` : une demande orpheline y survivrait avec
  // `membre_id = null`, invisible à un tel filtre). `demandeur_profil_id`, lui, reste
  // stable : TOUTES les conversions de ce fichier passent `p_par: idProfilSimple` (voir la
  // note de tête sur `IDENT_TIERS`), donc TOUTE demande créée par cette suite porte ce
  // demandeur — vérifiable AVANT la suppression du compte, ci-dessous.
  const { count: demandesResiduelles, error: erreurDemandes } = await admin
    .from('demandes_membre')
    .select('id', { count: 'exact', head: true })
    .eq('demandeur_profil_id', idProfilSimple)
  expect(erreurDemandes).toBeNull()
  expect(demandesResiduelles, 'résidu dans demandes_membre').toBe(0)

  await supprimerCompte(IDENT_SIMPLE)
  await supprimerCompte(IDENT_TIERS)
})

describe('conversion : les trois chemins et la vue (preuve n°3)', () => {
  it("chemin 3 — CONTRÔLE POSITIF D'ABORD : le compte ordinaire ne voit RIEN pour la fiche cible AVANT conversion, puis voit le séminaire APRÈS", async () => {
    // Sans le constat « rien avant », l'assertion positive pourrait être vraie pour une
    // autre raison (une participation directe du membre, une autre exécution de test).
    const { data: avant, error: erreurAvant } = await clientSimple
      .from('seminaires_assistes')
      .select('evenement_id')
      .eq('membre_id', idMembreCible)
    expect(erreurAvant).toBeNull()
    expect(avant).toEqual([])

    const idExterne = await creerExterneAvecDesir('chemin3')

    const { data, error } = await admin.rpc('convertir_participant_externe', {
      p_participant: idExterne,
      p_chemin: 'membre_existant',
      p_membre_cible: idMembreCible,
      p_nom: null,
      p_prenom: null,
      p_faiseur: null,
      p_dirigeant: null,
      p_dirigeant_force: false,
      p_par: idProfilSimple,
    })
    expect(error).toBeNull()
    const ligne = (Array.isArray(data) ? data[0] : data) as { membre_id: string; demande_id: string | null }
    expect(ligne.membre_id).toBe(idMembreCible)
    // Chemin 3 : aucune demande créée.
    expect(ligne.demande_id).toBeNull()

    // LA PREUVE : depuis un COMPTE ORDINAIRE, la vue rend le séminaire — l'historique du
    // converti est reconstitué À LA LECTURE (D70), aucune écriture passée n'ayant bougé.
    const { data: apres, error: erreurApres } = await clientSimple
      .from('seminaires_assistes')
      .select('evenement_id, titre')
      .eq('membre_id', idMembreCible)
    expect(erreurApres).toBeNull()
    expect((apres ?? []).length).toBe(1)
    expect(apres![0].evenement_id).toBe(idEvenement)

    // D69 — LA PARTICIPATION N'A PAS BOUGÉ : `membre_id` est toujours NULL, et
    // `participant_externe_id` pointe toujours sur l'externe. C'est ce fait, et lui seul,
    // qui préserve la trace que cette personne est entrée par un séminaire.
    const { data: participation } = await admin
      .from('participations')
      .select('membre_id, participant_externe_id')
      .eq('participant_externe_id', idExterne)
      .single()
    expect(participation!.membre_id).toBeNull()
    expect(participation!.participant_externe_id).toBe(idExterne)
  })

  it("chemin 1 — crée une fiche en_attente ET sa demande d origine conversion_participant, INVISIBLE d un compte ordinaire tant qu elle est en_attente, puis VISIBLE avec son séminaire une fois la demande validée", async () => {
    const idExterne = await creerExterneAvecDesir('chemin1')

    const { data, error } = await admin.rpc('convertir_participant_externe', {
      p_participant: idExterne,
      p_chemin: 'fiche_en_attente',
      p_membre_cible: null,
      p_nom: `${PREFIXE}-converti1`,
      p_prenom: 'Test',
      p_faiseur: null,
      p_dirigeant: null,
      p_dirigeant_force: false,
      p_par: idProfilSimple,
    })
    expect(error).toBeNull()
    const ligne = (Array.isArray(data) ? data[0] : data) as { membre_id: string; demande_id: string | null }
    expect(ligne.demande_id).not.toBeNull()

    const { data: fiche } = await admin.from('membres').select('etat').eq('id', ligne.membre_id).single()
    expect(fiche!.etat).toBe('en_attente')

    const { data: demande } = await admin
      .from('demandes_membre')
      .select('origine, etat, membre_id, demandeur_profil_id')
      .eq('id', ligne.demande_id!)
      .single()
    expect(demande!.origine).toBe('conversion_participant')
    expect(demande!.etat).toBe('en_attente')
    expect(demande!.membre_id).toBe(ligne.membre_id)

    // CONTRÔLE NÉGATIF — tant que la fiche est `en_attente`, un COMPTE ORDINAIRE SANS
    // RELATION AVEC CETTE DEMANDE ne voit RIEN : `prive.peut_lire_membre` ne l'ouvre qu'à
    // l'administrateur et au demandeur de la fiche, et la seconde branche de
    // `seminaires_assistes` filtre par ce prédicat. Ce zéro n'est pas un défaut de la vue,
    // c'est l'état d'une fiche non encore validée — et c'est précisément pour cela que la
    // validation, plus bas, est INDISPENSABLE et non décorative.
    //
    // ⚠️ `clientTiers`, PAS `clientSimple`, ET CE N'EST PAS UN DÉTAIL. `p_par` (ci-dessus)
    // vaut `idProfilSimple` — exactement ce que fait l'application, qui y passe le profil
    // de l'administrateur convertisseur (`src/app/evenements/a-traiter/actions.ts`) — donc
    // `clientSimple` EST le demandeur de CETTE demande, et `prive.est_demandeur_de`
    // (D72) lui accorderait la lecture même avant validation. Écrit avec `clientSimple`,
    // ce contrôle négatif serait FAUX : l'exécuter contre la version actuelle du dépôt
    // échoue réellement (une ligne est rendue), preuve que l'assertion n'aurait rien
    // éprouvé du tout. `clientTiers` n'a jamais figuré dans aucun `p_par` de ce fichier.
    const { data: avant, error: erreurAvant } = await clientTiers
      .from('seminaires_assistes')
      .select('evenement_id')
      .eq('membre_id', ligne.membre_id)
    expect(erreurAvant).toBeNull()
    expect(avant).toEqual([])

    // CONTRÔLE POSITIF DE LA NUANCE CI-DESSUS, DANS LE MÊME TEST : le DEMANDEUR, lui,
    // voit déjà la fiche avant validation — c'est `prive.est_demandeur_de` qui joue, pas
    // un défaut de `seminaires_assistes`. Sans ce contrôle, le zéro obtenu par
    // `clientTiers` ci-dessus pourrait aussi bien signifier « personne ne voit jamais une
    // fiche en_attente, même son demandeur » — ce qui NE SERAIT PAS le comportement voulu
    // (D72 accorde explicitement cette lecture).
    const { data: avantDemandeur, error: erreurAvantDemandeur } = await clientSimple
      .from('seminaires_assistes')
      .select('evenement_id')
      .eq('membre_id', ligne.membre_id)
    expect(erreurAvantDemandeur).toBeNull()
    expect((avantDemandeur ?? []).length).toBe(1)

    // LA VALIDATION, REJOUÉE ICI PAR SES DEUX ÉCRITURES. `validerDemandeNouvellePersonne`
    // est une Server Action : elle n'est pas appelable depuis une suite RLS. On rejoue donc
    // EXACTEMENT ce qu'elle écrit pour l'origine `conversion_participant` — `etat = 'actif'`
    // sur la fiche, ET RIEN D'AUTRE (aucun faiseur de disciple n'est posé, l'administrateur
    // convertisseur n'étant pas le faiseur de disciple de la personne convertie), puis la
    // demande à `validee`. Si un jour l'action écrivait autre chose pour cette origine, ces
    // deux `update` seraient à reprendre AVEC elle : ce test les reproduit, il ne les
    // observe pas.
    const { error: erreurActivation } = await admin
      .from('membres')
      .update({ etat: 'actif' })
      .eq('id', ligne.membre_id)
    expect(erreurActivation).toBeNull()
    const { error: erreurDemandeValidee } = await admin
      .from('demandes_membre')
      .update({ etat: 'validee' })
      .eq('id', ligne.demande_id!)
    expect(erreurDemandeValidee).toBeNull()

    // LA PREUVE, LA MÊME QUE POUR LES CHEMINS 2 ET 3 : depuis un COMPTE ORDINAIRE SANS
    // AUCUNE RELATION avec la demande (`clientTiers`, pas `clientSimple` qui en est le
    // demandeur), la vue rend le séminaire du converti. C'est la ligne 4 du périmètre
    // livré du design — « historique des convertis compris » (D70) — tenue sur le
    // chemin 1, qui est le chemin nominal de D66.
    const { data: apres, error: erreurApres } = await clientTiers
      .from('seminaires_assistes')
      .select('evenement_id')
      .eq('membre_id', ligne.membre_id)
    expect(erreurApres).toBeNull()
    expect((apres ?? []).length).toBe(1)
    expect(apres![0].evenement_id).toBe(idEvenement)

    // La fiche n'a TOUJOURS aucun faiseur de disciple : la validation d'une conversion ne
    // pose pas de filiation. Sans cette assertion, une régression qui poserait le
    // convertisseur comme faiseur passerait inaperçue — elle écrirait dans l'arbre une
    // filiation qui n'a jamais eu lieu.
    const { data: ficheApres } = await admin
      .from('membres')
      .select('etat, faiseur_de_disciple_id')
      .eq('id', ligne.membre_id)
      .single()
    expect(ficheApres!.etat).toBe('actif')
    expect(ficheApres!.faiseur_de_disciple_id).toBeNull()
  })

  it('chemin 2 — crée une fiche ACTIVE avec son faiseur de disciple, et la vue la montre à un compte ordinaire', async () => {
    const idExterne = await creerExterneAvecDesir('chemin2')

    const { data, error } = await admin.rpc('convertir_participant_externe', {
      p_participant: idExterne,
      p_chemin: 'fiche_active',
      p_membre_cible: null,
      p_nom: `${PREFIXE}-converti2`,
      p_prenom: 'Test',
      p_faiseur: idFaiseur,
      p_dirigeant: null,
      p_dirigeant_force: false,
      p_par: idProfilSimple,
    })
    expect(error).toBeNull()
    const ligne = (Array.isArray(data) ? data[0] : data) as { membre_id: string; demande_id: string | null }
    expect(ligne.demande_id).toBeNull()

    const { data: fiche } = await admin
      .from('membres')
      .select('etat, faiseur_de_disciple_id')
      .eq('id', ligne.membre_id)
      .single()
    expect(fiche!.etat).toBe('actif')
    expect(fiche!.faiseur_de_disciple_id).toBe(idFaiseur)

    const { data: vue } = await clientSimple
      .from('seminaires_assistes')
      .select('evenement_id')
      .eq('membre_id', ligne.membre_id)
    expect((vue ?? []).length).toBe(1)
  })

  it('refuse une fiche cible ARCHIVÉE (D68), avec contrôle positif sur une fiche active', async () => {
    const idExterne = await creerExterneAvecDesir('cible-archivee')

    const { error } = await admin.rpc('convertir_participant_externe', {
      p_participant: idExterne,
      p_chemin: 'membre_existant',
      p_membre_cible: idMembreArchive,
      p_nom: null,
      p_prenom: null,
      p_faiseur: null,
      p_dirigeant: null,
      p_dirigeant_force: false,
      p_par: idProfilSimple,
    })
    expect(error).not.toBeNull()
    expect(error!.details).toBe('membre_cible_non_actif')

    // ÉCRITURE RÉELLE : rien n'a été posé.
    const { data: relu } = await admin
      .from('participants_externes')
      .select('converti_en_membre_id')
      .eq('id', idExterne)
      .single()
    expect(relu!.converti_en_membre_id).toBeNull()

    // CONTRÔLE POSITIF dans le même test : le MÊME appel, vers une fiche ACTIVE, réussit —
    // sans lui, le refus pourrait signifier « ce chemin ne marche plus du tout ».
    const { error: erreurPositive } = await admin.rpc('convertir_participant_externe', {
      p_participant: idExterne,
      p_chemin: 'membre_existant',
      p_membre_cible: idMembreCible,
      p_nom: null,
      p_prenom: null,
      p_faiseur: null,
      p_dirigeant: null,
      p_dirigeant_force: false,
      p_par: idProfilSimple,
    })
    expect(erreurPositive).toBeNull()
  })
})

describe('non-reconversion (preuve n°10)', () => {
  it('refuse une seconde conversion, et le lien pointe TOUJOURS sur la première fiche', async () => {
    const idExterne = await creerExterneAvecDesir('reconversion')

    const { data, error } = await admin.rpc('convertir_participant_externe', {
      p_participant: idExterne,
      p_chemin: 'fiche_active',
      p_membre_cible: null,
      p_nom: `${PREFIXE}-premier`,
      p_prenom: 'Test',
      p_faiseur: idFaiseur,
      p_dirigeant: null,
      p_dirigeant_force: false,
      p_par: idProfilSimple,
    })
    expect(error).toBeNull()
    const premier = (Array.isArray(data) ? data[0] : data) as { membre_id: string }

    const { error: erreurSeconde } = await admin.rpc('convertir_participant_externe', {
      p_participant: idExterne,
      p_chemin: 'membre_existant',
      p_membre_cible: idMembreCible,
      p_nom: null,
      p_prenom: null,
      p_faiseur: null,
      p_dirigeant: null,
      p_dirigeant_force: false,
      p_par: idProfilSimple,
    })
    expect(erreurSeconde).not.toBeNull()
    expect(erreurSeconde!.details).toBe('participant_deja_converti')

    // RELECTURE EN BASE : le lien n'a pas bougé. Sans elle, le refus seul ne prouverait pas
    // que rien n'a été écrit avant le refus.
    const { data: relu } = await admin
      .from('participants_externes')
      .select('converti_en_membre_id')
      .eq('id', idExterne)
      .single()
    expect(relu!.converti_en_membre_id).toBe(premier.membre_id)
  })

  it("le DÉCLENCHEUR refuse aussi une écriture DIRECTE, y compris la remise à NULL (D63) — c'est le cas que `<>` laisserait passer", async () => {
    const idExterne = await creerExterneAvecDesir('ecriture-directe')
    // ERREUR DE PRÉPARATION VÉRIFIÉE (mineur signalé par la revue des Tasks 22-24) : sans
    // `expect(error).toBeNull()`, un échec silencieux de cette conversion de préparation
    // laisserait `converti_en_membre_id` à `null`, et la remise à `null` ci-dessous ne
    // violerait alors PLUS RIEN (le déclencheur ne se déclenche que si `old` est
    // NON NULL) — le test aurait alors éprouvé un tout autre chemin que celui annoncé par
    // son titre.
    const { data, error } = await admin.rpc('convertir_participant_externe', {
      p_participant: idExterne,
      p_chemin: 'membre_existant',
      p_membre_cible: idMembreCible,
      p_nom: null,
      p_prenom: null,
      p_faiseur: null,
      p_dirigeant: null,
      p_dirigeant_force: false,
      p_par: idProfilSimple,
    })
    expect(error).toBeNull()
    const ligne = (Array.isArray(data) ? data[0] : data) as { membre_id: string }

    const { error: erreurNull } = await admin
      .from('participants_externes')
      .update({ converti_en_membre_id: null, converti_le: null })
      .eq('id', idExterne)
    expect(erreurNull).not.toBeNull()
    expect(erreurNull!.details).toBe('participant_deja_converti')

    const { data: relu } = await admin
      .from('participants_externes')
      .select('converti_en_membre_id')
      .eq('id', idExterne)
      .single()
    expect(relu!.converti_en_membre_id).toBe(ligne.membre_id)

    // CONTRÔLE POSITIF : une colonne SANS RAPPORT reste modifiable — sans lui, le refus
    // ci-dessus pourrait signifier « cette ligne est devenue totalement immuable ».
    const { data: modifiee, error: erreurModif } = await admin
      .from('participants_externes')
      .update({ ville: 'Yaoundé' })
      .eq('id', idExterne)
      .select('ville')
    expect(erreurModif).toBeNull()
    expect(modifiee![0].ville).toBe('Yaoundé')
  })
})

describe('classement (preuves n°12 et n°13)', () => {
  it("classer une personne présente à DEUX évènements la fait disparaître de la liste — et elle n'y figurait qu'UNE fois avant (D61)", async () => {
    const idExterne = await creerExterneAvecDesir('deux-evts')
    // Seconde participation, second évènement, même désir.
    const { error: erreurBis } = await admin.from('participations').insert({
      evenement_id: idEvenementBis,
      participant_externe_id: idExterne,
      desir_suivi_spirituel: true,
    })
    expect(erreurBis).toBeNull()

    // CONTRÔLE POSITIF, et il vérifie l'AGRÉGATION en même temps que le classement : la
    // personne figure UNE SEULE FOIS dans la liste, avec deux évènements concernés.
    const { data: avant, error: erreurAvant } = await admin
      .from('participants_a_traiter')
      .select('participant_externe_id, evenements_concernes')
      .eq('participant_externe_id', idExterne)
    expect(erreurAvant).toBeNull()
    expect((avant ?? []).length).toBe(1)
    expect(Number(avant![0].evenements_concernes)).toBe(2)

    const { error: erreurClassement } = await admin.rpc('classer_participant_externe', {
      p_participant: idExterne,
      p_motif: 'Injoignable depuis trois mois',
      p_par: idProfilSimple,
    })
    expect(erreurClassement).toBeNull()

    const { data: apres } = await admin
      .from('participants_a_traiter')
      .select('participant_externe_id')
      .eq('participant_externe_id', idExterne)
    expect(apres).toEqual([])
  })

  it('refuse un motif vide, refuse un déclassement, et la valeur en base ne bouge pas (D62)', async () => {
    const idExterne = await creerExterneAvecDesir('classement-definitif')

    const { error: erreurVide } = await admin.rpc('classer_participant_externe', {
      p_participant: idExterne,
      p_motif: '   ',
      p_par: idProfilSimple,
    })
    expect(erreurVide).not.toBeNull()
    expect(erreurVide!.details).toBe('motif_classement_vide')

    const { error: erreurOk } = await admin.rpc('classer_participant_externe', {
      p_participant: idExterne,
      p_motif: 'Motif initial',
      p_par: idProfilSimple,
    })
    expect(erreurOk).toBeNull()

    // Déclassement par écriture DIRECTE : refusé par le déclencheur.
    const { error: erreurDeclassement } = await admin
      .from('participants_externes')
      .update({ classe_le: null, motif_classement: null })
      .eq('id', idExterne)
    expect(erreurDeclassement).not.toBeNull()
    expect(erreurDeclassement!.details).toBe('classement_definitif')

    const { data: relu } = await admin
      .from('participants_externes')
      .select('classe_le, motif_classement')
      .eq('id', idExterne)
      .single()
    expect(relu!.classe_le).not.toBeNull()
    expect(relu!.motif_classement).toBe('Motif initial')
  })

  it("CONTRÔLE POSITIF de D62 : un participant DÉJÀ CLASSÉ reste convertible, et cela ne le fait pas réapparaître dans la liste", async () => {
    const idExterne = await creerExterneAvecDesir('classe-puis-converti')
    const { error: erreurClassement } = await admin.rpc('classer_participant_externe', {
      p_participant: idExterne,
      p_motif: 'Classé avant de reprendre contact',
      p_par: idProfilSimple,
    })
    expect(erreurClassement).toBeNull()

    // « Pas de réouverture » porte sur la LISTE, pas sur le sort de la personne : quelqu'un
    // classé il y a deux ans qui reprend contact DOIT pouvoir être converti.
    const { error: erreurConversion } = await admin.rpc('convertir_participant_externe', {
      p_participant: idExterne,
      p_chemin: 'membre_existant',
      p_membre_cible: idMembreCible,
      p_nom: null,
      p_prenom: null,
      p_faiseur: null,
      p_dirigeant: null,
      p_dirigeant_force: false,
      p_par: idProfilSimple,
    })
    expect(erreurConversion).toBeNull()

    // Les deux colonnes coexistent renseignées, et aucune contrainte ne les oppose.
    const { data: relu } = await admin
      .from('participants_externes')
      .select('classe_le, converti_en_membre_id')
      .eq('id', idExterne)
      .single()
    expect(relu!.classe_le).not.toBeNull()
    expect(relu!.converti_en_membre_id).toBe(idMembreCible)

    const { data: liste } = await admin
      .from('participants_a_traiter')
      .select('participant_externe_id')
      .eq('participant_externe_id', idExterne)
    expect(liste).toEqual([])
  })
})

describe('annulation d une demande de conversion (preuve n°11)', () => {
  it("refuse l'annulation avec le marqueur `demande_conversion_non_annulable`, LA FICHE EST TOUJOURS EN BASE, et un `delete` direct échoue en 23503", async () => {
    const idExterne = await creerExterneAvecDesir('annulation')

    // ERREUR DE PRÉPARATION VÉRIFIÉE (mineur signalé par la revue des Tasks 22-24) : un
    // échec silencieux ici laisserait `ligne` à `undefined`, et `ligne.demande_id` lèverait
    // plus bas une TypeError sans rapport avec ce que le test annonce éprouver.
    const { data, error } = await admin.rpc('convertir_participant_externe', {
      p_participant: idExterne,
      p_chemin: 'fiche_en_attente',
      p_membre_cible: null,
      p_nom: `${PREFIXE}-a-annuler`,
      p_prenom: 'Test',
      p_faiseur: null,
      p_dirigeant: null,
      p_dirigeant_force: false,
      p_par: idProfilSimple,
    })
    expect(error).toBeNull()
    const ligne = (Array.isArray(data) ? data[0] : data) as { membre_id: string; demande_id: string }

    // (a) la passerelle refuse.
    const { error: erreurAnnulation } = await admin.rpc('annuler_demande_membre', {
      p_demande: ligne.demande_id,
      p_demandeur: idProfilSimple,
    })
    expect(erreurAnnulation).not.toBeNull()
    expect(erreurAnnulation!.details).toBe('demande_conversion_non_annulable')

    // LA FICHE EST TOUJOURS EN BASE — c'est ce constat, pas le refus, qui prouve que rien
    // n'a été détruit avant le refus. Postgres n'a pas de transaction autonome : une
    // exception annule l'écriture qu'on aurait pu croire acquise.
    const { data: fiche } = await admin.from('membres').select('id, etat').eq('id', ligne.membre_id).maybeSingle()
    expect(fiche).not.toBeNull()
    expect(fiche!.etat).toBe('en_attente')
    const { data: demande } = await admin
      .from('demandes_membre')
      .select('etat')
      .eq('id', ligne.demande_id)
      .single()
    expect(demande!.etat).toBe('en_attente')

    // (b) SECONDE BARRIÈRE, indépendante : un `delete from membres` direct échoue en 23503
    // à cause du `on delete restrict` de `converti_en_membre_id` (D64).
    const { error: erreurDelete } = await admin.from('membres').delete().eq('id', ligne.membre_id)
    expect(erreurDelete).not.toBeNull()
    expect(erreurDelete!.code).toBe('23503')
  })

  it("CONTRÔLE POSITIF : l'annulation d'une demande d'origine `demande_suivi` fonctionne toujours", async () => {
    // Sans ce test, le refus ci-dessus pourrait aussi bien signifier « annuler_demande_membre
    // est cassée » que « elle refuse cette origine précise ».
    const { data: fiche, error: erreurFiche } = await admin
      .from('membres')
      .insert({ nom: `${PREFIXE}-suivi`, prenom: 'Test', etat: 'en_attente' })
      .select('id')
      .single()
    if (erreurFiche || !fiche) throw new Error(`préparation impossible : ${erreurFiche?.message}`)

    const { data: demande, error: erreurDemande } = await admin
      .from('demandes_membre')
      .insert({
        origine: 'demande_suivi',
        demandeur_profil_id: idProfilSimple,
        membre_id: fiche.id,
        etat: 'en_attente',
      })
      .select('id')
      .single()
    if (erreurDemande || !demande) throw new Error(`préparation impossible : ${erreurDemande?.message}`)

    const { error } = await admin.rpc('annuler_demande_membre', {
      p_demande: demande.id,
      p_demandeur: idProfilSimple,
    })
    expect(error).toBeNull()

    const { data: apres } = await admin
      .from('demandes_membre')
      .select('etat, membre_id')
      .eq('id', demande.id)
      .single()
    expect(apres!.etat).toBe('annulee')
    // D42 (phase 2b) : la fiche en_attente a bien été supprimée, et `membre_id` est passé à
    // NULL par le `on delete set null`.
    expect(apres!.membre_id).toBeNull()
    const { data: ficheApres } = await admin.from('membres').select('id').eq('id', fiche.id).maybeSingle()
    expect(ficheApres).toBeNull()

    // Nettoyage local de la demande annulée : elle n'a plus de `membre_id`, donc le
    // balayage de famille par les membres ne la retrouverait pas.
    await admin.from('demandes_membre').delete().eq('id', demande.id)
  })
})
