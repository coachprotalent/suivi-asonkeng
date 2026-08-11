import Link from 'next/link'
import { notFound } from 'next/navigation'
import { membreParId } from '@/lib/donnees/membres'
import { rolesDuProfil } from '@/lib/donnees/profils'
import { journalDuMembre, listerCatalogue, statutsDuMembre } from '@/lib/donnees/statuts'
import { exigerProfilActif } from '@/lib/securite/garde'
import { retirerStatut } from './actions'
import { BoutonRetirerStatut } from './bouton-retirer-statut'
import { FormulaireStatut } from './formulaire-statut'

const FORMAT_DATE_HEURE = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'short',
  timeStyle: 'short',
})

export default async function PageStatuts({ params }: { params: Promise<{ id: string }> }) {
  const profil = await exigerProfilActif()
  const { id } = await params
  const membre = await membreParId(id)
  if (!membre) {
    notFound()
  }

  const [statuts, journal, roles] = await Promise.all([
    statutsDuMembre(membre.id),
    journalDuMembre(membre.id),
    rolesDuProfil(profil.id),
  ])
  const estAdmin = roles.includes('administrateur')
  // Le catalogue ne sert qu'au formulaire d'attribution, rendu uniquement pour un
  // administrateur : l'interroger pour tout visiteur — le cas le plus fréquent —
  // ferait une requête inutile.
  const groupes = estAdmin ? await listerCatalogue() : []

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href={`/membres/${membre.id}`} className="text-sm underline underline-offset-4">
        Retour à la fiche
      </Link>

      <header className="mt-4 mb-8">
        <h1 className="text-2xl font-semibold">
          Statuts de {membre.prenom} {membre.nom}
        </h1>
        {membre.etat !== 'actif' ? (
          <p className="mt-1 text-sm text-amber-700">
            {membre.etat === 'archive'
              ? "Fiche archivée — elle ne figure plus dans l'annuaire."
              : 'Fiche en attente de validation.'}
          </p>
        ) : null}
      </header>

      <section className="mb-10">
        <h2 className="mb-4 text-lg font-medium">Statuts actuels</h2>
        {statuts.length === 0 ? (
          <p className="text-neutral-600">Aucun statut attribué pour l&apos;instant.</p>
        ) : (
          <ul className="divide-y divide-neutral-200">
            {statuts.map((statut) => (
              <li key={statut.statutId} className="flex items-start justify-between gap-4 py-3">
                <div>
                  <p className="font-medium">{statut.libelle}</p>
                  <p className="text-sm text-neutral-500">
                    {statut.groupeNom}
                    {statut.dateAcquisition ? ` · depuis le ${statut.dateAcquisition}` : ''}
                  </p>
                  {statut.note ? <p className="mt-1 text-sm">{statut.note}</p> : null}
                </div>
                {estAdmin ? (
                  <form action={retirerStatut} className="flex items-start gap-2">
                    <input type="hidden" name="membreId" value={membre.id} />
                    <input type="hidden" name="statutId" value={statut.statutId} />
                    {/*
                      `maxLength` n'est pas décoratif : `retirerStatut` n'a aucun canal
                      pour renvoyer un message de validation, et un motif trop long y
                      serait journalisé puis remplacé par null — le retrait réussirait
                      sans le motif, sans un mot à l'utilisateur. La limite se voit
                      donc au moment où l'on écrit, pas après coup.
                    */}
                    <input
                      type="text"
                      name="motif"
                      maxLength={500}
                      placeholder="Motif du retrait (facultatif)"
                      aria-label={`Motif du retrait du statut « ${statut.libelle} »`}
                      className="w-56 rounded border border-neutral-300 px-2 py-1 text-sm"
                    />
                    <BoutonRetirerStatut libelle={statut.libelle} />
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {estAdmin ? (
        <section className="mb-10">
          <h2 className="mb-4 text-lg font-medium">Attribuer un statut</h2>
          <FormulaireStatut membreId={membre.id} groupes={groupes} />
        </section>
      ) : null}

      <section>
        <h2 className="mb-1 text-lg font-medium">Journal</h2>
        <p className="mb-4 text-sm text-neutral-500">
          Chaque mouvement est conservé : c&apos;est la seule trace des modifications.
        </p>
        {journal.length === 0 ? (
          <p className="text-neutral-600">Aucun mouvement enregistré.</p>
        ) : (
          <ul className="divide-y divide-neutral-200">
            {journal.map((entree) => (
              <li key={entree.id} className="py-3 text-sm">
                <span className={entree.action === 'ajout' ? 'text-green-700' : 'text-red-700'}>
                  {entree.action === 'ajout' ? 'Ajouté' : 'Retiré'}
                </span>{' '}
                — {entree.libelle}
                <span className="text-neutral-500">
                  {' '}
                  · {FORMAT_DATE_HEURE.format(new Date(entree.le))}
                  {/*
                    Le nom de l'auteur est capturé à l'écriture depuis la migration
                    20260813160000 et ne devrait plus manquer pour une nouvelle
                    entrée. Un `null` reste possible sur une ligne antérieure à cette
                    migration : on le dit plutôt que de l'omettre en silence.
                  */}
                  · par {entree.parNomAffichage ?? 'auteur inconnu'}
                </span>
                {entree.motif ? <p className="text-neutral-600">{entree.motif}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
