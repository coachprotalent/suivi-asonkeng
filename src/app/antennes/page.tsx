import Link from 'next/link'
import { listerAntennes } from '@/lib/donnees/antennes'
import { exigerAdministrateur } from '@/lib/securite/garde'
import { desactiverAntenne } from './actions'
import { FormulaireAntenne } from './formulaire-antenne'

export default async function PageAntennes() {
  await exigerAdministrateur()
  const antennes = await listerAntennes()

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Link href="/tableau-de-bord" className="text-sm underline underline-offset-4">
        Retour au tableau de bord
      </Link>
      <h1 className="mt-4 mb-8 text-2xl font-semibold">Antennes</h1>

      <ul className="mb-10 divide-y divide-neutral-200">
        {antennes.map((antenne) => (
          <li key={antenne.id} className="flex items-center justify-between gap-4 py-3">
            <span>
              {antenne.nom} <span className="text-sm text-neutral-500">· {antenne.pays}</span>
            </span>
            <form action={desactiverAntenne}>
              <input type="hidden" name="id" value={antenne.id} />
              <button type="submit" className="text-sm text-red-600 underline underline-offset-4">
                Désactiver
              </button>
            </form>
          </li>
        ))}
      </ul>

      <h2 className="mb-4 text-lg font-medium">Ajouter une antenne</h2>
      <FormulaireAntenne />
    </main>
  )
}
