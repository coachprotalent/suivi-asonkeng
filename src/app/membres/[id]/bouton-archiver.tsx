'use client'

export function BoutonArchiver({ nomComplet }: { nomComplet: string }) {
  return (
    <button
      type="submit"
      onClick={(evenement) => {
        const confirme = window.confirm(
          `Archiver la fiche de ${nomComplet} ?\n\n` +
            "Elle disparaîtra de l'annuaire, mais rien n'est supprimé : " +
            'la fiche et son historique restent consultables.',
        )
        if (!confirme) {
          evenement.preventDefault()
        }
      }}
      className="text-sm text-red-600 underline underline-offset-4"
    >
      Archiver
    </button>
  )
}
