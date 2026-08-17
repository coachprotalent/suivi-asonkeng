import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { identifiantVersEmail } from '@/lib/domaine/identifiant'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const CLE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const CLE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Tiré à chaque exécution : un mot de passe fixe dans un dépôt public ouvrirait tout
// compte de test qu'une exécution interrompue aurait laissé derrière elle.
const MDP = `Test-${crypto.randomUUID()}`
const PREFIXE_TEST = 'test.rls.comptes.'
const IDENT_ADMIN_A = `${PREFIXE_TEST}admina`
const IDENT_ADMIN_B = `${PREFIXE_TEST}adminb`
const IDENT_SIMPLE = `${PREFIXE_TEST}simple`

const admin = createClient(URL, CLE_SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
})

let idAdminA: string
let idAdminB: string
let idSimple: string
let clientSimple: SupabaseClient

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

async function creerCompte(identifiant: string, nomAffichage: string, administrateur: boolean): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email: identifiantVersEmail(identifiant),
    password: MDP,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`création du compte ${identifiant} impossible : ${error?.message}`)
  const id = data.user.id

  const { error: erreurProfil } = await admin.from('profils').insert({ id, identifiant, nom_affichage: nomAffichage })
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

// PIÈGE (signalé dans le brief de la Task 12) : `prive.compter_administrateurs_actifs`
// compte TOUS les administrateurs actifs de la base, y compris les comptes réels — pas
// seulement ceux créés par ce fichier. Le compte racine réel de ce projet est un
// administrateur actif PERMANENT, jamais touché par ces tests (interdiction absolue du
// brief). Tant qu'il subsiste, le nombre d'administrateurs actifs EXCLUANT une cible ne
// peut donc jamais tomber à zéro, quel que soit le nombre de comptes de test créés ici :
// aucune combinaison de idAdminA/idAdminB ne peut mettre `definir_roles`/
// `definir_actif_compte` en situation de refuser réellement, sans désactiver ce compte
// réel — ce qui est exclu par construction.
//
// Mesuré ICI, avant d'écrire les tests, comme demandé : ce nombre décide si les deux
// tests de refus « dernier administrateur » peuvent réellement observer un refus, ou
// doivent être neutralisés (et le rester tant qu'un administrateur réel existe) plutôt
// que de prétendre prouver un refus qui ne s'est pas produit.
const { data: lignesRoleAdmin } = await admin.from('roles_profil').select('profil_id').eq('role', 'administrateur')
const idsRoleAdmin = (lignesRoleAdmin ?? []).map((l) => l.profil_id)
const { data: profilsRoleAdmin } = idsRoleAdmin.length
  ? await admin.from('profils').select('actif, identifiant').in('id', idsRoleAdmin)
  : { data: [] }
const ADMINS_REELS_ACTIFS = (profilsRoleAdmin ?? []).filter(
  (p) => p.actif && !p.identifiant.startsWith('test.'),
).length

beforeAll(async () => {
  await supprimerCompte(IDENT_ADMIN_A)
  await supprimerCompte(IDENT_ADMIN_B)
  await supprimerCompte(IDENT_SIMPLE)

  idAdminA = await creerCompte(IDENT_ADMIN_A, 'Test comptes admin A', true)
  idAdminB = await creerCompte(IDENT_ADMIN_B, 'Test comptes admin B', true)
  idSimple = await creerCompte(IDENT_SIMPLE, 'Test comptes simple', false)

  clientSimple = createClient(URL, CLE_ANON, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error: erreurConnexion } = await clientSimple.auth.signInWithPassword({
    email: identifiantVersEmail(IDENT_SIMPLE),
    password: MDP,
  })
  if (erreurConnexion) throw new Error(`connexion impossible : ${erreurConnexion.message}`)
})

afterAll(async () => {
  await supprimerCompte(IDENT_ADMIN_A)
  await supprimerCompte(IDENT_ADMIN_B)
  await supprimerCompte(IDENT_SIMPLE)
})

