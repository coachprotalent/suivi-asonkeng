import { EnTetePage } from '@/composants/ui/en-tete-page'
import { LigneListe, Liste } from '@/composants/ui/ligne-liste'
import { listerCatalogue } from '@/lib/donnees/statuts'
import { exigerAdministrateur } from '@/lib/securite/garde'
import { desactiverStatut, reactiverStatut } from './actions'
import { BoutonBasculeStatut } from './bouton-bascule-statut'
import { FormulaireGroupe, FormulaireStatutCatalogue } from './formulaire-catalogue'

export default async function PageCatalogueStatuts() {
  await exigerAdministrateur()
  const groupes = await listerCatalogue(true)

  return (
    <main className="mx-auto max-w-2xl px-esp-6 py-esp-10">
      <EnTetePage
        retour={{ href: '/tableau-de-bord', libelle: 'Retour au tableau de bord' }}
        titre="Statuts"
      />

      {groupes.map((groupe) => (
        <section key={groupe.id} className="mb-esp-8">
          <h2 className="mb-esp-1 text-section">{groupe.nom}</h2>
          <p className="mb-esp-3 text-petit text-encre-attenuee">
            {groupe.exclusif
              ? "Un membre ne peut porter qu'un seul statut de ce groupe."
              : 'Les statuts de ce groupe se cumulent.'}
          </p>
          {groupe.statuts.length === 0 ? (
            <p className="text-petit text-encre-attenuee">Aucun statut dans ce groupe.</p>
          ) : (
            <Liste>
              {groupe.statuts.map((statut) => (
                <LigneListe
                  key={statut.id}
                  principal={
                    <span className={statut.actif ? '' : 'text-encre-attenuee'}>
                      {statut.libelle}
                      {statut.actif ? '' : ' — désactivé'}
                    </span>
                  }
                  actions={
                    <form action={statut.actif ? desactiverStatut : reactiverStatut}>
                      <input type="hidden" name="id" value={statut.id} />
                      <BoutonBasculeStatut libelle={statut.libelle} desactiver={statut.actif} />
                    </form>
                  }
                />
              ))}
            </Liste>
          )}
        </section>
      ))}

      <h2 className="mb-esp-4 text-section">Ajouter un statut</h2>
      <div className="mb-esp-10">
        <FormulaireStatutCatalogue groupes={groupes} />
      </div>

      <h2 className="mb-esp-4 text-section">Ajouter un groupe</h2>
      <FormulaireGroupe />
    </main>
  )
}
