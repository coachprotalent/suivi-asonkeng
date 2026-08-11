import Link from 'next/link'
import { notFound } from 'next/navigation'
import { membreParId } from '@/lib/donnees/membres'
import { rolesDuProfil } from '@/lib/donnees/profils'
import { exigerProfilActif } from '@/lib/securite/garde'
import { archiverMembre } from '../actions'

const LIBELLE_SITUATION: Record<string, string> = {
  etudiant: 'Étudiant',
  travailleur: 'Travailleur',
  autre: 'Autre',
}

export default async function PageFicheMembre({ params }: { params: Promise<{ id: string }> }) {
  const profil = await exigerProfilActif()
  const { id } = await params
  const membre = await membreParId(id)
  if (!membre) {
    notFound()
  }

  const roles = await rolesDuProfil(profil.id)
  const estAdmin = roles.includes('administrateur')

  const lignes: Array<[string, string | null]> = [
    ['Antenne', membre.antenneNom],
    ['Ville', membre.ville],
    ['Pays', membre.pays],
    ['Situation', membre.situation ? LIBELLE_SITUATION[membre.situation] : null],
    ["Domaine d'étude", membre.domaineEtude],
    ['Téléphone', membre.telephone],
    ['Contact', membre.emailContact],
    ['AEL déjà suivis', String(membre.reportInitialAel)],
  ]

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/membres" className="text-sm underline underline-offset-4">
        Retour à l&apos;annuaire
      </Link>

      <header className="mt-4 mb-8 flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold">
          {membre.prenom} {membre.nom}
        </h1>
        {estAdmin ? (
          <div className="flex items-center gap-4">
            <Link href={`/membres/${membre.id}/modifier`} className="text-sm underline underline-offset-4">
              Modifier
            </Link>
            <form action={archiverMembre}>
              <input type="hidden" name="id" value={membre.id} />
              <button type="submit" className="text-sm text-red-600 underline underline-offset-4">
                Archiver
              </button>
            </form>
          </div>
        ) : null}
      </header>

      <dl className="divide-y divide-neutral-200">
        {lignes.map(([intitule, valeur]) => (
          <div key={intitule} className="flex justify-between gap-4 py-3">
            <dt className="text-sm text-neutral-500">{intitule}</dt>
            <dd className="text-sm">{valeur ?? '—'}</dd>
          </div>
        ))}
      </dl>
    </main>
  )
}
