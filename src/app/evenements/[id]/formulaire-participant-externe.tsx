'use client'

import { useActionState, useEffect, useId, useRef, useState } from 'react'
import { Bouton } from '@/composants/ui/bouton'
import { Champ } from '@/composants/ui/champ'
import { Formulaire } from '@/composants/ui/formulaire'
import { ChampsDesirs, DESIRS_VIDES, type ValeursDesirs } from './champs-desirs'
import { ajouterParticipantExterne, type EtatParticipation } from './participants-actions'

const etatInitial: EtatParticipation = { erreur: null }

type ValeursExterne = {
  nom: string
  prenom: string
  telephone: string
  email: string
  ville: string
  pays: string
}

const VALEURS_VIDES: ValeursExterne = {
  nom: '',
  prenom: '',
  telephone: '',
  email: '',
  ville: '',
  pays: '',
}

/**
 * Création d'un participant externe À LA VOLÉE (D76). Décalque `champ-intervenant.tsx`
 * (phase 3) dans son intention — « choisir une fiche OU saisir quelqu'un qui n'en a pas » —
 * sans en reprendre la contrainte d'exclusivité : ici les deux gestes vivent dans DEUX
 * formulaires distincts, donc aucune exclusivité côté client n'est nécessaire. C'est la
 * contrainte `participations_une_seule_reference` (D59) qui la garantit en base, et elle
 * n'est jamais atteignable depuis cet écran.
 */
export function FormulaireParticipantExterne({ evenementId }: { evenementId: string }) {
  const [etat, envoyer, enCours] = useActionState(ajouterParticipantExterne, etatInitial)
  const prefixe = useId()

  // CHAMPS CONTRÔLÉS — voir l'encadré de `champs-desirs.tsx`. Un nom, un téléphone ou une
  // note déjà saisis ne doivent pas disparaître parce qu'un AUTRE champ (ou une panne
  // technique passagère) a fait échouer la soumission.
  const [valeurs, setValeurs] = useState<ValeursExterne>(VALEURS_VIDES)
  const [desirs, setDesirs] = useState<ValeursDesirs>(DESIRS_VIDES)

  function definir<C extends keyof ValeursExterne>(champ: C, valeur: string) {
    setValeurs((precedent) => ({ ...precedent, [champ]: valeur }))
  }

  // Vidé au SUCCÈS d'une VRAIE soumission, jamais au montage — même garde que
  // `formulaire-type.tsx` : tester seulement `etat.erreur === null` serait aussi vrai pour
  // `etatInitial`, et déclencherait l'effet dès le montage.
  const enCoursPrecedent = useRef(enCours)
  useEffect(() => {
    if (enCoursPrecedent.current && !enCours && etat.erreur === null) {
      setValeurs(VALEURS_VIDES)
      setDesirs(DESIRS_VIDES)
    }
    enCoursPrecedent.current = enCours
  }, [enCours, etat])

  return (
    <Formulaire
      action={envoyer}
      erreur={etat.erreur}
      enCours={enCours}
      actions={
        <Bouton type="submit" alignement="debut" enCours={enCours}>
          Ajouter ce participant externe
        </Bouton>
      }
    >
      <input type="hidden" name="evenementId" value={evenementId} />

      <div className="flex flex-wrap gap-esp-3">
        <Champ
          label="Nom"
          name="nom"
          required
          value={valeurs.nom}
          onChange={(evenement) => definir('nom', evenement.target.value)}
          largeur="flexible"
        />
        <Champ
          label="Prénom"
          name="prenom"
          value={valeurs.prenom}
          onChange={(evenement) => definir('prenom', evenement.target.value)}
          largeur="flexible"
        />
      </div>

      <div className="flex flex-wrap gap-esp-3">
        <Champ
          label="Téléphone"
          name="telephone"
          value={valeurs.telephone}
          onChange={(evenement) => definir('telephone', evenement.target.value)}
          largeur="flexible"
        />
        <Champ
          label="Courriel"
          name="email"
          type="email"
          value={valeurs.email}
          onChange={(evenement) => definir('email', evenement.target.value)}
          largeur="flexible"
        />
      </div>

      <div className="flex flex-wrap gap-esp-3">
        <Champ
          label="Ville"
          name="ville"
          value={valeurs.ville}
          onChange={(evenement) => definir('ville', evenement.target.value)}
          largeur="flexible"
        />
        <Champ
          label="Pays"
          name="pays"
          value={valeurs.pays}
          onChange={(evenement) => definir('pays', evenement.target.value)}
          largeur="flexible"
        />
      </div>

      <ChampsDesirs prefixe={prefixe} valeurs={desirs} onChange={setDesirs} />
    </Formulaire>
  )
}
