# Phase 4 — Événements : types, événements, participants externes, trois désirs, liste à traiter, conversion

**Date :** 2026-08-14
**Statut :** design proposé, prêt pour revue avant plan d'implémentation
**Spécification maîtresse :** `2026-08-11-suivi-asonkeng-design.md` — ce document ne la remplace
pas. Il précise ce que la phase 4 livre, en particulier le §4.4 (Événements), le §5.2 amendé par
D16 et D23, le §5.3 (traduction technique) et le §6 (parcours « Événement et conversion »). Le
ton, la structure et le niveau de détail suivent `2026-08-13-phase-3-ael-design.md`.

**Ce document corrige la spécification maîtresse.** Voir §2 et D54 : le dernier paragraphe du
§4.4 contredisait D23 depuis deux phases. La correction est portée dans la spécification
elle-même, datée comme les autres amendements, plutôt que contournée ici.

---

## 1. Objet

Les phases 0 à 3 livrent le socle, le registre des membres, leur arborescence, leurs statuts,
les comptes qui les administrent, les circuits d'inscription et de demande, et l'AEL complet.
Aucune n'a touché aux événements : `types_evenement`, `evenements`, `participants_externes`,
`participations` et la vue `seminaires_assistes` n'existent nulle part — ni en base, ni dans
`src/`, ni dans `tests/`. La phase 4 part d'une page blanche.

Elle livre le catalogue des types d'événement, les événements eux-mêmes, les participants —
membres et externes —, les trois désirs, la liste « à traiter », et la conversion d'un
participant externe en membre par l'un des trois chemins que l'utilisateur a arbitrés. C'est
elle qui rend exploitable le canal d'entrée que D13 désigne depuis le premier jour : les
séminaires.

**Hors périmètre de ce document** : tout ce que les phases 0 à 3 ont déjà livré et que cette
phase se contente de réutiliser (`SelecteurMembre`, `exigerModerateurOuAdministrateur`,
`clientAdmin()`, les helpers de pagination, le circuit de validation des demandes). Ce qui est
réutilisé est nommé, jamais réécrit.

---

## 2. La contradiction du §4.4, et sa correction

Le §4.4 de la spécification maîtresse se terminait encore par ceci :

> « [...] tandis que la table `participations` elle-même reste réservée à l'administrateur. Les
> trois désirs sont des informations sensibles : ils ne quittent jamais le périmètre admin. »

Et, quelques lignes plus haut : « alimentent la liste "à traiter" de **l'admin** ».

**C'est faux depuis l'amendement D23 du 2026-08-12.** D23 ouvre au modérateur la création d'un
événement, la **saisie** et — conséquence tirée en même temps, et assumée dans le texte de D23
lui-même — la **consultation** des trois désirs. Le §5.2 le dit (ligne « Voir les trois désirs
exprimés lors d'un événement » : modérateur ✅), D16 le dit (« les trois désirs des seuls
administrateurs **et modérateurs** (amendée par D23) »), et le §5.3 le traduit déjà en RLS
(« `participations`, `participants_externes` : Administrateur **ou modérateur** »).

Seul le §4.4 était resté en arrière. Et le §6, dont le parcours « Événement et conversion »
commence encore par « L'admin crée l'événement » — alors que D23 ouvre précisément ce geste au
modérateur.

Le paragraphe a survécu à deux phases parce que personne n'était allé le relire : D22 et D23 ont
été écrits ensemble, D22 a été appliqué en phase 3 et vérifié, D23 attendait la phase 4. Un
amendement qui vit dans trois endroits sur cinq n'est pas un amendement, c'est un piège — et il
est enregistré comme tel au §10, piège n°12.

**Le coût de cet élargissement n'est pas rouvert ici.** Il est déjà assumé et écrit dans D23 : le
cercle des personnes voyant ces confidences s'élargit d'un rôle. Ce document en tire les
conséquences techniques, il ne rediscute pas la décision.

---

## 3. Décisions prises pendant ce cadrage

Elles prolongent le tableau du §2 de la spécification maîtresse. Les décisions déjà prises par
l'utilisateur — les trois chemins de conversion, la recherche plus la création à la volée, le
vidage de la liste par conversion ou par classement motivé — ne sont pas rouvertes : elles sont
mises en œuvre, et les décisions ci-dessous comblent ce qu'elles ne précisent pas.

> **Numérotation.** Les numéros de décision sont globaux au projet. Les phases précédentes vont
> jusqu'à **D53** ; cette table reprend à **D54**. Attention en relisant les documents anciens :
> **D36 à D43 sont attribués deux fois**, une fois par le design de la phase 2b et une fois par
> celui de la phase 3, avec des contenus différents — voir §11, point 2. Ce document ne
> renumérote rien (les commentaires SQL en base citent déjà ces numéros), il signale.

