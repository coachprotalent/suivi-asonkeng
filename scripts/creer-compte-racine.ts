import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { identifiantVersEmail, normaliserIdentifiant } from '../src/lib/domaine/identifiant'

function requis(nom: string): string {
  const valeur = process.env[nom]
  if (!valeur) {
    throw new Error(`Variable d'environnement manquante : ${nom}`)
  }
  return valeur
}

/**
 * Supprime un compte auth que le script vient lui-même de créer, suite à un échec
 * d'une étape suivante. Ne doit jamais être appelée sur un compte préexistant.
 * Retourne un fragment de message à ajouter à l'erreur d'origine si la suppression
 * de secours échoue elle aussi, pour ne pas faire disparaître silencieusement
 * l'existence d'un compte orphelin.
 */
async function nettoyerCompteOrphelin(supabase: SupabaseClient, idUtilisateur: string): Promise<string> {
  const { error: erreurSuppression } = await supabase.auth.admin.deleteUser(idUtilisateur)
  if (erreurSuppression) {
    return ` Compte d'authentification ${idUtilisateur} non supprimé, à nettoyer manuellement : ${erreurSuppression.message}`
  }
  return ''
}

/**
 * Exécute une écriture critique de l'amorçage (insertion du profil, attribution du
 * rôle). Capture aussi bien une erreur retournée qu'une exception native, et déclenche
 * dans les deux cas le nettoyage du compte auth avant de relancer.
 */
async function etapeCritique(
  supabase: SupabaseClient,
  idUtilisateur: string,
  description: string,
  executer: () => Promise<{ error: { message: string } | null }>,
): Promise<void> {
  let erreur: { message: string } | null = null
  try {
    const resultat = await executer()
    erreur = resultat.error
  } catch (exception) {
    erreur = { message: exception instanceof Error ? exception.message : String(exception) }
  }
  if (erreur) {
    const suffixeNettoyage = await nettoyerCompteOrphelin(supabase, idUtilisateur)
    throw new Error(`${description} : ${erreur.message}.${suffixeNettoyage}`)
  }
}

async function principal() {
  const supabase = createClient(requis('NEXT_PUBLIC_SUPABASE_URL'), requis('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const identifiant = normaliserIdentifiant(requis('RACINE_IDENTIFIANT'))
  const nomAffichage = requis('RACINE_NOM_AFFICHAGE')
  const motDePasse = requis('RACINE_MOT_DE_PASSE')

  if (motDePasse.length < 12) {
    throw new Error('RACINE_MOT_DE_PASSE doit faire au moins 12 caractères.')
  }

  const { data: existant } = await supabase
    .from('profils')
    .select('id')
    .eq('identifiant', identifiant)
    .maybeSingle()

  if (existant) {
    console.log(`Le compte racine « ${identifiant} » existe déjà (${existant.id}). Rien à faire.`)
    return
  }

  // Aucun profil : vérifier qu'il n'existe pas déjà un compte auth orphelin, laissé par
  // une exécution précédente interrompue avant ou pendant son nettoyage. Sans ce contrôle,
  // admin.createUser échouerait sur un doublon d'email, sans indiquer que faire.
  const emailCible = identifiantVersEmail(identifiant)
  const { data: listeUtilisateurs, error: erreurListe } = await supabase.auth.admin.listUsers()
  if (erreurListe) {
    throw new Error(`Vérification des comptes d'authentification existants impossible : ${erreurListe.message}`)
  }
  const compteOrphelin = listeUtilisateurs.users.find((utilisateur) => utilisateur.email === emailCible)
  if (compteOrphelin) {
    console.log(
      `Le compte d'authentification « ${identifiant} » (${compteOrphelin.id}) existe déjà sans fiche profil. ` +
        `Une exécution précédente a probablement échoué après la création du compte auth mais avant celle du ` +
        `profil. Aucune écriture n'a été effectuée. Supprimez manuellement ce compte d'authentification avant de ` +
        `relancer ce script, ou créez sa fiche profil vous-même si vous savez qu'il est valide.`,
    )
    return
  }

  const { data: creation, error: erreurAuth } = await supabase.auth.admin.createUser({
    email: emailCible,
    password: motDePasse,
    // Indispensable : l'adresse est interne et ne pourra jamais être confirmée par email.
    email_confirm: true,
    app_metadata: { doit_changer_mdp: true },
  })
  if (erreurAuth || !creation.user) {
    throw new Error(`Création du compte auth impossible : ${erreurAuth?.message}`)
  }

  await etapeCritique(supabase, creation.user.id, 'Création du profil impossible', async () =>
    supabase.from('profils').insert({
      id: creation.user.id,
      identifiant,
      nom_affichage: nomAffichage,
      est_racine: true,
    }),
  )

  await etapeCritique(supabase, creation.user.id, 'Attribution du rôle impossible', async () =>
    supabase.from('roles_profil').insert({ profil_id: creation.user.id, role: 'administrateur' }),
  )

  console.log(`Compte racine « ${identifiant} » créé. Le mot de passe devra être changé à la première connexion.`)
}

principal().catch((erreur) => {
  console.error(erreur instanceof Error ? erreur.message : erreur)
  process.exit(1)
})
