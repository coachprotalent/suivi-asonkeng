# Phase 0 — Socle : plan d'implémentation

> **Pour les agents :** SOUS-COMPÉTENCE REQUISE — utiliser `superpowers:subagent-driven-development`
> (recommandé) ou `superpowers:executing-plans` pour exécuter ce plan tâche par tâche.
> Les étapes utilisent la syntaxe à cases à cocher (`- [ ]`) pour le suivi.

**Objectif :** livrer une application Next.js déployée sur Vercel dans laquelle le compte racine
se connecte avec un identifiant (sans email), est forcé de changer son mot de passe temporaire,
et atteint un tableau de bord protégé.

**Architecture :** Next.js App Router en rendu serveur, Supabase pour la base et
l'authentification. La logique de normalisation des identifiants vit dans `src/lib/domaine/` en
TypeScript pur, testée sans base. La RLS est activée sur toutes les tables avec **refus
d'écriture par défaut** ; toutes les mutations passent par des Server Actions. L'authentification
par identifiant est obtenue en traduisant `jdupont` en `jdupont@asonkeng.local` avant d'appeler
Supabase Auth.

**Spécification de référence :** `docs/superpowers/specs/2026-08-11-suivi-asonkeng-design.md`
(sections 3, 4.1 et 5.4).

## Contraintes globales

Ces contraintes s'appliquent implicitement à **toutes** les tâches.

- **Versions exactes** : `next@16.3.0`, `react@19.2.8`, `typescript@6.0.3`,
  `@supabase/supabase-js@2.112.3`, `@supabase/ssr@0.12.4`, `vitest@4.1.10`,
  `tailwindcss@4.3.3`, `@playwright/test@1.62.1`, `tsx@4.23.12`, `zod@4.4.3`.
  Node 24.15.0, npm 11.12.1, CLI Supabase 2.113.0 via `npx supabase`.
  **TypeScript est volontairement en 6.0.3 et non en 7.x** : `typescript-eslint`, embarqué par
  `eslint-config-next`, déclare le pair `typescript >=4.8.4 <6.1.0` et refuse de démarrer sous
  TS 7 — `npm run lint` échoue alors intégralement. Ne pas « mettre à jour » vers TS 7 tant que
  typescript-eslint ne l'annonce pas comme supporté.
- **Langue** : tout le code, les noms de tables, colonnes, fonctions, routes et messages
  d'interface sont en **français**. Identifiants SQL en `snake_case` minuscule.
- **Un seul projet Supabase** sert au développement et à la production (décision utilisateur).
  Conséquence : les migrations sont **strictement additives et jamais rejouées destructivement**.
  Ne jamais exécuter `supabase db reset` contre ce projet.
- **Aucune politique RLS d'écriture** n'est créée pour les rôles `anon` ou `authenticated`, sur
  aucune table, jamais. Toute écriture passe par une Server Action utilisant la clé de service.
- **Toute fonction appelée dans une politique RLS** est enveloppée dans `(select ...)` pour
  n'être évaluée qu'une fois par requête et non par ligne.
- **Toute colonne de clé étrangère est indexée**, sauf si elle est déjà en tête d'une clé
  primaire composite ou d'un index existant.
- Types : `text` (jamais `varchar(n)`), `timestamptz` (jamais `timestamp`), `boolean` pour les
  booléens, types `enum` Postgres pour les ensembles fermés.
- La clé `SUPABASE_SERVICE_ROLE_KEY` n'est **jamais** préfixée `NEXT_PUBLIC_` et n'est jamais
  importée dans un composant client. Le module qui l'utilise commence par `import 'server-only'`.
- **Commit après chaque tâche**, message en français, préfixe conventionnel
  (`feat:`, `test:`, `chore:`, `fix:`).

## Structure des fichiers

| Fichier | Responsabilité |
|---|---|
| `src/lib/domaine/identifiant.ts` | Normalisation d'un identifiant et traduction en email interne. TypeScript pur, aucune dépendance |
| `src/lib/domaine/identifiant.test.ts` | Tests unitaires de la normalisation |
| `src/lib/supabase/serveur.ts` | Client Supabase pour Server Components et Server Actions (cookies, clé anon, sous RLS) |
| `src/lib/supabase/navigateur.ts` | Client Supabase côté navigateur (clé anon) |
| `src/lib/supabase/admin.ts` | Client privilégié (clé de service), serveur uniquement |
| `src/lib/donnees/profils.ts` | Lectures typées de `profils` |
| `src/middleware.ts` | Rafraîchissement de session et redirections de garde |
| `src/app/connexion/page.tsx` + `actions.ts` | Écran et action de connexion |
| `src/app/changer-mot-de-passe/page.tsx` + `actions.ts` | Changement de mot de passe forcé |
| `src/app/tableau-de-bord/page.tsx` | Coquille protégée post-connexion |
| `supabase/migrations/*.sql` | Schéma, privilèges, RLS |
| `scripts/creer-compte-racine.ts` | Amorçage du compte racine via l'API admin |
| `tests/rls/socle.test.ts` | Vérification des politiques RLS contre le projet |
| `tests/e2e/connexion.spec.ts` | Parcours de connexion de bout en bout |

---

### Task 1 : Initialiser le projet et le harnais de test

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx`
- Create: `vitest.config.ts`
- Create: `src/lib/domaine/sante.test.ts`

**Interfaces:**
- Consumes: rien
- Produces: un projet Next.js exécutable et la commande `npm test` fonctionnelle

- [ ] **Step 1 : Créer le projet Next.js**

Depuis `C:\Users\aubinaso\Desktop\suivi_Asonkeng` (le dossier contient déjà `.git`, `.gitignore`
et `docs/` — `create-next-app` doit donc écrire dans un dossier non vide) :

```bash
npx --yes create-next-app@16.3.0 . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --skip-install
npm install
```

Si l'outil refuse d'écrire dans un dossier non vide, générer dans un dossier temporaire puis
déplacer le contenu :

```bash
npx --yes create-next-app@16.3.0 ../_socle_tmp --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --skip-install
```

puis copier tout le contenu de `../_socle_tmp` (sauf `.git` et `.gitignore`) dans le projet, et
supprimer `../_socle_tmp`.

- [ ] **Step 2 : Installer les dépendances de la phase**

```bash
npm install @supabase/supabase-js@2.112.3 @supabase/ssr@0.12.4 zod@4.4.3 server-only
npm install --save-dev vitest@4.1.10 tsx@4.23.12
```

- [ ] **Step 3 : Configurer Vitest**

Créer `vitest.config.ts` :

```typescript
import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
```

Ajouter dans `package.json`, section `scripts` :

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4 : Écrire un test de santé du harnais**

Ce test vérifie une vraie contrainte globale — la version de Node — et non une tautologie.
Il disparaîtra à la Task 2, une fois le premier vrai test en place.

Créer `src/lib/domaine/sante.test.ts` :

```typescript
import { describe, expect, it } from 'vitest'

describe('environnement de test', () => {
  it('tourne sur Node 24 ou plus récent', () => {
    const majeure = Number(process.versions.node.split('.')[0])
    expect(majeure).toBeGreaterThanOrEqual(24)
  })

  it('résout les fichiers de test sous src/', () => {
    expect(import.meta.url).toContain('/src/lib/domaine/')
  })
})
```

- [ ] **Step 5 : Vérifier que le harnais passe**

Run : `npm test`
Expected : PASS, 1 test réussi.

- [ ] **Step 6 : Vérifier que l'application démarre**

Run : `npm run dev`
Expected : le serveur démarre sur `http://localhost:3000` et la page par défaut de Next.js
s'affiche. Arrêter le serveur ensuite.

