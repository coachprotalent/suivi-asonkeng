import 'server-only'
import type { EtatSeanceAel, JourSemaine } from '@/lib/domaine/ael'
import type { MembreBref } from '@/lib/donnees/membres'
import { presencesDeSeanceParLots } from '@/lib/donnees/presences-lots'
import { clientServeur } from '@/lib/supabase/serveur'

type LigneAntenneEmbed = { nom: string } | { nom: string }[] | null

/**
 * `antenne_id` est NOT NULL sur `calendriers_ael`, et la politique `antennes_lecture`
 * (`supabase/migrations/20260812110000_antennes.sql`) est `using ((select
 * prive.est_actif()))` — ouverte à tout compte actif, **y compris pour les antennes
 * DÉSACTIVÉES**. L'embed ne peut donc pas rendre `null` pour un appelant autorisé : si
 * c'est le cas, c'est une anomalie (colonne renommée, jointure cassée), et mieux vaut
 * échouer bruyamment que rendre une antenne « undefined » à l'écran. Même discipline que
 * `ancetresDeMembre` en 1c.
 *
 * ATTENTION, condition de validité de ce raisonnement : si `antennes_lecture` était un
 * jour restreinte aux seules antennes actives, cette fonction transformerait une simple
 * restriction de LECTURE en page 500 sur `/ael/calendriers`. Relire ce commentaire avant
 * de toucher à cette politique.
 */
function nomAntenneObligatoire(valeur: LigneAntenneEmbed, contexte: string): string {
  const brut = Array.isArray(valeur) ? (valeur[0] ?? null) : valeur
  if (!brut) {
    throw new Error(`Forme inattendue renvoyée par ${contexte} : antenne absente de l'embed.`)
  }
  return brut.nom
}

export type CalendrierAel = {
  id: string
  antenneId: string
  antenneNom: string
  jourSemaine: JourSemaine
  heure: string | null
  actif: boolean
}

/**
 * Plafond de lecture des DEUX lectures de `calendriers_ael`, strictement sous `max_rows`
 * de PostgREST (1000, `supabase/config.toml:18`) — même discipline et même raison que
 * `LIMITE_LECTURE_SEANCES_AEL` plus bas.
 *
 * Mineur 3 de la revue finale de branche : c'étaient les DEUX DERNIÈRES lectures non
 * bornées de l'AEL, et elles manquaient à la « carte des lectures non bornées » du
 * registre. La cardinalité est naturellement petite (9 créneaux aujourd'hui ; il en
 * faudrait plus de cent pour approcher le plafond), MAIS le mode de défaillance de
 * `calendriersActifs` est le pire de toute la phase : elle ALIMENTE LA GÉNÉRATION. Une
 * troncature silencieuse y produirait une SOUS-GÉNÉRATION — des créneaux réels dont
 * aucune séance ne serait jamais créée, sans erreur, sans page vide, sans rien à voir.
 * C'est le motif dominant du projet appliqué à une écriture, pas à un affichage.
 *
 * Forme retenue : échouer bruyamment, comme `listerSeances` et pour la même raison —
 * aucune de ces deux lectures n'est CROISÉE avec une autre pour décider d'une écriture
 * ligne à ligne (ce qui imposerait de paginer, cf. `presences-lots.ts`). Le jour où un
 * dépassement se produit, il doit être VU, pas absorbé.
 */
const LIMITE_LECTURE_CALENDRIERS_AEL = 999

/**
 * Contrôle commun aux deux lectures de `calendriers_ael`. `count: 'exact'` rend le total
 * réel indépendamment du `.range()` — fait établi contre la base réelle pour
 * `listerSeances`, réemployé ici.
 */
