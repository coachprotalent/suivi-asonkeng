import { NextResponse, type NextRequest } from 'next/server'
import { clientServeur } from '@/lib/supabase/serveur'

/**
 * Efface la session puis renvoie vers l'écran de connexion.
 *
 * Une route plutôt qu'une Server Action ou un composant : c'est le seul endroit qui
 * puisse écrire des cookies dans ce flux. Un compte désactivé conserve un jeton
 * valide ; sans cette route, il boucle entre le middleware et le tableau de bord.
 */
export async function GET(requete: NextRequest) {
  const supabase = await clientServeur()
  // Portée locale : cette route répond en GET, donc une balise image sur un site
  // tiers peut la déclencher. En portée globale, cela déconnecterait la personne
  // de tous ses appareils au lieu du seul navigateur courant.
  await supabase.auth.signOut({ scope: 'local' })

  const url = requete.nextUrl.clone()
  url.pathname = '/connexion'
  url.search = ''
  return NextResponse.redirect(url)
}
