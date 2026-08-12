import Link from 'next/link'
import { notFound } from 'next/navigation'
import { dirigeantPropose } from '@/lib/domaine/arbre'
import { maillonArbre } from '@/lib/donnees/arbre'
import { membreBrefParId, membreParId } from '@/lib/donnees/membres'
import { exigerAdministrateur } from '@/lib/securite/garde'
import { FormulaireArbre } from './formulaire-arbre'

export default async function PageArbre({ params }: { params: Promise<{ id: string }> }) {
  // Écran d'administration : le garde est la PREMIÈRE instruction, avant toute lecture.
  await exigerAdministrateur()
  const { id } = await params

  const membre = await membreParId(id)
  if (!membre) {
    notFound()
  }

  const maillon = await maillonArbre(membre.id)
  const faiseurId = maillon?.faiseurDeDiscipleId ?? null

  const [faiseur, dirigeant] = await Promise.all([
    faiseurId ? membreBrefParId(faiseurId) : Promise.resolve(null),
    membre.dirigeantId ? membreBrefParId(membre.dirigeantId) : Promise.resolve(null),
  ])

  // Proposition calculée côté serveur au premier rendu, pour que le bouton « revenir
  // au dirigeant calculé » soit utile dès l'arrivée sur l'écran, et pas seulement
  // après avoir touché au faiseur de disciple.
  const maillonFaiseur = faiseurId ? await maillonArbre(faiseurId) : null
  const proposeId = dirigeantPropose(maillonFaiseur)
  const proposition = proposeId ? await membreBrefParId(proposeId) : null

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Link href={`/membres/${membre.id}`} className="text-sm underline underline-offset-4">
        Retour à la fiche
      </Link>
      <h1 className="mt-4 mb-2 text-2xl font-semibold">
        Rattachement de {membre.prenom} {membre.nom}
      </h1>
      <p className="mb-8 text-sm text-neutral-500">
        Le faiseur de disciple place ce membre dans l&apos;arbre. Le dirigeant est proposé à
        partir de lui, et reste modifiable.
      </p>

      <FormulaireArbre
        membreId={membre.id}
        faiseurInitial={faiseur}
        dirigeantInitial={dirigeant}
        dirigeantForceInitial={membre.dirigeantForce}
        propositionInitiale={proposition}
      />
    </main>
  )
}
