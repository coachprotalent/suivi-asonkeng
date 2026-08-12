'use client'

export function BoutonArchiver({
  nomComplet,
  archiver,
  // `true` : compte lié actif ; `false` : compte lié désactivé ; `null`/`undefined` :
  // aucun compte lié. Sert UNIQUEMENT à choisir le bon avertissement ci-dessous — voir
  // `etatCompteLie` (src/lib/donnees/comptes.ts). Empêcher vaut mieux qu'avertir, mais
  // avertir vaut infiniment mieux que surprendre (D24) : un bouton qui révoque aussi
  // l'accès de quelqu'un doit le dire avant qu'on clique, pas après.
  compteLie,
}: {
  nomComplet: string
  archiver: boolean
  compteLie?: boolean | null
}) {
  let message: string
  if (archiver) {
    message =
      `Archiver la fiche de ${nomComplet} ?\n\n` +
      "Elle disparaîtra de l'annuaire, mais rien n'est supprimé : " +
      'la fiche et son historique restent consultables.'
    if (compteLie === true) {
      message +=
        `\n\nLe compte de connexion lié à cette fiche sera désactivé : ${nomComplet} ne ` +
        "pourra plus se connecter tant qu'un administrateur ne l'aura pas réactivé, sur " +
        "l'écran des comptes."
    }
  } else {
    message = `Rétablir la fiche de ${nomComplet} ?\n\nElle réapparaîtra dans l'annuaire.`
    if (compteLie === false) {
      // D24 : la réciproque n'est PAS vraie, rétablir ne réactive rien — dit ici pour
      // que l'asymétrie ne passe pas pour un bug.
      message +=
        '\n\nLe compte de connexion lié à cette fiche reste désactivé : rétablir la fiche ' +
        "ne le réactive pas. Cela se fait séparément, sur l'écran des comptes."
    }
  }

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
