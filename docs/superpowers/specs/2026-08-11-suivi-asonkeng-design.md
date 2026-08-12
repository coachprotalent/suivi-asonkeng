# Application de suivi — équipe Asonkeng

**Date :** 2026-08-11
**Statut :** design validé, prêt pour le plan d'implémentation

---

## 1. Objet

Une application web permettant à l'équipe Asonkeng de suivre les jeunes croyants : leur
cheminement spirituel, leur rattachement à un faiseur de disciple, leur participation aux
Assemblées En Ligne (AEL) et aux événements.

Un **membre de l'équipe** est une personne qui a cru, s'est repentie, fait l'objet d'un suivi
spirituel et s'intègre progressivement à la vie de l'équipe.

**Glossaire.** *AEL* = Assemblée En Ligne, session d'enseignement récurrente.
*CPEAP* = Centre de Préparation à l'Excellence Académique et Professionnelle.
*FDD* = faiseur de disciple, la personne en charge d'un disciple.
*Dirigeant* = un faiseur de disciple qui gère en plus l'ensemble des individus de son
arborescence.

**Déploiement :** Supabase (base, auth) + Vercel (application).

---

## 2. Décisions structurantes

Ces décisions ont été arbitrées pendant la conception et ne doivent pas être rouvertes
pendant l'implémentation sans validation.

| # | Décision | Justification |
|---|---|---|
| D1 | Membre et compte sont deux notions distinctes, liées par un lien optionnel | Un non-croyant suivi n'a pas de compte ; l'admin peut lier un compte à une fiche à tout moment |
| D2 | Tout utilisateur connecté lit l'annuaire complet des membres actifs | Choix explicite : l'annuaire est un outil d'équipe, pas un silo |
| D3 | Les antennes sont une entité de premier ordre, un membre y est rattaché | Permet le pré-remplissage des listes de présence ; un membre hors antenne reste ajoutable à la main |
| D4 | Le compteur AEL est calculé : report initial + présences enregistrées | Impossible à désynchroniser, et l'historique antérieur à l'app est préservé |
| D5 | `faiseur_de_disciple_id` et `dirigeant_id` sont tous deux librement modifiables par l'admin | Souplesse demandée ; la règle de calcul ne fournit qu'une valeur proposée |
| D6 | Les statuts sont groupés, avec exclusivité optionnelle par groupe | Résout « non-croyant » vs « repenti » sans interdire le cumul ailleurs |
| D7 | Chaque statut attribué porte une date d'acquisition, et un journal trace les changements | Le suivi spirituel a besoin de dates ; le journal est le seul garde-fou aux modifications directes |
| D8 | Les tokens d'inscription existent en deux modes : nominatif et générique | Les deux usages sont réels |
| D9 | Les rôles sont cumulables, les capacités additives | Un admin reste un faiseur de disciple ordinaire pour son arborescence |
| D10 | Connexion par identifiant, sans email, via email synthétique interne | Beaucoup de membres n'ont pas d'email fiable |
| D11 | Un compte racine amorce le système, sans fiche membre ni place dans l'arbre | Nécessaire pour créer les premiers membres et leur attribuer leurs droits |
| D12 | RLS en lecture, Server Actions en écriture, refus d'écriture par défaut en RLS | Les lectures sont simples, les écritures fines ; ce partage maximise sécurité et lisibilité |
| D13 | Les événements acceptent des participants externes, convertibles en membres | Les séminaires sont un canal d'entrée dans l'équipe |
| D14 | Les AEL sont récurrents, pré-générés depuis un calendrier par antenne | Mardi, mercredi, samedi par défaut ; le samedi se déplace au dimanche en changeant la date |
| D15 | L'arborescence est une liste d'adjacence parcourue par CTE récursive | Une table de fermeture ne se justifie pas à l'échelle d'une équipe |
| D16 | La participation à un événement est visible de tous, les trois désirs des seuls administrateurs **et modérateurs** (amendée par D23) | La fiche membre doit afficher ses séminaires assistés (D2), mais un désir exprimé est une confidence : le cercle reste étroit, il n'est simplement plus limité aux administrateurs |
| D22 | Le modérateur gère aussi le calendrier AEL récurrent | Amendement du 2026-08-12 : il tient déjà les séances que ce calendrier engendre. Voir la note sous la matrice du §5.2. **À appliquer au plan de la phase 3.** |
| D23 | Le modérateur crée un événement, saisit **et voit** les trois désirs | Amendement du 2026-08-12. La saisie était seule demandée ; la consultation suit nécessairement — on ne saisit pas dans un champ qu'on ne peut pas relire, ni corriger une valeur qu'on ne voit pas. D16 et la RLS du §5.3 sont amendées en conséquence. **À appliquer au plan de la phase 4.** |
| D24 | **Archiver une fiche désactive le compte qui lui est lié** | Amendement du 2026-08-12. Sans cela, archiver quelqu'un ne lui retirait rien : son compte restait actif et il conservait sa portée d'autorité sur les membres dont il est ancêtre ou dirigeant. L'archivage est le geste qui dit « cette personne a quitté l'équipe » ; il doit fermer l'accès. La réciproque n'est **pas** vraie — désarchiver ne réactive pas le compte, car rendre un accès est une décision délibérée qui se prend sur l'écran des comptes |
| D25 | L'inscription par token est protégée par un **code long haché** et un **plafond de tentatives** par adresse et par fenêtre de temps | Décision du 2026-08-12. `/inscription` est le premier chemin d'écriture **public** de l'application. Le §7 exige déjà un message indifférencié qui ne révèle jamais qu'un code existe — mais un message prudent sans plafond ne protège de rien, il rend seulement l'attaque silencieuse. **Pas** de gel du token visé après N échecs : un tiers pourrait alors empêcher quelqu'un de s'inscrire en brûlant ses tentatives |
| D26 | Pas de fusion générale de fiches. À la validation, le compte est **rattaché à la fiche existante** et la fiche `en_attente` est supprimée | Décision du 2026-08-12. La fiche en attente vient d'être créée et ne porte ni statuts, ni historique, ni place dans l'arbre : la rattacher puis la jeter ne peut rien perdre. Une vraie fusion de deux fiches anciennes est précisément là où l'on perd des données sans s'en apercevoir — à n'écrire que si le doublon devient un problème réel |
| D27 | L'atomicité promise au §6 entre consommation du token et création du compte **n'existe pas** ; elle est remplacée par une consommation atomique **du token seul** | Correction du 2026-08-12. La création du compte est un appel HTTP au service d'authentification, le marquage du token une écriture SQL : aucune transaction ne couvre les deux. Voir l'encadré du §6 |

