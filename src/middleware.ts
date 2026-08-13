import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { envSupabase } from '@/lib/supabase/env'

const ROUTE_CONNEXION = '/connexion'
const ROUTE_INSCRIPTION = '/inscription'
const ROUTE_CHANGEMENT_MDP = '/changer-mot-de-passe'
const ROUTE_DECONNEXION = '/deconnexion'
const ROUTE_APRES_CONNEXION = '/tableau-de-bord'

/** Compare un segment entier, pas un préfixe : `/connexion-aide` n'est pas `/connexion`. */
const estRoute = (chemin: string, route: string) =>
  chemin === route || chemin.startsWith(`${route}/`)

export async function middleware(requete: NextRequest) {
  let reponse = NextResponse.next({ request: requete })

  const supabase = createServerClient(envSupabase.url, envSupabase.cleAnon, {
    cookies: {
      getAll() {
        return requete.cookies.getAll()
      },
      setAll(aPoser) {
        for (const { name, value } of aPoser) {
          requete.cookies.set(name, value)
        }
        reponse = NextResponse.next({ request: requete })
        for (const { name, value, options } of aPoser) {
          reponse.cookies.set(name, value, options)
        }
      },
    },
  })

  // getUser() valide le jeton auprès de Supabase et rafraîchit la session si besoin.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const chemin = requete.nextUrl.pathname
  const surConnexion = estRoute(chemin, ROUTE_CONNEXION)
  const surInscription = estRoute(chemin, ROUTE_INSCRIPTION)
  const surChangementMdp = estRoute(chemin, ROUTE_CHANGEMENT_MDP)

  /**
   * Construit une redirection en **reportant les cookies** déjà posés sur `reponse`.
   *
   * Ce report n'est pas une précaution de style. `getUser()` peut rafraîchir le jeton
   * au passage : `setAll` écrit alors les nouveaux cookies de session sur `reponse`.
   * Une réponse de redirection neuve ne les porterait pas, le navigateur garderait un
   * jeton que le serveur vient d'invalider, et l'utilisateur serait déconnecté — de
   * façon apparemment aléatoire, puisque cela n'arrive que lorsqu'un rafraîchissement
   * coïncide avec une redirection.
   */
  const rediriger = (vers: string) => {
    const url = requete.nextUrl.clone()
    url.pathname = vers
    url.search = ''
    const redirection = NextResponse.redirect(url)
    for (const cookie of reponse.cookies.getAll()) {
      redirection.cookies.set(cookie)
    }
    return redirection
  }

  if (!user) {
    // /inscription est la SEULE autre route accessible sans session (design 2b
    // §9) : c'est le premier chemin d'écriture public de l'application. Sa
    // fermeture ne repose PAS sur ce middleware — elle repose entièrement sur
    // l'absence de politique RLS ouverte à `anon` et sur les privilèges EXECUTE
    // retirés à tous sauf `service_role` (design 2b §6). Ce middleware ne fait ici
    // que la RENDRE ATTEIGNABLE ; il ne la protège pas.
    //
    // L'exception reste STRICTEMENT bornée par `estRoute`, qui compare un segment
    // entier : `/inscription` et `/inscription/...` seulement. `/inscriptions`,
    // `/inscription-admin` ou `/xinscription` ne l'obtiennent PAS. Toute
    // substitution d'un `startsWith(ROUTE_INSCRIPTION)` nu à cet appel rouvrirait
    // l'authentification sur des routes voisines, silencieusement.
    return surConnexion || surInscription ? reponse : rediriger(ROUTE_CONNEXION)
  }

  // Toujours laisser passer la déconnexion, avant toute autre garde.
  // Sans cette exception, un compte désactivé boucle sans fin : son jeton reste
  // valide, donc le middleware le laisse entrer ; la page appelle profilCourant(),
  // qui filtre sur `actif` et renvoie null ; la page redirige vers /connexion ; le
  // middleware voit un utilisateur authentifié et le renvoie au tableau de bord.
  // Un composant serveur ne peut pas effacer le cookie de session pendant son
  // rendu : seule une route dédiée le peut.
  if (estRoute(chemin, ROUTE_DECONNEXION)) {
    return reponse
  }

  // Drapeau lu dans le JWT : aucune requête base (spec §4.1).
  if (user.app_metadata?.doit_changer_mdp === true && !surChangementMdp) {
    return rediriger(ROUTE_CHANGEMENT_MDP)
  }

  if (surConnexion) {
    return rediriger(ROUTE_APRES_CONNEXION)
  }

  return reponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
