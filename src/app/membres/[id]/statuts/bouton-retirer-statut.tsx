'use client'

export function BoutonRetirerStatut({ libelle }: { libelle: string }) {
  return (
    <button
      type="submit"
      onClick={(evenement) => {
        const confirme = window.confirm(
          `Retirer le statut « ${libelle} » ?\n\n` +
            'Le retrait est enregistré au journal et reste consultable ; le statut ' +
            'pourra être réattribué.',
        )
        if (!confirme) {
          evenement.preventDefault()
        }
      }}
      className="text-sm text-red-600 underline underline-offset-4"
    >
      Retirer
    </button>
  )
}
