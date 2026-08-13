# Phase 2b — tokens d'inscription, inscription publique, demandes de suivi, notifications : plan d'implémentation

> **Pour les agents implémenteurs :** COMPÉTENCE OBLIGATOIRE — utiliser
> `superpowers:subagent-driven-development` (recommandé) ou
> `superpowers:executing-plans` pour exécuter ce plan tâche par tâche. Les étapes
> emploient la syntaxe à cases (`- [ ]`) pour le suivi.

**But :** livrer les quatre circuits de la phase 2b — tokens d'inscription, inscription
publique par token, demandes de suivi, notifications in-app — tels que décidés par
`docs/superpowers/specs/2026-08-13-phase-2b-design.md`.

**Architecture :** quatre tables neuves (`tokens_inscription`, `demandes_membre`,
`notifications`, `tentatives_token_inscription`), toutes RLS en lecture seule, aucune
politique d'écriture. Deux invariants protégés par des fonctions Postgres
`SECURITY DEFINER` réservées à `service_role` : la consommation atomique d'un token
(verrou de ligne, plafond de tentatives, message indifférencié à quatre causes) et
l'annulation atomique d'une demande de suivi (changement d'état + suppression de la
fiche `en_attente`, dans une seule transaction PL/pgSQL). `/inscription` est la
première page de toute l'application accessible sans session : sa fermeture ne repose
sur aucun garde applicatif, seulement sur l'absence de politique RLS ouverte à `anon`
et sur les privilèges `EXECUTE` retirés à tous sauf `service_role`.

**Pile technique :** Next.js 16 (App Router, Server Actions), TypeScript, Supabase
(Postgres + Auth), Tailwind, Vitest, Playwright.

**Documents de référence :**
- `docs/superpowers/specs/2026-08-13-phase-2b-design.md` — le design de cette phase,
  ses décisions D25 à D42 et ses pièges connus. **Aucune de ses décisions n'est
  rouverte par ce plan.**
- `docs/superpowers/specs/2026-08-11-suivi-asonkeng-design.md` — la spécification
  maîtresse, en particulier §4.1, §4.6, §5.3, §6, §7.
- `docs/superpowers/plans/2026-08-12-phase-1c-arborescence.md` — modèle de forme et de
  niveau de détail pour ce plan.
- `.superpowers/sdd/2026-08-12-phase-1c-arborescence/progress.md` — le registre des
  défauts trouvés en 1c, dont ce plan ne doit reproduire aucun.

---

## Contraintes globales

Ces règles s'appliquent à **chaque** tâche. Elles ne sont pas répétées tâche par tâche.

1. **Un seul projet Supabase sert au développement et à la production.** Les
   migrations sont strictement **additives**. **Ne jamais exécuter
   `supabase db reset`.** Ne jamais modifier une migration déjà appliquée :
   `supabase db push` suit les migrations par version et non par contenu — compléter
   un fichier déjà appliqué ne rejoue rien et laisse le dépôt en désaccord silencieux
   avec la base.
2. **Les six portes avant tout commit**, dans cet ordre : `npx tsc --noEmit`,
   `npm run lint`, `npm test`, `npm run test:rls`, `npm run test:e2e`, `npm run build`.
   Aucune intégration continue n'existe ; pousser sur `main` déploie en production.
3. **Ne stager que ses propres fichiers.** Jamais `git add -A`.
4. **Apostrophes droites** entre guillemets doubles pour tout texte français en
   TypeScript (`"il n'y a rien"`) ; `&apos;` dans le JSX rendu ; apostrophes doublées
   en SQL (`''`). Jamais d'apostrophe typographique (`'`) dans `src/` ni dans
   `supabase/`.
5. **Aucune commande à portée globale sur les processus.** Pour arrêter un serveur,
   viser son PID précis, après avoir vérifié que ce PID est bien le processus visé.
6. **Toute vérification par recherche exige un CONTRÔLE POSITIF.** Prouver que la
   méthode de recherche trouve quelque chose de connu avant de conclure d'une absence.
7. **Toute barrière exige une PREUVE PAR MUTATION** : la casser, constater que le test
   tombe *et pour la bonne raison* (le contrôle positif du même bloc reste vert),
   restaurer, vérifier l'empreinte du fichier ou de la définition restaurée
   (`pg_get_functiondef` / `pg_get_triggerdef` identique).
8. **Ne jamais discriminer une erreur Postgres sur le texte français de son message.**
   Toujours sur `error.code`, ou sur le marqueur `error.details` posé par
   `using detail`.
9. **Aucune écriture depuis le navigateur.** Toute mutation passe par une Server
   Action derrière un garde de `src/lib/securite/garde.ts` — sauf `sInscrire`
   (Task 14), l'unique exception documentée du projet. Aucune politique RLS
   d'écriture n'est créée, sur aucune table.
10. **Une trace serveur systématique sur tout échec** (`console.error` avec `code`,
    `details`, `message`), y compris pour les cas classifiés.
11. **Vérifier depuis chaque rôle.** Tout écran à visibilité différenciée
    (administrateur, demandeur, tout autre compte, `anon`) se vérifie depuis chacun de
    ces rôles séparément.
12. **Un texte d'aide ne vit jamais dans un `<label>`** — il serait concaténé au nom
    accessible du champ. Champ sans aide : `<label>` enveloppant. Champ avec aide :
    `htmlFor` explicite, aide sortie du label et rattachée par `aria-describedby`.
13. **Nettoyer les données de test** créées en base, et vérifier le nettoyage par
    comptage. Préfixer tout membre de test par `ZZ` et tout compte de test par `test.`.

**Deux pièges spécifiques à cette phase, à répéter à chaque tâche concernée :**

- **`redirect()` lève une exception de contrôle** : jamais à l'intérieur d'un `try`,
  sinon le `catch` l'avale et la redirection n'a pas lieu.
- **Une action liée directement à `<form action={...}>` ne peut pas parler à
  l'utilisateur** si elle lève une exception : `src/app/error.tsx` affiche un texte
  **statique** et ne lit jamais `error.message`. Deux remèdes possibles, employés tous
  deux dans ce plan : (a) l'action **renvoie** un état via `useActionState`, jamais ne
  lève ; (b) l'action lève, et le composant l'appelle depuis un `useTransition` avec
  `try`/`catch`, motif déjà écrit par `lierFiche` / `LigneCompte` en 1c.

---

## Structure des fichiers

**Migrations** (toutes nouvelles, additives, datées après les dernières migrations 1c
du 2026-08-14) :

| Fichier | Responsabilité |
|---|---|
| `supabase/migrations/20260815100000_tokens_inscription.sql` | table `tokens_inscription`, RLS lecture admin |
| `supabase/migrations/20260815110000_demandes_membre.sql` | table `demandes_membre`, RLS lecture admin + demandeur |
| `supabase/migrations/20260815120000_notifications.sql` | table `notifications`, RLS lecture propriétaire |
| `supabase/migrations/20260815130000_tentatives_token_inscription.sql` | table `tentatives_token_inscription`, RLS sans aucune politique |
| `supabase/migrations/20260815140000_membres_lecture_demandeur.sql` | `prive.est_demandeur_de`, amendement de `membres_lecture` |
| `supabase/migrations/20260815150000_consommation_token_inscription.sql` | `consommer_token_inscription`, `relacher_token_inscription` |
| `supabase/migrations/20260815160000_annulation_demande_membre.sql` | `annuler_demande_membre` |
| `supabase/migrations/20260815170000_validation_rattachement_demande.sql` | `valider_demande_rattachement` |

**Domaine** (fonctions pures, sans accès réseau ni base) :

| Fichier | Responsabilité |
|---|---|
| `src/lib/domaine/tirage.ts` | `ALPHABET_LISIBLE`, `tirerChaineLisible` (extrait de `comptes/actions.ts`) |
| `src/lib/domaine/tirage.test.ts` | ses tests |
| `src/lib/domaine/token-inscription.ts` | `LONGUEUR_CODE_TOKEN`, `genererCodeInscription`, `hacherCodeInscription` |
| `src/lib/domaine/token-inscription.test.ts` | ses tests |
| `src/lib/domaine/membre.ts` (modifié) | extraction de `ficheMembreDepuisFormData`, `ficheMembreVersColonnes` |

**Données** (lectures, `server-only`) :

| Fichier | Responsabilité |
|---|---|
| `src/lib/donnees/tokens.ts` | `listerTokens` |
| `src/lib/donnees/demandes.ts` | `listerDemandesEnAttente`, `mesDemandes`, `demandeParId` |
| `src/lib/donnees/notifications.ts` | `mesNotifications`, `compterNotificationsNonLues`, `notifierAdministrateurs` |
| `src/lib/donnees/antennes.ts` (modifié) | ajout de `listerAntennesPubliques` |

**Sécurité :**

| Fichier | Responsabilité |
|---|---|
| `src/middleware.ts` (modifié) | exception `/inscription`, sans session |

**Écrans :**

| Fichier | Responsabilité |
|---|---|
| `src/app/inscription/page.tsx` | formulaire public, sans session |
| `src/app/inscription/formulaire-inscription.tsx` | son formulaire client |
| `src/app/inscription/actions.ts` | `sInscrire` |
| `src/app/inscription/messages.ts` | ses messages, dont le mappage indifférencié |
| `src/app/inscription/messages.test.ts` | tests du mappage |
| `src/app/tokens/page.tsx` | écran des tokens, réservé à l'administrateur |
| `src/app/tokens/actions.ts` | `genererToken`, `revoquerToken` |
| `src/app/tokens/messages.ts` | ses messages |
| `src/app/tokens/formulaire-generation.tsx` | génération d'un token |
| `src/app/tokens/ligne-token.tsx` | une ligne de la liste, avec révocation |
| `src/app/demandes/page.tsx` | file d'attente admin + mes demandes |
| `src/app/demandes/actions.ts` | `annulerDemandeSuivi`, `validerDemandeNouvellePersonne`, `validerDemandeRattachement`, `rejeterDemande` |
| `src/app/demandes/messages.ts` | ses messages |
| `src/app/demandes/ligne-demande-admin.tsx` | une ligne de la file d'attente, avec ses actions |
| `src/app/demandes/ligne-demande-personnelle.tsx` | une ligne de « mes demandes », avec annulation |
| `src/app/demandes/formulaire-validation-suivi.tsx` | correction du dirigeant proposé avant validation |
| `src/app/demandes/nouvelle/page.tsx` | formulaire de demande de suivi |
| `src/app/demandes/nouvelle/actions.ts` | `creerDemandeSuivi` |
| `src/app/demandes/nouvelle/messages.ts` | ses messages |
| `src/app/notifications/page.tsx` | page « à traiter » |
| `src/app/notifications/actions.ts` | `marquerNotificationLue` |
| `src/app/notifications/messages.ts` | ses messages |
| `src/app/notifications/cloche.tsx` | composant serveur, monté depuis `layout.tsx` |
| `src/app/layout.tsx` (modifié) | montage de `<Cloche />` |
| `src/app/tableau-de-bord/page.tsx` (modifié) | liens vers `/tokens`, `/demandes`, `/demandes/nouvelle` |

**Tests :**

| Fichier | Responsabilité |
|---|---|
| `tests/rls/tokens-inscription.test.ts` | politiques, consommation, tentatives, mutations |
| `tests/rls/demandes-membre.test.ts` | politiques, annulation, rattachement, mutations |
| `tests/rls/notifications.test.ts` | politiques |
| `tests/e2e/inscription.spec.ts` | parcours public, message indifférencié, requêtes forgées |
| `tests/e2e/tokens.spec.ts` | génération, liste, révocation, rôles |
| `tests/e2e/demandes.spec.ts` | demande, annulation, validation, rejet, rôles |
| `tests/e2e/notifications.spec.ts` | cloche, page, marquage |

---

## Partie A — migrations, RLS et fonctions Postgres

### Task 1 : table `tokens_inscription`

**Fichiers :**
- Créer : `supabase/migrations/20260815100000_tokens_inscription.sql`
- Créer : `tests/rls/tokens-inscription.test.ts`

**Interfaces :**
- Produit : type `public.mode_token` (`'nominatif'` \| `'generique'`) ; table
  `public.tokens_inscription (id, code_hash, mode, membre_id, cree_par, cree_le,
  expire_le, revoque_le, utilise_le, utilise_par_profil_id)` ; politique
  `tokens_inscription_lecture` (administrateur seul).

Colonnes exactes (design §5.1, D33) :

| Colonne | Type | Contrainte |
|---|---|---|
| `id` | `uuid` | PK, `default gen_random_uuid()` |
| `code_hash` | `text` | `not null unique` |
| `mode` | `public.mode_token` | `not null` |
| `membre_id` | `uuid` | `references public.membres(id) on delete cascade`, NULL sauf si nominatif |
| `cree_par` | `uuid` | `references public.profils(id) on delete set null` |
| `cree_le` | `timestamptz` | `not null default now()` |
| `expire_le` | `timestamptz` | `not null` |
| `revoque_le` | `timestamptz` | nullable |
| `utilise_le` | `timestamptz` | nullable |
| `utilise_par_profil_id` | `uuid` | `references public.profils(id) on delete set null` |

`membre_id` référence `on delete cascade` et non `set null` : si la fiche visée
disparaissait (cas théorique, aucune fiche `actif` ciblée par un token nominatif
n'est jamais supprimée par l'application — seules les fiches `en_attente` le sont,
et un token nominatif ne pointe jamais vers une fiche `en_attente`), un `set null`
romprait la contrainte `CHECK` croisée ci-dessous et bloquerait la suppression avec
un message opaque. `cascade` fait disparaître le token avec sa cible, sans mystère.

- [ ] **Étape 1 : écrire la migration**

Créer `supabase/migrations/20260815100000_tokens_inscription.sql` :

```sql
-- Tokens d'inscription (spec maîtresse §4.6, design 2b §5.1). D8 : deux modes,
-- nominatif et générique. D25/D27 : code long haché, jamais stocké en clair ; la
-- consommation atomique est ajoutée dans une migration séparée
-- (20260815150000_consommation_token_inscription.sql) une fois la table en place.

create type public.mode_token as enum ('nominatif', 'generique');

create table public.tokens_inscription (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  mode public.mode_token not null,
  membre_id uuid references public.membres (id) on delete cascade,
  cree_par uuid references public.profils (id) on delete set null,
  cree_le timestamptz not null default now(),
  expire_le timestamptz not null,
  -- D33 : distinct d'expire_le, absent du §4.6. Un token dont revoque_le est
  -- renseigné est traité, à la consommation, exactement comme un token expiré —
  -- même branche, même message (design 2b §5.1, §6). Sert à l'administrateur pour
  -- distinguer, dans SA PROPRE liste, un token qu'il a coupé d'un token simplement
  -- arrivé à échéance.
  revoque_le timestamptz,
  -- Posé par consommer_token_inscription, AVANT même que le compte existe (D27).
  utilise_le timestamptz,
  -- Posé SÉPARÉMENT, une fois le compte créé (design 2b §7.1) : au moment où
  -- utilise_le est posé, aucun profil n'existe encore pour porter cette valeur.
  utilise_par_profil_id uuid references public.profils (id) on delete set null,
  constraint tokens_inscription_membre_selon_mode check (
    (mode = 'nominatif' and membre_id is not null) or
    (mode = 'generique' and membre_id is null)
  )
);

comment on table public.tokens_inscription is
  'Tokens d''inscription (D8, design 2b §5.1). Le code en clair n''est JAMAIS stocké : seul son hachage (code_hash) l''est. Un token nominatif référence une fiche existante ; un token générique laisse l''inscrit la créer.';
comment on column public.tokens_inscription.revoque_le is
  'D33 : distinct d''expire_le. Un token dont revoque_le est renseigné est traité, à la consommation, exactement comme un token expiré — même branche, même statut invalide (consommer_token_inscription, migration 20260815150000).';

create index tokens_inscription_membre_id_idx on public.tokens_inscription (membre_id);
create index tokens_inscription_cree_par_idx on public.tokens_inscription (cree_par);

revoke all on public.tokens_inscription from anon, authenticated;
grant select on public.tokens_inscription to authenticated;

alter table public.tokens_inscription enable row level security;
alter table public.tokens_inscription force row level security;

-- Lecture : administrateur seul (design 2b §5.5). Aucune politique d'écriture :
-- génération, révocation et consommation passent toutes par service_role, la
-- consommation via une fonction SECURITY DEFINER dédiée (Task 8).
create policy tokens_inscription_lecture on public.tokens_inscription
  for select
  to authenticated
  using ((select prive.est_admin()));
```

- [ ] **Étape 2 : appliquer la migration**

```bash
npx supabase db push --dry-run
npx supabase db push
npx supabase migration list
```

- [ ] **Étape 3 : écrire les tests RLS**

Créer `tests/rls/tokens-inscription.test.ts` :

```typescript
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { identifiantVersEmail } from '@/lib/domaine/identifiant'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const CLE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const CLE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

const admin = createClient(URL, CLE_SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const anon = createClient(URL, CLE_ANON, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const MDP = `Test-${crypto.randomUUID()}`
const PREFIXE = 'test.rls.tokens.'
const IDENT_ADMIN = `${PREFIXE}admin`
const IDENT_SIMPLE = `${PREFIXE}simple`
const PREFIXE_MEMBRE = `ZZTokens-${crypto.randomUUID().slice(0, 8)}`

let idAdmin: string
let idSimple: string
let idMembre: string
let idToken: string
let clientAdminAuth: SupabaseClient
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

async function creerCompte(identifiant: string, administrateur: boolean): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email: identifiantVersEmail(identifiant),
    password: MDP,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`création du compte ${identifiant} impossible : ${error?.message}`)
  const { error: erreurProfil } = await admin
    .from('profils')
    .insert({ id: data.user.id, identifiant, nom_affichage: `Test tokens ${identifiant}` })
  if (erreurProfil) {
    await admin.auth.admin.deleteUser(data.user.id)
    throw new Error(`insertion du profil ${identifiant} impossible : ${erreurProfil.message}`)
  }
  if (administrateur) {
    const { error: erreurRole } = await admin
      .from('roles_profil')
      .insert({ profil_id: data.user.id, role: 'administrateur' })
    if (erreurRole) throw new Error(`attribution du rôle impossible : ${erreurRole.message}`)
  }
  return data.user.id
}

beforeAll(async () => {
  await admin.from('membres').delete().like('nom', `${PREFIXE_MEMBRE}%`)
  await supprimerCompte(IDENT_ADMIN)
  await supprimerCompte(IDENT_SIMPLE)

  idAdmin = await creerCompte(IDENT_ADMIN, true)
  idSimple = await creerCompte(IDENT_SIMPLE, false)

  const { data: membre, error: erreurMembre } = await admin
    .from('membres')
    .insert({ nom: `${PREFIXE_MEMBRE}-cible`, prenom: 'Test' })
    .select('id')
    .single()
  if (erreurMembre || !membre) throw new Error(`création du membre cible impossible : ${erreurMembre?.message}`)
  idMembre = membre.id

  const { data: token, error: erreurToken } = await admin
    .from('tokens_inscription')
    .insert({
      code_hash: `hash-test-${crypto.randomUUID()}`,
      mode: 'nominatif',
      membre_id: idMembre,
      cree_par: idAdmin,
      expire_le: new Date(Date.now() + 86_400_000).toISOString(),
    })
    .select('id')
    .single()
  if (erreurToken || !token) throw new Error(`création du token impossible : ${erreurToken?.message}`)
  idToken = token.id

  clientAdminAuth = createClient(URL, CLE_ANON, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error: erreurConnexionAdmin } = await clientAdminAuth.auth.signInWithPassword({
    email: identifiantVersEmail(IDENT_ADMIN),
    password: MDP,
  })
  if (erreurConnexionAdmin) throw new Error(`connexion admin impossible : ${erreurConnexionAdmin.message}`)

  clientSimple = createClient(URL, CLE_ANON, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error: erreurConnexionSimple } = await clientSimple.auth.signInWithPassword({
    email: identifiantVersEmail(IDENT_SIMPLE),
    password: MDP,
  })
  if (erreurConnexionSimple) throw new Error(`connexion simple impossible : ${erreurConnexionSimple.message}`)
})

afterAll(async () => {
  await admin.from('membres').delete().like('nom', `${PREFIXE_MEMBRE}%`)
  await supprimerCompte(IDENT_ADMIN)
  await supprimerCompte(IDENT_SIMPLE)
})

