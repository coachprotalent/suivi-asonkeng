# Phase 4 — Événements : types, événements, participants externes, trois désirs, liste à traiter, conversion : plan d'implémentation

> **Pour les agents implémenteurs :** COMPÉTENCE OBLIGATOIRE — utiliser
> `superpowers:subagent-driven-development` (recommandé) ou `superpowers:executing-plans`
> pour exécuter ce plan tâche par tâche. Les étapes emploient la syntaxe à cases
> (`- [ ]`) pour le suivi.
>
> **Chaque tâche est écrite pour être lue SEULE.** Un implémenteur ne lit que sa tâche.
> Les pièges qui la concernent sont répétés dans son corps, jamais seulement en tête de
> ce document.

**But :** livrer le catalogue des types d'événement, les événements, les participants
(membres et externes), les trois désirs, la liste « à traiter », les étiquettes de
séminaires sur la fiche membre, le classement sans suite avec motif, et la conversion
d'un participant externe en membre par ses trois chemins — plus deux corrections du
socle que la phase 4 rend inévitables (la politique `membres_lecture` extraite en
fonction, et le verrou « arbre » manquant sur `validerDemandeNouvellePersonne`).

**Architecture :** ce plan ajoute (1) douze migrations strictement additives — deux
primitives de sécurité, quatre tables, deux vues aux régimes **opposés**, une valeur
d'énumération isolée, deux passerelles `security definer` et l'amendement d'une
troisième ; (2) des fonctions de domaine pures ; (3) une couche de lecture paginée avec
tri total, dans un module importable hors Next pour que les preuves fassent tourner le
code de production ; (4) quatre écrans neufs et trois écrans existants amendés ; (5) cinq
suites de preuves, dont une contre un build de **production**.

**Pile technique :** Next.js 16 (App Router, Server Actions), TypeScript, Supabase
(Postgres + Auth), Tailwind, Vitest, Playwright.

**Documents de référence :**
- `docs/superpowers/specs/2026-08-14-phase-4-evenements-design.md` — le design de cette
  phase, ses décisions **D54 à D80**, ses pièges connus (§10) et ses preuves exigées
  (§9). Fait autorité ; aucune de ses décisions n'est rouverte ici.
- `docs/superpowers/specs/2026-08-11-suivi-asonkeng-design.md` — la spécification
  maîtresse, en particulier §2, §4.4, §5.2, §5.3 et §6.
- `docs/superpowers/plans/2026-08-13-phase-2b-inscriptions.md` et
  `2026-08-13-phase-3-ael.md` — modèles de forme et de granularité.

---

## Numérotation des décisions : lire ceci avant de citer un numéro

Les numéros de décision sont **globaux au projet** et **ne sont renumérotés par aucune
tâche de ce plan**. Ils sont cités dans des `comment on` **déjà appliqués en base** :
renuméroter créerait une seconde vérité sans supprimer la première.

**D36 à D43 désignent chacun DEUX décisions distinctes** — le design de la phase 2b va
jusqu'à D42 plus une correction D43, et celui de la phase 3 a repris à D36. Partout où
ce plan cite un de ces huit numéros, **la phase est écrite** : « D36 (2b) » ou « D36
(phase 3) ». Faire de même dans tout commentaire de code écrit par ce plan. La Task 28
pose la note de désambiguïsation dans la spécification maîtresse ; elle ne change aucun
numéro.

---

## Contraintes globales

Ces règles s'appliquent à **chaque** tâche.

1. **Un seul projet Supabase sert au développement ET à la production.** Pousser vers
   `main` déploie immédiatement, sans intégration continue. Les migrations sont
   strictement **additives**. **Ne jamais exécuter `supabase db reset`.** Ne jamais
   modifier une migration déjà appliquée.
2. **`supabase db push` suit les migrations par VERSION, pas par contenu.** Un numéro
   déjà inscrit dans `supabase_migrations.schema_migrations` fait tenir un fichier neuf
   pour « déjà appliqué » : rien n'est joué, `--dry-run` ne l'annonce pas,
   `migration list` dit « appliqué des deux côtés », et l'objet **n'existe pas en base**.
   Ce piège s'est refermé **deux fois** dans ce projet. La **Task 1** porte une étape
   zéro obligatoire de relevé du plus haut numéro **réellement présent** ; toute tâche
   ultérieure portant une migration se place strictement au-dessus de ce relevé.
3. **Aucune politique RLS d'écriture, sur aucune table.** Toute mutation passe par une
   Server Action **gardée en première instruction**, qui écrit via `clientAdmin()` ou par
   une passerelle `security definer` réservée à `service_role`.
4. **Les six portes** doivent être vertes avant tout commit :
   `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run test:rls`,
   `npm run test:e2e`, `npm run build`. **Plus `npm run test:e2e:prod`** dès qu'une tâche
   touche un message affiché à l'utilisateur.
5. **Ne stager que ses propres fichiers.** Jamais `git add -A`.
6. **Apostrophes :** apostrophe **droite** (`'`) partout, jamais typographique. En
   TypeScript, une chaîne contenant une apostrophe s'écrit entre **guillemets doubles**
   (`"L'événement"`) — une apostrophe dans une chaîne délimitée par des apostrophes
   produit `TS1005`, et **ce piège s'est refermé quatre fois, toujours par les briefs**.
   En JSX rendu, `&apos;`. En SQL, apostrophes **doublées** (`''`). Attention en
   recopiant du SQL depuis le document de design : ce qui y est écrit `''''` (dans un
   contexte déjà cité) s'écrit `''` dans un fichier `.sql` réel — voir la Task 6.
7. **Une trace serveur systématique sur tout échec** (`console.error` avec `code`,
   `details`, `message`), y compris pour les cas classifiés.
8. **Ne jamais discriminer une erreur Postgres sur le texte français de son message.**
   Uniquement `error.code` (`23505`, `23503`, `23514`, `42501`) ou le marqueur posé dans
   `error.details` via `using detail`. **N'affirmer aucun code d'erreur sans l'avoir
   vérifié contre la base** : quatre hypothèses tenues pour acquises se sont révélées
   fausses dans ce projet, y compris dans des briefs et dans une revue.
9. **Un refus MÉTIER se RETOURNE, il ne se lève jamais.** Une exception levée depuis une
   Server Action est remplacée par un digest React en build de production : l'utilisateur
   lit `Minified React error #441`. `src/app/error.tsx` est **statique** et ne lit jamais
   `error.message`. Une vraie panne technique peut lever. `redirect()` lève une exception
   de contrôle : **jamais dans un `try`**.
10. **PostgREST tronque en SILENCE au-delà de `max_rows = 1000`**
    (`supabase/config.toml:18`). Corrigé **quatre fois** dans ce projet. Toute lecture
    susceptible de croître est **paginée avec un tri TOTAL** (dernière clé unique —
    `nom` puis `prenom` n'est **pas** total, et deux homonymes à cheval sur une frontière
    de page sont rendus deux fois **ou jamais**), ou **échoue bruyamment**
    (`refuserTroncature`). Jamais rendre un résultat tronqué comme complet. Motif
    éprouvé : `src/lib/donnees/membres-lots.ts` et `presences-lots.ts`.
11. **Toute vérification par recherche exige un CONTRÔLE POSITIF.** Sur un balayage de
    nettoyage, cela veut dire **planter un résidu et vérifier qu'on le retrouve** — pas
    relire le fichier.
12. **Tout test protégeant une barrière exige une PREUVE PAR MUTATION** : casser la
    barrière, constater que le test tombe *et pour la bonne raison*, restaurer, comparer
    l'empreinte restaurée à l'originale (`pg_get_constraintdef`, `pg_get_functiondef`,
    `pg_get_triggerdef`). Ne **jamais** laisser une mutation active au-delà d'une
    exécution : le projet n'a **qu'une** base.
13. **Les suites de tests écrivent en base de PRODUCTION.** Tout ce que cette phase crée
    doit être retrouvable et nettoyable **même après une interruption** : préfixe de
    famille (`ZZ…-`, tiret littéral) sur `evenements.titre` et
    `participants_externes.nom`, **et** `cree_par` / `saisi_par` sur les lignes sans
    champ nommable — un tableau en mémoire est perdu au premier `Ctrl-C`.
14. **Nettoyage dans un `afterAll`** (le corps d'un test ne s'exécute pas si une
    assertion tombe avant), **vérifié par comptage**, et dans le **bon ordre** : plusieurs
    clés sont en `on delete restrict`, et un `on delete set null` peut **effacer la prise
    juste avant qu'on la cherche**. Ordre imposé par cette phase :
    `participations` → `participants_externes` → `demandes_membre` → `membres` →
    `evenements` → `types_evenement`, **et le tout avant la suppression du compte de
    test**.
15. **Compter des DELTAS, jamais des totaux absolus** : un comptage absolu sur une base
    jamais réinitialisée est vrai au premier lancement et faux pour toujours ensuite.
16. **Un `insert` de préparation dont l'erreur est jetée rend le test vert en éprouvant
    un tout autre chemin.** Trouvé trois fois. Toute préparation vérifie son erreur et
    **lève**.
17. **Une preuve sur un ensemble vide ne prouve rien ; une assertion négative ne prouve
    rien sans contrôle positif DANS LA MÊME SITUATION.** Un test qui affirme qu'un rôle
    « ne peut pas » doit **forger l'appel** et porter un **canari** — un test de ce
    projet a déjà **certifié une garde qu'il n'éprouvait pas**, vert contre la version
    vulnérable. Motif validé : `tests/e2e/statuts.spec.ts` et `tests/e2e/autorite.spec.ts`.
18. **Un écran à visibilité différenciée se vérifie DEPUIS CHAQUE RÔLE**, jamais depuis
    le seul administrateur.
19. **Le compte `racine` n'est ni touché NI POLLUÉ.** On peut le polluer sans le toucher :
    `notifierAdministrateurs` atteint **tous** les comptes administrateurs actifs. Toute
    tâche qui déclenche une notification en test la nettoie par `demande_id`.
20. **Les suites e2e sont sérialisées** (`workers: 1`), sur un unique serveur partagé.
21. **Un texte d'aide ne vit jamais dans un `<label>`** — il serait concaténé au nom
    accessible. Champ sans aide : `<label>` enveloppant. Champ avec aide : `htmlFor`
    explicite, aide sortie du label et rattachée par `aria-describedby`.
22. **Une mise à jour qui ne touche aucune ligne ne renvoie AUCUNE erreur** : toujours
    `.select('id')` suivi d'une vérification de longueur.
23. **Aucun type `Database` généré** : tout embed PostgREST plusieurs-vers-un rend un
    **objet**, pas un tableau, malgré ce que `postgrest-js` infère ; `.rpc()` rend `any`.
    Un `select` construit par concaténation `+` retombe sur `GenericStringError` — un
    seul littéral, continué par antislash-retour à la ligne.
24. **Toute tâche écrivant un `select` rejoue ses requêtes contre la vraie base**, en
    copiant le `select` **depuis le fichier livré**, jamais depuis ce plan.

---

## Les deux pièges propres à cette phase, à ne manquer sous aucun prétexte

**(A) `unique nulls not distinct` DÉTRUIRAIT cette phase.** C'est la convention maison du
dépôt — `calendriers_ael_creneau_unique` l'emploie **à bon droit**. Appliquée à
`(evenement_id, membre_id)` sur `participations`, elle n'autoriserait qu'**UN SEUL
participant externe par événement** : toutes les lignes d'externes partagent
`membre_id = NULL`, donc s'écraseraient l'une l'autre, et le deuxième externe ajouté
recevrait un `23505` parfaitement opaque. D58 impose **deux index uniques PARTIELS**
(`where <colonne> is not null`). Task 7 et preuve n°2.

**(B) Les deux vues de cette phase ont des régimes OPPOSÉS, et confondre les deux est un
défaut à deux visages.**

| Vue | Régime | Ce qu'une erreur produit |
|---|---|---|
| `seminaires_assistes` | **`security_invoker = false`** (D71) | Avec `true`, la vue devient **silencieusement VIDE** pour tout compte ordinaire : les étiquettes de séminaires disparaissent de **toutes** les fiches, sans la moindre erreur, sans page vide, sans rien à voir |
| `participants_a_traiter` | **`security_invoker = true`** (D74) | Avec `false`, la liste des **confidences** s'ouvre à **tout compte actif** |

Le principe posé en phase 3 (§4.5) — « aucune vue ne doit élargir **silencieusement** ce
qu'un compte peut lire » — pousserait un implémenteur consciencieux à écrire
`security_invoker = true` sur `seminaires_assistes`. **Le mot qui compte est
*silencieusement*.** Écrire `false` explicitement, avec un `comment on view` qui dit
pourquoi, est un **panneau**, pas un oubli. Task 8 (et Task 9 pour l'autre sens), preuves
n°5 et n°7.

---

## Structure des fichiers

**Migrations** (toutes nouvelles, additives ; numéros à confirmer par l'étape zéro de la
Task 1) :

| Fichier | Tâche | Responsabilité |
|---|---|---|
| `20260818100000_primitive_moderateur_ou_admin.sql` | T1 | `prive.est_moderateur_ou_admin()` (D80) |
| `20260818110000_peut_lire_membre.sql` | T2 | `prive.peut_lire_membre(uuid)` + réécriture de `membres_lecture` (D72) |
| `20260818120000_types_evenement.sql` | T4 | Table, RLS, amorçage **idempotent** (D57) |
| `20260818130000_evenements.sql` | T5 | Table, contrainte de période, index, RLS (D56) |
| `20260818140000_participants_externes.sql` | T6 | Table, contraintes, déclencheur des liens définitifs, index partiel, RLS (D60-D64) |
| `20260818150000_participations.sql` | T7 | Table, `num_nonnulls`, **deux index uniques partiels**, RLS (D58, D59, D60) |
| `20260818160000_seminaires_assistes.sql` | T8 | Vue **`security_invoker = false`** (D70, D71, D73) |
| `20260818170000_participants_a_traiter.sql` | T9 | Vue **`security_invoker = true`** (D74) |
| `20260818180000_origine_conversion_participant.sql` | T10 | `alter type … add value`, **SEULE dans son fichier** (D66) |
| `20260818190000_convertir_participant_externe.sql` | T11 | Passerelle des trois chemins (D65-D69) |
| `20260818200000_classer_participant_externe.sql` | T12 | Passerelle de classement (D55, D61, D62) |
| `20260818210000_annuler_demande_membre_conversion.sql` | T13 | Amendement de `annuler_demande_membre` (D64) |

**Sécurité et socle :**

| Fichier | Tâche |
|---|---|
| `src/app/demandes/actions.ts` (modifié) | T3 — `validerDemandeNouvellePersonne` prend le verrou « arbre » ; **T22 — sa garde d'origine accepte `conversion_participant` (D66)**. Deux tâches, deux endroits disjoints du même fichier : T3 réécrit le bloc `colonnesMembre` et l'`update` de `membres`, T22 la condition de refus qui suit la lecture de la demande |

**Domaine et données :**

| Fichier | Tâche |
|---|---|
| `src/lib/domaine/evenements.ts` + `.test.ts` | T14 |
| `src/lib/donnees/evenements-lots.ts` (SANS `server-only`) | T15 |
| `src/lib/donnees/evenements.ts` (`server-only`) | T15 |

**Écrans :**

| Fichier | Tâche |
|---|---|
| `src/app/evenements/types/{page,actions,messages}.ts(x)`, `formulaire-type.tsx`, `bouton-bascule-type.tsx` | T16 |
| `src/app/evenements/{page,actions,messages}.ts(x)`, `formulaire-evenement.tsx` | T17 |
| `src/app/evenements/[id]/{page,actions,messages}.ts(x)`, `formulaire-evenement-edition.tsx` | T18 |
| `src/app/evenements/[id]/participants-actions.ts`, `participants.tsx`, `formulaire-participant-externe.tsx` | T19 |
| `src/app/membres/[id]/page.tsx` (modifié), `src/app/tableau-de-bord/page.tsx` (modifié) | T20 |
| `src/app/evenements/a-traiter/{page,actions,messages}.ts(x)`, `ligne-a-traiter.tsx` | T21 |
| `src/lib/donnees/demandes.ts`, `src/app/demandes/{ligne-demande-admin,ligne-demande-personnelle}.tsx` (modifiés) | T22 |

**Preuves :**

| Fichier | Tâche | Preuves du §9 du design |
|---|---|---|
| `tests/rls/evenements.test.ts` | T23 | 1, 2, 4, 5, 6, 7, 8, 17 |
| `tests/rls/conversion-participants.test.ts` | T24 | 3, 9, 10, 11, 12, 13 |
| `tests/rls/evenements-pagination.test.ts` | T25 | 14 |
| `tests/e2e/evenements.spec.ts` | T26 | 15, 16 |
| `tests/e2e-prod/refus-evenements-production.spec.ts` | T27 | piège n°1 |

**Documentation :**

| Fichier | Tâche |
|---|---|
| `docs/superpowers/specs/2026-08-11-suivi-asonkeng-design.md` (modifié) | T28 |

---

## Carte des décisions D54 à D80

| Décision | Tâche(s) qui la réalise(nt) |
|---|---|
| D54 (correction §4.4 et §6) | **Déjà appliquée dans le dépôt** — voir Task 28, étape 1 |
| D55 (classement réservé à l'admin, ligne de matrice) | T12, T21, T26, T28 |
| D56 (`date` + `heure_debut time`) | T5 |
| D57 (amorçage idempotent) | T4, preuve n°17 (T23) |
| D58 (index uniques partiels) | T7, preuve n°2 (T23) |
| D59 (`num_nonnulls`) | T7, preuve n°1 (T23) |
| D60 (`saisi_par`/`modifie_par`/`cree_par`) | T6, T7, T19 |
| D61 (classement sur la personne) | T6, T12, preuve n°13 (T24) |
| D62 (pas de réouverture) | T6, T12, preuve n°12 (T24) |
| D63 (conversion à sens unique) | T6, preuve n°10 (T24) |
| D64 (`on delete restrict` + annulation refusée) | T6, T13, T22, preuve n°11 (T24) |
| D65 (passerelle unique, atomique) | T11, preuve n°9 (T24) |
| D66 (`conversion_participant`) | T10, T11, T22 |
| D67 (verrou « arbre » chemin 2) | T11 |
| D68 (fiche cible active) | T11, T21 |
| D69 (participation immobile) | T11, T8, preuve n°3 (T24) |
| D70 (vue en union) | T8, preuve n°3 (T24) |
| D71 (`security_invoker = false`) | T8, preuve n°5 (T23) |
| D72 (`prive.peut_lire_membre`) | T2, preuve n°6 (T23) |
| D73 (désirs jamais exposés) | T8, preuves n°4 et n°7 (T23) |
| D74 (`security_invoker = true`) | T9, preuve n°7 (T23) |
| D75 (trois listes paginées, tri total) | T15, preuve n°14 (T25) |
| D76 (`SelecteurMembre` + création à la volée) | T19 |
| D77 (participation modifiable) | T19 |
| D78 (suppression, pas d'annulation) | T19 |
| D79 (pas de journal) | Aucune tâche — rien à écrire, constaté au §12 du design |
| D80 (`prive.est_moderateur_ou_admin`) | T1 |

---

# Partie A — Socle : primitives, politique de lecture, et la dette du verrou « arbre »

Trois tâches préalables. Les deux premières sont consommées par presque tout le reste de
la phase ; la troisième est indépendante et referme un écart de code **déployé** signalé
au §11, point 8 du design.

### Task 1 : étape zéro des migrations, puis `prive.est_moderateur_ou_admin()` (D80)

**Fichiers :**
- Créer : `supabase/migrations/<NUMERO>_primitive_moderateur_ou_admin.sql`

**Interfaces :**
- Consomme : rien.
- Produit : `prive.est_moderateur_ou_admin() returns boolean`, `stable`,
  `security definer`, `set search_path = ''`, `execute` **retiré** de `public`, `anon`,
  `service_role` et **accordé au seul `authenticated`**. Consommée par les politiques de
  lecture de `participations` (Task 7) et `participants_externes` (Task 6).
- Produit aussi : **le numéro de migration plancher** de toute la phase, relevé à
  l'étape 0 et consigné dans le rapport de tâche. Toutes les tâches suivantes qui
  portent une migration s'y adossent.

**Pourquoi une primitive nouvelle.** La phase 3 a livré le garde **applicatif**
`exigerModerateurOuAdministrateur` (D42 — 2b/phase 3 : c'est le D42 de la **phase 3**).
Aucune **politique** n'avait encore besoin de la question, toutes les tables AEL étant
ouvertes à tout compte actif. `participations` et `participants_externes` sont les
**premières tables du projet dont la lecture dépend d'un rôle autre qu'administrateur** :
la primitive manque, et il faut l'écrire. Elle suit le régime des primitives **lues par
les politiques** (`prive.est_actif`, `prive.est_admin`, `prive.est_demandeur_de`), pas
celui des passerelles métier — d'où `grant execute to authenticated` et non à
`service_role`.

- [ ] **Étape 0 — OBLIGATOIRE, À EXÉCUTER, PAS À SURVOLER : relever le plus haut numéro
      de migration RÉELLEMENT présent**

`supabase db push` suit les migrations **par version, pas par contenu**. Un numéro déjà
inscrit dans `supabase_migrations.schema_migrations` fait tenir un fichier neuf pour
« déjà appliqué » : rien n'est joué, `--dry-run` ne l'annonce pas, `migration list` le
montre appliqué **des deux côtés**, et l'objet **n'existe pas en base**. **Ce piège s'est
refermé deux fois dans ce projet.**

```bash
ls supabase/migrations/ | sort | tail -5
```

```bash
npx supabase migration list --linked
```

Relever le plus haut numéro rendu par **chacune** des deux commandes — le dépôt **et** la
base peuvent diverger. Retenir le **maximum des deux**. Au moment de la rédaction de ce
plan, le plus haut du dépôt est `20260817150000`, mais **ce plan ne le suppose pas** :
c'est la sortie réelle des deux commandes qui fait foi, et elle est consignée dans le
rapport de tâche.

Choisir alors le premier numéro de cette phase **strictement supérieur** au maximum
relevé, et attribuer les onze suivants par pas de `10000` sur les heures. Les noms de
fichiers du tableau « Structure des fichiers » supposent `20260818100000` comme plancher :
**si le relevé impose autre chose, décaler les douze en bloc et le noter dans le rapport**
pour que les tâches suivantes reprennent la même série.

- [ ] **Étape 1 : écrire la migration**

Créer `supabase/migrations/<NUMERO>_primitive_moderateur_ou_admin.sql` :

```sql
-- Primitive de sécurité lue par les politiques de la phase 4 (D80).
-- Contrepartie SQL du garde applicatif `exigerModerateurOuAdministrateur` (D42, phase 3),
-- livré sans elle parce qu'aucune POLITIQUE n'avait alors besoin de la question : toutes
-- les tables AEL sont ouvertes à tout compte actif. `participations` et
-- `participants_externes` sont les PREMIÈRES tables du projet dont la LECTURE dépend d'un
-- rôle autre qu'administrateur (spec §5.3, amendée par D23) : la primitive manquait.
--
-- Régime des primitives LUES PAR LES POLITIQUES, distinct de celui des passerelles
-- métier : les expressions de politique s'évaluent avec les privilèges du rôle appelant,
-- donc `authenticated` doit pouvoir l'exécuter, et `service_role` n'en a aucun besoin.

create or replace function prive.est_moderateur_ou_admin()
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
      and rp.role in ('administrateur', 'moderateur')
      and p.actif
  );
$$;

comment on function prive.est_moderateur_ou_admin() is
  'Vrai si le compte appelant est actif ET porte le rôle administrateur OU moderateur (D80, spec §5.3 amendée par D23). SECURITY DEFINER pour la même raison que prive.est_admin() : elle lit roles_profil et profils en s''affranchissant de leur propre RLS. Le test p.actif n''est PAS redondant avec prive.est_actif() employé à côté dans les politiques : cette fonction doit rester vraie de bout en bout par elle-même, sans dépendre de ce qu''un appelant pense avoir déjà vérifié.';

revoke execute on function prive.est_moderateur_ou_admin() from public, anon, service_role;
grant execute on function prive.est_moderateur_ou_admin() to authenticated;
```

**Le `in ('administrateur', 'moderateur')` porte sur l'énumération `public.role_app`**
(`20260811120000_socle_profils.sql`), dont ce sont **les deux seules valeurs**. Écrire
`rp.role is not null` serait équivalent aujourd'hui et **faux demain** : la question posée
est bien « un de ces deux rôles », pas « un rôle quelconque ».

- [ ] **Étape 2 : appliquer et VÉRIFIER QUE L'OBJET EXISTE VRAIMENT**

```bash
npx supabase db push --linked
```

Puis, et c'est **le contrôle qui manquait les deux fois où le piège s'est refermé** —
interroger la base, pas la liste des migrations :

Créer `scripts/.tmp-verif/verifier-primitive.mjs` :

```javascript
import { createClient } from '@supabase/supabase-js'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

// `service_role` n'a PAS le droit d'exécuter cette fonction (revoke ci-dessus), et le
// schéma `prive` n'est de toute façon PAS exposé à PostgREST : l'appel n'atteint jamais le
// contrôle de privilège, il échoue AVANT, à la résolution du nom. On ne peut donc pas
// l'appeler pour prouver son existence — ce contrôle prouve seulement que l'appel est
// FERMÉ depuis l'extérieur.
const { data, error } = await admin.rpc('est_moderateur_ou_admin')
console.log('appel direct (attendu : ERREUR de résolution PostgREST) :', error?.code, error?.message)
```

```bash
npx dotenv -e .env.local -- node scripts/.tmp-verif/verifier-primitive.mjs
```

**Attendu : une erreur de RÉSOLUTION PostgREST — `PGRST202`, « aucune fonction de ce nom
pour ces arguments »** (le même code que documente déjà
`supabase/migrations/20260815270000_relacher_token_inscription_rend_son_effet.sql`).
**Consigner le code réellement observé**, jamais celui qu'on attendait.

**CE CONTRÔLE NE PROUVE PAS L'EXISTENCE DE LA FONCTION**, et il ne faut pas lire son
échec comme une alternative informative entre deux causes : le schéma `prive` n'étant pas
exposé à PostgREST, **exactement la même erreur surviendrait si la fonction n'existait
pas**. Un `42501` de privilège n'est pas atteignable ici, et l'attendre laisserait croire
qu'on saurait distinguer « existe mais fermée » de « n'existe pas ».

**L'existence réelle de la fonction est prouvée ailleurs, et bruyamment** : la politique de
`participations` (Task 7) ne pourrait pas être créée si la primitive manquait — son
`create policy` échouerait à l'application de la migration, immédiatement et sans
ambiguïté. C'est **ce** signal-là qui referme le piège n°2, et la Task 23 l'éprouve
ensuite par le comportement.

```bash
rm -rf scripts/.tmp-verif
```

- [ ] **Étape 3 : les six portes, puis commit**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls && npm run test:e2e && npm run build
```

```bash
git add supabase/migrations/<NUMERO>_primitive_moderateur_ou_admin.sql
git commit -m "feat: ajouter la primitive RLS prive.est_moderateur_ou_admin (D80)"
```

**Preuve produite par cette tâche :** la sortie **réelle** des deux commandes de l'étape 0,
consignée verbatim dans le rapport, et le numéro plancher retenu.

---

### Task 2 : `prive.peut_lire_membre(uuid)` et réécriture de `membres_lecture` (D72)

**Fichiers :**
- Créer : `supabase/migrations/<NUMERO+1>_peut_lire_membre.sql`

**Interfaces :**
- Consomme : `prive.est_actif()`, `prive.est_admin()`, `prive.est_demandeur_de(uuid)`
  (déjà en base).
- Produit : `prive.peut_lire_membre(p_membre_id uuid) returns boolean`, `stable`,
  `security definer`, `set search_path = ''`, `execute` accordé au seul `authenticated`.
  Consommée par la politique `membres_lecture` **réécrite** et par la vue
  `seminaires_assistes` (Task 8).

**Pourquoi extraire.** La vue `seminaires_assistes` contourne délibérément la RLS de
`participations` (D71) — et contourne **du même geste** celle de `membres`. Sans prédicat,
un compte ordinaire y lirait les couples (identifiant de membre, événement) de fiches
`archive` ou `en_attente` qu'il n'a pas le droit de lire. Recopier l'expression de
`membres_lecture` **dans** la vue la ferait **dériver en silence** le jour où la politique
changera. Une seule définition, jamais deux.

**⚠️ ÉCART ENTRE LE DESIGN ET LE CODE DÉPLOYÉ — À RESPECTER, ET C'EST LE CODE QUI GAGNE.**
Le §5.5 du design écrit l'expression à extraire ainsi :

```
est_actif() and (etat = 'actif' or est_admin() or est_demandeur_de(id))
```

**La politique réellement déployée** (`20260815140000_membres_lecture_demandeur.sql`)
porte une condition **plus étroite** :

```sql
(select prive.est_actif())
and (
  etat = 'actif'
  or (select prive.est_admin())
  or (etat = 'en_attente' and (select prive.est_demandeur_de(id)))
)
```

Le `etat = 'en_attente' and …` du troisième terme **n'est pas dans le design**. Transcrire
le design ouvrirait à un demandeur la lecture de la fiche **archivée** dont il fut un jour
demandeur : un **élargissement silencieux de la RLS**, exactement ce que D72 exige de ne
pas produire, et la preuve n°6 (« la suite RLS existante doit passer **inchangée** »)
tomberait ou, pire, ne le verrait pas. **La fonction ci-dessous reprend l'expression
DÉPLOYÉE, à la lettre.** Cet écart est signalé dans le rapport de la phase.

- [ ] **Étape 1 : relire la politique déployée avant d'écrire quoi que ce soit**

```bash
cat supabase/migrations/20260815140000_membres_lecture_demandeur.sql
```

Copier l'expression du `using (…)` **depuis ce fichier**, jamais depuis ce plan ni depuis
le design. Si elle diffère de ce qui est cité ci-dessus, **c'est elle qui fait foi** : une
migration plus récente a pu la réécrire entre-temps.

```bash
grep -rn "membres_lecture" supabase/migrations/
```

Attendu au moment de la rédaction : `20260812120000` (création),
`20260815140000` (réécriture), `20260815150000` (commentaires seuls). **Vérifier**
qu'aucune migration postérieure ne l'a retouchée.

- [ ] **Étape 2 : écrire la migration**

Créer `supabase/migrations/<NUMERO+1>_peut_lire_membre.sql` :

```sql
-- D72 : la règle de visibilité d'une fiche membre est EXTRAITE dans une fonction, pour
-- que la vue `seminaires_assistes` (migration suivante) et la politique `membres_lecture`
-- ne puissent pas diverger. La vue contourne délibérément la RLS de `participations`
-- (D71) et contourne DU MÊME GESTE celle de `membres` : sans prédicat, un compte
-- ordinaire y lirait les couples (membre, événement) de fiches `archive` ou `en_attente`
-- qu'il n'a pas le droit de lire. Recopier l'expression dans la vue la ferait dériver en
-- silence le jour où la politique changerait.
--
-- Migration additive : `drop policy` puis `create policy` DANS UN FICHIER NEUF —
-- l'additivité du projet porte sur les FICHIERS de migration, pas sur l'immuabilité d'une
-- politique. Précédent exact : 20260815140000.
--
-- L'EXPRESSION CI-DESSOUS EST CELLE DE LA POLITIQUE DÉPLOYÉE (20260815140000), pas celle,
-- plus large, du §5.5 du design de la phase 4 : le troisième terme y est gardé par
-- `etat = ''en_attente''`, sans quoi un demandeur lirait la fiche ARCHIVÉE dont il fut un
-- jour demandeur. Extraire une règle ne doit rien élargir.
--
-- SECURITY DEFINER, et la fonction lit bien `public.membres` : elle s'exécute avec les
-- privilèges de son propriétaire, lequel possède BYPASSRLS (hypothèse du projet,
-- documentée au §5.3 de la spécification maîtresse pour prive.est_admin() et vérifiée
-- empiriquement). Sans cela, l'appel depuis la politique DE membres serait récursif.
-- `auth.uid()` continue de désigner l'APPELANT à l'intérieur : la fonction contourne la
-- RLS, pas l'identité.

create or replace function prive.peut_lire_membre(p_membre_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select prive.est_actif())
     and exists (
       select 1
       from public.membres m
       where m.id = p_membre_id
         and (
           m.etat = 'actif'
           or (select prive.est_admin())
           or (m.etat = 'en_attente' and (select prive.est_demandeur_de(m.id)))
         )
     );
$$;

comment on function prive.peut_lire_membre(uuid) is
  'Règle de visibilité d''une fiche membre (spec §5.3), extraite pour être partagée par la politique membres_lecture et par la vue seminaires_assistes (D72) : une seule définition, jamais deux. Actif pour tout compte actif ; en_attente pour l''administrateur et pour le demandeur de la fiche ; archive pour l''administrateur seul. SECURITY DEFINER : contourne la RLS (BYPASSRLS du propriétaire), jamais l''identité — auth.uid() désigne toujours l''appelant.';

revoke execute on function prive.peut_lire_membre(uuid) from public, anon, service_role;
grant execute on function prive.peut_lire_membre(uuid) to authenticated;

drop policy membres_lecture on public.membres;

-- APPEL NU, sans l'enveloppe `(select …)` employée ailleurs dans le dépôt : cette
-- enveloppe sert à faire hisser un appel SANS PARAMÈTRE en InitPlan, évalué UNE FOIS pour
-- toute la requête. Ici l'appel est CORRÉLÉ à la ligne (`id`) : il sera évalué ligne à
-- ligne quoi qu'il arrive, et l'enveloppe n'apporterait qu'une illusion d'optimisation.
create policy membres_lecture on public.membres
  for select
  to authenticated
  using (prive.peut_lire_membre(id));
```

- [ ] **Étape 3 : appliquer**

```bash
npx supabase db push --linked
```

- [ ] **Étape 4 : LA PREUVE N°6 — la suite RLS existante sur `membres` passe INCHANGÉE**

C'est le coût annoncé par D72, et il se paie ici. **Ne modifier aucun test de
`tests/rls/membres.test.ts`.** S'il faut en toucher un seul, c'est que l'extraction a
changé un comportement : revenir à l'étape 2.

```bash
npm run test:rls
```

Attendu : `tests/rls/membres.test.ts` **entièrement vert**, sans modification. Consigner
dans le rapport le nombre de tests de ce fichier, **avant et après**, pour prouver
qu'aucun n'a été retiré ni ignoré :

```bash
git diff --stat tests/rls/membres.test.ts
```

Attendu : **aucune ligne de diff**.

- [ ] **Étape 5 : contrôle positif sur la fonction elle-même**

Une politique qui rend « tout faux » passerait aussi les tests de refus. Créer
`scripts/.tmp-verif/verifier-peut-lire.mjs` :

```javascript
import { createClient } from '@supabase/supabase-js'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const anon = createClient(URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const IDENT = 'test.verif.peutlire'
const MDP = `Test-${crypto.randomUUID()}`
const NOM = `ZZVerifPeutLire-${crypto.randomUUID().slice(0, 8)}`

const { data: actif, error: e1 } = await admin
  .from('membres')
  .insert({ nom: `${NOM}-actif`, prenom: 'Test', etat: 'actif' })
  .select('id')
  .single()
if (e1) throw new Error(`préparation impossible : ${e1.message}`)

const { data: archive, error: e2 } = await admin
  .from('membres')
  .insert({ nom: `${NOM}-archive`, prenom: 'Test', etat: 'archive' })
  .select('id')
  .single()
if (e2) throw new Error(`préparation impossible : ${e2.message}`)

const { data: compte, error: e3 } = await admin.auth.admin.createUser({
  email: `${IDENT}@asonkeng.local`,
  password: MDP,
  email_confirm: true,
})
if (e3) throw new Error(`création du compte impossible : ${e3.message}`)
const { error: e4 } = await admin
  .from('profils')
  .insert({ id: compte.user.id, identifiant: IDENT, nom_affichage: 'Verif peut lire' })
if (e4) throw new Error(`insertion du profil impossible : ${e4.message}`)

await anon.auth.signInWithPassword({ email: `${IDENT}@asonkeng.local`, password: MDP })

const { data: vuActif } = await anon.from('membres').select('id').eq('id', actif.id)
const { data: vuArchive } = await anon.from('membres').select('id').eq('id', archive.id)
console.log('CONTRÔLE POSITIF — fiche active vue par un compte ordinaire (attendu 1) :', (vuActif ?? []).length)
console.log('REFUS — fiche archivée vue par un compte ordinaire (attendu 0) :', (vuArchive ?? []).length)

await admin.auth.admin.deleteUser(compte.user.id)
await admin.from('membres').delete().in('id', [actif.id, archive.id])
const { count } = await admin
  .from('membres')
  .select('id', { count: 'exact', head: true })
  .like('nom', `${NOM}%`)
console.log('NETTOYAGE vérifié par comptage (attendu 0) :', count)
```

```bash
npx dotenv -e .env.local -- node scripts/.tmp-verif/verifier-peut-lire.mjs
rm -rf scripts/.tmp-verif
```

**Attendu : `1`, `0`, `0`.** Le `1` est le contrôle positif sans lequel le `0` ne
prouverait rien — il distinguerait « la fiche archivée est cachée » de « la fonction rend
faux pour tout le monde », le mode de défaillance en échec fermé décrit au §5.3 de la
spécification maîtresse. Consigner les trois valeurs réelles dans le rapport.

- [ ] **Étape 6 : les six portes, puis commit**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls && npm run test:e2e && npm run build
```

```bash
git add supabase/migrations/<NUMERO+1>_peut_lire_membre.sql
git commit -m "refactor: extraire la regle de visibilite d'une fiche dans prive.peut_lire_membre (D72)"
```

---

### Task 3 : le verrou « arbre » manquant sur `validerDemandeNouvellePersonne` (§11, point 8)

**Fichiers :**
- Modifier : `src/app/demandes/actions.ts`

**Interfaces :**
- Consomme : `public.definir_arbre(uuid, uuid, uuid, boolean)` — passerelle **existante**
  (`20260814100000`, réécrite par `20260814150000`), `security definer`, `execute`
  réservé à `service_role`, qui prend `pg_advisory_xact_lock(20260814, 1)` **en première
  instruction**.
- Produit : aucune interface nouvelle. `validerDemandeNouvellePersonne(donnees: FormData):
  Promise<ResultatDemande>` garde exactement sa signature et son comportement observable.

**L'écart, et pourquoi il se comble ici.** La phase 1c (§4.1) a établi qu'un déclencheur
anti-cycle **seul** ne ferme pas la classe de défaut des réassignations concurrentes :
deux écritures concurrentes voient chacune un arbre sans cycle et **valident toutes les
deux**. C'est pour cela que `public.definir_arbre` prend un verrou consultatif.
`validerDemandeNouvellePersonne` (phase 2b), elle, écrit `faiseur_de_disciple_id`,
`dirigeant_id` et `dirigeant_force` par un `update` **direct** via `clientAdmin()`, **sans
ce verrou** : la barrière de dernier recours joue, la sérialisation ne joue pas. La fenêtre
est étroite — la fiche validée vient de naître et n'a pas de descendant — mais elle est
**de la même nature que celle que la 1c a jugée inacceptable**, et D67 prend soin de ne
pas la reproduire sur le chemin que la phase 4 ajoute. Corriger ici plutôt que d'écrire
pourquoi ce serait acceptable : la phase 4 touche déjà ce chemin (Task 22), c'est le bon
moment, et le §8.3 du design recense nommément ces **quatre** chemins d'écriture de
`membres.faiseur_de_disciple_id`.

**Aucune passerelle nouvelle.** `definir_arbre` écrit **exactement** les trois colonnes
concernées, avec la sémantique voulue (`null` = détacher, jamais « ne change pas »), et
elle porte déjà les vérifications d'existence et le refus d'un faiseur de disciple
**archivé**. Écrire une seconde passerelle dupliquerait le verrou et la règle.

**L'ORDRE DES DEUX ÉCRITURES N'EST PAS COSMÉTIQUE.** L'arbre **d'abord**, l'état
**ensuite**. Cette action est déjà **non atomique à travers ses écritures** (choix
documenté de la Task 17 de la 2b) ; ce qui change, c'est ce que laisse un échec au milieu :

| Ordre | Si la seconde écriture échoue |
|---|---|
| état puis arbre | fiche **`actif`** sans faiseur de disciple — elle apparaît dans l'annuaire, détachée de l'arbre, et la demande reste `en_attente` : l'administrateur revalide et l'écrasement passe inaperçu |
| **arbre puis état** | fiche **`en_attente`** avec son faiseur de disciple déjà posé — invisible de l'annuaire, demande toujours `en_attente`, revalidation **idempotente** (mêmes valeurs relues depuis les mêmes sources) |

Le second est le seul dont l'état intermédiaire soit **inoffensif et rejouable**.

- [ ] **Étape 1 : modifier `validerDemandeNouvellePersonne`**

Dans `src/app/demandes/actions.ts`, **remplacer** le bloc qui construit `colonnesMembre`
et l'`update` unique qui le suit par ce qui suit. Le reste de la fonction — lecture de la
demande, liaison du profil pour `auto_inscription`, passage de la demande à `validee`,
notification, marquage des non-lues — **n'est pas touché**.

Remplacer :

```typescript
  const colonnesMembre: Record<string, unknown> = { etat: 'actif' }
  if (origine === 'demande_suivi') {
```

…et tout le bloc jusqu'à l'`update` de `membres` inclus, par :

```typescript
  // ÉCRITURE DE L'ARBRE, EN PREMIER, ET PAR LA PASSERELLE — PAS PAR UN UPDATE DIRECT.
  //
  // Écart signalé au §11, point 8 du design de la phase 4, comblé ici. La 1c (§4.1) a
  // établi qu'un déclencheur anti-cycle SEUL ne ferme pas la classe de défaut des
  // réassignations concurrentes : deux transactions voient chacune un arbre sans cycle
  // et valident toutes les deux. `public.definir_arbre` prend
  // `pg_advisory_xact_lock(20260814, 1)` en PREMIÈRE instruction pour cela. Cette
  // fonction, elle, écrivait les trois colonnes d'arbre par un `update` direct via
  // `clientAdmin()` : la barrière de dernier recours (membres_anti_cycle) jouait, la
  // SÉRIALISATION ne jouait pas. La fenêtre était étroite — la fiche validée vient de
  // naître et n'a pas de descendant — mais une transaction concurrente peut, pendant ce
  // temps, rattacher son futur faiseur de disciple SOUS ELLE via `definir_arbre` sans la
  // voir. C'est la même nature de défaut que celle que la 1c a jugée inacceptable.
  //
  // ORDRE : l'arbre d'abord, l'état ensuite. Cette action reste NON ATOMIQUE à travers
  // ses écritures (choix documenté de la Task 17 de la 2b) ; ce qui change, c'est ce que
  // laisse un échec au milieu. « État puis arbre » laisserait une fiche `actif` DÉTACHÉE,
  // visible dans l'annuaire. « Arbre puis état » laisse une fiche `en_attente` avec son
  // faiseur déjà posé : invisible, demande toujours `en_attente`, revalidation
  // idempotente puisque les mêmes valeurs sont relues depuis les mêmes sources.
  if (origine === 'demande_suivi') {
    // `faiseur_de_disciple_id` est un FAIT, pas un choix : c'est la fiche du demandeur,
    // RELUE depuis `profils` (I2/mineur de la revue finale de la 2b), jamais prise du
    // formulaire. NULL toléré, pas un échec : le compte racine n'a aucune fiche liée
    // (D11). `dirigeant_id` et `dirigeant_force`, EUX, restent lus du formulaire — ce
    // sont les seules valeurs que l'administrateur DÉCIDE sur cet écran. Un fait se
    // relit, une décision se soumet.
    const { data: profilDemandeur, error: erreurProfilDemandeur } = await admin
      .from('profils')
      .select('membre_id')
      .eq('id', demandeurProfilId)
      .maybeSingle()
    if (erreurProfilDemandeur) {
      console.error('validerDemandeNouvellePersonne : lecture de la fiche du demandeur impossible', {
        demandeurProfilId,
        code: erreurProfilDemandeur.code,
        message: erreurProfilDemandeur.message,
      })
      return { erreur: MESSAGE_ECHEC_VALIDATION }
    }

    const { error: erreurArbre } = await admin.rpc('definir_arbre', {
      p_membre: membreId,
      p_faiseur_de_disciple: profilDemandeur?.membre_id ?? null,
      p_dirigeant: String(donnees.get('dirigeantId') ?? '') || null,
      p_dirigeant_force: donnees.get('dirigeantForce') === '1',
    })
    if (erreurArbre) {
      console.error('validerDemandeNouvellePersonne : échec RPC definir_arbre', {
        demandeId,
        membreId,
        code: erreurArbre.code,
        details: erreurArbre.details,
        message: erreurArbre.message,
      })
      // Refus RETOURNÉ, jamais levé : voir le commentaire de tête de ce fichier. Aucun
      // marqueur n'est discriminé ici — `membre_inconnu`, `faiseur_inconnu`,
      // `dirigeant_inconnu` et `faiseur_de_disciple_archive` appellent tous le même geste
      // de la part de l'administrateur (recharger la liste et recommencer), et le marqueur
      // reste JOURNALISÉ ci-dessus, là où il sert : au diagnostic.
      return { erreur: MESSAGE_ECHEC_VALIDATION }
    }
  }

  // L'état ensuite, et lui seul : `definir_arbre` a déjà écrit les trois colonnes
  // d'arbre. Réécrire ici `faiseur_de_disciple_id` par un `update` direct rouvrirait
  // exactement l'écart que l'appel ci-dessus vient de fermer.
  const { data: ficheMaj, error: erreurFiche } = await admin
    .from('membres')
    .update({ etat: 'actif' })
    .eq('id', membreId)
    .select('id')
  if (erreurFiche || !ficheMaj || ficheMaj.length === 0) {
    console.error('validerDemandeNouvellePersonne : échec de la mise à jour de la fiche', {
      membreId,
      code: erreurFiche?.code,
      message: erreurFiche?.message,
    })
    return { erreur: MESSAGE_ECHEC_VALIDATION }
  }
```

- [ ] **Étape 2 : mettre à jour le commentaire de tête de la fonction**

Le bloc de documentation au-dessus de `validerDemandeNouvellePersonne` décrit encore
l'ancien comportement (« fiche -> actif, `faiseur_de_disciple_id` = la fiche du
demandeur » dans une seule écriture). Remplacer les deux lignes concernées par :

```typescript
 * - demande_suivi : `faiseur_de_disciple_id`, `dirigeant_id` et `dirigeant_force`
 *   écrits PAR LA PASSERELLE `public.definir_arbre`, qui prend le verrou consultatif
 *   « arbre » (20260814,1) — voir le commentaire dans le corps. PUIS fiche -> actif.
 *   L'ordre compte. `faiseur_de_disciple_id` est RELU depuis `profils.membre_id` et
 *   non pris du formulaire ; il PEUT être NULL (compte racine, D11).
```

- [ ] **Étape 3 : PREUVE PAR MUTATION — le verrou est bien pris**

Un test qui vérifie seulement que la validation fonctionne resterait vert avec l'ancien
`update` direct : **il ne prouverait rien du verrou**. La preuve porte sur le fait que
l'écriture passe désormais **par la passerelle**.

Créer `scripts/.tmp-verif/verifier-verrou-validation.mjs` :

```javascript
import { createClient } from '@supabase/supabase-js'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

// CONTRÔLE POSITIF : la passerelle existe, elle est appelable par service_role, et elle
// écrit bien les trois colonnes. Sans cette assertion, l'appel ajouté par cette tâche
// pourrait échouer en silence (nom de paramètre erroné) et la fiche resterait en_attente
// sans faiseur — un échec RETOURNÉ, donc invisible d'un script qui ne regarde que la base.
const NOM = `ZZVerifVerrou-${crypto.randomUUID().slice(0, 8)}`
const { data: parent, error: e1 } = await admin
  .from('membres').insert({ nom: `${NOM}-parent`, prenom: 'Test' }).select('id').single()
if (e1) throw new Error(`préparation impossible : ${e1.message}`)
const { data: enfant, error: e2 } = await admin
  .from('membres').insert({ nom: `${NOM}-enfant`, prenom: 'Test', etat: 'en_attente' }).select('id').single()
if (e2) throw new Error(`préparation impossible : ${e2.message}`)

const { error: e3 } = await admin.rpc('definir_arbre', {
  p_membre: enfant.id,
  p_faiseur_de_disciple: parent.id,
  p_dirigeant: null,
  p_dirigeant_force: false,
})
console.log('appel definir_arbre (attendu : null) :', e3?.message ?? null)

const { data: relu } = await admin
  .from('membres').select('faiseur_de_disciple_id, dirigeant_id, dirigeant_force').eq('id', enfant.id).single()
console.log('CONTRÔLE POSITIF — faiseur posé (attendu true) :', relu.faiseur_de_disciple_id === parent.id)

// Le verrou lui-même ne se lit PAS d'ici : `pg_get_functiondef` n'est pas exposé à
// PostgREST. Il se relit dans l'éditeur SQL — étape 4, et c'est la seule vérification qui
// distingue « la passerelle a écrit » de « la passerelle sérialise ».

await admin.from('membres').delete().in('id', [enfant.id, parent.id])
const { count } = await admin.from('membres').select('id', { count: 'exact', head: true }).like('nom', `${NOM}%`)
console.log('NETTOYAGE vérifié par comptage (attendu 0) :', count)
```

```bash
npx dotenv -e .env.local -- node scripts/.tmp-verif/verifier-verrou-validation.mjs
rm -rf scripts/.tmp-verif
```

**Attendu : `null`, `true`, `0`.**

- [ ] **Étape 4 : vérifier que la passerelle appelée porte bien le verrou**

Dans l'éditeur SQL du projet Supabase :

```sql
select pg_get_functiondef('public.definir_arbre(uuid, uuid, uuid, boolean)'::regprocedure);
```

**Attendu :** la définition contient `pg_advisory_xact_lock(20260814, 1)` **en première
instruction du bloc `begin`**. Consigner la ligne exacte dans le rapport. Si elle n'y est
pas, **ne pas continuer** : la correction de cette tâche reposerait sur une passerelle qui
ne sérialise rien.

- [ ] **Étape 5 : la suite e2e des demandes passe INCHANGÉE**

`tests/e2e/demandes.spec.ts` couvre déjà le parcours « validation d'une demande de
suivi » — l'un des **quatre** parcours Playwright canoniques du §8 de la spécification
maîtresse. Il doit passer **sans modification** : le comportement observable ne change pas.

```bash
npm run test:e2e -- tests/e2e/demandes.spec.ts
```

```bash
git diff --stat tests/e2e/demandes.spec.ts
```

Attendu : vert, et **aucune ligne de diff**.

- [ ] **Étape 6 : les six portes + le build de production**

Cette tâche touche un chemin qui **retourne des messages**. `npm run test:e2e:prod` est
donc exigé en plus des six portes.

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls && npm run test:e2e && npm run build
```

```bash
npm run test:e2e:prod
```

```bash
git add src/app/demandes/actions.ts
git commit -m "fix: prendre le verrou arbre dans validerDemandeNouvellePersonne (design phase 4, §11 point 8)"
```

**Preuves produites par cette tâche :** la sortie du script (`null`, `true`, `0`), la
ligne `pg_advisory_xact_lock` relevée dans `pg_get_functiondef`, et les deux `git diff
--stat` vides.

---

# Partie B — Modèle de données des événements

Six migrations, toutes additives, dans cet ordre strict (chaque table référence la
précédente). Chacune se termine sur une vérification **en base**, jamais sur la seule
absence d'erreur de `db push`.

### Task 4 : table `types_evenement`, amorçage idempotent (D57)

**Fichiers :**
- Créer : `supabase/migrations/<NUMERO+2>_types_evenement.sql`

**Interfaces :**
- Consomme : `prive.est_actif()` (déjà en base).
- Produit : table `public.types_evenement (id uuid, libelle text, actif boolean, ordre
  integer, cree_le timestamptz)`, unicité sur `libelle`, politique
  `types_evenement_lecture` ouverte à **tout compte actif**. Référencée par
  `evenements.type_id` (Task 5) et par la vue `seminaires_assistes` (Task 8).

**L'amorçage est IDEMPOTENT, et c'est une décision (D57).** Le dépôt porte déjà un commit
qui **signale** que l'amorçage du catalogue des statuts n'est pas idempotent, **sans le
corriger** : c'est une dette connue et documentée. La reproduire ici serait la
**choisir**. `types_evenement` a une clé naturelle unique (`libelle`) : l'idempotence
coûte **une clause**, pas une conception.

**Un type n'est JAMAIS supprimé, seulement désactivé** — même régime que les statuts
(spec §7 : il disparaît des nouvelles attributions, reste visible sur l'existant). D'où
`on delete restrict` sur `evenements.type_id` (Task 5).

- [ ] **Étape 1 : écrire la migration**

```sql
-- Catalogue des types d'événement (spec §4.4, D13). Colonnes du §4.4 (id, libelle,
-- actif), plus `ordre` (même rôle que sur `statuts` : l'ordre d'affichage d'un référentiel
-- est une donnée, pas un tri alphabétique subi) et `cree_le` (convention du dépôt).

create table public.types_evenement (
  id uuid primary key default gen_random_uuid(),
  libelle text not null,
  actif boolean not null default true,
  ordre integer not null default 0,
  cree_le timestamptz not null default now(),
  constraint types_evenement_libelle_non_vide check (length(trim(libelle)) > 0),
  -- Clé naturelle, ET ancre de l'idempotence de l'amorçage ci-dessous (D57). Unicité
  -- SIMPLE : `libelle` est NOT NULL, `nulls not distinct` n'aurait donc aucun sens ici.
  constraint types_evenement_libelle_unique unique (libelle)
);

comment on table public.types_evenement is
  'Type d''événement attribuable (spec §4.4). Désactivable, JAMAIS supprimable : les événements passés doivent rester lisibles avec leur type — même régime que public.statuts, d''où le on delete restrict porté par evenements.type_id.';
comment on constraint types_evenement_libelle_unique on public.types_evenement is
  'Clé naturelle du catalogue, et ancre du `on conflict (libelle) do nothing` de l''amorçage (D57).';

create index types_evenement_actif_idx on public.types_evenement (actif, ordre);

revoke all on public.types_evenement from anon, authenticated;
grant select on public.types_evenement to authenticated;

alter table public.types_evenement enable row level security;
alter table public.types_evenement force row level security;

-- Tout compte actif (spec §5.3, ligne « antennes, statuts, groupes_statut,
-- types_evenement »). Aucune politique d'écriture : la gestion du catalogue passe par une
-- Server Action réservée à l'administrateur (spec §5.2, ligne « Créer statuts, groupes,
-- antennes, types d'événement »).
create policy types_evenement_lecture on public.types_evenement
  for select
  to authenticated
  using ((select prive.est_actif()));

-- AMORÇAGE IDEMPOTENT (D57). `on conflict (libelle) do nothing` s'appuie sur la contrainte
-- ci-dessus. Rejouer cette migration — ou la rejouer sur une base où un administrateur
-- aurait déjà créé « Webinaire » à la main — ne crée AUCUN doublon et ne lève AUCUNE
-- erreur. Le dépôt porte un commit qui signale que l'amorçage du catalogue des statuts
-- n'a PAS cette propriété : dette connue, documentée, et qu'on ne reproduit pas ici.
insert into public.types_evenement (libelle, ordre) values
  ('Webinaire', 1),
  ('Séminaire académique', 2),
  ('Pic-nic', 3),
  ('Retraite spirituelle', 4)
on conflict (libelle) do nothing;
```

**Aucune apostrophe dans les quatre libellés amorcés** — vérifié en les écrivant. Toute
apostrophe ajoutée plus tard dans une chaîne SQL de ce fichier **se double** (`''`).

- [ ] **Étape 2 : appliquer et vérifier EN BASE**

```bash
npx supabase db push --linked
```

Dans l'éditeur SQL du projet :

```sql
select count(*) from public.types_evenement;
select libelle, actif, ordre from public.types_evenement order by ordre;
```

**Attendu : `4`,** puis les quatre libellés dans l'ordre. Consigner la sortie réelle.

- [ ] **Étape 3 : PREUVE N°17 — l'idempotence, à la main, tout de suite**

Ne pas attendre la Task 23 pour savoir si la clause fonctionne. Dans le même éditeur :

```sql
-- CONTRÔLE POSITIF d'abord : compter, pas déduire.
select count(*) as avant from public.types_evenement;

insert into public.types_evenement (libelle, ordre) values
  ('Webinaire', 1),
  ('Séminaire académique', 2),
  ('Pic-nic', 3),
  ('Retraite spirituelle', 4)
on conflict (libelle) do nothing;

select count(*) as apres from public.types_evenement;
```

**Attendu : `avant = apres`, et aucune erreur.** Un `avant` de 0 rendrait cette preuve
vide : si c'est le cas, l'amorçage n'a pas joué et la migration n'a **pas** été appliquée
— retourner à l'étape 2 (piège n°2 des contraintes globales).

- [ ] **Étape 4 : les six portes, puis commit**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls && npm run test:e2e && npm run build
```

```bash
git add supabase/migrations/<NUMERO+2>_types_evenement.sql
git commit -m "feat: catalogue types_evenement, amorcage idempotent (D57)"
```

---

### Task 5 : table `evenements` (D56)

**Fichiers :**
- Créer : `supabase/migrations/<NUMERO+3>_evenements.sql`

**Interfaces :**
- Consomme : `public.types_evenement` (Task 4), `public.profils`, `prive.est_actif()`.
- Produit : table `public.evenements (id, titre, type_id, date_debut, date_fin,
  heure_debut, lieu, description, cree_par, cree_le)`, contrainte
  `evenements_periode_coherente`, politique `evenements_lecture` ouverte à **tout compte
  actif** (spec §5.3 : « nécessaire pour afficher les séminaires assistés sur une fiche »).

**`date` + `heure_debut time`, JAMAIS `timestamptz` (D56).** Le projet a déjà payé le
fuseau horaire une fois : `formaterDateSeule` est **verrouillé en UTC par un invariant de
test** (`src/lib/format/date.test.ts`), et `seances_ael` porte `date date` plus
`heure time`. Un `timestamptz` sur un événement rouvrirait toute la classe : une retraite
« du 12 au 14 » n'a pas d'**instant**, elle a des **jours**, et l'afficher depuis un
instant fait dépendre le libellé du fuseau du lecteur.

**`titre` est OBLIGATOIRE aussi pour les tests** : c'est la seule prise du préfixe de
famille `ZZ…-` sur cette table (contrainte globale 13).

- [ ] **Étape 1 : écrire la migration**

```sql
-- Événements (spec §4.4, D13). Colonnes du §4.4, plus `heure_debut` (D56).
--
-- D56 — `date` ET `heure_debut time`, JAMAIS `timestamptz`. Le projet a déjà payé le
-- fuseau horaire une fois : `formaterDateSeule` (src/lib/format/date.ts) est verrouillé
-- en UTC par un invariant de test, et `seances_ael` porte `date date` + `heure time`. Une
-- retraite « du 12 au 14 » n'a pas d'instant, elle a des jours : l'afficher depuis un
-- instant ferait dépendre le libellé du fuseau du lecteur.

create table public.evenements (
  id uuid primary key default gen_random_uuid(),
  -- NOT NULL et non vide : c'est aussi la SEULE prise du préfixe de famille des suites de
  -- test sur cette table (les suites écrivent en base de production).
  titre text not null,
  -- `restrict` : un type n'est jamais supprimé, seulement désactivé (spec §7, même régime
  -- que les statuts). Si une suppression directe était un jour tentée, elle ne doit pas
  -- orpheliner un événement passé.
  type_id uuid not null references public.types_evenement (id) on delete restrict,
  date_debut date not null,
  date_fin date,
  heure_debut time,
  lieu text,
  description text,
  cree_par uuid references public.profils (id) on delete set null,
  cree_le timestamptz not null default now(),
  constraint evenements_titre_non_vide check (length(trim(titre)) > 0),
  -- Condition LOCALE À LA LIGNE : elle ne dépend d'aucune autre table, donc un `check` et
  -- non un déclencheur — même critère que D59 pour l'exclusivité des références de
  -- `participations`, et que D36 (phase 3) pour l'exclusivité enseignant/modérateur.
  -- `date_fin is null or …` : une date de fin absente est légitime (événement d'un jour).
  constraint evenements_periode_coherente check (date_fin is null or date_fin >= date_debut)
);

comment on table public.evenements is
  'Événement de l''équipe (spec §4.4, D13). Lisible de TOUT compte actif (spec §5.3) : c''est nécessaire pour afficher les séminaires assistés sur une fiche membre. Aucun état prevue/tenue/annulee, contrairement à seances_ael : aucun compteur du projet ne dépend de l''état d''un événement, et ajouter un état que rien ne consomme créerait une transition à garder cohérente pour zéro usage.';
comment on column public.evenements.date_debut is
  'Colonne `date`, jamais `timestamptz` (D56) : un événement a des JOURS, pas un instant.';
comment on column public.evenements.heure_debut is
  'Heure de début, séparée de la date (D56), sur le modèle de seances_ael.heure. NULL quand elle n''est pas connue ou n''a pas de sens (retraite de plusieurs jours).';
comment on constraint evenements_periode_coherente on public.evenements is
  'La date de fin, quand elle existe, ne précède jamais la date de début. Doublée côté application par `periodeValide` (src/lib/domaine/evenements.ts) pour nommer le champ fautif AVANT d''écrire : le check reste la barrière, le contrôle amont explique.';

-- La liste est triée `date_debut desc, id` (D75, tri TOTAL) : l'index porte les deux
-- colonnes dans cet ordre, sans quoi la pagination trierait en mémoire.
create index evenements_date_debut_idx on public.evenements (date_debut desc, id);
create index evenements_type_id_idx on public.evenements (type_id);
-- Prise du balayage de rattrapage des suites de test : un événement dont le titre aurait
-- été modifié hors du préfixe de famille reste retrouvable par son créateur.
create index evenements_cree_par_idx on public.evenements (cree_par);

revoke all on public.evenements from anon, authenticated;
grant select on public.evenements to authenticated;

alter table public.evenements enable row level security;
alter table public.evenements force row level security;

create policy evenements_lecture on public.evenements
  for select
  to authenticated
  using ((select prive.est_actif()));
```

- [ ] **Étape 2 : appliquer et vérifier la contrainte de période DANS LES DEUX SENS**

```bash
npx supabase db push --linked
```

Dans l'éditeur SQL — une contrainte dont une seule moitié est éprouvée est une contrainte
dont on croit ce qu'on n'a pas vérifié :

```sql
select id from public.types_evenement where libelle = 'Webinaire';
-- Reporter l'identifiant ci-dessous.

-- REFUS attendu (23514) : fin avant début.
insert into public.evenements (titre, type_id, date_debut, date_fin)
values ('ZZVerifPeriode-ko', '<ID_TYPE>', '2026-09-10', '2026-09-01');

-- CONTRÔLE POSITIF n°1 : fin après début.
insert into public.evenements (titre, type_id, date_debut, date_fin)
values ('ZZVerifPeriode-ok1', '<ID_TYPE>', '2026-09-01', '2026-09-10') returning id;

-- CONTRÔLE POSITIF n°2 : fin ABSENTE — le cas le plus courant, et celui qu'un
-- `date_fin >= date_debut` écrit sans le `is null` refuserait en silence… non : il
-- rendrait NULL, donc PASSERAIT. Le vérifier quand même : c'est le sens où l'erreur ne
-- se voit pas.
insert into public.evenements (titre, type_id, date_debut)
values ('ZZVerifPeriode-ok2', '<ID_TYPE>', '2026-09-01') returning id;

-- CONTRÔLE POSITIF n°3 : fin ÉGALE au début.
insert into public.evenements (titre, type_id, date_debut, date_fin)
values ('ZZVerifPeriode-ok3', '<ID_TYPE>', '2026-09-01', '2026-09-01') returning id;

select pg_get_constraintdef(oid) from pg_constraint where conname = 'evenements_periode_coherente';

delete from public.evenements where titre like 'ZZVerifPeriode-%';
select count(*) from public.evenements where titre like 'ZZVerifPeriode-%';
```

**Attendu :** une erreur `23514` sur le premier, **trois** succès, la définition de la
contrainte, puis `0`. Consigner les cinq sorties.

- [ ] **Étape 3 : les six portes, puis commit**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls && npm run test:e2e && npm run build
```

```bash
git add supabase/migrations/<NUMERO+3>_evenements.sql
git commit -m "feat: table evenements, dates sans fuseau (D56)"
```

---

### Task 6 : table `participants_externes` (D60 à D64)

**Fichiers :**
- Créer : `supabase/migrations/<NUMERO+4>_participants_externes.sql`

**Interfaces :**
- Consomme : `public.membres`, `public.profils`, `prive.est_actif()`,
  `prive.est_moderateur_ou_admin()` (Task 1).
- Produit : table `public.participants_externes`, déclencheur
  `participants_externes_liens_definitifs` posant les marqueurs
  **`participant_deja_converti`** et **`classement_definitif`**, index partiel
  `participants_externes_a_traiter_idx`, politique `participants_externes_lecture`
  réservée à **administrateur ou modérateur**.

**Quatre pièges concentrés dans cette seule migration.**

1. **`is distinct from`, JAMAIS `<>`, dans le déclencheur `before`.** Un déclencheur
   `before` s'exécute **avant** la vérification des `not null` : `new.x <> 'v'` vaut
   `NULL` si `x` est nul, ce qui fait tomber dans la **mauvaise branche**. Le projet a
   déjà payé ce piège une fois —
   `20260817150000_corriger_marqueur_completude_null.sql`.
2. **L'apostrophe de la chaîne vide.** Le §5.3 du design écrit
   `coalesce(motif_classement, '''')` parce qu'il **cite** du SQL. Dans un fichier `.sql`
   réel, la chaîne vide s'écrit **`''`** (deux apostrophes), pas quatre. Écrire quatre
   apostrophes produirait la chaîne `'`, d'un caractère — et `length(trim("'")) > 0`
   serait **toujours vrai**, rendant la moitié gauche de la contrainte inerte, sans
   erreur.
3. **`on delete restrict` sur `converti_en_membre_id`, jamais `set null` (D64).** Le
   réflexe — et ce que porte déjà `demandes_membre.membre_id` — **déconvertirait
   silencieusement** le participant : sa fiche disparaît, son lien devient `NULL`, il
   **réapparaît dans la liste « à traiter »**, et son historique de séminaire est perdu.
4. **Le classement vit sur la PERSONNE, jamais sur la participation (D61).** Une personne
   qui a exprimé le désir d'un suivi à **deux** séminaires produit **deux**
   participations ; classer l'une la laisserait dans la liste par l'autre, et le
   classement **paraîtrait sans effet**.

**`classe_le` et `converti_en_membre_id` peuvent coexister renseignés (D62).** « Pas de
réouverture » porte sur la **liste**, pas sur le sort de la personne : quelqu'un classé
sans suite il y a deux ans qui reprend contact **doit** pouvoir être converti. **Aucune
contrainte ne les oppose.**

**Aucune unicité sur l'identité d'un externe**, et ce n'est pas un oubli : deux homonymes
sont possibles, et la même personne peut être saisie deux fois à deux séminaires par deux
modérateurs différents. Aucune combinaison de nom, téléphone et ville n'est fiable. Le cas
se traite par le **chemin 3** de la conversion — rattacher les deux à la même fiche membre.

- [ ] **Étape 1 : écrire la migration**

```sql
-- Participants externes à un événement (spec §4.4, D13). Colonnes du §4.4, plus les
-- colonnes d'auteur (D60), de conversion et de classement sans suite (D61).
--
-- D60 — pourquoi `cree_par` : deux raisons indépendantes, chacune suffisante. (1) D23
-- élargit le cercle qui voit et saisit une confidence ; savoir QUI a fait entrer une
-- personne est la contrepartie directe de cet élargissement. (2) Les suites de tests
-- écrivent en base de PRODUCTION, et `cree_par` est déjà, sur seances_ael, la seule prise
-- du balayage de rattrapage après une exécution interrompue.

create table public.participants_externes (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  prenom text,
  telephone text,
  email text,
  ville text,
  pays text,
  -- D64 — `on delete restrict`, JAMAIS `set null`. Le réflexe `set null` (et ce que porte
  -- déjà demandes_membre.membre_id) DÉCONVERTIRAIT SILENCIEUSEMENT le participant : sa
  -- fiche disparaît, son lien devient NULL, il RÉAPPARAÎT dans la liste « à traiter » et
  -- son historique de séminaire est perdu — sans une seule erreur. Le chemin 1 de la
  -- conversion crée une fiche `en_attente`, et le projet compte exactement DEUX delete sur
  -- membres (D26 rattachement, D42 (2b) annulation) : le second est atteignable, puisque
  -- l'administrateur convertisseur est le demandeur. Deux barrières le ferment : cette
  -- contrainte refuse la suppression même par écriture directe, et
  -- public.annuler_demande_membre, amendée, explique.
  converti_en_membre_id uuid references public.membres (id) on delete restrict,
  converti_le timestamptz,
  converti_par uuid references public.profils (id) on delete set null,
  -- D61 — le classement vit sur la PERSONNE, jamais sur la participation. Une personne qui
  -- a exprimé le désir d'un suivi à DEUX séminaires produit DEUX participations ; classer
  -- l'une la laisserait dans la liste par l'autre, et le classement paraîtrait sans effet.
  classe_le timestamptz,
  classe_par uuid references public.profils (id) on delete set null,
  motif_classement text,
  cree_par uuid references public.profils (id) on delete set null,
  cree_le timestamptz not null default now(),
  constraint participants_externes_nom_non_vide check (length(trim(nom)) > 0),
  -- ATTENTION À L'APOSTROPHE : la chaîne vide s'écrit '' (DEUX apostrophes) dans un
  -- fichier .sql. Le §5.3 du document de design l'écrit '''' parce qu'il CITE du SQL ;
  -- transcrire quatre apostrophes ici produirait la chaîne d'UN caractère « ' », dont la
  -- longueur après trim vaut 1 — la moitié droite de cette contrainte serait alors
  -- TOUJOURS VRAIE, donc inerte, sans la moindre erreur.
  constraint participants_externes_classement_coherent
    check (
      (classe_le is null and classe_par is null and motif_classement is null)
      or (classe_le is not null and length(trim(coalesce(motif_classement, ''))) > 0)
    ),
  constraint participants_externes_conversion_coherente
    check ((converti_en_membre_id is null) = (converti_le is null))
  -- AUCUNE contrainte n'oppose `classe_le` et `converti_en_membre_id` (D62) : « pas de
  -- réouverture » porte sur la LISTE, pas sur le sort de la personne. Quelqu'un classé
  -- sans suite il y a deux ans qui reprend contact doit pouvoir être converti, et cette
  -- conversion ne repeuple aucune liste.
);

comment on table public.participants_externes is
  'Personne rencontrée lors d''un événement sans être membre de l''équipe (spec §4.4, D13). AUCUNE unicité sur l''identité, et ce n''est pas un oubli : deux homonymes sont possibles, et la même personne peut être saisie deux fois à deux séminaires par deux modérateurs. Aucune combinaison de nom, téléphone et ville n''est fiable ; le cas se traite par le chemin 3 de la conversion — rattacher les deux à la même fiche membre —, sans rien détruire (D26 exclut la fusion générale de fiches).';
comment on column public.participants_externes.converti_en_membre_id is
  'Fiche membre issue de la conversion (D63) : posée UNE FOIS, jamais modifiée — le déclencheur participants_externes_liens_definitifs le refuse avec le marqueur participant_deja_converti. La vue seminaires_assistes résout les séminaires d''un converti PAR CETTE COLONNE : la changer déplacerait silencieusement une participation d''une fiche à une autre. on delete restrict (D64) : une suppression de la fiche déconvertirait le participant en silence.';
comment on column public.participants_externes.motif_classement is
  'Motif du classement sans suite (D61), obligatoire et non vide dès que classe_le est renseigné (participants_externes_classement_coherent). Le classement porte sur la PERSONNE, pas sur une participation.';

-- La seconde branche de seminaires_assistes (D70) joint sur cette colonne.
create index participants_externes_converti_en_membre_id_idx
  on public.participants_externes (converti_en_membre_id);
-- Prise du balayage de rattrapage des suites de test (D60).
create index participants_externes_cree_par_idx on public.participants_externes (cree_par);
-- Index PARTIEL servant la liste « à traiter » (D74, D75) : son tri de pagination est
-- (premiere_expression, participant_externe_id), mais le filtre de la vue porte
-- exactement sur ces deux prédicats, et ils écartent la très grande majorité des lignes
-- une fois le projet en régime.
create index participants_externes_a_traiter_idx
  on public.participants_externes (cree_le desc, id)
  where converti_en_membre_id is null and classe_le is null;

-- DÉCLENCHEUR DES LIENS DÉFINITIFS (D62, D63).
--
-- `is distinct from`, JAMAIS `<>`. Un déclencheur `before` s'exécute AVANT la vérification
-- des not null : `new.x <> 'v'` rend NULL quand `x` est nul, et fait tomber dans la
-- MAUVAISE branche. Le projet a déjà payé ce piège une fois, migration
-- 20260817150000_corriger_marqueur_completude_null.sql. Ici, le cas concret est direct :
-- un `update … set converti_en_membre_id = null` sur une ligne déjà convertie doit être
-- REFUSÉ, et c'est exactement le cas où `<>` rendrait NULL et laisserait passer.
--
-- Double contrôle assumé, motif établi depuis l'archivage en 1c : le déclencheur protège
-- même une écriture DIRECTE, la passerelle amont explique.
create or replace function prive.refuser_reouverture_participant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.converti_en_membre_id is not null
     and new.converti_en_membre_id is distinct from old.converti_en_membre_id then
    raise exception 'Ce participant a déjà été converti en membre.'
      using detail = 'participant_deja_converti';
  end if;

  if old.classe_le is not null
     and new.classe_le is distinct from old.classe_le then
    raise exception 'Ce participant a déjà été classé sans suite.'
      using detail = 'classement_definitif';
  end if;

  return new;
end;
$$;

comment on function prive.refuser_reouverture_participant() is
  'Déclencheur before update sur public.participants_externes : refuse de modifier converti_en_membre_id une fois posé (marqueur participant_deja_converti, D63) et de modifier classe_le une fois posé, y compris pour le remettre à NULL (marqueur classement_definitif, D62). `is distinct from` et non `<>` : un déclencheur before s''exécute avant la vérification des not null, et `<>` sur une valeur nulle rend NULL, donc tombe dans la mauvaise branche — piège déjà payé une fois par ce projet (migration 20260817150000). Barrière de dernier recours, y compris pour une écriture directe : les passerelles convertir_participant_externe et classer_participant_externe portent le même refus en amont, pour produire un message avant d''écrire.';

create trigger participants_externes_liens_definitifs
  before update on public.participants_externes
  for each row execute function prive.refuser_reouverture_participant();

revoke all on public.participants_externes from anon, authenticated;
grant select on public.participants_externes to authenticated;

alter table public.participants_externes enable row level security;
alter table public.participants_externes force row level security;

-- Administrateur OU modérateur (spec §5.3, amendée par D23 ; D80). PREMIÈRE table du
-- projet, avec participations, dont la LECTURE dépend d'un rôle autre qu'administrateur.
create policy participants_externes_lecture on public.participants_externes
  for select
  to authenticated
  using (
    (select prive.est_actif())
    and (select prive.est_moderateur_ou_admin())
  );
```

**Si `create policy` échoue à l'application** avec « function prive.est_moderateur_ou_admin
does not exist », c'est **le piège n°2 des contraintes globales qui se referme** : la
migration de la Task 1 a été comptée comme appliquée sans l'être. Reprendre l'étape 0 de
la Task 1 — ne **jamais** contourner en recopiant la fonction ici.

- [ ] **Étape 2 : appliquer**

```bash
npx supabase db push --linked
```

- [ ] **Étape 3 : éprouver le déclencheur et la contrainte de classement, à la main**

Dans l'éditeur SQL :

```sql
insert into public.participants_externes (nom, prenom) values ('ZZVerifExterne-a', 'Test') returning id;
-- Reporter l'identifiant en <ID>.

-- REFUS attendu (23514) : classe_le sans motif.
update public.participants_externes set classe_le = now() where id = '<ID>';

-- SUCCÈS attendu : classe_le avec motif.
update public.participants_externes
   set classe_le = now(), classe_par = null, motif_classement = 'Injoignable'
 where id = '<ID>';

-- REFUS attendu, marqueur classement_definitif : remise à NULL. C'EST LE CAS QUE `<>`
-- LAISSERAIT PASSER.
update public.participants_externes set classe_le = null, motif_classement = null where id = '<ID>';

-- REFUS attendu, marqueur classement_definitif : changement de date.
update public.participants_externes set classe_le = now() + interval '1 day' where id = '<ID>';

-- CONTRÔLE POSITIF dans la même situation : une colonne SANS RAPPORT reste modifiable sur
-- une ligne classée — sans lui, les deux refus ci-dessus pourraient aussi bien signifier
-- « cette ligne est devenue totalement immuable ».
update public.participants_externes set ville = 'Douala' where id = '<ID>' returning ville;

select pg_get_triggerdef(oid) from pg_trigger where tgname = 'participants_externes_liens_definitifs';

delete from public.participants_externes where nom like 'ZZVerifExterne-%';
select count(*) from public.participants_externes where nom like 'ZZVerifExterne-%';
```

**Attendu :** `23514`, succès, deux refus portant `classement_definitif` dans le `DETAIL`,
un succès (`Douala`), la définition du déclencheur, puis `0`. **Consigner le champ `DETAIL`
réel des deux refus** — c'est lui que le code applicatif lira, jamais le texte français.

- [ ] **Étape 4 : les six portes, puis commit**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls && npm run test:e2e && npm run build
```

```bash
git add supabase/migrations/<NUMERO+4>_participants_externes.sql
git commit -m "feat: table participants_externes, liens definitifs et classement (D60-D64)"
```

---

### Task 7 : table `participations` — deux index uniques PARTIELS (D58, D59, D60)

**Fichiers :**
- Créer : `supabase/migrations/<NUMERO+5>_participations.sql`

**Interfaces :**
- Consomme : `public.evenements` (T5), `public.participants_externes` (T6),
  `public.membres`, `public.profils`, `prive.est_actif()`,
  `prive.est_moderateur_ou_admin()` (T1).
- Produit : table `public.participations`, contrainte
  `participations_une_seule_reference`, index uniques **partiels**
  `participations_membre_unique` et `participations_externe_unique`, politique
  `participations_lecture` réservée à **administrateur ou modérateur**.

## ⚠️ LE PIÈGE LE PLUS CONCRET DE TOUTE LA PHASE — LIRE AVANT D'ÉCRIRE UNE LIGNE

**Le dépôt écrit `unique nulls not distinct (…)` « quand une colonne nullable entre dans
une clé d'unicité ».** C'est la convention maison, et elle est **juste ailleurs** :
`calendriers_ael_creneau_unique` l'emploie à bon droit.

**Appliquée ici, elle n'autoriserait qu'UN SEUL PARTICIPANT EXTERNE PAR ÉVÉNEMENT.**
Toutes les lignes d'externes partagent `membre_id = NULL` ; sous `nulls not distinct`,
elles s'écraseraient toutes sur la première unicité, et le **deuxième** externe ajouté
recevrait un `23505` parfaitement opaque.

Ce qui se passe **vraiment** avec les deux unicités du §4.4, en trois points dont deux ne
sautent pas aux yeux :

1. **Les deux contraintes fonctionnent, chacune sur sa moitié.** Postgres traite deux
   `NULL` comme **distincts** : pour une ligne de membre, la première unicité compare
   normalement et bloque le doublon ; pour une ligne d'externe, `membre_id` vaut `NULL` et
   la première unicité ne peut **jamais** être violée. Chaque contrainte est **active** sur
   les lignes qu'elle vise et **inerte** sur les autres. **La paire du §4.4 est suffisante.**
2. **Mais la convention maison la casserait**, comme ci-dessus — y compris posée par un
   relecteur remarquant, à juste titre, que « deux `NULL` sont distincts par défaut ».
3. **Le doublon le plus probable n'est fermé par aucune des deux** : rien n'empêche la
   même personne d'être inscrite une fois comme membre et une fois comme externe. Les deux
   index sont **aveugles l'un à l'autre**, et aucune contrainte ne peut savoir que deux
   lignes désignent le même être humain. C'est pour cela que la vue `seminaires_assistes`
   déduplique par `union` (Task 8).

**D'où deux index uniques PARTIELS** (`where <colonne> is not null`), qui **disent** leur
intention au lieu de la laisser déduire, ne peuvent pas être lus comme un oubli, et
**suppriment la tentation**.

- [ ] **Étape 1 : écrire la migration**

```sql
-- Participations à un événement (spec §4.4, D13, D16 amendée par D23). Colonnes du §4.4,
-- plus les quatre colonnes d'auteur de D60.
--
-- D60 — `saisi_par`/`saisi_le` sont posés à la création et JAMAIS réécrits ;
-- `modifie_par`/`modifie_le` portent la dernière retouche. La séparation existe parce que
-- D77 rend une participation modifiable après coup : un désir se recueille souvent après
-- l'événement, dans une conversation. Sans cette séparation, corriger un désir obligerait
-- à supprimer puis resaisir, donc à perdre l'origine. Et une ligne de participations n'a
-- AUCUN champ nommable — ni titre, ni thème : sans `saisi_par`, une exécution de test
-- interrompue laisserait des participations irretrouvables.

create table public.participations (
  id uuid primary key default gen_random_uuid(),
  -- `cascade` : une participation n'a aucun sens sans son événement — même régime que
  -- presences_ael.seance_id.
  evenement_id uuid not null references public.evenements (id) on delete cascade,
  -- `restrict` sur les DEUX références : supprimer une personne ne doit pas effacer sans
  -- bruit son passage à un événement.
  membre_id uuid references public.membres (id) on delete restrict,
  participant_externe_id uuid references public.participants_externes (id) on delete restrict,
  desir_mentorat_academique boolean not null default false,
  desir_suivi_spirituel boolean not null default false,
  desir_cpeap boolean not null default false,
  note text,
  saisi_par uuid references public.profils (id) on delete set null,
  saisi_le timestamptz not null default now(),
  modifie_par uuid references public.profils (id) on delete set null,
  modifie_le timestamptz,
  -- D59 — « exactement une des deux références ». Condition LOCALE À LA LIGNE : elle ne
  -- dépend d'aucune autre table, donc un `check` et non un déclencheur — exactement le
  -- critère posé par D36 (phase 3) pour l'exclusivité enseignant/modérateur. Le motif qui
  -- justifiait un déclencheur pour l'exclusivité des statuts (la condition vit sur
  -- groupes_statut) ne s'applique pas ici.
  --
  -- `num_nonnulls` couvre LES DEUX SENS en une seule expression — les deux nulles ET les
  -- deux remplies —, ce qui évite d'écrire deux moitiés dont une seule serait éprouvée.
  -- La preuve n°1 les éprouve quand même toutes les deux, par écriture réelle en base.
  constraint participations_une_seule_reference
    check (num_nonnulls(membre_id, participant_externe_id) = 1)
);

comment on table public.participations is
  'Participation d''un membre OU d''un participant externe à un événement, avec les trois désirs et une note (spec §4.4). UNE PARTICIPATION EST UN FAIT DATÉ QUI NE BOUGE JAMAIS (D69, application directe de D48) : la conversion d''un participant externe ne repointe JAMAIS membre_id — la ligne reste attachée au participant externe, et le lien vers le membre se fait par participants_externes.converti_en_membre_id, résolu À LA LECTURE par la vue seminaires_assistes (D70). Repointer effacerait le fait que cette personne est entrée par un séminaire — précisément ce que D13 veut mesurer — et pourrait ÉCHOUER sur l''index unique (evenement_id, membre_id) dans le cas normal du chemin 3.';
comment on column public.participations.saisi_par is
  'Auteur de la SAISIE, posé à la création et jamais réécrit (D60). Contrepartie de l''élargissement de D23, et seule prise du balayage de rattrapage des suites de test sur une table sans champ nommable.';
comment on column public.participations.modifie_par is
  'Auteur de la DERNIÈRE RETOUCHE (D60, D77). NULL tant que la ligne n''a pas été modifiée.';

-- D58 — DEUX INDEX UNIQUES PARTIELS, et surtout PAS `unique nulls not distinct`.
--
-- La convention maison du dépôt est bien `unique nulls not distinct (...)` quand une
-- colonne nullable entre dans une clé d'unicité — calendriers_ael_creneau_unique l'emploie
-- À BON DROIT. Appliquée ICI, elle n'autoriserait qu'UN SEUL PARTICIPANT EXTERNE PAR
-- ÉVÉNEMENT : toutes les lignes d'externes partagent membre_id = NULL, donc s'écraseraient
-- sur la première unicité, et le deuxième externe ajouté recevrait un 23505 parfaitement
-- opaque. Les deux unicités du §4.4 fonctionnent telles quelles (deux NULL sont distincts
-- par défaut : chaque contrainte est active sur les lignes qu'elle vise et inerte sur les
-- autres) ; les index partiels ci-dessous DISENT cette intention au lieu de la laisser
-- déduire, et suppriment la tentation.
--
-- Effet secondaire utile : `evenement_id` étant en tête des deux, ils servent aussi la
-- lecture paginée des participants d'un événement (D75) sans index supplémentaire.
create unique index participations_membre_unique
  on public.participations (evenement_id, membre_id)
  where membre_id is not null;

create unique index participations_externe_unique
  on public.participations (evenement_id, participant_externe_id)
  where participant_externe_id is not null;

-- NI l'un NI l'autre ne ferme le doublon le PLUS PROBABLE : la même personne inscrite une
-- fois comme membre et une fois comme externe. Les deux index sont aveugles l'un à
-- l'autre, et aucune contrainte ne peut savoir que deux lignes désignent le même être
-- humain. C'est précisément pour cela que la vue seminaires_assistes déduplique par
-- `union` et non `union all` (D70).

create index participations_membre_id_idx on public.participations (membre_id);
create index participations_participant_externe_id_idx
  on public.participations (participant_externe_id);
create index participations_saisi_par_idx on public.participations (saisi_par);
-- La vue participants_a_traiter (D74) joint sur participant_externe_id en ne retenant que
-- les lignes portant le désir : index PARTIEL, qui reste petit quel que soit le volume.
create index participations_desir_suivi_idx
  on public.participations (participant_externe_id)
  where desir_suivi_spirituel;

revoke all on public.participations from anon, authenticated;
grant select on public.participations to authenticated;

alter table public.participations enable row level security;
alter table public.participations force row level security;

-- Administrateur OU modérateur (spec §5.3, amendée par D23 ; D80). Voir la note du §2 du
-- design de la phase 4 : le §4.4 disait « administrateur » seul, ce qui était FAUX depuis
-- l'amendement D23 du 2026-08-12 ; le texte de la spécification maîtresse a été corrigé
-- le 2026-08-14 (D54).
create policy participations_lecture on public.participations
  for select
  to authenticated
  using (
    (select prive.est_actif())
    and (select prive.est_moderateur_ou_admin())
  );
```

- [ ] **Étape 2 : appliquer**

```bash
npx supabase db push --linked
```

- [ ] **Étape 3 : vérifier que les index sont bien PARTIELS, et que deux externes coexistent**

C'est **l'assertion qui attrape un `nulls not distinct` posé par habitude**, et **aucune
autre ne l'attrape**. Dans l'éditeur SQL :

```sql
select indexname, indexdef
from pg_indexes
where tablename = 'participations'
  and indexname in ('participations_membre_unique', 'participations_externe_unique');
```

**Attendu :** les deux `indexdef` contiennent `WHERE (… IS NOT NULL)` et **ne contiennent
pas** `NULLS NOT DISTINCT`. Consigner les deux définitions **verbatim**.

Puis la preuve par écriture réelle :

```sql
-- Préparation (chaque insert vérifie son retour : un insert de préparation dont l'erreur
-- est ignorée rend la suite verte en éprouvant un tout autre chemin — trouvé trois fois
-- dans ce projet).
insert into public.evenements (titre, type_id, date_debut)
select 'ZZVerifPart-evt', t.id, '2026-09-01' from public.types_evenement t where t.libelle = 'Webinaire'
returning id;
-- <ID_EVT>

insert into public.participants_externes (nom) values ('ZZVerifPart-x1') returning id; -- <ID_X1>
insert into public.participants_externes (nom) values ('ZZVerifPart-x2') returning id; -- <ID_X2>

-- LE CONTRÔLE QUI COMPTE : DEUX externes DIFFÉRENTS sur le MÊME événement.
insert into public.participations (evenement_id, participant_externe_id) values ('<ID_EVT>', '<ID_X1>');
insert into public.participations (evenement_id, participant_externe_id) values ('<ID_EVT>', '<ID_X2>');
-- Attendu : LES DEUX RÉUSSISSENT. Sous `nulls not distinct`, le second échouerait en 23505.

-- Doublon d'externe : refusé (23505).
insert into public.participations (evenement_id, participant_externe_id) values ('<ID_EVT>', '<ID_X1>');

-- Les deux nulles : refusé (23514).
insert into public.participations (evenement_id) values ('<ID_EVT>');

-- Les deux remplies : refusé (23514). Reprendre un membre existant quelconque.
insert into public.participations (evenement_id, membre_id, participant_externe_id)
select '<ID_EVT>', m.id, '<ID_X1>' from public.membres m where m.etat = 'actif' limit 1;

select pg_get_constraintdef(oid) from pg_constraint where conname = 'participations_une_seule_reference';

-- Nettoyage, DANS L'ORDRE : participations, puis participants_externes, puis evenements.
delete from public.participations where evenement_id = '<ID_EVT>';
delete from public.participants_externes where nom like 'ZZVerifPart-%';
delete from public.evenements where titre like 'ZZVerifPart-%';
select
  (select count(*) from public.participants_externes where nom like 'ZZVerifPart-%') as externes,
  (select count(*) from public.evenements where titre like 'ZZVerifPart-%') as evenements;
```

**Attendu :** deux succès, `23505`, `23514`, `23514`, la définition de la contrainte, puis
`0, 0`.

- [ ] **Étape 4 : les six portes, puis commit**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls && npm run test:e2e && npm run build
```

```bash
git add supabase/migrations/<NUMERO+5>_participations.sql
git commit -m "feat: table participations, index uniques PARTIELS (D58, D59, D60)"
```

---

### Task 8 : vue `seminaires_assistes` — `security_invoker = FALSE` (D70, D71, D73)

**Fichiers :**
- Créer : `supabase/migrations/<NUMERO+6>_seminaires_assistes.sql`

**Interfaces :**
- Consomme : `public.participations` (T7), `public.participants_externes` (T6),
  `public.evenements` (T5), `public.types_evenement` (T4),
  `prive.peut_lire_membre(uuid)` (T2).
- Produit : vue `public.seminaires_assistes (membre_id, evenement_id, titre, type,
  date_debut)` — **exactement cinq colonnes**, lisible de **tout compte actif**. Consommée
  par `seminairesAssistes` (T15) et la fiche membre (T20).

## ⚠️ ÉCRIRE `security_invoker = false`. NE PAS « CORRIGER » EN `true`.

C'est la **seule vue du projet qui contourne délibérément la RLS**, et c'est sa **raison
d'être** : le §4.4 la veut lisible de **tout compte actif** alors que `participations` est
fermée à l'administrateur et au modérateur. **Aucune politique de ligne ne peut produire
cela** — la RLS est ligne à ligne, et le partage à faire ici est **colonne à colonne**.

Le principe posé en phase 3 (§4.5) est qu'« aucune vue ne doit élargir **silencieusement**
ce qu'un compte peut lire ». **Le mot qui compte est *silencieusement*.** Écrire
`security_invoker = false` là où tout le projet écrit `true`, **explicitement** et avec un
`comment on view` qui dit pourquoi, est un **panneau**, pas un oubli.

**Ce que produirait `true` :** la vue rendrait **zéro ligne pour tout compte ordinaire**,
et **les étiquettes de séminaires disparaîtraient de TOUTES les fiches** — sans la moindre
erreur, sans page vide, sans rien à voir. C'est le défaut invisible en échec fermé décrit
au §5.3 de la spécification maîtresse pour `prive.est_admin()`. La preuve n°5 (Task 23) le
ferme, et **elle seule**.

**Le prédicat de `membres` est réimposé, lui, par `prive.peut_lire_membre` (D72).**
Contourner la RLS de `participations` contourne **du même geste** celle de `membres` :
sans ce prédicat, un compte ordinaire lirait les couples (identifiant de membre, événement)
de fiches `archive` ou `en_attente` qu'il n'a pas le droit de lire. **Point subtil à ne pas
perdre :** la vue s'exécute avec les privilèges de son propriétaire, mais `auth.uid()`
continue de désigner l'**appelant** — elle contourne la RLS, **pas l'identité**.

**`union` et non `union all` (D70).** Rien n'empêche une même personne de figurer à un
événement à la fois comme membre et comme externe converti : les deux index partiels de
D58 sont **aveugles l'un à l'autre**. La déduplication est la seule réponse honnête, et
elle est gratuite.

**Exactement cinq colonnes (D73).** Aucune colonne de désir, aucune note, aucun nom de
participant externe, aucune trace du fait qu'il y ait eu conversion. La vue expose le
**fait**, jamais la **confidence** ni l'identité externe. Cela se prouve sur
`information_schema.columns` (preuve n°4), pas sur ce qu'un écran affiche.

- [ ] **Étape 1 : écrire la migration**

```sql
-- Vue des séminaires assistés (spec §4.4, D2, D16, D69, D70, D71, D72, D73).
--
-- ⚠️ `security_invoker = false` — ÉCRIT, PAS LAISSÉ AU DÉFAUT, ET SURTOUT PAS « CORRIGÉ »
-- EN `true`. C'est la SEULE vue du projet qui contourne délibérément la RLS, et c'est sa
-- raison d'être : le §4.4 la veut lisible de TOUT COMPTE ACTIF alors que participations
-- est fermée à l'administrateur et au modérateur (§5.3, D23). Aucune politique de ligne ne
-- peut produire cela — la RLS est ligne à ligne, le partage à faire ici est colonne à
-- colonne. Le principe de la phase 3 (§4.5) interdit d'élargir SILENCIEUSEMENT ; ce fichier
-- est le contraire d'un silence.
--
-- CE QUE PRODUIRAIT `true` : zéro ligne pour tout compte ordinaire, et les étiquettes de
-- séminaires disparaissant de TOUTES les fiches membres — sans la moindre erreur. Défaut
-- invisible, en échec fermé, exactement celui que le §5.3 décrit pour prive.est_admin().
-- La preuve n°5 de tests/rls/evenements.test.ts le ferme, et elle seule.
--
-- La vue repose sur l'hypothèse BYPASSRLS de son PROPRIÉTAIRE, déjà documentée au §5.3
-- pour prive.est_admin() et vérifiée empiriquement sur ce projet. Toute modification
-- future du propriétaire doit s'accompagner du même test.
--
-- LA RLS DE `membres` EST RÉIMPOSÉE par prive.peut_lire_membre (D72) : contourner celle de
-- participations contourne DU MÊME GESTE celle de membres. `auth.uid()` continue de
-- désigner l'APPELANT à l'intérieur de la vue — elle contourne la RLS, pas l'identité.
--
-- CINQ COLONNES, exactement celles du §4.4. Aucune colonne de désir, aucune note, aucun
-- nom de participant externe, aucune trace du fait qu'il y ait eu conversion (D73).

create view public.seminaires_assistes
  with (security_invoker = false) as
select
  p.membre_id,
  e.id as evenement_id,
  e.titre,
  t.libelle as type,
  e.date_debut
from public.participations p
join public.evenements e on e.id = p.evenement_id
join public.types_evenement t on t.id = e.type_id
where p.membre_id is not null
  and prive.peut_lire_membre(p.membre_id)

-- `union` ET NON `union all` (D70) : rien n'empêche une même personne de figurer à un
-- événement à la fois comme membre et comme externe converti — les deux index partiels de
-- D58 sont AVEUGLES L'UN À L'AUTRE, et aucune contrainte ne peut savoir que deux lignes
-- désignent le même être humain. La déduplication est la seule réponse honnête, et elle
-- est gratuite.
union

-- SECONDE BRANCHE — sans elle, D69 coûterait exactement ce que la question de conception
-- redoutait : UN CONVERTI PERDRAIT L'HISTORIQUE DE SA PARTICIPATION, la vue lisant
-- membre_id sur une ligne qui restera éternellement NULL. Avec elle, l'historique se
-- reconstitue À LA LECTURE sans qu'aucune écriture passée n'ait bougé.
select
  x.converti_en_membre_id,
  e.id,
  e.titre,
  t.libelle,
  e.date_debut
from public.participations p
join public.participants_externes x on x.id = p.participant_externe_id
join public.evenements e on e.id = p.evenement_id
join public.types_evenement t on t.id = e.type_id
where x.converti_en_membre_id is not null
  and prive.peut_lire_membre(x.converti_en_membre_id);

comment on view public.seminaires_assistes is
  'Séminaires assistés par un membre, lisibles de TOUT COMPTE ACTIF (spec §4.4, D2, D16). SEULE VUE DU PROJET EN security_invoker = false (D71), écrit explicitement et non laissé au défaut : elle contourne délibérément la RLS de participations, fermée à l''administrateur et au modérateur, parce que le partage à faire est colonne à colonne là où la RLS est ligne à ligne. Elle NE contourne PAS la RLS de membres : prive.peut_lire_membre (D72) la réimpose, une seule définition partagée avec la politique membres_lecture. auth.uid() continue de désigner l''appelant. Union et non union all (D70) : une même personne peut figurer à un événement comme membre ET comme externe converti. CINQ COLONNES, aucune ne portant un désir, une note ou une identité externe (D73) — une colonne ajoutée un jour « pour la commodité » serait attrapée par l''assertion sur information_schema.columns de tests/rls/evenements.test.ts. MODE DE DÉFAILLANCE À CONNAÎTRE : si l''hypothèse BYPASSRLS du propriétaire était fausse, cette vue ne lèverait AUCUNE erreur — elle rendrait zéro ligne pour tout le monde et les étiquettes disparaîtraient sans trace.';

revoke all on public.seminaires_assistes from anon, authenticated;
grant select on public.seminaires_assistes to authenticated;
```

## ⚠️ CETTE VUE REND ZÉRO LIGNE POUR `service_role`, ET CE N'EST PAS UN DÉFAUT

Conséquence directe de D72, et **elle surprend tout le monde une fois** : la vue s'exécute
avec les privilèges de son **propriétaire**, mais `auth.uid()` continue de désigner
l'**appelant**. Une requête `service_role` (`clientAdmin()`, un script de vérification, une
suite de tests) **n'a pas de JWT utilisateur** : `auth.uid()` y vaut `NULL`,
`prive.est_actif()` rend `false`, `prive.peut_lire_membre` avec lui — et la vue rend
**zéro ligne**, **sans la moindre erreur**, alors même que `service_role` contourne la RLS
partout ailleurs.

**Conséquences pratiques, à connaître avant de conclure que la vue est cassée :**
- **Toute vérification de cette vue se fait depuis une session UTILISATEUR RÉELLE**
  (`clientSimple` dans les suites, un navigateur connecté à la main), **jamais** depuis
  `clientAdmin()`.
- Dans l'**éditeur SQL** du projet Supabase, la requête tourne comme `postgres` : elle
  **contourne** aussi bien la RLS que ce prédicat, et rend donc les lignes — utile pour
  vérifier la **forme** de la vue, **inutile** pour vérifier ce qu'un compte voit.
- Aucun code de production ne lit cette vue via `clientAdmin()` : `seminairesAssistes`
  (T15) passe par `clientServeur()`, sous l'identité de l'appelant.

- [ ] **Étape 2 : appliquer et vérifier l'option de la vue EN BASE**

```bash
npx supabase db push --linked
```

Dans l'éditeur SQL :

```sql
select relname, reloptions
from pg_class
where relname in ('seminaires_assistes', 'participants_a_traiter', 'compteurs_ael');
```

**Attendu à ce stade :** `seminaires_assistes` porte `{security_invoker=false}` — écrit,
et **pas absent**. Une vue **sans** `reloptions` serait au défaut, ce qui vaut `false`
aujourd'hui mais **n'est pas ce que D71 exige** : le point est que l'option soit **écrite**.
`compteurs_ael` porte `{security_invoker=true}` : c'est le contrôle positif qui prouve que
la colonne `reloptions` dit bien ce qu'on croit.

- [ ] **Étape 3 : les cinq colonnes, tout de suite**

```sql
select column_name, ordinal_position
from information_schema.columns
where table_schema = 'public' and table_name = 'seminaires_assistes'
order by ordinal_position;
```

**Attendu, exactement :** `membre_id`, `evenement_id`, `titre`, `type`, `date_debut`.
**Cinq lignes, pas six.** Consigner la sortie.

- [ ] **Étape 4 : les six portes, puis commit**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls && npm run test:e2e && npm run build
```

```bash
git add supabase/migrations/<NUMERO+6>_seminaires_assistes.sql
git commit -m "feat: vue seminaires_assistes, security_invoker = false assume (D70-D73)"
```

---

### Task 9 : vue `participants_a_traiter` — `security_invoker = TRUE` (D74)

**Fichiers :**
- Créer : `supabase/migrations/<NUMERO+7>_participants_a_traiter.sql`

**Interfaces :**
- Consomme : `public.participants_externes` (T6), `public.participations` (T7),
  `public.evenements` (T5).
- Produit : vue `public.participants_a_traiter (participant_externe_id, nom, prenom,
  telephone, email, ville, pays, cree_le, premiere_expression, evenements_concernes)`.
  Consommée par `participantsATraiterParPage` (T15) et l'écran `/evenements/a-traiter`
  (T21).

## ⚠️ CETTE VUE EST L'INVERSE EXACT DE LA PRÉCÉDENTE, ET C'EST DÉLIBÉRÉ.

`seminaires_assistes` **contourne** la RLS (`false`). `participants_a_traiter` en
**hérite** (`true`). Confondre les deux est un défaut à deux visages : `true` sur la
première la rend **silencieusement vide** ; **`false` sur celle-ci ouvrirait la liste des
CONFIDENCES à TOUT COMPTE ACTIF**.

Cette vue n'a **aucune raison** d'élargir quoi que ce soit : ses lecteurs légitimes
(administrateur, modérateur) ont **déjà** le droit de lire les trois tables qu'elle joint.
En héritant de leur RLS, elle **ne peut pas fuir**, et elle n'a **aucune politique propre**
à écrire ni à prouver — même forme que `compteurs_ael`.

**Un participant, UNE ligne (D61)**, quel que soit le nombre d'événements où il a exprimé
le désir. C'est ce qui rend le classement — posé sur la **personne** — vrai par
construction.

**Tri total de pagination : `order by premiere_expression, participant_externe_id`.** La
dernière clé est **unique**, sans quoi deux personnes ayant exprimé leur désir au même
séminaire pourraient apparaître **deux fois ou disparaître** entre deux pages — le défaut
exact que `membresDesAntennesParLots` ferme déjà par son `.order('id')` final.

- [ ] **Étape 1 : écrire la migration**

```sql
-- Liste « à traiter » : participants externes ayant exprimé le désir d'un suivi
-- spirituel, ni convertis ni classés (spec §4.4, D74).
--
-- ⚠️ `security_invoker = true` — L'INVERSE EXACT de seminaires_assistes (D71), et c'est
-- délibéré. Cette vue n'a AUCUNE raison d'élargir quoi que ce soit : ses lecteurs
-- légitimes (administrateur, modérateur) ont déjà le droit de lire participants_externes,
-- participations et evenements. En héritant de leur RLS, elle ne peut pas fuir, et elle
-- n'a aucune politique propre à écrire ni à prouver — même forme que compteurs_ael.
-- ÉCRIRE `false` ICI OUVRIRAIT LA LISTE DES CONFIDENCES À TOUT COMPTE ACTIF. La preuve n°7
-- de tests/rls/evenements.test.ts ferme ce sens.
--
-- UN PARTICIPANT, UNE LIGNE (D61), quel que soit le nombre d'événements où il a exprimé le
-- désir : c'est ce qui rend le classement — posé sur la PERSONNE — vrai par construction,
-- et non « vrai tant qu'il n'a fréquenté qu'un séminaire ».
--
-- `group by x.id` suffit : x.id est la clé primaire de participants_externes, et Postgres
-- reconnaît la dépendance fonctionnelle des autres colonnes de x.

create view public.participants_a_traiter
  with (security_invoker = true) as
select
  x.id as participant_externe_id,
  x.nom,
  x.prenom,
  x.telephone,
  x.email,
  x.ville,
  x.pays,
  x.cree_le,
  min(e.date_debut) as premiere_expression,
  count(*) as evenements_concernes
from public.participants_externes x
join public.participations p on p.participant_externe_id = x.id
join public.evenements e on e.id = p.evenement_id
where p.desir_suivi_spirituel
  and x.converti_en_membre_id is null
  and x.classe_le is null
group by x.id;

comment on view public.participants_a_traiter is
  'Participants externes ayant exprimé le désir d''un suivi spirituel, ni convertis ni classés sans suite (spec §4.4, D74). security_invoker = TRUE, l''inverse exact de seminaires_assistes (D71) et délibérément : ses lecteurs légitimes ont déjà le droit de lire les trois tables jointes, elle hérite donc de leur RLS et ne peut pas fuir. Écrire false ici ouvrirait la liste des confidences à tout compte actif. UNE LIGNE PAR PERSONNE (D61), quel que soit le nombre d''événements concernés : c''est ce qui rend le classement, posé sur la personne, vrai par construction. Tri de pagination obligatoire : order by premiere_expression, participant_externe_id — la dernière clé est unique, sans quoi deux personnes ayant exprimé leur désir au même séminaire pourraient apparaître deux fois ou disparaître entre deux pages (D75).';

revoke all on public.participants_a_traiter from anon, authenticated;
grant select on public.participants_a_traiter to authenticated;
```

- [ ] **Étape 2 : appliquer et vérifier les DEUX régimes côte à côte**

```bash
npx supabase db push --linked
```

```sql
select relname, reloptions
from pg_class
where relname in ('seminaires_assistes', 'participants_a_traiter', 'compteurs_ael')
order by relname;
```

**Attendu, et c'est le contraste à consigner tel quel dans le rapport :**

| Vue | `reloptions` attendu |
|---|---|
| `compteurs_ael` | `{security_invoker=true}` |
| `participants_a_traiter` | `{security_invoker=true}` |
| `seminaires_assistes` | `{security_invoker=false}` |

Si `seminaires_assistes` porte `true`, **s'arrêter** : les étiquettes de séminaires seront
vides sur toutes les fiches, sans erreur. Reprendre la Task 8.

- [ ] **Étape 3 : les six portes, puis commit**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls && npm run test:e2e && npm run build
```

```bash
git add supabase/migrations/<NUMERO+7>_participants_a_traiter.sql
git commit -m "feat: vue participants_a_traiter, security_invoker = true (D74)"
```

---

# Partie C — Passerelles SQL

Quatre tâches : une valeur d'énumération **seule dans son fichier**, deux passerelles
neuves, et l'amendement d'une passerelle existante.

### Task 10 : valeur d'énumération `conversion_participant` — SEULE dans sa migration (D66)

**Fichiers :**
- Créer : `supabase/migrations/<NUMERO+8>_origine_conversion_participant.sql`

**Interfaces :**
- Consomme : le type `public.origine_demande` (`20260815110000_demandes_membre.sql`).
- Produit : la valeur `'conversion_participant'` sur `public.origine_demande`. Consommée
  par `convertir_participant_externe` (T11), `annuler_demande_membre` amendée (T13), et
  l'écran `/demandes` (T22).

## ⚠️ CETTE MIGRATION NE CONTIENT QUE `alter type … add value`. RIEN D'AUTRE.

`alter type … add value` ajoute une valeur qui **ne peut pas être employée dans la même
transaction que son ajout**. `supabase db push` joue chaque fichier de migration dans **sa
propre transaction** : glisser dans ce fichier la moindre instruction qui **emploie** la
nouvelle valeur (un `insert`, un `create function` dont le corps la compare littéralement,
un `check`) ferait échouer la migration entière avec
`unsafe use of new value "conversion_participant" of enum type origine_demande`. D66 l'a
signalé comme piège d'implémentation ; ce fichier existe pour qu'il soit **impossible** de
s'y prendre autrement.

**Pourquoi une valeur nouvelle plutôt que réutiliser `demande_suivi`.** D32 a posé le
principe : l'origine d'une demande est **explicite**, jamais inférée. Réutiliser
`demande_suivi` **mentirait sur la provenance** et brancherait l'écran de validation sur le
**mauvais comportement** — poser le demandeur comme faiseur de disciple, alors que
l'administrateur qui convertit n'est **pas** le faiseur de disciple de la personne
convertie.

**Pourquoi une ligne `demandes_membre` du tout.** Sans elle, la fiche `en_attente` du
chemin 1 ne rejoindrait **aucun circuit** : `/demandes` liste des **demandes**, pas des
fiches, et personne ne la validerait jamais.

- [ ] **Étape 1 : écrire la migration**

```sql
-- D66 — nouvelle origine de demande : la conversion d'un participant externe par le
-- chemin 1 (fiche en_attente rejoignant le circuit de validation de /demandes, où elle est
-- passée à `actif` par le bouton « Valider comme nouvelle personne » — le SEUL geste de
-- l'application qui active une fiche en_attente).
--
-- ⚠️ CE FICHIER NE CONTIENT QUE CETTE INSTRUCTION, ET C'EST OBLIGATOIRE.
-- `alter type ... add value` ajoute une valeur qui NE PEUT PAS ÊTRE EMPLOYÉE dans la même
-- transaction que son ajout, et supabase db push joue chaque fichier dans sa propre
-- transaction. Toute instruction ajoutée ici qui EMPLOIE la valeur — un insert, une
-- fonction dont le corps la compare littéralement, une contrainte check — ferait échouer
-- la migration entière avec « unsafe use of new value ».
--
-- Pourquoi pas réutiliser `demande_suivi` : D32 pose que l'origine d'une demande est
-- EXPLICITE, jamais inférée. La réutiliser mentirait sur la provenance et brancherait
-- l'écran de validation sur le mauvais comportement — poser le DEMANDEUR comme faiseur de
-- disciple, alors que l'administrateur qui convertit n'est pas le faiseur de disciple de
-- la personne convertie.

alter type public.origine_demande add value 'conversion_participant';
```

- [ ] **Étape 2 : appliquer et vérifier que la valeur existe**

```bash
npx supabase db push --linked
```

```sql
select enumlabel, enumsortorder
from pg_enum
where enumtypid = 'public.origine_demande'::regtype
order by enumsortorder;
```

**Attendu, exactement trois lignes :** `auto_inscription`, `demande_suivi`,
`conversion_participant`. Consigner la sortie — si la troisième manque, la migration n'a
**pas** été jouée (piège n°2) et **toutes les tâches suivantes de la Partie C échoueront de
façon obscure**.

- [ ] **Étape 3 : les six portes, puis commit**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls && npm run test:e2e && npm run build
```

```bash
git add supabase/migrations/<NUMERO+8>_origine_conversion_participant.sql
git commit -m "feat: origine de demande conversion_participant, migration isolee (D66)"
```

---

### Task 11 : passerelle `convertir_participant_externe` (D65 à D69)

**Fichiers :**
- Créer : `supabase/migrations/<NUMERO+9>_convertir_participant_externe.sql`

**Interfaces :**
- Consomme : `public.participants_externes` (T6), `public.membres`,
  `public.demandes_membre`, la valeur `conversion_participant` (T10, **migration
  distincte et déjà appliquée**).
- Produit :

```
public.convertir_participant_externe(
  p_participant      uuid,
  p_chemin           text,
  p_membre_cible     uuid,
  p_nom              text,
  p_prenom           text,
  p_faiseur          uuid,
  p_dirigeant        uuid,
  p_dirigeant_force  boolean,
  p_par              uuid
) returns table (membre_id uuid, demande_id uuid)
```

`security definer`, `set search_path = ''`, `execute` **retiré** de `public`, `anon`,
`authenticated`, **accordé au seul `service_role`**. Valeurs acceptées de `p_chemin` :
**`'fiche_en_attente'`**, **`'fiche_active'`**, **`'membre_existant'`**. Marqueurs posés :
`participant_inconnu`, `participant_deja_converti`, `membre_cible_inconnu`,
`membre_cible_non_actif`, `chemin_inconnu`. Consommée par `convertirParticipant` (T21).

**Atomicité PAR CONSTRUCTION (D65).** Créer la fiche puis poser `converti_en_membre_id` en
**deux écritures séparées** laisserait une fenêtre où la fiche existe **sans lien** : le
participant reste dans la liste « à traiter » alors qu'il a déjà une fiche, et un second
clic créerait un **doublon**. Une seule fonction PL/pgSQL, et une exception à n'importe
quel point de son corps annule **tout** ce qu'elle a écrit — Postgres le garantit au niveau
du langage, sans verrou ajouté. **Postgres n'a pas de transaction autonome** : c'est
précisément ce qui rend cette garantie vraie. C'est le raisonnement exact de
`annuler_demande_membre` (2b §7.2), et **la même discipline est à documenter au point
d'appel** (T21) : scinder un jour cet appel en deux ferait disparaître l'atomicité **en
silence**.

**Le verrou « arbre » est pris INCONDITIONNELLEMENT, en première instruction (D67).**
D67 ne l'exige que pour le chemin 2, seul chemin qui pose un `faiseur_de_disciple_id`.
Le prendre quand même sur les trois coûte une instruction sur un geste **rare**, et évite
qu'un relecteur ait à **relire le corps entier** pour savoir si un appel donné est
sérialisé. Le verrou doit de toute façon être la **première instruction, avant toute
lecture** (doctrine de la 1c) : le rendre conditionnel obligerait à brancher avant de lire,
ce qui est faisable mais fragile à la première retouche. Clé `(20260814, 1)` — **la même
constante que `public.definir_arbre`**, sans quoi les deux ne se sérialiseraient pas
entre eux et le verrou ne servirait à rien.

**`is distinct from`, jamais `<>`, sur l'état de la fiche cible.** `v_etat_cible` provient
d'un `select … into` : après le `if not found`, il est non nul aujourd'hui, mais l'écrire
`<> 'actif'` fait dépendre la sûreté d'un raisonnement au lieu d'une expression.

**D69 — la participation ne bouge JAMAIS.** Cette fonction n'émet **aucun `update` sur
`participations`**. Si un jour quelqu'un ajoute ici un `update participations set membre_id
= …`, il effacerait le fait que cette personne est entrée par un séminaire (ce que D13 veut
mesurer) et **échouerait** dans le cas normal du chemin 3 (la personne figure déjà comme
membre à ce même événement), pour une raison qui n'a rien à voir avec la conversion.

- [ ] **Étape 1 : vérifier que la migration de la Task 10 est bien appliquée**

Cette fonction **compare `origine` à la valeur nouvelle**. Si `conversion_participant`
n'existe pas, `create or replace function` **réussira quand même** (le corps PL/pgSQL n'est
pas analysé à la création) et **échouera à l'exécution**, bien plus tard, dans un test.

```sql
select 1 from pg_enum
where enumtypid = 'public.origine_demande'::regtype
  and enumlabel = 'conversion_participant';
```

**Attendu : une ligne.** Si aucune, reprendre la Task 10.

- [ ] **Étape 2 : écrire la migration**

```sql
-- Conversion d'un participant externe en membre, trois chemins, PASSERELLE UNIQUE
-- (D65 à D69). Réservée à l'administrateur au niveau applicatif (spec §5.2, ligne
-- « Convertir un participant externe en membre ») ; ici, execute est réservé à
-- service_role, comme toutes les passerelles métier du projet.
--
-- ATOMICITÉ PAR CONSTRUCTION (D65). Créer la fiche puis poser converti_en_membre_id en
-- DEUX écritures séparées laisserait une fenêtre où la fiche existe SANS LIEN : le
-- participant reste dans la liste « à traiter » alors qu'il a déjà une fiche, et un second
-- clic créerait un doublon. Une exception à n'importe quel point de ce corps annule TOUT
-- ce qu'il a écrit — Postgres n'a PAS de transaction autonome, et c'est précisément ce qui
-- rend cette garantie vraie. NE JAMAIS scinder l'appel côté application (voir Task 21) :
-- ce serait rouvrir l'atomicité en silence.
--
-- D69 — CETTE FONCTION N'ÉCRIT JAMAIS DANS `participations`. Une participation est un fait
-- daté qui ne bouge jamais. Repointer participations.membre_id effacerait le fait que
-- cette personne est entrée par un séminaire (ce que D13 veut mesurer) et ÉCHOUERAIT dans
-- le cas normal du chemin 3 sur l'index unique (evenement_id, membre_id), pour une raison
-- sans rapport avec la conversion. Le lien se fait par converti_en_membre_id, résolu à la
-- LECTURE par la vue seminaires_assistes (D70).

create or replace function public.convertir_participant_externe(
  p_participant uuid,
  p_chemin text,
  p_membre_cible uuid,
  p_nom text,
  p_prenom text,
  p_faiseur uuid,
  p_dirigeant uuid,
  p_dirigeant_force boolean,
  p_par uuid
)
returns table (membre_id uuid, demande_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_participant public.participants_externes%rowtype;
  v_membre uuid;
  v_demande uuid;
  v_etat_cible public.etat_membre;
begin
  -- D67 — VERROU « ARBRE », PREMIÈRE INSTRUCTION, AVANT TOUTE LECTURE.
  -- Même clé constante (20260814, 1) que public.definir_arbre : une clé différente ne
  -- sérialiserait RIEN entre les deux, et le verrou ne servirait à rien.
  -- Le déclencheur anti-cycle seul ne suffit pas, et la 1c (§4.1) l'a établi : deux
  -- écritures concurrentes voient chacune un arbre sans cycle et valident toutes les deux.
  -- La fiche créée ici n'a aucun descendant à l'instant de son insertion, mais une
  -- transaction concurrente peut, pendant ce temps, rattacher son futur faiseur de
  -- disciple SOUS ELLE via definir_arbre sans la voir.
  -- PRIS INCONDITIONNELLEMENT, alors que seul le chemin 2 pose un faiseur de disciple :
  -- le coût est nul sur un geste rare, et une passerelle qui prend son verrou PARFOIS est
  -- une passerelle dont il faut relire le corps entier pour savoir si un appel donné est
  -- sûr.
  perform pg_advisory_xact_lock(20260814, 1);

  select * into v_participant
  from public.participants_externes x
  where x.id = p_participant
  for update;

  if not found then
    raise exception 'Participant externe inconnu.'
      using detail = 'participant_inconnu';
  end if;

  -- D63 — barrière AMONT, doublée par le déclencheur participants_externes_liens_definitifs
  -- (migration des participants externes). Ici pour EXPLIQUER avant d'écrire ; là-bas pour
  -- protéger même une écriture directe.
  if v_participant.converti_en_membre_id is not null then
    raise exception 'Ce participant a déjà été converti en membre.'
      using detail = 'participant_deja_converti';
  end if;

  -- D62 — un participant DÉJÀ CLASSÉ SANS SUITE reste convertible, et aucune vérification
  -- ne l'en empêche ici. « Pas de réouverture » porte sur la LISTE, pas sur le sort de la
  -- personne : quelqu'un classé il y a deux ans qui reprend contact doit pouvoir être
  -- converti, et cette conversion ne repeuple aucune liste. Dit ici pour qu'on ne « corrige »
  -- pas l'absence de contrôle en croyant combler un oubli.

  if p_chemin = 'fiche_en_attente' then
    -- CHEMIN 1 — fiche en_attente rejoignant le circuit de validation de /demandes.
    -- CE QUI LA FAIT PASSER À `actif`, ET C'EST LE SEUL GESTE QUI LE FASSE : le bouton
    -- « Valider comme nouvelle personne » de /demandes, servi par
    -- `validerDemandeNouvellePersonne` (src/app/demandes/actions.ts), dont la garde
    -- d'origine accepte `conversion_participant` au même titre que `auto_inscription` et
    -- `demande_suivi`. Cette validation écrit `etat = 'actif'` ET RIEN D'AUTRE pour cette
    -- origine : elle ne pose AUCUN faiseur de disciple, l'administrateur qui convertit
    -- n'étant pas le faiseur de disciple de la personne convertie. Le rattachement à
    -- l'arbre se fait ensuite, depuis /membres/<id>/arbre.
    -- NE PAS croire qu'un autre geste activerait cette fiche : `definir_arbre` n'écrit
    -- que les trois colonnes de filiation et JAMAIS `etat` ; `rejeterDemande` n'écrit que
    -- `demandes_membre.etat` et ne touche pas la fiche.
    insert into public.membres (nom, prenom, telephone, email_contact, ville, pays, etat, cree_par)
    values (
      p_nom,
      p_prenom,
      v_participant.telephone,
      v_participant.email,
      v_participant.ville,
      v_participant.pays,
      'en_attente',
      p_par
    )
    returning id into v_membre;

    -- D66 — sans cette ligne, la fiche en_attente ne rejoindrait AUCUN circuit :
    -- /demandes liste des demandes, pas des fiches, et personne ne la validerait jamais.
    -- L'origine est EXPLICITE (D32), jamais inférée : réutiliser `demande_suivi`
    -- brancherait l'écran de validation sur le mauvais comportement (poser le demandeur
    -- comme faiseur de disciple, alors que l'administrateur qui convertit ne l'est pas).
    insert into public.demandes_membre (origine, demandeur_profil_id, membre_id, etat)
    values ('conversion_participant', p_par, v_membre, 'en_attente')
    returning id into v_demande;

  elsif p_chemin = 'fiche_active' then
    -- CHEMIN 2 — fiche ACTIVE directe, avec faiseur de disciple. C'est le chemin que le
    -- verrou pris plus haut protège réellement. Aucune vérification de l'état du faiseur
    -- ici : le déclencheur membres_faiseur_de_disciple_archive (20260814150000) refuse
    -- déjà un faiseur ARCHIVÉ avec le marqueur `faiseur_de_disciple_archive`, et
    -- membres_anti_cycle refuse un cycle. Dupliquer ces règles créerait deux vérités.
    insert into public.membres (
      nom, prenom, telephone, email_contact, ville, pays, etat,
      faiseur_de_disciple_id, dirigeant_id, dirigeant_force, cree_par
    )
    values (
      p_nom,
      p_prenom,
      v_participant.telephone,
      v_participant.email,
      v_participant.ville,
      v_participant.pays,
      'actif',
      p_faiseur,
      p_dirigeant,
      coalesce(p_dirigeant_force, false),
      p_par
    )
    returning id into v_membre;

  elsif p_chemin = 'membre_existant' then
    -- CHEMIN 3 — rattachement à une fiche EXISTANTE. Aucune fiche créée, aucune écriture
    -- sur membres : seul le lien du participant est posé, plus bas.
    select m.etat into v_etat_cible
    from public.membres m
    where m.id = p_membre_cible
    for update;

    if not found then
      raise exception 'Fiche cible inconnue.'
        using detail = 'membre_cible_inconnu';
    end if;

    -- D68 — `is distinct from` et non `<>` : v_etat_cible est non nul après le `if not
    -- found` ci-dessus, mais l'écrire ainsi fait dépendre la sûreté d'une EXPRESSION plutôt
    -- que d'un raisonnement qu'une retouche future pourrait invalider.
    -- Rattacher à une fiche `archive` attribuerait un séminaire à quelqu'un qui a quitté
    -- l'équipe et ferait réapparaître son nom dans des vues que l'archivage ferme ;
    -- rattacher à une fiche `en_attente` court-circuiterait le circuit de validation qui la
    -- retient. Double dispositif, comme le §7 de la spécification maîtresse le fait déjà
    -- pour le faiseur de disciple archivé : le sélecteur ne propose que des membres actifs,
    -- ET cette passerelle refuse — sans quoi un onglet resté ouvert reposterait un
    -- identifiant devenu invalide entre-temps.
    if v_etat_cible is distinct from 'actif' then
      raise exception 'La fiche choisie doit être active.'
        using detail = 'membre_cible_non_actif';
    end if;

    v_membre := p_membre_cible;

  else
    raise exception 'Chemin de conversion inconnu.'
      using detail = 'chemin_inconnu';
  end if;

  -- L'ÉCRITURE QUI FERME LA CONVERSION, dans la MÊME transaction que la création de la
  -- fiche : c'est tout l'objet de D65. Le déclencheur participants_externes_liens_definitifs
  -- laisse passer ce premier passage (old.converti_en_membre_id est NULL) et refusera tout
  -- suivant.
  update public.participants_externes
     set converti_en_membre_id = v_membre,
         converti_le = now(),
         converti_par = p_par
   where id = p_participant;

  return query select v_membre, v_demande;
end;
$$;

comment on function public.convertir_participant_externe(uuid, text, uuid, text, text, uuid, uuid, boolean, uuid) is
  'Convertit un participant externe en membre par l''un des trois chemins (D65-D69) : fiche_en_attente (fiche en_attente + ligne demandes_membre d''origine conversion_participant, D66), fiche_active (fiche actif directe avec faiseur de disciple), membre_existant (rattachement à une fiche déjà active, D68). ATOMIQUE PAR CONSTRUCTION : une exception à n''importe quel point annule tout ce que la fonction a écrit — NE JAMAIS scinder l''appel en deux côté application. Prend pg_advisory_xact_lock(20260814, 1), la MÊME clé que public.definir_arbre (D67), en première instruction. N''ÉCRIT JAMAIS dans participations (D69) : la participation est un fait daté qui ne bouge jamais, et le lien se résout à la lecture par la vue seminaires_assistes (D70). Un participant déjà CLASSÉ SANS SUITE reste convertible (D62). Marqueurs posés via `using detail` : participant_inconnu, participant_deja_converti, membre_cible_inconnu, membre_cible_non_actif, chemin_inconnu. SECURITY DEFINER, EXECUTE réservé à service_role.';

revoke execute on function public.convertir_participant_externe(uuid, text, uuid, text, text, uuid, uuid, boolean, uuid)
  from public, anon, authenticated;
grant execute on function public.convertir_participant_externe(uuid, text, uuid, text, text, uuid, uuid, boolean, uuid)
  to service_role;
```

- [ ] **Étape 3 : appliquer et éprouver LE CHEMIN 3, LE PLUS COURT, À LA MAIN**

```bash
npx supabase db push --linked
```

Dans l'éditeur SQL — un contrôle **positif** avant tout refus :

```sql
-- Préparation, chaque insert vérifié.
insert into public.participants_externes (nom, prenom, ville)
values ('ZZVerifConv-x', 'Test', 'Yaoundé') returning id;  -- <ID_X>

select id, etat from public.membres where etat = 'actif' limit 1;  -- <ID_M_ACTIF>

-- CONTRÔLE POSITIF : chemin 3 sur une fiche active.
select * from public.convertir_participant_externe(
  '<ID_X>', 'membre_existant', '<ID_M_ACTIF>', null, null, null, null, false, null
);
-- Attendu : une ligne, membre_id = <ID_M_ACTIF>, demande_id NULL.

select converti_en_membre_id, converti_le, converti_par
from public.participants_externes where id = '<ID_X>';
-- Attendu : le lien est posé, converti_le non nul.

-- REFUS attendu, marqueur participant_deja_converti.
select * from public.convertir_participant_externe(
  '<ID_X>', 'membre_existant', '<ID_M_ACTIF>', null, null, null, null, false, null
);

-- REFUS attendu, marqueur chemin_inconnu — et il faut un participant NEUF, sans quoi le
-- refus viendrait de participant_deja_converti et ne prouverait rien du chemin.
insert into public.participants_externes (nom) values ('ZZVerifConv-y') returning id;  -- <ID_Y>
select * from public.convertir_participant_externe(
  '<ID_Y>', 'chemin_qui_nexiste_pas', null, null, null, null, null, false, null
);

-- REFUS attendu, marqueur participant_inconnu.
select * from public.convertir_participant_externe(
  gen_random_uuid(), 'membre_existant', '<ID_M_ACTIF>', null, null, null, null, false, null
);

-- Nettoyage. `converti_en_membre_id` est en on delete restrict : ce sont les PARTICIPANTS
-- qu'on supprime, jamais le membre de production visé ci-dessus.
delete from public.participants_externes where nom like 'ZZVerifConv-%';
select count(*) from public.participants_externes where nom like 'ZZVerifConv-%';
```

**Attendu :** une ligne rendue, le lien relu non nul, puis trois refus portant
respectivement `participant_deja_converti`, `chemin_inconnu`, `participant_inconnu` dans
leur `DETAIL`, puis `0`. **Consigner les trois `DETAIL` réels** — c'est le seul canal que
le code applicatif discriminera, jamais le texte français.

⚠️ **Ne pas laisser le membre de production converti derrière soi** : après le nettoyage,
vérifier qu'aucun `participants_externes` ne pointe plus vers `<ID_M_ACTIF>` :

```sql
select count(*) from public.participants_externes where converti_en_membre_id = '<ID_M_ACTIF>';
```

**Attendu : `0`.**

- [ ] **Étape 4 : les six portes, puis commit**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls && npm run test:e2e && npm run build
```

```bash
git add supabase/migrations/<NUMERO+9>_convertir_participant_externe.sql
git commit -m "feat: passerelle convertir_participant_externe, trois chemins (D65-D69)"
```

---

### Task 12 : passerelle `classer_participant_externe` (D55, D61, D62)

**Fichiers :**
- Créer : `supabase/migrations/<NUMERO+10>_classer_participant_externe.sql`

**Interfaces :**
- Consomme : `public.participants_externes` (T6).
- Produit :

```
public.classer_participant_externe(p_participant uuid, p_motif text, p_par uuid) returns void
```

`security definer`, `set search_path = ''`, `execute` réservé à `service_role`. Marqueurs :
`motif_classement_vide`, `participant_inconnu`, `participant_deja_converti`,
`classement_definitif`. Consommée par `classerParticipant` (T21).

**Réservé à l'ADMINISTRATEUR SEUL (D55).** La matrice du §5.2 est **silencieuse** sur ce
geste, qui n'existait dans aucun document avant la décision utilisateur qui l'a créé. Son
silence est **constaté et comblé**, pas réinterprété. Conversion et classement sont les
**deux seules** façons de vider la liste ; en réserver une et ouvrir l'autre serait
incohérent — un modérateur pourrait **vider la liste de travail de l'administrateur sans
convertir personne**. La garde applicative est `exigerAdministrateur` (T21) ; la Task 28
ajoute la ligne manquante à la matrice.

**Aucun verrou consultatif ici.** L'invariant ne dépasse pas la ligne écrite — même
raisonnement que D38 (phase 3) et que `definirAntenneMembre` : le verrou ou la passerelle
ne se justifient que quand l'invariant dépasse une seule ligne. Le `for update` de la
ligne suffit à sérialiser deux classements concurrents du **même** participant.

- [ ] **Étape 1 : écrire la migration**

```sql
-- Classement sans suite d'un participant externe (D55, D61, D62). L'autre façon — et la
-- seule autre — de vider la liste « à traiter ».
--
-- D55 — réservé à l'ADMINISTRATEUR SEUL au niveau applicatif (exigerAdministrateur), comme
-- la conversion. La matrice du §5.2 était SILENCIEUSE sur ce geste ; son silence est
-- comblé, pas réinterprété. Ouvrir le classement au modérateur tout en lui refusant la
-- conversion permettrait de VIDER LA LISTE DE TRAVAIL DE L'ADMINISTRATEUR SANS CONVERTIR
-- PERSONNE.
--
-- D61 — le classement porte sur la PERSONNE, jamais sur une participation : une personne
-- ayant exprimé le désir à deux séminaires produit deux participations, et classer l'une
-- la laisserait dans la liste par l'autre.
--
-- Aucun verrou consultatif : l'invariant ne dépasse pas la ligne écrite (même raisonnement
-- que D38 (phase 3) et que definirAntenneMembre). Le `for update` sérialise deux
-- classements concurrents du même participant, ce qui est tout ce qui est en jeu.

create or replace function public.classer_participant_externe(
  p_participant uuid,
  p_motif text,
  p_par uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_participant public.participants_externes%rowtype;
begin
  -- Contrôle du motif AVANT toute lecture : c'est le refus le plus probable, et il ne
  -- demande aucune donnée. La contrainte participants_externes_classement_coherent reste
  -- la barrière ; ce contrôle amont explique, avec un marqueur exploitable, plutôt qu'un
  -- 23514 opaque.
  if p_motif is null or length(trim(p_motif)) = 0 then
    raise exception 'Un motif de classement est obligatoire.'
      using detail = 'motif_classement_vide';
  end if;

  select * into v_participant
  from public.participants_externes x
  where x.id = p_participant
  for update;

  if not found then
    raise exception 'Participant externe inconnu.'
      using detail = 'participant_inconnu';
  end if;

  -- Un participant DÉJÀ CONVERTI n'a plus rien à faire dans la liste : le classer n'aurait
  -- aucun effet visible (la vue l'exclut déjà) et laisserait croire à un geste utile.
  if v_participant.converti_en_membre_id is not null then
    raise exception 'Ce participant a déjà été converti en membre.'
      using detail = 'participant_deja_converti';
  end if;

  -- D62 — pas de réouverture, et pas de reclassement non plus. Barrière amont doublée par
  -- le déclencheur participants_externes_liens_definitifs, qui protège même une écriture
  -- directe.
  if v_participant.classe_le is not null then
    raise exception 'Ce participant a déjà été classé sans suite.'
      using detail = 'classement_definitif';
  end if;

  update public.participants_externes
     set classe_le = now(),
         classe_par = p_par,
         motif_classement = trim(p_motif)
   where id = p_participant;
end;
$$;

comment on function public.classer_participant_externe(uuid, text, uuid) is
  'Classe sans suite un participant externe, avec motif obligatoire (D55, D61, D62). Le classement porte sur la PERSONNE, jamais sur une participation : c''est ce qui rend le vidage de la liste « à traiter » vrai quel que soit le nombre d''événements fréquentés. Définitif — ni déclassement ni reclassement (D62) — mais N''INTERDIT PAS une conversion ultérieure : « pas de réouverture » porte sur la liste, pas sur le sort de la personne. Réservé à l''administrateur seul au niveau applicatif (D55), la matrice du §5.2 étant silencieuse sur ce geste avant lui. Marqueurs via `using detail` : motif_classement_vide, participant_inconnu, participant_deja_converti, classement_definitif. SECURITY DEFINER, EXECUTE réservé à service_role.';

revoke execute on function public.classer_participant_externe(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.classer_participant_externe(uuid, text, uuid)
  to service_role;
```

- [ ] **Étape 2 : appliquer et éprouver, avec contrôle positif**

```bash
npx supabase db push --linked
```

```sql
insert into public.participants_externes (nom) values ('ZZVerifClass-a') returning id;  -- <ID_A>

-- REFUS attendu, marqueur motif_classement_vide.
select public.classer_participant_externe('<ID_A>', '   ', null);

-- CONTRÔLE POSITIF : motif non vide.
select public.classer_participant_externe('<ID_A>', 'Injoignable depuis trois mois', null);
select classe_le, motif_classement from public.participants_externes where id = '<ID_A>';

-- REFUS attendu, marqueur classement_definitif.
select public.classer_participant_externe('<ID_A>', 'Autre motif', null);

-- REFUS attendu, marqueur participant_inconnu.
select public.classer_participant_externe(gen_random_uuid(), 'Motif', null);

delete from public.participants_externes where nom like 'ZZVerifClass-%';
select count(*) from public.participants_externes where nom like 'ZZVerifClass-%';
```

**Attendu :** `motif_classement_vide`, un succès avec `classe_le` non nul et le motif
**rogné**, `classement_definitif`, `participant_inconnu`, puis `0`. Consigner les trois
`DETAIL`.

- [ ] **Étape 3 : les six portes, puis commit**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls && npm run test:e2e && npm run build
```

```bash
git add supabase/migrations/<NUMERO+10>_classer_participant_externe.sql
git commit -m "feat: passerelle classer_participant_externe, motif obligatoire (D55, D61, D62)"
```

---

### Task 13 : `annuler_demande_membre` amendée — refus `demande_conversion_non_annulable` (D64)

**Fichiers :**
- Créer : `supabase/migrations/<NUMERO+11>_annuler_demande_membre_conversion.sql`

**Interfaces :**
- Consomme : `public.demandes_membre`, la valeur `conversion_participant` (T10).
- Produit : `public.annuler_demande_membre(p_demande uuid, p_demandeur uuid) returns void`
  — **même signature, même nom, `create or replace` dans une migration NEUVE**. Marqueur
  **nouveau** : `demande_conversion_non_annulable`. Marqueur existant conservé :
  `demande_non_annulable`. Consommée par `annulerDemandeSuivi` (inchangée) et par l'écran
  `/demandes` (T22).

**Le sinistre que cet amendement ferme.** L'annulation (D42 — c'est le D42 de la **2b**)
**supprime la fiche `en_attente`** que la demande portait. Une conversion par le chemin 1
pointe **sur cette fiche**. L'administrateur convertisseur **est** le demandeur : le bouton
« Annuler » s'affiche pour lui dans « Mes demandes ». Sans barrière, un clic
**déconvertirait** le participant — sa fiche disparaît, son historique de séminaire est
perdu, il **réapparaît dans la liste « à traiter »**.

**Deux barrières, pas une.** (1) `participants_externes.converti_en_membre_id` est en
`on delete restrict` (T6) : le `delete from membres` **échoue en `23503`**, ce qui
**annule toute la transaction** de la fonction — Postgres n'a pas de transaction autonome,
donc l'état `annulee` déjà écrit est **annulé lui aussi**. (2) Le refus explicite ci-dessous
**explique** au lieu de laisser passer un `23503` opaque, et il protège aussi le cas où la
conversion aurait été faite par un chemin qui ne crée pas de fiche.

**⚠️ `create or replace`, et le corps doit être REPRIS À L'IDENTIQUE de la dernière
version déployée**, avec la seule addition du refus. La dernière version est
`20260815250000_correler_annulation_demande_membre.sql` — pas `20260815200000` ni
`20260815220000`. **Relire ce fichier avant d'écrire**, jamais recopier depuis ce plan : si
une migration plus récente l'a retouchée entre-temps, c'est elle qui fait foi.

- [ ] **Étape 1 : relire la version déployée**

```bash
grep -rln "annuler_demande_membre" supabase/migrations/ | sort
```

```bash
cat supabase/migrations/20260815250000_correler_annulation_demande_membre.sql
```

Puis vérifier **en base** que c'est bien cette version qui est active :

```sql
select pg_get_functiondef('public.annuler_demande_membre(uuid, uuid)'::regprocedure);
```

Consigner la définition relevée dans le rapport : c'est la **référence** contre laquelle la
nouvelle sera comparée.

- [ ] **Étape 2 : écrire la migration**

```sql
-- D64 — amendement de public.annuler_demande_membre : une demande d'origine
-- `conversion_participant` n'est PAS annulable.
--
-- LE SINISTRE FERMÉ ICI. L'annulation (D42, phase 2b) SUPPRIME la fiche en_attente que la
-- demande portait. Une conversion par le chemin 1 pointe SUR CETTE FICHE, et
-- l'administrateur convertisseur EST le demandeur : le bouton « Annuler » s'affiche pour
-- lui dans « Mes demandes ». Sans barrière, un clic déconvertirait le participant — fiche
-- disparue, historique de séminaire perdu, retour dans la liste « à traiter », aucune
-- erreur nulle part.
--
-- DEUX BARRIÈRES, pas une. (1) participants_externes.converti_en_membre_id est en
-- `on delete restrict` : le `delete from membres` plus bas échouerait en 23503, ce qui
-- annulerait TOUTE la transaction — y compris le passage à `annulee` déjà écrit, Postgres
-- n'ayant pas de transaction autonome. (2) Le refus explicite ci-dessous EXPLIQUE, au lieu
-- de laisser remonter un 23503 opaque, et couvre aussi le cas d'une conversion faite par
-- un chemin qui ne crée pas de fiche (chemin 3).
--
-- `create or replace` dans une migration NEUVE : l'additivité du projet porte sur les
-- FICHIERS, pas sur l'immuabilité d'une fonction. Le corps ci-dessous REPREND À
-- L'IDENTIQUE celui de 20260815250000, avec la SEULE addition du refus et de la lecture de
-- `origine` qu'il exige.

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
  v_origine public.origine_demande;
begin
  -- Verrou DE LIGNE : cette demande précise, pas l'arbre ni les comptes. La condition
  -- WHERE porte à la fois sur la propriété et sur l'état : une demande inexistante,
  -- appartenant à quelqu'un d'autre, ou déjà traitée produit le MÊME refus.
  select d.membre_id, d.origine into v_membre, v_origine
  from public.demandes_membre d
  where d.id = p_demande
    and d.demandeur_profil_id = p_demandeur
    and d.etat = 'en_attente'
  for update;

  if not found then
    raise exception 'Cette demande ne peut plus être annulée.'
      using detail = 'demande_non_annulable';
  end if;

  -- D64 — LE REFUS AJOUTÉ PAR CETTE MIGRATION, avant toute écriture.
  if v_origine = 'conversion_participant' then
    raise exception 'Une demande issue d''une conversion de participant ne peut pas être annulée.'
      using detail = 'demande_conversion_non_annulable';
  end if;

  update public.demandes_membre
     set etat = 'annulee',
         traite_par = p_demandeur,
         traite_le = now()
   where id = p_demande;

  -- D42 (phase 2b) : suppression de la fiche en_attente. membre_id de CETTE ligne devient
  -- NULL automatiquement (on delete set null) : la demande survit, la référence ne pointe
  -- plus vers rien. GARDE : `and etat = 'en_attente'` — cette fonction ne doit JAMAIS
  -- supprimer une fiche qui ne serait plus la fiche jetable d'origine.
  if v_membre is not null then
    delete from public.membres where id = v_membre and etat = 'en_attente';
  end if;

  -- D41 (phase 2b) : les notifications déjà envoyées aux administrateurs POUR CETTE
  -- DEMANDE sont marquées lues. Filtre sur demande_id (corrélation explicite, migration
  -- 20260815240000), PAS sur lien, qui n'est qu'un lien de navigation.
  update public.notifications
     set lu_le = now()
   where type = 'nouvelle_demande'
     and demande_id = p_demande
     and lu_le is null;
end;
$$;

comment on function public.annuler_demande_membre(uuid, uuid) is
  'Annule une demande en_attente à la demande de son propre auteur (D40) : fait passer etat à annulee ET supprime la fiche en_attente qu''elle portait (D42, phase 2b), dans une transaction unique. La suppression de la fiche est gardée par etat = ''en_attente''. Marque lues les notifications nouvelle_demande dont demande_id correspond (D41, phase 2b). AMENDÉE PAR LA PHASE 4 (D64) : refuse une demande d''origine conversion_participant avec le marqueur demande_conversion_non_annulable — l''annuler déconvertirait silencieusement le participant, ferait disparaître sa fiche, perdrait son historique de séminaire et le ferait réapparaître dans la liste « à traiter ». Seconde barrière indépendante : participants_externes.converti_en_membre_id est en on delete restrict, donc le delete échouerait de toute façon en 23503, annulant la transaction entière. SECURITY DEFINER, EXECUTE réservé à service_role.';

revoke execute on function public.annuler_demande_membre(uuid, uuid) from public, anon, authenticated;
grant execute on function public.annuler_demande_membre(uuid, uuid) to service_role;
```

- [ ] **Étape 3 : appliquer, puis DIFFÉRENCE CONTRÔLÉE avec la version d'avant**

```bash
npx supabase db push --linked
```

```sql
select pg_get_functiondef('public.annuler_demande_membre(uuid, uuid)'::regprocedure);
```

Comparer à la définition relevée à l'étape 1. **La seule différence attendue** est
l'addition de `v_origine`, de sa lecture dans le `select … into`, et du bloc de refus.
**Toute autre différence est une régression** — en particulier la disparition du
`and etat = 'en_attente'` du `delete`, ou celle du filtre `demande_id` du marquage des
notifications.

- [ ] **Étape 4 : la suite RLS des demandes passe INCHANGÉE, plus le contrôle positif**

```bash
npm run test:rls -- tests/rls/demandes-membre.test.ts
```

```bash
git diff --stat tests/rls/demandes-membre.test.ts
```

Attendu : vert, **aucune ligne de diff**. Le contrôle positif du nouveau refus — une
annulation d'origine `demande_suivi` qui **fonctionne toujours**, dans le même test que le
refus — est porté par la Task 24, preuve n°11.

- [ ] **Étape 5 : les six portes, puis commit**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls && npm run test:e2e && npm run build
```

```bash
git add supabase/migrations/<NUMERO+11>_annuler_demande_membre_conversion.sql
git commit -m "fix: refuser l'annulation d'une demande d'origine conversion_participant (D64)"
```

---

# Partie D — Domaine et données

### Task 14 : couche domaine `src/lib/domaine/evenements.ts` (§6 du design)

**Fichiers :**
- Créer : `src/lib/domaine/evenements.ts`
- Créer : `src/lib/domaine/evenements.test.ts`

**Interfaces :**
- Consomme : rien. **Fonctions pures, aucun accès à la base**, aucun import de
  `@/lib/donnees` ni de `@/lib/supabase`.
- Produit :

```typescript
export type CheminConversion = 'fiche_en_attente' | 'fiche_active' | 'membre_existant'
export type MotifPeriodeInvalide = 'date_debut_manquante' | 'periode_incoherente'
export function periodeValide(dateDebut: string | null, dateFin: string | null): MotifPeriodeInvalide | null
export function estATraiter(entree: { desirSuiviSpirituel: boolean; convertiEnMembreId: string | null; classeLe: string | null }): boolean
export function motifClassementValide(motif: string | null): boolean
export function champsRequisConversion(chemin: CheminConversion): readonly ChampConversion[]
export type ChampConversion = 'nom' | 'prenom' | 'faiseur' | 'membreCible'
export function champManquantConversion(chemin: CheminConversion, valeurs: Partial<Record<ChampConversion, string | null>>): ChampConversion | 'chemin' | null
```

**Pourquoi ces quatre fonctions, et pas d'autres.**
- `periodeValide` **duplique à dessein** la règle de `evenements_periode_coherente` côté
  application, pour produire un message qui **nomme le champ fautif AVANT d'écrire**. Le
  `check` reste la **barrière** ; le contrôle amont **explique**. Motif établi par
  l'archivage en 1c et repris par D37 (phase 3).
- `estATraiter` isole la **formule** de la liste « à traiter » contre une régression
  silencieuse, **la vue restant la seule source de vérité à l'exécution** — exactement le
  rôle que `compteurAel` joue vis-à-vis de `compteurs_ael`.
- `motifClassementValide` est la moitié applicative de
  `participants_externes_classement_coherent`.
- `champsRequisConversion` est **la seule règle réellement combinatoire de la phase**, et
  **celle où une erreur produirait une fiche muette plutôt qu'une erreur** : un chemin 2
  sans faiseur de disciple crée une fiche active détachée de l'arbre, sans le moindre
  signal.

**`dirigeantPropose` (1c) est RÉUTILISÉ TEL QUEL par le chemin 2, jamais réécrit** —
`src/lib/domaine/arbre.ts`.

- [ ] **Étape 1 : écrire le module**

Créer `src/lib/domaine/evenements.ts` :

```typescript
/**
 * Règles pures de la phase 4 (design §6). AUCUN accès à la base : ce module est testé au
 * Vitest sans réseau, comme `ael.ts` et `arbre.ts`.
 *
 * `dirigeantPropose` (1c, `src/lib/domaine/arbre.ts`) est RÉUTILISÉ TEL QUEL par le
 * chemin 2 de la conversion, jamais réécrit ici : deux copies de cette règle seraient
 * deux occasions de la faire diverger.
 */

/** Les trois chemins de conversion, tels que la passerelle SQL les nomme. */
export type CheminConversion = 'fiche_en_attente' | 'fiche_active' | 'membre_existant'

export const CHEMINS_CONVERSION: readonly CheminConversion[] = [
  'fiche_en_attente',
  'fiche_active',
  'membre_existant',
]

export type MotifPeriodeInvalide = 'date_debut_manquante' | 'periode_incoherente'

/**
 * La règle de `evenements_periode_coherente`, DUPLIQUÉE À DESSEIN côté application pour
 * produire un message qui nomme le champ fautif AVANT d'écrire. Le `check` reste la
 * barrière ; ce contrôle explique. Motif établi par l'archivage en 1c, repris par D37
 * (phase 3).
 *
 * Comparaison de chaînes `AAAA-MM-JJ` et NON de `Date` : ces deux valeurs viennent d'un
 * `<input type="date">` et repartent vers une colonne Postgres `date` (D56). Les passer
 * par `new Date(...)` les interpréterait comme minuit UTC et rouvrirait exactement la
 * classe de défauts que `formaterDateSeule` a verrouillée par un invariant de test. Sur
 * un format à largeur fixe et à composantes décroissantes, l'ordre lexicographique EST
 * l'ordre chronologique.
 */
export function periodeValide(
  dateDebut: string | null,
  dateFin: string | null,
): MotifPeriodeInvalide | null {
  const debut = (dateDebut ?? '').trim()
  if (debut.length === 0) {
    return 'date_debut_manquante'
  }
  const fin = (dateFin ?? '').trim()
  if (fin.length === 0) {
    // Une date de fin absente est LÉGITIME (événement d'un seul jour) : le `check` en base
    // porte la même tolérance (`date_fin is null or ...`).
    return null
  }
  if (fin < debut) {
    return 'periode_incoherente'
  }
  return null
}

/**
 * Le prédicat de la liste « à traiter », isolé pour verrouiller la FORMULE contre une
 * régression silencieuse. LA VUE `participants_a_traiter` RESTE LA SEULE SOURCE DE VÉRITÉ
 * À L'EXÉCUTION : cette fonction n'est jamais employée pour filtrer une liste lue en base
 * — exactement le rôle que `compteurAel` joue vis-à-vis de `compteurs_ael`.
 *
 * Les trois conditions sont conjointes, et aucune n'est superflue : le désir exprimé fait
 * entrer dans la liste, la conversion l'en sort (D69), le classement aussi (D61) — et ce
 * sont les DEUX SEULES façons d'en sortir.
 */
export function estATraiter(entree: {
  desirSuiviSpirituel: boolean
  convertiEnMembreId: string | null
  classeLe: string | null
}): boolean {
  return (
    entree.desirSuiviSpirituel &&
    entree.convertiEnMembreId === null &&
    entree.classeLe === null
  )
}

/**
 * Moitié applicative de `participants_externes_classement_coherent` : un motif est valide
 * s'il reste quelque chose après `trim`. Un motif fait uniquement d'espaces est le cas
 * réel — un champ obligatoire au sens HTML accepte les espaces.
 */
export function motifClassementValide(motif: string | null): boolean {
  return (motif ?? '').trim().length > 0
}

/** Champs qu'un chemin de conversion exige, nommés comme les champs du formulaire. */
export type ChampConversion = 'nom' | 'prenom' | 'faiseur' | 'membreCible'

const REQUIS: Record<CheminConversion, readonly ChampConversion[]> = {
  // Chemin 1 : la fiche naît `en_attente` et une ligne `demandes_membre` d'origine
  // `conversion_participant` la fait entrer dans le circuit de validation de `/demandes`.
  // Elle y est validée par le bouton « Valider comme nouvelle personne », qui la passe à
  // `actif` — et à `actif` SEULEMENT : cette validation NE POSE AUCUN faiseur de disciple
  // pour cette origine, parce que l'administrateur qui convertit n'est pas le faiseur de
  // disciple de la personne convertie. Le rattachement à l'arbre est un geste SÉPARÉ, fait
  // ensuite depuis `/membres/<id>/arbre`. C'est pour cela qu'aucun faiseur n'est exigé ici.
  fiche_en_attente: ['nom', 'prenom'],
  // Chemin 2 : la fiche naît ACTIVE. Sans faiseur de disciple, elle naîtrait DÉTACHÉE de
  // l'arbre — visible dans l'annuaire, hors de toute portée d'autorité, et sans le moindre
  // signal. C'est le cas que le design nomme « une fiche muette plutôt qu'une erreur ».
  fiche_active: ['nom', 'prenom', 'faiseur'],
  // Chemin 3 : aucune fiche n'est créée. Le nom et le prénom de la fiche cible existent
  // déjà et ne doivent surtout pas être écrasés par ceux du participant externe.
  membre_existant: ['membreCible'],
}

/**
 * Quels champs ce chemin exige. C'est LA SEULE RÈGLE RÉELLEMENT COMBINATOIRE DE LA PHASE,
 * et celle où une erreur produirait une fiche muette plutôt qu'une erreur — d'où sa mise
 * en table plutôt qu'en cascade de `if`.
 */
export function champsRequisConversion(chemin: CheminConversion): readonly ChampConversion[] {
  return REQUIS[chemin] ?? []
}

/**
 * Premier champ manquant pour ce chemin, ou `'chemin'` si le chemin lui-même est inconnu,
 * ou `null` si tout est là. Rend le PREMIER manquant et non la liste : un formulaire
 * signale une cause à la fois, et l'ordre de `REQUIS` est celui des champs à l'écran.
 *
 * `'chemin'` est un cas RÉEL et non défensif : `p_chemin` arrive d'un `<select>`, donc
 * d'une soumission qu'une requête forgée peut remplir de n'importe quoi. La passerelle SQL
 * le refuse aussi (marqueur `chemin_inconnu`) ; ce contrôle évite l'aller-retour.
 */
export function champManquantConversion(
  chemin: CheminConversion,
  valeurs: Partial<Record<ChampConversion, string | null>>,
): ChampConversion | 'chemin' | null {
  if (!CHEMINS_CONVERSION.includes(chemin)) {
    return 'chemin'
  }
  for (const champ of champsRequisConversion(chemin)) {
    if ((valeurs[champ] ?? '').trim().length === 0) {
      return champ
    }
  }
  return null
}
```

- [ ] **Étape 2 : écrire les tests unitaires**

Créer `src/lib/domaine/evenements.test.ts` :

```typescript
import { describe, expect, it } from 'vitest'
import {
  champManquantConversion,
  champsRequisConversion,
  estATraiter,
  motifClassementValide,
  periodeValide,
  type CheminConversion,
} from './evenements'

describe('periodeValide', () => {
  it('accepte une date de fin absente : un événement d un seul jour est le cas courant', () => {
    expect(periodeValide('2026-09-01', null)).toBeNull()
    expect(periodeValide('2026-09-01', '')).toBeNull()
    expect(periodeValide('2026-09-01', '   ')).toBeNull()
  })

  it('accepte une date de fin postérieure ou égale', () => {
    expect(periodeValide('2026-09-01', '2026-09-10')).toBeNull()
    expect(periodeValide('2026-09-01', '2026-09-01')).toBeNull()
  })

  it('refuse une date de fin antérieure', () => {
    expect(periodeValide('2026-09-10', '2026-09-01')).toBe('periode_incoherente')
  })

  it('refuse une date de début absente, et le distingue de la période incohérente', () => {
    expect(periodeValide(null, '2026-09-01')).toBe('date_debut_manquante')
    expect(periodeValide('   ', null)).toBe('date_debut_manquante')
  })

  it("compare des chaînes AAAA-MM-JJ, jamais des Date : le changement d'année et de mois est ordonné correctement", () => {
    // Contrôle qui attraperait un passage par `new Date(...)` mal fait autant qu'une
    // comparaison naïve sur des dates au format français.
    expect(periodeValide('2026-12-31', '2027-01-01')).toBeNull()
    expect(periodeValide('2027-01-01', '2026-12-31')).toBe('periode_incoherente')
    expect(periodeValide('2026-09-09', '2026-09-10')).toBeNull()
  })
})

describe('estATraiter', () => {
  it('est vrai pour un désir exprimé, ni converti ni classé', () => {
    expect(
      estATraiter({ desirSuiviSpirituel: true, convertiEnMembreId: null, classeLe: null }),
    ).toBe(true)
  })

  it('est faux sans désir exprimé — CONTRÔLE POSITIF de la ligne précédente', () => {
    expect(
      estATraiter({ desirSuiviSpirituel: false, convertiEnMembreId: null, classeLe: null }),
    ).toBe(false)
  })

  it('est faux une fois converti (D69), et faux une fois classé (D61) : les deux seules sorties', () => {
    expect(
      estATraiter({ desirSuiviSpirituel: true, convertiEnMembreId: 'un-id', classeLe: null }),
    ).toBe(false)
    expect(
      estATraiter({ desirSuiviSpirituel: true, convertiEnMembreId: null, classeLe: '2026-09-01T00:00:00Z' }),
    ).toBe(false)
  })

  it('est faux quand les deux sont posés : D62 les laisse coexister, la liste les exclut quand même', () => {
    expect(
      estATraiter({ desirSuiviSpirituel: true, convertiEnMembreId: 'un-id', classeLe: '2026-09-01T00:00:00Z' }),
    ).toBe(false)
  })
})

describe('motifClassementValide', () => {
  it('refuse le vide, le null et les espaces seuls', () => {
    expect(motifClassementValide(null)).toBe(false)
    expect(motifClassementValide('')).toBe(false)
    expect(motifClassementValide('   ')).toBe(false)
  })

  it('accepte un motif réel — CONTRÔLE POSITIF', () => {
    expect(motifClassementValide('Injoignable')).toBe(true)
    expect(motifClassementValide('  Injoignable  ')).toBe(true)
  })
})

describe('champsRequisConversion et champManquantConversion', () => {
  it('exige nom et prénom pour le chemin 1, sans faiseur de disciple', () => {
    expect(champsRequisConversion('fiche_en_attente')).toEqual(['nom', 'prenom'])
  })

  it("exige le faiseur de disciple pour le chemin 2 — sans lui, la fiche naîtrait ACTIVE et DÉTACHÉE, sans le moindre signal", () => {
    expect(champsRequisConversion('fiche_active')).toEqual(['nom', 'prenom', 'faiseur'])
    expect(
      champManquantConversion('fiche_active', { nom: 'Mbarga', prenom: 'Alice', faiseur: null }),
    ).toBe('faiseur')
  })

  it("n'exige que la fiche cible pour le chemin 3 : le nom de la fiche existante ne doit surtout pas être écrasé", () => {
    expect(champsRequisConversion('membre_existant')).toEqual(['membreCible'])
    expect(champManquantConversion('membre_existant', { membreCible: 'un-id' })).toBeNull()
    expect(champManquantConversion('membre_existant', { nom: 'Mbarga', prenom: 'Alice' })).toBe(
      'membreCible',
    )
  })

  it('rend null quand tout est là — CONTRÔLE POSITIF des trois assertions négatives ci-dessus', () => {
    expect(champManquantConversion('fiche_en_attente', { nom: 'Mbarga', prenom: 'Alice' })).toBeNull()
    expect(
      champManquantConversion('fiche_active', { nom: 'Mbarga', prenom: 'Alice', faiseur: 'un-id' }),
    ).toBeNull()
  })

  it('rend le PREMIER manquant, dans l ordre des champs à l écran', () => {
    expect(champManquantConversion('fiche_active', {})).toBe('nom')
    expect(champManquantConversion('fiche_active', { nom: 'Mbarga' })).toBe('prenom')
  })

  it('refuse un chemin inconnu : le champ arrive d un select, donc d une soumission falsifiable', () => {
    expect(champManquantConversion('autre_chose' as CheminConversion, {})).toBe('chemin')
  })

  it('traite les espaces seuls comme un champ manquant', () => {
    expect(champManquantConversion('fiche_en_attente', { nom: '   ', prenom: 'Alice' })).toBe('nom')
  })
})
```

- [ ] **Étape 3 : exécuter, puis PREUVE PAR MUTATION sur la règle qui compte**

```bash
npm test -- src/lib/domaine/evenements.test.ts
```

Attendu : tout vert. Puis, dans `src/lib/domaine/evenements.ts`, **retirer temporairement**
`'faiseur'` de la ligne `fiche_active` de `REQUIS`, relancer, et **constater que le test
« exige le faiseur de disciple pour le chemin 2 » tombe** — pendant que les autres restent
verts. **Restaurer, relancer, tout vert.**

```bash
git diff src/lib/domaine/evenements.ts
```

Attendu après restauration : **aucune ligne de diff** par rapport à l'état écrit à
l'étape 1.

- [ ] **Étape 4 : les six portes, puis commit**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls && npm run test:e2e && npm run build
```

```bash
git add src/lib/domaine/evenements.ts src/lib/domaine/evenements.test.ts
git commit -m "feat: regles pures des evenements et de la conversion (design phase 4 §6)"
```

---

### Task 15 : couche données — lectures paginées à tri TOTAL (D75)

**Fichiers :**
- Créer : `src/lib/donnees/evenements-lots.ts` (**SANS** `import 'server-only'`)
- Créer : `src/lib/donnees/evenements.ts` (**AVEC** `import 'server-only'`)

**Interfaces :**
- Consomme : `clientServeur()`, les tables et vues des Tasks 4 à 9.
- Produit dans `evenements-lots.ts` :

```typescript
export const TAILLE_PAGE_EVENEMENTS = 25
export const TAILLE_PAGE_PARTICIPANTS = 50
export const TAILLE_PAGE_A_TRAITER = 25
export type PageLue<T> = { lignes: T[]; total: number }
export type EvenementListe = { id: string; titre: string; typeLibelle: string; dateDebut: string; dateFin: string | null; lieu: string | null }
export type ParticipantLigne = { id: string; membreId: string | null; membreNom: string | null; membrePrenom: string | null; participantExterneId: string | null; externeNom: string | null; externePrenom: string | null; externeConvertiEnMembreId: string | null; desirMentoratAcademique: boolean; desirSuiviSpirituel: boolean; desirCpeap: boolean; note: string | null }
export type ATraiterLigne = { participantExterneId: string; nom: string; prenom: string | null; telephone: string | null; email: string | null; ville: string | null; pays: string | null; premiereExpression: string; evenementsConcernes: number }
export async function evenementsParPage(supabase: SupabaseClient, options?: { page?: number; typeId?: string; taillePage?: number }): Promise<PageLue<EvenementListe>>
export async function participantsDEvenementParPage(supabase: SupabaseClient, evenementId: string, options?: { page?: number; taillePage?: number }): Promise<PageLue<ParticipantLigne>>
export async function participantsATraiterParPage(supabase: SupabaseClient, options?: { page?: number; taillePage?: number }): Promise<PageLue<ATraiterLigne>>
```

- Produit dans `evenements.ts` :

```typescript
export type TypeEvenement = { id: string; libelle: string; actif: boolean; ordre: number }
export type EvenementDetail = { id: string; titre: string; typeId: string; typeLibelle: string; dateDebut: string; dateFin: string | null; heureDebut: string | null; lieu: string | null; description: string | null }
export type SeminaireAssiste = { evenementId: string; titre: string; type: string; dateDebut: string }
export async function listerTypesEvenement(): Promise<TypeEvenement[]>
export async function typesEvenementActifs(): Promise<TypeEvenement[]>
export async function listerEvenements(filtres?: { page?: number; typeId?: string }): Promise<PageLue<EvenementListe>>
export async function evenementParId(id: string): Promise<EvenementDetail | null>
export async function participantsDEvenement(evenementId: string, page?: number): Promise<PageLue<ParticipantLigne>>
export async function participantsATraiter(page?: number): Promise<PageLue<ATraiterLigne>>
export async function seminairesAssistes(membreId: string): Promise<SeminaireAssiste[]>
```

**POURQUOI UN MODULE SÉPARÉ SANS `server-only`.** Même motif exact que
`src/lib/donnees/membres-lots.ts` et `presences-lots.ts` (lire leurs encadrés de tête) :
`server-only` est un `throw` **nu**, neutralisé uniquement par l'alias du bundler Next. Les
trois fonctions paginées **reçoivent leur client en paramètre** et ne touchent ni cookies
ni clé de service — les isoler ici permet à `tests/rls/evenements-pagination.test.ts`
(vitest, hors Next) de faire tourner **exactement le code de production** contre la vraie
base, avec une taille de page **abaissée** pour franchir une **vraie** frontière de page
sans créer mille lignes. Sans ce module, la preuve n°14 ne pourrait éprouver qu'une
paraphrase.

## ⚠️ LES TROIS TRIS SONT TOTAUX, ET LA DERNIÈRE CLÉ EST UNIQUE

| Lecture | Tri |
|---|---|
| `evenementsParPage` | `date_debut desc`, **`id`** |
| `participantsDEvenementParPage` | `saisi_le`, **`id`** |
| `participantsATraiterParPage` | `premiere_expression`, **`participant_externe_id`** |

Sans la dernière clé, **deux lignes ex æquo à cheval sur une frontière de page peuvent
être rendues DEUX FOIS ou JAMAIS** — et « jamais », ici, ce sont **des personnes que
personne ne verra jamais**. `date_debut` n'est pas unique (plusieurs événements le même
jour), `saisi_le` non plus (un ajout en lot partage la même valeur par défaut),
`premiere_expression` non plus (deux personnes au même séminaire). C'est le défaut exact
que `membresDesAntennesParLots` ferme par son `.order('id')` final, et que `listerMembres`
a dû fermer **après coup** (I4 de la revue finale de la 1c).

**Forme retenue : pagination visible + `count: 'exact'`, et non parcours par lots.** Les
trois listes sont **affichées paginées à l'utilisateur** — il n'y a rien à recomposer
silencieusement, contrairement à `membresDesAntennes` (croisée avec les présences pour
décider de l'état de chaque case) ou à `calendriersActifs` (qui alimente une **écriture**).
Le total annoncé vient de `count: 'exact'`, qui rend le total **réel indépendamment du
`.range()`** — fait établi contre la base réelle de ce projet pour `listerSeances`, et
réemployé ici.

- [ ] **Étape 1 : écrire `evenements-lots.ts`**

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * PAS de `import 'server-only'` ici, à la différence de `src/lib/donnees/evenements.ts` —
 * délibéré, même motif que `membres-lots.ts` et `presences-lots.ts` (voir leurs encadrés
 * de tête) : les trois fonctions ci-dessous reçoivent leur client Supabase DÉJÀ CONSTRUIT,
 * en paramètre, et ne touchent ni cookies ni clé de service. L'isoler permet à
 * `tests/rls/evenements-pagination.test.ts` (vitest, hors Next.js) de faire tourner
 * EXACTEMENT ce code de production contre la vraie base, avec une taille de page abaissée
 * — chose impossible si ces fonctions vivaient dans un module `server-only`, dont le
 * `throw` nu n'est neutralisé que par l'alias du bundler Next.
 *
 * `evenements.ts`, lui, reste `server-only` et enveloppe ce module pour ses appelants :
 * cette séparation ne change RIEN pour eux.
 */

/**
 * D75 — LES TROIS LISTES DE LA PHASE SONT PAGINÉES, AVEC UN TRI TOTAL.
 *
 * D29 fait exception pour le pointage AEL, et son motif est nommé : pointer suppose de
 * balayer toute l'assistance. AUCUN geste de cette phase n'a cette propriété — ajouter un
 * participant ne demande pas de voir les autres, et le doublon n'est pas évité en regardant
 * la liste, il est REFUSÉ par les index uniques partiels de D58, ce qui est une garantie et
 * non une vigilance.
 *
 * Le risque, lui, est réel : un séminaire académique peut rassembler plusieurs centaines de
 * personnes, et la liste « à traiter » cumule les années. Au-delà de `max_rows = 1000`
 * (`supabase/config.toml:18`), PostgREST tronque EN SILENCE : ce ne serait pas une page
 * incomplète, ce seraient DES PERSONNES QUE PERSONNE NE VERRAIT JAMAIS.
 *
 * Les trois tailles sont exportées : la preuve de non-troncature
 * (`tests/rls/evenements-pagination.test.ts`) appelle ces fonctions avec une taille ramenée
 * à deux ou trois lignes, pour franchir une VRAIE frontière de page sans créer un millier
 * de lignes en base de production.
 */
export const TAILLE_PAGE_EVENEMENTS = 25
export const TAILLE_PAGE_PARTICIPANTS = 50
export const TAILLE_PAGE_A_TRAITER = 25

export type PageLue<T> = { lignes: T[]; total: number }

export type EvenementListe = {
  id: string
  titre: string
  typeLibelle: string
  dateDebut: string
  dateFin: string | null
  lieu: string | null
}

export type ParticipantLigne = {
  id: string
  membreId: string | null
  membreNom: string | null
  membrePrenom: string | null
  participantExterneId: string | null
  externeNom: string | null
  externePrenom: string | null
  externeConvertiEnMembreId: string | null
  desirMentoratAcademique: boolean
  desirSuiviSpirituel: boolean
  desirCpeap: boolean
  note: string | null
}

export type ATraiterLigne = {
  participantExterneId: string
  nom: string
  prenom: string | null
  telephone: string | null
  email: string | null
  ville: string | null
  pays: string | null
  premiereExpression: string
  evenementsConcernes: number
}

/**
 * Validation LEVÉE, pas bornée en silence — même discipline et même raison que
 * `membresDesAntennesParLots` : borner (`Math.min(taille, 999)`) masquerait un appel erroné
 * derrière un comportement différent de celui demandé. Une taille >= `max_rows` ferait
 * tronquer la page PAR POSTGREST LUI-MÊME, et la fonction rendrait une page tronquée comme
 * complète. Une taille <= 0 produirait un `range` structurellement invalide.
 */
function verifierTaillePage(taillePage: number, fonction: string): void {
  if (!Number.isInteger(taillePage) || taillePage < 1 || taillePage >= 1000) {
    throw new Error(
      `${fonction} : taillePage invalide (${taillePage}) — doit être un entier compris entre 1 et 999 inclus (max_rows PostgREST = 1000, supabase/config.toml:18).`,
    )
  }
}

/**
 * `count` absent de la réponse PostgREST : retomber sur la longueur de la page serait un
 * MENSONGE — l'écran annoncerait « 25 événements » pour une base qui en compte mille, et la
 * pagination s'arrêterait à la première page. Même discipline que `listerMembres`.
 */
function totalObligatoire(count: number | null, fonction: string): number {
  if (count === null) {
    throw new Error(`${fonction} : comptage absent de la réponse PostgREST.`)
  }
  return count
}

type LigneMembreEmbed = { id: string; nom: string; prenom: string } | { id: string; nom: string; prenom: string }[] | null
type LigneExterneEmbed =
  | { id: string; nom: string; prenom: string | null; converti_en_membre_id: string | null }
  | { id: string; nom: string; prenom: string | null; converti_en_membre_id: string | null }[]
  | null

function premier<T>(valeur: T | T[] | null): T | null {
  if (!valeur) return null
  return Array.isArray(valeur) ? (valeur[0] ?? null) : valeur
}

// UN SEUL littéral de chaîne, continué par antislash-retour à la ligne (qui n'insère RIEN
// dans la chaîne) — JAMAIS une concaténation par `+` : postgrest-js n'infère le type
// détaillé de `.select(...)` qu'à partir d'un littéral au sens de TypeScript, et une
// concaténation widen le type en `string` générique, faisant retomber tout le résultat sur
// `GenericStringError`. Constaté en phase 3 (`COLONNES_SEANCE_DETAIL`).
const COLONNES_PARTICIPANT =
  'id, membre_id, participant_externe_id, desir_mentorat_academique, desir_suivi_spirituel, \
desir_cpeap, note, saisi_le, \
membres(id, nom, prenom), \
participants_externes(id, nom, prenom, converti_en_membre_id)'

/**
 * Une page d'événements, les plus récents en tête. Tri TOTAL : `date_debut desc` puis `id`
 * — `date_debut` n'est PAS unique (plusieurs événements le même jour), et deux ex æquo à
 * cheval sur une frontière de page seraient rendus deux fois ou JAMAIS sous une pagination
 * par décalage. C'est le défaut que `listerMembres` a dû fermer après coup (I4 de la revue
 * finale de la 1c).
 */
export async function evenementsParPage(
  supabase: SupabaseClient,
  options?: { page?: number; typeId?: string; taillePage?: number },
): Promise<PageLue<EvenementListe>> {
  const taillePage = options?.taillePage ?? TAILLE_PAGE_EVENEMENTS
  verifierTaillePage(taillePage, 'evenementsParPage')
  const page = Math.max(1, options?.page ?? 1)
  const debut = (page - 1) * taillePage

  let requete = supabase
    .from('evenements')
    .select('id, titre, date_debut, date_fin, lieu, types_evenement(libelle)', { count: 'exact' })
    .order('date_debut', { ascending: false })
    .order('id')
    .range(debut, debut + taillePage - 1)

  if (options?.typeId) {
    requete = requete.eq('type_id', options.typeId)
  }

  const { data, error, count } = await requete
  if (error) {
    // Un échec ne doit pas être indistinguable d'une liste vide : annoncer « aucun
    // événement » alors que la requête a échoué est un mensonge silencieux.
    throw new Error(`Lecture des événements impossible : ${error.message}`)
  }

  return {
    lignes: (data ?? []).map((l) => {
      const type = premier(l.types_evenement as { libelle: string } | { libelle: string }[] | null)
      if (!type) {
        // `type_id` est NOT NULL et `types_evenement_lecture` est ouverte à tout compte
        // actif : l'embed ne peut pas rendre `null` pour un appelant autorisé. Si c'est le
        // cas, c'est une anomalie (colonne renommée, jointure cassée), et mieux vaut
        // échouer bruyamment que rendre un type « undefined » à l'écran. Même discipline
        // que `nomAntenneObligatoire` en phase 3.
        throw new Error('Forme inattendue rendue par evenementsParPage : type absent de l embed.')
      }
      return {
        id: l.id as string,
        titre: l.titre as string,
        typeLibelle: type.libelle,
        dateDebut: l.date_debut as string,
        dateFin: l.date_fin as string | null,
        lieu: l.lieu as string | null,
      }
    }),
    total: totalObligatoire(count, 'evenementsParPage'),
  }
}

/**
 * Une page de participants d'un événement, membres et externes confondus, dans l'ordre de
 * saisie. Tri TOTAL : `saisi_le` puis `id` — `saisi_le` n'est PAS unique, un ajout en lot
 * partage la même valeur par défaut `now()` à la milliseconde près.
 *
 * `membres(...)` passe sous la RLS de l'appelant : une fiche archivée lue par un modérateur
 * rend `membre_id` non nul mais l'embed `null`. Les deux informations sont rendues
 * SÉPARÉMENT, jamais confondues — sur le modèle de `libelleFiliation` (1c) et de
 * `seanceParId` (phase 3) : « aucun membre » et « fiche non consultable » sont deux faits
 * différents, et les confondre ferait mentir l'écran.
 */
export async function participantsDEvenementParPage(
  supabase: SupabaseClient,
  evenementId: string,
  options?: { page?: number; taillePage?: number },
): Promise<PageLue<ParticipantLigne>> {
  const taillePage = options?.taillePage ?? TAILLE_PAGE_PARTICIPANTS
  verifierTaillePage(taillePage, 'participantsDEvenementParPage')
  const page = Math.max(1, options?.page ?? 1)
  const debut = (page - 1) * taillePage

  const { data, error, count } = await supabase
    .from('participations')
    .select(COLONNES_PARTICIPANT, { count: 'exact' })
    .eq('evenement_id', evenementId)
    .order('saisi_le')
    .order('id')
    .range(debut, debut + taillePage - 1)

  if (error) {
    throw new Error(`Lecture des participants impossible : ${error.message}`)
  }

  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lignes: (data ?? []).map((l: any) => {
      const membre = premier(l.membres as LigneMembreEmbed)
      const externe = premier(l.participants_externes as LigneExterneEmbed)
      return {
        id: l.id as string,
        membreId: l.membre_id as string | null,
        membreNom: membre?.nom ?? null,
        membrePrenom: membre?.prenom ?? null,
        participantExterneId: l.participant_externe_id as string | null,
        externeNom: externe?.nom ?? null,
        externePrenom: externe?.prenom ?? null,
        externeConvertiEnMembreId: externe?.converti_en_membre_id ?? null,
        desirMentoratAcademique: l.desir_mentorat_academique as boolean,
        desirSuiviSpirituel: l.desir_suivi_spirituel as boolean,
        desirCpeap: l.desir_cpeap as boolean,
        note: l.note as string | null,
      }
    }),
    total: totalObligatoire(count, 'participantsDEvenementParPage'),
  }
}

/**
 * Une page de la liste « à traiter », lue depuis la vue `participants_a_traiter` (D74).
 * Tri TOTAL : `premiere_expression` puis `participant_externe_id` — deux personnes ayant
 * exprimé leur désir au MÊME séminaire partagent `premiere_expression`, et sans la seconde
 * clé l'une des deux pourrait disparaître entre deux pages. Ce sont des PERSONNES À
 * RECONTACTER : « disparue » n'est pas un défaut d'affichage.
 *
 * `count` sur une vue AGRÉGÉE : PostgREST le calcule bien, la vue étant interrogée comme
 * une relation ordinaire — à VÉRIFIER contre la base à l'étape 3 de cette tâche, jamais à
 * supposer.
 */
export async function participantsATraiterParPage(
  supabase: SupabaseClient,
  options?: { page?: number; taillePage?: number },
): Promise<PageLue<ATraiterLigne>> {
  const taillePage = options?.taillePage ?? TAILLE_PAGE_A_TRAITER
  verifierTaillePage(taillePage, 'participantsATraiterParPage')
  const page = Math.max(1, options?.page ?? 1)
  const debut = (page - 1) * taillePage

  // `cree_le` existe bien sur la vue mais N'EST PAS SÉLECTIONNÉE : ni `ATraiterLigne` ni le
  // mapping ci-dessous ne l'exposent, et une colonne lue que personne ne rend est une
  // colonne morte — elle laisse croire à un implémenteur qu'un écran l'affiche quelque
  // part. Ce qui date la ligne à l'écran, c'est `premiere_expression` (la première fois que
  // la personne a exprimé le désir), pas la date de création de sa fiche d'externe. Pour
  // l'ajouter un jour, il faut TROIS gestes ensemble : le `select`, le champ de
  // `ATraiterLigne`, et le mapping.
  const { data, error, count } = await supabase
    .from('participants_a_traiter')
    .select(
      'participant_externe_id, nom, prenom, telephone, email, ville, pays, premiere_expression, evenements_concernes',
      { count: 'exact' },
    )
    .order('premiere_expression')
    .order('participant_externe_id')
    .range(debut, debut + taillePage - 1)

  if (error) {
    throw new Error(`Lecture de la liste à traiter impossible : ${error.message}`)
  }

  return {
    lignes: (data ?? []).map((l) => ({
      participantExterneId: l.participant_externe_id as string,
      nom: l.nom as string,
      prenom: l.prenom as string | null,
      telephone: l.telephone as string | null,
      email: l.email as string | null,
      ville: l.ville as string | null,
      pays: l.pays as string | null,
      premiereExpression: l.premiere_expression as string,
      evenementsConcernes: Number(l.evenements_concernes),
    })),
    total: totalObligatoire(count, 'participantsATraiterParPage'),
  }
}
```

- [ ] **Étape 2 : écrire `evenements.ts`**

```typescript
import 'server-only'
import { clientServeur } from '@/lib/supabase/serveur'
import {
  evenementsParPage,
  participantsATraiterParPage,
  participantsDEvenementParPage,
  type ATraiterLigne,
  type EvenementListe,
  type PageLue,
  type ParticipantLigne,
} from './evenements-lots'

export type { ATraiterLigne, EvenementListe, PageLue, ParticipantLigne }

export type TypeEvenement = { id: string; libelle: string; actif: boolean; ordre: number }

export type EvenementDetail = {
  id: string
  titre: string
  typeId: string
  typeLibelle: string
  dateDebut: string
  dateFin: string | null
  heureDebut: string | null
  lieu: string | null
  description: string | null
}

export type SeminaireAssiste = {
  evenementId: string
  titre: string
  type: string
  dateDebut: string
}

/**
 * Plafond de lecture du CATALOGUE des types, strictement sous `max_rows` (1000). Forme
 * « échouer bruyamment » et non pagination : le catalogue est un référentiel de quelques
 * lignes, alimenté à la main par un administrateur, et il n'est CROISÉ avec aucune autre
 * lecture pour décider d'une écriture. Le jour où il dépasserait ce plafond, il faut le
 * VOIR — la même décision et le même motif que `LIMITE_LECTURE_CALENDRIERS_AEL`.
 */
const LIMITE_LECTURE_TYPES = 999

function refuserTroncature(count: number | null, lues: number, fonction: string): void {
  if (count !== null && count > lues) {
    throw new Error(
      `${fonction} : ${count} types existent, au-delà du plafond de lecture de ` +
        `${LIMITE_LECTURE_TYPES} lignes — cette fonction refuse de rendre une liste ` +
        'tronquée comme complète. Il faut désormais borner ou paginer cette lecture.',
    )
  }
}

async function lireTypes(seulementActifs: boolean): Promise<TypeEvenement[]> {
  const supabase = await clientServeur()
  let requete = supabase
    .from('types_evenement')
    .select('id, libelle, actif, ordre', { count: 'exact' })
    .order('ordre')
    .order('libelle')
    // Tri TOTAL : `ordre` vaut 0 par défaut sur tout type créé depuis l'écran, et
    // `libelle` est unique — mais l'unicité de `libelle` est une contrainte de la table,
    // pas une propriété du tri. `.order('id')` la rend explicite et survivrait à sa levée.
    .order('id')
    .range(0, LIMITE_LECTURE_TYPES - 1)

  if (seulementActifs) {
    requete = requete.eq('actif', true)
  }

  const { data, error, count } = await requete
  if (error) {
    throw new Error(`Lecture des types d événement impossible : ${error.message}`)
  }
  refuserTroncature(count, (data ?? []).length, 'lireTypes')
  return (data ?? []).map((l) => ({
    id: l.id as string,
    libelle: l.libelle as string,
    actif: l.actif as boolean,
    ordre: l.ordre as number,
  }))
}

/** Tous les types, actifs et désactivés — l'écran de catalogue (T16). */
export async function listerTypesEvenement(): Promise<TypeEvenement[]> {
  return lireTypes(false)
}

/**
 * Les seuls types ACTIFS — les formulaires de création et d'édition d'un événement (T17,
 * T18). Un type désactivé disparaît des NOUVELLES attributions mais reste visible sur
 * l'existant (spec §7, même régime que les statuts) : c'est pour cela que
 * `evenementParId` ne filtre pas, et que cette fonction si.
 */
export async function typesEvenementActifs(): Promise<TypeEvenement[]> {
  return lireTypes(true)
}

export async function listerEvenements(filtres?: {
  page?: number
  typeId?: string
}): Promise<PageLue<EvenementListe>> {
  const supabase = await clientServeur()
  return evenementsParPage(supabase, filtres)
}

/** Fiche d'un événement, ou `null` s'il n'existe pas (ou n'est pas visible). */
export async function evenementParId(id: string): Promise<EvenementDetail | null> {
  const supabase = await clientServeur()
  const { data, error } = await supabase
    .from('evenements')
    .select('id, titre, type_id, date_debut, date_fin, heure_debut, lieu, description, types_evenement(libelle)')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    // Une erreur de lecture ne doit pas devenir « cet événement n'existe pas » : les
    // appelants font `notFound()` sur `null`.
    throw new Error(`Lecture de l événement impossible : ${error.message}`)
  }
  if (!data) return null

  const brut = data.types_evenement as { libelle: string } | { libelle: string }[] | null
  const type = Array.isArray(brut) ? (brut[0] ?? null) : brut
  if (!type) {
    throw new Error('Forme inattendue rendue par evenementParId : type absent de l embed.')
  }

  return {
    id: data.id as string,
    titre: data.titre as string,
    typeId: data.type_id as string,
    typeLibelle: type.libelle,
    dateDebut: data.date_debut as string,
    dateFin: data.date_fin as string | null,
    heureDebut: data.heure_debut as string | null,
    lieu: data.lieu as string | null,
    description: data.description as string | null,
  }
}

export async function participantsDEvenement(
  evenementId: string,
  page?: number,
): Promise<PageLue<ParticipantLigne>> {
  const supabase = await clientServeur()
  return participantsDEvenementParPage(supabase, evenementId, { page })
}

export async function participantsATraiter(page?: number): Promise<PageLue<ATraiterLigne>> {
  const supabase = await clientServeur()
  return participantsATraiterParPage(supabase, { page })
}

/**
 * Séminaires assistés par un membre, lus depuis la vue `seminaires_assistes` (D70, D71).
 * L'HISTORIQUE DES CONVERTIS EST COMPRIS : la seconde branche de la vue projette les
 * participations d'externes convertis sur `converti_en_membre_id`, résolu À LA LECTURE —
 * aucune écriture passée n'a bougé (D69).
 *
 * NON PAGINÉE, et bornée par `LIMITE_SEMINAIRES_PAR_MEMBRE` : cette lecture est filtrée sur
 * UN membre, et un membre qui aurait assisté à plus de 999 événements distincts est une
 * anomalie qu'il faut VOIR, pas absorber. La forme « échouer bruyamment » est ici celle qui
 * a un sens : la fiche membre affiche des ÉTIQUETTES, pas une liste paginable, et rendre 25
 * étiquettes sur 40 sans le dire serait exactement le mensonge que D75 combat.
 */
const LIMITE_SEMINAIRES_PAR_MEMBRE = 999

export async function seminairesAssistes(membreId: string): Promise<SeminaireAssiste[]> {
  const supabase = await clientServeur()
  const { data, error, count } = await supabase
    .from('seminaires_assistes')
    .select('evenement_id, titre, type, date_debut', { count: 'exact' })
    .eq('membre_id', membreId)
    .order('date_debut', { ascending: false })
    // Tri TOTAL : `date_debut` n'est pas unique, `evenement_id` l'est dans l'ensemble
    // filtré sur un seul membre (la vue déduplique par `union`).
    .order('evenement_id')
    .range(0, LIMITE_SEMINAIRES_PAR_MEMBRE - 1)

  if (error) {
    // Un échec ne doit pas être indistinguable de « ce membre n'a assisté à aucun
    // séminaire » : c'est précisément le mode de défaillance que D71 décrit pour la vue
    // elle-même, et il ne doit pas être reproduit ici par une erreur avalée.
    throw new Error(`Lecture des séminaires assistés impossible : ${error.message}`)
  }
  if (count !== null && count > (data ?? []).length) {
    throw new Error(
      `seminairesAssistes : ${count} séminaires pour ce membre, au-delà du plafond de ` +
        `lecture de ${LIMITE_SEMINAIRES_PAR_MEMBRE} — cette fonction refuse de rendre une ` +
        'liste tronquée comme complète.',
    )
  }
  return (data ?? []).map((l) => ({
    evenementId: l.evenement_id as string,
    titre: l.titre as string,
    type: l.type as string,
    dateDebut: l.date_debut as string,
  }))
}
```

- [ ] **Étape 3 : REJOUER LES REQUÊTES CONTRE LA VRAIE BASE**

Copier les `select` **depuis les fichiers livrés ci-dessus**, jamais depuis une paraphrase.
Cette étape vérifie en particulier **deux hypothèses qu'aucun raisonnement ne remplace** :
que `count: 'exact'` fonctionne **sur une vue agrégée**, et que les embeds
`membres(...)` / `participants_externes(...)` ne sont pas ambigus.

Créer `scripts/.tmp-verif/rejouer-evenements.mjs` :

```javascript
import { createClient } from '@supabase/supabase-js'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const COLONNES_PARTICIPANT =
  'id, membre_id, participant_externe_id, desir_mentorat_academique, desir_suivi_spirituel, \
desir_cpeap, note, saisi_le, \
membres(id, nom, prenom), \
participants_externes(id, nom, prenom, converti_en_membre_id)'

const appels = [
  ['types_evenement', () => admin.from('types_evenement').select('id, libelle, actif, ordre', { count: 'exact' }).order('ordre').order('libelle').order('id').range(0, 998)],
  ['evenements', () => admin.from('evenements').select('id, titre, date_debut, date_fin, lieu, types_evenement(libelle)', { count: 'exact' }).order('date_debut', { ascending: false }).order('id').range(0, 24)],
  ['participations', () => admin.from('participations').select(COLONNES_PARTICIPANT, { count: 'exact' }).order('saisi_le').order('id').range(0, 49)],
  ['participants_a_traiter', () => admin.from('participants_a_traiter').select('participant_externe_id, nom, prenom, telephone, email, ville, pays, premiere_expression, evenements_concernes', { count: 'exact' }).order('premiere_expression').order('participant_externe_id').range(0, 24)],
  // ⚠️ CETTE LIGNE-CI RENDRA `count = 0`, ET CE N'EST PAS UN DÉFAUT — voir l'attendu
  // ci-dessous AVANT de conclure quoi que ce soit sur la vue.
  ['seminaires_assistes', () => admin.from('seminaires_assistes').select('evenement_id, titre, type, date_debut', { count: 'exact' }).order('date_debut', { ascending: false }).order('evenement_id').range(0, 998)],
]

for (const [nom, appel] of appels) {
  const { error, count } = await appel()
  console.log(`${nom} : ${error ? 'ERREUR ' + error.code + ' ' + error.message : `OK, count = ${count}`}`)
}
```

```bash
npx dotenv -e .env.local -- node scripts/.tmp-verif/rejouer-evenements.mjs
rm -rf scripts/.tmp-verif
```

**Attendu : `OK` sur les cinq lignes, avec un `count` NUMÉRIQUE — pas `null`.** Un `count`
à `null` sur `participants_a_traiter` invaliderait `totalObligatoire` sur cette vue et
**doit être traité avant de continuer** (repli par un `head: true` séparé, sur le modèle de
`compterMembresActifs`). Consigner les cinq lignes réelles.

## ⚠️ `seminaires_assistes` RENDRA `count = 0` ICI, ET C'EST LE RÉSULTAT NORMAL ET ATTENDU

**Ne pas « corriger » la vue sur la foi de ce zéro.** Ce script s'authentifie avec
`SUPABASE_SERVICE_ROLE_KEY`, donc **sans JWT utilisateur** : à l'intérieur de la vue,
`auth.uid()` vaut `NULL`, `prive.est_actif()` rend `false`, `prive.peut_lire_membre` avec
lui — et la vue rend **zéro ligne, sans la moindre erreur**. C'est la conséquence directe
et voulue de son `security_invoker = false` : elle contourne la RLS, **pas l'identité**.

**Ce que cette ligne du script vérifie, et c'est tout** : la **FORME** de la requête — les
quatre colonnes existent, le tri est accepté, `count` est un nombre et non `null`. Elle ne
dit **rien** de ce que la vue rend réellement.

**LE GESTE À NE SURTOUT PAS FAIRE** : basculer la vue en `security_invoker = true` pour
« réparer » ce zéro. Ce serait rendre la vue **silencieusement vide pour tout le monde** —
`participations` est fermée à l'administrateur comme au modérateur, et la vue n'a plus
aucun moyen de la lire — sans qu'aucune erreur ne soit levée nulle part : les étiquettes de
séminaires disparaîtraient de toutes les fiches, sans trace.

**CONTRÔLE POSITIF, à faire dans la foulée** — dans l'éditeur SQL du projet Supabase, où la
requête tourne comme `postgres` et contourne aussi bien la RLS que ce prédicat :

```sql
select count(*) as lignes_vues_par_postgres from public.seminaires_assistes;
```

Lecture du couple de résultats :

| SQL (`postgres`) | Script (`service_role`) | Verdict |
|---|---|---|
| `N > 0` | `count = 0` | **Attendu.** La vue est saine et son prédicat fait son travail. Continuer. |
| `0` | `count = 0` | La base n'a **encore aucune participation** rattachée à un membre lisible à ce stade du plan : le contrôle est **inerte**, le dire dans le rapport et s'en remettre à la preuve n°5. |
| `N > 0` | **erreur** | Là, il y a un vrai défaut de forme (colonne, tri) : le traiter avant de continuer. |

**Ce que la vue rend réellement est prouvé ailleurs, depuis une session UTILISATEUR
RÉELLE** : preuve n°5 de la Task 23, qui lit la vue par `clientSimple` et porte dans le
même test l'assertion jumelle (`participations` rend zéro ligne pour ce même compte) —
seule façon de distinguer « la vue contourne comme prévu » de « l'hypothèse `BYPASSRLS` est
fausse ». **Aucune vérification de cette vue ne se fait depuis `clientAdmin()` ni depuis une
clé de service**, hors la vérification de forme ci-dessus, qui est nommée pour ce qu'elle
est.

- [ ] **Étape 4 : les six portes, puis commit**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls && npm run test:e2e && npm run build
```

```bash
git add src/lib/donnees/evenements-lots.ts src/lib/donnees/evenements.ts
git commit -m "feat: lectures paginees des evenements, tri total (D75)"
```

---

# Partie E — Écrans

**Rappel valable pour les sept tâches de cette partie, sans exception :**

- **Un refus MÉTIER se RETOURNE dans `{ erreur }`, il ne se lève JAMAIS.** En production,
  une exception levée depuis une Server Action perd son message avant même d'atteindre le
  `catch` du composant client : React la remplace par un digest (`Minified React error
  #441`). `src/app/error.tsx` affiche un texte **statique** et ne lit **jamais**
  `error.message`. L'utilisateur perdrait en plus sa saisie.
- **`redirect()` lève une exception de contrôle : jamais dans un `try`.**
- **Le garde est la PREMIÈRE instruction** de chaque Server Action exportée. **Toute**
  fonction exportée d'un fichier `'use server'` est appelable depuis le navigateur, y
  compris celles qui ne font que lire.
- **Masquer un formulaire ne protège rien.** `estModerateurOuAdministrateur` décide d'un
  **affichage** ; `exigerModerateurOuAdministrateur` **protège**, et elle seule.
- **Apostrophes :** chaînes TypeScript entre **guillemets doubles**, `&apos;` en JSX rendu.

### Task 16 : écran `/evenements/types` — catalogue, administrateur seul

**Fichiers :**
- Créer : `src/app/evenements/types/page.tsx`
- Créer : `src/app/evenements/types/actions.ts`
- Créer : `src/app/evenements/types/messages.ts`
- Créer : `src/app/evenements/types/formulaire-type.tsx`
- Créer : `src/app/evenements/types/bouton-bascule-type.tsx`

**Interfaces :**
- Consomme : `listerTypesEvenement()` (T15), `exigerAdministrateur()`.
- Produit : `type EtatTypeEvenement = { erreur: string | null }` ;
  `creerTypeEvenement(_etat: EtatTypeEvenement, donnees: FormData): Promise<EtatTypeEvenement>` ;
  `desactiverTypeEvenement(donnees: FormData): Promise<void>` ;
  `reactiverTypeEvenement(donnees: FormData): Promise<void>` ; les messages
  `MESSAGE_LIBELLE_OBLIGATOIRE`, `MESSAGE_TYPE_EXISTE_DEJA`, `MESSAGE_ECHEC_TYPE`,
  importables par les specs.

**Réservé à l'administrateur** (spec §5.2, ligne « Créer statuts, groupes, antennes, types
d'événement »). **Un type ne se supprime jamais, il se désactive** — et la réactivation
existe pour la même raison que `reactiverStatut` : sans elle, une désactivation par erreur
serait sans retour depuis l'interface.

- [ ] **Étape 1 : les messages**

Créer `src/app/evenements/types/messages.ts` :

```typescript
export const MESSAGE_LIBELLE_OBLIGATOIRE = "Le libellé du type est obligatoire."
export const MESSAGE_TYPE_EXISTE_DEJA = "Ce type d'événement existe déjà."
export const MESSAGE_ECHEC_TYPE = "Le type d'événement n'a pas pu être enregistré."
```

- [ ] **Étape 2 : les actions**

Créer `src/app/evenements/types/actions.ts` :

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { exigerAdministrateur } from '@/lib/securite/garde'
import { clientAdmin } from '@/lib/supabase/admin'
import {
  MESSAGE_ECHEC_TYPE,
  MESSAGE_LIBELLE_OBLIGATOIRE,
  MESSAGE_TYPE_EXISTE_DEJA,
} from './messages'

export type EtatTypeEvenement = { erreur: string | null }

// Discrimination sur `error.code`, JAMAIS sur le texte français du message : un doublon
// réel doit être annoncé franchement, mais tout autre échec ne doit pas laisser croire à
// un doublon qui n'en est pas un. Même principe que `creerGroupe`.
const CODE_VIOLATION_UNICITE = '23505'

export async function creerTypeEvenement(
  _etat: EtatTypeEvenement,
  donnees: FormData,
): Promise<EtatTypeEvenement> {
  await exigerAdministrateur()

  const libelle = String(donnees.get('libelle') ?? '').trim()
  if (libelle.length === 0) {
    return { erreur: MESSAGE_LIBELLE_OBLIGATOIRE }
  }
  const ordreBrut = String(donnees.get('ordre') ?? '').trim()
  const ordre = ordreBrut.length > 0 && Number.isInteger(Number(ordreBrut)) ? Number(ordreBrut) : 0

  const { error } = await clientAdmin().from('types_evenement').insert({ libelle, ordre })
  if (error) {
    console.error("creerTypeEvenement : échec de l'insertion", {
      libelle,
      ordre,
      code: error.code,
      details: error.details,
      message: error.message,
    })
    if (error.code === CODE_VIOLATION_UNICITE) {
      return { erreur: MESSAGE_TYPE_EXISTE_DEJA }
    }
    // RETOURNÉ, jamais levé : un `throw` ici perdrait son message en production (digest
    // React #441) et l'administrateur perdrait sa saisie.
    return { erreur: MESSAGE_ECHEC_TYPE }
  }

  revalidatePath('/evenements/types')
  // Les écrans qui affichent un libellé de type sont la liste et la fiche d'un événement.
  // Le `type` est obligatoire sur un segment dynamique, et `/evenements` n'invalide PAS
  // `/evenements/[id]` : chacun se déclare.
  revalidatePath('/evenements')
  revalidatePath('/evenements/[id]', 'page')
  return { erreur: null }
}

export async function desactiverTypeEvenement(donnees: FormData): Promise<void> {
  await exigerAdministrateur()
  await basculerType(donnees, false)
}

/** Sans elle, désactiver un type par erreur serait sans retour depuis l'interface. */
export async function reactiverTypeEvenement(donnees: FormData): Promise<void> {
  await exigerAdministrateur()
  await basculerType(donnees, true)
}

async function basculerType(donnees: FormData, actif: boolean): Promise<void> {
  const id = donnees.get('id')
  if (typeof id !== 'string' || id.length === 0) {
    // Atteignable seulement par une requête forgée, jamais par l'interface. Journalisé
    // quand même : un cas qui ne devrait jamais arriver et qui arrive est un symptôme.
    console.error('basculerType : identifiant manquant dans le formulaire', { actif })
    return
  }

  // `.select('id')` puis vérification : une mise à jour qui ne touche aucune ligne ne
  // renvoie AUCUNE erreur, et le bouton aurait l'air d'avoir fonctionné.
  const { data, error } = await clientAdmin()
    .from('types_evenement')
    .update({ actif })
    .eq('id', id)
    .select('id')

  if (error || !data || data.length === 0) {
    // LEVÉE assumée ici, et c'est le seul endroit de cette tâche où elle l'est : ces deux
    // actions sont liées DIRECTEMENT à `<form action={...}>`, sans `useActionState`, donc
    // sans canal de retour vers l'écran. Il n'y a pas de message à perdre — seulement une
    // panne technique à rendre visible. Même choix que `basculerStatut`.
    throw new Error("Le type d'événement n'a pas pu être mis à jour : aucun type ne correspond.")
  }

  revalidatePath('/evenements/types')
  revalidatePath('/evenements')
  revalidatePath('/evenements/[id]', 'page')
}
```

- [ ] **Étape 3 : les deux composants clients**

Créer `src/app/evenements/types/formulaire-type.tsx` :

```typescript
'use client'

import { useActionState } from 'react'
import { creerTypeEvenement, type EtatTypeEvenement } from './actions'

const etatInitial: EtatTypeEvenement = { erreur: null }

export function FormulaireType() {
  const [etat, envoyer, enCours] = useActionState(creerTypeEvenement, etatInitial)

  return (
    <form action={envoyer} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium">Libellé</span>
          <input name="libelle" required className="rounded-md border border-neutral-300 px-3 py-2" />
        </label>
        <label className="flex w-24 flex-col gap-1.5">
          <span className="text-sm font-medium">Ordre</span>
          <input
            name="ordre"
            type="number"
            defaultValue={0}
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
        </label>
        <button
          type="submit"
          disabled={enCours}
          className="rounded-md bg-neutral-900 px-4 py-2 text-white disabled:opacity-50"
        >
          Ajouter
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

Créer `src/app/evenements/types/bouton-bascule-type.tsx` :

```typescript
'use client'

type Props = { libelle: string; actif: boolean }

/**
 * Confirmation avant bascule. Un type désactivé disparaît des NOUVELLES attributions mais
 * reste visible sur les événements passés (spec §7, même régime que les statuts) : la
 * confirmation le dit, sans quoi « désactiver » se lirait comme « supprimer ».
 */
export function BoutonBasculeType({ libelle, actif }: Props) {
  return (
    <button
      type="submit"
      onClick={(evenement) => {
        const texte = actif
          ? `Désactiver « ${libelle} » ? Il ne sera plus proposé pour un nouvel événement, mais restera affiché sur les événements passés.`
          : `Réactiver « ${libelle} » ?`
        if (!window.confirm(texte)) {
          evenement.preventDefault()
        }
      }}
      className="text-sm underline underline-offset-4"
    >
      {actif ? 'Désactiver' : 'Réactiver'}
    </button>
  )
}
```

- [ ] **Étape 4 : la page**

Créer `src/app/evenements/types/page.tsx` :

```typescript
import Link from 'next/link'
import { listerTypesEvenement } from '@/lib/donnees/evenements'
import { exigerAdministrateur } from '@/lib/securite/garde'
import { desactiverTypeEvenement, reactiverTypeEvenement } from './actions'
import { BoutonBasculeType } from './bouton-bascule-type'
import { FormulaireType } from './formulaire-type'

export default async function PageTypesEvenement() {
  // PREMIÈRE instruction. Spec §5.2, ligne « Créer statuts, groupes, antennes, types
  // d'événement » : administrateur seul.
  await exigerAdministrateur()

  const types = await listerTypesEvenement()

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/evenements" className="text-sm underline underline-offset-4">
        Retour aux évènements
      </Link>
      <h1 className="mt-4 mb-8 text-2xl font-semibold">Types d&apos;évènement</h1>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-medium">Ajouter un type</h2>
        <FormulaireType />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Catalogue</h2>
        {types.length === 0 ? (
          <p className="text-sm text-neutral-600">Aucun type pour le moment.</p>
        ) : (
          <ul className="divide-y divide-neutral-200">
            {types.map((type) => (
              <li key={type.id} className="flex items-center justify-between gap-4 py-3">
                <span className={type.actif ? '' : 'text-neutral-400'}>
                  {type.libelle}
                  {type.actif ? null : <span className="ml-2 text-xs">(désactivé)</span>}
                </span>
                <form action={type.actif ? desactiverTypeEvenement : reactiverTypeEvenement}>
                  <input type="hidden" name="id" value={type.id} />
                  <BoutonBasculeType libelle={type.libelle} actif={type.actif} />
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
```

- [ ] **Étape 5 : vérification manuelle depuis DEUX rôles**

```bash
npm run dev
```

1. Connecté **administrateur** : `/evenements/types` s'affiche, les quatre types amorcés
   sont là, l'ajout fonctionne, la désactivation puis la réactivation fonctionnent.
2. Ajouter un type au libellé **déjà pris** (« Webinaire ») : le message
   **`MESSAGE_TYPE_EXISTE_DEJA`** s'affiche à l'écran, **et la saisie n'est pas perdue**.
   Si l'écran bascule sur la page d'erreur générique, l'action **lève** au lieu de
   **retourner** : corriger.
3. Connecté **modérateur** : `/evenements/types` **redirige vers `/tableau-de-bord`**.
4. Connecté **compte simple** : idem.

Nettoyer les types créés à la main pendant ce contrôle — ils vivent en **production** :

```sql
delete from public.types_evenement where libelle like 'ZZ%';
```

- [ ] **Étape 6 : les six portes + le build de production**

Cette tâche introduit des **messages affichés**.

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls && npm run test:e2e && npm run build
```

```bash
npm run test:e2e:prod
```

```bash
git add src/app/evenements/types
git commit -m "feat: ecran catalogue des types d'evenement, administrateur seul"
```

---

### Task 17 : écran `/evenements` — liste paginée et création (D23, D75)

**Fichiers :**
- Créer : `src/app/evenements/page.tsx`
- Créer : `src/app/evenements/actions.ts`
- Créer : `src/app/evenements/champs.ts`
- Créer : `src/app/evenements/messages.ts`
- Créer : `src/app/evenements/formulaire-evenement.tsx`

**Interfaces :**
- Consomme : `listerEvenements()`, `typesEvenementActifs()`, `TAILLE_PAGE_EVENEMENTS`
  (T15) ; `periodeValide` (T14) ; `exigerProfilActif`,
  `estModerateurOuAdministrateur`, `exigerModerateurOuAdministrateur`.
- Produit dans `actions.ts` : `type EtatEvenement = { erreur: string | null }` ;
  `creerEvenement(_etat: EtatEvenement, donnees: FormData): Promise<EtatEvenement>`.
- Produit dans `champs.ts` (module **ordinaire**, **pas** `'use server'`) :
  `champOuNull(donnees: FormData, champ: string): string | null` ;
  `colonnesEvenementDepuisFormulaire(donnees: FormData): { erreur: string } |
  { colonnes: Record<string, string | null> }`.
- Produit dans `messages.ts` : `MESSAGE_TITRE_OBLIGATOIRE`, `MESSAGE_TYPE_OBLIGATOIRE`,
  `MESSAGE_DATE_DEBUT_OBLIGATOIRE`, `MESSAGE_PERIODE_INCOHERENTE`,
  `MESSAGE_ECHEC_EVENEMENT`, importables par les specs. Le composant
  `FormulaireEvenement`, réutilisé **tel quel** par la Task 18 pour l'édition.

## ⚠️ `champs.ts` EXISTE PARCE QU'UN FICHIER `'use server'` NE PEUT EXPORTER QUE DES FONCTIONS ASYNCHRONES

Next refuse au **build** — pas au `tsc` — l'export d'une fonction **synchrone** depuis un
module portant `'use server'` : « Only async functions are allowed to be exported in a
"use server" file ». `champOuNull` et `colonnesEvenementDepuisFormulaire` doivent être
**partagées avec la Task 18**, donc **exportées** : elles vivent dans un module ordinaire.
Les **types** (`export type EtatEvenement`), eux, sont **effacés à la compilation** et
restent légitimes dans `actions.ts` — c'est ce que fait déjà `src/app/statuts/actions.ts`.
Le reste du dépôt garde ses `champOuNull` **locaux et non exportés**, ce qui est la raison
pour laquelle ce piège ne s'y est encore jamais présenté.

**Consultation : tout compte actif. Création : modérateur ou administrateur (D23).** Le
bouton est rendu par `estModerateurOuAdministrateur` ; la **protection** est
`exigerModerateurOuAdministrateur`, première instruction de l'action.

**`periodeValide` est appelée AVANT l'écriture**, pour nommer le champ fautif. Le `check`
`evenements_periode_coherente` reste la barrière et son `23514` est **aussi** traduit —
sans quoi une divergence future entre les deux rendrait un message générique là où la base
sait exactement ce qui cloche.

- [ ] **Étape 1 : les messages**

Créer `src/app/evenements/messages.ts` :

```typescript
export const MESSAGE_TITRE_OBLIGATOIRE = "Le titre de l'évènement est obligatoire."
export const MESSAGE_TYPE_OBLIGATOIRE = "Choisissez un type d'évènement."
export const MESSAGE_DATE_DEBUT_OBLIGATOIRE = "La date de début est obligatoire."
export const MESSAGE_PERIODE_INCOHERENTE =
  "La date de fin ne peut pas précéder la date de début."
export const MESSAGE_ECHEC_EVENEMENT = "L'évènement n'a pas pu être enregistré."
```

- [ ] **Étape 2 : les champs partagés, dans un module ORDINAIRE**

Créer `src/app/evenements/champs.ts` — **sans** `'use server'` :

```typescript
import { periodeValide } from '@/lib/domaine/evenements'
import {
  MESSAGE_DATE_DEBUT_OBLIGATOIRE,
  MESSAGE_PERIODE_INCOHERENTE,
  MESSAGE_TITRE_OBLIGATOIRE,
  MESSAGE_TYPE_OBLIGATOIRE,
} from './messages'

/**
 * PAS de `'use server'` dans ce fichier, et c'est la seule raison de son existence : Next
 * refuse AU BUILD — pas au `tsc` — l'export d'une fonction SYNCHRONE depuis un module
 * `'use server'` (« Only async functions are allowed to be exported in a "use server"
 * file »). Ces deux fonctions doivent être partagées entre `creerEvenement` (ce dossier) et
 * `modifierEvenement` (`[id]/actions.ts`), donc exportées.
 *
 * PAS de `server-only` non plus : ces fonctions sont pures et ne touchent ni cookies ni clé
 * de service. Elles ne sont importées que par du code serveur aujourd'hui, mais rien ne
 * l'exige.
 */
export function champOuNull(donnees: FormData, champ: string): string | null {
  const valeur = donnees.get(champ)
  return typeof valeur === 'string' && valeur.trim().length > 0 ? valeur.trim() : null
}

/**
 * Colonnes communes à la création (Task 17) et à l'édition (Task 18), et leur validation.
 * Extraite pour la même raison que `filtrerMembresActifs` l'a été en 1c : deux copies de
 * cette validation seraient deux occasions de les faire diverger, et la divergence ne se
 * verrait qu'au moment où le `check` de la base refuserait une écriture que l'écran avait
 * laissé passer.
 */
export function colonnesEvenementDepuisFormulaire(
  donnees: FormData,
): { erreur: string } | { colonnes: Record<string, string | null> } {
  const titre = champOuNull(donnees, 'titre')
  if (!titre) {
    return { erreur: MESSAGE_TITRE_OBLIGATOIRE }
  }
  const typeId = champOuNull(donnees, 'typeId')
  if (!typeId) {
    return { erreur: MESSAGE_TYPE_OBLIGATOIRE }
  }
  const dateDebut = champOuNull(donnees, 'dateDebut')
  const dateFin = champOuNull(donnees, 'dateFin')

  // Contrôle AMONT (design §6) : nomme le champ fautif AVANT d'écrire. Le `check`
  // `evenements_periode_coherente` reste la barrière ; celui-ci explique.
  const motif = periodeValide(dateDebut, dateFin)
  if (motif === 'date_debut_manquante') {
    return { erreur: MESSAGE_DATE_DEBUT_OBLIGATOIRE }
  }
  if (motif === 'periode_incoherente') {
    return { erreur: MESSAGE_PERIODE_INCOHERENTE }
  }

  return {
    colonnes: {
      titre,
      type_id: typeId,
      date_debut: dateDebut,
      date_fin: dateFin,
      heure_debut: champOuNull(donnees, 'heureDebut'),
      lieu: champOuNull(donnees, 'lieu'),
      description: champOuNull(donnees, 'description'),
    },
  }
}
```

- [ ] **Étape 3 : l'action de création**

Créer `src/app/evenements/actions.ts` :

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { exigerModerateurOuAdministrateur } from '@/lib/securite/garde'
import { clientAdmin } from '@/lib/supabase/admin'
import { colonnesEvenementDepuisFormulaire } from './champs'
import { MESSAGE_ECHEC_EVENEMENT, MESSAGE_PERIODE_INCOHERENTE } from './messages'

// SEUL export non fonctionnel autorisé ici : un TYPE est effacé à la compilation. Toute
// fonction exportée d'un module `'use server'` doit être ASYNCHRONE — c'est pourquoi
// `champOuNull` et `colonnesEvenementDepuisFormulaire` vivent dans `./champs`.
export type EtatEvenement = { erreur: string | null }

const CODE_VIOLATION_CHECK = '23514'

/**
 * D23 — création ouverte au MODÉRATEUR autant qu'à l'administrateur. La spécification
 * maîtresse a longtemps dit « l'admin crée l'événement » au §6 ; c'était faux depuis
 * l'amendement du 2026-08-12, et le texte a été corrigé le 2026-08-14 (D54).
 */
export async function creerEvenement(
  _etat: EtatEvenement,
  donnees: FormData,
): Promise<EtatEvenement> {
  const profil = await exigerModerateurOuAdministrateur()

  const resultat = colonnesEvenementDepuisFormulaire(donnees)
  if ('erreur' in resultat) {
    return { erreur: resultat.erreur }
  }

  const { data, error } = await clientAdmin()
    .from('evenements')
    .insert({ ...resultat.colonnes, cree_par: profil.id })
    .select('id')
    .single()

  if (error || !data) {
    console.error("creerEvenement : échec de l'insertion", {
      code: error?.code,
      details: error?.details,
      message: error?.message,
    })
    // Filet si le contrôle amont et le `check` divergeaient un jour : la base sait
    // exactement ce qui cloche, et le message le dit. Discrimination sur `error.code`,
    // jamais sur le texte français.
    if (error?.code === CODE_VIOLATION_CHECK) {
      return { erreur: MESSAGE_PERIODE_INCOHERENTE }
    }
    return { erreur: MESSAGE_ECHEC_EVENEMENT }
  }

  revalidatePath('/evenements')
  // `redirect()` lève une exception de CONTRÔLE que Next reconnaît : elle DOIT traverser
  // sans être attrapée, et elle n'est donc JAMAIS dans un `try`. Elle est la dernière
  // instruction de cette fonction.
  redirect(`/evenements/${data.id}`)
}
```

- [ ] **Étape 4 : le formulaire, partagé avec la Task 18**

Créer `src/app/evenements/formulaire-evenement.tsx` :

```typescript
'use client'

import { useActionState } from 'react'
import { useId } from 'react'
import type { TypeEvenement } from '@/lib/donnees/evenements'
import type { EtatEvenement } from './actions'

export type ValeursEvenement = {
  titre: string
  typeId: string
  dateDebut: string
  dateFin: string
  heureDebut: string
  lieu: string
  description: string
}

const VALEURS_VIDES: ValeursEvenement = {
  titre: '',
  typeId: '',
  dateDebut: '',
  dateFin: '',
  heureDebut: '',
  lieu: '',
  description: '',
}

type Props = {
  action: (etat: EtatEvenement, donnees: FormData) => Promise<EtatEvenement>
  types: TypeEvenement[]
  libelleBouton: string
  valeurs?: ValeursEvenement
  /** Champs cachés supplémentaires — l'identifiant de l'évènement, pour l'édition. */
  champsCaches?: Record<string, string>
  /**
   * Type COURANT de l'évènement édité, même s'il est désactivé. `types` ne contient que
   * les types ACTIFS (un type désactivé disparaît des NOUVELLES attributions, spec §7) :
   * sans cette option, éditer un évènement dont le type a été désactivé depuis
   * BASCULERAIT SILENCIEUSEMENT son type vers le premier de la liste au premier
   * enregistrement.
   */
  typeCourant?: { id: string; libelle: string } | null
}

const etatInitial: EtatEvenement = { erreur: null }

export function FormulaireEvenement({
  action,
  types,
  libelleBouton,
  valeurs = VALEURS_VIDES,
  champsCaches,
  typeCourant,
}: Props) {
  const [etat, envoyer, enCours] = useActionState(action, etatInitial)
  const prefixe = useId()
  const idDescription = `${prefixe}-description`
  const idAideDescription = `${prefixe}-aide-description`

  const typeDejaListe = typeCourant ? types.some((t) => t.id === typeCourant.id) : true
  const optionsType = typeDejaListe || !typeCourant ? types : [...types, { ...typeCourant, actif: false, ordre: 0 }]

  return (
    <form action={envoyer} className="flex flex-col gap-4">
      {Object.entries(champsCaches ?? {}).map(([nom, valeur]) => (
        <input key={nom} type="hidden" name={nom} value={valeur} />
      ))}

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Titre</span>
        <input
          name="titre"
          required
          defaultValue={valeurs.titre}
          className="rounded-md border border-neutral-300 px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Type</span>
        <select
          name="typeId"
          required
          defaultValue={valeurs.typeId}
          className="rounded-md border border-neutral-300 px-3 py-2"
        >
          <option value="" disabled>
            Choisir…
          </option>
          {optionsType.map((type) => (
            <option key={type.id} value={type.id}>
              {type.libelle}
              {type.actif ? '' : ' (désactivé)'}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-wrap gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Date de début</span>
          <input
            name="dateDebut"
            type="date"
            required
            defaultValue={valeurs.dateDebut}
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Date de fin</span>
          <input
            name="dateFin"
            type="date"
            defaultValue={valeurs.dateFin}
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Heure de début</span>
          <input
            name="heureDebut"
            type="time"
            defaultValue={valeurs.heureDebut}
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Lieu</span>
        <input
          name="lieu"
          defaultValue={valeurs.lieu}
          className="rounded-md border border-neutral-300 px-3 py-2"
        />
      </label>

      {/*
        Champ AVEC aide : `htmlFor` explicite, aide SORTIE du label et rattachée par
        `aria-describedby`. Une aide laissée dans le `<label>` serait concaténée au nom
        accessible du champ.
      */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor={idDescription} className="text-sm font-medium">
          Description
        </label>
        <textarea
          id={idDescription}
          name="description"
          rows={3}
          defaultValue={valeurs.description}
          aria-describedby={idAideDescription}
          className="rounded-md border border-neutral-300 px-3 py-2"
        />
        <span id={idAideDescription} className="text-xs text-neutral-500">
          Visible de tous les comptes actifs.
        </span>
      </div>

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={enCours}
          className="rounded-md bg-neutral-900 px-4 py-2 text-white disabled:opacity-50"
        >
          {libelleBouton}
        </button>
        {etat.erreur ? (
          <p role="alert" className="text-sm text-red-600">
            {etat.erreur}
          </p>
        ) : null}
      </div>
    </form>
  )
}
```

- [ ] **Étape 5 : la page**

Créer `src/app/evenements/page.tsx` :

```typescript
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { listerEvenements, listerTypesEvenement, typesEvenementActifs } from '@/lib/donnees/evenements'
import { TAILLE_PAGE_EVENEMENTS } from '@/lib/donnees/evenements-lots'
import { formaterDateSeule } from '@/lib/format/date'
import { estModerateurOuAdministrateur, exigerProfilActif } from '@/lib/securite/garde'
import { creerEvenement } from './actions'
import { FormulaireEvenement } from './formulaire-evenement'

export default async function PageEvenements({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; typeId?: string }>
}) {
  // Consultation : TOUT COMPTE ACTIF (spec §5.3 : `evenements` est lisible de tout compte
  // actif, « nécessaire pour afficher les séminaires assistés sur une fiche »).
  await exigerProfilActif()

  const { page: pageBrute, typeId } = await searchParams
  const page = Math.max(1, Number(pageBrute ?? '1') || 1)

  const [{ lignes, total }, typesActifs, tousTypes, peutGerer] = await Promise.all([
    listerEvenements({ page, typeId }),
    typesEvenementActifs(),
    listerTypesEvenement(),
    // DÉCIDE D'AFFICHER, ne protège rien : la protection est
    // `exigerModerateurOuAdministrateur`, première instruction de `creerEvenement`.
    estModerateurOuAdministrateur(),
  ])

  const pages = Math.max(1, Math.ceil(total / TAILLE_PAGE_EVENEMENTS))
  if (page > pages) {
    // Page hors bornes (signet périmé, résultat qui a rétréci) : rediriger vers la
    // dernière page réelle plutôt que d'afficher une liste vide qui se lirait comme
    // « aucun évènement ». Même traitement que l'annuaire.
    const parametres = new URLSearchParams()
    parametres.set('page', String(pages))
    if (typeId) parametres.set('typeId', typeId)
    redirect(`/evenements?${parametres.toString()}`)
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/tableau-de-bord" className="text-sm underline underline-offset-4">
        Retour au tableau de bord
      </Link>

      <header className="mt-4 mb-8 flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold">Évènements</h1>
        {peutGerer ? (
          <Link href="/evenements/a-traiter" className="text-sm underline underline-offset-4">
            Participants à traiter
          </Link>
        ) : null}
      </header>

      {/* Filtre par type : formulaire GET, sans JavaScript, sans Server Action. */}
      <form method="get" className="mb-8 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Type</span>
          <select
            name="typeId"
            defaultValue={typeId ?? ''}
            className="rounded-md border border-neutral-300 px-3 py-2"
          >
            <option value="">Tous</option>
            {tousTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.libelle}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="rounded-md border border-neutral-300 px-3 py-2 text-sm">
          Filtrer
        </button>
      </form>

      {peutGerer ? (
        <section className="mb-10">
          <details>
            <summary className="cursor-pointer text-sm underline underline-offset-4">
              Nouvel évènement
            </summary>
            <div className="mt-4">
              <FormulaireEvenement
                action={creerEvenement}
                types={typesActifs}
                libelleBouton="Créer"
              />
            </div>
          </details>
          <p className="mt-3 text-sm text-neutral-500">
            <Link href="/evenements/types" className="underline underline-offset-4">
              Gérer les types
            </Link>{' '}
            — réservé aux administrateurs.
          </p>
        </section>
      ) : null}

      <p className="mb-3 text-sm text-neutral-500">
        {total} évènement{total > 1 ? 's' : ''}
      </p>

      {lignes.length === 0 ? (
        <p className="text-sm text-neutral-600">Aucun évènement pour le moment.</p>
      ) : (
        <ul className="divide-y divide-neutral-200">
          {lignes.map((evenement) => (
            <li key={evenement.id}>
              <Link
                href={`/evenements/${evenement.id}`}
                className="flex flex-wrap items-center justify-between gap-4 py-3"
              >
                <span>
                  {evenement.titre}
                  <span className="text-neutral-500"> · {evenement.typeLibelle}</span>
                </span>
                <span className="text-sm text-neutral-500">
                  {formaterDateSeule(evenement.dateDebut)}
                  {evenement.dateFin ? ` — ${formaterDateSeule(evenement.dateFin)}` : ''}
                  {evenement.lieu ? ` · ${evenement.lieu}` : ''}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 ? (
        <nav className="mt-6 flex items-center gap-4 text-sm">
          {page > 1 ? (
            <Link
              href={`/evenements?page=${page - 1}${typeId ? `&typeId=${typeId}` : ''}`}
              className="underline underline-offset-4"
            >
              Page précédente
            </Link>
          ) : null}
          <span className="text-neutral-500">
            Page {page} sur {pages}
          </span>
          {page < pages ? (
            <Link
              href={`/evenements?page=${page + 1}${typeId ? `&typeId=${typeId}` : ''}`}
              className="underline underline-offset-4"
            >
              Page suivante
            </Link>
          ) : null}
        </nav>
      ) : null}
    </main>
  )
}
```

- [ ] **Étape 6 : vérification manuelle depuis TROIS rôles**

```bash
npm run dev
```

1. **Compte simple** : `/evenements` s'affiche, la liste est visible, **le bloc « Nouvel
   évènement » et le lien « Participants à traiter » sont ABSENTS**.
2. **Modérateur** : le bloc « Nouvel évènement » est présent, la création fonctionne et
   **redirige** vers `/evenements/<id>`.
3. **Administrateur** : idem, plus le lien « Gérer les types ».
4. Créer un évènement avec une **date de fin antérieure** à la date de début : le message
   `MESSAGE_PERIODE_INCOHERENTE` s'affiche **à l'écran**, la saisie est conservée.

Nettoyer les évènements créés à la main (base de **production**) :

```sql
delete from public.evenements where titre like 'ZZ%';
```

- [ ] **Étape 7 : les six portes + le build de production**

⚠️ **`npm run build` est la SEULE porte qui attrape un export synchrone depuis un module
`'use server'`** — `npx tsc --noEmit` le laisse passer. Si le build échoue sur « Only async
functions are allowed to be exported in a "use server" file », c'est que `champOuNull` ou
`colonnesEvenementDepuisFormulaire` a glissé dans `actions.ts` : les remettre dans
`champs.ts`.

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls && npm run test:e2e && npm run build
```

```bash
npm run test:e2e:prod
```

```bash
git add src/app/evenements/page.tsx src/app/evenements/actions.ts src/app/evenements/champs.ts src/app/evenements/messages.ts src/app/evenements/formulaire-evenement.tsx
git commit -m "feat: liste paginee des evenements et creation (D23, D75)"
```

---

### Task 18 : écran `/evenements/[id]` — en-tête et édition (D23)

**Fichiers :**
- Créer : `src/app/evenements/[id]/page.tsx`
- Créer : `src/app/evenements/[id]/actions.ts`
- Créer : `src/app/evenements/[id]/messages.ts`

**Interfaces :**
- Consomme : `evenementParId()`, `typesEvenementActifs()` (T15) ;
  `colonnesEvenementDepuisFormulaire` et `champOuNull` **depuis `../champs`** (T17, module
  ordinaire — **jamais depuis `../actions`**, qui est `'use server'` et ne peut exporter
  que des fonctions asynchrones) ; `EtatEvenement` et `FormulaireEvenement` (T17) ;
  `exigerModerateurOuAdministrateur`,
  `estModerateurOuAdministrateur`, `exigerProfilActif`.
- Produit : `modifierEvenement(_etat: EtatEvenement, donnees: FormData):
  Promise<EtatEvenement>` ; le message `MESSAGE_EVENEMENT_INTROUVABLE`. **La page rend un
  emplacement `{/* Section participants — Task 19 */}` que la Task 19 remplira** ; les deux
  tâches sont séparées parce qu'un relecteur peut légitimement accepter l'en-tête et
  rejeter la section participants, dont les enjeux d'accès sont d'un tout autre ordre.

**La consultation de l'en-tête est ouverte à TOUT COMPTE ACTIF ; l'édition au modérateur
et à l'administrateur (D23).**

- [ ] **Étape 1 : les messages**

Créer `src/app/evenements/[id]/messages.ts` :

```typescript
export const MESSAGE_EVENEMENT_INTROUVABLE = "Cet évènement n'existe plus."
```

- [ ] **Étape 2 : l'action d'édition**

Créer `src/app/evenements/[id]/actions.ts` :

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { exigerModerateurOuAdministrateur } from '@/lib/securite/garde'
import { clientAdmin } from '@/lib/supabase/admin'
import type { EtatEvenement } from '../actions'
// `champOuNull` et `colonnesEvenementDepuisFormulaire` viennent de `../champs`, un module
// ORDINAIRE : `../actions` porte `'use server'` et ne peut exporter que des fonctions
// ASYNCHRONES (échec au `npm run build`, pas au `tsc`). Le TYPE `EtatEvenement`, lui, est
// effacé à la compilation et reste importable de `../actions`.
import { champOuNull, colonnesEvenementDepuisFormulaire } from '../champs'
import { MESSAGE_ECHEC_EVENEMENT, MESSAGE_PERIODE_INCOHERENTE } from '../messages'
import { MESSAGE_EVENEMENT_INTROUVABLE } from './messages'

const CODE_VIOLATION_CHECK = '23514'

/**
 * Édition d'un évènement, ouverte au modérateur autant qu'à l'administrateur (D23).
 *
 * La MÊME validation que la création (`colonnesEvenementDepuisFormulaire`, Task 17) :
 * deux copies seraient deux occasions de les faire diverger, et la divergence ne se
 * verrait qu'au moment où le `check` de la base refuserait une écriture que l'écran avait
 * laissé passer.
 */
export async function modifierEvenement(
  _etat: EtatEvenement,
  donnees: FormData,
): Promise<EtatEvenement> {
  await exigerModerateurOuAdministrateur()

  const evenementId = champOuNull(donnees, 'evenementId')
  if (!evenementId) {
    console.error("modifierEvenement : identifiant de l'évènement manquant dans le formulaire")
    return { erreur: MESSAGE_ECHEC_EVENEMENT }
  }

  const resultat = colonnesEvenementDepuisFormulaire(donnees)
  if ('erreur' in resultat) {
    return { erreur: resultat.erreur }
  }

  const { data, error } = await clientAdmin()
    .from('evenements')
    .update(resultat.colonnes)
    .eq('id', evenementId)
    .select('id')

  if (error) {
    console.error('modifierEvenement : échec de la mise à jour', {
      evenementId,
      code: error.code,
      details: error.details,
      message: error.message,
    })
    if (error.code === CODE_VIOLATION_CHECK) {
      return { erreur: MESSAGE_PERIODE_INCOHERENTE }
    }
    return { erreur: MESSAGE_ECHEC_EVENEMENT }
  }
  // Une mise à jour qui ne touche AUCUNE ligne ne renvoie AUCUNE erreur : sans ce contrôle,
  // un identifiant périmé (évènement supprimé dans un autre onglet, requête forgée)
  // produirait un succès apparent.
  if (!data || data.length === 0) {
    console.error('modifierEvenement : aucune ligne mise à jour', { evenementId })
    return { erreur: MESSAGE_EVENEMENT_INTROUVABLE }
  }

  revalidatePath('/evenements')
  revalidatePath(`/evenements/${evenementId}`)
  // AUCUN `redirect()` ici : on reste sur la fiche, et `useActionState` conserve son état.
  return { erreur: null }
}
```

- [ ] **Étape 3 : la page**

Créer `src/app/evenements/[id]/page.tsx` :

```typescript
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { evenementParId, typesEvenementActifs } from '@/lib/donnees/evenements'
import { formaterDateSeule } from '@/lib/format/date'
import { estModerateurOuAdministrateur, exigerProfilActif } from '@/lib/securite/garde'
import { FormulaireEvenement } from '../formulaire-evenement'
import { modifierEvenement } from './actions'

export default async function PageEvenement({ params }: { params: Promise<{ id: string }> }) {
  // Consultation de l'en-tête : TOUT COMPTE ACTIF.
  await exigerProfilActif()
  const { id } = await params

  const evenement = await evenementParId(id)
  if (!evenement) {
    notFound()
  }

  const [types, peutGerer] = await Promise.all([
    typesEvenementActifs(),
    estModerateurOuAdministrateur(),
  ])

  const lignes: Array<[string, string | null]> = [
    ['Type', evenement.typeLibelle],
    ['Début', formaterDateSeule(evenement.dateDebut)],
    ['Fin', evenement.dateFin ? formaterDateSeule(evenement.dateFin) : null],
    // `heure_debut` est une colonne `time`, sérialisée `HH:MM:SS` par PostgREST. Affichée
    // telle quelle en la rognant aux minutes : la passer par `formaterDateHeure`
    // supposerait un instant, ce que D56 refuse précisément de faire.
    ['Heure', evenement.heureDebut ? evenement.heureDebut.slice(0, 5) : null],
    ['Lieu', evenement.lieu],
  ]

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/evenements" className="text-sm underline underline-offset-4">
        Retour aux évènements
      </Link>

      <h1 className="mt-4 mb-6 text-2xl font-semibold">{evenement.titre}</h1>

      <dl className="divide-y divide-neutral-200">
        {lignes.map(([intitule, valeur]) => (
          <div key={intitule} className="flex justify-between gap-4 py-3">
            <dt className="text-sm text-neutral-500">{intitule}</dt>
            <dd className="text-sm">{valeur ?? '—'}</dd>
          </div>
        ))}
      </dl>

      {evenement.description ? (
        <p className="mt-6 text-sm whitespace-pre-line">{evenement.description}</p>
      ) : null}

      {peutGerer ? (
        <section className="mt-10">
          <details>
            <summary className="cursor-pointer text-sm underline underline-offset-4">
              Modifier l&apos;évènement
            </summary>
            <div className="mt-4">
              <FormulaireEvenement
                action={modifierEvenement}
                types={types}
                libelleBouton="Enregistrer"
                champsCaches={{ evenementId: evenement.id }}
                valeurs={{
                  titre: evenement.titre,
                  typeId: evenement.typeId,
                  dateDebut: evenement.dateDebut,
                  dateFin: evenement.dateFin ?? '',
                  heureDebut: evenement.heureDebut ? evenement.heureDebut.slice(0, 5) : '',
                  lieu: evenement.lieu ?? '',
                  description: evenement.description ?? '',
                }}
                // Le type COURANT même s'il a été désactivé depuis : sans lui, le `select`
                // ne le proposerait pas et le premier enregistrement BASCULERAIT
                // SILENCIEUSEMENT l'évènement vers un autre type. Un type désactivé
                // disparaît des NOUVELLES attributions, pas de l'existant (spec §7).
                typeCourant={{ id: evenement.typeId, libelle: evenement.typeLibelle }}
              />
            </div>
          </details>
        </section>
      ) : null}

      {/*
        SECTION PARTICIPANTS — livrée par la Task 19.
        ELLE NE SE VIDE PAS PAR RLS, ELLE NE SE REND PAS DU TOUT hors modérateur et
        administrateur. Un compte ordinaire qui lirait `participations` sous RLS obtiendrait
        ZÉRO ligne : un évènement à cent participants lui paraîtrait DÉSERT, ce qui est un
        mensonge et non une protection. C'est le pendant exact du mode de défaillance de
        D71, dans l'autre sens.
      */}
    </main>
  )
}
```

- [ ] **Étape 4 : vérification manuelle depuis TROIS rôles**

1. **Compte simple** : l'en-tête s'affiche, **le bloc « Modifier » est absent**.
2. **Modérateur** : le bloc « Modifier » est présent, l'enregistrement fonctionne.
3. **Administrateur** : idem.
4. **Le cas qui compte** : désactiver le type d'un évènement existant depuis
   `/evenements/types`, revenir sur sa fiche, ouvrir « Modifier », **constater que le type
   courant est toujours sélectionné** (mention « (désactivé) »), enregistrer sans y
   toucher, et **relire le type en base** :

```sql
select e.titre, t.libelle from public.evenements e join public.types_evenement t on t.id = e.type_id
where e.titre = '<TITRE_TESTE>';
```

**Attendu : le type est inchangé.** S'il a basculé, `typeCourant` n'est pas transmis.

- [ ] **Étape 5 : les six portes + le build de production**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls && npm run test:e2e && npm run build
```

```bash
npm run test:e2e:prod
```

```bash
git add src/app/evenements/[id]/page.tsx src/app/evenements/[id]/actions.ts src/app/evenements/[id]/messages.ts
git commit -m "feat: fiche d'un evenement, en-tete et edition (D23)"
```

---

### Task 19 : section participants de `/evenements/[id]` (D76, D77, D78)

**Fichiers :**
- Créer : `src/app/evenements/[id]/participants-actions.ts`
- Créer : `src/app/evenements/[id]/champs-desirs.tsx`
- Créer : `src/app/evenements/[id]/participants.tsx`
- Créer : `src/app/evenements/[id]/formulaire-participant-externe.tsx`
- Modifier : `src/app/evenements/[id]/messages.ts` (T18)
- Modifier : `src/app/evenements/[id]/page.tsx` (T18)

**`champs-desirs.tsx` est un fichier À PART, et pas par goût du découpage.** Les trois
formulaires de cet écran partagent les trois cases de désir et la note. Les loger dans
`participants.tsx` créerait un **cycle d'imports** avec
`formulaire-participant-externe.tsx`, que `participants.tsx` importe déjà : les cycles ES
« fonctionnent » jusqu'au jour où l'ordre d'évaluation change et rend un export
`undefined` au montage. Un troisième fichier le rend impossible.

**Interfaces :**
- Consomme : `participantsDEvenement()`, `TAILLE_PAGE_PARTICIPANTS`,
  `type ParticipantLigne` (T15) ; `SelecteurMembre` (1c,
  `src/app/membres/selecteur-membre.tsx`) ; `exigerModerateurOuAdministrateur`,
  `estModerateurOuAdministrateur`.
- Produit : `type EtatParticipation = { erreur: string | null }` ;
  `ajouterParticipantMembre(_etat, donnees): Promise<EtatParticipation>` ;
  `ajouterParticipantExterne(_etat, donnees): Promise<EtatParticipation>` ;
  `modifierParticipation(_etat, donnees): Promise<EtatParticipation>` ;
  `supprimerParticipation(_etat, donnees): Promise<EtatParticipation>` ; les messages
  `MESSAGE_PARTICIPANT_MANQUANT`, `MESSAGE_NOM_EXTERNE_OBLIGATOIRE`,
  `MESSAGE_PARTICIPANT_DEJA_INSCRIT`, `MESSAGE_PARTICIPATION_INTROUVABLE`,
  `MESSAGE_ECHEC_PARTICIPATION`, importables par les specs.

## ⚠️ LA SECTION NE SE VIDE PAS PAR RLS. ELLE NE SE REND PAS DU TOUT.

Un compte ordinaire qui atteindrait `/evenements/[id]` lit `participations` sous RLS et
obtient **zéro ligne** — un évènement à cent participants lui paraîtrait **désert**, ce qui
est un **mensonge** et non une protection. L'écran **teste le rôle** et ne rend pas la
section. C'est le pendant exact du mode de défaillance de D71, dans l'autre sens : **une
lecture vidée par la RLS ne doit jamais être affichée comme un résultat.** Et pour la même
raison, `participantsDEvenement` n'est **pas appelée du tout** hors modérateur et
administrateur : appeler puis ne pas afficher laisserait la lecture vide se glisser dans un
compteur ou un « aucun participant » un jour prochain.

**D76 — aucun composant de recherche nouveau.** `SelecteurMembre` (recherche serveur
bornée, 1c) pour les membres actifs, plus un formulaire de création d'externe **à la
volée** sur le même écran. Le pointage AEL combine **deux** mécanismes (D47) parce qu'il
précharge la liste des antennes ciblées ; un évènement n'a **pas d'antenne ciblée**, donc
rien à précharger. Le couple « choisir une fiche **ou** saisir un nom libre » a déjà son
patron dans le projet — `champ-intervenant.tsx` (phase 3) — et c'est **celui-là** qui est
décalqué.

**D77 — une participation est modifiable après coup** (les trois désirs, la note), par le
modérateur et l'administrateur. Un désir se recueille souvent **après** l'évènement, dans
une conversation ; le figer obligerait à supprimer puis resaisir, donc à **perdre
`saisi_par` et `saisi_le`**.

**D78 — une participation saisie par erreur se SUPPRIME ; il n'y a pas d'état
« annulée ».** C'est **le seul geste destructif de la phase**. Le projet archive et ne
supprime jamais — mais une participation n'est pas une **fiche**, c'est une
**déclaration**, et une déclaration fausse laissée en place **falsifie les étiquettes de
séminaires d'un membre innocent**, visibles de toute l'équipe par D2. **Une participation
dont l'externe a été converti reste supprimable** : rien ne justifierait qu'une erreur
devienne indélébile parce qu'elle a été suivie d'une conversion.

**Le doublon n'est PAS évité en regardant la liste**, il est **refusé** par les index
uniques partiels de D58 (`23505`) — une **garantie**, pas une vigilance. C'est aussi
pourquoi la liste peut être paginée sans risque (D75).

- [ ] **Étape 1 : compléter les messages**

Ajouter à `src/app/evenements/[id]/messages.ts` :

```typescript

export const MESSAGE_PARTICIPANT_MANQUANT =
  "Choisissez d'abord un membre dans le champ de recherche."
export const MESSAGE_NOM_EXTERNE_OBLIGATOIRE = "Le nom du participant externe est obligatoire."
export const MESSAGE_PARTICIPANT_DEJA_INSCRIT =
  "Cette personne est déjà inscrite à cet évènement."
export const MESSAGE_PARTICIPATION_INTROUVABLE = "Cette participation n'existe plus."
export const MESSAGE_ECHEC_PARTICIPATION = "La participation n'a pas pu être enregistrée."
```

- [ ] **Étape 2 : les quatre actions**

Créer `src/app/evenements/[id]/participants-actions.ts` :

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { exigerModerateurOuAdministrateur } from '@/lib/securite/garde'
import { clientAdmin } from '@/lib/supabase/admin'
import {
  MESSAGE_ECHEC_PARTICIPATION,
  MESSAGE_NOM_EXTERNE_OBLIGATOIRE,
  MESSAGE_PARTICIPANT_DEJA_INSCRIT,
  MESSAGE_PARTICIPANT_MANQUANT,
  MESSAGE_PARTICIPATION_INTROUVABLE,
} from './messages'

export type EtatParticipation = { erreur: string | null }

// Discrimination sur `error.code`, jamais sur le texte français. `23505` est le code du
// unique_violation levé par les DEUX index partiels de D58 — participations_membre_unique
// et participations_externe_unique. Le message est le même dans les deux cas parce que le
// FAIT est le même : cette personne est déjà inscrite.
const CODE_VIOLATION_UNICITE = '23505'

function champOuNull(donnees: FormData, champ: string): string | null {
  const valeur = donnees.get(champ)
  return typeof valeur === 'string' && valeur.trim().length > 0 ? valeur.trim() : null
}

/** Les trois désirs et la note, lus d'un formulaire. Une case non cochée est ABSENTE. */
function desirsDepuisFormulaire(donnees: FormData) {
  return {
    desir_mentorat_academique: donnees.get('desirMentoratAcademique') === 'on',
    desir_suivi_spirituel: donnees.get('desirSuiviSpirituel') === 'on',
    desir_cpeap: donnees.get('desirCpeap') === 'on',
    note: champOuNull(donnees, 'note'),
  }
}

/** Ajoute un MEMBRE actif comme participant (D76). */
export async function ajouterParticipantMembre(
  _etat: EtatParticipation,
  donnees: FormData,
): Promise<EtatParticipation> {
  const profil = await exigerModerateurOuAdministrateur()

  const evenementId = champOuNull(donnees, 'evenementId')
  if (!evenementId) {
    console.error('ajouterParticipantMembre : identifiant de l évènement manquant')
    return { erreur: MESSAGE_ECHEC_PARTICIPATION }
  }
  const membreId = champOuNull(donnees, 'membreId')
  if (!membreId) {
    // Atteignable par une soumission sans JavaScript : le bouton n'est désactivé que côté
    // client tant qu'aucun membre n'est choisi. Message dédié, pas le générique.
    return { erreur: MESSAGE_PARTICIPANT_MANQUANT }
  }

  const { error } = await clientAdmin().from('participations').insert({
    evenement_id: evenementId,
    membre_id: membreId,
    ...desirsDepuisFormulaire(donnees),
    saisi_par: profil.id,
  })

  if (error) {
    console.error('ajouterParticipantMembre : échec de l insertion', {
      evenementId,
      membreId,
      code: error.code,
      details: error.details,
      message: error.message,
    })
    if (error.code === CODE_VIOLATION_UNICITE) {
      return { erreur: MESSAGE_PARTICIPANT_DEJA_INSCRIT }
    }
    return { erreur: MESSAGE_ECHEC_PARTICIPATION }
  }

  revalidatePath(`/evenements/${evenementId}`)
  // Une nouvelle participation peut faire apparaître une étiquette de séminaire sur une
  // fiche membre, et une ligne dans la liste « à traiter ».
  revalidatePath('/membres/[id]', 'page')
  revalidatePath('/evenements/a-traiter')
  return { erreur: null }
}

/**
 * Crée un participant EXTERNE à la volée et l'inscrit dans la foulée (D76).
 *
 * DEUX ÉCRITURES, NON ATOMIQUES, et c'est assumé — contrairement à la conversion (D65), où
 * l'atomicité est la raison d'être de la passerelle. La différence : ici, l'état
 * intermédiaire possible est un participant externe SANS participation, qui n'apparaît
 * dans AUCUN écran (la liste « à traiter » part des participations, la fiche d'évènement
 * aussi) et ne fausse RIEN. Là-bas, l'état intermédiaire était une fiche membre sans lien,
 * qui laissait le participant dans la liste « à traiter » alors qu'il avait déjà une fiche,
 * et un second clic créait un doublon. Une passerelle SQL ici ne protégerait donc de rien
 * de visible.
 *
 * Le nettoyage de l'orphelin est BEST-EFFORT et JOURNALISÉ, exactement comme
 * `creerDemandeSuivi` (2b) le fait pour sa fiche jetable.
 */
export async function ajouterParticipantExterne(
  _etat: EtatParticipation,
  donnees: FormData,
): Promise<EtatParticipation> {
  const profil = await exigerModerateurOuAdministrateur()

  const evenementId = champOuNull(donnees, 'evenementId')
  if (!evenementId) {
    console.error('ajouterParticipantExterne : identifiant de l évènement manquant')
    return { erreur: MESSAGE_ECHEC_PARTICIPATION }
  }
  const nom = champOuNull(donnees, 'nom')
  if (!nom) {
    return { erreur: MESSAGE_NOM_EXTERNE_OBLIGATOIRE }
  }

  const admin = clientAdmin()

  const { data: externe, error: erreurExterne } = await admin
    .from('participants_externes')
    .insert({
      nom,
      prenom: champOuNull(donnees, 'prenom'),
      telephone: champOuNull(donnees, 'telephone'),
      email: champOuNull(donnees, 'email'),
      ville: champOuNull(donnees, 'ville'),
      pays: champOuNull(donnees, 'pays'),
      cree_par: profil.id,
    })
    .select('id')
    .single()

  if (erreurExterne || !externe) {
    console.error('ajouterParticipantExterne : échec de la création du participant', {
      evenementId,
      code: erreurExterne?.code,
      message: erreurExterne?.message,
    })
    return { erreur: MESSAGE_ECHEC_PARTICIPATION }
  }

  const { error: erreurParticipation } = await admin.from('participations').insert({
    evenement_id: evenementId,
    participant_externe_id: externe.id,
    ...desirsDepuisFormulaire(donnees),
    saisi_par: profil.id,
  })

  if (erreurParticipation) {
    console.error('ajouterParticipantExterne : échec de l inscription, nettoyage du participant', {
      evenementId,
      participantExterneId: externe.id,
      code: erreurParticipation.code,
      message: erreurParticipation.message,
    })
    // Best-effort, journalisé : un participant externe sans aucune participation
    // n'apparaît dans aucun écran, mais le laisser serait un déchet silencieux en base de
    // production.
    const { error: erreurNettoyage } = await admin
      .from('participants_externes')
      .delete()
      .eq('id', externe.id)
      .is('converti_en_membre_id', null)
      .is('classe_le', null)
    if (erreurNettoyage) {
      console.error('ajouterParticipantExterne : le participant orphelin n a PAS été supprimé', {
        participantExterneId: externe.id,
        code: erreurNettoyage.code,
        message: erreurNettoyage.message,
      })
    }
    return { erreur: MESSAGE_ECHEC_PARTICIPATION }
  }

  revalidatePath(`/evenements/${evenementId}`)
  revalidatePath('/evenements/a-traiter')
  return { erreur: null }
}

/**
 * D77 — corrige les trois désirs et la note d'une participation existante.
 *
 * `saisi_par` et `saisi_le` NE SONT JAMAIS TOUCHÉS (D60) : ils portent l'origine.
 * `modifie_par` et `modifie_le` portent la dernière retouche. Confondre les deux ferait
 * perdre l'information que l'élargissement de D23 justifiait de garder.
 */
export async function modifierParticipation(
  _etat: EtatParticipation,
  donnees: FormData,
): Promise<EtatParticipation> {
  const profil = await exigerModerateurOuAdministrateur()

  const evenementId = champOuNull(donnees, 'evenementId')
  const participationId = champOuNull(donnees, 'participationId')
  if (!evenementId || !participationId) {
    console.error('modifierParticipation : champs manquants', { evenementId, participationId })
    return { erreur: MESSAGE_ECHEC_PARTICIPATION }
  }

  const { data, error } = await clientAdmin()
    .from('participations')
    .update({
      ...desirsDepuisFormulaire(donnees),
      modifie_par: profil.id,
      modifie_le: new Date().toISOString(),
    })
    .eq('id', participationId)
    .eq('evenement_id', evenementId)
    .select('id')

  if (error) {
    console.error('modifierParticipation : échec de la mise à jour', {
      participationId,
      code: error.code,
      details: error.details,
      message: error.message,
    })
    return { erreur: MESSAGE_ECHEC_PARTICIPATION }
  }
  // Une mise à jour qui ne touche aucune ligne ne renvoie AUCUNE erreur.
  if (!data || data.length === 0) {
    return { erreur: MESSAGE_PARTICIPATION_INTROUVABLE }
  }

  revalidatePath(`/evenements/${evenementId}`)
  revalidatePath('/evenements/a-traiter')
  return { erreur: null }
}

/**
 * D78 — SEUL GESTE DESTRUCTIF DE LA PHASE. Le projet archive et ne supprime jamais, mais
 * une participation n'est pas une fiche : c'est une DÉCLARATION, et une déclaration fausse
 * laissée en place FALSIFIE LES ÉTIQUETTES DE SÉMINAIRES D'UN MEMBRE INNOCENT, visibles de
 * toute l'équipe par D2. La supprimer efface aussi ses désirs, conséquence normale de
 * « cette ligne n'aurait pas dû exister ».
 *
 * Une participation dont l'externe a été CONVERTI reste supprimable : rien ne justifierait
 * qu'une erreur devienne indélébile parce qu'elle a été suivie d'une conversion. Aucune
 * contrainte ne s'y oppose — `participations` ne référence pas la conversion.
 */
export async function supprimerParticipation(
  _etat: EtatParticipation,
  donnees: FormData,
): Promise<EtatParticipation> {
  await exigerModerateurOuAdministrateur()

  const evenementId = champOuNull(donnees, 'evenementId')
  const participationId = champOuNull(donnees, 'participationId')
  if (!evenementId || !participationId) {
    console.error('supprimerParticipation : champs manquants', { evenementId, participationId })
    return { erreur: MESSAGE_ECHEC_PARTICIPATION }
  }

  const { data, error } = await clientAdmin()
    .from('participations')
    .delete()
    .eq('id', participationId)
    .eq('evenement_id', evenementId)
    .select('id')

  if (error) {
    console.error('supprimerParticipation : échec de la suppression', {
      participationId,
      code: error.code,
      details: error.details,
      message: error.message,
    })
    return { erreur: MESSAGE_ECHEC_PARTICIPATION }
  }
  // Une suppression qui ne touche aucune ligne ne renvoie AUCUNE erreur non plus.
  if (!data || data.length === 0) {
    return { erreur: MESSAGE_PARTICIPATION_INTROUVABLE }
  }

  revalidatePath(`/evenements/${evenementId}`)
  // Supprimer une participation peut faire DISPARAÎTRE une étiquette de séminaire et une
  // ligne de la liste « à traiter ».
  revalidatePath('/membres/[id]', 'page')
  revalidatePath('/evenements/a-traiter')
  return { erreur: null }
}
```

- [ ] **Étape 3 : les champs de désir, dans leur PROPRE fichier**

Créer `src/app/evenements/[id]/champs-desirs.tsx` :

```typescript
'use client'

/**
 * Les trois cases de désir plus la note, partagées par les TROIS formulaires de cet écran
 * (ajout d'un membre, ajout d'un externe, correction d'une ligne). Une seule définition :
 * trois copies seraient trois occasions de renommer un champ d'un seul côté, et un désir
 * silencieusement perdu ne se verrait sur AUCUN écran.
 *
 * FICHIER À PART, et pas par goût du découpage : dans `participants.tsx`, ce composant
 * créerait un cycle d'imports avec `formulaire-participant-externe.tsx`, que
 * `participants.tsx` importe déjà. Les cycles ES « fonctionnent » jusqu'au jour où l'ordre
 * d'évaluation change et rend un export `undefined` au montage.
 *
 * `prefixe` vient d'un `useId()` du parent : sans lui, trois instances du composant sur la
 * même page partageraient les mêmes `id`, et les `<label htmlFor>` désigneraient tous le
 * premier champ.
 */
export function ChampsDesirs({
  prefixe,
  valeurs,
}: {
  prefixe: string
  valeurs?: { mentorat: boolean; suivi: boolean; cpeap: boolean; note: string }
}) {
  const idNote = `${prefixe}-note`
  const idAideNote = `${prefixe}-aide-note`

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">Trois désirs</legend>
      <label className="flex items-center gap-2 text-sm">
        <input
          name="desirMentoratAcademique"
          type="checkbox"
          defaultChecked={valeurs?.mentorat ?? false}
        />
        Mentorat académique
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input name="desirSuiviSpirituel" type="checkbox" defaultChecked={valeurs?.suivi ?? false} />
        Suivi spirituel
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input name="desirCpeap" type="checkbox" defaultChecked={valeurs?.cpeap ?? false} />
        CPEAP
      </label>

      {/* Champ AVEC aide : `htmlFor` explicite, aide SORTIE du label et rattachée par
          `aria-describedby`. Une aide laissée dans le `<label>` serait concaténée au nom
          accessible du champ. */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor={idNote} className="text-sm font-medium">
          Note
        </label>
        <textarea
          id={idNote}
          name="note"
          rows={2}
          defaultValue={valeurs?.note ?? ''}
          aria-describedby={idAideNote}
          className="rounded-md border border-neutral-300 px-3 py-2"
        />
        <span id={idAideNote} className="text-xs text-neutral-500">
          Visible des seuls modérateurs et administrateurs.
        </span>
      </div>
    </fieldset>
  )
}
```

- [ ] **Étape 4 : le formulaire de création d'externe**

Créer `src/app/evenements/[id]/formulaire-participant-externe.tsx` :

```typescript
'use client'

import { useActionState, useId } from 'react'
import { ChampsDesirs } from './champs-desirs'
import { ajouterParticipantExterne, type EtatParticipation } from './participants-actions'

const etatInitial: EtatParticipation = { erreur: null }

/**
 * Création d'un participant externe À LA VOLÉE (D76). Décalque `champ-intervenant.tsx`
 * (phase 3) dans son intention — « choisir une fiche OU saisir quelqu'un qui n'en a pas » —
 * sans en reprendre la contrainte d'exclusivité : ici les deux gestes vivent dans DEUX
 * formulaires distincts, donc aucune exclusivité côté client n'est nécessaire. C'est la
 * contrainte `participations_une_seule_reference` (D59) qui la garantit en base, et elle
 * n'est jamais atteignable depuis cet écran.
 */
export function FormulaireParticipantExterne({ evenementId }: { evenementId: string }) {
  const [etat, envoyer, enCours] = useActionState(ajouterParticipantExterne, etatInitial)
  const prefixe = useId()

  return (
    <form action={envoyer} className="flex flex-col gap-3">
      <input type="hidden" name="evenementId" value={evenementId} />

      <div className="flex flex-wrap gap-3">
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium">Nom</span>
          <input name="nom" required className="rounded-md border border-neutral-300 px-3 py-2" />
        </label>
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium">Prénom</span>
          <input name="prenom" className="rounded-md border border-neutral-300 px-3 py-2" />
        </label>
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium">Téléphone</span>
          <input name="telephone" className="rounded-md border border-neutral-300 px-3 py-2" />
        </label>
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium">Courriel</span>
          <input name="email" type="email" className="rounded-md border border-neutral-300 px-3 py-2" />
        </label>
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium">Ville</span>
          <input name="ville" className="rounded-md border border-neutral-300 px-3 py-2" />
        </label>
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium">Pays</span>
          <input name="pays" className="rounded-md border border-neutral-300 px-3 py-2" />
        </label>
      </div>

      <ChampsDesirs prefixe={prefixe} />

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={enCours}
          className="self-start rounded-md bg-neutral-900 px-4 py-2 text-white disabled:opacity-50"
        >
          Ajouter ce participant externe
        </button>
        {etat.erreur ? (
          <p role="alert" className="text-sm text-red-600">
            {etat.erreur}
          </p>
        ) : null}
      </div>
    </form>
  )
}
```

- [ ] **Étape 5 : la section participants**

Créer `src/app/evenements/[id]/participants.tsx` :

```typescript
'use client'

import Link from 'next/link'
import { useActionState, useId, useState } from 'react'
import type { ParticipantLigne } from '@/lib/donnees/evenements-lots'
import type { MembreBref } from '@/lib/donnees/membres'
import { SelecteurMembre } from '@/app/membres/selecteur-membre'
import { ChampsDesirs } from './champs-desirs'
import { FormulaireParticipantExterne } from './formulaire-participant-externe'
import {
  ajouterParticipantMembre,
  modifierParticipation,
  supprimerParticipation,
  type EtatParticipation,
} from './participants-actions'

const etatInitial: EtatParticipation = { erreur: null }

function FormulaireAjoutMembre({ evenementId }: { evenementId: string }) {
  const [etat, envoyer, enCours] = useActionState(ajouterParticipantMembre, etatInitial)
  const [membre, setMembre] = useState<MembreBref | null>(null)
  const prefixe = useId()

  return (
    <form action={envoyer} className="flex flex-col gap-3">
      <input type="hidden" name="evenementId" value={evenementId} />
      {/* D76 — `SelecteurMembre` (1c) RÉUTILISÉ TEL QUEL, aucun composant de recherche
          nouveau. Recherche serveur bornée à 20 résultats, membres ACTIFS seulement. */}
      <SelecteurMembre
        nom="membreId"
        label="Membre de l'équipe"
        aide="Cherche parmi les membres actifs."
        valeur={membre}
        surChoix={setMembre}
        exclureId={null}
      />
      <ChampsDesirs prefixe={prefixe} />
      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={enCours || !membre}
          className="self-start rounded-md bg-neutral-900 px-4 py-2 text-white disabled:opacity-50"
        >
          Ajouter ce membre
        </button>
        {etat.erreur ? (
          <p role="alert" className="text-sm text-red-600">
            {etat.erreur}
          </p>
        ) : null}
      </div>
    </form>
  )
}

function LigneParticipant({
  evenementId,
  participant,
}: {
  evenementId: string
  participant: ParticipantLigne
}) {
  const [etatModification, modifier, modificationEnCours] = useActionState(
    modifierParticipation,
    etatInitial,
  )
  const [etatSuppression, supprimer, suppressionEnCours] = useActionState(
    supprimerParticipation,
    etatInitial,
  )
  const prefixe = useId()

  // Un membre DÉSIGNÉ dont la fiche n'est pas consultable par ce compte (typiquement
  // archivée, vue par un modérateur) : `membreId` non nul, embed nul. Les deux
  // informations sont DIFFÉRENTES, et les confondre afficherait « — » là où un
  // administrateur voit un nom. Même discipline que `libelleFiliation` (1c).
  const libelle = participant.membreId
    ? participant.membreNom
      ? `${participant.membrePrenom ?? ''} ${participant.membreNom}`.trim()
      : 'Fiche non consultable'
    : `${participant.externePrenom ?? ''} ${participant.externeNom ?? ''}`.trim() ||
      'Participant externe'

  return (
    <li className="py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">
          {participant.membreId ? (
            <Link href={`/membres/${participant.membreId}`} className="underline underline-offset-4">
              {libelle}
            </Link>
          ) : (
            libelle
          )}
        </span>
        <span className="text-sm text-neutral-500">
          {participant.membreId ? 'Membre' : 'Externe'}
          {participant.externeConvertiEnMembreId ? ' · converti' : ''}
        </span>
      </div>

      <details className="mt-2">
        <summary className="cursor-pointer text-sm underline underline-offset-4">
          Corriger les désirs et la note
        </summary>
        {/* D77 — modifiable après coup : un désir se recueille souvent APRÈS l'évènement.
            `saisi_par` et `saisi_le` ne sont jamais touchés (D60). */}
        <form action={modifier} className="mt-3 flex flex-col gap-3">
          <input type="hidden" name="evenementId" value={evenementId} />
          <input type="hidden" name="participationId" value={participant.id} />
          <ChampsDesirs
            prefixe={prefixe}
            valeurs={{
              mentorat: participant.desirMentoratAcademique,
              suivi: participant.desirSuiviSpirituel,
              cpeap: participant.desirCpeap,
              note: participant.note ?? '',
            }}
          />
          <button
            type="submit"
            disabled={modificationEnCours}
            className="self-start rounded-md border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-50"
          >
            Enregistrer
          </button>
          {etatModification.erreur ? (
            <p role="alert" className="text-sm text-red-600">
              {etatModification.erreur}
            </p>
          ) : null}
        </form>
      </details>

      {/* D78 — SEUL GESTE DESTRUCTIF DE LA PHASE. La confirmation dit ce qui disparaît :
          les trois désirs partent avec la ligne, et l'étiquette de séminaire du membre
          aussi. */}
      <form action={supprimer} className="mt-2">
        <input type="hidden" name="evenementId" value={evenementId} />
        <input type="hidden" name="participationId" value={participant.id} />
        <button
          type="submit"
          disabled={suppressionEnCours}
          onClick={(evenement) => {
            if (
              !window.confirm(
                `Supprimer la participation de ${libelle} ? Les trois désirs et la note saisis pour cet évènement seront effacés, et l'évènement disparaîtra des séminaires assistés de cette personne.`,
              )
            ) {
              evenement.preventDefault()
            }
          }}
          className="text-sm text-red-600 underline underline-offset-4 disabled:opacity-50"
        >
          Supprimer cette participation
        </button>
        {etatSuppression.erreur ? (
          <p role="alert" className="mt-2 text-sm text-red-600">
            {etatSuppression.erreur}
          </p>
        ) : null}
      </form>
    </li>
  )
}

export function SectionParticipants({
  evenementId,
  participants,
  total,
  page,
  pages,
}: {
  evenementId: string
  participants: ParticipantLigne[]
  total: number
  page: number
  pages: number
}) {
  return (
    <section className="mt-10">
      <h2 className="mb-4 text-lg font-medium">
        Participants ({total})
      </h2>

      <div className="mb-8 flex flex-col gap-8">
        <FormulaireAjoutMembre evenementId={evenementId} />
        <details>
          <summary className="cursor-pointer text-sm underline underline-offset-4">
            Ajouter un participant externe
          </summary>
          <div className="mt-4">
            <FormulaireParticipantExterne evenementId={evenementId} />
          </div>
        </details>
      </div>

      {participants.length === 0 ? (
        <p className="text-sm text-neutral-600">Aucun participant enregistré.</p>
      ) : (
        <ul className="divide-y divide-neutral-200">
          {participants.map((participant) => (
            <LigneParticipant
              key={participant.id}
              evenementId={evenementId}
              participant={participant}
            />
          ))}
        </ul>
      )}

      {pages > 1 ? (
        <nav className="mt-6 flex items-center gap-4 text-sm">
          {page > 1 ? (
            <Link
              href={`/evenements/${evenementId}?pageParticipants=${page - 1}`}
              className="underline underline-offset-4"
            >
              Page précédente
            </Link>
          ) : null}
          <span className="text-neutral-500">
            Page {page} sur {pages}
          </span>
          {page < pages ? (
            <Link
              href={`/evenements/${evenementId}?pageParticipants=${page + 1}`}
              className="underline underline-offset-4"
            >
              Page suivante
            </Link>
          ) : null}
        </nav>
      ) : null}
    </section>
  )
}
```

- [ ] **Étape 6 : brancher la section dans la page**

Dans `src/app/evenements/[id]/page.tsx` :

1. Remplacer la signature par :

```typescript
export default async function PageEvenement({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ pageParticipants?: string }>
}) {
```

2. Ajouter les imports, et **élargir celui de `next/navigation`** — la page livrée par la
   Task 18 n'importe que `notFound`, et l'étape 3 ci-dessous appelle `redirect` :

```typescript
import { notFound, redirect } from 'next/navigation'
import { evenementParId, participantsDEvenement, typesEvenementActifs } from '@/lib/donnees/evenements'
import { TAILLE_PAGE_PARTICIPANTS } from '@/lib/donnees/evenements-lots'
import { SectionParticipants } from './participants'
```

3. Après le calcul de `peutGerer`, ajouter :

```typescript
  const { pageParticipants: pageBrute } = await searchParams
  const pageParticipants = Math.max(1, Number(pageBrute ?? '1') || 1)

  // LA LECTURE N'EST PAS FAITE DU TOUT hors modérateur et administrateur, et ce n'est pas
  // une optimisation. Un compte ordinaire lit `participations` sous RLS et obtient ZÉRO
  // ligne : un évènement à cent participants lui paraîtrait DÉSERT. Charger puis ne pas
  // afficher laisserait ce zéro se glisser un jour dans un compteur ou dans un « aucun
  // participant » — c'est le pendant exact du mode de défaillance de D71, dans l'autre
  // sens : une lecture VIDÉE PAR LA RLS ne doit jamais être affichée comme un résultat.
  const participants = peutGerer
    ? await participantsDEvenement(evenement.id, pageParticipants)
    : null

  // BORNE HAUTE DE LA PAGINATION — une adresse pointant au-delà de la dernière page réelle
  // est un signet périmé (ou une liste qui a rétréci depuis une suppression, D78). Sans ce
  // garde, `/evenements/<id>?pageParticipants=99` sur un évènement de cent participants
  // affiche EN MÊME TEMPS trois vérités contradictoires : « Participants (100) » en
  // en-tête (qui lit `participants.total`), « Aucun participant enregistré. » dans le corps
  // (`participants.lignes` étant vide), et « Page 99 sur 2 » au pied. Le message du corps
  // devient littéralement faux.
  // Ce défaut a déjà été payé et corrigé une fois par ce projet, sur l'annuaire : voir
  // `src/app/membres/page.tsx`, lignes 51-62, dont le commentaire le décrit mot pour mot.
  // On corrige l'adresse vers la dernière page réelle plutôt que de laisser tenir ce
  // mensonge.
  // PAS DE BOUCLE POSSIBLE : `pagesParticipants` vaut toujours au moins 1, et la cible de
  // la redirection est `pagesParticipants` lui-même — la page rechargée aura donc
  // `pageParticipants === pagesParticipants`, qui ne redéclenche pas la condition.
  // HORS DE TOUT `try` : `redirect()` lève une exception de contrôle Next.js que ce fichier
  // ne doit pas intercepter (aucun `try` dans ce fichier — vérifié).
  // Sous `if (participants)` : hors modérateur et administrateur, rien n'est lu, il n'y a
  // aucune page à borner, et rediriger serait divulguer qu'il y a des participants.
  let pagesParticipants = 1
  if (participants) {
    pagesParticipants = Math.max(
      1, Math.ceil(participants.total / TAILLE_PAGE_PARTICIPANTS),
    )
    if (pageParticipants > pagesParticipants) {
      redirect(`/evenements/${evenement.id}?pageParticipants=${pagesParticipants}`)
    }
  }
```

4. Remplacer le commentaire `{/* SECTION PARTICIPANTS — livrée par la Task 19. … */}` par :

```typescript
      {/*
        LA SECTION NE SE VIDE PAS PAR RLS, ELLE NE SE REND PAS DU TOUT hors modérateur et
        administrateur (design §8.1). Un compte ordinaire obtiendrait zéro ligne sous RLS,
        et un évènement à cent participants lui paraîtrait désert — un mensonge, pas une
        protection.

        `pages` reçoit `pagesParticipants`, calculé plus haut EN MÊME TEMPS que le garde de
        borne haute — surtout PAS une seconde expression recalculée ici. Deux calculs
        séparés de la même quantité divergeraient au premier changement de
        `TAILLE_PAGE_PARTICIPANTS`, et le pied de page se remettrait à annoncer une page
        que le garde interdit d'atteindre.
      */}
      {peutGerer && participants ? (
        <SectionParticipants
          evenementId={evenement.id}
          participants={participants.lignes}
          total={participants.total}
          page={pageParticipants}
          pages={pagesParticipants}
        />
      ) : null}
```

- [ ] **Étape 7 : vérification manuelle depuis TROIS rôles, et le doublon**

1. **Compte simple** : l'en-tête s'affiche, **le mot « Participants » n'apparaît nulle
   part** dans la page. **Contrôle positif dans la même situation** : le titre et le type
   de l'évènement, eux, **sont bien visibles** — sans quoi l'absence ne distinguerait pas
   « section cachée » de « page non chargée ».
2. **Modérateur** : la section est là, l'ajout d'un membre fonctionne, l'ajout d'un
   **externe** fonctionne, la correction des désirs fonctionne, la suppression demande
   confirmation et fonctionne.
3. **Le contrôle qui attrape `nulls not distinct`** : ajouter **DEUX externes différents**
   au **même** évènement. **Les deux doivent réussir.** Si le second est refusé avec
   « déjà inscrite », la Task 7 a posé une unicité non partielle — **s'arrêter et la
   reprendre**.
4. Ajouter **deux fois le même membre** : le second reçoit
   `MESSAGE_PARTICIPANT_DEJA_INSCRIT` **à l'écran**, sans page d'erreur.
5. **LA BORNE HAUTE DE LA PAGINATION** : sur cet évènement peuplé, ouvrir
   `/evenements/<id>?pageParticipants=99`. **Attendu : la page REDIRIGE vers la dernière
   page réelle** — l'adresse affichée dans la barre devient
   `?pageParticipants=<dernière page>` et la liste montre bien des participants. **Ce qui
   serait un échec** : rester sur `?pageParticipants=99` et afficher simultanément
   « Participants (N) », « Aucun participant enregistré. » et « Page 99 sur M ». **Contrôle
   positif dans la même situation** : `?pageParticipants=1` ne redirige **pas** et affiche
   la première page — sans quoi on ne distinguerait pas « le garde fonctionne » de « toute
   adresse est réécrite ».
6. **Administrateur** : idem.

Nettoyer, **dans l'ordre** :

```sql
delete from public.participations
where evenement_id in (select id from public.evenements where titre like 'ZZ%');
delete from public.participants_externes where nom like 'ZZ%';
delete from public.evenements where titre like 'ZZ%';
```

- [ ] **Étape 8 : les six portes + le build de production**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls && npm run test:e2e && npm run build
```

```bash
npm run test:e2e:prod
```

```bash
git add src/app/evenements/[id]
git commit -m "feat: participants d'un evenement, trois desirs, correction et suppression (D76-D78)"
```

---

### Task 20 : étiquettes de séminaires sur la fiche membre, et lien du tableau de bord (D70)

**Fichiers :**
- Modifier : `src/app/membres/[id]/page.tsx`
- Modifier : `src/app/tableau-de-bord/page.tsx`

**Interfaces :**
- Consomme : `seminairesAssistes(membreId)` (T15).
- Produit : aucune interface nouvelle.

**Cette section est lisible de TOUT COMPTE ACTIF, et l'historique des convertis en fait
partie (D70).** C'est **le point d'observation** du bon régime de la vue : si
`seminaires_assistes` portait `security_invoker = true`, cette section serait
**silencieusement vide sur toutes les fiches**, sans la moindre erreur. La vérification
manuelle de l'étape 3 est donc **la seule chose qui distingue « ce membre n'a assisté à
aucun séminaire » de « la vue est cassée pour tout le monde »** — jusqu'à ce que la
preuve n°5 (Task 23) l'automatise.

- [ ] **Étape 1 : la section sur la fiche membre**

Dans `src/app/membres/[id]/page.tsx` :

1. Ajouter l'import :

```typescript
import { seminairesAssistes } from '@/lib/donnees/evenements'
```

2. Dans le `Promise.all` existant, ajouter l'appel en **dernière position** et le
   déstructurer :

```typescript
  const [
    roles,
    statuts,
    disciples,
    faiseur,
    dirigeant,
    peutEcrireStatuts,
    compteLie,
    compteurAel,
    seminaires,
  ] = await Promise.all([
    rolesDuProfil(profil.id),
    statutsDuMembre(membre.id),
    disciplesDe(membre.id),
    membre.faiseurDeDiscipleId
      ? membreBrefParId(membre.faiseurDeDiscipleId)
      : Promise.resolve(null),
    membre.dirigeantId ? membreBrefParId(membre.dirigeantId) : Promise.resolve(null),
    aAutoriteSur(membre.id),
    etatCompteLie(membre.id),
    compteurAelMembre(membre.id),
    seminairesAssistes(membre.id),
  ])
```

3. Insérer la section **entre** la section « Statuts » et la section « Disciples actifs » :

```typescript
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-medium">Séminaires assistés</h2>
        {/*
          Lue depuis la vue `seminaires_assistes` (D70, D71), la SEULE vue du projet en
          `security_invoker = false` : elle contourne délibérément la RLS de
          `participations`, fermée à l'administrateur et au modérateur, pour rendre le seul
          FAIT de la participation lisible de tout compte actif (§4.4, D2, D16). Elle ne
          contourne PAS la RLS de `membres` — `prive.peut_lire_membre` (D72) la réimpose.

          L'HISTORIQUE DES CONVERTIS EST COMPRIS : la seconde branche de la vue projette les
          participations d'externes convertis sur `converti_en_membre_id`, résolu à la
          LECTURE. Aucune écriture passée n'a bougé (D69) — repointer
          `participations.membre_id` effacerait le fait que cette personne est entrée par un
          séminaire, ce que D13 veut précisément mesurer.

          SI CETTE SECTION EST VIDE SUR TOUTES LES FICHES, la première chose à vérifier est
          `reloptions` de la vue : `security_invoker = true` la rendrait silencieusement
          vide pour tout compte ordinaire, sans la moindre erreur (piège n°8 du design).
          AUCUN DÉSIR N'EST AFFICHÉ ICI, et la vue n'en expose aucun (D73) : ils restent
          réservés à l'administrateur et au modérateur, sur l'écran de l'évènement.
        */}
        {seminaires.length === 0 ? (
          <p className="text-sm text-neutral-600">Aucun séminaire enregistré.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {seminaires.map((seminaire) => (
              <li
                key={seminaire.evenementId}
                className="rounded-full border border-neutral-300 px-3 py-1 text-sm"
              >
                <Link href={`/evenements/${seminaire.evenementId}`} className="underline underline-offset-4">
                  {seminaire.titre}
                </Link>
                <span className="text-neutral-500">
                  {' '}
                  · {seminaire.type} · {formaterDateSeule(seminaire.dateDebut)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
```

- [ ] **Étape 2 : le lien du tableau de bord**

Dans `src/app/tableau-de-bord/page.tsx`, ajouter **avant** le lien « Gérer l&apos;AEL »
(la consultation des évènements est ouverte à **tout compte actif**, donc **hors** de la
condition `estAdmin || estModerateur`) :

```typescript
        <Link href="/evenements" className="underline underline-offset-4">
          Voir les évènements
        </Link>
```

Et, **dans** la condition `estAdmin || estModerateur`, après « Gérer l&apos;AEL » :

```typescript
        {estAdmin || estModerateur ? (
          <Link href="/evenements/a-traiter" className="underline underline-offset-4">
            Participants à traiter
          </Link>
        ) : null}
```

- [ ] **Étape 3 : LA VÉRIFICATION QUI COMPTE — depuis un COMPTE ORDINAIRE**

```bash
npm run dev
```

1. Connecté **modérateur** : créer un évènement, y ajouter un **membre actif** comme
   participant.
2. Connecté **compte simple** (ni modérateur ni administrateur) : ouvrir la fiche de ce
   membre. **L'étiquette du séminaire DOIT être visible.**
3. **Contrôle positif de la négation, dans la même session** : ouvrir la fiche d'un **autre**
   membre, sans participation — la section affiche « Aucun séminaire enregistré ». Sans ce
   second contrôle, la première assertion pourrait être vraie pour une autre raison.
4. **Toujours depuis le compte simple** : ouvrir `/evenements/<id>` et vérifier que **la
   section « Participants » est absente**. C'est le contraste qui prouve que la vue partage
   le **fait** sans partager la **confidence**.

**Si l'étiquette n'apparaît pas au point 2**, ne pas chercher côté écran : vérifier
`reloptions` de `seminaires_assistes` (Task 8, étape 2). `security_invoker = true` la rend
vide **sans erreur**.

Nettoyer, dans l'ordre indiqué à la Task 19, étape 6.

- [ ] **Étape 4 : les six portes + le build de production**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls && npm run test:e2e && npm run build
```

```bash
npm run test:e2e:prod
```

```bash
git add src/app/membres/[id]/page.tsx src/app/tableau-de-bord/page.tsx
git commit -m "feat: seminaires assistes sur la fiche membre, historique des convertis compris (D70)"
```

---

### Task 21 : écran `/evenements/a-traiter` — conversion et classement (D55, D65 à D68, D74, D75)

**Fichiers :**
- Créer : `src/app/evenements/a-traiter/page.tsx`
- Créer : `src/app/evenements/a-traiter/actions.ts`
- Créer : `src/app/evenements/a-traiter/messages.ts`
- Créer : `src/app/evenements/a-traiter/ligne-a-traiter.tsx`

**Interfaces :**
- Consomme : `participantsATraiter()`, `TAILLE_PAGE_A_TRAITER`, `type ATraiterLigne`
  (T15) ; `champManquantConversion`, `motifClassementValide`, `type CheminConversion`
  (T14) ; `dirigeantPropose` (1c, `src/lib/domaine/arbre.ts`) et `maillonArbre` (1c,
  `src/lib/donnees/arbre.ts`) ; `notifierAdministrateurs` (2b) ; les passerelles
  `convertir_participant_externe` (T11) et `classer_participant_externe` (T12) ;
  `SelecteurMembre` (1c) ; `exigerModerateurOuAdministrateur`, `exigerAdministrateur`,
  `estAdministrateur` — **voir l'étape 0**.
- Produit : `type EtatConversion = { erreur: string | null }` ;
  `convertirParticipant(_etat, donnees): Promise<EtatConversion>` ;
  `classerParticipant(_etat, donnees): Promise<EtatConversion>` ; les messages
  `MESSAGE_NOM_PRENOM_OBLIGATOIRES`, `MESSAGE_FAISEUR_OBLIGATOIRE`,
  `MESSAGE_FICHE_CIBLE_OBLIGATOIRE`, `MESSAGE_CHEMIN_INCONNU`,
  `MESSAGE_PARTICIPANT_INTROUVABLE`, `MESSAGE_PARTICIPANT_DEJA_CONVERTI`,
  `MESSAGE_FICHE_CIBLE_NON_ACTIVE`, `MESSAGE_FICHE_CIBLE_INTROUVABLE`,
  `MESSAGE_FAISEUR_ARCHIVE`, `MESSAGE_CLASSEMENT_DEFINITIF`,
  `MESSAGE_MOTIF_OBLIGATOIRE_CLASSEMENT`, `MESSAGE_ECHEC_CONVERSION`,
  `MESSAGE_ECHEC_CLASSEMENT`, importables par les specs — **treize messages, et
  `messages.ts` doit en définir exactement treize.** Une spec qui importe ses attendus
  depuis cette liste passerait sinon à côté de `MESSAGE_FICHE_CIBLE_INTROUVABLE`, qui est
  le message du marqueur `membre_cible_inconnu`.

**Deux niveaux d'accès sur le même écran (D55).**

| Geste | Accès | Garde |
|---|---|---|
| **Consulter** la liste | modérateur **ou** administrateur | `exigerModerateurOuAdministrateur` |
| **Convertir** | administrateur **seul** | `exigerAdministrateur` |
| **Classer sans suite** | administrateur **seul** | `exigerAdministrateur` |

La **consultation** ne demande aucune ligne nouvelle à la matrice du §5.2 : la liste est
intégralement dérivée de `desir_suivi_spirituel`, que le modérateur a **déjà** le droit de
voir. Le **classement**, lui, en demande une — la matrice était **silencieuse**, et la
Task 28 la comble. Conversion et classement sont les **deux seules** façons de vider la
liste ; en réserver une et ouvrir l'autre serait incohérent — un modérateur pourrait
**vider la liste de travail de l'administrateur sans convertir personne**.

## ⚠️ NE JAMAIS SCINDER L'APPEL À `convertir_participant_externe` EN DEUX ÉCRITURES

L'atomicité de la conversion est tenue **par construction** (D65) : une exception à
n'importe quel point du corps de la passerelle annule **tout** ce qu'elle a écrit. Remplacer
cet unique `.rpc()` par « créer la fiche via `clientAdmin()` puis poser le lien » ferait
**disparaître l'atomicité en silence** — et rouvrirait la fenêtre où la fiche existe sans
lien : le participant reste dans la liste alors qu'il a déjà une fiche, et un second clic
crée un **doublon**. C'est la même discipline que `annulerDemandeSuivi` documente pour
`annuler_demande_membre`.

- [ ] **Étape 0 : ajouter `estAdministrateur` au garde**

`src/lib/securite/garde.ts` expose `exigerAdministrateur` (qui **redirige**) mais **aucun
booléen** équivalent : cet écran doit **décider d'afficher** les gestes réservés à
l'administrateur sans rediriger un modérateur qui a le droit de **consulter**. Ajouter à
la fin de `src/lib/securite/garde.ts` :

```typescript

/**
 * Le compte connecté est-il administrateur ? Rend un booléen pour cette décision de rôle
 * précise — elle ne redirige jamais pour la départager. Elle PEUT néanmoins rediriger en
 * amont, vers `/deconnexion`, via `exigerProfilActif` si aucun profil actif n'existe : ce
 * n'est pas un verdict de rôle, c'est le même barrage de session que devant toute page.
 *
 * À n'employer que pour DÉCIDER D'AFFICHER un formulaire ou un bouton — même mise en garde
 * que `aAutoriteSur` et `estModerateurOuAdministrateur`. La protection réelle, c'est
 * `exigerAdministrateur`, et elle seule.
 *
 * Écrite pour `/evenements/a-traiter` (D55), le premier écran du projet dont la
 * CONSULTATION est ouverte au modérateur alors que DEUX de ses gestes sont réservés à
 * l'administrateur. Jusqu'ici, les écrans réservés à l'administrateur l'étaient en entier.
 */
export async function estAdministrateur(): Promise<boolean> {
  const profil = await exigerProfilActif()
  const roles = await rolesDuProfil(profil.id)
  return roles.includes('administrateur')
}
```

- [ ] **Étape 1 : les messages**

Créer `src/app/evenements/a-traiter/messages.ts` :

```typescript
export const MESSAGE_NOM_PRENOM_OBLIGATOIRES =
  "Le nom et le prénom sont obligatoires pour créer une fiche."
export const MESSAGE_FAISEUR_OBLIGATOIRE =
  "Choisissez un faiseur de disciple : une fiche active sans rattachement resterait hors de toute portée de suivi."
export const MESSAGE_FICHE_CIBLE_OBLIGATOIRE =
  "Choisissez la fiche membre à laquelle rattacher ce participant."
export const MESSAGE_CHEMIN_INCONNU = "Choisissez une façon de convertir ce participant."
export const MESSAGE_PARTICIPANT_INTROUVABLE = "Ce participant n'existe plus."
export const MESSAGE_PARTICIPANT_DEJA_CONVERTI =
  "Ce participant a déjà été converti en membre. Rechargez la liste."
export const MESSAGE_FICHE_CIBLE_NON_ACTIVE =
  "La fiche choisie n'est pas active : seule une fiche active peut recevoir ce rattachement."
export const MESSAGE_FICHE_CIBLE_INTROUVABLE = "La fiche choisie n'existe plus."
export const MESSAGE_FAISEUR_ARCHIVE = "Le faiseur de disciple choisi est archivé."
export const MESSAGE_CLASSEMENT_DEFINITIF =
  "Ce participant a déjà été classé sans suite. Rechargez la liste."
export const MESSAGE_MOTIF_OBLIGATOIRE_CLASSEMENT =
  "Un motif est obligatoire pour classer un participant sans suite."
export const MESSAGE_ECHEC_CONVERSION = "La conversion n'a pas pu être enregistrée."
export const MESSAGE_ECHEC_CLASSEMENT = "Le classement n'a pas pu être enregistré."
```

- [ ] **Étape 2 : les deux actions**

Créer `src/app/evenements/a-traiter/actions.ts` :

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { dirigeantPropose } from '@/lib/domaine/arbre'
import { champManquantConversion, motifClassementValide, type CheminConversion } from '@/lib/domaine/evenements'
import { maillonArbre } from '@/lib/donnees/arbre'
import { notifierAdministrateurs } from '@/lib/donnees/notifications'
import { exigerAdministrateur } from '@/lib/securite/garde'
import { clientAdmin } from '@/lib/supabase/admin'
import {
  MESSAGE_CHEMIN_INCONNU,
  MESSAGE_CLASSEMENT_DEFINITIF,
  MESSAGE_ECHEC_CLASSEMENT,
  MESSAGE_ECHEC_CONVERSION,
  MESSAGE_FAISEUR_ARCHIVE,
  MESSAGE_FAISEUR_OBLIGATOIRE,
  MESSAGE_FICHE_CIBLE_INTROUVABLE,
  MESSAGE_FICHE_CIBLE_NON_ACTIVE,
  MESSAGE_FICHE_CIBLE_OBLIGATOIRE,
  MESSAGE_MOTIF_OBLIGATOIRE_CLASSEMENT,
  MESSAGE_NOM_PRENOM_OBLIGATOIRES,
  MESSAGE_PARTICIPANT_DEJA_CONVERTI,
  MESSAGE_PARTICIPANT_INTROUVABLE,
} from './messages'

export type EtatConversion = { erreur: string | null }

// Marqueurs posés par les deux passerelles via `using detail`. LA DISCRIMINATION PORTE
// UNIQUEMENT SUR `error.details`, jamais sur le texte français du message Postgres.
const DETAIL_PARTICIPANT_INCONNU = 'participant_inconnu'
const DETAIL_PARTICIPANT_DEJA_CONVERTI = 'participant_deja_converti'
const DETAIL_MEMBRE_CIBLE_INCONNU = 'membre_cible_inconnu'
const DETAIL_MEMBRE_CIBLE_NON_ACTIF = 'membre_cible_non_actif'
const DETAIL_CHEMIN_INCONNU = 'chemin_inconnu'
const DETAIL_CLASSEMENT_DEFINITIF = 'classement_definitif'
const DETAIL_MOTIF_VIDE = 'motif_classement_vide'
// Posé par le déclencheur membres_faiseur_de_disciple_archive (20260814150000), atteignable
// depuis le chemin 2 : la passerelle ne duplique pas cette règle, elle la laisse remonter.
const DETAIL_FAISEUR_ARCHIVE = 'faiseur_de_disciple_archive'

function champOuNull(donnees: FormData, champ: string): string | null {
  const valeur = donnees.get(champ)
  return typeof valeur === 'string' && valeur.trim().length > 0 ? valeur.trim() : null
}

/**
 * Convertit un participant externe en membre par l'un des trois chemins (D65 à D68).
 *
 * D55 — RÉSERVÉE À L'ADMINISTRATEUR SEUL, comme le classement. La spec §5.2 le dit déjà
 * pour la conversion (« Convertir un participant externe en membre : ❌ ❌ ✅ ») ; D23 n'a
 * jamais élargi ce geste.
 *
 * ⚠️ UN SEUL `.rpc()`, ET IL NE SE SCINDE JAMAIS. L'atomicité est tenue PAR CONSTRUCTION
 * (D65) : une exception à n'importe quel point du corps de la passerelle annule tout ce
 * qu'elle a écrit. Remplacer cet appel par « créer la fiche via clientAdmin() puis poser le
 * lien » ferait disparaître l'atomicité EN SILENCE et rouvrirait la fenêtre où la fiche
 * existe sans lien — le participant resterait dans la liste alors qu'il a déjà une fiche,
 * et un second clic créerait un doublon. Même discipline que `annulerDemandeSuivi`.
 */
export async function convertirParticipant(
  _etat: EtatConversion,
  donnees: FormData,
): Promise<EtatConversion> {
  const adminProfil = await exigerAdministrateur()

  const participantId = champOuNull(donnees, 'participantId')
  if (!participantId) {
    console.error('convertirParticipant : identifiant du participant manquant')
    return { erreur: MESSAGE_ECHEC_CONVERSION }
  }

  const chemin = (champOuNull(donnees, 'chemin') ?? '') as CheminConversion
  const nom = champOuNull(donnees, 'nom')
  const prenom = champOuNull(donnees, 'prenom')
  const faiseurId = champOuNull(donnees, 'faiseurId')
  const membreCibleId = champOuNull(donnees, 'membreCibleId')

  // Contrôle AMONT (design §6) : la seule règle réellement combinatoire de la phase, et
  // celle où une erreur produirait une FICHE MUETTE plutôt qu'une erreur — un chemin 2
  // sans faiseur crée une fiche active DÉTACHÉE de l'arbre, sans le moindre signal.
  const manquant = champManquantConversion(chemin, {
    nom,
    prenom,
    faiseur: faiseurId,
    membreCible: membreCibleId,
  })
  if (manquant === 'chemin') {
    return { erreur: MESSAGE_CHEMIN_INCONNU }
  }
  if (manquant === 'nom' || manquant === 'prenom') {
    return { erreur: MESSAGE_NOM_PRENOM_OBLIGATOIRES }
  }
  if (manquant === 'faiseur') {
    return { erreur: MESSAGE_FAISEUR_OBLIGATOIRE }
  }
  if (manquant === 'membreCible') {
    return { erreur: MESSAGE_FICHE_CIBLE_OBLIGATOIRE }
  }

  // Chemin 2 : le dirigeant est PROPOSÉ par la règle du §4.2, réutilisée TELLE QUELLE
  // (`dirigeantPropose`, 1c) et jamais réécrite. L'administrateur peut la remplacer, et
  // `dirigeant_force` enregistre lequel des deux s'est produit — ce drapeau atteste
  // seulement que la valeur n'a pas été saisie à la main, il n'autorise rien.
  let dirigeantId: string | null = null
  let dirigeantForce = false
  if (chemin === 'fiche_active') {
    const dirigeantChoisi = champOuNull(donnees, 'dirigeantId')
    if (dirigeantChoisi) {
      dirigeantId = dirigeantChoisi
      dirigeantForce = true
    } else {
      const maillon = await maillonArbre(faiseurId as string)
      dirigeantId = dirigeantPropose(maillon)
      dirigeantForce = false
    }
  }

  const { data, error } = await clientAdmin().rpc('convertir_participant_externe', {
    p_participant: participantId,
    p_chemin: chemin,
    p_membre_cible: membreCibleId,
    p_nom: nom,
    p_prenom: prenom,
    p_faiseur: chemin === 'fiche_active' ? faiseurId : null,
    p_dirigeant: dirigeantId,
    p_dirigeant_force: dirigeantForce,
    p_par: adminProfil.id,
  })

  if (error) {
    console.error('convertirParticipant : échec RPC convertir_participant_externe', {
      participantId,
      chemin,
      code: error.code,
      details: error.details,
      message: error.message,
    })
    // Chaque marqueur reçoit son PROPRE message, distinct des autres : un texte générique
    // commun les rendrait indiscernables à l'écran alors que le geste correctif attendu
    // diffère dans chaque cas. Discrimination sur `error.details` UNIQUEMENT.
    if (error.details === DETAIL_PARTICIPANT_INCONNU) {
      return { erreur: MESSAGE_PARTICIPANT_INTROUVABLE }
    }
    if (error.details === DETAIL_PARTICIPANT_DEJA_CONVERTI) {
      return { erreur: MESSAGE_PARTICIPANT_DEJA_CONVERTI }
    }
    if (error.details === DETAIL_MEMBRE_CIBLE_INCONNU) {
      return { erreur: MESSAGE_FICHE_CIBLE_INTROUVABLE }
    }
    if (error.details === DETAIL_MEMBRE_CIBLE_NON_ACTIF) {
      return { erreur: MESSAGE_FICHE_CIBLE_NON_ACTIVE }
    }
    if (error.details === DETAIL_CHEMIN_INCONNU) {
      return { erreur: MESSAGE_CHEMIN_INCONNU }
    }
    if (error.details === DETAIL_FAISEUR_ARCHIVE) {
      return { erreur: MESSAGE_FAISEUR_ARCHIVE }
    }
    return { erreur: MESSAGE_ECHEC_CONVERSION }
  }

  // `.rpc()` sur une fonction `returns table` rend un TABLEAU, et son type est `any` (aucun
  // type Database n'est généré dans ce projet). Une ligne exactement.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ligne = (Array.isArray(data) ? data[0] : data) as { membre_id: string; demande_id: string | null } | null
  const demandeId = ligne?.demande_id ?? null

  // LE CHEMIN CONNAÎT SA PROPRE ATTENTE, ET IL LA DIT. `chemin === 'fiche_en_attente'`
  // implique qu'une ligne `demandes_membre` vient d'être créée, donc qu'un `demande_id` a
  // été rendu. Si ce n'est pas le cas — forme de retour changée, `data` vide, colonne
  // renommée —, le `if` ci-dessous sauterait la notification SANS UNE LIGNE DE JOURNAL, et
  // la demande créée en base ne serait signalée à personne : exactement le mode de
  // défaillance que le commentaire du `if` déclare vouloir empêcher. On ne lève pas et on
  // ne retourne pas d'erreur — la conversion est acquise en base et refuser ici la ferait
  // paraître échouée —, mais le silence, lui, n'est pas acceptable.
  if (chemin === 'fiche_en_attente' && !demandeId) {
    console.error('convertirParticipant : chemin 1 sans demande_id — notification impossible', { participantId })
  }

  if (demandeId) {
    // Chemin 1 uniquement. La notification est HORS de la transaction, comme
    // `creerDemandeSuivi` (2b) : une notification manquée ne doit pas faire échouer une
    // conversion déjà acquise en base — on journalise bruyamment plutôt que de lever
    // (`notifierAdministrateurs` le fait déjà elle-même).
    //
    // `demandeId` est OBLIGATOIRE : sans lui, `demande_id` resterait NULL en base, et la
    // cloche des administrateurs garderait indéfiniment un non-lu que plus aucun geste ne
    // peut éteindre (migration 20260815240000).
    //
    // ⚠️ CETTE NOTIFICATION ATTEINT TOUS LES COMPTES ADMINISTRATEURS ACTIFS, LE COMPTE
    // RACINE COMPRIS. Toute suite de tests qui emprunte le chemin 1 DOIT nettoyer les
    // notifications par `demande_id` — on peut polluer le compte racine sans jamais le
    // toucher.
    await notifierAdministrateurs({
      type: 'nouvelle_demande',
      titre: 'Participant externe converti, à valider',
      corps: `${adminProfil.nomAffichage} a converti un participant externe en fiche à valider.`,
      lien: '/demandes',
      demandeId,
    })
  }

  revalidatePath('/evenements/a-traiter')
  revalidatePath('/demandes')
  // Une conversion fait apparaître l'historique de séminaire du converti sur sa fiche
  // (seconde branche de la vue, D70).
  revalidatePath('/membres/[id]', 'page')
  return { erreur: null }
}

/**
 * Classe un participant sans suite, avec motif (D55, D61, D62).
 *
 * D55 — ADMINISTRATEUR SEUL, comme la conversion : ce sont les DEUX SEULES façons de vider
 * la liste, et en ouvrir une au modérateur lui permettrait de vider la liste de travail de
 * l'administrateur sans convertir personne.
 */
export async function classerParticipant(
  _etat: EtatConversion,
  donnees: FormData,
): Promise<EtatConversion> {
  const adminProfil = await exigerAdministrateur()

  const participantId = champOuNull(donnees, 'participantId')
  if (!participantId) {
    console.error('classerParticipant : identifiant du participant manquant')
    return { erreur: MESSAGE_ECHEC_CLASSEMENT }
  }

  const motif = String(donnees.get('motif') ?? '')
  // Moitié applicative de `participants_externes_classement_coherent` : nomme la cause
  // AVANT d'écrire, plutôt que de laisser remonter un 23514 opaque.
  if (!motifClassementValide(motif)) {
    return { erreur: MESSAGE_MOTIF_OBLIGATOIRE_CLASSEMENT }
  }

  const { error } = await clientAdmin().rpc('classer_participant_externe', {
    p_participant: participantId,
    p_motif: motif,
    p_par: adminProfil.id,
  })

  if (error) {
    console.error('classerParticipant : échec RPC classer_participant_externe', {
      participantId,
      code: error.code,
      details: error.details,
      message: error.message,
    })
    if (error.details === DETAIL_MOTIF_VIDE) {
      return { erreur: MESSAGE_MOTIF_OBLIGATOIRE_CLASSEMENT }
    }
    if (error.details === DETAIL_PARTICIPANT_INCONNU) {
      return { erreur: MESSAGE_PARTICIPANT_INTROUVABLE }
    }
    if (error.details === DETAIL_PARTICIPANT_DEJA_CONVERTI) {
      return { erreur: MESSAGE_PARTICIPANT_DEJA_CONVERTI }
    }
    if (error.details === DETAIL_CLASSEMENT_DEFINITIF) {
      return { erreur: MESSAGE_CLASSEMENT_DEFINITIF }
    }
    return { erreur: MESSAGE_ECHEC_CLASSEMENT }
  }

  revalidatePath('/evenements/a-traiter')
  return { erreur: null }
}
```

- [ ] **Étape 3 : le composant de ligne**

Créer `src/app/evenements/a-traiter/ligne-a-traiter.tsx` :

```typescript
'use client'

import { useActionState, useId, useState } from 'react'
import type { ATraiterLigne } from '@/lib/donnees/evenements-lots'
import type { MembreBref } from '@/lib/donnees/membres'
import { SelecteurMembre } from '@/app/membres/selecteur-membre'
import { classerParticipant, convertirParticipant, type EtatConversion } from './actions'

const etatInitial: EtatConversion = { erreur: null }

type Chemin = 'fiche_en_attente' | 'fiche_active' | 'membre_existant'

/**
 * Une ligne de la liste « à traiter ». Les blocs de conversion et de classement ne sont
 * rendus que pour un administrateur (D55) ; le modérateur voit la ligne et ses coordonnées,
 * ce que la ligne « Voir les trois désirs » du §5.2 lui accorde déjà.
 *
 * `peutAgir` DÉCIDE D'AFFICHER et ne protège rien : la protection est
 * `exigerAdministrateur`, première instruction des deux actions.
 */
export function LigneATraiter({
  participant,
  peutAgir,
}: {
  participant: ATraiterLigne
  peutAgir: boolean
}) {
  const [etatConversion, convertir, conversionEnCours] = useActionState(
    convertirParticipant,
    etatInitial,
  )
  const [etatClassement, classer, classementEnCours] = useActionState(
    classerParticipant,
    etatInitial,
  )
  const [chemin, setChemin] = useState<Chemin>('fiche_en_attente')
  const [faiseur, setFaiseur] = useState<MembreBref | null>(null)
  const [dirigeant, setDirigeant] = useState<MembreBref | null>(null)
  const [cible, setCible] = useState<MembreBref | null>(null)
  const prefixe = useId()
  const idMotif = `${prefixe}-motif`
  const idAideMotif = `${prefixe}-aide-motif`

  const nomComplet = `${participant.prenom ?? ''} ${participant.nom}`.trim()

  return (
    <li className="py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">{nomComplet}</span>
        <span className="text-sm text-neutral-500">
          {participant.evenementsConcernes} évènement
          {participant.evenementsConcernes > 1 ? 's' : ''}
        </span>
      </div>
      <p className="mt-1 text-sm text-neutral-600">
        {[participant.telephone, participant.email, participant.ville, participant.pays]
          .filter(Boolean)
          .join(' · ') || 'Aucune coordonnée renseignée.'}
      </p>

      {peutAgir ? (
        <>
          <details className="mt-3">
            <summary className="cursor-pointer text-sm underline underline-offset-4">
              Convertir en membre
            </summary>
            <form action={convertir} className="mt-3 flex flex-col gap-3">
              <input type="hidden" name="participantId" value={participant.participantExterneId} />
              <input type="hidden" name="chemin" value={chemin} />

              <fieldset className="flex flex-col gap-2">
                <legend className="text-sm font-medium">Façon de convertir</legend>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="cheminAffiche"
                    checked={chemin === 'fiche_en_attente'}
                    onChange={() => setChemin('fiche_en_attente')}
                  />
                  Créer une fiche à valider (elle rejoint l&apos;écran des demandes)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="cheminAffiche"
                    checked={chemin === 'fiche_active'}
                    onChange={() => setChemin('fiche_active')}
                  />
                  Créer une fiche active tout de suite
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="cheminAffiche"
                    checked={chemin === 'membre_existant'}
                    onChange={() => setChemin('membre_existant')}
                  />
                  Rattacher à une fiche membre existante
                </label>
              </fieldset>

              {chemin !== 'membre_existant' ? (
                // Le nom et le prénom sont préremplis depuis le participant externe, mais
                // RESTENT MODIFIABLES : une saisie de séminaire est souvent partielle ou
                // approximative, et la fiche membre, elle, est durable.
                <div className="flex flex-wrap gap-3">
                  <label className="flex flex-1 flex-col gap-1.5">
                    <span className="text-sm font-medium">Nom</span>
                    <input
                      name="nom"
                      required
                      defaultValue={participant.nom}
                      className="rounded-md border border-neutral-300 px-3 py-2"
                    />
                  </label>
                  <label className="flex flex-1 flex-col gap-1.5">
                    <span className="text-sm font-medium">Prénom</span>
                    <input
                      name="prenom"
                      required
                      defaultValue={participant.prenom ?? ''}
                      className="rounded-md border border-neutral-300 px-3 py-2"
                    />
                  </label>
                </div>
              ) : null}

              {chemin === 'fiche_active' ? (
                <>
                  {/* D67 — ce chemin pose un faiseur de disciple, et c'est lui que le
                      verrou consultatif « arbre » de la passerelle protège. Sans faiseur,
                      la fiche naîtrait ACTIVE et DÉTACHÉE de l'arbre, sans le moindre
                      signal : `champManquantConversion` le refuse côté serveur. */}
                  <SelecteurMembre
                    nom="faiseurId"
                    label="Faiseur de disciple"
                    aide="Cherche parmi les membres actifs. Obligatoire pour une fiche active."
                    valeur={faiseur}
                    surChoix={setFaiseur}
                    exclureId={null}
                  />
                  <SelecteurMembre
                    nom="dirigeantId"
                    label="Dirigeant (facultatif)"
                    aide="Laissé vide, il est proposé automatiquement à partir du faiseur de disciple."
                    valeur={dirigeant}
                    surChoix={setDirigeant}
                    exclureId={null}
                  />
                </>
              ) : null}

              {chemin === 'membre_existant' ? (
                // D68 — le sélecteur ne propose QUE des membres actifs, ET la passerelle
                // refuse une fiche non active (marqueur membre_cible_non_actif). Double
                // dispositif : un onglet resté ouvert reposterait sinon un identifiant
                // devenu invalide entre-temps.
                <SelecteurMembre
                  nom="membreCibleId"
                  label="Fiche membre existante"
                  aide="Cherche parmi les membres actifs. Le séminaire sera rattaché à cette fiche."
                  valeur={cible}
                  surChoix={setCible}
                  exclureId={null}
                />
              ) : null}

              <div className="flex items-center gap-4">
                <button
                  type="submit"
                  disabled={conversionEnCours}
                  className="self-start rounded-md bg-neutral-900 px-4 py-2 text-white disabled:opacity-50"
                >
                  Convertir
                </button>
                {etatConversion.erreur ? (
                  <p role="alert" className="text-sm text-red-600">
                    {etatConversion.erreur}
                  </p>
                ) : null}
              </div>
            </form>
          </details>

          <details className="mt-2">
            <summary className="cursor-pointer text-sm underline underline-offset-4">
              Classer sans suite
            </summary>
            <form action={classer} className="mt-3 flex flex-col gap-3">
              <input type="hidden" name="participantId" value={participant.participantExterneId} />
              <div className="flex flex-col gap-1.5">
                <label htmlFor={idMotif} className="text-sm font-medium">
                  Motif
                </label>
                <input
                  id={idMotif}
                  name="motif"
                  required
                  aria-describedby={idAideMotif}
                  className="rounded-md border border-neutral-300 px-3 py-2"
                />
                <span id={idAideMotif} className="text-xs text-neutral-500">
                  Définitif : ce participant ne reviendra pas dans cette liste. Il restera
                  convertible plus tard s&apos;il reprend contact.
                </span>
              </div>
              <button
                type="submit"
                disabled={classementEnCours}
                className="self-start rounded-md border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-50"
              >
                Classer sans suite
              </button>
              {etatClassement.erreur ? (
                <p role="alert" className="text-sm text-red-600">
                  {etatClassement.erreur}
                </p>
              ) : null}
            </form>
          </details>
        </>
      ) : (
        <p className="mt-3 text-sm text-neutral-500">
          La conversion et le classement sont réservés aux administrateurs.
        </p>
      )}
    </li>
  )
}
```

- [ ] **Étape 4 : la page**

Créer `src/app/evenements/a-traiter/page.tsx` :

```typescript
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { participantsATraiter } from '@/lib/donnees/evenements'
import { TAILLE_PAGE_A_TRAITER } from '@/lib/donnees/evenements-lots'
import { estAdministrateur, exigerModerateurOuAdministrateur } from '@/lib/securite/garde'
import { LigneATraiter } from './ligne-a-traiter'

export default async function PageATraiter({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  // CONSULTATION : modérateur OU administrateur (D55). Cette ligne ne demande rien de
  // nouveau à la matrice du §5.2 : la liste est intégralement dérivée de
  // `desir_suivi_spirituel`, que le modérateur a déjà le droit de voir.
  await exigerModerateurOuAdministrateur()

  const { page: pageBrute } = await searchParams
  const page = Math.max(1, Number(pageBrute ?? '1') || 1)

  const [{ lignes, total }, peutAgir] = await Promise.all([
    participantsATraiter(page),
    // DÉCIDE D'AFFICHER les deux gestes réservés à l'administrateur (D55) ; la protection
    // est `exigerAdministrateur`, première instruction des deux actions.
    estAdministrateur(),
  ])

  const pages = Math.max(1, Math.ceil(total / TAILLE_PAGE_A_TRAITER))
  if (page > pages) {
    redirect(`/evenements/a-traiter?page=${pages}`)
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/evenements" className="text-sm underline underline-offset-4">
        Retour aux évènements
      </Link>
      <h1 className="mt-4 mb-2 text-2xl font-semibold">Participants à traiter</h1>
      <p className="mb-8 text-sm text-neutral-500">
        Participants externes ayant exprimé le désir d&apos;un suivi spirituel, ni convertis
        ni classés sans suite. {total} personne{total > 1 ? 's' : ''}.
      </p>

      {lignes.length === 0 ? (
        <p className="text-sm text-neutral-600">Personne à traiter pour le moment.</p>
      ) : (
        <ul className="divide-y divide-neutral-200">
          {lignes.map((participant) => (
            <LigneATraiter
              key={participant.participantExterneId}
              participant={participant}
              peutAgir={peutAgir}
            />
          ))}
        </ul>
      )}

      {pages > 1 ? (
        <nav className="mt-6 flex items-center gap-4 text-sm">
          {page > 1 ? (
            <Link href={`/evenements/a-traiter?page=${page - 1}`} className="underline underline-offset-4">
              Page précédente
            </Link>
          ) : null}
          <span className="text-neutral-500">
            Page {page} sur {pages}
          </span>
          {page < pages ? (
            <Link href={`/evenements/a-traiter?page=${page + 1}`} className="underline underline-offset-4">
              Page suivante
            </Link>
          ) : null}
        </nav>
      ) : null}
    </main>
  )
}
```

- [ ] **Étape 5 : vérification manuelle des TROIS chemins et des DEUX rôles**

Préparer : un évènement, trois participants externes distincts, chacun avec
`desir_suivi_spirituel` coché — depuis `/evenements/[id]`, jamais par SQL direct (le but
est d'éprouver le chemin réel).

1. **Modérateur** : `/evenements/a-traiter` s'affiche, les trois personnes sont listées,
   **et les blocs « Convertir » / « Classer sans suite » sont ABSENTS** — remplacés par la
   phrase « réservés aux administrateurs ». **Contrôle positif dans la même situation** :
   les coordonnées, elles, s'affichent bien.
2. **Compte simple** : `/evenements/a-traiter` **redirige vers `/tableau-de-bord`**.
3. **Administrateur, chemin 1** : convertir le premier. Il **disparaît de la liste**, et
   une demande d'origine « conversion » apparaît sur `/demandes`.
4. **Administrateur, chemin 2** : convertir le deuxième **sans choisir de faiseur de
   disciple** → le message `MESSAGE_FAISEUR_OBLIGATOIRE` s'affiche **à l'écran**. Choisir
   un faiseur, convertir → la personne disparaît de la liste et sa fiche est **active**.

   **Le dirigeant proposé n'est renseigné que SI le faiseur de disciple choisi a lui-même
   un dirigeant.** `dirigeantPropose(null)` rend `null` (`src/lib/domaine/arbre.ts`), et ce
   `null` est un résultat **légitime** : un faiseur de disciple qui est **racine** de
   l'arbre n'a aucun dirigeant à proposer. **Choisir donc, pour ce contrôle, un faiseur qui
   n'est PAS racine de l'arbre**, et **noter dans le rapport lequel a été choisi et quel
   est son propre dirigeant** — sans quoi la vérification échouerait pour une raison qui
   n'a rien à voir avec le code éprouvé, et un implémenteur irait chercher un défaut
   inexistant.
5. **Administrateur, chemin 3** : convertir le troisième vers une fiche **active**
   existante. Ouvrir cette fiche : **l'étiquette du séminaire y apparaît** (seconde branche
   de la vue, D70).
6. **Classement** : ajouter un quatrième externe avec désir, tenter de le classer **avec un
   motif vide** → `MESSAGE_MOTIF_OBLIGATOIRE_CLASSEMENT`. Avec un motif → il disparaît de
   la liste.

Nettoyer, **dans l'ordre imposé par les `on delete restrict`** :

```sql
delete from public.participations
where evenement_id in (select id from public.evenements where titre like 'ZZ%');
-- Les notifications du chemin 1 : le compte racine ne doit pas rester pollué.
delete from public.notifications
where demande_id in (
  select id from public.demandes_membre where origine = 'conversion_participant'
    and membre_id in (select id from public.membres where nom like 'ZZ%')
);
delete from public.demandes_membre
where membre_id in (select id from public.membres where nom like 'ZZ%');
delete from public.participants_externes where nom like 'ZZ%';
delete from public.membres where nom like 'ZZ%';
delete from public.evenements where titre like 'ZZ%';
```

⚠️ **`participants_externes` AVANT `membres`** : `converti_en_membre_id` est en
`on delete restrict`, et l'ordre inverse échouerait. **`demandes_membre` AVANT `membres`**
aussi : `membre_id` est en `on delete set null`, et l'ordre inverse **effacerait la prise**
juste avant qu'on la cherche. Vérifier ensuite par comptage :

```sql
select
  (select count(*) from public.participants_externes where nom like 'ZZ%') as externes,
  (select count(*) from public.membres where nom like 'ZZ%') as membres,
  (select count(*) from public.evenements where titre like 'ZZ%') as evenements;
```

**Attendu : `0, 0, 0`.**

- [ ] **Étape 6 : les six portes + le build de production**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls && npm run test:e2e && npm run build
```

```bash
npm run test:e2e:prod
```

```bash
git add src/lib/securite/garde.ts src/app/evenements/a-traiter
git commit -m "feat: liste a traiter, conversion en trois chemins et classement sans suite (D55, D65-D68, D74)"
```

---

### Task 22 : `/demandes` — l'origine `conversion_participant` (D64, D66)

**Fichiers :**
- Modifier : `src/app/demandes/actions.ts`
- Modifier : `src/lib/donnees/demandes.ts`
- Modifier : `src/app/demandes/ligne-demande-admin.tsx`
- Modifier : `src/app/demandes/ligne-demande-personnelle.tsx`
- Modifier : `src/app/demandes/page.tsx` (**commentaire seul**, aucun changement de
  comportement — étape 2, point 5)

**Interfaces :**
- Consomme : la valeur `conversion_participant` (T10), la passerelle amendée (T13).
- Produit : `DemandeListe['origine']` **élargi** à
  `'auto_inscription' | 'demande_suivi' | 'conversion_participant'` ;
  `validerDemandeNouvellePersonne(donnees: FormData): Promise<ResultatDemande>` **garde
  exactement sa signature**, sa garde d'origine acceptant désormais une troisième valeur.

## ⚠️ SANS CETTE TÂCHE, LE CHEMIN 1 EST UNE IMPASSE — ELLE N'EST PAS REJETABLE

La fiche créée par le chemin 1 naît `en_attente`. **Un seul geste de toute l'application
écrit `etat = 'actif'` sur une fiche `en_attente`** : la validation d'une demande, dans
`validerDemandeNouvellePersonne`. Rien d'autre ne le fait — `definir_arbre` n'écrit que les
trois colonnes de filiation et **jamais** `etat` ; `rejeterDemande` n'écrit que
`demandes_membre.etat` et ne touche pas la fiche ; `modifierMembre` ne porte aucune colonne
`etat` ; `desarchiverMembre` ne s'offre que sur une fiche `archive`.

Tant que la fiche reste `en_attente`, elle n'est lisible que de l'administrateur et de son
demandeur (`prive.peut_lire_membre`, T2) — donc **la seconde branche de
`seminaires_assistes` rend zéro ligne pour tout compte ordinaire**, et l'historique de
séminaire du converti, qui est la promesse centrale de la phase (D70), **n'est pas tenu sur
le chemin nominal de D66**. Et comme la conversion est à sens unique (D63), la demande
inannulable (D64) et le membre insupprimable (`on delete restrict`), une conversion par le
chemin 1 serait alors à la fois **irréversible et inachevable**.

C'est bien ce que le design demande : D66 justifie la ligne `demandes_membre` par « sans
elle, la fiche `en_attente` ne rejoindrait **aucun** circuit […] personne ne la validerait
jamais », et le §8.1 veut que ces demandes s'affichent « **comme les autres**, **sans**
l'action de rattachement et **sans** le bouton d'annulation ». **Deux** actions sont
retirées, pas trois : la validation reste.

**Quatre changements, et pas un de plus.**

1. **La garde d'origine de `validerDemandeNouvellePersonne` accepte
   `conversion_participant`** — c'est le changement qui referme la chaîne. Le reste de la
   fonction est déjà correct sans retouche : pour cette origine, la fiche reçoit
   `etat: 'actif'` **et rien d'autre** (aucun faiseur de disciple n'est posé depuis le
   convertisseur, ce qui est exactement le but), et `profils.membre_id` n'est pas écrasé.
2. **Le type `DemandeListe['origine']` est élargi.** Sans cela, `tsc` passe (le cast
   `as DemandeListe['origine']` masque la valeur nouvelle) mais **les comparaisons
   deviennent silencieusement fausses** : une demande de conversion serait traitée comme
   une `demande_suivi` par le `else` de `LigneDemandeAdmin`, qui afficherait le formulaire
   de validation **avec un dirigeant proposé calculé depuis le convertisseur** — une
   filiation qui n'a jamais eu lieu.
3. **L'action de rattachement n'est PAS proposée** pour cette origine (§7.3 de la 2b la
   réserve à `auto_inscription`) — c'est déjà le cas par construction, la branche
   `origine === 'auto_inscription'` étant la seule à la rendre. **Vérifier**, ne pas
   supposer.
4. **Le bouton d'annulation n'est PAS affiché** pour cette origine (D64). La passerelle le
   refuse déjà (`demande_conversion_non_annulable`), et la contrainte `on delete restrict`
   le refuserait encore après elle — **mais proposer un bouton qui échoue toujours est un
   mensonge d'interface**, et l'administrateur convertisseur est précisément celui à qui le
   bouton s'afficherait.

**La validation d'une demande de conversion emprunte-t-elle le chemin `demande_suivi` ?**
**Non, et c'est justement ce que la relecture d'`origine` garantit.**
`validerDemandeNouvellePersonne` **relit `origine` depuis `demandes_membre`**, jamais du
formulaire, et n'entre dans le bloc `origine === 'demande_suivi'` — celui qui pose le
demandeur comme faiseur de disciple — que pour cette valeur-là. Pour
`conversion_participant`, ce bloc **n'est pas pris**, le bloc `origine ===
'auto_inscription'` non plus : la fiche passe à `actif`, **sans faiseur de disciple**, et
le rattachement à l'arbre reste un geste séparé, fait ensuite depuis
`/membres/<id>/arbre`. Le formulaire `FormulaireValidationSuivi` (celui qui propose un
dirigeant) n'est donc **pas** rendu pour cette origine — seul l'est le **bouton**
« Valider comme nouvelle personne ».

**Et le rejet, alors ?** Le formulaire de rejet reste rendu pour cette origine comme pour
les deux autres, et c'est délibéré : c'est la seule façon de sortir de la liste une
conversion faite par erreur, l'annulation étant fermée par D64. **Mais il faut savoir ce
qu'il fait exactement, parce que ce n'est pas ce qu'on croit** : `rejeterDemande` écrit
`demandes_membre.etat = 'rejetee'` et **rien d'autre**. Il **ne défait pas la conversion**,
**ne supprime pas la fiche**, et la laisse `en_attente` — or la validation exige une
demande `en_attente`, donc **après un rejet, plus aucun geste ne peut activer cette
fiche**. Second effet à connaître : la notification `demande_rejetee`, titrée « Votre
demande a été rejetée », part vers le **demandeur relu depuis la demande**, c'est-à-dire
vers **l'administrateur convertisseur lui-même**. Ce n'est pas un défaut de destinataire —
il *est* le demandeur — mais c'est une raison de plus de ne jamais présenter le rejet comme
la marche à suivre normale après une conversion. **La marche à suivre normale est
« Valider ».**

- [ ] **Étape 0 : ouvrir la validation à l'origine `conversion_participant`**

Dans `src/app/demandes/actions.ts`, dans `validerDemandeNouvellePersonne`, **remplacer** la
condition de refus qui suit la lecture de la demande :

```typescript
  if (
    erreurLecture ||
    !demandeLue ||
    !demandeLue.membre_id ||
    (demandeLue.origine !== 'auto_inscription' && demandeLue.origine !== 'demande_suivi')
  ) {
```

par :

```typescript
  if (
    erreurLecture ||
    !demandeLue ||
    !demandeLue.membre_id ||
    // TROIS ORIGINES VALIDABLES DEPUIS CET ÉCRAN. `conversion_participant` (D66) est
    // ajoutée par la phase 4 : le chemin 1 de la conversion d'un participant externe crée
    // une fiche `en_attente` et cette demande, et LA VALIDATION EST LE SEUL GESTE DE TOUTE
    // L'APPLICATION QUI PASSE UNE FICHE `en_attente` À `actif`. Sans elle, la fiche reste
    // invisible de tout compte ordinaire (`prive.peut_lire_membre` ne l'ouvre qu'à
    // l'administrateur et à son demandeur), l'historique de séminaire du converti ne
    // s'affiche nulle part (seconde branche de `seminaires_assistes`), et la conversion
    // devient irréversible ET inachevable — la demande n'étant pas annulable (D64) et le
    // membre pas supprimable (`on delete restrict`).
    // CE QUE CETTE ORIGINE DÉCLENCHE, ET C'EST TOUT : `etat = 'actif'` sur la fiche. Elle
    // n'entre NI dans le bloc `demande_suivi` (qui poserait le demandeur comme faiseur de
    // disciple — or le demandeur est ici l'administrateur qui a converti, et il n'est pas
    // le faiseur de disciple de la personne convertie), NI dans le bloc `auto_inscription`
    // (qui écrirait `profils.membre_id` du demandeur — or il a déjà sa propre fiche).
    // Le rattachement à l'arbre est un geste SÉPARÉ, fait ensuite depuis
    // `/membres/<id>/arbre`.
    (demandeLue.origine !== 'auto_inscription' &&
      demandeLue.origine !== 'demande_suivi' &&
      demandeLue.origine !== 'conversion_participant')
  ) {
```

**Rien d'autre n'est touché dans cette fonction**, et c'est le point : la mise à jour de la
fiche écrit déjà `etat: 'actif'` par défaut pour toute origine, le passage de la demande à
`validee` est commun, la notification `demande_validee` part vers le demandeur relu depuis
la demande — ici l'administrateur convertisseur, ce qui est **exact**, c'est bien lui qui a
demandé —, et `marquerNouvelleDemandeLue` éteint la notification `nouvelle_demande` que la
conversion avait envoyée aux administrateurs.

⚠️ **Ce bloc est le même avant et après la Task 3.** La Task 3 réécrit le bloc
`colonnesMembre` et l'`update` de `membres` qui le suivent ; elle **ne touche pas** cette
condition de refus. La substitution ci-dessus s'applique donc telle quelle, que la Task 3
ait été faite, rejetée, ou pas encore faite.

- [ ] **Étape 1 : élargir le type**

Dans `src/lib/donnees/demandes.ts`, remplacer :

```typescript
  origine: 'auto_inscription' | 'demande_suivi'
```

par :

```typescript
  // Élargi par la phase 4 (D66). SANS CET ÉLARGISSEMENT, `tsc` passerait quand même — le
  // cast `as DemandeListe['origine']` de `versDemandeListe` masque la valeur nouvelle —
  // mais toutes les comparaisons deviendraient SILENCIEUSEMENT FAUSSES : une demande de
  // conversion tomberait dans le `else` de `LigneDemandeAdmin` et s'y verrait proposer le
  // formulaire de validation d'une demande de suivi, avec un dirigeant proposé calculé
  // depuis le CONVERTISSEUR — une filiation qui n'a jamais eu lieu.
  origine: 'auto_inscription' | 'demande_suivi' | 'conversion_participant'
```

- [ ] **Étape 2 : la ligne administrateur, et le commentaire de la proposition de dirigeant**

Dans `src/app/demandes/ligne-demande-admin.tsx` :

1. **Introduire** une constante `LIBELLE_ORIGINE` — **il n'y a rien à remplacer sous ce
   nom : ce fichier ne porte aucune constante de libellé d'origine**, mais un **ternaire en
   ligne** dans le JSX (`demande.origine === 'auto_inscription' ? 'Auto-inscription' :
   'Demande de suivi'`). Un ternaire à deux issues ne peut pas porter une troisième valeur
   sans la faire tomber en silence dans « Demande de suivi ». Ajouter donc, en tête de
   fichier, à côté des autres constantes de module :

```typescript
// Table exhaustive plutôt qu'un ternaire : `Record<DemandeListe['origine'], string>` fait
// ÉCHOUER `tsc` le jour où une quatrième origine sera ajoutée à l'énumération, là où un
// ternaire l'aurait silencieusement étiquetée comme la branche `else`. C'est exactement ce
// qui serait arrivé à `conversion_participant`, affichée « Demande de suivi ».
const LIBELLE_ORIGINE: Record<DemandeListe['origine'], string> = {
  auto_inscription: 'Auto-inscription',
  demande_suivi: 'Demande de suivi',
  conversion_participant: 'Conversion de participant',
}
```

et **remplacer par elle le ternaire du JSX** :

```typescript
        <span className="text-sm text-neutral-500">
          {LIBELLE_ORIGINE[demande.origine]} · par {demande.demandeurNom}
        </span>
```

2. **Renommer le gestionnaire `validerNouvellePersonneAutoInscription` en
   `validerNouvellePersonne`, et reprendre son unique appelant existant** (le `onClick` du
   bouton de la branche `auto_inscription`). Ce gestionnaire ne pose que `demandeId` dans
   le `FormData` : il n'a jamais rien eu de propre à l'auto-inscription, et le serveur relit
   `origine` depuis `demandes_membre`. Il sert désormais **deux** branches, et son ancien
   nom mentirait sur la seconde.

```typescript
  function validerNouvellePersonne() {
    const donnees = new FormData()
    donnees.set('demandeId', demande.id)
    appeler(validerDemandeNouvellePersonne, donnees)
  }
```

3. Remplacer le ternaire `demande.origine === 'auto_inscription' ? (…) : (…)` par une
   sélection **explicite à trois branches** :

```typescript
      {demande.origine === 'auto_inscription' ? (
        <div className="mt-3 flex flex-col gap-3">
          {/* … bloc existant : bouton « Valider comme nouvelle personne » et formulaire de
              rattachement (D26). SEUL CHANGEMENT dans ce bloc : le `onClick` du bouton
              appelle désormais `validerNouvellePersonne` (renommage du point 2).
              L'action de rattachement N'EST PAS proposée pour les deux autres origines —
              §7.3 de la 2b la réserve à auto_inscription. */}
        </div>
      ) : demande.origine === 'demande_suivi' ? (
        <FormulaireValidationSuivi
          demandeId={demande.id}
          membreId={demande.membreId ?? ''}
          dirigeantInitial={dirigeantInitial}
        />
      ) : (
        // D66 — origine `conversion_participant`. LE BOUTON DE VALIDATION, SEUL.
        //
        // PAS le formulaire de rattachement (§7.3 de la 2b le réserve à auto_inscription),
        // PAS `FormulaireValidationSuivi` : ce dernier poserait le DEMANDEUR comme faiseur
        // de disciple, et le demandeur est ici l'administrateur qui a converti — il n'est
        // pas le faiseur de disciple de la personne convertie.
        //
        // MAIS LA VALIDATION, OUI, ET ELLE EST INDISPENSABLE : c'est LE SEUL GESTE DE TOUTE
        // L'APPLICATION qui passe une fiche `en_attente` à `actif`. Sans elle, la fiche née
        // du chemin 1 resterait invisible de tout compte ordinaire, son historique de
        // séminaire n'apparaîtrait nulle part, et la conversion serait irréversible ET
        // inachevable. Pour cette origine, la validation écrit `etat = 'actif'` ET RIEN
        // D'AUTRE — aucun faiseur de disciple n'est posé.
        <div className="mt-3 flex flex-col gap-2">
          <button
            type="button"
            onClick={validerNouvellePersonne}
            disabled={enCours}
            className="self-start rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            Valider comme nouvelle personne
          </button>
          <p className="text-sm text-neutral-600">
            Fiche créée par conversion d&apos;un participant externe. La validation la fait
            passer à l&apos;état actif, sans lui donner de faiseur de disciple : rattachez-la
            ensuite depuis{' '}
            <Link href={`/membres/${demande.membreId}/arbre`} className="underline underline-offset-4">
              son arborescence
            </Link>
            . Le rejet, lui, ne défait pas la conversion : la fiche resterait en attente,
            sans plus aucun geste pour l&apos;activer.
          </p>
        </div>
      )}
```

4. Ajouter l'import manquant en tête du fichier :

```typescript
import Link from 'next/link'
```

5. **Dans `src/app/demandes/page.tsx`, corriger le commentaire de la branche `else` du
   calcul de `propositionsDirigeant`.** Le **comportement est déjà correct et ne change
   pas** : seule l'origine `demande_suivi` reçoit une proposition de dirigeant, toutes les
   autres reçoivent `null`, et c'est exactement ce qu'il faut pour une conversion — le
   demandeur est l'administrateur convertisseur, sa filiation n'a rien à voir avec la
   personne convertie. Mais le commentaire n'énumère que deux cas et deviendrait **faux par
   omission**. Remplacer :

```typescript
        // Compte racine sans fiche liée (spec D11), ou origine auto_inscription :
        // aucune proposition (registre 1c, piège n°3).
```

par :

```typescript
        // Aucune proposition de dirigeant (registre 1c, piège n°3). Trois cas y tombent :
        // origine `auto_inscription` ; origine `conversion_participant` (D66 — le demandeur
        // est l'administrateur qui a converti, et sa filiation n'a rien à voir avec la
        // personne convertie ; sa ligne ne rend d'ailleurs PAS `FormulaireValidationSuivi`,
        // qui est le seul consommateur de cette proposition) ; et le compte racine, sans
        // fiche liée (spec D11).
```

- [ ] **Étape 3 : la ligne personnelle — pas de bouton d'annulation (D64)**

Dans `src/app/demandes/ligne-demande-personnelle.tsx`, remplacer la condition du bouton :

```typescript
      {demande.etat === 'en_attente' ? (
```

par :

```typescript
      {/*
        D64 — le bouton d'annulation n'est PAS proposé pour une demande issue d'une
        CONVERSION. L'annulation supprime la fiche `en_attente` (D42, phase 2b), et
        `participants_externes.converti_en_membre_id` pointe sur elle : le participant
        serait DÉCONVERTI en silence, son historique de séminaire perdu, et il
        réapparaîtrait dans la liste « à traiter ».
        DEUX barrières le refusent déjà côté serveur — `annuler_demande_membre` amendée
        (marqueur `demande_conversion_non_annulable`) et la contrainte `on delete restrict`
        — mais AFFICHER UN BOUTON QUI ÉCHOUE TOUJOURS est un mensonge d'interface, et
        l'administrateur convertisseur est précisément celui à qui il s'afficherait.
      */}
      {demande.etat === 'en_attente' && demande.origine !== 'conversion_participant' ? (
```

Et ajouter, juste après le bloc du bouton :

```typescript
      {demande.etat === 'en_attente' && demande.origine === 'conversion_participant' ? (
        <p className="mt-2 text-sm text-neutral-500">
          Cette fiche vient d&apos;une conversion de participant : elle ne peut pas être
          annulée, sous peine de perdre l&apos;historique de séminaire de cette personne.
        </p>
      ) : null}
```

- [ ] **Étape 4 : vérification manuelle**

1. Convertir un participant par le **chemin 1** (Task 21). **Noter le nom donné à la fiche**
   et l'identifiant du membre créé — les points 5 et 6 en ont besoin.
2. **Administrateur**, sur `/demandes` : la ligne apparaît dans « À traiter », étiquetée
   **« Conversion de participant »**, avec le **bouton « Valider comme nouvelle
   personne »**, **sans** formulaire de rattachement et **sans** le formulaire de
   validation d'une demande de suivi (celui qui propose un dirigeant). **Contrôle positif
   dans la même page** : une demande d'origine `demande_suivi`, elle, **affiche bien** son
   formulaire de validation avec son dirigeant proposé.
3. Dans « Mes demandes », la ligne de conversion **n'a pas de bouton « Annuler »**.
   **Contrôle positif** : une demande d'origine `demande_suivi` du même compte **a bien** le
   sien.
4. **LE CONTRÔLE NÉGATIF, AVANT DE VALIDER** — depuis un **compte ordinaire** (ni
   administrateur, ni modérateur, et qui n'est pas le demandeur), ouvrir la fiche du membre
   créé au point 1 : elle est **introuvable**, et le nom **n'apparaît pas dans l'annuaire**.
   C'est normal et voulu : une fiche `en_attente` n'est lisible que de l'administrateur et
   de son demandeur.
5. **VALIDER.** Cliquer « Valider comme nouvelle personne » sur la ligne de conversion. La
   ligne quitte « À traiter ». Relire la fiche en base :

```sql
select m.etat, m.faiseur_de_disciple_id, d.etat as etat_demande
from public.membres m
join public.demandes_membre d on d.membre_id = m.id
where m.nom = '<NOM_DE_LA_FICHE_CREEE>';
```

   **Attendu : `actif`, `null`, `validee`.** Le `null` n'est pas un oubli — la validation
   d'une conversion ne pose **aucun** faiseur de disciple, l'administrateur convertisseur
   n'étant pas le faiseur de disciple de la personne convertie. Si `faiseur_de_disciple_id`
   est renseigné, c'est que la demande a emprunté le chemin `demande_suivi` : **s'arrêter**,
   la garde d'origine ou la branche d'affichage est fausse.
6. **LA PROMESSE DE LA PHASE, DEPUIS UN COMPTE ORDINAIRE** — avec le **même compte
   ordinaire** qu'au point 4, rouvrir la fiche du converti : elle est maintenant
   **lisible**, et **l'étiquette du séminaire y apparaît** (seconde branche de
   `seminaires_assistes`, D70). C'est le contrôle qui distingue « la conversion a créé une
   fiche » de « la conversion a rendu son historique visible ».
7. **La cloche des administrateurs** : la notification « Participant externe converti, à
   valider » est passée **lue** après la validation (`marquerNouvelleDemandeLue`), et
   l'administrateur convertisseur reçoit une notification « Votre demande a été validée » —
   il **est** le demandeur de cette demande, c'est exact. **Ne pas rejeter** cette demande
   pour la « retirer de la liste » : le rejet ne défait pas la conversion, laisse la fiche
   `en_attente` pour toujours, et enverrait au convertisseur un « Votre demande a été
   rejetée » sur sa propre demande.
8. **La preuve que le bouton d'annulation absent n'est pas la seule barrière** est portée
   par la Task 24, preuve n°11 (appel forgé de la passerelle).

Nettoyer selon l'ordre de la Task 21, étape 5 — **dont la suppression des notifications par
`demande_id`**, qui emporte aussi bien le `nouvelle_demande` du chemin 1 que le
`demande_validee` du point 5. Le compte racine ne doit pas rester pollué.

- [ ] **Étape 5 : la suite e2e des demandes passe INCHANGÉE**

Cette tâche touche `validerDemandeNouvellePersonne` et renomme un gestionnaire de
`LigneDemandeAdmin`. `tests/e2e/demandes.spec.ts` couvre déjà la validation des deux
origines existantes — l'un des quatre parcours Playwright canoniques du §8 de la
spécification maîtresse — et cible le bouton par son **libellé** (« Valider comme nouvelle
personne »), pas par le nom du gestionnaire. Il doit donc passer **sans modification** : la
garde d'origine ne fait que **s'élargir**, elle ne retire aucune origine, et le libellé du
bouton ne change pas.

```bash
npm run test:e2e -- tests/e2e/demandes.spec.ts
```

```bash
git diff --stat tests/e2e/demandes.spec.ts
```

Attendu : vert, et **aucune ligne de diff**. Un échec ici signifierait qu'une origine a été
perdue en réécrivant la condition — la relire **valeur par valeur**.

- [ ] **Étape 6 : les six portes + le build de production**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls && npm run test:e2e && npm run build
```

```bash
npm run test:e2e:prod
```

```bash
git add src/app/demandes/actions.ts src/lib/donnees/demandes.ts src/app/demandes/page.tsx src/app/demandes/ligne-demande-admin.tsx src/app/demandes/ligne-demande-personnelle.tsx
git commit -m "feat: valider et afficher l'origine conversion_participant, sans rattachement ni annulation (D64, D66)"
```

---

# Partie F — Preuves

**Rappels valables pour les cinq tâches de cette partie :**

- **Les suites écrivent en base de PRODUCTION.** Chaque fichier a sa **famille** de
  préfixe, **avec tiret littéral** pour qu'une famille ne puisse pas en ramasser une autre.
- **Le nettoyage vit dans un `afterAll`**, jamais en dernière instruction d'un corps de
  test — celui-ci ne s'exécute pas si une assertion tombe avant.
- **Le nettoyage est vérifié par COMPTAGE**, et il porte sur **la même famille** que la
  suppression : un balayage plus large que la suppression rend la suite **rouge pour
  toujours** après une seule interruption.
- **Ordre de suppression imposé** : `participations` → `notifications` →
  `demandes_membre` → `participants_externes` → `membres` → `evenements` →
  `types_evenement`, **puis** le compte de test. `converti_en_membre_id` est en
  `on delete restrict` ; `demandes_membre.membre_id`, `evenements.cree_par`,
  `participations.saisi_par` et `participants_externes.cree_par` sont en
  `on delete set null` — supprimer le compte trop tôt **efface la prise juste avant qu'on
  la cherche**.
- **Compter des DELTAS**, jamais des totaux absolus.
- **Tout `insert` de préparation vérifie son erreur et LÈVE.** Un insert dont l'erreur est
  jetée rend le test vert en éprouvant un tout autre chemin — **trouvé trois fois**.
- **Aucune assertion négative sans contrôle positif dans la MÊME situation.**
- **Toute mutation de barrière est restaurée immédiatement**, et la définition restaurée
  est **comparée à l'originale**. Le projet n'a **qu'une** base.

### Task 23 : `tests/rls/evenements.test.ts` — schéma, RLS et les deux vues (preuves 1, 2, 4, 5, 6, 7, 8, 17)

**Fichiers :**
- Créer : `tests/rls/evenements.test.ts`

**Interfaces :**
- Consomme : tout ce que les Tasks 4 à 12 ont posé en base.
- Produit : la couverture des preuves n°1, 2, 4, 5, 6, 7, 8 et 17 du §9 du design.

**Famille : `ZZEvt-`** (tiret littéral). Trois comptes de test :
`test.rls.evt.simple` (aucun rôle), `test.rls.evt.moderateur` (rôle `moderateur`),
`test.rls.evt.admin` (rôle `administrateur`).

⚠️ **Le compte administrateur de test recevra les notifications `nouvelle_demande` que
d'autres suites déclenchent.** Ce n'est pas un problème ici (cette suite n'emprunte pas le
chemin 1), mais **ne jamais donner le rôle `administrateur` à un compte de test sans le
supprimer dans l'`afterAll`** : un compte administrateur de test laissé actif ferait
recevoir à chaque conversion future une notification de plus, indéfiniment.

- [ ] **Étape 1 : écrire la suite**

Créer `tests/rls/evenements.test.ts` :

```typescript
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const CLE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const CLE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

const MDP = `Test-${crypto.randomUUID()}`
const IDENT_SIMPLE = 'test.rls.evt.simple'
const IDENT_MODERATEUR = 'test.rls.evt.moderateur'
const IDENT_ADMIN = 'test.rls.evt.admin'
const IDENTS = [IDENT_SIMPLE, IDENT_MODERATEUR, IDENT_ADMIN]

// FAMILLE, avec TIRET LITTÉRAL : `ZZEvt-%` ne peut pas ramasser `ZZEvtConv-%` ni
// `ZZEvtPage-%`, qui ont chacune leur fichier et leur nettoyage. Le suffixe aléatoire évite
// une collision avec une exécution interrompue dont le nettoyage aurait échoué ; le
// balayage, lui, porte sur la FAMILLE, pas sur ce suffixe — sinon une seule interruption
// laisserait des résidus que plus rien ne retrouve.
const FAMILLE = 'ZZEvt-'
const PREFIXE = `${FAMILLE}${crypto.randomUUID().slice(0, 8)}`

const admin = createClient(URL, CLE_SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
})

let clientSimple: SupabaseClient
let clientModerateur: SupabaseClient
let idProfilSimple: string
let idTypeWebinaire: string
let idEvenement: string
let idMembreActif: string
let idMembreArchive: string
let idExterne: string

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

async function creerCompte(identifiant: string, role: 'moderateur' | 'administrateur' | null): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email: `${identifiant}@asonkeng.local`,
    password: MDP,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`création du compte ${identifiant} impossible : ${error?.message}`)
  const { error: erreurProfil } = await admin
    .from('profils')
    .insert({ id: data.user.id, identifiant, nom_affichage: `Test ${identifiant}` })
  if (erreurProfil) {
    await admin.auth.admin.deleteUser(data.user.id)
    throw new Error(`insertion du profil ${identifiant} impossible : ${erreurProfil.message}`)
  }
  if (role) {
    const { error: erreurRole } = await admin
      .from('roles_profil')
      .insert({ profil_id: data.user.id, role })
    if (erreurRole) {
      await admin.auth.admin.deleteUser(data.user.id)
      throw new Error(`attribution du rôle ${role} impossible : ${erreurRole.message}`)
    }
  }
  return data.user.id
}

async function connecter(identifiant: string): Promise<SupabaseClient> {
  const client = createClient(URL, CLE_ANON, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error } = await client.auth.signInWithPassword({
    email: `${identifiant}@asonkeng.local`,
    password: MDP,
  })
  if (error) throw new Error(`connexion ${identifiant} impossible : ${error.message}`)
  return client
}

/**
 * Balayage de FAMILLE : retrouve ce qu'une exécution ANTÉRIEURE interrompue a laissé sous
 * `ZZEvt-` avec un AUTRE suffixe, que les variables de cette exécution ne peuvent pas
 * connaître.
 *
 * L'ORDRE FAIT PARTIE DU REMÈDE, il n'est pas cosmétique :
 *  - `participations` d'abord — `membre_id` et `participant_externe_id` sont en
 *    `on delete restrict`, supprimer les personnes avant échouerait ;
 *  - `participants_externes` AVANT `membres` — `converti_en_membre_id` est en
 *    `on delete restrict` ;
 *  - `evenements` après `participations` — le `cascade` de `evenement_id` ferait le travail,
 *    mais la suppression explicite garde ce fichier lisible si le régime changeait ;
 *  - `types_evenement` en dernier — `evenements.type_id` est en `on delete restrict`.
 */
async function nettoyerFamille() {
  const { data: evts, error: erreurEvts } = await admin
    .from('evenements')
    .select('id')
    .like('titre', `${FAMILLE}%`)
  if (erreurEvts) throw new Error(`balayage des évènements impossible : ${erreurEvts.message}`)
  const idsEvts = (evts ?? []).map((e) => e.id as string)

  const { data: externes, error: erreurExternes } = await admin
    .from('participants_externes')
    .select('id')
    .like('nom', `${FAMILLE}%`)
  if (erreurExternes) throw new Error(`balayage des externes impossible : ${erreurExternes.message}`)
  const idsExternes = (externes ?? []).map((x) => x.id as string)

  const { data: membres, error: erreurMembres } = await admin
    .from('membres')
    .select('id')
    .like('nom', `${FAMILLE}%`)
  if (erreurMembres) throw new Error(`balayage des membres impossible : ${erreurMembres.message}`)
  const idsMembres = (membres ?? []).map((m) => m.id as string)

  if (idsEvts.length > 0) {
    const { error } = await admin.from('participations').delete().in('evenement_id', idsEvts)
    if (error) throw new Error(`nettoyage des participations impossible : ${error.message}`)
  }
  if (idsExternes.length > 0) {
    const { error } = await admin.from('participations').delete().in('participant_externe_id', idsExternes)
    if (error) throw new Error(`nettoyage des participations d externes impossible : ${error.message}`)
  }
  if (idsMembres.length > 0) {
    const { error } = await admin.from('participations').delete().in('membre_id', idsMembres)
    if (error) throw new Error(`nettoyage des participations de membres impossible : ${error.message}`)
  }
  if (idsExternes.length > 0) {
    const { error } = await admin.from('participants_externes').delete().in('id', idsExternes)
    if (error) throw new Error(`nettoyage des externes impossible : ${error.message}`)
  }
  if (idsMembres.length > 0) {
    const { error } = await admin.from('membres').delete().in('id', idsMembres)
    if (error) throw new Error(`nettoyage des membres impossible : ${error.message}`)
  }
  if (idsEvts.length > 0) {
    const { error } = await admin.from('evenements').delete().in('id', idsEvts)
    if (error) throw new Error(`nettoyage des évènements impossible : ${error.message}`)
  }
  const { error: erreurTypes } = await admin
    .from('types_evenement')
    .delete()
    .like('libelle', `${FAMILLE}%`)
  if (erreurTypes) throw new Error(`nettoyage des types impossible : ${erreurTypes.message}`)
}

beforeAll(async () => {
  // Le balayage AVANT la suppression des comptes : `cree_par` et `saisi_par` sont en
  // `on delete set null`, et supprimer d'abord les comptes ferait disparaître une prise
  // qu'on n'a pas encore utilisée.
  await nettoyerFamille()
  for (const identifiant of IDENTS) await supprimerCompte(identifiant)

  idProfilSimple = await creerCompte(IDENT_SIMPLE, null)
  await creerCompte(IDENT_MODERATEUR, 'moderateur')
  await creerCompte(IDENT_ADMIN, 'administrateur')
  clientSimple = await connecter(IDENT_SIMPLE)
  clientModerateur = await connecter(IDENT_MODERATEUR)

  const { data: type, error: erreurType } = await admin
    .from('types_evenement')
    .select('id')
    .eq('libelle', 'Webinaire')
    .maybeSingle()
  if (erreurType || !type) {
    throw new Error(
      `le type amorcé « Webinaire » est introuvable : ${erreurType?.message ?? "l'amorçage de types_evenement n'a pas joué"}`,
    )
  }
  idTypeWebinaire = type.id as string

  const { data: evt, error: erreurEvt } = await admin
    .from('evenements')
    .insert({ titre: `${PREFIXE}-evenement`, type_id: idTypeWebinaire, date_debut: '2026-09-01' })
    .select('id')
    .single()
  if (erreurEvt || !evt) throw new Error(`création de l évènement impossible : ${erreurEvt?.message}`)
  idEvenement = evt.id as string

  const { data: mActif, error: erreurActif } = await admin
    .from('membres')
    .insert({ nom: `${PREFIXE}-actif`, prenom: 'Test', etat: 'actif' })
    .select('id')
    .single()
  if (erreurActif || !mActif) throw new Error(`création du membre actif impossible : ${erreurActif?.message}`)
  idMembreActif = mActif.id as string

  const { data: mArchive, error: erreurArchive } = await admin
    .from('membres')
    .insert({ nom: `${PREFIXE}-archive`, prenom: 'Test', etat: 'archive' })
    .select('id')
    .single()
  if (erreurArchive || !mArchive) throw new Error(`création du membre archivé impossible : ${erreurArchive?.message}`)
  idMembreArchive = mArchive.id as string

  const { data: ext, error: erreurExt } = await admin
    .from('participants_externes')
    .insert({ nom: `${PREFIXE}-externe`, prenom: 'Test' })
    .select('id')
    .single()
  if (erreurExt || !ext) throw new Error(`création de l externe impossible : ${erreurExt?.message}`)
  idExterne = ext.id as string

  // Deux participations : un membre ACTIF (visible de tous par la vue) et un membre
  // ARCHIVÉ (invisible d'un compte ordinaire, preuve n°6).
  const { error: erreurParts } = await admin.from('participations').insert([
    { evenement_id: idEvenement, membre_id: idMembreActif, desir_suivi_spirituel: false },
    { evenement_id: idEvenement, membre_id: idMembreArchive, desir_suivi_spirituel: false },
    { evenement_id: idEvenement, participant_externe_id: idExterne, desir_suivi_spirituel: true },
  ])
  if (erreurParts) throw new Error(`création des participations impossible : ${erreurParts.message}`)
})

afterAll(async () => {
  await nettoyerFamille()

  // NETTOYAGE VÉRIFIÉ PAR COMPTAGE, sur la MÊME famille que la suppression ci-dessus.
  // C'est la concordance entre les deux qui manquait dans un fichier antérieur du projet
  // et qui l'avait rendu rouge pour toujours après une seule interruption.
  for (const [table, colonne] of [
    ['evenements', 'titre'],
    ['participants_externes', 'nom'],
    ['membres', 'nom'],
    ['types_evenement', 'libelle'],
  ] as const) {
    const { count, error } = await admin
      .from(table)
      .select('id', { count: 'exact', head: true })
      .like(colonne, `${FAMILLE}%`)
    expect(error).toBeNull()
    expect(count).toBe(0)
  }

  // Les comptes EN DERNIER : `cree_par` / `saisi_par` sont en `on delete set null`, et les
  // supprimer plus tôt effacerait la prise avant qu'on la cherche.
  for (const identifiant of IDENTS) await supprimerCompte(identifiant)
})

describe('types_evenement (preuve n°17)', () => {
  it("l'amorçage a créé les quatre types nommés par le §4.4 — on COMPTE, on ne déduit pas", async () => {
    const { data, error } = await admin
      .from('types_evenement')
      .select('libelle')
      .in('libelle', ['Webinaire', 'Séminaire académique', 'Pic-nic', 'Retraite spirituelle'])
    expect(error).toBeNull()
    // Assertion d'INCLUSION par le compte exact des quatre visés, pas d'égalité stricte sur
    // toute la table : un administrateur a pu en créer d'autres depuis.
    expect((data ?? []).length).toBe(4)
  })

  it("rejouer l'amorçage ne crée aucun doublon (D57), avec le total mesuré avant et après", async () => {
    const { count: avant, error: erreurAvant } = await admin
      .from('types_evenement')
      .select('id', { count: 'exact', head: true })
    expect(erreurAvant).toBeNull()
    // Contrôle positif : une base sans aucun type rendrait cette preuve VIDE.
    expect(avant).toBeGreaterThan(0)

    // Exactement l'instruction de la migration, `on conflict` compris. Si la clause avait
    // été omise, cet insert lèverait un 23505 et le test tomberait ici.
    const { error: erreurRejeu } = await admin
      .from('types_evenement')
      .upsert(
        [
          { libelle: 'Webinaire' },
          { libelle: 'Séminaire académique' },
          { libelle: 'Pic-nic' },
          { libelle: 'Retraite spirituelle' },
        ],
        { onConflict: 'libelle', ignoreDuplicates: true },
      )
    expect(erreurRejeu).toBeNull()

    const { count: apres } = await admin
      .from('types_evenement')
      .select('id', { count: 'exact', head: true })
    // DELTA nul, et non un total absolu : un comptage absolu serait vrai au premier
    // lancement et faux pour toujours ensuite.
    expect(apres).toBe(avant)
  })

  it('un compte actif lit le catalogue ; un visiteur anonyme non', async () => {
    const { data, error } = await clientSimple.from('types_evenement').select('id').limit(1)
    expect(error).toBeNull()
    expect((data ?? []).length).toBe(1)

    const anonyme = createClient(URL, CLE_ANON, { auth: { autoRefreshToken: false, persistSession: false } })
    const { error: erreurAnonyme } = await anonyme.from('types_evenement').select('id').limit(1)
    expect(erreurAnonyme).not.toBeNull()
    expect(erreurAnonyme!.code).toBe('42501')
  })
})

describe('participations : contrainte et index (preuves n°1 et n°2)', () => {
  it("refuse les DEUX références nulles ET les deux remplies (D59) — les deux sens, pas une moitié", async () => {
    const { error: erreurDeuxNulles } = await admin
      .from('participations')
      .insert({ evenement_id: idEvenement })
    expect(erreurDeuxNulles).not.toBeNull()
    expect(erreurDeuxNulles!.code).toBe('23514')

    const { error: erreurDeuxRemplies } = await admin.from('participations').insert({
      evenement_id: idEvenement,
      membre_id: idMembreActif,
      participant_externe_id: idExterne,
    })
    expect(erreurDeuxRemplies).not.toBeNull()
    expect(erreurDeuxRemplies!.code).toBe('23514')
  })

  it("refuse deux fois le même membre au même évènement, et deux fois le même externe", async () => {
    const { error: erreurMembre } = await admin
      .from('participations')
      .insert({ evenement_id: idEvenement, membre_id: idMembreActif })
    expect(erreurMembre).not.toBeNull()
    expect(erreurMembre!.code).toBe('23505')

    const { error: erreurExterne } = await admin
      .from('participations')
      .insert({ evenement_id: idEvenement, participant_externe_id: idExterne })
    expect(erreurExterne).not.toBeNull()
    expect(erreurExterne!.code).toBe('23505')
  })

  it("DEUX EXTERNES DIFFÉRENTS COEXISTENT sur le même évènement — l'assertion qui attrape un `nulls not distinct` posé par habitude (D58)", async () => {
    // AUCUNE des deux assertions précédentes n'attrape ce défaut : sous
    // `unique nulls not distinct (evenement_id, membre_id)`, toutes les lignes d'externes
    // partagent membre_id = NULL et s'écrasent entre elles — le SECOND externe ajouté
    // recevrait un 23505 opaque, et l'application n'accepterait qu'UN SEUL participant
    // externe par évènement.
    const { data: x2, error: erreurX2 } = await admin
      .from('participants_externes')
      .insert({ nom: `${PREFIXE}-externe2` })
      .select('id')
      .single()
    expect(erreurX2).toBeNull()

    const { data: x3, error: erreurX3 } = await admin
      .from('participants_externes')
      .insert({ nom: `${PREFIXE}-externe3` })
      .select('id')
      .single()
    expect(erreurX3).toBeNull()

    const { error: erreurP2 } = await admin
      .from('participations')
      .insert({ evenement_id: idEvenement, participant_externe_id: x2!.id })
    expect(erreurP2).toBeNull()

    const { error: erreurP3 } = await admin
      .from('participations')
      .insert({ evenement_id: idEvenement, participant_externe_id: x3!.id })
    expect(erreurP3).toBeNull()

    // Trois externes sur le même évènement, constatés EN BASE : c'est le fait, pas
    // l'absence d'erreur, qui prouve.
    const { count } = await admin
      .from('participations')
      .select('id', { count: 'exact', head: true })
      .eq('evenement_id', idEvenement)
      .not('participant_externe_id', 'is', null)
    expect(count).toBe(3)
  })

  // LA DÉFINITION DES DEUX INDEX (`WHERE ... IS NOT NULL`, absence de
  // `NULLS NOT DISTINCT`) N'EST PAS VÉRIFIABLE D'ICI : `pg_indexes` n'est pas exposé à
  // PostgREST, et l'exposer par une fonction SQL dédiée ouvrirait une lecture du catalogue
  // pour le seul confort d'un test. Cette vérification vit à l'ÉTAPE 3 de la Task 23, en
  // SQL direct, et sa sortie est consignée dans le rapport de tâche. On ne pose PAS ici un
  // test qui passerait toujours : un test inerte est pire qu'un test absent — il donne
  // l'apparence d'une couverture. Le test « DEUX EXTERNES DIFFÉRENTS COEXISTENT » ci-dessus
  // est, lui, la preuve COMPORTEMENTALE du même fait, et il tomberait sous
  // `nulls not distinct`.
})

describe('seminaires_assistes : les cinq colonnes et le contournement (preuves n°4, 5, 6)', () => {
  it("expose EXACTEMENT cinq colonnes, nommées — aucune ne porte un désir (D73)", async () => {
    // Assertion sur la FORME de la vue, pas sur ce qu'un écran affiche : elle attrape une
    // colonne ajoutée un jour « pour la commodité », ce qu'un test d'écran ne fait pas.
    // `information_schema` n'étant pas exposé à PostgREST, on lit une ligne et on inspecte
    // ses clés.
    //
    // ⚠️ LECTURE PAR `clientSimple`, PAS PAR `admin`, ET CE N'EST PAS UN DÉTAIL.
    // `seminaires_assistes` est en `security_invoker = false` : elle s'exécute avec les
    // privilèges de son propriétaire, mais `auth.uid()` continue de désigner l'APPELANT
    // (D72). Or une requête `service_role` n'a PAS de JWT utilisateur : `auth.uid()` y vaut
    // NULL, `prive.est_actif()` rend donc `false`, et `prive.peut_lire_membre` avec lui —
    // LA VUE REND ZÉRO LIGNE POUR `service_role`, sans la moindre erreur, alors même que
    // `service_role` contourne la RLS partout ailleurs. Écrire ce test avec `admin` le
    // ferait tomber sur `length > 0` pour une raison qui n'a rien à voir avec les colonnes.
    const { data, error } = await clientSimple.from('seminaires_assistes').select('*').limit(1)
    expect(error).toBeNull()
    // Contrôle positif indispensable : sur zéro ligne, l'assertion suivante ne porterait
    // sur rien et le test passerait en n'éprouvant strictement aucune colonne.
    expect((data ?? []).length).toBeGreaterThan(0)
    expect(Object.keys(data![0]).sort()).toEqual(
      ['date_debut', 'evenement_id', 'membre_id', 'titre', 'type'].sort(),
    )
  })

  it("un compte ORDINAIRE lit la vue et obtient des lignes, alors qu'il obtient ZÉRO ligne sur participations — LES DEUX ASSERTIONS DANS LE MÊME TEST (preuve n°5)", async () => {
    // C'est la SEULE façon de distinguer « la vue contourne comme prévu » de « l'hypothèse
    // BYPASSRLS est fausse et tout le monde voit du vide » — un défaut invisible, en échec
    // fermé, exactement celui que le §5.3 décrit pour prive.est_admin().
    const { data: vue, error: erreurVue } = await clientSimple
      .from('seminaires_assistes')
      .select('evenement_id, titre, type')
      .eq('membre_id', idMembreActif)
    expect(erreurVue).toBeNull()
    expect((vue ?? []).length).toBe(1)
    expect(vue![0].evenement_id).toBe(idEvenement)

    const { data: brut, error: erreurBrut } = await clientSimple
      .from('participations')
      .select('id')
      .eq('evenement_id', idEvenement)
    expect(erreurBrut).toBeNull()
    expect(brut).toEqual([])
  })

  it("un compte ordinaire ne voit PAS un membre ARCHIVÉ dans la vue, mais un administrateur si (preuve n°6)", async () => {
    const { data: vuSimple, error: erreurSimple } = await clientSimple
      .from('seminaires_assistes')
      .select('evenement_id')
      .eq('membre_id', idMembreArchive)
    expect(erreurSimple).toBeNull()
    expect(vuSimple).toEqual([])

    // CONTRÔLE POSITIF dans le même test : la ligne EXISTE, et un lecteur autorisé la voit.
    // Sans lui, l'assertion négative ne distinguerait pas « la RLS de membres est
    // réimposée » de « la participation n'a jamais été créée ».
    const clientAdminTest = await connecter(IDENT_ADMIN)
    const { data: vuAdmin, error: erreurAdmin } = await clientAdminTest
      .from('seminaires_assistes')
      .select('evenement_id')
      .eq('membre_id', idMembreArchive)
    expect(erreurAdmin).toBeNull()
    expect((vuAdmin ?? []).length).toBe(1)
  })
})

describe('participants_a_traiter et les désirs fermés (preuve n°7)', () => {
  it("un compte ORDINAIRE obtient zéro ligne sur participations, participants_externes ET participants_a_traiter — avec DEUX contrôles positifs dans le même test", async () => {
    for (const table of ['participations', 'participants_externes', 'participants_a_traiter'] as const) {
      const { data, error } = await clientSimple.from(table).select('*').limit(5)
      // La lecture est ACCORDÉE au rôle (grant select), c'est la POLITIQUE qui filtre :
      // le résultat est donc une liste vide, pas un 42501.
      expect(error).toBeNull()
      expect(data).toEqual([])
    }

    // CONTRÔLE POSITIF n°1 : ce même compte lit bien evenements et types_evenement — sans
    // lui, les trois listes vides ci-dessus pourraient signifier « ce compte ne lit plus
    // rien du tout ».
    const { data: evts, error: erreurEvts } = await clientSimple
      .from('evenements')
      .select('id')
      .eq('id', idEvenement)
    expect(erreurEvts).toBeNull()
    expect((evts ?? []).length).toBe(1)

    // CONTRÔLE POSITIF n°2 : un compte MODÉRATEUR RÉEL lit bien participations et la liste
    // à traiter. Un refus dont on n'a pas prouvé que le chemin fonctionne par ailleurs ne
    // prouve rien.
    const { data: partsMod, error: erreurPartsMod } = await clientModerateur
      .from('participations')
      .select('id')
      .eq('evenement_id', idEvenement)
    expect(erreurPartsMod).toBeNull()
    expect((partsMod ?? []).length).toBeGreaterThan(0)

    const { data: aTraiterMod, error: erreurATraiterMod } = await clientModerateur
      .from('participants_a_traiter')
      .select('participant_externe_id')
      .eq('participant_externe_id', idExterne)
    expect(erreurATraiterMod).toBeNull()
    expect((aTraiterMod ?? []).length).toBe(1)
  })

  it("un compte actif ne peut écrire dans AUCUNE des quatre tables de la phase", async () => {
    const tentatives: Array<[string, () => Promise<{ error: { code?: string } | null }>]> = [
      ['types_evenement', () => clientSimple.from('types_evenement').insert({ libelle: `${PREFIXE}-interdit` })],
      ['evenements', () => clientSimple.from('evenements').insert({ titre: `${PREFIXE}-interdit`, type_id: idTypeWebinaire, date_debut: '2026-09-01' })],
      ['participants_externes', () => clientSimple.from('participants_externes').insert({ nom: `${PREFIXE}-interdit` })],
      ['participations', () => clientSimple.from('participations').insert({ evenement_id: idEvenement, membre_id: idMembreActif })],
    ]
    for (const [nom, tentative] of tentatives) {
      const { error } = await tentative()
      expect(error, `écriture sur ${nom}`).not.toBeNull()
      expect(error!.code, `écriture sur ${nom}`).toBe('42501')
    }

    // AUCUNE des quatre tentatives n'a écrit : constaté EN BASE, pas déduit de l'erreur.
    const { count: typesEcrits } = await admin
      .from('types_evenement')
      .select('id', { count: 'exact', head: true })
      .eq('libelle', `${PREFIXE}-interdit`)
    expect(typesEcrits).toBe(0)
    const { count: externesEcrits } = await admin
      .from('participants_externes')
      .select('id', { count: 'exact', head: true })
      .eq('nom', `${PREFIXE}-interdit`)
    expect(externesEcrits).toBe(0)
  })
})

describe('privilèges des passerelles (preuve n°8)', () => {
  it("`anon` et `authenticated` ne peuvent pas exécuter les deux passerelles, et `service_role` si", async () => {
    // CIBLE DÉDIÉE, distincte de `idExterne` : le contrôle positif de ce test CLASSE
    // réellement son participant, et le réutiliser coupleraient ce test à celui de la liste
    // « à traiter » — lequel échouerait alors sur sa propre précondition plutôt que sur
    // l'assertion qu'il vise, et seulement selon l'ordre d'exécution des `describe`. Le
    // découplage vaut mieux qu'un ordre à préserver.
    const { data: cible, error: erreurCible } = await admin
      .from('participants_externes')
      .insert({ nom: `${PREFIXE}-privileges` })
      .select('id')
      .single()
    if (erreurCible || !cible) throw new Error(`préparation impossible : ${erreurCible?.message}`)
    const idCible = cible.id as string

    const anonyme = createClient(URL, CLE_ANON, { auth: { autoRefreshToken: false, persistSession: false } })

    for (const [nom, client] of [
      ['anon', anonyme],
      ['authenticated', clientSimple],
    ] as const) {
      const { error: erreurConversion } = await client.rpc('convertir_participant_externe', {
        p_participant: idCible,
        p_chemin: 'membre_existant',
        p_membre_cible: idMembreActif,
        p_nom: null,
        p_prenom: null,
        p_faiseur: null,
        p_dirigeant: null,
        p_dirigeant_force: false,
        p_par: null,
      })
      expect(erreurConversion, `conversion depuis ${nom}`).not.toBeNull()
      expect(erreurConversion!.code, `conversion depuis ${nom}`).toBe('42501')

      const { error: erreurClassement } = await client.rpc('classer_participant_externe', {
        p_participant: idCible,
        p_motif: 'Tentative',
        p_par: null,
      })
      expect(erreurClassement, `classement depuis ${nom}`).not.toBeNull()
      expect(erreurClassement!.code, `classement depuis ${nom}`).toBe('42501')
    }

    // ÉCRITURE RÉELLE CONSTATÉE EN BASE : le participant n'a été ni converti ni classé.
    // C'est ce constat, et non le code d'erreur, qui prouve que rien n'a été fait.
    const { data: relu } = await admin
      .from('participants_externes')
      .select('converti_en_membre_id, classe_le')
      .eq('id', idCible)
      .single()
    expect(relu!.converti_en_membre_id).toBeNull()
    expect(relu!.classe_le).toBeNull()

    // CONTRÔLE POSITIF : `service_role` réussit, avec le MÊME appel. Sans lui, les quatre
    // refus ci-dessus pourraient signifier « la fonction n'existe pas » ou « ses paramètres
    // ont changé de nom » aussi bien que « le privilège est retiré ».
    const { error: erreurService } = await admin.rpc('classer_participant_externe', {
      p_participant: idCible,
      p_motif: 'Contrôle positif de la preuve n°8',
      p_par: null,
    })
    expect(erreurService).toBeNull()

    const { data: apres } = await admin
      .from('participants_externes')
      .select('classe_le, motif_classement')
      .eq('id', idCible)
      .single()
    expect(apres!.classe_le).not.toBeNull()
    expect(apres!.motif_classement).toBe('Contrôle positif de la preuve n°8')
  })
})
```

⚠️ **Le test « les deux index sont PARTIELS » ci-dessus ne peut pas interroger
`pg_indexes` depuis PostgREST.** Il est **volontairement inerte dans le fichier** et la
vérification réelle vit à l'**étape 3**, en SQL direct. Ne pas le « réparer » en inventant
une fonction SQL exposée : cela ouvrirait une lecture du catalogue à `service_role` pour
le seul confort d'un test.

- [ ] **Étape 2 : exécuter**

```bash
npm run test:rls -- tests/rls/evenements.test.ts
```

Attendu : tout vert, et **le nettoyage vérifié par comptage** dans l'`afterAll` (aucun
`expect(count).toBe(0)` en échec).

- [ ] **Étape 3 : la vérification de catalogue, en SQL direct**

Dans l'éditeur SQL :

```sql
select indexname, indexdef from pg_indexes
where tablename = 'participations'
  and indexname in ('participations_membre_unique', 'participations_externe_unique');

select relname, reloptions from pg_class
where relname in ('seminaires_assistes', 'participants_a_traiter');
```

**Attendu :** deux `indexdef` contenant `WHERE (… IS NOT NULL)` et **aucun**
`NULLS NOT DISTINCT` ; `seminaires_assistes` → `{security_invoker=false}` ;
`participants_a_traiter` → `{security_invoker=true}`. Consigner les quatre lignes.

- [ ] **Étape 4 : PREUVE N°1 PAR MUTATION — les deux sens, avec écriture RÉELLE constatée**

**Une preuve par refus seul ne suffit pas** : il faut constater que **sans** la contrainte,
les deux lignes **s'écrivent vraiment**. Dans l'éditeur SQL, **en une seule session, et en
restaurant immédiatement** :

```sql
-- État AVANT, à conserver pour la comparaison.
select pg_get_constraintdef(oid) as avant from pg_constraint
where conname = 'participations_une_seule_reference';

-- Préparation.
insert into public.types_evenement (libelle) values ('ZZEvtMutation-type')
on conflict (libelle) do nothing;
insert into public.evenements (titre, type_id, date_debut)
select 'ZZEvtMutation-evt', t.id, '2026-09-01' from public.types_evenement t
where t.libelle = 'ZZEvtMutation-type' returning id;  -- <ID_EVT>
insert into public.participants_externes (nom) values ('ZZEvtMutation-x') returning id;  -- <ID_X>
insert into public.membres (nom, prenom) values ('ZZEvtMutation-m', 'Test') returning id;  -- <ID_M>

-- MUTATION.
alter table public.participations drop constraint participations_une_seule_reference;

-- LES DEUX LIGNES QUE LA CONTRAINTE INTERDIT, ÉCRITES POUR DE VRAI.
insert into public.participations (evenement_id) values ('<ID_EVT>') returning id;
insert into public.participations (evenement_id, membre_id, participant_externe_id)
values ('<ID_EVT>', '<ID_M>', '<ID_X>') returning id;

-- CONSTAT EN BASE : deux lignes, réellement écrites. C'est CE constat qui fait la preuve,
-- pas l'absence d'erreur.
select count(*) from public.participations where evenement_id = '<ID_EVT>';  -- attendu : 2

-- On efface AVANT de restaurer : la contrainte ne peut pas être remise tant que des lignes
-- la violent.
delete from public.participations where evenement_id = '<ID_EVT>';

-- RESTAURATION IMMÉDIATE, à l'identique.
alter table public.participations
  add constraint participations_une_seule_reference
  check (num_nonnulls(membre_id, participant_externe_id) = 1);

-- Les deux mêmes écritures, refusées cette fois.
insert into public.participations (evenement_id) values ('<ID_EVT>');
insert into public.participations (evenement_id, membre_id, participant_externe_id)
values ('<ID_EVT>', '<ID_M>', '<ID_X>');

-- EMPREINTE : identique à `avant`.
select pg_get_constraintdef(oid) as apres from pg_constraint
where conname = 'participations_une_seule_reference';

-- Nettoyage, dans l'ordre.
delete from public.participations where evenement_id = '<ID_EVT>';
delete from public.participants_externes where nom like 'ZZEvtMutation-%';
delete from public.membres where nom like 'ZZEvtMutation-%';
delete from public.evenements where titre like 'ZZEvtMutation-%';
delete from public.types_evenement where libelle like 'ZZEvtMutation-%';
select
  (select count(*) from public.evenements where titre like 'ZZEvtMutation-%') as evts,
  (select count(*) from public.membres where nom like 'ZZEvtMutation-%') as membres,
  (select count(*) from public.participants_externes where nom like 'ZZEvtMutation-%') as externes,
  (select count(*) from public.types_evenement where libelle like 'ZZEvtMutation-%') as types;
```

**Attendu :** `count = 2` pendant la mutation, deux `23514` après restauration, `avant` et
`apres` **identiques**, puis `0, 0, 0, 0`. **Consigner `avant` et `apres` verbatim.**

⚠️ **Ne jamais interrompre cette séquence entre le `drop constraint` et le
`add constraint`** : la base sert la **production**.

- [ ] **Étape 5 : les six portes, puis commit**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls && npm run test:e2e && npm run build
```

```bash
git add tests/rls/evenements.test.ts
git commit -m "test: schema, RLS et les deux vues des evenements (preuves 1, 2, 4, 5, 6, 7, 8, 17)"
```

---

### Task 24 : `tests/rls/conversion-participants.test.ts` (preuves 3, 9, 10, 11, 12, 13)

**Fichiers :**
- Créer : `tests/rls/conversion-participants.test.ts`

**Interfaces :**
- Consomme : les passerelles des Tasks 11, 12, 13 ; les tables et vues des Tasks 4 à 9.
- Produit : la couverture des preuves n°3, 9, 10, 11, 12 et 13 du §9 du design.

**Famille : `ZZEvtConv-`** (tiret littéral, distincte de `ZZEvt-`).

⚠️ **CETTE SUITE EMPRUNTE LE CHEMIN 1, QUI CRÉE UNE LIGNE `demandes_membre`.** Elle appelle
la passerelle **directement**, donc **aucune notification n'est émise** (la notification vit
dans la Server Action, pas dans la passerelle) — **le compte racine n'est donc pas
pollué**. Le test du chemin 1 rejoue ensuite **les deux écritures** de la validation
(`membres.etat = 'actif'`, `demandes_membre.etat = 'validee'`) par `admin`, **sans** insérer
la notification `demande_validee` que la Server Action, elle, insère : c'est délibéré, une
suite RLS n'a pas à écrire dans la cloche de qui que ce soit. **Ne pas « compléter » ce test
en ajoutant cette insertion** — elle viserait le profil de test, mais le motif interdit de
polluer une cloche depuis une suite est le même pour tous les comptes. Si un jour la notification était déplacée **dans** la passerelle, ce fichier
devrait nettoyer `notifications` par `demande_id` **avant** de supprimer les demandes :
`notifications.demande_id` est en `on delete cascade`, mais compter dessus après coup
rendrait le contrôle impossible.

⚠️ **ORDRE DE SUPPRESSION, et il est plus contraint qu'ailleurs :**
`participations` → `demandes_membre` → `participants_externes` → `membres` →
`evenements` → `types_evenement`. **Les six, dans cet ordre** — c'est celui que
`nettoyerFamille` applique plus bas, et un en-tête qui n'en annoncerait que quatre
laisserait un implémenteur pressé écrire un nettoyage qui échoue sur les deux derniers.
`participants_externes.converti_en_membre_id` est en **`on delete restrict`** (les membres
créés par conversion ne peuvent partir qu'après) et `demandes_membre.membre_id` est en
**`on delete set null`** (l'ordre inverse **effacerait la prise** juste avant qu'on la
cherche). `evenements` ne peut partir qu'après les `participations` qui le référencent, et
`types_evenement` qu'après les `evenements`.

- [ ] **Étape 1 : écrire la suite**

Créer `tests/rls/conversion-participants.test.ts` :

```typescript
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const CLE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const CLE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

const MDP = `Test-${crypto.randomUUID()}`
const IDENT_SIMPLE = 'test.rls.conv.simple'
const FAMILLE = 'ZZEvtConv-'
const PREFIXE = `${FAMILLE}${crypto.randomUUID().slice(0, 8)}`

const admin = createClient(URL, CLE_SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
})

let clientSimple: SupabaseClient
let idProfilSimple: string
let idType: string
let idEvenement: string
let idEvenementBis: string
let idMembreCible: string
let idMembreArchive: string
let idFaiseur: string

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

/** Crée un participant externe de la famille, avec une participation portant le désir. */
async function creerExterneAvecDesir(suffixe: string, evenementId = idEvenement): Promise<string> {
  const { data: externe, error: erreurExterne } = await admin
    .from('participants_externes')
    .insert({ nom: `${PREFIXE}-${suffixe}`, prenom: 'Test', ville: 'Douala' })
    .select('id')
    .single()
  // L'ERREUR EST LEVÉE, jamais ignorée : un insert de préparation dont l'erreur est jetée
  // rend le test vert en éprouvant un tout autre chemin — trouvé trois fois dans ce projet.
  if (erreurExterne || !externe) throw new Error(`création de l externe ${suffixe} impossible : ${erreurExterne?.message}`)

  const { error: erreurPart } = await admin.from('participations').insert({
    evenement_id: evenementId,
    participant_externe_id: externe.id,
    desir_suivi_spirituel: true,
  })
  if (erreurPart) throw new Error(`participation de ${suffixe} impossible : ${erreurPart.message}`)

  return externe.id as string
}

async function nettoyerFamille() {
  const { data: evts, error: e1 } = await admin.from('evenements').select('id').like('titre', `${FAMILLE}%`)
  if (e1) throw new Error(`balayage des évènements impossible : ${e1.message}`)
  const idsEvts = (evts ?? []).map((l) => l.id as string)

  const { data: externes, error: e2 } = await admin
    .from('participants_externes')
    .select('id')
    .like('nom', `${FAMILLE}%`)
  if (e2) throw new Error(`balayage des externes impossible : ${e2.message}`)
  const idsExternes = (externes ?? []).map((l) => l.id as string)

  const { data: membres, error: e3 } = await admin.from('membres').select('id').like('nom', `${FAMILLE}%`)
  if (e3) throw new Error(`balayage des membres impossible : ${e3.message}`)
  const idsMembres = (membres ?? []).map((l) => l.id as string)

  // 1. Participations : `membre_id` et `participant_externe_id` sont en `on delete
  //    restrict`, rien ne peut partir avant elles.
  for (const [colonne, ids] of [
    ['evenement_id', idsEvts],
    ['participant_externe_id', idsExternes],
    ['membre_id', idsMembres],
  ] as const) {
    if (ids.length > 0) {
      const { error } = await admin.from('participations').delete().in(colonne, ids)
      if (error) throw new Error(`nettoyage des participations par ${colonne} impossible : ${error.message}`)
    }
  }

  // 2. Demandes AVANT les membres : `demandes_membre.membre_id` est en `on delete set
  //    null`, et l'ordre inverse effacerait la prise juste avant qu'on la cherche.
  if (idsMembres.length > 0) {
    const { error } = await admin.from('demandes_membre').delete().in('membre_id', idsMembres)
    if (error) throw new Error(`nettoyage des demandes impossible : ${error.message}`)
  }

  // 3. Externes AVANT les membres : `converti_en_membre_id` est en `on delete restrict`.
  if (idsExternes.length > 0) {
    const { error } = await admin.from('participants_externes').delete().in('id', idsExternes)
    if (error) throw new Error(`nettoyage des externes impossible : ${error.message}`)
  }
  if (idsMembres.length > 0) {
    const { error } = await admin.from('membres').delete().in('id', idsMembres)
    if (error) throw new Error(`nettoyage des membres impossible : ${error.message}`)
  }
  if (idsEvts.length > 0) {
    const { error } = await admin.from('evenements').delete().in('id', idsEvts)
    if (error) throw new Error(`nettoyage des évènements impossible : ${error.message}`)
  }
  const { error: e4 } = await admin.from('types_evenement').delete().like('libelle', `${FAMILLE}%`)
  if (e4) throw new Error(`nettoyage des types impossible : ${e4.message}`)
}

beforeAll(async () => {
  await nettoyerFamille()
  await supprimerCompte(IDENT_SIMPLE)

  const { data: compte, error: erreurCompte } = await admin.auth.admin.createUser({
    email: `${IDENT_SIMPLE}@asonkeng.local`,
    password: MDP,
    email_confirm: true,
  })
  if (erreurCompte || !compte.user) throw new Error(`création du compte impossible : ${erreurCompte?.message}`)
  idProfilSimple = compte.user.id
  const { error: erreurProfil } = await admin
    .from('profils')
    .insert({ id: idProfilSimple, identifiant: IDENT_SIMPLE, nom_affichage: 'Test conversion' })
  if (erreurProfil) throw new Error(`insertion du profil impossible : ${erreurProfil.message}`)
  clientSimple = createClient(URL, CLE_ANON, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error: erreurConnexion } = await clientSimple.auth.signInWithPassword({
    email: `${IDENT_SIMPLE}@asonkeng.local`,
    password: MDP,
  })
  if (erreurConnexion) throw new Error(`connexion impossible : ${erreurConnexion.message}`)

  const { data: type, error: erreurType } = await admin
    .from('types_evenement')
    .insert({ libelle: `${PREFIXE}-type` })
    .select('id')
    .single()
  if (erreurType || !type) throw new Error(`création du type impossible : ${erreurType?.message}`)
  idType = type.id as string

  const { data: evts, error: erreurEvts } = await admin
    .from('evenements')
    .insert([
      { titre: `${PREFIXE}-evt1`, type_id: idType, date_debut: '2026-09-01', cree_par: idProfilSimple },
      { titre: `${PREFIXE}-evt2`, type_id: idType, date_debut: '2026-10-01', cree_par: idProfilSimple },
    ])
    .select('id, titre')
  if (erreurEvts || !evts || evts.length !== 2) {
    throw new Error(`création des évènements impossible : ${erreurEvts?.message}`)
  }
  idEvenement = evts.find((e) => (e.titre as string).endsWith('-evt1'))!.id as string
  idEvenementBis = evts.find((e) => (e.titre as string).endsWith('-evt2'))!.id as string

  const { data: membres, error: erreurMembres } = await admin
    .from('membres')
    .insert([
      { nom: `${PREFIXE}-cible`, prenom: 'Test', etat: 'actif' },
      { nom: `${PREFIXE}-archive`, prenom: 'Test', etat: 'archive' },
      { nom: `${PREFIXE}-faiseur`, prenom: 'Test', etat: 'actif' },
    ])
    .select('id, nom')
  if (erreurMembres || !membres || membres.length !== 3) {
    throw new Error(`création des membres impossible : ${erreurMembres?.message}`)
  }
  idMembreCible = membres.find((m) => (m.nom as string).endsWith('-cible'))!.id as string
  idMembreArchive = membres.find((m) => (m.nom as string).endsWith('-archive'))!.id as string
  idFaiseur = membres.find((m) => (m.nom as string).endsWith('-faiseur'))!.id as string
})

afterAll(async () => {
  await nettoyerFamille()

  for (const [table, colonne] of [
    ['evenements', 'titre'],
    ['participants_externes', 'nom'],
    ['membres', 'nom'],
    ['types_evenement', 'libelle'],
  ] as const) {
    const { count, error } = await admin
      .from(table)
      .select('id', { count: 'exact', head: true })
      .like(colonne, `${FAMILLE}%`)
    expect(error).toBeNull()
    expect(count).toBe(0)
  }

  await supprimerCompte(IDENT_SIMPLE)
})

describe('conversion : les trois chemins et la vue (preuve n°3)', () => {
  it("chemin 3 — CONTRÔLE POSITIF D'ABORD : le compte ordinaire ne voit RIEN pour la fiche cible AVANT conversion, puis voit le séminaire APRÈS", async () => {
    // Sans le constat « rien avant », l'assertion positive pourrait être vraie pour une
    // autre raison (une participation directe du membre, une autre exécution de test).
    const { data: avant, error: erreurAvant } = await clientSimple
      .from('seminaires_assistes')
      .select('evenement_id')
      .eq('membre_id', idMembreCible)
    expect(erreurAvant).toBeNull()
    expect(avant).toEqual([])

    const idExterne = await creerExterneAvecDesir('chemin3')

    const { data, error } = await admin.rpc('convertir_participant_externe', {
      p_participant: idExterne,
      p_chemin: 'membre_existant',
      p_membre_cible: idMembreCible,
      p_nom: null,
      p_prenom: null,
      p_faiseur: null,
      p_dirigeant: null,
      p_dirigeant_force: false,
      p_par: idProfilSimple,
    })
    expect(error).toBeNull()
    const ligne = (Array.isArray(data) ? data[0] : data) as { membre_id: string; demande_id: string | null }
    expect(ligne.membre_id).toBe(idMembreCible)
    // Chemin 3 : aucune demande créée.
    expect(ligne.demande_id).toBeNull()

    // LA PREUVE : depuis un COMPTE ORDINAIRE, la vue rend le séminaire — l'historique du
    // converti est reconstitué À LA LECTURE (D70), aucune écriture passée n'ayant bougé.
    const { data: apres, error: erreurApres } = await clientSimple
      .from('seminaires_assistes')
      .select('evenement_id, titre')
      .eq('membre_id', idMembreCible)
    expect(erreurApres).toBeNull()
    expect((apres ?? []).length).toBe(1)
    expect(apres![0].evenement_id).toBe(idEvenement)

    // D69 — LA PARTICIPATION N'A PAS BOUGÉ : `membre_id` est toujours NULL, et
    // `participant_externe_id` pointe toujours sur l'externe. C'est ce fait, et lui seul,
    // qui préserve la trace que cette personne est entrée par un séminaire.
    const { data: participation } = await admin
      .from('participations')
      .select('membre_id, participant_externe_id')
      .eq('participant_externe_id', idExterne)
      .single()
    expect(participation!.membre_id).toBeNull()
    expect(participation!.participant_externe_id).toBe(idExterne)
  })

  it("chemin 1 — crée une fiche en_attente ET sa demande d origine conversion_participant, INVISIBLE d un compte ordinaire tant qu elle est en_attente, puis VISIBLE avec son séminaire une fois la demande validée", async () => {
    const idExterne = await creerExterneAvecDesir('chemin1')

    const { data, error } = await admin.rpc('convertir_participant_externe', {
      p_participant: idExterne,
      p_chemin: 'fiche_en_attente',
      p_membre_cible: null,
      p_nom: `${PREFIXE}-converti1`,
      p_prenom: 'Test',
      p_faiseur: null,
      p_dirigeant: null,
      p_dirigeant_force: false,
      p_par: idProfilSimple,
    })
    expect(error).toBeNull()
    const ligne = (Array.isArray(data) ? data[0] : data) as { membre_id: string; demande_id: string | null }
    expect(ligne.demande_id).not.toBeNull()

    const { data: fiche } = await admin.from('membres').select('etat').eq('id', ligne.membre_id).single()
    expect(fiche!.etat).toBe('en_attente')

    const { data: demande } = await admin
      .from('demandes_membre')
      .select('origine, etat, membre_id, demandeur_profil_id')
      .eq('id', ligne.demande_id!)
      .single()
    expect(demande!.origine).toBe('conversion_participant')
    expect(demande!.etat).toBe('en_attente')
    expect(demande!.membre_id).toBe(ligne.membre_id)

    // CONTRÔLE NÉGATIF — tant que la fiche est `en_attente`, un COMPTE ORDINAIRE ne voit
    // RIEN : `prive.peut_lire_membre` ne l'ouvre qu'à l'administrateur et au demandeur de
    // la fiche, et la seconde branche de `seminaires_assistes` filtre par ce prédicat. Ce
    // zéro n'est pas un défaut de la vue, c'est l'état d'une fiche non encore validée — et
    // c'est précisément pour cela que la validation, plus bas, est INDISPENSABLE et non
    // décorative.
    const { data: avant, error: erreurAvant } = await clientSimple
      .from('seminaires_assistes')
      .select('evenement_id')
      .eq('membre_id', ligne.membre_id)
    expect(erreurAvant).toBeNull()
    expect(avant).toEqual([])

    // LA VALIDATION, REJOUÉE ICI PAR SES DEUX ÉCRITURES. `validerDemandeNouvellePersonne`
    // est une Server Action : elle n'est pas appelable depuis une suite RLS. On rejoue donc
    // EXACTEMENT ce qu'elle écrit pour l'origine `conversion_participant` — `etat = 'actif'`
    // sur la fiche, ET RIEN D'AUTRE (aucun faiseur de disciple n'est posé, l'administrateur
    // convertisseur n'étant pas le faiseur de disciple de la personne convertie), puis la
    // demande à `validee`. Si un jour l'action écrivait autre chose pour cette origine, ces
    // deux `update` seraient à reprendre AVEC elle : ce test les reproduit, il ne les
    // observe pas.
    const { error: erreurActivation } = await admin
      .from('membres')
      .update({ etat: 'actif' })
      .eq('id', ligne.membre_id)
    expect(erreurActivation).toBeNull()
    const { error: erreurDemandeValidee } = await admin
      .from('demandes_membre')
      .update({ etat: 'validee' })
      .eq('id', ligne.demande_id!)
    expect(erreurDemandeValidee).toBeNull()

    // LA PREUVE, LA MÊME QUE POUR LES CHEMINS 2 ET 3 : depuis un COMPTE ORDINAIRE, la vue
    // rend le séminaire du converti. C'est la ligne 4 du périmètre livré du design —
    // « historique des convertis compris » (D70) — tenue sur le chemin 1, qui est le chemin
    // nominal de D66.
    const { data: apres, error: erreurApres } = await clientSimple
      .from('seminaires_assistes')
      .select('evenement_id')
      .eq('membre_id', ligne.membre_id)
    expect(erreurApres).toBeNull()
    expect((apres ?? []).length).toBe(1)
    expect(apres![0].evenement_id).toBe(idEvenement)

    // La fiche n'a TOUJOURS aucun faiseur de disciple : la validation d'une conversion ne
    // pose pas de filiation. Sans cette assertion, une régression qui poserait le
    // convertisseur comme faiseur passerait inaperçue — elle écrirait dans l'arbre une
    // filiation qui n'a jamais eu lieu.
    const { data: ficheApres } = await admin
      .from('membres')
      .select('etat, faiseur_de_disciple_id')
      .eq('id', ligne.membre_id)
      .single()
    expect(ficheApres!.etat).toBe('actif')
    expect(ficheApres!.faiseur_de_disciple_id).toBeNull()
  })

  it('chemin 2 — crée une fiche ACTIVE avec son faiseur de disciple, et la vue la montre à un compte ordinaire', async () => {
    const idExterne = await creerExterneAvecDesir('chemin2')

    const { data, error } = await admin.rpc('convertir_participant_externe', {
      p_participant: idExterne,
      p_chemin: 'fiche_active',
      p_membre_cible: null,
      p_nom: `${PREFIXE}-converti2`,
      p_prenom: 'Test',
      p_faiseur: idFaiseur,
      p_dirigeant: null,
      p_dirigeant_force: false,
      p_par: idProfilSimple,
    })
    expect(error).toBeNull()
    const ligne = (Array.isArray(data) ? data[0] : data) as { membre_id: string; demande_id: string | null }
    expect(ligne.demande_id).toBeNull()

    const { data: fiche } = await admin
      .from('membres')
      .select('etat, faiseur_de_disciple_id')
      .eq('id', ligne.membre_id)
      .single()
    expect(fiche!.etat).toBe('actif')
    expect(fiche!.faiseur_de_disciple_id).toBe(idFaiseur)

    const { data: vue } = await clientSimple
      .from('seminaires_assistes')
      .select('evenement_id')
      .eq('membre_id', ligne.membre_id)
    expect((vue ?? []).length).toBe(1)
  })

  it('refuse une fiche cible ARCHIVÉE (D68), avec contrôle positif sur une fiche active', async () => {
    const idExterne = await creerExterneAvecDesir('cible-archivee')

    const { error } = await admin.rpc('convertir_participant_externe', {
      p_participant: idExterne,
      p_chemin: 'membre_existant',
      p_membre_cible: idMembreArchive,
      p_nom: null,
      p_prenom: null,
      p_faiseur: null,
      p_dirigeant: null,
      p_dirigeant_force: false,
      p_par: idProfilSimple,
    })
    expect(error).not.toBeNull()
    expect(error!.details).toBe('membre_cible_non_actif')

    // ÉCRITURE RÉELLE : rien n'a été posé.
    const { data: relu } = await admin
      .from('participants_externes')
      .select('converti_en_membre_id')
      .eq('id', idExterne)
      .single()
    expect(relu!.converti_en_membre_id).toBeNull()

    // CONTRÔLE POSITIF dans le même test : le MÊME appel, vers une fiche ACTIVE, réussit —
    // sans lui, le refus pourrait signifier « ce chemin ne marche plus du tout ».
    const { error: erreurPositive } = await admin.rpc('convertir_participant_externe', {
      p_participant: idExterne,
      p_chemin: 'membre_existant',
      p_membre_cible: idMembreCible,
      p_nom: null,
      p_prenom: null,
      p_faiseur: null,
      p_dirigeant: null,
      p_dirigeant_force: false,
      p_par: idProfilSimple,
    })
    expect(erreurPositive).toBeNull()
  })
})

describe('non-reconversion (preuve n°10)', () => {
  it('refuse une seconde conversion, et le lien pointe TOUJOURS sur la première fiche', async () => {
    const idExterne = await creerExterneAvecDesir('reconversion')

    const { data, error } = await admin.rpc('convertir_participant_externe', {
      p_participant: idExterne,
      p_chemin: 'fiche_active',
      p_membre_cible: null,
      p_nom: `${PREFIXE}-premier`,
      p_prenom: 'Test',
      p_faiseur: idFaiseur,
      p_dirigeant: null,
      p_dirigeant_force: false,
      p_par: idProfilSimple,
    })
    expect(error).toBeNull()
    const premier = (Array.isArray(data) ? data[0] : data) as { membre_id: string }

    const { error: erreurSeconde } = await admin.rpc('convertir_participant_externe', {
      p_participant: idExterne,
      p_chemin: 'membre_existant',
      p_membre_cible: idMembreCible,
      p_nom: null,
      p_prenom: null,
      p_faiseur: null,
      p_dirigeant: null,
      p_dirigeant_force: false,
      p_par: idProfilSimple,
    })
    expect(erreurSeconde).not.toBeNull()
    expect(erreurSeconde!.details).toBe('participant_deja_converti')

    // RELECTURE EN BASE : le lien n'a pas bougé. Sans elle, le refus seul ne prouverait pas
    // que rien n'a été écrit avant le refus.
    const { data: relu } = await admin
      .from('participants_externes')
      .select('converti_en_membre_id')
      .eq('id', idExterne)
      .single()
    expect(relu!.converti_en_membre_id).toBe(premier.membre_id)
  })

  it("le DÉCLENCHEUR refuse aussi une écriture DIRECTE, y compris la remise à NULL (D63) — c'est le cas que `<>` laisserait passer", async () => {
    const idExterne = await creerExterneAvecDesir('ecriture-directe')
    const { data } = await admin.rpc('convertir_participant_externe', {
      p_participant: idExterne,
      p_chemin: 'membre_existant',
      p_membre_cible: idMembreCible,
      p_nom: null,
      p_prenom: null,
      p_faiseur: null,
      p_dirigeant: null,
      p_dirigeant_force: false,
      p_par: idProfilSimple,
    })
    const ligne = (Array.isArray(data) ? data[0] : data) as { membre_id: string }

    const { error: erreurNull } = await admin
      .from('participants_externes')
      .update({ converti_en_membre_id: null, converti_le: null })
      .eq('id', idExterne)
    expect(erreurNull).not.toBeNull()
    expect(erreurNull!.details).toBe('participant_deja_converti')

    const { data: relu } = await admin
      .from('participants_externes')
      .select('converti_en_membre_id')
      .eq('id', idExterne)
      .single()
    expect(relu!.converti_en_membre_id).toBe(ligne.membre_id)

    // CONTRÔLE POSITIF : une colonne SANS RAPPORT reste modifiable — sans lui, le refus
    // ci-dessus pourrait signifier « cette ligne est devenue totalement immuable ».
    const { data: modifiee, error: erreurModif } = await admin
      .from('participants_externes')
      .update({ ville: 'Yaoundé' })
      .eq('id', idExterne)
      .select('ville')
    expect(erreurModif).toBeNull()
    expect(modifiee![0].ville).toBe('Yaoundé')
  })
})

describe('classement (preuves n°12 et n°13)', () => {
  it("classer une personne présente à DEUX évènements la fait disparaître de la liste — et elle n'y figurait qu'UNE fois avant (D61)", async () => {
    const idExterne = await creerExterneAvecDesir('deux-evts')
    // Seconde participation, second évènement, même désir.
    const { error: erreurBis } = await admin.from('participations').insert({
      evenement_id: idEvenementBis,
      participant_externe_id: idExterne,
      desir_suivi_spirituel: true,
    })
    expect(erreurBis).toBeNull()

    // CONTRÔLE POSITIF, et il vérifie l'AGRÉGATION en même temps que le classement : la
    // personne figure UNE SEULE FOIS dans la liste, avec deux évènements concernés.
    const { data: avant, error: erreurAvant } = await admin
      .from('participants_a_traiter')
      .select('participant_externe_id, evenements_concernes')
      .eq('participant_externe_id', idExterne)
    expect(erreurAvant).toBeNull()
    expect((avant ?? []).length).toBe(1)
    expect(Number(avant![0].evenements_concernes)).toBe(2)

    const { error: erreurClassement } = await admin.rpc('classer_participant_externe', {
      p_participant: idExterne,
      p_motif: 'Injoignable depuis trois mois',
      p_par: idProfilSimple,
    })
    expect(erreurClassement).toBeNull()

    const { data: apres } = await admin
      .from('participants_a_traiter')
      .select('participant_externe_id')
      .eq('participant_externe_id', idExterne)
    expect(apres).toEqual([])
  })

  it('refuse un motif vide, refuse un déclassement, et la valeur en base ne bouge pas (D62)', async () => {
    const idExterne = await creerExterneAvecDesir('classement-definitif')

    const { error: erreurVide } = await admin.rpc('classer_participant_externe', {
      p_participant: idExterne,
      p_motif: '   ',
      p_par: idProfilSimple,
    })
    expect(erreurVide).not.toBeNull()
    expect(erreurVide!.details).toBe('motif_classement_vide')

    const { error: erreurOk } = await admin.rpc('classer_participant_externe', {
      p_participant: idExterne,
      p_motif: 'Motif initial',
      p_par: idProfilSimple,
    })
    expect(erreurOk).toBeNull()

    // Déclassement par écriture DIRECTE : refusé par le déclencheur.
    const { error: erreurDeclassement } = await admin
      .from('participants_externes')
      .update({ classe_le: null, motif_classement: null })
      .eq('id', idExterne)
    expect(erreurDeclassement).not.toBeNull()
    expect(erreurDeclassement!.details).toBe('classement_definitif')

    const { data: relu } = await admin
      .from('participants_externes')
      .select('classe_le, motif_classement')
      .eq('id', idExterne)
      .single()
    expect(relu!.classe_le).not.toBeNull()
    expect(relu!.motif_classement).toBe('Motif initial')
  })

  it("CONTRÔLE POSITIF de D62 : un participant DÉJÀ CLASSÉ reste convertible, et cela ne le fait pas réapparaître dans la liste", async () => {
    const idExterne = await creerExterneAvecDesir('classe-puis-converti')
    const { error: erreurClassement } = await admin.rpc('classer_participant_externe', {
      p_participant: idExterne,
      p_motif: 'Classé avant de reprendre contact',
      p_par: idProfilSimple,
    })
    expect(erreurClassement).toBeNull()

    // « Pas de réouverture » porte sur la LISTE, pas sur le sort de la personne : quelqu'un
    // classé il y a deux ans qui reprend contact DOIT pouvoir être converti.
    const { error: erreurConversion } = await admin.rpc('convertir_participant_externe', {
      p_participant: idExterne,
      p_chemin: 'membre_existant',
      p_membre_cible: idMembreCible,
      p_nom: null,
      p_prenom: null,
      p_faiseur: null,
      p_dirigeant: null,
      p_dirigeant_force: false,
      p_par: idProfilSimple,
    })
    expect(erreurConversion).toBeNull()

    // Les deux colonnes coexistent renseignées, et aucune contrainte ne les oppose.
    const { data: relu } = await admin
      .from('participants_externes')
      .select('classe_le, converti_en_membre_id')
      .eq('id', idExterne)
      .single()
    expect(relu!.classe_le).not.toBeNull()
    expect(relu!.converti_en_membre_id).toBe(idMembreCible)

    const { data: liste } = await admin
      .from('participants_a_traiter')
      .select('participant_externe_id')
      .eq('participant_externe_id', idExterne)
    expect(liste).toEqual([])
  })
})

describe('annulation d une demande de conversion (preuve n°11)', () => {
  it("refuse l'annulation avec le marqueur `demande_conversion_non_annulable`, LA FICHE EST TOUJOURS EN BASE, et un `delete` direct échoue en 23503", async () => {
    const idExterne = await creerExterneAvecDesir('annulation')

    const { data } = await admin.rpc('convertir_participant_externe', {
      p_participant: idExterne,
      p_chemin: 'fiche_en_attente',
      p_membre_cible: null,
      p_nom: `${PREFIXE}-a-annuler`,
      p_prenom: 'Test',
      p_faiseur: null,
      p_dirigeant: null,
      p_dirigeant_force: false,
      p_par: idProfilSimple,
    })
    const ligne = (Array.isArray(data) ? data[0] : data) as { membre_id: string; demande_id: string }

    // (a) la passerelle refuse.
    const { error: erreurAnnulation } = await admin.rpc('annuler_demande_membre', {
      p_demande: ligne.demande_id,
      p_demandeur: idProfilSimple,
    })
    expect(erreurAnnulation).not.toBeNull()
    expect(erreurAnnulation!.details).toBe('demande_conversion_non_annulable')

    // LA FICHE EST TOUJOURS EN BASE — c'est ce constat, pas le refus, qui prouve que rien
    // n'a été détruit avant le refus. Postgres n'a pas de transaction autonome : une
    // exception annule l'écriture qu'on aurait pu croire acquise.
    const { data: fiche } = await admin.from('membres').select('id, etat').eq('id', ligne.membre_id).maybeSingle()
    expect(fiche).not.toBeNull()
    expect(fiche!.etat).toBe('en_attente')
    const { data: demande } = await admin
      .from('demandes_membre')
      .select('etat')
      .eq('id', ligne.demande_id)
      .single()
    expect(demande!.etat).toBe('en_attente')

    // (b) SECONDE BARRIÈRE, indépendante : un `delete from membres` direct échoue en 23503
    // à cause du `on delete restrict` de `converti_en_membre_id` (D64).
    const { error: erreurDelete } = await admin.from('membres').delete().eq('id', ligne.membre_id)
    expect(erreurDelete).not.toBeNull()
    expect(erreurDelete!.code).toBe('23503')
  })

  it("CONTRÔLE POSITIF : l'annulation d'une demande d'origine `demande_suivi` fonctionne toujours", async () => {
    // Sans ce test, le refus ci-dessus pourrait aussi bien signifier « annuler_demande_membre
    // est cassée » que « elle refuse cette origine précise ».
    const { data: fiche, error: erreurFiche } = await admin
      .from('membres')
      .insert({ nom: `${PREFIXE}-suivi`, prenom: 'Test', etat: 'en_attente' })
      .select('id')
      .single()
    if (erreurFiche || !fiche) throw new Error(`préparation impossible : ${erreurFiche?.message}`)

    const { data: demande, error: erreurDemande } = await admin
      .from('demandes_membre')
      .insert({
        origine: 'demande_suivi',
        demandeur_profil_id: idProfilSimple,
        membre_id: fiche.id,
        etat: 'en_attente',
      })
      .select('id')
      .single()
    if (erreurDemande || !demande) throw new Error(`préparation impossible : ${erreurDemande?.message}`)

    const { error } = await admin.rpc('annuler_demande_membre', {
      p_demande: demande.id,
      p_demandeur: idProfilSimple,
    })
    expect(error).toBeNull()

    const { data: apres } = await admin
      .from('demandes_membre')
      .select('etat, membre_id')
      .eq('id', demande.id)
      .single()
    expect(apres!.etat).toBe('annulee')
    // D42 (phase 2b) : la fiche en_attente a bien été supprimée, et `membre_id` est passé à
    // NULL par le `on delete set null`.
    expect(apres!.membre_id).toBeNull()
    const { data: ficheApres } = await admin.from('membres').select('id').eq('id', fiche.id).maybeSingle()
    expect(ficheApres).toBeNull()

    // Nettoyage local de la demande annulée : elle n'a plus de `membre_id`, donc le
    // balayage de famille par les membres ne la retrouverait pas.
    await admin.from('demandes_membre').delete().eq('id', demande.id)
  })
})
```

- [ ] **Étape 2 : exécuter**

```bash
npm run test:rls -- tests/rls/conversion-participants.test.ts
```

Attendu : tout vert, `afterAll` compris.

- [ ] **Étape 3 : PREUVE N°9 PAR MUTATION — l'atomicité de la conversion**

**Insérer un `raise exception` ENTRE la création de la fiche et la pose du lien, rejouer,
et constater que NI la fiche NI le lien n'ont persisté.** Deux lectures en base dans la
même séquence. Dans l'éditeur SQL :

```sql
-- EMPREINTE AVANT, à conserver.
select pg_get_functiondef(
  'public.convertir_participant_externe(uuid, text, uuid, text, text, uuid, uuid, boolean, uuid)'::regprocedure
) as avant;
```

**Copier cette définition dans un fichier local temporaire** — c'est elle qui sera
recollée telle quelle à la restauration.

```sql
-- Préparation.
insert into public.types_evenement (libelle) values ('ZZEvtAtom-type') on conflict (libelle) do nothing;
insert into public.evenements (titre, type_id, date_debut)
select 'ZZEvtAtom-evt', t.id, '2026-09-01' from public.types_evenement t where t.libelle = 'ZZEvtAtom-type'
returning id;  -- <ID_EVT>
insert into public.participants_externes (nom) values ('ZZEvtAtom-x') returning id;  -- <ID_X>
insert into public.participations (evenement_id, participant_externe_id, desir_suivi_spirituel)
values ('<ID_EVT>', '<ID_X>', true);
```

**MUTATION** — recoller la définition relevée ci-dessus en insérant, **juste après le
`returning id into v_membre` du chemin `fiche_active`**, la ligne :

```sql
    raise exception 'MUTATION TEMPORAIRE — preuve n°9' using detail = 'mutation_preuve_9';
```

Puis :

```sql
-- Compte des membres AVANT, pour un DELTA (jamais un total absolu).
select count(*) as membres_avant from public.membres where nom like 'ZZEvtAtom-%';

select * from public.convertir_participant_externe(
  '<ID_X>', 'fiche_active', null, 'ZZEvtAtom-converti', 'Test', null, null, false, null
);
-- Attendu : erreur portant `mutation_preuve_9`.

-- LES DEUX LECTURES QUI FONT LA PREUVE :
select count(*) as membres_apres from public.membres where nom like 'ZZEvtAtom-%';
-- Attendu : IDENTIQUE à membres_avant. La fiche créée juste avant l'exception N'A PAS
-- PERSISTÉ — Postgres n'a pas de transaction autonome.

select converti_en_membre_id from public.participants_externes where id = '<ID_X>';
-- Attendu : NULL. Le lien non plus n'a pas persisté.
```

**RESTAURATION IMMÉDIATE** — recoller la définition `avant`, **telle quelle**, sans la
ligne de mutation. Puis :

```sql
select pg_get_functiondef(
  'public.convertir_participant_externe(uuid, text, uuid, text, text, uuid, uuid, boolean, uuid)'::regprocedure
) as apres;

-- CONTRÔLE POSITIF : la conversion refonctionne, avec le MÊME appel.
select * from public.convertir_participant_externe(
  '<ID_X>', 'fiche_active', null, 'ZZEvtAtom-converti', 'Test', null, null, false, null
);
select count(*) from public.membres where nom like 'ZZEvtAtom-%';  -- attendu : 1

-- Nettoyage, DANS L'ORDRE.
delete from public.participations where evenement_id = '<ID_EVT>';
delete from public.participants_externes where nom like 'ZZEvtAtom-%';
delete from public.membres where nom like 'ZZEvtAtom-%';
delete from public.evenements where titre like 'ZZEvtAtom-%';
delete from public.types_evenement where libelle like 'ZZEvtAtom-%';
select
  (select count(*) from public.participants_externes where nom like 'ZZEvtAtom-%') as externes,
  (select count(*) from public.membres where nom like 'ZZEvtAtom-%') as membres,
  (select count(*) from public.evenements where titre like 'ZZEvtAtom-%') as evts,
  (select count(*) from public.types_evenement where libelle like 'ZZEvtAtom-%') as types;
```

**Attendu :** `membres_avant = membres_apres`, `converti_en_membre_id` **null**, `avant` et
`apres` **identiques**, la conversion de contrôle qui **réussit**, puis `0, 0, 0, 0`.
**Consigner `avant` et `apres`** et **diffuser le fait qu'ils sont identiques** — sans
cette comparaison, une mutation partiellement restaurée resterait en **production**.

⚠️ **Ne jamais interrompre entre la mutation et la restauration.**

- [ ] **Étape 4 : les six portes, puis commit**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls && npm run test:e2e && npm run build
```

```bash
git add tests/rls/conversion-participants.test.ts
git commit -m "test: conversion, classement et non-annulation (preuves 3, 9, 10, 11, 12, 13)"
```

---

### Task 25 : `tests/rls/evenements-pagination.test.ts` — tri total (preuve n°14)

**Fichiers :**
- Créer : `tests/rls/evenements-pagination.test.ts`

**Interfaces :**
- Consomme : `evenementsParPage`, `participantsDEvenementParPage`,
  `participantsATraiterParPage` (T15) — **importées depuis `evenements-lots`**, le module
  **sans** `server-only`, pour faire tourner **exactement le code de production**.
- Produit : la couverture de la preuve n°14.

**Famille : `ZZEvtPage-`.**

**Le motif est celui de `presencesDeSeanceParLots(client, seanceId, 2)` :** créer **N+1**
lignes avec une taille de page **abaissée** — **jamais 1001 lignes réelles en base de
production**. L'assertion porte sur **l'ENSEMBLE DES IDENTIFIANTS COLLECTÉS** en parcourant
toutes les pages, **pas** sur le compte d'une page : c'est la seule forme qui attrape à la
fois une ligne rendue **deux fois** et une ligne **jamais rendue**. Plus la vérification que
le **total annoncé** (`count: 'exact'`) est le **total réel**.

**Les trois lectures sont éprouvées, y compris avec des ex æquo sur la clé non unique** —
sans ex æquo, un tri **non** total passerait le test et le défaut resterait ouvert :
- `evenementsParPage` : **trois évènements à la MÊME `date_debut`** ;
- `participantsDEvenementParPage` : **quatre participations dont le `saisi_le` est posé
  identique** ;
- `participantsATraiterParPage` : **trois personnes dont la `premiere_expression` est la
  même** (même évènement).

- [ ] **Étape 1 : écrire la suite**

Créer `tests/rls/evenements-pagination.test.ts` :

```typescript
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
// Import depuis `evenements-lots`, PAS depuis `evenements` : ce dernier porte
// `import 'server-only'`, un `throw` nu hors du bundler Next. Ce module séparé permet à
// cette suite vitest de faire tourner EXACTEMENT le code de production contre la vraie
// base — plutôt qu'une paraphrase, qui ne prouverait rien du tri lui-même.
import {
  evenementsParPage,
  participantsATraiterParPage,
  participantsDEvenementParPage,
} from '@/lib/donnees/evenements-lots'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const CLE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

const FAMILLE = 'ZZEvtPage-'
const PREFIXE = `${FAMILLE}${crypto.randomUUID().slice(0, 8)}`
// MÊME date sur les trois évènements : sans ex æquo sur la clé NON unique, un tri sans
// `.order('id')` final passerait ce test et le défaut resterait ouvert.
const DATE_COMMUNE = '2026-09-15'

const admin: SupabaseClient = createClient(URL, CLE_SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
})

let idType: string
let idsEvenements: string[] = []
let idEvenementPrincipal: string
let idsParticipations: string[] = []
let idsExternesATraiter: string[] = []

/**
 * Parcourt TOUTES les pages et rend l'ensemble des identifiants collectés, plus le total
 * annoncé par la dernière page lue. L'assertion se fait ensuite sur cet ENSEMBLE, jamais
 * sur le compte d'une page : c'est la seule forme qui attrape à la fois une ligne rendue
 * DEUX FOIS et une ligne rendue JAMAIS.
 */
async function parcourir<T>(
  lire: (page: number) => Promise<{ lignes: T[]; total: number }>,
  cle: (ligne: T) => string,
): Promise<{ ids: string[]; total: number; pages: number }> {
  const ids: string[] = []
  let total = 0
  let pages = 0
  // Le plafond de pages est DÉRIVÉ du total annoncé par la première page, jamais une
  // constante arbitraire : la liste « à traiter » est GLOBALE (aucun filtre par famille
  // possible), et un plafond fixe la tronquerait le jour où la production compterait plus
  // de lignes que prévu — le test échouerait alors pour une raison qui n'aurait RIEN à voir
  // avec ce qu'il éprouve. `+ 2` laisse la page vide de fin et une marge d'une page.
  let plafond = 2
  for (let page = 1; page <= plafond; page++) {
    const { lignes, total: t } = await lire(page)
    total = t
    pages = page
    if (page === 1) {
      const taille = Math.max(1, lignes.length)
      plafond = Math.ceil(total / taille) + 2
    }
    ids.push(...lignes.map(cle))
    if (lignes.length === 0) break
    // Garde-fou : une pagination cassée qui rendrait toujours la MÊME page tomberait ici,
    // franchement, au lieu de boucler jusqu'au plafond puis d'échouer sur une assertion
    // dont le message ne dirait pas ce qui s'est passé.
    if (ids.length > total + 10) {
      throw new Error(`parcours divergent : ${ids.length} identifiants collectés pour un total annoncé de ${total}.`)
    }
  }
  return { ids, total, pages }
}

async function nettoyerFamille() {
  const { data: evts, error: e1 } = await admin.from('evenements').select('id').like('titre', `${FAMILLE}%`)
  if (e1) throw new Error(`balayage des évènements impossible : ${e1.message}`)
  const idsEvts = (evts ?? []).map((l) => l.id as string)

  const { data: externes, error: e2 } = await admin
    .from('participants_externes')
    .select('id')
    .like('nom', `${FAMILLE}%`)
  if (e2) throw new Error(`balayage des externes impossible : ${e2.message}`)
  const idsExternes = (externes ?? []).map((l) => l.id as string)

  const { data: membres, error: e3 } = await admin.from('membres').select('id').like('nom', `${FAMILLE}%`)
  if (e3) throw new Error(`balayage des membres impossible : ${e3.message}`)
  const idsMembres = (membres ?? []).map((l) => l.id as string)

  for (const [colonne, ids] of [
    ['evenement_id', idsEvts],
    ['participant_externe_id', idsExternes],
    ['membre_id', idsMembres],
  ] as const) {
    if (ids.length > 0) {
      const { error } = await admin.from('participations').delete().in(colonne, ids)
      if (error) throw new Error(`nettoyage des participations par ${colonne} impossible : ${error.message}`)
    }
  }
  if (idsExternes.length > 0) {
    const { error } = await admin.from('participants_externes').delete().in('id', idsExternes)
    if (error) throw new Error(`nettoyage des externes impossible : ${error.message}`)
  }
  if (idsMembres.length > 0) {
    const { error } = await admin.from('membres').delete().in('id', idsMembres)
    if (error) throw new Error(`nettoyage des membres impossible : ${error.message}`)
  }
  if (idsEvts.length > 0) {
    const { error } = await admin.from('evenements').delete().in('id', idsEvts)
    if (error) throw new Error(`nettoyage des évènements impossible : ${error.message}`)
  }
  const { error: e4 } = await admin.from('types_evenement').delete().like('libelle', `${FAMILLE}%`)
  if (e4) throw new Error(`nettoyage des types impossible : ${e4.message}`)
}

beforeAll(async () => {
  await nettoyerFamille()

  const { data: type, error: erreurType } = await admin
    .from('types_evenement')
    .insert({ libelle: `${PREFIXE}-type` })
    .select('id')
    .single()
  if (erreurType || !type) throw new Error(`création du type impossible : ${erreurType?.message}`)
  idType = type.id as string

  // TROIS évènements à la MÊME date : les ex æquo sont le cœur de cette preuve.
  const { data: evts, error: erreurEvts } = await admin
    .from('evenements')
    .insert([1, 2, 3].map((n) => ({ titre: `${PREFIXE}-evt${n}`, type_id: idType, date_debut: DATE_COMMUNE })))
    .select('id')
  if (erreurEvts || !evts || evts.length !== 3) throw new Error(`création des évènements impossible : ${erreurEvts?.message}`)
  idsEvenements = evts.map((l) => l.id as string)
  idEvenementPrincipal = idsEvenements[0]

  // QUATRE membres, QUATRE participations au même évènement, avec un `saisi_le` IDENTIQUE
  // posé explicitement : sans cet ex æquo, `.order('saisi_le')` suffirait par accident.
  const { data: membres, error: erreurMembres } = await admin
    .from('membres')
    .insert([1, 2, 3, 4].map((n) => ({ nom: `${PREFIXE}-m${n}`, prenom: 'Test', etat: 'actif' })))
    .select('id')
  if (erreurMembres || !membres || membres.length !== 4) {
    throw new Error(`création des membres impossible : ${erreurMembres?.message}`)
  }
  const instantCommun = '2026-09-15T10:00:00.000Z'
  const { data: parts, error: erreurParts } = await admin
    .from('participations')
    .insert(
      membres.map((m) => ({
        evenement_id: idEvenementPrincipal,
        membre_id: m.id,
        saisi_le: instantCommun,
      })),
    )
    .select('id')
  if (erreurParts || !parts || parts.length !== 4) {
    throw new Error(`création des participations impossible : ${erreurParts?.message}`)
  }
  idsParticipations = parts.map((l) => l.id as string)

  // TROIS externes avec désir, tous rattachés au MÊME évènement : leur
  // `premiere_expression` est donc identique, et c'est l'ex æquo qui compte ici.
  const { data: externes, error: erreurExternes } = await admin
    .from('participants_externes')
    .insert([1, 2, 3].map((n) => ({ nom: `${PREFIXE}-x${n}`, prenom: 'Test' })))
    .select('id')
  if (erreurExternes || !externes || externes.length !== 3) {
    throw new Error(`création des externes impossible : ${erreurExternes?.message}`)
  }
  idsExternesATraiter = externes.map((l) => l.id as string)
  const { error: erreurPartsExternes } = await admin.from('participations').insert(
    externes.map((x) => ({
      evenement_id: idEvenementPrincipal,
      participant_externe_id: x.id,
      desir_suivi_spirituel: true,
    })),
  )
  if (erreurPartsExternes) throw new Error(`participations d externes impossibles : ${erreurPartsExternes.message}`)
})

afterAll(async () => {
  await nettoyerFamille()
  for (const [table, colonne] of [
    ['evenements', 'titre'],
    ['participants_externes', 'nom'],
    ['membres', 'nom'],
    ['types_evenement', 'libelle'],
  ] as const) {
    const { count, error } = await admin
      .from(table)
      .select('id', { count: 'exact', head: true })
      .like(colonne, `${FAMILLE}%`)
    expect(error).toBeNull()
    expect(count).toBe(0)
  }
})

describe('pagination et tri total (preuve n°14)', () => {
  it("evenementsParPage : trois évènements À LA MÊME DATE, taille de page 2 — aucun rendu deux fois, aucun manquant", async () => {
    // Le filtre par type restreint le parcours aux lignes de CETTE exécution : la base de
    // production en contient d'autres, et compter sur un total absolu serait faux dès la
    // seconde exécution.
    const { ids, total } = await parcourir(
      (page) => evenementsParPage(admin, { page, typeId: idType, taillePage: 2 }),
      (l) => l.id,
    )
    // Aucun doublon : l'ensemble des identifiants collectés a exactement la taille de la
    // liste collectée.
    expect(new Set(ids).size).toBe(ids.length)
    // Aucun manquant : les trois identifiants créés sont tous là.
    expect(new Set(ids)).toEqual(new Set(idsEvenements))
    // Le total ANNONCÉ est le total RÉEL.
    expect(total).toBe(3)
    expect(ids.length).toBe(total)
  })

  it("participantsDEvenementParPage : quatre participations au MÊME `saisi_le`, taille de page 3 — dernière page partielle", async () => {
    const { ids, total } = await parcourir(
      (page) => participantsDEvenementParPage(admin, idEvenementPrincipal, { page, taillePage: 3 }),
      (l) => l.id,
    )
    // 7 lignes au total : 4 membres + 3 externes, tous sur cet évènement.
    expect(new Set(ids).size).toBe(ids.length)
    expect(total).toBe(7)
    expect(ids.length).toBe(total)
    for (const idParticipation of idsParticipations) {
      expect(ids).toContain(idParticipation)
    }
  })

  it("participantsDEvenementParPage : taille de page 2 — le total est un MULTIPLE… non, 7 n'en est pas un ; on éprouve donc aussi une taille qui DIVISE exactement", async () => {
    // Cas particulier réel : quand le total est un multiple EXACT de la taille de page, la
    // dernière page demandée démarre au nombre total de lignes. Établi contre cette base en
    // phase 3 : PostgREST répond alors une PAGE VIDE, jamais PGRST103. Le parcours doit
    // s'arrêter proprement, sans lever et sans perdre de ligne.
    const { ids, total } = await parcourir(
      (page) => participantsDEvenementParPage(admin, idEvenementPrincipal, { page, taillePage: 7 }),
      (l) => l.id,
    )
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.length).toBe(total)
    expect(total).toBe(7)
  })

  it("participantsATraiterParPage : trois personnes à la MÊME `premiere_expression`, taille de page 2", async () => {
    const { ids, total } = await parcourir(
      (page) => participantsATraiterParPage(admin, { page, taillePage: 2 }),
      (l) => l.participantExterneId,
    )
    expect(new Set(ids).size).toBe(ids.length)
    // La liste « à traiter » est GLOBALE (aucun filtre possible sur la famille) : on ne
    // compare donc pas un total absolu — qui serait faux dès qu'une autre suite laisse une
    // ligne —, mais on vérifie (a) l'absence de doublon sur l'ensemble parcouru, (b) que le
    // total annoncé est le nombre réellement collecté, et (c) que NOS TROIS lignes y sont.
    expect(ids.length).toBe(total)
    for (const idExterne of idsExternesATraiter) {
      expect(ids).toContain(idExterne)
    }
  })

  it('refuse une taille de page hors bornes plutôt que de la borner en silence', async () => {
    // Borner (`Math.min(taille, 999)`) masquerait un appel erroné derrière un comportement
    // différent de celui demandé — et une taille >= max_rows ferait tronquer la page PAR
    // POSTGREST, la boucle conclurait « dernière page », et la fonction rendrait une liste
    // tronquée COMME COMPLÈTE : le défaut d'origine, réintroduit par la porte ouverte pour
    // le corriger.
    await expect(evenementsParPage(admin, { taillePage: 1000 })).rejects.toThrow(/taillePage invalide/)
    await expect(evenementsParPage(admin, { taillePage: 0 })).rejects.toThrow(/taillePage invalide/)
    await expect(
      participantsDEvenementParPage(admin, idEvenementPrincipal, { taillePage: -1 }),
    ).rejects.toThrow(/taillePage invalide/)
    await expect(participantsATraiterParPage(admin, { taillePage: 1500 })).rejects.toThrow(
      /taillePage invalide/,
    )
  })
})
```

- [ ] **Étape 2 : exécuter, puis PREUVE PAR MUTATION sur le tri total**

```bash
npm run test:rls -- tests/rls/evenements-pagination.test.ts
```

Attendu : tout vert.

**Puis la mutation qui compte** : dans `src/lib/donnees/evenements-lots.ts`, **retirer
temporairement** le `.order('id')` final de `evenementsParPage`, relancer la suite, et
**constater que le test « trois évènements À LA MÊME DATE » tombe** — ou, s'il passe
malgré tout sur ce plan Postgres précis, **le noter dans le rapport sans conclure que le
tri est superflu** : la doctrine du registre (ronde Q1-Q7, Q4) est que `.order('id')` est
correct **en toute généralité** — aucune spécification SQL ne garantit l'ordre des ex æquo
sans tri total —, **même quand une mutation ne parvient pas à mettre le défaut en évidence
sur un plan donné**. **Restaurer**, relancer, tout vert.

```bash
git diff src/lib/donnees/evenements-lots.ts
```

Attendu après restauration : **aucune ligne de diff**.

- [ ] **Étape 3 : les six portes, puis commit**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls && npm run test:e2e && npm run build
```

```bash
git add tests/rls/evenements-pagination.test.ts
git commit -m "test: pagination et tri total des trois listes (preuve 14)"
```

---

### Task 26 : `tests/e2e/evenements.spec.ts` — visibilité différenciée et gardes forgés (preuves 15 et 16)

**Fichiers :**
- Créer : `tests/e2e/evenements.spec.ts`

**Interfaces :**
- Consomme : tous les écrans des Tasks 16 à 21.
- Produit : la couverture des preuves n°15 et n°16.

**Famille : `ZZEvtE2E-`.** Trois comptes : `test.e2e.evt.simple`,
`test.e2e.evt.moderateur`, `test.e2e.evt.admin`.

**Aucun nouveau parcours Playwright canonique n'est ajouté.** Le §8 de la spécification
maîtresse fixe **quatre** parcours pour tout le projet — connexion, inscription par token,
pointage AEL, validation d'une demande de suivi — et **aucun** ne concerne les évènements.
Ce fichier n'en ajoute pas d'office : il porte **la preuve n°15**, qui ne peut pas se faire
autrement, et **la preuve n°16**, par requête forgée.

## ⚠️ UN TEST QUI AFFIRME QU'UN RÔLE « NE PEUT PAS » DOIT FORGER L'APPEL ET PORTER UN CANARI

Un test de ce projet a déjà **certifié une garde qu'il n'éprouvait pas**, resté **vert
contre la version vulnérable**. Le masquage d'interface **ne protège rien** : il faut
**reproduire ce qu'un formulaire HTML envoie** (champs `$ACTION_*` capturés depuis une
session autorisée, rejoués depuis une session qui ne l'est pas), **vérifier l'absence
d'écriture EN BASE**, et prouver dans le **même fichier** que le mécanisme de forge
fonctionne — sinon un refus obtenu parce que la requête est **mal formée** serait
indiscernable d'un refus obtenu **par le garde**, et les deux rendraient le test vert **pour
toujours**.

- [ ] **Étape 1 : écrire la suite**

Créer `tests/e2e/evenements.spec.ts` :

```typescript
import { createClient } from '@supabase/supabase-js'
import { expect, test, type Page } from '@playwright/test'

// L'ordre des tests fait partie du scénario, et les comptes sont partagés.
test.describe.configure({ mode: 'serial' })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const MDP = `Test-${crypto.randomUUID()}`
const IDENT_SIMPLE = 'test.e2e.evt.simple'
const IDENT_MODERATEUR = 'test.e2e.evt.moderateur'
const IDENT_ADMIN = 'test.e2e.evt.admin'
const IDENTS = [IDENT_SIMPLE, IDENT_MODERATEUR, IDENT_ADMIN]

const FAMILLE = 'ZZEvtE2E-'
const PREFIXE = `${FAMILLE}${crypto.randomUUID().slice(0, 8)}`
// Titre de l'évènement qu'un compte simple tentera de créer par requête forgée : il doit
// être RETROUVABLE en base pour prouver qu'il n'y est PAS.
const TITRE_FORGE = `${PREFIXE}-forge-simple`
const TITRE_CANARI = `${PREFIXE}-canari-moderateur`

let idType: string
let idEvenement: string
let idMembre: string
let idExterneAConvertir: string
let idExterneCanari: string

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

async function creerCompte(identifiant: string, role: 'moderateur' | 'administrateur' | null) {
  const { data, error } = await admin.auth.admin.createUser({
    email: `${identifiant}@asonkeng.local`,
    password: MDP,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`création du compte ${identifiant} impossible : ${error?.message}`)
  const { error: erreurProfil } = await admin
    .from('profils')
    .insert({ id: data.user.id, identifiant, nom_affichage: `Test ${identifiant}` })
  if (erreurProfil) {
    await admin.auth.admin.deleteUser(data.user.id)
    throw new Error(`insertion du profil ${identifiant} impossible : ${erreurProfil.message}`)
  }
  if (role) {
    const { error: erreurRole } = await admin
      .from('roles_profil')
      .insert({ profil_id: data.user.id, role })
    if (erreurRole) {
      await admin.auth.admin.deleteUser(data.user.id)
      throw new Error(`attribution du rôle ${role} impossible : ${erreurRole.message}`)
    }
  }
}

async function seConnecter(page: Page, identifiant: string) {
  await page.goto('/connexion')
  await page.getByLabel('Identifiant').fill(identifiant)
  await page.getByLabel('Mot de passe', { exact: true }).fill(MDP)
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

/**
 * Lève si la capture n'a trouvé aucun champ `$ACTION*` : mieux vaut un échec bruyant ici
 * qu'un test qui, silencieusement, ne teste plus rien. C'est le premier des deux filets
 * contre « le refus vient de la forge, pas du garde » ; le second est le canari.
 */
function verifierCaptureAction(champs: Record<string, string>): void {
  const trouve = Object.keys(champs).some((nom) => nom.startsWith('$ACTION'))
  if (!trouve) {
    throw new Error(
      `Capture invalide : aucun champ « $ACTION* » parmi ${JSON.stringify(Object.keys(champs))}. ` +
        "L'encodage des Server Actions a peut-être changé — ce test ne peut plus prouver ce qu'il prétend.",
    )
  }
}

async function nettoyer() {
  const { data: evts } = await admin.from('evenements').select('id').like('titre', `${FAMILLE}%`)
  const idsEvts = (evts ?? []).map((l) => l.id as string)
  const { data: externes } = await admin.from('participants_externes').select('id').like('nom', `${FAMILLE}%`)
  const idsExternes = (externes ?? []).map((l) => l.id as string)
  const { data: membres } = await admin.from('membres').select('id').like('nom', `${FAMILLE}%`)
  const idsMembres = (membres ?? []).map((l) => l.id as string)

  for (const [colonne, ids] of [
    ['evenement_id', idsEvts],
    ['participant_externe_id', idsExternes],
    ['membre_id', idsMembres],
  ] as const) {
    if (ids.length > 0) await admin.from('participations').delete().in(colonne, ids)
  }
  // Demandes AVANT les membres (`on delete set null` effacerait la prise), et
  // notifications avant les demandes : le chemin 1 emprunté par le canari en émet, et le
  // compte racine ne doit pas rester pollué — on peut le polluer sans jamais le toucher.
  if (idsMembres.length > 0) {
    const { data: demandes } = await admin.from('demandes_membre').select('id').in('membre_id', idsMembres)
    const idsDemandes = (demandes ?? []).map((l) => l.id as string)
    if (idsDemandes.length > 0) {
      await admin.from('notifications').delete().in('demande_id', idsDemandes)
      await admin.from('demandes_membre').delete().in('id', idsDemandes)
    }
  }
  if (idsExternes.length > 0) await admin.from('participants_externes').delete().in('id', idsExternes)
  if (idsMembres.length > 0) await admin.from('membres').delete().in('id', idsMembres)
  if (idsEvts.length > 0) await admin.from('evenements').delete().in('id', idsEvts)
  await admin.from('types_evenement').delete().like('libelle', `${FAMILLE}%`)
}

test.beforeAll(async () => {
  await nettoyer()
  for (const identifiant of IDENTS) await supprimerCompte(identifiant)

  await creerCompte(IDENT_SIMPLE, null)
  await creerCompte(IDENT_MODERATEUR, 'moderateur')
  await creerCompte(IDENT_ADMIN, 'administrateur')

  const { data: type, error: erreurType } = await admin
    .from('types_evenement')
    .insert({ libelle: `${PREFIXE}-type` })
    .select('id')
    .single()
  if (erreurType || !type) throw new Error(`création du type impossible : ${erreurType?.message}`)
  idType = type.id as string

  const { data: evt, error: erreurEvt } = await admin
    .from('evenements')
    .insert({ titre: `${PREFIXE}-evenement`, type_id: idType, date_debut: '2026-09-01' })
    .select('id')
    .single()
  if (erreurEvt || !evt) throw new Error(`création de l évènement impossible : ${erreurEvt?.message}`)
  idEvenement = evt.id as string

  const { data: membre, error: erreurMembre } = await admin
    .from('membres')
    .insert({ nom: `${PREFIXE}-membre`, prenom: 'Test', etat: 'actif' })
    .select('id')
    .single()
  if (erreurMembre || !membre) throw new Error(`création du membre impossible : ${erreurMembre?.message}`)
  idMembre = membre.id as string

  // Deux externes avec désir : l'un servira la tentative FORGÉE du modérateur, l'autre le
  // CANARI de l'administrateur. Deux cibles distinctes, sans quoi les deux tests se
  // coupleraient et l'un échouerait sur la précondition de l'autre plutôt que sur son
  // assertion de sécurité.
  const { data: externes, error: erreurExternes } = await admin
    .from('participants_externes')
    .insert([
      { nom: `${PREFIXE}-x-forge`, prenom: 'Test' },
      { nom: `${PREFIXE}-x-canari`, prenom: 'Test' },
    ])
    .select('id, nom')
  if (erreurExternes || !externes || externes.length !== 2) {
    throw new Error(`création des externes impossible : ${erreurExternes?.message}`)
  }
  idExterneAConvertir = externes.find((x) => (x.nom as string).endsWith('-x-forge'))!.id as string
  idExterneCanari = externes.find((x) => (x.nom as string).endsWith('-x-canari'))!.id as string

  const { error: erreurParts } = await admin.from('participations').insert([
    { evenement_id: idEvenement, participant_externe_id: idExterneAConvertir, desir_suivi_spirituel: true },
    { evenement_id: idEvenement, participant_externe_id: idExterneCanari, desir_suivi_spirituel: true },
  ])
  if (erreurParts) throw new Error(`participations impossibles : ${erreurParts.message}`)
})

test.afterAll(async () => {
  await nettoyer()
  // NETTOYAGE VÉRIFIÉ PAR COMPTAGE, sur la MÊME famille que la suppression.
  for (const [table, colonne] of [
    ['evenements', 'titre'],
    ['participants_externes', 'nom'],
    ['membres', 'nom'],
    ['types_evenement', 'libelle'],
  ] as const) {
    const { count } = await admin
      .from(table)
      .select('id', { count: 'exact', head: true })
      .like(colonne, `${FAMILLE}%`)
    expect(count, `résidu dans ${table}`).toBe(0)
  }
  for (const identifiant of IDENTS) await supprimerCompte(identifiant)
})

// ————————————————————————————————————————————————————————————————
// PREUVE N°15 — visibilité différenciée de /evenements/[id], DEPUIS CHAQUE RÔLE
// ————————————————————————————————————————————————————————————————

test("compte simple : l'en-tête de l'évènement s'affiche, la section participants est ABSENTE", async ({ page }) => {
  await seConnecter(page, IDENT_SIMPLE)
  await page.goto(`/evenements/${idEvenement}`)

  // CONTRÔLE POSITIF DANS LA MÊME SITUATION, ET IL EST OBLIGATOIRE : une assertion
  // négative seule ne distinguerait pas « la section est cachée » de « la page n'a pas
  // chargé ».
  await expect(page.getByRole('heading', { name: `${PREFIXE}-evenement` })).toBeVisible()
  await expect(page.getByText(`${PREFIXE}-type`)).toBeVisible()

  // La section n'est PAS VIDE, elle n'est PAS RENDUE. Un compte ordinaire qui lirait
  // `participations` sous RLS obtiendrait zéro ligne, et un évènement à cent participants
  // lui paraîtrait désert — un mensonge, pas une protection.
  await expect(page.getByRole('heading', { name: /^Participants/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Ajouter ce membre' })).toHaveCount(0)
  await expect(page.getByText('Trois désirs')).toHaveCount(0)
  // Ni le bloc de modification.
  await expect(page.getByText("Modifier l'évènement")).toHaveCount(0)
})

test('compte modérateur : la section participants et le bloc de modification sont présents', async ({ page }) => {
  await seConnecter(page, IDENT_MODERATEUR)
  await page.goto(`/evenements/${idEvenement}`)

  await expect(page.getByRole('heading', { name: `${PREFIXE}-evenement` })).toBeVisible()
  await expect(page.getByRole('heading', { name: /^Participants/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ajouter ce membre' })).toBeVisible()
  await expect(page.getByText("Modifier l'évènement")).toBeVisible()
})

test('compte administrateur : même visibilité que le modérateur, plus le lien vers le catalogue', async ({ page }) => {
  await seConnecter(page, IDENT_ADMIN)
  await page.goto(`/evenements/${idEvenement}`)
  await expect(page.getByRole('heading', { name: /^Participants/ })).toBeVisible()

  await page.goto('/evenements')
  await expect(page.getByRole('link', { name: 'Gérer les types' })).toBeVisible()
})

test("liste à traiter : le modérateur consulte mais ne voit NI conversion NI classement (D55)", async ({ page }) => {
  await seConnecter(page, IDENT_MODERATEUR)
  await page.goto('/evenements/a-traiter')

  // CONTRÔLE POSITIF : la liste est bien chargée et notre participant y figure.
  await expect(page.getByText(`${PREFIXE}-x-forge`)).toBeVisible()
  // Les deux gestes réservés à l'administrateur sont absents.
  await expect(page.getByText('Convertir en membre')).toHaveCount(0)
  await expect(page.getByText('Classer sans suite')).toHaveCount(0)
  await expect(page.getByText('réservés aux administrateurs')).toBeVisible()
})

test("liste à traiter : un compte simple est redirigé vers le tableau de bord", async ({ page }) => {
  await seConnecter(page, IDENT_SIMPLE)
  await page.goto('/evenements/a-traiter')
  await expect(page).toHaveURL(/\/tableau-de-bord/)
})

// ————————————————————————————————————————————————————————————————
// PREUVE N°16 — gardes forgés, plus deux canaris
// ————————————————————————————————————————————————————————————————

test("un compte SIMPLE ne peut pas créer d'évènement par une requête forgée", async ({ page, browser, baseURL }) => {
  // Précondition : le titre visé n'existe pas encore. Sans elle, l'assertion finale
  // pourrait passer sur un résidu d'une exécution antérieure.
  const { count: avant } = await admin
    .from('evenements')
    .select('id', { count: 'exact', head: true })
    .eq('titre', TITRE_FORGE)
  expect(avant).toBe(0)

  await seConnecter(page, IDENT_ADMIN)
  await page.goto('/evenements')
  // Le `<details>` doit être ouvert pour que le formulaire soit dans le DOM.
  await page.getByText('Nouvel évènement').click()
  const formulaire = page.locator('form').filter({ has: page.getByRole('button', { name: 'Créer' }) })
  const champs = extraireChampsCaches(await formulaire.evaluate((el) => el.outerHTML))
  verifierCaptureAction(champs)

  const contexteSimple = await browser.newContext({ baseURL })
  try {
    const pageSimple = await contexteSimple.newPage()
    await seConnecter(pageSimple, IDENT_SIMPLE)
    await pageSimple.request.post('/evenements', {
      multipart: { ...champs, titre: TITRE_FORGE, typeId: idType, dateDebut: '2026-09-02' },
    })
  } finally {
    await contexteSimple.close()
  }

  // SEULE ASSERTION QUI COMPTE : aucune ligne n'a été créée, quel qu'ait été le code HTTP.
  const { count: apres } = await admin
    .from('evenements')
    .select('id', { count: 'exact', head: true })
    .eq('titre', TITRE_FORGE)
  expect(apres).toBe(0)
})

test("un compte SIMPLE ne peut pas ajouter une participation par une requête forgée", async ({ page, browser, baseURL }) => {
  const { count: avant } = await admin
    .from('participations')
    .select('id', { count: 'exact', head: true })
    .eq('evenement_id', idEvenement)
    .eq('membre_id', idMembre)
  expect(avant).toBe(0)

  await seConnecter(page, IDENT_ADMIN)
  await page.goto(`/evenements/${idEvenement}`)
  const formulaire = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Ajouter ce membre' }) })
  const champs = extraireChampsCaches(await formulaire.evaluate((el) => el.outerHTML))
  verifierCaptureAction(champs)

  const contexteSimple = await browser.newContext({ baseURL })
  try {
    const pageSimple = await contexteSimple.newPage()
    await seConnecter(pageSimple, IDENT_SIMPLE)
    await pageSimple.request.post(`/evenements/${idEvenement}`, {
      multipart: { ...champs, evenementId: idEvenement, membreId: idMembre },
    })
  } finally {
    await contexteSimple.close()
  }

  const { count: apres } = await admin
    .from('participations')
    .select('id', { count: 'exact', head: true })
    .eq('evenement_id', idEvenement)
    .eq('membre_id', idMembre)
  expect(apres).toBe(0)
})

test("un compte MODÉRATEUR ne peut pas convertir par une requête forgée (D55)", async ({ page, browser, baseURL }) => {
  const { data: avant } = await admin
    .from('participants_externes')
    .select('converti_en_membre_id')
    .eq('id', idExterneAConvertir)
    .single()
  expect(avant!.converti_en_membre_id).toBeNull()

  await seConnecter(page, IDENT_ADMIN)
  await page.goto('/evenements/a-traiter')
  await page
    .locator('li')
    .filter({ hasText: `${PREFIXE}-x-forge` })
    .getByText('Convertir en membre')
    .click()
  const formulaire = page
    .locator('li')
    .filter({ hasText: `${PREFIXE}-x-forge` })
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Convertir' }) })
  const champs = extraireChampsCaches(await formulaire.evaluate((el) => el.outerHTML))
  verifierCaptureAction(champs)

  const contexteModerateur = await browser.newContext({ baseURL })
  try {
    const pageModerateur = await contexteModerateur.newPage()
    await seConnecter(pageModerateur, IDENT_MODERATEUR)
    await pageModerateur.request.post('/evenements/a-traiter', {
      multipart: {
        ...champs,
        participantId: idExterneAConvertir,
        chemin: 'membre_existant',
        membreCibleId: idMembre,
      },
    })
  } finally {
    await contexteModerateur.close()
  }

  // VÉRIFICATION EN BASE : rien n'a été converti.
  const { data: apres } = await admin
    .from('participants_externes')
    .select('converti_en_membre_id')
    .eq('id', idExterneAConvertir)
    .single()
  expect(apres!.converti_en_membre_id).toBeNull()
})

test("un compte MODÉRATEUR ne peut pas classer sans suite par une requête forgée (D55)", async ({ page, browser, baseURL }) => {
  const { data: avant } = await admin
    .from('participants_externes')
    .select('classe_le')
    .eq('id', idExterneAConvertir)
    .single()
  expect(avant!.classe_le).toBeNull()

  await seConnecter(page, IDENT_ADMIN)
  await page.goto('/evenements/a-traiter')
  await page
    .locator('li')
    .filter({ hasText: `${PREFIXE}-x-forge` })
    .getByText('Classer sans suite')
    .first()
    .click()
  const formulaire = page
    .locator('li')
    .filter({ hasText: `${PREFIXE}-x-forge` })
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Classer sans suite' }) })
  const champs = extraireChampsCaches(await formulaire.evaluate((el) => el.outerHTML))
  verifierCaptureAction(champs)

  const contexteModerateur = await browser.newContext({ baseURL })
  try {
    const pageModerateur = await contexteModerateur.newPage()
    await seConnecter(pageModerateur, IDENT_MODERATEUR)
    await pageModerateur.request.post('/evenements/a-traiter', {
      multipart: { ...champs, participantId: idExterneAConvertir, motif: 'Tentative forgée' },
    })
  } finally {
    await contexteModerateur.close()
  }

  const { data: apres } = await admin
    .from('participants_externes')
    .select('classe_le, motif_classement')
    .eq('id', idExterneAConvertir)
    .single()
  expect(apres!.classe_le).toBeNull()
  expect(apres!.motif_classement).toBeNull()
})

test("CANARI 1 : un MODÉRATEUR RÉEL crée bien un évènement, dans un contexte neuf", async ({ page }) => {
  // Sans ce canari, les quatre refus ci-dessus pourraient venir d'une requête MAL FORMÉE
  // (encodage `$ACTION_*` changé, vérification d'origine durcie, formulaire remanié) et non
  // du garde — indiscernable, et vert pour toujours. Ici, le geste passe par l'INTERFACE,
  // depuis le rôle qui y a droit : s'il tombe, c'est l'application qui est en cause, pas la
  // sécurité, et personne ne pourra confondre les deux.
  await seConnecter(page, IDENT_MODERATEUR)
  await page.goto('/evenements')
  await page.getByText('Nouvel évènement').click()
  await page.getByLabel('Titre').fill(TITRE_CANARI)
  await page.getByLabel('Type').selectOption({ label: `${PREFIXE}-type` })
  await page.getByLabel('Date de début').fill('2026-09-03')
  await page.getByRole('button', { name: 'Créer' }).click()

  await expect(page).toHaveURL(/\/evenements\/[0-9a-f-]{36}$/)
  const { count } = await admin
    .from('evenements')
    .select('id', { count: 'exact', head: true })
    .eq('titre', TITRE_CANARI)
  expect(count).toBe(1)
})

test("CANARI 2 : un ADMINISTRATEUR RÉEL convertit bien un participant, dans un contexte neuf", async ({ page }) => {
  await seConnecter(page, IDENT_ADMIN)
  await page.goto('/evenements/a-traiter')
  const ligne = page.locator('li').filter({ hasText: `${PREFIXE}-x-canari` })
  await ligne.getByText('Convertir en membre').click()
  // Chemin 3 : aucune fiche créée, AUCUNE demande, donc AUCUNE notification — le compte
  // racine n'est pas pollué par ce canari.
  await ligne.getByLabel('Rattacher à une fiche membre existante').check()
  await ligne.getByPlaceholder('Chercher par nom ou prénom').fill(`${PREFIXE}-membre`)
  await ligne.getByRole('button', { name: new RegExp(`${PREFIXE}-membre`) }).click()
  await ligne.getByRole('button', { name: 'Convertir' }).click()

  // VÉRIFICATION EN BASE, pas à l'écran : le lien est posé.
  await expect
    .poll(async () => {
      const { data } = await admin
        .from('participants_externes')
        .select('converti_en_membre_id')
        .eq('id', idExterneCanari)
        .single()
      return data?.converti_en_membre_id ?? null
    })
    .toBe(idMembre)
})
```

- [ ] **Étape 2 : exécuter**

```bash
npm run test:e2e -- tests/e2e/evenements.spec.ts
```

Attendu : tout vert, `afterAll` compris (aucun `expect(count).toBe(0)` en échec).

- [ ] **Étape 3 : PREUVE PAR MUTATION sur les gardes — la seule qui distingue un vrai test d'un test complaisant**

Un test de ce projet a déjà **certifié une garde qu'il n'éprouvait pas**. Éprouver **chacune
des quatre**, une à la fois :

1. Dans `src/app/evenements/actions.ts`, remplacer
   `await exigerModerateurOuAdministrateur()` par `await exigerProfilActif()` (importer le
   garde). Relancer : **le test « un compte SIMPLE ne peut pas créer d'évènement » DOIT
   TOMBER**, et **le canari 1 doit rester VERT**. Restaurer.
2. Même mutation dans `src/app/evenements/[id]/participants-actions.ts` sur
   `ajouterParticipantMembre` : **le test de participation forgée DOIT TOMBER**. Restaurer.
3. Dans `src/app/evenements/a-traiter/actions.ts`, remplacer `await exigerAdministrateur()`
   par `await exigerModerateurOuAdministrateur()` dans `convertirParticipant` : **le test
   de conversion forgée DOIT TOMBER**, et **le canari 2 doit rester VERT**. Restaurer.
4. Idem sur `classerParticipant` : **le test de classement forgé DOIT TOMBER**. Restaurer.

Après chaque restauration :

```bash
git diff --stat src/app/evenements
```

Attendu : **aucune ligne de diff**. Consigner, pour chacune des quatre mutations, **quel
test est tombé et lesquels sont restés verts**.

- [ ] **Étape 4 : les six portes, puis commit**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls && npm run test:e2e && npm run build
```

```bash
git add tests/e2e/evenements.spec.ts
git commit -m "test: visibilite differenciee et gardes forges des evenements (preuves 15, 16)"
```

---

### Task 27 : `tests/e2e-prod/refus-evenements-production.spec.ts` — le refus métier contre un vrai build

**Fichiers :**
- Créer : `tests/e2e-prod/refus-evenements-production.spec.ts`

**Interfaces :**
- Consomme : `MESSAGE_MOTIF_OBLIGATOIRE_CLASSEMENT` et `MESSAGE_FICHE_CIBLE_NON_ACTIVE`
  (T21), importés **depuis `src/`** — jamais recopiés en dur, sans quoi le test resterait
  vert quand le message change.
- Produit : la preuve que les refus métier de cette phase **atteignent réellement l'écran
  en production**.

## ⚠️ LA SUITE E2E ORDINAIRE NE PEUT PAS VOIR CE DÉFAUT

`npm run test:e2e` sert `npm run dev`. En **développement**, une exception levée depuis une
Server Action est transmise **intacte** au client ; en **production seulement**, React la
remplace par un digest (`Minified React error #441`, react.dev/errors/441 : « The specific
message is omitted in production builds »). **Ce motif est apparu cinq fois dans ce projet,
chaque fois un cran plus profond.** `npm run test:e2e:prod` (`playwright.prod.config.ts`,
port **3100**, `npm run build && next start`) est **la seule suite** qui l'attrape.

**Deux refus sont éprouvés, et le choix n'est pas arbitraire :**
- **`motif_classement_vide`** — refus rendu par le **contrôle amont** (`motifClassementValide`),
  sans aller jusqu'à la base ;
- **`membre_cible_non_actif`** — refus rendu depuis un **marqueur Postgres** remonté par la
  passerelle.

Les deux chemins de retour sont donc couverts. **Aucun des deux n'emprunte le chemin 1** :
aucune demande, **aucune notification**, donc **le compte racine n'est pas pollué**.

- [ ] **Étape 1 : écrire la suite**

Créer `tests/e2e-prod/refus-evenements-production.spec.ts` :

```typescript
import { createClient } from '@supabase/supabase-js'
import { expect, test, type Page } from '@playwright/test'
import { identifiantVersEmail } from '../../src/lib/domaine/identifiant'
import {
  MESSAGE_FICHE_CIBLE_NON_ACTIVE,
  MESSAGE_MOTIF_OBLIGATOIRE_CLASSEMENT,
} from '../../src/app/evenements/a-traiter/messages'

/**
 * PREUVE REJOUABLE CONTRE UN BUILD DE PRODUCTION (`next build` + `next start`, voir
 * `playwright.prod.config.ts`).
 *
 * `npm run test:e2e` sert `npm run dev`, et ce mode NE PEUT PAS révéler la classe de défaut
 * éprouvée ici : une exception LEVÉE depuis une Server Action est transmise intacte au
 * client en développement, mais perd son message EN PRODUCTION SEULEMENT — React la
 * remplace par un digest interne (« Minified React error #441 »). Ce motif est apparu CINQ
 * FOIS dans ce projet.
 *
 * Les messages sont IMPORTÉS depuis `src/`, jamais recopiés : recopiés, ce fichier
 * resterait vert le jour où le message change, et n'éprouverait plus rien.
 *
 * Deux refus, deux chemins de retour distincts : `motif_classement_vide` vient du contrôle
 * AMONT (aucun aller-retour en base) ; `membre_cible_non_actif` vient d'un marqueur
 * POSTGRES remonté par la passerelle. Aucun des deux n'emprunte le chemin 1, donc aucune
 * notification n'est émise et le compte racine n'est pas pollué.
 */

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const MDP = `Test-${crypto.randomUUID()}`
const IDENT_ADMIN = 'test.e2e.prod.evt.admin'
const FAMILLE = 'ZZEvtProd-'
const PREFIXE = `${FAMILLE}${crypto.randomUUID().slice(0, 8)}`

let idType: string
let idEvenement: string
let idMembreArchive: string
let idExterne: string

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

async function seConnecter(page: Page, identifiant: string) {
  await page.goto('/connexion')
  await page.getByLabel('Identifiant').fill(identifiant)
  await page.getByLabel('Mot de passe', { exact: true }).fill(MDP)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page).toHaveURL(/\/tableau-de-bord/)
}

async function nettoyer() {
  const { data: evts } = await admin.from('evenements').select('id').like('titre', `${FAMILLE}%`)
  const idsEvts = (evts ?? []).map((l) => l.id as string)
  const { data: externes } = await admin.from('participants_externes').select('id').like('nom', `${FAMILLE}%`)
  const idsExternes = (externes ?? []).map((l) => l.id as string)
  const { data: membres } = await admin.from('membres').select('id').like('nom', `${FAMILLE}%`)
  const idsMembres = (membres ?? []).map((l) => l.id as string)

  for (const [colonne, ids] of [
    ['evenement_id', idsEvts],
    ['participant_externe_id', idsExternes],
    ['membre_id', idsMembres],
  ] as const) {
    if (ids.length > 0) await admin.from('participations').delete().in(colonne, ids)
  }
  if (idsExternes.length > 0) await admin.from('participants_externes').delete().in('id', idsExternes)
  if (idsMembres.length > 0) await admin.from('membres').delete().in('id', idsMembres)
  if (idsEvts.length > 0) await admin.from('evenements').delete().in('id', idsEvts)
  await admin.from('types_evenement').delete().like('libelle', `${FAMILLE}%`)
}

test.beforeAll(async () => {
  await nettoyer()
  await supprimerCompte(IDENT_ADMIN)

  const { data: compte, error: erreurCompte } = await admin.auth.admin.createUser({
    email: identifiantVersEmail(IDENT_ADMIN),
    password: MDP,
    email_confirm: true,
  })
  if (erreurCompte || !compte.user) throw new Error(`création du compte impossible : ${erreurCompte?.message}`)
  const { error: erreurProfil } = await admin
    .from('profils')
    .insert({ id: compte.user.id, identifiant: IDENT_ADMIN, nom_affichage: 'Test prod évènements' })
  if (erreurProfil) throw new Error(`insertion du profil impossible : ${erreurProfil.message}`)
  const { error: erreurRole } = await admin
    .from('roles_profil')
    .insert({ profil_id: compte.user.id, role: 'administrateur' })
  if (erreurRole) throw new Error(`attribution du rôle impossible : ${erreurRole.message}`)

  const { data: type, error: erreurType } = await admin
    .from('types_evenement')
    .insert({ libelle: `${PREFIXE}-type` })
    .select('id')
    .single()
  if (erreurType || !type) throw new Error(`création du type impossible : ${erreurType?.message}`)
  idType = type.id as string

  const { data: evt, error: erreurEvt } = await admin
    .from('evenements')
    .insert({ titre: `${PREFIXE}-evenement`, type_id: idType, date_debut: '2026-09-01' })
    .select('id')
    .single()
  if (erreurEvt || !evt) throw new Error(`création de l évènement impossible : ${erreurEvt?.message}`)
  idEvenement = evt.id as string

  const { data: membre, error: erreurMembre } = await admin
    .from('membres')
    .insert({ nom: `${PREFIXE}-archive`, prenom: 'Test', etat: 'archive' })
    .select('id')
    .single()
  if (erreurMembre || !membre) throw new Error(`création du membre archivé impossible : ${erreurMembre?.message}`)
  idMembreArchive = membre.id as string

  const { data: externe, error: erreurExterne } = await admin
    .from('participants_externes')
    .insert({ nom: `${PREFIXE}-externe`, prenom: 'Test' })
    .select('id')
    .single()
  if (erreurExterne || !externe) throw new Error(`création de l externe impossible : ${erreurExterne?.message}`)
  idExterne = externe.id as string

  const { error: erreurPart } = await admin.from('participations').insert({
    evenement_id: idEvenement,
    participant_externe_id: idExterne,
    desir_suivi_spirituel: true,
  })
  if (erreurPart) throw new Error(`participation impossible : ${erreurPart.message}`)
})

test.afterAll(async () => {
  await nettoyer()
  for (const [table, colonne] of [
    ['evenements', 'titre'],
    ['participants_externes', 'nom'],
    ['membres', 'nom'],
    ['types_evenement', 'libelle'],
  ] as const) {
    const { count } = await admin
      .from(table)
      .select('id', { count: 'exact', head: true })
      .like(colonne, `${FAMILLE}%`)
    expect(count, `résidu dans ${table}`).toBe(0)
  }
  await supprimerCompte(IDENT_ADMIN)
})

test("le refus « motif obligatoire » s'affiche TEL QUEL contre un build de production", async ({ page }) => {
  await seConnecter(page, IDENT_ADMIN)
  await page.goto('/evenements/a-traiter')

  const ligne = page.locator('li').filter({ hasText: `${PREFIXE}-externe` })
  await ligne.getByText('Classer sans suite').first().click()
  // Le champ `required` du navigateur bloquerait un envoi vide : on saisit des ESPACES,
  // qui passent la validation HTML et déclenchent le refus SERVEUR — c'est ce refus-là,
  // et lui seul, que ce fichier existe pour éprouver.
  await ligne.getByLabel('Motif').fill('   ')
  await ligne.getByRole('button', { name: 'Classer sans suite' }).click()

  // LE TEXTE RÉELLEMENT AFFICHÉ, importé depuis `src/`. S'il devenait « Minified React
  // error #441 », c'est que l'action LÈVE au lieu de RETOURNER.
  await expect(page.getByRole('alert')).toContainText(MESSAGE_MOTIF_OBLIGATOIRE_CLASSEMENT)

  // Et rien n'a été écrit : le refus est un refus, pas un demi-succès.
  const { data } = await admin
    .from('participants_externes')
    .select('classe_le')
    .eq('id', idExterne)
    .single()
  expect(data!.classe_le).toBeNull()
})

test("le refus « fiche cible non active » — remonté d'un MARQUEUR POSTGRES — s'affiche tel quel en production", async ({ page }) => {
  await seConnecter(page, IDENT_ADMIN)
  await page.goto('/evenements/a-traiter')

  const ligne = page.locator('li').filter({ hasText: `${PREFIXE}-externe` })
  await ligne.getByText('Convertir en membre').click()
  await ligne.getByLabel('Rattacher à une fiche membre existante').check()

  // `SelecteurMembre` ne propose que des membres ACTIFS : la fiche archivée n'y apparaît
  // pas, et c'est voulu (double dispositif de D68). On force donc la valeur du champ caché,
  // ce qui reproduit EXACTEMENT le cas réel visé — un onglet resté ouvert qui reposte un
  // identifiant devenu invalide entre-temps.
  const champCache = ligne.locator('input[name="membreCibleId"]')
  await champCache.evaluate((element, valeur) => {
    ;(element as HTMLInputElement).value = valeur
  }, idMembreArchive)
  // GARDE : sans elle, un re-rendu React qui réinitialiserait le champ contrôlé rendrait le
  // formulaire vide, le contrôle amont `champManquantConversion` renverrait
  // MESSAGE_FICHE_CIBLE_OBLIGATOIRE, et le test échouerait sur l'assertion suivante SANS
  // qu'on sache que c'est la forge qui a raté, pas le refus qui manque.
  await expect(champCache).toHaveValue(idMembreArchive)
  await ligne.getByRole('button', { name: 'Convertir' }).click()

  await expect(page.getByRole('alert')).toContainText(MESSAGE_FICHE_CIBLE_NON_ACTIVE)

  const { data } = await admin
    .from('participants_externes')
    .select('converti_en_membre_id')
    .eq('id', idExterne)
    .single()
  expect(data!.converti_en_membre_id).toBeNull()
})
```

- [ ] **Étape 2 : exécuter contre un build de PRODUCTION**

```bash
npm run test:e2e:prod
```

⚠️ **Le port 3100 est dédié à cette suite.** Si une autre exécution occupe déjà ce port,
`webServer` échouera — vérifier avant de conclure à un défaut applicatif.

Attendu : les **deux** tests verts, **plus** les tests préexistants de `tests/e2e-prod/`.

- [ ] **Étape 3 : PREUVE PAR MUTATION — c'est elle qui donne sa valeur au fichier**

Dans `src/app/evenements/a-traiter/actions.ts`, remplacer temporairement, dans
`classerParticipant` :

```typescript
    return { erreur: MESSAGE_MOTIF_OBLIGATOIRE_CLASSEMENT }
```

par :

```typescript
    throw new Error(MESSAGE_MOTIF_OBLIGATOIRE_CLASSEMENT)
```

Puis :

```bash
npm run test:e2e:prod
```

**Attendu : le premier test TOMBE**, et le texte réellement rendu contient
`Minified React error #441` **ou** la page d'erreur statique — **consigner ce que
l'assertion a réellement vu**, c'est la démonstration du mécanisme.

**Contrôle complémentaire, et il est instructif** : relancer la **même** mutation contre
la suite ordinaire —

```bash
npm run test:e2e -- tests/e2e/evenements.spec.ts
```

**Attendu : elle reste VERTE.** C'est exactement pourquoi `test:e2e:prod` existe : la suite
ordinaire **ne peut pas** voir cette classe de défaut.

**Restaurer**, relancer les deux :

```bash
git diff --stat src/app/evenements/a-traiter/actions.ts
```

Attendu : **aucune ligne de diff**.

- [ ] **Étape 4 : les six portes + le build de production, puis commit**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls && npm run test:e2e && npm run build
```

```bash
npm run test:e2e:prod
```

```bash
git add tests/e2e-prod/refus-evenements-production.spec.ts
git commit -m "test: refus metier des evenements contre un build de production"
```

---

# Partie G — Documentation

### Task 28 : note de renvoi des décisions, désambiguïsation D36-D43, et la ligne manquante de la matrice (D55)

**Fichiers :**
- Modifier : `docs/superpowers/specs/2026-08-11-suivi-asonkeng-design.md`

**Interfaces :**
- Consomme : rien.
- Produit : trois amendements datés dans la spécification maîtresse. **Aucun code.**
  **Aucune décision renumérotée.**

**Pourquoi cette tâche existe.** La table des décisions du §2 de la spécification maîtresse
**s'arrête à D29** alors que le projet en compte **plus de quatre-vingts** : **plus de la
moitié sont invisibles depuis le document censé faire autorité**. Un lecteur qui part de la
spécification maîtresse **ignore l'existence de D30 à D80**. C'est **le même mécanisme de
dérive** que la contradiction du §4.4 — qui a survécu **deux phases** parce que personne
n'était allé relire deux paragraphes —, appliqué à un autre axe. La note de renvoi le
ferme, sur le modèle de celle qui existe déjà pour D17-D21.

- [ ] **Étape 1 : VÉRIFIER QUE D54 EST DÉJÀ APPLIQUÉE — ne pas la refaire**

Le design de la phase 4 dit que la correction du §4.4 et du §6 **est portée dans la
spécification elle-même**. **Au moment où ce plan est écrit, elle l'est déjà.** Refaire
l'amendement produirait un **doublon** de correction datée, exactement le genre de seconde
vérité que ce plan existe pour éviter.

```bash
grep -n "Correction du 2026-08-14 (D54)" docs/superpowers/specs/2026-08-11-suivi-asonkeng-design.md
```

**Attendu : DEUX occurrences** — une au §4.4, une au §6. Si elles sont là, **ne rien
écrire pour D54** et le noter dans le rapport. Si l'une manque, l'ajouter en reprenant mot
pour mot le §2 du design de la phase 4.

- [ ] **Étape 2 : la note de renvoi des décisions, au §2**

Dans `docs/superpowers/specs/2026-08-11-suivi-asonkeng-design.md`, **juste après** le bloc
de citation qui commence par `> **D17 à D21** sont posées dans` et **avant** le paragraphe
« **Hors périmètre, volontairement** », insérer :

```markdown
> **Ajout du 2026-08-14 — où vivent les décisions D30 à D80.** La table ci-dessus s'arrête
> à D29. Elle ne les recopie pas, et ce n'est pas un oubli : les décisions prises pendant le
> cadrage d'une phase vivent dans le design de cette phase, avec leur justification
> complète. Cette note dit **où chercher**, pour qu'un lecteur partant d'ici n'ignore plus
> leur existence — plus de la moitié des décisions du projet étaient invisibles depuis ce
> document.
>
> | Plage | Document |
> |---|---|
> | D1 à D16, D22 à D29 | **ce document**, table du §2 ci-dessus |
> | D17 à D21 | `2026-08-12-phase-1c-design.md` |
> | D30 à D43 | `2026-08-13-phase-2b-inscriptions-design.md` (D43 au §7.1, hors table) |
> | D36 à D53 | `2026-08-13-phase-3-ael-design.md` |
> | D54 à D80 | `2026-08-14-phase-4-evenements-design.md` |
>
> **⚠️ D36 à D43 apparaissent DEUX FOIS dans ce tableau, et ce n'est pas une coquille.**
> Ces huit numéros sont **attribués deux fois**, avec des contenus **différents** : le
> design de la phase 3 annonce que « D30 à D35 appartiennent au design de la 2b » et
> reprend à D36, alors que la table du §3 de la 2b va jusqu'à **D42**, plus une
> « Correction du 2026-08-13 (**D43**) » au §7.1. Ainsi, **D36** désigne à la fois
> « l'alphabet du code d'inscription » (2b) et « l'exclusivité enseignant/modérateur par
> contrainte CHECK » (phase 3) ; **D42**, à la fois « la fiche `en_attente` d'une demande
> annulée est supprimée » (2b) et « le nouveau garde `exigerModerateurOuAdministrateur` »
> (phase 3) ; et ainsi de suite pour les huit.
>
> **Rien n'est renuméroté, et rien ne le sera** : ces numéros sont cités dans des
> `comment on` **déjà appliqués en base**, et renuméroter créerait une seconde vérité sans
> supprimer la première — le code se mettrait à mentir. **Règle à appliquer désormais :
> toute citation d'un de ces huit numéros écrit la phase**, sous la forme « D36 (2b) » ou
> « D36 (phase 3) ». Les numéros à venir restent globaux et continuent au-delà de D80.
```

- [ ] **Étape 3 : la ligne manquante de la matrice, au §5.2 (D55)**

Dans la matrice du §5.2, **juste après** la ligne
`| Convertir un participant externe en membre | ❌ | ❌ | ✅ |`, insérer :

```markdown
| Classer sans suite un participant externe | ❌ | ❌ | ✅ |
| Consulter la liste « à traiter » des participants externes | ❌ | ✅ | ✅ |
```

Puis, **à la suite des amendements existants sous la matrice** (après le bloc
« Amendement du 2026-08-12 (D23) »), ajouter :

```markdown
> **Amendement du 2026-08-14 (D55).** Les deux lignes « Classer sans suite un participant
> externe » et « Consulter la liste "à traiter" » sont **nouvelles** : la matrice était
> **silencieuse** sur ces deux gestes, qui n'existaient dans aucun document avant les
> décisions utilisateur qui les ont créés. Son silence est **constaté et comblé**, jamais
> réinterprété — même méthode que D50 pour le rattachement à une antenne.
>
> **Le classement est réservé à l'administrateur, comme la conversion.** Ce sont les
> **deux seules** façons de vider la liste ; en réserver une et ouvrir l'autre serait
> incohérent — un modérateur pourrait **vider la liste de travail de l'administrateur sans
> convertir personne**.
>
> **La consultation, elle, est ouverte au modérateur**, et cette ligne ne lui accorde rien
> de nouveau : la liste est **intégralement dérivée** de `desir_suivi_spirituel`, que la
> ligne « Voir les trois désirs exprimés lors d'un événement » lui ouvre déjà depuis D23.
> Elle est écrite parce qu'une capacité qui se déduit d'une autre finit par se perdre —
> c'est exactement ce qui est arrivé au §4.4 pendant deux phases.
```

- [ ] **Étape 4 : contrôle positif du balayage — planter un résidu et vérifier qu'on le retrouve**

**Une vérification par recherche exige un contrôle positif, et sur un balayage cela veut
dire planter un résidu et vérifier qu'on le retrouve — pas relire le fichier.** Vérifier
qu'aucune **autre** phrase de la spécification maîtresse ne réserve encore à
l'administrateur seul ce que D23 a ouvert au modérateur (piège n°12 : « quand une décision
élargit un rôle, chercher dans **tous** les documents chaque phrase qui nomme l'ancienne
restriction, pas seulement la matrice ») :

```bash
grep -rn "périmètre admin\|de l'admin\b\|L'admin crée\|réservée à l'administrateur" docs/superpowers/specs/2026-08-11-suivi-asonkeng-design.md
```

**Le motif de recherche doit d'abord être prouvé capable de trouver quelque chose.**
Insérer temporairement, en fin de fichier, la ligne :

```markdown
<!-- CONTROLE POSITIF TEMPORAIRE : périmètre admin -->
```

Relancer le `grep`. **Attendu : la ligne temporaire est trouvée.** Si elle ne l'est pas, le
motif est faux et **toute conclusion d'absence tirée de ce `grep` serait sans valeur**.
Retirer la ligne, relancer, et **examiner chaque occurrence restante une par une** : celles
qui décrivent la **conversion**, la **validation d'une demande**, l'**archivage** ou le
**catalogue** sont **justes** (ces gestes restent administrateur seul) ; celles qui
décrivent la **création d'un événement**, la **saisie ou la consultation des trois désirs**,
ou la **liste « à traiter »** seraient **fausses** et devraient être corrigées ici.

```bash
git diff docs/superpowers/specs/2026-08-11-suivi-asonkeng-design.md
```

Attendu : **exactement** les trois insertions de cette tâche (note de renvoi, deux lignes de
matrice, amendement D55) — **et la ligne de contrôle positif ABSENTE**.

- [ ] **Étape 5 : les six portes, puis commit**

Aucun code n'est touché, mais les portes tournent quand même : c'est la discipline du
projet, et un document malformé peut casser un lien relatif employé ailleurs.

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls && npm run test:e2e && npm run build
```

```bash
git add docs/superpowers/specs/2026-08-11-suivi-asonkeng-design.md
git commit -m "docs: renvoi vers D30-D80, desambiguisation D36-D43, ligne de matrice du classement (D55)"
```

---

# Ordre d'exécution et dépendances

Les tâches se suivent dans l'ordre numérique. Les dépendances **dures** :

```
T1 (primitive + numéro plancher)
 ├─> T6 (participants_externes : politique)
 └─> T7 (participations : politique)

T2 (peut_lire_membre) ──> T8 (vue seminaires_assistes)

T4 (types) ──> T5 (evenements) ──> T7 (participations)
                    └──> T6 (participants_externes) ──> T7
T7 ──> T8, T9

T10 (alter type, ISOLÉE) ──> T11 (conversion) ──> T13 (annulation amendée)
                         └──> T22 (validation + affichage de la nouvelle origine)
                              — DÉPENDANCE DURE, DANS LES DEUX SENS :
                              (1) sans T22, une demande de conversion s'affiche comme une
                                  demande de suivi (ternaire à deux issues) et propose deux
                                  actions qui échouent toujours — la validation d'une
                                  demande de suivi, refusée par la garde d'origine, et
                                  l'annulation, refusée par la passerelle amendée ;
                              (2) sans T22, RIEN ne fait passer à `actif` la fiche créée par
                                  le chemin 1 : elle reste invisible de tout compte
                                  ordinaire, son historique de séminaire n'apparaît nulle
                                  part, et la conversion est irréversible ET inachevable.
T12 (classement) : indépendante de T10 et T11

T14 (domaine) ──> T17, T21
T15 (données) ──> T16 à T21

T3 (verrou arbre) : INDÉPENDANTE de tout le reste — peut être faite en premier ou en
dernier, et peut être rejetée sans bloquer la phase.
T28 (documentation) : INDÉPENDANTE — aucune dépendance de code.
```

**Les tâches rejetables isolément**, dans lesquelles un relecteur peut légitimement dire
non sans bloquer la voisine : T3 (dette du socle), T9 (la seconde vue), T13 (l'amendement
de `annuler_demande_membre`), T20 (les étiquettes sur la fiche), T25 (la preuve de
pagination), T28 (la documentation).

**T22 n'en fait PAS partie, et c'est une correction de cette liste.** Elle a longtemps été
présentée comme un simple habillage d'affichage ; elle porte en réalité **le seul geste qui
achève le chemin 1** (la garde d'origine de `validerDemandeNouvellePersonne`) et la seule
chose qui empêche une demande de conversion de s'afficher comme une demande de suivi.
La rejeter livrerait une conversion irréversible et inachevable, et manquerait la promesse
« historique des convertis compris » (D70) sur le chemin nominal de D66.

*(T13 reste, elle, légitimement rejetable : la contrainte `on delete restrict` de T6 est la
seconde barrière et elle suffit à empêcher le sinistre — T13 n'ajoute que le message.)*

---

# Ce que la revue doit recenser — §8.3 du design, à refaire module par module

Cette phase écrit sur des tables **déjà livrées** et amende une fonction **et** une
politique existantes. **Toute revue doit recenser ces chemins, pas seulement relire les
tables neuves.**

| Table ou objet | Chemins d'écriture APRÈS cette phase |
|---|---|
| `membres` (insert) | `creerMembre` (admin), `sInscrire` (public, fiche `en_attente`), `creerDemandeSuivi`, **`convertir_participant_externe` chemins 1 et 2 (NOUVEAU, T11)** |
| `membres.faiseur_de_disciple_id` | `modifierMembre`, `definir_arbre`, `validerDemandeNouvellePersonne` (**désormais VIA `definir_arbre`, T3**), **`convertir_participant_externe` chemin 2 (NOUVEAU, T11)** — quatre chemins, dont **trois** prennent maintenant le verrou « arbre » ; `modifierMembre` reste le seul à ne pas le prendre, et **c'est un écart à réexaminer en revue** |
| `membres.etat` → `actif` depuis `en_attente` | `validerDemandeNouvellePersonne` — **et elle seule dans tout le projet**. Sa garde d'origine couvre `auto_inscription`, `demande_suivi`, et **`conversion_participant` (ÉLARGIE par T22, D66)**. `definir_arbre` n'écrit jamais `etat` ; `rejeterDemande` n'écrit que `demandes_membre.etat` ; `changerEtatMembre` n'est pas exportée et ne sert qu'à l'archivage/désarchivage. **Refermer cette garde reviendrait à rendre le chemin 1 de la conversion inachevable** |
| `demandes_membre` (insert) | `sInscrire`, `creerDemandeSuivi`, **`convertir_participant_externe` chemin 1 (NOUVEAU, T11)** |
| `public.annuler_demande_membre` | **Amendée par cette phase (T13)** |
| Politique `membres_lecture` | **Réécrite par cette phase (T2)** — sa suite RLS existante doit passer **inchangée** |
| `notifications` (insert) | `sInscrire`, `creerDemandeSuivi`, `validerDemandeNouvellePersonne`, `rejeterDemande`, **`convertirParticipant` chemin 1 (NOUVEAU, T21)** — **atteint tous les administrateurs actifs, compte racine compris** |

---

# Auto-contrôle avant de déclarer la phase terminée

- [ ] Les **six portes** vertes, **plus `npm run test:e2e:prod`**.
- [ ] `npx supabase migration list --linked` : les **douze** migrations de la phase
      apparaissent **appliquées des deux côtés**, **et** chacune de leurs objets a été
      constaté **en base** par sa tâche (le piège n°2 se referme précisément quand on se
      contente de la liste).
- [ ] `select relname, reloptions from pg_class where relname in ('seminaires_assistes',
      'participants_a_traiter')` : **`false`** pour la première, **`true`** pour la seconde.
- [ ] `select indexdef from pg_indexes where indexname like 'participations_%_unique'` :
      les deux contiennent `WHERE (… IS NOT NULL)` et **aucun** `NULLS NOT DISTINCT`.
- [ ] Depuis un **compte ordinaire réel** : la fiche d'un membre ayant participé à un
      évènement affiche bien son étiquette de séminaire.
- [ ] `git status` : **aucun** fichier de mutation temporaire, **aucun** script sous
      `scripts/.tmp-verif/`, **aucune** trace des étapes de preuve par mutation.
- [ ] Aucune donnée de test résiduelle : pour chacune des cinq familles (`ZZEvt-`,
      `ZZEvtConv-`, `ZZEvtPage-`, `ZZEvtE2E-`, `ZZEvtProd-`), un comptage **à zéro** sur
      `evenements.titre`, `participants_externes.nom`, `membres.nom` et
      `types_evenement.libelle`.
- [ ] Aucun compte de test résiduel : `select identifiant from public.profils where
      identifiant like 'test.%evt%'` rend **zéro ligne**.
- [ ] **Le compte racine n'est pas pollué** : `select count(*) from public.notifications n
      join public.profils p on p.id = n.profil_id where p.identifiant = 'racine' and
      n.lu_le is null` — comparer à la valeur relevée **avant** le début de la phase, et
      expliquer tout écart.











