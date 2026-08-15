'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { dirigeantPropose } from '@/lib/domaine/arbre'
import { cheminArbre, maillonArbre } from '@/lib/donnees/arbre'
import { membreBrefParId, type MembreBref } from '@/lib/donnees/membres'
import { exigerAdministrateur } from '@/lib/securite/garde'
import { clientAdmin } from '@/lib/supabase/admin'
import {
  MESSAGE_DIRIGEANT_INCONNU,
  MESSAGE_ECHEC_ARBRE,
  MESSAGE_FAISEUR_ARCHIVE,
  MESSAGE_FAISEUR_INCONNU,
  MESSAGE_MEMBRE_INCONNU,
  messageCycle,
} from './messages'

export type EtatArbre = { erreur: string | null }

// Marqueurs posés par `public.definir_arbre` et les déclencheurs anti-cycle
// (migration 20260814100000) et anti-faiseur-archivé (migration 20260814150000). On
// discrimine dessus, jamais sur la prose française.
const DETAIL_CYCLE = 'cycle_faiseur_de_disciple'
const DETAIL_MEMBRE_INCONNU = 'membre_inconnu'
const DETAIL_FAISEUR_INCONNU = 'faiseur_inconnu'
const DETAIL_DIRIGEANT_INCONNU = 'dirigeant_inconnu'
const DETAIL_FAISEUR_ARCHIVE = 'faiseur_de_disciple_archive'
// `definir_arbre` (migration 20260819100000) pose aussi ce marqueur pour un faiseur
// ni actif ni archivé ; cet écran ne le discrimine pas (voir le commentaire de tête de
// cette migration), mais il reste un marqueur APPLICATIF connu, sans danger à journaliser.
const DETAIL_FAISEUR_INACTIF = 'faiseur_de_disciple_inactif'

// LISTE FERMÉE DES MARQUEURS APPLICATIFS QUE `definir_arbre` PEUT POSER — employée
// UNIQUEMENT pour décider ce qui a le droit d'atteindre le journal serveur (voir plus
// bas). `error.details` n'est PAS toujours un marqueur : sur une violation de contrainte
// `check` (23514) — `membres_pas_son_propre_fdd` ou `membres_pas_son_propre_dirigeant`,
// que l'`update` de `definir_arbre` peut déclencher —, Postgres y écrit
// « Failing row contains (…) » — LA LIGNE ENTIÈRE : téléphone, adresse de contact, ville,
// pays. Même défaut que celui refermé sur `creerMembreEnrichi` (commit d48db7d), même
// remède : on ne journalise `details` que lorsqu'il correspond à l'un de ces marqueurs
// CONNUS, jamais la valeur brute renvoyée par Postgres.
const MARQUEURS_CONNUS: ReadonlySet<string> = new Set([
  DETAIL_CYCLE,
  DETAIL_MEMBRE_INCONNU,
  DETAIL_FAISEUR_INCONNU,
  DETAIL_DIRIGEANT_INCONNU,
  DETAIL_FAISEUR_ARCHIVE,
  DETAIL_FAISEUR_INACTIF,
])

function champOuNull(donnees: FormData, champ: string): string | null {
  const valeur = donnees.get(champ)
  return typeof valeur === 'string' && valeur.length > 0 ? valeur : null
}

/**
 * Dirigeant proposé pour un faiseur de disciple donné. Appelée depuis le formulaire à
 * chaque changement, pour que la proposition suive la saisie.
 */
export async function proposerDirigeant(
  faiseurDeDiscipleId: string | null,
): Promise<MembreBref | null> {
  await exigerAdministrateur()

  if (faiseurDeDiscipleId === null) {
    return null
  }
  const maillon = await maillonArbre(faiseurDeDiscipleId)
  const proposeId = dirigeantPropose(maillon)
  if (proposeId === null) {
    return null
  }
  return membreBrefParId(proposeId)
}

export async function definirArbre(
  _etat: EtatArbre,
  donnees: FormData,
): Promise<EtatArbre> {
  await exigerAdministrateur()

  const membreId = champOuNull(donnees, 'membreId')
  if (!membreId) {
    console.error('definirArbre : identifiant du membre manquant dans le formulaire')
    return { erreur: MESSAGE_ECHEC_ARBRE }
  }

  const faiseurId = champOuNull(donnees, 'faiseurDeDiscipleId')
  const dirigeantId = champOuNull(donnees, 'dirigeantId')
  const dirigeantForce = donnees.get('dirigeantForce') === '1'

  const { error } = await clientAdmin().rpc('definir_arbre', {
    p_membre: membreId,
    p_faiseur_de_disciple: faiseurId,
    p_dirigeant: dirigeantId,
    p_dirigeant_force: dirigeantForce,
  })

  if (error) {
    // `details` N'EST JAMAIS JOURNALISÉ TEL QUEL — voir `MARQUEURS_CONNUS` plus haut :
    // `definir_arbre` écrit dans `public.membres`, qui porte deux contraintes `check` sur
    // l'auto-référence (`membres_pas_son_propre_fdd`, `membres_pas_son_propre_dirigeant`),
    // mais UNE SEULE est atteignable en pratique, MESURÉ : `membres_pas_son_propre_fdd`
    // ne se déclenche jamais, le déclencheur anti-cycle `membres_anti_cycle`
    // (`prive.refuser_cycle_faiseur_de_disciple`) levant toujours avant elle, avec le même
    // diagnostic (`23514` / `cycle_faiseur_de_disciple`). Seule
    // `membres_pas_son_propre_dirigeant` peut donc faire porter à `error.details` la ligne
    // entière.
    console.error('definirArbre : échec RPC definir_arbre', {
      membreId,
      faiseurId,
      dirigeantId,
      dirigeantForce,
      code: error.code,
      details: error.details && MARQUEURS_CONNUS.has(error.details) ? error.details : undefined,
      message: error.message,
    })

    if (error.details === DETAIL_CYCLE) {
      // Le chemin fautif part du faiseur de disciple PROPOSÉ et remonte : s'il passe
      // par le membre qu'on édite, c'est précisément là que le cycle se refermerait.
      // `faiseurId` ne peut pas être null ici — un détachement ne crée aucun cycle —
      // mais on ne s'appuie pas sur ce raisonnement pour éviter une panne : un `null`
      // rendrait simplement le message générique, jamais une exception.
      const chemin = faiseurId ? await cheminArbre(faiseurId) : []
      return { erreur: messageCycle(chemin) }
    }
    if (error.details === DETAIL_MEMBRE_INCONNU) {
      return { erreur: MESSAGE_MEMBRE_INCONNU }
    }
    if (error.details === DETAIL_FAISEUR_INCONNU) {
      return { erreur: MESSAGE_FAISEUR_INCONNU }
    }
    if (error.details === DETAIL_FAISEUR_ARCHIVE) {
      return { erreur: MESSAGE_FAISEUR_ARCHIVE }
    }
    if (error.details === DETAIL_DIRIGEANT_INCONNU) {
      return { erreur: MESSAGE_DIRIGEANT_INCONNU }
    }
    return { erreur: MESSAGE_ECHEC_ARBRE }
  }

  revalidatePath('/membres')
  revalidatePath(`/membres/${membreId}`)
  revalidatePath(`/membres/${membreId}/arbre`)
  redirect(`/membres/${membreId}`)
}
