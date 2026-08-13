# Phase 2b — tokens d'inscription, inscription publique, demandes de suivi, notifications

**Date :** 2026-08-13
**Statut :** design proposé, à valider avant plan d'implémentation
**Spécification maîtresse :** `2026-08-11-suivi-asonkeng-design.md` — ce document ne la
remplace pas. Il précise ce que la 2b livre et enregistre les décisions prises pendant son
cadrage.
**Design de la phase précédente :** `2026-08-12-phase-1c-design.md`, dont ce document suit le
ton, la structure et le niveau de détail.

---

## 1. Objet

La phase 1c a livré l'arborescence, la portée d'autorité et l'écran des comptes — mais
volontairement sans tokens d'inscription, sans demandes de suivi et sans notifications
(`2026-08-12-phase-1c-design.md`, §2 : « Reste en phase 2, volontairement »).

La 2b livre ces trois circuits, tous nouveaux à ce stade du projet :

1. **Tokens d'inscription** (D8) — génération, liste, révocation, réservées à l'administrateur.
2. **Inscription publique** (`/inscription`) — le **premier chemin d'écriture non
   authentifié** de toute l'application.
3. **Demandes de suivi** — un utilisateur propose une personne à suivre ; l'admin valide ou
   rejette.
4. **Notifications** — file en base, cloche, page « à traiter », in-app uniquement.

Trois tables neuves (§4.6 de la spécification maîtresse), plus une quatrième que la 2b doit
concevoir elle-même pour porter le plafond de tentatives (D25). Aucune de ces tables n'existe
encore en base : les migrations qui les créent sont les premières du genre, et tout ce que ce
document ajoute par rapport au §4.6 est donc un choix de schéma pour une table qui naît ici,
pas une modification d'une table déjà livrée.

---

## 2. Décisions héritées, exposées et non rouvertes

| # | Décision | Justification |
|---|---|---|
| D25 | Code long haché + **plafond de tentatives** par adresse et par fenêtre de temps, **sans** gel du token visé | `/inscription` est le premier chemin d'écriture public. Un message prudent sans plafond ne protège de rien — il rend l'attaque silencieuse. Geler le token visé permettrait à un tiers d'empêcher quelqu'un de s'inscrire en brûlant ses tentatives |
| D26 | Pas de fusion générale de fiches. À la validation, le **compte** est rattaché à la fiche existante et la fiche `en_attente` est supprimée | La fiche en attente vient d'être créée et ne porte ni statuts, ni historique, ni place dans l'arbre : la rattacher puis la jeter ne peut rien perdre. Une vraie fusion de deux fiches anciennes est précisément là où l'on perd des données sans s'en apercevoir |
| D27 | L'atomicité couvre la **consommation du token seule**, par une fonction Postgres qui le verrouille, le vérifie, le marque utilisé et rend ses données en une seule transaction. Le compte est créé ensuite ; le token est relâché si cette création échoue | La création du compte est un appel HTTP à Supabase Auth, le marquage du token une écriture SQL : aucune transaction ne les couvre tous deux. L'ordre inverse serait pire : créer le compte puis consommer laisserait deux inscrits créer deux comptes avant que l'un perde |

Pour mémoire, deux décisions plus anciennes structurent tout ce document sans être rouvertes :
**D8** (les tokens existent en deux modes, nominatif et générique, parce que les deux usages
sont réels) et **D10** (connexion par identifiant, sans email — l'inscrit choisit donc lui-même
son identifiant et son mot de passe, il n'y a pas d'email à confirmer). **D11** (compte racine
sans fiche membre) n'a pas d'effet direct ici : le compte racine, déjà administrateur, n'a
aucune raison d'emprunter `/inscription`.

---

## 3. Décisions prises pendant ce cadrage

Ces décisions comblent des choix que le §4.6 et le §6 de la spécification maîtresse laissent
ouverts. D30 à D34 sont des décisions d'architecture, prises pendant la rédaction de ce document
et justifiées comme telles — aucune n'invente un comportement produit, chacune ferme une
ambiguïté nécessaire pour implémenter fidèlement ce que ces sections décrivent déjà. D35 à D42
sont des décisions **produit**, que ce document avait portées en section « À trancher »
(dans sa première rédaction pour D35 à D41, puis pour le point resté seul ouvert pour D42) et
que l'utilisateur a tranchées explicitement le 2026-08-13 ; elles sont reproduites ici avec sa
justification, pas la nôtre.

> **Numérotation.** Les numéros de décision sont globaux au projet, pas propres à cette phase.
> D30 à D34 restent ceux-ci — c'est le design de la phase 3, rédigé en parallèle, qui se décale
> pour éviter la collision.

