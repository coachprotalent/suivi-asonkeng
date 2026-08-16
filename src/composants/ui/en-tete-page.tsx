import Link from 'next/link'
import type { ReactNode } from 'react'

/*
  ═══ 28 `<h1>`, 26 DU MÊME STYLE, ET SIX MARGES DIFFÉRENTES ═══

  Relevé exact du 2026-08-16 (`grep -rn "<h1" src --include="*.tsx"`) :

    mt-4 mb-8 text-2xl font-semibold   7 fichiers
    mt-4 mb-2 text-2xl font-semibold   6 fichiers
    (aucune marge) text-2xl font-semibold   8 fichiers
    mb-1 text-2xl font-semibold        3 fichiers
    mt-4 mb-6 text-2xl font-semibold   1 fichier
    mt-4 text-2xl font-semibold        1 fichier
    text-xl font-semibold              2 fichiers — LES DEUX EXCEPTIONS DE TAILLE

  Les deux exceptions de taille sont `src/app/error.tsx:6` et `src/app/not-found.tsx:6` —
  l'inventaire du vocabulaire les signalait sans les localiser ; elles le sont ici.

  Rien ne distingue ces six marges : ce sont des recopies imparfaites. UNE SEULE survit.

  IL N'EXISTE AUCUNE BARRE DE NAVIGATION, AUCUN MENU, AUCUN FIL D'ARIANE DANS CE PROJET
  (inventaire des écrans, §2). La navigation passe par un lien de retour explicite en haut
  de chaque page — présent SYSTÉMATIQUEMENT, mais réécrit à la main dans chaque fichier.
  C'est ce lien que la prop `retour` factorise, et rien de plus : ce composant ne crée NI
  fil d'Ariane, NI barre de navigation, qui n'existent nulle part et que D110 exclut
  explicitement (« le fil d'Ariane n'existe que sur un écran »).

  LE LIBELLÉ DU LIEN DE RETOUR EST FOURNI PAR L'APPELANT, jamais déduit de `href` : les
  écrans disent « Retour au tableau de bord », « Retour à l'annuaire », « Retour aux
  évènements », « Retour à la séance ». Les déduire changerait un texte affiché (D117).
*/
export type ProprietesEnTetePage = {
  titre: string
  retour?: { href: string; libelle: string }
  soustitre?: ReactNode
  action?: ReactNode
}

export function EnTetePage({ titre, retour, soustitre, action }: ProprietesEnTetePage) {
  return (
    <header className="mb-esp-8 flex flex-col gap-esp-2">
      {retour ? (
        <Link
          href={retour.href}
          className="cible-tactile self-start text-petit text-action underline underline-offset-4"
        >
          {retour.libelle}
        </Link>
      ) : null}

      {/*
        `md:` et non `sm:` : sous 48 rem, le titre et son action s'empilent. C'est la
        bascule que D115 généralise, et l'en-tête en est le premier consommateur — les
        écrans où l'action de tête est longue (« Nouveau membre », « Participants à
        traiter ») la voyaient jusqu'ici s'enrouler au milieu du titre par `flex-wrap`.
      */}
      <div className="flex flex-col gap-esp-2 md:flex-row md:items-baseline md:justify-between md:gap-esp-4">
        <div className="flex flex-col gap-esp-1">
          <h1 className="text-titre">{titre}</h1>
          {soustitre ? (
            <p className="chiffres-alignes text-petit text-encre-attenuee">{soustitre}</p>
          ) : null}
        </div>
        {action ?? null}
      </div>
    </header>
  )
}
