# Phase 1a — Registre : plan d'implémentation

> **Pour les agents :** SOUS-COMPÉTENCE REQUISE — utiliser `superpowers:subagent-driven-development`
> (recommandé) ou `superpowers:executing-plans` pour exécuter ce plan tâche par tâche.
> Les étapes utilisent la syntaxe à cases à cocher (`- [ ]`) pour le suivi.

**Objectif :** permettre à l'équipe de tenir son registre — saisir des fiches membres,
les rattacher à une antenne, et consulter l'annuaire.

**Architecture :** on prolonge le socle de la phase 0 sans en changer les principes. Lectures
sous RLS, écritures exclusivement par Server Actions avec la clé de service, refus par défaut.
La nouveauté est que la phase 0 a livré des gardes **ponctuels** — le filtre des comptes actifs
vivait dans une seule fonction. Cette phase les convertit en **primitives obligatoires**, côté
SQL (`prive.est_actif()`) et côté application (`exigerProfilActif`, `exigerAdministrateur`), que
toute page et toute action devront traverser. C'est la recommandation principale de la revue
finale de la phase 0.

**Spécification de référence :** `docs/superpowers/specs/2026-08-11-suivi-asonkeng-design.md`
(décisions D1, D2, D3, sections 4.2, 5.1, 5.2, 5.3).

**Ce plan ne livre PAS**, volontairement : les statuts et leur journal (plan 1b), l'arborescence
faiseur de disciple / dirigeant et la portée d'autorité (plan 1c). Les colonnes correspondantes
sont créées ici, mais aucune interface ne les alimente et aucune règle ne s'y applique encore.

## Contraintes globales

- **Versions exactes**, déjà installées, à ne pas modifier : `next@16.3.0`, `react@19.2.8`,
  `typescript@6.0.3`, `@supabase/supabase-js@2.112.3`, `@supabase/ssr@0.12.4`, `vitest@4.1.10`,
  `tailwindcss@4.3.3`, `zod@4.4.3`, `@playwright/test@1.62.1`, `tsx@4.23.12`, `dotenv-cli`.
  **TypeScript reste en 6.0.3** : `typescript-eslint` déclare le pair `>=4.8.4 <6.1.0` et refuse
  de démarrer sous TS 7.
- **Langue** : code, tables, colonnes, fonctions, routes et messages en **français**.
  Identifiants SQL en `snake_case` minuscule.
- **Un seul projet Supabase** sert au développement et à la production. Migrations strictement
  additives, **jamais** de `supabase db reset`, **jamais** de modification d'une migration déjà
  appliquée.
- **Aucune politique RLS d'écriture** pour `anon` ou `authenticated`, sur aucune table, jamais.
  Toute écriture passe par une Server Action utilisant la clé de service.
- **Toute fonction appelée dans une politique RLS** est enveloppée dans `(select ...)`.
- **Toute colonne de clé étrangère est indexée**, sauf si déjà en tête d'une clé primaire
  composite ou couverte par une contrainte `UNIQUE`.
- Types : `text` (jamais `varchar(n)`), `timestamptz` (jamais `timestamp`), `boolean`, `enum`
  Postgres pour les ensembles fermés.
- Dépôt GitHub **public** : aucun secret versionné, aucun mot de passe littéral dans un test —
  les suites tirent leurs mots de passe au hasard à chaque exécution.
- **Ne jamais toucher au compte `racine`** : c'est le seul accès administrateur du projet.
- Les implémenteurs ne stagent que leurs propres fichiers, jamais `git add -A`, et n'utilisent
  aucune commande à portée globale sur les processus de la machine.
- **Commit après chaque tâche**, message en français, préfixe conventionnel.

## Structure des fichiers

| Fichier | Responsabilité |
|---|---|
| `supabase/migrations/*_primitives_securite.sql` | `prive.est_actif()` et son privilège d'exécution |
| `supabase/migrations/*_antennes.sql` | Table `antennes`, RLS, amorçage |
| `supabase/migrations/*_membres.sql` | Table `membres`, RLS, index, clé étrangère différée de `profils.membre_id` |
| `src/lib/securite/garde.ts` | `exigerProfilActif`, `exigerAdministrateur` — passage obligé de toute page et action |
| `src/lib/domaine/membre.ts` + `.test.ts` | Validation et normalisation des champs d'une fiche, TypeScript pur |
| `src/lib/donnees/antennes.ts` | Lectures typées des antennes |
| `src/lib/donnees/membres.ts` | Lectures typées des membres |
| `src/app/membres/page.tsx` | Annuaire : liste, recherche, filtre par antenne |
| `src/app/membres/[id]/page.tsx` | Fiche membre en lecture |
| `src/app/membres/actions.ts` | Server Actions de création, modification, archivage |
| `src/app/membres/nouveau/page.tsx` | Formulaire de création (administrateur) |
| `src/app/membres/[id]/modifier/page.tsx` | Formulaire de modification (administrateur) |
| `src/app/antennes/page.tsx` + `actions.ts` | Gestion des antennes (administrateur) |
| `tests/rls/membres.test.ts` | Politiques RLS des nouvelles tables |
| `tests/e2e/annuaire.spec.ts` | Parcours annuaire de bout en bout |

---

### Task 1 : Primitives de sécurité

C'est la tâche qui conditionne toutes les suivantes. La phase 0 vérifiait qu'un compte est actif
à un seul endroit ; ici on en fait une brique que la base et l'application imposent.

**Files:**
- Create: `supabase/migrations/20260812100000_primitives_securite.sql`
- Create: `src/lib/securite/garde.ts`
- Modify: `src/lib/donnees/profils.ts` (ajout de `rolesDuProfil`)
- Modify: `src/app/tableau-de-bord/page.tsx` (adoption du garde)

**Interfaces:**
- Consumes: `profilCourant(): Promise<Profil | null>` de `@/lib/donnees/profils`
- Produces:
  - SQL `prive.est_actif(): boolean` — vrai si le compte appelant a une fiche `profils` active
  - `rolesDuProfil(profilId: string): Promise<RoleApp[]>` avec `type RoleApp = 'administrateur' | 'moderateur'`
  - `exigerProfilActif(): Promise<Profil>` — redirige vers `/deconnexion` si absent
  - `exigerAdministrateur(): Promise<Profil>` — redirige vers `/tableau-de-bord` si non administrateur

- [ ] **Step 1 : Écrire la migration**

Créer `supabase/migrations/20260812100000_primitives_securite.sql` :

```sql
-- Primitive de sécurité réutilisable par toutes les politiques de la phase 1.
-- La phase 0 vérifiait « compte actif » à un seul endroit, dans une fonction TypeScript.
-- Chaque politique devait s'en souvenir seule. Cette fonction en fait une brique nommée.

create or replace function prive.est_actif()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profils p
    where p.id = (select auth.uid())
      and p.actif
  );
$$;

comment on function prive.est_actif() is
  'Vrai si le compte appelant possède une fiche profil active. À employer dans toute politique de lecture ouverte « à tout compte actif » (spec §5.3).';

-- Les expressions de politique s'évaluent avec les privilèges du rôle appelant :
-- `authenticated` doit donc pouvoir exécuter la fonction.
revoke execute on function prive.est_actif() from public, anon, service_role;
grant execute on function prive.est_actif() to authenticated;
```

- [ ] **Step 2 : Appliquer et vérifier la migration**

```bash
npx supabase db push
```
Expected : appliquée sans erreur.

Puis, via l'API Management (jeton lu depuis `.env.local`, jamais affiché) :

```
$jeton = ((Get-Content .env.local | Select-String '^SUPABASE_ACCESS_TOKEN=') -split '=',2)[1]
$h = @{ Authorization = "Bearer $jeton"; 'Content-Type' = 'application/json' }
$sql = @'
select p.proname, pg_get_function_result(p.oid) as retour
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'prive' order by p.proname
'@
Invoke-RestMethod -Uri 'https://api.supabase.com/v1/projects/zytkgsavvfuubutopzxb/database/query' -Method Post -Headers $h -Body (@{ query = $sql } | ConvertTo-Json) | ConvertTo-Json -Depth 5
```

Expected : deux lignes, `est_actif` et `est_admin`, toutes deux retournant `boolean`.

- [ ] **Step 3 : Ajouter la lecture des rôles**

Ajouter à la fin de `src/lib/donnees/profils.ts` :

```typescript
export type RoleApp = 'administrateur' | 'moderateur'

/** Rôles explicitement attribués. Les droits « Utilisateur » sont le socle implicite. */
export async function rolesDuProfil(profilId: string): Promise<RoleApp[]> {
  const supabase = await clientServeur()
  const { data, error } = await supabase
    .from('roles_profil')
    .select('role')
    .eq('profil_id', profilId)

  // Ne jamais retomber sur une liste vide : « aucun rôle » et « la requête a
  // échoué » auraient alors le même effet, et un administrateur verrait ses
  // fonctions disparaître de l'écran sans qu'aucun message ne le lui dise.
  if (error) {
    throw new Error(`Lecture des rôles impossible : ${error.message}`)
  }

  return (data ?? []).map((ligne) => ligne.role as RoleApp)
}
```

- [ ] **Step 4 : Écrire le garde applicatif**

Créer `src/lib/securite/garde.ts` :

```typescript
import 'server-only'
import { redirect } from 'next/navigation'
import { profilCourant, rolesDuProfil, type Profil } from '@/lib/donnees/profils'

/**
 * Passage obligé de toute page et de toute Server Action de l'application.
 *
 * Un contrôle écrit une fois par écran finit par manquer quelque part : ce garde
 * existe pour qu'il n'y ait qu'une seule façon d'entrer. `profilCourant()` renvoie
 * `null` aussi bien pour une session absente que pour un compte désactivé ou sans
 * fiche — les trois appellent la même réaction.
 *
 * Vers `/deconnexion` et non `/connexion` : le jeton peut rester valide alors que le
 * profil ne l'est plus, et le middleware ferait rebondir indéfiniment.
 */
export async function exigerProfilActif(): Promise<Profil> {
  const profil = await profilCourant()
  if (!profil) {
    redirect('/deconnexion')
  }
  return profil
}

/** Réserve une page ou une action aux administrateurs. */
export async function exigerAdministrateur(): Promise<Profil> {
  const profil = await exigerProfilActif()
  const roles = await rolesDuProfil(profil.id)
  if (!roles.includes('administrateur')) {
    redirect('/tableau-de-bord')
  }
  return profil
}
```

