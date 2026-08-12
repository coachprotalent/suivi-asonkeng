# Phase 1c — arborescence, portée d'autorité et comptes

**Date :** 2026-08-12
**Statut :** design validé, prêt pour le plan d'implémentation
**Spécification maîtresse :** `2026-08-11-suivi-asonkeng-design.md` — ce document ne la
remplace pas. Il précise ce que la 1c livre, et enregistre les décisions prises pendant son
cadrage, dont **une qui amende la spécification maîtresse** (D18).

---

## 1. Objet

La phase 1a a livré le registre des membres, la 1b leurs statuts. Les colonnes
d'arborescence (`faiseur_de_disciple_id`, `dirigeant_id`, `dirigeant_force`) existent en base
depuis la 1a mais **aucune interface ne les alimente** et aucun code ne les lit : les deux
plans précédents les ont explicitement renvoyées ici.

La 1c les met en service, en tire la **portée d'autorité** du §5.1 de la spécification
maîtresse, et livre l'écran de gestion des comptes sans lequel cette portée resterait vide.

---

## 2. Décisions prises pendant ce cadrage

Elles prolongent le tableau du §2 de la spécification maîtresse et ne doivent pas être
rouvertes pendant l'implémentation sans validation.

| # | Décision | Justification |
|---|---|---|
| D17 | La 1c livre la portée d'autorité **et** l'écran des comptes, création et rôles compris | Une barrière de sécurité qu'aucun compte réel ne peut exercer ne peut pas être prouvée. Sans lien compte ↔ fiche, `peutModifier` serait livré vert et jamais éprouvé — le défaut le plus coûteux de la 1b (Task 10) |
| D18 | **L'équipe vise un millier de membres ou plus**, et non l'ordre de grandeur d'une équipe restreinte | Donnée fournie au cadrage. Elle **amende** l'hypothèse implicite de la spécification maîtresse, dont D15 justifie la CTE récursive par « l'échelle d'une équipe ». La liste d'adjacence reste le bon choix — c'est la *profondeur* du parcours qui compte, et elle reste faible —, mais le choix des sélecteurs et de l'annuaire change |
| D19 | La remontée des ancêtres est `security definer`, donc affranchie de la RLS | Sous RLS, une fiche archivée est invisible d'un non-administrateur : la remontée s'arrêterait sur un ancêtre archivé et **rétrécirait la portée d'autorité sans erreur ni trace**. L'autorité suit l'arbre, pas la visibilité |
| D20 | La filiation (faiseur de disciple, dirigeant) est visible de **tout compte actif** ; seule sa modification est réservée aux administrateurs | Cohérent avec D2, qui ouvre déjà l'annuaire à tous. Un régime de visibilité distinct pour cette seule donnée coûterait une seconde politique RLS à prouver, pour protéger une information déductible en remontant les fiches une à une |
| D21 | La réinitialisation de mot de passe par l'administrateur entre en 1c, ainsi que la mise à l'échelle de l'annuaire | Conséquences directes de D17 et D18 : livrer des comptes utilisables sans réinitialisation rend un mot de passe oublié définitif ; afficher mille membres d'un bloc rend l'annuaire inutilisable |

**Reste en phase 2, volontairement :** tokens d'inscription, demandes de suivi, notifications.

---

## 3. Périmètre livré

1. **Arborescence éditable** — faiseur de disciple et dirigeant sur la fiche, réservés aux
   administrateurs, avec sélecteur à recherche côté serveur.
2. **Garde-fou anti-cycle** — passerelle sérialisée et déclencheur, avec affichage du chemin
   fautif (§7 de la spécification maîtresse).
3. **Dirigeant proposé** — règle `dirigeant_propose` du §4.2, drapeau `dirigeant_force`,
   mention « calculé » / « défini manuellement », retour au calcul en un clic.
4. **Archivage bloqué** — un faiseur de disciple qui a encore des disciples actifs ne peut pas
   être archivé ; la liste des personnes concernées est affichée.
5. **Portée d'autorité** — `peutModifier`, branchée sur la modification des statuts.
6. **Écran des comptes** — créer un compte, lier et délier une fiche, activer et désactiver,
   attribuer les rôles, réinitialiser un mot de passe ; protection du dernier administrateur.
7. **Annuaire à l'échelle** — pagination serveur.

---

## 4. Modèle de données

Aucune colonne nouvelle : la 1a les a toutes posées. Toutes les migrations sont **additives**,
comme l'exige le projet — un seul projet Supabase sert au développement et à la production.

### 4.1 Anti-cycle, et le trou de concurrence

