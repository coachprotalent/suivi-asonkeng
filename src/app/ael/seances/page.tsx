import Link from 'next/link'
import { formaterDateSeule } from '@/lib/format/date'
import { listerAntennes } from '@/lib/donnees/antennes'
import { listerSeances } from '@/lib/donnees/ael'
import { estModerateurOuAdministrateur, exigerProfilActif } from '@/lib/securite/garde'
import { BoutonGenerer } from './bouton-generer'
import { FormulaireSeanceManuelle } from './formulaire-seance-manuelle'

const LIBELLE_ETAT: Record<string, string> = {
  prevue: 'Prévue',
  tenue: 'Tenue',
  annulee: 'Annulée',
}

export default async function PageSeancesAel() {
  await exigerProfilActif()

  const [seances, antennes, peutGerer] = await Promise.all([
    listerSeances(),
    listerAntennes(),
    estModerateurOuAdministrateur(),
  ])

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/tableau-de-bord" className="text-sm underline underline-offset-4">
        Retour au tableau de bord
      </Link>
      <header className="mt-4 mb-8 flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold">Séances AEL</h1>
        {peutGerer ? (
          <Link href="/ael/calendriers" className="text-sm underline underline-offset-4">
            Gérer le calendrier
          </Link>
        ) : null}
      </header>

      {peutGerer ? (
        <div className="mb-10 flex flex-col gap-6">
          <BoutonGenerer />
          <details>
            <summary className="cursor-pointer text-sm underline underline-offset-4">
              Créer une séance manuellement
            </summary>
            <div className="mt-4">
              <FormulaireSeanceManuelle antennes={antennes} />
            </div>
          </details>
        </div>
      ) : null}

      {/*
        SEUL point d'entrée vers `/antennes/[id]` pour un modérateur ou un compte simple.
        `src/app/antennes/page.tsx` — l'autre écran qui pointe vers ces fiches — commence
        par `await exigerAdministrateur()` : un modérateur qui l'ouvre est redirigé vers
        `/tableau-de-bord`, un compte simple aussi. Sans cette section, l'écran de gestion
        des membres d'une antenne (Task 4), pourtant ouvert au modérateur en gestion et à
        tout compte actif en consultation (design §7, D50), ne serait joignable par aucun
        des deux, et la seule « correction » évidente serait d'ouvrir `/antennes` au
        modérateur — ce qui lui donnerait la CRÉATION et la DÉSACTIVATION des antennes,
        réservées à l'administrateur par le §5.2 de la spécification maîtresse. Ne jamais
        faire cela : le point d'entrée est ici.
        Rendu hors du bloc `peutGerer` à dessein : la consultation des membres d'une
        antenne est ouverte à tout compte actif, comme cet écran lui-même.
      */}
      {antennes.length > 0 ? (
        <section className="mb-10">
          <h2 className="mb-3 text-lg font-medium">Antennes</h2>
          <ul className="flex flex-wrap gap-4">
            {antennes.map((antenne) => (
              <li key={antenne.id}>
                <Link
                  href={`/antennes/${antenne.id}`}
                  className="text-sm underline underline-offset-4"
                >
                  {antenne.nom}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-neutral-500">
            Voir et gérer les membres rattachés à chaque antenne.
          </p>
        </section>
      ) : null}

      {seances.length === 0 ? (
        <p className="text-sm text-neutral-600">Aucune séance pour le moment.</p>
      ) : (
        <ul className="divide-y divide-neutral-200">
          {seances.map((seance) => (
            <li key={seance.id}>
              <Link
                href={`/ael/seances/${seance.id}`}
                className="flex flex-wrap items-center justify-between gap-4 py-3"
              >
                <span>
                  {formaterDateSeule(seance.date)}
                  {seance.theme ? <span className="text-neutral-500"> · {seance.theme}</span> : null}
                </span>
                <span className="text-sm text-neutral-500">
                  {seance.antennesNoms.join(', ') || 'Aucune antenne'} · {LIBELLE_ETAT[seance.etat]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
