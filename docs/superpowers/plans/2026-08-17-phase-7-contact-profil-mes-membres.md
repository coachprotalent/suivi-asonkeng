# Phase 7 — Contact, page de profil, « Mes membres » — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un troisième lien de relation (« contact ») à la fiche membre, donner à chaque compte une page de profil avec auto-édition bornée de ses coordonnées, et livrer un écran « Mes membres » à quatre sections distinctes.

**Architecture :** Trois lots séparés. **A** ajoute la colonne `membres.contact_id` et la fait traverser la couche domaine existante (`FicheMembre`), ce qui la rend saisissable à la création et en modification d'un seul geste. **B** ouvre le premier chemin d'écriture non administrateur du projet, derrière une passerelle SQL dont **la signature EST la liste blanche des colonnes**. **C** ajoute deux fonctions SQL récursives paginées et un écran de lecture à quatre sections.

**Tech Stack :** Next.js 16.3 (App Router, Server Components, Server Actions), React 19.2, TypeScript 6, Supabase (Postgres + RLS + PostgREST), Tailwind 4, Vitest, Playwright.

**Spécification :** `docs/superpowers/specs/2026-08-17-phase-7-contact-profil-mes-membres-design.md`. Chaque décision D130–D148 y est justifiée ; ce plan les applique sans les rouvrir.

## Global Constraints

Ces règles valent pour **toutes** les tâches. Elles viennent du dépôt, pas d'une préférence.

- **`AGENTS.md` : ce n'est pas le Next.js habituel.** Lire le guide pertinent dans `node_modules/next/dist/docs/` avant d'écrire du code Next. Le bloc `AGENTS.md` est réécrit par `next dev` — le commiter avec le travail garde l'arbre propre.
- **Aucune politique d'écriture RLS n'est ajoutée, sur aucune table.** Toutes les écritures passent par des Server Actions et la clé de service (D140).
- **Toute page et toute Server Action commence par un garde** de `src/lib/securite/garde.ts`. L'unique exception documentée du projet est `src/app/inscription/actions.ts`.
- **On discrimine les erreurs Postgres sur `error.code` et `error.details`, JAMAIS sur la prose** (française ou anglaise).
- **`error.details` n'est journalisé que s'il figure dans une liste fermée de marqueurs connus.** Sur une violation `check` (23514), Postgres y écrit `Failing row contains (…)` — la fiche entière, téléphone et adresse compris.
- **Tous les champs de formulaire sont contrôlés (D85).** Aucun `defaultValue`. React remet à zéro les champs non contrôlés à toute complétion d'action, y compris sur un refus *retourné*.
- **Toute lecture de liste est paginée avec un tri TOTAL** (`nom`, `prenom`, puis `id`). PostgREST tronque en silence au-delà de `max_rows = 1000` (`supabase/config.toml`).
- **Un échec de lecture ne doit jamais être indistinguable d'un résultat vide.** On lève, on ne rend pas `[]`.
- **Une écriture sans effet ne doit jamais passer pour un succès.** `.select('id')` après `update`, ou `if not found` en plpgsql.
- **Migrations additives uniquement.** Une migration déjà appliquée ne se réécrit pas.
- **Nommer les arguments de `rpc()`**, jamais de positionnel.
- **Langue :** tout le code, les commentaires, les messages et les identifiants sont en français, comme le reste du dépôt.
- **Portes de test :** `npm test` (Vitest) à chaque commit. `npm run test:rls` à la fin de chaque tâche qui touche au SQL. **`npm run test:e2e` (≈ 7,5 min) et `npm run build` tournent une fois par lot**, aux tâches 5, 10 et 15 — pas avant chaque commit.

---

## Structure des fichiers

### Lot A — le contact

| Action | Fichier | Responsabilité |
|--------|---------|----------------|
| Créer | `supabase/migrations/20260820100000_contact_membre.sql` | Colonne, contrainte, index, commentaire |
| Créer | `supabase/migrations/20260820110000_creer_membre_enrichi_contact.sql` | Remplacement de la passerelle de création (D135) |
| Modifier | `src/lib/domaine/membre.ts` | `FicheMembre.contactId` + extraction de `normaliserCoordonnees` |
| Modifier | `src/lib/domaine/membre.test.ts` | Preuves du contact et des coordonnées |
| Modifier | `src/lib/donnees/membres.ts` | `MembreDetail.contactId`, `COLONNES_DETAIL` |
| Modifier | `src/app/membres/messages.ts` | `MESSAGE_CONTACT_INCONNU` |
| Modifier | `src/app/membres/actions.ts` | Contrôle amont (D136), `p_contact` |
| Modifier | `src/app/membres/formulaire-membre.tsx` | Champ « Contact » |
| Modifier | `src/app/membres/[id]/page.tsx` | Ligne « Contact » (D134), relibellé (D133) |
| Créer | `tests/rls/contact.test.ts` | La colonne, sa contrainte, l'absence d'effet RLS |
| Créer | `tests/e2e/contact.spec.ts` | Saisie à la création, lecture sur la fiche |

### Lot B — profil et auto-édition

| Action | Fichier | Responsabilité |
|--------|---------|----------------|
| Créer | `supabase/migrations/20260820120000_modifier_mon_profil.sql` | La passerelle (D137, D138) |
| Modifier | `src/lib/donnees/profils.ts` | `Profil.creeLe` |
| Créer | `src/app/profil/messages.ts` | Messages de l'écran |
| Créer | `src/app/profil/actions.ts` | `modifierMonProfil` |
| Créer | `src/app/profil/formulaire-coordonnees.tsx` | Formulaire contrôlé, six champs |
| Créer | `src/app/profil/page.tsx` | Les quatre blocs |
| Créer | `tests/rls/profil-personnel.test.ts` | Les cinq preuves du §5.3 de la spec |
| Créer | `tests/e2e/profil.spec.ts` | Auto-édition, et absence des champs fermés |

### Lot C — « Mes membres »

| Action | Fichier | Responsabilité |
|--------|---------|----------------|
| Créer | `supabase/migrations/20260820130000_descendants_membre.sql` | Les deux fonctions récursives (D141, D148) |
| Créer | `src/lib/donnees/mes-membres-lots.ts` | Lectures paginées, **sans** `server-only` (testable hors Next) |
| Créer | `src/lib/donnees/mes-membres.ts` | Enveloppes `server-only` |
| Créer | `src/lib/domaine/mes-membres.ts` | Composition pure des sections |
| Créer | `src/lib/domaine/mes-membres.test.ts` | Preuves de composition |
| Créer | `src/app/mes-membres/page.tsx` | Les quatre sections |
| Créer | `src/app/mes-membres/section.tsx` | Une section réutilisée quatre fois |
| Modifier | `src/app/tableau-de-bord/page.tsx` | Deux entrées de navigation |
| Créer | `tests/rls/descendants.test.ts` | Parcours, filtre d'état, pagination, privilèges |
| Créer | `tests/e2e/mes-membres.spec.ts` | Les quatre sections, la mention, la pagination |

---

# LOT A — LE CHAMP CONTACT

### Task 1 : La colonne `contact_id`

**Files :**
- Create: `supabase/migrations/20260820100000_contact_membre.sql`
- Create: `tests/rls/contact.test.ts`

**Interfaces :**
- Produces: colonne `public.membres.contact_id uuid`, contrainte `membres_pas_son_propre_contact`, index `membres_contact_id_idx`.

- [ ] **Step 1 : Écrire la migration**

Créer `supabase/migrations/20260820100000_contact_membre.sql` :

```sql
-- Phase 7, D130 / D131 / D132 — la troisième relation de la fiche membre.
--
-- Le contact répond à « qui a une bonne relation avec cette personne ? », en plus du
-- faiseur de disciple et du dirigeant. C'est une COLONNE ORDINAIRE DE LA FICHE, pas une
-- relation d'arbre (D130) : elle est écrite par le même `update` que le téléphone et la
-- ville, jamais par `public.definir_arbre`, qui prend le verrou consultatif anti-cycle et
-- incarne la filiation.
--
-- AUCUN DÉCLENCHEUR ANTI-CYCLE, ET C'EST UN CHOIX (D131). Le contact n'est pas
-- hiérarchique : que A soit le contact de B ET B celui de A est légitime et attendu.
-- Aucune fonction récursive du projet ne parcourt cette colonne — `public.ancetres_membre`,
-- `public.chemin_arbre` et `public.descendants_membre` (phase 7, lot C) ne suivent que
-- `faiseur_de_disciple_id`. Seul le cas dégénéré est fermé, par la contrainte ci-dessous.
--
-- AUCUNE MODIFICATION DE RLS (D132). `membres_lecture` n'est pas touchée : le contact ne
-- confère AUCUN droit et AUCUNE lecture élargie. Décision de l'utilisateur, prise une fois
-- établi que la politique ouvre DÉJÀ toutes les fiches actives à tout compte actif — une
-- « lecture élargie » n'aurait donc rien changé sur une fiche active, et n'aurait ajouté
-- que la visibilité des fiches archivées et en attente.
--
-- `on delete set null`, comme `faiseur_de_disciple_id` et `dirigeant_id` : la suppression
-- d'une fiche ne doit pas échouer parce qu'elle était le contact de quelqu'un.

alter table public.membres
  add column contact_id uuid references public.membres (id) on delete set null;

alter table public.membres
  add constraint membres_pas_son_propre_contact check (contact_id is distinct from id);

-- Sert la section « ceux dont je suis contact » de /mes-membres (lot C).
create index membres_contact_id_idx on public.membres (contact_id);

comment on column public.membres.contact_id is
  'Personne en bonne relation avec ce membre (phase 7, D130). PUREMENT INFORMATIF : n''entre dans aucun calcul d''autorité (peutModifier, prive.peut_lire_membre), n''ouvre aucune lecture (membres_lecture inchangée, D132), et n''est parcouru par aucune fonction récursive de l''arbre (D131). Écrite par la même voie que les autres colonnes de la fiche, jamais par public.definir_arbre.';
```

- [ ] **Step 2 : Écrire les preuves RLS (elles doivent échouer)**

Créer `tests/rls/contact.test.ts`. Ouvrir d'abord `tests/rls/membres.test.ts` pour reprendre **exactement** ses utilitaires de connexion, sa création de fixtures et son nettoyage — ne pas en inventer d'autres.

```ts
import { describe, expect, it } from 'vitest'
// Reprendre les imports d'amorçage de tests/rls/membres.test.ts (client admin,
// création de comptes de test, nettoyage). NE PAS inventer un second jeu d'outils.

describe('contact_id', () => {
  it('accepte un contact désignant un autre membre', async () => {
    // Créer deux membres A et B via le client admin, puis
    // update membres set contact_id = B.id where id = A.id
    // Attendu : succès, et relecture rendant contact_id = B.id
  })

  it('refuse un membre comme son propre contact', async () => {
    // update membres set contact_id = A.id where id = A.id
    // Attendu : erreur, code '23514', contrainte membres_pas_son_propre_contact
  })

  it('accepte un contact réciproque : A contact de B et B contact de A', async () => {
    // D131 : aucun anti-cycle sur cette colonne. Les DEUX updates réussissent.
  })

  it("remet contact_id à null quand la fiche contact est supprimée", async () => {
    // delete from membres where id = B.id  →  A.contact_id vaut null, la suppression réussit
  })

  it("ne change RIEN à ce qu'un compte ordinaire peut lire (D132)", async () => {
    // Un compte ordinaire lit la fiche ACTIVE d'un membre dont il est le contact : succès,
    // comme pour n'importe quelle fiche active — ce n'est pas le contact qui l'ouvre.
    // Le même compte NE lit PAS une fiche ARCHIVÉE dont il est le contact.
  })
})
```

- [ ] **Step 3 : Lancer les preuves pour vérifier qu'elles échouent**

Run: `npm run test:rls -- contact`
Expected: FAIL — `column "contact_id" does not exist`.

- [ ] **Step 4 : Appliquer la migration**

