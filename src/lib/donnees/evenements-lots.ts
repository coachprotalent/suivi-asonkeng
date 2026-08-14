import type { SupabaseClient } from '@supabase/supabase-js'
import { totalObligatoire, verifierTaillePage, type PageLue } from './pagination'

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

// `PageLue`, `verifierTaillePage` et `totalObligatoire` vivent désormais dans
// `pagination.ts` (I4 de la revue finale) : la lecture paginée des demandes s'en sert aussi,
// et recopier les garde-fous aurait créé deux vérités. RÉEXPORTÉ pour ne rien casser chez
// les appelants existants (`evenements.ts`, `/evenements/[id]/page.tsx`, la suite RLS).
export type { PageLue }

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
  externeClasseLe: string | null
  externeMotifClassement: string | null
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

// Les deux docblocks qui vivaient ici (validation LEVÉE et non bornée en silence ; `count`
// absent = mensonge) ont suivi leurs fonctions dans `pagination.ts` — les laisser ici
// aurait produit exactement ce que ce projet traque : une légende sans code sous elle.

type LigneMembreEmbed = { id: string; nom: string; prenom: string } | { id: string; nom: string; prenom: string }[] | null
type ExterneEmbed = {
  id: string
  nom: string
  prenom: string | null
  converti_en_membre_id: string | null
  classe_le: string | null
  motif_classement: string | null
}
type LigneExterneEmbed = ExterneEmbed | ExterneEmbed[] | null

function premier<T>(valeur: T | T[] | null): T | null {
  if (!valeur) return null
  return Array.isArray(valeur) ? (valeur[0] ?? null) : valeur
}

// UN SEUL littéral de chaîne, continué par antislash-retour à la ligne (qui n'insère RIEN
// dans la chaîne) — JAMAIS une concaténation par `+` : postgrest-js n'infère le type
// détaillé de `.select(...)` qu'à partir d'un littéral au sens de TypeScript, et une
// concaténation widen le type en `string` générique, faisant retomber tout le résultat sur
// `GenericStringError`. Constaté en phase 3 (`COLONNES_SEANCE_DETAIL`).
// `classe_le` et `motif_classement` (I3 de la revue finale) : sans eux, un participant classé
// sans suite DISPARAISSAIT de toute l'application. La fiche d'évènement affichait « · converti »
// mais jamais « · classé », et le motif — rendu OBLIGATOIRE et validé deux fois — n'était
// affiché NULLE PART : une colonne en écriture seule. Lus par le même embed que
// `converti_en_membre_id`, donc sous la même RLS, et rendus sous le même `if (peutGerer)`.
const COLONNES_PARTICIPANT =
  'id, membre_id, participant_externe_id, desir_mentorat_academique, desir_suivi_spirituel, \
desir_cpeap, note, saisi_le, \
membres(id, nom, prenom), \
participants_externes(id, nom, prenom, converti_en_membre_id, classe_le, motif_classement)'

/**
 * LE filtre des événements, appliqué PAR CETTE FONCTION aux deux requêtes qui en ont besoin
 * — la lecture paginée et son comptage de repli.
 *
 * CORRECTION D'UN COMMENTAIRE QUI DÉCRIVAIT L'INVERSE DU CODE (revue du dernier lot). Le
 * docblock de `compterEvenements` invoquait `compterMembresActifs` comme modèle et affirmait
 * que les filtres étaient « CENTRALISÉS […] pour qu'un futur filtre ajouté à l'une ne puisse
 * pas diverger de l'autre en silence » — alors que `membres.ts:99-110` applique bel et bien
 * une FONCTION UNIQUE aux deux requêtes, tandis qu'ici le filtre était RÉÉCRIT de part et
 * d'autre. Le code avait exactement la forme que son commentaire disait interdire. C'est le
 * commentaire qui avait raison : la centralisation est faite ici, pour de bon.
 *
 * `any` pour la même raison que `filtrerMembresActifs` : les surcharges de `PostgrestBuilder`
 * ne se recomposent pas à travers une fonction générique. Sans conséquence sur la sûreté —
 * l'appelant retype `data` champ par champ.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function filtrerEvenements(requete: any, typeId?: string) {
  return typeId ? requete.eq('type_id', typeId) : requete
}

/**
 * Compte les événements visibles par l'appelant, même filtre que `evenementsParPage` mais
 * sans `range` — sert de REPLI quand PostgREST refuse la requête paginée elle-même
 * (`PGRST103`, voir `evenementsParPage`), cas où son `count` normal n'arrive jamais.
 */
async function compterEvenements(supabase: SupabaseClient, typeId?: string): Promise<number> {
  const { count, error } = await filtrerEvenements(
    supabase.from('evenements').select('id', { count: 'exact', head: true }),
    typeId,
  )
  if (error) {
    throw new Error(`Comptage des événements impossible : ${error.message}`)
  }
  return totalObligatoire(count, 'compterEvenements')
}