> **D17 à D21** sont posées dans `2026-08-12-phase-1c-design.md` et ne sont pas recopiées
> ici. D18 y **amende D15** ci-dessus : l'équipe vise un millier de membres ou plus, et non
> l'ordre de grandeur d'une équipe restreinte. La liste d'adjacence reste le bon choix — la
> profondeur du parcours reste faible — mais les sélecteurs et l'annuaire en tiennent compte.

**Hors périmètre, volontairement** : envoi d'emails, SMS, temps réel, exports, tableau de bord
statistique, photos de profil. Aucun de ces éléments n'est nécessaire aux usages décrits, et
chacun pourra s'ajouter sans remise en cause du modèle.

---

## 3. Architecture

Next.js (App Router, TypeScript) sur Vercel, Supabase pour la base et l'authentification.
Tailwind CSS et shadcn/ui pour l'interface. Rendu serveur par défaut : les listes et les fiches
sont des Server Components qui lisent Postgres avec le JWT de l'utilisateur, donc sous RLS.
Toute mutation passe par une Server Action.

Interface en français, responsive, pensée mobile d'abord — une liste de présence se remplit
souvent depuis un téléphone.

### 3.1 Découpage en couches

| Couche | Responsabilité | Interdit |
|---|---|---|
| `db/` — migrations SQL | Schéma, contraintes, déclencheurs, politiques RLS, vues de calcul | Toute règle d'interface |
| `lib/domaine/` — TypeScript pur | Calcul du dirigeant, parcours d'arbre, portée d'autorité, exclusivité des statuts, compteur AEL, génération du calendrier | Tout accès réseau ou base — fonctions pures |
| `lib/donnees/` | Requêtes et mutations typées vers Supabase | Toute règle métier |
| `app/` — écrans et Server Actions | Autorisation, orchestration, formulaires, rendu | Toute règle métier en dur — elle est appelée depuis `lib/domaine/` |

La logique délicate de ce projet est de la logique d'arbre et de règles. L'isoler dans des
fonctions pures la rend testable sans base, donc testée en profondeur à coût faible.

