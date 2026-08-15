# Phase 5 — Création enrichie d'un membre, et arbre parcourable

**Date :** 2026-08-15
**Statut :** design proposé, prêt pour revue avant plan d'implémentation
**Spécification maîtresse :** `2026-08-11-suivi-asonkeng-design.md` — ce document ne la remplace
pas. Il précise ce que la phase 5 livre, en particulier le §4.2 (arborescence et règle du
dirigeant), le §5.1 (portée d'autorité), le §5.3 (traduction technique) et le §6 (parcours
« Amorçage »). Le ton, la structure et le niveau de détail suivent
`2026-08-14-phase-4-evenements-design.md`.
**Design de référence pour l'arbre :** `2026-08-12-phase-1c-design.md`, décisions **D17 à D21**,
qui posent l'arborescence, l'anti-cycle, la portée d'autorité et l'échelle visée.

**Cette phase n'existe dans aucun document.** Le §9 de la spécification maîtresse — « Découpage
en phases » — s'arrête à la phase 4 et se termine par « Les phases 3 et 4 sont indépendantes ».
Le README, lui, annonce une « phase 5 (refonte UI/UX) » qui n'est pas celle-ci. Voir §13,
points 1 et 3, et §15 : ce document le **signale** plutôt que de l'enjamber.

---

## 1. Objet

Les phases 0 à 4 sont livrées et déployées. Le registre, les statuts, l'arborescence, les
comptes, les circuits d'inscription, l'AEL et les évènements existent tous, en base comme à
l'écran.

Il reste deux manques, et ils sont liés.

**Le premier est un manque de geste.** Créer un membre, lui attribuer ses statuts et le placer
dans l'arbre sont aujourd'hui **trois écrans successifs** — `/membres/nouveau`,
`/membres/[id]/statuts`, `/membres/[id]/arbre` — parcourus après coup, chacun avec son propre
formulaire et sa propre redirection. Rien n'oblige à les parcourir, et le §4.2 de la
spécification maîtresse promet depuis le premier jour que le dirigeant est « proposé **à la
création d'un membre** » — promesse qu'aucune phase n'a tenue, faute d'un faiseur de disciple
saisissable à la création.

**Le second est un manque de vue.** L'arbre des faiseurs de disciple est la structure centrale
du projet : la portée d'autorité en découle (§5.1), le dirigeant s'en calcule (§4.2),
l'archivage s'y heurte (§7). Il n'est visible nulle part. La fiche d'un membre montre son
faiseur de disciple, son dirigeant et ses disciples directs : trois crans, jamais la branche.

Le lien entre les deux manques est direct, et c'est la découverte de ce cadrage :
**`creerMembre` n'a jamais écrit de `faiseur_de_disciple_id`.** Toute fiche créée depuis la
phase 1a est donc une **racine de l'arbre** jusqu'à ce que quelqu'un ouvre l'écran de
rattachement. Un écran qui « commence par les racines » ne commencera pas par une poignée de
noms — il commencera par une liste du même ordre de grandeur que l'annuaire. Le premier volet
est le remède de fond au problème que le second rend visible (D96).

**Hors périmètre de ce document** : tout ce que les phases 0 à 4 ont livré et que cette phase
réutilise sans le réécrire — `SelecteurMembre`, `proposerDirigeant`, `dirigeantPropose`,
`peutModifier`, `exigerAdministrateur`, `exigerProfilActif`, les helpers de
`src/lib/donnees/pagination.ts`, `public.definir_arbre`, `public.attribuer_statut`,
`public.ancetres_membre`. Ce qui est réutilisé est **nommé**, jamais recopié.

---

## 2. Décisions déjà prises par l'utilisateur, et non rouvertes

Elles sont mises en œuvre telles quelles ; les décisions du §3 comblent ce qu'elles ne
précisent pas.

- **Les trois enrichissements de la création — statuts, faiseur de disciple, dirigeant — sont
  tous facultatifs.**
- **Le dirigeant est calculé ou forcé**, comme sur l'écran de rattachement : même règle, même
  drapeau `dirigeant_force`, même bouton de retour au calcul.
- **L'arbre est dépliable à la demande**, depuis les racines, chaque nœud chargeant ses
  disciples au clic, **avec une recherche** pour sauter directement à quelqu'un.
- **L'arbre est en consultation seule.** Les rattachements restent sur la fiche du membre, où
  la portée d'autorité, le verrou consultatif et le garde-fou anti-cycle sont déjà éprouvés.

---

## 3. Décisions prises pendant ce cadrage

> **Numérotation.** Les numéros de décision sont globaux au projet. Les phases précédentes vont
> jusqu'à **D80** (phase 4) ; cette table reprend à **D81**. Attention en relisant les documents
> anciens : **D36 à D43 sont attribués deux fois**, une fois par le design de la phase 2b et une
> fois par celui de la phase 3, avec des contenus différents. La règle posée par la
> spécification maîtresse s'applique : **toute citation d'un de ces huit numéros écrit sa
> phase**, sous la forme « D42 (2b) » ou « D42 (phase 3) ». Ce document ne renumérote rien — les
> `comment on` déjà appliqués en base citent ces numéros, et renuméroter ferait mentir le code.