function refuserTroncature(count: number | null, lues: number, fonction: string): void {
  if (count !== null && count > lues) {
    throw new Error(
      `${fonction} : ${count} créneaux existent, au-delà du plafond de lecture de ` +
        `${LIMITE_LECTURE_CALENDRIERS_AEL} lignes — cette fonction refuse de rendre une ` +
        'liste tronquée comme complète. Il faut désormais borner ou paginer cette lecture.',
    )
  }
}

/** Tous les calendriers, actifs et désactivés, triés par état puis jour de semaine. */
export async function listerCalendriers(): Promise<CalendrierAel[]> {
  const supabase = await clientServeur()
  const { data, error, count } = await supabase
    .from('calendriers_ael')
    .select('id, antenne_id, jour_semaine, heure, actif, antennes(nom)', { count: 'exact' })
    .order('actif', { ascending: false })
    .order('jour_semaine')
    .range(0, LIMITE_LECTURE_CALENDRIERS_AEL - 1)

  if (error) {
    throw new Error(`Lecture des calendriers AEL impossible : ${error.message}`)
  }
  refuserTroncature(count, (data ?? []).length, 'listerCalendriers')
  return (data ?? []).map((l) => ({
    id: l.id as string,
    antenneId: l.antenne_id as string,
    antenneNom: nomAntenneObligatoire(l.antennes as LigneAntenneEmbed, 'listerCalendriers'),
    jourSemaine: l.jour_semaine as JourSemaine,
    heure: l.heure as string | null,
    actif: l.actif as boolean,
  }))
}

export type CalendrierPourGeneration = {
  id: string
  antenneId: string
  jourSemaine: JourSemaine
  heure: string | null
  actif: boolean
}

/**
 * Calendriers actifs **d'antennes actives** — le strict nécessaire à `genererSeances`
 * (Task 14), qui appelle `calculerOccurrences` (Task 11) une fois par calendrier de ce
 * tableau. Un calendrier désactivé n'y figure jamais : `calculerOccurrences` rendrait de
 * toute façon `[]` pour lui, mais filtrer ici évite l'appel pour rien.
 *
 * Les DEUX filtres comptent, et le second n'est pas une précaution décorative. Un
 * créneau `actif = true` peut parfaitement porter sur une antenne désactivée : rien en
 * base ne le désactive quand l'antenne l'est (l'écran des antennes ne touche pas à
 * `calendriers_ael`), et un créneau ajouté avant la désactivation le reste. Sans
 * `antennes.actif`, chaque génération produirait des séances pour une antenne hors
 * service, dont la liste de pointage serait vide — `membresDesAntennes` ne rendrait
 * rien, aucun membre actif n'y étant rattaché puisque `definirAntenneMembre` (Task 3)
 * refuse d'y rattacher qui que ce soit. Un flot de séances fantômes que rien ne signale.
 *
 * `antennes!inner(actif)` : la jointure INTERNE est obligatoire pour que `.eq(
 * 'antennes.actif', true)` filtre les lignes de `calendriers_ael` au lieu de se
 * contenter de vider l'embed.
 */
export async function calendriersActifs(): Promise<CalendrierPourGeneration[]> {
  const supabase = await clientServeur()
  const { data, error, count } = await supabase
    .from('calendriers_ael')
    .select('id, antenne_id, jour_semaine, heure, actif, antennes!inner(actif)', { count: 'exact' })
    .eq('actif', true)
    .eq('antennes.actif', true)
    .range(0, LIMITE_LECTURE_CALENDRIERS_AEL - 1)

  if (error) {
    throw new Error(`Lecture des calendriers actifs impossible : ${error.message}`)
  }
  // Voir l'encadré de `LIMITE_LECTURE_CALENDRIERS_AEL` : une troncature ICI ne produit
  // pas un affichage incomplet mais une SOUS-GÉNÉRATION silencieuse.
  refuserTroncature(count, (data ?? []).length, 'calendriersActifs')
  return (data ?? []).map((l) => ({
    id: l.id as string,
    antenneId: l.antenne_id as string,
    jourSemaine: l.jour_semaine as JourSemaine,
    heure: l.heure as string | null,
    actif: l.actif as boolean,
  }))
}

