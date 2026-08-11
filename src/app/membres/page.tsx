import Link from 'next/link'
import { listerAntennes } from '@/lib/donnees/antennes'
import { listerMembres } from '@/lib/donnees/membres'
import { rolesDuProfil } from '@/lib/donnees/profils'
import { exigerProfilActif } from '@/lib/securite/garde'

const LIBELLE_SITUATION: Record<string, string> = {
  etudiant: 'Étudiant',
  travailleur: 'Travailleur',
  autre: 'Autre',
}

export default async function PageAnnuaire({
  searchParams,
}: {
  searchParams: Promise<{ recherche?: string; antenne?: string }>
}) {
  const profil = await exigerProfilActif()
  const parametres = await searchParams
  const [membres, antennes, roles] = await Promise.all([
    listerMembres({ recherche: parametres.recherche, antenneId: parametres.antenne }),
    listerAntennes(),
    rolesDuProfil(profil.id),
  ])
  const estAdmin = roles.includes('administrateur')

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Annuaire</h1>
          <p className="text-sm text-neutral-500">
            {membres.length} membre{membres.length > 1 ? 's' : ''}
          </p>
        </div>
        {estAdmin ? (
          <Link
            href="/membres/nouveau"
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
          >
            Nouveau membre
          </Link>
        ) : null}
      </header>

      <form className="mb-8 flex flex-wrap gap-3" method="get">
        <input
          name="recherche"
          type="search"
          defaultValue={parametres.recherche ?? ''}
          placeholder="Nom, prénom ou ville"
          aria-label="Rechercher"
          className="min-w-48 flex-1 rounded-md border border-neutral-300 px-3 py-2"
        />
        <select
          name="antenne"
          defaultValue={parametres.antenne ?? ''}
          aria-label="Antenne"
          className="rounded-md border border-neutral-300 px-3 py-2"
        >
          <option value="">Toutes les antennes</option>
          {antennes.map((antenne) => (
            <option key={antenne.id} value={antenne.id}>
              {antenne.nom}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-md border border-neutral-300 px-4 py-2">
          Filtrer
        </button>
      </form>

      {membres.length === 0 ? (
        <p className="text-neutral-600">Aucun membre ne correspond à cette recherche.</p>
      ) : (
        <ul className="divide-y divide-neutral-200">
          {membres.map((membre) => (
            <li key={membre.id}>
              <Link href={`/membres/${membre.id}`} className="flex justify-between gap-4 py-3">
                <span className="font-medium">
                  {membre.prenom} {membre.nom}
                </span>
                <span className="text-sm text-neutral-500">
                  {[membre.antenneNom, membre.ville, membre.situation ? LIBELLE_SITUATION[membre.situation] : null]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
