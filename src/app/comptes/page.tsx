import Link from 'next/link'
import { listerComptes } from '@/lib/donnees/comptes'
import { exigerAdministrateur } from '@/lib/securite/garde'
import { FormulaireCompte } from './formulaire-compte'
import { LigneCompte } from './ligne-compte'

export default async function PageComptes() {
  const profil = await exigerAdministrateur()
  const comptes = await listerComptes()

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <Link href="/tableau-de-bord" className="text-sm underline underline-offset-4">
        Retour au tableau de bord
      </Link>
      <h1 className="mt-4 mb-2 text-2xl font-semibold">Comptes</h1>
      <p className="mb-8 text-sm text-neutral-500">
        {comptes.length} compte{comptes.length > 1 ? 's' : ''}
      </p>

      <FormulaireCompte />

      <ul className="divide-y divide-neutral-200">
        {comptes.map((compte) => (
          <LigneCompte key={compte.id} compte={compte} estMoi={compte.id === profil.id} />
        ))}
      </ul>
    </main>
  )
}
