# Phase 1c — arborescence, portée d'autorité et comptes : plan d'implémentation

> **Pour les agents implémenteurs :** COMPÉTENCE OBLIGATOIRE — utiliser
> `superpowers:subagent-driven-development` (recommandé) ou
> `superpowers:executing-plans` pour exécuter ce plan tâche par tâche. Les étapes
> emploient la syntaxe à cases (`- [ ]`) pour le suivi.

**But :** mettre en service l'arborescence faiseur de disciple / dirigeant, en tirer la
portée d'autorité du §5.1 de la spécification maîtresse, et livrer l'écran de gestion des
comptes sans lequel cette portée resterait vide.

**Architecture :** les colonnes d'arborescence existent depuis la 1a et ne sont alimentées
par rien. Ce plan ajoute (1) un garde-fou anti-cycle à deux barrières — passerelle sérialisée
par verrou consultatif, plus déclencheur — comme l'exclusivité des statuts en 1b ; (2) des
fonctions de parcours récursives `security definer`, affranchies de la RLS ; (3) des
fonctions de domaine **pures** pour le dirigeant proposé et la portée d'autorité ; (4) un
écran de gestion des comptes qui rend la portée d'autorité exerçable, donc prouvable.

**Pile technique :** Next.js 16 (App Router, Server Actions), TypeScript, Supabase
(Postgres + Auth), Tailwind, Vitest, Playwright.

**Documents de référence :**
- `docs/superpowers/specs/2026-08-12-phase-1c-design.md` — le design de cette phase, ses
  décisions D17 à D21 et ses pièges connus.
- `docs/superpowers/specs/2026-08-11-suivi-asonkeng-design.md` — la spécification maîtresse,
  en particulier §4.2 (modèle), §5 (rôles et autorisations), §7 (gestion des erreurs),
  §8 (stratégie de test).

---

## Contraintes globales

Ces règles s'appliquent à **chaque** tâche. Elles ne sont pas répétées tâche par tâche.

1. **Un seul projet Supabase sert au développement et à la production.** Les migrations sont
   strictement **additives**. **Ne jamais exécuter `supabase db reset`.** Ne jamais modifier
   une migration déjà appliquée : `supabase db push` suit les migrations par version et non
   par contenu — compléter un fichier déjà appliqué ne rejoue rien et laisse le dépôt en
   désaccord silencieux avec la base.
2. **Pousser sur `main` déploie en production.** Aucune intégration continue n'existe. Les
   **six portes** doivent être vertes avant tout commit : `npx tsc --noEmit`, `npm run lint`,
   `npm test`, `npm run test:rls`, `npm run test:e2e`, `npm run build`.
3. **Ne stager que ses propres fichiers.** Jamais `git add -A`.
4. **Aucune commande à portée globale sur les processus.** Pour arrêter un serveur, viser son
   PID précis, après avoir vérifié que ce PID est bien le processus visé.
5. **Apostrophes :** pour tout texte français contenant une apostrophe, écrire la chaîne
   entre **guillemets doubles** avec une **apostrophe droite** (`'`). Jamais d'apostrophe
   typographique (`’`) dans `src/`. En JSX, employer `&apos;` dans le texte rendu.
6. **Toute vérification par recherche exige un CONTRÔLE POSITIF.** Prouver que la méthode de
   recherche trouve quelque chose de connu avant de conclure d'une absence.
7. **Tout test protégeant une barrière exige une PREUVE PAR MUTATION.** Casser la barrière,
   constater que le test tombe *et pour la bonne raison*, restaurer, vérifier l'empreinte du
   fichier restauré.
8. **Ne jamais discriminer une erreur Postgres sur le texte français de son message.**
   Toujours sur `error.code` ou sur le marqueur `error.details` posé par `using detail`.
9. **Aucune écriture depuis le navigateur.** Toute mutation passe par une Server Action
   derrière un garde de `src/lib/securite/garde.ts`. Aucune politique RLS d'écriture.
10. **Une trace serveur systématique sur tout échec** (`console.error` avec `code`, `details`,
    `message`), y compris pour les cas classifiés. Un administrateur qui signale « ça ne
    marche pas » doit trouver quelque chose d'exploitable dans les journaux.
11. **Vérifier depuis chaque rôle.** Tout écran à visibilité différenciée se vérifie depuis un
    compte administrateur **et** depuis un compte ordinaire. La 1b a livré un défaut critique
    parce que neuf points avaient été vérifiés depuis le seul rôle que le défaut épargnait.
12. **Un texte d'aide ne vit jamais dans un `<label>`** — il serait concaténé au nom
    accessible du champ. Champ sans aide : `<label>` enveloppant. Champ avec aide :
    `htmlFor` explicite, aide sortie du label et rattachée par `aria-describedby`.
13. **Nettoyer les données de test** créées en base, et vérifier le nettoyage par comptage.
    Préfixer tout membre de test par `ZZ` et tout compte de test par `test.`.

---

## Structure des fichiers

**Migrations** (toutes nouvelles, additives) :

| Fichier | Responsabilité |
|---|---|
| `supabase/migrations/20260814100000_arbre_anti_cycle.sql` | `prive.est_ancetre`, déclencheur anti-cycle, passerelle `public.definir_arbre` sérialisée |
| `supabase/migrations/20260814110000_parcours_arbre.sql` | `public.ancetres_membre`, `public.chemin_arbre` |
| `supabase/migrations/20260814120000_archivage_faiseur_de_disciple.sql` | déclencheur bloquant l'archivage d'un faiseur de disciple |
| `supabase/migrations/20260814130000_passerelles_comptes.sql` | `public.definir_roles`, protection du dernier administrateur, sérialisée |

**Domaine** (fonctions pures, sans accès base) :

| Fichier | Responsabilité |
|---|---|
| `src/lib/domaine/arbre.ts` | `dirigeantPropose`, `peutModifier` |
| `src/lib/domaine/arbre.test.ts` | leurs tests unitaires |

**Données** (lectures, `server-only`) :

| Fichier | Responsabilité |
|---|---|
| `src/lib/donnees/arbre.ts` | `ancetresDeMembre`, `cheminArbre`, `rechercherMembres`, `disciplesDe`, `maillonArbre` |
| `src/lib/donnees/comptes.ts` | `listerComptes`, `compteParId` |

**Sécurité :**

| Fichier | Responsabilité |
|---|---|
| `src/lib/securite/garde.ts` (modifié) | ajout de `exigerAutoriteSur(membreId)` |

**Écrans :**

| Fichier | Responsabilité |
|---|---|
| `src/app/membres/selecteur-membre.tsx` | composant client, recherche serveur, valeur en champ caché |
| `src/app/membres/[id]/arbre/page.tsx` | écran de rattachement (faiseur de disciple, dirigeant) |
| `src/app/membres/[id]/arbre/formulaire-arbre.tsx` | son formulaire client |
| `src/app/membres/[id]/arbre/actions.ts` | `definirArbre` |
| `src/app/membres/[id]/arbre/messages.ts` | ses messages d'erreur |
| `src/app/membres/[id]/page.tsx` (modifié) | affichage de la filiation et des disciples |
| `src/app/membres/page.tsx` (modifié) | pagination |
| `src/app/comptes/page.tsx` | écran des comptes |
| `src/app/comptes/actions.ts` | créer, lier, activer, rôles, réinitialiser |
| `src/app/comptes/messages.ts` | ses messages d'erreur |
| `src/app/comptes/formulaire-compte.tsx` | création d'un compte |
| `src/app/comptes/ligne-compte.tsx` | une ligne du tableau, avec ses actions |

**Tests :**

| Fichier | Responsabilité |
|---|---|
| `tests/rls/arbre.test.ts` | politiques et passerelles de l'arbre |
| `tests/rls/comptes.test.ts` | politiques et passerelles des comptes |
| `tests/e2e/arbre.spec.ts` | rattachement, cycle refusé, archivage bloqué |
| `tests/e2e/autorite.spec.ts` | portée d'autorité, requêtes forgées, canari |

**Pourquoi un écran `/membres/[id]/arbre` séparé et non des champs de plus dans
`formulaire-membre.tsx` :** ce formulaire porte déjà 9 champs et sert la création comme la
modification. Le rattachement a sa propre logique interactive (recherche serveur, proposition
du dirigeant recalculée à chaque changement), ses propres erreurs (cycle, membre inconnu) et
son propre garde. Les mêler produirait un composant que personne ne peut tenir en tête, et
une action qui ferait deux choses sans rapport. Même découpage que `/membres/[id]/statuts`,
qui a fait ses preuves en 1b.

---

## Partie A — arborescence et échelle

### Task 1 : garde-fou anti-cycle, à deux barrières

**Fichiers :**
- Créer : `supabase/migrations/20260814100000_arbre_anti_cycle.sql`
- Créer : `tests/rls/arbre.test.ts`

**Interfaces :**
- Produit : `prive.est_ancetre(p_candidat uuid, p_membre uuid) returns boolean` ;
  `public.definir_arbre(p_membre uuid, p_faiseur_de_disciple uuid, p_dirigeant uuid,
  p_dirigeant_force boolean) returns void`, `execute` réservé à `service_role` ;
  marqueurs d'erreur `'cycle_faiseur_de_disciple'`, `'membre_inconnu'`,
  `'faiseur_inconnu'`, `'dirigeant_inconnu'`.

**Ce que cette tâche protège, et pourquoi deux barrières.** Un déclencheur décide sur l'état
**validé** qu'il voit. Deux administrateurs qui réassignent en même temps — A place X sous Y
pendant que B place Y sous X — ne voient pas la transaction l'un de l'autre : chacun conclut
« pas de cycle », les deux valident, et le cycle naît de leur conjonction. C'est exactement le
défaut que la revue de la Task 2 de la 1b avait trouvé sur l'exclusivité des statuts. Le
verrou consultatif sérialise les modifications d'arbre ; le déclencheur reste la barrière de
dernier recours pour toute écriture directe.

- [ ] **Étape 1 : écrire la migration**

Créer `supabase/migrations/20260814100000_arbre_anti_cycle.sql` :

```sql
-- Garde-fou anti-cycle de l'arbre des faiseurs de disciple (spec §4.2, §7).
-- Les colonnes existent depuis 20260812120000_membres.sql, qui annonçait déjà ce
-- déclencheur ; seules les contraintes CHECK « pas son propre faiseur de disciple »
-- y étaient posées, et elles ne couvrent que les cycles de longueur 1.

-- 1. Brique commune : `p_candidat` est-il un ancêtre de `p_membre` ?
--    `security definer` (design 1c, D19) : sous RLS, une fiche archivée est invisible
--    d'un non-administrateur, et la remontée s'arrêterait dessus — elle rétrécirait la
--    portée d'autorité sans erreur ni trace. L'autorité suit l'arbre, pas la visibilité.
--
--    La borne de profondeur n'est pas décorative. Elle est la seule protection restante
--    si une donnée corrompue franchissait un jour les barrières : sans elle, un cycle en
--    base transforme cette fonction en boucle infinie, donc en indisponibilité totale.
create or replace function prive.est_ancetre(p_candidat uuid, p_membre uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with recursive chaine as (
    select m.id, m.faiseur_de_disciple_id, 0 as profondeur
    from public.membres m
    where m.id = p_membre
    union all
    select m.id, m.faiseur_de_disciple_id, c.profondeur + 1
    from public.membres m
    join chaine c on m.id = c.faiseur_de_disciple_id
    where c.profondeur < 64
  )
  select exists (
    select 1 from chaine c where c.faiseur_de_disciple_id = p_candidat
  );
$$;

comment on function prive.est_ancetre(uuid, uuid) is
  'Vrai si p_candidat figure parmi les ancêtres de p_membre dans l''arbre des faiseurs de disciple. Parcours borné à 64 niveaux.';

revoke execute on function prive.est_ancetre(uuid, uuid) from public, anon, authenticated;

-- 2. Déclencheur : barrière de dernier recours, y compris pour une écriture directe.
create or replace function prive.refuser_cycle_faiseur_de_disciple()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.faiseur_de_disciple_id is null then
    return new;
  end if;

  -- Déjà couvert par la contrainte CHECK membres_pas_son_propre_fdd, répété ici pour
  -- que le marqueur d'erreur soit le même quelle que soit la longueur du cycle : sans
  -- cela, l'application devrait reconnaître DEUX signaux pour une seule idée.
  if new.faiseur_de_disciple_id = new.id then
    raise exception 'Un membre ne peut pas être son propre faiseur de disciple.'
      using detail = 'cycle_faiseur_de_disciple';
  end if;

  -- Le faiseur de disciple proposé ne doit pas descendre du membre lui-même.
  -- Sur un UPDATE, `est_ancetre` lit l'état validé, où la ligne porte encore son
  -- ANCIEN faiseur de disciple : remonter depuis le faiseur proposé et retomber sur
  -- `new.id` est exactement la condition qui fermerait le cycle.
  if prive.est_ancetre(new.id, new.faiseur_de_disciple_id) then
    raise exception 'Ce rattachement créerait un cycle dans l''arbre des faiseurs de disciple.'
      using detail = 'cycle_faiseur_de_disciple';
  end if;

  return new;
end;
$$;

create trigger membres_anti_cycle
  before insert or update of faiseur_de_disciple_id on public.membres
  for each row execute function prive.refuser_cycle_faiseur_de_disciple();

-- 3. Passerelle applicative, sérialisée.
create or replace function public.definir_arbre(
  p_membre uuid,
  p_faiseur_de_disciple uuid,
  p_dirigeant uuid,
  p_dirigeant_force boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- PREMIÈRE instruction, avant toute lecture : voir l'en-tête de cette migration.
  -- Clé (20260814, 1) = arbre. La clé (20260814, 2) est réservée aux rôles.
  perform pg_advisory_xact_lock(20260814, 1);

  perform 1 from public.membres m where m.id = p_membre for update;
  if not found then
    raise exception 'Membre inconnu.' using detail = 'membre_inconnu';
  end if;

  if p_faiseur_de_disciple is not null then
    perform 1 from public.membres m where m.id = p_faiseur_de_disciple;
    if not found then
      raise exception 'Faiseur de disciple inconnu.' using detail = 'faiseur_inconnu';
    end if;
  end if;

  if p_dirigeant is not null then
    perform 1 from public.membres m where m.id = p_dirigeant;
    if not found then
      raise exception 'Dirigeant inconnu.' using detail = 'dirigeant_inconnu';
    end if;
  end if;

  -- Affectation DIRECTE et non `coalesce` : contrairement à `attribuer_statut`, un
  -- `null` veut dire ici « détacher », pas « ne change pas ». Détacher un membre pour
  -- en faire une racine de l'arbre est une opération légitime et prévue par la spec
  -- (« NULL pour les racines de l'arbre »). Le `coalesce` de la 1b avait justement
  -- rendu l'effacement volontaire impossible ; on ne reproduit pas ce choix là où
  -- l'effacement est un usage normal.
  update public.membres
     set faiseur_de_disciple_id = p_faiseur_de_disciple,
         dirigeant_id = p_dirigeant,
         dirigeant_force = p_dirigeant_force
   where id = p_membre;
end;
$$;

revoke execute on function public.definir_arbre(uuid, uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.definir_arbre(uuid, uuid, uuid, boolean) to service_role;
```

- [ ] **Étape 2 : appliquer la migration**

```bash
npx supabase db push --dry-run    # doit annoncer 20260814100000 comme seule manquante
npx supabase db push
npx supabase migration list       # confirmer qu'elle est appliquée des deux côtés
```

- [ ] **Étape 3 : écrire les tests RLS**

Créer `tests/rls/arbre.test.ts`. Ces tests EXERCENT les politiques et les droits plutôt que
de les lire : c'est la seule preuve qui vaille, et l'API Management de Supabase renvoyait 403
en fin de phase 1a.

```typescript
import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const IDENT_SIMPLE = 'test.rls.arbre.simple'
const MDP_SIMPLE = `Test-${crypto.randomUUID()}`
const PREFIXE = `ZZArbre-${crypto.randomUUID().slice(0, 8)}`

let idRacine: string
let idEnfant: string
let idPetitEnfant: string
let clientSimple: ReturnType<typeof createClient>

async function creerMembre(nom: string, faiseurDeDiscipleId: string | null): Promise<string> {
  const { data, error } = await admin
    .from('membres')
    .insert({ nom: `${PREFIXE}-${nom}`, prenom: 'Test', faiseur_de_disciple_id: faiseurDeDiscipleId })
    .select('id')
    .single()
  if (error || !data) throw new Error(`création du membre ${nom} impossible : ${error?.message}`)
  return data.id
}

async function supprimerCompte(identifiant: string) {
  const { data } = await admin.from('profils').select('id').eq('identifiant', identifiant).maybeSingle()
  if (data) {
    await admin.auth.admin.deleteUser(data.id)
    return
  }
  const { data: comptes } = await admin.auth.admin.listUsers()
  const orphelin = comptes?.users.find((u) => u.email === `${identifiant}@asonkeng.local`)
  if (orphelin) await admin.auth.admin.deleteUser(orphelin.id)
}

beforeAll(async () => {
  await admin.from('membres').delete().like('nom', 'ZZArbre-%')
  await supprimerCompte(IDENT_SIMPLE)

  idRacine = await creerMembre('racine', null)
  idEnfant = await creerMembre('enfant', idRacine)
  idPetitEnfant = await creerMembre('petit-enfant', idEnfant)

  const { data, error } = await admin.auth.admin.createUser({
    email: `${IDENT_SIMPLE}@asonkeng.local`,
    password: MDP_SIMPLE,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`création du compte impossible : ${error?.message}`)
  const { error: erreurProfil } = await admin
    .from('profils')
    .insert({ id: data.user.id, identifiant: IDENT_SIMPLE, nom_affichage: 'Test arbre' })
  if (erreurProfil) throw new Error(`insertion du profil impossible : ${erreurProfil.message}`)

  clientSimple = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
  const { error: erreurConnexion } = await clientSimple.auth.signInWithPassword({
    email: `${IDENT_SIMPLE}@asonkeng.local`,
    password: MDP_SIMPLE,
  })
  if (erreurConnexion) throw new Error(`connexion impossible : ${erreurConnexion.message}`)
})

afterAll(async () => {
  // L'ordre compte : les enfants d'abord, `faiseur_de_disciple_id` est en
  // `on delete set null` mais la suppression en vrac par préfixe suffit ici.
  await admin.from('membres').delete().like('nom', 'ZZArbre-%')
  await supprimerCompte(IDENT_SIMPLE)
})

describe('déclencheur anti-cycle', () => {
  it("refuse de faire d'un membre le disciple de son propre disciple", async () => {
    const { error } = await admin
      .from('membres')
      .update({ faiseur_de_disciple_id: idPetitEnfant })
      .eq('id', idRacine)
    expect(error).not.toBeNull()
    expect(error?.details).toBe('cycle_faiseur_de_disciple')
  })

  it("refuse de faire d'un membre son propre faiseur de disciple", async () => {
    const { error } = await admin
      .from('membres')
      .update({ faiseur_de_disciple_id: idEnfant })
      .eq('id', idEnfant)
    expect(error).not.toBeNull()
  })

  // CONTRÔLE POSITIF : sans lui, les deux refus ci-dessus seraient satisfaits par une
  // table qui refuse TOUTE écriture, ce qui ne prouverait rien sur la détection de cycle.
  it('laisse passer un rattachement qui ne ferme aucun cycle', async () => {
    const idAutre = await creerMembre('autre', null)
    const { error } = await admin
      .from('membres')
      .update({ faiseur_de_disciple_id: idRacine })
      .eq('id', idAutre)
    expect(error).toBeNull()
  })
})

describe('passerelle definir_arbre réservée à service_role', () => {
  it('refuse son exécution à un compte authentifié ordinaire', async () => {
    const { error } = await clientSimple.rpc('definir_arbre', {
      p_membre: idPetitEnfant,
      p_faiseur_de_disciple: idRacine,
      p_dirigeant: null,
      p_dirigeant_force: false,
    })
    expect(error).not.toBeNull()
    expect(error?.code).toBe('42501')

    // Et vérifier qu'AUCUNE écriture n'a eu lieu : un refus qui écrirait quand même
    // serait le pire des cas, et le code d'erreur seul ne le dirait pas.
    const { data } = await admin
      .from('membres')
      .select('faiseur_de_disciple_id')
      .eq('id', idPetitEnfant)
      .single()
    expect(data?.faiseur_de_disciple_id).toBe(idEnfant)
  })

  // CONTRÔLE POSITIF : le refus ci-dessus ne prouve rien si la passerelle est cassée
  // pour tout le monde.
  it('laisse la clé de service exécuter la passerelle', async () => {
    const { error } = await admin.rpc('definir_arbre', {
      p_membre: idPetitEnfant,
      p_faiseur_de_disciple: idRacine,
      p_dirigeant: idRacine,
      p_dirigeant_force: true,
    })
    expect(error).toBeNull()

    const { data } = await admin
      .from('membres')
      .select('faiseur_de_disciple_id, dirigeant_id, dirigeant_force')
      .eq('id', idPetitEnfant)
      .single()
    expect(data?.faiseur_de_disciple_id).toBe(idRacine)
    expect(data?.dirigeant_id).toBe(idRacine)
    expect(data?.dirigeant_force).toBe(true)

    // Rétablir, les tests suivants dépendent de la forme de l'arbre.
    await admin.rpc('definir_arbre', {
      p_membre: idPetitEnfant,
      p_faiseur_de_disciple: idEnfant,
      p_dirigeant: null,
      p_dirigeant_force: false,
    })
  })

  it('détache un membre quand le faiseur de disciple passé est null', async () => {
    const idDetachable = await creerMembre('detachable', idRacine)
    const { error } = await admin.rpc('definir_arbre', {
      p_membre: idDetachable,
      p_faiseur_de_disciple: null,
      p_dirigeant: null,
      p_dirigeant_force: false,
    })
    expect(error).toBeNull()

    // Le point exact que `coalesce` aurait cassé : un null doit DÉTACHER, pas
    // « ne rien changer ». Une racine de l'arbre est un état légitime.
    const { data } = await admin
      .from('membres')
      .select('faiseur_de_disciple_id')
      .eq('id', idDetachable)
      .single()
    expect(data?.faiseur_de_disciple_id).toBeNull()
  })

  it('refuse un membre inconnu avec un marqueur stable', async () => {
    const { error } = await admin.rpc('definir_arbre', {
      p_membre: '00000000-0000-0000-0000-000000000000',
      p_faiseur_de_disciple: null,
      p_dirigeant: null,
      p_dirigeant_force: false,
    })
    expect(error).not.toBeNull()
    expect(error?.details).toBe('membre_inconnu')
  })

  it('refuse un faiseur de disciple inconnu avec un marqueur stable', async () => {
    const { error } = await admin.rpc('definir_arbre', {
      p_membre: idPetitEnfant,
      p_faiseur_de_disciple: '00000000-0000-0000-0000-000000000000',
      p_dirigeant: null,
      p_dirigeant_force: false,
    })
    expect(error).not.toBeNull()
    expect(error?.details).toBe('faiseur_inconnu')
  })

  it('refuse le cycle jusque depuis la passerelle', async () => {
    const { error } = await admin.rpc('definir_arbre', {
      p_membre: idRacine,
      p_faiseur_de_disciple: idPetitEnfant,
      p_dirigeant: null,
      p_dirigeant_force: false,
    })
    expect(error).not.toBeNull()
    expect(error?.details).toBe('cycle_faiseur_de_disciple')
  })
})
```