| # | Décision | Justification |
|---|---|---|
| D81 | La création enrichie est **une passerelle SQL unique**, `public.creer_membre_enrichi(...)`, `security definer`, `execute` réservé à `service_role`. Les trois écritures — fiche, arbre, statuts — vivent dans le corps d'**une seule** fonction PL/pgSQL : l'atomicité est tenue **par construction** | Les trois écritures sont **toutes du SQL, sur la même base** : une transaction les couvre. D27 a choisi la compensation parce qu'aucune transaction n'était **possible** — la création du compte est un appel HTTP à Supabase Auth, le marquage du token une écriture SQL. Ce motif ne se transpose pas : préférer ici la compensation, ce serait choisir la garantie faible alors que la forte est disponible. Et la compensation coûterait cher : elle devrait **supprimer une fiche `actif`**, dont la cascade emporte `journal_statuts` — que 20260813170000 désigne comme la seule voie d'effacement complet d'une personne. Voir §5 pour l'arbitrage complet entre les trois formes |
| D82 | La passerelle **compose** les passerelles existantes — elle appelle `public.definir_arbre` et `public.attribuer_statut` — et n'en **duplique ni n'en contourne** aucune vérification | C'est la réponse à la seule objection sérieuse contre D81. Les gardes des trois écritures ne sont pas dans l'application : elles sont **dans le SQL**, donc appelables depuis une autre fonction SQL. Composer coûte deux `perform` ; recopier coûterait deux copies destinées à diverger. Conséquence directe et voulue : **aucun marqueur d'erreur nouveau** pour l'arbre ni pour les statuts — `membre_inconnu`, `faiseur_inconnu`, `dirigeant_inconnu`, `faiseur_de_disciple_archive`, `cycle_faiseur_de_disciple` et le code `23514` gardent leur sens, et l'application les discrimine avec le code qu'elle a déjà écrit |
| D83 | La passerelle **ne prend aucun verrou consultatif propre** : celui de l'arbre (`pg_advisory_xact_lock(20260814, 1)`) est pris par l'appel imbriqué à `definir_arbre`, en première instruction de celle-ci, et cela suffit | Entre l'insertion de la fiche et l'écriture de l'arbre il n'y a **aucune fenêtre** : c'est la même transaction. Et une ligne qui n'existe pas encore n'a aucun descendant, donc l'insertion seule ne peut fermer aucun cycle. Un second `pg_advisory_xact_lock` sur la même clé serait ré-entrant, donc inoffensif — et **trompeur** : il laisserait croire que celui de `definir_arbre` ne suffit pas. D67 (phase 4) exige le verrou dès qu'un `faiseur_de_disciple_id` est posé ; il l'est ici, par la passerelle qui le pose |
| D84 | Deux statuts d'un **même groupe exclusif** soumis dans la même création sont **refusés, deux fois** : par une fonction pure en amont, qui nomme les deux statuts, et par la passerelle elle-même, avec le marqueur `statuts_exclusifs_incompatibles`. Ils ne sont **jamais** laissés à l'éviction de `prive.attribuer_statut` | L'éviction est conçue pour une attribution **ultérieure** qui remplace une attribution **antérieure** : elle supprime, journalise un `retrait` motivé, et c'est juste. À la création, les deux statuts arrivent dans le **même geste** : l'éviction ferait disparaître le premier en silence et inscrirait au journal le retrait d'un statut que la personne n'a jamais porté plus d'une transaction. Le journal mentirait sur ce qui s'est passé — exactement ce que le `if v_nouveau` d'`attribuer_statut` protège par ailleurs. Deux barrières, doctrine du projet depuis la 1b : **le contrôle amont explique, la passerelle protège**. Elle protège en particulier contre une lecture de catalogue tronquée (§13, point 6) : la passerelle relit les groupes en base, elle ne fait confiance à aucune liste venue de l'écran |
| D85 | **Tous les champs du formulaire de création enrichie sont contrôlés** (`value` + `onChange`), sans exception, y compris ceux qui l'étaient déjà et ceux que cette phase ajoute | `membres/formulaire-membre.tsx` est aujourd'hui le **deuxième pire cas** du dépôt — 9 champs libres sur les 14 composants recensés au README —, et cette phase lui ajoute les statuts, le faiseur de disciple et le dirigeant. React réinitialise les champs non contrôlés à **toute complétion** d'une action liée à `<form action>`, **y compris sur un refus retourné**. Couplé à D81, ce serait le pire assemblage possible : la transaction est annulée **et** la saisie disparaît. Réciproquement, l'atomicité ne coûte rien **parce que** les champs sont contrôlés — les deux décisions se tiennent mutuellement debout, et aucune des deux n'est bonne seule |
| D86 | Les trois enrichissements sont facultatifs **et indépendants les uns des autres** ; une création sans aucun enrichissement produit **exactement** ce que `creerMembre` produit aujourd'hui | C'est la condition pour que le remplacement de D87 soit sans risque, et c'est une **preuve** (§11, n°4), pas une intention. Indépendants : un dirigeant sans faiseur de disciple est légitime (le §4.2 le prévoit, `dirigeantPropose` rend `null` et l'administrateur force une valeur), des statuts sans place dans l'arbre aussi |
| D87 | `creerMembre` est **remplacée**, pas doublée : un seul chemin d'écriture pour la création d'une fiche par un administrateur | Deux chemins pour un geste, c'est l'un des deux qui cesse d'être exercé et qui dérive. Le §10.2 recense les chemins d'écriture précisément pour cela ; en ajouter un sans retirer l'ancien rendrait ce recensement faux dès sa rédaction |
| D88 | Le dirigeant est **proposé à la création**, en réutilisant `proposerDirigeant` (1c) **telle quelle**, à chaque changement de faiseur de disciple | Le §4.2 de la spécification maîtresse le promet depuis le 2026-08-11 : « Elle est proposée **à la création d'un membre** et à chaque changement de faiseur de disciple. » La 1c n'a livré que la seconde moitié, faute d'un faiseur de disciple saisissable à la création. Cette phase n'invente donc rien : elle **honore** une phrase qui était fausse depuis quatre phases (§13, point 2) |
| D89 | `/membres/[id]/modifier`, `/membres/[id]/statuts` et `/membres/[id]/arbre` restent **inchangés** ; l'enrichissement ne remonte pas dans l'écran de modification | La création enrichie est un **chemin rapide pour le geste initial**, pas un formulaire universel. Porter les statuts dans l'écran de modification exigerait d'y exprimer le **retrait**, que la création n'a jamais à connaître ; et y porter l'arbre mélangerait deux gardes différents sur un même écran — `exigerAutoriteSur` pour les statuts, `exigerAdministrateur` pour l'arbre. Les écrans de correction existent, sont éprouvés, et restent la voie de la correction |
| D90 | Le garde de l'écran et de l'action reste **`exigerAdministrateur`**, en première instruction, et ne descend **pas** à `exigerAutoriteSur` malgré la présence d'écritures de statuts | La création d'une fiche est réservée à l'administrateur (§5.2), et un administrateur a autorité **partout** — `peutModifier` court-circuite sur `estAdmin` avant toute remontée d'arbre. Les deux gardes **coïncident sur cet écran** : rien n'est affaibli. Écrit ici **et dans le `comment on function`** parce que la propriété est vraie par coïncidence et non par construction : un futur appelant non-administrateur de `creer_membre_enrichi` élargirait en silence qui peut écrire un statut, et doit être reconnu comme une régression, pas comme une réutilisation (§12, piège n°10) |
| D91 | L'arbre parcourable vit à **`/arborescence`** (nouveau, à la racine), et **non** sous `/membres/[id]/arbre`, qui reste l'écran de **rattachement d'un membre** | Deux écrans dont les noms diffèrent d'un mot et dont les droits diffèrent entièrement — consultation par tout compte actif d'un côté, édition par l'administrateur seul de l'autre — c'est ainsi qu'un garde finit par être confondu. Le vocabulaire existe déjà et il est distinct : la spécification appelle **arborescence** la structure (§4.2, titre de la 1c) et **rattachement** le geste (`/membres/[id]/arbre`, titre « Rattachement de … »). L'ancienne route n'est pas renommée : elle est déployée et liée depuis la fiche (§13, point 13) |
| D92 | **Consultation seule** : la phase 5, volet 2, n'ajoute **aucune** Server Action d'écriture, aucune passerelle, aucun marqueur, aucune politique RLS, aucun déclencheur | Décision utilisateur, enregistrée pour une raison précise : elle rend le recensement des chemins d'écriture du §10.2 **vide pour ce volet**, et ce vide devient lui-même une assertion à vérifier en revue. Un écran d'arbre qui rattache serait le quatrième chemin d'écriture vers `faiseur_de_disciple_id`, sur un écran où l'on navigue vite et où l'on clique par erreur |
| D93 | L'arbre affiché est celui des membres **`actif`**, filtré **explicitement** (`etat = 'actif'`) et jamais laissé au seul filtrage de la RLS | Exactement le raisonnement de `listerMembres`, et il est écrit dans son commentaire : un filtre explicite est une **règle énoncée**, un trou creusé par la RLS est un **mensonge**. La phase 4 l'a formulé dans l'autre sens (§8.1 : « une lecture vidée par la RLS ne doit jamais être affichée comme un résultat »). Conséquence directe, et c'est la réponse à « que voit un compte ordinaire ? » : **un compte ordinaire et un administrateur voient le même arbre**, parce que toute fiche `actif` est lisible de tout compte actif (D2, D20) et que ce qui est exclu l'est pour tout le monde |
| D94 | Les disciples d'un nœud sont lus par une fonction **neuve et paginée**, `disciplesPage(membreId, page)`, avec `count: 'exact'`, tri **total** (`nom`, `prenom`, puis `id`), `range()`, les helpers de `pagination.ts` et le traitement de `PGRST103`. **`disciplesDe` n'est ni réutilisée ni modifiée** | `disciplesDe` n'a **aucune borne** et son tri **n'est pas total** : à l'échelle de D18, une lecture non bornée est tronquée en silence au-delà de `max_rows = 1000`, et deux homonymes exacts à cheval sur une frontière de page peuvent être rendus deux fois ou **jamais**. Elle n'est pas corrigée parce qu'elle a un second appelant porteur : le contrôle amont d'`archiverMembre`, qui doit rester **complet** et dont la sémantique ne doit pas changer sous une pagination (§13, point 5). Deux besoins différents, deux fonctions — et le second reste à l'identique, donc reste éprouvé par ses tests existants |
| D95 | Les **racines** sont paginées de la même façon, leur **nombre est affiché**, et l'écran les nomme « **Membres sans faiseur de disciple** », « racines de l'arbre » n'étant qu'une glose | Le §6 de la spécification maîtresse suppose les racines peu nombreuses — « les tout premiers sans faiseur de disciple, ce sont les racines de l'arbre ». **Rien ne le garantit**, et le code dit le contraire : `creerMembre` n'a jamais écrit de `faiseur_de_disciple_id`, donc toute fiche est une racine tant que personne n'ouvre l'écran de rattachement. Appeler « racine » une fiche simplement jamais rattachée serait prêter une intention à un oubli. Le nombre est affiché parce que c'est **la mesure** qui dira si le remède de D96 agit |
| D96 | Le volet 1 est livré **avant** le volet 2 | L'arbre parcourable rend visible l'ampleur du problème que la création enrichie referme. Livré en premier, il serait jugé cassé — « il commence par mille racines » — alors qu'il dirait la vérité. Livré en second, il mesure un problème déjà en voie de réduction. Ce n'est pas de l'ordonnancement de confort : c'est la seule séquence où la première mesure prise par l'écran est interprétable |
| D97 | La recherche mène à **un membre**, et l'écran affiche alors **son chemin depuis la racine, déplié**, le membre mis en évidence, **et la première page de ses disciples** | Montrer la seule personne perdrait le « où dans l'arbre », qui est toute la raison d'être de l'écran — on l'a déjà sur `/membres/[id]`. Montrer les seuls ancêtres ne répondrait pas à « qui suit-il ? ». C'est le **seul** état de l'écran qui répond aux deux questions à la fois, et il ne coûte qu'une lecture de plus |
| D98 | **La forme du chemin est lue affranchie de la RLS** (identifiants seuls, `public.ancetres_membre`, D19) ; **les noms sont lus sous RLS**. Un maillon que l'appelant ne peut pas lire est rendu « **Fiche non consultable** », **à sa place dans le chemin**, jamais effacé ni sauté | C'est la réponse à « une branche dont un maillon intermédiaire est invisible devient-elle un trou ? » — **non**. L'effacer ferait mentir l'écran sur la profondeur et pourrait détacher toute la descendance ; la 1c a déjà tranché exactement cela sur la fiche (`libelleFiliation`, `/membres/[id]`), la phase 3 sur l'intervenant d'une séance, la phase 4 sur un participant. Même réponse, troisième fois. **Aucun nom lu affranchi n'atteint jamais l'écran** : la Server Action qui appelle `ancetres_membre` ne rend que des identifiants, et les noms sont relus par `membresBrefsParIds`, sous RLS, comme partout ailleurs |
| D99 | Ce cas est, **par construction, inatteignable pour un membre actif** : trois déclencheurs de la 1c maintiennent l'invariant « **aucun membre `actif` n'a d'ancêtre `archive`** ». D98 est donc une **défense**, pas un chemin normal — et l'invariant est **écrit ici** parce qu'il n'est écrit nulle part | `membres_archivage_faiseur_de_disciple` (20260814120000) refuse d'archiver qui a des disciples actifs ; `membres_desarchivage_faiseur_archive` (20260814140000) est `before update of etat` et couvre **toute** transition vers `actif` — y compris `en_attente → actif`, donc la validation d'une demande ; `membres_faiseur_de_disciple_archive` (20260814150000) refuse de rattacher à un faiseur archivé, à l'`insert` comme à l'`update`. Trois déclencheurs tiennent chacun un côté d'un invariant que **personne n'a jamais énoncé**. L'écrire est le seul moyen qu'une modification future sache ce qu'elle casserait — et l'écran ne s'appuie pas dessus pour être correct : il dégrade proprement si l'invariant tombait |
| D100 | La règle d'affichage « identifiant présent, fiche illisible → *Fiche non consultable* » est **extraite** de `/membres/[id]/page.tsx` en une **fonction pure partagée**, appelée par la fiche **et** par l'arbre | Exactement l'argument de D72, appliqué à une règle d'affichage plutôt qu'à une politique : recopier l'expression dans le second écran la ferait **diverger en silence** le jour où l'un des deux changerait. Bénéfice second, non négligeable : la règle devient testable au Vitest, donc D98 se prouve **sans toucher la base** (§11, n°14) |
| D101 | **Aucun indicateur « ce nœud a des disciples » n'est calculé d'avance.** Tout membre actif est dépliable ; déplier une feuille affiche « Aucun disciple actif rattaché. » | Un indicateur par enfant, c'est **une requête par enfant** — N+1 sur chaque page dépliée — et PostgREST ne sait pas agréger (`group by`). L'alternative serait une vue d'agrégation : un objet permanent en base, avec sa RLS à écrire et à prouver, **pour un chevron**. On préfère un aller-retour de trop, à la demande de l'utilisateur, à N requêtes systématiques que personne n'a demandées |
| D102 | **Aucun index nouveau**, et l'index qui serait la réponse est **nommé** dans ce document : `create index membres_arbre_idx on public.membres (faiseur_de_disciple_id, nom, prenom, id) where etat = 'actif';` | Même arbitrage que la 1c, §6.2 : on pagine, et l'index attendra d'être justifié **par une mesure, pas par une intuition**. `membres_faiseur_de_disciple_id_idx` existe déjà (20260812120000) et sert le filtre ; le tri porte alors sur une poignée de lignes par nœud. Seule la liste des racines trie un ensemble large, et l'annuaire fait déjà exactement cela à la même échelle sans index de tri. L'index candidat est écrit ici — partiel, et couvrant `is null`, un B-tree indexant les NULL — pour que la personne qui prendra la mesure n'ait pas à le redécouvrir |
| D103 | Chaque dépliage et chaque saut par recherche passe par une **Server Action gardée**, `exigerProfilActif` en première instruction, jamais par un `fetch` nu | Toute fonction exportée d'un fichier `'use server'` est appelable depuis le navigateur, **y compris quand elle ne fait que lire**. Précédent exact et commenté : `src/app/membres/recherche-action.ts` (1c). D2 ouvre l'annuaire à tout compte actif — pas aux visiteurs |
| D104 | L'indentation est **plafonnée** au-delà d'une profondeur donnée, et le chemin courant est rappelé en **fil d'Ariane** au-dessus de l'arbre | Interface mobile d'abord (§3 de la spécification maîtresse). Une indentation proportionnelle à la profondeur épuise la largeur d'un téléphone vers le cinquième niveau, et l'arbre devient illisible là où il est le plus consulté. Le fil d'Ariane porte alors l'information que l'indentation ne peut plus porter |
| D105 | Le composant client tient l'**ensemble des identifiants déjà dépliés dans la branche courante** et refuse de redéplier un nœud qui s'y trouve | Les deux barrières anti-cycle rendent un cycle impossible **dans la donnée**. L'affichage ne doit pas en dépendre : un dépliage automatique piloté par la recherche, sur une donnée corrompue, bouclerait dans le navigateur. Même raisonnement que la borne à 64 niveaux des fonctions récursives — « elle est la seule protection restante si une donnée corrompue franchissait un jour les barrières » (1c, piège n°5) |