### 3.2 Authentification

L'utilisateur saisit un identifiant (`jdupont`) ; l'application le convertit en
`jdupont@asonkeng.local` avant de le transmettre à Supabase Auth. Sessions par cookies via
`@supabase/ssr`. L'identifiant est normalisé en minuscules, sans accents ni espaces, et son
unicité est garantie en base.

Un email réel reste saisissable comme simple champ de contact sur la fiche membre. Il ne sert
jamais à l'authentification.

**Compte racine.** Créé par une migration d'amorçage : rôle administrateur, `est_racine = true`,
`membre_id = NULL`. Il n'apparaît dans aucun annuaire, aucune liste de sélection de faiseur de
disciple et aucune liste de présence — non par filtrage, mais parce qu'il n'a pas de fiche
membre et que toutes ces vues partent des membres. Son mot de passe initial est fourni par
variable d'environnement au moment de la migration et doit être changé à la première connexion.

---

## 4. Modèle de données

Nommage en français, `snake_case`, clés primaires `uuid`, horodatages `timestamptz`.

### 4.1 Comptes et rôles

**`profils`** — un enregistrement par compte, en relation 1-1 avec `auth.users`.

| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid PK | Égal à `auth.users.id` |
| `identifiant` | text UNIQUE NOT NULL | Normalisé en minuscules |
| `nom_affichage` | text NOT NULL | |
| `membre_id` | uuid NULL → `membres` UNIQUE | Lien optionnel, posable et retirable par l'admin |
| `est_racine` | boolean NOT NULL DEFAULT false | |
| `actif` | boolean NOT NULL DEFAULT true | |
| `cree_le` | timestamptz NOT NULL | |

Le drapeau **« doit changer son mot de passe »** ne vit pas dans cette table mais dans
`auth.users.app_metadata.doit_changer_mdp`. Raison : le middleware doit le vérifier à chaque
navigation ; dans `app_metadata`, il voyage dans le JWT déjà présent dans le cookie de session
et se lit sans aucune requête, alors qu'une colonne imposerait un aller-retour réseau par page.
Il est positionné par l'API admin lors d'une réinitialisation et effacé lorsque l'utilisateur a
choisi son nouveau mot de passe.

**`roles_profil`** — rôles cumulables.

| Colonne | Type | Notes |
|---|---|---|
| `profil_id` | uuid → `profils` | PK composite avec `role` |
| `role` | enum `administrateur` \| `moderateur` | Les droits « Utilisateur » sont le socle implicite de tout compte actif et ne sont pas stockés |

### 4.2 Antennes et membres

**`antennes`** — `id`, `nom` (unique), `pays`, `actif`. Amorcée avec Cameroun, Batouri, France.

**`membres`**

| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `nom`, `prenom` | text NOT NULL | |
| `telephone`, `email_contact` | text NULL | Contact uniquement, jamais utilisé pour l'auth |
| `ville`, `pays` | text NULL | |
| `antenne_id` | uuid NULL → `antennes` | |
| `situation` | enum `etudiant` \| `travailleur` \| `autre` NULL | Distinct des statuts spirituels |
| `domaine_etude` | text NULL | Renseigné quand pertinent |
| `faiseur_de_disciple_id` | uuid NULL → `membres` | NULL pour les racines de l'arbre |
| `dirigeant_id` | uuid NULL → `membres` | |
| `dirigeant_force` | boolean NOT NULL DEFAULT false | Informatif : indique si la valeur a été saisie ou calculée |
| `report_initial_ael` | integer NOT NULL DEFAULT 0 CHECK >= 0 | AEL suivis avant la mise en service |
| `etat` | enum `en_attente` \| `actif` \| `archive` NOT NULL | |
| `cree_le`, `cree_par` | | |

Index sur `faiseur_de_disciple_id`, `dirigeant_id`, `antenne_id`, `etat`.

**Règle du dirigeant.** Valeur *proposée* par l'application, jamais imposée :

```
dirigeant_propose(M) =
    si M.faiseur_de_disciple est NULL          → NULL
    sinon si M.faiseur_de_disciple.faiseur_de_disciple est NULL → M.faiseur_de_disciple
    sinon                                       → M.faiseur_de_disciple.faiseur_de_disciple
```

