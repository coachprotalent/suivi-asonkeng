import { LIBELLE_FICHE_NON_CONSULTABLE } from './membre'

/** Une ligne prête à afficher dans une section de `/mes-membres`. */
export type ResumeMembre = {
  id: string
  libelle: string
  /** Synthèse courte (compteur AEL), ou `null` si elle n'est pas connue. */
  complement: string | null
  statuts: string[]
}

/**
 * Compose les lignes d'une section à partir de trois lectures indépendantes.
 *
 * FONCTION PURE : elle ne lit pas la base, et c'est ce qui la rend prouvable sans base. Les
 * trois entrées lui sont fournies par l'écran, qui les a lues EN LOT (D144).
 *
 * ═══ UN COMPTEUR ABSENT N'EST PAS UN ZÉRO ═══
 * Une clé manquante dans `compteursParMembre` rend `complement: null`, jamais `'0 AEL'`.
 * `compteurAelMembre` rend `null` quand la ligne de la vue `compteurs_ael` n'est pas visible
 * — afficher « 0 AEL » ferait alors dire à l'écran que cette personne n'a suivi aucun AEL,
 * ce qu'aucune lecture n'établit. Un zéro RÉEL, lui, s'affiche : c'est une valeur.
 *
 * ═══ UN NOM VIDE N'EST PAS UN BLANC ═══
 * `descendanceParPage` conserve la ligne d'un descendant que la RLS cache, avec un nom vide
 * — l'effacer ferait mentir le total de la section, qui vient du SQL et compte cette ligne.
 * Elle devient ici « Fiche non consultable » (D98, D100), à sa place, jamais une ligne vide.
 *
 * ═══ ELLE NE RETRIE RIEN ═══
 * L'ordre reçu est celui du SQL, dont le tri est TOTAL. Retrier ici le contredirait : deux
 * pages successives seraient ordonnées autrement que l'ensemble, et une personne pourrait
 * apparaître deux fois ou disparaître entre deux pages.
 */
export function resumerSection(
  membres: ReadonlyArray<{ id: string; nom: string; prenom: string }>,
  statutsParMembre: Readonly<Record<string, string[]>>,
  compteursParMembre: Readonly<Record<string, number>>,
): ResumeMembre[] {
  return membres.map((membre) => {
    const nomComplet = `${membre.prenom} ${membre.nom}`.trim()
    const compteur = compteursParMembre[membre.id]
    return {
      id: membre.id,
      libelle: nomComplet.length > 0 ? nomComplet : LIBELLE_FICHE_NON_CONSULTABLE,
      complement: typeof compteur === 'number' ? `${compteur} AEL` : null,
      statuts: statutsParMembre[membre.id] ?? [],
    }
  })
}
