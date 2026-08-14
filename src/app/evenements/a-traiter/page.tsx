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
  // `Number.parseInt` et non `Number(...)` : `Number('2.5') || 1` vaut `2.5`, un nombre non
  // entier qui franchit le garde `page > pages` ci-dessous (`2.5 > 2` est vrai, mais une
  // fois redirigé vers une page entière il ne redéclenche plus jamais rien) et s'affiche
  // sous l'étiquette « Page 2.5 sur N » tout en rendant le contenu de la page 1 — M5 de la
  // ronde du 2026-08-14. Même garde que `src/app/membres/page.tsx:32-33`.
  const pageDemandee = Number.parseInt(pageBrute ?? '1', 10)
  const page = Number.isFinite(pageDemandee) && pageDemandee > 0 ? pageDemandee : 1

  // BORNE HAUTE DE LA PAGINATION — UN SEUL ALLER-RETOUR, PAS DEUX (I1, ronde du
  // 2026-08-14). Le correctif initial de la Task 19 précalculait cette borne par un
  // aller-retour séparé (`totalATraiter()`) AVANT de lire la page demandée — plus fragile
  // que le motif qu'il imitait : une conversion ou un classement concurrent, entre les deux
  // appels, périmait la borne déjà calculée et faisait échouer la lecture elle-même
  // (`PGRST103`, non attrapée là), plantant l'écran au lieu de rediriger — précisément sur
  // l'écran où deux modérateurs travaillent ensemble. `participantsATraiter` lit
  // directement la page demandée et attrape `PGRST103` SUR CETTE LECTURE (evenements-lots.ts),
  // retombant sur un comptage sans `range` si besoin — un seul aller-retour dans le cas
  // normal. `pages` est calculé APRÈS coup depuis le `total` REÇU DE CETTE MÊME LECTURE.
  // PAS DE BOUCLE POSSIBLE : `pages` vaut toujours au moins 1, et la cible de la
  // redirection est `pages` lui-même. HORS DE TOUT `try` (aucun `try` dans ce fichier).
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