| # | Décision | Justification |
|---|---|---|
| D30 | Le formulaire public `/inscription` est **unique** et ne varie jamais selon le contenu du code saisi (mode, validité, expiration) : aucune lecture ne distingue ces cas avant la soumission unique qui consomme le token et crée le compte | Le §7 exige un message d'erreur indifférencié pour ne jamais révéler qu'un code existe. Un formulaire qui changerait de forme selon le code — préremplissant un nom pour un token nominatif, par exemple — recréerait le même oracle par un autre canal : la forme de la page plutôt que son message d'erreur |
| D31 | La consommation d'un token est sérialisée par un **verrou de ligne** (`select ... for update` sur la ligne du token), et non par le verrou consultatif global employé pour l'arbre ou pour les rôles/l'activation en 1c | L'invariant à protéger — « ce code précis n'est consommé qu'une fois » — est un invariant **par ligne**, contrairement au cycle dans l'arbre ou au comptage des administrateurs actifs, qui portent sur l'état de toute la table. Un verrou de ligne suffit et coûte moins : deux inscriptions sur deux tokens différents ne doivent surtout pas s'attendre l'une l'autre |
| D32 | `demandes_membre` porte une colonne `origine` (`auto_inscription` \| `demande_suivi`), absente de la liste du §4.6 | Les deux parcours du §6 produisent chacun une ligne dans cette table, mais la validation n'y fait pas la même chose : le rattachement à une fiche existante (D26) suppose un compte en attente de domicile et n'a de sens que pour l'auto-inscription ; poser le demandeur comme faiseur de disciple par défaut n'a de sens que pour une demande de suivi, où le demandeur possède déjà une fiche. Distinguer les deux par « `demandeur_profil_id` a-t-il un `membre_id` ? » est fragile : un compte créé par un administrateur sans être encore lié à une fiche pourrait légitimement soumettre une demande de suivi, produisant la même signature que l'auto-inscription. Une colonne explicite, posée par le code qui sait déjà quel parcours est en cours, ferme l'ambiguïté sans reposer sur une inférence |
| D33 | `tokens_inscription` porte une colonne `revoque_le` (timestamptz, nullable), absente de la liste du §4.6. Un token dont `revoque_le` est renseigné est traité, à la consommation, exactement comme un token expiré — même branche, même message | La 2b doit livrer un écran de révocation, mais le §4.6 ne modélise aucune colonne pour la porter. Réutiliser `expire_le` (l'écraser à `now()`) économiserait la colonne mais empêcherait l'administrateur de distinguer, dans **sa propre** liste, un token qu'il a coupé d'un token simplement arrivé à échéance — une perte qu'il n'a pas besoin de subir pour l'audit, même si elle est sans effet côté public |
| D34 | Le plafond de tentatives (D25) compte **toute** tentative de consommation par adresse dans la fenêtre glissante — qu'elle échoue ou réussisse — jamais seulement les échecs | Si seules les tentatives échouées comptaient, le compteur se comporterait différemment selon que le code essayé était valide ou non : une adresse qui a réussi consommerait moins de « budget » qu'une adresse qui a longtemps échoué, révélant en creux l'issue d'une tentative passée à qui pourrait observer le compteur. Compter uniformément ferme ce canal |
| D35 | Le formulaire public collecte, outre nom, prénom, identifiant et mot de passe, le **téléphone, la ville et l'antenne** — pas la situation ni le domaine d'étude | Décision utilisateur, 2026-08-13, tranchant le point 4 de la première rédaction de ce document. **L'antenne conditionne les listes de présence AEL** (D3) : sans elle à l'inscription, l'administrateur devrait la saisir à la validation pour chaque inscrit, et un seul oubli rendrait la personne invisible des pointages de son assemblée. Téléphone et ville sont des coordonnées de contact ordinaires. Situation et domaine d'étude sont écartés parce qu'ils demandent des informations personnelles avant toute validation, sans rien conditionner d'autre |
| D36 | Le plafond de tentatives (D25/D34) est fixé à **10 tentatives par adresse et par tranche de 15 minutes** | Décision utilisateur. Assez large pour ne jamais gêner quelqu'un qui se trompe en recopiant son code, assez étroit pour rendre l'essai exhaustif inopérant face à un code long (D38) |
| D37 | La validité par défaut d'un token, proposée à sa création, est de **7 jours**, et reste **modifiable** par l'administrateur avant génération | Décision utilisateur. Une invitation qui traîne des semaines est une invitation qu'on a oubliée |
| D38 | Le code d'inscription emprunte le **même alphabet sans caractères ambigus** que les mots de passe temporaires de la 1c (`ALPHABET_LISIBLE`, `src/app/comptes/actions.ts`), sur une longueur d'**au moins 16 caractères**, tiré par le même mécanisme de rejet déjà écrit | Décision utilisateur. Un code d'invitation se transmet souvent de vive voix ou recopié à la main, exactement comme un mot de passe temporaire — le même piège d'ambiguïté (0/O, 1/l/I) s'y applique. Réutiliser le tirage existant évite d'en réécrire un second, avec le risque de biais que cela rouvrirait |
| D39 | Le mot de passe choisi à l'inscription publique respecte la **même règle de robustesse** que le changement de mot de passe volontaire, `LONGUEUR_MDP_MINIMALE` (`src/app/changer-mot-de-passe/constantes.ts`) | Décision utilisateur. Deux règles différentes selon la porte d'entrée seraient incohérentes et impossibles à documenter honnêtement |
| D40 | Le demandeur peut **annuler sa propre demande de suivi** tant qu'elle est à l'état `en_attente` | Décision utilisateur. Le demandeur voit déjà ses propres demandes (§5.5) ; ne pas pouvoir en retirer une faite par erreur obligerait à déranger un administrateur pour rien |
| D41 | Une notification dont l'objet (la demande) vient d'être traité est **marquée lue automatiquement** au moment du traitement, jamais supprimée | Décision utilisateur. Une notification effacée priverait de la trace ; une notification non lue pointant vers une demande déjà close ferait perdre du temps à qui la suit |
| D42 | L'annulation d'une demande de suivi (D40) **supprime la fiche `en_attente`** dans le même geste que le passage à `etat = 'annulee'` ; `demandes_membre.membre_id` est `on delete set null`, si bien que la demande subsiste, sans fiche | Décision utilisateur, répondant au point resté ouvert à la fin de la rédaction précédente. **(1) Cohérence avec D26** : la validation avec rattachement supprime déjà la fiche `en_attente` — même raisonnement, une fiche jamais validée ne porte ni statuts, ni historique, ni place dans l'arbre, la supprimer ne peut rien perdre. **(2) Une fiche orpheline est un piège** : elle resterait visible du demandeur et de l'administrateur sans que rien n'explique pourquoi elle est là, et personne ne la validera jamais puisque la demande qui la justifiait n'existe plus — le genre d'objet dont on ne sait plus, six mois après, s'il est un oubli ou une intention. **(3) La trace compte plus que la fiche** : garder la demande à l'état `annulee` conserve ce qui a une valeur — qui a demandé quoi, et quand — sans conserver ce qui n'en a pas |

---

## 4. Périmètre livré

1. **Écran `/tokens`**, réservé à l'administrateur : générer un token (nominatif, avec le
   sélecteur de membre du §6.1 de la 1c ; ou générique), lister tous les tokens avec leur état,
   révoquer un token encore valide. Le code en clair s'affiche **une seule fois**, immédiatement
   après la génération.
