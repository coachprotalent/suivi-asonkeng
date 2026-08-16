import { EnTetePage } from '@/composants/ui/en-tete-page'
import { Liste } from '@/composants/ui/ligne-liste'
import { listerTokens } from '@/lib/donnees/tokens'
import { exigerAdministrateur } from '@/lib/securite/garde'
import { FormulaireGeneration } from './formulaire-generation'
import { LigneToken } from './ligne-token'

export default async function PageTokens() {
  await exigerAdministrateur()
  const tokens = await listerTokens()

  return (
    // ⚠️ PAS de `data-densite="compact"` ICI (D107) : `/tokens` n'est pas dans la liste des
    // trois écrans denses, et l'y ajouter « par symétrie » avec `/comptes` serait une
    // décision que personne n'a prise.
    <main className="mx-auto max-w-4xl px-esp-6 py-esp-10">
      <EnTetePage
        retour={{ href: '/tableau-de-bord', libelle: 'Retour au tableau de bord' }}
        titre="Tokens d'inscription"
        soustitre={
          <>
            {tokens.length} token{tokens.length > 1 ? 's' : ''}
          </>
        }
      />

      <div className="mb-esp-10">
        <FormulaireGeneration />
      </div>

      <Liste>
        {tokens.map((token) => (
          <LigneToken key={token.id} token={token} />
        ))}
      </Liste>
    </main>
  )
}