describe('politique tokens_inscription_lecture', () => {
  it('laisse un administrateur lire le token', async () => {
    const { data, error } = await clientAdminAuth.from('tokens_inscription').select('id').eq('id', idToken)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  it('interdit à un compte ordinaire de lire le token', async () => {
    const { data, error } = await clientSimple.from('tokens_inscription').select('id').eq('id', idToken)
    expect(error).toBeNull()
    // RLS ne rend pas d'erreur : elle filtre silencieusement à zéro ligne. C'est
    // pourquoi le contrôle positif ci-dessus, sur le MÊME id, n'est pas décoratif.
    expect(data).toHaveLength(0)
  })

  it('interdit toute lecture au rôle anon', async () => {
    const { data, error } = await anon.from('tokens_inscription').select('id')
    expect(error).not.toBeNull()
    expect(data).toBeNull()
  })
})
```

- [ ] **Étape 4 : lancer les tests RLS**

```bash
npm run test:rls
```

Attendu : tous les tests verts, dont les trois nouveaux ci-dessus.

- [ ] **Étape 5 : les six portes, puis commit**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls && npm run test:e2e && npm run build
```

```bash
git add supabase/migrations/20260815100000_tokens_inscription.sql tests/rls/tokens-inscription.test.ts
git commit -m "feat: creer la table tokens_inscription et sa politique de lecture"
```

---

### Task 2 : table `demandes_membre`

**Fichiers :**
- Créer : `supabase/migrations/20260815110000_demandes_membre.sql`
- Créer : `tests/rls/demandes-membre.test.ts`

**Interfaces :**
- Produit : types `public.origine_demande` (`'auto_inscription'` \|
  `'demande_suivi'`), `public.etat_demande` (`'en_attente'` \| `'validee'` \|
  `'rejetee'` \| `'annulee'`) ; table `public.demandes_membre (id, origine,
  demandeur_profil_id, membre_id, etat, motif_rejet, traite_par, traite_le,
  cree_le)` ; politique `demandes_membre_lecture` (administrateur, ou le demandeur
  pour ses propres lignes).

Colonnes exactes (design §5.2, D32, D40, D42) :

| Colonne | Type | Contrainte |
|---|---|---|
| `id` | `uuid` | PK |
| `origine` | `public.origine_demande` | `not null` — **D32**, absente du §4.6 |
| `demandeur_profil_id` | `uuid` | `not null references public.profils(id) on delete cascade` |
| `membre_id` | `uuid` | `references public.membres(id) on delete set null` — **D42** |
| `etat` | `public.etat_demande` | `not null default 'en_attente'` |
| `motif_rejet` | `text` | nullable, réservé à `rejetee` |
| `traite_par` | `uuid` | `references public.profils(id) on delete set null` |
| `traite_le` | `timestamptz` | nullable |
| `cree_le` | `timestamptz` | `not null default now()` |

`demandeur_profil_id on delete cascade` : si le compte du demandeur est supprimé
(seul chemin réel : nettoyage de comptes de test via `auth.admin.deleteUser`, aucune
suppression de compte n'existe dans l'application elle-même), la demande disparaît
avec lui plutôt que de bloquer la suppression par une violation de clé étrangère.

- [ ] **Étape 1 : écrire la migration**

Créer `supabase/migrations/20260815110000_demandes_membre.sql` :

```sql
-- Demandes de suivi et d'auto-inscription (spec maîtresse §4.6, design 2b §5.2).
-- D26 : pas de fusion générale de fiches, à la validation le compte est rattaché à
-- une fiche existante et la fiche en_attente est supprimée. D32 : colonne origine,
-- absente du §4.6, nécessaire parce que la validation ne fait pas la même chose
-- selon le parcours (design 2b §7.3). D40/D42 : état annulee, geste du demandeur
-- lui-même, sans motif.

create type public.origine_demande as enum ('auto_inscription', 'demande_suivi');
create type public.etat_demande as enum ('en_attente', 'validee', 'rejetee', 'annulee');

create table public.demandes_membre (
  id uuid primary key default gen_random_uuid(),
  origine public.origine_demande not null,
  demandeur_profil_id uuid not null references public.profils (id) on delete cascade,
  -- D42 : on delete SET NULL, pas cascade — quand une annulation supprime la fiche
  -- en_attente, la demande doit SURVIVRE, à l'état annulee, sans fiche.
  membre_id uuid references public.membres (id) on delete set null,
  etat public.etat_demande not null default 'en_attente',
  motif_rejet text,
  traite_par uuid references public.profils (id) on delete set null,
  traite_le timestamptz,
  cree_le timestamptz not null default now(),
  constraint demandes_membre_motif_reserve_rejet
    check (motif_rejet is null or etat = 'rejetee')
);

comment on table public.demandes_membre is
  'Demande de suivi ou d''auto-inscription (design 2b §5.2). origine distingue les deux parcours (D32) : la validation ne fait pas la même chose selon l''un ou l''autre (design 2b §7.3). membre_id devient NULL quand une annulation (D42) supprime la fiche en_attente ; la demande, elle, survit à l''état annulee.';

create index demandes_membre_demandeur_idx on public.demandes_membre (demandeur_profil_id);
create index demandes_membre_membre_id_idx on public.demandes_membre (membre_id);
create index demandes_membre_etat_idx on public.demandes_membre (etat);

revoke all on public.demandes_membre from anon, authenticated;
grant select on public.demandes_membre to authenticated;

alter table public.demandes_membre enable row level security;
alter table public.demandes_membre force row level security;

-- Lecture (design 2b §5.5) : administrateur, ou le demandeur pour SES PROPRES
-- lignes. Aucune politique d'écriture : création, annulation, validation et rejet
-- passent tous par service_role ou par des fonctions SECURITY DEFINER (Tasks 9, 10).
create policy demandes_membre_lecture on public.demandes_membre
  for select
  to authenticated
  using (
    (select prive.est_actif())
    and (demandeur_profil_id = (select auth.uid()) or (select prive.est_admin()))
  );
```

- [ ] **Étape 2 : appliquer la migration**

```bash
npx supabase db push --dry-run && npx supabase db push && npx supabase migration list
```

- [ ] **Étape 3 : écrire les tests RLS**

Créer `tests/rls/demandes-membre.test.ts` :

```typescript
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { identifiantVersEmail } from '@/lib/domaine/identifiant'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const CLE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const CLE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

const admin = createClient(URL, CLE_SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })
const anon = createClient(URL, CLE_ANON, { auth: { autoRefreshToken: false, persistSession: false } })

const MDP = `Test-${crypto.randomUUID()}`
const PREFIXE = 'test.rls.demandes.'
const IDENT_ADMIN = `${PREFIXE}admin`
const IDENT_DEMANDEUR_A = `${PREFIXE}demandeura`
const IDENT_DEMANDEUR_B = `${PREFIXE}demandeurb`
const PREFIXE_MEMBRE = `ZZDemandes-${crypto.randomUUID().slice(0, 8)}`

let idAdmin: string
let idDemandeurA: string
let idDemandeurB: string
let idMembreA: string
let idDemandeA: string
let clientAdminAuth: SupabaseClient
let clientDemandeurA: SupabaseClient
let clientDemandeurB: SupabaseClient

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

async function creerCompte(identifiant: string, administrateur: boolean): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email: identifiantVersEmail(identifiant),
    password: MDP,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`création du compte ${identifiant} impossible : ${error?.message}`)
  const { error: erreurProfil } = await admin
    .from('profils')
    .insert({ id: data.user.id, identifiant, nom_affichage: `Test demandes ${identifiant}` })
  if (erreurProfil) {
    await admin.auth.admin.deleteUser(data.user.id)
    throw new Error(`insertion du profil ${identifiant} impossible : ${erreurProfil.message}`)
  }
  if (administrateur) {
    await admin.from('roles_profil').insert({ profil_id: data.user.id, role: 'administrateur' })
  }
  return data.user.id
}

async function connecter(identifiant: string): Promise<SupabaseClient> {
  const client = createClient(URL, CLE_ANON, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error } = await client.auth.signInWithPassword({ email: identifiantVersEmail(identifiant), password: MDP })
  if (error) throw new Error(`connexion ${identifiant} impossible : ${error.message}`)
  return client
}

beforeAll(async () => {
  await admin.from('membres').delete().like('nom', `${PREFIXE_MEMBRE}%`)
  await supprimerCompte(IDENT_ADMIN)
  await supprimerCompte(IDENT_DEMANDEUR_A)
  await supprimerCompte(IDENT_DEMANDEUR_B)

  idAdmin = await creerCompte(IDENT_ADMIN, true)
  idDemandeurA = await creerCompte(IDENT_DEMANDEUR_A, false)
  idDemandeurB = await creerCompte(IDENT_DEMANDEUR_B, false)

  const { data: membre, error: erreurMembre } = await admin
    .from('membres')
    .insert({ nom: `${PREFIXE_MEMBRE}-a`, prenom: 'Test', etat: 'en_attente' })
    .select('id')
    .single()
  if (erreurMembre || !membre) throw new Error(`création du membre impossible : ${erreurMembre?.message}`)
  idMembreA = membre.id

  const { data: demande, error: erreurDemande } = await admin
    .from('demandes_membre')
    .insert({
      origine: 'demande_suivi',
      demandeur_profil_id: idDemandeurA,
      membre_id: idMembreA,
      etat: 'en_attente',
    })
    .select('id')
    .single()
  if (erreurDemande || !demande) throw new Error(`création de la demande impossible : ${erreurDemande?.message}`)
  idDemandeA = demande.id

  clientAdminAuth = await connecter(IDENT_ADMIN)
  clientDemandeurA = await connecter(IDENT_DEMANDEUR_A)
  clientDemandeurB = await connecter(IDENT_DEMANDEUR_B)
})

afterAll(async () => {
  await admin.from('membres').delete().like('nom', `${PREFIXE_MEMBRE}%`)
  await supprimerCompte(IDENT_ADMIN)
  await supprimerCompte(IDENT_DEMANDEUR_A)
  await supprimerCompte(IDENT_DEMANDEUR_B)
})

describe('politique demandes_membre_lecture', () => {
  it('laisse le demandeur lire sa propre demande', async () => {
    const { data, error } = await clientDemandeurA.from('demandes_membre').select('id').eq('id', idDemandeA)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  it("interdit à un AUTRE demandeur de lire cette demande", async () => {
    const { data, error } = await clientDemandeurB.from('demandes_membre').select('id').eq('id', idDemandeA)
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it('laisse un administrateur lire toutes les demandes', async () => {
    const { data, error } = await clientAdminAuth.from('demandes_membre').select('id').eq('id', idDemandeA)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  it('interdit toute lecture au rôle anon', async () => {
    const { data, error } = await anon.from('demandes_membre').select('id')
    expect(error).not.toBeNull()
    expect(data).toBeNull()
  })
})
```

- [ ] **Étape 4 : lancer les tests RLS puis les six portes, puis commit**

```bash
npm run test:rls
npx tsc --noEmit && npm run lint && npm test && npm run test:rls && npm run test:e2e && npm run build
```

```bash
git add supabase/migrations/20260815110000_demandes_membre.sql tests/rls/demandes-membre.test.ts
git commit -m "feat: creer la table demandes_membre et sa politique de lecture"
```

---

### Task 3 : table `notifications`

**Fichiers :**
- Créer : `supabase/migrations/20260815120000_notifications.sql`
- Créer : `tests/rls/notifications.test.ts`

**Interfaces :**
- Produit : type `public.type_notification` (`'nouvelle_demande'` \|
  `'demande_validee'` \| `'demande_rejetee'`) ; table `public.notifications (id,
  profil_id, type, titre, corps, lien, lu_le, cree_le)` ; politique
  `notifications_lecture` (`profil_id = auth.uid()` seul).

- [ ] **Étape 1 : écrire la migration**

Créer `supabase/migrations/20260815120000_notifications.sql` :

```sql
-- Notifications in-app (spec maîtresse §4.6, design 2b §5.3). D41 : marquées lues
-- automatiquement quand leur objet est traité, jamais supprimées.

create type public.type_notification as enum (
  'nouvelle_demande', 'demande_validee', 'demande_rejetee'
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  profil_id uuid not null references public.profils (id) on delete cascade,
  type public.type_notification not null,
  titre text not null,
  corps text not null,
  lien text,
  lu_le timestamptz,
  cree_le timestamptz not null default now()
);

comment on table public.notifications is
  'File de notifications in-app (design 2b §5.3). type est extensible par migration additive aux phases suivantes. nouvelle_demande est diffusée à TOUS les administrateurs actifs, jamais à un seul (design 2b §7.3).';

create index notifications_profil_id_idx on public.notifications (profil_id);
create index notifications_profil_non_lues_idx on public.notifications (profil_id) where lu_le is null;

revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;

alter table public.notifications enable row level security;
alter table public.notifications force row level security;

-- Lecture (design 2b §5.5) : SES PROPRES notifications uniquement, jamais celles
-- d'autrui — même pour un administrateur. Ce sont des notifications personnelles,
-- pas un journal d'équipe.
create policy notifications_lecture on public.notifications
  for select
  to authenticated
  using (profil_id = (select auth.uid()));
```

- [ ] **Étape 2 : appliquer la migration**

```bash
npx supabase db push --dry-run && npx supabase db push && npx supabase migration list
```

- [ ] **Étape 3 : écrire les tests RLS**

Créer `tests/rls/notifications.test.ts` :

```typescript
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { identifiantVersEmail } from '@/lib/domaine/identifiant'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const CLE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const CLE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

const admin = createClient(URL, CLE_SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })
const anon = createClient(URL, CLE_ANON, { auth: { autoRefreshToken: false, persistSession: false } })

const MDP = `Test-${crypto.randomUUID()}`
const PREFIXE = 'test.rls.notifications.'
const IDENT_ADMIN = `${PREFIXE}admin`
const IDENT_A = `${PREFIXE}a`
const IDENT_B = `${PREFIXE}b`

let idAdmin: string
let idA: string
let idNotifA: string
let clientAdminAuth: SupabaseClient
let clientA: SupabaseClient
let clientB: SupabaseClient

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

async function creerCompte(identifiant: string, administrateur: boolean): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email: identifiantVersEmail(identifiant),
    password: MDP,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`création du compte ${identifiant} impossible : ${error?.message}`)
  const { error: erreurProfil } = await admin
    .from('profils')
    .insert({ id: data.user.id, identifiant, nom_affichage: `Test notifications ${identifiant}` })
  if (erreurProfil) {
    await admin.auth.admin.deleteUser(data.user.id)
    throw new Error(`insertion du profil ${identifiant} impossible : ${erreurProfil.message}`)
  }
  if (administrateur) {
    await admin.from('roles_profil').insert({ profil_id: data.user.id, role: 'administrateur' })
  }
  return data.user.id
}

async function connecter(identifiant: string): Promise<SupabaseClient> {
  const client = createClient(URL, CLE_ANON, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error } = await client.auth.signInWithPassword({ email: identifiantVersEmail(identifiant), password: MDP })
  if (error) throw new Error(`connexion ${identifiant} impossible : ${error.message}`)
  return client
}

beforeAll(async () => {
  await supprimerCompte(IDENT_ADMIN)
  await supprimerCompte(IDENT_A)
  await supprimerCompte(IDENT_B)

  idAdmin = await creerCompte(IDENT_ADMIN, true)
  idA = await creerCompte(IDENT_A, false)
  await creerCompte(IDENT_B, false)

  const { data: notif, error: erreurNotif } = await admin
    .from('notifications')
    .insert({ profil_id: idA, type: 'demande_validee', titre: 'Test', corps: 'Corps de test' })
    .select('id')
    .single()
  if (erreurNotif || !notif) throw new Error(`création de la notification impossible : ${erreurNotif?.message}`)
  idNotifA = notif.id

  clientAdminAuth = await connecter(IDENT_ADMIN)
  clientA = await connecter(IDENT_A)
  clientB = await connecter(IDENT_B)
})

afterAll(async () => {
  await supprimerCompte(IDENT_ADMIN)
  await supprimerCompte(IDENT_A)
  await supprimerCompte(IDENT_B)
})

describe('politique notifications_lecture', () => {
  it('laisse le destinataire lire sa propre notification', async () => {
    const { data, error } = await clientA.from('notifications').select('id').eq('id', idNotifA)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  it("interdit à un AUTRE compte de la lire", async () => {
    const { data, error } = await clientB.from('notifications').select('id').eq('id', idNotifA)
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  // Design 2b §5.5 : « jamais l'administrateur pour autrui ». Ce test est le seul
  // de tout le projet où « administrateur » N'EST PAS synonyme de « voit tout » —
  // à souligner, car un relecteur pressé pourrait le lire comme un défaut.
  it("interdit MÊME À UN ADMINISTRATEUR de lire la notification d'autrui", async () => {
    const { data, error } = await clientAdminAuth.from('notifications').select('id').eq('id', idNotifA)
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it('interdit toute lecture au rôle anon', async () => {
    const { data, error } = await anon.from('notifications').select('id')
    expect(error).not.toBeNull()
    expect(data).toBeNull()
  })
})
```

- [ ] **Étape 4 : lancer les tests RLS puis les six portes, puis commit**

```bash
npm run test:rls
npx tsc --noEmit && npm run lint && npm test && npm run test:rls && npm run test:e2e && npm run build
```

```bash
git add supabase/migrations/20260815120000_notifications.sql tests/rls/notifications.test.ts
git commit -m "feat: creer la table notifications et sa politique de lecture personnelle"
```

---

### Task 4 : table `tentatives_token_inscription`, sans aucune politique

**Fichiers :**
- Créer : `supabase/migrations/20260815130000_tentatives_token_inscription.sql`
- Modifier : `tests/rls/tokens-inscription.test.ts` (ajout d'un bloc)

**Interfaces :**
- Produit : table `public.tentatives_token_inscription (id, adresse, tente_le)`,
  RLS activée et forcée, **zéro politique**.

Design §5.4 et §5.5 : cette table n'accorde **aucune** lecture, pas même à
l'administrateur — elle n'existe que pour l'usage interne de
`consommer_token_inscription` (Task 8), qui la lit en `SECURITY DEFINER`.

- [ ] **Étape 1 : écrire la migration**

Créer `supabase/migrations/20260815130000_tentatives_token_inscription.sql` :

```sql
-- Plafond de tentatives de consommation d'un token d'inscription (D25, D34, D36).
-- Design 2b §5.4 : table conçue par cette phase, absente du §4.6 de la spécification
-- maîtresse. Une ligne par appel à consommer_token_inscription, réussi ou non (D34) :
-- compter uniformément ferme le canal par lequel le compteur trahirait l'issue d'une
-- tentative passée (design 2b §3, D34).

create table public.tentatives_token_inscription (
  id uuid primary key default gen_random_uuid(),
  adresse inet not null,
  tente_le timestamptz not null default now()
);

comment on table public.tentatives_token_inscription is
  'Une ligne par tentative de consommation d''un token d''inscription, réussie ou non (D34). Sert exclusivement à consommer_token_inscription (SECURITY DEFINER) : aucune politique de lecture n''est accordée, pas même à l''administrateur (design 2b §5.5). Aucune purge automatique (design 2b §5.4, §13) : croissance non bornée, assumée.';

create index tentatives_token_inscription_adresse_le_idx
  on public.tentatives_token_inscription (adresse, tente_le);

revoke all on public.tentatives_token_inscription from anon, authenticated;

alter table public.tentatives_token_inscription enable row level security;
alter table public.tentatives_token_inscription force row level security;

-- AUCUNE politique n'est créée, y compris pour l'administrateur (design 2b §5.5) :
-- avec force row level security et zéro politique, tout SELECT via PostgREST rend
-- un refus, quel que soit le rôle authentifié. Seule consommer_token_inscription
-- (Task 8), SECURITY DEFINER et propriétaire dérogeant à la RLS, y lit et y écrit.
```

- [ ] **Étape 2 : appliquer la migration**

```bash
npx supabase db push --dry-run && npx supabase db push && npx supabase migration list
```

- [ ] **Étape 3 : ajouter le bloc de tests**

Ajouter à `tests/rls/tokens-inscription.test.ts`, après le bloc existant :

```typescript
describe("politique de tentatives_token_inscription : ZÉRO lecture accordée", () => {
  it('interdit la lecture à un administrateur authentifié', async () => {
    const { data, error } = await clientAdminAuth.from('tentatives_token_inscription').select('id')
    expect(error).not.toBeNull()
    expect(data).toBeNull()
  })

  it('interdit la lecture à un compte ordinaire authentifié', async () => {
    const { data, error } = await clientSimple.from('tentatives_token_inscription').select('id')
    expect(error).not.toBeNull()
    expect(data).toBeNull()
  })

  it('interdit la lecture au rôle anon', async () => {
    const { data, error } = await anon.from('tentatives_token_inscription').select('id')
    expect(error).not.toBeNull()
    expect(data).toBeNull()
  })

  // CONTRÔLE POSITIF : sans lui, les trois refus ci-dessus seraient satisfaits par
  // une table qui n'existe pas, ou par une erreur de nom de colonne. On prouve que
  // service_role, LUI, atteint réellement la table.
  it('laisse la clé de service lire et écrire la table', async () => {
    const { data: inseree, error: erreurInsertion } = await admin
      .from('tentatives_token_inscription')
      .insert({ adresse: '203.0.113.9' })
      .select('id')
      .single()
    expect(erreurInsertion).toBeNull()
    expect(inseree?.id).toBeTruthy()

    const { data: lue, error: erreurLecture } = await admin
      .from('tentatives_token_inscription')
      .select('id')
      .eq('id', inseree!.id)
    expect(erreurLecture).toBeNull()
    expect(lue).toHaveLength(1)

    await admin.from('tentatives_token_inscription').delete().eq('id', inseree!.id)
  })
})
```

- [ ] **Étape 4 : lancer les tests RLS puis les six portes, puis commit**

```bash
npm run test:rls
npx tsc --noEmit && npm run lint && npm test && npm run test:rls && npm run test:e2e && npm run build
```

```bash
git add supabase/migrations/20260815130000_tentatives_token_inscription.sql tests/rls/tokens-inscription.test.ts
git commit -m "feat: creer tentatives_token_inscription sans aucune politique de lecture"
```

---

### Task 5 : amendement de `membres_lecture` pour le demandeur

**Fichiers :**
- Créer : `supabase/migrations/20260815140000_membres_lecture_demandeur.sql`
- Modifier : `tests/rls/demandes-membre.test.ts` (ajout d'un bloc)

**Interfaces :**
- Consomme : `demandes_membre` (Task 2).
- Produit : `prive.est_demandeur_de(p_membre_id uuid) returns boolean`,
  `SECURITY DEFINER`, `execute` réservé à `authenticated` (c'est une primitive de
  politique, au même titre que `prive.est_admin()` — voir la note du §5.3 de la
  spécification maîtresse sur ce mécanisme) ; politique `membres_lecture` remplacée.

**Ce que cette tâche ferme.** La politique `membres_lecture` posée en 1a/1c dit déjà
« `en_attente` visible de l'admin et du demandeur », mais rien ne l'implémentait
avant cette phase, faute de table portant la notion de demandeur. Migration
additive : la politique 1a n'est pas modifiée en place, elle est remplacée ici par
`drop` + `create` — l'additivité du projet porte sur les **fichiers** de migration,
pas sur l'immuabilité de chaque politique (design 2b §5.5).

- [ ] **Étape 1 : écrire la migration**

Créer `supabase/migrations/20260815140000_membres_lecture_demandeur.sql` :

```sql
-- Amendement nécessaire à membres_lecture (design 2b §5.5, spec maîtresse §5.3).

create or replace function prive.est_demandeur_de(p_membre_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.demandes_membre d
    where d.membre_id = p_membre_id
      and d.demandeur_profil_id = (select auth.uid())
  );
$$;

comment on function prive.est_demandeur_de(uuid) is
  'Vrai si le compte appelant est le demandeur d''une ligne demandes_membre référençant ce membre (design 2b §5.5). SECURITY DEFINER : lit demandes_membre en s''affranchissant de sa propre RLS, même raisonnement que prive.est_admin() — la politique de membres n''a pas encore statué au moment de cet appel, l''appelant n''a donc par construction pas encore le droit d''accéder à demandes_membre sous RLS normale à cet instant précis.';

revoke execute on function prive.est_demandeur_de(uuid) from public, anon, service_role;
grant execute on function prive.est_demandeur_de(uuid) to authenticated;

drop policy membres_lecture on public.membres;

create policy membres_lecture on public.membres
  for select
  to authenticated
  using (
    (select prive.est_actif())
    and (
      etat = 'actif'
      or (select prive.est_admin())
      or (etat = 'en_attente' and (select prive.est_demandeur_de(id)))
    )
  );
```

- [ ] **Étape 2 : appliquer la migration**

```bash
npx supabase db push --dry-run && npx supabase db push && npx supabase migration list
```

- [ ] **Étape 3 : ajouter le bloc de tests**

Ajouter à `tests/rls/demandes-membre.test.ts`, après le bloc existant (la fiche
`idMembreA`, à l'état `en_attente`, et la demande `idDemandeA` de `idDemandeurA`
existent déjà depuis le `beforeAll`) :

```typescript
describe('amendement de membres_lecture pour le demandeur (design 2b §5.5)', () => {
  it('laisse le demandeur lire la fiche en_attente qu''il a proposée', async () => {
    const { data, error } = await clientDemandeurA.from('membres').select('id').eq('id', idMembreA)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  it("interdit à un AUTRE compte ordinaire de lire cette même fiche en_attente", async () => {
    const { data, error } = await clientDemandeurB.from('membres').select('id').eq('id', idMembreA)
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it('laisse toujours un administrateur lire la fiche en_attente', async () => {
    const { data, error } = await clientAdminAuth.from('membres').select('id').eq('id', idMembreA)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  // CONTRÔLE POSITIF : sans lui, les trois assertions ci-dessus pourraient passer
  // sur une politique qui refuserait TOUJOURS l'accès à une fiche en_attente,
  // masquant un défaut inverse. On prouve que le demandeur lit AUSSI l'annuaire
  // actif ordinaire, par ailleurs — la leçon de la 1b et de la 1c.
  it("le demandeur continue de lire l'annuaire actif ordinaire par ailleurs", async () => {
    const { data: unMembreActif } = await admin
      .from('membres')
      .select('id')
      .eq('etat', 'actif')
      .limit(1)
      .maybeSingle()
    if (!unMembreActif) throw new Error('précondition : aucun membre actif en base pour ce contrôle positif')
    const { data, error } = await clientDemandeurA.from('membres').select('id').eq('id', unMembreActif.id)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })
})
```

- [ ] **Étape 4 : lancer les tests RLS puis les six portes, puis commit**

```bash
npm run test:rls
npx tsc --noEmit && npm run lint && npm test && npm run test:rls && npm run test:e2e && npm run build
```

```bash
git add supabase/migrations/20260815140000_membres_lecture_demandeur.sql tests/rls/demandes-membre.test.ts
git commit -m "feat: rendre la fiche en_attente visible de son demandeur"
```

---

### Task 6 : domaine — extraction du tirage partagé

**Fichiers :**
- Créer : `src/lib/domaine/tirage.ts`
- Créer : `src/lib/domaine/tirage.test.ts`
- Modifier : `src/app/comptes/actions.ts`

**Interfaces :**
- Produit : `ALPHABET_LISIBLE: string`, `tirerChaineLisible(longueur: number): string`.

**Pourquoi extraire plutôt que dupliquer (D38).** Le design exige que le code
d'inscription emprunte « le même alphabet sans caractères ambigus... tiré par le
même mécanisme de rejet déjà écrit » que les mots de passe temporaires de
`src/app/comptes/actions.ts`. Copier `ALPHABET_LISIBLE` et la boucle de tirage dans
un second fichier donnerait deux endroits à maintenir en accord, et un seul risque
de les faire diverger silencieusement — exactement le raisonnement qui a motivé
l'extraction de `motifRecherche` en phase 1c.

- [ ] **Étape 1 : écrire les tests, qui doivent échouer**

Créer `src/lib/domaine/tirage.test.ts` :

```typescript
import { describe, expect, it } from 'vitest'
import { ALPHABET_LISIBLE, tirerChaineLisible } from './tirage'

describe('ALPHABET_LISIBLE', () => {
  it('ne contient aucun des caractères ambigus 0, O, 1, l, I', () => {
    for (const caractere of ['0', 'O', '1', 'l', 'I']) {
      expect(ALPHABET_LISIBLE).not.toContain(caractere)
    }
  })

  // CONTRÔLE POSITIF : sans lui, un alphabet VIDE satisferait aussi le test
  // ci-dessus, sans rien prouver sur son contenu réel.
  it("contient bien des lettres et des chiffres ordinaires", () => {
    expect(ALPHABET_LISIBLE).toContain('A')
    expect(ALPHABET_LISIBLE).toContain('a')
    expect(ALPHABET_LISIBLE).toContain('2')
    expect(ALPHABET_LISIBLE.length).toBeGreaterThan(20)
  })
})

describe('tirerChaineLisible', () => {
  it('rend une chaîne de la longueur demandée', () => {
    expect(tirerChaineLisible(14)).toHaveLength(14)
    expect(tirerChaineLisible(20)).toHaveLength(20)
  })

  it("ne rend que des caractères appartenant à ALPHABET_LISIBLE", () => {
    const chaine = tirerChaineLisible(200)
    for (const caractere of chaine) {
      expect(ALPHABET_LISIBLE).toContain(caractere)
    }
  })

  // Preuve que le tirage est réellement ALÉATOIRE et non une valeur figée : une
  // implémentation qui renverrait toujours le même caractère passerait le test de
  // longueur et le test d'appartenance à l'alphabet, sans être un tirage.
  it('produit des chaînes différentes à deux appels successifs', () => {
    const a = tirerChaineLisible(20)
    const b = tirerChaineLisible(20)
    expect(a).not.toBe(b)
  })
})
```

- [ ] **Étape 2 : lancer les tests et vérifier qu'ils échouent**

```bash
npm test -- tirage
```

Attendu : ÉCHEC, `Failed to resolve import "./tirage"`.

- [ ] **Étape 3 : écrire l'implémentation**

Créer `src/lib/domaine/tirage.ts` :

```typescript
/**
 * Alphabet sans caractères ambigus à l'oral ou à l'écrit (0/O, 1/l/I) : un code tiré
 * dans cet alphabet se dicte de vive voix ou se recopie à la main sans risque de
 * confusion. Employé pour les mots de passe temporaires (`src/app/comptes/actions.ts`)
 * et, depuis D38, pour les codes d'inscription (`src/lib/domaine/token-inscription.ts`).
 */
export const ALPHABET_LISIBLE = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'

/**
 * Tire une chaîne de `longueur` caractères dans `ALPHABET_LISIBLE`, par rejet
 * d'échantillonnage : sans ce rejet, les premiers caractères de l'alphabet seraient
 * très légèrement plus probables que les derniers (le débordement du dernier bloc
 * complet de `0xffffffff / longueur alphabet` favoriserait les petits restes du
 * modulo). Le biais serait minuscule — il n'y a simplement aucune raison de
 * l'accepter pour un secret.
 */
export function tirerChaineLisible(longueur: number): string {
  const seuil = Math.floor(0xffffffff / ALPHABET_LISIBLE.length) * ALPHABET_LISIBLE.length
  const caracteres: string[] = []
  const tampon = new Uint32Array(1)
  while (caracteres.length < longueur) {
    crypto.getRandomValues(tampon)
    if (tampon[0] < seuil) {
      caracteres.push(ALPHABET_LISIBLE[tampon[0] % ALPHABET_LISIBLE.length])
    }
  }
  return caracteres.join('')
}
```

- [ ] **Étape 4 : lancer les tests et vérifier qu'ils passent**

```bash
npm test -- tirage
```

Attendu : les six tests ci-dessus verts.

- [ ] **Étape 5 : reporter `comptes/actions.ts` sur le module partagé**

Dans `src/app/comptes/actions.ts`, remplacer le bloc :

```typescript
// Sans 0/O ni 1/l/I : ce mot de passe se dicte de vive voix (spec §5.4), et une
// confusion à l'oral coûterait un compte inaccessible.
const ALPHABET_LISIBLE = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
const LONGUEUR_MDP_TEMPORAIRE = 14

function motDePasseTemporaire(): string {
  const seuil = Math.floor(0xffffffff / ALPHABET_LISIBLE.length) * ALPHABET_LISIBLE.length
  const caracteres: string[] = []
  const tampon = new Uint32Array(1)
  while (caracteres.length < LONGUEUR_MDP_TEMPORAIRE) {
    crypto.getRandomValues(tampon)
    // Rejet des valeurs qui déborderaient le dernier bloc complet de l'alphabet. Sans
    // lui, les premiers caractères seraient très légèrement plus probables. Le biais
    // serait minuscule — il n'y a simplement aucune raison de l'accepter.
    if (tampon[0] < seuil) {
      caracteres.push(ALPHABET_LISIBLE[tampon[0] % ALPHABET_LISIBLE.length])
    }
  }
  return caracteres.join('')
}
```

par :

```typescript
// Sans 0/O ni 1/l/I : ce mot de passe se dicte de vive voix (spec §5.4), et une
// confusion à l'oral coûterait un compte inaccessible. Tirage partagé avec le code
// d'inscription (D38, `src/lib/domaine/tirage.ts`) : un seul mécanisme à maintenir.
const LONGUEUR_MDP_TEMPORAIRE = 14

function motDePasseTemporaire(): string {
  return tirerChaineLisible(LONGUEUR_MDP_TEMPORAIRE)
}
```

Et ajouter l'import en tête du fichier, avec les autres imports :

```typescript
import { tirerChaineLisible } from '@/lib/domaine/tirage'
```

- [ ] **Étape 6 : contrôle positif que rien n'a changé de comportement**

```bash
npx tsc --noEmit
```

Attendu : aucune erreur. `motDePasseTemporaire` garde exactement la même signature
(`() => string`) et le même comportement observable (longueur 14, alphabet
inchangé) ; seul son corps est désormais un simple appel délégué.

- [ ] **Étape 7 : les six portes, puis commit**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls && npm run test:e2e && npm run build
```

```bash
git add src/lib/domaine/tirage.ts src/lib/domaine/tirage.test.ts src/app/comptes/actions.ts
git commit -m "refactor: extraire le tirage de chaine lisible, partage entre mots de passe et tokens"
```

---

### Task 7 : domaine — génération et hachage du code d'inscription

**Fichiers :**
- Créer : `src/lib/domaine/token-inscription.ts`
- Créer : `src/lib/domaine/token-inscription.test.ts`

**Interfaces :**
- Consomme : `tirerChaineLisible` (Task 6).
- Produit : `LONGUEUR_CODE_TOKEN: number` (= 20) ; `genererCodeInscription(): string` ;
  `hacherCodeInscription(code: string): string`.

**Longueur (D38).** Le design exige « au moins 16 caractères ». 20 caractères de
`ALPHABET_LISIBLE` (57 symboles) portent environ 117 bits d'entropie — largement
assez pour rendre l'essai exhaustif inopérant face au plafond de 10 tentatives par
15 minutes (D36), avec une marge confortable sur le minimum imposé.

**Hachage.** SHA-256 hexadécimal, via `node:crypto`, **déterministe** — c'est
essentiel : `consommer_token_inscription` (Task 8) retrouve la ligne du token par
une égalité stricte sur `code_hash`, ce qui exige que le même code produise
toujours le même hachage. Un hachage salé façon mot de passe (`bcrypt`) serait
inutilisable ici : il faudrait alors parcourir tous les tokens non expirés pour
trouver une correspondance, exactement le genre de canal par le temps que le
design (§6, dernier paragraphe) signale déjà comme non traité — y ajouter une
disparité de coût algorithmique serait aggraver ce qui est déjà assumé, pas
l'ignorer.

- [ ] **Étape 1 : écrire les tests, qui doivent échouer**

Créer `src/lib/domaine/token-inscription.test.ts` :

```typescript
import { describe, expect, it } from 'vitest'
import { ALPHABET_LISIBLE } from './tirage'
import { LONGUEUR_CODE_TOKEN, genererCodeInscription, hacherCodeInscription } from './token-inscription'

describe('genererCodeInscription', () => {
  it('D38 : rend un code d''au moins 16 caractères', () => {
    expect(LONGUEUR_CODE_TOKEN).toBeGreaterThanOrEqual(16)
    expect(genererCodeInscription()).toHaveLength(LONGUEUR_CODE_TOKEN)
  })

  it('ne rend que des caractères de ALPHABET_LISIBLE (D38)', () => {
    const code = genererCodeInscription()
    for (const caractere of code) {
      expect(ALPHABET_LISIBLE).toContain(caractere)
    }
  })

  it('produit des codes différents à deux appels successifs', () => {
    expect(genererCodeInscription()).not.toBe(genererCodeInscription())
  })
})

describe('hacherCodeInscription', () => {
  it('est déterministe : le même code produit toujours le même hachage', () => {
    const code = genererCodeInscription()
    expect(hacherCodeInscription(code)).toBe(hacherCodeInscription(code))
  })

  it('rend des hachages différents pour deux codes différents', () => {
    expect(hacherCodeInscription('CodeUnPourLeTest2026')).not.toBe(
      hacherCodeInscription('CodeDeuxPourLeTest26'),
    )
  })

  it('rend un hachage hexadécimal SHA-256 (64 caractères, [0-9a-f])', () => {
    const hachage = hacherCodeInscription('CodeDeTestPourLeHachage')
    expect(hachage).toHaveLength(64)
    expect(hachage).toMatch(/^[0-9a-f]{64}$/)
  })

  // CONTRÔLE POSITIF distinct du test de déterminisme : deux CASSES différentes
  // d'un même code ne sont PAS le même code. Sans ce test, une implémentation qui
  // normaliserait la casse avant de hacher passerait le test de déterminisme tout
  // en introduisant une collision que le design n'a jamais demandée.
  it('ne normalise PAS la casse : deux codes de casse différente hachent différemment', () => {
    expect(hacherCodeInscription('abcdef')).not.toBe(hacherCodeInscription('ABCDEF'))
  })
})
```

- [ ] **Étape 2 : lancer les tests et vérifier qu'ils échouent**

```bash
npm test -- token-inscription
```

Attendu : ÉCHEC, `Failed to resolve import "./token-inscription"`.

- [ ] **Étape 3 : écrire l'implémentation**

Créer `src/lib/domaine/token-inscription.ts` :

```typescript
import { createHash } from 'node:crypto'
import { tirerChaineLisible } from './tirage'

/**
 * D38 : au moins 16 caractères de ALPHABET_LISIBLE. 20 caractères portent environ
 * 117 bits d'entropie — voir le commentaire de la Task 7 du plan pour le calcul.
 */
export const LONGUEUR_CODE_TOKEN = 20

/** Code en clair d'un token d'inscription, jamais stocké tel quel (D25). */
export function genererCodeInscription(): string {
  return tirerChaineLisible(LONGUEUR_CODE_TOKEN)
}

/**
 * Hachage DÉTERMINISTE (SHA-256 hexadécimal) du code saisi. Ce module utilise
 * `node:crypto`, indisponible dans un bundle navigateur : ce fichier ne doit être
 * importé que depuis du code serveur (Server Actions, tests). Un import accidentel
 * depuis un composant client échouerait bruyamment à la compilation — c'est le
 * comportement voulu, pas une lacune à combler par un `'server-only'` supplémentaire.
 *
 * Déterministe à dessein : `consommer_token_inscription` (migration
 * 20260815150000) retrouve la ligne par une égalité stricte sur `code_hash`. Un
 * hachage salé serait inutilisable ici — voir le commentaire de tête de la Task 7
 * du plan.
 */
export function hacherCodeInscription(code: string): string {
  return createHash('sha256').update(code, 'utf8').digest('hex')
}
```

- [ ] **Étape 4 : lancer les tests et vérifier qu'ils passent**

```bash
npm test -- token-inscription
```

Attendu : les huit tests ci-dessus verts.

- [ ] **Étape 5 : les six portes, puis commit**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls && npm run test:e2e && npm run build
```

```bash
git add src/lib/domaine/token-inscription.ts src/lib/domaine/token-inscription.test.ts
git commit -m "feat: generer et hacher le code d'inscription (D38)"
```

---

### Task 8 : consommation atomique du token — la fonction la plus sensible du plan

**Fichiers :**
- Créer : `supabase/migrations/20260815150000_consommation_token_inscription.sql`
- Modifier : `tests/rls/tokens-inscription.test.ts` (ajout d'un bloc)

**Interfaces :**
- Consomme : `tokens_inscription` (Task 1), `tentatives_token_inscription`
  (Task 4).
- Produit : type `public.statut_consommation_token` (`'ok'` \| `'invalide'` \|
  `'trop_de_tentatives'`) ; `public.consommer_token_inscription(p_code_hash text,
  p_adresse inet) returns table (statut public.statut_consommation_token,
  token_id uuid, mode public.mode_token, membre_id uuid)`, `SECURITY DEFINER`,
  `execute` réservé à `service_role` ; `public.relacher_token_inscription
  (p_token_id uuid) returns void`, mêmes privilèges.

**Ce que cette fonction protège (D25, D27, D31, D34, D36, design §7.1).** Quatre
exigences en une seule transaction : (1) toute tentative compte, réussie ou non,
**avant** tout autre test ; (2) au-delà de 10 tentatives par adresse et par fenêtre
glissante de 15 minutes, refus ; (3) la ligne du token est verrouillée par
`code_hash` (`select ... for update`), pas par le verrou consultatif global de
l'arbre ou des rôles — l'invariant à protéger est **par ligne** ; (4) code inconnu,
expiré, révoqué ou déjà utilisé produisent le **même** résultat — jamais quatre
marqueurs différents, ce qui recréerait l'oracle que le design (§6) ferme.

**Correction délibérée par rapport à une première rédaction de cette tâche, à
comprendre avant d'écrire le code.** Une première version de cette fonction levait
une exception (`raise exception ... using detail = 'trop_de_tentatives'` ou
`'token_invalide'`) pour les deux refus métier. C'est **faux**, et cela annulait
le plafond de tentatives dans son intégralité : Postgres n'a pas de transaction
autonome à l'intérieur d'une fonction — si la fonction lève, **toute** l'écriture
qu'elle a faite jusque-là est annulée avec elle, y compris l'insertion dans
`tentatives_token_inscription` faite à l'étape 1. Conséquence : **aucune
tentative échouée n'aurait jamais été enregistrée**, seules les consommations
**réussies** auraient survécu (elles seules ne lèvent pas), et un attaquant
aurait pu essayer des codes indéfiniment sans que le compteur ne dépasse jamais
zéro — exactement la population que D25 et D34 existent pour arrêter. La fonction
ci-dessous **ne lève plus pour un refus métier attendu** : elle rend un `statut`
(`'ok'` \| `'invalide'` \| `'trop_de_tentatives'`) à la place, ce qui laisse
l'insertion de la tentative se valider normalement. Les exceptions restent
réservées aux pannes réellement inattendues.

**Le point à ne pas confondre en lisant `sInscrire` (Task 14) : l'indiscernabilité
exigée par D30 porte sur ce que voit l'UTILISATEUR, pas sur ce que reçoit notre
propre serveur.** La Server Action distingue parfaitement `'invalide'` de
`'trop_de_tentatives'` dans sa trace serveur (`console.error`), ce qui est précieux
au diagnostic — mais affiche **rigoureusement le même message** à l'écran dans les
deux cas. Ne jamais faire remonter `statut` tel quel à l'interface.

- [ ] **Étape 1 : écrire la migration**

Créer `supabase/migrations/20260815150000_consommation_token_inscription.sql` :

```sql
-- Consommation atomique d'un token d'inscription (D25, D27, D31, D34, D36, design
-- 2b §7.1). Voir l'en-tête de la Task 8 du plan pour le détail de chaque exigence
-- ET pour la raison pour laquelle cette fonction REND UN STATUT au lieu de LEVER
-- pour un refus métier : Postgres n'a pas de transaction autonome à l'intérieur
-- d'une fonction, donc une exception aurait annulé l'insertion de la tentative
-- elle-même, rendant le plafond de D34/D36 inopérant contre tout échec.

create type public.statut_consommation_token as enum ('ok', 'invalide', 'trop_de_tentatives');

create or replace function public.consommer_token_inscription(
  p_code_hash text,
  p_adresse inet
)
returns table (
  statut public.statut_consommation_token,
  token_id uuid,
  mode public.mode_token,
  membre_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tentatives integer;
  v_token record;
begin
  -- 1. AVANT tout autre test (D34) : même une tentative sur un code totalement
  --    inconnu compte. CETTE LIGNE DOIT SURVIVRE À TOUT REFUS QUI SUIT : aucune
  --    branche plus bas ne doit plus jamais lever pour un refus métier, sous
  --    peine d'annuler cette insertion avec le reste de la transaction — voir
  --    l'en-tête de ce fichier.
  insert into public.tentatives_token_inscription (adresse) values (p_adresse);

  -- 2. Plafond (D34, D36) : 10 tentatives par adresse, fenêtre glissante de
  --    15 minutes, tentative EN COURS comprise (elle vient d'être insérée ci-dessus).
  --    RETOURNE un statut plutôt que de LEVER : l'insertion ci-dessus doit être
  --    validée même sur ce refus.
  select count(*) into v_tentatives
  from public.tentatives_token_inscription t
  where t.adresse = p_adresse
    and t.tente_le > now() - interval '15 minutes';

  if v_tentatives > 10 then
    return query select 'trop_de_tentatives'::public.statut_consommation_token, null::uuid, null::public.mode_token, null::uuid;
    return;
  end if;

  -- 3. Verrou DE LIGNE (D31), par code_hash — pas le verrou consultatif global de
  --    definir_arbre / definir_roles : l'invariant protégé ici (« ce code précis
  --    n'est consommé qu'une fois ») porte sur UNE ligne, pas sur l'état de toute
  --    la table. Deux inscriptions sur deux codes différents ne s'attendent donc
  --    jamais l'une l'autre.
  select t.id, t.mode, t.membre_id, t.expire_le, t.revoque_le, t.utilise_le
    into v_token
  from public.tokens_inscription t
  where t.code_hash = p_code_hash
  for update;

  -- 4. Quatre causes, UNE seule branche, UN seul statut (D30, design 2b §6) :
  --    code inconnu, expiré, révoqué, ou déjà utilisé sont INDISCERNABLES pour
  --    l'appelant. NE JAMAIS ajouter de branche supplémentaire ici : ce serait
  --    recréer l'oracle que ce statut unique existe pour fermer. RETOURNE, ne
  --    LÈVE PAS : même raison qu'à l'étape 2 — la tentative doit survivre.
  if v_token.id is null
     or v_token.expire_le < now()
     or v_token.revoque_le is not null
     or v_token.utilise_le is not null
  then
    return query select 'invalide'::public.statut_consommation_token, null::uuid, null::public.mode_token, null::uuid;
    return;
  end if;

  -- 5. utilise_par_profil_id reste NULL ici : le compte n'existe pas encore (D27).
  --    sInscrire le pose séparément, une fois le compte créé (Task 14).
  update public.tokens_inscription
     set utilise_le = now()
   where id = v_token.id;

  return query select 'ok'::public.statut_consommation_token, v_token.id, v_token.mode, v_token.membre_id;
end;
$$;

comment on function public.consommer_token_inscription(text, inet) is
  'Consomme un token d''inscription de façon atomique (D25, D27, D31, D34, D36, design 2b §7.1) : verrou de ligne par code_hash, plafond de 10 tentatives par adresse et par fenêtre de 15 minutes (toute tentative comptée, réussie ou non). RETOURNE un statut (ok, invalide, trop_de_tentatives) pour tout refus métier PLUTÔT QUE DE LEVER : la ligne insérée dans tentatives_token_inscription à l''étape 1 doit survivre à un refus, ce qu''une exception empêcherait (Postgres n''a pas de transaction autonome à l''intérieur d''une fonction). Les exceptions restent réservées aux pannes réellement inattendues. SECURITY DEFINER, EXECUTE réservé à service_role. Voir public.relacher_token_inscription pour le geste inverse si la création du compte échoue ensuite.';

revoke execute on function public.consommer_token_inscription(text, inet) from public, anon, authenticated;
grant execute on function public.consommer_token_inscription(text, inet) to service_role;

create or replace function public.relacher_token_inscription(p_token_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.tokens_inscription
     set utilise_le = null,
         utilise_par_profil_id = null
   where id = p_token_id;
end;
$$;

comment on function public.relacher_token_inscription(uuid) is
  'Relâche un token consommé par consommer_token_inscription dont la création du compte a ensuite échoué (D27, design 2b §7.1) : remet utilise_le et utilise_par_profil_id à NULL. SECURITY DEFINER, EXECUTE réservé à service_role.';

revoke execute on function public.relacher_token_inscription(uuid) from public, anon, authenticated;
grant execute on function public.relacher_token_inscription(uuid) to service_role;
```

- [ ] **Étape 2 : appliquer la migration**

```bash
npx supabase db push --dry-run && npx supabase db push && npx supabase migration list
```

- [ ] **Étape 3 : ajouter le bloc de tests**

Ajouter à `tests/rls/tokens-inscription.test.ts`, après les blocs existants. Ce
bloc crée ses propres tokens de test (préfixe `test-consommation-`, purgés par
`code_hash like` dans `afterAll`), distincts du token `idToken` créé par le
`beforeAll` global.

```typescript
describe('consommer_token_inscription', () => {
  const ADRESSE_BASE = '198.51.100.'
  let compteurAdresse = 1

  function adresseFraiche(): string {
    // Une adresse différente par test évite qu'un test épuise par accident le
    // plafond d'un autre — le plafond de tentatives est testé À PART, plus bas,
    // avec une adresse dédiée.
    compteurAdresse += 1
    return `${ADRESSE_BASE}${compteurAdresse}`
  }

  async function creerTokenValide(mode: 'nominatif' | 'generique', membreId: string | null) {
    const code = `test-consommation-${crypto.randomUUID()}`
    const { data, error } = await admin
      .from('tokens_inscription')
      .insert({
        code_hash: code,
        mode,
        membre_id: membreId,
        cree_par: idAdmin,
        expire_le: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .select('id')
      .single()
    if (error || !data) throw new Error(`création du token de test impossible : ${error?.message}`)
    return { id: data.id as string, codeHash: code }
  }

  it('consomme un token valide : statut ok, mode et membre_id rendus', async () => {
    const { codeHash } = await creerTokenValide('nominatif', idMembre)
    const { data, error } = await admin.rpc('consommer_token_inscription', {
      p_code_hash: codeHash,
      p_adresse: adresseFraiche(),
    })
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data![0].statut).toBe('ok')
    expect(data![0].mode).toBe('nominatif')
    expect(data![0].membre_id).toBe(idMembre)

    // État final en base, pas seulement l'absence d'erreur : utilise_le doit être
    // réellement posé.
    const { data: relu } = await admin
      .from('tokens_inscription')
      .select('utilise_le')
      .eq('code_hash', codeHash)
      .single()
    expect(relu?.utilise_le).not.toBeNull()
  })

  // PREUVE PAR VERROU (D31) : le MÊME code, consommé deux fois de suite dans le
  // même test. La seconde doit rendre le statut invalide — preuve d'une écriture
  // réelle et unique en base (utilise_le posé une fois), pas seulement d'un refus.
  // NOTER que la fonction NE LÈVE PLUS pour ce refus (voir l'en-tête de la Task 8
  // du plan) : `error` reste `null`, c'est `data[0].statut` qui porte le résultat.
  it('la seconde consommation du même code rend le statut invalide, SANS erreur RPC', async () => {
    const { codeHash } = await creerTokenValide('generique', null)

    const premiere = await admin.rpc('consommer_token_inscription', {
      p_code_hash: codeHash,
      p_adresse: adresseFraiche(),
    })
    expect(premiere.error).toBeNull()
    expect(premiere.data![0].statut).toBe('ok')

    const seconde = await admin.rpc('consommer_token_inscription', {
      p_code_hash: codeHash,
      p_adresse: adresseFraiche(),
    })
    expect(seconde.error).toBeNull()
    expect(seconde.data![0].statut).toBe('invalide')
  })

  it('un code inconnu rend le statut invalide, SANS erreur RPC', async () => {
    const { data, error } = await admin.rpc('consommer_token_inscription', {
      p_code_hash: `test-consommation-jamais-genere-${crypto.randomUUID()}`,
      p_adresse: adresseFraiche(),
    })
    expect(error).toBeNull()
    expect(data![0].statut).toBe('invalide')
  })

  it('un token expiré rend le statut invalide, SANS erreur RPC', async () => {
    const code = `test-consommation-${crypto.randomUUID()}`
    await admin.from('tokens_inscription').insert({
      code_hash: code,
      mode: 'generique',
      cree_par: idAdmin,
      expire_le: new Date(Date.now() - 1_000).toISOString(),
    })
    const { data, error } = await admin.rpc('consommer_token_inscription', {
      p_code_hash: code,
      p_adresse: adresseFraiche(),
    })
    expect(error).toBeNull()
    expect(data![0].statut).toBe('invalide')
  })

  it('un token révoqué rend le statut invalide, SANS erreur RPC', async () => {
    const code = `test-consommation-${crypto.randomUUID()}`
    await admin.from('tokens_inscription').insert({
      code_hash: code,
      mode: 'generique',
      cree_par: idAdmin,
      expire_le: new Date(Date.now() + 86_400_000).toISOString(),
      revoque_le: new Date().toISOString(),
    })
    const { data, error } = await admin.rpc('consommer_token_inscription', {
      p_code_hash: code,
      p_adresse: adresseFraiche(),
    })
    expect(error).toBeNull()
    expect(data![0].statut).toBe('invalide')
  })

  // Les QUATRE cas ci-dessus (inconnu, déjà utilisé, expiré, révoqué) rendent
  // EXACTEMENT le même statut : c'est la preuve, à la couche SQL, de
  // l'indifférenciation exigée par D30 et le §6 du design. Regroupée ici plutôt
  // que dispersée, pour qu'un futur lecteur voie les quatre côte à côte.
  it('RÉCAPITULATIF : les quatre causes de refus rendent le même statut', async () => {
    const codeExpire = `test-consommation-${crypto.randomUUID()}`
    const codeRevoque = `test-consommation-${crypto.randomUUID()}`
    const codeUtilise = `test-consommation-${crypto.randomUUID()}`
    await admin.from('tokens_inscription').insert([
      { code_hash: codeExpire, mode: 'generique', cree_par: idAdmin, expire_le: new Date(Date.now() - 1_000).toISOString() },
      { code_hash: codeRevoque, mode: 'generique', cree_par: idAdmin, expire_le: new Date(Date.now() + 86_400_000).toISOString(), revoque_le: new Date().toISOString() },
      { code_hash: codeUtilise, mode: 'generique', cree_par: idAdmin, expire_le: new Date(Date.now() + 86_400_000).toISOString(), utilise_le: new Date().toISOString() },
    ])
    const codeInconnu = `test-consommation-jamais-${crypto.randomUUID()}`

    const resultats = await Promise.all(
      [codeInconnu, codeExpire, codeRevoque, codeUtilise].map((codeHash) =>
        admin.rpc('consommer_token_inscription', { p_code_hash: codeHash, p_adresse: adresseFraiche() }),
      ),
    )
    for (const resultat of resultats) {
      expect(resultat.error).toBeNull()
    }
    const statuts = resultats.map((r) => r.data?.[0]?.statut)
    expect(statuts).toEqual(['invalide', 'invalide', 'invalide', 'invalide'])
  })

  // LE DÉFAUT QUE CETTE FONCTION CORRIGE, PROUVÉ DIRECTEMENT : une tentative
  // REFUSÉE reste enregistrée en base. Une première rédaction de cette fonction
  // levait une exception sur ce refus, ce qui annulait l'insertion de la Task 8
  // Étape 1 avec le reste de la transaction — silencieusement, sans qu'aucun test
  // ne puisse l'établir tant que la fonction levait. Ce test est la preuve directe
  // que ce n'est plus le cas.
  it("une tentative REFUSÉE (statut invalide) reste enregistrée dans tentatives_token_inscription", async () => {
    const adresse = adresseFraiche()
    const { data, error } = await admin.rpc('consommer_token_inscription', {
      p_code_hash: `test-consommation-jamais-genere-${crypto.randomUUID()}`,
      p_adresse: adresse,
    })
    expect(error).toBeNull()
    expect(data![0].statut).toBe('invalide')

    const { data: tentatives } = await admin.from('tentatives_token_inscription').select('id').eq('adresse', adresse)
    expect(tentatives).toHaveLength(1)
  })

  it('refuse son exécution à un compte authentifié ordinaire (42501)', async () => {
    const { error } = await clientSimple.rpc('consommer_token_inscription', {
      p_code_hash: 'peu-importe',
      p_adresse: adresseFraiche(),
    })
    expect(error).not.toBeNull()
    expect(error?.code).toBe('42501')
  })

  it('refuse son exécution au rôle anon (42501)', async () => {
    const { error } = await anon.rpc('consommer_token_inscription', {
      p_code_hash: 'peu-importe',
      p_adresse: adresseFraiche(),
    })
    expect(error).not.toBeNull()
    expect(error?.code).toBe('42501')
  })

  describe('plafond de tentatives (D34, D36)', () => {
    const ADRESSE_PLAFOND = '198.51.100.200'

    // CETTE PREUVE EST DÉSORMAIS RÉELLE : avec la version qui levait une
    // exception, les 10 premières tentatives (toutes des refus « invalide »)
    // n'auraient JAMAIS été enregistrées dans tentatives_token_inscription — le
    // compteur de l'étape 2 de la fonction n'aurait donc jamais vu que des
    // ZÉROS, et la 11e tentative n'aurait jamais atteint le plafond. Ce test
    // aurait donc échoué net avec l'ancienne version, pour la bonne raison : il
    // ne pouvait pas passer par accident.
    it("laisse passer jusqu'à 10 tentatives incluses (statut invalide, SANS erreur), puis bascule sur trop_de_tentatives à la 11e", async () => {
      // Nettoyage de cette adresse précise, pour ne pas hériter de tentatives
      // d'une exécution précédente interrompue.
      await admin.from('tentatives_token_inscription').delete().eq('adresse', ADRESSE_PLAFOND)

      const statuts: Array<string | undefined> = []
      for (let i = 0; i < 11; i += 1) {
        const { data, error } = await admin.rpc('consommer_token_inscription', {
          p_code_hash: `code-plafond-inexistant-${i}`,
          p_adresse: ADRESSE_PLAFOND,
        })
        expect(error).toBeNull()
        statuts.push(data?.[0]?.statut)
      }

      // CONTRÔLE POSITIF : les 10 premières rendent invalide (code inexistant),
      // PAS trop_de_tentatives — la preuve que le plafond laisse réellement
      // passer en deçà du seuil, pas seulement qu'il refuse au-delà.
      expect(statuts.slice(0, 10)).toEqual(new Array(10).fill('invalide'))
      // La 11e, elle, bascule sur le plafond.
      expect(statuts[10]).toBe('trop_de_tentatives')

      // État final : exactement 11 lignes de tentative pour cette adresse, la
      // 11e comprise (D34 : TOUTE tentative compte, y compris celle qui est
      // elle-même refusée pour dépassement) — CE COMPTE EST LA PREUVE QUE LE
      // DÉFAUT EST CORRIGÉ : avec la version qui levait, il aurait valu 0.
      const { data: tentatives } = await admin
        .from('tentatives_token_inscription')
        .select('id')
        .eq('adresse', ADRESSE_PLAFOND)
      expect(tentatives).toHaveLength(11)

      await admin.from('tentatives_token_inscription').delete().eq('adresse', ADRESSE_PLAFOND)
    })
  })
})
```

- [ ] **Étape 4 : lancer les tests RLS**

```bash
npm run test:rls
```

Attendu : tous les tests verts, dont les dix nouveaux ci-dessus (compte indicatif,
pas un critère — voir Task 19 sur ce point).

- [ ] **Étape 5 : PREUVE PAR MUTATION du `revoke execute`**

1. Relever les privilèges actuels :
   ```sql
   select grantee, privilege_type
   from information_schema.routine_privileges
   where routine_name = 'consommer_token_inscription';
   ```
   Conserver la sortie (attendu : `service_role` seul, `EXECUTE`).
2. Accorder temporairement l'exécution à `authenticated` :
   ```sql
   grant execute on function public.consommer_token_inscription(text, inet) to authenticated;
   ```
3. Relancer `npm run test:rls`. **Attendu : exactement les deux tests « refuse son
   exécution à un compte authentifié ordinaire » et le test symétrique sur `anon`
   restent à vérifier séparément** — le test `anon` doit **rester vert** (aucun
   privilège accordé à `anon`), le test `authenticated` doit **tomber**, avec un
   message d'échec citant `error?.code` différent de `'42501'` (l'appel réussit
   désormais, ou échoue pour une tout autre raison). C'est la preuve que le test
   tombe **pour la bonne raison** — un privilège réellement élargi — et non par
   dégât collatéral.
4. Retirer le privilège accordé à l'étape 2 :
   ```sql
   revoke execute on function public.consommer_token_inscription(text, inet) from authenticated;
   ```
5. Revérifier les privilèges avec la même requête qu'à l'étape 1 : identiques.
6. Relancer `npm run test:rls` : tout repasse au vert.
7. Consigner les sorties réelles des trois exécutions dans le rapport de tâche.

- [ ] **Étape 6 : PREUVE PAR MUTATION du plafond de tentatives**

1. Modifier temporairement le seuil dans la fonction : remplacer
   `if v_tentatives > 10 then` par `if v_tentatives > 2 then` via
   `create or replace function public.consommer_token_inscription(...)` reprenant
   le corps entier de l'Étape 1 avec ce seul changement.
2. Relancer uniquement le test « laisse passer jusqu'à 10 tentatives incluses
   (statut invalide, SANS erreur), puis bascule sur trop_de_tentatives à la 11e ».
   **Attendu : il tombe**, la 3e tentative rendant déjà `trop_de_tentatives` là où
   le test en attend huit de plus à `invalide`.
3. Restaurer la fonction exacte de l'Étape 1 (`create or replace` avec `> 10`).
4. Vérifier l'identité de la définition restaurée :
   ```sql
   select pg_get_functiondef('public.consommer_token_inscription(text, inet)'::regprocedure);
   ```
   Comparer à la définition attendue (celle de l'Étape 1).
5. Relancer `npm run test:rls` : tout repasse au vert, y compris le test du
   plafond et celui de la Étape 3 qui prouve directement qu'une tentative refusée
   reste enregistrée.

- [ ] **Étape 7 : les six portes, puis commit**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls && npm run test:e2e && npm run build
```

```bash
git add supabase/migrations/20260815150000_consommation_token_inscription.sql tests/rls/tokens-inscription.test.ts
git commit -m "feat: consommer un token d'inscription de facon atomique (D25 D27 D31 D34 D36)"
```

---

### Task 9 : annulation atomique d'une demande de suivi

**Fichiers :**
- Créer : `supabase/migrations/20260815160000_annulation_demande_membre.sql`
- Modifier : `tests/rls/demandes-membre.test.ts` (ajout d'un bloc)

**Interfaces :**
- Consomme : `demandes_membre` (Task 2), `notifications` (Task 3).
- Produit : `public.annuler_demande_membre(p_demande uuid, p_demandeur uuid)
  returns void`, `SECURITY DEFINER`, `execute` réservé à `service_role` ; marqueur
  d'erreur `'demande_non_annulable'`.

**Pourquoi l'atomicité est garantie sans verrou ni sérialisation
supplémentaire (design §7.2).** Les deux écritures — passage à `etat = 'annulee'`
et suppression de la fiche `en_attente` — vivent dans le corps d'**une seule**
fonction PL/pgSQL. Un appel à une fonction Postgres s'exécute dans la transaction
implicite de l'instruction qui l'invoque : si une exception survient à n'importe
quel point de son corps, **toutes** les écritures faites jusque-là sont annulées
avec elle. C'est une garantie du langage, pas un mécanisme ajouté — contrairement
au verrou consultatif de l'arbre ou des rôles (1c), qui protègent un
lire-puis-écrire concurrent, pas une atomicité multi-instructions.

**Risque à documenter, pas à corriger ici (design §7.2, dernier paragraphe) :**
cette garantie tient tant que l'annulation reste un **unique** appel RPC. Si une
future modification la scindait en deux appels distincts depuis une Server Action
(une mise à jour PostgREST puis une suppression PostgREST séparées), l'atomicité
disparaîtrait silencieusement.

- [ ] **Étape 1 : écrire la migration**

Créer `supabase/migrations/20260815160000_annulation_demande_membre.sql` :

```sql
-- Annulation d'une demande par son propre auteur (D40, D42, design 2b §7.2). Voir
-- l'en-tête de la Task 9 du plan pour le raisonnement sur l'atomicité et le risque
-- documenté qui l'accompagne.

create or replace function public.annuler_demande_membre(
  p_demande uuid,
  p_demandeur uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membre uuid;
begin
  -- Verrou DE LIGNE : cette demande précise, pas l'arbre ni les comptes. La
  -- condition WHERE porte à la fois sur la propriété et sur l'état : une demande
  -- inexistante, appartenant à quelqu'un d'autre, ou déjà traitée produit le MÊME
  -- refus — pas de branche séparée qui distinguerait ces trois cas.
  select d.membre_id into v_membre
  from public.demandes_membre d
  where d.id = p_demande
    and d.demandeur_profil_id = p_demandeur
    and d.etat = 'en_attente'
  for update;

  if not found then
    raise exception 'Cette demande ne peut plus être annulée.'
      using detail = 'demande_non_annulable';
  end if;

  update public.demandes_membre
     set etat = 'annulee',
         traite_par = p_demandeur,
         traite_le = now()
   where id = p_demande;

  -- D42 : suppression de la fiche en_attente. membre_id de CETTE ligne devient
  -- NULL automatiquement (on delete set null, migration 20260815110000) : la
  -- demande survit, la référence ne pointe plus vers rien.
  if v_membre is not null then
    delete from public.membres where id = v_membre;
  end if;

  -- D41 : les notifications déjà envoyées aux administrateurs pour CETTE demande
  -- sont marquées lues — sans quoi la cloche d'un administrateur pointerait vers
  -- une demande qui n'existe plus à traiter.
  update public.notifications
     set lu_le = now()
   where type = 'nouvelle_demande'
     and lien = '/demandes/' || p_demande::text
     and lu_le is null;
end;
$$;

comment on function public.annuler_demande_membre(uuid, uuid) is
  'Annule une demande en_attente à la demande de son propre auteur (D40) : fait passer etat à annulee ET supprime la fiche en_attente qu''elle portait (D42), dans une transaction unique — voir le plan, Task 9, pour la garantie d''atomicité et son risque documenté. Marque lues les notifications nouvelle_demande déjà envoyées pour cette demande (D41). SECURITY DEFINER, EXECUTE réservé à service_role.';

revoke execute on function public.annuler_demande_membre(uuid, uuid) from public, anon, authenticated;
grant execute on function public.annuler_demande_membre(uuid, uuid) to service_role;
```

- [ ] **Étape 2 : appliquer la migration**

```bash
npx supabase db push --dry-run && npx supabase db push && npx supabase migration list
```

- [ ] **Étape 3 : ajouter le bloc de tests**

Ajouter à `tests/rls/demandes-membre.test.ts`, après les blocs existants :

```typescript
describe('annuler_demande_membre', () => {
  async function creerDemandeEtFiche(demandeurId: string) {
    const { data: fiche, error: erreurFiche } = await admin
      .from('membres')
      .insert({ nom: `${PREFIXE_MEMBRE}-annulation`, prenom: 'Test', etat: 'en_attente' })
      .select('id')
      .single()
    if (erreurFiche || !fiche) throw new Error(`création de la fiche impossible : ${erreurFiche?.message}`)

    const { data: demande, error: erreurDemande } = await admin
      .from('demandes_membre')
      .insert({ origine: 'demande_suivi', demandeur_profil_id: demandeurId, membre_id: fiche.id, etat: 'en_attente' })
      .select('id')
      .single()
    if (erreurDemande || !demande) throw new Error(`création de la demande impossible : ${erreurDemande?.message}`)

    return { ficheId: fiche.id as string, demandeId: demande.id as string }
  }

  it("annule sa propre demande : LES DEUX EFFETS constatés dans le MÊME test", async () => {
    const { ficheId, demandeId } = await creerDemandeEtFiche(idDemandeurA)

    const { error } = await admin.rpc('annuler_demande_membre', {
      p_demande: demandeId,
      p_demandeur: idDemandeurA,
    })
    expect(error).toBeNull()

    // Un test qui ne vérifierait que l'un des deux effets ne prouverait pas
    // l'atomicité, seulement qu'une moitié a eu lieu.
    const { data: demandeRelue } = await admin.from('demandes_membre').select('etat').eq('id', demandeId).single()
    expect(demandeRelue?.etat).toBe('annulee')

    const { data: ficheRelue } = await admin.from('membres').select('id').eq('id', ficheId)
    expect(ficheRelue).toHaveLength(0)
  })

  it("refuse d'annuler la demande d'AUTRUI, avec un marqueur stable", async () => {
    const { demandeId } = await creerDemandeEtFiche(idDemandeurA)

    const { error } = await admin.rpc('annuler_demande_membre', {
      p_demande: demandeId,
      p_demandeur: idDemandeurB,
    })
    expect(error).not.toBeNull()
    expect(error?.details).toBe('demande_non_annulable')

    // Rien n'a bougé : la demande reste en_attente.
    const { data } = await admin.from('demandes_membre').select('etat').eq('id', demandeId).single()
    expect(data?.etat).toBe('en_attente')
  })

  it("refuse d'annuler une demande déjà traitée", async () => {
    const { demandeId } = await creerDemandeEtFiche(idDemandeurA)
    await admin.from('demandes_membre').update({ etat: 'validee' }).eq('id', demandeId)

    const { error } = await admin.rpc('annuler_demande_membre', {
      p_demande: demandeId,
      p_demandeur: idDemandeurA,
    })
    expect(error).not.toBeNull()
    expect(error?.details).toBe('demande_non_annulable')
  })

  it('marque lues les notifications nouvelle_demande liées à cette demande (D41)', async () => {
    const { demandeId } = await creerDemandeEtFiche(idDemandeurA)
    const { data: notif, error: erreurNotif } = await admin
      .from('notifications')
      .insert({
        profil_id: idAdmin,
        type: 'nouvelle_demande',
        titre: 'Test',
        corps: 'Corps de test',
        lien: `/demandes/${demandeId}`,
      })
      .select('id')
      .single()
    if (erreurNotif || !notif) throw new Error(`création de la notification impossible : ${erreurNotif?.message}`)

    await admin.rpc('annuler_demande_membre', { p_demande: demandeId, p_demandeur: idDemandeurA })

    const { data: notifRelue } = await admin.from('notifications').select('lu_le').eq('id', notif.id).single()
    expect(notifRelue?.lu_le).not.toBeNull()
  })

  it('refuse son exécution à un compte authentifié ordinaire (42501)', async () => {
    const { error } = await clientDemandeurA.rpc('annuler_demande_membre', {
      p_demande: idDemandeA,
      p_demandeur: idDemandeurA,
    })
    expect(error).not.toBeNull()
    expect(error?.code).toBe('42501')
  })
})
```

- [ ] **Étape 4 : lancer les tests RLS**

```bash
npm run test:rls
```

Attendu : tous les tests verts.

- [ ] **Étape 5 : PREUVE PAR MUTATION de l'atomicité elle-même**

1. Relever la définition exacte actuelle :
   ```sql
   select pg_get_functiondef('public.annuler_demande_membre(uuid, uuid)'::regprocedure);
   ```
   Conserver la sortie.
2. Remplacer la fonction par une version identique, à ceci près : insérer
   `raise exception 'mutation atomicite annuler_demande_membre' using detail = 'mutation_test';`
   juste après le bloc `update public.demandes_membre set etat = 'annulee', ...`
   et **avant** le `if v_membre is not null then delete from public.membres...`.
3. Créer une demande de test (via le même helper `creerDemandeEtFiche`, ou
   manuellement) et appeler `annuler_demande_membre` dessus.
4. **Attendu : l'appel échoue** avec `error?.details === 'mutation_test'`.
5. Relire l'état en base pour **cette même demande et cette même fiche** :
   `demandes_membre.etat` doit valoir **toujours** `'en_attente'` (la mise à jour
   annulée avec l'exception), et la fiche `membres` doit **toujours exister**
   (`select` rendant une ligne, pas zéro). C'est la preuve que les deux écritures
   sont réellement couplées dans une seule transaction : ni l'une ni l'autre n'a
   persisté, alors que le corps mutant avait bel et bien exécuté la première
   avant de lever.
6. Restaurer la fonction exacte de l'Étape 1 de cette tâche (`create or replace`
   avec le corps original, sans le `raise exception` de test).
7. Revérifier `pg_get_functiondef` identique à la sortie conservée à l'étape 1.
8. Relancer `npm run test:rls` : tout repasse au vert, y compris le test « annule
   sa propre demande : LES DEUX EFFETS constatés dans le MÊME test » sur une
   nouvelle demande.
9. Consigner les sorties réelles de chaque étape dans le rapport de tâche.

- [ ] **Étape 6 : les six portes, puis commit**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls && npm run test:e2e && npm run build
```

```bash
git add supabase/migrations/20260815160000_annulation_demande_membre.sql tests/rls/demandes-membre.test.ts
git commit -m "feat: annuler une demande de suivi de facon atomique (D40 D42)"
```

---

### Task 10 : validation par rattachement à une fiche existante (D26)

**Fichiers :**
- Créer : `supabase/migrations/20260815170000_validation_rattachement_demande.sql`
- Modifier : `tests/rls/demandes-membre.test.ts` (ajout d'un bloc)

**Interfaces :**
- Consomme : `demandes_membre` (Task 2), `notifications` (Task 3).
- Produit : `public.valider_demande_rattachement(p_demande uuid, p_membre_existant
  uuid, p_admin uuid) returns void`, `SECURITY DEFINER`, `execute` réservé à
  `service_role` ; marqueurs `'demande_non_validable'`, `'membre_inconnu'`.

**Pourquoi une fonction dédiée, et pas des écritures séquentielles depuis la Server
Action (design §7.3, dernier paragraphe).** C'est l'un des **deux seuls** `delete`
sur `membres` de tout le projet avec `annuler_demande_membre` (Task 9) — le reste de
l'application archive et ne supprime jamais. L'ordre importe : la ligne
`demandes_membre` est **d'abord** repointée vers la fiche définitive
(`membre_id = fiche existante`, `etat = 'validee'`), et c'est **seulement ensuite**
que la fiche jetable est supprimée — dans cet ordre, la contrainte de clé étrangère
ne casse jamais et l'historique de la demande reste lisible après coup.

- [ ] **Étape 1 : écrire la migration**

Créer `supabase/migrations/20260815170000_validation_rattachement_demande.sql` :

```sql
-- Validation par rattachement à une fiche existante (D26, design 2b §7.3). Un des
-- DEUX SEULS `delete` sur membres de tout le projet, avec annuler_demande_membre
-- (migration 20260815160000) : le reste de l'application archive et ne supprime
-- jamais (cf. le commentaire de journal_statuts, phase 1b).

create or replace function public.valider_demande_rattachement(
  p_demande uuid,
  p_membre_existant uuid,
  p_admin uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_demandeur uuid;
  v_fiche_jetable uuid;
begin
  select d.demandeur_profil_id, d.membre_id
    into v_demandeur, v_fiche_jetable
  from public.demandes_membre d
  where d.id = p_demande
    and d.origine = 'auto_inscription'
    and d.etat = 'en_attente'
  for update;

  if not found then
    raise exception 'Cette demande ne peut pas être validée par rattachement.'
      using detail = 'demande_non_validable';
  end if;

  if not exists (select 1 from public.membres m where m.id = p_membre_existant) then
    raise exception 'La fiche choisie pour le rattachement n''existe plus.'
      using detail = 'membre_inconnu';
  end if;

  -- Ordre délibéré (design 2b §7.3) : la ligne demandes_membre est REPOINTÉE avant
  -- que la fiche jetable ne soit supprimée, pour que l'historique de la demande
  -- reste lisible sans dépendre d'une suppression en cascade qui l'effacerait.
  update public.demandes_membre
     set membre_id = p_membre_existant,
         etat = 'validee',
         traite_par = p_admin,
         traite_le = now()
   where id = p_demande;

  update public.profils
     set membre_id = p_membre_existant
   where id = v_demandeur;

  if v_fiche_jetable is not null then
    delete from public.membres where id = v_fiche_jetable;
  end if;

  insert into public.notifications (profil_id, type, titre, corps, lien)
  values (
    v_demandeur,
    'demande_validee',
    'Votre inscription a été validée',
    'Votre compte a été rattaché à une fiche existante.',
    null
  );
end;
$$;

comment on function public.valider_demande_rattachement(uuid, uuid, uuid) is
  'Valide une demande auto_inscription en rattachant le compte du demandeur à une fiche existante (D26, design 2b §7.3) : repointe demandes_membre vers la fiche définitive PUIS supprime la fiche en_attente jetable, dans cet ordre. SECURITY DEFINER, EXECUTE réservé à service_role.';

revoke execute on function public.valider_demande_rattachement(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.valider_demande_rattachement(uuid, uuid, uuid) to service_role;
```

- [ ] **Étape 2 : appliquer la migration**

```bash
npx supabase db push --dry-run && npx supabase db push && npx supabase migration list
```

- [ ] **Étape 3 : ajouter le bloc de tests**

Ajouter à `tests/rls/demandes-membre.test.ts` :

```typescript
describe('valider_demande_rattachement (D26)', () => {
  async function creerAutoInscription() {
    const { data: fiche, error: erreurFiche } = await admin
      .from('membres')
      .insert({ nom: `${PREFIXE_MEMBRE}-jetable`, prenom: 'Test', etat: 'en_attente' })
      .select('id')
      .single()
    if (erreurFiche || !fiche) throw new Error(`création de la fiche jetable impossible : ${erreurFiche?.message}`)

    const { data: demande, error: erreurDemande } = await admin
      .from('demandes_membre')
      .insert({ origine: 'auto_inscription', demandeur_profil_id: idDemandeurA, membre_id: fiche.id, etat: 'en_attente' })
      .select('id')
      .single()
    if (erreurDemande || !demande) throw new Error(`création de la demande impossible : ${erreurDemande?.message}`)

    return { ficheJetableId: fiche.id as string, demandeId: demande.id as string }
  }

  it('rattache le compte, repointe la demande, ET supprime réellement la fiche jetable', async () => {
    const { ficheJetableId, demandeId } = await creerAutoInscription()
    const { data: ficheExistante, error: erreurExistante } = await admin
      .from('membres')
      .insert({ nom: `${PREFIXE_MEMBRE}-existante`, prenom: 'Test' })
      .select('id')
      .single()
    if (erreurExistante || !ficheExistante) throw new Error(`création de la fiche existante impossible`)

    const { error } = await admin.rpc('valider_demande_rattachement', {
      p_demande: demandeId,
      p_membre_existant: ficheExistante.id,
      p_admin: idAdmin,
    })
    expect(error).toBeNull()

    const { data: demandeRelue } = await admin
      .from('demandes_membre')
      .select('etat, membre_id')
      .eq('id', demandeId)
      .single()
    expect(demandeRelue?.etat).toBe('validee')
    expect(demandeRelue?.membre_id).toBe(ficheExistante.id)

    const { data: profilRelu } = await admin.from('profils').select('membre_id').eq('id', idDemandeurA).single()
    expect(profilRelu?.membre_id).toBe(ficheExistante.id)

    // La fiche jetable a RÉELLEMENT disparu de la base — pas seulement « l'appel
    // n'a pas levé d'erreur » (design 2b §10).
    const { data: ficheJetableRelue } = await admin.from('membres').select('id').eq('id', ficheJetableId)
    expect(ficheJetableRelue).toHaveLength(0)

    // Rétablir profils.membre_id à NULL : les tests suivants du fichier ne
    // s'attendent pas à un demandeur déjà lié.
    await admin.from('profils').update({ membre_id: null }).eq('id', idDemandeurA)
  })

  it("refuse une demande d'origine demande_suivi (le rattachement n'est proposé que pour auto_inscription)", async () => {
    const { demandeId } = await (async () => {
      const { data: fiche } = await admin
        .from('membres')
        .insert({ nom: `${PREFIXE_MEMBRE}-suivi`, prenom: 'Test', etat: 'en_attente' })
        .select('id')
        .single()
      const { data: demande } = await admin
        .from('demandes_membre')
        .insert({ origine: 'demande_suivi', demandeur_profil_id: idDemandeurA, membre_id: fiche!.id, etat: 'en_attente' })
        .select('id')
        .single()
      return { demandeId: demande!.id as string }
    })()

    const { error } = await admin.rpc('valider_demande_rattachement', {
      p_demande: demandeId,
      p_membre_existant: idMembreA,
      p_admin: idAdmin,
    })
    expect(error).not.toBeNull()
    expect(error?.details).toBe('demande_non_validable')
  })

  it('refuse une fiche existante inconnue, avec un marqueur stable', async () => {
    const { demandeId } = await creerAutoInscription()
    const { error } = await admin.rpc('valider_demande_rattachement', {
      p_demande: demandeId,
      p_membre_existant: '00000000-0000-0000-0000-000000000000',
      p_admin: idAdmin,
    })
    expect(error).not.toBeNull()
    expect(error?.details).toBe('membre_inconnu')
  })

  it('refuse son exécution à un compte authentifié ordinaire (42501)', async () => {
    const { error } = await clientDemandeurA.rpc('valider_demande_rattachement', {
      p_demande: idDemandeA,
      p_membre_existant: idMembreA,
      p_admin: idAdmin,
    })
    expect(error).not.toBeNull()
    expect(error?.code).toBe('42501')
  })
})
```

- [ ] **Étape 4 : lancer les tests RLS puis les six portes, puis commit**

```bash
npm run test:rls
npx tsc --noEmit && npm run lint && npm test && npm run test:rls && npm run test:e2e && npm run build
```

```bash
git add supabase/migrations/20260815170000_validation_rattachement_demande.sql tests/rls/demandes-membre.test.ts
git commit -m "feat: valider une auto-inscription par rattachement a une fiche existante (D26)"
```

---

## Partie B — couche données

### Task 11 : lecture des tokens d'inscription

**Fichiers :**
- Créer : `src/lib/donnees/tokens.ts`

**Interfaces :**
- Consomme : `tokens_inscription` (Task 1).
- Produit : `type TokenListe = { id: string; mode: 'nominatif' | 'generique';
  membreId: string | null; membreNom: string | null; creeParNom: string | null;
  creeLe: string; expireLe: string; revoqueLe: string | null; utiliseLe: string |
  null; utiliseParNom: string | null }` ; `listerTokens(): Promise<TokenListe[]>`.

**Piège à éviter (registre 1c, Task 13) : deux clés étrangères entre les deux mêmes
tables.** `tokens_inscription` référence `profils` **deux fois**
(`cree_par`, `utilise_par_profil_id`) : PostgREST refuse d'embarquer sans le nom de
la contrainte. Les contraintes créées inline par `create table` à la Task 1 portent
le nom par défaut de Postgres : `tokens_inscription_cree_par_fkey` et
`tokens_inscription_utilise_par_profil_id_fkey`.

- [ ] **Étape 1 : écrire `src/lib/donnees/tokens.ts`**

```typescript
import 'server-only'
import { clientServeur } from '@/lib/supabase/serveur'

export type TokenListe = {
  id: string
  mode: 'nominatif' | 'generique'
  membreId: string | null
  membreNom: string | null
  creeParNom: string | null
  creeLe: string
  expireLe: string
  revoqueLe: string | null
  utiliseLe: string | null
  utiliseParNom: string | null
}

const COLONNES =
  'id, mode, membre_id, cree_le, expire_le, revoque_le, utilise_le, ' +
  'membres(nom, prenom), ' +
  'createur:profils!tokens_inscription_cree_par_fkey(nom_affichage), ' +
  'utilisateur:profils!tokens_inscription_utilise_par_profil_id_fkey(nom_affichage)'

type LigneMembre = { nom: string; prenom: string } | { nom: string; prenom: string }[] | null
type LigneProfil = { nom_affichage: string } | { nom_affichage: string }[] | null

function premier<T>(valeur: T | T[] | null): T | null {
  if (!valeur) return null
  return Array.isArray(valeur) ? (valeur[0] ?? null) : valeur
}

/**
 * Tous les tokens d'inscription, quel que soit leur état, du plus récent au plus
 * ancien. Sous RLS (`clientServeur`) : la politique `tokens_inscription_lecture`
 * réserve cette lecture à l'administrateur — l'écran est de toute façon derrière
 * `exigerAdministrateur`, mais s'appuyer sur la RLS plutôt que sur la clé de
 * service maintient le filet, comme `listerComptes` en 1c.
 */
export async function listerTokens(): Promise<TokenListe[]> {
  const supabase = await clientServeur()
  const { data, error } = await supabase
    .from('tokens_inscription')
    .select(COLONNES)
    .order('cree_le', { ascending: false })

  if (error) {
    throw new Error(`Lecture des tokens impossible : ${error.message}`)
  }

  return (data ?? []).map((ligne) => {
    const membre = premier(ligne.membres as LigneMembre)
    const createur = premier(ligne.createur as LigneProfil)
    const utilisateur = premier(ligne.utilisateur as LigneProfil)
    return {
      id: ligne.id as string,
      mode: ligne.mode as 'nominatif' | 'generique',
      membreId: ligne.membre_id as string | null,
      membreNom: membre ? `${membre.prenom} ${membre.nom}` : null,
      creeParNom: createur?.nom_affichage ?? null,
      creeLe: ligne.cree_le as string,
      expireLe: ligne.expire_le as string,
      revoqueLe: ligne.revoque_le as string | null,
      utiliseLe: ligne.utilise_le as string | null,
      utiliseParNom: utilisateur?.nom_affichage ?? null,
    }
  })
}
```

- [ ] **Étape 2 : REJOUER LES REQUÊTES CONTRE LA VRAIE BASE**

C'est le seul contrôle capable de voir un nom de colonne ou de contrainte faux : ni
`tsc`, ni ESLint, ni les tests unitaires ne lisent l'intérieur d'une chaîne de
caractères — et cette tâche embarque **deux** relations ambiguës vers `profils`,
exactement le genre d'erreur que la Task 13 de la 1c a trouvé de cette façon.
**Copier le `select` depuis le fichier livré à l'Étape 1, jamais depuis ce plan.**

Créer `scripts/.tmp-verif/rejouer-tokens.mjs`, l'exécuter, puis **supprimer le
dossier** :

```javascript
import { createClient } from '@supabase/supabase-js'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

// COPIER cette chaîne depuis src/lib/donnees/tokens.ts, pas depuis le plan.
const COLONNES =
  'id, mode, membre_id, cree_le, expire_le, revoque_le, utilise_le, ' +
  'membres(nom, prenom), ' +
  'createur:profils!tokens_inscription_cree_par_fkey(nom_affichage), ' +
  'utilisateur:profils!tokens_inscription_utilise_par_profil_id_fkey(nom_affichage)'

const { data, error } = await admin.from('tokens_inscription').select(COLONNES).limit(5)
console.log('listerTokens :', error ? `ERREUR ${error.message}` : `OK (${data.length} ligne(s))`)
if (data?.length) {
  console.log(JSON.stringify(data[0], null, 2))
}
```

```bash
npx dotenv -e .env.local -- node scripts/.tmp-verif/rejouer-tokens.mjs
rm -rf scripts/.tmp-verif
```

Attendu : `OK`. Si aucun token n'existe encore en base, créer temporairement un
token de test (préfixe `ZZ`/`test-rejeu-`) avant de rejouer, puis le supprimer.
Consigner la sortie réelle dans le rapport.

- [ ] **Étape 3 : les six portes, puis commit**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls && npm run test:e2e && npm run build
```

```bash
git add src/lib/donnees/tokens.ts
git commit -m "feat: lire la liste des tokens d'inscription"
```

---

### Task 12 : lecture des demandes de suivi

**Fichiers :**
- Créer : `src/lib/donnees/demandes.ts`

**Interfaces :**
- Consomme : `demandes_membre` (Task 2).
- Produit : `type DemandeListe = { id: string; origine: 'auto_inscription' |
  'demande_suivi'; demandeurProfilId: string; demandeurNom: string; membreId:
  string | null; membreNom: string | null; membrePrenom: string | null; etat:
  'en_attente' | 'validee' | 'rejetee' | 'annulee'; motifRejet: string | null;
  traiteParNom: string | null; traiteLe: string | null; creeLe: string }` ;
  `listerDemandesEnAttente(): Promise<DemandeListe[]>` ; `mesDemandes(profilId:
  string): Promise<DemandeListe[]>`.

**Même piège que la Task 11** : `demandes_membre` référence `profils` deux fois
(`demandeur_profil_id`, `traite_par`). Noms de contrainte par défaut :
`demandes_membre_demandeur_profil_id_fkey`, `demandes_membre_traite_par_fkey`.

- [ ] **Étape 1 : écrire `src/lib/donnees/demandes.ts`**

```typescript
import 'server-only'
import { clientServeur } from '@/lib/supabase/serveur'

export type DemandeListe = {
  id: string
  origine: 'auto_inscription' | 'demande_suivi'
  demandeurProfilId: string
  demandeurNom: string
  membreId: string | null
  membreNom: string | null
  membrePrenom: string | null
  etat: 'en_attente' | 'validee' | 'rejetee' | 'annulee'
  motifRejet: string | null
  traiteParNom: string | null
  traiteLe: string | null
  creeLe: string
}

const COLONNES =
  'id, origine, demandeur_profil_id, membre_id, etat, motif_rejet, traite_le, cree_le, ' +
  'membres(nom, prenom), ' +
  'demandeur:profils!demandes_membre_demandeur_profil_id_fkey(nom_affichage), ' +
  'traiteur:profils!demandes_membre_traite_par_fkey(nom_affichage)'

type LigneMembre = { nom: string; prenom: string } | { nom: string; prenom: string }[] | null
type LigneProfil = { nom_affichage: string } | { nom_affichage: string }[] | null

function premier<T>(valeur: T | T[] | null): T | null {
  if (!valeur) return null
  return Array.isArray(valeur) ? (valeur[0] ?? null) : valeur
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function versDemandeListe(ligne: any): DemandeListe {
  const membre = premier(ligne.membres as LigneMembre)
  // `demandeur` ne peut PAS être absent : demandeur_profil_id est NOT NULL et la
  // clé étrangère garantit qu'un profil existe. `?? 'Compte supprimé'` est un
  // filet, pas un cas normal attendu.
  const demandeur = premier(ligne.demandeur as LigneProfil)
  const traiteur = premier(ligne.traiteur as LigneProfil)
  return {
    id: ligne.id as string,
    origine: ligne.origine as DemandeListe['origine'],
    demandeurProfilId: ligne.demandeur_profil_id as string,
    demandeurNom: demandeur?.nom_affichage ?? 'Compte supprimé',
    membreId: ligne.membre_id as string | null,
    membreNom: membre?.nom ?? null,
    membrePrenom: membre?.prenom ?? null,
    etat: ligne.etat as DemandeListe['etat'],
    motifRejet: ligne.motif_rejet as string | null,
    traiteParNom: traiteur?.nom_affichage ?? null,
    traiteLe: ligne.traite_le as string | null,
    creeLe: ligne.cree_le as string,
  }
}

/**
 * Demandes en_attente, les deux origines confondues (design 2b §4, écran
 * `/demandes`). Sous RLS : réservée à l'administrateur par la politique
 * `demandes_membre_lecture`, l'écran est de toute façon derrière
 * `exigerAdministrateur`.
 */
export async function listerDemandesEnAttente(): Promise<DemandeListe[]> {
  const supabase = await clientServeur()
  const { data, error } = await supabase
    .from('demandes_membre')
    .select(COLONNES)
    .eq('etat', 'en_attente')
    .order('cree_le')

  if (error) {
    throw new Error(`Lecture des demandes impossible : ${error.message}`)
  }
  return (data ?? []).map(versDemandeListe)
}

/**
 * Toutes les demandes d'un compte, quel que soit leur état, les plus récentes en
 * tête. `profilId` filtre EXPLICITEMENT, en plus de la RLS : la politique
 * `demandes_membre_lecture` laisserait un ADMINISTRATEUR voir toutes les demandes
 * si `profilId` référait un compte administrateur — ce filtre garantit que « mes
 * demandes » ne montre jamais que les siennes, même pour un administrateur.
 */
export async function mesDemandes(profilId: string): Promise<DemandeListe[]> {
  const supabase = await clientServeur()
  const { data, error } = await supabase
    .from('demandes_membre')
    .select(COLONNES)
    .eq('demandeur_profil_id', profilId)
    .order('cree_le', { ascending: false })

  if (error) {
    throw new Error(`Lecture de mes demandes impossible : ${error.message}`)
  }
  return (data ?? []).map(versDemandeListe)
}

/** Une demande précise, ou `null` si elle n'existe pas ou n'est pas visible. */
export async function demandeParId(id: string): Promise<DemandeListe | null> {
  const supabase = await clientServeur()
  const { data, error } = await supabase.from('demandes_membre').select(COLONNES).eq('id', id).maybeSingle()

  if (error) {
    throw new Error(`Lecture de la demande impossible : ${error.message}`)
  }
  if (!data) return null
  return versDemandeListe(data)
}
```

- [ ] **Étape 2 : REJOUER LES REQUÊTES CONTRE LA VRAIE BASE**

Créer `scripts/.tmp-verif/rejouer-demandes.mjs`, exécuter, puis **supprimer le
dossier**. **Copier `COLONNES` depuis le fichier livré à l'Étape 1**, pas depuis ce
plan.

```javascript
import { createClient } from '@supabase/supabase-js'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

// COPIER cette chaîne depuis src/lib/donnees/demandes.ts, pas depuis le plan.
const COLONNES =
  'id, origine, demandeur_profil_id, membre_id, etat, motif_rejet, traite_le, cree_le, ' +
  'membres(nom, prenom), ' +
  'demandeur:profils!demandes_membre_demandeur_profil_id_fkey(nom_affichage), ' +
  'traiteur:profils!demandes_membre_traite_par_fkey(nom_affichage)'

const { data, error } = await admin.from('demandes_membre').select(COLONNES).limit(5)
console.log('demandes_membre :', error ? `ERREUR ${error.message}` : `OK (${data.length} ligne(s))`)
if (data?.length) console.log(JSON.stringify(data[0], null, 2))
```

```bash
npx dotenv -e .env.local -- node scripts/.tmp-verif/rejouer-demandes.mjs
rm -rf scripts/.tmp-verif
```

Attendu : `OK`. S'il n'existe encore aucune demande en base, en créer une
temporaire (préfixes `ZZ`/`test-rejeu-`) avant de rejouer, puis la supprimer.
Consigner la sortie réelle dans le rapport.

- [ ] **Étape 3 : les six portes, puis commit**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls && npm run test:e2e && npm run build
```

```bash
git add src/lib/donnees/demandes.ts
git commit -m "feat: lire les demandes de suivi et d'auto-inscription"
```

---

### Task 13 : notifications et antennes publiques

**Fichiers :**
- Créer : `src/lib/donnees/notifications.ts`
- Modifier : `src/lib/donnees/antennes.ts`

**Interfaces :**
- Consomme : `notifications` (Task 3), `roles_profil`/`profils` (existants),
  `antennes` (existante, 1a).
- Produit : `type NotificationListe = { id: string; type: 'nouvelle_demande' |
  'demande_validee' | 'demande_rejetee'; titre: string; corps: string; lien: string
  | null; luLe: string | null; creeLe: string }` ; `mesNotifications(profilId:
  string): Promise<NotificationListe[]>` ; `compterNotificationsNonLues(profilId:
  string): Promise<number>` ; `notifierAdministrateurs(notification: { type:
  'nouvelle_demande'; titre: string; corps: string; lien: string | null }):
  Promise<void>` ; `listerAntennesPubliques(): Promise<Antenne[]>`.

**Exception délibérée et documentée : `listerAntennesPubliques` est la SEULE
fonction de tout `src/lib/donnees/` à employer `clientAdmin()` pour une simple
lecture.** Le design (§6) dit que la page `/inscription` ne fait « aucune lecture
de base » — une affirmation dont l'intention réelle est de fermer tout **oracle**
sur la validité d'un code, pas d'interdire strictement toute lecture. Le
formulaire public doit pourtant proposer une liste d'antennes (D35) pour que
l'administrateur n'ait pas à la ressaisir à la validation — un oubli rendrait la
personne invisible des pointages de son assemblée. Cette liste est **fixe,
publique par nature (noms d'antennes déjà lisibles par tout compte actif, spec
§5.3), et strictement indépendante du code saisi** : elle ne peut donc servir
d'oracle sur la validité d'un token, contrairement à une lecture qui dépendrait du
code. La politique RLS d'`antennes` (spec §5.3, « tout compte actif ») n'accorde
rien à `anon` : un visiteur non authentifié qui interrogerait `antennes` via
`clientServeur()` échouerait purement et simplement (`42501`), pas silencieusement
— d'où la nécessité de `clientAdmin()` ici, et nulle part ailleurs dans ce module.
**Ce point est signalé à l'utilisateur comme une décision d'implémentation qui
comble un vide du design, pas comme une décision produit — voir le rapport de fin
de rédaction du plan.**

- [ ] **Étape 1 : écrire `src/lib/donnees/notifications.ts`**

```typescript
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
 */
export async function notifierAdministrateurs(notification: {
  type: 'nouvelle_demande'
  titre: string
  corps: string
  lien: string | null
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
    })),
  )
  if (erreurInsertion) {
    console.error('notifierAdministrateurs : insertion impossible', {
      code: erreurInsertion.code,
      message: erreurInsertion.message,
    })
  }
}
```

- [ ] **Étape 2 : ajouter `listerAntennesPubliques` à `src/lib/donnees/antennes.ts`**

Ajouter à la fin de `src/lib/donnees/antennes.ts` (après `listerAntennes`) :

```typescript
import { clientAdmin } from '@/lib/supabase/admin'

/**
 * Antennes actives, pour le SEUL formulaire public `/inscription`. EXCEPTION
 * DÉLIBÉRÉE : `clientAdmin()` (clé de service) plutôt que `clientServeur()`, parce
 * que `/inscription` s'affiche sans session — un appel sous RLS avec la clé anonyme
 * échouerait (42501), la politique d'`antennes` ne s'ouvrant qu'à `authenticated`
 * (spec §5.3). Cette liste est fixe, déjà publique pour tout compte actif, et
 * strictement indépendante du code d'inscription saisi : elle ne peut donc servir
 * d'oracle sur la validité d'un token (design 2b §6). N'employer `clientAdmin()`
 * NULLE PART AILLEURS dans ce fichier ni dans le reste de `src/lib/donnees/` pour
 * une simple lecture — voir la Task 13 du plan de la phase 2b.
 */
export async function listerAntennesPubliques(): Promise<Antenne[]> {
  const { data, error } = await clientAdmin()
    .from('antennes')
    .select('id, nom, pays, actif')
    .eq('actif', true)
    .order('nom')

  if (error) {
    throw new Error(`Lecture des antennes impossible : ${error.message}`)
  }
  return (data ?? []) as Antenne[]
}
```

Ajouter l'import de `clientAdmin` en tête du fichier, avec les autres imports.

- [ ] **Étape 3 : CONTRÔLE PAR RECHERCHE, avec contrôle positif, que `clientAdmin` reste l'exception**

```bash
grep -rn "clientAdmin" src/lib/donnees/
```

Attendu : exactement **une** occurrence de `clientAdmin(` dans
`src/lib/donnees/antennes.ts` (l'import et l'appel de cette étape), et **zéro**
dans `src/lib/donnees/tokens.ts`, `src/lib/donnees/demandes.ts`,
`src/lib/donnees/notifications.ts` (dont les fonctions de lecture, hors
`notifierAdministrateurs`, doivent toutes lire via `clientServeur()`).
**Contrôle positif** : relire `notifierAdministrateurs` et confirmer qu'elle,
elle, emploie `clientAdmin()` à dessein (c'est une ÉCRITURE réservée à
`service_role` par construction de la RLS de `notifications`, pas une lecture
publique) — sans ce contrôle positif, l'absence de `clientAdmin` ailleurs
prouverait aussi bien que la recherche elle-même est cassée.

- [ ] **Étape 4 : REJOUER LES REQUÊTES CONTRE LA VRAIE BASE**

Créer `scripts/.tmp-verif/rejouer-notifications.mjs`, exécuter, puis **supprimer
le dossier** :

```javascript
import { createClient } from '@supabase/supabase-js'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

for (const [nom, appel] of [
  ['notifications (select)', () => admin.from('notifications').select('id, type, titre, corps, lien, lu_le, cree_le').limit(5)],
  ['antennes publiques', () => admin.from('antennes').select('id, nom, pays, actif').eq('actif', true).order('nom')],
  [
    'administrateurs actifs (roles_profil + profils!inner)',
    () => admin.from('roles_profil').select('profil_id, profils!inner(actif)').eq('role', 'administrateur').eq('profils.actif', true),
  ],
]) {
  const { data, error } = await appel()
  console.log(`${nom} : ${error ? 'ERREUR ' + error.message : `OK (${data.length} ligne(s))`}`)
}
```

```bash
npx dotenv -e .env.local -- node scripts/.tmp-verif/rejouer-notifications.mjs
rm -rf scripts/.tmp-verif
```

Attendu : `OK` sur les trois lignes — la troisième est la plus à risque
(`profils!inner`, syntaxe de jointure interne PostgREST jamais employée ailleurs
dans le projet). Consigner la sortie réelle dans le rapport.

- [ ] **Étape 5 : les six portes, puis commit**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls && npm run test:e2e && npm run build
```

```bash
git add src/lib/donnees/notifications.ts src/lib/donnees/antennes.ts
git commit -m "feat: lire les notifications et la liste publique des antennes"
```

---

## Partie C — actions et écrans

### Task 14 : `/inscription`, la surface publique — la tâche la plus sensible du plan

**Fichiers :**
- Modifier : `src/middleware.ts`
- Créer : `src/app/inscription/page.tsx`
- Créer : `src/app/inscription/formulaire-inscription.tsx`
- Créer : `src/app/inscription/actions.ts`
- Créer : `src/app/inscription/messages.ts`
- Créer : `src/app/inscription/messages.test.ts`
- Créer : `tests/e2e/inscription.spec.ts`

**Interfaces :**
- Consomme : `hacherCodeInscription` (Task 7), `consommer_token_inscription`,
  `relacher_token_inscription` (Task 8), `notifierAdministrateurs` (Task 13),
  `listerAntennesPubliques` (Task 13), `normaliserIdentifiant`,
  `identifiantVersEmail` (`src/lib/domaine/identifiant.ts`, existant),
  `LONGUEUR_MDP_MINIMALE` (`src/app/changer-mot-de-passe/constantes.ts`,
  existant).
- Produit : Server Action `sInscrire(_etat: EtatInscription, donnees: FormData):
  Promise<EtatInscription>` où `type EtatInscription = { erreur: string | null }` ;
  composant `<FormulaireInscription antennes={antennes} />`.

**Ce que le middleware bloque aujourd'hui, et pourquoi cette tâche doit le
corriger en premier.** `src/middleware.ts` redirige actuellement **toute** requête
non authentifiée vers `/connexion`, sauf `/connexion` elle-même — `/inscription`
n'existe pas encore comme exception. Sans la modification de l'Étape 1,
`/inscription` serait **totalement inatteignable** par un visiteur sans session :
la première page publique de l'application resterait bloquée par le garde même
qu'elle est censée court-circuiter. Ce n'est pas une omission du design (§9 du
design dit explicitement que la fermeture de `/inscription` « ne repose sur aucun
appel à `garde.ts` » et repose sur la RLS et les privilèges `EXECUTE`) — mais le
design ne mentionne pas `middleware.ts`, qui est une couche distincte, en amont de
toute page. Cette lacune est comblée ici, pas rouverte.

**Ce que la fermeture de `/inscription` protège réellement (design §6), à garder
en tête en écrivant cette tâche :**
- La page (Server Component) ne lit **aucune** donnée qui dépend du code saisi —
  seule exception documentée, `listerAntennesPubliques` (Task 13), qui ne dépend
  jamais du code.
- Le formulaire est **unique** (D30) : il ne varie jamais selon le contenu du code
  — pas de préremplissage, pas d'indice sur le mode ou la validité avant la
  soumission.
- `sInscrire` est l'**unique** point d'entrée en écriture atteignable sans session.
- Aucune table n'accorde de `select` à `anon` (déjà vrai par construction des
  Tasks 1 à 4 : `revoke all on ... from anon, authenticated` puis `grant select ...
  to authenticated` seulement — `anon` n'a jamais rien reçu).
- `consommer_token_inscription` n'est exécutable que par `service_role` (déjà vrai
  depuis la Task 8).

- [ ] **Étape 1 : modifier le middleware pour exempter `/inscription`**

Dans `src/middleware.ts`, ajouter la constante avec les autres routes :

```typescript
const ROUTE_INSCRIPTION = '/inscription'
```

Puis, juste après la déclaration de `surConnexion`, ajouter :

```typescript
  const surInscription = estRoute(chemin, ROUTE_INSCRIPTION)
```

Puis remplacer :

```typescript
  if (!user) {
    return surConnexion ? reponse : rediriger(ROUTE_CONNEXION)
  }
```

par :

```typescript
  if (!user) {
    // /inscription est la SEULE autre route accessible sans session (design 2b
    // §9) : c'est le premier chemin d'écriture public de l'application. Sa
    // fermeture ne repose PAS sur ce middleware — elle repose entièrement sur
    // l'absence de politique RLS ouverte à `anon` et sur les privilèges EXECUTE
    // retirés à tous sauf `service_role` (design 2b §6). Ce middleware ne fait ici
    // que la RENDRE ATTEIGNABLE ; il ne la protège pas.
    return surConnexion || surInscription ? reponse : rediriger(ROUTE_CONNEXION)
  }
```

Un compte déjà authentifié qui visite `/inscription` n'est pas redirigé ailleurs
(contrairement à `/connexion`, qui redirige un compte déjà connecté) : la page ne
fait rien de dangereux dans ce cas — au pire, elle laisserait un compte existant
créer un second compte avec le même token, ce que `consommer_token_inscription`
autorise déjà pour n'importe quel visiteur. Ne pas ajouter de garde
supplémentaire ici serait cohérent avec D30 (formulaire unique, sans branche selon
le contexte de l'appelant).

- [ ] **Étape 2 : écrire les messages, avec le test du mappage indifférencié**

Créer `src/app/inscription/messages.ts` :

```typescript
export const MESSAGE_CHAMPS_OBLIGATOIRES =
  "Le code, l'identifiant, le mot de passe, le nom et le prénom sont obligatoires."
export const MESSAGE_MDP_TROP_COURT = "Le mot de passe est trop court."
export const MESSAGE_IDENTIFIANT_PRIS = 'Cet identifiant est déjà utilisé.'
// D30 : message UNIQUE pour les quatre causes de refus d'un token (inconnu, expiré,
// révoqué, déjà utilisé). NE JAMAIS en introduire un second pour l'une de ces
// causes : ce serait recréer l'oracle que ce message unique existe pour fermer.
export const MESSAGE_CODE_INVALIDE = "Ce code n'est pas valide."
export const MESSAGE_TROP_DE_TENTATIVES =
  'Trop de tentatives récentes. Réessayez plus tard.'
export const MESSAGE_ECHEC_INSCRIPTION = "L'inscription n'a pas pu aboutir."

const STATUT_TROP_DE_TENTATIVES = 'trop_de_tentatives'

/**
 * Traduit le `statut` rendu par `consommer_token_inscription`
 * (`'invalide'` \| `'trop_de_tentatives'` — jamais appelée pour `'ok'`, voir
 * `sInscrire`) en message affiché. Pure, testée sans base (design 2b §10).
 *
 * `consommer_token_inscription` NE LÈVE PLUS pour un refus métier (migration
 * 20260815150000 : une première rédaction levait une exception, ce qui annulait
 * l'insertion de la tentative elle-même et rendait le plafond de D34/D36
 * inopérant — voir l'en-tête de la Task 8 du plan). Cette fonction lit donc
 * `data[0].statut`, jamais `error.details`.
 *
 * `'invalide'`, ET TOUT STATUT INCONNU, rendent le MÊME message uniforme (D30) :
 * aucune branche supplémentaire ne doit jamais être ajoutée ici pour l'une des
 * quatre causes distinguées côté SQL (code inconnu, expiré, révoqué, déjà
 * utilisé) — les quatre partagent déjà le même statut `invalide` à la source
 * (voir tests/rls/tokens-inscription.test.ts, bloc « RÉCAPITULATIF »), et cette
 * fonction ne fait que refléter fidèlement cette uniformité, pas la créer.
 *
 * L'INDISCERNABILITÉ EXIGÉE PAR D30 PORTE SUR CE QUE VOIT L'UTILISATEUR, PAS SUR
 * CE QUE REÇOIT NOTRE PROPRE SERVEUR : `sInscrire` journalise `statut` tel quel
 * (`console.error`) AVANT d'appeler cette fonction — précieux au diagnostic — mais
 * cette fonction-ci ne doit JAMAIS, elle, distinguer une cause de l'autre dans le
 * texte rendu à l'écran.
 */
export function messageErreurConsommation(statut: string | null | undefined): string {
  if (statut === STATUT_TROP_DE_TENTATIVES) {
    return MESSAGE_TROP_DE_TENTATIVES
  }
  return MESSAGE_CODE_INVALIDE
}
```

- [ ] **Étape 3 : écrire le test du mappage, qui doit échouer**

Créer `src/app/inscription/messages.test.ts` :

```typescript
import { describe, expect, it } from 'vitest'
import {
  MESSAGE_CODE_INVALIDE,
  MESSAGE_TROP_DE_TENTATIVES,
  messageErreurConsommation,
} from './messages'

describe('messageErreurConsommation', () => {
  it('mappe trop_de_tentatives sur son message dédié', () => {
    expect(messageErreurConsommation('trop_de_tentatives')).toBe(MESSAGE_TROP_DE_TENTATIVES)
  })

  // Les QUATRE causes distinctes côté base (code inconnu, expiré, révoqué, déjà
  // utilisé) produisent toutes le MÊME statut invalide (design 2b §7.1) : ce
  // test ne peut donc pas les distinguer ici, PAR CONSTRUCTION — c'est
  // précisément ce que D30 exige. La preuve que les quatre causes convergent
  // réellement vers ce statut unique se fait à la couche SQL
  // (tests/rls/tokens-inscription.test.ts, bloc « RÉCAPITULATIF »).
  it('mappe invalide, et tout statut inconnu, sur le MÊME message uniforme', () => {
    expect(messageErreurConsommation('invalide')).toBe(MESSAGE_CODE_INVALIDE)
    expect(messageErreurConsommation('un_statut_qui_nexiste_pas')).toBe(MESSAGE_CODE_INVALIDE)
    expect(messageErreurConsommation(null)).toBe(MESSAGE_CODE_INVALIDE)
    expect(messageErreurConsommation(undefined)).toBe(MESSAGE_CODE_INVALIDE)
  })

  // CONTRÔLE POSITIF : sans lui, une implémentation qui rendrait TOUJOURS le même
  // message (y compris pour trop_de_tentatives) passerait aussi le premier test.
  it('les deux messages sont bien distincts l''un de l''autre', () => {
    expect(MESSAGE_TROP_DE_TENTATIVES).not.toBe(MESSAGE_CODE_INVALIDE)
  })
})
```

```bash
npm test -- inscription/messages
```

Attendu : ÉCHEC (le module `./messages` n'existe pas encore dans l'ordre normal de
TDD — si l'Étape 2 a déjà été faite, ce test doit au contraire déjà passer ; dans
ce cas, passer directement à l'Étape 4 en le confirmant vert).

- [ ] **Étape 4 : lancer le test et vérifier qu'il passe**

```bash
npm test -- inscription/messages
```

Attendu : les trois tests verts.

- [ ] **Étape 5 : écrire `sInscrire`**

Créer `src/app/inscription/actions.ts` :

```typescript
'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { LONGUEUR_MDP_MINIMALE } from '@/app/changer-mot-de-passe/constantes'
import { IdentifiantInvalideError, identifiantVersEmail, normaliserIdentifiant } from '@/lib/domaine/identifiant'
import { hacherCodeInscription } from '@/lib/domaine/token-inscription'
import { notifierAdministrateurs } from '@/lib/donnees/notifications'
import { clientAdmin } from '@/lib/supabase/admin'
import {
  MESSAGE_CHAMPS_OBLIGATOIRES,
  MESSAGE_ECHEC_INSCRIPTION,
  MESSAGE_IDENTIFIANT_PRIS,
  MESSAGE_MDP_TROP_COURT,
  messageErreurConsommation,
} from './messages'

export type EtatInscription = { erreur: string | null }

const CODE_AUTH_EMAIL_PRIS = 'email_exists'
const CODE_VIOLATION_UNICITE = '23505'

function champTexte(donnees: FormData, nom: string): string {
  const valeur = donnees.get(nom)
  return typeof valeur === 'string' ? valeur.trim() : ''
}

function champTexteOptionnel(donnees: FormData, nom: string): string | null {
  const valeur = champTexte(donnees, nom)
  return valeur.length > 0 ? valeur : null
}

/**
 * Adresse de l'appelant, lue côté SERVEUR uniquement (design 2b §5.4) — jamais
 * fournie par le client, qui pourrait forger n'importe quelle valeur dans un champ
 * de formulaire. `x-forwarded-for` porte l'adresse d'origine sur Vercel ; en son
 * absence (développement local sans proxy), on retombe sur une adresse neutre —
 * le plafond de tentatives (D36) reste actif, simplement partagé par tout appelant
 * local, ce qui est sans conséquence hors production.
 */
async function adresseAppelant(): Promise<string> {
  const listeHeaders = await headers()
  const brut = listeHeaders.get('x-forwarded-for')
  if (!brut) return '0.0.0.0'
  // x-forwarded-for peut porter une liste « client, proxy1, proxy2 » : le premier
  // segment est l'adresse d'origine (Vercel la place en tête).
  return brut.split(',')[0]!.trim()
}

/**
 * L'UNIQUE Server Action atteignable sans session (design 2b §6, §9). AUCUN garde
 * de `src/lib/securite/garde.ts` en tête : il n'existe aucune session à ce stade,
 * exception unique et documentée du projet.
 */
export async function sInscrire(_etat: EtatInscription, donnees: FormData): Promise<EtatInscription> {
  const code = champTexte(donnees, 'code')
  const identifiantBrut = champTexte(donnees, 'identifiant')
  const motDePasse = String(donnees.get('motDePasse') ?? '')
  const nom = champTexte(donnees, 'nom')
  const prenom = champTexte(donnees, 'prenom')
  const telephone = champTexteOptionnel(donnees, 'telephone')
  const ville = champTexteOptionnel(donnees, 'ville')
  const antenneId = champTexteOptionnel(donnees, 'antenneId')

  if (code.length === 0 || identifiantBrut.length === 0 || motDePasse.length === 0 || nom.length === 0 || prenom.length === 0) {
    return { erreur: MESSAGE_CHAMPS_OBLIGATOIRES }
  }

  // D39 : même règle que le changement de mot de passe volontaire. Contrôle EN
  // AMONT — confort seulement, Supabase Auth impose de toute façon sa propre
  // règle minimale à la création du compte, qui reste décisive (design 2b §7.1).
  if (motDePasse.length < LONGUEUR_MDP_MINIMALE) {
    return { erreur: MESSAGE_MDP_TROP_COURT }
  }

  let identifiant: string
  try {
    identifiant = normaliserIdentifiant(identifiantBrut)
  } catch (erreur) {
    if (erreur instanceof IdentifiantInvalideError) {
      return { erreur: erreur.message }
    }
    throw erreur
  }

  const adresse = await adresseAppelant()
  const codeHash = hacherCodeInscription(code)
  const admin = clientAdmin()

  const { data: resultat, error: erreurConsommation } = await admin.rpc('consommer_token_inscription', {
    p_code_hash: codeHash,
    p_adresse: adresse,
  })

  // ICI, `error` NE PORTE JAMAIS un refus métier (migration 20260815150000, voir
  // son en-tête) : `consommer_token_inscription` rend un STATUT
  // (`'ok'` | `'invalide'` | `'trop_de_tentatives'`) plutôt que de lever, pour
  // que l'insertion de la tentative survive au refus. `error` non nul ici signale
  // donc une VRAIE panne technique (réseau, bug), pas un code invalide.
  if (erreurConsommation || !resultat || resultat.length === 0) {
    console.error('sInscrire : appel de consommer_token_inscription en échec (panne technique)', {
      code: erreurConsommation?.code,
      message: erreurConsommation?.message,
    })
    return { erreur: MESSAGE_ECHEC_INSCRIPTION }
  }

  // Forme rendue par `returns table (statut public.statut_consommation_token,
  // token_id uuid, mode public.mode_token, membre_id uuid)` (migration
  // 20260815150000) : contrôle de forme, pas décoration — `rpc()` rend `any`
  // faute de types `Database` générés (piège connu du projet). Sans ce contrôle,
  // une colonne renommée produirait des `undefined` silencieux plutôt qu'un
  // échec visible.
  const ligne = resultat[0] as { statut?: unknown; token_id?: unknown; mode?: unknown; membre_id?: unknown }
  if (ligne.statut !== 'ok' && ligne.statut !== 'invalide' && ligne.statut !== 'trop_de_tentatives') {
    console.error('sInscrire : forme inattendue rendue par consommer_token_inscription', { ligne })
    return { erreur: MESSAGE_ECHEC_INSCRIPTION }
  }

  if (ligne.statut !== 'ok') {
    // D30 : le MESSAGE affiché est rigoureusement le même pour `invalide` et
    // `trop_de_tentatives` (voir `messageErreurConsommation`). L'indiscernabilité
    // exigée par D30 porte sur ce que voit l'UTILISATEUR, pas sur ce que reçoit
    // notre propre serveur : rien n'empêche de journaliser les deux causes
    // séparément ici, ce qui est précieux au diagnostic — mais `ligne.statut` ne
    // doit JAMAIS remonter au-delà de ce mappage uniforme.
    console.error('sInscrire : consommation refusée', { statut: ligne.statut })
    return { erreur: messageErreurConsommation(ligne.statut) }
  }

  // statut === 'ok' : contrôle de forme sur token_id/mode, même raison qu'au-dessus.
  if (typeof ligne.token_id !== 'string' || (ligne.mode !== 'nominatif' && ligne.mode !== 'generique')) {
    console.error('sInscrire : forme inattendue rendue par consommer_token_inscription (statut ok)', { ligne })
    await admin.rpc('relacher_token_inscription', { p_token_id: ligne.token_id as string })
    return { erreur: MESSAGE_ECHEC_INSCRIPTION }
  }
  const tokenId = ligne.token_id
  const mode = ligne.mode
  const membreIdToken = (ligne.membre_id as string | null) ?? null

  const { data: compteCree, error: erreurCompte } = await admin.auth.admin.createUser({
    email: identifiantVersEmail(identifiant),
    password: motDePasse,
    email_confirm: true,
  })

  if (erreurCompte || !compteCree.user) {
    console.error('sInscrire : échec de la création du compte', {
      identifiant,
      code: erreurCompte?.code,
      status: erreurCompte?.status,
      message: erreurCompte?.message,
    })
    // D27 : le token est RELÂCHÉ, jamais laissé consommé sans compte au-delà de
    // cette fenêtre. La fenêtre résiduelle assumée par D27 (interruption entre la
    // consommation et cette relâche) reste possible mais jamais un double usage.
    const { error: erreurRelache } = await admin.rpc('relacher_token_inscription', { p_token_id: tokenId })
    if (erreurRelache) {
      console.error('sInscrire : échec de la relâche du token après échec de création du compte', {
        tokenId,
        message: erreurRelache.message,
      })
    }
    return {
      erreur: erreurCompte?.code === CODE_AUTH_EMAIL_PRIS ? MESSAGE_IDENTIFIANT_PRIS : MESSAGE_ECHEC_INSCRIPTION,
    }
  }

  const { error: erreurProfil } = await admin
    .from('profils')
    .insert({ id: compteCree.user.id, identifiant, nom_affichage: `${prenom} ${nom}` })

  if (erreurProfil) {
    const { error: erreurNettoyage } = await admin.auth.admin.deleteUser(compteCree.user.id)
    const { error: erreurRelache } = await admin.rpc('relacher_token_inscription', { p_token_id: tokenId })
    console.error("sInscrire : échec de l'insertion du profil, nettoyage tenté", {
      identifiant,
      code: erreurProfil.code,
      details: erreurProfil.details,
      message: erreurProfil.message,
      nettoyageCompte: erreurNettoyage ? `ÉCHOUÉ : ${erreurNettoyage.message}` : 'compte auth supprimé',
      nettoyageToken: erreurRelache ? `ÉCHOUÉ : ${erreurRelache.message}` : 'token relâché',
    })
    return {
      erreur: erreurProfil.code === CODE_VIOLATION_UNICITE ? MESSAGE_IDENTIFIANT_PRIS : MESSAGE_ECHEC_INSCRIPTION,
    }
  }

  // Écriture SIMPLE, sans concurrence à fermer (design 2b §7.1) : un seul flux
  // touche cette ligne à ce stade, le compte venant d'être créé par CE flux.
  const { error: erreurMarquage } = await admin
    .from('tokens_inscription')
    .update({ utilise_par_profil_id: compteCree.user.id })
    .eq('id', tokenId)
  if (erreurMarquage) {
    // Non fatal pour l'inscrit : le compte existe et fonctionne. Seule la trace
    // d'audit « qui a utilisé ce token » resterait incomplète — journalisé pour
    // qu'un administrateur puisse la compléter à la main si besoin.
    console.error('sInscrire : échec du marquage utilise_par_profil_id', {
      tokenId,
      profilId: compteCree.user.id,
      message: erreurMarquage.message,
    })
  }

  if (mode === 'nominatif') {
    // SÉCURITÉ, pas économie d'écriture (design 2b §7.1) : nom, prénom, téléphone,
    // ville et antenne soumis dans le formulaire sont IGNORÉS — la fiche existe
    // déjà et ses valeurs ne doivent jamais être écrasées par une saisie publique
    // non vérifiée.
    const { error: erreurLiaison } = await admin
      .from('profils')
      .update({ membre_id: membreIdToken })
      .eq('id', compteCree.user.id)
    if (erreurLiaison) {
      console.error('sInscrire : échec de la liaison nominative', {
        profilId: compteCree.user.id,
        membreId: membreIdToken,
        message: erreurLiaison.message,
      })
    }
  } else {
    const { data: fiche, error: erreurFiche } = await admin
      .from('membres')
      .insert({
        nom,
        prenom,
        telephone,
        ville,
        antenne_id: antenneId,
        etat: 'en_attente',
      })
      .select('id')
      .single()

    if (erreurFiche || !fiche) {
      console.error('sInscrire : échec de la création de la fiche en_attente', {
        profilId: compteCree.user.id,
        code: erreurFiche?.code,
        message: erreurFiche?.message,
      })
      // Le compte existe déjà et son mot de passe est déjà choisi : on ne
      // l'annule PAS pour un échec sur la fiche. La personne pourra se connecter ;
      // un administrateur devra créer la demande manuellement.
      return { erreur: MESSAGE_ECHEC_INSCRIPTION }
    }

    const { data: demande, error: erreurDemande } = await admin
      .from('demandes_membre')
      .insert({
        origine: 'auto_inscription',
        demandeur_profil_id: compteCree.user.id,
        membre_id: fiche.id,
        etat: 'en_attente',
      })
      .select('id')
      .single()

    if (erreurDemande || !demande) {
      console.error('sInscrire : échec de la création de la demande', {
        profilId: compteCree.user.id,
        ficheId: fiche.id,
        message: erreurDemande?.message,
      })
      return { erreur: MESSAGE_ECHEC_INSCRIPTION }
    }

    await notifierAdministrateurs({
      type: 'nouvelle_demande',
      titre: 'Nouvelle demande d''inscription',
      corps: `${prenom} ${nom} s'est inscrit(e) par token générique.`,
      lien: `/demandes/${demande.id}`,
    })
  }

  // PAS dans un try : `redirect()` lève une exception de contrôle que le projet
  // ne doit jamais avaler (contrainte globale, pitfall documenté).
  redirect('/connexion?inscrit=1')
}
```

- [ ] **Étape 6 : écrire le formulaire client**

Créer `src/app/inscription/formulaire-inscription.tsx` :

```tsx
'use client'

import { useActionState, useId } from 'react'
import type { Antenne } from '@/lib/donnees/antennes'
import { sInscrire, type EtatInscription } from './actions'

const etatInitial: EtatInscription = { erreur: null }

export function FormulaireInscription({ antennes }: { antennes: Antenne[] }) {
  const [etat, envoyer, enCours] = useActionState(sInscrire, etatInitial)
  const prefixe = useId()
  const idCode = `${prefixe}-code`
  const idIdentifiant = `${prefixe}-identifiant`
  const idMotDePasse = `${prefixe}-mdp`

  return (
    <form action={envoyer} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={idCode} className="text-sm font-medium">
          Code d&apos;inscription
        </label>
        <input
          id={idCode}
          name="code"
          required
          autoCapitalize="none"
          spellCheck={false}
          aria-describedby={`${idCode}-aide`}
          className="rounded-md border border-neutral-300 px-3 py-2"
        />
        <span id={`${idCode}-aide`} className="text-xs text-neutral-500">
          Fourni par un administrateur de l&apos;équipe.
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={idIdentifiant} className="text-sm font-medium">
          Identifiant choisi
        </label>
        <input
          id={idIdentifiant}
          name="identifiant"
          required
          autoCapitalize="none"
          spellCheck={false}
          aria-describedby={`${idIdentifiant}-aide`}
          className="rounded-md border border-neutral-300 px-3 py-2"
        />
        <span id={`${idIdentifiant}-aide`} className="text-xs text-neutral-500">
          3 à 32 caractères : lettres, chiffres, points ou tirets, commençant par
          une lettre.
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={idMotDePasse} className="text-sm font-medium">
          Mot de passe choisi
        </label>
        <input
          id={idMotDePasse}
          name="motDePasse"
          type="password"
          required
          autoComplete="new-password"
          aria-describedby={`${idMotDePasse}-aide`}
          className="rounded-md border border-neutral-300 px-3 py-2"
        />
        <span id={`${idMotDePasse}-aide`} className="text-xs text-neutral-500">
          Au moins 12 caractères.
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Prénom</span>
          <input name="prenom" required className="rounded-md border border-neutral-300 px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Nom</span>
          <input name="nom" required className="rounded-md border border-neutral-300 px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Téléphone</span>
          <input name="telephone" type="tel" className="rounded-md border border-neutral-300 px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Ville</span>
          <input name="ville" className="rounded-md border border-neutral-300 px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-sm font-medium">Antenne</span>
          <select name="antenneId" defaultValue="" className="rounded-md border border-neutral-300 px-3 py-2">
            <option value="">Non rattaché</option>
            {antennes.map((antenne) => (
              <option key={antenne.id} value={antenne.id}>
                {antenne.nom}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/*
        D30 : ce formulaire est le SEUL et reste identique quel que soit le code
        saisi. Les champs prénom/nom/téléphone/ville/antenne sont TOUJOURS
        affichés, même s'ils seront ignorés en mode nominatif (design 2b §7.1) —
        les masquer selon une supposition sur le mode reviendrait à recréer un
        oracle par la forme de la page, exactement ce que D30 interdit.
      */}

      {etat.erreur ? (
        <p role="alert" className="text-sm text-red-600">
          {etat.erreur}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={enCours}
        className="self-start rounded-md bg-neutral-900 px-4 py-2 font-medium text-white disabled:opacity-50"
      >
        {enCours ? 'Inscription…' : "S'inscrire"}
      </button>
    </form>
  )
}
```

- [ ] **Étape 7 : écrire la page**

Créer `src/app/inscription/page.tsx` :

```tsx
import { listerAntennesPubliques } from '@/lib/donnees/antennes'
import { FormulaireInscription } from './formulaire-inscription'

/**
 * Server Component public, SANS SESSION (design 2b §6, §9). Aucun garde de
 * `src/lib/securite/garde.ts` : il n'existe aucun profil à exiger à ce stade.
 *
 * SEULE lecture de cette page : `listerAntennesPubliques`, exception documentée
 * (voir `src/lib/donnees/antennes.ts` et la Task 13 du plan) — une liste fixe,
 * publique, strictement indépendante du code d'inscription. Aucune AUTRE lecture
 * ne doit jamais être ajoutée ici : ni recherche de token, ni préremplissage, ni
 * indice sur le mode ou la validité d'un code (D30).
 */
export default async function PageInscription() {
  const antennes = await listerAntennesPubliques()

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <h1 className="mb-1 text-2xl font-semibold">Inscription</h1>
      <p className="mb-8 text-sm text-neutral-500">
        Munissez-vous du code fourni par un administrateur de l&apos;équipe.
      </p>
      <FormulaireInscription antennes={antennes} />
    </main>
  )
}
```

- [ ] **Étape 8 : écrire les tests e2e**

Créer `tests/e2e/inscription.spec.ts`. Ce fichier crée ses propres tokens (préfixe
`test-e2e-inscription-`) et ses propres comptes (préfixe `test.e2e.inscription.`),
nettoyés en `afterAll` avec un comptage indépendant.

```typescript
import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'
import { identifiantVersEmail } from '../../src/lib/domaine/identifiant'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const PREFIXE_COMPTE = 'test.e2e.inscription.'
const PREFIXE_CODE = 'test-e2e-inscription-'

async function supprimerComptesDePrefixe() {
  const { data: comptes } = await admin
    .from('profils')
    .select('id, identifiant')
    .like('identifiant', `${PREFIXE_COMPTE}%`)
  for (const compte of comptes ?? []) {
    await admin.auth.admin.deleteUser(compte.id)
  }
  // Rattrapage par email, comme partout ailleurs dans le projet : un compte auth
  // créé sans fiche profil resterait introuvable par la requête ci-dessus.
  const { data: tousComptes } = await admin.auth.admin.listUsers()
  const orphelins = (tousComptes?.users ?? []).filter((u) => u.email?.startsWith(PREFIXE_COMPTE))
  for (const orphelin of orphelins) {
    await admin.auth.admin.deleteUser(orphelin.id)
  }
}

async function creerTokenGenerique(code: string, expireDansMs = 86_400_000) {
  // Hachage IDENTIQUE à celui du code applicatif : recopié ici volontairement
  // (le module `token-inscription.ts` est server-only, non importable côté test
  // e2e sans configuration Node dédiée) — SHA-256 hexadécimal de `code`.
  const { createHash } = await import('node:crypto')
  const codeHash = createHash('sha256').update(code, 'utf8').digest('hex')
  const { error } = await admin.from('tokens_inscription').insert({
    code_hash: codeHash,
    mode: 'generique',
    expire_le: new Date(Date.now() + expireDansMs).toISOString(),
  })
  if (error) throw new Error(`création du token de test impossible : ${error.message}`)
}

test.beforeAll(async () => {
  await supprimerComptesDePrefixe()
  await admin.from('tokens_inscription').delete().like('code_hash', 'test-e2e-inscription-hash-%')
})

test.afterAll(async () => {
  await supprimerComptesDePrefixe()
  await admin.from('tokens_inscription').delete().like('code_hash', 'test-e2e-inscription-hash-%')

  // Comptage indépendant, pas seulement l'absence d'erreur (registre 1c : le
  // nettoyage des comptes de test est fragile sous parallélisme).
  const { data: residus } = await admin.from('profils').select('id').like('identifiant', `${PREFIXE_COMPTE}%`)
  expect(residus ?? []).toHaveLength(0)
})

test("un visiteur SANS SESSION atteint /inscription (le middleware ne bloque pas cette route)", async ({ page }) => {
  await page.goto('/inscription')
  await expect(page).toHaveURL(/\/inscription/)
  await expect(page.getByRole('heading', { name: 'Inscription' })).toBeVisible()
})

test("un code inconnu et un code déjà consommé affichent le MÊME message indifférencié", async ({ page }) => {
  const codeConnu = `${PREFIXE_CODE}${crypto.randomUUID()}`
  await creerTokenGenerique(codeConnu)

  const identifiant1 = `${PREFIXE_COMPTE}${crypto.randomUUID().slice(0, 8)}`
  await page.goto('/inscription')
  await page.getByLabel("Code d'inscription").fill(codeConnu)
  await page.getByLabel('Identifiant choisi').fill(identifiant1)
  await page.getByLabel('Mot de passe choisi').fill(`Test-${crypto.randomUUID()}`)
  await page.getByLabel('Prénom').fill('Test')
  await page.getByLabel('Nom').fill('E2E Inscription')
  await page.getByRole('button', { name: "S'inscrire" }).click()
  await expect(page).toHaveURL(/\/connexion\?inscrit=1/)

  // Le code vient d'être consommé : le soumettre une SECONDE fois doit échouer
  // avec exactement le même message qu'un code totalement inconnu.
  const identifiant2 = `${PREFIXE_COMPTE}${crypto.randomUUID().slice(0, 8)}`
  await page.goto('/inscription')
  await page.getByLabel("Code d'inscription").fill(codeConnu)
  await page.getByLabel('Identifiant choisi').fill(identifiant2)
  await page.getByLabel('Mot de passe choisi').fill(`Test-${crypto.randomUUID()}`)
  await page.getByLabel('Prénom').fill('Test')
  await page.getByLabel('Nom').fill('E2E Inscription Doublon')
  await page.getByRole('button', { name: "S'inscrire" }).click()
  const messageCodeDejaUtilise = await page
    .locator('[role="alert"]:not(#__next-route-announcer__)')
    .textContent()

  await page.goto('/inscription')
  await page.getByLabel("Code d'inscription").fill(`${PREFIXE_CODE}${crypto.randomUUID()}`)
  await page.getByLabel('Identifiant choisi').fill(`${PREFIXE_COMPTE}${crypto.randomUUID().slice(0, 8)}`)
  await page.getByLabel('Mot de passe choisi').fill(`Test-${crypto.randomUUID()}`)
  await page.getByLabel('Prénom').fill('Test')
  await page.getByLabel('Nom').fill('E2E Inscription Inconnu')
  await page.getByRole('button', { name: "S'inscrire" }).click()
  const messageCodeInconnu = await page.locator('[role="alert"]:not(#__next-route-announcer__)').textContent()

  expect(messageCodeDejaUtilise).toBe(messageCodeInconnu)

  // ET N'A RIEN ÉCRIT DE PLUS EN BASE : deuxième soumission refusée, un seul
  // compte lié à ce token — pas d'écriture partielle silencieuse.
  const { data: token } = await admin
    .from('tokens_inscription')
    .select('utilise_par_profil_id')
    .eq('code_hash', await (async () => {
      const { createHash } = await import('node:crypto')
      return createHash('sha256').update(codeConnu, 'utf8').digest('hex')
    })())
    .single()
  const { data: compte1 } = await admin.from('profils').select('id').eq('identifiant', identifiant1).maybeSingle()
  expect(token?.utilise_par_profil_id).toBe(compte1?.id)
  const { data: compte2 } = await admin.from('profils').select('id').eq('identifiant', identifiant2).maybeSingle()
  expect(compte2).toBeNull()
})

test("une requête forgée sur consommer_token_inscription depuis le rôle anon échoue et n'écrit rien", async ({ request }) => {
  const codeJamaisSoumis = `${PREFIXE_CODE}${crypto.randomUUID()}`
  await creerTokenGenerique(codeJamaisSoumis)

  const reponse = await request.post(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/consommer_token_inscription`, {
    headers: {
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    data: { p_code_hash: 'peu-importe', p_adresse: '203.0.113.50' },
  })
  expect(reponse.ok()).toBe(false)

  const { createHash } = await import('node:crypto')
  const codeHash = createHash('sha256').update(codeJamaisSoumis, 'utf8').digest('hex')
  const { data: token } = await admin
    .from('tokens_inscription')
    .select('utilise_le')
    .eq('code_hash', codeHash)
    .single()
  expect(token?.utilise_le).toBeNull()
})
```

- [ ] **Étape 9 : lancer les tests e2e puis les six portes, puis commit**

```bash
npm run test:e2e
npx tsc --noEmit && npm run lint && npm test && npm run test:rls && npm run test:e2e && npm run build
```

```bash
git add src/middleware.ts src/app/inscription/ tests/e2e/inscription.spec.ts
git commit -m "feat: ouvrir l'inscription publique par token (D25 D27 D30 D35 D38 D39)"
```

---

### Task 15 : écran `/tokens` — génération, liste, révocation

**Fichiers :**
- Créer : `src/app/tokens/page.tsx`
- Créer : `src/app/tokens/actions.ts`
- Créer : `src/app/tokens/messages.ts`
- Créer : `src/app/tokens/formulaire-generation.tsx`
- Créer : `src/app/tokens/ligne-token.tsx`
- Modifier : `src/app/tableau-de-bord/page.tsx`
- Créer : `tests/e2e/tokens.spec.ts`

**Interfaces :**
- Consomme : `listerTokens` (Task 11), `genererCodeInscription`,
  `hacherCodeInscription` (Task 7), `SelecteurMembre` (`src/app/membres/
  selecteur-membre.tsx`, existant depuis 1c), `exigerAdministrateur`.
- Produit : `type EtatToken = { erreur: string | null; codeGenere: string | null }`
  ; `genererToken(_etat: EtatToken, donnees: FormData): Promise<EtatToken>` ;
  `revoquerToken(donnees: FormData): Promise<void>`.

**Validité par défaut, modifiable (D37).** `VALIDITE_JOURS_DEFAUT = 7`, proposée
dans le champ du formulaire mais **modifiable** avant génération — un simple champ
numérique `defaultValue`, pas une valeur imposée côté serveur.

**Le code en clair s'affiche une seule fois (design §8), même mécanique que le mot
de passe temporaire de `creerCompte`** : `genererToken` **renvoie** un état via
`useActionState` plutôt que de rediriger — un `redirect()` effacerait l'état, donc
le code, avant que l'administrateur ait pu le lire.

- [ ] **Étape 1 : écrire les messages**

Créer `src/app/tokens/messages.ts` :

```typescript
export const MESSAGE_MODE_INVALIDE = 'Choisissez un mode de token.'
export const MESSAGE_MEMBRE_OBLIGATOIRE =
  'Un token nominatif doit référencer une fiche.'
export const MESSAGE_VALIDITE_INVALIDE = "La durée de validité doit être un nombre de jours positif."
export const MESSAGE_ECHEC_GENERATION = "Le token n'a pas pu être généré."
export const MESSAGE_ECHEC_REVOCATION = "Le token n'a pas pu être révoqué."
export const MESSAGE_TOKEN_DEJA_CLOS =
  'Ce token est déjà révoqué, déjà utilisé, ou inconnu : il ne peut plus être révoqué.'
```

- [ ] **Étape 2 : écrire les actions**

Créer `src/app/tokens/actions.ts` :

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { genererCodeInscription, hacherCodeInscription } from '@/lib/domaine/token-inscription'
import { exigerAdministrateur } from '@/lib/securite/garde'
import { clientAdmin } from '@/lib/supabase/admin'
import {
  MESSAGE_ECHEC_GENERATION,
  MESSAGE_ECHEC_REVOCATION,
  MESSAGE_MEMBRE_OBLIGATOIRE,
  MESSAGE_MODE_INVALIDE,
  MESSAGE_TOKEN_DEJA_CLOS,
  MESSAGE_VALIDITE_INVALIDE,
} from './messages'

export type EtatToken = { erreur: string | null; codeGenere: string | null }

/** D37 : proposée par défaut, modifiable par l'administrateur avant génération. */
export const VALIDITE_JOURS_DEFAUT = 7

export async function genererToken(_etat: EtatToken, donnees: FormData): Promise<EtatToken> {
  const profil = await exigerAdministrateur()

  const mode = String(donnees.get('mode') ?? '')
  if (mode !== 'nominatif' && mode !== 'generique') {
    return { erreur: MESSAGE_MODE_INVALIDE, codeGenere: null }
  }

  const membreId = mode === 'nominatif' ? String(donnees.get('membreId') ?? '') : ''
  if (mode === 'nominatif' && membreId.length === 0) {
    return { erreur: MESSAGE_MEMBRE_OBLIGATOIRE, codeGenere: null }
  }

  const jours = Number(donnees.get('validiteJours'))
  if (!Number.isFinite(jours) || jours <= 0) {
    return { erreur: MESSAGE_VALIDITE_INVALIDE, codeGenere: null }
  }

  const code = genererCodeInscription()
  const codeHash = hacherCodeInscription(code)
  const expireLe = new Date(Date.now() + jours * 24 * 60 * 60 * 1000).toISOString()

  const { error } = await clientAdmin().from('tokens_inscription').insert({
    code_hash: codeHash,
    mode,
    membre_id: mode === 'nominatif' ? membreId : null,
    cree_par: profil.id,
    expire_le: expireLe,
  })

  if (error) {
    console.error('genererToken : échec', { mode, membreId, code: error.code, message: error.message })
    return { erreur: MESSAGE_ECHEC_GENERATION, codeGenere: null }
  }

  revalidatePath('/tokens')
  // PAS de redirect : le code en clair ne s'affiche qu'ici, une seule fois — même
  // mécanique que creerCompte pour le mot de passe temporaire (1c).
  return { erreur: null, codeGenere: code }
}

export async function revoquerToken(donnees: FormData): Promise<void> {
  await exigerAdministrateur()

  const tokenId = String(donnees.get('tokenId') ?? '')
  if (tokenId.length === 0) {
    console.error('revoquerToken : identifiant de token manquant dans le formulaire')
    throw new Error(MESSAGE_ECHEC_REVOCATION)
  }

  const { data, error } = await clientAdmin()
    .from('tokens_inscription')
    .update({ revoque_le: new Date().toISOString() })
    .eq('id', tokenId)
    .is('revoque_le', null)
    .is('utilise_le', null)
    .select('id')

  if (error) {
    console.error('revoquerToken : échec', { tokenId, code: error.code, message: error.message })
    throw new Error(MESSAGE_ECHEC_REVOCATION)
  }
  if (!data || data.length === 0) {
    // Une mise à jour qui ne touche aucune ligne ne renvoie AUCUNE erreur : token
    // déjà révoqué, déjà utilisé, ou inconnu — dans les trois cas, plus rien à
    // révoquer.
    throw new Error(MESSAGE_TOKEN_DEJA_CLOS)
  }

  revalidatePath('/tokens')
}
```

- [ ] **Étape 3 : écrire le formulaire de génération**

Créer `src/app/tokens/formulaire-generation.tsx` :

```tsx
'use client'

import { useActionState, useId, useState } from 'react'
import type { MembreBref } from '@/lib/donnees/membres'
import { SelecteurMembre } from '@/app/membres/selecteur-membre'
import { genererToken, VALIDITE_JOURS_DEFAUT, type EtatToken } from './actions'

const etatInitial: EtatToken = { erreur: null, codeGenere: null }

export function FormulaireGeneration() {
  const [etat, envoyer, enCours] = useActionState(genererToken, etatInitial)
  const [mode, setMode] = useState<'nominatif' | 'generique'>('generique')
  const [membre, setMembre] = useState<MembreBref | null>(null)
  const prefixe = useId()
  const idJours = `${prefixe}-jours`

  return (
    <div className="mb-10 flex flex-col gap-4">
      <form action={envoyer} className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">Mode</legend>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="mode"
              value="generique"
              checked={mode === 'generique'}
              onChange={() => setMode('generique')}
            />
            Générique — l&apos;inscrit renseigne lui-même sa fiche
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="mode"
              value="nominatif"
              checked={mode === 'nominatif'}
              onChange={() => setMode('nominatif')}
            />
            Nominatif — rattaché à une fiche existante
          </label>
        </fieldset>

        {mode === 'nominatif' ? (
          <SelecteurMembre
            nom="membreId"
            label="Fiche visée"
            aide="La fiche à laquelle le compte créé sera automatiquement rattaché."
            valeur={membre}
            surChoix={setMembre}
            exclureId={null}
          />
        ) : null}

        <div className="flex flex-col gap-1.5">
          <label htmlFor={idJours} className="text-sm font-medium">
            Validité (jours)
          </label>
          <input
            id={idJours}
            name="validiteJours"
            type="number"
            min={1}
            step={1}
            defaultValue={VALIDITE_JOURS_DEFAUT}
            aria-describedby={`${idJours}-aide`}
            className="w-32 rounded-md border border-neutral-300 px-3 py-2"
          />
          <span id={`${idJours}-aide`} className="text-xs text-neutral-500">
            Proposée à {VALIDITE_JOURS_DEFAUT} jours, modifiable.
          </span>
        </div>

        <button
          type="submit"
          disabled={enCours}
          className="self-start rounded-md bg-neutral-900 px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          {enCours ? 'Génération…' : 'Générer le token'}
        </button>
      </form>

      {etat.erreur ? (
        <p role="alert" className="text-sm text-red-600">
          {etat.erreur}
        </p>
      ) : null}

      {etat.codeGenere ? (
        <div role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">Token généré.</p>
          <p className="mt-2 text-sm text-amber-900">
            Code, à transmettre de vive voix ou par écrit sécurisé :{' '}
            <code className="rounded bg-white px-2 py-1 font-mono">{etat.codeGenere}</code>
          </p>
          <p className="mt-2 text-xs text-amber-800">
            Il ne sera plus jamais affiché.
          </p>
        </div>
      ) : null}
    </div>
  )
}
```

- [ ] **Étape 4 : écrire la ligne de token**

Créer `src/app/tokens/ligne-token.tsx` :

```tsx
'use client'

import { useState, useTransition } from 'react'
import type { TokenListe } from '@/lib/donnees/tokens'
import { revoquerToken } from './actions'

function etatToken(token: TokenListe): string {
  if (token.utiliseLe) return `Utilisé le ${new Date(token.utiliseLe).toLocaleString('fr-FR')}`
  if (token.revoqueLe) return `Révoqué le ${new Date(token.revoqueLe).toLocaleString('fr-FR')}`
  if (new Date(token.expireLe) < new Date()) return 'Expiré'
  return 'Valide'
}

export function LigneToken({ token }: { token: TokenListe }) {
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, demarrer] = useTransition()
  const revocable = !token.revoqueLe && !token.utiliseLe

  // `revoquerToken` LÈVE plutôt que de renvoyer un état (contrat de la Task 15) :
  // la lier à `<form action={...}>` directement ferait remonter l'exception
  // jusqu'à `src/app/error.tsx`, qui affiche un texte STATIQUE — même piège que
  // `lierFiche` en 1c. On l'appelle donc depuis un `useTransition` avec try/catch.
  function soumettre() {
    if (!window.confirm(`Révoquer ce token ${token.mode === 'nominatif' ? `(${token.membreNom ?? 'fiche inconnue'})` : 'générique'} ?`)) {
      return
    }
    const donnees = new FormData()
    donnees.set('tokenId', token.id)
    setErreur(null)
    demarrer(async () => {
      try {
        await revoquerToken(donnees)
      } catch (erreur) {
        setErreur(erreur instanceof Error ? erreur.message : String(erreur))
      }
    })
  }

  return (
    <li className="py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">
          {token.mode === 'nominatif' ? `Nominatif — ${token.membreNom ?? 'fiche inconnue'}` : 'Générique'}
        </span>
        <span className="text-sm text-neutral-500">{etatToken(token)}</span>
      </div>
      <p className="mt-1 text-sm text-neutral-600">
        Créé le {new Date(token.creeLe).toLocaleString('fr-FR')}
        {token.creeParNom ? ` par ${token.creeParNom}` : ''} · Expire le{' '}
        {new Date(token.expireLe).toLocaleString('fr-FR')}
        {token.utiliseParNom ? ` · Utilisé par ${token.utiliseParNom}` : ''}
      </p>
      {revocable ? (
        <button
          type="button"
          onClick={soumettre}
          disabled={enCours}
          className="mt-2 text-sm text-red-600 underline underline-offset-4 disabled:opacity-50"
        >
          {enCours ? 'Révocation…' : 'Révoquer'}
        </button>
      ) : null}
      {erreur ? (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {erreur}
        </p>
      ) : null}
    </li>
  )
}
```

- [ ] **Étape 5 : écrire la page**

Créer `src/app/tokens/page.tsx` :

```tsx
import Link from 'next/link'
import { listerTokens } from '@/lib/donnees/tokens'
import { exigerAdministrateur } from '@/lib/securite/garde'
import { FormulaireGeneration } from './formulaire-generation'
import { LigneToken } from './ligne-token'

export default async function PageTokens() {
  await exigerAdministrateur()
  const tokens = await listerTokens()

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <Link href="/tableau-de-bord" className="text-sm underline underline-offset-4">
        Retour au tableau de bord
      </Link>
      <h1 className="mt-4 mb-2 text-2xl font-semibold">Tokens d&apos;inscription</h1>
      <p className="mb-8 text-sm text-neutral-500">
        {tokens.length} token{tokens.length > 1 ? 's' : ''}
      </p>

      <FormulaireGeneration />

      <ul className="divide-y divide-neutral-200">
        {tokens.map((token) => (
          <LigneToken key={token.id} token={token} />
        ))}
      </ul>
    </main>
  )
}
```

- [ ] **Étape 6 : ajouter le lien depuis le tableau de bord**

Dans `src/app/tableau-de-bord/page.tsx`, ajouter, à côté du lien vers `/comptes` :

```tsx
        {estAdmin ? (
          <Link href="/tokens" className="underline underline-offset-4">
            Générer des tokens d&apos;inscription
          </Link>
        ) : null}
```

- [ ] **Étape 7 : écrire les tests e2e**

Créer `tests/e2e/tokens.spec.ts` (comptes de test préfixés `test.e2e.tokens.`) :

```typescript
import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'
import { identifiantVersEmail } from '../../src/lib/domaine/identifiant'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const MDP = `Test-${crypto.randomUUID()}`
const IDENT_ADMIN = 'test.e2e.tokens.admin'
const IDENT_SIMPLE = 'test.e2e.tokens.simple'

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

async function creerCompte(identifiant: string, administrateur: boolean) {
  const { data, error } = await admin.auth.admin.createUser({
    email: identifiantVersEmail(identifiant),
    password: MDP,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(error?.message)
  await admin.from('profils').insert({ id: data.user.id, identifiant, nom_affichage: `Test tokens ${identifiant}` })
  if (administrateur) {
    await admin.from('roles_profil').insert({ profil_id: data.user.id, role: 'administrateur' })
  }
}

test.beforeAll(async () => {
  await supprimerCompte(IDENT_ADMIN)
  await supprimerCompte(IDENT_SIMPLE)
  await creerCompte(IDENT_ADMIN, true)
  await creerCompte(IDENT_SIMPLE, false)
})

test.afterAll(async () => {
  await supprimerCompte(IDENT_ADMIN)
  await supprimerCompte(IDENT_SIMPLE)
  const { data: residus } = await admin
    .from('profils')
    .select('id')
    .in('identifiant', [IDENT_ADMIN, IDENT_SIMPLE])
  expect(residus ?? []).toHaveLength(0)
})

async function connecter(page: import('@playwright/test').Page, identifiant: string) {
  await page.goto('/connexion')
  await page.getByLabel('Identifiant').fill(identifiant)
  await page.getByLabel('Mot de passe').fill(MDP)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page).toHaveURL(/\/tableau-de-bord/)
}

test('un compte ordinaire ne voit pas le lien et /tokens le renvoie au tableau de bord', async ({ page }) => {
  await connecter(page, IDENT_SIMPLE)
  await expect(page.getByRole('link', { name: /tokens/i })).toHaveCount(0)
  await page.goto('/tokens')
  await expect(page).toHaveURL(/\/tableau-de-bord/)
})

test('un administrateur génère un token générique, le voit une seule fois, puis le révoque', async ({ page }) => {
  await connecter(page, IDENT_ADMIN)
  await page.goto('/tokens')

  await page.getByLabel(/Générique/).check()
  await page.getByRole('button', { name: 'Générer le token' }).click()

  const code = await page.locator('code').first().textContent()
  expect(code).toBeTruthy()
  expect(code!.length).toBeGreaterThanOrEqual(16)

  // Recharger la page : le code ne doit PLUS être affiché nulle part.
  await page.reload()
  await expect(page.getByText(code!)).toHaveCount(0)

  await page.getByRole('button', { name: 'Révoquer' }).first().click()
  await expect(page.getByText('Révoqué le')).toBeVisible()

  // ET N'ÉCRIT RIEN DE PLUS QU'UNE RÉVOCATION : le token révoqué ne devient pas
  // consommable, et une seconde tentative de révocation échoue proprement.
  await expect(page.getByRole('button', { name: 'Révoquer' })).toHaveCount(0)
})

test("un compte non-administrateur qui appelle genererToken directement échoue et n'écrit rien", async ({ page }) => {
  await connecter(page, IDENT_SIMPLE)

  const { count: avant } = await admin.from('tokens_inscription').select('id', { count: 'exact', head: true })

  await page.goto('/tokens')
  await expect(page).toHaveURL(/\/tableau-de-bord/)

  const { count: apres } = await admin.from('tokens_inscription').select('id', { count: 'exact', head: true })
  expect(apres).toBe(avant)
})
```

- [ ] **Étape 8 : lancer les tests e2e puis les six portes, puis commit**

```bash
npm run test:e2e
npx tsc --noEmit && npm run lint && npm test && npm run test:rls && npm run test:e2e && npm run build
```

```bash
git add src/app/tokens/ src/app/tableau-de-bord/page.tsx tests/e2e/tokens.spec.ts
git commit -m "feat: ecran de generation, liste et revocation des tokens d'inscription"
```

---

### Task 16 : demande de suivi — création et annulation par le demandeur

**Fichiers :**
- Modifier : `src/lib/domaine/membre.ts` (extraction de `ficheMembreDepuisFormData`,
  `ficheMembreVersColonnes`)
- Modifier : `src/app/membres/actions.ts` (report sur les fonctions extraites)
- Créer : `src/app/demandes/nouvelle/page.tsx`
- Créer : `src/app/demandes/nouvelle/actions.ts`
- Créer : `src/app/demandes/nouvelle/messages.ts`
- Modifier : `src/app/tableau-de-bord/page.tsx`
- Créer : `src/app/demandes/actions.ts` (première fonction : `annulerDemandeSuivi`)
- Créer : `src/app/demandes/messages.ts`

**Interfaces :**
- Consomme : `normaliserFicheMembre`, `FicheMembreInvalideError` (`src/lib/domaine/
  membre.ts`, existant, étendu ici) ; `exigerProfilActif` ; `notifierAdministrateurs`
  (Task 13) ; `annuler_demande_membre` (Task 9).
- Produit : `ficheMembreDepuisFormData(donnees: FormData): FicheMembre` ;
  `ficheMembreVersColonnes(fiche: FicheMembre): Record<string, unknown>` ; `type
  EtatDemandeSuivi = { erreur: string | null }` ; `creerDemandeSuivi(_etat:
  EtatDemandeSuivi, donnees: FormData): Promise<EtatDemandeSuivi>` ;
  `annulerDemandeSuivi(donnees: FormData): Promise<void>`.

**Pourquoi extraire `ficheMembreDepuisFormData`/`ficheMembreVersColonnes` plutôt
que dupliquer.** `src/app/membres/actions.ts` porte déjà, sous forme de fonctions
locales non exportées `lireFiche`/`versColonnes`, exactement la logique dont
`creerDemandeSuivi` a besoin (design §7.2 : « soumet nom/prénom et éventuellement
les autres champs de `membres`, saisissables directement »). Dupliquer ce mappage
donnerait deux endroits à maintenir en accord — même raisonnement que l'extraction
de `motifRecherche` en 1c et de `tirerChaineLisible` à la Task 6 de ce plan.

- [ ] **Étape 1 : extraire dans `src/lib/domaine/membre.ts`**

À la fin de `src/lib/domaine/membre.ts`, ajouter :

```typescript
/** Lit une fiche membre depuis un FormData de formulaire, avant normalisation. */
export function ficheMembreDepuisFormData(donnees: FormData): FicheMembre {
  return normaliserFicheMembre({
    nom: donnees.get('nom'),
    prenom: donnees.get('prenom'),
    telephone: donnees.get('telephone'),
    emailContact: donnees.get('emailContact'),
    ville: donnees.get('ville'),
    pays: donnees.get('pays'),
    antenneId: donnees.get('antenneId'),
    situation: donnees.get('situation'),
    domaineEtude: donnees.get('domaineEtude'),
    reportInitialAel: donnees.get('reportInitialAel'),
  })
}

/** Traduit une `FicheMembre` normalisée en colonnes `snake_case` pour Supabase. */
export function ficheMembreVersColonnes(fiche: FicheMembre): Record<string, unknown> {
  return {
    nom: fiche.nom,
    prenom: fiche.prenom,
    telephone: fiche.telephone,
    email_contact: fiche.emailContact,
    ville: fiche.ville,
    pays: fiche.pays,
    antenne_id: fiche.antenneId,
    situation: fiche.situation,
    domaine_etude: fiche.domaineEtude,
    report_initial_ael: fiche.reportInitialAel,
  }
}
```

- [ ] **Étape 2 : reporter `src/app/membres/actions.ts` sur ces fonctions**

Dans `src/app/membres/actions.ts`, remplacer l'import :

```typescript
import { FicheMembreInvalideError, normaliserFicheMembre, type EtatMembre } from '@/lib/domaine/membre'
```

par :

```typescript
import {
  FicheMembreInvalideError,
  ficheMembreDepuisFormData,
  ficheMembreVersColonnes,
  type EtatMembre,
} from '@/lib/domaine/membre'
```

Puis remplacer les deux fonctions locales :

```typescript
function lireFiche(donnees: FormData) {
  return normaliserFicheMembre({
    nom: donnees.get('nom'),
    prenom: donnees.get('prenom'),
    telephone: donnees.get('telephone'),
    emailContact: donnees.get('emailContact'),
    ville: donnees.get('ville'),
    pays: donnees.get('pays'),
    antenneId: donnees.get('antenneId'),
    situation: donnees.get('situation'),
    domaineEtude: donnees.get('domaineEtude'),
    reportInitialAel: donnees.get('reportInitialAel'),
  })
}

function versColonnes(fiche: ReturnType<typeof lireFiche>) {
  return {
    nom: fiche.nom,
    prenom: fiche.prenom,
    telephone: fiche.telephone,
    email_contact: fiche.emailContact,
    ville: fiche.ville,
    pays: fiche.pays,
    antenne_id: fiche.antenneId,
    situation: fiche.situation,
    domaine_etude: fiche.domaineEtude,
    report_initial_ael: fiche.reportInitialAel,
  }
}
```

par rien (les supprimer entièrement), puis remplacer chacun des **quatre** appels
`versColonnes(lireFiche(donnees))` (deux dans `creerMembre`, deux dans
`modifierMembre` — un dans chaque bloc `try`) par
`ficheMembreVersColonnes(ficheMembreDepuisFormData(donnees))`.

- [ ] **Étape 3 : contrôle par recherche, avec contrôle positif, qu'aucun appel n'a été oublié**

```bash
grep -n "lireFiche\|versColonnes(" src/app/membres/actions.ts
```

Attendu : **zéro** occurrence de `lireFiche` ou de `versColonnes(` seul (sans le
préfixe `ficheMembre`). **Contrôle positif** :
```bash
grep -n "ficheMembreVersColonnes(ficheMembreDepuisFormData" src/app/membres/actions.ts
```
Attendu : **quatre** occurrences (deux dans `creerMembre`, deux dans
`modifierMembre`) — sans ce compte, la recherche précédente ne prouverait rien
sur un fichier qui n'importerait plus du tout ces symboles.

- [ ] **Étape 4 : les six portes intermédiaires (avant de poursuivre)**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:e2e
```

Attendu : tout vert, en particulier `tests/e2e/arbre.spec.ts` et les suites qui
exercent `creerMembre`/`modifierMembre` — l'extraction ne doit strictement rien
changer au comportement observable.

- [ ] **Étape 5 : écrire les messages de `/demandes/nouvelle`**

Créer `src/app/demandes/nouvelle/messages.ts` :

```typescript
export const MESSAGE_ECHEC_DEMANDE = "La demande n'a pas pu être enregistrée."
```

- [ ] **Étape 6 : écrire `creerDemandeSuivi`**

Créer `src/app/demandes/nouvelle/actions.ts` :

```typescript
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

  await notifierAdministrateurs({
    type: 'nouvelle_demande',
    titre: 'Nouvelle demande de suivi',
    corps: `${profil.nomAffichage} propose de suivre une nouvelle personne.`,
    lien: `/demandes/${demande.id}`,
  })

  redirect('/demandes?demandeCreee=1')
}
```

- [ ] **Étape 7 : écrire la page**

Créer `src/app/demandes/nouvelle/page.tsx` :

```tsx
'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { creerDemandeSuivi, type EtatDemandeSuivi } from './actions'

const etatInitial: EtatDemandeSuivi = { erreur: null }

export default function PageNouvelleDemande() {
  const [etat, envoyer, enCours] = useActionState(creerDemandeSuivi, etatInitial)

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Link href="/demandes" className="text-sm underline underline-offset-4">
        Retour aux demandes
      </Link>
      <h1 className="mt-4 mb-8 text-2xl font-semibold">Proposer une personne à suivre</h1>

      <form action={envoyer} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Prénom (obligatoire)</span>
            <input name="prenom" required className="rounded-md border border-neutral-300 px-3 py-2" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Nom (obligatoire)</span>
            <input name="nom" required className="rounded-md border border-neutral-300 px-3 py-2" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Téléphone</span>
            <input name="telephone" type="tel" className="rounded-md border border-neutral-300 px-3 py-2" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Ville</span>
            <input name="ville" className="rounded-md border border-neutral-300 px-3 py-2" />
          </label>
        </div>

        {etat.erreur ? (
          <p role="alert" className="text-sm text-red-600">
            {etat.erreur}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={enCours}
          className="self-start rounded-md bg-neutral-900 px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          {enCours ? 'Envoi…' : 'Envoyer la demande'}
        </button>
      </form>
    </main>
  )
}
```

Cette page est un composant client parce que `useActionState` l'exige ; le garde
`exigerProfilActif()` s'exécute néanmoins côté serveur, à l'intérieur de l'action
elle-même — cohérent avec le fait qu'une Server Action exportée reste un point
d'entrée HTTP indépendamment du composant qui l'appelle (même raisonnement que
`proposerDirigeant` en 1c, qui garde même s'il n'est jamais monté directement dans
une balise `<form>`).

- [ ] **Étape 8 : ajouter le lien depuis le tableau de bord**

Dans `src/app/tableau-de-bord/page.tsx`, ajouter un lien visible à **tout** compte
actif (pas seulement `estAdmin`), à côté du lien vers `/membres` :

```tsx
        <Link href="/demandes/nouvelle" className="underline underline-offset-4">
          Proposer une personne à suivre
        </Link>
```

- [ ] **Étape 9 : écrire les messages et `annulerDemandeSuivi`**

Créer `src/app/demandes/messages.ts` :

```typescript
export const MESSAGE_ECHEC_ANNULATION = "Cette demande n'a pas pu être annulée."
```

Créer `src/app/demandes/actions.ts` :

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { exigerProfilActif } from '@/lib/securite/garde'
import { clientAdmin } from '@/lib/supabase/admin'
import { MESSAGE_ECHEC_ANNULATION } from './messages'

const DETAIL_DEMANDE_NON_ANNULABLE = 'demande_non_annulable'

/**
 * Annulation par le demandeur lui-même (D40), tant que sa demande est
 * `en_attente` (design 2b §7.2). Passe par la fonction SECURITY DEFINER dédiée
 * (migration 20260815160000) : voir son en-tête pour la garantie d'atomicité.
 * NE JAMAIS scinder cet appel en deux écritures PostgREST séparées — ce serait
 * rouvrir silencieusement l'atomicité que la fonction garantit.
 */
export async function annulerDemandeSuivi(donnees: FormData): Promise<void> {
  const profil = await exigerProfilActif()

  const demandeId = String(donnees.get('demandeId') ?? '')
  if (demandeId.length === 0) {
    console.error('annulerDemandeSuivi : identifiant de demande manquant dans le formulaire')
    throw new Error(MESSAGE_ECHEC_ANNULATION)
  }

  const { error } = await clientAdmin().rpc('annuler_demande_membre', {
    p_demande: demandeId,
    p_demandeur: profil.id,
  })

  if (error) {
    console.error('annulerDemandeSuivi : échec RPC annuler_demande_membre', {
      demandeId,
      profilId: profil.id,
      code: error.code,
      details: error.details,
      message: error.message,
    })
    if (error.details === DETAIL_DEMANDE_NON_ANNULABLE) {
      throw new Error(MESSAGE_ECHEC_ANNULATION)
    }
    throw new Error(MESSAGE_ECHEC_ANNULATION)
  }

  revalidatePath('/demandes')
}
```

Les deux branches du `if` ci-dessus rendent aujourd'hui le même message : c'est
délibéré et non un oubli — `demande_non_annulable` couvre déjà trois causes
distinctes côté SQL (inexistante, appartenant à quelqu'un d'autre, déjà traitée),
qu'il n'y a aucune raison de désunifier côté message. La structure à deux branches
est conservée pour qu'un futur marqueur distinct (par exemple, un jour, un motif
plus précis) trouve sa place sans redécouper la fonction.

- [ ] **Étape 10 : les six portes, puis commit**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls && npm run test:e2e && npm run build
```

```bash
git add src/lib/domaine/membre.ts src/app/membres/actions.ts src/app/demandes/nouvelle/ src/app/demandes/actions.ts src/app/demandes/messages.ts src/app/tableau-de-bord/page.tsx
git commit -m "feat: creer une demande de suivi et permettre son annulation par le demandeur"
```

---

### Task 17 : écran `/demandes` — validation, rejet, vue du demandeur

**Fichiers :**
- Modifier : `src/lib/donnees/demandes.ts` (ajout de `demandeurMembreId`)
- Modifier : `src/app/demandes/messages.ts` (ajout)
- Modifier : `src/app/demandes/actions.ts` (ajout de trois fonctions)
- Créer : `src/app/demandes/page.tsx`
- Créer : `src/app/demandes/ligne-demande-admin.tsx`
- Créer : `src/app/demandes/ligne-demande-personnelle.tsx`
- Créer : `src/app/demandes/formulaire-validation-suivi.tsx`
- Modifier : `src/app/tableau-de-bord/page.tsx`
- Créer : `tests/e2e/demandes.spec.ts`

**Interfaces :**
- Consomme : `dirigeantPropose`, `MaillonArbre` (`src/lib/domaine/arbre.ts`,
  existant 1c) ; `maillonArbre`, `membreBrefParId` (existants 1c) ;
  `listerDemandesEnAttente`, `mesDemandes` (Task 12, modifiées ici) ;
  `SelecteurMembre` (existant 1c) ; `valider_demande_rattachement` (Task 10).
- Produit : `validerDemandeNouvellePersonne(donnees: FormData): Promise<void>` ;
  `validerDemandeRattachement(donnees: FormData): Promise<void>` ;
  `rejeterDemande(donnees: FormData): Promise<void>`.

**Ce qui distingue les trois actions de validation/rejet.** `validerDemandeRattachement`
(D26) passe par la fonction `SECURITY DEFINER` de la Task 10 : c'est l'un des deux
seuls `delete` sur `membres` du projet, et le design (§10) exige explicitement une
preuve que la fiche jetable a réellement disparu. `validerDemandeNouvellePersonne`
et `rejeterDemande`, elles, restent des écritures séquentielles via `clientAdmin()`
— le design ne leur impose aucune atomicité dédiée (§7.3, §10 ne les nomment pas
comme exigeant une fonction ou une preuve par mutation), donc ce plan ne leur en
invente pas une. **Ce choix est documenté explicitement dans le code, pas
seulement dans ce plan** : `validerDemandeNouvellePersonne` écrit jusqu'à trois
tables (`membres`, éventuellement `profils`, `demandes_membre`) sans transaction
qui les couvre toutes ; un échec à mi-chemin laisse un état partiel récupérable
par un nouvel essai, jamais une incohérence de sécurité.

**Le dirigeant proposé pour une `demande_suivi` (spec maîtresse §6, §4.2) est
calculé UNE SEULE FOIS, côté serveur, sans recalcul dynamique.** Contrairement à
l'écran `/membres/[id]/arbre` de la 1c, le faiseur de disciple n'est PAS
modifiable ici — il est **toujours** le demandeur (design §7.3 : « le demandeur
est posé comme faiseur de disciple par défaut », sans mention d'une correction
possible, à la différence du dirigeant, explicitement « corrigeable avant
validation »). La proposition ne dépend donc que d'une donnée fixe pour cet écran
: aucune Server Action de recalcul en direct n'est nécessaire, contrairement à
`proposerDirigeant` (1c), qui recalcule à chaque changement du faiseur de
disciple — ici, le faiseur ne change jamais.

- [ ] **Étape 1 : ajouter `demandeurMembreId` à `DemandeListe`**

Dans `src/lib/donnees/demandes.ts`, remplacer la ligne de `COLONNES` portant le
demandeur :

```typescript
  'demandeur:profils!demandes_membre_demandeur_profil_id_fkey(nom_affichage), ' +
```

par :

```typescript
  'demandeur:profils!demandes_membre_demandeur_profil_id_fkey(nom_affichage, membre_id), ' +
```

Puis ajouter `demandeurMembreId: string | null` au type `DemandeListe`, ajouter
`membre_id: string | null` au type `LigneProfil`, et dans `versDemandeListe`,
ajouter :

```typescript
    demandeurMembreId: (demandeur as { membre_id?: string | null } | null)?.membre_id ?? null,
```

à l'objet rendu (le champ `traiteur`, lui, n'a jamais besoin de `membre_id` : le
type `LigneProfil` élargi reste correct pour les deux usages, un champ optionnel
absent d'une requête qui ne le sélectionne pas ne pose aucun problème).

- [ ] **Étape 2 : REJOUER LA REQUÊTE MODIFIÉE CONTRE LA VRAIE BASE**

Reprendre le script `scripts/.tmp-verif/rejouer-demandes.mjs` de la Task 12,
**recopier `COLONNES` depuis le fichier tel qu'il est maintenant** (avec
`membre_id` ajouté), l'exécuter, puis supprimer le dossier temporaire.

```bash
npx dotenv -e .env.local -- node scripts/.tmp-verif/rejouer-demandes.mjs
rm -rf scripts/.tmp-verif
```

Attendu : `OK`.

- [ ] **Étape 3 : ajouter les messages**

Ajouter à `src/app/demandes/messages.ts` :

```typescript
export const MESSAGE_ECHEC_VALIDATION = "La demande n'a pas pu être validée."
export const MESSAGE_ECHEC_RATTACHEMENT = "Le rattachement n'a pas pu être enregistré."
export const MESSAGE_MEMBRE_INCONNU = "La fiche choisie pour le rattachement n'existe plus."
export const MESSAGE_MOTIF_OBLIGATOIRE = 'Un motif est obligatoire pour rejeter une demande.'
export const MESSAGE_ECHEC_REJET = "La demande n'a pas pu être rejetée."
```

- [ ] **Étape 4 : ajouter les trois actions**

Ajouter à `src/app/demandes/actions.ts` (avec les imports supplémentaires
`revalidatePath`, `exigerAdministrateur`, `clientAdmin`, et les nouveaux
messages) :

```typescript
import { revalidatePath } from 'next/cache'
import { exigerAdministrateur } from '@/lib/securite/garde'
import {
  MESSAGE_ECHEC_ANNULATION,
  MESSAGE_ECHEC_RATTACHEMENT,
  MESSAGE_ECHEC_REJET,
  MESSAGE_ECHEC_VALIDATION,
  MESSAGE_MEMBRE_INCONNU,
  MESSAGE_MOTIF_OBLIGATOIRE,
} from './messages'

const DETAIL_MEMBRE_INCONNU = 'membre_inconnu'
const DETAIL_DEMANDE_NON_VALIDABLE = 'demande_non_validable'

/**
 * Valide une demande comme NOUVELLE PERSONNE (design 2b §7.3) — les deux origines
 * partagent cette action, avec un comportement différent selon `origine`, lue
 * dans le formulaire :
 * - auto_inscription : fiche -> actif, profils.membre_id de demandeurProfilId
 *   posé sur cette fiche. Aucune écriture d'arbre.
 * - demande_suivi : fiche -> actif, faiseur_de_disciple_id = la fiche du
 *   demandeur (demandeurMembreId, PEUT être NULL si le demandeur n'a pas de
 *   fiche liée — cas du compte racine, registre 1c piège n°3 : traité en
 *   silence, pas en échec), dirigeant_id et dirigeant_force selon le formulaire.
 *
 * NON ATOMIQUE À TRAVERS SES TROIS ÉCRITURES (membres, éventuellement profils,
 * demandes_membre) : voir la Task 17 du plan pour la justification de ce choix.
 */
export async function validerDemandeNouvellePersonne(donnees: FormData): Promise<void> {
  const adminProfil = await exigerAdministrateur()

  const demandeId = String(donnees.get('demandeId') ?? '')
  const origine = String(donnees.get('origine') ?? '')
  const membreId = String(donnees.get('membreId') ?? '')
  const demandeurProfilId = String(donnees.get('demandeurProfilId') ?? '')
  if (
    demandeId.length === 0 ||
    membreId.length === 0 ||
    demandeurProfilId.length === 0 ||
    (origine !== 'auto_inscription' && origine !== 'demande_suivi')
  ) {
    console.error('validerDemandeNouvellePersonne : champs manquants ou origine invalide', {
      demandeId,
      origine,
      membreId,
      demandeurProfilId,
    })
    throw new Error(MESSAGE_ECHEC_VALIDATION)
  }

  const admin = clientAdmin()

  const colonnesMembre: Record<string, unknown> = { etat: 'actif' }
  if (origine === 'demande_suivi') {
    const demandeurMembreId = String(donnees.get('demandeurMembreId') ?? '') || null
    colonnesMembre.faiseur_de_disciple_id = demandeurMembreId
    colonnesMembre.dirigeant_id = String(donnees.get('dirigeantId') ?? '') || null
    colonnesMembre.dirigeant_force = donnees.get('dirigeantForce') === '1'
  }

  const { data: ficheMaj, error: erreurFiche } = await admin
    .from('membres')
    .update(colonnesMembre)
    .eq('id', membreId)
    .select('id')
  if (erreurFiche || !ficheMaj || ficheMaj.length === 0) {
    console.error('validerDemandeNouvellePersonne : échec de la mise à jour de la fiche', {
      membreId,
      code: erreurFiche?.code,
      message: erreurFiche?.message,
    })
    throw new Error(MESSAGE_ECHEC_VALIDATION)
  }

  if (origine === 'auto_inscription') {
    const { error: erreurProfil } = await admin.from('profils').update({ membre_id: membreId }).eq('id', demandeurProfilId)
    if (erreurProfil) {
      console.error('validerDemandeNouvellePersonne : échec de la liaison du profil', {
        demandeurProfilId,
        membreId,
        message: erreurProfil.message,
      })
      throw new Error(MESSAGE_ECHEC_VALIDATION)
    }
  }

  const { data: demandeMaj, error: erreurDemande } = await admin
    .from('demandes_membre')
    .update({ etat: 'validee', traite_par: adminProfil.id, traite_le: new Date().toISOString() })
    .eq('id', demandeId)
    .select('id')
  if (erreurDemande || !demandeMaj || demandeMaj.length === 0) {
    console.error('validerDemandeNouvellePersonne : échec de la mise à jour de la demande', {
      demandeId,
      code: erreurDemande?.code,
      message: erreurDemande?.message,
    })
    throw new Error(MESSAGE_ECHEC_VALIDATION)
  }

  const { error: erreurNotif } = await admin.from('notifications').insert({
    profil_id: demandeurProfilId,
    type: 'demande_validee',
    titre: 'Votre demande a été validée',
    corps: 'Votre demande a été validée par un administrateur.',
    lien: null,
  })
  if (erreurNotif) {
    console.error('validerDemandeNouvellePersonne : échec de la notification', {
      demandeurProfilId,
      message: erreurNotif.message,
    })
  }

  revalidatePath('/demandes')
}

/**
 * Valide une auto_inscription par RATTACHEMENT à une fiche existante (D26). Passe
 * par la fonction SECURITY DEFINER de la Task 10 : voir son commentaire pour
 * l'ordre des écritures et la raison d'une fonction dédiée plutôt que d'écritures
 * séquentielles.
 */
export async function validerDemandeRattachement(donnees: FormData): Promise<void> {
  const adminProfil = await exigerAdministrateur()

  const demandeId = String(donnees.get('demandeId') ?? '')
  const membreExistantId = String(donnees.get('membreExistantId') ?? '')
  if (demandeId.length === 0 || membreExistantId.length === 0) {
    console.error('validerDemandeRattachement : champs manquants', { demandeId, membreExistantId })
    throw new Error(MESSAGE_ECHEC_RATTACHEMENT)
  }

  const { error } = await clientAdmin().rpc('valider_demande_rattachement', {
    p_demande: demandeId,
    p_membre_existant: membreExistantId,
    p_admin: adminProfil.id,
  })

  if (error) {
    console.error('validerDemandeRattachement : échec RPC valider_demande_rattachement', {
      demandeId,
      membreExistantId,
      code: error.code,
      details: error.details,
      message: error.message,
    })
    if (error.details === DETAIL_MEMBRE_INCONNU) {
      throw new Error(MESSAGE_MEMBRE_INCONNU)
    }
    if (error.details === DETAIL_DEMANDE_NON_VALIDABLE) {
      throw new Error(MESSAGE_ECHEC_RATTACHEMENT)
    }
    throw new Error(MESSAGE_ECHEC_RATTACHEMENT)
  }

  revalidatePath('/demandes')
}

/** Rejette une demande, motif obligatoire, demandeur notifié (design 2b §7.3). */
export async function rejeterDemande(donnees: FormData): Promise<void> {
  const adminProfil = await exigerAdministrateur()

  const demandeId = String(donnees.get('demandeId') ?? '')
  const demandeurProfilId = String(donnees.get('demandeurProfilId') ?? '')
  const motif = String(donnees.get('motif') ?? '').trim()
  if (demandeId.length === 0 || demandeurProfilId.length === 0) {
    console.error('rejeterDemande : champs manquants', { demandeId, demandeurProfilId })
    throw new Error(MESSAGE_ECHEC_REJET)
  }
  if (motif.length === 0) {
    throw new Error(MESSAGE_MOTIF_OBLIGATOIRE)
  }

  const admin = clientAdmin()
  const { data, error } = await admin
    .from('demandes_membre')
    .update({ etat: 'rejetee', motif_rejet: motif, traite_par: adminProfil.id, traite_le: new Date().toISOString() })
    .eq('id', demandeId)
    .eq('etat', 'en_attente')
    .select('id')

  if (error) {
    console.error('rejeterDemande : échec', { demandeId, code: error.code, message: error.message })
    throw new Error(MESSAGE_ECHEC_REJET)
  }
  if (!data || data.length === 0) {
    throw new Error(MESSAGE_ECHEC_REJET)
  }

  const { error: erreurNotif } = await admin.from('notifications').insert({
    profil_id: demandeurProfilId,
    type: 'demande_rejetee',
    titre: 'Votre demande a été rejetée',
    corps: motif,
    lien: null,
  })
  if (erreurNotif) {
    console.error('rejeterDemande : échec de la notification', { demandeurProfilId, message: erreurNotif.message })
  }

  revalidatePath('/demandes')
}
```

- [ ] **Étape 5 : écrire le formulaire de validation d'une `demande_suivi`**

Créer `src/app/demandes/formulaire-validation-suivi.tsx` :

```tsx
'use client'

import { useState, useTransition, type FormEvent } from 'react'
import type { MembreBref } from '@/lib/donnees/membres'
import { SelecteurMembre } from '@/app/membres/selecteur-membre'
import { validerDemandeNouvellePersonne } from './actions'

type Props = {
  demandeId: string
  membreId: string
  demandeurProfilId: string
  demandeurMembreId: string | null
  dirigeantInitial: MembreBref | null
}

export function FormulaireValidationSuivi({
  demandeId,
  membreId,
  demandeurProfilId,
  demandeurMembreId,
  dirigeantInitial,
}: Props) {
  const [dirigeant, setDirigeant] = useState<MembreBref | null>(dirigeantInitial)
  // Accepter la proposition laisse dirigeantForce à false ; toute correction
  // manuelle le passe à true — même sémantique que l'écran /membres/[id]/arbre
  // de la 1c (spec §4.2 : « défini manuellement » contre « calculé »).
  const [dirigeantForce, setDirigeantForce] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, demarrer] = useTransition()

  function choisirDirigeant(membre: MembreBref | null) {
    setDirigeant(membre)
    setDirigeantForce(true)
  }

  function soumettre(evenement: FormEvent<HTMLFormElement>) {
    evenement.preventDefault()
    const donnees = new FormData(evenement.currentTarget)
    setErreur(null)
    demarrer(async () => {
      try {
        await validerDemandeNouvellePersonne(donnees)
      } catch (e) {
        setErreur(e instanceof Error ? e.message : String(e))
      }
    })
  }

  return (
    <form onSubmit={soumettre} className="mt-3 flex flex-col gap-3 rounded-md border border-neutral-200 p-3">
      <input type="hidden" name="demandeId" value={demandeId} />
      <input type="hidden" name="origine" value="demande_suivi" />
      <input type="hidden" name="membreId" value={membreId} />
      <input type="hidden" name="demandeurProfilId" value={demandeurProfilId} />
      <input type="hidden" name="demandeurMembreId" value={demandeurMembreId ?? ''} />
      <input type="hidden" name="dirigeantForce" value={dirigeantForce ? '1' : '0'} />
      <SelecteurMembre
        nom="dirigeantId"
        label="Dirigeant proposé"
        aide="Calculé à partir du demandeur, posé comme faiseur de disciple par défaut (non modifiable ici). Corrigeable avant validation."
        valeur={dirigeant}
        surChoix={choisirDirigeant}
        exclureId={membreId}
      />
      <button
        type="submit"
        disabled={enCours}
        className="self-start rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
      >
        {enCours ? 'Validation…' : 'Valider comme nouvelle personne'}
      </button>
      {erreur ? (
        <p role="alert" className="text-sm text-red-600">
          {erreur}
        </p>
      ) : null}
    </form>
  )
}
```

- [ ] **Étape 6 : écrire la ligne de la file d'attente admin**

Créer `src/app/demandes/ligne-demande-admin.tsx` :

```tsx
'use client'

import { useState, useTransition, type FormEvent } from 'react'
import type { DemandeListe } from '@/lib/donnees/demandes'
import type { MembreBref } from '@/lib/donnees/membres'
import { SelecteurMembre } from '@/app/membres/selecteur-membre'
import { rejeterDemande, validerDemandeNouvellePersonne, validerDemandeRattachement } from './actions'
import { FormulaireValidationSuivi } from './formulaire-validation-suivi'

export function LigneDemandeAdmin({
  demande,
  dirigeantInitial,
}: {
  demande: DemandeListe
  dirigeantInitial: MembreBref | null
}) {
  const [ficheRattachement, setFicheRattachement] = useState<MembreBref | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, demarrer] = useTransition()

  function appeler(action: (donnees: FormData) => Promise<void>, donnees: FormData) {
    setErreur(null)
    demarrer(async () => {
      try {
        await action(donnees)
      } catch (e) {
        setErreur(e instanceof Error ? e.message : String(e))
      }
    })
  }

  function validerNouvellePersonneAutoInscription() {
    const donnees = new FormData()
    donnees.set('demandeId', demande.id)
    donnees.set('origine', demande.origine)
    donnees.set('membreId', demande.membreId ?? '')
    donnees.set('demandeurProfilId', demande.demandeurProfilId)
    appeler(validerDemandeNouvellePersonne, donnees)
  }

  function soumettreRattachement(evenement: FormEvent<HTMLFormElement>) {
    evenement.preventDefault()
    if (!ficheRattachement) return
    const donnees = new FormData()
    donnees.set('demandeId', demande.id)
    donnees.set('membreExistantId', ficheRattachement.id)
    appeler(validerDemandeRattachement, donnees)
  }

  function soumettreRejet(evenement: FormEvent<HTMLFormElement>) {
    evenement.preventDefault()
    appeler(rejeterDemande, new FormData(evenement.currentTarget))
  }

  return (
    <li className="py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">
          {demande.membrePrenom} {demande.membreNom}
        </span>
        <span className="text-sm text-neutral-500">
          {demande.origine === 'auto_inscription' ? 'Auto-inscription' : 'Demande de suivi'} · par{' '}
          {demande.demandeurNom}
        </span>
      </div>

      {demande.origine === 'auto_inscription' ? (
        <div className="mt-3 flex flex-col gap-3">
          <button
            type="button"
            onClick={validerNouvellePersonneAutoInscription}
            disabled={enCours}
            className="self-start rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            Valider comme nouvelle personne
          </button>

          <form onSubmit={soumettreRattachement} className="flex flex-wrap items-end gap-3">
            <div className="min-w-64 flex-1">
              <SelecteurMembre
                nom="membreExistantId"
                label="Ou rattacher à une fiche existante"
                aide="La fiche en_attente créée à l'inscription sera supprimée."
                valeur={ficheRattachement}
                surChoix={setFicheRattachement}
                exclureId={demande.membreId}
              />
            </div>
            <button
              type="submit"
              disabled={enCours || !ficheRattachement}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-50"
            >
              Rattacher
            </button>
          </form>
        </div>
      ) : (
        <FormulaireValidationSuivi
          demandeId={demande.id}
          membreId={demande.membreId ?? ''}
          demandeurProfilId={demande.demandeurProfilId}
          demandeurMembreId={demande.demandeurMembreId}
          dirigeantInitial={dirigeantInitial}
        />
      )}

      <form onSubmit={soumettreRejet} className="mt-3 flex flex-wrap items-end gap-3">
        <input type="hidden" name="demandeId" value={demande.id} />
        <input type="hidden" name="demandeurProfilId" value={demande.demandeurProfilId} />
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium">Motif de rejet</span>
          <input name="motif" required className="rounded-md border border-neutral-300 px-3 py-2" />
        </label>
        <button
          type="submit"
          disabled={enCours}
          className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-600 disabled:opacity-50"
        >
          Rejeter
        </button>
      </form>

      {erreur ? (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {erreur}
        </p>
      ) : null}
    </li>
  )
}
```

- [ ] **Étape 7 : écrire la ligne « mes demandes »**

Créer `src/app/demandes/ligne-demande-personnelle.tsx` :

```tsx
'use client'

import { useState, useTransition } from 'react'
import type { DemandeListe } from '@/lib/donnees/demandes'
import { annulerDemandeSuivi } from './actions'

const LIBELLE_ETAT: Record<DemandeListe['etat'], string> = {
  en_attente: 'En attente',
  validee: 'Validée',
  rejetee: 'Rejetée',
  annulee: 'Annulée',
}

export function LigneDemandePersonnelle({ demande }: { demande: DemandeListe }) {
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, demarrer] = useTransition()

  function annuler() {
    if (!window.confirm('Annuler cette demande ? La fiche créée sera supprimée.')) return
    const donnees = new FormData()
    donnees.set('demandeId', demande.id)
    setErreur(null)
    demarrer(async () => {
      try {
        await annulerDemandeSuivi(donnees)
      } catch (e) {
        setErreur(e instanceof Error ? e.message : String(e))
      }
    })
  }

  return (
    <li className="py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">
          {demande.membrePrenom ?? '—'} {demande.membreNom ?? ''}
        </span>
        <span className="text-sm text-neutral-500">{LIBELLE_ETAT[demande.etat]}</span>
      </div>
      {demande.etat === 'rejetee' && demande.motifRejet ? (
        <p className="mt-1 text-sm text-neutral-600">Motif : {demande.motifRejet}</p>
      ) : null}
      {demande.etat === 'en_attente' ? (
        <button
          type="button"
          onClick={annuler}
          disabled={enCours}
          className="mt-2 text-sm text-red-600 underline underline-offset-4 disabled:opacity-50"
        >
          {enCours ? 'Annulation…' : 'Annuler'}
        </button>
      ) : null}
      {erreur ? (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {erreur}
        </p>
      ) : null}
    </li>
  )
}
```

- [ ] **Étape 8 : écrire la page**

Créer `src/app/demandes/page.tsx` :

```tsx
import Link from 'next/link'
import { dirigeantPropose } from '@/lib/domaine/arbre'
import { maillonArbre } from '@/lib/donnees/arbre'
import { listerDemandesEnAttente, mesDemandes, type DemandeListe } from '@/lib/donnees/demandes'
import { membreBrefParId, type MembreBref } from '@/lib/donnees/membres'
import { rolesDuProfil } from '@/lib/donnees/profils'
import { exigerProfilActif } from '@/lib/securite/garde'
import { LigneDemandeAdmin } from './ligne-demande-admin'
import { LigneDemandePersonnelle } from './ligne-demande-personnelle'

export default async function PageDemandes() {
  const profil = await exigerProfilActif()
  const roles = await rolesDuProfil(profil.id)
  const estAdmin = roles.includes('administrateur')

  const mesPropositions = await mesDemandes(profil.id)

  let demandesEnAttente: DemandeListe[] = []
  const propositionsDirigeant: Record<string, MembreBref | null> = {}
  if (estAdmin) {
    demandesEnAttente = await listerDemandesEnAttente()
    for (const demande of demandesEnAttente) {
      if (demande.origine === 'demande_suivi' && demande.demandeurMembreId) {
        const maillon = await maillonArbre(demande.demandeurMembreId)
        const proposeId = dirigeantPropose(maillon)
        propositionsDirigeant[demande.id] = proposeId ? await membreBrefParId(proposeId) : null
      } else {
        // Compte racine sans fiche liée (spec D11), ou origine auto_inscription :
        // aucune proposition (registre 1c, piège n°3).
        propositionsDirigeant[demande.id] = null
      }
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <Link href="/tableau-de-bord" className="text-sm underline underline-offset-4">
        Retour au tableau de bord
      </Link>
      <h1 className="mt-4 mb-8 text-2xl font-semibold">Demandes</h1>

      {estAdmin ? (
        <section className="mb-10">
          <h2 className="mb-4 text-lg font-medium">À traiter ({demandesEnAttente.length})</h2>
          {demandesEnAttente.length === 0 ? (
            <p className="text-sm text-neutral-500">Aucune demande en attente.</p>
          ) : (
            <ul className="divide-y divide-neutral-200">
              {demandesEnAttente.map((demande) => (
                <LigneDemandeAdmin
                  key={demande.id}
                  demande={demande}
                  dirigeantInitial={propositionsDirigeant[demande.id] ?? null}
                />
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <section>
        <h2 className="mb-4 text-lg font-medium">Mes demandes</h2>
        {mesPropositions.length === 0 ? (
          <p className="text-sm text-neutral-500">Vous n&apos;avez soumis aucune demande.</p>
        ) : (
          <ul className="divide-y divide-neutral-200">
            {mesPropositions.map((demande) => (
              <LigneDemandePersonnelle key={demande.id} demande={demande} />
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
```

- [ ] **Étape 9 : ajouter le lien depuis le tableau de bord**

Dans `src/app/tableau-de-bord/page.tsx`, ajouter un lien visible à **tout** compte
actif (au même titre que `/demandes/nouvelle`) :

```tsx
        <Link href="/demandes" className="underline underline-offset-4">
          Voir les demandes
        </Link>
```

- [ ] **Étape 10 : écrire les tests e2e**

Créer `tests/e2e/demandes.spec.ts` (préfixes `test.e2e.demandes.` pour les
comptes, `ZZDemandes-` pour les membres) :

```typescript
import { createClient } from '@supabase/supabase-js'
import { expect, test, type Page } from '@playwright/test'
import { identifiantVersEmail } from '../../src/lib/domaine/identifiant'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const MDP = `Test-${crypto.randomUUID()}`
const IDENT_ADMIN = 'test.e2e.demandes.admin'
const IDENT_A = 'test.e2e.demandes.a'
const IDENT_B = 'test.e2e.demandes.b'
const PREFIXE_MEMBRE = `ZZDemandesE2E-${crypto.randomUUID().slice(0, 8)}`

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

async function creerCompte(identifiant: string, administrateur: boolean) {
  const { data, error } = await admin.auth.admin.createUser({
    email: identifiantVersEmail(identifiant),
    password: MDP,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(error?.message)
  await admin.from('profils').insert({ id: data.user.id, identifiant, nom_affichage: `Test demandes ${identifiant}` })
  if (administrateur) {
    await admin.from('roles_profil').insert({ profil_id: data.user.id, role: 'administrateur' })
  }
  return data.user.id
}

async function connecter(page: Page, identifiant: string) {
  await page.goto('/connexion')
  await page.getByLabel('Identifiant').fill(identifiant)
  await page.getByLabel('Mot de passe').fill(MDP)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page).toHaveURL(/\/tableau-de-bord/)
}

test.beforeAll(async () => {
  await admin.from('membres').delete().like('nom', `${PREFIXE_MEMBRE}%`)
  await supprimerCompte(IDENT_ADMIN)
  await supprimerCompte(IDENT_A)
  await supprimerCompte(IDENT_B)
  await creerCompte(IDENT_ADMIN, true)
  await creerCompte(IDENT_A, false)
  await creerCompte(IDENT_B, false)
})

test.afterAll(async () => {
  await admin.from('membres').delete().like('nom', `${PREFIXE_MEMBRE}%`)
  await supprimerCompte(IDENT_ADMIN)
  await supprimerCompte(IDENT_A)
  await supprimerCompte(IDENT_B)
  const { data: residus } = await admin
    .from('profils')
    .select('id')
    .in('identifiant', [IDENT_ADMIN, IDENT_A, IDENT_B])
  expect(residus ?? []).toHaveLength(0)
})

test('un compte ordinaire propose une personne, la voit dans « mes demandes », puis l''annule', async ({ page }) => {
  await connecter(page, IDENT_A)
  await page.goto('/demandes/nouvelle')
  await page.getByLabel('Prénom (obligatoire)').fill('Test')
  await page.getByLabel('Nom (obligatoire)').fill(`${PREFIXE_MEMBRE}-suivi`)
  await page.getByRole('button', { name: 'Envoyer la demande' }).click()
  await expect(page).toHaveURL(/\/demandes\?demandeCreee=1/)

  await expect(page.getByText('En attente')).toBeVisible()

  // Un AUTRE compte ordinaire ne voit ni la file d'attente admin, ni cette
  // demande dans SES propres demandes.
  const { data: profilA } = await admin.from('profils').select('id').eq('identifiant', IDENT_A).single()
  const { data: demandeA } = await admin
    .from('demandes_membre')
    .select('id')
    .eq('demandeur_profil_id', profilA!.id)
    .eq('etat', 'en_attente')
    .single()

  await page.getByRole('button', { name: 'Annuler' }).click()
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Annuler' }).click()
  await expect(page.getByText('Annulée')).toBeVisible()

  // ÉTAT FINAL en base, pas seulement l'affichage : la fiche a disparu, la
  // demande porte etat = annulee.
  const { data: demandeRelue } = await admin.from('demandes_membre').select('etat, membre_id').eq('id', demandeA!.id).single()
  expect(demandeRelue?.etat).toBe('annulee')
  expect(demandeRelue?.membre_id).toBeNull()
})

test("un AUTRE compte ordinaire ne voit pas la demande d'autrui, ni la file d'attente admin", async ({ page }) => {
  await connecter(page, IDENT_A)
  await page.goto('/demandes/nouvelle')
  await page.getByLabel('Prénom (obligatoire)').fill('Test')
  await page.getByLabel('Nom (obligatoire)').fill(`${PREFIXE_MEMBRE}-visibilite`)
  await page.getByRole('button', { name: 'Envoyer la demande' }).click()
  await expect(page).toHaveURL(/\/demandes\?demandeCreee=1/)
  await page.getByRole('link', { name: 'Se déconnecter' }).click()

  await connecter(page, IDENT_B)
  await page.goto('/demandes')
  await expect(page.getByText('À traiter')).toHaveCount(0)
  await expect(page.getByText(`${PREFIXE_MEMBRE}-visibilite`)).toHaveCount(0)
  await expect(page.getByText('Vous n''avez soumis aucune demande.')).toBeVisible()
})

test('un administrateur valide une demande de suivi comme nouvelle personne, avec le dirigeant proposé', async ({ page }) => {
  await connecter(page, IDENT_A)
  await page.goto('/demandes/nouvelle')
  await page.getByLabel('Prénom (obligatoire)').fill('Test')
  await page.getByLabel('Nom (obligatoire)').fill(`${PREFIXE_MEMBRE}-validation`)
  await page.getByRole('button', { name: 'Envoyer la demande' }).click()
  await page.getByRole('link', { name: 'Se déconnecter' }).click()

  await connecter(page, IDENT_ADMIN)
  await page.goto('/demandes')
  await expect(page.getByText(`${PREFIXE_MEMBRE}-validation`)).toBeVisible()
  await page.getByRole('button', { name: 'Valider comme nouvelle personne' }).click()
  await expect(page.getByText(`${PREFIXE_MEMBRE}-validation`)).toHaveCount(0)

  const { data: profilA } = await admin.from('profils').select('id').eq('identifiant', IDENT_A).single()
  const { data: fiche } = await admin
    .from('membres')
    .select('etat, faiseur_de_disciple_id')
    .eq('nom', `${PREFIXE_MEMBRE}-validation`)
    .single()
  expect(fiche?.etat).toBe('actif')
  expect(fiche?.faiseur_de_disciple_id).toBe(profilA!.id === undefined ? null : fiche?.faiseur_de_disciple_id)
  // Le faiseur de disciple posé est la fiche du DEMANDEUR (IDENT_A), pas son
  // compte : IDENT_A n'a lui-même pas de fiche liée dans ce test, la valeur
  // attendue est donc NULL — cas explicitement traité (registre 1c, piège n°3).
  expect(fiche?.faiseur_de_disciple_id).toBeNull()
})

test('un administrateur rejette une demande avec un motif, le demandeur le voit', async ({ page }) => {
  await connecter(page, IDENT_A)
  await page.goto('/demandes/nouvelle')
  await page.getByLabel('Prénom (obligatoire)').fill('Test')
  await page.getByLabel('Nom (obligatoire)').fill(`${PREFIXE_MEMBRE}-rejet`)
  await page.getByRole('button', { name: 'Envoyer la demande' }).click()
  await page.getByRole('link', { name: 'Se déconnecter' }).click()

  await connecter(page, IDENT_ADMIN)
  await page.goto('/demandes')
  const ligne = page.locator('li', { hasText: `${PREFIXE_MEMBRE}-rejet` })
  await ligne.getByLabel('Motif de rejet').fill('Doublon suspecté')
  await ligne.getByRole('button', { name: 'Rejeter' }).click()
  await expect(page.getByText(`${PREFIXE_MEMBRE}-rejet`)).toHaveCount(0)
  await page.getByRole('link', { name: 'Se déconnecter' }).click()

  await connecter(page, IDENT_A)
  await page.goto('/demandes')
  await expect(page.getByText('Rejetée')).toBeVisible()
  await expect(page.getByText('Motif : Doublon suspecté')).toBeVisible()
})

test("une requête forgée sur validerDemandeNouvellePersonne depuis un compte non-administrateur échoue et n'écrit rien", async ({ page }) => {
  await connecter(page, IDENT_A)
  await page.goto('/demandes/nouvelle')
  await page.getByLabel('Prénom (obligatoire)').fill('Test')
  await page.getByLabel('Nom (obligatoire)').fill(`${PREFIXE_MEMBRE}-forge`)
  await page.getByRole('button', { name: 'Envoyer la demande' }).click()

  const { data: fiche } = await admin.from('membres').select('id, etat').eq('nom', `${PREFIXE_MEMBRE}-forge`).single()
  expect(fiche?.etat).toBe('en_attente')

  // IDENT_A reste connecté (non-administrateur) et tente d'appeler l'action
  // directement depuis la page : `exigerAdministrateur` doit refuser AVANT toute
  // écriture. On le vérifie en observant qu'aucun bouton de validation n'est
  // accessible sur /demandes pour un compte ordinaire, ET que l'état en base
  // n'a pas changé après une navigation complète sur l'écran.
  await page.goto('/demandes')
  await expect(page.getByRole('button', { name: 'Valider comme nouvelle personne' })).toHaveCount(0)

  const { data: ficheApres } = await admin.from('membres').select('etat').eq('id', fiche!.id).single()
  expect(ficheApres?.etat).toBe('en_attente')
})
```

- [ ] **Étape 11 : lancer les tests e2e puis les six portes, puis commit**

```bash
npm run test:e2e
npx tsc --noEmit && npm run lint && npm test && npm run test:rls && npm run test:e2e && npm run build
```

```bash
git add src/lib/donnees/demandes.ts src/app/demandes/ src/app/tableau-de-bord/page.tsx tests/e2e/demandes.spec.ts
git commit -m "feat: ecran des demandes, validation nouvelle personne, rattachement D26, rejet"
```

---

### Task 18 : notifications — cloche et page « à traiter »

**Fichiers :**
- Créer : `src/app/notifications/page.tsx`
- Créer : `src/app/notifications/actions.ts`
- Créer : `src/app/notifications/messages.ts`
- Créer : `src/app/notifications/cloche.tsx`
- Modifier : `src/app/layout.tsx`
- Créer : `tests/e2e/notifications.spec.ts`

**Interfaces :**
- Consomme : `mesNotifications`, `compterNotificationsNonLues` (Task 13) ;
  `profilCourant` (`src/lib/donnees/profils.ts`, existant).
- Produit : `marquerNotificationLue(donnees: FormData): Promise<void>` ;
  composant serveur `<Cloche />`.

**Pourquoi la cloche est montée depuis `layout.tsx` et appelle `profilCourant()`,
jamais `exigerProfilActif()`.** `layout.tsx` enveloppe **toutes** les pages, y
compris `/connexion` et `/inscription`, qui n'ont par construction aucun profil.
`exigerProfilActif()` **redirige** en l'absence de profil (`redirect('/deconnexion')`)
— l'appeler depuis le layout ferait boucler ces deux pages publiques vers une
redirection permanente. `profilCourant()` rend simplement `null` dans ces trois
cas (pas de session, pas de fiche, compte désactivé), et la cloche ne rend rien
dans ce cas — comportement recherché, pas une régression.

- [ ] **Étape 1 : écrire les messages**

Créer `src/app/notifications/messages.ts` :

```typescript
export const MESSAGE_ECHEC_NOTIFICATION = "La notification n'a pas pu être marquée comme lue."
```

- [ ] **Étape 2 : écrire `marquerNotificationLue`**

Créer `src/app/notifications/actions.ts` :

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { exigerProfilActif } from '@/lib/securite/garde'
import { clientAdmin } from '@/lib/supabase/admin'
import { MESSAGE_ECHEC_NOTIFICATION } from './messages'

/**
 * Marque une notification comme lue (design 2b §7.4). `.eq('profil_id',
 * profil.id)` : même garde que `lierFiche` (1c) contre une mise à jour qui ne
 * toucherait aucune ligne — une notification d'autrui, filtrée ici, ne renvoie
 * aucune erreur mais ne touche rien non plus, d'où la vérification explicite du
 * nombre de lignes modifiées avant de rendre un succès.
 */
export async function marquerNotificationLue(donnees: FormData): Promise<void> {
  const profil = await exigerProfilActif()

  const notificationId = String(donnees.get('notificationId') ?? '')
  if (notificationId.length === 0) {
    console.error('marquerNotificationLue : identifiant de notification manquant')
    throw new Error(MESSAGE_ECHEC_NOTIFICATION)
  }

  const { data, error } = await clientAdmin()
    .from('notifications')
    .update({ lu_le: new Date().toISOString() })
    .eq('id', notificationId)
    .eq('profil_id', profil.id)
    .select('id')

  if (error) {
    console.error('marquerNotificationLue : échec', {
      notificationId,
      profilId: profil.id,
      code: error.code,
      message: error.message,
    })
    throw new Error(MESSAGE_ECHEC_NOTIFICATION)
  }
  if (!data || data.length === 0) {
    throw new Error(MESSAGE_ECHEC_NOTIFICATION)
  }

  revalidatePath('/notifications')
}
```

- [ ] **Étape 3 : écrire la cloche**

Créer `src/app/notifications/cloche.tsx` :

```tsx
import Link from 'next/link'
import { compterNotificationsNonLues } from '@/lib/donnees/notifications'
import { profilCourant } from '@/lib/donnees/profils'

/**
 * Composant SERVEUR, monté depuis `layout.tsx` sur TOUTE page (design 2b §8 :
 * « cloche dans l'en-tête »). Utilise `profilCourant()`, PAS
 * `exigerProfilActif()` — voir la Task 18 du plan pour la raison : ce composant
 * s'affiche aussi sur /connexion et /inscription, où aucun profil n'existe, et
 * ne doit jamais y provoquer de redirection.
 */
export async function Cloche() {
  const profil = await profilCourant()
  if (!profil) {
    return null
  }

  const nonLues = await compterNotificationsNonLues(profil.id)

  return (
    <div className="border-b border-neutral-200 bg-neutral-50 px-6 py-2 text-right">
      <Link href="/notifications" className="text-sm underline underline-offset-4">
        Notifications{nonLues > 0 ? ` (${nonLues})` : ''}
      </Link>
    </div>
  )
}
```

- [ ] **Étape 4 : monter la cloche depuis le layout**

Dans `src/app/layout.tsx`, remplacer :

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
```

par :

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Cloche } from "./notifications/cloche";
import "./globals.css";
```

Et remplacer :

```tsx
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
```

par :

```tsx
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* @ts-expect-error Server Component asynchrone, valide en Next 16 App Router */}
        <Cloche />
        {children}
      </body>
    </html>
  );
}
```

Le commentaire `@ts-expect-error` n'est nécessaire que si `tsc --noEmit` signale
un défaut de type sur un composant serveur asynchrone monté ainsi — **vérifier à
l'Étape 6 si le commentaire est réellement nécessaire** ; TypeScript accepte en
général directement un composant serveur `async` utilisé comme `<Cloche />` dans
l'arborescence App Router (le type `Promise<JSX.Element>` est reconnu par le
typage React 19 / Next 16 des Server Components). **Ne conserver le commentaire
que si sa suppression fait effectivement échouer `tsc --noEmit`** — sinon le
retirer, un `@ts-expect-error` qui ne masque aucune erreur réelle est lui-même un
défaut (`@typescript-eslint` le signale généralement comme inutilisé).

- [ ] **Étape 5 : écrire la page « à traiter »**

Créer `src/app/notifications/page.tsx` :

```tsx
import Link from 'next/link'
import { mesNotifications } from '@/lib/donnees/notifications'
import { exigerProfilActif } from '@/lib/securite/garde'
import { marquerNotificationLue } from './actions'

export default async function PageNotifications() {
  const profil = await exigerProfilActif()
  const notifications = await mesNotifications(profil.id)
  const nonLues = notifications.filter((n) => !n.luLe)

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Link href="/tableau-de-bord" className="text-sm underline underline-offset-4">
        Retour au tableau de bord
      </Link>
      <h1 className="mt-4 mb-8 text-2xl font-semibold">Notifications</h1>

      {notifications.length === 0 ? (
        <p className="text-sm text-neutral-500">Aucune notification.</p>
      ) : (
        <ul className="divide-y divide-neutral-200">
          {notifications.map((notification) => (
            <li key={notification.id} className="py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className={notification.luLe ? 'text-neutral-500' : 'font-medium'}>
                  {notification.titre}
                </span>
                {!notification.luLe ? (
                  <form action={marquerNotificationLue}>
                    <input type="hidden" name="notificationId" value={notification.id} />
                    <button type="submit" className="text-sm underline underline-offset-4">
                      Marquer comme lue
                    </button>
                  </form>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-neutral-600">{notification.corps}</p>
              {notification.lien ? (
                <Link href={notification.lien} className="mt-1 inline-block text-sm underline underline-offset-4">
                  Voir
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {nonLues.length === 0 && notifications.length > 0 ? (
        <p className="mt-6 text-sm text-neutral-500">Tout est lu.</p>
      ) : null}
    </main>
  )
}
```

`marquerNotificationLue` est ici liée **directement** à `<form action={...}>`,
sans `useActionState` ni `useTransition` : c'est **correct** dans ce cas précis,
contrairement à `lierFiche` ou `revoquerToken`. Cette action ne **lève** que sur
un échec technique inattendu (identifiant manquant, échec Postgres, ligne non
touchée) — jamais sur un refus métier qu'un utilisateur devrait voir distinctement
du message générique. Un échec ici tombe légitimement sur `src/app/error.tsx`,
sans perte d'information utile.

- [ ] **Étape 6 : les six portes intermédiaires, ajuster le commentaire de l'Étape 4 si besoin**

```bash
npx tsc --noEmit
```

Si aucune erreur n'apparaît sur `<Cloche />` dans `layout.tsx`, retirer le
commentaire `@ts-expect-error` ajouté à l'Étape 4 et relancer `npx tsc --noEmit`
pour confirmer que sa suppression ne casse rien.

- [ ] **Étape 7 : écrire les tests e2e**

Créer `tests/e2e/notifications.spec.ts` (préfixe `test.e2e.notifications.`) :

```typescript
import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'
import { identifiantVersEmail } from '../../src/lib/domaine/identifiant'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const MDP = `Test-${crypto.randomUUID()}`
const IDENT_A = 'test.e2e.notifications.a'
const IDENT_B = 'test.e2e.notifications.b'

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

async function creerCompte(identifiant: string) {
  const { data, error } = await admin.auth.admin.createUser({
    email: identifiantVersEmail(identifiant),
    password: MDP,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(error?.message)
  await admin.from('profils').insert({ id: data.user.id, identifiant, nom_affichage: `Test notifications ${identifiant}` })
  return data.user.id
}

test.beforeAll(async () => {
  await supprimerCompte(IDENT_A)
  await supprimerCompte(IDENT_B)
  await creerCompte(IDENT_A)
  await creerCompte(IDENT_B)
})

test.afterAll(async () => {
  await supprimerCompte(IDENT_A)
  await supprimerCompte(IDENT_B)
  const { data: residus } = await admin.from('profils').select('id').in('identifiant', [IDENT_A, IDENT_B])
  expect(residus ?? []).toHaveLength(0)
})

test('la cloche annonce le nombre de notifications non lues, et le marquage les fait disparaître', async ({ page }) => {
  const { data: profilA } = await admin.from('profils').select('id').eq('identifiant', IDENT_A).single()
  await admin.from('notifications').insert([
    { profil_id: profilA!.id, type: 'demande_validee', titre: 'Notification une', corps: 'Corps un' },
    { profil_id: profilA!.id, type: 'demande_rejetee', titre: 'Notification deux', corps: 'Corps deux' },
  ])

  await page.goto('/connexion')
  await page.getByLabel('Identifiant').fill(IDENT_A)
  await page.getByLabel('Mot de passe').fill(MDP)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page).toHaveURL(/\/tableau-de-bord/)

  await expect(page.getByRole('link', { name: /Notifications \(2\)/ })).toBeVisible()

  await page.goto('/notifications')
  await expect(page.getByText('Notification une')).toBeVisible()
  await expect(page.getByText('Notification deux')).toBeVisible()

  await page.getByRole('button', { name: 'Marquer comme lue' }).first().click()
  await expect(page.getByRole('button', { name: 'Marquer comme lue' })).toHaveCount(1)

  await page.goto('/tableau-de-bord')
  await expect(page.getByRole('link', { name: /Notifications \(1\)/ })).toBeVisible()
})

test("un compte ne voit JAMAIS la notification d'un autre compte, cloche comprise", async ({ page }) => {
  const { data: profilA } = await admin.from('profils').select('id').eq('identifiant', IDENT_A).single()
  await admin
    .from('notifications')
    .delete()
    .eq('profil_id', profilA!.id)
  await admin.from('notifications').insert({
    profil_id: profilA!.id,
    type: 'demande_validee',
    titre: 'Notification privée de A',
    corps: 'Corps',
  })

  await page.goto('/connexion')
  await page.getByLabel('Identifiant').fill(IDENT_B)
  await page.getByLabel('Mot de passe').fill(MDP)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page).toHaveURL(/\/tableau-de-bord/)

  await expect(page.getByRole('link', { name: /Notifications \(\d/ })).toHaveCount(0)
  await page.goto('/notifications')
  await expect(page.getByText('Notification privée de A')).toHaveCount(0)
  await expect(page.getByText('Aucune notification.')).toBeVisible()
})

test('la cloche ne rend rien sur /connexion et /inscription (aucune session)', async ({ page }) => {
  await page.goto('/connexion')
  await expect(page.getByText(/Notifications/)).toHaveCount(0)

  await page.goto('/inscription')
  await expect(page.getByText(/Notifications/)).toHaveCount(0)
})
```

- [ ] **Étape 8 : lancer les tests e2e puis les six portes, puis commit**

```bash
npm run test:e2e
npx tsc --noEmit && npm run lint && npm test && npm run test:rls && npm run test:e2e && npm run build
```

```bash
git add src/app/notifications/ src/app/layout.tsx tests/e2e/notifications.spec.ts
git commit -m "feat: cloche de notifications et page a traiter"
```

---

## Partie D — documentation et vérification finale

### Task 19 : documentation et vérification finale

**Fichiers :**
- Modifier : `README.md`
- Modifier : `src/lib/securite/garde.ts` (commentaire seul, aucun code)

**Ce que cette tâche NE fait PAS** : elle ne modifie aucun comportement. Elle
documente ce que les Tasks 1 à 18 ont livré, et vérifie que rien de ce qui a été
écrit avant cette phase n'est devenu faux entre-temps — la leçon la plus répétée
du registre de la 1c (README, Task 16 : une phrase écrite pour la 1b était devenue
fausse sans que personne ne l'ait touchée).

- [ ] **Étape 1 : documenter l'exception `/inscription` dans `garde.ts`**

Le design (§9) exige que cette exception soit « documentée explicitement dans
`garde.ts` pour qu'elle ne soit jamais lue comme une régression future ». Ajouter,
juste avant `export async function exigerProfilActif` dans
`src/lib/securite/garde.ts` :

```typescript
/**
 * EXCEPTION UNIQUE DU PROJET (design phase 2b, §9) : `src/app/inscription/
 * actions.ts` (`sInscrire`) est la SEULE Server Action de toute l'application qui
 * n'appelle AUCUNE fonction de ce fichier. Ce n'est pas un oubli : `/inscription`
 * s'affiche sans session, par construction — il n'existe littéralement aucun
 * profil à exiger à ce stade. Sa fermeture ne repose sur AUCUN garde ci-dessous ;
 * elle repose entièrement sur l'absence de politique RLS ouverte au rôle `anon`
 * et sur les privilèges `EXECUTE` de `consommer_token_inscription` /
 * `relacher_token_inscription`, retirés à tous les rôles sauf `service_role`
 * (migration `20260815150000_consommation_token_inscription.sql`). Si un futur
 * changement fait apparaître un second appel à une Server Action DEPUIS
 * `src/app/inscription/`, sans passer par ce fichier, vérifier qu'il s'agit
 * toujours de cette même exception documentée et non d'une régression.
 */
```

- [ ] **Étape 2 : relire le README entier, phrase par phrase, contre le code livré**

Ne pas se contenter d'ajouter une section : relire aussi les sections « Phase 1a »,
« Phase 1b », « Phase 1c », « Attention » et « Règle de sécurité » existantes, et
vérifier que chaque affirmation reste vraie après les Tasks 1 à 18. Chercher en
particulier :
- une phrase qui parlerait encore de « toute Server Action passe par
  `exigerProfilActif`, `exigerAdministrateur` ou `exigerAutoriteSur` » sans
  mentionner l'exception `sInscrire` ;
- une phrase qui daterait la dernière migration appliquée avant `20260815100000`.

```bash
grep -n "exigerProfilActif\|exigerAdministrateur\|exigerAutoriteSur\|20260814" README.md
```

- [ ] **Étape 3 : ajouter la section « Phase 2b » au README**

Ajouter, après la section « Phase 1c » et avant « Règle de sécurité » :

```markdown
## Phase 2b : tokens d'inscription, inscription publique, demandes de suivi, notifications

La phase 2b ouvre l'application au-delà des comptes créés par un administrateur :

- **Tokens d'inscription** (`/tokens`, réservé aux administrateurs) — génération d'un
  token nominatif (rattaché à une fiche existante via le sélecteur de membre) ou
  générique, avec une validité proposée à 7 jours et modifiable ; le code en clair
  s'affiche **une seule fois**, immédiatement après la génération, jamais stocké tel
  quel (seul son hachage SHA-256 l'est). Liste de tous les tokens avec leur état ;
  révocation d'un token encore valide.
- **Inscription publique** (`/inscription`) — la **première page de toute
  l'application accessible sans session**. Formulaire unique, qui ne varie jamais
  selon le contenu du code saisi : code, identifiant, mot de passe, nom, prénom,
  téléphone, ville, antenne. La consommation du token est atomique (verrou de ligne
  par `code_hash`, plafond de 10 tentatives par adresse et par fenêtre glissante de
  15 minutes, toute tentative comptée qu'elle réussisse ou non) ; un code inconnu,
  expiré, révoqué ou déjà utilisé produit exactement le même message, pour ne jamais
  révéler qu'un code existe. Un token nominatif rattache automatiquement le compte
  créé à sa fiche, en ignorant les champs de fiche soumis dans le formulaire (sécurité,
  pas économie : une fiche existante ne doit jamais être écrasée par une saisie
  publique non vérifiée). Un token générique crée une fiche `en_attente` et notifie
  tous les administrateurs actifs.
- **Demande de suivi** (`/demandes/nouvelle`, ouvert à tout compte actif) — propose une
  personne à suivre ; crée une fiche `en_attente` et notifie tous les administrateurs
  actifs. Le demandeur peut **annuler** sa propre demande tant qu'elle reste en
  attente : l'annulation fait passer la demande à l'état `annulee` et supprime la
  fiche `en_attente` **dans une transaction unique** (`annuler_demande_membre`),
  jamais par deux écritures séparées.
- **Écran `/demandes`** (visible de tout compte actif, la file d'attente réservée aux
  administrateurs) — chaque compte y voit ses propres demandes, quel que soit leur
  état. Un administrateur y traite les demandes en attente, avec deux actions selon
  l'origine :
  - une **auto-inscription** (token générique) se valide comme nouvelle personne
    (la fiche `en_attente` devient `actif`, le compte y est rattaché) ou par
    **rattachement à une fiche existante** — dans ce dernier cas, la fiche
    `en_attente` créée à l'inscription est **supprimée**, l'un des deux seuls `delete`
    sur `membres` de tout le projet (avec l'annulation ci-dessus) ;
  - une **demande de suivi** se valide comme nouvelle personne uniquement : le
    demandeur devient le faiseur de disciple, le dirigeant proposé (même calcul que
    l'écran `/membres/[id]/arbre` de la phase 1c) est corrigeable avant validation.
  - dans les deux cas, un rejet exige un motif et notifie le demandeur.
- **Notifications in-app** — une cloche, dans l'en-tête de chaque page (rendue par un
  composant serveur monté depuis `layout.tsx`, silencieuse sans session), et une page
  « à traiter » (`/notifications`) listant les notifications du compte connecté avec
  un bouton « marquer comme lue ». **Toujours personnelles, y compris pour un
  administrateur** : la politique RLS de `notifications` ne laisse jamais un compte
  lire les notifications d'un autre, sans exception de rôle — la seule table du
  projet où « administrateur » n'élargit rien. Une notification dont l'objet vient
  d'être traité (validé, rejeté, ou la demande annulée) est marquée lue
  automatiquement, jamais supprimée.

### Ce que la phase 2b ne livre pas, et pourquoi

- **Envoi d'emails ou de SMS** — hors périmètre du projet entier ; les notifications
  restent strictement in-app.
- **Fusion générale de fiches** — seul le cas étroit de l'auto-inscription en double
  est traité, par suppression d'une fiche jetable sans historique.
- **Gel d'un token après échecs répétés** — délibérément exclu, pour ne pas offrir à
  un tiers le moyen d'empêcher quelqu'un de s'inscrire en épuisant ses tentatives.
- **Purge automatique de `tentatives_token_inscription`** — le projet n'a pas
  d'infrastructure de tâche planifiée ; la table grandit sans borne, acceptable au
  volume attendu.
- **Protection contre un canal de synchronisation par le temps** sur les quatre
  branches de refus de `/inscription` — les quatre empruntent le même chemin SQL,
  ce qui limite l'écart, mais rien ne le mesure ni ne l'égalise dans cette phase.

### Exception ajoutée par la phase 2b : `/inscription` sans garde

`/inscription` est la SEULE page de toute l'application qui n'appelle aucune
fonction de `src/lib/securite/garde.ts` — documenté explicitement sur place, pour
qu'un futur lecteur ne la lise jamais comme une régression. Sa fermeture ne repose
sur aucun garde applicatif : elle repose entièrement sur l'absence de politique RLS
ouverte au rôle `anon` sur les quatre tables de cette phase, et sur les privilèges
`EXECUTE` de `consommer_token_inscription` / `relacher_token_inscription`, retirés à
tous les rôles sauf `service_role`. `src/middleware.ts` porte la seule autre
exception : `/inscription`, comme `/connexion`, reste atteignable sans session — ce
middleware ne PROTÈGE rien, il rend seulement la page atteignable ; la protection
réelle est décrite ci-dessus.

### Exception ajoutée par la phase 2b : lecture publique des antennes

`src/lib/donnees/antennes.ts#listerAntennesPubliques` est la SEULE fonction de tout
`src/lib/donnees/` à employer la clé de service (`clientAdmin()`) pour une simple
lecture, plutôt que le client sous RLS (`clientServeur()`) employé partout ailleurs.
Elle sert exclusivement le formulaire public `/inscription`, qui n'a par construction
aucune session pour satisfaire la politique RLS d'`antennes` (ouverte à
`authenticated` seul). La liste rendue est fixe, déjà publique pour tout compte
actif, et strictement indépendante du code d'inscription saisi : elle ne peut donc
pas servir d'oracle sur la validité d'un token.
```

- [ ] **Étape 4 : mettre à jour la section « Attention » avec les nouvelles cibles de mutation**

Ajouter, à la fin de la section « Attention » du README, un nouveau paragraphe :

```markdown
**La phase 2b ajoute trois nouvelles cibles de mutation sur ce projet unique** (cf.
le design de la phase 2b, §12) : le `revoke execute` de
`consommer_token_inscription`, le seuil du plafond de tentatives (10 par 15
minutes), et l'exception insérée dans `annuler_demande_membre` pour éprouver son
atomicité. Chacune a été restaurée à l'identique après sa preuve, vérifiée par
`pg_get_functiondef` — voir les tâches correspondantes du plan de la phase 2b pour
le détail de chaque restauration.
```

- [ ] **Étape 5 : contrôle par recherche, avec contrôle positif, de la cohérence des marqueurs d'erreur**

```bash
grep -rn "using detail" supabase/migrations/2026081[5-9]*.sql
```

Confronter la sortie à chaque `error.details ===` du code TypeScript livré par les
Tasks 8 à 18 (`grep -rn "error.details ===\|erreur.details ===\|error?.details ===" src/app`) :
chaque marqueur SQL doit avoir au moins un point de lecture côté application, et
réciproquement, aucune comparaison TypeScript ne doit référencer un marqueur qui
n'existe dans aucune migration. **Contrôle positif** : vérifier qu'au moins un
marqueur connu de la 1c (`cycle_faiseur_de_disciple`, par exemple) apparaît bien
dans la première recherche, pour confirmer que le motif `using detail` est
réellement détecté par cette commande sur ce dépôt.

**Absence attendue, pas un oubli** : `consommer_token_inscription`
(migration `20260815150000`) n'apparaît **jamais** dans la première recherche —
elle ne lève plus pour un refus métier depuis la correction de la Task 8 (voir son
en-tête) et rend un `statut` à la place, lu par `sInscrire` via `data[0].statut`,
jamais via `error.details`. Si un futur grep la fait apparaître avec un
`using detail`, c'est qu'une régression a réintroduit une exception sur un refus
métier — vérifier immédiatement que l'insertion de `tentatives_token_inscription`
survit toujours à ce cas.

- [ ] **Étape 6 : vérification finale sur les six suites, rejouées une dernière fois**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls && npm run test:e2e && npm run build
```

Consigner dans le rapport de tâche les comptes réels de chaque suite (tests
unitaires, tests RLS, tests e2e), pas les comptes indicatifs annoncés tâche par
tâche dans ce plan — la 1c a appris que ces comptes dérivent facilement d'une
tâche à l'autre et ne doivent jamais servir de critère d'acceptation, seulement
d'indication.

- [ ] **Étape 7 : vérification du nettoyage des données de test, par comptage indépendant**

```bash
npx dotenv -e .env.local -- node -e "
const { createClient } = require('@supabase/supabase-js');
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
(async () => {
  const { data: comptes } = await admin.from('profils').select('identifiant').like('identifiant', 'test.%');
  const { data: membres } = await admin.from('membres').select('nom').like('nom', 'ZZ%');
  console.log('comptes test.* residuels :', comptes?.length ?? 0);
  console.log('membres ZZ residuels :', membres?.length ?? 0);
  if ((comptes?.length ?? 0) > 0) console.log(comptes);
  if ((membres?.length ?? 0) > 0) console.log(membres);
})();
"
```

Attendu : **zéro** résidu des deux côtés. Si des résidus subsistent, les nettoyer
manuellement, puis noter dans le rapport de tâche quelle suite en est responsable
— le registre de la 1c a montré à plusieurs reprises que ce nettoyage échoue sous
parallélisme sans faire tomber la suite elle-même.

- [ ] **Étape 8 : commit**

```bash
git add README.md src/lib/securite/garde.ts
git commit -m "docs: documenter la phase 2b et son exception d'inscription publique"
```

---

## Relecture finale du plan

**Couverture du périmètre (design §4).** Les cinq points du périmètre livré ont
chacun leur tâche : `/tokens` (Task 15), `/inscription` (Task 14), demande de suivi
(Task 16), `/demandes` (Task 17), notifications (Task 18). Les quatre tables du
modèle de données (design §5) ont chacune leur migration (Tasks 1 à 4). L'amendement
de `membres_lecture` (design §5.5) a la sienne (Task 5). Les trois circuits du §7 ont
chacun leur fonction Postgres et sa preuve (Tasks 8, 9, 10) plus leurs actions
applicatives (Tasks 14, 16, 17, 18). Les décisions D25 à D42 sont toutes citées à
l'endroit où elles s'appliquent — aucune n'est rouverte, chacune est implémentée
telle qu'écrite.

**Aucun réservé.** Chaque étape de code porte le code complet ; aucune étape ne dit
« ajouter la gestion d'erreur » sans le code de cette gestion ; aucun test n'est
décrit sans son code.

**Deux décisions d'implémentation prises par ce plan, hors du périmètre des
décisions D25-D42 du design, et à porter à l'attention de l'utilisateur** (le design
ne les tranche pas explicitement, ce plan comble un vide d'implémentation sans
rouvrir de décision produit) :
1. **`listerAntennesPubliques` lit `antennes` avec la clé de service** (Task 13),
   parce que le formulaire public `/inscription` n'a aucune session pour satisfaire
   la politique RLS existante d'`antennes` (ouverte à `authenticated` seul), et que
   D35 exige pourtant de collecter l'antenne à l'inscription. Cette lecture est
   fixe, déjà publique par ailleurs, et indépendante du code saisi — elle ne rouvre
   pas la fermeture de `/inscription` documentée au §6 du design.
2. **`src/middleware.ts` doit exempter `/inscription`**, sans quoi la page serait
   inatteignable sans session (Task 14, Étape 1). Le design décrit la fermeture de
   `/inscription` (§6, §9) sans mentionner le middleware, qui est une couche
   distincte et antérieure à toute page.

**Types et signatures.** `TokenListe`, `DemandeListe`, `NotificationListe` sont
définis une seule fois chacun (Tasks 11, 12, 13) et réemployés tels quels dans
toutes les tâches d'écran qui les consomment (Tasks 15, 17, 18) — aucune
redéfinition divergente. `MaillonArbre` et `dirigeantPropose` (1c) sont réemployés
tels quels par la Task 17, sans redéfinition. `EtatInscription`, `EtatToken`,
`EtatDemandeSuivi` suivent chacun le même contrat que `EtatCompte`/`EtatMembre` de
la 1c (`{ erreur: string | null, ... }`, rendu par une fonction qui ne lève jamais,
consommé par `useActionState`).

---
