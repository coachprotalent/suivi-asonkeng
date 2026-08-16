'use client'

import { useEffect, useId, useRef, useState, useTransition } from 'react'
import type { MembreBref } from '@/lib/donnees/membres'
import { Bouton } from '@/composants/ui/bouton'
import { CLASSES_CHAMP } from '@/composants/ui/champ'
import { chercherMembres } from './recherche-action'

/*
  ═══ POURQUOI CE WIDGET N'ADOPTE PAS `Champ` TEL QUEL ═══

  `Champ` (D111) rend label + input + aide comme UN SEUL BLOC, dans cet ordre, sans fente
  pour rien d'autre. Ce composant est un COMBOBOX composite : le membre déjà choisi
  s'affiche ENTRE le label et le champ de recherche, et deux messages d'état (recherche en
  cours, aucun résultat) s'affichent APRÈS l'aide — trois insertions que `Champ` n'a nulle
  part où loger sans rompre l'ordre existant.

  Le champ de recherche réutilise donc `CLASSES_CHAMP`, exactement la voie que `champ.tsx`
  documente pour ce cas : « quelques sites ont besoin de l'APPARENCE d'un champ sans
  pouvoir passer par le composant ». Même chose pour le libellé (`libelle-champ text-petit
  text-encre`, la classe que `Champ` applique au sien) et pour l'aide
  (`text-petit text-encre-attenuee`) : mêmes jetons, mécanique locale, parce que la forme
  du widget ne rentre pas dans le moule à trois pièces de `Champ`.
*/
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
    <div className="flex flex-col gap-esp-1">
      <input type="hidden" name={nom} value={valeur?.id ?? ''} />
      <label htmlFor={idSaisie} className="libelle-champ text-petit text-encre">
        {label}
      </label>

      {valeur ? (
        <p className="flex items-center gap-esp-3">
          <span className={CLASSES_CHAMP}>
            {valeur.prenom ? `${valeur.prenom} ${valeur.nom}` : valeur.nom}
          </span>
          <Bouton type="button" variante="lien" onClick={() => retenir(null)}>
            Détacher
          </Bouton>
        </p>
      ) : null}

      <input
        id={idSaisie}
        type="search"
        value={terme}
        onChange={(evenement) => setTerme(evenement.target.value)}
        placeholder="Chercher par nom ou prénom"
        aria-describedby={idAide}
        className={CLASSES_CHAMP}
      />
      <span id={idAide} className="text-petit text-encre-attenuee">
        {aide}
      </span>

      {enCours ? <p className="text-petit text-encre-attenuee">Recherche…</p> : null}

      {resultatsAffiches.length > 0 ? (
        <ul className="divide-y divide-filet rounded-bord border border-bord-carte bg-surface">
          {resultatsAffiches.map((membre) => (
            <li key={membre.id}>
              <button
                type="button"
                onClick={() => retenir(membre)}
                className="cible-tactile w-full px-esp-3 py-esp-2 text-left text-petit text-encre hover:bg-fond"
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
        <p className="text-petit text-encre-attenuee">Aucun membre actif ne correspond.</p>
      ) : null}
    </div>
  )
}
