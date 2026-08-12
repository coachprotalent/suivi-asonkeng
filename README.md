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

## Déploiement

L'application est déployée sur Vercel (projet `asonkeng/suivi-asonkeng`). Trois variables
d'environnement doivent être renseignées sur Vercel, pour les environnements `production` et
`preview` :

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — **jamais** avec le préfixe `NEXT_PUBLIC_`, sous peine de
  l'exposer au navigateur de n'importe quel visiteur.

Les autres variables de `.env.local` (jeton d'accès Supabase, identifiants du compte racine) ne
servent qu'aux scripts locaux et ne doivent pas être transférées sur Vercel.

> **Pousser sur `main` déploie en production.** La liaison GitHub–Vercel est active :
> tout `git push` sur `main` met l'application en ligne, sur le projet Supabase qui
> sert aussi de base de production. Il n'existe aucune intégration continue pour
> arrêter un code fautif : lancez les six suites localement avant de pousser.

## Attention

Un **seul** projet Supabase sert au développement et à la production. Les migrations sont
strictement additives. **Ne jamais exécuter `supabase db reset`.**

L'amorçage des antennes dans `20260812110000_antennes.sql` n'est **pas idempotent** : il insère
Batouri, Cameroun et France sans vérifier leur présence. Une restauration depuis zéro échouera sur
la contrainte d'unicité (`antennes_nom_key`) si ces antennes existent déjà. Il en va de même pour
l'amorçage du catalogue des statuts dans `20260813100000_statuts.sql` : il insère 2 groupes et 5
statuts sans condition, et échouera pour la même raison (`groupes_statut_nom_key`,
`statuts_libelle_unique_par_groupe`) si une restauration les retrouve déjà présents. Les
migrations de la phase 1c (`20260814100000` à `20260814140000`) ne créent aucun amorçage de
données : rien à ajouter sur ce point pour elles.

**Les déclencheurs posés par la phase 1c ne sont pas non plus idempotents.** Chacun est créé par
un simple `create trigger`, sans `drop trigger if exists` en amont (contrairement à
`durcir_statuts`, qui emploie la forme gardée). Une restauration qui retrouverait ces
déclencheurs déjà en place — parce qu'une migration antérieure a laissé la table dans cet état —
échouerait de la même façon que les deux amorçages ci-dessus, sur une erreur d'objet déjà
existant.

**Les suites de tests écrivent dans la base de production.** Conséquence directe de la décision
« un seul projet Supabase » ci-dessus. Les preuves par mutation (fonctions et déclencheurs)
retirent temporairement des barrières en base réelle pour vérifier qu'un test les détecterait,
avant de les restaurer à l'identique. La suite e2e de pagination de l'annuaire insère
cinquante et un membres temporaires pour dépasser une page. Le nettoyage des comptes de test
(`supprimerCompte`, dans les suites RLS et e2e) a échoué à plusieurs reprises sous parallélisme —
`admin.auth.admin.deleteUser` peut échouer silencieusement sous contention, laissant un compte
`test.*` orphelin qu'un comptage ultérieur retrouve. Sans conséquence tant que l'application ne
porte pas de vraies données ; à revoir dès qu'elle en portera.

**La protection du dernier administrateur (spec §7) n'est éprouvée par aucun test.** La fonction
`prive.compter_administrateurs_actifs` compte **tous** les administrateurs actifs de la base, pas
seulement ceux créés par un test ; le compte racine réel de ce projet en est un et il est
intouchable par construction (`tests/rls/comptes.test.ts`). Le compteur hors-cible ne peut donc
jamais atteindre zéro, et le refus « dernier administrateur » ne peut pas se déclencher via l'API
publique dans cet environnement. **Cela a été prouvé, pas seulement supposé** : le bloc de refus
retiré directement de la fonction en base, la suite RLS rejouée à l'identique (mêmes 63 tests
verts, mêmes 2 neutralisés) — preuve que rien, aujourd'hui, ne détecterait la disparition de cette
protection. Les deux tests concernés sont désactivés par une condition **calculée à l'exécution**
(`ADMINS_REELS_ACTIFS`, mesurée en tête de fichier), pas par un booléen figé : ils se réactiveront
d'eux-mêmes sur une base sans administrateur réel actif. **Cette condition repose sur une
heuristique de préfixe (`identifiant.startsWith('test.')`), pas sur une garantie structurelle** :
c'est une convention de nommage suivie par ce dépôt, que rien en base n'impose ni ne vérifie — un
compte de test dont l'identifiant ne commencerait pas par `test.` serait compté comme un
administrateur réel, et pourrait à lui seul empêcher indéfiniment la réactivation. Limite
documentée et acceptée par décision explicite de l'utilisateur (détail : `task-12-report.md`).

