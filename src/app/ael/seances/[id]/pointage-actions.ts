'use server'

import { exigerModerateurOuAdministrateur } from '@/lib/securite/garde'
import { clientAdmin } from '@/lib/supabase/admin'

export type ResultatPointage = { erreur: string | null }

/**
 * Écriture UNITAIRE, ligne à ligne (D43) : chaque case cochée ou décochée appelle
 * cette fonction séparément, jamais un formulaire global. `upsert` sur la clé
 * composite `(seance_id, membre_id)` fait de « dernière écriture gagnante » une
 * propriété VRAIE PAR CONSTRUCTION.
 *
 * PAS de `revalidatePath` ici (correction I2 de la ronde) — c'est délibéré, pas un
 * oubli. `revalidatePath` dans une Server Action re-rend la route COURANTE dans LA
 * MÊME réponse (doc Next 16 du dépôt,
 * `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md` :
 * « Updates the UI immediately »), et les cases sont dépêchées UNE À UNE (`basculer`,
 * `pointage.tsx`) : pointer N personnes coûtait donc N re-rendus complets de tout
 * l'écran, liste paginée des membres comprise (`membresDesAntennes`), sur un écran
 * dimensionné pour plus de 1000 membres.
 *
 * Retirer l'appel préserve les propriétés exigées :
 *  - pointer N personnes ne coûte plus N re-rendus complets — l'effet visuel immédiat
 *    est entièrement porté par l'état optimiste client (`pointage.tsx`, `setPresences`),
 *    et une rafale de pointages ne provoque qu'UN SEUL rafraîchissement différé (voir
 *    le point suivant) ;
 *  - l'écran continue de dire la vérité après un RECHARGEMENT : cette route lit
 *    `exigerProfilActif()` / `clientServeur()`, qui appellent `cookies()`
 *    (`src/lib/supabase/serveur.ts`) — une API de requête qui force le rendu
 *    DYNAMIQUE de toute la page (aucune option de cache statique n'est posée nulle
 *    part sur cette route, et ce dépôt n'active pas `cacheComponents`, voir
 *    `next.config.ts` et `node_modules/next/dist/docs/01-app/02-guides/
 *    caching-without-cache-components.md`). Un rechargement dur relance donc
 *    systématiquement `presencesDeSeance` contre la base, `revalidatePath` ou pas.
 *
 * CE QUE LA PREMIÈRE VERSION DE CE COMMENTAIRE AFFIRMAIT À TORT (IMPORTANT 1 de la revue
 * de la Task 19) : elle concluait « il n'y a ici aucun rendu mis en cache à invalider ».
 * C'était faux, et faux du motif dominant de ce projet — un commentaire qui promet plus
 * que le code ne tient, écrit dans le correctif d'un constat. Le raisonnement ne
 * regardait que le cache SERVEUR. Le CACHE CLIENT, lui, existe bel et bien et
 * `revalidatePath` l'invalidait : « An in-memory cache in the browser that stores RSC
 * Payload for visited and prefetched routes […] reused during browser back/forward
 * navigation » (`node_modules/next/dist/docs/01-app/04-glossary.md:45-49`). Pointer,
 * revenir à la liste, appuyer sur PRÉCÉDENT rendait donc les cases ET le total à l'état
 * d'AVANT — VÉRIFIÉ EN EXÉCUTION, pas déduit : le test « retour arrière du navigateur »
 * de `tests/e2e/ael-pointage.spec.ts` échouait sur cette version-là (case reçue
 * `unchecked`) et passe sur celle-ci. La vérité survivait à un RECHARGEMENT, pas à un
 * RETOUR ARRIÈRE.
 * Le remède vit désormais côté client, dans `pointage.tsx` : un `router.refresh()`
 * DIFFÉRÉ ET COALESCENT, qui purge le cache client de cette route UNE fois par rafale au
 * lieu des N invalidations que `revalidatePath` provoquait. Voir l'encadré de
 * `DELAI_RAFRAICHISSEMENT_MS` pour pourquoi il est différé plutôt que posé au démontage.
 *
 * CE QUE CE RETRAIT NE COUVRE PAS, et qui n'était de toute façon pas exigé : un second
 * onglet ouvert sur la même séance ne se met pas à jour tout seul sans action de son
 * utilisateur — un rechargement de CE second onglet reste la façon de voir l'écriture
 * d'un autre gestionnaire, comme avant ce correctif.
 */
export async function pointerPresence(
  seanceId: string,
  membreId: string,
  present: boolean,
): Promise<ResultatPointage> {
  const profil = await exigerModerateurOuAdministrateur()

  const { data, error } = await clientAdmin()
    .from('presences_ael')
    .upsert(
      {
        seance_id: seanceId,
        membre_id: membreId,
        present,
        pointe_par: profil.id,
        pointe_le: new Date().toISOString(),
      },
      { onConflict: 'seance_id,membre_id' },
    )
    .select('seance_id')

  if (error || !data || data.length === 0) {
    console.error('pointerPresence : échec de la mise à jour', {
      seanceId,
      membreId,
      present,
      code: error?.code,
      details: error?.details,
      message: error?.message,
    })
    return { erreur: "Le pointage n'a pas pu être enregistré." }
  }

  return { erreur: null }
}
