import Link from 'next/link'
import { Bouton } from './bouton'

/*
  ═══ LE MÊME `<nav aria-label="Pagination">` ÉCRIT QUATRE FOIS ═══

  Relevé du 2026-08-16 (`grep -rln 'Page précédente\|Page suivante' src --include="*.tsx"`) :
  quatre fichiers, dont `arborescence/arborescence.tsx` qui le RÉÉCRIT DEUX FOIS dans le
  même fichier, pour deux listes différentes. Les libellés, eux, sont stables : « Page
  précédente » et « Page suivante », à l'octet près, partout. D117 : ILS NE CHANGENT PAS.

  ═══ DEUX RÉGIMES, PARCE QUE LE DÉPÔT EN A DEUX ═══

  - PAR LIEN — pagination d'écran, portée par l'adresse : `/membres`, `/evenements`,
    `/demandes`, `/arborescence` (liste des racines). C'est de la navigation : un `<Link>`,
    partageable, ouvrable dans un nouvel onglet.
  - PAR BOUTON — pagination D'UN NŒUD de l'arbre (`arborescence.tsx:518-543`), qui charge
    une page de disciples SANS quitter l'écran ni changer l'adresse. Un `<Link>` y serait
    faux : il n'existe aucune adresse qui décrive « la page 2 des disciples de ce nœud-ci ».

  Les deux régimes sont MUTUELLEMENT EXCLUSIFS dans le type : porter les deux produirait un
  lien qui, en plus de naviguer, déclencherait un chargement.

  ═══ LES `<span />` VIDES SONT INTENTIONNELS ═══

  `justify-between` avec un seul enfant colle ce lien à gauche. Les quatre paginations
  existantes rendent toutes un `<span />` à la place du lien absent, pour que « Page
  suivante » reste à droite quand on est sur la première page. Reproduit tel quel.
*/
export type ProprietesPagination =
  | {
      page: number
      pages: number
      lienVersPage: (page: number) => string
      indicateur?: boolean
      surChangement?: never
      enCours?: never
    }
  | {
      page: number
      pages: number
      surChangement: (page: number) => void
      indicateur?: boolean
      enCours?: boolean
      lienVersPage?: never
    }

const LIBELLE_PRECEDENTE = 'Page précédente'
const LIBELLE_SUIVANTE = 'Page suivante'

export function Pagination(proprietes: ProprietesPagination) {
  const { page, pages, indicateur = false } = proprietes

  /*
    Les quatre paginations existantes sont toutes sous `{pages > 1 ? … : null}`. Rendre une
    barre de navigation pour une liste d'une seule page ajouterait un repère `<nav>` que
    rien ne justifie, et un lecteur d'écran l'annoncerait.
  */
  if (pages <= 1) return null

  const precedente = page > 1
  const suivante = page < pages

  return (
    <nav
      aria-label="Pagination"
      className="chiffres-alignes flex items-center justify-between gap-esp-4"
    >
      {proprietes.lienVersPage ? (
        precedente ? (
          <Link
            href={proprietes.lienVersPage(page - 1)}
            className="cible-tactile text-petit text-action underline underline-offset-4"
          >
            {LIBELLE_PRECEDENTE}
          </Link>
        ) : (
          <span />
        )
      ) : (
        <Bouton
          variante="lien"
          disabled={!precedente || proprietes.enCours === true}
          onClick={() => proprietes.surChangement(page - 1)}
        >
          {LIBELLE_PRECEDENTE}
        </Bouton>
      )}

      {indicateur ? (
        <span className="text-petit text-encre-attenuee">
          page {page} sur {pages}
        </span>
      ) : null}

      {proprietes.lienVersPage ? (
        suivante ? (
          <Link
            href={proprietes.lienVersPage(page + 1)}
            className="cible-tactile text-petit text-action underline underline-offset-4"
          >
            {LIBELLE_SUIVANTE}
          </Link>
        ) : (
          <span />
        )
      ) : (
        <Bouton
          variante="lien"
          disabled={!suivante || proprietes.enCours === true}
          onClick={() => proprietes.surChangement(page + 1)}
        >
          {LIBELLE_SUIVANTE}
        </Bouton>
      )}
    </nav>
  )
}