/**
 * Une page d'événements, les plus récents en tête. Tri TOTAL : `date_debut desc` puis `id`
 * — `date_debut` n'est PAS unique (plusieurs événements le même jour), et deux ex æquo à
 * cheval sur une frontière de page seraient rendus deux fois ou JAMAIS sous une pagination
 * par décalage. C'est le défaut que `listerMembres` a dû fermer après coup (I4 de la revue
 * finale de la 1c).
 *
 * PGRST103 ATTRAPÉE ICI, SUR LA LECTURE ELLE-MÊME — motif éprouvé de `listerMembres`
 * (membres.ts:185-188), PAS le motif fragile qu'il a remplacé (I1 de la ronde du
 * 2026-08-14) : calculer la borne haute par un premier aller-retour puis lire par un
 * second ouvre une fenêtre de course — une suppression ou une conversion concurrente entre
 * les deux fait toujours échouer le second appel, sur un écran où deux modérateurs
 * travaillent précisément ensemble. Un seul aller-retour : si le décalage demandé dépasse
 * le nombre réel de lignes (signet périmé, ou liste qui a rétréci depuis), PostgREST refuse
 * la requête ENTIÈRE (416, `count` absent) — on retombe alors sur un comptage SANS `range`
 * (toujours satisfiable) pour rendre un total à jour à l'appelant, qui décide seul de
 * rediriger ou non.
 */
export async function evenementsParPage(
  supabase: SupabaseClient,
  options?: { page?: number; typeId?: string; taillePage?: number },
): Promise<PageLue<EvenementListe>> {
  const taillePage = options?.taillePage ?? TAILLE_PAGE_EVENEMENTS
  verifierTaillePage(taillePage, 'evenementsParPage')
  const page = Math.max(1, options?.page ?? 1)
  const debut = (page - 1) * taillePage

  const { data, error, count } = await filtrerEvenements(
    supabase
      .from('evenements')
      .select('id, titre, date_debut, date_fin, lieu, types_evenement(libelle)', { count: 'exact' })
      .order('date_debut', { ascending: false })
      .order('id')
      .range(debut, debut + taillePage - 1),
    options?.typeId,
  )
  if (error) {
    if (error.code === 'PGRST103') {
      const total = await compterEvenements(supabase, options?.typeId)
      return { lignes: [], total }
    }
    // Un échec ne doit pas être indistinguable d'une liste vide : annoncer « aucun
    // événement » alors que la requête a échoué est un mensonge silencieux.
    throw new Error(`Lecture des événements impossible : ${error.message}`)
  }

  return {
    // `l: any` explicite depuis la centralisation du filtre : `filtrerEvenements` rend `any`
    // (les surcharges de PostgrestBuilder ne se recomposent pas), donc `data` n'est plus
    // inféré. Même forme que `participantsDEvenementParPage` et `listerMembres` juste à côté,
    // et chaque champ est retypé un à un ci-dessous.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lignes: (data ?? []).map((l: any) => {
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
 * Nombre TOTAL de participants d'un évènement, sans lire aucune ligne — REPLI de
 * `participantsDEvenementParPage` quand PostgREST refuse sa lecture paginée (`PGRST103`),
 * jamais appelée en amont pour précalculer une borne (voir l'encadré de cette fonction : le
 * correctif initial de la Task 19 faisait exactement cela, EN DEUX ALLERS-RETOURS séparés,
 * et ouvrait une fenêtre de course qu'une suppression ou une conversion concurrente pouvait
 * franchir entre les deux — corrigé par la ronde I1 du 2026-08-14, motif repris de
 * `listerMembres`/`compterMembresActifs`).
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
 *
 * PGRST103 ATTRAPÉE ICI, SUR LA LECTURE ELLE-MÊME, PAS PRÉCALCULÉE PAR UN APPEL SÉPARÉ EN
 * AMONT (I1 de la ronde du 2026-08-14) : un décalage demandé au-delà du nombre réel de
 * lignes (signet périmé, ou liste qui a rétréci depuis une suppression) fait refuser la
 * requête ENTIÈRE par PostgREST (416, `count` absent). Le repli — `compterParticipantsDEvenement`,
 * SANS `range`, donc toujours satisfiable — ne s'exécute alors QU'APRÈS l'échec de CETTE
 * lecture, jamais avant : aucune fenêtre entre un comptage et une lecture où une écriture
 * concurrente pourrait périmer une borne déjà calculée.
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
    if (error.code === 'PGRST103') {
      const total = await compterParticipantsDEvenement(supabase, evenementId)
      return { lignes: [], total }
    }
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
        externeClasseLe: externe?.classe_le ?? null,
        externeMotifClassement: externe?.motif_classement ?? null,
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
 * Nombre TOTAL de personnes dans la liste « à traiter », sans lire aucune ligne — REPLI de
 * `participantsATraiterParPage` quand PostgREST refuse sa lecture paginée (`PGRST103`), au
 * même titre que `compterParticipantsDEvenement` ci-dessus. PAS un précalcul de borne en
 * amont : voir l'encadré de `participantsATraiterParPage`, et I1 de la ronde du
 * 2026-08-14 pour le défaut que cette forme corrige (fenêtre de course entre un comptage
 * séparé et une lecture, sur l'écran même où deux modérateurs travaillent ensemble).
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
 * une relation ordinaire — VÉRIFIÉ contre la base.
 *
 * PGRST103 ATTRAPÉE ICI, SUR LA LECTURE ELLE-MÊME (I1 de la ronde du 2026-08-14), pas
 * précalculée par un comptage séparé exécuté avant tout `.range()` : cette dernière forme
 * — celle du correctif initial de la Task 19 — laissait une fenêtre où une conversion ou un
 * classement concurrent, entre le comptage et la lecture, périmait la borne déjà calculée
 * et faisait échouer la lecture elle-même, plantant l'écran au lieu de rediriger. Le repli
 * (`compterATraiter`, sans `range`) ne s'exécute désormais qu'APRÈS l'échec de cette
 * lecture.
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
    if (error.code === 'PGRST103') {
      const total = await compterATraiter(supabase)
      return { lignes: [], total }
    }
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
