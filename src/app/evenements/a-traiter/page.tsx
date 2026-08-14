import Link from 'next/link'
import { redirect } from 'next/navigation'
import { participantsATraiter } from '@/lib/donnees/evenements'
import { TAILLE_PAGE_A_TRAITER } from '@/lib/donnees/evenements-lots'
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
  const page = Math.max(1, Number(pageBrute ?? '1') || 1)

  const [{ lignes, total }, peutAgir] = await Promise.all([
    participantsATraiter(page),
    // DÉCIDE D'AFFICHER les deux gestes réservés à l'administrateur (D55) ; la protection
    // est `exigerAdministrateur`, première instruction des deux actions.
    estAdministrateur(),
  ])

  const pages = Math.max(1, Math.ceil(total / TAILLE_PAGE_A_TRAITER))
  if (page > pages) {
    redirect(`/evenements/a-traiter?page=${pages}`)
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/evenements" className="text-sm underline underline-offset-4">
        Retour aux évènements
      </Link>
      <h1 className="mt-4 mb-2 text-2xl font-semibold">Participants à traiter</h1>
      <p className="mb-8 text-sm text-neutral-500">
        Participants externes ayant exprimé le désir d&apos;un suivi spirituel, ni convertis
        ni classés sans suite. {total} personne{total > 1 ? 's' : ''}.
      </p>

      {lignes.length === 0 ? (
        <p className="text-sm text-neutral-600">Personne à traiter pour le moment.</p>
      ) : (
        <ul className="divide-y divide-neutral-200">
          {lignes.map((participant) => (
            <LigneATraiter
              key={participant.participantExterneId}
              participant={participant}
              peutAgir={peutAgir}
            />
          ))}
        </ul>
      )}

      {pages > 1 ? (
        <nav className="mt-6 flex items-center gap-4 text-sm">
          {page > 1 ? (
            <Link href={`/evenements/a-traiter?page=${page - 1}`} className="underline underline-offset-4">
              Page précédente
            </Link>
          ) : null}
          <span className="text-neutral-500">
            Page {page} sur {pages}
          </span>
          {page < pages ? (
            <Link href={`/evenements/a-traiter?page=${page + 1}`} className="underline underline-offset-4">
              Page suivante
            </Link>
          ) : null}
        </nav>
      ) : null}
    </main>
  )
}
