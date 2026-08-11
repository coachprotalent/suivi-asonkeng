import { createClient } from '@supabase/supabase-js'
import { identifiantVersEmail, normaliserIdentifiant } from '../src/lib/domaine/identifiant'

function requis(nom: string): string {
  const valeur = process.env[nom]
  if (!valeur) {
    throw new Error(`Variable d'environnement manquante : ${nom}`)
  }
  return valeur
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

  const { data: creation, error: erreurAuth } = await supabase.auth.admin.createUser({
    email: identifiantVersEmail(identifiant),
    password: motDePasse,
    // Indispensable : l'adresse est interne et ne pourra jamais être confirmée par email.
    email_confirm: true,
    app_metadata: { doit_changer_mdp: true },
  })
  if (erreurAuth || !creation.user) {
    throw new Error(`Création du compte auth impossible : ${erreurAuth?.message}`)
  }

  const { error: erreurProfil } = await supabase.from('profils').insert({
    id: creation.user.id,
    identifiant,
    nom_affichage: nomAffichage,
    est_racine: true,
  })
  if (erreurProfil) {
    // Ne pas laisser un compte auth orphelin derrière soi.
    await supabase.auth.admin.deleteUser(creation.user.id)
    throw new Error(`Création du profil impossible : ${erreurProfil.message}`)
  }

  const { error: erreurRole } = await supabase
    .from('roles_profil')
    .insert({ profil_id: creation.user.id, role: 'administrateur' })
  if (erreurRole) {
    await supabase.auth.admin.deleteUser(creation.user.id)
    throw new Error(`Attribution du rôle impossible : ${erreurRole.message}`)
  }

  console.log(`Compte racine « ${identifiant} » créé. Le mot de passe devra être changé à la première connexion.`)
}

principal().catch((erreur) => {
  console.error(erreur instanceof Error ? erreur.message : erreur)
  process.exit(1)
})
