/**
 * Message unique et indifférencié : ne jamais révéler si un identifiant existe
 * ni si un compte est désactivé (spec §7).
 *
 * Isolé dans son propre module (plutôt que dans `actions.ts`) car un fichier
 * `'use server'` ne peut exporter que des fonctions asynchrones sous Next.js 16 :
 * une constante exportée directement depuis un fichier d'actions fait échouer
 * le build Turbopack.
 */
export const MESSAGE_ECHEC_CONNEXION = 'Identifiant ou mot de passe incorrect.'
