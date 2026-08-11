import Link from 'next/link'
import { notFound } from 'next/navigation'
import { listerAntennes } from '@/lib/donnees/antennes'
import { membreParId } from '@/lib/donnees/membres'
import { exigerAdministrateur } from '@/lib/securite/garde'
import { modifierMembre } from '../../actions'
import { FormulaireMembre } from '../../formulaire-membre'

export default async function PageModifierMembre({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await exigerAdministrateur()
  const { id } = await params
  const [membre, antennes] = await Promise.all([membreParId(id), listerAntennes()])
  if (!membre) {
    notFound()
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href={`/membres/${membre.id}`} className="text-sm underline underline-offset-4">
        Retour à la fiche
      </Link>
      <h1 className="mt-4 mb-8 text-2xl font-semibold">
        Modifier {membre.prenom} {membre.nom}
      </h1>
      <FormulaireMembre
        action={modifierMembre}
        antennes={antennes}
        membre={membre}
        libelleBouton="Enregistrer les modifications"
      />
    </main>
  )
}
