import Link from 'next/link'
import { redirect } from 'next/navigation'
import { racinesPage } from '@/lib/donnees/arbre'
import { TAILLE_PAGE_RACINES } from '@/lib/donnees/arbre-lots'
import { pageDemandee } from '@/lib/donnees/pagination'
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

  const pages = Math.max(1, Math.ceil(total / TAILLE_PAGE_RACINES))

  // Une adresse pointant au-delà de la dernière page réelle est un signet périmé (ou une
  // liste qui a rétréci depuis). Sans ce garde, l'en-tête annoncerait « page 99 sur 2 »
  // pendant que le corps affirmerait qu'il n'y a personne — deux vérités contradictoires
  // sur le même écran. Pas de boucle possible : `pages` vaut toujours au moins 1, et la
  // cible est `pages` lui-même.
  // HORS de tout `try` : `redirect()` lève une exception de contrôle Next.js (aucun `try`
  // ici de toute façon — vérifié).
  if (page > pages) {
    redirect(`/arborescence?page=${pages}`)
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/tableau-de-bord" className="text-sm underline underline-offset-4">
        Retour au tableau de bord
      </Link>

      <header className="mt-4 mb-8">
        <h1 className="text-2xl font-semibold">Arborescence</h1>
        {/*
          LA LÉGENDE DIT EXACTEMENT CE QUE LE CODE FAIT, ET PAS UN MOT DE PLUS.
          « Seuls les membres actifs y figurent » est vrai parce que les TROIS lectures de
          cet écran portent un `etat = 'actif'` ÉCRIT — les disciples, les racines, et les
          noms des maillons du chemin —, et non parce que la RLS cacherait quelque chose à
          certains. La seconde phrase existe parce que la première, seule, serait un
          demi-mensonge : un maillon non actif ne DISPARAÎT pas du chemin, il y garde sa
          place sans nom, faute de quoi l'écran mentirait sur la profondeur. Ne pas retirer
          cette phrase sans retirer le repli qu'elle décrit.
        */}
        <p className="mt-1 text-sm text-neutral-500">
          L&apos;arbre des faiseurs de disciple, déplié à la demande. Seuls les membres
          actifs y figurent ; dans le chemin d&apos;une personne, un maillon qui ne
          l&apos;est pas garde sa place, sans son nom.
        </p>
      </header>

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