- [ ] **Step 5 : Faire adopter le garde partout où il doit l'être**

Un garde qui centralise un contrôle ne sert à rien tant que des appelants continuent de le
refaire à la main : la copie oubliée devient la faille. Cherche donc **tous** les appels directs
à `profilCourant` hors de `garde.ts` et fais-les passer par le garde.

À ce jour il y en a deux — le tableau de bord et l'action de changement de mot de passe. Dans
`src/app/changer-mot-de-passe/actions.ts`, remplacer le bloc qui appelle `profilCourant()` puis
redirige vers `/deconnexion` par un simple `await exigerProfilActif()`, en important le garde
depuis `@/lib/securite/garde`, et retirer l'import de `profilCourant` devenu inutile.

Vérifie ensuite par une recherche qu'aucun appel direct ne subsiste hors de `garde.ts`.

- [ ] **Step 5b : Faire adopter le garde par le tableau de bord**

Dans `src/app/tableau-de-bord/page.tsx`, remplacer l'appel direct à `profilCourant()` et sa
redirection manuelle par :

```typescript
const profil = await exigerProfilActif()
```

en important `exigerProfilActif` depuis `@/lib/securite/garde`. Retirer les imports devenus
inutiles (`profilCourant`, et `redirect` s'il n'est plus employé).

- [ ] **Step 6 : Vérifier**

Run : `npx tsc --noEmit` puis `npm run lint` puis `npm test` (15 tests) puis `npm run build`.
Expected : les quatre passent.

Run : `npm run dev`, se connecter, atteindre `/tableau-de-bord`.
Expected : la page s'affiche avec le nom du compte, exactement comme avant.

- [ ] **Step 7 : Commit**

```bash
git add supabase/migrations/20260812100000_primitives_securite.sql src/lib/securite/garde.ts src/lib/donnees/profils.ts src/app/tableau-de-bord/page.tsx
git commit -m "feat: introduire les primitives de securite est_actif et exigerProfilActif"
```

---

### Task 2 : Antennes

**Files:**
- Create: `supabase/migrations/20260812110000_antennes.sql`
- Create: `src/lib/donnees/antennes.ts`

**Interfaces:**
- Consumes: `prive.est_actif()` (Task 1)
- Produces:
  - `type Antenne = { id: string; nom: string; pays: string; actif: boolean }`
  - `listerAntennes(): Promise<Antenne[]>` — antennes actives, triées par nom

- [ ] **Step 1 : Écrire la migration**

Créer `supabase/migrations/20260812110000_antennes.sql` :

```sql
-- Antennes : regroupement géographique des membres (spec D3).

create table public.antennes (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique,
  pays text not null,
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  constraint antennes_nom_non_vide check (length(trim(nom)) > 0),
  constraint antennes_pays_non_vide check (length(trim(pays)) > 0)
);

comment on table public.antennes is
  'Regroupement géographique des membres. Sert à pré-remplir les listes de présence des AEL.';

revoke all on public.antennes from anon, authenticated;
grant select on public.antennes to authenticated;

alter table public.antennes enable row level security;
alter table public.antennes force row level security;

-- Lecture ouverte à tout compte actif (spec D2). Aucune politique d'écriture.
create policy antennes_lecture on public.antennes
  for select
  to authenticated
  using ((select prive.est_actif()));

insert into public.antennes (nom, pays) values
  ('Cameroun', 'Cameroun'),
  ('Batouri', 'Cameroun'),
  ('France', 'France');
```

- [ ] **Step 2 : Appliquer la migration**

Run : `npx supabase db push`
Expected : appliquée sans erreur.

Vérifier via l'API Management que la table contient exactement trois lignes :

```
$sql = @'
select nom, pays, actif from public.antennes order by nom
'@
```
Expected : `Batouri`, `Cameroun`, `France`, toutes actives.

- [ ] **Step 3 : Écrire les lectures typées**

Créer `src/lib/donnees/antennes.ts` :

```typescript
import 'server-only'
import { clientServeur } from '@/lib/supabase/serveur'

export type Antenne = {
  id: string
  nom: string
  pays: string
  actif: boolean
}

/** Antennes actives, triées par nom. */
export async function listerAntennes(): Promise<Antenne[]> {
  const supabase = await clientServeur()
  const { data } = await supabase
    .from('antennes')
    .select('id, nom, pays, actif')
    .eq('actif', true)
    .order('nom')

  return (data ?? []) as Antenne[]
}
```

- [ ] **Step 4 : Vérifier**

Run : `npx tsc --noEmit`, `npm run lint`, `npm test`.
Expected : les trois passent.

- [ ] **Step 5 : Commit**

```bash
git add supabase/migrations/20260812110000_antennes.sql src/lib/donnees/antennes.ts
git commit -m "feat: creer les antennes et leur lecture typee"
```

---

### Task 3 : Validation d'une fiche membre (domaine pur)

**Files:**
- Create: `src/lib/domaine/membre.ts`
- Create: `src/lib/domaine/membre.test.ts`

**Interfaces:**
- Consumes: rien
- Produces:
  - `type SituationMembre = 'etudiant' | 'travailleur' | 'autre'`
  - `type EtatMembre = 'en_attente' | 'actif' | 'archive'`
  - `class FicheMembreInvalideError extends Error`
  - `type FicheMembre = { nom: string; prenom: string; telephone: string | null; emailContact: string | null; ville: string | null; pays: string | null; antenneId: string | null; situation: SituationMembre | null; domaineEtude: string | null; reportInitialAel: number }`
  - `normaliserFicheMembre(brut: Record<string, unknown>): FicheMembre`

- [ ] **Step 1 : Écrire les tests qui échouent**

Créer `src/lib/domaine/membre.test.ts` :

```typescript
import { describe, expect, it } from 'vitest'
import { FicheMembreInvalideError, normaliserFicheMembre } from './membre'

const minimal = { nom: 'Nguem', prenom: 'Jérôme', reportInitialAel: 0 }

describe('normaliserFicheMembre', () => {
  it('conserve les accents du nom et du prénom', () => {
    const fiche = normaliserFicheMembre(minimal)
    expect(fiche.nom).toBe('Nguem')
    expect(fiche.prenom).toBe('Jérôme')
  })

  it('retire les espaces superflus', () => {
    const fiche = normaliserFicheMembre({ ...minimal, nom: '  Nguem  ', prenom: ' Jérôme ' })
    expect(fiche.nom).toBe('Nguem')
    expect(fiche.prenom).toBe('Jérôme')
  })

  it('ramène une chaîne vide à null pour les champs optionnels', () => {
    const fiche = normaliserFicheMembre({ ...minimal, ville: '   ', telephone: '' })
    expect(fiche.ville).toBeNull()
    expect(fiche.telephone).toBeNull()
  })

  it('refuse un nom vide', () => {
    expect(() => normaliserFicheMembre({ ...minimal, nom: '   ' })).toThrow(FicheMembreInvalideError)
  })

  it('refuse un prénom vide', () => {
    expect(() => normaliserFicheMembre({ ...minimal, prenom: '' })).toThrow(FicheMembreInvalideError)
  })

  it('accepte les trois situations prévues', () => {
    for (const situation of ['etudiant', 'travailleur', 'autre'] as const) {
      expect(normaliserFicheMembre({ ...minimal, situation }).situation).toBe(situation)
    }
  })

  it('refuse une situation inconnue', () => {
    expect(() => normaliserFicheMembre({ ...minimal, situation: 'retraite' })).toThrow(
      FicheMembreInvalideError,
    )
  })

  it('accepte une situation absente', () => {
    expect(normaliserFicheMembre(minimal).situation).toBeNull()
  })

  it('refuse un report initial négatif', () => {
    expect(() => normaliserFicheMembre({ ...minimal, reportInitialAel: -1 })).toThrow(
      FicheMembreInvalideError,
    )
  })

  it('refuse un report initial non entier', () => {
    expect(() => normaliserFicheMembre({ ...minimal, reportInitialAel: 2.5 })).toThrow(
      FicheMembreInvalideError,
    )
  })

  it('accepte un report initial absent et le ramène à zéro', () => {
    const { reportInitialAel } = normaliserFicheMembre({ nom: 'Nguem', prenom: 'Jérôme' })
    expect(reportInitialAel).toBe(0)
  })

  it("refuse un email de contact manifestement invalide", () => {
    expect(() => normaliserFicheMembre({ ...minimal, emailContact: 'pas-un-email' })).toThrow(
      FicheMembreInvalideError,
    )
  })

  it('accepte un email de contact valide', () => {
    const fiche = normaliserFicheMembre({ ...minimal, emailContact: 'jerome@example.com' })
    expect(fiche.emailContact).toBe('jerome@example.com')
  })

  it('met le domaine d\'étude à null quand la situation n\'est pas étudiant', () => {
    const fiche = normaliserFicheMembre({
      ...minimal,
      situation: 'travailleur',
      domaineEtude: 'Informatique',
    })
    expect(fiche.domaineEtude).toBeNull()
  })

  it("conserve le domaine d'étude pour un étudiant", () => {
    const fiche = normaliserFicheMembre({
      ...minimal,
      situation: 'etudiant',
      domaineEtude: 'Informatique',
    })
    expect(fiche.domaineEtude).toBe('Informatique')
  })

  it("efface le domaine d'étude quand la situation est absente", () => {
    const fiche = normaliserFicheMembre({ ...minimal, domaineEtude: 'Informatique' })
    expect(fiche.domaineEtude).toBeNull()
  })
})

// Ces tests couvrent le chemin réellement emprunté en production. Les données
// viennent d'un formulaire HTML : `FormData` ne rend que des chaînes, jamais des
// nombres. Sans eux, la conversion pourrait être cassée ou supprimée sans que la
// suite s'en aperçoive, et la fonction serait juste sous test et fausse en vrai.
describe('normaliserFicheMembre — valeurs telles que les rend un formulaire', () => {
  it('accepte un report initial donné sous forme de chaîne', () => {
    expect(normaliserFicheMembre({ ...minimal, reportInitialAel: '5' }).reportInitialAel).toBe(5)
  })

  it('traite un report initial vidé par l’utilisateur comme zéro', () => {
    expect(normaliserFicheMembre({ ...minimal, reportInitialAel: '' }).reportInitialAel).toBe(0)
  })

  it('refuse un report initial non numérique', () => {
    expect(() => normaliserFicheMembre({ ...minimal, reportInitialAel: 'abc' })).toThrow(
      FicheMembreInvalideError,
    )
  })

  it('refuse un report initial décimal donné sous forme de chaîne', () => {
    expect(() => normaliserFicheMembre({ ...minimal, reportInitialAel: '2.5' })).toThrow(
      FicheMembreInvalideError,
    )
  })

  it('traite un champ optionnel absent comme non renseigné', () => {
    expect(normaliserFicheMembre({ ...minimal, ville: null }).ville).toBeNull()
    expect(normaliserFicheMembre({ ...minimal, ville: undefined }).ville).toBeNull()
  })

  it('refuse un champ texte reçu sous une forme inattendue plutôt que de le perdre', () => {
    expect(() => normaliserFicheMembre({ ...minimal, ville: 42 })).toThrow(
      FicheMembreInvalideError,
    )
  })
})
```

