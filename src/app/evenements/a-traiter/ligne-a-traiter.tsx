'use client'

import { useActionState, useId, useState } from 'react'
import { formaterDateSeule } from '@/lib/format/date'
import type { ATraiterLigne } from '@/lib/donnees/evenements-lots'
import type { MembreBref } from '@/lib/donnees/membres'
import { SelecteurMembre } from '@/app/membres/selecteur-membre'
import { classerParticipant, convertirParticipant, type EtatConversion } from './actions'

const etatInitial: EtatConversion = { erreur: null }

type Chemin = 'fiche_en_attente' | 'fiche_active' | 'membre_existant'

/**
 * Message de la confirmation de conversion (M11). Chaque chemin a sa conséquence propre, et
 * un texte générique les rendrait indiscernables au moment précis où l'administrateur peut
 * encore se raviser — même discipline que les messages de refus de `messages.ts`, qui
 * reçoivent chacun le leur plutôt qu'un texte commun.
 */
function messageConfirmationConversion(nomComplet: string, chemin: Chemin): string {
  const consequence =
    chemin === 'fiche_en_attente'
      ? "Une fiche à valider sera créée et déposée sur l'écran des demandes."
      : chemin === 'fiche_active'
        ? 'Une fiche ACTIVE sera créée immédiatement, avec le faiseur de disciple choisi.'
        : 'Les séminaires de cette personne seront rattachés à la fiche membre choisie.'
  return `Convertir ${nomComplet} ? ${consequence} La conversion est DÉFINITIVE : aucun geste de l'application ne la défait.`
}

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
        {/* M1 DE LA REVUE FINALE — `premiereExpression` était sélectionné, typé et mappé
            mais RENDU PAR AUCUN ÉCRAN, et le commentaire qui exclut `cree_le` de la lecture
            (« une colonne lue que personne ne rend est une colonne morte ») justifiait sa
            présence par un affichage qui n'existait pas. Il existe désormais — et c'est
            l'information que cette file de travail réclamait le plus : depuis QUAND cette
            personne attend. C'est aussi la clé de tri de la liste, ce qui rend l'ordre
            affiché lisible au lieu d'être subi. */}
        <span className="text-sm text-neutral-500">
          {participant.evenementsConcernes} évènement
          {participant.evenementsConcernes > 1 ? 's' : ''} · depuis le{' '}
          {formaterDateSeule(participant.premiereExpression)}
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
                {/* M11 — LA CONVERSION EST LE GESTE LE PLUS IRRÉVERSIBLE DE LA PHASE ET
                    N'AVAIT AUCUNE CONFIRMATION, alors que la suppression d'une participation
                    (`participants.tsx`) et l'annulation d'une demande
                    (`ligne-demande-personnelle.tsx`) en ont une, et que le classement — moins
                    définitif — porte au moins le mot « Définitif ». Le déclencheur
                    `participants_externes_liens_definitifs` refuse toute seconde écriture du
                    lien : rien, dans l'application ni même par écriture directe, ne défait une
                    conversion. La confirmation nomme LE CHEMIN CHOISI, parce que c'est là que
                    se joue l'erreur coûteuse — un chemin 2 crée une fiche ACTIVE, un chemin 3
                    rattache DÉFINITIVEMENT le séminaire à la fiche de quelqu'un d'autre. */}
                <button
                  type="submit"
                  disabled={conversionEnCours}
                  onClick={(evenement) => {
                    if (!window.confirm(messageConfirmationConversion(nomComplet, chemin))) {
                      evenement.preventDefault()
                    }
                  }}
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
                {/* I3 de la revue finale — PHRASE CORRIGÉE. Elle disait : « Il restera
                    convertible plus tard s'il reprend contact. » C'était vrai EN SQL et faux
                    À L'ÉCRAN : la passerelle laisse bien convertir un participant déjà classé
                    (D62), mais la conversion n'est offerte que depuis cette liste, dont la vue
                    exclut les classés (D74), et AUCUN écran du dépôt ne liste les classés. Le
                    texte avait importé dans le monde de l'utilisateur une promesse qui ne
                    valait que dans celui de la fonction. Il dit désormais ce que
                    l'application permet réellement — et le motif saisi ici est maintenant
                    affiché sur la fiche de chaque évènement où cette personne figure
                    (`participants.tsx`). */}
                <span id={idAideMotif} className="text-xs text-neutral-500">
                  Définitif : ce participant quitte cette liste et n&apos;y reviendra pas.
                  Le motif restera lisible sur la fiche des évènements auxquels il a
                  participé. Pour le suivre à nouveau, il faudra le ressaisir comme nouveau
                  participant.
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
