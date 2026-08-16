'use client'

import { useState } from 'react'
import type { MembreBref } from '@/lib/donnees/membres'
import { Champ } from '@/composants/ui/champ'
import { SelecteurMembre } from '../../../membres/selecteur-membre'

type Props = {
  nomChampMembre: string
  nomChampLibre: string
  label: string
  /** Colonne BRUTE (`enseignant_membre_id` / `moderateur_membre_id`). */
  membreIdInitial: string | null
  /** Embed, `null` si la RLS cache la fiche à l'appelant. Voir l'encadré ci-dessous. */
  membreInitial: MembreBref | null
  libreInitial: string | null
}

/**
 * Un intervenant peut être DÉSIGNÉ (`membreIdInitial` non nul) sans que sa fiche soit
 * CONSULTABLE par ce compte (`membreInitial` nul) — typiquement une fiche archivée vue
 * par un modérateur : la politique `membres_lecture`
 * (`supabase/migrations/20260812120000_membres.sql`) n'ouvre une fiche archivée qu'à
 * un administrateur.
 *
 * `SelecteurMembre` (`src/app/membres/selecteur-membre.tsx`) rend TOUJOURS son champ
 * caché avec `valeur?.id ?? ''` : avec `valeur = null`, il partirait donc VIDE, et
 * l'enregistrement EFFACERAIT l'intervenant en base — sans un mot sur une séance
 * `prevue`, avec un message FAUX (« l'enseignant est manquant ») sur une séance déjà
 * `tenue`, où le déclencheur de complétude (Task 8) se déclenge alors pour de bon.
 *
 * Ce composant reçoit donc les DEUX informations et, dans ce cas précis, ne rend NI le
 * sélecteur NI le champ libre : un simple champ caché portant la valeur d'ORIGINE. Le
 * champ libre est écarté avec le sélecteur parce que le remplir alors qu'un identifiant
 * de membre non nul repart heurterait `seances_ael_enseignant_exclusif` (D36).
 *
 * ⚠️ CE FICHIER N'A AUCUN CHAMP LIBRE (Task 23) : `libre` était déjà contrôlé
 * (`value`/`onChange`) avant cette tâche. Le champ « intervenant extérieur » adopte
 * `Champ` directement — il portait déjà un `<label>` visible, rien de nouveau à l'écran.
 */
export function ChampIntervenant({
  nomChampMembre,
  nomChampLibre,
  label,
  membreIdInitial,
  membreInitial,
  libreInitial,
}: Props) {
  const [membre, setMembre] = useState<MembreBref | null>(membreInitial)
  const [libre, setLibre] = useState(libreInitial ?? '')

  // Un intervenant est DÉSIGNÉ (identifiant non nul) mais sa fiche n'est pas consultable
  // par ce compte (embed nul) : typiquement une fiche archivée vue par un modérateur.
  const masque = membreIdInitial !== null && membreInitial === null

  function choisirMembre(choisi: MembreBref | null) {
    setMembre(choisi)
    if (choisi) {
      setLibre('')
    }
  }

  function saisirLibre(valeur: string) {
    setLibre(valeur)
    if (valeur.trim().length > 0) {
      setMembre(null)
    }
  }

  if (masque) {
    // Le champ caché renvoie la valeur d'ORIGINE : l'enregistrement laisse la colonne
    // exactement telle qu'elle était. Sans lui, `SelecteurMembre` rendrait un champ
    // caché vide et l'enregistrement effacerait l'intervenant. Ni sélecteur ni champ
    // libre ici : proposer de saisir un nom libre à côté d'un identifiant de membre
    // conservé heurterait la contrainte d'exclusivité (D36).
    return (
      <fieldset className="flex flex-col gap-esp-2">
        <legend className="libelle-champ text-petit text-encre">{label}</legend>
        <input type="hidden" name={nomChampMembre} value={membreIdInitial} />
        <p className="text-petit text-encre-attenuee">
          Fiche non consultable — {label.toLowerCase()} conservé tel quel. Un administrateur
          peut le modifier.
        </p>
      </fieldset>
    )
  }

  return (
    <fieldset className="flex flex-col gap-esp-2">
      <legend className="libelle-champ text-petit text-encre">{label}</legend>
      <SelecteurMembre
        nom={nomChampMembre}
        label={`${label} (membre de l'équipe)`}
        aide="Cherche parmi les membres actifs."
        valeur={membre}
        surChoix={choisirMembre}
        exclureId={null}
      />
      <Champ
        label="Ou un intervenant extérieur"
        name={nomChampLibre}
        value={libre}
        onChange={(evenement) => saisirLibre(evenement.target.value)}
        placeholder="Nom, si ce n'est pas un membre"
      />
    </fieldset>
  )
}
