export type SituationMembre = 'etudiant' | 'travailleur' | 'autre'
export type EtatMembre = 'en_attente' | 'actif' | 'archive'

const SITUATIONS: readonly SituationMembre[] = ['etudiant', 'travailleur', 'autre']

/** Contrôle volontairement permissif : on écarte les saisies manifestement fautives, pas plus. */
const FORMAT_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export class FicheMembreInvalideError extends Error {
  constructor(raison: string) {
    super(`Fiche invalide : ${raison}`)
    this.name = 'FicheMembreInvalideError'
  }
}

export type FicheMembre = {
  nom: string
  prenom: string
  telephone: string | null
  emailContact: string | null
  ville: string | null
  pays: string | null
  antenneId: string | null
  situation: SituationMembre | null
  domaineEtude: string | null
  reportInitialAel: number
}

function texteObligatoire(valeur: unknown, champ: string): string {
  const nettoye = typeof valeur === 'string' ? valeur.trim() : ''
  if (nettoye.length === 0) {
    throw new FicheMembreInvalideError(`le champ « ${champ} » est obligatoire`)
  }
  return nettoye
}

function texteOptionnel(valeur: unknown): string | null {
  // Absent et vide sont légitimes ; toute autre forme est une anomalie qu'il vaut
  // mieux signaler que ramener silencieusement à `null`. Un `antenneId` avalé sans
  // bruit détacherait un membre de son antenne sans que personne ne le voie.
  if (valeur === null || valeur === undefined) return null
  if (typeof valeur !== 'string') {
    throw new FicheMembreInvalideError('un champ texte a reçu une valeur inattendue')
  }
  const nettoye = valeur.trim()
  return nettoye.length === 0 ? null : nettoye
}

export function normaliserFicheMembre(brut: Record<string, unknown>): FicheMembre {
  const nom = texteObligatoire(brut.nom, 'nom')
  const prenom = texteObligatoire(brut.prenom, 'prénom')

  const situationBrute = texteOptionnel(brut.situation)
  if (situationBrute !== null && !SITUATIONS.includes(situationBrute as SituationMembre)) {
    throw new FicheMembreInvalideError(`situation inconnue : « ${situationBrute} »`)
  }
  const situation = (situationBrute as SituationMembre | null) ?? null

  const emailContact = texteOptionnel(brut.emailContact)
  if (emailContact !== null && !FORMAT_EMAIL.test(emailContact)) {
    throw new FicheMembreInvalideError("l'adresse de contact n'a pas un format valide")
  }

  const report = brut.reportInitialAel ?? 0
  const reportInitialAel = typeof report === 'number' ? report : Number(report)
  if (!Number.isInteger(reportInitialAel) || reportInitialAel < 0) {
    throw new FicheMembreInvalideError(
      "le nombre d'AEL déjà suivis doit être un entier positif ou nul",
    )
  }

  return {
    nom,
    prenom,
    telephone: texteOptionnel(brut.telephone),
    emailContact,
    ville: texteOptionnel(brut.ville),
    pays: texteOptionnel(brut.pays),
    antenneId: texteOptionnel(brut.antenneId),
    situation,
    // Un domaine d'étude n'a de sens que pour un étudiant : le conserver ailleurs
    // laisserait traîner une information fausse après un changement de situation.
    domaineEtude: situation === 'etudiant' ? texteOptionnel(brut.domaineEtude) : null,
    reportInitialAel,
  }
}

/** Lit une fiche membre depuis un FormData de formulaire, avant normalisation. */
export function ficheMembreDepuisFormData(donnees: FormData): FicheMembre {
  return normaliserFicheMembre({
    nom: donnees.get('nom'),
    prenom: donnees.get('prenom'),
    telephone: donnees.get('telephone'),
    emailContact: donnees.get('emailContact'),
    ville: donnees.get('ville'),
    pays: donnees.get('pays'),
    antenneId: donnees.get('antenneId'),
    situation: donnees.get('situation'),
    domaineEtude: donnees.get('domaineEtude'),
    reportInitialAel: donnees.get('reportInitialAel'),
  })
}

/** Traduit une `FicheMembre` normalisée en colonnes `snake_case` pour Supabase. */
export function ficheMembreVersColonnes(fiche: FicheMembre): Record<string, unknown> {
  return {
    nom: fiche.nom,
    prenom: fiche.prenom,
    telephone: fiche.telephone,
    email_contact: fiche.emailContact,
    ville: fiche.ville,
    pays: fiche.pays,
    antenne_id: fiche.antenneId,
    situation: fiche.situation,
    domaine_etude: fiche.domaineEtude,
    report_initial_ael: fiche.reportInitialAel,
  }
}
