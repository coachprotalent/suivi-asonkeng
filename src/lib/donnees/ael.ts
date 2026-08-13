import 'server-only'
import type { EtatSeanceAel, JourSemaine } from '@/lib/domaine/ael'
import type { MembreBref } from '@/lib/donnees/membres'
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

/** Tous les calendriers, actifs et désactivés, triés par état puis jour de semaine. */
export async function listerCalendriers(): Promise<CalendrierAel[]> {
  const supabase = await clientServeur()
  const { data, error } = await supabase
    .from('calendriers_ael')
    .select('id, antenne_id, jour_semaine, heure, actif, antennes(nom)')
    .order('actif', { ascending: false })
    .order('jour_semaine')

  if (error) {
    throw new Error(`Lecture des calendriers AEL impossible : ${error.message}`)
  }
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
  const { data, error } = await supabase
    .from('calendriers_ael')
    .select('id, antenne_id, jour_semaine, heure, actif, antennes!inner(actif)')
    .eq('actif', true)
    .eq('antennes.actif', true)

  if (error) {
    throw new Error(`Lecture des calendriers actifs impossible : ${error.message}`)
  }
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

/** Toutes les séances, à venir et passées, les plus récentes en premier. */
export async function listerSeances(): Promise<SeanceAelListe[]> {
  const supabase = await clientServeur()
  const { data, error } = await supabase
    .from('seances_ael')
    .select('id, date, heure, theme, etat, seances_ael_antennes(antennes(nom))')
    .order('date', { ascending: false })

  if (error) {
    throw new Error(`Lecture des séances AEL impossible : ${error.message}`)
  }
  return (data ?? []).map((l) => ({
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
 */
export async function presencesDeSeance(seanceId: string): Promise<Record<string, boolean>> {
  const supabase = await clientServeur()
  const { data, error } = await supabase
    .from('presences_ael')
    .select('membre_id, present')
    .eq('seance_id', seanceId)

  if (error) {
    throw new Error(`Lecture des présences impossible : ${error.message}`)
  }
  const resultat: Record<string, boolean> = {}
  for (const ligne of data ?? []) {
    resultat[ligne.membre_id as string] = ligne.present as boolean
  }
  return resultat
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
