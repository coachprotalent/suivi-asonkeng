'use client'

import { useActionState, useState } from 'react'
import type { GroupeStatut } from '@/lib/donnees/statuts'
import { Bouton } from '@/composants/ui/bouton'
import { Champ } from '@/composants/ui/champ'
import { Formulaire } from '@/composants/ui/formulaire'
import { Selecteur, type GroupeSelecteur } from '@/composants/ui/selecteur'
import { attribuerStatut, type EtatStatut } from './actions'

const etatInitial: EtatStatut = { erreur: null }

/*
  ═══ LE SECOND DES DEUX APPELANTS DE `Selecteur` GROUPÉ (Task 22) ═══

  `bloc-enrichissement.tsx:209` est le premier — même forme, même donnée, même besoin :
  choisir un statut dans un catalogue groupé, avec la mention « (un seul à la fois) » sur
  les groupes exclusifs, précédé d'une option désactivée qui sert d'invite. C'est ce
  décompte de deux appelants identiques qui a fait franchir à `Selecteur` le seuil de D110
  (revue de dimensionnement, Task 11).

  Les TROIS champs libres de ce fichier (le `<select>`, la date, la note) sont fermés ici :
  `Selecteur` et `Champ` exigent `value`/`onChange`, donc un état local pour chacun.
*/
export function FormulaireStatut({
  membreId,
  groupes,
}: {
  membreId: string
  groupes: GroupeStatut[]
}) {
  const [etat, envoyer, enCours] = useActionState(attribuerStatut, etatInitial)
  const aujourdhui = new Date().toISOString().slice(0, 10)

  const [statutId, setStatutId] = useState('')
  const [dateAcquisition, setDateAcquisition] = useState('')
  const [note, setNote] = useState('')

  const groupesSelecteur: GroupeSelecteur[] = groupes.map((groupe) => ({
    libelle: groupe.exclusif ? `${groupe.nom} (un seul à la fois)` : groupe.nom,
    options: groupe.statuts.map((statut) => ({ valeur: statut.id, libelle: statut.libelle })),
  }))

  return (
    <Formulaire
      action={envoyer}
      erreur={etat.erreur}
      enCours={enCours}
      actions={
        <Bouton
          type="submit"
          alignement="debut"
          enCours={enCours}
          libelleAttente="Enregistrement…"
        >
          Attribuer ce statut
        </Bouton>
      }
    >
      <input type="hidden" name="membreId" value={membreId} />

      <Selecteur
        name="statutId"
        label="Statut (obligatoire)"
        required
        value={statutId}
        onChange={(evenement) => setStatutId(evenement.target.value)}
        optionVide={{ libelle: 'Choisir un statut…', desactivee: true }}
        groupes={groupesSelecteur}
      />

      <Champ
        label="Date d'acquisition"
        name="dateAcquisition"
        type="date"
        max={aujourdhui}
        value={dateAcquisition}
        onChange={(evenement) => setDateAcquisition(evenement.target.value)}
        // Cette mention n'est pas un ornement. `attribuer_statut` applique un
        // `coalesce` : sur un statut déjà porté, un champ vide veut dire « ne
        // change pas », jamais « efface ».
        aide="Facultative. Elle n'est pas toujours connue. Sur un statut déjà porté, laisser vide conserve la date enregistrée."
      />

      <Champ
        label="Note"
        name="note"
        maxLength={500}
        value={note}
        onChange={(evenement) => setNote(evenement.target.value)}
        aide="Facultative. Sur un statut déjà porté, laisser vide conserve la note enregistrée."
      />
    </Formulaire>
  )
}
