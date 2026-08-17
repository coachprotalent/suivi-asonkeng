# Phase 8 — Le rôle « leader » et la suppression d'un compte

**Date :** 2026-08-17
**Statut :** design proposé, prêt pour revue avant plan d'implémentation
**Spécification maîtresse :** `2026-08-11-suivi-asonkeng-design.md` — ce document ne la remplace
pas. Il ajoute un **troisième rôle** au §5.3 et **la suppression d'un compte** au §5.4, que la
spécification n'a jamais prévue : jusqu'ici, un compte se désactive, il ne s'efface pas.

---

## 1. Objet

Deux demandes de l'utilisateur, arbitrées le 2026-08-17 :

1. **Un rôle « leader »**, attribuable par l'administrateur, signifiant que la personne est
   « dirigeant de tout ».
2. **Pouvoir supprimer un compte créé par erreur**, en tant qu'administrateur.

Les deux lots sont **indépendants** : ni l'un ni l'autre ne lit ce que fait le second. Ils sont
livrés ensemble parce qu'ils touchent tous deux `/comptes`, l'unique écran d'administration des
comptes.

---

## 2. Décisions déjà prises par l'utilisateur, et non rouvertes

Chacune a été posée en question fermée, avec ses conséquences énoncées **avant** l'arbitrage.

- **Le leader est un RÔLE d'autorité, pas une écriture dans l'arbre.** Deux lectures avaient été
  proposées : (A) une quatrième valeur de `role_app` que `peutModifier` court-circuite, l'arbre
  restant intact ; (B) rattacher littéralement chaque racine au leader dans
  `membres.faiseur_de_disciple_id`. **L'utilisateur a retenu A.** B aurait été une écriture de
  données massive, en collision frontale avec l'anti-cycle et avec l'invariant « aucun membre
  actif n'a d'ancêtre non actif ».
- **Le leader ne voit PAS davantage de fiches qu'un compte ordinaire.** `prive.peut_lire_membre`
  n'est pas touchée : ni les fiches archivées, ni les fiches en attente.
- **Le leader n'hérite PAS des pouvoirs de modérateur.** L'utilisateur a d'abord retenu l'inverse,
  puis est revenu dessus une fois établi que cela rendrait le nom
  `prive.est_moderateur_ou_admin` **faux** et imposerait un renommage de 2 politiques et 16
  fichiers. L'AEL, le rattachement d'antenne et les participants à traiter restent au modérateur
  et à l'administrateur. **Les deux rôles restent cumulables sur une même personne.**
- **Les demandes de suivi SURVIVENT à la suppression de leur auteur.** L'utilisateur a d'abord
  retenu « refuser la suppression si le compte a des demandes », puis est revenu dessus une fois
  MESURÉ que : une demande n'est jamais supprimée — `annuler_demande_membre` passe son état à
  `annulee`, la ligne reste (20260815200000) — et que **toute inscription par token crée une
  demande** (`origine: 'auto_inscription'`, `src/app/inscription/actions.ts:568`). Ce refus
  aurait rendu **tout compte auto-inscrit définitivement indestructible**, c'est-à-dire
  précisément le « compte créé par erreur » que la demande vise.
- **Un administrateur ne peut pas supprimer son propre compte.**

---

## 3. Décisions prises pendant ce cadrage

> **Numérotation.** Les numéros de décision sont globaux au projet. La phase 7 s'arrête à
> **D148** ; cette table reprend à **D149**. Rappel de la règle en vigueur : **D36 à D43 sont
> attribués deux fois** (phase 2b et phase 3), et toute citation d'un de ces huit numéros doit
> nommer sa phase.

### Lot A — le rôle leader

- **D149 — La valeur d'énumération est ajoutée par une migration qui ne fait QUE cela.**
  Postgres refuse d'**employer** une valeur d'énumération dans la transaction qui l'**ajoute**.
  `supabase db push` applique chaque fichier de migration dans sa propre transaction : séparer
  l'ajout de son premier usage est donc la seule forme qui fonctionne. Les regrouper produirait
  l'erreur `unsafe use of new value "leader" of enum type role_app`, **au déploiement**, pas à
  l'écriture.

