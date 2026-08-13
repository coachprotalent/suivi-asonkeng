import type { SupabaseClient } from '@supabase/supabase-js'
import type { MembreBref } from './membres'

/**
 * PAS de `import 'server-only'` ici, à la différence de tous les autres modules de
 * `src/lib/donnees/` — délibéré, et seule raison de l'existence de ce fichier séparé.
 *
 * `membresDesAntennesParLots` ne touche ni cookies ni clé de service : elle reçoit son
 * client Supabase déjà construit, en paramètre. Rien ne l'oblige donc à vivre dans un
 * module marqué `server-only`, et l'isoler ici permet à `tests/rls/membres.test.ts`
 * (vitest, hors Next.js) de l'importer et de faire tourner EXACTEMENT ce code contre la
 * vraie base — chose impossible si cette fonction restait dans `membres.ts`, dont
 * `import 'server-only'` lève inconditionnellement hors du bundler Next (le paquet
 * `server-only` n'est neutralisé que par l'alias webpack/Turbopack propre à Next ;
 * vérifié : `node_modules/server-only/index.js` est un `throw` nu, sans condition).
 *
 * `membres.ts`, lui, reste `server-only` et réexporte ce module tel quel pour ses
 * propres appelants (`membresDesAntennes`) : cette séparation ne change RIEN pour eux.
 */

/**
 * Taille de lot de `membresDesAntennes`, strictement sous le plafond `max_rows` de
 * PostgREST (1000, `supabase/config.toml:18`). Voir le commentaire de
 * `membresDesAntennesParLots` pour ce que ce plafond casse silencieusement s'il n'est
 * pas anticipé. 500 laisse une marge large (le cas normal, D53, est de « quelques
 * centaines de lignes ») tout en gardant le nombre d'allers-retours petit pour le cas
 * courant.
 *
 * Exportée : la preuve de non-troncature (`tests/rls/membres.test.ts`) appelle
 * `membresDesAntennesParLots` avec un lot ramené à quelques lignes, pour franchir une
 * frontière de page réelle sans construire des centaines de fiches — cette constante
 * n'est donc PAS un simple détail d'implémentation privé.
 */
export const TAILLE_LOT_MEMBRES_ANTENNE = 500

/**
 * Cœur de `membresDesAntennes`, avec le client Supabase en paramètre plutôt que résolu à
 * l'intérieur (voir l'encadré en tête de fichier pour pourquoi ce fichier existe).
 *
 * PARCOURT PAR LOTS jusqu'à épuisement, plutôt qu'une lecture unique : PostgREST
 * applique un plafond `max_rows` (1000 par défaut, `supabase/config.toml:18`) à TOUTE
 * lecture, y compris une lecture sans `.range()` ni `.limit()` explicite — il tronque
 * silencieusement au-delà, sans erreur, sans avertissement, absolument indistinguable
 * d'une antenne qui compterait exactement 1000 membres actifs. Constaté déjà une fois
 * dans ce projet sur une lecture de test non paginée
 * (`.superpowers/sdd/2026-08-13-phase-2b-inscriptions/task-17-review.md`, constat I5).
 * Ici l'enjeu est plus grave qu'un test qui mentirait : cette liste alimente le
 * pointage d'une séance (D29, D46) — un membre tronqué hors de la liste est un membre
 * qu'on ne peut PAS marquer présent, sans qu'aucun signal ne le montre.
 *
 * Forme retenue : parcours complet par lots, plutôt que « demander une ligne de plus
 * que le plafond attendu et échouer bruyamment au-delà ». La seconde suppose un
 * plafond attendu par appel — hypothèse fragile pour une fonction à deux appelants
 * (D51) dont l'un (Task 16, plusieurs antennes cumulées) n'a justement AUCUNE borne
 * naturelle. Le parcours par lots rend la troncature IMPOSSIBLE quel que soit
 * l'effectif, plutôt que seulement DÉTECTABLE sous une hypothèse qui peut se tromper.
 *
 * Chaque lot est demandé sous `tailleLot` (strictement < `max_rows`), donc jamais
 * lui-même tronqué. La dernière page est celle dont le lot rendu est plus court que
 * `tailleLot` — signe qu'il ne reste rien après. Cas particulier : si le total est un
 * multiple EXACT de `tailleLot`, la page suivante démarre exactement au nombre total de
 * lignes ; PostgREST refuse alors la plage entière avec `PGRST103` (416, la même erreur
 * que `listerMembres` traite déjà dans `membres.ts`, pour une raison différente) plutôt
 * que de rendre un lot vide — fin de parcours normale, pas une panne.
 */
export async function membresDesAntennesParLots(
  supabase: SupabaseClient,
  antenneIds: string[],
  tailleLot: number = TAILLE_LOT_MEMBRES_ANTENNE,
): Promise<MembreBref[]> {
  if (antenneIds.length === 0) {
    return []
  }

  const resultat: MembreBref[] = []
  let debut = 0
  for (;;) {
    const { data, error } = await supabase
      .from('membres')
      .select('id, nom, prenom')
      .eq('etat', 'actif')
      .in('antenne_id', antenneIds)
      .order('nom')
      .order('prenom')
      .range(debut, debut + tailleLot - 1)

    if (error) {
      if (error.code === 'PGRST103') {
        break
      }
      // Un échec ne doit pas être indistinguable d'une antenne vide : sans ceci, une
      // panne de lecture laisserait croire qu'une antenne active n'a personne rattaché.
      throw new Error(`Lecture des membres de l'antenne impossible : ${error.message}`)
    }

    const lot = data ?? []
    resultat.push(
      ...lot.map((l) => ({
        id: l.id as string,
        nom: l.nom as string,
        prenom: l.prenom as string,
      })),
    )
    if (lot.length < tailleLot) {
      break
    }
    debut += tailleLot
  }
  return resultat
}
