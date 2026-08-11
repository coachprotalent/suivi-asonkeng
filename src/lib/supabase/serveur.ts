import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { envSupabase } from './env'

/** Client sous RLS, pour Server Components et Server Actions. */
export async function clientServeur() {
  const magasin = await cookies()

  return createServerClient(envSupabase.url, envSupabase.cleAnon, {
    cookies: {
      getAll() {
        return magasin.getAll()
      },
      setAll(aPoser) {
        try {
          for (const { name, value, options } of aPoser) {
            magasin.set(name, value, options)
          }
        } catch {
          // Appel depuis un Server Component : l'écriture de cookies y est interdite.
          // Le middleware se charge du rafraîchissement de session.
        }
      },
    },
  })
}
