# Phase 3 — AEL : calendrier, séances, pointage, compteurs

**Date :** 2026-08-13
**Statut :** design proposé, prêt pour revue avant plan d'implémentation
**Spécification maîtresse :** `2026-08-11-suivi-asonkeng-design.md` — ce document ne la
remplace pas. Il précise ce que la phase 3 livre, en particulier le §4.5 (AEL), le §5.2
amendé par D22, D28 et D29, et le §6 (parcours « Tenue d'un AEL »). Le ton, la structure et
le niveau de détail suivent `2026-08-12-phase-1c-design.md`.

---

## 1. Objet

Les phases 0 à 2 livrent le registre des membres, leur arborescence, leurs statuts et les
comptes qui les administrent. Aucune n'a touché à l'AEL : les tables `calendriers_ael`,
`seances_ael`, `seances_ael_antennes` et `presences_ael` n'existent pas encore, non plus que
la vue `compteurs_ael`.

La phase 3 livre le calendrier récurrent par antenne, un geste de génération des séances
idempotent (D28), la tenue d'une séance et le pointage des présences à l'échelle de D18 et
D29, et le compteur AEL par membre. C'est elle qui remplace le suivi de présence actuel
(§9 de la spécification maîtresse).

**Hors périmètre de ce document** : la phase 2b, en cours de conception en parallèle par un
autre agent, dans un fichier distinct. Rien ici ne dépend de son contenu au-delà de ce que
la spécification maîtresse fixe déjà (comptes, rôles, gardes existants).

---

## 2. Décisions prises pendant ce cadrage

Elles prolongent le tableau du §2 de la spécification maîtresse — D22, D28 et D29 y sont déjà
posées et ne sont pas rouvertes ici, seulement exposées et mises en œuvre. Les décisions
ci-dessous comblent ce que D28 et D29 ne précisent pas : **par quoi**, pas seulement quoi.

> **Numérotation.** Les numéros de décision sont globaux au projet. **D30 à D35** appartiennent
> au design de la phase 2b, rédigé en parallèle dans un autre fichier — ils n'apparaissent pas
> ici. Cette table reprend à **D36**. Deux décisions supplémentaires, **D48** et **D49**, ont
> été tranchées par l'utilisateur après une première version de ce document, en réponse aux
> points 1 à 4 soulevés au §11 ; elles sont intégrées ci-dessous à leur place naturelle plutôt
> que reléguées en fin de tableau. **D50 à D53** couvrent un livrable ajouté après coup — la
> gestion des membres d'une antenne (§3, §4.7, §7) — demandé par l'utilisateur une fois le
> reste du document stabilisé.

| # | Décision | Justification |
|---|---|---|
| D36 | L'exclusivité enseignant/modérateur (au plus un des deux champs) est portée par une **contrainte CHECK**, pas un déclencheur | Contrairement à l'exclusivité des statuts (§4.3 de la spec maîtresse), la condition est **locale à la ligne** : elle ne dépend d'aucune autre table. Un déclencheur y ajouterait une indirection sans rien gagner — le motif qui a justifié un déclencheur pour les statuts (la condition vit sur `groupes_statut`, pas sur la ligne insérée) ne s'applique pas ici |
| D37 | Le refus de passer une séance à `tenue` sans thème ni enseignant est porté par un **déclencheur**, avec **deux marqueurs d'erreur distincts** (`seance_sans_theme`, `seance_sans_enseignant`) et un **contrôle amont nommé** dans la Server Action | Deux marqueurs et non un seul, parce que le §7 exige l'« indication du champ manquant » — un marqueur unique obligerait l'interface à deviner lequel des deux manque. Le duo déclencheur + contrôle amont reprend le motif de l'archivage bloqué en 1c (§4.2 de son design) : le déclencheur protège même une écriture directe, le contrôle amont produit un message qui nomme la cause avant d'écrire |
| D38 | L'idempotence de la génération (D28) est portée par une **contrainte unique**, pas par un verrou consultatif | La classe de défaut que l'arbre et le dernier administrateur devaient fermer par un verrou (`pg_advisory_xact_lock`) est un invariant qui dépend d'un **COUNT recalculé entre la lecture et l'écriture** — non indexable. Ici, l'invariant « pas deux séances pour la même occurrence » se formule directement comme un **index unique** : Postgres le fait respecter atomiquement, y compris sous deux générations lancées en même temps, sans qu'aucun verrou applicatif ne soit nécessaire |
| D39 | Une colonne additive `genere_pour_le`, **distincte et indépendante de `date`**, sert d'ancre à la contrainte unique de D38 | `date` est éditable — c'est ainsi qu'une séance du samedi se déplace au dimanche (§4.5). Si l'unicité portait sur `(calendrier_id, date)`, déplacer une séance libérerait sa date d'origine, et le prochain geste de génération la recréerait — exactement le défaut que le point de vigilance 2 du cadrage signale. `genere_pour_le` fige la date **calculée** par la récurrence au moment de la génération et ne bouge jamais ensuite ; `date` reste seule visible et modifiable à l'écran |
| D40 | L'horizon glissant de D28 est une **constante applicative**, pas une donnée éditable en base | Cohérent avec `TAILLE_PAGE_ANNUAIRE` et `LIMITE_SELECTEUR` de la 1c : une valeur de configuration documentée dans le code plutôt qu'un réglage en base qui ajouterait un écran et une politique RLS pour un besoin jamais exprimé. **Valeur retenue : 8 semaines** — décision utilisateur du 2026-08-13, tranchant ce que ce document proposait initialement par défaut. Elle reste un réglage de code, ajustable sans migration si le rythme réel de génération s'avère différent |
| D41 | La génération crée **une séance par ligne de calendrier** ; regrouper plusieurs antennes dans une même séance reste un geste **manuel** | La spécification dit qu'« une séance peut cibler plusieurs antennes » (§4.5) sans dire que la génération doit les fusionner. Deviner quand deux calendriers d'antennes différentes désignent « la même » séance serait une décision produit non demandée ; il est plus sûr de générer simplement, et de laisser l'édition manuelle (ajouter une antenne à une séance existante) couvrir le cas réel s'il se présente |
| D42 | Nouveau garde `exigerModerateurOuAdministrateur` dans `src/lib/securite/garde.ts` | Le calendrier, la génération, la tenue et le pointage sont réservés au modérateur et à l'administrateur (D22), une autorisation **par rôle**, non par portée d'autorité sur un membre — `exigerAutoriteSur` ne s'applique pas ici, il répond à une question différente. Comme `exigerAdministrateur`, c'est « un point d'entrée de plus, et un seul » : aucune vérification de rôle dispersée dans les écrans ou les actions |
| D43 | Le pointage écrit **ligne à ligne** : chaque case cochée déclenche une écriture unitaire (`upsert` sur la clé composite `(seance_id, membre_id)`), jamais un formulaire global soumis d'un bloc | C'est la mise en œuvre directe du §7 : « le pointage est ligne à ligne, pas un formulaire global ». En écrivant une ligne à la fois sur sa propre clé, « dernière écriture gagnante » devient vrai **par construction** — deux modérateurs qui pointent la même séance ne se marchent dessus que sur les membres qu'ils cochent tous les deux, jamais sur l'ensemble de la liste |
| D44 | Le compteur AEL n'entre **pas** dans l'annuaire paginé ; il n'est lu que sur la fiche individuelle, avec un **index dédié** sur `presences_ael(membre_id)` | La clé primaire composite `(seance_id, membre_id)` mène par `seance_id` : elle n'accélère pas un regroupement par membre. L'ajouter à chaque ligne de l'annuaire (potentiellement un millier, D18) imposerait cet agrégat à chaque page vue pour un chiffre que personne ne demande d'y voir — la spécification ne place le compteur que sur la fiche (§4.2, §4.5) |
| D45 | Pas de journal des présences symétrique à `journal_statuts` | D7 justifie le journal des statuts par le besoin de tracer un changement de nature spirituelle. Une présence à une séance n'a pas cette charge : `pointe_par` et `pointe_le`, déjà sur `presences_ael`, donnent la traçabilité minimale (qui a coché, quand) sans dupliquer un mécanisme que rien dans la spécification ne demande ici |
| D46 | Le pointage charge la **liste complète** en un Server Component ; la recherche de D29 **filtre côté client**, sans aller-retour serveur par frappe | Le sélecteur de membre de la 1c (`SelecteurMembre`, recherche serveur bornée à `LIMITE_SELECTEUR`) répond à un besoin différent — choisir un parmi mille. D29 impose l'inverse : voir tout le monde. Une recherche serveur par frappe sur une liste déjà entièrement chargée ajouterait de la latence pour filtrer des données déjà en main ; un filtre en mémoire, côté client, est immédiat, précieux sur le réseau mobile pour lequel l'application est pensée en priorité (§3 de la spec maîtresse). **Limite assumée, décidée et non un oubli** (décision utilisateur du 2026-08-13) : aucun seuil ni bascule vers une pagination de secours au-delà d'un certain effectif — en ajouter contredirait D29 et ferait coexister deux comportements selon la taille de l'antenne, le pire des deux mondes. À reprendre si une mesure réelle montre que la page devient lourde, jamais par anticipation |
| D47 | Deux mécanismes de recherche distincts coexistent sur l'écran de pointage, sans qu'aucun ne remplace l'autre | Le filtre client de D46 porte sur la liste complète des antennes ciblées (D29). Pour « ajouter à la main n'importe quel autre membre » (§6), l'écran **réutilise tel quel** le `SelecteurMembre` de la 1c (recherche serveur bornée, `LIMITE_SELECTEUR`) — il cherche hors du périmètre déjà chargé, un besoin structurellement différent. Deux composants pour deux problèmes, pas un nouveau composant de recherche à écrire |
| D48 | Une présence est un **fait daté, qui ne bouge jamais** : ni l'archivage d'un membre ni un changement d'antenne ne modifient une présence enregistrée ou le compteur qui en découle | Décision utilisateur du 2026-08-13, tranchant les points 1 et 2 du cadrage initial. Le compteur compte une **histoire**, pas un état courant — exactement ce que fait déjà `report_initial_ael`, qui préserve l'historique antérieur à l'application (D4). Les deux options écartées — ne compter que l'antenne actuelle, ou exclure les présences d'un membre archivé — feraient **varier rétroactivement des chiffres passés** à partir de faits réels : un chiffre qui change sans qu'aucun événement nouveau ne l'explique est exactement le genre de mensonge que ce projet traque depuis la 1c |
| D49 | L'état d'une séance est **réversible** : un modérateur peut ramener à `prevue` ou `annulee` une séance passée à `tenue` par erreur, et le pointage déjà fait **n'est pas effacé** | Décision utilisateur du 2026-08-13, tranchant les points 3 et 4 du cadrage initial. Le compteur ne comptant que les séances **tenues** (§4.5 de la spec maîtresse), ces présences cessent simplement d'être comptées le temps du retour en arrière, sans être détruites — repasser à `tenue` les retrouve intactes. Refuser tout retour en arrière rendrait une erreur de clic définitive sans intervention en base, un compromis que le projet a déjà explicitement refusé pour l'archivage d'une fiche (`desarchiverMembre`, phase 1c). Effacer les présences détruirait un travail de saisie qu'il faudrait refaire si le retour était lui-même une erreur |
| D50 | L'écran de gestion des membres d'une antenne (`/antennes/[id]`, nouveau) est un livrable de la phase 3, **avant** le pointage dans l'ordre des tâches ; le rattachement et le détachement d'un membre à une antenne sont ouverts au **modérateur autant qu'à l'administrateur** | D29 construit la liste de pointage à partir des membres actifs des antennes ciblées : si le rattachement est faux ou incomplet, le pointage l'est aussi — quelqu'un de présent n'apparaît pas dans sa propre assemblée, et son compteur ne bouge jamais sans que personne ne comprenne pourquoi. Ce n'est pas un confort ajouté à l'AEL, c'est le préalable à sa fiabilité. Sur l'accès : le §5.2 est **silencieux** sur ce geste précis — sa ligne « Créer statuts, groupes, antennes, types d'événement » réserve la **création** de l'entité antenne à l'administrateur, mais ne dit rien de l'affectation d'un membre **existant** à une antenne **existante**, un geste de nature différente, plus proche d'une correction de fiche que d'une création de catalogue. Ce document ne réinterprète pas silencieusement cette ligne : il constate son silence et propose un ajout à la matrice, sur le modèle de D22 et D23 — à reporter dans le §5.2 de la spécification maîtresse. L'ouverture au modérateur suit exactement le raisonnement de D22 : c'est lui qui pâtit d'un rattachement faux au moment de pointer, et le lui refuser l'obligerait à demander une intervention pour corriger une donnée qui bloque son propre travail |
| D51 | Le rattachement réutilise `SelecteurMembre` (recherche serveur bornée, 1c) **un membre à la fois, écriture immédiate à chaque choix** ; aucun composant de sélection multiple n'est écrit | « Rattacher en masse » ne veut pas dire « transaction unique portant plusieurs membres » — c'est le même geste répété, comme le pointage (D43) l'a déjà établi pour cocher des présences. `SelecteurMembre` cherche déjà exactement « un membre actif parmi mille », le besoin exact ici ; lui ajouter un mode multi-sélection dupliquerait sa logique de recherche pour gagner seulement un regroupement d'écritures qu'aucune exigence ne demande. La liste des membres déjà rattachés, elle, réutilise la fonction de lecture non paginée que le pointage introduit pour charger sa liste complète (D46, §7), appelée avec un tableau à une seule antenne — la même forme de données, un seul appelant de plus, aucune requête nouvelle à écrire |
| D52 | Détacher un membre met `antenne_id` à `NULL` (déjà autorisé par le modèle, §4.2 de la spec maîtresse) ; **aucune présence ni aucun compteur n'en est affecté**, passé ou futur | Application directe de D48 : une présence est un fait daté qui ne bouge jamais, et `presences_ael` ne référence aucune antenne — rien à toucher, rien à nettoyer. L'effet du détachement est **strictement prospectif** : le membre cesse d'apparaître dans les listes de pointage pré-remplies des futures séances de cette antenne (D46 les construit sur `antenne_id` courant), sans que son historique de présence n'en garde la moindre trace. Il reste ajoutable à la main sur n'importe quelle séance, comme n'importe quel autre membre actif (D47). Aucun déclencheur de blocage n'est posé, contrairement à l'archivage d'un faiseur de disciple (1c, §4.2 de son design) : rien dans le modèle ne fait dépendre une structure AEL du `antenne_id` **individuel** d'un membre — les séances se rattachent à une antenne via `seances_ael_antennes`, pas via leurs participants |
| D53 | La liste des membres d'une antenne se charge **en entier, sans pagination**, mais pour une raison distincte de D29 | Ce n'est pas le même geste que pointer : rien n'oblige à voir toute l'antenne d'un seul regard pour corriger une fiche isolée. La raison ici est de poids, pas de geste : une antenne est par construction un sous-ensemble de l'effectif total, et le seuil déjà établi comme raisonnable pour une page non paginée (D46, quelques centaines de lignes) couvre le cas normal. Paginer ajouterait un état de page et un clic pour retrouver quelqu'un, sans rien économiser puisque le poids reste sous ce seuil. **Limite assumée** : si une antenne dépassait un jour très largement les autres en effectif, cette page grossirait avec elle sans garde-fou — à reprendre par une mesure réelle, pas par anticipation, même réserve que D46 |

---

## 3. Périmètre livré

1. **Gestion des membres d'une antenne** (`/antennes/[id]`, nouveau) — rattacher et détacher un
   membre sans passer par sa fiche, réservé au modérateur et à l'administrateur (D50). Livré
   **avant** le pointage dans l'ordre des tâches : c'est le préalable à la fiabilité de la
   liste que D29 en tire.
2. **Calendrier récurrent par antenne** — écran de gestion (`calendriers_ael` existe déjà en
   base, amorcé mardi/mercredi/samedi pour chaque antenne ; aucune interface ne l'alimente
   avant cette phase), réservé au modérateur et à l'administrateur (D22).
3. **Génération des séances** — geste explicite, idempotent, sur l'horizon glissant de D40.
4. **Tenue d'une séance** — saisie du thème, de l'enseignant, du modérateur ; passage à
   `tenue` bloqué tant que thème et enseignant manquent (§7, D37) ; l'état reste réversible
   ensuite, sans perte du pointage déjà fait (D49).
5. **Pointage des présences** — liste complète des membres actifs des antennes ciblées, sans
   pagination, avec recherche (D29, D46, D47).
6. **Compteur AEL** — vue `compteurs_ael`, affichée sur la fiche membre, qui ne varie jamais
   rétroactivement avec l'archivage ou un changement d'antenne du membre (D48).
7. **Déplacement et annulation d'une séance** — modification de `date` et de `etat`, sans
   recréer l'occurrence à sa date d'origine (D39).

---

## 4. Modèle de données

Migrations strictement additives, comme l'exige le projet — un seul projet Supabase sert au
développement et à la production (rappelé au §9).

### 4.1 `calendriers_ael`

Aucun changement : la table, ses colonnes et son amorçage existent déjà (§4.5 de la spec
maîtresse). Cette phase lui ajoute seulement une interface et un garde.

### 4.2 `seances_ael`

Nouvelle table. En plus des colonnes du §4.5 de la spec maîtresse :

| Colonne ajoutée | Type | Notes |
|---|---|---|
| `genere_pour_le` | date NULL | Voir D39. `NULL` pour une séance créée à la main (`calendrier_id` également `NULL`) |

Contraintes :

```
constraint seances_ael_enseignant_exclusif
  check (enseignant_membre_id is null or enseignant_libre is null)
constraint seances_ael_moderateur_exclusif
  check (moderateur_membre_id is null or moderateur_libre is null)
constraint seances_ael_generation_unique
  unique (calendrier_id, genere_pour_le)
```

La contrainte unique traite deux `NULL` comme distincts (comportement standard de Postgres) :
des séances créées à la main, sans `calendrier_id`, ne se bloquent jamais entre elles.

**Déclencheur `seances_ael_tenue_complete`** — `before insert or update on seances_ael`,
n'agissant que lorsque `new.etat = 'tenue'` :

```
if new.theme is null or trim(new.theme) = '' then
  raise exception '...' using detail = 'seance_sans_theme';
end if;
if new.enseignant_membre_id is null
   and (new.enseignant_libre is null or trim(new.enseignant_libre) = '') then
  raise exception '...' using detail = 'seance_sans_enseignant';
end if;
```

Sur `insert` : couvre le cas où une séance est créée à la main directement à l'état `tenue`.
Sur `update` : couvre la transition normale décrite au §6. Aucun verrou consultatif requis
(D38) : la vérification ne lit que la ligne en cours d'écriture. Le déclencheur ne réagit
qu'au passage **vers** `tenue` ; revenir vers `prevue` ou `annulee` n'est jamais bloqué par
lui — c'est ce qui rend la réversibilité de D49 possible sans migration supplémentaire, la
même barrière servant les deux sens sans avoir à distinguer un aller-retour légitime d'une
tentative de contournement.

### 4.3 `seances_ael_antennes`

Table de jonction, sans changement par rapport au §4.5 de la spec maîtresse. Peuplée par la
génération (une ligne, celle de l'antenne du calendrier d'origine — D41) ou à la main.

### 4.4 `presences_ael`

Sans changement par rapport au §4.5. La clé primaire composite `(seance_id, membre_id)` est
la cible de l'`upsert` de D43 (`on conflict (seance_id, membre_id) do update`). Aucune
contrainte ni déclencheur ne relie une ligne de `presences_ael` à l'état courant du membre ou
à son antenne actuelle (D48) : une fois écrite, une présence ne dépend plus que de la séance
et du membre au moment du pointage — ni son archivage ultérieur, ni un changement d'antenne
ne la modifient ou ne la suppriment.

### 4.5 Vue `compteurs_ael`

```
create view public.compteurs_ael
  with (security_invoker = true) as
select
  m.id as membre_id,
  m.report_initial_ael
    + coalesce(count(p.membre_id) filter (
        where p.present and s.etat = 'tenue'
      ), 0) as total
from public.membres m
left join public.presences_ael p on p.membre_id = m.id
left join public.seances_ael s on s.id = p.seance_id
group by m.id, m.report_initial_ael;
```

**Vue calculée plutôt que compteur stocké (D4).** Rien à synchroniser : le total ne peut pas
diverger de son historique, contrairement à une colonne qu'un correctif oublierait
d'incrémenter. C'est le même raisonnement que le §4.2 applique déjà au report initial, et
c'est ce qui rend D48 gratuit : la vue ne filtre ni sur l'état courant du membre ni sur son
antenne actuelle, elle somme purement des faits passés, quel que soit ce que le membre est
devenu depuis.

**Sous RLS, pas de fuite pour autant.** Une fiche archivée reste invisible à qui ne devrait
pas la voir (§5.3) : `compteurs_ael`, en `security_invoker`, hérite de ce filtre via son
jointure sur `membres` — un compte ordinaire interrogeant le compteur d'un membre archivé ne
verra simplement **aucune ligne**, jamais un chiffre. D48 dit que le fait ne bouge pas ; §5.3
continue seule de décider qui a le droit de le lire. Ce sont deux questions différentes, et
cette vue ne les mélange pas.

**Implication à l'échelle de D18.** Un millier de membres ou plus, chacun avec potentiellement
des centaines de séances tenues sur plusieurs années : l'agrégat par membre doit rester bon
marché. Deux conditions le permettent, et doivent être posées explicitement en migration :

- **`security_invoker = true`** sur la vue, pour qu'elle respecte la RLS de l'appelant plutôt
  que celle du propriétaire — cohérent avec le principe du projet qu'aucune vue ne doit
  élargir silencieusement ce qu'un compte peut lire.
- **Index dédié `presences_ael(membre_id)`** — la clé primaire composite mène par `seance_id`
  et ne sert à rien pour un regroupement par membre (D44). Sans cet index, chaque lecture de
  compteur balaierait toute la table de présences.
- **Index existant `seances_ael(etat)`** (à créer, sur le modèle de `membres_etat_idx`), pour
  que le filtre `etat = 'tenue'` reste sélectif.

Comme pour l'annuaire en 1c (§6.2 de son design), le vrai coût est celui de l'usage : la vue
n'est interrogée **que pour une fiche individuelle** (D44), jamais en boucle sur une liste —
c'est ce qui rend un `COUNT` recalculé à chaque lecture acceptable à cette échelle, sans
qu'aucune mesure ne l'ait encore justifié autrement.

### 4.6 Idempotence de la génération — mécanisme complet

1. `lib/domaine/ael.ts` (TypeScript pur) calcule, pour un calendrier et un horizon donnés, la
   liste des dates d'occurrence à venir — fonction pure, testée au Vitest sans base.
2. La Server Action de génération transmet ces occurrences à une passerelle SQL
   `public.generer_seances_ael(p_occurrences jsonb)`, `security definer`, `execute` réservé à
   `service_role` (motif des passerelles de statuts et d'arbre) :
   - insère dans `seances_ael` avec `on conflict (calendrier_id, genere_pour_le) do nothing`,
     et récupère les identifiants effectivement créés ;
   - insère, pour ces seuls identifiants, la ligne correspondante dans
     `seances_ael_antennes`.
3. Les deux insertions sont dans la **même transaction** : une séance ne peut jamais exister
   sans sa ligne d'antenne, y compris si la génération échoue à mi-chemin.

Le geste est rejouable sans risque : relancer la génération sur un horizon qui recouvre des
occurrences déjà créées ne produit **aucune** ligne nouvelle pour elles — prouvé par
contrainte, pas par une vérification applicative « est-ce que ça existe déjà » qui serait
elle-même sujette à une course.

**Le point de vigilance du déplacement.** Une séance déplacée du samedi au dimanche a sa
`date` modifiée par une action d'édition ordinaire, qui ne touche jamais `genere_pour_le`. Au
prochain geste de génération, l'occurrence du samedi correspondant reste identifiée par
`(calendrier_id, genere_pour_le = <samedi d'origine>)` — déjà présente — et n'est donc pas
recréée. La séance affichée à l'écran reste celle du dimanche, unique.

### 4.7 Rattachement d'un membre à une antenne

Aucune colonne nouvelle : `membres.antenne_id` existe depuis la 1a et accepte déjà `NULL`
(§4.2 de la spec maîtresse). Cette phase lui ajoute un second chemin d'écriture, à côté de
`modifierMembre` (qui reste réservée à l'administrateur pour le reste de la fiche, inchangée) :

- **`definirAntenneMembre(membreId, antenneId | null)`** — affectation directe, sur le modèle
  de `definir_arbre` : `null` veut dire « détacher », pas « ne change pas ». Un `antenneId` non
  nul doit référencer une antenne **active** — en rattacher une désactivée reproduirait, pour
  les antennes, l'incohérence que le §7 de la spec maîtresse ferme déjà pour les statuts
  désactivés (ils disparaissent des nouvelles attributions sans effacer les anciennes).
- Gardée par `exigerModerateurOuAdministrateur` (D42) — pas de nouveau garde à écrire.
- Aucune passerelle SQL `security definer` : contrairement à l'arbre ou aux statuts, il n'y a
  ici **aucun invariant qui dépend d'autre chose que la ligne écrite**. Une simple mise à jour
  via `clientAdmin()`, verrouillée par Postgres à la ligne comme n'importe quel `UPDATE`,
  suffit — même raisonnement que D38 pour l'idempotence de la génération : le verrou
  applicatif ne se justifie que si l'invariant dépasse une seule ligne.
- **Aucun effet sur `presences_ael` ni `compteurs_ael`** (D48, D52) : rien dans le modèle ne
  relie une présence à l'antenne courante du membre, donc rien à propager, rien à nettoyer.

Ce nouveau chemin d'écriture s'ajoute au recensement que toute revue de sécurité de cette
phase doit refaire (piège n°10, §9) : deux Server Actions écrivent désormais sur
`membres.antenne_id`, chacune avec son propre garde, et aucune des deux ne doit être oubliée.

---

## 5. Couche domaine — `src/lib/domaine/ael.ts`

Fonctions pures, sans accès à la base, testées au Vitest (§8 de la spec maîtresse annonce déjà
« génération des séances depuis un calendrier récurrent » et « compteur AEL avec report
initial » comme cibles) :

- `calculerOccurrences(calendrier, aPartirDe, horizonSemaines)` — rend les dates d'un jour de
  semaine donné dans la fenêtre `[aPartirDe, aPartirDe + horizonSemaines]`. Cas à couvrir :
  bornes de l'horizon (première et dernière semaine), un calendrier `actif = false` ne produit
  rien, deux calendriers de la même antenne (jours différents) ne se mélangent pas.
- `compteurAel(reportInitial, presencesTenues)` — la formule du §4.5, isolée pour être testée
  indépendamment de la vue SQL qui l'exécute réellement en production. La vue reste la seule
  source de vérité à l'exécution ; cette fonction sert à verrouiller la formule elle-même
  contre une régression silencieuse, au même coût que les autres fonctions pures du projet.
- `seanceEstComplete(seance)` — même règle que le déclencheur (thème et enseignant présents),
  dupliquée à dessein côté application pour produire, avant d'écrire, un message qui nomme le
  champ manquant (D37) — le déclencheur reste la barrière, le contrôle amont explique, motif
  déjà établi par l'archivage en 1c.

Le rattachement d'un membre à une antenne (§4.7, D50-D53) n'ajoute **aucune** fonction pure
ici : contrairement à la génération ou au compteur, cette écriture ne porte aucune règle de
calcul à isoler — seulement la validation triviale « l'antenne visée est active », faite
directement dans la Server Action, comme les vérifications d'existence de `definir_arbre`.

---

## 6. Politiques RLS

Cohérentes avec le §5.3 de la spécification maîtresse : lecture ouverte à tout compte actif,
**aucune** politique d'écriture, sur aucune des quatre tables.

| Table | Politique |
|---|---|
| `calendriers_ael` | `for select`, tout compte actif |
| `seances_ael` | `for select`, tout compte actif |
| `seances_ael_antennes` | `for select`, tout compte actif |
| `presences_ael` | `for select`, tout compte actif |
| Vue `compteurs_ael` | `security_invoker = true` — hérite de la lecture de `membres` (donc de sa politique différenciée `actif`/`en_attente`/`archive`) et de `presences_ael`/`seances_ael`, sans politique propre |

Toute mutation passe par une Server Action derrière `exigerModerateurOuAdministrateur` (D42),
qui écrit avec le client privilégié (`clientAdmin()`) ou via la passerelle SQL du §4.6. La RLS
reste le filet : même une action mal gardée ne pourrait rien écrire directement depuis un rôle
`authenticated` ou `anon`.

`definirAntenneMembre` (§4.7) écrit sur `membres`, table déjà couverte par la politique
`membres_lecture` du §5.3 de la spec maîtresse et par la règle générale « aucune politique
d'écriture, sur aucune table » (§5.3) : aucune politique RLS nouvelle n'est nécessaire pour ce
livrable, seul le garde applicatif change par rapport à `modifierMembre`.

---

## 7. Écrans

| Écran | Contenu | Accès |
|---|---|---|
| `/antennes/[id]` (nouveau) | Membres actuellement rattachés (D53), détachement, ajout d'un membre via `SelecteurMembre` (D51) | Gestion (rattacher, détacher) : modérateur, administrateur (D50). Consultation : tout compte actif, comme la filiation d'une fiche (D20 de la 1c) — voir qui appartient à une antenne n'a jamais été une donnée sensible |
| `/antennes` (existant, inchangé) | Création et bascule active/inactive des antennes | Réservé à l'administrateur (§5.2 de la spec maîtresse, « créer... antennes ») — cette phase ne touche pas cet écran, seul `/antennes/[id]` est nouveau |
| `/ael/calendriers` (nouveau) | Créneaux récurrents par antenne : ajout, désactivation | Gestion : modérateur, administrateur (D22). Pas d'écran de lecture seule dédié — le calendrier n'intéresse en pratique que qui l'exploite ; sa lecture reste ouverte sous RLS si un besoin futur en demande l'affichage ailleurs |
| `/ael/seances` (nouveau) | Liste des séances à venir et passées, bouton « Générer les séances » | Génération et création manuelle : modérateur, administrateur. Consultation (date, thème, état) : tout compte actif |
| `/ael/seances/[id]` (nouveau) | Thème, enseignant, modérateur, passage à `tenue` et retour possible vers `prevue`/`annulee` sans perte du pointage (D49), pointage (D29, D43, D46, D47) | Modification et pointage : modérateur, administrateur. Consultation seule (thème, enseignant, compteur de présents) : tout compte actif |
| `/membres/[id]` | Section AEL : compteur total (`compteurs_ael`), stable face à l'archivage et au changement d'antenne (D48) | Tout compte actif, comme le reste de la fiche |

---

## 8. Preuves exigées

Dans le prolongement de la 1c : contrôle positif sur toute vérification par recherche, preuve
par mutation sur chaque barrière, et une écriture réelle constatée en base quand une barrière
tombe — jamais un simple refus.

1. **Contrainte CHECK d'exclusivité** (D36) — retirer la contrainte, écrire les deux champs
   enseignant (ou modérateur) sur une même ligne via `clientAdmin()`, constater l'écriture
   réussie (donc la barrière absente), remettre la contrainte, rejouer et constater le refus.
2. **Déclencheur de complétude** (D37) — désactiver, forcer un passage à `tenue` sans thème
   par écriture directe, **constater la ligne réellement écrite** en base (pas un refus
   attendu), réactiver, comparer `pg_get_triggerdef` avant/après.
3. **Contrainte unique de génération** (D38, D39) — retirer temporairement, rejouer la
   génération deux fois sur le même horizon, constater **deux lignes distinctes** pour la
   même occurrence en base, remettre la contrainte.
4. **Contrôle positif sur l'idempotence** — avant d'affirmer qu'un second appel n'ajoute rien,
   prouver qu'un premier appel ajoute bien les lignes attendues (compter, pas déduire) : c'est
   le motif « test qui regarde du vide » déjà rencontré en 1c (Task 10, `ancetres_membre`).
5. **`exigerModerateurOuAdministrateur`** (D42) — requête forgée par un compte utilisateur
   simple contre `pointerPresence` et contre `genererSeances`, vérification en base de
   l'absence d'écriture, avec un canari (un compte modérateur réel réussissant le même geste
   dans un contexte neuf).
6. **`revoke execute`** sur `public.generer_seances_ael` et sur toute passerelle SQL
   introduite par cette phase, avec contrôle positif que `service_role` réussit.
7. **Le déplacement ne recrée pas l'occurrence d'origine** — scénario bout en bout : générer,
   déplacer une séance, regénérer, vérifier qu'il n'existe toujours **qu'une seule** séance
   pour cette occurrence et que sa date reste la date déplacée. C'est la preuve directe du
   point de vigilance 2 du cadrage, pas seulement un test unitaire de la fonction pure.
8. **Le parcours « pointage d'un AEL »** est l'un des quatre parcours Playwright que le §8 de
   la spec maîtresse fixe pour tout le projet : cette phase doit l'écrire, avec un vrai compte
   modérateur, et — comme en 1c — une vérification en base de l'écriture des présences, pas
   seulement de leur affichage.
9. **Réversibilité de l'état** (D49) — passer une séance à `tenue`, pointer des présences,
   revenir à `prevue`, constater par lecture directe en base que les lignes de `presences_ael`
   survivent intactes (comptage avant/après identique), repasser à `tenue` et constater que
   `compteurs_ael` retrouve exactement le même total qu'avant le retour en arrière.
10. **Persistance du compteur après archivage** (D48) — pointer un membre présent sur une
    séance tenue, relever son total, archiver sa fiche, relire `compteurs_ael` pour ce membre
    **en tant qu'administrateur** (seul habilité à voir une fiche archivée, §5.3) et constater
    que le total n'a pas changé ; relire aussi en tant que compte ordinaire pour constater
    l'absence de ligne, non un chiffre faux (voir §4.5).
11. **`exigerModerateurOuAdministrateur` sur `definirAntenneMembre`** (D50) — requête forgée
    par un compte utilisateur simple contre le rattachement et contre le détachement,
    vérification en base de l'absence d'écriture (`antenne_id` inchangé), avec un canari (un
    compte modérateur réel réussissant le même geste dans un contexte neuf) — même structure
    que la preuve n°5, sur une action distincte.
12. **Le détachement n'affecte ni une présence ni un compteur** (D48, D52) — rattacher un
    membre, le pointer présent sur une séance tenue, relever son total, le détacher, relire
    `presences_ael` (ligne intacte) et `compteurs_ael` (total inchangé) ; puis générer une
    séance future pour cette antenne et constater qu'il **n'apparaît plus** dans la liste
    pré-remplie — l'effet est prospectif, pas rétroactif, sur les deux faces à la fois.
13. **Une antenne désactivée refuse un nouveau rattachement** — tenter `definirAntenneMembre`
    vers une antenne `actif = false` par écriture directe, constater le refus et l'absence
    d'écriture en base, avec un contrôle positif que le rattachement vers une antenne active
    réussit dans le même test.

---

## 9. Pièges connus, tirés du registre de la 1c

1. **Vérifier depuis chaque rôle.** D22 est un amendement récent : le modérateur gère
   maintenant le calendrier, pas seulement les séances. Tout écran de cette phase doit être
   éprouvé par un compte modérateur réel, pas seulement par un administrateur qui masquerait
   un défaut de garde derrière ses propres droits plus larges.
2. **Une étiquette ou un commentaire qui promet plus que le code ne tient.** Le commentaire du
   déclencheur de complétude ne doit affirmer que ce qu'il vérifie réellement — deux marqueurs
   distincts, pas un seul déguisé en généralité.
3. **Un test plus faible que son nom.** Une assertion négative (« aucune séance dupliquée »)
   qui n'a pas d'abord prouvé qu'une séance a bien été créée reste verte en regardant du vide
   — voir preuve n°4 ci-dessus.
4. **Une erreur non vérifiée qui échoue en silence.** L'`upsert` de génération et celui du
   pointage doivent tous deux vérifier `error`, sur le modèle de `listerMembres` : un échec ne
   doit jamais être indiscernable d'un résultat vide ou d'un pointage réussi.
5. **Le compte racine n'a pas de fiche membre.** Il ne doit apparaître dans aucune liste de
   pointage ni aucun calendrier — non par filtrage explicite, mais parce que toutes ces vues
   partent de `membres`, comme le reste de l'application (§3.2 de la spec maîtresse).
6. **Un aller-retour qui ne referme pas ce qu'il a ouvert.** D49 rend l'état d'une séance
   réversible : un modérateur peut annuler un passage à `tenue` fait par erreur. Le
   déclencheur de complétude (D37) ne doit vérifier la présence du thème et de l'enseignant
   **que** lorsque `new.etat = 'tenue'` — jamais sur le sens retour, sous peine de bloquer une
   correction légitime. Le compteur, recalculé à chaque lecture par la vue et non stocké
   (§4.5), doit refléter fidèlement un aller-retour répété (`tenue` → `prevue` → `tenue`) sans
   double compte ni perte. C'est le même genre de défaut que la revue finale de la 1c a trouvé
   sur l'archivage : un sens surveillé, l'autre pas — ici, la surveillance est volontairement
   asymétrique (D49), et c'est cette asymétrie précise qu'il faut prouver, pas supposer.
7. **Une seule base pour le développement et la production.** Les preuves par mutation du §8
   retirent temporairement de vraies contraintes et de vrais déclencheurs sur le projet
   Supabase unique. Comme en 1c : vérifier l'état avant, restaurer immédiatement après,
   comparer la définition restaurée à l'originale (`pg_get_triggerdef`,
   `pg_get_constraintdef`), et ne jamais laisser une mutation active au-delà d'une seule
   exécution de test. Si l'application porte de vraies données au moment de cette phase, la
   méthode devra être revue — la 1c l'avait déjà signalé pour son propre cas.
8. **Suites de bout en bout sérialisées.** `workers: 1` est en vigueur depuis la 1c, faute
   d'isolement entre les tests et un unique serveur de développement partagé. Le nouveau
   fichier de tests e2e de cette phase (pointage, génération) hérite de cette contrainte ; ne
   pas tenter de le paralléliser séparément.
9. **Le nettoyage des comptes de test reste fragile.** Trois occurrences en 1c, dont un
   `deleteUser` dont l'erreur n'était pas vérifiée. Cette phase ne crée pas de nouveau compte
   de test si elle peut réutiliser ceux déjà établis par les suites de 1c ; si elle en crée,
   vérifier le nettoyage par un comptage indépendant, pas par confiance dans le rapport.
10. **Un chemin d'écriture non recensé.** La revue finale de la 1c a refait, module par
    module, la liste de tous les points d'entrée `'use server'` pour vérifier qu'aucun ne
    manquait de garde. `membres.antenne_id` est désormais modifiable par **deux** Server
    Actions distinctes (`modifierMembre`, admin seul ; `definirAntenneMembre`, modérateur et
    administrateur, §4.7) : toute revue de cette phase doit recenser les deux, pas seulement
    la nouvelle, pour vérifier qu'aucune n'a été oubliée ni élargie par erreur.

---

## 10. Ce que la phase ne livre pas

- **Aucune tâche planifiée, aucune génération automatique** — D28 l'exclut explicitement.
  Sans le geste du bouton, aucune séance n'apparaît, même l'horizon dépassé.
- **Aucun export ni tableau de bord statistique** des présences — hors périmètre du projet
  entier (§2 de la spec maîtresse), rien de spécifique à l'AEL ne le réintroduit ici.
- **Aucune fusion automatique de calendriers multi-antennes** en une seule séance générée
  (D41) — seule l'édition manuelle le permet.
- **Aucun journal des présences** symétrique à `journal_statuts` (D45).
- **Aucune notification** liée à l'AEL (séance du jour, rappel) — hors périmètre général,
  et la file `notifications` existante n'est pas étendue par cette phase.
- **Aucun rattachement multi-sélection** sur l'écran d'antenne : « en masse » se traduit par un
  geste répété via `SelecteurMembre`, une écriture immédiate à chaque choix (D51), jamais par
  une case à cocher par ligne suivie d'un bouton « valider » unique.

---

## 11. À trancher

Aucun point ouvert. Les six points soulevés lors du premier passage de ce cadrage ont tous été
tranchés :

- les points 1 et 2 (membre archivé ou changeant d'antenne après avoir été pointé) par **D48** ;
- les points 3 et 4 (réversibilité de l'état d'une séance et sort des présences déjà pointées)
  par **D49** ;
- le point 5 (valeur de l'horizon glissant) par **D40**, retenue à 8 semaines ;
- le point 6 (limite du filtrage client) par la clause ajoutée à **D46**, une limite assumée
  sans seuil ni bascule.

Cette section est conservée, vide, plutôt que supprimée — sur le modèle du registre de la 1c :
un lecteur futur doit pouvoir constater qu'elle a été **vidée par des décisions explicites**,
pas simplement oubliée en cours de rédaction.

**Ajout du livrable « gestion des membres d'une antenne » (D50-D53).** N'y rouvre rien : les
quatre points que ce livrable posait — qui y accède, quel mécanisme, l'effet du détachement, la
tenue à l'échelle — sont chacun tranchés et justifiés à leur décision (D50 à D53). Le seul
point qui dépasse ce document est le report de D50 dans la matrice du §5.2 de la spécification
maîtresse, signalé comme tel à sa place plutôt que traité ici en douce.
