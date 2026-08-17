# Phase 7 — Le contact, la page de profil, et « Mes membres »

**Date :** 2026-08-17
**Statut :** design proposé, prêt pour revue avant plan d'implémentation
**Spécification maîtresse :** `2026-08-11-suivi-asonkeng-design.md` — ce document ne la remplace
pas. Il ajoute une troisième relation à la fiche membre (§4.2), ouvre le **premier chemin
d'écriture non administrateur** du projet (§5.2), et livre l'écran de suivi personnel que le
§5.1 décrit sans jamais l'avoir rendu.

---

## 1. Objet

Trois demandes de l'utilisateur, arbitrées le 2026-08-17 :

1. **Un champ « contact »** sur la fiche de chaque membre, en plus du faiseur de disciple et du
   dirigeant — « pour savoir qui a une bonne relation avec la personne ». Saisissable **à la
   création comme à la modification**.
2. **Une page de profil** pour chaque compte.
3. **Une partie « gestion de mes membres »**, donnant à chacun la vue sur ses disciples et sur
   les personnes dont il est dirigeant, avec des **sections distinctes** : contact, disciples
   directs, disciples de disciples, ceux dont on est dirigeant.

### 1.1 Ce que la phase livre en trois lots

| Lot | Contenu | Ce qu'il ouvre de neuf |
|-----|---------|------------------------|
| **A** | Le champ contact | Une colonne, une signature SQL à faire évoluer, trois écrans à toucher. **Aucun droit nouveau.** |
| **B** | Page de profil et auto-édition | **Le premier chemin d'écriture non administrateur du projet.** Nouvelle passerelle SQL, nouveaux tests RLS. |
| **C** | « Mes membres » | Quatre portées de lecture dont une récursive, les gestes de statut depuis la liste, une synthèse AEL/évènements par personne. |

**L'utilisateur a explicitement retenu une phase unique** plutôt que trois phases successives,
après que le découpage en trois lui a été recommandé. Les trois lots restent **nettement
séparés dans ce document et dans le plan qui en découlera**, pour que la revue de sécurité du
lot B reste identifiable et ne se dilue pas dans le reste. C'est la seule contrepartie
obtenue ; elle est structurelle, pas cosmétique.

**Dépendance interne :** C dépend de A (la section « ceux dont je suis contact » n'existe pas
sans la colonne). B est autonome. L'ordre d'implémentation est donc **A → B → C**, ou **A → C**
et **B** en parallèle.

---

## 2. Décisions déjà prises par l'utilisateur, et non rouvertes

Chacune a été posée en question fermée pendant le cadrage du 2026-08-17, avec ses conséquences
énoncées **avant** l'arbitrage. Elles ne sont pas rouvertes par le plan.

- **Le contact est une référence à UNE SEULE fiche membre** — une colonne `contact_id`, pas une
  table de liaison, pas un texte libre.
- **Le contact ne donne AUCUN droit et AUCUNE lecture élargie.** L'utilisateur a d'abord retenu
  « lecture seule élargie », puis a tranché pour « rien de plus » une fois établi que la
  politique `membres_lecture` ouvre déjà **toutes les fiches actives à tout compte actif** : une
  lecture élargie n'aurait rien changé sur une fiche active et n'aurait ajouté que la visibilité
  des fiches archivées et en attente.
- **Seul l'administrateur désigne un contact.**
- **Le contact est saisissable à la création d'un membre**, pas seulement en modification.
- **La page de profil porte les quatre blocs** : identité du compte, sa propre fiche membre,
  ses gestes de compte, et l'auto-édition.
- **L'auto-édition porte sur les coordonnées de la fiche et la situation**, et **pas** sur le
  nom d'affichage du compte : retiré par l'utilisateur après que le risque d'usurpation dans
  `journal_statuts.par_nom_affichage` lui a été exposé.
- **« Mes membres » distingue quatre sections** et n'en fusionne aucune.
- **Depuis « Mes membres », on gère les statuts, on voit la synthèse AEL et évènements, et on
  accède au raccourci « proposer une personne à suivre ».**

---

## 3. Décisions prises pendant ce cadrage

> **Numérotation.** Les numéros de décision sont globaux au projet. La phase 6 s'arrête à
> **D129** ; cette table reprend à **D130**. Rappel de la règle en vigueur : **D36 à D43 sont
> attribués deux fois** (phase 2b et phase 3), et toute citation d'un de ces huit numéros doit
> nommer sa phase.

### Lot A — le contact