- [ ] **Step 2 : Lancer les tests et vérifier qu'ils échouent**

Run : `npm test`
Expected : FAIL — `Failed to resolve import "./membre"`.

- [ ] **Step 3 : Écrire l'implémentation**

Créer `src/lib/domaine/membre.ts` :

```typescript
export type SituationMembre = 'etudiant' | 'travailleur' | 'autre'
export type EtatMembre = 'en_attente' | 'actif' | 'archive'

const SITUATIONS: readonly SituationMembre[] = ['etudiant', 'travailleur', 'autre']

/** Contrôle volontairement permissif : on écarte les saisies manifestement fautives, pas plus. */
const FORMAT_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export class FicheMembreInvalideError extends Error {
  constructor(raison: string) {
    super(`Fiche invalide : ${raison}`)
    this.name = 'FicheMembreInvalideError'
  }
}

export type FicheMembre = {
  nom: string
  prenom: string
  telephone: string | null
  emailContact: string | null
  ville: string | null
  pays: string | null
  antenneId: string | null
  situation: SituationMembre | null
  domaineEtude: string | null
  reportInitialAel: number
}

function texteObligatoire(valeur: unknown, champ: string): string {
  const nettoye = typeof valeur === 'string' ? valeur.trim() : ''
  if (nettoye.length === 0) {
    throw new FicheMembreInvalideError(`le champ « ${champ} » est obligatoire`)
  }
  return nettoye
}

function texteOptionnel(valeur: unknown): string | null {
  // Absent et vide sont légitimes ; toute autre forme est une anomalie qu'il vaut
  // mieux signaler que ramener silencieusement à `null`. Un `antenneId` avalé sans
  // bruit détacherait un membre de son antenne sans que personne ne le voie.
  if (valeur === null || valeur === undefined) return null
  if (typeof valeur !== 'string') {
    throw new FicheMembreInvalideError('un champ texte a reçu une valeur inattendue')
  }
  const nettoye = valeur.trim()
  return nettoye.length === 0 ? null : nettoye
}

export function normaliserFicheMembre(brut: Record<string, unknown>): FicheMembre {
  const nom = texteObligatoire(brut.nom, 'nom')
  const prenom = texteObligatoire(brut.prenom, 'prénom')

  const situationBrute = texteOptionnel(brut.situation)
  if (situationBrute !== null && !SITUATIONS.includes(situationBrute as SituationMembre)) {
    throw new FicheMembreInvalideError(`situation inconnue : « ${situationBrute} »`)
  }
  const situation = (situationBrute as SituationMembre | null) ?? null

  const emailContact = texteOptionnel(brut.emailContact)
  if (emailContact !== null && !FORMAT_EMAIL.test(emailContact)) {
    throw new FicheMembreInvalideError("l'adresse de contact n'a pas un format valide")
  }

  const report = brut.reportInitialAel ?? 0
  const reportInitialAel = typeof report === 'number' ? report : Number(report)
  if (!Number.isInteger(reportInitialAel) || reportInitialAel < 0) {
    throw new FicheMembreInvalideError(
      "le nombre d'AEL déjà suivis doit être un entier positif ou nul",
    )
  }

  return {
    nom,
    prenom,
    telephone: texteOptionnel(brut.telephone),
    emailContact,
    ville: texteOptionnel(brut.ville),
    pays: texteOptionnel(brut.pays),
    antenneId: texteOptionnel(brut.antenneId),
    situation,
    // Un domaine d'étude n'a de sens que pour un étudiant : le conserver ailleurs
    // laisserait traîner une information fausse après un changement de situation.
    domaineEtude: situation === 'etudiant' ? texteOptionnel(brut.domaineEtude) : null,
    reportInitialAel,
  }
}
```

- [ ] **Step 4 : Lancer les tests et vérifier qu'ils passent**

Run : `npm test`
Expected : PASS, 37 tests réussis (15 hérités de la phase 0 et 22 nouveaux).

- [ ] **Step 5 : Commit**

```bash
git add src/lib/domaine/membre.ts src/lib/domaine/membre.test.ts
git commit -m "feat: valider et normaliser les fiches membres"
```

---

### Task 4 : Table des membres

**Files:**
- Create: `supabase/migrations/20260812120000_membres.sql`

**Interfaces:**
- Consumes: `antennes` (Task 2), `prive.est_actif()` (Task 1)
- Produces: table `public.membres`, types `public.situation_membre` et `public.etat_membre`,
  clé étrangère `profils.membre_id → membres.id`

- [ ] **Step 1 : Écrire la migration**

Créer `supabase/migrations/20260812120000_membres.sql` :

```sql
-- Fiches membres (spec §4.2). Les colonnes d'arborescence existent dès maintenant mais
-- ne sont alimentées par aucune interface : le plan 1c leur ajoutera le déclencheur
-- anti-cycle et la logique de calcul du dirigeant.

create type public.situation_membre as enum ('etudiant', 'travailleur', 'autre');
create type public.etat_membre as enum ('en_attente', 'actif', 'archive');

create table public.membres (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  prenom text not null,
  telephone text,
  email_contact text,
  ville text,
  pays text,
  -- `restrict` et non `set null` : supprimer une antenne à laquelle des membres sont
  -- rattachés doit échouer bruyamment, pas les détacher en silence. La voie prévue
  -- est la désactivation (`actif = false`), qui préserve l'information.
  antenne_id uuid references public.antennes (id) on delete restrict,
  situation public.situation_membre,
  domaine_etude text,
  faiseur_de_disciple_id uuid references public.membres (id) on delete set null,
  dirigeant_id uuid references public.membres (id) on delete set null,
  dirigeant_force boolean not null default false,
  report_initial_ael integer not null default 0,
  etat public.etat_membre not null default 'actif',
  cree_le timestamptz not null default now(),
  cree_par uuid references public.profils (id) on delete set null,
  constraint membres_nom_non_vide check (length(trim(nom)) > 0),
  constraint membres_prenom_non_vide check (length(trim(prenom)) > 0),
  constraint membres_report_positif check (report_initial_ael >= 0),
  -- Un domaine d'étude n'a de sens que pour un étudiant.
  constraint membres_domaine_reserve_etudiant
    check (domaine_etude is null or situation = 'etudiant'),
  -- Un membre ne peut pas être son propre faiseur de disciple ni son propre dirigeant.
  -- Les cycles plus longs seront refusés par le déclencheur du plan 1c.
  constraint membres_pas_son_propre_fdd check (faiseur_de_disciple_id is distinct from id),
  constraint membres_pas_son_propre_dirigeant check (dirigeant_id is distinct from id)
);

comment on table public.membres is
  'Personne suivie par l''équipe. Distincte du compte de connexion : un membre peut exister sans compte (spec D1).';
comment on column public.membres.report_initial_ael is
  'AEL suivis avant la mise en service de l''application. Le compteur affiché y ajoute les présences enregistrées (spec D4).';

create index membres_antenne_id_idx on public.membres (antenne_id);
create index membres_faiseur_de_disciple_id_idx on public.membres (faiseur_de_disciple_id);
create index membres_dirigeant_id_idx on public.membres (dirigeant_id);
create index membres_cree_par_idx on public.membres (cree_par);
create index membres_etat_idx on public.membres (etat);

-- La clé étrangère annoncée par la phase 0, désormais possible.
alter table public.profils
  add constraint profils_membre_id_fkey
  foreign key (membre_id) references public.membres (id) on delete set null;

revoke all on public.membres from anon, authenticated;
grant select on public.membres to authenticated;

alter table public.membres enable row level security;
alter table public.membres force row level security;

-- Lecture : l'annuaire des membres actifs est ouvert à tout compte actif (spec D2).
-- Les fiches en attente et archivées restent réservées à l'administrateur.
create policy membres_lecture on public.membres
  for select
  to authenticated
  using (
    (select prive.est_actif())
    and (etat = 'actif' or (select prive.est_admin()))
  );

-- Aucune politique d'écriture : toutes les mutations passent par des Server Actions.
```

- [ ] **Step 2 : Appliquer la migration**

Run : `npx supabase db push`
Expected : appliquée sans erreur.

- [ ] **Step 3 : Vérifier le schéma et l'absence de politique d'écriture**

Via l'API Management :