export type SeanceAelListe = {
  id: string
  date: string
  heure: string | null
  theme: string | null
  etat: EtatSeanceAel
  antennesNoms: string[]
}

type LigneJonctionAntenne = { antennes: LigneAntenneEmbed }

function nomsAntennesDeJonction(valeur: unknown): string[] {
  const lignes = (valeur ?? []) as LigneJonctionAntenne[]
  return lignes.map((l) => nomAntenneObligatoire(l.antennes, 'listerSeances'))
}

/**
 * Plafond de lecture de `listerSeances`, strictement sous `max_rows` de PostgREST
 * (1000, `supabase/config.toml:18`) — même discipline que `TAILLE_LOT_MEMBRES_ANTENNE`
 * (`src/lib/donnees/membres-lots.ts`). Voir le commentaire de `listerSeances` pour la
 * raison de choisir « échouer bruyamment » ici plutôt que de paginer.
 */
const LIMITE_LECTURE_SEANCES_AEL = 999

/**
 * Toutes les séances, à venir et passées, les plus récentes en premier.
 *
 * SANS BORNE, PostgREST tronquerait silencieusement au-delà de `max_rows` (1000,
 * `supabase/config.toml:18`) — exactement le défaut déjà corrigé une fois sur
 * `membresDesAntennes` (`src/lib/donnees/membres-lots.ts`), où une troncature ne
 * produisait pas une page incomplète mais des membres qu'on ne pouvait plus marquer
 * présents. Décision reportée par la Task 12 aux écrans qui consomment cette lecture
 * (Task 13, registre de la phase) : tranchée ici.
 *
 * FORME RETENUE : échouer bruyamment plutôt que paginer par lots. `membresDesAntennes`
 * paginait parce qu'un de ses DEUX appelants (le pointage multi-antennes, Task 16)
 * n'a structurellement AUCUN plafond naturel par appel — la pagination y rend la
 * troncature IMPOSSIBLE plutôt que seulement détectable sous une hypothèse de plafond
 * qui pourrait se tromper. `listerSeances` n'a qu'un seul appelant, `/ael/seances`
 * (Task 14), qui affiche une liste complète sans notion de plafond « normal » — il n'y
 * a ici ni fenêtre de dates ni filtre par antenne à qui adosser une pagination motivée.
 * Choisir de paginer silencieusement produirait donc une liste toujours « complète en
 * apparence », en train de grossir sans qu'aucun signal ne prévienne qu'elle a dépassé
 * ce qu'un navigateur peut raisonnablement afficher d'un bloc — un problème de produit
 * différent de celui que la pagination de `membresDesAntennes` résout. Échouer
 * bruyamment rend le dépassement VISIBLE le jour où il se produit, et force alors une
 * vraie décision de produit (borner par date, paginer l'écran) plutôt que de la
 * repousser silencieusement à un futur relecteur de code.
 *
 * `{ count: 'exact' }` rend le compte TOTAL de lignes correspondantes, indépendamment
 * de `.range()` — vérifié contre la base réelle avant d'écrire ce commentaire (et non
 * supposé) : un `.range(0, 0)` sur une table de 3 lignes rend `data.length === 1` mais
 * `count === 3`. Si `count` dépasse la page effectivement lue, la lecture est
 * incomplète et cette fonction LÈVE plutôt que de rendre une liste tronquée comme
 * complète — au 2026-08-14, `seances_ael` est vide en production, donc cette garde
 * n'a encore jamais eu l'occasion de se déclencher pour de vrai.
 */
