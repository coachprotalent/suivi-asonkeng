import { notFound } from 'next/navigation'
import { dirigeantPropose } from '@/lib/domaine/arbre'
import { maillonArbre } from '@/lib/donnees/arbre'
import { membreBrefParId, membreParId } from '@/lib/donnees/membres'
import { exigerAdministrateur } from '@/lib/securite/garde'
import { EnTetePage } from '@/composants/ui/en-tete-page'
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
    <main className="mx-auto max-w-2xl px-esp-6 py-esp-10">
      <EnTetePage
        retour={{ href: `/membres/${membre.id}`, libelle: 'Retour à la fiche' }}
        titre={`Rattachement de ${membre.prenom} ${membre.nom}`}
        soustitre="Le faiseur de disciple place ce membre dans l'arbre. Le dirigeant est proposé à partir de lui, et reste modifiable."
      />

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