| # | Décision | Justification |
|---|---|---|
| D54 | Le dernier paragraphe du §4.4 **et** le parcours « Événement et conversion » du §6 de la spécification maîtresse sont **corrigés à la source**, par un amendement daté du 2026-08-14, plutôt que réinterprétés en silence dans ce document | Trois endroits disaient une chose (D16, §5.2, §5.3) et deux en disaient une autre (§4.4, §6). Un design de phase qui se contenterait d'appliquer la bonne version laisserait la mauvaise en place pour la phase suivante et pour tout lecteur futur — exactement le mécanisme qui a fait survivre la contradiction pendant deux phases. La correction est datée comme l'ont été D22, D23, D27 et D50, pour qu'on puisse lire quand et pourquoi le texte a changé |
| D55 | Le **classement sans suite** d'un participant est réservé à l'**administrateur seul**, comme la conversion ; la **consultation** de la liste « à traiter » suit la ligne existante « Voir les trois désirs » et reste ouverte au modérateur. Une ligne est proposée à la matrice du §5.2, sur le modèle de D50 | La matrice est **silencieuse** sur ce geste, qui n'existait dans aucun document avant la décision utilisateur qui l'a créé. Elle n'est pas réinterprétée : son silence est constaté et comblé. Sur l'accès : conversion et classement sont les **deux seules** façons de vider la liste ; en réserver une et ouvrir l'autre serait incohérent — un modérateur pourrait vider la liste de travail de l'administrateur sans convertir personne. La consultation, elle, ne demande aucune ligne nouvelle : la liste est intégralement dérivée de `desir_suivi_spirituel`, que le modérateur a déjà le droit de voir |
| D56 | `evenements.date_debut` et `date_fin` sont des **`date`**, avec un `heure_debut time NULL` séparé — jamais des `timestamptz` | Le projet a déjà payé le fuseau horaire une fois : `formaterDateSeule` est verrouillé en UTC par un invariant de test, et `seances_ael` porte `date date` plus `heure time`. Un `timestamptz` sur un événement rouvrirait toute la classe : une retraite « du 12 au 14 » n'a pas d'instant, elle a des jours, et l'afficher depuis un instant fait dépendre le libellé du fuseau du lecteur. Le même découpage que l'AEL, pour la même raison, sans avoir à la redécouvrir |
| D57 | L'amorçage de `types_evenement` est **idempotent** (`on conflict (libelle) do nothing` sur une unicité réelle), contrairement à l'amorçage du catalogue des statuts | Le dépôt porte déjà un commit qui **signale** que l'amorçage des statuts n'est pas idempotent, sans le corriger — c'est une dette connue et documentée. La reproduire ici serait la choisir. `types_evenement` a une clé naturelle unique (`libelle`) : l'idempotence coûte une clause, pas une conception |
| D58 | L'unicité des participations est portée par **deux index uniques partiels**, chacun restreint à `where <colonne> is not null` — et **jamais** par `unique nulls not distinct` | Voir §5.4 pour l'analyse complète. Les deux unicités du §4.4 fonctionnent telles quelles (deux `NULL` distincts rendent chaque contrainte simplement inerte sur la moitié des lignes qui ne la concerne pas), mais **la convention maison du projet est `unique nulls not distinct`** — employée à bon droit sur `calendriers_ael_creneau_unique`. Appliquée ici par habitude, elle n'autoriserait qu'**un seul participant externe par événement**. L'index partiel dit ce qu'il fait, ne peut pas être lu comme un oubli, et supprime la tentation |
| D59 | « Exactement une des deux références » est une contrainte `check (num_nonnulls(membre_id, participant_externe_id) = 1)`, **pas** un déclencheur | Condition **locale à la ligne** : elle ne dépend d'aucune autre table. C'est exactement le critère que D36 (phase 3) a posé pour l'exclusivité enseignant/modérateur, et le motif qui justifiait un déclencheur pour l'exclusivité des statuts (la condition vit sur `groupes_statut`) ne s'applique pas ici. `num_nonnulls` couvre les deux sens en une seule expression, ce qui évite d'écrire deux moitiés dont une seule serait éprouvée |
| D60 | `participations` porte `saisi_par` / `saisi_le` (posés à la création, **jamais** réécrits) et `modifie_par` / `modifie_le` (dernière retouche) ; `participants_externes` porte `cree_par`. Aucune de ces colonnes n'est au §4.4 | Deux raisons indépendantes, chacune suffisante. **(1)** D23 élargit le cercle qui voit et saisit une confidence : savoir **qui** a fait entrer une personne et **qui** a touché ses désirs en dernier est la contrepartie directe de cet élargissement, pas un confort. **(2)** Les suites de tests écrivent dans la base de production ; une ligne de `participations` n'a **aucun** champ nommable — ni titre, ni thème — et `cree_par` est déjà, sur `seances_ael`, la seule prise du balayage de rattrapage. Sans ces colonnes, une exécution interrompue laisserait des participations irretrouvables |
| D61 | Le classement sans suite vit sur **`participants_externes`** (`classe_le`, `classe_par`, `motif_classement`), donc sur la **personne**, jamais sur la participation | La liste « à traiter » est une liste de **personnes à recontacter**, pas de lignes à traiter. Une personne qui a exprimé le désir d'un suivi à deux séminaires produit deux participations ; classer l'une la laisserait dans la liste par l'autre, et le classement paraîtrait sans effet. Poser le classement sur la personne rend le vidage de la liste vrai par construction, quel que soit le nombre d'événements qu'elle a fréquentés |
| D62 | Pas de réouverture : un déclencheur refuse de remettre `classe_le` à `NULL` ou de le changer une fois posé (marqueur `classement_definitif`), et un `check` exige un `motif_classement` non vide dès lors que `classe_le` est renseigné. **Le classement n'interdit pas une conversion ultérieure** | « Pas de réouverture » (décision utilisateur) porte sur la **liste**, pas sur le sort de la personne : quelqu'un classé sans suite il y a deux ans qui reprend contact doit pouvoir être converti, et cette conversion ne repeuple aucune liste. Les deux colonnes peuvent donc coexister renseignées, et aucune contrainte ne les oppose. Le déclencheur double le contrôle amont, motif établi depuis l'archivage en 1c : le déclencheur protège même une écriture directe, le contrôle amont explique |
| D63 | `participants_externes.converti_en_membre_id` est **à sens unique** : un déclencheur refuse de le modifier une fois posé (marqueur `participant_deja_converti`) | Reconvertir, c'est repointer un historique vers quelqu'un d'autre. La vue `seminaires_assistes` (D70) résout les séminaires d'un converti **par cette colonne** : la changer déplacerait silencieusement la participation d'une fiche à une autre, sans trace et sans erreur. Une conversion erronée se corrige par une intervention administrateur en base, délibérée et rare, pas par un second clic sur le même écran |
| D64 | La clé étrangère `converti_en_membre_id` est **`on delete restrict`**, et `public.annuler_demande_membre` (phase 2b) est **amendée** pour refuser une demande d'origine `conversion_participant` (marqueur `demande_conversion_non_annulable`) | `on delete set null` — le réflexe, et ce que porte déjà `demandes_membre.membre_id` — **déconvertirait silencieusement** le participant : sa fiche disparaît, son lien devient `NULL`, il **réapparaît dans la liste « à traiter »** et son historique de séminaire est perdu. Or le chemin 1 crée une fiche `en_attente`, et le projet compte exactement **deux** `delete` sur `membres` (D26 rattachement, D42 annulation). Le premier n'est pas proposé pour cette origine (§7.3 de la 2b le réserve à `auto_inscription`) ; le second est atteignable — l'administrateur convertisseur est le demandeur, le bouton d'annulation s'affiche pour lui. Deux barrières le ferment : la contrainte refuse la suppression même par écriture directe, la fonction amendée explique |
| D65 | La conversion est **une passerelle SQL unique**, `public.convertir_participant_externe(...)`, `security definer`, `execute` réservé à `service_role`, portant les trois chemins ; l'atomicité est tenue **par construction** | Créer la fiche puis poser `converti_en_membre_id` en deux écritures séparées laisse une fenêtre où la fiche existe sans lien : le participant reste dans la liste « à traiter » alors qu'il a déjà une fiche, et un second clic créerait un doublon. Une seule fonction PL/pgSQL, et une exception à n'importe quel point de son corps annule tout ce qu'elle a écrit — Postgres le garantit au niveau du langage, sans verrou ajouté. C'est exactement le raisonnement de `annuler_demande_membre` (2b §7.2), et **la même discipline est à documenter au point d'appel** : scinder un jour cet appel en deux ferait disparaître l'atomicité en silence |
| D66 | Le chemin 1 (fiche `en_attente`) crée aussi une ligne `demandes_membre` portant une **nouvelle valeur d'énumération `conversion_participant`**, ajoutée à `origine` par migration additive dédiée | D32 a posé le principe : l'origine d'une demande est **explicite**, jamais inférée. Réutiliser `demande_suivi` mentirait sur la provenance et brancherait l'écran de validation sur le mauvais comportement (poser le demandeur comme faiseur de disciple, alors que l'administrateur qui convertit n'est pas le faiseur de disciple de la personne convertie). Sans ligne `demandes_membre`, la fiche `en_attente` ne rejoindrait **aucun** circuit : `/demandes` liste des demandes, pas des fiches, et personne ne la validerait jamais. **Piège d'implémentation à porter au plan** : `alter type ... add value` doit vivre dans **sa propre migration**, et la valeur ne peut pas être employée dans la même transaction que son ajout |
| D67 | Le chemin 2 (fiche **active** directe) prend le **verrou consultatif « arbre »** — la même clé constante que `public.definir_arbre` — dès lors qu'il pose un `faiseur_de_disciple_id` | Le déclencheur anti-cycle seul ne suffit pas, et la 1c (§4.1) l'a déjà établi : deux écritures concurrentes voient chacune un arbre sans cycle et valident toutes les deux. La fiche créée ici n'a aucun descendant à l'instant de son insertion, mais une transaction concurrente peut, pendant ce temps, rattacher son futur faiseur de disciple **sous elle** via `definir_arbre` sans la voir. Le verrou coûte une instruction sur un geste rare et ferme la classe entière. **Écart constaté à signaler** : `validerDemandeNouvellePersonne` (phase 2b) écrit `faiseur_de_disciple_id` par un `update` direct **sans** ce verrou — voir §11, point 8 |
| D68 | Le chemin 3 (rattachement à une fiche existante) exige une fiche cible à l'état **`actif`** (marqueur `membre_cible_non_actif`) | Rattacher à une fiche `archive` attribuerait un séminaire à quelqu'un qui a quitté l'équipe et ferait réapparaître son nom dans des vues que l'archivage ferme ; rattacher à une fiche `en_attente` court-circuiterait le circuit de validation qui la retient. Le §7 de la spécification maîtresse ferme déjà exactement cela pour le faiseur de disciple archivé, avec le même double dispositif : le sélecteur ne propose que des membres actifs, **et** la passerelle refuse — sans quoi un onglet resté ouvert reposterait un identifiant devenu invalide entre-temps, cas explicitement traité ailleurs dans le projet |
| D69 | **Une participation est un fait daté qui ne bouge jamais.** La conversion ne repointe **jamais** `participations.membre_id` ; la ligne reste attachée au participant externe, et le lien vers le membre se fait par `converti_en_membre_id`, résolu **à la lecture** par la vue | Réponse à la première question de conception, et application directe de D48 (« une présence est un fait daté qui ne bouge jamais »). Trois raisons. **(1)** Repointer effacerait le fait que cette personne est entrée par un séminaire — précisément ce que D13 veut mesurer. **(2)** Repointer peut **échouer** : si la personne figure déjà comme membre à ce même événement (cas normal du chemin 3, rattachement à une fiche existante), l'index unique `(evenement_id, membre_id)` refuserait la conversion pour une raison qui n'a rien à voir avec elle. **(3)** Un chiffre ou un historique qui change sans qu'aucun événement nouveau ne l'explique est le genre de mensonge que le projet traque depuis la 1c |
| D70 | La vue `seminaires_assistes` devient une **union de deux branches** — participations de membres, et participations d'externes **convertis**, projetées sur `converti_en_membre_id` — en `union` et non `union all` | Sans la seconde branche, D69 coûterait exactement ce que la question de conception redoutait : **un converti perdrait l'historique de sa participation**, la vue lisant `membre_id` sur une ligne qui restera éternellement `NULL`. Avec elle, l'historique se reconstitue à la lecture sans qu'aucune écriture passée n'ait bougé. `union` et non `union all` parce que rien n'empêche une même personne de figurer à un événement à la fois comme membre et comme externe (les deux index partiels de D58 sont aveugles l'un à l'autre, et aucune contrainte ne peut savoir que deux lignes désignent la même personne) : la déduplication est la seule réponse honnête, et elle est gratuite |
| D71 | `seminaires_assistes` est la **seule vue du projet qui contourne délibérément la RLS** : `security_invoker = false`, **écrit explicitement** et non laissé au défaut, avec un `comment on view` qui dit pourquoi | C'est la raison d'être même de cette vue : le §4.4 la veut lisible de tout compte actif alors que `participations` est fermée à l'administrateur et au modérateur. Aucune politique de ligne ne peut produire cela — la RLS est ligne à ligne, et le partage à faire ici est **colonne à colonne**. Le principe posé en phase 3 (§4.5) est qu'« aucune vue ne doit élargir **silencieusement** ce qu'un compte peut lire » : le mot qui compte est *silencieusement*. Écrire `security_invoker = false` là où tout le projet écrit `true` est un panneau, pas un oubli. **Le mode de défaillance à éprouver** : cette vue repose sur l'hypothèse `BYPASSRLS` de son propriétaire, déjà documentée au §5.3 pour `prive.est_admin()` — si l'hypothèse était fausse, la vue ne lèverait aucune erreur, elle rendrait **zéro ligne** pour tout le monde et les étiquettes de séminaires disparaîtraient sans trace |
| D72 | La règle de visibilité des membres est **extraite** dans `prive.peut_lire_membre(uuid)`, appelée **à la fois** par la politique `membres_lecture` réécrite et par la vue de D71 : une seule définition, jamais deux | Une vue qui contourne la RLS de `participations` contourne aussi, du même geste, celle de `membres` : sans prédicat, un compte ordinaire lirait les couples (identifiant de membre, événement) de fiches `archive` ou `en_attente` qu'il n'a pas le droit de lire. Recopier l'expression de `membres_lecture` dans la vue la ferait **dériver en silence** le jour où la politique changera. L'extraction a un coût — elle réécrit une politique livrée en 1a et amendée en 2b — et ce coût se paie par une preuve : la suite RLS existante sur `membres` doit passer inchangée avant et après. **Point subtil à ne pas perdre** : la vue s'exécute avec les privilèges de son propriétaire, mais `auth.uid()` continue de désigner l'**appelant** — elle contourne la RLS, pas l'identité |
| D73 | Les trois désirs **ne changent pas de régime** à la conversion : la ligne ne change ni de table ni de colonne, donc sa RLS reste `administrateur ou modérateur`. La vue ne les expose jamais, et cela se prouve sur la **liste des colonnes de la vue**, pas sur ce qu'un écran affiche | Réponse à la seconde question de conception. Le régime ne peut pas changer par accident **parce que rien ne bouge** (D69) : c'est le principal bénéfice non évident de la participation immobile. Ce qui devient visible de tous après conversion, c'est la **participation** — que D16 rend publique depuis toujours — et rien d'autre : ni les désirs, ni le nom du participant externe, ni le fait qu'il y ait eu conversion. Une assertion sur `information_schema.columns` attrape une colonne ajoutée un jour « pour la commodité » ; un test d'écran ne l'attrape pas |
| D74 | La liste « à traiter » est une vue `public.participants_a_traiter`, en **`security_invoker = true`** — le contraire exact de D71, et délibérément | Elle n'a aucune raison d'élargir quoi que ce soit : ses lecteurs légitimes (administrateur, modérateur) ont déjà le droit de lire les deux tables qu'elle joint. En héritant de leur RLS, elle ne peut pas fuir, et elle n'a pas de politique propre à écrire ni à prouver — même forme que `compteurs_ael`. Les deux vues de cette phase encadrent ainsi les deux régimes possibles, chacune avec sa raison écrite : c'est ce qui rend le contraste enseignable plutôt que déroutant |
| D75 | Les trois listes de la phase — événements, participants d'un événement, « à traiter » — sont **paginées avec un tri total** (dernière clé de tri unique), jamais chargées en entier | D29 fait exception pour le pointage AEL, et son motif est nommé : pointer suppose de balayer toute l'assistance. **Aucun geste de cette phase n'a cette propriété.** Ajouter un participant ne demande pas de voir les autres — et le doublon n'est pas évité en regardant la liste, il est refusé par l'index unique de D58, ce qui est une garantie et non une vigilance. Le risque, lui, est réel : un séminaire académique peut rassembler plusieurs centaines de personnes, et la liste « à traiter » cumule les années. Au-delà de `max_rows = 1000`, PostgREST tronque **en silence** : ce ne serait pas une page incomplète, ce seraient des personnes que personne ne verrait jamais |
| D76 | Ajouter un participant réutilise **`SelecteurMembre`** (recherche serveur bornée, 1c) pour les membres actifs, et un **formulaire de création d'externe à la volée** sur le même écran ; aucun composant de recherche nouveau n'est écrit | Décision utilisateur (le motif éprouvé du pointage AEL), précisée ici sur un point : le pointage combine **deux** mécanismes (D47) parce qu'il précharge la liste des antennes ciblées. Un événement n'a pas d'antenne ciblée, donc pas de liste à précharger : il ne reste que le sélecteur, plus la création d'externe. Le couple « choisir une fiche **ou** saisir un nom libre » a déjà son patron dans le projet — `champ-intervenant.tsx` de la phase 3, avec sa contrainte d'exclusivité et son code `23514` — et c'est celui-là qui est décalqué, pas un nouveau |
| D77 | Une participation est **modifiable** après coup (les trois désirs, la note) par le modérateur et l'administrateur | Corollaire direct de D23, qui le dit dans son propre texte : « on ne saisit pas dans un champ qu'on ne peut pas relire, ni corriger une valeur qu'on ne voit pas ». Un désir se recueille souvent après l'événement, dans une conversation ; le figer à la saisie obligerait à supprimer puis resaisir, donc à perdre `saisi_par` et `saisi_le` — d'où la séparation de D60 entre l'origine, qui ne bouge pas, et la dernière retouche, qui bouge |
| D78 | Une participation saisie par erreur se **supprime** ; il n'y a pas d'état « annulée ». C'est le seul geste destructif de la phase, réservé au modérateur et à l'administrateur | Le projet archive et ne supprime jamais — la 2b a énuméré les **deux seuls** `delete` sur `membres` de tout le projet, et cette phase n'en ajoute aucun. Une participation n'est pas une fiche : c'est une déclaration, et une déclaration fausse laissée en place **falsifie les étiquettes de séminaires d'un membre innocent**, visibles de toute l'équipe par D2. La supprimer efface aussi ses désirs, ce qui est la conséquence normale de « cette ligne n'aurait pas dû exister ». Une participation dont l'externe a été converti reste supprimable : rien ne justifierait qu'une erreur devienne indélébile parce qu'elle a été suivie d'une conversion |
| D79 | **Pas de journal des participations** symétrique à `journal_statuts` | Même raisonnement que D45 pour les présences : D7 justifie le journal des statuts par la nature spirituelle du changement tracé. `saisi_par`/`saisi_le`, `modifie_par`/`modifie_le` (D60), `classe_par`/`motif_classement` (D61) et `converti_par` donnent la traçabilité minimale — qui, quand, et pourquoi pour le classement — sans dupliquer un mécanisme que rien ne demande ici |
| D80 | Nouvelle primitive RLS `prive.est_moderateur_ou_admin()`, contrepartie SQL de `exigerModerateurOuAdministrateur` (D42) | La phase 3 a livré le garde applicatif ; aucune **politique** n'avait encore besoin de la question, toutes les tables AEL étant ouvertes à tout compte actif. `participations` et `participants_externes` sont les premières tables du projet dont la **lecture** dépend d'un rôle autre qu'administrateur : la primitive manque, et il faut l'écrire. Elle suit le régime des primitives lues par les politiques — `security definer`, `stable`, `revoke` de `public`, `anon` et `service_role`, `grant` au seul `authenticated` —, jamais celui des passerelles métier |

