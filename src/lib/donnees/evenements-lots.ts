import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * PAS de `import 'server-only'` ici, à la différence de `src/lib/donnees/evenements.ts` —
 * délibéré, même motif que `membres-lots.ts` et `presences-lots.ts` (voir leurs encadrés
 * de tête) : les trois fonctions ci-dessous reçoivent leur client Supabase DÉJÀ CONSTRUIT,
 * en paramètre, et ne touchent ni cookies ni clé de service. L'isoler permet à
 * `tests/rls/evenements-pagination.test.ts` (vitest, hors Next.js) de faire tourner
 * EXACTEMENT ce code de production contre la vraie base, avec une taille de page abaissée
 * — chose impossible si ces fonctions vivaient dans un module `server-only`, dont le
 * `throw` nu n'est neutralisé que par l'alias du bundler Next.
 *
 * `evenements.ts`, lui, reste `server-only` et enveloppe ce module pour ses appelants :
 * cette séparation ne change RIEN pour eux.
 */

/**
 * D75 — LES TROIS LISTES DE LA PHASE SONT PAGINÉES, AVEC UN TRI TOTAL.
 *
 * D29 fait exception pour le pointage AEL, et son motif est nommé : pointer suppose de
 * balayer toute l'assistance. AUCUN geste de cette phase n'a cette propriété — ajouter un
 * participant ne demande pas de voir les autres, et le doublon n'est pas évité en regardant
 * la liste, il est REFUSÉ par les index uniques partiels de D58, ce qui est une garantie et
 * non une vigilance.
 *
 * Le risque, lui, est réel : un séminaire académique peut rassembler plusieurs centaines de
 * personnes, et la liste « à traiter » cumule les années. Au-delà de `max_rows = 1000`
 * (`supabase/config.toml:18`), PostgREST tronque EN SILENCE : ce ne serait pas une page
 * incomplète, ce seraient DES PERSONNES QUE PERSONNE NE VERRAIT JAMAIS.
 *
 * Les trois tailles sont exportées : la preuve de non-troncature
 * (`tests/rls/evenements-pagination.test.ts`) appelle ces fonctions avec une taille ramenée
 * à deux ou trois lignes, pour franchir une VRAIE frontière de page sans créer un millier
 * de lignes en base de production.
 */
export const TAILLE_PAGE_EVENEMENTS = 25
export const TAILLE_PAGE_PARTICIPANTS = 50
export const TAILLE_PAGE_A_TRAITER = 25

export type PageLue<T> = { lignes: T[]; total: number }

export type EvenementListe = {
  id: string
  titre: string
  typeLibelle: string
  dateDebut: string
  dateFin: string | null
  lieu: string | null
}

export type ParticipantLigne = {
  id: string
  membreId: string | null
  membreNom: string | null
  membrePrenom: string | null
  participantExterneId: string | null
  externeNom: string | null
  externePrenom: string | null
  externeConvertiEnMembreId: string | null
  desirMentoratAcademique: boolean
  desirSuiviSpirituel: boolean
  desirCpeap: boolean
  note: string | null
}

export type ATraiterLigne = {
  participantExterneId: string
  nom: string
  prenom: string | null
  telephone: string | null
  email: string | null
  ville: string | null
  pays: string | null
  premiereExpression: string
  evenementsConcernes: number
}

/**
 * Validation LEVÉE, pas bornée en silence — même discipline et même raison que
 * `membresDesAntennesParLots` : borner (`Math.min(taille, 999)`) masquerait un appel erroné
 * derrière un comportement différent de celui demandé. Une taille >= `max_rows` ferait
 * tronquer la page PAR POSTGREST LUI-MÊME, et la fonction rendrait une page tronquée comme
 * complète. Une taille <= 0 produirait un `range` structurellement invalide.
 */
function verifierTaillePage(taillePage: number, fonction: string): void {
  if (!Number.isInteger(taillePage) || taillePage < 1 || taillePage >= 1000) {
    throw new Error(
      `${fonction} : taillePage invalide (${taillePage}) — doit être un entier compris entre 1 et 999 inclus (max_rows PostgREST = 1000, supabase/config.toml:18).`,
    )
  }
}

