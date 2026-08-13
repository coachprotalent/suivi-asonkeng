import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const CLE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const CLE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

const MDP = `Test-${crypto.randomUUID()}`
const IDENT = 'test.rls.ael.simple'
const PREFIXE = `ZZAel-${crypto.randomUUID().slice(0, 8)}`
const NOM_ANTENNE = `${PREFIXE}-Antenne`

const admin = createClient(URL, CLE_SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
})

let idProfil: string
let clientSimple: SupabaseClient
let idAntenne: string
let idAntenneExistante: string

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

beforeAll(async () => {
  await supprimerCompte(IDENT)
  await admin.from('antennes').delete().eq('nom', NOM_ANTENNE)

  // Une antenne fraîchement créée n'a AUCUNE ligne dans `calendriers_ael` : l'amorçage
  // de la migration est un `insert ... select` ponctuel, joué UNE SEULE FOIS au moment
  // où la migration s'applique, sur les antennes ACTIVES qui existaient alors (Cameroun,
  // Batouri, France) — ce n'est pas un déclencheur permanent. On le vérifie donc contre
  // une antenne PRÉEXISTANTE, jamais contre celle créée par ce test.
  // `.eq('actif', true)` est obligatoire, pas décoratif : l'amorçage porte un
  // `where a.actif` (migration de cette tâche), et tomber sur une antenne désactivée
  // ferait échouer l'assertion d'inclusion ci-dessous pour une raison qui n'aurait rien
  // à voir avec l'amorçage.
  const { data: antenneExistante, error: erreurExistante } = await admin
    .from('antennes')
    .select('id')
    .eq('actif', true)
    .limit(1)
    .single()
  if (erreurExistante || !antenneExistante) {
    throw new Error(
      `Aucune antenne active préexistante en base pour vérifier l'amorçage : ${erreurExistante?.message}`,
    )
  }
  idAntenneExistante = antenneExistante.id as string

  const { data: antenne, error: erreurAntenne } = await admin
    .from('antennes')
    .insert({ nom: NOM_ANTENNE, pays: 'Test' })
    .select('id')
    .single()
  if (erreurAntenne || !antenne) throw new Error(`création de l'antenne impossible : ${erreurAntenne?.message}`)
  idAntenne = antenne.id as string

  const { data, error } = await admin.auth.admin.createUser({
    email: `${IDENT}@asonkeng.local`,
    password: MDP,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`création du compte impossible : ${error?.message}`)
  idProfil = data.user.id
  const { error: erreurProfil } = await admin
    .from('profils')
    .insert({ id: idProfil, identifiant: IDENT, nom_affichage: 'Test AEL' })
  if (erreurProfil) throw new Error(`insertion du profil impossible : ${erreurProfil.message}`)

  clientSimple = createClient(URL, CLE_ANON, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error: erreurConnexion } = await clientSimple.auth.signInWithPassword({
    email: `${IDENT}@asonkeng.local`,
    password: MDP,
  })
  if (erreurConnexion) throw new Error(`connexion impossible : ${erreurConnexion.message}`)
})

afterAll(async () => {
  // `calendriers_ael.antenne_id` est en `on delete restrict` : un créneau créé par un
  // test et oublié ferait ÉCHOUER la suppression de l'antenne ci-dessous, sans que rien
  // ne le dise — et l'antenne de test, avec son créneau, resterait définitivement en
  // base de PRODUCTION, visible dans le sélecteur d'antenne d'une fiche membre, dans
  // `/ael/calendriers` et dans le formulaire de séance manuelle. On supprime donc les
  // créneaux AVANT l'antenne, et on vérifie l'erreur de la suppression de l'antenne.
  await admin.from('calendriers_ael').delete().eq('antenne_id', idAntenne)
  const { error: erreurAntenne } = await admin.from('antennes').delete().eq('nom', NOM_ANTENNE)
  expect(erreurAntenne).toBeNull()
  await supprimerCompte(IDENT)

  // Nettoyage VÉRIFIÉ PAR COMPTAGE (contrainte globale n°13) : plus aucune antenne ni
  // aucun membre portant le préfixe de cette suite ne subsiste. `ZZAel-%` exige le tiret
  // littéral et ne peut donc pas ramasser les préfixes des suites e2e
  // (`ZZAelPointage-`, `ZZAelPreuves-`). Un reste ici signale une fuite dans un des
  // blocs `afterAll` internes, pas un faux positif.
  const { data: antennesRestantes } = await admin.from('antennes').select('id').like('nom', 'ZZAel-%')
  expect(antennesRestantes).toEqual([])
  const { data: membresRestants } = await admin.from('membres').select('id').like('nom', `${PREFIXE}-%`)
  expect(membresRestants).toEqual([])
})

describe('calendriers_ael', () => {
  it("l'amorçage a créé au moins mardi, mercredi et samedi pour une antenne préexistante", async () => {
    // CONTRÔLE POSITIF avant tout : sans lui, une politique de lecture cassée
    // laisserait ce test conclure « aucun créneau » aussi bien qu'un amorçage manquant.
    // Assertion d'INCLUSION et non d'égalité stricte : cette antenne préexistante peut
    // avoir reçu d'autres créneaux depuis (via l'écran de la Task 13, ou une exécution
    // antérieure de cette suite) — seule la présence des trois jours amorcés est
    // garantie par la migration, pas l'absence de tout autre.
    const { data, error } = await admin
      .from('calendriers_ael')
      .select('jour_semaine')
      .eq('antenne_id', idAntenneExistante)
    expect(error).toBeNull()
    const joursPresents = (data ?? []).map((l) => l.jour_semaine as number)
    expect(joursPresents.length).toBeGreaterThan(0)
    expect(joursPresents).toEqual(expect.arrayContaining([2, 3, 6]))
  })

  it("l'antenne créée par ce test n'a, elle, aucun créneau : l'amorçage n'est pas permanent", async () => {
    // Distingue explicitement l'amorçage PONCTUEL (à l'application de la migration) d'un
    // éventuel déclencheur permanent, que cette migration ne pose PAS. Sans ce test,
    // l'assertion précédente pourrait laisser croire que toute antenne reçoit ses trois
    // créneaux par magie — ce que le §13 (créneaux ajoutés par l'écran) contredit.
    const { data, error } = await admin.from('calendriers_ael').select('id').eq('antenne_id', idAntenne)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it("un compte actif lit les calendriers de l'antenne préexistante", async () => {
    const { data, error } = await clientSimple
      .from('calendriers_ael')
      .select('jour_semaine')
      .eq('antenne_id', idAntenneExistante)
    expect(error).toBeNull()
    expect((data ?? []).length).toBeGreaterThan(0)
  })

  it('un visiteur anonyme se voit refuser la lecture', async () => {
    const clientAnonyme = createClient(URL, CLE_ANON, { auth: { autoRefreshToken: false, persistSession: false } })
    const { data, error } = await clientAnonyme
      .from('calendriers_ael')
      .select('id')
      .eq('antenne_id', idAntenneExistante)
    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')
    expect(data).toBeNull()
  })

  it('un compte actif ne peut pas écrire dans calendriers_ael', async () => {
    const { error } = await clientSimple
      .from('calendriers_ael')
      .insert({ antenne_id: idAntenne, jour_semaine: 1 })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')

    const { data } = await admin.from('calendriers_ael').select('id').eq('antenne_id', idAntenne).eq('jour_semaine', 1)
    expect(data).toEqual([])
  })

  it('refuse un jour de semaine hors de 1 à 7', async () => {
    const { error } = await admin.from('calendriers_ael').insert({ antenne_id: idAntenne, jour_semaine: 8 })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('23514')
  })

  it("refuse deux créneaux identiques pour la même antenne, heure nulle comprise, avec contrôle positif", async () => {
    // Le doublon le plus probable est celui SANS heure : c'est la forme amorcée par la
    // migration et le champ « Heure » du formulaire (Task 13) est optionnel. Sans
    // `nulls not distinct`, ce cas précis échapperait à la contrainte.
    const { data: premier, error: erreurPremier } = await admin
      .from('calendriers_ael')
      .insert({ antenne_id: idAntenne, jour_semaine: 5 })
      .select('id')
      .single()
    expect(erreurPremier).toBeNull()

    const { error: erreurDoublon } = await admin
      .from('calendriers_ael')
      .insert({ antenne_id: idAntenne, jour_semaine: 5 })
    expect(erreurDoublon).not.toBeNull()
    expect(erreurDoublon!.code).toBe('23505')

    // Doublon avec heure, cette fois : même antenne, même jour, même heure.
    const { data: horodate, error: erreurHorodate } = await admin
      .from('calendriers_ael')
      .insert({ antenne_id: idAntenne, jour_semaine: 5, heure: '18:00' })
      .select('id')
      .single()
    expect(erreurHorodate).toBeNull()

    const { error: erreurDoublonHorodate } = await admin
      .from('calendriers_ael')
      .insert({ antenne_id: idAntenne, jour_semaine: 5, heure: '18:00' })
    expect(erreurDoublonHorodate).not.toBeNull()
    expect(erreurDoublonHorodate!.code).toBe('23505')

    // CONTRÔLE POSITIF, dans le MÊME test : un créneau qui ne diffère que par l'heure,
    // ou que par le jour, reste accepté — sans lui, les refus ci-dessus pourraient
    // aussi bien signifier « cette antenne ne peut plus recevoir aucun créneau ».
    const { data: autreHeure, error: erreurAutreHeure } = await admin
      .from('calendriers_ael')
      .insert({ antenne_id: idAntenne, jour_semaine: 5, heure: '19:30' })
      .select('id')
      .single()
    expect(erreurAutreHeure).toBeNull()

    await admin
      .from('calendriers_ael')
      .delete()
      .in('id', [premier!.id, horodate!.id, autreHeure!.id])
  })
})

describe('seances_ael, seances_ael_antennes, presences_ael', () => {
  let idSeance: string
  let idMembre: string

  beforeAll(async () => {
    const { data: membre, error: erreurMembre } = await admin
      .from('membres')
      .insert({ nom: `${PREFIXE}-membre`, prenom: 'Test' })
      .select('id')
      .single()
    if (erreurMembre || !membre) throw new Error(`création du membre impossible : ${erreurMembre?.message}`)
    idMembre = membre.id as string

    const { data: seance, error: erreurSeance } = await admin
      .from('seances_ael')
      .insert({ date: '2026-09-01' })
      .select('id')
      .single()
    if (erreurSeance || !seance) throw new Error(`création de la séance impossible : ${erreurSeance?.message}`)
    idSeance = seance.id as string

    const { error: erreurJonction } = await admin
      .from('seances_ael_antennes')
      .insert({ seance_id: idSeance, antenne_id: idAntenne })
    if (erreurJonction) throw new Error(`jonction impossible : ${erreurJonction.message}`)

    const { error: erreurPresence } = await admin
      .from('presences_ael')
      .insert({ seance_id: idSeance, membre_id: idMembre, present: true })
    if (erreurPresence) throw new Error(`présence impossible : ${erreurPresence.message}`)
  })

  afterAll(async () => {
    // Les enfants d'abord : `presences_ael` et `seances_ael_antennes` sont en
    // `on delete cascade` sur `seances_ael`, mais la suppression explicite garde ce
    // fichier lisible même si l'ordre des contraintes changeait un jour.
    await admin.from('presences_ael').delete().eq('seance_id', idSeance)
    await admin.from('seances_ael_antennes').delete().eq('seance_id', idSeance)
    await admin.from('seances_ael').delete().eq('id', idSeance)
    await admin.from('membres').delete().eq('id', idMembre)
  })

  it('un compte actif lit une séance, sa jonction et sa présence', async () => {
    const { data: seance, error: erreurSeance } = await clientSimple
      .from('seances_ael')
      .select('id, date')
      .eq('id', idSeance)
      .single()
    expect(erreurSeance).toBeNull()
    expect(seance?.date).toBe('2026-09-01')

    const { data: jonction } = await clientSimple
      .from('seances_ael_antennes')
      .select('antenne_id')
      .eq('seance_id', idSeance)
    expect(jonction).toEqual([{ antenne_id: idAntenne }])

    const { data: presence } = await clientSimple
      .from('presences_ael')
      .select('present')
      .eq('seance_id', idSeance)
      .eq('membre_id', idMembre)
    expect(presence).toEqual([{ present: true }])
  })

  it('un compte actif ne peut écrire sur aucune des trois tables', async () => {
    const { error: erreurSeance } = await clientSimple.from('seances_ael').insert({ date: '2026-09-08' })
    expect(erreurSeance).not.toBeNull()
    expect(erreurSeance!.code).toBe('42501')

    const { error: erreurJonction } = await clientSimple
      .from('seances_ael_antennes')
      .insert({ seance_id: idSeance, antenne_id: idAntenneExistante })
    expect(erreurJonction).not.toBeNull()
    expect(erreurJonction!.code).toBe('42501')

    const { error: erreurPresence } = await clientSimple
      .from('presences_ael')
      .update({ present: false })
      .eq('seance_id', idSeance)
      .eq('membre_id', idMembre)
      .select()
    expect(erreurPresence).not.toBeNull()
    // Même exigence que les deux branches précédentes : sans le code, une faute de
    // frappe dans le nom de la table validerait ce test aussi bien qu'un refus réel.
    expect(erreurPresence!.code).toBe('42501')

    // Aucune des trois tentatives n'a rien écrit.
    const { data: seances } = await admin.from('seances_ael').select('id').eq('date', '2026-09-08')
    expect(seances).toEqual([])
    const { data: presenceInchangee } = await admin
      .from('presences_ael')
      .select('present')
      .eq('seance_id', idSeance)
      .eq('membre_id', idMembre)
      .single()
    expect(presenceInchangee?.present).toBe(true)
  })

  it("l'exclusivité enseignant/modérateur (D36) refuse les deux champs à la fois, avec contrôle positif", async () => {
    const { error: erreurExclusiviteEnseignant } = await admin
      .from('seances_ael')
      .insert({ date: '2026-09-09', enseignant_membre_id: idMembre, enseignant_libre: 'Un intervenant' })
    expect(erreurExclusiviteEnseignant).not.toBeNull()
    expect(erreurExclusiviteEnseignant!.code).toBe('23514')

    const { error: erreurExclusiviteModerateur } = await admin
      .from('seances_ael')
      .insert({ date: '2026-09-09', moderateur_membre_id: idMembre, moderateur_libre: 'Un intervenant' })
    expect(erreurExclusiviteModerateur).not.toBeNull()
    expect(erreurExclusiviteModerateur!.code).toBe('23514')

    // CONTRÔLE POSITIF : un seul des deux champs, dans chaque paire, doit être accepté.
    const { data: seanceValide, error: erreurValide } = await admin
      .from('seances_ael')
      .insert({ date: '2026-09-09', enseignant_libre: 'Un intervenant', moderateur_membre_id: idMembre })
      .select('id')
      .single()
    expect(erreurValide).toBeNull()
    await admin.from('seances_ael').delete().eq('id', seanceValide!.id)
  })

  it('la contrainte unique de génération (D38, D39) refuse un doublon exact, avec contrôle positif', async () => {
    // L'antenne de test n'a par construction aucun calendrier amorcé (Task 6) : on en
    // crée un pour cette seule assertion, plutôt que de dépendre d'un état préexistant.
    // Ce créneau est SUPPRIMÉ en fin de test : `calendriers_ael.antenne_id` est en
    // `on delete restrict`, et l'oublier ferait échouer silencieusement la suppression
    // de l'antenne dans l'`afterAll` du fichier — l'antenne et son créneau resteraient
    // définitivement en base de production.
    const { data: calendrier, error: erreurCalendrier } = await admin
      .from('calendriers_ael')
      .insert({ antenne_id: idAntenne, jour_semaine: 2 })
      .select('id')
      .single()
    expect(erreurCalendrier).toBeNull()
    const idCalendrier = calendrier!.id as string

    const { data: premiere, error: erreurPremiere } = await admin
      .from('seances_ael')
      .insert({ date: '2026-09-15', calendrier_id: idCalendrier, genere_pour_le: '2026-09-15' })
      .select('id')
      .single()
    expect(erreurPremiere).toBeNull()

    const { error: erreurDoublon } = await admin
      .from('seances_ael')
      .insert({ date: '2026-09-15', calendrier_id: idCalendrier, genere_pour_le: '2026-09-15' })
    expect(erreurDoublon).not.toBeNull()
    expect(erreurDoublon!.code).toBe('23505')

    // CONTRÔLE POSITIF : une occurrence à une AUTRE date, même calendrier, est acceptée
    // — sans lui, le refus ci-dessus pourrait aussi bien signifier « ce calendrier ne
    // peut plus rien générer », pas « cette occurrence précise existe déjà ».
    const { data: autreDate, error: erreurAutreDate } = await admin
      .from('seances_ael')
      .insert({ date: '2026-09-22', calendrier_id: idCalendrier, genere_pour_le: '2026-09-22' })
      .select('id')
      .single()
    expect(erreurAutreDate).toBeNull()

    // Les séances d'abord (elles référencent le calendrier en `on delete restrict`),
    // le calendrier ensuite.
    await admin.from('seances_ael').delete().in('id', [premiere!.id, autreDate!.id])
    const { error: erreurNettoyageCalendrier } = await admin
      .from('calendriers_ael')
      .delete()
      .eq('id', idCalendrier)
    expect(erreurNettoyageCalendrier).toBeNull()
  })

  it('deux séances créées à la main (calendrier_id NULL) ne se bloquent jamais entre elles', async () => {
    const { data: premiere, error: erreurPremiere } = await admin
      .from('seances_ael')
      .insert({ date: '2026-10-01' })
      .select('id')
      .single()
    expect(erreurPremiere).toBeNull()

    const { data: seconde, error: erreurSeconde } = await admin
      .from('seances_ael')
      .insert({ date: '2026-10-01' })
      .select('id')
      .single()
    expect(erreurSeconde).toBeNull()

    await admin.from('seances_ael').delete().in('id', [premiere!.id, seconde!.id])
  })
})

describe('déclencheur de complétude (D37)', () => {
  it('refuse une insertion directement à `tenue` sans thème ni enseignant', async () => {
    const { error } = await admin.from('seances_ael').insert({ date: '2026-09-29', etat: 'tenue' })
    expect(error).not.toBeNull()
    expect(error!.details).toBe('seance_sans_theme')
  })

  it('refuse un thème présent mais un enseignant absent, avec un marqueur distinct', async () => {
    const { error } = await admin
      .from('seances_ael')
      .insert({ date: '2026-09-29', etat: 'tenue', theme: 'Un thème' })
    expect(error).not.toBeNull()
    expect(error!.details).toBe('seance_sans_enseignant')
  })

  it('refuse la TRANSITION vers `tenue` sur une séance existante incomplète', async () => {
    const { data: seance, error: erreurCreation } = await admin
      .from('seances_ael')
      .insert({ date: '2026-09-29' })
      .select('id')
      .single()
    expect(erreurCreation).toBeNull()

    const { error } = await admin
      .from('seances_ael')
      .update({ etat: 'tenue' })
      .eq('id', seance!.id)
    expect(error).not.toBeNull()
    expect(error!.details).toBe('seance_sans_theme')

    await admin.from('seances_ael').delete().eq('id', seance!.id)
  })

  it("n'agit jamais sur le sens retour, même sur une séance qui redeviendrait incomplète", async () => {
    const { data: membre, error: erreurMembre } = await admin
      .from('membres')
      .insert({ nom: `${PREFIXE}-enseignant`, prenom: 'Test' })
      .select('id')
      .single()
    // Sans ce contrôle, une création échouée produirait un `TypeError` opaque sur
    // `membre!.id` deux lignes plus bas, au lieu de nommer sa cause.
    if (erreurMembre || !membre) throw new Error(`création du membre impossible : ${erreurMembre?.message}`)

    const { data: seance, error: erreurCreation } = await admin
      .from('seances_ael')
      .insert({ date: '2026-09-29', theme: 'Un thème', enseignant_membre_id: membre!.id, etat: 'tenue' })
      .select('id')
      .single()
    expect(erreurCreation).toBeNull()

    // Repasser à `prevue` doit réussir MÊME si, dans le même mouvement, on efface le
    // thème : le sens retour n'est jamais surveillé par ce déclencheur (D49).
    const { error: erreurRetour } = await admin
      .from('seances_ael')
      .update({ etat: 'prevue', theme: null })
      .eq('id', seance!.id)
    expect(erreurRetour).toBeNull()

    // CONTRÔLE POSITIF, dans le MÊME test : redemander `tenue` sur cette même séance,
    // désormais sans thème, doit à nouveau être refusé — sans lui, le succès ci-dessus
    // pourrait aussi bien signifier « le déclencheur est cassé pour de bon », pas
    // « il ne surveille que le sens vers tenue ».
    const { error: erreurRetenter } = await admin
      .from('seances_ael')
      .update({ etat: 'tenue' })
      .eq('id', seance!.id)
    expect(erreurRetenter).not.toBeNull()
    expect(erreurRetenter!.details).toBe('seance_sans_theme')

    await admin.from('seances_ael').delete().eq('id', seance!.id)
    await admin.from('membres').delete().eq('id', membre!.id)
  })

  it('laisse tenir une séance complète, avec enseignant libre', async () => {
    const { data: seance, error } = await admin
      .from('seances_ael')
      .insert({
        date: '2026-09-29',
        etat: 'tenue',
        theme: 'Un thème',
        enseignant_libre: 'Un intervenant extérieur',
      })
      .select('id')
      .single()
    expect(error).toBeNull()
    await admin.from('seances_ael').delete().eq('id', seance!.id)
  })

  it("supprimer l'enseignant d'une séance TENUE échoue malgré le `on delete set null`, avec contrôle positif", async () => {
    // `seances_ael.enseignant_membre_id ... on delete set null` (Task 7) ne raconte pas
    // toute l'histoire : la mise à null est un UPDATE, donc CE déclencheur s'exécute.
    // Pour une séance déjà `tenue` sans `enseignant_libre`, l'état résultant serait
    // « tenue sans enseignant » et la suppression du membre est REFUSÉE. Ce test rend
    // ce comportement explicite et le verrouille : sans lui, un futur `nettoyer()` qui
    // supprimerait les membres avant les séances échouerait sur un message français
    // incompréhensible, que la règle n°8 du projet interdit précisément de discriminer.
    const { data: enseignantTenue, error: erreurEnseignantTenue } = await admin
      .from('membres')
      .insert({ nom: `${PREFIXE}-enseignant-suppression-tenue`, prenom: 'Test' })
      .select('id')
      .single()
    if (erreurEnseignantTenue || !enseignantTenue) {
      throw new Error(`création du membre impossible : ${erreurEnseignantTenue?.message}`)
    }

    const { data: seanceTenue, error: erreurSeanceTenue } = await admin
      .from('seances_ael')
      .insert({
        date: '2026-09-30',
        etat: 'tenue',
        theme: 'Un thème',
        enseignant_membre_id: enseignantTenue.id,
      })
      .select('id')
      .single()
    expect(erreurSeanceTenue).toBeNull()

    const { error: erreurSuppression } = await admin
      .from('membres')
      .delete()
      .eq('id', enseignantTenue.id)
    expect(erreurSuppression).not.toBeNull()
    // Marqueur posé par `using detail`, jamais le texte français du message (règle n°8).
    expect(erreurSuppression!.details).toBe('seance_sans_enseignant')

    // Le membre est TOUJOURS là : le refus n'est pas seulement une erreur rapportée.
    const { data: toujoursLa } = await admin.from('membres').select('id').eq('id', enseignantTenue.id)
    expect(toujoursLa).toHaveLength(1)

    // CONTRÔLE POSITIF, dans le MÊME test : le même geste sur une séance PRÉVUE réussit,
    // et `on delete set null` y joue normalement. Sans lui, le refus ci-dessus pourrait
    // aussi bien signifier « un membre référencé par une séance n'est jamais
    // supprimable », ce qui serait une tout autre règle.
    const { data: enseignantPrevue, error: erreurEnseignantPrevue } = await admin
      .from('membres')
      .insert({ nom: `${PREFIXE}-enseignant-suppression-prevue`, prenom: 'Test' })
      .select('id')
      .single()
    if (erreurEnseignantPrevue || !enseignantPrevue) {
      throw new Error(`création du membre impossible : ${erreurEnseignantPrevue?.message}`)
    }

    const { data: seancePrevue, error: erreurSeancePrevue } = await admin
      .from('seances_ael')
      .insert({ date: '2026-09-30', enseignant_membre_id: enseignantPrevue.id })
      .select('id')
      .single()
    expect(erreurSeancePrevue).toBeNull()

    const { error: erreurSuppressionPrevue } = await admin
      .from('membres')
      .delete()
      .eq('id', enseignantPrevue.id)
    expect(erreurSuppressionPrevue).toBeNull()

    const { data: apresSuppression } = await admin
      .from('seances_ael')
      .select('enseignant_membre_id')
      .eq('id', seancePrevue!.id)
      .single()
    expect(apresSuppression?.enseignant_membre_id).toBeNull()

    // Nettoyage : LA SÉANCE TENUE D'ABORD, son enseignant ensuite — l'ordre inverse
    // rejouerait le refus qu'on vient de prouver.
    await admin.from('seances_ael').delete().in('id', [seanceTenue!.id, seancePrevue!.id])
    await admin.from('membres').delete().eq('id', enseignantTenue.id)
  })
})

describe('vue compteurs_ael (D4, D44, D48)', () => {
  let idMembreCompteur: string
  let idEnseignant: string
  let idSeanceTenuePresent: string
  let idSeanceTenueAbsent: string
  let idSeancePrevue: string

  beforeAll(async () => {
    const { data: membre, error: erreurMembre } = await admin
      .from('membres')
      .insert({ nom: `${PREFIXE}-compteur`, prenom: 'Test', report_initial_ael: 5 })
      .select('id')
      .single()
    if (erreurMembre || !membre) throw new Error(`création du membre impossible : ${erreurMembre?.message}`)
    idMembreCompteur = membre.id as string

    const { data: enseignant, error: erreurEnseignant } = await admin
      .from('membres')
      .insert({ nom: `${PREFIXE}-enseignant-compteur`, prenom: 'Test' })
      .select('id')
      .single()
    if (erreurEnseignant || !enseignant) throw new Error(`création de l'enseignant impossible : ${erreurEnseignant?.message}`)
    idEnseignant = enseignant.id as string

    // Les trois lignes portent CHACUNE leur `etat` explicitement. Un lot hétérogène —
    // `etat` présent sur certaines lignes, absent sur d'autres — fait PostgREST insérer
    // NULL (jamais le défaut de colonne 'prevue') pour la ligne qui l'omet ; le
    // déclencheur de complétude (Task 8) compare `new.etat <> 'tenue'`, qui ne
    // court-circuite PAS sur NULL, et refuse alors la ligne comme si elle visait
    // 'tenue' — constaté en pratique (erreur seance_sans_theme) avant cette correction.
    const { data: seances, error: erreurSeances } = await admin
      .from('seances_ael')
      .insert([
        { date: '2026-09-01', etat: 'tenue', theme: 'T1', enseignant_membre_id: idEnseignant },
        { date: '2026-09-02', etat: 'tenue', theme: 'T2', enseignant_membre_id: idEnseignant },
        { date: '2026-09-03', etat: 'prevue' },
      ])
      .select('id, date')
    if (erreurSeances || !seances) throw new Error(`création des séances impossible : ${erreurSeances?.message}`)
    idSeanceTenuePresent = seances.find((s) => s.date === '2026-09-01')!.id as string
    idSeanceTenueAbsent = seances.find((s) => s.date === '2026-09-02')!.id as string
    idSeancePrevue = seances.find((s) => s.date === '2026-09-03')!.id as string

    const { error: erreurPresences } = await admin.from('presences_ael').insert([
      { seance_id: idSeanceTenuePresent, membre_id: idMembreCompteur, present: true },
      { seance_id: idSeanceTenueAbsent, membre_id: idMembreCompteur, present: false },
      { seance_id: idSeancePrevue, membre_id: idMembreCompteur, present: true },
    ])
    if (erreurPresences) throw new Error(`création des présences impossible : ${erreurPresences.message}`)
  })

  afterAll(async () => {
    await admin.from('presences_ael').delete().eq('membre_id', idMembreCompteur)
    await admin.from('seances_ael').delete().in('id', [idSeanceTenuePresent, idSeanceTenueAbsent, idSeancePrevue])
    await admin.from('membres').delete().in('id', [idMembreCompteur, idEnseignant])
  })

  it('CONTRÔLE POSITIF : les trois présences ont bien été écrites', async () => {
    const { data } = await admin.from('presences_ael').select('seance_id, present').eq('membre_id', idMembreCompteur)
    expect(data).toHaveLength(3)
  })

  it("le total = report initial + présences vraies sur des séances TENUES, rien d'autre", async () => {
    const { data, error } = await clientSimple
      .from('compteurs_ael')
      .select('total')
      .eq('membre_id', idMembreCompteur)
      .single()
    expect(error).toBeNull()
    // 5 (report) + 1 (idSeanceTenuePresent, present=true, tenue) — pas idSeanceTenueAbsent
    // (present=false) ni idSeancePrevue (present=true mais séance non tenue).
    expect(data?.total).toBe(6)
  })

  it("après archivage, un compte ordinaire ne voit plus de LIGNE — pas un chiffre faux", async () => {
    await admin.from('membres').update({ etat: 'archive' }).eq('id', idMembreCompteur)
    try {
      const { data, error } = await clientSimple
        .from('compteurs_ael')
        .select('total')
        .eq('membre_id', idMembreCompteur)
        .maybeSingle()
      expect(error).toBeNull()
      expect(data).toBeNull()

      // Contrôle positif via la clé de service (contourne la RLS, ne prouve donc pas
      // qu'un VRAI compte administrateur voit la ligne — voir la Task 19 pour cette
      // preuve complète) : le total lu reste EXACTEMENT le même qu'avant l'archivage.
      // La vue ne recalcule rien à partir de l'état courant du membre (D48).
      const { data: viaAdmin, error: erreurAdmin } = await admin
        .from('compteurs_ael')
        .select('total')
        .eq('membre_id', idMembreCompteur)
        .single()
      expect(erreurAdmin).toBeNull()
      expect(viaAdmin?.total).toBe(6)
    } finally {
      await admin.from('membres').update({ etat: 'actif' }).eq('id', idMembreCompteur)
    }
  })

  it("un compte actif ne peut pas écrire dans compteurs_ael (ce n'est pas une table)", async () => {
    const { error } = await clientSimple.from('compteurs_ael').insert({ membre_id: idMembreCompteur, total: 999 })
    expect(error).not.toBeNull()
    // Vérifié contre la base réelle, CONTRE l'hypothèse du brief : ce n'est PAS un refus
    // de privilège (42501). `compteurs_ael` contient un `group by`, donc Postgres la
    // tient pour non automatiquement modifiable et refuse TOUTE écriture avant même de
    // consulter les droits — code 55000, message « cannot insert into view ». Le
    // `revoke all` / `grant select` de la migration reste une défense en profondeur
    // légitime, mais ce n'est pas lui qui bloque CETTE insertion précise. Sans ce code,
    // une faute de frappe dans le nom de la vue validerait ce test aussi bien qu'un
    // refus réel.
    expect(error!.code).toBe('55000')
  })
})

describe('passerelle generer_seances_ael (D28, D38, D41)', () => {
  let idCalendrier: string

  beforeAll(async () => {
    const { data, error } = await admin
      .from('calendriers_ael')
      .insert({ antenne_id: idAntenne, jour_semaine: 4 })
      .select('id')
      .single()
    if (error || !data) throw new Error(`création du calendrier impossible : ${error?.message}`)
    idCalendrier = data.id as string
  })

  afterAll(async () => {
    await admin.from('seances_ael').delete().eq('calendrier_id', idCalendrier)
    await admin.from('calendriers_ael').delete().eq('id', idCalendrier)
  })

  it('un compte authentifié ordinaire ne peut pas exécuter generer_seances_ael', async () => {
    const { error } = await clientSimple.rpc('generer_seances_ael', {
      p_occurrences: [{ calendrier_id: idCalendrier, antenne_id: idAntenne, date: '2026-12-01', heure: '' }],
    })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')

    const { data } = await admin
      .from('seances_ael')
      .select('id')
      .eq('calendrier_id', idCalendrier)
      .eq('genere_pour_le', '2026-12-01')
    expect(data).toEqual([])
  })

  it('la clé de service exécute la passerelle et crée la séance ET sa jonction', async () => {
    const { data, error } = await admin.rpc('generer_seances_ael', {
      p_occurrences: [{ calendrier_id: idCalendrier, antenne_id: idAntenne, date: '2026-12-08', heure: '18:00' }],
    })
    expect(error).toBeNull()
    expect(data).toHaveLength(1)

    const idSeance = data![0].id as string
    const { data: seance } = await admin
      .from('seances_ael')
      .select('date, genere_pour_le, heure, etat')
      .eq('id', idSeance)
      .single()
    expect(seance).toEqual({ date: '2026-12-08', genere_pour_le: '2026-12-08', heure: '18:00:00', etat: 'prevue' })

    const { data: jonction } = await admin
      .from('seances_ael_antennes')
      .select('antenne_id')
      .eq('seance_id', idSeance)
    expect(jonction).toEqual([{ antenne_id: idAntenne }])
  })

  it('un second appel sur la MÊME occurrence ne crée AUCUNE ligne nouvelle (idempotence)', async () => {
    // CONTRÔLE POSITIF avant tout : la séance du test précédent existe bien — sinon
    // l'assertion « rien de nouveau » ci-dessous regarderait du vide.
    const { data: avant } = await admin
      .from('seances_ael')
      .select('id')
      .eq('calendrier_id', idCalendrier)
      .eq('genere_pour_le', '2026-12-08')
    expect(avant).toHaveLength(1)

    const { data: rejeu, error } = await admin.rpc('generer_seances_ael', {
      p_occurrences: [{ calendrier_id: idCalendrier, antenne_id: idAntenne, date: '2026-12-08', heure: '18:00' }],
    })
    expect(error).toBeNull()
    expect(rejeu).toEqual([])

    const { data: apres } = await admin
      .from('seances_ael')
      .select('id')
      .eq('calendrier_id', idCalendrier)
      .eq('genere_pour_le', '2026-12-08')
    expect(apres).toHaveLength(1)
    expect(apres![0].id).toBe(avant![0].id)

    const { data: jonctionApres } = await admin
      .from('seances_ael_antennes')
      .select('antenne_id')
      .eq('seance_id', apres![0].id)
    expect(jonctionApres).toHaveLength(1)
  })

  it("un appel mêlant une occurrence déjà générée et une nouvelle ne crée QUE la nouvelle", async () => {
    const { data, error } = await admin.rpc('generer_seances_ael', {
      p_occurrences: [
        { calendrier_id: idCalendrier, antenne_id: idAntenne, date: '2026-12-08', heure: '18:00' },
        { calendrier_id: idCalendrier, antenne_id: idAntenne, date: '2026-12-15', heure: '18:00' },
      ],
    })
    expect(error).toBeNull()
    expect(data).toHaveLength(1)

    const { data: total } = await admin.from('seances_ael').select('id').eq('calendrier_id', idCalendrier)
    expect(total).toHaveLength(2)
  })

  it("le déplacement d'une séance ne la fait pas recréer à sa date d'origine (D39)", async () => {
    const { data: seance } = await admin
      .from('seances_ael')
      .select('id')
      .eq('calendrier_id', idCalendrier)
      .eq('genere_pour_le', '2026-12-15')
      .single()

    // Déplacement ordinaire : SEULE `date` change, `genere_pour_le` reste l'ancre.
    await admin.from('seances_ael').update({ date: '2026-12-16' }).eq('id', seance!.id)

    // Regénérer sur la MÊME occurrence d'origine.
    const { data: rejeu, error } = await admin.rpc('generer_seances_ael', {
      p_occurrences: [{ calendrier_id: idCalendrier, antenne_id: idAntenne, date: '2026-12-15', heure: '18:00' }],
    })
    expect(error).toBeNull()
    expect(rejeu).toEqual([])

    const { data: apres } = await admin
      .from('seances_ael')
      .select('id, date')
      .eq('calendrier_id', idCalendrier)
      .eq('genere_pour_le', '2026-12-15')
    // Une SEULE séance pour cette occurrence, et sa date reste la date DÉPLACÉE.
    expect(apres).toHaveLength(1)
    expect(apres![0].id).toBe(seance!.id)
    expect(apres![0].date).toBe('2026-12-16')
  })
})