- [ ] **Étape 4 : lancer les tests RLS**

```bash
npm run test:rls
```

Attendu : **49 tests** (41 avant cette tâche + 8 nouveaux), tous verts.

Si le compte a été laissé par une exécution interrompue, le `beforeAll` le nettoie de
lui-même. Si un test échoue sur un membre résiduel, vérifier par
`select nom from membres where nom like 'ZZArbre-%'` et nettoyer.

- [ ] **Étape 5 : PREUVE PAR MUTATION du déclencheur**

Cette étape n'est pas facultative. En 1b, la mutation a trouvé trois défauts qu'aucune revue
de code n'avait vus, tous verts et rassurants.

1. Relever la définition exacte du déclencheur avant d'y toucher :
   ```sql
   select pg_get_triggerdef(oid) from pg_trigger where tgname = 'membres_anti_cycle';
   ```
   Conserver la sortie.
2. Retirer le déclencheur : `drop trigger membres_anti_cycle on public.membres;`
3. Relancer `npm run test:rls`. **Attendu : exactement 2 tests tombent** — les deux refus de
   cycle du bloc « déclencheur anti-cycle » — pendant que le contrôle positif du même bloc
   **reste vert**. Ce dernier point est ce qui prouve que les tests tombent pour la bonne
   raison et non par dégât collatéral.
   Noter que le test « refuse le cycle jusque depuis la passerelle » tombe LUI AUSSI, ce qui
   est correct : la passerelle ne fait pas la détection elle-même, elle la délègue au
   déclencheur. Le compte réel attendu est donc **3 tests tombés**.
4. Recréer le déclencheur à partir de la définition relevée, puis vérifier par un nouveau
   `pg_get_triggerdef` qu'elle est **identique**.
5. Relancer `npm run test:rls` : tout doit repasser au vert.
6. Consigner les sorties réelles des deux exécutions dans le rapport de tâche.

- [ ] **Étape 6 : les six portes, puis commit**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls && npm run test:e2e && npm run build
```

```bash
git add supabase/migrations/20260814100000_arbre_anti_cycle.sql tests/rls/arbre.test.ts
git commit -m "feat: poser le garde-fou anti-cycle de l'arbre des faiseurs de disciple"
```

---

### Task 2 : fonctions de parcours de l'arbre

**Fichiers :**
- Créer : `supabase/migrations/20260814110000_parcours_arbre.sql`
- Modifier : `tests/rls/arbre.test.ts` (ajout d'un bloc)

**Interfaces :**
- Consomme : la forme d'arbre créée par la Task 1.
- Produit : `public.ancetres_membre(p_membre uuid) returns table (membre_id uuid,
  profondeur int)` ; `public.chemin_arbre(p_membre uuid) returns table (membre_id uuid,
  nom text, prenom text, profondeur int)`. Les deux `security definer`, `execute` réservé
  à `service_role`.

**Pourquoi deux fonctions et non une.** `ancetres_membre` sert la **décision d'autorité** : elle
ne renvoie que des identifiants, donc rien qui puisse fuiter si son usage dérivait un jour.
`chemin_arbre` sert l'**explication à l'écran** d'un cycle refusé et porte donc des noms ;
elle n'est appelée que depuis un chemin déjà réservé aux administrateurs. Les fusionner
reviendrait à faire circuler des noms partout où l'on n'a besoin que d'identifiants.

- [ ] **Étape 1 : écrire la migration**

Créer `supabase/migrations/20260814110000_parcours_arbre.sql` :

```sql
-- Parcours de l'arbre, pour la portée d'autorité (spec §5.1) et pour l'affichage du
-- chemin fautif d'un cycle (spec §7).

