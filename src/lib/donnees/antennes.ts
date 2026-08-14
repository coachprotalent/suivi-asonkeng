import 'server-only'
import { clientAdmin } from '@/lib/supabase/admin'
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

/**
 * Antennes actives, pour le SEUL formulaire public `/inscription`. EXCEPTION
 * DÉLIBÉRÉE : la clé de service plutôt que la clé sous RLS, parce que
 * `/inscription` s'affiche sans session — un appel sous RLS avec la clé anonyme
 * échouerait (42501), la politique d'`antennes` ne s'ouvrant qu'à `authenticated`
 * (spec §5.3). Cette liste est fixe, déjà publique pour tout compte actif, et
 * strictement indépendante du code d'inscription saisi : elle ne peut donc servir
 * d'oracle sur la validité d'un token (design 2b §6).
 *
 * `src/lib/donnees/arbre.ts` emploie aussi la clé de service, pour trois lectures
 * (design 1c, D19 : l'autorité suit l'arbre, pas la visibilité RLS) — cette
 * fonction-ci n'est donc PAS la seule de `src/lib/donnees/` à contourner la RLS
 * pour lire. C'est en revanche la SEULE à le faire pour un appel SANS AUCUNE
 * SESSION : les trois lectures d'`arbre.ts` s'exécutent toujours derrière un
 * écran déjà authentifié. Ne pas réutiliser cette clé ailleurs dans ce fichier,
 * ni dans `tokens.ts`, `demandes.ts` ou les lectures de `notifications.ts` — voir
 * la Task 13 du plan de la phase 2b.
 */
export async function listerAntennesPubliques(): Promise<Antenne[]> {
  const { data, error } = await clientAdmin()
    .from('antennes')
    .select('id, nom, pays, actif')
    .eq('actif', true)
    .order('nom')

  if (error) {
    throw new Error(`Lecture des antennes impossible : ${error.message}`)
  }
  return (data ?? []) as Antenne[]
}

/** Une antenne par son identifiant, active ou non, ou `null` si elle n'existe pas. */
export async function antenneParId(id: string): Promise<Antenne | null> {
  const supabase = await clientServeur()
  const { data, error } = await supabase
    .from('antennes')
    .select('id, nom, pays, actif')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    throw new Error(`Lecture de l'antenne impossible : ${error.message}`)
  }
  return data as Antenne | null
}