- **D130 — Le contact est une colonne ordinaire de la fiche, pas une relation d'arbre.**
  `contact_id` entre dans `FicheMembre` (`src/lib/domaine/membre.ts`), aux côtés d'`antenneId`,
  et traverse `normaliserFicheMembre` → `ficheMembreVersColonnes` → l'`update` de
  `modifierMembre`. Il n'est **pas** confié à `public.definir_arbre` : cette fonction prend le
  verrou consultatif anti-cycle `pg_advisory_xact_lock(20260814, 1)` et incarne la filiation. Y
  glisser le contact affirmerait que le contact est de l'arbre, ce qui est faux.
  **Conséquence directe et voulue :** le champ est saisissable à la création **sans mécanisme
  supplémentaire**, puisque `creer_membre_enrichi` écrit déjà les colonnes de `FicheMembre` dans
  son `insert`.

- **D131 — Aucun déclencheur anti-cycle sur `contact_id`, et c'est un choix, pas un oubli.**
  Le contact n'est pas hiérarchique : que A soit le contact de B **et** B celui de A est
  légitime et attendu. Aucune fonction récursive du projet ne parcourt `contact_id` —
  `public.ancetres_membre`, `public.chemin_arbre` et la future `public.descendants_membre`
  (D141) ne suivent que `faiseur_de_disciple_id`. Une seule contrainte est posée, et elle ne
  concerne que le cas dégénéré : `membres_pas_son_propre_contact`.

- **D132 — Aucune modification de RLS pour le contact.** La politique `membres_lecture` n'est
  pas touchée. C'est l'application directe de la décision de l'utilisateur au §2.

- **D133 — « Contact » désigne la personne ; l'e-mail devient « Adresse de contact » partout.**
  Aujourd'hui `email_contact` s'affiche « Contact » sur la fiche
  (`src/app/membres/[id]/page.tsx:91`) et « Adresse de contact » dans le formulaire
  (`formulaire-membre.tsx:144`) — deux noms pour une même donnée. La fiche adopte le libellé du
  formulaire, et le mot « Contact », seul, revient à la personne. Sans cet arbitrage, la fiche
  porterait **deux lignes nommées « Contact » désignant deux choses différentes**.

- **D134 — La ligne « Contact » de la fiche ne porte PAS `rail-filiation`.** Le commentaire D106
  en tête du `<dl>` de `/membres/[id]` déclare **trois** emplacements légitimes de cette marque
  sur cette fiche, et uniquement trois, tous des relations de discipulat : faiseur de disciple,
  dirigeant (dérivé du précédent), disciples actifs. Le contact n'est pas une relation de
  discipulat. Le commentaire D106 est **mis à jour pour dire que le contact en est exclu** —
  sans quoi le prochain lecteur croira à un oubli et « corrigera » l'absence de marque.

- **D135 — La signature de `creer_membre_enrichi` est refaite, pas remplacée en place.**
  `create or replace function` **ne peut pas changer une signature**. La migration doit
  `drop function public.creer_membre_enrichi(<les 15 types actuels>)` puis créer la version à
  16 paramètres, et **refaire ses `revoke` et son `grant to service_role`** — un `grant` perdu
  rendrait la création de membre inopérante en production, sans erreur au déploiement de la
  migration. La signature complète est répétée quatre fois dans le fichier de la phase 5
  (`20260819120000_creer_membre_enrichi.sql`) : les quatre occurrences changent.

- **D136 — Un contrôle amont nomme le contact introuvable ; la clé étrangère protège.**
  Avant l'écriture, on vérifie que le contact désigné existe et est actif, pour rendre un
  message nommé (`MESSAGE_CONTACT_INCONNU`) plutôt que de laisser une violation `23503`
  retomber sur `MESSAGE_ECHEC_ENREGISTREMENT`. Même partage que partout dans ce dépôt : **le
  contrôle amont explique, la contrainte protège.** Le contrôle amont n'est pas la barrière —
  une désignation concurrente passerait ici et serait arrêtée par la clé étrangère.

### Lot B — profil et auto-édition