- [ ] **Step 7 : Commit**

```bash
git add -A
git commit -m "chore: initialiser le projet Next.js et le harnais Vitest"
```

---

### Task 2 : Normalisation des identifiants (domaine pur)

C'est la brique la plus critique du socle : elle décide de ce qui est un identifiant valide et
garantit qu'une même personne ne peut pas exister sous deux orthographes.

**Files:**
- Create: `src/lib/domaine/identifiant.ts`
- Create: `src/lib/domaine/identifiant.test.ts`
- Delete: `src/lib/domaine/sante.test.ts`

**Interfaces:**
- Consumes: rien
- Produces:
  - `DOMAINE_EMAIL_INTERNE: string` — vaut `'asonkeng.local'`
  - `class IdentifiantInvalideError extends Error`
  - `normaliserIdentifiant(brut: string): string` — lève `IdentifiantInvalideError`
  - `identifiantVersEmail(brut: string): string` — normalise puis suffixe, lève la même erreur

- [ ] **Step 1 : Écrire les tests qui échouent**

Créer `src/lib/domaine/identifiant.test.ts` :

```typescript
import { describe, expect, it } from 'vitest'
import {
  DOMAINE_EMAIL_INTERNE,
  IdentifiantInvalideError,
  identifiantVersEmail,
  normaliserIdentifiant,
} from './identifiant'

describe('normaliserIdentifiant', () => {
  it('met en minuscules', () => {
    expect(normaliserIdentifiant('JDupont')).toBe('jdupont')
  })

  it('retire les espaces de début et de fin', () => {
    expect(normaliserIdentifiant('  jdupont  ')).toBe('jdupont')
  })

  it('retire les espaces internes', () => {
    expect(normaliserIdentifiant('jean dupont')).toBe('jeandupont')
  })

  it('retire les accents', () => {
    expect(normaliserIdentifiant('Jérôme')).toBe('jerome')
    expect(normaliserIdentifiant('Ngu\u00e9m')).toBe('nguem')
  })

  it('accepte le point et le tiret', () => {
    expect(normaliserIdentifiant('jean-marc.dupont')).toBe('jean-marc.dupont')
  })

  it('accepte les chiffres après la première lettre', () => {
    expect(normaliserIdentifiant('jdupont2')).toBe('jdupont2')
  })

  it('refuse une chaîne vide', () => {
    expect(() => normaliserIdentifiant('')).toThrow(IdentifiantInvalideError)
  })

  it('refuse moins de trois caractères', () => {
    expect(() => normaliserIdentifiant('ab')).toThrow(IdentifiantInvalideError)
  })

  it('refuse plus de trente-deux caractères', () => {
    expect(() => normaliserIdentifiant('a'.repeat(33))).toThrow(IdentifiantInvalideError)
  })

  it('refuse un identifiant ne commençant pas par une lettre', () => {
    expect(() => normaliserIdentifiant('1jdupont')).toThrow(IdentifiantInvalideError)
    expect(() => normaliserIdentifiant('.jdupont')).toThrow(IdentifiantInvalideError)
  })

  it('refuse les caractères interdits', () => {
    expect(() => normaliserIdentifiant('j@dupont')).toThrow(IdentifiantInvalideError)
    expect(() => normaliserIdentifiant('jdupont/admin')).toThrow(IdentifiantInvalideError)
    expect(() => normaliserIdentifiant("j'dupont")).toThrow(IdentifiantInvalideError)
  })

  it('est idempotente', () => {
    const une = normaliserIdentifiant('  Jérôme NGUÉM ')
    expect(normaliserIdentifiant(une)).toBe(une)
  })
})

describe('identifiantVersEmail', () => {
  it('suffixe avec le domaine interne', () => {
    expect(identifiantVersEmail('jdupont')).toBe(`jdupont@${DOMAINE_EMAIL_INTERNE}`)
  })

  it('normalise avant de suffixer', () => {
    expect(identifiantVersEmail('  JDupont ')).toBe(`jdupont@${DOMAINE_EMAIL_INTERNE}`)
  })

  it('propage l\'erreur de validation', () => {
    expect(() => identifiantVersEmail('ab')).toThrow(IdentifiantInvalideError)
  })
})
```

- [ ] **Step 2 : Lancer les tests et vérifier qu'ils échouent**

Run : `npm test`
Expected : FAIL — `Failed to resolve import "./identifiant"`.

- [ ] **Step 3 : Écrire l'implémentation minimale**

Créer `src/lib/domaine/identifiant.ts` :

```typescript
/** Domaine email interne : les comptes n'ont pas d'adresse réelle (spec §3.2). */
export const DOMAINE_EMAIL_INTERNE = 'asonkeng.local'

/** Doit rester synchronisé avec la contrainte CHECK `profils_identifiant_format`. */
const FORMAT_IDENTIFIANT = /^[a-z][a-z0-9.-]{2,31}$/

export class IdentifiantInvalideError extends Error {
  constructor(raison: string) {
    super(`Identifiant invalide : ${raison}`)
    this.name = 'IdentifiantInvalideError'
  }
}

/**
 * Ramène un identifiant saisi à sa forme canonique : minuscules, sans accents,
 * sans espaces. Lève si le résultat n'est pas un identifiant acceptable.
 */
export function normaliserIdentifiant(brut: string): string {
  const canonique = brut
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, '')
    .toLowerCase()

  if (canonique.length === 0) {
    throw new IdentifiantInvalideError('il est vide')
  }
  if (canonique.length < 3) {
    throw new IdentifiantInvalideError('il doit faire au moins 3 caractères')
  }
  if (canonique.length > 32) {
    throw new IdentifiantInvalideError('il ne doit pas dépasser 32 caractères')
  }
  if (!FORMAT_IDENTIFIANT.test(canonique)) {
    throw new IdentifiantInvalideError(
      'il doit commencer par une lettre et ne contenir que des lettres, chiffres, points ou tirets',
    )
  }

  return canonique
}

/** Traduit un identifiant en adresse interne pour Supabase Auth. */
export function identifiantVersEmail(brut: string): string {
  return `${normaliserIdentifiant(brut)}@${DOMAINE_EMAIL_INTERNE}`
}
```

- [ ] **Step 4 : Lancer les tests et vérifier qu'ils passent**

Run : `npm test`
Expected : PASS, 15 tests réussis.

- [ ] **Step 5 : Supprimer le test de santé devenu inutile**

```bash
git rm src/lib/domaine/sante.test.ts
```

Run : `npm test` → Expected : PASS, 15 tests.

- [ ] **Step 6 : Commit**

```bash
git add -A
git commit -m "feat: normaliser les identifiants et les traduire en email interne"
```

---

### Task 3 : Projet Supabase et migration du socle

**Files:**
- Create: `supabase/config.toml` (généré)
- Create: `supabase/migrations/20260811120000_socle_profils.sql`
- Create: `.env.local`, `.env.local.example`

**Interfaces:**
- Consumes: `FORMAT_IDENTIFIANT` de la Task 2 — la contrainte CHECK reproduit la même expression
- Produces: tables `public.profils` et `public.roles_profil`, type `public.role_app`, schéma `prive`

- [ ] **Step 1 : Créer le projet Supabase**

