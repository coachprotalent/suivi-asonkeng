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
      <h1 className="mt-4 text-2xl font-semibold">
        Modifier {membre.prenom} {membre.nom}
      </h1>
      {/*
        Même bandeau que sur l'écran de consultation (tâche 9) : sans lui, un
        administrateur arrivant par un lien périmé pouvait modifier une fiche
        archivée en croyant suivre un membre actif.
      */}
      {membre.etat !== 'actif' ? (
        <p className="mt-1 text-sm text-amber-700">
          {membre.etat === 'archive'
            ? "Fiche archivée — elle ne figure plus dans l'annuaire."
            : 'Fiche en attente de validation.'}
        </p>
      ) : null}
      <div className="mb-8" />
      <FormulaireMembre
        action={modifierMembre}
        antennes={antennes}
        membre={membre}
        libelleBouton="Enregistrer les modifications"
      />
    </main>
  )
}