- **D150 — L'autorité du leader est un COURT-CIRCUIT dans `peutModifier`, au même rang que
  celui de l'administrateur.** `ContexteAutorite` gagne `estLeader`, et le court-circuit est
  placé **avec** celui d'`estAdmin`, donc **avant** le contrôle `membreLieId === null`. Un
  leader sans fiche membre garde son autorité, exactement comme un administrateur — et pour la
  même raison : son pouvoir ne vient pas de sa place dans l'arbre.
  Conséquence directe et voulue : **un leader a autorité sur sa propre fiche**, là où un
  dirigeant ordinaire ne l'a jamais (« nul n'est son propre ancêtre »). C'est le comportement
  déjà en vigueur pour l'administrateur ; on ne crée pas une troisième règle.

- **D151 — Aucune politique RLS n'est touchée, et aucune primitive SQL n'est créée.**
  `prive.peut_lire_membre` et `prive.est_moderateur_ou_admin` restent inchangées (§2).
  **Aucun `prive.est_leader()` n'est écrit** : aucune politique n'en a besoin, et une primitive
  sans appelant est une porte ouverte sans usage. L'autorité du leader se décide **entièrement
  côté application**, dans `peutModifier`, comme celle du dirigeant désigné.

- **D152 — CE QUE LE LEADER PEUT RÉELLEMENT FAIRE, mesuré et non supposé.**
  `exigerAutoriteSur` n'a que **deux appelants** dans tout le dépôt : `attribuerStatut` et
  `retirerStatut` (`src/app/membres/[id]/statuts/actions.ts`). Le leader gagne donc
  **exactement un pouvoir : attribuer et retirer un statut à n'importe quel membre**. Créer,
  modifier ou archiver une fiche, et définir l'arbre, restent réservés à l'administrateur par
  leur propre garde `exigerAdministrateur`, que ce lot ne touche pas.
  Il gagne aussi, sur `/membres/[id]`, le lien « Gérer » là où il lisait « Journal » —
  `aAutoriteSur` décide de ce libellé.

- **D153 — AUTORITÉ ET VISIBILITÉ SONT DÉCOUPLÉES POUR CE RÔLE, ET C'EST DIT PLUTÔT QUE TU.**
  Le leader a autorité sur **tout** membre mais ne peut **ouvrir** qu'une fiche active (§2).
  En pratique, les écrans d'une fiche archivée ou en attente rendent `notFound()` : il ne peut
  pas y agir par l'interface. Mais **une requête forgée vers `attribuerStatut` sur une telle
  fiche passerait**, `exigerAutoriteSur` ne consultant pas la visibilité.
  Ce n'est pas une faille dissimulée : c'est la conséquence directe de la décision de
  l'utilisateur, et un administrateur a exactement la même latitude — le leader l'a sans
  pouvoir regarder ce qu'il fait. On l'inscrit ici plutôt que de laisser croire à une
  fermeture totale. **Si cela devient gênant, la correction est de rendre `exigerAutoriteSur`
  dépendant de la lisibilité, pas d'élargir la lecture du leader en douce.**

- **D154 — `public.definir_roles` est REMPLACÉE, pas modifiée.** Elle gagne `p_leader boolean`,
  donc sa signature change, donc `create or replace` ne suffit pas : `drop` + `create` +
  `revoke`/`grant` refaits. **Même piège qu'en phase 7 (D135)** — sans le `drop`, une surcharge
  coexisterait, PostgREST choisirait l'ancienne pour tout appelant ne passant pas `p_leader`,
  et **une case « Leader » cochée resterait sans effet, en silence**. Une preuve permanente
  appelle l'ancienne signature et exige `PGRST202`.

