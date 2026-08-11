import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { envSupabase } from '@/lib/supabase/env'

const ROUTE_CONNEXION = '/connexion'
const ROUTE_CHANGEMENT_MDP = '/changer-mot-de-passe'
const ROUTE_DECONNEXION = '/deconnexion'
const ROUTE_APRES_CONNEXION = '/tableau-de-bord'

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
  const surConnexion = chemin.startsWith(ROUTE_CONNEXION)
  const surChangementMdp = chemin.startsWith(ROUTE_CHANGEMENT_MDP)

  const rediriger = (vers: string) => {
    const url = requete.nextUrl.clone()
    url.pathname = vers
    url.search = ''
    return NextResponse.redirect(url)
  }

  if (!user) {
    return surConnexion ? reponse : rediriger(ROUTE_CONNEXION)
  }

  // Toujours laisser passer la déconnexion, avant toute autre garde.
  // Sans cette exception, un compte désactivé boucle sans fin : son jeton reste
  // valide, donc le middleware le laisse entrer ; la page appelle profilCourant(),
  // qui filtre sur `actif` et renvoie null ; la page redirige vers /connexion ; le
  // middleware voit un utilisateur authentifié et le renvoie au tableau de bord.
  // Un composant serveur ne peut pas effacer le cookie de session pendant son
  // rendu : seule une route dédiée le peut.
  if (chemin.startsWith(ROUTE_DECONNEXION)) {
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
