'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { Bouton } from '@/composants/ui/bouton'
import { Carte } from '@/composants/ui/carte'
import { Champ } from '@/composants/ui/champ'
import { Formulaire } from '@/composants/ui/formulaire'
import { creerCompte, type EtatCompte } from './actions'

const etatInitial: EtatCompte = {
  erreur: null,
  identifiantCree: null,
  motDePasseTemporaire: null,
}

const VALEURS_VIDES = { identifiant: '', nomAffichage: '' }

export function FormulaireCompte() {
  const [etat, envoyer, enCours] = useActionState(creerCompte, etatInitial)
  const [valeurs, setValeurs] = useState(VALEURS_VIDES)

  // Vidé au SUCCÈS d'une VRAIE soumission, jamais au montage — même garde que
  // `formulaire-type.tsx` : tester seulement `etat.erreur === null` serait aussi vrai pour
  // `etatInitial`, et déclencherait l'effet dès le montage.
  const enCoursPrecedent = useRef(enCours)
  useEffect(() => {
    if (enCoursPrecedent.current && !enCours && etat.erreur === null) {
      setValeurs(VALEURS_VIDES)
    }
    enCoursPrecedent.current = enCours
  }, [enCours, etat])

  return (
    <div className="flex flex-col gap-esp-4">
      <Formulaire
        action={envoyer}
        erreur={etat.erreur}
        enCours={enCours}
        actions={
          <Bouton type="submit" alignement="debut" enCours={enCours} libelleAttente="Création…">
            Créer le compte
          </Bouton>
        }
      >
        <div className="flex flex-wrap gap-esp-3">
          <Champ
            label="Identifiant"
            name="identifiant"
            required
            autoCapitalize="none"
            spellCheck={false}
            value={valeurs.identifiant}
            onChange={(evenement) =>
              setValeurs((precedent) => ({ ...precedent, identifiant: evenement.target.value }))
            }
            aide="3 à 32 caractères : lettres, chiffres, points ou tirets, commençant par une lettre."
            largeur="flexible"
          />
          <Champ
            label="Nom d'affichage"
            name="nomAffichage"
            required
            value={valeurs.nomAffichage}
            onChange={(evenement) =>
              setValeurs((precedent) => ({ ...precedent, nomAffichage: evenement.target.value }))
            }
            largeur="flexible"
          />
        </div>
      </Formulaire>

      {etat.motDePasseTemporaire ? (
        <Carte ton="avertissement" role="alert">
          <p className="text-corps">Compte « {etat.identifiantCree} » créé.</p>
          <p className="mt-esp-2 text-corps">
            Mot de passe temporaire, à transmettre de vive voix :{' '}
            <code className="rounded-bord bg-fond px-esp-2 py-esp-1 font-mono">
              {etat.motDePasseTemporaire}
            </code>
          </p>
          <p className="mt-esp-2 text-petit text-encre-attenuee">
            Il ne sera plus jamais affiché. La personne devra en choisir un autre à sa
            première connexion.
          </p>
        </Carte>
      ) : null}
    </div>
  )
}
