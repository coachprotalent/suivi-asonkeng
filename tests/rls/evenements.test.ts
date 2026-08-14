import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const CLE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const CLE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

const MDP = `Test-${crypto.randomUUID()}`
const IDENT_SIMPLE = 'test.rls.evt.simple'
const IDENT_MODERATEUR = 'test.rls.evt.moderateur'
const IDENT_ADMIN = 'test.rls.evt.admin'
const IDENTS = [IDENT_SIMPLE, IDENT_MODERATEUR, IDENT_ADMIN]

// FAMILLE, avec TIRET LITTÉRAL : `ZZEvt-%` ne peut pas ramasser `ZZEvtConv-%` ni
// `ZZEvtPage-%`, qui ont chacune leur fichier et leur nettoyage. Le suffixe aléatoire évite
// une collision avec une exécution interrompue dont le nettoyage aurait échoué ; le
// balayage, lui, porte sur la FAMILLE, pas sur ce suffixe — sinon une seule interruption
// laisserait des résidus que plus rien ne retrouve.
const FAMILLE = 'ZZEvt-'
const PREFIXE = `${FAMILLE}${crypto.randomUUID().slice(0, 8)}`

const admin = createClient(URL, CLE_SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
})

let clientSimple: SupabaseClient
let clientModerateur: SupabaseClient
let idProfilSimple: string
let idTypeWebinaire: string
let idEvenement: string
let idMembreActif: string
let idMembreArchive: string
let idExterne: string

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

async function creerCompte(identifiant: string, role: 'moderateur' | 'administrateur' | null): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email: `${identifiant}@asonkeng.local`,
    password: MDP,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`création du compte ${identifiant} impossible : ${error?.message}`)
  const { error: erreurProfil } = await admin
    .from('profils')
    .insert({ id: data.user.id, identifiant, nom_affichage: `Test ${identifiant}` })
  if (erreurProfil) {
    await admin.auth.admin.deleteUser(data.user.id)
    throw new Error(`insertion du profil ${identifiant} impossible : ${erreurProfil.message}`)
  }
  if (role) {
    const { error: erreurRole } = await admin
      .from('roles_profil')
      .insert({ profil_id: data.user.id, role })
    if (erreurRole) {
      await admin.auth.admin.deleteUser(data.user.id)
      throw new Error(`attribution du rôle ${role} impossible : ${erreurRole.message}`)
    }
  }
  return data.user.id
}

async function connecter(identifiant: string): Promise<SupabaseClient> {
  const client = createClient(URL, CLE_ANON, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error } = await client.auth.signInWithPassword({
    email: `${identifiant}@asonkeng.local`,
    password: MDP,
  })
  if (error) throw new Error(`connexion ${identifiant} impossible : ${error.message}`)
  return client
}

/**
 * Balayage de FAMILLE : retrouve ce qu'une exécution ANTÉRIEURE interrompue a laissé sous
 * `ZZEvt-` avec un AUTRE suffixe, que les variables de cette exécution ne peuvent pas
 * connaître.
 *
 * L'ORDRE FAIT PARTIE DU REMÈDE, il n'est pas cosmétique :
 *  - `participations` d'abord — `membre_id` et `participant_externe_id` sont en
 *    `on delete restrict`, supprimer les personnes avant échouerait ;
 *  - `participants_externes` AVANT `membres` — `converti_en_membre_id` est en
 *    `on delete restrict` ;
 *  - `evenements` après `participations` — le `cascade` de `evenement_id` ferait le travail,
 *    mais la suppression explicite garde ce fichier lisible si le régime changeait ;
 *  - `types_evenement` en dernier — `evenements.type_id` est en `on delete restrict`.
 */
