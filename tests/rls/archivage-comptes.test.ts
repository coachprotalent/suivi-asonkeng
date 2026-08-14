import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { identifiantVersEmail } from '@/lib/domaine/identifiant'

// D24 : archiver une fiche désactive le compte de connexion qui lui est lié (déclencheur
// `membres_archivage_desactive_compte`, migration 20260814160000). Ce fichier est
// distinct de `comptes.test.ts` (rôles et activation par les passerelles) et de
// `arbre.test.ts` (arborescence et archivage des faiseurs de disciple) : il éprouve
// spécifiquement le CROISEMENT entre les deux — archiver une fiche membre et son effet
// sur le compte lié — qu'aucun des deux autres fichiers ne couvre.

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const CLE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

const MDP = `Test-${crypto.randomUUID()}`
const PREFIXE_COMPTE = 'test.rls.archcpt.'
// IMPORTANT 3 de la revue de la Task 19 — LE BALAYAGE I6 S'ETAIT ARRÊTÉ À `tests/e2e/`.
// Les tests RLS écrivent dans LES MÊMES TABLES, sur la MÊME base (qui sert aussi de
// production), et reproduisaient le défaut à l'identique : le préfixe balayé embarquait
// l'UUID tiré PAR EXÉCUTION, si bien qu'une suite interrompue laissait des lignes que
// PLUS RIEN ne retrouvait — ni cette exécution-ci, qui ne connaît que son propre
// suffixe, ni aucune autre. Même remède que I6 : une partie STABLE (`FAMILLE_*`) sert au
// balayage de RATTRAPAGE, la partie aléatoire ne distingue plus que les noms individuels
// de CETTE exécution.
const FAMILLE_MEMBRE = 'ZZArchivageComptes-'
const PREFIXE_MEMBRE = `${FAMILLE_MEMBRE}${crypto.randomUUID().slice(0, 8)}`

const IDENT_ORDINAIRE = `${PREFIXE_COMPTE}ordinaire`
const IDENT_ADMIN_A = `${PREFIXE_COMPTE}admina`
const IDENT_ADMIN_B = `${PREFIXE_COMPTE}adminb`
const IDENT_DEJA_INACTIF = `${PREFIXE_COMPTE}dejainactif`

const admin = createClient(URL, CLE_SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function creerMembre(nom: string): Promise<string> {
  const { data, error } = await admin
    .from('membres')
    .insert({ nom: `${PREFIXE_MEMBRE}-${nom}`, prenom: 'Test' })
    .select('id')
    .single()
  if (error || !data) throw new Error(`création du membre ${nom} impossible : ${error?.message}`)
  return data.id as string
}

async function supprimerCompte(identifiant: string) {
  const { data } = await admin.from('profils').select('id').eq('identifiant', identifiant).maybeSingle()
  if (data) {
    await admin.auth.admin.deleteUser(data.id)
    return
  }
  const { data: comptes } = await admin.auth.admin.listUsers()
  const orphelin = comptes?.users.find((u) => u.email === identifiantVersEmail(identifiant))
  if (orphelin) await admin.auth.admin.deleteUser(orphelin.id)
}

async function creerCompte(
  identifiant: string,
  administrateur: boolean,
  membreId: string | null,
): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email: identifiantVersEmail(identifiant),
    password: MDP,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`création du compte ${identifiant} impossible : ${error?.message}`)
  const id = data.user.id

  const { error: erreurProfil } = await admin
    .from('profils')
    .insert({ id, identifiant, nom_affichage: `Test ${identifiant}`, membre_id: membreId })
  if (erreurProfil) {
    await admin.auth.admin.deleteUser(id)
    throw new Error(`insertion du profil ${identifiant} impossible : ${erreurProfil.message}`)
  }

  if (administrateur) {
    const { error: erreurRole } = await admin.from('roles_profil').insert({ profil_id: id, role: 'administrateur' })
    if (erreurRole) {
      await admin.auth.admin.deleteUser(id)
      throw new Error(`attribution du rôle administrateur à ${identifiant} impossible : ${erreurRole.message}`)
    }
  }

  return id
}

async function nettoyer() {
  for (const identifiant of [IDENT_ORDINAIRE, IDENT_ADMIN_A, IDENT_ADMIN_B, IDENT_DEJA_INACTIF]) {
    await supprimerCompte(identifiant)
  }
  await admin.from('membres').delete().like('nom', `${FAMILLE_MEMBRE}%`)
}

// MÊME PIÈGE, MÊME MESURE que `tests/rls/comptes.test.ts` (Task 12 de la phase 1c) :
// `prive.compter_administrateurs_actifs` compte TOUS les administrateurs actifs de la
// base, y compris le compte racine réel — intouchable par construction (interdiction
// absolue du brief). Tant qu'il subsiste, le nombre d'administrateurs actifs EXCLUANT
// une cible ne peut jamais tomber à zéro : le refus « dernier administrateur » ne peut
// donc pas se déclencher via l'API publique dans cet environnement. Voir
// `tests/rls/comptes.test.ts` pour le détail du raisonnement — il est identique ici,
// appliqué au déclencheur `membres_archivage_desactive_compte` plutôt qu'à
// `definir_roles` / `definir_actif_compte`.
const { data: lignesRoleAdmin } = await admin.from('roles_profil').select('profil_id').eq('role', 'administrateur')
const idsRoleAdmin = (lignesRoleAdmin ?? []).map((l) => l.profil_id)
const { data: profilsRoleAdmin } = idsRoleAdmin.length
  ? await admin.from('profils').select('actif, identifiant').in('id', idsRoleAdmin)
  : { data: [] }