---

## 4. Périmètre livré

1. **Création enrichie** (`/membres/nouveau`, existant, refondu) — la fiche, plus, **tous
   facultatifs** : les statuts (avec date d'acquisition et note), le faiseur de disciple et le
   dirigeant (calculé ou forcé). Une seule soumission, une seule transaction (D81).
2. **Passerelle `public.creer_membre_enrichi`** — composition de `definir_arbre` et
   `attribuer_statut`, atomique par construction (D82).
3. **Refus du couple exclusif à la création**, nommé à l'écran et refusé en base (D84).
4. **Formulaire entièrement contrôlé** (D85) — première application dans le dépôt du remède au
   piège des champs effacés, sur le deuxième pire cas recensé.
5. **Arbre parcourable** (`/arborescence`, nouveau) — racines paginées et dénombrées, dépliage
   à la demande nœud par nœud, recherche menant au chemin déplié d'une personne, consultation
   ouverte à tout compte actif (D91 à D97).
6. **Lectures d'arbre bornées** — `disciplesPage` et `racinesPage`, paginées, à tri total
   (D94, D95).
7. **Règle d'affichage « Fiche non consultable » extraite en fonction pure**, partagée par la
   fiche et par l'arbre (D100).

---

## 5. La question la plus difficile : l'atomicité de la création enrichie

Créer un membre, lui attribuer des statuts et le placer dans l'arbre, ce sont **trois
écritures** qui passent aujourd'hui par **trois passerelles distinctes**, chacune avec ses
propres gardes et son propre verrou :

| Écriture | Chemin actuel | Garde applicatif | Verrou |
|---|---|---|---|
| La fiche | `clientAdmin().from('membres').insert(...)` | `exigerAdministrateur` | aucun |
| Les statuts | `public.attribuer_statut` → `prive.attribuer_statut` | `exigerAutoriteSur` | `for update` sur la ligne du membre |
| L'arbre | `public.definir_arbre` | `exigerAdministrateur` | `pg_advisory_xact_lock(20260814, 1)` |

**Que se passe-t-il si la deuxième échoue ?**

### 5.1 Les trois formes possibles

**(a) Une passerelle unique**, faisant les trois écritures dans une seule transaction.
Atomique, mais — objection sérieuse — elle duplique ou contourne les gardes des trois
existantes.

**(b) Des appels séquentiels avec compensation.** Chaque passerelle garde sa logique, mais il
faut définir ce qu'on défait quand une étape échoue, et la compensation elle-même peut échouer.

**(c) Créer d'abord, enrichir ensuite**, l'écran enchaînant les gestes sans prétendre à
l'atomicité. Le plus simple, mais il faut dire honnêtement à l'utilisateur ce qui a été fait et
ce qui ne l'a pas été.

### 5.2 Ce que la 2b a réellement décidé, et pourquoi ce n'est pas transposable

Le projet a déjà rencontré ce dilemme, et sa réponse fut la compensation. Il faut lire **la
raison**, pas la conclusion. D27 :

> « La création du compte est un appel HTTP au service d'authentification de Supabase, le
> marquage du token une écriture SQL. **Aucune transaction ne couvre les deux.** »

La compensation de `sInscrire` est la réponse à une transaction **impossible** — pas une
préférence générale du projet pour la compensation. Partout où une transaction **est** possible,
le projet choisit l'atomicité et le dit : D65 pour la conversion d'un participant, §7.2 de la 2b
pour l'annulation d'une demande, §4.6 de la phase 3 pour la génération des séances. Trois fois
la même phrase : « l'atomicité est tenue **par construction** ».

Ici, les trois écritures sont **toutes du SQL, sur la même base**. Retenir (b) reviendrait à
choisir la garantie faible alors que la forte est disponible, et à le justifier par un précédent
dont la prémisse est absente.

La compensation aurait de surcroît un coût propre, et il est élevé. Défaire la première écriture
signifie **supprimer une fiche `actif`**. Le projet compte **deux** `delete` sur `membres` dans
tout son code applicatif (D26 et D42 (2b)), tous deux gardés par `etat = 'en_attente'` — garde
imposée en revue précisément parce que « la cascade d'une suppression de `membres` emporte
`journal_statuts`, que 20260813170000 désigne comme la seule voie d'effacement complet d'une
personne ». Une compensation ouvrirait le premier `delete` du projet sur une fiche **active**.

### 5.3 L'objection contre (a), et pourquoi elle tombe

L'objection est réelle : une passerelle unique « duplique ou contourne les gardes des trois
existantes ». Elle tombe sur un fait vérifié dans le code :

**Les gardes de ces trois écritures ne sont pas dans l'application. Elles sont dans le SQL.**

- `prive.attribuer_statut` (20260813130000) prend le `for update`, évince le statut exclusif,
  journalise l'éviction, refuse un membre ou un statut inconnu, et n'inscrit un `ajout` que si
  la ligne est neuve.
- `public.definir_arbre` (20260814150000, dernière version) prend le verrou consultatif, refuse
  un membre, un faiseur ou un dirigeant inconnu, et un faiseur **archivé**.
- Les déclencheurs `membres_anti_cycle` et `membres_faiseur_de_disciple_archive` s'appliquent à
  **toute** écriture de la table, quelle qu'en soit l'origine.

Rien de tout cela n'est du TypeScript. Une fonction SQL peut donc **appeler** les deux
passerelles au lieu de les recopier : `perform public.definir_arbre(...)` et
`perform public.attribuer_statut(...)`, avec les privilèges de son propriétaire. **Composer
coûte deux instructions ; recopier coûterait deux copies destinées à diverger.** C'est D82.

Ce qui reste dans l'application, ce sont les **gardes de rôle** — et là, la coïncidence doit
être énoncée plutôt que subie : `attribuer_statut` est normalement atteinte derrière
`exigerAutoriteSur`, la création derrière `exigerAdministrateur`. Sur cet écran, les deux
coïncident, parce que la création est réservée à l'administrateur et qu'un administrateur a
autorité partout. C'est D90, et c'est écrit dans le `comment on function` pour qu'un futur
appelant non-administrateur soit reconnu comme une régression.

### 5.4 La forme retenue, et ce qui reste non atomique

**Forme retenue : (a), une passerelle unique qui compose.**

Ce qui est garanti : après un échec **à n'importe quel point** du corps de la fonction, **rien**
n'a persisté — ni la fiche, ni son arbre, ni ses statuts, ni les lignes de `journal_statuts`.
Postgres le garantit au niveau du langage, sans verrou ajouté.

**La discipline à documenter au point d'appel**, exactement comme D65 et §7.2 de la 2b :
la garantie tient tant que l'appel reste **un unique `rpc`**. Scinder un jour cet appel en deux
ferait disparaître l'atomicité **en silence** — deux transactions séparées, chacune capable de
réussir sans l'autre. Rien dans le code ne l'empêcherait mécaniquement.

**Le piège inverse, et il a déjà coûté au projet.** Postgres n'a pas de transaction autonome.
La 2b l'a payé (D43 (2b)) : `consommer_token_inscription` insérait une tentative puis levait,
l'exception annulait toute la transaction, l'insertion comprise, et le plafond anti-force-brute
était **entièrement inopérant**. La conséquence ici est précise, et elle est le revers exact de
ce qu'on veut : **aucune trace écrite en base depuis l'intérieur de `creer_membre_enrichi` ne
survivrait à son échec.** Le diagnostic doit donc être journalisé **par l'application**, depuis
l'objet d'erreur retourné (`code`, `details`, `message`), comme le font déjà toutes les Server
Actions du dépôt — jamais par une insertion SQL de journalisation, qui serait annulée avec le
reste.

**Ce que la forme (c) aurait donné, et pourquoi on ne la retient pas** : une fiche créée sans
statuts, ou avec statuts et sans arbre, et un écran devant expliquer un état partiel. C'est
tenable — `validerDemandeNouvellePersonne` l'assume explicitement et ordonne ses écritures pour
que l'échec intermédiaire laisse l'état le moins nuisible (« arbre d'abord, état ensuite »). Mais
là, l'ordre est contraint par la nature des écritures (une fiche `actif` détachée serait visible
dans l'annuaire). Ici, il ne l'est pas : on peut simplement ne rien laisser. Retenir (c) quand
(a) est disponible, ce serait accepter d'écrire un message d'état partiel que personne n'a
besoin de lire.

---

## 6. Modèle de données

Migrations strictement **additives** — un seul projet Supabase sert au développement et à la
production.

### 6.1 Aucune table, aucune colonne, aucun index nouveau

Le volet 1 n'écrit que dans des tables existantes (`membres`, `membre_statuts`,
`journal_statuts`). Le volet 2 n'écrit nulle part (D92) et ne lit que `membres`. Les colonnes
d'arborescence existent depuis la 1a ; la règle du dirigeant, l'anti-cycle et la remontée des
ancêtres depuis la 1c.

**Une seule migration nouvelle**, portant la seule passerelle de la phase.

### 6.2 `public.creer_membre_enrichi`

```
public.creer_membre_enrichi(
  p_nom text, p_prenom text, p_telephone text, p_email_contact text,
  p_ville text, p_pays text, p_antenne_id uuid,
  p_situation public.situation_membre, p_domaine_etude text,
  p_report_initial_ael integer,
  p_faiseur_de_disciple uuid, p_dirigeant uuid, p_dirigeant_force boolean,
  p_statuts jsonb,
  p_par uuid
) returns uuid
```

`security definer`, `set search_path = ''`, `revoke execute from public, anon, authenticated`,
`grant execute to service_role`, `comment on function` citant D81, D82, D84 et **D90**.

**Colonnes de la fiche en paramètres explicites, statuts en `jsonb` — et la frontière est
motivée.** Un ensemble **fixe** de colonnes reste en paramètres typés : une clé mal orthographiée
dans un `jsonb` deviendrait une colonne `NULL` **en silence**, exactement le mode de défaillance
que le projet traque. Une liste de **longueur variable** ne peut pas l'être : les statuts arrivent
donc en `jsonb`, lu par `jsonb_to_recordset(... ) as (statut_id uuid, date_acquisition date,
note text)` — une déclaration de types, qui échoue franchement sur une valeur mal formée plutôt
que de retomber sur `NULL`. Côté application, l'appel `rpc` nomme **tous** ses arguments, jamais
de position.

**Corps, dans cet ordre — et l'ordre dit ce qu'il refuse avant d'écrire :**

1. **Refus du couple exclusif** (D84), avant toute écriture. Les groupes sont relus **en base**
   depuis `p_statuts`, jamais pris d'une liste venue de l'écran. Marqueur
   `statuts_exclusifs_incompatibles`, le **seul marqueur nouveau de la phase**.
2. `insert into public.membres (...) values (...) returning id into v_membre`. `etat` n'est pas
   fourni : le défaut de la colonne (`'actif'`) s'applique, comme aujourd'hui dans `creerMembre`.
   `cree_par = p_par`.
   *Note vérifiée* : les deux déclencheurs `before insert or update of faiseur_de_disciple_id`
   se déclenchent aussi **sur l'insertion** — la clause `of colonne` ne restreint que les
   `update`. Ils sortent immédiatement, `new.faiseur_de_disciple_id` étant `null` à ce stade.
3. `perform public.definir_arbre(v_membre, p_faiseur_de_disciple, p_dirigeant,
   p_dirigeant_force)` — **seulement** si l'un des trois est renseigné. Appelée sans condition,
   elle prendrait le verrou et réécrirait trois `null` déjà en place. C'est elle qui prend le
   verrou consultatif (D83) et c'est elle qui refuse un faiseur inconnu, archivé, ou fermant un
   cycle.
4. Boucle sur `p_statuts` : `perform public.attribuer_statut(v_membre, statut_id,
   date_acquisition, note, p_par)`.
5. `return v_membre`.

**Les passerelles publiques sont appelées, pas leurs versions `prive`.** C'est le même point
d'entrée que celui des écrans `/membres/[id]/arbre` et `/membres/[id]/statuts` : les deux chemins
ne peuvent pas diverger, et une correction future de l'un corrige l'autre. Argument de D72,
appliqué aux passerelles.

### 6.3 Index : ce qui existe, et ce qui manque

Un arbre déplié à la demande interroge beaucoup. Ce qui existe déjà sur `membres`
(20260812120000) :

| Index | Sert |
|---|---|
| `membres_faiseur_de_disciple_id_idx (faiseur_de_disciple_id)` | Les disciples d'un nœud **et** les racines (`is null` — un B-tree indexe les NULL) |
| `membres_etat_idx (etat)` | Le filtre `etat = 'actif'` |
| `membres_antenne_id_idx`, `membres_dirigeant_id_idx`, `membres_cree_par_idx` | Sans usage dans cette phase |

**Ce qui manque, et qu'on ne pose pas** (D102) : un index composite couvrant le tri.
`membres_arbre_idx (faiseur_de_disciple_id, nom, prenom, id) where etat = 'actif'` rendrait le
tri des enfants et celui des racines **ordonnés par l'index**, donc sans tri explicite. À
l'échelle de D18, le tri porte sur une poignée de lignes par nœud, et la liste des racines n'est
pas plus lourde que l'annuaire, qui vit sans index de tri depuis la 1c. On pose l'index quand
une mesure le demandera ; il est nommé ici pour qu'on n'ait pas à le rechercher.

### 6.4 L'invariant que trois déclencheurs tiennent et que personne n'a écrit

> **Aucun membre à l'état `actif` n'a d'ancêtre à l'état `archive`.**

Maintenu par trois barrières livrées en 1c et en correctif post-1c, chacune fermant une porte
différente :

| Transition | Barrière | Migration |
|---|---|---|
| Archiver un membre qui a des disciples actifs | `membres_archivage_faiseur_de_disciple` | 20260814120000 |
| Rendre un membre `actif` alors que son faiseur est archivé — **toute** transition vers `actif`, y compris `en_attente → actif` | `membres_desarchivage_faiseur_archive` | 20260814140000 |
| Rattacher à un faiseur archivé, à l'`insert` comme à l'`update` | `membres_faiseur_de_disciple_archive` | 20260814150000 |

Conséquence pour cette phase, et c'est elle qui rend l'arbre sans trou : **un membre archivé ne
peut jamais être un maillon intermédiaire entre une racine et un membre actif.** L'écran ne
s'appuie pourtant pas dessus pour être correct (D98) : il dégrade en « Fiche non consultable » si
l'invariant tombait un jour, plutôt que de mentir sur la profondeur.

---

## 7. Couche domaine — `src/lib/domaine/`

Fonctions **pures**, sans accès à la base, testables au Vitest (§8 de la spécification maîtresse).

- **`statutsIncompatibles(selection, catalogue)`** — dans `statut.ts`. Rend le couple fautif
  (les deux libellés) si deux statuts sélectionnés appartiennent au même groupe **exclusif**,
  `null` sinon. **Échec fermé** : un identifiant sélectionné absent du catalogue fourni ne rend
  pas `null` en silence — il est refusé, parce qu'un catalogue tronqué ou incomplet ne doit pas
  se traduire par « aucun conflit détecté » (§13, point 6). Elle **explique** ; la passerelle
  **protège** (D84).
- **`libelleFiche(id, bref)`** — dans `membre.ts`. Extraite de `/membres/[id]/page.tsx` (D100) :
  `null` si l'identifiant est nul, le nom complet si la fiche a pu être lue, sinon
  `'Fiche non consultable'`. Un seul endroit, deux écrans.
- **Réutilisées telles quelles**, sans une ligne modifiée : `dirigeantPropose`, `peutModifier`,
  `ficheMembreDepuisFormData`, `ficheMembreVersColonnes`, `normaliserDateAcquisition`,
  `normaliserNote`.

Aucune fonction pure nouvelle n'est nécessaire au parcours de l'arbre : le parcours est
**paresseux** et piloté par l'utilisateur, il ne calcule rien à l'avance.

---

## 8. Lectures de l'arbre, et le plafond `max_rows`

PostgREST tronque **en silence** toute lecture non bornée au-delà de `max_rows = 1000`
(`supabase/config.toml:18`). Le dépôt s'en est déjà défendu **cinq fois**, de trois façons
différentes, chacune motivée par une seule question : cette lecture est-elle croisée avec une
autre pour décider d'une **écriture** ?

Ici, **aucune** lecture d'arbre ne décide d'une écriture (D92). La forme retenue est donc la
pagination visible, comme D75 pour les trois listes de la phase 4 — et non le parcours par lots.

### 8.1 Les disciples d'un nœud — `disciplesPage(membreId, page)`

```
from('membres')
  .select('id, nom, prenom', { count: 'exact' })
  .eq('faiseur_de_disciple_id', membreId)
  .eq('etat', 'actif')
  .order('nom').order('prenom').order('id')
  .range(debut, debut + TAILLE - 1)
```

- **`count: 'exact'`** : le nœud affiche « N disciples », jamais la longueur de la page.
  `totalObligatoire` refuse un `count` absent — retomber sur la longueur de la page annoncerait
  « 25 disciples » pour un faiseur qui en a deux cents.
- **Tri TOTAL, `id` en troisième critère.** `(nom, prenom)` n'est pas unique. Sur une liste de
  membres d'une même famille spirituelle, les homonymes ne sont pas une hypothèse d'école : deux
  homonymes exacts à cheval sur une frontière de page peuvent, sous une pagination par décalage,
  être rendus **deux fois** ou **jamais** — « jamais » étant la disparition silencieuse d'une
  personne de la branche de son propre faiseur de disciple. Défaut déjà corrigé sur
  `membres-lots.ts` puis sur `listerMembres` ; on ne le rouvre pas.
- **`verifierTaillePage`** (`pagination.ts`) : lève si la taille atteint 1000. Borner en douce
  masquerait un appel erroné derrière un comportement différent de celui demandé.
- **`PGRST103`** traité **sur la lecture elle-même** : une page hors bornes (signet périmé, ou
  branche qui a rétréci depuis) fait refuser la requête entière, `count` compris. Repli par un
  comptage sans `range`, comme `listerMembres`, pour que l'écran corrige l'adresse au lieu de
  tomber.
- **`disciplesDe` n'est ni appelée ni modifiée** (D94).

### 8.2 Les racines — `racinesPage(page)`

Même forme, `.is('faiseur_de_disciple_id', null)` à la place de `.eq(...)`. Deux différences qui
comptent :

- **Le total est affiché**, en tête d'écran et sans euphémisme. C'est la mesure qui dira si le
  volet 1 réduit le nombre de racines involontaires (D95, D96).
- **L'intitulé est « Membres sans faiseur de disciple »**, « racines de l'arbre » venant en
  glose. Appeler « racine » une fiche que personne n'a rattachée prêterait une intention à un
  oubli.

Si la liste s'avère du même ordre que l'annuaire — ce que ce document tient pour probable —
l'écran reste utilisable : c'est exactement une liste paginée avec une recherche, et le §8.3
donne l'autre porte d'entrée.

### 8.3 La recherche, et ce qu'elle montre

La recherche réutilise **`SelecteurMembre`** (1c) sans modification : saisie, recherche serveur
bornée à `LIMITE_SELECTEUR = 20`, échappement PostgREST partagé (`motifRecherche`), anti-course
sur les réponses lentes. Aucun composant de recherche nouveau — même arbitrage que D76.

Le membre choisi (D97) fait afficher, en une fois :

1. **son chemin depuis la racine, déplié**, le membre mis en évidence ;
2. **la première page de ses disciples**.

**Comment le chemin est lu** (D98), et c'est le point le plus délicat de l'écran :

| Étape | Lecture | Sous RLS ? |
|---|---|---|
| La **forme** du chemin | `public.ancetres_membre(p_membre)` via `clientAdmin()` | **Non** (D19, `security definer`, `service_role`) — identifiants et profondeurs seuls |
| Les **noms** | `membresBrefsParIds(ids)` via `clientServeur()` | **Oui** |
| L'**affichage** de chaque maillon | `libelleFiche(id, bref)` (D100) | — |

Un identifiant présent dans la forme et absent de la lecture sous RLS est rendu
« **Fiche non consultable** », **à sa profondeur**, jamais effacé ni sauté. Aucun nom lu
affranchi de la RLS n'atteint jamais l'écran : la Server Action ne rend que des identifiants.

Le chemin est borné à 64 niveaux par `ancetres_membre` elle-même — borne posée en 1c et
qualifiée de « seule protection restante si une donnée corrompue franchissait un jour les
barrières ».

---

## 9. Politiques RLS et visibilité

**Aucune politique nouvelle, aucune politique modifiée.** La phase lit `membres` sous
`membres_lecture` (réécrite en phase 4, D72, autour de `prive.peut_lire_membre`) et n'écrit que
par une passerelle `service_role`. Aucune politique d'écriture n'existe sur aucune table, et
cette phase n'en crée pas.

### Que voit un compte ordinaire dans l'arbre ?

**Le même arbre qu'un administrateur.** Trois raisons qui se cumulent, et il faut les trois :

1. **D2 et D20** : toute fiche `actif` est lisible de tout compte actif, filiation comprise. Le
   contenu de l'arbre est donc, en droit, ouvert à tous.
2. **D93** : l'arbre est filtré **explicitement** sur `etat = 'actif'`, pour tout le monde, y
   compris l'administrateur. Les fiches `en_attente` et `archive` n'apparaissent donc **pas
   parce que la RLS les cacherait à certains**, mais parce qu'une **règle énoncée** les exclut
   pour tous. La différence n'est pas cosmétique : une exclusion par RLS produit un écran dont
   le contenu dépend du lecteur sans que rien ne le dise ; une exclusion par filtre produit un
   écran dont la règle est écrite et vérifiable — c'est ce que la phase 4 a formulé sous « une
   lecture vidée par la RLS ne doit jamais être affichée comme un résultat » (§8.1).
3. **D99** : un membre archivé ne peut pas être un maillon intermédiaire au-dessus d'un membre
   actif. Il n'y a donc **aucun trou** à combler dans une branche parcourue vers le bas.

**Et si un maillon était malgré tout invisible ?** Il est rendu « Fiche non consultable », à sa
place, et **ses descendants restent atteignables** (D98). Un nœud invisible ne fait jamais
disparaître sa descendance : c'est précisément ce que l'on a refusé pour la fiche membre en 1c —
effacer un faiseur de disciple illisible « ferait mentir l'écran », en affichant « — » là où un
administrateur voit un nom sur la même fiche.

**Rappel de la règle du couple**, que cette phase applique sans exception :
`exigerAutoriteSur` **redirige** et garde ; `aAutoriteSur` rend un booléen qui sert **à
l'affichage** et n'est **jamais** une barrière. L'arbre n'appelle ni l'un ni l'autre : il ne
protège rien, il n'affiche que ce que la RLS a bien voulu rendre. Le seul usage d'un booléen de
rôle y est `estAdministrateur()`, pour décider d'afficher ou non le lien « Rattacher » vers
l'écran existant — un lien, pas un pouvoir.

---

## 10. Écrans, gardes et chemins d'écriture

### 10.1 Écrans

| Écran | Contenu | Accès |
|---|---|---|
| `/membres/nouveau` (existant, **refondu**) | Fiche + statuts + faiseur de disciple + dirigeant, tous facultatifs ; proposition du dirigeant à chaque changement de faiseur (D88) ; refus nommé du couple exclusif (D84) ; **tous les champs contrôlés** (D85) ; une seule soumission | `exigerAdministrateur`, **première instruction** de la page et de l'action (D90) |
| `/arborescence` (**nouveau**) | Racines paginées et dénombrées (D95) ; dépliage nœud par nœud (D94, D101) ; recherche menant au chemin déplié (D97) ; fil d'Ariane et indentation plafonnée (D104) ; par nœud, un lien vers `/membres/[id]` et — pour l'administrateur seul — vers `/membres/[id]/arbre` | Consultation : **tout compte actif** (`exigerProfilActif`), conformément à D2 et D20 |
| `/membres/[id]` (existant) | Inchangé, sauf l'extraction de `libelleFiliation` vers `libelleFiche` (D100), à comportement **identique**, et un lien vers `/arborescence` | Inchangé |
| `/membres/[id]/arbre`, `/membres/[id]/statuts`, `/membres/[id]/modifier` (existants) | **Inchangés** (D89) | Inchangés |
| `/tableau-de-bord` (existant) | Lien « Arborescence », rendu comme les autres liens de navigation | Tout compte actif |

**Le formulaire de création n'affiche pas les statuts sous forme de cases pour tout le
catalogue.** Il réutilise le motif de `FormulaireStatut` — un choix dans un `<select>` groupé par
groupe, avec sa date et sa note — répété à la demande, la liste des lignes vivant dans l'état du
composant. Contrôlé par construction, donc conforme à D85, et cohérent avec l'écran de gestion
des statuts que l'utilisateur retrouvera ensuite.

### 10.2 Recensement des chemins d'écriture

Obligatoire pour la revue (piège n°10 de la phase 3) : cette phase écrit sur des tables **déjà
livrées**.

| Table ou objet | Chemins d'écriture **après** cette phase |
|---|---|
| `membres` (insert) | ~~`creerMembre`~~ **remplacée** par `creer_membre_enrichi` (D87), `sInscrire` (fiche `en_attente`), `soumettreDemandeSuivi`, `convertir_participant_externe` chemins 1 et 2 |
| `membres.faiseur_de_disciple_id` | `modifierMembre`, `public.definir_arbre`, `convertir_participant_externe` chemin 2, **`creer_membre_enrichi` (nouveau — via `definir_arbre`, donc sous le verrou)**. `validerDemandeNouvellePersonne` passe désormais par `definir_arbre` : l'écart signalé au §11 point 8 de la phase 4 est **fermé** (§13, point 10) |
| `membre_statuts`, `journal_statuts` | `public.attribuer_statut`, `public.retirer_statut`, **`creer_membre_enrichi` (nouveau — via `attribuer_statut`)** |
| Politiques RLS | **Aucune** créée, modifiée ou supprimée |
| Déclencheurs | **Aucun** créé, modifié ou supprimé |
| `/arborescence` | **Aucun chemin d'écriture** (D92) — et ce vide est une assertion à vérifier, pas un constat |

---

## 11. Preuves exigées

Dans le prolongement des phases précédentes : **contrôle positif** sur toute vérification par
recherche, **preuve par mutation** sur chaque barrière, et une **écriture réelle constatée en
base** quand une barrière tombe — jamais un simple refus.

1. **Atomicité de la création enrichie (D81), par mutation.** Insérer un `raise exception` entre
   l'insertion de la fiche et la boucle des statuts, dans `creer_membre_enrichi`. Rejouer une
   création enrichie complète et constater, par **quatre lectures distinctes dans le même
   test**, que **rien** n'a persisté : ni la fiche, ni ses colonnes d'arbre, ni ses
   `membre_statuts`, ni ses lignes de `journal_statuts`. Restaurer, comparer
   `pg_get_functiondef` avant/après. **Contrôle positif obligatoire avant** : la même création,
   sans la mutation, réussit et les quatre sont présents — sans quoi les quatre absences
   pourraient être vraies pour une tout autre raison.
2. **La composition n'a pas été remplacée par une copie (D82), par le comportement.** Depuis le
   **nouveau chemin** : créer avec un faiseur de disciple **archivé** → refus
   `faiseur_de_disciple_archive` et **aucune fiche en base** ; créer avec un dirigeant inconnu →
   `dirigeant_inconnu` et aucune fiche ; créer avec un statut désactivé → refus. Les trois
   prouvent que les vérifications des passerelles appelées mordent bien à travers la nouvelle
   porte. **Fil-piège complémentaire, et présenté comme tel** : `pg_get_functiondef` de
   `creer_membre_enrichi` contient bien `definir_arbre` et `attribuer_statut`, et ne contient
   **ni** `update public.membres set faiseur_de_disciple_id` **ni** `insert into
   public.membre_statuts`. Une assertion sur un texte de définition est fragile ; elle est
   écrite parce que toute la valeur de D81 est dans la composition, et qu'une recopie serait
   verte partout ailleurs.
3. **`revoke execute` sur `public.creer_membre_enrichi`** depuis `anon` et `authenticated`, avec
   le contrôle positif que `service_role` réussit le même appel.
4. **Une création nue est identique à l'ancienne (D86).** Créer par le nouveau chemin sans aucun
   enrichissement, puis relire la ligne **colonne par colonne** : `etat = 'actif'`,
   `faiseur_de_disciple_id` et `dirigeant_id` nuls, `dirigeant_force` faux, `cree_par` égal au
   profil administrateur, **zéro** `membre_statuts`, **zéro** `journal_statuts`. C'est la preuve
   qui autorise D87 ; sans elle, le remplacement serait un pari.
5. **Refus du couple exclusif (D84), deux fois.** (a) Vitest sur `statutsIncompatibles` : couple
   du même groupe exclusif → refus nommant les deux ; couple d'un groupe non exclusif →
   accepté ; **statut absent du catalogue → refusé, pas ignoré** (échec fermé). (b) Appel `rpc`
   **forgé** portant le couple, contournant la fonction pure : marqueur
   `statuts_exclusifs_incompatibles` **et** vérification en base qu'aucune fiche, aucun statut,
   aucune ligne de journal n'a été écrit. Contrôle positif dans le même test : le même appel
   avec un seul des deux statuts réussit.
6. **La saisie survit à un refus (D85).** Suite `tests/e2e-prod/`, seul endroit du dépôt qui
   attrape cette classe : remplir **tous** les champs, provoquer un refus retourné (couple
   exclusif, ou faiseur archivé), puis vérifier que le message s'affiche **et** que **chaque
   champ porte encore sa valeur**. Contrôle positif : une création valide redirige vers la
   fiche. **C'est la première preuve de cette classe dans le projet** — les quatorze composants
   recensés au README n'en ont aucune.
7. **Le refus est retourné, pas levé.** Même suite, build de production réel : le texte affiché
   est celui de `messages.ts`, jamais `Minified React error #441` ni le texte statique de
   `src/app/error.tsx`.
8. **Garde forgé sur la création enrichie (D90).** Requête forgée par un compte **simple**, puis
   par un compte **modérateur**, contre `creerMembreEnrichi` ; vérification **en base** de
   l'absence de fiche, de statut et de ligne de journal. **Canari** dans un contexte neuf : un
   administrateur réel réussit le même geste — sans quoi « rien n'a été écrit » ne distingue pas
   « la garde tient » de « le mécanisme de test a cassé ».
9. **Pagination et tri total des disciples (D94).** Créer N+1 disciples sous un même faiseur avec
   une taille de page **abaissée** (jamais 1001 lignes réelles), parcourir **toutes** les pages,
   et asserter sur **l'ensemble des identifiants collectés** : aucun doublon, aucun manquant.
   Plus la vérification que le total annoncé (`count: 'exact'`) est le total réel. **Et le cas
   qui justifie le troisième critère de tri** : deux disciples **homonymes exacts** (même nom,
   même prénom) placés à cheval sur une frontière de page. C'est le motif déjà écrit pour
   `presencesDeSeanceParLots(client, seanceId, 2)`.
10. **Pagination et tri total des racines (D95)**, même protocole. Plus : le total affiché est
    vérifié contre un `count: 'exact'` calculé indépendamment — pas contre la somme des pages
    parcourues, qui vient de la même requête.
11. **`disciplesDe` n'a pas bougé (D94).** Le contrôle amont d'`archiverMembre` continue de
    refuser l'archivage d'un membre ayant un disciple actif **et de le nommer**. Contrôle
    positif dans le même test : archiver un membre sans disciple actif réussit. C'est la preuve
    que l'on demande à chaque fois qu'une fonction est **dupliquée plutôt que modifiée**.
12. **L'arbre ne montre que des membres actifs (D93), et le prouve depuis l'administrateur.**
    Une fiche `archive` et une fiche `en_attente` sont absentes de la liste des racines et de
    toute liste de disciples **pour un administrateur** — dont la RLS, elle, les laisserait
    passer. Contrôle positif dans le même test : ce même administrateur les ouvre bien par lien
    direct sur `/membres/[id]`. Une absence dont on n'a pas prouvé que la fiche existe et est
    lisible par ailleurs ne prouve rien.
13. **Un compte ordinaire voit le même arbre qu'un administrateur (D93).** Deux comptes réels,
    le même nœud, la **même** liste de disciples et le **même** total. Contrôle positif dans le
    même test : le compte ordinaire ne lit **pas** une fiche archivée par lien direct — sans
    quoi l'égalité pourrait être celle de deux résultats vides.
14. **« Fiche non consultable » à sa place (D98, D100), au Vitest.** La règle extraite est une
    fonction pure : identifiant nul → `null` ; identifiant présent et fiche lue → le nom complet ;
    identifiant présent et fiche **absente de la lecture RLS** → `'Fiche non consultable'`. Plus
    une assertion sur la **composition du chemin** : un identifiant illisible conserve sa
    profondeur et ne fait disparaître aucun descendant.
    **Ce qui n'est délibérément PAS exigé** : la preuve de bout en bout du même cas. La produire
    demanderait de **désactiver** `membres_archivage_faiseur_de_disciple` sur la base unique du
    projet pour fabriquer un état que D99 rend inatteignable. Une contrainte retirée se voit dans
    `pg_get_constraintdef` ; **un déclencheur désactivé ne se voit dans aucun `pg_get_triggerdef`**
    — seul `pg_trigger.tgenabled` le porte. Le rapport entre ce que la preuve ajouterait et le
    risque qu'elle fait courir à une base de production est mauvais, et l'arbitrage est écrit ici
    plutôt que laissé à l'implémentation.
15. **Le dépliage est gardé (D103).** Appel forgé aux Server Actions de `/arborescence` sans
    session : redirection vers `/deconnexion`. Contrôle positif : un compte **ordinaire** réussit
    le même appel — l'arbre est ouvert à tout compte actif, pas aux visiteurs.
16. **Le volet 2 n'écrit rien (D92).** Balayage de `src/app/arborescence/` : aucun `clientAdmin()`,
    aucun `insert`, `update`, `delete` ni `rpc` d'écriture, et le recensement du §10.2 refait
    module par module. La preuve d'un vide est un balayage, pas une impression.
17. **Nettoyage, et comptages en DELTA.** Les suites écrivent dans la base qui sert aussi de
    production : **tout comptage absolu y est faux pour toujours** — un test a déjà été mis en
    échec par un token que l'administrateur réel avait créé le soir même. Le nombre de racines,
    le nombre de disciples, le nombre de lignes de journal se mesurent **avant et après**, et
    l'assertion porte sur la **différence**. Ordre de suppression : les **disciples avant leurs
    faiseurs** (`faiseur_de_disciple_id` est `on delete set null` : supprimer un faiseur d'abord
    détacherait ses disciples en silence et en ferait des racines), `membre_statuts` et
    `journal_statuts` partant en cascade avec la fiche. Le comptage de contrôle est
    **indépendant** du balayage, jamais déduit de son absence d'erreur.

**Aucun nouveau parcours Playwright canonique.** Le §8 de la spécification maîtresse fixe
**quatre** parcours pour tout le projet, et aucun ne concerne la création d'un membre ni
l'arborescence. Cette phase n'en ajoute pas d'office ; elle ajoute deux specs dédiées qui ne
peuvent pas se faire autrement — la survie de la saisie (n°6) et la visibilité différenciée
(n°12, n°13). Comme toutes les specs du dépôt : `workers: 1`, un seul serveur partagé.

---

## 12. Pièges connus, portés dans la conception

1. **Un refus métier levé n'atteint pas l'utilisateur — mais pas partout de la même façon.** La
   règle est constante : une Server Action **retourne** son refus dans `{ erreur }`. La raison,
   elle, dépend de l'écran, et la nuance a été établie récemment. Sur `/membres/nouveau`, le
   formulaire lit `etat.erreur` d'un `useActionState` : il **n'attrape aucune exception**, donc
   une exception levée n'y produirait **pas** `Minified React error #441` — elle remonterait à
   `src/app/error.tsx`, qui affiche un texte **statique** et ne lit jamais `error.message`, en
   développement **comme** en production. Le digest anglais reste réservé aux composants qui
   attrapent l'exception pour afficher `error.message` — `comptes/ligne-compte.tsx` est le seul
   du dépôt dans ce cas, et il est **connu, mesuré, non corrigé**. Ici, le coût d'un `throw` est
   la perte du **motif nommé** au profit d'un refus générique. Les deux raisons convergent, il
   faut savoir laquelle s'applique : la citer de travers dans une revue ferait chercher un défaut
   au mauvais endroit.
2. **React réinitialise les champs non contrôlés d'un `<form action>` à toute complétion, y
   compris sur un refus retourné.** **Quatorze** composants du dépôt sont atteints, sur
   trente-quatre porteurs d'un `<form action>` ; `membres/formulaire-membre.tsx` en est le
   deuxième pire cas avec **9** champs libres, et cette phase lui en ajoute. **C'est le pire cas
   possible de tout le dépôt après cette phase si rien n'est fait**, et c'est le seul des
   quatorze que cette phase corrige (D85). Remède : champs contrôlés (`value` + `onChange`) ; si
   une remise à zéro **au succès** est voulue, elle se garde par le `useRef` documenté au README,
   qui ferme la course au montage **par construction** — `enCoursPrecedent` est initialisé avec
   la valeur du premier rendu, nécessairement `false`.
3. **`redirect()` lève une exception de contrôle Next.js : jamais dans un `try`.** Concerne la
   redirection finale de la création vers `/membres/<id>` et la correction de page hors bornes de
   `/arborescence`. La classification de l'erreur `rpc` se fait **avant** toute redirection, et
   la redirection est la dernière instruction.
4. **Ne jamais discriminer une erreur Postgres sur son texte français.** Uniquement `error.code`
   ou le marqueur posé dans `error.details`. Cette phase ajoute **un seul** marqueur nouveau,
   `statuts_exclusifs_incompatibles`, et **réutilise** tous les autres avec leur sens
   existant — conséquence directe de D82 : `membre_inconnu`, `statut_inconnu`, `faiseur_inconnu`,
   `dirigeant_inconnu`, `faiseur_de_disciple_archive`, `cycle_faiseur_de_disciple`, et le code
   `23514` de l'invariant d'exclusivité. Aucun marqueur existant n'est réemployé pour un sens
   différent.
5. **Aucune politique RLS d'écriture, sur aucune table.** Toute mutation passe par une Server
   Action gardée **en première instruction**. Cette phase ne fait pas exception, et n'a pas
   besoin du cas dérogatoire des actions de statuts, où le garde suit la lecture de l'identifiant
   dont il dépend : `exigerAdministrateur` ne dépend d'aucun paramètre du formulaire.
6. **Les suites de tests écrivent en base de production.** Tout comptage **absolu** y est faux
   pour toujours — un test a été mis en échec par un token que l'administrateur réel avait créé
   le soir même. **Compter des deltas** (§11, n°17). Et le corollaire propre à cette phase : si
   une preuve devait un jour **désactiver un déclencheur**, l'état désactivé **ne se voit dans
   aucun `pg_get_triggerdef`** — seul `pg_trigger.tgenabled` le porte. C'est pour cela que la
   preuve de bout en bout de D98 n'est pas exigée (§11, n°14).
7. **PostgREST tronque en silence au-delà de `max_rows = 1000`.** Le dépôt l'a corrigé **cinq
   fois**. Sur l'arbre, une troncature ne produirait pas une page incomplète : elle produirait
   une **branche amputée sans le moindre signal**, indistinguable d'un faiseur de disciple qui
   aurait exactement mille disciples. Les deux lectures de la phase sont paginées, bornées et à
   tri total (D94, D95).
8. **Un tri de pagination doit être TOTAL.** Deux homonymes exacts à cheval sur une frontière
   peuvent être rendus deux fois **ou jamais**. `id` en dernier critère, sans exception, et une
   preuve qui construit réellement le couple d'homonymes (§11, n°9). Aucune spécification SQL ne
   garantit l'ordre des ex æquo sans tri total, **même quand une mutation sur deux lignes ne
   parvient pas à mettre le défaut en évidence** sur un plan Postgres donné — résultat négatif
   consigné tel quel en phase 3.
9. **Le compte racine n'a pas de fiche membre.** Il n'apparaît dans aucun nœud de l'arbre — non
   par filtrage, mais parce que toutes ces lectures partent de `membres`. S'il est l'auteur d'une
   création enrichie, `cree_par` et `par_profil_id` portent son profil, ce qui est correct et
   déjà le cas aujourd'hui. `peutModifier` continue de lui refuser toute portée d'autorité :
   il n'agit qu'en tant qu'administrateur.
10. **Une passerelle qui compose n'hérite pas des gardes APPLICATIFS des passerelles qu'elle
    appelle.** `attribuer_statut` est normalement atteinte derrière `exigerAutoriteSur` ; à
    travers `creer_membre_enrichi`, elle l'est derrière `exigerAdministrateur`. Les deux
    coïncident aujourd'hui parce que la création est réservée à l'administrateur et qu'un
    administrateur a autorité partout — **une coïncidence, pas une construction**. Le
    `comment on function` doit le dire, et tout futur appelant non-administrateur de cette
    passerelle est une régression, pas une réutilisation.
11. **Un chemin d'écriture non recensé.** Cette phase remplace un chemin d'insertion sur
    `membres` et en ouvre un troisième vers `membre_statuts` : le tableau du §10.2 est la liste à
    refaire module par module pendant la revue, pas seulement les objets neufs.
12. **Un amendement qui ne vit que dans une partie des documents.** C'est le piège qui a coûté
    deux phases au §4.4. Cette phase le déclenche à son tour : le §9 de la spécification
    maîtresse ne connaît pas de phase 5, le §4.2 promet depuis le premier jour un dirigeant
    proposé à la création qui n'existait pas, et le README annonce une « phase 5 (refonte
    UI/UX) » qui n'est pas celle-ci. **Règle à appliquer** : chercher dans **tous** les documents
    chaque phrase qui nomme l'ancien état avant de considérer l'amendement posé. Voir §13 et §15.