2. **`/inscription`**, public, sans session. Formulaire unique (D30) : code, identifiant, mot
   de passe, nom, prénom. Consommation atomique du token (D27, D31) puis création du compte.
3. **Demande de suivi** — un formulaire accessible à tout compte actif, qui crée une fiche
   `en_attente` et une ligne `demandes_membre` (`origine = 'demande_suivi'`).
4. **Écran `/demandes`**, réservé à l'administrateur : liste des demandes `en_attente` (les
   deux origines confondues), avec pour chacune les actions que son origine autorise (§7).
5. **Notifications** — cloche dans l'en-tête, page « à traiter » listant les notifications non
   lues du compte connecté, action « marquer comme lue ».

---

## 5. Modèle de données

Nommage en français, `snake_case`, clés primaires `uuid`, horodatages `timestamptz`, comme le
reste du projet. Quatre tables, toutes nouvelles — les migrations qui les créent sont donc les
premières de leur genre, sans passé à préserver.

### 5.1 `tokens_inscription`

| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `code_hash` | text NOT NULL | Haché (D25) — le code en clair n'est **jamais** stocké |
| `mode` | enum `nominatif` \| `generique` NOT NULL | D8 |
| `membre_id` | uuid NULL → `membres` | Obligatoire si `mode = 'nominatif'`, interdit sinon (contrainte CHECK croisée) |
| `cree_par` | uuid → `profils` | |
| `cree_le` | timestamptz NOT NULL | |
| `expire_le` | timestamptz NOT NULL | Proposée à `now() + 7 jours` (D37), modifiable par l'administrateur avant génération |
| `revoque_le` | timestamptz NULL | **Ajout D33**, absent du §4.6 |
| `utilise_le` | timestamptz NULL | Posé par `consommer_token_inscription` (§7.1), avant même que le compte existe |
| `utilise_par_profil_id` | uuid NULL → `profils` | Posé **après** la création du compte, par une seconde écriture — voir §7.1 |

Un token `nominatif` référence une fiche déjà existante, choisie par l'admin au moment de la
génération. Un token `generique` n'en référence aucune : la fiche naît à l'inscription. Le code
en clair est tiré sur **au moins 16 caractères** de l'alphabet `ALPHABET_LISIBLE` déjà écrit pour
les mots de passe temporaires (`src/app/comptes/actions.ts`), par le même mécanisme de rejet
(D38) — réutilisé, pas réécrit.

### 5.2 `demandes_membre`

| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `origine` | enum `auto_inscription` \| `demande_suivi` NOT NULL | **Ajout D32**, absent du §4.6 |
| `demandeur_profil_id` | uuid → `profils` | Pour `auto_inscription` : le compte qui vient de s'inscrire. Pour `demande_suivi` : le compte qui propose |
| `membre_id` | uuid NULL → `membres`, **`on delete set null`** | La fiche `en_attente` concernée, tant qu'elle existe. Devient `NULL` quand une annulation (D42) supprime cette fiche — la demande subsiste, la référence ne pointe plus vers rien |
| `etat` | enum `en_attente` \| `validee` \| `rejetee` \| `annulee` NOT NULL | `annulee` ajoutée pour D40 — distincte de `rejetee`, qui porte un motif saisi par un administrateur ; une annulation est le geste du demandeur lui-même, sans admin impliqué |
| `motif_rejet` | text NULL | Renseigné pour `rejetee` seulement ; `NULL` pour une annulation, qui n'a pas de motif à documenter |
| `traite_par` | uuid NULL → `profils` | L'administrateur qui valide ou rejette ; le demandeur lui-même en cas d'annulation (D40) |
| `traite_le` | timestamptz NULL | |
| `cree_le` | timestamptz NOT NULL | |

C'est cette table, et non une politique dédiée sur `membres`, qui porte la réponse à « qui est
le demandeur d'une fiche `en_attente` ? » — nécessaire à la politique RLS `membres_lecture`
existante, amendée au §6.

### 5.3 `notifications`

| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `profil_id` | uuid → `profils` | Destinataire |
| `type` | enum `nouvelle_demande` \| `demande_validee` \| `demande_rejetee` NOT NULL | Extensible par migration additive aux phases 3 et 4 |
| `titre` | text NOT NULL | |
| `corps` | text NOT NULL | |
| `lien` | text NULL | Vers `/demandes/{id}` |
| `lu_le` | timestamptz NULL | |
| `cree_le` | timestamptz NOT NULL | |

`nouvelle_demande` est diffusée à **tous** les administrateurs actifs, jamais à un seul (§7.3).
Toute notification devenue caduque au traitement de la demande qu'elle annonce est marquée lue
automatiquement (D41), y compris en cas d'annulation par le demandeur (§7.2).

### 5.4 `tentatives_token_inscription` — la table que la 2b doit concevoir

| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `adresse` | inet NOT NULL | Adresse de l'appelant, lue côté serveur (en-tête `x-forwarded-for` sur Vercel) — jamais fournie par le client |
| `tente_le` | timestamptz NOT NULL DEFAULT now() | |