- **D155 — Le garde du dernier administrateur n'est PAS étendu au leader.** Il doit rester au
  moins un administrateur actif ; il n'a jamais à rester un leader. Un projet sans leader
  fonctionne exactement comme aujourd'hui.

- **D156 — `/mes-membres` reste la portée PERSONNELLE, même pour un leader.** Ses quatre
  sections continuent de décrire sa place dans l'arbre. Y déverser tout le registre
  dupliquerait `/membres`, qui est déjà l'annuaire complet et déjà paginé. Le leader consulte
  tout le monde par l'annuaire, et agit depuis la fiche.

### Lot B — la suppression d'un compte

- **D157 — Les demandes survivent à leur auteur, par le même mécanisme que le journal des
  statuts.** `demandes_membre` gagne `demandeur_nom_affichage text` ;
  `demandeur_profil_id` devient **nullable** et sa clé étrangère passe de `on delete cascade` à
  `on delete set null`. C'est exactement ce que la migration 20260813160000 a fait pour
  `journal_statuts.par_nom_affichage`, et pour la même raison : un registre d'audit doit rester
  lisible sans dépendre de l'existence du compte auteur.

- **D158 — Le nom du demandeur est figé par un DÉCLENCHEUR `before insert`, jamais par les
  appelants.** Le dépôt compte **TROIS sites d'insertion** dans `demandes_membre`, relevés :
  `src/app/inscription/actions.ts:566`, `src/app/demandes/nouvelle/actions.ts:51`, et
  **`public.convertir_participant_externe`** — cette dernière **en SQL**
  (20260818280000, dernière version en date). Ce troisième site est décisif : **aucune
  modification applicative ne l'aurait couvert**, et le nom aurait manqué précisément sur les
  demandes nées d'une conversion de participant externe.
  Un site oublié écrirait une ligne muette, invisible jusqu'au jour où son auteur serait
  supprimé. Un déclencheur ne peut être oublié par aucun des trois. Les lignes existantes sont
  reprises par un `update` de rattrapage dans la même migration.

- **D159 — Le mécanisme de suppression : un DÉCLENCHEUR `before delete` sur `public.profils`,
  et la suppression par `auth.admin.deleteUser`.**
  `profils.id` référence `auth.users` en `on delete cascade` : supprimer le compte
  d'authentification cascade vers `profils` et **déclenche le contrôle dans la MÊME
  transaction**. Un refus annule donc tout, **y compris la suppression du compte
  d'authentification**.
  C'est ce qui donne l'atomicité **sans écrire à la main dans le schéma `auth`** — dont
  Supabase ne garantit pas la stabilité, et dont les tables satellites (`auth.identities`,
  `auth.sessions`) ont leurs propres clés étrangères.
  Le chemin inverse — supprimer d'abord `profils` — est **explicitement refusé** : il
  laisserait un compte d'authentification orphelin, exactement celui qu'un balayage de la
  phase 7 a trouvé en base (`verif.privilege.…@example.com`, créé le 2026-08-13).

- **D160 — Deux refus en BASE, un troisième dans l'ACTION, et la différence est écrite.**
  En base, par le déclencheur : le **compte racine** (`compte_racine`) et le **dernier
  administrateur actif** (`dernier_administrateur`, via `prive.compter_administrateurs_actifs`,
  qui existe déjà).
  Dans la Server Action seulement : **l'auto-suppression**. Le déclencheur ne peut pas la voir —
  appelé derrière la clé de service, `auth.uid()` y vaut `null`, la base ignore qui supprime.
  **Ce garde-là n'est donc pas une barrière, c'est un garde d'action**, et la spec le dit :
  une requête forgée par un administrateur contre lui-même passerait. La conséquence serait un
  administrateur qui se supprime — désagréable, jamais dangereux, et le cas catastrophique
  (plus aucun administrateur) reste tenu en base.

