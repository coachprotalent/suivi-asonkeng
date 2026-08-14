import 'server-only'
import { clientServeur } from '@/lib/supabase/serveur'
import { totalObligatoire, verifierTaillePage, type PageLue } from './pagination'

export type { PageLue }

/**
 * I4 DE LA REVUE FINALE — CINQUIÈME OCCURRENCE, DANS CE PROJET, D'UN DÉFAUT DÉJÀ CORRIGÉ
 * QUATRE FOIS, ET LA PREMIÈRE OÙ LA PHASE QUI L'EXPOSE EST CELLE QUI A CORRIGÉ LES AUTRES.
 *
 * `listerDemandesEnAttente` et `mesDemandes` n'avaient NI `.range`, NI `.limit`, NI `count`.
 * PostgREST tronque EN SILENCE au-delà de `max_rows = 1000` (`supabase/config.toml:18`).
 *
 * CE QUE LA PHASE 4 A CHANGÉ, ET QUI FAIT DE CETTE DETTE UN CONSTAT : le chemin 1 de la
 * conversion INSÈRE dans `demandes_membre` (20260818220000), et le geste qui le déclenche
 * est le traitement de `/evenements/a-traiter` — la liste dont la phase dit elle-même
 * qu'elle « cumule les années » et qu'un séminaire académique y verse « plusieurs centaines
 * de personnes ». La phase avait paginé la source et laissé le déversoir non borné. Au-delà
 * de mille, ce ne serait pas une page incomplète : ce seraient des personnes converties dont
 * la demande n'apparaît JAMAIS à l'administrateur — des fiches `en_attente` que plus rien
 * n'active, la validation étant le seul geste qui les fasse passer à `actif`.
 *
 * `mesDemandes` était non bornée elle aussi, TOUS ÉTATS CONFONDUS, et l'administrateur qui
 * convertit est le `demandeur_profil_id` de CHAQUE ligne `conversion_participant` (D66) :
 * un seul compte accumule.
 *
 * FORME RETENUE : pagination visible + `count: 'exact'`, et non « échouer bruyamment ». Le
 * critère du projet est l'usage : une lecture CROISÉE avec une autre exige la pagination,
 * une lecture ISOLÉE peut lever. Ces deux listes sont AFFICHÉES et parcourues par
 * l'administrateur comme une file de travail — une troncature s'y lirait « cette demande
 * n'existe pas », pas « il manque une page ». C'est la forme des trois listes de la phase 4
 * et de `listerMembres`.
 */
export const TAILLE_PAGE_DEMANDES = 25

export type DemandeListe = {
  id: string
  // Élargi par la phase 4 (D66). SANS CET ÉLARGISSEMENT, `tsc` passerait quand même — le
  // cast `as DemandeListe['origine']` de `versDemandeListe` masque la valeur nouvelle —
  // mais toutes les comparaisons deviendraient SILENCIEUSEMENT FAUSSES : une demande de
  // conversion tomberait dans le `else` de `LigneDemandeAdmin` et s'y verrait proposer le
  // formulaire de validation d'une demande de suivi, avec un dirigeant proposé calculé
  // depuis le CONVERTISSEUR — une filiation qui n'a jamais eu lieu.
  origine: 'auto_inscription' | 'demande_suivi' | 'conversion_participant'
  demandeurProfilId: string
  demandeurNom: string
  membreId: string | null
  membreNom: string | null
  membrePrenom: string | null
  etat: 'en_attente' | 'validee' | 'rejetee' | 'annulee'
  motifRejet: string | null
  traiteParNom: string | null
  traiteLe: string | null
  creeLe: string
  demandeurMembreId: string | null
}

const COLONNES =
  'id, origine, demandeur_profil_id, membre_id, etat, motif_rejet, traite_le, cree_le, ' +
  'membres(nom, prenom), ' +
  'demandeur:profils!demandes_membre_demandeur_profil_id_fkey(nom_affichage, membre_id), ' +
  'traiteur:profils!demandes_membre_traite_par_fkey(nom_affichage)'

