export const MESSAGE_CHAMPS_OBLIGATOIRES =
  "Le code, l'identifiant, le mot de passe, le nom et le prénom sont obligatoires."
export const MESSAGE_MDP_TROP_COURT = 'Le mot de passe est trop court.'
export const MESSAGE_IDENTIFIANT_PRIS = 'Cet identifiant est déjà utilisé.'
// D30 : message UNIQUE pour les quatre causes de refus d'un token (inconnu, expiré,
// révoqué, déjà utilisé). NE JAMAIS en introduire un second pour l'une de ces
// causes : ce serait recréer l'oracle que ce message unique existe pour fermer.
export const MESSAGE_CODE_INVALIDE = "Ce code n'est pas valide."
export const MESSAGE_TROP_DE_TENTATIVES =
  'Trop de tentatives récentes. Réessayez plus tard.'
export const MESSAGE_ECHEC_INSCRIPTION = "L'inscription n'a pas pu aboutir."

const STATUT_TROP_DE_TENTATIVES = 'trop_de_tentatives'

/**
 * Traduit le `statut` rendu par `consommer_token_inscription`
 * (`'invalide'` \| `'trop_de_tentatives'` — jamais appelée pour `'ok'`, voir
 * `sInscrire`) en message affiché. Pure, testée sans base (design 2b §10).
 *
 * `consommer_token_inscription` NE LÈVE PAS pour un refus métier (migration
 * 20260815160000 : une première rédaction levait une exception, ce qui annulait
 * l'insertion de la tentative elle-même et rendait le plafond de D34/D36
 * inopérant — voir l'en-tête de cette migration). Cette fonction lit donc
 * `data[0].statut`, jamais `error.details`.
 *
 * `'invalide'`, ET TOUT STATUT INCONNU, rendent le MÊME message uniforme (D30) :
 * aucune branche supplémentaire ne doit jamais être ajoutée ici pour l'une des
 * quatre causes distinguées côté SQL (code inconnu, expiré, révoqué, déjà
 * utilisé) — les quatre partagent déjà le même statut `invalide` à la source
 * (voir tests/rls/tokens-inscription.test.ts, bloc « RÉCAPITULATIF »), et cette
 * fonction ne fait que refléter fidèlement cette uniformité, pas la créer.
 *
 * L'INDISCERNABILITÉ EXIGÉE PAR D30 PORTE SUR CE QUE VOIT L'UTILISATEUR, PAS SUR
 * CE QUE REÇOIT NOTRE PROPRE SERVEUR : `sInscrire` journalise `statut` tel quel
 * (`console.error`) AVANT d'appeler cette fonction — précieux au diagnostic — mais
 * cette fonction-ci ne doit JAMAIS, elle, distinguer une cause de l'autre dans le
 * texte rendu à l'écran.
 */
export function messageErreurConsommation(statut: string | null | undefined): string {
  if (statut === STATUT_TROP_DE_TENTATIVES) {
    return MESSAGE_TROP_DE_TENTATIVES
  }
  return MESSAGE_CODE_INVALIDE
}
