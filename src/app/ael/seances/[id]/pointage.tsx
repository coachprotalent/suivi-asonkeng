'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { MembreBref } from '@/lib/donnees/membres'
import { Carte } from '@/composants/ui/carte'
import { CLASSES_CHAMP } from '@/composants/ui/champ'
import { LigneListe, Liste } from '@/composants/ui/ligne-liste'
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

  // Mineur 7 de la revue finale de branche : après le `router.refresh()` différé, un
  // membre ajouté par « Ajouter quelqu'un d'autre » apparaissait DEUX FOIS — une ligne
  // dans `membresAjoutes` (état client, préservé par le refresh) et une seconde dans
  // `presencesHorsListe`, recalculé côté serveur qui vient, lui, d'apprendre l'existence
  // de cette présence. Les deux cases lisent le même `presences[id]`, donc rien
  // d'incohérent — mais deux lignes pour une personne, sur un contrôle destructif. Le
  // serveur gagne : dès qu'un identifiant est rendu dans le bloc « hors liste », la
  // ligne cliente correspondante disparaît. La personne reste visible et cochable, à un
  // seul endroit.
  const idsHorsListe = new Set(presencesHorsListe.map((entree) => entree.id))
  const listeComplete = [
    ...membres,
    ...membresAjoutes.filter(
      (ajoute) => !membres.some((m) => m.id === ajoute.id) && !idsHorsListe.has(ajoute.id),
    ),
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
    <div className="flex flex-col gap-esp-4">
      <p className="text-petit text-encre-attenuee">
        {presentsCount} présent{presentsCount > 1 ? 's' : ''}.
      </p>

      <input
        type="search"
        value={filtre}
        onChange={(evenement) => setFiltre(evenement.target.value)}
        placeholder="Filtrer la liste affichée"
        aria-label="Filtrer la liste des membres"
        className={CLASSES_CHAMP}
      />

      <Liste>
        {membresAffiches.map((membre) => (
          <LigneListe
            key={membre.id}
            principal={
              <label className="cible-tactile flex items-center gap-esp-3">
                <input
                  type="checkbox"
                  checked={presences[membre.id] ?? false}
                  onChange={(evenement) => basculer(membre.id, evenement.target.checked)}
                />
                {membre.prenom} {membre.nom}
              </label>
            }
            actions={
              erreurs[membre.id] ? (
                <span role="alert" className="text-petit text-etat-refus">
                  {erreurs[membre.id]}
                </span>
              ) : undefined
            }
          />
        ))}
      </Liste>
      {membresAffiches.length === 0 ? (
        <p className="text-petit text-encre-attenuee">Aucun membre ne correspond à ce filtre.</p>
      ) : null}

      {presencesHorsListe.length > 0 ? (
        <section aria-label="Présences hors de la liste courante">
          <Carte ton="avertissement">
            <div className="flex flex-col gap-esp-2">
              {/*
                ⚠️ LE SEUL `<h3>` DU DÉPÔT (D109/D126, Task 23). Rien dans l'échelle de
                cinq degrés n'est un « titre de niveau 3 » : `text-nom` (0.95 rem / 600)
                est le plus proche, et il distingue ce titre d'un libellé de champ
                (`text-petit`) sans ajouter un sixième degré. Substitution retenue en
                revue de dimensionnement (Task 11) plutôt que découverte en relecture.
              */}
              <h3 className="text-nom">Présences hors de la liste courante</h3>
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
              <p className="text-petit text-encre-attenuee">
                Pointées sur quelqu&apos;un qui n&apos;est plus dans la liste ci-dessus — ajouté hors
                antenne, archivé depuis, ou rattaché à une autre antenne. Une case cochée ici reste
                comptée (D48) ; une case décochée ne l&apos;est pas, et ces lignes restent le seul
                endroit où la recocher.
              </p>
              <Liste>
                {presencesHorsListe.map((entree) => (
                  <LigneListe
                    key={entree.id}
                    principal={
                      <label className="cible-tactile flex items-center gap-esp-3">
                        <input
                          type="checkbox"
                          checked={presences[entree.id] ?? false}
                          onChange={(evenement) => basculer(entree.id, evenement.target.checked)}
                        />
                        {entree.libelle}
                      </label>
                    }
                    actions={
                      erreurs[entree.id] ? (
                        <span role="alert" className="text-petit text-etat-refus">
                          {erreurs[entree.id]}
                        </span>
                      ) : undefined
                    }
                  />
                ))}
              </Liste>
            </div>
          </Carte>
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
