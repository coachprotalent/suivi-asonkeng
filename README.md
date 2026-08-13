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
existant. Les deux déclencheurs des correctifs post-1c (`membres_faiseur_de_disciple_archive`,
migration `20260814150000`, et `membres_archivage_desactive_compte`, migration `20260814160000`)
suivent la même convention, pour la même raison.

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
**Même limite, même mesure, appliquée par les correctifs post-1c au refus d'archiver la fiche du
dernier administrateur actif** (`membres_archivage_desactive_compte`, marqueur
`dernier_administrateur`) : un troisième test neutralisé, dans `tests/rls/archivage-comptes.test.ts`,
avec sa propre mesure `ADMINS_REELS_ACTIFS` recalculée à l'exécution — pas la même variable que
`comptes.test.ts`, un autre fichier, la même cause racine et la même impossibilité structurelle
tant que le compte racine reste actif.

**La phase 2b ajoute trois nouvelles cibles de mutation sur ce projet unique** (cf.
le design de la phase 2b, §12) : le `revoke execute` de
`consommer_token_inscription`, le seuil du plafond de tentatives (10 par 15
minutes), et l'exception insérée dans `annuler_demande_membre` pour éprouver son
atomicité. Chacune a été restaurée à l'identique après sa preuve, vérifiée par
`pg_get_functiondef` — voir les tâches correspondantes du plan de la phase 2b pour
le détail de chaque restauration.

**`admin.auth.admin.listUsers()` n'est pas paginé** partout où le projet l'emploie —
notamment `scripts/creer-compte-racine.ts`, pour vérifier qu'aucun compte
d'authentification orphelin ne porte déjà l'email cible avant d'en créer un
nouveau, et la quasi-totalité des suites RLS et e2e, pour retrouver un compte de
test par identifiant. L'API rend ses résultats par page (taille par défaut de la
librairie cliente) ; au-delà de la première page, un compte existant ne serait
simplement pas trouvé, silencieusement. Sans conséquence tant que le nombre de
comptes réels et de comptes de test simultanés reste sous ce seuil — à revoir si
la base de comptes grossit.

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
  porte les noms). **Correctif post-1c** : la même passerelle et un second déclencheur
  (`membres_faiseur_de_disciple_archive`, `before insert or update of faiseur_de_disciple_id`,
  migration `20260814150000`) refusent aussi de rattacher un membre à un faiseur de disciple
  **archivé** — le sélecteur de l'écran ne propose que des membres actifs, mais un appel RPC forgé
  ou une écriture directe recréerait sinon l'état que l'archivage interdit ci-dessous.
- **Archivage bloqué pour un faiseur de disciple actif, dans les deux sens** — un membre encore
  faiseur de disciple d'au moins une personne active ne peut pas être archivé ; l'écran nomme les
  personnes concernées. Barrière posée deux fois : un contrôle en amont dans l'action d'archivage,
  et un déclencheur `membres_archivage_faiseur_de_disciple` qui protège aussi une écriture
  directe. Réciproquement, un membre dont le faiseur de disciple est archivé ne peut pas être
  rétabli tant que celui-ci le reste — même schéma à deux barrières
  (`membres_desarchivage_faiseur_actif`), sans quoi archiver le disciple puis son faiseur de
  disciple, puis rétablir seulement le disciple, recréait l'état que l'archivage interdit.
  **D24 (correctif post-1c, migration `20260814160000`) : archiver une fiche désactive
  automatiquement le compte de connexion ACTIF qui lui est lié.** Sans cela, archiver quelqu'un ne
  lui retirait rien : son compte restait actif et il conservait sa portée d'autorité sur les
  membres dont il est ancêtre ou dirigeant désigné — l'archivage est le geste qui dit « cette
  personne a quitté l'équipe », il doit fermer l'accès. Posé dans un déclencheur
  (`membres_archivage_desactive_compte`), sous le **même** verrou consultatif (clé `(20260814, 2)`)
  que `definir_roles` / `definir_actif_compte`, pour que le contrôle « reste-t-il un autre
  administrateur actif ? » — un lire-puis-écrire — se sérialise réellement avec un changement de
  rôle concurrent. **La réciproque n'est PAS vraie : désarchiver une fiche ne réactive jamais son
  compte** — rendre un accès est une décision délibérée, prise sur `/comptes`, où la personne
  recevra de toute façon un mot de passe temporaire ; l'écran de la fiche le dit explicitement dans
  la confirmation de rétablissement. Si le compte lié est le **dernier administrateur actif**,
  l'archivage est refusé (marqueur `dernier_administrateur`, le même que la protection ci-dessous —
  c'est le même fait, découvert par une autre porte) : le désactiver laisserait l'application sans
  administrateur, sans moyen d'en recréer un. Un contrôle amont dans `archiverMembre` nomme la
  cause avant d'écrire ; le déclencheur reste la barrière — et la rattrape intégralement si ce
  contrôle amont régressait : `archiverMembre` fait correspondre le marqueur `dernier_administrateur`
  levé par le déclencheur au MÊME message que le contrôle amont, donc une défaillance de ce dernier
  ne rouvrirait aucune brèche, elle ferait seulement perdre le nom de la cause au profit du même
  refus (détail : `compteLieEstDernierAdministrateurActif`, `src/lib/donnees/comptes.ts`). Le
  bouton « Archiver » avertit avant
  qu'on clique, dès que la fiche porte un compte lié actif, plutôt que de surprendre après coup.
  `/comptes` affiche toujours l'état de la fiche liée à chaque compte (« Fiche archivée ») — utile
  pour le cas résiduel d'un compte réactivé séparément sans que sa fiche le soit.
