import Link from 'next/link'
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
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/evenements" className="text-sm underline underline-offset-4">
        Retour aux évènements
      </Link>
      <h1 className="mt-4 mb-8 text-2xl font-semibold">Types d&apos;évènement</h1>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-medium">Ajouter un type</h2>
        <FormulaireType />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Catalogue</h2>
        {types.length === 0 ? (
          <p className="text-sm text-neutral-600">Aucun type pour le moment.</p>
        ) : (
          <ul className="divide-y divide-neutral-200">
            {types.map((type) => (
              <li key={type.id} className="flex items-center justify-between gap-4 py-3">
                <span className={type.actif ? '' : 'text-neutral-400'}>
                  {type.libelle}
                  {type.actif ? null : <span className="ml-2 text-xs">(désactivé)</span>}
                </span>
                <form action={type.actif ? desactiverTypeEvenement : reactiverTypeEvenement}>
                  <input type="hidden" name="id" value={type.id} />
                  <BoutonBasculeType libelle={type.libelle} actif={type.actif} />
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