Elle est proposée à la création d'un membre et à chaque changement de faiseur de disciple.
L'admin accepte ou remplace. Accepter la proposition met `dirigeant_force = false` ; saisir une
autre valeur le met à `true`. L'interface affiche « calculé » ou « défini manuellement » et
propose un retour au calcul en un clic. Ce drapeau n'interdit rien.

**Garde-fou anti-cycle.** Un déclencheur `BEFORE INSERT OR UPDATE` sur `membres` refuse toute
valeur de `faiseur_de_disciple_id` qui ferait d'un membre son propre ancêtre. La même
vérification est faite en amont dans `lib/domaine/` pour produire un message d'erreur lisible
affichant le chemin fautif.

### 4.3 Statuts

**`groupes_statut`** — `id`, `nom`, `exclusif` (boolean), `ordre`.
Amorcé avec « Cheminement » (`exclusif = true`) et « Engagements » (`exclusif = false`).

**`statuts`** — `id`, `groupe_id`, `libelle`, `actif`, `ordre`. Unicité sur (`groupe_id`,
`libelle`). Amorcé avec : non-croyant, repenti (groupe Cheminement) ; baptisé d'eau, baptisé du
Saint-Esprit, sert dans une commission (groupe Engagements).

**`membre_statuts`** — `membre_id`, `statut_id` (PK composite), `date_acquisition` (date NULL),
`note` (text NULL), `attribue_par`, `attribue_le`.

L'exclusivité est garantie par un **déclencheur** `BEFORE INSERT OR UPDATE` sur
`membre_statuts` : il remonte au groupe du statut inséré et refuse l'opération si le membre
porte déjà un autre statut d'un groupe marqué `exclusif`. Un déclencheur plutôt qu'une
contrainte d'unicité, parce que la condition d'exclusivité vit sur `groupes_statut` et n'est
pas connue de la ligne insérée — l'imposer par index exigerait de dénormaliser `groupe_id` et
`exclusif` sur chaque attribution.

Côté application, attribuer un statut exclusif retire automatiquement l'autre statut du même
groupe dans la même transaction, avant l'insertion, et les deux mouvements sont journalisés.
L'utilisateur en est informé dans l'interface.

**`journal_statuts`** — `id`, `membre_id`, `statut_id`, `action` (`ajout` \| `retrait`),
`par_profil_id`, `le`, `motif` (text NULL). En insertion seule.

### 4.4 Événements

**`types_evenement`** — `id`, `libelle`, `actif`. Amorcé avec webinaire, séminaire académique,
pic-nic, retraite spirituelle. Extensible par l'admin.

**`evenements`** — `id`, `titre`, `type_id`, `date_debut`, `date_fin` (NULL), `lieu` (NULL),
`description` (NULL), `cree_par`, `cree_le`.

**`participants_externes`** — `id`, `nom`, `prenom`, `telephone`, `email`, `ville`, `pays`,
`converti_en_membre_id` (uuid NULL → `membres`), `cree_le`.

**`participations`**

| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `evenement_id` | uuid → `evenements` | |
| `membre_id` | uuid NULL → `membres` | |
| `participant_externe_id` | uuid NULL → `participants_externes` | |
| `desir_mentorat_academique` | boolean NOT NULL DEFAULT false | |
| `desir_suivi_spirituel` | boolean NOT NULL DEFAULT false | |
| `desir_cpeap` | boolean NOT NULL DEFAULT false | |
| `note` | text NULL | |

Contrainte : exactement une des deux références (`membre_id`, `participant_externe_id`) est
non nulle. Unicité sur (`evenement_id`, `membre_id`) et sur (`evenement_id`,
`participant_externe_id`).

Les participations d'externes portant `desir_suivi_spirituel = true` et dont le participant
n'est pas encore converti alimentent la liste « à traiter » de l'admin.

**Vue `seminaires_assistes`** — `(membre_id, evenement_id, titre, type, date_debut)`. Elle
expose uniquement le fait qu'un membre a participé à un événement, sans les trois désirs. C'est
elle qui alimente les « tags des séminaires assistés » sur la fiche membre, lisible par tout
compte actif, tandis que la table `participations` elle-même reste réservée à l'administrateur.
Les trois désirs sont des informations sensibles : ils ne quittent jamais le périmètre admin.

### 4.5 AEL

