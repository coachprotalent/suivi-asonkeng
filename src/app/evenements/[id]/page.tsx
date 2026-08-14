import Link from 'next/link'
import { notFound } from 'next/navigation'
import { evenementParId, typesEvenementActifs } from '@/lib/donnees/evenements'
import { formaterDateSeule } from '@/lib/format/date'
import { estModerateurOuAdministrateur, exigerProfilActif } from '@/lib/securite/garde'
import { FormulaireEvenement } from '../formulaire-evenement'
import { modifierEvenement } from './actions'

export default async function PageEvenement({ params }: { params: Promise<{ id: string }> }) {
  // Consultation de l'en-tête : TOUT COMPTE ACTIF.
  await exigerProfilActif()
  const { id } = await params

  const evenement = await evenementParId(id)
  if (!evenement) {
    notFound()
  }

  const [types, peutGerer] = await Promise.all([
    typesEvenementActifs(),
    estModerateurOuAdministrateur(),
  ])

  const lignes: Array<[string, string | null]> = [
    ['Type', evenement.typeLibelle],
    ['Début', formaterDateSeule(evenement.dateDebut)],
    ['Fin', evenement.dateFin ? formaterDateSeule(evenement.dateFin) : null],
    // `heure_debut` est une colonne `time`, sérialisée `HH:MM:SS` par PostgREST. Affichée
    // telle quelle en la rognant aux minutes : la passer par `formaterDateHeure`
    // supposerait un instant, ce que D56 refuse précisément de faire.
    ['Heure', evenement.heureDebut ? evenement.heureDebut.slice(0, 5) : null],
    ['Lieu', evenement.lieu],
  ]

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/evenements" className="text-sm underline underline-offset-4">
        Retour aux évènements
      </Link>

      <h1 className="mt-4 mb-6 text-2xl font-semibold">{evenement.titre}</h1>

      <dl className="divide-y divide-neutral-200">
        {lignes.map(([intitule, valeur]) => (
          <div key={intitule} className="flex justify-between gap-4 py-3">
            <dt className="text-sm text-neutral-500">{intitule}</dt>
            <dd className="text-sm">{valeur ?? '—'}</dd>
          </div>
        ))}
      </dl>

      {evenement.description ? (
        <p className="mt-6 text-sm whitespace-pre-line">{evenement.description}</p>
      ) : null}

      {peutGerer ? (
        <section className="mt-10">
          <details>
            <summary className="cursor-pointer text-sm underline underline-offset-4">
              Modifier l&apos;évènement
            </summary>
            <div className="mt-4">
              <FormulaireEvenement
                action={modifierEvenement}
                types={types}
                libelleBouton="Enregistrer"
                champsCaches={{ evenementId: evenement.id }}
                valeurs={{
                  titre: evenement.titre,
                  typeId: evenement.typeId,
                  dateDebut: evenement.dateDebut,
                  dateFin: evenement.dateFin ?? '',
                  heureDebut: evenement.heureDebut ? evenement.heureDebut.slice(0, 5) : '',
                  lieu: evenement.lieu ?? '',
                  description: evenement.description ?? '',
                }}
                // Le type COURANT même s'il a été désactivé depuis : sans lui, le `select`
                // ne le proposerait pas et le premier enregistrement BASCULERAIT
                // SILENCIEUSEMENT l'évènement vers un autre type. Un type désactivé
                // disparaît des NOUVELLES attributions, pas de l'existant (spec §7).
                typeCourant={{ id: evenement.typeId, libelle: evenement.typeLibelle }}
              />
            </div>
          </details>
        </section>
      ) : null}

      {/*
        SECTION PARTICIPANTS — livrée par la Task 19.
        ELLE NE SE VIDE PAS PAR RLS, ELLE NE SE REND PAS DU TOUT hors modérateur et
        administrateur. Un compte ordinaire qui lirait `participations` sous RLS obtiendrait
        ZÉRO ligne : un évènement à cent participants lui paraîtrait DÉSERT, ce qui est un
        mensonge et non une protection. C'est le pendant exact du mode de défaillance de
        D71, dans l'autre sens.
      */}
    </main>
  )
}
