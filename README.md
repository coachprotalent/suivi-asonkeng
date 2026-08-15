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
| `npm run test:e2e` | Parcours de bout en bout (Playwright), contre `npm run dev`, port 3000 |
| `npm run test:e2e:prod` | Parcours contre un **build de production** (`next build` + `next start -p 3100`) |
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
> arrêter un code fautif : lancez les six suites localement avant de pousser —
> **plus `npm run test:e2e:prod`**, qui n'appartient à aucune des six et qui est
> pourtant la seule preuve s'exécutant contre un build de production (voir
> « Le message d'erreur perdu en production » ci-dessous).

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
données : rien à ajouter sur ce point pour elles. **Même défaut dans la phase 3** :
`20260817100000_calendriers_ael.sql` insère trois créneaux (mardi, mercredi, samedi) pour chaque
antenne **active** au moment de son application, sans vérifier leur présence. Une restauration qui
la rejouerait sur une base où ces créneaux existent déjà échouera sur
`calendriers_ael_creneau_unique` — la contrainte porte sur `(antenne_id, jour_semaine, heure)` en
`nulls not distinct`, donc les créneaux amorcés, qui n'ont pas d'heure, en relèvent bien. Échec
bruyant, comme pour les antennes et les statuts, et non doublon silencieux.

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

**Cette limitation a longtemps eu une seconde conséquence, invisible et bien plus coûteuse pour un
utilisateur réel, et elle est corrigée** (migration `20260815270000`). Quand une inscription
échouait après la création du compte, `compenserInscription` supprimait la fiche, puis le compte,
puis relâchait le token. Mais la garde de `relacher_token_inscription` (`and utilise_par_profil_id
is null`) ne laissait passer la relâche que si la colonne était repassée à NULL — ce qui n'arrive
que par la cascade du `deleteUser`. **Si `deleteUser` échouait, le token était perdu à jamais pour
son destinataire**, sans erreur et sans trace, la fonction rendant `void`. La fonction rend
désormais un **booléen** (une relâche sans effet est journalisée) et sa garde nomme le compte
compensé : elle interdit toujours de dé-consommer le token d'un AUTRE compte, mais autorise celui
qu'on est en train de compenser. Éprouvé par injection de faute (`deleteUser` simulé en échec, le
compte survit, le token redevient consommable) et par un test RLS committé.

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

**Le design de la phase 3 supposait `calendriers_ael` déjà amorcée par une phase
antérieure ; elle ne l'était pas dans ce dépôt.** Vérifié par recherche sur
`supabase/migrations/` avant d'écrire le plan de la phase 3 (aucune occurrence de
« calendrier »), et confirmé par le §1 du design de cette même phase, qui le dit
explicitement — en contradiction avec son propre §4.1. La migration
`20260817100000_calendriers_ael.sql` comble l'écart avec le contenu déjà fixé par le §4.5
de la spécification maîtresse, sans rouvrir aucune décision de la phase 3.

**Supprimer un membre qui est l'enseignant d'une séance AEL déjà `tenue` échoue, malgré le
`on delete set null`.** La mise à null déclenche `seances_ael_tenue_complete`
(`20260817120000_seances_ael_completude.sql`), qui refuse toute séance à l'état résultant
`tenue` sans thème ni enseignant : la suppression du membre est donc rejetée avec le
marqueur `seance_sans_enseignant`. Ce n'est pas un défaut — l'application archive, elle ne
supprime jamais de membre —, mais la déclaration de la clé étrangère promet seule le
contraire. Conséquence pratique pour toute suite de tests : **supprimer les séances avant
leurs membres**, jamais l'inverse. Le modérateur d'une séance (`moderateur_membre_id`)
n'est surveillé par aucun déclencheur : là, `on delete set null` fait exactement ce qu'il
dit.

### Le message d'erreur perdu en production, et ce qu'il reste d'exposé

**Découverte de la phase 2b, confirmée par l'observation et non par le raisonnement,
et elle déborde largement cette phase.** Une exception LEVÉE (`throw`) depuis une
Server Action, puis interceptée dans un composant client par `useTransition` +
`try`/`catch`, **perd son message en production**. Ce n'est pas un texte générique
de l'application qui s'y substitue : c'est **React** qui remplace l'`Error` par un
digest interne **avant** que le `catch` du composant ne la voie. `erreur.message`
vaut alors littéralement :

```
Minified React error #441; visit https://react.dev/errors/441 for the full message...
```

— une chaîne technique **anglaise** renvoyant vers un site externe, affichée à un
utilisateur francophone. Même scénario, même clic, même composant :
`npm run dev` affichait « Cette fiche est déjà rattachée à un autre compte. », le
build de production affichait le digest. **La garde, elle, tient toujours** :
l'écriture est bien refusée, seul le message est perdu.

**Pourquoi personne ne l'avait vu : la suite e2e tourne contre `npm run dev`.**
Aucun test du projet ne s'exécutait contre un build de production — cette classe
entière de défauts lui était invisible par construction, et deux tests certifiaient
même le TEXTE EXACT de messages que la production ne montre pas. D'où
`tests/e2e-prod/` et `npm run test:e2e:prod` (build réel, servi sur le port 3100
pour ne pas percuter la suite de développement, qui occupe le 3000).

**Corrigé sur le périmètre de la phase 2b** : `src/app/demandes/actions.ts`,
`src/app/tokens/actions.ts` et `src/app/notifications/actions.ts` **retournent**
désormais leur refus métier (`{ erreur }`) au lieu de le lever ; les composants
lisent la valeur retournée. `redirect()` continue de traverser — Next.js la
reconnaît spécifiquement et ne la fait jamais passer par ce mécanisme.

**CE QUI RESTE EXPOSÉ, ET QU'UN ADMINISTRATEUR VERRA AU PREMIER DÉPLOIEMENT.**
Cinq fichiers antérieurs à la phase 2b portent encore 17 `throw`, et ils ne
relèvent pas tous du même piège :

| Fichier | `throw` | Nature |
|---|---|---|
| `src/app/comptes/actions.ts` | **12** | **Le même défaut C1**, réellement exposé |
| `src/app/membres/actions.ts` | 1 | Piège distinct (ci-dessous) |
| `src/app/membres/[id]/statuts/actions.ts` | 2 | Piège distinct |
| `src/app/statuts/actions.ts` | 1 | Piège distinct |
| `src/app/antennes/actions.ts` | 1 | Piège distinct |

`comptes/actions.ts` est **le seul** à porter exactement le motif vulnérable : ses
douze `throw` se répartissent entre `lierFiche` (5), `definirRoles` (4) et
`basculerActivation` (3), et `src/app/comptes/ligne-compte.tsx` appelle ces trois
actions depuis un `useTransition` avec `catch` + `setErreur(erreur.message)`. **Sur
`/comptes`, en production, un administrateur qui déclenche un de ces refus lira
`Minified React error #441` à la place du motif.** Ce n'est pas une régression de la
phase 2b : le défaut y est présent depuis l'écriture de ce fichier, en phase 1c. La
correction est une remédiation à part entière, laissée à une décision explicite —
elle est **connue, mesurée, et non faite**.