**`calendriers_ael`** — `id`, `antenne_id`, `jour_semaine` (1 = lundi … 7 = dimanche), `heure`
(time NULL), `actif`. Amorcé pour chaque antenne avec mardi, mercredi et samedi.

**`seances_ael`**

| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `date` | date NOT NULL | Modifiable — c'est ainsi qu'une séance du samedi se déplace au dimanche |
| `heure` | time NULL | |
| `theme` | text NULL | Renseigné au moment de tenir la séance |
| `enseignant_membre_id` | uuid NULL → `membres` | |
| `enseignant_libre` | text NULL | Pour un intervenant extérieur |
| `moderateur_membre_id` | uuid NULL → `membres` | |
| `moderateur_libre` | text NULL | |
| `etat` | enum `prevue` \| `tenue` \| `annulee` NOT NULL DEFAULT `prevue` | |
| `calendrier_id` | uuid NULL → `calendriers_ael` | NULL si créée à la main |
| `cree_par`, `cree_le` | | |

Pour l'enseignant comme pour le modérateur, au plus un des deux champs est renseigné.
Passer une séance à `tenue` exige un thème et un enseignant.

**`seances_ael_antennes`** — `seance_id`, `antenne_id` (PK composite). Une séance peut cibler
plusieurs antennes.

**`presences_ael`** — `seance_id`, `membre_id` (PK composite), `present` (boolean NOT NULL),
`pointe_par`, `pointe_le`.

**Vue `compteurs_ael`** — pour chaque membre :
`report_initial_ael + COUNT(présences où present = true et séance à l'état tenue)`.

### 4.6 Circuits

**`tokens_inscription`** — `id`, `code_hash` (text NOT NULL — le code n'est **jamais** stocké en
clair), `mode` (`nominatif` \| `generique`), `membre_id` (uuid NULL, obligatoire si nominatif),
`cree_par`, `cree_le`, `expire_le` (timestamptz NOT NULL), `utilise_le` (NULL),
`utilise_par_profil_id` (NULL).

**`demandes_membre`** — `id`, `demandeur_profil_id`, `membre_id` (fiche créée à l'état
`en_attente`), `etat` (`en_attente` \| `validee` \| `rejetee`), `motif_rejet` (NULL),
`traite_par` (NULL), `traite_le` (NULL), `cree_le`.

**`notifications`** — `id`, `profil_id`, `type`, `titre`, `corps`, `lien` (NULL), `lu_le` (NULL),
`cree_le`. File in-app, consultée via une cloche et une page « à traiter ».

---

## 5. Rôles et autorisations

### 5.1 Portée d'autorité

> Un utilisateur a autorité sur un membre M si son membre lié est un **ancêtre de M dans
> l'arbre des faiseurs de disciple**, à n'importe quelle profondeur, **ou** s'il est désigné
> comme `dirigeant_id` de M.

La première branche couvre à la fois « je suis son faiseur de disciple direct » et « je gère
tout mon sous-arbre ». La seconde rattrape les cas où l'admin a forcé un dirigeant hors de
l'arborescence naturelle.

Cette règle est implémentée par une fonction unique `peutModifier(profil, membre)` dans
`lib/domaine/`, appelée par toutes les Server Actions concernées.

### 5.2 Matrice

| Action | Utilisateur | Modérateur | Administrateur |
|---|:--:|:--:|:--:|
| Consulter l'annuaire complet (membres actifs) | ✅ | ✅ | ✅ |
| Voir les séminaires assistés sur une fiche membre | ✅ | ✅ | ✅ |
| Voir les trois désirs exprimés lors d'un événement | ❌ | ✅ | ✅ |
| Modifier son propre profil et son mot de passe | ✅ | ✅ | ✅ |
| Modifier les statuts d'un membre dans sa portée d'autorité | ✅ | ✅ | ✅ |
| Demander l'ajout d'une personne suivie | ✅ | ✅ | ✅ |
| Créer et tenir une séance AEL, pointer les présences | ❌ | ✅ | ✅ |
| Modifier l'arbre (faiseur de disciple, dirigeant) | ❌ | ❌ | ✅ |
| Créer statuts, groupes, antennes, types d'événement | ❌ | ❌ | ✅ |
| Créer un événement et saisir les trois désirs | ❌ | ✅ | ✅ |
| Convertir un participant externe en membre | ❌ | ❌ | ✅ |
| Valider ou rejeter une demande de suivi | ❌ | ❌ | ✅ |
| Générer un token, créer un compte, lier un compte à une fiche | ❌ | ❌ | ✅ |
| Réinitialiser le mot de passe d'autrui, attribuer les rôles | ❌ | ❌ | ✅ |
| Gérer le calendrier AEL récurrent | ❌ | ✅ | ✅ |
| Archiver un membre | ❌ | ❌ | ✅ |

