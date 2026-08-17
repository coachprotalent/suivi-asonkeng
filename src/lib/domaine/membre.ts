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
  /**
   * Personne en bonne relation avec ce membre (phase 7, D130).
   *
   * ELLE VIT ICI, ET PAS AVEC L'ARBRE, ET CE N'EST PAS UN RANGEMENT ARBITRAIRE. Le faiseur
   * de disciple et le dirigeant sont ABSENTS de ce type : ils s'écrivent par
   * `public.definir_arbre`, qui prend le verrou consultatif anti-cycle. Le contact, lui,
   * s'écrit par le même `update` que le téléphone et la ville — il n'entre dans aucune
   * remontée d'arbre (D131) et ne confère aucun droit (D132).
   */
  contactId: string | null
  situation: SituationMembre | null
  domaineEtude: string | null
  reportInitialAel: number
}

/**
 * Les SEULS champs de fiche qu'un compte peut modifier LUI-MÊME (phase 7, D138).
 *
 * Ce type n'est pas une commodité : c'est la moitié APPLICATIVE de la liste blanche de
 * l'auto-édition. L'autre moitié, structurelle, est la signature de
 * `public.modifier_mon_profil`, qui ne prend même pas en paramètre ce qui doit rester
 * fermé. Nom, prénom, antenne, place dans l'arbre, contact, report AEL, état, et TOUTE
 * colonne de `profils` restent réservés à l'administrateur.
 *
 * Le sous-ensemble est CHOISI, pas trouvé : ce sont les champs que la personne connaît
 * mieux que l'administrateur, et dont une saisie fautive n'a aucun effet de sécurité.
 */
export type CoordonneesPersonnelles = {
  telephone: string | null
  emailContact: string | null
  ville: string | null
  pays: string | null
  situation: SituationMembre | null
  domaineEtude: string | null
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

/**
 * Validation PARTAGÉE par `normaliserFicheMembre` (administrateur, fiche entière) et par
 * `coordonneesPersonnellesDepuisFormData` (compte ordinaire, ses seules coordonnées).
 *
 * ═══ UNE SEULE COPIE, ET C'EST LE POINT ═══
 * Le format d'adresse et la règle « domaine d'étude réservé à l'étudiant » doivent dire la
 * MÊME chose des deux côtés. Recopiées, elles divergeraient au premier changement, et
 * l'écran de profil accepterait ce que l'écran d'administration refuse — ou l'inverse, plus
 * traître encore : une adresse acceptée à l'auto-édition mais refusée à la modification
 * ferait échouer un administrateur sur une fiche qu'il n'a pas saisie.
 *
 * EXTRAITE du corps de `normaliserFicheMembre` à comportement RIGOUREUSEMENT identique
 * (phase 7, tâche 2) — les quinze preuves préexistantes de `membre.test.ts` sont passées
 * sans être retouchées, et c'est ce qui l'établit.
 */
function normaliserCoordonnees(brut: Record<string, unknown>): CoordonneesPersonnelles {
  const situationBrute = texteOptionnel(brut.situation)
  if (situationBrute !== null && !SITUATIONS.includes(situationBrute as SituationMembre)) {
    throw new FicheMembreInvalideError(`situation inconnue : « ${situationBrute} »`)
  }
  const situation = (situationBrute as SituationMembre | null) ?? null

  const emailContact = texteOptionnel(brut.emailContact)
  if (emailContact !== null && !FORMAT_EMAIL.test(emailContact)) {
    throw new FicheMembreInvalideError("l'adresse de contact n'a pas un format valide")
  }

  return {
    telephone: texteOptionnel(brut.telephone),
    emailContact,
    ville: texteOptionnel(brut.ville),
    pays: texteOptionnel(brut.pays),
    situation,
    // Un domaine d'étude n'a de sens que pour un étudiant : le conserver ailleurs
    // laisserait traîner une information fausse après un changement de situation.
    domaineEtude: situation === 'etudiant' ? texteOptionnel(brut.domaineEtude) : null,
  }
}

/**
 * Lit les SIX champs auto-modifiables depuis un FormData (phase 7, D138).
 *
 * ═══ ELLE NE LIT QUE CES SIX-LÀ ═══
 * Un `nom`, un `antenneId` ou un `contactId` présents dans le formulaire — onglet resté
 * ouvert, requête forgée, appel direct — ne sont pas « ignorés par prudence » : ils ne sont
 * JAMAIS LUS. La différence n'est pas rhétorique. « Ignorer » suppose une liste noire, qui
 * s'oublie d'être complétée ; ne pas lire suppose une liste blanche, qui s'oublie d'être
 * élargie — et l'oubli, dans ce sens-là, ferme au lieu d'ouvrir.
 *
 * Une preuve dédiée mesure l'ensemble EXACT des clés rendues (`membre.test.ts`) : un champ
 * ajouté ici sans passer par la revue de sécurité du lot B la ferait tomber.
 */
export function coordonneesPersonnellesDepuisFormData(donnees: FormData): CoordonneesPersonnelles {
  return normaliserCoordonnees({
    telephone: donnees.get('telephone'),
    emailContact: donnees.get('emailContact'),
    ville: donnees.get('ville'),
    pays: donnees.get('pays'),
    situation: donnees.get('situation'),
    domaineEtude: donnees.get('domaineEtude'),
  })
}

export function normaliserFicheMembre(brut: Record<string, unknown>): FicheMembre {
  const nom = texteObligatoire(brut.nom, 'nom')
  const prenom = texteObligatoire(brut.prenom, 'prénom')
  const coordonnees = normaliserCoordonnees(brut)

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
    ...coordonnees,
    antenneId: texteOptionnel(brut.antenneId),
    // Aucune validation de format : c'est un identifiant, et la clé étrangère
    // `membres_contact_id_fkey` en est juge. Même traitement qu'`antenneId`, juste
    // au-dessus, et pour la même raison. Le contrôle amont de `src/app/membres/actions.ts`
    // (D136) existe pour NOMMER un contact introuvable, pas pour le valider ici.
    contactId: texteOptionnel(brut.contactId),
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
    contactId: donnees.get('contactId'),
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
    contact_id: fiche.contactId,
    situation: fiche.situation,
    domaine_etude: fiche.domaineEtude,
    report_initial_ael: fiche.reportInitialAel,
  }
}

