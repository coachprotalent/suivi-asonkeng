# Phase 8 — Rôle « leader » et suppression d'un compte — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un rôle « leader » qui donne autorité sur tous les membres, et permettre à un administrateur de supprimer un compte créé par erreur sans effacer l'historique des demandes.

**Architecture :** Deux lots indépendants. **A** ajoute une valeur d'énumération et un court-circuit dans une fonction pure — l'autorité se décide entièrement côté application, **aucune politique RLS n'est touchée**. **B** rend `demandes_membre` capable de survivre à son auteur, puis confie les refus de suppression à un **déclencheur `before delete`** que la cascade depuis `auth.users` déclenche dans la même transaction.

**Tech Stack :** Next.js 16.3 (App Router, Server Actions), React 19.2, TypeScript 6, Supabase (Postgres + RLS + PostgREST + GoTrue), Tailwind 4, Vitest, Playwright.

**Spécification :** `docs/superpowers/specs/2026-08-17-phase-8-role-leader-suppression-compte-design.md`. Les décisions D149–D163 y sont justifiées ; ce plan les applique sans les rouvrir.

## Global Constraints

- **`AGENTS.md` : ce n'est pas le Next.js habituel.** Lire le guide pertinent dans `node_modules/next/dist/docs/` avant d'écrire du code Next.
- **Aucune politique RLS n'est ajoutée ni modifiée par cette phase.** Ni pour le leader (D151), ni pour la suppression.
- **Toute page et toute Server Action commence par un garde** de `src/lib/securite/garde.ts`.
- **On discrimine les erreurs Postgres sur `error.code` et `error.details`, JAMAIS sur la prose.**
- **`error.details` n'est journalisé que s'il figure dans une liste fermée de marqueurs connus** — sur un 23514, Postgres y écrit `Failing row contains (…)`, la ligne entière.
- **Une écriture sans effet ne doit jamais passer pour un succès.**
- **Migrations additives uniquement.** Une migration déjà appliquée ne se réécrit pas.
- **Nommer les arguments de `rpc()`**, jamais de positionnel.
- **Langue :** tout le code, les commentaires et les messages sont en français.
- **Portes de test :** `npm test` à chaque commit ; `npm run test:rls` à la fin de chaque tâche SQL ; **`npm run test:e2e` (≈ 12 min) et `npm run build` une fois par lot**, aux tâches 5 et 9.

---

## Structure des fichiers

### Lot A — le rôle leader

| Action | Fichier | Responsabilité |
|--------|---------|----------------|
| Créer | `supabase/migrations/20260821100000_role_leader_enum.sql` | **Une seule instruction** (D149) |
| Créer | `supabase/migrations/20260821110000_definir_roles_leader.sql` | Remplacement de `definir_roles` (D154) |
| Modifier | `src/lib/donnees/profils.ts` | `RoleApp` gagne `'leader'` |
| Modifier | `src/lib/domaine/arbre.ts` | `ContexteAutorite.estLeader`, court-circuit (D150) |
| Modifier | `src/lib/domaine/arbre.test.ts` | Preuves du court-circuit |
| Modifier | `src/lib/securite/garde.ts` | `deciderAutorite` transmet le rôle |
| Modifier | `src/app/comptes/actions.ts` | `p_leader` |
| Modifier | `src/app/comptes/ligne-compte.tsx` | Troisième case, libellé |
| Modifier | `src/app/profil/page.tsx` | Libellé du rôle |
| Créer | `tests/rls/leader.test.ts` | Enum, `definir_roles`, absence de surcharge |
| Créer | `tests/e2e/leader.spec.ts` | Attribution, et pouvoir réel sur un statut |

### Lot B — la suppression d'un compte

| Action | Fichier | Responsabilité |
|--------|---------|----------------|
| Créer | `supabase/migrations/20260821120000_demandes_auteur_conserve.sql` | Colonne, clé étrangère, déclencheur, rattrapage (D157, D158) |
| Créer | `supabase/migrations/20260821130000_suppression_compte.sql` | Déclencheur `before delete` (D159, D160) |
| Modifier | `src/lib/donnees/comptes.ts` | `estDernierAdministrateurActif(profilId)` extraite |
| Modifier | `src/app/comptes/messages.ts` | Messages de refus |
| Modifier | `src/app/comptes/actions.ts` | `supprimerCompte` |
| Modifier | `src/app/comptes/ligne-compte.tsx` | Bouton + `Dialogue` |
| Créer | `tests/rls/suppression-compte.test.ts` | Les refus, la survie des demandes |
| Créer | `tests/e2e/suppression-compte.spec.ts` | Suppression confirmée |

---

# LOT A — LE RÔLE LEADER

### Task 1 : La valeur d'énumération

**Files:**
- Create: `supabase/migrations/20260821100000_role_leader_enum.sql`
- Create: `tests/rls/leader.test.ts`

**Interfaces:**
- Produces: la valeur `'leader'` du type `public.role_app`.

> ⚠️ **D149 — LE PIÈGE DE CETTE TÂCHE.** Postgres refuse d'**employer** une valeur d'énumération dans la transaction qui l'**ajoute**. `supabase db push` applique chaque fichier dans sa propre transaction : ce fichier ne doit donc contenir **QUE** l'`alter type`. Y ajouter le `definir_roles` de la tâche 2 produirait `unsafe use of new value "leader" of enum type role_app` **au déploiement**, pas à l'écriture.

- [ ] **Step 1: Écrire la migration**

Créer `supabase/migrations/20260821100000_role_leader_enum.sql` :

```sql
-- Phase 8, D149 — la valeur d'énumération, ET RIEN D'AUTRE DANS CE FICHIER.
--
-- ═══ POURQUOI CE FICHIER EST SEUL ═══
-- Postgres refuse d'EMPLOYER une valeur d'énumération dans la transaction qui l'AJOUTE :
-- « unsafe use of new value "leader" of enum type role_app ». `supabase db push` applique
-- chaque fichier de migration dans sa propre transaction — séparer l'ajout de son premier
-- usage est donc la seule forme qui fonctionne. La migration 20260821110000, qui insère
-- réellement des lignes portant ce rôle, est un fichier distinct POUR CETTE RAISON, et
-- les fusionner casserait le déploiement sans qu'aucune relecture ne le montre.
--
-- LE RÔLE LEADER EST UNE AUTORITÉ, PAS UNE PLACE DANS L'ARBRE (D150, lecture A retenue par
-- l'utilisateur) : aucune ligne de `public.membres` n'est touchée par cette phase. Il ne
-- confère AUCUN pouvoir de modérateur (§2 de la spec) et n'élargit AUCUNE lecture (D151) —
-- `prive.peut_lire_membre` et `prive.est_moderateur_ou_admin` restent inchangées.

alter type public.role_app add value 'leader';
```

- [ ] **Step 2: Écrire la preuve (elle doit échouer)**

Créer `tests/rls/leader.test.ts`. Reprendre les utilitaires de `tests/rls/comptes.test.ts` — connexion, création de comptes, balayage de famille, nettoyage vérifié par comptage.

