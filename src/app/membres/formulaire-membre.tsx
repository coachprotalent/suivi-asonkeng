'use client'

import { useActionState, useState, type ReactNode } from 'react'
import { Bouton } from '@/composants/ui/bouton'
import { Champ } from '@/composants/ui/champ'
import { Formulaire } from '@/composants/ui/formulaire'
import { Selecteur } from '@/composants/ui/selecteur'
import type { Antenne } from '@/lib/donnees/antennes'
import type { MembreBref, MembreDetail } from '@/lib/donnees/membres'
import type { EtatFormulaireMembre } from './actions'
import { SelecteurMembre } from './selecteur-membre'

const etatInitial: EtatFormulaireMembre = { erreur: null }

type Props = {
  action: (etat: EtatFormulaireMembre, donnees: FormData) => Promise<EtatFormulaireMembre>
  antennes: Antenne[]
  membre?: MembreDetail
  /**
   * Contact ACTUEL, DÉJÀ RÉSOLU par la page appelante (phase 7, D130).
   *
   * Une prop et non une lecture : ce composant est un composant client, il ne peut rien
   * lire en base. `membre.contactId` ne porte qu'un identifiant ; le `SelecteurMembre` a
   * besoin du nom pour l'afficher. Absent à la création, comme pour un membre sans contact.
   */
  contactInitial?: MembreBref | null
  libelleBouton: string
  /**
   * Bloc d'enrichissement rendu DANS le même `<form>`, juste avant la zone d'erreur.
   *
   * Une prop plutôt qu'une variante interne : l'enrichissement ne remonte PAS dans
   * `/membres/[id]/modifier` (D89). Porter les statuts dans l'écran de modification
   * exigerait d'y exprimer le RETRAIT, que la création n'a jamais à connaître ; et y
   * porter l'arbre mélangerait deux gardes différents sur un même écran —
   * `exigerAutoriteSur` pour les statuts, `exigerAdministrateur` pour l'arbre.
   */
  children?: ReactNode
}

