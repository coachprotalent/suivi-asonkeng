import Link from 'next/link'
import { listerAntennes } from '@/lib/donnees/antennes'
import { exigerAdministrateur } from '@/lib/securite/garde'
import { creerMembre } from '../actions'
import { FormulaireMembre } from '../formulaire-membre'

export default async function PageNouveauMembre() {
  await exigerAdministrateur()
  const antennes = await listerAntennes()

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/membres" className="text-sm underline underline-offset-4">
        Retour à l&apos;annuaire
      </Link>
      <h1 className="mt-4 mb-8 text-2xl font-semibold">Nouveau membre</h1>
      <FormulaireMembre action={creerMembre} antennes={antennes} libelleBouton="Créer la fiche" />
    </main>
  )
}