Les quatre autres relèvent d'un **piège distinct, plus ancien et moins grave à
l'écran** : leurs actions sont liées à un `<form action={…}>` **nu** (vérifié :
`antennes/page.tsx`, `membres/[id]/page.tsx`, `membres/[id]/statuts/page.tsx`).
Une exception y part dans `src/app/error.tsx`, qui affiche un texte **statique** et
ne lit jamais `error.message` — l'utilisateur voit un refus générique plutôt qu'un
digest anglais avec lien externe. Leurs refus métier NOMMÉS, eux, passent par
`redirect()` et un paramètre d'URL, et atteignent bien l'écran.

**Règle à retenir pour tout nouveau code** : une Server Action **retourne** son
refus métier ; elle ne le lève pas. Un `throw` reste acceptable pour une panne
technique dont aucun texte n'aiderait l'utilisateur — mais jamais pour un message
qu'on veut lui montrer.

### Les champs effacés : React vide un formulaire non contrôlé même quand l'action REFUSE

**Découverte de la phase 4, à l'exécution, et elle déborde très largement cette phase — le
défaut est DÉPLOYÉ AUJOURD'HUI, y compris sur le seul écran public de l'application.**
C'est le frère jumeau de la section précédente : là, un message n'atteignait pas
l'utilisateur ; ici, c'est **sa saisie** qui disparaît.

Une action liée à un `<form action={…}>` fait **remonter le formulaire** — React
réinitialise les champs **non contrôlés** dès que l'action se termine **sans lever**. Y
compris quand elle **retourne un refus métier**. L'utilisateur dont la saisie est refusée
lit son message d'erreur au-dessus d'un formulaire **vide**, et doit tout retaper.

**Ce qui rend ce piège particulièrement perfide : c'est LA BONNE PRATIQUE DU PROJET QUI LE
DÉCLENCHE.** La règle de la section précédente — « une action **retourne** son refus, elle
ne le lève pas », posée pour que le message survive au build de production — est exactement
ce qui fait passer l'action par le chemin « complétion normale », donc par la remise à zéro.
Une action qui **lève** ne vide rien : elle part dans la limite d'erreur. Corriger le premier
défaut a créé le second, et aucun brief, aucune conception, aucune revue ne l'avait vu.

**Cartographie, vérifiée fichier par fichier contre le code** (balayage des composants
portant un `<form action={…}>` et comptage des champs porteurs d'un `name` sans `value={…}`
ni `checked={…}`) — **quatorze** composants atteints, sur trente-quatre qui portent un
`<form action>` :

| Gravité | Composant | Champs libres |
|---|---|---|
| ~~**CRITIQUE**~~ **CORRIGÉ (phase 5)** | `inscription/formulaire-inscription.tsx` — **écran PUBLIC**, aucun rattrapage | ~~**8**~~ 0 |
| ~~**CRITIQUE**~~ **CORRIGÉ (phase 5)** | `membres/formulaire-membre.tsx` | ~~**9**~~ 0 |
| **CRITIQUE** | `demandes/nouvelle/page.tsx` | 4 |
| Élevé | `statuts/formulaire-catalogue.tsx` | 4 |
| Élevé | `membres/[id]/statuts/formulaire-statut.tsx` (note de 500 caractères) | 3 |
| Élevé | `ael/calendriers/formulaire-calendrier.tsx` | 3 |
| Élevé | `ael/seances/formulaire-seance-manuelle.tsx` | 2 |
| Élevé | `ael/seances/[id]/formulaire-seance.tsx` | 2 |
| Moyen | `antennes/formulaire-antenne.tsx` | 2 |
| Moyen | `changer-mot-de-passe/page.tsx` | 2 |
| Moyen | `comptes/formulaire-compte.tsx` | 2 |
| Moyen | `connexion/formulaire-connexion.tsx` | 2 |
| Faible | `tokens/formulaire-generation.tsx` | 1 |
| Faible | `membres/[id]/statuts/page.tsx` (motif de retrait) | 1 |

**Le pire cas est le premier, et il est en production** : une personne saisit son identité,
son contact et son antenne, se trompe de code d'inscription, **et perd les huit champs**.
Elle n'a par ailleurs aucun moyen de comprendre son erreur — le §7 impose à cet écran un
message indifférencié.

**La dernière ligne du tableau ne figurait pas au relevé d'origine**, qui en comptait treize :
`membres/[id]/statuts/page.tsx` porte un `<form action={retirerStatut}>` avec un motif libre
de 500 caractères. Sa gravité est faible — au succès, la ligne disparaît de toute façon —
mais son omission est le motif « balayage à moitié », une fois de plus.

**Deux composants ont été soupçonnés à tort, et pour une raison qu'il faut connaître.**
`comptes/ligne-compte.tsx` porte bien deux cases non contrôlées, mais dans un
`<form onSubmit={…}>` et non `<form action={…}>` : **le mécanisme ne s'y applique pas.**
`membres/[id]/arbre/formulaire-arbre.tsx` et `antennes/[id]/formulaire-rattachement.tsx`
emploient `SelecteurMembre`, **déjà contrôlé** — le bon motif existait déjà dans le dépôt
avant qu'on nomme le défaut.

**Remède, éprouvé sur les cinq formulaires de la phase 4** : rendre les champs **contrôlés**
(`value={…}` + `onChange`). Quand une remise à zéro **au succès** est voulue (formulaire de
création qui doit se vider), elle se garde par un `useRef` :

```tsx
const enCoursPrecedent = useRef(enCours)
useEffect(() => {
  if (enCoursPrecedent.current && !enCours && etat.erreur === null) {
    // vider ici : une VRAIE soumission vient de réussir
  }
  enCoursPrecedent.current = enCours
}, [enCours, etat])
```

**Pourquoi ce `useRef` ferme la course au montage PAR CONSTRUCTION, et ne la déplace pas** :
il est initialisé avec la valeur du **premier** rendu, nécessairement `false`. La passe de
montage ne peut donc jamais satisfaire `enCoursPrecedent.current && !enCours`, quel que soit
le timing. Tester `etat.erreur === null` seul ne suffirait pas : c'est aussi vrai de l'état
initial, et l'effet se déclencherait dès le montage.

**Statut : DEUX des quatorze corrigés en phase 5, douze restants, connus et mesurés.** La
phase 5 a corrigé le **cas public** — `inscription/formulaire-inscription.tsx`, que ce
tableau désigne comme prioritaire — **et** `membres/formulaire-membre.tsx`, le deuxième
pire cas, que la création enrichie rendait plus grave encore en lui ajoutant des champs.
**Les douze autres sont à traiter en phase 6 (refonte UI/UX)** — et non en phase 5, qui est
celle de la création enrichie et de l'arborescence (§9 de la spécification maîtresse,
amendement du 2026-08-15).

**Les deux corrigés portent la PREMIÈRE preuve de cette classe dans le projet** :
`tests/e2e-prod/creation-enrichie-production.spec.ts` remplit tous les champs, provoque un
refus, et vérifie que **chacun porte encore sa valeur** — contre un build de production
réel. Les douze restants n'en ont toujours aucune.

