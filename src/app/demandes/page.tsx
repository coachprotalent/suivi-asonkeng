import { Carte } from '@/composants/ui/carte'
import { EnTetePage } from '@/composants/ui/en-tete-page'
import { Liste } from '@/composants/ui/ligne-liste'
import { Pagination } from '@/composants/ui/pagination'
import { dirigeantPropose } from '@/lib/domaine/arbre'
import { maillonArbre } from '@/lib/donnees/arbre'
import {
  listerDemandesEnAttente,
  mesDemandes,
  TAILLE_PAGE_DEMANDES,
  type DemandeListe,
} from '@/lib/donnees/demandes'
import { membreBrefParId, type MembreBref } from '@/lib/donnees/membres'
import { nombreDePages, pageDemandee } from '@/lib/donnees/pagination'
import { rolesDuProfil } from '@/lib/donnees/profils'
import { bornerPage } from '@/lib/navigation/bornage'
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

  /*
    ⚠️ DEUX BORNAGES (D121), et `/demandes` est le SEUL écran du dépôt dans ce cas. Chacun
    construit sa redirection avec la valeur BRUTE, NON CORRIGÉE, de l'AUTRE paramètre de
    page — `lienATraiter` referme sur `pageMiennes`, `lienMiennes` referme sur
    `pageATraiter`, et ni l'une ni l'autre n'est jamais réassignée : c'est exactement le
    comportement d'avant cette migration (`redirect` construit à la main aux lignes 86-91
    de l'ancien fichier). Y substituer la valeur CORRIGÉE (`pagesMiennes`/`pagesATraiter`)
    changerait la convergence des deux pages sans que rien ne le signale — préservé tel
    quel, sur consigne explicite du brief.

    La condition `estAdmin` RESTE AU SITE D'APPEL (D121, commentaire de tête de
    `bornage.ts`) : `bornerPage` ne décide d'aucun accès, elle ne fait que corriger une
    page hors bornes pour une section qui a déjà le droit de la voir.
  */
  function lienATraiter(numero: number): string {
    return `/demandes?page=${numero}&pageMiennes=${pageMiennes}`
  }
  function lienMiennes(numero: number): string {
    return `/demandes?page=${pageATraiter}&pageMiennes=${numero}`
  }

  const pagesATraiter = estAdmin
    ? bornerPage(pageATraiter, totalATraiter, TAILLE_PAGE_DEMANDES, lienATraiter)
    : nombreDePages(totalATraiter, TAILLE_PAGE_DEMANDES)
  const pagesMiennes = bornerPage(pageMiennes, totalMiennes, TAILLE_PAGE_DEMANDES, lienMiennes)

  return (
    // D107 — l'un des TROIS écrans en densité compacte, avec `/comptes` (Task 20) et
    // `/evenements/a-traiter` (Task 18). Six jetons d'espacement remappés, rien d'autre :
    // ni couleur, ni typographie, ni rayon, ni hauteur de cible tactile.
    <main data-densite="compact" className="mx-auto max-w-4xl px-esp-6 py-esp-10">
      <EnTetePage
        retour={{ href: '/tableau-de-bord', libelle: 'Retour au tableau de bord' }}
        titre="Demandes"
      />

      {demandeCreee === '1' ? (
        <div className="mb-esp-8">
          <Carte ton="succes" role="status">
            {MESSAGE_DEMANDE_CREEE}
          </Carte>
        </div>
      ) : null}

      {estAdmin ? (
        <section className="mb-esp-10">
          {/* LE TOTAL, PAS LA LONGUEUR DE LA PAGE. Afficher `demandesEnAttente.length`
              annoncerait « À traiter (25) » à un administrateur qui en a cent — le mensonge
              exact que `totalObligatoire` existe pour empêcher côté lecture. */}
          <h2 className="mb-esp-4 text-section">À traiter ({totalATraiter})</h2>
          {demandesEnAttente.length === 0 ? (
            <p className="text-petit text-encre-attenuee">Aucune demande en attente.</p>
          ) : (
            <Liste>
              {demandesEnAttente.map((demande) => (
                <LigneDemandeAdmin
                  key={demande.id}
                  demande={demande}
                  dirigeantInitial={propositionsDirigeant[demande.id] ?? null}
                />
              ))}
            </Liste>
          )}

          <div className="mt-esp-6">
            <Pagination page={pageATraiter} pages={pagesATraiter} lienVersPage={lienATraiter} />
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="mb-esp-4 text-section">Mes demandes ({totalMiennes})</h2>
        {mesPropositions.length === 0 ? (
          <p className="text-petit text-encre-attenuee">Vous n&apos;avez soumis aucune demande.</p>
        ) : (
          <Liste>
            {mesPropositions.map((demande) => (
              <LigneDemandePersonnelle key={demande.id} demande={demande} />
            ))}
          </Liste>
        )}

        <div className="mt-esp-6">
          <Pagination page={pageMiennes} pages={pagesMiennes} lienVersPage={lienMiennes} />
        </div>
      </section>
    </main>
  )
}
