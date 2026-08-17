import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { identifiantVersEmail } from '@/lib/domaine/identifiant'

/**
 * Phase 7, D137 / D138 / D140 — LES PREUVES DU PREMIER CHEMIN D'ÉCRITURE NON ADMINISTRATEUR.
 *
 * ═══ CE QUE CETTE SUITE DOIT ÉTABLIR, ET DANS QUEL ESPRIT ═══
 * Ce lot ouvre une porte que le projet avait tenue fermée depuis la phase 0 : une écriture
 * dont le garde applicatif est `exigerProfilActif` et non `exigerAdministrateur`. Les
 * preuves ci-dessous ne cherchent pas à montrer que la porte s'ouvre — c'est le plus facile.
 * Elles cherchent à mesurer JUSQU'OÙ elle s'ouvre, et à faire tomber le jour où elle
 * s'ouvrirait davantage :
 *
 *   - la liste des colonnes écrites est mesurée EN NÉGATIF (« aucune des dix colonnes
 *     fermées n'a bougé »), pas seulement en positif ;
 *   - `authenticated` n'a AUCUN droit d'exécution — c'est ce qui rend acceptable que la
 *     passerelle fasse confiance à son `p_profil` ;
 *   - un profil désactivé est refusé PAR LA BASE, sans compter sur le filtre applicatif.
 *
 * ═══ UNE PREUVE DOCUMENTE UNE FRONTIÈRE PLUTÔT QU'UNE PROTECTION ═══
 * « la passerelle fait confiance à son appelant sur p_profil » est écrite comme un test
 * VERT, pas comme un défaut. C'est délibéré : cette confiance est le contrat, et la Server
 * Action en répond. La laisser implicite serait la vraie faute — le prochain lecteur pourrait
 * croire la passerelle auto-protégée et l'exposer à `authenticated`.
 *
 * Fixtures et balayage repris de `tests/rls/membres.test.ts`.
 */

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const CLE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const CLE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

const MDP = `Test-${crypto.randomUUID()}`
const IDENT_SIMPLE = 'test.profil.simple'
const IDENT_AUTRE = 'test.profil.autre'
const IDENT_SANS_FICHE = 'test.profil.sansfiche'
const FAMILLE = 'ZZProfil-'
const SUFFIXE = crypto.randomUUID().slice(0, 8)
const NOM_MOI = `${FAMILLE}moi-${SUFFIXE}`
const NOM_AUTRE = `${FAMILLE}autre-${SUFFIXE}`
const NOM_ARBRE = `${FAMILLE}arbre-${SUFFIXE}`

const admin = createClient(URL, CLE_SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
})

let clientSimple: SupabaseClient
let idProfilSimple: string
let idProfilAutre: string
let idProfilSansFiche: string
let idMoi: string
let idAutre: string
let idArbre: string

/** Les DIX colonnes que D138 ferme, plus les colonnes de `profils`. Lues à la clé de service. */
const COLONNES_FERMEES =
  'nom, prenom, antenne_id, faiseur_de_disciple_id, dirigeant_id, dirigeant_force, contact_id, report_initial_ael, etat, cree_par'

async function ficheDe(id: string) {
  const { data, error } = await admin
    .from('membres')
    .select(`${COLONNES_FERMEES}, telephone, email_contact, ville, pays, situation, domaine_etude`)
    .eq('id', id)
    .single()
  if (error) throw new Error(`lecture de la fiche impossible : ${error.message}`)
  return data
}

async function profilDe(id: string) {
  const { data, error } = await admin
    .from('profils')
    .select('identifiant, nom_affichage, membre_id, est_racine, actif')
    .eq('id', id)
    .single()
  if (error) throw new Error(`lecture du profil impossible : ${error.message}`)
  return data
}

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

async function creerProfil(identifiant: string, membreId: string | null): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email: identifiantVersEmail(identifiant),
    password: MDP,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`création du compte impossible : ${error?.message}`)
  const { error: erreurProfil } = await admin.from('profils').insert({
    id: data.user.id,
    identifiant,
    nom_affichage: `Test ${identifiant}`,
    membre_id: membreId,
  })
  if (erreurProfil) {
    await admin.auth.admin.deleteUser(data.user.id)
    throw new Error(`insertion du profil impossible : ${erreurProfil.message}`)
  }
  return data.user.id
}