```ts
import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { identifiantVersEmail } from '@/lib/domaine/identifiant'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const CLE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const admin = createClient(URL, CLE_SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const IDENT_LEADER = 'test.leader.porteur'
let idLeader: string

// … beforeAll : supprimer le compte s'il traîne, le créer, insérer son profil.
// … afterAll  : le supprimer, puis VÉRIFIER PAR COMPTAGE qu'il ne reste rien.

describe("la valeur d'énumération", () => {
  it("accepte 'leader' dans roles_profil", async () => {
    const { error } = await admin
      .from('roles_profil')
      .insert({ profil_id: idLeader, role: 'leader' })
    expect(error).toBeNull()
  })

  it("refuse toujours une valeur inconnue", async () => {
    // Contrôle POSITIF de la preuve précédente : sans lui, elle passerait aussi si la
    // colonne avait cessé d'être une énumération.
    const { error } = await admin
      .from('roles_profil')
      .insert({ profil_id: idLeader, role: 'gourou' })
    expect(error).not.toBeNull()
  })
})
```

- [ ] **Step 3: Lancer la preuve**

Run: `npm run test:rls -- leader`
Expected: FAIL — `invalid input value for enum role_app: "leader"`.

- [ ] **Step 4: Appliquer**

Run: `npx supabase db push`

- [ ] **Step 5: Relancer**

Run: `npm run test:rls -- leader`
Expected: PASS, les deux preuves.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260821100000_role_leader_enum.sql tests/rls/leader.test.ts
git commit -m "feat(base): ajouter la valeur d'énumération leader, seule dans sa migration"
```

---

### Task 2 : `definir_roles` accepte le leader

**Files:**
- Create: `supabase/migrations/20260821110000_definir_roles_leader.sql`
- Modify: `tests/rls/leader.test.ts`

**Interfaces:**
- Consumes: la valeur `'leader'` (Task 1).
- Produces: `public.definir_roles(uuid, boolean, boolean, boolean)` — **quatre** paramètres, `p_leader` en dernier.

> ⚠️ **D154 — MÊME PIÈGE QUE `creer_membre_enrichi` EN PHASE 7.** `create or replace function` ne peut pas changer une signature. Sans `drop`, une **surcharge** coexisterait, PostgREST choisirait l'ancienne pour tout appelant ne passant pas `p_leader`, et **une case « Leader » cochée resterait sans effet, en silence**. Les privilèges ne survivent pas au `drop` : le `revoke`/`grant` est obligatoire.

- [ ] **Step 1: Écrire les preuves (elles doivent échouer)**

Ajouter à `tests/rls/leader.test.ts` :

```ts
describe('definir_roles avec p_leader', () => {
  it('attribue le rôle leader', async () => {
    const { error } = await admin.rpc('definir_roles', {
      p_profil: idLeader,
      p_administrateur: false,
      p_moderateur: false,
      p_leader: true,
    })
    expect(error).toBeNull()
    const { data } = await admin.from('roles_profil').select('role').eq('profil_id', idLeader)
    expect((data ?? []).map((l) => l.role)).toEqual(['leader'])
  })

  it('retire le rôle leader', async () => {
    const { error } = await admin.rpc('definir_roles', {
      p_profil: idLeader,
      p_administrateur: false,
      p_moderateur: false,
      p_leader: false,
    })
    expect(error).toBeNull()
    const { data } = await admin.from('roles_profil').select('role').eq('profil_id', idLeader)
    expect(data ?? []).toEqual([])
  })

  it('cumule leader et modérateur — les rôles sont cumulables', async () => {
    const { error } = await admin.rpc('definir_roles', {
      p_profil: idLeader,
      p_administrateur: false,
      p_moderateur: true,
      p_leader: true,
    })
    expect(error).toBeNull()
    const { data } = await admin.from('roles_profil').select('role').eq('profil_id', idLeader)
    expect(new Set((data ?? []).map((l) => l.role))).toEqual(new Set(['moderateur', 'leader']))
  })

  it("AUCUNE SURCHARGE NE SUBSISTE : l'ancienne signature à trois paramètres n'existe plus (D154)", async () => {
    // ═══ LA PREUVE QUE LE `drop` A EU LIEU, ET ELLE EST PERMANENTE ═══
    // Sans `drop`, les deux fonctions coexisteraient et PostgREST choisirait l'ancienne
    // pour tout appelant ne passant pas `p_leader` — une case cochée resterait sans effet,
    // en silence, sans faire tomber aucune autre preuve de ce fichier.
    const { error } = await admin.rpc('definir_roles', {
      p_profil: idLeader,
      p_administrateur: false,
      p_moderateur: false,
    })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('PGRST202')
  })

  it("ne refuse RIEN sur le dernier leader : ce garde ne concerne que l'administrateur (D155)", async () => {
    // Un projet sans leader fonctionne exactement comme aujourd'hui. Retirer le rôle au
    // seul leader du projet doit donc réussir.
    const { error } = await admin.rpc('definir_roles', {
      p_profil: idLeader,
      p_administrateur: false,
      p_moderateur: false,
      p_leader: false,
    })
    expect(error).toBeNull()
  })
})
```

- [ ] **Step 2: Lancer les preuves**

Run: `npm run test:rls -- leader`
Expected: FAIL — `PGRST202`, la signature à quatre paramètres n'existe pas.

- [ ] **Step 3: Écrire la migration**

Créer `supabase/migrations/20260821110000_definir_roles_leader.sql`. **Recopier le corps de `20260814130000_passerelles_comptes.sql` à l'identique**, commentaires compris, en n'y changeant que ce qui est marqué « PHASE 8 ».

```sql
-- Phase 8, D154 — `definir_roles` accepte le troisième rôle.
--
-- MIGRATION ADDITIVE : 20260814130000 est déjà appliquée et ne se réécrit pas.
--
-- ═══ POURQUOI UN `drop` ET PAS UN `create or replace` ═══
-- `create or replace function` NE PEUT PAS changer une signature. Sans le `drop` ci-dessous,
-- cette migration créerait une SURCHARGE : les deux fonctions coexisteraient, PostgREST
-- choisirait l'ancienne pour tout appelant ne passant pas `p_leader`, et une case « Leader »
-- cochée resterait SANS EFFET, EN SILENCE. Les privilèges ne survivant pas au `drop`, le
-- `revoke`/`grant` en pied de fichier n'est pas décoratif : sans lui, l'écran des rôles
-- tomberait EN PRODUCTION sans que le déploiement ne signale rien. Même piège qu'en phase 7
-- sur `creer_membre_enrichi` (D135).
--
-- LE GARDE DU DERNIER ADMINISTRATEUR N'EST PAS ÉTENDU AU LEADER (D155) : il doit rester au
-- moins un administrateur actif, il n'a jamais à rester un leader. La condition ci-dessous
-- ne porte donc que sur `p_administrateur`, inchangée.

drop function if exists public.definir_roles(uuid, boolean, boolean);

