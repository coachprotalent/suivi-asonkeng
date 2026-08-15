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
// IMPORTANT 3 de la revue de la Task 19 — LE BALAYAGE I6 S'ETAIT ARRÊTÉ À `tests/e2e/`.
// Les tests RLS écrivent dans LES MÊMES TABLES, sur la MÊME base (qui sert aussi de
// production), et reproduisaient le défaut à l'identique : le préfixe balayé embarquait
// l'UUID tiré PAR EXÉCUTION, si bien qu'une suite interrompue laissait des lignes que
// PLUS RIEN ne retrouvait — ni cette exécution-ci, qui ne connaît que son propre
// suffixe, ni aucune autre. Même remède que I6 : une partie STABLE (`FAMILLE_*`) sert au
// balayage de RATTRAPAGE, la partie aléatoire ne distingue plus que les noms individuels
// de CETTE exécution.
// `ZZTest-` (avec le tiret) ne matche PAS `ZZTestLots-` ni `ZZTestHomonymes-`, qui ont
// leurs propres familles plus bas — vérifié, ce n'est pas une coïncidence heureuse : la
// famille sert aussi à ne PAS emporter le décor d'un autre bloc.
const FAMILLE_MEMBRE = 'ZZTest-'
const FAMILLE_ANTENNE_INTRUS = 'ZZAntenne-'
const NOM_MEMBRE_ACTIF = `${FAMILLE_MEMBRE}actif-${crypto.randomUUID().slice(0, 8)}`
const NOM_MEMBRE_ARCHIVE = `${FAMILLE_MEMBRE}archive-${crypto.randomUUID().slice(0, 8)}`

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
  // Balayage de FAMILLE, pas `.in()` sur les deux noms de CETTE exécution : ce dernier
  // ne pouvait rien rattraper d'une exécution antérieure interrompue. Emporte aussi
  // `ZZTest-intrus-…`, qu'une régression de la RLS d'écriture laisserait derrière elle —
  // et que rien ne balayait.
  await admin.from('membres').delete().like('nom', `${FAMILLE_MEMBRE}%`)
  // Même chose pour l'antenne forgée du test « un compte simple ne peut pas créer une
  // antenne » : elle n'est censée n'exister jamais, donc personne ne la nettoyait.
  //
  // Les fiches RATTACHÉES à ces antennes sont retirées D'ABORD : `membres.antenne_id` est
  // en `on delete restrict` (migration 20260812120000), donc une seule fiche rattachée
  // ferait ÉCHOUER la suppression de l'antenne — et, sans le comptage ajouté plus bas,
  // elle aurait échoué EN SILENCE. Ce n'est pas une précaution théorique : le contrôle
  // positif du balayage (un résidu réellement planté, puis la suite relancée) a fait
  // tomber ce cas exact avant qu'il ne soit corrigé ici.
  const { data: antennesIntrus, error: erreurAntennesIntrus } = await admin
    .from('antennes')
    .select('id')
    .like('nom', `${FAMILLE_ANTENNE_INTRUS}%`)
  if (erreurAntennesIntrus) {
    throw new Error(`balayage des antennes intruses impossible : ${erreurAntennesIntrus.message}`)
  }
  const idsAntennesIntrus = (antennesIntrus ?? []).map((a) => a.id as string)
  if (idsAntennesIntrus.length > 0) {
    await admin.from('membres').delete().in('antenne_id', idsAntennesIntrus)
  }
  await admin.from('antennes').delete().like('nom', `${FAMILLE_ANTENNE_INTRUS}%`)
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

  // Nettoyage VÉRIFIÉ PAR COMPTAGE, sur la FAMILLE.
  const { count: membresRestants, error: erreurMembres } = await admin
    .from('membres')
    .select('id', { count: 'exact', head: true })
    .like('nom', `${FAMILLE_MEMBRE}%`)
  expect(erreurMembres).toBeNull()
  expect(membresRestants).toBe(0)
  const { count: antennesRestantes, error: erreurAntennes } = await admin
    .from('antennes')
    .select('id', { count: 'exact', head: true })
    .like('nom', `${FAMILLE_ANTENNE_INTRUS}%`)
  expect(erreurAntennes).toBeNull()
  expect(antennesRestantes).toBe(0)
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
    const nomIntrus = `${FAMILLE_MEMBRE}intrus-${crypto.randomUUID().slice(0, 8)}`
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
    const nomIntrus = `${FAMILLE_ANTENNE_INTRUS}${crypto.randomUUID().slice(0, 8)}`
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
  // Famille stable (IMPORTANT 3) : le balayage de rattrapage de cet `afterAll` ne
  // dépendait que du suffixe de l'exécution courante.
  const FAMILLE_LOT = 'ZZTestLots-'
  const PREFIXE_LOT = `${FAMILLE_LOT}${crypto.randomUUID().slice(0, 8)}`
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
    if (!idAntenneLots) {
      // `beforeAll` a levé avant d'affecter `idAntenneLots` (création de l'antenne ou
      // des membres de test en échec) : cette erreur est déjà remontée par vitest telle
      // quelle. Rien n'a été créé, donc rien à nettoyer ici — sans ce garde, les appels
      // ci-dessous s'exécuteraient avec `antenne_id: undefined`, une requête PostgREST
      // malformée qui empilerait une seconde erreur trompeuse par-dessus la vraie cause
      // (revue task-1-4, constat M7).
      return
    }
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
    // Rattrapage de FAMILLE : membres puis antennes (ordre imposé par
    // `antenne_id … on delete restrict`), pour ce qu'une exécution ANTÉRIEURE
    // interrompue aurait laissé sous un autre suffixe.
    await admin.from('membres').delete().like('nom', `${FAMILLE_LOT}%`)
    await admin.from('antennes').delete().like('nom', `${FAMILLE_LOT}%`)
    // Nettoyage vérifié par comptage, sur la FAMILLE et non sur le seul préfixe de
    // cette exécution.
    const { count } = await admin
      .from('membres')
      .select('id', { count: 'exact', head: true })
      .like('nom', `${FAMILLE_LOT}%`)
    expect(count).toBe(0)
    const { count: antennesLot } = await admin
      .from('antennes')
      .select('id', { count: 'exact', head: true })
      .like('nom', `${FAMILLE_LOT}%`)
    expect(antennesLot).toBe(0)
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

  it('un lot dont le compte est un multiple EXACT franchit la frontière sans lever (page hors bornes rendue vide sans erreur ; branche PGRST103 gardée en défense mais non atteinte ici)', async () => {
    // 4 fiches, tailleLot = 2 : page 1 rend 2 lignes (= tailleLot, continue), page 2 rend
    // 2 lignes (= tailleLot, continue encore) — total atteint, mais rien ne le dit encore
    // à la boucle. La page 3 démarre à l'indice 4, exactement au nombre total de lignes.
    const membres = await membresDesAntennesParLots(clientSimple, [idAntenneLots], 2)
    expect(membres.map((m) => m.nom)).toEqual(NOMS_LOT)

    // PRÉMISSE VÉRIFIÉE DIRECTEMENT (revue task-1-4, constat I3) — et PAS celle que la
    // revue avait supposée. L'hypothèse initiale (« PostgREST refuse la plage entière
    // avec PGRST103 quand le décalage égale le total ») s'est révélée FAUSSE à l'épreuve
    // contre cette base réelle : vérifié ici via le client, et confirmé en HTTP brut
    // (`Range: 4-5` sur 4 lignes → `206 Partial Content`, `Content-Range: */4`, corps
    // `[]` — jamais `416`).
    //
    // ═══ CE QUE CETTE MESURE ÉTABLIT, ET RIEN DE PLUS (rectifié à la revue finale de la
    // phase 5) ═══
    //
    // La rédaction précédente généralisait : « `PGRST103` … seulement pour une plage
    // structurellement invalide, début postérieur à fin … jamais le cas d'un décalage
    // simplement épuisé ». C'EST FAUX, et cela a suffi à faire classer à tort une preuve
    // de la phase 5 comme inerte. Mesuré en HTTP brut contre cette base
    // (`public.membres`, 8 lignes, en-tête `Range` brut, `Prefer: count=exact`) :
    //
    //   `7-9`                       → `206`, `Content-Range: 7-7/8`, 1 ligne
    //   `8-10` (décalage = total)   → `206`, `Content-Range: */8`, corps `[]`
    //   `9-11` (décalage > total)   → `416` / `PGRST103`, « An offset of 9 was requested,
    //                                 but there are only 8 rows. »
    //   `299997-299999`             → `416` / `PGRST103`, même phrase, autre décalage
    //   `5-2`  (début > fin)        → `416` / `PGRST103`, message DIFFÉRENT (« The lower
    //                                 boundary must be lower than or equal to the upper
    //                                 boundary in the Range header. »)
    //
    // LA MESURE NE PORTE DONC QUE SUR LE CAS FRONTIÈRE `décalage == total` : c'est celui-là,
    // et lui seul, qui rend `206` avec un corps vide. Dès que le décalage DÉPASSE le total,
    // PostgREST rend bien `416` / `PGRST103` — comme pour une plage structurellement
    // invalide, avec un message distinct.
    //
    // La conclusion de CE test-ci n'en est pas changée, et c'est justement parce qu'il est
    // sur la frontière : 4 fiches, `tailleLot = 2`, la page 3 démarre à l'indice 4 — décalage
    // ÉGAL au total. Le parcours de `membres-lots.ts` ne peut d'ailleurs jamais dépasser
    // cette frontière : il s'arrête dès qu'une page rend moins de `tailleLot` lignes, donc
    // tout décalage visité est ≤ total. La branche `error.code === 'PGRST103'` y reste morte
    // en pratique — mais elle N'EST PAS morte partout : `racinesParPage`
    // (`src/lib/donnees/arbre-lots.ts`) accepte un numéro de page venu de l'URL et l'atteint
    // pour de bon, ce que `tests/rls/arborescence.test.ts` éprouve avec `page: 100000`.
    //
    // Cette assertion établit donc, dans les DEUX sens et sans supposition, que c'est
    // `lot.length < tailleLot` (membres-lots.ts) — PAS la branche `PGRST103` — qui termine
    // réellement le parcours à cette frontière. Sans elle, la seule ligne ci-dessus resterait
    // tout aussi verte si PostgREST changeait un jour de comportement, sans que rien ne le
    // signale.
    const { error: erreurPremisse, data: dataPremisse } = await clientSimple
      .from('membres')
      .select('id')
      .eq('etat', 'actif')
      .in('antenne_id', [idAntenneLots])
      .order('nom')
      .order('prenom')
      .order('id')
      .range(4, 5)
    expect(erreurPremisse).toBeNull()
    expect(dataPremisse).toEqual([])
  })

  it("un lot plus grand que le total ne fait toujours qu'une seule page (comportement inchangé pour le cas courant, aucune régression)", async () => {
    const membres = await membresDesAntennesParLots(clientSimple, [idAntenneLots], 500)
    expect(membres.map((m) => m.nom)).toEqual(NOMS_LOT)
  })
})

