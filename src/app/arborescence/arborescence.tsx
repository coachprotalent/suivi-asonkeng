'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { SelecteurMembre } from '@/app/membres/selecteur-membre'
import type { MaillonNomme } from '@/lib/domaine/arbre'
// La CONSTANTE, jamais la chaîne recopiée : trois copies du même texte en feraient trois
// vérités, et c'est exactement ce que D100 vient de supprimer.
import { LIBELLE_FICHE_NON_CONSULTABLE } from '@/lib/domaine/membre'
import type { MembreBref } from '@/lib/donnees/membres'
import { chargerChemin, chargerDisciples, pageContenant, type PageDisciples } from './actions'
import {
  MESSAGE_CHEMIN_PARTIEL,
  MESSAGE_ECHEC_LECTURE_CHEMIN,
  MESSAGE_ECHEC_LECTURE_NOEUD,
} from './messages'

/**
 * ═══ D104 — L'INDENTATION EST PLAFONNÉE, ET LE FIL D'ARIANE PORTE LE RESTE ═══
 * Interface mobile d'abord (§3 de la spécification maîtresse). Une indentation
 * proportionnelle à la profondeur épuise la largeur d'un téléphone vers le cinquième
 * niveau, et l'arbre devient illisible LÀ OÙ IL EST LE PLUS CONSULTÉ. Au-delà du plafond,
 * le niveau est écrit en toutes lettres sur le nœud : c'est l'information que
 * l'indentation ne peut plus porter.
 */
const PROFONDEUR_MAX_INDENTATION = 4
const DECALAGE_PAR_NIVEAU_REM = 1.25

type Props = {
  racines: MembreBref[]
  totalRacines: number
  page: number
  pages: number
  estAdmin: boolean
}

type EtatArbre = {
  /** Une page de disciples par nœud déjà chargé. */
  noeuds: Record<string, PageDisciples>
  /** Nœuds actuellement dépliés. */
  deplies: string[]
  /** Nœuds en cours de chargement. */
  enCours: string[]
  /** Message d'échec par nœud. STATIQUE : voir `messages.ts`. */
  erreurs: Record<string, string>
}

const etatInitial: EtatArbre = { noeuds: {}, deplies: [], enCours: [], erreurs: {} }

