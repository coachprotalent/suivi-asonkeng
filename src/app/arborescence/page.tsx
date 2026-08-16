import { EnTetePage } from '@/composants/ui/en-tete-page'
import { racinesPage } from '@/lib/donnees/arbre'
import { TAILLE_PAGE_RACINES } from '@/lib/donnees/arbre-lots'
import { pageDemandee } from '@/lib/donnees/pagination'
import { bornerPage } from '@/lib/navigation/bornage'
import { estAdministrateur, exigerProfilActif } from '@/lib/securite/garde'
import { Arborescence } from './arborescence'

/**
 * L'arbre des faiseurs de disciple, parcourable (D91).
 *
 * CONSULTATION OUVERTE À TOUT COMPTE ACTIF (`exigerProfilActif`), conformément à D2 et
 * D20 : toute fiche `actif` est lisible de tout compte actif, filiation comprise. Le
 * contenu de l'arbre est donc, en droit, ouvert à tous — et D93 (filtre explicite
 * `etat = 'actif'`) fait que TOUS voient LE MÊME ARBRE : les fiches `en_attente` et
 * `archive` n'apparaissent pas parce qu'une RÈGLE ÉNONCÉE les exclut pour tout le monde,
 * et non parce que la RLS les cacherait à certains.
 *
 * `estAdministrateur()` n'est employé ici que pour DÉCIDER D'AFFICHER le lien
 * « Rattacher » vers l'écran existant — UN LIEN, PAS UN POUVOIR. La protection de ce geste
 * est `exigerAdministrateur` dans `/membres/[id]/arbre`, et elle seule.
 *
 * D92 — CET ÉCRAN EST EN CONSULTATION SEULE. Il ne porte aucune Server Action d'écriture,
 * et il ne doit pas s'en mettre à en porter : le rattachement reste sur la fiche, où la
 * portée d'autorité, le verrou consultatif et l'anti-cycle sont déjà éprouvés.
 */
export default async function PageArborescence({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  await exigerProfilActif()
  const parametres = await searchParams
  const page = pageDemandee(parametres.page)

  const [{ lignes: racines, total }, estAdmin] = await Promise.all([
    racinesPage(page),
    estAdministrateur(),
  ])

  // D121 — LE BORNAGE EST EXTRAIT, À COMPORTEMENT IDENTIQUE (src/lib/navigation/bornage.ts).
  // Une adresse pointant au-delà de la dernière page réelle est un signet périmé (ou une
  // liste qui a rétréci depuis). Sans ce garde, l'en-tête annoncerait « page 99 sur 2 »
  // pendant que le corps affirmerait qu'il n'y a personne — deux vérités contradictoires
  // sur le même écran. Pas de boucle possible : `nombreDePages` vaut toujours au moins 1, et
  // la cible est ce nombre lui-même.
  // HORS de tout `try` : `bornerPage` appelle `redirect()`, qui lève une exception de
  // contrôle Next.js (aucun `try` dans ce fichier — vérifié).
  const pages = bornerPage(page, total, TAILLE_PAGE_RACINES, (numero) => `/arborescence?page=${numero}`)

  return (
    <main className="mx-auto max-w-3xl px-esp-6 py-esp-10">
      <EnTetePage
        retour={{ href: '/tableau-de-bord', libelle: 'Retour au tableau de bord' }}
        titre="Arborescence"
        /*
          LA LÉGENDE DIT EXACTEMENT CE QUE LE CODE FAIT, ET PAS UN MOT DE PLUS.
          « Seuls les membres actifs y figurent » est vrai parce que les TROIS lectures de
          cet écran portent un `etat = 'actif'` ÉCRIT — les disciples, les racines, et les
          noms des maillons du chemin —, et non parce que la RLS cacherait quelque chose à
          certains. La seconde phrase existe parce que la première, seule, serait un
          demi-mensonge : un maillon non actif ne DISPARAÎT pas du chemin, il y garde sa
          place sans nom, faute de quoi l'écran mentirait sur la profondeur. Ne pas retirer
          cette phrase sans retirer le repli qu'elle décrit.
        */
        soustitre={
          <>
            L&apos;arbre des faiseurs de disciple, déplié à la demande. Seuls les membres
            actifs y figurent ; dans le chemin d&apos;une personne, un maillon qui ne
            l&apos;est pas garde sa place, sans son nom.
          </>
        }
      />

      {/*
        D95 — « MEMBRES SANS FAISEUR DE DISCIPLE », et « racines de l'arbre » en glose.
        Appeler « racine » une fiche que personne n'a rattachée prêterait une INTENTION à
        un OUBLI : `creerMembre` n'a jamais écrit de `faiseur_de_disciple_id`, donc toute
        fiche créée depuis la phase 1a en est une jusqu'à ce que quelqu'un ouvre l'écran de
        rattachement.

        LE TOTAL EST AFFICHÉ SANS EUPHÉMISME : c'est LA MESURE qui dira si la création
        enrichie (volet 1) réduit le nombre de racines involontaires.
      */}
      <Arborescence
        racines={racines}
        totalRacines={total}
        page={page}
        pages={pages}
        estAdmin={estAdmin}
      />
    </main>
  )
}
