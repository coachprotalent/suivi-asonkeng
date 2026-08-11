'use client'

export function BoutonBasculeStatut({
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
          ? `Désactiver le statut « ${libelle} » ?\n\n` +
            "Il ne pourra plus être attribué, mais les membres qui le portent le " +
            'conservent, et vous pourrez le réactiver.'
          : `Réactiver le statut « ${libelle} » ?`
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
