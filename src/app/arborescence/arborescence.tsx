'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { SelecteurMembre } from '@/app/membres/selecteur-membre'
import { Bouton } from '@/composants/ui/bouton'
import { Pagination } from '@/composants/ui/pagination'
import { Refus } from '@/composants/ui/refus'
import { basculeRefusee } from '@/lib/domaine/arbre-affichage'
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
import { Noeud } from './noeud'

type Props = {
  racines: MembreBref[]
  totalRacines: number
  page: number
  pages: number
  estAdmin: boolean
}

/**
 * EXPORTÉ pour `./noeud.tsx`, qui l'importe EN TYPE SEUL. Voir le commentaire d'import de
 * ce fichier-là : le cycle d'import qui en résulte est effacé à la compilation, et il ne
 * doit jamais devenir un cycle de valeurs.
 */
export type EtatArbre = {
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
   * Les deux barrières de la DONNÉE (`membres_anti_cycle`, et la vérification de
   * `public.definir_arbre`) rendent un cycle IMPOSSIBLE EN BASE. L'AFFICHAGE NE DOIT PAS EN
   * DÉPENDRE : un dépliage automatique piloté par la recherche, sur une donnée corrompue,
   * BOUCLERAIT DANS LE NAVIGATEUR — l'onglet se fige, et rien n'indique pourquoi.
   *
   * CE REFUS-CI NE FERME QUE LE CLIC, et il ne suffit pas : `allerA` écrit dans `deplies`
   * sans passer par ici. La barrière qui BORNE RÉELLEMENT LA RÉCURSION est `noeudDeplie`,
   * appliquée dans `Noeud` (`./noeud.tsx`). Celle-ci reste parce qu'elle est la seule à
   * pouvoir DIRE quelque chose — une trace de console à l'instant du geste.
   *
   * La CONDITION est extraite dans `basculeRefusee` (`@/lib/domaine/arbre-affichage`) pour
   * être testée ; la TRACE reste ici, où elle a un sens.
   */
  function basculer(membreId: string, ancetres: readonly string[]) {
    if (basculeRefusee(membreId, ancetres)) {
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
      // aucune boucle ici — mais ON NE S'APPUIE PAS SUR CE RAISONNEMENT : cette écriture ne
      // passe PAS par `basculer`, et la barrière de D105 qui protège de la récursion est
      // celle du RENDU (`noeudDeplie`, voir `./noeud.tsx`), pas celle du clic.
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
    <div className="flex flex-col gap-esp-8">
      <SelecteurMembre
        nom="rechercheArborescence"
        label="Aller à une personne"
        aide="Saute directement à quelqu'un dans l'arbre, et déplie son chemin depuis la racine."
        valeur={null}
        surChoix={allerA}
        exclureId={null}
      />

      {rechercheEnCours ? (
        <p className="text-petit text-encre-attenuee">Chargement du chemin…</p>
      ) : null}

      <Refus message={erreurChemin} />

      {/*
        AVERTISSEMENT, PAS ERREUR : le chemin ci-dessous est juste et complet ; c'est
        l'arbre qui n'a pas pu être déplié jusqu'au bout. `role="status"` et non `alert` —
        rien n'a échoué, et rien n'est perdu pour l'utilisateur, qui garde le fil d'Ariane.
      */}
      {avertissementChemin ? (
        <p role="status" className="text-petit text-etat-attente">
          {avertissementChemin}
        </p>
      ) : null}

      {enModeRecherche ? (
        <section className="flex flex-col gap-esp-4">
          {/*
            D104 — LE FIL D'ARIANE porte l'information que l'indentation ne peut plus
            porter au-delà du plafond. Chaque maillon est cliquable ; un maillon illisible
            (« Fiche non consultable ») ne l'est pas, et GARDE SA PLACE — l'effacer ferait
            mentir l'écran sur la profondeur (D98).

            D110 — CE FIL D'ARIANE N'EST PAS UN COMPOSANT, ET IL NE DOIT PAS LE DEVENIR :
            il n'existe que sur cet écran, et le socle s'arrête à douze composants dont
            chacun se répète au moins dix fois.
          */}
          <nav aria-label="Chemin depuis la racine" className="text-petit text-encre-attenuee">
            {chemin!.map((maillon, indice) => (
              <span key={maillon.id}>
                {indice > 0 ? ' → ' : ''}
                {maillon.libelle === LIBELLE_FICHE_NON_CONSULTABLE ? (
                  <span className="italic text-encre-attenuee">{maillon.libelle}</span>
                ) : (
                  <Link
                    href={`/membres/${maillon.id}`}
                    className="text-action underline underline-offset-4"
                  >
                    {maillon.libelle}
                  </Link>
                )}
              </span>
            ))}
          </nav>

          <ul className="flex flex-col gap-esp-1">
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

          <Bouton variante="lien" alignement="debut" onClick={() => allerA(null)}>
            Revenir aux membres sans faiseur de disciple
          </Bouton>
        </section>
      ) : (
        <section className="flex flex-col gap-esp-4">
          <div>
            <h2 className="text-section">Membres sans faiseur de disciple</h2>
            <p className="chiffres-alignes text-petit text-encre-attenuee">
              {totalRacines} membre{totalRacines > 1 ? 's' : ''} — ce sont les racines de
              l&apos;arbre.
              {pages > 1 ? ` Page ${page} sur ${pages}.` : ''}
            </p>
          </div>

          {racines.length === 0 ? (
            <p className="text-corps text-encre-attenuee">
              Aucun membre actif sans faiseur de disciple.
            </p>
          ) : (
            <ul className="flex flex-col gap-esp-1">
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

          <Pagination page={page} pages={pages} lienVersPage={(numero) => `/arborescence?page=${numero}`} />
        </section>
      )}
    </div>
  )
}
