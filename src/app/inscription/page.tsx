import { EnTetePage } from '@/composants/ui/en-tete-page'
import { listerAntennesPubliques } from '@/lib/donnees/antennes'
import { FormulaireInscription } from './formulaire-inscription'

/**
 * Server Component public, SANS SESSION (design 2b §6, §9). Aucun garde de
 * `src/lib/securite/garde.ts` : il n'existe aucun profil à exiger à ce stade.
 *
 * SEULE lecture de cette page : `listerAntennesPubliques`, exception documentée
 * (voir `src/lib/donnees/antennes.ts` et la Task 13 du plan) — une liste fixe,
 * publique, strictement indépendante du code d'inscription. Aucune AUTRE lecture
 * ne doit jamais être ajoutée ici : ni recherche de token, ni préremplissage, ni
 * indice sur le mode ou la validité d'un code (D30).
 */
/**
 * CETTE PAGE EST DYNAMIQUE, ET CE N'EST PAS UN CHOIX FAIT ICI — constat I2 de la
 * revue finale de branche, VÉRIFIÉ PAR CONSTRUCTION RÉELLE, pas déduit.
 *
 * Histoire, parce qu'elle explique pourquoi ce fichier a longtemps dit le
 * contraire. La Task 14 avait découvert que `next build` PRÉRENDAIT cette page
 * intégralement : toutes les autres pages à données du projet sont dynamiques
 * *par accident heureux* (elles lisent via `clientServeur()`, qui attend
 * `cookies()`), alors que celle-ci est la SEULE à lire via `clientAdmin()` sans
 * aucune session. La liste des antennes se figeait donc à la construction. Le
 * remède retenu fut `export const revalidate = 300`, assorti d'un raisonnement sur
 * l'amplification : sur une page publique, borner le coût à une lecture par
 * fenêtre de 5 minutes.
 *
 * PUIS LA TASK 18 A MONTÉ `<Cloche />` DANS LE LAYOUT RACINE. Ce composant appelle
 * `profilCourant()`, donc `cookies()` : TOUTE route du projet est devenue
 * dynamique, celle-ci comprise. `revalidate` ne cachait plus rien, et le
 * raisonnement écrit ici décrivait comme fermé un levier d'amplification
 * grand ouvert. Deux corrections justes, prises séparément, dont l'intersection
 * était un commentaire faux.
 *
 * CE QUI A ÉTÉ OBSERVÉ, ET NON SUPPOSÉ : `next build` classe les 20 routes en
 * `ƒ (Dynamic)`, `/inscription` comprise, et `.next/prerender-manifest.json` ne
 * contient plus que `/_global-error` et `/favicon.ico`. La CAUSE a été isolée par
 * mutation : `<Cloche />` retirée de `layout.tsx`, la même construction reclasse
 * `/inscription` en `○ (Static)` avec « Revalidate 5m ». C'est bien la cloche, et
 * elle seule, qui rend cette page dynamique.
 *
 * CONSÉQUENCE ASSUMÉE, ÉCRITE ICI POUR QUE PERSONNE N'AIT À LA REDÉCOUVRIR :
 * chaque GET anonyme sur cette page exécute `listerAntennesPubliques()` avec la
 * clé de service. C'est le levier d'amplification que `revalidate` prétendait
 * fermer. Il est modeste (une lecture de quatre colonnes sur une petite table) et
 * il a une contrepartie réelle : la liste des antennes est toujours fraîche. Mais
 * il est ouvert, et il l'est par un composant monté ailleurs — le supprimer
 * exigerait de sortir cette page de l'arbre de la cloche, décision qui ne
 * s'arbitre pas dans ce fichier.
 *
 * `revalidate` a donc été RETIRÉ plutôt que laissé : une directive inerte qui
 * décrit un régime de cache inexistant est précisément le défaut que ce projet
 * traque. Si `<Cloche />` quittait un jour le layout racine, cette page
 * redeviendrait prérendue et le défaut d'origine de la Task 14 réapparaîtrait —
 * d'où les `revalidatePath('/inscription')` conservés dans
 * `src/app/antennes/actions.ts`, sans effet aujourd'hui, mais qui rattraperaient
 * ce retour.
 */
export default async function PageInscription() {
  const antennes = await listerAntennesPubliques()

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-esp-6 py-esp-10">
      <EnTetePage
        titre="Inscription"
        soustitre="Munissez-vous du code fourni par un administrateur de l'équipe."
      />
      <FormulaireInscription antennes={antennes} />
    </main>
  )
}
