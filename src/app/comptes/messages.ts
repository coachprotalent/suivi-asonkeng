export const MESSAGE_ECHEC_COMPTE = "Le compte n'a pas pu être créé."
export const MESSAGE_IDENTIFIANT_PRIS = 'Cet identifiant est déjà utilisé.'
export const MESSAGE_CHAMPS_OBLIGATOIRES = "L'identifiant et le nom d'affichage sont obligatoires."
export const MESSAGE_ECHEC_LIAISON = "La fiche n'a pas pu être liée à ce compte."
export const MESSAGE_FICHE_DEJA_LIEE = 'Cette fiche est déjà liée à un autre compte.'
export const MESSAGE_RACINE_SANS_FICHE =
  "Le compte racine ne peut pas être lié à une fiche : il n'a pas de place dans l'arbre."
// Chaîne TypeScript et non JSX : on écrit des apostrophes DROITES, jamais `&apos;`,
// qui s'afficherait littéralement à l'écran. Guillemets doubles, comme l'exige la
// contrainte globale 5.
export const MESSAGE_DERNIER_ADMINISTRATEUR =
  "Il doit rester au moins un administrateur actif. Donnez le rôle à quelqu'un d'autre avant de le retirer ici."
export const MESSAGE_COMPTE_INCONNU = "Ce compte n'existe plus."
export const MESSAGE_ECHEC_ROLES = "Les rôles n'ont pas pu être enregistrés."
export const MESSAGE_ECHEC_ACTIVATION = "L'état du compte n'a pas pu être changé."
export const MESSAGE_ECHEC_REINITIALISATION = "Le mot de passe n'a pas pu être réinitialisé."

export const MESSAGE_ECHEC_SUPPRESSION = "Ce compte n'a pas pu être supprimé."

/**
 * Un administrateur ne supprime pas son propre compte (phase 8, D160).
 *
 * ⚠️ CE REFUS N'EST PAS UNE BARRIÈRE DE BASE, ET LE DIRE IMPORTE. Le déclencheur
 * `profils_refuser_suppression` ne peut pas voir QUI supprime : appelé derrière la clé de
 * service, `auth.uid()` y vaut `null`. Ce garde vit donc dans la Server Action, et lui seul —
 * une requête forgée par un administrateur contre lui-même passerait. La conséquence serait
 * un administrateur qui se supprime : désagréable, jamais dangereuse, et le cas
 * catastrophique (plus aucun administrateur actif) reste tenu EN BASE par l'autre refus.
 */
export const MESSAGE_SUPPRESSION_DE_SOI =
  'Vous ne pouvez pas supprimer votre propre compte. Demandez à un autre administrateur de le faire.'

export const MESSAGE_RACINE_INDESTRUCTIBLE =
  "Le compte racine ne peut pas être supprimé : c'est lui qui garantit qu'un accès subsiste."