```
$sql = @'
select tablename, policyname, cmd from pg_policies
where schemaname = 'public' order by tablename, policyname
'@
```

Expected : quatre lignes — `antennes_lecture`, `membres_lecture`, `profils_lecture`,
`roles_profil_lecture` — **toutes avec `cmd = 'SELECT'`**. Aucune ligne `INSERT`, `UPDATE`,
`DELETE` ou `ALL`.

- [ ] **Step 4 : Vérifier que les suites existantes passent toujours**

Run : `npm run test:rls`
Expected : 10 tests passent — les nouvelles tables ne doivent pas perturber les politiques du socle.

- [ ] **Step 5 : Commit**

```bash
git add supabase/migrations/20260812120000_membres.sql
git commit -m "feat: creer la table des membres et sa politique de lecture"
```

---

### Task 5 : Lectures typées des membres

**Files:**
- Create: `src/lib/donnees/membres.ts`

**Interfaces:**
- Consumes: `clientServeur` (phase 0), types de `@/lib/domaine/membre` (Task 3)
- Produces:
  - `type MembreListe = { id: string; nom: string; prenom: string; ville: string | null; antenneNom: string | null; situation: SituationMembre | null }`
  - `type MembreDetail = MembreListe & { telephone: string | null; emailContact: string | null; pays: string | null; antenneId: string | null; domaineEtude: string | null; reportInitialAel: number; etat: EtatMembre }`
  - `listerMembres(filtres?: { recherche?: string; antenneId?: string }): Promise<MembreListe[]>`
  - `membreParId(id: string): Promise<MembreDetail | null>`

- [ ] **Step 1 : Écrire le module**

Créer `src/lib/donnees/membres.ts` :

```typescript
import 'server-only'
import type { EtatMembre, SituationMembre } from '@/lib/domaine/membre'
import { clientServeur } from '@/lib/supabase/serveur'

export type MembreListe = {
  id: string
  nom: string
  prenom: string
  ville: string | null
  antenneNom: string | null
  situation: SituationMembre | null
}

export type MembreDetail = MembreListe & {
  telephone: string | null
  emailContact: string | null
  pays: string | null
  antenneId: string | null
  domaineEtude: string | null
  reportInitialAel: number
  etat: EtatMembre
}

const COLONNES_LISTE = 'id, nom, prenom, ville, situation, antennes(nom)'
const COLONNES_DETAIL =
  'id, nom, prenom, ville, situation, telephone, email_contact, pays, antenne_id, domaine_etude, report_initial_ael, etat, antennes(nom)'

type LigneAntenne = { nom: string } | { nom: string }[] | null

function nomAntenne(valeur: LigneAntenne): string | null {
  if (!valeur) return null
  return Array.isArray(valeur) ? (valeur[0]?.nom ?? null) : valeur.nom
}

/**
 * Membres visibles par le compte appelant, triés par nom puis prénom.
 * La RLS décide de ce qui est visible ; ce module ne refait pas ce filtrage.
 */
export async function listerMembres(filtres?: {
  recherche?: string
  antenneId?: string
}): Promise<MembreListe[]> {
  const supabase = await clientServeur()
  // `etat = 'actif'` explicitement, et pas seulement via la RLS : la politique laisse
  // un administrateur voir aussi les fiches archivées, or l'annuaire est la liste des
  // membres en cours de suivi. Sans ce filtre, archiver une fiche ne la ferait pas
  // disparaître pour un administrateur — exactement l'inverse de ce qu'il attend.
  let requete = supabase
    .from('membres')
    .select(COLONNES_LISTE)
    .eq('etat', 'actif')
    .order('nom')
    .order('prenom')

  const recherche = filtres?.recherche?.trim()
  if (recherche) {
    // PostgREST réserve `, . : * ( )` dans la valeur d'un filtre. Plutôt que de
    // retenir une liste de caractères à retirer — qui sera incomplète le jour où
    // elle changera — on entoure la valeur de guillemets, forme dans laquelle
    // PostgREST accepte tout, en n'échappant que ce que les guillemets exigent.
    // Sans cela, chercher « St. Etienne » casse la requête, et comme l'erreur
    // était ignorée, l'écran annonçait « aucun membre » pour une recherche valide.
    const terme = recherche
      .replace(/[\\"]/g, '\$&') // échapper l'antislash et le guillemet
      .replace(/[%_]/g, '') // neutraliser les jokers de `ilike`
    if (terme.length > 0) {
      const motif = `"%${terme}%"`
      requete = requete.or(`nom.ilike.${motif},prenom.ilike.${motif},ville.ilike.${motif}`)
    }
  }
  if (filtres?.antenneId) {
    requete = requete.eq('antenne_id', filtres.antenneId)
  }

  const { data, error } = await requete
  if (error) {
    // Un échec ne doit pas être indistinguable d'un résultat vide : annoncer
    // « aucun membre » alors que la requête a échoué est un mensonge silencieux.
    throw new Error(`Lecture des membres impossible : ${error.message}`)
  }

  return (data ?? []).map((l) => ({
    id: l.id as string,
    nom: l.nom as string,
    prenom: l.prenom as string,
    ville: l.ville as string | null,
    situation: l.situation as SituationMembre | null,
    antenneNom: nomAntenne(l.antennes as LigneAntenne),
  }))
}

/**
 * Fiche complète, ou `null` si elle n'existe pas ou n'est pas visible par l'appelant.
 *
 * Contrairement à `listerMembres`, cette fonction ne filtre **pas** sur l'état : un
 * administrateur doit pouvoir ouvrir une fiche archivée depuis un lien direct. Ce
 * n'est pas un oubli, et la sécurité au niveau des lignes reste seule juge de ce qui
 * est visible.
 */
export async function membreParId(id: string): Promise<MembreDetail | null> {
  const supabase = await clientServeur()
  const { data } = await supabase.from('membres').select(COLONNES_DETAIL).eq('id', id).maybeSingle()
  if (!data) return null

  return {
    id: data.id as string,
    nom: data.nom as string,
    prenom: data.prenom as string,
    ville: data.ville as string | null,
    situation: data.situation as SituationMembre | null,
    antenneNom: nomAntenne(data.antennes as LigneAntenne),
    telephone: data.telephone as string | null,
    emailContact: data.email_contact as string | null,
    pays: data.pays as string | null,
    antenneId: data.antenne_id as string | null,
    domaineEtude: data.domaine_etude as string | null,
    reportInitialAel: data.report_initial_ael as number,
    etat: data.etat as EtatMembre,
  }
}
```

- [ ] **Step 2 : Vérifier**

Run : `npx tsc --noEmit`, `npm run lint`, `npm test` (37 tests).
Expected : les trois passent.

- [ ] **Step 3 : Commit**

```bash
git add src/lib/donnees/membres.ts
git commit -m "feat: lire les membres de maniere typee"
```

---

### Task 6 : Écritures — création, modification, archivage

**Files:**
- Create: `src/app/membres/actions.ts`
- Create: `src/app/membres/messages.ts`

**Interfaces:**
- Consumes: `exigerAdministrateur` (Task 1), `normaliserFicheMembre` (Task 3), `clientAdmin` (phase 0)
- Produces:
  - `type EtatFormulaireMembre = { erreur: string | null }`
  - `creerMembre(etat: EtatFormulaireMembre, donnees: FormData): Promise<EtatFormulaireMembre>`
  - `modifierMembre(etat: EtatFormulaireMembre, donnees: FormData): Promise<EtatFormulaireMembre>`
  - `archiverMembre(donnees: FormData): Promise<void>`

- [ ] **Step 1 : Écrire les messages partagés**

Un fichier `'use server'` ne peut exporter que des fonctions asynchrones : les constantes vivent
donc à part. Créer `src/app/membres/messages.ts` :

```typescript
export const MESSAGE_ECHEC_ENREGISTREMENT =
  "La fiche n'a pas pu être enregistrée. Vérifiez les informations saisies."
```

- [ ] **Step 2 : Écrire les actions**

Créer `src/app/membres/actions.ts` :

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { FicheMembreInvalideError, normaliserFicheMembre } from '@/lib/domaine/membre'
import { exigerAdministrateur } from '@/lib/securite/garde'
import { clientAdmin } from '@/lib/supabase/admin'
import { MESSAGE_ECHEC_ENREGISTREMENT } from './messages'

export type EtatFormulaireMembre = { erreur: string | null }

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

export async function creerMembre(
  _etat: EtatFormulaireMembre,
  donnees: FormData,
): Promise<EtatFormulaireMembre> {
  const profil = await exigerAdministrateur()

  let colonnes
  try {
    colonnes = versColonnes(lireFiche(donnees))
  } catch (erreur) {
    return {
      erreur:
        erreur instanceof FicheMembreInvalideError ? erreur.message : MESSAGE_ECHEC_ENREGISTREMENT,
    }
  }

  const { error } = await clientAdmin()
    .from('membres')
    .insert({ ...colonnes, cree_par: profil.id })
  if (error) {
    return { erreur: MESSAGE_ECHEC_ENREGISTREMENT }
  }

  revalidatePath('/membres')
  redirect('/membres')
}

export async function modifierMembre(
  _etat: EtatFormulaireMembre,
  donnees: FormData,
): Promise<EtatFormulaireMembre> {
  await exigerAdministrateur()

  const id = donnees.get('id')
  if (typeof id !== 'string' || id.length === 0) {
    return { erreur: MESSAGE_ECHEC_ENREGISTREMENT }
  }

  let colonnes
  try {
    colonnes = versColonnes(lireFiche(donnees))
  } catch (erreur) {
    return {
      erreur:
        erreur instanceof FicheMembreInvalideError ? erreur.message : MESSAGE_ECHEC_ENREGISTREMENT,
    }
  }

  // `.select('id')` n'est pas décoratif : sans lui, une mise à jour qui ne touche
  // aucune ligne — identifiant inexistant ou forgé — ne renvoie **aucune erreur**,
  // et l'application annoncerait « enregistré » alors que rien ne l'a été.
  const { data, error } = await clientAdmin()
    .from('membres')
    .update(colonnes)
    .eq('id', id)
    .select('id')
  if (error || !data || data.length === 0) {
    return { erreur: MESSAGE_ECHEC_ENREGISTREMENT }
  }

  revalidatePath('/membres')
  revalidatePath(`/membres/${id}`)
  redirect(`/membres/${id}`)
}

