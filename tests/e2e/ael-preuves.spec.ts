import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'
import { MESSAGE_SEANCE_SANS_ENSEIGNANT } from '../../src/app/ael/seances/[id]/messages'
// C1 : parcours par lots de `seances_ael`. Voir l'encadré de tête de ce module — il
// porte la forme retenue, sa raison, et pourquoi il vit hors du fichier de spec.
import { lireSeancesParLots } from './seances-lots'

// `timeout` relevé bien au-dessus des 30 s de `playwright.config.ts`. Ce n'est pas le
// contournement d'un défaut applicatif, c'est le coût réel de ces tests : chacun
// enchaîne deux ou trois connexions complètes (navigation, saisie, soumission, attente
// d'URL), une ou deux navigations supplémentaires, un ou deux `browser.newContext()`, et
// deux d'entre eux déclenchent une génération réelle de plusieurs dizaines de séances
// avec leurs jonctions, `revalidatePath` et re-rendu. Le test de `pointerPresence` ajoute
// un `page.waitForRequest` dont le délai par défaut est le budget du test lui-même.
test.describe.configure({ mode: 'serial', timeout: 120_000 })

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const CLE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const CLE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

const IDENT_ADMIN = 'test.e2e.ael.preuves.admin'
const IDENT_MODERATEUR = 'test.e2e.ael.preuves.moderateur'
const IDENT_SIMPLE = 'test.e2e.ael.preuves.simple'
const MDP_ADMIN = `Test-${crypto.randomUUID()}`
const MDP_MODERATEUR = `Test-${crypto.randomUUID()}`
const MDP_SIMPLE = `Test-${crypto.randomUUID()}`
// Préfixe de FAMILLE stable pour le nettoyage (I6 de la ronde de correction), distinct
// du PREFIXE de cette exécution : le motif du projet est dans
// `tests/e2e/demandes.spec.ts:18-25` et `tests/e2e/arbre.spec.ts:8,44` — la partie
// stable sert au balayage de RATTRAPAGE (retrouve ce qu'une exécution ANTÉRIEURE
// interrompue avant sa propre fin a laissé, sous un AUTRE suffixe), la partie
// aléatoire distingue seulement les noms individuels DE CETTE exécution. Écart
// délibéré par rapport au brief de la Task 19, qui embarquait l'UUID dans le préfixe
// balayé lui-même — signalé dans le rapport de tâche.
//
// CONTREPARTIE, NOMMÉE PLUTÔT QUE TUE (Mineur 5 de la revue de la Task 19) : deux
// invocations Playwright CONCURRENTES sur cette base deviennent mutuellement
// destructrices, chacune supprimant au `beforeAll` les entités de l'autre. Le registre
// atteste que des exécutions concurrentes ont déjà eu lieu (fuite `test.e2e.autorite.lie`,
// née pendant une revue). Le compromis est assumé — un rattrapage vaut mieux qu'une fuite
// définitive en production — mais il exige de ne JAMAIS lancer deux fois `npm run test:e2e`
// en parallèle sur ce dépôt.
const FAMILLE = 'ZZAelPreuves-'
const PREFIXE = `${FAMILLE}${crypto.randomUUID().slice(0, 8)}`

const admin = createClient(URL, CLE_SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })

/**
 * IMPORTANT 6 de la revue — REMÈDE À L'EMPREINTE QUI NE VIVAIT QU'EN MÉMOIRE.
 *
 * Une suite tuée entre le premier test de génération et l'`afterAll` laissait jusqu'à
 * ~72 séances RÉELLES en production : elles ne portent ni préfixe ni `cree_par`, le
 * balayage de FAMILLE ne les voit pas, et l'exécution suivante les intégrait à SA
 * propre empreinte — donc ne les aurait jamais supprimées. Contrairement à la moitié
 * préfixée du nettoyage, rendue rattrapable par I6, celle-ci ne l'était pas.
 *
 * L'empreinte est donc écrite sur DISQUE dès qu'elle est prise, avec l'instant de
 * début d'exécution, et effacée seulement après un nettoyage final réussi. Sa présence
 * au démarrage suivant SIGNIFIE « la précédente exécution n'est pas allée jusqu'à son
 * nettoyage » :
 *  - dans la FENÊTRE DE REPRISE, elle est reprise telle quelle et le delta de
 *    l'exécution interrompue est rattrapé par le nettoyage d'entrée, sous la MÊME garde
 *    bruyante (jamais `prevue`, jamais pointée, sinon on lève) ;
 *  - au-delà, on REFUSE BRUYAMMENT de démarrer plutôt que de supprimer sur la foi d'une
 *    empreinte vieille de plusieurs jours, pendant lesquels des séances légitimes ont pu
 *    être générées : le résidu cesse d'être invisible sans que la suite s'autorise à
 *    trancher seule. C'est le remède suggéré par la revue (« consigner l'intervalle
 *    temporel de la suite et refuser bruyamment au démarrage suivant »).
 *
 * Ce que ce remède NE fait PAS, et il faut le dire : il ne protège pas d'une
 * interruption survenue AVANT que l'empreinte ne soit écrite (aucune séance n'a alors
 * encore été générée : il n'y a rien à rattraper), ni d'un fichier effacé à la main.
 */
// `__dirname` plutôt que `import.meta.url` : Playwright transpile les specs de ce dépôt
// en CommonJS (package.json sans `"type": "module"`), et `import.meta` y est une erreur
// de syntaxe à l'exécution — vérifié, pas supposé. `join`/`__dirname` plutôt que
// `new URL(...)` : la constante `URL` de ce fichier est l'URL Supabase, elle masque le
// constructeur global.
const CHEMIN_EMPREINTE = join(__dirname, '..', '..', '.ael-preuves-empreinte.json')
const FENETRE_REPRISE_MS = 24 * 60 * 60 * 1000

type EmpreintePersistee = { debutIso: string; ids: string[] }

function lireEmpreintePersistee(): EmpreintePersistee | null {
  if (!existsSync(CHEMIN_EMPREINTE)) {
    return null
  }
  // Aucun `catch` ici : un fichier illisible ou mal formé doit LEVER, jamais être
  // traité comme « pas d'empreinte » — ce silence-là rendrait le résidu invisible une
  // seconde fois, ce que ce mécanisme existe précisément pour empêcher.
  const parse = JSON.parse(readFileSync(CHEMIN_EMPREINTE, 'utf8')) as EmpreintePersistee
  if (typeof parse.debutIso !== 'string' || !Array.isArray(parse.ids)) {
    throw new Error(
      `Empreinte persistée illisible (${CHEMIN_EMPREINTE}) : structure inattendue. ` +
        'Intervention manuelle requise — ce fichier atteste une exécution non close.',
    )
  }
  return parse
}

let idAntenneDeplacement: string
let idCalendrierDeplacement: string
let idAntenneInactive: string
let idCalendrierAntenneInactive: string
let idMembreArchivage: string
let idAntenneDetachement: string
let idMembreDetachement: string
let idMembreTemoinDetachement: string
let idSeanceDetachement: string
let idSeancePointageForge: string
let idMembreCiblePointageForge: string
let idMembreEnseignantMasque: string
let idSeanceEnseignantMasque: string
// Trou n°2 de la revue de la Task 19 : le cas NOMINAL de l'enseignant (fiche VISIBLE,
// pas archivée) n'avait aucune assertion de non-effacement — seul le cas masqué,
// plus rare, en avait une.
let idMembreEnseignantVisible: string
let idSeanceEnseignantVisible: string
// Trou n°3 : le champ MODÉRATEUR n'était jamais éprouvé en cas masqué (seul
// l'enseignant l'était), et le message faux du déclencheur de complétude
// (« l'enseignant est manquant ») n'était jamais exercé sur un chemin où il NE DOIT
// PAS apparaître (masquer le modérateur, jamais surveillé par ce déclencheur).
let idMembreModerateurMasque: string
let idSeanceModerateurMasque: string
// IMPORTANT 4 de la revue de la Task 19 : le cas « membre ARCHIVÉ » — LE CŒUR de la
// promesse d'I1, et le cas ORDINAIRE cité en premier par le constat — n'était éprouvé
// NULLE PART, et `membresBrefsParIds` n'avait AUCUN test. Seule la branche du
// détachement (membre resté ACTIF, donc branche où la RLS LAISSE PASSER) était couverte :
// la branche « la RLS refuse → Fiche non consultable » ne l'était sur aucun chemin.
// DEUX membres archivés, pas un seul, parce qu'IMPORTANT 7 porte précisément sur le cas
// où deux fiches masquées rendaient deux lignes STRICTEMENT identiques.
let idAntenneArchivePointee: string
let idSeanceArchivePointee: string
let idMembreArchivePointeA: string
let idMembreArchivePointeB: string
let idMembreTemoinArchivePointee: string

// Empreinte des séances existantes AVANT toute génération, et drapeau qui dit si elle a
// été prise. Le drapeau, et non `idsSeancesAvant.size > 0` : une base légitimement vide
// de séances donnerait une empreinte vide, et le nettoyage du delta ne se déclencherait
// jamais — exactement le cas où il serait le plus utile.
let idsSeancesAvant: Set<string> = new Set()
let empreinteSeancesPrise = false

async function creerMembre(suffixe: string, antenneId: string | null): Promise<string> {
  const { data, error } = await admin
    .from('membres')
    .insert({ nom: `${PREFIXE}-${suffixe}`, prenom: 'Test', antenne_id: antenneId })
    .select('id')
    .single()
  if (error || !data) throw new Error(`création du membre ${suffixe} impossible : ${error?.message}`)
  return data.id as string
}

async function supprimerCompte(identifiant: string) {
  const { data } = await admin.from('profils').select('id').eq('identifiant', identifiant).maybeSingle()
  if (data) {
    await admin.auth.admin.deleteUser(data.id)
    return
  }
  // Mineur 6 de la revue de la Task 19 — MÊME FAMILLE QUE C1, sur une autre API.
  // `listUsers()` rend 50 comptes PAR PAGE par défaut : sans parcours, ce rattrapage
  // d'un compte orphelin (profil supprimé, utilisateur auth resté) échouerait EN SILENCE
  // dès le 51e compte, laissant un compte de test actif en production — et le
  // `createUser` de l'exécution suivante échouerait alors sur un doublon d'adresse, pour
  // une raison introuvable. On parcourt donc jusqu'à épuisement — DANS CE FICHIER.
  //
  // Mineur 1 de la revue finale de branche : ce commentaire disait « comme partout
  // ailleurs », et c'est FAUX. 25 des 27 fichiers de test du dépôt appellent encore
  // `listUsers()` sans parcours, et le README le documente comme une limite connue et
  // non traitée. Un commentaire qui promet plus que le dépôt ne tient, écrit dans le
  // correctif d'un constat : le motif exact que cette phase traque. La phrase ne décrit
  // plus que ce fichier.
  const PAR_PAGE = 200
  for (let page = 1; ; page++) {
    const { data: comptes, error } = await admin.auth.admin.listUsers({ page, perPage: PAR_PAGE })
    if (error) throw new Error(`liste des comptes impossible : ${error.message}`)
    const utilisateurs = comptes?.users ?? []
    const orphelin = utilisateurs.find((u) => u.email === `${identifiant}@asonkeng.local`)
    if (orphelin) {
      await admin.auth.admin.deleteUser(orphelin.id)
      return
    }
    if (utilisateurs.length < PAR_PAGE) return
  }
}