Une ligne par appel à `consommer_token_inscription`, réussi ou non (D34). Le plafond lu sur
cette table est de **10 tentatives par adresse et par tranche de 15 minutes** (D36). Aucune
purge automatique n'est livrée par cette phase : le projet n'a pas d'infrastructure de tâche
planifiée (cf. D28, phase 3), et le volume attendu (tentatives d'inscription d'une équipe) reste
modeste. Croissance non bornée, assumée et dite plutôt que découverte plus tard — voir §11.

### 5.5 RLS

Cohérente avec le §5.3 de la spécification maîtresse : **lecture seule côté client, aucune
politique d'écriture, refus par défaut**.

| Table | Politique de lecture |
|---|---|
| `tokens_inscription` | Administrateur seul |
| `demandes_membre` | Administrateur ; `demandeur_profil_id = auth.uid()` pour ses propres demandes |
| `notifications` | `profil_id = auth.uid()` seul, jamais l'administrateur pour autrui — ce sont des notifications personnelles, pas un journal d'équipe |
| `tentatives_token_inscription` | **Aucune** — même l'administrateur ne la lit pas via PostgREST. Elle n'existe que pour l'usage interne de `consommer_token_inscription`, qui la lit en `SECURITY DEFINER` |

**Amendement nécessaire à `membres_lecture`** (posée en 1a/1c) : la politique dit déjà
« `en_attente` visible de l'admin et du demandeur », mais rien ne l'implémentait avant cette
phase, faute de table portant la notion de demandeur. Une nouvelle migration additive
(`drop policy` + `create policy` sur `public.membres`, dans un fichier neuf — l'additivité du
projet porte sur les fichiers de migration, pas sur l'immuabilité de chaque politique)
introduit une fonction `prive.est_demandeur_de(p_membre_id uuid)`, `SECURITY DEFINER`, qui lit
`demandes_membre` en s'affranchissant de sa propre RLS — même mécanisme et même raison que
`prive.est_admin()` : une politique sur `membres` qui lirait `demandes_membre` sous RLS n'a pas
de risque de récursion direct, mais la lirait avec les privilèges de l'appelant, qui n'a par
construction pas encore le droit d'y accéder tant que la politique de `membres` n'a pas statué.
`SECURITY DEFINER` casse cette dépendance circulaire.

Toutes les écritures — génération et révocation de token, consommation, création et traitement
de demande, création et lecture des notifications — passent par des Server Actions avec la clé
de service ou par les fonctions `SECURITY DEFINER` décrites au §7. Aucune politique `insert`,
`update` ou `delete` n'est créée sur aucune des quatre tables.

---

## 6. Le point le plus délicat : la surface publique de `/inscription`

`/inscription` est la première page de toute l'application à s'afficher **sans aucune
session**. Elle doit être exhaustivement close, et la fermeture doit être démontrable, pas
seulement crue.

**Ce qui est exposé, précisément :**

- La **page elle-même** (Server Component) : aucune lecture de base. Elle ne rend qu'un
  formulaire statique — pas de recherche de token, pas de préremplissage, pas d'indice sur le
  mode ou la validité du code (D30). Un visiteur non authentifié qui l'ouvre voit exactement la
  même chose, qu'il détienne un code valide, expiré, ou aucun code.
- Une **unique Server Action** (`sInscrire`), le seul point d'entrée en écriture atteignable
  sans session. Elle tourne côté serveur avec la clé de service ; le navigateur ne voit jamais
  cette clé et ne peut appeler ni PostgREST ni GoTrue directement pour ce chemin.

**Ce qui n'est PAS exposé :**

- Aucune table n'accorde de politique `select` au rôle `anon`. `tokens_inscription`,
  `demandes_membre`, `notifications` et `tentatives_token_inscription` sont, comme toutes les
  tables du projet, `force row level security`, sans aucune politique ouverte à `anon` : un
  appel PostgREST anonyme direct sur l'une d'elles rend un tableau vide, jamais une ligne. Ce
  n'est pas un filtrage applicatif qui pourrait être contourné — c'est l'absence totale de
  politique, le même refus par défaut que celui du §5.3 pour tout le reste du projet.
- La fonction de consommation (§7.1) n'est exécutable que par `service_role` : `revoke execute`
  de `public`, `anon` et `authenticated`, `grant` au seul `service_role` — même motif que
  `definir_arbre` et `definir_roles` en 1c. Un appel RPC direct depuis le navigateur, avec la
  clé anonyme, échoue avant même d'atteindre le corps de la fonction : Postgres refuse le
  privilège `EXECUTE` à la couche du `GRANT`, pas dans une condition du code.

**Pourquoi l'écart de message serait un oracle.** Le §7 exige un message identique pour un code
inconnu, expiré ou déjà utilisé. La raison tient à ce qu'un attaquant peut observer : s'il
soumet des codes au hasard et que la réponse varie selon la cause du refus (« ce code n'existe
pas » contre « ce code a expiré »), il apprend qu'un code EXISTE dès qu'il cesse de recevoir le
premier message — ce qui réduit l'espace de recherche d'un token nominatif à la liste des codes
jamais générés, puis lui indique lequel a expiré contre lequel reste peut-être valide. Un
message uniforme rend cette observation impossible : toute réponse négative, quelle que soit sa
vraie cause, ferme la même porte de la même façon. C'est pour la même raison que D30 étend
l'exigence du message à la **forme** du formulaire, et que D34 étend le plafond de tentatives à
**toute** tentative plutôt qu'aux seules échouées : trois applications du même principe — rien
d'observable ne doit dépendre de la validité du code avant que le code n'ait été effectivement
consommé.

**Ce qui reste, assumé et non traité par cette phase.** Le temps de réponse des quatre branches
de refus (inconnu, expiré, révoqué, déjà utilisé) n'est pas égalisé artificiellement : elles
empruntent toutes le même chemin SQL (une lecture verrouillée, puis un test), donc leur coût
réel est déjà proche, mais aucune mesure ni aucun délai de garde n'a été ajouté pour l'affirmer.
Un canal de synchronisation par le temps n'est pas fermé par cette phase — voir §13.

---

## 7. Circuits

### 7.1 Consommation d'un token — `public.consommer_token_inscription`

`SECURITY DEFINER`, `EXECUTE` réservé à `service_role`. Appelée par `sInscrire` avec le hachage
du code saisi (calculé côté serveur, jamais transmis en clair au-delà du corps de la requête) et
l'adresse de l'appelant. `sInscrire` rejette le mot de passe soumis avant même de tenter la
consommation du token si sa longueur est inférieure à `LONGUEUR_MDP_MINIMALE` (D39) — inutile de
consommer un code sur un formulaire qui échouera de toute façon, mais ce contrôle amont n'est
qu'un confort : Supabase Auth impose de toute façon sa propre règle minimale à la création du
compte, et c'est elle qui reste décisive.

1. Insère une ligne dans `tentatives_token_inscription` — avant tout autre test, pour que même
   une tentative sur un code totalement inconnu compte (D34).
2. Compte les tentatives de cette adresse sur la fenêtre glissante ; au-delà de **10 tentatives
   par 15 minutes** (D36), lève une exception marquée `trop_de_tentatives`.
3. Verrouille la ligne du token (`select ... for update`) par son `code_hash` (D31).
4. Si la ligne n'existe pas, ou si `expire_le < now()`, ou si `revoque_le` est renseigné, ou si
   `utilise_le` est déjà renseigné : lève une exception marquée `token_invalide` — la même dans
   les quatre cas.
5. Sinon, pose `utilise_le = now()` et rend `(mode, membre_id)`. `utilise_par_profil_id` reste
   `NULL` à ce stade : le compte n'existe pas encore (D27).

`sInscrire` reçoit ensuite `(mode, membre_id)`, crée le compte auth, puis :

- si la création **réussit** : met à jour `tokens_inscription.utilise_par_profil_id` (écriture
  simple, sans concurrence à fermer — un seul flux touche cette ligne à ce stade) ; puis, selon
  `mode` :
  - **nominatif** : `profils.membre_id = membre_id` du token. Les champs `nom`/`prenom`/
    `telephone`/`ville`/`antenne_id` soumis dans le formulaire sont **ignorés** — la fiche
    existe déjà et ses valeurs ne doivent jamais être écrasées par une saisie publique non
    vérifiée. C'est un point de sécurité, pas seulement une économie d'écriture.
  - **générique** : crée une fiche `membres` (`etat = 'en_attente'`) avec les champs soumis
    (`nom`, `prenom`, `telephone`, `ville`, `antenne_id` — D35), `profils.membre_id` reste
    `NULL`, et crée une ligne `demandes_membre` (`origine = 'auto_inscription'`,
    `demandeur_profil_id` = le compte qui vient de naître, `membre_id` = la fiche neuve).
    Notifie tous les administrateurs actifs (`type = 'nouvelle_demande'`).
- si la création **échoue** : appelle `public.relacher_token_inscription(p_token_id)`, qui remet
  `utilise_le` et `utilise_par_profil_id` à `NULL` — même privilège `service_role` seul, même
  raisonnement que §7.1. La fenêtre résiduelle assumée par D27 (un token consommé sans compte,
  récupérable par un administrateur) reste possible si le processus s'interrompt entre la
  consommation et l'appel de relâche ; jamais un double usage.

### 7.2 Demande de suivi

Un compte actif (`exigerProfilActif`) soumet nom/prénom (et éventuellement les autres champs de
`membres`, saisissables directement puisque le demandeur agit sous sa propre identité, connue et
authentifiée — à la différence de l'inscription publique). Une fiche `en_attente` est créée,
une ligne `demandes_membre` (`origine = 'demande_suivi'`, `demandeur_profil_id` = l'appelant), et
tous les administrateurs actifs sont notifiés.

**Annulation (D40, D42) — `public.annuler_demande_membre`.** Tant que `etat = 'en_attente'`, le
demandeur peut annuler sa propre demande. Contrairement aux autres écritures de ce document, ce
n'est **pas** une simple mise à jour depuis la Server Action : l'annulation doit à la fois faire
passer la demande à `etat = 'annulee'` **et** supprimer la fiche `en_attente` qu'elle portait
(D42), et ces deux écritures doivent réussir ou échouer ensemble — sans quoi une fiche
supprimée sans que la demande change d'état laisserait une ligne `en_attente` pointant vers
rien, pire que l'orpheline que D42 cherche à éviter.

L'atomicité est tenue par construction, pas par un mécanisme ajouté : les deux écritures vivent
dans le corps d'**une seule** fonction PL/pgSQL, `public.annuler_demande_membre(p_demande_id)`
(`SECURITY DEFINER`, `EXECUTE` réservé à `service_role`, même famille que `definir_roles` et
`definir_actif_compte` en 1c). Un appel à une fonction Postgres s'exécute dans la transaction
implicite de l'instruction qui l'invoque : si une exception survient à n'importe quel point de
son corps, **toutes** les écritures qu'elle a faites jusque-là sont annulées avec elle — Postgres
garantit cette propriété au niveau du langage, elle n'a besoin d'aucun verrou ni d'aucune
sérialisation supplémentaire, contrairement aux invariants de l'arbre ou du dernier
administrateur en 1c, qui portent sur un lire-puis-écrire concurrent. La fonction :

1. verrouille et lit la ligne `demandes_membre` (`select ... for update`) ; si elle n'existe pas,
   si `demandeur_profil_id` ne correspond pas à l'appelant, ou si `etat <> 'en_attente'`, lève une
   exception marquée `demande_non_annulable` ;
2. met à jour `etat = 'annulee'`, `traite_par` = l'appelant, `traite_le = now()` ;
3. supprime la ligne `membres` référencée (`membre_id` devient `NULL` par `on delete set null`,
   explicité plutôt que subi) ;
4. marque lues (D41) les notifications `nouvelle_demande` déjà envoyées aux administrateurs pour
   cette demande — sans quoi la cloche d'un administrateur pointerait vers une demande qui
   n'existe plus à traiter.

**Le risque à garder en tête pour le plan d'implémentation** : cette garantie tient tant que
l'annulation reste un unique appel RPC. Si une future modification la scindait en deux appels
distincts depuis `sInscrire` ou depuis une Server Action (par exemple : une mise à jour
PostgREST suivie d'une suppression PostgREST), l'atomicité disparaîtrait silencieusement — deux
transactions séparées, chacune capable de réussir sans l'autre. Rien dans le code ne l'empêcherait
mécaniquement : c'est une discipline à documenter à l'endroit de l'appel, pas une propriété que
le schéma peut imposer seul.

### 7.3 Validation et rejet — réservés à l'administrateur

Les actions disponibles diffèrent selon `origine`, parce que la question posée à l'admin n'est
pas la même dans les deux cas :

| Action | `auto_inscription` | `demande_suivi` |
|---|---|---|
| Valider comme nouvelle personne | Fiche → `actif`, `profils.membre_id` = la fiche | Fiche → `actif`, `faiseur_de_disciple_id` = fiche du demandeur, `dirigeant_propose` appliqué (corrigeable avant validation) |
| Valider en rattachant à une fiche existante (D26) | Sélecteur de membre (§6.1, 1c) ; `profils.membre_id` = la fiche choisie ; **la fiche `en_attente` créée à l'inscription est supprimée** | **Non proposé** — il n'y a pas de compte en attente de domicile ici ; un doublon suspecté se traite par rejet, motif à l'appui |
| Rejeter | Motif obligatoire, demandeur notifié (`demande_rejetee`) | Motif obligatoire, demandeur notifié |

Dans les deux cas, avant de supprimer la fiche `en_attente` d'un rattachement (D26), la ligne
`demandes_membre` elle-même est **d'abord** repointée vers la fiche définitive
(`membre_id = fiche existante`, `etat = 'validee'`) puis seulement ensuite la fiche jetable est
supprimée — dans cet ordre, la contrainte de clé étrangère ne casse jamais et l'historique de la
demande reste lisible après coup, plutôt que de dépendre d'une suppression en cascade qui
l'effacerait avec la fiche.

**Suppression, pas archivage.** Le reste de l'application n'efface jamais une fiche — elle
l'archive (cf. le commentaire de `journal_statuts`, phase 1b : « l'application archive et ne
supprime jamais »). Le rattachement D26 et l'annulation D42 (§7.2) sont les **deux seules**
exceptions délibérées à cette règle, et toutes deux sont étroites de la même façon : la fiche
supprimée vient d'être créée dans le même parcours, ne porte ni statut, ni journal, ni place
dans l'arbre — rien qui puisse se perdre. C'est exactement le raisonnement que D26 porte déjà
dans la spécification maîtresse, et que D42 lui applique par cohérence ; ce document se
contente de signaler que ce sont, concrètement, les deux seuls `delete` sur `membres` de tout le
projet. Ils diffèrent dans leur mécanique : D26 repointe `demandes_membre.membre_id` à la main
avant de supprimer, pour garder l'historique lisible malgré l'ordre des écritures ; D42 laisse
`on delete set null` faire ce travail, parce que la ligne `demandes_membre` n'a ici besoin
d'aucune fiche définitive vers laquelle se repointer — il n'y en a pas.

### 7.4 Notifications

Émises par les Server Actions ci-dessus (jamais par un déclencheur — pas de règle métier en
base au-delà des contraintes et des garde-fous, cohérent avec le découpage en couches du §3.1
de la spécification maîtresse). Lues via la RLS du §5.5. Marquer comme lue : une Server Action
`marquerNotificationLue(id)` qui met à jour `lu_le` avec `.eq('profil_id', callerId)` — si aucune
ligne n'est touchée (notification d'autrui ou inexistante), l'appel échoue silencieusement côté
base mais la Server Action vérifie le compte de lignes modifiées avant de rendre un succès, même
garde que `lierFiche` en 1c contre une mise à jour qui ne toucherait aucune ligne.

---

## 8. Écrans

| Écran | Accès | Contenu |
|---|---|---|
| `/tokens` | Administrateur | Génération (mode, cible si nominatif, expiration proposée à 7 jours et modifiable — D37), liste (mode, cible, créé le, expire le, révoqué le, utilisé le/par), révocation. Code en clair affiché une seule fois, au retour de l'action de génération — même mécanique que le mot de passe temporaire de `creerCompte` (pas de `redirect`, l'état de retour porte le code) |
| `/inscription` | Public, sans session | Formulaire unique (D30) : code, identifiant, mot de passe, nom, prénom, téléphone, ville, antenne (D35) |
| Formulaire de demande de suivi | Tout compte actif | Informations de la personne proposée |
| `/demandes` | Administrateur | Liste des demandes `en_attente`, actions du §7.3 selon `origine` |
| `/demandes` (lecture de ses propres demandes) | Le demandeur, pour ses propres lignes | État de sa demande, bouton d'annulation tant qu'`en_attente` (D40, RLS §5.5) |
| Cloche + page « à traiter » | Tout compte actif | Ses notifications, lien vers `/demandes/{id}` le cas échéant, marquer comme lue |

---

## 9. Sécurité

**`/inscription` est la seule page de l'application qui n'appelle pas `exigerProfilActif()`**,
par construction — il n'existe pas de session à ce stade. Ce n'est pas un oubli du garde
commun : c'est une exception unique, à documenter explicitement dans `garde.ts` pour qu'elle ne
soit jamais lue comme une régression future. La fermeture de cette page ne repose sur aucun
appel à `garde.ts` : elle repose entièrement sur l'absence de politique RLS ouverte à `anon`
(§6) et sur les privilèges `EXECUTE` retirés de `service_role` seul.

`/tokens` et les actions de validation/rejet de `/demandes` passent par `exigerAdministrateur`,
comme `/comptes` en 1c. Le formulaire de demande de suivi et la lecture des notifications
passent par `exigerProfilActif` seul — n'importe quel compte actif y a droit, par la matrice du
§5.2 de la spécification maîtresse.

Aucune nouvelle fonction n'est ajoutée à `garde.ts` : la portée d'autorité (`exigerAutoriteSur`)
ne s'applique pas ici, ces circuits ne touchent jamais aux statuts d'un membre. La protection
« cette notification est bien la mienne » est un filtre de ligne dans la requête elle-même
(`.eq('profil_id', callerId)`), pas une décision d'autorité au sens du §5.1 — elle n'a donc pas
sa place dans `garde.ts`, dont la documentation dit qu'il est le passage obligé de l'autorité
sur un **membre**, pas de la propriété d'une ligne quelconque.

**Cette phase ne touche pas à la protection du dernier administrateur.** Aucun des quatre
circuits ne rétrograde, ne désactive ni ne supprime un compte administrateur : la limite
signalée en 1c (protection non éprouvée par aucun test, faute de pouvoir atteindre sa condition
sur une base portant un administrateur réel — voir §12) n'est ni aggravée ni réduite par la 2b.

---

## 10. Tests et preuves exigées

**Vitest** — le nécessaire est mince ici : le calcul du dirigeant proposé et la portée
d'autorité sont déjà éprouvés en 1c et réutilisés tels quels pour la validation d'une demande de
suivi. Ce qu'il reste à couvrir en pur TypeScript : la construction du hachage du code (aucune
dépendance base), et la discrimination sur les marqueurs d'erreur (`token_invalide`,
`trop_de_tentatives`, chacun mappé sur son message, jamais sur une correspondance de texte —
même règle que le reste du projet).

