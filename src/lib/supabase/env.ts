function requis(nom: string, valeur: string | undefined): string {
  if (!valeur) {
    throw new Error(`Variable d'environnement manquante : ${nom}`)
  }
  return valeur
}

export const envSupabase = {
  url: requis('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL),
  cleAnon: requis('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
}

/** Serveur uniquement — ne jamais importer depuis un composant client. */
export function cleService(): string {
  return requis('SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY)
}
