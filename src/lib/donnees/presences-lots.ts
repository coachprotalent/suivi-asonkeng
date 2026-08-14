import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * PAS de `import 'server-only'` ici, à la différence de `src/lib/donnees/ael.ts` —
 * délibéré, même motif que `src/lib/donnees/membres-lots.ts` (voir son encadré de
 * tête) : `presencesDeSeanceParLots` reçoit son client Supabase déjà construit, en
 * paramètre, et ne touche ni cookies ni clé de service. L'isoler ici permet à
 * `tests/rls/ael.test.ts` (vitest, hors Next.js) de faire tourner EXACTEMENT ce code
 * de production contre la vraie base, plutôt qu'une simple lecture directe qui ne
 * prouverait rien du parcours par lots lui-même.
 *
 * `src/lib/donnees/ael.ts`, lui, reste `server-only` et réexpose ce module tel quel
 * pour son propre appelant (`presencesDeSeance`) : cette séparation ne change rien
 * pour lui.
 */

/**
 * LE POINT LE PLUS GRAVE de l'écran de pointage (Task 16, registre de la phase) :
 * `presences_ael` était lue par `presencesDeSeance` (Task 12) SANS `.range()` ni
 * `.limit()`, et PostgREST tronque SILENCIEUSEMENT toute lecture non bornée au-delà de
 * `max_rows` (1000, `supabase/config.toml:18`) — même défaut déjà corrigé une fois sur
 * `membresDesAntennesParLots` (`membres-lots.ts`).
 *
 * Ici l'enjeu dépasse celui de `membresDesAntennes` : une présence tronquée hors de la
 * carte rendue par cette fonction n'est pas seulement absente de l'écran, elle
 * apparaît comme une case VIDE — indiscernable d'un membre jamais pointé. Un
 * modérateur qui « corrige » ce qu'il croit être un oubli en cochant puis décochant,
 * ou qui décoche une case qu'il croit vide, ÉCRASE UNE PRÉSENCE RÉELLE avec
 * `present: false` : ce n'est plus une information manquante à l'écran, c'est une
 * DONNÉE CORROMPUE en base, écrite par la main même qui croyait la corriger. Sa
 * condition de déclenchement n'a rien de lointain : une SEULE séance liée à plusieurs
 * antennes cumulant plus de 1000 membres suffit (l'équipe vise plus de 1000 membres) —
 * `listerSeances` (`ael.ts`), pour comparaison, n'atteindrait ce volume qu'après une
 * accumulation pluriannuelle de séances.
 *
 * FORME RETENUE, sur le motif exact de `membresDesAntennesParLots` : parcours COMPLET
 * par lots jusqu'à épuisement, plutôt que « demander une ligne de plus que le plafond
 * attendu et échouer bruyamment au-delà » (la forme choisie par `listerSeances` dans ce
 * même fichier voisin). La différence qui justifie ce choix, pas l'autre : cette
 * lecture est croisée avec `membresDesAntennes` (déjà paginée) pour décider de l'état
 * de CHAQUE case à l'écran — si l'une des deux listes est bornée et l'autre tronquée,
 * l'écart entre les deux se lit comme « absent », exactement le mode de défaillance
 * décrit ci-dessus. `listerSeances` n'a, lui, aucune autre lecture avec laquelle se
 * croiser de cette façon : échouer bruyamment y rend le dépassement VISIBLE sans risque
 * de corrompre une écriture. Ici, la seule issue qui rend la troncature IMPOSSIBLE
 * plutôt que seulement DÉTECTABLE est le parcours par lots.
 *
 * TRI TOTAL, mais PAS besoin d'un troisième critère comme `membresDesAntennesParLots`
 * (`.order('nom').order('prenom').order('id')`) : la clé primaire de `presences_ael`
 * est COMPOSITE `(seance_id, membre_id)` (migration 20260817110000). Cette fonction
 * filtre déjà sur UN `seance_id` fixe (`.eq('seance_id', seanceId)`), donc `membre_id`
 * SEUL est déjà unique dans l'ensemble filtré — aucun homonyme possible, aucune paire
 * d'ex æquo à départager. `.order('membre_id')` suffit à rendre le tri total requis
 * pour qu'une pagination par décalage ne rende jamais une ligne deux fois ni aucune.
 */
export const TAILLE_LOT_PRESENCES_SEANCE = 500

/**
 * Cœur de `presencesDeSeance`, avec le client Supabase en paramètre plutôt que résolu
 * à l'intérieur (voir l'encadré en tête de fichier). Voir le commentaire de la
 * constante `TAILLE_LOT_PRESENCES_SEANCE` ci-dessus pour la forme retenue et pourquoi.
 */
export async function presencesDeSeanceParLots(
  supabase: SupabaseClient,
  seanceId: string,
  tailleLot: number = TAILLE_LOT_PRESENCES_SEANCE,
): Promise<Record<string, boolean>> {
  // Validation levée, pas bornée en silence — même discipline et même raison que
  // `membresDesAntennesParLots` (`membres-lots.ts`) : borner silencieusement
  // masquerait un appel erroné derrière un comportement différent de celui demandé.
  // `tailleLot` n'a qu'un seul appelant capable de le faire varier
  // (`tests/rls/ael.test.ts`, pour franchir une frontière de page réelle sans créer
  // des centaines de présences) : une erreur bruyante ne coûte rien en production.
  if (!Number.isInteger(tailleLot) || tailleLot < 1 || tailleLot >= 1000) {
    throw new Error(
      `presencesDeSeanceParLots : tailleLot invalide (${tailleLot}) — doit être un entier compris entre 1 et 999 inclus (max_rows PostgREST = 1000, supabase/config.toml:18).`,
    )
  }

  const resultat: Record<string, boolean> = {}
  let debut = 0
  for (;;) {
    const { data, error } = await supabase
      .from('presences_ael')
      .select('membre_id, present')
      .eq('seance_id', seanceId)
      .order('membre_id')
      .range(debut, debut + tailleLot - 1)

    if (error) {
      // Un échec ne doit pas être indistinguable d'une séance sans aucune présence
      // pointée : sans ceci, une panne de lecture laisserait croire que rien n'a
      // encore été fait, l'exact inverse du danger que ce module existe pour
      // supprimer.
      throw new Error(`Lecture des présences impossible : ${error.message}`)
    }

    const lot = data ?? []
    for (const ligne of lot) {
      resultat[ligne.membre_id as string] = ligne.present as boolean
    }
    if (lot.length < tailleLot) {
      break
    }
    debut += tailleLot
  }
  return resultat
}