export async function archiverMembre(donnees: FormData): Promise<void> {
  await exigerAdministrateur()

  const id = donnees.get('id')
  if (typeof id !== 'string' || id.length === 0) {
    redirect('/membres')
  }

  // Même exigence que pour la modification : une mise à jour sans effet ne renvoie
  // pas d'erreur. Cette action n'a pas de canal de retour vers l'écran, alors plutôt
  // que de rediriger comme si tout allait bien, on lève — un archivage qui n'archive
  // rien doit se voir.
  const { data, error } = await clientAdmin()
    .from('membres')
    .update({ etat: 'archive' })
    .eq('id', id)
    .select('id')
  if (error || !data || data.length === 0) {
    throw new Error("La fiche n'a pas pu être archivée : aucune fiche ne correspond.")
  }

  revalidatePath('/membres')
  redirect('/membres')
}
```

- [ ] **Step 3 : Vérifier**

Run : `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`.
Expected : les quatre passent. Si la construction refuse un export non asynchrone dans un
fichier `'use server'`, c'est qu'une constante y a été laissée : déplacez-la dans `messages.ts`.

- [ ] **Step 4 : Commit**

```bash
git add src/app/membres/actions.ts src/app/membres/messages.ts
git commit -m "feat: creer, modifier et archiver une fiche membre"
```

---

### Task 7 : Annuaire

**Files:**
- Create: `src/app/membres/page.tsx`
- Create: `src/app/error.tsx`
- Modify: `src/app/tableau-de-bord/page.tsx` (lien vers l'annuaire)

**Écran d'erreur, à créer en premier.** Sans lui, la moindre exception affiche l'écran
générique de Next.js, en anglais, dans une application entièrement française. Créer
`src/app/error.tsx` :

```tsx
'use client'

export default function Erreur({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-6">
      <h1 className="text-xl font-semibold">Une erreur est survenue</h1>
      <p className="text-sm text-neutral-600">
        L&apos;opération n&apos;a pas pu aboutir. Réessayez ; si le problème persiste,
        signalez-le à un administrateur.
      </p>
      <button
        type="button"
        onClick={reset}
        className="self-start rounded-md bg-neutral-900 px-4 py-2 font-medium text-white"
      >
        Réessayer
      </button>
    </main>
  )
}
```

Le détail technique de l'erreur n'est volontairement pas affiché : il n'aide pas la
personne devant l'écran et peut révéler la structure interne de l'application.

**Interfaces:**
- Consumes: `exigerProfilActif` (Task 1), `listerMembres` (Task 5), `listerAntennes` (Task 2)
- Produces: la route `/membres`

- [ ] **Step 1 : Écrire l'annuaire**

Créer `src/app/membres/page.tsx` :

```tsx
import Link from 'next/link'
import { listerAntennes } from '@/lib/donnees/antennes'
import { listerMembres } from '@/lib/donnees/membres'
import { rolesDuProfil } from '@/lib/donnees/profils'
import { exigerProfilActif } from '@/lib/securite/garde'

const LIBELLE_SITUATION: Record<string, string> = {
  etudiant: 'Étudiant',
  travailleur: 'Travailleur',
  autre: 'Autre',
}

