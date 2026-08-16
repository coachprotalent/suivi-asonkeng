'use client'

import Link from 'next/link'
import { Bouton } from '@/composants/ui/bouton'
import { Pagination } from '@/composants/ui/pagination'
import {
  classeDeRetrait,
  noeudDeplie,
  PROFONDEUR_MAX_INDENTATION,
} from '@/lib/domaine/arbre-affichage'
// ⚠️ `import type`, ET C'EST LOAD-BEARING. `arborescence.tsx` importe `Noeud` d'ici, et ce
// fichier importe `EtatArbre` de là-bas : c'est un cycle d'IMPORT. Il est inoffensif parce
// qu'un `import type` est ENTIÈREMENT EFFACÉ à la compilation (`isolatedModules: true`,
// `tsconfig.json`) — il ne subsiste aucune dépendance à l'exécution, donc aucune évaluation
// circulaire de module. Le passer en import de valeur créerait un vrai cycle, dont le
// symptôme serait un `undefined` au montage, sans message utile.
import type { EtatArbre } from './arborescence'

export type PropsNoeud = {
  membre: { id: string; nom: string; prenom: string }
  profondeur: number
  ancetres: readonly string[]
  etat: EtatArbre
  cibleId: string | null
  estAdmin: boolean
  basculer: (membreId: string, ancetres: readonly string[]) => void
  changerPage: (membreId: string, page: number) => void
}

/**
 * Un nœud de l'arbre. Composant de PREMIER NIVEAU du module, jamais défini à l'intérieur
 * d'`Arborescence` : une définition interne produirait un TYPE de composant neuf à chaque
 * rendu du parent, et React démonterait puis remonterait tout le sous-arbre — perdant le
 * focus et rejouant les chargements. **C'est aussi la raison pour laquelle il peut vivre
 * dans son propre fichier sans que rien ne change : il n'a jamais eu de fermeture sur
 * l'état du parent.**
 *
 * D101 — TOUT MEMBRE ACTIF EST DÉPLIABLE, sans indicateur pré-calculé. Un indicateur par
 * enfant, ce serait UNE REQUÊTE PAR ENFANT (N+1) ; l'alternative serait une vue
 * d'agrégation permanente, avec sa RLS à écrire et à prouver, POUR UN CHEVRON. Déplier une
 * feuille affiche « Aucun disciple actif rattaché. » — un aller-retour de trop, à la
 * demande, plutôt que N requêtes systématiques que personne n'a demandées.
 *
 * D106 — LE RAIL DE FILIATION EST ICI CHEZ LUI. C'est l'un des cinq seuls sites du dépôt où
 * une relation de discipulat est réellement affichée : chaque nœud enfant est le disciple
 * du nœud au-dessus. Le rail y porte une INFORMATION VRAIE — la profondeur —, et non une
 * décoration (piège n°6).
 */
