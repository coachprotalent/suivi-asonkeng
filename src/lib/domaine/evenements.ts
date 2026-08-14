/**
 * Règles pures de la phase 4 (design §6). AUCUN accès à la base : ce module est testé au
 * Vitest sans réseau, comme `ael.ts` et `arbre.ts`.
 *
 * `dirigeantPropose` (1c, `src/lib/domaine/arbre.ts`) est RÉUTILISÉ TEL QUEL par le
 * chemin 2 de la conversion, jamais réécrit ici : deux copies de cette règle seraient
 * deux occasions de la faire diverger.
 */

/** Les trois chemins de conversion, tels que la passerelle SQL les nomme. */
export type CheminConversion = 'fiche_en_attente' | 'fiche_active' | 'membre_existant'

export const CHEMINS_CONVERSION: readonly CheminConversion[] = [
  'fiche_en_attente',
  'fiche_active',
  'membre_existant',
]

export type MotifPeriodeInvalide = 'date_debut_manquante' | 'periode_incoherente'

/**
 * La règle de `evenements_periode_coherente`, DUPLIQUÉE À DESSEIN côté application pour
 * produire un message qui nomme le champ fautif AVANT d'écrire. Le `check` reste la
 * barrière ; ce contrôle explique. Motif établi par l'archivage en 1c, repris par D37
 * (phase 3).
 *
 * Comparaison de chaînes `AAAA-MM-JJ` et NON de `Date` : ces deux valeurs viennent d'un
 * `<input type="date">` et repartent vers une colonne Postgres `date` (D56). Les passer
 * par `new Date(...)` les interpréterait comme minuit UTC et rouvrirait exactement la
 * classe de défauts que `formaterDateSeule` a verrouillée par un invariant de test. Sur
 * un format à largeur fixe et à composantes décroissantes, l'ordre lexicographique EST
 * l'ordre chronologique.
 */
export function periodeValide(
  dateDebut: string | null,
  dateFin: string | null,
): MotifPeriodeInvalide | null {
  const debut = (dateDebut ?? '').trim()
  if (debut.length === 0) {
    return 'date_debut_manquante'
  }
  const fin = (dateFin ?? '').trim()
  if (fin.length === 0) {
    // Une date de fin absente est LÉGITIME (événement d'un seul jour) : le `check` en base
    // porte la même tolérance (`date_fin is null or ...`).
    return null
  }
  if (fin < debut) {
    return 'periode_incoherente'
  }
  return null
}

/**
 * Le prédicat de la liste « à traiter », isolé pour verrouiller la FORMULE contre une
 * régression silencieuse. LA VUE `participants_a_traiter` RESTE LA SEULE SOURCE DE VÉRITÉ
 * À L'EXÉCUTION : cette fonction n'est jamais employée pour filtrer une liste lue en base
 * — exactement le rôle que `compteurAel` joue vis-à-vis de `compteurs_ael`.
 *
 * Les trois conditions sont conjointes, et aucune n'est superflue : le désir exprimé fait
 * entrer dans la liste, la conversion l'en sort (D69), le classement aussi (D61) — et ce
 * sont les DEUX SEULES façons d'en sortir.
 */
export function estATraiter(entree: {
  desirSuiviSpirituel: boolean
  convertiEnMembreId: string | null
  classeLe: string | null
}): boolean {
  return (
    entree.desirSuiviSpirituel &&
    entree.convertiEnMembreId === null &&
    entree.classeLe === null
  )
}

/**
 * Moitié applicative de `participants_externes_classement_coherent` : un motif est valide
 * s'il reste quelque chose après `trim`. Un motif fait uniquement d'espaces est le cas
 * réel — un champ obligatoire au sens HTML accepte les espaces.
 */
export function motifClassementValide(motif: string | null): boolean {
  return (motif ?? '').trim().length > 0
}

/** Champs qu'un chemin de conversion exige, nommés comme les champs du formulaire. */
export type ChampConversion = 'nom' | 'prenom' | 'faiseur' | 'membreCible'