13. **Une erreur non vérifiée qui échoue en silence.** Chaque lecture de `/arborescence` doit
    distinguer « aucun disciple » d'« échec de lecture » : rendre une liste vide sur une erreur
    ferait croire à un faiseur de disciple sans personne, ce qui est la même famille de mensonge
    que la troncature. `throw`, jamais `[]` — discipline constante de `src/lib/donnees/`.

---

## 13. Contradictions et lacunes relevées dans les documents existants

Signalées plutôt que lissées. Les points 2, 4 et 10 sont **fermés** par ce document ou par le
code ; les autres sont **constatés** et, pour certains, demandent un arbitrage (§15).

1. **Le §9 de la spécification maîtresse ne connaît aucune phase 5.** Le tableau « Découpage en
   phases » va de 0 à 4 et se termine par « Les phases 3 et 4 sont indépendantes ». Le périmètre
   de ce document n'existe donc dans **aucun** document du projet. Un amendement daté du §9, sur
   le modèle exact de D54, le fermerait. **Ce document ne l'a pas écrit** : il n'a pas plus
   d'autorité sur le découpage que la phase 4 n'en avait sur le §8. **À arbitrer.**
2. **Le §4.2 promet le dirigeant proposé « à la création d'un membre » depuis le 2026-08-11, et
   la promesse n'a jamais été tenue.** La 1c n'a livré que la seconde moitié de la phrase — « et
   à chaque changement de faiseur de disciple » —, faute d'un faiseur saisissable à la création.
   La spécification est donc **factuellement fausse sur ce point depuis quatre phases**.
   **Fermé** par D88 : la phrase redevient vraie sans qu'un mot ait à changer. C'est le
   mécanisme du piège n°12 de la phase 4 appliqué non à un rôle mais à une **fonctionnalité**.
