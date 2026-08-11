import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { cleService, envSupabase } from './env'

/**
 * Client privilégié : contourne la RLS. Réservé aux Server Actions et scripts,
 * après vérification explicite des droits de l'appelant.
 */
export function clientAdmin() {
  return createClient(envSupabase.url, cleService(), {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
