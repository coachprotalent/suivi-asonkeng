import Link from 'next/link'
import { listerCatalogue } from '@/lib/donnees/statuts'
import { exigerAdministrateur } from '@/lib/securite/garde'
import { desactiverStatut, reactiverStatut } from './actions'
import { BoutonBasculeStatut } from './bouton-bascule-statut'
import { FormulaireGroupe, FormulaireStatutCatalogue } from './formulaire-catalogue'

export default async function PageCatalogueStatuts() {
  await exigerAdministrateur()
  const groupes = await listerCatalogue(true)

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Link href="/tableau-de-bord" className="text-sm underline underline-offset-4">
        Retour au tableau de bord
      </Link>
      <h1 className="mt-4 mb-8 text-2xl font-semibold">Statuts</h1>

      {groupes.map((groupe) => (
        <section key={groupe.id} className="mb-8">
          <h2 className="mb-1 text-lg font-medium">{groupe.nom}</h2>
          <p className="mb-3 text-sm text-neutral-500">
            {groupe.exclusif
              ? "Un membre ne peut porter qu'un seul statut de ce groupe."
              : 'Les statuts de ce groupe se cumulent.'}
          </p>
          {groupe.statuts.length === 0 ? (
            <p className="text-sm text-neutral-600">Aucun statut dans ce groupe.</p>
          ) : (
            <ul className="divide-y divide-neutral-200">
              {groupe.statuts.map((statut) => (
                <li key={statut.id} className="flex items-center justify-between gap-4 py-3">
                  <span className={statut.actif ? '' : 'text-neutral-500'}>
                    {statut.libelle}
                    {statut.actif ? '' : ' — désactivé'}
                  </span>
                  <form action={statut.actif ? desactiverStatut : reactiverStatut}>
                    <input type="hidden" name="id" value={statut.id} />
                    <BoutonBasculeStatut libelle={statut.libelle} desactiver={statut.actif} />
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}

      <h2 className="mb-4 text-lg font-medium">Ajouter un statut</h2>
      <div className="mb-10">
        <FormulaireStatutCatalogue groupes={groupes} />
      </div>

      <h2 className="mb-4 text-lg font-medium">Ajouter un groupe</h2>
      <FormulaireGroupe />
    </main>
  )
}