3. **Le README annonce que la phase 5 est « (refonte UI/UX) ».** Textuellement : « **Statut :
   connu, mesuré, non corrigé hors phase 4.** À traiter en phase 5 (refonte UI/UX), et **le cas
   public mérite d'être traité avant les autres**. » La phase 5 définie ici n'est pas celle-là.
   Deux lectures s'affrontent, et il faut choisir : soit cette phase absorbe la remédiation des
   quatorze composants — elle n'en corrige **qu'un**, D85 —, soit la phrase du README est
   amendée. Le point aigu : le README dit que le **cas public** (`inscription/formulaire-inscription.tsx`,
   8 champs, aucun rattrapage, en production) mérite la priorité, et cette phase corrige le
   **deuxième** pire cas en laissant le premier intact. Corriger le second et laisser le premier
   est un choix défendable — il ne doit pas être fait par inadvertance. **À arbitrer.**
4. **L'invariant « aucun membre `actif` n'a d'ancêtre `archive` » n'est écrit nulle part**, alors
   que **trois** déclencheurs le tiennent chacun d'un côté (20260814120000, 20260814140000,
   20260814150000). C'est lui qui rend l'arbre sans trou pour un compte ordinaire, et rien dans
   la documentation ne dit qu'il existe : une modification future pourrait le casser sans savoir
   ce qu'elle casse. **Écrit ici**, §6.4 et D99.
