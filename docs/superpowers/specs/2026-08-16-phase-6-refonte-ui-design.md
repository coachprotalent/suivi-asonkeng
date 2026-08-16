# Phase 6 — Refonte de l'interface : système de design « Filiation »

**Date :** 2026-08-16
**Statut :** design proposé, prêt pour revue avant plan d'implémentation
**Spécification maîtresse :** `2026-08-11-suivi-asonkeng-design.md` — ce document ne la remplace
pas. Il précise ce que la phase 6 livre, en particulier le §3 (« interface mobile d'abord »),
qui n'a jamais été honoré : le dépôt compte **quatre** usages de point de rupture, tous au plus
petit palier.
**Inventaires de référence, mesurés le 2026-08-16 :** `.superpowers/sdd/inventaire-ecrans.md`
(327 lignes) et `.superpowers/sdd/inventaire-vocabulaire.md` (260 lignes). Toute affirmation
chiffrée de ce document en vient, avec sa commande de mesure.

**Cette phase est celle que le README annonçait sous le nom « phase 5 (refonte UI/UX) »** avant
que la création enrichie ne prenne ce numéro. Le README a été corrigé en phase 5, tâche 15 ;
c'est bien la même intention, décalée d'un rang.

---

## 1. Objet

Les phases 0 à 5 sont livrées et déployées. **Le métier est complet ; la présentation ne l'a
jamais été.** Elle a été écrite écran par écran, chacun réinventant ses marges, ses couleurs et
ses boutons, sans qu'aucun composant partagé n'existe.

L'inventaire le dit sans ambiguïté :

- **le bouton principal est écrit de six façons différentes** — mêmes rôles, classes
  divergentes (`padding`, `text-sm`, `font-medium`, `self-start` présents ou absents selon le
  fichier) ;
- **il n'existe aucune carte, aucune étiquette d'état, aucun en-tête de page, aucune pagination
  partagée**, alors que chacun de ces motifs se répète entre dix et vingt-cinq fois ;
- **aucune classe de focus dans tout le dépôt** — le focus repose entièrement sur le défaut du
  navigateur, et les deux usages d'`outline-none` le suppriment sans rien mettre à la place ;
- **quatre usages de point de rupture en tout**, tous en `sm:`, un seul motif ; `md:`, `lg:`,
  `xl:` sont absents. Le responsive repose sur `flex-wrap` (40 usages) ;
- **deux formulaires sur vingt-cinq** déplacent le focus vers le refus ;
- **quinze confirmations** passent encore par `window.confirm()` ; il n'existe **aucun**
  `<dialog>` ni `role="dialog"` ;
- **28 champs de saisie, sur 12 fichiers, restent non contrôlés.**

Il y a aussi ce qui est déjà bon, et qu'il ne faut pas casser : **122 `<input>` dont 70 portent
exactement la même classe** — le motif le plus cohérent du dépôt ; **46 `role="alert"`**, un
bandeau de refus par formulaire, quasi universel ; **39 `disabled={enCours}`** avec un libellé
de bouton qui bascule ; et trois listes de définition écrites **trois fois à l'octet près** de
façon indépendante. Ces conventions sont saines : la phase les **extrait**, elle ne les remplace
pas.

**Une absence remarquable, et heureuse : il n'y a aucun `<table>` dans tout le dépôt.** Toutes
les données tabulaires passent par `<ul class="divide-y">` + `<li>`. Il n'existe donc aucun
problème de débordement horizontal à résoudre — mais aucune ligne de liste partagée non plus,
chaque écran réimplémentant sa propre disposition en `flex`.

---

## 2. Décisions déjà prises par l'utilisateur, et non rouvertes

- **Système de design maison, sur Tailwind 4.** Aucune bibliothèque de composants, aucune
  dépendance ajoutée.
- **La phase est menée d'un trait**, comme les précédentes.
- **Les directions visuelles ont été proposées sur maquettes et arbitrées** : la direction
  retenue est **C — « Filiation »**.
- **Mobile et bureau à parts égales.**

---

## 3. Décisions prises pendant ce cadrage

> **Numérotation.** Les numéros de décision sont globaux au projet. La phase 5 s'arrête à
> **D105** ; cette table reprend à **D106**. Rappel de la règle en vigueur : **D36 à D43 sont
> attribués deux fois** (phase 2b et phase 3), et toute citation d'un de ces huit numéros doit
> écrire sa phase.

| # | Décision | Justification |
|---|---|---|
| D106 | La direction retenue est **« Filiation »** : la relation est le sujet. Un **rail de filiation** vertical marque la profondeur **partout où une relation existe** — dans l'arborescence, mais aussi sur la fiche d'un membre et dans les listes qui nomment un faiseur de disciple. Fond vert très pâle, fiches en cartes blanches, cibles tactiles larges | Décision utilisateur, arbitrée sur maquettes. Elle a une conséquence structurelle qu'il faut assumer plutôt que subir : **l'espacement coûte des lignes visibles**. C'est le revers documenté de cette direction, et D107 y répond — sans quoi les écrans de gestion en volume (`/comptes`, `/evenements/a-traiter`, `/demandes`) régresseraient à l'usage |
| D107 | **Deux densités, choisies par l'ÉCRAN et non par l'utilisateur.** Un attribut `data-densite="compact"` posé sur le conteneur d'un écran ne remappe que des jetons d'espacement. Aucun réglage, aucune persistance, aucun état client, aucune préférence à stocker | C'est la réponse au revers de D106, au coût le plus bas possible : un attribut et six jetons. Une préférence utilisateur coûterait un stockage, une synchronisation entre onglets, un choix par défaut à justifier, et un axe de test supplémentaire sur **tous** les écrans — pour un problème qui ne concerne que trois d'entre eux, et dont la bonne densité est une propriété de la **tâche**, pas de la personne |
| D108 | **Les jetons sont des propriétés personnalisées CSS déclarées dans `globals.css`**, exposées à Tailwind 4 par `@theme`. **Aucun fichier de configuration JavaScript n'est créé** | Tailwind 4 lit sa configuration depuis le CSS. Ajouter un `tailwind.config.ts` pour la forme introduirait une seconde source de vérité pour les mêmes valeurs — la classe de défaut que ce projet combat sous le nom de **carte fausse transmise comme acquise**, rencontrée trois fois sur la seule phase 5 |
| D109 | **Le changement de direction visuelle coûte UN fichier.** Tous les composants lisent les jetons ; **aucun composant ne porte de valeur littérale** — ni couleur, ni rayon, ni ombre, ni espacement de rythme | C'est ce qui rend l'arbitrage de D106 réversible, et ce qui rendra D116 et D107 réalisables sans y retoucher. C'est aussi une propriété **vérifiable** : un balayage refusant toute couleur littérale sous `src/composants/` est une preuve (§7, n°2), pas une intention |
| D110 | **Neuf composants partagés**, et neuf seulement, dans `src/composants/ui/` : `Bouton`, `Champ`, `Selecteur`, `ZoneTexte`, `LigneListe`, `Carte`, `EtatBadge`, `EnTetePage`, `Pagination`. Plus **deux composants de formulaire** au §5 : `Formulaire` et `Refus` | Le seuil est le décompte de l'inventaire : chacun de ces motifs se répète **au moins dix fois**. Ceux qui ne le franchissent pas ne sont **pas** créés — le fil d'Ariane n'existe que sur un écran, le message de succès n'a que deux occurrences, la carte générique n'existe nulle part. Les créer « pour la symétrie » produirait des composants à un seul appelant, que personne n'exerce et qui dérivent |
| D111 | **`Champ`, `Selecteur` et `ZoneTexte` n'acceptent PAS `defaultValue`.** Leur signature exige `value` et `onChange`. Un champ non contrôlé devient **impossible à écrire** par le composant partagé | C'est la fermeture **par construction** des 28 champs non contrôlés répartis sur 12 fichiers. Le remède appliqué depuis la phase 4 — « rendre les champs contrôlés » — était un geste à répéter à chaque nouveau formulaire, donc un geste qu'on oublie. Ici l'oubli est un refus de compilation. **C'est la seule raison pour laquelle cette phase ferme ce dossier définitivement** |
| D112 | **`Formulaire` porte `onReset` avec prévention du comportement par défaut, une fois pour toutes.** Aucun écran n'a plus à y penser | Second axe du même dossier, découvert en phase 5 : un `<select>` **contrôlé** ne survit pas à la réinitialisation automatique du formulaire après un refus, contrairement aux champs de saisie. Trois fichiers portent aujourd'hui le remède à la main, et **rien — ni règle de lint, ni test — ne signalerait un `<form>` neuf qui l'oublie**. La carte des composants atteints s'est déjà révélée fausse une fois, précisément parce qu'elle définissait sa cible par un critère qui excluait par construction le seul fichier atteint. Un composant ferme le cas ; une carte ne le ferme jamais |
| D113 | **`Refus` porte `role="alert"`, `tabIndex={-1}`, et reçoit le focus à chaque refus.** Les 46 bandeaux existants passent par lui | Deux formulaires sur vingt-cinq déplacent le focus aujourd'hui. Les vingt-trois autres reposent sur l'annonce implicite de `role="alert"`, qui ne déplace rien : un utilisateur au clavier reste où il était et ne sait pas que sa soumission a été refusée. Les deux formulaires qui le font bien sont le modèle ; le composant le généralise. `outline-none` y est **remplacé**, pas seulement retiré |
| D114 | **Un anneau de focus visible est défini une fois, sur les jetons, et appliqué par `:focus-visible` dans une couche de base.** `outline-none` sans remplacement visible devient un défaut de revue | Zéro classe de focus dans tout le dépôt aujourd'hui. Ce n'est pas une préférence esthétique : c'est la seule chose qui rend l'application utilisable au clavier, et elle est absente |
| D115 | **Trois points de rupture réels — `sm`, `md`, `lg` — et les listes passent en cartes empilées sous `md`.** `flex-wrap` cesse d'être le seul mécanisme de responsive | Le §3 de la spécification maîtresse promet « mobile d'abord » depuis le premier jour ; quatre usages de `sm:` ne l'honorent pas. D106 étant la direction pensée pour le téléphone, la promesse et la direction pointent au même endroit. **`LigneListe` porte cette bascule une fois** : c'est le seul endroit où elle a besoin d'exister, puisqu'aucun `<table>` n'existe |
| D116 | **Aucun thème sombre dans cette phase.** Les jetons sont structurés pour l'accueillir plus tard sans retoucher un seul composant | Un thème sombre double la surface de preuve visuelle de **tous** les écrans, pour un besoin que personne n'a exprimé. Le structurer sans le livrer coûte zéro ; le livrer coûte la phase entière une seconde fois. La décision est écrite ici pour que « on l'ajoutera plus tard » soit une phrase vérifiable et non une intention |
| D117 | **Aucun texte affiché n'est modifié.** Les libellés, messages de refus, titres et états gardent leur formulation **à l'octet près**, sauf ceux qu'un tableau du plan liste explicitement, avec leur justification | La suite `test:e2e:prod` assert des textes affichés ; les suites `test:e2e` aussi. Un changement de formulation non déclaré ferait rougir des preuves **pour la mauvaise raison**, et l'ajustement du test serait alors le geste naturel et faux. Cette phase change la **présentation** ; le vocabulaire de l'application a été arbitré ailleurs |
| D118 | **La phase 6 n'ajoute AUCUNE migration, AUCUNE politique RLS, AUCUNE Server Action d'écriture, AUCUN marqueur d'erreur.** Le recensement des chemins d'écriture est **vide**, et ce vide est lui-même une assertion à vérifier en revue | Même mécanique que D92 en phase 5, et pour la même raison : un périmètre déclaré vide devient une preuve dès qu'on le vérifie, alors qu'un périmètre « surtout de présentation » ne se vérifie pas. Corollaire pratique : le `--stat` de la branche ne doit contenir **aucun** fichier sous `supabase/` |
| D119 | **Les preuves de bout en bout existantes ne sont PAS modifiées pour accommoder la refonte.** Si une preuve rougit, c'est un **signal**, pas un test à ajuster — sauf si le plan a explicitement déclaré le changement de texte au titre de D117 | C'est le filet de sécurité de toute la phase. 128 preuves e2e et 10 preuves de production couvrent aujourd'hui les parcours ; elles sont **la seule chose** qui garantit qu'une refonte de présentation n'a rien cassé du métier. Autoriser leur ajustement à la volée reviendrait à retirer le filet au moment de sauter |
| D120 | **Les composants partagés sont livrés AVANT tout écran migré**, avec leurs tests unitaires, puis **trois écrans témoins** — `/membres` (liste), `/membres/nouveau` (formulaire dense), `/arborescence` (récursion) — avant les autres | Ce sont les trois formes que tous les autres écrans déclinent, et ce sont les trois plus coûteuses. Si le socle est mal dimensionné, ces trois-là le révèlent ; les dix-sept suivants ne révéleraient rien de neuf. C'est de l'ordonnancement **de mesure**, pas de confort — même argument que D96 |
| D121 | **La redirection de bornage de pagination, aujourd'hui recopiée dans six fichiers, est extraite en un seul endroit** | C'est la seule duplication de logique **serveur** que la phase touche, et elle y touche parce que les six fichiers concernés sont de toute façon rouverts. Elle est extraite **à comportement identique**, ce qui se prouve : les preuves de pagination existantes ne doivent pas bouger d'une ligne. Toute autre duplication serveur est **hors périmètre** |
| D122 | **`arborescence.tsx` (548 lignes) est scindé : la logique de dépliage, de recherche et de séquencement réseau d'un côté, le rendu récursif de l'autre.** Les **deux** barrières anti-cycle — celle du clic et celle du rendu — sont conservées **telles quelles** et suivies d'un test | C'est le plus gros fichier du dépôt, le seul à porter des styles en ligne, et celui où logique et JSX sont le plus soudés. C'est aussi celui où la direction retenue a le plus à dire, la filiation étant son sujet. **La barrière du rendu a été posée en phase 5 par la vague de correction finale** : la déplacer sans la tester la ferait disparaître sans bruit, et le scénario qu'elle empêche — une récursion infinie qui fige l'onglet sur donnée corrompue — est exactement celui que D105 nomme |
| D123 | **`comptes/ligne-compte.tsx` n'est PAS corrigé sur le fond.** Ses Server Actions appelées hors `<form action>` sont **isolées et documentées**, pas déplacées | Ce motif repose sur une hypothèse fragile au sujet de `error.tsx` (message toujours statique). La corriger change le **comportement d'erreur** d'un écran d'administration des comptes — c'est un changement de métier, pas de présentation, et D118 l'exclut. Le documenter là où le prochain lecteur le rencontrera vaut mieux que de le corriger en passant, au milieu d'une phase dont ce n'est pas le sujet |
| D124 | **Les quinze `window.confirm()` sont remplacés par un `Dialogue` unique**, fondé sur `<dialog>` natif : focus piégé, `Échap` ferme, retour du focus au déclencheur | `window.confirm()` n'est pas stylable, bloque le fil d'exécution, se présente hors de la page, et sur mobile s'affiche comme une alerte système que rien ne rattache à l'application. Le remplacer est le seul geste de cette phase qui change un **comportement** perceptible — c'est pourquoi il est nommé ici et non traité comme un détail de présentation |
| D125 | **`Dialogue` est le dixième composant, et il est le seul dont l'ajout franchit le seuil de D110 par un autre chemin** : quinze appelants, mais **zéro implémentation existante à extraire** | Distinction utile pour la revue : les neuf autres composants **extraient** un motif déjà écrit dix à vingt-cinq fois, et leur risque est la **divergence** avec ce qui existait. Celui-ci **crée** un comportement neuf, et son risque est le **défaut** : piège de focus, fermeture par `Échap`, restitution du focus, comportement au clavier. Il exige donc des preuves d'une autre nature |
| D126 | **Les états — `Repenti`, `Baptisé`, `Affermi`, `En attente`, `Archivé` — sont rendus par une pastille de couleur suivie du libellé, jamais par le libellé seul, jamais par une pastille seule** | La direction « Filiation » ne colore pas le fond de l'étiquette, contrairement à ce qu'aurait fait « Atelier ». La couleur reste donc un **second canal**, jamais le seul : la pastille aide au repérage, le libellé porte le sens. Une couleur seule serait invisible à qui ne la distingue pas, et un libellé seul perdrait le bénéfice du repérage qui a justifié D107 |
| D127 | **Les cinq écrans les plus lourds sont nommés dans le plan, avec leur raison**, et chacun est une tâche à part entière : `/arborescence` (548 lignes), `/membres/nouveau` (318 + 290), `/membres/[id]` (309), `/evenements/a-traiter` (305), `/comptes` (296) | Mesuré, pas estimé (`wc -l` sur les 70 fichiers `.tsx`, 7 695 lignes au total). Les quatre derniers partagent une même cause — **plusieurs formulaires indépendants empilés dans une seule ligne de liste** —, ce qui rend `LigneListe` et `Formulaire` déterminants pour eux quatre. Un socle qui ne les sert pas est un socle raté, et c'est pourquoi `/membres/nouveau` est un des trois témoins de D120 |

---

## 4. Le système de jetons

### 4.1 Couleur — « Filiation »

Les neutres portent un **biais vert**, choisi et non hérité : un gris pur jurerait avec le rail
de filiation, qui est l'élément signature de la direction.

| Jeton | Valeur | Rôle |
|---|---|---|
| `--fond` | `#F2F4F1` | fond de page |
| `--surface` | `#FFFFFF` | cartes, lignes de liste, champs |
| `--encre` | `#1C2321` | texte principal |
| `--encre-attenuee` | `#626F68` | texte secondaire, métadonnées |
| `--filet` | `#DCE3DD` | séparateurs |
| `--bord-carte` | `#E3E9E3` | bordure des cartes et lignes |
| `--filiation` | `#7E9A86` | **le rail** — profondeur, lien de discipulat |
| `--action` | `#2F5D46` | boutons principaux, liens actifs |
| `--sur-action` | `#FFFFFF` | texte sur `--action` |

**Couleurs d'état**, distinctes de `--action` et utilisées **uniquement** en pastille (D126) :

| Jeton | Valeur | Rôle |
|---|---|---|
| `--etat-acquis` | `#3F6B52` | baptisé, affermi |
| `--etat-attente` | `#C08A2E` | en attente, à traiter |
| `--etat-refus` | `#97402F` | archivé, refusé |
| `--etat-neutre` | `#7E9A86` | repenti, sans état particulier |

`--etat-refus` sert **aussi** au texte des bandeaux de refus, où il est employé comme couleur de
texte sur `--surface` et non comme fond.

### 4.2 Typographie

Aucune police n'est chargée : le dépôt n'en charge aucune aujourd'hui, et en ajouter une
introduirait un octet bloquant sur le premier rendu de chaque page pour un bénéfice esthétique.
La pile système est **choisie**, pas subie : `"Segoe UI Variable Text", "Segoe UI", system-ui,
-apple-system, sans-serif`.

Échelle, cinq degrés et pas un de plus — l'inventaire relève **28 `<h1>` dont 26 partagent déjà
le même style**, et six variantes de marge à supprimer :

| Jeton | Taille | Usage |
|---|---|---|
| `--txt-titre` | 1.5 rem / 650 | titre de page (`EnTetePage`) |
| `--txt-section` | 1.125 rem / 650 | titre de section |
| `--txt-corps` | 1 rem / 400 | texte courant, valeurs |
| `--txt-nom` | 0.95 rem / 600 | nom d'une personne en liste |
| `--txt-petit` | 0.85 rem / 400 | métadonnées, `--encre-attenuee` |

`font-variant-numeric: tabular-nums` partout où des chiffres s'alignent : pagination, décomptes,
dates.

### 4.3 Espacement, rayon, rail

Rythme sur 4 px. Rayon **unique** : 4 px — l'inventaire relève des valeurs divergentes sans
qu'aucune ne porte de sens.

Cibles tactiles : **44 px de hauteur minimale** pour tout élément interactif, y compris les
chevrons de dépliage de l'arbre. C'est la contrainte qui coûte des lignes visibles, et c'est
elle que D107 compense sur les trois écrans de gestion.

**Le rail de filiation** est un bord gauche de 2 px en `--filiation`, avec un retrait de
`0.9 rem`. Il marque la profondeur dans l'arborescence et **reparaît** partout où une relation
de discipulat est affichée. C'est l'élément signature : il porte une information vraie — la
profondeur —, il n'est pas une décoration.

### Densité compacte (D107)

`[data-densite="compact"]` remappe **six jetons d'espacement seulement**. Ni la couleur, ni la
typographie, ni le rayon, ni la hauteur minimale des cibles tactiles ne changent : une cible
tactile réduite serait une régression d'accessibilité déguisée en densité.

Écrans concernés, et eux seuls : `/comptes`, `/evenements/a-traiter`, `/demandes`.

---

## 5. Les composants

Tous sous `src/composants/ui/`. **Aucun n'est un composant client** sauf mention contraire :
la coloration et la mise en page n'exigent pas d'état.

| Composant | Client ? | Remplace | Occurrences mesurées |
|---|---|---|---|
| `Bouton` | non | 6 formulations divergentes | 60 `<button>` |
| `Champ` | non | classe partagée par 70 des 122 `<input>` | 122 |
| `Selecteur` | non | 2 familles (contrôlée / non contrôlée) | 18 `<select>` |
| `ZoneTexte` | non | — | motif homogène |
| `LigneListe` | non | disposition `flex` réécrite par écran | 29 listes |
| `Carte` | non | **rien — le motif n'existe pas** | 0 |
| `EtatBadge` | non | texte interpolé sans étiquette | 2 pastilles |
| `EnTetePage` | non | 6 variantes de marge, 2 tailles aberrantes | 28 `<h1>` |
| `Pagination` | non | motif recopié | ~10 |
| `Formulaire` | **oui** | porte `onReset` (D112) | 25 formulaires |
| `Refus` | **oui** | 46 bandeaux `role="alert"` | 46 |
| `Dialogue` | **oui** | 15 `window.confirm()` | 15 |

**`Carte` et `EtatBadge` sont les deux seuls composants sans antécédent à extraire.** Leur
risque n'est pas la divergence mais l'usage : un composant neuf que les écrans n'adoptent pas
uniformément recrée exactement le désordre que la phase corrige. Le plan doit donc **compter
leurs appelants** à la fin, et ce décompte est une preuve (§7, n°5).

### `Formulaire` — la pièce maîtresse

Elle porte, en un seul endroit, ce que 25 formulaires font aujourd'hui chacun à leur façon :

- `onReset` avec prévention du comportement par défaut — **D112** ;
- le rendu du refus par `Refus`, avec déplacement du focus — **D113** ;
- l'état d'attente : `disabled` et bascule du libellé, convention **déjà homogène** dans le
  dépôt (39 `disabled={enCours}`, 26 bascules de libellé) et donc **reprise telle quelle**.

Elle n'impose **pas** `useActionState` : les formulaires qui l'emploient le gardent, ceux qui ne
l'emploient pas ne sont pas convertis. Cette phase ne touche à aucun chemin d'écriture (D118).

---

## 6. Écrans, ordre et coût

**Trois témoins d'abord** (D120), puis les dix-sept autres.

| Écran | Forme | Coût | Pourquoi |
|---|---|---|---|
| `/arborescence` | arbre récursif | **le plus élevé** | 548 lignes, logique et rendu soudés, deux barrières anti-cycle à préserver, seuls styles en ligne du dépôt (D122) |
| `/membres/nouveau` | formulaire dense | élevé | 318 + 290 lignes, trois sections indépendantes, calcul asynchrone de proposition |
| `/membres/[id]` | fiche | élevé | 309 lignes, six sections conditionnelles, trois bandeaux d'avertissement distincts |
| `/evenements/a-traiter` | liste d'action | élevé | 305 lignes, deux formulaires par ligne, trois chemins exclusifs |
| `/comptes` | liste d'action | élevé | 296 lignes, quatre formulaires par ligne (D123) |
| les 15 autres | listes, fiches, formulaires simples | faible | déclinaisons des trois formes ci-dessus |

`/connexion` et `/inscription` sont **publiques** : ce sont les seuls écrans qu'une personne
extérieure voit, et les seuls où la première impression compte pour quelqu'un qui n'a pas de
compte. Elles ne sont pas des témoins — elles sont trop simples pour dimensionner le socle —
mais elles sont traitées **tôt**.

---

## 7. Preuves exigées

1. **Aucun fichier sous `supabase/` dans le `--stat` de la branche** (D118). Vérifié sur la
   plage de commits, **jamais sur l'arbre de travail** : un `git diff --stat` sans plage rend
   toujours zéro sur un arbre propre et **ne peut pas échouer** — défaut relevé en phase 5.
2. **Aucune couleur littérale sous `src/composants/`** (D109). La commande doit d'abord prouver
   qu'elle sait en trouver une, sur un fichier témoin, avant que son zéro veuille dire quelque
   chose : une mesure vraie à vide a déjà été produite dans ce projet par un `grep` dont
   l'échappement ne se développait pas.
3. **`Champ`, `Selecteur` et `ZoneTexte` refusent `defaultValue` à la compilation** (D111) —
   prouvé par un cas qui **doit** échouer à `tsc`, pas par lecture de la signature.
4. **Zéro `window.confirm` restant** dans `src/` (D124), et le `Dialogue` prouvé sur les trois
   comportements qui font sa valeur : focus piégé, `Échap`, restitution du focus.
5. **Décompte des appelants de `Carte` et `EtatBadge`** à la fin de la phase (§5).
6. **Les 128 preuves e2e et les 10 preuves de production passent sans modification** (D119).
   Toute exception est déclarée au titre de D117, avec sa justification, **avant** d'être écrite.
7. **Un état de focus visible sur chaque composant interactif** (D114), et **zéro `outline-none`
   sans remplacement**.
8. **Les deux barrières anti-cycle de l'arbre survivent au découpage** (D122), chacune avec son
   test.
9. **Les preuves de pagination ne bougent pas d'une ligne** après l'extraction de D121 — c'est
   ce qui établit que l'extraction est à comportement identique.

---

## 8. Pièges connus, portés dans la conception

1. **La phase touche 70 fichiers sur 70.** C'est la phase la plus étendue du projet et la moins
   profonde. Le risque n'est pas la difficulté d'une tâche, c'est **le nombre d'occasions de
   dériver d'un pouce**. D109 et D110 existent pour cela.
2. **Un composant partagé mal dimensionné se paie vingt fois.** D120 place les trois formes les
   plus coûteuses en premier, pour que l'erreur se révèle sur trois écrans et non sur vingt.
3. **La tentation d'ajuster un test qui rougit.** D119 la nomme et l'interdit. C'est le piège le
   plus probable de cette phase, parce que le geste est petit et paraît raisonnable sur le
   moment.
4. **La tentation de corriger le métier en passant.** Vingt écrans rouverts, c'est vingt
   occasions de voir un défaut réel et de le réparer hors sujet. D118 et D123 tracent la ligne :
   **signaler, ne pas corriger**.
5. **`window.confirm` bloque ; un `<dialog>` ne bloque pas.** Le code appelant change de forme :
   là où `if (!window.confirm(...)) return;` interrompait, il faut désormais un rappel. Les
   quinze sites doivent être relus **un par un** — c'est le seul endroit de la phase où une
   traduction mécanique produirait un défaut réel.
6. **Le rail de filiation ne doit pas mentir.** Il marque une profondeur ; s'il apparaît là où
   aucune relation n'existe, il devient une décoration qui affirme quelque chose de faux — la
   forme de défaut la plus coûteuse de ce projet.

---

## 9. Ce que la phase ne livre pas, et pourquoi

- **Aucun thème sombre** (D116).
- **Aucune préférence de densité utilisateur** (D107).
- **Aucune icône** : le dépôt n'en contient aucune aujourd'hui, ce qui lui épargne la question
  du nom accessible des boutons à icône. En introduire ouvrirait ce dossier pour un gain
  esthétique.
- **Aucune animation**, hors les transitions d'état des composants interactifs, sous
  `prefers-reduced-motion`.
- **Aucune correction de `comptes/ligne-compte.tsx`** (D123).
- **Aucun changement de texte affiché** non déclaré (D117).

---

## 10. À trancher

1. **Le thème sombre** est reporté par D116. Si vous le voulez dans cette phase, c'est à dire
   maintenant : après coup, il coûte une seconde passe sur les vingt écrans.
2. **Les trois écrans en densité compacte** (D107) sont `/comptes`, `/evenements/a-traiter` et
   `/demandes`. Si un autre écran vous paraît en relever à l'usage, ajoutez-le maintenant : la
   liste est un attribut, pas une architecture.
