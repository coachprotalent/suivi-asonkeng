const FORMAT_DATE = /^\d{4}-\d{2}-\d{2}$/
const LONGUEUR_NOTE_MAXIMALE = 500

export class StatutInvalideError extends Error {
  constructor(raison: string) {
    super(raison)
    this.name = 'StatutInvalideError'
  }
}

function texteOuNull(brut: unknown, champ: string): string | null {
  if (brut === null || brut === undefined) return null
  if (typeof brut !== 'string') {
    throw new StatutInvalideError(`Le champ « ${champ} » a reçu une valeur inattendue.`)
  }
  const nettoye = brut.trim()
  return nettoye.length === 0 ? null : nettoye
}

/**
 * Date d'acquisition au format `AAAA-MM-JJ`, ou `null` si non renseignée.
 *
 * Une date future est refusée : un statut se constate, il ne se planifie pas.
 * Une date inexistante au calendrier l'est aussi — `2025-02-30` passerait une
 * simple vérification de forme et deviendrait une autre date en base.
 */
export function normaliserDateAcquisition(brut: unknown): string | null {
  const valeur = texteOuNull(brut, "date d'acquisition")
  if (valeur === null) return null

  if (!FORMAT_DATE.test(valeur)) {
    throw new StatutInvalideError("La date doit être au format AAAA-MM-JJ.")
  }

  const [annee, mois, jour] = valeur.split('-').map(Number)
  const date = new Date(Date.UTC(annee, mois - 1, jour))
  const existe =
    date.getUTCFullYear() === annee && date.getUTCMonth() === mois - 1 && date.getUTCDate() === jour
  if (!existe) {
    throw new StatutInvalideError("Cette date n'existe pas au calendrier.")
  }

  const aujourdhui = new Date().toISOString().slice(0, 10)
  if (valeur > aujourdhui) {
    throw new StatutInvalideError("La date d'acquisition ne peut pas être dans le futur.")
  }

  return valeur
}

/** Note libre accompagnant un statut, ou `null`. */
export function normaliserNote(brut: unknown): string | null {
  const valeur = texteOuNull(brut, 'note')
  if (valeur !== null && valeur.length > LONGUEUR_NOTE_MAXIMALE) {
    throw new StatutInvalideError(
      `La note ne doit pas dépasser ${LONGUEUR_NOTE_MAXIMALE} caractères.`,
    )
  }
  return valeur
}

/**
 * Forme MINIMALE d'un groupe du catalogue, telle que la couche domaine en a besoin.
 *
 * Structurellement compatible avec `GroupeStatut` de `src/lib/donnees/statuts.ts` : on
 * lui passe directement ce que `listerCatalogue` rend, sans fonction de traduction. La
 * couche domaine ne dépend ainsi d'AUCUN module de données (§8 de la spécification).
 */
export type GroupeCatalogue = {
  id: string
  nom: string
  exclusif: boolean
  statuts: ReadonlyArray<{ id: string; libelle: string }>
}

/** Le couple fautif, NOMMÉ : sans les deux libellés, l'utilisateur sait qu'il a tort
 *  sans savoir lequel des deux statuts retirer. */
export type CoupleIncompatible = { groupe: string; premier: string; second: string }

/**
 * Deux statuts d'un MÊME GROUPE EXCLUSIF dans une même sélection (D84).
 *
 * Rend le couple fautif, ou `null` si la sélection est cohérente.
 *
 * CETTE FONCTION EXPLIQUE ; LA PASSERELLE `public.creer_membre_enrichi` PROTÈGE. Deux
 * barrières, doctrine du projet depuis la 1b. La passerelle relit les groupes EN BASE et
 * ne fait confiance à aucune liste venue de l'écran ; celle-ci sert à nommer les deux
 * statuts avant même d'écrire.
 *
 * ÉCHEC FERMÉ, ET SA PORTÉE EXACTE. Un identifiant absent du catalogue fourni LÈVE, il
 * n'est jamais ignoré : `listerCatalogue` est non bornée, et un catalogue tronqué ne doit
 * pas se lire comme « aucun conflit détecté ». C'est la même famille de mensonge
 * silencieux que la troncature `max_rows`. MAIS l'échec fermé n'est PAS TOTAL, et il ne
 * faut pas le croire tel : cette fonction RETOURNE au premier couple exclusif trouvé, donc
 * un identifiant inconnu situé APRÈS ce couple dans la sélection n'est jamais examiné.
 * C'est sans conséquence ici — le retour est déjà un refus, et l'appelant s'arrête —, mais
 * quiconque ferait de cette fonction un validateur de sélection devrait la relire en deux
 * passes : indexation et vérification d'appartenance d'abord, détection du couple ensuite.
 *
 * Un même statut sélectionné DEUX FOIS n'est pas un couple exclusif : c'est un doublon,
 * traité plus loin par l'upsert de `prive.attribuer_statut`, qui ne journalise aucun
 * second « ajout ». On compare donc les IDENTIFIANTS, jamais les libellés.
 */