**RLS**, pour chacune des quatre tables — avec, sur **chaque** vérification par recherche, un
**contrôle positif** : un compte non privilégié ne lit ni les tokens, ni les demandes d'autrui,
ni les notifications d'autrui ; le rôle `anon` ne lit rien du tout sur aucune des quatre ; le
demandeur lit **ses propres** demandes (positif) mais pas celles d'un autre demandeur (négatif) ;
l'administrateur lit tout. Chaque test de refus est accompagné d'un test qui prouve que le même
compte lit bien ce qu'il a le droit de lire par ailleurs — la leçon de la 1b et de la 1c :
un refus qu'on n'a pas prouvé fonctionner par ailleurs ne prouve rien.

**Preuve par mutation exigée**, avec un **test qui constate une écriture réelle en base** quand
la barrière tombe (jamais un simple refus), sur :

- le `revoke execute` de `consommer_token_inscription` et de `relacher_token_inscription` à
  `anon`/`authenticated` ;
- le plafond de tentatives : abaisser temporairement le seuil ou insérer des lignes de
  `tentatives_token_inscription`, constater le refus `trop_de_tentatives`, restaurer, rejouer le
  contrôle positif ;
- le verrou de ligne (D31) : appeler `consommer_token_inscription` **deux fois de suite avec le
  même code**, dans le même test, et constater que la seconde échoue avec `token_invalide` —
  preuve d'une écriture réelle et unique en base (`utilise_le` posé une fois), pas seulement
  d'un refus. La **vraie course concurrente** (deux appels strictement simultanés) reste hors de
  portée de l'outillage de ce projet, exactement comme le verrou consultatif de l'arbre en 1c
  (Task 1) : la dette est de même nature et doit être documentée de la même façon, pas passée
  sous silence ;
