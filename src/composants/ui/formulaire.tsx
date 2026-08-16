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
/*
  ═══ LE BANDEAU DE REFUS PRÉCÈDE LE BOUTON, ET C'EST STRUCTUREL (revue des Tasks 8/9) ═══

  Les 46 bandeaux du dépôt sont écrits JUSTE AU-DESSUS du bouton de soumission — voir
  `inscription/formulaire-inscription.tsx:229,236-237` et
  `membres/[id]/statuts/formulaire-statut.tsx:105-117`, les deux formes non encore migrées.
  C'est l'ordre de lecture : on apprend POURQUOI ça a échoué, puis on retombe sur le geste
  qui refera l'envoi.

  LA PREMIÈRE RÉDACTION DE CE COMPOSANT L'A INVERSÉ, ET AUCUNE PORTE NE L'A VU. Elle rendait
  `{children}` puis `<Refus/>`, en s'appuyant sur une phrase du brief de la Task 4 qui
  affirmait que cela plaçait le bandeau « juste au-dessus du bouton ». Cette phrase est
  fausse dès que le bouton fait partie de `children` — ce que le même document prescrit
  quelques étapes plus haut. Deux exigences du même brief se contredisaient, et le code a
  suivi la mauvaise : sur `/membres/nouveau` et `/membres/[id]/modifier`, le refus
  s'affichait SOUS le bouton d'envoi.

  L'ATTÉNUATION EXISTAIT, ET C'EST CE QUI RENDAIT LE DÉFAUT INVISIBLE : le focus porté sur
  le bandeau (D113) provoque un défilement du navigateur vers lui QUELLE QUE SOIT SA
  POSITION. L'utilisateur voyait donc probablement le message. Seul l'ordre de lecture était
  rompu — et aucune preuve de bout en bout ne regarde la POSITION d'un bandeau, seulement
  son texte.

  ═══ D'OÙ UNE FENTE DISTINCTE, ET NON UNE CONSIGNE ═══

  `actions` porte les boutons de soumission, et le composant les rend APRÈS le bandeau.
  L'ordre d'origine est restitué PAR CONSTRUCTION : un appelant ne peut plus se tromper en
  plaçant son bouton au mauvais endroit, puisqu'il ne choisit plus l'endroit. C'est la même
  logique que celle qui a rendu `defaultValue` inexprimable (D111) — un remède structurel
  plutôt qu'une règle que chaque écran doit se rappeler.

  `actions` est OBLIGATOIRE. Un formulaire sans geste de soumission n'existe pas dans ce
  dépôt, et l'optionnel rouvrirait la porte : on remettrait le bouton dans `children` sans
  y penser, et le défaut reviendrait exactement comme il est venu.

  `formulaire.test.ts` asserte l'ORDRE DOM entre le bandeau et le bouton. C'est la preuve
  qui manquait ici, et elle rougit si l'ordre s'inverse.
*/
type ProprietesFormulaireBase = {
  /** Le refus RETOURNÉ par l'action, tel quel. `null` quand il n'y en a pas. */
  erreur: string | null
  /** L'attente. Le composant ne s'en sert que pour savoir QUAND porter le focus. */
  enCours: boolean
  /** Les champs. JAMAIS le bouton de soumission : il a sa fente, voir `actions`. */
  children: ReactNode
  /**
   * Les boutons de soumission, rendus APRÈS le bandeau de refus. Fente distincte et
   * OBLIGATOIRE — voir le commentaire ci-dessus : c'est ce qui rend l'ordre de lecture
   * impossible à casser depuis un écran.
   */
  actions: ReactNode
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

export function Formulaire({
  erreur,
  enCours,
  children,
  actions,
  ...soumission
}: ProprietesFormulaire) {
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
      {/*
        L'ORDRE EST LA DÉCISION : les champs, puis le refus, puis le geste. Voir le
        commentaire de `actions` — l'inverser replacerait le bandeau sous le bouton, ce que
        `formulaire.test.ts` refuse.
      */}
      {children}
      <Refus message={erreur} ref={zoneRefus} />
      {actions}
    </form>
  )
}