## Phase 1a : le registre des membres

La phase 1a livre le registre des membres, socle des phases suivantes :

- **Annuaire** (`/membres`) — liste des membres actifs, avec recherche libre et filtre par
  antenne.
- **Fiches** (`/membres/[id]`) — consultation du détail d'un membre ; création
  (`/membres/nouveau`) et modification (`/membres/[id]/modifier`) réservées aux administrateurs.
- **Archivage** — une fiche archivée quitte l'annuaire mais reste consultable par lien direct ;
  l'action est confirmée avant exécution et n'efface aucune donnée.
- **Antennes** (`/antennes`, réservé aux administrateurs) — création d'antennes, désactivation et
  réactivation ; une antenne désactivée reste visible et son rattachement aux fiches existantes
  n'est jamais perdu.

## Phase 1b : les statuts d'un membre

La phase 1b ajoute des statuts attribuables à un membre (`/membres/[id]/statuts`) et leur
catalogue administrable (`/statuts`, lien depuis le tableau de bord) :

- **Cumulables, avec exclusivité par groupe** — un membre peut porter plusieurs statuts à la
  fois, mais un groupe marqué exclusif (par exemple « Cheminement ») n'en tolère qu'un seul :
  en attribuer un second du même groupe évince automatiquement le premier. L'invariant est posé
  deux fois — une fonction Postgres qui évince avant d'insérer sur le chemin normal, et un
  déclencheur `before insert or update` qui refuse toute violation directe de la table.
- **Date d'acquisition et note facultatives** — la date, si renseignée, doit exister au calendrier
  et ne peut pas être dans le futur ; une valeur absente lors d'une réattribution ne remplace
  jamais une date déjà connue.