---

## 4. Périmètre livré

1. **Catalogue des types d'événement** (`/evenements/types`, nouveau) — création, activation et
   désactivation, réservé à l'administrateur (§5.2, ligne « Créer statuts, groupes, antennes,
   types d'événement »). Amorcé de façon idempotente (D57).
2. **Événements** (`/evenements`, `/evenements/[id]`, nouveaux) — création, édition,
   consultation. Création et édition ouvertes au modérateur (D23).
3. **Participants** — ajout d'un membre actif par recherche serveur, création d'un participant
   externe à la volée, saisie et correction des trois désirs, suppression d'une ligne erronée
   (D76, D77, D78).
4. **Étiquettes de séminaires sur la fiche membre** — vue `seminaires_assistes`, lisible de tout
   compte actif, **historique des convertis compris** (D70).
5. **Liste « à traiter »** (`/evenements/a-traiter`, nouveau) — externes ayant exprimé le désir
   d'un suivi spirituel, ni convertis ni classés, paginée (D74, D75).
6. **Conversion en membre, trois chemins** — fiche `en_attente` rejoignant le circuit de
   validation de la 2b, fiche active directe, ou rattachement à une fiche existante (D65 à D68).
   Réservée à l'administrateur.
7. **Classement sans suite avec motif** (D55, D61, D62) — l'autre façon, et la seule autre, de
   vider la liste.