- **Portée d'autorité** (`exigerAutoriteSur`, `src/lib/securite/garde.ts`) — la modification des
  statuts n'est plus réservée aux administrateurs. Un utilisateur possède l'autorité sur un membre
  dont il est un ancêtre dans l'arbre des faiseurs de disciple, ou dont il est le dirigeant
  désigné ; un administrateur possède l'autorité partout, sans remonter l'arbre.
- **Écran des comptes** (`/comptes`, réservé aux administrateurs) — créer un compte et le lier à
  une fiche membre (ou le laisser sans lien), délier une fiche, activer ou désactiver un compte,
  attribuer les rôles administrateur et modérateur, réinitialiser un mot de passe temporaire. La
  dernière rétrogradation ou désactivation d'un administrateur actif est refusée par
  `prive.compter_administrateurs_actifs`, réutilisée telle quelle par le déclencheur D24 ci-dessus
  pour refuser l'archivage équivalent — voir la limite de test documentée plus bas.
- **Annuaire paginé** (`/membres`) — cinquante fiches par page, pour tenir à l'échelle d'un
  millier de membres visée par la phase 1c (D18, voir la spécification maîtresse). Une adresse
  pointant au-delà de la dernière page réelle se corrige vers cette dernière page plutôt que
  d'afficher un écran qui se contredit lui-même.

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
    `en_attente` créée à l'inscription est **supprimée** par la fonction Postgres
    `valider_demande_rattachement`, l'un des deux seuls `delete` visant `membres`
    posés par les fonctions Postgres de cette phase (l'autre est l'annulation
    ci-dessus, `annuler_demande_membre`). Deux autres `.delete()` existent côté
    application (`src/app/inscription/actions.ts`, `src/app/demandes/nouvelle/
    actions.ts`), mais uniquement pour annuler, dans la même requête, une fiche
    `en_attente` qui vient d'être créée quand une écriture suivante échoue avant
    toute confirmation à l'utilisateur — une compensation d'échec technique, pas
    un geste métier. Le rattachement refuse aussi de cibler la fiche jetable de la
    demande elle-même (marqueur `rattachement_vers_fiche_jetable`) : un cas exclu
    de l'interface par construction (le sélecteur de fiche existante n'y propose
    jamais la fiche jetable de la demande en cours), donc éprouvé uniquement par
    rejeu d'une requête altérée (`tests/e2e/demandes.spec.ts`), jamais par une
    simple interaction UI.
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
  automatiquement, jamais supprimée. `notifierAdministrateurs` écrit à **tous les
  administrateurs actifs de la base**, y compris les comptes réels de ce projet
  (`racine`, `aubinaso`) : ces lignes ne portent aucun préfixe de test et ne
  disparaissent que par la cascade de `demande_id` quand la demande qui les a
  déclenchées est traitée. Quatre résidus (notifications orphelines sur des comptes
  réels) ont été trouvés sur ces comptes pendant l'exécution de cette phase et
  nettoyés — voir « Attention » plus bas.

### Ce que la phase 2b ne livre pas, et pourquoi

- **Envoi d'emails ou de SMS** — hors périmètre du projet entier ; les notifications
  restent strictement in-app.
