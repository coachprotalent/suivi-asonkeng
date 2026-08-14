import { periodeValide } from '@/lib/domaine/evenements'
import {
  MESSAGE_DATE_DEBUT_OBLIGATOIRE,
  MESSAGE_PERIODE_INCOHERENTE,
  MESSAGE_TITRE_OBLIGATOIRE,
  MESSAGE_TYPE_OBLIGATOIRE,
} from './messages'

/**
 * PAS de `'use server'` dans ce fichier, et c'est la seule raison de son existence : Next
 * refuse AU BUILD — pas au `tsc` — l'export d'une fonction SYNCHRONE depuis un module
 * `'use server'` (« Only async functions are allowed to be exported in a "use server"
 * file »). Ces deux fonctions doivent être partagées entre `creerEvenement` (ce dossier) et
 * `modifierEvenement` (`[id]/actions.ts`), donc exportées.
 *
 * PAS de `server-only` non plus : ces fonctions sont pures et ne touchent ni cookies ni clé
 * de service. Elles ne sont importées que par du code serveur aujourd'hui, mais rien ne
 * l'exige.
 */
export function champOuNull(donnees: FormData, champ: string): string | null {
  const valeur = donnees.get(champ)
  return typeof valeur === 'string' && valeur.trim().length > 0 ? valeur.trim() : null
}

/**
 * Colonnes communes à la création (Task 17) et à l'édition (Task 18), et leur validation.
 * Extraite pour la même raison que `filtrerMembresActifs` l'a été en 1c : deux copies de
 * cette validation seraient deux occasions de les faire diverger, et la divergence ne se
 * verrait qu'au moment où le `check` de la base refuserait une écriture que l'écran avait
 * laissé passer.
 */
export function colonnesEvenementDepuisFormulaire(
  donnees: FormData,
): { erreur: string } | { colonnes: Record<string, string | null> } {
  const titre = champOuNull(donnees, 'titre')
  if (!titre) {
    return { erreur: MESSAGE_TITRE_OBLIGATOIRE }
  }
  const typeId = champOuNull(donnees, 'typeId')
  if (!typeId) {
    return { erreur: MESSAGE_TYPE_OBLIGATOIRE }
  }
  const dateDebut = champOuNull(donnees, 'dateDebut')
  const dateFin = champOuNull(donnees, 'dateFin')

  // Contrôle AMONT (design §6) : nomme le champ fautif AVANT d'écrire. Le `check`
  // `evenements_periode_coherente` reste la barrière ; celui-ci explique.
  const motif = periodeValide(dateDebut, dateFin)
  if (motif === 'date_debut_manquante') {
    return { erreur: MESSAGE_DATE_DEBUT_OBLIGATOIRE }
  }
  if (motif === 'periode_incoherente') {
    return { erreur: MESSAGE_PERIODE_INCOHERENTE }
  }

  return {
    colonnes: {
      titre,
      type_id: typeId,
      date_debut: dateDebut,
      date_fin: dateFin,
      heure_debut: champOuNull(donnees, 'heureDebut'),
      lieu: champOuNull(donnees, 'lieu'),
      description: champOuNull(donnees, 'description'),
    },
  }
}