beforeAll(async () => {
  for (const identifiant of [IDENT_SIMPLE, IDENT_AUTRE, IDENT_SANS_FICHE]) {
    await supprimerCompte(identifiant)
  }
  await admin.from('membres').delete().like('nom', `${FAMILLE}%`)

  // `idArbre` sert de faiseur de disciple / dirigeant / contact à `idMoi` : sans ces trois
  // valeurs NON NULLES, la preuve « aucune colonne fermée n'a bougé » serait creuse —
  // comparer `null` à `null` ne verrait jamais un effacement.
  const { data: arbre, error: erreurArbre } = await admin
    .from('membres')
    .insert({ nom: NOM_ARBRE, prenom: 'Arbre', etat: 'actif' })
    .select('id')
    .single()
  if (erreurArbre || !arbre) throw new Error(`création impossible : ${erreurArbre?.message}`)
  idArbre = arbre.id

  const { data: cree, error: erreurMembres } = await admin
    .from('membres')
    .insert([
      {
        nom: NOM_MOI,
        prenom: 'Moi',
        etat: 'actif',
        faiseur_de_disciple_id: idArbre,
        dirigeant_id: idArbre,
        contact_id: idArbre,
        report_initial_ael: 7,
        ville: 'Ville initiale',
      },
      // LES DEUX LIGNES PORTENT LES MÊMES CLÉS, et ce n'est pas de la symétrie gratuite :
      // PostgREST unifie les colonnes d'une insertion en lot, et une clé absente d'une seule
      // ligne y devient un `null` EXPLICITE — qui n'emprunte pas le défaut de la colonne.
      // `report_initial_ael` étant `not null default 0`, l'omettre ici faisait échouer toute
      // l'insertion. Mesuré, pas supposé.
      {
        nom: NOM_AUTRE,
        prenom: 'Autre',
        etat: 'actif',
        faiseur_de_disciple_id: null,
        dirigeant_id: null,
        contact_id: null,
        report_initial_ael: 0,
        ville: 'Ville autre',
      },
    ])
    .select('id, nom')
  if (erreurMembres || !cree) throw new Error(`création impossible : ${erreurMembres?.message}`)
  const parNom = new Map(cree.map((m) => [m.nom as string, m.id as string]))
  idMoi = parNom.get(NOM_MOI)!
  idAutre = parNom.get(NOM_AUTRE)!

  idProfilSimple = await creerProfil(IDENT_SIMPLE, idMoi)
  idProfilAutre = await creerProfil(IDENT_AUTRE, idAutre)
  idProfilSansFiche = await creerProfil(IDENT_SANS_FICHE, null)

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
  for (const identifiant of [IDENT_SIMPLE, IDENT_AUTRE, IDENT_SANS_FICHE]) {
    await supprimerCompte(identifiant)
  }
  await admin.from('membres').delete().like('nom', `${FAMILLE}%`)

  const { count, error } = await admin
    .from('membres')
    .select('id', { count: 'exact', head: true })
    .like('nom', `${FAMILLE}%`)
  expect(error).toBeNull()
  expect(count).toBe(0)
})

/** Les six paramètres, nommés. Jamais positionnels. */
function argumentsProfil(surcharges: Record<string, unknown> = {}) {
  return {
    p_profil: idProfilSimple,
    p_telephone: null,
    p_email_contact: null,
    p_ville: null,
    p_pays: null,
    p_situation: null,
    p_domaine_etude: null,
    ...surcharges,
  }
}