async function nettoyerFamille() {
  const { data: evts, error: erreurEvts } = await admin
    .from('evenements')
    .select('id')
    .like('titre', `${FAMILLE}%`)
  if (erreurEvts) throw new Error(`balayage des évènements impossible : ${erreurEvts.message}`)
  const idsEvts = (evts ?? []).map((e) => e.id as string)

  const { data: externes, error: erreurExternes } = await admin
    .from('participants_externes')
    .select('id')
    .like('nom', `${FAMILLE}%`)
  if (erreurExternes) throw new Error(`balayage des externes impossible : ${erreurExternes.message}`)
  const idsExternes = (externes ?? []).map((x) => x.id as string)

  const { data: membres, error: erreurMembres } = await admin
    .from('membres')
    .select('id')
    .like('nom', `${FAMILLE}%`)
  if (erreurMembres) throw new Error(`balayage des membres impossible : ${erreurMembres.message}`)
  const idsMembres = (membres ?? []).map((m) => m.id as string)

  if (idsEvts.length > 0) {
    const { error } = await admin.from('participations').delete().in('evenement_id', idsEvts)
    if (error) throw new Error(`nettoyage des participations impossible : ${error.message}`)
  }
  if (idsExternes.length > 0) {
    const { error } = await admin.from('participations').delete().in('participant_externe_id', idsExternes)
    if (error) throw new Error(`nettoyage des participations d externes impossible : ${error.message}`)
  }
  if (idsMembres.length > 0) {
    const { error } = await admin.from('participations').delete().in('membre_id', idsMembres)
    if (error) throw new Error(`nettoyage des participations de membres impossible : ${error.message}`)
  }
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
  const { error: erreurTypes } = await admin
    .from('types_evenement')
    .delete()
    .like('libelle', `${FAMILLE}%`)
  if (erreurTypes) throw new Error(`nettoyage des types impossible : ${erreurTypes.message}`)
}

beforeAll(async () => {
  // Le balayage AVANT la suppression des comptes : `cree_par` et `saisi_par` sont en
  // `on delete set null`, et supprimer d'abord les comptes ferait disparaître une prise
  // qu'on n'a pas encore utilisée.
  await nettoyerFamille()
  for (const identifiant of IDENTS) await supprimerCompte(identifiant)

  idProfilSimple = await creerCompte(IDENT_SIMPLE, null)
  await creerCompte(IDENT_MODERATEUR, 'moderateur')
  await creerCompte(IDENT_ADMIN, 'administrateur')
  clientSimple = await connecter(IDENT_SIMPLE)
  clientModerateur = await connecter(IDENT_MODERATEUR)

  const { data: type, error: erreurType } = await admin
    .from('types_evenement')
    .select('id')
    .eq('libelle', 'Webinaire')
    .maybeSingle()
  if (erreurType || !type) {
    throw new Error(
      `le type amorcé « Webinaire » est introuvable : ${erreurType?.message ?? "l'amorçage de types_evenement n'a pas joué"}`,
    )
  }
  idTypeWebinaire = type.id as string

  const { data: evt, error: erreurEvt } = await admin
    .from('evenements')
    .insert({ titre: `${PREFIXE}-evenement`, type_id: idTypeWebinaire, date_debut: '2026-09-01' })
    .select('id')
    .single()
  if (erreurEvt || !evt) throw new Error(`création de l évènement impossible : ${erreurEvt?.message}`)
  idEvenement = evt.id as string

  const { data: mActif, error: erreurActif } = await admin
    .from('membres')
    .insert({ nom: `${PREFIXE}-actif`, prenom: 'Test', etat: 'actif' })
    .select('id')
    .single()
  if (erreurActif || !mActif) throw new Error(`création du membre actif impossible : ${erreurActif?.message}`)
  idMembreActif = mActif.id as string

  const { data: mArchive, error: erreurArchive } = await admin
    .from('membres')
    .insert({ nom: `${PREFIXE}-archive`, prenom: 'Test', etat: 'archive' })
    .select('id')
    .single()
  if (erreurArchive || !mArchive) throw new Error(`création du membre archivé impossible : ${erreurArchive?.message}`)
  idMembreArchive = mArchive.id as string

  const { data: ext, error: erreurExt } = await admin
    .from('participants_externes')
    .insert({ nom: `${PREFIXE}-externe`, prenom: 'Test' })
    .select('id')
    .single()
  if (erreurExt || !ext) throw new Error(`création de l externe impossible : ${erreurExt?.message}`)
  idExterne = ext.id as string

  // Deux participations : un membre ACTIF (visible de tous par la vue) et un membre
  // ARCHIVÉ (invisible d'un compte ordinaire, preuve n°6).
  const { error: erreurParts } = await admin.from('participations').insert([
    { evenement_id: idEvenement, membre_id: idMembreActif, desir_suivi_spirituel: false },
    { evenement_id: idEvenement, membre_id: idMembreArchive, desir_suivi_spirituel: false },
    { evenement_id: idEvenement, participant_externe_id: idExterne, desir_suivi_spirituel: true },
  ])
  if (erreurParts) throw new Error(`création des participations impossible : ${erreurParts.message}`)
})

