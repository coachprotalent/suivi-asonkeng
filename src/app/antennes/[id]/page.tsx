import Link from 'next/link'
import { notFound } from 'next/navigation'
import { antenneParId } from '@/lib/donnees/antennes'
import { membresDesAntennes } from '@/lib/donnees/membres'
import { estModerateurOuAdministrateur, exigerProfilActif } from '@/lib/securite/garde'
import { EnTetePage } from '@/composants/ui/en-tete-page'
import { LigneListe, Liste } from '@/composants/ui/ligne-liste'
import { FormulaireRattachement } from './formulaire-rattachement'
import { LigneMembreDetachable } from './ligne-membre-detachable'

export default async function PageAntenneMembres({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await exigerProfilActif()
  const { id } = await params

  const antenne = await antenneParId(id)
  if (!antenne) {
    notFound()
  }

  const [membres, peutGerer] = await Promise.all([
    membresDesAntennes([antenne.id]),
    estModerateurOuAdministrateur(),
  ])

  return (
    <main className="mx-auto max-w-2xl px-esp-6 py-esp-10">
      <EnTetePage
        retour={{ href: '/antennes', libelle: 'Retour aux antennes' }}
        titre={antenne.nom}
        soustitre={`${antenne.pays}${!antenne.actif ? ' · Antenne désactivée' : ''}`}
      />

      {/*
        ⚠️ PAS DE RAIL DE FILIATION ICI (D106) : le rattachement à une antenne n'est
        pas un lien de discipulat. Voir `[id]/arbre`, qui en porte un.
      */}
      <section className="mb-esp-10">
        <h2 className="mb-esp-3 text-section">Membres rattachés ({membres.length})</h2>
        {membres.length === 0 ? (
          <p className="text-petit text-encre-attenuee">Aucun membre rattaché à cette antenne.</p>
        ) : peutGerer ? (
          <Liste>
            {membres.map((membre) => (
              <LigneMembreDetachable key={membre.id} membre={membre} antenneId={antenne.id} />
            ))}
          </Liste>
        ) : (
          <Liste>
            {membres.map((membre) => (
              <LigneListe
                key={membre.id}
                lien={`/membres/${membre.id}`}
                principal={`${membre.prenom} ${membre.nom}`}
              />
            ))}
          </Liste>
        )}
      </section>

      {peutGerer && antenne.actif ? (
        <section>
          <h2 className="mb-esp-3 text-section">Rattacher un membre</h2>
          <FormulaireRattachement antenneId={antenne.id} />
        </section>
      ) : null}

      {/*
        Une antenne désactivée n'accepte plus de nouveau rattachement (le contrôle
        amont de `definirAntenneMembre` le refuserait de toute façon) : plutôt que
        d'afficher un formulaire qui échouerait systématiquement, on ne le rend pas.
      */}
      {peutGerer && !antenne.actif ? (
        <p className="text-petit text-encre-attenuee">
          Cette antenne est désactivée : réactivez-la depuis{' '}
          <Link href="/antennes" className="text-action underline underline-offset-4">
            la liste des antennes
          </Link>{' '}
          avant de rattacher un nouveau membre.
        </p>
      ) : null}
    </main>
  )
}
