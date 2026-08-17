'use client'

import { useActionState, useState } from 'react'
import { Bouton } from '@/composants/ui/bouton'
import { Champ } from '@/composants/ui/champ'
import { Formulaire } from '@/composants/ui/formulaire'
import { Selecteur } from '@/composants/ui/selecteur'
import type { MembreDetail } from '@/lib/donnees/membres'
import { modifierMonProfil, type EtatProfil } from './actions'

const etatInitial: EtatProfil = { erreur: null }

/*
  ═══ TOUS LES CHAMPS SONT CONTRÔLÉS (D85). AUCUN `defaultValue`. ═══
  React réinitialise les champs NON CONTRÔLÉS d'un `<form action>` à toute complétion de
  l'action, Y COMPRIS sur un refus RETOURNÉ : l'utilisateur lirait son message d'erreur
  au-dessus d'un formulaire vidé. `Formulaire` porte un `onReset` préventif (D112), qui ne
  protège que parce qu'aucun champ d'ici n'est non contrôlé — le `<select>` « Situation »
  en particulier, que la remise à zéro native du navigateur atteint là où les champs texte
  survivent.

  ═══ CE FORMULAIRE NE PORTE AUCUN IDENTIFIANT DE CIBLE ═══
  Pas de `<input type="hidden" name="profilId">`, pas de `membreId`. L'action lit la cible
  dans la SESSION (D137). En ajouter un ici ne servirait à rien — l'action ne le lirait
  pas — mais laisserait croire au prochain lecteur que la cible est négociable depuis le
  client, et c'est précisément l'idée qu'il ne faut pas semer.

  ═══ SIX CHAMPS, ET SIX SEULEMENT (D138) ═══
  Nom, prénom, antenne, faiseur de disciple, dirigeant, contact, statuts et état ne sont pas
  « masqués » ici : ils ne sont écrits par AUCUNE voie non administrateur. Les ajouter à ce
  formulaire ne suffirait d'ailleurs pas à les écrire — ni la couche domaine ni la signature
  de la passerelle ne les accepteraient.
*/
export function FormulaireCoordonnees({ membre }: { membre: MembreDetail }) {
  const [etat, envoyer, enCours] = useActionState(modifierMonProfil, etatInitial)

  const [telephone, setTelephone] = useState(membre.telephone ?? '')
  const [emailContact, setEmailContact] = useState(membre.emailContact ?? '')
  const [ville, setVille] = useState(membre.ville ?? '')
  const [pays, setPays] = useState(membre.pays ?? '')
  const [situation, setSituation] = useState<string>(membre.situation ?? '')
  const [domaineEtude, setDomaineEtude] = useState(membre.domaineEtude ?? '')

  return (
    <Formulaire
      action={envoyer}
      erreur={etat.erreur}
      enCours={enCours}
      actions={
        <Bouton
          type="submit"
          variante="principal"
          alignement="debut"
          enCours={enCours}
          libelleAttente="Enregistrement…"
        >
          Enregistrer mes coordonnées
        </Bouton>
      }
    >
      <div className="grid gap-esp-4 md:grid-cols-2">
        <Champ
          label="Téléphone"
          name="telephone"
          type="tel"
          value={telephone}
          onChange={(evenement) => setTelephone(evenement.target.value)}
        />
        <Champ
          label="Adresse de contact"
          name="emailContact"
          type="email"
          value={emailContact}
          onChange={(evenement) => setEmailContact(evenement.target.value)}
        />
        <Champ
          label="Ville"
          name="ville"
          value={ville}
          onChange={(evenement) => setVille(evenement.target.value)}
        />
        <Champ
          label="Pays"
          name="pays"
          value={pays}
          onChange={(evenement) => setPays(evenement.target.value)}
        />
        <Selecteur
          label="Situation"
          name="situation"
          value={situation}
          onChange={(evenement) => setSituation(evenement.target.value)}
          options={[
            { valeur: '', libelle: 'Non renseignée' },
            { valeur: 'etudiant', libelle: 'Étudiant' },
            { valeur: 'travailleur', libelle: 'Travailleur' },
            { valeur: 'autre', libelle: 'Autre' },
          ]}
        />
        {/*
          Le champ n'existe que pour un étudiant, plutôt que d'être saisissable puis effacé
          en silence à l'enregistrement — même règle et même raison que sur le formulaire de
          fiche : empêcher vaut mieux qu'avertir.

          La VALEUR survit au démontage du champ : elle vit dans `domaineEtude`, à côté et
          non dedans. Repasser « Travailleur » puis « Étudiant » retrouve donc la saisie.
          Ce que la base ENREGISTRE reste décidé par `normaliserCoordonnees` ET par le `case`
          de la passerelle, qui ne s'appuie pas sur lui.
        */}
        {situation === 'etudiant' ? (
          <Champ
            label="Domaine d'étude"
            name="domaineEtude"
            value={domaineEtude}
            onChange={(evenement) => setDomaineEtude(evenement.target.value)}
          />
        ) : null}
      </div>
    </Formulaire>
  )
}
