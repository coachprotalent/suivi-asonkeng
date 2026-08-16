'use client'

import { useActionState, useRef, useState } from 'react'
import { formaterDateSeule } from '@/lib/format/date'
import type { ATraiterLigne } from '@/lib/donnees/evenements-lots'
import type { MembreBref } from '@/lib/donnees/membres'
import { SelecteurMembre } from '@/app/membres/selecteur-membre'
import { Bouton, CLASSES_VARIANTE } from '@/composants/ui/bouton'
import { Champ } from '@/composants/ui/champ'
import { Dialogue } from '@/composants/ui/dialogue'
import { Formulaire } from '@/composants/ui/formulaire'
import { LigneListe } from '@/composants/ui/ligne-liste'
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

  const nomComplet = `${participant.prenom ?? ''} ${participant.nom}`.trim()

  /*
    ═══ D124 — voir le commentaire de tête de `antennes/bouton-bascule-antenne.tsx`, le
    gabarit des dix confirmations de famille A ═══

    `messageConfirmationConversion` est PURE : l'appeler ici, à chaque rendu, est gratuit.
    Le formulaire porte des champs `required` et trois chemins mutuellement exclusifs :
    `requestSubmit()` applique la validation de contrainte, donc un chemin incomplet est
    refusé par le navigateur exactement comme avant.

    `chemin` NE PEUT PAS changer entre l'ouverture du dialogue et sa confirmation : un
    `<dialog>` modal rend le reste du document INERTE, donc aucun des trois boutons radio
    n'est atteignable pendant que le dialogue est ouvert.

    Le bouton n'a pas de libellé d'attente aujourd'hui (« Convertir » ne bascule pas) : ne
    pas en inventer un (D117).
  */
  const messageConversion = messageConfirmationConversion(nomComplet, chemin)
  const [conversionConfirmationDemandee, setConversionConfirmationDemandee] = useState(false)
  const boutonConversion = useRef<HTMLButtonElement | null>(null)

  return (
    <LigneListe
      principal={nomComplet}
      meta={
        <>
          {/* M1 DE LA REVUE FINALE — `premiereExpression` était sélectionné, typé et mappé
              mais RENDU PAR AUCUN ÉCRAN, et le commentaire qui exclut `cree_le` de la lecture
              (« une colonne lue que personne ne rend est une colonne morte ») justifiait sa
              présence par un affichage qui n'existait pas. Il existe désormais — et c'est
              l'information que cette file de travail réclamait le plus : depuis QUAND cette
              personne attend. C'est aussi la clé de tri de la liste, ce qui rend l'ordre
              affiché lisible au lieu d'être subi. */}
          {participant.evenementsConcernes} évènement
          {participant.evenementsConcernes > 1 ? 's' : ''} · depuis le{' '}
          {formaterDateSeule(participant.premiereExpression)}
        </>
      }
      complement={
        <div className="flex flex-col gap-esp-2">
          <p className="text-petit text-encre-attenuee">
            {[participant.telephone, participant.email, participant.ville, participant.pays]
              .filter(Boolean)
              .join(' · ') || 'Aucune coordonnée renseignée.'}
          </p>

          {peutAgir ? (
            <>
              {/*
                ⚠️ LES `<details>` / `<summary>` RESTENT (D107). Ce n'est PAS un bouton : un
                dépliage natif, sans JavaScript, et le remplacer par un `Bouton` + état
                coûterait un composant et un axe de test. Le `<summary>` prend la classe de
                lien et `cible-tactile`.
              */}
              <details>
                <summary className={`${CLASSES_VARIANTE.lien} cursor-pointer`}>
                  Convertir en membre
                </summary>
                <div className="mt-esp-3">
                  <Formulaire
                    action={convertir}
                    erreur={etatConversion.erreur}
                    enCours={conversionEnCours}
                    actions={
                      <>
                        {/* M11 — LA CONVERSION EST LE GESTE LE PLUS IRRÉVERSIBLE DE LA PHASE
                            ET N'AVAIT AUCUNE CONFIRMATION, alors que la suppression d'une
                            participation (`participants.tsx`) et l'annulation d'une demande
                            (`ligne-demande-personnelle.tsx`) en ont une, et que le
                            classement — moins définitif — porte au moins le mot
                            « Définitif ». Le déclencheur
                            `participants_externes_liens_definitifs` refuse toute seconde
                            écriture du lien : rien, dans l'application ni même par écriture
                            directe, ne défait une conversion. La confirmation nomme LE
                            CHEMIN CHOISI, parce que c'est là que se joue l'erreur coûteuse —
                            un chemin 2 crée une fiche ACTIVE, un chemin 3 rattache
                            DÉFINITIVEMENT le séminaire à la fiche de quelqu'un d'autre. */}
                        <Bouton
                          ref={boutonConversion}
                          type="submit"
                          alignement="debut"
                          enCours={conversionEnCours}
                          onClick={(evenement) => {
                            evenement.preventDefault()
                            setConversionConfirmationDemandee(true)
                          }}
                        >
                          Convertir
                        </Bouton>

                        <Dialogue
                          ouvert={conversionConfirmationDemandee}
                          message={messageConversion}
                          surConfirmation={() => {
                            setConversionConfirmationDemandee(false)
                            boutonConversion.current?.form?.requestSubmit(boutonConversion.current)
                          }}
                          surAnnulation={() => setConversionConfirmationDemandee(false)}
                        />
                      </>
                    }
                  >
                    <input type="hidden" name="participantId" value={participant.participantExterneId} />
                    <input type="hidden" name="chemin" value={chemin} />

                    <fieldset className="flex flex-col gap-esp-2">
                      <legend className="libelle-champ text-petit text-encre">Façon de convertir</legend>
                      <label className="cible-tactile flex items-center gap-esp-2 text-petit text-encre">
                        <input
                          type="radio"
                          name="cheminAffiche"
                          checked={chemin === 'fiche_en_attente'}
                          onChange={() => setChemin('fiche_en_attente')}
                        />
                        Créer une fiche à valider (elle rejoint l&apos;écran des demandes)
                      </label>
                      <label className="cible-tactile flex items-center gap-esp-2 text-petit text-encre">
                        <input
                          type="radio"
                          name="cheminAffiche"
                          checked={chemin === 'fiche_active'}
                          onChange={() => setChemin('fiche_active')}
                        />
                        Créer une fiche active tout de suite
                      </label>
                      <label className="cible-tactile flex items-center gap-esp-2 text-petit text-encre">
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
                      // Le nom et le prénom sont préremplis depuis le participant externe,
                      // mais RESTENT MODIFIABLES : une saisie de séminaire est souvent
                      // partielle ou approximative, et la fiche membre, elle, est durable.
                      // CONTRÔLÉS (voir l'encadré ci-dessus) : une correction ne doit pas se
                      // perdre si le formulaire est refusé pour une autre raison.
                      <div className="flex flex-wrap gap-esp-3">
                        <Champ
                          label="Nom"
                          name="nom"
                          required
                          value={nom}
                          onChange={(evenement) => setNom(evenement.target.value)}
                          largeur="flexible"
                        />
                        <Champ
                          label="Prénom"
                          name="prenom"
                          required
                          value={prenom}
                          onChange={(evenement) => setPrenom(evenement.target.value)}
                          largeur="flexible"
                        />
                      </div>
                    ) : null}

                    {chemin === 'fiche_active' ? (
                      <>
                        {/* D67 — ce chemin pose un faiseur de disciple, et c'est lui que le
                            verrou consultatif « arbre » de la passerelle protège. Sans
                            faiseur, la fiche naîtrait ACTIVE et DÉTACHÉE de l'arbre, sans le
                            moindre signal : `champManquantConversion` le refuse côté
                            serveur.
                            ⚠️ LE RAIL DE FILIATION — l'un des CINQ sites légitimes
                            (globals.css, D106) : ce sélecteur choisit un VRAI faiseur de
                            disciple pour la fiche qui va naître. Le sélecteur « Dirigeant »
                            juste en dessous n'en porte PAS — il ne propose qu'une correction
                            facultative d'un calcul, pas la relation elle-même. */}
                        <div className="rail-filiation">
                          <SelecteurMembre
                            nom="faiseurId"
                            label="Faiseur de disciple"
                            aide="Cherche parmi les membres actifs. Obligatoire pour une fiche active."
                            valeur={faiseur}
                            surChoix={setFaiseur}
                            exclureId={null}
                          />
                        </div>
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
                      // D68 — le sélecteur ne propose QUE des membres actifs, ET la
                      // passerelle refuse une fiche non active (marqueur
                      // membre_cible_non_actif). Double dispositif : un onglet resté ouvert
                      // reposterait sinon un identifiant devenu invalide entre-temps.
                      //
                      // ⚠️ PAS DE RAIL ICI : rattacher un séminaire à une fiche existante
                      // n'est pas un lien de discipulat (piège n°6).
                      <SelecteurMembre
                        nom="membreCibleId"
                        label="Fiche membre existante"
                        aide="Cherche parmi les membres actifs. Le séminaire sera rattaché à cette fiche."
                        valeur={cible}
                        surChoix={setCible}
                        exclureId={null}
                      />
                    ) : null}
                  </Formulaire>
                </div>
              </details>

              <details>
                <summary className={`${CLASSES_VARIANTE.lien} cursor-pointer`}>
                  Classer sans suite
                </summary>
                <div className="mt-esp-3">
                  <Formulaire
                    action={classer}
                    erreur={etatClassement.erreur}
                    enCours={classementEnCours}
                    actions={
                      <Bouton type="submit" variante="secondaire" alignement="debut" enCours={classementEnCours}>
                        Classer sans suite
                      </Bouton>
                    }
                  >
                    <input type="hidden" name="participantId" value={participant.participantExterneId} />
                    <Champ
                      label="Motif"
                      name="motif"
                      required
                      value={motif}
                      onChange={(evenement) => setMotif(evenement.target.value)}
                      /* I3 de la revue finale — PHRASE CORRIGÉE. Elle disait : « Il restera
                         convertible plus tard s'il reprend contact. » C'était vrai EN SQL et
                         faux À L'ÉCRAN : la passerelle laisse bien convertir un participant
                         déjà classé (D62), mais la conversion n'est offerte que depuis cette
                         liste, dont la vue exclut les classés (D74), et AUCUN écran du dépôt
                         ne liste les classés. Le texte avait importé dans le monde de
                         l'utilisateur une promesse qui ne valait que dans celui de la
                         fonction. Il dit désormais ce que l'application permet réellement —
                         et le motif saisi ici est maintenant affiché sur la fiche de chaque
                         évènement où cette personne figure (`participants.tsx`). */
                      aide="Définitif : ce participant quitte cette liste et n'y reviendra pas. Le motif restera lisible sur la fiche des évènements auxquels il a participé. Pour le suivre à nouveau, il faudra le ressaisir comme nouveau participant."
                    />
                  </Formulaire>
                </div>
              </details>
            </>
          ) : (
            <p className="text-petit text-encre-attenuee">
              La conversion et le classement sont réservés aux administrateurs.
            </p>
          )}
        </div>
      }
    />
  )
}