/**
 * `count` absent de la réponse PostgREST : retomber sur la longueur de la page serait un
 * MENSONGE — l'écran annoncerait « 25 événements » pour une base qui en compte mille, et la
 * pagination s'arrêterait à la première page. Même discipline que `listerMembres`.
 */
function totalObligatoire(count: number | null, fonction: string): number {
  if (count === null) {
    throw new Error(`${fonction} : comptage absent de la réponse PostgREST.`)
  }
  return count
}

type LigneMembreEmbed = { id: string; nom: string; prenom: string } | { id: string; nom: string; prenom: string }[] | null
type LigneExterneEmbed =
  | { id: string; nom: string; prenom: string | null; converti_en_membre_id: string | null }
  | { id: string; nom: string; prenom: string | null; converti_en_membre_id: string | null }[]
  | null

function premier<T>(valeur: T | T[] | null): T | null {
  if (!valeur) return null
  return Array.isArray(valeur) ? (valeur[0] ?? null) : valeur
}

// UN SEUL littéral de chaîne, continué par antislash-retour à la ligne (qui n'insère RIEN
// dans la chaîne) — JAMAIS une concaténation par `+` : postgrest-js n'infère le type
// détaillé de `.select(...)` qu'à partir d'un littéral au sens de TypeScript, et une
// concaténation widen le type en `string` générique, faisant retomber tout le résultat sur
// `GenericStringError`. Constaté en phase 3 (`COLONNES_SEANCE_DETAIL`).
const COLONNES_PARTICIPANT =
  'id, membre_id, participant_externe_id, desir_mentorat_academique, desir_suivi_spirituel, \
desir_cpeap, note, saisi_le, \
membres(id, nom, prenom), \
participants_externes(id, nom, prenom, converti_en_membre_id)'

/**
 * Une page d'événements, les plus récents en tête. Tri TOTAL : `date_debut desc` puis `id`
 * — `date_debut` n'est PAS unique (plusieurs événements le même jour), et deux ex æquo à
 * cheval sur une frontière de page seraient rendus deux fois ou JAMAIS sous une pagination
 * par décalage. C'est le défaut que `listerMembres` a dû fermer après coup (I4 de la revue
 * finale de la 1c).
 */
export async function evenementsParPage(
  supabase: SupabaseClient,
  options?: { page?: number; typeId?: string; taillePage?: number },
): Promise<PageLue<EvenementListe>> {
  const taillePage = options?.taillePage ?? TAILLE_PAGE_EVENEMENTS
  verifierTaillePage(taillePage, 'evenementsParPage')
  const page = Math.max(1, options?.page ?? 1)
  const debut = (page - 1) * taillePage

  let requete = supabase
    .from('evenements')
    .select('id, titre, date_debut, date_fin, lieu, types_evenement(libelle)', { count: 'exact' })
    .order('date_debut', { ascending: false })
    .order('id')
    .range(debut, debut + taillePage - 1)

  if (options?.typeId) {
    requete = requete.eq('type_id', options.typeId)
  }

  const { data, error, count } = await requete
  if (error) {
    // Un échec ne doit pas être indistinguable d'une liste vide : annoncer « aucun
    // événement » alors que la requête a échoué est un mensonge silencieux.
    throw new Error(`Lecture des événements impossible : ${error.message}`)
  }

  return {
    lignes: (data ?? []).map((l) => {
      const type = premier(l.types_evenement as { libelle: string } | { libelle: string }[] | null)
      if (!type) {
        // `type_id` est NOT NULL et `types_evenement_lecture` est ouverte à tout compte
        // actif : l'embed ne peut pas rendre `null` pour un appelant autorisé. Si c'est le
        // cas, c'est une anomalie (colonne renommée, jointure cassée), et mieux vaut
        // échouer bruyamment que rendre un type « undefined » à l'écran. Même discipline
        // que `nomAntenneObligatoire` en phase 3.
        throw new Error('Forme inattendue rendue par evenementsParPage : type absent de l embed.')
      }
      return {
        id: l.id as string,
        titre: l.titre as string,
        typeLibelle: type.libelle,
        dateDebut: l.date_debut as string,
        dateFin: l.date_fin as string | null,
        lieu: l.lieu as string | null,
      }
    }),
    total: totalObligatoire(count, 'evenementsParPage'),
  }
}

