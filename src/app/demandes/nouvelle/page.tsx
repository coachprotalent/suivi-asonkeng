'use client'

import { useActionState, useState } from 'react'
import { Bouton } from '@/composants/ui/bouton'
import { Champ } from '@/composants/ui/champ'
import { EnTetePage } from '@/composants/ui/en-tete-page'
import { Formulaire } from '@/composants/ui/formulaire'
import { creerDemandeSuivi, type EtatDemandeSuivi } from './actions'

const etatInitial: EtatDemandeSuivi = { erreur: null }

/** Les 4 champs libres de ce fichier (Task 24) : prénom, nom, téléphone, ville. */
export default function PageNouvelleDemande() {
  const [etat, envoyer, enCours] = useActionState(creerDemandeSuivi, etatInitial)
  const [prenom, setPrenom] = useState('')
  const [nom, setNom] = useState('')
  const [telephone, setTelephone] = useState('')
  const [ville, setVille] = useState('')

  return (
    <main className="mx-auto max-w-2xl px-esp-6 py-esp-10">
      <EnTetePage
        retour={{ href: '/demandes', libelle: 'Retour aux demandes' }}
        titre="Proposer une personne à suivre"
      />

      <Formulaire
        action={envoyer}
        erreur={etat.erreur}
        enCours={enCours}
        actions={
          <Bouton type="submit" alignement="debut" enCours={enCours} libelleAttente="Envoi…">
            Envoyer la demande
          </Bouton>
        }
      >
        {/* D115 — `md:` et non `sm:`, la bascule que ce phase généralise. */}
        <div className="grid gap-esp-4 md:grid-cols-2">
          <Champ
            label="Prénom (obligatoire)"
            name="prenom"
            required
            value={prenom}
            onChange={(evenement) => setPrenom(evenement.target.value)}
          />
          <Champ
            label="Nom (obligatoire)"
            name="nom"
            required
            value={nom}
            onChange={(evenement) => setNom(evenement.target.value)}
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
        </div>
      </Formulaire>
    </main>
  )
}