- **D161 — La FICHE MEMBRE n'est PAS supprimée, et l'écran le DIT avant de confirmer.**
  Compte et fiche sont deux objets distincts (§3.2 de la spécification maîtresse) ; les
  confondre effacerait une personne du suivi pour une erreur de compte. `profils.membre_id` est
  déjà en `on delete set null` côté `membres`, rien à changer — mais la **confirmation** doit
  l'énoncer, sans quoi l'administrateur croira effacer les deux.

- **D162 — Les notifications du compte disparaissent avec lui, et c'est voulu.**
  `notifications.profil_id` est en `on delete cascade` (20260815120000). Une notification est
  adressée à une personne ; elle n'a aucun sens sans destinataire. C'est le SEUL `cascade` vers
  `profils` qu'on laisse agir, et il est nommé ici pour n'avoir pas à être redécouvert.

- **D163 — Tout le reste est déjà en `on delete set null`, et le restera.**
  Relevé exhaustif : `membres.cree_par`, `membre_statuts.attribue_par`,
  `journal_statuts.par_profil_id`, `tokens_inscription.cree_par` et `.utilise_par_profil_id`,
  `demandes_membre.traite_par`, `seances_ael.cree_par`, `presences_ael.pointe_par`,
  `evenements.cree_par`, `participants_externes.converti_par` / `.classe_par` / `.cree_par`,
  `participations.saisi_par` / `.modifie_par`. Aucune ne perd de donnée métier : elles perdent
  l'auteur, jamais le fait. `journal_statuts` conserve en outre le **nom** de l'auteur.

---

## 4. Lot A — le rôle leader

### 4.1 Base

**Migration `20260821100000_role_leader_enum.sql`** — une seule instruction (D149) :

```sql
alter type public.role_app add value 'leader';
```

**Migration `20260821110000_definir_roles_leader.sql`** — `drop` de la signature à trois
paramètres, `create` de celle à quatre (`p_profil`, `p_administrateur`, `p_moderateur`,
`p_leader`), corps recopié à l'identique avec une branche `if p_leader then insert …`, puis
`revoke`/`grant` refaits (D154).

Le garde du dernier administrateur reste **inchangé** : il ne porte que sur
`p_administrateur` (D155).

### 4.2 Application

- `RoleApp` gagne `'leader'` ; `LIBELLE_ROLE` gagne « Leader » sur `/comptes` et sur `/profil`.
- `ContexteAutorite` gagne `estLeader: boolean` ; `peutModifier` le court-circuite avec
  `estAdmin` (D150).
- `deciderAutorite` (`src/lib/securite/garde.ts`) lit le rôle et le transmet. Il lisait déjà
  les rôles pour `estAdmin` : **aucune lecture supplémentaire**.
- `/comptes` : une troisième case, et `definirRoles` passe `p_leader`.
- Le texte d'avertissement de `ligne-compte.tsx` (« Si vous retirez votre rôle administrateur,
  vous perdrez ce pouvoir immédiatement ») **n'est pas étendu au leader** : retirer son propre
  rôle leader ne verrouille rien et ne mérite pas un avertissement de plus.

**Aucun écran nouveau, aucune entrée de navigation nouvelle** : le leader ne gagne pas d'écran,
il gagne un pouvoir sur des écrans existants (D152).

---

## 5. Lot B — la suppression d'un compte

### 5.1 Base

**Migration `20260821120000_demandes_auteur_conserve.sql`** (D157, D158) :
colonne `demandeur_nom_affichage`, clé étrangère refaite en `on delete set null`, colonne
`demandeur_profil_id` rendue nullable, déclencheur `before insert` qui résout le nom, et
`update` de rattrapage des lignes existantes.

**Migration `20260821130000_suppression_compte.sql`** (D159, D160) :
`prive.refuser_suppression_compte()`, déclencheur `before delete on public.profils`, portant
les deux refus de base.

### 5.2 Application

Server Action `supprimerCompte` (`src/app/comptes/actions.ts`), gardée par
`exigerAdministrateur` :

1. refus **d'auto-suppression** si `profil.id === cible` (D160) ;
2. contrôles amont qui **nomment** la cause — racine, dernier administrateur — pour un message
   utile plutôt que le message générique ;