Un déclencheur seul **ne suffit pas**, et c'est exactement le défaut que la revue de la Task 2
de la 1b avait trouvé sur l'exclusivité des statuts. Deux administrateurs qui réassignent en
même temps — A place X sous Y pendant que B place Y sous X — voient chacun un arbre sans
cycle et valident tous les deux. Le cycle naît de leur conjonction, après coup.

Deux barrières, comme en 1b :

- **`public.definir_arbre(p_membre_id, p_faiseur_de_disciple_id, p_dirigeant_id,
  p_dirigeant_force)`** — `security definer`, `execute` réservé à `service_role`. Sa
  **première instruction** est un `pg_advisory_xact_lock` sur une clé constante « arbre ».
  Les modifications d'arbre sont rares et réservées aux administrateurs : les sérialiser
  globalement ne coûte rien et supprime la classe entière de ce défaut.
- **`before insert or update of faiseur_de_disciple_id on membres`** — refuse toute violation
  directe de la table, y compris hors passerelle.

Les deux s'appuient sur `prive.est_ancetre(candidat, membre)`, CTE récursive remontant
`faiseur_de_disciple_id`. Un membre ne peut prendre pour faiseur de disciple quelqu'un dont il
est lui-même un ancêtre.

L'erreur porte un **marqueur stable** `using detail = 'cycle_faiseur_de_disciple'`.
L'application discrimine dessus, jamais sur la prose française du message — règle héritée de
la 1b.

### 4.2 Archivage d'un faiseur de disciple

Déclencheur `before update of etat on membres` : refuse le passage à `archive` tant que le
membre a des disciples à l'état `actif`, avec le marqueur `'disciples_a_reaffecter'`. La
vérification est faite **aussi** en amont, dans la Server Action, pour afficher la liste
nommée des disciples concernés — le déclencheur protège, le contrôle amont explique.

### 4.3 Remontée des ancêtres

Deux fonctions distinctes, pour n'exposer que le nécessaire :

- **`public.ancetres_membre(p_membre_id uuid) returns table(membre_id uuid, profondeur int)`**
  — identifiants seuls, `security definer` (D19), pour la décision d'autorité.
- **`public.chemin_arbre(p_membre_id uuid)`** — chemin avec les noms, réservé aux
  administrateurs, pour afficher le chemin fautif d'un cycle.

Les deux portent une **borne de profondeur** explicite. Un cycle ne peut pas exister si les
barrières tiennent, mais une fonction de parcours qui n'a pas de borne transforme une donnée
corrompue en boucle infinie, donc en indisponibilité totale.

---

## 5. Couche domaine — `src/lib/domaine/arbre.ts`

Fonctions **pures**, sans accès à la base, testables au Vitest comme l'annonce le §8 de la
spécification maîtresse :

- `dirigeantPropose(chaine)` — la règle du §4.2 : pas de faiseur de disciple → `null` ; un
  faiseur de disciple racine → lui-même ; sinon le faiseur de disciple du faiseur de disciple.
- `peutModifier({ membreLieId, estAdmin }, { membreId, ancetres, dirigeantId })` — vrai si
  l'appelant est administrateur, ou si son membre lié figure parmi les ancêtres de la cible,
  ou s'il en est le `dirigeant_id`.

Un compte **sans membre lié** (le compte racine, D11) n'a par construction aucune portée
d'autorité : il n'agit qu'en tant qu'administrateur. Ce cas doit être testé explicitement,
sans quoi un `null` comparé à un `null` donnerait autorité sur toutes les fiches sans faiseur
de disciple.

---

## 6. Écrans

| Écran | Changement |
|---|---|
| `/membres/[id]/modifier` | faiseur de disciple et dirigeant, sélecteur à recherche serveur ; dirigeant proposé à chaque changement de faiseur de disciple |
| `/membres/[id]` | filiation visible de tout compte actif (D20) ; liste des disciples |
| `/membres/[id]/statuts` | garde élargi : administrateur **ou** portée d'autorité |
| `/membres` | pagination serveur |
| `/comptes` | **nouveau**, réservé aux administrateurs |

### 6.1 Sélecteur de membre

À l'échelle de D18, un `<select>` de mille entrées n'est pas praticable — ni à l'usage, ni en
poids de page. Composant client dédié : saisie, recherche côté serveur, liste de résultats
bornée, valeur retenue portée par un champ caché. Il réutilise la recherche déjà écrite dans
`listerMembres`, avec son échappement PostgREST — lequel a déjà coûté un défaut en 1a et ne
doit pas être réécrit une seconde fois.

Le libellé de chaque champ suit la règle d'association posée pendant le nettoyage
d'accessibilité : un texte d'aide ne vit **jamais** dans le `<label>`.

### 6.2 Annuaire à l'échelle

Pagination serveur par `range()`, avec le nombre total, en conservant la recherche et le
filtre par antenne existants.

