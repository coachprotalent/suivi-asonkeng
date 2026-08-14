import 'server-only'
import { clientServeur } from '@/lib/supabase/serveur'
import {
  compterATraiter,
  compterParticipantsDEvenement,
  evenementsParPage,
  participantsATraiterParPage,
  participantsDEvenementParPage,
  type ATraiterLigne,
  type EvenementListe,
  type PageLue,
  type ParticipantLigne,
} from './evenements-lots'

export type { ATraiterLigne, EvenementListe, PageLue, ParticipantLigne }

export type TypeEvenement = { id: string; libelle: string; actif: boolean; ordre: number }

export type EvenementDetail = {
  id: string
  titre: string
  typeId: string
  typeLibelle: string
  dateDebut: string
  dateFin: string | null
  heureDebut: string | null
  lieu: string | null
  description: string | null
}

export type SeminaireAssiste = {
  evenementId: string
  titre: string
  type: string
  dateDebut: string
}

/**
 * Plafond de lecture du CATALOGUE des types, strictement sous `max_rows` (1000). Forme
 * « échouer bruyamment » et non pagination : le catalogue est un référentiel de quelques
 * lignes, alimenté à la main par un administrateur, et il n'est CROISÉ avec aucune autre
 * lecture pour décider d'une écriture. Le jour où il dépasserait ce plafond, il faut le
 * VOIR — la même décision et le même motif que `LIMITE_LECTURE_CALENDRIERS_AEL`.
 */
const LIMITE_LECTURE_TYPES = 999

function refuserTroncature(count: number | null, lues: number, fonction: string): void {
  if (count !== null && count > lues) {
    throw new Error(
      `${fonction} : ${count} types existent, au-delà du plafond de lecture de ` +
        `${LIMITE_LECTURE_TYPES} lignes — cette fonction refuse de rendre une liste ` +
        'tronquée comme complète. Il faut désormais borner ou paginer cette lecture.',
    )
  }
}

async function lireTypes(seulementActifs: boolean): Promise<TypeEvenement[]> {
  const supabase = await clientServeur()
  let requete = supabase
    .from('types_evenement')
    .select('id, libelle, actif, ordre', { count: 'exact' })
    .order('ordre')
    .order('libelle')
    // Tri TOTAL : `ordre` vaut 0 par défaut sur tout type créé depuis l'écran, et
    // `libelle` est unique — mais l'unicité de `libelle` est une contrainte de la table,
    // pas une propriété du tri. `.order('id')` la rend explicite et survivrait à sa levée.
    .order('id')
    .range(0, LIMITE_LECTURE_TYPES - 1)

  if (seulementActifs) {
    requete = requete.eq('actif', true)
  }

  const { data, error, count } = await requete
  if (error) {
    throw new Error(`Lecture des types d événement impossible : ${error.message}`)
  }
  refuserTroncature(count, (data ?? []).length, 'lireTypes')
  return (data ?? []).map((l) => ({
    id: l.id as string,
    libelle: l.libelle as string,
    actif: l.actif as boolean,
    ordre: l.ordre as number,
  }))
}

/** Tous les types, actifs et désactivés — l'écran de catalogue (T16). */
export async function listerTypesEvenement(): Promise<TypeEvenement[]> {
  return lireTypes(false)
}

/**
 * Les seuls types ACTIFS — les formulaires de création et d'édition d'un événement (T17,
 * T18). Un type désactivé disparaît des NOUVELLES attributions mais reste visible sur
 * l'existant (spec §7, même régime que les statuts) : c'est pour cela que
 * `evenementParId` ne filtre pas, et que cette fonction si.
 */
export async function typesEvenementActifs(): Promise<TypeEvenement[]> {
  return lireTypes(true)
}

export async function listerEvenements(filtres?: {
  page?: number
  typeId?: string
}): Promise<PageLue<EvenementListe>> {
  const supabase = await clientServeur()
  return evenementsParPage(supabase, filtres)
}