> **Amendement du 2026-08-12 (D22).** La gestion du calendrier AEL récurrent, d'abord
> réservée à l'administrateur, est ouverte au modérateur. Le modérateur tient déjà les
> séances et pointe les présences (ligne ci-dessus) : le calendrier est précisément ce qui
> engendre ces séances, et en réserver le réglage à un administrateur obligerait la
> personne qui anime à demander une intervention pour déplacer une date. Sans effet sur
> les phases 0 à 1c, qui ne livrent aucun AEL — **à appliquer au plan de la phase 3.**
>
> **Amendement du 2026-08-12 (D23).** La création d'un événement et la saisie des trois
> désirs sont ouvertes au modérateur. **Conséquence assumée, tirée en même temps :** la
> ligne « Voir les trois désirs » suit, et la RLS du §5.3 sur `participations` et
> `participants_externes` s'ouvre au modérateur. On ne saisit pas dans un champ qu'on ne
> peut pas relire, et une valeur invisible ne se corrige pas. Le cercle des personnes
> voyant ces confidences s'élargit donc d'un rôle — c'est le vrai coût de cet amendement,
> et il est dit ici plutôt que découvert à l'implémentation. Sans effet sur les phases 0
> à 1c, qui ne livrent aucun événement — **à appliquer au plan de la phase 4.**

### 5.3 Traduction technique

**RLS activée sur toutes les tables**, sans exception.

*Lectures autorisées au rôle client :*

| Table | Politique |
|---|---|
| `membres` | `etat = 'actif'` pour tout compte actif ; `en_attente` visible de l'admin et du demandeur ; `archive` visible de l'admin seul |
| `antennes`, `statuts`, `groupes_statut`, `types_evenement` | Tout compte actif |
| `membre_statuts`, `journal_statuts` | Tout compte actif, pour les membres qu'il peut lire |
| `seances_ael`, `presences_ael`, `calendriers_ael` | Tout compte actif |
| `evenements` | Tout compte actif — nécessaire pour afficher les séminaires assistés sur une fiche |
| Vue `seminaires_assistes` | Tout compte actif — participation seule, sans les trois désirs |
| `participations`, `participants_externes` | Administrateur **ou modérateur** — elles portent les trois désirs, dont la saisie est ouverte au modérateur depuis D23. Fermé à tout autre compte |
| `profils`, `roles_profil` | Son propre profil ; l'administrateur voit tout |
| `notifications` | Ses propres notifications uniquement |
| `tokens_inscription`, `demandes_membre` | Administrateur ; le demandeur voit ses propres demandes |

*Écritures :* **aucune politique d'écriture n'est accordée au rôle client, sur aucune table.**
Toutes les mutations passent par des Server Actions qui écrivent avec un client privilégié,
après vérification explicite des droits. La RLS reste le filet de sécurité : une action buguée
ne peut pas contourner ce que les politiques de lecture interdisent, et aucun client compromis
ne peut écrire quoi que ce soit.

**Comment `prive.est_admin()` évite la récursion — le mécanisme réel.** Une politique posée sur
`profils` doit savoir si l'appelant est administrateur, ce qui suppose de lire `profils` et
`roles_profil` : naïvement, la politique se rappellerait elle-même sans fin. Ce n'est **pas**
en s'abstenant de lire ces tables que la fonction s'en sort — elle les lit bel et bien. Elle
s'en sort parce qu'elle est `SECURITY DEFINER` : elle s'exécute avec les privilèges de son
propriétaire, lequel contourne la RLS, si bien qu'aucune politique ne se déclenche à
l'intérieur de son corps.

Cette conception repose donc sur une hypothèse : **le rôle propriétaire de la fonction possède
`BYPASSRLS`**. Si elle était fausse, il n'y aurait ni erreur ni fuite — la fonction renverrait
silencieusement `false` pour tout le monde et aucun administrateur ne verrait jamais le profil
d'autrui. Un défaut invisible, en échec fermé.

