import Link from 'next/link'
import { formaterDateSeule } from '@/lib/format/date'
import { listerAntennes } from '@/lib/donnees/antennes'
import { listerSeances } from '@/lib/donnees/ael'
import type { EtatSeanceAel } from '@/lib/domaine/ael'
import { estModerateurOuAdministrateur, exigerProfilActif } from '@/lib/securite/garde'
import { CLASSES_VARIANTE } from '@/composants/ui/bouton'
import { EnTetePage } from '@/composants/ui/en-tete-page'
import { EtatBadge, type TonEtat } from '@/composants/ui/etat-badge'
import { LigneListe, Liste } from '@/composants/ui/ligne-liste'
import { BoutonGenerer } from './bouton-generer'
import { FormulaireSeanceManuelle } from './formulaire-seance-manuelle'

const LIBELLE_ETAT: Record<string, string> = {
  prevue: 'Prévue',
  tenue: 'Tenue',
  annulee: 'Annulée',
}

/*
  ⚠️ `LIBELLE_ETAT` VIT EN DOUBLE avec `ael/seances/[id]/page.tsx:12` — duplication de
  DONNÉES D'AFFICHAGE, pas de logique. D121 limite explicitement l'extraction serveur à la
  seule redirection de bornage : « toute autre duplication serveur est HORS PÉRIMÈTRE ».
  Signalé, non factorisé.
*/
const TON_ETAT_SEANCE: Record<EtatSeanceAel, TonEtat> = {
  prevue: 'attente',
  tenue: 'acquis',
  annulee: 'refus',
}

export default async function PageSeancesAel() {
  await exigerProfilActif()

  const [seances, antennes, peutGerer] = await Promise.all([
    listerSeances(),
    listerAntennes(),
    estModerateurOuAdministrateur(),
  ])

  return (
    <main className="mx-auto max-w-3xl px-esp-6 py-esp-10">
      <EnTetePage
        retour={{ href: '/tableau-de-bord', libelle: 'Retour au tableau de bord' }}
        titre="Séances AEL"
        action={
          peutGerer ? (
            <Link href="/ael/calendriers" className={CLASSES_VARIANTE.lien}>
              Gérer le calendrier
            </Link>
          ) : null
        }
      />

      {peutGerer ? (
        <div className="mb-esp-10 flex flex-col gap-esp-6">
          <BoutonGenerer />
          <details>
            <summary className={`${CLASSES_VARIANTE.lien} cursor-pointer`}>
              Créer une séance manuellement
            </summary>
            <div className="mt-esp-4">
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
        <section className="mb-esp-10">
          <h2 className="mb-esp-3 text-section">Antennes</h2>
          <ul className="flex flex-wrap gap-esp-2">
            {antennes.map((antenne) => (
              <li
                key={antenne.id}
                className="rounded-full border border-bord-carte px-esp-3 py-esp-1 text-petit"
              >
                <Link
                  href={`/antennes/${antenne.id}`}
                  className="text-action underline underline-offset-4"
                >
                  {antenne.nom}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-esp-2 text-petit text-encre-attenuee">
            Voir et gérer les membres rattachés à chaque antenne.
          </p>
        </section>
      ) : null}

      {seances.length === 0 ? (
        <p className="text-petit text-encre-attenuee">Aucune séance pour le moment.</p>
      ) : (
        <Liste>
          {seances.map((seance) => (
            <LigneListe
              key={seance.id}
              lien={`/ael/seances/${seance.id}`}
              principal={
                <>
                  {formaterDateSeule(seance.date)}
                  {seance.theme ? (
                    <span className="text-encre-attenuee"> · {seance.theme}</span>
                  ) : null}
                </>
              }
              meta={
                <span className="inline-flex flex-wrap items-center gap-esp-2">
                  {seance.antennesNoms.join(', ') || 'Aucune antenne'}
                  <EtatBadge ton={TON_ETAT_SEANCE[seance.etat]} libelle={LIBELLE_ETAT[seance.etat]} />
                </span>
              }
            />
          ))}
        </Liste>
      )}
    </main>
  )
}