- **D137 — L'auto-édition passe par une passerelle SQL `public.modifier_mon_profil`, et
  l'identifiant de cible ne vient JAMAIS du formulaire.**
  Signature : `(p_profil uuid, p_telephone text, p_email_contact text, p_ville text,
  p_pays text, p_situation public.situation_membre, p_domaine_etude text)`,
  `security definer`, `set search_path = ''`, `revoke` à tous et `grant execute to service_role`.
  `p_profil` vaut `profil.id`, issu de la **session**, et la passerelle retrouve elle-même
  `membre_id` depuis `public.profils`. Aucun identifiant de cible n'est acceptable depuis le
  client.

  **Le motif retenu n'est PAS l'atomicité.** Il l'était tant que le nom d'affichage figurait
  dans la liste — deux tables, une transaction. Le nom d'affichage retiré (§2), la passerelle
  n'écrit plus qu'une seule table, et l'argument tombe. **Ce qui reste, et qui suffit : la
  signature EST la liste blanche.** Un `update` applicatif ne garantit la liste des colonnes
  écrites que par relecture du code, et une clé ajoutée un jour à l'objet passé à `.update()`
  écrirait la colonne correspondante sans que rien ne s'y oppose. Une signature typée à sept
  paramètres ne peut pas écrire une huitième colonne.

- **D138 — La liste des colonnes fermées à l'auto-édition est écrite, pas sous-entendue.**
  Ne sont écrits par **aucune** voie non administrateur : `nom`, `prenom`, `antenne_id`,
  `faiseur_de_disciple_id`, `dirigeant_id`, `dirigeant_force`, `contact_id`,
  `report_initial_ael`, `etat`, `cree_par`, ainsi que **toute** colonne de `public.profils`
  (`identifiant`, `nom_affichage`, `est_racine`, `actif`, `membre_id`) et **toute** ligne de
  `public.roles_profil`. La passerelle de D137 ne les prend pas en paramètre : la fermeture est
  structurelle, pas déclarative.

- **D139 — Un profil sans fiche membre affiche un encart qui le DIT.**
  `profil.membreId` vaut `null` pour le compte racine (contrainte `profils_racine_sans_membre`)
  et pour tout compte non encore lié. La page rend alors un encart explicite et **aucun
  formulaire d'auto-édition** — il n'y a aucune fiche à modifier. Une page à moitié vide
  laisserait croire à une fiche vide plutôt qu'à une absence de fiche.

- **D140 — Aucune politique d'écriture RLS n'est ouverte.** Le socle du projet n'en compte
  aucune, sur aucune table : toutes les écritures passent par des Server Actions et la clé de
  service. Ce lot ne fait pas exception. Ce qui change, c'est **le garde applicatif** de cette
  écriture-ci : `exigerProfilActif` et non `exigerAdministrateur` — et c'est précisément ce que
  la revue de sécurité de ce lot doit examiner.

### Lot C — « Mes membres »

- **D141 — `public.descendants_membre` est le miroir de `ancetres_membre`, et rend des
  IDENTIFIANTS, jamais des noms.**
  Récursive, `security definer`, `set search_path = ''`, réservée à `service_role`. Elle termine
  parce que le déclencheur `membres_anti_cycle` garantit l'absence de cycle sur
  `faiseur_de_disciple_id`.
  **La forme de l'arbre est lue affranchie de la RLS ; les noms sont relus SOUS RLS et filtrés
  `etat = 'actif'` explicitement**, via `nomsMaillonsActifs` (`src/lib/donnees/arbre-lots.ts`),
  qui existe déjà. C'est la règle D93/D98 établie par `/arborescence`, reprise sans être
  réinventée. **Aucun nom lu avec la clé de service n'atteint l'écran.** Une lecture de la
  descendance soumise à la RLS s'arrêterait au premier maillon archivé et **amputerait la
  descendance en silence** ; une lecture des noms affranchie de la RLS montrerait à un compte
  ordinaire des fiches que l'annuaire lui cache.

- **D142 — Les quatre sections se recouvrent, et on ne déduplique pas.**
  Une même personne peut être à la fois un disciple direct et quelqu'un dont je suis dirigeant.
  Les quatre sections répondent à **quatre questions différentes** ; n'afficher une personne que
  dans « la plus forte » effacerait l'information « je suis aussi son contact ». Le recouvrement
  est donc **assumé et documenté à l'écran**, pas subi.

- **D143 — Les gestes de statut sont disponibles dans trois sections sur quatre, et la
  quatrième dit pourquoi.**
  `peutModifier` (`src/lib/domaine/arbre.ts:57`) donne autorité à l'administrateur, à l'ancêtre
  **à toute profondeur**, et au **dirigeant désigné**. Les sections « disciples directs »,
  « disciples de disciples » et « dont je suis dirigeant » sont donc déjà couvertes par
  `exigerAutoriteSur`, **sans qu'aucune règle d'autorité ne soit modifiée**. La section « dont
  je suis contact » ne l'est pas — conséquence directe de la décision « le contact ne donne
  aucun droit ». Elle porte **une mention qui l'explique**, plutôt qu'un bouton absent sans
  raison visible : une absence muette se lit comme un défaut.

