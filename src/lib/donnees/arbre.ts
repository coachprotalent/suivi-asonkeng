import 'server-only'
import type { CibleAutorite, MaillonArbre } from '@/lib/domaine/arbre'
import { clientAdmin } from '@/lib/supabase/admin'
import { clientServeur } from '@/lib/supabase/serveur'
import type { MembreBref } from './membres'

/**
 * Ancêtres d'un membre, du plus proche au plus lointain.
 *
 * Appelée avec la CLÉ DE SERVICE, et c'est délibéré (design 1c, D19) : la fonction
 * Postgres est `security definer` et son exécution est réservée à `service_role`. Une
 * remontée soumise à la RLS s'arrêterait sur un ancêtre archivé — invisible d'un
 * non-administrateur — et rétrécirait la portée d'autorité sans erreur ni trace.
 * L'autorité suit l'arbre, pas la visibilité.
 */
export async function ancetresDeMembre(membreId: string): Promise<string[]> {
  const { data, error } = await clientAdmin().rpc('ancetres_membre', { p_membre: membreId })
  if (error) {
    throw new Error(`Lecture des ancêtres impossible : ${error.message}`)
  }

  const lignes = (data ?? []) as Array<{ membre_id?: unknown }>
  return lignes.map((ligne) => {
    // Contrôle de forme, et non décoration. Faute de types `Database` générés, `rpc`
    // rend `any` : si la colonne était un jour renommée, chaque `membre_id` vaudrait
    // `undefined`, la liste d'ancêtres serait pleine de trous, et la portée d'autorité
    // se viderait EN SILENCE. L'échec fermé est la bonne direction ; l'échec silencieux
    // ne l'est pas. Même famille de défaut que le cast de la Task 10 de la 1b.
    if (typeof ligne.membre_id !== 'string' || ligne.membre_id.length === 0) {
      throw new Error(
        "Forme inattendue renvoyée par ancetres_membre : colonne « membre_id » absente ou vide.",
      )
    }
    return ligne.membre_id
  })
}

/**
 * Les éléments nécessaires à une décision d'autorité sur un membre.
 *
 * Lecture avec la CLÉ DE SERVICE, comme `ancetresDeMembre` et pour la même raison
 * (design 1c, D19) : une décision d'autorité ne doit pas dépendre de ce que l'appelant
 * a le droit de VOIR. Sous RLS, une fiche archivée est invisible d'un non-administrateur
 * et rendrait `null` — ce qui, selon la façon dont l'appelant traite ce `null`, donnerait
 * soit un refus inexplicable, soit pire.
 *
 * `null` signifie « ce membre n'existe pas », et rien d'autre. L'appelant doit le
 * traiter comme un refus.
 */
export async function cibleAutorite(membreId: string): Promise<CibleAutorite | null> {
  const { data, error } = await clientAdmin()
    .from('membres')
    .select('id, dirigeant_id')
    .eq('id', membreId)
    .maybeSingle()

  if (error) {
    throw new Error(`Lecture de la cible d'autorité impossible : ${error.message}`)
  }
  if (!data) {
    return null
  }

  const ancetres = await ancetresDeMembre(membreId)
  return {
    membreId: data.id as string,
    ancetres,
    dirigeantId: data.dirigeant_id as string | null,
  }
}

/** Chemin nommé d'un membre jusqu'à sa racine, membre inclus. Sert à MONTRER un cycle. */
export async function cheminArbre(membreId: string): Promise<MembreBref[]> {
  const { data, error } = await clientAdmin().rpc('chemin_arbre', { p_membre: membreId })
  if (error) {
    throw new Error(`Lecture du chemin impossible : ${error.message}`)
  }
  const lignes = (data ?? []) as Array<{ membre_id: string; nom: string; prenom: string }>
  return lignes.map((l) => ({ id: l.membre_id, nom: l.nom, prenom: l.prenom }))
}

/**
 * Disciples directs d'un membre, encore actifs. Sous RLS — mais ce n'est plus
 * seulement un affichage : c'est aussi le contrôle EN AMONT d'`archiverMembre`
 * (src/app/membres/actions.ts), qui produit le refus nommé vu par l'administrateur
 * avant même que le déclencheur n'intervienne.
 */
export async function disciplesDe(membreId: string): Promise<MembreBref[]> {
  const supabase = await clientServeur()
  const { data, error } = await supabase
    .from('membres')
    .select('id, nom, prenom')
    .eq('faiseur_de_disciple_id', membreId)
    .eq('etat', 'actif')
    .order('nom')
    .order('prenom')

  if (error) {
    throw new Error(`Lecture des disciples impossible : ${error.message}`)
  }
  return (data ?? []).map((l) => ({
    id: l.id as string,
    nom: l.nom as string,
    prenom: l.prenom as string,
  }))
}

/** Le strict nécessaire au calcul du dirigeant proposé. */
export async function maillonArbre(membreId: string): Promise<MaillonArbre | null> {
  const supabase = await clientServeur()
  const { data, error } = await supabase
    .from('membres')
    .select('id, faiseur_de_disciple_id')
    .eq('id', membreId)
    .maybeSingle()

  if (error) {
    throw new Error(`Lecture du maillon impossible : ${error.message}`)
  }
  if (!data) {
    return null
  }
  return { id: data.id as string, faiseurDeDiscipleId: data.faiseur_de_disciple_id as string | null }
}
