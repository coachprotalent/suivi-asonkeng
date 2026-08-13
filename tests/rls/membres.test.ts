import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { identifiantVersEmail } from '@/lib/domaine/identifiant'
// Import depuis `membres-lots`, PAS depuis `membres` : ce dernier porte
// `import 'server-only'`, qui lève inconditionnellement hors du bundler Next (vérifié :
// `node_modules/server-only/index.js` est un `throw` nu). `membres-lots` est le module
// délibérément séparé, sans cette garde, qui permet à cette suite vitest (hors Next) de
// faire tourner EXACTEMENT le code de production contre la vraie base.
import { membresDesAntennesParLots } from '@/lib/donnees/membres-lots'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const CLE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const CLE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Tiré à chaque exécution : un mot de passe fixe dans un dépôt public ouvrirait
// tout compte de test qu'une exécution interrompue aurait laissé derrière elle.
const MDP = `Test-${crypto.randomUUID()}`
const IDENT_SIMPLE = 'test.membres.simple'
const NOM_MEMBRE_ACTIF = `ZZTest-actif-${crypto.randomUUID().slice(0, 8)}`
const NOM_MEMBRE_ARCHIVE = `ZZTest-archive-${crypto.randomUUID().slice(0, 8)}`

const admin = createClient(URL, CLE_SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const clientAnonyme = createClient(URL, CLE_ANON, {
  auth: { autoRefreshToken: false, persistSession: false },
})

let idSimple: string
let clientSimple: SupabaseClient
let idMembreActif: string
let idMembreArchive: string

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

async function supprimerMembres() {
  await admin.from('membres').delete().in('nom', [NOM_MEMBRE_ACTIF, NOM_MEMBRE_ARCHIVE])
}

beforeAll(async () => {
  await supprimerCompte(IDENT_SIMPLE)
  await supprimerMembres()

  const { data, error } = await admin.auth.admin.createUser({
    email: identifiantVersEmail(IDENT_SIMPLE),
    password: MDP,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`création impossible : ${error?.message}`)
  idSimple = data.user.id

  const { error: erreurProfil } = await admin
    .from('profils')
    .insert({ id: idSimple, identifiant: IDENT_SIMPLE, nom_affichage: 'Test membres' })
  if (erreurProfil) {
    await admin.auth.admin.deleteUser(idSimple)
    throw new Error(`insertion du profil impossible : ${erreurProfil.message}`)
  }

  const { data: cree, error: erreurMembres } = await admin
    .from('membres')
    .insert([
      { nom: NOM_MEMBRE_ACTIF, prenom: 'Actif', etat: 'actif' },
      { nom: NOM_MEMBRE_ARCHIVE, prenom: 'Archive', etat: 'archive' },
    ])
    .select('id, nom')
  if (erreurMembres || !cree) {
    await admin.auth.admin.deleteUser(idSimple)
    throw new Error(`insertion des membres impossible : ${erreurMembres?.message}`)
  }
  idMembreActif = cree.find((m) => m.nom === NOM_MEMBRE_ACTIF)!.id
  idMembreArchive = cree.find((m) => m.nom === NOM_MEMBRE_ARCHIVE)!.id

  clientSimple = createClient(URL, CLE_ANON, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error: erreurConnexion } = await clientSimple.auth.signInWithPassword({
    email: identifiantVersEmail(IDENT_SIMPLE),
    password: MDP,
  })
  if (erreurConnexion) throw new Error(`connexion impossible : ${erreurConnexion.message}`)
})

afterAll(async () => {
  await supprimerMembres()
  await supprimerCompte(IDENT_SIMPLE)
})

describe('lecture des membres', () => {
  it('un utilisateur actif lit les membres actifs', async () => {
    const { data } = await clientSimple.from('membres').select('nom').eq('id', idMembreActif)
    expect(data).toEqual([{ nom: NOM_MEMBRE_ACTIF }])
  })

  it('un utilisateur non administrateur ne lit pas les fiches archivées', async () => {
    const { data } = await clientSimple.from('membres').select('nom').eq('id', idMembreArchive)
    expect(data).toEqual([])
  })

  it('un visiteur anonyme se voit refuser la lecture des membres', async () => {
    const { data, error } = await clientAnonyme.from('membres').select('id')
    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')
    expect(data).toBeNull()
  })

  it('un visiteur anonyme se voit refuser la lecture des antennes', async () => {
    const { data, error } = await clientAnonyme.from('antennes').select('id')
    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')
    expect(data).toBeNull()
  })

  it('un utilisateur actif lit les antennes', async () => {
    const { data } = await clientSimple.from('antennes').select('nom').eq('nom', 'France')
    expect(data).toEqual([{ nom: 'France' }])
  })
})

describe('écriture refusée par défaut', () => {
  it("un utilisateur ne peut pas créer de membre", async () => {
    const nomIntrus = `ZZTest-intrus-${crypto.randomUUID().slice(0, 8)}`
    const { error } = await clientSimple
      .from('membres')
      .insert({ nom: nomIntrus, prenom: 'Intrus' })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')

    const { data } = await admin.from('membres').select('id').eq('nom', nomIntrus)
    expect(data).toEqual([])
  })

  it('un utilisateur ne peut pas modifier un membre', async () => {
    const { error } = await clientSimple
      .from('membres')
      .update({ ville: 'Piratée' })
      .eq('id', idMembreActif)
      .select()
    expect(error).not.toBeNull()

    const { data } = await admin.from('membres').select('ville').eq('id', idMembreActif).single()
    expect(data!.ville).not.toBe('Piratée')
  })

  it('un utilisateur ne peut pas supprimer un membre', async () => {
    const { error } = await clientSimple.from('membres').delete().eq('id', idMembreActif).select()
    expect(error).not.toBeNull()

    const { data } = await admin.from('membres').select('id').eq('id', idMembreActif).maybeSingle()
    expect(data).not.toBeNull()
  })

  it('un utilisateur ne peut pas créer une antenne', async () => {
    const nomIntrus = `ZZAntenne-${crypto.randomUUID().slice(0, 8)}`
    const { error } = await clientSimple
      .from('antennes')
      .insert({ nom: nomIntrus, pays: 'Nulle part' })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')

    const { data } = await admin.from('antennes').select('id').eq('nom', nomIntrus)
    expect(data).toEqual([])
  })
})

describe('compte désactivé', () => {
  // Ces deux tests sont la seule preuve d'exécution de `prive.est_actif()`. La fonction
  // est `SECURITY DEFINER` — elle échappe volontairement à la RLS — et vérifier sa
  // signature ne prouve rien de sa logique. Ici on la met réellement à l'épreuve, sur
  // les deux tables dont les politiques en dépendent.
  it('un compte désactivé ne lit plus les membres', async () => {
    await admin.from('profils').update({ actif: false }).eq('id', idSimple)
    try {
      const { data } = await clientSimple.from('membres').select('id').eq('id', idMembreActif)
      expect(data).toEqual([])
    } finally {
      await admin.from('profils').update({ actif: true }).eq('id', idSimple)
    }
  })

  it('un compte désactivé ne lit plus les antennes', async () => {
    await admin.from('profils').update({ actif: false }).eq('id', idSimple)
    try {
      const { data } = await clientSimple.from('antennes').select('id')
      expect(data).toEqual([])
    } finally {
      await admin.from('profils').update({ actif: true }).eq('id', idSimple)
    }
  })

  it('un compte réactivé lit de nouveau les membres', async () => {
    // Contrôle positif : sans lui, les deux tests ci-dessus passeraient aussi si la
    // lecture était cassée pour une raison sans rapport avec `actif`.
    const { data } = await clientSimple.from('membres').select('id').eq('id', idMembreActif)
    expect(data).toHaveLength(1)
  })
})

describe('membresDesAntennes : correction de la troncature silencieuse (max_rows)', () => {
  // PostgREST applique un plafond `max_rows` (1000, `supabase/config.toml:18`) à TOUTE
  // lecture, y compris sans `.range()` ni `.limit()` explicite — au-delà, il tronque
  // SANS ERREUR. Une lecture réelle sur la base de production (1 seul membre actif
  // aujourd'hui) ne prouverait rien : « le parcours par lots fonctionne » et « il n'y
  // avait qu'une page » sont indiscernables sur un ensemble aussi petit. `tailleLot` est
  // donc ramené à 2 ou 3 ici pour franchir une VRAIE frontière de page avec 4 fiches
  // seulement, au lieu des centaines qu'il faudrait pour atteindre la valeur de
  // production (`TAILLE_LOT_MEMBRES_ANTENNE`, 500) — exactement la seconde option
  // proposée pour cette preuve, `membresDesAntennesParLots` acceptant `tailleLot` en
  // paramètre pour ça.
  const PREFIXE_LOT = `ZZTestLots-${crypto.randomUUID().slice(0, 8)}`
  const NOMS_LOT = [`${PREFIXE_LOT}-1`, `${PREFIXE_LOT}-2`, `${PREFIXE_LOT}-3`, `${PREFIXE_LOT}-4`]
  let idAntenneLots: string

  beforeAll(async () => {
    const { data: antenne, error: erreurAntenne } = await admin
      .from('antennes')
      .insert({ nom: PREFIXE_LOT, pays: 'Test' })
      .select('id')
      .single()
    if (erreurAntenne || !antenne) {
      throw new Error(`création de l'antenne de test impossible : ${erreurAntenne?.message}`)
    }
    idAntenneLots = antenne.id

    const { error: erreurMembres } = await admin
      .from('membres')
      .insert(NOMS_LOT.map((nom) => ({ nom, prenom: 'Lot', etat: 'actif', antenne_id: idAntenneLots })))
    if (erreurMembres) {
      throw new Error(`création des membres de test impossible : ${erreurMembres.message}`)
    }
  })

  afterAll(async () => {
    // Ordre imposé par `antenne_id ... on delete restrict` (migration 20260812120000,
    // délibéré : une antenne encore rattachée ne doit pas se supprimer en silence) :
    // les fiches d'abord, l'antenne ensuite — sinon la suppression de l'antenne échoue.
    const { error: erreurSuppressionMembres } = await admin
      .from('membres')
      .delete()
      .eq('antenne_id', idAntenneLots)
    if (erreurSuppressionMembres) {
      throw new Error(`nettoyage des membres de test impossible : ${erreurSuppressionMembres.message}`)
    }
    const { error: erreurSuppressionAntenne } = await admin
      .from('antennes')
      .delete()
      .eq('id', idAntenneLots)
    if (erreurSuppressionAntenne) {
      throw new Error(`nettoyage de l'antenne de test impossible : ${erreurSuppressionAntenne.message}`)
    }
    // Nettoyage vérifié par comptage, pas seulement par l'absence d'erreur de suppression.
    const { count } = await admin
      .from('membres')
      .select('id', { count: 'exact', head: true })
      .like('nom', `${PREFIXE_LOT}%`)
    expect(count).toBe(0)
  })

  it("un lot dont le compte n'est pas un multiple exact franchit réellement la frontière de page (dernière page partielle)", async () => {
    // 4 fiches, tailleLot = 3 : page 1 rend 3 lignes (= tailleLot, la boucle continue),
    // page 2 rend 1 ligne (< tailleLot, fin de parcours normale, sans erreur). Sans le
    // parcours par lots introduit par cette correction, une lecture unique aurait de
    // toute façon tout rendu ici (4 est très inférieur à `max_rows`) : ce cas ne
    // discrimine donc pas encore ancienne et nouvelle implémentation à lui seul — il
    // établit seulement que le parcours par lots reste complet. Le test suivant est
    // celui qui aurait échoué (silencieusement, sans lever) sur l'ancienne forme si
    // `max_rows` avait été assez bas pour tomber pile sur la frontière.
    const membres = await membresDesAntennesParLots(clientSimple, [idAntenneLots], 3)
    expect(membres.map((m) => m.nom)).toEqual(NOMS_LOT)
  })

  it('un lot dont le compte est un multiple EXACT franchit la frontière sans lever (PGRST103 traité comme fin de parcours, pas comme une panne)', async () => {
    // 4 fiches, tailleLot = 2 : page 1 rend 2 lignes (= tailleLot, continue), page 2 rend
    // 2 lignes (= tailleLot, continue encore) — total atteint, mais rien ne le dit encore
    // à la boucle. La page 3 démarre à l'indice 4, exactement au nombre total de lignes :
    // la plage est hors bornes et PostgREST répond PGRST103 (416) plutôt qu'une page
    // vide. C'est la branche qui aurait fait REMONTER une erreur à l'appelant — donc
    // `membresDesAntennes` aurait levé pour une antenne parfaitement valide — si elle
    // n'était pas traitée comme une fin de parcours normale : contrôle direct de cette
    // branche, pas seulement de son effet observable.
    const membres = await membresDesAntennesParLots(clientSimple, [idAntenneLots], 2)
    expect(membres.map((m) => m.nom)).toEqual(NOMS_LOT)
  })

  it("un lot plus grand que le total ne fait toujours qu'une seule page (comportement inchangé pour le cas courant, aucune régression)", async () => {
    const membres = await membresDesAntennesParLots(clientSimple, [idAntenneLots], 500)
    expect(membres.map((m) => m.nom)).toEqual(NOMS_LOT)
  })
})
