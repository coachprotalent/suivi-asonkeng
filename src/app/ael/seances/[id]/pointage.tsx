'use client'

import { useState, useTransition } from 'react'
import type { MembreBref } from '@/lib/donnees/membres'
import { SelecteurMembre } from '../../../membres/selecteur-membre'
import { pointerPresence } from './pointage-actions'

type Props = {
  seanceId: string
  membres: MembreBref[]
  presencesInitiales: Record<string, boolean>
}

export function Pointage({ seanceId, membres, presencesInitiales }: Props) {
  const [membresAjoutes, setMembresAjoutes] = useState<MembreBref[]>([])
  const [presences, setPresences] = useState(presencesInitiales)
  const [erreurs, setErreurs] = useState<Record<string, string>>({})
  const [filtre, setFiltre] = useState('')
  const [, demarrer] = useTransition()

  const listeComplete = [
    ...membres,
    ...membresAjoutes.filter((ajoute) => !membres.some((m) => m.id === ajoute.id)),
  ]

  const membresAffiches =
    filtre.trim().length === 0
      ? listeComplete
      : listeComplete.filter((m) =>
          `${m.prenom} ${m.nom}`.toLowerCase().includes(filtre.trim().toLowerCase()),
        )

  function basculer(membreId: string, present: boolean) {
    setPresences((precedent) => ({ ...precedent, [membreId]: present }))
    setErreurs((precedent) => ({ ...precedent, [membreId]: '' }))
    demarrer(async () => {
      const resultat = await pointerPresence(seanceId, membreId, present)
      if (resultat.erreur) {
        // Écriture refusée : on annule l'effet visuel et on affiche pourquoi, ligne
        // par ligne — un formulaire global n'aurait pas cette granularité (D43).
        setPresences((precedent) => ({ ...precedent, [membreId]: !present }))
        setErreurs((precedent) => ({ ...precedent, [membreId]: resultat.erreur as string }))
      }
    })
  }

  function ajouterMembre(membre: MembreBref | null) {
    if (!membre) return
    setMembresAjoutes((precedent) =>
      precedent.some((m) => m.id === membre.id) ? precedent : [...precedent, membre],
    )
    // Choisir quelqu'un via ce sélecteur EST le geste de le marquer présent (D47) :
    // même écriture unitaire que cocher une case de la liste.
    basculer(membre.id, true)
  }

  return (
    <div className="flex flex-col gap-4">
      <input
        type="search"
        value={filtre}
        onChange={(evenement) => setFiltre(evenement.target.value)}
        placeholder="Filtrer la liste affichée"
        aria-label="Filtrer la liste des membres"
        className="rounded-md border border-neutral-300 px-3 py-2"
      />

      <ul className="divide-y divide-neutral-200">
        {membresAffiches.map((membre) => (
          <li key={membre.id} className="flex items-center justify-between gap-4 py-2">
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={presences[membre.id] ?? false}
                onChange={(evenement) => basculer(membre.id, evenement.target.checked)}
              />
              {membre.prenom} {membre.nom}
            </label>
            {erreurs[membre.id] ? (
              <span role="alert" className="text-xs text-red-600">
                {erreurs[membre.id]}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      {membresAffiches.length === 0 ? (
        <p className="text-sm text-neutral-600">Aucun membre ne correspond à ce filtre.</p>
      ) : null}

      <SelecteurMembre
        nom="ajoutMembre"
        label="Ajouter quelqu'un d'autre"
        aide="Cherche parmi tous les membres actifs, y compris hors de ces antennes (D47)."
        valeur={null}
        surChoix={ajouterMembre}
        exclureId={null}
      />
    </div>
  )
}