**Découverte de la phase 5, qui ÉLARGIT le défaut ci-dessus, MAIS SUR UN AXE INDÉPENDANT :
les `<select>` CONTRÔLÉS ne survivent PAS à la même remise à zéro, contrairement aux
`<input>` et aux `<textarea>` contrôlés.** Un `<select value={…} onChange={…}>` est
pourtant, en apparence, aussi contrôlé qu'un champ de saisie — mais React lui applique un
traitement différent à la remise à zéro native du formulaire (`HTMLFormElement.reset()`,
déclenchée par la même remontée « complétion normale sans lever » que ci-dessus) : la
valeur sélectionnée revient à la première option, alors que la valeur JavaScript de
l'état, elle, ne bouge pas — écran et état divergent. **Reproduit en développement ET en
production.**

**Ce second axe NE SE CHERCHE PAS dans le tableau des quatorze composants ci-dessus, et
c'est un piège en soi.** Ce tableau recense les composants à champs **NON contrôlés** — la
définition même qui **exclut par construction** tout composant dont le `<select>` est
contrôlé, y compris celui qui porte CE défaut-ci. Une première rédaction de cette section
avait justement commis cette erreur, en ordonnant de balayer « les composants qui restent »
de ce tableau — ce qui ne pouvait, par construction, jamais désigner le bon fichier. **Le
critère qui rend le bon résultat est distinct et se cherche à part** : un `<form action>`
qui contient un `<select>` **contrôlé** (`value=` + `onChange=`, jamais `defaultValue=`),
dont l'action peut **retourner** un refus métier, et dont le `<form>` ne porte **pas**
`onReset`. Appliqué à tout le dépôt, ce critère rend **exactement un** fichier :
`src/app/evenements/formulaire-evenement.tsx` — le `<form>` en `:81`, son unique `<select
name="typeId">` en `:99` — qui sert **deux écrans** (création et édition d'un évènement,
`src/app/evenements/page.tsx` et `src/app/evenements/[id]/page.tsx`). Corrigé en clôture de
phase 5, même remède que les deux formulaires ci-dessus :
`onReset={(evenement) => evenement.preventDefault()}` sur le `<form>`, sans danger puisque
tous ses champs sont déjà contrôlés. `membres/formulaire-membre.tsx` et
`inscription/formulaire-inscription.tsx` le portaient déjà depuis leur correction initiale
en phase 5 ; les trois seuls formulaires du dépôt à combiner `<select>` contrôlé et
`<form action>` le portent désormais tous.

**Rien — ni `lint` ni `test` — ne signalerait un `<form>` neuf qui ajoute un `<select>`
contrôlé sans `onReset` : aucune règle ESLint, aucun test unitaire ne vérifie cette
combinaison.** La diffusion de ce remède repose ENTIÈREMENT sur le critère écrit ici, relu
et rejoué à la main à chaque nouveau formulaire — pas sur un outil qui l'appliquerait pour
soi. **À porter à la phase 6 comme second axe de balayage, indépendant du premier**, sur
les douze composants restants du tableau ci-dessus ET sur tout `<select>` contrôlé qui
apparaîtrait ailleurs.

**`admin.auth.admin.listUsers()` n'est paginé que dans DEUX fichiers du dépôt.**
Vingt-six fichiers de test l'appellent, pour retrouver un compte de test par
identifiant, plus `scripts/creer-compte-racine.ts`, pour vérifier qu'aucun compte
d'authentification orphelin ne porte déjà l'email cible avant d'en créer un
nouveau. Deux seulement le parcourent jusqu'à épuisement —
`tests/e2e/ael-pointage.spec.ts` et `tests/e2e/ael-preuves.spec.ts`, corrigés par la
vague de correction finale de la phase 3. **Partout ailleurs, le défaut reste.**
L'API rend ses résultats par page (50 par défaut) ; au-delà de la première page, un
compte existant ne serait simplement pas trouvé, silencieusement. Sans conséquence
tant que le nombre de comptes réels et de comptes de test simultanés reste sous ce
seuil — à revoir si la base de comptes grossit. (Cette phrase disait « n'est pas
paginé **partout** où le projet l'emploie », ce qui était devenu faux ; c'est
exactement le motif dominant du projet, une documentation qui décrit un état que le
code a quitté.)

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
  d'afficher un écran qui se contredit lui-même. Le tri de cette pagination est **total**
  (`nom`, `prenom`, puis `id`) : voir « Trois remèdes différents à la même troncature
  silencieuse » plus bas pour pourquoi les deux premiers critères ne suffisaient pas.

## Phase 2b : tokens d'inscription, inscription publique, demandes de suivi, notifications

La phase 2b ouvre l'application au-delà des comptes créés par un administrateur :

