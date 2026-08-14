import Link from 'next/link'
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

      {/* LA PAGE PUBLIQUE D'INSCRIPTION N'ÉTAIT ATTEIGNABLE PAR AUCUN LIEN DU DÉPÔT
          (`grep -rn 'href="/inscription"' src/` rendait ZÉRO occurrence). Toute la phase 2b
          — création de compte par code, nominatif ou générique — est en production,
          fonctionnelle et éprouvée, et on ne pouvait y arriver qu'en tapant l'URL à la
          main. Même défaut que l'écran des membres d'une antenne en phase 3 : livré
          conforme, sans chemin de navigation. Sauf qu'ici la personne concernée est un
          NOUVEAU VENU, c'est-à-dire exactement celui qui ne devinera jamais une URL.

          LE LIBELLÉ DIT QU'IL FAUT UN CODE, ET CE N'EST PAS UN DÉTAIL DE FORMULATION : un
          simple « Créer un compte » enverrait vers un écran qui refuse tout le monde sauf
          les porteurs d'un code, et cet écran NE PEUT PAS dire pourquoi il refuse — le §7
          exige un message indifférencié qui ne révèle jamais qu'un code existe. Ce lien est
          donc LE SEUL ENDROIT de l'application où l'on puisse prévenir.

          Les deux routes sont déjà publiques dans le middleware (`ROUTE_CONNEXION` et
          `ROUTE_INSCRIPTION`, comparaison par segment entier) : rien à y changer. */}
      <p className="mt-8 text-sm text-neutral-600">
        Vous avez reçu un code d&apos;inscription ?{' '}
        <Link href="/inscription" className="underline underline-offset-4">
          Créer votre compte
        </Link>
      </p>
    </main>
  )
}
