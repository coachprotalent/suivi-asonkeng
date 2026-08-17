import { notFound } from 'next/navigation'
import { listerAntennes } from '@/lib/donnees/antennes'
import { membreBrefParId, membreParId } from '@/lib/donnees/membres'
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

  // Le formulaire est un composant client : il ne peut pas résoudre lui-même le nom du
  // contact à partir de son identifiant. Cette lecture est donc EN SÉRIE, après celles
  // ci-dessus, et non dans leur `Promise.all` : elle dépend de `membre.contactId`, qu'on ne
  // connaît pas avant. `null` si aucun contact n'est désigné — aucune requête dans ce cas.
  const contact = membre.contactId ? await membreBrefParId(membre.contactId) : null

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
        contactInitial={contact}
        libelleBouton="Enregistrer les modifications"
      />
    </main>
  )
}
