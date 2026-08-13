'use server'

import { redirect } from 'next/navigation'
import { FicheMembreInvalideError, ficheMembreDepuisFormData, ficheMembreVersColonnes } from '@/lib/domaine/membre'
import { notifierAdministrateurs } from '@/lib/donnees/notifications'
import { exigerProfilActif } from '@/lib/securite/garde'
import { clientAdmin } from '@/lib/supabase/admin'
import { MESSAGE_ECHEC_DEMANDE } from './messages'

export type EtatDemandeSuivi = { erreur: string | null }

/**
 * Demande de suivi (design 2b §7.2) : tout compte actif (`exigerProfilActif`), pas
 * seulement l'administrateur — spec maîtresse §5.2, ligne « Demander l'ajout d'une
 * personne suivie ». Contrairement à `sInscrire`, le demandeur agit sous sa propre
 * identité, connue et authentifiée : tous les champs de la fiche sont saisissables
 * directement, sans la restriction de sécurité qui s'applique au mode nominatif de
 * l'inscription publique.
 */
export async function creerDemandeSuivi(
  _etat: EtatDemandeSuivi,
  donnees: FormData,
): Promise<EtatDemandeSuivi> {
  const profil = await exigerProfilActif()

  let colonnes: Record<string, unknown>
  try {
    colonnes = ficheMembreVersColonnes(ficheMembreDepuisFormData(donnees))
  } catch (erreur) {
    return { erreur: erreur instanceof FicheMembreInvalideError ? erreur.message : MESSAGE_ECHEC_DEMANDE }
  }

  const admin = clientAdmin()

  const { data: fiche, error: erreurFiche } = await admin
    .from('membres')
    .insert({ ...colonnes, etat: 'en_attente' })
    .select('id')
    .single()

  if (erreurFiche || !fiche) {
    console.error('creerDemandeSuivi : échec de la création de la fiche', {
      profilId: profil.id,
      code: erreurFiche?.code,
      message: erreurFiche?.message,
    })
    return { erreur: MESSAGE_ECHEC_DEMANDE }
  }

  const { data: demande, error: erreurDemande } = await admin
    .from('demandes_membre')
    .insert({
      origine: 'demande_suivi',
      demandeur_profil_id: profil.id,
      membre_id: fiche.id,
      etat: 'en_attente',
    })
    .select('id')
    .single()

  if (erreurDemande || !demande) {
    console.error('creerDemandeSuivi : échec de la création de la demande, nettoyage de la fiche', {
      profilId: profil.id,
      ficheId: fiche.id,
      message: erreurDemande?.message,
    })
    // Fiche jetable, jamais validée : la supprimer ne perd rien (même raisonnement
    // que D26/D42, appliqué ici à un échec technique plutôt qu'à une annulation).
    await admin.from('membres').delete().eq('id', fiche.id)
    return { erreur: MESSAGE_ECHEC_DEMANDE }
  }

  // `demandeId` est OBLIGATOIRE ici (correction post-brief, migration 20260815240000
  // + 20260815250000) : c'est la clé de corrélation sur laquelle
  // `annuler_demande_membre` filtre pour marquer lues les notifications de CETTE
  // demande. L'omettre laisserait `demande_id` à NULL en base : la clause
  // `demande_id = p_demande` de l'annulation ne trouverait jamais rien, et la
  // cloche des administrateurs garderait indéfiniment un non-lu que plus aucun
  // geste ne peut éteindre.
  await notifierAdministrateurs({
    type: 'nouvelle_demande',
    titre: 'Nouvelle demande de suivi',
    corps: `${profil.nomAffichage} propose de suivre une nouvelle personne.`,
    lien: '/demandes',
    demandeId: demande.id,
  })

  redirect('/demandes?demandeCreee=1')
}
