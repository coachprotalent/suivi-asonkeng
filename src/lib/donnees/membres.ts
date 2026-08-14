import 'server-only'
import type { EtatMembre, SituationMembre } from '@/lib/domaine/membre'
import { clientServeur } from '@/lib/supabase/serveur'
import { membresDesAntennesParLots } from './membres-lots'

export type MembreListe = {
  id: string
  nom: string
  prenom: string
  ville: string | null
  antenneNom: string | null
  situation: SituationMembre | null
}

export type MembreDetail = MembreListe & {
  telephone: string | null
  emailContact: string | null
  pays: string | null
  antenneId: string | null
  domaineEtude: string | null
  reportInitialAel: number
  etat: EtatMembre
  dirigeantId: string | null
  dirigeantForce: boolean
  faiseurDeDiscipleId: string | null
}

const COLONNES_LISTE = 'id, nom, prenom, ville, situation, antennes(nom)'
const COLONNES_DETAIL =
  'id, nom, prenom, ville, situation, telephone, email_contact, pays, antenne_id, domaine_etude, report_initial_ael, etat, dirigeant_id, dirigeant_force, faiseur_de_disciple_id, antennes(nom)'

type LigneAntenne = { nom: string } | { nom: string }[] | null

function nomAntenne(valeur: LigneAntenne): string | null {
  if (!valeur) return null
  return Array.isArray(valeur) ? (valeur[0]?.nom ?? null) : valeur.nom
}

/**
 * Traduit un terme saisi en motif `ilike` accepté par PostgREST, ou `null` si le terme
 * ne contient rien d'exploitable.
 *
 * PostgREST réserve `, . : * ( )` dans la valeur d'un filtre. Plutôt que de retenir une
 * liste de caractères à retirer — qui sera incomplète le jour où elle changera — on
 * entoure la valeur de guillemets, forme dans laquelle PostgREST accepte tout, en
 * n'échappant que ce que les guillemets exigent. Sans cela, chercher « St. Etienne »
 * casse la requête, et comme l'erreur était alors ignorée, l'écran annonçait « aucun
 * membre » pour une recherche valide (défaut réel de la phase 1a).
 *
 * Exportée parce que le sélecteur de membre de la phase 1c s'en sert aussi : deux copies
 * de cet échappement, ce serait deux occasions de refaire le même défaut.
 */
