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
 * ÉCART CONSTATÉ À LA CONSTRUCTION, absent du brief de la Task 14. Toutes les
 * autres pages à données du projet sont dynamiques *par accident heureux* : elles
 * lisent via `clientServeur()`, qui attend `cookies()`, une API dynamique. Celle-ci
 * est la SEULE à lire via `clientAdmin()` sans aucune session — elle ne touche donc
 * aucune API dynamique, et `next build` la prérendait intégralement : la liste des
 * antennes se figeait au moment de la construction, et une antenne créée ensuite
 * n'apparaissait JAMAIS dans le formulaire public jusqu'au déploiement suivant.
 * Sans erreur, sans test rouge.
 *
 * `revalidate` plutôt que `force-dynamic` : sur une page PUBLIQUE, une lecture en
 * base à chaque requête offrirait à un visiteur anonyme un levier d'amplification
 * gratuit. Une régénération toutes les 5 minutes borne le coût à une lecture par
 * fenêtre, quel que soit le trafic, et reste très en deçà du rythme auquel une
 * antenne est créée.
 *
 * Cela ne rouvre AUCUN oracle (D30) : ce qui est mis en cache ici ne dépend, par
 * construction, d'aucune saisie — surtout pas du code d'inscription, qui n'est lu
 * que par la Server Action, jamais par cette page.
 */
export const revalidate = 300

export default async function PageInscription() {
  const antennes = await listerAntennesPubliques()

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <h1 className="mb-1 text-2xl font-semibold">Inscription</h1>
      <p className="mb-8 text-sm text-neutral-500">
        Munissez-vous du code fourni par un administrateur de l&apos;équipe.
      </p>
      <FormulaireInscription antennes={antennes} />
    </main>
  )
}
