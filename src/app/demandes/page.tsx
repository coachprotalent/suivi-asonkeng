import Link from 'next/link'
import { redirect } from 'next/navigation'
import { dirigeantPropose } from '@/lib/domaine/arbre'
import { maillonArbre } from '@/lib/donnees/arbre'
import {
  listerDemandesEnAttente,
  mesDemandes,
  TAILLE_PAGE_DEMANDES,
  type DemandeListe,
} from '@/lib/donnees/demandes'
import { pageDemandee } from '@/lib/donnees/pagination'
import { membreBrefParId, type MembreBref } from '@/lib/donnees/membres'
import { rolesDuProfil } from '@/lib/donnees/profils'
import { exigerProfilActif } from '@/lib/securite/garde'
import { LigneDemandeAdmin } from './ligne-demande-admin'
import { LigneDemandePersonnelle } from './ligne-demande-personnelle'
import { MESSAGE_DEMANDE_CREEE } from './messages'

/**
 * `searchParams` est lu pour l'accusé `?demandeCreee=1` posé par
 * `creerDemandeSuivi` (mineur de la revue finale : la redirection promettait une
 * confirmation qu'aucun écran n'affichait — le jumeau exact de `?inscrit=1`, traité
 * en Important par la ronde de la Task 14). Aucun coût de rendu à l'arrivée : cette
 * route était déjà dynamique, comme toutes les autres, `exigerProfilActif()` lisant
 * les cookies.
 */