export function motifRecherche(recherche: string | undefined): string | null {
  const terme = recherche
    ?.trim()
    .replace(/[\\"]/g, '\\$&') // échapper l'antislash et le guillemet
    .replace(/[%_]/g, '') // neutraliser les jokers de `ilike`
  if (!terme || terme.length === 0) {
    return null
  }
  return `"%${terme}%"`
}

/** Nombre de fiches rendues par page de l'annuaire. Voir D21 et §6.2 du design de la
 *  phase 1c : on pagine plutôt que d'indexer, le poids de la page étant le vrai coût
 *  à cette échelle, pas la requête. */
export const TAILLE_PAGE_ANNUAIRE = 50

export type PageMembres = { membres: MembreListe[]; total: number }

/**
 * Applique à `requete` les filtres communs à `listerMembres` et à son repli
 * `compterMembresActifs` : l'état actif, la recherche textuelle et l'antenne.
 *
 * Centralisée à dessein, pas par style : si un futur filtre s'ajoutait à l'une
 * des deux requêtes sans être répercuté dans l'autre, le total du repli
 * `PGRST103` (plus bas) gonflerait, le nombre de pages calculé par l'appelant
 * gonflerait avec lui, `page > pages` deviendrait faux, et la redirection de
 * page hors bornes cesserait d'agir — rouvrant, par une simple divergence entre
 * deux copies, le défaut que cette tâche vient de fermer. Même raisonnement que
 * pour `motifRecherche`, déjà extrait plus haut pour la même raison au bénéfice
 * du sélecteur de membre.
 *
 * `etat = 'actif'` explicitement, et pas seulement via la RLS : la politique
 * laisse un administrateur voir aussi les fiches archivées, or l'annuaire est
 * la liste des membres en cours de suivi. Sans ce filtre, archiver une fiche
 * ne la ferait pas disparaître pour un administrateur — l'inverse de ce qu'il
 * attend.
 */
// Paramètre et retour délibérément larges : les deux appelants passent un
// constructeur de requête PostgREST à un stade différent de sa chaîne générique
// (avec ou sans `head`, avec ou sans `range`), et le préserver précisément fait
// exploser l'inférence de TypeScript (« Type instantiation is excessively deep »,
// constaté à l'essai — limite connue de la composition de types génériques de
// supabase-js). Sans conséquence sur la sûreté réelle : chaque appelant retype
// `data` champ par champ après l'attente (`as string`, etc.), comme le reste de
// ce fichier le fait déjà pour toutes les requêtes Supabase.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function filtrerMembresActifs(requete: any, filtres?: { recherche?: string; antenneId?: string }) {
  let resultat = requete.eq('etat', 'actif')

  const motif = motifRecherche(filtres?.recherche)
  if (motif) {
    resultat = resultat.or(`nom.ilike.${motif},prenom.ilike.${motif},ville.ilike.${motif}`)
  }
  if (filtres?.antenneId) {
    resultat = resultat.eq('antenne_id', filtres.antenneId)
  }
  return resultat
}

/**
 * Compte les membres actifs visibles par l'appelant, filtres identiques à
 * `listerMembres` mais sans `range` : sert de filet quand PostgREST refuse la
 * requête paginée elle-même (voir `PGRST103` plus bas), cas où son `count` normal
 * n'arrive jamais.
 */
async function compterMembresActifs(
  supabase: Awaited<ReturnType<typeof clientServeur>>,
  filtres?: { recherche?: string; antenneId?: string },
): Promise<number> {
  const requete = filtrerMembresActifs(
    supabase.from('membres').select('id', { count: 'exact', head: true }),
    filtres,
  )

  const { count, error } = await requete
  if (error) {
    throw new Error(`Comptage des membres impossible : ${error.message}`)
  }
  if (count === null) {
    throw new Error('Comptage des membres absent de la réponse PostgREST.')
  }
  return count
}

/**
 * Membres visibles par le compte appelant, triés par nom puis prénom, une page à la
 * fois. La RLS décide de ce qui est visible ; ce module ne refait pas ce filtrage.
 */
export async function listerMembres(filtres?: {
  recherche?: string
  antenneId?: string
  page?: number
}): Promise<PageMembres> {
  const supabase = await clientServeur()
  const page = Math.max(1, filtres?.page ?? 1)
  const debut = (page - 1) * TAILLE_PAGE_ANNUAIRE

  const requete = filtrerMembresActifs(
    supabase
      .from('membres')
      // `count: 'exact'` : le nombre total doit rester juste, sinon la pagination annonce
      // des pages qui n'existent pas. C'est un COUNT complet à chaque requête, assumé —
      // il porte sur une table indexée par `etat` et reste très bon marché à cette échelle.
      .select(COLONNES_LISTE, { count: 'exact' })
      .order('nom')
      .order('prenom')
      // I4 de la revue finale de branche — TRI TOTAL, troisième critère obligatoire.
      // `(nom, prenom)` n'est pas unique : deux HOMONYMES EXACTS à cheval sur une
      // frontière de page peuvent, sous une pagination par décalage, être rendus DEUX
      // FOIS ou JAMAIS — « jamais » étant la disparition silencieuse d'un membre de
      // l'annuaire, l'écran le plus fréquenté de l'application. Sur une liste de membres
      // d'église, les homonymes ne sont pas une hypothèse d'école. C'est mot pour mot le
      // défaut corrigé sur `membresDesAntennesParLots` (`membres-lots.ts:146`), qui
      // survivait ici, dans le fichier qui IMPORTE le module corrigé.
      // Doctrine du registre (ronde Q1-Q7, Q4) : `.order('id')` est correct EN TOUTE
      // GÉNÉRALITÉ — aucune spécification SQL ne garantit l'ordre des ex æquo sans tri
      // total —, même quand une mutation sur deux lignes ne parvient pas à mettre le
      // défaut en évidence sur un plan Postgres donné.
      .order('id')
      .range(debut, debut + TAILLE_PAGE_ANNUAIRE - 1),
    filtres,
  )

  const { data, error, count } = await requete
  if (error) {
    // `PGRST103` : le `range` demandé dépasse le nombre réel de lignes (page hors
    // bornes — signet périmé, ou résultat qui a rétréci depuis). PostgREST refuse
    // alors la requête entière, y compris son `count`, avec une erreur 416 : on ne
    // peut pas distinguer « page hors bornes » d'une vraie panne sans un second
    // appel. On récupère donc le total réel par un comptage sans `range`, pour que
    // l'appelant (`src/app/membres/page.tsx`) puisse rediriger vers la dernière
    // page réelle au lieu de faire tomber l'écran sur une erreur générique.
    if (error.code === 'PGRST103') {
      const total = await compterMembresActifs(supabase, filtres)
      return { membres: [], total }
    }
    // Un échec ne doit pas être indistinguable d'un résultat vide : annoncer
    // « aucun membre » alors que la requête a échoué est un mensonge silencieux.
    throw new Error(`Lecture des membres impossible : ${error.message}`)
  }
  // `count` peut être `null` si PostgREST ne l'a pas renvoyé. Retomber sur la longueur
  // de la page serait un mensonge : l'écran annoncerait « 50 membres » pour une base
  // qui en compte mille, et la pagination s'arrêterait à la première page.
  if (count === null) {
    throw new Error('Comptage des membres absent de la réponse PostgREST.')
  }
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    membres: (data ?? []).map((l: any) => ({
      id: l.id as string,
      nom: l.nom as string,
      prenom: l.prenom as string,
      ville: l.ville as string | null,
      situation: l.situation as SituationMembre | null,
      antenneNom: nomAntenne(l.antennes as LigneAntenne),
    })),
    total: count,
  }
}