L'hypothèse a été vérifiée empiriquement sur le projet, et non supposée : avec deux comptes
réels, le compte ordinaire ne lit que son propre profil et le compte administrateur lit les
deux. Toute modification future du propriétaire des fonctions du schéma `prive` doit
s'accompagner de ce même test.

### 5.4 Réinitialisation de mot de passe

Le choix « identifiant sans email » (D10) supprime toute possibilité de réinitialisation
autonome. Conséquence assumée :

- **Par l'utilisateur** : changement de mot de passe depuis son profil, en fournissant l'ancien.
- **Par l'admin** : réinitialisation générant un mot de passe temporaire, affiché **une seule
  fois** et à transmettre de vive voix. `doit_changer_mdp` est positionné, et l'utilisateur est
  forcé de choisir un nouveau mot de passe à sa connexion suivante.

Un administrateur doit donc rester joignable par l'équipe.

---

## 6. Parcours clés

**Amorçage.** Le compte racine se connecte, crée les antennes, les groupes de statuts et les
statuts, saisit les premiers membres — les tout premiers sans faiseur de disciple, ce sont les
racines de l'arbre —, leur crée des comptes, les lie à leurs fiches et leur attribue les rôles.

**Inscription par token.** L'admin génère un token, nominatif ou générique, avec une date
d'expiration. Seul le haché est stocké ; le code en clair s'affiche une seule fois. Un token
nominatif relie automatiquement le compte créé à sa fiche. Un token générique fait remplir ses
informations à l'inscrit, crée une fiche `en_attente` et notifie l'admin, qui valide en
**rattachant au besoin le compte à une fiche existante** (D26).

> **Correction du 2026-08-12 (D27).** Cette section affirmait que le token est marqué utilisé
> « de façon atomique, **dans la même transaction que la création du compte** ». C'est
> **impossible** dans cette architecture : la création du compte est un appel HTTP au service
> d'authentification de Supabase, le marquage du token une écriture SQL. Aucune transaction ne
> couvre les deux.
>
> Ce qui est réellement garanti, et qui suffit : le token est **consommé d'abord**, par une
> fonction Postgres qui le verrouille, vérifie qu'il est inconnu-expiré-ou-déjà-utilisé, le
> marque utilisé et rend ses données — **en une seule transaction**. Deux personnes ne peuvent
> donc jamais consommer le même code. Le compte est créé ensuite ; si sa création échoue, le
> token est relâché et l'échec journalisé.
>
> L'ordre inverse serait pire : créer le compte puis consommer laisserait deux inscrits créer
> deux comptes avant que l'un perde. La fenêtre résiduelle assumée est un token consommé sans
> compte — récupérable par un administrateur, jamais un double usage.

**Modification de statuts.** Un utilisateur ouvre la fiche d'un membre de sa portée d'autorité,
coche ou décoche des statuts, renseigne éventuellement une date d'acquisition. L'effet est
immédiat, sans validation. Chaque mouvement est journalisé.

**Demande de suivi.** Un utilisateur renseigne les informations de la personne. Une fiche
`en_attente` est créée, invisible dans l'annuaire, et l'admin est notifié. À la validation, la
fiche passe à `actif`, le demandeur est posé comme faiseur de disciple par défaut et le
dirigeant proposé est appliqué — l'admin peut corriger avant de valider. En cas de rejet, un
motif est saisi et le demandeur est notifié.

**Tenue d'un AEL.** Les séances à venir existent déjà à l'état `prevue`. Le modérateur ouvre
celle du jour, saisit le thème, l'enseignant et le modérateur, et pointe une liste pré-remplie
avec les membres actifs des antennes ciblées. Il peut ajouter à la main n'importe quel autre
membre. La séance passe à `tenue` ; les compteurs suivent d'eux-mêmes.

**Événement et conversion.** L'admin crée l'événement, coche les membres participants, ajoute
les participants externes, et renseigne pour chacun les trois désirs. Les externes ayant
exprimé le désir d'être suivis spirituellement apparaissent dans une liste « à traiter » ; un
clic les convertit en fiche membre, avec attribution d'un faiseur de disciple, et renseigne
`converti_en_membre_id`.

---

## 7. Gestion des erreurs