export async function listerSeances(): Promise<SeanceAelListe[]> {
  const supabase = await clientServeur()
  const { data, error, count } = await supabase
    .from('seances_ael')
    .select('id, date, heure, theme, etat, seances_ael_antennes(antennes(nom))', {
      count: 'exact',
    })
    .order('date', { ascending: false })
    .range(0, LIMITE_LECTURE_SEANCES_AEL - 1)

  if (error) {
    throw new Error(`Lecture des séances AEL impossible : ${error.message}`)
  }
  const lignes = data ?? []
  if (count !== null && count > lignes.length) {
    throw new Error(
      `listerSeances : ${count} séances existent, au-delà du plafond de lecture de ` +
        `${LIMITE_LECTURE_SEANCES_AEL} lignes — cette fonction refuse de rendre une ` +
        'liste tronquée comme complète. Il faut désormais borner ou paginer cet écran.',
    )
  }
  return lignes.map((l) => ({
    id: l.id as string,
    date: l.date as string,
    heure: l.heure as string | null,
    theme: l.theme as string | null,
    etat: l.etat as EtatSeanceAel,
    antennesNoms: nomsAntennesDeJonction(l.seances_ael_antennes),
  }))
}

export type SeanceAelDetail = {
  id: string
  date: string
  heure: string | null
  theme: string | null
  // Colonne brute ET embed séparés à dessein, sur le modèle de `libelleFiliation`
  // (1c, `src/app/membres/[id]/page.tsx`) : si l'enseignant désigné est une fiche que
  // la RLS cache à l'appelant (typiquement archivée, vue par un compte non
  // administrateur), `enseignantMembreId` reste non nul pendant que `enseignantMembre`
  // vaut `null` — deux informations différentes que confondre ferait mentir l'écran
  // (« aucun enseignant » au lieu de « enseignant non consultable »).
  //
  // Les DEUX champs doivent atteindre le formulaire d'édition, pas seulement
  // l'affichage en lecture seule : `ChampIntervenant` (Task 15) s'en sert pour conserver
  // la valeur d'origine au lieu de renvoyer un champ caché vide, qui EFFACERAIT
  // l'intervenant en base au premier « Enregistrer ».
  enseignantMembreId: string | null
  enseignantMembre: MembreBref | null
  enseignantLibre: string | null
  moderateurMembreId: string | null
  moderateurMembre: MembreBref | null
  moderateurLibre: string | null
  etat: EtatSeanceAel
  calendrierId: string | null
  generePourLe: string | null
  antennes: { id: string; nom: string }[]
}

// Noms des deux contraintes posées par la Task 7 (défaut Postgres :
// `<table>_<colonne>_fkey`) — OBLIGATOIRES ici : sans eux, PostgREST refuse
// l'embed avec « more than one relationship was found for 'seances_ael' and
// 'membres' », deux chemins existant (enseignant, modérateur).
// UN SEUL littéral (continuation par antislash-retour à la ligne, qui n'insère RIEN
// dans la chaîne — jamais une concaténation `+`) : postgrest-js n'infère le type
// détaillé de `.select(...)` qu'à partir d'un littéral de chaîne au sens de TypeScript.
// Une concaténation par `+` widen le type en `string` générique, même déclarée `const`,
// et fait retomber TOUT le résultat sur `GenericStringError` (`tsc` en erreur sur
// chaque champ lu plus bas) — constaté en écrivant ce fichier, corrigé ici avant que
// ça n'atteigne les portes.
const COLONNES_SEANCE_DETAIL =
  'id, date, heure, theme, enseignant_membre_id, enseignant_libre, moderateur_membre_id, moderateur_libre, etat, calendrier_id, genere_pour_le, \
enseignant:membres!seances_ael_enseignant_membre_id_fkey(id, nom, prenom), \
moderateur:membres!seances_ael_moderateur_membre_id_fkey(id, nom, prenom), \
seances_ael_antennes(antennes(id, nom))'

type LigneMembreBref = { id: string; nom: string; prenom: string } | { id: string; nom: string; prenom: string }[] | null