5. **`disciplesDe` est non bornée et son tri n'est pas total.** Elle a deux appelants : le
   contrôle amont d'`archiverMembre` — où la troncature est inoffensive, seule `length > 0` étant
   lue — et la section « Disciples actifs » de `/membres/[id]`, qui **rend la liste entière**.
   À l'échelle de D18, un membre à plus de mille disciples actifs est peu vraisemblable, mais la
   lecture ne porte **aucune borne et aucun signal**, et son tri sur `(nom, prenom)` n'est pas
   total. **Non corrigée par cette phase** — l'arbre emploie une fonction neuve (D94) — et
   signalée : c'est la sixième occurrence de la même famille, après les cinq déjà corrigées.
6. **`listerCatalogue` est non bornée, et cette phase en fait une lecture croisée avec une autre
   pour décider d'une écriture.** Elle alimentera la liste des statuts sélectionnables ; le
   couple exclusif se décide en croisant la sélection avec les groupes. À cinq statuts amorcés le
   risque est théorique, mais le **type** de lecture change de nature avec cette phase — c'est
   exactement la question que le README pose pour choisir entre ses trois remèdes. Réponse
   retenue, et elle ne demande pas de corriger `listerCatalogue` : la barrière vit dans la
   **passerelle**, qui relit les groupes en base (D84), et la fonction pure amont **échoue
   fermée** sur un statut absent du catalogue qu'on lui donne.
