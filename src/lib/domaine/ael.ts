/** 1 = lundi ... 7 = dimanche, convention ISO-8601 (spec §4.5). */
export type JourSemaine = 1 | 2 | 3 | 4 | 5 | 6 | 7

export type EtatSeanceAel = 'prevue' | 'tenue' | 'annulee'

/**
 * Horizon glissant de la génération des séances (D28, D40) : constante applicative,
 * pas une donnée éditable en base — même famille que `TAILLE_PAGE_ANNUAIRE` et
 * `LIMITE_SELECTEUR` de la 1c. Valeur retenue par décision utilisateur du 2026-08-13.
 */
export const HORIZON_GENERATION_SEMAINES = 8

export type CalendrierRecurrent = {
  jourSemaine: JourSemaine
  actif: boolean
}

function dateUtc(iso: string): Date {
  const [annee, mois, jour] = iso.split('-').map(Number)
  return new Date(Date.UTC(annee, mois - 1, jour))
}

function formaterIso(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function ajouterJours(date: Date, jours: number): Date {
  return new Date(date.getTime() + jours * 86_400_000)
}

/** Convention ISO (1 = lundi ... 7 = dimanche) vers la convention JS (0 = dimanche ... 6 = samedi). */
function versJourJs(jourSemaine: JourSemaine): number {
  return jourSemaine % 7
}

/** Première date, à partir de `depuis` inclus, tombant sur `jourSemaine`. */
function premiereOccurrence(depuis: Date, jourSemaine: JourSemaine): Date {
  const cible = versJourJs(jourSemaine)
  const delta = (cible - depuis.getUTCDay() + 7) % 7
  return ajouterJours(depuis, delta)
}

/**
 * Dates d'occurrence d'un calendrier récurrent, dans la fenêtre `[aPartirDe, aPartirDe +
 * horizonSemaines semaines]`, bornes incluses.
 *
 * Un calendrier `actif = false` ne produit RIEN (spec design phase 3, §5) : une antenne
 * qui suspend un créneau ne doit générer aucune séance tant qu'il n'est pas réactivé
 * (Task 13).
 *
 * Fonction PURE, sans accès base : elle reçoit un `CalendrierRecurrent` déjà lu, jamais
 * un identifiant. `genererSeances` (Task 14) l'appelle une fois par calendrier ACTIF
 * lu depuis `calendriersActifs` (Task 12), sans jamais fusionner deux calendriers dans
 * un même appel (D41) — deux calendriers de jours différents ne se mélangent donc
 * jamais, par construction de la boucle appelante, pas par un filtre ici.
 */
export function calculerOccurrences(
  calendrier: CalendrierRecurrent,
  aPartirDe: string,
  horizonSemaines: number,
): string[] {
  if (!calendrier.actif) {
    return []
  }

  const debut = dateUtc(aPartirDe)
  const fin = ajouterJours(debut, horizonSemaines * 7)
  const occurrences: string[] = []

  let curseur = premiereOccurrence(debut, calendrier.jourSemaine)
  while (curseur.getTime() <= fin.getTime()) {
    occurrences.push(formaterIso(curseur))
    curseur = ajouterJours(curseur, 7)
  }
  return occurrences
}

/**
 * Compteur AEL d'un membre (spec §4.2, §4.5, D4) : report initial + présences
 * enregistrées aux séances tenues.
 *
 * Isolée de la vue SQL `compteurs_ael` (migration 20260817130000) qui l'exécute
 * réellement en production — cette fonction verrouille la FORMULE contre une
 * régression silencieuse, au même coût que les autres fonctions pures du projet. La vue
 * reste la seule source de vérité à l'exécution.
 */
export function compteurAel(reportInitial: number, presencesTenues: number): number {
  return reportInitial + presencesTenues
}

export type SeancePourCompletude = {
  theme: string | null
  enseignantMembreId: string | null
  enseignantLibre: string | null
}

export type ChampManquantSeance = 'theme' | 'enseignant' | null

/**
 * Même règle que le déclencheur `seances_ael_tenue_complete` (migrations 20260817120000
 * et 20260817150000), DUPLIQUÉE À DESSEIN côté application (D37) : le déclencheur reste
 * la barrière, cette fonction produit, avant d'écrire, un message qui nomme le champ
 * manquant — motif déjà établi par l'archivage bloqué en 1c. Elle ne remplace pas le
 * déclencheur et ne dispense d'aucune de ses preuves ; une divergence entre les deux
 * resterait fermée par le déclencheur, jamais silencieusement ouverte par cette
 * fonction.
 */
export function seanceEstComplete(seance: SeancePourCompletude): ChampManquantSeance {
  if (!seance.theme || seance.theme.trim().length === 0) {
    return 'theme'
  }
  if (
    !seance.enseignantMembreId &&
    (!seance.enseignantLibre || seance.enseignantLibre.trim().length === 0)
  ) {
    return 'enseignant'
  }
  return null
}