3. `clientAdmin().auth.admin.deleteUser(cible)` ;
4. `revalidatePath('/comptes')`.

Les contrôles amont **expliquent**, le déclencheur **protège** : une rétrogradation concurrente
entre la lecture et la suppression passerait le contrôle amont et serait arrêtée en base, avec
un message moins précis mais honnête. Même partage que `archiverMembre`.

⚠️ **La remontée du marqueur depuis un refus du déclencheur n'est PAS garantie.** L'erreur
traverse GoTrue, qui n'expose pas `error.details` de Postgres. Le message affiché dans ce cas
sera donc **générique**, et c'est pourquoi les contrôles amont existent — ce sont eux qui
produisent les messages utiles dans tous les cas atteignables en pratique. La spec le dit
plutôt que de promettre une discrimination de marqueur qui ne tiendrait pas.

### 5.3 Écran

Un bouton « Supprimer ce compte » sur `/comptes`, derrière le composant `Dialogue` (D124),
dont le message **énonce** que la fiche membre n'est pas supprimée (D161) et que les
notifications le sont (D162).

---

## 6. Tests

| Lot | RLS | E2E |
|-----|-----|-----|
| A | un leader a autorité sur un membre hors de sa descendance ; il n'en a pas plus sur la lecture (fiche archivée toujours invisible) ; `definir_roles` écrit et retire le rôle ; l'ancienne signature n'existe plus (`PGRST202`) | attribution du rôle depuis `/comptes` ; un leader voit « Gérer » et attribue un statut à quelqu'un dont il n'est ni ancêtre ni dirigeant |
| B | le refus du compte racine ; une demande **survit** à la suppression de son auteur, avec son nom ; les notifications disparaissent ; la fiche membre **subsiste** ; le nom du demandeur figé à l'insertion, sans écrasement d'une valeur fournie | suppression avec confirmation, et le compte disparaît de `/comptes` |

> **Un refus n'est PAS éprouvé, et il faut le dire.** Celui du **dernier administrateur actif**
> porte sur `prive.compter_administrateurs_actifs(old.id) = 0`, qui compte tous les
> administrateurs actifs de la base — **y compris les comptes réels du projet**. Tant qu'il en
> existe un, ce compte n'est jamais nul, et le refus est inatteignable depuis la suite. Le
> rendre atteignable exigerait de **désactiver les administrateurs réels** sur une base qui
> sert aussi de production ; une suite interrompue avant son `finally` laisserait le projet
> sans aucun administrateur actif. Le prix est sans commune mesure avec le bénéfice.
>
> Ce que cette lacune n'ouvre PAS : la **même condition, sur la même primitive**, est déjà
> éprouvée pour `public.definir_roles` et `public.definir_actif_compte`
> (`tests/rls/comptes.test.ts`, `tests/rls/archivage-comptes.test.ts`), là où elle est
> atteignable sans toucher aux autres comptes. On ne prétend pas que cela remplace la preuve
> manquante — on dit exactement ce qui est couvert et ce qui ne l'est pas.

**Portes** : Vitest à chaque commit ; `npm run test:rls` à la fin de chaque tâche SQL ;
**e2e et `build` une fois par lot**, conformément à la politique du projet.

---

## 7. Ce que la phase ne fait pas

- **Le leader ne devient pas modérateur** (§2). Les deux rôles restent cumulables.
- **Le leader ne voit pas plus de fiches** (§2). Le découplage autorité/visibilité qui en
  résulte est décrit en D153, pas dissimulé.
- **L'arbre n'est pas réécrit** : « faiseur de disciple de tout le monde » est une autorité,
  pas un rattachement (§2, lecture A).
- **Aucune demande n'est supprimée**, ni par cette phase ni par la suppression d'un compte.
- **La désactivation d'un compte reste** : supprimer n'est pas la seule voie, et c'est toujours
  la bonne pour un compte qui a servi.
