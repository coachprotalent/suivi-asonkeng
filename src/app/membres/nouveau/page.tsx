import { EnTetePage } from '@/composants/ui/en-tete-page'
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
    <main className="mx-auto max-w-2xl px-esp-6 py-esp-10">
      <EnTetePage
        retour={{ href: '/membres', libelle: "Retour à l'annuaire" }}
        titre="Nouveau membre"
        soustitre="La fiche, ses statuts et sa place dans l'arbre sont enregistrés en une seule fois. Les trois enrichissements sont facultatifs."
      />
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