export default async function PageDemandes({
  searchParams,
}: {
  searchParams: Promise<{ demandeCreee?: string; page?: string; pageMiennes?: string }>
}) {
  const profil = await exigerProfilActif()
  const { demandeCreee, page: pageBrute, pageMiennes: pageMiennesBrute } = await searchParams
  const roles = await rolesDuProfil(profil.id)
  const estAdmin = roles.includes('administrateur')

  // DEUX PARAMÈTRES DISTINCTS : les deux sections vivent sur la même route, et un paramètre
  // unique ferait sauter les deux listes ensemble — un administrateur cherchant sa propre
  // troisième demande perdrait sa place dans la file « à traiter ».
  const pageATraiter = pageDemandee(pageBrute)
  const pageMiennes = pageDemandee(pageMiennesBrute)

  const { lignes: mesPropositions, total: totalMiennes } = await mesDemandes(profil.id, {
    page: pageMiennes,
  })
  const pagesMiennes = Math.max(1, Math.ceil(totalMiennes / TAILLE_PAGE_DEMANDES))

  let demandesEnAttente: DemandeListe[] = []
  let totalATraiter = 0
  const propositionsDirigeant: Record<string, MembreBref | null> = {}
  if (estAdmin) {
    const lue = await listerDemandesEnAttente({ page: pageATraiter })
    demandesEnAttente = lue.lignes
    totalATraiter = lue.total
    // LA BOUCLE ÉTAIT EN SÉRIE, ET LA TRONCATURE À MILLE ÉTAIT CE QUI L'EMPÊCHAIT DE FAIRE
    // DEUX MILLE ALLERS-RETOURS SÉQUENTIELS (I4 de la revue finale). Elle est désormais
    // bornée par la page — au plus 25 demandes —, et les allers-retours de chacune partent
    // ENSEMBLE plutôt qu'à la queue leu leu. Le parallélisme est sûr précisément PARCE QUE
    // la borne existe : sans elle, `Promise.all` sur une liste non bornée aurait remplacé
    // une lenteur par une rafale.
    const propositions = await Promise.all(
      demandesEnAttente.map(async (demande) => {
        if (demande.origine === 'demande_suivi' && demande.demandeurMembreId) {
          const maillon = await maillonArbre(demande.demandeurMembreId)
          const proposeId = dirigeantPropose(maillon)
          return [demande.id, proposeId ? await membreBrefParId(proposeId) : null] as const
        }
        // Aucune proposition de dirigeant (registre 1c, piège n°3). Trois cas y tombent :
        // origine `auto_inscription` ; origine `conversion_participant` (D66 — le demandeur
        // est l'administrateur qui a converti, et sa filiation n'a rien à voir avec la
        // personne convertie ; sa ligne ne rend d'ailleurs PAS `FormulaireValidationSuivi`,
        // qui est le seul consommateur de cette proposition) ; et le compte racine, sans
        // fiche liée (spec D11).
        return [demande.id, null] as const
      }),
    )
    for (const [id, propose] of propositions) propositionsDirigeant[id] = propose
  }
  const pagesATraiter = Math.max(1, Math.ceil(totalATraiter / TAILLE_PAGE_DEMANDES))

  // BORNE HAUTE DES DEUX PAGINATIONS, calculée APRÈS coup depuis le `total` REÇU DES
  // LECTURES ELLES-MÊMES — jamais par un aller-retour préalable (I1 de la ronde du
  // 2026-08-14). Aucune boucle possible : `pages` vaut toujours au moins 1 et la cible est
  // `pages` lui-même. HORS DE TOUT `try` (il n'y en a aucun dans ce fichier) — `redirect()`
  // lève une exception de contrôle.
  if (estAdmin && pageATraiter > pagesATraiter) {
    redirect(`/demandes?page=${pagesATraiter}&pageMiennes=${pageMiennes}`)
  }
  if (pageMiennes > pagesMiennes) {
    redirect(`/demandes?page=${pageATraiter}&pageMiennes=${pagesMiennes}`)
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <Link href="/tableau-de-bord" className="text-sm underline underline-offset-4">
        Retour au tableau de bord
      </Link>
      <h1 className="mt-4 mb-8 text-2xl font-semibold">Demandes</h1>

      {demandeCreee === '1' ? (
        <p
          role="status"
          className="mb-8 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800"
        >
          {MESSAGE_DEMANDE_CREEE}
        </p>
      ) : null}

      {estAdmin ? (
        <section className="mb-10">
          {/* LE TOTAL, PAS LA LONGUEUR DE LA PAGE. Afficher `demandesEnAttente.length`
              annoncerait « À traiter (25) » à un administrateur qui en a cent — le mensonge
              exact que `totalObligatoire` existe pour empêcher côté lecture. */}
          <h2 className="mb-4 text-lg font-medium">À traiter ({totalATraiter})</h2>
          {demandesEnAttente.length === 0 ? (
            <p className="text-sm text-neutral-500">Aucune demande en attente.</p>
          ) : (
            <ul className="divide-y divide-neutral-200">
              {demandesEnAttente.map((demande) => (
                <LigneDemandeAdmin
                  key={demande.id}
                  demande={demande}
                  dirigeantInitial={propositionsDirigeant[demande.id] ?? null}
                />
              ))}
            </ul>
          )}

          {pagesATraiter > 1 ? (
            <nav className="mt-6 flex items-center gap-4 text-sm">
              {pageATraiter > 1 ? (
                <Link
                  href={`/demandes?page=${pageATraiter - 1}&pageMiennes=${pageMiennes}`}
                  className="underline underline-offset-4"
                >
                  Page précédente
                </Link>
              ) : null}
              <span className="text-neutral-500">
                Page {pageATraiter} sur {pagesATraiter}
              </span>
              {pageATraiter < pagesATraiter ? (
                <Link
                  href={`/demandes?page=${pageATraiter + 1}&pageMiennes=${pageMiennes}`}
                  className="underline underline-offset-4"
                >
                  Page suivante
                </Link>
              ) : null}
            </nav>
          ) : null}
        </section>
      ) : null}

      <section>
        <h2 className="mb-4 text-lg font-medium">Mes demandes ({totalMiennes})</h2>
        {mesPropositions.length === 0 ? (
          <p className="text-sm text-neutral-500">Vous n&apos;avez soumis aucune demande.</p>
        ) : (
          <ul className="divide-y divide-neutral-200">
            {mesPropositions.map((demande) => (
              <LigneDemandePersonnelle key={demande.id} demande={demande} />
            ))}
          </ul>
        )}

        {pagesMiennes > 1 ? (
          <nav className="mt-6 flex items-center gap-4 text-sm">
            {pageMiennes > 1 ? (
              <Link
                href={`/demandes?page=${pageATraiter}&pageMiennes=${pageMiennes - 1}`}
                className="underline underline-offset-4"
              >
                Page précédente
              </Link>
            ) : null}
            <span className="text-neutral-500">
              Page {pageMiennes} sur {pagesMiennes}
            </span>
            {pageMiennes < pagesMiennes ? (
              <Link
                href={`/demandes?page=${pageATraiter}&pageMiennes=${pageMiennes + 1}`}
                className="underline underline-offset-4"
              >
                Page suivante
              </Link>
            ) : null}
          </nav>
        ) : null}
      </section>
    </main>
  )
}