- **D144 — La synthèse AEL et évènements est lue EN LOT, jamais une requête par ligne.**
  `compteurs_ael` et `seminaires_assistes` sont interrogées par `.in('membre_id', ids)` sur les
  identifiants de la page courante. Un écran à quatre sections qui ferait deux requêtes par
  ligne produirait des dizaines d'allers-retours pour un seul affichage.

- **D145 — Chaque section est paginée**, via le `PageLue` et les utilitaires de
  `src/lib/donnees/pagination.ts`. La descendance d'un membre bien placé dans l'arbre n'a pas de
  borne connue, et le plafond `max_rows` de PostgREST (1000, `supabase/config.toml`) **tronque
  silencieusement** toute lecture non paginée — le défaut déjà rencontré et corrigé sur
  `membresDesAntennesParLots`.

- **D146 — Un compte sans fiche membre voit un encart, pas quatre listes vides.**
  Même raisonnement que D139 : quatre listes vides feraient croire à un membre sans disciples
  au lieu d'un compte sans fiche.

---

## 4. Lot A — le champ contact

### 4.1 Base

Migration `supabase/migrations/20260820100000_contact_membre.sql` :

```sql
alter table public.membres
  add column contact_id uuid references public.membres (id) on delete set null;

alter table public.membres
  add constraint membres_pas_son_propre_contact check (contact_id is distinct from id);

create index membres_contact_id_idx on public.membres (contact_id);
```

`on delete set null`, comme `faiseur_de_disciple_id` et `dirigeant_id` : la suppression d'une
fiche ne doit pas échouer parce qu'elle était le contact de quelqu'un. L'index sert la
section 4 de « Mes membres » (`contact_id = ma fiche`).

Un `comment on column` dit ce que la colonne signifie **et ce qu'elle ne donne pas** : « Personne
en bonne relation avec ce membre. Purement informatif : n'entre dans aucun calcul d'autorité
(`peutModifier`), n'ouvre aucune lecture (`membres_lecture` inchangée), et n'est parcouru par
aucune fonction récursive de l'arbre. »

Même migration, ou migration jumelle : le remplacement de `public.creer_membre_enrichi` selon
D135 — `drop function` de la signature à 15 paramètres, `create` de la signature à 16 avec
`p_contact uuid` écrit dans l'`insert` de la fiche, puis `revoke`/`grant` refaits.

### 4.2 Domaine

`FicheMembre` gagne `contactId: string | null`. `normaliserFicheMembre` le lit par
`texteOptionnel` — comme `antenneId`, sans validation de format : la clé étrangère est juge.
`ficheMembreDepuisFormData` lit `donnees.get('contactId')`. `ficheMembreVersColonnes` rend
`contact_id`.

Preuves Vitest sur `src/lib/domaine/membre.test.ts` : un contact absent, un contact vide (→
`null`), un contact renseigné, et le refus d'une valeur non textuelle.

### 4.3 Données

`MembreDetail` gagne `contactId: string | null` ; `COLONNES_DETAIL` gagne `contact_id`.
`COLONNES_LISTE` **n'est pas touchée** : l'annuaire n'affiche pas le contact.

### 4.4 Écrans

- **`FormulaireMembre`** reçoit un `SelecteurMembre` « Contact », avec
  `exclureId={membre?.id ?? null}` et une aide « Facultatif. Une personne en bonne relation avec
  ce membre. » Comme le composant sert `/membres/nouveau` **et** `/membres/[id]/modifier`, le
  champ apparaît aux deux endroits d'un seul geste.
  ⚠️ **Tous les champs de ce formulaire sont contrôlés (D85)** : le contact suit la règle — un
  `useState` local, pas de `defaultValue`.
- **`creerMembreEnrichi`** passe `p_contact: fiche.contactId` à la RPC, en argument **nommé**.
- **`modifierMembre`** n'a rien à changer : il écrit `ficheMembreVersColonnes(...)`.
- **`/membres/[id]`** gagne une ligne « Contact » rendue par `libelleFiche` — donc « Fiche non
  consultable » et non « — » si l'identifiant existe mais que la fiche est cachée à ce compte
  (D98/D100). **Sans `rail-filiation`** (D134), et le commentaire D106 du `<dl>` est mis à jour.
  La ligne existante `['Contact', membre.emailContact]` devient `['Adresse de contact', …]`
  (D133).