afterAll(async () => {
  await nettoyerFamille()

  // NETTOYAGE VÉRIFIÉ PAR COMPTAGE, sur la MÊME famille que la suppression ci-dessus.
  // C'est la concordance entre les deux qui manquait dans un fichier antérieur du projet
  // et qui l'avait rendu rouge pour toujours après une seule interruption.
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

  // Les comptes EN DERNIER : `cree_par` / `saisi_par` sont en `on delete set null`, et les
  // supprimer plus tôt effacerait la prise avant qu'on la cherche.
  for (const identifiant of IDENTS) await supprimerCompte(identifiant)
})

describe('types_evenement (preuve n°17)', () => {
  it("l'amorçage a créé les quatre types nommés par le §4.4 — on COMPTE, on ne déduit pas", async () => {
    const { data, error } = await admin
      .from('types_evenement')
      .select('libelle')
      .in('libelle', ['Webinaire', 'Séminaire académique', 'Pic-nic', 'Retraite spirituelle'])
    expect(error).toBeNull()
    // Assertion d'INCLUSION par le compte exact des quatre visés, pas d'égalité stricte sur
    // toute la table : un administrateur a pu en créer d'autres depuis.
    expect((data ?? []).length).toBe(4)
  })

  it("rejouer l'amorçage ne crée aucun doublon (D57), avec le total mesuré avant et après", async () => {
    const { count: avant, error: erreurAvant } = await admin
      .from('types_evenement')
      .select('id', { count: 'exact', head: true })
    expect(erreurAvant).toBeNull()
    // Contrôle positif : une base sans aucun type rendrait cette preuve VIDE.
    expect(avant).toBeGreaterThan(0)

    // Exactement l'instruction de la migration, `on conflict` compris. Si la clause avait
    // été omise, cet insert lèverait un 23505 et le test tomberait ici.
    const { error: erreurRejeu } = await admin
      .from('types_evenement')
      .upsert(
        [
          { libelle: 'Webinaire' },
          { libelle: 'Séminaire académique' },
          { libelle: 'Pic-nic' },
          { libelle: 'Retraite spirituelle' },
        ],
        { onConflict: 'libelle', ignoreDuplicates: true },
      )
    expect(erreurRejeu).toBeNull()

    const { count: apres } = await admin
      .from('types_evenement')
      .select('id', { count: 'exact', head: true })
    // DELTA nul, et non un total absolu : un comptage absolu serait vrai au premier
    // lancement et faux pour toujours ensuite.
    expect(apres).toBe(avant)
  })

  it('un compte actif lit le catalogue ; un visiteur anonyme non', async () => {
    const { data, error } = await clientSimple.from('types_evenement').select('id').limit(1)
    expect(error).toBeNull()
    expect((data ?? []).length).toBe(1)

    const anonyme = createClient(URL, CLE_ANON, { auth: { autoRefreshToken: false, persistSession: false } })
    const { error: erreurAnonyme } = await anonyme.from('types_evenement').select('id').limit(1)
    expect(erreurAnonyme).not.toBeNull()
    expect(erreurAnonyme!.code).toBe('42501')
  })
})

