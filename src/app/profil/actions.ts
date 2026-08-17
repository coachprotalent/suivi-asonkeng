'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import {
  FicheMembreInvalideError,
  coordonneesPersonnellesDepuisFormData,
} from '@/lib/domaine/membre'
import { exigerProfilActif } from '@/lib/securite/garde'
import { clientAdmin } from '@/lib/supabase/admin'
import { MESSAGE_ECHEC_COORDONNEES, MESSAGE_PROFIL_SANS_MEMBRE } from './messages'

export type EtatProfil = { erreur: string | null }

const DETAIL_PROFIL_SANS_MEMBRE = 'profil_sans_membre'
const DETAIL_MEMBRE_INCONNU = 'membre_inconnu'

// LISTE FERMÉE DES MARQUEURS QUE `public.modifier_mon_profil` PEUT POSER — employée
// UNIQUEMENT pour décider ce qui a le droit d'atteindre le journal serveur.
//
// `error.details` n'est PAS toujours un marqueur : sur une violation de contrainte `check`
// de `public.membres` (23514), Postgres y écrit « Failing row contains (…) » — LA LIGNE
// ENTIÈRE : téléphone, adresse de contact, ville, pays, domaine d'étude. Ce chemin-ci écrit
// bien dans `public.membres`, et `membres_domaine_reserve_etudiant` en est atteignable si le
// `case` de la passerelle venait à disparaître. Même défaut que celui refermé sur
// `creerMembreEnrichi` (commit d48db7d) et sur `definirArbre`, même remède : on ne
// journalise `details` que lorsqu'il correspond à l'un de ces marqueurs CONNUS, jamais la
// valeur brute renvoyée par Postgres.
const MARQUEURS_CONNUS: ReadonlySet<string> = new Set([
  DETAIL_PROFIL_SANS_MEMBRE,
  DETAIL_MEMBRE_INCONNU,
])

/**
 * LE PREMIER CHEMIN D'ÉCRITURE NON ADMINISTRATEUR DU PROJET (D137, D140).
 *
 * ═══ CE QUI FAIT TENIR LA FERMETURE, ET DANS QUEL ORDRE ═══
 *
 * 1. `exigerProfilActif` en PREMIÈRE instruction. Pas de session, pas d'écriture — et le
 *    filtre `actif` de `profilCourant` est un contrôle d'accès, pas un confort :
 *    désactiver un compte ne révoque pas son jeton.
 *
 * 2. `p_profil: profil.id` — L'IDENTIFIANT DE CIBLE VIENT DE LA SESSION, JAMAIS DU
 *    `FormData`. C'est le point unique dont dépend tout le reste : accepter ici un
 *    identifiant venu du client transformerait cette action en « modifier la fiche de
 *    n'importe qui ». La passerelle, elle, fait confiance à ce qu'on lui donne — c'est
 *    documenté dans son commentaire et éprouvé par `tests/rls/profil-personnel.test.ts`.
 *
 * 3. `coordonneesPersonnellesDepuisFormData` ne lit QUE six champs. Un `nom`, un
 *    `antenneId` ou un `contactId` postés par un onglet forgé ne sont pas « ignorés par
 *    prudence » : ils ne sont jamais lus.
 *
 * 4. La signature de `public.modifier_mon_profil` ne peut pas écrire une septième colonne
 *    (D138), et la fiche visée y est RÉSOLUE depuis `profils`, jamais reçue.
 *
 * AUCUNE DE CES QUATRE LIGNES NE SUFFIT SEULE, ET AUCUNE N'EST REDONDANTE. La 2 protège
 * contre une cible forgée, la 3 contre une colonne forgée, la 4 contre une régression de la
 * 3, la 1 contre l'absence de session. Retirer l'une d'elles ne « simplifie » pas : elle
 * ouvre.
 */
export async function modifierMonProfil(
  _etat: EtatProfil,
  donnees: FormData,
): Promise<EtatProfil> {
  const profil = await exigerProfilActif()

  let coordonnees
  try {
    coordonnees = coordonneesPersonnellesDepuisFormData(donnees)
  } catch (erreur) {
    if (erreur instanceof FicheMembreInvalideError) {
      // Le message porte déjà une cause précise et actionnable : on le relaie tel quel.
      return { erreur: erreur.message }
    }
    console.error('modifierMonProfil : échec inattendu de la lecture du formulaire', { erreur })
    return { erreur: MESSAGE_ECHEC_COORDONNEES }
  }

  const { error } = await clientAdmin().rpc('modifier_mon_profil', {
    // ═══ JAMAIS `donnees.get(...)` ICI ═══ Voir le point 2 de l'encadré ci-dessus. Ce
    // seul argument est ce qui sépare « je modifie ma fiche » de « je modifie n'importe
    // quelle fiche ».
    p_profil: profil.id,
    p_telephone: coordonnees.telephone,
    p_email_contact: coordonnees.emailContact,
    p_ville: coordonnees.ville,
    p_pays: coordonnees.pays,
    p_situation: coordonnees.situation,
    p_domaine_etude: coordonnees.domaineEtude,
  })

  if (error) {
    console.error('modifierMonProfil : échec RPC modifier_mon_profil', {
      profilId: profil.id,
      code: error.code,
      details: error.details && MARQUEURS_CONNUS.has(error.details) ? error.details : undefined,
      message: error.message,
    })
    if (error.details === DETAIL_PROFIL_SANS_MEMBRE) {
      return { erreur: MESSAGE_PROFIL_SANS_MEMBRE }
    }
    // `membre_inconnu` — la fiche a disparu entre la lecture du profil et l'écriture — n'a
    // pas de message propre : il n'y a rien que la personne puisse faire de différent, et
    // inventer une phrase pour un cas qu'elle ne peut pas corriger vaut moins que le
    // message générique. Le marqueur reste JOURNALISÉ ci-dessus, là où il sert.
    return { erreur: MESSAGE_ECHEC_COORDONNEES }
  }

  revalidatePath('/profil')
  if (profil.membreId) {
    // La fiche publique affiche les mêmes coordonnées : sans cette invalidation, l'écran
    // `/membres/[id]` continuerait de servir l'ancienne valeur à tout le monde, y compris à
    // la personne qui vient de la corriger.
    revalidatePath(`/membres/${profil.membreId}`)
  }
  // DERNIÈRE instruction : `redirect()` lève une exception de contrôle Next.js, et ne doit
  // donc jamais se trouver dans un `try`.
  redirect('/profil?enregistre=1')
}