- **`BlocEnrichissement` et `/membres/[id]/arbre` ne sont pas touchés** (D130).

---

## 5. Lot B — page de profil et auto-édition

### 5.1 Route et contenu

Route `/profil`, gardée par `exigerProfilActif`.

1. **Identité du compte** — `identifiant`, `nomAffichage`, rôles (`rolesDuProfil`), date de
   création, état actif. Le nom d'affichage est **affiché, pas éditable** (§2).
2. **Sa fiche membre** — si `profil.membreId` est `null`, l'encart de D139 et rien d'autre.
   Sinon : le récapitulatif de la fiche, ses faiseur de disciple / dirigeant / **contact**, son
   compteur AEL, ses statuts, et un lien vers `/membres/[id]`.
3. **Gestes de compte** — liens vers `/changer-mot-de-passe` et `/notifications`, et le bouton
   de déconnexion (`seDeconnecter`).
4. **Auto-édition** — un formulaire limité à six champs : téléphone, adresse de contact, ville,
   pays, situation, domaine d'étude. Le domaine d'étude suit la règle existante : il n'existe
   que pour la situation « étudiant », et `normaliserFicheMembre` le remet à `null` hors de ce
   cas.

### 5.2 Le chemin d'écriture

```
/profil (formulaire contrôlé)
  → Server Action `modifierMonProfil`  ─ garde : exigerProfilActif
      → clientAdmin().rpc('modifier_mon_profil', { p_profil: profil.id, … })
          → public.modifier_mon_profil  ─ security definer, service_role
              → update public.membres set … where id = (select membre_id from profils where id = p_profil)
```

Trois propriétés que le plan doit vérifier explicitement :

- **`p_profil` vient de la session, jamais du `FormData`.** Un identifiant de cible accepté
  depuis le client transformerait cette action en « modifier la fiche de n'importe qui ».
- **La passerelle résout `membre_id` elle-même.** Elle ne le reçoit pas.
- **Un profil sans `membre_id` fait lever la passerelle** avec `detail = 'profil_sans_membre'`,
  et ne se contente pas d'un `update` à zéro ligne — un geste sans effet ne doit pas passer pour
  un succès (même discipline que `changerEtatMembre` et que `prive.retirer_statut`).

La Server Action journalise `code`, `message`, et `details` **uniquement s'il figure dans une
liste fermée de marqueurs connus** — jamais la valeur brute : `public.membres` porte des
contraintes `check` dont la violation fait porter à `error.details` la valeur
`Failing row contains (…)`, c'est-à-dire **la fiche entière**. Le défaut a déjà été rencontré et
refermé deux fois dans ce dépôt (`creerMembreEnrichi`, `definirArbre`) ; on ne le rouvre pas.

### 5.3 Tests du lot B

Tests RLS dédiés (`tests/rls/profil-personnel.test.ts`) :

- un compte ordinaire modifie sa propre fiche par la passerelle → succès ;
- la même passerelle appelée avec le `p_profil` **d'un autre compte** modifie la fiche de cet
  autre compte — **c'est attendu**, la passerelle fait confiance à son appelant, et c'est la
  Server Action qui garantit la provenance ; le test **documente** cette frontière plutôt que de
  la laisser implicite ;
- `authenticated` n'a **pas** le droit d'exécuter `modifier_mon_profil` ;
- aucune des colonnes de D138 n'est modifiée par un appel réussi ;
- un profil sans `membre_id` fait lever `profil_sans_membre`.

---

## 6. Lot C — « Mes membres »

### 6.1 Route et structure

Route `/mes-membres`, gardée par `exigerProfilActif`. Un compte sans fiche membre voit l'encart
de D146.

Quatre sections, dans cet ordre, chacune avec son propre titre, son propre compte et sa propre
pagination :

| # | Section | Critère | Gestes de statut |
|---|---------|---------|------------------|
| 1 | Mes disciples directs | `faiseur_de_disciple_id = ma fiche` | oui |
| 2 | Disciples de mes disciples | descendance au-delà du 1ᵉʳ niveau, ligne annotée « via *X* » | oui |
| 3 | Ceux dont je suis dirigeant | `dirigeant_id = ma fiche` | oui |
| 4 | Ceux dont je suis contact | `contact_id = ma fiche` | **non** (D143) |