7. **`statutsDuMembre` et `journalDuMembre` sont non bornées elles aussi.** Le journal d'un
   membre croît sans limite avec le temps. Hors périmètre ; noté pour que « corrigé cinq fois »
   ne masque pas celles qui ne l'ont pas été.
8. **La collision D36–D43 n'est toujours pas arbitrée.** Huit numéros portent deux contenus
   différents, l'un en 2b, l'autre en phase 3. La spécification maîtresse a posé la règle de
   citation (« D36 (2b) » / « D36 (phase 3) ») ; elle n'a rien renuméroté, et ne le fera pas —
   les `comment on` en base citent ces numéros. Statu quo hérité, **à arbitrer** une bonne fois.
9. **Le renvoi vers D30–D80 dans le §2 de la spécification maîtresse a bien été ajouté** (note du
   2026-08-14, avec sa table des plages). Le point 3 du §11 de la phase 4 est donc **clos** ; il
   ne doit pas être rouvert. Cette phase demande seulement d'y ajouter la ligne
   « D81 à D105 | `2026-08-15-phase-5-creation-arbre-design.md` ».
10. **L'écart signalé au §11, point 8 de la phase 4 est fermé — par le code, pas par un
    document.** `validerDemandeNouvellePersonne` écrivait `faiseur_de_disciple_id` par un
    `update` direct, sans le verrou consultatif « arbre » ; elle appelle désormais
    `public.definir_arbre`, avec un commentaire qui nomme l'écart et sa fermeture
    (`src/app/demandes/actions.ts`). Le §13 de la phase 4 le liste encore comme « à trancher » :
    **il ne l'est plus**, et le signaler évite qu'on le « corrige » une seconde fois.
