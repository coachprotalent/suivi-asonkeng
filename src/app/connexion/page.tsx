import { FormulaireConnexion } from './formulaire-connexion'
import { MESSAGE_INSCRIPTION_REUSSIE } from './messages'

/**
 * Composant SERVEUR depuis la Task 14, alors qu'il était client. Motif : `sInscrire`
 * redirige ici avec `?inscrit=1` après une inscription réussie, ce qui PROMET un
 * accusé de réception — or un composant client ne lisait jamais `searchParams`, et
 * cette promesse n'atteignait donc jamais l'écran. Le formulaire, lui, reste client
 * (`formulaire-connexion.tsx`) : `useActionState` lui est indispensable pour
 * afficher les erreurs de `seConnecter`.
 *
 * Lire `searchParams` rend cette route dynamique — elle était prérendue. C'est le
 * prix assumé de l'accusé, et il est nul en pratique : une page de connexion n'a
 * rien à gagner à être mise en cache.
 */
export default async function PageConnexion({
  searchParams,
}: {
  searchParams: Promise<{ inscrit?: string }>
}) {
  const { inscrit } = await searchParams

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="mb-1 text-2xl font-semibold">Suivi Asonkeng</h1>
      <p className="mb-8 text-sm text-neutral-500">Connectez-vous pour continuer.</p>

      {inscrit === '1' ? (
        <p
          role="status"
          className="mb-6 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800"
        >
          {MESSAGE_INSCRIPTION_REUSSIE}
        </p>
      ) : null}

      <FormulaireConnexion />
    </main>
  )
}