| Situation | Comportement |
|---|---|
| Token expiré, déjà utilisé, ou inconnu | Refus avec un message unique et indifférencié, sans jamais révéler qu'un code existe |
| Réassignation créant un cycle | Refusée par déclencheur base et par vérification en amont, avec affichage du chemin fautif |
| Archivage d'un membre qui est faiseur de disciple | Bloqué tant que ses disciples n'ont pas été réaffectés ; la liste des personnes concernées est affichée |
| Archivage d'un membre dont le compte lié est le **dernier administrateur actif** | Refusé (D24 croise la règle du dernier administrateur ci-dessous) : archiver désactiverait ce compte et laisserait l'application sans administrateur, sans moyen d'en recréer un. Le message nomme la cause et invite à donner le rôle à quelqu'un d'autre d'abord |
| Rattachement à un faiseur de disciple **archivé** | Refusé. Le sélecteur ne propose que des membres actifs, mais la passerelle et un déclencheur le refusent aussi — sans quoi une écriture directe recréerait l'état que l'archivage interdit |
| Désactivation d'un statut déjà attribué | Autorisée : il disparaît des nouvelles attributions mais reste visible sur les fiches existantes et dans l'historique |
| Deux modérateurs pointant la même séance | Dernière écriture par membre gagnante — le pointage est ligne à ligne, pas un formulaire global |
| Suppression ou rétrogradation du dernier administrateur | Refusée : au moins un compte administrateur actif doit subsister |
| Passage d'une séance à `tenue` sans thème ni enseignant | Refusé, avec indication du champ manquant |
| Identifiant déjà pris à la création d'un compte | Refusé, avec proposition d'une variante disponible |
| Deux statuts exclusifs du même groupe | L'ancien est retiré automatiquement, le retrait est journalisé et signalé dans l'interface |

---

## 8. Stratégie de test

**1. Vitest sur `lib/domaine/`** — le gros du filet, sans base de données :
calcul du dirigeant proposé (chaînes profondes, racines multiples, faiseur de disciple absent),
détection de cycle, portée d'autorité (ancêtre direct, ancêtre lointain, dirigeant forcé hors
arbre, aucun lien), exclusivité des statuts par groupe, compteur AEL avec report initial,
génération des séances depuis un calendrier récurrent, normalisation des identifiants.

**2. Tests SQL des politiques RLS** — pour chaque table : vérifier qu'un compte non privilégié
ne peut effectuer aucune écriture, ne peut pas lire une fiche `en_attente` ou `archive` qui ne
le concerne pas, ne voit pas les événements ni les tokens, et ne lit pas les notifications
d'autrui. C'est le point le plus sensible du projet : ce sont des données nominatives sur la vie
spirituelle de personnes réelles.

**3. Playwright, sur quatre parcours uniquement** — connexion par identifiant, inscription par
token, pointage d'un AEL, validation d'une demande de suivi. Pas de couverture end-to-end
exhaustive : trop coûteuse à maintenir pour un bénéfice faible sur les écrans de saisie
ordinaires.

---

## 9. Découpage en phases

Chaque phase est livrable et utilisable en l'état.

| Phase | Contenu | Utilisable pour |
|---|---|---|
| **0 — Socle** | Projet Next.js, Supabase, migrations de base, auth par identifiant, compte racine, changement de mot de passe forcé, déploiement Vercel | Se connecter |
| **1 — Membres** | Antennes, membres, groupes et statuts, arborescence avec anti-cycle, annuaire, fiche membre, journal des statuts | Tenir le registre de l'équipe |
| **2 — Comptes** | Tokens (deux modes), création et liaison de comptes, rôles, réinitialisation de mot de passe, demandes de suivi, notifications | Ouvrir l'application à l'équipe |
| **3 — AEL** | Calendrier récurrent par antenne, génération des séances, tenue et pointage, compteurs | Remplacer le suivi de présence actuel |
| **4 — Événements** | Types, événements, participants externes, trois désirs, liste à traiter, conversion en membre | Exploiter les séminaires comme canal d'entrée |

Les phases 3 et 4 sont indépendantes : leur ordre est interchangeable selon la priorité du
moment.

---

## 10. Note pour l'implémentation

Avant d'écrire la moindre migration, politique RLS ou requête, charger les compétences
`supabase:supabase` et `supabase:supabase-postgres-best-practices`. Elles n'ont
délibérément pas été chargées pendant la conception, qui restait au niveau conceptuel, mais
elles doivent guider l'écriture du SQL réel.
