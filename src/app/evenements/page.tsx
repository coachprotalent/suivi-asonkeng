import Link from 'next/link'
import { EnTetePage } from '@/composants/ui/en-tete-page'
import { LigneListe, Liste } from '@/composants/ui/ligne-liste'
import { Pagination } from '@/composants/ui/pagination'
import { CLASSES_VARIANTE } from '@/composants/ui/bouton'
import { CLASSES_CHAMP } from '@/composants/ui/champ'
import { listerEvenements, listerTypesEvenement, typesEvenementActifs } from '@/lib/donnees/evenements'
import { TAILLE_PAGE_EVENEMENTS } from '@/lib/donnees/evenements-lots'
import { formaterDateSeule } from '@/lib/format/date'
import { pageDemandee } from '@/lib/donnees/pagination'
import { bornerPage } from '@/lib/navigation/bornage'
import { estModerateurOuAdministrateur, exigerProfilActif } from '@/lib/securite/garde'
import { creerEvenement } from './actions'
import { FormulaireEvenement } from './formulaire-evenement'

export default async function PageEvenements({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; typeId?: string }>
}) {
  // Consultation : TOUT COMPTE ACTIF (spec §5.3 : `evenements` est lisible de tout compte
  // actif, « nécessaire pour afficher les séminaires assistés sur une fiche »).
  await exigerProfilActif()

  const { page: pageBrute, typeId } = await searchParams
  // `pageDemandee` (src/lib/donnees/pagination.ts) : même garde M5 (`Number('2.5') || 1`
  // vaut 2.5, non entier, qui franchissait la borne haute et s'affichait « page 2.5 sur
  // N ») que `src/app/membres/page.tsx`.
  const page = pageDemandee(pageBrute)

  const [{ lignes, total }, typesActifs, tousTypes, peutGerer] = await Promise.all([
    listerEvenements({ page, typeId }),
    typesEvenementActifs(),
    listerTypesEvenement(),
    // DÉCIDE D'AFFICHER, ne protège rien : la protection est
    // `exigerModerateurOuAdministrateur`, première instruction de `creerEvenement`.
    estModerateurOuAdministrateur(),
  ])

  function lienPage(numero: number): string {
    const parametres = new URLSearchParams()
    parametres.set('page', String(numero))
    if (typeId) parametres.set('typeId', typeId)
    return `/evenements?${parametres.toString()}`
  }

  // D121 — LE BORNAGE EST EXTRAIT, À COMPORTEMENT IDENTIQUE (src/lib/navigation/bornage.ts).
  // Une adresse pointant au-delà de la dernière page réelle est un signet périmé (ou un
  // résultat qui a rétréci depuis) : sans ce garde, l'en-tête affichait « N évènements ·
  // page 99 sur 2 » pendant que le corps affirmait qu'aucun évènement ne correspond — deux
  // vérités contradictoires sur le même écran. `total` vient de la LECTURE ELLE-MÊME,
  // jamais d'un aller-retour préalable. HORS DE TOUT `try` : `bornerPage` appelle
  // `redirect()`, qui lève une exception de contrôle Next.js (aucun `try` dans ce fichier).
  const pages = bornerPage(page, total, TAILLE_PAGE_EVENEMENTS, lienPage)

  return (
    <main className="mx-auto max-w-3xl px-esp-6 py-esp-10">
      <EnTetePage
        retour={{ href: '/tableau-de-bord', libelle: 'Retour au tableau de bord' }}
        titre="Évènements"
        action={
          peutGerer ? (
            <Link href="/evenements/a-traiter" className={CLASSES_VARIANTE.lien}>
              Participants à traiter
            </Link>
          ) : null
        }
      />

      {/*
        ⚠️ SECOND ET DERNIER `<form method="get">` DU DÉPÔT (le premier vit sur
        `/membres`). Son `<select>` reste NU, D111 ne l'atteint pas : une navigation
        recharge la page depuis l'adresse, la remise à zéro d'un `<form action>` que
        `Selecteur` referme n'est pas en jeu ici — voir le commentaire de tête de
        `membres/page.tsx`. Il n'y en aura pas un troisième sans que ce commentaire soit
        relu.
      */}
      <form method="get" className="mb-esp-8 flex flex-wrap items-end gap-esp-3">
        <label className="flex flex-col gap-esp-1">
          <span className="libelle-champ text-petit text-encre">Type</span>
          <select name="typeId" defaultValue={typeId ?? ''} className={CLASSES_CHAMP}>
            <option value="">Tous</option>
            {tousTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.libelle}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={CLASSES_VARIANTE.secondaire}>
          Filtrer
        </button>
      </form>

      {peutGerer ? (
        <section className="mb-esp-10">
          <details>
            <summary className="cible-tactile cursor-pointer text-petit text-action underline underline-offset-4">
              Nouvel évènement
            </summary>
            <div className="mt-esp-4">
              <FormulaireEvenement action={creerEvenement} types={typesActifs} libelleBouton="Créer" />
            </div>
          </details>
          <p className="mt-esp-3 text-petit text-encre-attenuee">
            <Link href="/evenements/types" className="underline underline-offset-4">
              Gérer les types
            </Link>{' '}
            — réservé aux administrateurs.
          </p>
        </section>
      ) : null}

      <p className="mb-esp-3 text-petit text-encre-attenuee">
        {total} évènement{total > 1 ? 's' : ''}
      </p>

      {lignes.length === 0 ? (
        <p className="text-petit text-encre-attenuee">Aucun évènement pour le moment.</p>
      ) : (
        <Liste>
          {lignes.map((evenement) => (
            <LigneListe
              key={evenement.id}
              lien={`/evenements/${evenement.id}`}
              principal={
                <>
                  {evenement.titre}
                  <span className="text-encre-attenuee"> · {evenement.typeLibelle}</span>
                </>
              }
              meta={
                <>
                  {formaterDateSeule(evenement.dateDebut)}
                  {evenement.dateFin ? ` — ${formaterDateSeule(evenement.dateFin)}` : ''}
                  {evenement.lieu ? ` · ${evenement.lieu}` : ''}
                </>
              }
            />
          ))}
        </Liste>
      )}

      <div className="mt-esp-6">
        <Pagination page={page} pages={pages} lienVersPage={lienPage} />
      </div>
    </main>
  )
}
