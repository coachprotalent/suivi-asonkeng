import Link from 'next/link'
import { notFound } from 'next/navigation'
import { membreParId } from '@/lib/donnees/membres'
import { rolesDuProfil } from '@/lib/donnees/profils'
import { exigerProfilActif } from '@/lib/securite/garde'
import { archiverMembre, desarchiverMembre } from '../actions'
import { BoutonArchiver } from './bouton-archiver'

const LIBELLE_SITUATION: Record<string, string> = {
  etudiant: 'Étudiant',
  travailleur: 'Travailleur',
  autre: 'Autre',
}

export default async function PageFicheMembre({ params }: { params: Promise<{ id: string }> }) {
  const profil = await exigerProfilActif()
  const { id } = await params
  const membre = await membreParId(id)
  if (!membre) {
    notFound()
  }

  const roles = await rolesDuProfil(profil.id)
  const estAdmin = roles.includes('administrateur')

  const lignes: Array<[string, string | null]> = [
    ['Antenne', membre.antenneNom],
    ['Ville', membre.ville],
    ['Pays', membre.pays],
    ['Situation', membre.situation ? LIBELLE_SITUATION[membre.situation] : null],
    ["Domaine d'étude", membre.domaineEtude],
    ['Téléphone', membre.telephone],
    ['Contact', membre.emailContact],
    ['AEL déjà suivis', String(membre.reportInitialAel)],
  ]

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/membres" className="text-sm underline underline-offset-4">
        Retour à l&apos;annuaire
      </Link>

      <header className="mt-4 mb-8 flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            {membre.prenom} {membre.nom}
          </h1>
          {/*
            L'état vit en base et n'était affiché nulle part : une fiche archivée
            était indiscernable d'une fiche active, et un administrateur arrivant
            par un lien périmé pouvait la modifier en croyant suivre un membre actif.
          */}
          {membre.etat !== 'actif' ? (
            <p className="mt-1 text-sm text-amber-700">
              {membre.etat === 'archive'
                ? 'Fiche archivée — elle ne figure plus dans l’annuaire.'
                : 'Fiche en attente de validation.'}
            </p>
          ) : null}
        </div>
        {estAdmin ? (
          <div className="flex items-center gap-4">
            <Link href={`/membres/${membre.id}/modifier`} className="text-sm underline underline-offset-4">
              Modifier
            </Link>
            {/*
              Pas de bouton d'archivage sur une fiche déjà archivée : l'action
              n'aurait aucun effet, et la proposer laisserait croire le contraire.
              À la place, un rétablissement : sur mobile, un archivage accidentel
              serait sinon définitif sans intervention en base, alors que la
              confirmation promet « rien n'est supprimé ».
            */}
            {membre.etat === 'actif' ? (
              <form action={archiverMembre}>
                <input type="hidden" name="id" value={membre.id} />
                <BoutonArchiver nomComplet={`${membre.prenom} ${membre.nom}`} archiver />
              </form>
            ) : null}
            {membre.etat === 'archive' ? (
              <form action={desarchiverMembre}>
                <input type="hidden" name="id" value={membre.id} />
                <BoutonArchiver nomComplet={`${membre.prenom} ${membre.nom}`} archiver={false} />
              </form>
            ) : null}
          </div>
        ) : null}
      </header>

      <dl className="divide-y divide-neutral-200">
        {lignes.map(([intitule, valeur]) => (
          <div key={intitule} className="flex justify-between gap-4 py-3">
            <dt className="text-sm text-neutral-500">{intitule}</dt>
            <dd className="text-sm">{valeur ?? '—'}</dd>
          </div>
        ))}
      </dl>
    </main>
  )
}
