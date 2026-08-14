'use client'

export function BoutonTransitionEtat({
  libelle,
  message,
  accent,
}: {
  libelle: string
  message: string
  accent?: boolean
}) {
  return (
    <button
      type="submit"
      onClick={(evenement) => {
        if (!window.confirm(message)) {
          evenement.preventDefault()
        }
      }}
      className={`text-sm underline underline-offset-4 ${accent ? 'text-red-600' : ''}`}
    >
      {libelle}
    </button>
  )
}