/**
 * Nombre TOTAL de participants d'un évènement, sans lire aucune ligne — sert à BORNER la
 * pagination AVANT de lire une page, jamais après.
 *
 * DÉFAUT RÉEL DÉCOUVERT PAR L'EXÉCUTION à la vérification manuelle de la Task 19
 * (`?pageParticipants=99` sur un évènement à deux participants), absent du brief : lire la
 * page DEMANDÉE avant de connaître le total — le patron que `src/app/membres/page.tsx`
 * emploie et que ce brief décalquait — fait renvoyer par PostgREST une erreur 416
 * (`Requested range not satisfiable`, marqueur `PGRST103`) dès que le décalage demandé
 * dépasse le nombre de lignes réellement présentes, CE QUI EST TOUJOURS LE CAS quand le
 * garde de borne haute doit justement se déclencher. Résultat observé : la page ne
 * redirigeait pas, elle PLANTAIT (digest Next.js), pour l'exemple même que l'étape de
 * vérification du brief demande de rejouer. Cette fonction lit le compte seul (décalage 0,
 * toujours satisfiable) pour calculer `pagesParticipants` et décider d'une redirection
 * AVANT tout `.range()`, qui n'est alors plus jamais hors bornes.
 */
export async function compterParticipantsDEvenement(
  supabase: SupabaseClient,
  evenementId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('participations')
    .select('id', { count: 'exact', head: true })
    .eq('evenement_id', evenementId)

  if (error) {
    throw new Error(`Comptage des participants impossible : ${error.message}`)
  }
  return totalObligatoire(count, 'compterParticipantsDEvenement')
}

/**
 * Une page de participants d'un événement, membres et externes confondus, dans l'ordre de
 * saisie. Tri TOTAL : `saisi_le` puis `id` — `saisi_le` n'est PAS unique, un ajout en lot
 * partage la même valeur par défaut `now()` à la milliseconde près.
 *
 * `membres(...)` passe sous la RLS de l'appelant : une fiche archivée lue par un modérateur
 * rend `membre_id` non nul mais l'embed `null`. Les deux informations sont rendues
 * SÉPARÉMENT, jamais confondues — sur le modèle de `libelleFiliation` (1c) et de
 * `seanceParId` (phase 3) : « aucun membre » et « fiche non consultable » sont deux faits
 * différents, et les confondre ferait mentir l'écran.
 */
export async function participantsDEvenementParPage(
  supabase: SupabaseClient,
  evenementId: string,
  options?: { page?: number; taillePage?: number },
): Promise<PageLue<ParticipantLigne>> {
  const taillePage = options?.taillePage ?? TAILLE_PAGE_PARTICIPANTS
  verifierTaillePage(taillePage, 'participantsDEvenementParPage')
  const page = Math.max(1, options?.page ?? 1)
  const debut = (page - 1) * taillePage

  const { data, error, count } = await supabase
    .from('participations')
    .select(COLONNES_PARTICIPANT, { count: 'exact' })
    .eq('evenement_id', evenementId)
    .order('saisi_le')
    .order('id')
    .range(debut, debut + taillePage - 1)

  if (error) {
    throw new Error(`Lecture des participants impossible : ${error.message}`)
  }

  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lignes: (data ?? []).map((l: any) => {
      const membre = premier(l.membres as LigneMembreEmbed)
      const externe = premier(l.participants_externes as LigneExterneEmbed)
      return {
        id: l.id as string,
        membreId: l.membre_id as string | null,
        membreNom: membre?.nom ?? null,
        membrePrenom: membre?.prenom ?? null,
        participantExterneId: l.participant_externe_id as string | null,
        externeNom: externe?.nom ?? null,
        externePrenom: externe?.prenom ?? null,
        externeConvertiEnMembreId: externe?.converti_en_membre_id ?? null,
        desirMentoratAcademique: l.desir_mentorat_academique as boolean,
        desirSuiviSpirituel: l.desir_suivi_spirituel as boolean,
        desirCpeap: l.desir_cpeap as boolean,
        note: l.note as string | null,
      }
    }),
    total: totalObligatoire(count, 'participantsDEvenementParPage'),
  }
}

