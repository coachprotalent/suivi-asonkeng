import { EnTetePage } from '@/composants/ui/en-tete-page'
import { LigneListe, Liste } from '@/composants/ui/ligne-liste'
import { listerTypesEvenement } from '@/lib/donnees/evenements'
import { exigerAdministrateur } from '@/lib/securite/garde'
import { desactiverTypeEvenement, reactiverTypeEvenement } from './actions'
import { BoutonBasculeType } from './bouton-bascule-type'
import { FormulaireType } from './formulaire-type'

export default async function PageTypesEvenement() {
  // PREMIÈRE instruction. Spec §5.2, ligne « Créer statuts, groupes, antennes, types
  // d'événement » : administrateur seul.
  await exigerAdministrateur()

  const types = await listerTypesEvenement()

  return (
    <main className="mx-auto max-w-3xl px-esp-6 py-esp-10">
      <EnTetePage
        retour={{ href: '/evenements', libelle: 'Retour aux évènements' }}
        titre="Types d'évènement"
      />

      <section className="mb-esp-10">
        <h2 className="mb-esp-3 text-section">Ajouter un type</h2>
        <FormulaireType />
      </section>

      <section>
        <h2 className="mb-esp-3 text-section">Catalogue</h2>
        {types.length === 0 ? (
          <p className="text-petit text-encre-attenuee">Aucun type pour le moment.</p>
        ) : (
          <Liste>
            {types.map((type) => (
              <LigneListe
                key={type.id}
                principal={
                  /*
                    ⚠️ `text-neutral-400` DISPARAÎT DU DÉPÔT ICI : c'était sa SEULE occurrence,
                    et le couple de contraste le plus à risque relevé par l'inventaire (§4.3).
                    `text-encre-attenuee` la remplace sans changer un mot affiché.
                  */
                  <span className={type.actif ? '' : 'text-encre-attenuee'}>
                    {type.libelle}
                    {type.actif ? null : <span className="ml-esp-2 text-petit">(désactivé)</span>}
                  </span>
                }
                actions={
                  <form action={type.actif ? desactiverTypeEvenement : reactiverTypeEvenement}>
                    <input type="hidden" name="id" value={type.id} />
                    <BoutonBasculeType libelle={type.libelle} actif={type.actif} />
                  </form>
                }
              />
            ))}
          </Liste>
        )}
      </section>
    </main>
  )
}