describe('membresDesAntennesParLots : tri total malgré des homonymes exacts (I2)', () => {
  // (nom, prenom) n'est PAS unique : deux fiches strictement identiques sur ces deux
  // colonnes (cas banal sur un fichier de membres d'église, pas une hypothèse d'école)
  // n'ont aucun ordre relatif garanti entre deux exécutions séparées de la même requête
  // (une par page). À cheval sur une frontière de page, l'une pourrait être rendue deux
  // fois, l'autre jamais — le sinistre visé par toute cette correction. `.order('id')`
  // (membres-lots.ts) rend le tri total ; ce bloc l'éprouve par une insertion réelle,
  // pas par lecture du code. Bloc dédié, séparé de celui ci-dessus, pour ne pas fausser
  // les assertions d'égalité stricte qui portent déjà sur les 4 fiches `NOMS_LOT`.
  // Famille stable (IMPORTANT 3), même raison que le bloc précédent.
  const FAMILLE_HOMONYME = 'ZZTestHomonymes-'
  const NOM_HOMONYME = `${FAMILLE_HOMONYME}${crypto.randomUUID().slice(0, 8)}`
  let idAntenneHomonymes: string
  let idHomonyme1: string
  let idHomonyme2: string

  beforeAll(async () => {
    const { data: antenne, error: erreurAntenne } = await admin
      .from('antennes')
      .insert({ nom: NOM_HOMONYME, pays: 'Test' })
      .select('id')
      .single()
    if (erreurAntenne || !antenne) {
      throw new Error(`création de l'antenne de test impossible : ${erreurAntenne?.message}`)
    }
    idAntenneHomonymes = antenne.id

    // DEUX FICHES STRICTEMENT IDENTIQUES sur (nom, prenom) : seul terrain où l'ancien tri
    // (nom, prenom), sans troisième critère, pouvait laisser filer une ligne.
    const { data: cree, error: erreurMembres } = await admin
      .from('membres')
      .insert([
        { nom: NOM_HOMONYME, prenom: 'Meme', etat: 'actif', antenne_id: idAntenneHomonymes },
        { nom: NOM_HOMONYME, prenom: 'Meme', etat: 'actif', antenne_id: idAntenneHomonymes },
      ])
      .select('id')
    if (erreurMembres || !cree || cree.length !== 2) {
      throw new Error(`création des membres homonymes impossible : ${erreurMembres?.message}`)
    }
    idHomonyme1 = cree[0].id as string
    idHomonyme2 = cree[1].id as string
  })

  afterAll(async () => {
    if (!idAntenneHomonymes) {
      // Même garde qu'au bloc précédent (revue task-1-4, constat M7) : si `beforeAll` a
      // levé avant d'affecter `idAntenneHomonymes`, rien n'a été créé et les appels
      // ci-dessous n'empileraient qu'une seconde erreur trompeuse sur la vraie cause.
      return
    }
    const { error: erreurSuppressionMembres } = await admin
      .from('membres')
      .delete()
      .eq('antenne_id', idAntenneHomonymes)
    if (erreurSuppressionMembres) {
      throw new Error(`nettoyage des membres homonymes impossible : ${erreurSuppressionMembres.message}`)
    }
    const { error: erreurSuppressionAntenne } = await admin
      .from('antennes')
      .delete()
      .eq('id', idAntenneHomonymes)
    if (erreurSuppressionAntenne) {
      throw new Error(`nettoyage de l'antenne homonymes impossible : ${erreurSuppressionAntenne.message}`)
    }
    // Rattrapage de FAMILLE (IMPORTANT 3) : membres puis antennes, pour ce qu'une
    // exécution ANTÉRIEURE interrompue aurait laissé sous un autre suffixe.
    await admin.from('membres').delete().like('nom', `${FAMILLE_HOMONYME}%`)
    await admin.from('antennes').delete().like('nom', `${FAMILLE_HOMONYME}%`)
    // Nettoyage vérifié par comptage, sur la FAMILLE et non sur le seul nom de cette
    // exécution.
    const { count } = await admin
      .from('membres')
      .select('id', { count: 'exact', head: true })
      .like('nom', `${FAMILLE_HOMONYME}%`)
    expect(count).toBe(0)
    const { count: antennesHomonymes } = await admin
      .from('antennes')
      .select('id', { count: 'exact', head: true })
      .like('nom', `${FAMILLE_HOMONYME}%`)
    expect(antennesHomonymes).toBe(0)
  })

  it('deux homonymes exacts à cheval sur une frontière de page sont rendus une fois chacun, jamais deux fois, jamais aucun', async () => {
    // tailleLot = 1 place la frontière de page EXACTEMENT entre les deux homonymes :
    // page 1 rend la première ligne triée (par id, seul critère qui les distingue encore
    // une fois nom et prenom à égalité), page 2 la seconde. Page 3 (decalage = 2, total
    // exact de lignes = 2) sort NORMALEMENT, sans erreur, avec un lot vide (`[]`,
    // `0 < tailleLot`) — PAS par `PGRST103` : c'est le fait établi par I3 ci-dessus
    // (un décalage égal au total rend `206`/page vide, jamais `416`), donc EXACTEMENT
    // la même branche que I3 éprouve (`lot.length < tailleLot`), et non la branche
    // `error.code === 'PGRST103'` qu'un commentaire antérieur de ce test affirmait à
    // tort (corrigé ici, ronde de correction Q5 : l'affirmation était fausse sur les
    // deux points et contredite par la découverte faite par I3 dans ce même commit).
    const membres = await membresDesAntennesParLots(clientSimple, [idAntenneHomonymes], 1)
    expect(membres).toHaveLength(2)
    // Assertion par ENSEMBLE d'identifiants, pas seulement par longueur : une longueur de
    // 2 obtenue par une ligne dupliquée ET l'autre absente passerait une simple assertion
    // de longueur, mais pas celle d'ensemble ci-dessous.
    expect(new Set(membres.map((m) => m.id))).toEqual(new Set([idHomonyme1, idHomonyme2]))
  })
})
