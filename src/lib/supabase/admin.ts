import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { envSupabase } from './env'

/** La clé de service est lue ici, derrière `server-only`, et nulle part ailleurs. */
function cleService(): string {
  const valeur = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!valeur) {
    throw new Error("Variable d'environnement manquante : SUPABASE_SERVICE_ROLE_KEY")
  }
  return valeur
}

/**
 * Client privilégié : contourne la RLS. Réservé aux Server Actions et scripts,
 * après vérification explicite des droits de l'appelant.
 */
export function clientAdmin() {
  return createClient(envSupabase.url, cleService(), {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