---

## 5. Modèle de données

Migrations strictement additives — un seul projet Supabase sert au développement et à la
production (rappelé au §9). Conventions du dépôt appliquées telles quelles : `id uuid primary key
default gen_random_uuid()`, `cree_le timestamptz not null default now()`, `cree_par uuid
references public.profils (id) on delete set null`, index explicite sur chaque clé étrangère
employée en filtre, contraintes nommées, `comment on table/column/constraint` citant la section
de spec et les numéros de décision, apostrophes doublées dans les chaînes SQL.

### 5.1 `types_evenement`

Colonnes du §4.4 (`id`, `libelle`, `actif`), plus deux ajouts :

| Colonne ajoutée | Type | Notes |
|---|---|---|
| `ordre` | integer NOT NULL DEFAULT 0 | Même rôle que sur `statuts` : l'ordre d'affichage d'un référentiel est une donnée, pas un tri alphabétique subi |
| `cree_le` | timestamptz NOT NULL DEFAULT now() | Convention du dépôt |

Contraintes : `unique (libelle)` — clé naturelle, et l'ancre de l'idempotence de l'amorçage
(D57) — plus `check (length(trim(libelle)) > 0)` sur le modèle de `membres_nom_non_vide`.

Amorçage : webinaire, séminaire académique, pic-nic, retraite spirituelle, avec `on conflict
(libelle) do nothing`. **Un type n'est jamais supprimé, seulement désactivé** — même régime que
les statuts (§7 : il disparaît des nouvelles attributions, reste visible sur l'existant), ce qui
impose `on delete restrict` sur `evenements.type_id`.

### 5.2 `evenements`

| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `titre` | text NOT NULL | `check` non vide. **Obligatoire aussi pour les tests** : c'est la prise du préfixe de famille `ZZ...-` (§9, preuve n°18) |
| `type_id` | uuid NOT NULL → `types_evenement` | `on delete restrict` |
| `date_debut` | **date** NOT NULL | D56 |
| `date_fin` | **date** NULL | D56 |
| `heure_debut` | **time** NULL | D56 — ajout par rapport au §4.4 |
| `lieu`, `description` | text NULL | |
| `cree_par` | uuid NULL → `profils` | `on delete set null` |
| `cree_le` | timestamptz NOT NULL | |

Contrainte `evenements_periode_coherente check (date_fin is null or date_fin >= date_debut)` —
locale à la ligne, donc `check` et non déclencheur, même critère que D59.

Index : `evenements_type_id_idx`, `evenements_date_debut_idx` (la liste est triée par date
décroissante, D75), `evenements_cree_par_idx` (balayage de nettoyage des tests).

Ce que cette phase **ne** livre pas sur cette table : aucun état (`prevue`/`tenue`/`annulee`)
symétrique à `seances_ael`. Un événement n'a pas de compteur qui dépende de son état — rien dans
le projet ne le lit —, et ajouter un état que rien ne consomme créerait une transition à garder
cohérente pour zéro usage.

### 5.3 `participants_externes`

Colonnes du §4.4 (`id`, `nom`, `prenom`, `telephone`, `email`, `ville`, `pays`,
`converti_en_membre_id`, `cree_le`), plus :

| Colonne ajoutée | Type | Notes |
|---|---|---|
| `cree_par` | uuid NULL → `profils` | D60 |
| `converti_le` | timestamptz NULL | |
| `converti_par` | uuid NULL → `profils` | |
| `classe_le` | timestamptz NULL | D61 |
| `classe_par` | uuid NULL → `profils` | D61 |
| `motif_classement` | text NULL | D61 |

Contraintes et déclencheurs :

```
constraint participants_externes_classement_coherent
  check (
    (classe_le is null and classe_par is null and motif_classement is null)
    or (classe_le is not null and length(trim(coalesce(motif_classement, ''''))) > 0)
  )

constraint participants_externes_conversion_coherente
  check ((converti_en_membre_id is null) = (converti_le is null))

converti_en_membre_id uuid null
  references public.membres (id) on delete restrict        -- D64
```

Déclencheur `participants_externes_liens_definitifs`, `before update` (D62, D63) :

```
if old.converti_en_membre_id is not null
   and new.converti_en_membre_id is distinct from old.converti_en_membre_id then
  raise exception '...' using detail = 'participant_deja_converti';
end if;
if old.classe_le is not null and new.classe_le is distinct from old.classe_le then
  raise exception '...' using detail = 'classement_definitif';
end if;
```

`is distinct from` et non `<>` : un déclencheur `before` s'exécute avant la vérification des `not
null`, et `<>` sur une valeur nulle rend `NULL`, donc tombe dans la mauvaise branche — le piège
que la migration `20260817150000_corriger_marqueur_completude_null.sql` a déjà payé une fois dans
ce projet.

**Aucune unicité sur l'identité d'un externe.** Deux homonymes sont possibles, et la même personne
peut être saisie deux fois à deux séminaires par deux modérateurs différents. Ce n'est pas un
défaut à fermer par contrainte — aucune combinaison de nom, téléphone et ville n'est fiable —
mais un cas que le chemin 3 de la conversion traite : rattacher les deux à la même fiche membre.
Dit ici plutôt que découvert.

Index : `participants_externes_converti_en_membre_id_idx` (la seconde branche de la vue D70 y
joint), `participants_externes_cree_par_idx`, et un index **partiel** pour la liste « à traiter » :

```
create index participants_externes_a_traiter_idx
  on public.participants_externes (cree_le desc, id)
  where converti_en_membre_id is null and classe_le is null;
```

### 5.4 `participations` — et ce que les deux `NULL` impliquent réellement

Colonnes du §4.4, plus `saisi_par`, `saisi_le`, `modifie_par`, `modifie_le` (D60).

**Contrainte « exactement une des deux références »** (D59) :

```
constraint participations_une_seule_reference
  check (num_nonnulls(membre_id, participant_externe_id) = 1)
```

**Les deux unicités du §4.4 : ce qui se passe vraiment.** Le §4.4 pose une unicité sur
`(evenement_id, membre_id)` et une sur `(evenement_id, participant_externe_id)`, alors que D59
garantit qu'**une des deux colonnes est toujours nulle**. Trois conséquences, dont deux ne
sautent pas aux yeux :

1. **Les deux contraintes fonctionnent, chacune sur sa moitié.** Postgres traite deux `NULL`
   comme distincts : pour une ligne de membre (`membre_id` non nul), la première unicité compare
   normalement et bloque bien le doublon ; pour une ligne d'externe, `membre_id` vaut `NULL` et la
   première unicité ne peut **jamais** être violée. Chaque contrainte est donc active sur les
   lignes qu'elle vise et **inerte** sur les autres. La paire est suffisante — ce n'est pas un
   défaut d'analyse du §4.4.
2. **Mais la convention maison du projet la casserait.** Le dépôt écrit `unique nulls not
   distinct (...)` « quand une colonne nullable entre dans une clé d'unicité » —
   `calendriers_ael_creneau_unique` le fait, à bon droit. Appliquée ici par habitude, ou par un
   relecteur remarquant à juste titre que « deux `NULL` sont distincts par défaut », elle
   n'autoriserait qu'**un seul participant externe par événement** : toutes les lignes d'externes
   partagent `membre_id = NULL`, donc s'écraseraient sur la première unicité. Le refus serait un
   `23505` parfaitement opaque au deuxième externe ajouté. C'est le piège le plus concret de cette
   phase, et il est enregistré au §10, point 3.
3. **Le doublon le plus probable n'est fermé par aucune des deux.** Rien n'empêche la même
   personne d'être inscrite à un événement une fois comme membre et une fois comme externe : les
   deux index sont aveugles l'un à l'autre, et aucune contrainte ne peut savoir que deux lignes
   désignent le même être humain. C'est précisément pour cela que la vue D70 déduplique par
   `union` plutôt que `union all`.

D'où **deux index uniques partiels** (D58), qui disent leur intention au lieu de la laisser
déduire :

```
create unique index participations_membre_unique
  on public.participations (evenement_id, membre_id)
  where membre_id is not null;

create unique index participations_externe_unique
  on public.participations (evenement_id, participant_externe_id)
  where participant_externe_id is not null;
```

Effet secondaire utile : `evenement_id` étant en tête des deux, ils servent aussi la lecture
paginée des participants d'un événement (D75) sans index supplémentaire.

Clés étrangères : `evenement_id` en `on delete cascade` (une participation n'a pas de sens sans
son événement — même régime que `presences_ael.seance_id`), `membre_id` et
`participant_externe_id` en `on delete restrict` (supprimer une personne ne doit pas effacer sans
bruit son passage à un événement).

### 5.5 Vue `seminaires_assistes` (D70, D71, D72)

```sql
create view public.seminaires_assistes
  with (security_invoker = false) as        -- D71 : écrit, pas laissé au défaut
select p.membre_id, e.id as evenement_id, e.titre, t.libelle as type, e.date_debut
from public.participations p
join public.evenements e on e.id = p.evenement_id
join public.types_evenement t on t.id = e.type_id
where p.membre_id is not null
  and prive.peut_lire_membre(p.membre_id)
union
select x.converti_en_membre_id, e.id, e.titre, t.libelle, e.date_debut
from public.participations p
join public.participants_externes x on x.id = p.participant_externe_id
join public.evenements e on e.id = p.evenement_id
join public.types_evenement t on t.id = e.type_id
where x.converti_en_membre_id is not null
  and prive.peut_lire_membre(x.converti_en_membre_id);
```

Cinq colonnes, exactement celles du §4.4. **Aucune colonne de désir, aucune note, aucun nom de
participant externe** — la vue expose le fait, jamais la confidence ni l'identité externe (D73).

`prive.peut_lire_membre(uuid)` (D72), `security definer`, `stable`, `set search_path = ''`, porte
l'expression que `membres_lecture` portait en ligne :

```
est_actif() and (etat = 'actif' or est_admin() or est_demandeur_de(id))
```

et `membres_lecture` est réécrite pour l'appeler — migration additive avec `drop policy` puis
`create policy` dans un fichier neuf, l'additivité du projet portant sur les fichiers de
migration, pas sur l'immuabilité d'une politique (précédent : `20260815140000`).

### 5.6 Vue `participants_a_traiter` (D74)

```sql
create view public.participants_a_traiter
  with (security_invoker = true) as
select x.id as participant_externe_id, x.nom, x.prenom, x.telephone, x.email,
       x.ville, x.pays, x.cree_le,
       min(e.date_debut) as premiere_expression,
       count(*) as evenements_concernes
from public.participants_externes x
join public.participations p on p.participant_externe_id = x.id
join public.evenements e on e.id = p.evenement_id
where p.desir_suivi_spirituel
  and x.converti_en_membre_id is null
  and x.classe_le is null
group by x.id;
```

Un participant, une ligne, quel que soit le nombre d'événements où il a exprimé le désir (D61).
Tri total de pagination : `order by premiere_expression, participant_externe_id` — la dernière
clé est unique, sans quoi deux personnes ayant exprimé leur désir au même séminaire pourraient
apparaître deux fois ou disparaître entre deux pages, le défaut exact que
`membresDesAntennesParLots` ferme déjà par son `.order('id')` final.

---

## 6. Couche domaine — `src/lib/domaine/evenements.ts`

Fonctions **pures**, sans accès à la base, testées au Vitest :

- `periodeValide(dateDebut, dateFin)` — la règle de `evenements_periode_coherente`, dupliquée à
  dessein côté application pour produire un message qui nomme le champ fautif **avant** d'écrire.
  Le `check` reste la barrière, le contrôle amont explique : motif établi par l'archivage en 1c et
  repris par D37.
- `estATraiter({ desirSuiviSpirituel, convertiEnMembreId, classeLe })` — le prédicat de la liste
  « à traiter », isolé pour verrouiller la **formule** contre une régression silencieuse, la vue
  restant la seule source de vérité à l'exécution. Exactement le rôle que `compteurAel` joue
  vis-à-vis de `compteurs_ael`.
- `motifClassementValide(motif)` — non vide après `trim`, la moitié applicative de
  `participants_externes_classement_coherent`.
- `champsRequisConversion(chemin)` → quels champs chaque chemin exige : chemin 1 nom et prénom ;
  chemin 2 nom, prénom **et** faiseur de disciple ; chemin 3 une fiche cible et rien d'autre.
  C'est la seule règle réellement combinatoire de la phase, et celle où une erreur produirait une
  fiche muette plutôt qu'une erreur.

`dirigeantPropose` (1c) est **réutilisé tel quel** par le chemin 2, jamais réécrit.

---

## 7. Politiques RLS

Cohérentes avec le §5.3 : lecture seule côté client, refus par défaut. Bloc canonique du dépôt
pour chaque table (`revoke all from anon, authenticated` ; `grant select to authenticated` ;
`enable` puis `force row level security` ; une politique `<table>_lecture` unique).

| Table ou vue | Politique de lecture |
|---|---|
| `types_evenement` | `for select to authenticated using ((select prive.est_actif()))` — tout compte actif (§5.3) |
| `evenements` | Idem — tout compte actif (§5.3 : « nécessaire pour afficher les séminaires assistés sur une fiche ») |
| `participations` | `(select prive.est_actif()) and (select prive.est_moderateur_ou_admin())` — administrateur **ou** modérateur (§5.3 amendé par D23, D80) |
| `participants_externes` | Idem `participations` — même régime, même raison |
| Vue `seminaires_assistes` | **Aucune politique propre.** `security_invoker = false` (D71) : contourne délibérément la RLS de `participations`, et réimpose celle de `membres` par `prive.peut_lire_membre` (D72). `revoke all from anon, authenticated` puis `grant select to authenticated` |
| Vue `participants_a_traiter` | **Aucune politique propre.** `security_invoker = true` (D74) : hérite de la RLS de `participants_externes`, `participations` et `evenements`. Mêmes `revoke` et `grant` |

**Aucune politique d'écriture n'est créée sur aucune table de cette phase, ni sur aucune autre.**
C'est la règle du projet depuis D12, sans exception à ce jour, et cette phase n'en introduit pas :
toutes les mutations passent par des Server Actions derrière un garde, qui écrivent avec
`clientAdmin()` ou par les passerelles `security definer` du §8.2. La RLS reste le filet — une
action mal gardée ne peut pas écrire directement depuis un rôle `authenticated` ou `anon`.

Nouvelle primitive (D80) : `prive.est_moderateur_ou_admin()`, `security definer`, `stable`,
`set search_path = ''`, `revoke execute from public, anon, service_role`, `grant execute to
authenticated` — le régime des primitives lues par les politiques, distinct de celui des
passerelles métier.

---

## 8. Écrans, gardes et chemins d'écriture

### 8.1 Écrans

| Écran | Contenu | Accès |
|---|---|---|
| `/evenements` (nouveau) | Liste paginée (D75), tri `date_debut desc, id`, filtre par type. Bouton « Nouvel événement » | Consultation : tout compte actif. Création : `exigerModerateurOuAdministrateur` (D23), bouton rendu par `estModerateurOuAdministrateur` |
| `/evenements/[id]` (nouveau) | Titre, type, dates, lieu, description. **Section participants** : liste paginée, ajout par `SelecteurMembre`, création d'externe à la volée, trois désirs, note, suppression d'une ligne (D76, D77, D78) | Consultation de l'en-tête : tout compte actif. **La section participants n'est pas rendue du tout** hors modérateur et administrateur — voir ci-dessous |
| `/evenements/types` (nouveau) | Catalogue : création, bascule actif/inactif | `exigerAdministrateur` (§5.2, ligne « Créer statuts, groupes, antennes, types d'événement ») |
| `/evenements/a-traiter` (nouveau) | Liste paginée des externes à suivre (D74, D75) ; par ligne : convertir (trois chemins) ou classer sans suite | Consultation : `exigerModerateurOuAdministrateur` (couvert par la ligne « Voir les trois désirs »). Conversion **et** classement : `exigerAdministrateur` (D55) |
| `/membres/[id]` (existant) | Section « Séminaires assistés » : étiquettes issues de `seminaires_assistes`, historique des convertis compris (D70) | Tout compte actif, comme le reste de la fiche |
| `/demandes` (existant) | Les demandes d'origine `conversion_participant` s'y affichent comme les autres, **sans** l'action de rattachement (non proposée pour cette origine, 2b §7.3) et **sans** le bouton d'annulation (D64) | Inchangé : administrateur, plus le demandeur pour ses propres lignes |
| `/tableau-de-bord` (existant) | Lien « Événements », rendu comme le lien « Gérer l'AEL » | Tout compte actif pour la consultation |

**La section participants se cache par rôle, elle ne se vide pas par RLS.** Un compte ordinaire
qui atteindrait `/evenements/[id]` lit `participations` sous RLS et obtient **zéro ligne** — un
événement à cent participants lui paraîtrait désert, ce qui est un mensonge et non une protection.
L'écran teste le rôle et ne rend pas la section du tout. C'est le pendant exact du mode de
défaillance de D71, dans l'autre sens : une lecture vidée par la RLS ne doit jamais être affichée
comme un résultat.

### 8.2 Passerelles SQL et Server Actions

Passerelles (`security definer`, `set search_path = ''`, `revoke execute from public, anon,
authenticated`, `grant execute to service_role`, `comment on function` citant les marqueurs) :

| Passerelle | Rôle |
|---|---|
| `public.convertir_participant_externe(p_participant, p_chemin, p_membre_cible, p_nom, p_prenom, p_faiseur, p_dirigeant, p_dirigeant_force, p_par)` | Les trois chemins, atomique par construction (D65). Prend le verrou consultatif « arbre » si elle pose un faiseur de disciple (D67). Marqueurs : `participant_inconnu`, `participant_deja_converti`, `membre_cible_non_actif`, `membre_cible_inconnu`, `chemin_inconnu` |
| `public.classer_participant_externe(p_participant, p_motif, p_par)` | Classement sans suite (D61, D62). Marqueurs : `participant_inconnu`, `classement_definitif`, `participant_deja_converti`, `motif_classement_vide` |
| `public.annuler_demande_membre(p_demande)` — **existante, amendée** | Ajout du refus `demande_conversion_non_annulable` (D64), par `create or replace` dans une migration neuve |

Le reste des écritures — créer un événement, ajouter ou modifier une participation, créer un
externe, gérer le catalogue — n'a **aucun invariant qui dépasse la ligne écrite** : simples
mutations `clientAdmin()` derrière leur garde, avec `.select('id')` obligatoire (une mise à jour
qui ne touche aucune ligne ne rend aucune erreur). Même raisonnement que D38 et que
`definirAntenneMembre` : le verrou ou la passerelle ne se justifient que quand l'invariant dépasse
une seule ligne.

Retour des Server Actions : le type maison `{ erreur: string | null }`, nommé `Etat<Chose>`,
messages dans un `messages.ts` voisin, importables par les specs. **Un refus métier se retourne,
il ne se lève jamais** (§10, piège n°1).

### 8.3 Recensement des chemins d'écriture — obligatoire pour la revue (piège n°10 de la phase 3)

Cette phase ajoute des écritures sur des tables **déjà livrées**. Toute revue doit les recenser,
pas seulement relire les tables neuves :

| Table ou objet | Chemins d'écriture après cette phase |
|---|---|
| `membres` (insert) | `creerMembre` (admin), `sInscrire` (public, fiche `en_attente`), `soumettreDemandeSuivi`, **`convertir_participant_externe` chemins 1 et 2 (nouveau)** |
| `membres.faiseur_de_disciple_id` | `modifierMembre`, `definir_arbre`, `validerDemandeNouvellePersonne`, **`convertir_participant_externe` chemin 2 (nouveau)** — quatre chemins, dont **deux seulement** prennent le verrou « arbre » (voir §11, point 8) |
| `demandes_membre` (insert) | `sInscrire`, `soumettreDemandeSuivi`, **`convertir_participant_externe` chemin 1 (nouveau)** |
| `public.annuler_demande_membre` | **Amendée par cette phase** (D64) |
| Politique `membres_lecture` | **Réécrite par cette phase** (D72) — sa suite RLS existante doit passer inchangée |

---

## 9. Preuves exigées

Dans le prolongement des phases précédentes : contrôle positif sur toute vérification par
recherche, preuve par mutation sur chaque barrière, et une **écriture réelle constatée en base**
quand une barrière tombe — jamais un simple refus.

1. **« Exactement une des deux références » (D59), dans les deux sens.** Retirer la contrainte,
   écrire par `clientAdmin()` une ligne avec les **deux** références nulles **et** une ligne avec
   les **deux** remplies, **constater les deux lignes réellement écrites en base**, remettre la
   contrainte, rejouer les deux et constater deux refus. Comparer `pg_get_constraintdef`
   avant/après. Une seule des deux moitiés ne prouve rien : c'est la contrainte double dont une
   moitié n'est jamais éprouvée qui coûte cher.
2. **Les deux index uniques partiels (D58), avec le contrôle positif qui compte.** Prouver qu'un
   membre ne peut pas être inscrit deux fois au même événement ; prouver qu'un externe non plus ;
   et surtout **prouver que deux externes différents peuvent coexister sur un même événement** —
   c'est l'assertion qui attrape un `nulls not distinct` posé par habitude, et aucune des deux
   premières ne l'attrape.
3. **`seminaires_assistes` après conversion, pour les trois chemins (D69, D70).** Faire participer
   un externe, le convertir par chaque chemin dans trois scénarios distincts, puis relire la vue
   **depuis un compte ordinaire** et constater le séminaire. **Contrôle positif obligatoire
   avant** : constater que le même compte ordinaire ne voit **rien** pour ce membre avant
   conversion — sans quoi l'assertion positive pourrait être vraie pour une autre raison.
4. **La vue n'expose jamais de désir (D73).** Assertion sur `information_schema.columns` pour
   `seminaires_assistes` : exactement cinq colonnes, nommées. Un test d'écran n'attrape pas une
   colonne ajoutée plus tard « pour la commodité » ; celui-ci si.
5. **Le contournement de RLS de la vue fonctionne vraiment (D71).** Un compte **ordinaire** lit
   `seminaires_assistes` et obtient des lignes, alors que le même compte, dans le même test, lit
   `participations` et obtient **zéro ligne**. Les deux assertions dans le même test : c'est la
   seule façon de distinguer « la vue contourne comme prévu » de « l'hypothèse `BYPASSRLS` est
   fausse et tout le monde voit du vide » — un défaut invisible, en échec fermé, exactement celui
   que le §5.3 décrit pour `prive.est_admin()`.
6. **`membres_lecture` inchangée dans son effet (D72).** La suite RLS existante sur `membres` doit
   passer **avant et après** la réécriture, sans modification d'aucun test. Plus une lecture de
   `seminaires_assistes` par un compte ordinaire pour un membre `archive` : **zéro ligne**, avec
   le contrôle positif qu'un administrateur, lui, la voit.
7. **Les désirs restent fermés (D73).** Compte ordinaire : zéro ligne sur `participations` et sur
   `participants_externes`. Contrôle positif dans le **même** test : ce compte lit bien
   `evenements` et `types_evenement`, et un compte **modérateur réel** lit bien `participations`.
   Un refus dont on n'a pas prouvé que le chemin fonctionne par ailleurs ne prouve rien.
8. **`revoke execute`** sur `convertir_participant_externe` et `classer_participant_externe`
   depuis `anon` et `authenticated`, avec le contrôle positif que `service_role` réussit.
9. **Atomicité de la conversion (D65), par mutation.** Insérer un `raise exception` entre la
   création de la fiche et la pose de `converti_en_membre_id`, rejouer, constater que **ni** la
   fiche **ni** le lien n'ont persisté — deux lectures en base dans le même test. Restaurer et
   vérifier `pg_get_functiondef` identique.
10. **Non-reconversion (D63).** Convertir, puis retenter : refus avec le marqueur
    `participant_deja_converti`, et **relecture en base** confirmant que `converti_en_membre_id`
    pointe toujours sur la première fiche.
11. **La suppression d'une fiche convertie est refusée (D64).** Deux preuves : (a)
    `annuler_demande_membre` sur une demande d'origine `conversion_participant` rend
    `demande_conversion_non_annulable` et **la fiche est toujours en base** ; (b) un `delete from
    membres` direct par `clientAdmin()` échoue en `23503`. Contrôle positif : l'annulation d'une
    demande d'origine `demande_suivi` fonctionne toujours, dans le même test.
12. **Classement (D61, D62).** Classer, constater la sortie de `participants_a_traiter` ; tenter
    de déclasser par écriture directe et constater le refus `classement_definitif` **et** la
    valeur inchangée en base ; tenter un motif vide et constater le refus. Contrôle positif : la
    conversion d'un participant **déjà classé** reste possible, et ne le fait pas réapparaître
    dans la liste.
13. **Le classement porte sur la personne, pas sur la ligne (D61).** Un externe ayant exprimé le
    désir à **deux** événements distincts : le classer une fois doit le faire disparaître de la
    liste. Contrôle positif : avant classement, il n'y figure qu'**une** fois — l'agrégation de la
    vue est vérifiée en même temps que le classement.
14. **Pagination et tri total (D75).** Pour chacune des trois listes : créer N+1 lignes avec une
    taille de page **abaissée** (jamais 1001 lignes réelles), parcourir toutes les pages et
    vérifier qu'aucune ligne n'apparaît deux fois et qu'aucune ne manque — l'assertion doit porter
    sur l'**ensemble des identifiants collectés**, pas sur le compte d'une page. Plus la
    vérification que le total annoncé (`count: 'exact'`) est le total réel. C'est le motif déjà
    écrit pour `presencesDeSeanceParLots(client, seanceId, 2)`.
15. **Visibilité différenciée de `/evenements/[id]`, depuis chaque rôle** (piège n°7) : compte
    simple, modérateur, administrateur. Pour le compte simple, vérifier que la section participants
    est **absente**, et — contrôle positif dans la même situation — que l'en-tête de l'événement,
    lui, s'affiche bien. Une assertion négative seule ne distinguerait pas « la section est
    cachée » de « la page n'a pas chargé ».
16. **Gardes forgés (D23, D55).** Requête forgée par un compte **simple** contre la création
    d'événement et contre l'ajout de participation ; requête forgée par un compte **modérateur**
    contre la conversion et contre le classement (réservés à l'administrateur, D55). Vérification
    **en base** de l'absence d'écriture, avec un canari : un compte modérateur réel réussit la
    création d'événement, un administrateur réel réussit la conversion, dans un contexte neuf.
17. **Amorçage idempotent (D57).** Rejouer l'amorçage de `types_evenement` et constater le **même
    nombre de lignes**, avec le contrôle positif qu'un premier amorçage a bien créé les quatre
    types (compter, pas déduire — le motif « test qui regarde du vide »).
18. **Nettoyage des données de test.** Compter les lignes de la famille `ZZ...-` **avant et
    après** par un comptage indépendant, pas par confiance dans l'absence d'erreur du balayage.
    Ordre de suppression à respecter : `participations` → `participants_externes` → `evenements` →
    `types_evenement`, les membres créés par conversion **après** les participations qui les
    référencent (`on delete restrict`), et le tout **avant** la suppression du compte de test
    (`cree_par` est `on delete set null`).

**Aucun nouveau parcours Playwright canonique.** Le §8 de la spécification maîtresse fixe
**quatre** parcours pour tout le projet — connexion, inscription par token, pointage AEL,
validation d'une demande de suivi — et aucun ne concerne les événements. Cette phase n'en ajoute
pas d'office ; ses preuves de rôle passent par requête forgée et vérification en base, plus une
spec e2e dédiée à la visibilité différenciée (preuve n°15), qui ne peut pas se faire autrement.
Comme toutes les specs du dépôt : `workers: 1`, un seul serveur partagé.

---

## 10. Pièges connus, portés dans la conception

1. **Un refus métier levé devient `Minified React error #441` en production.** Une Server Action
   **retourne** son refus dans `{ erreur }` ; `src/app/error.tsx` est statique et ne lit jamais
   `error.message`, et l'utilisateur perdrait sa saisie. Refus de cette phase concernés :
   participant déjà inscrit à l'événement, participant déjà converti, classement définitif, motif
   de classement vide, fiche cible non active, demande de conversion non annulable, période
   incohérente. Chacun a son message dans un `messages.ts`, importable par les specs de
   `tests/e2e-prod/` — la seule suite qui attrape cette classe de défaut.
2. **PostgREST tronque en silence au-delà de `max_rows = 1000`.** Sur une liste de participants ou
   sur la liste « à traiter », une troncature ne produit pas une page incomplète : elle produit
   **des personnes que personne ne voit**. Les trois listes de la phase sont paginées avec un tri
   total (D75) ; toute lecture croisée avec une autre pour décider d'une écriture passe par un
   parcours par lots, jamais par une lecture simple ; et aucune lecture ne rend un résultat tronqué
   comme complet — le helper `refuserTroncature` existe déjà et doit être employé partout où la
   pagination n'est pas visible de l'utilisateur.
3. **`unique nulls not distinct` détruirait cette phase.** C'est la convention maison, elle est
   juste ailleurs, et elle est fausse ici : appliquée à `(evenement_id, membre_id)`, elle
   n'autoriserait **qu'un seul participant externe par événement**. Les index partiels de D58 et
   la preuve n°2 existent pour cela. Voir §5.4 pour l'analyse complète des trois conséquences.
4. **Une contrainte « exactement une des deux » doit être éprouvée dans les deux sens.** Les deux
   nulles **et** les deux remplies (preuve n°1). Une moitié éprouvée est une contrainte dont on
   croit ce qu'on n'a pas vérifié.
5. **Les suites de tests écrivent en base de production.** Tout ce que cette phase crée doit être
   retrouvable après une interruption : préfixe de famille `ZZ...-` sur `evenements.titre` et
   `participants_externes.nom`, **et** `cree_par` / `saisi_par` sur les lignes sans champ nommable
   (D60) — sans quoi une participation orpheline serait irretrouvable. Les preuves par mutation
   (n°1, 2, 9) retirent de vraies contraintes sur le projet **unique** : vérifier l'état avant,
   restaurer immédiatement après, comparer la définition restaurée à l'originale, ne jamais
   laisser une mutation active au-delà d'une exécution.
6. **Ne jamais discriminer une erreur Postgres sur son texte français.** Uniquement `error.code`
   (`23505`, `23503`, `23514`) ou le marqueur posé dans `error.details`. Les marqueurs de cette
   phase sont nouveaux et distincts de ceux qui existent : `participant_inconnu`,
   `participant_deja_converti`, `classement_definitif`, `motif_classement_vide`,
   `membre_cible_non_actif`, `membre_cible_inconnu`, `chemin_inconnu`,
   `demande_conversion_non_annulable`. Aucun ne réutilise un marqueur existant pour un sens
   différent.
7. **Un écran à visibilité différenciée se vérifie depuis chaque rôle**, et une assertion négative
   ne prouve rien sans contrôle positif **dans la même situation** (preuve n°15). `/evenements/[id]`
   a trois visages et D23 est un amendement récent : l'éprouver depuis le seul administrateur
   masquerait le défaut de garde derrière ses propres droits plus larges.
8. **Deux vues, deux régimes opposés, dans la même phase.** `seminaires_assistes` contourne la RLS
   (D71), `participants_a_traiter` en hérite (D74). Confondre les deux est un défaut à deux
   visages : `security_invoker = true` sur la première la rend **silencieusement vide** pour tout
   compte ordinaire — les étiquettes de séminaires disparaissent de toutes les fiches sans la
   moindre erreur ; `false` sur la seconde ouvrirait la liste des confidences à **tout compte
   actif**. La preuve n°5 ferme le premier sens, la preuve n°7 le second.
9. **Le compte racine n'a pas de fiche membre.** Il ne peut donc être ni participant, ni fiche
   cible d'un rattachement, ni faiseur de disciple d'une conversion — non par filtrage explicite,
   mais parce que toutes ces vues partent de `membres`. S'il convertit un participant par le
   chemin 1, il devient le `demandeur_profil_id` d'une demande sans `membre_id` : cas déjà traité
   par l'affichage de `/demandes` en 2b, à ne pas re-casser.
10. **Un chemin d'écriture non recensé.** Cette phase écrit sur trois tables déjà livrées et
    amende une fonction et une politique existantes : le tableau du §8.3 est la liste à refaire
    module par module pendant la revue, pas seulement les tables neuves.
11. **`is distinct from`, jamais `<>`, dans un déclencheur `before`.** Il s'exécute avant la
    vérification des `not null` : `<>` sur une valeur nulle rend `NULL` et fait tomber dans la
    mauvaise branche. Le projet a déjà payé ce piège une fois
    (`20260817150000_corriger_marqueur_completude_null.sql`) ; les déclencheurs de D62 et D63 sont
    exactement du même genre.
12. **Un amendement qui ne vit que dans une partie des documents.** C'est le piège qui a produit ce
    document : D23 était appliqué dans trois endroits et contredit dans deux autres, et la
    contradiction a survécu à deux phases parce que personne n'était allé relire ces deux
    paragraphes-là. **Règle à appliquer désormais** : quand une décision élargit un rôle, chercher
    dans **tous** les documents chaque phrase qui nomme l'ancienne restriction — pas seulement la
    matrice — avant de considérer l'amendement posé.

---

## 11. Contradictions et lacunes relevées dans les documents existants

Signalées plutôt que lissées. Les points 1 et 7 sont fermés par ce document ; les autres sont
constatés et demandent un arbitrage.

1. **Le §4.4 et le §6 de la spécification maîtresse contredisaient D23** (voir §2). **Corrigé**
   par l'amendement daté du 2026-08-14. Le §4.4 disait aussi « la liste "à traiter" de **l'admin**
   », faux de la même façon pour la consultation ; l'amendement le couvre.
2. **Les numéros de décision D36 à D43 sont attribués deux fois.** Le design de la phase 3 annonce
   que « D30 à D35 appartiennent au design de la phase 2b » et reprend à D36 — mais la table du §3
   de la 2b va jusqu'à **D42**, plus une « Correction du 2026-08-13 (**D43**) » au §7.1. D36
   désigne donc à la fois « l'alphabet du code d'inscription » (2b) et « l'exclusivité
   enseignant/modérateur par contrainte CHECK » (3) ; D42, à la fois « la fiche `en_attente` d'une
   demande annulée est supprimée » (2b) et « le nouveau garde `exigerModerateurOuAdministrateur` »
   (3) ; et ainsi de suite pour les huit numéros. Ce document **ne renumérote pas** — les
   commentaires SQL en base citent déjà ces numéros, et une renumérotation ferait mentir le code.
   Il faudrait soit une note de désambiguïsation dans la spécification maîtresse, soit un préfixe
   de phase pour les numéros à venir. **À arbitrer.**
3. **La table des décisions de la spécification maîtresse s'arrête à D29.** Elle renvoie
   explicitement au design de la 1c pour D17 à D21, mais **ne dit rien** de D30 à D53, qui vivent
   uniquement dans les designs de la 2b et de la 3, ni maintenant de D54 à D80. Un lecteur qui part
   de la spécification maîtresse ignore l'existence de plus de la moitié des décisions du projet.
   C'est le même mécanisme de dérive que le point 1, sur un autre axe. **Une note de renvoi dans
   le §2, sur le modèle de celle qui existe pour D17-D21, la fermerait** — ce document ne l'a pas
   ajoutée, la demande portant sur le seul §4.4.
4. **Le §4.4 ne dit rien du classement avec motif ni des trois chemins de conversion.** Il décrit
   un unique geste (« un clic les convertit en fiche membre, avec attribution d'un faiseur de
   disciple ») et ne prévoit aucune autre façon de vider la liste. Les deux décisions utilisateur
   qui comblent ce silence sont mises en œuvre ici (D55, D61 à D68) ; le §4.4 n'en porte toujours
   pas trace.
5. **Le §4.4 exige une vue lisible de tous sur une table fermée, sans dire comment.** C'est
   techniquement impossible sans une vue qui contourne la RLS (D71), puisque la RLS est ligne à
   ligne et que le partage à faire est colonne à colonne. Le principe posé en phase 3 (§4.5,
   « aucune vue ne doit élargir silencieusement ce qu'un compte peut lire ») pousserait un
   implémenteur consciencieux à écrire `security_invoker = true` — ce qui rendrait la vue
   **silencieusement vide** et ferait disparaître les étiquettes de séminaires de toutes les
   fiches sans aucune erreur. Le silence de la spécification sur ce point est une lacune réelle,
   comblée par D71 et par la preuve n°5.
6. **`demandes_membre.origine` n'a aucune valeur pour une conversion.** L'énumération
   (`auto_inscription`, `demande_suivi`) a été conçue en 2b avant que le chemin 1 existe. D32
   interdit explicitement d'inférer l'origine, donc une valeur doit être ajoutée (D66) ; c'est une
   lacune, pas une contradiction, mais elle impose une migration `alter type` isolée.
7. **L'interaction entre D42 (annulation d'une demande) et la conversion n'existait dans aucun
   document, et elle est destructrice.** L'annulation supprime la fiche `en_attente` ; une
   conversion par le chemin 1 pointe sur cette fiche. Sans D64, le réflexe `on delete set null`
   aurait **déconverti silencieusement** le participant : historique perdu, personne de retour
   dans la liste « à traiter », aucune erreur nulle part. **Fermé ici**, mais ni la 2b ni le §4.4
   ne pouvaient le voir venir, chacun ignorant l'autre.
8. **Écart constaté dans le code livré : `validerDemandeNouvellePersonne` écrit
   `faiseur_de_disciple_id` sans le verrou consultatif « arbre ».** La 1c (§4.1) établit qu'un
   déclencheur seul ne ferme pas la classe de défaut des réassignations concurrentes, et
   `public.definir_arbre` prend un `pg_advisory_xact_lock` pour cela. Le chemin de validation
   d'une demande de suivi, lui, écrit `faiseur_de_disciple_id` et `dirigeant_id` par un `update`
   direct via `clientAdmin()`, sans ce verrou : la barrière de dernier recours (le déclencheur
   anti-cycle) joue, mais la sérialisation qui ferme la conjonction de deux transactions ne joue
   pas. La fenêtre est étroite — la fiche validée vient de naître et n'a pas de descendant — mais
   elle est de la même nature que celle que la 1c a jugée inacceptable. **Non corrigé par cette
   phase** (hors périmètre) ; D67 évite de reproduire l'écart sur le chemin qu'elle ajoute.
   **À arbitrer** : soit le combler, soit écrire pourquoi il est acceptable là où il ne l'était
   pas ailleurs.
9. **Le §8 de la spécification maîtresse fixe quatre parcours Playwright, dont aucun ne concerne
   les événements.** Ce n'est pas une contradiction, mais une décision implicite jamais dite : la
   phase la plus riche en écrans du projet n'a aucun parcours bout en bout obligatoire. Ce
   document l'applique tel quel (§9, dernière note) plutôt que d'élargir le §8 de sa propre
   autorité.

---

## 12. Ce que la phase ne livre pas, et pourquoi

- **Aucun état sur un événement** (`prevue`/`tenue`/`annulee`). Rien ne le consomme :
  contrairement à une séance AEL, aucun compteur ne dépend de l'état d'un événement (§5.2).
- **Aucune fusion de participants externes en doublon.** D26 exclut la fusion générale de fiches ;
  le cas étroit du doublon d'externes se traite par le chemin 3 (rattacher les deux à la même
  fiche membre), sans rien détruire.