describe('protection du dernier administrateur', () => {
  it("laisse rétrograder un administrateur tant qu'il en reste un autre", async () => {
    const { error } = await admin.rpc('definir_roles', {
      p_profil: idAdminA,
      p_administrateur: false,
      p_moderateur: false,
      // Phase 8, D154 : la passerelle n'a plus qu'UNE signature, à quatre paramètres.
      p_leader: false,
    })
    expect(error).toBeNull()

    // État final, pas seulement l'absence d'erreur : un appel sans effet (bug qui
    // ferait silencieusement un no-op) passerait aussi `expect(error).toBeNull()`.
    const { data } = await admin.from('roles_profil').select('role').eq('profil_id', idAdminA)
    expect(data?.map((l) => l.role)).not.toContain('administrateur')
  })

  // NON PROUVÉ ICI : que `definir_roles` refuse effectivement de rétrograder le
  // dernier administrateur actif. Ce test-là ne s'exécute pas dans cet environnement,
  // pour la raison suivante, pas par prudence.
  //
  // POURQUOI C'EST IMPOSSIBLE ICI : `prive.compter_administrateurs_actifs` compte TOUS
  // les administrateurs actifs de la base entière, pas seulement ceux créés par ce
  // fichier. Le compte racine réel de ce projet est un administrateur actif en
  // permanence, et il est intouchable (interdiction absolue du brief : jamais le
  // désactiver ni le rétrograder, même temporairement). Donc, quel que soit le nombre
  // de comptes de test créés ou rétrogradés ici, le compteur hors-cible ne peut jamais
  // descendre à zéro : `compter_administrateurs_actifs(cible) = 1 (racine) + (admins
  // de test actifs, hors cible) >= 1`, toujours. Le refus « dernier administrateur »
  // ne peut donc jamais se déclencher via l'API publique dans cet environnement.
  //
  // CE QUI A ÉTÉ MESURÉ : le bloc de refus retiré directement de `definir_roles` en
  // base (`create or replace function` sans le `if not p_administrateur ... raise`),
  // suite RLS rejouée : AUCUN test n'a changé de statut (63 verts, 2 neutralisés,
  // avant et après la mutation, à l'identique). C'est la preuve, pas une supposition :
  // ces deux tests-ci sont les deux seuls capables de détecter cette mutation, et ils
  // sont neutralisés dans cet environnement — donc rien, aujourd'hui, ne détecterait
  // la disparition de cette protection. Détail dans task-12-report.md, §6.
  //
  // CONSÉQUENCE SI L'INVARIANT DEVENAIT FAUX : deux administrateurs qui se
  // rétrogradent au même instant se verraient chacun l'un l'autre comme un
  // administrateur restant et passeraient tous les deux (lire-puis-écrire sans
  // verrou) — ou, plus simplement ici, un bug qui supprimerait purement et simplement
  // ce bloc laisserait rétrograder n'importe quel administrateur sans limite. Dans les
  // deux cas : plus aucun administrateur actif, et aucun moyen d'en recréer un depuis
  // l'application (spec §7).
  //
  // CE QUI RENDRAIT CE TEST EXÉCUTABLE : une base sans aucun administrateur réel actif
  // — c'est-à-dire `ADMINS_REELS_ACTIFS === 0` au moment de l'exécution.
  //
  // LA CONDITION EST RECALCULÉE À CHAQUE EXÉCUTION, PAS FIGÉE : `ADMINS_REELS_ACTIFS`
  // est mesurée par une vraie requête en tête de ce fichier (voir plus haut), pas une
  // constante ni un booléen codé en dur. Ces deux tests ne sont pas supprimés : ils
  // sont EN ATTENTE d'un environnement qui permette de les jouer, et s'y réactiveront
  // d'eux-mêmes, sans qu'il soit nécessaire de modifier ce fichier.
  it.skipIf(ADMINS_REELS_ACTIFS > 0)('refuse de rétrograder le dernier administrateur actif', async () => {
    const { error } = await admin.rpc('definir_roles', {
      p_profil: idAdminB,
      p_administrateur: false,
      p_moderateur: false,
      // Phase 8, D154 : la passerelle n'a plus qu'UNE signature, à quatre paramètres.
      p_leader: false,
    })
    expect(error).not.toBeNull()
    expect(error?.details).toBe('dernier_administrateur')

    // Et vérifier qu'il est TOUJOURS administrateur : un refus qui aurait quand même
    // écrit serait le pire des cas.
    const { data } = await admin.from('roles_profil').select('role').eq('profil_id', idAdminB)
    expect(data?.map((l) => l.role)).toContain('administrateur')
  })

  // Même situation, même raison, que le test ci-dessus (voir le bloc de commentaire
  // au-dessus) : appliquée ici à `definir_actif_compte` plutôt qu'à `definir_roles`.
  // Non prouvé ici pour la même raison arithmétique, se réactivera d'elle-même dans
  // les mêmes conditions.
  it.skipIf(ADMINS_REELS_ACTIFS > 0)('refuse de désactiver le compte du dernier administrateur actif', async () => {
    const { error } = await admin.rpc('definir_actif_compte', {
      p_profil: idAdminB,
      p_actif: false,
    })
    expect(error).not.toBeNull()
    expect(error?.details).toBe('dernier_administrateur')
  })

  // CONTRÔLE POSITIF : sans lui, les deux refus ci-dessus seraient satisfaits par une
  // passerelle qui refuse tout.
  it('laisse désactiver un compte ordinaire', async () => {
    const { error } = await admin.rpc('definir_actif_compte', { p_profil: idSimple, p_actif: false })
    expect(error).toBeNull()

    // État final, pas seulement l'absence d'erreur : un appel sans effet passerait
    // aussi ce contrôle si on ne vérifiait que `error`.
    const { data } = await admin.from('profils').select('actif').eq('id', idSimple).single()
    expect(data?.actif).toBe(false)

    await admin.rpc('definir_actif_compte', { p_profil: idSimple, p_actif: true })
  })

  it("ne refuse rien quand on retire un rôle que le compte n'a pas", async () => {
    // AVERTISSEMENT DE MÊME NATURE, MÊME CAUSE RACINE que les deux tests neutralisés
    // ci-dessus — repéré par une relecture, pas vu à la première écriture de ce
    // fichier : CE TEST NE DISCRIMINE PAS la clause `exists`, contrairement à ce
    // qu'affirmait la version précédente de ce commentaire.
    //
    // La condition complète du refus est `not p_administrateur AND exists(rôle
    // administrateur actuel) AND compter_administrateurs_actifs(cible) = 0`. Dans cet
    // environnement, `compter_administrateurs_actifs` n'est JAMAIS égal à 0 (voir le
    // commentaire au-dessus de `ADMINS_REELS_ACTIFS` et le premier test neutralisé
    // plus haut) : ce seul facteur suffit à rendre toute la conjonction fausse, AVEC
    // OU SANS la clause `exists`. Si on supprimait cette clause, l'inversait, ou la
    // remplaçait par `true`, ce test passerait quand même — il ne prouve donc PAS que
    // `exists` protège idSimple ; il prouve seulement qu'aucun refus n'a lieu ici, ce
    // qui serait vrai de toute façon dans cet environnement.
    //
    // La preuve par mutation (rapport, §6) ne pouvait pas révéler ce défaut : elle
    // retire le bloc ENTIER (`exists` et comptage ensemble), donc elle ne dit rien du
    // pouvoir discriminant de la clause `exists` prise isolément.
    //
    // La clause SQL elle-même reste correcte et nécessaire en production — sans elle,
    // un compte ordinaire deviendrait immodifiable dès qu'il ne reste plus qu'un
    // administrateur. C'est sa VÉRIFICATION qui est absente ici, pas son
    // implémentation : même limite, même cause, que la protection du dernier
    // administrateur elle-même (voir le premier test neutralisé plus haut).
    const { error } = await admin.rpc('definir_roles', {
      p_profil: idSimple,
      p_administrateur: false,
      p_moderateur: true,
      // Phase 8, D154 : la passerelle n'a plus qu'UNE signature, à quatre paramètres.
      p_leader: false,
    })
    expect(error).toBeNull()

    // État final, pas seulement l'absence d'erreur — utile même si ça ne prouve pas
    // la clause `exists` (voir avertissement ci-dessus) : un appel sans effet
    // passerait aussi `expect(error).toBeNull()` seul.
    const { data } = await admin.from('roles_profil').select('role').eq('profil_id', idSimple)
    const roles = data?.map((l) => l.role) ?? []
    expect(roles).toContain('moderateur')
    expect(roles).not.toContain('administrateur')
  })

  it('refuse son exécution à un compte authentifié ordinaire', async () => {
    const { error } = await clientSimple.rpc('definir_roles', {
      p_profil: idSimple,
      p_administrateur: true,
      p_moderateur: false,
      // Phase 8, D154 : la passerelle n'a plus qu'UNE signature, à quatre paramètres.
      p_leader: false,
    })
    expect(error).not.toBeNull()
    expect(error?.code).toBe('42501')
  })

  // `definir_actif_compte` n'avait aucun test de ce genre, alors que sa fonction
  // sœur `definir_roles` (ci-dessus) en a un — même modèle.
  it('refuse son exécution de definir_actif_compte à un compte authentifié ordinaire', async () => {
    const { error } = await clientSimple.rpc('definir_actif_compte', {
      p_profil: idSimple,
      p_actif: false,
    })
    expect(error).not.toBeNull()
    expect(error?.code).toBe('42501')
  })
})