Toutes les sections filtrent `etat = 'actif'` **explicitement**, pas seulement par la RLS : la
politique laisse un administrateur voir les fiches archivées, or « mes membres » est la liste
des personnes en cours de suivi. Sans ce filtre, un administrateur y verrait des fiches
archivées que les autres comptes n'y voient pas, et l'écran mentirait sur sa propre légende.

### 6.2 La descendance

```sql
create function public.descendants_membre(p_membre uuid)
returns table (membre_id uuid, parent_id uuid, profondeur integer)
```

Récursive sur `faiseur_de_disciple_id`, `security definer`, `search_path = ''`, réservée à
`service_role`. Elle rend aussi le **parent** de chaque descendant, ce qui permet l'annotation
« via *X* » sans seconde remontée, et la **profondeur**, qui permet d'exclure le niveau 1 (déjà
rendu par la section 1) sans le recalculer côté application.

Les noms sont ensuite relus **sous RLS et filtrés `etat = 'actif'`** par `nomsMaillonsActifs`
(D141). Le nom du parent passe par `libelleFiche` : un parent devenu invisible affiche
« Fiche non consultable », jamais un blanc.

### 6.3 Synthèse et gestes

Par personne affichée : le compteur AEL et le dernier séminaire assisté, lus **en lot** (D144).
Les statuts portés le sont aussi.

Les gestes de statut réutilisent `attribuerStatut` / `retirerStatut`
(`src/app/membres/[id]/statuts/actions.ts`) **telles quelles**, avec leur garde
`exigerAutoriteSur` : aucune action nouvelle, aucune règle d'autorité modifiée. Masquer un
bouton ne protège rien — c'est le garde de l'action qui protège, et il est déjà en place.

Un raccourci vers `/demandes/nouvelle` figure en tête d'écran.

---

## 7. Transverse

- **Navigation.** Deux lignes de plus dans la `Liste variante="navigation"` du tableau de bord :
  « Mon profil » (`/profil`) et « Mes membres » (`/mes-membres`), visibles de **tout compte
  actif** — ce ne sont pas des écrans d'administration. Le sous-titre « Connecté en tant que… »
  devient un lien vers `/profil`.
- **Composants.** Aucun composant nouveau n'est prévu. `EnTetePage`, `Carte`, `Liste`,
  `LigneListe`, `Pagination`, `Champ`, `Selecteur`, `Formulaire` et `SelecteurMembre` couvrent
  les trois lots. Si un motif se répète trois fois ou plus pendant l'implémentation, le seuil
  d'extraction de D110 s'applique — pas avant.
- **Le rail de filiation.** `rail-filiation` reste réservé aux relations de discipulat. Dans
  « Mes membres », les sections 1, 2 et 3 le portent ; la section 4 ne le porte pas.
- **Portes de test.** Vitest à chaque commit. **Les portes lentes — suite e2e (≈ 7,5 min, 88
  tests sérialisés) et `next build` — tournent une fois par lot**, conformément à la politique
  du projet, pas avant chaque commit.

### 7.1 Couverture de test attendue

| Lot | Vitest | RLS | e2e |
|-----|--------|-----|-----|
| A | `normaliserFicheMembre` avec contact | contact écrit à la création et en modification ; `membres_lecture` **inchangée** | saisie du contact à la création, puis lecture sur la fiche |
| B | — | `tests/rls/profil-personnel.test.ts` (§5.3) | `/profil` : auto-édition d'une coordonnée, et absence de tout champ fermé |
| C | composition des quatre sections, exclusion du niveau 1 de la descendance | `descendants_membre` : réservée à `service_role`, et aucun nom lu affranchi de la RLS | `/mes-membres` : les quatre sections, la mention de la section 4, la pagination |

---

## 8. Ce que la phase ne fait pas

- **Le contact ne devient pas plusieurs contacts.** Une seule personne par fiche (§2). Passer à
  plusieurs demanderait une table de liaison et changerait les quatre écrans concernés.
- **Le contact ne confère aucun droit**, ni aujourd'hui ni par un réglage. Le rendre porteur
  d'autorité rouvrirait `peutModifier`, `prive.peut_lire_membre` et `ancetres_membre` — un
  chantier de sécurité entier, et non un paramètre.
- **Le nom d'affichage reste réservé à l'administrateur** (§2).
- **Aucune politique d'écriture RLS n'est ouverte** (D140).
- **« Mes membres » ne remplace pas `/arborescence`.** L'arborescence montre l'arbre entier ;
  cet écran montre **ma** portée, sous quatre angles.