- **Fusion générale de fiches** — seul le cas étroit de l'auto-inscription en double
  est traité, par suppression d'une fiche jetable sans historique.
- **Gel d'un token après échecs répétés** — délibérément exclu, pour ne pas offrir à
  un tiers le moyen d'empêcher quelqu'un de s'inscrire en épuisant ses tentatives.
- **Purge automatique de `tentatives_token_inscription`** — le projet n'a pas
  d'infrastructure de tâche planifiée ; la table grandit sans borne, acceptable au
  volume attendu. C'est la page publique `/inscription` elle-même qui alimente cette
  table à chaque tentative, réussie ou non — donc n'importe quel visiteur, sans
  authentification.
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

Le plafond anti-force-brute de la consommation de token (10 tentatives par adresse
et par fenêtre glissante de 15 minutes) repose, en production, sur un postulat non
vérifiable par nos tests : que l'hébergeur (Vercel) ÉCRASE l'en-tête
`x-forwarded-for` avec l'adresse réelle du visiteur plutôt que de relayer une valeur
que le visiteur y aurait lui-même écrite. Ce postulat est documenté à l'endroit où
l'adresse est lue (`adresseAppelant`, `src/app/inscription/actions.ts`). Nos tests
l'établissent seulement en local, où `next dev` n'a aucun proxy devant lui et où la
suite e2e injecte elle-même cet en-tête : ils prouvent que l'en-tête est lu et
transmis, pas ce que fait l'hébergeur en production. Si ce postulat est faux, le
hachage du code et l'entropie des tokens restent intacts, mais le plafond ne freine
plus rien.

### Exception ajoutée par la phase 2b : lecture publique des antennes

`src/lib/donnees/antennes.ts#listerAntennesPubliques` emploie la clé de service
(`clientAdmin()`) pour une simple lecture, plutôt que le client sous RLS
(`clientServeur()`) employé par la plupart des fonctions de `src/lib/donnees/`. Elle
n'est pas la seule à le faire pour une lecture : `src/lib/donnees/arbre.ts` en
emploie aussi trois (design 1c, D19 : l'autorité suit l'arbre, pas la visibilité
RLS). Elle est en revanche la SEULE à le faire pour un appel **sans aucune
session** : les trois lectures d'`arbre.ts` s'exécutent toujours derrière un écran
déjà authentifié, alors que le formulaire public `/inscription` n'a par construction
aucune session pour satisfaire la politique RLS d'`antennes` (ouverte à
`authenticated` seul). La liste rendue est fixe, déjà publique pour tout compte
actif, et strictement indépendante du code d'inscription saisi : elle ne peut donc
pas servir d'oracle sur la validité d'un token.

### Règle de sécurité

Toute page et toute Server Action de l'application passent par `exigerProfilActif`,
`exigerAdministrateur` ou `exigerAutoriteSur` (`src/lib/securite/garde.ts`) — c'est l'unique
famille de points d'entrée qui vérifie la session et, le cas échéant, le rôle ou la position dans
l'arbre ; aucun appel direct à `profilCourant` n'existe ailleurs dans le code de l'application.
**Exception unique, ajoutée par la phase 2b** : `sInscrire` (`src/app/inscription/actions.ts`)
n'appelle aucune de ces trois fonctions — `/inscription` s'affiche sans session, par construction,
il n'existe littéralement aucun profil à exiger à ce stade. Voir « Exception ajoutée par la phase
2b : `/inscription` sans garde » plus bas pour ce sur quoi repose sa fermeture, et le commentaire
posé juste avant `exigerProfilActif` dans `garde.ts` pour que cette exception ne soit jamais lue
comme une régression future.
Depuis la phase 1c, la modification des statuts d'un membre n'est **plus réservée aux
administrateurs** : elle passe par `exigerAutoriteSur`, ouverte à tout compte ayant autorité sur
le membre visé (ancêtre dans l'arbre, ou dirigeant désigné), en plus des administrateurs. Aucune
écriture n'est possible depuis le navigateur : les créations, modifications, archivages,
bascules d'antenne, attributions et retraits de statuts, mouvements d'arbre et gestion des
comptes passent exclusivement par des Server Actions exécutées côté serveur, jamais par un appel
direct du client à Supabase. Côté base, les politiques RLS n'autorisent que des `SELECT` sur
toutes les tables : toute écriture transite par le serveur, qui agit avec la clé de service,
jamais exposée au navigateur.
