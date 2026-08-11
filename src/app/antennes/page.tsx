import Link from 'next/link'
import { listerToutesAntennes } from '@/lib/donnees/antennes'
import { exigerAdministrateur } from '@/lib/securite/garde'
import { desactiverAntenne, reactiverAntenne } from './actions'
import { BoutonBasculeAntenne } from './bouton-bascule-antenne'
import { FormulaireAntenne } from './formulaire-antenne'

export default async function PageAntennes() {
  await exigerAdministrateur()
  const antennes = await listerToutesAntennes()
  const antennesActives = antennes.filter((antenne) => antenne.actif)
  const antennesInactives = antennes.filter((antenne) => !antenne.actif)

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Link href="/tableau-de-bord" className="text-sm underline underline-offset-4">
        Retour au tableau de bord
      </Link>
      <h1 className="mt-4 mb-8 text-2xl font-semibold">Antennes</h1>

      <ul className="mb-10 divide-y divide-neutral-200">
        {antennesActives.map((antenne) => (
          <li key={antenne.id} className="flex items-center justify-between gap-4 py-3">
            <span>
              {antenne.nom} <span className="text-sm text-neutral-500">· {antenne.pays}</span>
            </span>
            <form action={desactiverAntenne}>
              <input type="hidden" name="id" value={antenne.id} />
              <BoutonBasculeAntenne nom={antenne.nom} desactiver />
            </form>
          </li>
        ))}
      </ul>

      {/*
        Une antenne désactivée reste visible ici, contrairement à une simple
        disparition : sans cette section, seule la clé de service permettrait de la
        rétablir. Une fiche membre archivée, elle, reste consultable ; une antenne
        désactivée doit rester au moins réactivable.
      */}
      {antennesInactives.length > 0 ? (
        <>
          <h2 className="mb-4 text-lg font-medium">Antennes désactivées</h2>
          <ul className="mb-10 divide-y divide-neutral-200">
            {antennesInactives.map((antenne) => (
              <li key={antenne.id} className="flex items-center justify-between gap-4 py-3">
                <span className="text-neutral-500">
                  {antenne.nom} <span className="text-sm">· {antenne.pays}</span>
                </span>
                <form action={reactiverAntenne}>
                  <input type="hidden" name="id" value={antenne.id} />
                  <BoutonBasculeAntenne nom={antenne.nom} desactiver={false} />
                </form>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <h2 className="mb-4 text-lg font-medium">Ajouter une antenne</h2>
      <FormulaireAntenne />
    </main>
  )
}
