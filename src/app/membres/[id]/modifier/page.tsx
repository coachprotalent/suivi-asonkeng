import { notFound } from 'next/navigation'
import { listerAntennes } from '@/lib/donnees/antennes'
import { membreParId } from '@/lib/donnees/membres'
import { exigerAdministrateur } from '@/lib/securite/garde'
import { Carte } from '@/composants/ui/carte'
import { EnTetePage } from '@/composants/ui/en-tete-page'
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
    <main className="mx-auto max-w-3xl px-esp-6 py-esp-10">
      <EnTetePage
        retour={{ href: `/membres/${membre.id}`, libelle: 'Retour à la fiche' }}
        titre={`Modifier ${membre.prenom} ${membre.nom}`}
      />

      {/*
        Même bandeau que sur l'écran de consultation (Task 21) : sans lui, un
        administrateur arrivant par un lien périmé pouvait modifier une fiche
        archivée en croyant suivre un membre actif.
      */}
      {membre.etat !== 'actif' ? (
        <div className="mb-esp-6">
          <Carte ton="avertissement" role="alert">
            {membre.etat === 'archive'
              ? "Fiche archivée — elle ne figure plus dans l'annuaire."
              : 'Fiche en attente de validation.'}
          </Carte>
        </div>
      ) : null}

      <FormulaireMembre
        action={modifierMembre}
        antennes={antennes}
        membre={membre}
        libelleBouton="Enregistrer les modifications"
      />
    </main>
  )
}