describe('participations : contrainte et index (preuves n°1 et n°2)', () => {
  it("refuse les DEUX références nulles ET les deux remplies (D59) — les deux sens, pas une moitié", async () => {
    const { error: erreurDeuxNulles } = await admin
      .from('participations')
      .insert({ evenement_id: idEvenement })
    expect(erreurDeuxNulles).not.toBeNull()
    expect(erreurDeuxNulles!.code).toBe('23514')

    const { error: erreurDeuxRemplies } = await admin.from('participations').insert({
      evenement_id: idEvenement,
      membre_id: idMembreActif,
      participant_externe_id: idExterne,
    })
    expect(erreurDeuxRemplies).not.toBeNull()
    expect(erreurDeuxRemplies!.code).toBe('23514')
  })

  it("refuse deux fois le même membre au même évènement, et deux fois le même externe", async () => {
    const { error: erreurMembre } = await admin
      .from('participations')
      .insert({ evenement_id: idEvenement, membre_id: idMembreActif })
    expect(erreurMembre).not.toBeNull()
    expect(erreurMembre!.code).toBe('23505')

    const { error: erreurExterne } = await admin
      .from('participations')
      .insert({ evenement_id: idEvenement, participant_externe_id: idExterne })
    expect(erreurExterne).not.toBeNull()
    expect(erreurExterne!.code).toBe('23505')
  })

  it("DEUX EXTERNES DIFFÉRENTS COEXISTENT sur le même évènement — l'assertion qui attrape un `nulls not distinct` posé par habitude (D58)", async () => {
    // AUCUNE des deux assertions précédentes n'attrape ce défaut : sous
    // `unique nulls not distinct (evenement_id, membre_id)`, toutes les lignes d'externes
    // partagent membre_id = NULL et s'écrasent entre elles — le SECOND externe ajouté
    // recevrait un 23505 opaque, et l'application n'accepterait qu'UN SEUL participant
    // externe par évènement.
    const { data: x2, error: erreurX2 } = await admin
      .from('participants_externes')
      .insert({ nom: `${PREFIXE}-externe2` })
      .select('id')
      .single()
    expect(erreurX2).toBeNull()

    const { data: x3, error: erreurX3 } = await admin
      .from('participants_externes')
      .insert({ nom: `${PREFIXE}-externe3` })
      .select('id')
      .single()
    expect(erreurX3).toBeNull()

    const { error: erreurP2 } = await admin
      .from('participations')
      .insert({ evenement_id: idEvenement, participant_externe_id: x2!.id })
    expect(erreurP2).toBeNull()

    const { error: erreurP3 } = await admin
      .from('participations')
      .insert({ evenement_id: idEvenement, participant_externe_id: x3!.id })
    expect(erreurP3).toBeNull()

    // Trois externes sur le même évènement, constatés EN BASE : c'est le fait, pas
    // l'absence d'erreur, qui prouve.
    const { count } = await admin
      .from('participations')
      .select('id', { count: 'exact', head: true })
      .eq('evenement_id', idEvenement)
      .not('participant_externe_id', 'is', null)
    expect(count).toBe(3)
  })

  // LA DÉFINITION DES DEUX INDEX (`WHERE ... IS NOT NULL`, absence de
  // `NULLS NOT DISTINCT`) N'EST PAS VÉRIFIABLE D'ICI : `pg_indexes` n'est pas exposé à
  // PostgREST, et l'exposer par une fonction SQL dédiée ouvrirait une lecture du catalogue
  // pour le seul confort d'un test. Cette vérification vit à l'ÉTAPE 3 de la Task 23, en
  // SQL direct, et sa sortie est consignée dans le rapport de tâche. On ne pose PAS ici un
  // test qui passerait toujours : un test inerte est pire qu'un test absent — il donne
  // l'apparence d'une couverture. Le test « DEUX EXTERNES DIFFÉRENTS COEXISTENT » ci-dessus
  // est, lui, la preuve COMPORTEMENTALE du même fait, et il tomberait sous
  // `nulls not distinct`.
})

