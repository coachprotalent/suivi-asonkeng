import Link from 'next/link'
import { listerAntennes } from '@/lib/donnees/antennes'
import { listerCalendriers } from '@/lib/donnees/ael'
import { exigerModerateurOuAdministrateur } from '@/lib/securite/garde'
import { desactiverCalendrier, reactiverCalendrier } from './actions'
import { BoutonBasculeCalendrier } from './bouton-bascule-calendrier'
import { FormulaireCalendrier } from './formulaire-calendrier'

const LIBELLE_JOUR: Record<number, string> = {
  1: 'Lundi',
  2: 'Mardi',
  3: 'Mercredi',
  4: 'Jeudi',
  5: 'Vendredi',
  6: 'Samedi',
  7: 'Dimanche',
}

function libelleCreneau(c: { antenneNom: string; jourSemaine: number; heure: string | null }): string {
  return `${c.antenneNom} · ${LIBELLE_JOUR[c.jourSemaine]}${c.heure ? ` · ${c.heure}` : ''}`
}

export default async function PageCalendriersAel() {
  // Écran entièrement réservé (D22) : le garde est la PREMIÈRE instruction, avant
  // toute lecture — aucune consultation n'est ouverte ici, contrairement aux autres
  // écrans de cette phase.
  await exigerModerateurOuAdministrateur()

  const [calendriers, antennes] = await Promise.all([listerCalendriers(), listerAntennes()])
  const actifs = calendriers.filter((c) => c.actif)
  const inactifs = calendriers.filter((c) => !c.actif)

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Link href="/ael/seances" className="text-sm underline underline-offset-4">
        Voir les séances
      </Link>
      <h1 className="mt-4 mb-8 text-2xl font-semibold">Calendrier AEL récurrent</h1>

      <ul className="mb-10 divide-y divide-neutral-200">
        {actifs.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-4 py-3">
            <span>{libelleCreneau(c)}</span>
            <form action={desactiverCalendrier}>
              <input type="hidden" name="id" value={c.id} />
              <BoutonBasculeCalendrier libelle={libelleCreneau(c)} desactiver />
            </form>
          </li>
        ))}
      </ul>

      {inactifs.length > 0 ? (
        <>
          <h2 className="mb-4 text-lg font-medium">Créneaux désactivés</h2>
          <ul className="mb-10 divide-y divide-neutral-200">
            {inactifs.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-4 py-3">
                <span className="text-neutral-500">{libelleCreneau(c)}</span>
                <form action={reactiverCalendrier}>
                  <input type="hidden" name="id" value={c.id} />
                  <BoutonBasculeCalendrier libelle={libelleCreneau(c)} desactiver={false} />
                </form>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <h2 className="mb-4 text-lg font-medium">Ajouter un créneau</h2>
      <FormulaireCalendrier antennes={antennes} />
    </main>
  )
}
