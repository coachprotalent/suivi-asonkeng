import Link from 'next/link'
import { notFound } from 'next/navigation'
import { antenneParId } from '@/lib/donnees/antennes'
import { membresDesAntennes } from '@/lib/donnees/membres'
import { estModerateurOuAdministrateur, exigerProfilActif } from '@/lib/securite/garde'
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
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Link href="/antennes" className="text-sm underline underline-offset-4">
        Retour aux antennes
      </Link>
      <h1 className="mt-4 mb-2 text-2xl font-semibold">{antenne.nom}</h1>
      <p className="mb-8 text-sm text-neutral-500">
        {antenne.pays}
        {!antenne.actif ? ' · Antenne désactivée' : ''}
      </p>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-medium">Membres rattachés ({membres.length})</h2>
        {membres.length === 0 ? (
          <p className="text-sm text-neutral-600">Aucun membre rattaché à cette antenne.</p>
        ) : (
          <ul className="divide-y divide-neutral-200">
            {membres.map((membre) =>
              peutGerer ? (
                <LigneMembreDetachable key={membre.id} membre={membre} antenneId={antenne.id} />
              ) : (
                <li key={membre.id} className="py-2">
                  <Link href={`/membres/${membre.id}`} className="text-sm">
                    {membre.prenom} {membre.nom}
                  </Link>
                </li>
              ),
            )}
          </ul>
        )}
      </section>

      {peutGerer && antenne.actif ? (
        <section>
          <h2 className="mb-3 text-lg font-medium">Rattacher un membre</h2>
          <FormulaireRattachement antenneId={antenne.id} />
        </section>
      ) : null}

      {/*
        Une antenne désactivée n'accepte plus de nouveau rattachement (le contrôle
        amont de `definirAntenneMembre` le refuserait de toute façon) : plutôt que
        d'afficher un formulaire qui échouerait systématiquement, on ne le rend pas.
      */}
      {peutGerer && !antenne.actif ? (
        <p className="text-sm text-neutral-500">
          Cette antenne est désactivée : réactivez-la depuis{' '}
          <Link href="/antennes" className="underline underline-offset-4">
            la liste des antennes
          </Link>{' '}
          avant de rattacher un nouveau membre.
        </p>
      ) : null}
    </main>
  )
}