-- Ancêtres d'un membre, du plus proche au plus lointain. Le membre lui-même est
-- EXCLU : nul n'est son propre ancêtre, et l'inclure donnerait à chacun autorité sur
-- lui-même — ce que la spec ne prévoit pas (§5.1 parle d'ancêtre ou de dirigeant).
create or replace function public.ancetres_membre(p_membre uuid)
returns table (membre_id uuid, profondeur int)
language sql
stable
security definer
set search_path = ''
as $$
  with recursive chaine as (
    select m.id, m.faiseur_de_disciple_id, 0 as profondeur
    from public.membres m
    where m.id = p_membre
    union all
    select m.id, m.faiseur_de_disciple_id, c.profondeur + 1
    from public.membres m
    join chaine c on m.id = c.faiseur_de_disciple_id
    where c.profondeur < 64
  )
  select c.id, c.profondeur from chaine c where c.profondeur > 0 order by c.profondeur;
$$;

comment on function public.ancetres_membre(uuid) is
  'Ancêtres d''un membre dans l''arbre des faiseurs de disciple, du plus proche au plus lointain, le membre lui-même exclu. Parcours borné à 64 niveaux.';

-- Le chemin complet, membre inclus, avec les noms : sert à MONTRER à un administrateur
-- pourquoi un rattachement est refusé.
create or replace function public.chemin_arbre(p_membre uuid)
returns table (membre_id uuid, nom text, prenom text, profondeur int)
language sql
stable
security definer
set search_path = ''
as $$
  with recursive chaine as (
    select m.id, m.nom, m.prenom, m.faiseur_de_disciple_id, 0 as profondeur
    from public.membres m
    where m.id = p_membre
    union all
    select m.id, m.nom, m.prenom, m.faiseur_de_disciple_id, c.profondeur + 1
    from public.membres m
    join chaine c on m.id = c.faiseur_de_disciple_id
    where c.profondeur < 64
  )
  select c.id, c.nom, c.prenom, c.profondeur from chaine c order by c.profondeur;
$$;

revoke execute on function public.ancetres_membre(uuid) from public, anon, authenticated;
revoke execute on function public.chemin_arbre(uuid) from public, anon, authenticated;
grant execute on function public.ancetres_membre(uuid) to service_role;
grant execute on function public.chemin_arbre(uuid) to service_role;
```

- [ ] **Étape 2 : appliquer la migration**

```bash
npx supabase db push --dry-run
npx supabase db push
npx supabase migration list
```

- [ ] **Étape 3 : ajouter le bloc de tests**

Ajouter à `tests/rls/arbre.test.ts`, après le bloc existant :

```typescript
describe("parcours de l'arbre", () => {
  it('remonte les ancêtres du plus proche au plus lointain', async () => {
    const { data, error } = await admin.rpc('ancetres_membre', { p_membre: idPetitEnfant })
    expect(error).toBeNull()
    expect(data).toEqual([
      { membre_id: idEnfant, profondeur: 1 },
      { membre_id: idRacine, profondeur: 2 },
    ])
  })

  it('exclut le membre lui-même', async () => {
    const { data } = await admin.rpc('ancetres_membre', { p_membre: idPetitEnfant })
    const identifiants = (data ?? []).map((l: { membre_id: string }) => l.membre_id)
    expect(identifiants).not.toContain(idPetitEnfant)
  })

  it('renvoie une liste vide pour une racine', async () => {
    const { data, error } = await admin.rpc('ancetres_membre', { p_membre: idRacine })
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('refuse son exécution à un compte authentifié ordinaire', async () => {
    const { error } = await clientSimple.rpc('ancetres_membre', { p_membre: idPetitEnfant })
    expect(error).not.toBeNull()
    expect(error?.code).toBe('42501')
  })

  it("donne le chemin nommé, membre inclus, pour l'affichage", async () => {
    const { data, error } = await admin.rpc('chemin_arbre', { p_membre: idPetitEnfant })
    expect(error).toBeNull()
    expect(data).toHaveLength(3)
    expect(data?.[0].membre_id).toBe(idPetitEnfant)
    expect(data?.[0].profondeur).toBe(0)
    expect(data?.[2].membre_id).toBe(idRacine)
  })
})
```

- [ ] **Étape 4 : ÉPREUVE DE LA BORNE DE PROFONDEUR**

La borne à 64 est la seule protection restante si une donnée corrompue franchissait les
barrières. Une borne jamais exercée est une borne dont on ne sait rien.

1. Créer un cycle **en contournant délibérément le déclencheur**, le temps du test :
   ```sql
   alter table public.membres disable trigger membres_anti_cycle;
   -- remplacer les identifiants par ceux du jeu de test ZZArbre
   update public.membres set faiseur_de_disciple_id = '<idPetitEnfant>' where id = '<idRacine>';
   alter table public.membres enable trigger membres_anti_cycle;
   ```
2. Appeler `select * from public.ancetres_membre('<idPetitEnfant>');`.
   **Attendu : la requête TERMINE**, en renvoyant au plus 64 lignes. Si elle ne termine pas,
   la borne est mal écrite — c'est précisément ce que cette étape existe pour découvrir.
3. Défaire le cycle :
   ```sql
   update public.membres set faiseur_de_disciple_id = null where id = '<idRacine>';
   ```
4. Vérifier que le déclencheur est bien réactivé :
   ```sql
   select tgenabled from pg_trigger where tgname = 'membres_anti_cycle';
   ```
   `tgenabled` doit valoir `O`. **Ne pas passer à l'étape suivante tant que ce n'est pas
   le cas** : laisser un déclencheur désactivé en production serait pire que le défaut
   qu'il protège.
5. Relancer `npm run test:rls` : tout vert.

- [ ] **Étape 5 : les six portes, puis commit**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls && npm run test:e2e && npm run build
```

Attendu pour `test:rls` : **54 tests** (49 + 5).

```bash
git add supabase/migrations/20260814110000_parcours_arbre.sql tests/rls/arbre.test.ts
git commit -m "feat: ajouter les fonctions de parcours de l'arbre des faiseurs de disciple"
```

---

### Task 3 : le domaine — dirigeant proposé

**Fichiers :**
- Créer : `src/lib/domaine/arbre.ts`
- Créer : `src/lib/domaine/arbre.test.ts`

**Interfaces :**
- Produit : `type MaillonArbre = { id: string; faiseurDeDiscipleId: string | null }` ;
  `dirigeantPropose(faiseurDeDisciple: MaillonArbre | null): string | null`.

**La règle, copiée du §4.2 de la spécification maîtresse :**

```
dirigeant_propose(M) =
    si M.faiseur_de_disciple est NULL          → NULL
    sinon si M.faiseur_de_disciple.faiseur_de_disciple est NULL → M.faiseur_de_disciple
    sinon                                       → M.faiseur_de_disciple.faiseur_de_disciple
```

En clair : on remonte de deux crans, et l'on s'arrête au premier obstacle. La fonction ne
prend donc pas le membre, mais **son faiseur de disciple** — c'est la seule information dont
elle a besoin, et la lui passer évite de charger la fiche entière pour lire deux champs.

- [ ] **Étape 1 : écrire les tests, qui doivent échouer**

Créer `src/lib/domaine/arbre.test.ts` :

```typescript
import { describe, expect, it } from 'vitest'
import { dirigeantPropose } from './arbre'

describe('dirigeantPropose', () => {
  it("ne propose rien quand le membre n'a pas de faiseur de disciple", () => {
    expect(dirigeantPropose(null)).toBeNull()
  })

  it('propose le faiseur de disciple lui-même quand celui-ci est une racine', () => {
    expect(dirigeantPropose({ id: 'fdd', faiseurDeDiscipleId: null })).toBe('fdd')
  })

  it('propose le faiseur de disciple du faiseur de disciple sur une chaîne plus longue', () => {
    expect(dirigeantPropose({ id: 'fdd', faiseurDeDiscipleId: 'grand-pere' })).toBe('grand-pere')
  })

  // La règle s'arrête à deux crans : elle ne remonte JAMAIS jusqu'à la racine d'une
  // chaîne profonde. Sans ce test, une implémentation « remonter jusqu'en haut »
  // passerait les trois cas précédents et serait fausse partout ailleurs.
  it('ne remonte pas au-delà de deux crans sur une chaîne profonde', () => {
    expect(dirigeantPropose({ id: 'fdd', faiseurDeDiscipleId: 'arriere-grand-pere' })).toBe(
      'arriere-grand-pere',
    )
  })
})
```

- [ ] **Étape 2 : lancer les tests et vérifier qu'ils échouent**

```bash
npm test -- arbre
```

Attendu : ÉCHEC, `Failed to resolve import "./arbre"`.

- [ ] **Étape 3 : écrire l'implémentation**

Créer `src/lib/domaine/arbre.ts` :

```typescript
/**
 * Un maillon de l'arbre des faiseurs de disciple : l'identifiant d'un membre et celui
 * de son faiseur de disciple. C'est tout ce dont les règles d'arbre ont besoin.
 */
export type MaillonArbre = {
  id: string
  faiseurDeDiscipleId: string | null
}

/**
 * Dirigeant PROPOSÉ pour un membre, selon la règle du §4.2 de la spécification.
 *
 * Prend le faiseur de disciple du membre, et non le membre : c'est la seule
 * information nécessaire.
 *
 * La règle remonte d'au plus deux crans et ne cherche PAS la racine de la chaîne. Un
 * dirigeant est « un faiseur de disciple qui gère en plus l'ensemble des individus de
 * son arborescence » (glossaire), pas le sommet de l'organisation.
 *
 * La valeur est une PROPOSITION : l'administrateur l'accepte ou la remplace, et
 * `dirigeant_force` enregistre lequel des deux s'est produit. Ce drapeau n'interdit
 * rien — le lire comme une autorisation serait un contresens.
 */
export function dirigeantPropose(faiseurDeDisciple: MaillonArbre | null): string | null {
  if (faiseurDeDisciple === null) {
    return null
  }
  if (faiseurDeDisciple.faiseurDeDiscipleId === null) {
    return faiseurDeDisciple.id
  }
  return faiseurDeDisciple.faiseurDeDiscipleId
}
```

- [ ] **Étape 4 : lancer les tests et vérifier qu'ils passent**

```bash
npm test
```

Attendu : **60 tests** (56 avant cette tâche + 4 nouveaux), tous verts.

- [ ] **Étape 5 : les six portes, puis commit**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls && npm run test:e2e && npm run build
```

```bash
git add src/lib/domaine/arbre.ts src/lib/domaine/arbre.test.ts
git commit -m "feat: calculer le dirigeant propose selon la regle de la specification"
```

---

### Task 4 : la couche données de l'arbre

**Fichiers :**
- Créer : `src/lib/donnees/arbre.ts`
- Modifier : `src/lib/donnees/membres.ts` (extraction du motif de recherche, ajout de
  `rechercherMembres`)

**Interfaces :**
- Consomme : `ancetres_membre`, `chemin_arbre` (Task 2) ; `MaillonArbre` (Task 3).
- Produit :
  - `motifRecherche(recherche: string | undefined): string | null` (exporté de `membres.ts`)
  - `rechercherMembres(terme: string, exclureId?: string): Promise<MembreBref[]>`
  - `type MembreBref = { id: string; nom: string; prenom: string }`
  - `ancetresDeMembre(membreId: string): Promise<string[]>`
  - `cheminArbre(membreId: string): Promise<MembreBref[]>`
  - `disciplesDe(membreId: string): Promise<MembreBref[]>`
  - `maillonArbre(membreId: string): Promise<MaillonArbre | null>`

**Pourquoi extraire `motifRecherche` au lieu de le recopier.** L'échappement PostgREST de
`listerMembres` a coûté un défaut en phase 1a : chercher « St. Etienne » cassait la requête, et
comme l'erreur était ignorée, l'écran annonçait « aucun membre » pour une recherche valide.
Le recopier dans le sélecteur, c'est se donner deux chances de le refaire et une seule de le
corriger.

- [ ] **Étape 1 : extraire le motif de recherche dans `membres.ts`**

Dans `src/lib/donnees/membres.ts`, remplacer le bloc de construction du motif à l'intérieur de
`listerMembres` par un appel à une fonction exportée. Ajouter avant `listerMembres` :

```typescript
/**
 * Traduit un terme saisi en motif `ilike` accepté par PostgREST, ou `null` si le terme
 * ne contient rien d'exploitable.
 *
 * PostgREST réserve `, . : * ( )` dans la valeur d'un filtre. Plutôt que de retenir une
 * liste de caractères à retirer — qui sera incomplète le jour où elle changera — on
 * entoure la valeur de guillemets, forme dans laquelle PostgREST accepte tout, en
 * n'échappant que ce que les guillemets exigent. Sans cela, chercher « St. Etienne »
 * casse la requête, et comme l'erreur était alors ignorée, l'écran annonçait « aucun
 * membre » pour une recherche valide (défaut réel de la phase 1a).
 *
 * Exportée parce que le sélecteur de membre de la phase 1c s'en sert aussi : deux copies
 * de cet échappement, ce serait deux occasions de refaire le même défaut.
 */
export function motifRecherche(recherche: string | undefined): string | null {
  const terme = recherche
    ?.trim()
    .replace(/[\\"]/g, '\\$&') // échapper l'antislash et le guillemet
    .replace(/[%_]/g, '') // neutraliser les jokers de `ilike`
  if (!terme || terme.length === 0) {
    return null
  }
  return `"%${terme}%"`
}
```

Puis, dans `listerMembres`, remplacer :

```typescript
  const recherche = filtres?.recherche?.trim()
  if (recherche) {
    const terme = recherche
      .replace(/[\\"]/g, '\\$&')
      .replace(/[%_]/g, '')
    if (terme.length > 0) {
      const motif = `"%${terme}%"`
      requete = requete.or(`nom.ilike.${motif},prenom.ilike.${motif},ville.ilike.${motif}`)
    }
  }
```

par :

```typescript
  const motif = motifRecherche(filtres?.recherche)
  if (motif) {
    requete = requete.or(`nom.ilike.${motif},prenom.ilike.${motif},ville.ilike.${motif}`)
  }
```

- [ ] **Étape 2 : ajouter `rechercherMembres` dans `membres.ts`**

À la fin de `src/lib/donnees/membres.ts` :

```typescript
export type MembreBref = { id: string; nom: string; prenom: string }

/** Nombre de résultats rendus par le sélecteur. Assez pour choisir, jamais assez pour
 *  ramener un annuaire entier dans une page — la contrainte qui a motivé D18. */
export const LIMITE_SELECTEUR = 20

/**
 * Recherche destinée au sélecteur de membre. Distincte de `listerMembres` : elle ne rend
 * que le strict nécessaire à un choix, elle est bornée, et elle sait s'exclure un membre
 * — celui qu'on est en train de rattacher, qui ne peut pas être son propre faiseur de
 * disciple.
 *
 * Exclure ce seul identifiant N'EST PAS la protection contre les cycles : elle ne couvre
 * que le cycle de longueur 1. Les cycles plus longs sont refusés par le déclencheur et
 * la passerelle (migration 20260814100000). Cette exclusion sert le confort, pas la
 * sûreté, et ne doit jamais être lue comme telle.
 */
export async function rechercherMembres(
  terme: string,
  exclureId?: string,
): Promise<MembreBref[]> {
  const motif = motifRecherche(terme)
  if (!motif) {
    return []
  }

  const supabase = await clientServeur()
  let requete = supabase
    .from('membres')
    .select('id, nom, prenom')
    .eq('etat', 'actif')
    .or(`nom.ilike.${motif},prenom.ilike.${motif}`)
    .order('nom')
    .order('prenom')
    .limit(LIMITE_SELECTEUR)

  if (exclureId) {
    requete = requete.neq('id', exclureId)
  }

  const { data, error } = await requete
  if (error) {
    // Un échec ne doit pas être indistinguable d'un résultat vide : rendre une liste
    // vide ferait croire à l'utilisateur que personne ne porte ce nom.
    throw new Error(`Recherche de membres impossible : ${error.message}`)
  }
  return (data ?? []).map((l) => ({
    id: l.id as string,
    nom: l.nom as string,
    prenom: l.prenom as string,
  }))
}
```

- [ ] **Étape 3 : écrire `src/lib/donnees/arbre.ts`**

```typescript
import 'server-only'
import type { MaillonArbre } from '@/lib/domaine/arbre'
import { clientAdmin } from '@/lib/supabase/admin'
import { clientServeur } from '@/lib/supabase/serveur'
import type { MembreBref } from './membres'

/**
 * Ancêtres d'un membre, du plus proche au plus lointain.
 *
 * Appelée avec la CLÉ DE SERVICE, et c'est délibéré (design 1c, D19) : la fonction
 * Postgres est `security definer` et son exécution est réservée à `service_role`. Une
 * remontée soumise à la RLS s'arrêterait sur un ancêtre archivé — invisible d'un
 * non-administrateur — et rétrécirait la portée d'autorité sans erreur ni trace.
 * L'autorité suit l'arbre, pas la visibilité.
 */
export async function ancetresDeMembre(membreId: string): Promise<string[]> {
  const { data, error } = await clientAdmin().rpc('ancetres_membre', { p_membre: membreId })
  if (error) {
    throw new Error(`Lecture des ancêtres impossible : ${error.message}`)
  }

  const lignes = (data ?? []) as Array<{ membre_id?: unknown }>
  return lignes.map((ligne) => {
    // Contrôle de forme, et non décoration. Faute de types `Database` générés, `rpc`
    // rend `any` : si la colonne était un jour renommée, chaque `membre_id` vaudrait
    // `undefined`, la liste d'ancêtres serait pleine de trous, et la portée d'autorité
    // se viderait EN SILENCE. L'échec fermé est la bonne direction ; l'échec silencieux
    // ne l'est pas. Même famille de défaut que le cast de la Task 10 de la 1b.
    if (typeof ligne.membre_id !== 'string' || ligne.membre_id.length === 0) {
      throw new Error(
        "Forme inattendue renvoyée par ancetres_membre : colonne « membre_id » absente ou vide.",
      )
    }
    return ligne.membre_id
  })
}

/** Chemin nommé d'un membre jusqu'à sa racine, membre inclus. Sert à MONTRER un cycle. */
export async function cheminArbre(membreId: string): Promise<MembreBref[]> {
  const { data, error } = await clientAdmin().rpc('chemin_arbre', { p_membre: membreId })
  if (error) {
    throw new Error(`Lecture du chemin impossible : ${error.message}`)
  }
  const lignes = (data ?? []) as Array<{ membre_id: string; nom: string; prenom: string }>
  return lignes.map((l) => ({ id: l.membre_id, nom: l.nom, prenom: l.prenom }))
}

/** Disciples directs d'un membre, encore actifs. Sous RLS : c'est un affichage. */
export async function disciplesDe(membreId: string): Promise<MembreBref[]> {
  const supabase = await clientServeur()
  const { data, error } = await supabase
    .from('membres')
    .select('id, nom, prenom')
    .eq('faiseur_de_disciple_id', membreId)
    .eq('etat', 'actif')
    .order('nom')
    .order('prenom')

  if (error) {
    throw new Error(`Lecture des disciples impossible : ${error.message}`)
  }
  return (data ?? []).map((l) => ({
    id: l.id as string,
    nom: l.nom as string,
    prenom: l.prenom as string,
  }))
}

/** Le strict nécessaire au calcul du dirigeant proposé. */
export async function maillonArbre(membreId: string): Promise<MaillonArbre | null> {
  const supabase = await clientServeur()
  const { data, error } = await supabase
    .from('membres')
    .select('id, faiseur_de_disciple_id')
    .eq('id', membreId)
    .maybeSingle()

  if (error) {
    throw new Error(`Lecture du maillon impossible : ${error.message}`)
  }
  if (!data) {
    return null
  }
  return { id: data.id as string, faiseurDeDiscipleId: data.faiseur_de_disciple_id as string | null }
}
```

- [ ] **Étape 4 : REJOUER LES REQUÊTES CONTRE LA VRAIE BASE**

Cette étape est le seul contrôle capable de voir un nom de colonne faux : ni `tsc`, ni ESLint,
ni les tests unitaires ne lisent l'intérieur d'une chaîne de caractères. Elle a sauvé la
Task 4 de la 1b.

**Copier les `select` et les noms de paramètres DEPUIS LE FICHIER LIVRÉ, jamais depuis ce
plan.** En 1b, le gabarit de cette étape interrogeait `statuts(id, libelle, actif)` là où le
module demandait `..., ordre)` : le contrôle serait passé au vert sans jamais éprouver la clé
de tri — le défaut que l'étape existe pour attraper, reproduit dans l'étape.

Créer `scripts/.tmp-verif/rejouer-arbre.mjs`, l'exécuter, puis **supprimer le dossier** :

```javascript
import { createClient } from '@supabase/supabase-js'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const { data: unMembre } = await admin.from('membres').select('id').limit(1).maybeSingle()
if (!unMembre) throw new Error('Aucun membre en base : créer une fiche avant de rejouer.')

for (const [nom, appel] of [
  ['ancetres_membre', () => admin.rpc('ancetres_membre', { p_membre: unMembre.id })],
  ['chemin_arbre', () => admin.rpc('chemin_arbre', { p_membre: unMembre.id })],
  ['disciplesDe', () => admin.from('membres').select('id, nom, prenom').eq('faiseur_de_disciple_id', unMembre.id).eq('etat', 'actif')],
  ['maillonArbre', () => admin.from('membres').select('id, faiseur_de_disciple_id').eq('id', unMembre.id)],
  ['rechercherMembres', () => admin.from('membres').select('id, nom, prenom').eq('etat', 'actif').limit(20)],
]) {
  const { error } = await appel()
  console.log(`${nom} : ${error ? 'ERREUR ' + error.message : 'OK'}`)
}
```

```bash
npx dotenv -e .env.local -- node scripts/.tmp-verif/rejouer-arbre.mjs
rm -rf scripts/.tmp-verif
```

Attendu : `OK` sur les cinq lignes. Consigner la sortie réelle dans le rapport.

- [ ] **Étape 5 : les six portes, puis commit**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls && npm run test:e2e && npm run build
```

```bash
git add src/lib/donnees/arbre.ts src/lib/donnees/membres.ts
git commit -m "feat: lire l'arbre des faiseurs de disciple depuis la couche donnees"
```

---

### Task 5 : le sélecteur de membre

**Fichiers :**
- Créer : `src/app/membres/selecteur-membre.tsx`
- Créer : `src/app/membres/recherche-action.ts`

**Interfaces :**
- Consomme : `rechercherMembres`, `MembreBref` (Task 4).
- Produit : Server Action `chercherMembres(terme: string, exclureId: string | null):
  Promise<MembreBref[]>` ; composant
  `<SelecteurMembre nom label aide valeur surChoix exclureId />`.

**Le composant est CONTRÔLÉ** — la valeur choisie vit chez son parent, pas chez lui. Ce n'est
pas un raffinement : le formulaire de la Task 6 doit pouvoir **poser lui-même** le dirigeant
proposé dans le second sélecteur quand le faiseur de disciple change. Un composant qui garde
sa valeur pour lui rendrait cette proposition impossible à appliquer.

**Pourquoi une Server Action et non une route d'API.** Le projet n'expose aucune route d'API
et n'écrit jamais depuis le navigateur vers Supabase. Une Server Action garde cette propriété :
la recherche s'exécute côté serveur, derrière un garde, et le navigateur ne reçoit que des
résultats déjà filtrés par la RLS.

- [ ] **Étape 1 : écrire la Server Action de recherche**

Créer `src/app/membres/recherche-action.ts` :

```typescript
'use server'

import { rechercherMembres, type MembreBref } from '@/lib/donnees/membres'
import { exigerProfilActif } from '@/lib/securite/garde'

/**
 * Recherche de membres pour un sélecteur. Derrière `exigerProfilActif` : la lecture de
 * l'annuaire est ouverte à tout compte actif (spec D2), mais pas aux visiteurs — et
 * toute Server Action exportée est appelable depuis le navigateur, donc doit avoir son
 * garde, même quand elle ne fait que lire.
 */
export async function chercherMembres(
  terme: string,
  exclureId: string | null,
): Promise<MembreBref[]> {
  await exigerProfilActif()
  return rechercherMembres(terme, exclureId ?? undefined)
}
```

- [ ] **Étape 2 : écrire le composant**

Créer `src/app/membres/selecteur-membre.tsx` :

```tsx
'use client'

import { useEffect, useId, useRef, useState, useTransition } from 'react'
import type { MembreBref } from '@/lib/donnees/membres'
import { chercherMembres } from './recherche-action'

type Props = {
  /** Nom du champ caché envoyé avec le formulaire. */
  nom: string
  label: string
  aide: string
  /** Valeur courante. Elle vit chez le parent : voir l'encadré de la tâche. */
  valeur: MembreBref | null
  surChoix: (membre: MembreBref | null) => void
  /** Membre à ne jamais proposer — celui qu'on est en train de rattacher. */
  exclureId: string | null
}

const DELAI_FRAPPE_MS = 250

export function SelecteurMembre({ nom, label, aide, valeur, surChoix, exclureId }: Props) {
  const prefixe = useId()
  const idSaisie = `${prefixe}-saisie`
  const idAide = `${prefixe}-aide`

  const [terme, setTerme] = useState('')
  const [resultats, setResultats] = useState<MembreBref[]>([])
  const [enCours, demarrer] = useTransition()
  // Numéro de la dernière recherche lancée. Sans lui, une réponse lente arrivée après
  // une réponse rapide écraserait les résultats du terme le plus récent — l'utilisateur
  // verrait des résultats qui ne correspondent pas à ce qu'il a tapé.
  const dernierAppel = useRef(0)

  useEffect(() => {
    if (terme.trim().length === 0) {
      setResultats([])
      return
    }
    const minuterie = setTimeout(() => {
      const numero = ++dernierAppel.current
      demarrer(async () => {
        const trouves = await chercherMembres(terme, exclureId)
        if (numero === dernierAppel.current) {
          setResultats(trouves)
        }
      })
    }, DELAI_FRAPPE_MS)
    return () => clearTimeout(minuterie)
  }, [terme, exclureId])

  function retenir(membre: MembreBref | null) {
    setTerme('')
    setResultats([])
    surChoix(membre)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <input type="hidden" name={nom} value={valeur?.id ?? ''} />
      <label htmlFor={idSaisie} className="text-sm font-medium">
        {label}
      </label>

      {valeur ? (
        <p className="flex items-center gap-3 text-sm">
          <span className="rounded-md border border-neutral-300 px-3 py-2">
            {valeur.prenom ? `${valeur.prenom} ${valeur.nom}` : valeur.nom}
          </span>
          <button
            type="button"
            onClick={() => retenir(null)}
            className="text-sm underline underline-offset-4"
          >
            Détacher
          </button>
        </p>
      ) : null}

      <input
        id={idSaisie}
        type="search"
        value={terme}
        onChange={(evenement) => setTerme(evenement.target.value)}
        placeholder="Chercher par nom ou prénom"
        aria-describedby={idAide}
        className="rounded-md border border-neutral-300 px-3 py-2"
      />
      <span id={idAide} className="text-xs text-neutral-500">
        {aide}
      </span>

      {enCours ? <p className="text-xs text-neutral-500">Recherche…</p> : null}

      {resultats.length > 0 ? (
        <ul className="divide-y divide-neutral-200 rounded-md border border-neutral-300">
          {resultats.map((membre) => (
            <li key={membre.id}>
              <button
                type="button"
                onClick={() => retenir(membre)}
                className="w-full px-3 py-2 text-left text-sm hover:bg-neutral-50"
              >
                {membre.prenom} {membre.nom}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {/*
        Distinguer « pas encore cherché » de « cherché, rien trouvé ». Sans ce message,
        une recherche sans résultat est indiscernable d'une recherche qui n'est pas
        partie, et l'utilisateur retape indéfiniment le même nom.
      */}
      {!enCours && terme.trim().length > 0 && resultats.length === 0 ? (
        <p className="text-xs text-neutral-500">Aucun membre actif ne correspond.</p>
      ) : null}
    </div>
  )
}
```

- [ ] **Étape 3 : les six portes, puis commit**

Aucun test automatisé à ce stade : le composant n'est encore monté nulle part. Il sera
éprouvé de bout en bout à la Task 6, qui l'utilise.

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls && npm run test:e2e && npm run build
```

```bash
git add src/app/membres/selecteur-membre.tsx src/app/membres/recherche-action.ts
git commit -m "feat: ajouter un selecteur de membre a recherche serveur"
```

---

### Task 6 : l'écran de rattachement

**Fichiers :**
- Créer : `src/app/membres/[id]/arbre/messages.ts`
- Créer : `src/app/membres/[id]/arbre/actions.ts`
- Créer : `src/app/membres/[id]/arbre/formulaire-arbre.tsx`
- Créer : `src/app/membres/[id]/arbre/page.tsx`
- Modifier : `src/lib/donnees/membres.ts` (ajout de `membreBrefParId`)
- Créer : `tests/e2e/arbre.spec.ts`

**Interfaces :**
- Consomme : `SelecteurMembre` (Task 5), `dirigeantPropose` (Task 3), `maillonArbre`,
  `cheminArbre` (Task 4), `definir_arbre` (Task 1).
- Produit : Server Actions `definirArbre(etat, donnees): Promise<EtatArbre>` et
  `proposerDirigeant(faiseurDeDiscipleId: string | null): Promise<MembreBref | null>` ;
  `membreBrefParId(id: string): Promise<MembreBref | null>`.

- [ ] **Étape 1 : ajouter `membreBrefParId` dans `src/lib/donnees/membres.ts`**

```typescript
/** Le strict nécessaire pour afficher un membre choisi dans un sélecteur. */
export async function membreBrefParId(id: string): Promise<MembreBref | null> {
  const supabase = await clientServeur()
  const { data, error } = await supabase
    .from('membres')
    .select('id, nom, prenom')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    throw new Error(`Lecture du membre impossible : ${error.message}`)
  }
  if (!data) {
    return null
  }
  return { id: data.id as string, nom: data.nom as string, prenom: data.prenom as string }
}
```

- [ ] **Étape 2 : écrire les messages**

Créer `src/app/membres/[id]/arbre/messages.ts` :

```typescript
import type { MembreBref } from '@/lib/donnees/membres'

export const MESSAGE_ECHEC_ARBRE = "Le rattachement n'a pas pu être enregistré."
export const MESSAGE_MEMBRE_INCONNU = "Cette fiche n'existe plus."
export const MESSAGE_FAISEUR_INCONNU = "Le faiseur de disciple choisi n'existe plus."
export const MESSAGE_DIRIGEANT_INCONNU = "Le dirigeant choisi n'existe plus."

/**
 * Message d'un cycle refusé, avec le chemin fautif — le §7 de la spécification exige
 * qu'il soit affiché, et non seulement que le refus ait lieu.
 *
 * Sans le chemin, l'administrateur sait qu'il a tort sans savoir pourquoi : dans une
 * arborescence de plusieurs centaines de personnes, retrouver à la main la chaîne qui
 * boucle est hors de portée.
 */
export function messageCycle(chemin: MembreBref[]): string {
  if (chemin.length === 0) {
    return "Ce rattachement créerait un cycle dans l'arbre des faiseurs de disciple."
  }
  const noms = chemin.map((membre) => `${membre.prenom} ${membre.nom}`).join(' → ')
  return `Ce rattachement créerait un cycle dans l'arbre des faiseurs de disciple. Chemin fautif (chaque flèche se lit « a pour faiseur de disciple ») : ${noms}.`
}
```

- [ ] **Étape 3 : écrire les Server Actions**

Créer `src/app/membres/[id]/arbre/actions.ts` :

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { dirigeantPropose } from '@/lib/domaine/arbre'
import { cheminArbre, maillonArbre } from '@/lib/donnees/arbre'
import { membreBrefParId, type MembreBref } from '@/lib/donnees/membres'
import { exigerAdministrateur } from '@/lib/securite/garde'
import { clientAdmin } from '@/lib/supabase/admin'
import {
  MESSAGE_DIRIGEANT_INCONNU,
  MESSAGE_ECHEC_ARBRE,
  MESSAGE_FAISEUR_INCONNU,
  MESSAGE_MEMBRE_INCONNU,
  messageCycle,
} from './messages'

export type EtatArbre = { erreur: string | null }

// Marqueurs posés par `public.definir_arbre` et le déclencheur anti-cycle
// (migration 20260814100000). On discrimine dessus, jamais sur la prose française.
const DETAIL_CYCLE = 'cycle_faiseur_de_disciple'
const DETAIL_MEMBRE_INCONNU = 'membre_inconnu'
const DETAIL_FAISEUR_INCONNU = 'faiseur_inconnu'
const DETAIL_DIRIGEANT_INCONNU = 'dirigeant_inconnu'

function champOuNull(donnees: FormData, champ: string): string | null {
  const valeur = donnees.get(champ)
  return typeof valeur === 'string' && valeur.length > 0 ? valeur : null
}

/**
 * Dirigeant proposé pour un faiseur de disciple donné. Appelée depuis le formulaire à
 * chaque changement, pour que la proposition suive la saisie.
 */
export async function proposerDirigeant(
  faiseurDeDiscipleId: string | null,
): Promise<MembreBref | null> {
  await exigerAdministrateur()

  if (faiseurDeDiscipleId === null) {
    return null
  }
  const maillon = await maillonArbre(faiseurDeDiscipleId)
  const proposeId = dirigeantPropose(maillon)
  if (proposeId === null) {
    return null
  }
  return membreBrefParId(proposeId)
}

export async function definirArbre(
  _etat: EtatArbre,
  donnees: FormData,
): Promise<EtatArbre> {
  await exigerAdministrateur()

  const membreId = champOuNull(donnees, 'membreId')
  if (!membreId) {
    console.error('definirArbre : identifiant du membre manquant dans le formulaire')
    return { erreur: MESSAGE_ECHEC_ARBRE }
  }

  const faiseurId = champOuNull(donnees, 'faiseurDeDiscipleId')
  const dirigeantId = champOuNull(donnees, 'dirigeantId')
  const dirigeantForce = donnees.get('dirigeantForce') === '1'

  const { error } = await clientAdmin().rpc('definir_arbre', {
    p_membre: membreId,
    p_faiseur_de_disciple: faiseurId,
    p_dirigeant: dirigeantId,
    p_dirigeant_force: dirigeantForce,
  })

  if (error) {
    console.error('definirArbre : échec RPC definir_arbre', {
      membreId,
      faiseurId,
      dirigeantId,
      dirigeantForce,
      code: error.code,
      details: error.details,
      message: error.message,
    })

    if (error.details === DETAIL_CYCLE) {
      // Le chemin fautif part du faiseur de disciple PROPOSÉ et remonte : s'il passe
      // par le membre qu'on édite, c'est précisément là que le cycle se refermerait.
      // `faiseurId` ne peut pas être null ici — un détachement ne crée aucun cycle —
      // mais on ne s'appuie pas sur ce raisonnement pour éviter une panne : un `null`
      // rendrait simplement le message générique, jamais une exception.
      const chemin = faiseurId ? await cheminArbre(faiseurId) : []
      return { erreur: messageCycle(chemin) }
    }
    if (error.details === DETAIL_MEMBRE_INCONNU) {
      return { erreur: MESSAGE_MEMBRE_INCONNU }
    }
    if (error.details === DETAIL_FAISEUR_INCONNU) {
      return { erreur: MESSAGE_FAISEUR_INCONNU }
    }
    if (error.details === DETAIL_DIRIGEANT_INCONNU) {
      return { erreur: MESSAGE_DIRIGEANT_INCONNU }
    }
    return { erreur: MESSAGE_ECHEC_ARBRE }
  }

  revalidatePath('/membres')
  revalidatePath(`/membres/${membreId}`)
  revalidatePath(`/membres/${membreId}/arbre`)
  redirect(`/membres/${membreId}`)
}
```

- [ ] **Étape 4 : écrire le formulaire**

Créer `src/app/membres/[id]/arbre/formulaire-arbre.tsx` :

```tsx
'use client'

import { useActionState, useState, useTransition } from 'react'
import type { MembreBref } from '@/lib/donnees/membres'
import { SelecteurMembre } from '../../selecteur-membre'
import { definirArbre, proposerDirigeant, type EtatArbre } from './actions'

const etatInitial: EtatArbre = { erreur: null }

type Props = {
  membreId: string
  faiseurInitial: MembreBref | null
  dirigeantInitial: MembreBref | null
  dirigeantForceInitial: boolean
  propositionInitiale: MembreBref | null
}

export function FormulaireArbre({
  membreId,
  faiseurInitial,
  dirigeantInitial,
  dirigeantForceInitial,
  propositionInitiale,
}: Props) {
  const [etat, envoyer, enCours] = useActionState(definirArbre, etatInitial)
  const [faiseur, setFaiseur] = useState(faiseurInitial)
  const [dirigeant, setDirigeant] = useState(dirigeantInitial)
  const [force, setForce] = useState(dirigeantForceInitial)
  const [proposition, setProposition] = useState(propositionInitiale)
  const [calculEnCours, demarrerCalcul] = useTransition()

  function changerFaiseur(membre: MembreBref | null) {
    setFaiseur(membre)
    demarrerCalcul(async () => {
      const propose = await proposerDirigeant(membre?.id ?? null)
      setProposition(propose)
      // La proposition ne s'impose PAS à un dirigeant défini à la main : l'admin qui a
      // délibérément forcé une valeur ne doit pas la voir disparaître parce qu'il
      // corrige le faiseur de disciple. C'est le sens du drapeau (spec §4.2).
      if (!force) {
        setDirigeant(propose)
      }
    })
  }

  function changerDirigeant(membre: MembreBref | null) {
    setDirigeant(membre)
    // Toucher soi-même à ce champ, c'est forcer. Le bouton ci-dessous est la seule
    // façon de revenir au calcul, et il est toujours offert.
    setForce(true)
  }

  function revenirAuCalcul() {
    setDirigeant(proposition)
    setForce(false)
  }

  return (
    <form action={envoyer} className="flex flex-col gap-6">
      <input type="hidden" name="membreId" value={membreId} />
      <input type="hidden" name="dirigeantForce" value={force ? '1' : '0'} />

      <SelecteurMembre
        nom="faiseurDeDiscipleId"
        label="Faiseur de disciple"
        aide="Laisser vide fait de ce membre une racine de l'arbre."
        valeur={faiseur}
        surChoix={changerFaiseur}
        exclureId={membreId}
      />

      <div className="flex flex-col gap-1.5">
        <SelecteurMembre
          nom="dirigeantId"
          label="Dirigeant"
          aide="Proposé à partir du faiseur de disciple. Vous pouvez en choisir un autre."
          valeur={dirigeant}
          surChoix={changerDirigeant}
          exclureId={membreId}
        />
        <p className="text-xs text-neutral-500">
          {calculEnCours
            ? 'Calcul de la proposition…'
            : force
              ? 'Défini manuellement.'
              : 'Calculé à partir du faiseur de disciple.'}
          {force ? (
            <>
              {' '}
              <button
                type="button"
                onClick={revenirAuCalcul}
                className="underline underline-offset-4"
              >
                Revenir au dirigeant calculé
              </button>
              {proposition ? ` (${proposition.prenom} ${proposition.nom})` : ' (aucun)'}
            </>
          ) : null}
        </p>
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
        {enCours ? 'Enregistrement…' : 'Enregistrer le rattachement'}
      </button>
    </form>
  )
}
```

- [ ] **Étape 5 : écrire la page**

Créer `src/app/membres/[id]/arbre/page.tsx` :

```tsx
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { dirigeantPropose } from '@/lib/domaine/arbre'
import { maillonArbre } from '@/lib/donnees/arbre'
import { membreBrefParId, membreParId } from '@/lib/donnees/membres'
import { exigerAdministrateur } from '@/lib/securite/garde'
import { FormulaireArbre } from './formulaire-arbre'

export default async function PageArbre({ params }: { params: Promise<{ id: string }> }) {
  // Écran d'administration : le garde est la PREMIÈRE instruction, avant toute lecture.
  await exigerAdministrateur()
  const { id } = await params

  const membre = await membreParId(id)
  if (!membre) {
    notFound()
  }

  const maillon = await maillonArbre(membre.id)
  const faiseurId = maillon?.faiseurDeDiscipleId ?? null

  const [faiseur, dirigeant] = await Promise.all([
    faiseurId ? membreBrefParId(faiseurId) : Promise.resolve(null),
    membre.dirigeantId ? membreBrefParId(membre.dirigeantId) : Promise.resolve(null),
  ])

  // Proposition calculée côté serveur au premier rendu, pour que le bouton « revenir
  // au dirigeant calculé » soit utile dès l'arrivée sur l'écran, et pas seulement
  // après avoir touché au faiseur de disciple.
  const maillonFaiseur = faiseurId ? await maillonArbre(faiseurId) : null
  const proposeId = dirigeantPropose(maillonFaiseur)
  const proposition = proposeId ? await membreBrefParId(proposeId) : null

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Link href={`/membres/${membre.id}`} className="text-sm underline underline-offset-4">
        Retour à la fiche
      </Link>
      <h1 className="mt-4 mb-2 text-2xl font-semibold">
        Rattachement de {membre.prenom} {membre.nom}
      </h1>
      <p className="mb-8 text-sm text-neutral-500">
        Le faiseur de disciple place ce membre dans l&apos;arbre. Le dirigeant est proposé à
        partir de lui, et reste modifiable.
      </p>

      <FormulaireArbre
        membreId={membre.id}
        faiseurInitial={faiseur}
        dirigeantInitial={dirigeant}
        dirigeantForceInitial={membre.dirigeantForce}
        propositionInitiale={proposition}
      />
    </main>
  )
}
```

**Attention :** `membreParId` ne renvoie aujourd'hui ni `dirigeantId` ni `dirigeantForce`.
Ajouter les deux colonnes à `COLONNES_DETAIL` et au type `MembreDetail` dans
`src/lib/donnees/membres.ts` :

```typescript
// dans COLONNES_DETAIL, ajouter : dirigeant_id, dirigeant_force
// dans MembreDetail, ajouter :
//   dirigeantId: string | null
//   dirigeantForce: boolean
// dans le mapping de membreParId, ajouter :
//   dirigeantId: data.dirigeant_id as string | null,
//   dirigeantForce: data.dirigeant_force as boolean,
```

- [ ] **Étape 6 : écrire les tests de bout en bout**

Créer `tests/e2e/arbre.spec.ts`. Reprendre les fonctions `supprimerCompte`, `creerCompte` et
`seConnecter` de `tests/e2e/statuts.spec.ts` — les recopier, ce fichier étant indépendant.

```typescript
import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'

test.describe.configure({ mode: 'serial' })

const IDENT_ADMIN = 'test.e2e.arbre.admin'
const MDP_ADMIN = `Test-${crypto.randomUUID()}`
const PREFIXE = `ZZArbreE2E-${crypto.randomUUID().slice(0, 8)}`

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const ALERTE = '[role="alert"]:not(#__next-route-announcer__)'

let idRacine: string
let idEnfant: string
let idPetitEnfant: string

async function creerMembre(suffixe: string, faiseurDeDiscipleId: string | null): Promise<string> {
  const { data, error } = await admin
    .from('membres')
    .insert({ nom: `${PREFIXE}-${suffixe}`, prenom: 'Test', faiseur_de_disciple_id: faiseurDeDiscipleId })
    .select('id')
    .single()
  if (error || !data) throw new Error(`création du membre ${suffixe} impossible : ${error?.message}`)
  return data.id
}

async function supprimerCompte(identifiant: string) {
  const { data } = await admin.from('profils').select('id').eq('identifiant', identifiant).maybeSingle()
  if (data) {
    await admin.auth.admin.deleteUser(data.id)
    return
  }
  const { data: comptes } = await admin.auth.admin.listUsers()
  const orphelin = comptes?.users.find((u) => u.email === `${identifiant}@asonkeng.local`)
  if (orphelin) await admin.auth.admin.deleteUser(orphelin.id)
}

async function nettoyer() {
  await admin.from('membres').delete().like('nom', 'ZZArbreE2E-%')
  await supprimerCompte(IDENT_ADMIN)
}

test.beforeAll(async () => {
  await nettoyer()

  const { data, error } = await admin.auth.admin.createUser({
    email: `${IDENT_ADMIN}@asonkeng.local`,
    password: MDP_ADMIN,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(error?.message)
  const { error: erreurProfil } = await admin
    .from('profils')
    .insert({ id: data.user.id, identifiant: IDENT_ADMIN, nom_affichage: 'Test arbre admin' })
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

  idRacine = await creerMembre('racine', null)
  idEnfant = await creerMembre('enfant', idRacine)
  idPetitEnfant = await creerMembre('petit-enfant', idEnfant)
})

test.afterAll(nettoyer)

async function seConnecter(page: import('@playwright/test').Page) {
  await page.goto('/connexion')
  await page.getByLabel('Identifiant').fill(IDENT_ADMIN)
  await page.getByLabel('Mot de passe', { exact: true }).fill(MDP_ADMIN)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page).toHaveURL(/\/tableau-de-bord/)
}

async function choisirDansSelecteur(
  page: import('@playwright/test').Page,
  label: string,
  terme: string,
  nomComplet: string,
) {
  // Le sélecteur porte son propre champ de recherche, dont le libellé est celui du
  // champ lui-même : c'est ce libellé que l'on vise, pas un placeholder.
  await page.getByLabel(label, { exact: true }).fill(terme)
  await page.getByRole('button', { name: nomComplet }).click()
}

test('un administrateur rattache un membre et le dirigeant est proposé', async ({ page }) => {
  await seConnecter(page)
  await page.goto(`/membres/${idPetitEnfant}/arbre`)

  // L'état initial est déjà rattaché : le dirigeant proposé doit être la racine
  // (faiseur du faiseur), et l'écran doit l'annoncer comme CALCULÉ.
  await expect(page.getByText('Calculé à partir du faiseur de disciple.')).toBeVisible()

  await page.getByRole('button', { name: 'Enregistrer le rattachement' }).click()
  await expect(page).toHaveURL(new RegExp(`/membres/${idPetitEnfant}$`))

  const { data } = await admin
    .from('membres')
    .select('faiseur_de_disciple_id, dirigeant_id, dirigeant_force')
    .eq('id', idPetitEnfant)
    .single()
  expect(data?.faiseur_de_disciple_id).toBe(idEnfant)
  expect(data?.dirigeant_id).toBe(idRacine)
  expect(data?.dirigeant_force).toBe(false)
})

test('un rattachement qui fermerait un cycle est refusé, avec le chemin fautif', async ({ page }) => {
  await seConnecter(page)
  await page.goto(`/membres/${idRacine}/arbre`)

  await choisirDansSelecteur(page, 'Faiseur de disciple', `${PREFIXE}-petit-enfant`, `Test ${PREFIXE}-petit-enfant`)
  await page.getByRole('button', { name: 'Enregistrer le rattachement' }).click()

  const alerte = page.locator(ALERTE)
  await expect(alerte).toContainText('créerait un cycle')
  // Le §7 exige le CHEMIN, pas seulement le refus : sans cette assertion, un message
  // générique passerait et l'exigence serait perdue sans que rien ne le signale.
  await expect(alerte).toContainText(`${PREFIXE}-petit-enfant`)
  await expect(alerte).toContainText(`${PREFIXE}-racine`)

  // Et rien n'a été écrit.
  const { data } = await admin
    .from('membres')
    .select('faiseur_de_disciple_id')
    .eq('id', idRacine)
    .single()
  expect(data?.faiseur_de_disciple_id).toBeNull()
})

test("un compte non administrateur ne peut pas atteindre l'écran de rattachement", async ({ page }) => {
  // Compte ordinaire créé à la volée : l'écran doit rediriger, pas seulement masquer.
  const identifiant = 'test.e2e.arbre.simple'
  const mdp = `Test-${crypto.randomUUID()}`
  await supprimerCompte(identifiant)
  const { data, error } = await admin.auth.admin.createUser({
    email: `${identifiant}@asonkeng.local`,
    password: mdp,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(error?.message)
  await admin.from('profils').insert({ id: data.user.id, identifiant, nom_affichage: 'Test simple' })

  try {
    await page.goto('/connexion')
    await page.getByLabel('Identifiant').fill(identifiant)
    await page.getByLabel('Mot de passe', { exact: true }).fill(mdp)
    await page.getByRole('button', { name: 'Se connecter' }).click()
    await expect(page).toHaveURL(/\/tableau-de-bord/)

    await page.goto(`/membres/${idPetitEnfant}/arbre`)
    await expect(page).toHaveURL(/\/tableau-de-bord/)
  } finally {
    await supprimerCompte(identifiant)
  }
})
```

- [ ] **Étape 7 : VÉRIFICATION MANUELLE PAR RÔLE**

Lancer `npm run dev`, puis, **depuis les deux rôles** (contrainte globale 11) :

1. **Administrateur** — ouvrir `/membres/<id>/arbre` d'un membre ayant un faiseur de disciple
   à deux niveaux. Vérifier : la mention « Calculé à partir du faiseur de disciple. »,
   le dirigeant pré-rempli, le changement de faiseur qui met à jour la proposition, le
   passage à « Défini manuellement. » dès qu'on touche au dirigeant, et le retour au calcul.
2. **Non-administrateur** — se connecter avec un compte sans rôle et naviguer **directement**
   par l'URL vers `/membres/<id>/arbre`. Vérifier la redirection **à l'écran**, et non la
   déduire du garde.

Arrêter le serveur en visant son PID précis.

- [ ] **Étape 8 : les six portes, puis commit**

Attendu pour `test:e2e` : **19 tests** (16 + 3).

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls && npm run test:e2e && npm run build
```

```bash
git add "src/app/membres/[id]/arbre" src/lib/donnees/membres.ts tests/e2e/arbre.spec.ts
git commit -m "feat: rattacher un membre a son faiseur de disciple et a son dirigeant"
```

---

### Task 7 : afficher la filiation et les disciples sur la fiche

**Fichiers :**
- Modifier : `src/app/membres/[id]/page.tsx`

**Interfaces :**
- Consomme : `disciplesDe`, `membreBrefParId` (Tasks 4 et 6).

**Décision D20 :** la filiation est visible de **tout compte actif** ; seule sa modification
est réservée aux administrateurs. Le lien « Rattacher » n'apparaît donc que pour un
administrateur — la leçon de la 1b sur le libellé « Gérer » vaut ici : ne pas promettre à
quelqu'un un pouvoir qu'il n'a pas sur l'écran d'arrivée.

- [ ] **Étape 1 : charger les données**

Dans `src/app/membres/[id]/page.tsx`, remplacer le bloc `Promise.all` existant par :

```tsx
  const [roles, statuts, disciples, faiseur, dirigeant] = await Promise.all([
    rolesDuProfil(profil.id),
    statutsDuMembre(membre.id),
    disciplesDe(membre.id),
    membre.faiseurDeDiscipleId
      ? membreBrefParId(membre.faiseurDeDiscipleId)
      : Promise.resolve(null),
    membre.dirigeantId ? membreBrefParId(membre.dirigeantId) : Promise.resolve(null),
  ])
```

Ajouter les imports :

```tsx
import { disciplesDe } from '@/lib/donnees/arbre'
import { membreBrefParId, membreParId } from '@/lib/donnees/membres'
```

**Et ajouter `faiseur_de_disciple_id` à `COLONNES_DETAIL` et `faiseurDeDiscipleId` au type
`MembreDetail`** dans `src/lib/donnees/membres.ts` — la Task 6 n'y avait ajouté que
`dirigeant_id` et `dirigeant_force`.

- [ ] **Étape 2 : ajouter les lignes de filiation**

Après le tableau `lignes`, avant le `return`, construire les libellés :

```tsx
  const nomOuTiret = (bref: { prenom: string; nom: string } | null) =>
    bref ? `${bref.prenom} ${bref.nom}` : null

  lignes.push(['Faiseur de disciple', nomOuTiret(faiseur)])
  lignes.push([
    'Dirigeant',
    dirigeant
      ? `${nomOuTiret(dirigeant)}${membre.dirigeantForce ? ' (défini manuellement)' : ' (calculé)'}`
      : null,
  ])
```

- [ ] **Étape 3 : ajouter la section des disciples**

Après la section « Statuts » :

```tsx
      <section className="mt-8">
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-medium">Disciples</h2>
          {estAdmin ? (
            <Link
              href={`/membres/${membre.id}/arbre`}
              className="text-sm underline underline-offset-4"
            >
              Rattacher
            </Link>
          ) : null}
        </div>
        {disciples.length === 0 ? (
          <p className="text-sm text-neutral-600">Aucun disciple rattaché.</p>
        ) : (
          <ul className="divide-y divide-neutral-200">
            {disciples.map((disciple) => (
              <li key={disciple.id}>
                <Link href={`/membres/${disciple.id}`} className="block py-2 text-sm">
                  {disciple.prenom} {disciple.nom}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
```

- [ ] **Étape 4 : VÉRIFICATION PAR RÔLE**

Depuis un compte **administrateur** puis un compte **ordinaire**, ouvrir une fiche ayant un
faiseur de disciple et au moins un disciple. Les deux doivent voir la filiation et la liste
des disciples ; seul l'administrateur doit voir le lien « Rattacher »
(`toHaveCount(0)` pour l'autre).

- [ ] **Étape 5 : ajouter l'assertion e2e**

Ajouter à `tests/e2e/arbre.spec.ts` :

```typescript
test('la filiation est visible de tous, le lien de rattachement des seuls administrateurs', async ({
  page,
}) => {
  await seConnecter(page)
  await page.goto(`/membres/${idPetitEnfant}`)
  await expect(page.getByText('Faiseur de disciple')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Rattacher' })).toHaveCount(1)

  // La racine doit voir ses disciples.
  await page.goto(`/membres/${idRacine}`)
  await expect(page.getByRole('link', { name: `Test ${PREFIXE}-enfant` })).toHaveCount(1)
})
```

- [ ] **Étape 6 : les six portes, puis commit**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls && npm run test:e2e && npm run build
```

```bash
git add "src/app/membres/[id]/page.tsx" src/lib/donnees/membres.ts tests/e2e/arbre.spec.ts
git commit -m "feat: afficher la filiation et les disciples sur la fiche membre"
```

---

### Task 8 : bloquer l'archivage d'un faiseur de disciple

**Fichiers :**
- Créer : `supabase/migrations/20260814120000_archivage_faiseur_de_disciple.sql`
- Modifier : `src/app/membres/actions.ts`
- Modifier : `src/app/membres/[id]/page.tsx` (affichage du refus)
- Modifier : `tests/rls/arbre.test.ts`, `tests/e2e/arbre.spec.ts`

**Interfaces :**
- Produit : marqueur d'erreur `'disciples_a_reaffecter'`.

**Ce qu'exige le §7 :** « Archivage d'un membre qui est faiseur de disciple → Bloqué tant que
ses disciples n'ont pas été réaffectés ; **la liste des personnes concernées est affichée**. »
Le déclencheur protège ; l'affichage explique. Livrer l'un sans l'autre ne satisfait pas
l'exigence.

- [ ] **Étape 1 : écrire la migration**

```sql
-- Archiver un faiseur de disciple laisserait ses disciples rattachés à une fiche qui
-- ne figure plus dans l'annuaire : l'arbre resterait cohérent en base mais deviendrait
-- illisible à l'écran, et personne ne saurait plus qui suit ces personnes (spec §7).

create or replace function prive.refuser_archivage_faiseur_de_disciple()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_disciples integer;
begin
  if new.etat <> 'archive' or old.etat = 'archive' then
    return new;
  end if;

  select count(*) into v_disciples
  from public.membres m
  where m.faiseur_de_disciple_id = new.id
    and m.etat = 'actif';

  if v_disciples > 0 then
    raise exception 'Ce membre est encore faiseur de disciple de % personne(s) active(s).', v_disciples
      using detail = 'disciples_a_reaffecter';
  end if;

  return new;
end;
$$;

create trigger membres_archivage_faiseur_de_disciple
  before update of etat on public.membres
  for each row execute function prive.refuser_archivage_faiseur_de_disciple();
```

- [ ] **Étape 2 : appliquer la migration**

```bash
npx supabase db push --dry-run && npx supabase db push && npx supabase migration list
```

- [ ] **Étape 3 : faire remonter le refus jusqu'à l'écran**

`archiverMembre` n'a aujourd'hui aucun canal de retour : il lève. Une exception nue afficherait
la page d'erreur générique, sans la liste exigée par le §7. Modifier
`src/app/membres/actions.ts` :

```typescript
// Ajouter en tête du fichier :
import { disciplesDe } from '@/lib/donnees/arbre'

const DETAIL_DISCIPLES_A_REAFFECTER = 'disciples_a_reaffecter'

// Remplacer `archiverMembre` par :
export async function archiverMembre(donnees: FormData): Promise<void> {
  await exigerAdministrateur()

  const id = donnees.get('id')
  if (typeof id !== 'string' || id.length === 0) {
    redirect('/membres')
  }

  // Contrôle EN AMONT, pour pouvoir nommer les personnes concernées. Le déclencheur
  // reste la barrière : ce contrôle explique, il ne protège pas. Deux archivages
  // concurrents, ou une réaffectation validée entre-temps, passeraient ici et seraient
  // arrêtés là — c'est le partage voulu.
  const disciples = await disciplesDe(id)
  if (disciples.length > 0) {
    const noms = disciples.map((d) => `${d.prenom} ${d.nom}`).join(', ')
    redirect(`/membres/${id}?archivageRefuse=${encodeURIComponent(noms)}`)
  }

  try {
    await changerEtatMembre(id, 'archive')
  } catch (erreur) {
    // Filet : le déclencheur a refusé alors que le contrôle amont laissait passer.
    const details = (erreur as { details?: string })?.details
    console.error("archiverMembre : archivage refusé", { id, details, erreur })
    redirect(`/membres/${id}?archivageRefuse=${encodeURIComponent('des disciples encore actifs')}`)
  }

  revalidatePath('/membres')
  redirect('/membres')
}
```

**Attention — piège Next.js à ne pas reproduire :** `redirect()` lève une exception de
contrôle interne. L'appeler **dans un `try`** la ferait attraper par le `catch`, et la
redirection n'aurait jamais lieu. Les `redirect` ci-dessus sont tous **hors** du `try`, et
`changerEtatMembre` n'en contient aucun. Ne pas déplacer ces lignes sans revérifier ce point.

`changerEtatMembre` lève un `Error` construit à la main qui perd `details`. Le corriger pour
relayer l'erreur Postgres :

```typescript
async function changerEtatMembre(id: string, etat: EtatMembre): Promise<void> {
  const { data, error } = await clientAdmin()
    .from('membres')
    .update({ etat })
    .eq('id', id)
    .select('id')
  if (error) {
    // Relayer l'objet d'origine : `details` porte le marqueur du déclencheur, et le
    // remplacer par un `Error` neuf le perdrait — l'appelant ne pourrait plus
    // distinguer un refus métier d'une panne.
    throw error
  }
  if (!data || data.length === 0) {
    throw new Error("La fiche n'a pas pu être mise à jour : aucune fiche ne correspond.")
  }
}
```

- [ ] **Étape 4 : afficher le refus sur la fiche**

Dans `src/app/membres/[id]/page.tsx`, lire le paramètre et l'afficher :

```tsx
export default async function PageFicheMembre({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ archivageRefuse?: string }>
}) {
  const profil = await exigerProfilActif()
  const { id } = await params
  const { archivageRefuse } = await searchParams
  // …
```

Puis, juste avant la liste `<dl>` :

```tsx
      {archivageRefuse ? (
        <p role="alert" className="mb-6 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          Cette fiche ne peut pas être archivée : {archivageRefuse} en dépendent encore comme
          faiseur de disciple. Rattachez ces personnes à quelqu&apos;un d&apos;autre, puis
          recommencez.
        </p>
      ) : null}
```

- [ ] **Étape 5 : tests RLS — le déclencheur, avec contrôle positif**

Ajouter à `tests/rls/arbre.test.ts` :

```typescript
describe("archivage d'un faiseur de disciple", () => {
  it('refuse tant que des disciples actifs subsistent', async () => {
    const { error } = await admin.from('membres').update({ etat: 'archive' }).eq('id', idEnfant)
    expect(error).not.toBeNull()
    expect(error?.details).toBe('disciples_a_reaffecter')
  })

  // CONTRÔLE POSITIF : sans lui, le refus ci-dessus serait satisfait par un déclencheur
  // qui refuse TOUT archivage.
  it('laisse archiver un membre sans disciple actif', async () => {
    const idFeuille = await creerMembre('feuille', idRacine)
    const { error } = await admin.from('membres').update({ etat: 'archive' }).eq('id', idFeuille)
    expect(error).toBeNull()
  })

  it('laisse archiver une fois les disciples réaffectés', async () => {
    const idParent = await creerMembre('parent-a-vider', null)
    const idDisciple = await creerMembre('disciple-a-deplacer', idParent)

    const { error: erreurBloquee } = await admin
      .from('membres')
      .update({ etat: 'archive' })
      .eq('id', idParent)
    expect(erreurBloquee).not.toBeNull()

    await admin.rpc('definir_arbre', {
      p_membre: idDisciple,
      p_faiseur_de_disciple: idRacine,
      p_dirigeant: null,
      p_dirigeant_force: false,
    })

    const { error } = await admin.from('membres').update({ etat: 'archive' }).eq('id', idParent)
    expect(error).toBeNull()
  })
})
```

- [ ] **Étape 6 : PREUVE PAR MUTATION du déclencheur d'archivage**

Même protocole qu'à la Task 1 : relever `pg_get_triggerdef`, retirer le déclencheur, relancer
`npm run test:rls`, constater que **les deux tests de refus tombent pendant que les deux
contrôles positifs restent verts**, recréer, revérifier la définition, relancer.

- [ ] **Étape 7 : test e2e du parcours complet**

```typescript
test("archiver un faiseur de disciple est refusé, et la liste des disciples est nommée", async ({
  page,
}) => {
  await seConnecter(page)
  await page.goto(`/membres/${idEnfant}`)

  page.once('dialog', (dialogue) => dialogue.accept())
  await page.getByRole('button', { name: 'Archiver' }).click()

  const alerte = page.locator(ALERTE)
  await expect(alerte).toContainText('ne peut pas être archivée')
  // Le §7 exige que les personnes concernées soient NOMMÉES.
  await expect(alerte).toContainText(`${PREFIXE}-petit-enfant`)

  const { data } = await admin.from('membres').select('etat').eq('id', idEnfant).single()
  expect(data?.etat).toBe('actif')
})
```

- [ ] **Étape 8 : les six portes, puis commit**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls && npm run test:e2e && npm run build
```

```bash
git add supabase/migrations/20260814120000_archivage_faiseur_de_disciple.sql src/app/membres/actions.ts "src/app/membres/[id]/page.tsx" tests/rls/arbre.test.ts tests/e2e/arbre.spec.ts
git commit -m "feat: bloquer l'archivage d'un faiseur de disciple et nommer ses disciples"
```

---

### Task 9 : paginer l'annuaire

**Fichiers :**
- Modifier : `src/lib/donnees/membres.ts`
- Modifier : `src/app/membres/page.tsx`
- Modifier : `tests/e2e/annuaire.spec.ts`

**Interfaces :**
- Produit : `listerMembres` renvoie désormais `{ membres: MembreListe[]; total: number }`.

**Pourquoi maintenant, et pourquoi sans index** (décision D21 et §6.2 du design) : la page
charge aujourd'hui **tous** les membres actifs. À l'échelle de D18 elle deviendrait inutilisable.
On pagine. On n'ajoute **pas** d'index de recherche : `ilike '%terme%'` a un joker initial, qui
rend un B-tree inutile ; un index trigramme serait la réponse, mais à quelques milliers de
lignes le parcours séquentiel reste très rapide, et le coût réel est le poids de la page. Cet
index attendra d'être justifié par une mesure, pas par une intuition.

- [ ] **Étape 1 : modifier `listerMembres`**

```typescript
export const TAILLE_PAGE_ANNUAIRE = 50

export type PageMembres = { membres: MembreListe[]; total: number }

export async function listerMembres(filtres?: {
  recherche?: string
  antenneId?: string
  page?: number
}): Promise<PageMembres> {
  const supabase = await clientServeur()
  const page = Math.max(1, filtres?.page ?? 1)
  const debut = (page - 1) * TAILLE_PAGE_ANNUAIRE

  let requete = supabase
    .from('membres')
    // `count: 'exact'` : le nombre total doit rester juste, sinon la pagination annonce
    // des pages qui n'existent pas. C'est un COUNT complet à chaque requête, assumé —
    // il porte sur une table indexée par `etat` et reste très bon marché à cette échelle.
    .select(COLONNES_LISTE, { count: 'exact' })
    .eq('etat', 'actif')
    .order('nom')
    .order('prenom')
    .range(debut, debut + TAILLE_PAGE_ANNUAIRE - 1)

  const motif = motifRecherche(filtres?.recherche)
  if (motif) {
    requete = requete.or(`nom.ilike.${motif},prenom.ilike.${motif},ville.ilike.${motif}`)
  }
  if (filtres?.antenneId) {
    requete = requete.eq('antenne_id', filtres.antenneId)
  }

  const { data, error, count } = await requete
  if (error) {
    throw new Error(`Lecture des membres impossible : ${error.message}`)
  }
  // `count` peut être `null` si PostgREST ne l'a pas renvoyé. Retomber sur la longueur
  // de la page serait un mensonge : l'écran annoncerait « 50 membres » pour une base
  // qui en compte mille, et la pagination s'arrêterait à la première page.
  if (count === null) {
    throw new Error('Comptage des membres absent de la réponse PostgREST.')
  }
  return {
    membres: (data ?? []).map((l) => ({
      id: l.id as string,
      nom: l.nom as string,
      prenom: l.prenom as string,
      ville: l.ville as string | null,
      situation: l.situation as SituationMembre | null,
      antenneNom: nomAntenne(l.antennes as LigneAntenne),
    })),
    total: count,
  }
}
```

- [ ] **Étape 2 : modifier l'annuaire**

Dans `src/app/membres/page.tsx` :

```tsx
export default async function PageAnnuaire({
  searchParams,
}: {
  searchParams: Promise<{ recherche?: string; antenne?: string; page?: string }>
}) {
  const profil = await exigerProfilActif()
  const parametres = await searchParams

  const antenneFiltre = /^[0-9a-f-]{36}$/i.test(parametres.antenne ?? '')
    ? parametres.antenne
    : undefined

  // Même prudence que pour le filtre d'antenne : la valeur vient de l'adresse, donc du
  // client. Une page non numérique ou négative est ramenée à 1 plutôt que de faire
  // tomber l'écran.
  const pageDemandee = Number.parseInt(parametres.page ?? '1', 10)
  const page = Number.isFinite(pageDemandee) && pageDemandee > 0 ? pageDemandee : 1

  const [{ membres, total }, antennes, roles] = await Promise.all([
    listerMembres({ recherche: parametres.recherche, antenneId: antenneFiltre, page }),
    listerAntennes(),
    rolesDuProfil(profil.id),
  ])
  const estAdmin = roles.includes('administrateur')
  const pages = Math.max(1, Math.ceil(total / TAILLE_PAGE_ANNUAIRE))

  function lienPage(numero: number): string {
    const params = new URLSearchParams()
    if (parametres.recherche) params.set('recherche', parametres.recherche)
    if (antenneFiltre) params.set('antenne', antenneFiltre)
    params.set('page', String(numero))
    return `/membres?${params.toString()}`
  }
  // …
```

Remplacer le compteur de l'en-tête :

```tsx
          <p className="text-sm text-neutral-500">
            {total} membre{total > 1 ? 's' : ''}
            {pages > 1 ? ` · page ${page} sur ${pages}` : ''}
          </p>
```

Ajouter, après la liste, la navigation. Elle ne s'affiche que s'il y a plus d'une page :

```tsx
      {pages > 1 ? (
        <nav aria-label="Pagination" className="mt-8 flex items-center justify-between gap-4">
          {page > 1 ? (
            <Link href={lienPage(page - 1)} className="text-sm underline underline-offset-4">
              Page précédente
            </Link>
          ) : (
            <span />
          )}
          {page < pages ? (
            <Link href={lienPage(page + 1)} className="text-sm underline underline-offset-4">
              Page suivante
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
```

Ajouter `page` au champ caché du formulaire de filtre — sinon filtrer depuis la page 3
conserverait la page 3 d'un résultat qui n'en a peut-être qu'une. La bonne réponse est de
**revenir à la page 1** à chaque filtrage, ce que fait l'absence de champ `page` dans le
formulaire `method="get"` : ne rien ajouter, et le vérifier.

- [ ] **Étape 3 : corriger les appelants**

`listerMembres` change de signature de retour. Rechercher tous ses appels :

```bash
grep -rn "listerMembres" src/
```

Attendu : un seul appelant, `src/app/membres/page.tsx`. Si `tsc` en signale d'autres, les
corriger — c'est précisément ce que le typage sert à attraper.

- [ ] **Étape 4 : test e2e de la pagination**

Ajouter à `tests/e2e/annuaire.spec.ts` un test qui crée `TAILLE_PAGE_ANNUAIRE + 1` membres,
vérifie que la première page en montre exactement `TAILLE_PAGE_ANNUAIRE`, que le lien
« Page suivante » existe, et que la seconde page montre le reste :

```typescript
test("l'annuaire pagine au-delà d'une page", async ({ page }) => {
  const PREFIXE_PAGINATION = `ZZPagination-${crypto.randomUUID().slice(0, 8)}`
  const lignes = Array.from({ length: 51 }, (_, i) => ({
    nom: `${PREFIXE_PAGINATION}-${String(i).padStart(3, '0')}`,
    prenom: 'Test',
  }))
  const { error: erreurInsertion } = await admin.from('membres').insert(lignes)
  // Vérifier l'insertion : une précondition qui échoue en silence rendrait ce test
  // vert pour de mauvaises raisons (défaut réel de la Task 10 de la 1b).
  expect(erreurInsertion).toBeNull()

  try {
    await seConnecter(page)
    await page.goto(`/membres?recherche=${PREFIXE_PAGINATION}`)

    await expect(page.getByRole('link', { name: /Test ZZPagination/ })).toHaveCount(50)
    await expect(page.getByRole('link', { name: 'Page suivante' })).toHaveCount(1)

    await page.getByRole('link', { name: 'Page suivante' }).click()
    await expect(page.getByRole('link', { name: /Test ZZPagination/ })).toHaveCount(1)
    await expect(page.getByRole('link', { name: 'Page précédente' })).toHaveCount(1)
  } finally {
    await admin.from('membres').delete().like('nom', `${PREFIXE_PAGINATION}-%`)
  }
})
```

- [ ] **Étape 5 : les six portes, puis commit**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls && npm run test:e2e && npm run build
```

```bash
git add src/lib/donnees/membres.ts src/app/membres/page.tsx tests/e2e/annuaire.spec.ts
git commit -m "feat: paginer l'annuaire pour tenir a l'echelle du millier de membres"
```

---

## Partie B — portée d'autorité et comptes

### Task 10 : le domaine — portée d'autorité

**Fichiers :**
- Modifier : `src/lib/domaine/arbre.ts`
- Modifier : `src/lib/domaine/arbre.test.ts`

**Interfaces :**
- Produit :
  - `type ContexteAutorite = { membreLieId: string | null; estAdmin: boolean }`
  - `type CibleAutorite = { membreId: string; ancetres: string[]; dirigeantId: string | null }`
  - `peutModifier(contexte: ContexteAutorite, cible: CibleAutorite): boolean`

**La règle, copiée du §5.1 de la spécification maîtresse :** « Un utilisateur a autorité sur un
membre M si son membre lié est un **ancêtre de M dans l'arbre des faiseurs de disciple**, à
n'importe quelle profondeur, **ou** s'il est désigné comme `dirigeant_id` de M. »

**Deux pièges que ces tests existent pour attraper :**

1. **Le compte racine n'a pas de membre lié** (spec D11). Son `membreLieId` vaut `null`. Si
   `null` traversait la fonction jusqu'à une comparaison, il donnerait autorité sur toute
   fiche dont le `dirigeant_id` est lui aussi `null` — c'est-à-dire l'immense majorité. Le
   court-circuit sur `null` n'est pas de la défense, c'est la règle.
2. **Nul n'est son propre ancêtre.** Un utilisateur n'a donc pas autorité sur sa propre
   fiche : son cheminement spirituel est constaté par celui qui le suit, pas déclaré par
   lui-même. C'est une conséquence voulue du §5.1, à figer par un test pour qu'elle ne soit
   pas « corrigée » un jour par mégarde.

- [ ] **Étape 1 : écrire les tests, qui doivent échouer**

Ajouter à `src/lib/domaine/arbre.test.ts` :

```typescript
import { dirigeantPropose, peutModifier } from './arbre'

describe('peutModifier', () => {
  const cible = { membreId: 'cible', ancetres: ['parent', 'grand-parent'], dirigeantId: 'chef' }

  it('accorde tout à un administrateur, même sans membre lié', () => {
    expect(peutModifier({ membreLieId: null, estAdmin: true }, cible)).toBe(true)
  })

  it('accorde au faiseur de disciple direct', () => {
    expect(peutModifier({ membreLieId: 'parent', estAdmin: false }, cible)).toBe(true)
  })

  it('accorde à un ancêtre lointain', () => {
    expect(peutModifier({ membreLieId: 'grand-parent', estAdmin: false }, cible)).toBe(true)
  })

  it("accorde au dirigeant désigné, même hors de l'arbre", () => {
    expect(peutModifier({ membreLieId: 'chef', estAdmin: false }, cible)).toBe(true)
  })

  it("refuse à quelqu'un sans aucun lien", () => {
    expect(peutModifier({ membreLieId: 'inconnu', estAdmin: false }, cible)).toBe(false)
  })

  // LE PIÈGE DU COMPTE RACINE : sans le court-circuit sur `null`, ce cas passerait à
  // `true` dès que la cible n'a pas de dirigeant — donc presque toujours.
  it("refuse à un compte sans membre lié qui n'est pas administrateur", () => {
    expect(
      peutModifier({ membreLieId: null, estAdmin: false }, { ...cible, dirigeantId: null }),
    ).toBe(false)
  })

  it("refuse à un compte sans membre lié même quand la liste d'ancêtres est vide", () => {
    expect(
      peutModifier(
        { membreLieId: null, estAdmin: false },
        { membreId: 'cible', ancetres: [], dirigeantId: null },
      ),
    ).toBe(false)
  })

  // Conséquence voulue du §5.1, figée ici pour qu'elle ne soit pas « corrigée » par
  // mégarde : nul n'est son propre ancêtre.
  it('refuse à un utilisateur sur sa propre fiche', () => {
    expect(
      peutModifier(
        { membreLieId: 'cible', estAdmin: false },
        { membreId: 'cible', ancetres: ['parent'], dirigeantId: 'chef' },
      ),
    ).toBe(false)
  })

  it("refuse quand la cible n'a ni ancêtre ni dirigeant", () => {
    expect(
      peutModifier(
        { membreLieId: 'quelquun', estAdmin: false },
        { membreId: 'racine', ancetres: [], dirigeantId: null },
      ),
    ).toBe(false)
  })
})
```

- [ ] **Étape 2 : lancer les tests et vérifier qu'ils échouent**

```bash
npm test -- arbre
```

Attendu : ÉCHEC, `peutModifier is not a function` ou une erreur d'import.

- [ ] **Étape 3 : écrire l'implémentation**

Ajouter à `src/lib/domaine/arbre.ts` :

```typescript
/** Qui demande : son membre lié (null pour le compte racine), et son rôle. */
export type ContexteAutorite = {
  membreLieId: string | null
  estAdmin: boolean
}

/** Sur qui : la fiche visée, ses ancêtres et son dirigeant désigné. */
export type CibleAutorite = {
  membreId: string
  ancetres: string[]
  dirigeantId: string | null
}

/**
 * Portée d'autorité du §5.1 : autorité sur un membre si l'on est administrateur, ou si
 * son membre lié est un ancêtre de la cible à n'importe quelle profondeur, ou s'il en
 * est le dirigeant désigné.
 *
 * Fonction PURE : elle ne lit pas la base. La chaîne d'ancêtres lui est fournie, ce qui
 * la rend testable sans base, comme l'annonce le §8 de la spécification.
 */
export function peutModifier(contexte: ContexteAutorite, cible: CibleAutorite): boolean {
  if (contexte.estAdmin) {
    return true
  }

  // Le compte racine n'a pas de membre lié (spec D11). Sans ce court-circuit, `null`
  // atteindrait la comparaison au dirigeant et rendrait `true` sur toute fiche sans
  // dirigeant. Ce n'est pas une précaution : c'est la règle. Un compte sans place dans
  // l'arbre n'a aucune portée d'autorité, il n'agit qu'en tant qu'administrateur.
  if (contexte.membreLieId === null) {
    return false
  }

  // Nul n'est son propre ancêtre : `ancetres` exclut la cible (voir
  // `public.ancetres_membre`), donc ce cas est déjà couvert — sauf si quelqu'un
  // désignait un membre comme son propre dirigeant, ce que les contraintes CHECK de
  // `membres` interdisent. Les deux branches ci-dessous sont donc sûres telles quelles.
  if (cible.dirigeantId === contexte.membreLieId) {
    return true
  }
  return cible.ancetres.includes(contexte.membreLieId)
}
```

- [ ] **Étape 4 : lancer les tests**

```bash
npm test
```

Attendu : **69 tests** (60 après la Task 3 + 9 nouveaux).

- [ ] **Étape 5 : les six portes, puis commit**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls && npm run test:e2e && npm run build
```

```bash
git add src/lib/domaine/arbre.ts src/lib/domaine/arbre.test.ts
git commit -m "feat: decider la portee d'autorite sur un membre"
```

---

### Task 11 : brancher la portée d'autorité — la tâche la plus sensible du plan

**Fichiers :**
- Modifier : `src/lib/donnees/arbre.ts` (ajout de `cibleAutorite`)
- Modifier : `src/lib/securite/garde.ts`
- Modifier : `src/app/membres/[id]/statuts/actions.ts`
- Modifier : `src/app/membres/[id]/statuts/page.tsx`
- Créer : `tests/e2e/autorite.spec.ts`

**Interfaces :**
- Consomme : `peutModifier` (Task 10), `ancetresDeMembre` (Task 4).
- Produit : `aAutoriteSur(membreId: string): Promise<boolean>` et
  `exigerAutoriteSur(membreId: string): Promise<Profil>` dans `garde.ts` ;
  `cibleAutorite(membreId: string): Promise<CibleAutorite | null>`.

**Ce que cette tâche met en jeu.** Les écritures de statuts passent par `clientAdmin()`, la
clé de service, qui **contourne entièrement la RLS**. Le garde de l'action est donc la
**seule** protection réelle. En 1b, un test d'autorisation est resté vert alors qu'on avait
retiré le garde, parce qu'il n'assertait que l'absence d'un bouton dans le DOM — un mécanisme
différent de celui qui protège. C'est le défaut le plus coûteux de la phase précédente. Les
preuves exigées ci-dessous ne sont pas négociables.

**Deux gardes et non un.** L'écran `/membres/[id]/statuts` reste **lisible par tout compte
actif** — c'est le journal, et la 1b l'a explicitement ouvert. Seules les **écritures**
demandent l'autorité. D'où :
- `aAutoriteSur` — rend un booléen, sert à décider d'AFFICHER le formulaire ;
- `exigerAutoriteSur` — redirige, sert à PROTÉGER les actions.
Le premier ne protège rien et ne doit jamais être employé comme s'il protégeait.

- [ ] **Étape 1 : ajouter `cibleAutorite` dans `src/lib/donnees/arbre.ts`**

```typescript
import type { CibleAutorite } from '@/lib/domaine/arbre'

/**
 * Les éléments nécessaires à une décision d'autorité sur un membre.
 *
 * Lecture avec la CLÉ DE SERVICE, comme `ancetresDeMembre` et pour la même raison
 * (design 1c, D19) : une décision d'autorité ne doit pas dépendre de ce que l'appelant
 * a le droit de VOIR. Sous RLS, une fiche archivée est invisible d'un non-administrateur
 * et rendrait `null` — ce qui, selon la façon dont l'appelant traite ce `null`, donnerait
 * soit un refus inexplicable, soit pire.
 *
 * `null` signifie « ce membre n'existe pas », et rien d'autre. L'appelant doit le
 * traiter comme un refus.
 */
export async function cibleAutorite(membreId: string): Promise<CibleAutorite | null> {
  const { data, error } = await clientAdmin()
    .from('membres')
    .select('id, dirigeant_id')
    .eq('id', membreId)
    .maybeSingle()

  if (error) {
    throw new Error(`Lecture de la cible d'autorité impossible : ${error.message}`)
  }
  if (!data) {
    return null
  }

  const ancetres = await ancetresDeMembre(membreId)
  return {
    membreId: data.id as string,
    ancetres,
    dirigeantId: data.dirigeant_id as string | null,
  }
}
```

- [ ] **Étape 2 : ajouter les deux gardes**

Ajouter à `src/lib/securite/garde.ts` :

```typescript
import { peutModifier } from '@/lib/domaine/arbre'
import { cibleAutorite } from '@/lib/donnees/arbre'

/**
 * Décision d'autorité, écrite UNE seule fois. Les deux fonctions exportées ci-dessous
 * en dérivent : sans cette factorisation, `exigerAutoriteSur` appelant `aAutoriteSur`
 * relirait le profil et les rôles trois fois pour une seule décision.
 */
async function deciderAutorite(
  membreId: string,
): Promise<{ profil: Profil; autorise: boolean }> {
  const profil = await exigerProfilActif()
  const roles = await rolesDuProfil(profil.id)
  const estAdmin = roles.includes('administrateur')

  // Court-circuit : un administrateur a autorité partout, inutile de remonter l'arbre.
  if (estAdmin) {
    return { profil, autorise: true }
  }

  const cible = await cibleAutorite(membreId)
  // Membre inexistant : refus. Ne jamais rendre `true` par défaut sur une cible qu'on
  // n'a pas su lire — l'échec doit être fermé.
  if (!cible) {
    return { profil, autorise: false }
  }
  return {
    profil,
    autorise: peutModifier({ membreLieId: profil.membreId, estAdmin }, cible),
  }
}

/**
 * A-t-on autorité sur ce membre ? Rend un booléen, ne redirige pas.
 *
 * À n'employer que pour DÉCIDER D'AFFICHER quelque chose. Il ne protège rien : masquer
 * un formulaire n'empêche personne d'appeler l'action qu'il déclenche. La protection,
 * c'est `exigerAutoriteSur`, et elle seule.
 */
export async function aAutoriteSur(membreId: string): Promise<boolean> {
  const { autorise } = await deciderAutorite(membreId)
  return autorise
}

/**
 * Réserve une action aux comptes ayant autorité sur ce membre (spec §5.1).
 *
 * C'est la SEULE protection des écritures de statuts : elles passent par la clé de
 * service, qui contourne la RLS. Toute écriture concernant un membre passe par ici.
 */
export async function exigerAutoriteSur(membreId: string): Promise<Profil> {
  const { profil, autorise } = await deciderAutorite(membreId)
  if (!autorise) {
    redirect('/tableau-de-bord')
  }
  return profil
}
```

- [ ] **Étape 3 : élargir le garde des actions de statuts**

Dans `src/app/membres/[id]/statuts/actions.ts` :

- remplacer l'import `exigerAdministrateur` par `exigerAutoriteSur` ;
- dans `attribuerStatut` **et** `retirerStatut`, remplacer
  `const profil = await exigerAdministrateur()` par un appel qui vient **après** la
  lecture de `membreId`, puisque le garde en dépend désormais :

```typescript
  const membreId = texteObligatoire(donnees, 'membreId')
  const statutId = texteObligatoire(donnees, 'statutId')
  if (!membreId || !statutId) {
    console.error('attribuerStatut : identifiants manquants dans le formulaire', {
      membreId,
      statutId,
    })
    return { erreur: MESSAGE_ECHEC_STATUT }
  }

  // Le garde vient APRÈS la lecture de `membreId` parce qu'il en dépend — et
  // c'est le seul cas du projet où il n'est pas la toute première instruction.
  // Ce qui le précède ne lit RIEN et n'écrit RIEN : il ne fait que dépaqueter le
  // formulaire. Aucun effet de bord n'est possible avant le contrôle.
  const profil = await exigerAutoriteSur(membreId)
```

Appliquer le même déplacement à `retirerStatut`, en gardant son `throw` existant pour les
identifiants manquants.

- [ ] **Étape 4 : conditionner l'affichage du formulaire**

Dans `src/app/membres/[id]/statuts/page.tsx`, remplacer le test de rôle qui décide d'afficher
le formulaire d'attribution et les boutons de retrait par un appel à `aAutoriteSur(id)`.
Repérer la variable existante (`estAdmin`) et la remplacer par `peutEcrire` :

```tsx
const peutEcrire = await aAutoriteSur(membre.id)
```

Ne pas oublier le libellé du lien de la fiche : « Gérer » ne doit être affiché qu'à qui peut
réellement gérer. Dans `src/app/membres/[id]/page.tsx`, remplacer la condition `estAdmin` du
lien Statuts par `await aAutoriteSur(membre.id)`, calculé dans le `Promise.all` existant.

- [ ] **Étape 5 : écrire les preuves de bout en bout**

Créer `tests/e2e/autorite.spec.ts`. Ce fichier construit un arbre réel et **lie des comptes à
des fiches directement en base avec la clé de service** — l'écran de liaison n'arrive qu'à la
Task 14, et un test n'a pas besoin de passer par l'interface pour préparer son état.

`decoderEntitesHtml`, `extraireChampsCaches` et `verifierCaptureAction` sont **recopiés tels
quels** depuis `tests/e2e/statuts.spec.ts` : ils portent deux rondes de correction, et les
réécrire serait refaire les mêmes erreurs.

**Chaque test emploie un statut DIFFÉRENT.** Ce n'est pas une coquetterie : en 1b, deux tests
forgés partageant une cible se couplaient, et l'un échouait sur la précondition de l'autre
plutôt que sur l'assertion de sécurité qu'il visait.

```typescript
import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'

// L'ordre des tests fait partie du scénario, et les comptes sont partagés.
test.describe.configure({ mode: 'serial' })

const IDENT_LIE = 'test.e2e.autorite.lie'
const IDENT_AUTRE = 'test.e2e.autorite.autre'
const IDENT_SANS_FICHE = 'test.e2e.autorite.sansfiche'
const MDP_LIE = `Test-${crypto.randomUUID()}`
const MDP_AUTRE = `Test-${crypto.randomUUID()}`
const MDP_SANS_FICHE = `Test-${crypto.randomUUID()}`
const PREFIXE = `ZZAutorite-${crypto.randomUUID().slice(0, 8)}`

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

let idRacine: string
let idEnfant: string
let idPetitEnfant: string
let idEtranger: string

async function creerMembre(suffixe: string, faiseurDeDiscipleId: string | null): Promise<string> {
  const { data, error } = await admin
    .from('membres')
    .insert({ nom: `${PREFIXE}-${suffixe}`, prenom: 'Test', faiseur_de_disciple_id: faiseurDeDiscipleId })
    .select('id')
    .single()
  if (error || !data) throw new Error(`création du membre ${suffixe} impossible : ${error?.message}`)
  return data.id as string
}

async function supprimerCompte(identifiant: string) {
  const { data } = await admin.from('profils').select('id').eq('identifiant', identifiant).maybeSingle()
  if (data) {
    await admin.auth.admin.deleteUser(data.id)
    return
  }
  const { data: comptes } = await admin.auth.admin.listUsers()
  const orphelin = comptes?.users.find((u) => u.email === `${identifiant}@asonkeng.local`)
  if (orphelin) await admin.auth.admin.deleteUser(orphelin.id)
}

/**
 * Crée un compte NON administrateur et le lie éventuellement à une fiche.
 *
 * La liaison est posée directement en base : l'écran qui la pose n'arrive qu'à la
 * Task 14, et un test n'a pas à passer par l'interface pour préparer son état.
 */
async function creerCompte(identifiant: string, mdp: string, membreId: string | null) {
  const { data, error } = await admin.auth.admin.createUser({
    email: `${identifiant}@asonkeng.local`,
    password: mdp,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(error?.message)
  const { error: erreurProfil } = await admin.from('profils').insert({
    id: data.user.id,
    identifiant,
    nom_affichage: `Test ${identifiant}`,
    membre_id: membreId,
  })
  if (erreurProfil) {
    await admin.auth.admin.deleteUser(data.user.id)
    throw new Error(`insertion du profil impossible : ${erreurProfil.message}`)
  }
}

async function nettoyer() {
  for (const identifiant of [IDENT_LIE, IDENT_AUTRE, IDENT_SANS_FICHE]) {
    await supprimerCompte(identifiant)
  }
  // Les comptes d'abord : `profils.membre_id` est en `on delete set null`, mais
  // supprimer les fiches avant les comptes laisserait des profils à moitié nettoyés
  // si la suppression des comptes échouait ensuite.
  await admin.from('membres').delete().like('nom', 'ZZAutorite-%')
}

test.beforeAll(async () => {
  await nettoyer()

  idRacine = await creerMembre('racine', null)
  idEnfant = await creerMembre('enfant', idRacine)
  idPetitEnfant = await creerMembre('petit-enfant', idEnfant)
  idEtranger = await creerMembre('etranger', null)

  await creerCompte(IDENT_LIE, MDP_LIE, idRacine)
  await creerCompte(IDENT_AUTRE, MDP_AUTRE, idEtranger)
  await creerCompte(IDENT_SANS_FICHE, MDP_SANS_FICHE, null)
})

test.afterAll(nettoyer)

async function seConnecter(
  page: import('@playwright/test').Page,
  identifiant: string,
  mdp: string,
) {
  await page.goto('/connexion')
  await page.getByLabel('Identifiant').fill(identifiant)
  await page.getByLabel('Mot de passe', { exact: true }).fill(mdp)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page).toHaveURL(/\/tableau-de-bord/)
}

function decoderEntitesHtml(valeur: string): string {
  return valeur
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function extraireChampsCaches(formHtml: string): Record<string, string> {
  const champs: Record<string, string> = {}
  const regex = /<input type="hidden" name="([^"]+)"(?:\s+value="([^"]*)")?/g
  let correspondance: RegExpExecArray | null
  while ((correspondance = regex.exec(formHtml))) {
    champs[decoderEntitesHtml(correspondance[1])] = decoderEntitesHtml(correspondance[2] ?? '')
  }
  return champs
}

/** Lève si la capture n'a trouvé aucun champ `$ACTION*` : mieux vaut un échec bruyant
 *  ici qu'un test qui, silencieusement, ne teste plus rien. */
function verifierCaptureAction(champs: Record<string, string>): void {
  const trouve = Object.keys(champs).some((nom) => nom.startsWith('$ACTION'))
  if (!trouve) {
    throw new Error(
      `Capture invalide : aucun champ « $ACTION* » parmi ${JSON.stringify(Object.keys(champs))}. ` +
        "L'encodage des Server Actions a peut-être changé — ce test ne peut plus prouver ce qu'il prétend.",
    )
  }
}

async function statutParLibelle(libelle: string): Promise<string> {
  const { data, error } = await admin.from('statuts').select('id').eq('libelle', libelle).single()
  if (error || !data) throw new Error(`statut « ${libelle} » introuvable : ${error?.message}`)
  return data.id as string
}

async function compterMembreStatut(membreId: string, statutId: string): Promise<number> {
  const { data, error } = await admin
    .from('membre_statuts')
    .select('statut_id')
    .eq('membre_id', membreId)
    .eq('statut_id', statutId)
  if (error) throw new Error(`lecture de membre_statuts impossible : ${error.message}`)
  return (data ?? []).length
}

/**
 * Relève les champs cachés du formulaire d'attribution depuis une session QUI A
 * l'autorité — c'est la seule qui se voit rendre ce formulaire.
 */
async function capturerChampsAttribution(
  page: import('@playwright/test').Page,
  membreId: string,
): Promise<Record<string, string>> {
  await seConnecter(page, IDENT_LIE, MDP_LIE)
  await page.goto(`/membres/${membreId}/statuts`)
  const formulaire = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Attribuer ce statut' }) })
  const champs = extraireChampsCaches(await formulaire.evaluate((el) => el.outerHTML))
  verifierCaptureAction(champs)
  return champs
}

test("un compte lié a autorité sur un membre de son sous-arbre", async ({ page }) => {
  // La branche « ancêtre à n'importe quelle profondeur » du §5.1 : le compte est lié à
  // la RACINE, la cible est deux niveaux plus bas.
  const idStatut = await statutParLibelle('Repenti')
  expect(await compterMembreStatut(idPetitEnfant, idStatut)).toBe(0)

  await seConnecter(page, IDENT_LIE, MDP_LIE)
  await page.goto(`/membres/${idPetitEnfant}/statuts`)

  await page.getByLabel('Statut (obligatoire)').selectOption({ label: 'Repenti' })
  await page.getByRole('button', { name: 'Attribuer ce statut' }).click()

  // Assertion EN BASE, et non sur l'écran : c'est l'écriture qui compte.
  await expect(async () => {
    expect(await compterMembreStatut(idPetitEnfant, idStatut)).toBe(1)
  }).toPass()
})

test("un compte lié hors du sous-arbre ne peut pas écrire, par requête forgée", async ({
  page,
  browser,
  baseURL,
}) => {
  const idStatut = await statutParLibelle('Sert dans une commission')
  expect(await compterMembreStatut(idPetitEnfant, idStatut)).toBe(0)

  const champs = await capturerChampsAttribution(page, idPetitEnfant)

  const contexte = await browser.newContext({ baseURL })
  try {
    const autrePage = await contexte.newPage()
    await seConnecter(autrePage, IDENT_AUTRE, MDP_AUTRE)

    await autrePage.request.post(`/membres/${idPetitEnfant}/statuts`, {
      multipart: { ...champs, statutId: idStatut },
    })

    // Seule assertion qui compte : rien n'a été écrit, quel qu'ait été le code HTTP.
    expect(await compterMembreStatut(idPetitEnfant, idStatut)).toBe(0)
  } finally {
    await contexte.close()
  }
})

test("un compte sans membre lié ne peut pas écrire, par requête forgée", async ({
  page,
  browser,
  baseURL,
}) => {
  // LE PIÈGE DU COMPTE RACINE, éprouvé pour de vrai : `membre_id` vaut null. Si
  // `peutModifier` laissait ce null atteindre ses comparaisons, ce compte aurait
  // autorité sur toute fiche sans dirigeant — c'est-à-dire presque toutes.
  const idStatut = await statutParLibelle("Baptisé d'eau")
  expect(await compterMembreStatut(idPetitEnfant, idStatut)).toBe(0)

  const champs = await capturerChampsAttribution(page, idPetitEnfant)

  const contexte = await browser.newContext({ baseURL })
  try {
    const autrePage = await contexte.newPage()
    await seConnecter(autrePage, IDENT_SANS_FICHE, MDP_SANS_FICHE)

    await autrePage.request.post(`/membres/${idPetitEnfant}/statuts`, {
      multipart: { ...champs, statutId: idStatut },
    })

    expect(await compterMembreStatut(idPetitEnfant, idStatut)).toBe(0)
  } finally {
    await contexte.close()
  }
})

test("canari : la même requête forgée réussit depuis un compte qui a l'autorité", async ({
  page,
}) => {
  // Contrôle positif. Si les deux refus ci-dessus passaient un jour parce que la forge
  // est cassée — encodage `$ACTION_*` changé, formulaire remanié — et non parce que le
  // garde refuse, rien ne le dirait sans ce test. Ici, exactement le même mécanisme,
  // depuis une session AUTORISÉE : l'écriture doit réussir.
  //
  // Les deux classes d'échec ont des signatures qui ne se recouvrent pas. Forge cassée
  // => `verifierCaptureAction` lève, avec un message explicite, dans les TROIS tests
  // qui l'emploient. Garde régressé => un test de refus échoue sur un compteur pendant
  // que ce canari, lui, RÉUSSIT.
  const idStatut = await statutParLibelle('Baptisé du Saint-Esprit')
  expect(await compterMembreStatut(idPetitEnfant, idStatut)).toBe(0)

  try {
    const champs = await capturerChampsAttribution(page, idPetitEnfant)

    await page.request.post(`/membres/${idPetitEnfant}/statuts`, {
      multipart: { ...champs, statutId: idStatut },
    })

    expect(await compterMembreStatut(idPetitEnfant, idStatut)).toBe(1)
  } finally {
    await admin
      .from('membre_statuts')
      .delete()
      .eq('membre_id', idPetitEnfant)
      .eq('statut_id', idStatut)
  }
})
```

- [ ] **Étape 6 : PREUVE PAR MUTATION, décisive**

C'est l'étape qui a manqué en 1b et qui a laissé passer le défaut le plus grave de la phase.

1. Dans `src/lib/securite/garde.ts`, remplacer le corps de `exigerAutoriteSur` par un simple
   `return exigerProfilActif()` — la barrière tombe, tout compte actif peut écrire.
2. Relancer `npm run test:e2e`. **Attendu : les tests de refus tombent, et le canari
   RÉUSSIT.** Un test de refus qui tombe pendant que le canari passe prouve que c'est bien
   la sécurité qui a changé, et non la forge.
3. Vérifier que les tests tombent **en constatant une ÉCRITURE** (une ligne créée en base),
   et non seulement un compteur différent. Un test qui constate un refus ne prouve rien ;
   un test qui constate une écriture quand la barrière tombe prouve tout.
4. **Attention, contrainte structurelle héritée de la 1b :** le mode série arrête la suite au
   premier échec. Les deux tests de refus ne peuvent donc pas tomber dans une même exécution.
   Faire **deux exécutions distinctes** et le dire comme tel dans le rapport — ne pas
   ajuster le récit pour qu'il ait l'air plus propre.
5. Restaurer le fichier, vérifier son empreinte SHA-256 identique à celle d'avant mutation,
   relancer la suite complète.
6. Consigner les sorties réelles.

- [ ] **Étape 7 : VÉRIFICATION PAR RÔLE, à l'écran**

Trois sessions, trois observations distinctes sur `/membres/<petit-enfant>/statuts` :
1. compte lié à la racine → formulaire d'attribution **visible**, boutons de retrait présents ;
2. compte lié à une fiche sans lien → écran **lisible** (journal), **aucun** formulaire,
   **aucun** bouton de retrait ;
3. compte sans membre lié et non administrateur → idem cas 2.

- [ ] **Étape 8 : les six portes, puis commit**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls && npm run test:e2e && npm run build
```

```bash
git add src/lib/securite/garde.ts src/lib/donnees/arbre.ts "src/app/membres/[id]/statuts" "src/app/membres/[id]/page.tsx" tests/e2e/autorite.spec.ts
git commit -m "feat: ouvrir la modification des statuts a la portee d'autorite"
```

---

### Task 12 : passerelles des comptes et protection du dernier administrateur

**Fichiers :**
- Créer : `supabase/migrations/20260814130000_passerelles_comptes.sql`
- Créer : `tests/rls/comptes.test.ts`

**Interfaces :**
- Produit : `public.definir_roles(p_profil uuid, p_administrateur boolean,
  p_moderateur boolean)` ; `public.definir_actif_compte(p_profil uuid, p_actif boolean)` ;
  marqueurs `'compte_inconnu'` et `'dernier_administrateur'`.

**Pourquoi un verrou ici aussi.** Le §7 exige : « Suppression ou rétrogradation du dernier
administrateur → Refusée ». Un contrôle « reste-t-il un autre administrateur actif ? » suivi
d'une écriture est un lire-puis-écrire : deux administrateurs se rétrogradant simultanément
voient chacun l'autre et passent tous les deux. L'application se retrouve sans aucun
administrateur, **définitivement** — il n'existe aucun moyen d'en recréer un depuis
l'application. Même famille de défaut qu'à la Task 1, conséquence bien pire.

Clé de verrou **distincte** de celle de l'arbre : même mécanisme, invariant différent.
Partager la clé ferait attendre des opérations sans rapport, sans rien protéger de plus.

- [ ] **Étape 1 : écrire la migration**

```sql
-- Rôles et activation des comptes, avec la protection du dernier administrateur
-- (spec §7). Voir l'en-tête de 20260814100000 pour le raisonnement sur le verrou.

create or replace function prive.compter_administrateurs_actifs(p_hors uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int
  from public.roles_profil r
  join public.profils p on p.id = r.profil_id
  where r.role = 'administrateur'
    and p.actif
    and (p_hors is null or p.id <> p_hors);
$$;

comment on function prive.compter_administrateurs_actifs(uuid) is
  'Nombre d''administrateurs actifs, hors le profil passé en argument. Sert à refuser la rétrogradation ou la désactivation du dernier (spec §7).';

revoke execute on function prive.compter_administrateurs_actifs(uuid) from public, anon, authenticated;

create or replace function public.definir_roles(
  p_profil uuid,
  p_administrateur boolean,
  p_moderateur boolean
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
end;
$$;

create or replace function public.definir_actif_compte(p_profil uuid, p_actif boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(20260814, 2);

  perform 1 from public.profils p where p.id = p_profil for update;
  if not found then
    raise exception 'Compte inconnu.' using detail = 'compte_inconnu';
  end if;

  if not p_actif
     and exists (
       select 1 from public.roles_profil r
       where r.profil_id = p_profil and r.role = 'administrateur'
     )
     and prive.compter_administrateurs_actifs(p_profil) = 0
  then
    raise exception 'Il doit rester au moins un administrateur actif.'
      using detail = 'dernier_administrateur';
  end if;

  update public.profils set actif = p_actif where id = p_profil;
end;
$$;

revoke execute on function public.definir_roles(uuid, boolean, boolean) from public, anon, authenticated;
revoke execute on function public.definir_actif_compte(uuid, boolean) from public, anon, authenticated;
grant execute on function public.definir_roles(uuid, boolean, boolean) to service_role;
grant execute on function public.definir_actif_compte(uuid, boolean) to service_role;
```

- [ ] **Étape 2 : appliquer la migration**

```bash
npx supabase db push --dry-run && npx supabase db push && npx supabase migration list
```

- [ ] **Étape 3 : écrire les tests RLS**

Créer `tests/rls/comptes.test.ts`. Le jeu de test crée **deux** comptes administrateurs, pour
pouvoir éprouver la rétrogradation de l'un puis le refus sur le dernier.

**Ne jamais toucher au compte racine réel dans ces tests.** Ils travaillent exclusivement sur
des comptes préfixés `test.rls.comptes.`.

```typescript
describe('protection du dernier administrateur', () => {
  it("laisse rétrograder un administrateur tant qu'il en reste un autre", async () => {
    const { error } = await admin.rpc('definir_roles', {
      p_profil: idAdminA,
      p_administrateur: false,
      p_moderateur: false,
    })
    expect(error).toBeNull()
  })

  it('refuse de rétrograder le dernier administrateur actif', async () => {
    const { error } = await admin.rpc('definir_roles', {
      p_profil: idAdminB,
      p_administrateur: false,
      p_moderateur: false,
    })
    expect(error).not.toBeNull()
    expect(error?.details).toBe('dernier_administrateur')

    // Et vérifier qu'il est TOUJOURS administrateur : un refus qui aurait quand même
    // écrit serait le pire des cas.
    const { data } = await admin
      .from('roles_profil')
      .select('role')
      .eq('profil_id', idAdminB)
    expect(data?.map((l) => l.role)).toContain('administrateur')
  })

  it('refuse de désactiver le compte du dernier administrateur actif', async () => {
    const { error } = await admin.rpc('definir_actif_compte', {
      p_profil: idAdminB,
      p_actif: false,
    })
    expect(error).not.toBeNull()
    expect(error?.details).toBe('dernier_administrateur')
  })

  // CONTRÔLE POSITIF : sans lui, les deux refus seraient satisfaits par une passerelle
  // qui refuse tout.
  it('laisse désactiver un compte ordinaire', async () => {
    const { error } = await admin.rpc('definir_actif_compte', {
      p_profil: idSimple,
      p_actif: false,
    })
    expect(error).toBeNull()
    await admin.rpc('definir_actif_compte', { p_profil: idSimple, p_actif: true })
  })

  it("ne refuse rien quand on retire un rôle que le compte n'a pas", async () => {
    // Le piège de la clause `exists` : sans elle, ce cas serait refusé dès qu'il ne
    // reste qu'un administrateur, et un compte ordinaire deviendrait immodifiable.
    const { error } = await admin.rpc('definir_roles', {
      p_profil: idSimple,
      p_administrateur: false,
      p_moderateur: true,
    })
    expect(error).toBeNull()
  })

  it('refuse son exécution à un compte authentifié ordinaire', async () => {
    const { error } = await clientSimple.rpc('definir_roles', {
      p_profil: idSimple,
      p_administrateur: true,
      p_moderateur: false,
    })
    expect(error).not.toBeNull()
    expect(error?.code).toBe('42501')
  })
})
```

- [ ] **Étape 4 : PREUVE PAR MUTATION de la protection**

1. Retirer du corps de `public.definir_roles` le bloc `if not p_administrateur … raise`.
2. Relancer `npm run test:rls`. **Attendu : les deux tests de refus des rôles tombent, les
   contrôles positifs restent verts.**
3. Restaurer la fonction en réappliquant la migration (`create or replace` la réécrit à
   l'identique), puis relancer : tout vert.
4. Consigner les sorties réelles.

- [ ] **Étape 5 : les six portes, puis commit**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls && npm run test:e2e && npm run build
```

```bash
git add supabase/migrations/20260814130000_passerelles_comptes.sql tests/rls/comptes.test.ts
git commit -m "feat: proteger le dernier administrateur et serialiser les changements de role"
```

---

### Task 13 : l'écran des comptes, en lecture

**Fichiers :**
- Créer : `src/lib/donnees/comptes.ts`
- Créer : `src/app/comptes/page.tsx`
- Modifier : `src/app/tableau-de-bord/page.tsx` (lien vers l'écran)

**Interfaces :**
- Produit : `type CompteListe = { id: string; identifiant: string; nomAffichage: string;
  membreId: string | null; membreNom: string | null; estRacine: boolean; actif: boolean;
  roles: RoleApp[] }` ; `listerComptes(): Promise<CompteListe[]>`.

**Pas de pagination ici, et c'est justifié :** le nombre de comptes suit celui des personnes
qui utilisent l'application, pas celui des membres suivis. La spec place d'ailleurs
l'inscription en masse derrière des tokens (phase 2). Si cet écran devait un jour dépasser
quelques centaines de lignes, il faudrait le paginer comme l'annuaire — le noter plutôt que
de le prétendre résolu.

- [ ] **Étape 1 : écrire la couche données**

Créer `src/lib/donnees/comptes.ts` :

```typescript
import 'server-only'
import { clientServeur } from '@/lib/supabase/serveur'
import type { RoleApp } from './profils'

export type CompteListe = {
  id: string
  identifiant: string
  nomAffichage: string
  membreId: string | null
  membreNom: string | null
  estRacine: boolean
  actif: boolean
  roles: RoleApp[]
}

type LigneMembre = { nom: string; prenom: string } | { nom: string; prenom: string }[] | null

function nomMembre(valeur: LigneMembre): string | null {
  if (!valeur) return null
  const membre = Array.isArray(valeur) ? valeur[0] : valeur
  return membre ? `${membre.prenom} ${membre.nom}` : null
}

/**
 * Tous les comptes, avec leur fiche liée et leurs rôles.
 *
 * Sous RLS : la politique `profils_lecture` ne laisse un non-administrateur voir que son
 * propre profil. L'écran est de toute façon derrière `exigerAdministrateur`, mais
 * s'appuyer sur la RLS plutôt que sur la clé de service maintient le filet : une erreur
 * de garde ne suffirait pas à faire fuiter la liste des comptes.
 */
export async function listerComptes(): Promise<CompteListe[]> {
  const supabase = await clientServeur()
  const { data, error } = await supabase
    .from('profils')
    .select('id, identifiant, nom_affichage, membre_id, est_racine, actif, membres(nom, prenom), roles_profil(role)')
    .order('identifiant')

  if (error) {
    // Un échec ne doit pas être indistinguable d'une liste vide : annoncer « aucun
    // compte » quand la requête a échoué inviterait à en recréer un qui existe déjà.
    throw new Error(`Lecture des comptes impossible : ${error.message}`)
  }

  return (data ?? []).map((ligne) => ({
    id: ligne.id as string,
    identifiant: ligne.identifiant as string,
    nomAffichage: ligne.nom_affichage as string,
    membreId: ligne.membre_id as string | null,
    membreNom: nomMembre(ligne.membres as LigneMembre),
    estRacine: ligne.est_racine as boolean,
    actif: ligne.actif as boolean,
    roles: ((ligne.roles_profil ?? []) as Array<{ role: RoleApp }>).map((r) => r.role),
  }))
}
```

- [ ] **Étape 2 : REJOUER CETTE REQUÊTE CONTRE LA VRAIE BASE**

Le `select` porte deux ressources imbriquées et six colonnes. Ni `tsc`, ni ESLint, ni les
tests unitaires ne lisent l'intérieur de cette chaîne. **Copier le `select` depuis le fichier
livré**, pas depuis ce plan :

Créer `scripts/.tmp-verif/rejouer-comptes.mjs` :

```javascript
import { createClient } from '@supabase/supabase-js'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

// Le `select` doit être COPIÉ depuis src/lib/donnees/comptes.ts, pas depuis le plan.
const { data, error } = await admin
  .from('profils')
  .select('id, identifiant, nom_affichage, membre_id, est_racine, actif, membres(nom, prenom), roles_profil(role)')
  .order('identifiant')

console.log(error ? `ERREUR : ${error.message}` : `OK : ${data.length} compte(s)`)
console.log(JSON.stringify(data?.[0] ?? null, null, 2))
```

```bash
npx dotenv -e .env.local -- node scripts/.tmp-verif/rejouer-comptes.mjs
rm -rf scripts/.tmp-verif
```

Attendu : `OK`, au moins le compte racine, et **regarder la forme réelle** de `membres` et
`roles_profil` dans la sortie JSON — objet ou tableau. C'est cette observation, et non une
supposition, qui valide le traitement de l'étape précédente.

**Point d'attention hérité de la Task 4 de la 1b :** faute de types `Database` générés,
`postgrest-js` déclare toute ressource imbriquée comme un **tableau**, alors que PostgREST
renvoie un **objet** en plusieurs-vers-un. `membres` est du plusieurs-vers-un (un profil, une
fiche), `roles_profil` du un-vers-plusieurs (un profil, plusieurs rôles). D'où le
`nomMembre` qui accepte les deux formes, exactement comme `nomAntenne` dans `membres.ts`.
Ne pas « simplifier » ce détail : il compile en mentant si on le fait.

- [ ] **Étape 3 : écrire l'écran**

Créer `src/app/comptes/page.tsx` :

```tsx
import Link from 'next/link'
import { listerComptes } from '@/lib/donnees/comptes'
import { exigerAdministrateur } from '@/lib/securite/garde'

const LIBELLE_ROLE: Record<string, string> = {
  administrateur: 'Administrateur',
  moderateur: 'Modérateur',
}

export default async function PageComptes() {
  await exigerAdministrateur()
  const comptes = await listerComptes()

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <Link href="/tableau-de-bord" className="text-sm underline underline-offset-4">
        Retour au tableau de bord
      </Link>
      <h1 className="mt-4 mb-2 text-2xl font-semibold">Comptes</h1>
      <p className="mb-8 text-sm text-neutral-500">
        {comptes.length} compte{comptes.length > 1 ? 's' : ''}
      </p>

      <ul className="divide-y divide-neutral-200">
        {comptes.map((compte) => (
          <li key={compte.id} className="py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium">{compte.nomAffichage}</span>
              <span className="text-sm text-neutral-500">{compte.identifiant}</span>
            </div>
            <p className="mt-1 text-sm text-neutral-600">
              {compte.actif ? 'Actif' : 'Désactivé'}
              {' · '}
              {compte.roles.length > 0
                ? compte.roles.map((role) => LIBELLE_ROLE[role] ?? role).join(', ')
                : 'Utilisateur'}
              {' · '}
              {compte.membreNom ? `Fiche : ${compte.membreNom}` : 'Aucune fiche liée'}
              {compte.estRacine ? ' · Compte racine' : ''}
            </p>
          </li>
        ))}
      </ul>
    </main>
  )
}
```

- [ ] **Étape 4 : ajouter le lien au tableau de bord**

Dans `src/app/tableau-de-bord/page.tsx`, après le bloc du lien « Gérer les statuts » et
**à l'intérieur du même `<div className="flex flex-wrap gap-6">** :

```tsx
        {estAdmin ? (
          <Link href="/comptes" className="underline underline-offset-4">
            Gérer les comptes
          </Link>
        ) : null}
```

- [ ] **Étape 5 : VÉRIFICATION PAR RÔLE**

Depuis un compte **ordinaire** : le lien « Comptes » ne doit pas apparaître au tableau de
bord, **et** la navigation directe vers `/comptes` doit rediriger — observé à l'écran, pas
déduit du garde.

- [ ] **Étape 6 : les six portes, puis commit**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls && npm run test:e2e && npm run build
```

```bash
git add src/lib/donnees/comptes.ts src/app/comptes/page.tsx src/app/tableau-de-bord/page.tsx
git commit -m "feat: lister les comptes dans un ecran d'administration"
```

---

### Task 14 : créer un compte et le lier à une fiche

**Fichiers :**
- Créer : `src/app/comptes/messages.ts`
- Créer : `src/app/comptes/actions.ts`
- Créer : `src/app/comptes/formulaire-compte.tsx`
- Créer : `src/app/comptes/ligne-compte.tsx`
- Modifier : `src/app/comptes/page.tsx`

**Interfaces :**
- Consomme : `normaliserIdentifiant`, `identifiantVersEmail` (`src/lib/domaine/identifiant.ts`) ;
  `SelecteurMembre` (Task 5).
- Produit : `creerCompte(etat, donnees): Promise<EtatCompte>` ;
  `lierFiche(donnees: FormData): Promise<void>` ;
  `type EtatCompte = { erreur: string | null; identifiantCree: string | null;
  motDePasseTemporaire: string | null }`.

**Le mot de passe temporaire s'affiche une seule fois** (spec §5.4) et se transmet de vive
voix. Trois conséquences dans le code :
- il n'est **jamais** journalisé — ni `console.log`, ni `console.error`, ni dans un message
  d'erreur ;
- il est renvoyé dans l'état de l'action et **rien n'est redirigé** en cas de succès : une
  redirection le ferait disparaître avant d'avoir été lu ;
- il est tiré d'un alphabet **sans caractères ambigus** (`0`/`O`, `1`/`l`/`I`) : il sera dicté
  à l'oral, et une confusion coûterait un compte inaccessible.

- [ ] **Étape 1 : écrire les messages**

Créer `src/app/comptes/messages.ts` :

```typescript
export const MESSAGE_ECHEC_COMPTE = "Le compte n'a pas pu être créé."
export const MESSAGE_IDENTIFIANT_PRIS = 'Cet identifiant est déjà utilisé.'
export const MESSAGE_CHAMPS_OBLIGATOIRES = "L'identifiant et le nom d'affichage sont obligatoires."
export const MESSAGE_ECHEC_LIAISON = "La fiche n'a pas pu être liée à ce compte."
export const MESSAGE_FICHE_DEJA_LIEE = 'Cette fiche est déjà liée à un autre compte.'
export const MESSAGE_RACINE_SANS_FICHE =
  "Le compte racine ne peut pas être lié à une fiche : il n'a pas de place dans l'arbre."
// Chaîne TypeScript et non JSX : on écrit des apostrophes DROITES, jamais `&apos;`,
// qui s'afficherait littéralement à l'écran. Guillemets doubles, comme l'exige la
// contrainte globale 5.
export const MESSAGE_DERNIER_ADMINISTRATEUR =
  "Il doit rester au moins un administrateur actif. Donnez le rôle à quelqu'un d'autre avant de le retirer ici."
export const MESSAGE_COMPTE_INCONNU = "Ce compte n'existe plus."
export const MESSAGE_ECHEC_ROLES = "Les rôles n'ont pas pu être enregistrés."
export const MESSAGE_ECHEC_ACTIVATION = "L'état du compte n'a pas pu être changé."
export const MESSAGE_ECHEC_REINITIALISATION = "Le mot de passe n'a pas pu être réinitialisé."
```

- [ ] **Étape 2 : écrire les actions de création et de liaison**

Créer `src/app/comptes/actions.ts` :

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { IdentifiantInvalideError, identifiantVersEmail, normaliserIdentifiant } from '@/lib/domaine/identifiant'
import { exigerAdministrateur } from '@/lib/securite/garde'
import { clientAdmin } from '@/lib/supabase/admin'
import {
  MESSAGE_CHAMPS_OBLIGATOIRES,
  MESSAGE_ECHEC_COMPTE,
  MESSAGE_ECHEC_LIAISON,
  MESSAGE_FICHE_DEJA_LIEE,
  MESSAGE_IDENTIFIANT_PRIS,
  MESSAGE_RACINE_SANS_FICHE,
} from './messages'

export type EtatCompte = {
  erreur: string | null
  identifiantCree: string | null
  motDePasseTemporaire: string | null
}

const CODE_VIOLATION_UNICITE = '23505'
const CODE_VIOLATION_CHECK = '23514'

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

export async function creerCompte(_etat: EtatCompte, donnees: FormData): Promise<EtatCompte> {
  await exigerAdministrateur()

  const identifiantBrut = String(donnees.get('identifiant') ?? '').trim()
  const nomAffichage = String(donnees.get('nomAffichage') ?? '').trim()
  if (identifiantBrut.length === 0 || nomAffichage.length === 0) {
    return { erreur: MESSAGE_CHAMPS_OBLIGATOIRES, identifiantCree: null, motDePasseTemporaire: null }
  }

  let identifiant: string
  try {
    identifiant = normaliserIdentifiant(identifiantBrut)
  } catch (erreur) {
    if (erreur instanceof IdentifiantInvalideError) {
      return { erreur: erreur.message, identifiantCree: null, motDePasseTemporaire: null }
    }
    throw erreur
  }

  const supabase = clientAdmin()
  const motDePasse = motDePasseTemporaire()

  const { data: cree, error: erreurAuth } = await supabase.auth.admin.createUser({
    email: identifiantVersEmail(identifiant),
    password: motDePasse,
    email_confirm: true,
    // Le parcours forcé existe depuis la phase 0 : le middleware renvoie vers
    // /changer-mot-de-passe tant que ce drapeau est vrai.
    app_metadata: { doit_changer_mdp: true },
  })

  if (erreurAuth || !cree.user) {
    // Le mot de passe n'apparaît nulle part dans cette trace, et ne doit jamais y
    // apparaître.
    console.error('creerCompte : échec de la création du compte auth', {
      identifiant,
      message: erreurAuth?.message,
    })
    // Supabase renvoie une erreur de doublon d'email quand l'identifiant est pris.
    return {
      erreur: erreurAuth?.message?.includes('already') ? MESSAGE_IDENTIFIANT_PRIS : MESSAGE_ECHEC_COMPTE,
      identifiantCree: null,
      motDePasseTemporaire: null,
    }
  }

  const { error: erreurProfil } = await supabase
    .from('profils')
    .insert({ id: cree.user.id, identifiant, nom_affichage: nomAffichage })

  if (erreurProfil) {
    // Nettoyage du compte auth orphelin : sans lui, l'identifiant resterait pris sans
    // qu'aucun profil ne le montre, et l'administrateur ne pourrait plus le recréer
    // sans intervention en base. Même précaution que `scripts/creer-compte-racine.ts`.
    const { error: erreurNettoyage } = await supabase.auth.admin.deleteUser(cree.user.id)
    console.error("creerCompte : échec de l'insertion du profil", {
      identifiant,
      code: erreurProfil.code,
      details: erreurProfil.details,
      message: erreurProfil.message,
      nettoyage: erreurNettoyage ? `ÉCHOUÉ : ${erreurNettoyage.message}` : 'compte auth supprimé',
    })
    return {
      erreur: erreurProfil.code === CODE_VIOLATION_UNICITE ? MESSAGE_IDENTIFIANT_PRIS : MESSAGE_ECHEC_COMPTE,
      identifiantCree: null,
      motDePasseTemporaire: null,
    }
  }

  revalidatePath('/comptes')
  // PAS de `redirect` : il effacerait l'état, donc le mot de passe temporaire, avant
  // que l'administrateur ait pu le lire. C'est sa seule occasion de le voir.
  return { erreur: null, identifiantCree: identifiant, motDePasseTemporaire: motDePasse }
}

export async function lierFiche(donnees: FormData): Promise<void> {
  await exigerAdministrateur()

  const profilId = String(donnees.get('profilId') ?? '')
  const membreIdBrut = String(donnees.get('membreId') ?? '')
  const membreId = membreIdBrut.length > 0 ? membreIdBrut : null

  if (profilId.length === 0) {
    console.error('lierFiche : identifiant de compte manquant dans le formulaire')
    throw new Error(MESSAGE_ECHEC_LIAISON)
  }

  const { data, error } = await clientAdmin()
    .from('profils')
    .update({ membre_id: membreId })
    .eq('id', profilId)
    .select('id')

  if (error) {
    console.error('lierFiche : échec de la liaison', {
      profilId,
      membreId,
      code: error.code,
      details: error.details,
      message: error.message,
    })
    // `membre_id` est UNIQUE : une fiche déjà liée ailleurs produit 23505. La contrainte
    // CHECK `profils_est_racine_sans_membre` produit 23514 sur le compte racine.
    if (error.code === CODE_VIOLATION_UNICITE) {
      throw new Error(MESSAGE_FICHE_DEJA_LIEE)
    }
    if (error.code === CODE_VIOLATION_CHECK) {
      throw new Error(MESSAGE_RACINE_SANS_FICHE)
    }
    throw new Error(MESSAGE_ECHEC_LIAISON)
  }
  if (!data || data.length === 0) {
    // Une mise à jour qui ne touche aucune ligne ne renvoie AUCUNE erreur : sans ce
    // contrôle, un identifiant forgé produirait un succès apparent.
    throw new Error(MESSAGE_ECHEC_LIAISON)
  }

  revalidatePath('/comptes')
}
```

**Vérifier le nom réel de la contrainte CHECK** dans `20260811120000_socle_profils.sql`
(`check (not est_racine or membre_id is null)`) et ajuster le commentaire s'il diffère.

- [ ] **Étape 3 : écrire le formulaire de création**

Créer `src/app/comptes/formulaire-compte.tsx` :

```tsx
'use client'

import { useActionState, useId } from 'react'
import { creerCompte, type EtatCompte } from './actions'

const etatInitial: EtatCompte = {
  erreur: null,
  identifiantCree: null,
  motDePasseTemporaire: null,
}

export function FormulaireCompte() {
  const [etat, envoyer, enCours] = useActionState(creerCompte, etatInitial)
  const prefixe = useId()
  const idIdentifiant = `${prefixe}-identifiant`

  return (
    <div className="mb-10 flex flex-col gap-4">
      <form action={envoyer} className="flex flex-wrap items-end gap-3">
        {/* Champ AVEC texte d'aide : `htmlFor` explicite et aide sortie du <label>
            (contrainte globale 12). */}
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor={idIdentifiant} className="text-sm font-medium">
            Identifiant
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
            3 à 32 caractères : lettres, chiffres, points ou tirets, commençant par une
            lettre.
          </span>
        </div>

        {/* Champ SANS aide : le <label> enveloppant suffit et donne un nom correct. */}
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium">Nom d&apos;affichage</span>
          <input
            name="nomAffichage"
            required
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
        </label>

        <button
          type="submit"
          disabled={enCours}
          className="rounded-md bg-neutral-900 px-4 py-2 text-white disabled:opacity-50"
        >
          {enCours ? 'Création…' : 'Créer le compte'}
        </button>
      </form>

      {etat.erreur ? (
        <p role="alert" className="text-sm text-red-600">
          {etat.erreur}
        </p>
      ) : null}

      {etat.motDePasseTemporaire ? (
        <div role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">
            Compte « {etat.identifiantCree} » créé.
          </p>
          <p className="mt-2 text-sm text-amber-900">
            Mot de passe temporaire, à transmettre de vive voix :{' '}
            <code className="rounded bg-white px-2 py-1 font-mono">
              {etat.motDePasseTemporaire}
            </code>
          </p>
          <p className="mt-2 text-xs text-amber-800">
            Il ne sera plus jamais affiché. La personne devra en choisir un autre à sa
            première connexion.
          </p>
        </div>
      ) : null}
    </div>
  )
}
```

- [ ] **Étape 4 : écrire la ligne de compte, avec la liaison**

Créer `src/app/comptes/ligne-compte.tsx`. La Task 15 étendra ce même fichier avec les rôles,
l'activation et la réinitialisation.

```tsx
'use client'

import { useState } from 'react'
import type { CompteListe } from '@/lib/donnees/comptes'
import type { MembreBref } from '@/lib/donnees/membres'
import { SelecteurMembre } from '../membres/selecteur-membre'
import { lierFiche } from './actions'

const LIBELLE_ROLE: Record<string, string> = {
  administrateur: 'Administrateur',
  moderateur: 'Modérateur',
}

export function LigneCompte({ compte, estMoi }: { compte: CompteListe; estMoi: boolean }) {
  // `membreNom` porte déjà « Prénom Nom » : on le passe comme `nom` avec un `prenom`
  // vide, forme que `SelecteurMembre` sait afficher telle quelle.
  const [fiche, setFiche] = useState<MembreBref | null>(
    compte.membreId && compte.membreNom
      ? { id: compte.membreId, nom: compte.membreNom, prenom: '' }
      : null,
  )

  return (
    <li className="py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">
          {compte.nomAffichage}
          {estMoi ? <span className="ml-2 text-xs text-neutral-500">C&apos;est votre compte.</span> : null}
        </span>
        <span className="text-sm text-neutral-500">{compte.identifiant}</span>
      </div>

      <p className="mt-1 text-sm text-neutral-600">
        {compte.actif ? 'Actif' : 'Désactivé'}
        {' · '}
        {compte.roles.length > 0
          ? compte.roles.map((role) => LIBELLE_ROLE[role] ?? role).join(', ')
          : 'Utilisateur'}
      </p>

      {compte.estRacine ? (
        // La contrainte CHECK `not est_racine or membre_id is null` interdit cette
        // liaison (spec D11) : proposer un formulaire qui ne peut qu'échouer serait
        // pire que ne rien proposer.
        <p className="mt-3 text-sm text-neutral-600">
          Compte racine : sans place dans l&apos;arbre, donc sans fiche liée.
        </p>
      ) : (
        <form action={lierFiche} className="mt-3 flex flex-wrap items-end gap-3">
          <input type="hidden" name="profilId" value={compte.id} />
          <div className="min-w-64 flex-1">
            <SelecteurMembre
              nom="membreId"
              label="Fiche liée"
              aide="Détacher la fiche retire la portée d'autorité de ce compte."
              valeur={fiche}
              surChoix={setFiche}
              exclureId={null}
            />
          </div>
          <button
            type="submit"
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm"
          >
            Enregistrer la fiche
          </button>
        </form>
      )}
    </li>
  )
}
```

- [ ] **Étape 5 : brancher les deux sur l'écran**

Dans `src/app/comptes/page.tsx` : ajouter `<FormulaireCompte />` au-dessus de la liste, et
remplacer le corps de chaque `<li>` par `<LigneCompte compte={compte} estMoi={compte.id ===
profil.id} />`. Le garde renvoie déjà le profil :

```tsx
  const profil = await exigerAdministrateur()
  const comptes = await listerComptes()
```

et la liste devient :

```tsx
      <ul className="divide-y divide-neutral-200">
        {comptes.map((compte) => (
          <LigneCompte key={compte.id} compte={compte} estMoi={compte.id === profil.id} />
        ))}
      </ul>
```

Le tableau `LIBELLE_ROLE` de `page.tsx` devient inutile — il vit désormais dans
`ligne-compte.tsx`. Le supprimer plutôt que de laisser deux copies diverger.

- [ ] **Étape 6 : VÉRIFICATION MANUELLE, jusqu'en base**

1. Créer un compte, **relever le mot de passe affiché**, se déconnecter, se connecter avec
   lui : le parcours forcé de changement de mot de passe doit se déclencher.
2. Recharger `/comptes` après la création : le mot de passe **ne doit plus apparaître**.
3. Tenter de créer un compte avec un identifiant déjà pris : message « Cet identifiant est
   déjà utilisé. », et **vérifier en base** qu'aucun compte auth orphelin n'a été laissé
   (`listUsers`, chercher l'email correspondant).
4. Lier une fiche déjà liée à un autre compte : message dédié.
5. Vérifier qu'aucune trace serveur ne contient le mot de passe :
   `grep -i "<mot de passe relevé>" <journal du serveur>` — **contrôle positif obligatoire** :
   chercher d'abord une chaîne dont on sait qu'elle EST dans le journal (par exemple
   `creerCompte`), pour prouver que la recherche fonctionne, avant de conclure d'une absence.

- [ ] **Étape 7 : les six portes, puis commit**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls && npm run test:e2e && npm run build
```

```bash
git add src/app/comptes
git commit -m "feat: creer un compte et le lier a une fiche membre"
```

---

### Task 15 : rôles, activation et réinitialisation du mot de passe

**Fichiers :**
- Modifier : `src/app/comptes/actions.ts`
- Modifier : `src/app/comptes/ligne-compte.tsx` (créé à la Task 14)

**Interfaces :**
- Consomme : `definir_roles`, `definir_actif_compte` (Task 12).
- Produit : `definirRoles(donnees)`, `basculerActivation(donnees)`,
  `reinitialiserMotDePasse(etat, donnees): Promise<EtatCompte>`.

- [ ] **Étape 1 : ajouter les trois actions**

Dans `src/app/comptes/actions.ts` :

```typescript
const DETAIL_DERNIER_ADMINISTRATEUR = 'dernier_administrateur'
const DETAIL_COMPTE_INCONNU = 'compte_inconnu'

/**
 * Rôles d'un compte. Passe par la passerelle sérialisée : la protection du dernier
 * administrateur est un lire-puis-écrire, et deux administrateurs se rétrogradant
 * simultanément passeraient tous les deux sans le verrou (voir la migration
 * 20260814130000). Ne JAMAIS écrire directement dans `roles_profil`.
 */
export async function definirRoles(donnees: FormData): Promise<void> {
  await exigerAdministrateur()

  const profilId = String(donnees.get('profilId') ?? '')
  if (profilId.length === 0) {
    console.error('definirRoles : identifiant de compte manquant dans le formulaire')
    throw new Error(MESSAGE_ECHEC_ROLES)
  }

  const { error } = await clientAdmin().rpc('definir_roles', {
    p_profil: profilId,
    p_administrateur: donnees.get('administrateur') === 'on',
    p_moderateur: donnees.get('moderateur') === 'on',
  })

  if (error) {
    console.error('definirRoles : échec RPC definir_roles', {
      profilId,
      code: error.code,
      details: error.details,
      message: error.message,
    })
    if (error.details === DETAIL_DERNIER_ADMINISTRATEUR) {
      throw new Error(MESSAGE_DERNIER_ADMINISTRATEUR)
    }
    if (error.details === DETAIL_COMPTE_INCONNU) {
      throw new Error(MESSAGE_COMPTE_INCONNU)
    }
    throw new Error(MESSAGE_ECHEC_ROLES)
  }

  revalidatePath('/comptes')
}

export async function basculerActivation(donnees: FormData): Promise<void> {
  await exigerAdministrateur()

  const profilId = String(donnees.get('profilId') ?? '')
  const actif = donnees.get('actif') === '1'
  if (profilId.length === 0) {
    console.error('basculerActivation : identifiant de compte manquant dans le formulaire')
    throw new Error(MESSAGE_ECHEC_ACTIVATION)
  }

  const { error } = await clientAdmin().rpc('definir_actif_compte', {
    p_profil: profilId,
    p_actif: actif,
  })

  if (error) {
    console.error('basculerActivation : échec RPC definir_actif_compte', {
      profilId,
      actif,
      code: error.code,
      details: error.details,
      message: error.message,
    })
    if (error.details === DETAIL_DERNIER_ADMINISTRATEUR) {
      throw new Error(MESSAGE_DERNIER_ADMINISTRATEUR)
    }
    throw new Error(MESSAGE_ECHEC_ACTIVATION)
  }

  revalidatePath('/comptes')
}

/**
 * Réinitialisation par un administrateur (spec §5.4) : un mot de passe temporaire est
 * tiré, affiché UNE SEULE FOIS, et `doit_changer_mdp` est reposé — la personne devra en
 * choisir un autre à sa connexion suivante.
 *
 * Même précaution que `creerCompte` : rien ne redirige, sinon le mot de passe
 * disparaîtrait avant d'avoir été lu, et il n'apparaît dans aucune trace.
 */
export async function reinitialiserMotDePasse(
  _etat: EtatCompte,
  donnees: FormData,
): Promise<EtatCompte> {
  await exigerAdministrateur()

  const profilId = String(donnees.get('profilId') ?? '')
  const identifiant = String(donnees.get('identifiant') ?? '')
  if (profilId.length === 0) {
    return { erreur: MESSAGE_ECHEC_REINITIALISATION, identifiantCree: null, motDePasseTemporaire: null }
  }

  const motDePasse = motDePasseTemporaire()
  const { error } = await clientAdmin().auth.admin.updateUserById(profilId, {
    password: motDePasse,
    app_metadata: { doit_changer_mdp: true },
  })

  if (error) {
    console.error('reinitialiserMotDePasse : échec', { profilId, message: error.message })
    return { erreur: MESSAGE_ECHEC_REINITIALISATION, identifiantCree: null, motDePasseTemporaire: null }
  }

  revalidatePath('/comptes')
  return { erreur: null, identifiantCree: identifiant, motDePasseTemporaire: motDePasse }
}
```

**Attention :** `updateUserById` prend l'identifiant de l'utilisateur **auth**, qui est égal à
`profils.id` par construction (spec §4.1 : « `id` uuid PK — Égal à `auth.users.id` »).
Le vérifier plutôt que de le supposer, en relisant `20260811120000_socle_profils.sql`.

- [ ] **Étape 2 : étendre la ligne de compte**

**Choix à ne pas défaire :** on n'empêche PAS un administrateur de se retirer son propre rôle.
La passerelle refusera s'il est le dernier ; s'ils sont deux, c'est une action volontaire et
légitime — passer la main. Désactiver le bouton empêcherait ce cas normal pour se protéger
d'un cas que la base couvre déjà. La mention « C'est votre compte. » suffit à avertir.

Ajouter à `src/app/comptes/ligne-compte.tsx` les imports et le bloc d'actions :

```tsx
import { useActionState, useId, useState } from 'react'
import {
  basculerActivation,
  definirRoles,
  lierFiche,
  reinitialiserMotDePasse,
  type EtatCompte,
} from './actions'

const etatInitial: EtatCompte = {
  erreur: null,
  identifiantCree: null,
  motDePasseTemporaire: null,
}
```

Dans le composant, avant le `return` :

```tsx
  const [etatMdp, reinitialiser, reinitialisationEnCours] = useActionState(
    reinitialiserMotDePasse,
    etatInitial,
  )
  const prefixe = useId()
  const idAdmin = `${prefixe}-administrateur`
  const idModerateur = `${prefixe}-moderateur`
```

Puis, après le formulaire de liaison, à l'intérieur du `<li>` :

```tsx
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <form action={definirRoles} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="profilId" value={compte.id} />
          <label htmlFor={idAdmin} className="flex items-center gap-2 text-sm">
            <input
              id={idAdmin}
              name="administrateur"
              type="checkbox"
              defaultChecked={compte.roles.includes('administrateur')}
            />
            Administrateur
          </label>
          <label htmlFor={idModerateur} className="flex items-center gap-2 text-sm">
            <input
              id={idModerateur}
              name="moderateur"
              type="checkbox"
              defaultChecked={compte.roles.includes('moderateur')}
            />
            Modérateur
          </label>
          <button type="submit" className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm">
            Enregistrer les rôles
          </button>
        </form>

        <form action={basculerActivation}>
          <input type="hidden" name="profilId" value={compte.id} />
          {/* La valeur envoyée est l'état VOULU, pas l'état courant : sans cette
              inversion explicite, un double-clic ou un onglet périmé rejouerait
              l'état déjà en place au lieu de le basculer. */}
          <input type="hidden" name="actif" value={compte.actif ? '0' : '1'} />
          <button type="submit" className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm">
            {compte.actif ? 'Désactiver' : 'Réactiver'}
          </button>
        </form>

        <form action={reinitialiser}>
          <input type="hidden" name="profilId" value={compte.id} />
          <input type="hidden" name="identifiant" value={compte.identifiant} />
          <button
            type="submit"
            disabled={reinitialisationEnCours}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-50"
          >
            {reinitialisationEnCours ? 'Réinitialisation…' : 'Réinitialiser le mot de passe'}
          </button>
        </form>
      </div>

      {etatMdp.erreur ? (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {etatMdp.erreur}
        </p>
      ) : null}

      {etatMdp.motDePasseTemporaire ? (
        <div role="alert" className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm text-amber-900">
            Nouveau mot de passe temporaire de « {etatMdp.identifiantCree} », à transmettre de
            vive voix :{' '}
            <code className="rounded bg-white px-2 py-1 font-mono">
              {etatMdp.motDePasseTemporaire}
            </code>
          </p>
          <p className="mt-2 text-xs text-amber-800">
            Il ne sera plus jamais affiché. La personne devra en choisir un autre à sa
            prochaine connexion.
          </p>
        </div>
      ) : null}
```

**`definirRoles` et `basculerActivation` lèvent en cas de refus** — elles n'ont pas de canal
d'état. Le refus du dernier administrateur s'affiche donc par la page d'erreur de Next, avec
le message porté par l'exception. C'est acceptable pour un cas rare et volontairement
bruyant ; si l'usage montre que ça surprend, leur donner un `useActionState` comme à
`reinitialiserMotDePasse`. **Le dire dans le rapport plutôt que de le laisser découvrir.**

- [ ] **Étape 3 : VÉRIFICATION MANUELLE, y compris le cas limite**

1. Deux comptes administrateurs : rétrograder le premier → succès. Rétrograder le second →
   message « Il doit rester au moins un administrateur actif. » **et** vérifier en base qu'il
   est toujours administrateur.
2. Désactiver un compte ordinaire, vérifier qu'il ne peut plus se connecter, le réactiver.
3. Réinitialiser un mot de passe, relever la valeur, se connecter avec : le parcours forcé
   doit se déclencher.
4. **Rétablir l'état initial des comptes réels** après ces essais, et le vérifier.

- [ ] **Étape 4 : les six portes, puis commit**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls && npm run test:e2e && npm run build
```

```bash
git add src/app/comptes
git commit -m "feat: gerer les roles, l'activation et la reinitialisation des comptes"
```

---

### Task 16 : documentation et vérification finale

**Fichiers :**
- Modifier : `README.md`
- Modifier : `docs/superpowers/specs/2026-08-11-suivi-asonkeng-design.md`

- [ ] **Étape 1 : vérifier le renvoi D18 → D15 dans la spécification maîtresse**

**Déjà fait avant le lancement du plan** (commit de la spécification maîtresse) : le §2 porte
un encadré renvoyant à D17–D21 du design 1c et disant explicitement que D18 amende D15.
Cette étape se limite donc à **vérifier** que l'encadré est toujours là et toujours exact
après les 15 tâches précédentes — pas à le réécrire.

Y vérifier aussi la ligne **D22** (le modérateur gère le calendrier AEL récurrent, amendement
du 2026-08-12) : elle est **hors périmètre 1c** et concerne le plan de la phase 3. Ne rien
implémenter pour elle ici ; s'assurer seulement qu'elle n'a pas disparu.

**Relire la documentation quand le monde change autour d'elle, pas seulement quand on la
modifie.** En 1a, le README affirmait le contraire de la réalité sur le déploiement.

- [ ] **Étape 2 : compléter le README**

Ajouter une section « Phase 1c », sur le modèle des sections 1a et 1b : l'arborescence et son
garde-fou anti-cycle, la portée d'autorité et ce qu'elle ouvre, l'écran des comptes, la
pagination de l'annuaire. Mettre à jour la « Règle de sécurité » : la modification des statuts
n'est plus réservée aux administrateurs, elle est ouverte à la portée d'autorité, et le point
d'entrée unique s'appelle désormais aussi `exigerAutoriteSur`.

Signaler, comme le README le fait déjà pour les antennes et les statuts, que la nouvelle
migration ne crée aucun amorçage — donc rien à dire de plus sur l'idempotence.

- [ ] **Étape 3 : vérification finale sur un APERÇU, pas en production**

Déployer un aperçu Vercel et y vérifier en vrai navigateur :
1. rattachement d'un membre, proposition du dirigeant, retour au calcul ;
2. cycle refusé avec le chemin fautif affiché ;
3. archivage d'un faiseur de disciple refusé avec ses disciples nommés ;
4. modification d'un statut par un compte **non administrateur** lié à un ancêtre ;
5. refus du même geste sur un membre hors de sa portée ;
6. création d'un compte, mot de passe temporaire, parcours forcé ;
7. pagination de l'annuaire.

**Contrôle positif de la clé de service** (rappel de la 1b) : chercher dans les octets servis
par la page un texte **connu présent** (« Se connecter ») pour prouver que la méthode de
recherche fonctionne, puis chercher le **suffixe distinctif** de la clé de service. Les deux
clés partagent une centaine de caractères de préfixe : une recherche sur le début crierait au
loup.

**Si un secret de contournement de la protection SSO est nécessaire pour que Playwright
atteigne l'aperçu, le dire, et le révoquer après usage** — une action sur le compte Vercel de
l'utilisateur, même révoquée, se signale.

- [ ] **Étape 4 : nettoyage vérifié par comptage**

```sql
select count(*) from membres where nom like 'ZZ%';
select count(*) from profils where identifiant like 'test.%';
```

**Limite à dire, héritée de la 1b :** ces comptages sont **globaux**. Le projet Supabase sert
au développement et à la production (décision utilisateur). Tant que l'application ne porte
pas de vrais membres, un comptage global à zéro est significatif. **Dès qu'elle en portera,
cette vérification devra être filtrée** — la 1c est probablement la dernière phase où ce
raccourci reste acceptable.

- [ ] **Étape 5 : commit final**

```bash
git add README.md docs/superpowers/specs/2026-08-11-suivi-asonkeng-design.md
git commit -m "docs: documenter la phase 1c et reporter l'amendement D18 sur D15"
```

---

## Ce que ce plan ne livre pas, volontairement

- **Tokens d'inscription, demandes de suivi, notifications** — phase 2.
- **Index de recherche sur `membres`** — voir §6.2 du design : à justifier par une mesure,
  pas par une intuition.
- **Pagination de l'écran des comptes** — le nombre de comptes suit celui des utilisateurs,
  pas celui des membres. À reprendre si cet écran dépasse quelques centaines de lignes.
- **Journal des mouvements d'arbre** — la spécification ne le demande pas. Si l'usage montre
  qu'il manque, il se posera comme `journal_statuts`, sans rien remettre en cause.
- **Vue d'arbre graphique** — la fiche montre la filiation et les disciples directs, ce qui
  suffit aux parcours décrits. Une vue d'ensemble est un écran à part entière, à cadrer.