export function statutsIncompatibles(
  selection: readonly string[],
  catalogue: readonly GroupeCatalogue[],
): CoupleIncompatible | null {
  const index = new Map<
    string,
    { libelle: string; groupeId: string; groupeNom: string; exclusif: boolean }
  >()
  for (const groupe of catalogue) {
    for (const statut of groupe.statuts) {
      index.set(statut.id, {
        libelle: statut.libelle,
        groupeId: groupe.id,
        groupeNom: groupe.nom,
        exclusif: groupe.exclusif,
      })
    }
  }

  const premierDuGroupe = new Map<string, { id: string; libelle: string }>()
  for (const identifiant of selection) {
    const entree = index.get(identifiant)
    if (!entree) {
      throw new StatutInvalideError(
        "Un statut sélectionné est introuvable dans le catalogue. La sélection est refusée : recommencez la sélection des statuts.",
      )
    }
    if (!entree.exclusif) {
      continue
    }
    const deja = premierDuGroupe.get(entree.groupeId)
    if (!deja) {
      premierDuGroupe.set(entree.groupeId, { id: identifiant, libelle: entree.libelle })
      continue
    }
    if (deja.id !== identifiant) {
      return { groupe: entree.groupeNom, premier: deja.libelle, second: entree.libelle }
    }
  }
  return null
}

/** Une ligne de statut telle qu'elle est saisie à la création d'un membre. */
export type LigneStatutSaisie = {
  statutId: string
  dateAcquisition: string | null
  note: string | null
}

/**
 * Lit les lignes de statut d'un formulaire de création enrichie.
 *
 * TROIS CHAMPS RÉPÉTÉS, ALIGNÉS PAR INDICE — `statutId`, `statutDateAcquisition`,
 * `statutNote` — et NON un unique champ JSON. Un JSON venu du navigateur devrait être
 * analysé ici, et une clé mal orthographiée y deviendrait `undefined` en silence :
 * exactement le mode de défaillance que la passerelle SQL évite en typant ses colonnes.
 * Trois `getAll` alignés rendent la même information sans analyse, et l'alignement tient
 * PAR CONSTRUCTION tant que le composant rend les trois champs pour chaque ligne — un
 * champ vide est quand même soumis, avec une chaîne vide.
 *
 * Le contrôle ci-dessous n'est donc pas décoratif : il est la seule chose qui distingue
 * « le composant a changé » d'un décalage silencieux qui associerait la date d'une ligne au
 * statut d'une autre. CE QU'IL ATTRAPE, EXACTEMENT, ET RIEN DE PLUS : il compare des
 * LONGUEURS. Un champ manquant ou en trop tombe ; une PERMUTATION à cardinalité égale — le
 * composant rendrait les dates dans un autre ordre que les statuts — passerait sans être
 * vue. Aucun contrôle de longueur ne peut voir cela ; seule la discipline « ne jamais
 * rendre une ligne partielle, et toujours les trois champs dans le même ordre » le peut,
 * et c'est pourquoi elle est écrite en tête du composant.
 *
 * Une ligne SANS statut choisi est REFUSÉE, jamais ignorée : l'ignorer ferait disparaître
 * en silence la date et la note qui l'accompagnent, et l'utilisateur croirait avoir
 * enregistré ce qu'il a saisi.
 */
export function lignesStatutsDepuisFormData(donnees: FormData): LigneStatutSaisie[] {
  const identifiants = donnees.getAll('statutId')
  const dates = donnees.getAll('statutDateAcquisition')
  const notes = donnees.getAll('statutNote')

  if (identifiants.length !== dates.length || identifiants.length !== notes.length) {
    throw new StatutInvalideError(
      "La saisie des statuts est incohérente : recommencez la sélection des statuts.",
    )
  }

  const lignes: LigneStatutSaisie[] = []
  for (let indice = 0; indice < identifiants.length; indice += 1) {
    const brut = identifiants[indice]
    const identifiant = typeof brut === 'string' ? brut.trim() : ''
    if (identifiant.length === 0) {
      throw new StatutInvalideError(
        "Une ligne de statut n'a pas de statut choisi : choisissez-en un, ou retirez la ligne.",
      )
    }
    lignes.push({
      statutId: identifiant,
      dateAcquisition: normaliserDateAcquisition(dates[indice]),
      note: normaliserNote(notes[indice]),
    })
  }
  return lignes
}
