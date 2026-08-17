import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * ═══ POURQUOI CE MODULE EXISTE (phase 8, D157) ═══
 *
 * `demandes_membre.demandeur_profil_id` était en `on delete cascade`. Supprimer un compte de
 * test effaçait donc ses demandes, et la cascade `notifications.demande_id` emportait avec
 * elles les notifications correspondantes — **y compris celles écrites sur les VRAIS comptes
 * administrateur** par `notifierAdministrateurs`. Cinq suites s'appuyaient sur cet
 * enchaînement pour se nettoyer, l'une d'elles en le documentant explicitement.
 *
 * La phase 8 a fait passer cette clé en `on delete set null`, pour qu'une demande survive à la
 * suppression de son auteur (D157). C'est le bon comportement métier, et il a un prix : **les
 * suites doivent désormais supprimer leurs demandes ELLES-MÊMES**.
 *
 * ═══ CE QUE LE PREMIER PASSAGE A COÛTÉ, ET QUI JUSTIFIE UN MODULE PARTAGÉ ═══
 * Sans cette fonction, la première exécution complète après le changement a laissé **23
 * demandes orphelines** — les deux clés étrangères à `null`, donc introuvables par aucun
 * identifiant — et **22 notifications sur les comptes `aubinaso` et `racine`**. Elles n'ont
 * été retrouvables que par `demandeur_nom_affichage`, la colonne ajoutée par la même phase.
 *
 * ═══ L'ORDRE EST LA SEULE CHOSE QUI COMPTE ICI ═══
 * Cette fonction doit être appelée **AVANT** la suppression des comptes et **AVANT** celle des
 * fiches membres. Une fois le compte supprimé, `demandeur_profil_id` vaut `null` ; une fois la
 * fiche supprimée, `membre_id` vaut `null` — et la ligne devient inatteignable. Appelée trop
 * tard, elle ne trouve plus rien et ne signale rien.
 *
 * Placé à la racine de `tests/`, comme `tests/confirmation.ts` : il sert les deux projets
 * Playwright et les suites Vitest, `testDir` ne restreignant que la découverte des fichiers de
 * test, jamais les imports.
 */
export async function supprimerDemandesDesProfils(
  admin: SupabaseClient,
  profilIds: readonly string[],
): Promise<void> {
  const ids = profilIds.filter((id) => typeof id === 'string' && id.length > 0)
  if (ids.length === 0) {
    // `.in('demandeur_profil_id', [])` interrogerait la base pour une réponse déjà connue.
    return
  }
  const { error } = await admin.from('demandes_membre').delete().in('demandeur_profil_id', ids)
  if (error) {
    // On LÈVE : un nettoyage qui échoue en silence laisse une pollution que plus rien ne
    // retrouvera, et qui atterrit sur des comptes de production.
    throw new Error(`nettoyage des demandes impossible : ${error.message}`)
  }
}

/**
 * Variante par IDENTIFIANT de compte, pour le nettoyage de RATTRAPAGE en `beforeAll` : à ce
 * moment-là, une exécution précédente interrompue a pu laisser des comptes dont on ne connaît
 * pas les identifiants techniques, mais dont les identifiants de connexion sont stables.
 *
 * ⚠️ ELLE NE RATTRAPE PAS UNE DEMANDE DÉJÀ ORPHELINE. Si l'exécution précédente a supprimé
 * ses comptes avant ses demandes, celles-ci n'ont plus de `demandeur_profil_id` et aucune clé
 * ne les désigne. C'est précisément ce que l'appel en `afterAll`, dans le bon ordre, existe
 * pour empêcher.
 */
export async function supprimerDemandesDesIdentifiants(
  admin: SupabaseClient,
  identifiants: readonly string[],
): Promise<void> {
  if (identifiants.length === 0) return
  const { data, error } = await admin
    .from('profils')
    .select('id')
    .in('identifiant', identifiants as string[])
  if (error) {
    throw new Error(`lecture des profils à nettoyer impossible : ${error.message}`)
  }
  await supprimerDemandesDesProfils(
    admin,
    (data ?? []).map((ligne) => ligne.id as string),
  )
}
