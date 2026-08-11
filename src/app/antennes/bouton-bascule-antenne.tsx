'use client'

export function BoutonBasculeAntenne({ nom, desactiver }: { nom: string; desactiver: boolean }) {
  return (
    <button
      type="submit"
      onClick={(evenement) => {
        const message = desactiver
          ? `Désactiver l'antenne « ${nom} » ?\n\n` +
            "Elle n'apparaîtra plus dans les formulaires, mais les membres qui y sont " +
            'rattachés le restent, et vous pourrez la réactiver.'
          : `Réactiver l'antenne « ${nom} » ?`
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
