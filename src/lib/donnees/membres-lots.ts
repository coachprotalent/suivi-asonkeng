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
 * Chaque lot est demandé sous `tailleLot` : c'est vrai PAR CONSTRUCTION de la constante
 * `TAILLE_LOT_MEMBRES_ANTENNE` (500, strictement < `max_rows`), mais PAS du paramètre
 * `tailleLot` en général — c'est un paramètre public, exporté, que rien n'empêcherait
 * d'appeler avec une valeur ≥ `max_rows`. D'où la validation ci-dessous : sans elle, un
 * appel à `tailleLot >= max_rows` ferait tronquer le lot PAR POSTGREST LUI-MÊME, la
 * condition `lot.length < tailleLot` (plus bas) conclurait alors « dernière page », et la
 * fonction rendrait une liste tronquée COMME COMPLÈTE — le défaut d'origine, réintroduit
 * par la porte même ouverte pour le corriger (revue task-1-4, constat I1). Une valeur
 * ≤ 0, elle, donnerait `debut += 0` à chaque tour : boucle infinie.
 *
 * La dernière page est celle dont le lot rendu est plus court que `tailleLot` — signe
 * qu'il ne reste rien après. C'est CE critère, et lui seul, qui termine le parcours dans
 * TOUS les cas, y compris le cas particulier où le total est un multiple EXACT de
 * `tailleLot` : vérifié par appel réel contre la base de ce projet (pas seulement supposé
 * depuis le code), demander une page dont le décalage égale le nombre total de lignes NE
 * PRODUIT PAS `PGRST103` sur la version de PostgREST qui sert ce projet — elle répond
 * `200`/`206` avec un tableau vide, une page vide comme une autre. Un commentaire antérieur
 * de cette fonction affirmait le contraire (revue task-1-4, hypothèse posée mais jamais
 * vérifiée — voir son constat I3) ; corrigé ici après vérification directe, HTTP brut
 * compris (`Range: 2-3` sur 2 lignes → `206`, `Content-Range` sans plage sur un total de
 * 2, corps `[]`).
 *
 * `PGRST103` reste néanmoins traité ci-dessous, en pure défense : c'est un code réel,
 * mais produit par PostgREST pour une plage STRUCTURELLEMENT invalide (borne de début
 * postérieure à la borne de fin — `range(5, 2)` répond bien `PGRST103`/`416`, message
 * « Limit should be greater than or equal to zero », vérifié de la même façon) — jamais
 * un cas que cette fonction peut construire elle-même tant que `tailleLot` reste validé
 * ≥ 1 ci-dessus. Avec `tailleLot` dans `[1, 999]` et `debut` qui n'avance que par pas de
 * `tailleLot` à partir de 0, cette branche est aujourd'hui MORTE en pratique : rien dans
 * cette fonction ne peut construire la plage structurellement invalide qui la
 * déclenche.
 *
 * Elle est gardée quand même, mais elle LÈVE plutôt que de traiter le cas comme une fin
 * de parcours normale (revue task-1-4 puis ronde de correction Q6, `membres-lots.ts`
 * ancienne version : `break`). Une justification antérieure de ce fichier affirmait le
 * contraire — que traiter `PGRST103` comme une fin de parcours normale était le bon
 * choix — et c'était l'envers de la vérité : si cette branche était un jour atteinte
 * (bug de PostgREST, changement de version, appelant futur qui contournerait la
 * validation), l'atteindre à `debut = 0` la ferait rendre `[]`, soit exactement « une
 * antenne vide » — précisément ce que ce module existe pour ne jamais laisser passer —
 * et l'atteindre à un `debut` ultérieur rendrait la liste accumulée jusque-là COMME
 * COMPLÈTE, une troncature silencieuse présentée comme un résultat entier. `break`
 * committait donc, dans le seul cas où elle sert encore de filet, exactement le défaut
 * que cette fonction a été écrite pour rendre impossible. `throw` est cohérent avec le
 * reste de la fonction : un échec ne doit jamais être indistinguable d'un résultat
 * normal.
 */
export async function membresDesAntennesParLots(
  supabase: SupabaseClient,
  antenneIds: string[],
  tailleLot: number = TAILLE_LOT_MEMBRES_ANTENNE,
): Promise<MembreBref[]> {
  // Validation levée, pas bornée en silence : borner (`Math.min(tailleLot, 999)`)
  // masquerait un appel erroné derrière un comportement différent de celui demandé, sans
  // qu'aucun signal ne le montre — exactement le genre de mensonge silencieux que ce
  // module existe pour éliminer. `tailleLot` n'a qu'un seul appelant capable de le faire
  // varier (`tests/rls/membres.test.ts`, pour franchir une frontière de page réelle sans
  // construire des centaines de fiches) : une erreur bruyante ne coûte donc rien en
  // production (l'appel par défaut ne passe jamais ce paramètre) et referme I1 pour de
  // bon plutôt que de repousser la troncature à une valeur simplement plus haute.
  if (!Number.isInteger(tailleLot) || tailleLot < 1 || tailleLot >= 1000) {
    throw new Error(
      `membresDesAntennesParLots : tailleLot invalide (${tailleLot}) — doit être un entier compris entre 1 et 999 inclus (max_rows PostgREST = 1000, supabase/config.toml:18).`,
    )
  }

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
      // `.order('id')` en dernier départage : (nom, prenom) n'est PAS unique — deux
      // homonymes exacts (cas banal sur une liste de membres) n'ont aucun ordre relatif
      // garanti d'une exécution à l'autre de cette requête (plan différent, tri
      // parallèle...). À cheval sur une frontière de page, l'un pourrait être rendu deux
      // fois ou jamais — « jamais » étant exactement le sinistre que toute cette
      // correction vise à rendre impossible (revue task-1-4, constat I2). `id` est la clé
      // primaire, donc unique : ce troisième critère rend le tri TOTAL, et la pagination
      // par décalage déterministe quel que soit le nombre d'ex æquo sur (nom, prenom).
      .order('id')
      .range(debut, debut + tailleLot - 1)

    if (error) {
      if (error.code === 'PGRST103') {
        // Branche morte en pratique (voir le commentaire de la fonction) : gardée en
        // défense, mais LÈVE — ne jamais traiter une plage structurellement invalide
        // comme une fin de parcours normale, sous peine de rendre `[]` ou une liste
        // tronquée comme si l'une ou l'autre était le résultat complet.
        throw new Error(
          `Lecture des membres de l'antenne impossible : plage invalide rendue par PostgREST (PGRST103) à debut=${debut}, tailleLot=${tailleLot} — ne doit normalement jamais se produire avec un tailleLot validé.`,
        )
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