/**
 * Nombre TOTAL de personnes dans la liste « à traiter », sans lire aucune ligne — sert à
 * BORNER la pagination AVANT de lire une page, jamais après. MÊME MOTIF, MÊME DÉFAUT ET
 * MÊME CORRECTIF que `compterParticipantsDEvenement` : lire directement la page demandée,
 * puis comparer au total, fait renvoyer par PostgREST une erreur 416 (`Requested range not
 * satisfiable`, `PGRST103`) dès que le décalage demandé dépasse le nombre de lignes de la
 * vue — REPRODUIT ET VÉRIFIÉ EMPIRIQUEMENT (requête directe, `range(2450, 2474)` sur une vue
 * à zéro ligne : `PGRST103`, « An offset of 2450 was requested, but there are only 0
 * rows. »). `/evenements/a-traiter` porte le MÊME garde de borne haute que
 * `/evenements/[id]` (Task 19) ; sans ce comptage préalable, il PLANTERAIT au lieu de
 * rediriger, exactement comme la fiche d'évènement avant sa correction.
 */
export async function compterATraiter(supabase: SupabaseClient): Promise<number> {
  const { count, error } = await supabase
    .from('participants_a_traiter')
    .select('participant_externe_id', { count: 'exact', head: true })

  if (error) {
    throw new Error(`Comptage de la liste à traiter impossible : ${error.message}`)
  }
  return totalObligatoire(count, 'compterATraiter')
}

/**
 * Une page de la liste « à traiter », lue depuis la vue `participants_a_traiter` (D74).
 * Tri TOTAL : `premiere_expression` puis `participant_externe_id` — deux personnes ayant
 * exprimé leur désir au MÊME séminaire partagent `premiere_expression`, et sans la seconde
 * clé l'une des deux pourrait disparaître entre deux pages. Ce sont des PERSONNES À
 * RECONTACTER : « disparue » n'est pas un défaut d'affichage.
 *
 * `count` sur une vue AGRÉGÉE : PostgREST le calcule bien, la vue étant interrogée comme
 * une relation ordinaire — VÉRIFIÉ contre la base (voir `compterATraiter` ci-dessus, dont
 * le comptage sert de garde à `/evenements/a-traiter` AVANT tout appel à cette fonction).
 * Cette fonction elle-même doit toujours être appelée avec une `page` déjà bornée par
 * l'appelant — jamais avec une valeur brute venue de l'adresse.
 */
export async function participantsATraiterParPage(
  supabase: SupabaseClient,
  options?: { page?: number; taillePage?: number },
): Promise<PageLue<ATraiterLigne>> {
  const taillePage = options?.taillePage ?? TAILLE_PAGE_A_TRAITER
  verifierTaillePage(taillePage, 'participantsATraiterParPage')
  const page = Math.max(1, options?.page ?? 1)
  const debut = (page - 1) * taillePage

  // `cree_le` existe bien sur la vue mais N'EST PAS SÉLECTIONNÉE : ni `ATraiterLigne` ni le
  // mapping ci-dessous ne l'exposent, et une colonne lue que personne ne rend est une
  // colonne morte — elle laisse croire à un implémenteur qu'un écran l'affiche quelque
  // part. Ce qui date la ligne à l'écran, c'est `premiere_expression` (la première fois que
  // la personne a exprimé le désir), pas la date de création de sa fiche d'externe. Pour
  // l'ajouter un jour, il faut TROIS gestes ensemble : le `select`, le champ de
  // `ATraiterLigne`, et le mapping.
  const { data, error, count } = await supabase
    .from('participants_a_traiter')
    .select(
      'participant_externe_id, nom, prenom, telephone, email, ville, pays, premiere_expression, evenements_concernes',
      { count: 'exact' },
    )
    .order('premiere_expression')
    .order('participant_externe_id')
    .range(debut, debut + taillePage - 1)

  if (error) {
    throw new Error(`Lecture de la liste à traiter impossible : ${error.message}`)
  }

  return {
    lignes: (data ?? []).map((l) => ({
      participantExterneId: l.participant_externe_id as string,
      nom: l.nom as string,
      prenom: l.prenom as string | null,
      telephone: l.telephone as string | null,
      email: l.email as string | null,
      ville: l.ville as string | null,
      pays: l.pays as string | null,
      premiereExpression: l.premiere_expression as string,
      evenementsConcernes: Number(l.evenements_concernes),
    })),
    total: totalObligatoire(count, 'participantsATraiterParPage'),
  }
}