/**
 * Fiche complète, ou `null` si elle n'existe pas ou n'est pas visible par l'appelant.
 *
 * Contrairement à `listerMembres`, cette fonction ne filtre **pas** sur l'état : un
 * administrateur doit pouvoir ouvrir une fiche archivée depuis un lien direct. Ce
 * n'est pas un oubli, et la sécurité au niveau des lignes reste seule juge de ce qui
 * est visible.
 */
export async function membreParId(id: string): Promise<MembreDetail | null> {
  const supabase = await clientServeur()
  const { data, error } = await supabase
    .from('membres')
    .select(COLONNES_DETAIL)
    .eq('id', id)
    .maybeSingle()
  // Une erreur de lecture ne doit pas devenir « cette fiche n'existe pas » : les
  // appelants font `notFound()` sur `null`, et une panne passagère ferait dire à
  // l'application qu'une personne réelle n'est pas au registre.
  if (error) {
    throw new Error(`Lecture de la fiche impossible : ${error.message}`)
  }
  if (!data) return null

  return {
    id: data.id as string,
    nom: data.nom as string,
    prenom: data.prenom as string,
    ville: data.ville as string | null,
    situation: data.situation as SituationMembre | null,
    antenneNom: nomAntenne(data.antennes as LigneAntenne),
    telephone: data.telephone as string | null,
    emailContact: data.email_contact as string | null,
    pays: data.pays as string | null,
    antenneId: data.antenne_id as string | null,
    domaineEtude: data.domaine_etude as string | null,
    reportInitialAel: data.report_initial_ael as number,
    etat: data.etat as EtatMembre,
    dirigeantId: data.dirigeant_id as string | null,
    dirigeantForce: data.dirigeant_force as boolean,
    faiseurDeDiscipleId: data.faiseur_de_disciple_id as string | null,
  }
}

export type MembreBref = { id: string; nom: string; prenom: string }

/** Nombre de résultats rendus par le sélecteur. Assez pour choisir, jamais assez pour
 *  ramener un annuaire entier dans une page — la contrainte qui a motivé D18. */
export const LIMITE_SELECTEUR = 20

/**
 * Recherche destinée au sélecteur de membre. Distincte de `listerMembres` : elle ne rend
 * que le strict nécessaire à un choix, elle est bornée, et elle sait s'exclure un membre
 * — celui qu'on est en train de rattacher, qui ne peut pas être son propre faiseur de
 * disciple.
 *
 * Exclure ce seul identifiant N'EST PAS la protection contre les cycles : elle ne couvre
 * que le cycle de longueur 1. Les cycles plus longs sont refusés par le déclencheur et
 * la passerelle (migration 20260814100000). Cette exclusion sert le confort, pas la
 * sûreté, et ne doit jamais être lue comme telle.
 */
export async function rechercherMembres(
  terme: string,
  exclureId?: string,
): Promise<MembreBref[]> {
  const motif = motifRecherche(terme)
  if (!motif) {
    return []
  }

  const supabase = await clientServeur()
  let requete = supabase
    .from('membres')
    .select('id, nom, prenom')
    .eq('etat', 'actif')
    .or(`nom.ilike.${motif},prenom.ilike.${motif}`)
    .order('nom')
    .order('prenom')
    .limit(LIMITE_SELECTEUR)

  if (exclureId) {
    requete = requete.neq('id', exclureId)
  }

  const { data, error } = await requete
  if (error) {
    // Un échec ne doit pas être indistinguable d'un résultat vide : rendre une liste
    // vide ferait croire à l'utilisateur que personne ne porte ce nom.
    throw new Error(`Recherche de membres impossible : ${error.message}`)
  }
  return (data ?? []).map((l) => ({
    id: l.id as string,
    nom: l.nom as string,
    prenom: l.prenom as string,
  }))
}

/** Le strict nécessaire pour afficher un membre choisi dans un sélecteur. */
export async function membreBrefParId(id: string): Promise<MembreBref | null> {
  const supabase = await clientServeur()
  const { data, error } = await supabase
    .from('membres')
    .select('id, nom, prenom')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    throw new Error(`Lecture du membre impossible : ${error.message}`)
  }
  if (!data) {
    return null
  }
  return { id: data.id as string, nom: data.nom as string, prenom: data.prenom as string }
}

