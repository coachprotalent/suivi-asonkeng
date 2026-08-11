import 'server-only'
import { clientServeur } from '@/lib/supabase/serveur'

export type Profil = {
  id: string
  identifiant: string
  nomAffichage: string
  membreId: string | null
  estRacine: boolean
  actif: boolean
}

/** Profil du compte connecté, ou null si personne n'est connecté. */
export async function profilCourant(): Promise<Profil | null> {
  const supabase = await clientServeur()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('profils')
    .select('id, identifiant, nom_affichage, membre_id, est_racine, actif')
    .eq('id', user.id)
    .maybeSingle()

  if (!data) return null

  return {
    id: data.id,
    identifiant: data.identifiant,
    nomAffichage: data.nom_affichage,
    membreId: data.membre_id,
    estRacine: data.est_racine,
    actif: data.actif,
  }
}