function membreBrefDeLigne(valeur: LigneMembreBref): MembreBref | null {
  const brut = Array.isArray(valeur) ? (valeur[0] ?? null) : valeur
  return brut ? { id: brut.id, nom: brut.nom, prenom: brut.prenom } : null
}

type LigneAntenneAvecId = { id: string; nom: string } | { id: string; nom: string }[] | null

/** Fiche complète d'une séance, ou `null` si elle n'existe pas (ou n'est pas visible). */
export async function seanceParId(id: string): Promise<SeanceAelDetail | null> {
  const supabase = await clientServeur()
  const { data, error } = await supabase
    .from('seances_ael')
    .select(COLONNES_SEANCE_DETAIL)
    .eq('id', id)
    .maybeSingle()

  if (error) {
    throw new Error(`Lecture de la séance impossible : ${error.message}`)
  }
  if (!data) return null

  const antennesJonction = (data.seances_ael_antennes ?? []) as Array<{ antennes: LigneAntenneAvecId }>

  return {
    id: data.id as string,
    date: data.date as string,
    heure: data.heure as string | null,
    theme: data.theme as string | null,
    enseignantMembreId: data.enseignant_membre_id as string | null,
    enseignantMembre: membreBrefDeLigne(data.enseignant as LigneMembreBref),
    enseignantLibre: data.enseignant_libre as string | null,
    moderateurMembreId: data.moderateur_membre_id as string | null,
    moderateurMembre: membreBrefDeLigne(data.moderateur as LigneMembreBref),
    moderateurLibre: data.moderateur_libre as string | null,
    etat: data.etat as EtatSeanceAel,
    calendrierId: data.calendrier_id as string | null,
    generePourLe: data.genere_pour_le as string | null,
    antennes: antennesJonction.map((l) => {
      const brut = Array.isArray(l.antennes) ? (l.antennes[0] ?? null) : l.antennes
      if (!brut) {
        throw new Error("Forme inattendue renvoyée par seanceParId : antenne absente de l'embed.")
      }
      return { id: brut.id, nom: brut.nom }
    }),
  }
}

/**
 * Présences déjà pointées pour une séance, en carte `membreId -> present`. Un membre
 * absent de cette carte n'a simplement pas encore été pointé — ce n'est PAS la même
 * chose qu'un `present: false` explicite (D43 : chaque case cochée écrit sa propre
 * ligne, décocher écrit `present: false`, ne rien cocher n'écrit rien du tout).
 *
 * PARCOURT PAR LOTS jusqu'à épuisement (`presencesDeSeanceParLots`,
 * `src/lib/donnees/presences-lots.ts`) : voir le commentaire de ce module pour
 * pourquoi une lecture non bornée ici est le mode de défaillance le plus grave de
 * tout l'écran de pointage — une présence RÉELLE tronquée hors de cette carte se lit
 * comme une case vide, et le geste normal d'un modérateur pour la « corriger »
 * ÉCRASE le fait qui existait déjà.
 */
export async function presencesDeSeance(seanceId: string): Promise<Record<string, boolean>> {
  const supabase = await clientServeur()
  return presencesDeSeanceParLots(supabase, seanceId)
}

/**
 * Compteur AEL d'un membre, lu depuis la vue `compteurs_ael` (Task 9). `null` si la
 * ligne n'existe pas ou n'est pas visible par l'appelant — jamais un chiffre : voir le
 * §4.5 du design de la phase 3 (« un compte ordinaire interrogeant le compteur d'un
 * membre archivé ne verra simplement aucune ligne, jamais un chiffre »).
 */
export async function compteurAelMembre(membreId: string): Promise<number | null> {
  const supabase = await clientServeur()
  const { data, error } = await supabase
    .from('compteurs_ael')
    .select('total')
    .eq('membre_id', membreId)
    .maybeSingle()

  if (error) {
    throw new Error(`Lecture du compteur AEL impossible : ${error.message}`)
  }
  return data ? (data.total as number) : null
}