**Action manuelle de l'utilisateur** — sur https://supabase.com/dashboard, créer un projet nommé
`asonkeng`, région Europe (Paris ou Francfort), et noter le mot de passe de la base.

Puis récupérer, dans *Project Settings → API* : l'URL du projet, la clé `anon`, la clé
`service_role`. Et dans *Project Settings → General* : la référence du projet.

- [ ] **Step 2 : Initialiser et lier le projet local**

```bash
npx supabase init
npx supabase link --project-ref <REFERENCE_DU_PROJET>
```

La connexion demande un jeton d'accès. Si elle est interactive, l'utilisateur doit la lancer
lui-même en tapant `! npx supabase login` dans la session.

- [ ] **Step 3 : Créer le fichier d'environnement**

Créer `.env.local.example` (versionné) :

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
RACINE_IDENTIFIANT=racine
RACINE_NOM_AFFICHAGE=Administrateur racine
RACINE_MOT_DE_PASSE=
```

Créer `.env.local` avec les vraies valeurs. Vérifier qu'il est bien ignoré par git :

Run : `git check-ignore -v .env.local`
Expected : une ligne indiquant que `.gitignore` l'ignore. **Si la commande ne renvoie rien,
arrêter et corriger `.gitignore` avant de continuer.**

- [ ] **Step 4 : Écrire la migration du socle**

Créer `supabase/migrations/20260811120000_socle_profils.sql` :

```sql
-- Socle d'authentification : profils et rôles.
-- Spec §4.1. Aucune écriture n'est autorisée au rôle client : voir la migration RLS.

-- Schéma privé pour les fonctions internes, jamais exposé via l'API.
create schema if not exists prive;
revoke all on schema prive from public, anon, authenticated;

create type public.role_app as enum ('administrateur', 'moderateur');

create table public.profils (
  id uuid primary key references auth.users (id) on delete cascade,
  identifiant text not null unique,
  nom_affichage text not null,
  -- Clé étrangère vers public.membres ajoutée en phase 1 : la table n'existe pas encore.
  membre_id uuid unique,
  est_racine boolean not null default false,
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  constraint profils_identifiant_format
    check (identifiant ~ '^[a-z][a-z0-9.-]{2,31}$'),
  constraint profils_nom_affichage_non_vide
    check (length(trim(nom_affichage)) > 0),
  -- Le compte racine n'a jamais de fiche membre (spec §3.2).
  constraint profils_racine_sans_membre
    check (not est_racine or membre_id is null)
);

comment on table public.profils is
  'Un enregistrement par compte de connexion, en relation 1-1 avec auth.users.';
comment on column public.profils.membre_id is
  'Lien optionnel vers la fiche de suivi ; posable et retirable par l''administrateur.';

-- membre_id est déjà couvert par sa contrainte UNIQUE : pas d'index supplémentaire.
create index profils_actif_idx on public.profils (actif) where actif;

create table public.roles_profil (
  profil_id uuid not null references public.profils (id) on delete cascade,
  role public.role_app not null,
  attribue_le timestamptz not null default now(),
  primary key (profil_id, role)
);

comment on table public.roles_profil is
  'Rôles cumulables. Les droits « Utilisateur » sont le socle implicite de tout compte actif et ne sont pas stockés ici.';

-- profil_id est en tête de la clé primaire composite : la clé étrangère est déjà indexée.
```

- [ ] **Step 5 : Appliquer la migration**

Run : `npx supabase db push`
Expected : la migration est appliquée sans erreur.

- [ ] **Step 6 : Vérifier le schéma en base**

Run :

```bash
npx supabase db push --dry-run
```

Expected : « Remote database is up to date. » — aucune migration en attente.

- [ ] **Step 7 : Commit**

```bash
git add -A
git commit -m "feat: créer les tables profils et roles_profil"
```

---

### Task 4 : Privilèges et politiques RLS du socle

**Files:**
- Create: `supabase/migrations/20260811130000_socle_rls.sql`

**Interfaces:**
- Consumes: tables de la Task 3
- Produces: `prive.est_admin(): boolean` — vrai si le compte appelant est un administrateur actif

- [ ] **Step 1 : Écrire la migration RLS**

Créer `supabase/migrations/20260811130000_socle_rls.sql` :

```sql
-- RLS du socle. Principe (spec §5.3) : lecture ciblée, aucune écriture au rôle client.

-- Retirer les privilèges par défaut avant d'accorder le strict nécessaire.
revoke all on public.profils from anon, authenticated;
revoke all on public.roles_profil from anon, authenticated;

grant select on public.profils to authenticated;
grant select on public.roles_profil to authenticated;

alter table public.profils enable row level security;
alter table public.profils force row level security;
alter table public.roles_profil enable row level security;
alter table public.roles_profil force row level security;

-- Fonction d'aide : évite qu'une politique sur profils interroge profils (récursion).
-- SECURITY DEFINER, search_path vide, et vérification de l'appelant à l'intérieur.
create or replace function prive.est_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.roles_profil rp
    join public.profils p on p.id = rp.profil_id
    where rp.profil_id = (select auth.uid())
      and rp.role = 'administrateur'
      and p.actif
  );
$$;

-- Seul `authenticated` peut l'appeler : les expressions de politique sont évaluées
-- avec les privilèges du rôle appelant, il lui faut donc EXECUTE.
revoke execute on function prive.est_admin() from public, anon, service_role;
grant execute on function prive.est_admin() to authenticated;
grant usage on schema prive to authenticated;

-- Lecture : son propre profil, ou tous les profils si administrateur.
create policy profils_lecture on public.profils
  for select
  to authenticated
  using (id = (select auth.uid()) or (select prive.est_admin()));

create policy roles_profil_lecture on public.roles_profil
  for select
  to authenticated
  using (profil_id = (select auth.uid()) or (select prive.est_admin()));

-- Aucune politique INSERT, UPDATE ou DELETE n'est créée : RLS refuse par défaut.
-- Toutes les écritures passent par des Server Actions avec la clé de service.
```

- [ ] **Step 2 : Appliquer la migration**

Run : `npx supabase db push`
Expected : appliquée sans erreur.

- [ ] **Step 3 : Vérifier qu'aucune politique d'écriture n'existe**

Run :

```bash
npx supabase db push --dry-run
```

Expected : « Remote database is up to date. »

Puis, dans l'éditeur SQL du tableau de bord Supabase, exécuter :

```sql
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

Expected : exactement deux lignes, toutes deux avec `cmd = 'SELECT'`. **Aucune ligne avec
`INSERT`, `UPDATE`, `DELETE` ou `ALL`.**

**Diagnostic à connaître pour la suite.** Toute l'architecture repose sur le fait que le rôle
`service_role` possède l'attribut `bypassrls` et n'est donc pas soumis aux politiques, malgré
`force row level security`. Si la Task 6 échoue avec une erreur de politique lors de l'insertion
dans `profils`, c'est que cette hypothèse est fausse sur ce projet : la correction est de
retirer les deux lignes `force row level security` (en conservant `enable row level security`),
puis de relancer `npx supabase db push`. Ne jamais « corriger » en ajoutant une politique
d'écriture.

- [ ] **Step 4 : Commit**

```bash
git add -A
git commit -m "feat: activer la RLS du socle en refus d'écriture par défaut"
```

---

### Task 5 : Clients Supabase

