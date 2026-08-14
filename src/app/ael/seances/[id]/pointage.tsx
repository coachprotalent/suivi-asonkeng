'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { MembreBref } from '@/lib/donnees/membres'
import { SelecteurMembre } from '../../../membres/selecteur-membre'
import { pointerPresence } from './pointage-actions'

/**
 * IMPORTANT 1 de la revue de la Task 19 — LE CACHE CLIENT, QUE LA CORRECTION I2 AVAIT
 * OUBLIÉ. Retirer le `revalidatePath` de `pointerPresence` a supprimé N re-rendus
 * serveur (le but, atteint), mais aussi l'invalidation du CACHE CLIENT de Next : « An
 * in-memory cache in the browser that stores RSC Payload for visited and prefetched
 * routes […] Pages are not cached by default but are reused during browser back/forward
 * navigation » (`node_modules/next/dist/docs/01-app/04-glossary.md:45-49`), que la même
 * source cite `revalidatePath` et `router.refresh` comme moyens d'invalider.
 *
 * CE N'EST PAS UNE HYPOTHÈSE : le chemin a été EXÉCUTÉ contre un vrai navigateur avant
 * d'être corrigé (`tests/e2e/ael-pointage.spec.ts`, test du retour arrière). Sans le
 * rafraîchissement ci-dessous, pointer puis revenir par le bouton Précédent rendait la
 * case DÉCOCHÉE et le total à l'état d'AVANT.
 *
 * FORME RETENUE : un `router.refresh()` DIFFÉRÉ ET COALESCENT (une seule minuterie,
 * réarmée à chaque bascule), et NON au démontage du composant comme la revue le
 * suggérait en premier. La raison est vérifiée dans la doc du dépôt et non supposée :
 * `router.refresh()` « Refresh the CURRENT route […] This clears the Client Cache for
 * the current route »
 * (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-router.md:46`).
 * Au démontage, la navigation a déjà eu lieu : la route courante est la NOUVELLE, et
 * c'est SON entrée de cache qui serait purgée — pas celle de l'écran de pointage, la
 * seule périmée. Le différé tient donc les deux propriétés que l'arbitrage exigeait
 * ensemble : pointer N personnes d'affilée ne coûte QU'UN re-rendu complet au lieu de N,
 * et l'entrée de cache de CET écran est rafraîchie tant qu'il est encore la route
 * courante, donc un retour arrière ultérieur dit la vérité.
 */
const DELAI_RAFRAICHISSEMENT_MS = 3_000

type PresenceHorsListe = { id: string; libelle: string }

type Props = {
  seanceId: string
  membres: MembreBref[]
  presencesInitiales: Record<string, boolean>
  /**
   * Présences (correction I1 de la ronde) dont l'identifiant n'est PAS dans `membres`
   * — ajoutées hors antenne (D47), archivées depuis (D48), ou déplacées vers une autre
   * antenne. Rendu dans un bloc distinct, jamais fondu dans `membresAffiches` : ce ne
   * sont pas des choix disponibles pour un NOUVEL ajout (le sélecteur plus bas s'en
   * charge), ce sont des présences DÉJÀ pointées qu'il faut continuer de voir et de
   * pouvoir corriger.
   */
  presencesHorsListe: PresenceHorsListe[]
}

