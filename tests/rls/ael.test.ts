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
