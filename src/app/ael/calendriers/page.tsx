import { EnTetePage } from '@/composants/ui/en-tete-page'
import { LigneListe, Liste } from '@/composants/ui/ligne-liste'
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
    <main className="mx-auto max-w-2xl px-esp-6 py-esp-10">
      <EnTetePage retour={{ href: '/ael/seances', libelle: 'Voir les séances' }} titre="Calendrier AEL récurrent" />

      <div className="mb-esp-10">
        <Liste>
          {actifs.map((c) => (
            <LigneListe
              key={c.id}
              principal={libelleCreneau(c)}
              actions={
                <form action={desactiverCalendrier}>
                  <input type="hidden" name="id" value={c.id} />
                  <BoutonBasculeCalendrier libelle={libelleCreneau(c)} desactiver />
                </form>
              }
            />
          ))}
        </Liste>
      </div>

      {inactifs.length > 0 ? (
        <>
          <h2 className="mb-esp-4 text-section">Créneaux désactivés</h2>
          <div className="mb-esp-10">
            <Liste>
              {inactifs.map((c) => (
                <LigneListe
                  key={c.id}
                  principal={<span className="text-encre-attenuee">{libelleCreneau(c)}</span>}
                  actions={
                    <form action={reactiverCalendrier}>
                      <input type="hidden" name="id" value={c.id} />
                      <BoutonBasculeCalendrier libelle={libelleCreneau(c)} desactiver={false} />
                    </form>
                  }
                />
              ))}
            </Liste>
          </div>
        </>
      ) : null}

      <h2 className="mb-esp-4 text-section">Ajouter un créneau</h2>
      <FormulaireCalendrier antennes={antennes} />
    </main>
  )
}
