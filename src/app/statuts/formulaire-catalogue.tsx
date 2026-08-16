'use client'

import { useActionState, useState } from 'react'
import { Bouton } from '@/composants/ui/bouton'
import { Champ } from '@/composants/ui/champ'
import { Formulaire } from '@/composants/ui/formulaire'
import { Selecteur } from '@/composants/ui/selecteur'
import type { GroupeStatut } from '@/lib/donnees/statuts'
import { creerGroupe, creerStatut, type EtatCatalogue } from './actions'

const etatInitial: EtatCatalogue = { erreur: null }

export function FormulaireGroupe() {
  const [etat, envoyer, enCours] = useActionState(creerGroupe, etatInitial)
  const [nom, setNom] = useState('')
  /*
    ⚠️ LA SEULE CASE À COCHER DU DÉPÔT RÉELLEMENT EXPOSÉE AU PIÈGE DE REMISE À ZÉRO
    (D111, D112). Neuf cases à cocher vivent dans ce dépôt (Task 3, commentaire de tête
    de `champ.tsx`) ; les huit autres sont dans des `<form onSubmit>` (pointage AEL,
    profil de compte, désirs de participation, séance manuelle), où la remise à zéro
    AUTOMATIQUE que React applique à un `<form action>` après complétion ne se produit
    jamais. `exclusif` est la SEULE case dans un `<form action>` — ce `Formulaire`
    (D112) — donc la seule que ce piège atteint réellement.

    `Champ` exclut les cases à cocher par construction (`defaultChecked?: never`,
    voir son commentaire de tête) : elle reste un `<input type="checkbox">` nu,
    contrôlée à la main par `checked` + `onChange`.
  */
  const [exclusif, setExclusif] = useState(false)

  return (
    <Formulaire
      action={envoyer}
      erreur={etat.erreur}
      enCours={enCours}
      actions={
        <Bouton type="submit" alignement="debut" enCours={enCours}>
          Ajouter
        </Bouton>
      }
    >
      <div className="flex flex-wrap items-end gap-esp-3">
        <Champ
          label="Nom du groupe"
          name="nom"
          value={nom}
          onChange={(evenement) => setNom(evenement.target.value)}
          required
          largeur="flexible"
        />
        <label className="cible-tactile flex items-center gap-esp-2">
          <input
            name="exclusif"
            type="checkbox"
            checked={exclusif}
            onChange={(evenement) => setExclusif(evenement.target.checked)}
          />
          <span className="text-petit text-encre">Un seul statut à la fois</span>
        </label>
      </div>
    </Formulaire>
  )
}

export function FormulaireStatutCatalogue({ groupes }: { groupes: GroupeStatut[] }) {
  const [etat, envoyer, enCours] = useActionState(creerStatut, etatInitial)
  const [libelle, setLibelle] = useState('')
  const [groupeId, setGroupeId] = useState('')

  return (
    <Formulaire
      action={envoyer}
      erreur={etat.erreur}
      enCours={enCours}
      actions={
        <Bouton type="submit" alignement="debut" enCours={enCours}>
          Ajouter
        </Bouton>
      }
    >
      <div className="flex flex-wrap items-end gap-esp-3">
        <Champ
          label="Libellé"
          name="libelle"
          value={libelle}
          onChange={(evenement) => setLibelle(evenement.target.value)}
          required
          largeur="flexible"
        />
        <Selecteur
          label="Groupe"
          name="groupeId"
          value={groupeId}
          onChange={(evenement) => setGroupeId(evenement.target.value)}
          required
          optionVide={{ libelle: 'Choisir…', desactivee: true }}
          options={groupes.map((groupe) => ({ valeur: groupe.id, libelle: groupe.nom }))}
        />
      </div>
    </Formulaire>
  )
}
