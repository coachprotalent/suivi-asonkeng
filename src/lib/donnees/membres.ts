import 'server-only'
import type { EtatMembre, SituationMembre } from '@/lib/domaine/membre'
import { clientServeur } from '@/lib/supabase/serveur'

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
}

const COLONNES_LISTE = 'id, nom, prenom, ville, situation, antennes(nom)'
const COLONNES_DETAIL =
  'id, nom, prenom, ville, situation, telephone, email_contact, pays, antenne_id, domaine_etude, report_initial_ael, etat, dirigeant_id, dirigeant_force, antennes(nom)'

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

/**
 * Membres visibles par le compte appelant, triés par nom puis prénom.
 * La RLS décide de ce qui est visible ; ce module ne refait pas ce filtrage.
 */
export async function listerMembres(filtres?: {
  recherche?: string
  antenneId?: string
}): Promise<MembreListe[]> {
  const supabase = await clientServeur()
  // `etat = 'actif'` explicitement, et pas seulement via la RLS : la politique laisse
  // un administrateur voir aussi les fiches archivées, or l'annuaire est la liste des
  // membres en cours de suivi. Sans ce filtre, archiver une fiche ne la ferait pas
  // disparaître pour un administrateur — exactement l'inverse de ce qu'il attend.
  let requete = supabase
    .from('membres')
    .select(COLONNES_LISTE)
    .eq('etat', 'actif')
    .order('nom')
    .order('prenom')

  const motif = motifRecherche(filtres?.recherche)
  if (motif) {
    requete = requete.or(`nom.ilike.${motif},prenom.ilike.${motif},ville.ilike.${motif}`)
  }
  if (filtres?.antenneId) {
    requete = requete.eq('antenne_id', filtres.antenneId)
  }

  const { data, error } = await requete
  if (error) {
    // Un échec ne doit pas être indistinguable d'un résultat vide : annoncer
    // « aucun membre » alors que la requête a échoué est un mensonge silencieux.
    throw new Error(`Lecture des membres impossible : ${error.message}`)
  }
  return (data ?? []).map((l) => ({
    id: l.id as string,
    nom: l.nom as string,
    prenom: l.prenom as string,
    ville: l.ville as string | null,
    situation: l.situation as SituationMembre | null,
    antenneNom: nomAntenne(l.antennes as LigneAntenne),
  }))
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
