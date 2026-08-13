import Link from 'next/link'
import { listerTokens } from '@/lib/donnees/tokens'
import { exigerAdministrateur } from '@/lib/securite/garde'
import { FormulaireGeneration } from './formulaire-generation'
import { LigneToken } from './ligne-token'

export default async function PageTokens() {
  await exigerAdministrateur()
  const tokens = await listerTokens()

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <Link href="/tableau-de-bord" className="text-sm underline underline-offset-4">
        Retour au tableau de bord
      </Link>
      <h1 className="mt-4 mb-2 text-2xl font-semibold">Tokens d&apos;inscription</h1>
      <p className="mb-8 text-sm text-neutral-500">
        {tokens.length} token{tokens.length > 1 ? 's' : ''}
      </p>

      <FormulaireGeneration />

      <ul className="divide-y divide-neutral-200">
        {tokens.map((token) => (
          <LigneToken key={token.id} token={token} />
        ))}
      </ul>
    </main>
  )
}