- **Aucune notification nouvelle.** Le chemin 1 réutilise `nouvelle_demande`, déjà diffusée à tous
  les administrateurs actifs ; l'énumération `notifications.type` n'est pas étendue. Rien dans
  cette phase ne notifie à la création d'un événement ou à l'expression d'un désir — hors
  périmètre général du projet.
- **Aucun journal des participations** (D79).
- **Aucun export ni tableau de bord** des participations ou des conversions — hors périmètre du
  projet entier (§2).
- **Aucune réouverture de la liste « à traiter »** après classement (décision utilisateur), et
  aucun déclassement (D62). Une personne classée qui reprend contact se convertit directement.
- **Aucune correction de l'écart du §11, point 8** — signalé, non traité, hors périmètre.
- **Aucune renumérotation des décisions** malgré la collision D36-D43 (§11, point 2) : le code
  cite ces numéros, une renumérotation ferait mentir des commentaires en base.

---

## 13. À trancher

Trois points, tous exposés au §11 et aucun bloquant pour l'implémentation :

- **La collision D36-D43** (§11, point 2) — note de désambiguïsation, préfixe de phase, ou statu
  quo assumé.
- **Le renvoi vers D30-D80 dans le §2 de la spécification maîtresse** (§11, point 3) — une note,
  sur le modèle de celle qui existe déjà pour D17-D21.
- **Le verrou « arbre » manquant sur `validerDemandeNouvellePersonne`** (§11, point 8) — le
  combler, ou écrire pourquoi il est acceptable là.

Cette section est conservée **avec** ses points ouverts, plutôt que vidée par des décisions que ce
document n'a pas l'autorité de prendre : les trois portent sur du code ou des documents que la
phase 4 ne livre pas.
