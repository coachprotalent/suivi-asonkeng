import Link from 'next/link'
import { dirigeantPropose } from '@/lib/domaine/arbre'
import { maillonArbre } from '@/lib/donnees/arbre'
import { listerDemandesEnAttente, mesDemandes, type DemandeListe } from '@/lib/donnees/demandes'
import { membreBrefParId, type MembreBref } from '@/lib/donnees/membres'
import { rolesDuProfil } from '@/lib/donnees/profils'
import { exigerProfilActif } from '@/lib/securite/garde'
import { LigneDemandeAdmin } from './ligne-demande-admin'
import { LigneDemandePersonnelle } from './ligne-demande-personnelle'

export default async function PageDemandes() {
  const profil = await exigerProfilActif()
  const roles = await rolesDuProfil(profil.id)
  const estAdmin = roles.includes('administrateur')

  const mesPropositions = await mesDemandes(profil.id)

  let demandesEnAttente: DemandeListe[] = []
  const propositionsDirigeant: Record<string, MembreBref | null> = {}
  if (estAdmin) {
    demandesEnAttente = await listerDemandesEnAttente()
    for (const demande of demandesEnAttente) {
      if (demande.origine === 'demande_suivi' && demande.demandeurMembreId) {
        const maillon = await maillonArbre(demande.demandeurMembreId)
        const proposeId = dirigeantPropose(maillon)
        propositionsDirigeant[demande.id] = proposeId ? await membreBrefParId(proposeId) : null
      } else {
        // Compte racine sans fiche liée (spec D11), ou origine auto_inscription :
        // aucune proposition (registre 1c, piège n°3).
        propositionsDirigeant[demande.id] = null
      }
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <Link href="/tableau-de-bord" className="text-sm underline underline-offset-4">
        Retour au tableau de bord
      </Link>
      <h1 className="mt-4 mb-8 text-2xl font-semibold">Demandes</h1>

      {estAdmin ? (
        <section className="mb-10">
          <h2 className="mb-4 text-lg font-medium">À traiter ({demandesEnAttente.length})</h2>
          {demandesEnAttente.length === 0 ? (
            <p className="text-sm text-neutral-500">Aucune demande en attente.</p>
          ) : (
            <ul className="divide-y divide-neutral-200">
              {demandesEnAttente.map((demande) => (
                <LigneDemandeAdmin
                  key={demande.id}
                  demande={demande}
                  dirigeantInitial={propositionsDirigeant[demande.id] ?? null}
                />
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <section>
        <h2 className="mb-4 text-lg font-medium">Mes demandes</h2>
        {mesPropositions.length === 0 ? (
          <p className="text-sm text-neutral-500">Vous n&apos;avez soumis aucune demande.</p>
        ) : (
          <ul className="divide-y divide-neutral-200">
            {mesPropositions.map((demande) => (
              <LigneDemandePersonnelle key={demande.id} demande={demande} />
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