create function public.definir_roles(
  p_profil uuid,
  p_administrateur boolean,
  p_moderateur boolean,
  p_leader boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- PREMIÈRE instruction. Clé (20260814, 2) = rôles et activation des comptes.
  perform pg_advisory_xact_lock(20260814, 2);

  perform 1 from public.profils p where p.id = p_profil for update;
  if not found then
    raise exception 'Compte inconnu.' using detail = 'compte_inconnu';
  end if;

  -- La condition porte sur l'état COURANT du profil visé : retirer un rôle qu'il n'a
  -- pas ne doit rien refuser. Sans cette clause `exists`, un compte ordinaire deviendrait
  -- impossible à modifier dès qu'il ne reste qu'un seul administrateur.
  if not p_administrateur
     and exists (
       select 1 from public.roles_profil r
       where r.profil_id = p_profil and r.role = 'administrateur'
     )
     and prive.compter_administrateurs_actifs(p_profil) = 0
  then
    raise exception 'Il doit rester au moins un administrateur actif.'
      using detail = 'dernier_administrateur';
  end if;

  delete from public.roles_profil where profil_id = p_profil;
  if p_administrateur then
    insert into public.roles_profil (profil_id, role) values (p_profil, 'administrateur');
  end if;
  if p_moderateur then
    insert into public.roles_profil (profil_id, role) values (p_profil, 'moderateur');
  end if;
  -- ═══ PHASE 8, D154 — SEULE ADDITION AU CORPS ═══
  if p_leader then
    insert into public.roles_profil (profil_id, role) values (p_profil, 'leader');
  end if;
end;
$$;

comment on function public.definir_roles(uuid, boolean, boolean, boolean) is
  'Rôles d''un compte, écrits sous verrou consultatif sérialisé (clé 20260814,2) : la protection du dernier administrateur est un lire-puis-écrire, et deux administrateurs se rétrogradant simultanément passeraient tous les deux sans lui. Étendue en phase 8 (D154) au rôle leader, qui donne autorité sur TOUS les membres sans conférer aucun pouvoir de modérateur ni élargir aucune lecture. LE GARDE DU DERNIER ADMINISTRATEUR NE PORTE QUE SUR p_administrateur (D155) : un projet sans leader est légitime. Lève avec detail = compte_inconnu ou dernier_administrateur. Exécution réservée à service_role.';

revoke execute on function public.definir_roles(uuid, boolean, boolean, boolean) from public, anon, authenticated;
grant execute on function public.definir_roles(uuid, boolean, boolean, boolean) to service_role;
```

- [ ] **Step 4: Appliquer et relancer**

Run: `npx supabase db push && npm run test:rls -- leader`
Expected: PASS, les sept preuves.

- [ ] **Step 5: Vérifier qu'aucun appelant n'est resté en arrière**

Run: `grep -rn "definir_roles" src/`
Expected: **un seul** appel, dans `src/app/comptes/actions.ts`, encore à trois paramètres — il sera corrigé à la tâche 4. **Le noter, ne pas le corriger ici** : `/comptes` est cassé entre cette tâche et la tâche 4, et c'est assumé sur une branche.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260821110000_definir_roles_leader.sql tests/rls/leader.test.ts
git commit -m "feat(base): definir_roles accepte le leader, signature refaite sans surcharge"
```

---

### Task 3 : L'autorité du leader, dans la fonction pure

**Files:**
- Modify: `src/lib/domaine/arbre.ts`
- Modify: `src/lib/domaine/arbre.test.ts`
- Modify: `src/lib/donnees/profils.ts`

**Interfaces:**
- Produces:
  - `RoleApp = 'administrateur' | 'moderateur' | 'leader'`
  - `ContexteAutorite = { membreLieId: string | null; estAdmin: boolean; estLeader: boolean }`

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter à `src/lib/domaine/arbre.test.ts` :

```ts
describe('peutModifier — le rôle leader (D150)', () => {
  const cible = { membreId: 'm-cible', ancetres: ['m-autre'], dirigeantId: 'm-encore-autre' }

  it("donne autorité sur un membre dont il n'est ni ancêtre ni dirigeant", () => {
    expect(
      peutModifier({ membreLieId: 'm-leader', estAdmin: false, estLeader: true }, cible),
    ).toBe(true)
  })

  it('donne autorité même sans fiche membre liée', () => {
    // Le pouvoir du leader ne vient pas de sa place dans l'arbre : le court-circuit est
    // AVANT le contrôle `membreLieId === null`, exactement comme pour l'administrateur.
    expect(
      peutModifier({ membreLieId: null, estAdmin: false, estLeader: true }, cible),
    ).toBe(true)
  })

  it('donne autorité sur SA PROPRE fiche, comme un administrateur', () => {
    // Conséquence assumée du court-circuit (D150) : « nul n'est son propre ancêtre » vaut
    // pour le dirigeant ordinaire, pas pour l'administrateur — ni pour le leader. On ne
    // crée pas une troisième règle.
    expect(
      peutModifier(
        { membreLieId: 'm-cible', estAdmin: false, estLeader: true },
        cible,
      ),
    ).toBe(true)
  })

  it("ne change RIEN pour un compte sans le rôle", () => {
    // Contrôle négatif : sans lui, un court-circuit écrit à tort en `true` inconditionnel
    // passerait les trois preuves ci-dessus.
    expect(
      peutModifier({ membreLieId: 'm-etranger', estAdmin: false, estLeader: false }, cible),
    ).toBe(false)
  })
})
```

Mettre à jour **tous** les `ContexteAutorite` littéraux déjà présents dans ce fichier en leur ajoutant `estLeader: false` — sans quoi `tsc` échouera.

- [ ] **Step 2: Lancer les tests**

Run: `npm test -- arbre`
Expected: FAIL — `estLeader` n'existe pas sur le type.

- [ ] **Step 3: Implémenter**

Dans `src/lib/donnees/profils.ts` :

```ts
export type RoleApp = 'administrateur' | 'moderateur' | 'leader'
```

Dans `src/lib/domaine/arbre.ts` :

```ts
/** Qui demande : son membre lié (null pour le compte racine), et ses rôles. */
export type ContexteAutorite = {
  membreLieId: string | null
  estAdmin: boolean
  /**
   * Phase 8, D150 — « dirigeant de tout ». Autorité sur TOUT membre, sans place dans
   * l'arbre et sans lecture élargie.
   */
  estLeader: boolean
}
```

et, dans `peutModifier`, remplacer le court-circuit administrateur par :

```ts
  // ═══ DEUX RÔLES COURT-CIRCUITENT L'ARBRE, ET ILS SONT AU MÊME RANG (D150) ═══
  // L'administrateur depuis la 1c, le leader depuis la phase 8. Leur pouvoir ne vient
  // PAS de leur place dans l'arbre — c'est pourquoi ce court-circuit est AVANT le
  // contrôle `membreLieId === null` : un leader sans fiche membre garde son autorité.
  //
  // Conséquence assumée : tous deux ont autorité sur LEUR PROPRE fiche, là où un
  // dirigeant ordinaire ne l'a jamais (« nul n'est son propre ancêtre », plus bas). On ne
  // crée pas une troisième règle pour un troisième rôle.
  //
  // ⚠️ CE QUE LE LEADER PEUT RÉELLEMENT FAIRE (D152, mesuré) : `exigerAutoriteSur` n'a que
  // DEUX appelants dans tout le dépôt — `attribuerStatut` et `retirerStatut`. Le leader
  // gagne donc exactement un pouvoir : attribuer et retirer un statut à n'importe quel
  // membre. Créer, modifier, archiver une fiche et définir l'arbre restent réservés à
  // l'administrateur par `exigerAdministrateur`, que cette phase ne touche pas.
  if (contexte.estAdmin || contexte.estLeader) {
    return true
  }
```

- [ ] **Step 4: Lancer les tests**

Run: `npm test && npx tsc --noEmit`
Expected: PASS. Les preuves préexistantes de `peutModifier` passent **sans changer de sens** — seule leur construction de contexte gagne `estLeader: false`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domaine/arbre.ts src/lib/domaine/arbre.test.ts src/lib/donnees/profils.ts
git commit -m "feat(domaine): le leader court-circuite l'arbre, au même rang que l'administrateur"
```

---

### Task 4 : Le rôle traverse le garde et l'écran

**Files:**
- Modify: `src/lib/securite/garde.ts`
- Modify: `src/app/comptes/actions.ts`
- Modify: `src/app/comptes/ligne-compte.tsx`
- Modify: `src/app/profil/page.tsx`

**Interfaces:**
- Consumes: `ContexteAutorite.estLeader` (Task 3), `p_leader` (Task 2).

- [ ] **Step 1: Le garde**

Dans `src/lib/securite/garde.ts`, fonction `deciderAutorite`, remplacer :

```ts
  const profil = await exigerProfilActif()
  const roles = await rolesDuProfil(profil.id)
  const estAdmin = roles.includes('administrateur')
  const estLeader = roles.includes('leader')

  // Court-circuit : administrateur et leader ont autorité partout, inutile de remonter
  // l'arbre. AUCUNE lecture supplémentaire — les rôles étaient déjà lus pour `estAdmin`.
  if (estAdmin || estLeader) {
    return { profil, autorise: true }
  }

  const cible = await cibleAutorite(membreId)
  if (!cible) {
    return { profil, autorise: false }
  }
  return {
    profil,
    autorise: peutModifier({ membreLieId: profil.membreId, estAdmin, estLeader }, cible),
  }
```

- [ ] **Step 2: L'action des rôles**

Dans `src/app/comptes/actions.ts`, fonction `definirRoles`, ajouter à l'objet de la `rpc` :

```ts
    p_leader: donnees.get('leader') === 'on',
```

- [ ] **Step 3: L'écran des comptes**

Dans `src/app/comptes/ligne-compte.tsx` :

- ajouter `leader: 'Leader',` à `LIBELLE_ROLE` ;
- ajouter `const idLeader = \`${prefixe}-leader\`` à côté d'`idAdmin` et `idModerateur` ;
- ajouter la troisième case dans le `<fieldset>`, après « Modérateur » :

```tsx
              <label htmlFor={idLeader} className="cible-tactile flex items-center gap-esp-2 text-petit text-encre">
                <input
                  id={idLeader}
                  name="leader"
                  type="checkbox"
                  defaultChecked={compte.roles.includes('leader')}
                />
                Leader
              </label>
```

⚠️ **La case reste NON CONTRÔLÉE (D123), comme ses deux voisines** : ce formulaire soumet par `onSubmit` et non par `<form action>`, donc la remise à zéro de React ne s'y applique pas. La contrôler corrigerait un défaut qui n'existe pas.

⚠️ **Ne PAS étendre l'avertissement du `Dialogue` des rôles au leader.** Il dit « Si vous retirez votre rôle administrateur, vous perdrez ce pouvoir immédiatement » : retirer son propre rôle leader ne verrouille rien et ne mérite pas une phrase de plus.

- [ ] **Step 4: L'écran de profil**

Dans `src/app/profil/page.tsx`, ajouter `leader: 'Leader',` à `LIBELLE_ROLE`. Le type `Record<RoleApp, string>` **échouera à compiler** tant que la clé manque — c'est voulu, il est là pour ça.

- [ ] **Step 5: Vérifier**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: PASS, aucune erreur.

- [ ] **Step 6: Commit**

```bash
git add src/lib/securite/garde.ts src/app/comptes/actions.ts src/app/comptes/ligne-compte.tsx src/app/profil/page.tsx
git commit -m "feat(comptes): attribuer le rôle leader et le faire porter par le garde d'autorité"
```

---

### Task 5 : La porte du lot A

**Files:**
- Create: `tests/e2e/leader.spec.ts`

- [ ] **Step 1: Écrire l'essai**

Créer `tests/e2e/leader.spec.ts`. Reprendre les utilitaires de `tests/e2e/autorite.spec.ts`.

Décor : un compte **administrateur**, un compte **leader** (aucun autre rôle, relié à une fiche `LEADER`), et une fiche `ETRANGER` dont le leader n'est **ni ancêtre ni dirigeant**.

```ts
test('un administrateur attribue le rôle leader depuis /comptes', async ({ page }) => {
  // 1. Se connecter en administrateur, aller sur /comptes.
  // 2. Cocher « Leader » sur la ligne du compte cible, enregistrer.
  // 3. Vérifier que la ligne affiche désormais « Leader ».
  // 4. Relire `roles_profil` avec la clé de service : une ligne 'leader' existe.
})

test("un leader gère les statuts de quelqu'un dont il n'est ni ancêtre ni dirigeant (D152)", async ({
  page,
}) => {
  // ═══ LA PREUVE QUI DIT CE QUE LE RÔLE APPORTE ═══
  // 1. Se connecter avec le compte leader.
  // 2. Ouvrir /membres/<ETRANGER> : le lien doit dire « Gérer », pas « Journal ».
  // 3. Ouvrir /membres/<ETRANGER>/statuts : le formulaire d'attribution EST présent.
  // 4. Attribuer un statut, et vérifier en base qu'il est écrit.
})

test("un compte ordinaire n'a toujours rien de tout cela", async ({ page }) => {
  // Contrôle NÉGATIF : sans lui, les preuves ci-dessus passeraient aussi si le formulaire
  // avait été ouvert à tout le monde.
  // Se connecter avec un compte sans rôle, ouvrir la même fiche : « Journal », et aucun
  // formulaire d'attribution.
})

test("le leader ne voit toujours pas une fiche archivée (D151, §2)", async ({ page }) => {
  // Son autorité est totale, sa LECTURE ne l'est pas — c'est la décision de l'utilisateur.
  // Ouvrir /membres/<une fiche archivée> avec le compte leader : page introuvable.
})
```

- [ ] **Step 2: La porte du lot A**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build && npm run test:rls && npm run test:e2e`
Expected: PASS partout. La suite e2e prend ≈ 12 min ; c'est le passage de porte du lot.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/leader.spec.ts
git commit -m "test(leader): couvrir l'attribution du rôle et le pouvoir réel qu'il confère"
```

---

# LOT B — LA SUPPRESSION D'UN COMPTE

### Task 6 : Les demandes survivent à leur auteur

**Files:**
- Create: `supabase/migrations/20260821120000_demandes_auteur_conserve.sql`
- Create: `tests/rls/suppression-compte.test.ts`

**Interfaces:**
- Produces: `demandes_membre.demandeur_nom_affichage text`, `demandeur_profil_id` nullable en `on delete set null`, déclencheur `demandes_membre_nom_demandeur`.

- [ ] **Step 1: Vérifier le nom réel de la clé étrangère**

La clé est déclarée en ligne (`20260815110000_demandes_membre.sql:14`), donc Postgres lui a donné son nom par défaut. **Le vérifier plutôt que le supposer**, dans l'éditeur SQL du projet :

```sql
select conname
from pg_constraint
where conrelid = 'public.demandes_membre'::regclass and contype = 'f';
```

Expected: `demandes_membre_demandeur_profil_id_fkey` figure dans la liste. Si le nom diffère, **employer celui-là** dans la migration ci-dessous.

- [ ] **Step 2: Écrire la migration**

Créer `supabase/migrations/20260821120000_demandes_auteur_conserve.sql` :

```sql
-- Phase 8, D157 / D158 — une demande survit à la suppression de son auteur.
--
-- ═══ POURQUOI, ET CE QUI A ÉTÉ MESURÉ ═══
-- `demandeur_profil_id` était en `on delete cascade` : supprimer un compte aurait effacé,
-- EN SILENCE, toutes ses demandes — l'historique de qui a proposé qui. L'utilisateur a
-- d'abord voulu REFUSER la suppression dans ce cas, puis est revenu dessus une fois mesuré
-- qu'une demande n'est JAMAIS supprimée (annuler_demande_membre passe son état à `annulee`,
-- la ligne reste, 20260815200000) et que TOUTE inscription par token en crée une
-- (`origine: 'auto_inscription'`). Le refus aurait rendu tout compte auto-inscrit
-- DÉFINITIVEMENT indestructible — c'est-à-dire exactement le « compte créé par erreur » que
-- la demande vise.
--
-- Le remède est celui que le projet a DÉJÀ retenu pour `journal_statuts.par_nom_affichage`
-- (20260813160000), et pour la même raison : un registre d'audit doit rester lisible sans
-- dépendre de l'existence du compte auteur.
--
-- ═══ LE NOM EST FIGÉ PAR UN DÉCLENCHEUR, JAMAIS PAR LES APPELANTS (D158) ═══
-- Le dépôt compte TROIS sites d'insertion, relevés : src/app/inscription/actions.ts:566,
-- src/app/demandes/nouvelle/actions.ts:51, et public.convertir_participant_externe —
-- cette dernière EN SQL (20260818280000). Ce troisième site est décisif : aucune
-- modification applicative ne l'aurait couvert, et le nom aurait manqué précisément sur les
-- demandes nées d'une conversion de participant externe. Un déclencheur ne peut être oublié
-- par aucun des trois.

alter table public.demandes_membre add column demandeur_nom_affichage text;

comment on column public.demandes_membre.demandeur_nom_affichage is
  'Nom d''affichage du demandeur, capturé au moment de l''insertion par le déclencheur demandes_membre_nom_demandeur (phase 8, D158). Nul uniquement pour une ligne dont le profil auteur était déjà introuvable à l''insertion : un défaut cosmétique de résolution du nom ne doit pas empêcher une demande par ailleurs valide.';

-- La colonne devient nullable AVANT que la clé étrangère ne passe en `set null` : l'ordre
-- inverse ferait échouer la contrainte sur une colonne encore `not null`.
alter table public.demandes_membre alter column demandeur_profil_id drop not null;

alter table public.demandes_membre
  drop constraint demandes_membre_demandeur_profil_id_fkey;
alter table public.demandes_membre
  add constraint demandes_membre_demandeur_profil_id_fkey
  foreign key (demandeur_profil_id) references public.profils (id) on delete set null;

create or replace function prive.figer_nom_demandeur()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- `security definer` : cette lecture de `profils` n'est pas bridée par `profils_lecture`,
  -- qui ne laisse un non-administrateur voir que son propre profil. Même raisonnement que
  -- prive.attribuer_statut (20260813160000).
  --
  -- Un `p_profil` sans profil correspondant laisse la colonne à `null`, SANS LEVER : un
  -- défaut de résolution du nom ne doit pas empêcher une demande par ailleurs valide.
  --
  -- `coalesce` : si un appelant fournit déjà la valeur, on ne l'écrase pas.
  if new.demandeur_nom_affichage is null and new.demandeur_profil_id is not null then
    select p.nom_affichage into new.demandeur_nom_affichage
    from public.profils p
    where p.id = new.demandeur_profil_id;
  end if;
  return new;
end;
$$;

create trigger demandes_membre_nom_demandeur
  before insert on public.demandes_membre
  for each row execute function prive.figer_nom_demandeur();

comment on function prive.figer_nom_demandeur() is
  'Déclencheur before insert sur public.demandes_membre : capture le nom d''affichage du demandeur au moment de l''écriture (phase 8, D158), pour que la demande reste lisible après la suppression de son auteur. Placé en déclencheur et non chez les appelants parce que le dépôt compte trois sites d''insertion, dont un EN SQL (public.convertir_participant_externe) qu''aucune modification applicative n''aurait couvert. Ne lève jamais : un profil introuvable laisse la colonne à null.';

-- RATTRAPAGE des lignes existantes, dans la même migration : sans lui, toutes les demandes
-- antérieures perdraient leur auteur à la première suppression de compte.
update public.demandes_membre d
   set demandeur_nom_affichage = p.nom_affichage
  from public.profils p
 where p.id = d.demandeur_profil_id
   and d.demandeur_nom_affichage is null;
```

- [ ] **Step 3: Écrire les preuves**

Créer `tests/rls/suppression-compte.test.ts`, avec un décor : un compte `AUTEUR`, une fiche membre, une demande insérée par ce compte.

```ts
describe('une demande survit à son auteur (D157)', () => {
  it('capture le nom du demandeur à l’insertion', async () => {
    // Insérer une demande avec `demandeur_profil_id` = AUTEUR, SANS fournir le nom.
    // Attendu : `demandeur_nom_affichage` vaut le `nom_affichage` du profil.
  })

  it("n'écrase pas un nom déjà fourni", async () => {
    // Insérer en fournissant explicitement `demandeur_nom_affichage: 'Fourni'`.
    // Attendu : 'Fourni' — le déclencheur ne remplace pas ce qu'on lui donne.
  })

  it('conserve la demande ET le nom après suppression du compte auteur', async () => {
    // ═══ LA PREUVE CENTRALE DU LOT ═══
    // Supprimer le compte auth de AUTEUR (cascade vers profils).
    // Attendu : la ligne de demande EXISTE toujours, `demandeur_profil_id` vaut null,
    // et `demandeur_nom_affichage` porte encore le nom.
  })

  it('supprime en revanche les notifications du compte (D162)', async () => {
    // Créer une notification pour AUTEUR avant la suppression, vérifier qu'elle a disparu
    // après. C'est le SEUL `cascade` qu'on laisse agir, et il est voulu.
  })

  it('laisse la FICHE MEMBRE intacte (D161)', async () => {
    // La fiche liée au compte supprimé existe toujours, et son `membre_id` côté profil a
    // disparu avec le profil. Compte et fiche sont deux objets distincts.
  })
})
```

- [ ] **Step 4: Appliquer et lancer**

Run: `npx supabase db push && npm run test:rls -- suppression-compte`
Expected: PASS, les cinq preuves.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260821120000_demandes_auteur_conserve.sql tests/rls/suppression-compte.test.ts
git commit -m "feat(base): une demande survit à son auteur, le nom figé par déclencheur"
```

---

### Task 7 : Les refus de suppression, en base

**Files:**
- Create: `supabase/migrations/20260821130000_suppression_compte.sql`
- Modify: `tests/rls/suppression-compte.test.ts`

**Interfaces:**
- Produces: `prive.refuser_suppression_compte()`, déclencheur `profils_refuser_suppression`. Marqueurs : `compte_racine`, `dernier_administrateur`.

- [ ] **Step 1: Écrire les preuves**

Ajouter à `tests/rls/suppression-compte.test.ts` :

```ts
describe('les refus de suppression (D160)', () => {
  it('refuse la suppression du compte racine', async () => {
    // Tenter `admin.auth.admin.deleteUser(idRacine)`.
    // Attendu : une erreur, et le profil racine EXISTE toujours.
    // ⚠️ Le marqueur `compte_racine` ne traverse PAS GoTrue : on assert sur l'ÉCHEC et sur
    // la persistance du profil, jamais sur `error.details`.
  })

  it("refuse la suppression du dernier administrateur actif", async () => {
    // Décor : un compte administrateur actif, seul de son espèce parmi les comptes de test —
    // il faut donc DÉSACTIVER ou compter les administrateurs réels avant d'asserter.
    // Plus sûr : créer DEUX comptes admin de test, en désactiver un, puis tenter de
    // supprimer l'autre alors qu'il est le dernier ACTIF.
  })

  it('accepte la suppression d’un administrateur quand un autre reste actif', async () => {
    // CONTRÔLE POSITIF, sans lequel la preuve précédente passerait aussi si toute
    // suppression était refusée.
  })

  it('accepte la suppression d’un compte ordinaire', async () => {
    // Le cas nominal : le compte disparaît de `profils` ET de `auth.users`.
  })
})
```

- [ ] **Step 2: Lancer les preuves**

Run: `npm run test:rls -- suppression-compte`
Expected: FAIL sur les deux refus — sans déclencheur, la suppression réussit.

- [ ] **Step 3: Écrire la migration**

Créer `supabase/migrations/20260821130000_suppression_compte.sql` :

```sql
-- Phase 8, D159 / D160 — les refus de suppression d'un compte, en base.
--
-- ═══ POURQUOI UN DÉCLENCHEUR PLUTÔT QU'UNE PASSERELLE ═══
-- `profils.id` référence `auth.users` en `on delete cascade` : supprimer le compte
-- d'authentification cascade vers `public.profils` et DÉCLENCHE ce contrôle DANS LA MÊME
-- TRANSACTION. Un refus annule donc tout, Y COMPRIS la suppression du compte
-- d'authentification.
--
-- C'est ce qui donne l'atomicité SANS écrire à la main dans le schéma `auth`, dont Supabase
-- ne garantit pas la stabilité et dont les tables satellites (auth.identities,
-- auth.sessions) ont leurs propres clés étrangères.
--
-- LE CHEMIN INVERSE EST EXPLICITEMENT REFUSÉ : supprimer d'abord `public.profils` laisserait
-- un compte d'authentification ORPHELIN — exactement celui qu'un balayage de la phase 7 a
-- trouvé en base (`verif.privilege.…@example.com`, créé le 2026-08-13). L'application ne doit
-- JAMAIS faire `delete from public.profils` ; elle appelle `auth.admin.deleteUser`.
--
-- ═══ CE DÉCLENCHEUR NE PEUT PAS VOIR QUI SUPPRIME (D160) ═══
-- Appelé derrière la clé de service, `auth.uid()` vaut `null` ici : la base ignore l'identité
-- de l'appelant. Le refus d'AUTO-SUPPRESSION vit donc dans la Server Action, et LUI SEUL —
-- c'est un garde d'action, pas une barrière. Une requête forgée par un administrateur contre
-- lui-même passerait ; la conséquence serait un administrateur qui se supprime, désagréable
-- et jamais dangereux, le cas catastrophique restant tenu ci-dessous.
--
-- ⚠️ LES MARQUEURS NE TRAVERSENT PAS GoTrue. `error.details` de Postgres n'est pas exposé par
-- l'API d'administration : l'application ne peut pas discriminer dessus, et affichera son
-- message générique si ce déclencheur mord. C'est pourquoi la Server Action porte des
-- CONTRÔLES AMONT qui nomment la cause. Les marqueurs restent posés pour le diagnostic en
-- base, pas pour l'écran.

create or replace function prive.refuser_suppression_compte()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.est_racine then
    raise exception 'Le compte racine ne peut pas être supprimé.'
      using detail = 'compte_racine';
  end if;

  -- `old.actif` fait partie de la condition, et ce n'est pas une précaution : un compte
  -- administrateur DÉJÀ DÉSACTIVÉ n'est pas compté parmi les administrateurs actifs, donc
  -- le supprimer ne peut pas faire passer ce nombre de 1 à 0. Sans cette clause, on
  -- refuserait la suppression d'un administrateur inactif dans un projet qui n'a de toute
  -- façon plus aucun administrateur actif — un refus qui ne protège rien.
  if old.actif
     and exists (
       select 1 from public.roles_profil r
       where r.profil_id = old.id and r.role = 'administrateur'
     )
     and prive.compter_administrateurs_actifs(old.id) = 0
  then
    raise exception 'Il doit rester au moins un administrateur actif.'
      using detail = 'dernier_administrateur';
  end if;

  return old;
end;
$$;

create trigger profils_refuser_suppression
  before delete on public.profils
  for each row execute function prive.refuser_suppression_compte();

comment on function prive.refuser_suppression_compte() is
  'Déclencheur before delete sur public.profils (phase 8, D159/D160) : refuse la suppression du compte racine (detail = compte_racine) et celle du dernier administrateur ACTIF (detail = dernier_administrateur). Atteint par la CASCADE depuis auth.users, donc dans la même transaction que la suppression du compte d''authentification : un refus annule les deux. Il ne peut PAS voir qui supprime — auth.uid() vaut null derrière la clé de service —, d''où le refus d''auto-suppression porté par la Server Action seule. Ses marqueurs ne traversent pas GoTrue et servent au diagnostic en base, pas à l''affichage.';
```

- [ ] **Step 4: Appliquer et relancer**

Run: `npx supabase db push && npm run test:rls -- suppression-compte`
Expected: PASS, les neuf preuves.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260821130000_suppression_compte.sql tests/rls/suppression-compte.test.ts
git commit -m "feat(base): refuser la suppression du racine et du dernier administrateur actif"
```

---

### Task 8 : L'action et l'écran

**Files:**
- Modify: `src/lib/donnees/comptes.ts`
- Modify: `src/app/comptes/messages.ts`
- Modify: `src/app/comptes/actions.ts`
- Modify: `src/app/comptes/ligne-compte.tsx`

**Interfaces:**
- Produces: `estDernierAdministrateurActif(profilId: string): Promise<boolean>` ; `supprimerCompte(donnees: FormData): Promise<void>`.

- [ ] **Step 1: Extraire le contrôle du dernier administrateur**

`compteLieEstDernierAdministrateurActif(membreId)` existe déjà et fait ce travail **à partir d'une fiche membre**. On a besoin du même verdict **à partir d'un profil**. Extraire le cœur plutôt que le recopier — deux copies divergeraient, et c'est un contrôle de sécurité.

Dans `src/lib/donnees/comptes.ts` :

```ts
/**
 * Ce compte est-il le DERNIER administrateur actif du projet ?
 *
 * EXTRAITE du cœur de `compteLieEstDernierAdministrateurActif`, qui part d'une fiche membre
 * là où la suppression de compte part d'un profil. Une seconde copie de ce verdict
 * divergerait, et c'est un contrôle de sécurité : les deux appelants doivent répondre la
 * même chose au même instant.
 *
 * CE N'EST PAS LA DERNIÈRE LIGNE DE DÉFENSE : le déclencheur `profils_refuser_suppression`
 * (20260821130000) reste seul décisif, et rattrape intégralement une défaillance d'ici. Cette
 * fonction n'améliore que le MESSAGE — nommer la cause avant d'écrire.
 */
export async function estDernierAdministrateurActif(profilId: string): Promise<boolean> {
  const supabase = await clientServeur()

  const { data: profil, error: erreurProfil } = await supabase
    .from('profils')
    .select('actif')
    .eq('id', profilId)
    .maybeSingle()
  if (erreurProfil) {
    throw new Error(`Lecture du compte impossible : ${erreurProfil.message}`)
  }
  if (!profil || !profil.actif) {
    return false
  }

  const { data: role, error: erreurRole } = await supabase
    .from('roles_profil')
    .select('profil_id')
    .eq('profil_id', profilId)
    .eq('role', 'administrateur')
    .maybeSingle()
  if (erreurRole) {
    throw new Error(`Lecture du rôle du compte impossible : ${erreurRole.message}`)
  }
  if (!role) {
    return false
  }

  const { data: autresAdmins, error: erreurAutres } = await supabase
    .from('roles_profil')
    .select('profil_id')
    .eq('role', 'administrateur')
    .neq('profil_id', profilId)
  if (erreurAutres) {
    throw new Error(`Lecture des autres administrateurs impossible : ${erreurAutres.message}`)
  }
  const idsAutres = (autresAdmins ?? []).map((l) => l.profil_id as string)
  if (idsAutres.length === 0) {
    return true
  }

  const { data: profilsActifs, error: erreurProfilsActifs } = await supabase
    .from('profils')
    .select('id')
    .in('id', idsAutres)
    .eq('actif', true)
  if (erreurProfilsActifs) {
    throw new Error(`Lecture des comptes administrateurs impossible : ${erreurProfilsActifs.message}`)
  }
  return (profilsActifs ?? []).length === 0
}
```

Puis réécrire `compteLieEstDernierAdministrateurActif` pour qu'elle **délègue** :

```ts
export async function compteLieEstDernierAdministrateurActif(membreId: string): Promise<boolean> {
  const compte = await compteLieBrut(membreId)
  if (!compte) {
    return false
  }
  return estDernierAdministrateurActif(compte.id)
}
```

- [ ] **Step 2: Les messages**

Dans `src/app/comptes/messages.ts` :

```ts
export const MESSAGE_ECHEC_SUPPRESSION =
  "Ce compte n'a pas pu être supprimé."

/**
 * Un administrateur ne supprime pas son propre compte (D160).
 *
 * ⚠️ CE REFUS N'EST PAS UNE BARRIÈRE DE BASE, et le dire importe. Le déclencheur
 * `profils_refuser_suppression` ne peut pas voir qui supprime — appelé derrière la clé de
 * service, `auth.uid()` y vaut `null`. Ce garde vit donc dans la Server Action, et lui seul :
 * une requête forgée par un administrateur contre lui-même passerait. La conséquence serait
 * un administrateur qui se supprime — désagréable, jamais dangereux —, le cas catastrophique
 * (plus aucun administrateur) restant tenu en base.
 */
export const MESSAGE_SUPPRESSION_DE_SOI =
  "Vous ne pouvez pas supprimer votre propre compte. Demandez à un autre administrateur de le faire."

export const MESSAGE_RACINE_INDESTRUCTIBLE =
  "Le compte racine ne peut pas être supprimé : c'est lui qui garantit qu'un accès subsiste."
```

- [ ] **Step 3: L'action**

Dans `src/app/comptes/actions.ts` :

```ts
/**
 * Supprime définitivement un compte (phase 8, D159).
 *
 * ═══ ELLE SUPPRIME LE COMPTE D'AUTHENTIFICATION, JAMAIS `public.profils` DIRECTEMENT ═══
 * `profils.id` référence `auth.users` en `on delete cascade` : la suppression cascade vers
 * le profil et déclenche `profils_refuser_suppression` dans la MÊME transaction — un refus
 * annule donc les deux. Faire l'inverse (`delete from profils`) laisserait un compte
 * d'authentification ORPHELIN, exactement celui qu'un balayage de la phase 7 a trouvé en base.
 *
 * ═══ LES CONTRÔLES AMONT EXPLIQUENT, LE DÉCLENCHEUR PROTÈGE ═══
 * Les marqueurs Postgres ne traversent PAS GoTrue : `error.details` n'est pas exposé par
 * l'API d'administration. Sans ces contrôles amont, tout refus s'afficherait comme un échec
 * générique. Ils ne sont pas la barrière : une rétrogradation concurrente entre la lecture et
 * la suppression passerait ici et serait arrêtée en base, avec le message générique — partage
 * assumé, identique à celui d'`archiverMembre`.
 *
 * CE QUI N'EST PAS SUPPRIMÉ : la fiche membre liée (D161). Compte et fiche sont deux objets
 * distincts ; les confondre effacerait une personne du suivi pour une erreur de compte.
 */
export async function supprimerCompte(donnees: FormData): Promise<void> {
  const profil = await exigerAdministrateur()

  const profilId = String(donnees.get('profilId') ?? '')
  if (profilId.length === 0) {
    console.error('supprimerCompte : identifiant de compte manquant dans le formulaire')
    throw new Error(MESSAGE_ECHEC_SUPPRESSION)
  }

  // D160 — garde d'ACTION, pas barrière de base : voir MESSAGE_SUPPRESSION_DE_SOI.
  if (profilId === profil.id) {
    throw new Error(MESSAGE_SUPPRESSION_DE_SOI)
  }

  const { data: cible, error: erreurCible } = await clientAdmin()
    .from('profils')
    .select('est_racine')
    .eq('id', profilId)
    .maybeSingle()
  if (erreurCible) {
    console.error('supprimerCompte : lecture du compte impossible', { profilId, erreurCible })
    throw new Error(MESSAGE_ECHEC_SUPPRESSION)
  }
  if (!cible) {
    throw new Error(MESSAGE_COMPTE_INCONNU)
  }
  if (cible.est_racine) {
    throw new Error(MESSAGE_RACINE_INDESTRUCTIBLE)
  }
  if (await estDernierAdministrateurActif(profilId)) {
    throw new Error(MESSAGE_DERNIER_ADMINISTRATEUR)
  }

  const { error } = await clientAdmin().auth.admin.deleteUser(profilId)
  if (error) {
    // `error.details` N'EXISTE PAS ICI : GoTrue n'expose pas le diagnostic Postgres. On
    // journalise ce qu'on a, et l'écran reçoit le message générique — c'est précisément
    // pourquoi les contrôles amont ci-dessus existent.
    console.error('supprimerCompte : échec de la suppression du compte auth', {
      profilId,
      code: error.code,
      status: error.status,
      message: error.message,
    })
    throw new Error(MESSAGE_ECHEC_SUPPRESSION)
  }

  revalidatePath('/comptes')
}
```

Ajouter les imports : `estDernierAdministrateurActif` depuis `@/lib/donnees/comptes`, et les trois messages.

- [ ] **Step 4: L'écran**

Dans `src/app/comptes/ligne-compte.tsx`, ajouter un bouton « Supprimer ce compte » **en dernière position** de la ligne, derrière un `Dialogue` dont le message énonce les deux conséquences :

```tsx
          <Dialogue
            ouvert={confirmationSuppressionDemandee}
            message={
              `Supprimer définitivement le compte « ${compte.identifiant} » ?\n\n` +
              "Sa fiche membre n'est PAS supprimée : elle reste au registre.\n" +
              'Ses notifications, elles, disparaissent avec lui.\n\n' +
              'Cette action est irréversible.'
            }
            surConfirmation={() => {
              setConfirmationSuppressionDemandee(false)
              executerSuppression()
            }}
            surAnnulation={() => setConfirmationSuppressionDemandee(false)}
          />
```

⚠️ **Le bouton n'est PAS rendu sur la ligne du compte racine ni sur celle du compte connecté** : proposer un geste dont on connaît d'avance le refus se lit comme un défaut. Le refus côté action reste en place — masquer un bouton ne protège rien.

- [ ] **Step 5: Vérifier**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/donnees/comptes.ts src/app/comptes/messages.ts src/app/comptes/actions.ts src/app/comptes/ligne-compte.tsx
git commit -m "feat(comptes): supprimer un compte, sans emporter sa fiche ni ses demandes"
```

---

### Task 9 : La porte du lot B, et le README

**Files:**
- Create: `tests/e2e/suppression-compte.spec.ts`
- Modify: `README.md`

- [ ] **Step 1: Écrire l'essai**

Créer `tests/e2e/suppression-compte.spec.ts` :

```ts
test('un administrateur supprime un compte créé par erreur', async ({ page }) => {
  // Décor : un compte ordinaire de test, avec UNE demande à son nom.
  // 1. Se connecter en administrateur, aller sur /comptes.
  // 2. Cliquer « Supprimer ce compte » sur sa ligne.
  // 3. Le dialogue doit ANNONCER que la fiche membre n'est pas supprimée.
  // 4. Confirmer.
  // 5. Le compte a disparu de la liste.
  // 6. En base : le profil n'existe plus, MAIS la demande existe toujours,
  //    `demandeur_profil_id` à null et `demandeur_nom_affichage` renseigné.
})

test("le bouton n'est proposé ni sur le compte racine ni sur son propre compte", async ({ page }) => {
  // Proposer un geste dont on connaît d'avance le refus se lit comme un défaut.
})
```

- [ ] **Step 2: La porte du lot B, et de la phase**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build && npm run test:rls && npm run test:e2e`
Expected: PASS partout, la suite e2e ENTIÈRE.

- [ ] **Step 3: Le README**

Ajouter une section « Phase 8 » à la fin de `README.md`, dans le ton des précédentes : le rôle leader et **ce qu'il apporte exactement** (D152), le découplage autorité/visibilité assumé (D153), la suppression de compte, la survie des demandes et **pourquoi le refus initialement envisagé aurait rendu tout compte auto-inscrit indestructible**.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/suppression-compte.spec.ts README.md
git commit -m "docs: consigner la phase 8, et couvrir la suppression de bout en bout"
```

---

## Auto-revue du plan

**Couverture de la spec :**

| Décision | Tâche |
|----------|-------|
| D149 migration d'énumération seule | 1 |
| D150 court-circuit au rang de l'admin | 3 |
| D151 aucune politique, aucune primitive | 1 (énoncé), 3 (l'autorité est applicative) |
| D152 ce que le leader peut réellement | 3 (commentaire), 5 (preuve) |
| D153 autorité ≠ visibilité | 5 (preuve de la fiche archivée) |
| D154 `drop` + `create` + privilèges | 2 (+ preuve d'absence de surcharge) |
| D155 dernier administrateur non étendu | 2 (+ preuve) |
| D156 `/mes-membres` inchangée | aucune tâche — c'est une NON-action, et c'est voulu |
| D157 demandes nullables en `set null` | 6 |
| D158 déclencheur, pas les appelants | 6 (+ preuve du non-écrasement) |
| D159 déclencheur `before delete` + `deleteUser` | 7, 8 |
| D160 deux refus en base, un dans l'action | 7, 8 |
| D161 la fiche membre subsiste | 6 (preuve), 8 (dialogue) |
| D162 les notifications disparaissent | 6 (preuve), 8 (dialogue) |
| D163 tout le reste en `set null` | aucune tâche — relevé, rien à changer |

**Cohérence des types :** `RoleApp` (T3) → `ContexteAutorite.estLeader` (T3) → `deciderAutorite` (T4) → `p_leader` (T2). `estDernierAdministrateurActif(profilId)` (T8) est consommée par `supprimerCompte` (T8) et par `compteLieEstDernierAdministrateurActif` réécrite (T8).

**Points sensibles, à ne pas laisser passer en revue :**
1. **T1** — le fichier de migration ne contient QUE l'`alter type`. Y ajouter quoi que ce soit casse le déploiement.
2. **T2** — vérifier l'absence de surcharge de `definir_roles` ; une case cochée sans effet ne se voit pas.
3. **T6** — l'ordre des `alter table` : nullable AVANT le changement de clé étrangère.
4. **T7/T8** — ne JAMAIS écrire `delete from public.profils` ; passer par `auth.admin.deleteUser`.
5. **T8** — le refus d'auto-suppression est un garde d'action, et le commentaire doit le dire.