async function creerCompte(identifiant: string, mdp: string, role: 'administrateur' | 'moderateur' | null) {
  const { data, error } = await admin.auth.admin.createUser({
    email: `${identifiant}@asonkeng.local`,
    password: mdp,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(error?.message)
  const { error: erreurProfil } = await admin
    .from('profils')
    .insert({ id: data.user.id, identifiant, nom_affichage: `Test ${identifiant}` })
  if (erreurProfil) throw new Error(`insertion du profil impossible : ${erreurProfil.message}`)
  if (role) {
    const { error: erreurRole } = await admin.from('roles_profil').insert({ profil_id: data.user.id, role })
    if (erreurRole) throw new Error(`attribution du rôle impossible : ${erreurRole.message}`)
  }
}

/**
 * Nettoyage sur préfixe de FAMILLE (I6), plutôt que sur les variables `let` de CETTE
 * exécution : une exécution interrompue avant sa propre fin laisse des antennes, des
 * membres et des séances sous `FAMILLE` mais avec un AUTRE suffixe aléatoire, que ces
 * variables (encore `undefined` au tout premier appel, le nettoyage d'entrée) ne
 * peuvent de toute façon pas connaître. Le balayage retrouve tout ce qui porte
 * `FAMILLE`, qu'il vienne de cette exécution ou d'une précédente.
 */
async function nettoyer() {
  for (const identifiant of [IDENT_ADMIN, IDENT_MODERATEUR, IDENT_SIMPLE]) {
    await supprimerCompte(identifiant)
  }

  const { data: antennesFamille, error: erreurAntennesFamille } = await admin
    .from('antennes')
    .select('id')
    .like('nom', `${FAMILLE}%`)
  if (erreurAntennesFamille) {
    throw new Error(`balayage des antennes de la famille impossible : ${erreurAntennesFamille.message}`)
  }
  const idsAntennesFamille = (antennesFamille ?? []).map((a) => a.id as string)

  const { data: membresFamille, error: erreurMembresFamille } = await admin
    .from('membres')
    .select('id')
    .like('nom', `${FAMILLE}%`)
  if (erreurMembresFamille) {
    throw new Error(`balayage des membres de la famille impossible : ${erreurMembresFamille.message}`)
  }
  const idsMembresFamille = (membresFamille ?? []).map((m) => m.id as string)

  // Séances retrouvées par DEUX chemins, cumulés : la jonction vers une antenne de la
  // famille (la plupart des cas — détachement, pointage forgé, déplacement, antenne
  // inactive), et le lien direct enseignant/modérateur (le cas de l'enseignant masqué
  // et des deux nouveaux tests de non-effacement, qui ne portent AUCUNE jonction
  // d'antenne).
  const idsSeances = new Set<string>()
  if (idsAntennesFamille.length > 0) {
    const { data: jonctions, error: erreurJonctions } = await admin
      .from('seances_ael_antennes')
      .select('seance_id')
      .in('antenne_id', idsAntennesFamille)
    if (erreurJonctions) {
      throw new Error(`balayage des jonctions de la famille impossible : ${erreurJonctions.message}`)
    }
    for (const j of jonctions ?? []) idsSeances.add(j.seance_id as string)
  }
  if (idsMembresFamille.length > 0) {
    const { data: parEnseignant, error: erreurParEnseignant } = await admin
      .from('seances_ael')
      .select('id')
      .in('enseignant_membre_id', idsMembresFamille)
    if (erreurParEnseignant) {
      throw new Error(`balayage des séances par enseignant impossible : ${erreurParEnseignant.message}`)
    }
    for (const s of parEnseignant ?? []) idsSeances.add(s.id as string)

    const { data: parModerateur, error: erreurParModerateur } = await admin
      .from('seances_ael')
      .select('id')
      .in('moderateur_membre_id', idsMembresFamille)
    if (erreurParModerateur) {
      throw new Error(`balayage des séances par modérateur impossible : ${erreurParModerateur.message}`)
    }
    for (const s of parModerateur ?? []) idsSeances.add(s.id as string)
  }

  if (idsSeances.size > 0) {
    const idsArr = [...idsSeances]
    await admin.from('presences_ael').delete().in('seance_id', idsArr)
    await admin.from('seances_ael_antennes').delete().in('seance_id', idsArr)
    // Erreur VÉRIFIÉE : une séance encore `tenue` dont l'enseignant vient d'être
    // supprimé sans passer par ici lèverait le déclencheur de complétude en amont —
    // improbable dans l'ordre choisi (séances avant membres), mais un échec de CETTE
    // suppression ne doit jamais passer inaperçu.
    const { error: erreurSeances } = await admin.from('seances_ael').delete().in('id', idsArr)
    if (erreurSeances) {
      throw new Error(`nettoyage des séances de la famille impossible : ${erreurSeances.message}`)
    }
  }

  if (idsAntennesFamille.length > 0) {
    // `calendriers_ael.antenne_id` est en `on delete restrict`.
    const { error: erreurCalendriers } = await admin
      .from('calendriers_ael')
      .delete()
      .in('antenne_id', idsAntennesFamille)
    if (erreurCalendriers) {
      throw new Error(`nettoyage des calendriers de la famille impossible : ${erreurCalendriers.message}`)
    }
  }

  // LES MEMBRES EN DERNIER, jamais avant les séances : `seances_ael.enseignant_membre_id`
  // est en `on delete set null` sur une table que surveille le déclencheur de complétude
  // (Task 8) — supprimer l'enseignant d'une séance encore `tenue` déclencherait un
  // UPDATE mettant la colonne à null, et le déclencheur lèverait. Les séances de cette
  // suite viennent d'être supprimées ci-dessus : l'ordre n'est pas cosmétique.
  await admin.from('membres').delete().like('nom', `${FAMILLE}%`)
  const { error: erreurAntennes } = await admin.from('antennes').delete().like('nom', `${FAMILLE}%`)
  if (erreurAntennes) {
    throw new Error(`nettoyage des antennes de la famille impossible : ${erreurAntennes.message}`)
  }

  // Rattrapage du DELTA de génération. Les deux tests qui cliquent réellement
  // « Générer » créent aussi les séances dues sur les calendriers RÉELS : elles ne
  // portent aucun préfixe, aucun `cree_par`, et le nettoyage par préfixe ne peut pas les
  // atteindre. On supprime donc exactement ce qui est apparu depuis l'empreinte, et rien
  // d'autre. Ce bloc ne s'exécute jamais au nettoyage d'entrée (`beforeAll`), où
  // l'empreinte n'est pas encore prise.
  if (empreinteSeancesPrise) {
    // PARCOURS PAR LOTS (C1) : une relecture non bornée serait tronquée à 1000 lignes
    // par PostgREST, laissant croire à un delta plus petit qu'il n'est.
    const apres = await lireSeancesParLots<{ id: string; etat: string; calendrier_id: string | null }>(
      admin,
      'id, etat, calendrier_id',
    )
    // `calendrier_id !== null` est une protection DÉLIBÉRÉE : elle interdit à ce
    // nettoyage de toucher une séance créée À LA MAIN, qui n'a jamais pu naître d'une
    // génération.
    //
    // MINEUR 8 DE LA REVUE FINALE — SA CONTREPARTIE, DITE PLUTÔT QUE TUE : ce filtre
    // exclut donc AUSSI toute séance manuelle créée PAR cette suite ou pendant son
    // exécution. Le registre atteste qu'une séance manuelle a réellement été créée en
    // production pendant une session de vérification humaine (Tasks 13-14, « 90 générées
    // + 1 manuelle »). Une telle séance n'est rattrapée ici que si elle porte une
    // jonction vers une antenne de la FAMILLE (balayage de `nettoyerFamille` plus haut) ;
    // sans jonction, elle échappe aux deux mécanismes. C'est le même trou que l'I3 de la
    // revue finale a refermé côté RLS par un marqueur `cree_par` — la même prise n'existe
    // pas ici, la séance étant créée par la Server Action et non par la suite.
    const creees = apres.filter((l) => l.calendrier_id !== null && !idsSeancesAvant.has(l.id))
    let supprimees = 0
    for (const seance of creees) {
      // Refus BRUYANT plutôt que suppression aveugle : une séance déjà tenue ou déjà
      // pointée n'a pas été créée par cette suite, ou l'a été et quelqu'un s'en est
      // servi. On lève, on ne devine pas.
      const { data: presences, error: erreurPresences } = await admin
        .from('presences_ael')
        .select('membre_id')
        .eq('seance_id', seance.id)
      if (erreurPresences) {
        throw new Error(
          `Nettoyage refusé : présences illisibles pour la séance ${seance.id} — ${erreurPresences.message}`,
        )
      }
      if (seance.etat !== 'prevue' || (presences ?? []).length > 0) {
        throw new Error(
          `Nettoyage refusé : la séance ${seance.id} créée pendant cette suite est ` +
            `à l'état ${seance.etat} avec ${(presences ?? []).length} présence(s). ` +
            'Intervention manuelle requise.',
        )
      }
      await admin.from('seances_ael_antennes').delete().eq('seance_id', seance.id)
      const { error: erreurSuppression } = await admin.from('seances_ael').delete().eq('id', seance.id)
      if (erreurSuppression) {
        throw new Error(
          `Nettoyage refusé : suppression de la séance ${seance.id} impossible — ${erreurSuppression.message}`,
        )
      }
      supprimees++
    }
    // Comptage à CONSIGNER dans le rapport de tâche (contrainte globale n°13).
    console.log(`[ael-preuves] séances générées supprimées au nettoyage : ${supprimees}`)
  }

  await verifierAbsenceDeResidu()
}

/**
 * IMPORTANT 2 de la revue — LE « 72 » CONSIGNÉ COMPTAIT DES SUPPRESSIONS, PAS UNE
 * ABSENCE. Ce fichier était le SEUL de sa famille (`ael-pointage.spec.ts:155-172`,
 * `ael-seance-detail.spec.ts:158-175`, `antennes-membres.spec.ts`,
 * `archivage-compte.spec.ts`, `completude-seance-production.spec.ts:118-126`) à ne pas
 * tenir la contrainte globale n°13, et c'est celui qui crée le plus de matière en
 * production. « J'ai supprimé N lignes » ne répond pas à « reste-t-il quelque chose ? » :
 * un balayage qui rate une entité en supprime toujours autant et en laisse quand même.
 *
 * Appelée à la FIN de `nettoyer()`, donc aux DEUX appels : le nettoyage d'entrée du
 * `beforeAll` doit lui aussi partir d'une base propre, sans quoi les tests s'appuieraient
 * sur un décor pollué par une exécution antérieure.
 */
async function verifierAbsenceDeResidu() {
  const { count: membresRestants, error: erreurMembres } = await admin
    .from('membres')
    .select('id', { count: 'exact', head: true })
    .like('nom', `${FAMILLE}%`)
  if (erreurMembres) throw new Error(`comptage des membres résiduels impossible : ${erreurMembres.message}`)
  if (membresRestants !== 0) {
    throw new Error(`Nettoyage incomplet : ${membresRestants} membre(s) sous ${FAMILLE} subsistent.`)
  }

  const { count: antennesRestantes, error: erreurAntennes } = await admin
    .from('antennes')
    .select('id', { count: 'exact', head: true })
    .like('nom', `${FAMILLE}%`)
  if (erreurAntennes) throw new Error(`comptage des antennes résiduelles impossible : ${erreurAntennes.message}`)
  if (antennesRestantes !== 0) {
    throw new Error(`Nettoyage incomplet : ${antennesRestantes} antenne(s) sous ${FAMILLE} subsistent.`)
  }

  const { count: comptesRestants, error: erreurComptes } = await admin
    .from('profils')
    .select('id', { count: 'exact', head: true })
    .in('identifiant', [IDENT_ADMIN, IDENT_MODERATEUR, IDENT_SIMPLE])
  if (erreurComptes) throw new Error(`comptage des profils résiduels impossible : ${erreurComptes.message}`)
  if (comptesRestants !== 0) {
    throw new Error(`Nettoyage incomplet : ${comptesRestants} profil(s) de test subsistent.`)
  }

  // Séances : l'absence se vérifie sur le MÊME critère que la suppression (delta de
  // l'empreinte), sur une relecture PAGINÉE (C1). Ne rien trouver ici est la seule
  // preuve que le delta a été intégralement traité, garde bruyante comprise.
  if (empreinteSeancesPrise) {
    const apres = await lireSeancesParLots<{ id: string; calendrier_id: string | null }>(admin, 'id, calendrier_id')
    const restantes = apres.filter((l) => l.calendrier_id !== null && !idsSeancesAvant.has(l.id))
    if (restantes.length !== 0) {
      throw new Error(
        `Nettoyage incomplet : ${restantes.length} séance(s) générée(s) pendant cette suite subsistent ` +
          `(${restantes.map((s) => s.id).join(', ')}).`,
      )
    }
  }
}

test.beforeAll(async () => {
  // REPRISE D'UNE EXÉCUTION NON CLOSE (IMPORTANT 6) — avant le nettoyage d'entrée, pour
  // que celui-ci rattrape le delta laissé par l'exécution interrompue.
  const persistee = lireEmpreintePersistee()
  if (persistee) {
    const age = Date.now() - Date.parse(persistee.debutIso)
    if (!Number.isFinite(age)) {
      throw new Error(`Empreinte persistée illisible (${CHEMIN_EMPREINTE}) : instant de début invalide.`)
    }
    if (age > FENETRE_REPRISE_MS) {
      throw new Error(
        `Reprise refusée : ${CHEMIN_EMPREINTE} atteste une exécution de ael-preuves non close ` +
          `démarrée le ${persistee.debutIso}, soit il y a plus de ${FENETRE_REPRISE_MS / 3_600_000} h. ` +
          'Des séances générées par cette exécution subsistent probablement en production, mais ' +
          'trop de temps a passé pour que cette suite distingue seule ses propres séances de ' +
          'séances légitimement générées depuis. Intervention manuelle requise : comparer ' +
          "`seances_ael` à l'empreinte de ce fichier, supprimer ce qui doit l'être, puis effacer " +
          'ce fichier.',
      )
    }
    idsSeancesAvant = new Set(persistee.ids)
    empreinteSeancesPrise = true
    console.log(
      `[ael-preuves] exécution précédente non close détectée (démarrée le ${persistee.debutIso}) : ` +
        `son empreinte de ${persistee.ids.length} séance(s) est reprise, son delta va être rattrapé.`,
    )
  }

  await nettoyer()

  // EMPREINTE, immédiatement après le nettoyage d'entrée et AVANT toute génération.
  // Tout ce qui portera un `calendrier_id` et ne figurera pas ici aura été créé par
  // cette suite — y compris sur les calendriers réels, que `genererSeances` balaie sans
  // portée. Lecture PAGINÉE (C1) : tronquée, elle ferait classer de VRAIES séances de
  // production comme « créées par cette suite », donc supprimer.
  {
    const seances = await lireSeancesParLots<{ id: string }>(admin, 'id')
    idsSeancesAvant = new Set(seances.map((l) => l.id))
    empreinteSeancesPrise = true
    // Écrite sur disque AVANT le premier test, donc avant la première génération : une
    // interruption ultérieure laisse derrière elle de quoi la rattraper (IMPORTANT 6).
    writeFileSync(
      CHEMIN_EMPREINTE,
      JSON.stringify({ debutIso: new Date().toISOString(), ids: [...idsSeancesAvant] } satisfies EmpreintePersistee),
      'utf8',
    )
  }

  const { data: antenneDeplacement, error: erreurAntenneDeplacement } = await admin
    .from('antennes')
    .insert({ nom: `${PREFIXE}-AntenneDeplacement`, pays: 'Test' })
    .select('id')
    .single()
  if (erreurAntenneDeplacement || !antenneDeplacement) throw new Error(erreurAntenneDeplacement?.message)
  idAntenneDeplacement = antenneDeplacement.id as string

  const { data: calendrier, error: erreurCalendrier } = await admin
    .from('calendriers_ael')
    .insert({ antenne_id: idAntenneDeplacement, jour_semaine: 3 })
    .select('id')
    .single()
  if (erreurCalendrier || !calendrier) throw new Error(erreurCalendrier?.message)
  idCalendrierDeplacement = calendrier.id as string

  // Antenne DÉSACTIVÉE dotée d'un créneau ACTIF : la situation exacte que
  // `calendriersActifs()` (Task 12) doit exclure. Créée active puis désactivée, parce
  // que `ajouterCalendrier` refuse une antenne inactive — ici on écrit avec la clé de
  // service, donc directement, pour reproduire l'état qu'une désactivation ultérieure
  // laisse derrière elle.
  const { data: antenneInactive, error: erreurAntenneInactive } = await admin
    .from('antennes')
    .insert({ nom: `${PREFIXE}-AntenneInactive`, pays: 'Test' })
    .select('id')
    .single()
  if (erreurAntenneInactive || !antenneInactive) throw new Error(erreurAntenneInactive?.message)
  idAntenneInactive = antenneInactive.id as string

  const { data: calendrierInactive, error: erreurCalendrierInactive } = await admin
    .from('calendriers_ael')
    .insert({ antenne_id: idAntenneInactive, jour_semaine: 4 })
    .select('id')
    .single()
  if (erreurCalendrierInactive || !calendrierInactive) throw new Error(erreurCalendrierInactive?.message)
  idCalendrierAntenneInactive = calendrierInactive.id as string

  const { error: erreurDesactivation } = await admin
    .from('antennes')
    .update({ actif: false })
    .eq('id', idAntenneInactive)
  if (erreurDesactivation) throw new Error(erreurDesactivation.message)

  idMembreArchivage = await creerMembre('archivage', null)

  const { data: antenneDetachement, error: erreurAntenneDetachement } = await admin
    .from('antennes')
    .insert({ nom: `${PREFIXE}-AntenneDetachement`, pays: 'Test' })
    .select('id')
    .single()
  if (erreurAntenneDetachement || !antenneDetachement) throw new Error(erreurAntenneDetachement?.message)
  idAntenneDetachement = antenneDetachement.id as string

  idMembreDetachement = await creerMembre('detache', idAntenneDetachement)
  // SECOND membre de cette antenne, jamais détaché : contrôle positif de la preuve n°12.
  // Sans lui, l'antenne n'aurait qu'un seul membre, la liste de pointage serait
  // légitimement vide après le détachement, et l'assertion « le détaché n'y est plus »
  // serait indistinguable de « la page est cassée ».
  idMembreTemoinDetachement = await creerMembre('temoin', idAntenneDetachement)

  const { data: enseignant } = await admin
    .from('membres')
    .insert({ nom: `${PREFIXE}-enseignant`, prenom: 'Test' })
    .select('id')
    .single()

  const { data: seanceDetachement, error: erreurSeanceDetachement } = await admin
    .from('seances_ael')
    .insert({ date: '2026-09-20', etat: 'tenue', theme: 'T', enseignant_membre_id: enseignant!.id })
    .select('id')
    .single()
  if (erreurSeanceDetachement || !seanceDetachement) throw new Error(erreurSeanceDetachement?.message)
  idSeanceDetachement = seanceDetachement.id as string
  await admin.from('seances_ael_antennes').insert({ seance_id: idSeanceDetachement, antenne_id: idAntenneDetachement })
  await admin.from('presences_ael').insert({ seance_id: idSeanceDetachement, membre_id: idMembreDetachement, present: true })

  idMembreCiblePointageForge = await creerMembre('cible', null)
  const { data: seancePointageForge, error: erreurSeancePointageForge } = await admin
    .from('seances_ael')
    .insert({ date: '2026-09-21' })
    .select('id')
    .single()
  if (erreurSeancePointageForge || !seancePointageForge) throw new Error(erreurSeancePointageForge?.message)
  idSeancePointageForge = seancePointageForge.id as string
  // Ciblée par une antenne dont le membre est ACTIVEMENT rattaché, pour qu'il figure
  // dans la liste pré-remplie du pointage.
  const { data: antennePointageForge } = await admin
    .from('antennes')
    .insert({ nom: `${PREFIXE}-AntennePointageForge`, pays: 'Test' })
    .select('id')
    .single()
  await admin.from('membres').update({ antenne_id: antennePointageForge!.id }).eq('id', idMembreCiblePointageForge)
  await admin.from('seances_ael_antennes').insert({ seance_id: idSeancePointageForge, antenne_id: antennePointageForge!.id })

  // Séance TENUE dont l'enseignant sera ARCHIVÉ : `membres_lecture`
  // (`supabase/migrations/20260812120000_membres.sql`) réserve les fiches archivées à
  // l'administrateur, donc l'embed de l'enseignant rendra `null` pour un modérateur
  // alors que `enseignant_membre_id` reste rempli. État `tenue` à dessein : c'est le cas
  // où l'effacement ne serait pas seulement silencieux, mais produirait en plus, via le
  // déclencheur de complétude, un message affirmant que l'enseignant est manquant alors
  // qu'il est seulement invisible.
  idMembreEnseignantMasque = await creerMembre('enseignant-masque', null)
  const { data: seanceEnseignantMasque, error: erreurSeanceEnseignantMasque } = await admin
    .from('seances_ael')
    .insert({
      date: '2026-09-22',
      etat: 'tenue',
      theme: 'Thème initial',
      enseignant_membre_id: idMembreEnseignantMasque,
    })
    .select('id')
    .single()
  if (erreurSeanceEnseignantMasque || !seanceEnseignantMasque) {
    throw new Error(erreurSeanceEnseignantMasque?.message)
  }
  idSeanceEnseignantMasque = seanceEnseignantMasque.id as string
  const { error: erreurArchivageEnseignant } = await admin
    .from('membres')
    .update({ etat: 'archive' })
    .eq('id', idMembreEnseignantMasque)
  if (erreurArchivageEnseignant) throw new Error(erreurArchivageEnseignant.message)

  // Trou n°2 (revue de la Task 19) : cas NOMINAL, enseignant VISIBLE (jamais archivé),
  // séance déjà tenue. Le chemin le plus fréquenté n'avait aucune assertion de
  // non-effacement dans toute la suite.
  idMembreEnseignantVisible = await creerMembre('enseignant-visible', null)
  const { data: seanceEnseignantVisible, error: erreurSeanceEnseignantVisible } = await admin
    .from('seances_ael')
    .insert({
      date: '2026-09-23',
      etat: 'tenue',
      theme: 'Thème initial visible',
      enseignant_membre_id: idMembreEnseignantVisible,
    })
    .select('id')
    .single()
  if (erreurSeanceEnseignantVisible || !seanceEnseignantVisible) {
    throw new Error(erreurSeanceEnseignantVisible?.message)
  }
  idSeanceEnseignantVisible = seanceEnseignantVisible.id as string

  // Trou n°3 : champ MODÉRATEUR masqué (archivé), séance déjà tenue, avec un
  // enseignant VISIBLE et valide (le même que ci-dessus) pour que la création directe
  // en `tenue` passe le déclencheur de complétude, qui ne surveille QUE le thème et
  // l'enseignant, jamais le modérateur.
  idMembreModerateurMasque = await creerMembre('moderateur-masque', null)
  const { data: seanceModerateurMasque, error: erreurSeanceModerateurMasque } = await admin
    .from('seances_ael')
    .insert({
      date: '2026-09-24',
      etat: 'tenue',
      theme: 'Thème initial modérateur masqué',
      enseignant_membre_id: idMembreEnseignantVisible,
      moderateur_membre_id: idMembreModerateurMasque,
    })
    .select('id')
    .single()
  if (erreurSeanceModerateurMasque || !seanceModerateurMasque) {
    throw new Error(erreurSeanceModerateurMasque?.message)
  }
  idSeanceModerateurMasque = seanceModerateurMasque.id as string
  const { error: erreurArchivageModerateur } = await admin
    .from('membres')
    .update({ etat: 'archive' })
    .eq('id', idMembreModerateurMasque)
  if (erreurArchivageModerateur) throw new Error(erreurArchivageModerateur.message)

  // IMPORTANT 4 / IMPORTANT 5 / IMPORTANT 7 — décor du cas « membre ARCHIVÉ pointé ».
  // Une antenne, TROIS membres pointés présents dessus (deux qui seront archivés, un
  // témoin qui reste actif), une séance ciblant cette antenne. Le total attendu à
  // l'écran est donc 3 alors que la liste NORMALE n'en montrera qu'un : c'est ce qui
  // fait de l'assertion sur le total autre chose qu'une décoration — elle prouve que le
  // total compte bien les présences HORS LISTE (l'arbitrage d'I1), pas seulement les
  // cases visibles dans la liste courante.
  const { data: antenneArchivePointee, error: erreurAntenneArchivePointee } = await admin
    .from('antennes')
    .insert({ nom: `${PREFIXE}-AntenneArchivePointee`, pays: 'Test' })
    .select('id')
    .single()
  if (erreurAntenneArchivePointee || !antenneArchivePointee) {
    throw new Error(`création de l'antenne d'archivage impossible : ${erreurAntenneArchivePointee?.message}`)
  }
  idAntenneArchivePointee = antenneArchivePointee.id as string

  idMembreArchivePointeA = await creerMembre('archive-pointe-a', idAntenneArchivePointee)
  idMembreArchivePointeB = await creerMembre('archive-pointe-b', idAntenneArchivePointee)
  idMembreTemoinArchivePointee = await creerMembre('temoin-archive', idAntenneArchivePointee)

  const { data: seanceArchivePointee, error: erreurSeanceArchivePointee } = await admin
    .from('seances_ael')
    .insert({ date: '2026-09-25' })
    .select('id')
    .single()
  if (erreurSeanceArchivePointee || !seanceArchivePointee) {
    throw new Error(`création de la séance d'archivage impossible : ${erreurSeanceArchivePointee?.message}`)
  }
  idSeanceArchivePointee = seanceArchivePointee.id as string

  const { error: erreurJonctionArchivePointee } = await admin
    .from('seances_ael_antennes')
    .insert({ seance_id: idSeanceArchivePointee, antenne_id: idAntenneArchivePointee })
  if (erreurJonctionArchivePointee) throw new Error(erreurJonctionArchivePointee.message)

  const { error: erreurPresencesArchivePointee } = await admin.from('presences_ael').insert([
    { seance_id: idSeanceArchivePointee, membre_id: idMembreArchivePointeA, present: true },
    { seance_id: idSeanceArchivePointee, membre_id: idMembreArchivePointeB, present: true },
    { seance_id: idSeanceArchivePointee, membre_id: idMembreTemoinArchivePointee, present: true },
  ])
  if (erreurPresencesArchivePointee) throw new Error(erreurPresencesArchivePointee.message)

  // Archivage APRÈS le pointage : c'est l'ordre réel de D48 (« la présence RESTE »).
  const { error: erreurArchivagePointes } = await admin
    .from('membres')
    .update({ etat: 'archive' })
    .in('id', [idMembreArchivePointeA, idMembreArchivePointeB])
  if (erreurArchivagePointes) throw new Error(erreurArchivagePointes.message)

  await creerCompte(IDENT_ADMIN, MDP_ADMIN, 'administrateur')
  await creerCompte(IDENT_MODERATEUR, MDP_MODERATEUR, 'moderateur')
  await creerCompte(IDENT_SIMPLE, MDP_SIMPLE, null)
})

test.afterAll(async () => {
  await nettoyer()
  // Effacée SEULEMENT après un nettoyage vérifié (`verifierAbsenceDeResidu` lève sinon,
  // et le fichier survit) : sa présence au prochain démarrage signifie exactement « la
  // dernière exécution n'est pas allée jusqu'au bout de son nettoyage ».
  rmSync(CHEMIN_EMPREINTE, { force: true })
})

async function seConnecter(page: import('@playwright/test').Page, identifiant: string, mdp: string) {
  await page.goto('/connexion')
  await page.getByLabel('Identifiant').fill(identifiant)
  await page.getByLabel('Mot de passe', { exact: true }).fill(mdp)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page).toHaveURL(/\/tableau-de-bord/)
}

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

function verifierCaptureAction(champs: Record<string, string>): void {
  const trouve = Object.keys(champs).some((nom) => nom.startsWith('$ACTION'))
  if (!trouve) {
    throw new Error(
      `Capture invalide : aucun champ « $ACTION* » parmi ${JSON.stringify(Object.keys(champs))}.`,
    )
  }
}

async function clientAuthentifie(identifiant: string, mdp: string): Promise<SupabaseClient> {
  const client = createClient(URL, CLE_ANON, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error } = await client.auth.signInWithPassword({ email: `${identifiant}@asonkeng.local`, password: mdp })
  if (error) throw new Error(`connexion impossible pour ${identifiant} : ${error.message}`)
  return client
}

// ---------------------------------------------------------------------------
// Preuve n°5 (partie 1/2) — genererSeances, garde forgé.
// ---------------------------------------------------------------------------

test('genererSeances : un compte simple ne peut pas générer, avec canari modérateur', async ({
  page,
  browser,
  baseURL,
}) => {
  const { data: avant } = await admin.from('seances_ael').select('id').eq('calendrier_id', idCalendrierDeplacement)
  const nombreAvant = (avant ?? []).length
  expect(nombreAvant).toBe(0)

  const { data: avantInactive } = await admin
    .from('seances_ael')
    .select('id')
    .eq('calendrier_id', idCalendrierAntenneInactive)
  expect(avantInactive).toEqual([])

  await seConnecter(page, IDENT_MODERATEUR, MDP_MODERATEUR)
  await page.goto('/ael/seances')
  const formulaire = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Générer les séances' }) })
  const champs = extraireChampsCaches(await formulaire.evaluate((el) => el.outerHTML))
  verifierCaptureAction(champs)

  const contexteSimple = await browser.newContext({ baseURL })
  try {
    const pageSimple = await contexteSimple.newPage()
    await seConnecter(pageSimple, IDENT_SIMPLE, MDP_SIMPLE)
    await pageSimple.request.post('/ael/seances', { multipart: champs })

    const { data: apres } = await admin.from('seances_ael').select('id').eq('calendrier_id', idCalendrierDeplacement)
    expect((apres ?? []).length).toBe(0)
  } finally {
    await contexteSimple.close()
  }

  const contexteModerateur = await browser.newContext({ baseURL })
  try {
    const pageModerateur = await contexteModerateur.newPage()
    await seConnecter(pageModerateur, IDENT_MODERATEUR, MDP_MODERATEUR)
    await pageModerateur.request.post('/ael/seances', { multipart: champs })

    await expect(async () => {
      const { data: apresCanari } = await admin
        .from('seances_ael')
        .select('id')
        .eq('calendrier_id', idCalendrierDeplacement)
      expect((apresCanari ?? []).length).toBeGreaterThan(0)
    }).toPass()

    // La MÊME génération, qui vient de peupler le calendrier de l'antenne ACTIVE
    // ci-dessus (contrôle positif indiscutable : c'est le même appel), n'a produit
    // AUCUNE séance pour le créneau actif de l'antenne DÉSACTIVÉE. Sans le filtre
    // `antennes.actif` de `calendriersActifs` (Task 12), une antenne hors service
    // recevrait des séances dont la liste de pointage serait vide — aucun membre actif
    // n'y étant rattachable.
    const { data: apresInactive } = await admin
      .from('seances_ael')
      .select('id')
      .eq('calendrier_id', idCalendrierAntenneInactive)
    expect(apresInactive).toEqual([])
  } finally {
    await contexteModerateur.close()
  }
})

// ---------------------------------------------------------------------------
// I6 de la revue finale de branche — creerSeanceManuelle et l'antenne DÉSACTIVÉE.
// ---------------------------------------------------------------------------

test("creerSeanceManuelle refuse une antenne désactivée, avec contrôle positif", async ({ page }) => {
  // La génération, elle, est protégée par `calendriersActifs` — c'est le test
  // ci-dessus. La création MANUELLE ne l'était pas : elle lisait `antenneIds`, vérifiait
  // seulement que le tableau n'était pas vide, et insérait la jonction. La clé étrangère
  // n'exige que l'EXISTENCE de l'antenne, jamais son état, donc rien ne rattrapait en
  // aval. Constat de la revue des Tasks 13-14, marqué « à corriger » au registre et
  // tombé entre deux rondes.
  //
  // Le formulaire ne propose que des antennes ACTIVES (`/ael/seances` passe par
  // `listerAntennes`), donc le refus ne peut être éprouvé que par une REQUÊTE FORGÉE —
  // exactement le scénario qu'un onglet resté ouvert reproduit, et le même motif de
  // preuve que sa sœur `definirAntenneMembre` (`tests/e2e/antennes-membres.spec.ts`).
  const DATE_REFUSEE = '2026-11-11'
  const DATE_ACCEPTEE = '2026-11-12'

  await seConnecter(page, IDENT_MODERATEUR, MDP_MODERATEUR)
  await page.goto('/ael/seances')
  // Le formulaire vit dans un `<details>` REPLIÉ (`page.tsx`) : tant qu'il l'est, son
  // contenu est masqué et `getByRole` ne le voit pas — un `filter({ has: … })` y attend
  // en vain jusqu'au délai. On déplie d'abord, comme un utilisateur le ferait.
  await page.getByText('Créer une séance manuellement').click()
  const formulaire = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Créer la séance' }) })
  const champs = extraireChampsCaches(await formulaire.evaluate((el) => el.outerHTML))
  verifierCaptureAction(champs)

  // CONTRÔLE D'ENTRÉE : ces deux dates sont vierges avant le geste. Sans lui, une
  // assertion « aucune séance à cette date » pourrait être verte pour la mauvaise
  // raison.
  const { data: avant } = await admin
    .from('seances_ael')
    .select('id')
    .in('date', [DATE_REFUSEE, DATE_ACCEPTEE])
  expect(avant).toEqual([])

  await page.request.post('/ael/seances', {
    multipart: { ...champs, date: DATE_REFUSEE, heure: '', antenneIds: idAntenneInactive },
  })
  const { data: apresRefus } = await admin.from('seances_ael').select('id').eq('date', DATE_REFUSEE)
  expect(apresRefus).toEqual([])

  // CONTRÔLE POSITIF, DANS LE MÊME TEST, avec le MÊME compte et la MÊME requête forgée :
  // seule l'antenne change. Sans lui, le refus ci-dessus serait indistinguable d'un
  // formulaire forgé qui ne fonctionne plus (champs `$ACTION*` périmés, garde de rôle
  // qui aurait mordu, etc.).
  await page.request.post('/ael/seances', {
    multipart: { ...champs, date: DATE_ACCEPTEE, heure: '', antenneIds: idAntenneDeplacement },
  })
  await expect(async () => {
    const { data } = await admin.from('seances_ael').select('id').eq('date', DATE_ACCEPTEE)
    expect(data).toHaveLength(1)
  }).toPass()

  // La séance du contrôle positif porte une jonction vers une antenne de la FAMILLE :
  // le balayage de `nettoyerFamille` la retrouverait même si la suppression explicite
  // ci-dessous était sautée par une assertion tombée plus haut. On la supprime quand
  // même, et on le vérifie par comptage.
  const { data: creee } = await admin.from('seances_ael').select('id').eq('date', DATE_ACCEPTEE)
  const idSeanceCreee = creee![0].id as string
  await admin.from('seances_ael_antennes').delete().eq('seance_id', idSeanceCreee)
  await admin.from('seances_ael').delete().eq('id', idSeanceCreee)
  const { count } = await admin
    .from('seances_ael')
    .select('id', { count: 'exact', head: true })
    .in('date', [DATE_REFUSEE, DATE_ACCEPTEE])
  expect(count).toBe(0)
})

// ---------------------------------------------------------------------------
// Preuve n°7 — le déplacement d'une séance ne recrée pas l'occurrence d'origine (D39).
// Dépend du test précédent : le calendrier de déplacement porte maintenant des séances.
// ---------------------------------------------------------------------------

test("le déplacement d'une séance ne la fait pas recréer à sa date d'origine (D39)", async ({ page }) => {
  const { data: premiereOccurrence, error } = await admin
    .from('seances_ael')
    .select('id, date, genere_pour_le')
    .eq('calendrier_id', idCalendrierDeplacement)
    .order('genere_pour_le')
    .limit(1)
    .single()
  expect(error).toBeNull()
  const idSeance = premiereOccurrence!.id as string
  const generePourLeOrigine = premiereOccurrence!.genere_pour_le as string
  const dateOrigine = premiereOccurrence!.date as string
  const dateDeplacee = new Date(new Date(`${dateOrigine}T00:00:00Z`).getTime() + 86_400_000)
    .toISOString()
    .slice(0, 10)

  await seConnecter(page, IDENT_MODERATEUR, MDP_MODERATEUR)
  await page.goto(`/ael/seances/${idSeance}`)
  await page.getByLabel('Date').fill(dateDeplacee)
  await page.getByRole('button', { name: 'Enregistrer' }).click()

  await expect(async () => {
    const { data: apresDeplacement } = await admin
      .from('seances_ael')
      .select('date, genere_pour_le')
      .eq('id', idSeance)
      .single()
    expect(apresDeplacement?.date).toBe(dateDeplacee)
    // `genere_pour_le` NE BOUGE JAMAIS (D39) : c'est ce qui protège l'occurrence
    // d'origine d'être recréée au prochain geste de génération.
    expect(apresDeplacement?.genere_pour_le).toBe(generePourLeOrigine)
  }).toPass()

  // Regénérer : la génération recalcule les MÊMES occurrences depuis aujourd'hui,
  // dont celle-ci (`genere_pour_le` inchangé la rend toujours candidate).
  await page.goto('/ael/seances')
  await page.getByRole('button', { name: 'Générer les séances' }).click()
  // `BoutonGenerer` (Task 14) rend un `role="status"` dès que la génération a répondu,
  // dans SES DEUX cas de compte rendu (« n séances générées » / « aucun créneau
  // actif ») : attendre son apparition plutôt qu'un délai arbitraire.
  await expect(page.getByRole('status')).toBeVisible()

  const { data: apresRegeneration } = await admin
    .from('seances_ael')
    .select('id, date')
    .eq('calendrier_id', idCalendrierDeplacement)
    .eq('genere_pour_le', generePourLeOrigine)
  // Une SEULE séance pour cette occurrence, toujours la même, toujours à sa date
  // déplacée — pas une seconde créée à `generePourLeOrigine`.
  expect(apresRegeneration).toHaveLength(1)
  expect(apresRegeneration![0].id).toBe(idSeance)
  expect(apresRegeneration![0].date).toBe(dateDeplacee)
})

// ---------------------------------------------------------------------------
// Preuve n°10 — persistance du compteur après archivage, avec un VRAI compte
// administrateur authentifié (pas la clé de service).
// ---------------------------------------------------------------------------

test('le compteur AEL ne change pas quand la fiche est archivée (D48)', async () => {
  const { data: enseignant } = await admin
    .from('membres')
    .insert({ nom: `${PREFIXE}-enseignant-archivage`, prenom: 'Test' })
    .select('id')
    .single()
  const { data: seance } = await admin
    .from('seances_ael')
    .insert({ date: '2026-09-25', etat: 'tenue', theme: 'T', enseignant_membre_id: enseignant!.id })
    .select('id')
    .single()
  await admin.from('presences_ael').insert({ seance_id: seance!.id, membre_id: idMembreArchivage, present: true })

  const clientAdminAuth = await clientAuthentifie(IDENT_ADMIN, MDP_ADMIN)
  const clientSimpleAuth = await clientAuthentifie(IDENT_SIMPLE, MDP_SIMPLE)

  const { data: avant } = await clientAdminAuth
    .from('compteurs_ael')
    .select('total')
    .eq('membre_id', idMembreArchivage)
    .single()
  expect(avant?.total).toBe(1)

  await admin.from('membres').update({ etat: 'archive' }).eq('id', idMembreArchivage)

  try {
    // Un VRAI compte administrateur, authentifié par mot de passe, lit le MÊME total.
    const { data: apresAdmin, error: erreurApresAdmin } = await clientAdminAuth
      .from('compteurs_ael')
      .select('total')
      .eq('membre_id', idMembreArchivage)
      .single()
    expect(erreurApresAdmin).toBeNull()
    expect(apresAdmin?.total).toBe(1)

    // Un compte ordinaire ne voit plus de LIGNE, jamais un chiffre faux.
    const { data: apresSimple } = await clientSimpleAuth
      .from('compteurs_ael')
      .select('total')
      .eq('membre_id', idMembreArchivage)
      .maybeSingle()
    expect(apresSimple).toBeNull()
  } finally {
    await admin.from('membres').update({ etat: 'actif' }).eq('id', idMembreArchivage)
    await admin.from('presences_ael').delete().eq('seance_id', seance!.id)
    await admin.from('seances_ael').delete().eq('id', seance!.id)
    await admin.from('membres').delete().eq('id', enseignant!.id)
  }
})

// ---------------------------------------------------------------------------
// Preuve n°12 — le détachement n'affecte ni une présence ni un compteur ; effet
// strictement prospectif sur la liste de pointage pré-remplie (D48, D52).
//
// Assertions finales ADAPTÉES par rapport au brief d'origine (écart signalé dans le
// rapport de tâche) : la correction I1 de la même ronde change le comportement attendu
// ici. Avant I1, une présence sur quelqu'un hors des antennes courantes (ce que
// devient le détaché, D52) disparaissait ENTIÈREMENT de l'écran — ni case, ni nom, ni
// total. Après I1, elle reste visible, dans un bloc distinct
// (« Présences hors de la liste courante », `pointage.tsx`). Le détaché n'est donc
// plus « absent » de la page : il est absent de la liste NORMALE des membres de
// l'antenne (effet prospectif, D52) mais reste visible, coché, dans le bloc hors
// liste (persistance, D48) — les deux à la fois, ce que l'ancienne assertion
// « absence totale » ne pouvait pas distinguer d'une régression.
// ---------------------------------------------------------------------------

test("détachement : n'affecte ni une présence ni un compteur, effet prospectif (D48, D52)", async ({ page }) => {
  const { data: totalAvant, error: erreurAvant } = await admin
    .from('compteurs_ael')
    .select('total')
    .eq('membre_id', idMembreDetachement)
    .single()
  expect(erreurAvant).toBeNull()
  expect(totalAvant?.total).toBe(1)

  await seConnecter(page, IDENT_MODERATEUR, MDP_MODERATEUR)
  await page.goto(`/antennes/${idAntenneDetachement}`)

  // Cette antenne compte DEUX membres (le détaché et le témoin) : il y a donc deux
  // boutons « Détacher ». On vise la ligne du membre à détacher par son nom, jamais
  // `.first()` — un tri qui changerait détacherait silencieusement le témoin, et le
  // contrôle positif de la fin du test deviendrait un faux négatif inexplicable.
  const ligneDetache = page
    .locator('li')
    .filter({ hasText: `Test ${PREFIXE}-detache` })
  await expect(ligneDetache).toHaveCount(1)
  // Task 15 (D124) : window.confirm est remplacé par le <dialog> natif de Dialogue — le
  // clic n'ouvre plus qu'un dialogue, il ne soumet plus rien tout seul.
  await ligneDetache.getByRole('button', { name: 'Détacher' }).click()
  await page.locator('dialog[open]').getByRole('button', { name: 'Confirmer' }).click()

  await expect(async () => {
    const { data } = await admin.from('membres').select('antenne_id').eq('id', idMembreDetachement).single()
    expect(data?.antenne_id).toBeNull()
  }).toPass()

  // Le témoin, lui, est TOUJOURS rattaché : le geste ci-dessus n'a touché qu'une ligne.
  const { data: temoinApres } = await admin
    .from('membres')
    .select('antenne_id')
    .eq('id', idMembreTemoinDetachement)
    .single()
  expect(temoinApres?.antenne_id).toBe(idAntenneDetachement)

  // La présence et le compteur SURVIVENT, inchangés — rien dans `presences_ael` ne
  // référence une antenne (D48, D52).
  const { data: presence } = await admin
    .from('presences_ael')
    .select('present')
    .eq('seance_id', idSeanceDetachement)
    .eq('membre_id', idMembreDetachement)
    .single()
  expect(presence?.present).toBe(true)

  const { data: totalApres } = await admin
    .from('compteurs_ael')
    .select('total')
    .eq('membre_id', idMembreDetachement)
    .single()
  expect(totalApres?.total).toBe(totalAvant?.total)

  // Effet PROSPECTIF sur la liste NORMALE (D52), persistance VISIBLE de la présence
  // (D48, correction I1) : les deux à la fois, dans la MÊME visite de la page.
  await page.goto(`/ael/seances/${idSeanceDetachement}`)
  const sectionHorsListe = page.getByRole('region', { name: 'Présences hors de la liste courante' })

  // CONTRÔLE POSITIF D'ABORD : le témoin, resté rattaché à cette antenne, EST bien
  // dans la liste NORMALE — jamais dans le bloc « hors liste ». Sans lui, tout ce qui
  // suit resterait vert si la page rendait une erreur, si `Pointage` n'était pas rendu
  // du tout, ou si le libellé accessible d'une ligne changeait.
  await expect(page.getByLabel(`Test ${PREFIXE}-temoin`, { exact: false })).toHaveCount(1)
  await expect(sectionHorsListe.getByLabel(`Test ${PREFIXE}-temoin`, { exact: false })).toHaveCount(0)

  // Le détaché N'EST PLUS DANS LA LISTE NORMALE (effet prospectif, D52) : il n'est
  // plus proposé comme un membre courant de cette antenne. Mais sa présence, réelle,
  // reste VISIBLE (correction I1) — dans le bloc « hors liste », cochée, plutôt que
  // d'avoir disparu de l'écran comme avant ce correctif. La combinaison des deux
  // assertions ci-dessous (une seule occurrence sur toute la page, ET cette occurrence
  // est DANS le bloc hors liste) exclut à la fois « toujours dans la liste normale »,
  // « dupliqué dans les deux blocs » et « disparu de l'écran ».
  await expect(page.getByLabel(`Test ${PREFIXE}-detache`, { exact: false })).toHaveCount(1)
  await expect(sectionHorsListe.getByLabel(`Test ${PREFIXE}-detache`, { exact: false })).toHaveCount(1)
  await expect(sectionHorsListe.getByLabel(`Test ${PREFIXE}-detache`, { exact: false })).toBeChecked()
})

// ---------------------------------------------------------------------------
// IMPORTANT 4, 5 et 7 de la revue de la Task 19 — LE CAS ORDINAIRE, TENU POUR ACQUIS.
//
// La correction I1 promettait : une présence pointée sur quelqu'un que la RLS masque
// reste VISIBLE, COMPTÉE et CORRIGEABLE, et l'écran dit honnêtement qu'il ne peut pas
// nommer la fiche. Cette promesse reposait entièrement sur la branche
// `trouve === undefined` de `page.tsx` et sur `membresBrefsParIds`
// (`src/lib/donnees/membres.ts:372`) — ni l'une ni l'autre n'était exercée par un seul
// test du dépôt. Le respect de la RLS y était établi PAR LECTURE (`clientServeur()`,
// aucun `clientAdmin()`), jamais par preuve, très exactement sur la moitié du cas qui
// compte le plus : l'ARCHIVAGE (D48). Le biais de la phase à l'envers — le cas exotique
// récemment compris (le détachement) éprouvé, le cas ordinaire tenu pour acquis.
//
// CE TEST NE PEUT PAS ÊTRE VERT SI L'APPEL ÉCHOUE TOTALEMENT : il exige, dans la même
// visite, un contrôle POSITIF (le témoin resté actif est nommé dans la liste normale) et
// un contrôle NÉGATIF (les archivés ne sont nommés NULLE PART sur la page), puis il
// rejoue la MÊME page depuis un ADMINISTRATEUR, à qui la RLS laisse voir les fiches
// archivées : les noms réels apparaissent alors et « Fiche non consultable » disparaît.
// C'est cette seconde moitié qui fait la preuve que le libellé du modérateur est un REFUS
// DE LA RLS et non une fonction cassée qui ne rendrait jamais rien — les deux étant, sans
// elle, rigoureusement indiscernables à l'écran.
// ---------------------------------------------------------------------------

test('une présence sur un membre ARCHIVÉ reste visible, comptée, corrigeable et discernable — masquée au modérateur, nommée à l\'administrateur (D48, I1)', async ({
  page,
  browser,
}) => {
  // Prémisse VÉRIFIÉE EN BASE : sans elle, tout ce qui suit resterait vert si l'archivage
  // du décor n'avait pas eu lieu — l'écran montrerait alors trois noms bien lisibles et
  // la branche visée ne serait jamais atteinte.
  const { data: etats, error: erreurEtats } = await admin
    .from('membres')
    .select('id, etat')
    .in('id', [idMembreArchivePointeA, idMembreArchivePointeB, idMembreTemoinArchivePointee])
  expect(erreurEtats).toBeNull()
  const parId = new Map((etats ?? []).map((m) => [m.id as string, m.etat as string]))
  expect(parId.get(idMembreArchivePointeA)).toBe('archive')
  expect(parId.get(idMembreArchivePointeB)).toBe('archive')
  expect(parId.get(idMembreTemoinArchivePointee)).toBe('actif')

  const refA = idMembreArchivePointeA.slice(0, 8)
  const refB = idMembreArchivePointeB.slice(0, 8)
  expect(refA).not.toBe(refB)

  // ---- MODÉRATEUR : la RLS masque les fiches archivées ----
  await seConnecter(page, IDENT_MODERATEUR, MDP_MODERATEUR)
  await page.goto(`/ael/seances/${idSeanceArchivePointee}`)

  const sectionHorsListe = page.getByRole('region', { name: 'Présences hors de la liste courante' })

  // CONTRÔLE POSITIF : le témoin, resté ACTIF et rattaché, est nommé dans la liste
  // NORMALE et coché. Si la page était cassée, si `Pointage` n'était pas rendu, ou si le
  // libellé accessible d'une ligne changeait, cette assertion tomberait la première.
  await expect(page.getByLabel(`Test ${PREFIXE}-temoin-archive`, { exact: false })).toHaveCount(1)
  await expect(page.getByLabel(`Test ${PREFIXE}-temoin-archive`, { exact: false })).toBeChecked()
  await expect(sectionHorsListe.getByLabel(`Test ${PREFIXE}-temoin-archive`, { exact: false })).toHaveCount(0)

  // Les archivés ne sont nommés NULLE PART : la RLS reste seule juge, et l'écran ne
  // contourne rien pour un confort d'affichage.
  await expect(page.getByText(`${PREFIXE}-archive-pointe-a`, { exact: false })).toHaveCount(0)
  await expect(page.getByText(`${PREFIXE}-archive-pointe-b`, { exact: false })).toHaveCount(0)

  // …mais leurs présences RESTENT VISIBLES ET COCHÉES (D48), dans le bloc distinct.
  await expect(sectionHorsListe.getByRole('checkbox')).toHaveCount(2)

  // IMPORTANT 7 : les deux lignes masquées sont DISCERNABLES. Avant ce correctif elles
  // portaient le même texte et le même nom accessible, alors que chacune commande une
  // écriture réelle en base : le gestionnaire ne pouvait pas savoir laquelle il
  // manipulait. Chaque référence ne désigne QU'UNE ligne, et les deux diffèrent.
  await expect(sectionHorsListe.getByLabel(`Fiche non consultable (réf. ${refA})`)).toHaveCount(1)
  await expect(sectionHorsListe.getByLabel(`Fiche non consultable (réf. ${refA})`)).toBeChecked()
  await expect(sectionHorsListe.getByLabel(`Fiche non consultable (réf. ${refB})`)).toHaveCount(1)
  await expect(sectionHorsListe.getByLabel(`Fiche non consultable (réf. ${refB})`)).toBeChecked()

  // IMPORTANT 5 : LE TOTAL, rendu AUX GESTIONNAIRES (arbitrage d'I1 : ce sont eux qui
  // pointent), n'avait aucune assertion nulle part — un total figé à zéro, ou calculé sur
  // la seule liste courante, passait toutes les portes. Ici il vaut 3 alors que la liste
  // NORMALE ne montre qu'UNE case cochée : cette assertion échouerait aussi bien sur un
  // compteur mort (0) que sur un compteur qui ignorerait les présences hors liste (1).
  await expect(page.getByText(/^\d+ présents?\.$/)).toHaveText('3 présents.')

  // ---- ADMINISTRATEUR : même page, même données, RLS plus large ----
  // Contexte NEUF plutôt qu'une seconde connexion sur la même page : le middleware
  // redirige une visite DÉJÀ authentifiée de /connexion vers /tableau-de-bord
  // (src/middleware.ts, bogue déjà rencontré à la Task 5).
  const contexteAdmin = await browser.newContext()
  const pageAdmin = await contexteAdmin.newPage()
  try {
    await seConnecter(pageAdmin, IDENT_ADMIN, MDP_ADMIN)
    await pageAdmin.goto(`/ael/seances/${idSeanceArchivePointee}`)

    const sectionAdmin = pageAdmin.getByRole('region', { name: 'Présences hors de la liste courante' })
    // Les deux archivés restent HORS LISTE même pour l'administrateur — la liste normale
    // ne rend que les membres ACTIFS de l'antenne, quel que soit le rôle — mais leurs
    // NOMS sont désormais résolus : `membresBrefsParIds` fonctionne, et ce que le
    // modérateur voyait était bien un refus de la RLS, pas une fonction muette.
    await expect(sectionAdmin.getByLabel(`Test ${PREFIXE}-archive-pointe-a`, { exact: false })).toHaveCount(1)
    await expect(sectionAdmin.getByLabel(`Test ${PREFIXE}-archive-pointe-a`, { exact: false })).toBeChecked()
    await expect(sectionAdmin.getByLabel(`Test ${PREFIXE}-archive-pointe-b`, { exact: false })).toHaveCount(1)
    await expect(pageAdmin.getByText('Fiche non consultable', { exact: false })).toHaveCount(0)
    await expect(pageAdmin.getByText(/^\d+ présents?\.$/)).toHaveText('3 présents.')
  } finally {
    await contexteAdmin.close()
  }
})

// ---------------------------------------------------------------------------
// Le chemin de navigation vers /antennes/[id] existe RÉELLEMENT pour un modérateur.
// ---------------------------------------------------------------------------

test("un modérateur atteint /antennes/[id] par un lien, depuis /ael/seances", async ({ page }) => {
  await seConnecter(page, IDENT_MODERATEUR, MDP_MODERATEUR)

  // `/antennes` commence par `exigerAdministrateur()` : un modérateur y est redirigé.
  // C'est voulu — la création et la désactivation des antennes restent réservées à
  // l'administrateur (spec §5.2) — et c'est précisément pourquoi le point d'entrée vers
  // la gestion des membres d'une antenne vit sur `/ael/seances` (Task 14, étape 5).
  await page.goto('/antennes')
  await expect(page).toHaveURL(/\/tableau-de-bord/)

  // Sans ce test, l'écran de la Task 4 pourrait redevenir injoignable pour les deux
  // tiers de son public sans qu'aucune preuve ne le signale : tous les autres tests
  // l'atteignent par `page.goto`, jamais par un lien.
  //
  // `exact: true` — BOGUE TROUVÉ dans le code du brief (signalé dans le rapport de
  // tâche, corrigé ici) : `idSeanceDetachement` (créée au `beforeAll`) cible la MÊME
  // antenne et apparaît donc dans la liste de `/ael/seances`, sous un lien dont le nom
  // accessible est « {date} · {thème} {PREFIXE}-AntenneDetachement » — CE nom accessible
  // CONTIENT le nom de l'antenne comme sous-chaîne. `getByRole('link', { name })` fait
  // une correspondance par SOUS-CHAÎNE par défaut : sans `exact: true`, ce localisateur
  // résout vers DEUX éléments (violation du mode strict de Playwright), le lien
  // d'antenne ET la ligne de séance.
  await page.goto('/ael/seances')
  await page.getByRole('link', { name: `${PREFIXE}-AntenneDetachement`, exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/antennes/${idAntenneDetachement}$`))
  await expect(page.getByRole('heading', { name: /Membres rattachés/ })).toBeVisible()
  // La page atteinte est bien celle de GESTION pour ce rôle (D50), pas une variante en
  // lecture seule.
  await expect(page.getByLabel('Membre à rattacher')).toBeVisible()
})

// ---------------------------------------------------------------------------
// Un enseignant que la RLS cache à l'appelant survit à l'enregistrement de la séance.
// ---------------------------------------------------------------------------

test("un enseignant archivé, invisible au modérateur, n'est pas effacé par un enregistrement", async ({
  page,
}) => {
  // Prémisse VÉRIFIÉE, pas supposée : un archivage manqué au `beforeAll` rendrait la
  // suite de ce test verte pour une raison étrangère à ce qu'il prétend prouver.
  const { data: avant, error: erreurAvant } = await admin
    .from('seances_ael')
    .select('enseignant_membre_id, etat')
    .eq('id', idSeanceEnseignantMasque)
    .single()
  expect(erreurAvant).toBeNull()
  expect(avant?.enseignant_membre_id).toBe(idMembreEnseignantMasque)
  expect(avant?.etat).toBe('tenue')

  const { data: membreArchive } = await admin
    .from('membres')
    .select('etat')
    .eq('id', idMembreEnseignantMasque)
    .single()
  expect(membreArchive?.etat).toBe('archive')

  await seConnecter(page, IDENT_MODERATEUR, MDP_MODERATEUR)
  await page.goto(`/ael/seances/${idSeanceEnseignantMasque}`)

  // L'écran DIT que la fiche n'est pas consultable, au lieu d'afficher un sélecteur vide
  // qui laisserait croire qu'aucun enseignant n'est désigné.
  //
  // Mineur 7 de la revue : le `.first()` d'origine masquait un SECOND champ masqué
  // inattendu. Assertion CROISÉE, harmonisée avec le test « modérateur masqué » : ce
  // champ-ci et lui seul est masqué (son sélecteur normal a disparu), tandis que le champ
  // modérateur, qui n'a aucun intervenant archivé, garde son sélecteur — le masquage d'un
  // champ ne doit pas déborder sur l'autre.
  await expect(page.getByText('Fiche non consultable', { exact: false })).toHaveCount(1)
  await expect(page.getByLabel("Enseignant (membre de l'équipe)")).toHaveCount(0)
  await expect(page.getByLabel("Modérateur (membre de l'équipe)")).toBeVisible()

  const nouveauTheme = `Thème modifié ${PREFIXE}`
  await page.getByLabel('Thème').fill(nouveauTheme)
  await page.getByRole('button', { name: 'Enregistrer' }).click()

  // CONTRÔLE POSITIF : le thème DOIT avoir changé en base. Sans cette attente, un
  // enregistrement qui n'aurait jamais abouti laisserait `enseignant_membre_id`
  // inchangé, et le test conclurait « rien n'a été effacé » en n'ayant rien écrit.
  await expect(async () => {
    const { data: themeApres } = await admin
      .from('seances_ael')
      .select('theme')
      .eq('id', idSeanceEnseignantMasque)
      .single()
    expect(themeApres?.theme).toBe(nouveauTheme)
  }).toPass()

  const { data: apres } = await admin
    .from('seances_ael')
    .select('enseignant_membre_id, etat')
    .eq('id', idSeanceEnseignantMasque)
    .single()
  // L'enseignant est INCHANGÉ et la séance est restée tenue. Si le formulaire renvoyait
  // un champ caché vide (le comportement par défaut de `SelecteurMembre` quand sa valeur
  // est nulle), cette colonne serait passée à null : sur une séance `tenue`, le
  // déclencheur de complétude aurait alors refusé l'écriture et l'écran aurait affiché
  // « l'enseignant est manquant » — un message faux, sur un enseignant présent et
  // seulement invisible à ce compte.
  expect(apres?.enseignant_membre_id).toBe(idMembreEnseignantMasque)
  expect(apres?.etat).toBe('tenue')

  // Aucun message d'erreur n'est resté à l'écran après l'enregistrement — EN
  // PARTICULIER pas le message faux nommé par le commentaire ci-dessus : l'exercer
  // par son TEXTE, pas seulement par « aucune alerte », referme le trou n°3 de la
  // revue de la Task 19 (« le message faux … n'est pas exercé »).
  //
  // `page.locator('p[role="alert"]')`, PAS `page.getByRole('alert')` — SECOND BOGUE
  // TROUVÉ dans le code du brief (signalé dans le rapport de tâche, corrigé ici) : le
  // route announcer de Next porte lui aussi `role="alert"`, toujours présent et
  // invisible (même motif que `tests/e2e/arbre.spec.ts`/`archivage-compte.spec.ts`,
  // constante `ALERTE`) — `getByRole('alert')` le compte, et l'assertion « 0 alerte »
  // du brief échouait donc TOUJOURS, y compris sur un enregistrement réussi sans
  // aucun message applicatif. `p[role="alert"]` cible le seul élément que
  // `FormulaireSeance` rend réellement pour un refus (`formulaire-seance.tsx`).
  await expect(page.locator('p[role="alert"]')).toHaveCount(0)
  await expect(page.getByText(MESSAGE_SEANCE_SANS_ENSEIGNANT)).toHaveCount(0)
})

// ---------------------------------------------------------------------------
// Trou n°2 de la revue de la Task 19 — cas NOMINAL de l'enseignant (fiche VISIBLE,
// jamais archivée) : aucune assertion de non-effacement n'existait pour le chemin le
// plus fréquenté, seul le cas masqué (plus rare) en avait une excellente.
// ---------------------------------------------------------------------------

test("un enseignant VISIBLE (cas nominal, fiche non masquée) n'est pas effacé par un enregistrement ordinaire", async ({
  page,
}) => {
  const { data: avant, error: erreurAvant } = await admin
    .from('seances_ael')
    .select('enseignant_membre_id, etat')
    .eq('id', idSeanceEnseignantVisible)
    .single()
  expect(erreurAvant).toBeNull()
  expect(avant?.enseignant_membre_id).toBe(idMembreEnseignantVisible)
  expect(avant?.etat).toBe('tenue')

  await seConnecter(page, IDENT_MODERATEUR, MDP_MODERATEUR)
  await page.goto(`/ael/seances/${idSeanceEnseignantVisible}`)

  // La fiche est VISIBLE : le sélecteur normal est rendu, pas le message masqué — sans
  // ce contrôle, ce test dériverait silencieusement vers le même cas que l'enseignant
  // archivé ci-dessus, et ne prouverait plus le cas NOMINAL qu'il vise.
  await expect(page.getByLabel("Enseignant (membre de l'équipe)")).toBeVisible()
  await expect(page.getByText('Fiche non consultable', { exact: false })).toHaveCount(0)

  const nouveauTheme = `Thème nominal modifié ${PREFIXE}`
  await page.getByLabel('Thème').fill(nouveauTheme)
  await page.getByRole('button', { name: 'Enregistrer' }).click()

  await expect(async () => {
    const { data: themeApres } = await admin
      .from('seances_ael')
      .select('theme')
      .eq('id', idSeanceEnseignantVisible)
      .single()
    expect(themeApres?.theme).toBe(nouveauTheme)
  }).toPass()

  // L'ASSERTION QUI MANQUAIT (trou n°2) : l'enseignant VISIBLE, désigné par le
  // sélecteur normal et reconduit tel quel par le formulaire, n'est pas effacé par un
  // enregistrement ordinaire — le chemin le plus fréquenté de cet écran.
  const { data: apres } = await admin
    .from('seances_ael')
    .select('enseignant_membre_id, etat')
    .eq('id', idSeanceEnseignantVisible)
    .single()
  expect(apres?.enseignant_membre_id).toBe(idMembreEnseignantVisible)
  expect(apres?.etat).toBe('tenue')
  await expect(page.locator('p[role="alert"]')).toHaveCount(0)
})

// ---------------------------------------------------------------------------
// Trou n°3 de la revue de la Task 19 — le champ MODÉRATEUR masqué n'était jamais
// éprouvé (seul l'enseignant l'était), et le message faux du déclencheur de
// complétude n'était jamais exercé sur un chemin où il NE DOIT PAS apparaître.
// ---------------------------------------------------------------------------

test("le champ modérateur, masqué par archivage, n'est pas effacé — et le message faux sur l'enseignant n'apparaît pas sur ce chemin qui ne le concerne pas", async ({
  page,
}) => {
  const { data: avant, error: erreurAvant } = await admin
    .from('seances_ael')
    .select('moderateur_membre_id, enseignant_membre_id, etat')
    .eq('id', idSeanceModerateurMasque)
    .single()
  expect(erreurAvant).toBeNull()
  expect(avant?.moderateur_membre_id).toBe(idMembreModerateurMasque)
  expect(avant?.enseignant_membre_id).toBe(idMembreEnseignantVisible)
  expect(avant?.etat).toBe('tenue')

  const { data: membreArchive } = await admin
    .from('membres')
    .select('etat')
    .eq('id', idMembreModerateurMasque)
    .single()
  expect(membreArchive?.etat).toBe('archive')

  await seConnecter(page, IDENT_MODERATEUR, MDP_MODERATEUR)
  await page.goto(`/ael/seances/${idSeanceModerateurMasque}`)

  // Le champ MODÉRATEUR, et lui seul, est masqué : l'enseignant (visible, distinct)
  // garde son sélecteur normal — la fiche non consultable d'un champ ne doit pas
  // déborder sur l'autre.
  await expect(page.getByText('Fiche non consultable', { exact: false })).toBeVisible()
  await expect(page.getByLabel("Modérateur (membre de l'équipe)")).toHaveCount(0)
  await expect(page.getByLabel("Enseignant (membre de l'équipe)")).toBeVisible()

  const nouveauTheme = `Thème modérateur masqué modifié ${PREFIXE}`
  await page.getByLabel('Thème').fill(nouveauTheme)
  await page.getByRole('button', { name: 'Enregistrer' }).click()

  await expect(async () => {
    const { data: themeApres } = await admin
      .from('seances_ael')
      .select('theme')
      .eq('id', idSeanceModerateurMasque)
      .single()
    expect(themeApres?.theme).toBe(nouveauTheme)
  }).toPass()

  const { data: apres } = await admin
    .from('seances_ael')
    .select('moderateur_membre_id, enseignant_membre_id, etat')
    .eq('id', idSeanceModerateurMasque)
    .single()
  // Le modérateur masqué N'EST PAS EFFACÉ (trou n°3, premier volet).
  expect(apres?.moderateur_membre_id).toBe(idMembreModerateurMasque)
  // L'enseignant, non masqué ici, n'a pas bougé non plus — contrôle croisé.
  expect(apres?.enseignant_membre_id).toBe(idMembreEnseignantVisible)
  expect(apres?.etat).toBe('tenue')

  // Trou n°3, second volet : le message faux « l'enseignant est manquant » n'est
  // jamais apparu — attendu, puisque le déclencheur de complétude (migration
  // 20260817150000) ne surveille QUE le thème et l'enseignant, jamais le modérateur.
  // Sans cette assertion précise, rien dans la suite n'exerçait ce chemin : masquer
  // le modérateur aurait pu, par un bug futur du même genre que C2, laisser le champ
  // enseignant intact tout en affichant à tort ce message sur un simple changement de
  // thème.
  await expect(page.locator('p[role="alert"]')).toHaveCount(0)
  await expect(page.getByText(MESSAGE_SEANCE_SANS_ENSEIGNANT)).toHaveCount(0)
})

// ---------------------------------------------------------------------------
// Preuve n°5 (partie 2/2), preuve n°11 (rappel sur pointerPresence, structure
// distincte de definirAntenneMembre déjà couvert à la Task 5) — capture-et-rejeu
// réseau, garde forgé.
// ---------------------------------------------------------------------------

test('pointerPresence : un compte simple ne peut pas pointer, avec canari modérateur', async ({
  page,
  browser,
  baseURL,
}) => {
  const { data: avant } = await admin
    .from('presences_ael')
    .select('membre_id')
    .eq('seance_id', idSeancePointageForge)
    .eq('membre_id', idMembreCiblePointageForge)
  expect(avant).toEqual([])

  await seConnecter(page, IDENT_MODERATEUR, MDP_MODERATEUR)
  await page.goto(`/ael/seances/${idSeancePointageForge}`)

  const requetePromise = page.waitForRequest(
    (requete) => requete.method() === 'POST' && requete.url().includes(`/ael/seances/${idSeancePointageForge}`),
  )
  await page.getByLabel(`Test ${PREFIXE}-cible`, { exact: false }).check()
  const requeteCapturee = await requetePromise

  const url = requeteCapturee.url()
  const postData = requeteCapturee.postData()
  if (postData === null) {
    throw new Error(
      'Capture invalide : la requête de pointage ne porte aucun corps — le mécanisme a peut-être changé.',
    )
  }
  const enTetesCaptures = requeteCapturee.headers()
  const enTetesRejoues: Record<string, string> = { ...enTetesCaptures }
  delete enTetesRejoues['cookie']
  delete enTetesRejoues['content-length']

  // TROISIÈME BOGUE TROUVÉ dans le code du brief (signalé dans le rapport de tâche,
  // corrigé ici) : une CONDITION DE COURSE. `page.waitForRequest` résout dès que le
  // NAVIGATEUR a ENVOYÉ la requête — rien ne garantit que le SERVEUR a fini de
  // l'écrire en base au même instant. Sans cette attente, le rétablissement
  // ci-dessous pouvait s'exécuter AVANT que l'écriture légitime du modérateur
  // n'atterrisse, la manquer (delete sur une ligne pas encore là), puis la voir
  // apparaître APRÈS coup — et la suite du test aurait alors trouvé une présence
  // écrite par le MODÉRATEUR, pas par le compte simple, tout en l'attribuant à tort
  // à une forge réussie. Constaté en pratique : ce test échouait de façon
  // intermittente sur `expect(apres).toEqual([])`, avec une ligne bien réelle en
  // base — exactement la panne d'un test « plus faible que son nom » que ce fichier
  // vise à exclure pour `pointerPresence`.
  await expect(async () => {
    const { data } = await admin
      .from('presences_ael')
      .select('present')
      .eq('seance_id', idSeancePointageForge)
      .eq('membre_id', idMembreCiblePointageForge)
      .single()
    expect(data?.present).toBe(true)
  }).toPass()

  // Revenir à l'état non pointé : le clic ci-dessus, effectué par un compte AUTORISÉ,
  // a réellement écrit — confirmé ci-dessus. L'erreur est vérifiée : un rétablissement
  // manqué ferait échouer l'assertion de refus qui suit sans que rien n'en désigne la
  // cause.
  const { error: erreurRetablissement } = await admin
    .from('presences_ael')
    .delete()
    .eq('seance_id', idSeancePointageForge)
    .eq('membre_id', idMembreCiblePointageForge)
  if (erreurRetablissement) {
    throw new Error(`rétablissement de l'état non pointé impossible : ${erreurRetablissement.message}`)
  }

  const contexteSimple = await browser.newContext({ baseURL })
  try {
    const pageSimple = await contexteSimple.newPage()
    await seConnecter(pageSimple, IDENT_SIMPLE, MDP_SIMPLE)
    await pageSimple.request.post(url, { headers: enTetesRejoues, data: postData })

    const { data: apres } = await admin
      .from('presences_ael')
      .select('membre_id')
      .eq('seance_id', idSeancePointageForge)
      .eq('membre_id', idMembreCiblePointageForge)
    expect(apres).toEqual([])
  } finally {
    await contexteSimple.close()
  }

  const contexteModerateur = await browser.newContext({ baseURL })
  try {
    const pageModerateur = await contexteModerateur.newPage()
    await seConnecter(pageModerateur, IDENT_MODERATEUR, MDP_MODERATEUR)
    await pageModerateur.request.post(url, { headers: enTetesRejoues, data: postData })

    await expect(async () => {
      const { data: apresCanari } = await admin
        .from('presences_ael')
        .select('present')
        .eq('seance_id', idSeancePointageForge)
        .eq('membre_id', idMembreCiblePointageForge)
        .single()
      expect(apresCanari?.present).toBe(true)
    }).toPass()
  } finally {
    await contexteModerateur.close()
  }
})