type LigneMembre = { nom: string; prenom: string } | { nom: string; prenom: string }[] | null
type LigneProfil =
  | { nom_affichage: string; membre_id?: string | null }
  | { nom_affichage: string; membre_id?: string | null }[]
  | null

function premier<T>(valeur: T | T[] | null): T | null {
  if (!valeur) return null
  return Array.isArray(valeur) ? (valeur[0] ?? null) : valeur
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function versDemandeListe(ligne: any): DemandeListe {
  const membre = premier(ligne.membres as LigneMembre)
  // `demandeur` ne peut PAS être absent : demandeur_profil_id est NOT NULL et la
  // clé étrangère garantit qu'un profil existe. `?? 'Compte supprimé'` est un
  // filet, pas un cas normal attendu.
  const demandeur = premier(ligne.demandeur as LigneProfil)
  const traiteur = premier(ligne.traiteur as LigneProfil)
  return {
    id: ligne.id as string,
    origine: ligne.origine as DemandeListe['origine'],
    demandeurProfilId: ligne.demandeur_profil_id as string,
    demandeurNom: demandeur?.nom_affichage ?? 'Compte supprimé',
    membreId: ligne.membre_id as string | null,
    membreNom: membre?.nom ?? null,
    membrePrenom: membre?.prenom ?? null,
    etat: ligne.etat as DemandeListe['etat'],
    motifRejet: ligne.motif_rejet as string | null,
    traiteParNom: traiteur?.nom_affichage ?? null,
    traiteLe: ligne.traite_le as string | null,
    creeLe: ligne.cree_le as string,
    demandeurMembreId: demandeur?.membre_id ?? null,
  }
}

/**
 * Demandes en_attente, les TROIS origines confondues (design 2b §4 pour
 * auto_inscription/demande_suivi, D66 de la phase 4 pour conversion_participant ajoutée
 * depuis — écran `/demandes`, I4 de la revue des Tasks 22-24 : ce commentaire disait encore
 * « les deux origines », motif du même écart qui a fait dériver le §4.4 de la spec maîtresse
 * pendant deux phases). Sous RLS : réservée à l'administrateur par la politique
 * `demandes_membre_lecture`, l'écran est de toute façon derrière `exigerAdministrateur`.
 */
export async function listerDemandesEnAttente(options?: {
  page?: number
  taillePage?: number
}): Promise<PageLue<DemandeListe>> {
  const supabase = await clientServeur()
  const taillePage = options?.taillePage ?? TAILLE_PAGE_DEMANDES
  verifierTaillePage(taillePage, 'listerDemandesEnAttente')
  const page = Math.max(1, options?.page ?? 1)
  const debut = (page - 1) * taillePage

  const { data, error, count } = await supabase
    .from('demandes_membre')
    .select(COLONNES, { count: 'exact' })
    .eq('etat', 'en_attente')
    // TRI TOTAL. `cree_le` n'est PAS unique — le chemin 1 de la conversion peut créer
    // plusieurs demandes dans la même transaction, et deux ex æquo à cheval sur une
    // frontière de page seraient rendus deux fois ou JAMAIS. `id` clôt le tri.
    .order('cree_le')
    .order('id')
    .range(debut, debut + taillePage - 1)

  if (error) {
    // PGRST103 ATTRAPÉE SUR LA LECTURE ELLE-MÊME, pas par un précalcul de borne en amont —
    // motif éprouvé de `listerMembres`, et correctif de l'I1 de la ronde du 2026-08-14 : un
    // comptage séparé AVANT la lecture ouvre une fenêtre de course qu'une écriture
    // concurrente referme en plantant l'écran. Un signet périmé (ou une liste qui a rétréci
    // parce qu'un autre administrateur vient de traiter les demandes) fait refuser la
    // requête ENTIÈRE, `count` compris : on retombe alors sur un comptage sans `range`.
    if (error.code === 'PGRST103') {
      return { lignes: [], total: await compterDemandesEnAttente(supabase) }
    }
    throw new Error(`Lecture des demandes impossible : ${error.message}`)
  }
  return {
    lignes: (data ?? []).map(versDemandeListe),
    total: totalObligatoire(count, 'listerDemandesEnAttente'),
  }
}

/** Repli de `listerDemandesEnAttente` quand PostgREST refuse sa lecture paginée. */
async function compterDemandesEnAttente(
  supabase: Awaited<ReturnType<typeof clientServeur>>,
): Promise<number> {
  const { count, error } = await supabase
    .from('demandes_membre')
    .select('id', { count: 'exact', head: true })
    .eq('etat', 'en_attente')
  if (error) {
    throw new Error(`Comptage des demandes impossible : ${error.message}`)
  }
  return totalObligatoire(count, 'compterDemandesEnAttente')
}

/**
 * Toutes les demandes d'un compte, quel que soit leur état, les plus récentes en
 * tête. `profilId` filtre EXPLICITEMENT, en plus de la RLS : la politique
 * `demandes_membre_lecture` laisserait un ADMINISTRATEUR voir toutes les demandes
 * si `profilId` référait un compte administrateur — ce filtre garantit que « mes
 * demandes » ne montre jamais que les siennes, même pour un administrateur.
 */
export async function mesDemandes(
  profilId: string,
  options?: { page?: number; taillePage?: number },
): Promise<PageLue<DemandeListe>> {
  const supabase = await clientServeur()
  const taillePage = options?.taillePage ?? TAILLE_PAGE_DEMANDES
  verifierTaillePage(taillePage, 'mesDemandes')
  const page = Math.max(1, options?.page ?? 1)
  const debut = (page - 1) * taillePage

  const { data, error, count } = await supabase
    .from('demandes_membre')
    .select(COLONNES, { count: 'exact' })
    .eq('demandeur_profil_id', profilId)
    // TRI TOTAL, même raison que ci-dessus. Le sens décroissant s'applique aux DEUX clés :
    // `.order('id')` seul, ascendant, laisserait deux ex æquo dans un ordre certes stable
    // mais opposé au reste du tri — sans conséquence sur la complétude, la clé étant unique,
    // et écrit ainsi pour ne pas donner à lire un tri qui se contredit.
    .order('cree_le', { ascending: false })
    .order('id', { ascending: false })
    .range(debut, debut + taillePage - 1)

  if (error) {
    if (error.code === 'PGRST103') {
      return { lignes: [], total: await compterMesDemandes(supabase, profilId) }
    }
    throw new Error(`Lecture de mes demandes impossible : ${error.message}`)
  }
  return {
    lignes: (data ?? []).map(versDemandeListe),
    total: totalObligatoire(count, 'mesDemandes'),
  }
}

/** Repli de `mesDemandes` quand PostgREST refuse sa lecture paginée. */
async function compterMesDemandes(
  supabase: Awaited<ReturnType<typeof clientServeur>>,
  profilId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('demandes_membre')
    .select('id', { count: 'exact', head: true })
    .eq('demandeur_profil_id', profilId)
  if (error) {
    throw new Error(`Comptage de mes demandes impossible : ${error.message}`)
  }
  return totalObligatoire(count, 'compterMesDemandes')
}

/** Une demande précise, ou `null` si elle n'existe pas ou n'est pas visible. */
export async function demandeParId(id: string): Promise<DemandeListe | null> {
  const supabase = await clientServeur()
  const { data, error } = await supabase.from('demandes_membre').select(COLONNES).eq('id', id).maybeSingle()

  if (error) {
    throw new Error(`Lecture de la demande impossible : ${error.message}`)
  }
  if (!data) return null
  return versDemandeListe(data)
}
