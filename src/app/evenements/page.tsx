import Link from 'next/link'
import { redirect } from 'next/navigation'
import { listerEvenements, listerTypesEvenement, typesEvenementActifs } from '@/lib/donnees/evenements'
import { TAILLE_PAGE_EVENEMENTS } from '@/lib/donnees/evenements-lots'
import { formaterDateSeule } from '@/lib/format/date'
import { estModerateurOuAdministrateur, exigerProfilActif } from '@/lib/securite/garde'
import { creerEvenement } from './actions'
import { FormulaireEvenement } from './formulaire-evenement'

export default async function PageEvenements({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; typeId?: string }>
}) {
  // Consultation : TOUT COMPTE ACTIF (spec §5.3 : `evenements` est lisible de tout compte
  // actif, « nécessaire pour afficher les séminaires assistés sur une fiche »).
  await exigerProfilActif()

  const { page: pageBrute, typeId } = await searchParams
  const page = Math.max(1, Number(pageBrute ?? '1') || 1)

  const [{ lignes, total }, typesActifs, tousTypes, peutGerer] = await Promise.all([
    listerEvenements({ page, typeId }),
    typesEvenementActifs(),
    listerTypesEvenement(),
    // DÉCIDE D'AFFICHER, ne protège rien : la protection est
    // `exigerModerateurOuAdministrateur`, première instruction de `creerEvenement`.
    estModerateurOuAdministrateur(),
  ])

  const pages = Math.max(1, Math.ceil(total / TAILLE_PAGE_EVENEMENTS))
  if (page > pages) {
    // Page hors bornes (signet périmé, résultat qui a rétréci) : rediriger vers la
    // dernière page réelle plutôt que d'afficher une liste vide qui se lirait comme
    // « aucun évènement ». Même traitement que l'annuaire.
    const parametres = new URLSearchParams()
    parametres.set('page', String(pages))
    if (typeId) parametres.set('typeId', typeId)
    redirect(`/evenements?${parametres.toString()}`)
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/tableau-de-bord" className="text-sm underline underline-offset-4">
        Retour au tableau de bord
      </Link>

      <header className="mt-4 mb-8 flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold">Évènements</h1>
        {peutGerer ? (
          <Link href="/evenements/a-traiter" className="text-sm underline underline-offset-4">
            Participants à traiter
          </Link>
        ) : null}
      </header>

      {/* Filtre par type : formulaire GET, sans JavaScript, sans Server Action. */}
      <form method="get" className="mb-8 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Type</span>
          <select
            name="typeId"
            defaultValue={typeId ?? ''}
            className="rounded-md border border-neutral-300 px-3 py-2"
          >
            <option value="">Tous</option>
            {tousTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.libelle}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="rounded-md border border-neutral-300 px-3 py-2 text-sm">
          Filtrer
        </button>
      </form>

      {peutGerer ? (
        <section className="mb-10">
          <details>
            <summary className="cursor-pointer text-sm underline underline-offset-4">
              Nouvel évènement
            </summary>
            <div className="mt-4">
              <FormulaireEvenement
                action={creerEvenement}
                types={typesActifs}
                libelleBouton="Créer"
              />
            </div>
          </details>
          <p className="mt-3 text-sm text-neutral-500">
            <Link href="/evenements/types" className="underline underline-offset-4">
              Gérer les types
            </Link>{' '}
            — réservé aux administrateurs.
          </p>
        </section>
      ) : null}

      <p className="mb-3 text-sm text-neutral-500">
        {total} évènement{total > 1 ? 's' : ''}
      </p>

      {lignes.length === 0 ? (
        <p className="text-sm text-neutral-600">Aucun évènement pour le moment.</p>
      ) : (
        <ul className="divide-y divide-neutral-200">
          {lignes.map((evenement) => (
            <li key={evenement.id}>
              <Link
                href={`/evenements/${evenement.id}`}
                className="flex flex-wrap items-center justify-between gap-4 py-3"
              >
                <span>
                  {evenement.titre}
                  <span className="text-neutral-500"> · {evenement.typeLibelle}</span>
                </span>
                <span className="text-sm text-neutral-500">
                  {formaterDateSeule(evenement.dateDebut)}
                  {evenement.dateFin ? ` — ${formaterDateSeule(evenement.dateFin)}` : ''}
                  {evenement.lieu ? ` · ${evenement.lieu}` : ''}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 ? (
        <nav className="mt-6 flex items-center gap-4 text-sm">
          {page > 1 ? (
            <Link
              href={`/evenements?page=${page - 1}${typeId ? `&typeId=${typeId}` : ''}`}
              className="underline underline-offset-4"
            >
              Page précédente
            </Link>
          ) : null}
          <span className="text-neutral-500">
            Page {page} sur {pages}
          </span>
          {page < pages ? (
            <Link
              href={`/evenements?page=${page + 1}${typeId ? `&typeId=${typeId}` : ''}`}
              className="underline underline-offset-4"
            >
              Page suivante
            </Link>
          ) : null}
        </nav>
      ) : null}
    </main>
  )
}
