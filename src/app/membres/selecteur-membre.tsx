'use client'

import { useEffect, useId, useRef, useState, useTransition } from 'react'
import type { MembreBref } from '@/lib/donnees/membres'
import { chercherMembres } from './recherche-action'

type Props = {
  /** Nom du champ caché envoyé avec le formulaire. */
  nom: string
  label: string
  aide: string
  /** Valeur courante. Elle vit chez le parent : voir l'encadré de la tâche. */
  valeur: MembreBref | null
  surChoix: (membre: MembreBref | null) => void
  /** Membre à ne jamais proposer — celui qu'on est en train de rattacher. */
  exclureId: string | null
}

const DELAI_FRAPPE_MS = 250

export function SelecteurMembre({ nom, label, aide, valeur, surChoix, exclureId }: Props) {
  const prefixe = useId()
  const idSaisie = `${prefixe}-saisie`
  const idAide = `${prefixe}-aide`

  const [terme, setTerme] = useState('')
  const [resultats, setResultats] = useState<MembreBref[]>([])
  const [enCours, demarrer] = useTransition()
  // Numéro de la dernière recherche lancée. Sans lui, une réponse lente arrivée après
  // une réponse rapide écraserait les résultats du terme le plus récent — l'utilisateur
  // verrait des résultats qui ne correspondent pas à ce qu'il a tapé.
  const dernierAppel = useRef(0)

  useEffect(() => {
    if (terme.trim().length === 0) {
      // Invalider toute recherche en vol plutôt que de réinitialiser `resultats`
      // depuis l'effet : un `setState` synchrone dans le corps d'un effet déclenche
      // un rendu en cascade (règle `react-hooks/set-state-in-effect`), et sans ce
      // bump, une réponse lente partie avant l'effacement du champ pourrait encore
      // repeupler la liste après coup. L'affichage, lui, se déduit de `terme` — voir
      // `resultatsAffiches` plus bas.
      dernierAppel.current++
      return
    }
    const minuterie = setTimeout(() => {
      const numero = ++dernierAppel.current
      demarrer(async () => {
        const trouves = await chercherMembres(terme, exclureId)
        if (numero === dernierAppel.current) {
          setResultats(trouves)
        }
      })
    }, DELAI_FRAPPE_MS)
    return () => clearTimeout(minuterie)
  }, [terme, exclureId])

  // Dérivé plutôt que réinitialisé par effet : tant que le champ est vide, aucun
  // résultat ne s'affiche, même si `resultats` garde encore la dernière réponse reçue.
  const resultatsAffiches = terme.trim().length === 0 ? [] : resultats

  function retenir(membre: MembreBref | null) {
    setTerme('')
    setResultats([])
    surChoix(membre)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <input type="hidden" name={nom} value={valeur?.id ?? ''} />
      <label htmlFor={idSaisie} className="text-sm font-medium">
        {label}
      </label>

      {valeur ? (
        <p className="flex items-center gap-3 text-sm">
          <span className="rounded-md border border-neutral-300 px-3 py-2">
            {valeur.prenom ? `${valeur.prenom} ${valeur.nom}` : valeur.nom}
          </span>
          <button
            type="button"
            onClick={() => retenir(null)}
            className="text-sm underline underline-offset-4"
          >
            Détacher
          </button>
        </p>
      ) : null}

      <input
        id={idSaisie}
        type="search"
        value={terme}
        onChange={(evenement) => setTerme(evenement.target.value)}
        placeholder="Chercher par nom ou prénom"
        aria-describedby={idAide}
        className="rounded-md border border-neutral-300 px-3 py-2"
      />
      <span id={idAide} className="text-xs text-neutral-500">
        {aide}
      </span>

      {enCours ? <p className="text-xs text-neutral-500">Recherche…</p> : null}

      {resultatsAffiches.length > 0 ? (
        <ul className="divide-y divide-neutral-200 rounded-md border border-neutral-300">
          {resultatsAffiches.map((membre) => (
            <li key={membre.id}>
              <button
                type="button"
                onClick={() => retenir(membre)}
                className="w-full px-3 py-2 text-left text-sm hover:bg-neutral-50"
              >
                {membre.prenom} {membre.nom}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {/*
        Distinguer « pas encore cherché » de « cherché, rien trouvé ». Sans ce message,
        une recherche sans résultat est indiscernable d'une recherche qui n'est pas
        partie, et l'utilisateur retape indéfiniment le même nom.
      */}
      {!enCours && terme.trim().length > 0 && resultatsAffiches.length === 0 ? (
        <p className="text-xs text-neutral-500">Aucun membre actif ne correspond.</p>
      ) : null}
    </div>
  )
}