**Pas d'index de recherche pour l'instant, et c'est délibéré** : la recherche emploie
`ilike '%terme%'`, dont le joker initial rend un index B-tree inutile. Un index trigramme
serait la réponse, mais à quelques milliers de lignes le parcours séquentiel reste très
rapide : le problème réel est le poids de la page et non la requête. On pagine, et l'index
attendra d'être justifié par une mesure — pas par une intuition.

### 6.3 Écran des comptes

Un tableau des comptes, et pour chacun : lier ou délier une fiche membre (sélecteur du §6.1),
activer ou désactiver, attribuer ou retirer `moderateur` et `administrateur`, réinitialiser le
mot de passe. Plus la création d'un compte : identifiant, nom d'affichage, mot de passe
temporaire.

**Mot de passe temporaire affiché une seule fois**, à transmettre de vive voix (§5.4), avec
`doit_changer_mdp` positionné dans `app_metadata`. Le parcours forcé qui en découle existe
depuis la phase 0 : cette phase n'invente rien, elle branche.

---

## 7. Sécurité

**Un point d'entrée de plus, et un seul** : `exigerAutoriteSur(membreId)` dans
`src/lib/securite/garde.ts`, à côté de `exigerProfilActif` et `exigerAdministrateur`. Aucune
vérification d'autorité dispersée ailleurs dans le code — c'est la discipline qui tient depuis
la phase 1a.

**Protection du dernier administrateur** (§7 de la spécification maîtresse) : refus de retirer
le rôle `administrateur` au dernier administrateur actif, et refus de désactiver son compte.
La vérification s'exécute sous un **verrou consultatif de clé distincte** de celle de l'arbre —
même mécanisme, invariant différent : partager la clé ferait attendre des opérations qui
n'ont rien à voir entre elles, sans rien protéger de plus. Sans ce verrou, deux
administrateurs se rétrogradant simultanément passent tous les deux le contrôle et
l'application devient définitivement ingérable — même famille de défaut qu'au §4.1, et il
serait incohérent de s'en protéger d'un côté et pas de l'autre.

**Aucune écriture depuis le navigateur**, comme dans tout le projet : les créations,
liaisons, changements de rôle et modifications d'arbre passent exclusivement par des Server
Actions. Côté base, la RLS ne concède que des `SELECT`.

---

## 8. Tests et preuves exigées

**Vitest** — `dirigeantPropose` (chaîne profonde, faiseur de disciple racine, aucun faiseur de
disciple), `peutModifier` (ancêtre direct, ancêtre lointain, dirigeant forcé hors arbre, aucun
lien, compte sans membre lié). Les cas nommés au §8 de la spécification maîtresse.

**RLS** — visibilité de la filiation, refus d'écriture directe sur `membres`, `profils` et
`roles_profil`, et `revoke execute` sur les passerelles, chacun avec son **contrôle positif** :
un refus dont on n'a pas prouvé que le chemin fonctionne par ailleurs ne prouve rien.

**Playwright** — la portée d'autorité doit être éprouvée par un **vrai compte
non-administrateur lié à une fiche**, qui réussit sur un membre de sa portée et échoue sur un
membre hors de sa portée, par **requête forgée**, avec vérification **en base** de l'absence
d'écriture, et le **canari** qui distingue « la sécurité a changé » de « le mécanisme de test
a cassé ». La leçon la plus chère de la 1b est qu'un test d'interface vérifiant l'absence d'un
bouton ne prouve rien sur la barrière serveur.

**Preuve par mutation exigée** sur : le déclencheur anti-cycle, le verrou consultatif,
`exigerAutoriteSur`, le déclencheur d'archivage et la protection du dernier administrateur.
En 1b, la mutation a trouvé trois défauts qu'aucune revue de code n'avait vus — tous verts et
rassurants.

---

## 9. Pièges connus, à porter dans le plan

1. **Un correctif qui fabrique sa réciproque.** Deux fois en 1b, supprimer une erreur bruyante
   a rendu silencieux un cas légitime qui empruntait le même chemin. Toute correction qui
   supprime une erreur doit être relue en cherchant qui d'autre passait par là.
2. **Vérifier depuis chaque rôle.** Un écran à visibilité différenciée vérifié depuis le seul
   administrateur cache ses défauts au public même auquel il s'adresse. La 1c en compte
   plusieurs.
3. **Le compte racine n'a pas de membre lié.** Il traverse tout le code d'autorité avec
   `membre_id` à `null`. Chaque fonction doit le traiter explicitement.
4. **`dirigeant_force` n'interdit rien.** C'est un drapeau informatif. Le lire comme une
   autorisation serait un contresens.
5. **La borne de profondeur des parcours récursifs** n'est pas décorative : elle est la seule
   protection restante si une donnée corrompue franchissait un jour les barrières.
