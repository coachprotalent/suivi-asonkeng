import { EnTetePage } from '@/composants/ui/en-tete-page'
import { Liste } from '@/composants/ui/ligne-liste'
import { Pagination } from '@/composants/ui/pagination'
import { participantsATraiter } from '@/lib/donnees/evenements'
import { TAILLE_PAGE_A_TRAITER } from '@/lib/donnees/evenements-lots'
import { pageDemandee } from '@/lib/donnees/pagination'
import { bornerPage } from '@/lib/navigation/bornage'
import { estAdministrateur, exigerModerateurOuAdministrateur } from '@/lib/securite/garde'
import { LigneATraiter } from './ligne-a-traiter'

export default async function PageATraiter({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  // CONSULTATION : modérateur OU administrateur (D55). Cette ligne ne demande rien de
  // nouveau à la matrice du §5.2 : la liste est intégralement dérivée de
  // `desir_suivi_spirituel`, que le modérateur a déjà le droit de voir.
  await exigerModerateurOuAdministrateur()

  const { page: pageBrute } = await searchParams
  // `pageDemandee` (src/lib/donnees/pagination.ts) : même garde M5 (`Number('2.5') || 1`
  // vaut 2.5, non entier) que `src/app/membres/page.tsx`.
  const page = pageDemandee(pageBrute)

  // UN SEUL ALLER-RETOUR, PAS DEUX (I1, ronde du 2026-08-14) : `participantsATraiter` lit
  // directement la page demandée et attrape `PGRST103` sur cette lecture
  // (evenements-lots.ts), retombant sur un comptage sans `range` si besoin. `pages` est
  // calculé APRÈS coup depuis le `total` REÇU DE CETTE MÊME LECTURE, jamais d'un
  // aller-retour préalable.
  const [{ lignes, total }, peutAgir] = await Promise.all([
    participantsATraiter(page),
    // DÉCIDE D'AFFICHER les deux gestes réservés à l'administrateur (D55) ; la protection
    // est `exigerAdministrateur`, première instruction des deux actions.
    estAdministrateur(),
  ])

  function lienPage(numero: number): string {
    return `/evenements/a-traiter?page=${numero}`
  }

  // D121 — LE BORNAGE EST EXTRAIT, À COMPORTEMENT IDENTIQUE (src/lib/navigation/bornage.ts).
  // HORS DE TOUT `try` : `bornerPage` appelle `redirect()`, qui lève une exception de
  // contrôle Next.js (aucun `try` dans ce fichier).
  const pages = bornerPage(page, total, TAILLE_PAGE_A_TRAITER, lienPage)

  return (
    // D107 — le deuxième des TROIS écrans en densité compacte, avec `/demandes` (Task 17)
    // et `/comptes` (Task 20). Six jetons d'espacement remappés, rien d'autre.
    <main data-densite="compact" className="mx-auto max-w-3xl px-esp-6 py-esp-10">
      <EnTetePage
        retour={{ href: '/evenements', libelle: 'Retour aux évènements' }}
        titre="Participants à traiter"
        soustitre={
          <>
            Participants externes ayant exprimé le désir d&apos;un suivi spirituel, ni
            convertis ni classés sans suite. {total} personne{total > 1 ? 's' : ''}.
          </>
        }
      />

      {lignes.length === 0 ? (
        <p className="text-petit text-encre-attenuee">Personne à traiter pour le moment.</p>
      ) : (
        <Liste>
          {lignes.map((participant) => (
            <LigneATraiter
              key={participant.participantExterneId}
              participant={participant}
              peutAgir={peutAgir}
            />
          ))}
        </Liste>
      )}

      <div className="mt-esp-6">
        <Pagination page={page} pages={pages} lienVersPage={lienPage} />
      </div>
    </main>
  )
}
