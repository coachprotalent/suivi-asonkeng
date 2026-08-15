# Phase 5 — Création enrichie d'un membre, et arbre parcourable : plan d'implémentation

> **Pour les agents implémenteurs :** COMPÉTENCE OBLIGATOIRE — utiliser
> `superpowers:subagent-driven-development` (recommandé) ou `superpowers:executing-plans`
> pour exécuter ce plan tâche par tâche. Les étapes emploient la syntaxe à cases
> (`- [ ]`) pour le suivi.
>
> **Chaque tâche est écrite pour être lue SEULE.** Un implémenteur ne lit que sa tâche.
> Les pièges qui la concernent sont **répétés dans son corps**, jamais seulement en tête
> de ce document.

**But :** livrer (1) la **création enrichie d'un membre** — fiche, statuts, faiseur de
disciple et dirigeant en **une seule soumission** et **une seule transaction** — puis
(2) l'**arbre parcourable** `/arborescence`, en consultation seule, déplié à la demande,
avec recherche menant au chemin d'une personne ; plus (3) la correction du **formulaire
public d'inscription**, pire cas déployé du piège des champs effacés, et (4) les
**amendements documentaires** que cette phase rend inévitables.

**Architecture :** ce plan ajoute (1) **trois** migrations strictement additives — celle
qui porte la seule passerelle nouvelle de la phase, `public.creer_membre_enrichi`, qui
**compose** deux passerelles existantes au lieu de recopier leurs gardes, et **deux
migrations correctives** qui referment l'invariant d'arbre sur lequel le volet 2 s'appuie
(garde d'état élargie à `en_attente`, et verrou de ligne sur la lecture de l'état du
faiseur) ; (2) trois fonctions de domaine pures ; (3) une couche de lecture paginée à tri
**total** dans un module importable hors Next, pour que les preuves fassent tourner le code
de production ; (4) un écran neuf (`/arborescence`), un écran refondu
(`/membres/nouveau`) et trois écrans amendés ; (5) six suites de preuves, dont une contre
un build de **production**.

**Pile technique :** Next.js 16 (App Router, Server Actions), TypeScript, Supabase
(Postgres + Auth), Tailwind, Vitest, Playwright.

**Documents de référence :**
- `docs/superpowers/specs/2026-08-15-phase-5-creation-arbre-design.md` — le design de
  cette phase, ses décisions **D81 à D105**, ses pièges connus (§12) et ses preuves
  exigées (§11). Fait autorité ; aucune de ses décisions n'est rouverte ici.
- `docs/superpowers/specs/2026-08-12-phase-1c-design.md` — **D17 à D21** : arborescence,
  anti-cycle, portée d'autorité, échelle visée.
- `docs/superpowers/specs/2026-08-11-suivi-asonkeng-design.md` — §4.2, §5.1, §5.3, §6, §9.
- `docs/superpowers/plans/2026-08-13-phase-3-ael.md` et
  `2026-08-14-phase-4-evenements.md` — modèles de forme et de granularité.

---

## Les quatre arbitrages pris en amont de ce plan, et appliqués par lui

Ils ferment les quatre points laissés ouverts au §15 du design. **Ils ne se rediscutent
pas pendant l'exécution.**

1. **Le §9 de la spécification maîtresse est amendé** (Task 15) par une **entrée datée**
   ajoutant la **phase 5** (création enrichie et arborescence) **et** la **phase 6**
   (refonte UI/UX), sur le modèle des amendements existants.
2. **Le README est corrigé** (Task 15) : il portait deux définitions incompatibles de
   « phase 5 ». La refonte UI/UX devient la **phase 6** ; la référence est reprise.
3. **Le formulaire PUBLIC d'inscription est corrigé dans cette phase** (Task 5) —
   `src/app/inscription/formulaire-inscription.tsx`, **8 champs, écran public, aucun
   rattrapage, en production**. Le design ne le prévoyait pas (§14) ; cet arbitrage l'y
   ajoute. Le remède est éprouvé, la tâche est courte, et c'est le seul écran ouvert à
   des gens qui ne connaissent pas l'application.
4. **La collision D36–D43 est DÉJÀ arbitrée et appliquée. NE PAS LA ROUVRIR.** La règle
   est : **ne renuméroter aucune décision** (ces numéros sont cités dans des `comment on`
   **appliqués en base** ; renuméroter ferait mentir le code), et **citer la phase**
   quand un numéro est ambigu — « D42 (2b) » / « D42 (phase 3) ». La note de
   désambiguïsation **existe déjà** dans la spécification maîtresse, posée par la
   phase 4. **Le renvoi D30–D80 du §2 existe déjà lui aussi : ne pas le rajouter.** La
   Task 15 n'y ajoute **qu'une ligne** : `D81 à D105`.

---

## Politique des portes

**Avant chaque commit, seulement les rapides :**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls
```

**`npm run test:e2e` et `npm run build` UNE SEULE FOIS en fin de lot** (fin du volet 1,
puis fin du volet 2, puis fin de la phase) — pas après chaque tâche : ils coûtent
plusieurs minutes chacun et sur un dépôt à une seule base ils n'apportent rien de plus
tâche par tâche.

**`npm run test:e2e:prod` dès qu'un message affiché à l'utilisateur est touché** — donc
après les Tasks 4, 5 et 8 au minimum.

**Si une suite de fin de lot échoue, ÉTABLIR QUEL COMMIT L'A CASSÉE par un rejeu en
isolation** (`git stash` / `git checkout <commit>` puis rejeu de la seule suite en
cause), et le consigner. Ne jamais « corriger au jugé » une suite rouge dont on n'a pas
identifié le commit fautif : c'est ainsi qu'on empile deux défauts.

---

## Contraintes globales

Ces règles s'appliquent à **chaque** tâche. Elles sont reprises verbatim de la doctrine
du projet et des contraintes des plans précédents.

1. **Un seul projet Supabase sert au développement ET à la production.** Pousser vers
   `main` déploie immédiatement, sans intégration continue. Les migrations sont
   strictement **additives**. **Ne jamais exécuter `supabase db reset`.** Ne jamais
   modifier une migration déjà appliquée.
2. **`supabase db push` suit les migrations par VERSION, pas par contenu.** Un numéro
   déjà inscrit dans `supabase_migrations.schema_migrations` fait tenir un fichier neuf
   pour « déjà appliqué » : rien n'est joué, `--dry-run` ne l'annonce pas,
   `migration list` dit « appliqué des deux côtés », et **l'objet n'existe pas en base**.
   Ce piège s'est refermé **deux fois** dans ce projet. La **Task 1** et la **Task 1 bis**
   portent chacune une **étape zéro obligatoire** de relevé du plus haut numéro
   **réellement présent**, avec `ls` **et** `migration list --linked`, en retenant le
   **maximum des deux** — la base peut être en avance sur le dépôt. Au moment de la
   rédaction, le plus haut du dépôt est `20260818280000` ; **ce plan ne le suppose pas, il
   le fait vérifier, et il le fait vérifier DEUX FOIS** : la Task 1 pose une migration, la
   Task 1 bis en pose deux de plus, et son plancher n'est donc plus celui relevé par la
   Task 1.
3. **Aucune politique RLS d'écriture, sur aucune table.** Toute mutation passe par une
   Server Action **gardée en première instruction**, qui écrit via `clientAdmin()` ou par
   une passerelle `security definer` réservée à `service_role`. Cette phase ne crée,
   ne modifie et ne supprime **aucune** politique et **aucun** déclencheur.
4. **Le booléen d'autorité sert à L'AFFICHAGE et n'est JAMAIS une barrière.**
   `aAutoriteSur`, `estAdministrateur`, `estModerateurOuAdministrateur` décident d'afficher
   un lien ou un formulaire ; `exigerAdministrateur`, `exigerAutoriteSur`,
   `exigerProfilActif` protègent. Ne jamais confondre les deux familles.
5. **Un refus MÉTIER se RETOURNE, il ne se lève jamais.** Une exception levée depuis une
   Server Action est remplacée par un digest React en build de **production**.
   **Nuance établie, à connaître pour ne pas citer la mauvaise raison en revue :** cela ne
   vaut que **là où le composant ATTRAPE l'exception** pour afficher `error.message` —
   `comptes/ligne-compte.tsx` est le seul du dépôt dans ce cas. Ailleurs, l'exception
   remonte à `src/app/error.tsx`, qui affiche un texte **statique** et ne lit jamais
   `error.message`, en développement **comme** en production : le coût d'un `throw` y est
   alors la perte du **motif nommé**, pas un digest anglais. `npm run test:e2e:prod` est
   la porte qui éprouve cette classe.
6. **`redirect()` lève une exception de contrôle Next.js : JAMAIS dans un `try`.** La
   classification d'une erreur `rpc` se fait **avant** toute redirection, et la
   redirection est la **dernière** instruction.
7. **Ne jamais discriminer une erreur Postgres sur le texte français de son message.**
   Uniquement `error.code` ou le marqueur posé via `using detail = '...'`, lu dans
   `error.details`. **N'affirmer AUCUN code d'erreur sans l'avoir vérifié contre la
   base : HUIT hypothèses tenues pour acquises se sont révélées fausses dans ce projet.**
   Cette phase ajoute **deux** marqueurs nouveaux, et deux seulement :
   `statuts_exclusifs_incompatibles` (couple exclusif refusé à la création, D84) et
   `faiseur_de_disciple_inactif` (le faiseur visé existe mais n'est **ni actif ni
   archivé**). Tous les autres sont **réutilisés** avec leur sens existant (D82). Le
   second est nouveau **parce qu'il ne pouvait pas être `faiseur_de_disciple_archive`** :
   ce marqueur-là commande un message affiché qui dit « est archivé », et le rendre pour
   un faiseur `en_attente` afficherait à l'utilisateur une phrase que le code ne tient
   pas — le mode de défaillance dominant de ce projet.
8. **PostgREST tronque EN SILENCE au-delà de `max_rows = 1000`**
   (`supabase/config.toml:18`, vérifié). **Corrigé cinq fois dans ce projet.** Toute
   lecture de disciples ou de racines est **paginée avec un tri TOTAL** — `.order('id')`
   en **dernier** critère : `nom` puis `prenom` **n'est pas total**, et deux **homonymes
   exacts** à cheval sur une frontière de page peuvent être rendus **deux fois ou
   jamais** — ou **échoue bruyamment**. Motif éprouvé : `src/lib/donnees/membres-lots.ts`
   et `presences-lots.ts`. **Le repli `PGRST103` s'attrape SUR LA LECTURE ELLE-MÊME**,
   jamais par un pré-calcul de borne : un correctif pré-calculé s'est révélé **plus
   fragile** que le motif qu'il imitait, une suppression concurrente entre les deux
   appels ramenant le plantage (I1 de la ronde du 2026-08-14).
9. **React réinitialise les champs NON CONTRÔLÉS d'un `<form action>` à TOUTE
   complétion, y compris sur un refus RETOURNÉ.** Un formulaire de création enrichi porte
   **beaucoup** de champs : c'est le pire cas possible. **Champs contrôlés obligatoires**
   (`value` + `onChange`), avec un `useRef` **initialisé au premier rendu** pour fermer
   la course au montage **par construction** — il vaut nécessairement `false` au premier
   rendu, donc la passe de montage ne peut jamais satisfaire
   `enCoursPrecedent.current && !enCours`, quel que soit le timing.
10. **Une erreur non vérifiée qui échoue en silence est un mensonge.** Chaque lecture
    distingue « aucun résultat » d'« échec de lecture » : `throw`, jamais `[]`.
    Discipline constante de `src/lib/donnees/`.
11. **Les suites de tests écrivent en base de PRODUCTION.** Nettoyage dans un `afterAll`
    (le corps d'un test ne s'exécute pas si une assertion tombe avant), **vérifié par
    comptage**, dans le **bon ordre** : `faiseur_de_disciple_id` est en
    `on delete set null` — supprimer un faiseur avant ses disciples les **détacherait en
    silence** et en ferait des racines ; `membre_statuts` et `journal_statuts` partent en
    cascade avec la fiche. Ordre imposé : **disciples avant leurs faiseurs**, puis les
    comptes de test.
12. **Tout comptage ABSOLU y est faux pour toujours** — un test a été mis en échec par un
    token que l'administrateur réel avait créé le soir même. **Compter des DELTAS** :
    mesurer avant, mesurer après, asserter sur la **différence**.
13. **Tout ce que la phase crée doit être retrouvable APRÈS UNE INTERRUPTION :** préfixe
    de **famille stable** (`ZZCreationEnrichie-`, `ZZArborescence-`, tiret littéral),
    jamais un identifiant tiré par exécution comme seule prise. Un suffixe aléatoire
    **par exécution** s'ajoute au préfixe de famille pour les noms individuels.
14. **Un `insert` de préparation dont l'erreur est jetée rend le test vert en éprouvant
    un tout autre chemin.** Trouvé trois fois. Toute préparation vérifie son erreur et
    **lève**.
15. **Toute vérification par recherche exige un CONTRÔLE POSITIF — et un contrôle positif
    peut être INERTE.** Dans la phase 4, un test cherchait un mot que le message « aucun
    élément » contenait aussi : il était satisfait par l'état même qu'il devait exclure.
    **Pour chaque contrôle positif écrit par ce plan, se demander : serait-il encore
    satisfait par une base vide, ou par une page en erreur ?** Si oui, il ne prouve rien.
16. **Un test qui affirme qu'un rôle « ne peut pas » doit FORGER l'appel et porter un
    CANARI rejouant LA MÊME REQUÊTE depuis un rôle autorisé.** Un canari passant par
    l'interface **n'éprouve pas le canal de la forge** — défaut trouvé en phase 4. Motif
    validé : `tests/e2e/statuts.spec.ts` (`extraireChampsCaches`, `verifierCaptureAction`)
    et `tests/e2e/evenements.spec.ts`.
17. **Toute barrière exige une PREUVE PAR MUTATION** : casser la barrière, constater que
    le test tombe *et pour la bonne raison*, restaurer, comparer l'empreinte restaurée à
    l'originale (`pg_get_functiondef`). **Ne jamais laisser une mutation active au-delà
    d'une exécution : le projet n'a QU'UNE base.**
18. **Une preuve doit éprouver LE MÉCANISME QU'ELLE VISE.** Dans la phase 4, deux preuves
    d'un déclencheur testaient en réalité une **clé étrangère**. Avant d'écrire une
    assertion, se demander laquelle des barrières empilées la satisferait.
19. **Le compte `racine` n'est ni touché NI POLLUÉ.** Il n'a pas de fiche membre et
    n'apparaît dans aucun nœud de l'arbre — non par filtrage, mais parce que toutes ces
    lectures partent de `membres`.
20. **Ne stager que ses propres fichiers.** Jamais `git add -A`.
21. **Apostrophes :** apostrophe **droite** (`'`) partout, jamais typographique. En
    TypeScript, une chaîne contenant une apostrophe s'écrit entre **guillemets doubles**
    (`"L'arbre"`) — une apostrophe dans une chaîne délimitée par des apostrophes produit
    `TS1005`, et **ce piège s'est refermé quatre fois**. En JSX rendu, `&apos;`. En SQL,
    apostrophes **doublées** (`''`).
22. **Une trace serveur systématique sur tout échec** (`console.error` avec `code`,
    `details`, `message`), y compris pour les cas classifiés. **Le diagnostic de
    `creer_membre_enrichi` DOIT être journalisé côté application** : Postgres n'a pas de
    transaction autonome, donc **aucune trace écrite depuis l'intérieur de la fonction ne
    survivrait à son échec**.
23. **Les suites e2e sont sérialisées** (`workers: 1`), sur un unique serveur partagé.

---

## L'ORDRE EST IMPOSÉ PAR D96 — le volet 1 AVANT le volet 2

**Les Tasks 1 à 8 (création enrichie) précèdent obligatoirement les Tasks 9 à 14
(arborescence).** Ce n'est pas de l'ordonnancement de confort.

**La Task 1 bis est placée dans le volet 1 et doit être livrée avec lui.** Elle ne crée
pourtant aucun écran de création : elle referme l'invariant d'arbre sur lequel **tout le
volet 2** s'appuie. Elle vient là parce qu'elle touche du **SQL déployé** et que ses
migrations doivent être appliquées, éprouvées et stabilisées **loin** de la livraison de
l'écran qu'elles protègent — et parce que la passerelle de la Task 1 appelle
`public.definir_arbre`, qu'elle corrige.

`creerMembre` **n'a jamais écrit de `faiseur_de_disciple_id`.** Toute fiche créée depuis
la phase 1a est donc une **racine de l'arbre** tant que personne n'ouvre l'écran de
rattachement. Un écran qui « commence par les racines » livré en premier commencerait par
une liste **du même ordre de grandeur que l'annuaire** : il serait jugé cassé alors qu'il
dirait la vérité. Livré en second, il **mesure** un problème déjà en voie de réduction —
et le nombre de racines qu'il affiche (D95) devient **la mesure** qui dira si le volet 1
agit.

La Task 5 (formulaire public) et la Task 15 (documents) sont indépendantes des deux
volets ; elles sont placées là où elles gênent le moins.

---

## Structure des fichiers

| Fichier | Tâche | Nature |
|---|---|---|
| `supabase/migrations/<N>_creer_membre_enrichi.sql` | 1 | créé |
| `supabase/migrations/<N+1>_definir_arbre_faiseur_actif_verrouille.sql` | 1 bis | créé |
| `supabase/migrations/<N+2>_gardes_etat_arbre_elargies.sql` | 1 bis | créé |
| `src/lib/domaine/statut.ts` | 2 | modifié (ajouts) |
| `src/lib/domaine/statut.test.ts` | 2 | modifié (ajouts) |
| `src/app/membres/messages.ts` | 3 | modifié (ajouts) |
| `src/app/membres/actions.ts` | 3 | modifié (`creerMembre` → `creerMembreEnrichi`) |
| `src/lib/securite/garde.ts` | 3 | modifié (**un mot dans un commentaire**) |
| `src/app/membres/formulaire-membre.tsx` | 4 | modifié (entièrement contrôlé, `children`) |
| `src/app/membres/nouveau/bloc-enrichissement.tsx` | 4 | créé |
| `src/app/membres/nouveau/page.tsx` | 4 | modifié |
| `tests/e2e/annuaire.spec.ts` | 4 | modifié (redirection changée) |
| `src/app/inscription/formulaire-inscription.tsx` | 5 | modifié (contrôlé) |
| `tests/e2e/inscription.spec.ts` | 5 | modifié (forge d'antenne : événement `change`) |
| `tests/rls/creation-enrichie.test.ts` | 6 | créé |
| `tests/e2e/creation-enrichie.spec.ts` | 7 | créé |
| `tests/e2e-prod/creation-enrichie-production.spec.ts` | 8 | créé |
| `src/lib/domaine/membre.ts` | 9 | modifié (`libelleFiche`) |
| `src/lib/domaine/membre.test.ts` | 9 | modifié (ajouts) |
| `src/app/membres/[id]/page.tsx` | 9, 12 | modifié |
| `src/lib/donnees/arbre-lots.ts` | 10 | créé |
| `src/lib/donnees/arbre.ts` | 10 | modifié (ajouts) |
| `src/app/arborescence/messages.ts` | 11 | créé |
| `src/app/arborescence/actions.ts` | 11 | créé |
| `src/app/arborescence/page.tsx` | 12 | créé |
| `src/app/arborescence/arborescence.tsx` | 12 | créé |
| `src/app/tableau-de-bord/page.tsx` | 12 | modifié (lien) |
| `tests/rls/arborescence.test.ts` | 13 | créé |
| `tests/e2e/arborescence.spec.ts` | 14 | créé |
| `tests/e2e/arbre.spec.ts` | 14 | modifié (contrôle positif, preuve 11) |
| `docs/superpowers/specs/2026-08-11-suivi-asonkeng-design.md` | 15 | modifié |
| `README.md` | 15 | modifié |

**Inchangés, et c'est D89 :** `/membres/[id]/modifier`, `/membres/[id]/statuts`,
`/membres/[id]/arbre`. Le seul effet de cette phase sur eux est que
`formulaire-membre.tsx`, partagé avec `/membres/[id]/modifier`, devient **entièrement
contrôlé** — un remède, pas un enrichissement : **aucun statut, aucun arbre ne remonte
dans l'écran de modification.**

---

## Carte des décisions D81 à D105

| # | Réalisée par |
|---|---|
| D81 passerelle unique atomique | Task 1 ; preuve Task 6 (mutation) |
| D82 elle COMPOSE, ne duplique pas | Task 1 ; preuve Task 6 (comportement + fil-piège) |
| D83 aucun verrou consultatif propre | Task 1 (`comment on function`) ; verrou de LIGNE sur l'état du faiseur, Task 1 bis ; preuve Task 1 bis (course reproduite) |
| D84 couple exclusif refusé deux fois | Task 2 (amont) + Task 1 (passerelle) ; preuve Task 6 |
| D85 tous les champs contrôlés | Tasks 4 et 5 ; preuve Task 8 |
| D86 enrichissements facultatifs et indépendants | Task 3 ; preuve Task 6 (n°4) |
| D87 `creerMembre` remplacée, pas doublée | Task 3 |
| D88 dirigeant proposé à la création | Task 4 |
| D89 écrans existants inchangés | Tasks 4 et 12 (balayage) |
| D90 garde `exigerAdministrateur` | Tasks 1 (commentaire) et 3 ; preuve Task 7 |
| D91 `/arborescence`, route neuve | Task 12 |
| D92 consultation seule, aucun chemin d'écriture | Tasks 11-12 ; preuve Task 13 (balayage) |
| D93 filtre `etat = 'actif'` explicite | Task 10 (disciples, racines **et noms du chemin**) ; preuves Task 13 |
| D94 `disciplesPage`, `disciplesDe` intacte | Task 10 ; preuves Tasks 13 et 14 |
| D95 `racinesPage`, total affiché, intitulé | Tasks 10 et 12 ; preuve Task 13 |
| D96 volet 1 avant volet 2 | ordre des tâches (encadré ci-dessus) |
| D97 recherche → chemin déplié + disciples | Tasks 11 et 12 |
| D98 forme affranchie, noms sous RLS | Task 11 ; preuve Task 9 |
| D99 invariant des trois déclencheurs, **élargi et verrouillé** | Task 1 bis (migrations et course reproduite) ; Task 11 (commentaire) ; Task 13 (mesure) ; Task 15 (README) |
| D100 `libelleFiche` extraite et partagée | Task 9 ; preuve Task 9 |
| D101 aucun indicateur pré-calculé | Task 12 |
| D102 aucun index nouveau, candidat nommé | Task 10 (commentaire) |
| D103 dépliage derrière `exigerProfilActif` | Task 11 ; preuve Task 14 |
| D104 indentation plafonnée, fil d'Ariane | Task 12 |
| D105 ensemble des dépliés, pas de re-dépliage | Task 12 |

---

# VOLET 1 — LA CRÉATION ENRICHIE

---

### Task 1 : étape zéro des migrations, puis `public.creer_membre_enrichi` (D81, D82, D83, D84, D90)

**Fichiers :**
- Créer : `supabase/migrations/<NUMERO>_creer_membre_enrichi.sql`

**Interfaces :**
- Consomme : `public.definir_arbre(uuid, uuid, uuid, boolean)` et
  `public.attribuer_statut(uuid, uuid, date, text, uuid)` — **existantes, appelées, jamais
  recopiées**.
- Produit : `public.creer_membre_enrichi(text, text, text, text, text, text, uuid,
  public.situation_membre, text, integer, uuid, uuid, boolean, jsonb, uuid) returns uuid`,
  `security definer`, `set search_path = ''`, `execute` **retiré** de `public`, `anon`,
  `authenticated` et **accordé au seul `service_role`**. Consommée par la Task 3.
- Produit aussi : le **marqueur `statuts_exclusifs_incompatibles`**, **seul marqueur
  nouveau de toute la phase**. Consommé par la Task 3.
- Produit aussi : **le numéro de migration plancher**, relevé à l'étape 0 et consigné dans
  le rapport de tâche. C'est la seule migration de la phase ; aucune autre tâche n'en
  porte.

**Pourquoi une passerelle unique, et pourquoi elle COMPOSE.** Créer un membre, lui
attribuer des statuts et le placer dans l'arbre, ce sont **trois écritures** qui passent
aujourd'hui par **trois chemins distincts**. Les trois sont **du SQL, sur la même base** :
une transaction les couvre. La compensation retenue par D27 pour l'inscription répondait à
une transaction **impossible** (un appel HTTP à Supabase Auth d'un côté, une écriture SQL
de l'autre) — la prémisse est absente ici, et retenir la compensation reviendrait à choisir
la garantie faible alors que la forte est disponible. Elle coûterait de surcroît le
**premier `delete` du projet sur une fiche `actif`**, dont la cascade emporte
`journal_statuts` — que 20260813170000 désigne comme la seule voie d'effacement complet
d'une personne.

L'objection contre la passerelle unique — « elle duplique ou contourne les gardes des trois
existantes » — tombe sur un fait vérifié dans le code : **ces gardes ne sont pas dans
l'application, elles sont dans le SQL.** `prive.attribuer_statut` prend le `for update`,
évince le statut exclusif, journalise ; `public.definir_arbre` prend le verrou consultatif
et refuse un membre, un faiseur ou un dirigeant inconnu, et un faiseur **archivé** ; les
déclencheurs `membres_anti_cycle` et `membres_faiseur_de_disciple_archive` s'appliquent à
**toute** écriture de la table. Une fonction SQL peut donc les **appeler**. **Composer
coûte deux `perform` ; recopier coûterait deux copies destinées à diverger** (D82).

- [ ] **Étape 0 — OBLIGATOIRE, À EXÉCUTER, PAS À SURVOLER : relever le plus haut numéro de migration RÉELLEMENT présent**

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
base peuvent diverger, et **la base peut être en avance sur le dépôt**. Retenir le
**maximum des deux**. Au moment de la rédaction de ce plan, le plus haut du dépôt est
`20260818280000` ; **ce plan ne le suppose pas** : c'est la sortie réelle des deux
commandes qui fait foi, et elle est **consignée verbatim dans le rapport de tâche**.

Choisir alors le premier numéro **strictement supérieur** au maximum relevé — par défaut
`20260819100000` si le relevé confirme `20260818280000`.

- [ ] **Étape 1 : écrire la migration**

Créer `supabase/migrations/<NUMERO>_creer_membre_enrichi.sql` :

```sql
-- Phase 5, D81 / D82 / D83 / D84 / D90 — SEULE migration de la phase.
--
-- Crée une fiche membre, la place dans l'arbre et lui attribue ses statuts dans UNE
-- SEULE transaction. L'atomicité est tenue PAR CONSTRUCTION : après un échec à
-- n'importe quel point du corps, RIEN n'a persisté — ni la fiche, ni ses colonnes
-- d'arbre, ni ses membre_statuts, ni ses lignes de journal_statuts.
--
-- POURQUOI PAS DE COMPENSATION (D81). D27 a retenu la compensation pour l'inscription
-- parce qu'AUCUNE transaction ne couvrait ses deux écritures (un appel HTTP au service
-- d'authentification, une écriture SQL). Ici les trois écritures sont TOUTES du SQL sur
-- la MÊME base. Compenser exigerait de surcroît de SUPPRIMER une fiche `actif`, dont la
-- cascade emporte journal_statuts — que 20260813170000 désigne comme la seule voie
-- d'effacement complet d'une personne.
--
-- CETTE FONCTION COMPOSE, ELLE NE RECOPIE PAS (D82). Elle appelle public.definir_arbre
-- et public.attribuer_statut — les passerelles PUBLIQUES, celles-là mêmes qu'emploient
-- les écrans /membres/[id]/arbre et /membres/[id]/statuts, et non leurs versions
-- `prive` : les deux chemins ne peuvent pas diverger, et une correction future de l'un
-- corrige l'autre. Conséquence directe et VOULUE : cette fonction-ci n'introduit aucun
-- marqueur d'erreur nouveau pour l'arbre ni pour les statuts — membre_inconnu,
-- statut_inconnu, faiseur_inconnu, dirigeant_inconnu, faiseur_de_disciple_archive,
-- cycle_faiseur_de_disciple et le code 23514 gardent leur sens, et l'application les
-- discrimine avec le code qu'elle a déjà. Le SEUL marqueur nouveau posé par cette
-- fonction est statuts_exclusifs_incompatibles, ci-dessous.
--
-- UN SECOND MARQUEUR EXISTE DANS CETTE PHASE, ET IL NE VIENT PAS D'ICI :
-- faiseur_de_disciple_inactif, posé par public.definir_arbre et par le déclencheur
-- membres_faiseur_de_disciple_archive lorsque le faiseur visé existe mais n'est NI
-- actif NI archivé (donc en_attente). Il remonte à travers cette fonction comme tous
-- les autres marqueurs des passerelles appelées, sans qu'elle ait à le connaître.
--
-- AUCUN VERROU CONSULTATIF PROPRE (D83). Celui de l'arbre — pg_advisory_xact_lock(
-- 20260814, 1) — est pris par l'appel imbriqué à definir_arbre, en PREMIÈRE instruction
-- de celle-ci, et cela SUFFIT : entre l'insertion de la fiche et l'écriture de l'arbre
-- il n'y a AUCUNE fenêtre, c'est la même transaction, et une ligne qui n'existe pas
-- encore n'a aucun descendant — l'insertion seule ne peut donc fermer aucun cycle. Un
-- second pg_advisory_xact_lock sur la même clé serait ré-entrant, donc inoffensif, et
-- TROMPEUR : il laisserait croire que celui de definir_arbre ne suffit pas.
--
-- LE GARDE APPLICATIF EST exigerAdministrateur, ET C'EST UNE COÏNCIDENCE, PAS UNE
-- CONSTRUCTION (D90). attribuer_statut est normalement atteinte derrière
-- exigerAutoriteSur ; à travers cette fonction, elle l'est derrière
-- exigerAdministrateur. Les deux coïncident AUJOURD'HUI parce que la création d'une
-- fiche est réservée à l'administrateur (§5.2) et qu'un administrateur a autorité
-- partout (peutModifier court-circuite sur estAdmin). TOUT FUTUR APPELANT NON
-- ADMINISTRATEUR DE CETTE PASSERELLE EST UNE RÉGRESSION, PAS UNE RÉUTILISATION : il
-- élargirait en silence qui peut écrire un statut.
--
-- AUCUNE TRACE ÉCRITE DEPUIS L'INTÉRIEUR DE CETTE FONCTION NE SURVIVRAIT À SON ÉCHEC.
-- Postgres n'a pas de transaction autonome, et le projet l'a déjà payé (D43, 2b) :
-- consommer_token_inscription insérait une tentative puis levait, l'exception annulait
-- toute la transaction, l'insertion comprise, et le plafond anti-force-brute était
-- ENTIÈREMENT INOPÉRANT. Le diagnostic se journalise donc CÔTÉ APPLICATION, depuis
-- l'objet d'erreur retourné (code, details, message) — jamais par une insertion SQL de
-- journalisation ici, qui serait annulée avec le reste.
--
-- AUCUN INDEX NOUVEAU (D102). L'index qui serait la réponse si une mesure le demandait
-- un jour est nommé ici pour n'avoir pas à être redécouvert :
--   create index membres_arbre_idx on public.membres (faiseur_de_disciple_id, nom, prenom, id)
--     where etat = 'actif';
-- membres_faiseur_de_disciple_id_idx (20260812120000) existe déjà et sert le filtre, y
-- compris `is null` — un B-tree indexe les NULL. On pose l'index quand une mesure le
-- demandera, pas sur une intuition.

create or replace function public.creer_membre_enrichi(
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
declare
  v_membre uuid;
  v_groupe_fautif text;
  v_ligne record;
begin
  -- 1. REFUS DU COUPLE EXCLUSIF, AVANT TOUTE ÉCRITURE (D84).
  --
  -- Les groupes sont RELUS EN BASE depuis p_statuts, jamais pris d'une liste venue de
  -- l'écran : listerCatalogue est non bornée, et une lecture tronquée côté application
  -- se traduirait par « aucun conflit détecté ». La fonction pure amont EXPLIQUE (elle
  -- nomme les deux statuts), cette barrière PROTÈGE.
  --
  -- POURQUOI NE PAS LAISSER FAIRE L'ÉVICTION de prive.attribuer_statut : elle est conçue
  -- pour une attribution ULTÉRIEURE qui remplace une attribution ANTÉRIEURE — elle
  -- supprime, journalise un `retrait` motivé, et c'est juste. À la création, les deux
  -- statuts arrivent dans le MÊME geste : l'éviction ferait disparaître le premier en
  -- silence et inscrirait au journal le retrait d'un statut que la personne n'a jamais
  -- porté plus d'une transaction. Le journal MENTIRAIT sur ce qui s'est passé —
  -- exactement ce que le `if v_nouveau` d'attribuer_statut protège par ailleurs.
  --
  -- `count(distinct st.id) > 1` et non `count(*) > 1` : soumettre DEUX FOIS le même
  -- statut n'est pas un couple exclusif. Ce cas passe donc ici, et la boucle plus bas
  -- appelle attribuer_statut deux fois — le second appel est un upsert sans effet qui
  -- ne journalise aucun `ajout` (détection xmax = 0). Comportement voulu.
  --
  -- Aucun filtre sur st.actif : un statut désactivé sera de toute façon refusé par
  -- attribuer_statut avec detail = 'statut_inconnu'. Le refus d'exclusivité doit mordre
  -- quel que soit l'état du statut, pas seulement sur les actifs.
  select g.nom into v_groupe_fautif
  from jsonb_to_recordset(coalesce(p_statuts, '[]'::jsonb))
         as s(statut_id uuid, date_acquisition date, note text)
  join public.statuts st on st.id = s.statut_id
  join public.groupes_statut g on g.id = st.groupe_id
  where g.exclusif
  group by g.id, g.nom
  having count(distinct st.id) > 1
  limit 1;

  if found then
    raise exception 'Deux statuts du groupe « % » ont été soumis ensemble, or ce groupe est exclusif.', v_groupe_fautif
      using detail = 'statuts_exclusifs_incompatibles';
  end if;

  -- 2. LA FICHE.
  --
  -- `etat` n'est PAS fourni : le défaut de la colonne ('actif') s'applique, exactement
  -- comme le faisait creerMembre. `cree_par = p_par`.
  --
  -- NOTE VÉRIFIÉE : les deux déclencheurs `before insert or update of
  -- faiseur_de_disciple_id` (membres_anti_cycle, membres_faiseur_de_disciple_archive) se
  -- déclenchent AUSSI sur l'insertion — la clause `of colonne` ne restreint que les
  -- `update`. Ils sortent immédiatement, new.faiseur_de_disciple_id étant null à ce
  -- stade.
  insert into public.membres (
    nom, prenom, telephone, email_contact, ville, pays, antenne_id,
    situation, domaine_etude, report_initial_ael, cree_par
  )
  values (
    p_nom, p_prenom, p_telephone, p_email_contact, p_ville, p_pays, p_antenne_id,
    p_situation, p_domaine_etude, coalesce(p_report_initial_ael, 0), p_par
  )
  returning id into v_membre;

  -- 3. L'ARBRE — SEULEMENT si l'un des trois est renseigné.
  --
  -- Appelée sans condition, definir_arbre prendrait le verrou et réécrirait trois null
  -- déjà en place. C'est elle qui prend le verrou consultatif (D83), et c'est elle qui
  -- refuse un faiseur inconnu, archivé, ou fermant un cycle.
  --
  -- `p_dirigeant_force` vrai SEUL est un cas légitime : un administrateur qui force
  -- « aucun dirigeant » sur une fiche sans faiseur de disciple exprime un choix, et ce
  -- choix doit être enregistré.
  if p_faiseur_de_disciple is not null
     or p_dirigeant is not null
     or coalesce(p_dirigeant_force, false) then
    perform public.definir_arbre(
      v_membre, p_faiseur_de_disciple, p_dirigeant, coalesce(p_dirigeant_force, false)
    );
  end if;

  -- 4. LES STATUTS.
  --
  -- jsonb_to_recordset(...) as (...) est une DÉCLARATION DE TYPES : elle échoue
  -- franchement sur une valeur mal formée plutôt que de retomber sur NULL. C'est la
  -- raison pour laquelle les colonnes de la fiche restent en paramètres explicites et
  -- typés : une clé mal orthographiée dans un jsonb deviendrait une colonne NULL EN
  -- SILENCE. Une liste de longueur variable, elle, ne peut pas être un paramètre fixe.
  for v_ligne in
    select s.statut_id, s.date_acquisition, s.note
    from jsonb_to_recordset(coalesce(p_statuts, '[]'::jsonb))
           as s(statut_id uuid, date_acquisition date, note text)
  loop
    if v_ligne.statut_id is null then
      -- Une entrée sans statut_id (clé absente ou mal orthographiée) ne doit pas être
      -- ignorée en silence : c'est exactement le mode de défaillance que le typage
      -- ci-dessus existe pour fermer. Même marqueur que attribuer_statut, même sens.
      raise exception 'Statut inconnu ou désactivé.'
        using detail = 'statut_inconnu';
    end if;
    perform public.attribuer_statut(
      v_membre, v_ligne.statut_id, v_ligne.date_acquisition, v_ligne.note, p_par
    );
  end loop;

  return v_membre;
end;
$$;

comment on function public.creer_membre_enrichi(text, text, text, text, text, text, uuid, public.situation_membre, text, integer, uuid, uuid, boolean, jsonb, uuid) is
  'Phase 5, D81. Crée une fiche membre, la place dans l''arbre et lui attribue ses statuts dans UNE SEULE transaction : après un échec à n''importe quel point, rien n''a persisté. D82 : elle COMPOSE public.definir_arbre et public.attribuer_statut — les passerelles PUBLIQUES, pas leurs versions prive — et ne duplique ni ne contourne aucune de leurs vérifications ; elle n''introduit donc aucun marqueur d''erreur nouveau sauf statuts_exclusifs_incompatibles. D83 : elle ne prend AUCUN verrou consultatif propre, celui de l''arbre étant pris par l''appel imbriqué à definir_arbre, ce qui suffit — la même transaction ne laisse aucune fenêtre, et une ligne qui vient d''être insérée n''a aucun descendant. D84 : deux statuts d''un même groupe exclusif soumis ensemble sont REFUSÉS ici, jamais laissés à l''éviction de prive.attribuer_statut, qui journaliserait le retrait d''un statut jamais porté. D90, ET C''EST UNE COÏNCIDENCE, PAS UNE CONSTRUCTION : le garde applicatif de son unique appelant est exigerAdministrateur, alors que attribuer_statut est normalement atteinte derrière exigerAutoriteSur ; les deux coïncident parce que la création d''une fiche est réservée à l''administrateur et qu''un administrateur a autorité partout. TOUT FUTUR APPELANT NON ADMINISTRATEUR DE CETTE FONCTION EST UNE RÉGRESSION, PAS UNE RÉUTILISATION. Exécution réservée à service_role. Postgres n''ayant pas de transaction autonome, aucune trace écrite depuis l''intérieur de cette fonction ne survivrait à son échec : le diagnostic est journalisé par l''application, depuis l''objet d''erreur retourné.';

revoke execute on function public.creer_membre_enrichi(text, text, text, text, text, text, uuid, public.situation_membre, text, integer, uuid, uuid, boolean, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.creer_membre_enrichi(text, text, text, text, text, text, uuid, public.situation_membre, text, integer, uuid, uuid, boolean, jsonb, uuid) to service_role;
```

- [ ] **Étape 2 : appliquer**

```bash
npx supabase db push --linked
```

- [ ] **Étape 3 : VÉRIFIER QUE L'OBJET EXISTE VRAIMENT, ET QUE L'APPEL PASSE — surtout le paramètre ENUM**

C'est le contrôle qui manquait les deux fois où le piège n°2 s'est refermé : **interroger
la base, pas la liste des migrations.** Et c'est aussi le moment de vérifier l'hypothèse
la plus fragile de cette migration — **le paramètre `p_situation` est de type
`public.situation_membre`, un ENUM** : rien ne garantit *a priori* que PostgREST sache le
recevoir depuis un appel `rpc`, ni quel code il rend sur une valeur inconnue. **Ne rien
affirmer ici : mesurer.**

Créer `scripts/.tmp-verif/verifier-passerelle.mjs` :

```javascript
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const PREFIXE = 'ZZVerifPasserelle-'

function arguments_(situation) {
  return {
    p_nom: `${PREFIXE}${crypto.randomUUID().slice(0, 8)}`,
    p_prenom: 'Verif',
    p_telephone: null,
    p_email_contact: null,
    p_ville: null,
    p_pays: null,
    p_antenne_id: null,
    p_situation: situation,
    p_domaine_etude: null,
    p_report_initial_ael: 0,
    p_faiseur_de_disciple: null,
    p_dirigeant: null,
    p_dirigeant_force: false,
    p_statuts: [],
    p_par: null,
  }
}

// 1. service_role réussit, situation NULL.
const a = await admin.rpc('creer_membre_enrichi', arguments_(null))
console.log('1. service_role, situation null →', a.error ? `ERREUR ${a.error.code} ${a.error.message}` : `OK ${a.data}`)

// 2. service_role réussit, situation ENUM valide.
const b = await admin.rpc('creer_membre_enrichi', arguments_('etudiant'))
console.log('2. service_role, situation etudiant →', b.error ? `ERREUR ${b.error.code} ${b.error.message}` : `OK ${b.data}`)

// 3. ENUM INVALIDE : quel code ? On MESURE, on ne suppose pas.
const c = await admin.rpc('creer_membre_enrichi', arguments_('pas-une-situation'))
console.log('3. service_role, situation invalide → code =', c.error?.code, '| message =', c.error?.message)

// 4. anon (sans session) : l'exécution doit être REFUSÉE.
const d = await anon.rpc('creer_membre_enrichi', arguments_(null))
console.log('4. anon →', d.error ? `REFUS ${d.error.code} ${d.error.message}` : `!!! ACCEPTÉ !!! ${d.data}`)

// Nettoyage : les fiches créées par 1 et 2 sont réelles.
const { error: erreurMenage } = await admin.from('membres').delete().like('nom', `${PREFIXE}%`)
console.log('nettoyage :', erreurMenage ? `ÉCHEC ${erreurMenage.message}` : 'ok')
const { count } = await admin
  .from('membres')
  .select('id', { count: 'exact', head: true })
  .like('nom', `${PREFIXE}%`)
console.log('résidu après nettoyage (attendu 0) :', count)
```

```bash
npx dotenv -e .env.local -- node scripts/.tmp-verif/verifier-passerelle.mjs
```

**Attendu :** 1 et 2 rendent un uuid ; 4 est refusé. **Le code de 3 est CONSIGNÉ TEL
QU'OBSERVÉ dans le rapport de tâche, jamais celui qu'on attendait** — la Task 3 s'en
servira, ou décidera de ne pas s'en servir. Si 4 était **accepté**, la migration est
fautive : reprendre les `revoke`/`grant` et rejouer.

```bash
rm -rf scripts/.tmp-verif
```

- [ ] **Étape 4 : les portes rapides, puis commit**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls
```

```bash
git add supabase/migrations/<NUMERO>_creer_membre_enrichi.sql
git commit -m "feat: ajouter la passerelle atomique public.creer_membre_enrichi (D81, D82, D83, D84, D90)"
```

**Preuves produites par cette tâche :** la sortie **réelle** des deux commandes de
l'étape 0 et le numéro plancher retenu ; la sortie **verbatim** des quatre contrôles de
l'étape 3, **dont le code d'erreur réellement rendu sur une valeur d'énumération
invalide** ; le comptage de résidu à zéro après nettoyage.

**Livrable indépendamment éprouvable :** la fonction existe en base, `service_role` la
réussit, `anon` s'y voit refuser l'exécution, et la fiche créée par le contrôle a bien été
nettoyée.

---

### Task 1 bis : l'invariant d'arbre, ÉLARGI à `en_attente` et VERROUILLÉ contre les courses (D99, D83)

**Fichiers :**
- Créer : `supabase/migrations/<NUMERO+1>_definir_arbre_faiseur_actif_verrouille.sql`
- Créer : `supabase/migrations/<NUMERO+2>_gardes_etat_arbre_elargies.sql`

**Interfaces :**
- Consomme : rien de cette phase. Réécrit par `create or replace` quatre corps
  **déjà déployés** : `public.definir_arbre`, `prive.refuser_archivage_faiseur_de_disciple`,
  `prive.refuser_desarchivage_faiseur_archive`, `prive.refuser_faiseur_de_disciple_archive`.
  **Aucun déclencheur n'est créé, supprimé ni redéfini** : les quatre `create trigger`
  existants continuent de pointer sur les mêmes fonctions, dont seul le **corps** change.
- Produit : le marqueur **`faiseur_de_disciple_inactif`** — second et dernier marqueur
  nouveau de la phase. Consommé par la Task 3.
- Produit aussi : **deux numéros de migration**, relevés à l'étape 0 et consignés dans le
  rapport de tâche.

## ⚠️ CETTE TÂCHE MODIFIE DU CODE DÉPLOYÉ QUI SERT LA PRODUCTION. LIRE ENTIÈREMENT AVANT D'ÉCRIRE.

**Ce qu'elle referme, et pourquoi ça ne peut pas attendre.** Tout le volet 2 de cette phase
s'appuie sur un invariant :

> **Aucun membre `actif` n'a d'ancêtre qui ne soit pas `actif`.**

C'est lui qui rend l'arbre **sans trou** : sans lui, un maillon intermédiaire disparaît de
l'affichage et **toute sa descendance active devient inatteignable depuis la liste des
racines** — ces fiches ont un `faiseur_de_disciple_id` non nul, donc ne sont pas racines,
et leur parent n'est jamais rendu. Elles disparaissent, et **rien ne le signale**.

**Deux trous, tous deux vérifiés dans les migrations, pas dans leur description.**

**(1) Les trois gardes ne connaissent que `archive`, alors que `public.etat_membre` a TROIS
valeurs** (`en_attente`, `actif`, `archive`, migration 20260812120000) :

| Fonction de déclencheur | Migration | Ce qu'elle teste réellement aujourd'hui |
|---|---|---|
| `prive.refuser_archivage_faiseur_de_disciple` | 20260814120000 | `if new.etat <> 'archive' or old.etat = 'archive' then return new` — ne surveille QUE la transition vers `archive` |
| `prive.refuser_desarchivage_faiseur_archive` | 20260814140000 | `if v_etat_faiseur = 'archive'` — compare à `'archive'` SEUL |
| `prive.refuser_faiseur_de_disciple_archive` | 20260814150000 | `if v_etat_faiseur = 'archive'` — idem |

Conséquences, aujourd'hui, sans rien forger d'exotique : **rien n'interdit de rattacher un
membre `actif` à un faiseur `en_attente`**, ni **de faire passer à `en_attente` un membre
qui a des disciples actifs**. Et l'arborescence exclut `en_attente` **exactement** comme
`archive` (`.eq('etat','actif')`) : un maillon `en_attente` produit donc le même trou qu'un
maillon `archive`. Le précédent de vocabulaire existe déjà en base :
`convertir_participant_externe` (20260818220000) refuse une fiche cible avec
`if v_etat_cible is distinct from 'actif'` et le marqueur `membre_cible_non_actif`. On
reprend cette forme.

**(2) La lecture de l'état du faiseur n'est protégée par AUCUN verrou de ligne.**
`public.definir_arbre` lit `select m.etat into v_etat_faiseur from public.membres m where
m.id = p_faiseur_de_disciple;` **sans `for share` ni `for update`**, et `archiverMembre`
(`src/app/membres/actions.ts`) écrit `etat = 'archive'` par un `update` PostgREST qui ne
prend **aucun** verrou consultatif. En `read committed`, deux transactions ne se voient
donc pas :

1. **T_A** : `definir_arbre(X, F, …)` prend le verrou consultatif, lit `F.etat = 'actif'`
   (état **validé** ; l'archivage concurrent n'est pas encore commis), écrit
   `X.faiseur_de_disciple_id = F`. Le déclencheur relit `F.etat` sans verrou : `'actif'`.
   **Passe.**
2. **T_B** : `archiverMembre(F)` — le déclencheur compte les disciples **actifs** de `F` ;
   `X` n'est pas validé, donc invisible : 0. **Passe.**
3. **Les deux valident.** Résultat : **F archivé, X actif sous un faiseur archivé.**

C'est **la classe de défaut que la 1c a jugée inacceptable** — « deux transactions voient
chacune un arbre sans cycle et valident toutes les deux », citée mot pour mot dans
`src/app/demandes/actions.ts`. Le verrou consultatif a été posé pour ça ; il ne protège que
les écritures qui passent par `definir_arbre`, et l'archivage n'en est pas.

**Le remède retenu, et pourquoi ce n'est PAS « faire prendre le verrou consultatif à
`archiverMembre` ».** `archiverMembre` écrit par un `update` PostgREST : **on ne peut pas y
prendre un `pg_advisory_xact_lock`** sans créer une passerelle SQL de plus, donc un
**quatrième chemin d'écriture** vers l'état d'une fiche — exactement ce que cette phase
s'interdit. Le remède est un **verrou de ligne** posé du côté qui lit : `for share` sur la
ligne du faiseur. Il suffit, et il suffit **dans les deux sens** :

- **archivage d'abord, rattachement ensuite** : l'`update … set etat` détient un
  `FOR NO KEY UPDATE` sur la ligne de `F` ; le `select … for share` du rattachement
  **conflit et attend**, puis relit la **version la plus récente** de la ligne — `'archive'`
  — et refuse. Cette moitié est garantie par la sémantique du verrou de ligne, qui suit
  toujours la chaîne de mises à jour.
- **rattachement d'abord, archivage ensuite** : le `for share` du rattachement fait
  **attendre** l'`update` concurrent ; celui-ci, débloqué, rejoue son déclencheur `before
  update` et **recompte** les disciples actifs, `X` étant désormais validé. **Cette moitié
  repose sur le rejeu du déclencheur après attente : elle est MESURÉE par l'étape 1 puis
  par l'étape 6, elle n'est pas supposée.**

**LE VERROU EST POSÉ AUX DEUX ENDROITS, ET CE N'EST PAS UNE REDONDANCE.** Dans
`public.definir_arbre`, parce que la passerelle doit rendre un **message juste avant
d'écrire**, et qu'une décision prise sur une lecture non verrouillée peut être périmée au
moment où elle s'écrit. Dans `prive.refuser_faiseur_de_disciple_archive`, parce que ce
déclencheur est la barrière de **toute** écriture — y compris les `insert` directs qui ne
passent pas par `definir_arbre`, comme celui de `convertir_participant_externe`
(chemin 2, 20260818220000), qui pose un faiseur sans jamais lire son état.

**CE QU'ON NE TOUCHE PAS.** Aucun `create trigger`, aucune politique RLS, aucun `grant`,
aucune colonne, aucun index. Les messages et les marqueurs **existants** gardent tous leur
texte et leur sens : `disciples_a_reaffecter` et `faiseur_de_disciple_archive` restent
**exactement** ce qu'ils sont, et les branches applicatives qui les discriminent
(`archiverMembre`, `desarchiverMembre`) continuent de fonctionner **sans une ligne
modifiée**. Le seul cas nouveau — faiseur `en_attente` — reçoit un marqueur **distinct**,
`faiseur_de_disciple_inactif`, précisément pour que personne ne se voie afficher
« ce faiseur est archivé » à propos d'une fiche qui ne l'est pas.

**CONSÉQUENCE CONNUE ET ASSUMÉE.** `desarchiverMembre` et `/membres/[id]/arbre` ne
connaissent pas `faiseur_de_disciple_inactif` et **ne sont pas modifiés dans cette phase**
(les écrans existants restent inchangés) : sur ce marqueur, ils retombent sur leur message
générique, et le marqueur reste **journalisé**, là où il sert. Le cas n'est atteignable
qu'en forgeant un appel, les sélecteurs ne proposant que des membres actifs. C'est écrit
ici pour que personne ne le découvre en revue.

- [ ] **Étape 0 — OBLIGATOIRE, À EXÉCUTER, PAS À SURVOLER : relever le plus haut numéro de migration RÉELLEMENT présent**

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
base peuvent diverger, et **la base peut être en avance sur le dépôt**. Retenir le
**maximum des deux**. **Ne pas réutiliser le relevé d'une tâche précédente :** une
migration vient d'être poussée, le plancher a bougé. La sortie réelle des deux commandes
est **consignée verbatim dans le rapport de tâche**.

Choisir alors les **deux** premiers numéros strictement supérieurs au maximum relevé, dans
l'ordre : la migration de `definir_arbre` d'abord, celle des déclencheurs ensuite.

- [ ] **Étape 1 : REPRODUIRE LA COURSE AVANT DE LA CORRIGER — c'est le contrôle positif du remède**

⚠️ **Cette base sert la PRODUCTION.** Cette étape crée des fiches préfixées `ZZCourse-`,
en produit délibérément deux qui violent l'invariant, et les supprime **dans la même
exécution**, avec un comptage de contrôle qui **lève** s'il subsiste quoi que ce soit.
Ne jamais interrompre la séquence entre la reproduction et le nettoyage.

**Sans cette étape, l'étape 6 ne prouverait rien** : « les deux transactions ne se marchent
plus dessus » est aussi ce qu'on observerait d'un script qui ne parvient tout simplement
pas à les faire se croiser.

**Comment deux transactions concurrentes sont obtenues sans pilote Postgres brut.** Le
dépôt n'a **aucun** client Postgres direct (`package.json` : ni `pg`, ni `postgres`) et
aucune chaîne de connexion en `.env.local` : on ne peut pas ouvrir deux transactions et les
entrelacer à la main. On rend donc **une** des deux transactions **lente de l'intérieur** :
une fonction temporaire fait son écriture puis `pg_sleep`, ce qui **maintient ouverte** la
transaction implicite de PostgREST et tous ses verrous, pendant qu'un second appel HTTP
part en parallèle. L'entrelacement est **déterministe**, pas probabiliste.

Créer les deux fonctions temporaires **dans l'éditeur SQL Supabase** :

```sql
-- FONCTIONS TEMPORAIRES DE COURSE — NE JAMAIS LES LAISSER EN BASE.
-- Elles ne sont dans AUCUNE migration : elles sont créées ici, employées par le script
-- ci-dessous, et supprimées à l'étape 7, dont le contrôle vérifie leur disparition.
create or replace function public.zz_course_arbre(
  p_membre uuid, p_faiseur uuid, p_sommeil double precision
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.definir_arbre(p_membre, p_faiseur, null, false);
  -- Tient la transaction — et donc TOUS ses verrous — ouverte pendant p_sommeil secondes.
  perform pg_sleep(p_sommeil);
end;
$$;

create or replace function public.zz_course_etat(
  p_membre uuid, p_etat public.etat_membre, p_sommeil double precision
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.membres set etat = p_etat where id = p_membre;
  perform pg_sleep(p_sommeil);
end;
$$;

revoke execute on function public.zz_course_arbre(uuid, uuid, double precision)
  from public, anon, authenticated;
revoke execute on function public.zz_course_etat(uuid, public.etat_membre, double precision)
  from public, anon, authenticated;
grant execute on function public.zz_course_arbre(uuid, uuid, double precision) to service_role;
grant execute on function public.zz_course_etat(uuid, public.etat_membre, double precision) to service_role;

notify pgrst, 'reload schema';
```

Créer `scripts/.tmp-course/course-arbre.mjs` :

```javascript
import { createClient } from '@supabase/supabase-js'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const PREFIXE = 'ZZCourse-'
// Sous le statement_timeout de Supabase. Si un appel lent est coupé par un délai
// d'attente, RAMENER à 2 et le DÉCALAGE à 500, et le consigner — ne pas conclure.
const SOMMEIL = 3
const DECALAGE = 800

const attendre = (ms) => new Promise((r) => setTimeout(r, ms))

async function creer(suffixe, etat, faiseur) {
  const { data, error } = await admin
    .from('membres')
    .insert({
      nom: `${PREFIXE}${suffixe}`,
      prenom: 'Course',
      etat,
      faiseur_de_disciple_id: faiseur ?? null,
    })
    .select('id')
    .single()
  // Toute préparation vérifie son erreur et LÈVE : une préparation muette ferait
  // « réussir » une course qui n'a jamais eu lieu.
  if (error || !data) throw new Error(`préparation « ${suffixe} » impossible : ${error?.message}`)
  return data.id
}

async function relire(id) {
  const { data, error } = await admin
    .from('membres')
    .select('etat, faiseur_de_disciple_id')
    .eq('id', id)
    .single()
  if (error) throw new Error(`relecture impossible : ${error.message}`)
  return data
}

function decrire(resultat) {
  if (!resultat.error) return 'PASSE'
  return `REFUS [${resultat.error.details ?? 'sans marqueur'}] ${resultat.error.message}`
}

/** Rattachement lent, archivage du faiseur concurrent. */
async function scenario1() {
  const f = await creer('s1-faiseur', 'actif', null)
  const x = await creer('s1-disciple', 'actif', null)

  const lente = admin.rpc('zz_course_arbre', { p_membre: x, p_faiseur: f, p_sommeil: SOMMEIL })
  await attendre(DECALAGE)
  const concurrente = admin.from('membres').update({ etat: 'archive' }).eq('id', f).select('id')
  const [a, b] = await Promise.all([lente, concurrente])

  const apresF = await relire(f)
  const apresX = await relire(x)
  const viole =
    apresF.etat === 'archive' && apresX.etat === 'actif' && apresX.faiseur_de_disciple_id === f
  console.log(
    `S1 rattachement→archivage | rattachement: ${decrire(a)} | archivage: ${decrire(b)} | ` +
      `F.etat=${apresF.etat} X.etat=${apresX.etat} X.faiseur=${apresX.faiseur_de_disciple_id === f ? 'F' : String(apresX.faiseur_de_disciple_id)} | ` +
      `VERDICT: ${viole ? 'INVARIANT VIOLÉ' : 'invariant tenu'}`,
  )
}

/** Archivage lent, rattachement concurrent. */
async function scenario2() {
  const f = await creer('s2-faiseur', 'actif', null)
  const x = await creer('s2-disciple', 'actif', null)

  const lente = admin.rpc('zz_course_etat', { p_membre: f, p_etat: 'archive', p_sommeil: SOMMEIL })
  await attendre(DECALAGE)
  const concurrente = admin.rpc('definir_arbre', {
    p_membre: x,
    p_faiseur_de_disciple: f,
    p_dirigeant: null,
    p_dirigeant_force: false,
  })
  const [a, b] = await Promise.all([lente, concurrente])

  const apresF = await relire(f)
  const apresX = await relire(x)
  const viole =
    apresF.etat === 'archive' && apresX.etat === 'actif' && apresX.faiseur_de_disciple_id === f
  console.log(
    `S2 archivage→rattachement | archivage: ${decrire(a)} | rattachement: ${decrire(b)} | ` +
      `F.etat=${apresF.etat} X.etat=${apresX.etat} X.faiseur=${apresX.faiseur_de_disciple_id === f ? 'F' : String(apresX.faiseur_de_disciple_id)} | ` +
      `VERDICT: ${viole ? 'INVARIANT VIOLÉ' : 'invariant tenu'}`,
  )
}

/** Désarchivage lent d'un disciple, archivage de son faiseur concurrent. */
async function scenario3() {
  const f = await creer('s3-faiseur', 'actif', null)
  const x = await creer('s3-disciple', 'archive', f)

  const lente = admin.rpc('zz_course_etat', { p_membre: x, p_etat: 'actif', p_sommeil: SOMMEIL })
  await attendre(DECALAGE)
  const concurrente = admin.from('membres').update({ etat: 'archive' }).eq('id', f).select('id')
  const [a, b] = await Promise.all([lente, concurrente])

  const apresF = await relire(f)
  const apresX = await relire(x)
  const viole =
    apresF.etat === 'archive' && apresX.etat === 'actif' && apresX.faiseur_de_disciple_id === f
  console.log(
    `S3 désarchivage→archivage | désarchivage: ${decrire(a)} | archivage: ${decrire(b)} | ` +
      `F.etat=${apresF.etat} X.etat=${apresX.etat} X.faiseur=${apresX.faiseur_de_disciple_id === f ? 'F' : String(apresX.faiseur_de_disciple_id)} | ` +
      `VERDICT: ${viole ? 'INVARIANT VIOLÉ' : 'invariant tenu'}`,
  )
}

async function menage() {
  const { error } = await admin.from('membres').delete().like('nom', `${PREFIXE}%`)
  if (error) throw new Error(`nettoyage impossible : ${error.message}`)
  const { count, error: erreurCompte } = await admin
    .from('membres')
    .select('id', { count: 'exact', head: true })
    .like('nom', `${PREFIXE}%`)
  if (erreurCompte) throw new Error(`comptage de contrôle impossible : ${erreurCompte.message}`)
  if (count !== 0) throw new Error(`RÉSIDU : ${count} fiche(s) « ${PREFIXE} » subsistent EN BASE`)
  console.log('nettoyage : ok, résidu 0')
}

// `finally` : même si un scénario lève, les fiches créées — dont celles qui VIOLENT
// l'invariant — sont supprimées. C'est la seule chose qui ne doit jamais être sautée.
try {
  await menage()
  await scenario1()
  await scenario2()
  await scenario3()
} finally {
  await menage()
}
```

```bash
npx dotenv -e .env.local -- node scripts/.tmp-course/course-arbre.mjs
```

**Attendu AVANT correction : les TROIS verdicts disent `INVARIANT VIOLÉ`.** Consigner la
sortie **verbatim**. Si un scénario dit déjà « invariant tenu » **avant** la correction,
**ne pas passer outre** : cela signifie que l'entrelacement n'a pas eu lieu (appel lent
coupé, décalage trop court). Ajuster `SOMMEIL` / `DECALAGE`, rejouer, et **consigner le
nombre d'essais**. Si après trois ajustements un scénario reste non reproductible,
**l'écrire tel quel dans le rapport** — « non reproduit en N essais » — et ne présenter
**aucune** de ses conclusions comme acquise.

- [ ] **Étape 2 : écrire la migration de `public.definir_arbre`**

Créer `supabase/migrations/<NUMERO+1>_definir_arbre_faiseur_actif_verrouille.sql`. **Le
corps ci-dessous reprend celui de 20260814150000 À L'IDENTIQUE**, en n'ajoutant que le
`for share` et la garde d'état élargie. Ne rien réordonner, ne rien « simplifier » :
chaque ligne conservée l'est parce qu'elle a déjà été payée.

```sql
-- Phase 5, D99 / D83 — CORRECTIF sur du code DÉPLOYÉ, strictement additif.
--
-- DEUX DÉFAUTS FERMÉS ICI, tous deux vérifiés dans la migration 20260814150000 et non
-- dans sa description.
--
-- 1. LA GARDE D'ÉTAT NE CONNAISSAIT QUE `archive`, alors que public.etat_membre a TROIS
--    valeurs (20260812120000). Rien n'interdisait de rattacher un membre ACTIF à un
--    faiseur `en_attente`. Or l'arborescence de la phase 5 exclut `en_attente`
--    EXACTEMENT comme `archive` : un tel maillon rendrait toute sa descendance active
--    INATTEIGNABLE depuis la liste des racines — ces fiches ont un faiseur, donc ne sont
--    pas racines, et leur parent n'est jamais rendu. Elles disparaissent sans signal.
--    Forme reprise de convertir_participant_externe (20260818220000), qui écrit déjà
--    `if v_etat_cible is distinct from 'actif'` : `is distinct from` et non `<>`, pour
--    que la sûreté dépende d'une EXPRESSION et non d'un raisonnement sur la nullité
--    qu'une retouche future invaliderait.
--
-- 2. L'ÉTAT DU FAISEUR ÉTAIT LU SANS VERROU DE LIGNE. Le verrou consultatif
--    pg_advisory_xact_lock(20260814, 1) sérialise les écritures d'ARBRE entre elles ;
--    il ne dit RIEN de l'archivage, qui passe par un `update` PostgREST direct
--    (archiverMembre) et ne peut pas prendre de verrou consultatif sans créer un chemin
--    d'écriture de plus. En `read committed`, un rattachement et un archivage concurrents
--    ne se voyaient donc pas : le rattachement lisait `actif` (l'archivage n'était pas
--    encore commis), l'archivage comptait 0 disciple actif (le rattachement non plus), et
--    LES DEUX VALIDAIENT — laissant un membre actif sous un faiseur archivé. C'est la
--    classe de défaut que la 1c a explicitement jugée inacceptable (« deux transactions
--    voient chacune un arbre sans cycle et valident toutes les deux »).
--
--    `for share` referme les DEUX SENS : il conflit avec le FOR NO KEY UPDATE que prend
--    tout `update … set etat`. Archivage d'abord : la lecture attend, puis relit la
--    version la PLUS RÉCENTE de la ligne et refuse. Rattachement d'abord : l'archivage
--    attend, puis rejoue son déclencheur `before update` et RECOMPTE les disciples.
--    LA SECONDE MOITIÉ EST MESURÉE, PAS SUPPOSÉE : voir le rapport de tâche.
--
-- MARQUEUR NOUVEAU, ET IL NE POUVAIT PAS ÊTRE `faiseur_de_disciple_archive` :
-- ce marqueur-là commande un message affiché qui dit « est archivé ». Le rendre pour un
-- faiseur `en_attente` afficherait à l'utilisateur une phrase que le code ne tient pas.
-- D'où `faiseur_de_disciple_inactif`, distinct, pour ce cas et pour lui seul. Les deux
-- branches existent donc côte à côte, et l'ordre compte : `archive` est testé D'ABORD,
-- pour que toutes les branches applicatives qui discriminent aujourd'hui
-- `faiseur_de_disciple_archive` continuent de recevoir EXACTEMENT ce qu'elles recevaient.
--
-- CONSÉQUENCE ASSUMÉE : desarchiverMembre et /membres/[id]/arbre ne connaissent pas le
-- marqueur nouveau et ne sont pas modifiés — ils retombent sur leur message générique, et
-- le marqueur reste journalisé. Le cas n'est atteignable qu'en forgeant un appel, les
-- sélecteurs ne proposant que des membres actifs. De même, la validation d'une demande
-- `demande_suivi` dont le demandeur porterait une fiche non active échouerait désormais
-- avec ce marqueur au lieu de rattacher : refus FERMÉ, message générique, marqueur
-- journalisé — préférable à un trou muet dans l'arbre.

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
declare
  v_etat_faiseur public.etat_membre;
begin
  -- PREMIÈRE instruction, avant toute lecture : voir l'en-tête de 20260814100000.
  -- Clé (20260814, 1) = arbre. La clé (20260814, 2) est réservée aux rôles.
  perform pg_advisory_xact_lock(20260814, 1);

  perform 1 from public.membres m where m.id = p_membre for update;
  if not found then
    raise exception 'Membre inconnu.' using detail = 'membre_inconnu';
  end if;

  if p_faiseur_de_disciple is not null then
    -- `for share` : voir l'en-tête, point 2. Il ne bloque pas deux rattachements
    -- concurrents sous le MÊME faiseur (deux verrous partagés sont compatibles) ; il ne
    -- bloque que ce qui change la ligne du faiseur — c'est-à-dire exactement ce qui peut
    -- rendre cette lecture périmée.
    select m.etat into v_etat_faiseur
    from public.membres m
    where m.id = p_faiseur_de_disciple
    for share;
    if not found then
      raise exception 'Faiseur de disciple inconnu.' using detail = 'faiseur_inconnu';
    end if;
    if v_etat_faiseur = 'archive' then
      raise exception 'Le faiseur de disciple choisi est archivé.'
        using detail = 'faiseur_de_disciple_archive';
    end if;
    if v_etat_faiseur is distinct from 'actif' then
      raise exception 'Le faiseur de disciple choisi n''est pas un membre actif.'
        using detail = 'faiseur_de_disciple_inactif';
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

comment on function public.definir_arbre(uuid, uuid, uuid, boolean) is
  'Passerelle sérialisée (verrou consultatif 20260814,1) vers l''écriture de l''arbre des faiseurs de disciple et du dirigeant. Refuse un membre, un faiseur de disciple ou un dirigeant inconnu, et un cycle. AMENDÉE PAR LA PHASE 5 (D99, D83) sur DEUX points. (1) La garde d''état ne connaissait que ''archive'' alors que public.etat_membre a trois valeurs : un faiseur ''en_attente'' était accepté, et rendait toute sa descendance active inatteignable depuis les racines de l''arborescence, qui exclut ''en_attente'' comme ''archive''. Un faiseur archivé rend toujours faiseur_de_disciple_archive ; un faiseur ni actif ni archivé rend le marqueur NOUVEAU faiseur_de_disciple_inactif — distinct, parce que le message commandé par le premier dit « est archivé » et mentirait ici. (2) L''état du faiseur est désormais lu SOUS VERROU DE LIGNE (for share) : le verrou consultatif sérialise les écritures d''arbre entre elles mais ne dit rien de l''archivage, qui passe par un update PostgREST direct et ne peut pas prendre de verrou consultatif ; sans for share, un rattachement et un archivage concurrents ne se voyaient pas et validaient tous les deux, laissant un membre actif sous un faiseur archivé. Exécution réservée à service_role.';
```

- [ ] **Étape 3 : écrire la migration des trois gardes d'état**

Créer `supabase/migrations/<NUMERO+2>_gardes_etat_arbre_elargies.sql`. **Les trois corps
reprennent ceux de 20260814120000, 20260814140000 et 20260814150000 À L'IDENTIQUE**, en
n'élargissant que les comparaisons d'état. **Aucun `create trigger` : les trois
déclencheurs existent déjà et pointent sur ces fonctions.**

```sql
-- Phase 5, D99 — CORRECTIF sur du code DÉPLOYÉ, strictement additif : seuls les CORPS de
-- trois fonctions de déclencheur sont réécrits. AUCUN déclencheur n'est créé, supprimé ni
-- redéfini ; les trois `create trigger` de 20260814120000, 20260814140000 et
-- 20260814150000 restent en place et continuent de pointer sur ces mêmes fonctions.
--
-- L'INVARIANT QUE CES TROIS GARDES TIENNENT, ÉLARGI :
--   AUCUN MEMBRE `actif` N'A D'ANCÊTRE QUI NE SOIT PAS `actif`.
--
-- Il était énoncé « pas d'ancêtre `archive` », et les trois corps comparaient
-- littéralement à 'archive'. Or public.etat_membre a TROIS valeurs (20260812120000), et
-- l'arborescence de la phase 5 exclut `en_attente` EXACTEMENT comme `archive`
-- (`.eq('etat','actif')` sur les deux lectures paginées). Un maillon `en_attente`
-- produisait donc le même trou qu'un maillon `archive`, avec une conséquence que le cas
-- `archive` n'avait pas : toute la descendance ACTIVE d'un faiseur `en_attente` devenait
-- INATTEIGNABLE depuis la liste des racines — ces fiches ont un faiseur, donc ne sont pas
-- racines, et leur parent n'est jamais rendu. Rien ne le signalait.
--
-- MARQUEURS. `disciples_a_reaffecter` et `faiseur_de_disciple_archive` gardent leur texte
-- ET leur sens : les branches applicatives qui les discriminent aujourd'hui continuent de
-- recevoir exactement ce qu'elles recevaient. Le seul cas nouveau — faiseur ni actif ni
-- archivé — reçoit le marqueur NOUVEAU `faiseur_de_disciple_inactif`, parce que le message
-- commandé par `faiseur_de_disciple_archive` dit « est archivé » et mentirait ici. L'ordre
-- des branches est donc `archive` D'ABORD, `is distinct from 'actif'` ensuite.
--
-- VERROU DE LIGNE dans les deux gardes qui lisent l'état du FAISEUR. Ces déclencheurs sont
-- la barrière de TOUTE écriture, y compris les `insert` directs qui ne passent pas par
-- public.definir_arbre — celui de convertir_participant_externe (chemin 2, 20260818220000)
-- pose un faiseur sans jamais lire son état. Sans `for share`, un archivage concurrent du
-- faiseur restait invisible à la lecture du déclencheur : les deux transactions
-- validaient. Ce n'est PAS une redondance avec le `for share` de public.definir_arbre :
-- celui-là sert à rendre un message JUSTE avant d'écrire, celui-ci protège les écritures
-- qui ne passent pas par la passerelle.

-- (1) Quitter l'état `actif` alors qu'on a encore des disciples actifs.
--     ANCIENNE CONDITION : `if new.etat <> 'archive' or old.etat = 'archive'` — elle ne
--     surveillait QUE la transition vers `archive`, et laissait passer `actif` ->
--     `en_attente` avec des disciples actifs.
--     NOUVELLE CONDITION : on sort si la fiche RESTE active (rien à vérifier), ou si son
--     état ne change pas (une mise à jour sans effet ne doit pas refuser ce qui existe
--     déjà). Toute AUTRE transition — donc toute sortie de `actif`, et le passage
--     `en_attente` -> `archive` que l'ancienne condition couvrait déjà — recompte.
create or replace function prive.refuser_archivage_faiseur_de_disciple()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_disciples integer;
begin
  if new.etat = 'actif' or old.etat = new.etat then
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

comment on function prive.refuser_archivage_faiseur_de_disciple() is
  'Déclencheur before update of etat sur public.membres : refuse à un membre de QUITTER l''état actif tant qu''il est encore faiseur de disciple d''au moins un membre actif (spec §7). ÉLARGI PAR LA PHASE 5 (D99) : la condition ne surveillait que la transition vers ''archive'' et laissait donc passer actif -> en_attente avec des disciples actifs, ce qui rendait toute la descendance active inatteignable depuis les racines de l''arborescence. Une mise à jour qui ne change pas l''état ne déclenche rien. Barrière de dernier recours : le contrôle en amont, dans archiverMembre, nomme les personnes concernées avant d''écrire ; ce déclencheur protège même une écriture directe ou concurrente. Marqueur inchangé : disciples_a_reaffecter.';

-- (2) Redevenir `actif` alors que son faiseur ne l'est pas.
create or replace function prive.refuser_desarchivage_faiseur_archive()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_etat_faiseur public.etat_membre;
begin
  if new.etat <> 'actif' or old.etat = 'actif' then
    return new;
  end if;

  if new.faiseur_de_disciple_id is null then
    return new;
  end if;

  select m.etat into v_etat_faiseur
  from public.membres m
  where m.id = new.faiseur_de_disciple_id
  for share;

  if v_etat_faiseur = 'archive' then
    raise exception 'Le faiseur de disciple de ce membre est archivé.'
      using detail = 'faiseur_de_disciple_archive';
  end if;
  if v_etat_faiseur is distinct from 'actif' then
    raise exception 'Le faiseur de disciple de ce membre n''est pas un membre actif.'
      using detail = 'faiseur_de_disciple_inactif';
  end if;

  return new;
end;
$$;

comment on function prive.refuser_desarchivage_faiseur_archive() is
  'Déclencheur before update of etat sur public.membres : refuse de rendre un membre actif quand son faiseur de disciple ne l''est pas. Ferme le contournement de 20260814120000 : archiver le disciple puis son faiseur passe, mais rétablir ensuite le disciple recréerait l''état que l''archivage interdit. ÉLARGI PAR LA PHASE 5 (D99) : la comparaison ne portait que sur ''archive'' ; un faiseur ''en_attente'' passait, et l''arborescence l''exclut comme un archivé. VERROUILLÉ PAR LA PHASE 5 (D83) : l''état du faiseur est lu `for share`, sans quoi un archivage concurrent du faiseur restait invisible et les deux transactions validaient. Faiseur archivé : marqueur faiseur_de_disciple_archive, inchangé. Faiseur ni actif ni archivé : marqueur NOUVEAU faiseur_de_disciple_inactif. Barrière de dernier recours : le contrôle en amont, dans desarchiverMembre, nomme le faiseur concerné avant d''écrire.';

-- (3) Se rattacher à un faiseur qui n'est pas actif, à l'`insert` COMME à l'`update`.
create or replace function prive.refuser_faiseur_de_disciple_archive()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_etat_faiseur public.etat_membre;
begin
  if new.faiseur_de_disciple_id is null then
    return new;
  end if;

  select m.etat into v_etat_faiseur
  from public.membres m
  where m.id = new.faiseur_de_disciple_id
  for share;

  if v_etat_faiseur = 'archive' then
    raise exception 'Le faiseur de disciple choisi est archivé.'
      using detail = 'faiseur_de_disciple_archive';
  end if;
  if v_etat_faiseur is distinct from 'actif' then
    raise exception 'Le faiseur de disciple choisi n''est pas un membre actif.'
      using detail = 'faiseur_de_disciple_inactif';
  end if;

  return new;
end;
$$;

comment on function prive.refuser_faiseur_de_disciple_archive() is
  'Déclencheur before insert or update of faiseur_de_disciple_id sur public.membres : refuse de rattacher un membre à un faiseur de disciple qui n''est pas ACTIF. Barrière de dernier recours, sur le même modèle que membres_anti_cycle : public.definir_arbre porte la même vérification pour produire un message avant d''écrire ; ce déclencheur protège aussi les écritures directes — l''insert de convertir_participant_externe (chemin 2) pose un faiseur sans jamais lire son état. ÉLARGI PAR LA PHASE 5 (D99) : la comparaison ne portait que sur ''archive'', et rien n''interdisait de rattacher un membre actif à un faiseur ''en_attente'', que l''arborescence exclut comme un archivé. VERROUILLÉ PAR LA PHASE 5 (D83) : l''état du faiseur est lu `for share`, sans quoi un archivage concurrent du faiseur restait invisible à ce déclencheur. Faiseur archivé : marqueur faiseur_de_disciple_archive, inchangé — même fait constaté que dans prive.refuser_desarchivage_faiseur_archive. Faiseur ni actif ni archivé : marqueur NOUVEAU faiseur_de_disciple_inactif, distinct parce que le message commandé par le premier dit « est archivé » et mentirait ici.';
```

- [ ] **Étape 4 : appliquer**

```bash
npx supabase db push --linked
```

- [ ] **Étape 5 : VÉRIFIER QUE LES QUATRE CORPS ONT VRAIMENT CHANGÉ EN BASE, ET QUE LES REFUS MORDENT**

C'est le contrôle qui manquait les deux fois où le piège des numéros de migration s'est
refermé : **interroger la base, pas la liste des migrations.** Dans l'éditeur SQL
Supabase :

```sql
select p.proname,
       pg_get_functiondef(p.oid) like '%for share%'          as porte_for_share,
       pg_get_functiondef(p.oid) like '%faiseur_de_disciple_inactif%' as porte_marqueur_nouveau
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where (n.nspname = 'public' and p.proname = 'definir_arbre')
   or (n.nspname = 'prive' and p.proname in (
        'refuser_archivage_faiseur_de_disciple',
        'refuser_desarchivage_faiseur_archive',
        'refuser_faiseur_de_disciple_archive'))
order by p.proname;
```

**Attendu, et à consigner ligne par ligne :** `definir_arbre` → `t`, `t` ;
`refuser_archivage_faiseur_de_disciple` → `f`, `f` (elle ne lit aucun faiseur et ne pose pas
ce marqueur) ; les deux autres → `t`, `t`.

**Puis les refus eux-mêmes, avec leur contrôle positif.** Recréer
`scripts/.tmp-course/gardes.mjs` :

```javascript
import { createClient } from '@supabase/supabase-js'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const PREFIXE = 'ZZCourse-'

async function creer(suffixe, etat, faiseur) {
  const { data, error } = await admin
    .from('membres')
    .insert({
      nom: `${PREFIXE}${suffixe}`,
      prenom: 'Garde',
      etat,
      faiseur_de_disciple_id: faiseur ?? null,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`préparation « ${suffixe} » impossible : ${error?.message}`)
  return data.id
}

function decrire(erreur) {
  return erreur ? `REFUS [${erreur.details ?? 'sans marqueur'}] ${erreur.message}` : 'PASSE'
}

try {
  await admin.from('membres').delete().like('nom', `${PREFIXE}%`)

  const enAttente = await creer('garde-en-attente', 'en_attente', null)
  const actif = await creer('garde-actif', 'actif', null)
  const cible = await creer('garde-cible', 'actif', null)
  const parent = await creer('garde-parent', 'actif', null)
  await creer('garde-enfant', 'actif', parent)

  // 1. La passerelle refuse un faiseur en_attente.
  const a = await admin.rpc('definir_arbre', {
    p_membre: cible, p_faiseur_de_disciple: enAttente, p_dirigeant: null, p_dirigeant_force: false,
  })
  console.log('1. definir_arbre vers un faiseur en_attente →', decrire(a.error))

  // 2. Le DÉCLENCHEUR refuse le même rattachement par un `insert` DIRECT, qui ne passe
  //    par aucune passerelle.
  const b = await admin
    .from('membres')
    .insert({ nom: `${PREFIXE}garde-insert`, prenom: 'Garde', faiseur_de_disciple_id: enAttente })
  console.log('2. insert direct sous un faiseur en_attente →', decrire(b.error))

  // 3. Quitter `actif` pour `en_attente` avec un disciple actif est refusé.
  const c = await admin.from('membres').update({ etat: 'en_attente' }).eq('id', parent).select('id')
  console.log('3. parent actif -> en_attente avec un disciple actif →', decrire(c.error))

  // CONTRÔLES POSITIFS — sans eux, les trois refus seraient aussi satisfaits par des
  // gardes qui refuseraient TOUT.
  const d = await admin.rpc('definir_arbre', {
    p_membre: cible, p_faiseur_de_disciple: actif, p_dirigeant: null, p_dirigeant_force: false,
  })
  console.log('4. CONTRÔLE POSITIF definir_arbre vers un faiseur ACTIF →', decrire(d.error))

  const e = await admin.from('membres').update({ etat: 'archive' }).eq('id', actif).select('id')
  console.log('5. CONTRÔLE POSITIF archivage d’un membre SANS disciple actif →', decrire(e.error))
} finally {
  const { error } = await admin.from('membres').delete().like('nom', `${PREFIXE}%`)
  if (error) throw new Error(`nettoyage impossible : ${error.message}`)
  const { count, error: erreurCompte } = await admin
    .from('membres')
    .select('id', { count: 'exact', head: true })
    .like('nom', `${PREFIXE}%`)
  if (erreurCompte) throw new Error(`comptage de contrôle impossible : ${erreurCompte.message}`)
  if (count !== 0) throw new Error(`RÉSIDU : ${count} fiche(s) « ${PREFIXE} » subsistent EN BASE`)
  console.log('nettoyage : ok, résidu 0')
}
```

```bash
npx dotenv -e .env.local -- node scripts/.tmp-course/gardes.mjs
```

**Attendu :** 1, 2 et 3 **refusent**, 1 et 2 avec le marqueur `faiseur_de_disciple_inactif`
et 3 avec `disciples_a_reaffecter` ; **4 et 5 passent**. Consigner la sortie **verbatim**,
marqueurs compris. **Le contrôle 4 arrive après le refus 1 sur la MÊME fiche cible** : il
prouve donc que le refus 1 tient à l'état du faiseur, et non à la cible.

Attention au contrôle 5 : il archive `garde-actif`, qui vient de devenir le faiseur de
`garde-cible` par le contrôle 4. Il doit donc **échouer** avec `disciples_a_reaffecter` —
et c'est encore un résultat juste, mais **ce n'est pas le contrôle positif voulu**. Si
c'est ce qui est observé, refaire le contrôle 5 sur une fiche neuve sans disciple, et
consigner les deux sorties.

- [ ] **Étape 6 : REJOUER LA COURSE — la même, sans rien changer au script**

```bash
npx dotenv -e .env.local -- node scripts/.tmp-course/course-arbre.mjs
```

**Attendu APRÈS correction : les TROIS verdicts disent `invariant tenu`**, et les lignes de
détail montrent **lequel** des deux appels a été refusé, avec **quel marqueur**. Consigner
la sortie **verbatim**, à côté de celle de l'étape 1 : c'est la comparaison des deux
sorties qui constitue la preuve, aucune des deux ne prouve rien seule.

**Si un scénario reste `INVARIANT VIOLÉ` après correction**, ne rien maquiller : consigner
la sortie, et **écrire dans le rapport que la moitié correspondante du remède n'est pas
tenue**. Une preuve probabiliste rapportée comme certaine serait le pire résultat possible
de cette tâche.

- [ ] **Étape 7 : SUPPRIMER LES FONCTIONS TEMPORAIRES, ET VÉRIFIER QU'ELLES ONT DISPARU**

Dans l'éditeur SQL Supabase :

```sql
drop function if exists public.zz_course_arbre(uuid, uuid, double precision);
drop function if exists public.zz_course_etat(uuid, public.etat_membre, double precision);

select count(*) as restantes
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname like 'zz\_course\_%';
-- ATTENDU : 0.

select count(*) as fiches_residuelles from public.membres where nom like 'ZZCourse-%';
-- ATTENDU : 0.

notify pgrst, 'reload schema';
```

```bash
rm -rf scripts/.tmp-course
```

**Les deux comptages sont consignés.** Une fonction `zz_course_*` laissée en base serait un
chemin d'écriture permanent et non recensé ; une fiche `ZZCourse-` sans faiseur de disciple
**est une racine**, donc elle fausserait la mesure que l'écran `/arborescence` existe pour
rendre lisible.

- [ ] **Étape 8 : les portes rapides, puis commit**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls
```

`npm run test:rls` et `npm run test:e2e` **doivent rester verts sans qu'aucun test soit
modifié** : aucun marqueur existant n'a changé de sens, aucun message existant n'a changé
de texte. **Si un test tombe, c'est cette tâche qui a dévié** — relire les corps réécrits
contre les originaux avant de toucher au moindre test.

```bash
git add supabase/migrations/<NUMERO+1>_definir_arbre_faiseur_actif_verrouille.sql \
  supabase/migrations/<NUMERO+2>_gardes_etat_arbre_elargies.sql
git commit -m "fix: elargir a en_attente et verrouiller l'invariant d'arbre des faiseurs de disciple (D99, D83)"
```

**Preuves produites par cette tâche :** la sortie **réelle** des deux commandes de
l'étape 0 et les deux numéros retenus ; la sortie **verbatim** de la course **avant**
correction (trois verdicts) ; la sortie **verbatim** des cinq contrôles de gardes, marqueurs
compris ; la sortie **verbatim** de la course **après** correction ; les deux comptages de
l'étape 7 ; et, s'il y a lieu, le **nombre d'essais** nécessaires à la reproduction et la
mention explicite de tout scénario **non reproduit**.

**Livrable indépendamment éprouvable :** l'invariant « aucun membre `actif` n'a d'ancêtre
qui ne soit pas `actif` » est tenu par trois gardes qui connaissent les **trois** valeurs
d'état, et il résiste à une course **reproduite**, pas seulement raisonnée.

---

### Task 2 : couche domaine — `statutsIncompatibles` et `lignesStatutsDepuisFormData` (D84)

**Fichiers :**
- Modifier : `src/lib/domaine/statut.ts`
- Modifier : `src/lib/domaine/statut.test.ts`

**Interfaces :**
- Consomme : rien de cette phase. Réutilise `StatutInvalideError`,
  `normaliserDateAcquisition` et `normaliserNote`, déjà dans ce fichier, **sans en changer
  une ligne**.
- Produit :
  ```ts
  export type GroupeCatalogue = {
    id: string
    nom: string
    exclusif: boolean
    statuts: ReadonlyArray<{ id: string; libelle: string }>
  }
  export type CoupleIncompatible = { groupe: string; premier: string; second: string }
  export function statutsIncompatibles(
    selection: readonly string[],
    catalogue: readonly GroupeCatalogue[],
  ): CoupleIncompatible | null
  export type LigneStatutSaisie = {
    statutId: string
    dateAcquisition: string | null
    note: string | null
  }
  export function lignesStatutsDepuisFormData(donnees: FormData): LigneStatutSaisie[]
  ```
  Consommées par la Task 3 (action) et la Task 4 (formulaire, pour le type
  `LigneStatutSaisie` seul).

**`GroupeCatalogue` est structurellement compatible avec `GroupeStatut`** de
`src/lib/donnees/statuts.ts` (`{ id, nom, exclusif, statuts: { id, libelle, actif }[] }`) :
aucune fonction de traduction n'est nécessaire, et **il ne faut pas en écrire une** — un
type structurel plus large accepte le type plus étroit dès lors qu'on lui passe une
variable et non un littéral d'objet. La couche domaine reste ainsi **sans aucune
dépendance** vers la couche données, comme l'exige le §8 de la spécification maîtresse.

**ÉCHEC FERMÉ, et c'est le point de cette fonction.** Un identifiant sélectionné **absent
du catalogue fourni** ne rend **pas** `null` en silence : il est **refusé**. Un catalogue
tronqué ou incomplet ne doit pas se traduire par « aucun conflit détecté » — et
`listerCatalogue`, qui l'alimentera, **est non bornée** (§13, point 6 du design). Elle
lève `StatutInvalideError`, que l'appelant relaie tel quel : c'est le seul canal du projet
pour un message de saisie précis et actionnable.

- [ ] **Étape 1 : ajouter les fonctions à `src/lib/domaine/statut.ts`**

À la **fin** du fichier, sans toucher à ce qui précède :

```ts
/**
 * Forme MINIMALE d'un groupe du catalogue, telle que la couche domaine en a besoin.
 *
 * Structurellement compatible avec `GroupeStatut` de `src/lib/donnees/statuts.ts` : on
 * lui passe directement ce que `listerCatalogue` rend, sans fonction de traduction. La
 * couche domaine ne dépend ainsi d'AUCUN module de données (§8 de la spécification).
 */
export type GroupeCatalogue = {
  id: string
  nom: string
  exclusif: boolean
  statuts: ReadonlyArray<{ id: string; libelle: string }>
}

/** Le couple fautif, NOMMÉ : sans les deux libellés, l'utilisateur sait qu'il a tort
 *  sans savoir lequel des deux statuts retirer. */
export type CoupleIncompatible = { groupe: string; premier: string; second: string }

/**
 * Deux statuts d'un MÊME GROUPE EXCLUSIF dans une même sélection (D84).
 *
 * Rend le couple fautif, ou `null` si la sélection est cohérente.
 *
 * CETTE FONCTION EXPLIQUE ; LA PASSERELLE `public.creer_membre_enrichi` PROTÈGE. Deux
 * barrières, doctrine du projet depuis la 1b. La passerelle relit les groupes EN BASE et
 * ne fait confiance à aucune liste venue de l'écran ; celle-ci sert à nommer les deux
 * statuts avant même d'écrire.
 *
 * ÉCHEC FERMÉ, ET SA PORTÉE EXACTE. Un identifiant absent du catalogue fourni LÈVE, il
 * n'est jamais ignoré : `listerCatalogue` est non bornée, et un catalogue tronqué ne doit
 * pas se lire comme « aucun conflit détecté ». C'est la même famille de mensonge
 * silencieux que la troncature `max_rows`. MAIS l'échec fermé n'est PAS TOTAL, et il ne
 * faut pas le croire tel : cette fonction RETOURNE au premier couple exclusif trouvé, donc
 * un identifiant inconnu situé APRÈS ce couple dans la sélection n'est jamais examiné.
 * C'est sans conséquence ici — le retour est déjà un refus, et l'appelant s'arrête —, mais
 * quiconque ferait de cette fonction un validateur de sélection devrait la relire en deux
 * passes : indexation et vérification d'appartenance d'abord, détection du couple ensuite.
 *
 * Un même statut sélectionné DEUX FOIS n'est pas un couple exclusif : c'est un doublon,
 * traité plus loin par l'upsert de `prive.attribuer_statut`, qui ne journalise aucun
 * second « ajout ». On compare donc les IDENTIFIANTS, jamais les libellés.
 */
export function statutsIncompatibles(
  selection: readonly string[],
  catalogue: readonly GroupeCatalogue[],
): CoupleIncompatible | null {
  const index = new Map<
    string,
    { libelle: string; groupeId: string; groupeNom: string; exclusif: boolean }
  >()
  for (const groupe of catalogue) {
    for (const statut of groupe.statuts) {
      index.set(statut.id, {
        libelle: statut.libelle,
        groupeId: groupe.id,
        groupeNom: groupe.nom,
        exclusif: groupe.exclusif,
      })
    }
  }

  const premierDuGroupe = new Map<string, { id: string; libelle: string }>()
  for (const identifiant of selection) {
    const entree = index.get(identifiant)
    if (!entree) {
      throw new StatutInvalideError(
        "Un statut sélectionné est introuvable dans le catalogue. La sélection est refusée : recommencez la sélection des statuts.",
      )
    }
    if (!entree.exclusif) {
      continue
    }
    const deja = premierDuGroupe.get(entree.groupeId)
    if (!deja) {
      premierDuGroupe.set(entree.groupeId, { id: identifiant, libelle: entree.libelle })
      continue
    }
    if (deja.id !== identifiant) {
      return { groupe: entree.groupeNom, premier: deja.libelle, second: entree.libelle }
    }
  }
  return null
}

/** Une ligne de statut telle qu'elle est saisie à la création d'un membre. */
export type LigneStatutSaisie = {
  statutId: string
  dateAcquisition: string | null
  note: string | null
}

/**
 * Lit les lignes de statut d'un formulaire de création enrichie.
 *
 * TROIS CHAMPS RÉPÉTÉS, ALIGNÉS PAR INDICE — `statutId`, `statutDateAcquisition`,
 * `statutNote` — et NON un unique champ JSON. Un JSON venu du navigateur devrait être
 * analysé ici, et une clé mal orthographiée y deviendrait `undefined` en silence :
 * exactement le mode de défaillance que la passerelle SQL évite en typant ses colonnes.
 * Trois `getAll` alignés rendent la même information sans analyse, et l'alignement tient
 * PAR CONSTRUCTION tant que le composant rend les trois champs pour chaque ligne — un
 * champ vide est quand même soumis, avec une chaîne vide.
 *
 * Le contrôle ci-dessous n'est donc pas décoratif : il est la seule chose qui distingue
 * « le composant a changé » d'un décalage silencieux qui associerait la date d'une ligne au
 * statut d'une autre. CE QU'IL ATTRAPE, EXACTEMENT, ET RIEN DE PLUS : il compare des
 * LONGUEURS. Un champ manquant ou en trop tombe ; une PERMUTATION à cardinalité égale — le
 * composant rendrait les dates dans un autre ordre que les statuts — passerait sans être
 * vue. Aucun contrôle de longueur ne peut voir cela ; seule la discipline « ne jamais
 * rendre une ligne partielle, et toujours les trois champs dans le même ordre » le peut,
 * et c'est pourquoi elle est écrite en tête du composant.
 *
 * Une ligne SANS statut choisi est REFUSÉE, jamais ignorée : l'ignorer ferait disparaître
 * en silence la date et la note qui l'accompagnent, et l'utilisateur croirait avoir
 * enregistré ce qu'il a saisi.
 */
export function lignesStatutsDepuisFormData(donnees: FormData): LigneStatutSaisie[] {
  const identifiants = donnees.getAll('statutId')
  const dates = donnees.getAll('statutDateAcquisition')
  const notes = donnees.getAll('statutNote')

  if (identifiants.length !== dates.length || identifiants.length !== notes.length) {
    throw new StatutInvalideError(
      "La saisie des statuts est incohérente : recommencez la sélection des statuts.",
    )
  }

  const lignes: LigneStatutSaisie[] = []
  for (let indice = 0; indice < identifiants.length; indice += 1) {
    const brut = identifiants[indice]
    const identifiant = typeof brut === 'string' ? brut.trim() : ''
    if (identifiant.length === 0) {
      throw new StatutInvalideError(
        "Une ligne de statut n'a pas de statut choisi : choisissez-en un, ou retirez la ligne.",
      )
    }
    lignes.push({
      statutId: identifiant,
      dateAcquisition: normaliserDateAcquisition(dates[indice]),
      note: normaliserNote(notes[indice]),
    })
  }
  return lignes
}
```

- [ ] **Étape 2 : les preuves Vitest — preuve n°5 (a) du design**

Ajouter à la **fin** de `src/lib/domaine/statut.test.ts`, sans toucher aux suites
existantes. **Adapter les `import` en tête du fichier** pour y ajouter
`statutsIncompatibles`, `lignesStatutsDepuisFormData` et les types.

```ts
describe('statutsIncompatibles', () => {
  const catalogue = [
    {
      id: 'g-exclusif',
      nom: 'Situation spirituelle',
      exclusif: true,
      statuts: [
        { id: 's-non-croyant', libelle: 'Non-croyant' },
        { id: 's-repenti', libelle: 'Repenti' },
      ],
    },
    {
      id: 'g-cumulable',
      nom: 'Engagements',
      exclusif: false,
      statuts: [
        { id: 's-choriste', libelle: 'Choriste' },
        { id: 's-intercesseur', libelle: 'Intercesseur' },
      ],
    },
  ]

  it('nomme LES DEUX statuts quand ils appartiennent au même groupe exclusif', () => {
    const couple = statutsIncompatibles(['s-non-croyant', 's-repenti'], catalogue)
    expect(couple).not.toBeNull()
    expect(couple?.groupe).toBe('Situation spirituelle')
    // Les DEUX libellés, pas seulement un : sans les deux, l'utilisateur ne sait pas
    // lequel retirer.
    expect([couple?.premier, couple?.second].sort()).toEqual(['Non-croyant', 'Repenti'])
  })

  it('accepte deux statuts du même groupe NON exclusif', () => {
    expect(statutsIncompatibles(['s-choriste', 's-intercesseur'], catalogue)).toBeNull()
  })

  it('accepte un statut de chaque groupe', () => {
    expect(statutsIncompatibles(['s-repenti', 's-choriste'], catalogue)).toBeNull()
  })

  it('accepte une sélection vide', () => {
    expect(statutsIncompatibles([], catalogue)).toBeNull()
  })

  it("ne prend pas un doublon du MÊME statut pour un couple exclusif", () => {
    expect(statutsIncompatibles(['s-repenti', 's-repenti'], catalogue)).toBeNull()
  })

  // ÉCHEC FERMÉ — le cœur de cette fonction. Un catalogue tronqué ne doit JAMAIS se lire
  // comme « aucun conflit ».
  it('REFUSE, et ne rend pas null, un statut absent du catalogue fourni', () => {
    expect(() => statutsIncompatibles(['s-inconnu'], catalogue)).toThrow(StatutInvalideError)
  })

  it('refuse aussi quand le statut absent accompagne des statuts connus', () => {
    expect(() => statutsIncompatibles(['s-choriste', 's-inconnu'], catalogue)).toThrow(
      StatutInvalideError,
    )
  })

  // CONTRÔLE POSITIF DE L'ÉCHEC FERMÉ : sans lui, les deux refus ci-dessus seraient
  // satisfaits par une fonction qui lèverait sur TOUT, y compris une sélection valide.
  it('ne lève pas sur une sélection entièrement présente au catalogue', () => {
    expect(() => statutsIncompatibles(['s-choriste'], catalogue)).not.toThrow()
  })
})

describe('lignesStatutsDepuisFormData', () => {
  function formulaire(
    lignes: Array<{ statutId: string; date: string; note: string }>,
  ): FormData {
    const donnees = new FormData()
    for (const ligne of lignes) {
      donnees.append('statutId', ligne.statutId)
      donnees.append('statutDateAcquisition', ligne.date)
      donnees.append('statutNote', ligne.note)
    }
    return donnees
  }

  it('rend une liste vide quand aucune ligne n’est soumise', () => {
    expect(lignesStatutsDepuisFormData(new FormData())).toEqual([])
  })

  it('lit deux lignes en gardant l’alignement date/note avec leur statut', () => {
    const lignes = lignesStatutsDepuisFormData(
      formulaire([
        { statutId: 'a', date: '2020-01-02', note: 'note-a' },
        { statutId: 'b', date: '', note: '' },
      ]),
    )
    expect(lignes).toEqual([
      { statutId: 'a', dateAcquisition: '2020-01-02', note: 'note-a' },
      { statutId: 'b', dateAcquisition: null, note: null },
    ])
  })

  it('REFUSE une ligne sans statut choisi plutôt que de l’ignorer', () => {
    expect(() =>
      lignesStatutsDepuisFormData(formulaire([{ statutId: '', date: '2020-01-02', note: 'perdue' }])),
    ).toThrow(StatutInvalideError)
  })

  it('REFUSE un décalage entre les trois champs répétés', () => {
    const donnees = new FormData()
    donnees.append('statutId', 'a')
    donnees.append('statutId', 'b')
    donnees.append('statutDateAcquisition', '')
    donnees.append('statutNote', '')
    expect(() => lignesStatutsDepuisFormData(donnees)).toThrow(StatutInvalideError)
  })

  it('relaie le refus de date d’acquisition future de normaliserDateAcquisition', () => {
    expect(() =>
      lignesStatutsDepuisFormData(formulaire([{ statutId: 'a', date: '2999-01-01', note: '' }])),
    ).toThrow(StatutInvalideError)
  })
})
```

- [ ] **Étape 3 : les portes rapides, puis commit**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls
```

```bash
git add src/lib/domaine/statut.ts src/lib/domaine/statut.test.ts
git commit -m "feat: ajouter statutsIncompatibles et lignesStatutsDepuisFormData (D84)"
```

**Preuve produite :** la sortie de `npm test` montrant les nouvelles suites vertes, dont
**les deux cas d'échec fermé et leur contrôle positif**.

**Livrable indépendamment éprouvable :** deux fonctions pures, testées sans base, dont le
refus d'un catalogue incomplet est prouvé et **distingué** d'un refus universel.

---

### Task 3 : `creerMembreEnrichi` REMPLACE `creerMembre` (D86, D87, D90)

**Fichiers :**
- Modifier : `src/app/membres/messages.ts`
- Modifier : `src/app/membres/actions.ts`
- Modifier : `src/lib/securite/garde.ts` (**un mot dans un commentaire**, étape 3)

**Interfaces :**
- Consomme : `public.creer_membre_enrichi` (Task 1) ; `statutsIncompatibles`,
  `lignesStatutsDepuisFormData`, `LigneStatutSaisie`, `StatutInvalideError` (Task 2) ;
  `ficheMembreDepuisFormData`, `FicheMembreInvalideError` (existants) ;
  `listerCatalogue` (existant) ; `exigerAdministrateur` (existant) ;
  `MESSAGE_DIRIGEANT_INCONNU`, `MESSAGE_FAISEUR_ARCHIVE`, `MESSAGE_FAISEUR_INCONNU`,
  `messageCycle` (existants, `src/app/membres/[id]/arbre/messages.ts`) ;
  `MESSAGE_STATUT_INCONNU` (existant,
  `src/app/membres/[id]/statuts/messages.ts`) ; `cheminArbre` (existant).
- Produit :
  ```ts
  export type EtatFormulaireMembre = { erreur: string | null }   // inchangé
  export async function creerMembreEnrichi(
    _etat: EtatFormulaireMembre,
    donnees: FormData,
  ): Promise<EtatFormulaireMembre>
  export function messageStatutsIncompatibles(couple: CoupleIncompatible): string
  export const MESSAGE_STATUTS_EXCLUSIFS_PASSERELLE: string
  export const MESSAGE_FAISEUR_NON_ACTIF: string
  ```
  Consommées par la Task 4.
- **Retire :** `creerMembre`. **D87 : elle est REMPLACÉE, pas doublée.** Deux chemins pour
  un même geste, c'est l'un des deux qui cesse d'être exercé et qui dérive ; et le
  recensement des chemins d'écriture du §10.2 du design deviendrait faux dès sa rédaction.

**LES MESSAGES SONT RÉUTILISÉS, PAS RECOPIÉS.** C'est la conséquence directe de D82 : la
passerelle appelle `definir_arbre` et `attribuer_statut`, donc elle rend **leurs**
marqueurs, avec **leur** sens. Recopier leurs textes ici en créerait des jumeaux destinés à
diverger — exactement l'argument de D72 et de D100.

**LE GARDE EST `exigerAdministrateur`, EN PREMIÈRE INSTRUCTION, ET IL NE DESCEND PAS À
`exigerAutoriteSur`** (D90). La création d'une fiche est réservée à l'administrateur
(§5.2), et un administrateur a autorité **partout** — `peutModifier` court-circuite sur
`estAdmin` avant toute remontée d'arbre. Les deux gardes **coïncident sur cet écran** :
rien n'est affaibli. **Cette coïncidence est écrite ici et dans le `comment on function`
de la Task 1** parce qu'elle n'est pas une construction.

**`exigerAdministrateur` ne dépend d'AUCUN paramètre du formulaire** : contrairement aux
actions de statuts, où le garde suit la lecture de l'identifiant dont il dépend, il n'y a
ici **aucune raison** de le déplacer. Il est la **toute première instruction**.

- [ ] **Étape 1 : les messages**

Remplacer entièrement `src/app/membres/messages.ts` :

```ts
import type { CoupleIncompatible } from '@/lib/domaine/statut'

export const MESSAGE_ECHEC_ENREGISTREMENT =
  "La fiche n'a pas pu être enregistrée. Vérifiez les informations saisies."

/**
 * Refus du couple exclusif venu de la PASSERELLE (marqueur
 * `statuts_exclusifs_incompatibles`, D84), et non du contrôle amont.
 *
 * Distinct de `messageStatutsIncompatibles` ci-dessous, et ce n'est pas une redite : ce
 * message-ci ne peut PAS nommer les deux statuts. La passerelle relit les groupes en base
 * et ne rend que le nom du groupe dans sa prose française — dont on ne discrimine jamais
 * (contrainte globale). Atteindre ce message signifie donc que le contrôle amont a laissé
 * passer : catalogue tronqué, appel forgé, ou modification du catalogue entre les deux.
 * Le dire ainsi vaut mieux que d'inventer deux libellés qu'on n'a pas.
 */
export const MESSAGE_STATUTS_EXCLUSIFS_PASSERELLE =
  "Deux des statuts choisis appartiennent au même groupe exclusif : un membre ne peut porter que l'un des deux. Retirez-en un, puis recommencez."

/**
 * Le faiseur de disciple visé existe, mais il n'est NI actif NI archivé — donc en attente
 * de validation (marqueur `faiseur_de_disciple_inactif`).
 *
 * DISTINCT de `MESSAGE_FAISEUR_ARCHIVE`, et ce n'est pas une redite : ce message-là dit
 * « est archivé », et l'afficher pour une fiche en attente serait une phrase que le code
 * ne tient pas. Le marqueur est distinct EXACTEMENT pour cette raison ; le message doit
 * l'être aussi, sans quoi la distinction faite en base serait perdue à l'écran.
 *
 * Ce message est ici, dans `src/app/membres/messages.ts`, et NON dans
 * `src/app/membres/[id]/arbre/messages.ts` : ce dossier appartient à un écran que cette
 * phase laisse rigoureusement inchangé, et un balayage de la phase vérifie que son diff
 * est vide.
 */
export const MESSAGE_FAISEUR_NON_ACTIF =
  "Le faiseur de disciple choisi n'est pas un membre actif : ce rattachement n'est pas autorisé."

/**
 * Refus du couple exclusif NOMMÉ, produit par le contrôle amont `statutsIncompatibles`
 * (D84). C'est le chemin normal : il EXPLIQUE, là où la passerelle PROTÈGE.
 */
export function messageStatutsIncompatibles(couple: CoupleIncompatible): string {
  return `« ${couple.premier} » et « ${couple.second} » appartiennent tous deux au groupe « ${couple.groupe} », qui est exclusif : un membre ne peut porter que l'un des deux. Retirez-en un, puis recommencez.`
}
```

- [ ] **Étape 2 : l'action**

Dans `src/app/membres/actions.ts`, **remplacer** l'en-tête d'imports et la fonction
`creerMembre`. **Ne toucher à rien d'autre du fichier** — `modifierMembre`,
`changerEtatMembre`, `archiverMembre` et `desarchiverMembre` restent **mot pour mot** ce
qu'ils sont.

Nouvel en-tête d'imports (remplace les lignes 1 à 16 actuelles) :

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import {
  FicheMembreInvalideError,
  ficheMembreDepuisFormData,
  ficheMembreVersColonnes,
  type EtatMembre,
} from '@/lib/domaine/membre'
import {
  StatutInvalideError,
  lignesStatutsDepuisFormData,
  statutsIncompatibles,
  type LigneStatutSaisie,
} from '@/lib/domaine/statut'
import { cheminArbre, disciplesDe } from '@/lib/donnees/arbre'
import { compteLieEstDernierAdministrateurActif } from '@/lib/donnees/comptes'
import { membreParId } from '@/lib/donnees/membres'
import { listerCatalogue } from '@/lib/donnees/statuts'
import { exigerAdministrateur } from '@/lib/securite/garde'
import { clientAdmin } from '@/lib/supabase/admin'
import {
  MESSAGE_DIRIGEANT_INCONNU,
  MESSAGE_FAISEUR_ARCHIVE,
  MESSAGE_FAISEUR_INCONNU,
  messageCycle,
} from './[id]/arbre/messages'
import { MESSAGE_STATUT_INCONNU } from './[id]/statuts/messages'
import {
  MESSAGE_ECHEC_ENREGISTREMENT,
  MESSAGE_FAISEUR_NON_ACTIF,
  MESSAGE_STATUTS_EXCLUSIFS_PASSERELLE,
  messageStatutsIncompatibles,
} from './messages'
```

**`MESSAGE_STATUT_EXCLUSIF` n'est PAS importé, et c'est délibéré.** Ce message est celui du
déclencheur `membre_statuts_exclusivite` (code `23514`), qui protège une attribution
**ultérieure** sur une fiche qui porte **déjà** un statut du groupe. Sur ce chemin-ci, il
ne peut pas se déclencher : la passerelle refuse le couple exclusif **avant toute
écriture**, et la fiche vient de naître sans aucun statut. L'importer obligerait à écrire
une branche `error.code === '23514'` — voir l'étape 2 pour pourquoi cette branche serait
**pire qu'inutile**.

`ficheMembreVersColonnes` **reste importée** : `modifierMembre` s'en sert toujours.
**Elle n'est en revanche PAS employée par la création**, et c'est délibéré : un appel `rpc`
prend des **paramètres nommés**, pas une carte de colonnes `snake_case`. Le §7 du design la
range parmi les fonctions « réutilisées telles quelles » ; elle l'est — **par
`modifierMembre`**, et l'écart est noté ici plutôt que masqué.

Conserver les trois constantes de marqueurs déjà présentes
(`DETAIL_DISCIPLES_A_REAFFECTER`, `DETAIL_FAISEUR_DE_DISCIPLE_ARCHIVE`,
`DETAIL_DERNIER_ADMINISTRATEUR`) et **ajouter juste en dessous** :

```ts
// Marqueurs RÉUTILISÉS, jamais réinventés — conséquence directe de D82 : la passerelle
// `creer_membre_enrichi` COMPOSE `public.definir_arbre` et `public.attribuer_statut`, donc
// elle rend LEURS marqueurs, avec LEUR sens. La phase 5 n'ajoute que DEUX marqueurs :
// `statuts_exclusifs_incompatibles` (posé par la passerelle elle-même) et
// `faiseur_de_disciple_inactif` (posé par `public.definir_arbre` et par le déclencheur
// `membres_faiseur_de_disciple_archive` quand le faiseur visé existe mais n'est ni actif
// ni archivé). Tous les autres sont préexistants.
const DETAIL_STATUTS_EXCLUSIFS_INCOMPATIBLES = 'statuts_exclusifs_incompatibles'
const DETAIL_MEMBRE_INCONNU = 'membre_inconnu'
const DETAIL_STATUT_INCONNU = 'statut_inconnu'
const DETAIL_FAISEUR_INCONNU = 'faiseur_inconnu'
// `DETAIL_FAISEUR_DE_DISCIPLE_ARCHIVE` existe DÉJÀ, juste au-dessus, et vaut
// 'faiseur_de_disciple_archive' : on la réutilise, on n'en déclare pas une seconde sous un
// autre nom. Celle-ci est son voisin, et le voisinage est le point : deux marqueurs, deux
// faits DIFFÉRENTS, deux messages différents — « archivé » et « pas actif » ne se
// remplacent pas l'un l'autre. Les confondre afficherait « ce faiseur est archivé » à
// propos d'une fiche en attente de validation.
const DETAIL_FAISEUR_NON_ACTIF = 'faiseur_de_disciple_inactif'
const DETAIL_DIRIGEANT_INCONNU = 'dirigeant_inconnu'
const DETAIL_CYCLE = 'cycle_faiseur_de_disciple'

function champOuNull(donnees: FormData, champ: string): string | null {
  const valeur = donnees.get(champ)
  return typeof valeur === 'string' && valeur.length > 0 ? valeur : null
}
```

Puis **remplacer intégralement** `creerMembre` par :

```ts
/**
 * Crée une fiche membre, la place dans l'arbre et lui attribue ses statuts — EN UNE SEULE
 * TRANSACTION (D81).
 *
 * REMPLACE `creerMembre` (D87) : un seul chemin d'écriture pour la création d'une fiche
 * par un administrateur. Deux chemins pour un même geste, c'est l'un des deux qui cesse
 * d'être exercé et qui dérive.
 *
 * ═══ LA GARANTIE TIENT TANT QUE L'APPEL RESTE UN UNIQUE `rpc`. ═══
 * Scinder un jour cet appel en deux ferait disparaître l'atomicité EN SILENCE : deux
 * transactions séparées, chacune capable de réussir sans l'autre, et rien dans le code ne
 * l'empêcherait mécaniquement. Même discipline que D65 (conversion d'un participant) et
 * que le §7.2 de la 2b.
 *
 * ═══ LE DIAGNOSTIC SE JOURNALISE ICI, ET NULLE PART AILLEURS. ═══
 * Postgres n'a pas de transaction autonome : AUCUNE trace écrite depuis l'intérieur de
 * `creer_membre_enrichi` ne survivrait à son échec. Le projet l'a déjà payé (D43, 2b) —
 * `consommer_token_inscription` insérait une tentative puis levait, l'exception annulait
 * toute la transaction, l'insertion comprise, et le plafond anti-force-brute était
 * ENTIÈREMENT INOPÉRANT. D'où le `console.error` systématique ci-dessous, avec `code`,
 * `details` et `message`.
 *
 * LES TROIS ENRICHISSEMENTS SONT FACULTATIFS ET INDÉPENDANTS (D86). Une création sans
 * aucun enrichissement produit EXACTEMENT ce que `creerMembre` produisait : fiche `actif`,
 * arbre nul, aucun statut, aucune ligne de journal. Un dirigeant sans faiseur de disciple
 * est légitime (§4.2 le prévoit) ; des statuts sans place dans l'arbre aussi.
 *
 * LE GARDE EST `exigerAdministrateur`, EN PREMIÈRE INSTRUCTION, ET IL NE DESCEND PAS À
 * `exigerAutoriteSur` MALGRÉ LES ÉCRITURES DE STATUTS (D90). La création est réservée à
 * l'administrateur (§5.2) et un administrateur a autorité partout : les deux gardes
 * coïncident ici. C'EST UNE COÏNCIDENCE, PAS UNE CONSTRUCTION — voir le
 * `comment on function` de la passerelle.
 */
export async function creerMembreEnrichi(
  _etat: EtatFormulaireMembre,
  donnees: FormData,
): Promise<EtatFormulaireMembre> {
  const profil = await exigerAdministrateur()

  let fiche
  let lignesStatuts: LigneStatutSaisie[]
  try {
    fiche = ficheMembreDepuisFormData(donnees)
    lignesStatuts = lignesStatutsDepuisFormData(donnees)
  } catch (erreur) {
    if (erreur instanceof FicheMembreInvalideError || erreur instanceof StatutInvalideError) {
      // Les deux portent déjà un message précis et actionnable : on le relaie tel quel.
      return { erreur: erreur.message }
    }
    console.error('creerMembreEnrichi : échec inattendu de la lecture du formulaire', { erreur })
    return { erreur: MESSAGE_ECHEC_ENREGISTREMENT }
  }

  // CONTRÔLE AMONT DU COUPLE EXCLUSIF (D84) : il EXPLIQUE, en nommant les deux statuts.
  // La passerelle PROTÈGE, en relisant les groupes EN BASE. Les deux existent, et aucun
  // ne remplace l'autre : `listerCatalogue` est non bornée, donc ce contrôle-ci peut être
  // trompé par une troncature — c'est précisément pourquoi `statutsIncompatibles` ÉCHOUE
  // FERMÉ sur un identifiant absent du catalogue qu'on lui donne, au lieu de conclure
  // « aucun conflit ».
  if (lignesStatuts.length > 0) {
    let catalogue
    try {
      // `listerCatalogue(true)` — INACTIFS COMPRIS, et ce n'est pas un détail.
      // `listerCatalogue()` filtre `actif === true`. Un statut RÉEL mais DÉSACTIVÉ,
      // soumis par un onglet resté ouvert ou par un appel forgé, serait alors absent du
      // catalogue passé à `statutsIncompatibles`, qui échoue fermé : l'utilisateur lirait
      // « un statut sélectionné est introuvable dans le catalogue » là où la vérité est
      // « ce statut a été désactivé ». La passerelle, elle, ne filtre pas sur `st.actif`
      // et laisse `attribuer_statut` refuser avec `statut_inconnu`, dont le message dit
      // « inconnu OU désactivé ». On donne donc ici le catalogue COMPLET, pour que le
      // contrôle amont ne s'arroge pas un refus qui appartient à la passerelle.
      catalogue = await listerCatalogue(true)
    } catch (erreur) {
      console.error('creerMembreEnrichi : lecture du catalogue impossible', { erreur })
      return { erreur: MESSAGE_ECHEC_ENREGISTREMENT }
    }
    try {
      const couple = statutsIncompatibles(
        lignesStatuts.map((ligne) => ligne.statutId),
        catalogue,
      )
      if (couple) {
        return { erreur: messageStatutsIncompatibles(couple) }
      }
    } catch (erreur) {
      if (erreur instanceof StatutInvalideError) {
        return { erreur: erreur.message }
      }
      console.error('creerMembreEnrichi : échec inattendu du contrôle d’exclusivité', { erreur })
      return { erreur: MESSAGE_ECHEC_ENREGISTREMENT }
    }
  }

  const faiseurId = champOuNull(donnees, 'faiseurDeDiscipleId')
  const dirigeantId = champOuNull(donnees, 'dirigeantId')
  const dirigeantForce = donnees.get('dirigeantForce') === '1'

  // UN SEUL `rpc`, ET TOUS LES ARGUMENTS SONT NOMMÉS — jamais positionnels : une
  // permutation silencieuse entre deux paramètres de même type (`p_ville` et `p_pays`,
  // par exemple) est indétectable autrement.
  const { data, error } = await clientAdmin().rpc('creer_membre_enrichi', {
    p_nom: fiche.nom,
    p_prenom: fiche.prenom,
    p_telephone: fiche.telephone,
    p_email_contact: fiche.emailContact,
    p_ville: fiche.ville,
    p_pays: fiche.pays,
    p_antenne_id: fiche.antenneId,
    p_situation: fiche.situation,
    p_domaine_etude: fiche.domaineEtude,
    p_report_initial_ael: fiche.reportInitialAel,
    p_faiseur_de_disciple: faiseurId,
    p_dirigeant: dirigeantId,
    p_dirigeant_force: dirigeantForce,
    p_statuts: lignesStatuts.map((ligne) => ({
      statut_id: ligne.statutId,
      date_acquisition: ligne.dateAcquisition,
      note: ligne.note,
    })),
    p_par: profil.id,
  })

  if (error) {
    // Trace serveur SYSTÉMATIQUE, y compris pour les cas classifiés ci-dessous : c'est la
    // SEULE trace qui subsistera, la transaction ayant tout annulé côté base.
    console.error('creerMembreEnrichi : échec RPC creer_membre_enrichi', {
      faiseurId,
      dirigeantId,
      dirigeantForce,
      nombreStatuts: lignesStatuts.length,
      code: error.code,
      details: error.details,
      message: error.message,
    })

    // On discrimine sur `error.details` et `error.code`, JAMAIS sur la prose française.
    if (error.details === DETAIL_STATUTS_EXCLUSIFS_INCOMPATIBLES) {
      return { erreur: MESSAGE_STATUTS_EXCLUSIFS_PASSERELLE }
    }
    if (error.details === DETAIL_FAISEUR_INCONNU) {
      return { erreur: MESSAGE_FAISEUR_INCONNU }
    }
    // Le nom exact de la constante existante est `DETAIL_FAISEUR_DE_DISCIPLE_ARCHIVE`
    // (déclarée plus haut dans ce même fichier depuis la 1c) : il n'y a PAS de
    // `DETAIL_FAISEUR_ARCHIVE` dans ce module, et l'écrire ainsi ne compilerait pas.
    if (error.details === DETAIL_FAISEUR_DE_DISCIPLE_ARCHIVE) {
      return { erreur: MESSAGE_FAISEUR_ARCHIVE }
    }
    // Faiseur de disciple qui existe mais n'est NI actif NI archivé. Message DISTINCT du
    // précédent : dire « est archivé » d'une fiche en attente de validation serait une
    // phrase que le code ne tient pas.
    if (error.details === DETAIL_FAISEUR_NON_ACTIF) {
      return { erreur: MESSAGE_FAISEUR_NON_ACTIF }
    }
    if (error.details === DETAIL_DIRIGEANT_INCONNU) {
      return { erreur: MESSAGE_DIRIGEANT_INCONNU }
    }
    if (error.details === DETAIL_STATUT_INCONNU) {
      return { erreur: MESSAGE_STATUT_INCONNU }
    }
    // ═══ AUCUNE BRANCHE SUR LE CODE 23514 ICI, ET C'EST DÉLIBÉRÉ ═══
    // Une telle branche afficherait « ce membre porte déjà un statut du groupe exclusif ».
    // Pour cette cause, elle est MORTE : la passerelle refuse le couple exclusif avant
    // toute écriture, et la fiche vient de naître sans aucun statut — le déclencheur
    // `membre_statuts_exclusivite` ne peut pas lever. Pour une AUTRE cause, elle est bien
    // vivante et NUISIBLE : contrairement à `/membres/[id]/statuts`, ce chemin écrit aussi
    // `public.membres`, porteuse de SIX contraintes `check` (`membres_nom_non_vide`,
    // `membres_prenom_non_vide`, `membres_report_positif`,
    // `membres_domaine_reserve_etudiant`, `membres_pas_son_propre_fdd`,
    // `membres_pas_son_propre_dirigeant`), toutes en 23514. L'utilisateur lirait un message
    // sur les statuts pour un problème de colonne de fiche. On retombe donc sur
    // MESSAGE_ECHEC_ENREGISTREMENT, et le code réel reste JOURNALISÉ ci-dessus, là où il
    // sert au diagnostic.
    if (error.details === DETAIL_CYCLE) {
      // INATTEIGNABLE PAR CONSTRUCTION sur ce chemin : la fiche vient d'être insérée dans
      // la même transaction, elle n'a aucun descendant, aucun cycle ne peut se refermer
      // sur elle. Traité quand même — et c'est la bonne direction : ce qui « ne peut pas
      // arriver » et arrive doit produire un message juste, pas un message générique.
      //
      // `cheminArbre` LÈVE sur un échec de lecture (elle ne rend jamais `[]` en silence).
      // On l'enveloppe donc : sur cette branche déjà anormale, laisser une seconde panne
      // remonter en exception ferait perdre le refus MÉTIER qu'on est en train de rendre —
      // or une action RETOURNE son refus, elle ne le lève pas. `messageCycle([])` a déjà
      // son texte de repli, sans le chemin. Aucun `redirect()` dans ce `try` : il n'y en a
      // pas dans cette fonction avant sa dernière instruction.
      let chemin: Awaited<ReturnType<typeof cheminArbre>> = []
      if (faiseurId) {
        try {
          chemin = await cheminArbre(faiseurId)
        } catch (erreurChemin) {
          console.error('creerMembreEnrichi : lecture du chemin fautif impossible', {
            faiseurId,
            erreur: erreurChemin,
          })
        }
      }
      return { erreur: messageCycle(chemin) }
    }
    if (error.details === DETAIL_MEMBRE_INCONNU) {
      // Même remarque : `definir_arbre` ne peut pas ne pas trouver la fiche que la même
      // transaction vient d'insérer. Rangé avec l'inattendu, sans message propre.
      return { erreur: MESSAGE_ECHEC_ENREGISTREMENT }
    }
    return { erreur: MESSAGE_ECHEC_ENREGISTREMENT }
  }

  // `returns uuid` : supabase-js rend la valeur scalaire directement. Contrôle de forme et
  // non décoration — `rpc()` rend `any` faute de types `Database` générés, et un jour où
  // la signature changerait, `redirect(`/membres/undefined`)` mènerait à une page 404 en
  // annonçant un succès.
  const identifiant = typeof data === 'string' && data.length > 0 ? data : null
  if (!identifiant) {
    console.error('creerMembreEnrichi : identifiant absent de la réponse', { data })
    return { erreur: MESSAGE_ECHEC_ENREGISTREMENT }
  }

  revalidatePath('/membres')
  // PAS dans un `try` : `redirect()` lève une exception de contrôle Next.js, et c'est la
  // DERNIÈRE instruction. Vers la FICHE et non vers l'annuaire : on vient d'enrichir cette
  // personne, c'est son écran qui montre ce qui a été écrit.
  redirect(`/membres/${identifiant}`)
}
```

- [ ] **Étape 3 : vérifier qu'aucun appelant de `creerMembre` ne subsiste**

```bash
grep -rn "creerMembre\b" src/app --include=*.ts --include=*.tsx
```

**Attendu, À CE STADE : exactement DEUX lignes, toutes deux dans
`src/app/membres/nouveau/page.tsx`** — son `import` et son usage dans le JSX.
`src/app/membres/actions.ts` ne doit **plus** en porter aucune : l'étape 2 a **remplacé**
la fonction, elle ne l'a pas doublée (D87). **S'il en reste une dans `actions.ts`, le
remplacement de l'étape 2 est incomplet** — c'est le premier endroit à relire.
**Attendu APRÈS la Task 4 : aucune ligne.** Consigner le nombre réel des deux côtés.

`creerMembreEnrichi` n'est **pas** capturé : `\b` après `creerMembre` exige un caractère
non-mot, et `E` n'en est pas un.

## ⚠️ LE BALAYAGE PORTE SUR `src/app`, ET PAS SUR `src/` NI SUR `tests/`. NE PAS L'ÉLARGIR.

Élargi à `src/ tests/`, il rend **une soixantaine** de lignes qui ne sont **pas** des
appelants :

- **`tests/`** contient de nombreuses fonctions locales `creerMembre` — des **helpers de
  préparation homonymes**, définis dans chaque suite (`tests/e2e/arbre.spec.ts`,
  `tests/e2e/autorite.spec.ts`, `tests/e2e/ael-preuves.spec.ts`, `tests/rls/arbre.test.ts`,
  et d'autres). Ils insèrent une ligne dans `membres` par la clé de service et n'ont
  **aucun rapport** avec la Server Action. **Ne pas y toucher :** les supprimer casserait
  des suites qui n'ont rien à voir avec cette phase.
- **`src/lib/securite/garde.ts`** cite `creerMembre` **dans un commentaire de prose**, qui
  énumère les écritures ne passant pas par `exigerAutoriteSur`. Ce n'est pas un appelant —
  mais c'est un commentaire qui nommera bientôt une fonction qui n'existe plus.
  **Le corriger ici, et seulement lui** : dans le commentaire de tête d'`exigerAutoriteSur`,
  remplacer le mot `creerMembre` par `creerMembreEnrichi`. **Aucune ligne exécutable de ce
  fichier ne change**, et le fichier rejoint le commit de la Task 4.

**CONTRÔLE POSITIF DU BALAYAGE** — sans lui, une commande mal formée rendrait « aucune
occurrence » pour toujours :

```bash
grep -rn "creerMembreEnrichi" src/app/membres/actions.ts
```

**Attendu : au moins une ligne.** Si celle-ci ne rend rien non plus, c'est le balayage qui
est cassé, pas le code.

- [ ] **Étape 4 : les portes rapides**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls
```

`tsc` **doit** signaler `src/app/membres/nouveau/page.tsx`, qui importe encore
`creerMembre`. **C'est attendu** : la Task 4 le corrige. **Ne pas commiter tant que `tsc`
est rouge** — Tasks 3 et 4 forment un seul commit, fait à la fin de la Task 4.

**Ce qu'il faut vérifier exactement : TOUTES les erreurs portent sur ce SEUL fichier.** Un
même import disparu peut en produire plusieurs dans le même fichier (l'`import`, puis
chaque usage) — le nombre n'est donc pas le critère. Le critère est le **jeu de fichiers en
erreur**, qui doit être réduit à `src/app/membres/nouveau/page.tsx`. **Toute erreur dans un
AUTRE fichier est un défaut de cette tâche**, à corriger avant d'aller plus loin : c'est
ainsi qu'on découvre une constante mal nommée ou un import oublié, plutôt qu'en la
découvrant deux tâches plus tard.

**Preuve produite :** la sortie du balayage et de son contrôle positif ; la sortie de `tsc`
**intégrale**, montrant que le seul fichier en erreur est `nouveau/page.tsx`.

**Livrable indépendamment éprouvable :** la Task 4 le rend compilable ; le contrat de
cette tâche est la **signature** et la **table de classification des erreurs**, que la
Task 6 éprouve marqueur par marqueur.

---

### Task 4 : le formulaire de création enrichie, ENTIÈREMENT contrôlé (D85, D88)

**Fichiers :**
- Modifier : `src/app/membres/formulaire-membre.tsx`
- Créer : `src/app/membres/nouveau/bloc-enrichissement.tsx`
- Modifier : `src/app/membres/nouveau/page.tsx`
- Modifier : `tests/e2e/annuaire.spec.ts`

**Interfaces :**
- Consomme : `creerMembreEnrichi`, `EtatFormulaireMembre` (Task 3) ; `LigneStatutSaisie`
  (Task 2) ; `SelecteurMembre` et `proposerDirigeant` (existants, 1c, **réutilisés sans une
  ligne modifiée**) ; `listerCatalogue`, `GroupeStatut` (existants) ; `listerAntennes`,
  `Antenne` (existants).
- Produit : `FormulaireMembre` **entièrement contrôlé**, avec une prop `children`
  optionnelle rendue dans le `<form>` juste avant la zone d'erreur ; et
  `BlocEnrichissement`, composant client portant les statuts, le faiseur de disciple et le
  dirigeant.

## ⚠️ CE FORMULAIRE EST LE PIRE CAS DU DÉPÔT SI RIEN N'EST FAIT. LIRE AVANT D'ÉCRIRE UNE LIGNE.

**React réinitialise les champs NON CONTRÔLÉS d'un `<form action>` à TOUTE complétion — y
compris sur un refus RETOURNÉ.** `membres/formulaire-membre.tsx` est aujourd'hui le
**deuxième pire cas du dépôt**, avec **9 champs libres** sur les quatorze composants
recensés au README, et cette tâche lui ajoute les statuts, le faiseur de disciple et le
dirigeant.

**Ce qui rend le piège perfide : c'est la BONNE PRATIQUE du projet qui le déclenche.** La
règle « une action **retourne** son refus, elle ne le lève pas » — posée pour que le
message survive au build de production — est exactement ce qui fait passer l'action par le
chemin « complétion normale », donc par la remise à zéro. Une action qui **lève** ne vide
rien : elle part dans la limite d'erreur.

Couplé à D81, ce serait **le pire assemblage possible** : la transaction est annulée **et**
la saisie disparaît. Réciproquement, **l'atomicité ne coûte rien PARCE QUE les champs sont
contrôlés** — les deux décisions se tiennent mutuellement debout, et aucune des deux n'est
bonne seule.

**Donc : `value={…}` + `onChange` sur TOUS les champs, sans exception, y compris ceux qui
l'étaient déjà** (`situation` l'est) **et ceux que cette tâche ajoute.** Aucun
`defaultValue` ne doit subsister dans `formulaire-membre.tsx` à la fin de cette tâche.

**`SelecteurMembre` est DÉJÀ contrôlé** — il porte `value={valeur?.id ?? ''}` sur son champ
caché et tient sa saisie dans un `useState`. C'est le bon motif, et il existait dans le
dépôt avant qu'on nomme le défaut. **Ne pas le modifier.**

- [ ] **Étape 1 : rendre `FormulaireMembre` entièrement contrôlé**

Remplacer intégralement `src/app/membres/formulaire-membre.tsx` :

```tsx
'use client'

import { useActionState, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import type { Antenne } from '@/lib/donnees/antennes'
import type { MembreDetail } from '@/lib/donnees/membres'
import type { EtatFormulaireMembre } from './actions'

const etatInitial: EtatFormulaireMembre = { erreur: null }

type Props = {
  action: (etat: EtatFormulaireMembre, donnees: FormData) => Promise<EtatFormulaireMembre>
  antennes: Antenne[]
  membre?: MembreDetail
  libelleBouton: string
  /**
   * Bloc d'enrichissement rendu DANS le même `<form>`, juste avant la zone d'erreur.
   *
   * Une prop plutôt qu'une variante interne : l'enrichissement ne remonte PAS dans
   * `/membres/[id]/modifier` (D89). Porter les statuts dans l'écran de modification
   * exigerait d'y exprimer le RETRAIT, que la création n'a jamais à connaître ; et y
   * porter l'arbre mélangerait deux gardes différents sur un même écran —
   * `exigerAutoriteSur` pour les statuts, `exigerAdministrateur` pour l'arbre.
   */
  children?: ReactNode
}

export function FormulaireMembre({
  action,
  antennes,
  membre,
  libelleBouton,
  children,
}: Props) {
  const [etat, envoyer, enCours] = useActionState(action, etatInitial)

  /*
    ═══ TOUS LES CHAMPS SONT CONTRÔLÉS (D85). AUCUN `defaultValue` ICI. ═══

    React réinitialise les champs NON CONTRÔLÉS d'un `<form action>` à TOUTE complétion de
    l'action, Y COMPRIS sur un refus RETOURNÉ. L'utilisateur lisait alors son message
    d'erreur au-dessus d'un formulaire VIDE, et devait tout retaper — neuf champs ici,
    plus les enrichissements de la phase 5. C'est la BONNE PRATIQUE du projet qui
    déclenchait le piège : une action qui RETOURNE son refus passe par le chemin
    « complétion normale », donc par la remise à zéro ; une action qui LÈVE ne vide rien,
    mais perd son message en build de production.

    Un état par champ, et non un objet unique : c'est la forme employée par les cinq
    formulaires corrigés en phase 4, et elle évite qu'une frappe recrée l'objet entier.
  */
  const [prenom, setPrenom] = useState(membre?.prenom ?? '')
  const [nom, setNom] = useState(membre?.nom ?? '')
  const [telephone, setTelephone] = useState(membre?.telephone ?? '')
  const [emailContact, setEmailContact] = useState(membre?.emailContact ?? '')
  const [ville, setVille] = useState(membre?.ville ?? '')
  const [pays, setPays] = useState(membre?.pays ?? '')
  const [antenneId, setAntenneId] = useState(membre?.antenneId ?? '')
  const [situation, setSituation] = useState<string>(membre?.situation ?? '')
  const [domaineEtude, setDomaineEtude] = useState(membre?.domaineEtude ?? '')
  const [reportInitialAel, setReportInitialAel] = useState(
    String(membre?.reportInitialAel ?? 0),
  )

  // Voir la règle d'association posée en tête de
  // `src/app/membres/[id]/statuts/formulaire-statut.tsx` : un texte d'aide laissé DANS le
  // <label> est concaténé au nom accessible du champ. Seul « AEL déjà suivis » en porte un
  // ici ; les autres champs gardent le <label> enveloppant, qui leur donne déjà un nom
  // correct.
  const idAel = useId()

  const zoneErreur = useRef<HTMLParagraphElement | null>(null)

  /*
    ═══ POURQUOI CE `useRef` FERME LA COURSE AU MONTAGE PAR CONSTRUCTION ═══

    `enCoursPrecedent` est initialisé avec la valeur du PREMIER rendu, nécessairement
    `false`. La passe de montage ne peut donc JAMAIS satisfaire
    `enCoursPrecedent.current && !enCours`, quel que soit le timing : la condition exige
    une transition `true -> false`, c'est-à-dire une VRAIE soumission terminée. Tester
    `etat.erreur !== null` seul ne suffirait pas — l'effet se déclencherait dès le montage
    si un état d'erreur préexistait.

    Ce que l'effet fait ici : porter le FOCUS sur le message de refus. Sur un formulaire
    aussi long, le message s'affiche largement sous la ligne de flottaison, et un
    utilisateur qui vient de cliquer « Créer la fiche » ne voit rien se passer. C'est le
    seul geste qui a un consommateur réel ici : AUCUNE remise à zéro n'est faite au
    succès, parce qu'il n'y en a pas — l'action REDIRIGE. Si un jour cette redirection
    disparaissait et qu'on voulait vider le formulaire, c'est EXACTEMENT ce garde qu'il
    faudrait réutiliser, avec `etat.erreur === null` à la place.
  */
  const enCoursPrecedent = useRef(enCours)
  useEffect(() => {
    if (enCoursPrecedent.current && !enCours && etat.erreur !== null) {
      zoneErreur.current?.focus()
    }
    enCoursPrecedent.current = enCours
  }, [enCours, etat])

  // L'antenne actuelle du membre doit figurer dans la liste même si elle a été désactivée
  // depuis. Sans cela, sa valeur n'existerait pas parmi les options : le navigateur
  // retomberait sur « Non rattaché » et le simple fait d'enregistrer une autre
  // modification détacherait le membre de son antenne, sans que personne ne l'ait demandé
  // ni vu.
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
          <span className="text-sm font-medium">Prénom (obligatoire)</span>
          <input
            name="prenom"
            value={prenom}
            onChange={(evenement) => setPrenom(evenement.target.value)}
            required
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Nom (obligatoire)</span>
          <input
            name="nom"
            value={nom}
            onChange={(evenement) => setNom(evenement.target.value)}
            required
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Téléphone</span>
          <input
            name="telephone"
            type="tel"
            value={telephone}
            onChange={(evenement) => setTelephone(evenement.target.value)}
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Adresse de contact</span>
          <input
            name="emailContact"
            type="email"
            value={emailContact}
            onChange={(evenement) => setEmailContact(evenement.target.value)}
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Ville</span>
          <input
            name="ville"
            value={ville}
            onChange={(evenement) => setVille(evenement.target.value)}
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Pays</span>
          <input
            name="pays"
            value={pays}
            onChange={(evenement) => setPays(evenement.target.value)}
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Antenne</span>
          <select
            name="antenneId"
            value={antenneId}
            onChange={(evenement) => setAntenneId(evenement.target.value)}
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
            value={situation}
            onChange={(evenement) => setSituation(evenement.target.value)}
            className="rounded-md border border-neutral-300 px-3 py-2"
          >
            <option value="">Non renseignée</option>
            <option value="etudiant">Étudiant</option>
            <option value="travailleur">Travailleur</option>
            <option value="autre">Autre</option>
          </select>
        </label>
        {/*
          Le champ n'existe que pour un étudiant, au lieu d'être saisissable puis effacé en
          silence à l'enregistrement. Empêcher vaut mieux qu'avertir : un texte d'aide sous
          un champ ne se lit pas au moment où l'on bascule la situation, et la saisie
          disparaîtrait sans que personne ne le voie.

          La VALEUR, elle, survit au démontage du champ : elle vit dans `domaineEtude`, à
          côté et non dedans. Repasser « Travailleur » puis « Étudiant » retrouve donc la
          saisie. Ce que la fiche ENREGISTRE reste décidé par `normaliserFicheMembre`, qui
          met `domaine_etude` à `null` hors situation étudiante.
        */}
        {situation === 'etudiant' ? (
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Domaine d&apos;étude</span>
            <input
              name="domaineEtude"
              value={domaineEtude}
              onChange={(evenement) => setDomaineEtude(evenement.target.value)}
              className="rounded-md border border-neutral-300 px-3 py-2"
            />
          </label>
        ) : null}
        <div className="flex flex-col gap-1.5">
          <label htmlFor={idAel} className="text-sm font-medium">
            AEL déjà suivis
          </label>
          <input
            id={idAel}
            name="reportInitialAel"
            type="number"
            min={0}
            step={1}
            value={reportInitialAel}
            onChange={(evenement) => setReportInitialAel(evenement.target.value)}
            aria-describedby={`${idAel}-aide`}
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
          <span id={`${idAel}-aide`} className="text-xs text-neutral-500">
            Avant la mise en service de l&apos;application.
          </span>
        </div>
      </div>

      {children}

      {etat.erreur ? (
        <p
          ref={zoneErreur}
          tabIndex={-1}
          role="alert"
          className="text-sm text-red-600 outline-none"
        >
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

- [ ] **Étape 2 : le bloc d'enrichissement**

Créer `src/app/membres/nouveau/bloc-enrichissement.tsx` :

```tsx
'use client'

import { useId, useRef, useState, useTransition } from 'react'
import { proposerDirigeant } from '@/app/membres/[id]/arbre/actions'
import { SelecteurMembre } from '@/app/membres/selecteur-membre'
import type { MembreBref } from '@/lib/donnees/membres'
import type { GroupeStatut } from '@/lib/donnees/statuts'

/**
 * Les trois enrichissements de la création (D86) : les statuts, le faiseur de disciple et
 * le dirigeant. TOUS FACULTATIFS ET INDÉPENDANTS LES UNS DES AUTRES — un dirigeant sans
 * faiseur de disciple est légitime (§4.2 le prévoit), des statuts sans place dans l'arbre
 * aussi, et une création sans aucun des trois produit exactement ce que l'ancienne
 * `creerMembre` produisait.
 *
 * ═══ TOUT CE COMPOSANT EST CONTRÔLÉ (D85). ═══
 * Chaque champ tire sa valeur d'un `useState` de ce composant, y compris les champs
 * cachés. La saisie survit donc à un refus RETOURNÉ par l'action : ce composant n'est pas
 * remonté, seul le `<form>` parent est re-rendu.
 *
 * LES STATUTS NE SONT PAS DES CASES POUR TOUT LE CATALOGUE. Le motif est celui de
 * `FormulaireStatut` — un choix dans un `<select>` GROUPÉ PAR GROUPE, avec sa date et sa
 * note — répété à la demande, la liste des lignes vivant dans l'état de ce composant.
 * Contrôlé par construction, et cohérent avec l'écran de gestion des statuts que
 * l'utilisateur retrouvera ensuite.
 *
 * TROIS CHAMPS RÉPÉTÉS, ALIGNÉS PAR INDICE : `statutId`, `statutDateAcquisition`,
 * `statutNote`. `lignesStatutsDepuisFormData` (couche domaine) les relit par `getAll` et
 * REFUSE tout décalage entre les trois longueurs — ce contrôle est la seule chose qui
 * distingue « ce composant a changé » d'un décalage silencieux qui associerait la date
 * d'une ligne au statut d'une autre. NE JAMAIS rendre une ligne partielle.
 */

type Props = {
  groupes: GroupeStatut[]
}

type LigneStatut = {
  cle: string
  statutId: string
  dateAcquisition: string
  note: string
}

function nomComplet(membre: MembreBref | null): string {
  return membre ? `${membre.prenom} ${membre.nom}` : 'aucun'
}

export function BlocEnrichissement({ groupes }: Props) {
  const prefixe = useId()
  const aujourdhui = new Date().toISOString().slice(0, 10)

  const [lignes, setLignes] = useState<LigneStatut[]>([])
  const [faiseur, setFaiseur] = useState<MembreBref | null>(null)
  const [dirigeant, setDirigeant] = useState<MembreBref | null>(null)
  const [force, setForce] = useState(false)
  const [proposition, setProposition] = useState<MembreBref | null>(null)
  const [calculEnCours, demarrerCalcul] = useTransition()

  // Miroir SYNCHRONE de `force`, lu par le rappel asynchrone de `changerFaiseur` : lire
  // l'état React `force` directement y capturerait sa valeur au moment où la fermeture a
  // été créée, pas sa valeur au moment où la réponse arrive. Un choix manuel pendant
  // l'aller-retour réseau serait alors écrasé par la proposition. Motif repris tel quel de
  // `src/app/membres/[id]/arbre/formulaire-arbre.tsx`, où il a été établi en revue.
  const forceRef = useRef(false)

  // Numéro du dernier événement qui fait autorité sur `dirigeant` / `proposition`. Un
  // changement de faiseur en démarre un, mais une intervention manuelle sur le dirigeant
  // en démarre un aussi, alors qu'elle n'appelle pas `proposerDirigeant`. Même parade que
  // `dernierAppel` dans `SelecteurMembre` : un rappel asynchrone n'applique son résultat
  // que s'il porte encore le numéro courant. Referme d'un seul mécanisme le cas où deux
  // changements de faiseur rapprochés répondent dans le désordre.
  const sequence = useRef(0)

  /**
   * D88 — LE DIRIGEANT EST PROPOSÉ À LA CRÉATION, à chaque changement de faiseur de
   * disciple, en réutilisant `proposerDirigeant` (1c) TELLE QUELLE.
   *
   * Le §4.2 de la spécification maîtresse le promet depuis le 2026-08-11 : « Elle est
   * proposée à la création d'un membre et à chaque changement de faiseur de disciple. » La
   * 1c n'avait livré que la seconde moitié, faute d'un faiseur de disciple saisissable à
   * la création. Cette phase n'invente donc rien : elle HONORE une phrase qui était fausse
   * depuis quatre phases.
   */
  function changerFaiseur(membre: MembreBref | null) {
    setFaiseur(membre)
    const numero = ++sequence.current
    demarrerCalcul(async () => {
      const propose = await proposerDirigeant(membre?.id ?? null)
      if (numero !== sequence.current) {
        // Réponse périmée : un événement plus récent a eu lieu entretemps. L'appliquer
        // quand même écraserait cet événement plus récent.
        return
      }
      setProposition(propose)
      // La proposition ne s'impose PAS à un dirigeant défini à la main.
      // `forceRef.current`, pas `force` : voir le commentaire sur `forceRef` plus haut.
      if (!forceRef.current) {
        setDirigeant(propose)
      }
    })
  }

  function changerDirigeant(membre: MembreBref | null) {
    sequence.current += 1
    setDirigeant(membre)
    // Toucher soi-même à ce champ, c'est forcer.
    forceRef.current = true
    setForce(true)
  }

  function revenirAuCalcul() {
    sequence.current += 1
    setDirigeant(proposition)
    forceRef.current = false
    setForce(false)
  }

  const proposeDiffere = (dirigeant?.id ?? null) !== (proposition?.id ?? null)

  function mentionDirigeant(): string {
    if (force) {
      return 'Défini manuellement.'
    }
    if (!faiseur) {
      // Techniquement vrai mais trompeur : calculer à partir de rien ne « calcule » rien.
      return "Aucun dirigeant n'est proposé, faute de faiseur de disciple."
    }
    if (!proposeDiffere) {
      return 'Calculé à partir du faiseur de disciple.'
    }
    return `La proposition a changé : ${nomComplet(proposition)}.`
  }

  function ajouterLigne() {
    setLignes((precedentes) => [
      ...precedentes,
      { cle: crypto.randomUUID(), statutId: '', dateAcquisition: '', note: '' },
    ])
  }

  function modifierLigne(cle: string, champs: Partial<Omit<LigneStatut, 'cle'>>) {
    setLignes((precedentes) =>
      precedentes.map((ligne) => (ligne.cle === cle ? { ...ligne, ...champs } : ligne)),
    )
  }

  function retirerLigne(cle: string) {
    setLignes((precedentes) => precedentes.filter((ligne) => ligne.cle !== cle))
  }

  return (
    <div className="flex flex-col gap-8 border-t border-neutral-200 pt-6">
      <p className="text-sm text-neutral-500">
        Les trois sections ci-dessous sont facultatives et indépendantes. Elles sont
        enregistrées <strong>en même temps</strong> que la fiche : si l&apos;une est
        refusée, rien n&apos;est créé et votre saisie reste à l&apos;écran.
      </p>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium">Statuts</h2>
        {lignes.length === 0 ? (
          <p className="text-sm text-neutral-600">Aucun statut à attribuer.</p>
        ) : null}

        {lignes.map((ligne, indice) => {
          const idStatut = `${prefixe}-statut-${ligne.cle}`
          const idDate = `${prefixe}-date-${ligne.cle}`
          const idNote = `${prefixe}-note-${ligne.cle}`
          return (
            <fieldset
              key={ligne.cle}
              className="flex flex-col gap-3 rounded-md border border-neutral-300 p-4"
            >
              <legend className="px-1 text-sm font-medium">Statut {indice + 1}</legend>

              <div className="flex flex-col gap-1.5">
                <label htmlFor={idStatut} className="text-sm font-medium">
                  Statut
                </label>
                <select
                  id={idStatut}
                  name="statutId"
                  value={ligne.statutId}
                  onChange={(evenement) =>
                    modifierLigne(ligne.cle, { statutId: evenement.target.value })
                  }
                  required
                  className="rounded-md border border-neutral-300 px-3 py-2"
                >
                  <option value="" disabled>
                    Choisir un statut…
                  </option>
                  {groupes.map((groupe) => (
                    <optgroup
                      key={groupe.id}
                      label={groupe.exclusif ? `${groupe.nom} (un seul à la fois)` : groupe.nom}
                    >
                      {groupe.statuts.map((statut) => (
                        <option key={statut.id} value={statut.id}>
                          {statut.libelle}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              {/*
                RÈGLE D'ASSOCIATION DES LIBELLÉS, posée en tête de
                `src/app/membres/[id]/statuts/formulaire-statut.tsx` et vérifiée dans un
                vrai navigateur : un texte d'aide laissé DANS le <label> est CONCATÉNÉ au
                nom accessible du champ. Champ AVEC aide => `htmlFor` explicite et l'aide
                sortie du label, rattachée par `aria-describedby`.
              */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor={idDate} className="text-sm font-medium">
                  Date d&apos;acquisition
                </label>
                <input
                  id={idDate}
                  name="statutDateAcquisition"
                  type="date"
                  max={aujourdhui}
                  value={ligne.dateAcquisition}
                  onChange={(evenement) =>
                    modifierLigne(ligne.cle, { dateAcquisition: evenement.target.value })
                  }
                  aria-describedby={`${idDate}-aide`}
                  className="rounded-md border border-neutral-300 px-3 py-2"
                />
                <span id={`${idDate}-aide`} className="text-xs text-neutral-500">
                  Facultative. Elle n&apos;est pas toujours connue.
                </span>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor={idNote} className="text-sm font-medium">
                  Note
                </label>
                <input
                  id={idNote}
                  name="statutNote"
                  maxLength={500}
                  value={ligne.note}
                  onChange={(evenement) => modifierLigne(ligne.cle, { note: evenement.target.value })}
                  className="rounded-md border border-neutral-300 px-3 py-2"
                />
              </div>

              <button
                type="button"
                onClick={() => retirerLigne(ligne.cle)}
                className="self-start text-sm underline underline-offset-4"
              >
                Retirer ce statut
              </button>
            </fieldset>
          )
        })}

        <button
          type="button"
          onClick={ajouterLigne}
          className="self-start rounded-md border border-neutral-300 px-4 py-2 text-sm"
        >
          Ajouter un statut
        </button>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium">Place dans l&apos;arbre</h2>

        {/* Champ caché CONTRÔLÉ : sa valeur vient de l'état, jamais du DOM. */}
        <input type="hidden" name="dirigeantForce" value={force ? '1' : '0'} />

        <SelecteurMembre
          nom="faiseurDeDiscipleId"
          label="Faiseur de disciple"
          aide="Facultatif. Laisser vide fait de ce membre une racine de l'arbre."
          valeur={faiseur}
          surChoix={changerFaiseur}
          // La fiche n'existe pas encore : il n'y a AUCUN identifiant à exclure. Ce n'est
          // pas un oubli — l'exclusion de `/membres/[id]/arbre` sert à empêcher qu'un
          // membre soit son propre faiseur de disciple, cas impossible ici.
          exclureId={null}
        />

        <div className="flex flex-col gap-1.5">
          <SelecteurMembre
            nom="dirigeantId"
            label="Dirigeant"
            aide="Facultatif. Proposé à partir du faiseur de disciple. Vous pouvez en choisir un autre."
            valeur={dirigeant}
            surChoix={changerDirigeant}
            exclureId={null}
          />
          <p className="text-xs text-neutral-500">
            {calculEnCours ? 'Calcul de la proposition…' : mentionDirigeant()}
            {!calculEnCours && (force || proposeDiffere) ? (
              <>
                {' '}
                <button
                  type="button"
                  onClick={revenirAuCalcul}
                  className="underline underline-offset-4"
                >
                  Revenir au dirigeant calculé
                </button>
                {` (${nomComplet(proposition)})`}
              </>
            ) : null}
          </p>
        </div>
      </section>
    </div>
  )
}
```

- [ ] **Étape 3 : la page**

Remplacer intégralement `src/app/membres/nouveau/page.tsx` :

```tsx
import Link from 'next/link'
import { listerAntennes } from '@/lib/donnees/antennes'
import { listerCatalogue } from '@/lib/donnees/statuts'
import { exigerAdministrateur } from '@/lib/securite/garde'
import { creerMembreEnrichi } from '../actions'
import { FormulaireMembre } from '../formulaire-membre'
import { BlocEnrichissement } from './bloc-enrichissement'

export default async function PageNouveauMembre() {
  // Écran d'administration : le garde est la PREMIÈRE instruction, avant toute lecture
  // (D90). Il ne descend PAS à `exigerAutoriteSur` malgré les écritures de statuts que
  // l'action déclenchera : la création d'une fiche est réservée à l'administrateur (§5.2),
  // et un administrateur a autorité partout — les deux coïncident ici.
  await exigerAdministrateur()

  const [antennes, groupes] = await Promise.all([listerAntennes(), listerCatalogue()])

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/membres" className="text-sm underline underline-offset-4">
        Retour à l&apos;annuaire
      </Link>
      <h1 className="mt-4 mb-2 text-2xl font-semibold">Nouveau membre</h1>
      <p className="mb-8 text-sm text-neutral-500">
        La fiche, ses statuts et sa place dans l&apos;arbre sont enregistrés en une seule
        fois. Les trois enrichissements sont facultatifs.
      </p>
      <FormulaireMembre
        action={creerMembreEnrichi}
        antennes={antennes}
        libelleBouton="Créer la fiche"
      >
        <BlocEnrichissement groupes={groupes} />
      </FormulaireMembre>
    </main>
  )
}
```

- [ ] **Étape 4 : mettre à jour `tests/e2e/annuaire.spec.ts` — LA REDIRECTION A CHANGÉ**

`creerMembre` redirigeait vers `/membres` ; `creerMembreEnrichi` redirige vers
`/membres/<id>` (piège n°3 du design). Le test
`un administrateur crée une fiche et la retrouve dans l'annuaire` enchaîne aujourd'hui, sur
la page atteinte après création, un `getByLabel('Rechercher')` qui **n'existe que sur
l'annuaire** : il tomberait, et **son échec ne dirait pas pourquoi**.

Dans `tests/e2e/annuaire.spec.ts`, remplacer le bloc qui suit le clic sur
`Créer la fiche` — depuis `await expect(page).toHaveURL(/\/membres/)` jusqu'à la ligne
`await expect(page.getByText(`Jérôme ${NOM_MEMBRE}`)).toBeVisible()` **incluse** — par :

```ts
  // La création REDIRIGE désormais vers la FICHE (phase 5) et non vers l'annuaire : on
  // vient d'enrichir cette personne, c'est son écran qui montre ce qui a été écrit.
  // L'assertion porte sur le TITRE de la fiche — un `getByText` du seul nom serait aussi
  // satisfait par une ligne d'annuaire, et ne distinguerait donc pas les deux écrans.
  await expect(page).toHaveURL(/\/membres\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { name: `Jérôme ${NOM_MEMBRE}` })).toBeVisible()

  // Puis l'annuaire, pour la suite du test : c'est lui qui porte la recherche.
  await page.goto('/membres')
  await expect(page.getByText(`Jérôme ${NOM_MEMBRE}`)).toBeVisible()
```

**Ne rien changer d'autre dans ce fichier.**

- [ ] **Étape 5 : les portes rapides, puis les portes de fin de lot partielles**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls
```

Puis, **parce que cette tâche touche des messages affichés et la structure d'un
formulaire** :

```bash
npm run test:e2e
```

Si `annuaire.spec.ts` reste rouge, **la cause est dans l'étape 4** : relire l'assertion, ne
pas toucher au code de production pour faire passer un test.

- [ ] **Étape 6 : commit (Tasks 3 et 4 ensemble)**

```bash
git add src/app/membres/messages.ts src/app/membres/actions.ts src/lib/securite/garde.ts \
  src/app/membres/formulaire-membre.tsx src/app/membres/nouveau/bloc-enrichissement.tsx \
  src/app/membres/nouveau/page.tsx tests/e2e/annuaire.spec.ts
git commit -m "feat: création enrichie d'un membre en une transaction, formulaire entièrement contrôlé (D85 à D88, D90)"
```

**Preuves produites :** la sortie de `npm run test:e2e` verte ; et, à la main dans un
navigateur, le constat que **remplir tous les champs, ajouter deux statuts d'un même groupe
exclusif et soumettre** affiche le message nommant les deux statuts **avec tous les champs
encore remplis** — la Task 8 en fera la preuve rejouable contre un build de production.

**Livrable indépendamment éprouvable :** l'écran `/membres/nouveau` crée une fiche
enrichie en une soumission, et un refus n'efface plus rien.

---

### Task 5 : le formulaire PUBLIC d'inscription, rendu contrôlé — LE PIRE CAS DÉPLOYÉ

**Fichiers :**
- Modifier : `src/app/inscription/formulaire-inscription.tsx`
- Modifier : `tests/e2e/inscription.spec.ts` (**trois lignes**, étape 3)

**Interfaces :**
- Consomme : `sInscrire`, `EtatInscription`, `LONGUEUR_MDP_MINIMALE`, `Antenne` — tous
  existants, **aucun modifié**.
- Produit : le même composant, avec **huit champs contrôlés** au lieu de huit champs
  libres. **Aucun changement de nom de champ, aucun changement d'action, aucun changement
  de message.** La Server Action `sInscrire` n'est **pas touchée**.

## ⚠️ POURQUOI CETTE TÂCHE EST DANS CETTE PHASE ALORS QUE LE DESIGN NE LA PRÉVOIT PAS

Le §14 du design écrit noir sur blanc : « **Aucune correction des treize autres
formulaires à champs libres, ni du cas public, qui est le pire des quatorze et qui est en
production.** » **Arbitrage pris en amont de ce plan : cette exclusion est levée pour le
seul cas public.**

Ce que le README dit de ce fichier : **écran PUBLIC, 8 champs, aucun rattrapage.** Une
personne saisit son identité, son contact, son antenne, **se trompe de code**, et perd
tout. Elle n'a par ailleurs **aucun moyen de comprendre son erreur** — le §7 impose à cet
écran un message indifférencié (D30), qui ne révèle jamais qu'un code existe. La
conjonction des deux est le pire cas du dépôt : le seul écran ouvert à des gens qui ne
connaissent pas l'application, le seul où l'on ne peut pas expliquer, et celui qui efface
le plus.

Le remède est **exactement** celui de la Task 4, il est éprouvé, et la tâche est courte.

**NE PAS ÉLARGIR.** Les douze autres composants du tableau du README restent **hors
périmètre** et sont traités en **phase 6**. Cette tâche ne touche **qu'un** fichier.

- [ ] **Étape 1 : rendre les huit champs contrôlés**

Remplacer intégralement `src/app/inscription/formulaire-inscription.tsx` :

```tsx
'use client'

import { useActionState, useEffect, useId, useRef, useState } from 'react'
import { LONGUEUR_MDP_MINIMALE } from '@/app/changer-mot-de-passe/constantes'
import type { Antenne } from '@/lib/donnees/antennes'
import { sInscrire, type EtatInscription } from './actions'

const etatInitial: EtatInscription = { erreur: null }

/**
 * `useActionState` et NON un `<form action={...}>` nu : une action liée directement à
 * `action` ne peut rien dire à l'utilisateur — `src/app/error.tsx` affiche un texte
 * statique et ne lit jamais `error.message`. Un message d'erreur renvoyé autrement
 * n'atteindrait jamais l'écran.
 *
 * ═══ TOUS LES CHAMPS SONT CONTRÔLÉS, ET C'EST LE CŒUR DE CE FICHIER. ═══
 *
 * React réinitialise les champs NON CONTRÔLÉS d'un `<form action>` à TOUTE complétion de
 * l'action, Y COMPRIS sur un refus RETOURNÉ. Ce composant était le PIRE CAS DU DÉPÔT :
 * huit champs libres, sur le SEUL écran public de l'application, EN PRODUCTION, et sans
 * aucun rattrapage possible. Une personne saisissait son identité, son contact et son
 * antenne, se trompait de code d'inscription, et perdait les huit champs — sans pouvoir
 * comprendre son erreur, le §7 imposant ici un message indifférencié (D30) qui ne révèle
 * jamais qu'un code existe.
 *
 * NE JAMAIS REVENIR À `defaultValue` NI À UN CHAMP SANS `value` ICI. Le message d'erreur
 * de cet écran ne peut pas expliquer ; la saisie conservée est donc la SEULE chose qui
 * reste à l'utilisateur pour réessayer.
 *
 * LE MOT DE PASSE EST CONTRÔLÉ COMME LES AUTRES, et ce n'est pas une imprudence : sa
 * valeur vit dans l'état React du navigateur, exactement là où le DOM la gardait déjà.
 * Rien de nouveau n'est exposé — ni journalisé, ni envoyé ailleurs qu'à l'action. Le
 * perdre à chaque refus obligeait au contraire à le retaper, ce qui pousse aux mots de
 * passe courts.
 */
export function FormulaireInscription({ antennes }: { antennes: Antenne[] }) {
  const [etat, envoyer, enCours] = useActionState(sInscrire, etatInitial)
  const prefixe = useId()
  const idCode = `${prefixe}-code`
  const idIdentifiant = `${prefixe}-identifiant`
  const idMotDePasse = `${prefixe}-mdp`

  const [code, setCode] = useState('')
  const [identifiant, setIdentifiant] = useState('')
  const [motDePasse, setMotDePasse] = useState('')
  const [prenom, setPrenom] = useState('')
  const [nom, setNom] = useState('')
  const [telephone, setTelephone] = useState('')
  const [ville, setVille] = useState('')
  const [antenneId, setAntenneId] = useState('')

  const zoneErreur = useRef<HTMLParagraphElement | null>(null)

  /*
    ═══ POURQUOI CE `useRef` FERME LA COURSE AU MONTAGE PAR CONSTRUCTION ═══

    `enCoursPrecedent` est initialisé avec la valeur du PREMIER rendu, nécessairement
    `false`. La passe de montage ne peut donc jamais satisfaire
    `enCoursPrecedent.current && !enCours` : la condition exige une transition
    `true -> false`, c'est-à-dire une VRAIE soumission terminée. Tester `etat.erreur`
    seul se déclencherait dès le montage.

    Ce que l'effet fait : porter le FOCUS sur le refus. Sur mobile, où cet écran est le
    plus employé, le message peut être hors champ après une saisie longue, et rien ne
    semble se passer au clic. AUCUNE remise à zéro n'est faite au succès : `sInscrire`
    REDIRIGE. Si cette redirection disparaissait un jour, c'est EXACTEMENT ce garde qu'il
    faudrait réutiliser, avec `etat.erreur === null`.
  */
  const enCoursPrecedent = useRef(enCours)
  useEffect(() => {
    if (enCoursPrecedent.current && !enCours && etat.erreur !== null) {
      zoneErreur.current?.focus()
    }
    enCoursPrecedent.current = enCours
  }, [enCours, etat])

  return (
    <form action={envoyer} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={idCode} className="text-sm font-medium">
          Code d&apos;inscription
        </label>
        <input
          id={idCode}
          name="code"
          value={code}
          onChange={(evenement) => setCode(evenement.target.value)}
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
          value={identifiant}
          onChange={(evenement) => setIdentifiant(evenement.target.value)}
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

      <div className="flex flex-col gap-1.5">
        <label htmlFor={idMotDePasse} className="text-sm font-medium">
          Mot de passe choisi
        </label>
        <input
          id={idMotDePasse}
          name="motDePasse"
          type="password"
          value={motDePasse}
          onChange={(evenement) => setMotDePasse(evenement.target.value)}
          required
          // Interpolée, jamais écrite en dur : la page sœur `/changer-mot-de-passe` fait
          // de même, et une valeur recopiée à la main deviendrait un mensonge le jour où
          // la constante change.
          minLength={LONGUEUR_MDP_MINIMALE}
          autoComplete="new-password"
          aria-describedby={`${idMotDePasse}-aide`}
          className="rounded-md border border-neutral-300 px-3 py-2"
        />
        <span id={`${idMotDePasse}-aide`} className="text-xs text-neutral-500">
          Au moins {LONGUEUR_MDP_MINIMALE} caractères.
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Prénom</span>
          <input
            name="prenom"
            value={prenom}
            onChange={(evenement) => setPrenom(evenement.target.value)}
            required
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Nom</span>
          <input
            name="nom"
            value={nom}
            onChange={(evenement) => setNom(evenement.target.value)}
            required
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Téléphone</span>
          <input
            name="telephone"
            type="tel"
            value={telephone}
            onChange={(evenement) => setTelephone(evenement.target.value)}
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Ville</span>
          <input
            name="ville"
            value={ville}
            onChange={(evenement) => setVille(evenement.target.value)}
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="text-sm font-medium">Antenne</span>
          <select
            name="antenneId"
            value={antenneId}
            onChange={(evenement) => setAntenneId(evenement.target.value)}
            className="rounded-md border border-neutral-300 px-3 py-2"
          >
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
        D30 : ce formulaire est le SEUL et reste identique quel que soit le code saisi.
        Les champs prénom/nom/téléphone/ville/antenne sont TOUJOURS affichés, même s'ils
        seront ignorés en mode nominatif (design 2b §7.1) — les masquer selon une
        supposition sur le mode reviendrait à recréer un oracle par la forme de la page,
        exactement ce que D30 interdit.
      */}

      {etat.erreur ? (
        <p
          ref={zoneErreur}
          tabIndex={-1}
          role="alert"
          className="text-sm text-red-600 outline-none"
        >
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

- [ ] **Étape 2 : vérifier qu'aucun champ libre ne subsiste dans ce fichier**

```bash
grep -n "defaultValue" src/app/inscription/formulaire-inscription.tsx
```

**Attendu : aucune ligne.**

**CONTRÔLE POSITIF DU BALAYAGE** — sans lui, une commande mal formée rendrait « aucune
ligne » pour toujours, y compris sur un fichier resté fautif :

```bash
grep -rn "defaultValue" src/app/statuts/formulaire-catalogue.tsx
```

**Attendu : au moins une ligne** (ce composant reste hors périmètre, phase 6). Si celle-ci
ne rend rien non plus, c'est le balayage qui est cassé.

Puis compter les champs contrôlés du fichier corrigé :

```bash
grep -cE "^\s*value=\{" src/app/inscription/formulaire-inscription.tsx
```

**Attendu : 8.** Consigner le nombre réel.

**L'ANCRAGE `^\s*` N'EST PAS DÉCORATIF.** Un `grep -c "value={"` non ancré rend **9** et
non 8 : il capte aussi `<option key={antenne.id} value={antenne.id}>`, où `value=` est un
attribut d'`<option>` au milieu d'une ligne, et non le `value` **contrôlé** d'un champ.
Compter 9 en annonçant 8 laisserait croire à un champ contrôlé de plus qu'il n'y en a.

- [ ] **Étape 3 : LE SEUL COUPLAGE RÉEL AVEC `tests/e2e/inscription.spec.ts`, ET IL FAUT LE TRAITER**

`inscription.spec.ts` ne se contente pas de remplir des champs par leur libellé — ce qui
survivrait effectivement au passage en contrôlé. **Un de ses tests FORGE l'antenne en
manipulant le DOM directement**, sans passer par React (le test qui vérifie qu'un
`antenne_id` inexistant est refusé **avant** que le token ne soit consommé) :

```ts
  await page.evaluate((valeur) => {
    const select = document.querySelector<HTMLSelectElement>('select[name="antenneId"]')!
    const option = document.createElement('option')
    option.value = valeur
    option.textContent = 'Antenne forgée'
    select.append(option)
    select.value = valeur
  }, idInexistant)
```

Sur un `<select>` **contrôlé**, `select.value = valeur` écrit dans le DOM une valeur que
l'état React ignore : **toute passe de rendu la restaure à `''`**. Le test peut rester vert
— le `FormData` est construit au moment de la soumission, avant que le re-rendu déclenché
par l'état « en cours » n'ait restauré la valeur —, mais **il resterait vert pour une
raison que personne n'a choisie**, et un simple changement de timing le ferait basculer.

**Correction, trois lignes, dans `tests/e2e/inscription.spec.ts`** : ajouter la dépêche de
l'événement `change` **juste après** `select.value = valeur`, à l'intérieur du même
`page.evaluate` :

```ts
    select.value = valeur
    // Le champ est CONTRÔLÉ depuis la phase 5 : écrire `select.value` ne met pas à jour
    // l'état React, et la première passe de rendu le restaurerait à ''. On dépêche donc
    // l'événement que React écoute, pour que la forge passe par le MÊME chemin qu'une
    // sélection humaine — ce que ce test prétend éprouver.
    select.dispatchEvent(new Event('change', { bubbles: true }))
```

**Ne rien changer d'autre dans ce fichier.** Les libellés, les noms de champs et les
messages sont inchangés : tout le reste de la suite doit rester vert **sans être touché**.

- [ ] **Étape 4 : les portes rapides et la porte de production**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls && npm run test:e2e
```

Hors la dépêche d'événement de l'étape 3, `tests/e2e/inscription.spec.ts` **doit rester
vert sans autre modification**. **Si un autre de ses tests tombe, c'est cette tâche qui a
dévié**, pas le test.

- [ ] **Étape 5 : commit**

```bash
git add src/app/inscription/formulaire-inscription.tsx tests/e2e/inscription.spec.ts
git commit -m "fix: rendre contrôlés les huit champs du formulaire public d'inscription (arbitrage phase 5)"
```

**Preuves produites :** les trois balayages avec leur contrôle positif ; `test:e2e` vert
**sans autre modification d'`inscription.spec.ts` que la dépêche d'événement de
l'étape 3** ; et la preuve rejouable de survie de la saisie, écrite en **Task 8** contre un
build de production.

**Livrable indépendamment éprouvable :** sur `/inscription`, un code invalide affiche le
message indifférencié **et laisse les huit champs remplis**.

---

### Task 6 : `tests/rls/creation-enrichie.test.ts` — preuves 1, 2, 3, 4 et 5 (b)

**Fichiers :**
- Créer : `tests/rls/creation-enrichie.test.ts`

**Interfaces :**
- Consomme : `public.creer_membre_enrichi` (Task 1), en l'appelant **directement par
  `rpc`** — c'est la porte que ces preuves doivent éprouver.
- Produit : cinq preuves du design (§11, n°1, 2, 3, 4, 5 b), plus le nettoyage vérifié.

**Préfixe de famille : `ZZCreationEnrichie-`** (tiret littéral), avec un suffixe aléatoire
par exécution pour les noms individuels. **Tout ce que cette suite crée doit être
retrouvable après une interruption**, donc jamais par un tableau en mémoire seul.

**COMPTAGES EN DELTA, JAMAIS EN ABSOLU.** Cette suite écrit dans la base qui sert aussi de
**production** : un comptage absolu y est vrai au premier lancement et **faux pour
toujours** ensuite. Un test du projet a déjà été mis en échec par un token que
l'administrateur réel avait créé le soir même.

**ORDRE DE SUPPRESSION.** `membres.faiseur_de_disciple_id` est en `on delete set null` :
supprimer un faiseur **avant** ses disciples les **détacherait en silence** et en ferait
des racines — on ne les retrouverait plus par la prise qu'on croyait avoir.
`membre_statuts` et `journal_statuts` partent **en cascade** avec la fiche. D'où : une
suppression en vrac **par préfixe** (qui prend disciples et faiseurs ensemble), suivie d'un
**comptage de contrôle indépendant**.

- [ ] **Étape 1 : écrire la suite**

Créer `tests/rls/creation-enrichie.test.ts` :

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const IDENT_SIMPLE = 'test.rls.creation.simple'
const MDP_SIMPLE = `Test-${crypto.randomUUID()}`

// PRÉFIXE DE FAMILLE STABLE : ce qu'une exécution interrompue laisse derrière elle doit
// rester retrouvable par la suivante. Le suffixe aléatoire ne sert qu'à ne jamais
// collisionner avec un résidu.
const PREFIXE_FAMILLE = 'ZZCreationEnrichie-'
const PREFIXE = `${PREFIXE_FAMILLE}${crypto.randomUUID().slice(0, 8)}`

let clientSimple: SupabaseClient
let profilAdminId: string
let idFaiseurArchive: string
let idFaiseurEnAttente: string
let statutExclusifA: string
let statutExclusifB: string
let statutCumulable: string

/** Arguments complets de la passerelle. Nommés, JAMAIS positionnels. */
function argumentsCreation(surcharges: Record<string, unknown> = {}) {
  return {
    p_nom: `${PREFIXE}-${crypto.randomUUID().slice(0, 8)}`,
    p_prenom: 'Test',
    p_telephone: null,
    p_email_contact: null,
    p_ville: null,
    p_pays: null,
    p_antenne_id: null,
    p_situation: null,
    p_domaine_etude: null,
    p_report_initial_ael: 0,
    p_faiseur_de_disciple: null,
    p_dirigeant: null,
    p_dirigeant_force: false,
    p_statuts: [],
    p_par: profilAdminId,
    ...surcharges,
  }
}

async function compterMembresDuPrefixe(): Promise<number> {
  const { count, error } = await admin
    .from('membres')
    .select('id', { count: 'exact', head: true })
    .like('nom', `${PREFIXE_FAMILLE}%`)
  if (error) throw new Error(`comptage des membres impossible : ${error.message}`)
  if (count === null) throw new Error('comptage absent de la réponse PostgREST')
  return count
}

/**
 * Lignes de `journal_statuts` portées par les fiches DE CETTE FAMILLE DE PRÉFIXE.
 *
 * DEUX RAISONS, ET AUCUNE N'EST DÉCORATIVE.
 *
 * 1. L'ERREUR EST VÉRIFIÉE, ET UN `count` ABSENT LÈVE. Un comptage écrit
 *    `const { count } = await …` sans vérifier `error` rend `null` sur échec ; comparer
 *    `null` à `null` fait PASSER l'assertion de delta, et le test devient un contrôle qui
 *    ne peut plus échouer. Même discipline que `compterMembresDuPrefixe` ci-dessus.
 * 2. LE DELTA EST RESTREINT AU PRÉFIXE, JAMAIS GLOBAL. Un comptage global filtré sur
 *    `statut_id` porterait sur TOUTE la base : le groupe exclusif amorcé est celui du
 *    « Cheminement », soit exactement les statuts qu'attribue `tests/e2e/statuts.spec.ts`.
 *    Un lancement concurrent de `test:e2e` produirait alors un faux échec, pour une raison
 *    étrangère à ce qu'on éprouve.
 *
 * `.in('membre_id', [])` sur une famille vide rend 0, ce qui est la bonne réponse : sans
 * fiche du préfixe, il ne peut y avoir aucune ligne de journal du préfixe.
 */
async function compterJournalDuPrefixe(): Promise<number> {
  const { data: fiches, error: erreurFiches } = await admin
    .from('membres')
    .select('id')
    .like('nom', `${PREFIXE_FAMILLE}%`)
  if (erreurFiches) throw new Error(`lecture des fiches du préfixe impossible : ${erreurFiches.message}`)
  const ids = (fiches ?? []).map((ligne) => ligne.id as string)

  const { count, error } = await admin
    .from('journal_statuts')
    .select('id', { count: 'exact', head: true })
    .in('membre_id', ids)
  if (error) throw new Error(`comptage du journal impossible : ${error.message}`)
  if (count === null) throw new Error('comptage absent de la réponse PostgREST')
  return count
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

/** Deux statuts ACTIFS d'un même groupe EXCLUSIF, et un statut d'un groupe qui ne l'est
 *  pas. Lus en base, jamais devinés : le catalogue amorcé peut changer. */
async function reperersStatuts() {
  const { data, error } = await admin
    .from('groupes_statut')
    .select('id, exclusif, statuts(id, actif)')
  if (error) throw new Error(`lecture du catalogue impossible : ${error.message}`)

  type Groupe = { id: string; exclusif: boolean; statuts: Array<{ id: string; actif: boolean }> }
  const groupes = (data ?? []) as unknown as Groupe[]

  const exclusif = groupes.find((g) => g.exclusif && g.statuts.filter((s) => s.actif).length >= 2)
  if (!exclusif) {
    throw new Error(
      "aucun groupe exclusif ne porte deux statuts actifs : la preuve du couple exclusif ne peut pas être faite, et la faire passer sans elle serait un mensonge",
    )
  }
  const actifs = exclusif.statuts.filter((s) => s.actif)
  statutExclusifA = actifs[0].id
  statutExclusifB = actifs[1].id

  const cumulable = groupes.find((g) => !g.exclusif && g.statuts.some((s) => s.actif))
  // Pas d'échec ici : un catalogue sans groupe cumulable est concevable. Le seul test qui
  // s'en sert le saute explicitement.
  statutCumulable = cumulable ? cumulable.statuts.filter((s) => s.actif)[0].id : ''
}

beforeAll(async () => {
  await admin.from('membres').delete().like('nom', `${PREFIXE_FAMILLE}%`)
  await supprimerCompte(IDENT_SIMPLE)

  // Le profil auteur : `p_par` alimente `cree_par` et `journal_statuts.par_profil_id`.
  // On prend un profil RÉEL — un uuid inventé violerait la clé étrangère et ferait
  // échouer la création pour une raison qui n'a rien à voir avec ce qu'on éprouve.
  const { data: profils, error: erreurProfil } = await admin
    .from('profils')
    .select('id')
    .limit(1)
  if (erreurProfil) throw new Error(`lecture des profils impossible : ${erreurProfil.message}`)
  if (!profils || profils.length === 0) throw new Error('aucun profil en base : préparation impossible')
  profilAdminId = profils[0].id as string

  const { data: archive, error: erreurArchive } = await admin
    .from('membres')
    .insert({ nom: `${PREFIXE}-faiseur-archive`, prenom: 'Test', etat: 'archive' })
    .select('id')
    .single()
  if (erreurArchive || !archive) {
    throw new Error(`création du faiseur archivé impossible : ${erreurArchive?.message}`)
  }
  idFaiseurArchive = archive.id as string

  // Un faiseur EN ATTENTE. `public.etat_membre` a TROIS valeurs, pas deux, et
  // l'arborescence exclut `en_attente` exactement comme `archive` : un faiseur en attente
  // rendrait toute sa descendance active inatteignable depuis la liste des racines.
  const { data: enAttente, error: erreurEnAttente } = await admin
    .from('membres')
    .insert({ nom: `${PREFIXE}-faiseur-en-attente`, prenom: 'Test', etat: 'en_attente' })
    .select('id')
    .single()
  if (erreurEnAttente || !enAttente) {
    throw new Error(`création du faiseur en attente impossible : ${erreurEnAttente?.message}`)
  }
  idFaiseurEnAttente = enAttente.id as string

  await reperersStatuts()

  const { data: compte, error: erreurCompte } = await admin.auth.admin.createUser({
    email: `${IDENT_SIMPLE}@asonkeng.local`,
    password: MDP_SIMPLE,
    email_confirm: true,
  })
  if (erreurCompte || !compte.user) {
    throw new Error(`création du compte simple impossible : ${erreurCompte?.message}`)
  }
  const { error: erreurInsertion } = await admin
    .from('profils')
    .insert({ id: compte.user.id, identifiant: IDENT_SIMPLE, nom_affichage: 'Test création' })
  if (erreurInsertion) throw new Error(`insertion du profil impossible : ${erreurInsertion.message}`)

  clientSimple = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error: erreurConnexion } = await clientSimple.auth.signInWithPassword({
    email: `${IDENT_SIMPLE}@asonkeng.local`,
    password: MDP_SIMPLE,
  })
  if (erreurConnexion) throw new Error(`connexion impossible : ${erreurConnexion.message}`)
})

afterAll(async () => {
  // Suppression EN VRAC PAR PRÉFIXE : elle prend disciples et faiseurs ensemble, ce qui
  // évite le piège de `on delete set null` — supprimer un faiseur d'abord détacherait ses
  // disciples EN SILENCE et en ferait des racines, qu'on ne retrouverait plus.
  // `membre_statuts` et `journal_statuts` partent en cascade avec la fiche.
  await admin.from('membres').delete().like('nom', `${PREFIXE_FAMILLE}%`)
  await supprimerCompte(IDENT_SIMPLE)

  // COMPTAGE DE CONTRÔLE INDÉPENDANT du balayage : l'absence d'erreur au `delete` ne
  // prouve rien — un `delete` qui ne touche aucune ligne ne rend aucune erreur.
  expect(await compterMembresDuPrefixe()).toBe(0)
  const { data: residus, error: erreurResidus } = await admin
    .from('profils')
    .select('id')
    .eq('identifiant', IDENT_SIMPLE)
  // `error` VÉRIFIÉ, et assertion SANS `?? []` : sur échec de lecture, `data` vaut `null`,
  // et `residus ?? []` convertirait la panne en « aucun résidu ». Toute la valeur de ce
  // contrôle est d'être INDÉPENDANT du balayage ; un contrôle qui ne peut plus échouer ne
  // l'est plus de rien.
  if (erreurResidus) throw new Error(`lecture des profils résiduels impossible : ${erreurResidus.message}`)
  expect(residus).toHaveLength(0)
})

// ───────────────────────────────────────────────────────────────────────────────
// PREUVE N°3 — `revoke execute`, avec son contrôle positif
// ───────────────────────────────────────────────────────────────────────────────

describe('exécution de public.creer_membre_enrichi réservée à service_role', () => {
  it("la refuse à un compte authentifié ordinaire, et n'écrit rien", async () => {
    const avant = await compterMembresDuPrefixe()
    const { error } = await clientSimple.rpc('creer_membre_enrichi', argumentsCreation())
    expect(error).not.toBeNull()
    // DELTA, jamais un absolu : la base sert aussi de production.
    expect(await compterMembresDuPrefixe()).toBe(avant)
  })

  // CONTRÔLE POSITIF : sans lui, le refus ci-dessus serait aussi satisfait par une
  // fonction qui n'existe pas, ou par un appel mal formé.
  it('service_role réussit le MÊME appel', async () => {
    const avant = await compterMembresDuPrefixe()
    const { data, error } = await admin.rpc('creer_membre_enrichi', argumentsCreation())
    expect(error).toBeNull()
    expect(typeof data).toBe('string')
    expect(await compterMembresDuPrefixe()).toBe(avant + 1)
  })
})

// ───────────────────────────────────────────────────────────────────────────────
// PREUVE N°4 — une création NUE est identique à l'ancienne (D86)
// C'est la preuve qui AUTORISE D87 ; sans elle, le remplacement serait un pari.
// ───────────────────────────────────────────────────────────────────────────────

describe('création nue, sans aucun enrichissement', () => {
  it('produit exactement ce que creerMembre produisait — colonne par colonne', async () => {
    const { data: identifiant, error } = await admin.rpc(
      'creer_membre_enrichi',
      argumentsCreation(),
    )
    expect(error).toBeNull()

    const { data: fiche, error: erreurLecture } = await admin
      .from('membres')
      .select('etat, faiseur_de_disciple_id, dirigeant_id, dirigeant_force, cree_par')
      .eq('id', identifiant)
      .single()
    if (erreurLecture) throw new Error(`lecture de la fiche impossible : ${erreurLecture.message}`)

    expect(fiche?.etat).toBe('actif')
    expect(fiche?.faiseur_de_disciple_id).toBeNull()
    expect(fiche?.dirigeant_id).toBeNull()
    expect(fiche?.dirigeant_force).toBe(false)
    expect(fiche?.cree_par).toBe(profilAdminId)

    const { count: statuts } = await admin
      .from('membre_statuts')
      .select('statut_id', { count: 'exact', head: true })
      .eq('membre_id', identifiant)
    expect(statuts).toBe(0)

    const { count: journal } = await admin
      .from('journal_statuts')
      .select('id', { count: 'exact', head: true })
      .eq('membre_id', identifiant)
    expect(journal).toBe(0)
  })

  // D86 : les trois enrichissements sont INDÉPENDANTS. Un dirigeant SANS faiseur de
  // disciple est légitime — le §4.2 le prévoit, `dirigeantPropose` rend `null` et
  // l'administrateur force une valeur.
  it('accepte un dirigeant SANS faiseur de disciple', async () => {
    const { data: autre, error: erreurAutre } = await admin
      .from('membres')
      .insert({ nom: `${PREFIXE}-dirigeant`, prenom: 'Test' })
      .select('id')
      .single()
    if (erreurAutre || !autre) throw new Error(`préparation impossible : ${erreurAutre?.message}`)

    const { data: identifiant, error } = await admin.rpc(
      'creer_membre_enrichi',
      argumentsCreation({ p_dirigeant: autre.id, p_dirigeant_force: true }),
    )
    expect(error).toBeNull()

    const { data: fiche } = await admin
      .from('membres')
      .select('faiseur_de_disciple_id, dirigeant_id, dirigeant_force')
      .eq('id', identifiant)
      .single()
    expect(fiche?.faiseur_de_disciple_id).toBeNull()
    expect(fiche?.dirigeant_id).toBe(autre.id)
    expect(fiche?.dirigeant_force).toBe(true)
  })

  // D86, l'autre sens : des statuts SANS place dans l'arbre.
  it('accepte des statuts SANS faiseur de disciple ni dirigeant', async () => {
    const { data: identifiant, error } = await admin.rpc(
      'creer_membre_enrichi',
      argumentsCreation({
        p_statuts: [{ statut_id: statutExclusifA, date_acquisition: '2020-01-02', note: 'preuve' }],
      }),
    )
    expect(error).toBeNull()

    const { data: porte } = await admin
      .from('membre_statuts')
      .select('statut_id, date_acquisition, note')
      .eq('membre_id', identifiant)
    expect(porte).toHaveLength(1)
    expect(porte?.[0]?.statut_id).toBe(statutExclusifA)
    // La date et la note traversent le `jsonb` INTACTES : sans ces deux assertions, une
    // clé mal orthographiée passerait pour un succès en laissant deux colonnes nulles —
    // exactement le mode de défaillance que le typage de `jsonb_to_recordset` ferme.
    expect(porte?.[0]?.date_acquisition).toBe('2020-01-02')
    expect(porte?.[0]?.note).toBe('preuve')

    const { data: journal } = await admin
      .from('journal_statuts')
      .select('action')
      .eq('membre_id', identifiant)
    expect(journal).toHaveLength(1)
    expect(journal?.[0]?.action).toBe('ajout')
  })
})

// ───────────────────────────────────────────────────────────────────────────────
// PREUVE N°2 — LA COMPOSITION N'A PAS ÉTÉ REMPLACÉE PAR UNE COPIE (D82),
// prouvée PAR LE COMPORTEMENT : les vérifications des passerelles APPELÉES mordent
// bien à travers la nouvelle porte, et AUCUNE fiche ne subsiste.
// ───────────────────────────────────────────────────────────────────────────────

describe('les gardes des passerelles appelées mordent à travers la nouvelle porte', () => {
  it('refuse un faiseur de disciple ARCHIVÉ, et ne laisse AUCUNE fiche', async () => {
    const avant = await compterMembresDuPrefixe()
    const { error } = await admin.rpc(
      'creer_membre_enrichi',
      argumentsCreation({ p_faiseur_de_disciple: idFaiseurArchive }),
    )
    expect(error).not.toBeNull()
    // LE MARQUEUR, pas la prose : c'est lui qui identifie la barrière atteinte.
    expect(error?.details).toBe('faiseur_de_disciple_archive')
    // ET RIEN N'A PERSISTÉ.
    //
    // CE QUE CETTE ASSERTION FERME EXACTEMENT, ET RIEN DE PLUS. Elle ne prouve PAS
    // l'atomicité : un `select public.creer_membre_enrichi(…)` via PostgREST est une seule
    // instruction dans une transaction implicite, donc une exception annule de toute façon
    // l'insertion. Ce qu'elle ferme est le SEUL mode de défaillance réel qui reste ici :
    // un `exception when others` ajouté un jour dans le corps, qui avalerait le refus et
    // laisserait la fiche derrière lui. Coût nul, valeur réelle — mais l'atomicité, elle,
    // est prouvée par la mutation de l'étape 4, et par elle seule.
    expect(await compterMembresDuPrefixe()).toBe(avant)
  })

  it('refuse un faiseur de disciple INCONNU, et ne laisse AUCUNE fiche', async () => {
    const avant = await compterMembresDuPrefixe()
    const { error } = await admin.rpc(
      'creer_membre_enrichi',
      argumentsCreation({ p_faiseur_de_disciple: crypto.randomUUID() }),
    )
    expect(error?.details).toBe('faiseur_inconnu')
    expect(await compterMembresDuPrefixe()).toBe(avant)
  })

  it('refuse un dirigeant INCONNU, et ne laisse AUCUNE fiche', async () => {
    const avant = await compterMembresDuPrefixe()
    const { error } = await admin.rpc(
      'creer_membre_enrichi',
      argumentsCreation({ p_dirigeant: crypto.randomUUID() }),
    )
    expect(error?.details).toBe('dirigeant_inconnu')
    expect(await compterMembresDuPrefixe()).toBe(avant)
  })

  it('refuse un statut INCONNU, et ne laisse AUCUNE fiche', async () => {
    const avant = await compterMembresDuPrefixe()
    const { error } = await admin.rpc(
      'creer_membre_enrichi',
      argumentsCreation({
        p_statuts: [{ statut_id: crypto.randomUUID(), date_acquisition: null, note: null }],
      }),
    )
    expect(error?.details).toBe('statut_inconnu')
    expect(await compterMembresDuPrefixe()).toBe(avant)
  })

  // CONTRÔLE POSITIF DES QUATRE CI-DESSUS, dans la même situation : sans lui, ils
  // seraient tous satisfaits par une passerelle qui refuserait TOUT.
  it('accepte un faiseur de disciple ACTIF et un statut valide', async () => {
    const { data: faiseur, error: erreurFaiseur } = await admin
      .from('membres')
      .insert({ nom: `${PREFIXE}-faiseur-actif`, prenom: 'Test' })
      .select('id')
      .single()
    if (erreurFaiseur || !faiseur) throw new Error(`préparation impossible : ${erreurFaiseur?.message}`)

    const { data: identifiant, error } = await admin.rpc(
      'creer_membre_enrichi',
      argumentsCreation({
        p_faiseur_de_disciple: faiseur.id,
        p_statuts: [{ statut_id: statutExclusifA, date_acquisition: null, note: null }],
      }),
    )
    expect(error).toBeNull()

    const { data: fiche } = await admin
      .from('membres')
      .select('faiseur_de_disciple_id, dirigeant_id')
      .eq('id', identifiant)
      .single()
    expect(fiche?.faiseur_de_disciple_id).toBe(faiseur.id)
    // `definir_arbre` a bien été appelée avec les trois arguments : `p_dirigeant` valait
    // `null`, donc la colonne aussi. Assertion faible mais non vide — elle tomberait si
    // la passerelle écrivait le faiseur dans la colonne dirigeant.
    expect(fiche?.dirigeant_id).toBeNull()
  })
})

// ───────────────────────────────────────────────────────────────────────────────
// PREUVE N°5 (b) — LE COUPLE EXCLUSIF, PAR APPEL FORGÉ CONTOURNANT LA FONCTION PURE
// ───────────────────────────────────────────────────────────────────────────────

describe('refus du couple exclusif par la passerelle elle-même (D84)', () => {
  it('refuse deux statuts du même groupe exclusif, et n’écrit NI fiche NI statut NI journal', async () => {
    const avantMembres = await compterMembresDuPrefixe()
    const avantJournal = await compterJournalDuPrefixe()

    const { error } = await admin.rpc(
      'creer_membre_enrichi',
      argumentsCreation({
        p_statuts: [
          { statut_id: statutExclusifA, date_acquisition: null, note: null },
          { statut_id: statutExclusifB, date_acquisition: null, note: null },
        ],
      }),
    )

    const apresMembres = await compterMembresDuPrefixe()
    const apresJournal = await compterJournalDuPrefixe()

    /*
      ═══ LES QUATRE ASSERTIONS SONT `expect.soft`, ET C'EST LE POINT DE CE TEST ═══

      `expect()` LÈVE. Écrites en dur et dans l'ordre naturel — marqueur d'abord, delta du
      journal en dernier —, la première qui tombe empêcherait les suivantes de s'exécuter.
      Or le scénario que ce test existe pour attraper est précisément celui où la garde
      d'exclusivité n'existe pas et où l'ÉVICTION de `prive.attribuer_statut` a joué : dans
      ce monde-là, `error` est nul, l'assertion du marqueur tombe la première, et le delta
      du journal — LA SEULE ASSERTION QUI VERRAIT LE `retrait` MENSONGER — ne s'exécuterait
      JAMAIS. Le test dirait « marqueur absent » et tairait le fait le plus grave.

      En `soft`, les quatre s'exécutent et les quatre échecs sont rapportés. Le diagnostic
      dit alors ce qui s'est réellement passé, pas seulement ce qui a manqué en premier.
    */
    expect.soft(error, "la passerelle a ACCEPTÉ le couple exclusif").not.toBeNull()
    // La fiche n'existe pas : ni elle, ni rien de ce qui devait la suivre.
    expect.soft(apresMembres, 'une fiche a persisté malgré le refus').toBe(avantMembres)
    // LA PLUS IMPORTANTE. Si l'éviction de `prive.attribuer_statut` avait joué au lieu du
    // refus, le journal porterait un `retrait` d'un statut que personne n'a jamais porté
    // plus d'une transaction — et le journal mentirait sur ce qui s'est passé.
    expect
      .soft(apresJournal, "le journal a bougé : l'éviction a joué au lieu du refus")
      .toBe(avantJournal)
    // L'un des deux marqueurs NOUVEAUX de la phase, et le seul posé par la passerelle
    // elle-même.
    expect.soft(error?.details).toBe('statuts_exclusifs_incompatibles')
  })

  // CONTRÔLE POSITIF DANS LE MÊME TEST-CI : le MÊME appel avec UN SEUL des deux réussit.
  it('accepte UN SEUL des deux statuts du groupe exclusif', async () => {
    const { data: identifiant, error } = await admin.rpc(
      'creer_membre_enrichi',
      argumentsCreation({
        p_statuts: [{ statut_id: statutExclusifB, date_acquisition: null, note: null }],
      }),
    )
    expect(error).toBeNull()
    const { data: porte } = await admin
      .from('membre_statuts')
      .select('statut_id')
      .eq('membre_id', identifiant)
    expect(porte).toHaveLength(1)
    expect(porte?.[0]?.statut_id).toBe(statutExclusifB)
  })

  it('accepte deux statuts de groupes DIFFÉRENTS quand l’un n’est pas exclusif', async (contexte) => {
    if (statutCumulable === '') {
      // Aucun groupe cumulable au catalogue : ce cas ne peut pas être construit.
      //
      // `contexte.skip()` et NON un `return` : un `return` dans un `it` le rend VERT, pas
      // *skipped*, et le rapport de `npm test` afficherait un contrôle positif réussi qui
      // n'a rien exécuté. Le `console.warn` qui l'accompagnait, lui, se perd dans le bruit
      // de la sortie. Un cas non construit doit se VOIR dans le décompte.
      //
      // Sur le catalogue amorcé réel (20260813100000), cette branche ne se déclenche pas —
      // d'où la facilité avec laquelle un `return` y passerait inaperçu.
      contexte.skip()
      return
    }
    const { data: identifiant, error } = await admin.rpc(
      'creer_membre_enrichi',
      argumentsCreation({
        p_statuts: [
          { statut_id: statutExclusifA, date_acquisition: null, note: null },
          { statut_id: statutCumulable, date_acquisition: null, note: null },
        ],
      }),
    )
    expect(error).toBeNull()
    const { data: porte } = await admin
      .from('membre_statuts')
      .select('statut_id')
      .eq('membre_id', identifiant)
    expect(porte).toHaveLength(2)
  })
})

// ───────────────────────────────────────────────────────────────────────────────
// L'INVARIANT D'ARBRE COUVRE LES TROIS ÉTATS, PAS DEUX (D99)
//
// `public.etat_membre` a TROIS valeurs : `en_attente`, `actif`, `archive`
// (20260812120000). L'arborescence exclut `en_attente` EXACTEMENT comme `archive`
// (`.eq('etat','actif')` sur ses deux lectures paginées). Un faiseur `en_attente`
// produirait donc le même trou qu'un faiseur `archive`, avec une conséquence que le cas
// `archive` n'a pas : toute sa descendance ACTIVE deviendrait INATTEIGNABLE depuis la
// liste des racines — ces fiches ont un faiseur, donc ne sont pas racines, et leur parent
// n'est jamais rendu. Rien ne le signalerait.
//
// CES TROIS PREUVES SONT DURABLES, ET C'EST LEUR RAISON D'ÊTRE : les gardes vivent en
// base, où aucune porte de ce dépôt ne les relit. Sans elles, une réécriture future des
// déclencheurs pourrait rétrécir la garde à `archive` sans faire tomber quoi que ce soit.
// ───────────────────────────────────────────────────────────────────────────────

describe("les gardes d'état de l'arbre couvrent en_attente comme archive", () => {
  it('refuse un faiseur de disciple EN ATTENTE, avec son marqueur propre, et ne laisse AUCUNE fiche', async () => {
    const avant = await compterMembresDuPrefixe()
    const { error } = await admin.rpc(
      'creer_membre_enrichi',
      argumentsCreation({ p_faiseur_de_disciple: idFaiseurEnAttente }),
    )
    expect(error).not.toBeNull()
    // MARQUEUR DISTINCT de `faiseur_de_disciple_archive`, et c'est le point : le message
    // que commande ce dernier dit « est archivé », ce qui serait faux ici. Deux faits
    // différents, deux marqueurs, deux messages.
    expect(error?.details).toBe('faiseur_de_disciple_inactif')
    expect(await compterMembresDuPrefixe()).toBe(avant)
  })

  it("refuse le même rattachement par un INSERT DIRECT, qui ne passe par aucune passerelle", async () => {
    // La passerelle explique ; le DÉCLENCHEUR protège. Sans cette preuve, une garde
    // retirée du déclencheur et laissée dans la passerelle resterait verte partout
    // ailleurs — alors qu'un `insert` direct la contournerait entièrement.
    const { error } = await admin.from('membres').insert({
      nom: `${PREFIXE}-sous-en-attente`,
      prenom: 'Test',
      faiseur_de_disciple_id: idFaiseurEnAttente,
    })
    expect(error).not.toBeNull()
    expect(error?.details).toBe('faiseur_de_disciple_inactif')
  })

  it("refuse de faire sortir de l'état actif un membre qui a encore un disciple actif", async () => {
    const { data: parent, error: erreurParent } = await admin
      .from('membres')
      .insert({ nom: `${PREFIXE}-parent-actif`, prenom: 'Test' })
      .select('id')
      .single()
    if (erreurParent || !parent) throw new Error(`préparation impossible : ${erreurParent?.message}`)
    const { error: erreurEnfant } = await admin
      .from('membres')
      .insert({
        nom: `${PREFIXE}-enfant-actif`,
        prenom: 'Test',
        faiseur_de_disciple_id: parent.id,
      })
    if (erreurEnfant) throw new Error(`préparation impossible : ${erreurEnfant.message}`)

    // `en_attente` et NON `archive` : c'est la transition que l'ancienne garde laissait
    // passer, parce qu'elle ne testait que `new.etat <> 'archive'`.
    const { error } = await admin
      .from('membres')
      .update({ etat: 'en_attente' })
      .eq('id', parent.id)
      .select('id')
    expect(error).not.toBeNull()
    expect(error?.details).toBe('disciples_a_reaffecter')

    // ET L'ÉTAT N'A PAS BOUGÉ : un refus qui laisserait l'écriture passer serait pire
    // qu'aucun refus.
    const { data: relu, error: erreurRelu } = await admin
      .from('membres')
      .select('etat')
      .eq('id', parent.id)
      .single()
    if (erreurRelu) throw new Error(`relecture impossible : ${erreurRelu.message}`)
    expect(relu?.etat).toBe('actif')
  })

  // CONTRÔLE POSITIF DES TROIS CI-DESSUS, ET IL N'EST PAS INERTE : sans lui, les trois
  // refus seraient aussi satisfaits par des gardes qui refuseraient TOUTE écriture d'arbre
  // et TOUT changement d'état. Il exige un succès RÉEL, vérifié en base.
  it('mais accepte un faiseur ACTIF, et laisse sortir de l’état actif un membre SANS disciple', async () => {
    const { data: faiseur, error: erreurFaiseur } = await admin
      .from('membres')
      .insert({ nom: `${PREFIXE}-faiseur-actif-controle`, prenom: 'Test' })
      .select('id')
      .single()
    if (erreurFaiseur || !faiseur) throw new Error(`préparation impossible : ${erreurFaiseur?.message}`)

    const { data: identifiant, error } = await admin.rpc(
      'creer_membre_enrichi',
      argumentsCreation({ p_faiseur_de_disciple: faiseur.id }),
    )
    expect(error).toBeNull()
    const { data: fiche, error: erreurFiche } = await admin
      .from('membres')
      .select('faiseur_de_disciple_id')
      .eq('id', identifiant)
      .single()
    if (erreurFiche) throw new Error(`relecture impossible : ${erreurFiche.message}`)
    expect(fiche?.faiseur_de_disciple_id).toBe(faiseur.id)

    // Une fiche SANS disciple : elle, on peut la sortir de l'état actif.
    const { data: seule, error: erreurSeule } = await admin
      .from('membres')
      .insert({ nom: `${PREFIXE}-sans-disciple`, prenom: 'Test' })
      .select('id')
      .single()
    if (erreurSeule || !seule) throw new Error(`préparation impossible : ${erreurSeule?.message}`)
    const { error: erreurArchivage } = await admin
      .from('membres')
      .update({ etat: 'archive' })
      .eq('id', seule.id)
      .select('id')
    expect(erreurArchivage).toBeNull()
  })
})

// ───────────────────────────────────────────────────────────────────────────────
// PREUVE N°2, FIL-PIÈGE COMPLÉMENTAIRE — ET IL EST PRÉSENTÉ COMME TEL
// ───────────────────────────────────────────────────────────────────────────────
//
// Une assertion sur un TEXTE DE DÉFINITION est fragile : un renommage, une reformulation,
// un commentaire suffiraient à la faire tomber sans qu'aucune propriété n'ait changé.
// Elle est écrite quand même parce que TOUTE LA VALEUR DE D81 EST DANS LA COMPOSITION, et
// qu'une recopie des gardes serait VERTE PARTOUT AILLEURS : les quatre refus ci-dessus
// passeraient tout aussi bien avec deux copies destinées à diverger.
//
// Ce fil-piège N'EST PAS EXÉCUTABLE DEPUIS supabase-js : `pg_get_functiondef` n'est pas
// exposé à PostgREST, et créer une fonction SQL pour l'exposer ouvrirait une porte
// permanente sur les définitions de la base — un coût sans commune mesure avec le
// bénéfice. Il est donc porté par l'ÉTAPE 3 DE CETTE TÂCHE, à la main, dans l'éditeur SQL,
// et sa sortie est consignée verbatim dans le rapport.
```

- [ ] **Étape 2 : exécuter**

```bash
npm run test:rls
```

- [ ] **Étape 3 : LE FIL-PIÈGE DE D82 — dans l'éditeur SQL Supabase, à la main**

```sql
select pg_get_functiondef(p.oid)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'creer_membre_enrichi';
```

**Vérifier, et consigner le verdict :**

| Attendu | Ce que son absence signifierait |
|---|---|
| contient `definir_arbre` | l'arbre n'est plus composé, il est recopié |
| contient `attribuer_statut` | les statuts ne sont plus composés, ils sont recopiés |
| **ne contient PAS** `update public.membres` | les colonnes d'arbre sont écrites en direct, hors du verrou consultatif et hors des vérifications de `definir_arbre` |
| **ne contient PAS** `insert into public.membre_statuts` | les statuts sont écrits en direct, sans éviction, sans journal, sans `for update` |

**Une recopie serait VERTE dans tous les tests de l'étape 1.** C'est la seule vérification
qui la distingue de la composition.

- [ ] **Étape 4 : PREUVE N°1 — ATOMICITÉ, PAR MUTATION**

⚠️ **Cette base sert la PRODUCTION. Ne jamais interrompre la séquence entre la mutation et
la restauration.** Tout se fait **en une seule session** de l'éditeur SQL, avec les blocs
recopiés d'avance.

**CONTRÔLE POSITIF OBLIGATOIRE, D'ABORD** — sans lui, les quatre absences constatées après
mutation pourraient être vraies pour une tout autre raison :

```sql
-- Préparation : un statut actif quelconque.
select s.id as statut_id from public.statuts s where s.actif limit 1;   -- <ID_STATUT>
select p.id as profil_id from public.profils p limit 1;                 -- <ID_PROFIL>
insert into public.membres (nom, prenom) values ('ZZMutation-faiseur', 'Test') returning id;  -- <ID_FAISEUR>

-- 1. CONTRÔLE POSITIF : la MÊME création, SANS mutation, réussit et les QUATRE sont là.
select public.creer_membre_enrichi(
  'ZZMutation-positif', 'Test', null, null, null, null, null,
  null, null, 0,
  '<ID_FAISEUR>'::uuid, null, false,
  jsonb_build_array(jsonb_build_object('statut_id', '<ID_STATUT>'::uuid, 'date_acquisition', null, 'note', null)),
  '<ID_PROFIL>'::uuid
);   -- <ID_CREE>

select
  (select count(*) from public.membres m where m.id = '<ID_CREE>') as fiche,
  (select count(*) from public.membres m where m.id = '<ID_CREE>' and m.faiseur_de_disciple_id = '<ID_FAISEUR>') as arbre,
  (select count(*) from public.membre_statuts ms where ms.membre_id = '<ID_CREE>') as statuts,
  (select count(*) from public.journal_statuts j where j.membre_id = '<ID_CREE>') as journal;
-- ATTENDU : 1, 1, 1, 1.
```

## ⚠️ OÙ LA MUTATION EST INSÉRÉE EST *TOUT* CE QUI FAIT LA VALEUR DE CETTE PREUVE

Le geste naturel — insérer `raise exception 'MUTATION';` **entre** l'insertion de la fiche
et l'appel à `definir_arbre` — produirait une preuve **creuse**, et il faut voir pourquoi
avant d'écrire quoi que ce soit. À cette position, `definir_arbre` et la boucle
`attribuer_statut` **ne sont jamais atteintes** : les colonnes d'arbre ne sont jamais
écrites, aucun `membre_statuts` ni aucun `journal_statuts` n'est jamais inséré — **même
dans un monde parfaitement non atomique**. Trois des quatre comptages vaudraient alors zéro
**par position dans le corps**, jamais par atomicité.

**La mutation va donc à la FIN du corps** : après la boucle `for v_ligne in … end loop;` et
**avant** `return v_membre;`. Les quatre écritures ont alors TOUTES eu lieu dans la
transaction, et leur disparition est exactement le fait que cette preuve vise.

**Et les quatre lectures doivent être RÉELLEMENT quatre.** Écrites en joignant
`public.membres` sur le même nom, les comptages de statuts et de journal valent zéro dès
que la fiche a disparu — **par arithmétique, pas par constat** : une écriture partielle qui
aurait laissé des `membre_statuts` derrière elle serait comptée zéro et passerait pour un
succès. Les deux comptages ci-dessous ne joignent donc **rien** : ce sont des **deltas** sur
les tables entières, mesurés avant et après.

**Recopier ici le corps EXACT de la fonction depuis la migration**, avec cette seule ligne
ajoutée à cette seule place :

```sql
-- 2. EMPREINTE AVANT — à conserver pour la comparaison finale.
select pg_get_functiondef(p.oid) as avant
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'creer_membre_enrichi';

-- 3. COMPTAGES DE RÉFÉRENCE, PRIS MAINTENANT — après le contrôle positif, avant la
--    mutation. SANS AUCUNE JOINTURE sur `membres` : c'est ce qui rend les lectures de
--    l'étape 5 indépendantes du sort de la fiche.
select
  (select count(*) from public.membre_statuts)                                       as statuts_avant,
  (select count(*) from public.journal_statuts)                                      as journal_avant,
  (select count(*) from public.membres where faiseur_de_disciple_id = '<ID_FAISEUR>') as sous_faiseur_avant;
-- CONSIGNER CES TROIS NOMBRES : ce sont eux, et non « 0 », qui sont attendus à l'étape 5.

-- 4. MUTATION : `create or replace` du corps IDENTIQUE à la migration, plus un
--    `raise exception 'MUTATION';` inséré APRÈS la boucle `for v_ligne in … end loop;`
--    et AVANT `return v_membre;`.
--
--    LA POSITION EST LE POINT. Placée avant `definir_arbre`, la mutation ne ferait
--    disparaître que la fiche : les trois autres comptages vaudraient zéro même sans
--    atomicité, puisque ni l'arbre ni les statuts n'auraient jamais été écrits. Placée
--    ICI, les quatre écritures ont TOUTES eu lieu dans la transaction.
--
--    [recopier ici la migration entière, avec cette seule ligne ajoutée à cette place]

-- 5. REJOUER LA MÊME CRÉATION.
select public.creer_membre_enrichi(
  'ZZMutation-atomique', 'Test', null, null, null, null, null,
  null, null, 0,
  '<ID_FAISEUR>'::uuid, null, false,
  jsonb_build_array(jsonb_build_object('statut_id', '<ID_STATUT>'::uuid, 'date_acquisition', null, 'note', null)),
  '<ID_PROFIL>'::uuid
);
-- ATTENDU : l'exception « MUTATION ».

-- 6. QUATRE LECTURES RÉELLEMENT DISTINCTES, DANS LA MÊME SESSION : RIEN N'A PERSISTÉ.
select
  (select count(*) from public.membres where nom = 'ZZMutation-atomique')            as fiche,
  (select count(*) from public.membres where faiseur_de_disciple_id = '<ID_FAISEUR>') as sous_faiseur,
  (select count(*) from public.membre_statuts)                                       as statuts,
  (select count(*) from public.journal_statuts)                                      as journal;
-- ATTENDU : fiche = 0 ; sous_faiseur = sous_faiseur_avant ; statuts = statuts_avant ;
--           journal = journal_avant.
--
-- Les trois derniers sont des DELTAS À ZÉRO sur des tables entières, et non des zéros
-- absolus : la base sert aussi de production, et `membre_statuts` comme `journal_statuts`
-- y portent déjà des lignes réelles. Un zéro absolu y serait faux pour toujours.

-- 7. RESTAURATION IMMÉDIATE : rejouer la migration TELLE QUELLE, sans la ligne ajoutée.

-- 8. EMPREINTE APRÈS — doit être IDENTIQUE CARACTÈRE POUR CARACTÈRE à `avant`.
select pg_get_functiondef(p.oid) as apres
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'creer_membre_enrichi';

-- 9. NETTOYAGE, disciples avant faiseurs — ici la suppression par préfixe les prend
--    ensemble, et `membre_statuts` / `journal_statuts` partent en cascade.
delete from public.membres where nom like 'ZZMutation-%';
select count(*) from public.membres where nom like 'ZZMutation-%';   -- ATTENDU : 0
```

**Consigner verbatim :** les quatre `1` du contrôle positif, les trois comptages de
référence de l'étape 3, l'exception observée, les quatre valeurs de l'étape 6 **comparées
une à une** à leurs références, `avant` et `apres`, et le comptage final.

- [ ] **Étape 5 : les portes rapides, puis commit**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls
```

```bash
git add tests/rls/creation-enrichie.test.ts
git commit -m "test: atomicite, composition, revoke et couple exclusif de creer_membre_enrichi (preuves 1 a 5)"
```

**Livrable indépendamment éprouvable :** cinq preuves du design, dont l'atomicité prouvée
**par mutation avec son contrôle positif**, et la composition prouvée **par le
comportement puis par le fil-piège**.

---

### Task 7 : `tests/e2e/creation-enrichie.spec.ts` — preuve n°8, garde forgé et canari (D90)

**Fichiers :**
- Créer : `tests/e2e/creation-enrichie.spec.ts`

**Interfaces :**
- Consomme : l'écran `/membres/nouveau` (Task 4) et l'action `creerMembreEnrichi` (Task 3).
- Produit : la preuve n°8 du design.

## ⚠️ UN TEST QUI AFFIRME QU'UN RÔLE « NE PEUT PAS » DOIT FORGER L'APPEL ET PORTER UN CANARI

Le masquage d'interface **ne prouve rien** : `creerMembreEnrichi` écrit par
`clientAdmin()`, la clé de service, qui contourne **entièrement** la RLS. La seule
protection réelle est `exigerAdministrateur()` **en première instruction**. Un test qui se
contenterait de constater que le lien « Nouveau membre » est absent resterait vert même si
ce garde disparaissait.

**Et le canari doit emprunter LE CANAL DE LA FORGE, pas l'interface.** Un canari qui
passerait par l'écran n'éprouverait pas ce que la forge éprouve : si l'encodage
`$ACTION_*` changeait, les refus deviendraient verts pour toujours et le canari, lui,
continuerait de réussir par un autre chemin. **Défaut réel trouvé en phase 4.**

Le motif est celui de `tests/e2e/statuts.spec.ts` et `tests/e2e/evenements.spec.ts` :
`extraireChampsCaches` + `verifierCaptureAction`, puis `request.post` depuis un contexte de
navigateur distinct.

- [ ] **Étape 1 : écrire la suite**

Créer `tests/e2e/creation-enrichie.spec.ts` :

```ts
import { createClient } from '@supabase/supabase-js'
import { expect, test, type Page } from '@playwright/test'
import { identifiantVersEmail } from '../../src/lib/domaine/identifiant'

test.describe.configure({ mode: 'serial' })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const MDP = `Test-${crypto.randomUUID()}`
const IDENT_ADMIN = 'test.e2e.creation.admin'
const IDENT_SIMPLE = 'test.e2e.creation.simple'
const IDENT_MODERATEUR = 'test.e2e.creation.moderateur'

// PRÉFIXE DE FAMILLE STABLE : retrouvable après une interruption.
const PREFIXE_FAMILLE = 'ZZCreationE2E-'
const PREFIXE = `${PREFIXE_FAMILLE}${crypto.randomUUID().slice(0, 8)}`
// Trois noms DÉDIÉS : un par forge, un pour le canari. Partager un nom rendrait le canari
// indistinguable d'un refus qui aurait fuité.
const NOM_FORGE_SIMPLE = `${PREFIXE}-forge-simple`
const NOM_FORGE_MODERATEUR = `${PREFIXE}-forge-moderateur`
const NOM_CANARI = `${PREFIXE}-canari`

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
 *  qu'un test qui, silencieusement, ne teste plus rien. */
function verifierCaptureAction(champs: Record<string, string>): void {
  const trouve = Object.keys(champs).some((nom) => nom.startsWith('$ACTION'))
  if (!trouve) {
    throw new Error(
      `Capture invalide : aucun champ « $ACTION* » parmi ${JSON.stringify(Object.keys(champs))}. ` +
        "L'encodage des Server Actions a peut-être changé — ce test ne peut plus prouver ce qu'il prétend.",
    )
  }
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

async function creerCompte(identifiant: string, roles: string[]): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email: identifiantVersEmail(identifiant),
    password: MDP,
    email_confirm: true,
  })
  if (error || !data.user) {
    throw new Error(`création du compte ${identifiant} impossible : ${error?.message}`)
  }
  const { error: erreurProfil } = await admin
    .from('profils')
    .insert({ id: data.user.id, identifiant, nom_affichage: `Test création ${identifiant}` })
  if (erreurProfil) {
    await admin.auth.admin.deleteUser(data.user.id)
    throw new Error(`insertion du profil ${identifiant} impossible : ${erreurProfil.message}`)
  }
  for (const role of roles) {
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

async function seConnecter(page: Page, identifiant: string) {
  await page.goto('/connexion')
  await page.getByLabel('Identifiant').fill(identifiant)
  await page.getByLabel('Mot de passe').fill(MDP)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page).toHaveURL(/\/tableau-de-bord/)
}

async function compterFichesNommees(nom: string): Promise<number> {
  const { count, error } = await admin
    .from('membres')
    .select('id', { count: 'exact', head: true })
    .eq('nom', nom)
  if (error) throw new Error(`comptage impossible : ${error.message}`)
  // `count === null` LÈVE, il ne retombe PAS sur 0. Ce compteur sert trois assertions de
  // SÉCURITÉ (« ce rôle n'a écrit aucune fiche ») : un comptage absent de la réponse
  // PostgREST y deviendrait « aucune fiche », c'est-à-dire un refus RÉUSSI, pour une
  // panne. Même discipline que `totalObligatoire` dans `pagination.ts`.
  if (count === null) throw new Error(`comptage absent de la réponse PostgREST pour « ${nom} »`)
  return count
}

/**
 * Nombre total de lignes de `membre_statuts` et de `journal_statuts`, SANS AUCUN FILTRE.
 *
 * Employé en DELTA, jamais en absolu. C'est la seule mesure qui puisse voir une écriture
 * partielle sous un `membre_id` que le NOM ne trahit pas — précisément le scénario que
 * cette preuve prétend fermer, et qu'un balayage par préfixe de nom ne peut pas voir.
 *
 * `error` vérifié et `count === null` levé aux deux comptages : sans cela, une panne de
 * lecture rendrait deux `null`, et `null === null` ferait passer le delta.
 */
async function compterEcrituresDeStatuts(): Promise<{ statuts: number; journal: number }> {
  const { count: statuts, error: erreurStatuts } = await admin
    .from('membre_statuts')
    .select('statut_id', { count: 'exact', head: true })
  if (erreurStatuts) throw new Error(`comptage des statuts impossible : ${erreurStatuts.message}`)
  if (statuts === null) throw new Error('comptage des statuts absent de la réponse PostgREST')

  const { count: journal, error: erreurJournal } = await admin
    .from('journal_statuts')
    .select('id', { count: 'exact', head: true })
  if (erreurJournal) throw new Error(`comptage du journal impossible : ${erreurJournal.message}`)
  if (journal === null) throw new Error('comptage du journal absent de la réponse PostgREST')

  return { statuts, journal }
}

test.beforeAll(async () => {
  await admin.from('membres').delete().like('nom', `${PREFIXE_FAMILLE}%`)
  for (const identifiant of [IDENT_ADMIN, IDENT_SIMPLE, IDENT_MODERATEUR]) {
    await supprimerCompte(identifiant)
  }
  await creerCompte(IDENT_ADMIN, ['administrateur'])
  await creerCompte(IDENT_SIMPLE, [])
  await creerCompte(IDENT_MODERATEUR, ['moderateur'])
})

test.afterAll(async () => {
  await admin.from('membres').delete().like('nom', `${PREFIXE_FAMILLE}%`)
  for (const identifiant of [IDENT_ADMIN, IDENT_SIMPLE, IDENT_MODERATEUR]) {
    await supprimerCompte(identifiant)
  }
  // COMPTAGE DE CONTRÔLE INDÉPENDANT du balayage.
  const { count } = await admin
    .from('membres')
    .select('id', { count: 'exact', head: true })
    .like('nom', `${PREFIXE_FAMILLE}%`)
  expect(count).toBe(0)
  const { data: residus, error: erreurResidus } = await admin
    .from('profils')
    .select('id')
    .in('identifiant', [IDENT_ADMIN, IDENT_SIMPLE, IDENT_MODERATEUR])
  // `error` VÉRIFIÉ, et assertion SANS `?? []` : sur échec de lecture, `data` vaut `null`,
  // et `residus ?? []` convertirait la panne en « aucun résidu ». Un contrôle de nettoyage
  // qui ne peut plus échouer ne contrôle plus rien.
  if (erreurResidus) throw new Error(`lecture des profils résiduels impossible : ${erreurResidus.message}`)
  expect(residus).toHaveLength(0)
})

/**
 * PREUVE N°8 — LE GARDE DE LA CRÉATION ENRICHIE (D90), FORGÉ DEPUIS DEUX RÔLES, AVEC
 * CANARI PAR LE MÊME CANAL.
 *
 * Un compte SIMPLE et un compte MODÉRATEUR forgent tous deux l'appel. Le modérateur n'est
 * pas un doublon du simple : il a des pouvoirs réels ailleurs dans l'application (AEL,
 * évènements, rattachement d'antenne), et c'est précisément le rôle dont on pourrait
 * croire qu'il crée aussi des fiches. Il ne le peut pas : la création est réservée à
 * l'administrateur (§5.2).
 */
test('un compte SIMPLE puis un compte MODÉRATEUR ne peuvent pas créer de fiche par requête forgée', async ({
  page,
  browser,
  baseURL,
}) => {
  // PRÉCONDITION : les trois noms visés n'existent pas encore. Sans elle, l'assertion
  // finale pourrait passer sur un résidu.
  expect(await compterFichesNommees(NOM_FORGE_SIMPLE)).toBe(0)
  expect(await compterFichesNommees(NOM_FORGE_MODERATEUR)).toBe(0)
  expect(await compterFichesNommees(NOM_CANARI)).toBe(0)

  // ÉCRITURES DE STATUTS AVANT LES FORGES. Voir plus bas pour ce que ce delta ferme, et
  // pourquoi il est GLOBAL.
  const ecrituresAvant = await compterEcrituresDeStatuts()

  // Capture des champs `$ACTION_*` depuis une session ADMINISTRATEUR : ce sont des
  // références déterministes à la fonction serveur pour cette version du code, pas un
  // secret lié à la session.
  await seConnecter(page, IDENT_ADMIN)
  await page.goto('/membres/nouveau')
  const formulaire = page.locator('form').filter({
    has: page.getByRole('button', { name: 'Créer la fiche' }),
  })
  const champs = extraireChampsCaches(await formulaire.evaluate((el) => el.outerHTML))
  verifierCaptureAction(champs)

  for (const [identifiant, nomVise] of [
    [IDENT_SIMPLE, NOM_FORGE_SIMPLE],
    [IDENT_MODERATEUR, NOM_FORGE_MODERATEUR],
  ] as const) {
    const contexte = await browser.newContext({ baseURL })
    try {
      const autrePage = await contexte.newPage()
      await seConnecter(autrePage, identifiant)
      await autrePage.request.post('/membres/nouveau', {
        multipart: { ...champs, prenom: 'Forge', nom: nomVise, reportInitialAel: '0' },
      })
    } finally {
      await contexte.close()
    }

    // SEULE ASSERTION QUI COMPTE : aucune ligne créée, quel qu'ait été le code HTTP.
    expect(await compterFichesNommees(nomVise), `${identifiant} a écrit une fiche`).toBe(0)
  }

  /*
    ═══ AUCUNE ÉCRITURE DE STATUT NI DE JOURNAL, ET LA MESURE EST UN DELTA GLOBAL ═══

    Une écriture PARTIELLE — la fiche refusée mais un `membre_statuts` laissé derrière —
    serait le pire des résultats, et c'est ce que ces deux nombres ferment.

    POURQUOI GLOBAL, ET NON RESTREINT AUX FICHES DU PRÉFIXE. Un balayage par préfixe de nom
    ne peut voir que les lignes rattachées à une fiche que le NOM trahit. Or le scénario
    craint est justement celui d'une écriture sous un `membre_id` que le nom ne trahit pas —
    une fiche partiellement créée puis annulée laisserait des lignes orphelines qu'aucun
    `like 'ZZ…%'` ne retrouverait. Un tel balayage, de surcroît, serait ici INERTE : ce test
    est le premier de la suite en mode `serial`, aucune fiche du préfixe n'existe encore, et
    `.in('membre_id', [])` ne matcherait rien — vrai par construction, donc sans valeur.

    POURQUOI UN DELTA, ET NON UN ABSOLU. Ces deux tables portent des lignes RÉELLES : la
    base sert aussi de production. Un absolu y serait faux dès le premier vrai statut
    attribué. Le prix du delta est connu et assumé : une attribution de statut faite par un
    administrateur réel PENDANT ce test le ferait échouer. Les suites e2e sont sérialisées
    (`workers: 1`) et durent quelques secondes ; c'est le meilleur compromis disponible.

    LA MESURE EST PRISE ICI, AVANT LE CANARI : celui-ci crée légitimement une fiche, sans
    aucun statut — mais mesurer après lui ferait dépendre le résultat d'un succès attendu.
  */
  const ecrituresApres = await compterEcrituresDeStatuts()
  expect(
    ecrituresApres.statuts,
    'une forge refusée a laissé une ligne dans membre_statuts',
  ).toBe(ecrituresAvant.statuts)
  expect(
    ecrituresApres.journal,
    'une forge refusée a laissé une ligne dans journal_statuts',
  ).toBe(ecrituresAvant.journal)

  // ═══ CANARI PAR LE MÊME CANAL ═══
  // Exactement le même `request.post`, depuis la session qui a le droit. S'il échoue,
  // c'est le MÉCANISME DE FORGE qui est cassé — et les deux refus ci-dessus ne prouvent
  // plus rien du tout. Un canari passant par l'interface ne dirait pas cela.
  await page.request.post('/membres/nouveau', {
    multipart: { ...champs, prenom: 'Canari', nom: NOM_CANARI, reportInitialAel: '0' },
  })
  expect(
    await compterFichesNommees(NOM_CANARI),
    "la forge n'atteint plus l'action : les refus ci-dessus ne prouvent plus rien",
  ).toBe(1)
})

/**
 * Masquage d'interface — utile, mais SECOND. Il ne protège rien : il dit seulement qu'un
 * compte non administrateur ne se voit pas proposer un geste qu'il ne peut pas faire.
 */
test("l'écran de création est inatteignable pour un compte non administrateur", async ({ page }) => {
  await seConnecter(page, IDENT_SIMPLE)
  await page.goto('/membres')
  await expect(page.getByRole('link', { name: 'Nouveau membre' })).toHaveCount(0)
  await page.goto('/membres/nouveau')
  await expect(page).toHaveURL(/\/tableau-de-bord/)
})

/**
 * CHEMIN NOMINAL COMPLET, DEPUIS L'ÉCRAN : fiche + statut + faiseur de disciple, en une
 * seule soumission, et les trois vérifiés EN BASE.
 *
 * Ce test n'est pas redondant avec la suite RLS : celle-ci appelle la passerelle
 * directement, celui-ci éprouve la chaîne complète — formulaire contrôlé, `FormData`,
 * `lignesStatutsDepuisFormData`, contrôle amont, `rpc`, redirection.
 */
test('un administrateur crée une fiche AVEC statut et faiseur de disciple en une soumission', async ({
  page,
}) => {
  const { data: faiseur, error } = await admin
    .from('membres')
    .insert({ nom: `${PREFIXE}-faiseur`, prenom: 'Test' })
    .select('id')
    .single()
  if (error || !faiseur) throw new Error(`préparation impossible : ${error?.message}`)

  await seConnecter(page, IDENT_ADMIN)
  await page.goto('/membres/nouveau')

  await page.getByLabel('Prénom (obligatoire)', { exact: true }).fill('Nominal')
  await page.getByLabel('Nom (obligatoire)', { exact: true }).fill(`${PREFIXE}-nominal`)

  await page.getByRole('button', { name: 'Ajouter un statut' }).click()
  const selectStatut = page.getByLabel('Statut', { exact: true })
  await expect(selectStatut).toHaveCount(1)
  // Le premier statut réellement proposé, quel qu'il soit : figer un libellé rendrait ce
  // test dépendant du catalogue amorcé.
  const valeurStatut = await selectStatut.locator('option').nth(1).getAttribute('value')
  expect(valeurStatut, 'aucun statut proposé : le catalogue est vide, ce test ne prouve rien').toBeTruthy()
  await selectStatut.selectOption(valeurStatut!)

  const zoneFaiseur = page.locator('div').filter({ hasText: /^Faiseur de disciple/ }).last()
  await zoneFaiseur.getByPlaceholder('Chercher par nom ou prénom').fill(`${PREFIXE}-faiseur`)
  await page.getByRole('button', { name: `Test ${PREFIXE}-faiseur` }).click()

  await page.getByRole('button', { name: 'Créer la fiche' }).click()
  await expect(page).toHaveURL(/\/membres\/[0-9a-f-]{36}$/)

  const { data: creee } = await admin
    .from('membres')
    .select('id, faiseur_de_disciple_id')
    .eq('nom', `${PREFIXE}-nominal`)
    .single()
  expect(creee?.faiseur_de_disciple_id).toBe(faiseur.id)

  const { count: statuts } = await admin
    .from('membre_statuts')
    .select('statut_id', { count: 'exact', head: true })
    .eq('membre_id', creee!.id)
  expect(statuts).toBe(1)

  const { count: journal } = await admin
    .from('journal_statuts')
    .select('id', { count: 'exact', head: true })
    .eq('membre_id', creee!.id)
  expect(journal).toBe(1)
})
```

- [ ] **Étape 2 : exécuter, puis commit**

```bash
npm run test:e2e
```

```bash
git add tests/e2e/creation-enrichie.spec.ts
git commit -m "test: garde force sur la creation enrichie, avec canari par le meme canal (preuve 8)"
```

**Preuve produite :** la sortie de `test:e2e`, montrant en particulier que **le canari
réussit** — sans quoi les deux refus ne prouveraient rien.

---

### Task 8 : `tests/e2e-prod/creation-enrichie-production.spec.ts` — preuves 6 et 7

**Fichiers :**
- Créer : `tests/e2e-prod/creation-enrichie-production.spec.ts`

**Interfaces :**
- Consomme : `/membres/nouveau` (Task 4), `/inscription` (Task 5),
  `messageStatutsIncompatibles` (Task 3), `MESSAGE_FAISEUR_ARCHIVE` (existant).
- Produit : les preuves n°6 et n°7 du design, **plus** la preuve de survie de la saisie sur
  l'écran public (arbitrage 3).

## ⚠️ UNE SEULE DES DEUX PREUVES DE CETTE SUITE EXIGE LE MODE PRODUCTION. L'AUTRE Y EST PAR CHOIX.

`npm run test:e2e` sert `npm run dev`. **Ce titre serait faux s'il disait que ce mode ne
peut voir aucun des deux défauts** : les deux mécanismes ne sont pas de même nature, et
citer la mauvaise raison en revue serait pire que ne rien citer.

- **La survie de la saisie (preuve n°6) — CE MÉCANISME EXISTE DANS LES DEUX MODES, et cette
  preuve pourrait techniquement vivre dans `tests/e2e/`.** React réinitialise les champs
  non contrôlés d'un `<form action>` à toute complétion, **y compris sur un refus
  retourné**, en développement comme en production. **Elle est ici par un choix assumé, et
  non par nécessité technique** : c'est la **première preuve de cette classe dans le
  projet** — les quatorze composants recensés au README n'en ont aucune —, elle porte sur
  le **seul écran public** de l'application, et la seule chose qui la rendrait fausse
  serait une particularité du serveur de développement. La faire tourner contre un build
  **réel** retire cette dernière échappatoire. **Ne pas la déplacer sans reprendre cette
  phrase.**
- **Le refus RETOURNÉ et non levé (preuve n°7)** — une exception levée depuis une Server
  Action perd son message en **production seulement** : React la remplace par un digest
  interne. **Nuance : sur cet écran, le composant n'attrape aucune exception** — il lit
  `etat.erreur` d'un `useActionState`. Un `throw` n'y produirait donc **pas**
  `Minified React error #441` : il remonterait à `src/app/error.tsx`, qui affiche un texte
  **statique** en développement **comme** en production. **Ce que la preuve n°7 verrouille
  ici, c'est donc que le MOTIF NOMMÉ atteint l'écran** — pas qu'un digest anglais est
  évité. Les deux assertions ci-dessous disent l'une et l'autre, séparément.

- [ ] **Étape 1 : écrire la suite**

Créer `tests/e2e-prod/creation-enrichie-production.spec.ts` :

```ts
import { createClient } from '@supabase/supabase-js'
import { expect, test, type Page } from '@playwright/test'
import { identifiantVersEmail } from '../../src/lib/domaine/identifiant'
import { MESSAGE_FAISEUR_ARCHIVE } from '../../src/app/membres/[id]/arbre/messages'

/**
 * PREUVES REJOUABLES CONTRE UN BUILD DE PRODUCTION (`next build` + `next start`, voir
 * `playwright.prod.config.ts`).
 *
 * PREUVE N°6 — LA SAISIE SURVIT À UN REFUS. C'est la PREMIÈRE preuve de cette classe dans
 * le projet : les quatorze composants recensés au README n'en avaient aucune. Elle porte
 * sur les DEUX formulaires que la phase 5 corrige — le pire cas administratif
 * (`membres/formulaire-membre.tsx`, 9 champs) et le pire cas TOUT COURT
 * (`inscription/formulaire-inscription.tsx`, 8 champs, écran PUBLIC, en production).
 *
 * PREUVE N°7 — LE REFUS EST RETOURNÉ, PAS LEVÉ : le texte affiché est celui de
 * l'application, jamais `Minified React error #441` ni le texte statique de
 * `src/app/error.tsx`.
 */

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const MDP = `Test-${crypto.randomUUID()}`
const IDENT_ADMIN = 'test.e2e.prod.creation.admin'
// IDENTIFIANT PUBLIC DÉTERMINISTE, jamais tiré par exécution : le chemin d'inscription
// qu'éprouve la troisième preuve pourrait un jour créer l'utilisateur `auth` AVANT
// d'échouer. Un identifiant aléatoire rendrait cet orphelin introuvable, et il
// s'accumulerait EN PRODUCTION sans qu'aucune assertion ne le voie. Format conforme au
// contrôle d'identifiant du projet : lettres, chiffres, points ou tirets, commençant par
// une lettre.
const IDENT_PUBLIC = 'zz.prod.creation.publique'
const PREFIXE_FAMILLE = 'ZZCreationProdE2E-'
const PREFIXE = `${PREFIXE_FAMILLE}${crypto.randomUUID().slice(0, 8)}`

/*
  DEUX TEXTES À NE JAMAIS VOIR SUR CES ÉCRANS, ET ILS NE DISENT PAS LA MÊME CHOSE.

  `FRAGMENT_DIGEST_REACT` — le digest anglais que React substitue au message d'une
  exception en build de production, LORSQUE le composant l'attrape pour l'afficher.
  `comptes/ligne-compte.tsx` est le seul composant du dépôt dans ce cas. **Sur les écrans
  visés ici, ce texte est IMPOSSIBLE**, et le plan de cette tâche le démontre plus haut :
  le composant lit `etat.erreur` d'un `useActionState` et n'attrape aucune exception ; un
  `throw` y remonterait à `src/app/error.tsx`. La sonde est conservée parce qu'elle coûte
  une ligne et qu'elle deviendrait pertinente si un jour un `try/catch` apparaissait — mais
  **elle ne vise pas le symptôme réel de cet écran**.

  `FRAGMENT_LIMITE_ERREUR` — LE symptôme réel. C'est le titre statique de
  `src/app/error.tsx` (vérifié : `<h1>Une erreur est survenue</h1>`). S'il apparaît, c'est
  qu'une exception a remonté à la limite d'erreur au lieu d'un refus RETOURNÉ : le motif
  nommé est perdu, en développement comme en production. C'est exactement ce que la
  preuve n°7 verrouille.

  Recopiés et non importés : `error.tsx` est un composant client, et l'importer ici
  tirerait React dans la suite. Si l'un des deux textes changeait, ces sondes deviendraient
  des faux négatifs silencieux — d'où l'assertion POSITIVE qui les accompagne toujours
  (« le message ATTENDU est là »), qui, elle, tomberait.
*/
const FRAGMENT_DIGEST_REACT = 'Minified React error'
const FRAGMENT_LIMITE_ERREUR = 'Une erreur est survenue'

// Sélecteur d'alerte PORTÉ : Next.js pose son propre `<div role="alert"
// id="__next-route-announcer__">` sur chaque page. Un `getByRole('alert')` nu en trouve
// donc toujours DEUX et viole le mode strict de Playwright. Motif déjà constantisé dans
// `tests/e2e/statuts.spec.ts` et repris trois fois dans `tests/e2e-prod/`.
const ALERTE = '[role="alert"]:not(#__next-route-announcer__)'

let idFaiseurArchive: string

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
  await page.getByLabel('Mot de passe').fill(MDP)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page).toHaveURL(/\/tableau-de-bord/)
}

test.beforeAll(async () => {
  await admin.from('membres').delete().like('nom', `${PREFIXE_FAMILLE}%`)
  await supprimerCompte(IDENT_ADMIN)
  // L'identifiant PUBLIC aussi : un résidu d'exécution interrompue ferait échouer
  // l'inscription pour « identifiant déjà pris » au lieu de « code invalide », et la
  // preuve porterait alors sur un tout autre refus.
  await supprimerCompte(IDENT_PUBLIC)

  const { data: compte, error } = await admin.auth.admin.createUser({
    email: identifiantVersEmail(IDENT_ADMIN),
    password: MDP,
    email_confirm: true,
  })
  if (error || !compte.user) throw new Error(`création du compte impossible : ${error?.message}`)
  const { error: erreurProfil } = await admin
    .from('profils')
    .insert({ id: compte.user.id, identifiant: IDENT_ADMIN, nom_affichage: 'Test prod création' })
  if (erreurProfil) throw new Error(`insertion du profil impossible : ${erreurProfil.message}`)
  const { error: erreurRole } = await admin
    .from('roles_profil')
    .insert({ profil_id: compte.user.id, role: 'administrateur' })
  if (erreurRole) throw new Error(`attribution du rôle impossible : ${erreurRole.message}`)

  // ═══ LE FAISEUR DE DISCIPLE EST CRÉÉ **ACTIF**, ET ARCHIVÉ PLUS TARD ═══
  // Il doit être ACTIF ici pour être trouvable par le sélecteur de l'écran, qui ne propose
  // que des membres actifs. La preuve l'archivera juste avant de soumettre. C'est le refus
  // le plus sûr à provoquer depuis l'écran, parce qu'il ne dépend d'AUCUNE particularité
  // du catalogue de statuts.
  const { data: faiseur, error: erreurFaiseur } = await admin
    .from('membres')
    .insert({ nom: `${PREFIXE}-faiseur`, prenom: 'Test' })
    .select('id')
    .single()
  if (erreurFaiseur || !faiseur) {
    throw new Error(`création du faiseur impossible : ${erreurFaiseur?.message}`)
  }
  idFaiseurArchive = faiseur.id as string
})

test.afterAll(async () => {
  await admin.from('membres').delete().like('nom', `${PREFIXE_FAMILLE}%`)
  await supprimerCompte(IDENT_ADMIN)
  await supprimerCompte(IDENT_PUBLIC)

  const { count } = await admin
    .from('membres')
    .select('id', { count: 'exact', head: true })
    .like('nom', `${PREFIXE_FAMILLE}%`)
  expect(count).toBe(0)

  // LES DEUX PROFILS AUSSI, VÉRIFIÉS PAR COMPTAGE. L'absence d'erreur au nettoyage ne
  // prouve rien : une suppression qui ne touche personne ne rend aucune erreur. Et
  // `IDENT_PUBLIC` est le cas qui compte vraiment — si le chemin d'inscription créait un
  // jour l'utilisateur `auth` avant d'échouer, l'orphelin s'accumulerait EN PRODUCTION.
  const { data: residus, error: erreurResidus } = await admin
    .from('profils')
    .select('id')
    .in('identifiant', [IDENT_ADMIN, IDENT_PUBLIC])
  if (erreurResidus) throw new Error(`lecture des profils résiduels impossible : ${erreurResidus.message}`)
  expect(residus).toHaveLength(0)
})

test('en production, un refus de création affiche son motif NOMMÉ et la saisie survit ENTIÈREMENT', async ({
  page,
}) => {
  await seConnecter(page, IDENT_ADMIN)
  await page.goto('/membres/nouveau')

  // On remplit TOUS les champs libres du formulaire — c'est le point de la preuve.
  const valeurs = {
    prenom: 'Saisie',
    nom: `${PREFIXE}-survivante`,
    telephone: '0102030405',
    emailContact: 'saisie@example.test',
    ville: 'Saint-Étienne',
    pays: 'France',
    reportInitialAel: '7',
  }
  await page.getByLabel('Prénom (obligatoire)', { exact: true }).fill(valeurs.prenom)
  await page.getByLabel('Nom (obligatoire)', { exact: true }).fill(valeurs.nom)
  await page.getByLabel('Téléphone').fill(valeurs.telephone)
  await page.getByLabel('Adresse de contact').fill(valeurs.emailContact)
  await page.getByLabel('Ville').fill(valeurs.ville)
  await page.getByLabel('Pays').fill(valeurs.pays)
  await page.getByRole('spinbutton', { name: 'AEL déjà suivis', exact: true }).fill(valeurs.reportInitialAel)
  await page.getByLabel('Situation').selectOption('etudiant')
  await page.getByLabel("Domaine d'étude").fill('Théologie')

  // Un statut, avec sa note : il doit survivre lui aussi.
  await page.getByRole('button', { name: 'Ajouter un statut' }).click()
  const selectStatut = page.getByLabel('Statut', { exact: true })
  const valeurStatut = await selectStatut.locator('option').nth(1).getAttribute('value')
  expect(valeurStatut, 'catalogue vide : cette preuve ne porterait sur rien').toBeTruthy()
  await selectStatut.selectOption(valeurStatut!)
  await page.getByLabel('Note').fill('note qui doit survivre')

  /*
    ═══ LE REFUS : UN FAISEUR DE DISCIPLE ARCHIVÉ — CHOISI PAR L'INTERFACE, PUIS ARCHIVÉ ═══

    NE PAS FORGER LE CHAMP CACHÉ. `src/app/membres/selecteur-membre.tsx` rend
    `<input type="hidden" name={nom} value={valeur?.id ?? ''} />` : ce champ est CONTRÔLÉ,
    et toute passe de rendu restaure `''`. Écrire `champ.value = …` par `evaluate` fait
    dépendre le test d'une course entre l'écriture DOM et le prochain rendu React : si la
    course tourne mal, la valeur repart vide, **la création RÉUSSIT**, l'assertion tombe, et
    l'échec est attribué au mauvais mécanisme — on croirait le message perdu alors que le
    refus n'a jamais eu lieu.

    On choisit donc le faiseur PAR L'ÉCRAN, comme un utilisateur (le sélecteur ne propose
    que des membres actifs, d'où un faiseur créé actif), et on l'archive EN BASE juste avant
    de soumettre. Le refus vient alors de la même barrière — `public.definir_arbre` et son
    déclencheur —, sans dépendre du cycle de rendu.
  */
  const zoneFaiseur = page.locator('div').filter({ hasText: /^Faiseur de disciple/ }).last()
  await zoneFaiseur.getByPlaceholder('Chercher par nom ou prénom').fill(`${PREFIXE}-faiseur`)
  await page.getByRole('button', { name: `Test ${PREFIXE}-faiseur` }).click()
  // Le champ caché porte bien l'identifiant : sans cette assertion, l'archivage ci-dessous
  // porterait sur une fiche que le formulaire n'a jamais retenue, et le refus attendu
  // n'aurait aucune raison de se produire.
  await expect(page.locator('input[name="faiseurDeDiscipleId"]')).toHaveValue(idFaiseurArchive)

  const { error: erreurArchivage } = await admin
    .from('membres')
    .update({ etat: 'archive' })
    .eq('id', idFaiseurArchive)
    .select('id')
  expect(erreurArchivage, "l'archivage de préparation a échoué : le refus attendu ne peut pas se produire").toBeNull()

  await page.getByRole('button', { name: 'Créer la fiche' }).click()

  // ═══ PREUVE N°7 : LE MOTIF NOMMÉ ATTEINT L'ÉCRAN ═══
  // Sélecteur PORTÉ : Next.js pose son propre `<div role="alert">` sur chaque page, et un
  // `getByRole('alert')` nu en trouverait deux — violation du mode strict.
  const alerte = page.locator(ALERTE)
  await expect(alerte).toHaveText(MESSAGE_FAISEUR_ARCHIVE)
  // Ni le digest React (impossible sur cet écran, sonde conservée par précaution)…
  await expect(page.locator('body')).not.toContainText(FRAGMENT_DIGEST_REACT)
  // …NI le titre de la limite d'erreur, qui est LE symptôme réel : s'il apparaissait, une
  // exception aurait remonté à `src/app/error.tsx` au lieu d'un refus RETOURNÉ, et le
  // motif nommé serait perdu.
  await expect(page.locator('body')).not.toContainText(FRAGMENT_LIMITE_ERREUR)

  // ═══ PREUVE N°6 : CHAQUE CHAMP PORTE ENCORE SA VALEUR ═══
  await expect(page.getByLabel('Prénom (obligatoire)', { exact: true })).toHaveValue(valeurs.prenom)
  await expect(page.getByLabel('Nom (obligatoire)', { exact: true })).toHaveValue(valeurs.nom)
  await expect(page.getByLabel('Téléphone')).toHaveValue(valeurs.telephone)
  await expect(page.getByLabel('Adresse de contact')).toHaveValue(valeurs.emailContact)
  await expect(page.getByLabel('Ville')).toHaveValue(valeurs.ville)
  await expect(page.getByLabel('Pays')).toHaveValue(valeurs.pays)
  await expect(page.getByRole('spinbutton', { name: 'AEL déjà suivis', exact: true })).toHaveValue(
    valeurs.reportInitialAel,
  )
  await expect(page.getByLabel('Situation')).toHaveValue('etudiant')
  await expect(page.getByLabel("Domaine d'étude")).toHaveValue('Théologie')
  // La ligne de statut aussi : c'est de l'état de composant, pas un champ du DOM initial.
  await expect(page.getByLabel('Statut', { exact: true })).toHaveValue(valeurStatut!)
  await expect(page.getByLabel('Note')).toHaveValue('note qui doit survivre')

  // ET RIEN N'A ÉTÉ ÉCRIT : l'atomicité vue depuis l'écran.
  const { count } = await admin
    .from('membres')
    .select('id', { count: 'exact', head: true })
    .eq('nom', valeurs.nom)
  expect(count).toBe(0)
})

// CONTRÔLE POSITIF, ET IL N'EST PAS INERTE : sans lui, tout ce qui précède serait
// satisfait par un formulaire qui REFUSE TOUT. Ce test-ci exige une redirection vers une
// fiche RÉELLE, et vérifie la ligne EN BASE — une page en erreur ne le satisferait pas.
test('en production, une création valide aboutit et redirige vers la fiche', async ({ page }) => {
  await seConnecter(page, IDENT_ADMIN)
  await page.goto('/membres/nouveau')
  await page.getByLabel('Prénom (obligatoire)', { exact: true }).fill('Valide')
  await page.getByLabel('Nom (obligatoire)', { exact: true }).fill(`${PREFIXE}-valide`)
  await page.getByRole('button', { name: 'Créer la fiche' }).click()

  await expect(page).toHaveURL(/\/membres\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { name: `Valide ${PREFIXE}-valide` })).toBeVisible()

  const { count } = await admin
    .from('membres')
    .select('id', { count: 'exact', head: true })
    .eq('nom', `${PREFIXE}-valide`)
  expect(count).toBe(1)
})

/**
 * LE CAS PUBLIC — le pire des quatorze, et le seul écran de l'application ouvert à des
 * gens qui ne la connaissent pas.
 *
 * Le §7 impose ici un message INDIFFÉRENCIÉ (D30) : la personne ne peut pas comprendre
 * son erreur. La saisie conservée est donc LA SEULE CHOSE qui lui reste pour réessayer.
 * Aucune session n'est nécessaire : cet écran s'affiche sans.
 */
test('en production, un code d’inscription invalide laisse les HUIT champs remplis', async ({
  page,
}) => {
  await page.goto('/inscription')

  const valeurs = {
    code: 'code-manifestement-invalide',
    // DÉTERMINISTE, pas tiré par exécution : voir la déclaration d'`IDENT_PUBLIC`. C'est
    // la seule prise par laquelle le nettoyage peut retrouver un compte que ce chemin
    // aurait créé avant d'échouer.
    identifiant: IDENT_PUBLIC,
    motDePasse: 'MotDePasseAssezLong123',
    prenom: 'Publique',
    nom: `${PREFIXE}-publique`,
    telephone: '0605040302',
    ville: 'Douala',
  }
  await page.getByLabel("Code d'inscription").fill(valeurs.code)
  await page.getByLabel('Identifiant choisi').fill(valeurs.identifiant)
  await page.getByLabel('Mot de passe choisi').fill(valeurs.motDePasse)
  await page.getByLabel('Prénom').fill(valeurs.prenom)
  // `{ exact: true }` OBLIGATOIRE : `getByLabel` non exact cherche une SOUS-CHAÎNE et est
  // insensible à la casse — « nom » est contenu dans « Prénom », et ce formulaire rend les
  // deux. Sans `exact`, le locateur en trouve DEUX et viole le mode strict. Le dépôt le
  // sait déjà : `tests/e2e/inscription.spec.ts` l'écrit ainsi depuis la 2b.
  await page.getByLabel('Nom', { exact: true }).fill(valeurs.nom)
  await page.getByLabel('Téléphone').fill(valeurs.telephone)
  await page.getByLabel('Ville').fill(valeurs.ville)

  // L'antenne : la première réellement proposée, s'il y en a une. Le `<select>` est le
  // huitième champ, et son état doit survivre comme les autres.
  const antenne = page.getByLabel('Antenne')
  const valeurAntenne = await antenne.locator('option').nth(1).getAttribute('value')
  if (valeurAntenne) {
    await antenne.selectOption(valeurAntenne)
  }

  await page.getByRole('button', { name: "S'inscrire" }).click()

  // Le refus indifférencié s'affiche… (sélecteur PORTÉ : Next.js pose son propre
  // `<div role="alert" id="__next-route-announcer__">` sur chaque page, et un
  // `getByRole('alert')` nu en trouverait deux — violation du mode strict.)
  await expect(page.locator(ALERTE)).toBeVisible()
  await expect(page.locator('body')).not.toContainText(FRAGMENT_DIGEST_REACT)
  // Et surtout PAS la limite d'erreur : `sInscrire` RETOURNE son refus, elle ne le lève
  // pas. C'est ce texte-là, et non le digest, qui apparaîtrait si elle levait.
  await expect(page.locator('body')).not.toContainText(FRAGMENT_LIMITE_ERREUR)

  // …ET LES HUIT CHAMPS SONT ENCORE LÀ.
  await expect(page.getByLabel("Code d'inscription")).toHaveValue(valeurs.code)
  await expect(page.getByLabel('Identifiant choisi')).toHaveValue(valeurs.identifiant)
  await expect(page.getByLabel('Mot de passe choisi')).toHaveValue(valeurs.motDePasse)
  await expect(page.getByLabel('Prénom')).toHaveValue(valeurs.prenom)
  await expect(page.getByLabel('Nom', { exact: true })).toHaveValue(valeurs.nom)
  await expect(page.getByLabel('Téléphone')).toHaveValue(valeurs.telephone)
  await expect(page.getByLabel('Ville')).toHaveValue(valeurs.ville)
  if (valeurAntenne) {
    await expect(antenne).toHaveValue(valeurAntenne)
  }

  // Et AUCUN compte n'a été créé : le code était invalide. `error` VÉRIFIÉ, et assertion
  // SANS `?? []` : sur échec de lecture, `data` vaut `null`, et `data ?? []` convertirait
  // la panne en « aucun compte créé » — l'assertion de sécurité deviendrait un contrôle
  // qui ne peut plus échouer.
  const { data, error } = await admin.from('profils').select('id').eq('identifiant', valeurs.identifiant)
  if (error) throw new Error(`lecture des profils impossible : ${error.message}`)
  expect(data).toHaveLength(0)
})
```

- [ ] **Étape 2 : exécuter contre un vrai build de production**

```bash
npm run test:e2e:prod
```

Cette commande **construit** l'application (`npm run build`) puis la sert sur le port
3100. Elle prend plusieurs minutes. **Ne pas lancer `npm run test:e2e` en parallèle** :
les deux suites partagent la base.

- [ ] **Étape 3 : FIN DU LOT « VOLET 1 » — les portes complètes**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls && npm run test:e2e && npm run build
```

**Si l'une de ces suites échoue, ÉTABLIR QUEL COMMIT L'A CASSÉE par un rejeu en
isolation**, et le consigner. Les commits du volet 1 sont ceux des Tasks 1, **1 bis**,
2+3+4, 5, 6 et 7.

- [ ] **Étape 4 : commit**

```bash
git add tests/e2e-prod/creation-enrichie-production.spec.ts
git commit -m "test: survie de la saisie et refus nomme contre un build de production (preuves 6 et 7)"
```

**Livrable indépendamment éprouvable :** la première preuve du dépôt qu'un refus métier
**n'efface plus la saisie** — sur les deux formulaires que cette phase corrige, contre un
build **réel** de production.

---

# VOLET 2 — L'ARBRE PARCOURABLE

> **Ne commencer ce volet qu'une fois le volet 1 livré (D96).** L'arbre parcourable rend
> visible l'ampleur du problème que la création enrichie referme : `creerMembre` n'a jamais
> écrit de `faiseur_de_disciple_id`, donc **toute fiche créée depuis la phase 1a est une
> racine** tant que personne n'ouvre l'écran de rattachement. Livré en premier, l'écran
> serait jugé cassé — « il commence par mille racines » — alors qu'il dirait la vérité.

---

### Task 9 : `libelleFiche` et `cheminAvecLibelles`, fonctions pures partagées (D98, D100)

**Fichiers :**
- Modifier : `src/lib/domaine/membre.ts`
- Modifier : `src/lib/domaine/membre.test.ts`
- Modifier : `src/lib/domaine/arbre.ts`
- Modifier : `src/lib/domaine/arbre.test.ts`
- Modifier : `src/app/membres/[id]/page.tsx`

**Interfaces :**
- Consomme : rien de cette phase.
- Produit :
  ```ts
  // src/lib/domaine/membre.ts
  export const LIBELLE_FICHE_NON_CONSULTABLE = 'Fiche non consultable'
  export function libelleFiche(
    identifiant: string | null,
    bref: { prenom: string; nom: string } | null,
  ): string | null

  // src/lib/domaine/arbre.ts
  export type MaillonNomme = { id: string; libelle: string }
  export function cheminAvecLibelles(
    identifiants: readonly string[],
    brefs: ReadonlyArray<{ id: string; prenom: string; nom: string }>,
  ): MaillonNomme[]
  ```
  Consommées par `/membres/[id]/page.tsx` (cette tâche) et par
  `src/app/arborescence/actions.ts` (Task 11).

**D100 — EXTRAITE, PAS RECOPIÉE.** La règle « identifiant présent, fiche illisible →
*Fiche non consultable* » vit aujourd'hui **dans** `/membres/[id]/page.tsx`, sous le nom
`libelleFiliation`. La recopier dans l'écran de l'arbre la ferait **diverger en silence**
le jour où l'un des deux changerait — exactement l'argument de D72, appliqué à une règle
d'affichage plutôt qu'à une politique. Bénéfice second, non négligeable : la règle devient
**testable au Vitest**, donc **D98 se prouve sans toucher la base**.

**LE COMPORTEMENT DE `/membres/[id]` EST IDENTIQUE APRÈS CETTE TÂCHE.** Ce n'est pas une
amélioration, c'est un déplacement. Toute différence de rendu est un défaut de cette tâche.

**ÉCART ASSUMÉ AVEC LE §7 DU DESIGN.** Celui-ci écrit qu'« aucune fonction pure nouvelle
n'est nécessaire au parcours de l'arbre ». C'est vrai du **parcours**, qui est paresseux et
ne calcule rien d'avance — mais la **preuve n°14** exige « une assertion sur la
**composition du chemin** : un identifiant illisible conserve sa profondeur et ne fait
disparaître aucun descendant », **au Vitest**. Cette assertion demande que la composition
soit une fonction pure. `cheminAvecLibelles` existe donc pour cette raison, et pour elle
seule ; l'écart est écrit ici plutôt que masqué.

- [ ] **Étape 1 : `libelleFiche` dans `src/lib/domaine/membre.ts`**

À la **fin** du fichier :

```ts
/**
 * Ce qu'on affiche à la place d'un nom qu'on n'a pas le droit de lire (D98, D100).
 *
 * Exporté : la preuve Vitest et les deux écrans doivent parler du MÊME texte. Recopier la
 * chaîne à trois endroits en ferait trois vérités.
 */
export const LIBELLE_FICHE_NON_CONSULTABLE = 'Fiche non consultable'

/**
 * Libellé d'une fiche désignée par un identifiant et lue SOUS RLS (D100).
 *
 * - identifiant `null` → `null` : il n'y a personne à désigner. L'appelant affiche « — ».
 * - fiche lue → le nom complet.
 * - identifiant PRÉSENT mais fiche ABSENTE de la lecture RLS → `'Fiche non consultable'`.
 *
 * ═══ POURQUOI LE TROISIÈME CAS N'EST PAS « — » ═══
 * Si l'identifiant existe mais que la lecture rend `null`, ce n'est PAS « personne » :
 * c'est une fiche que la politique cache à ce compte (typiquement archivée, vue par un
 * compte ordinaire). Confondre les deux afficherait « — » là où un administrateur voit un
 * nom sur la même fiche — exactement l'inverse de D20, qui rend la filiation visible de
 * tout compte actif. La 1c a tranché cela sur la fiche membre, la phase 3 sur
 * l'intervenant d'une séance, la phase 4 sur un participant. Même réponse, quatrième fois,
 * et désormais UN SEUL endroit.
 *
 * EXTRAITE de `/membres/[id]/page.tsx` (elle s'y appelait `libelleFiliation`) à
 * comportement RIGOUREUSEMENT identique.
 */
export function libelleFiche(
  identifiant: string | null,
  bref: { prenom: string; nom: string } | null,
): string | null {
  if (!identifiant) {
    return null
  }
  if (!bref) {
    return LIBELLE_FICHE_NON_CONSULTABLE
  }
  return `${bref.prenom} ${bref.nom}`
}
```

- [ ] **Étape 2 : `cheminAvecLibelles` dans `src/lib/domaine/arbre.ts`**

**L'`import` va EN TÊTE du fichier, avec les autres ; le reste va à la FIN.** L'écrire en
bas serait valide en ESM — les `import` sont hissés — mais la règle `import/first`
d'ESLint le signalerait, et `npm run lint` est une porte de cette tâche.

Import à ajouter **en tête** :

```ts
import { libelleFiche, LIBELLE_FICHE_NON_CONSULTABLE } from './membre'
```

Puis, à la **fin** du fichier :

```ts
/** Un maillon du chemin, prêt à afficher. */
export type MaillonNomme = { id: string; libelle: string }

/**
 * Compose le chemin AFFICHABLE à partir de sa FORME et des noms qu'on a pu lire (D98).
 *
 * ═══ LES DEUX LECTURES N'ONT PAS LE MÊME RÉGIME, ET C'EST LE POINT ═══
 * La FORME du chemin — la suite d'identifiants — est lue AFFRANCHIE DE LA RLS, par
 * `public.ancetres_membre` (D19, `security definer`, réservée à `service_role`). Une
 * remontée soumise à la RLS s'arrêterait sur un ancêtre invisible et ferait MENTIR l'écran
 * sur la profondeur. Les NOMS, eux, sont lus SOUS RLS **et filtrés `etat = 'actif'`
 * explicitement**, par l'appelant — sans ce filtre, l'exclusion des fiches non actives
 * serait déléguée à la RLS, et un administrateur lirait un nom là où un compte ordinaire
 * lit « Fiche non consultable ».
 *
 * ═══ UN MAILLON ILLISIBLE GARDE SA PLACE ═══
 * Un identifiant présent dans la forme et absent de la lecture sous RLS devient
 * « Fiche non consultable », À SA PROFONDEUR, jamais effacé ni sauté. L'effacer ferait
 * mentir l'écran sur la profondeur et pourrait détacher toute la descendance.
 *
 * ═══ AUCUN NOM LU AFFRANCHI DE LA RLS N'ATTEINT JAMAIS L'ÉCRAN ═══
 * C'est la Server Action appelante qui en répond : elle ne rend que des identifiants
 * depuis la lecture affranchie, et relit les noms sous RLS. Cette fonction ne lit rien :
 * elle reçoit les deux listes et les assemble. Elle ne peut donc pas trahir cette règle —
 * mais elle ne peut pas non plus la garantir seule, et il faut le savoir.
 *
 * `identifiants` est ordonné de la RACINE au membre visé.
 */
export function cheminAvecLibelles(
  identifiants: readonly string[],
  brefs: ReadonlyArray<{ id: string; prenom: string; nom: string }>,
): MaillonNomme[] {
  const parId = new Map(brefs.map((bref) => [bref.id, bref]))
  return identifiants.map((identifiant) => ({
    id: identifiant,
    // `libelleFiche` ne rend `null` que sur un identifiant nul, ce qui ne peut pas
    // arriver ici : la forme du chemin ne contient que des identifiants réels. Le repli
    // est écrit quand même — un `null` affiché tel quel serait pire qu'un libellé
    // conservateur.
    libelle: libelleFiche(identifiant, parId.get(identifiant) ?? null) ?? LIBELLE_FICHE_NON_CONSULTABLE,
  }))
}
```

- [ ] **Étape 3 : les preuves Vitest — preuve n°14 du design**

Ajouter à la fin de `src/lib/domaine/membre.test.ts` (en complétant les `import`) :

```ts
describe('libelleFiche', () => {
  it('rend null quand l’identifiant est nul — il n’y a personne à désigner', () => {
    expect(libelleFiche(null, null)).toBeNull()
    // Même sans identifiant, un `bref` fourni par erreur ne doit rien faire apparaître.
    expect(libelleFiche(null, { prenom: 'Jean', nom: 'Dupont' })).toBeNull()
  })

  it('rend le nom complet quand la fiche a pu être lue', () => {
    expect(libelleFiche('id-1', { prenom: 'Jean', nom: 'Dupont' })).toBe('Jean Dupont')
  })

  it("rend « Fiche non consultable » quand l'identifiant existe mais que la lecture RLS n'a rien rendu", () => {
    expect(libelleFiche('id-1', null)).toBe(LIBELLE_FICHE_NON_CONSULTABLE)
  })

  // Le cœur de D98 : les deux « rien » ne sont PAS le même « rien ».
  it('distingue « personne » de « fiche cachée »', () => {
    expect(libelleFiche(null, null)).not.toBe(libelleFiche('id-1', null))
  })
})
```

Ajouter à la fin de `src/lib/domaine/arbre.test.ts` :

```ts
describe('cheminAvecLibelles', () => {
  const brefs = [
    { id: 'racine', prenom: 'Anne', nom: 'Racine' },
    { id: 'petit', prenom: 'Zoé', nom: 'Feuille' },
  ]

  it('nomme chaque maillon lisible, dans l’ordre reçu', () => {
    expect(cheminAvecLibelles(['racine', 'petit'], brefs)).toEqual([
      { id: 'racine', libelle: 'Anne Racine' },
      { id: 'petit', libelle: 'Zoé Feuille' },
    ])
  })

  // PREUVE N°14, seconde moitié : un maillon ILLISIBLE conserve SA PLACE, et ne fait
  // disparaître aucun descendant.
  it('conserve la profondeur d’un maillon illisible, et garde ses descendants', () => {
    const chemin = cheminAvecLibelles(['racine', 'intermediaire', 'petit'], brefs)
    expect(chemin).toHaveLength(3)
    expect(chemin[1]).toEqual({ id: 'intermediaire', libelle: LIBELLE_FICHE_NON_CONSULTABLE })
    // Le descendant est TOUJOURS LÀ, et toujours nommé : c'est ce que « ne détache pas la
    // descendance » veut dire concrètement.
    expect(chemin[2]).toEqual({ id: 'petit', libelle: 'Zoé Feuille' })
  })

  it('ne saute ni ne réordonne quand TOUS les maillons sont illisibles', () => {
    const chemin = cheminAvecLibelles(['a', 'b', 'c'], [])
    expect(chemin.map((maillon) => maillon.id)).toEqual(['a', 'b', 'c'])
    expect(chemin.every((maillon) => maillon.libelle === LIBELLE_FICHE_NON_CONSULTABLE)).toBe(true)
  })

  it('rend un chemin vide pour une liste vide', () => {
    expect(cheminAvecLibelles([], brefs)).toEqual([])
  })
})
```

**CE QUI N'EST DÉLIBÉRÉMENT PAS EXIGÉ, et l'arbitrage est ici plutôt que laissé à
l'implémentation :** la preuve de bout en bout du même cas. La produire demanderait de
**désactiver** `membres_archivage_faiseur_de_disciple` sur la **base unique du projet**
pour fabriquer un état que D99 rend inatteignable. Une contrainte retirée se voit dans
`pg_get_constraintdef` ; **un déclencheur désactivé ne se voit dans AUCUN
`pg_get_triggerdef`** — seul `pg_trigger.tgenabled` le porte. Le rapport entre ce que la
preuve ajouterait et le risque qu'elle ferait courir à une base de production est mauvais.

- [ ] **Étape 4 : substituer dans `/membres/[id]/page.tsx`, à comportement IDENTIQUE**

Dans `src/app/membres/[id]/page.tsx` :

1. Ajouter à l'import de `@/lib/domaine/membre` (le créer s'il n'existe pas) :
   ```ts
   import { libelleFiche } from '@/lib/domaine/membre'
   ```
2. **Supprimer** les deux fonctions locales `nomOuTiret` et `libelleFiliation` ainsi que
   leur commentaire de tête — **le commentaire part avec elles**, il vit désormais sur
   `libelleFiche` dans la couche domaine. Laisser un commentaire orphelin ici recréerait
   la seconde vérité qu'on vient de supprimer.
3. Remplacer les trois usages :
   ```ts
   lignes.push(['Faiseur de disciple', libelleFiche(membre.faiseurDeDiscipleId, faiseur)])
   const nomDirigeant = libelleFiche(membre.dirigeantId, dirigeant)
   ```
   La ligne `Dirigeant` qui suit est **inchangée** :
   ```ts
   lignes.push([
     'Dirigeant',
     nomDirigeant ? `${nomDirigeant}${membre.dirigeantForce ? ' (défini manuellement)' : ''}` : null,
   ])
   ```

**Ne rien changer d'autre dans ce fichier** — la Task 12 y ajoutera le lien vers
`/arborescence`.

- [ ] **Étape 5 : les portes rapides, puis commit**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls
```

**Vérifier que `nomOuTiret` a bien disparu** (elle n'avait qu'un appelant, `libelleFiliation`) :

```bash
grep -rn "nomOuTiret\|libelleFiliation" src/
```

**Attendu : aucune ligne.** **CONTRÔLE POSITIF du balayage :**

```bash
grep -rn "libelleFiche" src/lib/domaine/membre.ts
```

**Attendu : au moins une ligne.**

```bash
git add src/lib/domaine/membre.ts src/lib/domaine/membre.test.ts \
  src/lib/domaine/arbre.ts src/lib/domaine/arbre.test.ts src/app/membres/[id]/page.tsx
git commit -m "refactor: extraire libelleFiche et cheminAvecLibelles en fonctions pures partagees (D98, D100)"
```

**Livrable indépendamment éprouvable :** la règle d'affichage vit à **un seul endroit**,
elle est prouvée **sans base**, et `/membres/[id]` rend exactement ce qu'il rendait.

---

### Task 10 : lectures paginées à tri TOTAL — `disciplesPage` et `racinesPage` (D93, D94, D95, D102)

**Fichiers :**
- Créer : `src/lib/donnees/arbre-lots.ts`
- Modifier : `src/lib/donnees/arbre.ts`

**Interfaces :**
- Consomme : `PageLue`, `verifierTaillePage`, `totalObligatoire` (`./pagination.ts`,
  existants) ; `MembreBref` (type seul, `./membres`) ; `clientServeur` (existant).
- Produit :
  ```ts
  // src/lib/donnees/arbre-lots.ts — SANS `import 'server-only'`
  export const TAILLE_PAGE_DISCIPLES = 25
  export const TAILLE_PAGE_RACINES = 50
  export async function disciplesParPage(
    supabase: SupabaseClient,
    membreId: string,
    options?: { page?: number; taillePage?: number },
  ): Promise<PageLue<MembreBref>>
  export async function racinesParPage(
    supabase: SupabaseClient,
    options?: { page?: number; taillePage?: number },
  ): Promise<PageLue<MembreBref>>
  export async function nomsMaillonsActifs(
    supabase: SupabaseClient,
    ids: readonly string[],
  ): Promise<MembreBref[]>
  export async function pageContenantDisciple(
    supabase: SupabaseClient,
    parentId: string,
    discipleId: string,
    taillePage: number,
  ): Promise<number>

  // src/lib/donnees/arbre.ts — `server-only`
  export async function disciplesPage(membreId: string, page: number): Promise<PageLue<MembreBref>>
  export async function racinesPage(page: number): Promise<PageLue<MembreBref>>
  export async function nomsMaillonsChemin(ids: readonly string[]): Promise<MembreBref[]>
  export async function pageDuDisciple(parentId: string, discipleId: string): Promise<number>
  ```
  Consommées par la Task 11 (`disciplesPage`, `nomsMaillonsChemin`, `pageDuDisciple`) et la
  Task 12 (`racinesPage`), et par la Task 13 (les **cœurs**, avec une taille de page
  abaissée).

## ⚠️ `disciplesDe` N'EST NI RÉUTILISÉE NI MODIFIÉE (D94). NE PAS LA « CORRIGER ».

`disciplesDe` (`src/lib/donnees/arbre.ts`) n'a **aucune borne** et son tri **n'est pas
total** (`nom`, `prenom`, sans `id`). Elle **reste exactement ce qu'elle est**, et ce
n'est pas un oubli : elle a un **second appelant porteur**, le **contrôle amont
d'`archiverMembre`**, qui doit rester **complet** — il lit `disciples.length > 0` et
**nomme** les personnes — et dont la sémantique ne doit pas changer sous une pagination.
Deux besoins différents, deux fonctions ; le second reste à l'identique, donc reste éprouvé
par ses tests existants (preuve n°11, Task 14).

## ⚠️ LES DEUX TRIS SONT TOTAUX, ET LA DERNIÈRE CLÉ EST UNIQUE

`(nom, prenom)` **n'est pas unique**. Sur une liste de membres d'une même famille
spirituelle, les homonymes **ne sont pas une hypothèse d'école**. Deux homonymes exacts à
cheval sur une frontière de page peuvent, sous une pagination par décalage, être rendus
**deux fois** ou **jamais** — « jamais » étant la **disparition silencieuse d'une personne
de la branche de son propre faiseur de disciple**. `.order('id')` en **dernier** critère,
sans exception. Défaut déjà corrigé sur `membres-lots.ts` puis sur `listerMembres` ; **on
ne le rouvre pas.**

## ⚠️ `PGRST103` S'ATTRAPE SUR LA LECTURE ELLE-MÊME. PAS DE PRÉ-CALCUL DE BORNE.

Calculer la borne haute par un premier aller-retour puis lire par un second **ouvre une
fenêtre de course** : une suppression concurrente entre les deux fait échouer le second
appel. Le correctif pré-calculé de la phase 4 s'est révélé **plus fragile** que le motif
qu'il imitait (I1 de la ronde du 2026-08-14). **Un seul aller-retour** : si le décalage
demandé dépasse le nombre réel de lignes, PostgREST refuse la requête **entière**, `count`
compris, avec un 416 — on retombe **alors seulement** sur un comptage sans `range`.

- [ ] **Étape 1 : créer `src/lib/donnees/arbre-lots.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { totalObligatoire, verifierTaillePage, type PageLue } from './pagination'
import type { MembreBref } from './membres'

/**
 * PAS de `import 'server-only'` ici, à la différence de `src/lib/donnees/arbre.ts` —
 * délibéré, même motif que `membres-lots.ts`, `presences-lots.ts` et
 * `evenements-lots.ts` : les fonctions ci-dessous reçoivent leur client Supabase DÉJÀ
 * CONSTRUIT, en paramètre, et ne touchent ni cookies ni clé de service. L'isoler permet à
 * `tests/rls/arborescence.test.ts` (vitest, hors Next.js) de faire tourner EXACTEMENT ce
 * code de production contre la vraie base, avec une taille de page abaissée — chose
 * impossible si ces fonctions vivaient dans un module `server-only`, dont le `throw` nu
 * n'est neutralisé que par l'alias du bundler Next.
 *
 * `import type { MembreBref }` est un import de TYPE : il est effacé à la compilation et
 * ne tire donc PAS `membres.ts` (server-only) dans ce module. Même astuce que
 * `membres-lots.ts`.
 */

/**
 * D94, D95 — LES DEUX LECTURES DE L'ARBRE SONT PAGINÉES, AVEC UN TRI TOTAL.
 *
 * PostgREST tronque EN SILENCE au-delà de `max_rows = 1000` (`supabase/config.toml:18`).
 * Sur l'arbre, une troncature ne produirait pas une page incomplète : elle produirait une
 * BRANCHE AMPUTÉE SANS LE MOINDRE SIGNAL, indistinguable d'un faiseur de disciple qui
 * aurait exactement mille disciples.
 *
 * Les deux tailles sont EXPORTÉES : la preuve de non-troncature
 * (`tests/rls/arborescence.test.ts`) appelle ces fonctions avec une taille ramenée à deux
 * ou trois lignes, pour franchir une VRAIE frontière de page sans créer un millier de
 * lignes en base de PRODUCTION.
 */
export const TAILLE_PAGE_DISCIPLES = 25
export const TAILLE_PAGE_RACINES = 50

/**
 * D102 — AUCUN INDEX NOUVEAU, ET LE CANDIDAT EST NOMMÉ ICI POUR N'AVOIR PAS À ÊTRE
 * REDÉCOUVERT :
 *
 *   create index membres_arbre_idx on public.membres (faiseur_de_disciple_id, nom, prenom, id)
 *     where etat = 'actif';
 *
 * Il rendrait le tri des enfants ET celui des racines ORDONNÉS PAR L'INDEX, donc sans tri
 * explicite. `membres_faiseur_de_disciple_id_idx` (20260812120000) existe déjà et sert le
 * filtre, y compris `is null` — un B-tree indexe les NULL. À l'échelle de D18, le tri
 * porte sur une poignée de lignes par nœud, et la liste des racines n'est pas plus lourde
 * que l'annuaire, qui vit sans index de tri depuis la 1c. ON POSE L'INDEX QUAND UNE MESURE
 * LE DEMANDERA, PAS SUR UNE INTUITION.
 */

/**
 * Compte les disciples ACTIFS d'un membre, sans `range` — REPLI de `disciplesParPage`
 * quand PostgREST refuse sa lecture paginée (`PGRST103`), cas où son `count` normal
 * n'arrive jamais. JAMAIS appelée EN AMONT pour pré-calculer une borne : ce serait ouvrir
 * la fenêtre de course que la ronde I1 du 2026-08-14 a refermée.
 */
async function compterDisciples(supabase: SupabaseClient, membreId: string): Promise<number> {
  const { count, error } = await supabase
    .from('membres')
    .select('id', { count: 'exact', head: true })
    .eq('faiseur_de_disciple_id', membreId)
    .eq('etat', 'actif')
  if (error) {
    throw new Error(`Comptage des disciples impossible : ${error.message}`)
  }
  return totalObligatoire(count, 'compterDisciples')
}

/**
 * Une page de disciples ACTIFS d'un membre (D94).
 *
 * `etat = 'actif'` EXPLICITEMENT, et pas seulement via la RLS (D93). Un filtre explicite
 * est une RÈGLE ÉNONCÉE ; un trou creusé par la RLS est un MENSONGE — le contenu de
 * l'écran dépendrait alors du lecteur sans que rien ne le dise. Conséquence directe et
 * voulue : un compte ordinaire et un administrateur voient LE MÊME ARBRE.
 *
 * `count: 'exact'` : le nœud affiche « N disciples », JAMAIS la longueur de la page.
 * `totalObligatoire` refuse un `count` absent — retomber sur la longueur de la page
 * annoncerait « 25 disciples » pour un faiseur qui en a deux cents.
 *
 * TRI TOTAL, `id` en TROISIÈME critère : `(nom, prenom)` n'est pas unique, et deux
 * homonymes exacts à cheval sur une frontière de page seraient rendus deux fois ou JAMAIS.
 *
 * `disciplesDe` N'EST NI APPELÉE NI MODIFIÉE (D94) : elle a un second appelant porteur, le
 * contrôle amont d'`archiverMembre`, qui doit rester COMPLET.
 */
export async function disciplesParPage(
  supabase: SupabaseClient,
  membreId: string,
  options?: { page?: number; taillePage?: number },
): Promise<PageLue<MembreBref>> {
  const taillePage = options?.taillePage ?? TAILLE_PAGE_DISCIPLES
  verifierTaillePage(taillePage, 'disciplesParPage')
  const page = Math.max(1, options?.page ?? 1)
  const debut = (page - 1) * taillePage

  const { data, error, count } = await supabase
    .from('membres')
    .select('id, nom, prenom', { count: 'exact' })
    .eq('faiseur_de_disciple_id', membreId)
    .eq('etat', 'actif')
    .order('nom')
    .order('prenom')
    .order('id')
    .range(debut, debut + taillePage - 1)

  if (error) {
    // `PGRST103` ATTRAPÉE ICI, SUR LA LECTURE ELLE-MÊME — motif éprouvé de
    // `listerMembres`, PAS le motif fragile qu'il a remplacé : pré-calculer la borne par
    // un premier aller-retour ouvre une fenêtre de course qu'une suppression concurrente
    // franchit. Page hors bornes (signet périmé, ou branche qui a rétréci depuis) :
    // PostgREST refuse la requête ENTIÈRE, `count` compris.
    if (error.code === 'PGRST103') {
      return { lignes: [], total: await compterDisciples(supabase, membreId) }
    }
    // Un échec ne doit pas être indistinguable d'un nœud sans disciple : annoncer
    // « aucun disciple » alors que la requête a échoué ferait croire à un faiseur de
    // disciple sans personne, ce qui est la même famille de mensonge que la troncature.
    throw new Error(`Lecture des disciples impossible : ${error.message}`)
  }

  return {
    lignes: (data ?? []).map((ligne) => ({
      id: ligne.id as string,
      nom: ligne.nom as string,
      prenom: ligne.prenom as string,
    })),
    total: totalObligatoire(count, 'disciplesParPage'),
  }
}

/** Repli de `racinesParPage`, même rôle et même interdiction que `compterDisciples`. */
async function compterRacines(supabase: SupabaseClient): Promise<number> {
  const { count, error } = await supabase
    .from('membres')
    .select('id', { count: 'exact', head: true })
    .is('faiseur_de_disciple_id', null)
    .eq('etat', 'actif')
  if (error) {
    throw new Error(`Comptage des membres sans faiseur de disciple impossible : ${error.message}`)
  }
  return totalObligatoire(count, 'compterRacines')
}

/**
 * Une page de membres ACTIFS SANS FAISEUR DE DISCIPLE (D95).
 *
 * ═══ « MEMBRES SANS FAISEUR DE DISCIPLE », PAS « RACINES » ═══
 * Le §6 de la spécification maîtresse SUPPOSE les racines peu nombreuses — « les tout
 * premiers sans faiseur de disciple, ce sont les racines de l'arbre ». RIEN NE LE
 * GARANTIT, et le code disait le contraire : `creerMembre` n'a jamais écrit de
 * `faiseur_de_disciple_id`, donc toute fiche créée depuis la 1a est une racine tant que
 * personne n'ouvre l'écran de rattachement. Appeler « racine » une fiche simplement jamais
 * rattachée prêterait une INTENTION à un OUBLI. L'écran le dit donc autrement, et
 * « racines de l'arbre » n'y est qu'une glose.
 *
 * LE TOTAL EST AFFICHÉ, sans euphémisme : c'est LA MESURE qui dira si la création enrichie
 * (volet 1) réduit le nombre de racines involontaires.
 *
 * `.is('faiseur_de_disciple_id', null)` : le B-tree
 * `membres_faiseur_de_disciple_id_idx` indexe les NULL et sert donc ce filtre.
 */
export async function racinesParPage(
  supabase: SupabaseClient,
  options?: { page?: number; taillePage?: number },
): Promise<PageLue<MembreBref>> {
  const taillePage = options?.taillePage ?? TAILLE_PAGE_RACINES
  verifierTaillePage(taillePage, 'racinesParPage')
  const page = Math.max(1, options?.page ?? 1)
  const debut = (page - 1) * taillePage

  const { data, error, count } = await supabase
    .from('membres')
    .select('id, nom, prenom', { count: 'exact' })
    .is('faiseur_de_disciple_id', null)
    .eq('etat', 'actif')
    .order('nom')
    .order('prenom')
    .order('id')
    .range(debut, debut + taillePage - 1)

  if (error) {
    if (error.code === 'PGRST103') {
      return { lignes: [], total: await compterRacines(supabase) }
    }
    throw new Error(`Lecture des membres sans faiseur de disciple impossible : ${error.message}`)
  }

  return {
    lignes: (data ?? []).map((ligne) => ({
      id: ligne.id as string,
      nom: ligne.nom as string,
      prenom: ligne.prenom as string,
    })),
    total: totalObligatoire(count, 'racinesParPage'),
  }
}

/**
 * Noms des maillons d'un chemin, filtrés `etat = 'actif'` EXPLICITEMENT (D93).
 *
 * ═══ POURQUOI CETTE FONCTION EXISTE, ET POURQUOI ELLE N'EST PAS `membresBrefsParIds` ═══
 *
 * `membresBrefsParIds` (`src/lib/donnees/membres.ts`) ne porte AUCUN filtre d'état et lit
 * sous RLS. Or la politique `membres_lecture` délègue à `prive.peut_lire_membre`, qui ouvre
 * TOUTE fiche à l'administrateur. Employée pour nommer les maillons d'un chemin, elle
 * produirait donc deux arbres différents : un administrateur lirait le NOM d'un maillon
 * archivé ou en attente, là où un compte ordinaire lit « Fiche non consultable ». L'écran,
 * lui, annonce que seuls les membres actifs y figurent — il mentirait.
 *
 * C'est exactement ce que D93 refuse : un filtre explicite est une RÈGLE ÉNONCÉE, un trou
 * creusé par la RLS est un MENSONGE. Ici, la règle est énoncée POUR TOUS LES RÔLES, et
 * l'exclusion ne dépend plus du lecteur.
 *
 * ═══ ET `membresBrefsParIds` N'EST PAS MODIFIÉE ═══
 * Elle a CINQ autres appelants (`ael/seances/[id]`, `demandes`, `membres/[id]/arbre` —
 * action et page —, `membres/[id]`), dont plusieurs doivent au contraire nommer des fiches
 * NON actives. Lui ajouter un filtre les casserait en silence. Même raison qui protège
 * `disciplesDe` en D94 : deux besoins différents, deux fonctions.
 *
 * ═══ CE QU'ELLE NE FAIT PAS ═══
 * Elle ne complète pas les trous. Un identifiant absent du résultat — parce que la fiche
 * n'est pas active, ou parce que la RLS la cache — est simplement ABSENT. C'est
 * `cheminAvecLibelles` (couche domaine) qui le rend « Fiche non consultable », À SA PLACE
 * dans le chemin : l'effacer ferait mentir l'écran sur la profondeur.
 *
 * Découpée en lots de 500, comme `membresBrefsParIds` : `.in('id', lot)` sur la clé
 * primaire ne peut jamais rendre plus de lignes que `lot.length`, donc aucun `.range()`
 * n'est nécessaire — mais un `ids` un jour plus long que `max_rows` (1000) resterait
 * tronqué par PostgREST sans ce découpage.
 */
export async function nomsMaillonsActifs(
  supabase: SupabaseClient,
  ids: readonly string[],
): Promise<MembreBref[]> {
  if (ids.length === 0) {
    return []
  }
  const TAILLE_LOT = 500
  const resultat: MembreBref[] = []
  for (let debut = 0; debut < ids.length; debut += TAILLE_LOT) {
    const lot = ids.slice(debut, debut + TAILLE_LOT)
    const { data, error } = await supabase
      .from('membres')
      .select('id, nom, prenom')
      .in('id', lot)
      .eq('etat', 'actif')
    // Un échec de lecture ne doit pas être indistinguable d'un maillon illisible : rendre
    // `[]` ferait afficher « Fiche non consultable » sur TOUT le chemin, et personne ne
    // saurait que la base est en panne.
    if (error) {
      throw new Error(`Lecture des maillons du chemin impossible : ${error.message}`)
    }
    resultat.push(
      ...(data ?? []).map((ligne) => ({
        id: ligne.id as string,
        nom: ligne.nom as string,
        prenom: ligne.prenom as string,
      })),
    )
  }
  return resultat
}

/**
 * Échappe une valeur destinée à une expression `or(...)` de PostgREST.
 *
 * NON DÉCORATIF. Dans `nom.lt.Dupont`, la valeur est lue jusqu'à la prochaine virgule ou
 * parenthèse : un nom contenant `,`, `(`, `)`, `.`, `"` ou `\` — « Dupont, Jean »,
 * « O'Neill (père) » — casserait l'expression, ou pire, la ferait porter sur autre chose
 * que ce qu'on croit. PostgREST accepte une valeur entre GUILLEMETS DOUBLES, dans lesquels
 * `"` et `\` s'échappent par `\`. On cite donc TOUJOURS, sans se demander si c'est
 * nécessaire : le jour où ça le devient, personne ne s'en apercevra autrement.
 */
function citerValeurPostgrest(valeur: string): string {
  return `"${valeur.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/**
 * Numéro de la page de `disciplesParPage(parentId, …)` qui CONTIENT `discipleId`.
 *
 * ═══ CE QUE CETTE FONCTION EMPÊCHE ═══
 * Sans elle, la recherche de l'écran `/arborescence` chargerait TOUJOURS la page 1 de
 * chaque maillon du chemin. Au premier maillon qui a plus de `TAILLE_PAGE_DISCIPLES`
 * disciples, si le maillon suivant n'est pas dans sa première page, la branche
 * s'arrêterait là : la personne cherchée ne serait JAMAIS rendue dans l'arbre, rien ne la
 * mettrait en évidence, et AUCUN message ne signalerait l'interruption — pendant que le
 * fil d'Ariane, lui, continuerait d'afficher le chemin complet. Deux vérités
 * contradictoires sur le même écran.
 *
 * ═══ COMMENT ═══
 * Le tri de `disciplesParPage` est `(nom, prenom, id)`. Le RANG du disciple visé est donc
 * le NOMBRE de ses frères actifs qui le précèdent strictement dans cet ordre, et sa page
 * est `floor(rang / taillePage) + 1`. Un seul aller-retour, un `count` exact, aucune ligne
 * ramenée.
 *
 * ═══ CE QU'ELLE RÉPOND QUAND ELLE NE SAIT PAS ═══
 * Si le disciple visé n'est pas lisible ou n'est pas actif, elle rend `1` — elle ne
 * prétend pas savoir où il est. **L'appelant ne doit donc PAS traiter son résultat comme
 * une garantie** : c'est à lui de constater, après chargement, que le maillon suivant
 * figure bien dans la page obtenue, et de le DIRE à l'écran sinon.
 */
export async function pageContenantDisciple(
  supabase: SupabaseClient,
  parentId: string,
  discipleId: string,
  taillePage: number,
): Promise<number> {
  verifierTaillePage(taillePage, 'pageContenantDisciple')

  const { data: cible, error: erreurCible } = await supabase
    .from('membres')
    .select('nom, prenom')
    .eq('id', discipleId)
    .eq('etat', 'actif')
    .maybeSingle()
  if (erreurCible) {
    throw new Error(`Lecture du disciple visé impossible : ${erreurCible.message}`)
  }
  if (!cible) {
    return 1
  }

  const nom = citerValeurPostgrest(cible.nom as string)
  const prenom = citerValeurPostgrest(cible.prenom as string)
  const { count, error } = await supabase
    .from('membres')
    .select('id', { count: 'exact', head: true })
    .eq('faiseur_de_disciple_id', parentId)
    .eq('etat', 'actif')
    .or(
      `nom.lt.${nom},` +
        `and(nom.eq.${nom},prenom.lt.${prenom}),` +
        `and(nom.eq.${nom},prenom.eq.${prenom},id.lt.${discipleId})`,
    )
  if (error) {
    throw new Error(`Comptage du rang du disciple impossible : ${error.message}`)
  }
  return Math.floor(totalObligatoire(count, 'pageContenantDisciple') / taillePage) + 1
}
```

- [ ] **Étape 2 : les enveloppes `server-only` dans `src/lib/donnees/arbre.ts`**

Ajouter en tête du fichier, à la suite des imports existants :

```ts
import {
  disciplesParPage,
  nomsMaillonsActifs,
  pageContenantDisciple,
  racinesParPage,
  TAILLE_PAGE_DISCIPLES,
} from './arbre-lots'
import type { PageLue } from './pagination'
```

Et à la **fin** du fichier — **sans toucher à `disciplesDe`, qui reste mot pour mot ce
qu'elle est (D94)** :

```ts
/**
 * Une page de disciples actifs, pour l'écran `/arborescence` (D94).
 *
 * DISTINCTE de `disciplesDe`, juste au-dessus, qui n'est NI appelée NI modifiée : celle-ci
 * n'a aucune borne et son tri n'est pas total, mais elle a un second appelant PORTEUR — le
 * contrôle amont d'`archiverMembre`, qui doit rester COMPLET et dont la sémantique ne doit
 * pas changer sous une pagination. Deux besoins différents, deux fonctions.
 */
export async function disciplesPage(membreId: string, page: number): Promise<PageLue<MembreBref>> {
  const supabase = await clientServeur()
  return disciplesParPage(supabase, membreId, { page })
}

/** Une page de membres actifs SANS faiseur de disciple (D95). Voir `racinesParPage`
 *  pour pourquoi l'écran ne les appelle pas « racines » sans nuance. */
export async function racinesPage(page: number): Promise<PageLue<MembreBref>> {
  const supabase = await clientServeur()
  return racinesParPage(supabase, { page })
}

/**
 * Noms des maillons d'un chemin, filtrés `etat = 'actif'` EXPLICITEMENT (D93).
 *
 * DISTINCTE de `membresBrefsParIds` (`src/lib/donnees/membres.ts`), qui n'a AUCUN filtre
 * d'état et qu'on ne modifie PAS : elle a cinq autres appelants, dont plusieurs doivent au
 * contraire nommer des fiches non actives. Sans ce filtre explicite, l'exclusion des
 * fiches `archive` et `en_attente` du chemin serait entièrement déléguée à la RLS — un
 * administrateur verrait le NOM là où un compte ordinaire lit « Fiche non consultable »,
 * et l'écran mentirait sur sa propre légende.
 */
export async function nomsMaillonsChemin(ids: readonly string[]): Promise<MembreBref[]> {
  const supabase = await clientServeur()
  return nomsMaillonsActifs(supabase, ids)
}

/**
 * Numéro de la page de disciples de `parentId` qui CONTIENT `discipleId`, à la taille de
 * page réelle de l'écran.
 *
 * Sans elle, la recherche de `/arborescence` chargerait toujours la page 1 de chaque
 * maillon, et la branche s'arrêterait au premier maillon à plus de
 * `TAILLE_PAGE_DISCIPLES` disciples — la personne cherchée disparaîtrait de son propre
 * chemin, SANS AUCUN SIGNAL.
 */
export async function pageDuDisciple(parentId: string, discipleId: string): Promise<number> {
  const supabase = await clientServeur()
  return pageContenantDisciple(supabase, parentId, discipleId, TAILLE_PAGE_DISCIPLES)
}
```

- [ ] **Étape 3 : vérifier que `disciplesDe` n'a pas bougé**

```bash
git diff src/lib/donnees/arbre.ts
```

**Le diff ne doit montrer que des AJOUTS** : deux lignes d'import et deux fonctions en fin
de fichier. **Aucune ligne du corps de `disciplesDe` ne doit apparaître comme modifiée.**
Si c'est le cas, annuler et recommencer.

- [ ] **Étape 4 : les portes rapides, puis commit**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls
```

```bash
git add src/lib/donnees/arbre-lots.ts src/lib/donnees/arbre.ts
git commit -m "feat: lectures paginees a tri total des disciples et des racines (D93, D94, D95)"
```

**Preuve produite :** la sortie de `git diff` montrant que `disciplesDe` est intacte. Les
preuves de pagination et de tri total sont écrites en **Task 13**.

---

### Task 11 : les Server Actions de `/arborescence` (D92, D97, D98, D103)

**Fichiers :**
- Créer : `src/app/arborescence/messages.ts`
- Créer : `src/app/arborescence/actions.ts`

**Interfaces :**
- Consomme : `disciplesPage`, `nomsMaillonsChemin`, `pageDuDisciple`,
  `TAILLE_PAGE_DISCIPLES` (Task 10) ; `ancetresDeMembre` (existant) ;
  `cheminAvecLibelles`, `MaillonNomme` (Task 9) ; `exigerProfilActif` (existant).
  **`membresBrefsParIds` n'est PAS consommée par ce module**, et son absence est un choix
  écrit : elle ne porte aucun filtre d'état.
- Produit :
  ```ts
  export type PageDisciples = {
    disciples: Array<{ id: string; nom: string; prenom: string }>
    total: number
    page: number
    pages: number
  }
  export async function chargerDisciples(membreId: string, page: number): Promise<PageDisciples>
  export async function chargerChemin(membreId: string): Promise<MaillonNomme[]>
  export async function pageContenant(parentId: string, discipleId: string): Promise<number>
  export const MESSAGE_ECHEC_LECTURE_NOEUD: string
  export const MESSAGE_ECHEC_LECTURE_CHEMIN: string
  export const MESSAGE_CHEMIN_PARTIEL: string
  ```
  Consommées par la Task 12.

## ⚠️ CE MODULE NE CONTIENT AUCUNE ÉCRITURE, ET C'EST UNE ASSERTION À VÉRIFIER (D92)

La phase 5, volet 2, n'ajoute **aucune** Server Action d'écriture, **aucune** passerelle,
**aucun** marqueur, **aucune** politique RLS, **aucun** déclencheur. Le recensement des
chemins d'écriture est **vide pour ce volet**, et **ce vide est lui-même une assertion**,
pas un constat : la Task 13 le balaye module par module.

Concrètement, dans ce fichier : **aucun `clientAdmin()` d'écriture, aucun `insert`,
`update`, `delete`, ni `rpc` d'écriture.** L'unique usage de la clé de service est la
lecture **affranchie de la RLS** de la **forme** du chemin (D19, D98), et il est isolé dans
`ancetresDeMembre`, qui existait déjà.

## ⚠️ TOUTE FONCTION EXPORTÉE D'UN FICHIER `'use server'` EST APPELABLE DEPUIS LE NAVIGATEUR — Y COMPRIS QUAND ELLE NE FAIT QUE LIRE (D103)

`exigerProfilActif` est la **première instruction** des deux actions. Précédent exact et
commenté : `src/app/membres/recherche-action.ts` (1c). **D2 ouvre l'annuaire à tout compte
actif — pas aux visiteurs.**

- [ ] **Étape 1 : les messages**

Créer `src/app/arborescence/messages.ts` :

```ts
/**
 * Messages STATIQUES, affichés par le composant client quand une lecture échoue.
 *
 * ═══ POURQUOI DES CONSTANTES, ET JAMAIS `error.message` ═══
 * Les actions de ce dossier LÈVENT sur un échec de lecture — jamais `[]` : rendre une
 * liste vide sur une erreur ferait croire à un faiseur de disciple sans personne, ce qui
 * est la même famille de mensonge que la troncature silencieuse.
 *
 * Mais le composant client, lui, ATTRAPE cette exception pour rester utilisable — et c'est
 * précisément le cas où le message serait remplacé par un digest React en build de
 * PRODUCTION (`Minified React error #441`). `comptes/ligne-compte.tsx` est le seul autre
 * composant du dépôt dans ce cas, et il est connu, mesuré, non corrigé.
 *
 * On n'affiche donc JAMAIS `error.message` ici : on affiche ces constantes, et l'objet
 * d'erreur part dans `console.error` côté navigateur, où il reste exploitable.
 */

export const MESSAGE_ECHEC_LECTURE_NOEUD =
  "Les disciples de ce membre n'ont pas pu être chargés. Réessayez ; si le problème persiste, contactez un administrateur technique."

export const MESSAGE_ECHEC_LECTURE_CHEMIN =
  "Le chemin de cette personne dans l'arbre n'a pas pu être chargé. Réessayez ; si le problème persiste, contactez un administrateur technique."

/**
 * Le chemin a été chargé, mais l'arbre n'a pas pu être déplié JUSQU'À la personne visée.
 *
 * ═══ POURQUOI CE MESSAGE EXISTE, ET POURQUOI SON ABSENCE SERAIT GRAVE ═══
 * L'écran déplie le chemin maillon par maillon, en chargeant pour chacun la page de
 * disciples qui contient le maillon suivant. Si ce calcul ne peut pas aboutir — maillon
 * intermédiaire devenu illisible ou non actif, branche modifiée entre les deux lectures —,
 * la personne cherchée n'apparaît PAS dans l'arbre, alors que le fil d'Ariane, lui,
 * continue d'afficher son chemin complet. Deux vérités contradictoires sur le même écran :
 * exactement ce que cet écran refuse ailleurs. Le dire est le minimum.
 */
export const MESSAGE_CHEMIN_PARTIEL =
  "Le chemin de cette personne est affiché ci-dessus, mais l'arbre n'a pas pu être déplié jusqu'à elle. Ouvrez sa fiche depuis le chemin, ou dépliez la branche à la main."
```

- [ ] **Étape 2 : les actions**

Créer `src/app/arborescence/actions.ts` :

```ts
'use server'

import { cheminAvecLibelles, type MaillonNomme } from '@/lib/domaine/arbre'
import {
  ancetresDeMembre,
  disciplesPage,
  nomsMaillonsChemin,
  pageDuDisciple,
} from '@/lib/donnees/arbre'
import { TAILLE_PAGE_DISCIPLES } from '@/lib/donnees/arbre-lots'
import { exigerProfilActif } from '@/lib/securite/garde'

/**
 * ═══ AUCUNE ÉCRITURE DANS CE FICHIER (D92). ═══
 * La phase 5, volet 2, n'ajoute aucune Server Action d'écriture, aucune passerelle, aucun
 * marqueur, aucune politique, aucun déclencheur. Un écran d'arbre qui rattacherait serait
 * le QUATRIÈME chemin d'écriture vers `faiseur_de_disciple_id`, sur un écran où l'on
 * navigue vite et où l'on clique par erreur. Les rattachements restent sur
 * `/membres/[id]/arbre`, où la portée d'autorité, le verrou consultatif et le garde-fou
 * anti-cycle sont déjà éprouvés.
 *
 * Ce vide est une ASSERTION À VÉRIFIER, pas un constat : `tests/rls/arborescence.test.ts`
 * balaye ce dossier à la recherche de tout `insert`, `update`, `delete`, `rpc` d'écriture
 * ou `clientAdmin()`.
 */

export type DiscipleLigne = { id: string; nom: string; prenom: string }

export type PageDisciples = {
  disciples: DiscipleLigne[]
  total: number
  page: number
  pages: number
}

/**
 * Les disciples actifs d'un nœud, une page à la fois (D94, D101).
 *
 * ═══ LE GARDE EST LA PREMIÈRE INSTRUCTION (D103) ═══
 * Toute fonction exportée d'un fichier `'use server'` est appelable depuis le navigateur,
 * Y COMPRIS quand elle ne fait que LIRE. Précédent exact et commenté :
 * `src/app/membres/recherche-action.ts` (1c). D2 ouvre l'annuaire à tout compte actif —
 * pas aux visiteurs.
 *
 * ═══ AUCUN INDICATEUR « CE NŒUD A DES DISCIPLES » N'EST CALCULÉ D'AVANCE (D101) ═══
 * Un indicateur par enfant, c'est UNE REQUÊTE PAR ENFANT — N+1 sur chaque page dépliée —
 * et PostgREST ne sait pas agréger. L'alternative serait une vue d'agrégation : un objet
 * permanent en base, avec sa RLS à écrire et à prouver, POUR UN CHEVRON. On préfère un
 * aller-retour de trop, à la demande de l'utilisateur, à N requêtes systématiques que
 * personne n'a demandées. Tout membre actif est donc dépliable, et déplier une feuille
 * affiche « Aucun disciple actif rattaché. »
 *
 * `pages` vaut TOUJOURS au moins 1, même sur un nœud sans disciple : l'appelant s'en sert
 * pour borner sa navigation, et un `0` y produirait des comparaisons fausses.
 */
export async function chargerDisciples(membreId: string, page: number): Promise<PageDisciples> {
  await exigerProfilActif()

  const pageDemandee = Number.isInteger(page) && page > 0 ? page : 1
  // `disciplesPage` LÈVE sur un échec de lecture, et ne rend jamais `[]` : un échec ne doit
  // pas être indistinguable d'un nœud sans disciple. L'exception remonte ici telle quelle,
  // et le composant client l'attrape pour afficher un message STATIQUE.
  const { lignes, total } = await disciplesPage(membreId, pageDemandee)

  return {
    disciples: lignes,
    total,
    page: pageDemandee,
    pages: Math.max(1, Math.ceil(total / TAILLE_PAGE_DISCIPLES)),
  }
}

/**
 * Le chemin d'une personne, de la RACINE jusqu'à elle, prêt à afficher (D97, D98).
 *
 * ═══ DEUX LECTURES, DEUX RÉGIMES, ET C'EST LE POINT LE PLUS DÉLICAT DE L'ÉCRAN ═══
 *
 * | Étape | Lecture | Sous RLS ? | Filtre d'état ? |
 * |---|---|---|---|
 * | la FORME du chemin | `public.ancetres_membre`, `security definer` | NON (D19) | aucun |
 * | les NOMS | `nomsMaillonsChemin` via `clientServeur()` | OUI | `etat = 'actif'`, EXPLICITE |
 * | l'AFFICHAGE de chaque maillon | `libelleFiche` (D100) | — | — |
 *
 * AUCUN NOM LU AFFRANCHI DE LA RLS N'ATTEINT JAMAIS L'ÉCRAN : la lecture affranchie ne
 * rend que des IDENTIFIANTS, et les noms sont relus sous RLS, comme partout ailleurs. Un
 * maillon que l'appelant ne peut pas lire devient « Fiche non consultable », À SA PLACE
 * dans le chemin, jamais effacé ni sauté — l'effacer ferait mentir l'écran sur la
 * profondeur et pourrait détacher toute la descendance.
 *
 * ═══ LE FILTRE `etat = 'actif'` EST EXPLICITE ICI AUSSI, ET POUR TOUS LES RÔLES (D93) ═══
 *
 * `nomsMaillonsChemin` porte un `.eq('etat', 'actif')` ÉCRIT. Ce n'est pas une précaution
 * décorative : la politique `membres_lecture` délègue à `prive.peut_lire_membre`, qui
 * ouvre TOUTE fiche à l'administrateur. Nommer les maillons par une lecture sans filtre
 * d'état produirait donc DEUX ARBRES : l'administrateur lirait le nom d'un maillon
 * archivé ou en attente, là où un compte ordinaire lit « Fiche non consultable » — et
 * l'écran, qui annonce que seuls les membres actifs y figurent, mentirait à l'un des deux.
 * Un filtre explicite est une RÈGLE ÉNONCÉE ; un trou creusé par la RLS est un MENSONGE.
 * NE JAMAIS remplacer cet appel par une lecture sans filtre d'état pour « simplifier ».
 *
 * ═══ L'INVARIANT QUE TROIS DÉCLENCHEURS TIENNENT, ET CE QU'IL COUVRE EXACTEMENT (D99) ═══
 *
 *   AUCUN MEMBRE `actif` N'A D'ANCÊTRE QUI NE SOIT PAS `actif`.
 *
 * `public.etat_membre` a TROIS valeurs — `en_attente`, `actif`, `archive` — et l'énoncé
 * porte bien sur les trois : l'arborescence exclut `en_attente` EXACTEMENT comme
 * `archive`, et un maillon `en_attente` rendrait toute sa descendance active
 * INATTEIGNABLE depuis la liste des racines. Trois barrières le tiennent, chacune fermant
 * une porte différente :
 *  - `membres_archivage_faiseur_de_disciple` (20260814120000, élargie en phase 5) refuse
 *    à un membre de QUITTER l'état actif tant qu'il a des disciples actifs — vers
 *    `archive` comme vers `en_attente` ;
 *  - `membres_desarchivage_faiseur_archive` (20260814140000, élargie en phase 5) est
 *    `before update of etat` et couvre TOUTE transition vers `actif`, y compris
 *    `en_attente -> actif`, donc la validation d'une demande ; elle refuse un faiseur qui
 *    n'est pas actif ;
 *  - `membres_faiseur_de_disciple_archive` (20260814150000, élargie en phase 5) refuse de
 *    rattacher à un faiseur qui n'est pas actif, à l'`insert` COMME à l'`update`.
 *
 * Les deux gardes qui lisent l'état du faiseur le lisent SOUS VERROU DE LIGNE
 * (`for share`), et `public.definir_arbre` aussi : sans cela, un rattachement et un
 * archivage concurrents ne se voyaient pas et validaient tous les deux — la classe de
 * défaut que la 1c a jugée inacceptable.
 *
 * ═══ ET POURTANT « FICHE NON CONSULTABLE » EST TRAITÉ, ET CE N'EST PAS UNE REDONDANCE ═══
 *
 * Cet écran ne s'appuie PAS sur l'invariant pour être correct. Ce n'est pas une défense
 * théorique : la RLS, elle, ne connaît pas cet invariant, et un compte ordinaire ne lit de
 * toute façon pas toutes les fiches. Le filtre explicite ci-dessus et le repli
 * « Fiche non consultable » rendent l'écran juste QUE L'INVARIANT TIENNE OU NON — c'est la
 * seule parade qui ne dépende pas d'une propriété maintenue ailleurs, par du code que ce
 * module ne relit jamais.
 *
 * Le chemin est borné à 64 niveaux par `ancetres_membre` elle-même — borne posée en 1c et
 * qualifiée de « seule protection restante si une donnée corrompue franchissait un jour
 * les barrières ».
 */
export async function chargerChemin(membreId: string): Promise<MaillonNomme[]> {
  await exigerProfilActif()

  // `ancetresDeMembre` rend les ancêtres du PLUS PROCHE au PLUS LOINTAIN, le membre
  // lui-même EXCLU (nul n'est son propre ancêtre, §5.1). On inverse pour partir de la
  // racine, et on ajoute le membre visé en queue : c'est LUI que l'écran met en évidence.
  const ancetres = await ancetresDeMembre(membreId)
  const identifiants = [...ancetres].reverse().concat(membreId)

  // Les NOMS, sous RLS ET filtrés `etat = 'actif'` explicitement. Découpage en lots de
  // 500 : le chemin est borné à 64, donc un seul lot — mais on ne s'appuie pas sur ce
  // raisonnement, la fonction partagée porte déjà la garantie.
  const brefs = await nomsMaillonsChemin(identifiants)

  return cheminAvecLibelles(identifiants, brefs)
}

/**
 * Numéro de la page de disciples de `parentId` qui CONTIENT `discipleId` (D97).
 *
 * ═══ LE GARDE EST LA PREMIÈRE INSTRUCTION (D103) ═══
 * Toute fonction exportée d'un fichier `'use server'` est appelable depuis le navigateur,
 * Y COMPRIS quand elle ne fait que LIRE et ne rend qu'un nombre. Un numéro de page est
 * déjà une information sur l'arbre : combien de personnes précèdent celle-là sous ce
 * faiseur. Précédent exact et commenté : `src/app/membres/recherche-action.ts` (1c).
 *
 * ═══ POURQUOI L'ÉCRAN EN A BESOIN ═══
 * La recherche déplie le chemin maillon par maillon. Sans ce calcul, elle chargerait
 * toujours la PAGE 1 de chaque maillon : au premier maillon à plus de
 * `TAILLE_PAGE_DISCIPLES` disciples dont le suivant n'est pas dans la première page, la
 * branche s'arrêterait là. La personne cherchée ne serait jamais rendue, rien ne la
 * mettrait en évidence, et AUCUN message ne signalerait l'interruption — pendant que le
 * fil d'Ariane continuerait d'afficher le chemin complet.
 *
 * ═══ ELLE NE GARANTIT RIEN, ET L'APPELANT DOIT LE SAVOIR ═══
 * Si le disciple visé n'est pas lisible ou n'est pas actif, elle rend `1` : elle ne
 * prétend pas savoir où il est. C'est à l'appelant de constater, après chargement, que le
 * maillon suivant figure bien dans la page obtenue, et de le DIRE à l'écran sinon.
 */
export async function pageContenant(parentId: string, discipleId: string): Promise<number> {
  await exigerProfilActif()
  return pageDuDisciple(parentId, discipleId)
}
```

- [ ] **Étape 3 : vérifier le vide d'écriture, à la main, AVANT que la Task 13 ne l'automatise**

## ⚠️ LE BALAYAGE PORTE SUR LE CODE, PAS SUR LES COMMENTAIRES — ET SI CE BALAYAGE EST ROUGE, LA RÉPONSE N'EST **JAMAIS** D'ÉLARGIR OU D'ASSOUPLIR LE MOTIF

Ce module **PARLE** de la clé de service — il explique en commentaire pourquoi il ne
l'emploie pas — **sans jamais l'appeler**. Un balayage qui confond une occurrence de code
et une occurrence de commentaire ne prouve rien de plus qu'une **interdiction de
vocabulaire**, et il rendrait rouge un fichier parfaitement correct.

**Le danger n'est pas la ligne rouge : c'est la réparation naturelle.** Devant un motif qui
« trouve » quelque chose dans un fichier qui n'écrit rien, la tentation est de rétrécir le
motif — ou de supprimer le commentaire qui porte l'explication la plus importante du
module. Dans les deux cas, la barrière D92 sortirait **dégradée de sa propre preuve**.

**RÈGLE, sans exception :** le motif recherché ne se touche pas. Si le balayage rend une
ligne, on lit la ligne. Si c'est du **code**, on retire le code. Si c'est un **commentaire**
que le filtre ci-dessous n'a pas écarté, on corrige le **filtre**, jamais le motif.

```bash
grep -nE "clientAdmin|\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(" src/app/arborescence/ \
  | grep -vE ':[[:space:]]*(\*|//|/\*)'
```

Le second `grep` écarte les lignes dont le premier caractère non blanc est `*`, `//` ou
`/*` — c'est-à-dire les lignes de commentaire et les continuations de bloc.

**Attendu : aucune ligne.** `ancetresDeMembre` appelle bien la clé de service et un `rpc`,
mais **dans `src/lib/donnees/arbre.ts`**, pas ici — c'est exactement la frontière que ce
balayage doit voir.

**Contrôle du filtre lui-même**, sans lequel on ne saurait pas s'il écarte trop :

```bash
grep -nE "clientAdmin|\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(" src/app/arborescence/
```

**Attendu : au moins une ligne, et TOUTES de commentaire.** Il y en a une, voulue : celle
qui, dans l'en-tête d'`actions.ts`, nomme la frontière que ce balayage doit voir.
**Consigner ces lignes verbatim dans le rapport de tâche**, avec la mention « occurrences
de COMMENTAIRE, voulues ». Si cette commande ne rend **rien**, ce n'est pas une bonne
nouvelle : c'est que le commentaire a été supprimé, ou que le motif ne fonctionne plus.

**CONTRÔLE POSITIF du balayage** — sans lui, une commande mal formée rendrait « aucune
ligne » pour toujours :

```bash
grep -nE "clientAdmin|\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(" src/app/membres/actions.ts \
  | grep -vE ':[[:space:]]*(\*|//|/\*)'
```

**Attendu : plusieurs lignes**, et ce sont de vraies écritures. Le contrôle positif passe
par **le même filtre** que le balayage : un contrôle positif qui ne franchirait pas le
filtre ne prouverait pas que le filtre laisse passer le code.

- [ ] **Étape 4 : les portes rapides, puis commit**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls
```

```bash
git add src/app/arborescence/messages.ts src/app/arborescence/actions.ts
git commit -m "feat: actions de lecture gardees de l'arborescence (D92, D97, D98, D103)"
```

**Livrable indépendamment éprouvable :** deux actions gardées, sans aucune écriture, dont
le chemin sépare rigoureusement la **forme** (affranchie) des **noms** (sous RLS).

---

### Task 12 : l'écran `/arborescence` (D91, D93, D95, D97, D101, D104, D105)

**Fichiers :**
- Créer : `src/app/arborescence/page.tsx`
- Créer : `src/app/arborescence/arborescence.tsx`
- Modifier : `src/app/tableau-de-bord/page.tsx`
- Modifier : `src/app/membres/[id]/page.tsx`

**Interfaces :**
- Consomme : `racinesPage`, `TAILLE_PAGE_RACINES` (Task 10) ; `chargerDisciples`,
  `chargerChemin`, `pageContenant`, `PageDisciples`, `MESSAGE_ECHEC_LECTURE_NOEUD`,
  `MESSAGE_ECHEC_LECTURE_CHEMIN`, `MESSAGE_CHEMIN_PARTIEL` (Task 11) ;
  `MaillonNomme` (Task 9) ; `SelecteurMembre`
  (existant, 1c, **réutilisé sans modification**) ; `exigerProfilActif`,
  `estAdministrateur` (existants) ; `pageDemandee` (existant, `pagination.ts`).
- Produit : la route `/arborescence`, et deux liens vers elle.

**D91 — POURQUOI `/arborescence` ET NON `/membres/[id]/arbre`.** Deux écrans dont les noms
diffèrent d'un mot et dont les **droits diffèrent entièrement** — consultation par tout
compte actif d'un côté, édition par l'administrateur seul de l'autre — c'est ainsi qu'un
garde finit par être confondu. Le vocabulaire existe déjà et il est distinct : la
spécification appelle **arborescence** la *structure* et **rattachement** le *geste*
(`/membres/[id]/arbre`, dont le titre à l'écran dit d'ailleurs « Rattachement de … »).
**L'ancienne route n'est pas renommée** : elle est déployée et liée depuis la fiche.

- [ ] **Étape 1 : la page serveur**

Créer `src/app/arborescence/page.tsx` :

```tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { racinesPage } from '@/lib/donnees/arbre'
import { TAILLE_PAGE_RACINES } from '@/lib/donnees/arbre-lots'
import { pageDemandee } from '@/lib/donnees/pagination'
import { estAdministrateur, exigerProfilActif } from '@/lib/securite/garde'
import { Arborescence } from './arborescence'

/**
 * L'arbre des faiseurs de disciple, parcourable (D91).
 *
 * CONSULTATION OUVERTE À TOUT COMPTE ACTIF (`exigerProfilActif`), conformément à D2 et
 * D20 : toute fiche `actif` est lisible de tout compte actif, filiation comprise. Le
 * contenu de l'arbre est donc, en droit, ouvert à tous — et D93 (filtre explicite
 * `etat = 'actif'`) fait que TOUS voient LE MÊME ARBRE : les fiches `en_attente` et
 * `archive` n'apparaissent pas parce qu'une RÈGLE ÉNONCÉE les exclut pour tout le monde,
 * et non parce que la RLS les cacherait à certains.
 *
 * `estAdministrateur()` n'est employé ici que pour DÉCIDER D'AFFICHER le lien
 * « Rattacher » vers l'écran existant — UN LIEN, PAS UN POUVOIR. La protection de ce geste
 * est `exigerAdministrateur` dans `/membres/[id]/arbre`, et elle seule.
 */
export default async function PageArborescence({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  await exigerProfilActif()
  const parametres = await searchParams
  const page = pageDemandee(parametres.page)

  const [{ lignes: racines, total }, estAdmin] = await Promise.all([
    racinesPage(page),
    estAdministrateur(),
  ])

  const pages = Math.max(1, Math.ceil(total / TAILLE_PAGE_RACINES))

  // Une adresse pointant au-delà de la dernière page réelle est un signet périmé (ou une
  // liste qui a rétréci depuis). Sans ce garde, l'en-tête annoncerait « page 99 sur 2 »
  // pendant que le corps affirmerait qu'il n'y a personne — deux vérités contradictoires
  // sur le même écran. Pas de boucle possible : `pages` vaut toujours au moins 1, et la
  // cible est `pages` lui-même.
  // HORS de tout `try` : `redirect()` lève une exception de contrôle Next.js (aucun `try`
  // ici de toute façon — vérifié).
  if (page > pages) {
    redirect(`/arborescence?page=${pages}`)
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/tableau-de-bord" className="text-sm underline underline-offset-4">
        Retour au tableau de bord
      </Link>

      <header className="mt-4 mb-8">
        <h1 className="text-2xl font-semibold">Arborescence</h1>
        {/*
          LA LÉGENDE DIT EXACTEMENT CE QUE LE CODE FAIT, ET PAS UN MOT DE PLUS.
          « Seuls les membres actifs y figurent » est vrai parce que les TROIS lectures de
          cet écran portent un `etat = 'actif'` ÉCRIT — les disciples, les racines, et les
          noms des maillons du chemin —, et non parce que la RLS cacherait quelque chose à
          certains. La seconde phrase existe parce que la première, seule, serait un
          demi-mensonge : un maillon non actif ne DISPARAÎT pas du chemin, il y garde sa
          place sans nom, faute de quoi l'écran mentirait sur la profondeur. Ne pas retirer
          cette phrase sans retirer le repli qu'elle décrit.
        */}
        <p className="mt-1 text-sm text-neutral-500">
          L&apos;arbre des faiseurs de disciple, déplié à la demande. Seuls les membres
          actifs y figurent ; dans le chemin d&apos;une personne, un maillon qui ne
          l&apos;est pas garde sa place, sans son nom.
        </p>
      </header>

      {/*
        D95 — « MEMBRES SANS FAISEUR DE DISCIPLE », et « racines de l'arbre » en glose.
        Appeler « racine » une fiche que personne n'a rattachée prêterait une INTENTION à
        un OUBLI : `creerMembre` n'a jamais écrit de `faiseur_de_disciple_id`, donc toute
        fiche créée depuis la phase 1a en est une jusqu'à ce que quelqu'un ouvre l'écran de
        rattachement.

        LE TOTAL EST AFFICHÉ SANS EUPHÉMISME : c'est LA MESURE qui dira si la création
        enrichie (volet 1) réduit le nombre de racines involontaires.
      */}
      <Arborescence
        racines={racines}
        totalRacines={total}
        page={page}
        pages={pages}
        estAdmin={estAdmin}
      />
    </main>
  )
}
```

- [ ] **Étape 2 : le composant client**

Créer `src/app/arborescence/arborescence.tsx` :

```tsx
'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { SelecteurMembre } from '@/app/membres/selecteur-membre'
import type { MaillonNomme } from '@/lib/domaine/arbre'
// La CONSTANTE, jamais la chaîne recopiée : trois copies du même texte en feraient trois
// vérités, et c'est exactement ce que D100 vient de supprimer.
import { LIBELLE_FICHE_NON_CONSULTABLE } from '@/lib/domaine/membre'
import type { MembreBref } from '@/lib/donnees/membres'
import { chargerChemin, chargerDisciples, pageContenant, type PageDisciples } from './actions'
import {
  MESSAGE_CHEMIN_PARTIEL,
  MESSAGE_ECHEC_LECTURE_CHEMIN,
  MESSAGE_ECHEC_LECTURE_NOEUD,
} from './messages'

/**
 * ═══ D104 — L'INDENTATION EST PLAFONNÉE, ET LE FIL D'ARIANE PORTE LE RESTE ═══
 * Interface mobile d'abord (§3 de la spécification maîtresse). Une indentation
 * proportionnelle à la profondeur épuise la largeur d'un téléphone vers le cinquième
 * niveau, et l'arbre devient illisible LÀ OÙ IL EST LE PLUS CONSULTÉ. Au-delà du plafond,
 * le niveau est écrit en toutes lettres sur le nœud : c'est l'information que
 * l'indentation ne peut plus porter.
 */
const PROFONDEUR_MAX_INDENTATION = 4
const DECALAGE_PAR_NIVEAU_REM = 1.25

type Props = {
  racines: MembreBref[]
  totalRacines: number
  page: number
  pages: number
  estAdmin: boolean
}

type EtatArbre = {
  /** Une page de disciples par nœud déjà chargé. */
  noeuds: Record<string, PageDisciples>
  /** Nœuds actuellement dépliés. */
  deplies: string[]
  /** Nœuds en cours de chargement. */
  enCours: string[]
  /** Message d'échec par nœud. STATIQUE : voir `messages.ts`. */
  erreurs: Record<string, string>
}

const etatInitial: EtatArbre = { noeuds: {}, deplies: [], enCours: [], erreurs: {} }

export function Arborescence({ racines, totalRacines, page, pages, estAdmin }: Props) {
  const [etat, setEtat] = useState<EtatArbre>(etatInitial)
  const [chemin, setChemin] = useState<MaillonNomme[] | null>(null)
  const [cibleId, setCibleId] = useState<string | null>(null)
  const [erreurChemin, setErreurChemin] = useState<string | null>(null)
  // Le chemin a bien été lu, mais l'arbre n'a pas pu être déplié JUSQU'À la cible. Distinct
  // d'`erreurChemin` : là, rien n'est affiché ; ici, le fil d'Ariane est juste et seul
  // l'arbre est incomplet. Les confondre dirait à l'utilisateur que rien n'a marché alors
  // qu'il a sous les yeux le chemin complet.
  const [avertissementChemin, setAvertissementChemin] = useState<string | null>(null)
  const [rechercheEnCours, demarrerRecherche] = useTransition()

  async function lireNoeud(membreId: string, numeroPage: number): Promise<PageDisciples | null> {
    setEtat((precedent) => ({
      ...precedent,
      enCours: [...precedent.enCours, membreId],
      erreurs: { ...precedent.erreurs, [membreId]: '' },
    }))
    try {
      const resultat = await chargerDisciples(membreId, numeroPage)
      setEtat((precedent) => ({
        ...precedent,
        noeuds: { ...precedent.noeuds, [membreId]: resultat },
        enCours: precedent.enCours.filter((identifiant) => identifiant !== membreId),
      }))
      return resultat
    } catch (erreur) {
      // JAMAIS `error.message` : ce composant ATTRAPE l'exception, et c'est précisément le
      // cas où React la remplace par un digest en build de PRODUCTION. On affiche un texte
      // STATIQUE, et l'objet part dans la console du navigateur, où il reste exploitable.
      console.error('arborescence : lecture des disciples impossible', { membreId, erreur })
      setEtat((precedent) => ({
        ...precedent,
        enCours: precedent.enCours.filter((identifiant) => identifiant !== membreId),
        erreurs: { ...precedent.erreurs, [membreId]: MESSAGE_ECHEC_LECTURE_NOEUD },
      }))
      return null
    }
  }

  /**
   * ═══ D105 — REFUS DE REDÉPLIER UN NŒUD DÉJÀ PRÉSENT DANS LA BRANCHE COURANTE ═══
   *
   * Les deux barrières anti-cycle (`membres_anti_cycle`, et la vérification de
   * `public.definir_arbre`) rendent un cycle IMPOSSIBLE DANS LA DONNÉE. L'AFFICHAGE NE
   * DOIT PAS EN DÉPENDRE : un dépliage automatique piloté par la recherche, sur une donnée
   * corrompue, BOUCLERAIT DANS LE NAVIGATEUR — l'onglet se fige, et rien n'indique
   * pourquoi. Même raisonnement que la borne à 64 niveaux des fonctions récursives, « la
   * seule protection restante si une donnée corrompue franchissait un jour les barrières »
   * (1c, piège n°5).
   *
   * `ancetres` porte les identifiants des nœuds AU-DESSUS de celui-ci dans la branche
   * RENDUE — pas dans l'arbre en base : c'est bien le cycle d'AFFICHAGE qu'on ferme.
   */
  function basculer(membreId: string, ancetres: readonly string[]) {
    if (ancetres.includes(membreId)) {
      console.error(
        'arborescence : dépliage refusé, ce membre est déjà présent dans la branche affichée — donnée incohérente ?',
        { membreId, ancetres },
      )
      return
    }
    const dejaDeplie = etat.deplies.includes(membreId)
    if (dejaDeplie) {
      setEtat((precedent) => ({
        ...precedent,
        deplies: precedent.deplies.filter((identifiant) => identifiant !== membreId),
      }))
      return
    }
    setEtat((precedent) => ({ ...precedent, deplies: [...precedent.deplies, membreId] }))
    if (!etat.noeuds[membreId]) {
      void lireNoeud(membreId, 1)
    }
  }

  function changerPage(membreId: string, numeroPage: number) {
    void lireNoeud(membreId, numeroPage)
  }

  /**
   * ═══ D97 — LA RECHERCHE MÈNE À UNE PERSONNE, ET MONTRE LES DEUX CHOSES À LA FOIS ═══
   *
   * Son CHEMIN DEPUIS LA RACINE, déplié, la personne mise en évidence, ET la première page
   * de SES disciples. Montrer la seule personne perdrait le « où dans l'arbre », qui est
   * toute la raison d'être de cet écran — on l'a déjà sur `/membres/[id]`. Montrer les
   * seuls ancêtres ne répondrait pas à « qui suit-il ? ». C'est le SEUL état de l'écran
   * qui répond aux deux questions à la fois.
   *
   * ═══ CHAQUE MAILLON EST CHARGÉ DANS LA PAGE QUI CONTIENT LE MAILLON SUIVANT ═══
   *
   * PAS la page 1. Le rendu d'un nœud ne montre que les disciples de la page CHARGÉE : si
   * un maillon du chemin a plus de `TAILLE_PAGE_DISCIPLES` disciples et que le maillon
   * suivant n'est pas dans la première page de son tri `(nom, prenom, id)`, la branche
   * S'ARRÊTE LÀ. La personne cherchée n'est jamais rendue, `cibleId` ne surligne rien, et
   * le fil d'Ariane, lui, continue d'afficher le chemin complet — deux vérités
   * contradictoires sur le même écran. À l'échelle visée par la conception (« un millier
   * de membres ou plus »), c'est le cas normal, pas le cas limite.
   *
   * ═══ ET SI LE CALCUL NE SUFFIT PAS, ON LE DIT ═══
   *
   * `pageContenant` rend `1` quand elle ne sait pas — maillon devenu illisible ou non
   * actif, branche modifiée entre deux lectures. On ne lui fait donc pas confiance sur
   * parole : après chaque chargement, on VÉRIFIE que le maillon suivant figure bien dans
   * la page obtenue. Sinon, l'arbre est incomplet, et un message le dit. Un dépliage
   * silencieusement tronqué serait pire qu'un dépliage refusé.
   */
  function allerA(membre: MembreBref | null) {
    if (!membre) {
      setChemin(null)
      setCibleId(null)
      setErreurChemin(null)
      setAvertissementChemin(null)
      return
    }
    demarrerRecherche(async () => {
      setErreurChemin(null)
      setAvertissementChemin(null)
      let maillons: MaillonNomme[]
      try {
        maillons = await chargerChemin(membre.id)
      } catch (erreur) {
        console.error('arborescence : lecture du chemin impossible', { membreId: membre.id, erreur })
        setErreurChemin(MESSAGE_ECHEC_LECTURE_CHEMIN)
        return
      }
      setChemin(maillons)
      setCibleId(membre.id)
      // Déplier toute la branche : chaque maillon, plus la cible elle-même. Les maillons
      // sont distincts par construction (`ancetres_membre` remonte une chaîne), donc
      // aucune boucle ici — mais `basculer` reste la seule porte du dépliage manuel, et
      // c'est elle qui porte la barrière de D105.
      setEtat((precedent) => ({
        ...precedent,
        deplies: Array.from(new Set([...precedent.deplies, ...maillons.map((m) => m.id)])),
      }))

      let brancheComplete = true
      for (let indice = 0; indice < maillons.length; indice += 1) {
        const suivant = maillons[indice + 1]

        // Le DERNIER maillon est la cible elle-même : on affiche la PREMIÈRE page de SES
        // disciples, il n'y a pas de « suivant » à atteindre.
        let numero = 1
        if (suivant) {
          try {
            numero = await pageContenant(maillons[indice].id, suivant.id)
          } catch (erreur) {
            // Un échec de calcul n'interrompt pas le dépliage : on retombe sur la page 1,
            // et la vérification ci-dessous constatera, ou non, que cela suffisait.
            console.error('arborescence : calcul de la page du maillon suivant impossible', {
              parentId: maillons[indice].id,
              discipleId: suivant.id,
              erreur,
            })
          }
        }

        const page = await lireNoeud(maillons[indice].id, numero)
        if (page === null) {
          // `lireNoeud` a déjà posé le message d'échec SUR CE NŒUD. La branche s'arrête.
          brancheComplete = false
          break
        }
        if (suivant && !page.disciples.some((disciple) => disciple.id === suivant.id)) {
          brancheComplete = false
          break
        }
      }

      if (!brancheComplete) {
        setAvertissementChemin(MESSAGE_CHEMIN_PARTIEL)
      }
    })
  }

  const enModeRecherche = chemin !== null && chemin.length > 0

  return (
    <div className="flex flex-col gap-8">
      <SelecteurMembre
        nom="rechercheArborescence"
        label="Aller à une personne"
        aide="Saute directement à quelqu'un dans l'arbre, et déplie son chemin depuis la racine."
        valeur={null}
        surChoix={allerA}
        exclureId={null}
      />

      {rechercheEnCours ? <p className="text-sm text-neutral-500">Chargement du chemin…</p> : null}

      {erreurChemin ? (
        <p role="alert" className="text-sm text-red-600">
          {erreurChemin}
        </p>
      ) : null}

      {/*
        AVERTISSEMENT, PAS ERREUR : le chemin ci-dessous est juste et complet ; c'est
        l'arbre qui n'a pas pu être déplié jusqu'au bout. `role="status"` et non `alert` —
        rien n'a échoué, et rien n'est perdu pour l'utilisateur, qui garde le fil d'Ariane.
      */}
      {avertissementChemin ? (
        <p role="status" className="text-sm text-amber-700">
          {avertissementChemin}
        </p>
      ) : null}

      {enModeRecherche ? (
        <section className="flex flex-col gap-4">
          {/*
            D104 — LE FIL D'ARIANE porte l'information que l'indentation ne peut plus
            porter au-delà du plafond. Chaque maillon est cliquable ; un maillon illisible
            (« Fiche non consultable ») ne l'est pas, et GARDE SA PLACE — l'effacer ferait
            mentir l'écran sur la profondeur (D98).
          */}
          <nav aria-label="Chemin depuis la racine" className="text-sm text-neutral-600">
            {chemin!.map((maillon, indice) => (
              <span key={maillon.id}>
                {indice > 0 ? ' → ' : ''}
                {maillon.libelle === LIBELLE_FICHE_NON_CONSULTABLE ? (
                  <span className="italic text-neutral-500">{maillon.libelle}</span>
                ) : (
                  <Link href={`/membres/${maillon.id}`} className="underline underline-offset-4">
                    {maillon.libelle}
                  </Link>
                )}
              </span>
            ))}
          </nav>

          <ul className="flex flex-col gap-1">
            <Noeud
              membre={{ id: chemin![0].id, nom: chemin![0].libelle, prenom: '' }}
              profondeur={0}
              ancetres={[]}
              etat={etat}
              cibleId={cibleId}
              estAdmin={estAdmin}
              basculer={basculer}
              changerPage={changerPage}
            />
          </ul>

          <button
            type="button"
            onClick={() => allerA(null)}
            className="self-start text-sm underline underline-offset-4"
          >
            Revenir aux membres sans faiseur de disciple
          </button>
        </section>
      ) : (
        <section className="flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-medium">Membres sans faiseur de disciple</h2>
            <p className="text-sm text-neutral-500">
              {totalRacines} membre{totalRacines > 1 ? 's' : ''} — ce sont les racines de
              l&apos;arbre.
              {pages > 1 ? ` Page ${page} sur ${pages}.` : ''}
            </p>
          </div>

          {racines.length === 0 ? (
            <p className="text-sm text-neutral-600">
              Aucun membre actif sans faiseur de disciple.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {racines.map((racine) => (
                <Noeud
                  key={racine.id}
                  membre={racine}
                  profondeur={0}
                  ancetres={[]}
                  etat={etat}
                  cibleId={cibleId}
                  estAdmin={estAdmin}
                  basculer={basculer}
                  changerPage={changerPage}
                />
              ))}
            </ul>
          )}

          {pages > 1 ? (
            <nav aria-label="Pagination" className="flex items-center justify-between gap-4">
              {page > 1 ? (
                <Link
                  href={`/arborescence?page=${page - 1}`}
                  className="text-sm underline underline-offset-4"
                >
                  Page précédente
                </Link>
              ) : (
                <span />
              )}
              {page < pages ? (
                <Link
                  href={`/arborescence?page=${page + 1}`}
                  className="text-sm underline underline-offset-4"
                >
                  Page suivante
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </section>
      )}
    </div>
  )
}

type PropsNoeud = {
  membre: { id: string; nom: string; prenom: string }
  profondeur: number
  ancetres: readonly string[]
  etat: EtatArbre
  cibleId: string | null
  estAdmin: boolean
  basculer: (membreId: string, ancetres: readonly string[]) => void
  changerPage: (membreId: string, page: number) => void
}

/**
 * Un nœud de l'arbre. Composant de PREMIER NIVEAU du module, jamais défini à l'intérieur
 * d'`Arborescence` : une définition interne produirait un TYPE de composant neuf à chaque
 * rendu du parent, et React démonterait puis remonterait tout le sous-arbre — perdant le
 * focus et rejouant les chargements.
 *
 * D101 — TOUT MEMBRE ACTIF EST DÉPLIABLE, sans indicateur pré-calculé. Un indicateur par
 * enfant, ce serait UNE REQUÊTE PAR ENFANT (N+1) ; l'alternative serait une vue
 * d'agrégation permanente, avec sa RLS à écrire et à prouver, POUR UN CHEVRON. Déplier une
 * feuille affiche « Aucun disciple actif rattaché. » — un aller-retour de trop, à la
 * demande, plutôt que N requêtes systématiques que personne n'a demandées.
 */
function Noeud({
  membre,
  profondeur,
  ancetres,
  etat,
  cibleId,
  estAdmin,
  basculer,
  changerPage,
}: PropsNoeud) {
  const deplie = etat.deplies.includes(membre.id)
  const chargement = etat.enCours.includes(membre.id)
  const page = etat.noeuds[membre.id]
  const erreur = etat.erreurs[membre.id]
  const estCible = cibleId === membre.id

  // D104 : l'indentation est PLAFONNÉE. Au-delà, le niveau est écrit en toutes lettres —
  // c'est l'information que le décalage ne peut plus porter.
  const decalage = Math.min(profondeur, PROFONDEUR_MAX_INDENTATION) * DECALAGE_PAR_NIVEAU_REM

  const nomAffiche = membre.prenom ? `${membre.prenom} ${membre.nom}` : membre.nom

  return (
    <li style={{ marginLeft: `${decalage}rem` }}>
      <div
        className={`flex flex-wrap items-baseline gap-3 rounded-md px-2 py-1 ${
          estCible ? 'bg-amber-50 font-medium' : ''
        }`}
      >
        <button
          type="button"
          onClick={() => basculer(membre.id, ancetres)}
          aria-expanded={deplie}
          className="text-sm underline underline-offset-4"
        >
          {deplie ? '▾' : '▸'} {nomAffiche}
        </button>

        {page ? (
          <span className="text-xs text-neutral-500">
            {page.total} disciple{page.total > 1 ? 's' : ''}
          </span>
        ) : null}

        {profondeur > PROFONDEUR_MAX_INDENTATION ? (
          <span className="text-xs text-neutral-500">niveau {profondeur + 1}</span>
        ) : null}

        <Link href={`/membres/${membre.id}`} className="text-xs underline underline-offset-4">
          Fiche
        </Link>

        {/*
          UN LIEN, PAS UN POUVOIR. `estAdmin` sert ici à DÉCIDER D'AFFICHER, jamais à
          protéger : la barrière est `exigerAdministrateur` dans `/membres/[id]/arbre`.
          D92 : l'arbre lui-même n'écrit rien, et le rattachement reste sur la fiche, où la
          portée d'autorité, le verrou consultatif et l'anti-cycle sont déjà éprouvés.
        */}
        {estAdmin ? (
          <Link
            href={`/membres/${membre.id}/arbre`}
            className="text-xs underline underline-offset-4"
          >
            Rattacher
          </Link>
        ) : null}
      </div>

      {deplie ? (
        <div>
          {chargement && !page ? (
            <p className="px-2 py-1 text-xs text-neutral-500">Chargement…</p>
          ) : null}

          {erreur ? (
            <p role="alert" className="px-2 py-1 text-xs text-red-600">
              {erreur}
            </p>
          ) : null}

          {page && page.disciples.length === 0 && !erreur ? (
            <p className="px-2 py-1 text-xs text-neutral-600">Aucun disciple actif rattaché.</p>
          ) : null}

          {page && page.disciples.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {page.disciples.map((disciple) => (
                <Noeud
                  key={disciple.id}
                  membre={disciple}
                  profondeur={profondeur + 1}
                  // D105 : la branche courante s'allonge d'un cran à chaque niveau.
                  ancetres={[...ancetres, membre.id]}
                  etat={etat}
                  cibleId={cibleId}
                  estAdmin={estAdmin}
                  basculer={basculer}
                  changerPage={changerPage}
                />
              ))}
            </ul>
          ) : null}

          {page && page.pages > 1 ? (
            <div
              className="flex items-center gap-4 px-2 py-1 text-xs"
              style={{ marginLeft: `${DECALAGE_PAR_NIVEAU_REM}rem` }}
            >
              <button
                type="button"
                disabled={page.page <= 1 || chargement}
                onClick={() => changerPage(membre.id, page.page - 1)}
                className="underline underline-offset-4 disabled:no-underline disabled:opacity-40"
              >
                Page précédente
              </button>
              <span className="text-neutral-500">
                page {page.page} sur {page.pages}
              </span>
              <button
                type="button"
                disabled={page.page >= page.pages || chargement}
                onClick={() => changerPage(membre.id, page.page + 1)}
                className="underline underline-offset-4 disabled:no-underline disabled:opacity-40"
              >
                Page suivante
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}
```

- [ ] **Étape 3 : les deux liens**

Dans `src/app/tableau-de-bord/page.tsx`, ajouter le lien **juste après** « Consulter
l'annuaire », **sans garde de rôle** — la consultation est ouverte à tout compte actif :

```tsx
        <Link href="/arborescence" className="underline underline-offset-4">
          Parcourir l&apos;arborescence
        </Link>
```

Dans `src/app/membres/[id]/page.tsx`, section « Disciples actifs », remplacer le bloc
`{estAdmin ? (<Link href={...arbre}>Rattacher</Link>) : null}` par :

```tsx
          <div className="flex items-center gap-4">
            <Link href="/arborescence" className="text-sm underline underline-offset-4">
              Arborescence
            </Link>
            {estAdmin ? (
              <Link
                href={`/membres/${membre.id}/arbre`}
                className="text-sm underline underline-offset-4"
              >
                Rattacher
              </Link>
            ) : null}
          </div>
```

- [ ] **Étape 4 : vérifier D89 et D92 par balayage**

**D89 — les trois écrans existants sont inchangés :**

```bash
git diff --stat src/app/membres/[id]/modifier/ src/app/membres/[id]/statuts/ src/app/membres/[id]/arbre/
```

**Attendu : aucune ligne.** Ces trois écrans n'ont été touchés par **aucune** tâche de la
phase.

**D92 — le volet 2 n'écrit rien :**

## ⚠️ LE BALAYAGE PORTE SUR LE CODE, PAS SUR LES COMMENTAIRES — ET S'IL EST ROUGE, LA RÉPONSE N'EST **JAMAIS** D'ÉLARGIR OU D'ASSOUPLIR LE MOTIF

`src/app/arborescence/actions.ts` **PARLE** de la clé de service — il explique en
commentaire pourquoi il ne l'emploie pas — **sans jamais l'appeler**. Un balayage qui
confond une occurrence de code et une occurrence de commentaire ne prouve rien de plus
qu'une **interdiction de vocabulaire**, et il rend rouge un fichier parfaitement correct.

**Le danger n'est pas la ligne rouge : c'est la réparation naturelle.** Devant un motif qui
« trouve » quelque chose dans un dossier qui n'écrit rien, la tentation est de rétrécir le
motif — ou de supprimer le commentaire qui porte l'explication la plus importante du
module. Dans les deux cas, la barrière D92 sortirait **dégradée de sa propre preuve**.

**RÈGLE, sans exception :** le motif ne se touche pas. Si le balayage rend une ligne, on lit
la ligne. Si c'est du **code**, on retire le code. Si c'est un **commentaire** que le filtre
n'a pas écarté, on corrige le **filtre**, jamais le motif.

```bash
grep -rnE "clientAdmin|\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(" src/app/arborescence/ \
  | grep -vE ':[[:space:]]*(\*|//|/\*)'
```

**Attendu : aucune ligne.**

**CONTRÔLE POSITIF, PAR LE MÊME FILTRE** — sans lui, une commande mal formée rendrait
« aucune ligne » pour toujours, et un contrôle positif qui ne franchirait pas le filtre ne
prouverait pas que le filtre laisse passer le code :

```bash
grep -rnE "clientAdmin|\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(" src/app/membres/actions.ts \
  | grep -vE ':[[:space:]]*(\*|//|/\*)'
```

**Attendu : plusieurs lignes**, et ce sont de vraies écritures.

- [ ] **Étape 5 : les portes rapides puis, FIN DU LOT « VOLET 2 », les portes complètes**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls
```

```bash
npm run test:e2e && npm run build
```

- [ ] **Étape 6 : commit**

```bash
git add src/app/arborescence/page.tsx src/app/arborescence/arborescence.tsx \
  src/app/tableau-de-bord/page.tsx src/app/membres/[id]/page.tsx
git commit -m "feat: ecran /arborescence, parcours a la demande en consultation seule (D91 a D105)"
```

**Preuves produites :** les deux balayages avec leur contrôle positif ; et, à la main dans
un navigateur : déplier une racine, déplier un de ses disciples, constater que **le total
annoncé est celui du nœud** et non la longueur de la page, et que **déplier une feuille**
affiche « Aucun disciple actif rattaché. »

**Livrable indépendamment éprouvable :** un arbre parcourable, dénombré, paginé, et une
recherche qui mène au chemin déplié d'une personne.

---

### Task 13 : `tests/rls/arborescence.test.ts` — preuves 9, 10, 12, 13 et 16

**Fichiers :**
- Créer : `tests/rls/arborescence.test.ts`

**Interfaces :**
- Consomme : `disciplesParPage`, `racinesParPage` (Task 10) — **importées directement
  depuis `arbre-lots.ts`**, avec une **taille de page abaissée**. C'est la seule raison
  d'être de ce module séparé.
- Produit : les preuves n°9, 10, 12, 13 et 16 du design, **plus** deux preuves que le
  design n'exigeait pas et dont l'absence laissait un trou : le filtre `etat = 'actif'`
  **des noms du chemin**, éprouvé depuis deux sessions réelles, et la **mesure** de
  l'invariant d'arbre sur la base réelle, avec le compte rendu de ce sur quoi elle a porté.

**Préfixe de famille : `ZZArborescence-`.**

## ⚠️ LE CAS QUI JUSTIFIE LE TROISIÈME CRITÈRE DE TRI DOIT ÊTRE CONSTRUIT, PAS SUPPOSÉ

Deux disciples **homonymes exacts** (même nom, même prénom) **placés à cheval sur une
frontière de page**. Sans eux, la preuve de pagination serait verte sur une liste où
l'ordre est de toute façon déterminé, et **le retrait de `.order('id')` ne la ferait pas
tomber**. Le motif est celui déjà écrit pour `presencesDeSeanceParLots(client, seanceId, 2)`.

**Résultat négatif consigné en phase 3, à connaître :** `.order('id')` est correct **en
toute généralité** — aucune spécification SQL ne garantit l'ordre des ex æquo sans tri
total — **même quand une mutation sur deux lignes ne parvient pas à mettre le défaut en
évidence sur un plan Postgres donné**. La preuve construit donc le cas ; elle ne promet pas
qu'un retrait du critère la ferait toujours tomber.

- [ ] **Étape 1 : écrire la suite**

Créer `tests/rls/arborescence.test.ts` :

```ts
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  disciplesParPage,
  nomsMaillonsActifs,
  racinesParPage,
} from '../../src/lib/donnees/arbre-lots'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const IDENT_ADMIN = 'test.rls.arborescence.admin'
const IDENT_SIMPLE = 'test.rls.arborescence.simple'
const MDP = `Test-${crypto.randomUUID()}`

const PREFIXE_FAMILLE = 'ZZArborescence-'
const PREFIXE = `${PREFIXE_FAMILLE}${crypto.randomUUID().slice(0, 8)}`

// Le nom des HOMONYMES : identique pour deux fiches, à un suffixe près sur AUCUN des deux
// champs de tri (nom, prenom). Seul `id` les départage — c'est tout le point.
//
// LE SUFFIXE `-disciple-m` N'EST PAS ARBITRAIRE. Il place le couple au MILIEU de l'ordre
// alphabétique des cinq disciples (`-disciple-a`, `-disciple-m`, `-disciple-m`,
// `-disciple-y`, `-disciple-z`), donc À CHEVAL sur la frontière entre la page 1 et la
// page 2 avec une taille de page de 2. Un nom hors de la famille `-disciple-*` — par
// exemple `-homonyme` — trierait APRÈS `-disciple-z` (« d » < « h ») et le couple ne
// serait plus à cheval : la preuve resterait verte, mais pour une raison qui n'est pas
// celle qu'on écrit. Ne pas renommer sans refaire ce calcul.
const NOM_HOMONYME = `${PREFIXE}-disciple-m`
const PRENOM_HOMONYME = 'Alex'

// Cinq disciples : assez pour franchir DEUX frontières avec une page de 2, et pour que le
// couple d'homonymes tombe À CHEVAL sur l'une d'elles.
const NOMBRE_DISCIPLES = 5
// Trois racines créées par cette suite : le delta attendu sur le total.
const NOMBRE_RACINES = 3

let clientAdminSession: SupabaseClient
let clientSimple: SupabaseClient
let idFaiseur: string
let idsDisciplesAttendus: string[] = []
let idsRacinesAttendues: string[] = []
let idArchive: string
let idEnAttente: string

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

async function creerSession(identifiant: string, roles: string[]): Promise<SupabaseClient> {
  const { data, error } = await admin.auth.admin.createUser({
    email: `${identifiant}@asonkeng.local`,
    password: MDP,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`création du compte ${identifiant} : ${error?.message}`)
  const { error: erreurProfil } = await admin
    .from('profils')
    .insert({ id: data.user.id, identifiant, nom_affichage: `Test arborescence ${identifiant}` })
  if (erreurProfil) throw new Error(`insertion du profil ${identifiant} : ${erreurProfil.message}`)
  for (const role of roles) {
    const { error: erreurRole } = await admin
      .from('roles_profil')
      .insert({ profil_id: data.user.id, role })
    if (erreurRole) throw new Error(`rôle ${role} pour ${identifiant} : ${erreurRole.message}`)
  }
  const client = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error: erreurConnexion } = await client.auth.signInWithPassword({
    email: `${identifiant}@asonkeng.local`,
    password: MDP,
  })
  if (erreurConnexion) throw new Error(`connexion ${identifiant} : ${erreurConnexion.message}`)
  return client
}

/** Comptage INDÉPENDANT du total, pour ne pas le comparer à lui-même. */
async function compterRacinesIndependamment(client: SupabaseClient): Promise<number> {
  const { count, error } = await client
    .from('membres')
    .select('id', { count: 'exact', head: true })
    .is('faiseur_de_disciple_id', null)
    .eq('etat', 'actif')
  if (error) throw new Error(`comptage indépendant impossible : ${error.message}`)
  if (count === null) throw new Error('comptage absent de la réponse PostgREST')
  return count
}

beforeAll(async () => {
  await admin.from('membres').delete().like('nom', `${PREFIXE_FAMILLE}%`)
  await supprimerCompte(IDENT_ADMIN)
  await supprimerCompte(IDENT_SIMPLE)

  clientAdminSession = await creerSession(IDENT_ADMIN, ['administrateur'])
  clientSimple = await creerSession(IDENT_SIMPLE, [])

  const { data: faiseur, error: erreurFaiseur } = await admin
    .from('membres')
    .insert({ nom: `${PREFIXE}-faiseur`, prenom: 'Test' })
    .select('id')
    .single()
  if (erreurFaiseur || !faiseur) throw new Error(`création du faiseur : ${erreurFaiseur?.message}`)
  idFaiseur = faiseur.id as string

  // Les cinq disciples, dont DEUX HOMONYMES EXACTS.
  //
  // ORDRE RÉEL, calculé et non supposé — le tri est (nom, prenom, id), et les cinq noms
  // partagent le préfixe `${PREFIXE}-disciple-` :
  //     -disciple-a, -disciple-m, -disciple-m, -disciple-y, -disciple-z
  // Avec une taille de page de 2 : page 1 = [a, m], page 2 = [m, y], page 3 = [z]. LE
  // COUPLE D'HOMONYMES EST DONC À CHEVAL sur la frontière 1/2, ce qui est exactement le cas
  // que `.order('id')` existe pour rendre déterministe. Si l'un de ces noms change, refaire
  // ce calcul : une preuve qui fonctionne par accident ne prouve rien de durable.
  const aInserer = [
    { nom: `${PREFIXE}-disciple-a`, prenom: 'Test' },
    { nom: NOM_HOMONYME, prenom: PRENOM_HOMONYME },
    { nom: NOM_HOMONYME, prenom: PRENOM_HOMONYME },
    { nom: `${PREFIXE}-disciple-y`, prenom: 'Test' },
    { nom: `${PREFIXE}-disciple-z`, prenom: 'Test' },
  ].map((ligne) => ({ ...ligne, faiseur_de_disciple_id: idFaiseur }))
  expect(aInserer).toHaveLength(NOMBRE_DISCIPLES)

  const { data: disciples, error: erreurDisciples } = await admin
    .from('membres')
    .insert(aInserer)
    .select('id')
  // Toute préparation vérifie son erreur et LÈVE : un `insert` dont l'erreur est jetée
  // rendrait le test vert en éprouvant un tout autre chemin.
  if (erreurDisciples || !disciples) throw new Error(`création des disciples : ${erreurDisciples?.message}`)
  idsDisciplesAttendus = disciples.map((ligne) => ligne.id as string)

  const { data: racines, error: erreurRacines } = await admin
    .from('membres')
    .insert([
      { nom: `${PREFIXE}-racine-1`, prenom: 'Test' },
      { nom: `${PREFIXE}-racine-2`, prenom: 'Test' },
      { nom: `${PREFIXE}-racine-3`, prenom: 'Test' },
    ])
    .select('id')
  if (erreurRacines || !racines) throw new Error(`création des racines : ${erreurRacines?.message}`)
  idsRacinesAttendues = racines.map((ligne) => ligne.id as string)

  // Une fiche ARCHIVÉE et une fiche EN ATTENTE, toutes deux SANS faiseur de disciple : ni
  // l'une ni l'autre ne doit apparaître dans les racines, pour PERSONNE — y compris pour
  // un administrateur, dont la RLS, elle, les laisserait passer.
  const { data: hors, error: erreurHors } = await admin
    .from('membres')
    .insert([
      { nom: `${PREFIXE}-archive`, prenom: 'Test', etat: 'archive' },
      { nom: `${PREFIXE}-en-attente`, prenom: 'Test', etat: 'en_attente' },
    ])
    .select('id, etat')
  if (erreurHors || !hors) throw new Error(`création des fiches hors état actif : ${erreurHors?.message}`)
  idArchive = hors.find((l) => l.etat === 'archive')!.id as string
  idEnAttente = hors.find((l) => l.etat === 'en_attente')!.id as string
})

afterAll(async () => {
  // Suppression EN VRAC PAR PRÉFIXE : elle prend disciples et faiseur ENSEMBLE. Supprimer
  // le faiseur d'abord détacherait ses disciples EN SILENCE (`on delete set null`) et en
  // ferait des racines — on ne les retrouverait plus par la prise qu'on croyait avoir.
  await admin.from('membres').delete().like('nom', `${PREFIXE_FAMILLE}%`)
  await supprimerCompte(IDENT_ADMIN)
  await supprimerCompte(IDENT_SIMPLE)

  // COMPTAGE DE CONTRÔLE, INDÉPENDANT du balayage : un `delete` qui ne touche aucune ligne
  // ne rend AUCUNE erreur.
  const { count } = await admin
    .from('membres')
    .select('id', { count: 'exact', head: true })
    .like('nom', `${PREFIXE_FAMILLE}%`)
  expect(count).toBe(0)
  const { data: residus } = await admin
    .from('profils')
    .select('id')
    .in('identifiant', [IDENT_ADMIN, IDENT_SIMPLE])
  expect(residus ?? []).toHaveLength(0)
})

// ───────────────────────────────────────────────────────────────────────────────
// PREUVE N°9 — PAGINATION ET TRI TOTAL DES DISCIPLES (D94)
// ───────────────────────────────────────────────────────────────────────────────

describe('disciplesParPage', () => {
  it('parcourt TOUTES les pages sans doublon ni manquant, homonymes à cheval compris', async () => {
    // TAILLE DE PAGE ABAISSÉE : on franchit de VRAIES frontières sans créer 1001 lignes en
    // base de PRODUCTION. C'est la seule raison d'être d'`arbre-lots.ts`.
    const TAILLE = 2
    const collectes: string[] = []
    let total = -1
    let page = 1
    // Borne dure : sans elle, un défaut de pagination boucle indéfiniment et le test se
    // fige au lieu de tomber.
    for (; page <= 20; page += 1) {
      const resultat = await disciplesParPage(admin, idFaiseur, { page, taillePage: TAILLE })
      if (total === -1) total = resultat.total
      collectes.push(...resultat.lignes.map((ligne) => ligne.id))
      if (page * TAILLE >= resultat.total) break
    }
    expect(page).toBeLessThan(20)

    // Le TOTAL annoncé est le total RÉEL, pas la longueur d'une page.
    expect(total).toBe(NOMBRE_DISCIPLES)

    // AUCUN DOUBLON.
    expect(new Set(collectes).size).toBe(collectes.length)
    // AUCUN MANQUANT — et c'est l'assertion qui tomberait si un homonyme disparaissait à
    // la frontière : « jamais rendu » est la disparition silencieuse d'une personne de la
    // branche de son propre faiseur de disciple.
    expect([...collectes].sort()).toEqual([...idsDisciplesAttendus].sort())
  })

  it('rend les DEUX homonymes exacts, chacun une seule fois', async () => {
    const TAILLE = 2
    const collectes: string[] = []
    for (let page = 1; page <= 20; page += 1) {
      const resultat = await disciplesParPage(admin, idFaiseur, { page, taillePage: TAILLE })
      collectes.push(...resultat.lignes.map((ligne) => ligne.id))
      if (page * TAILLE >= resultat.total) break
    }
    const { data: homonymes } = await admin
      .from('membres')
      .select('id')
      .eq('nom', NOM_HOMONYME)
      .eq('prenom', PRENOM_HOMONYME)
    expect(homonymes).toHaveLength(2)
    for (const homonyme of homonymes ?? []) {
      expect(collectes.filter((identifiant) => identifiant === homonyme.id as string)).toHaveLength(1)
    }
  })

  it('LÈVE sur une taille de page qui atteint max_rows, au lieu de borner en douce', async () => {
    await expect(
      disciplesParPage(admin, idFaiseur, { page: 1, taillePage: 1000 }),
    ).rejects.toThrow(/taillePage invalide/)
  })

  it('rend un total juste et une page vide sur un nœud sans disciple', async () => {
    const resultat = await disciplesParPage(admin, idsRacinesAttendues[0], { taillePage: 2 })
    expect(resultat.total).toBe(0)
    expect(resultat.lignes).toEqual([])
  })
})

// ───────────────────────────────────────────────────────────────────────────────
// PREUVE N°10 — PAGINATION ET TRI TOTAL DES RACINES (D95)
// ───────────────────────────────────────────────────────────────────────────────

describe('racinesParPage', () => {
  it('annonce un total ÉGAL à un comptage calculé indépendamment', async () => {
    const independant = await compterRacinesIndependamment(admin)
    const resultat = await racinesParPage(admin, { page: 1, taillePage: 3 })
    // NON contre la somme des pages parcourues, qui vient de la MÊME requête et ne
    // prouverait rien.
    expect(resultat.total).toBe(independant)
  })

  /*
    ═══ CE PARCOURS EST CONSTRUIT POUR TENIR SUR UNE BASE DE PRODUCTION ═══

    Trois choix, et chacun ferme un défaut précis.

    1. AUCUN COMPTAGE ABSOLU. Pas de `expect(collectes).toHaveLength(total)` : le parcours
       dure plusieurs allers-retours SÉQUENTIELS, et une seule racine créée par
       l'administrateur réel pendant ce temps le ferait tomber. On assert sur ce que cette
       suite a créé — un DELTA —, jamais sur le total de la base.

    2. UNE TAILLE DE PAGE DE 200, ET NON DE 3. La pagination par DÉCALAGE est instable sous
       écriture concurrente : une insertion de nom bas décale toutes les pages suivantes et
       produit un VRAI doublon. `new Set(collectes).size === collectes.length` tomberait
       alors pour une raison ÉTRANGÈRE au code éprouvé, en accusant le tri total d'un
       défaut qui n'est pas le sien. Moins il y a de pages, moins il y a de fenêtres. Le
       cas homonyme à cheval, lui, est déjà prouvé plus haut avec une taille de 2 et un cas
       CONSTRUIT : ce parcours-ci n'a pas à le refaire.

    3. UNE BORNE EN LIGNES, PAS EN PAGES. Une borne de 500 pages à 3 lignes ne se
       déclencherait qu'au-delà de 1 500 racines, alors que le parcours coûte déjà
       beaucoup trop cher bien avant. La borne est donc posée sur le NOMBRE DE LIGNES,
       assertée AVANT la boucle, et le nombre de pages en découle.
  */
  it('parcourt toutes les pages sans doublon, et retrouve les trois racines créées', async () => {
    const TAILLE = 200
    const totalInitial = await compterRacinesIndependamment(admin)
    expect(
      totalInitial,
      "plus de 20 000 racines : le parcours exhaustif de cette preuve n'est plus tenable sur une base de production, revoir le protocole avant de la faire passer",
    ).toBeLessThan(20_000)
    const PAGES_MAX = Math.ceil(totalInitial / TAILLE) + 2

    const collectes: string[] = []
    let page = 1
    for (; page <= PAGES_MAX; page += 1) {
      const resultat = await racinesParPage(admin, { page, taillePage: TAILLE })
      collectes.push(...resultat.lignes.map((ligne) => ligne.id))
      if (page * TAILLE >= resultat.total) break
    }
    expect(
      page,
      'la boucle a atteint sa borne : la pagination ne progresse pas, ou la liste grandit plus vite que le parcours',
    ).toBeLessThanOrEqual(PAGES_MAX)

    // AUCUN DOUBLON. Le `+2` de la borne absorbe une insertion concurrente sans faire
    // tomber la boucle ; ce doublon-ci, en revanche, dirait quelque chose du tri.
    expect(new Set(collectes).size).toBe(collectes.length)

    // ET LE DELTA : les trois racines de cette suite ont été rendues, chacune UNE FOIS.
    // C'est la seule assertion de complétude qui soit vraie sur une base partagée.
    for (const identifiant of idsRacinesAttendues) {
      expect(
        collectes.filter((collecte) => collecte === identifiant),
        'une racine créée par cette suite est absente du parcours, ou rendue deux fois',
      ).toHaveLength(1)
    }
    expect(idsRacinesAttendues).toHaveLength(NOMBRE_RACINES)
    // NON INERTE : le parcours doit avoir rendu quelque chose. Une base en panne rendrait
    // trois listes vides et les assertions ci-dessus tomberaient — mais celle-ci le dit
    // plus clairement.
    expect(collectes.length).toBeGreaterThanOrEqual(NOMBRE_RACINES)
  })

  it('rend une page vide et un total JUSTE quand la page demandée est hors bornes', async () => {
    const total = await compterRacinesIndependamment(admin)
    const resultat = await racinesParPage(admin, { page: 100000, taillePage: 3 })
    // Repli `PGRST103` attrapé SUR LA LECTURE ELLE-MÊME : la requête entière est refusée,
    // `count` compris, et on retombe sur un comptage sans `range`.
    expect(resultat.lignes).toEqual([])
    expect(resultat.total).toBe(total)
  })
})

// ───────────────────────────────────────────────────────────────────────────────
// PREUVE N°12 — L'ARBRE NE MONTRE QUE DES MEMBRES ACTIFS (D93),
// ET LE PROUVE DEPUIS L'ADMINISTRATEUR, DONT LA RLS LES LAISSERAIT PASSER
// ───────────────────────────────────────────────────────────────────────────────

describe('filtre etat = actif, explicite et non délégué à la RLS', () => {
  it("n'expose ni fiche archivée ni fiche en attente dans les racines, POUR UN ADMINISTRATEUR", async () => {
    // Même protocole que le parcours de la preuve n°10, et pour les mêmes raisons : taille
    // de page large (la pagination par décalage est instable sous écriture concurrente),
    // borne exprimée EN LIGNES et assertée avant la boucle, aucun comptage absolu.
    const TAILLE = 200
    const totalInitial = await compterRacinesIndependamment(clientAdminSession)
    expect(
      totalInitial,
      "plus de 20 000 racines : ce parcours n'est plus tenable sur une base de production",
    ).toBeLessThan(20_000)
    const PAGES_MAX = Math.ceil(totalInitial / TAILLE) + 2

    const collectes: string[] = []
    let page = 1
    for (; page <= PAGES_MAX; page += 1) {
      const resultat = await racinesParPage(clientAdminSession, { page, taillePage: TAILLE })
      collectes.push(...resultat.lignes.map((ligne) => ligne.id))
      if (page * TAILLE >= resultat.total) break
    }
    expect(page, 'la boucle a atteint sa borne : le parcours ne progresse pas').toBeLessThanOrEqual(
      PAGES_MAX,
    )

    /*
      ═══ LA COLLECTE DOIT AVOIR EU LIEU AVANT QUE SES ABSENCES NE VEUILLENT DIRE QUELQUE
      CHOSE — ET LA VÉRIFICATION EST DANS **CE** TEST, PAS DANS UN AUTRE ═══

      `expect(collectes).not.toContain(...)` est satisfait TRIVIALEMENT par une collecte
      VIDE : une requête en panne, une session expirée, une boucle qui sort au premier tour
      rendraient ce test vert en ne prouvant rien du tout. Un contrôle positif écrit dans un
      `it` VOISIN ne referme pas ce cas : les deux tests ne partagent pas cette collecte.

      Les trois racines de cette suite sont ACTIVES et SANS faiseur de disciple : elles
      DOIVENT figurer dans le parcours. Leur présence prouve que la collecte a réellement
      balayé la liste, et c'est cela seul qui donne un sens aux deux absences ci-dessous.
    */
    for (const identifiant of idsRacinesAttendues) {
      expect(
        collectes,
        'collecte vide ou incomplète : les absences vérifiées ensuite ne prouveraient rien',
      ).toContain(identifiant)
    }

    expect(collectes).not.toContain(idArchive)
    expect(collectes).not.toContain(idEnAttente)
  })

  // CONTRÔLE POSITIF, ET IL N'EST PAS INERTE : une absence dont on n'a pas prouvé que la
  // fiche EXISTE et est LISIBLE par ailleurs ne prouve rien du tout.
  it('mais ce même administrateur ouvre bien les deux fiches par lien direct', async () => {
    for (const identifiant of [idArchive, idEnAttente]) {
      const { data, error } = await clientAdminSession
        .from('membres')
        .select('id, etat')
        .eq('id', identifiant)
        .maybeSingle()
      expect(error).toBeNull()
      expect(data?.id).toBe(identifiant)
    }
  })
})

// ───────────────────────────────────────────────────────────────────────────────
// PREUVE N°13 — UN COMPTE ORDINAIRE VOIT LE MÊME ARBRE QU'UN ADMINISTRATEUR (D93)
// ───────────────────────────────────────────────────────────────────────────────

describe('un compte ordinaire et un administrateur voient le même arbre', () => {
  it('rendent la même liste de disciples ET le même total sur le même nœud', async () => {
    const vuAdmin = await disciplesParPage(clientAdminSession, idFaiseur, { taillePage: 10 })
    const vuSimple = await disciplesParPage(clientSimple, idFaiseur, { taillePage: 10 })

    expect(vuSimple.total).toBe(vuAdmin.total)
    expect(vuSimple.lignes.map((l) => l.id)).toEqual(vuAdmin.lignes.map((l) => l.id))
    // Et la liste N'EST PAS VIDE : sans cette assertion, l'égalité serait celle de deux
    // résultats vides, satisfaite par une base en panne.
    expect(vuAdmin.total).toBe(NOMBRE_DISCIPLES)
  })

  // CONTRÔLE POSITIF DE LA DIFFÉRENCE DE DROITS : le compte ordinaire ne lit PAS une fiche
  // archivée par lien direct. Sans lui, l'égalité ci-dessus pourrait venir d'une RLS
  // ouverte à tout le monde, ce qui ne serait pas le même fait.
  it("mais le compte ordinaire ne lit PAS une fiche archivée par lien direct", async () => {
    const { data, error } = await clientSimple
      .from('membres')
      .select('id')
      .eq('id', idArchive)
      .maybeSingle()
    expect(error).toBeNull()
    expect(data).toBeNull()
  })
})

// ───────────────────────────────────────────────────────────────────────────────
// LES NOMS DU CHEMIN SONT FILTRÉS `etat = 'actif'` POUR TOUS LES RÔLES (D93)
//
// C'est le seul endroit de l'écran où l'exclusion aurait pu être déléguée à la RLS. Elle
// ne l'est pas, et cette suite le mesure : la politique `membres_lecture` ouvre TOUTE
// fiche à l'administrateur, donc une lecture sans filtre d'état lui NOMMERAIT un maillon
// archivé ou en attente, là où un compte ordinaire lit « Fiche non consultable ». Les
// deux ne verraient plus le même arbre, et l'écran — qui annonce que seuls les membres
// actifs y figurent — mentirait à l'un des deux.
//
// AUCUNE AUTRE PREUVE DE CE PLAN N'EXERCE CE CHEMIN. `chargerChemin` est une Server Action
// et ne peut pas tourner ici ; `cheminAvecLibelles` est pure et ne lit rien. C'est
// `nomsMaillonsActifs` qui porte le filtre, et c'est donc elle qu'on éprouve — contre la
// vraie base, depuis DEUX sessions réelles.
// ───────────────────────────────────────────────────────────────────────────────

describe('noms des maillons du chemin, filtrés etat = actif explicitement', () => {
  it("n'expose NI la fiche archivée NI la fiche en attente, PAS MÊME À L'ADMINISTRATEUR", async () => {
    // Un lot qui MÉLANGE les trois états. `idFaiseur` est actif : c'est le témoin qui
    // rend la lecture non vide, sans quoi les deux absences seraient satisfaites par une
    // requête en panne.
    const lot = [idFaiseur, idArchive, idEnAttente]

    const vuAdmin = await nomsMaillonsActifs(clientAdminSession, lot)
    const vuSimple = await nomsMaillonsActifs(clientSimple, lot)

    // LE MAILLON ACTIF EST BIEN LÀ, POUR LES DEUX. Sans cette assertion, tout ce qui suit
    // serait satisfait par deux listes vides.
    expect(vuAdmin.map((m) => m.id)).toEqual([idFaiseur])
    expect(vuSimple.map((m) => m.id)).toEqual([idFaiseur])

    // ET LES DEUX AUTRES SONT ABSENTS DES DEUX CÔTÉS. C'est l'égalité qui compte : elle dit
    // que l'exclusion vient de la RÈGLE ÉNONCÉE, et non du lecteur.
    expect(vuSimple.map((m) => m.id)).toEqual(vuAdmin.map((m) => m.id))
  })

  // CONTRÔLE POSITIF, ET IL N'EST PAS INERTE : une absence dont on n'a pas prouvé que la
  // fiche EXISTE et est LISIBLE par ailleurs ne prouve rien. Cet administrateur ouvre bien
  // les deux fiches par lien direct — c'est donc bien le FILTRE, et non la RLS, qui les a
  // écartées du chemin.
  it('mais ce même administrateur lit les deux fiches par lien direct', async () => {
    for (const identifiant of [idArchive, idEnAttente]) {
      const { data, error } = await clientAdminSession
        .from('membres')
        .select('id')
        .eq('id', identifiant)
        .maybeSingle()
      expect(error).toBeNull()
      expect(data?.id).toBe(identifiant)
    }
  })

  it('rend une liste vide sur une liste d’identifiants vide, sans interroger la base', async () => {
    expect(await nomsMaillonsActifs(clientSimple, [])).toEqual([])
  })
})

// ───────────────────────────────────────────────────────────────────────────────
// L'INVARIANT D'ARBRE, MESURÉ SUR LA BASE RÉELLE (D99)
// ───────────────────────────────────────────────────────────────────────────────

describe("aucun membre actif n'a de faiseur qui ne soit pas actif", () => {
  it('le vérifie sur toutes les fiches, et DIT sur quoi la mesure a porté', async () => {
    const { data, error } = await admin.from('membres').select('id, nom, etat, faiseur_de_disciple_id')
    if (error) throw new Error(`lecture des fiches impossible : ${error.message}`)
    const fiches = data ?? []
    const parId = new Map(fiches.map((m) => [m.id as string, m]))

    const fautifs = fiches.filter((m) => {
      if (m.etat !== 'actif' || !m.faiseur_de_disciple_id) return false
      const parent = parId.get(m.faiseur_de_disciple_id as string)
      // `parent === undefined` est impossible (clé étrangère), mais on ne conclut pas d'un
      // raisonnement : on ne compte comme fautif que ce qu'on a pu constater.
      return parent !== undefined && parent.etat !== 'actif'
    })
    expect(
      fautifs.map((m) => m.nom),
      "un membre actif a un faiseur non actif : sa branche est un trou dans l'arborescence",
    ).toEqual([])

    /*
      ═══ CETTE MESURE PEUT ÊTRE VRAIE **À VIDE**, ET IL FAUT LE DIRE ═══

      Si la base ne contient AUCUNE fiche `archive` ni `en_attente`, l'assertion ci-dessus
      est vraie sans avoir rien éprouvé : elle ne dit alors pas « l'invariant tient », elle
      dit « le cas ne s'est pas présenté ». Au moment où ce plan a été écrit, la base
      comptait 8 fiches, TOUTES actives, et 2 racines réelles — la mesure y était donc
      VACUELLEMENT vraie.

      Les deux comptes rendus ci-dessous ne sont pas des assertions décoratives : le
      premier garantit que le balayage a porté sur quelque chose, le second ÉCRIT dans le
      rapport de test le nombre de fiches non actives réellement examinées. Un lecteur qui
      voit `0` sait que ce test n'a rien prouvé ce jour-là, et ne prendra pas cette mesure
      pour une preuve.

      Les preuves qui, elles, ÉPROUVENT vraiment les gardes construisent leurs propres
      fiches non actives : elles vivent dans `tests/rls/creation-enrichie.test.ts`.
    */
    expect(fiches.length, 'aucune fiche en base : ce balayage n’a porté sur rien').toBeGreaterThan(0)
    const nonActives = fiches.filter((m) => m.etat !== 'actif').length
    console.info(
      `invariant d'arbre : ${fiches.length} fiche(s) examinée(s), dont ${nonActives} non active(s). ` +
        (nonActives === 0
          ? 'AUCUNE fiche non active en base : cette mesure est VACUELLEMENT vraie et ne prouve rien.'
          : 'la mesure a réellement porté sur des fiches non actives.'),
    )
  })
})

// ───────────────────────────────────────────────────────────────────────────────
// PREUVE N°16 — LE VOLET 2 N'ÉCRIT RIEN (D92). LA PREUVE D'UN VIDE EST UN BALAYAGE.
// ───────────────────────────────────────────────────────────────────────────────

describe("aucun chemin d'écriture dans src/app/arborescence/", () => {
  /*
    ═══ SI CE TEST EST ROUGE, LA RÉPONSE N'EST **JAMAIS** D'ÉLARGIR NI D'ASSOUPLIR
        `MOTIFS_ECRITURE`. ═══

    Ce motif est la barrière D92 elle-même. Le voir échouer sur un module qui n'écrit rien
    donne envie de le rétrécir — ou de supprimer le commentaire qui l'a fait échouer. Dans
    les deux cas, la barrière sortirait DÉGRADÉE DE SA PROPRE PREUVE, et plus personne ne
    remarquerait la première vraie écriture ajoutée ensuite.

    RÈGLE : si `fautifs` n'est pas vide, on OUVRE le fichier cité. Si c'est du CODE, on
    retire le code. Si c'est un COMMENTAIRE que `sansCommentaires` n'a pas su écarter, on
    corrige `sansCommentaires`. Le motif, lui, ne bouge pas.
  */
  const MOTIFS_ECRITURE = /clientAdmin|\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/

  /**
   * Retire les commentaires avant balayage.
   *
   * `src/app/arborescence/actions.ts` **PARLE** de la clé de service — il explique en
   * commentaire pourquoi il ne l'emploie pas, et où vit la frontière — **sans jamais
   * l'appeler**. Un balayage qui confond les deux ne prouve rien de plus qu'une
   * INTERDICTION DE VOCABULAIRE, et il rendrait rouge un fichier parfaitement correct : le
   * motif serait alors affaibli, ou le commentaire supprimé, et la barrière serait perdue
   * dans les deux cas.
   */
  function sansCommentaires(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  }

  function fichiersDe(dossier: string): string[] {
    return readdirSync(dossier, { withFileTypes: true }).flatMap((entree) => {
      const chemin = join(dossier, entree.name)
      return entree.isDirectory() ? fichiersDe(chemin) : [chemin]
    })
  }

  it('ne contient aucun clientAdmin, insert, update, delete, upsert ni rpc HORS COMMENTAIRES', () => {
    const fichiers = fichiersDe('src/app/arborescence')
    // Le balayage doit porter sur quelque chose : un dossier vide le rendrait vert pour
    // rien.
    expect(fichiers.length).toBeGreaterThanOrEqual(4)
    const fautifs = fichiers.filter((chemin) =>
      MOTIFS_ECRITURE.test(sansCommentaires(readFileSync(chemin, 'utf8'))),
    )
    expect(
      fautifs,
      "chemin d'écriture dans /arborescence : lire le fichier cité, retirer le CODE — jamais élargir le motif",
    ).toEqual([])
  })

  // CONTRÔLE POSITIF DU BALAYAGE LUI-MÊME, PAR LE MÊME FILTRE : sans lui, une expression
  // régulière cassée — ou un `sansCommentaires` qui effacerait tout — rendrait « aucun
  // fautif » pour toujours, y compris sur un dossier truffé d'écritures. Il passe par
  // `sansCommentaires` parce qu'un contrôle positif qui ne franchirait pas le filtre ne
  // prouverait pas que le filtre laisse passer le code.
  it('le même balayage, à travers le MÊME filtre, TROUVE les écritures là où il y en a', () => {
    const contenu = readFileSync('src/app/membres/actions.ts', 'utf8')
    expect(MOTIFS_ECRITURE.test(sansCommentaires(contenu))).toBe(true)
  })

  // CONTRÔLE DU FILTRE LUI-MÊME : `sansCommentaires` doit retirer les commentaires, et
  // RIEN D'AUTRE. Sans ce test, une expression trop gourmande — qui effacerait le fichier
  // entier — rendrait le balayage vert pour toujours, et le contrôle positif ci-dessus le
  // serait resté aussi longtemps qu'un `clientAdmin` traîne hors commentaire ailleurs.
  it('sansCommentaires retire les commentaires et conserve le code', () => {
    const source = [
      '/** clientAdmin() cité dans un bloc */',
      '// clientAdmin() cité dans une ligne',
      'const x = clientAdmin()',
    ].join('\n')
    const nettoye = sansCommentaires(source)
    expect(nettoye).toContain('const x = clientAdmin()')
    expect(nettoye).not.toContain('cité dans un bloc')
    expect(nettoye).not.toContain('cité dans une ligne')
  })
})
```

- [ ] **Étape 2 : exécuter, puis commit**

```bash
npm run test:rls
```

```bash
git add tests/rls/arborescence.test.ts
git commit -m "test: pagination a tri total, filtre actif explicite et vide d'ecriture de l'arborescence (preuves 9, 10, 12, 13, 16)"
```

**Preuves produites :** la sortie de `test:rls`, et en particulier **la ligne
`console.info` de la mesure d'invariant** — elle dit combien de fiches ont été examinées et
**combien d'entre elles n'étaient pas actives**. **Reporter ce nombre tel quel** : s'il vaut
zéro, cette mesure est **vacuellement vraie** et ne prouve rien ce jour-là, et le rapport de
tâche doit l'écrire ainsi plutôt que de compter la ligne verte comme une preuve. Au moment
de la rédaction de ce plan, la base comptait **8 fiches, toutes actives, et 2 racines
réelles** : la mesure y aurait été vide de sens. Ce sont les preuves de
`tests/rls/creation-enrichie.test.ts`, qui **construisent** leurs fiches non actives, qui
éprouvent réellement les gardes.

Consigner aussi le **nombre de pages réellement parcourues** pour les racines : les deux
parcours bornent en LIGNES et non en pages, et le test lève de lui-même au-delà de 20 000
racines — si cette borne approche, le protocole doit être revu, pas relevé.

---

### Task 14 : `tests/e2e/arborescence.spec.ts` et le contrôle positif de la preuve n°11

**Fichiers :**
- Créer : `tests/e2e/arborescence.spec.ts`
- Modifier : `tests/e2e/arbre.spec.ts`

**Interfaces :**
- Consomme : l'écran `/arborescence` (Task 12) et ses actions (Task 11).
- Produit : la preuve n°15 du design (dépliage gardé, avec canari **par le canal de la
  forge**), le comportement de l'écran, et le **contrôle positif manquant** de la
  preuve n°11.

## ⚠️ LA FORGE, ICI, N'EST PAS CELLE DES AUTRES SUITES — ET IL FAUT SAVOIR POURQUOI

`tests/e2e/statuts.spec.ts` et `tests/e2e/evenements.spec.ts` forgent des appels en
**recopiant les champs cachés `$ACTION_*` d'un `<form>`**. Ce motif **ne s'applique pas
ici** : `chargerDisciples` et `chargerChemin` ne sont liées à **aucun** `<form action>` —
elles sont appelées depuis un `useTransition`, et **aucun identifiant d'action ne figure
dans le DOM**.

La forge équivalente est donc : **capturer la requête RÉELLE** que le navigateur émet
quand un compte **ordinaire** déplie un nœud, puis **la rejouer telle quelle depuis un
contexte SANS session**. C'est le même canal, éprouvé par le même octet.

**LE CANARI EMPRUNTE CE MÊME CANAL** : la même requête capturée, rejouée depuis la session
**autorisée**. Un canari qui passerait par l'interface **n'éprouverait pas** ce que la
forge éprouve — si le protocole des Server Actions changeait, le refus deviendrait vert
pour toujours et le canari, lui, continuerait de réussir par un autre chemin. **Défaut réel
trouvé en phase 4.**

- [ ] **Étape 1 : écrire la suite**

Créer `tests/e2e/arborescence.spec.ts` :

```ts
import { createClient } from '@supabase/supabase-js'
import { expect, request as requestPlaywright, test, type Page } from '@playwright/test'
import { identifiantVersEmail } from '../../src/lib/domaine/identifiant'
// La CONSTANTE de production, jamais un 25 recopié : le jour où la taille de page change,
// ce test doit franchir la NOUVELLE frontière, pas l'ancienne. `arbre-lots.ts` n'est pas
// `server-only` — c'est exactement pour cela qu'il existe.
import { TAILLE_PAGE_DISCIPLES } from '../../src/lib/donnees/arbre-lots'

test.describe.configure({ mode: 'serial' })

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const MDP = `Test-${crypto.randomUUID()}`
const IDENT_ADMIN = 'test.e2e.arborescence.admin'
const IDENT_SIMPLE = 'test.e2e.arborescence.simple'

const PREFIXE_FAMILLE = 'ZZArborescenceE2E-'
const PREFIXE = `${PREFIXE_FAMILLE}${crypto.randomUUID().slice(0, 8)}`

const NOM_RACINE = `${PREFIXE}-racine`
const NOM_DISCIPLE = `${PREFIXE}-disciple`
const NOM_PETIT = `${PREFIXE}-petit`
const NOM_FEUILLE = `${PREFIXE}-feuille`
const NOM_ARCHIVE = `${PREFIXE}-archive`

/*
  ═══ LA GRANDE FRATRIE : LE CAS QUE LA RECHERCHE DOIT FRANCHIR ═══

  `NOM_FRATRIE` porte `TAILLE_PAGE_DISCIPLES + 1` disciples, et la personne cherchée est le
  DERNIER dans l'ordre `(nom, prenom, id)` — donc SEULE SUR LA PAGE 2.

  SANS LE CALCUL DE PAGE, LA RECHERCHE CHARGERAIT LA PAGE 1 DE CHAQUE MAILLON, la cible ne
  serait JAMAIS rendue dans l'arbre, rien ne la mettrait en évidence, et le fil d'Ariane
  afficherait pourtant son chemin complet. Un arbre à deux disciples ne peut pas voir ce
  défaut : il n'a qu'une page. C'est pour cela que ce cas est CONSTRUIT, et non supposé —
  sans lui, retirer le calcul de page ne ferait tomber aucune preuve.

  `-frere-zz-cible` trie après `-frere-00` … `-frere-NN` : « z » > un chiffre.

  LES NOMS SONT CHOISIS POUR NE PAS SE CONTENIR L'UN L'AUTRE. Les locateurs de cette suite
  sont des expressions régulières sur le nom du bouton : si le nom du parent était un
  PRÉFIXE de celui de ses enfants, `new RegExp(NOM_FRATRIE)` en trouverait vingt-sept et
  violerait le mode strict de Playwright. D'où `-fratrie` pour le parent et `-frere-…` pour
  les enfants — deux familles disjointes.
*/
const NOM_FRATRIE = `${PREFIXE}-fratrie`
const NOM_CIBLE_PAGE_2 = `${PREFIXE}-frere-zz-cible`

let idRacine: string
let idDisciple: string
let idFeuille: string
let idFratrie: string

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

async function creerCompte(identifiant: string, roles: string[]) {
  const { data, error } = await admin.auth.admin.createUser({
    email: identifiantVersEmail(identifiant),
    password: MDP,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`création du compte ${identifiant} : ${error?.message}`)
  const { error: erreurProfil } = await admin
    .from('profils')
    .insert({ id: data.user.id, identifiant, nom_affichage: `Test arbo ${identifiant}` })
  if (erreurProfil) throw new Error(`insertion du profil ${identifiant} : ${erreurProfil.message}`)
  for (const role of roles) {
    const { error: erreurRole } = await admin
      .from('roles_profil')
      .insert({ profil_id: data.user.id, role })
    if (erreurRole) throw new Error(`rôle ${role} : ${erreurRole.message}`)
  }
}

async function creerMembre(nom: string, faiseur: string | null, etat = 'actif'): Promise<string> {
  const { data, error } = await admin
    .from('membres')
    .insert({ nom, prenom: 'Test', faiseur_de_disciple_id: faiseur, etat })
    .select('id')
    .single()
  // Toute préparation vérifie son erreur et LÈVE.
  if (error || !data) throw new Error(`création de ${nom} impossible : ${error?.message}`)
  return data.id as string
}

async function seConnecter(page: Page, identifiant: string) {
  await page.goto('/connexion')
  await page.getByLabel('Identifiant').fill(identifiant)
  await page.getByLabel('Mot de passe').fill(MDP)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await expect(page).toHaveURL(/\/tableau-de-bord/)
}

test.beforeAll(async () => {
  await admin.from('membres').delete().like('nom', `${PREFIXE_FAMILLE}%`)
  await supprimerCompte(IDENT_ADMIN)
  await supprimerCompte(IDENT_SIMPLE)
  await creerCompte(IDENT_ADMIN, ['administrateur'])
  await creerCompte(IDENT_SIMPLE, [])

  // ORDRE DE CRÉATION : la racine d'abord, ses descendants ensuite.
  idRacine = await creerMembre(NOM_RACINE, null)
  idDisciple = await creerMembre(NOM_DISCIPLE, idRacine)
  await creerMembre(NOM_PETIT, idDisciple)
  idFeuille = await creerMembre(NOM_FEUILLE, idRacine)
  // Une fiche archivée SANS faiseur de disciple : elle ne doit apparaître nulle part dans
  // l'arbre, pour personne.
  await creerMembre(NOM_ARCHIVE, null, 'archive')

  // La GRANDE FRATRIE : `TAILLE_PAGE_DISCIPLES` frères qui remplissent la page 1, plus la
  // cible, qui trie après eux et se retrouve donc SEULE SUR LA PAGE 2.
  idFratrie = await creerMembre(NOM_FRATRIE, idRacine)
  const freres = Array.from({ length: TAILLE_PAGE_DISCIPLES }, (_, indice) => ({
    // Indice sur DEUX chiffres : sans le zéro de tête, « 10 » trierait avant « 2 ». Le
    // rang de la cible ne changerait pas — elle trie de toute façon après tous les
    // chiffres —, mais l'ordre écrit ici ne serait plus l'ordre réel, et la prochaine
    // personne à lire ce test partirait sur une fausse idée.
    nom: `${PREFIXE}-frere-${String(indice).padStart(2, '0')}`,
    prenom: 'Test',
    faiseur_de_disciple_id: idFratrie,
  }))
  const { error: erreurFreres } = await admin.from('membres').insert(freres)
  // Toute préparation vérifie son erreur et LÈVE : une fratrie incomplète ramènerait la
  // cible en page 1 et rendrait ce test vert sans qu'il ait rien franchi.
  if (erreurFreres) throw new Error(`création de la fratrie impossible : ${erreurFreres.message}`)
  await creerMembre(NOM_CIBLE_PAGE_2, idFratrie)
})

test.afterAll(async () => {
  // ORDRE DE SUPPRESSION : la suppression en vrac par préfixe prend disciples ET faiseurs
  // ensemble — supprimer un faiseur d'abord détacherait ses disciples en silence
  // (`on delete set null`) et en ferait des racines.
  await admin.from('membres').delete().like('nom', `${PREFIXE_FAMILLE}%`)
  await supprimerCompte(IDENT_ADMIN)
  await supprimerCompte(IDENT_SIMPLE)

  const { count } = await admin
    .from('membres')
    .select('id', { count: 'exact', head: true })
    .like('nom', `${PREFIXE_FAMILLE}%`)
  expect(count).toBe(0)
})

test("l'arborescence est protégée par la connexion", async ({ page }) => {
  await page.goto('/arborescence')
  await expect(page).toHaveURL(/\/connexion/)
})

test('un compte ORDINAIRE parcourt l’arbre : il déplie, voit le total, et atteint une feuille', async ({
  page,
}) => {
  await seConnecter(page, IDENT_SIMPLE)
  await page.goto('/arborescence')

  // D95 : l'intitulé est « Membres sans faiseur de disciple ». « Racines de l'arbre » n'en
  // est que la glose — et cette assertion tomberait si l'écran reprenait l'intitulé que le
  // design refuse.
  await expect(page.getByRole('heading', { name: 'Membres sans faiseur de disciple' })).toBeVisible()

  // La fiche ARCHIVÉE n'y figure pas (D93) — pour un compte ordinaire ici, pour un
  // administrateur dans `tests/rls/arborescence.test.ts`, où la RLS ne la cacherait pas.
  await expect(page.getByText(NOM_ARCHIVE)).toHaveCount(0)

  // Déplier la racine.
  await page.getByRole('button', { name: new RegExp(NOM_RACINE) }).click()

  // D101 : le nœud annonce SON total, pas la longueur de la page. La racine porte TROIS
  // disciples — `-disciple`, `-feuille` et `-fratrie` —, et les trois tiennent sur une
  // page. Ce nombre suit la préparation : si un descendant direct est ajouté au `beforeAll`
  // sans reprendre cette ligne, c'est ICI que la suite tombera, et c'est voulu.
  await expect(page.getByText('3 disciples')).toBeVisible()
  await expect(page.getByRole('button', { name: new RegExp(NOM_DISCIPLE) })).toBeVisible()
  await expect(page.getByRole('button', { name: new RegExp(NOM_FEUILLE) })).toBeVisible()

  // Déplier une FEUILLE : D101 exige un message, pas un silence — et ce message doit être
  // celui-là, pas « aucun élément ».
  await page.getByRole('button', { name: new RegExp(NOM_FEUILLE) }).click()
  await expect(page.getByText('Aucun disciple actif rattaché.')).toBeVisible()

  // Déplier un nœud INTERMÉDIAIRE : sa descendance apparaît.
  await page.getByRole('button', { name: new RegExp(NOM_DISCIPLE) }).click()
  await expect(page.getByRole('button', { name: new RegExp(NOM_PETIT) })).toBeVisible()
})

test('la recherche mène au chemin déplié d’une personne, avec son fil d’Ariane', async ({ page }) => {
  await seConnecter(page, IDENT_SIMPLE)
  await page.goto('/arborescence')

  await page.getByLabel('Aller à une personne').fill(NOM_PETIT)
  await page.getByRole('button', { name: `Test ${NOM_PETIT}` }).click()

  // D104 : le fil d'Ariane porte le chemin depuis la racine.
  const filAriane = page.getByRole('navigation', { name: 'Chemin depuis la racine' })
  await expect(filAriane).toContainText(NOM_RACINE)
  await expect(filAriane).toContainText(NOM_DISCIPLE)
  await expect(filAriane).toContainText(NOM_PETIT)

  // D97 : le chemin est DÉPLIÉ — les trois maillons sont visibles dans l'arbre lui-même,
  // pas seulement dans le fil d'Ariane —, la personne est mise en évidence, ET sa
  // première page de disciples est chargée (ici : aucune, et l'écran le dit).
  await expect(page.getByRole('button', { name: new RegExp(NOM_DISCIPLE) })).toBeVisible()
  await expect(page.getByRole('button', { name: new RegExp(NOM_PETIT) })).toBeVisible()
  await expect(page.getByText('Aucun disciple actif rattaché.')).toBeVisible()

  // Et l'on peut revenir.
  await page.getByRole('button', { name: 'Revenir aux membres sans faiseur de disciple' }).click()
  await expect(page.getByRole('heading', { name: 'Membres sans faiseur de disciple' })).toBeVisible()
})

/**
 * LA RECHERCHE ATTEINT UNE PERSONNE SITUÉE AU-DELÀ DE LA PREMIÈRE PAGE DE SON FAISEUR.
 *
 * ═══ CE TEST EST LA RAISON D'ÊTRE DE LA GRANDE FRATRIE ═══
 * Le rendu d'un nœud ne montre que les disciples de la page CHARGÉE. Une recherche qui
 * chargerait toujours la page 1 s'arrêterait au premier maillon à plus de
 * `TAILLE_PAGE_DISCIPLES` disciples dont le suivant n'est pas dans cette première page :
 * la personne cherchée ne serait JAMAIS rendue, rien ne la surlignerait, et le fil
 * d'Ariane afficherait pourtant son chemin complet — deux vérités contradictoires sur le
 * même écran.
 *
 * Un arbre à deux disciples ne peut pas voir ce défaut : il n'a qu'une page. Le cas est
 * donc CONSTRUIT — `TAILLE_PAGE_DISCIPLES + 1` frères, la cible triant après tous les
 * autres, donc SEULE sur la page 2.
 */
test('la recherche atteint une personne située AU-DELÀ de la première page de son faiseur', async ({
  page,
}) => {
  await seConnecter(page, IDENT_SIMPLE)
  await page.goto('/arborescence')

  await page.getByLabel('Aller à une personne').fill(NOM_CIBLE_PAGE_2)
  await page.getByRole('button', { name: `Test ${NOM_CIBLE_PAGE_2}` }).click()

  // Le fil d'Ariane porte le chemin complet…
  const filAriane = page.getByRole('navigation', { name: 'Chemin depuis la racine' })
  await expect(filAriane).toContainText(NOM_RACINE)
  await expect(filAriane).toContainText(NOM_FRATRIE)
  await expect(filAriane).toContainText(NOM_CIBLE_PAGE_2)

  // …ET L'ARBRE AUSSI. VOICI L'ASSERTION QUI TOMBE si la recherche charge toujours la
  // page 1 : la cible est SEULE sur la page 2 de son faiseur.
  await expect(
    page.getByRole('button', { name: new RegExp(NOM_CIBLE_PAGE_2) }),
    'la cible est absente de l’arbre : la branche s’est arrêtée à la première page de son faiseur',
  ).toBeVisible()

  // Le nœud de la fratrie est bien sur sa DEUXIÈME page. `TAILLE_PAGE_DISCIPLES + 1`
  // disciples font toujours exactement deux pages, quelle que soit la taille de page.
  await expect(page.getByText('page 2 sur 2')).toBeVisible()

  // Et AUCUN avertissement de dépliage partiel : la branche est complète. Sans cette
  // assertion, un écran qui renoncerait à déplier tout en affichant honnêtement son
  // message resterait indistinguable d'un écran qui a réussi.
  await expect(page.getByText("l'arbre n'a pas pu être déplié jusqu'à elle")).toHaveCount(0)
})

test('le lien « Rattacher » n’est offert qu’à l’administrateur — un lien, pas un pouvoir', async ({
  page,
  browser,
  baseURL,
}) => {
  await seConnecter(page, IDENT_ADMIN)
  await page.goto('/arborescence')
  await expect(page.getByRole('link', { name: 'Rattacher' }).first()).toBeVisible()

  const contexte = await browser.newContext({ baseURL })
  try {
    const pageSimple = await contexte.newPage()
    await seConnecter(pageSimple, IDENT_SIMPLE)
    await pageSimple.goto('/arborescence')
    // Le lien est absent…
    await expect(pageSimple.getByRole('link', { name: 'Rattacher' })).toHaveCount(0)
    // …ET l'écran qu'il désigne reste fermé. Le masquage n'est PAS la protection : sans
    // cette seconde assertion, ce test resterait vert si `exigerAdministrateur`
    // disparaissait de `/membres/[id]/arbre`.
    await pageSimple.goto(`/membres/${idRacine}/arbre`)
    await expect(pageSimple).toHaveURL(/\/tableau-de-bord/)
  } finally {
    await contexte.close()
  }
})

/**
 * PREUVE N°15 — LE DÉPLIAGE EST GARDÉ (D103), PAR APPEL FORGÉ, AVEC CANARI PAR LE MÊME
 * CANAL.
 *
 * `chargerDisciples` n'est liée à AUCUN `<form action>` : le motif `$ACTION_*` des autres
 * suites ne s'applique pas. On CAPTURE la requête réelle émise par le navigateur, puis on
 * la REJOUE — une fois SANS session, une fois AVEC. Le même canal, le même octet.
 */
test('le dépliage refuse un appel forgé SANS session, et le canari réussit par le même canal', async ({
  page,
  baseURL,
}) => {
  await seConnecter(page, IDENT_SIMPLE)
  await page.goto('/arborescence')

  // Capturer la requête de la Server Action.
  const attente = page.waitForRequest(
    (requete) =>
      requete.method() === 'POST' && requete.headers()['next-action'] !== undefined,
  )
  await page.getByRole('button', { name: new RegExp(NOM_RACINE) }).click()
  const requete = await attente

  // COPIE des en-têtes, débarrassée des deux que le client DOIT recalculer lui-même.
  // `content-length` capturé vaudrait celui de la requête d'origine — juste ici, mais
  // faux dès qu'un octet du corps changerait —, et `host` capturé viendrait de la page et
  // non de l'URL rejouée. Playwright les recalcule s'ils sont absents ; les transmettre
  // tels quels, c'est parier sur une coïncidence.
  const entetes = { ...requete.headers() }
  delete entetes['content-length']
  delete entetes.host
  const corps = requete.postData()
  // FILET, exactement comme `verifierCaptureAction` dans les autres suites : si le
  // protocole des Server Actions changeait, cette capture cesserait d'être ce qu'on croit,
  // et le test ne prouverait plus rien — mieux vaut un échec bruyant.
  expect(
    entetes['next-action'],
    "aucun en-tête « next-action » capturé : le protocole des Server Actions a peut-être changé, ce test ne prouve plus ce qu'il prétend",
  ).toBeTruthy()
  expect(corps, 'corps de requête vide : la capture est inexploitable').toBeTruthy()

  // Le dépliage a bien abouti DANS LA PAGE : le compte ordinaire y a droit (D2).
  await expect(page.getByRole('button', { name: new RegExp(NOM_DISCIPLE) })).toBeVisible()

  // ═══ LA FORGE : la MÊME requête, depuis un contexte SANS AUCUNE SESSION ═══
  const sansSession = await requestPlaywright.newContext({ baseURL })
  try {
    const reponse = await sansSession.post(requete.url(), {
      headers: { ...entetes, cookie: '' },
      data: corps!,
    })
    const texte = await reponse.text()
    // ASSERTION PRINCIPALE, par le COMPORTEMENT et non par un code interne : la réponse ne
    // porte AUCUN nom de disciple. Un visiteur ne doit rien apprendre de l'arbre.
    expect(texte).not.toContain(NOM_DISCIPLE)
    expect(texte).not.toContain(NOM_FEUILLE)
    // Assertion secondaire, informative : `exigerProfilActif` redirige vers `/deconnexion`.
    // Elle est SECONDE parce qu'elle porte sur un détail du protocole ; si elle tombait
    // seule, consigner le contenu réel avant de conclure.
    expect(texte).toContain('/deconnexion')
  } finally {
    await sansSession.dispose()
  }

  // ═══ CANARI PAR LE MÊME CANAL ═══
  // La MÊME requête, rejouée depuis la session ORDINAIRE, qui a le droit. Si elle échoue,
  // c'est le MÉCANISME DE FORGE qui est cassé — et le refus ci-dessus ne prouve plus rien.
  const reponseCanari = await page.request.post(requete.url(), {
    headers: entetes,
    data: corps!,
  })
  const texteCanari = await reponseCanari.text()
  expect(
    texteCanari,
    "la forge n'atteint plus l'action : le refus ci-dessus ne prouve plus rien",
  ).toContain(NOM_DISCIPLE)
})

/**
 * LES ACTIONS DE LA RECHERCHE SONT GARDÉES ELLES AUSSI (D103).
 *
 * ═══ POURQUOI CE SECOND TEST EXISTE ═══
 * Le test précédent ne forge QUE `chargerDisciples`. Le module `'use server'` de
 * l'arborescence en exporte trois — `chargerDisciples`, `chargerChemin` et
 * `pageContenant` —, et **toute fonction exportée d'un fichier `'use server'` est
 * appelable depuis le navigateur**. Un garde oublié sur l'une des deux autres ouvrirait la
 * forme de l'arbre à un visiteur sans session, et rien ne le verrait.
 *
 * ═══ ON NE DEVINE PAS LAQUELLE EST LAQUELLE ═══
 * Rien, dans une requête de Server Action, ne dit quelle fonction elle vise : l'en-tête
 * `next-action` porte un identifiant opaque. On capture donc TOUTES les requêtes émises
 * par la recherche, et on les rejoue TOUTES sans session. C'est plus robuste que de
 * prétendre reconnaître l'une d'elles — et cela reste vrai si une quatrième action
 * apparaît un jour.
 */
test('les actions de la recherche refusent un appel forgé SANS session, et le canari réussit', async ({
  page,
  baseURL,
}) => {
  await seConnecter(page, IDENT_SIMPLE)
  await page.goto('/arborescence')

  const capturees: Array<{ url: string; entetes: Record<string, string>; corps: string }> = []
  page.on('request', (requete) => {
    if (requete.method() !== 'POST' || requete.headers()['next-action'] === undefined) return
    const corps = requete.postData()
    if (!corps) return
    const entetes = { ...requete.headers() }
    delete entetes['content-length']
    delete entetes.host
    capturees.push({ url: requete.url(), entetes, corps })
  })

  await page.getByLabel('Aller à une personne').fill(NOM_PETIT)
  await page.getByRole('button', { name: `Test ${NOM_PETIT}` }).click()
  // On attend que la recherche ait ABOUTI dans la page : sans cela, la capture pourrait
  // être vide pour la seule raison qu'on a regardé trop tôt.
  await expect(page.getByRole('navigation', { name: 'Chemin depuis la racine' })).toContainText(
    NOM_PETIT,
  )

  // FILET, exactement comme dans le test précédent : une capture vide rendrait toute la
  // suite de ce test verte en n'éprouvant rien.
  expect(
    capturees.length,
    "aucune requête de Server Action capturée pendant la recherche : le protocole a peut-être changé, ce test ne prouve plus ce qu'il prétend",
  ).toBeGreaterThanOrEqual(2)

  // ═══ LA FORGE : chaque requête capturée, rejouée SANS AUCUNE SESSION ═══
  const sansSession = await requestPlaywright.newContext({ baseURL })
  try {
    for (const capturee of capturees) {
      const reponse = await sansSession.post(capturee.url, {
        headers: { ...capturee.entetes, cookie: '' },
        data: capturee.corps,
      })
      const texte = await reponse.text()
      // ASSERTION PRINCIPALE, par le COMPORTEMENT : aucune réponse ne porte le moindre nom
      // de l'arbre. Un visiteur ne doit rien apprendre — ni un disciple, ni un maillon du
      // chemin de qui que ce soit.
      expect(texte, "une action de la recherche a répondu un nom à un appel SANS session").not.toContain(
        NOM_PETIT,
      )
      expect(texte).not.toContain(NOM_DISCIPLE)
      expect(texte).not.toContain(NOM_RACINE)
    }
  } finally {
    await sansSession.dispose()
  }

  // ═══ CANARI PAR LE MÊME CANAL ═══
  // Les MÊMES requêtes, rejouées depuis la session ORDINAIRE, qui a le droit. Si AUCUNE ne
  // rend un nom, c'est le MÉCANISME DE FORGE qui est cassé — et les refus ci-dessus ne
  // prouvent plus rien. On n'exige pas que CHACUNE rende un nom : `pageContenant` ne rend
  // qu'un nombre, et c'est légitime.
  const textes: string[] = []
  for (const capturee of capturees) {
    const reponse = await page.request.post(capturee.url, {
      headers: capturee.entetes,
      data: capturee.corps,
    })
    textes.push(await reponse.text())
  }
  expect(
    textes.some((texte) => texte.includes(NOM_PETIT) || texte.includes(NOM_RACINE)),
    "la forge n'atteint plus les actions : les refus ci-dessus ne prouvent plus rien",
  ).toBe(true)
})
```

- [ ] **Étape 2 : le contrôle positif manquant de la preuve n°11 (`disciplesDe` n'a pas bougé)**

`tests/e2e/arbre.spec.ts` porte déjà le refus d'archivage nommé — c'est la moitié de la
preuve n°11. **Il lui manque son contrôle positif « dans le même test » :** sans lui, le
refus serait aussi satisfait par un archivage **qui ne marche plus du tout**.

Dans `tests/e2e/arbre.spec.ts`, à la **fin** du test
`archiver un faiseur de disciple est refusé, et la liste des disciples est nommée`, ajouter :

```ts
  // CONTRÔLE POSITIF, DANS LE MÊME TEST : archiver un membre SANS disciple actif RÉUSSIT.
  // C'est la preuve que l'on demande à chaque fois qu'une fonction est DUPLIQUÉE plutôt
  // que modifiée — la phase 5 a ajouté `disciplesPage` À CÔTÉ de `disciplesDe`, sans y
  // toucher (D94), et le contrôle amont d'`archiverMembre` doit continuer de mordre.
  // Sans ce contrôle, le refus ci-dessus resterait vert même si l'archivage était
  // entièrement cassé.
  const { data: sansDisciple, error: erreurSansDisciple } = await admin
    .from('membres')
    .insert({ nom: `${PREFIXE}-sans-disciple`, prenom: 'Test' })
    .select('id')
    .single()
  if (erreurSansDisciple || !sansDisciple) {
    throw new Error(`préparation impossible : ${erreurSansDisciple?.message}`)
  }

  await page.goto(`/membres/${sansDisciple.id}`)
  page.once('dialog', (dialogue) => dialogue.accept())
  await page.getByRole('button', { name: 'Archiver' }).click()

  // ═══ ATTENDRE LA FIN DE L'ACTION AVANT DE LIRE LA BASE ═══
  // `click()` rend la main dès la DÉPÊCHE de l'événement, pas à la fin de l'action.
  // `archiverMembre` marque sa réussite par un `redirect('/membres')` : c'est le seul
  // signal observable, et sans lui la lecture ci-dessous partirait AVANT l'écriture. Le
  // test serait alors instable, et son échec serait attribué à l'archivage plutôt qu'à la
  // course. Le test frère, juste au-dessus, attend une alerte pour la même raison.
  await expect(page).toHaveURL(/\/membres(\?|$)/)

  const { data: apres, error: erreurApres } = await admin
    .from('membres')
    .select('etat')
    .eq('id', sansDisciple.id)
    .single()
  if (erreurApres) throw new Error(`relecture impossible : ${erreurApres.message}`)
  expect(apres?.etat).toBe('archive')
```

**Vérifier que `PREFIXE` est bien la constante employée par le nettoyage de ce fichier** —
si ce n'est pas le cas, employer celle qui l'est, sans quoi cette fiche resterait en base.

- [ ] **Étape 3 : exécuter, puis commit**

```bash
npm run test:e2e
```

```bash
git add tests/e2e/arborescence.spec.ts tests/e2e/arbre.spec.ts
git commit -m "test: parcours, visibilite et garde force de l'arborescence, plus le controle positif de disciplesDe (preuves 11, 15)"
```

**Preuve produite :** la sortie de `test:e2e`, montrant en particulier que **le canari
réussit** et que **l'appel sans session ne rend aucun nom**.

---

### Task 15 : les amendements documentaires (arbitrages 1, 2 et 4 ; D99)

**Fichiers :**
- Modifier : `docs/superpowers/specs/2026-08-11-suivi-asonkeng-design.md`
- Modifier : `README.md`

**Interfaces :**
- Consomme : rien. **Aucun code n'est touché par cette tâche.**
- Produit : le §9 amendé, la ligne `D81 à D105` ajoutée à la table des plages du §2, et un
  README qui ne porte plus deux définitions incompatibles de « phase 5 ».

## ⚠️ CE QU'IL NE FAUT SURTOUT PAS FAIRE ICI

1. **NE RENUMÉROTER AUCUNE DÉCISION.** Les numéros sont cités dans des `comment on`
   **appliqués en base** ; renuméroter ferait mentir le code.
2. **NE PAS ROUVRIR LA COLLISION D36–D43.** Elle est **arbitrée et appliquée** : la règle
   est de **citer la phase** — « D42 (2b) » / « D42 (phase 3) » —, et la note de
   désambiguïsation **existe déjà** dans la spécification maîtresse, posée par la phase 4.
   **Ne pas l'écrire une seconde fois.**
3. **NE PAS RAJOUTER LE RENVOI D30–D80.** Il **existe déjà** (note du 2026-08-14, avec sa
   table des plages). Le point 3 du §11 de la phase 4 est **clos**. Cette tâche n'ajoute
   qu'**une ligne** à la table existante.
4. **NE PAS toucher au §4.2.** D88 le rend **vrai sans qu'un mot change** : il promettait
   depuis le 2026-08-11 que le dirigeant est proposé « à la création d'un membre », et la
   phase 5 honore cette phrase. **La corriger serait effacer la trace de ce qu'elle a
   coûté.**

**Le piège que cette tâche referme est celui qui a coûté deux phases au §4.4 : un
amendement qui ne vit que dans une PARTIE des documents.** Règle à appliquer : **chercher
dans TOUS les documents chaque phrase qui nomme l'ancien état** avant de considérer
l'amendement posé — l'étape 4 le fait.

- [ ] **Étape 1 : le §9 de la spécification maîtresse**

Dans `docs/superpowers/specs/2026-08-11-suivi-asonkeng-design.md`, §9 « Découpage en
phases » : **ajouter deux lignes au tableau**, après la ligne « 4 — Événements », et
**ajouter l'encadré daté sous la phrase existante** « Les phases 3 et 4 sont indépendantes
… », **sans la supprimer** — elle reste vraie.

Lignes du tableau :

```markdown
| **5 — Création enrichie et arborescence** | Création d'un membre avec ses statuts, son faiseur de disciple et son dirigeant en une seule transaction ; arbre des faiseurs de disciple parcourable en consultation | Poser une personne dans l'arbre du premier coup, et voir l'arbre |
| **6 — Refonte UI/UX** | Reprise de l'interface, et remédiation des douze formulaires à champs libres encore atteints par la réinitialisation de React | Rendre l'application agréable, et cesser d'effacer des saisies |
```

Encadré, sous la phrase sur l'indépendance des phases 3 et 4 :

```markdown
> **Ajout du 2026-08-15 — les phases 5 et 6.** Ce tableau s'arrêtait à la phase 4 : le
> périmètre de la phase 5 n'existait donc dans **aucun** document du projet, alors que sa
> conception était écrite et ses décisions numérotées (D81 à D105). C'est exactement le
> piège de « l'amendement qui ne vit que dans une partie des documents », déjà payé deux
> fois sur le §4.4. Les deux lignes ci-dessus le referment.
>
> **La phase 5 est celle de la création enrichie et de l'arborescence**, et **non** la
> refonte UI/UX : celle-ci devient la **phase 6**. Le README annonçait « la phase 5
> (refonte UI/UX) » ; sa référence est corrigée par le même amendement.
>
> **L'ordre interne de la phase 5 est contraint**, et ce n'est pas de l'ordonnancement de
> confort (D96) : la création enrichie est livrée **avant** l'arbre parcourable.
> `creerMembre` n'ayant jamais écrit de `faiseur_de_disciple_id`, toute fiche créée depuis
> la phase 1a est une racine tant que personne n'ouvre l'écran de rattachement — un arbre
> livré d'abord serait jugé cassé alors qu'il dirait la vérité.
>
> **La phase 5 corrige DEUX des quatorze formulaires à champs libres** recensés dans le
> README : `membres/formulaire-membre.tsx` (le deuxième pire cas, 9 champs) et
> `inscription/formulaire-inscription.tsx` (le pire de tous — écran **public**, 8 champs,
> aucun rattrapage, en production). **Les douze autres relèvent de la phase 6.**
```

- [ ] **Étape 2 : la ligne D81–D105 dans la table des plages du §2**

Dans le même fichier, §2, dans l'encadré « **Ajout du 2026-08-14 — où vivent les décisions
D30 à D80** », **ajouter une ligne au tableau existant**, après `D54 à D80` :

```markdown
> | D81 à D105 | `2026-08-15-phase-5-creation-arbre-design.md` |
```

**Ne rien changer d'autre dans cet encadré** — ni son titre, ni son texte, ni
l'avertissement sur D36–D43 qui le suit. **Il est déjà juste.**

- [ ] **Étape 3 : le README**

Quatre modifications, et **quatre seulement**.

**(a) La phrase de statut du piège des champs effacés** (autour de la ligne 297,
« Statut : connu, mesuré, non corrigé hors phase 4. À traiter en phase 5 (refonte UI/UX),
et le cas public mérite d'être traité avant les autres. ») — la remplacer par :

```markdown
**Statut : DEUX des quatorze corrigés en phase 5, douze restants, connus et mesurés.** La
phase 5 a corrigé le **cas public** — `inscription/formulaire-inscription.tsx`, que ce
tableau désigne comme prioritaire — **et** `membres/formulaire-membre.tsx`, le deuxième
pire cas, que la création enrichie rendait plus grave encore en lui ajoutant des champs.
**Les douze autres sont à traiter en phase 6 (refonte UI/UX)** — et non en phase 5, qui est
celle de la création enrichie et de l'arborescence (§9 de la spécification maîtresse,
amendement du 2026-08-15).

**Les deux corrigés portent la PREMIÈRE preuve de cette classe dans le projet** :
`tests/e2e-prod/creation-enrichie-production.spec.ts` remplit tous les champs, provoque un
refus, et vérifie que **chacun porte encore sa valeur** — contre un build de production
réel. Les douze restants n'en ont toujours aucune.
```

**(b) Les deux lignes CRITIQUE du tableau des quatorze** — les marquer comme corrigées,
**sans les retirer** : le tableau est un relevé, et effacer une ligne effacerait la trace
de ce qui a été payé.

```markdown
| ~~**CRITIQUE**~~ **CORRIGÉ (phase 5)** | `inscription/formulaire-inscription.tsx` — **écran PUBLIC**, aucun rattrapage | ~~**8**~~ 0 |
| ~~**CRITIQUE**~~ **CORRIGÉ (phase 5)** | `membres/formulaire-membre.tsx` | ~~**9**~~ 0 |
```

**(c) La QUATRIÈME occurrence de « phase 5 », que les deux premières modifications ne
touchent pas** — autour de la ligne 966, à propos des participants externes classés sans
suite : « … il faut la **ressaisir** comme nouveau participant — ce qui crée une autre ligne
et ne rattache pas l'ancienne participation. **À traiter en phase 5.** »

Cette phrase désigne l'écran « qui ai-je classé », qui **n'est pas** dans le périmètre de
cette phase. Remplacer **la dernière phrase, et elle seule** :

```markdown
À traiter en phase 6.
```

**Ne rien changer d'autre dans ce paragraphe** : tout le reste — la passerelle qui accepte
un classé, l'absence d'écran qui les liste, le fait qu'un classé se reconnaît sans se
retrouver — reste **vrai** et décrit un manque réel. C'est le renvoi de phase qui est faux,
pas le constat.

**(d) Une section « Phase 5 » en fin de README**, sur le modèle des sections de phase
existantes :

```markdown
## Phase 5 : la création enrichie et l'arborescence

- **Création enrichie** (`/membres/nouveau`) — la fiche, ses statuts, son faiseur de
  disciple et son dirigeant en **une seule soumission** et **une seule transaction**. Les
  trois enrichissements sont facultatifs et indépendants ; une création sans aucun d'eux
  produit exactement ce que l'ancienne `creerMembre` produisait.
- **`public.creer_membre_enrichi`** — passerelle atomique unique, qui **compose**
  `public.definir_arbre` et `public.attribuer_statut` au lieu de recopier leurs gardes
  (D81, D82). Aucune trace écrite depuis son intérieur ne survivrait à son échec — Postgres
  n'a pas de transaction autonome —, **le diagnostic est donc journalisé côté application**.
- **Refus du couple exclusif à la création** (D84), deux fois : une fonction pure qui
  **nomme les deux statuts**, et la passerelle qui **relit les groupes en base**. L'éviction
  de `prive.attribuer_statut` n'est jamais laissée agir ici : elle journaliserait le retrait
  d'un statut que personne n'a jamais porté plus d'une transaction.
- **`/arborescence`** — l'arbre des faiseurs de disciple, **en consultation seule** (D92),
  ouvert à tout compte actif. Racines paginées et **dénombrées** (le nombre est la mesure
  qui dira si la création enrichie agit), dépliage nœud par nœud, recherche menant au
  **chemin déplié** d'une personne, indentation plafonnée et fil d'Ariane.
- **L'invariant que trois déclencheurs tenaient sans que personne l'ait écrit — écrit,
  ÉLARGI et VERROUILLÉ par cette phase** : **aucun membre `actif` n'a d'ancêtre qui ne soit
  pas `actif`** (20260814120000, 20260814140000, 20260814150000, corrigées par la phase 5).
  C'est lui qui rend l'arbre sans trou. **Deux défauts ont été fermés au passage**, tous
  deux sur du code déjà déployé : (1) les trois gardes ne comparaient qu'à `archive`, alors
  que l'état a **trois** valeurs — rien n'interdisait de rattacher un membre actif à un
  faiseur `en_attente`, dont toute la descendance active devenait alors **inatteignable
  depuis les racines** ; (2) l'état du faiseur était lu **sans verrou de ligne**, si bien
  qu'un rattachement et un archivage concurrents ne se voyaient pas et validaient tous les
  deux. Un `for share` referme la course, et un marqueur distinct,
  `faiseur_de_disciple_inactif`, évite d'afficher « ce faiseur est archivé » à propos d'une
  fiche qui ne l'est pas.
- **L'écran ne s'appuie pourtant PAS sur cet invariant pour être correct** : les noms des
  maillons du chemin sont filtrés `etat = 'actif'` **explicitement, pour tous les rôles**,
  et un maillon qui ne l'est pas dégrade en « Fiche non consultable », **à sa place dans le
  chemin**. Sans ce filtre, l'exclusion aurait été déléguée à la RLS — un administrateur
  aurait lu le **nom** là où un compte ordinaire lit « Fiche non consultable », et l'écran
  aurait menti sur sa propre légende.

**Restent non corrigés, et signalés plutôt que lissés :** `disciplesDe` (non bornée, tri
non total, **délibérément intacte** — son second appelant, le contrôle amont
d'`archiverMembre`, doit rester complet, D94), `listerCatalogue`, `statutsDuMembre` et
`journalDuMembre` (non bornées) ; et la divergence des doctrines de pagination D29/D46/D53
contre D75, qui laisserait le pointage AEL se faire tronquer en silence au-delà de mille
membres actifs par antenne.
```

- [ ] **Étape 4 : LE BALAYAGE QUI REFERME LE PIÈGE — chercher l'ancien état PARTOUT**

## ⚠️ LE BALAYAGE CHERCHE « PHASE 5 » TOUT COURT, ET CHAQUE OCCURRENCE SE RELIT

Un motif qui ne cherche que « phase 5 (refonte » **ne capte pas** les phrases qui renvoient
à la phase 5 sans la qualifier — et c'est exactement par là que l'amendement partiel se
reforme. Le balayage porte donc sur la chaîne nue, sans casse :

```bash
grep -rni "phase 5" README.md docs/
```

**Chaque occurrence doit être RELUE, une par une**, et rangée dans l'une des trois
catégories suivantes :

1. celles qui décrivent **cette** phase — création enrichie et arborescence : **justes**,
   on n'y touche pas ;
2. celles qui renvoient à la phase 5 pour un travail qui n'y est **pas** — refonte UI/UX,
   écran « qui ai-je classé » : **à corriger en phase 6** ;
3. celles qui rapportent un **fait daté** (« corrigé en phase 5 ») : **justes**, ce sont
   des traces, elles ne se réécrivent pas.

Consigner le décompte des trois catégories dans le rapport de tâche. Le seul résultat
inacceptable est une occurrence **non relue**.

```bash
grep -rni "refonte UI/UX" README.md docs/
```

**Attendu :** plus **aucune** occurrence associant « phase 5 » et « refonte UI/UX », et les
seules occurrences de « refonte UI/UX » restantes désignent la **phase 6**.

```bash
grep -rn "quatorze\|14 composants" README.md docs/
```

**Chaque occurrence doit être relue** : celles qui décrivent le **relevé d'origine** restent
justes et ne se touchent pas ; celles qui décrivent l'**état actuel** doivent dire « douze
restants ».

**CONTRÔLE POSITIF DES DEUX BALAYAGES** — sans lui, une commande mal formée rendrait
« aucune occurrence » pour toujours :

```bash
grep -rn "arborescence" README.md docs/superpowers/specs/2026-08-11-suivi-asonkeng-design.md
```

**Attendu : plusieurs lignes**, dont celles que cette tâche vient d'écrire.

- [ ] **Étape 5 : les portes rapides, puis commit**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls
```

(Aucun code n'a changé ; ces portes ne font que confirmer que le dépôt est resté propre.)

```bash
git add README.md docs/superpowers/specs/2026-08-11-suivi-asonkeng-design.md
git commit -m "docs: amender le decoupage en phases (5 et 6) et corriger la reference du README"
```

**Livrable indépendamment éprouvable :** plus aucun document du projet ne porte deux
définitions incompatibles de « phase 5 », et le périmètre de cette phase existe désormais
dans la spécification maîtresse.

---

## Clôture de la phase

- [ ] **Les six portes, une dernière fois, sur le dépôt entier**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls && npm run test:e2e && npm run build
```

```bash
npm run test:e2e:prod
```

**Si l'une échoue, ÉTABLIR QUEL COMMIT L'A CASSÉE par un rejeu en isolation.** Ne jamais
« corriger au jugé » une suite rouge dont on n'a pas identifié le commit fautif.

- [ ] **Auto-relecture finale, à faire avant de déclarer la phase close**

1. **Chaque décision D81 à D105 a-t-elle une tâche qui la réalise ?** La carte en tête de ce
   plan les liste ; la reparcourir contre le code réellement écrit, pas contre la carte.
2. **Le recensement des chemins d'écriture du §10.2 du design est-il exact,
   module par module ?** Après cette phase : `membres` (insert) par
   `creer_membre_enrichi`, `sInscrire`, `soumettreDemandeSuivi`,
   `convertir_participant_externe` (chemins 1 et 2) — **`creerMembre` n'existe plus** ;
   `membres.faiseur_de_disciple_id` par `modifierMembre`, `public.definir_arbre`,
   `convertir_participant_externe` chemin 2, et `creer_membre_enrichi` **via
   `definir_arbre`, donc sous le verrou** ; `membre_statuts` et `journal_statuts` par
   `public.attribuer_statut`, `public.retirer_statut`, et `creer_membre_enrichi` **via
   `attribuer_statut`** ; **aucune** politique RLS ni déclencheur créé, modifié ou
   supprimé ; **`/arborescence` : aucun chemin d'écriture.**
3. **Pour chaque test écrit : passerait-il encore si l'appel qu'il interroge échouait
   totalement ?** Si oui, il ne prouve rien — il lui manque son contrôle positif, ou son
   contrôle positif est **inerte**.
4. **Pour chaque contrôle positif : serait-il encore satisfait par une base vide, ou par
   une page en erreur ?** Dans la phase 4, un test cherchait un mot que le message « aucun
   élément » contenait aussi : il était satisfait par l'état même qu'il devait exclure.
5. **Aucune mutation n'est restée active en base, et aucun objet temporaire non plus.**
   `pg_get_functiondef` de `public.creer_membre_enrichi` doit être **identique** à celui
   relevé avant la preuve n°1. Et les fonctions temporaires de la course de la Task 1 bis
   doivent avoir **disparu** — laissées en base, elles seraient un chemin d'écriture
   permanent et non recensé :

```sql
select count(*) as fonctions_temporaires_restantes
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname like 'zz\_%';
-- ATTENDU : 0.
```

6. **Aucun résidu de test.** Les **huit** préfixes de famille employés par cette phase —
   `ZZCreationEnrichie-`, `ZZCreationE2E-`, `ZZCreationProdE2E-`, `ZZArborescence-`,
   `ZZArborescenceE2E-`, plus `ZZVerifPasserelle-`, `ZZCourse-` et `ZZMutation-` (contrôles
   manuels des Tasks 1, 1 bis et 6) :

```sql
select
  (select count(*) from public.membres where nom like 'ZZCreationEnrichie-%') as c1,
  (select count(*) from public.membres where nom like 'ZZCreationE2E-%') as c2,
  (select count(*) from public.membres where nom like 'ZZCreationProdE2E-%') as c3,
  (select count(*) from public.membres where nom like 'ZZArborescence-%') as c4,
  (select count(*) from public.membres where nom like 'ZZArborescenceE2E-%') as c5,
  (select count(*) from public.membres where nom like 'ZZVerifPasserelle-%') as c6,
  (select count(*) from public.membres where nom like 'ZZCourse-%') as c7,
  (select count(*) from public.membres where nom like 'ZZMutation-%') as c8;
```

**Attendu : huit zéros.** Un résidu n'est pas anodin : une fiche `ZZ…` sans faiseur de
disciple **est une racine**, donc elle **fausse la mesure** que l'écran `/arborescence`
existe pour rendre lisible.

7. **L'invariant d'arbre, relu une dernière fois, avec ce sur quoi la mesure a porté :**

```sql
select
  (select count(*) from public.membres)                                              as fiches,
  (select count(*) from public.membres where etat <> 'actif')                        as non_actives,
  (select count(*) from public.membres e
     join public.membres p on p.id = e.faiseur_de_disciple_id
    where e.etat = 'actif' and p.etat <> 'actif')                                    as fautifs;
```

**`fautifs` doit valoir 0.** Mais **si `non_actives` vaut 0, cette mesure est vacuellement
vraie et ne prouve rien** : le rapport de clôture doit l'écrire ainsi, et non compter un
zéro comme une preuve. Au moment de la rédaction de ce plan, la base comptait **8 fiches,
toutes actives, et 2 racines réelles**.