export function Noeud({
  membre,
  profondeur,
  ancetres,
  etat,
  cibleId,
  estAdmin,
  basculer,
  changerPage,
}: PropsNoeud) {
  /*
    ═══ D105 — LA BARRIÈRE ANTI-CYCLE DU RENDU. ELLE A ÉTÉ EXTRAITE, PAS SUPPRIMÉE. ═══

    `noeudDeplie` (`src/lib/domaine/arbre-affichage.ts`) porte désormais, MOT POUR MOT, la
    condition qui était écrite ici :

        etat.deplies.includes(membre.id) && !ancetres.includes(membre.id)

    Elle est SORTIE dans un module de domaine pour une seule raison : elle est maintenant
    TESTÉE (`arbre-affichage.test.ts`), y compris par un test d'INVARIANT. Sur une donnée
    saine, cette condition ne change strictement rien — c'est ce qui rendait sa disparition
    invisible, et c'est ce que le test d'invariant ferme.

    `basculer` porte l'AUTRE barrière, celle du clic, et elle ne suffit pas : `allerA` écrit
    dans `deplies` sans passer par elle. CELLE-CI EST LA SEULE À BORNER LA RÉCURSION.
  */
  const deplie = noeudDeplie(membre.id, etat.deplies, ancetres)
  const chargement = etat.enCours.includes(membre.id)
  const page = etat.noeuds[membre.id]
  const erreur = etat.erreurs[membre.id]
  const estCible = cibleId === membre.id

  // D104 : l'indentation est PLAFONNÉE. Au-delà, le niveau est écrit en toutes lettres —
  // c'est l'information que le décalage ne peut plus porter. Cinq valeurs possibles, donc
  // cinq classes : les deux `style={{ marginLeft }}` du dépôt disparaissent avec ce calcul.
  //
  // ⚠️ `classeDeRetrait` CHOISIT DANS UNE TABLE DE LITTÉRAUX ; elle ne construit pas le nom.
  // Un gabarit `retrait-${…}` ne produirait aucune règle CSS — Tailwind balaye le source,
  // il n'exécute pas le JavaScript —, et le nœud sortirait sans indentation, en silence.
  // MESURÉ, PAS SUPPOSÉ : voir le commentaire de `CLASSES_RETRAIT`.
  const classeRetrait = classeDeRetrait(profondeur)

  const nomAffiche = membre.prenom ? `${membre.prenom} ${membre.nom}` : membre.nom

  return (
    <li className={classeRetrait}>
      {/*
        D106 — LE RAIL, ET LE SURLIGNAGE DE LA CIBLE. `bg-amber-50 font-medium` devient une
        mise en évidence par le rail et le poids : le système de jetons ne fournit aucune
        couleur de fond d'état (voir `Carte`, Task 5), et un fond ambre serait une valeur
        que la conception n'a pas arbitrée.
      */}
      <div
        className={`flex flex-wrap items-baseline gap-esp-3 rounded-bord px-esp-2 py-esp-1 ${
          profondeur > 0 ? 'rail-filiation' : ''
        }${estCible ? ' border border-etat-attente' : ''}`}
      >
        <Bouton variante="lien" onClick={() => basculer(membre.id, ancetres)} aria-expanded={deplie}>
          {deplie ? '▾' : '▸'} {nomAffiche}
        </Bouton>

        {page ? (
          <span className="chiffres-alignes text-petit text-encre-attenuee">
            {page.total} disciple{page.total > 1 ? 's' : ''}
          </span>
        ) : null}

        {profondeur > PROFONDEUR_MAX_INDENTATION ? (
          <span className="chiffres-alignes text-petit text-encre-attenuee">
            niveau {profondeur + 1}
          </span>
        ) : null}

        <Link
          href={`/membres/${membre.id}`}
          className="cible-tactile text-petit text-action underline underline-offset-4"
        >
          Fiche
        </Link>

        {/*
          UN LIEN, PAS UN POUVOIR. `estAdmin` sert ici à DÉCIDER D'AFFICHER, jamais à
          protéger : la barrière est `exigerAdministrateur` dans `/membres/[id]/arbre`.
          D92 : l'arbre lui-même n'écrit rien, et le rattachement reste sur la fiche, où la
          portée d'autorité, le verrou consultatif et l'anti-cycle sont déjà éprouvés.
        */}
        {estAdmin ? (
          <Link
            href={`/membres/${membre.id}/arbre`}
            className="cible-tactile text-petit text-action underline underline-offset-4"
          >
            Rattacher
          </Link>
        ) : null}
      </div>

      {deplie ? (
        <div>
          {chargement && !page ? (
            <p className="px-esp-2 py-esp-1 text-petit text-encre-attenuee">Chargement…</p>
          ) : null}

          {erreur ? (
            <p role="alert" className="px-esp-2 py-esp-1 text-petit text-etat-refus">
              {erreur}
            </p>
          ) : null}

          {page && page.disciples.length === 0 && !erreur ? (
            <p className="px-esp-2 py-esp-1 text-petit text-encre-attenuee">
              Aucun disciple actif rattaché.
            </p>
          ) : null}

          {page && page.disciples.length > 0 ? (
            <ul className="flex flex-col gap-esp-1">
              {page.disciples.map((disciple) => (
                <Noeud
                  key={disciple.id}
                  membre={disciple}
                  profondeur={profondeur + 1}
                  // D105 : la branche courante s'allonge d'un cran à chaque niveau.
                  ancetres={[...ancetres, membre.id]}
                  etat={etat}
                  cibleId={cibleId}
                  estAdmin={estAdmin}
                  basculer={basculer}
                  changerPage={changerPage}
                />
              ))}
            </ul>
          ) : null}

          {page ? (
            <div className="retrait-1 px-esp-2 py-esp-1">
              <Pagination
                page={page.page}
                pages={page.pages}
                indicateur
                enCours={chargement}
                surChangement={(numero) => changerPage(membre.id, numero)}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}