export function Pointage({ seanceId, membres, presencesInitiales, presencesHorsListe }: Props) {
  const [membresAjoutes, setMembresAjoutes] = useState<MembreBref[]>([])
  const [presences, setPresences] = useState(presencesInitiales)
  const [erreurs, setErreurs] = useState<Record<string, string>>({})
  const [filtre, setFiltre] = useState('')
  const [, demarrer] = useTransition()
  const router = useRouter()
  const minuterieRafraichissement = useRef<ReturnType<typeof setTimeout> | null>(null)

  // La minuterie est annulée au démontage : sans cela, elle se déclencherait après un
  // départ de l'écran et rafraîchirait la route DEVENUE courante, c'est-à-dire une autre
  // page — un re-rendu inutile, et jamais celui qui sert à quelque chose.
  useEffect(
    () => () => {
      if (minuterieRafraichissement.current) clearTimeout(minuterieRafraichissement.current)
    },
    [],
  )

  // Voir l'encadré de `DELAI_RAFRAICHISSEMENT_MS` : une seule minuterie, réarmée à
  // chaque bascule, donc UN re-rendu par rafale de pointages et non un par case.
  function planifierRafraichissement() {
    if (minuterieRafraichissement.current) clearTimeout(minuterieRafraichissement.current)
    minuterieRafraichissement.current = setTimeout(() => {
      minuterieRafraichissement.current = null
      router.refresh()
    }, DELAI_RAFRAICHISSEMENT_MS)
  }

  // Total VISIBLE AUX GESTIONNAIRES aussi (correction I1) — pas seulement aux
  // non-gestionnaires (`page.tsx`, branche `else`) : ce sont eux qui pointent. Calculé
  // depuis l'état client `presences`, qui porte déjà TOUTES les présences (y compris
  // celles de `presencesHorsListe`, incluses dans `presencesInitiales` par
  // `presencesDeSeance`) : ce total reste juste après chaque bascule, sans re-rendu
  // serveur (I2).
  const presentsCount = Object.values(presences).filter(Boolean).length

  const listeComplete = [
    ...membres,
    ...membresAjoutes.filter((ajoute) => !membres.some((m) => m.id === ajoute.id)),
  ]

  const membresAffiches =
    filtre.trim().length === 0
      ? listeComplete
      : listeComplete.filter((m) =>
          `${m.prenom} ${m.nom}`.toLowerCase().includes(filtre.trim().toLowerCase()),
        )

  function basculer(membreId: string, present: boolean) {
    setPresences((precedent) => ({ ...precedent, [membreId]: present }))
    setErreurs((precedent) => ({ ...precedent, [membreId]: '' }))
    demarrer(async () => {
      const resultat = await pointerPresence(seanceId, membreId, present)
      if (resultat.erreur) {
        // Écriture refusée : on annule l'effet visuel et on affiche pourquoi, ligne
        // par ligne — un formulaire global n'aurait pas cette granularité (D43).
        setPresences((precedent) => ({ ...precedent, [membreId]: !present }))
        setErreurs((precedent) => ({ ...precedent, [membreId]: resultat.erreur as string }))
        return
      }
      // Écriture RÉUSSIE seulement : rien à purger si rien n'a été écrit.
      planifierRafraichissement()
    })
  }

  function ajouterMembre(membre: MembreBref | null) {
    if (!membre) return
    setMembresAjoutes((precedent) =>
      precedent.some((m) => m.id === membre.id) ? precedent : [...precedent, membre],
    )
    // Choisir quelqu'un via ce sélecteur EST le geste de le marquer présent (D47) :
    // même écriture unitaire que cocher une case de la liste.
    basculer(membre.id, true)
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-neutral-600">
        {presentsCount} présent{presentsCount > 1 ? 's' : ''}.
      </p>

      <input
        type="search"
        value={filtre}
        onChange={(evenement) => setFiltre(evenement.target.value)}
        placeholder="Filtrer la liste affichée"
        aria-label="Filtrer la liste des membres"
        className="rounded-md border border-neutral-300 px-3 py-2"
      />

      <ul className="divide-y divide-neutral-200">
        {membresAffiches.map((membre) => (
          <li key={membre.id} className="flex items-center justify-between gap-4 py-2">
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={presences[membre.id] ?? false}
                onChange={(evenement) => basculer(membre.id, evenement.target.checked)}
              />
              {membre.prenom} {membre.nom}
            </label>
            {erreurs[membre.id] ? (
              <span role="alert" className="text-xs text-red-600">
                {erreurs[membre.id]}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      {membresAffiches.length === 0 ? (
        <p className="text-sm text-neutral-600">Aucun membre ne correspond à ce filtre.</p>
      ) : null}

      {presencesHorsListe.length > 0 ? (
        <section
          aria-label="Présences hors de la liste courante"
          className="flex flex-col gap-2 rounded-md border border-amber-300 bg-amber-50 p-3"
        >
          <h3 className="text-sm font-medium">Présences hors de la liste courante</h3>
          {/*
            Mineur 1 de la revue de la Task 19 : la phrase disait « Leur présence reste
            comptée (D48) » de TOUTES les lignes de ce bloc, alors que `page.tsx` y range
            aussi les identifiants dont la présence vaut `false` — quelqu'un qui a été
            pointé puis dépointé, donc jamais compté. L'encadré affirmait donc une chose
            fausse pour une partie de ce qu'il montrait. La phrase est rendue
            CONDITIONNELLE plutôt que la ligne supprimée : une fiche archivée n'est plus
            retrouvable par le sélecteur « Ajouter quelqu'un d'autre » (qui ne cherche que
            parmi les membres ACTIFS), donc retirer sa ligne la rendrait DÉFINITIVEMENT
            impossible à re-cocher après un décochage accidentel.
          */}
          <p className="text-xs text-neutral-600">
            Pointées sur quelqu&apos;un qui n&apos;est plus dans la liste ci-dessus — ajouté hors
            antenne, archivé depuis, ou rattaché à une autre antenne. Une case cochée ici reste
            comptée (D48) ; une case décochée ne l&apos;est pas, et ces lignes restent le seul
            endroit où la recocher.
          </p>
          <ul className="divide-y divide-amber-200">
            {presencesHorsListe.map((entree) => (
              <li key={entree.id} className="flex items-center justify-between gap-4 py-2">
                <label className="flex items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={presences[entree.id] ?? false}
                    onChange={(evenement) => basculer(entree.id, evenement.target.checked)}
                  />
                  {entree.libelle}
                </label>
                {erreurs[entree.id] ? (
                  <span role="alert" className="text-xs text-red-600">
                    {erreurs[entree.id]}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <SelecteurMembre
        nom="ajoutMembre"
        label="Ajouter quelqu'un d'autre"
        aide="Cherche parmi tous les membres actifs, y compris hors de ces antennes (D47)."
        valeur={null}
        surChoix={ajouterMembre}
        exclureId={null}
      />
    </div>
  )
}
