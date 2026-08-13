import 'server-only'
import { clientAdmin } from '@/lib/supabase/admin'
import { clientServeur } from '@/lib/supabase/serveur'

export type NotificationListe = {
  id: string
  type: 'nouvelle_demande' | 'demande_validee' | 'demande_rejetee'
  titre: string
  corps: string
  lien: string | null
  luLe: string | null
  creeLe: string
}

/**
 * Notifications du compte appelant, non lues d'abord, les plus récentes en tête.
 * `profilId` filtre EXPLICITEMENT en plus de la RLS (`notifications_lecture`) :
 * défense en profondeur bon marché, cohérente avec le fait que cette table est la
 * seule où « administrateur » n'élargit RIEN (design 2b §5.5).
 */
export async function mesNotifications(profilId: string): Promise<NotificationListe[]> {
  const supabase = await clientServeur()
  const { data, error } = await supabase
    .from('notifications')
    .select('id, type, titre, corps, lien, lu_le, cree_le')
    .eq('profil_id', profilId)
    .order('lu_le', { ascending: true, nullsFirst: true })
    .order('cree_le', { ascending: false })

  if (error) {
    throw new Error(`Lecture des notifications impossible : ${error.message}`)
  }
  return (data ?? []).map((l) => ({
    id: l.id as string,
    type: l.type as NotificationListe['type'],
    titre: l.titre as string,
    corps: l.corps as string,
    lien: l.lien as string | null,
    luLe: l.lu_le as string | null,
    creeLe: l.cree_le as string,
  }))
}

/** Nombre de notifications non lues, pour la cloche (`src/app/notifications/cloche.tsx`). */
export async function compterNotificationsNonLues(profilId: string): Promise<number> {
  const supabase = await clientServeur()
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('profil_id', profilId)
    .is('lu_le', null)

  if (error) {
    throw new Error(`Comptage des notifications impossible : ${error.message}`)
  }
  if (count === null) {
    throw new Error('Comptage des notifications absent de la réponse PostgREST.')
  }
  return count
}

/**
 * Notifie TOUS les administrateurs actifs (design 2b §5.3, §7.3 : jamais un seul).
 * Utilisée par `sInscrire` (Task 14, mode générique) et `creerDemandeSuivi`
 * (Task 16). Fonction INTERNE, PAS une Server Action : ce module ne porte pas la
 * directive `'use server'`, elle n'est donc appelable que depuis du code serveur
 * qui l'importe — jamais directement depuis le navigateur.
 *
 * Une notification manquée ne doit pas faire échouer l'inscription ou la demande
 * qui l'a déclenchée : à ce stade, l'écriture principale est déjà en base. On
 * journalise bruyamment plutôt que de lever.
 *
 * `demandeId` est OBLIGATOIRE dans le type (`string | null` explicite, pas un
 * champ optionnel) : c'est la clé de corrélation posée par la migration
 * 20260815240000, sur laquelle `annuler_demande_membre` (20260815250000) et
 * `valider_demande_rattachement` (20260815260000) filtrent pour marquer lues les
 * notifications d'une demande traitée. L'OMETTRE NE CASSE RIEN DE VISIBLE : la
 * colonne vaudrait NULL, les clauses `demande_id = p_demande` ne trouveraient
 * jamais rien, et la cloche des administrateurs garderait indéfiniment des non-lus
 * que plus aucun geste ne peut éteindre — sans une seule erreur. Le champ est
 * donc rendu non omissible pour qu'un futur appelant doive écrire `null` en toute
 * conscience plutôt que l'oublier.
 *
 * `lien` reste réservé à la NAVIGATION (`/demandes`, la liste) et ne doit jamais
 * être réutilisé comme clé de corrélation — c'est exactement la confusion que la
 * migration 20260815240000 a défaite.
 */
export async function notifierAdministrateurs(notification: {
  type: 'nouvelle_demande'
  titre: string
  corps: string
  lien: string | null
  demandeId: string | null
}): Promise<void> {
  const admin = clientAdmin()
  const { data: administrateurs, error: erreurAdmins } = await admin
    .from('roles_profil')
    .select('profil_id, profils!inner(actif)')
    .eq('role', 'administrateur')
    .eq('profils.actif', true)

  if (erreurAdmins) {
    console.error('notifierAdministrateurs : lecture des administrateurs impossible', {
      code: erreurAdmins.code,
      message: erreurAdmins.message,
    })
    return
  }

  const ids = (administrateurs ?? []).map((l) => l.profil_id as string)
  if (ids.length === 0) {
    console.error('notifierAdministrateurs : aucun administrateur actif à notifier')
    return
  }

  const { error: erreurInsertion } = await admin.from('notifications').insert(
    ids.map((profilId) => ({
      profil_id: profilId,
      type: notification.type,
      titre: notification.titre,
      corps: notification.corps,
      lien: notification.lien,
      demande_id: notification.demandeId,
    })),
  )
  if (erreurInsertion) {
    console.error('notifierAdministrateurs : insertion impossible', {
      code: erreurInsertion.code,
      message: erreurInsertion.message,
    })
  }
}