- la fonction de rattachement (D26) : constater que la fiche `en_attente` a réellement disparu
  de la base après validation-par-rattachement, pas seulement que l'appel n'a pas levé d'erreur ;
- la politique `membres_lecture` amendée (§6) : un compte sans lien avec la demande ne lit pas
  la fiche `en_attente` d'un autre, contrôle positif : le demandeur, lui, la lit ;
- **l'atomicité de `annuler_demande_membre` (D42)**, explicitement exigée par le cadrage de cette
  décision. Deux preuves distinctes, pas une seule :
  - **contrôle positif de l'état final** : après un appel réussi, relire en base **les deux
    effets dans le même test** — `demandes_membre.etat = 'annulee'` **et** l'absence de la ligne
    `membres` correspondante (`select` rendant zéro ligne). Un test qui ne vérifierait que l'un
    des deux ne prouverait pas l'atomicité, seulement qu'une moitié a eu lieu ;
  - **preuve par mutation de l'atomicité elle-même** : insérer temporairement un
    `raise exception` entre l'étape 2 (mise à jour de `etat`) et l'étape 3 (suppression de la
    fiche) du corps de la fonction, rejouer l'appel, et constater que **ni** la mise à jour
    **ni** la suppression n'ont persisté — `etat` toujours `'en_attente'`, la fiche toujours
    présente. C'est la preuve que les deux écritures sont réellement couplées dans une seule
    transaction, et non deux instructions qui réussissent presque toujours ensemble sans y être
    obligées. Restaurer la fonction et revérifier `pg_get_functiondef` identique, comme pour
    toute preuve par mutation du projet.