Run: `npx supabase db push` (ou la commande d'application employée par le dépôt — vérifier `supabase/config.toml` et l'historique des phases précédentes avant d'inventer une commande).

- [ ] **Step 5 : Relancer les preuves**

Run: `npm run test:rls -- contact`
Expected: PASS, les cinq preuves.

- [ ] **Step 6 : Commit**

```bash
git add supabase/migrations/20260820100000_contact_membre.sql tests/rls/contact.test.ts
git commit -m "feat(base): ajouter membres.contact_id, sans anti-cycle et sans effet RLS"
```

---

### Task 2 : `FicheMembre.contactId` et l'extraction des coordonnées

**Files :**
- Modify: `src/lib/domaine/membre.ts`
- Test: `src/lib/domaine/membre.test.ts`

**Interfaces :**
- Produces :
  - `FicheMembre` gagne `contactId: string | null`
  - `export type CoordonneesPersonnelles = { telephone: string | null; emailContact: string | null; ville: string | null; pays: string | null; situation: SituationMembre | null; domaineEtude: string | null }`
  - `export function coordonneesPersonnellesDepuisFormData(donnees: FormData): CoordonneesPersonnelles`
  - `ficheMembreVersColonnes` rend désormais la clé `contact_id`
- Consumes : rien.

> **Pourquoi l'extraction maintenant, et pas au lot B.** Le lot B a besoin d'exactement six des champs de `FicheMembre`, avec **la même** validation d'e-mail et **la même** règle « domaine d'étude réservé à l'étudiant ». Les recopier là-bas ferait deux vérités : le jour où le format d'e-mail change, une seule des deux bougerait. On extrait donc ici, pendant qu'on est déjà dans ce fichier.

- [ ] **Step 1 : Écrire les tests qui échouent**

Ajouter à `src/lib/domaine/membre.test.ts` :

```ts
describe('contact', () => {
  it('lit un contact renseigné', () => {
    const fiche = normaliserFicheMembre({ nom: 'Ada', prenom: 'Lovelace', contactId: 'c1' })
    expect(fiche.contactId).toBe('c1')
  })

  it('ramène un contact vide à null', () => {
    expect(normaliserFicheMembre({ nom: 'Ada', prenom: 'Lovelace', contactId: '  ' }).contactId).toBeNull()
  })

  it('ramène un contact absent à null', () => {
    expect(normaliserFicheMembre({ nom: 'Ada', prenom: 'Lovelace' }).contactId).toBeNull()
  })

  it('refuse un contact qui n\'est pas du texte', () => {
    expect(() => normaliserFicheMembre({ nom: 'Ada', prenom: 'Lovelace', contactId: 42 })).toThrow(
      FicheMembreInvalideError,
    )
  })

  it('porte contact_id dans les colonnes', () => {
    const colonnes = ficheMembreVersColonnes(
      normaliserFicheMembre({ nom: 'Ada', prenom: 'Lovelace', contactId: 'c1' }),
    )
    expect(colonnes.contact_id).toBe('c1')
  })
})

describe('coordonneesPersonnellesDepuisFormData', () => {
  function formulaire(champs: Record<string, string>): FormData {
    const donnees = new FormData()
    for (const [cle, valeur] of Object.entries(champs)) donnees.set(cle, valeur)
    return donnees
  }

  it('lit les six champs autorisés', () => {
    const coordonnees = coordonneesPersonnellesDepuisFormData(
      formulaire({
        telephone: '0600000000',
        emailContact: 'ada@example.org',
        ville: 'Douala',
        pays: 'Cameroun',
        situation: 'etudiant',
        domaineEtude: 'Mathématiques',
      }),
    )
    expect(coordonnees).toEqual({
      telephone: '0600000000',
      emailContact: 'ada@example.org',
      ville: 'Douala',
      pays: 'Cameroun',
      situation: 'etudiant',
      domaineEtude: 'Mathématiques',
    })
  })

  it("efface le domaine d'étude hors situation étudiante", () => {
    const coordonnees = coordonneesPersonnellesDepuisFormData(
      formulaire({ situation: 'travailleur', domaineEtude: 'Mathématiques' }),
    )
    expect(coordonnees.domaineEtude).toBeNull()
  })

  it('refuse une adresse de contact mal formée', () => {
    expect(() => coordonneesPersonnellesDepuisFormData(formulaire({ emailContact: 'pas-une-adresse' }))).toThrow(
      FicheMembreInvalideError,
    )
  })

  it('refuse une situation inconnue', () => {
    expect(() => coordonneesPersonnellesDepuisFormData(formulaire({ situation: 'retraite' }))).toThrow(
      FicheMembreInvalideError,
    )
  })

  it('ne lit AUCUN champ fermé, même présent dans le formulaire (D138)', () => {
    const coordonnees = coordonneesPersonnellesDepuisFormData(
      formulaire({ nom: 'Usurpateur', prenom: 'Malveillant', antenneId: 'a1', contactId: 'c1', etat: 'archive' }),
    )
    expect(Object.keys(coordonnees).sort()).toEqual(
      ['domaineEtude', 'emailContact', 'pays', 'situation', 'telephone', 'ville'].sort(),
    )
  })
})
```

Ajouter `coordonneesPersonnellesDepuisFormData` à l'import en tête du fichier de test.

- [ ] **Step 2 : Lancer les tests pour vérifier qu'ils échouent**

Run: `npm test -- membre`
Expected: FAIL — `coordonneesPersonnellesDepuisFormData is not a function`, et `fiche.contactId` vaut `undefined`.

- [ ] **Step 3 : Implémenter**

Dans `src/lib/domaine/membre.ts` :

Ajouter le type et la fonction extraite, **au-dessus** de `normaliserFicheMembre` :

```ts
/**
 * Les SEULS champs de fiche qu'un compte peut modifier LUI-MÊME (phase 7, D138).
 *
 * Ce type n'est pas une commodité : c'est la moitié applicative de la liste blanche.
 * L'autre moitié, structurelle, est la signature de `public.modifier_mon_profil`, qui ne
 * prend même pas en paramètre ce qui doit rester fermé. Nom, prénom, antenne, place dans
 * l'arbre, contact, report AEL, état, et TOUTE colonne de `profils` restent réservés à
 * l'administrateur.
 */
export type CoordonneesPersonnelles = {
  telephone: string | null
  emailContact: string | null
  ville: string | null
  pays: string | null
  situation: SituationMembre | null
  domaineEtude: string | null
}

/**
 * Validation partagée par `normaliserFicheMembre` (administrateur, fiche entière) et par
 * `coordonneesPersonnellesDepuisFormData` (compte ordinaire, ses seules coordonnées).
 *
 * UNE SEULE COPIE, ET C'EST LE POINT : le format d'e-mail et la règle « domaine d'étude
 * réservé à l'étudiant » doivent dire la même chose des deux côtés. Recopiées, elles
 * divergeraient au premier changement, et l'écran de profil accepterait ce que l'écran
 * d'administration refuse — ou l'inverse.
 */
function normaliserCoordonnees(brut: Record<string, unknown>): CoordonneesPersonnelles {
  const situationBrute = texteOptionnel(brut.situation)
  if (situationBrute !== null && !SITUATIONS.includes(situationBrute as SituationMembre)) {
    throw new FicheMembreInvalideError(`situation inconnue : « ${situationBrute} »`)
  }
  const situation = (situationBrute as SituationMembre | null) ?? null

  const emailContact = texteOptionnel(brut.emailContact)
  if (emailContact !== null && !FORMAT_EMAIL.test(emailContact)) {
    throw new FicheMembreInvalideError("l'adresse de contact n'a pas un format valide")
  }

  return {
    telephone: texteOptionnel(brut.telephone),
    emailContact,
    ville: texteOptionnel(brut.ville),
    pays: texteOptionnel(brut.pays),
    situation,
    // Un domaine d'étude n'a de sens que pour un étudiant : le conserver ailleurs
    // laisserait traîner une information fausse après un changement de situation.
    domaineEtude: situation === 'etudiant' ? texteOptionnel(brut.domaineEtude) : null,
  }
}

/**
 * Lit les six champs auto-modifiables depuis un FormData (D138).
 *
 * ELLE NE LIT QUE CES SIX-LÀ. Un `nom`, un `antenneId` ou un `contactId` présents dans le
 * formulaire — onglet forgé, appel direct — ne sont pas « ignorés par prudence » : ils ne
 * sont simplement jamais lus. C'est ce que prouve le dernier test de ce bloc.
 */
export function coordonneesPersonnellesDepuisFormData(donnees: FormData): CoordonneesPersonnelles {
  return normaliserCoordonnees({
    telephone: donnees.get('telephone'),
    emailContact: donnees.get('emailContact'),
    ville: donnees.get('ville'),
    pays: donnees.get('pays'),
    situation: donnees.get('situation'),
    domaineEtude: donnees.get('domaineEtude'),
  })
}
```

Ajouter `contactId: string | null` à `FicheMembre`, juste après `antenneId`.

Réécrire le corps de `normaliserFicheMembre` pour qu'il **appelle** `normaliserCoordonnees` au lieu de refaire ces validations :

```ts
export function normaliserFicheMembre(brut: Record<string, unknown>): FicheMembre {
  const nom = texteObligatoire(brut.nom, 'nom')
  const prenom = texteObligatoire(brut.prenom, 'prénom')
  const coordonnees = normaliserCoordonnees(brut)

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
    ...coordonnees,
    antenneId: texteOptionnel(brut.antenneId),
    contactId: texteOptionnel(brut.contactId),
    reportInitialAel,
  }
}
```

Ajouter `contactId: donnees.get('contactId')` à `ficheMembreDepuisFormData`, et `contact_id: fiche.contactId` à `ficheMembreVersColonnes`.

- [ ] **Step 4 : Lancer les tests**

Run: `npm test -- membre`
Expected: PASS. **Les tests préexistants de `membre.test.ts` doivent passer sans être modifiés** — l'extraction ne change aucun comportement. Si l'un tombe, c'est l'extraction qui est fautive, pas le test.

- [ ] **Step 5 : Vérifier le typage**

Run: `npx tsc --noEmit`
Expected: des erreurs **attendues** là où `FicheMembre` est construit à la main sans `contactId`. Les corriger. Aucune autre erreur ne doit subsister.

- [ ] **Step 6 : Commit**

```bash
git add src/lib/domaine/membre.ts src/lib/domaine/membre.test.ts
git commit -m "feat(domaine): porter contactId dans FicheMembre, extraire normaliserCoordonnees"
```

---

### Task 3 : La passerelle de création accepte le contact

**Files :**
- Create: `supabase/migrations/20260820110000_creer_membre_enrichi_contact.sql`
- Modify: `tests/rls/creation-enrichie.test.ts`

**Interfaces :**
- Consumes : `membres.contact_id` (Task 1).
- Produces : `public.creer_membre_enrichi(text, text, text, text, text, text, uuid, public.situation_membre, text, integer, uuid, uuid, uuid, boolean, jsonb, uuid)` — **16 paramètres**, `p_contact uuid` inséré entre `p_report_initial_ael` et `p_faiseur_de_disciple`.

> ⚠️ **D135 — LE PIÈGE DE CETTE TÂCHE.** `create or replace function` **ne peut pas changer une signature**. Sans `drop function`, la migration crée une **surcharge** : deux fonctions coexistent, `rpc` en choisit une par le nombre d'arguments nommés, et l'ancienne — qui ignore le contact — reste appelable. Il faut donc `drop`, puis `create`, puis **refaire `revoke` et `grant`** : les privilèges ne survivent pas au `drop`, et un `grant to service_role` oublié rendrait la création de membre inopérante **en production**, sans aucune erreur au déploiement de la migration.

- [ ] **Step 1 : Écrire la preuve qui échoue**

Ajouter à `tests/rls/creation-enrichie.test.ts` (reprendre ses utilitaires existants) :

```ts
it('écrit le contact passé à la création', async () => {
  // Créer un membre « contact » C via le client admin.
  // Appeler creer_membre_enrichi avec p_contact = C.id et p_faiseur_de_disciple = null.
  // Attendu : la fiche créée porte contact_id = C.id.
})

it('crée une fiche sans contact quand p_contact vaut null', async () => {
  // Attendu : contact_id vaut null, et la création réussit — le contact est facultatif,
  // au même titre que les trois enrichissements de D86.
})

it("refuse d'écrire un contact inexistant", async () => {
  // p_contact = un uuid qui n'existe pas → violation de clé étrangère, code '23503'.
})
```

- [ ] **Step 2 : Lancer la preuve**

Run: `npm run test:rls -- creation-enrichie`
Expected: FAIL — PostgREST refuse le paramètre `p_contact`, inconnu de la signature actuelle (`PGRST202`).

- [ ] **Step 3 : Écrire la migration**

Créer `supabase/migrations/20260820110000_creer_membre_enrichi_contact.sql`. **Reprendre le corps de `20260819120000_creer_membre_enrichi.sql` À L'IDENTIQUE**, en n'y changeant que ce qui est listé ci-dessous. Ne pas réécrire ses commentaires : les recopier.

```sql
-- Phase 7, D130 / D135 — le contact devient saisissable À LA CRÉATION.
--
-- MIGRATION ADDITIVE : 20260819120000_creer_membre_enrichi.sql est déjà appliquée et ne se
-- réécrit pas. Celle-ci REMPLACE la fonction, elle ne la modifie pas sur place.
--
-- ═══ POURQUOI UN `drop` ET PAS UN `create or replace` (D135) ═══
-- `create or replace function` ne peut PAS changer une signature. Sans le `drop` ci-dessous,
-- cette migration créerait une SURCHARGE : les deux fonctions coexisteraient, PostgREST
-- choisirait l'une ou l'autre selon les arguments nommés reçus, et l'ancienne — qui ignore
-- le contact — resterait appelable. Un contact saisi disparaîtrait alors EN SILENCE.
--
-- LES PRIVILÈGES NE SURVIVENT PAS AU `drop` : le `revoke`/`grant` en pied de fichier n'est
-- pas décoratif. Sans lui, `service_role` perdrait le droit d'exécution et la création de
-- membre tomberait EN PRODUCTION, sans que le déploiement de la migration ne signale rien.
--
-- LE CONTACT EST ÉCRIT DANS L'`insert` DE LA FICHE, PAS PAR `public.definir_arbre` (D130) :
-- c'est une colonne ordinaire de la fiche. Il n'entre donc PAS dans la condition qui décide
-- d'appeler `definir_arbre` : un membre créé avec un contact et SANS place dans l'arbre ne
-- doit pas déclencher un appel à `definir_arbre`, qui prendrait le verrou consultatif et
-- réécrirait trois `null` déjà en place.
--
-- AUCUN MARQUEUR D'ERREUR NOUVEAU. Un `p_contact` inexistant viole la clé étrangère
-- `membres_contact_id_fkey` (23503) ; un `p_contact` égal à la fiche créée est impossible,
-- l'identifiant étant engendré par le `insert` lui-même. L'application ne discrimine PAS sur
-- cette violation — PostgREST n'en rend le nom de contrainte que dans `error.message`, de la
-- prose anglaise — et s'appuie sur un contrôle amont (D136).

drop function if exists public.creer_membre_enrichi(
  text, text, text, text, text, text, uuid, public.situation_membre, text, integer,
  uuid, uuid, boolean, jsonb, uuid
);

create function public.creer_membre_enrichi(
  p_nom text,
  p_prenom text,
  p_telephone text,
  p_email_contact text,
  p_ville text,
  p_pays text,
  p_antenne_id uuid,
  p_situation public.situation_membre,
  p_domaine_etude text,
  p_report_initial_ael integer,
  p_contact uuid,
  p_faiseur_de_disciple uuid,
  p_dirigeant uuid,
  p_dirigeant_force boolean,
  p_statuts jsonb,
  p_par uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
-- ⚠️ CORPS RECOPIÉ À L'IDENTIQUE depuis 20260819120000, commentaires compris.
-- SEULES DIFFÉRENCES, et il n'y en a pas d'autre :
--   1. `contact_id` ajoutée à la liste de colonnes de l'`insert` (étape 2) ;
--   2. `p_contact` ajouté à la liste de valeurs correspondante.
-- La condition d'appel à `definir_arbre` (étape 3) N'EST PAS TOUCHÉE : le contact n'y entre
-- pas (D130).
$$;
```

**Étape 2 du corps**, seule modification :

```sql
  insert into public.membres (
    nom, prenom, telephone, email_contact, ville, pays, antenne_id,
    situation, domaine_etude, report_initial_ael, contact_id, cree_par
  )
  values (
    p_nom, p_prenom, p_telephone, p_email_contact, p_ville, p_pays, p_antenne_id,
    p_situation, p_domaine_etude, coalesce(p_report_initial_ael, 0), p_contact, p_par
  )
  returning id into v_membre;
```

Puis, en pied de fichier, le commentaire et les privilèges, **avec la nouvelle signature à 16 types** :

```sql
comment on function public.creer_membre_enrichi(text, text, text, text, text, text, uuid, public.situation_membre, text, integer, uuid, uuid, uuid, boolean, jsonb, uuid) is
  'Phase 5, D81, étendue par la phase 7 (D130, D135) au champ contact. Crée une fiche membre, la place dans l''arbre et lui attribue ses statuts dans UNE SEULE transaction. Le contact est écrit dans l''insert de la fiche, comme une colonne ordinaire, et n''entre PAS dans la condition d''appel à public.definir_arbre. Le reste du contrat est inchangé : elle COMPOSE public.definir_arbre et public.attribuer_statut (D82), ne prend aucun verrou consultatif propre (D83), refuse ici les couples de statuts exclusifs (D84), et son unique appelant est gardé par exigerAdministrateur (D90) — TOUT FUTUR APPELANT NON ADMINISTRATEUR EST UNE RÉGRESSION. Exécution réservée à service_role.';

revoke execute on function public.creer_membre_enrichi(text, text, text, text, text, text, uuid, public.situation_membre, text, integer, uuid, uuid, uuid, boolean, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.creer_membre_enrichi(text, text, text, text, text, text, uuid, public.situation_membre, text, integer, uuid, uuid, uuid, boolean, jsonb, uuid) to service_role;
```

- [ ] **Step 4 : Appliquer et vérifier qu'aucune surcharge ne subsiste**

Run: `npx supabase db push`

Puis vérifier en base qu'il n'existe **qu'une seule** `creer_membre_enrichi` :

```sql
select pg_get_function_identity_arguments(p.oid)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'creer_membre_enrichi';
```

Expected: **exactement une ligne**, à 16 arguments. Deux lignes = le `drop` a échoué et une surcharge subsiste : corriger avant d'aller plus loin.

- [ ] **Step 5 : Relancer les preuves**

Run: `npm run test:rls -- creation-enrichie`
Expected: PASS, y compris **toutes les preuves préexistantes** — le contrat de la fonction n'a pas changé par ailleurs.

- [ ] **Step 6 : Commit**

```bash
git add supabase/migrations/20260820110000_creer_membre_enrichi_contact.sql tests/rls/creation-enrichie.test.ts
git commit -m "feat(base): creer_membre_enrichi accepte le contact, signature refaite sans surcharge"
```

---

### Task 4 : Le contact traverse la couche données et les actions

**Files :**
- Modify: `src/lib/donnees/membres.ts`
- Modify: `src/app/membres/messages.ts`
- Modify: `src/app/membres/actions.ts`

**Interfaces :**
- Consumes : `FicheMembre.contactId` (Task 2), `p_contact` (Task 3).
- Produces :
  - `MembreDetail` gagne `contactId: string | null`
  - `export const MESSAGE_CONTACT_INCONNU: string`

- [ ] **Step 1 : Étendre la lecture**

Dans `src/lib/donnees/membres.ts` :

- ajouter `contactId: string | null` à `MembreDetail`, après `faiseurDeDiscipleId` ;
- ajouter `contact_id` à la fin de `COLONNES_DETAIL` ;
- ajouter `contactId: data.contact_id as string | null,` au retour de `membreParId`.

**Ne pas toucher `COLONNES_LISTE`** : l'annuaire n'affiche pas le contact, et l'y ajouter alourdirait la requête la plus fréquente de l'application pour rien.

- [ ] **Step 2 : Ajouter le message**

Dans `src/app/membres/messages.ts` :

```ts
/**
 * Le contact désigné n'existe pas (D136).
 *
 * Produit par un CONTRÔLE AMONT, jamais par la violation de clé étrangère elle-même :
 * PostgREST n'en rend le nom de contrainte que dans `error.message`, de la prose anglaise de
 * Postgres — et la contrainte globale du projet interdit de discriminer sur la prose.
 *
 * Le contrôle amont EXPLIQUE, la clé étrangère PROTÈGE : une suppression concurrente de la
 * fiche contact, entre la vérification et l'écriture, passerait ici et serait arrêtée par la
 * contrainte, avec le message générique. C'est le partage voulu, pas une faiblesse.
 *
 * IL NE VÉRIFIE PAS QUE LE CONTACT EST ACTIF, et c'est délibéré (D136) : le contact ne
 * confère rien et n'est parcouru par rien, contrairement au faiseur de disciple. Exiger
 * « actif » ici sans l'exiger en base inventerait une règle que la base ne tient pas.
 */
export const MESSAGE_CONTACT_INCONNU =
  "La personne choisie comme contact est introuvable. Choisissez-en une autre, puis recommencez."
```

- [ ] **Step 3 : Brancher le contrôle amont et le paramètre**

Dans `src/app/membres/actions.ts` :

Importer `membreBrefParId` (déjà importé : vérifier — sinon l'ajouter à l'import de `@/lib/donnees/membres`) et `MESSAGE_CONTACT_INCONNU`.

Ajouter, à côté de `champOuNull` :

```ts
/**
 * Le contact désigné existe-t-il ? (D136)
 *
 * Rend `true` quand il faut REFUSER. Lue sous RLS — sans conséquence ici : les deux
 * appelants sont gardés par `exigerAdministrateur`, et `membres_lecture` ouvre toute fiche à
 * l'administrateur. Un contact absent de cette lecture est donc réellement absent de la base,
 * pas simplement caché.
 */
async function contactIntrouvable(contactId: string | null): Promise<boolean> {
  if (!contactId) return false
  return (await membreBrefParId(contactId)) === null
}
```

Dans `creerMembreEnrichi`, **après** le contrôle d'exclusivité des statuts et **avant** l'appel `rpc` :

```ts
  // D136 — le contrôle amont EXPLIQUE, la clé étrangère PROTÈGE.
  if (await contactIntrouvable(fiche.contactId)) {
    return { erreur: MESSAGE_CONTACT_INCONNU }
  }
```

Et ajouter à l'objet de la `rpc`, entre `p_report_initial_ael` et `p_faiseur_de_disciple` :

```ts
    p_contact: fiche.contactId,
```

Dans `modifierMembre`, après la construction de `colonnes` et avant l'`update`, **relire la fiche normalisée** pour disposer de `contactId`. Réorganiser ainsi :

```ts
  let fiche
  try {
    fiche = ficheMembreDepuisFormData(donnees)
  } catch (erreur) {
    return {
      erreur:
        erreur instanceof FicheMembreInvalideError ? erreur.message : MESSAGE_ECHEC_ENREGISTREMENT,
    }
  }

  // D136 — même contrôle que dans creerMembreEnrichi, même raison, même message.
  if (await contactIntrouvable(fiche.contactId)) {
    return { erreur: MESSAGE_CONTACT_INCONNU }
  }

  const colonnes = ficheMembreVersColonnes(fiche)
```

- [ ] **Step 4 : Vérifier le typage et les tests**

Run: `npx tsc --noEmit && npm test`
Expected: PASS, aucune erreur de type.

- [ ] **Step 5 : Commit**

```bash
git add src/lib/donnees/membres.ts src/app/membres/messages.ts src/app/membres/actions.ts
git commit -m "feat(membres): écrire et relire le contact, avec son contrôle amont nommé"
```

---

### Task 5 : Le contact à l'écran, et la porte du lot A

**Files :**
- Modify: `src/app/membres/formulaire-membre.tsx`
- Modify: `src/app/membres/[id]/page.tsx`
- Create: `tests/e2e/contact.spec.ts`

**Interfaces :**
- Consumes : `MembreDetail.contactId` (Task 4), `MESSAGE_CONTACT_INCONNU` (Task 4).

- [ ] **Step 1 : Le champ dans le formulaire**

Dans `src/app/membres/formulaire-membre.tsx` :

Importer `SelecteurMembre` depuis `./selecteur-membre` et `membreBrefParId`… **non** : ce composant est un composant client, il ne peut pas lire la base. Le parent doit lui passer le contact déjà résolu.

Ajouter une prop :

```ts
  /**
   * Contact ACTUEL, déjà résolu par la page appelante — ce composant est un composant
   * client et ne peut rien lire en base. `null` à la création, comme pour un membre qui
   * n'en a pas.
   */
  contactInitial?: MembreBref | null
```

Ajouter l'état contrôlé, avec les autres :

```ts
  const [contact, setContact] = useState<MembreBref | null>(contactInitial ?? null)
```

Et le rendre **après** le champ « AEL déjà suivis », **en dehors** de la grille à deux colonnes (le `SelecteurMembre` est un composite qui déborde d'une demi-colonne) :

```tsx
      {/*
        ⚠️ PAS DE MARQUE DE FILIATION ICI (D134) : le contact n'est pas une relation de
        discipulat. Il est placé HORS de la grille à deux colonnes parce que
        `SelecteurMembre` est un composite — libellé, valeur retenue, champ de recherche,
        aide, puis liste de résultats — qui ne tient pas dans une demi-colonne.
      */}
      <SelecteurMembre
        nom="contactId"
        label="Contact"
        aide="Facultatif. Une personne en bonne relation avec ce membre. N'accorde aucun droit sur la fiche."
        valeur={contact}
        surChoix={setContact}
        exclureId={membre?.id ?? null}
      />
```

`exclureId={membre?.id ?? null}` : à la création, aucun identifiant n'existe encore à exclure ; en modification, `membres_pas_son_propre_contact` refuserait de toute façon — l'exclusion sert le confort, pas la sûreté (même mise en garde que `rechercherMembres`).

- [ ] **Step 2 : Passer le contact aux deux pages appelantes**

Ouvrir `src/app/membres/nouveau/page.tsx` et `src/app/membres/[id]/modifier/page.tsx`.

- `/membres/nouveau` : rien à passer (`contactInitial` reste absent).
- `/membres/[id]/modifier` : résoudre le contact et le passer.

```tsx
  const contact = membre.contactId ? await membreBrefParId(membre.contactId) : null
  // …
  <FormulaireMembre … contactInitial={contact} />
```

Si cette page charge déjà plusieurs lectures en `Promise.all`, ajouter celle-ci **dans** ce `Promise.all` plutôt qu'en série.

- [ ] **Step 3 : La fiche membre**

Dans `src/app/membres/[id]/page.tsx` :

Ajouter `contact` au `Promise.all` :

```ts
    membre.contactId ? membreBrefParId(membre.contactId) : Promise.resolve(null),
```

Renommer la ligne de l'e-mail (D133) :

```ts
    ['Adresse de contact', membre.emailContact],
```

Ajouter, **après** le bloc `Dirigeant** et donc en dernier du `<dl>` :

```tsx
        {/*
          ⚠️ AUCUNE MARQUE DE FILIATION ICI (D134), ET CE N'EST PAS UN OUBLI.
          Le commentaire D106 plus haut déclare TROIS emplacements légitimes de
          `rail-filiation` sur cette fiche, et uniquement trois, tous des relations de
          DISCIPULAT : le faiseur de disciple, le dirigeant qui en dérive, et les disciples.
          Le contact n'en est pas une : il dit « qui a une bonne relation avec cette
          personne », pas « qui la forme ». Il ne confère aucun droit (D132) et n'est
          parcouru par aucune remontée d'arbre (D131). Lui donner le rail ferait de la
          marque un simple ornement de « lien vers une autre fiche ».

          `libelleFiche` et non `membre.contactId` brut : un identifiant présent dont la
          fiche n'est pas lisible affiche « Fiche non consultable », jamais « — » (D98,
          D100). Confondre les deux ferait dire à l'écran « personne » là où la vérité est
          « quelqu'un que vous n'avez pas le droit de voir ».
        */}
        <div className="flex justify-between gap-esp-4 py-esp-3">
          <dt className="text-petit text-encre-attenuee">Contact</dt>
          <dd className="text-corps">{libelleFiche(membre.contactId, contact) ?? '—'}</dd>
        </div>
```

**Mettre à jour le commentaire D106** en tête du `<dl>` pour qu'il dise que le contact en est exclu — sans quoi le prochain lecteur prendra l'absence de rail pour un oubli et la « corrigera ». Ajouter à sa fin :

```
              Le CONTACT, ajouté en phase 7 juste sous ce bloc, n'en fait PAS partie et ne
              porte PAS le rail (D134) : ce n'est pas une relation de discipulat.
```

- [ ] **Step 4 : Écrire l'essai de bout en bout**

Créer `tests/e2e/contact.spec.ts`. Reprendre les utilitaires de connexion et de nettoyage de `tests/e2e/creation-enrichie.spec.ts` — ne pas en écrire d'autres.

```ts
import { expect, test } from '@playwright/test'
// Reprendre les utilitaires d'auth/fixtures de tests/e2e/creation-enrichie.spec.ts.

test('un administrateur désigne un contact à la création, et le relit sur la fiche', async ({ page }) => {
  // 1. Se connecter en administrateur.
  // 2. Créer un membre « Contact Témoin » (il servira de contact).
  // 3. Aller sur /membres/nouveau, remplir prénom et nom.
  // 4. Dans le champ « Contact », taper « Témoin », attendre le résultat, le choisir.
  // 5. Enregistrer.
  // 6. Sur la fiche créée, attendre la ligne « Contact » et vérifier qu'elle porte
  //    « Contact Témoin ».
  // 7. Vérifier que la ligne de l'e-mail s'intitule « Adresse de contact » (D133) et
  //    qu'il n'existe QU'UNE SEULE ligne intitulée exactement « Contact ».
})

test("la ligne « Contact » de la fiche ne porte pas le rail de filiation (D134)", async ({ page }) => {
  // Localiser la ligne « Contact » et vérifier qu'elle N'A PAS la classe `rail-filiation`,
  // alors que les lignes « Faiseur de disciple » et « Dirigeant » l'ont.
})
```

- [ ] **Step 5 : La porte du lot A**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build && npm run test:rls && npm run test:e2e`
Expected: PASS partout. La suite e2e prend ≈ 7,5 min ; c'est le passage de porte du lot, pas une vérification de commit.

- [ ] **Step 6 : Commit**

```bash
git add src/app/membres/formulaire-membre.tsx src/app/membres/nouveau/page.tsx src/app/membres/[id]/modifier/page.tsx src/app/membres/[id]/page.tsx tests/e2e/contact.spec.ts
git commit -m "feat(membres): saisir et afficher le contact, sans marque de filiation"
```

---

# LOT B — PAGE DE PROFIL ET AUTO-ÉDITION

> **Ce lot ouvre le premier chemin d'écriture non administrateur du projet.** Il mérite une revue à part, et c'est la raison pour laquelle il reste isolé dans ce plan alors que la phase est unique.

### Task 6 : La passerelle `modifier_mon_profil`

**Files :**
- Create: `supabase/migrations/20260820120000_modifier_mon_profil.sql`
- Create: `tests/rls/profil-personnel.test.ts`

**Interfaces :**
- Produces : `public.modifier_mon_profil(uuid, text, text, text, text, public.situation_membre, text) returns uuid`, réservée à `service_role`. Marqueurs : `profil_sans_membre`, `membre_inconnu`.

- [ ] **Step 1 : Écrire les preuves qui échouent**

Créer `tests/rls/profil-personnel.test.ts` (utilitaires repris de `tests/rls/comptes.test.ts`) :

```ts
import { describe, expect, it } from 'vitest'

describe('modifier_mon_profil', () => {
  it('écrit les six colonnes autorisées sur la fiche du profil appelant', async () => {
    // Créer un membre M et un profil P actif avec membre_id = M.
    // Appeler la passerelle avec p_profil = P.id et les six valeurs.
    // Attendu : M porte les six nouvelles valeurs, et l'appel rend M.id.
  })

  it("efface le domaine d'étude hors situation étudiante", async () => {
    // p_situation = 'travailleur', p_domaine_etude = 'Maths'
    // Attendu : domaine_etude vaut null — la contrainte
    // membres_domaine_reserve_etudiant est respectée par la passerelle elle-même,
    // sans dépendre de la normalisation applicative.
  })

  it('ne modifie AUCUNE colonne fermée (D138)', async () => {
    // Relire M après un appel réussi et vérifier que nom, prenom, antenne_id,
    // faiseur_de_disciple_id, dirigeant_id, dirigeant_force, contact_id,
    // report_initial_ael, etat et cree_par sont INCHANGÉS.
  })

  it("lève profil_sans_membre quand le profil n'a pas de fiche", async () => {
    // Profil racine, ou profil avec membre_id null.
    // Attendu : erreur avec details = 'profil_sans_membre'. PAS un update à zéro ligne.
  })

  it('lève profil_sans_membre pour un profil désactivé', async () => {
    // actif = false → la passerelle refuse, même si membre_id est renseigné.
    // Défense en profondeur : exigerProfilActif filtre déjà, mais la passerelle ne
    // s'appuie pas dessus.
  })

  it("n'est PAS exécutable par le rôle authenticated", async () => {
    // Appel avec un client porteur d'un jeton utilisateur → refus de privilège (42501).
  })
})
```

- [ ] **Step 2 : Lancer les preuves**

Run: `npm run test:rls -- profil-personnel`
Expected: FAIL — `PGRST202`, la fonction n'existe pas.

- [ ] **Step 3 : Écrire la migration**

Créer `supabase/migrations/20260820120000_modifier_mon_profil.sql` :

```sql
-- Phase 7, D137 / D138 / D140 — LE PREMIER CHEMIN D'ÉCRITURE NON ADMINISTRATEUR DU PROJET.
--
-- ═══ CE QUI CHANGE, ET CE QUI NE CHANGE PAS ═══
-- Ce qui NE change PAS : aucune politique d'écriture RLS n'est ouverte, ici ni ailleurs
-- (D140). Le socle du projet n'en compte aucune, sur aucune table ; toutes les écritures
-- passent par des Server Actions et la clé de service. Cette migration ne fait pas exception.
-- Ce qui CHANGE : le garde applicatif de CETTE écriture-ci est `exigerProfilActif` et non
-- `exigerAdministrateur`. C'est exactement ce point que la revue de ce lot doit examiner.
--
-- ═══ LA SIGNATURE EST LA LISTE BLANCHE (D137) ═══
-- Sept paramètres, dont six colonnes. Ce n'est pas une commodité d'appel : c'est la
-- fermeture elle-même. Un `update` applicatif ne garantit la liste des colonnes écrites que
-- par relecture du code, et une clé ajoutée un jour à l'objet passé à `.update()` écrirait
-- la colonne correspondante sans que rien ne s'y oppose. Une signature typée ne peut pas
-- écrire une huitième colonne.
--
-- CE QUI RESTE FERMÉ, ET QUI N'EST DONC PAS UN PARAMÈTRE (D138) : nom, prenom, antenne_id,
-- faiseur_de_disciple_id, dirigeant_id, dirigeant_force, contact_id, report_initial_ael,
-- etat, cree_par, ET TOUTE colonne de public.profils (identifiant, nom_affichage, est_racine,
-- actif, membre_id), ET TOUTE ligne de public.roles_profil.
--
-- LE NOM D'AFFICHAGE A ÉTÉ RETIRÉ DE CETTE LISTE PAR L'UTILISATEUR, en connaissance de
-- cause : journal_statuts.par_nom_affichage fige le nom de l'auteur au moment de l'écriture
-- (migration 20260813160000), et laisser chacun le choisir librement permettrait de signer
-- ses futurs mouvements du nom de quelqu'un d'autre.
--
-- ═══ p_profil VIENT DE LA SESSION, JAMAIS DU FORMULAIRE ═══
-- La passerelle FAIT CONFIANCE à son appelant sur ce point : appelée avec le profil d'un
-- autre compte, elle modifierait la fiche de cet autre compte. C'est la Server Action
-- `modifierMonProfil` qui garantit la provenance, en passant `profil.id` issu de
-- `exigerProfilActif`. Cette frontière est DOCUMENTÉE PAR UNE PREUVE dans
-- tests/rls/profil-personnel.test.ts, plutôt que laissée implicite. Elle tient parce que
-- l'exécution est réservée à `service_role` : aucun compte `authenticated` ne peut appeler
-- cette fonction, quel que soit le `p_profil` qu'il forgerait.
--
-- LA FICHE VISÉE EST RÉSOLUE ICI, PAS REÇUE. `membre_id` est lu depuis public.profils, à
-- l'intérieur de la fonction. Le recevoir en paramètre rouvrirait par une autre porte
-- exactement ce que le paragraphe précédent ferme.
--
-- `p.actif` EST VÉRIFIÉ, en défense en profondeur : `exigerProfilActif` filtre déjà les
-- comptes désactivés côté application, mais cette fonction ne s'appuie pas dessus.
--
-- LE `case` SUR LE DOMAINE D'ÉTUDE N'EST PAS UNE REDITE de la normalisation applicative :
-- public.membres porte la contrainte `membres_domaine_reserve_etudiant`, et une valeur non
-- nulle hors situation étudiante ferait lever un 23514 dont `error.details` porterait
-- « Failing row contains (…) » — la fiche entière. On ne s'appuie pas sur l'appelant pour
-- éviter ça.

create or replace function public.modifier_mon_profil(
  p_profil uuid,
  p_telephone text,
  p_email_contact text,
  p_ville text,
  p_pays text,
  p_situation public.situation_membre,
  p_domaine_etude text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membre uuid;
begin
  select p.membre_id into v_membre
  from public.profils p
  where p.id = p_profil and p.actif;

  -- Un profil sans fiche (compte racine, contrainte profils_racine_sans_membre) ou un
  -- profil désactivé. On LÈVE plutôt que de laisser l'update ne toucher aucune ligne :
  -- un geste sans effet ne doit pas passer pour un succès — même discipline que
  -- prive.retirer_statut et que changerEtatMembre.
  if v_membre is null then
    raise exception 'Ce compte n''a pas de fiche membre modifiable.'
      using detail = 'profil_sans_membre';
  end if;

  update public.membres m
  set telephone = p_telephone,
      email_contact = p_email_contact,
      ville = p_ville,
      pays = p_pays,
      situation = p_situation,
      domaine_etude = case when p_situation = 'etudiant' then p_domaine_etude else null end
  where m.id = v_membre;

  -- La fiche a disparu entre la lecture du profil et l'écriture. Improbable, jamais
  -- silencieux : `profils.membre_id` est en `on delete set null`, donc une fiche supprimée
  -- laisserait `v_membre` à null au tour suivant — mais pas pendant celui-ci.
  if not found then
    raise exception 'Fiche membre introuvable.'
      using detail = 'membre_inconnu';
  end if;

  return v_membre;
end;
$$;

comment on function public.modifier_mon_profil(uuid, text, text, text, text, public.situation_membre, text) is
  'Phase 7, D137. Laisse un compte modifier LUI-MÊME les six seules colonnes de sa propre fiche que D138 ouvre : téléphone, adresse de contact, ville, pays, situation, domaine d''étude. LA SIGNATURE EST LA LISTE BLANCHE : tout le reste — nom, prénom, antenne, place dans l''arbre, contact, report AEL, état, et toute colonne de profils ou de roles_profil — n''est pas un paramètre et ne peut donc pas être écrit par cette voie. La fiche visée est RÉSOLUE depuis public.profils à l''intérieur de la fonction, jamais reçue en paramètre. p_profil doit venir de la session de l''appelant : la fonction fait confiance à son appelant sur ce seul point, ce que rend acceptable la réservation de son exécution à service_role. Lève avec detail = profil_sans_membre (profil sans fiche, ou désactivé) et membre_inconnu (fiche disparue entre la lecture et l''écriture) — un geste sans effet ne passe jamais pour un succès.';

revoke execute on function public.modifier_mon_profil(uuid, text, text, text, text, public.situation_membre, text) from public, anon, authenticated;
grant execute on function public.modifier_mon_profil(uuid, text, text, text, text, public.situation_membre, text) to service_role;
```

- [ ] **Step 4 : Appliquer et relancer**

Run: `npx supabase db push && npm run test:rls -- profil-personnel`
Expected: PASS, les six preuves.

- [ ] **Step 5 : Commit**

```bash
git add supabase/migrations/20260820120000_modifier_mon_profil.sql tests/rls/profil-personnel.test.ts
git commit -m "feat(base): passerelle modifier_mon_profil, dont la signature est la liste blanche"
```

---

### Task 7 : L'écran `/profil` en lecture

**Files :**
- Modify: `src/lib/donnees/profils.ts`
- Create: `src/app/profil/page.tsx`

**Interfaces :**
- Consumes : `MembreDetail.contactId` (Task 4).
- Produces : `Profil` gagne `creeLe: string` ; la route `/profil`.

- [ ] **Step 1 : Ajouter la date de création au profil**

Dans `src/lib/donnees/profils.ts` :

- ajouter `creeLe: string` au type `Profil`, après `actif` ;
- ajouter `cree_le` au `.select(...)` de `profilCourant` ;
- ajouter `creeLe: data.cree_le,` à l'objet retourné.

- [ ] **Step 2 : Vérifier le typage**

Run: `npx tsc --noEmit`
Expected: erreurs **attendues** partout où un `Profil` est construit à la main (probablement des tests ou des fixtures). Les corriger en ajoutant `creeLe`. Si aucune erreur n'apparaît, c'est normal aussi : le type n'est construit qu'ici.

- [ ] **Step 3 : Écrire la page**

Créer `src/app/profil/page.tsx` :

```tsx
import Link from 'next/link'
import { seDeconnecter } from '@/app/connexion/actions'
import { compteurAelMembre } from '@/lib/donnees/ael'
import { libelleFiche } from '@/lib/domaine/membre'
import { membreBrefParId, membreParId } from '@/lib/donnees/membres'
import { rolesDuProfil } from '@/lib/donnees/profils'
import { statutsDuMembre } from '@/lib/donnees/statuts'
import { formaterDateSeule } from '@/lib/format/date'
import { exigerProfilActif } from '@/lib/securite/garde'
import { Bouton, CLASSES_VARIANTE, Carte, EnTetePage, LigneListe, Liste } from '@/composants/ui'
import { FormulaireCoordonnees } from './formulaire-coordonnees'

const LIBELLE_SITUATION: Record<string, string> = {
  etudiant: 'Étudiant',
  travailleur: 'Travailleur',
  autre: 'Autre',
}

const LIBELLE_ROLE: Record<string, string> = {
  administrateur: 'Administrateur',
  moderateur: 'Modérateur',
}

export default async function PageProfil({
  searchParams,
}: {
  searchParams: Promise<{ enregistre?: string }>
}) {
  const profil = await exigerProfilActif()
  const { enregistre } = await searchParams
  const roles = await rolesDuProfil(profil.id)

  // La fiche n'est lue QUE si le compte en a une. `Promise.all` sur une branche
  // conditionnelle plutôt que des `await` en série : cinq allers-retours séquentiels pour
  // un écran de consultation seraient payés à chaque affichage.
  const membre = profil.membreId ? await membreParId(profil.membreId) : null
  const [faiseur, dirigeant, contact, statuts, compteurAel] = membre
    ? await Promise.all([
        membre.faiseurDeDiscipleId ? membreBrefParId(membre.faiseurDeDiscipleId) : Promise.resolve(null),
        membre.dirigeantId ? membreBrefParId(membre.dirigeantId) : Promise.resolve(null),
        membre.contactId ? membreBrefParId(membre.contactId) : Promise.resolve(null),
        statutsDuMembre(membre.id),
        compteurAelMembre(membre.id),
      ])
    : [null, null, null, [], null]

  return (
    <main className="mx-auto w-full max-w-3xl px-esp-6 py-esp-10">
      <EnTetePage
        retour={{ href: '/tableau-de-bord', libelle: 'Retour au pilotage' }}
        titre="Mon profil"
        soustitre={`${profil.nomAffichage} (${profil.identifiant})`}
        action={
          <form action={seDeconnecter}>
            <Bouton type="submit" variante="secondaire">
              Se déconnecter
            </Bouton>
          </form>
        }
      />

      {enregistre ? (
        <div className="mb-esp-6">
          <Carte ton="succes" role="status">
            Vos coordonnées ont été enregistrées.
          </Carte>
        </div>
      ) : null}

      <section className="mb-esp-8">
        <h2 className="mb-esp-3 text-section">Mon compte</h2>
        {/*
          Le nom d'affichage est AFFICHÉ, jamais éditable ici (D138) : il est figé dans
          `journal_statuts.par_nom_affichage` au moment de chaque écriture, et le laisser
          libre permettrait de signer ses futurs mouvements du nom de quelqu'un d'autre.
          Décision de l'utilisateur, prise en connaissance de ce risque.
        */}
        <dl className="divide-y divide-filet">
          {(
            [
              ['Identifiant de connexion', profil.identifiant],
              ["Nom d'affichage", profil.nomAffichage],
              [
                'Rôles',
                roles.length === 0
                  ? 'Utilisateur'
                  : roles.map((role) => LIBELLE_ROLE[role] ?? role).join(', '),
              ],
              ['Compte créé le', formaterDateSeule(profil.creeLe)],
            ] as Array<[string, string]>
          ).map(([intitule, valeur]) => (
            <div key={intitule} className="flex justify-between gap-esp-4 py-esp-3">
              <dt className="text-petit text-encre-attenuee">{intitule}</dt>
              <dd className="text-corps">{valeur}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-esp-3 text-petit text-encre-attenuee">
          Votre identifiant, votre nom d&apos;affichage et vos rôles sont gérés par
          l&apos;administrateur.
        </p>
      </section>

      {/*
        D139 — un compte sans fiche membre voit un encart qui le DIT, et AUCUN formulaire.
        Une page à moitié vide laisserait croire à une fiche vide plutôt qu'à une absence de
        fiche. C'est le cas du compte racine (contrainte profils_racine_sans_membre) et de
        tout compte qu'un administrateur n'a pas encore relié à une personne.
      */}
      {!membre ? (
        <Carte ton="avertissement">
          Ce compte n&apos;est relié à aucune fiche de suivi. Il n&apos;y a donc pas de
          coordonnées à afficher ni à modifier ici. Demandez à un administrateur de relier
          votre compte à votre fiche.
        </Carte>
      ) : (
        <>
          <section className="mb-esp-8">
            <div className="mb-esp-3 flex items-baseline justify-between gap-esp-4">
              <h2 className="text-section">Ma fiche</h2>
              <Link href={`/membres/${membre.id}`} className={CLASSES_VARIANTE.lien}>
                Voir la fiche complète
              </Link>
            </div>
            <dl className="divide-y divide-filet">
              {(
                [
                  ['Antenne', membre.antenneNom],
                  ['Situation', membre.situation ? LIBELLE_SITUATION[membre.situation] : null],
                  ['Compteur AEL', compteurAel !== null ? String(compteurAel) : '—'],
                ] as Array<[string, string | null]>
              ).map(([intitule, valeur]) => (
                <div key={intitule} className="flex justify-between gap-esp-4 py-esp-3">
                  <dt className="text-petit text-encre-attenuee">{intitule}</dt>
                  <dd className="text-corps">{valeur ?? '—'}</dd>
                </div>
              ))}

              {/*
                ⚠️ MARQUE DE FILIATION (D106) — les DEUX relations de discipulat de cette
                personne, vues depuis son propre profil. Le CONTACT, juste en dessous, ne
                la porte PAS (D134) : ce n'est pas une relation de discipulat.
              */}
              <div className="rail-filiation flex justify-between gap-esp-4 py-esp-3">
                <dt className="text-petit text-encre-attenuee">Mon faiseur de disciple</dt>
                <dd className="text-corps">
                  {libelleFiche(membre.faiseurDeDiscipleId, faiseur) ?? '—'}
                </dd>
              </div>
              <div className="rail-filiation flex justify-between gap-esp-4 py-esp-3">
                <dt className="text-petit text-encre-attenuee">Mon dirigeant</dt>
                <dd className="text-corps">{libelleFiche(membre.dirigeantId, dirigeant) ?? '—'}</dd>
              </div>
              <div className="flex justify-between gap-esp-4 py-esp-3">
                <dt className="text-petit text-encre-attenuee">Mon contact</dt>
                <dd className="text-corps">{libelleFiche(membre.contactId, contact) ?? '—'}</dd>
              </div>
            </dl>

            <h3 className="mb-esp-2 mt-esp-6 text-nom">Mes statuts</h3>
            {statuts.length === 0 ? (
              <p className="text-petit text-encre-attenuee">Aucun statut attribué.</p>
            ) : (
              // ⚠️ PUCE DE CATALOGUE, PAS UN `EtatBadge` (C4) : un statut de catalogue ne
              // porte aucune couleur d'état.
              <ul className="flex flex-wrap gap-esp-2">
                {statuts.map((statut) => (
                  <li
                    key={statut.statutId}
                    className="rounded-full border border-bord-carte px-esp-3 py-esp-1 text-petit"
                  >
                    {statut.libelle}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mb-esp-8">
            <h2 className="mb-esp-3 text-section">Mes coordonnées</h2>
            <FormulaireCoordonnees membre={membre} />
          </section>
        </>
      )}

      <section>
        <h2 className="mb-esp-3 text-section">Mon compte au quotidien</h2>
        <Liste variante="navigation">
          <LigneListe lien="/changer-mot-de-passe" principal="Changer mon mot de passe" />
          <LigneListe lien="/notifications" principal="Mes notifications" />
          <LigneListe lien="/mes-membres" principal="Mes membres" />
        </Liste>
      </section>
    </main>
  )
}
```

> **Note :** `LigneListe lien="/mes-membres"` pointe vers un écran livré au lot C. Créer d'abord `/profil` puis `/mes-membres` laisse ce lien mort le temps de deux tâches — acceptable sur une branche non déployée, et le lot C le referme. Si l'ordre d'exécution est inversé, ce lien est déjà valide.

- [ ] **Step 4 : Vérifier**

Run: `npx tsc --noEmit && npm run lint`
Expected: une seule erreur attendue, `FormulaireCoordonnees` n'existant pas encore. Elle disparaît à la Task 8.

- [ ] **Step 5 : Commit**

Ne pas commiter tant que la Task 8 n'a pas rendu le fichier compilable. Passer directement à la Task 8, puis commiter les deux ensemble.

---

### Task 8 : L'auto-édition

**Files :**
- Create: `src/app/profil/messages.ts`
- Create: `src/app/profil/actions.ts`
- Create: `src/app/profil/formulaire-coordonnees.tsx`

**Interfaces :**
- Consumes : `coordonneesPersonnellesDepuisFormData` (Task 2), `public.modifier_mon_profil` (Task 6), `MembreDetail` (Task 4).
- Produces : `export type EtatProfil = { erreur: string | null }` ; `export async function modifierMonProfil(etat: EtatProfil, donnees: FormData): Promise<EtatProfil>`.

- [ ] **Step 1 : Les messages**

Créer `src/app/profil/messages.ts` :

```ts
export const MESSAGE_ECHEC_COORDONNEES =
  "Vos coordonnées n'ont pas pu être enregistrées. Vérifiez les informations saisies."

/**
 * Marqueur `profil_sans_membre` de `public.modifier_mon_profil`.
 *
 * Atteint quand le compte n'a pas de fiche — ou n'en a plus. L'écran n'affiche normalement
 * PAS le formulaire dans ce cas (D139) : y parvenir signifie qu'un onglet est resté ouvert
 * pendant qu'un administrateur détachait la fiche du compte. Le dire vaut mieux que le
 * message générique, qui ferait chercher une faute de saisie inexistante.
 */
export const MESSAGE_PROFIL_SANS_MEMBRE =
  "Ce compte n'est plus relié à une fiche de suivi : il n'y a pas de coordonnées à enregistrer. Rechargez la page, puis voyez avec un administrateur."
```

- [ ] **Step 2 : L'action**

Créer `src/app/profil/actions.ts` :

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import {
  FicheMembreInvalideError,
  coordonneesPersonnellesDepuisFormData,
} from '@/lib/domaine/membre'
import { exigerProfilActif } from '@/lib/securite/garde'
import { clientAdmin } from '@/lib/supabase/admin'
import { MESSAGE_ECHEC_COORDONNEES, MESSAGE_PROFIL_SANS_MEMBRE } from './messages'

export type EtatProfil = { erreur: string | null }

const DETAIL_PROFIL_SANS_MEMBRE = 'profil_sans_membre'
const DETAIL_MEMBRE_INCONNU = 'membre_inconnu'

// LISTE FERMÉE DES MARQUEURS QUE `modifier_mon_profil` PEUT POSER — employée UNIQUEMENT pour
// décider ce qui a le droit d'atteindre le journal serveur. `error.details` n'est PAS
// toujours un marqueur : sur une violation de contrainte `check` de public.membres (23514 —
// `membres_domaine_reserve_etudiant` est atteignable depuis ce chemin), Postgres y écrit
// « Failing row contains (…) », LA LIGNE ENTIÈRE : téléphone, adresse de contact, ville,
// pays. Même défaut que celui refermé sur `creerMembreEnrichi` et `definirArbre`, même
// remède — on ne journalise `details` que s'il correspond à un marqueur CONNU.
const MARQUEURS_CONNUS: ReadonlySet<string> = new Set([
  DETAIL_PROFIL_SANS_MEMBRE,
  DETAIL_MEMBRE_INCONNU,
])

/**
 * LE PREMIER CHEMIN D'ÉCRITURE NON ADMINISTRATEUR DU PROJET (D137, D140).
 *
 * ═══ CE QUI FAIT TENIR LA FERMETURE, ET DANS QUEL ORDRE ═══
 * 1. `exigerProfilActif` en PREMIÈRE instruction — pas de session, pas d'écriture.
 * 2. `p_profil: profil.id` — L'IDENTIFIANT DE CIBLE VIENT DE LA SESSION, JAMAIS DU
 *    `FormData`. C'est le point unique dont dépend tout le reste : accepter ici un
 *    identifiant venu du client transformerait cette action en « modifier la fiche de
 *    n'importe qui ».
 * 3. `coordonneesPersonnellesDepuisFormData` ne lit QUE six champs. Un `nom`, un
 *    `antenneId` ou un `contactId` présents dans le formulaire ne sont pas « ignorés par
 *    prudence » : ils ne sont jamais lus.
 * 4. La signature de la passerelle ne peut pas écrire une septième colonne (D138).
 *
 * Aucune de ces quatre lignes de défense ne suffit seule, et aucune n'est redondante.
 */
export async function modifierMonProfil(
  _etat: EtatProfil,
  donnees: FormData,
): Promise<EtatProfil> {
  const profil = await exigerProfilActif()

  let coordonnees
  try {
    coordonnees = coordonneesPersonnellesDepuisFormData(donnees)
  } catch (erreur) {
    if (erreur instanceof FicheMembreInvalideError) {
      // Le message est déjà précis et actionnable : on le relaie tel quel.
      return { erreur: erreur.message }
    }
    console.error('modifierMonProfil : échec inattendu de la lecture du formulaire', { erreur })
    return { erreur: MESSAGE_ECHEC_COORDONNEES }
  }

  const { error } = await clientAdmin().rpc('modifier_mon_profil', {
    // ═══ JAMAIS `donnees.get('profilId')` ═══ Voir l'encadré ci-dessus, point 2.
    p_profil: profil.id,
    p_telephone: coordonnees.telephone,
    p_email_contact: coordonnees.emailContact,
    p_ville: coordonnees.ville,
    p_pays: coordonnees.pays,
    p_situation: coordonnees.situation,
    p_domaine_etude: coordonnees.domaineEtude,
  })

  if (error) {
    console.error('modifierMonProfil : échec RPC modifier_mon_profil', {
      profilId: profil.id,
      code: error.code,
      details: error.details && MARQUEURS_CONNUS.has(error.details) ? error.details : undefined,
      message: error.message,
    })
    if (error.details === DETAIL_PROFIL_SANS_MEMBRE) {
      return { erreur: MESSAGE_PROFIL_SANS_MEMBRE }
    }
    return { erreur: MESSAGE_ECHEC_COORDONNEES }
  }

  revalidatePath('/profil')
  if (profil.membreId) {
    // La fiche publique affiche les mêmes coordonnées : sans cette invalidation, l'annuaire
    // continuerait de servir l'ancienne valeur.
    revalidatePath(`/membres/${profil.membreId}`)
  }
  // DERNIÈRE instruction : `redirect()` lève une exception de contrôle Next.js.
  redirect('/profil?enregistre=1')
}
```

- [ ] **Step 3 : Le formulaire**

Créer `src/app/profil/formulaire-coordonnees.tsx` :

```tsx
'use client'

import { useActionState, useState } from 'react'
import { Bouton } from '@/composants/ui/bouton'
import { Champ } from '@/composants/ui/champ'
import { Formulaire } from '@/composants/ui/formulaire'
import { Selecteur } from '@/composants/ui/selecteur'
import type { MembreDetail } from '@/lib/donnees/membres'
import { modifierMonProfil, type EtatProfil } from './actions'

const etatInitial: EtatProfil = { erreur: null }

/*
  ═══ TOUS LES CHAMPS SONT CONTRÔLÉS (D85). AUCUN `defaultValue`. ═══
  React réinitialise les champs NON CONTRÔLÉS d'un `<form action>` à toute complétion de
  l'action, y compris sur un refus RETOURNÉ — l'utilisateur lirait son message d'erreur
  au-dessus d'un formulaire vidé. `Formulaire` porte `onReset` préventif (D112) ; il ne
  protège que parce qu'aucun champ ici n'est non contrôlé.

  ═══ CE FORMULAIRE NE PORTE AUCUN IDENTIFIANT DE CIBLE ═══
  Pas de `<input type="hidden" name="profilId">`, pas de `membreId`. L'action lit la cible
  dans la session (D137). En ajouter un ici ne servirait à rien — l'action ne le lirait
  pas — mais laisserait croire au prochain lecteur que la cible est négociable.

  ═══ SIX CHAMPS, ET SIX SEULEMENT (D138) ═══
  Nom, prénom, antenne, faiseur de disciple, dirigeant, contact, statuts et état ne sont pas
  « masqués » ici : ils ne sont écrits par AUCUNE voie non administrateur.
*/
export function FormulaireCoordonnees({ membre }: { membre: MembreDetail }) {
  const [etat, envoyer, enCours] = useActionState(modifierMonProfil, etatInitial)

  const [telephone, setTelephone] = useState(membre.telephone ?? '')
  const [emailContact, setEmailContact] = useState(membre.emailContact ?? '')
  const [ville, setVille] = useState(membre.ville ?? '')
  const [pays, setPays] = useState(membre.pays ?? '')
  const [situation, setSituation] = useState<string>(membre.situation ?? '')
  const [domaineEtude, setDomaineEtude] = useState(membre.domaineEtude ?? '')

  return (
    <Formulaire
      action={envoyer}
      erreur={etat.erreur}
      enCours={enCours}
      actions={
        <Bouton
          type="submit"
          variante="principal"
          alignement="debut"
          enCours={enCours}
          libelleAttente="Enregistrement…"
        >
          Enregistrer mes coordonnées
        </Bouton>
      }
    >
      <div className="grid gap-esp-4 md:grid-cols-2">
        <Champ
          label="Téléphone"
          name="telephone"
          type="tel"
          value={telephone}
          onChange={(evenement) => setTelephone(evenement.target.value)}
        />
        <Champ
          label="Adresse de contact"
          name="emailContact"
          type="email"
          value={emailContact}
          onChange={(evenement) => setEmailContact(evenement.target.value)}
        />
        <Champ
          label="Ville"
          name="ville"
          value={ville}
          onChange={(evenement) => setVille(evenement.target.value)}
        />
        <Champ
          label="Pays"
          name="pays"
          value={pays}
          onChange={(evenement) => setPays(evenement.target.value)}
        />
        <Selecteur
          label="Situation"
          name="situation"
          value={situation}
          onChange={(evenement) => setSituation(evenement.target.value)}
          options={[
            { valeur: '', libelle: 'Non renseignée' },
            { valeur: 'etudiant', libelle: 'Étudiant' },
            { valeur: 'travailleur', libelle: 'Travailleur' },
            { valeur: 'autre', libelle: 'Autre' },
          ]}
        />
        {/*
          Le champ n'existe que pour un étudiant, plutôt que d'être saisissable puis effacé
          en silence à l'enregistrement — même règle et même raison que sur le formulaire de
          fiche. La VALEUR survit au démontage : elle vit dans `domaineEtude`, à côté et non
          dedans. Ce que la base enregistre reste décidé par `normaliserCoordonnees` ET par
          le `case` de la passerelle, qui ne s'appuie pas sur lui.
        */}
        {situation === 'etudiant' ? (
          <Champ
            label="Domaine d'étude"
            name="domaineEtude"
            value={domaineEtude}
            onChange={(evenement) => setDomaineEtude(evenement.target.value)}
          />
        ) : null}
      </div>
    </Formulaire>
  )
}
```

- [ ] **Step 4 : Vérifier**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/lib/donnees/profils.ts src/app/profil/
git commit -m "feat(profil): page de profil et auto-édition bornée aux six coordonnées"
```

---

### Task 9 : La porte du lot B

**Files :**
- Create: `tests/e2e/profil.spec.ts`

- [ ] **Step 1 : Écrire l'essai**

Créer `tests/e2e/profil.spec.ts` (utilitaires repris de `tests/e2e/connexion.spec.ts` et `tests/e2e/autorite.spec.ts`) :

```ts
import { expect, test } from '@playwright/test'

test('un compte ordinaire modifie ses propres coordonnées', async ({ page }) => {
  // 1. Se connecter avec un compte ORDINAIRE (ni administrateur ni modérateur) relié à une fiche.
  // 2. Aller sur /profil.
  // 3. Vérifier que « Mon compte » affiche l'identifiant et le nom d'affichage.
  // 4. Modifier la ville, enregistrer.
  // 5. Attendre le bandeau « Vos coordonnées ont été enregistrées. »
  // 6. Recharger et vérifier que la ville est bien la nouvelle.
})

test('le formulaire de profil ne propose AUCUN champ fermé (D138)', async ({ page }) => {
  // Sur /profil, vérifier qu'il n'existe aucun champ nommé nom, prenom, antenneId,
  // contactId, faiseurDeDiscipleId, dirigeantId, ni aucun champ « Nom d'affichage »
  // éditable. Le nom d'affichage doit apparaître en LECTURE (dans le <dl>), pas en saisie.
})

test("un compte sans fiche membre voit l'encart, pas le formulaire (D139)", async ({ page }) => {
  // Se connecter avec le compte racine (ou un compte sans membre_id).
  // Attendu : le texte « Ce compte n'est relié à aucune fiche de suivi » est visible,
  // et aucun bouton « Enregistrer mes coordonnées » n'existe.
})
```

- [ ] **Step 2 : La porte du lot B**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build && npm run test:rls && npm run test:e2e`
Expected: PASS partout.

- [ ] **Step 3 : Commit**

```bash
git add tests/e2e/profil.spec.ts
git commit -m "test(profil): couvrir l'auto-édition, les champs fermés et le compte sans fiche"
```

---

# LOT C — « MES MEMBRES »

### Task 10 : Les fonctions récursives de descendance

**Files :**
- Create: `supabase/migrations/20260820130000_descendants_membre.sql`
- Create: `tests/rls/descendants.test.ts`

**Interfaces :**
- Produces :
  - `public.descendants_membre(p_membre uuid, p_profondeur_min integer default 1, p_decalage integer default 0, p_limite integer default 25) returns table (membre_id uuid, parent_id uuid, profondeur integer, total bigint)`
  - `public.compter_descendants(p_membre uuid, p_profondeur_min integer default 1) returns bigint`

- [ ] **Step 1 : Écrire les preuves qui échouent**

Créer `tests/rls/descendants.test.ts`. Construire une chaîne A → B → C → D (A faiseur de B, B de C, C de D) plus un membre archivé E entre C et un actif F (C → E archivé → F actif), pour prouver le point le plus important : **F apparaît quand même**.

```ts
import { describe, expect, it } from 'vitest'

describe('descendants_membre', () => {
  it('rend toute la descendance sous A, le membre lui-même exclu', async () => {
    // p_profondeur_min = 1 → B, C, D, F. Jamais A.
  })

  it('exclut le niveau 1 avec p_profondeur_min = 2', async () => {
    // Attendu : C, D, F. Pas B.
  })

  it('rend le parent de chaque descendant', async () => {
    // parent_id de C vaut B ; celui de D vaut C.
  })

  it("NE FILTRE PAS son parcours sur l'état : les disciples actifs d'un archivé sont rendus", async () => {
    // E est archivé, F est actif et a E pour faiseur de disciple.
    // Attendu : F EST rendu, avec parent_id = E, et E n'est PAS rendu.
    // C'EST LA PREUVE CENTRALE DE CETTE MIGRATION (D148) : filtrer le parcours amputerait
    // la branche sous E et ferait disparaître F sans le moindre signal.
  })

  it('pagine et rend le total', async () => {
    // p_limite = 2 → 2 lignes, chacune portant total = <nombre total de descendants actifs>.
  })

  it('borne p_limite à 500', async () => {
    // p_limite = 10000 → au plus 500 lignes.
  })

  it('compter_descendants rend le même total', async () => {
    // Égal au `total` rendu par descendants_membre pour le même p_profondeur_min.
  })

  it("n'est PAS exécutable par le rôle authenticated", async () => {
    // Les deux fonctions → refus de privilège (42501).
  })
})
```

- [ ] **Step 2 : Lancer les preuves**

Run: `npm run test:rls -- descendants`
Expected: FAIL — `PGRST202`.

- [ ] **Step 3 : Écrire la migration**

Créer `supabase/migrations/20260820130000_descendants_membre.sql` :

```sql
-- Phase 7, D141 / D148 — le miroir DESCENDANT de public.ancetres_membre.
--
-- ═══ ELLE REND DES IDENTIFIANTS, JAMAIS DES NOMS (D141) ═══
-- C'est la règle D93/D98 établie par /arborescence, reprise telle quelle et non réinventée :
-- la FORME de l'arbre est lue AFFRANCHIE DE LA RLS (security definer), parce qu'une lecture
-- soumise à la RLS s'arrêterait au premier maillon invisible et FERAIT MENTIR L'ÉCRAN sur la
-- profondeur ; les NOMS, eux, sont relus SOUS RLS par l'application (`nomsMaillonsActifs`).
-- AUCUN NOM LU AFFRANCHI DE LA RLS N'ATTEINT L'ÉCRAN. Cette fonction ne peut pas garantir
-- cela seule — c'est l'appelant qui en répond — mais elle ne le trahit pas : elle n'expose
-- aucun nom.
--
-- ═══ LE FILTRE `etat = 'actif'` PORTE SUR LES LIGNES RENDUES, JAMAIS SUR LE PARCOURS ═══
-- C'est le point le plus facile à casser de tout ce fichier. Le `join` filtrant vit dans
-- `filtree`, APRÈS la récursion, et NON dans le terme récursif de `branche`. Le déplacer
-- dans `branche` amputerait la branche sous le premier membre archivé : ses disciples encore
-- ACTIFS disparaîtraient de l'écran SANS LE MOINDRE SIGNAL, indistinguables d'une branche qui
-- s'arrête réellement là. Une preuve dédiée existe pour ce seul point
-- (tests/rls/descendants.test.ts).
--
-- ═══ LA PAGINATION EST EN SQL, PAS DANS L'APPLICATION (D148) ═══
-- Une fonction `returns table` appelée par `rpc` est soumise au plafond `max_rows` de
-- PostgREST (1000, supabase/config.toml) exactement comme une lecture de table. Rendre toute
-- la descendance puis la découper côté application la ferait TRONQUER EN SILENCE au millième
-- descendant — le mode de défaillance que la pagination existe pour fermer. `p_limite` est
-- bornée à 500 ICI, dans la fonction : une borne côté application ne protégerait pas d'un
-- autre appelant.
--
-- LE TOTAL PAR `count(*) over ()` : une seule passe, pas de seconde récursion. Une page VIDE
-- (décalage au-delà de la fin) ne porte aucune ligne, donc aucun total — d'où le repli
-- public.compter_descendants ci-dessous. Même partage que disciplesParPage / compterDisciples.
--
-- PARCOURS BORNÉ À 64 NIVEAUX, comme public.ancetres_membre et public.chemin_arbre. Le
-- déclencheur membres_anti_cycle garantit déjà l'absence de cycle : cette borne est une
-- ceinture, pas la bretelle.
--
-- TRI TOTAL : (profondeur, nom, prenom, id). `(profondeur, nom, prenom)` n'est pas unique —
-- deux homonymes exacts au même niveau, à cheval sur une frontière de page, seraient rendus
-- DEUX FOIS ou JAMAIS. `nom` et `prenom` servent AU TRI et ne sont PAS projetés : trier sur
-- une colonne ne l'expose pas.

create or replace function public.descendants_membre(
  p_membre uuid,
  p_profondeur_min integer default 1,
  p_decalage integer default 0,
  p_limite integer default 25
)
returns table (membre_id uuid, parent_id uuid, profondeur integer, total bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with recursive branche as (
    select m.id, m.faiseur_de_disciple_id as parent, 0 as profondeur
    from public.membres m
    where m.id = p_membre
    union all
    select m.id, m.faiseur_de_disciple_id, b.profondeur + 1
    from public.membres m
    join branche b on m.faiseur_de_disciple_id = b.id
    where b.profondeur < 64
  ),
  filtree as (
    -- ⚠️ LE FILTRE D'ÉTAT EST ICI, APRÈS LA RÉCURSION, ET PAS DANS `branche`. Voir
    -- l'encadré en tête de fichier : le déplacer amputerait la branche sous un archivé.
    select b.id, b.parent, b.profondeur, m.nom, m.prenom
    from branche b
    join public.membres m on m.id = b.id
    where b.profondeur >= greatest(p_profondeur_min, 1)
      and m.etat = 'actif'
  )
  select f.id, f.parent, f.profondeur, count(*) over () as total
  from filtree f
  order by f.profondeur, f.nom, f.prenom, f.id
  offset greatest(coalesce(p_decalage, 0), 0)
  limit least(greatest(coalesce(p_limite, 25), 1), 500);
$$;

comment on function public.descendants_membre(uuid, integer, integer, integer) is
  'Phase 7, D141/D148. Descendants ACTIFS d''un membre dans l''arbre des faiseurs de disciple, le membre lui-même exclu (p_profondeur_min >= 1), avec le parent et la profondeur de chacun. Rend des IDENTIFIANTS et JAMAIS des noms : la forme de l''arbre est lue affranchie de la RLS, les noms sont relus sous RLS par l''application. Le filtre etat = actif porte sur les lignes RENDUES et non sur le PARCOURS : les disciples actifs d''un membre archivé sont donc bien rendus — filtrer le parcours amputerait la branche sans le moindre signal. Paginée EN SQL (p_decalage, p_limite bornée à 500) parce qu''un rpc est soumis au plafond max_rows de PostgREST comme une lecture de table. Le total est rendu par count(*) over () ; une page vide n''en porte aucun, d''où le repli public.compter_descendants. Parcours borné à 64 niveaux. Tri total (profondeur, nom, prenom, id). Exécution réservée à service_role.';

-- Repli de `descendants_membre` quand sa page est VIDE et ne porte donc aucun total. JAMAIS
-- appelée EN AMONT pour pré-calculer une borne : ce serait ouvrir la fenêtre de course que
-- la ronde I1 du 2026-08-14 a refermée sur `disciplesParPage`.
create or replace function public.compter_descendants(
  p_membre uuid,
  p_profondeur_min integer default 1
)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  with recursive branche as (
    select m.id, m.faiseur_de_disciple_id as parent, 0 as profondeur
    from public.membres m
    where m.id = p_membre
    union all
    select m.id, m.faiseur_de_disciple_id, b.profondeur + 1
    from public.membres m
    join branche b on m.faiseur_de_disciple_id = b.id
    where b.profondeur < 64
  )
  select count(*)
  from branche b
  join public.membres m on m.id = b.id
  where b.profondeur >= greatest(p_profondeur_min, 1)
    and m.etat = 'actif';
$$;

comment on function public.compter_descendants(uuid, integer) is
  'Phase 7, D148. Nombre de descendants ACTIFS d''un membre, mêmes règles de parcours et de filtrage que public.descendants_membre. Sert de REPLI quand une page de descendants_membre est vide et ne porte donc aucun total — jamais à pré-calculer une borne en amont. Exécution réservée à service_role.';

revoke execute on function public.descendants_membre(uuid, integer, integer, integer) from public, anon, authenticated;
revoke execute on function public.compter_descendants(uuid, integer) from public, anon, authenticated;
grant execute on function public.descendants_membre(uuid, integer, integer, integer) to service_role;
grant execute on function public.compter_descendants(uuid, integer) to service_role;
```

- [ ] **Step 4 : Appliquer et relancer**

Run: `npx supabase db push && npm run test:rls -- descendants`
Expected: PASS, les huit preuves.

- [ ] **Step 5 : Commit**

```bash
git add supabase/migrations/20260820130000_descendants_membre.sql tests/rls/descendants.test.ts
git commit -m "feat(base): descendants_membre paginée, filtrant ses lignes et non son parcours"
```

---

### Task 11 : La couche de lecture des quatre sections

**Files :**
- Create: `src/lib/donnees/mes-membres-lots.ts`
- Create: `src/lib/donnees/mes-membres.ts`
- Modify: `tests/rls/descendants.test.ts`

**Interfaces :**
- Consumes : `descendants_membre`, `compter_descendants` (Task 10) ; `nomsMaillonsActifs`, `disciplesParPage` (`arbre-lots.ts`) ; `PageLue`, `verifierTaillePage`, `totalObligatoire` (`pagination.ts`).
- Produces :
  - `export const TAILLE_PAGE_MES_MEMBRES = 25`
  - `export type LigneDescendance = { membre: MembreBref; parent: MembreBref | null; parentId: string | null; profondeur: number }`
  - `export async function membresParRelation(supabase, colonne: 'faiseur_de_disciple_id' | 'dirigeant_id' | 'contact_id', valeur: string, options?): Promise<PageLue<MembreBref>>`
  - `export async function descendanceParPage(supabaseAdmin, supabaseLecture, membreId: string, options?): Promise<PageLue<LigneDescendance>>`
  - Enveloppes `server-only` : `mesDisciplesPage`, `mesDirigesPage`, `mesContactsPage`, `maDescendancePage`.

- [ ] **Step 1 : Écrire les lots**

Créer `src/lib/donnees/mes-membres-lots.ts` :

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { nomsMaillonsActifs } from './arbre-lots'
import { totalObligatoire, verifierTaillePage, type PageLue } from './pagination'
import type { MembreBref } from './membres'

/**
 * PAS de `import 'server-only'` ici — délibéré, même motif que `arbre-lots.ts`,
 * `membres-lots.ts` et `evenements-lots.ts` : ces fonctions reçoivent leur client Supabase
 * DÉJÀ CONSTRUIT et ne touchent ni cookies ni clé de service. L'isoler permet à
 * `tests/rls/descendants.test.ts` de faire tourner EXACTEMENT ce code de production contre
 * la vraie base, avec une taille de page abaissée.
 *
 * `import type { MembreBref }` est un import de TYPE : effacé à la compilation, il ne tire
 * donc PAS `membres.ts` (server-only) dans ce module.
 */

export const TAILLE_PAGE_MES_MEMBRES = 25

/** Colonnes de `membres` qui désignent « moi » depuis la fiche de quelqu'un d'autre. */
export type ColonneRelation = 'faiseur_de_disciple_id' | 'dirigeant_id' | 'contact_id'

/**
 * Une page de membres ACTIFS liés à `valeur` par `colonne`.
 *
 * UNE SEULE FONCTION POUR TROIS SECTIONS, et ce n'est pas de la coquetterie : les trois
 * lectures ne diffèrent QUE par le nom de la colonne. Trois copies, ce seraient trois
 * occasions d'oublier `etat = 'actif'`, le tri total, ou le repli `PGRST103` — et la
 * divergence ne se verrait qu'à l'usage.
 *
 * `colonne` est un type union FERMÉ, jamais une chaîne libre : il n'y a aucun chemin par
 * lequel une valeur venue d'une requête HTTP atteindrait ce paramètre.
 *
 * `etat = 'actif'` EXPLICITEMENT, et pas seulement via la RLS (D93) : la politique laisse un
 * administrateur voir les fiches archivées, or cet écran est la liste des personnes EN COURS
 * DE SUIVI. Sans ce filtre, un administrateur et un compte ordinaire verraient deux listes
 * différentes sans que rien ne le dise.
 *
 * TRI TOTAL, `id` en troisième critère : `(nom, prenom)` n'est pas unique, et deux homonymes
 * exacts à cheval sur une frontière de page seraient rendus deux fois ou JAMAIS.
 */
export async function membresParRelation(
  supabase: SupabaseClient,
  colonne: ColonneRelation,
  valeur: string,
  options?: { page?: number; taillePage?: number },
): Promise<PageLue<MembreBref>> {
  const taillePage = options?.taillePage ?? TAILLE_PAGE_MES_MEMBRES
  verifierTaillePage(taillePage, 'membresParRelation')
  const page = Math.max(1, options?.page ?? 1)
  const debut = (page - 1) * taillePage

  const { data, error, count } = await supabase
    .from('membres')
    .select('id, nom, prenom', { count: 'exact' })
    .eq(colonne, valeur)
    .eq('etat', 'actif')
    .order('nom')
    .order('prenom')
    .order('id')
    .range(debut, debut + taillePage - 1)

  if (error) {
    // `PGRST103` : page hors bornes (signet périmé, ou liste qui a rétréci depuis).
    // PostgREST refuse la requête ENTIÈRE, `count` compris — d'où ce second appel.
    if (error.code === 'PGRST103') {
      return { lignes: [], total: await compterParRelation(supabase, colonne, valeur) }
    }
    // Un échec ne doit pas être indistinguable d'une section vide : annoncer « personne »
    // alors que la requête a échoué est un mensonge silencieux.
    throw new Error(`Lecture de la section « ${colonne} » impossible : ${error.message}`)
  }

  return {
    lignes: (data ?? []).map((ligne) => ({
      id: ligne.id as string,
      nom: ligne.nom as string,
      prenom: ligne.prenom as string,
    })),
    total: totalObligatoire(count, 'membresParRelation'),
  }
}

/** Repli de `membresParRelation` sur `PGRST103`, jamais appelé en amont. */
async function compterParRelation(
  supabase: SupabaseClient,
  colonne: ColonneRelation,
  valeur: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('membres')
    .select('id', { count: 'exact', head: true })
    .eq(colonne, valeur)
    .eq('etat', 'actif')
  if (error) {
    throw new Error(`Comptage de la section « ${colonne} » impossible : ${error.message}`)
  }
  return totalObligatoire(count, 'compterParRelation')
}

/** Un descendant, son parent nommé, et sa profondeur dans l'arbre. */
export type LigneDescendance = {
  membre: MembreBref
  /** Identifiant du faiseur de disciple, TOUJOURS présent au-delà du niveau 1. */
  parentId: string | null
  /** Fiche du parent, `null` si elle n'est pas lisible ou pas active. */
  parent: MembreBref | null
  profondeur: number
}

/**
 * Une page de la descendance d'un membre, AU-DELÀ du niveau 1 (D141, D148).
 *
 * ═══ DEUX CLIENTS, ET C'EST TOUT L'INTÉRÊT ═══
 * `supabaseAdmin` (clé de service) appelle les fonctions récursives : la FORME de l'arbre ne
 * doit pas dépendre de ce que l'appelant a le droit de voir, sans quoi la branche serait
 * amputée sans signal. `supabaseLecture` (RLS) relit les NOMS. AUCUN NOM LU AVEC LA CLÉ DE
 * SERVICE N'ATTEINT L'APPELANT : les deux appels ci-dessous ne rendent que des identifiants.
 *
 * Les noms des DESCENDANTS et ceux des PARENTS sont relus dans le MÊME appel à
 * `nomsMaillonsActifs` — un seul aller-retour, et le filtre `etat = 'actif'` s'applique aux
 * deux de la même façon. Un parent absent du résultat devient `parent: null`, que l'écran
 * rend par `libelleFiche` : « Fiche non consultable », jamais un blanc.
 */
export async function descendanceParPage(
  supabaseAdmin: SupabaseClient,
  supabaseLecture: SupabaseClient,
  membreId: string,
  options?: { page?: number; taillePage?: number },
): Promise<PageLue<LigneDescendance>> {
  const taillePage = options?.taillePage ?? TAILLE_PAGE_MES_MEMBRES
  verifierTaillePage(taillePage, 'descendanceParPage')
  const page = Math.max(1, options?.page ?? 1)
  const decalage = (page - 1) * taillePage

  const { data, error } = await supabaseAdmin.rpc('descendants_membre', {
    p_membre: membreId,
    // 2 et non 1 : le niveau 1 est la section « Mes disciples directs », déjà rendue par
    // `membresParRelation`. L'afficher deux fois dans deux sections dont l'une s'intitule
    // « Disciples de mes disciples » ferait mentir ce titre.
    p_profondeur_min: 2,
    p_decalage: decalage,
    p_limite: taillePage,
  })
  if (error) {
    throw new Error(`Lecture de la descendance impossible : ${error.message}`)
  }

  const lignes = (data ?? []) as Array<{
    membre_id?: unknown
    parent_id?: unknown
    profondeur?: unknown
    total?: unknown
  }>

  // Contrôle de FORME, et non décoration. Faute de types `Database` générés, `rpc` rend
  // `any` : si une colonne était un jour renommée, chaque `membre_id` vaudrait `undefined`,
  // la section se viderait EN SILENCE, et l'écran annoncerait « aucun disciple de disciple »
  // à quelqu'un qui en a trente. Même discipline que `ancetresDeMembre`.
  for (const ligne of lignes) {
    if (typeof ligne.membre_id !== 'string' || ligne.membre_id.length === 0) {
      throw new Error(
        'Forme inattendue renvoyée par descendants_membre : colonne « membre_id » absente ou vide.',
      )
    }
  }

  const idsDescendants = lignes.map((ligne) => ligne.membre_id as string)
  const idsParents = lignes
    .map((ligne) => (typeof ligne.parent_id === 'string' ? ligne.parent_id : null))
    .filter((identifiant): identifiant is string => identifiant !== null)

  // UN SEUL appel, descendants et parents ensemble. `nomsMaillonsActifs` lit SOUS RLS et
  // filtre `etat = 'actif'` explicitement (D93) : c'est elle qui garantit qu'aucun nom lu
  // avec la clé de service n'atteint l'écran.
  const noms = await nomsMaillonsActifs(supabaseLecture, [
    ...new Set([...idsDescendants, ...idsParents]),
  ])
  const parId = new Map(noms.map((bref) => [bref.id, bref]))

  // `total` est porté par CHAQUE ligne (`count(*) over ()`). Une page vide n'en porte
  // aucune : on retombe alors sur `compter_descendants`, jamais sur `lignes.length`, qui
  // annoncerait « 0 » pour une descendance de trois cents personnes.
  const totalBrut = lignes[0]?.total
  const total =
    lignes.length > 0
      ? Number(totalBrut)
      : await compterDescendants(supabaseAdmin, membreId)
  if (!Number.isFinite(total)) {
    throw new Error('Forme inattendue renvoyée par descendants_membre : total illisible.')
  }

  return {
    lignes: lignes.map((ligne) => {
      const identifiant = ligne.membre_id as string
      const parentId = typeof ligne.parent_id === 'string' ? ligne.parent_id : null
      return {
        // Un descendant dont le nom n'est pas lisible garde sa place : `membre` retombe
        // sur un bref sans nom, que l'écran rend par `libelleFiche`. L'effacer ferait
        // mentir le total de la section.
        membre: parId.get(identifiant) ?? { id: identifiant, nom: '', prenom: '' },
        parentId,
        parent: parentId ? (parId.get(parentId) ?? null) : null,
        profondeur: Number(ligne.profondeur),
      }
    }),
    total,
  }
}

/** Repli de `descendanceParPage` quand la page est vide. Voir D148. */
async function compterDescendants(
  supabaseAdmin: SupabaseClient,
  membreId: string,
): Promise<number> {
  const { data, error } = await supabaseAdmin.rpc('compter_descendants', {
    p_membre: membreId,
    p_profondeur_min: 2,
  })
  if (error) {
    throw new Error(`Comptage de la descendance impossible : ${error.message}`)
  }
  const total = Number(data)
  if (!Number.isFinite(total)) {
    throw new Error('Forme inattendue renvoyée par compter_descendants.')
  }
  return total
}
```

- [ ] **Step 2 : Écrire les enveloppes**

Créer `src/lib/donnees/mes-membres.ts` :

```ts
import 'server-only'
import { clientAdmin } from '@/lib/supabase/admin'
import { clientServeur } from '@/lib/supabase/serveur'
import {
  descendanceParPage,
  membresParRelation,
  type LigneDescendance,
} from './mes-membres-lots'
import type { MembreBref } from './membres'
import type { PageLue } from './pagination'

export { TAILLE_PAGE_MES_MEMBRES, type LigneDescendance } from './mes-membres-lots'

/** Mes disciples DIRECTS, actifs. Section 1 de /mes-membres. */
export async function mesDisciplesPage(membreId: string, page: number): Promise<PageLue<MembreBref>> {
  return membresParRelation(await clientServeur(), 'faiseur_de_disciple_id', membreId, { page })
}

/** Ceux dont je suis le DIRIGEANT désigné, actifs. Section 3. */
export async function mesDirigesPage(membreId: string, page: number): Promise<PageLue<MembreBref>> {
  return membresParRelation(await clientServeur(), 'dirigeant_id', membreId, { page })
}

/** Ceux qui m'ont désigné comme CONTACT, actifs. Section 4. */
export async function mesContactsPage(membreId: string, page: number): Promise<PageLue<MembreBref>> {
  return membresParRelation(await clientServeur(), 'contact_id', membreId, { page })
}

/**
 * Ma descendance AU-DELÀ du niveau 1. Section 2.
 *
 * Deux clients : la clé de service pour la FORME de l'arbre, la lecture sous RLS pour les
 * NOMS (D141). Voir `descendanceParPage` pour pourquoi.
 */
export async function maDescendancePage(
  membreId: string,
  page: number,
): Promise<PageLue<LigneDescendance>> {
  return descendanceParPage(clientAdmin(), await clientServeur(), membreId, { page })
}
```

- [ ] **Step 3 : Ajouter les preuves de non-troncature**

Ajouter à `tests/rls/descendants.test.ts` — elles appellent **le code de production**, avec une taille de page abaissée, exactement comme `tests/rls/arborescence.test.ts` le fait déjà :

```ts
import { descendanceParPage, membresParRelation } from '@/lib/donnees/mes-membres-lots'

it('descendanceParPage franchit une vraie frontière de page sans perdre personne', async () => {
  // Avec taillePage = 2 sur une descendance de 4 : additionner les pages 1 et 2 doit
  // rendre les 4, sans doublon ni absent, et chaque page doit porter le MÊME total = 4.
})

it('descendanceParPage rend le bon total sur une page hors bornes', async () => {
  // page = 99 → lignes vides, total = 4 (repli compter_descendants), jamais 0.
})

it('membresParRelation rend le même total sur ses trois colonnes', async () => {
  // Vérifier les trois colonnes, et qu'une fiche ARCHIVÉE n'est jamais rendue.
})
```

- [ ] **Step 4 : Vérifier**

Run: `npx tsc --noEmit && npm run test:rls -- descendants`
Expected: PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/lib/donnees/mes-membres-lots.ts src/lib/donnees/mes-membres.ts tests/rls/descendants.test.ts
git commit -m "feat(donnees): lectures paginées des quatre sections de « mes membres »"
```

---

### Task 12 : L'écran `/mes-membres`

**Files :**
- Create: `src/lib/domaine/mes-membres.ts`
- Create: `src/lib/domaine/mes-membres.test.ts`
- Create: `src/app/mes-membres/section.tsx`
- Create: `src/app/mes-membres/page.tsx`

**Interfaces :**
- Consumes : `mesDisciplesPage`, `mesDirigesPage`, `mesContactsPage`, `maDescendancePage`, `LigneDescendance`, `TAILLE_PAGE_MES_MEMBRES` (Task 11) ; `compteurAelMembre`, `statutsDuMembre`.
- Produces : `export type ResumeMembre = { id: string; libelle: string; complement: string | null; statuts: string[] }` ; `export function resumerSection(...)`.

- [ ] **Step 1 : Écrire les tests de composition**

Créer `src/lib/domaine/mes-membres.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { LIBELLE_FICHE_NON_CONSULTABLE } from './membre'
import { resumerSection } from './mes-membres'

describe('resumerSection', () => {
  it('nomme chaque membre et joint ses statuts', () => {
    const resume = resumerSection(
      [{ id: 'm1', nom: 'Lovelace', prenom: 'Ada' }],
      { m1: ['Baptisé'] },
      {},
    )
    expect(resume).toEqual([
      { id: 'm1', libelle: 'Ada Lovelace', complement: null, statuts: ['Baptisé'] },
    ])
  })

  it('rend « Fiche non consultable » pour un membre sans nom lisible', () => {
    const resume = resumerSection([{ id: 'm1', nom: '', prenom: '' }], {}, {})
    expect(resume[0].libelle).toBe(LIBELLE_FICHE_NON_CONSULTABLE)
  })

  it('porte le compteur AEL en complément quand il est connu', () => {
    const resume = resumerSection([{ id: 'm1', nom: 'Lovelace', prenom: 'Ada' }], {}, { m1: 7 })
    expect(resume[0].complement).toBe('7 AEL')
  })

  it("n'invente aucun compteur quand il est absent", () => {
    const resume = resumerSection([{ id: 'm1', nom: 'Lovelace', prenom: 'Ada' }], {}, {})
    expect(resume[0].complement).toBeNull()
  })
})
```

- [ ] **Step 2 : Lancer les tests**

Run: `npm test -- mes-membres`
Expected: FAIL — le module n'existe pas.

- [ ] **Step 3 : Implémenter la composition**

Créer `src/lib/domaine/mes-membres.ts` :

```ts
import { LIBELLE_FICHE_NON_CONSULTABLE } from './membre'

/** Une ligne prête à afficher dans une section de /mes-membres. */
export type ResumeMembre = {
  id: string
  libelle: string
  /** Synthèse courte (compteur AEL), ou `null` si elle n'est pas connue. */
  complement: string | null
  statuts: string[]
}

/**
 * Compose les lignes d'une section à partir de trois lectures indépendantes.
 *
 * FONCTION PURE : elle ne lit pas la base, et c'est ce qui la rend prouvable sans base.
 * Les trois entrées lui sont fournies par l'écran, qui les a lues EN LOT (D144).
 *
 * ═══ UN COMPTEUR ABSENT N'EST PAS UN ZÉRO ═══
 * `compteurs[id]` manquant rend `complement: null`, jamais `'0 AEL'`. La vue
 * `compteurs_ael` peut ne pas rendre de ligne pour un membre ; afficher « 0 AEL » ferait
 * dire à l'écran que cette personne n'a suivi aucun AEL, ce qu'aucune lecture n'établit.
 *
 * ═══ UN NOM VIDE N'EST PAS UN BLANC ═══
 * `descendanceParPage` rend un bref sans nom pour un descendant que la RLS cache — il garde
 * sa place, sans quoi le total de la section mentirait. Ici, il devient
 * « Fiche non consultable » (D98, D100), jamais une ligne vide.
 */
export function resumerSection(
  membres: ReadonlyArray<{ id: string; nom: string; prenom: string }>,
  statutsParMembre: Readonly<Record<string, string[]>>,
  compteursParMembre: Readonly<Record<string, number>>,
): ResumeMembre[] {
  return membres.map((membre) => {
    const nomComplet = `${membre.prenom} ${membre.nom}`.trim()
    const compteur = compteursParMembre[membre.id]
    return {
      id: membre.id,
      libelle: nomComplet.length > 0 ? nomComplet : LIBELLE_FICHE_NON_CONSULTABLE,
      complement: typeof compteur === 'number' ? `${compteur} AEL` : null,
      statuts: statutsParMembre[membre.id] ?? [],
    }
  })
}
```

- [ ] **Step 4 : Lancer les tests**

Run: `npm test -- mes-membres`
Expected: PASS.

- [ ] **Step 5 : Le composant de section**

Créer `src/app/mes-membres/section.tsx` :

```tsx
import Link from 'next/link'
import type { ResumeMembre } from '@/lib/domaine/mes-membres'
import { CLASSES_VARIANTE } from '@/composants/ui/bouton'
import { LigneListe, Liste } from '@/composants/ui/ligne-liste'
import { Pagination } from '@/composants/ui/pagination'

type Props = {
  titre: string
  /** Ce que cette section montre, en une phrase. Jamais omis : quatre listes de noms sans
   *  légende seraient indiscernables les unes des autres. */
  legende: string
  resumes: ResumeMembre[]
  total: number
  page: number
  pages: number
  lienVersPage: (page: number) => string
  /** Vide quand la section n'a personne. Jamais « aucun disciple » sans qualificatif. */
  messageVide: string
  /**
   * Les gestes de statut sont-ils proposés sur les lignes de cette section ? (D143)
   * Faux pour la seule section « dont je suis contact » : le contact ne confère aucun droit.
   */
  gestesStatuts: boolean
  /** Marque de filiation sur les lignes (D106). Faux pour la section « contact » (D134). */
  rail: boolean
  /** Complément par ligne, par identifiant : « via X » pour la descendance. */
  provenance?: Readonly<Record<string, string>>
}

export function Section({
  titre,
  legende,
  resumes,
  total,
  page,
  pages,
  lienVersPage,
  messageVide,
  gestesStatuts,
  rail,
  provenance,
}: Props) {
  return (
    <section className="mt-esp-8">
      <div className="mb-esp-1 flex items-baseline justify-between gap-esp-4">
        <h2 className="text-section">{titre}</h2>
        <span className="chiffres-alignes text-petit text-encre-attenuee">{total}</span>
      </div>
      <p className="mb-esp-3 text-petit text-encre-attenuee">{legende}</p>

      {resumes.length === 0 ? (
        <p className="text-petit text-encre-attenuee">{messageVide}</p>
      ) : (
        <Liste>
          {resumes.map((resume) => (
            <LigneListe
              key={resume.id}
              lien={`/membres/${resume.id}`}
              principal={resume.libelle}
              rail={rail}
              meta={
                <span className="flex flex-wrap items-center gap-esp-2">
                  {provenance?.[resume.id] ? <span>{provenance[resume.id]}</span> : null}
                  {resume.complement ? <span>{resume.complement}</span> : null}
                  {/*
                    ⚠️ PUCES DE CATALOGUE, PAS DES `EtatBadge` (C4) : un statut de catalogue
                    ne porte aucune couleur d'état, et lui en donner une inventerait une
                    information que la donnée n'a pas.
                  */}
                  {resume.statuts.map((statut) => (
                    <span
                      key={statut}
                      className="rounded-full border border-bord-carte px-esp-2 py-esp-1 text-petit"
                    >
                      {statut}
                    </span>
                  ))}
                </span>
              }
              actions={
                gestesStatuts ? (
                  <Link href={`/membres/${resume.id}/statuts`} className={CLASSES_VARIANTE.lien}>
                    Gérer les statuts
                  </Link>
                ) : null
              }
            />
          ))}
        </Liste>
      )}

      {pages > 1 ? (
        <div className="mt-esp-4">
          <Pagination page={page} pages={pages} lienVersPage={lienVersPage} indicateur />
        </div>
      ) : null}
    </section>
  )
}
```

- [ ] **Step 6 : La page**

Créer `src/app/mes-membres/page.tsx` :

```tsx
import Link from 'next/link'
import { compteurAelMembre } from '@/lib/donnees/ael'
import { resumerSection } from '@/lib/domaine/mes-membres'
import {
  maDescendancePage,
  mesContactsPage,
  mesDirigesPage,
  mesDisciplesPage,
  TAILLE_PAGE_MES_MEMBRES,
} from '@/lib/donnees/mes-membres'
import { libelleFiche } from '@/lib/domaine/membre'
import { nombreDePages, pageDemandee } from '@/lib/donnees/pagination'
import { statutsDuMembre } from '@/lib/donnees/statuts'
import { exigerProfilActif } from '@/lib/securite/garde'
import { CLASSES_VARIANTE } from '@/composants/ui/bouton'
import { Carte } from '@/composants/ui/carte'
import { EnTetePage } from '@/composants/ui/en-tete-page'
import { Section } from './section'

/**
 * Une section par question, quatre questions différentes (D142).
 *
 * ═══ LES RECOUVREMENTS SONT ASSUMÉS, PAS SUBIS ═══
 * Une même personne peut être à la fois un disciple direct et quelqu'un dont je suis le
 * dirigeant : elle figure alors dans DEUX sections. N'afficher chacun que dans « la section
 * la plus forte » effacerait l'information « je suis AUSSI son contact ». La légende de
 * chaque section le dit.
 *
 * ═══ CHAQUE SECTION A SON PROPRE PARAMÈTRE DE PAGE ═══
 * `?disciples=2` ne doit pas repaginer les trois autres sections.
 */
export default async function PageMesMembres({
  searchParams,
}: {
  searchParams: Promise<{
    disciples?: string
    descendance?: string
    diriges?: string
    contacts?: string
  }>
}) {
  const profil = await exigerProfilActif()
  const parametres = await searchParams

  // D146 — un compte sans fiche membre voit un encart, PAS quatre listes vides. Quatre
  // listes vides feraient croire à un membre sans disciples au lieu d'un compte sans fiche.
  if (!profil.membreId) {
    return (
      <main className="mx-auto w-full max-w-3xl px-esp-6 py-esp-10">
        <EnTetePage
          retour={{ href: '/tableau-de-bord', libelle: 'Retour au pilotage' }}
          titre="Mes membres"
        />
        <Carte ton="avertissement">
          Ce compte n&apos;est relié à aucune fiche de suivi. Il n&apos;a donc ni disciples ni
          personnes à suivre à afficher ici. Demandez à un administrateur de relier votre
          compte à votre fiche.
        </Carte>
      </main>
    )
  }

  const membreId = profil.membreId
  const pageDisciples = pageDemandee(parametres.disciples)
  const pageDescendance = pageDemandee(parametres.descendance)
  const pageDiriges = pageDemandee(parametres.diriges)
  const pageContacts = pageDemandee(parametres.contacts)

  const [disciples, descendance, diriges, contacts] = await Promise.all([
    mesDisciplesPage(membreId, pageDisciples),
    maDescendancePage(membreId, pageDescendance),
    mesDirigesPage(membreId, pageDiriges),
    mesContactsPage(membreId, pageContacts),
  ])

  // D144 — SYNTHÈSE LUE EN LOT, jamais une requête par ligne. `compteurAelMembre` et
  // `statutsDuMembre` prennent un identifiant à la fois : on les appelle en parallèle sur
  // les seuls identifiants de la page courante, jamais en série. Quatre sections de
  // vingt-cinq lignes font au pire cent identifiants distincts.
  const identifiants = [
    ...new Set([
      ...disciples.lignes.map((membre) => membre.id),
      ...descendance.lignes.map((ligne) => ligne.membre.id),
      ...diriges.lignes.map((membre) => membre.id),
      ...contacts.lignes.map((membre) => membre.id),
    ]),
  ]
  const synthese = await Promise.all(
    identifiants.map(async (identifiant) => ({
      identifiant,
      compteur: await compteurAelMembre(identifiant),
      statuts: (await statutsDuMembre(identifiant)).map((statut) => statut.libelle),
    })),
  )
  const compteurs: Record<string, number> = {}
  const statuts: Record<string, string[]> = {}
  for (const ligne of synthese) {
    // `null` n'est PAS 0 : un compteur absent laisse la clé absente, et `resumerSection`
    // rend alors `complement: null`. Écrire 0 ferait dire à l'écran « aucun AEL suivi ».
    if (ligne.compteur !== null) compteurs[ligne.identifiant] = ligne.compteur
    statuts[ligne.identifiant] = ligne.statuts
  }

  // « via X » pour la descendance : `libelleFiche` et non le nom brut, pour qu'un parent
  // non lisible affiche « Fiche non consultable » à sa place, jamais un blanc (D98, D100).
  const provenance: Record<string, string> = {}
  for (const ligne of descendance.lignes) {
    const nomParent = libelleFiche(ligne.parentId, ligne.parent)
    if (nomParent) provenance[ligne.membre.id] = `via ${nomParent}`
  }

  function lien(section: string, page: number): string {
    const suivants = new URLSearchParams({
      disciples: String(pageDisciples),
      descendance: String(pageDescendance),
      diriges: String(pageDiriges),
      contacts: String(pageContacts),
    })
    suivants.set(section, String(page))
    return `/mes-membres?${suivants.toString()}`
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-esp-6 py-esp-10">
      <EnTetePage
        retour={{ href: '/tableau-de-bord', libelle: 'Retour au pilotage' }}
        titre="Mes membres"
        soustitre="Quatre façons d'être lié à quelqu'un. Une même personne peut figurer dans plusieurs sections."
        action={
          <Link href="/demandes/nouvelle" className={CLASSES_VARIANTE.lien}>
            Proposer une personne à suivre
          </Link>
        }
      />

      <Section
        titre="Mes disciples directs"
        legende="Les personnes dont vous êtes le faiseur de disciple."
        resumes={resumerSection(disciples.lignes, statuts, compteurs)}
        total={disciples.total}
        page={pageDisciples}
        pages={nombreDePages(disciples.total, TAILLE_PAGE_MES_MEMBRES)}
        lienVersPage={(page) => lien('disciples', page)}
        messageVide="Aucun disciple actif rattaché."
        gestesStatuts
        rail
      />

      <Section
        titre="Disciples de mes disciples"
        legende="Toute votre descendance au-delà du premier niveau, quelle qu'en soit la profondeur."
        resumes={resumerSection(
          descendance.lignes.map((ligne) => ligne.membre),
          statuts,
          compteurs,
        )}
        total={descendance.total}
        page={pageDescendance}
        pages={nombreDePages(descendance.total, TAILLE_PAGE_MES_MEMBRES)}
        lienVersPage={(page) => lien('descendance', page)}
        messageVide="Aucun disciple de disciple actif."
        gestesStatuts
        rail
        provenance={provenance}
      />

      <Section
        titre="Ceux dont je suis dirigeant"
        legende="Les personnes qui vous ont pour dirigeant désigné."
        resumes={resumerSection(diriges.lignes, statuts, compteurs)}
        total={diriges.total}
        page={pageDiriges}
        pages={nombreDePages(diriges.total, TAILLE_PAGE_MES_MEMBRES)}
        lienVersPage={(page) => lien('diriges', page)}
        messageVide="Vous n'êtes le dirigeant d'aucun membre actif."
        gestesStatuts
        rail
      />

      {/*
        ⚠️ LA SEULE SECTION SANS GESTES ET SANS RAIL, ET ELLE DIT POURQUOI.
        `gestesStatuts={false}` : `peutModifier` donne autorité à l'administrateur, à
        l'ancêtre à toute profondeur et au dirigeant désigné — jamais au contact (D143).
        Proposer « Gérer les statuts » ici mènerait à un écran sans formulaire, ce qui se
        lirait comme un défaut. `rail={false}` : le contact n'est pas une relation de
        discipulat (D134). L'absence est ÉNONCÉE dans la légende, pas laissée muette.
      */}
      <Section
        titre="Ceux dont je suis contact"
        legende="Les personnes qui vous ont désigné comme contact. Ce lien ne donne aucun droit sur leur fiche : vous ne pouvez pas y gérer les statuts."
        resumes={resumerSection(contacts.lignes, statuts, compteurs)}
        total={contacts.total}
        page={pageContacts}
        pages={nombreDePages(contacts.total, TAILLE_PAGE_MES_MEMBRES)}
        lienVersPage={(page) => lien('contacts', page)}
        messageVide="Personne ne vous a désigné comme contact."
        gestesStatuts={false}
        rail={false}
      />
    </main>
  )
}
```

- [ ] **Step 7 : Vérifier**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: PASS.

- [ ] **Step 8 : Commit**

```bash
git add src/lib/domaine/mes-membres.ts src/lib/domaine/mes-membres.test.ts src/app/mes-membres/
git commit -m "feat(mes-membres): écran à quatre sections distinctes, contact sans gestes ni rail"
```

---

### Task 13 : La navigation, et la porte du lot C

**Files :**
- Modify: `src/app/tableau-de-bord/page.tsx`
- Create: `tests/e2e/mes-membres.spec.ts`

- [ ] **Step 1 : Les deux entrées**

Dans `src/app/tableau-de-bord/page.tsx` :

Ajouter, **en tête** de la `Liste variante="navigation"` — avant « Consulter l'annuaire » : ce sont les deux écrans personnels, et ils précèdent les écrans collectifs.

```tsx
        <LigneListe lien="/mes-membres" principal="Mes membres" />
        <LigneListe lien="/profil" principal="Mon profil" />
```

Les deux sont visibles de **tout compte actif** : ce ne sont pas des écrans d'administration, ils n'ont donc aucune condition de rôle.

Rendre le sous-titre cliquable :

```tsx
        soustitre={
          <Link href="/profil" className={CLASSES_VARIANTE.lien}>
            {`Connecté en tant que ${profil.nomAffichage} (${profil.identifiant})`}
          </Link>
        }
```

Ajouter les imports `Link` (`next/link`) et `CLASSES_VARIANTE` (`@/composants/ui/bouton`).

- [ ] **Step 2 : L'essai de bout en bout**

Créer `tests/e2e/mes-membres.spec.ts` :

```ts
import { expect, test } from '@playwright/test'

test('les quatre sections sont présentes et distinctes', async ({ page }) => {
  // Se connecter avec un compte ordinaire relié à une fiche qui a au moins un disciple.
  // Aller sur /mes-membres.
  // Vérifier les quatre titres : « Mes disciples directs », « Disciples de mes disciples »,
  // « Ceux dont je suis dirigeant », « Ceux dont je suis contact ».
})

test("la section « contact » ne propose PAS de gérer les statuts (D143)", async ({ page }) => {
  // Dans la section « Ceux dont je suis contact », vérifier qu'aucun lien
  // « Gérer les statuts » n'existe, et que la légende dit que ce lien ne donne aucun droit.
  // Dans « Mes disciples directs », vérifier qu'un tel lien EXISTE.
})

test('un disciple de disciple porte sa provenance « via X »', async ({ page }) => {
  // Sur une chaîne A → B → C, connecté en A : C figure dans la deuxième section
  // avec la mention « via B ».
})

test("chaque section pagine indépendamment", async ({ page }) => {
  // Passer la première section à la page 2 et vérifier que l'URL porte
  // ?disciples=2 SANS changer descendance, diriges ni contacts.
})

test('le tableau de bord mène au profil et à mes membres', async ({ page }) => {
  // Depuis /tableau-de-bord, les deux entrées existent et mènent aux bonnes routes.
})
```

- [ ] **Step 3 : La porte du lot C, et de la phase**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build && npm run test:rls && npm run test:e2e`
Expected: PASS partout. **Toute la suite e2e**, pas seulement les nouveaux fichiers : c'est le passage de porte de la phase.

- [ ] **Step 4 : Commit**

```bash
git add src/app/tableau-de-bord/page.tsx tests/e2e/mes-membres.spec.ts
git commit -m "feat(navigation): ouvrir « Mon profil » et « Mes membres » depuis le pilotage"
```

---

### Task 14 : Revue de sécurité du lot B, et README

**Files :**
- Modify: `README.md`

> Cette tâche est le prix de la phase unique. Le lot B ouvre le premier chemin d'écriture non administrateur du projet, et il a été implémenté au milieu de deux lots qui ne touchent à aucun droit. **La revue qu'il aurait eue en phase séparée a lieu ici, explicitement.**

- [ ] **Step 1 : Relire le chemin d'écriture de bout en bout**

Ouvrir dans cet ordre : `src/app/profil/formulaire-coordonnees.tsx`, `src/app/profil/actions.ts`, `supabase/migrations/20260820120000_modifier_mon_profil.sql`. Vérifier point par point :

- [ ] `modifierMonProfil` commence par `exigerProfilActif()` — **première** instruction.
- [ ] `p_profil` vaut `profil.id`. **Rechercher `donnees.get` dans `actions.ts`** : aucun appel ne doit produire un identifiant de profil, de membre, ou de cible.
- [ ] `coordonneesPersonnellesDepuisFormData` ne lit que six clés. Les compter dans `membre.ts`.
- [ ] La signature SQL n'a que sept paramètres. Les compter dans la migration.
- [ ] Aucune politique RLS d'écriture n'a été ajoutée : `grep -rn "for insert\|for update\|for delete" supabase/migrations/2026082*.sql` ne rend rien.
- [ ] `authenticated` n'a l'exécution d'**aucune** des quatre nouvelles fonctions. Vérifier les `revoke`/`grant` des trois migrations de la phase.
- [ ] `error.details` n'est journalisé que via `MARQUEURS_CONNUS`, dans `actions.ts`.

- [ ] **Step 2 : Vérifier en base que rien n'a été laissé ouvert**

```sql
select p.proname, pg_get_function_identity_arguments(p.oid) as arguments,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_peut
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('modifier_mon_profil', 'descendants_membre', 'compter_descendants', 'creer_membre_enrichi');
```

Expected: **quatre lignes**, `authenticated_peut` à `false` sur les quatre, et une seule ligne pour `creer_membre_enrichi`.

- [ ] **Step 3 : Mettre le README à jour**

Le README documente les phases livrées. Y ajouter une section « Phase 7 » décrivant : le champ contact et ce qu'il ne donne pas, la page de profil et la liste **fermée** des six colonnes auto-modifiables, et l'écran « Mes membres » et ses quatre sections. Reprendre le ton et le niveau de détail des sections des phases précédentes — les lire avant d'écrire.

- [ ] **Step 4 : Commit**

```bash
git add README.md
git commit -m "docs: consigner la phase 7 et la revue du premier chemin d'écriture non administrateur"
```

---

## Auto-revue du plan

**Couverture de la spec :**

| Décision | Tâche |
|----------|-------|
| D130 colonne ordinaire, pas l'arbre | 1, 2, 3 |
| D131 aucun anti-cycle | 1 (+ preuve du contact réciproque) |
| D132 aucune RLS | 1 (+ preuve) |
| D133 « Adresse de contact » | 5 |
| D134 pas de `rail-filiation` | 5, 12 |
| D135 `drop` + `create` + privilèges | 3 (+ vérification `pg_proc`) |
| D136 contrôle amont | 4 |
| D137 passerelle, `p_profil` de la session | 6, 8 |
| D138 liste blanche fermée | 2, 6, 8 (+ preuves) |
| D139 profil sans fiche | 7, 9 |
| D140 aucune politique d'écriture | 6, 14 |
| D141 identifiants affranchis, noms sous RLS | 10, 11 |
| D142 quatre sections, aucun dédoublonnage | 12 |
| D143 gestes sauf section contact | 12, 13 |
| D144 synthèse en lot | 12 |
| D145 pagination | 11, 12 |
| D146 compte sans fiche | 12 |
| D147 « gérer » = statuts affichés + lien | 12 |
| D148 pagination SQL, filtre sur les lignes | 10 (+ preuve centrale), 11 |

**Cohérence des types :** `FicheMembre.contactId` (T2) → `MembreDetail.contactId` (T4) → `contactInitial` (T5) → `membre.contactId` (T7). `CoordonneesPersonnelles` (T2) → `modifierMonProfil` (T8) → `modifier_mon_profil` (T6), six champs des deux côtés. `LigneDescendance` (T11) → `resumerSection` (T12). `PageLue<T>` réutilisé, jamais redéfini.

**Points sensibles, à ne pas laisser passer en revue :**
1. **T3** — vérifier `pg_proc` : une surcharge de `creer_membre_enrichi` ferait disparaître le contact en silence.
2. **T10** — le `join` filtrant `etat = 'actif'` est dans `filtree`, **jamais** dans `branche`.
3. **T8** — aucun identifiant de cible ne vient du `FormData`.
4. **T12** — `compteurAelMembre` rendant `null` ne devient jamais `0`.
