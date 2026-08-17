import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { identifiantVersEmail } from '@/lib/domaine/identifiant'

/**
 * Phase 8, D149 / D154 / D155 — les preuves du rôle « leader » CÔTÉ BASE.
 *
 * ═══ CE QUE CETTE SUITE ÉPROUVE, ET CE QU'ELLE N'ÉPROUVE PAS ═══
 * Ici : que la valeur d'énumération existe, que `public.definir_roles` sait l'écrire et la
 * retirer, qu'elle se cumule avec les autres rôles, et qu'AUCUNE SURCHARGE de la passerelle
 * ne subsiste après le changement de signature.
 *
 * PAS ici : ce que le rôle DONNE. L'autorité du leader se décide entièrement côté
 * application, dans `peutModifier` — aucune politique RLS ne la connaît (D151). Elle est
 * éprouvée par `src/lib/domaine/arbre.test.ts` (fonction pure) et par
 * `tests/e2e/leader.spec.ts` (pouvoir réel sur un statut).
 *
 * Fixtures et balayage repris de `tests/rls/comptes.test.ts`.
 */

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const CLE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

const MDP = `Test-${crypto.randomUUID()}`
const IDENT_LEADER = 'test.rls.leader.porteur'

const admin = createClient(URL, CLE_SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
})

let idLeader: string

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

/** Rôles réellement portés par le compte de test, lus à la clé de service. */
async function rolesDe(profilId: string): Promise<string[]> {
  const { data, error } = await admin.from('roles_profil').select('role').eq('profil_id', profilId)
  if (error) throw new Error(`lecture des rôles impossible : ${error.message}`)
  return (data ?? []).map((ligne) => ligne.role as string)
}

beforeAll(async () => {
  await supprimerCompte(IDENT_LEADER)

  const { data, error } = await admin.auth.admin.createUser({
    email: identifiantVersEmail(IDENT_LEADER),
    password: MDP,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`création du compte impossible : ${error?.message}`)
  idLeader = data.user.id

  const { error: erreurProfil } = await admin
    .from('profils')
    .insert({ id: idLeader, identifiant: IDENT_LEADER, nom_affichage: 'Test leader' })
  if (erreurProfil) {
    await admin.auth.admin.deleteUser(idLeader)
    throw new Error(`insertion du profil impossible : ${erreurProfil.message}`)
  }
})

afterAll(async () => {
  await supprimerCompte(IDENT_LEADER)

  // Nettoyage VÉRIFIÉ, et `error` contrôlé : sur un échec de lecture, `data` vaut `null` et
  // une assertion permissive ferait passer la panne pour un nettoyage réussi.
  const { data, error } = await admin
    .from('profils')
    .select('id')
    .eq('identifiant', IDENT_LEADER)
  expect(error).toBeNull()
  expect(data).toHaveLength(0)
})

describe("la valeur d'énumération (D149)", () => {
  it("accepte 'leader' dans roles_profil", async () => {
    const { error } = await admin
      .from('roles_profil')
      .insert({ profil_id: idLeader, role: 'leader' })
    expect(error).toBeNull()
    expect(await rolesDe(idLeader)).toEqual(['leader'])

    // On repart d'un compte sans rôle pour le bloc suivant.
    await admin.from('roles_profil').delete().eq('profil_id', idLeader)
  })

  it('refuse toujours une valeur inconnue', async () => {
    // CONTRÔLE POSITIF de la preuve précédente : sans lui, elle passerait aussi si la
    // colonne avait cessé d'être une énumération et acceptait n'importe quel texte.
    const { error } = await admin
      .from('roles_profil')
      .insert({ profil_id: idLeader, role: 'gourou' })
    expect(error).not.toBeNull()
    expect(await rolesDe(idLeader)).toEqual([])
  })
})

describe('definir_roles avec p_leader (D154)', () => {
  it('attribue le rôle leader', async () => {
    const { error } = await admin.rpc('definir_roles', {
      p_profil: idLeader,
      p_administrateur: false,
      p_moderateur: false,
      p_leader: true,
    })
    expect(error).toBeNull()
    expect(await rolesDe(idLeader)).toEqual(['leader'])
  })

  it('cumule leader et modérateur — les rôles sont cumulables', async () => {
    const { error } = await admin.rpc('definir_roles', {
      p_profil: idLeader,
      p_administrateur: false,
      p_moderateur: true,
      p_leader: true,
    })
    expect(error).toBeNull()
    expect(new Set(await rolesDe(idLeader))).toEqual(new Set(['moderateur', 'leader']))
  })

  it("ne refuse RIEN sur le dernier leader : ce garde ne concerne que l'administrateur (D155)", async () => {
    // Un projet sans leader fonctionne exactement comme aujourd'hui. Retirer le rôle au seul
    // leader du projet doit donc réussir — à la différence du dernier administrateur actif.
    const { error } = await admin.rpc('definir_roles', {
      p_profil: idLeader,
      p_administrateur: false,
      p_moderateur: false,
      p_leader: false,
    })
    expect(error).toBeNull()
    expect(await rolesDe(idLeader)).toEqual([])
  })

  it("AUCUNE SURCHARGE NE SUBSISTE : l'ancienne signature à trois paramètres n'existe plus", async () => {
    // ═══ LA PREUVE QUE LE `drop` A EU LIEU, ET ELLE EST PERMANENTE ═══
    // `create or replace function` ne peut pas changer une signature. Sans `drop`, les deux
    // fonctions coexisteraient : PostgREST choisirait l'ANCIENNE pour tout appelant ne
    // passant pas `p_leader`, et une case « Leader » cochée resterait SANS EFFET, EN
    // SILENCE — sans faire tomber aucune autre preuve de ce fichier, puisqu'elles passent
    // toutes `p_leader` désormais.
    const { error } = await admin.rpc('definir_roles', {
      p_profil: idLeader,
      p_administrateur: false,
      p_moderateur: false,
    })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('PGRST202')
  })
})