describe('modifier_mon_profil : ce qu\'elle écrit', () => {
  it('écrit les six colonnes autorisées sur la fiche du profil appelant', async () => {
    const { data, error } = await admin.rpc(
      'modifier_mon_profil',
      argumentsProfil({
        p_telephone: '0600000000',
        p_email_contact: 'moi@example.com',
        p_ville: 'Douala',
        p_pays: 'Cameroun',
        p_situation: 'etudiant',
        p_domaine_etude: 'Mathématiques',
      }),
    )
    expect(error).toBeNull()
    // Elle rend l'identifiant de la fiche écrite : un appelant peut ainsi invalider le cache
    // de la bonne page sans refaire une lecture.
    expect(data).toBe(idMoi)

    const fiche = await ficheDe(idMoi)
    expect(fiche.telephone).toBe('0600000000')
    expect(fiche.email_contact).toBe('moi@example.com')
    expect(fiche.ville).toBe('Douala')
    expect(fiche.pays).toBe('Cameroun')
    expect(fiche.situation).toBe('etudiant')
    expect(fiche.domaine_etude).toBe('Mathématiques')
  })

  it("efface le domaine d'étude hors situation étudiante, sans dépendre de l'appelant", async () => {
    // La contrainte `membres_domaine_reserve_etudiant` existe en base ; sans le `case` de la
    // passerelle, cet appel lèverait un 23514 dont `error.details` porterait la FICHE ENTIÈRE.
    const { error } = await admin.rpc(
      'modifier_mon_profil',
      argumentsProfil({ p_situation: 'travailleur', p_domaine_etude: 'Mathématiques' }),
    )
    expect(error).toBeNull()
    expect((await ficheDe(idMoi)).domaine_etude).toBeNull()
  })

  it('remet une colonne à null quand le paramètre est null — un champ vidé doit se vider', async () => {
    const { error } = await admin.rpc('modifier_mon_profil', argumentsProfil())
    expect(error).toBeNull()
    const fiche = await ficheDe(idMoi)
    expect(fiche.telephone).toBeNull()
    expect(fiche.ville).toBeNull()
    expect(fiche.situation).toBeNull()
  })
})

describe('modifier_mon_profil : ce qu\'elle NE PEUT PAS écrire (D138)', () => {
  it('ne modifie AUCUNE des dix colonnes fermées de la fiche', async () => {
    const avant = await ficheDe(idMoi)
    const { error } = await admin.rpc(
      'modifier_mon_profil',
      argumentsProfil({ p_ville: 'Après', p_telephone: '0700000000' }),
    )
    expect(error).toBeNull()
    const apres = await ficheDe(idMoi)

    // LES DIX, UNE PAR UNE. Une assertion d'objet entier serait plus courte mais dirait
    // moins : celle-ci nomme la colonne fautive quand elle tombe.
    expect(apres.nom).toBe(avant.nom)
    expect(apres.prenom).toBe(avant.prenom)
    expect(apres.antenne_id).toBe(avant.antenne_id)
    expect(apres.faiseur_de_disciple_id).toBe(avant.faiseur_de_disciple_id)
    expect(apres.dirigeant_id).toBe(avant.dirigeant_id)
    expect(apres.dirigeant_force).toBe(avant.dirigeant_force)
    expect(apres.contact_id).toBe(avant.contact_id)
    expect(apres.report_initial_ael).toBe(avant.report_initial_ael)
    expect(apres.etat).toBe(avant.etat)
    expect(apres.cree_par).toBe(avant.cree_par)

    // PRÉMISSE VÉRIFIÉE : trois de ces colonnes sont NON NULLES, donc l'assertion peut
    // réellement voir un effacement. Sans ce contrôle, dix `null === null` passeraient tout
    // aussi bien si la passerelle les avait toutes vidées.
    expect(avant.faiseur_de_disciple_id).toBe(idArbre)
    expect(avant.dirigeant_id).toBe(idArbre)
    expect(avant.contact_id).toBe(idArbre)
    expect(avant.report_initial_ael).toBe(7)
  })

  it('ne modifie AUCUNE colonne de public.profils', async () => {
    const avant = await profilDe(idProfilSimple)
    const { error } = await admin.rpc('modifier_mon_profil', argumentsProfil({ p_ville: 'Ailleurs' }))
    expect(error).toBeNull()
    expect(await profilDe(idProfilSimple)).toEqual(avant)
  })

  it("ne touche à AUCUNE autre fiche que celle du profil visé", async () => {
    const avant = await ficheDe(idAutre)
    const { error } = await admin.rpc('modifier_mon_profil', argumentsProfil({ p_ville: 'Encore' }))
    expect(error).toBeNull()
    expect(await ficheDe(idAutre)).toEqual(avant)
  })
})