export default async function PageAnnuaire({
  searchParams,
}: {
  searchParams: Promise<{ recherche?: string; antenne?: string }>
}) {
  const profil = await exigerProfilActif()
  const parametres = await searchParams
  // Le filtre vient de l'adresse, donc du client. Une valeur qui n'est pas un
  // identifiant ferait échouer la requête sur une colonne `uuid` — un signet périmé
  // suffit. On l'ignore plutôt que de faire tomber l'écran.
  const antenneFiltre = /^[0-9a-f-]{36}$/i.test(parametres.antenne ?? '')
    ? parametres.antenne
    : undefined

  const [membres, antennes, roles] = await Promise.all([
    listerMembres({ recherche: parametres.recherche, antenneId: antenneFiltre }),
    listerAntennes(),
    rolesDuProfil(profil.id),
  ])
  const estAdmin = roles.includes('administrateur')

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Annuaire</h1>
          <p className="text-sm text-neutral-500">
            {membres.length} membre{membres.length > 1 ? 's' : ''}
          </p>
        </div>
        {estAdmin ? (
          <Link
            href="/membres/nouveau"
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
          >
            Nouveau membre
          </Link>
        ) : null}
      </header>

      <form className="mb-8 flex flex-wrap gap-3" method="get">
        <input
          name="recherche"
          type="search"
          defaultValue={parametres.recherche ?? ''}
          placeholder="Nom, prénom ou ville"
          aria-label="Rechercher"
          className="min-w-48 flex-1 rounded-md border border-neutral-300 px-3 py-2"
        />
        <select
          name="antenne"
          defaultValue={antenneFiltre ?? ''}
          aria-label="Antenne"
          className="rounded-md border border-neutral-300 px-3 py-2"
        >
          <option value="">Toutes les antennes</option>
          {antennes.map((antenne) => (
            <option key={antenne.id} value={antenne.id}>
              {antenne.nom}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-md border border-neutral-300 px-4 py-2">
          Filtrer
        </button>
      </form>

      {membres.length === 0 ? (
        <p className="text-neutral-600">Aucun membre ne correspond à cette recherche.</p>
      ) : (
        <ul className="divide-y divide-neutral-200">
          {membres.map((membre) => (
            <li key={membre.id}>
              <Link href={`/membres/${membre.id}`} className="flex justify-between gap-4 py-3">
                <span className="font-medium">
                  {membre.prenom} {membre.nom}
                </span>
                <span className="text-sm text-neutral-500">
                  {[membre.antenneNom, membre.ville, membre.situation ? LIBELLE_SITUATION[membre.situation] : null]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
```

- [ ] **Step 2 : Ajouter le lien depuis le tableau de bord**

Dans `src/app/tableau-de-bord/page.tsx`, remplacer le paragraphe annonçant la phase 1 par un
lien vers l'annuaire :

```tsx
      <Link href="/membres" className="underline underline-offset-4">
        Consulter l&apos;annuaire
      </Link>
```

en important `Link` depuis `next/link`.

- [ ] **Step 3 : Vérifier**

Run : `npx tsc --noEmit`, `npm run lint`, `npm run build`.
Expected : les trois passent.

Run : `npm run dev`, se connecter, aller sur `/membres`.
Expected : la page s'affiche avec « Aucun membre ne correspond à cette recherche. » — la table
est vide à ce stade. Le bouton « Nouveau membre » est visible pour le compte racine, qui est
administrateur.

- [ ] **Step 4 : Commit**

```bash
git add src/app/membres/page.tsx src/app/tableau-de-bord/page.tsx
git commit -m "feat: afficher l'annuaire des membres"
```

---

### Task 8 : Formulaire de création

**Files:**
- Create: `src/app/membres/nouveau/page.tsx`
- Create: `src/app/membres/formulaire-membre.tsx`

**Interfaces:**
- Consumes: `exigerAdministrateur` (Task 1), `listerAntennes` (Task 2), `creerMembre` (Task 6)
- Produces: le composant `FormulaireMembre`, réutilisé par la modification (Task 9)

- [ ] **Step 1 : Écrire le formulaire partagé**

Créer `src/app/membres/formulaire-membre.tsx` :

```tsx
'use client'

import { useActionState } from 'react'
import type { Antenne } from '@/lib/donnees/antennes'
import type { MembreDetail } from '@/lib/donnees/membres'
import type { EtatFormulaireMembre } from './actions'

const etatInitial: EtatFormulaireMembre = { erreur: null }

type Props = {
  action: (etat: EtatFormulaireMembre, donnees: FormData) => Promise<EtatFormulaireMembre>
  antennes: Antenne[]
  membre?: MembreDetail
  libelleBouton: string
}

export function FormulaireMembre({ action, antennes, membre, libelleBouton }: Props) {
  const [etat, envoyer, enCours] = useActionState(action, etatInitial)

  // L'antenne actuelle du membre doit figurer dans la liste même si elle a été
  // désactivée depuis. Sans cela, sa valeur n'existerait pas parmi les options : le
  // navigateur retomberait sur « Non rattaché » et le simple fait d'enregistrer une
  // autre modification détacherait le membre de son antenne, sans que personne ne
  // l'ait demandé ni vu.
  const optionsAntennes: Array<{ id: string; nom: string; inactive: boolean }> = [
    ...antennes.map((a) => ({ id: a.id, nom: a.nom, inactive: false })),
  ]
  if (membre?.antenneId && !antennes.some((a) => a.id === membre.antenneId)) {
    optionsAntennes.push({
      id: membre.antenneId,
      nom: membre.antenneNom ?? 'Antenne inconnue',
      inactive: true,
    })
  }

  return (
    <form action={envoyer} className="flex flex-col gap-4">
      {membre ? <input type="hidden" name="id" value={membre.id} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Prénom</span>
          <input
            name="prenom"
            defaultValue={membre?.prenom ?? ''}
            required
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Nom</span>
          <input
            name="nom"
            defaultValue={membre?.nom ?? ''}
            required
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Téléphone</span>
          <input
            name="telephone"
            type="tel"
            defaultValue={membre?.telephone ?? ''}
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Adresse de contact</span>
          <input
            name="emailContact"
            type="email"
            defaultValue={membre?.emailContact ?? ''}
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Ville</span>
          <input
            name="ville"
            defaultValue={membre?.ville ?? ''}
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Pays</span>
          <input
            name="pays"
            defaultValue={membre?.pays ?? ''}
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Antenne</span>
          <select
            name="antenneId"
            defaultValue={membre?.antenneId ?? ''}
            className="rounded-md border border-neutral-300 px-3 py-2"
          >
            <option value="">Non rattaché</option>
            {optionsAntennes.map((antenne) => (
              <option key={antenne.id} value={antenne.id}>
                {antenne.nom}
                {antenne.inactive ? ' (désactivée)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Situation</span>
          <select
            name="situation"
            defaultValue={membre?.situation ?? ''}
            className="rounded-md border border-neutral-300 px-3 py-2"
          >
            <option value="">Non renseignée</option>
            <option value="etudiant">Étudiant</option>
            <option value="travailleur">Travailleur</option>
            <option value="autre">Autre</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Domaine d&apos;étude</span>
          <input
            name="domaineEtude"
            defaultValue={membre?.domaineEtude ?? ''}
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
          <span className="text-xs text-neutral-500">
            Conservé uniquement si la situation est « Étudiant ».
          </span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">AEL déjà suivis</span>
          <input
            name="reportInitialAel"
            type="number"
            min={0}
            step={1}
            defaultValue={membre?.reportInitialAel ?? 0}
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
          <span className="text-xs text-neutral-500">
            Avant la mise en service de l&apos;application.
          </span>
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
        {enCours ? 'Enregistrement…' : libelleBouton}
      </button>
    </form>
  )
}
```

- [ ] **Step 2 : Écrire la page de création**

Créer `src/app/membres/nouveau/page.tsx` :

```tsx
import Link from 'next/link'
import { listerAntennes } from '@/lib/donnees/antennes'
import { exigerAdministrateur } from '@/lib/securite/garde'
import { creerMembre } from '../actions'
import { FormulaireMembre } from '../formulaire-membre'

export default async function PageNouveauMembre() {
  await exigerAdministrateur()
  const antennes = await listerAntennes()

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/membres" className="text-sm underline underline-offset-4">
        Retour à l&apos;annuaire
      </Link>
      <h1 className="mt-4 mb-8 text-2xl font-semibold">Nouveau membre</h1>
      <FormulaireMembre action={creerMembre} antennes={antennes} libelleBouton="Créer la fiche" />
    </main>
  )
}
```

- [ ] **Step 3 : Vérifier**

Run : `npx tsc --noEmit`, `npm run lint`, `npm run build`.
Expected : les trois passent.

Run : `npm run dev`, se connecter, aller sur `/membres/nouveau`, créer une fiche avec prénom et
nom seulement.
Expected : redirection vers `/membres`, la fiche apparaît dans la liste.

Essayer ensuite de créer une fiche avec un prénom vide.
Expected : le navigateur bloque via l'attribut `required`. Retirer temporairement l'attribut dans
les outils de développement et soumettre : le message « Fiche invalide : le champ « prénom » est
obligatoire » s'affiche.

- [ ] **Step 4 : Commit**

```bash
git add src/app/membres/formulaire-membre.tsx src/app/membres/nouveau/page.tsx
git commit -m "feat: ajouter le formulaire de creation d'une fiche membre"
```

---

### Task 9 : Fiche membre et modification

**Files:**
- Create: `src/app/membres/[id]/page.tsx`
- Create: `src/app/membres/[id]/modifier/page.tsx`

**Interfaces:**
- Consumes: `membreParId` (Task 5), `modifierMembre` et `archiverMembre` (Task 6),
  `FormulaireMembre` (Task 8)
- Produces: les routes `/membres/[id]` et `/membres/[id]/modifier`

- [ ] **Step 1 : Écrire la fiche en lecture**

Créer `src/app/membres/[id]/page.tsx` :

```tsx
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { membreParId } from '@/lib/donnees/membres'
import { rolesDuProfil } from '@/lib/donnees/profils'
import { exigerProfilActif } from '@/lib/securite/garde'
import { archiverMembre } from '../actions'

const LIBELLE_SITUATION: Record<string, string> = {
  etudiant: 'Étudiant',
  travailleur: 'Travailleur',
  autre: 'Autre',
}

export default async function PageFicheMembre({ params }: { params: Promise<{ id: string }> }) {
  const profil = await exigerProfilActif()
  const { id } = await params
  const membre = await membreParId(id)
  if (!membre) {
    notFound()
  }

  const roles = await rolesDuProfil(profil.id)
  const estAdmin = roles.includes('administrateur')

  const lignes: Array<[string, string | null]> = [
    ['Antenne', membre.antenneNom],
    ['Ville', membre.ville],
    ['Pays', membre.pays],
    ['Situation', membre.situation ? LIBELLE_SITUATION[membre.situation] : null],
    ["Domaine d'étude", membre.domaineEtude],
    ['Téléphone', membre.telephone],
    ['Contact', membre.emailContact],
    ['AEL déjà suivis', String(membre.reportInitialAel)],
  ]

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/membres" className="text-sm underline underline-offset-4">
        Retour à l&apos;annuaire
      </Link>

      <header className="mt-4 mb-8 flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold">
          {membre.prenom} {membre.nom}
        </h1>
        {estAdmin ? (
          <div className="flex items-center gap-4">
            <Link href={`/membres/${membre.id}/modifier`} className="text-sm underline underline-offset-4">
              Modifier
            </Link>
            <form action={archiverMembre}>
              <input type="hidden" name="id" value={membre.id} />
              <button type="submit" className="text-sm text-red-600 underline underline-offset-4">
                Archiver
              </button>
            </form>
          </div>
        ) : null}
      </header>

      <dl className="divide-y divide-neutral-200">
        {lignes.map(([intitule, valeur]) => (
          <div key={intitule} className="flex justify-between gap-4 py-3">
            <dt className="text-sm text-neutral-500">{intitule}</dt>
            <dd className="text-sm">{valeur ?? '—'}</dd>
          </div>
        ))}
      </dl>
    </main>
  )
}
```

- [ ] **Step 2 : Écrire la page de modification**

Créer `src/app/membres/[id]/modifier/page.tsx` :

```tsx
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { listerAntennes } from '@/lib/donnees/antennes'
import { membreParId } from '@/lib/donnees/membres'
import { exigerAdministrateur } from '@/lib/securite/garde'
import { modifierMembre } from '../../actions'
import { FormulaireMembre } from '../../formulaire-membre'

export default async function PageModifierMembre({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await exigerAdministrateur()
  const { id } = await params
  const [membre, antennes] = await Promise.all([membreParId(id), listerAntennes()])
  if (!membre) {
    notFound()
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href={`/membres/${membre.id}`} className="text-sm underline underline-offset-4">
        Retour à la fiche
      </Link>
      <h1 className="mt-4 mb-8 text-2xl font-semibold">
        Modifier {membre.prenom} {membre.nom}
      </h1>
      <FormulaireMembre
        action={modifierMembre}
        antennes={antennes}
        membre={membre}
        libelleBouton="Enregistrer les modifications"
      />
    </main>
  )
}
```

- [ ] **Step 3 : Vérifier**

Run : `npx tsc --noEmit`, `npm run lint`, `npm run build`.
Expected : les trois passent.

Run : `npm run dev`, puis dérouler :
1. depuis l'annuaire, ouvrir une fiche → les informations s'affichent ;
2. cliquer « Modifier », changer la ville, enregistrer → retour sur la fiche, ville à jour ;
3. mettre la situation à « Étudiant » et renseigner un domaine d'étude → il apparaît sur la fiche ;
4. repasser la situation à « Travailleur » → le domaine d'étude disparaît de la fiche ;
5. cliquer « Archiver » → retour à l'annuaire, la fiche n'y figure plus ;
6. **le cas de l'antenne désactivée** : rattacher un membre à une antenne, désactiver
   cette antenne depuis `/antennes` (écran créé à la Task 10 — si elle n'existe pas encore,
   passer `actif` à faux directement avec la clé de service), puis rouvrir le formulaire de
   modification de ce membre. L'antenne doit apparaître dans la liste, suivie de
   « (désactivée) », et rester sélectionnée. Enregistrer sans y toucher : **le membre doit
   conserver son antenne**. C'est le piège que ce formulaire est conçu pour éviter.

Rapporter ce qui est réellement observé à chaque étape.

- [ ] **Step 4 : Commit**

```bash
git add "src/app/membres/[id]/page.tsx" "src/app/membres/[id]/modifier/page.tsx"
git commit -m "feat: consulter et modifier une fiche membre"
```

---

### Task 10 : Gestion des antennes

**Files:**
- Create: `src/app/antennes/actions.ts`
- Create: `src/app/antennes/formulaire-antenne.tsx`
- Create: `src/app/antennes/page.tsx`

**Interfaces:**
- Consumes: `exigerAdministrateur` (Task 1), `listerAntennes` (Task 2), `clientAdmin` (phase 0)
- Produces:
  - `type EtatAntenne = { erreur: string | null }`
  - `creerAntenne(etat: EtatAntenne, donnees: FormData): Promise<EtatAntenne>`
  - `desactiverAntenne(donnees: FormData): Promise<void>`

- [ ] **Step 1 : Écrire les actions**

Créer `src/app/antennes/actions.ts` :

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { exigerAdministrateur } from '@/lib/securite/garde'
import { clientAdmin } from '@/lib/supabase/admin'

export type EtatAntenne = { erreur: string | null }

export async function creerAntenne(
  _etat: EtatAntenne,
  donnees: FormData,
): Promise<EtatAntenne> {
  await exigerAdministrateur()

  const nom = String(donnees.get('nom') ?? '').trim()
  const pays = String(donnees.get('pays') ?? '').trim()
  if (nom.length === 0 || pays.length === 0) {
    return { erreur: 'Le nom et le pays sont obligatoires.' }
  }

  const { error } = await clientAdmin().from('antennes').insert({ nom, pays })
  if (error) {
    // La contrainte d'unicité est le cas de loin le plus probable.
    return { erreur: 'Cette antenne existe déjà, ou n’a pas pu être créée.' }
  }

  revalidatePath('/antennes')
  return { erreur: null }
}

export async function desactiverAntenne(donnees: FormData): Promise<void> {
  await exigerAdministrateur()

  const id = donnees.get('id')
  if (typeof id !== 'string' || id.length === 0) return

  // Désactivation et non suppression : les membres déjà rattachés doivent conserver
  // leur historique. La contrainte `on delete set null` protégerait les données, mais
  // effacerait l'information.
  await clientAdmin().from('antennes').update({ actif: false }).eq('id', id)
  revalidatePath('/antennes')
  revalidatePath('/membres')
}
```

- [ ] **Step 2 : Écrire le formulaire d'ajout**

Un composant client, et non un simple formulaire de Server Component : `creerAntenne` renvoie un
état d'erreur, et seul `useActionState` sait l'afficher. Sans cela, un nom d'antenne en double
échouerait **en silence** — l'utilisateur verrait sa saisie disparaître sans explication.

Créer `src/app/antennes/formulaire-antenne.tsx` :

```tsx
'use client'

import { useActionState } from 'react'
import { creerAntenne, type EtatAntenne } from './actions'

const etatInitial: EtatAntenne = { erreur: null }

export function FormulaireAntenne() {
  const [etat, envoyer, enCours] = useActionState(creerAntenne, etatInitial)

  return (
    <form action={envoyer} className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <input
          name="nom"
          placeholder="Nom"
          required
          aria-label="Nom de l'antenne"
          className="flex-1 rounded-md border border-neutral-300 px-3 py-2"
        />
        <input
          name="pays"
          placeholder="Pays"
          required
          aria-label="Pays de l'antenne"
          className="flex-1 rounded-md border border-neutral-300 px-3 py-2"
        />
        <button
          type="submit"
          disabled={enCours}
          className="rounded-md bg-neutral-900 px-4 py-2 text-white disabled:opacity-50"
        >
          {enCours ? 'Ajout…' : 'Ajouter'}
        </button>
      </div>

      {etat.erreur ? (
        <p role="alert" className="text-sm text-red-600">
          {etat.erreur}
        </p>
      ) : null}
    </form>
  )
}
```

- [ ] **Step 3 : Écrire l'écran**

Créer `src/app/antennes/page.tsx` :

```tsx
import Link from 'next/link'
import { listerAntennes } from '@/lib/donnees/antennes'
import { exigerAdministrateur } from '@/lib/securite/garde'
import { desactiverAntenne } from './actions'
import { FormulaireAntenne } from './formulaire-antenne'

export default async function PageAntennes() {
  await exigerAdministrateur()
  const antennes = await listerAntennes()

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Link href="/tableau-de-bord" className="text-sm underline underline-offset-4">
        Retour au tableau de bord
      </Link>
      <h1 className="mt-4 mb-8 text-2xl font-semibold">Antennes</h1>

      <ul className="mb-10 divide-y divide-neutral-200">
        {antennes.map((antenne) => (
          <li key={antenne.id} className="flex items-center justify-between gap-4 py-3">
            <span>
              {antenne.nom} <span className="text-sm text-neutral-500">· {antenne.pays}</span>
            </span>
            <form action={desactiverAntenne}>
              <input type="hidden" name="id" value={antenne.id} />
              <button type="submit" className="text-sm text-red-600 underline underline-offset-4">
                Désactiver
              </button>
            </form>
          </li>
        ))}
      </ul>

      <h2 className="mb-4 text-lg font-medium">Ajouter une antenne</h2>
      <FormulaireAntenne />
    </main>
  )
}
```

- [ ] **Step 4 : Vérifier**

Run : `npx tsc --noEmit`, `npm run lint`, `npm run build`.
Expected : les trois passent.

Run : `npm run dev`, aller sur `/antennes`.
Expected : les trois antennes d'amorçage apparaissent. Ajouter « Douala / Cameroun » : elle
apparaît dans la liste, et dans le sélecteur du formulaire membre. La désactiver : elle disparaît
des deux.

Essayer enfin d'ajouter une antenne portant un nom déjà pris.
Expected : le message « Cette antenne existe déjà, ou n'a pas pu être créée. » s'affiche —
l'échec ne doit jamais être silencieux.

- [ ] **Step 5 : Commit**

```bash
git add src/app/antennes/actions.ts src/app/antennes/formulaire-antenne.tsx src/app/antennes/page.tsx
git commit -m "feat: gerer les antennes"
```

---

### Task 11 : Tests des politiques RLS des nouvelles tables

**Files:**
- Create: `tests/rls/membres.test.ts`

**Interfaces:**
- Consumes: politiques des Tasks 2 et 4
- Produces: rien de réutilisable

- [ ] **Step 1 : Écrire les tests**

Créer `tests/rls/membres.test.ts` :

```typescript
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { identifiantVersEmail } from '@/lib/domaine/identifiant'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const CLE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const CLE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Tiré à chaque exécution : un mot de passe fixe dans un dépôt public ouvrirait
// tout compte de test qu'une exécution interrompue aurait laissé derrière elle.
const MDP = `Test-${crypto.randomUUID()}`
const IDENT_SIMPLE = 'test.membres.simple'
const NOM_MEMBRE_ACTIF = `ZZTest-actif-${crypto.randomUUID().slice(0, 8)}`
const NOM_MEMBRE_ARCHIVE = `ZZTest-archive-${crypto.randomUUID().slice(0, 8)}`

const admin = createClient(URL, CLE_SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const clientAnonyme = createClient(URL, CLE_ANON, {
  auth: { autoRefreshToken: false, persistSession: false },
})

let idSimple: string
let clientSimple: SupabaseClient
let idMembreActif: string
let idMembreArchive: string

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

async function supprimerMembres() {
  await admin.from('membres').delete().in('nom', [NOM_MEMBRE_ACTIF, NOM_MEMBRE_ARCHIVE])
}

beforeAll(async () => {
  await supprimerCompte(IDENT_SIMPLE)
  await supprimerMembres()

  const { data, error } = await admin.auth.admin.createUser({
    email: identifiantVersEmail(IDENT_SIMPLE),
    password: MDP,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`création impossible : ${error?.message}`)
  idSimple = data.user.id

  const { error: erreurProfil } = await admin
    .from('profils')
    .insert({ id: idSimple, identifiant: IDENT_SIMPLE, nom_affichage: 'Test membres' })
  if (erreurProfil) {
    await admin.auth.admin.deleteUser(idSimple)
    throw new Error(`insertion du profil impossible : ${erreurProfil.message}`)
  }

  const { data: cree, error: erreurMembres } = await admin
    .from('membres')
    .insert([
      { nom: NOM_MEMBRE_ACTIF, prenom: 'Actif', etat: 'actif' },
      { nom: NOM_MEMBRE_ARCHIVE, prenom: 'Archive', etat: 'archive' },
    ])
    .select('id, nom')
  if (erreurMembres || !cree) {
    await admin.auth.admin.deleteUser(idSimple)
    throw new Error(`insertion des membres impossible : ${erreurMembres?.message}`)
  }
  idMembreActif = cree.find((m) => m.nom === NOM_MEMBRE_ACTIF)!.id
  idMembreArchive = cree.find((m) => m.nom === NOM_MEMBRE_ARCHIVE)!.id

  clientSimple = createClient(URL, CLE_ANON, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error: erreurConnexion } = await clientSimple.auth.signInWithPassword({
    email: identifiantVersEmail(IDENT_SIMPLE),
    password: MDP,
  })
  if (erreurConnexion) throw new Error(`connexion impossible : ${erreurConnexion.message}`)
})

afterAll(async () => {
  await supprimerMembres()
  await supprimerCompte(IDENT_SIMPLE)
})

describe('lecture des membres', () => {
  it('un utilisateur actif lit les membres actifs', async () => {
    const { data } = await clientSimple.from('membres').select('nom').eq('id', idMembreActif)
    expect(data).toEqual([{ nom: NOM_MEMBRE_ACTIF }])
  })

  it('un utilisateur non administrateur ne lit pas les fiches archivées', async () => {
    const { data } = await clientSimple.from('membres').select('nom').eq('id', idMembreArchive)
    expect(data).toEqual([])
  })

  it('un visiteur anonyme se voit refuser la lecture des membres', async () => {
    const { data, error } = await clientAnonyme.from('membres').select('id')
    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')
    expect(data).toBeNull()
  })

  it('un visiteur anonyme se voit refuser la lecture des antennes', async () => {
    const { data, error } = await clientAnonyme.from('antennes').select('id')
    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')
    expect(data).toBeNull()
  })

  it('un utilisateur actif lit les antennes', async () => {
    const { data } = await clientSimple.from('antennes').select('nom').eq('nom', 'France')
    expect(data).toEqual([{ nom: 'France' }])
  })
})

describe('écriture refusée par défaut', () => {
  it("un utilisateur ne peut pas créer de membre", async () => {
    const nomIntrus = `ZZTest-intrus-${crypto.randomUUID().slice(0, 8)}`
    const { error } = await clientSimple
      .from('membres')
      .insert({ nom: nomIntrus, prenom: 'Intrus' })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')

    const { data } = await admin.from('membres').select('id').eq('nom', nomIntrus)
    expect(data).toEqual([])
  })

  it('un utilisateur ne peut pas modifier un membre', async () => {
    const { error } = await clientSimple
      .from('membres')
      .update({ ville: 'Piratée' })
      .eq('id', idMembreActif)
      .select()
    expect(error).not.toBeNull()

    const { data } = await admin.from('membres').select('ville').eq('id', idMembreActif).single()
    expect(data!.ville).not.toBe('Piratée')
  })

  it('un utilisateur ne peut pas supprimer un membre', async () => {
    const { error } = await clientSimple.from('membres').delete().eq('id', idMembreActif).select()
    expect(error).not.toBeNull()

    const { data } = await admin.from('membres').select('id').eq('id', idMembreActif).maybeSingle()
    expect(data).not.toBeNull()
  })

  it('un utilisateur ne peut pas créer une antenne', async () => {
    const nomIntrus = `ZZAntenne-${crypto.randomUUID().slice(0, 8)}`
    const { error } = await clientSimple
      .from('antennes')
      .insert({ nom: nomIntrus, pays: 'Nulle part' })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')

    const { data } = await admin.from('antennes').select('id').eq('nom', nomIntrus)
    expect(data).toEqual([])
  })
})

describe('compte désactivé', () => {
  // Ces deux tests sont la seule preuve d'exécution de `prive.est_actif()`. La fonction
  // est `SECURITY DEFINER` — elle échappe volontairement à la RLS — et vérifier sa
  // signature ne prouve rien de sa logique. Ici on la met réellement à l'épreuve, sur
  // les deux tables dont les politiques en dépendent.
  it('un compte désactivé ne lit plus les membres', async () => {
    await admin.from('profils').update({ actif: false }).eq('id', idSimple)
    try {
      const { data } = await clientSimple.from('membres').select('id').eq('id', idMembreActif)
      expect(data).toEqual([])
    } finally {
      await admin.from('profils').update({ actif: true }).eq('id', idSimple)
    }
  })

  it('un compte désactivé ne lit plus les antennes', async () => {
    await admin.from('profils').update({ actif: false }).eq('id', idSimple)
    try {
      const { data } = await clientSimple.from('antennes').select('id')
      expect(data).toEqual([])
    } finally {
      await admin.from('profils').update({ actif: true }).eq('id', idSimple)
    }
  })

  it('un compte réactivé lit de nouveau les membres', async () => {
    // Contrôle positif : sans lui, les deux tests ci-dessus passeraient aussi si la
    // lecture était cassée pour une raison sans rapport avec `actif`.
    const { data } = await clientSimple.from('membres').select('id').eq('id', idMembreActif)
    expect(data).toHaveLength(1)
  })
})
```

- [ ] **Step 2 : Lancer les tests**

Run : `npm run test:rls`
Expected : 22 tests passent — 10 hérités de la phase 0 et 12 nouveaux.

**Si un test échoue, la faille est réelle : corrigez la migration, jamais le test.** En
particulier, si `expect(error!.code).toBe('42501')` échoue, relevez le code réellement obtenu et
arrêtez-vous plutôt que de remplacer la valeur attendue.

- [ ] **Step 3 : Vérifier le nettoyage**

Via l'API Management :

```
$sql = @'
select count(*) as membres_restants from public.membres where nom like 'ZZTest-%' or nom like 'ZZAntenne-%'
'@
```
Expected : `0`. Vérifier aussi que `profils` ne contient plus que `racine` et les fiches
légitimement créées à la main.

- [ ] **Step 4 : Commit**

```bash
git add tests/rls/membres.test.ts
git commit -m "test: verifier les politiques RLS des membres et des antennes"
```

---

### Task 12 : Test de bout en bout de l'annuaire

**Files:**
- Create: `tests/e2e/annuaire.spec.ts`

**Interfaces:**
- Consumes: l'application complète des Tasks 1 à 10
- Produces: rien de réutilisable

- [ ] **Step 1 : Écrire le test**

Créer `tests/e2e/annuaire.spec.ts` :

```typescript
import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'

const IDENTIFIANT = 'test.e2e.annuaire'
const EMAIL = `${IDENTIFIANT}@asonkeng.local`
// Tiré à chaque exécution : jamais de mot de passe littéral dans un dépôt public.
const MDP = `Test-${crypto.randomUUID()}`
const NOM_MEMBRE = `ZZAnnuaire-${crypto.randomUUID().slice(0, 8)}`

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

async function nettoyer() {
  await admin.from('membres').delete().like('nom', 'ZZAnnuaire-%')
  const { data } = await admin.from('profils').select('id').eq('identifiant', IDENTIFIANT).maybeSingle()
  if (data) {
    await admin.auth.admin.deleteUser(data.id)
    return
  }
  const { data: comptes } = await admin.auth.admin.listUsers()
  const orphelin = comptes?.users.find((u) => u.email === EMAIL)
  if (orphelin) await admin.auth.admin.deleteUser(orphelin.id)
}

test.beforeAll(async () => {
  await nettoyer()

  const { data, error } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: MDP,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(error?.message)

  const { error: erreurProfil } = await admin
    .from('profils')
    .insert({ id: data.user.id, identifiant: IDENTIFIANT, nom_affichage: 'Test annuaire' })
  if (erreurProfil) {
    await admin.auth.admin.deleteUser(data.user.id)
    throw new Error(`insertion du profil impossible : ${erreurProfil.message}`)
  }

  const { error: erreurRole } = await admin
    .from('roles_profil')
    .insert({ profil_id: data.user.id, role: 'administrateur' })
  if (erreurRole) {
    await admin.auth.admin.deleteUser(data.user.id)
    throw new Error(`attribution du rôle impossible : ${erreurRole.message}`)
  }
})

test.afterAll(nettoyer)

async function seConnecter(page: import('@playwright/test').Page) {
  await page.goto('/connexion')
  await page.getByLabel('Identifiant').fill(IDENTIFIANT)
  await page.getByLabel('Mot de passe').fill(MDP)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page).toHaveURL(/\/tableau-de-bord/)
}

test("l'annuaire est protégé par la connexion", async ({ page }) => {
  await page.goto('/membres')
  await expect(page).toHaveURL(/\/connexion/)
})

test('un administrateur crée une fiche et la retrouve dans l’annuaire', async ({ page }) => {
  await seConnecter(page)

  await page.goto('/membres/nouveau')
  await page.getByLabel('Prénom').fill('Jérôme')
  await page.getByLabel('Nom').fill(NOM_MEMBRE)
  await page.getByLabel('Ville').fill('Yaoundé')
  await page.getByRole('button', { name: 'Créer la fiche' }).click()

  await expect(page).toHaveURL(/\/membres/)
  await expect(page.getByText(`Jérôme ${NOM_MEMBRE}`)).toBeVisible()

  // La recherche doit retrouver la fiche par sa ville.
  await page.getByLabel('Rechercher').fill('Yaoundé')
  await page.getByRole('button', { name: 'Filtrer' }).click()
  await expect(page.getByText(`Jérôme ${NOM_MEMBRE}`)).toBeVisible()

  // Et ne rien renvoyer pour une recherche qui ne correspond à personne.
  await page.getByLabel('Rechercher').fill('VilleQuiNExistePas')
  await page.getByRole('button', { name: 'Filtrer' }).click()
  await expect(page.getByText('Aucun membre ne correspond à cette recherche.')).toBeVisible()
})

test('une fiche archivée disparaît de l’annuaire', async ({ page }) => {
  await seConnecter(page)

  await page.goto('/membres')
  await page.getByText(`Jérôme ${NOM_MEMBRE}`).click()
  await expect(page.getByRole('heading', { name: `Jérôme ${NOM_MEMBRE}` })).toBeVisible()

  await page.getByRole('button', { name: 'Archiver' }).click()
  await expect(page).toHaveURL(/\/membres/)
  await expect(page.getByText(`Jérôme ${NOM_MEMBRE}`)).toHaveCount(0)
})
```

- [ ] **Step 2 : Lancer les tests**

Run : `npm run test:e2e`
Expected : 6 tests passent — 3 hérités de la phase 0 et 3 nouveaux.

- [ ] **Step 3 : Vérifier le nettoyage**

Via l'API Management, confirmer qu'aucune ligne `membres` dont le nom commence par `ZZAnnuaire-`
ne subsiste, et que `profils` ne contient plus le compte de test.

- [ ] **Step 4 : Commit**

```bash
git add tests/e2e/annuaire.spec.ts
git commit -m "test: couvrir le parcours annuaire de bout en bout"
```

---

### Task 13 : Déploiement et documentation

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: l'application complète
- Produces: la phase 1a en production

- [ ] **Step 1 : Vérifier l'ensemble des suites**

Run, dans l'ordre : `npx tsc --noEmit`, `npm run lint`, `npm test` (37 tests),
`npm run test:rls` (22 tests), `npm run test:e2e` (6 tests), `npm run build`.
Expected : les six passent.

- [ ] **Step 2 : Compléter le README**

Ajouter au README une section décrivant ce que la phase 1a apporte : annuaire des membres,
fiches, antennes, et la règle de sécurité — toute page et toute action passent par
`exigerProfilActif` ou `exigerAdministrateur`, et aucune écriture n'est possible depuis le
navigateur.

- [ ] **Step 3 : Déployer**

```bash
npx vercel --prod
```
Expected : une URL de production est affichée.

- [ ] **Step 4 : Vérifier en production**

Sur l'URL de production : se connecter, atteindre `/membres`, créer une fiche, la retrouver dans
l'annuaire, l'ouvrir, la modifier, l'archiver. Rapporter ce qui est réellement observé.

Vérifier enfin, en récupérant le code JavaScript servi au navigateur, que la signature de la clé
de service en est absente — avec un contrôle positif sur un texte connu, afin de prouver que la
recherche fonctionne.

- [ ] **Step 5 : Commit**

```bash
git add README.md
git commit -m "chore: documenter et deployer la phase 1a"
```

---

## Critères d'achèvement de la phase 1a

- [ ] `npm test` passe — 37 tests, dont 22 sur la validation des fiches
- [ ] `npm run test:rls` passe — 22 tests, dont 12 sur les membres et les antennes
- [ ] `npm run test:e2e` passe — 6 tests
- [ ] `npm run build` passe sans erreur
- [ ] La requête sur `pg_policies` ne renvoie **que** des politiques `SELECT`
- [ ] Toute page et toute Server Action de l'application passe par `exigerProfilActif` ou
      `exigerAdministrateur` — vérifiable par recherche : aucun appel direct à `profilCourant`
      ne subsiste hors de `garde.ts`
- [ ] Un compte non administrateur ne voit ni le bouton « Nouveau membre », ni « Modifier », ni
      « Archiver », et se voit renvoyé s'il atteint ces routes directement
- [ ] En production : création, consultation, modification et archivage d'une fiche fonctionnent
- [ ] La clé de service est absente du code servi au navigateur, contrôle positif à l'appui