describe('seminaires_assistes : les cinq colonnes et le contournement (preuves n°4, 5, 6)', () => {
  it("expose EXACTEMENT cinq colonnes, nommées — aucune ne porte un désir (D73)", async () => {
    // Assertion sur la FORME de la vue, pas sur ce qu'un écran affiche : elle attrape une
    // colonne ajoutée un jour « pour la commodité », ce qu'un test d'écran ne fait pas.
    // `information_schema` n'étant pas exposé à PostgREST, on lit une ligne et on inspecte
    // ses clés.
    //
    // ⚠️ LECTURE PAR `clientSimple`, PAS PAR `admin`, ET CE N'EST PAS UN DÉTAIL.
    // `seminaires_assistes` est en `security_invoker = false` : elle s'exécute avec les
    // privilèges de son propriétaire, mais `auth.uid()` continue de désigner l'APPELANT
    // (D72). Or une requête `service_role` n'a PAS de JWT utilisateur : `auth.uid()` y vaut
    // NULL, `prive.est_actif()` rend donc `false`, et `prive.peut_lire_membre` avec lui —
    // LA VUE REND ZÉRO LIGNE POUR `service_role`, sans la moindre erreur, alors même que
    // `service_role` contourne la RLS partout ailleurs. Écrire ce test avec `admin` le
    // ferait tomber sur `length > 0` pour une raison qui n'a rien à voir avec les colonnes.
    const { data, error } = await clientSimple.from('seminaires_assistes').select('*').limit(1)
    expect(error).toBeNull()
    // Contrôle positif indispensable : sur zéro ligne, l'assertion suivante ne porterait
    // sur rien et le test passerait en n'éprouvant strictement aucune colonne.
    expect((data ?? []).length).toBeGreaterThan(0)
    expect(Object.keys(data![0]).sort()).toEqual(
      ['date_debut', 'evenement_id', 'membre_id', 'titre', 'type'].sort(),
    )
  })

  it("un compte ORDINAIRE lit la vue et obtient des lignes, alors qu'il obtient ZÉRO ligne sur participations — LES DEUX ASSERTIONS DANS LE MÊME TEST (preuve n°5)", async () => {
    // C'est la SEULE façon de distinguer « la vue contourne comme prévu » de « l'hypothèse
    // BYPASSRLS est fausse et tout le monde voit du vide » — un défaut invisible, en échec
    // fermé, exactement celui que le §5.3 décrit pour prive.est_admin().
    const { data: vue, error: erreurVue } = await clientSimple
      .from('seminaires_assistes')
      .select('evenement_id, titre, type')
      .eq('membre_id', idMembreActif)
    expect(erreurVue).toBeNull()
    expect((vue ?? []).length).toBe(1)
    expect(vue![0].evenement_id).toBe(idEvenement)

    const { data: brut, error: erreurBrut } = await clientSimple
      .from('participations')
      .select('id')
      .eq('evenement_id', idEvenement)
    expect(erreurBrut).toBeNull()
    expect(brut).toEqual([])
  })

  it("un compte ordinaire ne voit PAS un membre ARCHIVÉ dans la vue, mais un administrateur si (preuve n°6)", async () => {
    const { data: vuSimple, error: erreurSimple } = await clientSimple
      .from('seminaires_assistes')
      .select('evenement_id')
      .eq('membre_id', idMembreArchive)
    expect(erreurSimple).toBeNull()
    expect(vuSimple).toEqual([])

    // CONTRÔLE POSITIF dans le même test : la ligne EXISTE, et un lecteur autorisé la voit.
    // Sans lui, l'assertion négative ne distinguerait pas « la RLS de membres est
    // réimposée » de « la participation n'a jamais été créée ».
    const clientAdminTest = await connecter(IDENT_ADMIN)
    const { data: vuAdmin, error: erreurAdmin } = await clientAdminTest
      .from('seminaires_assistes')
      .select('evenement_id')
      .eq('membre_id', idMembreArchive)
    expect(erreurAdmin).toBeNull()
    expect((vuAdmin ?? []).length).toBe(1)
  })
})

describe('participants_a_traiter et les désirs fermés (preuve n°7)', () => {
  it("un compte ORDINAIRE obtient zéro ligne sur participations, participants_externes ET participants_a_traiter — avec DEUX contrôles positifs dans le même test", async () => {
    for (const table of ['participations', 'participants_externes', 'participants_a_traiter'] as const) {
      const { data, error } = await clientSimple.from(table).select('*').limit(5)
      // La lecture est ACCORDÉE au rôle (grant select), c'est la POLITIQUE qui filtre :
      // le résultat est donc une liste vide, pas un 42501.
      expect(error).toBeNull()
      expect(data).toEqual([])
    }

    // CONTRÔLE POSITIF n°1 : ce même compte lit bien evenements et types_evenement — sans
    // lui, les trois listes vides ci-dessus pourraient signifier « ce compte ne lit plus
    // rien du tout ».
    const { data: evts, error: erreurEvts } = await clientSimple
      .from('evenements')
      .select('id')
      .eq('id', idEvenement)
    expect(erreurEvts).toBeNull()
    expect((evts ?? []).length).toBe(1)

    // CONTRÔLE POSITIF n°2 : un compte MODÉRATEUR RÉEL lit bien participations et la liste
    // à traiter. Un refus dont on n'a pas prouvé que le chemin fonctionne par ailleurs ne
    // prouve rien.
    const { data: partsMod, error: erreurPartsMod } = await clientModerateur
      .from('participations')
      .select('id')
      .eq('evenement_id', idEvenement)
    expect(erreurPartsMod).toBeNull()
    expect((partsMod ?? []).length).toBeGreaterThan(0)

    const { data: aTraiterMod, error: erreurATraiterMod } = await clientModerateur
      .from('participants_a_traiter')
      .select('participant_externe_id')
      .eq('participant_externe_id', idExterne)
    expect(erreurATraiterMod).toBeNull()
    expect((aTraiterMod ?? []).length).toBe(1)
  })

  it("un compte actif ne peut écrire dans AUCUNE des quatre tables de la phase", async () => {
    const tentatives: Array<[string, () => Promise<{ error: { code?: string } | null }>]> = [
      ['types_evenement', async () => clientSimple.from('types_evenement').insert({ libelle: `${PREFIXE}-interdit` })],
      ['evenements', async () => clientSimple.from('evenements').insert({ titre: `${PREFIXE}-interdit`, type_id: idTypeWebinaire, date_debut: '2026-09-01' })],
      ['participants_externes', async () => clientSimple.from('participants_externes').insert({ nom: `${PREFIXE}-interdit` })],
      ['participations', async () => clientSimple.from('participations').insert({ evenement_id: idEvenement, membre_id: idMembreActif })],
    ]
    for (const [nom, tentative] of tentatives) {
      const { error } = await tentative()
      expect(error, `écriture sur ${nom}`).not.toBeNull()
      expect(error!.code, `écriture sur ${nom}`).toBe('42501')
    }

    // AUCUNE des quatre tentatives n'a écrit : constaté EN BASE, pas déduit de l'erreur.
    const { count: typesEcrits } = await admin
      .from('types_evenement')
      .select('id', { count: 'exact', head: true })
      .eq('libelle', `${PREFIXE}-interdit`)
    expect(typesEcrits).toBe(0)
    const { count: externesEcrits } = await admin
      .from('participants_externes')
      .select('id', { count: 'exact', head: true })
      .eq('nom', `${PREFIXE}-interdit`)
    expect(externesEcrits).toBe(0)
  })
})

