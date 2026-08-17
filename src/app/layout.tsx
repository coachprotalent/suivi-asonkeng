import type { Metadata } from 'next'
import { Cloche } from './notifications/cloche'
import './globals.css'

export const metadata: Metadata = {
  title: 'Mission Asonkeng',
  description: "Application de suivi des jeunes croyants de l'équipe Asonkeng.",
}

/*
  ═══ AUCUNE POLICE N'EST CHARGÉE (§4.2), ET C'EST UN RETRAIT, PAS UNE ABSTENTION ═══

  Ce fichier importait `Geist` et `Geist_Mono` de `next/font/google` et les instanciait en
  variables CSS. Les deux polices étaient RÉELLEMENT téléchargées, auto-hébergées au build
  et préchargées à l'exécution — pour un bénéfice qui n'existait pas : `globals.css` posait
  `font-family: Arial, Helvetica, sans-serif` sur `body`, ce qui écrasait `--font-geist-sans`
  pour la totalité du document. Le seul usage réel de la famille était `font-mono`, sur
  TROIS balises `<code>` (`comptes/formulaire-compte.tsx:73`, `comptes/ligne-compte.tsx:284`,
  `tokens/formulaire-generation.tsx:95`), qui retombent désormais sur la pile mono système
  déclarée en jeton.

  La pile système est CHOISIE, pas subie : charger une police introduirait un octet
  bloquant sur le premier rendu de CHAQUE page pour un bénéfice esthétique.

  `bg-fond text-encre` sont posés ici et pas seulement dans la couche de base de
  `globals.css` : `body` porte déjà `min-h-full flex flex-col`, et rassembler les quatre au
  même endroit évite qu'un lecteur cherche le fond de page dans deux fichiers.
*/
export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="app-shell flex min-h-full flex-col bg-fond text-encre">
        <Cloche />
        {children}
      </body>
    </html>
  )
}
