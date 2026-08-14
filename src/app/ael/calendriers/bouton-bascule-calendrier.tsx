'use client'

export function BoutonBasculeCalendrier({
  libelle,
  desactiver,
}: {
  libelle: string
  desactiver: boolean
}) {
  return (
    <button
      type="submit"
      onClick={(evenement) => {
        const message = desactiver
          ? `Désactiver le créneau « ${libelle} » ?\n\n` +
            "Aucune séance n'y sera plus générée tant qu'il n'est pas réactivé."
          : `Réactiver le créneau « ${libelle} » ?`
        if (!window.confirm(message)) {
          evenement.preventDefault()
        }
      }}
      className={
        desactiver
          ? 'text-sm text-red-600 underline underline-offset-4'
          : 'text-sm underline underline-offset-4'
      }
    >
      {desactiver ? 'Désactiver' : 'Réactiver'}
    </button>
  )
}
