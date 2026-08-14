'use client'

type Props = { libelle: string; actif: boolean }

/**
 * Confirmation avant bascule. Un type désactivé disparaît des NOUVELLES attributions mais
 * reste visible sur les événements passés (spec §7, même régime que les statuts) : la
 * confirmation le dit, sans quoi « désactiver » se lirait comme « supprimer ».
 */
export function BoutonBasculeType({ libelle, actif }: Props) {
  return (
    <button
      type="submit"
      onClick={(evenement) => {
        const texte = actif
          ? `Désactiver « ${libelle} » ? Il ne sera plus proposé pour un nouvel événement, mais restera affiché sur les événements passés.`
          : `Réactiver « ${libelle} » ?`
        if (!window.confirm(texte)) {
          evenement.preventDefault()
        }
      }}
      className="text-sm underline underline-offset-4"
    >
      {actif ? 'Désactiver' : 'Réactiver'}
    </button>
  )
}