11. **Deux doctrines de pagination coexistent sans arbitre.** D75 (phase 4) impose la pagination
    à tri total à toutes ses listes en invoquant `max_rows` ; D29, D46 et D53 assument
    explicitement l'absence de pagination pour le pointage AEL et pour la liste des membres d'une
    antenne, **sans jamais mentionner `max_rows`**. Si une antenne dépassait mille membres actifs,
    la liste de pointage serait **silencieusement tronquée** et D29 — « voir toute l'assistance » —
    serait faux sans la moindre erreur. Hors périmètre ; signalé parce qu'aucun des deux
    documents ne le dit.
12. **Le §6 de la spécification maîtresse suppose les racines peu nombreuses**, et rien ne le
    garantit : « les tout premiers sans faiseur de disciple, ce sont les racines de l'arbre »
    décrit un **amorçage**, pas une règle. `creerMembre` n'a jamais écrit de
    `faiseur_de_disciple_id` : toute fiche créée depuis la 1a est une racine jusqu'à ce que
    quelqu'un ouvre l'écran de rattachement. L'hypothèse implicite est traitée comme telle par
    D95, et le volet 1 la referme pour l'avenir.
13. **`/membres/[id]/arbre` s'appelle « arbre » et n'est pas un arbre** : c'est l'écran de
    rattachement d'un seul membre, réservé à l'administrateur, dont le titre à l'écran dit
    d'ailleurs « Rattachement de … ». L'ambiguïté est fermée **par le choix du nom du nouvel
    écran** (D91, `/arborescence`), pas par un renommage : la route existante est déployée et
    liée depuis la fiche.

---

## 14. Ce que la phase ne livre pas, et pourquoi

- **Aucune édition depuis l'arbre** (D92, décision utilisateur). Les rattachements restent sur la
  fiche, où la portée d'autorité, le verrou consultatif et l'anti-cycle sont déjà éprouvés.
- **Aucune table de fermeture, aucun matériel de parcours nouveau.** D15, amendée par D18, tient :
  la liste d'adjacence reste le bon choix, c'est la **profondeur** qui compte et elle reste
  faible. Rien dans cette phase ne la remet en cause.
- **Aucun index nouveau** (D102) — l'index candidat est nommé, il attend une mesure.
- **Aucun index de recherche** (trigramme). Même arbitrage qu'en 1c, §6.2, et pour la même
  raison : le joker initial d'`ilike '%terme%'` rend un B-tree inutile, et le parcours séquentiel
  reste rapide à cette échelle. On paginera avant d'indexer.
- **Aucun indicateur « ce nœud a des disciples »** (D101), donc aucune vue d'agrégation.
- **Aucune vue d'ensemble de l'arbre**, aucun rendu graphique, aucun export. L'écran est un
  parcours, pas une cartographie.
- **Aucune correction des treize autres formulaires à champs libres** (§13, point 3), **ni du cas
  public**, qui est le pire des quatorze et qui est en production.
- **Aucune correction de `disciplesDe`, `listerCatalogue`, `statutsDuMembre` ni `journalDuMembre`**
  (§13, points 5, 6 et 7).
- **Aucun statut ni arbre sur l'écran de modification** (D89).
- **Aucune notification.** Créer un membre ne notifie personne aujourd'hui, et cette phase ne
  change pas ce périmètre.
- **Aucune renumérotation** des décisions malgré la collision D36–D43 : le code cite ces numéros
  en base.

---

## 15. À trancher

Quatre points, tous exposés au §13, et aucun bloquant pour l'implémentation.

- **L'amendement du §9 de la spécification maîtresse** (§13, point 1) — écrire une ligne
  « Phase 5 » datée, sur le modèle de D54, ou assumer explicitement que la phase existe hors
  découpage. Ne rien faire reproduirait le piège n°12 dès la première ligne de cette phase.
- **La phrase du README sur « la phase 5 (refonte UI/UX) »** (§13, point 3) — l'amender, ou
  élargir cette phase à la remédiation des quatorze composants. Et, dans les deux cas, décider
  sciemment du sort du **cas public**, que le README désigne comme prioritaire et que cette phase
  ne touche pas.
- **La collision D36–D43** (§13, point 8) — note de désambiguïsation, préfixe de phase, ou statu
  quo assumé. Ouvert depuis la phase 4.
- **La divergence des doctrines de pagination D29/D46/D53 contre D75** (§13, point 11) — combler
  la borne manquante sur le pointage AEL, ou écrire pourquoi la troncature silencieuse y est
  acceptable là où elle ne l'est nulle part ailleurs.

Cette section est conservée **avec** ses points ouverts, plutôt que vidée par des décisions que
ce document n'a pas l'autorité de prendre : les quatre portent sur des documents ou du code que
la phase 5 ne livre pas.