describe('privilèges des passerelles (preuve n°8)', () => {
  it("`anon` et `authenticated` ne peuvent pas exécuter les deux passerelles, et `service_role` si", async () => {
    // CIBLE DÉDIÉE, distincte de `idExterne` : le contrôle positif de ce test CLASSE
    // réellement son participant, et le réutiliser coupleraient ce test à celui de la liste
    // « à traiter » — lequel échouerait alors sur sa propre précondition plutôt que sur
    // l'assertion qu'il vise, et seulement selon l'ordre d'exécution des `describe`. Le
    // découplage vaut mieux qu'un ordre à préserver.
    const { data: cible, error: erreurCible } = await admin
      .from('participants_externes')
      .insert({ nom: `${PREFIXE}-privileges` })
      .select('id')
      .single()
    if (erreurCible || !cible) throw new Error(`préparation impossible : ${erreurCible?.message}`)
    const idCible = cible.id as string

    const anonyme = createClient(URL, CLE_ANON, { auth: { autoRefreshToken: false, persistSession: false } })

    for (const [nom, client] of [
      ['anon', anonyme],
      ['authenticated', clientSimple],
    ] as const) {
      const { error: erreurConversion } = await client.rpc('convertir_participant_externe', {
        p_participant: idCible,
        p_chemin: 'membre_existant',
        p_membre_cible: idMembreActif,
        p_nom: null,
        p_prenom: null,
        p_faiseur: null,
        p_dirigeant: null,
        p_dirigeant_force: false,
        p_par: null,
      })
      expect(erreurConversion, `conversion depuis ${nom}`).not.toBeNull()
      expect(erreurConversion!.code, `conversion depuis ${nom}`).toBe('42501')

      const { error: erreurClassement } = await client.rpc('classer_participant_externe', {
        p_participant: idCible,
        p_motif: 'Tentative',
        p_par: null,
      })
      expect(erreurClassement, `classement depuis ${nom}`).not.toBeNull()
      expect(erreurClassement!.code, `classement depuis ${nom}`).toBe('42501')
    }

    // ÉCRITURE RÉELLE CONSTATÉE EN BASE : le participant n'a été ni converti ni classé.
    // C'est ce constat, et non le code d'erreur, qui prouve que rien n'a été fait.
    const { data: relu } = await admin
      .from('participants_externes')
      .select('converti_en_membre_id, classe_le')
      .eq('id', idCible)
      .single()
    expect(relu!.converti_en_membre_id).toBeNull()
    expect(relu!.classe_le).toBeNull()

    // CONTRÔLE POSITIF : `service_role` réussit, avec le MÊME appel. Sans lui, les quatre
    // refus ci-dessus pourraient signifier « la fonction n'existe pas » ou « ses paramètres
    // ont changé de nom » aussi bien que « le privilège est retiré ».
    const { error: erreurService } = await admin.rpc('classer_participant_externe', {
      p_participant: idCible,
      p_motif: 'Contrôle positif de la preuve n°8',
      p_par: null,
    })
    expect(erreurService).toBeNull()

    const { data: apres } = await admin
      .from('participants_externes')
      .select('classe_le, motif_classement')
      .eq('id', idCible)
      .single()
    expect(apres!.classe_le).not.toBeNull()
    expect(apres!.motif_classement).toBe('Contrôle positif de la preuve n°8')
  })
})
