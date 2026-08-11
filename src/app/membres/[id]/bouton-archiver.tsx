'use client'

export function BoutonArchiver({
  nomComplet,
  archiver,
}: {
  nomComplet: string
  archiver: boolean
}) {
  const message = archiver
    ? `Archiver la fiche de ${nomComplet} ?\n\n` +
      "Elle disparaîtra de l'annuaire, mais rien n'est supprimé : " +
      'la fiche et son historique restent consultables.'
    : `Rétablir la fiche de ${nomComplet} ?\n\nElle réapparaîtra dans l'annuaire.`

  return (
    <button
      type="submit"
      onClick={(evenement) => {
        if (!window.confirm(message)) {
          evenement.preventDefault()
        }
      }}
      className={
        archiver
          ? 'text-sm text-red-600 underline underline-offset-4'
          : 'text-sm underline underline-offset-4'
      }
    >
      {archiver ? 'Archiver' : 'Rétablir'}
    </button>
  )
}
