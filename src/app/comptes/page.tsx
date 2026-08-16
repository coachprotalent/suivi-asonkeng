import { EnTetePage } from '@/composants/ui/en-tete-page'
import { Liste } from '@/composants/ui/ligne-liste'
import { listerComptes } from '@/lib/donnees/comptes'
import { exigerAdministrateur } from '@/lib/securite/garde'
import { FormulaireCompte } from './formulaire-compte'
import { LigneCompte } from './ligne-compte'

export default async function PageComptes() {
  const profil = await exigerAdministrateur()
  const comptes = await listerComptes()

  return (
    // D107 — le TROISIÈME et dernier des trois écrans en densité compacte, avec
    // `/demandes` (Task 17) et `/evenements/a-traiter` (Task 18). Six jetons d'espacement
    // remappés, rien d'autre.
    <main data-densite="compact" className="mx-auto max-w-4xl px-esp-6 py-esp-10">
      <EnTetePage
        retour={{ href: '/tableau-de-bord', libelle: 'Retour au tableau de bord' }}
        titre="Comptes"
        soustitre={
          <>
            {comptes.length} compte{comptes.length > 1 ? 's' : ''}
          </>
        }
      />

      <div className="mb-esp-10">
        <FormulaireCompte />
      </div>

      <Liste>
        {comptes.map((compte) => (
          <LigneCompte key={compte.id} compte={compte} estMoi={compte.id === profil.id} />
        ))}
      </Liste>
    </main>
  )
}
