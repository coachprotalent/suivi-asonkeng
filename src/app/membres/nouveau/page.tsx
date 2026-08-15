import Link from 'next/link'
import { listerAntennes } from '@/lib/donnees/antennes'
import { listerCatalogue } from '@/lib/donnees/statuts'
import { exigerAdministrateur } from '@/lib/securite/garde'
import { creerMembreEnrichi } from '../actions'
import { FormulaireMembre } from '../formulaire-membre'
import { BlocEnrichissement } from './bloc-enrichissement'

export default async function PageNouveauMembre() {
  // Écran d'administration : le garde est la PREMIÈRE instruction, avant toute lecture
  // (D90). Il ne descend PAS à `exigerAutoriteSur` malgré les écritures de statuts que
  // l'action déclenchera : la création d'une fiche est réservée à l'administrateur (§5.2),
  // et un administrateur a autorité partout — les deux coïncident ici.
  await exigerAdministrateur()

  const [antennes, groupes] = await Promise.all([listerAntennes(), listerCatalogue()])

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/membres" className="text-sm underline underline-offset-4">
        Retour à l&apos;annuaire
      </Link>
      <h1 className="mt-4 mb-2 text-2xl font-semibold">Nouveau membre</h1>
      <p className="mb-8 text-sm text-neutral-500">
        La fiche, ses statuts et sa place dans l&apos;arbre sont enregistrés en une seule
        fois. Les trois enrichissements sont facultatifs.
      </p>
      <FormulaireMembre
        action={creerMembreEnrichi}
        antennes={antennes}
        libelleBouton="Créer la fiche"
      >
        <BlocEnrichissement groupes={groupes} />
      </FormulaireMembre>
    </main>
  )
}
