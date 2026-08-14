import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * C1 de la revue de la Task 19 — LE GARDE-FOU EST UN COMPOSANT COMME UN AUTRE, et il
 * portait exactement le défaut qu'il existe pour empêcher.
 *
 * L'empreinte et la relecture du delta de `tests/e2e/ael-preuves.spec.ts` lisaient
 * `seances_ael` SANS `.range()` ni `.limit()`. `supabase/config.toml:18` fixe
 * `max_rows = 1000` et PostgREST tronque SILENCIEUSEMENT au-delà (fait établi contre la
 * base réelle dans cette phase, à l'origine de `src/lib/donnees/membres-lots.ts` puis de
 * `src/lib/donnees/presences-lots.ts`). L'enchaînement était DESTRUCTEUR, pas seulement
 * faux : empreinte tronquée → les séances de production au-delà de la millième ne
 * figurent pas dans `idsSeancesAvant` → le filtre du delta les classe « créées par cette
 * suite » → la garde bruyante ne les arrête pas (elle ne refuse que les séances NON
 * `prevue` ou POINTÉES, or une séance générée et non tenue est précisément `prevue` et
 * non pointée) → elle les SUPPRIME, en silence, sur la base qui sert de production.
 * Cette suite crée 72 séances par exécution et une seule session de vérification en
 * avait produit 91 (registre, Tasks 13-14) : le seuil est à une douzaine de cycles.
 *
 * FORME RETENUE : PARCOURS PAR LOTS jusqu'à épuisement, sur le motif éprouvé de
 * `presences-lots.ts` — et NON `count: 'exact'` avec levée si le nombre rendu diffère du
 * total. La raison est celle qui avait déjà fait préférer la pagination pour
 * `presencesDeSeance` à la levée bruyante de `listerSeances`, et elle est ici plus
 * tranchée encore : ces deux lectures sont CROISÉES l'une avec l'autre (le delta est
 * `apres \ avant`), donc l'écart entre une liste complète et une liste tronquée se lit
 * comme « créée par cette suite » — c'est-à-dire, ici, comme « à supprimer ». Le parcours
 * rend la troncature IMPOSSIBLE plutôt que seulement DÉTECTABLE. La levée bruyante,
 * elle, aurait bloqué toute la suite e2e dès que la production dépasse 1000 séances — un
 * état parfaitement légitime — sans rien protéger de plus.
 *
 * TRI TOTAL : `.order('id')` suffit, `id` étant la CLÉ PRIMAIRE de `seances_ael`
 * (migration 20260817110000) — aucun ex æquo possible, donc aucune ligne rendue deux fois
 * ni omise par une pagination par décalage. Même raisonnement que `presences-lots.ts`,
 * tenu ici sur une clé simple plutôt que composite.
 *
 * MODULE SÉPARÉ du fichier de spec, et le client Supabase reçu en PARAMÈTRE, pour la
 * même raison que `membres-lots.ts`/`presences-lots.ts` : cela permet d'éprouver CE code
 * contre la base réelle en franchissant une vraie frontière de page (`tailleLot` réduit),
 * plutôt que de recopier la boucle dans un script de vérification — ce qui n'aurait
 * prouvé que la copie. Playwright ne collecte pas ce fichier (son `testMatch` par défaut
 * exige `*.spec.ts` ou `*.test.ts`).
 */
export const TAILLE_LOT_SEANCES = 500

export async function lireSeancesParLots<T>(
  admin: SupabaseClient,
  colonnes: string,
  tailleLot: number = TAILLE_LOT_SEANCES,
): Promise<T[]> {
  // Validation levée, pas bornée en silence — même discipline et même raison que
  // `presencesDeSeanceParLots` : un lot >= `max_rows` ferait tronquer le lot par
  // PostgREST, `lot.length < tailleLot` conclurait « dernière page », et la fonction
  // rendrait une liste tronquée COMME COMPLÈTE, soit très exactement le défaut corrigé
  // ici, réintroduit par la porte ouverte pour le corriger.
  if (!Number.isInteger(tailleLot) || tailleLot < 1 || tailleLot >= 1000) {
    throw new Error(
      `lireSeancesParLots : tailleLot invalide (${tailleLot}) — doit être un entier compris entre 1 et 999 inclus (max_rows PostgREST = 1000, supabase/config.toml:18).`,
    )
  }

  const resultat: T[] = []
  let debut = 0
  for (;;) {
    const { data, error } = await admin
      .from('seances_ael')
      .select(colonnes)
      .order('id')
      .range(debut, debut + tailleLot - 1)
    if (error) {
      // Une lecture en échec ne doit jamais être indistinguable d'une base sans séance :
      // ce serait une empreinte vide, donc un delta englobant TOUTE la production.
      throw new Error(`lecture par lots de seances_ael impossible : ${error.message}`)
    }
    const lot = (data ?? []) as unknown as T[]
    resultat.push(...lot)
    if (lot.length < tailleLot) {
      break
    }
    debut += tailleLot
  }
  return resultat
}