- **Journal de tous les mouvements** — chaque ajout et chaque retrait est inscrit dans
  `journal_statuts`, avec le nom d'affichage de son auteur capturé au moment de l'écriture (donc
  lisible même si le compte de l'auteur est ensuite supprimé). La table est protégée à la fois par
  un déclencheur qui refuse toute mise à jour et par un retrait du droit de suppression à
  `service_role` (`20260813170000_journal_sans_suppression.sql`) : le journal ne se réécrit pas et
  ne se supprime pas ligne à ligne — même par l'application elle-même — seule la suppression en
  cascade avec le membre reste possible.
- **Motif facultatif au retrait** — un compte ayant autorité sur le membre peut retirer un statut
  sans en préciser la raison ; s'il en donne une, elle est journalisée avec le mouvement. Depuis
  la phase 1c, l'attribution et le retrait ne sont plus réservés aux administrateurs : voir la
  « Portée d'autorité » plus bas.
- **Catalogue administrable** — un administrateur crée des groupes et des statuts, désactive un
  statut existant (il disparaît du formulaire d'attribution sans effacer les attributions déjà
  posées) et le réactive depuis le même écran.

## Phase 1c : l'arborescence, les comptes et le passage à l'échelle

La phase 1c relie les membres entre eux et ouvre la modification des statuts au-delà des
administrateurs :

- **Arborescence** (`/membres/[id]/arbre`, réservé aux administrateurs) — rattache un membre à
  son faiseur de disciple et à son dirigeant, avec un sélecteur à recherche serveur. Le dirigeant
  s'affiche dans l'un de trois états : **calculé** depuis le faiseur de disciple (proposition
  automatique), **défini manuellement** (l'administrateur a forcé une autre valeur), ou
  **proposition périmée** — quand l'arbre bouge au-dessus du membre après coup, sans qu'aucune
  écriture ne touche sa propre fiche. Un bouton ramène au dirigeant calculé dans ce dernier cas.
- **Garde-fou anti-cycle, à deux barrières** — une passerelle applicative (`definir_arbre`)
  sérialisée par un verrou consultatif (`pg_advisory_xact_lock`), pour qu'un rattachement
  concurrent ne puisse pas se glisser entre la vérification et l'écriture ; et un déclencheur
  `before insert or update` (`membres_anti_cycle`) qui refuse toute écriture directe fermant un
  cycle, y compris hors de la passerelle. Le chemin fautif remonté par `public.chemin_arbre` est
  affiché à l'administrateur (`prive.est_ancetre` ne rend qu'un booléen ; c'est `chemin_arbre` qui
  porte les noms).
- **Archivage bloqué pour un faiseur de disciple actif, dans les deux sens** — un membre encore
  faiseur de disciple d'au moins une personne active ne peut pas être archivé ; l'écran nomme les
  personnes concernées. Barrière posée deux fois : un contrôle en amont dans l'action d'archivage,
  et un déclencheur `membres_archivage_faiseur_de_disciple` qui protège aussi une écriture
  directe. Réciproquement, un membre dont le faiseur de disciple est archivé ne peut pas être
  rétabli tant que celui-ci le reste — même schéma à deux barrières
  (`membres_desarchivage_faiseur_actif`), sans quoi archiver le disciple puis son faiseur de
  disciple, puis rétablir seulement le disciple, recréait l'état que l'archivage interdit.
  **Ce que l'archivage d'une fiche ne fait PAS** : il ne révoque aucune autorité. Un compte lié à
  une fiche archivée en tant que dirigeant ou faiseur de disciple garde tout pouvoir sur les
  statuts de ses subordonnés tant que le compte lui-même reste actif — décision produit distincte,
  volontairement non tranchée par cette phase. `/comptes` affiche désormais l'état de la fiche
  liée à chaque compte (« Fiche archivée ») pour qu'un administrateur puisse repérer ce cas ;
  désactiver le compte reste un geste séparé, à faire soi-même sur cet écran.
- **Portée d'autorité** (`exigerAutoriteSur`, `src/lib/securite/garde.ts`) — la modification des
  statuts n'est plus réservée aux administrateurs. Un utilisateur possède l'autorité sur un membre
  dont il est un ancêtre dans l'arbre des faiseurs de disciple, ou dont il est le dirigeant
  désigné ; un administrateur possède l'autorité partout, sans remonter l'arbre.
- **Écran des comptes** (`/comptes`, réservé aux administrateurs) — créer un compte et le lier à
  une fiche membre (ou le laisser sans lien), délier une fiche, activer ou désactiver un compte,
  attribuer les rôles administrateur et modérateur, réinitialiser un mot de passe temporaire. La
  dernière rétrogradation ou désactivation d'un administrateur actif est refusée par
  `prive.compter_administrateurs_actifs` — voir la limite de test documentée plus bas.
- **Annuaire paginé** (`/membres`) — cinquante fiches par page, pour tenir à l'échelle d'un
  millier de membres visée par la phase 1c (D18, voir la spécification maîtresse). Une adresse
  pointant au-delà de la dernière page réelle se corrige vers cette dernière page plutôt que
  d'afficher un écran qui se contredit lui-même.

### Règle de sécurité

Toute page et toute Server Action de l'application passent par `exigerProfilActif`,
`exigerAdministrateur` ou `exigerAutoriteSur` (`src/lib/securite/garde.ts`) — c'est l'unique
famille de points d'entrée qui vérifie la session et, le cas échéant, le rôle ou la position dans
l'arbre ; aucun appel direct à `profilCourant` n'existe ailleurs dans le code de l'application.
Depuis la phase 1c, la modification des statuts d'un membre n'est **plus réservée aux
administrateurs** : elle passe par `exigerAutoriteSur`, ouverte à tout compte ayant autorité sur
le membre visé (ancêtre dans l'arbre, ou dirigeant désigné), en plus des administrateurs. Aucune
écriture n'est possible depuis le navigateur : les créations, modifications, archivages,
bascules d'antenne, attributions et retraits de statuts, mouvements d'arbre et gestion des
comptes passent exclusivement par des Server Actions exécutées côté serveur, jamais par un appel
direct du client à Supabase. Côté base, les politiques RLS n'autorisent que des `SELECT` sur
toutes les tables : toute écriture transite par le serveur, qui agit avec la clé de service,
jamais exposée au navigateur.
