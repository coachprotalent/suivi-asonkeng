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

/**
 * Accusé de réception affiché après une inscription réussie, quand `sInscrire`
 * redirige ici avec `?inscrit=1` (`src/app/inscription/actions.ts`).
 *
 * Ce paramètre a d'abord été posé SANS que rien ne l'affiche : la page était un
 * composant client qui ne lisait jamais `searchParams`, et la promesse d'accusé
 * n'atteignait donc jamais l'écran — le défaut récurrent du projet, cette fois sur
 * le chemin de succès. La page est désormais un composant serveur qui lit le
 * paramètre ; ce message est ce qu'il rend.
 */
export const MESSAGE_INSCRIPTION_REUSSIE =
  'Votre compte a bien été créé. Connectez-vous avec les identifiants que vous venez de choisir.'
