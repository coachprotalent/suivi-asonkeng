import 'server-only'
import { clientServeur } from '@/lib/supabase/serveur'

export type Antenne = {
  id: string
  nom: string
  pays: string
  actif: boolean
}

/**
 * Toutes les antennes, actives et désactivées, triées par nom.
 *
 * Réservée à l'écran d'administration : sans elle, une antenne désactivée
 * disparaîtrait de l'interface **sans retour possible**, et il faudrait la clé de
 * service pour la réactiver. Une fiche membre archivée, elle, reste consultable.
 */
export async function listerToutesAntennes(): Promise<Antenne[]> {
  const supabase = await clientServeur()
  const { data, error } = await supabase
    .from('antennes')
    .select('id, nom, pays, actif')
    .order('actif', { ascending: false })
    .order('nom')

  if (error) {
    throw new Error(`Lecture des antennes impossible : ${error.message}`)
  }
  return (data ?? []) as Antenne[]
}

/** Antennes actives, triées par nom. */
export async function listerAntennes(): Promise<Antenne[]> {
  const supabase = await clientServeur()
  const { data, error } = await supabase
    .from('antennes')
    .select('id, nom, pays, actif')
    .eq('actif', true)
    .order('nom')

  // Même exigence que `listerToutesAntennes` : sans elle, une panne de lecture vide
  // le sélecteur d'antenne, une fiche est enregistrée détachée sans un mot, et
  // l'écran de modification affiche « (désactivée) » à côté d'une antenne active.
  if (error) {
    throw new Error(`Lecture des antennes impossible : ${error.message}`)
  }
  return (data ?? []) as Antenne[]
}
