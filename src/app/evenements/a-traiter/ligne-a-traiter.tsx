'use client'

import { useActionState, useId, useState } from 'react'
import type { ATraiterLigne } from '@/lib/donnees/evenements-lots'
import type { MembreBref } from '@/lib/donnees/membres'
import { SelecteurMembre } from '@/app/membres/selecteur-membre'
import { classerParticipant, convertirParticipant, type EtatConversion } from './actions'

const etatInitial: EtatConversion = { erreur: null }

type Chemin = 'fiche_en_attente' | 'fiche_active' | 'membre_existant'

/**
 * Une ligne de la liste « à traiter ». Les blocs de conversion et de classement ne sont
 * rendus que pour un administrateur (D55) ; le modérateur voit la ligne et ses coordonnées,
 * ce que la ligne « Voir les trois désirs » du §5.2 lui accorde déjà.
 *
 * `peutAgir` DÉCIDE D'AFFICHER et ne protège rien : la protection est
 * `exigerAdministrateur`, première instruction des deux actions.
 *
 * `nom`, `prenom` et `motif` sont des CHAMPS CONTRÔLÉS, et ce n'est pas un simple choix de
 * style : React réinitialise les champs NON contrôlés d'un `<form action={...}>` dès que
 * l'action se termine SANS LEVER, y compris quand elle RETOURNE un refus métier — défaut
 * trouvé et verrouillé à la tâche précédente (`src/app/evenements/formulaire-evenement.tsx`,
 * `src/app/evenements/types/formulaire-type.tsx`). Le motif de classement est du texte
 * libre qu'on ne veut surtout pas faire retaper pour corriger une virgule ; le nom et le
 * prénom, préremplis puis éventuellement corrigés (chemin 1 et chemin 2), ne doivent pas
 * non plus disparaître si le formulaire est refusé pour une AUTRE raison (faiseur de
 * disciple manquant, par exemple).
 *
 * PAS DE RÉINITIALISATION AU SUCCÈS ICI, à la différence de `formulaire-type.tsx` : une
 * conversion ou un classement réussis font DISPARAÎTRE ce participant de la liste « à
 * traiter » (la vue qui l'alimente exclut désormais cette ligne, D74) — le composant se
 * démonte, il n'y a donc rien à vider.
 */