**Playwright** — le §8 de la spécification maîtresse désigne déjà deux des quatre parcours
canoniques du projet comme appartenant à cette phase : **« inscription par token »** et
**« validation d'une demande de suivi »**. Les deux doivent couvrir, par requête forgée et
vérification en base de l'absence d'écriture (jamais seulement l'absence d'un bouton à l'écran),
au moins : un compte non-administrateur qui tente d'appeler la Server Action de validation ou de
génération de token échoue et n'écrit rien ; un code déjà consommé, soumis une seconde fois,
échoue avec le message indifférencié et n'écrit rien de plus.

---

## 11. Pièges connus, tirés du registre de la 1c

1. **Un test qui ne prouve pas ce que son nom annonce.** Motif dominant de la 1c (Tasks 1, 2, 7,
   8, 11 du registre) : une assertion négative sur une valeur dont on n'a pas prouvé qu'on l'a
   vraiment lue reste verte quand elle regarde du vide. À appliquer particulièrement au test du
   plafond de tentatives et à celui du verrou de ligne : vérifier l'**état final en base**, pas
   seulement l'absence d'erreur ou sa présence.
2. **Un commentaire ou une étiquette qui promet plus que le code ne tient.** La documentation de
   `revoque_le` et de `tentatives_token_inscription` doit être relue avec cette question : le
   commentaire affirme-t-il quelque chose que le code ne garantit pas réellement ?
3. **Le compte racine n'a pas de membre lié.** S'il soumettait une demande de suivi (le rôle le
   permet), `demandeur_profil_id` référerait un profil dont `membre_id` est `NULL` — cas à
   traiter explicitement dans l'affichage de `/demandes`, comme `arbre.ts` l'a déjà fait pour la
   portée d'autorité.
4. **Vérifier depuis chaque rôle.** `/demandes` et `/tokens` sont des écrans à visibilité
   différenciée (administrateur contre demandeur contre tout autre compte) ; les trois doivent
   être éprouvés séparément, pas seulement depuis l'administrateur.
5. **Un correctif qui supprime une erreur bruyante fabrique parfois sa réciproque.** Si le
   plafond de tentatives ou le marqueur `token_invalide` sont ajustés en cours d'implémentation,
   relire qui d'autre empruntait le même chemin d'erreur avant de le rendre silencieux.
6. **La suite de tests écrit dans la base qui sert aussi de production** (voir §12) : les preuves
   par mutation sur `consommer_token_inscription` retirent temporairement une contrainte de
   privilège ou insèrent des lignes dans `tentatives_token_inscription` sur ce même projet.
7. **Le nettoyage des comptes de test est fragile sous parallélisme**, constaté à plusieurs
   reprises en 1c (`supprimerCompte` qui ignore l'erreur de `deleteUser`). L'inscription publique
   crée des comptes du même genre : les suites e2e de cette phase doivent vérifier leur propre
   nettoyage par un comptage indépendant, pas seulement faire confiance à l'absence d'erreur.

---

## 12. Contraintes d'environnement, rappelées

- **Un seul projet Supabase sert au développement et à la production.** Les suites de tests y
  écrivent réellement, et les preuves par mutation y suppriment temporairement des privilèges ou
  des vérifications. Cette phase ajoute trois nouvelles cibles de mutation sur ce projet unique :
  le `revoke execute` de la fonction de consommation, le seuil du plafond de tentatives, et
  l'exception insérée dans `annuler_demande_membre` pour éprouver son atomicité (§10). Le même
  soin que la 1c doit être apporté à restaurer l'état exact après chaque preuve, et à le vérifier
  (`pg_get_functiondef` ou équivalent), pas seulement à l'affirmer.
- **La protection du dernier administrateur reste non éprouvée par aucun test**, faute de
  pouvoir atteindre sa condition sur une base portant un administrateur réel (compte racine
  intouchable, décision utilisateur documentée en 1c, Task 12). La 2b ne touche à aucun code de
  cette zone (§9) : la limite est héritée telle quelle, ni aggravée ni réduite.

---

## 13. Ce que la phase ne livre pas, et pourquoi

- **Envoi d'emails ou de SMS.** Hors périmètre du projet entier (§2 de la spécification
  maîtresse) : les notifications restent strictement in-app.
- **Fusion générale de fiches.** D26 le tranche explicitement ; seul le cas étroit de
  l'auto-inscription en double est traité, par suppression d'une fiche jetable sans historique.
- **Gel d'un token après échecs répétés.** D25 l'exclut explicitement, pour ne pas offrir à un
  tiers le moyen d'empêcher quelqu'un de s'inscrire.
- **Purge automatique de `tentatives_token_inscription`.** Le projet n'a pas d'infrastructure de
  tâche planifiée (cf. D28) ; la table grandit sans borne, ce qui reste acceptable au volume
  attendu mais devra être revisité si le volume change.
- **Protection contre un canal de synchronisation par le temps** sur les quatre branches de refus
  de `/inscription` (§6). Le code emprunte le même chemin SQL dans les quatre cas, ce qui limite
  l'écart, mais rien ne l'égalise ni ne le mesure dans cette phase.
- **Deuxième projet Supabase pour isoler les tests.** Refusé en 1c (Task 12, décision
  utilisateur) ; la 2b hérite du même choix sans le rouvrir.

---

## 14. À trancher

Aucun point ouvert. Les sept points soulevés par la première rédaction de ce document (valeurs
du plafond de tentatives, durée de validité par défaut d'un token, longueur et alphabet du code,
champs du formulaire public, robustesse du mot de passe choisi, annulation d'une demande par son
auteur, devenir d'une notification dont l'objet est traité) sont devenus D35 à D41 ; le point
apparu en intégrant D40 — le devenir de la fiche `en_attente` d'une demande annulée — est devenu
D42. Les huit sont tranchés, tous par décision utilisateur explicite du 2026-08-13, et exposés
au §3.
