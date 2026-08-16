import { notFound } from 'next/navigation'
import { membreParId } from '@/lib/donnees/membres'
import { journalDuMembre, listerCatalogue, statutsDuMembre } from '@/lib/donnees/statuts'
import { formaterDateHeure, formaterDateSeule } from '@/lib/format/date'
import { aAutoriteSur, exigerProfilActif } from '@/lib/securite/garde'
import { Carte } from '@/composants/ui/carte'
import { EnTetePage } from '@/composants/ui/en-tete-page'
import { LigneListe, Liste } from '@/composants/ui/ligne-liste'
import { FormulaireRetraitStatut } from './formulaire-retrait-statut'
import { FormulaireStatut } from './formulaire-statut'

export default async function PageStatuts({ params }: { params: Promise<{ id: string }> }) {
  // Le profil n'est pas réutilisé ici : ce garde ne sert qu'à vérifier qu'un compte
  // actif est connecté, l'écran restant lisible par tout compte actif (spec 1c, §5.1).
  await exigerProfilActif()
  const { id } = await params
  const membre = await membreParId(id)
  if (!membre) {
    notFound()
  }

  const [statuts, journal, peutEcrire] = await Promise.all([
    statutsDuMembre(membre.id),
    journalDuMembre(membre.id),
    aAutoriteSur(membre.id),
  ])
  // Le catalogue ne sert qu'au formulaire d'attribution, rendu uniquement pour qui a
  // autorité : l'interroger pour tout visiteur — le cas le plus fréquent — ferait une
  // requête inutile.
  const groupes = peutEcrire ? await listerCatalogue() : []

  return (
    <main className="mx-auto max-w-3xl px-esp-6 py-esp-10">
      <EnTetePage
        retour={{ href: `/membres/${membre.id}`, libelle: 'Retour à la fiche' }}
        titre={`Statuts de ${membre.prenom} ${membre.nom}`}
      />

      {membre.etat !== 'actif' ? (
        <div className="mb-esp-6">
          <Carte ton="avertissement" role="alert">
            {membre.etat === 'archive'
              ? "Fiche archivée — elle ne figure plus dans l'annuaire."
              : 'Fiche en attente de validation.'}
          </Carte>
        </div>
      ) : null}

      <section className="mb-esp-10">
        <h2 className="mb-esp-4 text-section">Statuts actuels</h2>
        {statuts.length === 0 ? (
          <p className="text-petit text-encre-attenuee">Aucun statut attribué pour l&apos;instant.</p>
        ) : (
          <Liste>
            {statuts.map((statut) => (
              <LigneListe
                key={statut.statutId}
                principal={statut.libelle}
                meta={
                  <>
                    {statut.groupeNom}
                    {statut.dateAcquisition
                      ? ` · depuis le ${formaterDateSeule(statut.dateAcquisition)}`
                      : ''}
                    {statut.note ? <span className="block">{statut.note}</span> : null}
                  </>
                }
                actions={
                  peutEcrire ? (
                    <FormulaireRetraitStatut
                      membreId={membre.id}
                      statutId={statut.statutId}
                      libelle={statut.libelle}
                    />
                  ) : undefined
                }
              />
            ))}
          </Liste>
        )}
      </section>

      {peutEcrire ? (
        <section className="mb-esp-10">
          <h2 className="mb-esp-4 text-section">Attribuer un statut</h2>
          <FormulaireStatut membreId={membre.id} groupes={groupes} />
        </section>
      ) : null}

      <section>
        <h2 className="mb-esp-1 text-section">Journal</h2>
        <p className="mb-esp-4 text-petit text-encre-attenuee">
          Chaque ajout et chaque retrait est conservé : c&apos;est la seule trace de ces mouvements.
        </p>
        {journal.length === 0 ? (
          <p className="text-petit text-encre-attenuee">Aucun mouvement enregistré.</p>
        ) : (
          <Liste>
            {journal.map((entree) => (
              <LigneListe
                key={entree.id}
                principal={
                  <>
                    <span
                      className={entree.action === 'ajout' ? 'text-etat-acquis' : 'text-etat-refus'}
                    >
                      {entree.action === 'ajout' ? 'Ajouté' : 'Retiré'}
                    </span>{' '}
                    — {entree.libelle}
                  </>
                }
                meta={
                  <>
                    {formaterDateHeure(entree.le)}
                    {/*
                      Le nom de l'auteur est capturé à l'écriture depuis la migration
                      20260813160000 et ne devrait plus manquer pour une nouvelle
                      entrée. Un `null` reste possible sur une ligne antérieure à
                      cette migration : on le dit plutôt que de l'omettre en silence.
                    */}
                    {' · par '}
                    {entree.parNomAffichage ?? 'auteur inconnu'}
                  </>
                }
                complement={
                  entree.motif ? (
                    <p className="text-petit text-encre-attenuee">{entree.motif}</p>
                  ) : undefined
                }
              />
            ))}
          </Liste>
        )}
      </section>
    </main>
  )
}