/**
 * Ce qu'on affiche à la place d'un nom qu'on n'a pas le droit de lire (D98, D100).
 *
 * Exporté : la preuve Vitest et les deux écrans doivent parler du MÊME texte. Recopier la
 * chaîne à trois endroits en ferait trois vérités.
 */
export const LIBELLE_FICHE_NON_CONSULTABLE = 'Fiche non consultable'

/**
 * Libellé d'une fiche désignée par un identifiant et lue SOUS RLS (D100).
 *
 * - identifiant `null` → `null` : il n'y a personne à désigner. L'appelant affiche « — ».
 * - fiche lue → le nom complet.
 * - identifiant PRÉSENT mais fiche ABSENTE de la lecture RLS → `'Fiche non consultable'`.
 *
 * ═══ POURQUOI LE TROISIÈME CAS N'EST PAS « — » ═══
 * Si l'identifiant existe mais que la lecture rend `null`, ce n'est PAS « personne » :
 * c'est une fiche que la politique cache à ce compte (typiquement archivée, vue par un
 * compte ordinaire). Confondre les deux afficherait « — » là où un administrateur voit un
 * nom sur la même fiche — exactement l'inverse de D20, qui rend la filiation visible de
 * tout compte actif. La 1c a tranché cela sur la fiche membre, la phase 3 sur
 * l'intervenant d'une séance, la phase 4 sur un participant. Même réponse, quatrième fois,
 * et désormais UN SEUL endroit.
 *
 * EXTRAITE de `/membres/[id]/page.tsx` (elle s'y appelait `libelleFiliation`) à
 * comportement RIGOUREUSEMENT identique.
 */
export function libelleFiche(
  identifiant: string | null,
  bref: { prenom: string; nom: string } | null,
): string | null {
  if (!identifiant) {
    return null
  }
  if (!bref) {
    return LIBELLE_FICHE_NON_CONSULTABLE
  }
  return `${bref.prenom} ${bref.nom}`
}