// `TAILLE_LOT_MEMBRES_ANTENNE` et `membresDesAntennesParLots` vivent dans
// `./membres-lots`, un module SANS `import 'server-only'` — voir l'encadré en tête de
// ce fichier-là pour pourquoi : c'est délibéré, pas un oubli d'import, et c'est ce qui
// permet à `tests/rls/membres.test.ts` de faire tourner ce code contre la vraie base
// sans passer par un Server Component. `membresDesAntennesParLots` n'est importée ICI
// que pour l'usage interne de `membresDesAntennes` ci-dessous : aucun appelant de ce
// fichier n'a besoin d'elle ni de la constante directement (recherche exhaustive du
// dépôt, revue task-1-4, constat M1) — `tests/rls/membres.test.ts` les importe déjà
// directement depuis `./membres-lots`. Une réexportation ici serait donc morte : retirée.

/**
 * Membres ACTIFS dont l'antenne figure dans `antenneIds`, triés par nom puis prénom,
 * SANS PAGINATION CÔTÉ APPELANT — mais parcourue par lots en interne pour rester
 * complète quel que soit l'effectif (voir `membresDesAntennesParLots` dans
 * `./membres-lots`, dont le commentaire détaille pourquoi : le plafond `max_rows` de
 * PostgREST tronque silencieusement toute lecture non paginée au-delà de 1000 lignes,
 * y compris sans `.range()` explicite).
 *
 * Deux appelants distincts, une seule fonction (D51) : l'écran de gestion d'une antenne
 * (Task 4, un seul identifiant dans le tableau) et le pointage d'une séance (Task 16,
 * plusieurs antennes ciblées par `seances_ael_antennes`). Aucune pagination visible de
 * l'appelant : D29 et D53 l'exigent toutes deux, pour deux raisons distinctes — voir le
 * design de la phase 3.
 *
 * `antenneIds` vide rend `[]` sans requête : `.in('antenne_id', [])` interrogerait la
 * base pour une réponse déjà connue.
 */
export async function membresDesAntennes(antenneIds: string[]): Promise<MembreBref[]> {
  if (antenneIds.length === 0) {
    return []
  }
  const supabase = await clientServeur()
  return membresDesAntennesParLots(supabase, antenneIds)
}

/**
 * Fiches brèves pour un ensemble d'identifiants — correction I1 de la ronde : le
 * pointage d'une séance (`/ael/seances/[id]`) croise les présences déjà enregistrées
 * (`presencesDeSeance`, qui ne filtre ni sur l'antenne ni sur l'état du membre) avec
 * `membresDesAntennes` (qui ne rend que les membres ACTIFS des antennes ciblées). Un
 * identifiant présent dans les présences mais absent de cette seconde liste — ajouté
 * hors antenne (D47), archivé depuis (D48 : sa présence RESTE), ou déplacé vers une
 * autre antenne — disparaissait donc entièrement de l'écran : ni case, ni nom, ni
 * total. Cette fonction retrouve le nom de ces identifiants « hors liste courante ».
 *
 * RLS SEULE JUGE de ce qui est retourné, jamais contournée : un identifiant archivé,
 * lu par un compte non administrateur, est simplement ABSENT du tableau rendu (même
 * discipline que `compteurAelMembre` — jamais un nom inventé). L'appelant traite cette
 * absence comme `libelleIntervenant` le fait déjà pour l'enseignant/le modérateur
 * d'une séance : « Fiche non consultable », pas un silence.
 *
 * Découpée en lots de 500 : `.in('id', lot)` avec `id` la clé primaire ne peut jamais
 * rendre plus de lignes que `lot.length`, donc AUCUN `.range()` n'est nécessaire ici
 * (contrairement à `membresDesAntennesParLots`/`presencesDeSeanceParLots`, qui filtrent
 * sur une colonne non unique) — mais un `ids` un jour plus long que `max_rows` (1000,
 * `supabase/config.toml`) resterait quand même tronqué par PostgREST sans ce
 * découpage, d'où sa présence malgré tout.
 */
export async function membresBrefsParIds(ids: string[]): Promise<MembreBref[]> {
  if (ids.length === 0) {
    return []
  }
  const supabase = await clientServeur()
  const TAILLE_LOT = 500
  const resultat: MembreBref[] = []
  for (let debut = 0; debut < ids.length; debut += TAILLE_LOT) {
    const lot = ids.slice(debut, debut + TAILLE_LOT)
    const { data, error } = await supabase.from('membres').select('id, nom, prenom').in('id', lot)
    if (error) {
      throw new Error(`Lecture des fiches brèves impossible : ${error.message}`)
    }
    resultat.push(
      ...(data ?? []).map((l) => ({
        id: l.id as string,
        nom: l.nom as string,
        prenom: l.prenom as string,
      })),
    )
  }
  return resultat
}