/** Fiche d'un événement, ou `null` s'il n'existe pas (ou n'est pas visible). */
export async function evenementParId(id: string): Promise<EvenementDetail | null> {
  const supabase = await clientServeur()
  const { data, error } = await supabase
    .from('evenements')
    .select('id, titre, type_id, date_debut, date_fin, heure_debut, lieu, description, types_evenement(libelle)')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    // Une erreur de lecture ne doit pas devenir « cet événement n'existe pas » : les
    // appelants font `notFound()` sur `null`.
    throw new Error(`Lecture de l événement impossible : ${error.message}`)
  }
  if (!data) return null

  const brut = data.types_evenement as { libelle: string } | { libelle: string }[] | null
  const type = Array.isArray(brut) ? (brut[0] ?? null) : brut
  if (!type) {
    throw new Error('Forme inattendue rendue par evenementParId : type absent de l embed.')
  }

  return {
    id: data.id as string,
    titre: data.titre as string,
    typeId: data.type_id as string,
    typeLibelle: type.libelle,
    dateDebut: data.date_debut as string,
    dateFin: data.date_fin as string | null,
    heureDebut: data.heure_debut as string | null,
    lieu: data.lieu as string | null,
    description: data.description as string | null,
  }
}

export async function participantsDEvenement(
  evenementId: string,
  page?: number,
): Promise<PageLue<ParticipantLigne>> {
  const supabase = await clientServeur()
  return participantsDEvenementParPage(supabase, evenementId, { page })
}

/**
 * Nombre total de participants — voir l'encadré de `compterParticipantsDEvenement`
 * (evenements-lots.ts) : à appeler AVANT `participantsDEvenement` pour borner la
 * pagination, jamais après.
 */
export async function totalParticipantsDEvenement(evenementId: string): Promise<number> {
  const supabase = await clientServeur()
  return compterParticipantsDEvenement(supabase, evenementId)
}

/**
 * Nombre total de personnes « à traiter » — voir l'encadré de `compterATraiter`
 * (evenements-lots.ts) : à appeler AVANT `participantsATraiter` pour borner la pagination,
 * jamais après.
 */
export async function totalATraiter(): Promise<number> {
  const supabase = await clientServeur()
  return compterATraiter(supabase)
}

export async function participantsATraiter(page?: number): Promise<PageLue<ATraiterLigne>> {
  const supabase = await clientServeur()
  return participantsATraiterParPage(supabase, { page })
}

/**
 * Séminaires assistés par un membre, lus depuis la vue `seminaires_assistes` (D70, D71).
 * L'HISTORIQUE DES CONVERTIS EST COMPRIS : la seconde branche de la vue projette les
 * participations d'externes convertis sur `converti_en_membre_id`, résolu À LA LECTURE —
 * aucune écriture passée n'a bougé (D69).
 *
 * NON PAGINÉE, et bornée par `LIMITE_SEMINAIRES_PAR_MEMBRE` : cette lecture est filtrée sur
 * UN membre, et un membre qui aurait assisté à plus de 999 événements distincts est une
 * anomalie qu'il faut VOIR, pas absorber. La forme « échouer bruyamment » est ici celle qui
 * a un sens : la fiche membre affiche des ÉTIQUETTES, pas une liste paginable, et rendre 25
 * étiquettes sur 40 sans le dire serait exactement le mensonge que D75 combat.
 */
const LIMITE_SEMINAIRES_PAR_MEMBRE = 999

export async function seminairesAssistes(membreId: string): Promise<SeminaireAssiste[]> {
  const supabase = await clientServeur()
  const { data, error, count } = await supabase
    .from('seminaires_assistes')
    .select('evenement_id, titre, type, date_debut', { count: 'exact' })
    .eq('membre_id', membreId)
    .order('date_debut', { ascending: false })
    // Tri TOTAL : `date_debut` n'est pas unique, `evenement_id` l'est dans l'ensemble
    // filtré sur un seul membre (la vue déduplique par `union`).
    .order('evenement_id')
    .range(0, LIMITE_SEMINAIRES_PAR_MEMBRE - 1)

  if (error) {
    // Un échec ne doit pas être indistinguable de « ce membre n'a assisté à aucun
    // séminaire » : c'est précisément le mode de défaillance que D71 décrit pour la vue
    // elle-même, et il ne doit pas être reproduit ici par une erreur avalée.
    throw new Error(`Lecture des séminaires assistés impossible : ${error.message}`)
  }
  if (count !== null && count > (data ?? []).length) {
    throw new Error(
      `seminairesAssistes : ${count} séminaires pour ce membre, au-delà du plafond de ` +
        `lecture de ${LIMITE_SEMINAIRES_PAR_MEMBRE} — cette fonction refuse de rendre une ` +
        'liste tronquée comme complète.',
    )
  }
  return (data ?? []).map((l) => ({
    evenementId: l.evenement_id as string,
    titre: l.titre as string,
    type: l.type as string,
    dateDebut: l.date_debut as string,
  }))
}
