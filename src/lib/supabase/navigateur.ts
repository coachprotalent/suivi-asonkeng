import { createBrowserClient } from '@supabase/ssr'
import { envSupabase } from './env'

export function clientNavigateur() {
  return createBrowserClient(envSupabase.url, envSupabase.cleAnon)
}