describe('modifier_mon_profil : ses refus', () => {
  it("lève profil_sans_membre quand le profil n'a pas de fiche", async () => {
    const { error } = await admin.rpc(
      'modifier_mon_profil',
      argumentsProfil({ p_profil: idProfilSansFiche, p_ville: 'Nulle part' }),
    )
    expect(error).not.toBeNull()
    // Un marqueur, jamais la prose. Et une EXCEPTION, jamais un update à zéro ligne : un
    // geste sans effet ne doit pas passer pour un succès.
    expect(error!.details).toBe('profil_sans_membre')
  })

  it('lève profil_sans_membre pour un profil DÉSACTIVÉ, même avec une fiche', async () => {
    // Défense en profondeur : `exigerProfilActif` filtre déjà côté application, mais
    // désactiver un compte ne révoque pas son jeton — la passerelle ne s'appuie pas dessus.
    await admin.from('profils').update({ actif: false }).eq('id', idProfilSimple)
    try {
      const { error } = await admin.rpc(
        'modifier_mon_profil',
        argumentsProfil({ p_ville: 'Interdite' }),
      )
      expect(error).not.toBeNull()
      expect(error!.details).toBe('profil_sans_membre')
      expect((await ficheDe(idMoi)).ville).not.toBe('Interdite')
    } finally {
      await admin.from('profils').update({ actif: true }).eq('id', idProfilSimple)
    }
  })

  it('lève profil_sans_membre pour un identifiant de profil inexistant', async () => {
    const { error } = await admin.rpc(
      'modifier_mon_profil',
      argumentsProfil({ p_profil: crypto.randomUUID() }),
    )
    expect(error).not.toBeNull()
    expect(error!.details).toBe('profil_sans_membre')
  })
})

describe('modifier_mon_profil : ses privilèges (D140)', () => {
  it("n'est PAS exécutable par le rôle authenticated", async () => {
    // ═══ LA PREUVE QUI REND ACCEPTABLE TOUT LE RESTE ═══
    // La passerelle fait confiance à son `p_profil`. Cette confiance ne tient QUE parce
    // qu'aucun compte connecté ne peut l'appeler. Si ce test tombait, tout compte pourrait
    // modifier la fiche de n'importe qui en passant son identifiant de profil.
    const { error } = await clientSimple.rpc(
      'modifier_mon_profil',
      argumentsProfil({ p_ville: 'Forgée' }),
    )
    expect(error).not.toBeNull()
    expect((await ficheDe(idMoi)).ville).not.toBe('Forgée')
  })

  it("un compte ne peut toujours pas écrire directement dans membres (D140)", async () => {
    // Contrôle complémentaire : la passerelle n'est pas la seule porte à surveiller. Aucune
    // politique d'écriture RLS n'a été ouverte par ce lot.
    const { error } = await clientSimple
      .from('membres')
      .update({ ville: 'Directe' })
      .eq('id', idMoi)
      .select()
    expect(error).not.toBeNull()
    expect((await ficheDe(idMoi)).ville).not.toBe('Directe')
  })

  it("LA FRONTIÈRE, DOCUMENTÉE : appelée avec le profil d'un AUTRE compte, elle écrit la fiche de cet autre compte", async () => {
    // ═══ CE TEST EST VERT PAR CONTRAT, PAS PAR DÉFAUT ═══
    // La passerelle ne vérifie pas QUI appelle : elle vérifie ce qu'on lui donne. C'est la
    // Server Action `modifierMonProfil` qui garantit que `p_profil` vient de la session, et
    // le test précédent qui garantit qu'aucun compte connecté n'atteint la passerelle.
    //
    // Il est écrit pour que personne ne croie la passerelle auto-protégée : l'exposer un
    // jour à `authenticated`, ou accepter un `p_profil` venu d'un formulaire, ferait de ce
    // comportement une faille — et c'est ce commentaire, pas un échec de test, qui doit
    // arrêter la main.
    const { data, error } = await admin.rpc(
      'modifier_mon_profil',
      argumentsProfil({ p_profil: idProfilAutre, p_ville: 'Écrite par le contrat' }),
    )
    expect(error).toBeNull()
    expect(data).toBe(idAutre)
    expect((await ficheDe(idAutre)).ville).toBe('Écrite par le contrat')
  })
})
