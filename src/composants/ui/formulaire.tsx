'use client'

import { useEffect, useRef, type FormEvent, type ReactNode } from 'react'
import { Refus } from './refus'

/*
  ═══ D112 — `onReset` AVEC PRÉVENTION DU DÉFAUT, UNE FOIS POUR TOUTES ═══

  SECOND AXE DU DOSSIER DES CHAMPS EFFACÉS, DÉCOUVERT EN PHASE 5, ET DISTINCT DE D111.

  Un `<select>` CONTRÔLÉ ne survit pas à la réinitialisation automatique que React applique
  à un `<form action>` à la complétion de l'action — contrairement aux champs de saisie
  contrôlés, qui, eux, la traversent sans dommage. Rendre les champs contrôlés (D111) ne
  suffit donc pas : il faut EN PLUS empêcher la réinitialisation, et c'est ce que fait
  `onReset={(e) => e.preventDefault()}`.

  TROIS FICHIERS portent aujourd'hui ce remède À LA MAIN, et ce sont exactement les trois
  seuls du dépôt à combiner un `<select>` contrôlé et un `<form action>` pouvant retourner
  un refus (inventaire du vocabulaire §3.2, critère rejoué fichier par fichier) :
    - `src/app/evenements/formulaire-evenement.tsx:95`
    - `src/app/inscription/formulaire-inscription.tsx:91`
    - `src/app/membres/formulaire-membre.tsx:130` (partagé avec `bloc-enrichissement.tsx`)

  ET RIEN — NI RÈGLE DE LINT, NI TEST — NE SIGNALERAIT UN `<form>` NEUF QUI L'OUBLIE.
  La carte des composants atteints s'est déjà révélée fausse une fois dans ce projet,
  précisément parce qu'elle définissait sa cible par un critère qui excluait par
  construction le seul fichier atteint. UN COMPOSANT FERME LE CAS ; UNE CARTE NE LE FERME
  JAMAIS.

  Ici, `onReset` est posé INCONDITIONNELLEMENT et n'est PAS surchargeable : il n'est pas
  dans le type des propriétés. Aucun écran n'a plus à y penser, et aucun ne peut le retirer.

  ═══ CE COMPOSANT N'IMPOSE PAS `useActionState` ═══

  25 fichiers l'emploient, d'autres non. Les deux régimes sont exprimables :
    - `action={envoyer}` — le `dispatch` d'un `useActionState`, ou une Server Action liée ;
    - `onSubmit={handler}` — les formulaires qui interceptent eux-mêmes, comme les quatre
      de `comptes/ligne-compte.tsx` et les deux de `demandes/ligne-demande-admin.tsx`.
  Le type les rend MUTUELLEMENT EXCLUSIFS : porter les deux sur un même `<form>` ferait
  s'exécuter le handler ET l'action, ce qu'aucun appelant ne veut et que personne ne
  remarquerait avant la production.

  Cette phase ne touche à AUCUN chemin d'écriture (D118) : les formulaires qui emploient
  `useActionState` le gardent, ceux qui ne l'emploient pas ne sont pas convertis.
*/
type ProprietesFormulaireBase = {
  /** Le refus RETOURNÉ par l'action, tel quel. `null` quand il n'y en a pas. */
  erreur: string | null
  /** L'attente. Le composant ne s'en sert que pour savoir QUAND porter le focus. */
  enCours: boolean
  children: ReactNode
}

export type ProprietesFormulaire =
  | (ProprietesFormulaireBase & {
      action: (donnees: FormData) => void | Promise<void>
      onSubmit?: never
    })
  | (ProprietesFormulaireBase & {
      onSubmit: (evenement: FormEvent<HTMLFormElement>) => void
      action?: never
    })

export function Formulaire({ erreur, enCours, children, ...soumission }: ProprietesFormulaire) {
  const zoneRefus = useRef<HTMLParagraphElement | null>(null)

  /*
    ═══ POURQUOI CE `useRef` FERME LA COURSE AU MONTAGE PAR CONSTRUCTION ═══

    REPRIS TEL QUEL de `inscription/formulaire-inscription.tsx:80-86` et
    `membres/formulaire-membre.tsx:104-110`, les DEUX SEULS formulaires du dépôt qui
    portent le focus sur leur refus. Ce n'est pas une réécriture : c'est une extraction.

    `enCoursPrecedent` est initialisé avec la valeur du PREMIER rendu, nécessairement
    `false`. La passe de montage ne peut donc JAMAIS satisfaire
    `enCoursPrecedent.current && !enCours`, quel que soit le timing : la condition exige
    une transition `true -> false`, c'est-à-dire une VRAIE soumission terminée.

    Tester `erreur !== null` seul ne suffirait pas — l'effet se déclencherait dès le
    montage si un état d'erreur préexistait, et volerait le focus à un utilisateur qui
    vient d'arriver sur la page.

    AUCUNE REMISE À ZÉRO N'EST FAITE AU SUCCÈS, parce qu'il n'y en a pas à faire : les
    actions de ce dépôt REDIRIGENT ou revalident. Si un jour l'une d'elles cessait de le
    faire et qu'on voulait vider le formulaire, c'est EXACTEMENT ce garde qu'il faudrait
    réutiliser, avec `erreur === null` à la place.
  */
  const enCoursPrecedent = useRef(enCours)
  useEffect(() => {
    if (enCoursPrecedent.current && !enCours && erreur !== null) {
      zoneRefus.current?.focus()
    }
    enCoursPrecedent.current = enCours
  }, [enCours, erreur])

  return (
    <form
      {...soumission}
      /*
        D112 — INCONDITIONNEL, ET HORS DU TYPE DES PROPRIÉTÉS. Un appelant ne peut ni le
        retirer, ni le remplacer. C'est toute la différence entre un remède et une règle.
      */
      onReset={(evenement) => evenement.preventDefault()}
      className="flex flex-col gap-esp-4"
    >
      {children}
      <Refus message={erreur} ref={zoneRefus} />
    </form>
  )
}