const REQUIS: Record<CheminConversion, readonly ChampConversion[]> = {
  // Chemin 1 : la fiche naît `en_attente` et une ligne `demandes_membre` d'origine
  // `conversion_participant` la fait entrer dans le circuit de validation de `/demandes`.
  // Elle y est validée par le bouton « Valider comme nouvelle personne », qui la passe à
  // `actif` — et à `actif` SEULEMENT : cette validation NE POSE AUCUN faiseur de disciple
  // pour cette origine, parce que l'administrateur qui convertit n'est pas le faiseur de
  // disciple de la personne convertie. Le rattachement à l'arbre est un geste SÉPARÉ, fait
  // ensuite depuis `/membres/<id>/arbre`. C'est pour cela qu'aucun faiseur n'est exigé ici.
  fiche_en_attente: ['nom', 'prenom'],
  // Chemin 2 : la fiche naît ACTIVE. Sans faiseur de disciple, elle naîtrait DÉTACHÉE de
  // l'arbre — visible dans l'annuaire, hors de toute portée d'autorité, et sans le moindre
  // signal. C'est le cas que le design nomme « une fiche muette plutôt qu'une erreur ».
  //
  // M13 DE LA REVUE FINALE — L'ASYMÉTRIE AVEC LE CHEMIN 1 EST RÉELLE, ET LA JUSTIFICATION
  // CI-DESSUS NE LA DISAIT PAS. Le chemin 1 aboutit LUI AUSSI, après validation, à une fiche
  // `actif` SANS FAISEUR DE DISCIPLE : exactement l'état que cette ligne-ci refuse pour le
  // chemin 2 en le qualifiant de « fiche muette ». La différence n'est donc pas dans l'état
  // atteint — il est le même — mais dans CE QUI SÉPARE LA SAISIE DE CET ÉTAT :
  //  - chemin 2 : la fiche est active À L'INSTANT DU CLIC, sans qu'aucun autre œil ne la
  //    voie. Le faiseur ne peut être exigé que LÀ, ou il ne le sera jamais ;
  //  - chemin 1 : la fiche passe par `/demandes`, où un administrateur la relit avant de la
  //    valider, et où son absence de rattachement est VISIBLE. Le rattachement à l'arbre est
  //    alors un geste séparé, assumé comme tel (D66).
  // Ce n'est donc pas un oubli, et ce n'est pas non plus une garantie : le chemin 1 HÉRITE
  // d'`auto_inscription` (2b) une fenêtre où une fiche active peut rester détachée si
  // personne ne fait le geste suivant. Dette ANTÉRIEURE à cette phase, dite ici pour qu'on
  // ne « corrige » pas l'asymétrie en croyant combler un trou, et pour que le trou réel —
  // qui est en 2b — ne se perde pas.
  fiche_active: ['nom', 'prenom', 'faiseur'],
  // Chemin 3 : aucune fiche n'est créée. Le nom et le prénom de la fiche cible existent
  // déjà et ne doivent surtout pas être écrasés par ceux du participant externe.
  membre_existant: ['membreCible'],
}

/**
 * Quels champs ce chemin exige. C'est LA SEULE RÈGLE RÉELLEMENT COMBINATOIRE DE LA PHASE,
 * et celle où une erreur produirait une fiche muette plutôt qu'une erreur — d'où sa mise
 * en table plutôt qu'en cascade de `if`.
 */
export function champsRequisConversion(chemin: CheminConversion): readonly ChampConversion[] {
  return REQUIS[chemin] ?? []
}

/**
 * Premier champ manquant pour ce chemin, ou `'chemin'` si le chemin lui-même est inconnu,
 * ou `null` si tout est là. Rend le PREMIER manquant et non la liste : un formulaire
 * signale une cause à la fois, et l'ordre de `REQUIS` est celui des champs à l'écran.
 *
 * `'chemin'` est un cas RÉEL et non défensif : `p_chemin` arrive d'un `<select>`, donc
 * d'une soumission qu'une requête forgée peut remplir de n'importe quoi. La passerelle SQL
 * le refuse aussi (marqueur `chemin_inconnu`) ; ce contrôle évite l'aller-retour.
 */
export function champManquantConversion(
  chemin: CheminConversion,
  valeurs: Partial<Record<ChampConversion, string | null>>,
): ChampConversion | 'chemin' | null {
  if (!CHEMINS_CONVERSION.includes(chemin)) {
    return 'chemin'
  }
  for (const champ of champsRequisConversion(chemin)) {
    if ((valeurs[champ] ?? '').trim().length === 0) {
      return champ
    }
  }
  return null
}