export function FormulaireMembre({
  action,
  antennes,
  membre,
  contactInitial,
  libelleBouton,
  children,
}: Props) {
  const [etat, envoyer, enCours] = useActionState(action, etatInitial)

  /*
    ═══ TOUS LES CHAMPS SONT CONTRÔLÉS (D85). AUCUN `defaultValue` ICI. ═══

    React réinitialise les champs NON CONTRÔLÉS d'un `<form action>` à TOUTE complétion de
    l'action, Y COMPRIS sur un refus RETOURNÉ. L'utilisateur lisait alors son message
    d'erreur au-dessus d'un formulaire VIDE, et devait tout retaper — neuf champs ici,
    plus les enrichissements de la phase 5. C'est la BONNE PRATIQUE du projet qui
    déclenchait le piège : une action qui RETOURNE son refus passe par le chemin
    « complétion normale », donc par la remise à zéro ; une action qui LÈVE ne vide rien,
    mais perd son message en build de production.

    Un état par champ, et non un objet unique : c'est la forme employée par les cinq
    formulaires corrigés en phase 4, et elle évite qu'une frappe recrée l'objet entier.

    ═══ CORRECTIF DÉCOUVERT EN ÉCRIVANT LA PREUVE DE LA TASK 8 ═══ Être « contrôlé »
    (`value` + `onChange`) protège un `<input>` ou un `<textarea>` de cette remise à
    zéro, mais PAS un `<select>` : la remise à zéro automatique que React déclenche après
    TOUTE complétion d'action passe par un VRAI événement DOM `reset` sur le `<form>`, que
    le navigateur applique nativement à ses éléments AVANT que React ne resynchronise
    l'option sélectionnée — et cette resynchronisation ne s'est pas produite ici, mesuré
    empiriquement (build de développement ET de production) : les deux `<select>` de ce
    formulaire (« Antenne », « Situation ») repartaient à vide sur un refus, alors que les
    champs texte survivaient. `onReset={(e) => e.preventDefault()}` — porté désormais par
    `Formulaire` (D112), inconditionnellement — empêche le navigateur d'exécuter sa remise
    à zéro native : sans danger ici puisque AUCUN champ de ce formulaire n'est non
    contrôlé — il n'y a donc rien que cette remise à zéro devait légitimement effacer.
  */
  const [prenom, setPrenom] = useState(membre?.prenom ?? '')
  const [nom, setNom] = useState(membre?.nom ?? '')
  const [telephone, setTelephone] = useState(membre?.telephone ?? '')
  const [emailContact, setEmailContact] = useState(membre?.emailContact ?? '')
  const [ville, setVille] = useState(membre?.ville ?? '')
  const [pays, setPays] = useState(membre?.pays ?? '')
  const [antenneId, setAntenneId] = useState(membre?.antenneId ?? '')
  const [situation, setSituation] = useState<string>(membre?.situation ?? '')
  const [domaineEtude, setDomaineEtude] = useState(membre?.domaineEtude ?? '')
  const [reportInitialAel, setReportInitialAel] = useState(
    String(membre?.reportInitialAel ?? 0),
  )
  // Contrôlé comme tout le reste (D85) : `SelecteurMembre` rend un `<input type="hidden">`
  // dont la valeur vient de cet état, jamais du DOM. La saisie survit donc à un refus
  // RETOURNÉ par l'action — un contact choisi puis perdu au premier message d'erreur
  // obligerait à rechercher la personne une seconde fois.
  const [contact, setContact] = useState<MembreBref | null>(contactInitial ?? null)

  // L'antenne actuelle du membre doit figurer dans la liste même si elle a été désactivée
  // depuis. Sans cela, sa valeur n'existerait pas parmi les options : le navigateur
  // retomberait sur « Non rattaché » et le simple fait d'enregistrer une autre
  // modification détacherait le membre de son antenne, sans que personne ne l'ait demandé
  // ni vu.
  const optionsAntennes: Array<{ id: string; nom: string; inactive: boolean }> = [
    ...antennes.map((a) => ({ id: a.id, nom: a.nom, inactive: false })),
  ]
  if (membre?.antenneId && !antennes.some((a) => a.id === membre.antenneId)) {
    optionsAntennes.push({
      id: membre.antenneId,
      nom: membre.antenneNom ?? 'Antenne inconnue',
      inactive: true,
    })
  }

  return (
    /*
      LE BOUTON PASSE PAR LA FENTE `actions`, ET CE N'EST PAS COSMÉTIQUE. Tant qu'il vivait
      dans `children`, `Formulaire` rendait le bandeau de refus APRÈS lui : le message
      s'affichait SOUS le bouton d'envoi, à rebours des 46 bandeaux du dépôt. La fente rend
      l'ordre — champs, refus, geste — impossible à casser depuis ici.
    */
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
          {libelleBouton}
        </Bouton>
      }
    >
      {membre ? <input type="hidden" name="id" value={membre.id} /> : null}

      <div className="grid gap-esp-4 md:grid-cols-2">
        <Champ
          label="Prénom (obligatoire)"
          name="prenom"
          value={prenom}
          onChange={(evenement) => setPrenom(evenement.target.value)}
          required
        />
        <Champ
          label="Nom (obligatoire)"
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
          label="Antenne"
          name="antenneId"
          value={antenneId}
          onChange={(evenement) => setAntenneId(evenement.target.value)}
          options={[
            { valeur: '', libelle: 'Non rattaché' },
            ...optionsAntennes.map((antenne) => ({
              valeur: antenne.id,
              libelle: `${antenne.nom}${antenne.inactive ? ' (désactivée)' : ''}`,
            })),
          ]}
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
          Le champ n'existe que pour un étudiant, au lieu d'être saisissable puis effacé en
          silence à l'enregistrement. Empêcher vaut mieux qu'avertir : un texte d'aide sous
          un champ ne se lit pas au moment où l'on bascule la situation, et la saisie
          disparaîtrait sans que personne ne le voie.

          La VALEUR, elle, survit au démontage du champ : elle vit dans `domaineEtude`, à
          côté et non dedans. Repasser « Travailleur » puis « Étudiant » retrouve donc la
          saisie. Ce que la fiche ENREGISTRE reste décidé par `normaliserFicheMembre`, qui
          met `domaine_etude` à `null` hors situation étudiante.
        */}
        {situation === 'etudiant' ? (
          <Champ
            label="Domaine d'étude"
            name="domaineEtude"
            value={domaineEtude}
            onChange={(evenement) => setDomaineEtude(evenement.target.value)}
          />
        ) : null}
        <Champ
          label="AEL déjà suivis"
          name="reportInitialAel"
          type="number"
          min={0}
          step={1}
          value={reportInitialAel}
          onChange={(evenement) => setReportInitialAel(evenement.target.value)}
          aide="Avant la mise en service de l'application."
        />
      </div>

      {/*
        ═══ LE CONTACT (phase 7, D130) ═══

        HORS DE LA GRILLE À DEUX COLONNES, et ce n'est pas un choix esthétique :
        `SelecteurMembre` est un COMPOSITE — libellé, membre retenu avec son bouton
        « Détacher », champ de recherche, aide, puis liste de résultats — qui ne tient pas
        dans une demi-colonne sur mobile.

        ⚠️ IL EST DANS CE FORMULAIRE, ET PAS DANS `BlocEnrichissement` (D130). Ce bloc-là
        porte « Place dans l'arbre » : le faiseur de disciple et le dirigeant, écrits par
        `public.definir_arbre` et son verrou anti-cycle. Le contact est une COLONNE DE LA
        FICHE, écrite par le même `update` que le téléphone. L'y ranger le ferait passer
        pour une relation d'arbre, et — conséquence pratique — le priverait de l'écran de
        MODIFICATION, où `BlocEnrichissement` ne remonte pas (D89).

        `exclureId` : à la création il n'existe aucun identifiant à exclure ; en
        modification, `membres_pas_son_propre_contact` refuserait de toute façon. Cette
        exclusion sert le CONFORT, pas la sûreté — même mise en garde que sur
        `rechercherMembres`.
      */}
      <SelecteurMembre
        nom="contactId"
        label="Contact"
        aide="Facultatif. Une personne en bonne relation avec ce membre. N'accorde aucun droit sur sa fiche."
        valeur={contact}
        surChoix={setContact}
        exclureId={membre?.id ?? null}
      />

      {children}
    </Formulaire>
  )
}