- **Tokens d'inscription** (`/tokens`, réservé aux administrateurs) — génération d'un
  token nominatif (rattaché à une fiche existante via le sélecteur de membre) ou
  générique, avec une validité proposée à 7 jours et modifiable ; le code en clair
  s'affiche **une seule fois**, immédiatement après la génération, jamais stocké tel
  quel (seul son hachage SHA-256 l'est). Liste de tous les tokens avec leur état ;
  révocation d'un token **non encore consommé et non déjà révoqué** — `revoquerToken`
  ne teste QUE `revoque_le` et `utilise_le`, jamais l'expiration : un token affiché
  « Expiré » garde donc son bouton « Révoquer » et la révocation aboutit. Sans
  conséquence (un token expiré est déjà refusé à la consommation), mais l'écran
  suggère une distinction que le code ne fait pas.
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
  projet **dotée d'une politique de lecture** où « administrateur » n'élargit rien.
  (`tentatives_token_inscription` ne l'élargit pas davantage, mais pour une tout
  autre raison : elle n'a AUCUNE politique et aucun `grant select`, elle est fermée
  à tout le monde, administrateur compris.) Une notification dont l'objet vient
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

**`/inscription` est rendue DYNAMIQUEMENT, à chaque requête** — comme toutes les
routes du projet, depuis que la cloche de notifications est montée dans le layout
racine (elle appelle `cookies()`). Constaté par construction réelle : `next build`
classe la totalité des routes en `ƒ (Dynamic)` (24 au moment de la phase 3, contre 20
avant elle — la phase 3 en a ajouté 4), et retirer `<Cloche />` du layout suffit à
reclasser `/inscription` en `○ (Static)`. Conséquence à connaître avant d'ouvrir la
porte : **chaque GET anonyme sur cette page exécute une lecture en base avec la clé
de service** (`listerAntennesPubliques`). C'est modeste — quatre colonnes d'une
petite table — et la contrepartie est réelle (la liste des antennes est toujours
fraîche), mais c'est un levier d'amplification ouvert, sur la seule page publique.
Le `export const revalidate = 300` qui prétendait le fermer a été retiré : il était
inerte depuis que la cloche existe.

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

Toute page et toute Server Action **qui lit ou écrit des données** passe par `exigerProfilActif`,
`exigerAdministrateur`, `exigerAutoriteSur` ou `exigerModerateurOuAdministrateur`
(`src/lib/securite/garde.ts`) — c'est l'unique famille de points d'entrée qui vérifie la session
et, le cas échéant, le rôle ou la position dans l'arbre. `exigerModerateurOuAdministrateur`
(phase 3) réserve au modérateur et à l'administrateur le calendrier AEL, la génération et la
tenue des séances, le pointage, et le rattachement d'un membre à une antenne (D22, D42, D50) :
une autorisation PAR RÔLE, distincte de `exigerAutoriteSur`, qui répond à une question
différente (la position dans l'arbre des faiseurs de disciple).

**Les exceptions, recensées contre le code et non contre l'intention** (les deux affirmations qui
tenaient ici la place de cette liste — « aucun appel direct à `profilCourant` ailleurs » et
« exception unique » — étaient devenues fausses ; corrigées d'après un audit des `page.tsx` et
des fichiers `'use server'` du dépôt, et de toutes les occurrences de `profilCourant`. L'audit
original (phase 2b) portait sur 18 `page.tsx` et 14 fichiers `'use server'` ; la phase 3 en a
ajouté 4 et 5 respectivement, tous vérifiés directement — 22 `page.tsx` et 19 fichiers
`'use server'` au total à ce jour, sans changer la liste des exceptions ci-dessous) :

- **`profilCourant` est appelé directement à UN seul endroit hors de `garde.ts`** :
  `src/app/notifications/cloche.tsx`. C'est délibéré et justifié sur place — la cloche est montée
  par le layout racine, donc rendue aussi sur `/connexion` et `/inscription`, où exiger un profil
  provoquerait une redirection absurde. Elle ne rend rien sans session. C'est la **seconde**
  exception légitime à cette règle, et la seule autre.
- **`sInscrire`** (`src/app/inscription/actions.ts`) n'appelle aucun garde : `/inscription`
  s'affiche sans session, par construction, il n'existe littéralement aucun profil à exiger.
  Exception ajoutée par la phase 2b, détaillée plus bas.
- **Cinq `page.tsx` sur 22 n'appellent aucun garde**, et aucun n'expose de donnée :
  `src/app/page.tsx` (une seule instruction, `redirect('/tableau-de-bord')`),
  `/connexion` et `/changer-mot-de-passe` (antérieures ; la seconde est un composant client dont
  l'action vérifie elle-même la session et le drapeau `doit_changer_mdp`),
  `/demandes/nouvelle` (**ajoutée par la phase 2b** ; composant client pur, sans aucune lecture —
  sa protection réelle est le middleware plus le garde de `creerDemandeSuivi`), et `/inscription`
  (l'exception voulue).
- **Trois Server Actions appellent leur garde ailleurs qu'en première instruction**, chaque fois
  pour une raison écrite sur place : `changerMotDePasse` (qui vérifie la session par
  `auth.getUser()` puis redirige), `attribuerStatut` et `retirerStatut` (dont le garde
  `exigerAutoriteSur` DÉPEND du `membreId` lu dans le formulaire, donc ne peut pas le précéder ;
  rien avant ne touche la base). `seConnecter` et `seDeconnecter` n'en ont pas, par nature.
- **Deux Server Actions de la phase 3 appellent leur garde INDIRECTEMENT** (recensement corrigé
  par la vague de correction finale, qui les avait omises) : `remettrePrevue` et `annulerSeance`
  (`src/app/ael/seances/[id]/actions.ts`) délèguent toutes deux à `changerEtatSeance`, dont la
  PREMIÈRE instruction est `exigerModerateurOuAdministrateur()`. La garde s'exécute donc bien
  avant toute lecture ou écriture — mais elle n'est pas visible dans le corps des deux fonctions
  exportées, et c'est ce que ce recensement doit dire. Même motif pour
  `desactiverCalendrier` / `reactiverCalendrier` (`src/app/ael/calendriers/actions.ts`), qui
  portent chacune leur garde en première instruction ET dont le `basculerCalendrier` commun en
  porte désormais une seconde, redondante à dessein.

Voir « Exception ajoutée par la phase 2b : `/inscription` sans garde » plus bas pour ce sur quoi
repose sa fermeture, et le commentaire posé juste avant `exigerProfilActif` dans `garde.ts` pour
que cette exception ne soit jamais lue comme une régression future.
Depuis la phase 1c, la modification des statuts d'un membre n'est **plus réservée aux
administrateurs** : elle passe par `exigerAutoriteSur`, ouverte à tout compte ayant autorité sur
le membre visé (ancêtre dans l'arbre, ou dirigeant désigné), en plus des administrateurs. Aucune
écriture n'est possible depuis le navigateur : les créations, modifications, archivages,
bascules d'antenne, attributions et retraits de statuts, mouvements d'arbre et gestion des
comptes passent exclusivement par des Server Actions exécutées côté serveur, jamais par un appel
direct du client à Supabase. Côté base, les politiques RLS n'autorisent que des `SELECT` sur
toutes les tables : toute écriture transite par le serveur, qui agit avec la clé de service,
jamais exposée au navigateur.

## Phase 3 : l'AEL

La phase 3 remplace le suivi de présence actuel (spec §9) par un calendrier récurrent, une
génération idempotente des séances, leur tenue et le pointage des présences.

- **Gestion des membres d'une antenne** (`/antennes/[id]`, réservé au modérateur et à
  l'administrateur pour la gestion, ouvert en lecture à tout compte actif) — rattacher ou
  détacher un membre sans passer par sa fiche (D50-D53). Livrée **avant** le pointage :
  D29 tire la liste de pointage de ce même rattachement. Le détachement est strictement
  PROSPECTIF (D48, D52) : aucune présence ni aucun compteur déjà écrit n'en est affecté ;
  seules les listes de pointage pré-remplies de futures séances cessent de proposer le
  membre par défaut — il reste ajoutable à la main (D47). L'écran est atteignable depuis
  `/antennes` pour un administrateur, et depuis la section « Antennes » de `/ael/seances`
  pour tous les autres comptes actifs : `/antennes` reste réservé à l'administrateur,
  parce qu'il porte la création et la désactivation des antennes (spec §5.2).
- **Calendrier récurrent** (`/ael/calendriers`, réservé au modérateur et à l'administrateur,
  aucune consultation ouverte — D22) — créneaux par antenne (jour de semaine, heure
  optionnelle), ajout et désactivation. Un créneau est unique par
  `(antenne, jour, heure)`, heures nulles comprises
  (`calendriers_ael_creneau_unique`, `nulls not distinct`) : sans cette contrainte, un
  doublon ferait générer deux séances identiques à chaque occurrence, indistinguables et
  sans geste de suppression prévu. Un créneau ne peut pas être ajouté sur une antenne
  désactivée, la génération ignore les créneaux actifs des antennes désactivées, et
  **la création manuelle d'une séance refuse elle aussi une antenne désactivée** — les
  trois portes sont fermées, alors que la troisième est restée ouverte jusqu'à la vague
  de correction finale (rien en aval ne la rattrapait : la clé étrangère n'exige que
  l'existence de l'antenne, jamais son état).
- **Génération des séances** (`/ael/seances`, bouton « Générer les séances ») — geste
  explicite, jamais automatique (D28), sur un horizon glissant de 8 semaines
  (`HORIZON_GENERATION_SEMAINES`, D40). Idempotente par une contrainte unique
  (`seances_ael_generation_unique` sur `(calendrier_id, genere_pour_le)`, D38), pas par
  une vérification applicative : rejouer le geste ne crée jamais de doublon. La colonne
  additive `genere_pour_le`, distincte de `date` et jamais modifiée après la création,
  ancre cette unicité indépendamment d'un déplacement de séance (D39) — déplacer une
  séance du samedi au dimanche ne la fait pas recréer à sa date d'origine au prochain
  geste de génération.
- **Tenue d'une séance** (`/ael/seances/[id]`) — thème, enseignant, modérateur (chacun un
  membre de l'équipe ou un intervenant extérieur, exclusifs par une contrainte CHECK,
  D36) ; passage à `tenue` bloqué tant que le thème ou l'enseignant manquent, avec deux
  marqueurs d'erreur distincts nommant le champ fautif (D37). L'état reste RÉVERSIBLE
  ensuite (D49), **dans les deux sens et depuis les deux états terminaux apparents** : un
  modérateur peut ramener à `prevue` une séance marquée `tenue` par erreur **comme une
  séance annulée par erreur**, sans effacer le pointage déjà fait — le déclencheur de
  complétude ne surveille que la transition VERS `tenue`, jamais le sens retour. Ce
  second retour manquait à l'écran jusqu'à la vague de correction finale, et son absence
  était coûteuse : la génération ne recrée jamais une occurrence déjà générée (son
  `on conflict (calendrier_id, genere_pour_le) do nothing` la voit présente quel que soit
  son état), donc un clic de trop sur « Annuler la séance » détruisait l'occurrence
  définitivement. Les deux textes de confirmation le disent désormais.
- **Pointage** — liste complète des membres actifs des antennes ciblées, sans pagination
  (D29), avec un filtre client (D46) distinct du sélecteur à recherche serveur qui permet
  d'ajouter n'importe quel autre membre (D47). Écriture ligne à ligne : chaque case
  déclenche un `upsert` unitaire sur `(seance_id, membre_id)` (D43) — deux modérateurs
  pointant la même séance ne se marchent dessus que sur les membres qu'ils cochent tous
  les deux. Une présence pointée sur un membre absent de la liste courante (détaché de
  l'antenne, archivé, ou ajouté hors liste par D47) reste visible, dans un bloc distinct
  (« Présences hors de la liste courante ») plutôt que de disparaître : la RLS reste seule
  juge de ce qui s'affiche, l'écran dit honnêtement quand elle refuse une fiche
  (« Fiche non consultable (réf. XXXXXXXX) », les huit premiers caractères de
  l'identifiant technique) au lieu de la taire. La référence n'est pas décorative : sans
  elle, deux fiches masquées rendaient deux lignes STRICTEMENT identiques, chacune portant
  une case dont le décochage écrit réellement en base.
- **Compteur AEL** (vue `compteurs_ael`, affichée sur la fiche membre) — report initial +
  présences aux séances TENUES, rien d'autre (D4). Vue calculée, `security_invoker`, pas de
  colonne stockée : le total ne peut pas diverger de son historique, et il ne varie
  JAMAIS rétroactivement avec l'archivage ou un changement d'antenne du membre (D48) — un
  compte ordinaire interrogeant le compteur d'un membre archivé ne voit simplement aucune
  ligne, jamais un chiffre faux.

Aucun journal des présences symétrique à `journal_statuts` (D45) : `pointe_par` et
`pointe_le`, déjà sur `presences_ael`, donnent la traçabilité minimale. Aucune tâche
planifiée ni génération automatique (D28) ; aucune fusion automatique de calendriers
multi-antennes en une seule séance générée (D41) — seule l'édition manuelle le permet.

### Trois remèdes différents à la même troncature silencieuse, et pourquoi

PostgREST tronque **silencieusement** toute lecture non bornée au-delà de `max_rows`
(1000, `supabase/config.toml`). Ce dépôt s'en défend de trois façons, et le choix entre
elles se fait sur une seule question : **cette lecture est-elle CROISÉE avec une autre
pour décider d'une écriture ?**

1. **Parcours par lots jusqu'à épuisement** — `membresDesAntennesParLots`
   (`src/lib/donnees/membres-lots.ts`) et `presencesDeSeanceParLots`
   (`src/lib/donnees/presences-lots.ts`). Ces deux listes sont croisées l'une avec l'autre
   pour décider de l'état de chaque case de l'écran de pointage : un écart entre une liste
   complète et une liste tronquée s'y lirait comme « absent », et le geste normal d'un
   modérateur pour « corriger » une case qu'il croit vide ÉCRASERAIT une présence réelle
   avec `present: false`. Paginer y rend la troncature IMPOSSIBLE plutôt que seulement
   DÉTECTABLE.
2. **Échec bruyant** — `listerSeances`, `listerCalendriers` et `calendriersActifs`
   (`src/lib/donnees/ael.ts`) lisent sous un plafond de 999 et **lèvent** si le `count`
   exact le dépasse, plutôt que de rendre une liste tronquée comme complète. Aucune n'est
   croisée avec une autre lecture : un dépassement y est visible et sans risque de
   corruption. Voir « L'échéance de `listerSeances` » ci-dessous — le jour où cette levée
   se produira n'est pas lointain, et sa portée n'est pas celle qu'on croit.
3. **Parcours par lots dans une SUITE DE TESTS** — `tests/e2e/seances-lots.ts`, ajouté par
   la vague de correction finale de la phase 3, et **le plus conséquent des trois** : les
   deux premiers protègent d'un affichage faux, celui-ci protège la production d'une
   DESTRUCTION. Le garde-fou d'`ael-preuves.spec.ts` relit `seances_ael` avant et après la
   génération et supprime la différence ; les deux lectures étant croisées l'une avec
   l'autre, une empreinte tronquée aurait classé de VRAIES séances de production comme
   « créées par cette suite », donc à supprimer — et la garde bruyante ne les aurait pas
   arrêtées, une séance générée non tenue étant précisément `prevue` et non pointée. Le
   défaut de troncature, à l'intérieur du garde-fou lui-même.

Les tris de pagination des lectures paginées sont **totaux**, sans exception :
`membres-lots.ts` (`.order('id')`), `presences-lots.ts` (`membre_id` seul, unique à
`seance_id` fixé par la clé primaire composite), `seances-lots.ts` (`id`, clé primaire) et
`listerMembres` (`nom`, `prenom`, **puis `id`**). Sans ce dernier critère, deux homonymes
exacts à cheval sur une frontière de page peuvent être rendus deux fois ou jamais —
« jamais » étant la disparition silencieuse d'un membre de l'annuaire. Aucune
spécification SQL ne garantit l'ordre des ex æquo sans tri total, **même quand une
mutation sur deux lignes ne parvient pas à mettre le défaut en évidence** sur un plan
Postgres donné (résultat négatif consigné tel quel, ronde Q1-Q7 de la phase 3).

`compteurAel()` (`src/lib/domaine/ael.ts`), la fonction pure qui porte la formule du
compteur, n'est appelée par **aucun** code de production : la fiche membre passe par la
vue `compteurs_ael`, qui exécute la même formule côté SQL. Les deux portent la formule
identique (vérifié), mais aucune exécution croisée ne le garantit — seuls leurs tests
respectifs les exercent chacun de leur côté.

### La génération de séances touche de vraies données, en production

Rappel de la section « Attention » ci-dessus, avec une conséquence propre à la phase 3 :
`genererSeances` ne prend aucun paramètre de portée — elle parcourt **tous les
calendriers actifs réels** de la base, pas seulement ceux créés par une suite de tests.
Une suite qui appellerait ce geste sans précaution créerait donc de vraies séances de
production, sans préfixe ni marqueur qui les distingue des séances légitimes, hors de
portée de tout nettoyage par motif de nom. Le remède retenu dans la suite e2e de cette
phase est une **empreinte-et-delta** : relever l'ensemble des identifiants de
`seances_ael` avant le geste, le relever à nouveau après, ne supprimer que la différence,
sous une **garde bruyante** qui lève plutôt que suppose (elle refuse par exemple de
nettoyer une séance retrouvée qui ne serait plus `prevue` ou qui porterait déjà une
présence). Ce mécanisme a réellement servi : la dernière ronde de preuves de la phase
(Task 19, `tests/e2e/ael-preuves.spec.ts`) a généré puis nettoyé **72 séances** sur les
calendriers réels, vérifié par comptage à chaque exécution.

**L'empreinte est PERSISTÉE SUR DISQUE, pas seulement en mémoire**, et cette distinction
est opérationnelle. Tant qu'elle ne vivait qu'en mémoire, une suite tuée entre la première
génération et son `afterAll` laissait jusqu'à ~72 séances RÉELLES en production, que
l'exécution suivante intégrait à SA propre empreinte — donc ne supprimait jamais. Le
fichier `.ael-preuves-empreinte.json` (ignoré par git) porte désormais l'empreinte et
l'instant de début, et n'est effacé qu'après un nettoyage VÉRIFIÉ. Conséquences pour qui
lance les suites :

- dans les **24 heures**, une exécution interrompue est rattrapée automatiquement par la
  suivante, sous la même garde bruyante ;
- **au-delà, la suite REFUSE DE DÉMARRER** avec le message « Reprise refusée » plutôt que
  de supprimer sur la foi d'une empreinte vieille de plusieurs jours. Recevoir ce message
  en lançant `npm run test:e2e` n'est pas une panne : c'est le mécanisme qui demande une
  décision humaine. Le fichier est à examiner, puis à supprimer à la main.
- Limite dite dans le code : l'empreinte ne protège pas d'une interruption survenue AVANT
  son écriture — mais rien n'a alors été généré.

**Les suites RLS emploient un mécanisme DIFFÉRENT, et il fallait qu'il le soit.**
`tests/rls/ael.test.ts` ne génère rien : il insère ses séances lui-même, dont plusieurs
« nues » — sans antenne, sans calendrier, sans intervenant, donc sans aucun objet nommable
par lequel un balayage par préfixe pourrait les retrouver. Une empreinte-et-delta y serait
non seulement inutile mais DANGEREUSE : son filtre `calendrier_id !== null`, qui protège
les séances créées à la main en production, exclut exactement la forme de ces lignes-là.
Le remède est donc la colonne **`cree_par`**, que ces tests renseignent désormais avec le
profil de la suite : un marqueur écrit dans la MÊME instruction que la ligne qu'il désigne,
donc sans aucune fenêtre entre la création et son enregistrement. L'ordre du nettoyage en
fait partie — le balayage passe **avant** la suppression du compte de test, faute de quoi
`on delete set null` effacerait la seule prise sur les séances à retrouver.

### L'échéance de `listerSeances`, et pourquoi elle emporte plus que sa propre liste

`listerSeances` **lève** au-delà de 999 séances (voir « Trois remèdes » ci-dessus, cas 2).
L'arbitrage est bon et n'est pas rouvert ici ; ce qui suit est son **rayon de souffle**,
mesuré par la revue finale de branche et inscrit ici pour que l'échéance se corrige avant
d'arriver plutôt que de se découvrir.

**Le chiffre.** 3 antennes × 3 créneaux = 9 calendriers actifs (valeur réelle
d'aujourd'hui), soit environ **468 séances par an**. Le plafond est atteint vers
**2,1 ans** après la première génération — moitié moins si l'équipe double ses antennes,
ce que l'application encourage.

**La conséquence exacte.** `/ael/seances` appelle `listerSeances()` en PREMIÈRE position
de son `Promise.all` : la page part en erreur, entière. Or elle est le **seul lien entrant**
vers trois autres écrans, recensés sur tous les `href` du dépôt :

| Écran devenu injoignable | Seul lien entrant |
|---|---|
| `/ael/seances/[id]` — tenue **et pointage** | `/ael/seances` |
| `/ael/calendriers` | `/ael/seances` (et le bouton « Générer ») |
| `/antennes/[id]` pour un **modérateur** ou un compte simple | la section « Antennes » de `/ael/seances` |

Ce jour-là, **le pointage devient impossible et un modérateur ne peut plus rattacher un
membre à une antenne** — `/antennes` reste fermé par `exigerAdministrateur()`, et c'est
très bien ainsi. Toute la phase 3 s'éteint sur une seule lecture qui lève.

**L'interaction, qui est le vrai multiplicateur.** « `/antennes/[id]` joignable seulement
par `/ael/seances` » est un arbitrage volontaire et bon (il évite d'ouvrir aux modérateurs
la création et la désactivation des antennes). Couplé à la levée bruyante, il transforme
la panne d'UNE lecture en extinction du rattachement d'antenne pour les modérateurs. Les
deux moitiés sont justes séparément ; c'est leur produit qui ne l'est pas.

**Remède minimal le jour venu, sans changer l'arbitrage** : sortir `listerSeances()` du
`Promise.all` et rendre la section « Antennes » avant la liste des séances, de sorte que la
levée n'emporte que la liste. Ou borner l'écran par date, ce que la levée force à décider.

### Le cache CLIENT de Next, et la phrase qui promettait le contraire

`pointerPresence` n'appelle **pas** `revalidatePath` : chaque case cochée est dépêchée
séparément (D43), et un `revalidatePath` re-rendait la route courante dans la même
réponse — pointer N personnes coûtait N re-rendus complets d'un écran dimensionné pour
plus de mille membres.

**Ce que le premier raisonnement avait manqué, et qui est corrigé.** Il ne regardait que
le cache SERVEUR et concluait « il n'y a ici aucun rendu mis en cache à invalider ». C'était
faux. Le **cache CLIENT** existe — « An in-memory cache in the browser that stores RSC
Payload for visited and prefetched routes […] reused during browser back/forward
navigation » (doc Next du dépôt) — et `revalidatePath` l'invalidait. Sans lui, pointer,
revenir à la liste, puis appuyer sur **Précédent** rendait les cases ET le total à l'état
d'AVANT. Ce n'est pas une déduction : le test « retour arrière du navigateur »
(`tests/e2e/ael-pointage.spec.ts`) a d'abord ÉCHOUÉ contre cette version, puis passe contre
la suivante. La vérité survivait à un RECHARGEMENT, pas à un RETOUR ARRIÈRE.

**Le remède vit côté client** (`pointage.tsx`) : un `router.refresh()` **différé et
coalescent** — une minuterie unique de 3 s, réarmée à chaque bascule et annulée au
démontage. Une rafale de pointages ne coûte donc qu'UN re-rendu au lieu de N, et l'entrée
de cache de CET écran est purgée tant qu'il est encore la route courante. Le refresh est
différé et non posé au démontage à dessein : `router.refresh()` purge la route COURANTE, et
au démontage la route courante est déjà la NOUVELLE — ce serait la mauvaise entrée de cache.

**Ce qui n'est toujours pas couvert, et ne l'était pas davantage avant** : un second onglet
ouvert sur la même séance ne se met pas à jour tout seul ; son utilisateur doit recharger.

## Phase 4 : les évènements, les participants externes et leur conversion

La phase 4 livre le suivi des évènements (webinaires, séminaires académiques, pic-nics,
retraites spirituelles), le recueil des **trois désirs** exprimés par ceux qui y participent,
et la conversion d'un participant externe en membre de l'équipe.

**Quatre écrans nouveaux** :

- **`/evenements`** — liste paginée (25 par page), filtre par type, création par un
  modérateur ou un administrateur.
- **`/evenements/[id]`** — la fiche : modification de l'évènement, et la liste paginée des
  participants (50 par page). On y ajoute un membre de l'équipe par recherche
  (`SelecteurMembre`, réutilisé tel quel de la 1c) **ou** un participant externe créé à la
  volée, sans quitter l'écran.
- **`/evenements/a-traiter`** — les participants externes ayant exprimé un désir de suivi
  spirituel, ni convertis ni classés. **Une ligne par personne**, quel que soit le nombre
  d'évènements concernés. Consultable par un modérateur ; les deux gestes qui la vident sont
  réservés à l'administrateur.
- **`/evenements/types`** — le catalogue des types, réservé à l'administrateur. Les types se
  désactivent, ils ne se suppriment jamais : un évènement passé doit rester lisible avec son
  type (même régime que `statuts`, d'où le `on delete restrict`).

**Deux écrans déjà livrés changent** : `/demandes` accepte une troisième origine de demande
(`conversion_participant`) et l'étiquette comme telle ; `/membres/[id]` porte une section
**« Séminaires assistés »**.

**En base : quatre tables** (`types_evenement`, `evenements`, `participants_externes`,
`participations`), **deux vues**, et **19 migrations** (`20260818100000` à `20260818280000`).

### Les trois désirs ne quittent jamais le périmètre modérateur/administrateur

`participations` porte trois booléens — **mentorat académique**, **suivi spirituel**,
**CPEAP** — plus une note libre. Ce sont des confidences, et le projet les traite comme
telles : la politique `participations_lecture` exige `est_actif() and
est_moderateur_ou_admin()`, et l'écran ne **lit pas du tout** ces colonnes hors de ce
périmètre. C'est délibéré : une lecture vidée par la RLS et affichée quand même montrerait
un évènement à cent participants comme désert — **un mensonge, pas une protection**.

### Les deux vues, et pourquoi elles sont l'inverse l'une de l'autre

C'est le point le plus subtil de la phase, et il vaut d'être lu avant toute retouche.

- **`seminaires_assistes`** est la **seule vue du projet en `security_invoker = false`**.
  Elle contourne délibérément la RLS de `participations` pour rendre le **seul fait** d'avoir
  assisté à un séminaire lisible de **tout compte actif** : le partage à faire est
  **colonne à colonne** là où la RLS est **ligne à ligne**. Elle expose **cinq colonnes**,
  aucune ne portant un désir, une note ni une identité externe. Elle ne contourne **pas** la
  RLS de `membres` : `prive.peut_lire_membre` la réimpose, dans une définition **unique**
  partagée avec la politique `membres_lecture`.
- **`participants_a_traiter`** est en `security_invoker = true`, **l'inverse exact**, et tout
  aussi délibérément : ses lecteurs légitimes ont déjà le droit de lire les tables jointes,
  elle hérite donc de leur RLS. **Y écrire `false` ouvrirait la liste des confidences à tout
  compte actif.**

**Le mode de défaillance à connaître** : si l'hypothèse `BYPASSRLS` du propriétaire de
`seminaires_assistes` était fausse, elle ne lèverait **aucune erreur** — elle rendrait zéro
ligne **pour tout le monde**, et les étiquettes de séminaires disparaîtraient de toutes les
fiches membres **sans la moindre trace**. Si cette section est vide sur toutes les fiches, la
première chose à regarder est `reloptions` de la vue.

### La conversion, et pourquoi elle est irréversible

Un participant externe se convertit par **trois chemins** au choix, tous servis par une seule
passerelle SQL (`convertir_participant_externe`), donc **atomiques par construction** :

1. **fiche `en_attente`** — elle rejoint le circuit de validation de `/demandes`. Le bouton
   « Valider comme nouvelle personne » est **le seul geste de toute l'application** qui la
   fasse passer à `actif`, et il ne pose **aucun faiseur de disciple** : l'administrateur qui
   convertit n'est pas le faiseur de disciple de la personne convertie. Le rattachement à
   l'arbre est un geste **séparé**, depuis `/membres/<id>/arbre`.
2. **fiche `actif` immédiate**, avec faiseur de disciple **obligatoire** — sans lui, la fiche
   naîtrait active et **détachée de l'arbre**, sans le moindre signal.
3. **rattachement à une fiche existante** — aucune fiche créée ; le séminaire rejoint
   l'historique de la fiche cible, qui doit être **active**.

**Elle ne se défait pas.** Le déclencheur `participants_externes_liens_definitifs` refuse
toute seconde écriture du lien, y compris une remise à `NULL` — sans quoi un participant se
**déconvertirait silencieusement**. C'est pourquoi le bouton porte une confirmation qui nomme
le chemin choisi : c'est là que se joue l'erreur coûteuse.

**L'historique d'un converti n'est pas réécrit.** `participations.membre_id` n'est jamais
repointé : la seconde branche de `seminaires_assistes` résout le lien **à la lecture**.
Repointer effacerait le fait que cette personne est entrée par un séminaire — précisément ce
que le projet veut mesurer.

### Le classement sans suite, et la limite qu'il faut connaître

L'autre façon de vider la liste « à traiter » est le **classement sans suite**, avec un motif
**obligatoire**. Il n'y a **pas de réouverture** : le **même** déclencheur qu'au paragraphe
précédent (`participants_externes_liens_definitifs`, dont la fonction est
`prive.refuser_reouverture_participant` — un seul déclencheur porte les **deux** invariants)
refuse de modifier `classe_le` une fois posé, **y compris pour le remettre à `NULL`**, même
par écriture directe.

**Ce que l'application ne permet pas, et il faut le savoir avant de classer quelqu'un** : la
passerelle SQL laisse convertir un participant déjà classé (« quelqu'un classé il y a deux
ans qui reprend contact »), mais **aucun écran ne liste les classés** — la vue « à traiter »
les exclut par construction. En pratique, un classé se **reconnaît** là où il apparaît (sa
mention et son motif sont affichés sur la fiche de chaque évènement où il figure), mais il ne
se **retrouve pas** : il n'existe aucun écran « qui ai-je classé ». Pour reprendre le suivi
d'une personne classée, il faut la **ressaisir** comme nouveau participant — ce qui crée une
autre ligne et ne rattache pas l'ancienne participation. À traiter en phase 6.

## Phase 5 : la création enrichie et l'arborescence

- **Création enrichie** (`/membres/nouveau`) — la fiche, ses statuts, son faiseur de
  disciple et son dirigeant en **une seule soumission** et **une seule transaction**. Les
  trois enrichissements sont facultatifs et indépendants ; une création sans aucun d'eux
  produit exactement ce que l'ancienne `creerMembre` produisait.
- **`public.creer_membre_enrichi`** — passerelle atomique unique, qui **compose**
  `public.definir_arbre` et `public.attribuer_statut` au lieu de recopier leurs gardes
  (D81, D82). Aucune trace écrite depuis son intérieur ne survivrait à son échec — Postgres
  n'a pas de transaction autonome —, **le diagnostic est donc journalisé côté application**.
- **Refus du couple exclusif à la création** (D84), deux fois : une fonction pure qui
  **nomme les deux statuts**, et la passerelle qui **relit les groupes en base**. L'éviction
  de `prive.attribuer_statut` n'est jamais laissée agir ici : elle journaliserait le retrait
  d'un statut que personne n'a jamais porté plus d'une transaction.
- **`/arborescence`** — l'arbre des faiseurs de disciple, **en consultation seule** (D92),
  ouvert à tout compte actif. Racines paginées et **dénombrées** (le nombre est la mesure
  qui dira si la création enrichie agit), dépliage nœud par nœud, recherche menant au
  **chemin déplié** d'une personne, indentation plafonnée et fil d'Ariane.
- **L'invariant que trois déclencheurs tenaient sans que personne l'ait écrit — écrit,
  ÉLARGI et VERROUILLÉ par cette phase** : **aucun membre `actif` n'a d'ancêtre qui ne soit
  pas `actif`** (20260814120000, 20260814140000, 20260814150000, corrigées par la phase 5).
  C'est lui qui rend l'arbre sans trou. **Deux défauts ont été fermés au passage**, tous
  deux sur du code déjà déployé : (1) les trois gardes ne comparaient qu'à `archive`, alors
  que l'état a **trois** valeurs — rien n'interdisait de rattacher un membre actif à un
  faiseur `en_attente`, dont toute la descendance active devenait alors **inatteignable
  depuis les racines** ; (2) l'état du faiseur était lu **sans verrou de ligne**, si bien
  qu'un rattachement et un archivage concurrents ne se voyaient pas et validaient tous les
  deux. Un `for share` referme la course, et un marqueur distinct,
  `faiseur_de_disciple_inactif`, évite d'afficher « ce faiseur est archivé » à propos d'une
  fiche qui ne l'est pas.
- **L'écran ne s'appuie pourtant PAS sur cet invariant pour être correct** : les noms des
  maillons du chemin sont filtrés `etat = 'actif'` **explicitement, pour tous les rôles**,
  et un maillon qui ne l'est pas dégrade en « Fiche non consultable », **à sa place dans le
  chemin**. Sans ce filtre, l'exclusion aurait été déléguée à la RLS — un administrateur
  aurait lu le **nom** là où un compte ordinaire lit « Fiche non consultable », et l'écran
  aurait menti sur sa propre légende.
- **Trois fuites de vie privée refermées pendant cette phase** — le journal serveur
  recevait le champ `details` brut d'une erreur Postgres, qui contient
  `Failing row contains (…)` : la ligne entière, donc téléphone, adresse de contact, ville,
  pays. **Le critère qui tranche si un site est concerné n'est pas un décompte — un
  décompte se recopie sans se rejouer, et un relevé transmis comme acquis pendant cette
  phase s'est révélé faux, sur la foi d'un motif de recherche trop étroit** : la fonction
  appelée écrit-elle dans `public.membres` ? Le site le plus grave n'était pas celui
  qu'une première carte désignait : `evenements/a-traiter/actions.ts`, dont la fonction
  **insère** une fiche neuve porteuse de toutes les coordonnées.
  **Ce premier critère était lui-même trop étroit, corrigé en clôture de phase** :
  `public.participants_externes` porte les **six mêmes colonnes de coordonnées** que
  `membres` (`nom`, `prenom`, `telephone`, `email`, `ville`, `pays`) et **trois**
  contraintes `check` (`participants_externes_nom_non_vide`,
  `participants_externes_classement_coherent`, `participants_externes_conversion_coherente`,
  `20260818140000_participants_externes.sql`), donc le même risque de `Failing row
  contains (…)`. **Le critère juste est donc : la fonction appelée écrit-elle dans une
  table qui porte des coordonnées personnelles — `public.membres` ET
  `public.participants_externes` — et une contrainte `check` y est-elle atteignable ?**
  Sur ce dossier précis, la couverture tenait déjà, mais **pour une raison indépendante du
  critère écrit à l'époque, pas grâce à lui** : `classer_participant_externe` garde
  `length(trim(p_motif)) = 0` en amont (`20260818230000:35-38`) et
  `ajouterParticipantExterne` ne journalise pas `details`. Le résultat était donc bon, le
  raisonnement qui l'expliquait était faux — et **rien, ni lint ni test, ne le
  vérifie** : la diffusion de ce critère repose entièrement sur le fait qu'il est écrit
  ici.
- **Les deux trous de couverture signalés à l'issue des tâches précédentes sont comblés par
  la Task 14** : `pageContenantDisciple` (`arbre-lots.ts`) n'était exercée par aucun test
  permanent — elle l'est désormais de bout en bout par
  `tests/e2e/arborescence.spec.ts` (« la recherche atteint une personne située AU-DELÀ de
  la première page de son faiseur »), avec une fratrie construite pour forcer le calcul de
  page à intervenir. Et `/arborescence` elle-même, jusque-là sans aucun test de bout en
  bout, en reçoit un dans le même fichier — protection par connexion, parcours, recherche,
  visibilité du lien « Rattacher » réservée à l'administrateur, et garde forgée (appel
  Server Action rejoué sans session, avec canari par le même canal) sur les trois actions
  du dossier.

**Restent non corrigés, et signalés plutôt que lissés :** `disciplesDe` (non bornée, tri
non total, **délibérément intacte** — son second appelant, le contrôle amont
d'`archiverMembre`, doit rester complet, D94), `listerCatalogue`, `statutsDuMembre` et
`journalDuMembre` (non bornées) ; et la divergence des doctrines de pagination D29/D46/D53
contre D75, qui laisserait le pointage AEL se faire tronquer en silence au-delà de mille
membres actifs par antenne.