export function LigneATraiter({
  participant,
  peutAgir,
}: {
  participant: ATraiterLigne
  peutAgir: boolean
}) {
  const [etatConversion, convertir, conversionEnCours] = useActionState(
    convertirParticipant,
    etatInitial,
  )
  const [etatClassement, classer, classementEnCours] = useActionState(
    classerParticipant,
    etatInitial,
  )
  const [chemin, setChemin] = useState<Chemin>('fiche_en_attente')
  const [faiseur, setFaiseur] = useState<MembreBref | null>(null)
  const [dirigeant, setDirigeant] = useState<MembreBref | null>(null)
  const [cible, setCible] = useState<MembreBref | null>(null)
  const [nom, setNom] = useState(participant.nom)
  const [prenom, setPrenom] = useState(participant.prenom ?? '')
  const [motif, setMotif] = useState('')
  const prefixe = useId()
  const idMotif = `${prefixe}-motif`
  const idAideMotif = `${prefixe}-aide-motif`

  const nomComplet = `${participant.prenom ?? ''} ${participant.nom}`.trim()

  return (
    <li className="py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">{nomComplet}</span>
        <span className="text-sm text-neutral-500">
          {participant.evenementsConcernes} évènement
          {participant.evenementsConcernes > 1 ? 's' : ''}
        </span>
      </div>
      <p className="mt-1 text-sm text-neutral-600">
        {[participant.telephone, participant.email, participant.ville, participant.pays]
          .filter(Boolean)
          .join(' · ') || 'Aucune coordonnée renseignée.'}
      </p>

      {peutAgir ? (
        <>
          <details className="mt-3">
            <summary className="cursor-pointer text-sm underline underline-offset-4">
              Convertir en membre
            </summary>
            <form action={convertir} className="mt-3 flex flex-col gap-3">
              <input type="hidden" name="participantId" value={participant.participantExterneId} />
              <input type="hidden" name="chemin" value={chemin} />

              <fieldset className="flex flex-col gap-2">
                <legend className="text-sm font-medium">Façon de convertir</legend>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="cheminAffiche"
                    checked={chemin === 'fiche_en_attente'}
                    onChange={() => setChemin('fiche_en_attente')}
                  />
                  Créer une fiche à valider (elle rejoint l&apos;écran des demandes)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="cheminAffiche"
                    checked={chemin === 'fiche_active'}
                    onChange={() => setChemin('fiche_active')}
                  />
                  Créer une fiche active tout de suite
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="cheminAffiche"
                    checked={chemin === 'membre_existant'}
                    onChange={() => setChemin('membre_existant')}
                  />
                  Rattacher à une fiche membre existante
                </label>
              </fieldset>

              {chemin !== 'membre_existant' ? (
                // Le nom et le prénom sont préremplis depuis le participant externe, mais
                // RESTENT MODIFIABLES : une saisie de séminaire est souvent partielle ou
                // approximative, et la fiche membre, elle, est durable. CONTRÔLÉS (voir
                // l'encadré ci-dessus) : une correction ne doit pas se perdre si le
                // formulaire est refusé pour une autre raison.
                <div className="flex flex-wrap gap-3">
                  <label className="flex flex-1 flex-col gap-1.5">
                    <span className="text-sm font-medium">Nom</span>
                    <input
                      name="nom"
                      required
                      value={nom}
                      onChange={(evenement) => setNom(evenement.target.value)}
                      className="rounded-md border border-neutral-300 px-3 py-2"
                    />
                  </label>
                  <label className="flex flex-1 flex-col gap-1.5">
                    <span className="text-sm font-medium">Prénom</span>
                    <input
                      name="prenom"
                      required
                      value={prenom}
                      onChange={(evenement) => setPrenom(evenement.target.value)}
                      className="rounded-md border border-neutral-300 px-3 py-2"
                    />
                  </label>
                </div>
              ) : null}

              {chemin === 'fiche_active' ? (
                <>
                  {/* D67 — ce chemin pose un faiseur de disciple, et c'est lui que le
                      verrou consultatif « arbre » de la passerelle protège. Sans faiseur,
                      la fiche naîtrait ACTIVE et DÉTACHÉE de l'arbre, sans le moindre
                      signal : `champManquantConversion` le refuse côté serveur. */}
                  <SelecteurMembre
                    nom="faiseurId"
                    label="Faiseur de disciple"
                    aide="Cherche parmi les membres actifs. Obligatoire pour une fiche active."
                    valeur={faiseur}
                    surChoix={setFaiseur}
                    exclureId={null}
                  />
                  <SelecteurMembre
                    nom="dirigeantId"
                    label="Dirigeant (facultatif)"
                    aide="Laissé vide, il est proposé automatiquement à partir du faiseur de disciple."
                    valeur={dirigeant}
                    surChoix={setDirigeant}
                    exclureId={null}
                  />
                </>
              ) : null}

              {chemin === 'membre_existant' ? (
                // D68 — le sélecteur ne propose QUE des membres actifs, ET la passerelle
                // refuse une fiche non active (marqueur membre_cible_non_actif). Double
                // dispositif : un onglet resté ouvert reposterait sinon un identifiant
                // devenu invalide entre-temps.
                <SelecteurMembre
                  nom="membreCibleId"
                  label="Fiche membre existante"
                  aide="Cherche parmi les membres actifs. Le séminaire sera rattaché à cette fiche."
                  valeur={cible}
                  surChoix={setCible}
                  exclureId={null}
                />
              ) : null}

              <div className="flex items-center gap-4">
                <button
                  type="submit"
                  disabled={conversionEnCours}
                  className="self-start rounded-md bg-neutral-900 px-4 py-2 text-white disabled:opacity-50"
                >
                  Convertir
                </button>
                {etatConversion.erreur ? (
                  <p role="alert" className="text-sm text-red-600">
                    {etatConversion.erreur}
                  </p>
                ) : null}
              </div>
            </form>
          </details>

          <details className="mt-2">
            <summary className="cursor-pointer text-sm underline underline-offset-4">
              Classer sans suite
            </summary>
            <form action={classer} className="mt-3 flex flex-col gap-3">
              <input type="hidden" name="participantId" value={participant.participantExterneId} />
              <div className="flex flex-col gap-1.5">
                <label htmlFor={idMotif} className="text-sm font-medium">
                  Motif
                </label>
                <input
                  id={idMotif}
                  name="motif"
                  required
                  value={motif}
                  onChange={(evenement) => setMotif(evenement.target.value)}
                  aria-describedby={idAideMotif}
                  className="rounded-md border border-neutral-300 px-3 py-2"
                />
                <span id={idAideMotif} className="text-xs text-neutral-500">
                  Définitif : ce participant ne reviendra pas dans cette liste. Il restera
                  convertible plus tard s&apos;il reprend contact.
                </span>
              </div>
              <button
                type="submit"
                disabled={classementEnCours}
                className="self-start rounded-md border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-50"
              >
                Classer sans suite
              </button>
              {etatClassement.erreur ? (
                <p role="alert" className="text-sm text-red-600">
                  {etatClassement.erreur}
                </p>
              ) : null}
            </form>
          </details>
        </>
      ) : (
        <p className="mt-3 text-sm text-neutral-500">
          La conversion et le classement sont réservés aux administrateurs.
        </p>
      )}
    </li>
  )
}
