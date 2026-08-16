'use client'

import { useActionState, useState } from 'react'
import { LONGUEUR_MDP_MINIMALE } from '@/app/changer-mot-de-passe/constantes'
import { Bouton } from '@/composants/ui/bouton'
import { Champ } from '@/composants/ui/champ'
import { Formulaire } from '@/composants/ui/formulaire'
import { Selecteur } from '@/composants/ui/selecteur'
import type { Antenne } from '@/lib/donnees/antennes'
import { sInscrire, type EtatInscription } from './actions'

const etatInitial: EtatInscription = { erreur: null }

/**
 * `useActionState` et NON un `<form action={...}>` nu : une action liée directement à
 * `action` ne peut rien dire à l'utilisateur — `src/app/error.tsx` affiche un texte
 * statique et ne lit jamais `error.message`. Un message d'erreur renvoyé autrement
 * n'atteindrait jamais l'écran.
 *
 * ═══ TOUS LES CHAMPS SONT CONTRÔLÉS, ET C'EST LE CŒUR DE CE FICHIER. ═══
 *
 * React réinitialise les champs NON CONTRÔLÉS d'un `<form action>` à TOUTE complétion de
 * l'action, Y COMPRIS sur un refus RETOURNÉ. Ce composant était le PIRE CAS DU DÉPÔT :
 * huit champs libres, sur le SEUL écran public de l'application, EN PRODUCTION, et sans
 * aucun rattrapage possible. Une personne saisissait son identité, son contact et son
 * antenne, se trompait de code d'inscription, et perdait les huit champs — sans pouvoir
 * comprendre son erreur, le §7 imposant ici un message indifférencié (D30) qui ne révèle
 * jamais qu'un code existe.
 *
 * NE JAMAIS REVENIR À `defaultValue` NI À UN CHAMP SANS `value` ICI. Le message d'erreur
 * de cet écran ne peut pas expliquer ; la saisie conservée est donc la SEULE chose qui
 * reste à l'utilisateur pour réessayer. `Champ` et `Selecteur` rendent désormais ce cas
 * inexprimable (D111).
 *
 * LE MOT DE PASSE EST CONTRÔLÉ COMME LES AUTRES, et ce n'est pas une imprudence : sa
 * valeur vit dans l'état React du navigateur, exactement là où le DOM la gardait déjà.
 * Rien de nouveau n'est exposé — ni journalisé, ni envoyé ailleurs qu'à l'action. Le
 * perdre à chaque refus obligeait au contraire à le retaper, ce qui pousse aux mots de
 * passe courts.
 *
 * ═══ `onReset` ET LE FOCUS AU REFUS MIGRENT DANS `Formulaire`, ILS NE DISPARAISSENT PAS
 * ═══ Un `<select>` contrôlé (`value` + `onChange`) n'est PAS protégé de la remise à zéro
 * automatique que React déclenche après toute complétion d'action, contrairement à un
 * `<input>` ou un `<textarea>` : le navigateur applique nativement un vrai événement DOM
 * `reset` sur le `<form>`, et React ne resynchronise pas systématiquement l'option
 * sélectionnée après coup — mesuré empiriquement (développement ET production) sur le
 * `<select>` « Antenne » de cet écran, qui repartait vide sur un refus alors que les sept
 * autres champs survivaient. `Formulaire` pose désormais `onReset={(e) =>
 * e.preventDefault()}` INCONDITIONNELLEMENT (D112), sans que ce fichier ait plus à y
 * penser. Ce composant était l'un des DEUX SEULS du dépôt à porter le focus sur son refus
 * (D113) : `Formulaire`/`Refus` reprennent cette mécanique telle quelle.
 */
export function FormulaireInscription({ antennes }: { antennes: Antenne[] }) {
  const [etat, envoyer, enCours] = useActionState(sInscrire, etatInitial)

  const [code, setCode] = useState('')
  const [identifiant, setIdentifiant] = useState('')
  const [motDePasse, setMotDePasse] = useState('')
  const [prenom, setPrenom] = useState('')
  const [nom, setNom] = useState('')
  const [telephone, setTelephone] = useState('')
  const [ville, setVille] = useState('')
  const [antenneId, setAntenneId] = useState('')

  return (
    <Formulaire
      action={envoyer}
      erreur={etat.erreur}
      enCours={enCours}
      actions={
        <Bouton type="submit" alignement="debut" enCours={enCours} libelleAttente="Inscription…">
          S&apos;inscrire
        </Bouton>
      }
    >
      <Champ
        label="Code d'inscription"
        name="code"
        value={code}
        onChange={(evenement) => setCode(evenement.target.value)}
        required
        autoCapitalize="none"
        spellCheck={false}
        aide="Fourni par un administrateur de l'équipe."
      />

      <Champ
        label="Identifiant choisi"
        name="identifiant"
        value={identifiant}
        onChange={(evenement) => setIdentifiant(evenement.target.value)}
        required
        autoCapitalize="none"
        spellCheck={false}
        aide="3 à 32 caractères : lettres, chiffres, points ou tirets, commençant par une lettre."
      />

      <Champ
        label="Mot de passe choisi"
        name="motDePasse"
        type="password"
        value={motDePasse}
        onChange={(evenement) => setMotDePasse(evenement.target.value)}
        required
        // Interpolée, jamais écrite en dur : la page sœur `/changer-mot-de-passe` fait
        // de même, et une valeur recopiée à la main deviendrait un mensonge le jour où
        // la constante change.
        minLength={LONGUEUR_MDP_MINIMALE}
        autoComplete="new-password"
        aide={`Au moins ${LONGUEUR_MDP_MINIMALE} caractères.`}
      />

      <div className="grid gap-esp-4 md:grid-cols-2">
        <Champ
          label="Prénom"
          name="prenom"
          value={prenom}
          onChange={(evenement) => setPrenom(evenement.target.value)}
          required
        />
        <Champ
          label="Nom"
          name="nom"
          value={nom}
          onChange={(evenement) => setNom(evenement.target.value)}
          required
        />
        <Champ
          label="Téléphone"
          name="telephone"
          type="tel"
          value={telephone}
          onChange={(evenement) => setTelephone(evenement.target.value)}
        />
        <Champ
          label="Ville"
          name="ville"
          value={ville}
          onChange={(evenement) => setVille(evenement.target.value)}
        />
        <div className="md:col-span-2">
          <Selecteur
            label="Antenne"
            name="antenneId"
            value={antenneId}
            onChange={(evenement) => setAntenneId(evenement.target.value)}
            // « Non rattaché » est un CHOIX légitime, pas une invite : il passe par
            // `options`, pas par `optionVide`, qui est réservée à une option désactivée
            // (voir le commentaire de tête de `selecteur.tsx`).
            options={[
              { valeur: '', libelle: 'Non rattaché' },
              ...antennes.map((antenne) => ({ valeur: antenne.id, libelle: antenne.nom })),
            ]}
          />
        </div>
      </div>

      {/*
        D30 : ce formulaire est le SEUL et reste identique quel que soit le code saisi.
        Les champs prénom/nom/téléphone/ville/antenne sont TOUJOURS affichés, même s'ils
        seront ignorés en mode nominatif (design 2b §7.1) — les masquer selon une
        supposition sur le mode reviendrait à recréer un oracle par la forme de la page,
        exactement ce que D30 interdit.
      */}
    </Formulaire>
  )
}