export function Arborescence({ racines, totalRacines, page, pages, estAdmin }: Props) {
  const [etat, setEtat] = useState<EtatArbre>(etatInitial)
  const [chemin, setChemin] = useState<MaillonNomme[] | null>(null)
  const [cibleId, setCibleId] = useState<string | null>(null)
  const [erreurChemin, setErreurChemin] = useState<string | null>(null)
  // Le chemin a bien été lu, mais l'arbre n'a pas pu être déplié JUSQU'À la cible. Distinct
  // d'`erreurChemin` : là, rien n'est affiché ; ici, le fil d'Ariane est juste et seul
  // l'arbre est incomplet. Les confondre dirait à l'utilisateur que rien n'a marché alors
  // qu'il a sous les yeux le chemin complet.
  const [avertissementChemin, setAvertissementChemin] = useState<string | null>(null)
  const [rechercheEnCours, demarrerRecherche] = useTransition()

  async function lireNoeud(membreId: string, numeroPage: number): Promise<PageDisciples | null> {
    setEtat((precedent) => ({
      ...precedent,
      enCours: [...precedent.enCours, membreId],
      erreurs: { ...precedent.erreurs, [membreId]: '' },
    }))
    try {
      const resultat = await chargerDisciples(membreId, numeroPage)
      setEtat((precedent) => ({
        ...precedent,
        noeuds: { ...precedent.noeuds, [membreId]: resultat },
        enCours: precedent.enCours.filter((identifiant) => identifiant !== membreId),
      }))
      return resultat
    } catch (erreur) {
      // JAMAIS `error.message` : ce composant ATTRAPE l'exception, et c'est précisément le
      // cas où React la remplace par un digest en build de PRODUCTION. On affiche un texte
      // STATIQUE, et l'objet part dans la console du navigateur, où il reste exploitable.
      console.error('arborescence : lecture des disciples impossible', { membreId, erreur })
      setEtat((precedent) => ({
        ...precedent,
        enCours: precedent.enCours.filter((identifiant) => identifiant !== membreId),
        erreurs: { ...precedent.erreurs, [membreId]: MESSAGE_ECHEC_LECTURE_NOEUD },
      }))
      return null
    }
  }

  /**
   * ═══ D105 — REFUS DE REDÉPLIER UN NŒUD DÉJÀ PRÉSENT DANS LA BRANCHE COURANTE ═══
   *
   * Les deux barrières anti-cycle (`membres_anti_cycle`, et la vérification de
   * `public.definir_arbre`) rendent un cycle IMPOSSIBLE DANS LA DONNÉE. L'AFFICHAGE NE
   * DOIT PAS EN DÉPENDRE : un dépliage automatique piloté par la recherche, sur une donnée
   * corrompue, BOUCLERAIT DANS LE NAVIGATEUR — l'onglet se fige, et rien n'indique
   * pourquoi. Même raisonnement que la borne à 64 niveaux des fonctions récursives, « la
   * seule protection restante si une donnée corrompue franchissait un jour les barrières »
   * (1c, piège n°5).
   *
   * `ancetres` porte les identifiants des nœuds AU-DESSUS de celui-ci dans la branche
   * RENDUE — pas dans l'arbre en base : c'est bien le cycle d'AFFICHAGE qu'on ferme.
   */
  function basculer(membreId: string, ancetres: readonly string[]) {
    if (ancetres.includes(membreId)) {
      console.error(
        'arborescence : dépliage refusé, ce membre est déjà présent dans la branche affichée — donnée incohérente ?',
        { membreId, ancetres },
      )
      return
    }
    const dejaDeplie = etat.deplies.includes(membreId)
    if (dejaDeplie) {
      setEtat((precedent) => ({
        ...precedent,
        deplies: precedent.deplies.filter((identifiant) => identifiant !== membreId),
      }))
      return
    }
    setEtat((precedent) => ({ ...precedent, deplies: [...precedent.deplies, membreId] }))
    if (!etat.noeuds[membreId]) {
      void lireNoeud(membreId, 1)
    }
  }

  function changerPage(membreId: string, numeroPage: number) {
    void lireNoeud(membreId, numeroPage)
  }

  /**
   * ═══ D97 — LA RECHERCHE MÈNE À UNE PERSONNE, ET MONTRE LES DEUX CHOSES À LA FOIS ═══
   *
   * Son CHEMIN DEPUIS LA RACINE, déplié, la personne mise en évidence, ET la première page
   * de SES disciples. Montrer la seule personne perdrait le « où dans l'arbre », qui est
   * toute la raison d'être de cet écran — on l'a déjà sur `/membres/[id]`. Montrer les
   * seuls ancêtres ne répondrait pas à « qui suit-il ? ». C'est le SEUL état de l'écran
   * qui répond aux deux questions à la fois.
   *
   * ═══ CHAQUE MAILLON EST CHARGÉ DANS LA PAGE QUI CONTIENT LE MAILLON SUIVANT ═══
   *
   * PAS la page 1. Le rendu d'un nœud ne montre que les disciples de la page CHARGÉE : si
   * un maillon du chemin a plus de `TAILLE_PAGE_DISCIPLES` disciples et que le maillon
   * suivant n'est pas dans la première page de son tri `(nom, prenom, id)`, la branche
   * S'ARRÊTE LÀ. La personne cherchée n'est jamais rendue, `cibleId` ne surligne rien, et
   * le fil d'Ariane, lui, continue d'afficher le chemin complet — deux vérités
   * contradictoires sur le même écran. À l'échelle visée par la conception (« un millier
   * de membres ou plus »), c'est le cas normal, pas le cas limite.
   *
   * ═══ ET SI LE CALCUL NE SUFFIT PAS, ON LE DIT ═══
   *
   * `pageContenant` rend `1` quand elle ne sait pas — maillon devenu illisible ou non
   * actif, branche modifiée entre deux lectures. On ne lui fait donc pas confiance sur
   * parole : après chaque chargement, on VÉRIFIE que le maillon suivant figure bien dans
   * la page obtenue. Sinon, l'arbre est incomplet, et un message le dit. Un dépliage
   * silencieusement tronqué serait pire qu'un dépliage refusé.
   */
  function allerA(membre: MembreBref | null) {
    if (!membre) {
      setChemin(null)
      setCibleId(null)
      setErreurChemin(null)
      setAvertissementChemin(null)
      return
    }
    demarrerRecherche(async () => {
      setErreurChemin(null)
      setAvertissementChemin(null)
      let maillons: MaillonNomme[]
      try {
        maillons = await chargerChemin(membre.id)
      } catch (erreur) {
        console.error('arborescence : lecture du chemin impossible', { membreId: membre.id, erreur })
        setErreurChemin(MESSAGE_ECHEC_LECTURE_CHEMIN)
        return
      }
      setChemin(maillons)
      setCibleId(membre.id)
      // Déplier toute la branche : chaque maillon, plus la cible elle-même. Les maillons
      // sont distincts par construction (`ancetres_membre` remonte une chaîne), donc
      // aucune boucle ici — mais `basculer` reste la seule porte du dépliage manuel, et
      // c'est elle qui porte la barrière de D105.
      setEtat((precedent) => ({
        ...precedent,
        deplies: Array.from(new Set([...precedent.deplies, ...maillons.map((m) => m.id)])),
      }))

      let brancheComplete = true
      for (let indice = 0; indice < maillons.length; indice += 1) {
        const suivant = maillons[indice + 1]

        // Le DERNIER maillon est la cible elle-même : on affiche la PREMIÈRE page de SES
        // disciples, il n'y a pas de « suivant » à atteindre.
        let numero = 1
        if (suivant) {
          try {
            numero = await pageContenant(maillons[indice].id, suivant.id)
          } catch (erreur) {
            // Un échec de calcul n'interrompt pas le dépliage : on retombe sur la page 1,
            // et la vérification ci-dessous constatera, ou non, que cela suffisait.
            console.error('arborescence : calcul de la page du maillon suivant impossible', {
              parentId: maillons[indice].id,
              discipleId: suivant.id,
              erreur,
            })
          }
        }

        const page = await lireNoeud(maillons[indice].id, numero)
        if (page === null) {
          // `lireNoeud` a déjà posé le message d'échec SUR CE NŒUD. La branche s'arrête.
          brancheComplete = false
          break
        }
        if (suivant && !page.disciples.some((disciple) => disciple.id === suivant.id)) {
          brancheComplete = false
          break
        }
      }

      if (!brancheComplete) {
        setAvertissementChemin(MESSAGE_CHEMIN_PARTIEL)
      }
    })
  }

  const enModeRecherche = chemin !== null && chemin.length > 0

  return (
    <div className="flex flex-col gap-8">
      <SelecteurMembre
        nom="rechercheArborescence"
        label="Aller à une personne"
        aide="Saute directement à quelqu'un dans l'arbre, et déplie son chemin depuis la racine."
        valeur={null}
        surChoix={allerA}
        exclureId={null}
      />

      {rechercheEnCours ? <p className="text-sm text-neutral-500">Chargement du chemin…</p> : null}

      {erreurChemin ? (
        <p role="alert" className="text-sm text-red-600">
          {erreurChemin}
        </p>
      ) : null}

      {/*
        AVERTISSEMENT, PAS ERREUR : le chemin ci-dessous est juste et complet ; c'est
        l'arbre qui n'a pas pu être déplié jusqu'au bout. `role="status"` et non `alert` —
        rien n'a échoué, et rien n'est perdu pour l'utilisateur, qui garde le fil d'Ariane.
      */}
      {avertissementChemin ? (
        <p role="status" className="text-sm text-amber-700">
          {avertissementChemin}
        </p>
      ) : null}

      {enModeRecherche ? (
        <section className="flex flex-col gap-4">
          {/*
            D104 — LE FIL D'ARIANE porte l'information que l'indentation ne peut plus
            porter au-delà du plafond. Chaque maillon est cliquable ; un maillon illisible
            (« Fiche non consultable ») ne l'est pas, et GARDE SA PLACE — l'effacer ferait
            mentir l'écran sur la profondeur (D98).
          */}
          <nav aria-label="Chemin depuis la racine" className="text-sm text-neutral-600">
            {chemin!.map((maillon, indice) => (
              <span key={maillon.id}>
                {indice > 0 ? ' → ' : ''}
                {maillon.libelle === LIBELLE_FICHE_NON_CONSULTABLE ? (
                  <span className="italic text-neutral-500">{maillon.libelle}</span>
                ) : (
                  <Link href={`/membres/${maillon.id}`} className="underline underline-offset-4">
                    {maillon.libelle}
                  </Link>
                )}
              </span>
            ))}
          </nav>

          <ul className="flex flex-col gap-1">
            <Noeud
              membre={{ id: chemin![0].id, nom: chemin![0].libelle, prenom: '' }}
              profondeur={0}
              ancetres={[]}
              etat={etat}
              cibleId={cibleId}
              estAdmin={estAdmin}
              basculer={basculer}
              changerPage={changerPage}
            />
          </ul>

          <button
            type="button"
            onClick={() => allerA(null)}
            className="self-start text-sm underline underline-offset-4"
          >
            Revenir aux membres sans faiseur de disciple
          </button>
        </section>
      ) : (
        <section className="flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-medium">Membres sans faiseur de disciple</h2>
            <p className="text-sm text-neutral-500">
              {totalRacines} membre{totalRacines > 1 ? 's' : ''} — ce sont les racines de
              l&apos;arbre.
              {pages > 1 ? ` Page ${page} sur ${pages}.` : ''}
            </p>
          </div>

          {racines.length === 0 ? (
            <p className="text-sm text-neutral-600">
              Aucun membre actif sans faiseur de disciple.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {racines.map((racine) => (
                <Noeud
                  key={racine.id}
                  membre={racine}
                  profondeur={0}
                  ancetres={[]}
                  etat={etat}
                  cibleId={cibleId}
                  estAdmin={estAdmin}
                  basculer={basculer}
                  changerPage={changerPage}
                />
              ))}
            </ul>
          )}

          {pages > 1 ? (
            <nav aria-label="Pagination" className="flex items-center justify-between gap-4">
              {page > 1 ? (
                <Link
                  href={`/arborescence?page=${page - 1}`}
                  className="text-sm underline underline-offset-4"
                >
                  Page précédente
                </Link>
              ) : (
                <span />
              )}
              {page < pages ? (
                <Link
                  href={`/arborescence?page=${page + 1}`}
                  className="text-sm underline underline-offset-4"
                >
                  Page suivante
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </section>
      )}
    </div>
  )
}

type PropsNoeud = {
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
 * focus et rejouant les chargements.
 *
 * D101 — TOUT MEMBRE ACTIF EST DÉPLIABLE, sans indicateur pré-calculé. Un indicateur par
 * enfant, ce serait UNE REQUÊTE PAR ENFANT (N+1) ; l'alternative serait une vue
 * d'agrégation permanente, avec sa RLS à écrire et à prouver, POUR UN CHEVRON. Déplier une
 * feuille affiche « Aucun disciple actif rattaché. » — un aller-retour de trop, à la
 * demande, plutôt que N requêtes systématiques que personne n'a demandées.
 */
function Noeud({
  membre,
  profondeur,
  ancetres,
  etat,
  cibleId,
  estAdmin,
  basculer,
  changerPage,
}: PropsNoeud) {
  const deplie = etat.deplies.includes(membre.id)
  const chargement = etat.enCours.includes(membre.id)
  const page = etat.noeuds[membre.id]
  const erreur = etat.erreurs[membre.id]
  const estCible = cibleId === membre.id

  // D104 : l'indentation est PLAFONNÉE. Au-delà, le niveau est écrit en toutes lettres —
  // c'est l'information que le décalage ne peut plus porter.
  const decalage = Math.min(profondeur, PROFONDEUR_MAX_INDENTATION) * DECALAGE_PAR_NIVEAU_REM

  const nomAffiche = membre.prenom ? `${membre.prenom} ${membre.nom}` : membre.nom

  return (
    <li style={{ marginLeft: `${decalage}rem` }}>
      <div
        className={`flex flex-wrap items-baseline gap-3 rounded-md px-2 py-1 ${
          estCible ? 'bg-amber-50 font-medium' : ''
        }`}
      >
        <button
          type="button"
          onClick={() => basculer(membre.id, ancetres)}
          aria-expanded={deplie}
          className="text-sm underline underline-offset-4"
        >
          {deplie ? '▾' : '▸'} {nomAffiche}
        </button>

        {page ? (
          <span className="text-xs text-neutral-500">
            {page.total} disciple{page.total > 1 ? 's' : ''}
          </span>
        ) : null}

        {profondeur > PROFONDEUR_MAX_INDENTATION ? (
          <span className="text-xs text-neutral-500">niveau {profondeur + 1}</span>
        ) : null}

        <Link href={`/membres/${membre.id}`} className="text-xs underline underline-offset-4">
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
            className="text-xs underline underline-offset-4"
          >
            Rattacher
          </Link>
        ) : null}
      </div>

      {deplie ? (
        <div>
          {chargement && !page ? (
            <p className="px-2 py-1 text-xs text-neutral-500">Chargement…</p>
          ) : null}

          {erreur ? (
            <p role="alert" className="px-2 py-1 text-xs text-red-600">
              {erreur}
            </p>
          ) : null}

          {page && page.disciples.length === 0 && !erreur ? (
            <p className="px-2 py-1 text-xs text-neutral-600">Aucun disciple actif rattaché.</p>
          ) : null}

          {page && page.disciples.length > 0 ? (
            <ul className="flex flex-col gap-1">
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

          {page && page.pages > 1 ? (
            <div
              className="flex items-center gap-4 px-2 py-1 text-xs"
              style={{ marginLeft: `${DECALAGE_PAR_NIVEAU_REM}rem` }}
            >
              <button
                type="button"
                disabled={page.page <= 1 || chargement}
                onClick={() => changerPage(membre.id, page.page - 1)}
                className="underline underline-offset-4 disabled:no-underline disabled:opacity-40"
              >
                Page précédente
              </button>
              <span className="text-neutral-500">
                page {page.page} sur {page.pages}
              </span>
              <button
                type="button"
                disabled={page.page >= page.pages || chargement}
                onClick={() => changerPage(membre.id, page.page + 1)}
                className="underline underline-offset-4 disabled:no-underline disabled:opacity-40"
              >
                Page suivante
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}