const ADMINS_REELS_ACTIFS = (profilsRoleAdmin ?? []).filter(
  (p) => p.actif && !p.identifiant.startsWith('test.'),
).length

let idMembreOrdinaire: string
let idMembreAdminA: string
let idMembreAdminB: string
let idMembreDejaInactif: string
let idCompteOrdinaire: string
let idCompteAdminA: string
let idCompteAdminB: string
let idCompteDejaInactif: string

beforeAll(async () => {
  await nettoyer()

  idMembreOrdinaire = await creerMembre('ordinaire')
  idMembreAdminA = await creerMembre('admin-a')
  idMembreAdminB = await creerMembre('admin-b')
  idMembreDejaInactif = await creerMembre('deja-inactif')

  idCompteOrdinaire = await creerCompte(IDENT_ORDINAIRE, false, idMembreOrdinaire)
  idCompteAdminA = await creerCompte(IDENT_ADMIN_A, true, idMembreAdminA)
  idCompteAdminB = await creerCompte(IDENT_ADMIN_B, true, idMembreAdminB)
  idCompteDejaInactif = await creerCompte(IDENT_DEJA_INACTIF, false, idMembreDejaInactif)
  const { error: erreurDesactivation } = await admin
    .from('profils')
    .update({ actif: false })
    .eq('id', idCompteDejaInactif)
  if (erreurDesactivation) {
    throw new Error(`désactivation préalable impossible : ${erreurDesactivation.message}`)
  }
})

afterAll(async () => {
  await nettoyer()
  // Nettoyage VÉRIFIÉ PAR COMPTAGE, sur la FAMILLE (voir l'encadré du préfixe).
  const { count, error } = await admin
    .from('membres')
    .select('id', { count: 'exact', head: true })
    .like('nom', `${FAMILLE_MEMBRE}%`)
  expect(error).toBeNull()
  expect(count).toBe(0)
})

describe('archivage désactive le compte lié (D24)', () => {
  it('désactive le compte ordinaire actif lié à la fiche archivée', async () => {
    const { error } = await admin.from('membres').update({ etat: 'archive' }).eq('id', idMembreOrdinaire)
    expect(error).toBeNull()

    // État final relu en base, pas seulement l'absence d'erreur : un déclencheur qui
    // archiverait sans rien désactiver passerait aussi `expect(error).toBeNull()`.
    const { data } = await admin.from('profils').select('actif').eq('id', idCompteOrdinaire).single()
    expect(data?.actif).toBe(false)
  })

  // Le nom ne promet PAS « ne touche pas » : l'assertion (actif faux avant et après) est
  // satisfaite aussi bien par « n'a rien écrit » que par « a réécrit false sur false » —
  // il n'existe pas de colonne d'horodatage sur `profils` pour distinguer les deux. Ce
  // que ce test prouve réellement : archiver une fiche dont le compte est DÉJÀ inactif
  // n'échoue pas (silencieusement ou bruyamment) et ne réactive rien par erreur.
  it("n'échoue pas quand le compte lié est déjà désactivé", async () => {
    const { error } = await admin.from('membres').update({ etat: 'archive' }).eq('id', idMembreDejaInactif)
    expect(error).toBeNull()

    const { data } = await admin.from('profils').select('actif').eq('id', idCompteDejaInactif).single()
    expect(data?.actif).toBe(false)
  })

  // CONTRÔLE POSITIF : sans lui, les refus du bloc suivant seraient satisfaits par un
  // déclencheur qui refuserait TOUT archivage d'une fiche liée à un administrateur,
  // qu'il soit ou non le dernier — ce qui ne prouverait rien sur la discrimination
  // par le COMPTE des administrateurs actifs restants.
  it("laisse archiver la fiche d'un administrateur quand un autre administrateur actif subsiste", async () => {
    const { error } = await admin.from('membres').update({ etat: 'archive' }).eq('id', idMembreAdminA)
    expect(error).toBeNull()

    const { data } = await admin.from('profils').select('actif').eq('id', idCompteAdminA).single()
    expect(data?.actif).toBe(false)
  })

  // NON PROUVÉ ICI, pour la même raison arithmétique que `tests/rls/comptes.test.ts` :
  // voir le commentaire au-dessus de `ADMINS_REELS_ACTIFS` plus haut dans ce fichier.
  // `idCompteAdminB` est administrateur actif, mais `compter_administrateurs_actifs`
  // compte AUSSI le compte racine réel, intouchable : le nombre d'administrateurs
  // actifs hors `idCompteAdminB` ne peut donc jamais tomber à zéro dans cet
  // environnement, et ce refus ne peut pas se déclencher via l'API publique.
  //
  // CE QUI RENDRAIT CE TEST EXÉCUTABLE : une base sans aucun administrateur réel actif
  // (`ADMINS_REELS_ACTIFS === 0`, mesurée à l'exécution, pas figée). Il se réactivera
  // de lui-même dans cet environnement, sans modification de ce fichier.
  it.skipIf(ADMINS_REELS_ACTIFS > 0)(
    'refuse d\'archiver la fiche du dernier administrateur actif',
    async () => {
      const { error } = await admin.from('membres').update({ etat: 'archive' }).eq('id', idMembreAdminB)
      expect(error).not.toBeNull()
      expect(error?.details).toBe('dernier_administrateur')

      // Et rien n'a été touché : ni la fiche, ni le compte.
      const { data: fiche } = await admin.from('membres').select('etat').eq('id', idMembreAdminB).single()
      expect(fiche?.etat).toBe('actif')
      const { data: compte } = await admin.from('profils').select('actif').eq('id', idCompteAdminB).single()
      expect(compte?.actif).toBe(true)
    },
  )
})
