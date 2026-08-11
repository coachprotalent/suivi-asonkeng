import 'server-only'
import { clientServeur } from '@/lib/supabase/serveur'

export type Antenne = {
  id: string
  nom: string
  pays: string
  actif: boolean
}

/** Antennes actives, triées par nom. */
export async function listerAntennes(): Promise<Antenne[]> {
  const supabase = await clientServeur()
  const { data } = await supabase
    .from('antennes')
    .select('id, nom, pays, actif')
    .eq('actif', true)
    .order('nom')

  return (data ?? []) as Antenne[]
}
