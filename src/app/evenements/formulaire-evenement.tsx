'use client'

import { useActionState, useState } from 'react'
import { Bouton } from '@/composants/ui/bouton'
import { Champ } from '@/composants/ui/champ'
import { Formulaire } from '@/composants/ui/formulaire'
import { Selecteur } from '@/composants/ui/selecteur'
import { ZoneTexte } from '@/composants/ui/zone-texte'
import type { TypeEvenement } from '@/lib/donnees/evenements'
import type { EtatEvenement } from './actions'

export type ValeursEvenement = {
  titre: string
  typeId: string
  dateDebut: string
  dateFin: string
  heureDebut: string
  lieu: string
  description: string
}

const VALEURS_VIDES: ValeursEvenement = {
  titre: '',
  typeId: '',
  dateDebut: '',
  dateFin: '',
  heureDebut: '',
  lieu: '',
  description: '',
}

type Props = {
  action: (etat: EtatEvenement, donnees: FormData) => Promise<EtatEvenement>
  types: TypeEvenement[]
  libelleBouton: string
  valeurs?: ValeursEvenement
  /** Champs cachés supplémentaires — l'identifiant de l'évènement, pour l'édition. */
  champsCaches?: Record<string, string>
  /**
   * Type COURANT de l'évènement édité, même s'il est désactivé. `types` ne contient que
   * les types ACTIFS (un type désactivé disparaît des NOUVELLES attributions, spec §7) :
   * sans cette option, éditer un évènement dont le type a été désactivé depuis
   * BASCULERAIT SILENCIEUSEMENT son type vers le premier de la liste au premier
   * enregistrement.
   */
  typeCourant?: { id: string; libelle: string } | null
}

const etatInitial: EtatEvenement = { erreur: null }

export function FormulaireEvenement({
  action,
  types,
  libelleBouton,
  valeurs = VALEURS_VIDES,
  champsCaches,
  typeCourant,
}: Props) {
  const [etat, envoyer, enCours] = useActionState(action, etatInitial)

  // CHAMPS CONTRÔLÉS, et c'est essentiel — pas un simple choix de style. React
  // réinitialise les champs NON contrôlés d'un `<form action={...}>` dès que l'action se
  // termine SANS LEVER, y compris quand elle RETOURNE un refus métier (`{ erreur: "..." }`
  // n'est pas une exception pour React). Défaut trouvé et verrouillé par preuve Playwright
  // à la Task 16 (src/app/evenements/types/formulaire-type.tsx) : avec `defaultValue`
  // (le code initialement prévu ici aussi), une date de fin antérieure à la date de début
  // affichait bien `MESSAGE_PERIODE_INCOHERENTE`, mais EFFAÇAIT le titre, le type, les
  // dates, le lieu et la description déjà saisis — contredisant directement l'étape 6,
  // point 4 du brief de cette tâche (« la saisie est conservée »). Aucun effet de
  // remise à zéro au succès n'est nécessaire ici, à la différence de
  // `FormulaireType` : la création REDIRIGE (le composant se démonte), et l'édition
  // reste volontairement sur les valeurs qui viennent d'être enregistrées.
  //
  // ═══ `onReset` — PORTÉ PAR `Formulaire` DEPUIS LA TASK 17, PAS RETIRÉ (D112) ═══ Être
  // « contrôlé » (`value` + `onChange`) protège un `<input>` ou un `<textarea>` de la
  // remise à zéro décrite ci-dessus, mais PAS un `<select>` : elle passe par un vrai
  // événement DOM `reset` sur le `<form>`, que le navigateur applique nativement à ses
  // éléments AVANT que React ne resynchronise l'option sélectionnée. Le `<select
  // name="typeId">` (devenu `Selecteur` ci-dessous) repartait donc à vide sur un refus
  // retourné, alors que les champs texte survivaient — même défaut, même remède que
  // `membres/formulaire-membre.tsx` et `inscription/formulaire-inscription.tsx` (phase
  // 5) : `onReset={(e) => e.preventDefault()}`, posé INCONDITIONNELLEMENT par
  // `Formulaire`, empêche le navigateur d'exécuter sa remise à zéro native.
  const [valeursCourantes, setValeursCourantes] = useState<ValeursEvenement>(valeurs)

  function definir<C extends keyof ValeursEvenement>(champ: C, valeur: string) {
    setValeursCourantes((precedent) => ({ ...precedent, [champ]: valeur }))
  }

  const typeDejaListe = typeCourant ? types.some((t) => t.id === typeCourant.id) : true
  const optionsType = typeDejaListe || !typeCourant ? types : [...types, { ...typeCourant, actif: false, ordre: 0 }]

  return (
    <Formulaire
      action={envoyer}
      erreur={etat.erreur}
      enCours={enCours}
      actions={
        <Bouton type="submit" alignement="debut" enCours={enCours}>
          {libelleBouton}
        </Bouton>
      }
    >
      {Object.entries(champsCaches ?? {}).map(([nom, valeur]) => (
        <input key={nom} type="hidden" name={nom} value={valeur} />
      ))}

      <Champ
        label="Titre"
        name="titre"
        required
        value={valeursCourantes.titre}
        onChange={(evenement) => definir('titre', evenement.target.value)}
      />

      <Selecteur
        label="Type"
        name="typeId"
        required
        value={valeursCourantes.typeId}
        onChange={(evenement) => definir('typeId', evenement.target.value)}
        optionVide={{ libelle: 'Choisir…', desactivee: true }}
        options={optionsType.map((type) => ({
          valeur: type.id,
          libelle: `${type.libelle}${type.actif ? '' : ' (désactivé)'}`,
        }))}
      />

      <div className="flex flex-wrap gap-esp-4">
        <Champ
          label="Date de début"
          name="dateDebut"
          type="date"
          required
          value={valeursCourantes.dateDebut}
          onChange={(evenement) => definir('dateDebut', evenement.target.value)}
        />
        <Champ
          label="Date de fin"
          name="dateFin"
          type="date"
          value={valeursCourantes.dateFin}
          onChange={(evenement) => definir('dateFin', evenement.target.value)}
        />
        <Champ
          label="Heure de début"
          name="heureDebut"
          type="time"
          value={valeursCourantes.heureDebut}
          onChange={(evenement) => definir('heureDebut', evenement.target.value)}
        />
      </div>

      <Champ
        label="Lieu"
        name="lieu"
        value={valeursCourantes.lieu}
        onChange={(evenement) => definir('lieu', evenement.target.value)}
      />

      {/*
        Champ AVEC aide : `htmlFor` explicite, aide SORTIE du label et rattachée par
        `aria-describedby`. Une aide laissée dans le <label> serait concaténée au nom
        accessible du champ.
      */}
      <ZoneTexte
        label="Description"
        name="description"
        rows={3}
        value={valeursCourantes.description}
        onChange={(evenement) => definir('description', evenement.target.value)}
        aide="Visible de tous les comptes actifs."
      />
    </Formulaire>
  )
}