**Files:**
- Create: `src/lib/supabase/serveur.ts`
- Create: `src/lib/supabase/navigateur.ts`
- Create: `src/lib/supabase/admin.ts`
- Create: `src/lib/supabase/env.ts`

**Interfaces:**
- Consumes: variables d'environnement de la Task 3
- Produces:
  - `clientServeur(): Promise<SupabaseClient>` — sous RLS, session par cookies
  - `clientNavigateur(): SupabaseClient` — sous RLS, côté client
  - `clientAdmin(): SupabaseClient` — clé de service, contourne la RLS, serveur uniquement
  - `envSupabase: { url: string; cleAnon: string }` — **configuration publique uniquement**

- [ ] **Step 1 : Écrire le lecteur d'environnement**

Créer `src/lib/supabase/env.ts` :

```typescript
function requis(nom: string, valeur: string | undefined): string {
  if (!valeur) {
    throw new Error(`Variable d'environnement manquante : ${nom}`)
  }
  return valeur
}

export const envSupabase = {
  url: requis('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL),
  cleAnon: requis('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
}
```

**Ce module ne lit délibérément que la configuration publique.** Il est importé par le client
navigateur, il ne peut donc pas porter `import 'server-only'`. Y placer la lecture de la clé de
service reviendrait à laisser un composant client l'importer sans que rien ne l'en empêche à la
compilation — la seule protection serait alors le fait que Next.js n'injecte pas les variables
non préfixées `NEXT_PUBLIC_`, c'est-à-dire un comportement d'outil et non une garantie du code.
La clé de service est donc lue dans `admin.ts`, qui porte `server-only`.

- [ ] **Step 2 : Écrire le client serveur**

Créer `src/lib/supabase/serveur.ts` :

```typescript
import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { envSupabase } from './env'

/** Client sous RLS, pour Server Components et Server Actions. */
export async function clientServeur() {
  const magasin = await cookies()

  return createServerClient(envSupabase.url, envSupabase.cleAnon, {
    cookies: {
      getAll() {
        return magasin.getAll()
      },
      setAll(aPoser) {
        try {
          for (const { name, value, options } of aPoser) {
            magasin.set(name, value, options)
          }
        } catch {
          // Appel depuis un Server Component : l'écriture de cookies y est interdite.
          // Le middleware se charge du rafraîchissement de session.
        }
      },
    },
  })
}
```

- [ ] **Step 3 : Écrire le client navigateur**

Créer `src/lib/supabase/navigateur.ts` :

```typescript
import { createBrowserClient } from '@supabase/ssr'
import { envSupabase } from './env'

export function clientNavigateur() {
  return createBrowserClient(envSupabase.url, envSupabase.cleAnon)
}
```

- [ ] **Step 4 : Écrire le client admin**

Créer `src/lib/supabase/admin.ts` :

```typescript
import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { envSupabase } from './env'

/** La clé de service est lue ici, derrière `server-only`, et nulle part ailleurs. */
function cleService(): string {
  const valeur = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!valeur) {
    throw new Error("Variable d'environnement manquante : SUPABASE_SERVICE_ROLE_KEY")
  }
  return valeur
}

/**
 * Client privilégié : contourne la RLS. Réservé aux Server Actions et scripts,
 * après vérification explicite des droits de l'appelant.
 */
export function clientAdmin() {
  return createClient(envSupabase.url, cleService(), {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
```

- [ ] **Step 5 : Vérifier la compilation**

Run : `npx tsc --noEmit`
Expected : aucune erreur.

- [ ] **Step 6 : Commit**

```bash
git add -A
git commit -m "feat: ajouter les clients Supabase serveur, navigateur et admin"
```

---

### Task 6 : Amorçage du compte racine

Le compte racine est créé par un **script** utilisant l'API admin, et non par une migration SQL :
insérer directement dans `auth.users` suppose de reproduire à la main le hachage du mot de passe
et les colonnes internes de Supabase, ce qui casse à la moindre évolution de leur schéma.

**Files:**
- Create: `scripts/creer-compte-racine.ts`
- Modify: `package.json` (script `amorcer:racine`)

**Interfaces:**
- Consumes: `identifiantVersEmail` (Task 2) **uniquement**. Surtout **pas** `clientAdmin` de
  la Task 5 : `admin.ts` porte `import 'server-only'`, qui lève au chargement dans un script
  Node ordinaire — vérifié, le script planterait. La duplication de `createClient` ici est
  délibérée et nécessaire, ce n'est pas une entorse à DRY.
- Produces: un compte administrateur `est_racine = true`, `membre_id = null`, avec
  `app_metadata.doit_changer_mdp = true`

- [ ] **Step 1 : Écrire le script**

Créer `scripts/creer-compte-racine.ts` :

```typescript
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
```

- [ ] **Step 2 : Ajouter le script npm**

Dans `package.json`, section `scripts` :

```json
"amorcer:racine": "tsx --env-file=.env.local scripts/creer-compte-racine.ts"
```

- [ ] **Step 3 : Exécuter l'amorçage**

Renseigner `RACINE_MOT_DE_PASSE` dans `.env.local` avec un mot de passe d'au moins 12 caractères.

**Piège vérifié en pratique — entourer la valeur de guillemets doubles.** L'analyseur
`--env-file` de Node traite un `#` comme un début de commentaire : un mot de passe contenant ce
caractère est silencieusement tronqué à ce qui le précède. Sans guillemets, un mot de passe de
20 caractères devient 3, sans le moindre avertissement. Le garde-fou `motDePasse.length < 12`
du script attrape le cas, mais la même règle vaut pour toute valeur contenant `#`, une espace
ou un `$`.

Run : `npm run amorcer:racine`
Expected : `Compte racine « racine » créé. Le mot de passe devra être changé à la première connexion.`

- [ ] **Step 4 : Vérifier l'idempotence**

Run : `npm run amorcer:racine`
Expected : `Le compte racine « racine » existe déjà (…). Rien à faire.` — **aucun doublon créé.**

- [ ] **Step 5 : Commit**

```bash
git add -A
git commit -m "feat: amorcer le compte administrateur racine"
```

---

### Task 7 : Lecture du profil courant

**Files:**
- Create: `src/lib/donnees/profils.ts`

**Interfaces:**
- Consumes: `clientServeur` (Task 5)
- Produces:
  - `type Profil = { id: string; identifiant: string; nomAffichage: string; membreId: string | null; estRacine: boolean; actif: boolean }`
  - `profilCourant(): Promise<Profil | null>`

- [ ] **Step 1 : Écrire le module**

Créer `src/lib/donnees/profils.ts` :

```typescript
import 'server-only'
import { clientServeur } from '@/lib/supabase/serveur'

export type Profil = {
  id: string
  identifiant: string
  nomAffichage: string
  membreId: string | null
  estRacine: boolean
  actif: boolean
}

/** Profil du compte connecté, ou null si personne n'est connecté. */
export async function profilCourant(): Promise<Profil | null> {
  const supabase = await clientServeur()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('profils')
    .select('id, identifiant, nom_affichage, membre_id, est_racine, actif')
    .eq('id', user.id)
    .maybeSingle()

  if (!data) return null

  return {
    id: data.id,
    identifiant: data.identifiant,
    nomAffichage: data.nom_affichage,
    membreId: data.membre_id,
    estRacine: data.est_racine,
    actif: data.actif,
  }
}
```

Le drapeau « doit changer son mot de passe » n'a délibérément pas de lecteur ici : il est lu
directement depuis le JWT par le middleware (Task 9), sans requête base.

- [ ] **Step 2 : Vérifier la compilation**

Run : `npx tsc --noEmit`
Expected : aucune erreur.

- [ ] **Step 3 : Commit**

```bash
git add -A
git commit -m "feat: lire le profil du compte connecté"
```

---

### Task 8 : Écran et action de connexion

**Files:**
- Create: `src/app/connexion/page.tsx`
- Create: `src/app/connexion/actions.ts`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `identifiantVersEmail` (Task 2), `clientServeur` (Task 5)
- Produces:
  - `type EtatConnexion = { erreur: string | null }`
  - `seConnecter(etat: EtatConnexion, donnees: FormData): Promise<EtatConnexion>`
  - `seDeconnecter(): Promise<never>` — utilisée par le tableau de bord (Task 10)
  - `MESSAGE_ECHEC_CONNEXION: string`

- [ ] **Step 1 : Écrire l'action de connexion**

Créer `src/app/connexion/actions.ts` :

```typescript
'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { identifiantVersEmail } from '@/lib/domaine/identifiant'
import { clientServeur } from '@/lib/supabase/serveur'

/**
 * Message unique et indifférencié : ne jamais révéler si un identifiant existe
 * ni si un compte est désactivé (spec §7).
 */
export const MESSAGE_ECHEC_CONNEXION = 'Identifiant ou mot de passe incorrect.'

export type EtatConnexion = { erreur: string | null }

const schema = z.object({
  identifiant: z.string().min(1),
  motDePasse: z.string().min(1),
})

export async function seConnecter(
  _etat: EtatConnexion,
  donnees: FormData,
): Promise<EtatConnexion> {
  const saisie = schema.safeParse({
    identifiant: donnees.get('identifiant'),
    motDePasse: donnees.get('motDePasse'),
  })
  if (!saisie.success) {
    return { erreur: MESSAGE_ECHEC_CONNEXION }
  }

  let email: string
  try {
    email = identifiantVersEmail(saisie.data.identifiant)
  } catch {
    return { erreur: MESSAGE_ECHEC_CONNEXION }
  }

  const supabase = await clientServeur()
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: saisie.data.motDePasse,
  })
  if (error || !data.user) {
    return { erreur: MESSAGE_ECHEC_CONNEXION }
  }

  // Un compte désactivé ne doit pas conserver de session.
  const { data: profil } = await supabase
    .from('profils')
    .select('actif')
    .eq('id', data.user.id)
    .maybeSingle()

  if (!profil?.actif) {
    await supabase.auth.signOut()
    return { erreur: MESSAGE_ECHEC_CONNEXION }
  }

  redirect('/tableau-de-bord')
}

export async function seDeconnecter() {
  const supabase = await clientServeur()
  await supabase.auth.signOut()
  redirect('/connexion')
}
```

- [ ] **Step 2 : Écrire l'écran de connexion**

Créer `src/app/connexion/page.tsx` :

```tsx
'use client'

import { useActionState } from 'react'
import { MESSAGE_ECHEC_CONNEXION, seConnecter, type EtatConnexion } from './actions'

const etatInitial: EtatConnexion = { erreur: null }

export default function PageConnexion() {
  const [etat, action, enCours] = useActionState(seConnecter, etatInitial)

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="mb-1 text-2xl font-semibold">Suivi Asonkeng</h1>
      <p className="mb-8 text-sm text-neutral-500">Connectez-vous pour continuer.</p>

      <form action={action} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Identifiant</span>
          <input
            name="identifiant"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Mot de passe</span>
          <input
            name="motDePasse"
            type="password"
            autoComplete="current-password"
            required
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
        </label>

        {etat.erreur ? (
          <p role="alert" className="text-sm text-red-600">
            {etat.erreur ?? MESSAGE_ECHEC_CONNEXION}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={enCours}
          className="rounded-md bg-neutral-900 px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          {enCours ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
    </main>
  )
}
```

- [ ] **Step 3 : Rediriger la racine du site**

Remplacer le contenu de `src/app/page.tsx` par :

```tsx
import { redirect } from 'next/navigation'

export default function Accueil() {
  redirect('/tableau-de-bord')
}
```

- [ ] **Step 4 : Vérifier manuellement**

Run : `npm run dev`, puis ouvrir `http://localhost:3000/connexion`.
Expected :
- saisir `racine` / un mot de passe faux → le message « Identifiant ou mot de passe incorrect. »
  s'affiche, l'utilisateur reste sur la page ;
- saisir un identifiant inexistant → **exactement le même message** ;
- saisir `racine` / le bon mot de passe → redirection vers `/tableau-de-bord` (qui renvoie
  encore une 404 : c'est attendu, la page arrive à la Task 10).

- [ ] **Step 5 : Commit**

```bash
git add -A
git commit -m "feat: ajouter la connexion par identifiant"
```

---

### Task 9 : Middleware de session et gardes de navigation

**Files:**
- Create: `src/middleware.ts`

**Interfaces:**
- Consumes: `envSupabase` (Task 5)
- Produces: rafraîchissement de session sur chaque requête, et les trois redirections de garde

- [ ] **Step 1 : Écrire le middleware**

Créer `src/middleware.ts` :

```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { envSupabase } from '@/lib/supabase/env'

const ROUTE_CONNEXION = '/connexion'
const ROUTE_CHANGEMENT_MDP = '/changer-mot-de-passe'
const ROUTE_APRES_CONNEXION = '/tableau-de-bord'

export async function middleware(requete: NextRequest) {
  let reponse = NextResponse.next({ request: requete })

  const supabase = createServerClient(envSupabase.url, envSupabase.cleAnon, {
    cookies: {
      getAll() {
        return requete.cookies.getAll()
      },
      setAll(aPoser) {
        for (const { name, value } of aPoser) {
          requete.cookies.set(name, value)
        }
        reponse = NextResponse.next({ request: requete })
        for (const { name, value, options } of aPoser) {
          reponse.cookies.set(name, value, options)
        }
      },
    },
  })

  // getUser() valide le jeton auprès de Supabase et rafraîchit la session si besoin.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const chemin = requete.nextUrl.pathname
  const surConnexion = chemin.startsWith(ROUTE_CONNEXION)
  const surChangementMdp = chemin.startsWith(ROUTE_CHANGEMENT_MDP)

  const rediriger = (vers: string) => {
    const url = requete.nextUrl.clone()
    url.pathname = vers
    url.search = ''
    return NextResponse.redirect(url)
  }

  if (!user) {
    return surConnexion ? reponse : rediriger(ROUTE_CONNEXION)
  }

  // Drapeau lu dans le JWT : aucune requête base (spec §4.1).
  if (user.app_metadata?.doit_changer_mdp === true && !surChangementMdp) {
    return rediriger(ROUTE_CHANGEMENT_MDP)
  }

  if (surConnexion) {
    return rediriger(ROUTE_APRES_CONNEXION)
  }

  return reponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
```

- [ ] **Step 2 : Vérifier manuellement les gardes**

Run : `npm run dev`
Expected :
- non connecté, ouvrir `http://localhost:3000/tableau-de-bord` → redirection vers `/connexion` ;
- se connecter avec le compte racine → redirection vers `/changer-mot-de-passe` (404 pour
  l'instant : la page arrive à la Task 10) ;
- tenter d'ouvrir `/tableau-de-bord` → renvoyé vers `/changer-mot-de-passe`.

- [ ] **Step 3 : Commit**

```bash
git add -A
git commit -m "feat: protéger les routes et rafraîchir la session via le middleware"
```

---

### Task 10 : Changement de mot de passe forcé et tableau de bord

**Files:**
- Create: `src/app/changer-mot-de-passe/page.tsx`
- Create: `src/app/changer-mot-de-passe/actions.ts`
- Create: `src/app/tableau-de-bord/page.tsx`

**Interfaces:**
- Consumes: `clientServeur`, `clientAdmin` (Task 5), `profilCourant` (Task 7), `seDeconnecter` (Task 8)
- Produces:
  - `type EtatChangement = { erreur: string | null }`
  - `changerMotDePasse(etat: EtatChangement, donnees: FormData): Promise<EtatChangement>`
  - `LONGUEUR_MDP_MINIMALE: number` — vaut `12`

- [ ] **Step 1 : Écrire l'action de changement**

Créer `src/app/changer-mot-de-passe/actions.ts` :

```typescript
'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { clientAdmin } from '@/lib/supabase/admin'
import { clientServeur } from '@/lib/supabase/serveur'

export const LONGUEUR_MDP_MINIMALE = 12

export type EtatChangement = { erreur: string | null }

const schema = z
  .object({
    motDePasse: z
      .string()
      .min(LONGUEUR_MDP_MINIMALE, `Le mot de passe doit faire au moins ${LONGUEUR_MDP_MINIMALE} caractères.`),
    confirmation: z.string(),
  })
  .refine((v) => v.motDePasse === v.confirmation, {
    message: 'Les deux mots de passe ne correspondent pas.',
  })

export async function changerMotDePasse(
  _etat: EtatChangement,
  donnees: FormData,
): Promise<EtatChangement> {
  const saisie = schema.safeParse({
    motDePasse: donnees.get('motDePasse'),
    confirmation: donnees.get('confirmation'),
  })
  if (!saisie.success) {
    return { erreur: saisie.error.issues[0]?.message ?? 'Saisie invalide.' }
  }

  const supabase = await clientServeur()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect('/connexion')
  }

  const { error } = await supabase.auth.updateUser({ password: saisie.data.motDePasse })
  if (error) {
    return { erreur: "Le mot de passe n'a pas pu être modifié. Réessayez." }
  }

  // Effacer le drapeau : seule la clé de service peut écrire dans app_metadata.
  const admin = clientAdmin()
  const { error: erreurDrapeau } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: { doit_changer_mdp: false },
  })
  if (erreurDrapeau) {
    return { erreur: 'Mot de passe modifié, mais la session n\'a pas pu être mise à jour. Reconnectez-vous.' }
  }

  // Rafraîchir la session pour que le nouveau JWT porte le drapeau à false.
  await supabase.auth.refreshSession()

  redirect('/tableau-de-bord')
}
```

- [ ] **Step 2 : Écrire l'écran de changement**

Créer `src/app/changer-mot-de-passe/page.tsx` :

```tsx
'use client'

import { useActionState } from 'react'
import {
  changerMotDePasse,
  LONGUEUR_MDP_MINIMALE,
  type EtatChangement,
} from './actions'

const etatInitial: EtatChangement = { erreur: null }

export default function PageChangementMotDePasse() {
  const [etat, action, enCours] = useActionState(changerMotDePasse, etatInitial)

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="mb-1 text-2xl font-semibold">Choisissez un mot de passe</h1>
      <p className="mb-8 text-sm text-neutral-500">
        Votre mot de passe actuel est temporaire. Choisissez-en un nouveau d&apos;au moins{' '}
        {LONGUEUR_MDP_MINIMALE} caractères pour continuer.
      </p>

      <form action={action} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Nouveau mot de passe</span>
          <input
            name="motDePasse"
            type="password"
            autoComplete="new-password"
            required
            minLength={LONGUEUR_MDP_MINIMALE}
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Confirmation</span>
          <input
            name="confirmation"
            type="password"
            autoComplete="new-password"
            required
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
        </label>

        {etat.erreur ? (
          <p role="alert" className="text-sm text-red-600">
            {etat.erreur}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={enCours}
          className="rounded-md bg-neutral-900 px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          {enCours ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </form>
    </main>
  )
}
```

- [ ] **Step 3 : Écrire le tableau de bord**

Créer `src/app/tableau-de-bord/page.tsx` :

```tsx
import { redirect } from 'next/navigation'
import { seDeconnecter } from '@/app/connexion/actions'
import { profilCourant } from '@/lib/donnees/profils'

export default async function PageTableauDeBord() {
  const profil = await profilCourant()
  if (!profil) {
    redirect('/connexion')
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-10 flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Suivi Asonkeng</h1>
          <p className="text-sm text-neutral-500">
            Connecté en tant que {profil.nomAffichage} ({profil.identifiant})
          </p>
        </div>
        <form action={seDeconnecter}>
          <button type="submit" className="text-sm underline underline-offset-4">
            Se déconnecter
          </button>
        </form>
      </header>

      <p className="text-neutral-600">
        Le socle est en place. Les membres, les statuts et l&apos;arborescence arrivent en phase 1.
      </p>
    </main>
  )
}
```

- [ ] **Step 4 : Vérifier le parcours complet manuellement**

Run : `npm run dev`
Expected, dans l'ordre :
1. `/tableau-de-bord` non connecté → `/connexion` ;
2. connexion avec `racine` et le mot de passe d'amorçage → `/changer-mot-de-passe` ;
3. saisir deux mots de passe différents → « Les deux mots de passe ne correspondent pas. » ;
4. saisir un mot de passe de 8 caractères → « Le mot de passe doit faire au moins 12 caractères. » ;
5. saisir deux fois un mot de passe valide → `/tableau-de-bord`, avec le nom affiché ;
6. recharger `/tableau-de-bord` → **plus de redirection vers le changement de mot de passe** ;
7. « Se déconnecter » → `/connexion` ;
8. se reconnecter avec le **nouveau** mot de passe → `/tableau-de-bord` directement.

- [ ] **Step 5 : Commit**

```bash
git add -A
git commit -m "feat: forcer le changement du mot de passe temporaire et ajouter le tableau de bord"
```

---

### Task 11 : Tests des politiques RLS

C'est la tâche la plus importante de la phase pour la sécurité : elle vérifie qu'aucun compte
ordinaire ne peut écrire, ni lire le profil d'autrui.

**Files:**
- Create: `tests/rls/socle.test.ts`
- Create: `vitest.rls.config.ts`
- Modify: `package.json` (script `test:rls`)

**Interfaces:**
- Consumes: politiques de la Task 4, `identifiantVersEmail` (Task 2)
- Produces: rien de réutilisable

- [ ] **Step 1 : Écrire la configuration Vitest dédiée**

Ces tests parlent au réseau : ils sont séparés pour que `npm test` reste instantané.

Créer `vitest.rls.config.ts` :

```typescript
import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['tests/rls/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Les comptes de test sont partagés : pas d'exécution concurrente.
    fileParallelism: false,
  },
})
```

Vite ne recopie pas les fichiers `.env` dans `process.env` pour du code Node : il faut les
charger explicitement.

```bash
npm install --save-dev dotenv-cli
```

Ajouter dans `package.json` :

```json
"test:rls": "dotenv -e .env.local -- vitest run --config vitest.rls.config.ts"
```

- [ ] **Step 2 : Écrire les tests qui échouent**

Créer `tests/rls/socle.test.ts` :

```typescript
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { identifiantVersEmail } from '@/lib/domaine/identifiant'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const CLE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const CLE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

const MDP = 'MotDePasseDeTest!2026'
const IDENT_SIMPLE = 'test.rls.simple'
const IDENT_ADMIN = 'test.rls.admin'

const admin = createClient(URL, CLE_SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function creerCompte(identifiant: string, estAdmin: boolean): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email: identifiantVersEmail(identifiant),
    password: MDP,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`création impossible : ${error?.message}`)

  await admin
    .from('profils')
    .insert({ id: data.user.id, identifiant, nom_affichage: `Test ${identifiant}` })
  if (estAdmin) {
    await admin.from('roles_profil').insert({ profil_id: data.user.id, role: 'administrateur' })
  }
  return data.user.id
}

async function connecter(identifiant: string): Promise<SupabaseClient> {
  const client = createClient(URL, CLE_ANON, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error } = await client.auth.signInWithPassword({
    email: identifiantVersEmail(identifiant),
    password: MDP,
  })
  if (error) throw new Error(`connexion impossible : ${error.message}`)
  return client
}

async function supprimerCompte(identifiant: string) {
  const { data } = await admin.from('profils').select('id').eq('identifiant', identifiant).maybeSingle()
  if (data) await admin.auth.admin.deleteUser(data.id)
}

let idSimple: string
let idAdmin: string
let clientSimple: SupabaseClient
let clientAdministrateur: SupabaseClient
const clientAnonyme = createClient(URL, CLE_ANON, {
  auth: { autoRefreshToken: false, persistSession: false },
})

beforeAll(async () => {
  await supprimerCompte(IDENT_SIMPLE)
  await supprimerCompte(IDENT_ADMIN)
  idSimple = await creerCompte(IDENT_SIMPLE, false)
  idAdmin = await creerCompte(IDENT_ADMIN, true)
  clientSimple = await connecter(IDENT_SIMPLE)
  clientAdministrateur = await connecter(IDENT_ADMIN)
})

afterAll(async () => {
  await supprimerCompte(IDENT_SIMPLE)
  await supprimerCompte(IDENT_ADMIN)
})

describe('lecture de profils', () => {
  it('un utilisateur lit son propre profil', async () => {
    const { data } = await clientSimple.from('profils').select('identifiant').eq('id', idSimple)
    expect(data).toEqual([{ identifiant: IDENT_SIMPLE }])
  })

  it("un utilisateur ne lit pas le profil d'autrui", async () => {
    const { data } = await clientSimple.from('profils').select('identifiant').eq('id', idAdmin)
    expect(data).toEqual([])
  })

  it('un administrateur lit tous les profils', async () => {
    const { data } = await clientAdministrateur.from('profils').select('id')
    expect(data!.map((l) => l.id)).toEqual(expect.arrayContaining([idSimple, idAdmin]))
  })

  it('un visiteur anonyme ne lit aucun profil', async () => {
    const { data } = await clientAnonyme.from('profils').select('id')
    expect(data ?? []).toEqual([])
  })
})

describe('écriture refusée par défaut', () => {
  it("un utilisateur ne peut pas modifier son propre profil", async () => {
    const { error } = await clientSimple
      .from('profils')
      .update({ nom_affichage: 'Piraté' })
      .eq('id', idSimple)
      .select()
    expect(error).not.toBeNull()

    const { data } = await admin.from('profils').select('nom_affichage').eq('id', idSimple).single()
    expect(data!.nom_affichage).not.toBe('Piraté')
  })

  it('un utilisateur ne peut pas insérer un profil', async () => {
    const { error } = await clientSimple
      .from('profils')
      .insert({ id: idSimple, identifiant: 'test.rls.intrus', nom_affichage: 'Intrus' })
    expect(error).not.toBeNull()
  })

  it('un utilisateur ne peut pas supprimer un profil', async () => {
    const { error } = await clientSimple.from('profils').delete().eq('id', idSimple).select()
    expect(error).not.toBeNull()

    const { data } = await admin.from('profils').select('id').eq('id', idSimple).maybeSingle()
    expect(data).not.toBeNull()
  })

  it("un utilisateur ne peut pas s'attribuer le rôle administrateur", async () => {
    const { error } = await clientSimple
      .from('roles_profil')
      .insert({ profil_id: idSimple, role: 'administrateur' })
    expect(error).not.toBeNull()

    const { data } = await admin.from('roles_profil').select('role').eq('profil_id', idSimple)
    expect(data ?? []).toEqual([])
  })

  it('un administrateur non plus ne peut pas écrire depuis le client', async () => {
    const { error } = await clientAdministrateur
      .from('profils')
      .update({ nom_affichage: 'Modifié' })
      .eq('id', idSimple)
      .select()
    expect(error).not.toBeNull()
  })
})
```

- [ ] **Step 3 : Lancer les tests et observer**

Run : `npm run test:rls`
Expected : les 9 tests **passent**, car les politiques de la Task 4 sont déjà en place. Si l'un
d'eux échoue, la faille est réelle : corriger la migration RLS avant de continuer, ne jamais
adapter le test à la réalité constatée.

- [ ] **Step 4 : Vérifier que les comptes de test ont bien disparu**

Dans l'éditeur SQL Supabase :

```sql
select identifiant from public.profils where identifiant like 'test.rls.%';
```

Expected : aucune ligne.

- [ ] **Step 5 : Commit**

```bash
git add -A
git commit -m "test: vérifier les politiques RLS du socle"
```

---

### Task 12 : Test de bout en bout du parcours de connexion

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/connexion.spec.ts`
- Modify: `package.json` (script `test:e2e`)

**Interfaces:**
- Consumes: l'application complète des Tasks 8 à 10
- Produces: rien de réutilisable

- [ ] **Step 1 : Installer Playwright**

```bash
npm install --save-dev @playwright/test@1.62.1
npx playwright install chromium
```

- [ ] **Step 2 : Configurer Playwright**

Créer `playwright.config.ts` :

```typescript
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  use: { baseURL: 'http://localhost:3000' },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000/connexion',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
```

Ajouter dans `package.json` :

```json
"test:e2e": "dotenv -e .env.local -- playwright test"
```

- [ ] **Step 3 : Écrire le test**

Ce test utilise un compte dédié pour ne pas dépendre de l'état du compte racine.

Créer `tests/e2e/connexion.spec.ts` :

```typescript
import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'

const IDENTIFIANT = 'test.e2e.connexion'
const EMAIL = `${IDENTIFIANT}@asonkeng.local`
const MDP_TEMPORAIRE = 'MotDePasseTemporaire!1'
const MDP_CHOISI = 'MonNouveauMotDePasse!2026'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

async function supprimerCompte() {
  const { data } = await admin.from('profils').select('id').eq('identifiant', IDENTIFIANT).maybeSingle()
  if (data) await admin.auth.admin.deleteUser(data.id)
}

test.beforeAll(async () => {
  await supprimerCompte()
  const { data, error } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: MDP_TEMPORAIRE,
    email_confirm: true,
    app_metadata: { doit_changer_mdp: true },
  })
  if (error || !data.user) throw new Error(error?.message)
  await admin
    .from('profils')
    .insert({ id: data.user.id, identifiant: IDENTIFIANT, nom_affichage: 'Compte de test E2E' })
})

test.afterAll(supprimerCompte)

test('une route protégée renvoie vers la connexion', async ({ page }) => {
  await page.goto('/tableau-de-bord')
  await expect(page).toHaveURL(/\/connexion/)
})

test('des identifiants faux affichent un message indifférencié', async ({ page }) => {
  await page.goto('/connexion')
  await page.getByLabel('Identifiant').fill(IDENTIFIANT)
  await page.getByLabel('Mot de passe').fill('MauvaisMotDePasse!1')
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page.getByRole('alert')).toHaveText('Identifiant ou mot de passe incorrect.')

  await page.getByLabel('Identifiant').fill('inexistant.total')
  await page.getByLabel('Mot de passe').fill('MauvaisMotDePasse!1')
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page.getByRole('alert')).toHaveText('Identifiant ou mot de passe incorrect.')
})

test('le parcours complet mène au tableau de bord', async ({ page }) => {
  await page.goto('/connexion')
  await page.getByLabel('Identifiant').fill(IDENTIFIANT)
  await page.getByLabel('Mot de passe').fill(MDP_TEMPORAIRE)
  await page.getByRole('button', { name: 'Se connecter' }).click()

  await expect(page).toHaveURL(/\/changer-mot-de-passe/)

  await page.getByLabel('Nouveau mot de passe').fill(MDP_CHOISI)
  await page.getByLabel('Confirmation').fill('AutreChose!2026')
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByRole('alert')).toHaveText('Les deux mots de passe ne correspondent pas.')

  await page.getByLabel('Nouveau mot de passe').fill(MDP_CHOISI)
  await page.getByLabel('Confirmation').fill(MDP_CHOISI)
  await page.getByRole('button', { name: 'Enregistrer' }).click()

  await expect(page).toHaveURL(/\/tableau-de-bord/)
  await expect(page.getByText('Compte de test E2E')).toBeVisible()

  await page.goto('/tableau-de-bord')
  await expect(page).toHaveURL(/\/tableau-de-bord/)

  await page.getByRole('button', { name: 'Se déconnecter' }).click()
  await expect(page).toHaveURL(/\/connexion/)
})
```

- [ ] **Step 4 : Lancer les tests**

Run : `npm run test:e2e`
Expected : 3 tests passent.

- [ ] **Step 5 : Commit**

```bash
git add -A
git commit -m "test: couvrir le parcours de connexion de bout en bout"
```

---

### Task 13 : Déploiement sur Vercel

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: l'application complète
- Produces: une URL de production fonctionnelle

- [ ] **Step 1 : Vérifier la construction de production**

Run : `npm run build`
Expected : construction réussie, aucune erreur de type ni de lint.

- [ ] **Step 2 : Se connecter à Vercel**

La connexion est interactive : l'utilisateur doit la lancer lui-même en tapant dans la session :

```
! npx vercel login
```

- [ ] **Step 3 : Lier et configurer le projet**

```bash
npx vercel link
npx vercel env add NEXT_PUBLIC_SUPABASE_URL production
npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
npx vercel env add SUPABASE_SERVICE_ROLE_KEY production
```

Répéter les trois `env add` pour l'environnement `preview`.

**Vérification obligatoire** : `SUPABASE_SERVICE_ROLE_KEY` ne doit **jamais** être saisie avec un
préfixe `NEXT_PUBLIC_`. Contrôler avec :

```bash
npx vercel env ls
```

Expected : trois variables, dont une seule non préfixée `NEXT_PUBLIC_`.

- [ ] **Step 4 : Déployer**

```bash
npx vercel --prod
```

Expected : une URL de production est affichée.

- [ ] **Step 5 : Vérifier en production**

Ouvrir l'URL. Expected :
- redirection vers `/connexion` ;
- connexion avec le compte racine et son mot de passe courant ;
- arrivée sur le tableau de bord avec le nom affiché.

- [ ] **Step 6 : Écrire le README**

Créer `README.md` (le bloc ci-dessous utilise quatre accents graves parce que son contenu en
comporte lui-même trois) :

````markdown
# Suivi Asonkeng

Application de suivi des jeunes croyants de l'équipe Asonkeng.

- Spécification : `docs/superpowers/specs/2026-08-11-suivi-asonkeng-design.md`
- Plans d'implémentation : `docs/superpowers/plans/`

## Démarrer

```bash
npm install
cp .env.local.example .env.local   # puis renseigner les valeurs
npm run dev
```

## Commandes

| Commande | Effet |
|---|---|
| `npm run dev` | Serveur de développement sur http://localhost:3000 |
| `npm test` | Tests unitaires du domaine (rapides, sans base) |
| `npm run test:rls` | Tests des politiques RLS contre le projet Supabase |
| `npm run test:e2e` | Parcours de bout en bout (Playwright) |
| `npm run amorcer:racine` | Crée le compte administrateur racine (idempotent) |
| `npx supabase db push` | Applique les migrations en attente |

## Attention

Un **seul** projet Supabase sert au développement et à la production. Les migrations sont
strictement additives. **Ne jamais exécuter `supabase db reset`.**
````

- [ ] **Step 7 : Commit**

```bash
git add -A
git commit -m "chore: déployer sur Vercel et documenter le projet"
```

---

### Task 14 : Séparer les environnements (optionnelle, recommandée avant la phase 1)

À exécuter **avant la saisie des premiers vrais membres**. Tant qu'elle n'est pas faite, chaque
test RLS et chaque migration s'exécute contre les données de production.

**Files:**
- Modify: `README.md`
- Create: `.env.production.example`

- [ ] **Step 1 : Créer un second projet Supabase**

Sur le tableau de bord Supabase, créer `asonkeng-prod`. Le projet existant devient `asonkeng-dev`.

- [ ] **Step 2 : Appliquer tout l'historique des migrations au nouveau projet**

```bash
npx supabase link --project-ref <REFERENCE_PROD>
npx supabase db push
npm run amorcer:racine
```

- [ ] **Step 3 : Basculer les variables Vercel de production**

```bash
npx vercel env rm NEXT_PUBLIC_SUPABASE_URL production
npx vercel env add NEXT_PUBLIC_SUPABASE_URL production
```

Répéter pour les deux autres variables, avec les valeurs du projet `asonkeng-prod`.

- [ ] **Step 4 : Vérifier**

Run : `npx vercel --prod`, puis se connecter sur l'URL de production avec le compte racine.
Expected : connexion réussie contre la nouvelle base.

- [ ] **Step 5 : Commit**

```bash
git add -A
git commit -m "chore: séparer les environnements de développement et de production"
```

---

## Critères d'achèvement de la phase

La phase 0 est terminée quand **tout** ce qui suit est vrai, vérifié par exécution et non par
supposition :

- [ ] `npm test` passe — normalisation des identifiants couverte
- [ ] `npm run test:rls` passe — 9 tests, dont 5 vérifiant le refus d'écriture
- [ ] `npm run test:e2e` passe — 3 tests
- [ ] `npm run build` passe sans erreur
- [ ] `npx supabase db push --dry-run` annonce la base à jour
- [ ] La requête `select … from pg_policies` ne renvoie **que** des politiques `SELECT`
- [ ] L'URL de production redirige un visiteur non connecté vers `/connexion`
- [ ] Le compte racine s'y connecte, change son mot de passe, et atteint le tableau de bord
- [ ] `npx vercel env ls` ne montre aucune clé de service préfixée `NEXT_PUBLIC_`
