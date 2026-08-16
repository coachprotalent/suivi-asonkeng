# Phase 6 — Refonte de l'interface : le système de design « Filiation » — plan d'implémentation

> **Pour les agents implémenteurs :** COMPÉTENCE OBLIGATOIRE — utiliser
> `superpowers:subagent-driven-development` (recommandé) ou `superpowers:executing-plans`
> pour exécuter ce plan tâche par tâche. Les étapes emploient la syntaxe à cases
> (`- [ ]`) pour le suivi.
>
> **Chaque tâche est écrite pour être lue SEULE.** Un implémenteur ne lit que sa tâche.
> Les pièges qui la concernent sont **répétés dans son corps**, jamais seulement en tête
> de ce document.

**But :** doter les vingt-sept écrans d'un vocabulaire visuel unique — douze composants
partagés, un jeu de jetons CSS, un état de focus visible, trois points de rupture réels — en
ne changeant **aucun** comportement métier, **aucun** texte affiché, et **aucune** ligne sous
`supabase/`. Un seul comportement change, et il est nommé : les quinze `window.confirm()`
deviennent un `<dialog>` natif.

**Architecture :** les jetons vivent dans `src/app/globals.css`, exposés à Tailwind 4 par
`@theme inline` — ce qui rend la direction visuelle réversible en un fichier (D109) et la
densité compacte réalisable par un simple attribut (D107). Douze composants sous
`src/composants/ui/`, sans aucune valeur littérale, dont trois seulement sont des composants
client (`Formulaire`, `Refus`, `Dialogue`). Les écrans consomment ces composants ; ils ne
gardent de classes utilitaires que pour leur **disposition** propre.

**Pile technique :** Next.js 16.3.0 (App Router, Server Actions), React 19.2.8,
TypeScript 6.0.3, Tailwind CSS 4.3.3 (**nu** — `@tailwindcss/postcss`, aucun
`tailwind.config.*`), Supabase, Vitest 4.1.10, Playwright 1.62.1.

**Branche :** `phase-6-refonte-ui`.

**Documents de référence :**

- `docs/superpowers/specs/2026-08-16-phase-6-refonte-ui-design.md` — la conception de cette
  phase, ses décisions **D106 à D127**, son système de jetons (§4), sa table des composants
  (§5), ses neuf preuves exigées (§7) et ses six pièges (§8). **Fait autorité ; aucune de ses
  décisions n'est rouverte ici** — mais quatre de ses affirmations chiffrées sont contredites
  par le code, et la section suivante les rectifie.
- `.superpowers/sdd/inventaire-ecrans.md` (327 lignes) et
  `.superpowers/sdd/inventaire-vocabulaire.md` (260 lignes) — les deux relevés mesurés.
- `docs/superpowers/plans/2026-08-15-phase-5-creation-arbre.md` — modèle de forme et de
  granularité.

---

## ⚠️ CE QUE LE CODE CONTREDIT DANS LA CONCEPTION — LU LE 2026-08-16, PAS RECOPIÉ

Ce projet a une histoire de **cartes fausses transmises comme acquises** — trois sur la seule
phase 5, dont un tableau qui excluait par construction le seul fichier concerné. Les cinq
points ci-dessous ont été rejoués contre le code. **Ils priment sur la conception**, et
chaque tâche concernée les reprend dans son corps.

### C1 — D119 et D124 sont INCOMPATIBLES tels qu'écrits. C'est le point le plus grave du plan.

D119 dit : « les preuves de bout en bout existantes ne sont PAS modifiées ». D124 dit : « les
quinze `window.confirm()` sont remplacés par un `Dialogue` ». **Les deux ne peuvent pas être
vraies ensemble**, et la conception ne le voit pas.

Mesure :

```bash
grep -rn "once('dialog'" tests/ | sed 's/:.*//' | sort | uniq -c
grep -rn "once('dialog'" tests/ | wc -l
```

Résultat au 2026-08-16 : **22 gestionnaires `page.once('dialog', …)`, répartis sur 11
fichiers** — 10 sous `tests/e2e/` et **1 sous `tests/e2e-prod/`** :

| Fichier | Gestionnaires |
|---|---|
| `tests/e2e/ael-pointage.spec.ts` | 1 (L384) |
| `tests/e2e/ael-preuves.spec.ts` | 1 (L1043) |
| `tests/e2e/ael-seance-detail.spec.ts` | 3 (L297, L311, L327) |
| `tests/e2e/annuaire.spec.ts` | 1 (L183) — **assert le message** |
| `tests/e2e/arbre.spec.ts` | 3 (L254, L281, L337) |
| `tests/e2e/archivage-compte.spec.ts` | 3 (L151, L182, L225) — **2 assertent le message** |
| `tests/e2e/demandes.spec.ts` | 3 (L367, L556, L629) — **1 assert le message** |
| `tests/e2e/evenements-types.spec.ts` | 2 (L162, L171) |
| `tests/e2e/evenements.spec.ts` | 1 (L127, `capterConfirmation`) — **assert le message** |
| `tests/e2e/tokens.spec.ts` | 3 (L171, L225, L255) |
| `tests/e2e-prod/refus-evenements-production.spec.ts` | 1 (L236) — **assert le message** |

Playwright **rejette automatiquement** toute boîte de dialogue native non gérée (comportement
documenté, et déjà consigné en commentaire dans `tests/e2e/tokens.spec.ts:163-166` et
`tests/e2e/evenements.spec.ts:116`). Une fois `window.confirm` retiré, ces 22 gestionnaires ne
se déclenchent plus jamais : ils ne « cassent » pas bruyamment, ils deviennent **inertes**, et
les clics qu'ils débloquaient restent bloqués derrière un `<dialog>` que personne ne confirme.
Les tests échouent alors en **timeout**, loin de la cause.

**Arbitrage porté par ce plan, et il est déclaré ici avant d'être écrit (§7 preuve 6) :**

1. **Aucune assertion n'est modifiée.** Les six tests qui assertent le texte de la
   confirmation gardent leurs `expect(...).toContain(...)` **à l'octet près**, parce que le
   `Dialogue` rend **la même chaîne**, inchangée (voir C5 ci-dessous).
2. **Seul le HARNAIS change** : `page.once('dialog', d => d.accept())` devient
   `await accepterConfirmation(page)`, un helper unique écrit à la **Task 15**. C'est un
   changement de **canal**, pas de **preuve**.
3. **Ce changement est concentré dans une seule tâche (Task 15)**, réalisé en un seul commit,
   et son `--stat` est consigné. Aucune autre tâche du plan ne touche `tests/e2e/` ni
   `tests/e2e-prod/`.
4. **Le décompte reste 128 et 10.** Aucun `test(` n'est ajouté ni retiré dans les fichiers
   existants. Vérifié par la commande de la Task 15.

**Si une preuve rougit pour une autre raison que celle-là, c'est un signal, pas un test à
ajuster.** D119 tient intégralement partout ailleurs.

### C2 — « Aucune police n'est chargée » est FAUX. Le dépôt en charge deux, et ne les emploie presque pas.

La conception écrit (§4.2) : « Aucune police n'est chargée : le dépôt n'en charge aucune
aujourd'hui ». `src/app/layout.tsx:2` importe `Geist` et `Geist_Mono` de `next/font/google`,
et les instancie aux lignes 6-14. Ce sont **deux polices Google réellement téléchargées et
auto-hébergées au build**, avec leurs `<link rel="preload">`.

Pire : elles sont **payées et presque pas employées**. `src/app/globals.css:25` pose
`body { font-family: Arial, Helvetica, sans-serif; }`, qui écrase `--font-geist-sans` pour
tout le document. Le seul usage réel de Geist est `font-mono`, sur **trois** `<code>` :
`comptes/formulaire-compte.tsx:73`, `comptes/ligne-compte.tsx:284`,
`tokens/formulaire-generation.tsx:95`.

**Conséquence pour le plan :** l'intention de §4.2 (pile système, zéro octet bloquant) est
juste, mais elle n'est pas un constat — c'est un **travail**, fait à la **Task 1**, qui retire
les deux imports `next/font/google`. Le `font-mono` des trois `<code>` retombe sur une pile
mono système, déclarée en jeton.

### C3 — Le mode sombre du gabarit est déjà LÀ, et il est déjà CASSÉ.

`src/app/globals.css:15-20` porte un `@media (prefers-color-scheme: dark)` **hérité de
`create-next-app`**, qui bascule `--background` à `#0a0a0a` et `--foreground` à `#ededed`.
Aucun écran n'en tient compte : `bg-neutral-900` + `text-white` (27 occurrences) devient un
bouton quasi invisible sur fond quasi noir, et `text-neutral-500` (83 occurrences) tombe à un
contraste indéfendable.

D116 dit « aucun thème sombre dans cette phase ». Ce n'est donc pas une abstention : c'est un
**retrait**. La **Task 1** supprime ce bloc, et la structure des jetons est posée pour qu'un
thème sombre futur soit un second bloc `:root[data-theme="sombre"]` sans toucher un composant.

### C4 — D126 nomme cinq « états » dont trois n'existent pas comme états, et deux ne sont pas les seuls.

D126 énumère « `Repenti`, `Baptisé`, `Affermi`, `En attente`, `Archivé` ». Le code dit autre
chose :

- **`Repenti` et `Baptisé` sont des lignes de catalogue en base**, pas des valeurs de type :
  `supabase/migrations/20260813100000_statuts.sql:60-66` amorce `Non-croyant`, `Repenti`,
  `Baptisé d'eau`, `Baptisé du Saint-Esprit`, `Sert dans une commission`. Un administrateur en
  ajoute et en désactive depuis `/statuts`. **`Baptisé` nu n'existe pas, et `Affermi` n'existe
  nulle part dans le dépôt** (`grep -rni "affermi" src supabase` → zéro).
- **Il y a QUATRE vocabulaires d'état distincts**, pas un :
  | Type | Valeurs | Source |
  |---|---|---|
  | `EtatMembre` | `en_attente` \| `actif` \| `archive` | `src/lib/domaine/membre.ts:2` |
  | `DemandeListe['etat']` | `en_attente` \| `validee` \| `rejetee` \| `annulee` | `src/lib/donnees/demandes.ts:50` |
  | `EtatSeanceAel` | `prevue` \| `tenue` \| `annulee` | `src/lib/domaine/ael.ts:4` |
  | état de compte | `Actif` / `Désactivé` (booléen `compte.actif`) | `comptes/ligne-compte.tsx:144` |
  auxquels s'ajoutent l'état de token (`Valide` / `Expiré` / `Révoqué le …` / `Utilisé le …`,
  `tokens/ligne-token.tsx:7-12`) et les libellés de statut, qui sont des **données**.
- Les « 2 pastilles » que le §5 attribue à `EtatBadge` (`membres/[id]/page.tsx:213` et `:255`)
  **ne sont pas des états** : ce sont des puces de statut et de séminaire, en
  `rounded-full border border-neutral-300`, **sans couleur**. `EtatBadge` n'a donc **aucun
  antécédent** — il en a **zéro**, pas deux, ce qui renforce l'avertissement du §5 : son
  risque est l'usage, pas la divergence.

**Conséquence pour le plan :** `EtatBadge` ne porte **pas** une union fermée de cinq libellés
— ce serait une carte fausse dès la première ligne ajoutée au catalogue. Il porte un **ton**
énuméré (`acquis` \| `attente` \| `refus` \| `neutre`, alignés sur les quatre jetons de la
conception) et un **libellé libre**. La correspondance état → ton est déclarée **par écran**,
à côté du `Record` de libellés qui existe déjà là (Task 5, §« correspondances de ton »).

### C5 — La conception dit « quinze `window.confirm` », et c'est exact — mais ils sont de DEUX formes, pas d'une.

`grep -rn "window.confirm" src --include="*.tsx" | wc -l` → **15**. Confirmé. `grep -rn
"confirm(" src | wc -l` → **15** aussi : aucun appel caché ailleurs.

Mais dix d'entre eux sont un `onClick` sur un `<button type="submit">` qui appelle
`evenement.preventDefault()` en cas de refus, et cinq sont un `if (!confirm(…)) return;` dans
un handler impératif. **La transformation n'est pas la même**, et l'un des cinq porte un
défaut que la traduction mécanique introduirait sans bruit (`evenement.currentTarget` nullifié
après le premier `await`, `comptes/ligne-compte.tsx:89` et `:114`). Les Tasks 13 et 14
traitent chaque site nommément.

**Point de méthode, et il vaut pour D117 :** les messages de confirmation contiennent des
`\n\n`. Le `Dialogue` les rend avec `white-space: pre-line`, **sur la chaîne inchangée**.
Aucun octet de texte affiché ne bouge, et aucune déclaration D117 n'est requise pour les
quinze.

---

## Politique des portes

**Avant CHAQUE commit, seulement les rapides :**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls
```

**`npm run build`, `npm run test:e2e` et `npm run test:e2e:prod` UNE FOIS PAR LOT**, jamais
après chaque tâche. Les quatre lots de cette phase :

| Lot | Tâches | Porte de fin de lot |
|---|---|---|
| A — le socle | 1 à 7 | `build` (le socle change le CSS : rien d'autre ne le prouve) |
| B — les trois témoins | 8 à 12 | `build`, `test:e2e`, `test:e2e:prod` |
| C — les quinze dialogues | 13 à 15 | `build`, `test:e2e`, `test:e2e:prod` |
| D — les écrans restants | 16 à 24 | `build`, `test:e2e`, `test:e2e:prod` |

### ⚠️ LE DÉLAI D'EXÉCUTION PLAFONNE À 600 000 ms, ET UNE DEMANDE SUPÉRIEURE EST IGNORÉE, PAS REFUSÉE

Contrainte d'outil **mesurée dans ce projet** : un `timeout` supérieur à 600 000 ms n'est pas
rejeté avec un message — il est **silencieusement ramené au plafond**. La suite e2e complète a
déjà été **tuée en cours d'exécution** pour cette raison, et le rapport a lu ce meurtre comme
un échec de test.

`tests/e2e` compte **88 fichiers-tests sérialisés** (`workers: 1`, `playwright.config.ts:15`)
pour **128 assertions `test(`**, et coûte environ **7,5 minutes**. **Elle se lance en lots**,
jamais d'un trait :

```bash
npm run test:e2e -- tests/e2e/annuaire.spec.ts tests/e2e/arbre.spec.ts tests/e2e/arborescence.spec.ts tests/e2e/autorite.spec.ts
```

```bash
npm run test:e2e -- tests/e2e/ael-pointage.spec.ts tests/e2e/ael-preuves.spec.ts tests/e2e/ael-seance-detail.spec.ts
```

```bash
npm run test:e2e -- tests/e2e/demandes.spec.ts tests/e2e/evenements.spec.ts tests/e2e/evenements-detail.spec.ts tests/e2e/evenements-liste.spec.ts tests/e2e/evenements-types.spec.ts
```

```bash
npm run test:e2e -- tests/e2e/antennes-membres.spec.ts tests/e2e/archivage-compte.spec.ts tests/e2e/connexion.spec.ts tests/e2e/creation-enrichie.spec.ts tests/e2e/inscription.spec.ts tests/e2e/notifications.spec.ts tests/e2e/statuts.spec.ts tests/e2e/tokens.spec.ts
```

`npm run test:e2e:prod` reconstruit l'application (`npm run build && npm run start -- -p 3100`,
`playwright.prod.config.ts:30`) : compter **5 minutes rien que pour le démarrage**, et la
lancer **seule**, jamais en même temps qu'un lot e2e de développement.

**Si une suite de fin de lot échoue, ÉTABLIR QUEL COMMIT L'A CASSÉE par un rejeu en
isolation**, et le consigner. Ne jamais « corriger au jugé » une suite rouge dont on n'a pas
identifié le commit fautif.

---

## Contraintes globales

Ces règles s'appliquent à **chaque** tâche.

### 0. Deux commandes de ce plan étaient fausses — corrigées le 2026-08-16, après la tâche 2

Elles se répétaient chacune plusieurs fois. Toutes deux **rendaient zéro sans rien mesurer** :
c'est la forme de défaut que ce projet appelle une **mesure vraie à vide**, et elle est d'autant
plus coûteuse ici qu'elle porte sur des commandes de **preuve**.

**a) Le chemin du CSS compilé.** Le plan écrivait `.next/static/css/*.css`, qui est la sortie de
**webpack**. Ce projet compile avec **Turbopack**, dont le CSS atterrit dans
`.next/static/chunks/`. La commande littérale rendait donc `0` pour tout — **y compris pour son
propre contrôle positif**, qui aurait dû l'alerter. Les cinq occurrences emploient désormais
`$(find .next/static -name "*.css")`.

Deux corollaires à retenir quand tu interroges ce CSS : les deux-points d'un préfixe Tailwind y
sont **échappés** (`sm\:block`), donc un motif non échappé ne trouve rien ; et **un contrôle
positif qui rend zéro n'est pas un résultat, c'est une panne de l'instrument**.

**b) Le balayage « aucune valeur littérale sous `src/composants/` ».** Il rend **9**, pas `0`, et
les neuf sont dans des **commentaires** — dont le texte historique que ce plan lui-même cite,
avec d'anciens noms de classes. Le balayage doit donc **exclure les commentaires** avant de
conclure, faute de quoi il rougit sur sa propre documentation :

```bash
grep -rEn "#[0-9a-fA-F]{3,8}|\b(bg|text|border|ring|divide)-(red|amber|green|blue|neutral|gray|slate|zinc|stone|white|black)(-[0-9]{2,3})?\b" src/composants/ \
  | grep -v ':[0-9]*: *\(\*\|//\|/\*\)' \
  | wc -l
```

Attendu : `0`. **Prouve d'abord que ta commande sait trouver quelque chose** — ajoute une couleur
littérale dans un `className` d'un fichier témoin, vérifie qu'elle est vue, retire-la — avant
qu'un zéro veuille dire une absence.

### 1. Le périmètre est déclaré VIDE côté base, et ce vide est une preuve (D118)

**AUCUNE migration. AUCUNE politique RLS. AUCUN déclencheur. AUCUNE Server Action d'écriture
nouvelle ou modifiée. AUCUN marqueur d'erreur.** Corollaire vérifiable, et c'est la preuve
n°1 du §7 :

```bash
git diff --stat main...HEAD -- supabase/
```

**Sur la PLAGE de commits (`main...HEAD`), jamais sur l'arbre de travail** : un
`git diff --stat` sans plage rend toujours zéro sur un arbre propre et **ne peut pas
échouer** — défaut relevé en phase 5. La sortie attendue est **vide**.

### 2. Un refus MÉTIER se RETOURNE, il ne se lève jamais

Une exception levée depuis une Server Action est remplacée par un digest React en build de
**production**. Cette phase ne récrit aucune action, mais elle **déplace** du code appelant :
tout `try`/`catch` autour d'une action existante est **conservé tel quel**, avec son
commentaire. `comptes/ligne-compte.tsx` est le seul fichier du dépôt qui ATTRAPE pour afficher
`error.message` — voir D123 et la Task 20.

### 3. `redirect()` lève une exception de contrôle Next.js : JAMAIS dans un `try`

Vaut en particulier pour la Task 6, qui extrait le bornage de pagination dans une fonction :
la fonction extraite appelle `redirect()` et **doit** être appelée hors de tout `try`, comme
les six sites d'origine le sont aujourd'hui (chacun le dit en commentaire).

### 4. Apostrophes

Apostrophe **droite** (`'`) partout, jamais typographique. En TypeScript, une chaîne contenant
une apostrophe s'écrit entre **guillemets doubles** (`"L'arbre"`) — une apostrophe dans une
chaîne délimitée par des apostrophes produit `TS1005`, et **ce piège s'est refermé quatre
fois**. En JSX **rendu**, `&apos;`. **Jamais d'apostrophe doublée dans une chaîne
JavaScript** : `''` est du SQL, et cette phase n'écrit pas une ligne de SQL.

### 5. Aucun texte affiché n'est modifié sans déclaration (D117)

Les libellés, messages de refus, titres, états vides et messages de confirmation gardent leur
formulation **à l'octet près**. **Ce plan ne déclare AUCUN changement de texte affiché.** Les
quinze messages de confirmation passent au `Dialogue` **inchangés**, rendus en
`white-space: pre-line` (C5). Si une tâche croit devoir changer un mot, elle **s'arrête et le
signale** ; elle ne le change pas.

### 6. Les 128 preuves e2e et les 10 preuves de production ne sont PAS modifiées (D119)

Décompte vérifié le 2026-08-16 :

```bash
grep -rhoE "^\s*test\(" tests/e2e --include="*.spec.ts" | wc -l      # 128
grep -rhoE "^\s*test\(" tests/e2e-prod --include="*.spec.ts" | wc -l # 10
```

**Une seule exception, déclarée en C1 et confinée à la Task 15** : le remplacement du canal
`page.once('dialog', …)` par un helper, sans toucher une seule assertion. **Toute autre suite
rouge est un SIGNAL.** C'est le piège le plus probable de cette phase, parce que le geste est
petit et paraît raisonnable sur le moment.

### 7. Aucun composant ne porte de valeur littérale (D109)

Ni couleur, ni rayon, ni ombre, ni espacement de rythme, ni taille de police, sous
`src/composants/`. Les composants n'exposent **pas** de prop `className` : une échappatoire de
style recrée en un mois le désordre que la phase corrige. Les variations légitimes
(largeur d'un champ, ton d'un badge, variante d'un bouton) sont des props **énumérées**.

Preuve n°2 du §7, et **elle doit d'abord prouver qu'elle sait trouver une couleur** avant que
son zéro veuille dire quelque chose — une mesure vraie à vide a déjà été produite dans ce
projet par un `grep` dont l'échappement ne se développait pas :

```bash
printf 'const c = "#ABCDEF"\nconst d = "text-red-600"\n' > /tmp/temoin-couleur.tsx
grep -rEn "#[0-9a-fA-F]{3,8}\b|\b(bg|text|border|ring|fill|stroke)-(red|amber|green|blue|neutral|gray|slate|zinc|stone|white|black)(-[0-9]{2,3})?\b" /tmp/temoin-couleur.tsx
# DOIT rendre 2 lignes. Si elle rend 0, la commande est cassée et son zéro sur src/ ne vaut rien.
grep -rEn "#[0-9a-fA-F]{3,8}\b|\b(bg|text|border|ring|fill|stroke)-(red|amber|green|blue|neutral|gray|slate|zinc|stone|white|black)(-[0-9]{2,3})?\b" src/composants/
# DOIT rendre 0 ligne.
```

### 8. Ne stager que ses propres fichiers. Jamais `git add -A`.

### 9. Le bloc `AGENTS.md` réécrit par `next dev`

`next dev` réécrit et ré-ajoute le bloc de tête d'`AGENTS.md` (voir
`node_modules/next/dist/server/lib/generate-agent-files.js`). Le retirer d'un diff ne fait que
recréer la modification non commitée. **S'il apparaît, le committer avec le travail** pour
garder l'arbre propre — et ne jamais le confondre avec un fichier de la phase.

### 10. Le rail de filiation ne doit pas mentir (piège n°6)

Le rail marque une **profondeur** ou un **lien de discipulat réel**. Les seuls endroits où une
relation de discipulat est affichée, vérifiés dans le code :

| Écran | Où | Tâche |
|---|---|---|
| `/arborescence` | chaque `Noeud` (profondeur) | 10 |
| `/membres/[id]` | lignes « Faiseur de disciple » et « Dirigeant » du `<dl>` (`page.tsx:83-94`) et section « Disciples actifs » (`:270-303`) | 21 |
| `/membres/[id]/arbre` | le formulaire de rattachement | 22 |
| `/demandes` | `FormulaireValidationSuivi`, champ « Dirigeant proposé » (`formulaire-validation-suivi.tsx:53`) | 17 |
| `/evenements/a-traiter` | le sélecteur de faiseur de disciple du chemin de conversion | 18 |

**`/membres` (l'annuaire) N'EST PAS de la liste** : il affiche antenne, ville et situation
(`membres/page.tsx:126`), **jamais un faiseur de disciple**. Y poser un rail serait une
décoration qui affirme quelque chose de faux — la forme de défaut la plus coûteuse de ce
projet.

### 11. Signaler, ne pas corriger (pièges n°4, D118, D123)

Vingt-sept écrans rouverts, c'est vingt-sept occasions de voir un défaut réel et de le réparer
hors sujet. **Consigner dans le rapport de tâche, ne rien corriger.**

---

## Structure des fichiers

### Créés

| Fichier | Tâche | Responsabilité |
|---|---|---|
| `src/composants/ui/bouton.tsx` | 2 | `Bouton` — quatre variantes énumérées, bascule de libellé à l'attente |
| `src/composants/ui/en-tete-page.tsx` | 2 | `EnTetePage` — lien de retour, `<h1>`, sous-titre, action de tête |
| `src/composants/ui/champ.tsx` | 3 | `Champ` — `<input>` contrôlé, `defaultValue` **impossible** |
| `src/composants/ui/selecteur.tsx` | 3 | `Selecteur` — `<select>` contrôlé, `defaultValue` **impossible** |
| `src/composants/ui/zone-texte.tsx` | 3 | `ZoneTexte` — `<textarea>` contrôlé, `defaultValue` **impossible** |
| `src/composants/ui/refus.tsx` | 4 | `Refus` — `role="alert"`, `tabIndex={-1}`, focus visible (client) |
| `src/composants/ui/formulaire.tsx` | 4 | `Formulaire` — `onReset` prévenu une fois pour toutes (client) |
| `src/composants/ui/carte.tsx` | 5 | `Carte` — surface encadrée, rail optionnel |
| `src/composants/ui/ligne-liste.tsx` | 5 | `LigneListe` — la bascule liste → cartes empilées sous `md` |
| `src/composants/ui/etat-badge.tsx` | 5 | `EtatBadge` — pastille + libellé, jamais l'un sans l'autre |
| `src/composants/ui/pagination.tsx` | 6 | `Pagination` — « Page précédente » / « Page suivante » |
| `src/composants/ui/dialogue.tsx` | 7 | `Dialogue` — `<dialog>` natif, focus piégé, `Échap`, restitution (client) |
| `src/composants/ui/index.ts` | 7 | ré-export unique des douze |
| `src/lib/navigation/bornage.ts` | 6 | `bornerPage` — la redirection de bornage, extraite des six fichiers |
| `src/lib/donnees/pagination.test.ts` | 6 | preuve unitaire de `nombreDePages` |
| `src/lib/domaine/arbre-affichage.ts` | 10 | les **deux** barrières anti-cycle, en fonctions pures |
| `src/lib/domaine/arbre-affichage.test.ts` | 10 | une preuve par barrière |
| `src/app/arborescence/noeud.tsx` | 10 | le rendu récursif, séparé de la logique (D122) |
| `tests/confirmation.ts` | 15 | helper e2e partagé : `accepterConfirmation`, `capterConfirmation`, `refuserConfirmation` |
| `tests/e2e/dialogue.spec.ts` | 15 | preuves neuves du `Dialogue` : focus piégé, `Échap`, restitution |

### Modifiés

| Fichier | Tâche | Nature |
|---|---|---|
| `src/app/globals.css` | 1 | **réécrit** — jetons, couche de base, focus, densité |
| `src/app/layout.tsx` | 1 | retrait de `next/font/google` (C2), fond et encre depuis les jetons |
| `src/lib/donnees/pagination.ts` | 6 | ajout de `nombreDePages` (pur, sans `next/navigation`) |
| `src/app/membres/page.tsx` | 8 | témoin liste |
| `src/app/membres/formulaire-membre.tsx`, `src/app/membres/nouveau/bloc-enrichissement.tsx`, `src/app/membres/nouveau/page.tsx` | 9 | témoin formulaire dense |
| `src/app/arborescence/arborescence.tsx`, `src/app/arborescence/page.tsx` | 10 | témoin récursion, scission (D122) |
| `src/app/connexion/*`, `src/app/inscription/*` | 12 | écrans publics |
| les 10 boutons de confirmation « famille A » | 13 | `window.confirm` → `Dialogue` |
| les 5 sites impératifs « famille B » | 14 | `window.confirm` → `Dialogue` |
| 11 fichiers de `tests/` | 15 | **harnais seulement** (C1) |
| les 21 écrans restants | 16 à 24 | migration au vocabulaire partagé |

### Explicitement NON modifiés

- **`supabase/**` — aucun fichier, et c'est la preuve n°1.**
- **`src/lib/securite/garde.ts`, `src/lib/donnees/*.ts` (hors `pagination.ts`), `src/app/**/actions.ts`, `src/app/**/messages.ts`** — cette phase ne touche ni les gardes, ni les lectures, ni les écritures, ni les textes.
- **`src/app/comptes/ligne-compte.tsx` sur le fond** (D123) : ses Server Actions appelées hors `<form action>` sont **isolées et documentées**, jamais déplacées (Task 20).
- **`playwright.config.ts`, `playwright.prod.config.ts`, `vitest.config.ts`, `vitest.rls.config.ts`, `package.json`** — **aucune dépendance ajoutée**, aucune configuration de test touchée.

---

## Carte des décisions D106 à D127

| # | Réalisée par |
|---|---|
| D106 direction « Filiation », rail de filiation | Task 1 (jetons et classe de rail) ; Tasks 10, 17, 18, 21, 22 (les cinq sites légitimes, contrainte globale n°10) |
| D107 deux densités choisies par l'écran | Task 1 (les six jetons remappés) ; Tasks 17 (`/demandes`), 18 (`/evenements/a-traiter`), 20 (`/comptes`) |
| D108 jetons en propriétés CSS, aucun fichier JS de config | Task 1 ; preuve : `ls tailwind.config.*` rend « aucun fichier » |
| D109 la direction coûte UN fichier, zéro littéral dans les composants | Tasks 1 à 7 (écriture) ; Task 24 (preuve n°2, balayage avec contrôle positif) |
| D110 douze composants, et douze seulement | Tasks 2, 3, 4, 5, 6, 7 ; Task 24 (preuve : aucun treizième) |
| D111 `defaultValue` **impossible** | **Task 3**, étapes 4 à 6 — un fichier qui **doit** faire rougir `tsc`, puis est supprimé |
| D112 `onReset` porté par `Formulaire` | **Task 4**, étape 2 |
| D113 `Refus` reçoit le focus, mécanique reprise des deux formulaires modèles | **Task 4**, étapes 1 et 3 |
| D114 anneau de focus visible, `outline-none` remplacé | Task 1 (couche de base) ; Task 4 (les deux `outline-none` du dépôt) ; Task 24 (preuve n°7) |
| D115 trois points de rupture, listes en cartes sous `md` | Task 1 (`--breakpoint-*: initial` puis les trois) ; **Task 5** (`LigneListe`) |
| D116 aucun thème sombre, structure prête | Task 1 (retrait du bloc hérité, C3) |
| D117 aucun texte affiché modifié | contrainte globale n°5 ; **aucune déclaration dans ce plan** ; Task 24 (balayage) |
| D118 périmètre base vide | contrainte globale n°1 ; Task 24 (preuve n°1 sur la plage) |
| D119 les 128 + 10 preuves ne bougent pas | contrainte globale n°6 ; **exception unique déclarée en C1**, Task 15 |
| D120 socle d'abord, puis trois témoins | ordre imposé : Tasks 1-7, puis 8, 9, 10, puis **Task 11** (revue de dimensionnement) |
| D121 bornage de pagination extrait des six fichiers | **Task 6** (extraction + preuve unitaire) ; adoption Tasks 8, 17, 18, 19 |
| D122 `arborescence.tsx` scindé, deux barrières conservées et testées | **Task 10** ; preuve n°8 |
| D123 `ligne-compte.tsx` isolé et documenté, pas corrigé | **Task 20** |
| D124 quinze `window.confirm` → `Dialogue` | **Task 7** (le composant), **Task 13** (famille A, 10 sites), **Task 14** (famille B, 5 sites), **Task 15** (harnais) ; preuve n°4 |
| D125 `Dialogue` est le dixième, sans antécédent : preuves d'une autre nature | **Task 7** (comportements) ; **Task 15** (`tests/e2e/dialogue.spec.ts`) |
| D126 pastille **et** libellé, jamais l'un seul | **Task 5** (`EtatBadge`, rectifié par C4) ; adoption Tasks 8, 17, 20, 21, 23 |
| D127 les cinq écrans les plus lourds, chacun une tâche | `/arborescence` T10, `/membres/nouveau` T9, `/membres/[id]` T21, `/evenements/a-traiter` T18, `/comptes` T20 |

---

## L'ORDRE EST IMPOSÉ PAR D120 — ne pas le réarranger

**Tasks 1 à 7 : les douze composants et leurs preuves, AVANT tout écran migré.**
**Tasks 8, 9, 10 : les trois témoins**, et eux seuls — `/membres` (liste), `/membres/nouveau`
(formulaire dense), `/arborescence` (récursion).
**Task 11 : la revue de dimensionnement du socle.** Elle existe parce que D120 existe : si le
socle est mal dimensionné, ces trois-là le révèlent, et **c'est le seul moment de la phase où
corriger un composant coûte trois écrans au lieu de vingt**. Passer cette tâche pour « gagner
du temps » vide D120 de son contenu.
**Tasks 12 à 24 : les vingt-quatre écrans restants**, en familles.

---

## Les vingt-quatre tâches

| # | Titre |
|---|---|
| 1 | Les jetons, la coquille, l'anneau de focus et la densité — `globals.css` réécrit |
| 2 | `Bouton` et `EnTetePage` |
| 3 | `Champ`, `Selecteur`, `ZoneTexte` — et la compilation qui rougit (D111) |
| 4 | `Formulaire` et `Refus` — `onReset` et le focus au refus (D112, D113) |
| 5 | `Carte`, `LigneListe`, `EtatBadge` |
| 6 | `Pagination`, et le bornage extrait des six fichiers (D121) |
| 7 | `Dialogue` — `<dialog>` natif, focus piégé, `Échap`, restitution (D124, D125) |
| 8 | Témoin 1 — `/membres`, la liste |
| 9 | Témoin 2 — `/membres/nouveau`, le formulaire dense |
| 10 | Témoin 3 — `/arborescence`, la récursion scindée et ses deux barrières (D122) |
| 11 | Revue de dimensionnement du socle après les trois témoins (D120) |
| 12 | Les deux écrans publics — `/connexion` et `/inscription` |
| 13 | Les dix confirmations de famille A — boutons de soumission |
| 14 | Les cinq confirmations de famille B — handlers impératifs, et le défaut réel |
| 15 | Le harnais e2e du `Dialogue`, et les preuves neuves (exception C1 déclarée) |
| 16 | Les quatre catalogues basculables — `/antennes`, `/statuts`, `/evenements/types`, `/ael/calendriers` |
| 17 | Les listes paginées — `/evenements`, `/demandes` (compact), `/notifications` |
| 18 | `/evenements/a-traiter` — liste d'action en densité compacte |
| 19 | `/evenements/[id]` et sa liste de participants imbriquée |
| 20 | `/comptes` (compact, D123) et `/tokens` |
| 21 | `/membres/[id]` — la fiche dense et son rail de filiation |
| 22 | Les quatre satellites — `modifier`, `statuts`, `arbre`, `/antennes/[id]` |
| 23 | AEL — `/ael/seances` et `/ael/seances/[id]` |
| 24 | Le reste, et les neuf preuves de clôture |

---

# LOT A — LE SOCLE (Tasks 1 à 7)

---

### Task 1 : les jetons, la coquille, l'anneau de focus et la densité (D106, D107, D108, D109, D114, D115, D116)

**Fichiers :**
- Modifier : `src/app/globals.css` (**réécrit intégralement**, 27 lignes → environ 190)
- Modifier : `src/app/layout.tsx` (lignes 1-33 — retrait de `next/font/google`, classes de fond)
- Tester : `npx tsc --noEmit`, `npm run lint`, `npm run build`

**Interfaces :**
- Consomme : rien. C'est la première tâche de la phase.
- Produit, pour **toutes** les tâches suivantes :
  - **classes de couleur** : `bg-fond`, `bg-surface`, `text-encre`, `text-encre-attenuee`,
    `border-filet`, `divide-filet`, `border-bord-carte`, `bg-action`, `text-action`,
    `text-sur-action`, `text-filiation`, `border-filiation`, `text-etat-acquis`,
    `text-etat-attente`, `text-etat-refus`, `text-etat-neutre`, `bg-etat-acquis`,
    `bg-etat-attente`, `bg-etat-refus`, `bg-etat-neutre` ;
  - **classes de typographie** : `text-titre`, `text-section`, `text-corps`, `text-nom`,
    `text-petit` (chacune porte **sa taille ET sa graisse**) ;
  - **classes d'espacement** : `esp-1` … `esp-10` utilisables partout où Tailwind attend une
    valeur d'espacement (`p-esp-4`, `gap-esp-2`, `mt-esp-8`, `space-y-esp-3`, …) ;
  - **classe de rayon unique** : `rounded-bord`, activée à la Task 24 ;
  - **`size-pastille`** — hors des six jetons remappés par la densité (D126) ;
  - **utilitaires maison** : `cible-tactile`, `rail-filiation`, `chiffres-alignes`,
    `refus-focus` ;
  - **points de rupture** : `sm:`, `md:`, `lg:` — et **`xl:` / `2xl:` n'existent plus** ;
  - **l'attribut de densité** : `data-densite="compact"` sur un conteneur d'écran.

**Ce que cette tâche NE fait PAS.** Elle **ne touche aucun écran**. Les 70 fichiers `.tsx`
continuent d'employer `text-neutral-500`, `bg-neutral-900`, `rounded-md` : la palette par
défaut de Tailwind **reste en place pendant toute la phase**, et n'est retirée qu'à la
Task 24, quand plus personne ne s'en sert. Retirer les défauts ici ferait rougir les
vingt-sept écrans d'un coup, sans qu'aucun composant n'existe encore pour les remplacer.

**⚠️ DEUX AFFIRMATIONS DE LA CONCEPTION SONT FAUSSES ICI, ET CETTE TÂCHE LES CORRIGE.**

1. **§4.2 : « aucune police n'est chargée » — FAUX.** `src/app/layout.tsx:2` importe `Geist`
   et `Geist_Mono` de `next/font/google`, instanciées lignes 6-14. Elles sont téléchargées au
   build, préchargées à l'exécution, et **presque jamais employées** : `globals.css:25` pose
   `font-family: Arial, Helvetica, sans-serif` sur `body`, qui les écrase. Le seul usage réel
   est `font-mono`, sur trois `<code>` (`comptes/formulaire-compte.tsx:73`,
   `comptes/ligne-compte.tsx:284`, `tokens/formulaire-generation.tsx:95`). **Cette tâche les
   retire** et déclare une pile mono système en jeton, pour que ces trois `<code>` gardent une
   apparence de code.
2. **§4.3 : « rythme sur 4 px » — DÉJÀ VRAI, et cela change ce qu'il faut écrire.**
   `node_modules/tailwindcss/theme.css:325` pose `--spacing: 0.25rem`, soit 4 px : `p-1` vaut
   déjà 4 px, `p-2` 8 px, et ainsi de suite. Le rythme n'est pas à instaurer, il est à
   **nommer**, pour que D107 ait six jetons à remapper. `--spacing` n'est **pas** touché.

- [ ] **Étape 1 : réécrire `src/app/globals.css`**

Remplacer intégralement le contenu du fichier :

```css
/*
  ═══ LE SYSTÈME DE DESIGN « FILIATION » — PHASE 6, D106 À D116 ═══

  CE FICHIER EST LA SEULE SOURCE DE VÉRITÉ DU VOCABULAIRE VISUEL (D109). Aucun composant
  de `src/composants/` ne porte de valeur littérale : ni couleur, ni rayon, ni ombre, ni
  espacement de rythme, ni taille de police. Changer de direction visuelle coûte donc CE
  FICHIER, et lui seul — propriété vérifiable, pas intention (preuve n°2 du §7).

  AUCUN FICHIER DE CONFIGURATION JAVASCRIPT N'EXISTE (D108). Tailwind 4 lit sa
  configuration depuis le CSS. Un `tailwind.config.ts` ajouté « pour la forme »
  introduirait une seconde source de vérité pour les mêmes valeurs — la classe de défaut
  que ce projet combat sous le nom de CARTE FAUSSE TRANSMISE COMME ACQUISE, rencontrée
  trois fois sur la seule phase 5.

  DEUX NIVEAUX, ET C'EST DÉLIBÉRÉ :
    1. `:root` déclare les VALEURS. C'est le seul endroit où un hexadécimal figure.
    2. `@theme inline` expose ces valeurs à Tailwind SANS LES RECOPIER — `inline` fait que
       l'utilitaire émet `var(--fond)` et non `#F2F4F1`. C'est ce qui rend D107 (densité)
       et D116 (thème sombre futur) réalisables par une simple redéclaration en cascade,
       sans retoucher un seul composant. Sans `inline`, Tailwind figerait la valeur dans
       chaque utilitaire et la cascade n'aurait plus rien à surcharger.
*/

@import "tailwindcss";

/* ════════════════════════════════════════════════════════════════════════════
   1. LES VALEURS
   ════════════════════════════════════════════════════════════════════════════ */

:root {
  /*
    ── Couleur (§4.1). Les neutres portent un BIAIS VERT, choisi et non hérité : un gris
    pur jurerait avec le rail de filiation, qui est l'élément signature de la direction.
  */
  --fond: #F2F4F1;
  --surface: #FFFFFF;
  --encre: #1C2321;
  --encre-attenuee: #626F68;
  --filet: #DCE3DD;
  --bord-carte: #E3E9E3;
  --filiation: #7E9A86;
  --action: #2F5D46;
  --sur-action: #FFFFFF;

  /*
    ── Couleurs d'état, distinctes de `--action`, employées UNIQUEMENT en pastille (D126).
    `--etat-refus` sert AUSSI au texte des bandeaux de refus, où il est employé comme
    COULEUR DE TEXTE sur `--surface`, jamais comme fond.
  */
  --etat-acquis: #3F6B52;
  --etat-attente: #C08A2E;
  --etat-refus: #97402F;
  --etat-neutre: #7E9A86;

  /*
    ── Typographie (§4.2). AUCUNE POLICE N'EST CHARGÉE : la pile système est CHOISIE, pas
    subie. Charger une police introduirait un octet bloquant sur le premier rendu de chaque
    page pour un bénéfice esthétique. Les deux polices Google que `layout.tsx` chargeait
    (Geist, Geist Mono) ont été retirées par cette même tâche — elles étaient téléchargées,
    préchargées, et écrasées par un `font-family: Arial` posé trois lignes plus bas.
  */
  --pile-texte: "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, sans-serif;
  --pile-mono: ui-monospace, "Cascadia Mono", "Segoe UI Mono", Menlo, Consolas, monospace;

  /*
    ── Espacement. LE RYTHME DE 4 PX N'EST PAS À INSTAURER : `--spacing` vaut déjà
    0.25rem dans le thème par défaut de Tailwind 4 (`node_modules/tailwindcss/theme.css:325`),
    et `p-1` vaut donc déjà 4 px. Ce qui manque, ce sont des jetons NOMMÉS que D107 puisse
    remapper. Les voici — SIX, et six seulement, plus un plancher qui ne bouge jamais.
  */
  --esp-1: 0.25rem; /* 4 px — PLANCHER, hors des six, jamais remappé */
  --esp-2: 0.5rem; /* 8 px */
  --esp-3: 0.75rem; /* 12 px */
  --esp-4: 1rem; /* 16 px */
  --esp-6: 1.5rem; /* 24 px */
  --esp-8: 2rem; /* 32 px */
  --esp-10: 2.5rem; /* 40 px */

  /*
    ── Rayon UNIQUE : 4 px (§4.3). L'inventaire relève `rounded-md` 126 fois, `rounded` nu
    4 fois et `rounded-full` 2 fois, sans qu'aucune de ces valeurs ne porte de sens
    différent. Une seule survit, et la classe `rounded-bord` est la seule que ce fichier
    expose (voir le reset de namespace plus bas).
  */
  --rayon: 0.25rem;

  /*
    ── Cible tactile : 44 PX DE HAUTEUR MINIMALE pour tout élément interactif, y compris
    les chevrons de dépliage de l'arbre. C'est la contrainte qui coûte des lignes visibles,
    et c'est ELLE que la densité compacte (D107) NE TOUCHE PAS : une cible tactile réduite
    serait une régression d'accessibilité déguisée en densité.
  */
  --cible-tactile: 2.75rem;

  /*
    ── Le rail de filiation : un bord gauche de 2 px, avec un retrait de 0.9 rem. Il marque
    la PROFONDEUR et le LIEN DE DISCIPULAT — il porte une information vraie, il n'est pas
    une décoration. NE JAMAIS le poser là où aucune relation n'existe (piège n°6 : le rail
    ne doit pas mentir). L'annuaire `/membres` n'en porte pas : il affiche antenne, ville
    et situation, jamais un faiseur de disciple.
  */
  --rail-epaisseur: 2px;
  --rail-retrait: 0.9rem;

  /*
    ── Le diametre de la pastille d'etat (D126). UN JETON A LUI, ET PAS `--esp-2`.

    Une pastille n'est pas de l'espacement : si elle empruntait un des six jetons remappes
    par la densite compacte (D107), elle RETRECIRAIT sur `/comptes`, `/demandes` et
    `/evenements/a-traiter` — c'est-a-dire sur les trois ecrans ou le reperage par la
    couleur a justifie la densite. La conception est explicite : la densite compacte ne
    remappe QUE des jetons d'espacement.
  */
  --pastille-taille: 0.5rem;

  /*
    ── L'anneau de focus (D114). ZÉRO CLASSE DE FOCUS DANS TOUT LE DÉPÔT aujourd'hui : le
    focus repose entièrement sur le défaut du navigateur, et les deux `outline-none` du
    dépôt le suppriment sans rien mettre à la place. Ce n'est pas une préférence
    esthétique : c'est la seule chose qui rend l'application utilisable au clavier, et elle
    est absente.
  */
  --anneau-focus: #2F5D46;
  --anneau-focus-epaisseur: 2px;
  --anneau-focus-retrait: 2px;
}

/*
  ── DENSITÉ COMPACTE (D107). SIX JETONS D'ESPACEMENT, ET SIX SEULEMENT.

  Ni la couleur, ni la typographie, ni le rayon, ni `--esp-1`, ni `--cible-tactile` ne
  changent. C'est un attribut posé PAR L'ÉCRAN, jamais un réglage : aucune persistance,
  aucune synchronisation entre onglets, aucun défaut à justifier, aucun axe de test
  supplémentaire sur les vingt-sept écrans. La bonne densité est une propriété de la
  TÂCHE, pas de la personne.

  ÉCRANS CONCERNÉS, ET EUX SEULS : `/comptes`, `/evenements/a-traiter`, `/demandes`.
*/
[data-densite="compact"] {
  --esp-2: 0.25rem;
  --esp-3: 0.5rem;
  --esp-4: 0.75rem;
  --esp-6: 1rem;
  --esp-8: 1.5rem;
  --esp-10: 2rem;
}

/* ════════════════════════════════════════════════════════════════════════════
   2. L'EXPOSITION À TAILWIND
   ════════════════════════════════════════════════════════════════════════════ */

@theme inline {
  --color-fond: var(--fond);
  --color-surface: var(--surface);
  --color-encre: var(--encre);
  --color-encre-attenuee: var(--encre-attenuee);
  --color-filet: var(--filet);
  --color-bord-carte: var(--bord-carte);
  --color-filiation: var(--filiation);
  --color-action: var(--action);
  --color-sur-action: var(--sur-action);
  --color-etat-acquis: var(--etat-acquis);
  --color-etat-attente: var(--etat-attente);
  --color-etat-refus: var(--etat-refus);
  --color-etat-neutre: var(--etat-neutre);

  --font-sans: var(--pile-texte);
  --font-mono: var(--pile-mono);

  /*
    Cinq degrés et pas un de plus (§4.2). L'inventaire relève 28 `<h1>` dont 26 partagent
    déjà le même style, 25 `<h2>` uniformes, et un unique `<h3>` que RIEN ne distingue
    visuellement d'une étiquette de champ. Chaque degré porte SA TAILLE ET SA GRAISSE :
    `text-titre` suffit, il n'y a plus de `font-semibold` à ne pas oublier.
  */
  --text-titre: 1.5rem;
  --text-titre--font-weight: 650;
  --text-titre--line-height: 1.25;
  --text-section: 1.125rem;
  --text-section--font-weight: 650;
  --text-section--line-height: 1.35;
  --text-corps: 1rem;
  --text-corps--font-weight: 400;
  --text-corps--line-height: 1.5;
  --text-nom: 0.95rem;
  --text-nom--font-weight: 600;
  --text-nom--line-height: 1.4;
  --text-petit: 0.85rem;
  --text-petit--font-weight: 400;
  --text-petit--line-height: 1.45;

  /* Hors des six jetons remappes par la densite : voir `--pastille-taille`. */
  --spacing-pastille: var(--pastille-taille);

  --spacing-esp-1: var(--esp-1);
  --spacing-esp-2: var(--esp-2);
  --spacing-esp-3: var(--esp-3);
  --spacing-esp-4: var(--esp-4);
  --spacing-esp-6: var(--esp-6);
  --spacing-esp-8: var(--esp-8);
  --spacing-esp-10: var(--esp-10);

  /*
    RESET DE NAMESPACE, PUIS UNE SEULE VALEUR. `--radius-*: initial` supprime `rounded-xs`,
    `rounded-sm`, `rounded-md`, `rounded-lg`, `rounded-xl`, `rounded-2xl`… du thème. Seule
    `rounded-bord` subsiste. Un rayon divergent devient donc IMPOSSIBLE À ÉCRIRE, et non
    « déconseillé » — même mécanique que D111 sur `defaultValue`.

    ⚠️ CE RESET CASSE LES 126 `rounded-md` DES ÉCRANS NON ENCORE MIGRÉS. Il est donc posé
    à la TASK 24, pas ici. Les deux lignes ci-dessous restent COMMENTÉES jusque-là, avec
    ce commentaire, pour que la Task 24 n'ait qu'à les décommenter.
  */
  /* --radius-*: initial; */
  /* --radius-bord: var(--rayon); */

  /*
    TROIS POINTS DE RUPTURE RÉELS (D115), et les autres n'existent plus. Le §3 de la
    spécification maîtresse promet « mobile d'abord » depuis le premier jour ; le dépôt
    compte QUATRE usages de point de rupture, tous en `sm:`, tous pour le même motif de
    grille à deux colonnes. `md:`, `lg:`, `xl:`, `2xl:` sont à zéro.

    Le reset `--breakpoint-*: initial` fait qu'un `xl:` écrit par distraction ne produit
    AUCUNE classe — il ne « marche pas discrètement autrement », il n'existe pas. Les trois
    valeurs redéclarées sont exactement celles du thème par défaut
    (`node_modules/tailwindcss/theme.css:327-329`) : aucun écran existant ne change de
    comportement.
  */
  --breakpoint-*: initial;
  --breakpoint-sm: 40rem;
  --breakpoint-md: 48rem;
  --breakpoint-lg: 64rem;
}

/* ════════════════════════════════════════════════════════════════════════════
   3. LA COUCHE DE BASE
   ════════════════════════════════════════════════════════════════════════════ */

@layer base {
  body {
    background-color: var(--fond);
    color: var(--encre);
    font-family: var(--pile-texte);
  }

  /*
    ═══ D114 — L'ANNEAU DE FOCUS EST DÉFINI ICI, UNE FOIS, ET NULLE PART AILLEURS ═══

    `:focus-visible` et non `:focus` : le halo n'apparaît que lorsque le navigateur juge
    que l'utilisateur navigue au clavier. Un `:focus` nu ferait apparaître un anneau à
    chaque clic de souris sur un bouton, ce qui a historiquement poussé des équipes à
    écrire `outline: none` — c'est-à-dire à recréer exactement le défaut que cette règle
    corrige.

    `outline` et non `box-shadow` : l'outline suit la forme réelle de l'élément, ne
    participe pas au flux, et survit à `overflow: hidden`.

    À PARTIR D'ICI, `outline-none` SANS REMPLACEMENT VISIBLE EST UN DÉFAUT DE REVUE.
  */
  :focus-visible {
    outline: var(--anneau-focus-epaisseur) solid var(--anneau-focus);
    outline-offset: var(--anneau-focus-retrait);
  }

  /*
    §9 — AUCUNE ANIMATION, hors les transitions d'état des composants interactifs, et
    celles-ci s'effacent sous `prefers-reduced-motion`.
  */
  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   4. LES QUATRE UTILITAIRES MAISON
   ════════════════════════════════════════════════════════════════════════════ */

/*
  44 px de hauteur minimale (§4.3). `inline-flex` + `align-items: center` parce qu'une
  simple `min-height` sur un `<button>` centre mal son texte selon le navigateur.
*/
@utility cible-tactile {
  min-height: var(--cible-tactile);
  display: inline-flex;
  align-items: center;
}

/*
  ═══ LE RAIL DE FILIATION — L'ÉLÉMENT SIGNATURE (D106) ═══

  Un bord gauche de 2 px en `--filiation`, avec un retrait. IL PORTE UNE INFORMATION VRAIE :
  la profondeur dans l'arbre, ou l'existence d'un lien de discipulat affiché. S'il apparaît
  là où aucune relation n'existe, il devient une décoration qui AFFIRME QUELQUE CHOSE DE
  FAUX — la forme de défaut la plus coûteuse de ce projet (piège n°6).

  Les cinq seuls sites légitimes, vérifiés dans le code le 2026-08-16 :
    - `/arborescence`, chaque nœud (profondeur) ;
    - `/membres/[id]`, lignes « Faiseur de disciple » et « Dirigeant », section
      « Disciples actifs » ;
    - `/membres/[id]/arbre`, le formulaire de rattachement ;
    - `/demandes`, le champ « Dirigeant proposé » de `FormulaireValidationSuivi` ;
    - `/evenements/a-traiter`, le sélecteur de faiseur de disciple.
*/
@utility rail-filiation {
  border-left: var(--rail-epaisseur) solid var(--filiation);
  padding-left: var(--rail-retrait);
}

/*
  §4.2 — `tabular-nums` PARTOUT OÙ DES CHIFFRES S'ALIGNENT : pagination, décomptes, dates.
  Posé par utilitaire sur les seuls conteneurs concernés, jamais en global, où il
  déformerait le texte courant.
*/
@utility chiffres-alignes {
  font-variant-numeric: tabular-nums;
}

/*
  ═══ D113 — LE REMPLACEMENT DE `outline-none`, PAS SON RETRAIT ═══

  Le bandeau de refus reçoit le focus PROGRAMMATIQUEMENT (`element.focus()`), sur un
  élément non interactif portant `tabIndex={-1}`. Or `:focus-visible` ne se déclenche PAS
  de façon fiable sur un focus programmatique appliqué à un élément non interactif : les
  navigateurs y appliquent leur propre heuristique, fondée sur la dernière modalité
  d'interaction. S'en remettre à `:focus-visible` ici, c'est laisser au navigateur le soin
  de décider si l'utilisateur voit ou non où le focus vient d'atterrir.

  D'où une règle `:focus` NUE, explicite, réservée à ce seul cas : quand le focus arrive
  sur un refus, il se voit, toujours. C'est ce que les deux `outline-none` du dépôt
  (`inscription/formulaire-inscription.tsx:230`, `membres/formulaire-membre.tsx:275`)
  retiraient sans rien mettre à la place.
*/
@utility refus-focus {
  &:focus {
    outline: var(--anneau-focus-epaisseur) solid var(--etat-refus);
    outline-offset: var(--anneau-focus-retrait);
  }
}
```

**Ce qui a DISPARU du fichier, et pourquoi :**

| Ligne d'origine | Sort | Raison |
|---|---|---|
| `--background`, `--foreground` | supprimées | remplacées par `--fond` et `--encre` ; la seule lecture était `body`, réécrit ici |
| `@media (prefers-color-scheme: dark)` (L15-20) | **supprimé** | D116, et **C3** : ce bloc hérité de `create-next-app` est déjà actif en production et déjà cassé — sur un système en thème sombre, `bg-neutral-900 text-white` (27 boutons) devient quasi invisible et `text-neutral-500` (83 usages) tombe sous tout seuil de contraste. Ce n'est pas une abstention, c'est un **retrait**. La structure en deux niveaux rend un vrai thème sombre futur réalisable par un unique bloc `:root[data-theme="sombre"]`, **sans toucher un seul composant** |
| `--font-geist-sans` / `--font-geist-mono` | supprimées | C2 — les polices sont retirées de `layout.tsx` à l'étape 2 |
| `font-family: Arial, Helvetica, sans-serif` | remplacé | par `var(--pile-texte)` |

- [ ] **Étape 2 : `src/app/layout.tsx` — retirer les deux polices Google**

Remplacer intégralement :

```tsx
import type { Metadata } from 'next'
import { Cloche } from './notifications/cloche'
import './globals.css'

export const metadata: Metadata = {
  title: 'Suivi Asonkeng',
  description: "Application de suivi des jeunes croyants de l'équipe Asonkeng.",
}

/*
  ═══ AUCUNE POLICE N'EST CHARGÉE (§4.2), ET C'EST UN RETRAIT, PAS UNE ABSTENTION ═══

  Ce fichier importait `Geist` et `Geist_Mono` de `next/font/google` et les instanciait en
  variables CSS. Les deux polices étaient RÉELLEMENT téléchargées, auto-hébergées au build
  et préchargées à l'exécution — pour un bénéfice qui n'existait pas : `globals.css` posait
  `font-family: Arial, Helvetica, sans-serif` sur `body`, ce qui écrasait `--font-geist-sans`
  pour la totalité du document. Le seul usage réel de la famille était `font-mono`, sur
  TROIS balises `<code>` (`comptes/formulaire-compte.tsx:73`, `comptes/ligne-compte.tsx:284`,
  `tokens/formulaire-generation.tsx:95`), qui retombent désormais sur la pile mono système
  déclarée en jeton.

  La pile système est CHOISIE, pas subie : charger une police introduirait un octet
  bloquant sur le premier rendu de CHAQUE page pour un bénéfice esthétique.

  `bg-fond text-encre` sont posés ici et pas seulement dans la couche de base de
  `globals.css` : `body` porte déjà `min-h-full flex flex-col`, et rassembler les quatre au
  même endroit évite qu'un lecteur cherche le fond de page dans deux fichiers.
*/
export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-fond text-encre">
        <Cloche />
        {children}
      </body>
    </html>
  )
}
```

**`<html lang="fr">` est conservé** (`layout.tsx:24` d'origine) : c'est un repère
d'accessibilité correct et cette phase n'y touche pas.

- [ ] **Étape 3 : vérifier que la palette par défaut est TOUJOURS là**

Le socle doit pouvoir cohabiter avec vingt-sept écrans non migrés pendant toute la phase.

```bash
npm run build
```

Attendu : **build vert**. Si un écran rougit ici, c'est que le reset de namespace a été posé
trop tôt — les deux lignes `--radius-*` doivent être **commentées** à ce stade.

- [ ] **Étape 4 : vérifier que les trois points de rupture existent et que les deux autres n'existent plus**

Créer un fichier témoin **temporaire** `src/app/temoin-rupture.tsx` :

```tsx
export function TemoinRupture() {
  return <div className="hidden sm:block md:flex lg:grid xl:inline 2xl:table" />
}
```

Puis, après un `npm run build` :

```bash
grep -rn "xl.inline" $(find .next/static -name "*.css") | wc -l
grep -rn "2xl.table" $(find .next/static -name "*.css") | wc -l
```

Attendu : **0** et **0**. Contrôle positif **obligatoire**, dans la même session — sans lui,
un zéro ne prouve rien (une mesure vraie à vide a déjà été produite dans ce projet) :

```bash
grep -rn "sm.block" $(find .next/static -name "*.css") | wc -l
grep -rn "lg.grid" $(find .next/static -name "*.css") | wc -l
```

Attendu : **au moins 1** et **au moins 1**. Si l'un des deux rend zéro, la commande est
cassée et les zéros précédents ne valent rien.

- [ ] **Étape 5 : supprimer le fichier témoin**

```bash
rm src/app/temoin-rupture.tsx
npx tsc --noEmit && npm run lint
```

- [ ] **Étape 6 : vérifier qu'aucun fichier de configuration JavaScript n'existe (D108)**

```bash
ls tailwind.config.js tailwind.config.ts tailwind.config.mjs tailwind.config.cjs 2>/dev/null | wc -l
```

Attendu : **0**.

- [ ] **Étape 7 : les portes, puis le commit**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls
```

```bash
git add src/app/globals.css src/app/layout.tsx
git commit -m "feat(ui): poser les jetons Filiation, l'anneau de focus et la densite compacte" -m "Reecrit globals.css en deux niveaux : les valeurs dans :root, l'exposition a Tailwind par @theme inline. L'indirection est ce qui rend D107 (densite) et D116 (theme sombre futur) realisables sans retoucher un composant." -m "Retire les deux polices Google de layout.tsx (§4.2) : elles etaient telechargees et prechargees, puis ecrasees par un font-family: Arial pose dans globals.css. Seul font-mono les employait, sur trois balises <code>." -m "Retire le bloc prefers-color-scheme: dark herite de create-next-app (D116) : il etait actif en production et deja casse — bg-neutral-900 + text-white y devenait quasi invisible sur fond quasi noir." -m "Trois points de rupture reels (D115) : --breakpoint-*: initial puis sm, md, lg. xl: et 2xl: ne produisent plus aucune classe, ce qui rend leur usage impossible plutot que deconseille." -m "La palette Tailwind par defaut RESTE en place : les vingt-sept ecrans non migres l'emploient encore. Son retrait est la Task 24." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2 : `Bouton` et `EnTetePage` (D109, D110, D114)

**Fichiers :**
- Créer : `src/composants/ui/bouton.tsx`
- Créer : `src/composants/ui/en-tete-page.tsx`
- Tester : `npx tsc --noEmit`, `npm run lint`

**Interfaces :**
- Consomme : les jetons de la Task 1 — `bg-action`, `text-sur-action`, `border-bord-carte`,
  `text-etat-refus`, `text-petit`, `text-titre`, `text-corps`, `p-esp-*`, `cible-tactile`.
- Produit, pour les Tasks 8 à 24 :

```ts
// src/composants/ui/bouton.tsx
export type VarianteBouton = 'principal' | 'secondaire' | 'lien' | 'lien-danger' | 'bordure-danger'
export type ProprietesBouton = Omit<
  React.ComponentPropsWithoutRef<'button'>,
  'className' | 'style' | 'children'
> & {
  variante?: VarianteBouton   // defaut : 'principal'
  enCours?: boolean
  libelleAttente?: string
  alignement?: 'auto' | 'debut'   // defaut : 'auto' — 'debut' rend `self-start`
  ref?: React.Ref<HTMLButtonElement>
  children: React.ReactNode
}
export function Bouton(proprietes: ProprietesBouton): React.JSX.Element
export const CLASSES_VARIANTE: Record<VarianteBouton, string>

// src/composants/ui/en-tete-page.tsx
export type ProprietesEnTetePage = {
  titre: string
  retour?: { href: string; libelle: string }
  soustitre?: React.ReactNode
  action?: React.ReactNode
}
export function EnTetePage(proprietes: ProprietesEnTetePage): React.JSX.Element
```

**Aucun des deux n'est un composant client.** Ni `'use client'` ni hook : la coloration et la
mise en page n'exigent pas d'état. Un fichier sans `'use client'` importé depuis un composant
client est **inclus dans le paquet client de celui-ci** — c'est le fonctionnement normal des
frontières React Server Components, et c'est pourquoi `Bouton` peut porter un `onClick` chez
ses appelants clients (`ael/seances/bouton-generer.tsx`, `tokens/ligne-token.tsx`, …) sans
que ce fichier ait besoin de la directive. **En revanche, un composant SERVEUR ne doit jamais
lui passer `onClick`** — aucun ne le fait aujourd'hui.

**⚠️ AUCUNE PROP `className` (D109).** Une échappatoire de style recrée en un mois le désordre
que la phase corrige : six formulations du bouton principal, mesurées dans l'inventaire. Les
variations légitimes sont **énumérées**, jamais libres. `style` est retiré du type pour la
même raison — le dépôt ne compte que deux `style={{ }}`, tous deux dans `arborescence.tsx`, et
la Task 10 les traite nommément.

- [ ] **Étape 1 : `src/composants/ui/bouton.tsx`**

```tsx
import type { ComponentPropsWithoutRef, ReactNode, Ref } from 'react'

/*
  ═══ UN BOUTON, ET CINQ VARIANTES ÉNUMÉRÉES ═══

  L'inventaire relève 60 `<button>` et AU MOINS SIX FORMULATIONS DISTINCTES pour ce qui
  devrait être un seul bouton principal — mêmes rôles, classes divergentes selon le
  fichier. Décompte exact des chaînes de classe, mesuré le 2026-08-16 :

    "rounded-md bg-neutral-900 px-4 py-2 text-white disabled:opacity-50"                     7x
    "self-start rounded-md bg-neutral-900 px-4 py-2 font-medium text-white ..."              6x
    "self-start rounded-md bg-neutral-900 px-4 py-2 text-white disabled:opacity-50"          3x
    "self-start rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white ..."      3x
    "self-start rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white ..."                3x
    "rounded-md bg-neutral-900 px-4 py-2 font-medium text-white disabled:opacity-50"         2x

  `text-sm` présent ou non, `font-medium` présent ou non, `self-start` présent ou non,
  padding `px-4 py-2` ou `px-3 py-1.5`. Aucune de ces divergences ne porte de sens : ce
  sont des recopies imparfaites. UNE SEULE forme survit ici, et `self-start` — la seule
  divergence qui portait vraiment une intention de mise en page — devient la prop
  `alignement`.
*/
export type VarianteBouton =
  | 'principal'
  | 'secondaire'
  | 'lien'
  | 'lien-danger'
  | 'bordure-danger'

export type ProprietesBouton = Omit<
  ComponentPropsWithoutRef<'button'>,
  'className' | 'style' | 'children'
> & {
  variante?: VarianteBouton
  /**
   * Attente en cours. Désactive le bouton ET bascule son libellé vers `libelleAttente`.
   *
   * CONVENTION REPRISE TELLE QUELLE, PAS INVENTÉE : le dépôt compte 39 `disabled={enCours}`
   * et 38 libellés au participe présent suivi de « … » (`Enregistrement…`, `Envoi…`,
   * `Création…`, `Connexion…`, `Génération…`). C'est le motif le plus homogène du dépôt
   * après la classe de champ. Ce composant l'ABSORBE ; il ne le remplace pas, et surtout
   * il ne change AUCUN de ces 38 libellés (D117).
   */
  enCours?: boolean
  libelleAttente?: string
  /**
   * `'debut'` rend `self-start` — le bouton ne s'étire pas à la largeur de son conteneur
   * flex. C'est la seule des quatre divergences mesurées qui exprimait une intention de
   * mise en page, et non une recopie imparfaite : elle est donc conservée, mais NOMMÉE.
   */
  alignement?: 'auto' | 'debut'
  /**
   * `ComponentPropsWithoutRef` n'inclut PAS `ref` : il faut le redéclarer. En React 19,
   * `ref` est une propriété ordinaire d'un composant fonction — aucun `forwardRef`.
   *
   * NÉCESSAIRE, ET PAS PAR SYMÉTRIE : les dix boutons de confirmation de la Task 13 ont
   * besoin de l'élément DOM pour appeler `bouton.form?.requestSubmit(bouton)` après la
   * confirmation du dialogue. Sans cette prop, ils devraient sortir de `Bouton`.
   */
  ref?: Ref<HTMLButtonElement>
  children: ReactNode
}

/*
  Les classes sont des CONSTANTES LITTÉRALES et non des chaînes construites : Tailwind
  balaye le source à la recherche de noms de classe complets. `bg-${couleur}` ne produirait
  aucune règle, et le bouton sortirait sans fond — piège classique, et silencieux.

  AUCUNE VALEUR LITTÉRALE ICI (D109) : tout passe par un jeton de `globals.css`. Un
  balayage refusant toute couleur littérale sous `src/composants/` est la preuve n°2 du §7.
*/
/**
 * EXPORTÉE, et c'est délibéré : plusieurs écrans rendent un `<Link>` STYLÉ EN BOUTON —
 * `membres/page.tsx:79-84` (« Nouveau membre »), `evenements/page.tsx`, `ael/seances/page.tsx`.
 * Ce sont des NAVIGATIONS, pas des actions : les forcer dans un `<button>` leur retirerait
 * le clic-milieu, le « ouvrir dans un nouvel onglet » et l'adresse au survol.
 *
 * Ces écrans écrivent donc `<Link className={CLASSES_VARIANTE.principal}>`, et non une
 * recopie des classes. C'est la seule façon de garder UNE source de vérité sans créer un
 * treizième composant `LienBouton` — que D110 exclut, et qui dériverait de celui-ci au
 * premier ajustement.
 */
export const CLASSES_VARIANTE: Record<VarianteBouton, string> = {
  principal:
    'cible-tactile justify-center gap-esp-2 rounded-bord bg-action px-esp-4 py-esp-2 text-corps text-sur-action disabled:opacity-50',
  secondaire:
    'cible-tactile justify-center gap-esp-2 rounded-bord border border-bord-carte bg-surface px-esp-4 py-esp-2 text-corps text-encre disabled:opacity-50',
  lien: 'cible-tactile text-petit text-action underline underline-offset-4 disabled:no-underline disabled:opacity-50',
  'lien-danger':
    'cible-tactile text-petit text-etat-refus underline underline-offset-4 disabled:no-underline disabled:opacity-50',
  /*
    UN SEUL bouton du dépôt porte cette forme — `demandes/ligne-demande-admin.tsx:186`,
    « Rejeter la demande » (`rounded-md border border-red-300 px-3 py-1.5 text-sm
    text-red-600 disabled:opacity-50`). L'inventaire du vocabulaire le situe à
    `comptes/ligne-compte.tsx:254`, ce qui est FAUX : cette ligne-là porte une bordure
    neutre. Vérifié le 2026-08-16 par `grep -rn "border-red" src --include="*.tsx"`, qui
    rend exactement une ligne.

    Une variante à un seul appelant est normalement un composant qui dérive (D110). Elle
    survit ici parce qu'elle est une VARIANTE d'un composant à soixante appelants, pas un
    composant à part : le coût marginal est une entrée dans ce Record.
  */
  'bordure-danger':
    'cible-tactile justify-center gap-esp-2 rounded-bord border border-etat-refus bg-surface px-esp-4 py-esp-2 text-petit text-etat-refus disabled:opacity-50',
}

export function Bouton({
  variante = 'principal',
  enCours = false,
  libelleAttente,
  alignement = 'auto',
  ref,
  children,
  disabled,
  type = 'button',
  ...reste
}: ProprietesBouton) {
  /*
    `disabled || enCours`, jamais `disabled ?? enCours` : un appelant qui passe
    explicitement `disabled={false}` alors qu'une soumission est en cours obtiendrait
    sinon un bouton ACTIF pendant l'envoi, et deux soumissions au lieu d'une.
  */
  const inactif = disabled === true || enCours

  /*
    `type = 'button'` PAR DÉFAUT, alors que le défaut HTML est `submit`. Ce dépôt compte
    plus de boutons hors formulaire (bascules, dépliages, révocations pilotées par
    `useTransition`) que de boutons de soumission, et un `type` oublié dans un `<form>`
    soumet le formulaire sans que rien ne le dise. Les boutons de soumission écrivent
    `type="submit"` — explicitement, ce qui est de toute façon le cas dans les 60 boutons
    existants.
  */
  return (
    <button
      {...reste}
      ref={ref}
      type={type}
      disabled={inactif}
      className={`${CLASSES_VARIANTE[variante]}${alignement === 'debut' ? ' self-start' : ''}`}
    >
      {enCours && libelleAttente ? libelleAttente : children}
    </button>
  )
}
```

- [ ] **Étape 2 : `src/composants/ui/en-tete-page.tsx`**

```tsx
import Link from 'next/link'
import type { ReactNode } from 'react'

/*
  ═══ 28 `<h1>`, 26 DU MÊME STYLE, ET SIX MARGES DIFFÉRENTES ═══

  Relevé exact du 2026-08-16 (`grep -rn "<h1" src --include="*.tsx"`) :

    mt-4 mb-8 text-2xl font-semibold   7 fichiers
    mt-4 mb-2 text-2xl font-semibold   6 fichiers
    (aucune marge) text-2xl font-semibold   8 fichiers
    mb-1 text-2xl font-semibold        3 fichiers
    mt-4 mb-6 text-2xl font-semibold   1 fichier
    mt-4 text-2xl font-semibold        1 fichier
    text-xl font-semibold              2 fichiers — LES DEUX EXCEPTIONS DE TAILLE

  Les deux exceptions de taille sont `src/app/error.tsx:6` et `src/app/not-found.tsx:6` —
  l'inventaire du vocabulaire les signalait sans les localiser ; elles le sont ici.

  Rien ne distingue ces six marges : ce sont des recopies imparfaites. UNE SEULE survit.

  IL N'EXISTE AUCUNE BARRE DE NAVIGATION, AUCUN MENU, AUCUN FIL D'ARIANE DANS CE PROJET
  (inventaire des écrans, §2). La navigation passe par un lien de retour explicite en haut
  de chaque page — présent SYSTÉMATIQUEMENT, mais réécrit à la main dans chaque fichier.
  C'est ce lien que la prop `retour` factorise, et rien de plus : ce composant ne crée NI
  fil d'Ariane, NI barre de navigation, qui n'existent nulle part et que D110 exclut
  explicitement (« le fil d'Ariane n'existe que sur un écran »).

  LE LIBELLÉ DU LIEN DE RETOUR EST FOURNI PAR L'APPELANT, jamais déduit de `href` : les
  écrans disent « Retour au tableau de bord », « Retour à l'annuaire », « Retour aux
  évènements », « Retour à la séance ». Les déduire changerait un texte affiché (D117).
*/
export type ProprietesEnTetePage = {
  titre: string
  retour?: { href: string; libelle: string }
  soustitre?: ReactNode
  action?: ReactNode
}

export function EnTetePage({ titre, retour, soustitre, action }: ProprietesEnTetePage) {
  return (
    <header className="mb-esp-8 flex flex-col gap-esp-2">
      {retour ? (
        <Link
          href={retour.href}
          className="cible-tactile self-start text-petit text-action underline underline-offset-4"
        >
          {retour.libelle}
        </Link>
      ) : null}

      {/*
        `md:` et non `sm:` : sous 48 rem, le titre et son action s'empilent. C'est la
        bascule que D115 généralise, et l'en-tête en est le premier consommateur — les
        écrans où l'action de tête est longue (« Nouveau membre », « Participants à
        traiter ») la voyaient jusqu'ici s'enrouler au milieu du titre par `flex-wrap`.
      */}
      <div className="flex flex-col gap-esp-2 md:flex-row md:items-baseline md:justify-between md:gap-esp-4">
        <div className="flex flex-col gap-esp-1">
          <h1 className="text-titre">{titre}</h1>
          {soustitre ? (
            <p className="chiffres-alignes text-petit text-encre-attenuee">{soustitre}</p>
          ) : null}
        </div>
        {action ?? null}
      </div>
    </header>
  )
}
```

**`chiffres-alignes` sur le sous-titre** : c'est là que vivent les décomptes (« 42 membres ·
page 2 sur 5 », « 7 personnes »), et §4.2 demande `tabular-nums` partout où des chiffres
s'alignent.

- [ ] **Étape 3 : vérifier qu'aucune valeur littérale n'a été introduite (D109, preuve n°2)**

**Le contrôle positif D'ABORD** — une mesure vraie à vide a déjà été produite dans ce projet
par un `grep` dont l'échappement ne se développait pas :

```bash
printf 'const a = "#ABCDEF"\nconst b = "text-red-600"\n' > /tmp/temoin-couleur.tsx
grep -rEn "#[0-9a-fA-F]{3,8}|(bg|text|border|ring|divide)-(red|amber|green|blue|neutral|gray|slate|zinc|stone|white|black)(-[0-9]{2,3})?" /tmp/temoin-couleur.tsx | wc -l
```

Attendu : **2**. Si la commande rend 0, elle est cassée et son zéro sur `src/composants/` ne
prouverait rien.

```bash
grep -rEn "#[0-9a-fA-F]{3,8}|(bg|text|border|ring|divide)-(red|amber|green|blue|neutral|gray|slate|zinc|stone|white|black)(-[0-9]{2,3})?" src/composants/ | wc -l
```

Attendu : **0**.

- [ ] **Étape 4 : les portes, puis le commit**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls
```

```bash
git add src/composants/ui/bouton.tsx src/composants/ui/en-tete-page.tsx
git commit -m "feat(ui): Bouton et EnTetePage, les deux motifs les plus repandus" -m "Bouton absorbe les six formulations divergentes du bouton principal mesurees dans l'inventaire (60 <button> au total), avec cinq variantes ENUMEREES et aucune prop className : une echappatoire de style recreerait en un mois le desordre que la phase corrige (D109)." -m "La variante bordure-danger a un seul appelant, demandes/ligne-demande-admin.tsx:186. L'inventaire du vocabulaire le situait a comptes/ligne-compte.tsx:254, ce qui est faux : cette ligne porte une bordure neutre. Verifie par grep -rn border-red, qui rend exactement une ligne." -m "EnTetePage absorbe les 28 <h1> et leurs six variantes de marge. Les deux exceptions de taille (text-xl) sont src/app/error.tsx:6 et src/app/not-found.tsx:6, que l'inventaire signalait sans les localiser." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3 : `Champ`, `Selecteur`, `ZoneTexte` — et la compilation qui rougit (D110, **D111**)

**Fichiers :**
- Créer : `src/composants/ui/champ.tsx`
- Créer : `src/composants/ui/selecteur.tsx`
- Créer : `src/composants/ui/zone-texte.tsx`
- Créer **puis SUPPRIMER** : `src/composants/ui/preuve-defaultvalue.tsx`
- Tester : `npx tsc --noEmit` — **deux fois : une fois en attendant qu'il ROUGISSE, une fois en attendant qu'il verdisse**

**Interfaces :**
- Consomme : les jetons de la Task 1.
- Produit, pour les Tasks 9, 12, 16 à 24 :

```ts
export type LargeurChamp = 'pleine' | 'flexible' | 'etroite'

export type ProprietesChamp = Omit<
  React.ComponentPropsWithoutRef<'input'>,
  'className' | 'style' | 'value' | 'onChange' | 'defaultValue' | 'defaultChecked'
> & {
  label: string
  value: string
  onChange: (evenement: React.ChangeEvent<HTMLInputElement>) => void
  aide?: string
  largeur?: LargeurChamp        // defaut : 'pleine'
  defaultValue?: never
  defaultChecked?: never
}
export function Champ(proprietes: ProprietesChamp): React.JSX.Element

export type OptionSelecteur = { valeur: string; libelle: string }
export type ProprietesSelecteur = Omit<
  React.ComponentPropsWithoutRef<'select'>,
  'className' | 'style' | 'value' | 'onChange' | 'defaultValue' | 'children'
> & {
  label: string
  value: string
  onChange: (evenement: React.ChangeEvent<HTMLSelectElement>) => void
  options: OptionSelecteur[]
  aide?: string
  largeur?: LargeurChamp
  defaultValue?: never
}
export function Selecteur(proprietes: ProprietesSelecteur): React.JSX.Element

export type ProprietesZoneTexte = Omit<
  React.ComponentPropsWithoutRef<'textarea'>,
  'className' | 'style' | 'value' | 'onChange' | 'defaultValue'
> & {
  label: string
  value: string
  onChange: (evenement: React.ChangeEvent<HTMLTextAreaElement>) => void
  aide?: string
  defaultValue?: never
}
export function ZoneTexte(proprietes: ProprietesZoneTexte): React.JSX.Element
```

## ⚠️ D111 EST LA SEULE RAISON POUR LAQUELLE CETTE PHASE FERME LE DOSSIER DES CHAMPS NON CONTRÔLÉS. LIRE AVANT D'ÉCRIRE UNE LIGNE.

**React réinitialise les champs NON CONTRÔLÉS d'un `<form action>` à TOUTE complétion de
l'action, y compris sur un refus RETOURNÉ.** L'utilisateur lit alors son message d'erreur
au-dessus d'un formulaire vide, et doit tout retaper.

Le dépôt en compte encore **28 champs libres sur 12 fichiers** (mesure du 2026-08-16,
inventaire du vocabulaire §3.1, rejouée par script et non recopiée) :

| Fichier | Champs libres |
|---|---|
| `src/app/demandes/nouvelle/page.tsx` | 4 |
| `src/app/statuts/formulaire-catalogue.tsx` | 4 |
| `src/app/membres/[id]/statuts/formulaire-statut.tsx` | 3 |
| `src/app/ael/calendriers/formulaire-calendrier.tsx` | 3 |
| `src/app/ael/seances/[id]/formulaire-seance.tsx` | 2 |
| `src/app/ael/seances/formulaire-seance-manuelle.tsx` | 2 |
| `src/app/antennes/formulaire-antenne.tsx` | 2 |
| `src/app/changer-mot-de-passe/page.tsx` | 2 |
| `src/app/comptes/formulaire-compte.tsx` | 2 |
| `src/app/connexion/formulaire-connexion.tsx` | 2 |
| `src/app/tokens/formulaire-generation.tsx` | 1 |
| `src/app/membres/[id]/statuts/page.tsx` | 1 |

**Le remède appliqué depuis la phase 4 — « rendre les champs contrôlés » — est un geste à
répéter à chaque nouveau formulaire, donc un geste qu'on oublie.** Ici, l'oubli devient un
**refus de compilation**. C'est la seule différence entre une phase qui corrige 28 champs et
une phase qui ferme le dossier.

**Ce qui rend le type SUFFISANT, et pourquoi `Omit` seul ne l'est pas.** `Omit` retire
`defaultValue` du type de base : un littéral JSX `<Champ defaultValue="x" />` est alors refusé
par le contrôle des propriétés excédentaires. **Mais un ÉTALEMENT ne l'est pas** —
`<Champ {...proprietes} />` où `proprietes` porte un `defaultValue: string` passerait, parce
que le contrôle des propriétés excédentaires ne s'applique pas aux étalements. D'où la
redéclaration explicite `defaultValue?: never` : `string` n'est pas assignable à
`undefined`, et l'étalement rougit lui aussi. **Les deux ensemble, jamais l'un sans l'autre.**

- [ ] **Étape 1 : `src/composants/ui/champ.tsx`**

```tsx
import { useId, type ChangeEvent, type ComponentPropsWithoutRef } from 'react'

/*
  ═══ D111 — `defaultValue` EST IMPOSSIBLE À ÉCRIRE, PAS DÉCONSEILLÉ ═══

  React réinitialise les champs NON CONTRÔLÉS d'un `<form action>` à TOUTE complétion de
  l'action, Y COMPRIS sur un refus RETOURNÉ. Et c'est la BONNE PRATIQUE du projet qui
  déclenche le piège : la règle « une action RETOURNE son refus, elle ne le lève pas » —
  posée pour que le message survive au build de production — est exactement ce qui fait
  passer l'action par le chemin « complétion normale », donc par la remise à zéro. Une
  action qui LÈVE ne vide rien, mais perd son message en production.

  `value` et `onChange` sont OBLIGATOIRES. `defaultValue` et `defaultChecked` sont
  `never`. Un champ non contrôlé n'est donc pas « à éviter » : il n'est PAS EXPRIMABLE par
  ce composant.

  POURQUOI `Omit` ET `?: never`, ET PAS L'UN DES DEUX :
    - `Omit` seul ferme le littéral JSX (`<Champ defaultValue="x" />` — propriété
      excédentaire refusée) mais PAS l'étalement (`<Champ {...p} />` où `p.defaultValue`
      existe) : le contrôle des propriétés excédentaires ne s'applique pas aux étalements.
    - `?: never` seul serait ambigu à lire, et laisserait `defaultValue` dans le type de
      base pour quiconque le manipule par `Parameters<typeof Champ>`.
  Les deux ensemble ferment les deux chemins.
*/
export type LargeurChamp = 'pleine' | 'flexible' | 'etroite'

/**
 * EXPORTÉE, et employée telle quelle par `Selecteur`. Une seule table de largeurs pour
 * les trois composants de saisie : trois copies divergeraient, et c'est précisément ce que
 * la phase corrige ailleurs.
 */
export const CLASSES_LARGEUR: Record<LargeurChamp, string> = {
  pleine: 'w-full',
  /** Pour une barre de filtres : le champ prend la place restante et ne descend pas sous 12 rem. */
  flexible: 'min-w-48 flex-1',
  /** Pour un nombre de jours, un compteur : la largeur dit déjà ce qu'on attend. */
  etroite: 'w-32',
}

const CLASSES_CHAMP =
  'cible-tactile rounded-bord border border-bord-carte bg-surface px-esp-3 py-esp-2 text-corps text-encre'

export type ProprietesChamp = Omit<
  ComponentPropsWithoutRef<'input'>,
  'className' | 'style' | 'value' | 'onChange' | 'defaultValue' | 'defaultChecked'
> & {
  label: string
  value: string
  onChange: (evenement: ChangeEvent<HTMLInputElement>) => void
  aide?: string
  largeur?: LargeurChamp
  /** D111 — jamais assignable. Voir le commentaire de tête. */
  defaultValue?: never
  /** D111 — idem. Les 9 cases à cocher du dépôt sont hors de ce composant (voir plus bas). */
  defaultChecked?: never
}

export function Champ({
  label,
  value,
  onChange,
  aide,
  largeur = 'pleine',
  id,
  ...reste
}: ProprietesChamp) {
  /*
    ═══ POURQUOI `htmlFor` EXPLICITE ET NON LE `<label>` ENVELOPPANT ═══

    Le dépôt emploie les deux formes : 89 `<label>` pour 26 `htmlFor`, donc 63 associations
    implicites (le champ est enfant du label — forme valide en HTML). La règle qui les
    départage est écrite en commentaire dans `evenements/formulaire-evenement.tsx:178-182`
    et rappelée dans `membres/formulaire-membre.tsx:77-81` : UNE AIDE LAISSÉE DANS LE
    `<label>` EST CONCATÉNÉE AU NOM ACCESSIBLE DU CHAMP.

    Ce composant porte une aide OPTIONNELLE. S'il enveloppait, l'aide entrerait dans le nom
    accessible dès qu'elle est fournie, et pas sinon — un comportement d'accessibilité qui
    dépend d'une prop facultative est exactement le genre de piège qu'on ne remarque jamais.
    Donc : `htmlFor` explicite TOUJOURS, aide SORTIE du label, reliée par `aria-describedby`.

    `useId` et non un compteur : deux instances du même formulaire sur une page (une par
    ligne de liste — c'est le cas de `/comptes`, `/tokens`, `/evenements/a-traiter`)
    produiraient sinon des `id` en collision, et le label du premier pointerait le champ du
    second.
  */
  const idGenere = useId()
  const idChamp = id ?? idGenere
  const idAide = `${idChamp}-aide`

  /*
    ⚠️ LE LIBELLÉ PERD LE `font-medium` QU'IL AVAIT, ET C'EST UNE CONSÉQUENCE ASSUMÉE DE
    L'ÉCHELLE À CINQ DEGRÉS.

    Les 89 `<label>` du dépôt portent aujourd'hui `text-sm font-medium` (0.875 rem / 500).
    L'échelle de la conception (§4.2) n'a que CINQ degrés — titre, section, corps, nom,
    petit — et AUCUN n'est un « libellé de champ ». `--txt-petit` (0.85 rem / 400) est le
    plus proche par la taille, mais il perd la graisse.

    En ajouter un sixième contredirait « cinq degrés et pas un de plus ». Employer
    `--txt-nom` (0.95 rem / 600) ferait d'un libellé de champ un élément AUSSI marqué qu'un
    nom de personne en liste, ce qui est faux.

    C'EST UNE QUESTION DE DIMENSIONNEMENT DU SOCLE, ET ELLE EST POSÉE À LA TASK 11 (question
    n°3) — après que les dix champs de `/membres/nouveau` l'auront rendue observable, et pas
    avant.
  */

  return (
    <div className={`flex flex-col gap-esp-1 ${CLASSES_LARGEUR[largeur]}`}>
      <label htmlFor={idChamp} className="text-petit text-encre">
        {label}
      </label>
      <input
        {...reste}
        id={idChamp}
        value={value}
        onChange={onChange}
        aria-describedby={aide ? idAide : undefined}
        className={CLASSES_CHAMP}
      />
      {aide ? (
        <span id={idAide} className="text-petit text-encre-attenuee">
          {aide}
        </span>
      ) : null}
    </div>
  )
}
```

**Les 9 cases à cocher du dépôt ne passent PAS par `Champ`.** Elles sont toutes en
`defaultChecked` (`comptes/ligne-compte.tsx:211` et `:220`, entre autres) et vivent dans des
`<form onSubmit>`, où le mécanisme de remise à zéro de `<form action>` **ne s'applique pas** —
vérifié dans l'inventaire du vocabulaire §3.1, qui conclut que « le README a raison de
l'exclure ». Une case à cocher a une disposition (le libellé **après** le contrôle) et un
attribut (`checked`, pas `value`) différents : la forcer dans `Champ` demanderait une seconde
branche entière. **D110 : un motif à 9 occurrences dont 9 sont déjà correctes ne franchit pas
le seuil.** Ces cases gardent leur `<input type="checkbox">` nu, avec la classe de champ.

- [ ] **Étape 2 : `src/composants/ui/selecteur.tsx`**

```tsx
import { useId, type ChangeEvent, type ComponentPropsWithoutRef } from 'react'
import { CLASSES_LARGEUR, type LargeurChamp } from './champ'

/*
  ═══ DEUX FAMILLES DE `<select>` DANS LE DÉPÔT, ET UNE SEULE SURVIT ═══

  18 `<select>`, en deux familles radicalement différentes (inventaire §2) :
    - CONTRÔLÉE (`value=` + `onChange=`), 3 fichiers, tous protégés par un
      `onReset={(e) => e.preventDefault()}` posé à la main ;
    - NON CONTRÔLÉE (`defaultValue=`), 4 fichiers.

  Le composant n'absorbe PAS les deux régimes, contrairement à ce que l'inventaire
  suggérait : il n'en garde qu'un. La seconde famille est exactement le défaut que D111
  ferme, et un `<select>` a UN TRAVERS DE PLUS que les autres champs — voir D112 et le
  commentaire de `Formulaire` (Task 4) : un `<select>` CONTRÔLÉ ne survit pas à la
  réinitialisation automatique du formulaire après un refus, contrairement aux champs de
  saisie. Ce composant clôt le premier volet du dossier ; `Formulaire` clôt le second.

  `options` remplace `children` : passer des `<option>` en enfants laisserait un appelant
  y glisser un `<optgroup>` stylé, un `<option>` avec sa propre classe, ou un `defaultValue`
  déguisé en `selected`. Une liste de données ferme ces trois portes d'un coup.
*/
export type OptionSelecteur = { valeur: string; libelle: string }

const CLASSES_SELECTEUR =
  'cible-tactile rounded-bord border border-bord-carte bg-surface px-esp-3 py-esp-2 text-corps text-encre'

export type ProprietesSelecteur = Omit<
  ComponentPropsWithoutRef<'select'>,
  'className' | 'style' | 'value' | 'onChange' | 'defaultValue' | 'children'
> & {
  label: string
  value: string
  onChange: (evenement: ChangeEvent<HTMLSelectElement>) => void
  options: OptionSelecteur[]
  aide?: string
  largeur?: LargeurChamp
  /** D111 — jamais assignable. */
  defaultValue?: never
}

export function Selecteur({
  label,
  value,
  onChange,
  options,
  aide,
  largeur = 'pleine',
  id,
  ...reste
}: ProprietesSelecteur) {
  const idGenere = useId()
  const idChamp = id ?? idGenere
  const idAide = `${idChamp}-aide`

  return (
    <div className={`flex flex-col gap-esp-1 ${CLASSES_LARGEUR[largeur]}`}>
      <label htmlFor={idChamp} className="text-petit text-encre">
        {label}
      </label>
      <select
        {...reste}
        id={idChamp}
        value={value}
        onChange={onChange}
        aria-describedby={aide ? idAide : undefined}
        className={CLASSES_SELECTEUR}
      >
        {options.map((option) => (
          <option key={option.valeur} value={option.valeur}>
            {option.libelle}
          </option>
        ))}
      </select>
      {aide ? (
        <span id={idAide} className="text-petit text-encre-attenuee">
          {aide}
        </span>
      ) : null}
    </div>
  )
}
```

**L'option vide se passe dans `options`, elle n'est pas générée.** Les écrans disent « Non
rattaché », « Non renseignée », « Toutes les antennes », « Tous » — quatre textes affichés
distincts, arbitrés ailleurs (D117). Un composant qui en fabriquerait un cinquième les
remplacerait tous par un texte que personne n'a choisi.

- [ ] **Étape 3 : `src/composants/ui/zone-texte.tsx`**

Créer `src/composants/ui/zone-texte.tsx` :

```tsx
import { useId, type ChangeEvent, type ComponentPropsWithoutRef } from 'react'

/*
  5 `<textarea>` dans tout le dépôt, tous porteurs de la même classe de champ (inventaire
  §2 : « trop peu d'occurrences pour juger d'une variante »). Le composant existe malgré ce
  décompte faible parce que D111 vaut pour lui comme pour les deux autres : une zone de
  texte non contrôlée dans un `<form action>` se vide au refus exactement comme un
  `<input>`, et l'utilisateur y perd BEAUCOUP PLUS de saisie.

  Pas de prop `largeur` : une zone de texte occupe toujours la largeur disponible. En
  ajouter une créerait une variation dont aucun appelant n'a besoin.
*/
const CLASSES_ZONE =
  'w-full rounded-bord border border-bord-carte bg-surface px-esp-3 py-esp-2 text-corps text-encre'

export type ProprietesZoneTexte = Omit<
  ComponentPropsWithoutRef<'textarea'>,
  'className' | 'style' | 'value' | 'onChange' | 'defaultValue'
> & {
  label: string
  value: string
  onChange: (evenement: ChangeEvent<HTMLTextAreaElement>) => void
  aide?: string
  /** D111 — jamais assignable. */
  defaultValue?: never
}

export function ZoneTexte({ label, value, onChange, aide, id, rows = 3, ...reste }: ProprietesZoneTexte) {
  const idGenere = useId()
  const idChamp = id ?? idGenere
  const idAide = `${idChamp}-aide`

  return (
    <div className="flex w-full flex-col gap-esp-1">
      <label htmlFor={idChamp} className="text-petit text-encre">
        {label}
      </label>
      <textarea
        {...reste}
        id={idChamp}
        rows={rows}
        value={value}
        onChange={onChange}
        aria-describedby={aide ? idAide : undefined}
        className={CLASSES_ZONE}
      />
      {aide ? (
        <span id={idAide} className="text-petit text-encre-attenuee">
          {aide}
        </span>
      ) : null}
    </div>
  )
}
```

- [ ] **Étape 4 : ÉCRIRE LE CAS QUI DOIT ROUGIR (preuve n°3 du §7)**

**La preuve n'est PAS une lecture de signature. C'est une compilation qui rougit.** Une
signature se lit et se croit ; une compilation se lance.

Créer `src/composants/ui/preuve-defaultvalue.tsx` :

```tsx
/*
  ⚠️ FICHIER TEMPORAIRE — PREUVE N°3 DU §7 (D111). IL DOIT ÊTRE SUPPRIMÉ À L'ÉTAPE 6.

  Ce fichier NE DOIT PAS COMPILER. Chacune des six lignes ci-dessous doit produire une
  erreur TypeScript. Si `npx tsc --noEmit` passe au vert avec ce fichier présent, D111
  n'est PAS tenue et le type doit être corrigé AVANT de continuer.
*/
import { Champ } from './champ'
import { Selecteur } from './selecteur'
import { ZoneTexte } from './zone-texte'

const proprietesEtalees = { defaultValue: 'valeur passee par etalement' }

export function CasQuiDoiventRougir() {
  return (
    <>
      {/* 1. litteral JSX sur Champ */}
      <Champ label="A" value="" onChange={() => {}} defaultValue="x" />
      {/* 2. etalement sur Champ — le controle des proprietes excedentaires ne s'y applique pas */}
      <Champ label="B" value="" onChange={() => {}} {...proprietesEtalees} />
      {/* 3. defaultChecked sur Champ */}
      <Champ label="C" value="" onChange={() => {}} defaultChecked />
      {/* 4. litteral JSX sur Selecteur */}
      <Selecteur label="D" value="" onChange={() => {}} options={[]} defaultValue="x" />
      {/* 5. litteral JSX sur ZoneTexte */}
      <ZoneTexte label="E" value="" onChange={() => {}} defaultValue="x" />
      {/* 6. `value` OMIS — un champ sans valeur est non controle par un autre chemin */}
      <Champ label="F" onChange={() => {}} />
    </>
  )
}
```

```bash
npx tsc --noEmit
```

**Attendu : ROUGE.** Consigner la sortie **verbatim** dans le rapport de tâche. Elle doit
mentionner les **six** lignes, et non une seule — une erreur unique signifierait que `tsc`
s'est arrêté au premier cas, ou que cinq des six chemins sont ouverts.

**Contrôle de la BONNE RAISON.** Une compilation rouge ne prouve rien si elle rouge pour un
import cassé. Vérifier que chaque erreur porte bien sur `defaultValue`, `defaultChecked` ou
`value` :

```bash
npx tsc --noEmit 2>&1 | grep -c "defaultValue\|defaultChecked\|value"
```

Attendu : **au moins 6**.

- [ ] **Étape 5 : preuve par MUTATION du type — casser la barrière, la voir tomber, la restaurer**

Une barrière qu'on n'a pas vue tomber n'est pas une barrière prouvée.

Dans `src/composants/ui/champ.tsx`, retirer **temporairement** la ligne `defaultValue?: never`
(la garder dans le `Omit`), puis :

```bash
npx tsc --noEmit 2>&1 | grep -c "preuve-defaultvalue"
```

Attendu : le décompte **baisse** — le cas n°2 (étalement) ne rougit plus, le cas n°1
(littéral) rougit toujours. **C'est exactement ce que le commentaire de tête annonce**, et
c'est la démonstration que `Omit` seul ne suffit pas.

**Restaurer la ligne immédiatement**, puis :

```bash
npx tsc --noEmit 2>&1 | grep -c "preuve-defaultvalue"
```

Attendu : le décompte d'origine est retrouvé. Consigner les deux nombres.

- [ ] **Étape 6 : SUPPRIMER le fichier de preuve — obligatoire**

```bash
rm src/composants/ui/preuve-defaultvalue.tsx
npx tsc --noEmit && npm run lint
```

**Attendu : VERT.** Le laisser en place rendrait `tsc` rouge pour toujours, et la porte de
chaque commit suivant deviendrait inutilisable.

- [ ] **Étape 7 : les portes, puis le commit**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls
```

```bash
git add src/composants/ui/champ.tsx src/composants/ui/selecteur.tsx src/composants/ui/zone-texte.tsx
git commit -m "feat(ui): Champ, Selecteur et ZoneTexte — defaultValue devient inexprimable (D111)" -m "Le type combine Omit<..., 'defaultValue'> ET defaultValue?: never. Omit seul ferme le litteral JSX mais pas l'etalement, ou le controle des proprietes excedentaires ne s'applique pas ; ?: never ferme les deux. Prouve par un fichier temporaire qui DOIT faire rougir tsc sur six cas, puis par une mutation du type qui fait tomber le cas d'etalement et lui seul." -m "Ferme par construction les 28 champs non controles repartis sur 12 fichiers. Le remede applique depuis la phase 4 etait un geste a repeter a chaque nouveau formulaire, donc un geste qu'on oublie ; ici l'oubli est un refus de compilation." -m "Les 9 cases a cocher restent hors de Champ : toutes en defaultChecked dans des <form onSubmit>, ou le mecanisme de remise a zero de <form action> ne s'applique pas. Neuf occurrences deja correctes ne franchissent pas le seuil de D110." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4 : `Formulaire` et `Refus` — `onReset` et le focus au refus (**D112**, **D113**, D114)

**Fichiers :**
- Créer : `src/composants/ui/refus.tsx`
- Créer : `src/composants/ui/formulaire.tsx`
- Lire, **sans les modifier** : `src/app/inscription/formulaire-inscription.tsx` lignes 63-86 et
  225-234 ; `src/app/membres/formulaire-membre.tsx` lignes 83-110 et 269-279
- Tester : `npx tsc --noEmit`, `npm run lint`

**Interfaces :**
- Consomme : les jetons de la Task 1 (`text-etat-refus`, `refus-focus`, `gap-esp-4`).
- Produit, pour les Tasks 9, 12, 16 à 24 :

```ts
// src/composants/ui/refus.tsx
export type ProprietesRefus = {
  message: string | null
  ref?: React.Ref<HTMLParagraphElement>
}
export function Refus(proprietes: ProprietesRefus): React.JSX.Element | null

// src/composants/ui/formulaire.tsx
type ProprietesFormulaireBase = {
  erreur: string | null
  enCours: boolean
  children: React.ReactNode
}
export type ProprietesFormulaire =
  | (ProprietesFormulaireBase & {
      action: (donnees: FormData) => void | Promise<void>
      onSubmit?: never
    })
  | (ProprietesFormulaireBase & {
      onSubmit: (evenement: React.FormEvent<HTMLFormElement>) => void
      action?: never
    })
export function Formulaire(proprietes: ProprietesFormulaire): React.JSX.Element
```

## ⚠️ D113 — LA MÉCANIQUE DU FOCUS SE REPREND, ELLE NE S'INVENTE PAS

**Deux formulaires sur vingt-cinq déplacent le focus vers le refus aujourd'hui.** Les
vingt-trois autres reposent sur l'annonce implicite de `role="alert"`, qui ne déplace rien :
un utilisateur au clavier reste où il était et ne sait pas que sa soumission a été refusée.

Les deux qui le font bien sont `src/app/inscription/formulaire-inscription.tsx` et
`src/app/membres/formulaire-membre.tsx` (`grep -rn 'zoneErreur' src --include="*.tsx"` rend
**exactement** ces deux fichiers). **Leur mécanique est reprise TELLE QUELLE ci-dessous** —
elle est déjà écrite, déjà commentée, déjà éprouvée en production. La réinventer serait
introduire une seconde version d'un mécanisme correct.

Voici ce que les deux fichiers portent, à l'identique
(`formulaire-inscription.tsx:80-86`, `formulaire-membre.tsx:104-110`) :

```tsx
const enCoursPrecedent = useRef(enCours)
useEffect(() => {
  if (enCoursPrecedent.current && !enCours && etat.erreur !== null) {
    zoneErreur.current?.focus()
  }
  enCoursPrecedent.current = enCours
}, [enCours, etat])
```

et, pour le bandeau (`formulaire-inscription.tsx:225-234`, `formulaire-membre.tsx:269-279`) :

```tsx
{etat.erreur ? (
  <p ref={zoneErreur} tabIndex={-1} role="alert" className="text-sm text-red-600 outline-none">
    {etat.erreur}
  </p>
) : null}
```

**Ce qui change, et rien d'autre :** `text-sm text-red-600` devient `text-petit
text-etat-refus`, et **`outline-none` est REMPLACÉ, pas seulement retiré** (D113, D114) — par
l'utilitaire `refus-focus`, qui pose un contour visible en `--etat-refus` sur `:focus`. Ce
sont les **deux seules occurrences d'`outline-none` du dépôt**
(`grep -rn "outline-none" src --include="*.tsx"` → 2 lignes), et elles retiraient tout indice
visuel de focus **à l'endroit précis où le focus venait d'atterrir**.

- [ ] **Étape 1 : `src/composants/ui/refus.tsx`**

```tsx
'use client'

import type { Ref } from 'react'

/*
  ═══ D113 — LE BANDEAU DE REFUS REÇOIT LE FOCUS, ET LE FOCUS SE VOIT ═══

  46 `role="alert"` dans le dépôt (`grep -rn 'role="alert"' src --include="*.tsx" | wc -l`),
  un bandeau de refus par formulaire, motif quasi universel. `aria-live` explicite : ZÉRO
  occurrence — inutile, `role="alert"` implique déjà une région live assertive.

  MAIS L'ANNONCE NE DÉPLACE RIEN. Deux formulaires sur vingt-cinq portent le focus sur le
  message ; les vingt-trois autres laissent l'utilisateur clavier exactement où il était,
  souvent bien au-dessus d'un message qu'il ne verra pas. Sur mobile — où l'inscription et
  la création de fiche sont le plus employées — le refus s'affiche fréquemment hors du
  champ visuel, et rien ne semble s'être passé au clic.

  `tabIndex={-1}` rend le paragraphe focusable PAR PROGRAMME sans l'insérer dans l'ordre de
  tabulation : personne ne « tombe » dessus en tabulant, mais `.focus()` l'atteint.

  ═══ POURQUOI `refus-focus` ET NON `:focus-visible` ═══

  L'anneau global de D114 est posé sur `:focus-visible`, qui ne se déclenche PAS de façon
  fiable lors d'un focus PROGRAMMATIQUE sur un élément NON INTERACTIF : les navigateurs y
  appliquent leur propre heuristique, fondée sur la dernière modalité d'interaction. S'en
  remettre à `:focus-visible` ici, ce serait laisser au navigateur le soin de décider si
  l'utilisateur voit ou non où le focus vient d'atterrir. `refus-focus` (globals.css) pose
  donc une règle `:focus` NUE, réservée à ce seul cas.

  C'est LE REMPLACEMENT des deux `outline-none` du dépôt
  (`inscription/formulaire-inscription.tsx:230`, `membres/formulaire-membre.tsx:275`), et
  non leur simple retrait : leur intention — ne pas entourer d'un halo un texte non
  interactif — était plausible, mais elle laissait l'utilisateur clavier voyant sans aucun
  indice à l'endroit exact où le focus venait d'arriver.

  ═══ LE MESSAGE N'EST JAMAIS CONSTRUIT ICI ═══

  `message` arrive tel quel de l'action. Ce composant ne préfixe rien, ne suffixe rien, ne
  reformule rien : D117 interdit de modifier un texte affiché, et un bandeau qui ajouterait
  « Erreur : » devant 46 messages en changerait 46 d'un coup.
*/
export type ProprietesRefus = {
  message: string | null
  ref?: Ref<HTMLParagraphElement>
}

export function Refus({ message, ref }: ProprietesRefus) {
  if (!message) return null
  return (
    <p ref={ref} tabIndex={-1} role="alert" className="refus-focus text-petit text-etat-refus">
      {message}
    </p>
  )
}
```

**Pourquoi `'use client'` sur un composant sans état ?** Il n'en a pas besoin
techniquement — seuls des composants clients l'importent, et la frontière est déjà franchie
chez eux. La directive est posée parce que la table du §5 de la conception le classe comme
composant client et parce qu'elle **interdit par construction** qu'un composant serveur l'
importe un jour et découvre à l'exécution que `ref` n'y sert à rien.

- [ ] **Étape 2 : `src/composants/ui/formulaire.tsx` — `onReset` UNE FOIS POUR TOUTES (D112)**

```tsx
'use client'

import { useEffect, useRef, type FormEvent, type ReactNode } from 'react'
import { Refus } from './refus'

/*
  ═══ D112 — `onReset` AVEC PRÉVENTION DU DÉFAUT, UNE FOIS POUR TOUTES ═══

  SECOND AXE DU DOSSIER DES CHAMPS EFFACÉS, DÉCOUVERT EN PHASE 5, ET DISTINCT DE D111.

  Un `<select>` CONTRÔLÉ ne survit pas à la réinitialisation automatique que React applique
  à un `<form action>` à la complétion de l'action — contrairement aux champs de saisie
  contrôlés, qui, eux, la traversent sans dommage. Rendre les champs contrôlés (D111) ne
  suffit donc pas : il faut EN PLUS empêcher la réinitialisation, et c'est ce que fait
  `onReset={(e) => e.preventDefault()}`.

  TROIS FICHIERS portent aujourd'hui ce remède À LA MAIN, et ce sont exactement les trois
  seuls du dépôt à combiner un `<select>` contrôlé et un `<form action>` pouvant retourner
  un refus (inventaire du vocabulaire §3.2, critère rejoué fichier par fichier) :
    - `src/app/evenements/formulaire-evenement.tsx:95`
    - `src/app/inscription/formulaire-inscription.tsx:91`
    - `src/app/membres/formulaire-membre.tsx:130` (partagé avec `bloc-enrichissement.tsx`)

  ET RIEN — NI RÈGLE DE LINT, NI TEST — NE SIGNALERAIT UN `<form>` NEUF QUI L'OUBLIE.
  La carte des composants atteints s'est déjà révélée fausse une fois dans ce projet,
  précisément parce qu'elle définissait sa cible par un critère qui excluait par
  construction le seul fichier atteint. UN COMPOSANT FERME LE CAS ; UNE CARTE NE LE FERME
  JAMAIS.

  Ici, `onReset` est posé INCONDITIONNELLEMENT et n'est PAS surchargeable : il n'est pas
  dans le type des propriétés. Aucun écran n'a plus à y penser, et aucun ne peut le retirer.

  ═══ CE COMPOSANT N'IMPOSE PAS `useActionState` ═══

  25 fichiers l'emploient, d'autres non. Les deux régimes sont exprimables :
    - `action={envoyer}` — le `dispatch` d'un `useActionState`, ou une Server Action liée ;
    - `onSubmit={handler}` — les formulaires qui interceptent eux-mêmes, comme les quatre
      de `comptes/ligne-compte.tsx` et les deux de `demandes/ligne-demande-admin.tsx`.
  Le type les rend MUTUELLEMENT EXCLUSIFS : porter les deux sur un même `<form>` ferait
  s'exécuter le handler ET l'action, ce qu'aucun appelant ne veut et que personne ne
  remarquerait avant la production.

  Cette phase ne touche à AUCUN chemin d'écriture (D118) : les formulaires qui emploient
  `useActionState` le gardent, ceux qui ne l'emploient pas ne sont pas convertis.
*/
type ProprietesFormulaireBase = {
  /** Le refus RETOURNÉ par l'action, tel quel. `null` quand il n'y en a pas. */
  erreur: string | null
  /** L'attente. Le composant ne s'en sert que pour savoir QUAND porter le focus. */
  enCours: boolean
  children: ReactNode
}

export type ProprietesFormulaire =
  | (ProprietesFormulaireBase & {
      action: (donnees: FormData) => void | Promise<void>
      onSubmit?: never
    })
  | (ProprietesFormulaireBase & {
      onSubmit: (evenement: FormEvent<HTMLFormElement>) => void
      action?: never
    })

export function Formulaire({ erreur, enCours, children, ...soumission }: ProprietesFormulaire) {
  const zoneRefus = useRef<HTMLParagraphElement | null>(null)

  /*
    ═══ POURQUOI CE `useRef` FERME LA COURSE AU MONTAGE PAR CONSTRUCTION ═══

    REPRIS TEL QUEL de `inscription/formulaire-inscription.tsx:80-86` et
    `membres/formulaire-membre.tsx:104-110`, les DEUX SEULS formulaires du dépôt qui
    portent le focus sur leur refus. Ce n'est pas une réécriture : c'est une extraction.

    `enCoursPrecedent` est initialisé avec la valeur du PREMIER rendu, nécessairement
    `false`. La passe de montage ne peut donc JAMAIS satisfaire
    `enCoursPrecedent.current && !enCours`, quel que soit le timing : la condition exige
    une transition `true -> false`, c'est-à-dire une VRAIE soumission terminée.

    Tester `erreur !== null` seul ne suffirait pas — l'effet se déclencherait dès le
    montage si un état d'erreur préexistait, et volerait le focus à un utilisateur qui
    vient d'arriver sur la page.

    AUCUNE REMISE À ZÉRO N'EST FAITE AU SUCCÈS, parce qu'il n'y en a pas à faire : les
    actions de ce dépôt REDIRIGENT ou revalident. Si un jour l'une d'elles cessait de le
    faire et qu'on voulait vider le formulaire, c'est EXACTEMENT ce garde qu'il faudrait
    réutiliser, avec `erreur === null` à la place.
  */
  const enCoursPrecedent = useRef(enCours)
  useEffect(() => {
    if (enCoursPrecedent.current && !enCours && erreur !== null) {
      zoneRefus.current?.focus()
    }
    enCoursPrecedent.current = enCours
  }, [enCours, erreur])

  return (
    <form
      {...soumission}
      /*
        D112 — INCONDITIONNEL, ET HORS DU TYPE DES PROPRIÉTÉS. Un appelant ne peut ni le
        retirer, ni le remplacer. C'est toute la différence entre un remède et une règle.
      */
      onReset={(evenement) => evenement.preventDefault()}
      className="flex flex-col gap-esp-4"
    >
      {children}
      <Refus message={erreur} ref={zoneRefus} />
    </form>
  )
}
```

**Le `<Refus>` est rendu APRÈS `children`, jamais avant.** C'est la position qu'ont les 46
bandeaux existants — juste au-dessus du bouton de soumission. La remonter en tête du
formulaire déplacerait un élément visible sur vingt-cinq écrans sans qu'aucune décision ne
l'ait demandé.

**Le bouton de soumission N'EST PAS dans `Formulaire`.** Il est dans `children`, écrit par
l'écran, avec **son propre libellé et son propre libellé d'attente** — 26 formulations
distinctes du schéma « participe présent + … » (`Enregistrement…`, `Envoi…`, `Création…`,
`Connexion…`, `Génération…`, `Inscription…`, `Détachement…`, `Révocation…`, `Annulation…`,
`Réinitialisation…`). Les absorber dans le composant en remplacerait 26 par un seul, ce que
D117 interdit.

- [ ] **Étape 3 : vérifier que l'exclusion mutuelle `action` / `onSubmit` tient**

Créer un fichier temporaire `src/composants/ui/preuve-formulaire.tsx` :

```tsx
/* ⚠️ TEMPORAIRE — DOIT ROUGIR. Supprimé à l'étape suivante. */
import { Formulaire } from './formulaire'

export function CasQuiDoitRougir() {
  return (
    <Formulaire
      erreur={null}
      enCours={false}
      action={() => {}}
      onSubmit={() => {}}
    >
      <span />
    </Formulaire>
  )
}
```

```bash
npx tsc --noEmit
```

Attendu : **ROUGE**, avec une erreur portant sur `onSubmit` (ou `action`). Consigner la sortie
verbatim, puis :

```bash
rm src/composants/ui/preuve-formulaire.tsx
npx tsc --noEmit && npm run lint
```

Attendu : **VERT**.

- [ ] **Étape 4 : vérifier qu'aucune valeur littérale n'a été introduite**

```bash
grep -rEn "#[0-9a-fA-F]{3,8}|(bg|text|border|ring|divide)-(red|amber|green|blue|neutral|gray|slate|zinc|stone|white|black)(-[0-9]{2,3})?" src/composants/ | wc -l
```

Attendu : **0** (le contrôle positif de la Task 2, étape 3, reste valable dans la même
session ; le rejouer si la session a changé).

- [ ] **Étape 5 : les portes, puis le commit**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls
```

```bash
git add src/composants/ui/refus.tsx src/composants/ui/formulaire.tsx
git commit -m "feat(ui): Formulaire et Refus — onReset incondionnel et focus au refus (D112, D113)" -m "Formulaire porte onReset={(e) => e.preventDefault()} HORS du type des proprietes : aucun appelant ne peut le retirer. Trois fichiers portaient ce remede a la main, et rien — ni lint, ni test — ne signalerait un <form> neuf qui l'oublie. Un composant ferme le cas ; une carte ne le ferme jamais." -m "Refus reprend TELLE QUELLE la mecanique des deux seuls formulaires du depot qui portent le focus sur leur refus (inscription/formulaire-inscription.tsx et membres/formulaire-membre.tsx, verifies par grep zoneErreur). Le garde useRef ferme la course au montage par construction : la condition exige une transition true -> false." -m "outline-none est REMPLACE, pas retire : l'utilitaire refus-focus pose un contour visible en --etat-refus sur :focus. :focus-visible ne se declenche pas de facon fiable sur un focus programmatique applique a un element non interactif." -m "Le type rend action et onSubmit mutuellement exclusifs : porter les deux ferait s'executer le handler ET l'action." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5 : `Carte`, `LigneListe`, `EtatBadge` (D110, **D115**, **D126**)

**Fichiers :**
- Créer : `src/composants/ui/carte.tsx`
- Créer : `src/composants/ui/ligne-liste.tsx`
- Créer : `src/composants/ui/etat-badge.tsx`
- Tester : `npx tsc --noEmit`, `npm run lint`

**Interfaces :**
- Consomme : les jetons de la Task 1 (`bg-surface`, `border-bord-carte`, `divide-filet`,
  `rail-filiation`, `bg-etat-*`, `text-etat-*`).
- Produit, pour les Tasks 8, 16 à 24 :

```ts
// src/composants/ui/carte.tsx
export type TonCarte = 'neutre' | 'avertissement' | 'succes'
export type ProprietesCarte = {
  children: React.ReactNode
  ton?: TonCarte          // defaut : 'neutre'
  rail?: boolean          // defaut : false — le rail de filiation (D106)
  role?: 'alert' | 'status'
}
export function Carte(proprietes: ProprietesCarte): React.JSX.Element

// src/composants/ui/ligne-liste.tsx
export type ProprietesLigneListe = {
  principal: React.ReactNode
  meta?: React.ReactNode
  actions?: React.ReactNode
  complement?: React.ReactNode
  lien?: string
  rail?: boolean
}
export function LigneListe(proprietes: ProprietesLigneListe): React.JSX.Element
export function Liste({ children }: { children: React.ReactNode }): React.JSX.Element

// src/composants/ui/etat-badge.tsx
export type TonEtat = 'acquis' | 'attente' | 'refus' | 'neutre'
export type ProprietesEtatBadge = { ton: TonEtat; libelle: string }
export function EtatBadge(proprietes: ProprietesEtatBadge): React.JSX.Element
```

## ⚠️ D126 EST FAUSSE SUR LES FAITS. LIRE AVANT D'ÉCRIRE `EtatBadge`.

D126 énumère cinq états : « `Repenti`, `Baptisé`, `Affermi`, `En attente`, `Archivé` ». Le
code dit autre chose, vérifié le 2026-08-16 :

- **`Repenti` et `Baptisé` sont des LIGNES DE CATALOGUE EN BASE**, pas des valeurs de type.
  `supabase/migrations/20260813100000_statuts.sql:60-66` amorce `Non-croyant`, `Repenti`,
  `Baptisé d'eau`, `Baptisé du Saint-Esprit`, `Sert dans une commission`. **Un administrateur
  en ajoute et en désactive depuis `/statuts`.** `Baptisé` nu n'existe pas, et **`Affermi`
  n'existe nulle part** (`grep -rni "affermi" src supabase` → zéro).
- **Il y a QUATRE vocabulaires d'état distincts**, plus deux dérivés :

| Vocabulaire | Valeurs | Source vérifiée |
|---|---|---|
| `EtatMembre` | `en_attente` \| `actif` \| `archive` | `src/lib/domaine/membre.ts:2` |
| `DemandeListe['etat']` | `en_attente` \| `validee` \| `rejetee` \| `annulee` | `src/lib/donnees/demandes.ts:50` |
| `EtatSeanceAel` | `prevue` \| `tenue` \| `annulee` | `src/lib/domaine/ael.ts:4` |
| état de compte | `Actif` / `Désactivé` | booléen, `comptes/ligne-compte.tsx:144` |
| état de token | `Valide` / `Expiré` / `Révoqué le …` / `Utilisé le …` | `tokens/ligne-token.tsx:7-12` |
| statuts | **données**, libellés libres | catalogue en base |

- **Les « 2 pastilles » que le §5 attribue à `EtatBadge` n'en sont pas.**
  `membres/[id]/page.tsx:213` et `:255` sont des puces de **statut** et de **séminaire**, en
  `rounded-full border border-neutral-300`, **sans couleur**. `EtatBadge` n'a donc **AUCUN
  antécédent** — zéro, pas deux. Ce qui **renforce** l'avertissement du §5 : son risque n'est
  pas la divergence, c'est l'**usage**. Le plan compte ses appelants à la Task 24 (preuve n°5).

**Conséquence :** `EtatBadge` porte un **ton énuméré** et un **libellé libre**. Une union
fermée de cinq libellés serait une carte fausse dès la première ligne ajoutée au catalogue —
exactement le mode de défaillance dominant de ce projet.

- [ ] **Étape 1 : `src/composants/ui/etat-badge.tsx`**

```tsx
/*
  ═══ D126 — PASTILLE **ET** LIBELLÉ, JAMAIS L'UN SANS L'AUTRE ═══

  La direction « Filiation » ne colore PAS le fond de l'étiquette. La couleur reste donc un
  SECOND CANAL, jamais le seul : la pastille aide au repérage, le libellé porte le sens.
  Une couleur seule serait invisible à qui ne la distingue pas ; un libellé seul perdrait le
  bénéfice de repérage qui a justifié la densité compacte de D107.

  `libelle` est OBLIGATOIRE et `aria-hidden` est posé sur la pastille : le nom accessible du
  badge est exactement son libellé, sans « pastille verte » parasite.

  ═══ POURQUOI UN TON, ET NON UNE UNION DE LIBELLÉS (RECTIFICATION DE D126) ═══

  D126 nomme cinq états — Repenti, Baptisé, Affermi, En attente, Archivé — dont TROIS ne
  sont pas des états dans le code : `Repenti` et `Baptisé d'eau` sont des LIGNES DE
  CATALOGUE en base (20260813100000_statuts.sql:60-66), qu'un administrateur ajoute et
  désactive depuis `/statuts`, et `Affermi` n'existe NULLE PART dans le dépôt. Le code porte
  en réalité QUATRE vocabulaires d'état distincts, plus deux dérivés :

    EtatMembre               en_attente | actif | archive      src/lib/domaine/membre.ts:2
    DemandeListe['etat']     en_attente | validee | rejetee | annulee
                                                              src/lib/donnees/demandes.ts:50
    EtatSeanceAel            prevue | tenue | annulee          src/lib/domaine/ael.ts:4
    compte                   actif (booleen)                   comptes/ligne-compte.tsx:144
    token                    valide | expire | revoque | utilise  tokens/ligne-token.tsx:7-12
    statuts                  DONNEES, libelles libres

  Une union fermée de cinq libellés serait donc FAUSSE à l'écriture, et fausse à nouveau à
  la première ligne ajoutée au catalogue. La correspondance état -> ton est déclarée PAR
  ÉCRAN, à côté du `Record` de libellés qui y existe déjà (`LIBELLE_ETAT`, `LIBELLE_ORIGINE`,
  `LIBELLE_SITUATION`, `LIBELLE_ROLE`) — c'est-à-dire là où le vocabulaire vit vraiment.
*/
export type TonEtat = 'acquis' | 'attente' | 'refus' | 'neutre'

/*
  Constantes littérales, jamais construites : Tailwind balaye le source à la recherche de
  noms de classe complets, et `bg-etat-${ton}` ne produirait aucune règle. La pastille
  sortirait alors transparente — un défaut silencieux, qui ne casse rien et n'affiche rien.
*/
const CLASSES_PASTILLE: Record<TonEtat, string> = {
  acquis: 'bg-etat-acquis',
  attente: 'bg-etat-attente',
  refus: 'bg-etat-refus',
  neutre: 'bg-etat-neutre',
}

export type ProprietesEtatBadge = { ton: TonEtat; libelle: string }

export function EtatBadge({ ton, libelle }: ProprietesEtatBadge) {
  return (
    <span className="inline-flex items-center gap-esp-2 text-petit text-encre">
      <span
        aria-hidden="true"
        /*
          `size-pastille` et NON `size-esp-2` : la densite compacte (D107) remappe les six
          jetons d'espacement, et la pastille RETRECIRAIT sur les trois ecrans denses —
          c'est-a-dire la ou le reperage par la couleur a justifie la densite.
        */
        className={`inline-block size-pastille shrink-0 rounded-full ${CLASSES_PASTILLE[ton]}`}
      />
      {libelle}
    </span>
  )
}
```

**`rounded-full` sur la pastille est le SEUL rayon non unique du système**, et il est
délibéré : une pastille est un disque, pas un rectangle arrondi. Le rayon unique de 4 px
(§4.3) concerne les surfaces — cartes, champs, boutons —, pas un point de couleur de 8 px.
C'est la seule exception, et elle est écrite ici pour qu'on ne la découvre pas en revue.

- [ ] **Étape 2 : `src/composants/ui/carte.tsx`**

```tsx
import type { ReactNode } from 'react'

/*
  ═══ `Carte` N'A AUCUN ANTÉCÉDENT À EXTRAIRE, ET C'EST SON RISQUE ═══

  L'inventaire du vocabulaire est formel : « pas de carte neutre (fond blanc/gris clair,
  ombre, contenu libre) identifiée en dehors des listes en <ul> — à considérer comme motif
  ABSENT plutôt que divergent ». Les seules boîtes encadrées du dépôt sont les bandeaux
  d'avertissement (`bg-amber-50`, 8 occurrences) et de succès (`bg-green-50`, 2 occurrences,
  `connexion/page.tsx:32` et `demandes/page.tsx:103`).

  Le risque de ce composant n'est donc PAS la divergence avec ce qui existait, c'est
  l'USAGE : un composant neuf que les écrans n'adoptent pas uniformément recrée exactement
  le désordre que la phase corrige. Le décompte de ses appelants est une preuve (§7, n°5),
  faite à la Task 24.

  ═══ LES TONS N'ONT PAS DE FOND COLORÉ, ET C'EST UNE DÉCISION ═══

  Les bandeaux d'aujourd'hui remplissent leur fond (`bg-amber-50`, `bg-green-50`). Le
  système de jetons de la conception (§4.1) ne fournit AUCUNE couleur de fond d'état : les
  quatre couleurs d'état y sont déclarées « utilisées UNIQUEMENT en pastille » (D126), et
  `--etat-refus` y est nommée comme couleur de TEXTE sur `--surface`, jamais comme fond. En
  inventer deux (un ambre pâle, un vert pâle) ajouterait deux valeurs que la conception n'a
  pas arbitrées, dans un fichier dont la raison d'être est de porter les valeurs arbitrées.

  Donc : fond `--surface` pour les trois tons, et le ton s'exprime par la BORDURE et par la
  couleur du texte. Le contraste texte/fond y gagne, et la couleur reste un second canal,
  conformément à l'esprit de D126.

  ⚠️ CE N'EST PAS UN RAIL. La bordure de ton fait le tour de la carte ; le rail de filiation
  est un bord GAUCHE de 2 px en `--filiation`, posé par la prop `rail`. Les deux sont
  visuellement distincts, et ils doivent le rester : le rail marque une RELATION DE
  DISCIPULAT, et s'il apparaissait là où aucune relation n'existe, il deviendrait une
  décoration qui affirme quelque chose de faux (piège n°6).
*/
export type TonCarte = 'neutre' | 'avertissement' | 'succes'

const CLASSES_TON: Record<TonCarte, string> = {
  neutre: 'border-bord-carte text-encre',
  avertissement: 'border-etat-attente text-encre',
  succes: 'border-etat-acquis text-encre',
}

export type ProprietesCarte = {
  children: ReactNode
  ton?: TonCarte
  /** Le rail de filiation (D106). NE LE POSER QUE LÀ OÙ UNE RELATION DE DISCIPULAT EXISTE. */
  rail?: boolean
  /**
   * `role="alert"` pour un avertissement, `role="status"` pour un succès — c'est ce que
   * portent les bandeaux existants, et le changer changerait la façon dont un lecteur
   * d'écran les annonce. Facultatif : une carte neutre n'a pas de rôle live.
   */
  role?: 'alert' | 'status'
}

export function Carte({ children, ton = 'neutre', rail = false, role }: ProprietesCarte) {
  return (
    <div
      role={role}
      className={`rounded-bord border bg-surface p-esp-4 ${CLASSES_TON[ton]}${
        rail ? ' rail-filiation' : ''
      }`}
    >
      {children}
    </div>
  )
}
```

- [ ] **Étape 3 : `src/composants/ui/ligne-liste.tsx` — la bascule de D115**

```tsx
import Link from 'next/link'
import type { ReactNode } from 'react'

/*
  ═══ IL N'Y A AUCUN `<table>` DANS TOUT LE DÉPÔT, ET C'EST UNE CHANCE ═══

  `grep -roh '<table' src --include="*.tsx" | wc -l` rend ZÉRO, vérifié non-piège. Toute
  donnée tabulaire passe par `<ul className="divide-y divide-neutral-200">` + `<li>`, avec
  une mise en page interne en `flex flex-wrap`. LE DÉBORDEMENT HORIZONTAL EST DONC
  STRUCTURELLEMENT IMPOSSIBLE : rien n'est disposé en colonnes fixes, et le dépôt ne compte
  aucun conteneur `overflow-x`.

  La contrepartie : AUCUNE LIGNE DE LISTE PARTAGÉE non plus. 29 `<ul>`, 26 `divide-y`, et
  chaque écran réimplémente sa propre disposition en `flex`. C'est ce que ce composant
  extrait.

  ═══ D115 — LA BASCULE EN CARTES EMPILÉES SOUS `md`, PORTÉE ICI ET NULLE PART AILLEURS ═══

  Le §3 de la spécification maîtresse promet « mobile d'abord » depuis le premier jour. Le
  dépôt compte QUATRE usages de point de rupture, tous en `sm:`, tous pour le même motif de
  grille de formulaire. Le reste du responsive repose sur `flex-wrap` (40 occurrences) : les
  éléments s'enroulent à l'étroit, mais AUCUNE réorganisation délibérée n'est pilotée par un
  point de rupture.

  `LigneListe` porte cette bascule UNE FOIS : sous 48 rem, le principal, la méta et les
  actions s'empilent ; au-dessus, ils s'alignent sur une ligne. C'est LE SEUL ENDROIT OÙ
  ELLE A BESOIN D'EXISTER, puisqu'aucun tableau n'existe.

  ═══ `lien` N'ENVELOPPE JAMAIS LES ACTIONS ═══

  Plusieurs listes rendent la ligne entière cliquable (`membres/page.tsx:121`,
  `antennes/page.tsx:24`). D'autres portent des boutons par ligne. Envelopper les deux dans
  un même `<Link>` produirait un élément interactif DANS un élément interactif — invalide en
  HTML, et le clic sur le bouton naviguerait en plus d'agir. `lien` n'enveloppe donc que le
  bloc `principal` + `meta` ; `actions` reste dehors, toujours.
*/
export function Liste({ children }: { children: ReactNode }) {
  return <ul className="divide-y divide-filet">{children}</ul>
}

export type ProprietesLigneListe = {
  /** Le nom, le titre — ce qui identifie la ligne. */
  principal: ReactNode
  /** Antenne, ville, date, état — la métadonnée secondaire. */
  meta?: ReactNode
  /** Boutons et formulaires de la ligne. JAMAIS enveloppés par `lien`. */
  actions?: ReactNode
  /** Ce qui vit sous la ligne : bandeau de refus, formulaire replié, sous-liste. */
  complement?: ReactNode
  /** Rend `principal` + `meta` cliquables vers cette adresse. */
  lien?: string
  /** Le rail de filiation (D106). NE LE POSER QUE LÀ OÙ UNE RELATION DE DISCIPULAT EXISTE. */
  rail?: boolean
}

export function LigneListe({
  principal,
  meta,
  actions,
  complement,
  lien,
  rail = false,
}: ProprietesLigneListe) {
  const identite = (
    <div className="flex flex-col gap-esp-1">
      <span className="text-nom text-encre">{principal}</span>
      {meta ? <span className="chiffres-alignes text-petit text-encre-attenuee">{meta}</span> : null}
    </div>
  )

  return (
    <li className={`py-esp-3${rail ? ' rail-filiation' : ''}`}>
      {/*
        D115 — `flex-col` par défaut, `md:flex-row` au-dessus de 48 rem. C'est la
        RÉORGANISATION DÉLIBÉRÉE que `flex-wrap` ne savait pas faire : à l'étroit, la méta
        passe SOUS le nom au lieu de s'enrouler à côté de lui, et les actions passent sous
        les deux au lieu de se serrer contre le bord droit.
      */}
      <div className="flex flex-col gap-esp-2 md:flex-row md:items-baseline md:justify-between md:gap-esp-4">
        {lien ? (
          <Link href={lien} className="cible-tactile flex-1">
            {identite}
          </Link>
        ) : (
          <div className="flex-1">{identite}</div>
        )}
        {actions ? <div className="flex flex-wrap items-center gap-esp-3">{actions}</div> : null}
      </div>
      {complement ? <div className="mt-esp-2">{complement}</div> : null}
    </li>
  )
}
```

**`Liste` est exporté depuis le même fichier, et ce n'est pas un treizième composant.** C'est
le `<ul className="divide-y">` qui accompagne obligatoirement `LigneListe` — les séparer dans
deux fichiers laisserait un appelant écrire son propre `<ul>` avec ses propres séparateurs, ce
qui est exactement la divergence mesurée (26 `divide-y` écrits à la main). D110 compte des
**motifs**, pas des symboles exportés.

- [ ] **Étape 4 : vérifier qu'aucune valeur littérale n'a été introduite**

```bash
grep -rEn "#[0-9a-fA-F]{3,8}|(bg|text|border|ring|divide)-(red|amber|green|blue|neutral|gray|slate|zinc|stone|white|black)(-[0-9]{2,3})?" src/composants/ | wc -l
```

Attendu : **0**.

- [ ] **Étape 5 : les portes, puis le commit**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls
```

```bash
git add src/composants/ui/carte.tsx src/composants/ui/ligne-liste.tsx src/composants/ui/etat-badge.tsx
git commit -m "feat(ui): Carte, LigneListe et EtatBadge" -m "LigneListe porte la bascule de D115 — flex-col sous 48 rem, md:flex-row au-dessus. C'est le seul endroit ou elle a besoin d'exister : le depot ne contient aucun <table>, verifie a zero, et toute donnee tabulaire passe deja par <ul>+<li>." -m "EtatBadge porte un TON enumere et un libelle libre, et non l'union de cinq libelles que D126 enonce. Verification du 2026-08-16 : Repenti et Baptise d'eau sont des lignes de catalogue en base (20260813100000_statuts.sql:60-66), qu'un administrateur edite depuis /statuts, et Affermi n'existe nulle part dans le depot. Le code porte quatre vocabulaires d'etat distincts, plus deux derives." -m "Les deux rounded-full de membres/[id]/page.tsx que le design attribue a EtatBadge sont des puces de statut et de seminaire, sans couleur : EtatBadge n'a aucun antecedent, zero et non deux. Son risque est donc l'usage, et le decompte de ses appelants est la preuve n°5." -m "Les tons de Carte n'ont pas de fond colore : le systeme de jetons ne fournit aucune couleur de fond d'etat, et en inventer deux ajouterait des valeurs que la conception n'a pas arbitrees." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6 : `Pagination`, et le bornage extrait des six fichiers (D110, **D121**)

**Fichiers :**
- Créer : `src/composants/ui/pagination.tsx`
- Créer : `src/lib/navigation/bornage.ts`
- Créer : `src/lib/donnees/pagination.test.ts`
- Modifier : `src/lib/donnees/pagination.ts` (**ajout seul**, après la ligne 55)
- Tester : `npm test`

**Interfaces :**
- Consomme : les jetons de la Task 1 ; `Bouton` (Task 2).
- Produit, pour les Tasks 8, 10, 17, 18, 19 :

```ts
// src/lib/donnees/pagination.ts — AJOUT
export function nombreDePages(total: number, taillePage: number): number

// src/lib/navigation/bornage.ts — NOUVEAU
export function bornerPage(
  page: number,
  total: number,
  taillePage: number,
  lienVersPage: (page: number) => string,
): number

// src/composants/ui/pagination.tsx — NOUVEAU
export type ProprietesPagination =
  | {
      page: number
      pages: number
      lienVersPage: (page: number) => string
      indicateur?: boolean
      surChangement?: never
      enCours?: never
    }
  | {
      page: number
      pages: number
      surChangement: (page: number) => void
      indicateur?: boolean
      enCours?: boolean
      lienVersPage?: never
    }
export function Pagination(proprietes: ProprietesPagination): React.JSX.Element | null
```

## ⚠️ D121 — L'EXTRACTION EST À COMPORTEMENT IDENTIQUE, ET C'EST CE QUI SE PROUVE

**Les six fichiers, relevés et lus le 2026-08-16** — c'est la seule duplication de logique
**serveur** que la phase touche, et elle y touche parce que les six sont de toute façon
rouverts :

| # | Fichier | Lignes | Forme exacte |
|---|---|---|---|
| 1 | `src/app/membres/page.tsx` | 51-63 | `if (page > pages) redirect(lienPage(pages))` — une fonction `lienPage` locale reconstruit `recherche` et `antenne` |
| 2 | `src/app/evenements/page.tsx` | 35-44 | reconstruit `page` et `typeId` dans un `URLSearchParams` |
| 3 | `src/app/evenements/a-traiter/page.tsx` | 45-48 | `redirect(\`/evenements/a-traiter?page=${pages}\`)` |
| 4 | `src/app/evenements/[id]/page.tsx` | 72-80 | **sous `if (peutGerer)`** — hors modérateur, rien n'est lu et rediriger divulguerait qu'il y a des participants |
| 5 | `src/app/demandes/page.tsx` | 79-91 | **DEUX bornages** dans le même fichier, dont le premier **sous `estAdmin`**, et chacun reconstruit l'autre paramètre de page |
| 6 | `src/app/arborescence/page.tsx` | 37-48 | `redirect(\`/arborescence?page=${pages}\`)` |

**Sept sites sur six fichiers**, pas six. Le fichier `demandes/page.tsx` en porte deux — c'est
le seul écran à double pagination du dépôt.

**Les cinq propriétés que l'extraction doit préserver, faute de quoi elle n'est pas à
comportement identique** — chacune est écrite en commentaire dans au moins un des six
fichiers, et elles ont chacune coûté une correction :

1. **`pages` vaut TOUJOURS au moins 1** (`Math.max(1, …)`), donc la cible de la redirection ne
   redéclenche jamais la condition : **aucune boucle possible**.
2. **`pages` est calculé APRÈS coup, depuis le `total` REÇU DE LA LECTURE ELLE-MÊME** — jamais
   par un aller-retour préalable. Un correctif pré-calculé s'est révélé **plus fragile** que
   le motif qu'il imitait : une écriture concurrente entre les deux appels périmait la borne
   et faisait échouer la lecture (`PGRST103`, non attrapée là), plantant l'écran au lieu de
   rediriger — I1 de la ronde du 2026-08-14, sur l'écran précis où deux modérateurs
   travaillent ensemble.
3. **`redirect()` est HORS DE TOUT `try`** : c'est une exception de contrôle Next.js.
4. **La condition d'accès reste AU SITE D'APPEL** (`if (peutGerer)`, `if (estAdmin)`) : la
   déplacer dans la fonction extraite en ferait une décision d'autorisation, ce qu'elle n'est
   pas.
5. **`Number.parseInt` et non `Number(...)`** pour lire le numéro de page — déjà extrait en
   `pageDemandee` (`src/lib/donnees/pagination.ts:52-55`), employé aujourd'hui par le seul
   `arborescence/page.tsx:30`. Les cinq autres le réécrivent à la main.

**Preuve n°9 du §7 : les preuves de pagination ne bougent pas d'une ligne.** C'est ce qui
établit que l'extraction est à comportement identique. Les tests concernés sont
`tests/e2e/annuaire.spec.ts` (« l'annuaire pagine au-delà d'une page »),
`tests/e2e/demandes.spec.ts`, `tests/e2e/evenements-liste.spec.ts`,
`tests/e2e/arborescence.spec.ts`. **Ils ne sont pas ouverts par cette tâche.**

- [ ] **Étape 1 : `src/lib/donnees/pagination.ts` — ajouter `nombreDePages`**

Ajouter **à la fin du fichier**, après `pageDemandee` (ligne 55). **Ne rien modifier
au-dessus.**

```ts
/**
 * Nombre de pages d'un ensemble filtré. **Toujours au moins 1**, même pour un total nul.
 *
 * CE `Math.max(1, …)` N'EST PAS UNE COQUETTERIE : c'est ce qui rend le bornage de page
 * NON BOUCLANT. La cible de la redirection est `pages` lui-même ; si `pages` pouvait valoir
 * 0 sur une liste vide, la page rechargée porterait `page=0`, que `pageDemandee` ramène à
 * 1, qui redéclenche `1 > 0` — et l'écran tournerait en rond. Les six écrans paginés du
 * dépôt écrivent tous ce `Math.max(1, …)` à la main, et chacun l'explique en commentaire.
 *
 * PAS de `import 'server-only'` ici, comme dans tout ce module : ces outils ne touchent ni
 * cookies ni clé de service, et `tests/rls/` doit pouvoir faire tourner EXACTEMENT ce code
 * hors de Next.js. C'est aussi ce qui rend cette fonction testable dans l'environnement
 * `node` de `vitest.config.ts`.
 */
export function nombreDePages(total: number, taillePage: number): number {
  return Math.max(1, Math.ceil(total / taillePage))
}
```

- [ ] **Étape 2 : `src/lib/navigation/bornage.ts`**

```ts
import { redirect } from 'next/navigation'
import { nombreDePages } from '@/lib/donnees/pagination'

/**
 * ═══ D121 — LE BORNAGE DE PAGE, RECOPIÉ DANS SIX FICHIERS, EXTRAIT ICI ═══
 *
 * Une adresse pointant au-delà de la dernière page réelle est un signet périmé, ou un
 * résultat qui a rétréci depuis. Sans ce garde, l'en-tête affichait « N membres · page 99
 * sur 2 » pendant que le corps affirmait qu'aucun membre ne correspond — DEUX VÉRITÉS
 * CONTRADICTOIRES SUR LE MÊME ÉCRAN. On corrige l'adresse vers la dernière page réelle
 * plutôt que de laisser tenir ce mensonge.
 *
 * ═══ POURQUOI UN MODULE À PART DE `src/lib/donnees/pagination.ts` ═══
 *
 * `pagination.ts` porte, DÉLIBÉRÉMENT et par commentaire de tête, l'absence de
 * `import 'server-only'`, pour que `tests/rls/` fasse tourner exactement ce code hors de
 * Next.js. Y importer `next/navigation` détruirait cette propriété : le module ne
 * s'évaluerait plus hors du contexte Next. Le CALCUL reste donc là-bas, pur et testable ;
 * la REDIRECTION vit ici.
 *
 * ═══ CE QUE CETTE FONCTION NE FAIT PAS, ET C'EST VOLONTAIRE ═══
 *
 * Elle NE LIT RIEN. Le `total` lui est DONNÉ, et il doit venir de la lecture elle-même,
 * jamais d'un aller-retour préalable : un pré-calcul de borne s'est révélé PLUS FRAGILE que
 * le motif qu'il imitait — une écriture concurrente entre les deux appels périmait la borne
 * déjà calculée et faisait échouer la lecture (`PGRST103`, non attrapée là), plantant
 * l'écran au lieu de rediriger (I1, ronde du 2026-08-14).
 *
 * Elle NE DÉCIDE D'AUCUN ACCÈS. Deux des sept sites sont sous condition — `if (peutGerer)`
 * dans `evenements/[id]/page.tsx`, `if (estAdmin)` dans `demandes/page.tsx`. Ces conditions
 * RESTENT AU SITE D'APPEL : les absorber ici ferait de cette fonction une décision
 * d'autorisation, ce qu'elle n'est pas, et ce que le projet interdit de confondre.
 *
 * ⚠️ `redirect()` LÈVE UNE EXCEPTION DE CONTRÔLE NEXT.JS. Cette fonction, et donc tout
 * appel à elle, DOIT rester HORS DE TOUT `try`. Aucun des six fichiers appelants n'en
 * contient — vérifié le 2026-08-16, et chacun le dit en commentaire.
 *
 * @returns le nombre de pages, pour que l'appelant l'affiche sans le recalculer.
 */
export function bornerPage(
  page: number,
  total: number,
  taillePage: number,
  lienVersPage: (page: number) => string,
): number {
  const pages = nombreDePages(total, taillePage)
  if (page > pages) {
    // PAS DE BOUCLE POSSIBLE : `pages` vaut toujours au moins 1, et la cible est `pages`
    // lui-même — la page rechargée aura `page === pages`, qui ne redéclenche pas la
    // condition.
    redirect(lienVersPage(pages))
  }
  return pages
}
```

- [ ] **Étape 3 : `src/lib/donnees/pagination.test.ts` — la preuve unitaire**

`vitest.config.ts` déclare `include: ['src/**/*.test.ts']` et `environment: 'node'`. Ce
fichier y entre sans aucune modification de configuration.

```ts
import { describe, expect, it } from 'vitest'
import { nombreDePages, pageDemandee, totalObligatoire, verifierTaillePage } from './pagination'

describe('nombreDePages', () => {
  /*
    L'INVARIANT QUI REND LE BORNAGE NON BOUCLANT. Ce n'est pas un cas limite : une liste
    vide est l'état normal d'un écran filtré. Si `pages` pouvait valoir 0, la redirection de
    bornage viserait `page=0`, que `pageDemandee` ramène à 1, qui redéclencherait `1 > 0` —
    et l'écran tournerait en rond.
  */
  it('vaut au moins 1 sur un total nul', () => {
    expect(nombreDePages(0, 25)).toBe(1)
  })

  it('ne cree pas de page supplementaire quand le total remplit exactement la derniere', () => {
    expect(nombreDePages(25, 25)).toBe(1)
    expect(nombreDePages(50, 25)).toBe(2)
  })

  it('cree une page pour le reste', () => {
    expect(nombreDePages(26, 25)).toBe(2)
    expect(nombreDePages(1, 25)).toBe(1)
  })
})

describe('pageDemandee', () => {
  /*
    M5 DE LA RONDE DU 2026-08-14, VERROUILLÉ ICI POUR LA PREMIÈRE FOIS. `Number('2.5') || 1`
    vaut `2.5` — un nombre NON ENTIER qui franchit le garde `page > pages` (`2.5 > 2` est
    vrai) et s'affiche sous l'étiquette « page 2.5 sur N » tout en rendant le contenu de la
    page 1. `Number.parseInt` le ramène à 2. Cette fonction existait depuis la phase 5 sans
    aucun test.
  */
  it('tronque une page non entiere au lieu de la propager', () => {
    expect(pageDemandee('2.5')).toBe(2)
  })

  it('retombe sur 1 pour une valeur absente, vide, negative ou non numerique', () => {
    expect(pageDemandee(undefined)).toBe(1)
    expect(pageDemandee('')).toBe(1)
    expect(pageDemandee('0')).toBe(1)
    expect(pageDemandee('-3')).toBe(1)
    expect(pageDemandee('abc')).toBe(1)
  })
})

describe('verifierTaillePage', () => {
  /*
    PostgREST tronque EN SILENCE au-delà de `max_rows = 1000` (`supabase/config.toml:18`).
    Cette garde LÈVE plutôt que de borner en douce — borner masquerait un appel erroné
    derrière un comportement différent de celui demandé.
  */
  it('leve au seuil de max_rows, et pas un cran avant', () => {
    expect(() => verifierTaillePage(999, 'test')).not.toThrow()
    expect(() => verifierTaillePage(1000, 'test')).toThrow(/max_rows/)
  })

  it('leve sur un entier invalide', () => {
    expect(() => verifierTaillePage(0, 'test')).toThrow()
    expect(() => verifierTaillePage(2.5, 'test')).toThrow()
  })
})

describe('totalObligatoire', () => {
  /*
    Retomber sur la longueur de la page serait un MENSONGE : l'écran annoncerait
    « 25 lignes » pour une base qui en compte mille, et la pagination s'arrêterait à la
    première page.
  */
  it('leve quand PostgREST omet le comptage', () => {
    expect(() => totalObligatoire(null, 'test')).toThrow(/comptage absent/)
  })

  it('laisse passer un comptage nul, qui est une reponse et non une absence', () => {
    expect(totalObligatoire(0, 'test')).toBe(0)
  })
})
```

```bash
npm test
```

Attendu : **vert**, avec les nouveaux cas comptés. Consigner le nombre total de tests avant
et après (`npm test` affiche « Tests N passed »).

- [ ] **Étape 4 : `src/composants/ui/pagination.tsx`**

```tsx
import Link from 'next/link'
import { Bouton } from './bouton'

/*
  ═══ LE MÊME `<nav aria-label="Pagination">` ÉCRIT QUATRE FOIS ═══

  Relevé du 2026-08-16 (`grep -rln 'Page précédente\|Page suivante' src --include="*.tsx"`) :
  quatre fichiers, dont `arborescence/arborescence.tsx` qui le RÉÉCRIT DEUX FOIS dans le
  même fichier, pour deux listes différentes. Les libellés, eux, sont stables : « Page
  précédente » et « Page suivante », à l'octet près, partout. D117 : ILS NE CHANGENT PAS.

  ═══ DEUX RÉGIMES, PARCE QUE LE DÉPÔT EN A DEUX ═══

  - PAR LIEN — pagination d'écran, portée par l'adresse : `/membres`, `/evenements`,
    `/demandes`, `/arborescence` (liste des racines). C'est de la navigation : un `<Link>`,
    partageable, ouvrable dans un nouvel onglet.
  - PAR BOUTON — pagination D'UN NŒUD de l'arbre (`arborescence.tsx:518-543`), qui charge
    une page de disciples SANS quitter l'écran ni changer l'adresse. Un `<Link>` y serait
    faux : il n'existe aucune adresse qui décrive « la page 2 des disciples de ce nœud-ci ».

  Les deux régimes sont MUTUELLEMENT EXCLUSIFS dans le type : porter les deux produirait un
  lien qui, en plus de naviguer, déclencherait un chargement.

  ═══ LES `<span />` VIDES SONT INTENTIONNELS ═══

  `justify-between` avec un seul enfant colle ce lien à gauche. Les quatre paginations
  existantes rendent toutes un `<span />` à la place du lien absent, pour que « Page
  suivante » reste à droite quand on est sur la première page. Reproduit tel quel.
*/
export type ProprietesPagination =
  | {
      page: number
      pages: number
      lienVersPage: (page: number) => string
      indicateur?: boolean
      surChangement?: never
      enCours?: never
    }
  | {
      page: number
      pages: number
      surChangement: (page: number) => void
      indicateur?: boolean
      enCours?: boolean
      lienVersPage?: never
    }

const LIBELLE_PRECEDENTE = 'Page précédente'
const LIBELLE_SUIVANTE = 'Page suivante'

export function Pagination(proprietes: ProprietesPagination) {
  const { page, pages, indicateur = false } = proprietes

  /*
    Les quatre paginations existantes sont toutes sous `{pages > 1 ? … : null}`. Rendre une
    barre de navigation pour une liste d'une seule page ajouterait un repère `<nav>` que
    rien ne justifie, et un lecteur d'écran l'annoncerait.
  */
  if (pages <= 1) return null

  const precedente = page > 1
  const suivante = page < pages

  return (
    <nav
      aria-label="Pagination"
      className="chiffres-alignes flex items-center justify-between gap-esp-4"
    >
      {proprietes.lienVersPage ? (
        precedente ? (
          <Link
            href={proprietes.lienVersPage(page - 1)}
            className="cible-tactile text-petit text-action underline underline-offset-4"
          >
            {LIBELLE_PRECEDENTE}
          </Link>
        ) : (
          <span />
        )
      ) : (
        <Bouton
          variante="lien"
          disabled={!precedente || proprietes.enCours === true}
          onClick={() => proprietes.surChangement(page - 1)}
        >
          {LIBELLE_PRECEDENTE}
        </Bouton>
      )}

      {indicateur ? (
        <span className="text-petit text-encre-attenuee">
          page {page} sur {pages}
        </span>
      ) : null}

      {proprietes.lienVersPage ? (
        suivante ? (
          <Link
            href={proprietes.lienVersPage(page + 1)}
            className="cible-tactile text-petit text-action underline underline-offset-4"
          >
            {LIBELLE_SUIVANTE}
          </Link>
        ) : (
          <span />
        )
      ) : (
        <Bouton
          variante="lien"
          disabled={!suivante || proprietes.enCours === true}
          onClick={() => proprietes.surChangement(page + 1)}
        >
          {LIBELLE_SUIVANTE}
        </Bouton>
      )}
    </nav>
  )
}
```

**`indicateur` rend exactement `page {page} sur {pages}`**, la formulation de
`arborescence.tsx:531-533`, à l'octet près (minuscule initiale comprise). L'écran des racines
et l'annuaire, eux, portent leur décompte dans le **sous-titre** de `EnTetePage` (« N membres
· page X sur Y ») et n'activent pas `indicateur` : ce sont **deux textes différents**, et les
confondre en changerait un (D117).

- [ ] **Étape 5 : vérifier que les six fichiers de bornage n'ont PAS été touchés**

Cette tâche **crée l'outil**, elle ne l'adopte pas. L'adoption se fait écran par écran, dans
les tâches qui rouvrent ces fichiers (8, 17, 18, 19).

```bash
git status --porcelain src/app/
```

Attendu : **vide**.

- [ ] **Étape 6 : les portes, puis le commit**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls
```

```bash
git add src/composants/ui/pagination.tsx src/lib/navigation/bornage.ts src/lib/donnees/pagination.ts src/lib/donnees/pagination.test.ts
git commit -m "feat(ui): Pagination, et bornerPage extrait pour les six ecrans pagines (D121)" -m "nombreDePages reste dans src/lib/donnees/pagination.ts, qui porte deliberement l'absence de import 'server-only' pour que tests/rls fasse tourner exactement ce code hors de Next. bornerPage, qui appelle redirect(), vit dans un module a part : y importer next/navigation aurait detruit cette propriete." -m "Sept sites de bornage sur six fichiers — demandes/page.tsx en porte deux, c'est le seul ecran a double pagination du depot. Les conditions d'acces (if peutGerer, if estAdmin) restent AU SITE D'APPEL : les absorber ferait de bornerPage une decision d'autorisation." -m "Premier test de src/lib/donnees/pagination.ts, module livre en phase 5 sans aucun test. Verrouille l'invariant Math.max(1, ...) qui rend le bornage non bouclant, et le M5 du 2026-08-14 sur pageDemandee." -m "Aucun ecran n'est touche par cette tache : l'adoption se fait dans les taches 8, 17, 18 et 19." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7 : `Dialogue` — `<dialog>` natif, focus piégé, `Échap`, restitution (**D124**, **D125**)

**Fichiers :**
- Créer : `src/composants/ui/dialogue.tsx`
- Créer : `src/composants/ui/index.ts`
- Modifier : `src/app/globals.css` (**ajout de deux lignes** : `--voile` et `--color-voile`)
- Tester : `npx tsc --noEmit`, `npm run lint`

**Interfaces :**
- Consomme : `Bouton` (Task 2), les jetons de la Task 1.
- Produit, pour les Tasks 13, 14, 15 :

```ts
export type ProprietesDialogue = {
  ouvert: boolean
  message: string
  surConfirmation: () => void
  surAnnulation: () => void
}
export function Dialogue(proprietes: ProprietesDialogue): React.JSX.Element

export const LIBELLE_CONFIRMER = 'Confirmer'
export const LIBELLE_ANNULER = 'Annuler'
```

et `src/composants/ui/index.ts`, le ré-export unique des douze.

## ⚠️ D125 — CE COMPOSANT NE REMPLACE RIEN, IL CRÉE. SON RISQUE EST LE DÉFAUT, PAS LA DIVERGENCE.

Les neuf autres composants **extraient** un motif déjà écrit dix à vingt-cinq fois, et leur
risque est de **diverger** de ce qui existait. Celui-ci a **quinze appelants et zéro
implémentation existante à extraire** : il n'existe **aucun** `<dialog>`, **aucun**
`role="dialog"` dans tout le dépôt (`grep -rn '<dialog\|role="dialog"' src --include="*.tsx"`
→ 0). Son risque est le **défaut** — piège de focus, fermeture par `Échap`, restitution du
focus, comportement au clavier. **Il exige donc des preuves d'une autre nature**, et elles
sont écrites à la Task 15.

**Le `<dialog>` NATIF est choisi précisément pour cela.** `showModal()` donne les trois
comportements sans une ligne de JavaScript de piégeage : le contenu passe dans la couche
supérieure, tout le reste du document devient inerte, `Échap` déclenche `cancel` puis `close`,
et le navigateur restitue le focus au dernier élément focalisé. Un piège de focus écrit à la
main serait cent lignes de `keydown`, une liste de sélecteurs focalisables à maintenir, et un
défaut par navigateur.

### ⚠️ TEXTE AFFICHÉ NOUVEAU — LA SEULE DÉCLARATION DE TOUTE LA PHASE (D117)

`window.confirm()` affichait deux boutons fournis **par le navigateur**, dans la langue du
système. Ils n'ont **aucun antécédent dans le dépôt** : ce ne sont pas des textes de
l'application qu'on modifierait, ce sont deux textes qu'on **crée**. Déclarés ici avant
d'être écrits :

| Texte | Rôle | Justification |
|---|---|---|
| `Confirmer` | bouton de validation du dialogue | Le navigateur affichait « OK ». « Confirmer » dit ce que le bouton fait ; « OK » ne dit rien. Aucun texte existant du dépôt n'est modifié |
| `Annuler` | bouton de renoncement | Reprend exactement le libellé que les navigateurs francophones affichent pour `window.confirm`. Aucun changement perceptible pour l'utilisateur |

**Les quinze MESSAGES de confirmation, eux, ne changent pas d'un octet** (voir Tasks 13
et 14). Ils sont rendus par `whitespace-pre-line`, ce qui préserve leurs `\n\n`.

- [ ] **Étape 1 : ajouter le jeton de voile dans `src/app/globals.css`**

Dans le bloc `:root`, après `--anneau-focus-retrait` :

```css
  /*
    Le voile du dialogue modal (`::backdrop`). Dérivé de `--encre`, et non d'un noir pur :
    un fond neutre froid jurerait avec le biais vert des neutres. Déclaré ici comme tout le
    reste (D109) — aucun composant ne porte de valeur.
  */
  --voile: rgba(28, 35, 33, 0.45);
```

Dans le bloc `@theme inline`, après `--color-etat-neutre` :

```css
  --color-voile: var(--voile);
```

- [ ] **Étape 2 : `src/composants/ui/dialogue.tsx`**

```tsx
'use client'

import { useEffect, useId, useRef } from 'react'
import { Bouton } from './bouton'

/*
  ═══ D124 / D125 — LE DIXIÈME COMPOSANT, ET LE SEUL QUI CRÉE UN COMPORTEMENT ═══

  Quinze `window.confirm()` dans le dépôt, ZÉRO `<dialog>`, ZÉRO `role="dialog"`.
  `window.confirm()` n'est pas stylable, BLOQUE le fil d'exécution, se présente hors de la
  page, et sur mobile s'affiche comme une alerte système que rien ne rattache à
  l'application. Le remplacer est le SEUL geste de cette phase qui change un comportement
  perceptible.

  ═══ POURQUOI LE `<dialog>` NATIF, ET PAS UN MODAL ÉCRIT À LA MAIN ═══

  `showModal()` donne les TROIS comportements qui font la valeur de ce composant, sans une
  ligne de piégeage :
    - FOCUS PIÉGÉ : le contenu passe dans la couche supérieure et le reste du document
      devient inerte. La tabulation ne peut pas en sortir.
    - `Échap` FERME : le navigateur émet `cancel`, puis `close`.
    - RESTITUTION DU FOCUS : le navigateur rend le focus au dernier élément focalisé.
  Un piège de focus écrit à la main, c'est cent lignes de `keydown`, une liste de sélecteurs
  focalisables à maintenir, et un défaut par navigateur.

  ═══ `<form method="dialog">` — LE MÉCANISME QUI DISTINGUE CONFIRMER D'ANNULER ═══

  Un `<button value="…">` dans un `<form method="dialog">` ferme le dialogue ET pose sa
  valeur dans `dialog.returnValue`. `Échap`, lui, ferme SANS poser de valeur :
  `returnValue` reste la chaîne vide. UN SEUL gestionnaire `onClose` suffit donc à
  distinguer les trois issues — confirmé, annulé au bouton, annulé par `Échap` — et il n'y a
  aucun chemin par lequel le dialogue se ferme sans qu'une de nos deux fonctions de rappel
  soit appelée. C'est ce qui rend impossible l'état « dialogue fermé, appelant qui attend
  encore ».

  ═══ LA RESTITUTION EXPLICITE DU FOCUS, EN PLUS DE CELLE DU NAVIGATEUR ═══

  Le navigateur restitue déjà. On le refait quand même, pour deux raisons : la restitution
  native n'est pas OBSERVABLE par une preuve qui ne saurait pas si elle vient du navigateur
  ou du code, et surtout `surConfirmation` re-soumet souvent le formulaire du déclencheur
  (Task 13) — il FAUT que le focus soit revenu AVANT, faute de quoi un `requestSubmit`
  déclenché depuis un `<body>` focalisé laisserait l'utilisateur clavier en haut de page.

  ═══ CE COMPOSANT NE DÉCIDE DE RIEN ═══

  Il ne construit aucun message, n'en préfixe aucun, ne titre rien. Les quinze messages
  arrivent tels quels de leur site d'appel, INCHANGÉS À L'OCTET PRÈS (D117), et sont rendus
  en `whitespace-pre-line` pour que leurs `\n\n` produisent la même coupure de paragraphe
  que dans la boîte native.
*/
export const LIBELLE_CONFIRMER = 'Confirmer'
export const LIBELLE_ANNULER = 'Annuler'

const VALEUR_CONFIRMER = 'confirmer'

export type ProprietesDialogue = {
  ouvert: boolean
  /** Le message de confirmation, tel quel. Ses `\n` sont préservés. */
  message: string
  surConfirmation: () => void
  surAnnulation: () => void
}

export function Dialogue({ ouvert, message, surConfirmation, surAnnulation }: ProprietesDialogue) {
  const reference = useRef<HTMLDialogElement | null>(null)
  const declencheur = useRef<HTMLElement | null>(null)
  const idMessage = useId()

  useEffect(() => {
    const element = reference.current
    if (!element) return

    /*
      Les deux gardes `element.open` ferment la boucle : `surAnnulation` met `ouvert` à
      `false`, ce qui rejoue cet effet — mais le dialogue est DÉJÀ fermé à ce moment
      (`close` a précédé le rappel), donc `element.close()` n'est pas rappelé, et `close`
      n'est pas réémis. Sans ces gardes, `showModal()` sur un dialogue déjà ouvert lèverait
      un `InvalidStateError`.
    */
    if (ouvert && !element.open) {
      declencheur.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null
      element.showModal()
    } else if (!ouvert && element.open) {
      element.close()
    }
  }, [ouvert])

  function terminer() {
    const element = reference.current
    const confirme = element?.returnValue === VALEUR_CONFIRMER
    // Remise à zéro : sans elle, une deuxième ouverture fermée par `Échap` hériterait de la
    // valeur de la première, et serait lue comme une confirmation.
    if (element) element.returnValue = ''

    // AVANT le rappel : voir le commentaire de tête.
    const cible = declencheur.current
    declencheur.current = null
    cible?.focus()

    if (confirme) surConfirmation()
    else surAnnulation()
  }

  return (
    <dialog
      ref={reference}
      onClose={terminer}
      aria-labelledby={idMessage}
      className="m-auto max-w-md rounded-bord border border-bord-carte bg-surface p-esp-6 text-encre backdrop:bg-voile"
    >
      {/*
        `method="dialog"` : les deux boutons ferment le dialogue nativement et posent leur
        `value` dans `returnValue`. Aucun `preventDefault`, aucun gestionnaire de clic.
      */}
      <form method="dialog" className="flex flex-col gap-esp-6">
        <p id={idMessage} className="text-corps whitespace-pre-line">
          {message}
        </p>
        <div className="flex flex-wrap justify-end gap-esp-3">
          {/*
            ANNULER EN PREMIER DANS L'ORDRE DE TABULATION. Le premier élément focalisable
            reçoit le focus à l'ouverture d'un `<dialog>` modal : sur une confirmation de
            geste irréversible — archivage d'une fiche, révocation d'un token, conversion
            définitive d'un participant —, un `Entrée` réflexe doit renoncer, pas valider.
          */}
          <Bouton type="submit" value="" variante="secondaire">
            {LIBELLE_ANNULER}
          </Bouton>
          <Bouton type="submit" value={VALEUR_CONFIRMER} variante="principal">
            {LIBELLE_CONFIRMER}
          </Bouton>
        </div>
      </form>
    </dialog>
  )
}
```

- [ ] **Étape 3 : `src/composants/ui/index.ts` — le ré-export des DOUZE, et de douze seulement**

```ts
/*
  ═══ D110 — DOUZE COMPOSANTS, ET DOUZE SEULEMENT ═══

  Le seuil est le décompte de l'inventaire : chacun de ces motifs se répète AU MOINS DIX
  FOIS dans le dépôt. Ceux qui ne le franchissent pas ne sont PAS créés :
    - le FIL D'ARIANE n'existe que sur un écran (`arborescence.tsx:272`) ;
    - le MESSAGE DE SUCCÈS n'a que deux occurrences (`connexion/page.tsx:32`,
      `demandes/page.tsx:103`) — il passe par `Carte` avec le ton `succes` ;
    - l'ÉTAT VIDE compte une vingtaine de `<p>` « Aucun·e … », mais quatre variantes de
      classe pour un seul rôle : c'est une convention de TEXTE, pas un composant, et les
      textes sont arbitrés ailleurs (D117) ;
    - la CASE À COCHER compte 9 occurrences, toutes déjà correctes (voir `champ.tsx`).
  Les créer « pour la symétrie » produirait des composants à un seul appelant, que personne
  n'exerce et qui dérivent.

  CE FICHIER EST LA LISTE OFFICIELLE. Un treizième export ici est un défaut de revue, et la
  Task 24 le compte.
*/
export { Bouton, CLASSES_VARIANTE, type ProprietesBouton, type VarianteBouton } from './bouton'
export { Carte, type ProprietesCarte, type TonCarte } from './carte'
export { Champ, type LargeurChamp, type ProprietesChamp } from './champ'
export { Dialogue, LIBELLE_ANNULER, LIBELLE_CONFIRMER, type ProprietesDialogue } from './dialogue'
export { EnTetePage, type ProprietesEnTetePage } from './en-tete-page'
export { EtatBadge, type ProprietesEtatBadge, type TonEtat } from './etat-badge'
export { Formulaire, type ProprietesFormulaire } from './formulaire'
export { Liste, LigneListe, type ProprietesLigneListe } from './ligne-liste'
export { Pagination, type ProprietesPagination } from './pagination'
export { Refus, type ProprietesRefus } from './refus'
export { Selecteur, type OptionSelecteur, type ProprietesSelecteur } from './selecteur'
export { ZoneTexte, type ProprietesZoneTexte } from './zone-texte'
```

**`Liste` est exporté avec `LigneListe` et ne compte pas pour un treizième** : c'est le `<ul>`
qui accompagne obligatoirement la ligne (voir Task 5). D110 compte des **motifs**, pas des
symboles.

- [ ] **Étape 4 : vérifier qu'aucune valeur littérale n'a été introduite, et que le compte est de douze**

```bash
grep -rEn "#[0-9a-fA-F]{3,8}|(bg|text|border|ring|divide)-(red|amber|green|blue|neutral|gray|slate|zinc|stone|white|black)(-[0-9]{2,3})?" src/composants/ | wc -l
```

Attendu : **0**.

```bash
ls src/composants/ui/*.tsx | wc -l
```

Attendu : **12** (`bouton`, `carte`, `champ`, `dialogue`, `en-tete-page`, `etat-badge`,
`formulaire`, `ligne-liste`, `pagination`, `refus`, `selecteur`, `zone-texte`).

- [ ] **Étape 5 : les portes, puis le commit — PUIS LA PORTE DE FIN DE LOT A**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls
```

```bash
git add src/composants/ui/dialogue.tsx src/composants/ui/index.ts src/app/globals.css
git commit -m "feat(ui): Dialogue, le dixieme composant — <dialog> natif (D124, D125)" -m "showModal() donne les trois comportements qui font sa valeur — focus piege, Echap ferme, focus restitue — sans une ligne de piegeage. Un piege de focus ecrit a la main serait cent lignes de keydown, une liste de selecteurs focalisables a maintenir, et un defaut par navigateur." -m "<form method=\"dialog\"> distingue les trois issues par returnValue : confirme, annule au bouton, annule par Echap. Un seul onClose suffit, et aucun chemin ne ferme le dialogue sans appeler l'un des deux rappels." -m "Annuler est en premier dans l'ordre de tabulation : le premier element focalisable recoit le focus a l'ouverture, et sur une confirmation de geste irreversible un Entree reflexe doit renoncer, pas valider." -m "Deux textes affiches NOUVEAUX declares au titre de D117 : Confirmer et Annuler. Ils remplacent les boutons du navigateur, qui n'ont aucun antecedent dans le depot. Les quinze messages, eux, ne changent pas d'un octet." -m "Ce composant n'est adopte par aucun ecran ici : les quinze sites sont les taches 13 et 14." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Étape 6 : PORTE DE FIN DE LOT A**

```bash
npm run build
```

Attendu : **vert**. C'est la seule porte de ce lot : le socle change le CSS, et rien d'autre
ne le prouve. `test:e2e` et `test:e2e:prod` n'ont **rien de neuf à éprouver** — aucun écran
n'a été touché, et les douze composants n'ont **aucun appelant**. Les lancer ici coûterait
douze minutes pour rejouer à l'identique ce que `main` prouvait déjà.

**Consigner dans le rapport de lot** : la taille du CSS produit
(`ls -la .next/static/css/`), avant et après. Le retrait des deux polices Google et du bloc
sombre doit se voir.

---

# LOT B — LES TROIS TÉMOINS (Tasks 8 à 11)

**D120 impose cet ordre, et ce n'est pas de l'ordonnancement de confort.** `/membres`
(liste), `/membres/nouveau` (formulaire dense) et `/arborescence` (récursion) sont les trois
formes que **tous** les autres écrans déclinent, et les trois plus coûteuses. Si le socle est
mal dimensionné, ces trois-là le révèlent ; les vingt et un suivants ne révéleraient rien de
neuf. **Un composant partagé mal dimensionné se paie vingt fois.**

**Aucun autre écran ne doit être migré avant la Task 11.**

---

### Task 8 : témoin 1 — `/membres`, la liste (D115, D120, D121, D126)

**Fichiers :**
- Modifier : `src/app/membres/page.tsx` (**réécrit**, 156 lignes)
- Tester : `npx tsc --noEmit`, `npm run lint`

**Interfaces :**
- Consomme : `EnTetePage`, `Liste`, `LigneListe`, `Pagination`, `CLASSES_VARIANTE`
  (Tasks 2, 5, 6) ; `bornerPage` (Task 6).
- Produit : rien pour les tâches suivantes, **sauf la mesure** — c'est le premier écran de
  liste migré, et sa forme est le gabarit des Tasks 16 à 23.

## ⚠️ CET ÉCRAN EST COUVERT PAR DES PREUVES E2E QUI NE DOIVENT PAS ÊTRE MODIFIÉES (D119)

`tests/e2e/annuaire.spec.ts` porte **6 tests**, dont « l'annuaire pagine au-delà d'une page »
(preuve n°9 du §7 : **les preuves de pagination ne bougent pas d'une ligne** après
l'extraction de D121) et « une fiche archivée disparaît de l'annuaire ». `tests/e2e/autorite.spec.ts`
et `tests/e2e/creation-enrichie.spec.ts` traversent aussi cet écran.

**Si l'une rougit, c'est un SIGNAL, pas un test à ajuster.** Les textes affichés ne changent
pas : « Annuaire », « Nouveau membre », « Filtrer », « Toutes les antennes », « Aucun membre
ne correspond à cette recherche. », « Page précédente », « Page suivante », et le décompte
`{total} membre{s} · page X sur Y` sont repris **à l'octet près**.

## ⚠️ LE FORMULAIRE DE FILTRE NE PASSE PAS PAR `Champ` NI `Selecteur`, ET CE N'EST PAS UN OUBLI

`membres/page.tsx:88-113` est un **`<form method="get">`**, pas un `<form action>`. Trois
raisons, cumulatives, font que D111 **ne s'y applique pas** :

1. **Le mécanisme que D111 ferme n'existe pas ici.** React ne réinitialise que les champs non
   contrôlés d'un `<form action>`, à la complétion de l'action. Un formulaire GET **navigue** :
   la page est re-rendue depuis le serveur, et les `defaultValue` sont **rechargés depuis
   l'adresse**. C'est le comportement voulu, et c'est ce qui fait survivre le filtre à un
   rafraîchissement ou à un signet.
2. **`page.tsx` est un composant SERVEUR.** Le rendre contrôlé exigerait `'use client'` sur
   toute la page, donc de déplacer les trois lectures (`listerMembres`, `listerAntennes`,
   `rolesDuProfil`) et le garde `exigerProfilActif` — un changement d'architecture, pas de
   présentation, et D118 l'exclut.
3. **Les deux champs n'ont pas de libellé visible**, seulement un `aria-label`
   (`"Rechercher"`, `"Antenne"`). `Champ` et `Selecteur` exigent un `label` visible. Leur en
   donner un serait **un texte affiché nouveau**, que ce plan ne déclare pas (D117).

**Cette frontière vaut pour les DEUX formulaires GET du dépôt** : `membres/page.tsx:88` et
`evenements/page.tsx:62` (Task 17). Ils gardent leurs `<input>` / `<select>` nus, avec la
classe de champ écrite en toutes lettres et **un commentaire qui dit pourquoi**. Ce sont les
deux seuls, et il n'y en aura pas un troisième sans que ce commentaire soit relu.

- [ ] **Étape 1 : réécrire `src/app/membres/page.tsx`**

```tsx
import Link from 'next/link'
import { EnTetePage } from '@/composants/ui/en-tete-page'
import { LigneListe, Liste } from '@/composants/ui/ligne-liste'
import { Pagination } from '@/composants/ui/pagination'
import { CLASSES_VARIANTE } from '@/composants/ui/bouton'
import { listerAntennes } from '@/lib/donnees/antennes'
import { listerMembres, TAILLE_PAGE_ANNUAIRE } from '@/lib/donnees/membres'
import { pageDemandee } from '@/lib/donnees/pagination'
import { rolesDuProfil } from '@/lib/donnees/profils'
import { bornerPage } from '@/lib/navigation/bornage'
import { exigerProfilActif } from '@/lib/securite/garde'

const LIBELLE_SITUATION: Record<string, string> = {
  etudiant: 'Étudiant',
  travailleur: 'Travailleur',
  autre: 'Autre',
}

/*
  ⚠️ LE FORMULAIRE DE FILTRE CI-DESSOUS N'EMPLOIE NI `Champ` NI `Selecteur`, ET C'EST VOULU.

  C'est un `<form method="get">`, pas un `<form action>`. Le mécanisme que D111 ferme —
  React réinitialise les champs NON CONTRÔLÉS d'un `<form action>` à toute complétion de
  l'action — N'EXISTE PAS ICI : un formulaire GET NAVIGUE, la page est re-rendue depuis le
  serveur, et les `defaultValue` sont rechargés DEPUIS L'ADRESSE. C'est ce qui fait survivre
  le filtre à un rafraîchissement et à un signet.

  Le rendre contrôlé exigerait `'use client'` sur cette page, donc de déplacer les trois
  lectures et le garde `exigerProfilActif` — un changement d'architecture, pas de
  présentation (D118). Et les deux champs n'ont pas de libellé visible, seulement un
  `aria-label` : leur en donner un serait un texte affiché NOUVEAU (D117).

  DEUX FORMULAIRES GET DANS TOUT LE DÉPÔT — celui-ci et `evenements/page.tsx:62`. Il n'y en
  aura pas un troisième sans que ce commentaire soit relu.
*/
const CLASSE_CHAMP_FILTRE =
  'cible-tactile rounded-bord border border-bord-carte bg-surface px-esp-3 py-esp-2 text-corps text-encre'

export default async function PageAnnuaire({
  searchParams,
}: {
  searchParams: Promise<{ recherche?: string; antenne?: string; page?: string }>
}) {
  const profil = await exigerProfilActif()
  const parametres = await searchParams

  // Le filtre vient de l'adresse, donc du client. Une valeur qui n'est pas un
  // identifiant ferait échouer la requête sur une colonne `uuid` — un signet périmé
  // suffit. On l'ignore plutôt que de faire tomber l'écran.
  const antenneFiltre = /^[0-9a-f-]{36}$/i.test(parametres.antenne ?? '')
    ? parametres.antenne
    : undefined

  // `pageDemandee` (src/lib/donnees/pagination.ts) remplace le `Number.parseInt` recopié
  // ici : même code, même garde M5 (`Number('2.5') || 1` vaut 2.5, non entier, qui
  // franchissait la borne haute et s'affichait « page 2.5 sur N »).
  const page = pageDemandee(parametres.page)

  const [{ membres, total }, antennes, roles] = await Promise.all([
    listerMembres({ recherche: parametres.recherche, antenneId: antenneFiltre, page }),
    listerAntennes(),
    rolesDuProfil(profil.id),
  ])
  const estAdmin = roles.includes('administrateur')

  function lienPage(numero: number): string {
    const params = new URLSearchParams()
    if (parametres.recherche) params.set('recherche', parametres.recherche)
    if (antenneFiltre) params.set('antenne', antenneFiltre)
    params.set('page', String(numero))
    return `/membres?${params.toString()}`
  }

  // D121 — LE BORNAGE EST EXTRAIT, À COMPORTEMENT IDENTIQUE (src/lib/navigation/bornage.ts).
  // Une adresse pointant au-delà de la dernière page réelle est un signet périmé (ou un
  // résultat qui a rétréci depuis) : sans ce garde, l'en-tête affichait « N membres · page
  // 99 sur 2 » pendant que le corps affirmait qu'aucun membre ne correspond — deux vérités
  // contradictoires sur le même écran.
  // `total` vient de la LECTURE ELLE-MÊME, jamais d'un aller-retour préalable (I1, ronde du
  // 2026-08-14). HORS DE TOUT `try` : `bornerPage` appelle `redirect()`, qui lève une
  // exception de contrôle Next.js (aucun `try` dans ce fichier — vérifié).
  const pages = bornerPage(page, total, TAILLE_PAGE_ANNUAIRE, lienPage)

  return (
    <main className="mx-auto max-w-4xl px-esp-6 py-esp-10">
      <EnTetePage
        retour={{ href: '/tableau-de-bord', libelle: 'Retour au tableau de bord' }}
        titre="Annuaire"
        soustitre={
          <>
            {total} membre{total > 1 ? 's' : ''}
            {pages > 1 ? ` · page ${page} sur ${pages}` : ''}
          </>
        }
        action={
          estAdmin ? (
            <Link href="/membres/nouveau" className={CLASSES_VARIANTE.principal}>
              Nouveau membre
            </Link>
          ) : null
        }
      />

      {/* Formulaire GET — voir le commentaire de tête. Aucun `Champ`, aucun `Selecteur`. */}
      <form className="mb-esp-8 flex flex-wrap gap-esp-3" method="get">
        <input
          name="recherche"
          type="search"
          defaultValue={parametres.recherche ?? ''}
          placeholder="Nom, prénom ou ville"
          aria-label="Rechercher"
          className={`min-w-48 flex-1 ${CLASSE_CHAMP_FILTRE}`}
        />
        <select
          name="antenne"
          defaultValue={antenneFiltre ?? ''}
          aria-label="Antenne"
          className={CLASSE_CHAMP_FILTRE}
        >
          <option value="">Toutes les antennes</option>
          {antennes.map((antenne) => (
            <option key={antenne.id} value={antenne.id}>
              {antenne.nom}
            </option>
          ))}
        </select>
        <button type="submit" className={CLASSES_VARIANTE.secondaire}>
          Filtrer
        </button>
      </form>

      {membres.length === 0 ? (
        <p className="text-corps text-encre-attenuee">
          Aucun membre ne correspond à cette recherche.
        </p>
      ) : (
        <Liste>
          {membres.map((membre) => (
            /*
              ⚠️ PAS DE RAIL DE FILIATION ICI (piège n°6). L'annuaire affiche antenne, ville
              et situation — JAMAIS un faiseur de disciple. Un rail y marquerait une
              relation qui n'est pas affichée : une décoration qui affirme quelque chose de
              faux, la forme de défaut la plus coûteuse de ce projet. Les cinq écrans où le
              rail est légitime sont nommés dans les contraintes globales du plan.
            */
            <LigneListe
              key={membre.id}
              lien={`/membres/${membre.id}`}
              principal={`${membre.prenom} ${membre.nom}`}
              meta={[
                membre.antenneNom,
                membre.ville,
                membre.situation ? LIBELLE_SITUATION[membre.situation] : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            />
          ))}
        </Liste>
      )}

      <div className="mt-esp-8">
        <Pagination page={page} pages={pages} lienVersPage={lienPage} />
      </div>
    </main>
  )
}
```

**Trois différences de STRUCTURE avec l'original, et aucune de texte :**

| Avant | Après | Pourquoi |
|---|---|---|
| `<Link>` enveloppant nom **et** méta dans un `flex justify-between py-3` | `LigneListe` avec `lien`, `principal`, `meta` | D115 : sous 48 rem, la méta passe **sous** le nom au lieu de s'enrouler à côté |
| `{pages > 1 ? <nav …> : null}` écrit à la main | `<Pagination>` | `Pagination` porte lui-même le `pages <= 1 ? null` |
| `Math.max(1, Math.ceil(total / TAILLE_PAGE_ANNUAIRE))` + `if (page > pages) redirect(…)` | `bornerPage(…)` | D121 |

- [ ] **Étape 2 : vérifier qu'aucun texte affiché n'a bougé**

```bash
git diff src/app/membres/page.tsx | grep -E "^[-+].*[A-Za-zÀ-ÿ]{4,}" | grep -vE "^[-+]\s*(//|/\*|\*)" | grep -viE "class|import|const|function|return|export|null|true|false"
```

Relire la sortie **ligne à ligne**. Chaque texte affiché retiré doit avoir son jumeau ajouté,
**à l'octet près**. Si un seul diffère, **s'arrêter et le signaler** — ne pas le corriger dans
le test.

- [ ] **Étape 3 : les portes, puis le commit**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls
```

```bash
git add src/app/membres/page.tsx
git commit -m "refactor(ui): /membres — premier temoin, la forme liste (D120)" -m "Adopte EnTetePage, Liste, LigneListe, Pagination et bornerPage. Aucun texte affiche ne change : Annuaire, Nouveau membre, Filtrer, Toutes les antennes, le decompte et les deux libelles de pagination sont repris a l'octet pres." -m "Le formulaire de filtre GARDE ses <input> et <select> nus. C'est un <form method=\"get\"> : le mecanisme que D111 ferme n'existe pas la, la page est re-rendue depuis le serveur et les defaultValue sont recharges depuis l'adresse. Le rendre controle exigerait 'use client' sur une page serveur, donc de deplacer trois lectures et un garde." -m "Aucun rail de filiation : l'annuaire affiche antenne, ville et situation, jamais un faiseur de disciple." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9 : témoin 2 — `/membres/nouveau`, le formulaire dense (D111, D112, D113, D120, D127)

**Fichiers :**
- Modifier : `src/app/membres/formulaire-membre.tsx` (290 lignes — le `<form>`, les 10 champs,
  le bandeau de refus, le bouton)
- Modifier : `src/app/membres/nouveau/bloc-enrichissement.tsx` (318 lignes — les 3 champs
  répétés par ligne de statut, les 2 boutons, la mise en page)
- Modifier : `src/app/membres/nouveau/page.tsx` (l'en-tête)
- Tester : `npx tsc --noEmit`, `npm run lint`

**Interfaces :**
- Consomme : `Formulaire`, `Champ`, `Selecteur`, `Bouton`, `EnTetePage`, `Carte`
  (Tasks 2, 3, 4, 5).
- Produit : rien pour les tâches suivantes, **sauf la mesure** — c'est le gabarit de tous les
  formulaires migrés aux Tasks 12, 16 à 23.

## ⚠️ CET ÉCRAN EST LE PLUS DENSE DU DÉPÔT, ET IL EST DÉJÀ CORRECT. NE RIEN CASSER.

608 lignes cumulées sur deux fichiers (290 + 318), **troisième et deuxième plus gros du
dépôt** après `arborescence.tsx`. C'est aussi celui que la phase 5 vient de rendre
**entièrement contrôlé** (D85), et qui porte **déjà** :

- `onReset={(e) => e.preventDefault()}` (`formulaire-membre.tsx:130`) — D112, à remplacer par
  `Formulaire`, jamais à retirer sans remplacement ;
- le focus au refus (`formulaire-membre.tsx:104-110` et `269-279`) — D113, à remplacer par
  `Formulaire`/`Refus`, **jamais à retirer sans remplacement** ;
- le motif de `useRef` de séquence contre les réponses réseau périmées
  (`bloc-enrichissement.tsx:65-101`) — **HORS PÉRIMÈTRE, ne pas y toucher** ;
- `SelecteurMembre` (`membres/selecteur-membre.tsx`), **déjà contrôlé**, monté trois fois —
  **HORS PÉRIMÈTRE de cette tâche**, il est migré à la Task 22 avec les autres satellites.

**`formulaire-membre.tsx` est PARTAGÉ avec `/membres/[id]/modifier`** (Task 22). Le modifier
ici change les deux écrans. C'est voulu et c'est déjà le cas aujourd'hui, mais toute
vérification doit couvrir **les deux**.

**Preuves e2e traversant ces fichiers, qui ne doivent pas être modifiées (D119) :**
`tests/e2e/creation-enrichie.spec.ts` (3 tests), `tests/e2e/annuaire.spec.ts`,
`tests/e2e/arbre.spec.ts`, et **`tests/e2e-prod/creation-enrichie-production.spec.ts` (3 des
10 preuves de production)** — cette dernière éprouve précisément que **la saisie survit à un
refus retourné**, c'est-à-dire exactement ce que D111 et D112 protègent.

- [ ] **Étape 1 : `formulaire-membre.tsx` — remplacer le `<form>` par `Formulaire`**

Substitutions, **dans cet ordre** :

**1a.** Les imports (lignes 1-5). Retirer `useEffect` et `useRef` **seulement si plus aucun
autre usage ne subsiste** — `useId` reste (champ « AEL déjà suivis »).

```tsx
'use client'

import { useActionState, useId, useState, type ReactNode } from 'react'
import { Bouton } from '@/composants/ui/bouton'
import { Champ } from '@/composants/ui/champ'
import { Formulaire } from '@/composants/ui/formulaire'
import { Selecteur } from '@/composants/ui/selecteur'
import type { Antenne } from '@/lib/donnees/antennes'
import type { MembreDetail } from '@/lib/donnees/membres'
import type { EtatFormulaireMembre } from './actions'
```

**1b.** Supprimer le bloc `zoneErreur` + `enCoursPrecedent` + `useEffect`
(lignes 83-110 : la déclaration `const zoneErreur = useRef(...)`, le grand commentaire
« POURQUOI CE `useRef` FERME LA COURSE AU MONTAGE PAR CONSTRUCTION », et l'effet).

**⚠️ NE PAS SUPPRIMER SANS REMPLACEMENT.** Ce bloc EST D113. Il migre dans
`src/composants/ui/formulaire.tsx`, où son commentaire est repris **mot pour mot** — vérifier
qu'il y figure **avant** de le retirer d'ici. C'est l'un des **deux seuls** formulaires du
dépôt à porter ce mécanisme.

**1c.** Le `<form>` (ligne 130) et sa fermeture (ligne 285) :

```tsx
    <Formulaire action={envoyer} erreur={etat.erreur} enCours={enCours}>
      {membre ? <input type="hidden" name="id" value={membre.id} /> : null}
      {/* … les champs … */}
      {children}
      <Bouton type="submit" variante="principal" alignement="debut" enCours={enCours} libelleAttente="Enregistrement…">
        {libelleBouton}
      </Bouton>
    </Formulaire>
```

`onReset` **disparaît de ce fichier** parce que `Formulaire` le porte inconditionnellement
(D112) — et hors de son type de propriétés, donc irretirable. Les deux autres fichiers qui
le portaient à la main (`evenements/formulaire-evenement.tsx:95`,
`inscription/formulaire-inscription.tsx:91`) sont traités aux Tasks 19 et 12.

**1d.** Supprimer le bandeau de refus (lignes 269-279) : `Formulaire` rend `Refus` lui-même,
**à la même place** — juste après `children`, juste avant le bouton.

**1e.** Le bouton (lignes 281-284). Le libellé d'attente `'Enregistrement…'` et `libelleBouton`
sont repris **tels quels** (D117).

**1f.** Les dix champs. Substitution mécanique, **une par une** :

| Ligne d'origine | Devient |
|---|---|
| `<label><span>Prénom (obligatoire)</span><input name="prenom" value={prenom} onChange={…} required className="rounded-md …"/></label>` | `<Champ label="Prénom (obligatoire)" name="prenom" value={prenom} onChange={(e) => setPrenom(e.target.value)} required />` |
| idem `nom` | `<Champ label="Nom (obligatoire)" name="nom" … required />` |
| idem `telephone` (`type="tel"`) | `<Champ label="Téléphone" name="telephone" type="tel" … />` |
| idem `emailContact` (`type="email"`) | `<Champ label="Adresse de contact" name="emailContact" type="email" … />` |
| idem `ville` | `<Champ label="Ville" name="ville" … />` |
| idem `pays` | `<Champ label="Pays" name="pays" … />` |
| `<select name="antenneId">` + `<option>` construits | `<Selecteur label="Antenne" name="antenneId" value={antenneId} onChange={…} options={[{ valeur: '', libelle: 'Non rattaché' }, ...optionsAntennes.map((a) => ({ valeur: a.id, libelle: \`${a.nom}${a.inactive ? ' (désactivée)' : ''}\` }))]} />` |
| `<select name="situation">` | `<Selecteur label="Situation" name="situation" value={situation} onChange={…} options={[{ valeur: '', libelle: 'Non renseignée' }, { valeur: 'etudiant', libelle: 'Étudiant' }, { valeur: 'travailleur', libelle: 'Travailleur' }, { valeur: 'autre', libelle: 'Autre' }]} />` |
| `domaineEtude`, **sous `situation === 'etudiant'`** | `<Champ label="Domaine d'étude" name="domaineEtude" … />` — **garder la condition telle quelle** |
| bloc `idAel` avec `htmlFor` + aide | `<Champ label="AEL déjà suivis" name="reportInitialAel" type="number" min={0} step={1} value={reportInitialAel} onChange={…} aide="Avant la mise en service de l'application." />` |

**Quatre points de vigilance sur cette substitution :**

1. **`Domaine d'étude` s'écrit `label="Domaine d'étude"` en JSX-prop, avec une apostrophe
   DROITE dans une chaîne délimitée par des guillemets doubles.** Le `&apos;` du JSX rendu
   ne s'applique **pas** à une valeur de propriété : `label={"Domaine d&apos;étude"}`
   afficherait littéralement `&apos;`. Même remarque pour l'aide
   `"Avant la mise en service de l'application."`.
2. **`useId` disparaît** : `Champ` génère son propre identifiant et relie l'aide par
   `aria-describedby`. Retirer l'import s'il n'a plus d'usage.
3. **`optionsAntennes` reste** (lignes 112-126) : la logique qui réinjecte l'antenne
   désactivée du membre est **du métier**, pas de la présentation. La retirer détacherait
   silencieusement le membre de son antenne au premier enregistrement — le commentaire
   d'origine le dit, et il est **conservé**.
4. **La grille `sm:grid-cols-2` (ligne 135) devient `md:grid-cols-2`** — D115 : trois points
   de rupture réels, et `sm` à 40 rem était trop tôt pour deux colonnes de champs sur un
   téléphone en paysage.

- [ ] **Étape 2 : `bloc-enrichissement.tsx` — les trois champs répétés et les deux boutons**

| Ligne d'origine | Devient |
|---|---|
| `<div className="… border-t border-neutral-200 pt-6">` (L153) | `<div className="flex flex-col gap-esp-8 border-t border-filet pt-esp-6">` |
| `<p className="text-sm text-neutral-500">` (L154) | `<p className="text-petit text-encre-attenuee">` |
| `<h2 className="text-lg font-medium">` (L161, L272) | `<h2 className="text-section">` |
| `<p className="text-sm text-neutral-600">Aucun statut à attribuer.</p>` (L163) | `<p className="text-petit text-encre-attenuee">Aucun statut à attribuer.</p>` |
| `<fieldset className="… rounded-md border border-neutral-300 p-4">` (L171-174) | `<fieldset className="flex flex-col gap-esp-3 rounded-bord border border-bord-carte p-esp-4">` |
| `<legend className="px-1 text-sm font-medium">` (L175) | `<legend className="px-esp-1 text-nom">` |
| le `<select statutId>` avec ses `<optgroup>` (L177-207) | **RESTE UN `<select>` NU** — voir ci-dessous |
| le champ `statutDateAcquisition` (L216-235) | `<Champ label="Date d'acquisition" name="statutDateAcquisition" type="date" max={aujourdhui} value={ligne.dateAcquisition} onChange={…} aide="Facultative. Elle n'est pas toujours connue." />` |
| le champ `statutNote` (L237-249) | `<Champ label="Note" name="statutNote" maxLength={500} value={ligne.note} onChange={…} />` |
| `<button …>Retirer ce statut</button>` (L251-257) | `<Bouton variante="lien" alignement="debut" onClick={() => retirerLigne(ligne.cle)}>Retirer ce statut</Bouton>` |
| `<button …>Ajouter un statut</button>` (L262-268) | `<Bouton variante="secondaire" alignement="debut" onClick={ajouterLigne}>Ajouter un statut</Bouton>` |
| `<p className="text-xs text-neutral-500">` (L298) | `<p className="text-petit text-encre-attenuee">` |
| `<button …>Revenir au dirigeant calculé</button>` (L303-309) | `<Bouton variante="lien" onClick={revenirAuCalcul}>Revenir au dirigeant calculé</Bouton>` |

## ⚠️ LE `<select statutId>` NE PASSE PAS PAR `Selecteur`, ET C'EST LA SECONDE FRONTIÈRE DU PLAN

`bloc-enrichissement.tsx:181-206` rend des **`<optgroup>`** — un groupe par groupe de statuts,
avec le libellé `« ${groupe.nom} (un seul à la fois) »` quand le groupe est exclusif. Et sa
première option est `<option value="" disabled>Choisir un statut…</option>`, **désactivée**.

`Selecteur` prend une **liste plate** `OptionSelecteur[]` : ni groupe, ni option désactivée.
C'était un choix délibéré (voir son commentaire de tête : « passer des `<option>` en enfants
laisserait un appelant y glisser un `<optgroup>` stylé, un `<option>` avec sa propre classe,
ou un `defaultValue` déguisé en `selected` »).

**Trois issues possibles, et la troisième est retenue :**

1. Aplatir les groupes en préfixant le libellé — **refusé** : ce serait changer un texte
   affiché (D117), sur un écran couvert par `creation-enrichie.spec.ts`.
2. Ajouter `groupes?: …` à `Selecteur` — **refusé ICI, réexaminé à la Task 11.** Un seul
   appelant en a besoin ; élargir un composant du socle pour un appelant unique, au milieu du
   premier lot d'écrans, est exactement ce que D120 demande de mesurer **avant** de décider.
3. **Garder un `<select>` nu, contrôlé, avec la classe de champ et un commentaire.** Il est
   **déjà contrôlé** (`value={ligne.statutId}` + `onChange`), donc D111 est satisfaite **sur
   le fond** ; ce qui manque, c'est seulement le passage par le composant.

**La Task 11 tranche.** Elle compte les appelants réels d'un `<select>` groupé — il y en a
**deux** : celui-ci et `membres/[id]/statuts/formulaire-statut.tsx:39` (Task 22). Deux
appelants, c'est la question que D120 fait poser au bon moment.

**⚠️ NE PAS TOUCHER aux lignes 60-133** de `bloc-enrichissement.tsx` : `forceRef`, `sequence`,
`changerFaiseur`, `changerDirigeant`, `revenirAuCalcul`, `mentionDirigeant`. C'est le motif de
garde contre les réponses réseau périmées, établi en revue, **recopié** depuis
`membres/[id]/arbre/formulaire-arbre.tsx` (le commentaire de la ligne 64 le dit). Le
factoriser serait une correction de fond, hors périmètre (D118, piège n°4) — **le signaler
dans le rapport de tâche, ne pas le corriger**.

- [ ] **Étape 3 : `src/app/membres/nouveau/page.tsx` — l'en-tête**

Remplacer le lien de retour + le `<h1 className="mt-4 mb-2 text-2xl font-semibold">` + le
paragraphe d'introduction par un `<EnTetePage retour={…} titre={…} soustitre={…} />`, et le
conteneur `mx-auto max-w-2xl px-6 py-10` par `mx-auto max-w-2xl px-esp-6 py-esp-10`.
**Les textes ne changent pas.**

- [ ] **Étape 4 : vérifier que D111, D112 et D113 tiennent TOUS LES TROIS sur cet écran**

```bash
grep -n "defaultValue" src/app/membres/formulaire-membre.tsx src/app/membres/nouveau/bloc-enrichissement.tsx
```

Attendu : **zéro ligne**.

```bash
grep -n "onReset" src/app/membres/formulaire-membre.tsx
```

Attendu : **zéro ligne** — `Formulaire` le porte.

```bash
grep -rn "onReset" src/composants/ui/formulaire.tsx
```

Attendu : **une ligne**. Si elle manque, D112 a été **retirée sans remplacement**.

```bash
grep -n "zoneErreur\|role=\"alert\"" src/app/membres/formulaire-membre.tsx
grep -n "tabIndex={-1}" src/composants/ui/refus.tsx
```

Attendu : **zéro** dans le premier, **une** dans le second. Si le second est vide, D113 a été
retirée sans remplacement.

- [ ] **Étape 5 : vérifier qu'aucun texte affiché n'a bougé, sur les DEUX fichiers**

```bash
git diff src/app/membres/formulaire-membre.tsx src/app/membres/nouveau/bloc-enrichissement.tsx src/app/membres/nouveau/page.tsx | grep -E "^[-+].*[A-Za-zÀ-ÿ]{4,}" | grep -vE "^[-+]\s*(//|/\*|\*)" | grep -viE "class|import|const|function|return|export"
```

Relire **ligne à ligne**. Attention particulière aux dix libellés de champ, aux quatre
libellés d'option de `situation`, aux deux libellés d'option d'antenne (`Non rattaché`,
` (désactivée)`), aux quatre libellés de bouton, et aux cinq phrases de `mentionDirigeant()`.

- [ ] **Étape 6 : les portes, puis le commit**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls
```

```bash
git add src/app/membres/formulaire-membre.tsx src/app/membres/nouveau/bloc-enrichissement.tsx src/app/membres/nouveau/page.tsx
git commit -m "refactor(ui): /membres/nouveau — deuxieme temoin, la forme formulaire dense (D120)" -m "608 lignes cumulees sur deux fichiers, le plus dense du depot apres l'arborescence. Adopte Formulaire, Champ, Selecteur, Bouton et EnTetePage." -m "onReset et le focus au refus ne sont pas RETIRES, ils sont DEPLACES : Formulaire les porte desormais pour les vingt-cinq formulaires du depot. Verifie par grep dans les deux sens avant et apres." -m "Le <select> des statuts reste nu : il rend des <optgroup>, que Selecteur ne prend pas par construction. Il est deja controle, donc D111 est satisfaite sur le fond. Deux appelants ont ce besoin dans le depot ; la Task 11 tranche s'il faut elargir Selecteur." -m "Le motif de useRef de sequence contre les reponses reseau perimees (L60-133) n'est pas touche : le factoriser serait une correction de fond, hors perimetre." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10 : témoin 3 — `/arborescence`, la récursion scindée et ses DEUX barrières (**D122**, D106, D120, D127)

**Fichiers :**
- Créer : `src/lib/domaine/arbre-affichage.ts`
- Créer : `src/lib/domaine/arbre-affichage.test.ts`
- Créer : `src/app/arborescence/noeud.tsx`
- Modifier : `src/app/arborescence/arborescence.tsx` (548 lignes → environ 300 : le composant
  `Noeud`, lignes 371-548, part dans le fichier neuf)
- Modifier : `src/app/arborescence/page.tsx` (en-tête, bornage)
- Modifier : `src/app/globals.css` (**ajout** : `--indent-niveau` et l'utilitaire `retrait-*`)
- Tester : `npm test`, puis `npx tsc --noEmit`, `npm run lint`

**Interfaces :**
- Consomme : `EnTetePage`, `Pagination`, `Bouton`, `Carte` (Tasks 2, 5, 6) ; `bornerPage`
  (Task 6).
- Produit :

```ts
// src/lib/domaine/arbre-affichage.ts
export function basculeRefusee(membreId: string, ancetres: readonly string[]): boolean
export function noeudDeplie(
  membreId: string,
  deplies: readonly string[],
  ancetres: readonly string[],
): boolean
export const PROFONDEUR_MAX_INDENTATION: 4
export function niveauDeRetrait(profondeur: number): number

// src/app/arborescence/noeud.tsx
export type PropsNoeud = { /* inchangé, voir l'étape 4 */ }
export function Noeud(props: PropsNoeud): React.JSX.Element
```

## ⚠️⚠️ LES DEUX BARRIÈRES ANTI-CYCLE DOIVENT SURVIVRE AU DÉCOUPAGE. LIRE LES DEUX AVANT DE DÉPLACER UNE LIGNE.

Elles sont **distinctes et non factorisables**, documentées comme nécessaires **l'une ET
l'autre** (commentaires D105 dans le fichier). Le scénario qu'elles empêchent est nommé : **une
récursion infinie qui fige l'onglet sur une donnée corrompue**, sans que rien n'indique
pourquoi.

**Barrière n°1 — LE CLIC** (`arborescence.tsx:109-116`, dans `basculer`) :

```tsx
function basculer(membreId: string, ancetres: readonly string[]) {
  if (ancetres.includes(membreId)) {
    console.error(
      'arborescence : dépliage refusé, ce membre est déjà présent dans la branche affichée — donnée incohérente ?',
      { membreId, ancetres },
    )
    return
  }
  // …
}
```

Elle **ne ferme que le clic**, et **elle ne suffit pas** : `allerA` (la recherche) écrit
directement dans `deplies` **sans passer par elle** (`arborescence.tsx:188-191`, et son
commentaire le dit explicitement). Elle reste parce qu'elle est **la seule à pouvoir DIRE
quelque chose** — une trace de console à l'instant du geste.

**Barrière n°2 — LE RENDU** (`arborescence.tsx:425`, dans `Noeud`) :

```tsx
const deplie = etat.deplies.includes(membre.id) && !ancetres.includes(membre.id)
```

**C'est CELLE-CI qui borne réellement la récursion.** `deplies` est une liste **globale**, pas
une liste par branche : sur une donnée porteuse d'un cycle A → B → A, les deux identifiants
seraient dépliés et `Noeud(A) → Noeud(B) → Noeud(A) → …` récurserait sans borne. **Elle a été
posée en toute fin de phase 5, par la vague de correction finale** : la déplacer sans la
tester la ferait disparaître sans bruit, et **sur une donnée saine elle ne change
strictement rien** — c'est exactement ce qui rend sa disparition invisible.

**C'est pourquoi cette tâche les extrait en FONCTIONS PURES, chacune avec son test.** Une
barrière noyée dans 548 lignes de JSX ne se teste pas ; une fonction de trois lignes, si.

- [ ] **Étape 1 : `src/lib/domaine/arbre-affichage.ts` — les deux barrières, pures**

```ts
/**
 * ═══ LES DEUX BARRIÈRES ANTI-CYCLE DE L'AFFICHAGE DE L'ARBRE (D105, D122) ═══
 *
 * Les deux barrières de la DONNÉE — le déclencheur `membres_anti_cycle` et la vérification
 * de `public.definir_arbre` — rendent un cycle IMPOSSIBLE EN BASE. **L'AFFICHAGE NE DOIT PAS
 * EN DÉPENDRE** : un dépliage automatique piloté par la recherche, sur une donnée corrompue,
 * BOUCLERAIT DANS LE NAVIGATEUR — l'onglet se fige, et rien n'indique pourquoi. Même
 * raisonnement que la borne à 64 niveaux des fonctions récursives, « la seule protection
 * restante si une donnée corrompue franchissait un jour les barrières » (1c, piège n°5).
 *
 * CES DEUX FONCTIONS SONT EXTRAITES DE `arborescence.tsx` PAR LA PHASE 6, SANS UN
 * CARACTÈRE DE LOGIQUE CHANGÉ. Elles vivent ici pour une seule raison : une barrière noyée
 * dans 548 lignes de JSX ne se teste pas. `arbre-affichage.test.ts` en porte une preuve
 * chacune.
 *
 * PAS de `import 'server-only'` : c'est de la logique de PRÉSENTATION, employée par un
 * composant client, et l'environnement `node` de `vitest.config.ts` doit pouvoir la faire
 * tourner telle quelle.
 */

/**
 * BARRIÈRE N°1 — LE CLIC. Refuse de déplier un nœud DÉJÀ PRÉSENT DANS LA BRANCHE COURANTE.
 *
 * `ancetres` porte les identifiants des nœuds AU-DESSUS de celui-ci dans la branche
 * **RENDUE** — pas dans l'arbre en base : c'est bien le cycle d'AFFICHAGE qu'on ferme.
 *
 * ⚠️ CE REFUS-CI NE FERME QUE LE CLIC, ET IL NE SUFFIT PAS. `allerA` (la recherche) écrit
 * dans `deplies` sans passer par lui. La barrière qui BORNE RÉELLEMENT LA RÉCURSION est
 * `noeudDeplie`, appliquée au rendu. Celle-ci existe parce qu'elle est la seule à pouvoir
 * DIRE quelque chose : son appelant journalise une trace à l'instant du geste. NE PAS LA
 * SUPPRIMER SOUS PRÉTEXTE QUE L'AUTRE SUFFIT — elles ne font pas le même travail.
 */
export function basculeRefusee(membreId: string, ancetres: readonly string[]): boolean {
  return ancetres.includes(membreId)
}

/**
 * BARRIÈRE N°2 — LE RENDU. **C'est celle qui borne réellement la récursion.**
 *
 * `deplies` est une liste GLOBALE, pas une liste par branche. Sur une donnée porteuse d'un
 * cycle A → B → A, les deux identifiants seraient dépliés et `Noeud(A) → Noeud(B) →
 * Noeud(A) → …` récurserait sans borne : l'onglet se fige. C'est LITTÉRALEMENT le scénario
 * que D105 nomme dans sa justification, et c'est le RENDU qu'elle vise.
 *
 * `ancetres` s'allonge d'un cran à chaque niveau : refuser de déplier un nœud qui s'y trouve
 * déjà BORNE la récursion au nombre de nœuds distincts chargés, quelle que soit la donnée.
 *
 * ⚠️ SUR UNE DONNÉE SAINE, CETTE CONDITION NE CHANGE STRICTEMENT RIEN — dans un arbre sans
 * cycle, aucun nœud n'est son propre ancêtre. C'EST EXACTEMENT CE QUI REND SA DISPARITION
 * INVISIBLE, et c'est pourquoi `arbre-affichage.test.ts` en porte un test d'INVARIANT et pas
 * seulement un test de comportement.
 *
 * Le nœud répété reste AFFICHÉ — l'effacer cacherait le cycle —, simplement replié. Le clic
 * dessus retombe sur `basculeRefusee`, qui, lui, le journalise. ON NE JOURNALISE PAS ICI :
 * un rendu peut se rejouer autant de fois que React le décide.
 */
export function noeudDeplie(
  membreId: string,
  deplies: readonly string[],
  ancetres: readonly string[],
): boolean {
  return deplies.includes(membreId) && !ancetres.includes(membreId)
}

/**
 * D104 — L'INDENTATION EST PLAFONNÉE, ET LE FIL D'ARIANE PORTE LE RESTE.
 *
 * Interface mobile d'abord (§3 de la spécification maîtresse). Une indentation
 * proportionnelle à la profondeur épuise la largeur d'un téléphone vers le cinquième niveau,
 * et l'arbre devient illisible LÀ OÙ IL EST LE PLUS CONSULTÉ. Au-delà du plafond, le niveau
 * est écrit en toutes lettres sur le nœud : c'est l'information que l'indentation ne peut
 * plus porter.
 *
 * VALEUR REPRISE TELLE QUELLE de `arborescence.tsx:26`.
 */
export const PROFONDEUR_MAX_INDENTATION = 4

/**
 * Le niveau de retrait effectif, plafonné. Rend un entier de 0 à
 * `PROFONDEUR_MAX_INDENTATION` inclus — donc CINQ valeurs possibles, et cinq seulement.
 *
 * C'est ce plafond qui permet de remplacer les DEUX SEULES LIGNES `style={{ marginLeft }}`
 * du dépôt (`arborescence.tsx:438` et `:521`) par une classe : un ensemble fini de cinq
 * valeurs n'a pas besoin d'être calculé en JavaScript.
 */
export function niveauDeRetrait(profondeur: number): number {
  return Math.min(Math.max(profondeur, 0), PROFONDEUR_MAX_INDENTATION)
}
```

- [ ] **Étape 2 : `src/lib/domaine/arbre-affichage.test.ts` — UNE PREUVE PAR BARRIÈRE**

```ts
import { describe, expect, it } from 'vitest'
import {
  basculeRefusee,
  niveauDeRetrait,
  noeudDeplie,
  PROFONDEUR_MAX_INDENTATION,
} from './arbre-affichage'

describe('basculeRefusee — BARRIERE N°1, le clic', () => {
  it('refuse de deplier un noeud deja present dans la branche affichee', () => {
    expect(basculeRefusee('a', ['racine', 'a'])).toBe(true)
  })

  it('laisse passer un noeud absent de la branche', () => {
    expect(basculeRefusee('b', ['racine', 'a'])).toBe(true === false ? true : false)
    expect(basculeRefusee('b', ['racine', 'a'])).toBe(false)
  })

  it('laisse passer une racine, dont la branche est vide', () => {
    expect(basculeRefusee('racine', [])).toBe(false)
  })

  /*
    LE CAS QUI A JUSTIFIÉ LA BARRIÈRE : un membre qui serait son PROPRE faiseur de disciple.
    Impossible en base (déclencheur `membres_anti_cycle`), et c'est précisément pourquoi
    l'affichage ne doit pas en dépendre.
  */
  it("refuse un noeud qui serait son propre ancetre immediat", () => {
    expect(basculeRefusee('a', ['a'])).toBe(true)
  })
})

describe('noeudDeplie — BARRIERE N°2, le rendu, celle qui borne la recursion', () => {
  it('deplie un noeud present dans deplies et absent de la branche', () => {
    expect(noeudDeplie('a', ['a'], ['racine'])).toBe(true)
  })

  it('ne deplie pas un noeud absent de deplies', () => {
    expect(noeudDeplie('a', ['b'], ['racine'])).toBe(false)
  })

  /*
    ═══ LE CAS QUE LA BARRIÈRE EXISTE POUR FERMER ═══

    `deplies` est une liste GLOBALE. Sur un cycle A → B → A, `allerA` y met les deux
    identifiants SANS passer par `basculeRefusee`. Sans cette condition, `Noeud(A)` rendrait
    `Noeud(B)` qui rendrait `Noeud(A)` — sans borne, jusqu'au figement de l'onglet.
  */
  it('REFUSE de deplier un noeud deja present dans la branche, MEME s il est dans deplies', () => {
    expect(noeudDeplie('a', ['a', 'b'], ['a', 'b'])).toBe(false)
  })

  /*
    ═══ L'INVARIANT, ET NON SEULEMENT LE COMPORTEMENT ═══

    Cette barrière a été posée en TOUTE FIN DE PHASE 5 et, SUR UNE DONNÉE SAINE, ELLE NE
    CHANGE STRICTEMENT RIEN : dans un arbre sans cycle, aucun nœud n'est son propre ancêtre.
    C'est exactement ce qui rendrait sa disparition invisible à un test de comportement
    ordinaire, et c'est pourquoi le test suivant existe.

    Il asserte les DEUX moitiés de l'invariant :
      - sur une branche saine, `noeudDeplie` est ÉQUIVALENT à `deplies.includes` ;
      - dès que l'identifiant apparaît dans la branche, l'équivalence CESSE.
    Un `noeudDeplie` amputé de sa seconde condition satisferait la première moitié et
    TOMBERAIT sur la seconde.
  */
  it('est equivalent a deplies.includes tant que la branche est saine, et cesse de l etre sinon', () => {
    const deplies = ['a', 'b', 'c']
    const brancheSaine = ['racine', 'x', 'y']
    for (const identifiant of ['a', 'b', 'c', 'd', 'racine', 'x']) {
      expect(noeudDeplie(identifiant, deplies, brancheSaine)).toBe(deplies.includes(identifiant))
    }

    const brancheCyclique = ['racine', 'a']
    expect(deplies.includes('a')).toBe(true)
    expect(noeudDeplie('a', deplies, brancheCyclique)).toBe(false)
  })
})

describe('niveauDeRetrait — D104, l indentation plafonnee', () => {
  it('plafonne au-dela de la profondeur maximale', () => {
    expect(niveauDeRetrait(PROFONDEUR_MAX_INDENTATION)).toBe(PROFONDEUR_MAX_INDENTATION)
    expect(niveauDeRetrait(PROFONDEUR_MAX_INDENTATION + 1)).toBe(PROFONDEUR_MAX_INDENTATION)
    expect(niveauDeRetrait(99)).toBe(PROFONDEUR_MAX_INDENTATION)
  })

  it('rend la profondeur telle quelle en deca du plafond', () => {
    expect(niveauDeRetrait(0)).toBe(0)
    expect(niveauDeRetrait(3)).toBe(3)
  })

  /*
    L'INVARIANT QUI PERMET DE SUPPRIMER LES DEUX `style={{ marginLeft }}` : l'image de cette
    fonction est un ENSEMBLE FINI de cinq entiers, donc cinq classes suffisent.
  */
  it('ne rend jamais que cinq valeurs distinctes', () => {
    const valeurs = new Set(Array.from({ length: 50 }, (_, i) => niveauDeRetrait(i)))
    expect(valeurs.size).toBe(PROFONDEUR_MAX_INDENTATION + 1)
  })
})
```

**⚠️ Corriger la ligne bavarde du deuxième test avant de committer** — la première assertion
de « laisse passer un noeud absent de la branche » est une redondance d'écriture ; ne garder
que `expect(basculeRefusee('b', ['racine', 'a'])).toBe(false)`.

```bash
npm test
```

Attendu : **vert**. Consigner le nombre de tests avant et après.

- [ ] **Étape 3 : preuve par MUTATION des deux barrières — les casser, les voir tomber, les restaurer**

**Une barrière qu'on n'a pas vue tomber n'est pas une barrière prouvée.**

Dans `arbre-affichage.ts`, remplacer **temporairement** le corps de `noeudDeplie` par
`return deplies.includes(membreId)` (c'est-à-dire retirer la seconde condition — exactement
l'amputation qu'un découpage distrait produirait) :

```bash
npm test 2>&1 | grep -A3 "noeudDeplie"
```

Attendu : **DEUX tests tombent** — « REFUSE de deplier un noeud deja present dans la branche »
et le test d'invariant. **Restaurer**, puis :

```bash
npm test
```

Attendu : **vert**. Faire de même avec `basculeRefusee` (`return false`) : **deux tests
tombent**. Restaurer. **Consigner les quatre relevés.**

- [ ] **Étape 4 : `src/app/globals.css` — le retrait par classe, pour supprimer les DEUX `style={{}}`**

Dans `:root`, après `--rail-retrait` :

```css
  /*
    Le décalage d'indentation d'un niveau de l'arbre. Valeur reprise telle quelle de
    `DECALAGE_PAR_NIVEAU_REM` (`arborescence.tsx:27`), qui disparaît avec les deux seules
    lignes `style={{ marginLeft }}` du dépôt.
  */
  --indent-niveau: 1.25rem;
```

Puis, à la suite des utilitaires :

```css
/*
  L'indentation de l'arbre, plafonnée à cinq niveaux par D104 (`niveauDeRetrait`). Un
  ensemble FINI de cinq valeurs n'a pas besoin d'être calculé en JavaScript : `retrait-0` à
  `retrait-4` remplacent les DEUX SEULES lignes `style={{ marginLeft }}` du dépôt
  (`arborescence.tsx:438` et `:521`), qui étaient aussi les deux seules valeurs de
  présentation que D109 ne pouvait pas atteindre.
*/
@utility retrait-* {
  margin-left: calc(--value(integer) * var(--indent-niveau));
}
```

**⚠️ SI `--value(integer)` NE COMPILE PAS** sous `tailwindcss@4.3.3`, remplacer par cinq
utilitaires statiques — `@utility retrait-0 { margin-left: 0 }`, `retrait-1 { margin-left:
calc(1 * var(--indent-niveau)) }`, … jusqu'à `retrait-4`. Le résultat est identique ; la forme
fonctionnelle est seulement plus courte. **Consigner laquelle des deux formes a été retenue**,
et **vérifier la sortie CSS** :

```bash
npm run build && grep -c "retrait-4" $(find .next/static -name "*.css")
```

Attendu : **au moins 1** — la classe est bien générée. Contrôle positif implicite : si elle
rend 0, `Noeud` sortira sans indentation, ce qui est un défaut **silencieux**.

- [ ] **Étape 5 : `src/app/arborescence/noeud.tsx` — le rendu récursif, extrait**

Déplacer les lignes **371 à 548** de `arborescence.tsx` dans ce fichier neuf, en substituant
les composants et **en remplaçant la barrière de rendu par l'appel à `noeudDeplie`** :

```tsx
'use client'

import Link from 'next/link'
import { Bouton } from '@/composants/ui/bouton'
import { Pagination } from '@/composants/ui/pagination'
import { niveauDeRetrait, noeudDeplie, PROFONDEUR_MAX_INDENTATION } from '@/lib/domaine/arbre-affichage'
// ⚠️ `import type`, ET C'EST LOAD-BEARING. `arborescence.tsx` importe `Noeud` d'ici, et ce
// fichier importe `EtatArbre` de là-bas : c'est un cycle d'IMPORT. Il est inoffensif parce
// qu'un `import type` est ENTIÈREMENT EFFACÉ à la compilation (`isolatedModules: true`,
// `tsconfig.json`) — il ne subsiste aucune dépendance à l'exécution, donc aucune évaluation
// circulaire de module. Le passer en import de valeur créerait un vrai cycle, dont le
// symptôme serait un `undefined` au montage, sans message utile.
import type { EtatArbre } from './arborescence'

export type PropsNoeud = {
  membre: { id: string; nom: string; prenom: string }
  profondeur: number
  ancetres: readonly string[]
  etat: EtatArbre
  cibleId: string | null
  estAdmin: boolean
  basculer: (membreId: string, ancetres: readonly string[]) => void
  changerPage: (membreId: string, page: number) => void
}

/**
 * Un nœud de l'arbre. Composant de PREMIER NIVEAU du module, jamais défini à l'intérieur
 * d'`Arborescence` : une définition interne produirait un TYPE de composant neuf à chaque
 * rendu du parent, et React démonterait puis remonterait tout le sous-arbre — perdant le
 * focus et rejouant les chargements. **C'est aussi la raison pour laquelle il peut vivre
 * dans son propre fichier sans que rien ne change : il n'a jamais eu de fermeture sur
 * l'état du parent.**
 *
 * D101 — TOUT MEMBRE ACTIF EST DÉPLIABLE, sans indicateur pré-calculé. Un indicateur par
 * enfant, ce serait UNE REQUÊTE PAR ENFANT (N+1) ; l'alternative serait une vue
 * d'agrégation permanente, avec sa RLS à écrire et à prouver, POUR UN CHEVRON. Déplier une
 * feuille affiche « Aucun disciple actif rattaché. » — un aller-retour de trop, à la
 * demande, plutôt que N requêtes systématiques que personne n'a demandées.
 *
 * D106 — LE RAIL DE FILIATION EST ICI CHEZ LUI. C'est l'un des cinq seuls sites du dépôt où
 * une relation de discipulat est réellement affichée : chaque nœud enfant est le disciple
 * du nœud au-dessus. Le rail y porte une INFORMATION VRAIE — la profondeur —, et non une
 * décoration (piège n°6).
 */
export function Noeud({
  membre,
  profondeur,
  ancetres,
  etat,
  cibleId,
  estAdmin,
  basculer,
  changerPage,
}: PropsNoeud) {
  /*
    ═══ D105 — LA BARRIÈRE ANTI-CYCLE DU RENDU. ELLE A ÉTÉ EXTRAITE, PAS SUPPRIMÉE. ═══

    `noeudDeplie` (`src/lib/domaine/arbre-affichage.ts`) porte désormais, MOT POUR MOT, la
    condition qui était écrite ici :

        etat.deplies.includes(membre.id) && !ancetres.includes(membre.id)

    Elle est SORTIE dans un module de domaine pour une seule raison : elle est maintenant
    TESTÉE (`arbre-affichage.test.ts`), y compris par un test d'INVARIANT. Sur une donnée
    saine, cette condition ne change strictement rien — c'est ce qui rendait sa disparition
    invisible, et c'est ce que le test d'invariant ferme.

    `basculer` porte l'AUTRE barrière, celle du clic, et elle ne suffit pas : `allerA` écrit
    dans `deplies` sans passer par elle. CELLE-CI EST LA SEULE À BORNER LA RÉCURSION.
  */
  const deplie = noeudDeplie(membre.id, etat.deplies, ancetres)
  const chargement = etat.enCours.includes(membre.id)
  const page = etat.noeuds[membre.id]
  const erreur = etat.erreurs[membre.id]
  const estCible = cibleId === membre.id

  // D104 : l'indentation est PLAFONNÉE. Au-delà, le niveau est écrit en toutes lettres —
  // c'est l'information que le décalage ne peut plus porter. Cinq valeurs possibles, donc
  // cinq classes : les deux `style={{ marginLeft }}` du dépôt disparaissent avec ce calcul.
  const classeRetrait = `retrait-${niveauDeRetrait(profondeur)}`

  const nomAffiche = membre.prenom ? `${membre.prenom} ${membre.nom}` : membre.nom

  return (
    <li className={classeRetrait}>
      {/*
        D106 — LE RAIL, ET LE SURLIGNAGE DE LA CIBLE. `bg-amber-50 font-medium` devient une
        mise en évidence par le rail et le poids : le système de jetons ne fournit aucune
        couleur de fond d'état (voir `Carte`, Task 5), et un fond ambre serait une valeur
        que la conception n'a pas arbitrée.
      */}
      <div
        className={`flex flex-wrap items-baseline gap-esp-3 rounded-bord px-esp-2 py-esp-1 ${
          profondeur > 0 ? 'rail-filiation' : ''
        }${estCible ? ' border border-etat-attente' : ''}`}
      >
        <Bouton
          variante="lien"
          onClick={() => basculer(membre.id, ancetres)}
          aria-expanded={deplie}
        >
          {deplie ? '▾' : '▸'} {nomAffiche}
        </Bouton>

        {page ? (
          <span className="chiffres-alignes text-petit text-encre-attenuee">
            {page.total} disciple{page.total > 1 ? 's' : ''}
          </span>
        ) : null}

        {profondeur > PROFONDEUR_MAX_INDENTATION ? (
          <span className="chiffres-alignes text-petit text-encre-attenuee">
            niveau {profondeur + 1}
          </span>
        ) : null}

        <Link
          href={`/membres/${membre.id}`}
          className="cible-tactile text-petit text-action underline underline-offset-4"
        >
          Fiche
        </Link>

        {/*
          UN LIEN, PAS UN POUVOIR. `estAdmin` sert ici à DÉCIDER D'AFFICHER, jamais à
          protéger : la barrière est `exigerAdministrateur` dans `/membres/[id]/arbre`.
          D92 : l'arbre lui-même n'écrit rien, et le rattachement reste sur la fiche, où la
          portée d'autorité, le verrou consultatif et l'anti-cycle sont déjà éprouvés.
        */}
        {estAdmin ? (
          <Link
            href={`/membres/${membre.id}/arbre`}
            className="cible-tactile text-petit text-action underline underline-offset-4"
          >
            Rattacher
          </Link>
        ) : null}
      </div>

      {deplie ? (
        <div>
          {chargement && !page ? (
            <p className="px-esp-2 py-esp-1 text-petit text-encre-attenuee">Chargement…</p>
          ) : null}

          {erreur ? (
            <p role="alert" className="px-esp-2 py-esp-1 text-petit text-etat-refus">
              {erreur}
            </p>
          ) : null}

          {page && page.disciples.length === 0 && !erreur ? (
            <p className="px-esp-2 py-esp-1 text-petit text-encre-attenuee">
              Aucun disciple actif rattaché.
            </p>
          ) : null}

          {page && page.disciples.length > 0 ? (
            <ul className="flex flex-col gap-esp-1">
              {page.disciples.map((disciple) => (
                <Noeud
                  key={disciple.id}
                  membre={disciple}
                  profondeur={profondeur + 1}
                  // D105 : la branche courante s'allonge d'un cran à chaque niveau.
                  ancetres={[...ancetres, membre.id]}
                  etat={etat}
                  cibleId={cibleId}
                  estAdmin={estAdmin}
                  basculer={basculer}
                  changerPage={changerPage}
                />
              ))}
            </ul>
          ) : null}

          {page ? (
            <div className="retrait-1 px-esp-2 py-esp-1">
              <Pagination
                page={page.page}
                pages={page.pages}
                indicateur
                enCours={chargement}
                surChangement={(numero) => changerPage(membre.id, numero)}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}
```

**Trois points de vigilance sur cette extraction :**

1. **`{page && page.pages > 1 ? … : null}` devient `{page ? … : null}`** — `Pagination` porte
   lui-même le `pages <= 1 ? null`. Comportement **identique**, une condition en moins.
2. **`indicateur` rend `page {page} sur {pages}`**, exactement la formulation d'origine
   (`arborescence.tsx:531-533`), minuscule initiale comprise (D117).
3. **`disabled={page.page <= 1 || chargement}`** est repris par `enCours={chargement}` +
   la borne interne de `Pagination` (`page > 1`). Comportement identique.

- [ ] **Étape 6 : `src/app/arborescence/arborescence.tsx` — la logique, allégée**

Supprimer les lignes **371-548** (parties dans `noeud.tsx`) et :

**6a.** Exporter le type `EtatArbre` (ligne 37) — `noeud.tsx` l'importe.

**6b.** Supprimer `PROFONDEUR_MAX_INDENTATION` et `DECALAGE_PAR_NIVEAU_REM` (lignes 26-27) et
leur commentaire de tête (lignes 18-25) : ils vivent désormais dans `arbre-affichage.ts` et
dans `globals.css`. **Le commentaire D104 les suit** — il ne disparaît pas.

**6c.** Importer `Noeud` et `basculeRefusee` :

```tsx
import { basculeRefusee } from '@/lib/domaine/arbre-affichage'
import { Noeud } from './noeud'
```

**6d.** `basculer` (lignes 109-129) — **la barrière du clic est CONSERVÉE, avec sa trace** :

```tsx
  /**
   * ═══ D105 — REFUS DE REDÉPLIER UN NŒUD DÉJÀ PRÉSENT DANS LA BRANCHE COURANTE ═══
   *
   * Les deux barrières de la DONNÉE (`membres_anti_cycle`, et la vérification de
   * `public.definir_arbre`) rendent un cycle IMPOSSIBLE EN BASE. L'AFFICHAGE NE DOIT PAS EN
   * DÉPENDRE : un dépliage automatique piloté par la recherche, sur une donnée corrompue,
   * BOUCLERAIT DANS LE NAVIGATEUR — l'onglet se fige, et rien n'indique pourquoi.
   *
   * CE REFUS-CI NE FERME QUE LE CLIC, et il ne suffit pas : `allerA` écrit dans `deplies`
   * sans passer par ici. La barrière qui BORNE RÉELLEMENT LA RÉCURSION est `noeudDeplie`,
   * appliquée dans `Noeud` (`./noeud.tsx`). Celle-ci reste parce qu'elle est la seule à
   * pouvoir DIRE quelque chose — une trace de console à l'instant du geste.
   *
   * La CONDITION est extraite dans `basculeRefusee` (`@/lib/domaine/arbre-affichage`) pour
   * être testée ; la TRACE reste ici, où elle a un sens.
   */
  function basculer(membreId: string, ancetres: readonly string[]) {
    if (basculeRefusee(membreId, ancetres)) {
      console.error(
        'arborescence : dépliage refusé, ce membre est déjà présent dans la branche affichée — donnée incohérente ?',
        { membreId, ancetres },
      )
      return
    }
    // … le reste INCHANGÉ …
  }
```

**⚠️ Le message de `console.error` est repris à l'octet près.** Il n'est pas affiché à
l'utilisateur, mais c'est la seule chose qui diagnostiquera une donnée corrompue en
production.

**6e.** **NE PAS TOUCHER** aux lignes 62-88 (`lireNoeud`), 131-133 (`changerPage`), 135-230
(`allerA` et son séquencement réseau). C'est de la **logique de récupération de données**,
hors du périmètre de présentation. Le grand commentaire de `allerA` (D97) est **conservé
intégralement**.

**6f.** Le rendu (lignes 234-368) — substitutions :

| Avant | Après |
|---|---|
| `<p className="text-sm text-neutral-500">Chargement du chemin…</p>` | `<p className="text-petit text-encre-attenuee">Chargement du chemin…</p>` |
| `<p role="alert" className="text-sm text-red-600">` | `<Refus message={erreurChemin} />` |
| `<p role="status" className="text-sm text-amber-700">` | `<p role="status" className="text-petit text-etat-attente">` — **`role="status"` conservé** : rien n'a échoué, et l'utilisateur garde son fil d'Ariane |
| `<nav aria-label="Chemin depuis la racine" className="text-sm text-neutral-600">` | `className="text-petit text-encre-attenuee"` — **`aria-label` conservé** |
| `<h2 className="text-lg font-medium">Membres sans faiseur de disciple</h2>` | `<h2 className="text-section">…</h2>` |
| le `<nav aria-label="Pagination">` des racines (L341-364) | `<Pagination page={page} pages={pages} lienVersPage={(n) => \`/arborescence?page=${n}\`} />` |
| `<button … onClick={() => allerA(null)}>Revenir aux membres sans faiseur de disciple</button>` | `<Bouton variante="lien" alignement="debut" onClick={() => allerA(null)}>…</Bouton>` |

- [ ] **Étape 7 : `src/app/arborescence/page.tsx` — en-tête et bornage**

`EnTetePage` avec `retour`, `titre="Arborescence"` et le paragraphe de légende en `soustitre`.
**⚠️ CETTE LÉGENDE NE CHANGE PAS D'UN MOT.** Son commentaire (lignes 58-67) dit pourquoi :
« la seconde phrase existe parce que la première, seule, serait un demi-mensonge ». **Le
commentaire est conservé, déplacé avec le texte.**

Le bornage (lignes 37-48) devient :

```tsx
const pages = bornerPage(page, total, TAILLE_PAGE_RACINES, (numero) => `/arborescence?page=${numero}`)
```

- [ ] **Étape 8 : vérifier que les DEUX barrières existent toujours, et qu'elles sont testées**

```bash
grep -n "basculeRefusee\|noeudDeplie" src/lib/domaine/arbre-affichage.ts src/app/arborescence/arborescence.tsx src/app/arborescence/noeud.tsx
```

Attendu : `basculeRefusee` **déclarée** dans le module de domaine et **appelée** dans
`arborescence.tsx` ; `noeudDeplie` **déclarée** dans le module de domaine et **appelée** dans
`noeud.tsx`. **Si l'une n'a pas d'appelant, elle a été perdue au découpage.**

```bash
grep -c "it(" src/lib/domaine/arbre-affichage.test.ts
```

Attendu : **au moins 10**.

```bash
grep -rn "style={{" src/app/arborescence/
```

Attendu : **zéro** — les deux seules lignes `style={{ }}` du dépôt ont disparu.

```bash
grep -rn "style={{" src/
```

Attendu : **zéro** dans tout `src/`.

- [ ] **Étape 9 : vérifier qu'aucun texte affiché n'a bougé**

```bash
git diff src/app/arborescence/ | grep -E "^[-+].*[A-Za-zÀ-ÿ]{4,}" | grep -vE "^[-+]\s*(//|/\*|\*)" | grep -viE "class|import|const|function|return|export|type "
```

Attention particulière à : « Aller à une personne », l'aide du sélecteur, « Chargement du
chemin… », « Chargement… », « Aucun disciple actif rattaché. », « Membres sans faiseur de
disciple », « ce sont les racines de l'arbre. », « Aucun membre actif sans faiseur de
disciple. », « Revenir aux membres sans faiseur de disciple », « Fiche », « Rattacher »,
« niveau N », « page X sur Y », et la légende de l'en-tête.

- [ ] **Étape 10 : les portes, puis le commit**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls
```

```bash
git add src/lib/domaine/arbre-affichage.ts src/lib/domaine/arbre-affichage.test.ts src/app/arborescence/ src/app/globals.css
git commit -m "refactor(ui): /arborescence — troisieme temoin, la recursion scindee (D122)" -m "548 lignes deviennent trois fichiers : la logique de depliage, de recherche et de sequencement reseau dans arborescence.tsx, le rendu recursif dans noeud.tsx, et LES DEUX BARRIERES ANTI-CYCLE en fonctions pures dans src/lib/domaine/arbre-affichage.ts." -m "Les deux barrieres sont distinctes et non factorisables. Celle du clic ne ferme que le clic : allerA ecrit dans deplies sans passer par elle. Celle du RENDU est la seule a borner la recursion, et elle a ete posee en toute fin de phase 5 — la deplacer sans la tester l'aurait fait disparaitre sans bruit, puisque sur une donnee saine elle ne change strictement rien." -m "Chacune porte desormais son test, dont un test d'INVARIANT et pas seulement de comportement, et chacune a ete prouvee par MUTATION : cassee, vue tomber sur deux tests, restauree." -m "Les deux seules lignes style={{ marginLeft }} du depot disparaissent : D104 plafonne l'indentation a cinq niveaux, donc cinq classes suffisent, et un ensemble fini n'a pas besoin d'etre calcule en JavaScript. grep style={{ sur tout src/ rend desormais zero." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11 : revue de dimensionnement du socle après les trois témoins (**D120**)

**Fichiers :**
- Modifier, **si et seulement si la revue le conclut** : `src/composants/ui/selecteur.tsx`,
  et tout autre composant que les trois témoins ont mis en défaut
- Tester : toutes les portes, **puis la porte de fin de lot B**

**Interfaces :**
- Consomme : les trois témoins (Tasks 8, 9, 10).
- Produit : **le socle définitif**. Tout ce qui n'est pas corrigé ici sera corrigé vingt fois.

## POURQUOI CETTE TÂCHE EXISTE

D120 ne dit pas seulement « les composants d'abord ». Elle dit : **« si le socle est mal
dimensionné, ces trois-là le révèlent ; les dix-sept suivants ne révéleraient rien de neuf.
C'est de l'ordonnancement DE MESURE, pas de confort. »**

**Une mesure qu'on ne lit pas n'est pas une mesure.** C'est le seul moment de la phase où
corriger un composant coûte trois écrans à relire au lieu de vingt-quatre. Passer cette tâche
pour « gagner du temps » vide D120 de son contenu, et le temps se repaie au vingtième écran.

- [ ] **Étape 1 : le point ouvert LAISSÉ PAR LA TASK 9 — `Selecteur` et les `<optgroup>`**

La Task 9 a laissé le `<select>` des statuts en dehors de `Selecteur`, parce qu'il rend des
`<optgroup>` et une première option `disabled`. Elle a explicitement renvoyé la décision ici.

**Compter les appelants réels :**

```bash
grep -rn "optgroup" src --include="*.tsx"
```

Relevé attendu au 2026-08-16 : **`membres/nouveau/bloc-enrichissement.tsx:195` et
`membres/[id]/statuts/formulaire-statut.tsx`** — **deux** fichiers, tous deux le même besoin
(choisir un statut dans un catalogue groupé par groupe, avec la mention « (un seul à la
fois) » sur les groupes exclusifs).

**Trancher, et écrire la décision dans le rapport de tâche :**

- **Deux appelants, même forme, même donnée** → élargir `Selecteur` avec une prop
  `groupes?: Array<{ libelle: string; options: OptionSelecteur[] }>`, **mutuellement exclusive
  avec `options`** dans le type, et une prop `optionVide?: { libelle: string; desactivee?: boolean }`
  pour l'option `disabled`. Les deux appelants l'adoptent, et le second le fait à la Task 22.
- **Si le relevé rend UN seul appelant** → ne rien élargir. Un composant du socle qui grandit
  pour un appelant unique est un composant qui dérive (D110).

**Dans les deux cas, la décision est ÉCRITE**, avec le décompte qui la fonde. Un point ouvert
qui se referme sans trace redeviendra ouvert.

- [ ] **Étape 2 : les six questions de dimensionnement, posées aux trois témoins**

Répondre **par écrit**, chacune avec la ligne de code qui la fonde :

1. **`Bouton` a-t-il suffi ?** Compter les `<button>` restants dans les trois témoins :
   ```bash
   grep -rn "<button" src/app/membres/page.tsx src/app/membres/formulaire-membre.tsx src/app/membres/nouveau/ src/app/arborescence/
   ```
   Attendu : **un seul**, le « Filtrer » du formulaire GET de `/membres` (frontière déclarée
   en Task 8). **Tout autre `<button>` restant est une variante manquante** — la nommer.
2. **`LigneListe` a-t-il suffi ?** L'annuaire l'emploie ; `Noeud` **ne l'emploie pas**, et
   c'est correct — un nœud d'arbre n'est pas une ligne de liste, il porte un chevron, une
   profondeur et une sous-liste. **Vérifier que ce n'est pas devenu une excuse** : si `Noeud`
   réimplémente un `flex justify-between` de ligne, `LigneListe` était trop rigide.
3. **`Champ` a-t-il suffi sur dix champs d'un coup ?** Le champ « AEL déjà suivis » portait
   une aide et un `htmlFor` explicite ; les neuf autres un `<label>` enveloppant. `Champ`
   a-t-il uniformisé sans rien perdre ? **Vérifier le nom accessible dans un navigateur**,
   pas seulement dans le code : l'aide ne doit **pas** être concaténée au libellé.

   **ET LA QUESTION LAISSÉE OUVERTE PAR LA TASK 3 :** le libellé rend en `--txt-petit`
   (0.85 rem / **400**), là où les 89 `<label>` du dépôt portaient `text-sm font-medium`
   (0.875 rem / **500**). L'échelle à cinq degrés n'a **aucun** degré « libellé de champ ».
   **Regarder `/membres/nouveau` et `/inscription`, et trancher par écrit** :
   - soit c'est lisible, et l'échelle reste à cinq degrés — **écrire que c'est un choix** ;
   - soit les libellés se noient dans l'aide et les métadonnées, qui partagent le même
     degré, et il faut alors **une graisse sur le libellé** — ce qui n'ajoute pas un sixième
     degré, seulement une graisse à `--txt-petit` **quand il sert de libellé**. Le poser en
     jeton (`--txt-petit-libelle--font-weight`) dans `globals.css`, jamais en `font-medium`
     écrit dans le composant (D109).

   **Ne pas laisser la question ouverte.** Elle porte sur 89 libellés répartis sur
   vingt-cinq écrans, et se repose à chacun d'eux.
4. **`Formulaire` a-t-il suffi ?** Le focus au refus fonctionne-t-il **réellement** sur
   `/membres/nouveau` ? Le vérifier **à la main** : soumettre une création avec un prénom vide
   côté serveur, et constater que le focus atterrit sur le message **et qu'un contour le
   montre**. C'est D113 et D114 ensemble, et **aucun test automatisé de ce dépôt ne les
   couvre**.
5. **La densité compacte est-elle nécessaire sur l'un des trois témoins ?** D107 la réserve à
   `/comptes`, `/evenements/a-traiter` et `/demandes`. **Si `/membres` ou `/arborescence`
   paraît trop aéré à l'usage, c'est maintenant qu'il faut le dire** — le §10 de la conception
   dit explicitement que « la liste est un attribut, pas une architecture ».
6. **Le rail de filiation ment-il quelque part ?** Le vérifier sur les trois témoins :
   ```bash
   grep -rn "rail-filiation\|rail={true}\|rail\b" src/app/membres/ src/app/arborescence/
   ```
   Attendu : **présent dans `noeud.tsx` seulement**. `/membres` (annuaire) et
   `/membres/nouveau` n'affichent aucune relation de discipulat rendue — le sélecteur de
   faiseur de disciple de `bloc-enrichissement.tsx` est une **saisie**, pas un affichage de
   relation établie.

- [ ] **Étape 3 : appliquer les corrections décidées, et relire les trois témoins**

Toute modification d'un composant de `src/composants/ui/` **oblige à relire les trois
témoins** — c'est le prix, et c'est précisément pourquoi cette tâche est ici et pas plus tard.

- [ ] **Étape 4 : les portes**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls
```

```bash
git add -u src/composants/ src/app/
git commit -m "refactor(ui): revue de dimensionnement du socle apres les trois temoins (D120)" -m "Decisions et decomptes consignes dans le rapport de tache." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Étape 5 : PORTE DE FIN DE LOT B — build, e2e EN LOTS, e2e:prod**

⚠️ **LE DÉLAI D'EXÉCUTION PLAFONNE À 600 000 ms, ET UNE DEMANDE SUPÉRIEURE EST IGNORÉE, PAS
REFUSÉE.** La suite e2e complète a déjà été **tuée en cours** pour cette raison, et l'échec a
été lu comme un échec de test. **Elle se lance en lots.**

```bash
npm run build
```

```bash
npm run test:e2e -- tests/e2e/annuaire.spec.ts tests/e2e/arbre.spec.ts tests/e2e/arborescence.spec.ts tests/e2e/autorite.spec.ts
```

```bash
npm run test:e2e -- tests/e2e/creation-enrichie.spec.ts tests/e2e/archivage-compte.spec.ts tests/e2e/statuts.spec.ts
```

```bash
npm run test:e2e -- tests/e2e/ael-pointage.spec.ts tests/e2e/ael-preuves.spec.ts tests/e2e/ael-seance-detail.spec.ts
```

```bash
npm run test:e2e -- tests/e2e/demandes.spec.ts tests/e2e/evenements.spec.ts tests/e2e/evenements-detail.spec.ts tests/e2e/evenements-liste.spec.ts tests/e2e/evenements-types.spec.ts
```

```bash
npm run test:e2e -- tests/e2e/antennes-membres.spec.ts tests/e2e/connexion.spec.ts tests/e2e/inscription.spec.ts tests/e2e/notifications.spec.ts tests/e2e/tokens.spec.ts
```

```bash
npm run test:e2e:prod
```

**⚠️ D119 : SI UNE PREUVE ROUGIT, C'EST UN SIGNAL, PAS UN TEST À AJUSTER.** Aucun
`window.confirm` n'a encore été retiré à ce stade — l'exception déclarée en C1 ne s'applique
**pas** à ce lot. Toute suite rouge ici vient de la refonte, et se corrige **dans le code**.

**Établir quel commit l'a cassée par un rejeu en isolation**, et le consigner. Ne jamais
« corriger au jugé » une suite rouge dont on n'a pas identifié le commit fautif : c'est ainsi
qu'on empile deux défauts.

---

### Task 12 : les deux écrans publics — `/connexion` et `/inscription` (D111, D112, D113)

**Fichiers :**
- Modifier : `src/app/connexion/page.tsx`, `src/app/connexion/formulaire-connexion.tsx` (57 lignes)
- Modifier : `src/app/inscription/page.tsx`, `src/app/inscription/formulaire-inscription.tsx` (245 lignes)
- Tester : `npx tsc --noEmit`, `npm run lint`

**Interfaces :**
- Consomme : `Formulaire`, `Champ`, `Selecteur`, `Bouton`, `Carte`, `EnTetePage`.
- Produit : rien.

**Pourquoi ces deux-là tôt, sans être des témoins.** §6 de la conception : ce sont **les seuls
écrans qu'une personne extérieure voit**, et les seuls où la première impression compte pour
quelqu'un qui n'a pas de compte. Ils sont **trop simples pour dimensionner le socle** — d'où
leur place après la revue de la Task 11, pas avant.

**Preuves e2e traversant ces écrans (D119, ne pas modifier) :**
`tests/e2e/connexion.spec.ts` (4 tests), `tests/e2e/inscription.spec.ts` (5 tests), et **toutes
les autres suites**, qui passent par `/connexion` pour ouvrir une session. **Une erreur ici
rougit les 128 preuves d'un coup.**

- [ ] **Étape 1 : `formulaire-connexion.tsx` — DEUX CHAMPS NON CONTRÔLÉS À FERMER (D111)**

Ce fichier est **l'un des douze** que l'inventaire du vocabulaire recense encore avec des
champs libres : `identifiant` (L20) et `motDePasse` (L33), sans `value` ni `onChange`.

```tsx
'use client'

import { useActionState, useState } from 'react'
import { Bouton } from '@/composants/ui/bouton'
import { Champ } from '@/composants/ui/champ'
import { Formulaire } from '@/composants/ui/formulaire'
import { seConnecter, type EtatConnexion } from './actions'

const etatInitial: EtatConnexion = { erreur: null }

/**
 * Extrait de `page.tsx`, devenue un composant serveur pour pouvoir lire `searchParams`
 * (l'accusé d'inscription). `useActionState`, sans quoi `MESSAGE_ECHEC_CONNEXION`
 * n'atteindrait pas l'écran.
 *
 * ═══ LES DEUX CHAMPS DEVIENNENT CONTRÔLÉS (D111), ET LE MOT DE PASSE AUSSI ═══
 *
 * `seConnecter` RETOURNE son refus (`EtatConnexion.erreur`) : le formulaire passe donc par
 * le chemin « complétion normale » de React, qui réinitialise les champs NON CONTRÔLÉS. Sur
 * un identifiant mal tapé, l'utilisateur retapait TOUT, y compris l'identifiant qui était
 * juste. `Champ` rend le cas inexprimable.
 *
 * LE MOT DE PASSE SURVIT DÉSORMAIS À UN REFUS, et c'est un changement de comportement
 * assumé : c'est ce que fait tout formulaire de connexion, et retaper un mot de passe long
 * après une faute de frappe sur l'identifiant est précisément ce qui pousse à en choisir un
 * court. La valeur reste dans l'état du composant client, jamais dans le DOM au-delà de la
 * vie de la page — rien n'est persisté.
 */
export function FormulaireConnexion() {
  const [etat, action, enCours] = useActionState(seConnecter, etatInitial)
  const [identifiant, setIdentifiant] = useState('')
  const [motDePasse, setMotDePasse] = useState('')

  return (
    <Formulaire action={action} erreur={etat.erreur} enCours={enCours}>
      <Champ
        label="Identifiant"
        name="identifiant"
        type="text"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        required
        value={identifiant}
        onChange={(evenement) => setIdentifiant(evenement.target.value)}
      />
      <Champ
        label="Mot de passe"
        name="motDePasse"
        type="password"
        autoComplete="current-password"
        required
        value={motDePasse}
        onChange={(evenement) => setMotDePasse(evenement.target.value)}
      />
      <Bouton type="submit" enCours={enCours} libelleAttente="Connexion…">
        Se connecter
      </Bouton>
    </Formulaire>
  )
}
```

**Le bandeau de refus disparaît de ce fichier** : `Formulaire` rend `Refus` à la même place,
**et lui porte le focus** — ce que ce formulaire ne faisait pas (D113). C'est l'un des
vingt-trois qui laissaient l'utilisateur clavier sans indication.

- [ ] **Étape 2 : `connexion/page.tsx`**

| Avant | Après |
|---|---|
| `<h1 className="mb-1 text-2xl font-semibold">Suivi Asonkeng</h1>` + `<p className="mb-8 text-sm text-neutral-500">Connectez-vous pour continuer.</p>` | `<EnTetePage titre="Suivi Asonkeng" soustitre="Connectez-vous pour continuer." />` — **sans `retour`** : personne n'est connecté, il n'y a nulle part où revenir |
| le bandeau `role="status"` en `bg-green-50` (L30-36) | `<Carte ton="succes" role="status">{MESSAGE_INSCRIPTION_REUSSIE}</Carte>` |
| `mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6` | `mx-auto flex min-h-screen max-w-sm flex-col justify-center px-esp-6` |
| `<Link href="/inscription" className="underline underline-offset-4">` | `className="cible-tactile text-action underline underline-offset-4"` |

**⚠️ NE PAS TOUCHER au commentaire des lignes 40-55.** Il raconte que `/inscription`, page
publique en production, n'était atteignable par **aucun lien du dépôt**, et **pourquoi le
libellé dit qu'il faut un code** : « un simple *Créer un compte* enverrait vers un écran qui
refuse tout le monde sauf les porteurs d'un code, et cet écran NE PEUT PAS dire pourquoi il
refuse ». C'est la seule trace de cette décision.

- [ ] **Étape 3 : `formulaire-inscription.tsx` — le plus long des deux (245 lignes)**

**Ce fichier est DÉJÀ entièrement contrôlé** (corrigé en phase 5, Task 5) et porte **déjà**
les deux mécanismes que `Formulaire` généralise :

- `onReset={(e) => e.preventDefault()}` (L91) — **D112** ;
- `zoneErreur` + `enCoursPrecedent` + `useEffect` (L63, L80-86) et le bandeau `outline-none`
  (L225-234) — **D113**.

**Les trois migrent dans `Formulaire`/`Refus`. NE PAS LES SUPPRIMER SANS VÉRIFIER QU'ILS Y
SONT.** Ce fichier est l'un des **deux seuls** du dépôt à porter le focus au refus.

Substitutions :

| Avant | Après |
|---|---|
| `<form action={envoyer} onReset={…} className="flex flex-col gap-4">` (L89-93) | `<Formulaire action={envoyer} erreur={etat.erreur} enCours={enCours}>` |
| `zoneErreur`, `enCoursPrecedent`, le `useEffect` (L63, L80-86) | **supprimés — ils vivent dans `Formulaire`** |
| le bandeau `<p ref={zoneErreur} … outline-none>` (L225-234) | **supprimé — `Formulaire` rend `Refus`** |
| les 7 `<input>` contrôlés | `<Champ label="…" name="…" value={…} onChange={…} … />` |
| le `<select name="antenneId">` (L201-205) | `<Selecteur label="…" name="antenneId" value={antenneId} onChange={…} options={[…]} />` |
| `<div className="grid gap-4 sm:grid-cols-2">` (L159) | `md:grid-cols-2` — D115 |
| `<label className="flex flex-col gap-1.5 sm:col-span-2">` (L199) | `md:col-span-2` |
| le bouton (L236-243) | `<Bouton type="submit" alignement="debut" enCours={enCours} libelleAttente="Inscription…">S&apos;inscrire</Bouton>` |

**⚠️ `"S'inscrire"` s'écrit `{"S'inscrire"}` ou `S&apos;inscrire` selon le contexte.** Dans le
fichier d'origine, c'est `{enCours ? 'Inscription…' : "S'inscrire"}` — une **chaîne
JavaScript entre guillemets doubles**. Devenu un **enfant JSX**, il s'écrit
`S&apos;inscrire`. Les deux rendent le même octet à l'écran ; **écrire `S&apos;inscrire` dans
une chaîne JavaScript afficherait littéralement `&apos;`**, et ce piège s'est refermé quatre
fois dans ce projet.

**⚠️ NE PAS TOUCHER** au commentaire des lignes 220-224 (« seront ignorés en mode nominatif …
recréer un oracle par la forme de la page, exactement ce que D30 interdit ») : il explique
pourquoi certains champs restent **visibles** alors qu'ils seront ignorés. Le masquer selon
une supposition sur le mode recréerait l'oracle que D30 interdit — et
`tests/e2e/inscription.spec.ts` l'éprouve.

- [ ] **Étape 4 : `inscription/page.tsx`**

`EnTetePage titre="Inscription" soustitre="Munissez-vous du code fourni par un administrateur
de l'équipe."`, **sans `retour`**, et le conteneur en jetons d'espacement. **Aucun texte ne
change.**

- [ ] **Étape 5 : vérifier D111, D112 et D113 sur les quatre fichiers**

```bash
grep -n "defaultValue\|onReset\|zoneErreur\|outline-none" src/app/connexion/ src/app/inscription/ -r
```

Attendu : **zéro ligne**.

```bash
grep -c "onReset" src/composants/ui/formulaire.tsx
grep -c "tabIndex={-1}" src/composants/ui/refus.tsx
```

Attendu : **1** et **1**. Si l'un vaut 0, un mécanisme a été retiré **sans remplacement**.

- [ ] **Étape 6 : vérifier qu'aucun texte affiché n'a bougé**

```bash
git diff src/app/connexion/ src/app/inscription/ | grep -E "^[-+].*[A-Za-zÀ-ÿ]{4,}" | grep -vE "^[-+]\s*(//|/\*|\*)" | grep -viE "class|import|const|function|return|export|type "
```

- [ ] **Étape 7 : les portes, puis le commit**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls
```

```bash
git add src/app/connexion/ src/app/inscription/
git commit -m "refactor(ui): /connexion et /inscription, les deux ecrans publics" -m "Les deux derniers champs non controles de la connexion (identifiant, motDePasse) sont fermes par Champ. seConnecter RETOURNE son refus, donc le formulaire passait par le chemin de remise a zero de React : un identifiant mal tape faisait retaper les deux champs." -m "onReset et le focus au refus de formulaire-inscription.tsx ne sont pas retires mais DEPLACES dans Formulaire. Ce fichier etait l'un des deux seuls du depot a porter le focus au refus ; il l'obtient desormais du socle, comme les vingt-trois autres." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

# LOT C — LES QUINZE CONFIRMATIONS (Tasks 13 à 15)

## ⚠️⚠️ C'EST LE SEUL ENDROIT DE LA PHASE OÙ UNE TRADUCTION MÉCANIQUE PRODUIRAIT UN DÉFAUT RÉEL

**`window.confirm` BLOQUE le fil d'exécution. Un `<dialog>` NE BLOQUE PAS.** Le code appelant
**change de forme** : là où `if (!window.confirm(…)) return;` interrompait, il faut désormais
un **rappel**. Les quinze sites doivent être relus **un par un**.

**Les quinze, relevés le 2026-08-16** (`grep -rn "window.confirm" src --include="*.tsx"` → 15
lignes ; `grep -rn "confirm(" src | wc -l` → 15 aussi, donc **aucun appel caché ailleurs**),
en **deux familles** que la conception ne distingue pas :

### Famille A — bouton `type="submit"` dans un `<form action>`, `onClick` + `preventDefault()` (10 sites)

| # | Fichier:ligne | Composant | Particularité |
|---|---|---|---|
| A1 | `src/app/ael/calendriers/bouton-bascule-calendrier.tsx:18` | `BoutonBasculeCalendrier` | message ternaire sur `desactiver` |
| A2 | `src/app/ael/seances/[id]/bouton-transition-etat.tsx:16` | `BoutonTransitionEtat` | **message reçu en prop** — le plus simple |
| A3 | `src/app/antennes/bouton-bascule-antenne.tsx:13` | `BoutonBasculeAntenne` | message ternaire |
| A4 | `src/app/antennes/[id]/ligne-membre-detachable.tsx:37` | `LigneMembreDetachable` | bouton **`disabled={enCours}`**, message en ligne |
| A5 | `src/app/evenements/a-traiter/ligne-a-traiter.tsx:230` | `LigneATraiter` | **message calculé par `messageConfirmationConversion(nomComplet, chemin)`**, formulaire à champs `required` |
| A6 | `src/app/evenements/types/bouton-bascule-type.tsx:18` | `BoutonBasculeType` | message ternaire |
| A7 | `src/app/evenements/[id]/participants.tsx:179` | `SectionParticipants` | bouton `disabled={suppressionEnCours}` |
| A8 | `src/app/membres/[id]/bouton-archiver.tsx:44` | `BoutonArchiver` | **message construit en 4 branches** (L17-38) |
| A9 | `src/app/membres/[id]/statuts/bouton-retirer-statut.tsx:8` | `BoutonRetirerStatut` | `const confirme = window.confirm(…)` puis `if (!confirme)` |
| A10 | `src/app/statuts/bouton-bascule-statut.tsx:19` | `BoutonBasculeStatut` | message ternaire |

### Famille B — handler impératif, `if (!confirm(…)) return;` (5 sites)

| # | Fichier:ligne | Fonction | ⚠️ Danger |
|---|---|---|---|
| B1 | `src/app/comptes/ligne-compte.tsx:82` | `soumettreRoles` | **`new FormData(evenement.currentTarget)` APRÈS le confirm** |
| B2 | `src/app/comptes/ligne-compte.tsx:104` | `soumettreActivation` | **idem** |
| B3 | `src/app/demandes/ligne-demande-admin.tsx:84` | `soumettreRejet` | capture `formulaire` **avant**, construit la `FormData` **après** |
| B4 | `src/app/demandes/ligne-demande-personnelle.tsx:19` | `annuler` | `FormData` construite de zéro — sans danger |
| B5 | `src/app/tokens/ligne-token.tsx:27` | `soumettre` | `FormData` construite de zéro — sans danger |

**10 + 5 = 15.** Le décompte ferme.

---

### Task 13 : les dix confirmations de famille A — boutons de soumission (**D124**)

**Fichiers :**
- Modifier : les **dix** fichiers du tableau « famille A » ci-dessus
- Tester : `npx tsc --noEmit`, `npm run lint` — **PAS `test:e2e`, qui rougira jusqu'à la Task 15**

**Interfaces :**
- Consomme : `Dialogue`, `Bouton` (Tasks 2, 7).
- Produit : dix boutons dont le clic ouvre un `<dialog>` au lieu d'une boîte native.

## ⚠️ LA SUITE E2E VA ROUGIR À LA FIN DE CETTE TÂCHE, ET C'EST ATTENDU

Les 22 gestionnaires `page.once('dialog', …)` de 11 fichiers de test deviennent **inertes** :
Playwright ne les déclenche que pour les boîtes **natives**. Les clics qu'ils débloquaient
resteront bloqués derrière un `<dialog>` que personne ne confirme, et les tests échoueront en
**timeout**, loin de la cause.

**C'est l'exception déclarée en C1 du plan, et elle est réparée à la Task 15.** Ne lancer
`test:e2e` qu'**après** la Task 15. Les portes rapides (`tsc`, `lint`, `test`, `test:rls`)
restent obligatoires à chaque commit.

## LE MOTIF, ÉCRIT UNE FOIS, APPLIQUÉ DIX FOIS

Le motif d'origine, identique aux dix sites à la construction du message près :

```tsx
<button type="submit" onClick={(evenement) => {
  if (!window.confirm(message)) {
    evenement.preventDefault()
  }
}}>
```

**`window.confirm` bloque : au retour, on sait déjà.** Un `<dialog>` ne bloque pas :
`preventDefault()` devient **inconditionnel**, et la soumission doit être **rejouée** après la
confirmation.

**`form.requestSubmit(bouton)` et non `form.submit()`** — trois raisons, toutes vérifiables :

1. `form.submit()` **ne déclenche pas l'événement `submit`** : React ne verrait jamais la
   soumission, et l'action serveur ne partirait pas.
2. `requestSubmit(submitter)` **conserve le déclencheur**, donc les champs cachés que le
   bouton porte, et l'`action` du formulaire.
3. `requestSubmit()` **applique la validation de contrainte** (`required`), exactement comme
   un vrai clic — ce qui compte pour A5, dont le formulaire a des champs obligatoires.

**Et `requestSubmit(submitter)` NE DÉCLENCHE PAS de `click` sur le déclencheur** (algorithme
de soumission du HTML) : il n'y a donc **aucune ré-entrée** à garder, et pas de drapeau à
poser. **⚠️ VÉRIFIER CE POINT À L'ÉTAPE 3 :** si le dialogue se rouvre en boucle après une
confirmation, c'est que le navigateur cible refire le clic, et il faut alors ajouter le garde
de ré-entrée décrit à l'étape 3.

- [ ] **Étape 1 : écrire A3 (`bouton-bascule-antenne.tsx`) — LE GABARIT DES DIX**

```tsx
'use client'

import { useRef, useState } from 'react'
import { Bouton } from '@/composants/ui/bouton'
import { Dialogue } from '@/composants/ui/dialogue'

/**
 * ═══ D124 — `window.confirm` BLOQUE, UN `<dialog>` NE BLOQUE PAS ═══
 *
 * Le code appelant CHANGE DE FORME. Là où `if (!window.confirm(…)) evenement.preventDefault()`
 * suffisait — parce qu'au retour de `confirm` on savait déjà —, il faut désormais :
 *   1. TOUJOURS `preventDefault()` : le dialogue s'ouvre, la soumission n'a pas lieu ;
 *   2. REJOUER la soumission dans le rappel de confirmation.
 *
 * `form.requestSubmit(bouton)` et NON `form.submit()` :
 *   - `submit()` ne déclenche PAS l'événement `submit`. React ne verrait jamais la
 *     soumission, et la Server Action ne partirait pas ;
 *   - `requestSubmit(declencheur)` conserve le DÉCLENCHEUR, donc les champs cachés que le
 *     formulaire porte et son `action` ;
 *   - `requestSubmit()` applique la VALIDATION DE CONTRAINTE, exactement comme un vrai clic.
 *
 * `requestSubmit(declencheur)` NE REFIRE PAS de `click` sur le déclencheur (algorithme de
 * soumission du HTML) : aucun garde de ré-entrée n'est nécessaire.
 *
 * LE MESSAGE NE CHANGE PAS D'UN OCTET (D117). Ses `\n\n` sont rendus par le
 * `whitespace-pre-line` du `Dialogue`, et produisent la même coupure de paragraphe que dans
 * la boîte native.
 */
export function BoutonBasculeAntenne({ nom, desactiver }: { nom: string; desactiver: boolean }) {
  const message = desactiver
    ? `Désactiver l'antenne « ${nom} » ?\n\n` +
      "Elle n'apparaîtra plus dans les formulaires, mais les membres qui y sont " +
      'rattachés le restent, et vous pourrez la réactiver.'
    : `Réactiver l'antenne « ${nom} » ?`

  const [confirmationDemandee, setConfirmationDemandee] = useState(false)
  const bouton = useRef<HTMLButtonElement | null>(null)

  return (
    <>
      <Bouton
        ref={bouton}
        type="submit"
        variante={desactiver ? 'lien-danger' : 'lien'}
        onClick={(evenement) => {
          evenement.preventDefault()
          setConfirmationDemandee(true)
        }}
      >
        {desactiver ? 'Désactiver' : 'Réactiver'}
      </Bouton>

      <Dialogue
        ouvert={confirmationDemandee}
        message={message}
        surConfirmation={() => {
          setConfirmationDemandee(false)
          // `bouton.current.form` : le `<form action={…}>` parent, écrit par la page.
          bouton.current?.form?.requestSubmit(bouton.current)
        }}
        surAnnulation={() => setConfirmationDemandee(false)}
      />
    </>
  )
}
```

- [ ] **Étape 2 : appliquer le gabarit aux neuf autres, avec leurs particularités**

**A1 `ael/calendriers/bouton-bascule-calendrier.tsx`**, **A6 `evenements/types/bouton-bascule-type.tsx`**,
**A10 `statuts/bouton-bascule-statut.tsx`** : identiques à A3. Le message ternaire est **sorti
du `onClick`** et devient une constante du corps du composant, comme ci-dessus — il était déjà
recalculé à chaque clic, il l'est maintenant à chaque rendu. **Aucun octet de message ne
change.**

**A2 `ael/seances/[id]/bouton-transition-etat.tsx`** : le message arrive **en prop**. Le plus
court des dix — même gabarit, `message` employé tel quel. Variante : `accent ? 'lien-danger' : 'lien'`.

**A9 `membres/[id]/statuts/bouton-retirer-statut.tsx`** : la forme d'origine est
`const confirme = window.confirm(…)` puis `if (!confirme) evenement.preventDefault()`. **Même
transformation** — la variable intermédiaire disparaît avec l'appel bloquant.

**A8 `membres/[id]/bouton-archiver.tsx`** : le message est construit en **quatre branches**
(L17-38), selon `archiver` et `compteLie`. **NE PAS TOUCHER À CETTE CONSTRUCTION** — elle est
déjà hors du `onClick`, elle est déjà correcte, et son commentaire explique pourquoi
l'asymétrie de D24 y est dite (« rétablir la fiche ne le réactive pas »). Seul le `onClick`
change. **`tests/e2e/annuaire.spec.ts:183-190` et `tests/e2e/archivage-compte.spec.ts:151-160`
assertent ce message** : il ne change pas d'un octet.

**A4 `antennes/[id]/ligne-membre-detachable.tsx`** : le bouton porte `disabled={enCours}`. Le
reporter sur `Bouton` via `enCours={enCours}` **et garder `libelleAttente="Détachement…"`** —
le libellé bascule aujourd'hui `{enCours ? 'Détachement…' : 'Détacher'}`.

**A7 `evenements/[id]/participants.tsx:171-195`** : bouton `disabled={suppressionEnCours}`
dans un `<form action={supprimer}>`. Le `Dialogue` se place **à côté du bouton, dans le même
`<form>`** — un `<dialog>` peut vivre n'importe où dans l'arbre, il est déplacé dans la couche
supérieure à l'ouverture. **Ce site est couvert par
`tests/e2e-prod/refus-evenements-production.spec.ts:235-240`, l'une des DIX preuves de
production**, qui **assert le message** : ne pas y toucher.

**A5 `evenements/a-traiter/ligne-a-traiter.tsx:226-237`** — **le plus délicat des dix** :

- le message vient de `messageConfirmationConversion(nomComplet, chemin)`, **fonction
  existante** : l'appeler **dans le corps du composant**, pas dans le `onClick`. Elle est
  pure, cet appel est gratuit ;
- le formulaire porte des champs **`required`** et trois chemins mutuellement exclusifs :
  `requestSubmit()` **applique la validation**, donc un chemin incomplet est refusé par le
  navigateur **exactement comme avant** ;
- **`chemin` peut changer entre l'ouverture du dialogue et sa confirmation ?** **Non** : un
  `<dialog>` modal rend le reste du document **inerte**. Aucun des trois boutons radio n'est
  atteignable pendant que le dialogue est ouvert. **C'est une propriété du modal natif, et
  c'est l'une des raisons pour lesquelles il a été choisi** ;
- le bouton porte `disabled={conversionEnCours}` → `enCours={conversionEnCours}`. Il n'a
  **pas** de libellé d'attente aujourd'hui (`Convertir` ne bascule pas) : **ne pas en
  inventer un** (D117).

- [ ] **Étape 3 : vérifier le comportement RÉEL des dix, dans un navigateur**

**Aucun test automatisé ne couvre encore le `Dialogue` à ce stade** (il est écrit à la
Task 15). Cette vérification est **manuelle et obligatoire**, sur **au moins trois** des dix
sites, dont **A5** et **A8** :

```bash
npm run dev
```

Pour chacun :

1. cliquer le bouton → **un** dialogue s'ouvre, avec le message **exact**, ses coupures de
   ligne comprises ;
2. **`Tab` en boucle** → le focus ne sort **jamais** du dialogue ;
3. **`Échap`** → le dialogue se ferme, **rien n'est soumis**, et le focus est **revenu sur le
   bouton** ;
4. rouvrir, cliquer **Annuler** → idem ;
5. rouvrir, cliquer **Confirmer** → l'action part **une seule fois** (vérifier dans l'onglet
   réseau qu'il n'y a **pas deux** requêtes), et le résultat est celui d'avant ;
6. **rouvrir une seconde fois et faire `Échap`** → **rien n'est soumis**. Si quelque chose
   part, `returnValue` n'a pas été remis à zéro dans `Dialogue` (Task 7).

**⚠️ SI LE DIALOGUE SE ROUVRE EN BOUCLE après une confirmation**, le navigateur refire le clic
sur le déclencheur. Ajouter alors, dans les dix fichiers, un garde de ré-entrée :

```tsx
const confirme = useRef(false)
// dans onClick :
if (confirme.current) { confirme.current = false; return }
evenement.preventDefault()
setConfirmationDemandee(true)
// dans surConfirmation, AVANT requestSubmit :
confirme.current = true
```

**Consigner dans le rapport de tâche laquelle des deux formes a été retenue, et pourquoi.**

- [ ] **Étape 4 : vérifier que les dix sites sont convertis, et que les cinq autres ne le sont pas encore**

```bash
grep -rn "window.confirm" src --include="*.tsx" | wc -l
```

Attendu : **5** — les cinq de la famille B, traités à la Task 14.

```bash
grep -rln "Dialogue" src/app --include="*.tsx" | wc -l
```

Attendu : **10**.

- [ ] **Étape 5 : vérifier qu'aucun message n'a bougé d'un octet**

```bash
git diff -- src/app | grep -E "^[-+].*(\?|Désactiver|Réactiver|Archiver|Rétablir|Retirer|Détacher|Supprimer|Convertir)" | sort
```

Chaque ligne retirée doit avoir sa jumelle ajoutée. **Attention particulière aux `\n\n`, aux
guillemets français `« »` et aux apostrophes droites.**

- [ ] **Étape 6 : les portes rapides, puis le commit**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls
```

**PAS `test:e2e` ici** — voir l'avertissement de tête.

```bash
git add src/app/ael/calendriers/bouton-bascule-calendrier.tsx "src/app/ael/seances/[id]/bouton-transition-etat.tsx" src/app/antennes/bouton-bascule-antenne.tsx "src/app/antennes/[id]/ligne-membre-detachable.tsx" src/app/evenements/a-traiter/ligne-a-traiter.tsx src/app/evenements/types/bouton-bascule-type.tsx "src/app/evenements/[id]/participants.tsx" "src/app/membres/[id]/bouton-archiver.tsx" "src/app/membres/[id]/statuts/bouton-retirer-statut.tsx" src/app/statuts/bouton-bascule-statut.tsx
git commit -m "feat(ui): dix confirmations de famille A passent au Dialogue natif (D124)" -m "window.confirm BLOQUE, un <dialog> NE BLOQUE PAS : preventDefault() devient inconditionnel et la soumission est REJOUEE dans le rappel de confirmation, par form.requestSubmit(bouton)." -m "requestSubmit et non submit : submit() ne declenche pas l'evenement submit, donc React ne verrait jamais la soumission et la Server Action ne partirait pas. requestSubmit(declencheur) conserve le declencheur et applique la validation de contrainte, ce qui compte pour ligne-a-traiter.tsx dont le formulaire a des champs required." -m "Le modal natif rend le reste du document inerte : le chemin de conversion choisi ne peut pas changer entre l'ouverture du dialogue et sa confirmation. C'est une des raisons du choix du <dialog> natif." -m "Aucun des dix messages ne change d'un octet. Leurs \\n\\n sont rendus par whitespace-pre-line." -m "La suite e2e rougit a partir d'ici : les 22 gestionnaires page.once('dialog') deviennent inertes. C'est l'exception declaree en C1 du plan, reparee a la Task 15." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14 : les cinq confirmations de famille B — handlers impératifs, **et le défaut réel** (**D124**, D123)

**Fichiers :**
- Modifier : `src/app/comptes/ligne-compte.tsx` (lignes 78-123 — **B1 et B2**)
- Modifier : `src/app/demandes/ligne-demande-admin.tsx` (lignes 76-86 — **B3**)
- Modifier : `src/app/demandes/ligne-demande-personnelle.tsx` (lignes 18-32 — **B4**)
- Modifier : `src/app/tokens/ligne-token.tsx` (lignes 26-39 — **B5**)
- Tester : `npx tsc --noEmit`, `npm run lint` — **PAS `test:e2e`, réparé à la Task 15**

**Interfaces :**
- Consomme : `Dialogue` (Task 7).
- Produit : les cinq derniers sites convertis. **`window.confirm` disparaît de `src/`.**

## ⚠️⚠️ B1 ET B2 PORTENT LE SEUL DÉFAUT QUE LA TRADUCTION MÉCANIQUE INTRODUIRAIT SANS BRUIT

Le code d'origine (`comptes/ligne-compte.tsx:78-98`) :

```tsx
function soumettreRoles(evenement: FormEvent<HTMLFormElement>) {
  evenement.preventDefault()
  if (estMoi && !window.confirm('Modifier vos propres rôles ?\n\n' + '…')) {
    return
  }
  const donnees = new FormData(evenement.currentTarget)   // ← LIGNE 89
  // …
}
```

**`window.confirm` est SYNCHRONE.** La ligne 89 s'exécute donc **dans la même tâche** que le
gestionnaire d'événement, et `evenement.currentTarget` **pointe encore** sur le `<form>`.

**Avec un `<dialog>`, la ligne 89 s'exécute dans un rappel, PLUS TARD.** Or **React remet
`event.currentTarget` à `null` dès que le gestionnaire rend la main** — c'est le
fonctionnement de sa délégation d'événements, inchangé en React 19. `new FormData(null)`
**lève un `TypeError`**, attrapé nulle part, qui remonte au périmètre d'erreur global
(`src/app/error.tsx`) et affiche **« Une erreur est survenue »**, texte **statique**, sur
l'écran d'administration des comptes.

**Le remède : construire la `FormData` SYNCHRONEMENT, avant d'ouvrir le dialogue, et la
garder.** Ce n'est pas une précaution de style — c'est la différence entre un écran qui
fonctionne et un écran qui plante sur son geste le plus sensible.

**⚠️ ET CE FICHIER EST CELUI DE D123 : `ligne-compte.tsx` N'EST PAS CORRIGÉ SUR LE FOND.** Ses
Server Actions appelées hors `<form action>`, dans un `useTransition` avec `try`/`catch`, sont
**ISOLÉES ET DOCUMENTÉES, JAMAIS DÉPLACÉES**. Le commentaire des lignes 37-43 et 62-77
explique que `src/app/error.tsx` affiche un texte **statique** et ne lit jamais
`error.message` — d'où ce contournement. **Le corriger changerait le comportement d'erreur
d'un écran d'administration : c'est un changement de métier, pas de présentation, et D118
l'exclut.**

- [ ] **Étape 1 : B1 et B2 — `comptes/ligne-compte.tsx`**

Ajouter, en tête du composant, l'état et les deux réserves :

```tsx
  /*
    ═══ D124 — `window.confirm` BLOQUE, UN `<dialog>` NE BLOQUE PAS ═══

    ⚠️ LE DÉFAUT QUE LA TRADUCTION MÉCANIQUE INTRODUIRAIT ICI, ET NULLE PART AILLEURS.

    `window.confirm` était SYNCHRONE : `new FormData(evenement.currentTarget)` s'exécutait
    dans la MÊME tâche que le gestionnaire, et `currentTarget` pointait encore sur le
    `<form>`. Avec un dialogue, cette ligne s'exécuterait DANS UN RAPPEL, plus tard — et
    React remet `event.currentTarget` à `null` dès que le gestionnaire rend la main.
    `new FormData(null)` LÈVE un `TypeError`, attrapé nulle part, qui remonte à
    `src/app/error.tsx` et affiche « Une erreur est survenue » sur l'écran des comptes.

    D'OÙ : la `FormData` est construite SYNCHRONEMENT, dans le gestionnaire, et mise en
    réserve. Le rappel ne lit plus que la réserve.

    UNE RÉSERVE PAR FORMULAIRE, et non une seule partagée : les deux formulaires de cette
    ligne (rôles et activation) sont indépendants, et une réserve unique ferait qu'ouvrir la
    seconde confirmation pendant que la première est encore ouverte enverrait les mauvaises
    données. Ce cas est impossible — un dialogue modal rend le reste inerte — mais le rendre
    IMPOSSIBLE PAR CONSTRUCTION coûte une variable.
  */
  const [confirmationRoles, setConfirmationRoles] = useState<string | null>(null)
  const donneesRoles = useRef<FormData | null>(null)
  const [confirmationActivation, setConfirmationActivation] = useState<string | null>(null)
  const donneesActivation = useRef<FormData | null>(null)
```

`soumettreRoles` devient :

```tsx
  const MESSAGE_ROLES =
    'Modifier vos propres rôles ?\n\n' +
    'Si vous retirez votre rôle administrateur, vous perdrez ce pouvoir immédiatement.'

  function envoyerRoles(donnees: FormData) {
    setErreurRoles(null)
    demarrerRoles(async () => {
      try {
        await definirRoles(donnees)
      } catch (erreur) {
        setErreurRoles(erreur instanceof Error ? erreur.message : String(erreur))
      }
    })
  }

  function soumettreRoles(evenement: FormEvent<HTMLFormElement>) {
    evenement.preventDefault()
    // ⚠️ SYNCHRONE, AVANT TOUTE OUVERTURE DE DIALOGUE. Voir le commentaire de tête.
    const donnees = new FormData(evenement.currentTarget)
    if (estMoi) {
      donneesRoles.current = donnees
      setConfirmationRoles(MESSAGE_ROLES)
      return
    }
    envoyerRoles(donnees)
  }
```

et, dans le rendu, à côté du `<form onSubmit={soumettreRoles}>` :

```tsx
        <Dialogue
          ouvert={confirmationRoles !== null}
          message={confirmationRoles ?? ''}
          surConfirmation={() => {
            setConfirmationRoles(null)
            const donnees = donneesRoles.current
            donneesRoles.current = null
            // Le `if` n'est pas défensif pour rien : sans lui, un état incohérent enverrait
            // une action SANS ses données, et `definirRoles` retirerait les deux rôles.
            if (donnees) envoyerRoles(donnees)
          }}
          surAnnulation={() => {
            setConfirmationRoles(null)
            donneesRoles.current = null
          }}
        />
```

**Même transformation, mot pour mot, pour `soumettreActivation`** (B2), avec son message
ternaire :

```tsx
  const messageActivation = compte.actif
    ? 'Désactiver votre propre compte ?\n\n' +
      "Vous serez déconnecté et ne pourrez plus vous reconnecter tant qu'un autre " +
      'administrateur ne vous aura pas réactivé.'
    : 'Réactiver votre propre compte ?'
```

**⚠️ LES DEUX MESSAGES NE CHANGENT PAS D'UN OCTET** — `tests/e2e/archivage-compte.spec.ts`
en assert le contenu.

**⚠️ NE PAS TOUCHER** aux commentaires des lignes 37-43 et 62-77. Ils sont **la seule trace**
de D123 dans le code, et le prochain lecteur les rencontrera exactement là.

- [ ] **Étape 2 : B3 — `demandes/ligne-demande-admin.tsx:76-86`**

Le code d'origine capture `const formulaire = evenement.currentTarget` **avant** le confirm
(L78), puis construit la `FormData` **après** (L85). L'élément DOM survit, donc **ce site ne
plante pas** — mais il devient dépendant de l'ordre des rendus React. **Même remède, pour la
même raison, et parce que trois formes différentes pour le même geste dans un même dépôt
finissent par diverger** :

```tsx
  const [confirmationRejet, setConfirmationRejet] = useState<string | null>(null)
  const donneesRejet = useRef<FormData | null>(null)

  function soumettreRejet(evenement: FormEvent<HTMLFormElement>) {
    evenement.preventDefault()
    // SYNCHRONE : voir `comptes/ligne-compte.tsx`, même piège, même remède.
    const donnees = new FormData(evenement.currentTarget)
    const nomComplet = `${demande.membrePrenom ?? ''} ${demande.membreNom ?? ''}`.trim()
    const consequence =
      demande.origine === 'conversion_participant'
        ? "Cette personne a été convertie depuis un évènement : sa fiche restera « en attente » DÉFINITIVEMENT, et aucun geste de l'application ne pourra plus l'activer ni la supprimer."
        : 'Le demandeur en sera notifié avec le motif saisi.'
    donneesRejet.current = donnees
    setConfirmationRejet(`Rejeter la demande concernant ${nomComplet} ? ${consequence}`)
  }
```

**⚠️ NE PAS TOUCHER au commentaire M12 des lignes 65-75.** Il explique pourquoi cette
confirmation existe, et pourquoi elle est **particulièrement définitive** pour l'origine
`conversion_participant`. **`tests/e2e/demandes.spec.ts:556-560` assert ce message.**

- [ ] **Étape 3 : B4 et B5 — les deux sites SANS danger**

`demandes/ligne-demande-personnelle.tsx:18-32` et `tokens/ligne-token.tsx:26-39` construisent
leur `FormData` **de zéro** (`new FormData()` + `set`), sans toucher à l'événement. **Aucun
piège de `currentTarget`** — la transformation est directe :

```tsx
  const [confirmationDemandee, setConfirmationDemandee] = useState(false)

  function annuler() {
    setConfirmationDemandee(true)
  }

  function confirmerAnnulation() {
    setConfirmationDemandee(false)
    const donnees = new FormData()
    donnees.set('demandeId', demande.id)
    setErreur(null)
    demarrer(async () => {
      // `annulerDemandeSuivi` RETOURNE son refus, elle ne le lève plus
      // (correction post-Task-17 : un `throw` perd son message en production,
      // voir le commentaire de tête de `src/app/demandes/actions.ts`).
      const { erreur } = await annulerDemandeSuivi(donnees)
      if (erreur) {
        setErreur(erreur)
      }
    })
  }
```

+ `<Dialogue ouvert={confirmationDemandee} message="Annuler cette demande ? La fiche créée sera supprimée." surConfirmation={confirmerAnnulation} surAnnulation={() => setConfirmationDemandee(false)} />`

**⚠️ Les deux commentaires « RETOURNE son refus, elle ne le lève plus » sont CONSERVÉS**, sur
les deux fichiers : ils portent une règle du projet, pas un détail de mise en œuvre.

Pour B5 (`tokens/ligne-token.tsx`), le message est construit par interpolation :

```tsx
  const message = `Révoquer ce token ${
    token.mode === 'nominatif' ? `(${token.membreNom ?? 'fiche inconnue'})` : 'générique'
  } ?`
```

**À l'octet près.** `tests/e2e/tokens.spec.ts` porte **trois** gestionnaires sur ce bouton.

- [ ] **Étape 4 : PREUVE N°4 DU §7 — zéro `window.confirm` restant**

```bash
grep -rn "window.confirm" src | wc -l
```

Attendu : **0**.

**Contrôle positif obligatoire** — un zéro obtenu par une commande cassée ne prouve rien :

```bash
printf 'if (!window.confirm("x")) return\n' > /tmp/temoin-confirm.ts
grep -rn "window.confirm" /tmp/temoin-confirm.ts | wc -l
```

Attendu : **1**. Si ce contrôle rend 0, la commande est cassée et le zéro précédent ne vaut
rien.

```bash
grep -rn "confirm(" src | wc -l
```

Attendu : **0** — aucun appel sous un autre nom (`globalThis.confirm`, `confirm` nu).

```bash
grep -rln "Dialogue" src/app --include="*.tsx" | wc -l
```

Attendu : **14** — dix fichiers de famille A, quatre de famille B (`ligne-compte.tsx` porte
**deux** des quinze sites).

- [ ] **Étape 5 : vérifier le comportement RÉEL de B1 et B2, dans un navigateur**

C'est le seul moyen d'attraper le défaut de `currentTarget` avant la production : **aucun test
de ce dépôt ne couvre `/comptes`**.

```bash
npm run dev
```

Sur `/comptes`, **sur SA PROPRE ligne** (celle qui porte « C'est votre compte. ») :

1. cocher/décocher un rôle, cliquer « Enregistrer les rôles » → le dialogue s'ouvre avec le
   message exact ;
2. **Annuler** → **rien n'est envoyé**, la case reste dans l'état où on l'avait mise ;
3. recommencer, **Confirmer** → l'action part **avec les bonnes données** (vérifier que le
   rôle est bien celui qu'on avait coché, **pas** l'ancien) ;
4. **si « Une erreur est survenue » apparaît**, c'est le `TypeError` de `new FormData(null)` :
   la `FormData` n'a pas été construite synchronement. **Relire l'étape 1.**
5. répéter pour « Désactiver » / « Réactiver ».

**⚠️ Ne PAS retirer son propre rôle administrateur pour de bon.** Le remettre immédiatement, ou
opérer sur un compte de test. Ce projet a **une seule base**, qui sert aussi de production.

- [ ] **Étape 6 : les portes rapides, puis le commit**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls
```

```bash
git add src/app/comptes/ligne-compte.tsx src/app/demandes/ligne-demande-admin.tsx src/app/demandes/ligne-demande-personnelle.tsx src/app/tokens/ligne-token.tsx
git commit -m "feat(ui): cinq confirmations de famille B passent au Dialogue natif (D124)" -m "LE DEFAUT REEL EST ICI. window.confirm etait SYNCHRONE : new FormData(evenement.currentTarget) s'executait dans la meme tache que le gestionnaire. Avec un dialogue, cette ligne s'executerait dans un rappel, et React remet event.currentTarget a null des que le gestionnaire rend la main — new FormData(null) leve un TypeError qui remonte a error.tsx et affiche un texte statique sur l'ecran des comptes." -m "Remede : la FormData est construite SYNCHRONEMENT et mise en reserve ; le rappel ne lit plus que la reserve. Une reserve par formulaire, pour rendre impossible par construction l'envoi des donnees de l'autre." -m "ligne-compte.tsx n'est PAS corrige sur le fond (D123) : ses Server Actions appelees hors <form action> restent la ou elles sont, et leurs commentaires — la seule trace de cette decision dans le code — sont conserves mot pour mot." -m "window.confirm disparait de src/ : grep rend zero, avec controle positif." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 15 : le harnais e2e du `Dialogue`, et les preuves neuves (**D119** exception C1, **D125**)

**Fichiers :**
- Créer : `tests/confirmation.ts`
- Créer : `tests/e2e/dialogue.spec.ts`
- Modifier : **11 fichiers de test, HARNAIS SEULEMENT** — les 22 gestionnaires
  `page.once('dialog', …)`
- Tester : `test:e2e` **en lots**, `test:e2e:prod`

**Interfaces :**
- Consomme : les Tasks 13 et 14 (les quinze sites convertis).
- Produit :

```ts
// tests/confirmation.ts
export async function accepterConfirmation(page: Page): Promise<string>
export async function refuserConfirmation(page: Page): Promise<string>
export async function fermerConfirmationParEchap(page: Page): Promise<string>
```

## ⚠️⚠️ C'EST L'UNIQUE EXCEPTION À D119 DE TOUTE LA PHASE, ET ELLE EST DÉCLARÉE EN C1 DU PLAN

**D119 : « les preuves de bout en bout existantes ne sont PAS modifiées pour accommoder la
refonte. Si une preuve rougit, c'est un SIGNAL. »** Et D124 exige de retirer les quinze
`window.confirm`. **Les deux ne peuvent pas être vraies ensemble** : Playwright ne déclenche
`page.on('dialog')` que pour les boîtes **natives**, et les 22 gestionnaires deviennent
**inertes** — ils ne cassent pas bruyamment, les tests échouent en **timeout**, loin de la
cause.

**Ce qui change, et ce qui ne change pas :**

| Change | Ne change pas |
|---|---|
| `page.once('dialog', (d) => d.accept())` → `await accepterConfirmation(page)` | **Aucune assertion.** Les six `expect(...).toContain(...)` sur le texte gardent leur chaîne **à l'octet près** |
| la **position** de l'appel : après le clic, au lieu d'avant | le clic lui-même, ses sélecteurs, son ordre |
| — | le **nombre de `test(`** dans les 20 fichiers e2e existants : **128** ; dans les 7 fichiers e2e-prod : **10** |

**Tout est concentré dans CE commit.** Aucune autre tâche du plan ne touche `tests/`.

- [ ] **Étape 1 : `tests/confirmation.ts` — le helper partagé**

Placé à la racine de `tests/`, et non sous `tests/e2e/` : **il sert aux deux projets
Playwright**, dont `tests/e2e-prod/refus-evenements-production.spec.ts`, l'une des dix preuves
de production. `testDir` ne restreint que la découverte des fichiers de test, jamais les
imports.

```ts
import { expect, type Page } from '@playwright/test'

/**
 * ═══ LE HARNAIS DE CONFIRMATION, APRÈS LE PASSAGE AU `<dialog>` NATIF (phase 6, D124) ═══
 *
 * AVANT, les quinze confirmations passaient par `window.confirm()`, et Playwright REJETAIT
 * automatiquement toute boîte native non gérée — d'où les 22 `page.once('dialog', …)`
 * répartis sur 11 fichiers de test. Ces gestionnaires ne se déclenchent QUE pour les boîtes
 * natives : après la refonte, ils deviennent INERTES. Ils ne cassent pas bruyamment ; les
 * clics qu'ils débloquaient restent bloqués derrière un `<dialog>` que personne ne confirme,
 * et les tests échouent en TIMEOUT, loin de la cause.
 *
 * ⚠️ CE FICHIER EST L'UNIQUE EXCEPTION À D119 DE LA PHASE 6, DÉCLARÉE AVANT D'ÊTRE ÉCRITE.
 * Il change le CANAL, jamais la PREUVE : aucune assertion des suites existantes n'est
 * touchée, et le texte rendu par le dialogue est celui-là même que `dialogue.message()`
 * rendait — les quinze messages n'ont pas bougé d'un octet.
 *
 * ═══ POURQUOI L'APPEL SE FAIT APRÈS LE CLIC, ET NON AVANT ═══
 *
 * `page.once('dialog', …)` s'enregistrait AVANT le clic, parce qu'une boîte native est
 * synchrone et qu'il n'y avait pas d'autre moment. Un `<dialog>` est un ÉLÉMENT DU DOM : il
 * n'existe qu'après le clic, et on l'attend comme n'importe quel élément. La substitution
 * est donc : SUPPRIMER la ligne `page.once(…)` avant le clic, AJOUTER un `await` après.
 */

/** Le dialogue de confirmation ouvert. `<dialog>` a le rôle ARIA `dialog` implicite. */
function dialogue(page: Page) {
  return page.getByRole('dialog')
}

/**
 * Attend le dialogue, RETOURNE SON MESSAGE, et clique « Confirmer ».
 *
 * Le message est rendu même quand l'appelant l'ignore : c'est ce qui permet aux six tests
 * qui l'assertaient de garder leurs `expect(...).toContain(...)` inchangés.
 *
 * ⚠️ `toBeVisible()` AVANT le clic n'est pas une politesse : sans cette attente, un clic
 * sur un dialogue pas encore ouvert échouerait avec « element not found », message qui ne
 * dirait rien de la cause réelle — exactement le défaut que ce fichier corrige.
 */
export async function accepterConfirmation(page: Page): Promise<string> {
  const boite = dialogue(page)
  await expect(boite).toBeVisible()
  const texte = await boite.locator('p').first().innerText()
  await boite.getByRole('button', { name: 'Confirmer' }).click()
  await expect(boite).toBeHidden()
  return texte
}

/** Attend le dialogue, rend son message, et clique « Annuler ». Rien ne doit être soumis. */
export async function refuserConfirmation(page: Page): Promise<string> {
  const boite = dialogue(page)
  await expect(boite).toBeVisible()
  const texte = await boite.locator('p').first().innerText()
  await boite.getByRole('button', { name: 'Annuler' }).click()
  await expect(boite).toBeHidden()
  return texte
}

/** Attend le dialogue, rend son message, et le ferme par `Échap`. Rien ne doit être soumis. */
export async function fermerConfirmationParEchap(page: Page): Promise<string> {
  const boite = dialogue(page)
  await expect(boite).toBeVisible()
  const texte = await boite.locator('p').first().innerText()
  await page.keyboard.press('Escape')
  await expect(boite).toBeHidden()
  return texte
}
```

- [ ] **Étape 2 : les 16 substitutions SIMPLES (sans capture de message)**

Pour chacune des **16** occurrences de `page.once('dialog', (dialogue) => dialogue.accept())`
ou `(d) => d.accept()` — **supprimer la ligne**, et **ajouter `await accepterConfirmation(page)`
immédiatement après le clic qu'elle débloquait** :

| Fichier | Lignes des gestionnaires |
|---|---|
| `tests/e2e/ael-pointage.spec.ts` | 384 |
| `tests/e2e/ael-preuves.spec.ts` | 1043 |
| `tests/e2e/ael-seance-detail.spec.ts` | 297, 311, 327 |
| `tests/e2e/arbre.spec.ts` | 254, 281, 337 |
| `tests/e2e/archivage-compte.spec.ts` | 225 |
| `tests/e2e/demandes.spec.ts` | 367, 629 |
| `tests/e2e/evenements-types.spec.ts` | 162, 171 |
| `tests/e2e/tokens.spec.ts` | 171, 225, 255 |

Ajouter l'import en tête de chaque fichier touché :

```ts
import { accepterConfirmation } from '../confirmation'
```

**⚠️ NE PAS DÉPLACER LE CLIC.** Certains de ces clics sont suivis d'un `await expect(…)` qui
attend le résultat de l'action. L'`await accepterConfirmation(page)` s'insère **entre les
deux**, jamais ailleurs — sans quoi l'assertion attendrait un résultat que rien n'a déclenché.

**⚠️ REMPLACER AUSSI LES COMMENTAIRES QUI DEVIENNENT FAUX.** `tests/e2e/tokens.spec.ts:163-166`
et `tests/e2e/evenements.spec.ts:116-119` expliquent que « Playwright REJETTE automatiquement
toute boîte de dialogue native non gérée ». **Ce n'est plus la raison.** Les récrire pour dire
la nouvelle : le dialogue est un élément du DOM, attendu et cliqué comme tel. **Un commentaire
qui ment est pire qu'un commentaire absent**, et c'est un mode de défaillance nommé de ce
projet.

- [ ] **Étape 3 : les 6 substitutions AVEC capture de message**

Ce sont celles qui portent la preuve : **une confirmation retirée par inadvertance laisserait
sinon ces tests parfaitement verts** (c'est écrit en toutes lettres dans
`tests/e2e/annuaire.spec.ts:177-181`). **Les assertions ne bougent pas d'un caractère.**

**3a. `tests/e2e/annuaire.spec.ts:182-192`**

```ts
  // On retient le message du dialogue au lieu de simplement l'accepter : sans cette
  // assertion, le test resterait vert si la confirmation venait à disparaître du
  // bouton, et rien ne protégerait plus contre un archivage en un seul clic.
  await page.getByRole('button', { name: 'Archiver' }).click()
  const messageConfirmation = await accepterConfirmation(page)
  await expect(page).toHaveURL(/\/membres$/)
  expect(messageConfirmation).toContain('Archiver la fiche')
  expect(messageConfirmation).toContain("rien n'est supprimé")
```

Le `let messageConfirmation: string | null = null` et le `page.once(…)` disparaissent ; les
**deux `expect(...).toContain(...)` sont repris à l'identique**.

**3b. `tests/e2e/archivage-compte.spec.ts:151-160` et `:182-190`** — même forme, deux fois.

**3c. `tests/e2e/demandes.spec.ts:556-560`** — même forme.

**3d. `tests/e2e/evenements.spec.ts:116-133`** — **la seule qui demande plus qu'un
déplacement.** Le fichier définit un helper local :

```ts
function capterConfirmation(page: Page): { texte: string | null } {
  const capture: { texte: string | null } = { texte: null }
  page.once('dialog', async (dialogue) => { capture.texte = dialogue.message(); await dialogue.accept() })
  return capture
}
```

**Il est appelé AVANT le clic** et son résultat lu **après**. Le remplacer par le helper
partagé, appelé **après** le clic :

```ts
import { accepterConfirmation } from '../confirmation'
```

et, à chaque site d'appel :

```ts
// AVANT : const capture = capterConfirmation(page) ; await …click() ; expect(capture.texte)…
// APRÈS :
await …click()
const texteConfirmation = await accepterConfirmation(page)
expect(texteConfirmation).toContain(…)  // ← chaîne INCHANGÉE
```

**Supprimer `capterConfirmation` et son commentaire de tête**, qui décrit un mécanisme qui
n'existe plus. **Vérifier qu'il n'a pas d'autre appelant** avant de le retirer :

```bash
grep -n "capterConfirmation" tests/ -r
```

**3e. `tests/e2e-prod/refus-evenements-production.spec.ts:234-240`** — **l'une des DIX preuves
de production**. Même forme que 3a. Import : `import { accepterConfirmation } from '../confirmation'`.

- [ ] **Étape 4 : vérifier qu'aucun `test(` n'a été ajouté ni retiré des fichiers existants**

```bash
grep -rhoE "^\s*test\(" tests/e2e --include="*.spec.ts" | wc -l
```

Attendu : **132** — les 128 d'origine **plus les 4** du nouveau fichier `dialogue.spec.ts`
(étape 5). **Hors `dialogue.spec.ts`, ce compte doit valoir exactement 128** :

```bash
grep -rhoE "^\s*test\(" tests/e2e --include="*.spec.ts" | grep -v dialogue | wc -l
```

Attendu : **128**.

```bash
grep -rhoE "^\s*test\(" tests/e2e-prod --include="*.spec.ts" | wc -l
```

Attendu : **10**, inchangé.

```bash
grep -rn "once('dialog'" tests/ | wc -l
```

Attendu : **0**.

- [ ] **Étape 5 : `tests/e2e/dialogue.spec.ts` — LES PREUVES QUE D125 EXIGE**

D125 : « les neuf autres composants EXTRAIENT un motif déjà écrit dix à vingt-cinq fois, et
leur risque est la DIVERGENCE. Celui-ci CRÉE un comportement neuf, et son risque est le
DÉFAUT : piège de focus, fermeture par `Échap`, restitution du focus, comportement au
clavier. Il exige donc des preuves d'une autre nature. »

**Les trois premiers tests ne mutent RIEN** — ils ferment le dialogue par `Échap` ou par
« Annuler ». Le quatrième confirme, et le nettoyage est vérifié par comptage sur la famille.

```ts
import { createClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'
import {
  accepterConfirmation,
  fermerConfirmationParEchap,
  refuserConfirmation,
} from '../confirmation'

/*
  ═══ D125 — LE `Dialogue` CRÉE UN COMPORTEMENT, IL N'EN EXTRAIT AUCUN ═══

  Les neuf autres composants de la phase 6 extraient un motif déjà écrit dix à vingt-cinq
  fois : leur risque est la DIVERGENCE, et les 128 preuves existantes la détectent. Celui-ci
  n'a AUCUN antécédent dans le dépôt — zéro `<dialog>`, zéro `role="dialog"` avant la
  phase 6 — et son risque est le DÉFAUT. D'où ce fichier.

  LES TROIS PREMIERS TESTS NE MUTENT RIEN : ils ferment par `Échap` ou par « Annuler ». Le
  quatrième confirme, et son effet est nettoyé par famille.

  Écran choisi : `/evenements/types`, dont la bascule actif/inactif porte une confirmation
  (`BoutonBasculeType`), est réservée à l'administrateur, et n'a aucune conséquence en
  cascade — une réactivation la défait entièrement.
*/
test.describe.configure({ mode: 'serial' })

const IDENT_ADMIN = 'test.e2e.dialogue.admin'
const MDP_ADMIN = `Test-${crypto.randomUUID()}`
// NETTOYAGE SUR LA FAMILLE, PAS SUR LE SUFFIXE ALÉATOIRE (M9) : une exécution interrompue
// laisserait sinon en base de PRODUCTION des lignes que plus rien ne retrouverait, leur
// suffixe étant mort avec le processus.
const FAMILLE = 'ZZDialogue-'
const LIBELLE_TYPE = `${FAMILLE}${crypto.randomUUID().slice(0, 8)}`

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

async function nettoyer() {
  const { error } = await admin.from('types_evenement').delete().like('libelle', `${FAMILLE}%`)
  if (error) throw new Error(`nettoyage des types impossible : ${error.message}`)
  const { data } = await admin.from('profils').select('id').eq('identifiant', IDENT_ADMIN).maybeSingle()
  if (data) await admin.auth.admin.deleteUser(data.id)
}

test.beforeAll(async () => {
  await nettoyer()
  // … création du compte administrateur, sur le motif EXACT de
  // `tests/e2e/evenements-types.spec.ts` (auth.admin.createUser + profils + roles) …
  // UN `insert` DE PRÉPARATION DONT L'ERREUR EST JETÉE REND LE TEST VERT EN ÉPROUVANT UN
  // TOUT AUTRE CHEMIN : trouvé trois fois dans ce projet. Toute préparation vérifie son
  // erreur et LÈVE.
  const { error } = await admin.from('types_evenement').insert({ libelle: LIBELLE_TYPE, actif: true })
  if (error) throw new Error(`préparation impossible : ${error.message}`)
})

test.afterAll(async () => {
  await nettoyer()
  // NETTOYAGE VÉRIFIÉ PAR COMPTAGE, sur la MÊME famille que la suppression.
  const { count, error } = await admin
    .from('types_evenement')
    .select('id', { count: 'exact', head: true })
    .like('libelle', `${FAMILLE}%`)
  if (error) throw new Error(`comptage des résidus impossible : ${error.message}`)
  if (count !== 0) throw new Error(`${count} résidu(s) de la famille ${FAMILLE}`)
})

async function ouvrirLaConfirmation(page: import('@playwright/test').Page) {
  await page.goto('/evenements/types')
  await expect(page.getByText(LIBELLE_TYPE)).toBeVisible()
  const ligne = page.locator('li').filter({ hasText: LIBELLE_TYPE })
  await ligne.getByRole('button', { name: 'Désactiver' }).click()
}

test('le dialogue PIEGE le focus : la tabulation n en sort pas', async ({ page }) => {
  // … connexion en administrateur …
  await ouvrirLaConfirmation(page)
  const boite = page.getByRole('dialog')
  await expect(boite).toBeVisible()

  /*
    Le dialogue contient DEUX éléments focalisables : « Annuler » et « Confirmer ». Six
    tabulations parcourent donc trois cycles complets. Après chacune, l'élément focalisé
    doit être DANS le dialogue.

    ⚠️ CONTRÔLE POSITIF : sans lui, ce test serait satisfait par une page où RIEN n'est
    focalisable — l'état même qu'il doit exclure. On vérifie donc AUSSI que le focus a
    réellement changé d'un élément à l'autre.
  */
  const focalises: string[] = []
  for (let i = 0; i < 6; i += 1) {
    await page.keyboard.press('Tab')
    expect(await boite.evaluate((element) => element.contains(document.activeElement))).toBe(true)
    focalises.push(await page.evaluate(() => document.activeElement?.textContent ?? ''))
  }
  // CONTRÔLE POSITIF : au moins deux textes DISTINCTS ont été focalisés.
  expect(new Set(focalises).size).toBeGreaterThanOrEqual(2)

  await fermerConfirmationParEchap(page)
})

test('Echap ferme le dialogue SANS rien soumettre', async ({ page }) => {
  await ouvrirLaConfirmation(page)
  const message = await fermerConfirmationParEchap(page)
  expect(message).toContain('Désactiver')

  // RIEN N'A ÉTÉ SOUMIS : le type est TOUJOURS actif, en BASE et non seulement à l'écran.
  const { data, error } = await admin
    .from('types_evenement')
    .select('actif')
    .eq('libelle', LIBELLE_TYPE)
    .single()
  if (error) throw new Error(`lecture impossible : ${error.message}`)
  expect(data.actif).toBe(true)
})

test('le focus REVIENT sur le bouton declencheur apres la fermeture', async ({ page }) => {
  await ouvrirLaConfirmation(page)
  await fermerConfirmationParEchap(page)

  /*
    Le bouton « Désactiver » de CETTE ligne doit avoir repris le focus. Sans restitution,
    l'utilisateur clavier se retrouve sur `<body>`, en haut de page, et doit re-tabuler
    jusqu'à l'endroit où il était.
  */
  const texteFocalise = await page.evaluate(() => document.activeElement?.textContent ?? '')
  expect(texteFocalise).toContain('Désactiver')
})

test('Annuler ne soumet rien, Confirmer soumet une seule fois', async ({ page }) => {
  await ouvrirLaConfirmation(page)
  await refuserConfirmation(page)

  const { data: apresAnnulation } = await admin
    .from('types_evenement')
    .select('actif')
    .eq('libelle', LIBELLE_TYPE)
    .single()
  expect(apresAnnulation?.actif).toBe(true)

  await ouvrirLaConfirmation(page)
  const message = await accepterConfirmation(page)
  expect(message).toContain('Désactiver')

  await expect(page.getByRole('button', { name: 'Réactiver' })).toBeVisible()
  const { data: apresConfirmation } = await admin
    .from('types_evenement')
    .select('actif')
    .eq('libelle', LIBELLE_TYPE)
    .single()
  expect(apresConfirmation?.actif).toBe(false)
})
```

**⚠️ Reprendre la création du compte administrateur du `beforeAll` MOT POUR MOT de
`tests/e2e/evenements-types.spec.ts`** — `auth.admin.createUser`, insertion dans `profils`,
attribution du rôle. Ne pas la réinventer : elle porte des contraintes de format
d'identifiant (`^[a-z][a-z0-9.-]{2,31}$`) dont la violation ferait échouer la **préparation**,
échec qui se lirait à tort comme une régression de ce fichier.

- [ ] **Étape 6 : les portes rapides, puis le commit**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls
```

```bash
git add tests/confirmation.ts tests/e2e/dialogue.spec.ts tests/e2e/ tests/e2e-prod/
git commit -m "test(e2e): adapter le harnais des 22 confirmations au <dialog> natif (exception D119 declaree)" -m "UNIQUE EXCEPTION A D119 DE LA PHASE, declaree dans le plan avant d'etre ecrite. Playwright ne declenche page.on('dialog') que pour les boites NATIVES : les 22 gestionnaires devenaient inertes et les tests echouaient en timeout, loin de la cause." -m "Le CANAL change, la PREUVE non. Les six tests qui assertent le texte de la confirmation gardent leurs expect(...).toContain(...) a l'octet pres, parce que le Dialogue rend la meme chaine. Aucun test( n'est ajoute ni retire des fichiers existants : 128 et 10, verifies par comptage." -m "Les commentaires qui expliquaient le rejet automatique des boites natives sont recrits : un commentaire qui ment est pire qu'un commentaire absent." -m "tests/e2e/dialogue.spec.ts porte les preuves que D125 exige — focus piege, Echap ferme sans rien soumettre, focus restitue au declencheur, Annuler inoffensif, Confirmer soumis une seule fois. Trois des quatre tests ne mutent rien." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Étape 7 : PORTE DE FIN DE LOT C — build, e2e EN LOTS, e2e:prod**

⚠️ **LE DÉLAI D'EXÉCUTION PLAFONNE À 600 000 ms, ET UNE DEMANDE SUPÉRIEURE EST IGNORÉE, PAS
REFUSÉE.** Lancer **en lots**, jamais d'un trait (voir la politique des portes en tête de
plan).

```bash
npm run build
```

```bash
npm run test:e2e -- tests/e2e/dialogue.spec.ts tests/e2e/annuaire.spec.ts tests/e2e/archivage-compte.spec.ts tests/e2e/tokens.spec.ts
```

```bash
npm run test:e2e -- tests/e2e/arbre.spec.ts tests/e2e/arborescence.spec.ts tests/e2e/statuts.spec.ts tests/e2e/autorite.spec.ts
```

```bash
npm run test:e2e -- tests/e2e/ael-pointage.spec.ts tests/e2e/ael-preuves.spec.ts tests/e2e/ael-seance-detail.spec.ts
```

```bash
npm run test:e2e -- tests/e2e/demandes.spec.ts tests/e2e/evenements.spec.ts tests/e2e/evenements-detail.spec.ts tests/e2e/evenements-liste.spec.ts tests/e2e/evenements-types.spec.ts
```

```bash
npm run test:e2e -- tests/e2e/antennes-membres.spec.ts tests/e2e/connexion.spec.ts tests/e2e/creation-enrichie.spec.ts tests/e2e/inscription.spec.ts tests/e2e/notifications.spec.ts
```

```bash
npm run test:e2e:prod
```

**Consigner le décompte de tests passés de chaque lot.** La somme doit valoir **132** pour
`test:e2e` — les **128** d'origine, **inchangés**, plus les **4** de `dialogue.spec.ts` — et
**10** pour `test:e2e:prod`, inchangé. **Si le total des 128 a bougé, un test a été ajouté ou
retiré d'un fichier existant, ce que l'exception C1 n'autorise PAS.**

**⚠️ SI UNE SUITE ROUGIT POUR UNE AUTRE RAISON QUE LE HARNAIS, C'EST UN SIGNAL.** Établir quel
commit l'a cassée par un rejeu en isolation, et le consigner.

---

# LOT D — LES VINGT ET UN ÉCRANS RESTANTS (Tasks 16 à 24)

**Le socle est figé depuis la Task 11.** Si l'une de ces tâches croit devoir modifier un
composant de `src/composants/ui/`, elle **s'arrête et le signale** : une modification du socle
à ce stade oblige à relire **tous** les écrans déjà migrés, et c'est exactement ce que la
Task 11 existait pour éviter.

**Le gabarit est celui des trois témoins.** Chaque tâche ci-dessous nomme ses fichiers, ses
substitutions et ses pièges propres ; pour tout le reste, elle applique la même transformation
qu'aux Tasks 8, 9 et 10 :

| Construction d'origine | Remplacement |
|---|---|
| `<Link>` de retour + `<h1 className="… text-2xl font-semibold">` | `<EnTetePage retour={…} titre={…} soustitre={…} action={…} />` |
| `<h2 className="text-lg font-medium">` | `<h2 className="text-section">` |
| `<ul className="divide-y divide-neutral-200">` + `<li>` | `<Liste>` + `<LigneListe>` |
| `<form action={…}>` + bandeau `role="alert"` + bouton | `<Formulaire action={…} erreur={…} enCours={…}>` + `<Bouton>` |
| `<input>` / `<select>` / `<textarea>` contrôlés dans un `<form action>` | `<Champ>` / `<Selecteur>` / `<ZoneTexte>` |
| `<button className="… bg-neutral-900 …">` | `<Bouton variante="principal">` |
| `<button className="… border-neutral-300 …">` | `<Bouton variante="secondaire">` |
| `<button className="… underline underline-offset-4">` | `<Bouton variante="lien">` |
| `<button className="… text-red-600 underline …">` | `<Bouton variante="lien-danger">` |
| `<nav aria-label="Pagination">` écrit à la main | `<Pagination>` |
| `if (page > pages) redirect(…)` | `bornerPage(…)` |
| bandeau `bg-amber-50` / `bg-green-50` | `<Carte ton="avertissement" role="alert">` / `<Carte ton="succes" role="status">` |
| `text-sm text-neutral-500` / `-600` | `text-petit text-encre-attenuee` |
| `text-sm text-red-600` | `text-petit text-etat-refus` |
| `px-6 py-10`, `gap-4`, `mt-4`, … | `px-esp-6 py-esp-10`, `gap-esp-4`, `mt-esp-4`, … |
| `rounded-md` | `rounded-bord` |
| `sm:` | `md:` (D115) |

**ET, POUR CHAQUE TÂCHE DE CE LOT :**

1. **Aucun texte affiché ne change** (D117). Chaque tâche finit par le balayage de diff.
2. **Les preuves e2e qui couvrent l'écran ne sont pas modifiées** (D119). Elles sont nommées
   dans chaque tâche. **Si l'une rougit, c'est un signal.**
3. **Aucun fichier sous `supabase/`** (D118).
4. **Signaler, ne pas corriger** : vingt et un écrans rouverts, c'est vingt et une occasions
   de voir un défaut réel et de le réparer hors sujet (piège n°4).
5. **Le rail de filiation ne se pose que sur les cinq sites légitimes** listés dans les
   contraintes globales (piège n°6).

---

## Où les 28 champs non contrôlés se ferment, tâche par tâche

L'inventaire du vocabulaire (§3.1, rejoué par script) recense **28 champs libres sur
12 fichiers**. Chacun est fermé par une tâche nommée, et **le compte ferme exactement** :

| Fichier | Champs | Tâche |
|---|---|---|
| `src/app/connexion/formulaire-connexion.tsx` | 2 | **12** |
| `src/app/statuts/formulaire-catalogue.tsx` | 4 | **16** |
| `src/app/ael/calendriers/formulaire-calendrier.tsx` | 3 | **16** |
| `src/app/antennes/formulaire-antenne.tsx` | 2 | **16** |
| `src/app/comptes/formulaire-compte.tsx` | 2 | **20** |
| `src/app/tokens/formulaire-generation.tsx` | 1 | **20** |
| `src/app/membres/[id]/statuts/formulaire-statut.tsx` | 3 | **22** |
| `src/app/membres/[id]/statuts/page.tsx` | 1 | **22** |
| `src/app/ael/seances/[id]/formulaire-seance.tsx` | 2 | **23** |
| `src/app/ael/seances/formulaire-seance-manuelle.tsx` | 2 | **23** |
| `src/app/demandes/nouvelle/page.tsx` | 4 | **24** |
| `src/app/changer-mot-de-passe/page.tsx` | 2 | **24** |
| **Total** | **28** sur **12 fichiers** | |

**La Task 24 vérifie ce zéro**, avec son contrôle positif (preuve n°3 étendue).

---

### Task 16 : les quatre catalogues basculables (D110, D111, D115, D124-aval)

**Fichiers :**
- Modifier : `src/app/antennes/page.tsx` (64), `src/app/antennes/formulaire-antenne.tsx` (**2 champs libres**)
- Modifier : `src/app/statuts/page.tsx` (57), `src/app/statuts/formulaire-catalogue.tsx` (**4 champs libres**)
- Modifier : `src/app/evenements/types/page.tsx` (50), `src/app/evenements/types/formulaire-type.tsx`
- Modifier : `src/app/ael/calendriers/page.tsx` (73), `src/app/ael/calendriers/formulaire-calendrier.tsx` (**3 champs libres**)
- Tester : `npx tsc --noEmit`, `npm run lint`

**Interfaces :** consomme `EnTetePage`, `Liste`, `LigneListe`, `Formulaire`, `Champ`,
`Selecteur`, `Bouton`. Produit : rien.

**Pourquoi ces quatre ensemble.** L'inventaire des écrans le dit : « plusieurs écrans
partagent déjà, presque au mot près, la forme *liste + bascule actif/inactif par ligne +
formulaire d'ajout en bas* ». Un relecteur peut rejeter la migration de ces quatre en
approuvant celle des listes paginées : **c'est le critère de découpe.**

**⚠️ AUCUN COMPOSANT « CATALOGUE BASCULABLE » N'EST CRÉÉ.** L'inventaire suggère qu'il
« rendrait ces quatre écrans quasiment gratuits ». **D110 s'y oppose : quatre appelants ne
franchissent pas le seuil de dix**, et les quatre divergent sur le fond — `/antennes` a une
section « désactivées » séparée et un lien par ligne vers `/antennes/[id]`, `/statuts` a des
**groupes**, `/evenements/types` grise les lignes inactives (`text-neutral-400`, la **seule
occurrence du dépôt**), `/ael/calendriers` compose son libellé à partir d'un jour et d'une
heure. Un composant qui absorberait les quatre porterait quatre branches — c'est-à-dire le
désordre, déplacé.

**⚠️ LES QUATRE BOUTONS DE BASCULE ONT DÉJÀ ÉTÉ CONVERTIS AU `Dialogue` À LA TASK 13**
(`bouton-bascule-antenne.tsx`, `bouton-bascule-statut.tsx`, `bouton-bascule-type.tsx`,
`bouton-bascule-calendrier.tsx`). **Ne pas y retoucher.** Cette tâche ne touche que les
`page.tsx` et les formulaires d'ajout.

**Preuves e2e (D119, ne pas modifier) :** `tests/e2e/statuts.spec.ts` (8),
`tests/e2e/evenements-types.spec.ts` (7), `tests/e2e/antennes-membres.spec.ts` (5),
`tests/e2e/ael-preuves.spec.ts` (11), `tests/e2e/dialogue.spec.ts` (4, qui vit sur
`/evenements/types`).

- [ ] **Étape 1 : les quatre `page.tsx`** — gabarit du lot D, plus :
  - `/antennes` : la section « Antennes désactivées » garde son `<h2>` et sa liste séparée ;
    le `text-neutral-500` du lien d'une antenne désactivée devient `text-encre-attenuee`.
  - `/evenements/types` : `type.actif ? '' : 'text-neutral-400'` (ligne 35) devient
    `type.actif ? '' : 'text-encre-attenuee'`. **C'était la SEULE occurrence de
    `text-neutral-400` du dépôt**, et le couple le plus à risque de contraste relevé par
    l'inventaire (§4.3). Le remplacement le corrige **sans changer un mot affiché**.
  - `/statuts` : les groupes deviennent des `<h2 className="text-section">` au-dessus de
    chaque `<Liste>`.
  - `/ael/calendriers` : le libellé composé (`LIBELLE_JOUR[…]` + heure) reste **identique**.

- [ ] **Étape 2 : les quatre formulaires d'ajout — ET LES NEUF CHAMPS LIBRES (D111)**

Chacun devient un `<Formulaire>` avec des `<Champ>` / `<Selecteur>` **contrôlés**. Neuf
`useState` à ajouter :

| Fichier | Champs à contrôler |
|---|---|
| `antennes/formulaire-antenne.tsx` | `nom` (L14), `pays` (L21) |
| `statuts/formulaire-catalogue.tsx` | `nom` (L17), `exclusif` (L20, **case à cocher**), `libelle` (L48), `select groupeId` (L56) |
| `ael/calendriers/formulaire-calendrier.tsx` | `select antenneId` (L25), `select jourSemaine` (L41), `heure` (L54) |
| `evenements/types/formulaire-type.tsx` | (aucun — déjà contrôlé) |

**⚠️ `exclusif` de `formulaire-catalogue.tsx:20` est une CASE À COCHER.** `Champ` interdit
`defaultChecked` (D111), et une case à cocher n'entre **pas** dans `Champ` (voir son
commentaire, Task 3 : neuf cases, toutes dans des `<form onSubmit>` où le mécanisme de remise
à zéro ne s'applique pas). **MAIS CELLE-CI EST DANS UN `<form action>`** — c'est donc la
**seule** case à cocher du dépôt réellement exposée au piège. La rendre contrôlée avec
`checked` + `onChange`, en `<input type="checkbox">` nu portant la classe de champ, **et
écrire un commentaire qui dit pourquoi elle est la seule.**

**⚠️ Les deux `<select defaultValue=…>` de `formulaire-calendrier.tsx` deviennent contrôlés**,
donc `Selecteur`. **Leurs options ne changent pas d'un mot** — `LIBELLE_JOUR` reste la source.

- [ ] **Étape 3 : vérifier que neuf champs libres ont disparu**

```bash
grep -rn "defaultValue\|defaultChecked" src/app/antennes/ src/app/statuts/ src/app/evenements/types/ src/app/ael/calendriers/
```

Attendu : **zéro ligne**.

- [ ] **Étape 4 : balayage de texte, portes, commit**

```bash
git diff src/app/antennes/ src/app/statuts/ src/app/evenements/types/ src/app/ael/calendriers/ | grep -E "^[-+].*[A-Za-zÀ-ÿ]{4,}" | grep -vE "^[-+]\s*(//|/\*|\*)" | grep -viE "class|import|const|function|return|export|type "
```

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls
```

```bash
git add src/app/antennes/ src/app/statuts/ src/app/evenements/types/ src/app/ael/calendriers/
git commit -m "refactor(ui): les quatre catalogues basculables" -m "Aucun composant catalogue basculable n'est cree : quatre appelants ne franchissent pas le seuil de dix (D110), et les quatre divergent sur le fond. Un composant qui les absorberait porterait quatre branches — le desordre, deplace." -m "Neuf des vingt-huit champs non controles sont fermes ici. Dont exclusif de formulaire-catalogue.tsx, SEULE case a cocher du depot reellement exposee au piege : les huit autres vivent dans des <form onSubmit>, ou la remise a zero de React ne s'applique pas." -m "text-neutral-400 disparait du depot : c'etait sa seule occurrence (evenements/types/page.tsx:35) et le couple de contraste le plus a risque releve par l'inventaire." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 17 : les listes paginées — `/evenements`, `/demandes` (compact), `/notifications` (D107, D115, D121, D126)

**Fichiers :**
- Modifier : `src/app/evenements/page.tsx` (160), `src/app/evenements/formulaire-evenement.tsx` (217)
- Modifier : `src/app/demandes/page.tsx` (193), `src/app/demandes/ligne-demande-admin.tsx` (199),
  `src/app/demandes/ligne-demande-personnelle.tsx`, `src/app/demandes/formulaire-validation-suivi.tsx`
- Modifier : `src/app/notifications/page.tsx` (46), `src/app/notifications/formulaire-marquage.tsx`
- Tester : `npx tsc --noEmit`, `npm run lint`

**Interfaces :** consomme `EnTetePage`, `Liste`, `LigneListe`, `Pagination`, `Formulaire`,
`Champ`, `Selecteur`, `Bouton`, `Carte`, `EtatBadge` ; `bornerPage`.

**⚠️ `/demandes` PORTE `data-densite="compact"` (D107).** C'est l'un des **trois** écrans
concernés, et **les seuls** : `/comptes` (Task 20) et `/evenements/a-traiter` (Task 18) sont
les deux autres. L'attribut se pose sur le `<main>` :

```tsx
<main data-densite="compact" className="mx-auto max-w-4xl px-esp-6 py-esp-10">
```

Il ne remappe que **six jetons d'espacement**. **Ni la couleur, ni la typographie, ni le
rayon, ni la hauteur des cibles tactiles ne changent** : une cible tactile réduite serait une
régression d'accessibilité déguisée en densité.

**⚠️ `/demandes` PORTE DEUX BORNAGES (D121), et c'est le seul écran du dépôt dans ce cas.**
Le premier est **sous `estAdmin`** (`page.tsx:86`), le second non. **La condition reste au
site d'appel** :

```tsx
const pagesATraiter = estAdmin
  ? bornerPage(pageATraiter, totalATraiter, TAILLE_PAGE_DEMANDES, (n) => `/demandes?page=${n}&pageMiennes=${pageMiennes}`)
  : nombreDePages(totalATraiter, TAILLE_PAGE_DEMANDES)

const pagesMiennes = bornerPage(pageMiennes, totalMiennes, TAILLE_PAGE_DEMANDES, (n) => `/demandes?page=${pageATraiter}&pageMiennes=${n}`)
```

**⚠️ LE SEUL RAIL DE FILIATION DE CETTE TÂCHE est le champ « Dirigeant proposé » de
`formulaire-validation-suivi.tsx:53`** — c'est là qu'une relation de discipulat est
réellement affichée. **Nulle part ailleurs sur ces trois écrans.**

**⚠️ `EtatBadge` sur `/demandes` : la correspondance est déclarée ICI, à côté de
`LIBELLE_ETAT`** (`ligne-demande-personnelle.tsx:7-12`), et non dans le composant (voir C4) :

```tsx
const TON_ETAT: Record<DemandeListe['etat'], TonEtat> = {
  en_attente: 'attente',
  validee: 'acquis',
  rejetee: 'refus',
  annulee: 'neutre',
}
```

et `<EtatBadge ton={TON_ETAT[demande.etat]} libelle={LIBELLE_ETAT[demande.etat]} />` remplace
le `<span className="text-sm text-neutral-500">{LIBELLE_ETAT[demande.etat]}</span>` de la
ligne 40. **Le libellé ne change pas d'un octet** (D126 : pastille **et** libellé, jamais l'un
sans l'autre).

**⚠️ `evenements/formulaire-evenement.tsx:95` PORTE `onReset={(e) => e.preventDefault()}`** —
l'un des **trois** fichiers du dépôt à le faire. **Il migre dans `Formulaire`, il n'est pas
retiré.** Son `<select name="typeId">` (L116-119) est **contrôlé** : il devient `Selecteur`.
**⚠️ Son commentaire des lignes 178-182**, qui pose la règle « une aide laissée dans le
`<label>` est concaténée au nom accessible du champ », est **la source citée par trois autres
fichiers**. **Le conserver.**

**⚠️ `evenements/page.tsx:62` est le SECOND et DERNIER `<form method="get">` du dépôt.** Il
garde ses `<select defaultValue>` nus, avec le commentaire de frontière écrit à la Task 8.

**Preuves e2e (D119, ne pas modifier) :** `tests/e2e/demandes.spec.ts` (16),
`tests/e2e/evenements.spec.ts` (12), `tests/e2e/evenements-liste.spec.ts` (5),
`tests/e2e/notifications.spec.ts` (6), et **`tests/e2e-prod/evenements-liste-production.spec.ts`
et `refus-evenements-production.spec.ts`** (3 des 10 preuves de production).

- [ ] **Étape 1 : `/evenements`** — gabarit, `bornerPage`, `Pagination`, `Selecteur` sur
  `formulaire-evenement.tsx`, `Formulaire` (qui absorbe `onReset`).
- [ ] **Étape 2 : `/demandes`** — gabarit, `data-densite="compact"`, les **deux** bornages,
  `EtatBadge`, le rail sur « Dirigeant proposé ». **Le bandeau `bg-green-50` de la ligne 103
  devient `<Carte ton="succes" role="status">{MESSAGE_DEMANDE_CREEE}</Carte>`.**
- [ ] **Étape 3 : `/notifications`** — gabarit. Écran le plus court des trois.
- [ ] **Étape 4 : vérifier que `onReset` a migré, et que le bornage est extrait**

```bash
grep -rn "onReset" src/app/evenements/
grep -rn "if (page" src/app/demandes/page.tsx src/app/evenements/page.tsx
```

Attendu : **zéro** dans les deux cas.

- [ ] **Étape 5 : balayage de texte, portes, commit** (voir Task 16, étape 4).

```bash
git commit -m "refactor(ui): /evenements, /demandes (densite compacte) et /notifications" -m "/demandes est l'un des trois ecrans en data-densite=compact (D107), et le seul du depot a porter DEUX bornages de pagination, dont un sous estAdmin — la condition reste au site d'appel, bornerPage ne decide d'aucun acces." -m "EtatBadge entre en service sur /demandes, avec sa correspondance etat -> ton declaree a cote du Record de libelles existant, et non dans le composant : les libelles sont un vocabulaire d'ecran, pas une union fermee (voir C4 du plan)." -m "onReset de evenements/formulaire-evenement.tsx est DEPLACE dans Formulaire, pas retire. C'etait l'un des trois fichiers du depot a le porter a la main." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 18 : `/evenements/a-traiter` — liste d'action en densité compacte (D107, D121, D127)

**Fichiers :**
- Modifier : `src/app/evenements/a-traiter/page.tsx` (94)
- Modifier : `src/app/evenements/a-traiter/ligne-a-traiter.tsx` (**305 lignes — 4ᵉ plus gros
  fichier du dépôt**)
- Tester : `npx tsc --noEmit`, `npm run lint`

**Interfaces :** consomme `EnTetePage`, `Liste`, `LigneListe`, `Pagination`, `Formulaire`,
`Champ`, `Selecteur`, `Bouton` ; `bornerPage`.

**Pourquoi une tâche à lui seul (D127).** 305 lignes, **deux formulaires indépendants par
ligne de liste**, **trois chemins de conversion mutuellement exclusifs**, tous les champs déjà
contrôlés. C'est l'un des cinq écrans les plus lourds, et **les quatre derniers de cette liste
partagent une même cause : plusieurs formulaires indépendants empilés dans une seule ligne de
liste.** C'est ce qui rend `LigneListe` et `Formulaire` déterminants pour eux quatre — et ce
qui se mesure ici.

**⚠️ `data-densite="compact"` (D107)** sur le `<main>` de `page.tsx`. Deuxième des trois.

**⚠️ LE `window.confirm` DE LA LIGNE 230 A DÉJÀ ÉTÉ CONVERTI À LA TASK 13 (site A5).** Ne pas
y retoucher, et **ne pas défaire le `Dialogue`** en réorganisant le JSX.

**⚠️ LE SÉLECTEUR DE FAISEUR DE DISCIPLE du chemin de conversion porte un rail de filiation**
— c'est l'un des cinq sites légitimes. Le sélecteur de **fiche membre existante** (chemin 3)
n'en porte **pas** : rattacher un séminaire à une fiche n'est pas un lien de discipulat.

**⚠️ LES `<details>` / `<summary>` RESTENT.** Les deux formulaires par ligne sont repliés
derrière un `<summary className="cursor-pointer text-sm underline underline-offset-4">`
(7 occurrences dans le dépôt). Ce n'est **pas** un bouton : c'est un dépliage natif, sans
JavaScript, et le remplacer par un `Bouton` + état coûterait un composant et un axe de test.
Le `<summary>` prend la classe de lien et `cible-tactile`.

**⚠️ NE PAS TOUCHER** au commentaire M11 des lignes 216-225 (« la conversion est le geste le
plus irréversible de la phase »), ni à `messageConfirmationConversion`.

**Preuves e2e (D119) :** `tests/e2e/evenements.spec.ts` (12, dont la conversion),
`tests/e2e/demandes.spec.ts`, et **`tests/e2e-prod/refus-evenements-production.spec.ts`**.

- [ ] **Étape 1 : `page.tsx`** — `EnTetePage`, `data-densite="compact"`, `bornerPage`,
  `Pagination`, `Liste`. Le sous-titre (« Participants externes ayant exprimé le désir… {total}
  personne{s}. ») passe en `soustitre`, **mot pour mot**.
- [ ] **Étape 2 : `ligne-a-traiter.tsx`** — `LigneListe` avec `principal`, `meta`, et les deux
  `<details>` en `complement` ; les deux `<form action>` deviennent `Formulaire` ; les champs
  contrôlés deviennent `Champ` ; les boutons deviennent `Bouton`.
- [ ] **Étape 3 : vérifier que la densité compacte est bien posée, et qu'elle ne touche que l'espacement**

```bash
grep -rn "data-densite" src/app/
```

Attendu à ce stade : **deux** fichiers — `demandes/page.tsx` (Task 17) et
`evenements/a-traiter/page.tsx`. Le troisième (`comptes/page.tsx`) vient à la Task 20.

Vérifier **dans un navigateur** que la cible tactile de 44 px est **conservée** sur cet
écran : c'est ce que D107 promet explicitement, et c'est ce qu'une densité mal écrite casse en
premier.

- [ ] **Étape 4 : balayage de texte, portes, commit.**

---

### Task 19 : `/evenements/[id]` et sa liste de participants imbriquée (D115, D121)

**Fichiers :**
- Modifier : `src/app/evenements/[id]/page.tsx` (169), `participants.tsx` (270),
  `formulaire-participant-externe.tsx` (148), `champs-desirs.tsx`
- Tester : `npx tsc --noEmit`, `npm run lint`

**Interfaces :** consomme `EnTetePage`, `Liste`, `LigneListe`, `Pagination`, `Formulaire`,
`Champ`, `Selecteur`, `ZoneTexte`, `Bouton`, `Carte` ; `bornerPage`.

**⚠️ LE BORNAGE EST SOUS `if (peutGerer)` (`page.tsx:74-80`), ET IL Y RESTE.** Hors modérateur
et administrateur, **rien n'est lu**, il n'y a aucune page à borner, et rediriger **serait
divulguer qu'il y a des participants**. `bornerPage` ne décide d'aucun accès — la condition
reste au site d'appel.

**⚠️ LE `<dl>` DE LA FICHE ÉVÈNEMENT EST L'UN DES TROIS DU DÉPÔT** (`ael/seances/[id]/page.tsx`,
`evenements/[id]/page.tsx`, `membres/[id]/page.tsx`), et l'inventaire les décrit comme « le
motif le plus cohérent du dépôt : les trois fichiers utilisent, indépendamment, EXACTEMENT
`<dl className="divide-y divide-neutral-200">`, `<dt className="text-sm text-neutral-500">`,
`<dd className="text-sm">` — zéro divergence ».

**AUCUN COMPOSANT `ListeDefinition` N'EST CRÉÉ.** D110 : trois appelants ne franchissent pas le
seuil de dix, et les trois sont **déjà identiques** — leur risque n'est pas la divergence,
c'est qu'un quatrième diverge un jour. **Les trois adoptent la même substitution de classes
(`divide-filet`, `text-petit text-encre-attenuee`, `text-corps`), écrite trois fois
identiquement**, aux Tasks 19, 21 et 23. **Consigner ce choix dans le rapport de tâche** : si
un cinquième `<dl>` apparaît un jour, le seuil sera à rediscuter.

**⚠️ LE `window.confirm` DE LA LIGNE 179 A DÉJÀ ÉTÉ CONVERTI À LA TASK 13 (site A7).** Ce site
est couvert par **`tests/e2e-prod/refus-evenements-production.spec.ts`, l'une des DIX preuves
de production**, qui **assert son message**.

**Preuves e2e (D119) :** `tests/e2e/evenements-detail.spec.ts` (5),
`tests/e2e/evenements.spec.ts` (12), **`tests/e2e-prod/evenements-detail-production.spec.ts`**
et **`refus-evenements-production.spec.ts`**.

- [ ] **Étape 1 : `page.tsx`** — `EnTetePage`, `<dl>` en jetons, `bornerPage` **sous
  `if (peutGerer)`**, `Pagination`.
- [ ] **Étape 2 : `participants.tsx`** — `Liste` / `LigneListe`, les `<details>` conservés,
  les formulaires en `Formulaire`.
- [ ] **Étape 3 : `formulaire-participant-externe.tsx` et `champs-desirs.tsx`** — `Champ`,
  `Selecteur`, `ZoneTexte`, `Bouton`. **Les trois cases « désir » gardent leur forme**
  (cases à cocher hors `Champ`, voir Task 3).
- [ ] **Étape 4 : balayage de texte, portes, commit.**

---

### Task 20 : `/comptes` (compact, **D123**) et `/tokens` (D107, D111, D127)

**Fichiers :**
- Modifier : `src/app/comptes/page.tsx` (30), `src/app/comptes/ligne-compte.tsx` (**296 —
  5ᵉ plus gros du dépôt**), `src/app/comptes/formulaire-compte.tsx` (**2 champs libres**)
- Modifier : `src/app/tokens/page.tsx` (30), `src/app/tokens/ligne-token.tsx`,
  `src/app/tokens/formulaire-generation.tsx` (**1 champ libre**)
- Tester : `npx tsc --noEmit`, `npm run lint`

**Interfaces :** consomme `EnTetePage`, `Liste`, `LigneListe`, `Formulaire`, `Champ`,
`Bouton`, `Carte`, `EtatBadge`.

**⚠️ `data-densite="compact"` sur `/comptes` (D107).** Le **troisième et dernier** des trois.
`/tokens` **n'en porte pas** — il n'est pas dans la liste de D107, et l'y ajouter « par
symétrie » serait une décision que personne n'a prise.

## ⚠️⚠️ D123 — `ligne-compte.tsx` N'EST PAS CORRIGÉ SUR LE FOND. IL EST ISOLÉ ET DOCUMENTÉ.

Trois de ses quatre formulaires appellent leurs Server Actions **directement depuis un
`useTransition`**, avec `try`/`catch`, au lieu de `<form action={…}>`. La raison est écrite
dans le fichier (lignes 37-43 et 62-77) : **`src/app/error.tsx` affiche un texte STATIQUE et
ne lit jamais `error.message`**, donc une action qui lève y perdrait son message métier — « le
refus du dernier administrateur ne serait donc jamais vu ».

**C'est une hypothèse fragile, et la corriger changerait le COMPORTEMENT D'ERREUR d'un écran
d'administration des comptes : un changement de métier, pas de présentation. D118 l'exclut.**

**Ce que cette tâche fait :**

1. **Elle ne déplace aucun de ces trois appels.** `soumettre`, `envoyerRoles`,
   `envoyerActivation` restent où ils sont, avec leur `useTransition` et leur `try`/`catch`.
2. **Elle conserve MOT POUR MOT les commentaires des lignes 37-43 et 62-77.** Ce sont la
   **seule trace** de cette décision dans le code, et le prochain lecteur les rencontrera
   exactement là.
3. **Elle ajoute, en tête du fichier, un commentaire de PÉRIMÈTRE** qui nomme la décision :

```tsx
/*
  ═══ D123 (phase 6) — CE FICHIER N'EST PAS CORRIGÉ SUR LE FOND, ET C'EST DÉLIBÉRÉ ═══

  Trois des quatre formulaires de cette ligne appellent leur Server Action DIRECTEMENT depuis
  un `useTransition`, au lieu de `<form action={…}>`. Ce n'est pas un oubli : c'est un
  contournement, expliqué plus bas (lignes du commentaire de `soumettre` et de
  `soumettreRoles`), reposant sur une hypothèse au sujet de `src/app/error.tsx` — il affiche
  un texte STATIQUE et ne lit jamais `error.message`.

  L'HYPOTHÈSE EST FRAGILE, et la corriger changerait le COMPORTEMENT D'ERREUR d'un écran
  d'administration des comptes. C'est un changement de métier, pas de présentation ; la
  phase 6 ne touche à aucun chemin d'écriture (D118), et D123 trace explicitement la ligne :
  ISOLER ET DOCUMENTER, PAS CORRIGER.

  ⚠️ TOUTE NOUVELLE SERVER ACTION DE GESTION DE COMPTE QUI LÈVE au lieu de retourner un état
  retombera dans le même piège si elle est câblée en `<form action>` simple. C'est le
  véritable coût de ce contournement, et c'est pour le dire ici qu'il est documenté plutôt
  que corrigé en passant.
*/
```

4. **Elle vérifie que le `Dialogue` de la Task 14 (sites B1 et B2) est intact**, avec sa
   `FormData` construite **synchronement**.

**⚠️ LES DEUX CASES À COCHER `defaultChecked` (L211, L220) RESTENT NON CONTRÔLÉES.** Elles
sont dans le `<form onSubmit={soumettreRoles}>`, **pas** dans un `<form action>` : le mécanisme
de remise à zéro de React **ne s'y applique pas**. L'inventaire du vocabulaire l'a vérifié en
lisant le fichier entier et conclut : « le README a raison de l'exclure ». **Les contrôler
serait corriger un défaut qui n'existe pas**, sur le fichier que D123 protège.

**⚠️ `EtatBadge` sur `/comptes` et `/tokens`** — correspondances déclarées à côté des libellés
existants :

```tsx
// comptes/ligne-compte.tsx, à côté de LIBELLE_ROLE
// `compte.actif ? 'Actif' : 'Désactivé'` (L144) devient :
<EtatBadge ton={compte.actif ? 'acquis' : 'refus'} libelle={compte.actif ? 'Actif' : 'Désactivé'} />
```

```tsx
// tokens/ligne-token.tsx, à côté de etatToken()
// `etatToken` rend DÉJÀ une chaîne composée (« Utilisé le … », « Révoqué le … », « Expiré »,
// « Valide »). NE PAS LA DÉCOMPOSER : elle est assertée par tests/e2e/tokens.spec.ts.
// Une seconde fonction rend le TON, à partir des mêmes champs :
function tonToken(token: TokenListe): TonEtat {
  if (token.utiliseLe) return 'acquis'
  if (token.revoqueLe) return 'refus'
  if (new Date(token.expireLe) < new Date()) return 'refus'
  return 'attente'
}
```

**Le libellé ne change pas d'un octet** (D126).

**Preuves e2e (D119) :** `tests/e2e/tokens.spec.ts` (5, dont **trois** portaient un
gestionnaire de dialogue), `tests/e2e/archivage-compte.spec.ts` (3).
**Aucune preuve ne couvre `/comptes` directement** — c'est pourquoi la Task 14 exigeait une
vérification manuelle de B1 et B2.

- [ ] **Étape 1 : `comptes/page.tsx`** — `EnTetePage`, `data-densite="compact"`, `Liste`.
- [ ] **Étape 2 : `ligne-compte.tsx`** — `LigneListe`, `Formulaire` (les **quatre**),
  `Bouton`, `EtatBadge`, `Carte ton="avertissement"` pour le bandeau de mot de passe
  temporaire (L279-293) et pour la mention de fiche archivée (L160-164). **Le commentaire de
  périmètre D123 en tête. AUCUN appel d'action déplacé.**
- [ ] **Étape 3 : `formulaire-compte.tsx` (2 champs libres) et `formulaire-generation.tsx`
  (1 champ libre)** — `Formulaire`, `Champ` contrôlés.
- [ ] **Étape 4 : `tokens/page.tsx` et `ligne-token.tsx`** — gabarit, `EtatBadge`.
- [ ] **Étape 5 : vérifier que D123 tient**

```bash
grep -n "useTransition\|try {" src/app/comptes/ligne-compte.tsx | wc -l
```

Attendu : **inchangé par rapport à `git show HEAD~1:src/app/comptes/ligne-compte.tsx`**.
Comparer les deux décomptes explicitement.

```bash
grep -c "error.tsx" src/app/comptes/ligne-compte.tsx
```

Attendu : **au moins 2** — les commentaires d'origine sont toujours là.

- [ ] **Étape 6 : balayage de texte, portes, commit.**

---

### Task 21 : `/membres/[id]` — la fiche dense et son rail de filiation (D106, D126, D127)

**Fichiers :**
- Modifier : `src/app/membres/[id]/page.tsx` (**309 — 3ᵉ plus gros du dépôt**)
- Tester : `npx tsc --noEmit`, `npm run lint`

**Interfaces :** consomme `EnTetePage`, `Liste`, `LigneListe`, `Carte`, `EtatBadge`,
`Bouton`, `CLASSES_VARIANTE`.

**Pourquoi une tâche à lui seul (D127).** Fiche dense : identité, situation, statuts,
séminaires assistés, disciples actifs, **six sections conditionnelles**, **trois bandeaux
d'avertissement distincts** (`archivageRefuse`, `archivageRefuseAdministrateur`,
`desarchivageRefuse`), et des contrôles d'archivage conditionnés par rôle **et** par état de
la fiche.

## ⚠️ C'EST L'ÉCRAN OÙ LE RAIL DE FILIATION EST LE PLUS LÉGITIME — ET LE PLUS FACILE À FAIRE MENTIR

**Trois endroits, et trois seulement, portent un rail sur cette fiche :**

| Emplacement | Ligne | Pourquoi |
|---|---|---|
| ligne « Faiseur de disciple » du `<dl>` | 83 | c'est **la** relation de discipulat de cette personne |
| ligne « Dirigeant » du `<dl>` | 85-94 | relation dérivée de la précédente (`proposerDirigeant`) |
| section « Disciples actifs » | 270-303 | la relation, vue depuis l'autre bout |

**⚠️ NULLE PART AILLEURS.** Ni sur « Antenne », ni sur « Ville », ni sur « Compteur AEL », ni
sur « Séminaires assistés » — un séminaire n'est pas une filiation. **Le rail marque une
profondeur ou un lien de discipulat ; s'il apparaît là où aucune relation n'existe, il devient
une décoration qui affirme quelque chose de faux, la forme de défaut la plus coûteuse de ce
projet** (piège n°6).

**⚠️ LES DEUX `rounded-full` DU DÉPÔT SONT ICI** (L213 et L255), et **ce ne sont PAS des
`EtatBadge`** (voir C4) : ce sont des **puces** de statut et de séminaire, en
`rounded-full border border-neutral-300`, **sans couleur**. Elles restent des puces —
`rounded-full border border-bord-carte px-esp-3 py-esp-1 text-petit`. **Y mettre un `EtatBadge`
attribuerait une couleur d'état à un statut de catalogue, que la donnée ne porte pas.**

**`EtatBadge` sur cette fiche sert à `membre.etat`**, et à lui seul :

```tsx
const TON_ETAT_MEMBRE: Record<EtatMembre, TonEtat> = {
  actif: 'acquis',
  en_attente: 'attente',
  archive: 'refus',
}
```

**⚠️ LES TROIS BANDEAUX D'AVERTISSEMENT deviennent `<Carte ton="avertissement" role="alert">`**,
et **leurs textes ne changent pas d'un octet** : ils nomment les trois refus d'archivage, et
`tests/e2e/archivage-compte.spec.ts` en assert au moins un.

**⚠️ NE PAS TOUCHER** au grand commentaire des lignes 227-247 (la vue `seminaires_assistes`,
seule vue du projet en `security_invoker = false`, et le symptôme de diagnostic : « si cette
section est vide sur toutes les fiches, la première chose à vérifier est `reloptions` »), ni à
celui des lignes 195-201 (« Gérer » vs « Journal »), ni à celui des lignes 87-92 (pourquoi le
dirigeant ne dit pas « Calculé »).

**Preuves e2e (D119) :** `tests/e2e/annuaire.spec.ts` (6), `tests/e2e/arbre.spec.ts` (6),
`tests/e2e/autorite.spec.ts` (4), `tests/e2e/archivage-compte.spec.ts` (3),
`tests/e2e/creation-enrichie.spec.ts` (3), `tests/e2e/statuts.spec.ts` (8).
**C'est l'écran le plus couvert du dépôt.**

- [ ] **Étape 1 : l'en-tête et le `<dl>`** — `EnTetePage` (avec `EtatBadge` de l'état en
  `soustitre`), `<dl>` en jetons, **rail sur les deux lignes de filiation seulement**.
- [ ] **Étape 2 : les trois bandeaux d'avertissement** → `<Carte ton="avertissement" role="alert">`.
- [ ] **Étape 3 : les sections « Statuts », « Séminaires assistés », « Disciples actifs »** —
  puces conservées telles quelles ; « Disciples actifs » en `Liste`/`LigneListe` **avec rail**.
- [ ] **Étape 4 : `BoutonArchiver`** — **DÉJÀ converti au `Dialogue` à la Task 13 (site A8).**
  Ne pas y retoucher ; vérifier seulement qu'il est toujours monté au bon endroit.
- [ ] **Étape 5 : vérifier que le rail ne ment pas**

```bash
grep -n "rail" "src/app/membres/[id]/page.tsx"
```

Attendu : **exactement trois emplacements**, ceux du tableau ci-dessus. **Toute quatrième
occurrence est un rail qui ment.**

- [ ] **Étape 6 : balayage de texte, portes, commit.**

---

### Task 22 : les quatre satellites — `modifier`, `statuts`, `arbre`, `/antennes/[id]` (D106, D111)

**Fichiers :**
- Modifier : `src/app/membres/[id]/modifier/page.tsx` (50)
- Modifier : `src/app/membres/[id]/statuts/page.tsx` (135, **1 champ libre**),
  `formulaire-statut.tsx` (**3 champs libres**)
- Modifier : `src/app/membres/[id]/arbre/page.tsx` (56), `formulaire-arbre.tsx` (190)
- Modifier : `src/app/antennes/[id]/page.tsx` (82), `formulaire-rattachement.tsx`,
  `ligne-membre-detachable.tsx`
- Modifier : `src/app/membres/selecteur-membre.tsx`
- Tester : `npx tsc --noEmit`, `npm run lint`

**Interfaces :** consomme tout le socle.

**Pourquoi ces quatre ensemble.** Ce sont les quatre écrans **satellites d'une fiche** :
chacun est atteint depuis `/membres/[id]` ou `/antennes`, chacun est un formulaire unique
plus une liste courte, et aucun ne dépasse 190 lignes. Un relecteur peut les rejeter en bloc
en approuvant les listes paginées.

**⚠️ `membres/[id]/modifier/page.tsx` MONTE `FormulaireMembre`**, migré à la **Task 9**. Cette
tâche ne touche que **l'enveloppe** de la page — en-tête, conteneur. **Vérifier que l'écran de
modification n'a pas régressé** : c'est le second consommateur du fichier partagé.

**⚠️ `formulaire-arbre.tsx` PORTE L'ORIGINAL du motif de `useRef` de séquence** que
`bloc-enrichissement.tsx:64` cite en commentaire (« Motif repris tel quel de …
formulaire-arbre.tsx »). **NE PAS LE FACTORISER** — ce serait une correction de fond, hors
périmètre (D118, piège n°4). **Le signaler dans le rapport de tâche.**

**⚠️ `formulaire-statut.tsx` PORTE UN `<select defaultValue>` GROUPÉ PAR `<optgroup>`** — c'est
le **second** des deux appelants comptés à la **Task 11**. **Appliquer la décision qu'elle a
prise** : si `Selecteur` a été élargi, l'adopter ici **et** dans `bloc-enrichissement.tsx` ; si
elle a conclu de ne pas l'élargir, garder un `<select>` **contrôlé** nu, avec le commentaire de
frontière. **Dans les deux cas, les trois champs libres de ce fichier sont fermés.**

**⚠️ `membres/[id]/arbre` PORTE UN RAIL DE FILIATION** sur le formulaire de rattachement —
c'est l'un des cinq sites légitimes. **`/antennes/[id]` N'EN PORTE PAS** : le rattachement à
une antenne n'est pas un lien de discipulat.

**⚠️ LE `window.confirm` de `ligne-membre-detachable.tsx:37` A DÉJÀ ÉTÉ CONVERTI À LA TASK 13
(site A4)**, et celui de `bouton-retirer-statut.tsx:8` aussi (site A9). Ne pas y retoucher.

**⚠️ `selecteur-membre.tsx` EST DÉJÀ CONTRÔLÉ** et porte son propre garde contre les réponses
réseau périmées (`dernierAppel`). **Ne migrer que ses CLASSES**, jamais sa logique. Il est
monté par **six** écrans : toute régression s'y voit six fois. Son `role="status"`
d'indicateur de recherche est **conservé**.

**Preuves e2e (D119) :** `tests/e2e/statuts.spec.ts` (8), `tests/e2e/arbre.spec.ts` (6),
`tests/e2e/autorite.spec.ts` (4), `tests/e2e/antennes-membres.spec.ts` (5),
`tests/e2e/creation-enrichie.spec.ts` (3).

- [ ] **Étape 1 : `/membres/[id]/modifier`** — enveloppe seulement.
- [ ] **Étape 2 : `/membres/[id]/statuts`** — page + `formulaire-statut.tsx` (**4 champs
  libres fermés**), journal en `Liste`/`LigneListe`.
- [ ] **Étape 3 : `/membres/[id]/arbre`** — page + `formulaire-arbre.tsx`, **rail**.
- [ ] **Étape 4 : `/antennes/[id]`** — page + les deux composants, **sans rail**.
- [ ] **Étape 5 : `selecteur-membre.tsx`** — classes seulement.
- [ ] **Étape 6 : balayage de texte, portes, commit.**

---

### Task 23 : AEL — `/ael/seances` et `/ael/seances/[id]` (D111, D115, D126)

**Fichiers :**
- Modifier : `src/app/ael/seances/page.tsx` (111), `bouton-generer.tsx`,
  `formulaire-seance-manuelle.tsx` (**2 champs libres**)
- Modifier : `src/app/ael/seances/[id]/page.tsx` (203), `formulaire-seance.tsx`
  (**2 champs libres**), `champ-intervenant.tsx`, `pointage.tsx` (**236 — 9ᵉ plus gros**)
- Tester : `npx tsc --noEmit`, `npm run lint`

**Interfaces :** consomme tout le socle.

**⚠️ `pointage.tsx` PORTE LE SEUL `<h3>` DU DÉPÔT** (ligne 186,
`className="text-sm font-medium"`), et l'inventaire le relève : « c'est EXACTEMENT la même
classe que les libellés de champ de formulaire — rien ne distingue visuellement ce `<h3>`
d'une étiquette de champ. La balise est la bonne, mais aucune échelle typographique ne
matérialise le niveau 3. »

**L'échelle de la conception n'a que CINQ degrés, et aucun n'est un « titre de niveau 3 ».**
`--txt-nom` (0.95 rem / 600) est le plus proche : il **distingue** ce `<h3>` d'un libellé de
champ (`--txt-petit`, 0.85 rem / 400) **sans ajouter un sixième degré**. **C'est la
substitution retenue, et elle est écrite ici pour qu'on ne la découvre pas en revue.**

**⚠️ `EtatBadge` pour l'état de séance** — correspondance déclarée à côté du `LIBELLE_ETAT`
existant, qui vit **en double** dans `ael/seances/page.tsx:9` et
`ael/seances/[id]/page.tsx:12`. **NE PAS LES FACTORISER** : c'est une duplication de
**données d'affichage**, pas de logique, et D121 limite explicitement l'extraction à la seule
redirection de bornage — « toute autre duplication serveur est HORS PÉRIMÈTRE ». **La
signaler dans le rapport de tâche.**

```tsx
const TON_ETAT_SEANCE: Record<EtatSeanceAel, TonEtat> = {
  prevue: 'attente',
  tenue: 'acquis',
  annulee: 'refus',
}
```

**⚠️ LE `<dl>` de `ael/seances/[id]/page.tsx` EST LE TROISIÈME DES TROIS** (voir Task 19) :
même substitution de classes, écrite identiquement.

**⚠️ LE `window.confirm` de `bouton-transition-etat.tsx:16` A DÉJÀ ÉTÉ CONVERTI À LA TASK 13
(site A2).** Ne pas y retoucher.

**⚠️ `bouton-generer.tsx` PORTE UN `role="status"`** (L34), l'un des sept du dépôt, pour une
attente **non liée à un clic de bouton**. **Le conserver** : `Bouton` porte `enCours` +
`libelleAttente`, mais l'indicateur séparé annonce autre chose.

**Preuves e2e (D119) :** `tests/e2e/ael-pointage.spec.ts` (5),
`tests/e2e/ael-preuves.spec.ts` (11), `tests/e2e/ael-seance-detail.spec.ts` (5), et
**`tests/e2e-prod/completude-seance-production.spec.ts`** (1 des 10 preuves de production).
**Vingt et un tests e2e traversent ces deux écrans : c'est le second plus couvert du dépôt.**

- [ ] **Étape 1 : `/ael/seances`** — `EnTetePage`, `Liste`/`LigneListe`, `EtatBadge`,
  le formulaire repliable en `<details>` conservé, **2 champs libres fermés**.
- [ ] **Étape 2 : `/ael/seances/[id]`** — `<dl>` en jetons, `EtatBadge`, `Formulaire`,
  **2 champs libres fermés**.
- [ ] **Étape 3 : `pointage.tsx`** — `Liste`/`LigneListe`, **le `<h3>` en `text-nom`**.
- [ ] **Étape 4 : balayage de texte, portes, commit.**

---

### Task 24 : le reste, et les NEUF PREUVES DE CLÔTURE (D109, D110, D111, D116, D117, D118, D119, D122, D124, D126)

**Fichiers :**
- Modifier : `src/app/tableau-de-bord/page.tsx` (77), `src/app/demandes/nouvelle/page.tsx`
  (55, **4 champs libres**), `src/app/changer-mot-de-passe/page.tsx` (73, **2 champs libres**),
  `src/app/error.tsx` (20), `src/app/not-found.tsx` (16),
  `src/app/notifications/cloche.tsx` (27), `src/app/page.tsx` (5 — **sans doute rien à faire**)
- Modifier : `src/app/globals.css` (**décommenter le reset de rayon, retirer la palette par
  défaut**)
- Tester : **toutes les portes**, puis **la porte de fin de lot D**

**Interfaces :** consomme tout le socle. Produit : **la fin de la phase.**

- [ ] **Étape 1 : les sept derniers écrans**

**`/tableau-de-bord`** — le hub. **C'est le SEUL écran qui affiche l'état de session**
(`Connecté en tant que {nomAffichage} ({identifiant})`, lignes 14-26). Il liste, en dur, des
`<Link>` conditionnés par rôle. `EnTetePage` **sans `retour`** — c'est la destination des
retours, pas leur origine. Les liens deviennent une `<Liste>` de `<LigneListe lien={…}>`, et
le bouton « Se déconnecter » un `<Bouton variante="secondaire">` dans un
`<form action={seDeconnecter}>`. **Les libellés des liens ne changent pas d'un octet** —
un modérateur ne voit toujours pas `/antennes`, `/statuts`, `/comptes`, `/tokens`.

**`/demandes/nouvelle`** — page **entièrement cliente** (l'une des deux du dépôt), réduite à
un formulaire `useActionState`. **4 champs libres** (`prenom` L23, `nom` L27, `telephone` L31,
`ville` L35) → `Champ` contrôlés. `<div className="grid gap-4 sm:grid-cols-2">` (L20) →
`md:grid-cols-2`.

**`/changer-mot-de-passe`** — l'autre page entièrement cliente. **2 champs libres**
(`motDePasse` L23, `confirmation` L35) → `Champ`. **Écran d'état FORCÉ**, atteint uniquement
par `middleware.ts` (drapeau `doit_changer_mdp`) ou par redirection depuis
`connexion/actions.ts` — **jamais la cible d'un `<Link>` de navigation volontaire**. Son lien
de déconnexion reste.

**`src/app/error.tsx` et `src/app/not-found.tsx`** — **LES DEUX EXCEPTIONS DE TAILLE DE `<h1>`
DU DÉPÔT** (`text-xl font-semibold` au lieu de `text-2xl`, ligne 6 des deux fichiers ;
l'inventaire les signalait sans les localiser, la Task 2 les a nommées). Elles adoptent
`EnTetePage` **sans `retour`**, donc `text-titre` : **les deux anomalies de taille
disparaissent**. Même gabarit `main` centré `max-w-md`, même ton bref, une action de sortie
chacune.

**⚠️ LE MESSAGE DE `error.tsx` RESTE STATIQUE.** Il n'a jamais lu `error.message`, et
`comptes/ligne-compte.tsx` **repose sur ce fait** (D123, Task 20). Le rendre dynamique
changerait le comportement d'erreur de l'écran des comptes.

**⚠️ `not-found.tsx` POINTE VERS `/membres`, JAMAIS VERS `/tableau-de-bord`.** L'inventaire le
relève comme « incohérence mineure possible » avec le hub employé partout ailleurs.
**NE PAS LA CORRIGER** — ce serait changer une destination de navigation, pas une présentation
(piège n°4). **La signaler dans le rapport de tâche.**

**`notifications/cloche.tsx`** — **le SEUL composant commun à tout le projet**, monté par
`layout.tsx`. Composant **serveur**, qui n'affiche rien si aucun profil actif n'existe (il est
donc muet sur `/connexion` et `/inscription`). **Il n'y a aucune barre de navigation dans ce
projet** : cette cloche est le seul fragment global. **Ne pas en profiter pour en faire une
barre** — ce serait un écran de plus, que personne n'a demandé.

**`src/app/page.tsx`** (5 lignes) — ne fait que rediriger vers `/tableau-de-bord`. **Vérifier
qu'il n'y a rien à y faire, et l'écrire.** Un fichier « migré » qui n'avait rien à migrer est
une case cochée pour rien.

- [ ] **Étape 2 : `globals.css` — LE RAYON UNIQUE, ET LE RETRAIT DE LA PALETTE PAR DÉFAUT**

**C'est la dernière chose de la phase, et elle ne peut pas être faite plus tôt** : elle casse
tout écran non migré.

**2a. Décommenter les deux lignes du reset de rayon** (posées commentées à la Task 1) :

```css
  --radius-*: initial;
  --radius-bord: var(--rayon);
```

**Avant de décommenter**, vérifier qu'aucun écran n'emploie plus les rayons par défaut :

```bash
grep -rEn "rounded-(xs|sm|md|lg|xl|2xl|3xl|4xl)\b" src/ | wc -l
```

Attendu : **0**. S'il reste des occurrences, **les migrer d'abord** — elles sortiraient sans
aucun rayon, défaut **silencieux**.

`rounded-full` **survit** : ce n'est pas une valeur du namespace `--radius-*`, c'est une
utilité intégrée. Ses trois emplois légitimes sont la pastille d'`EtatBadge` et les deux
puces de `/membres/[id]`.

**2b. Retirer la palette Tailwind par défaut.** Dans `@theme inline`, avant les couleurs de la
direction :

```css
  /*
    ═══ D109 — LA DIRECTION VISUELLE COÛTE UN FICHIER, ET C'EST VÉRIFIABLE ═══

    `--color-*: initial` supprime du thème les 250 couleurs par défaut de Tailwind
    (`neutral`, `red`, `amber`, `green`, `white`, `black`, …). À partir d'ici, `text-red-600`
    ou `bg-neutral-900` ne produisent AUCUNE règle : un écran qui y reviendrait sortirait
    sans couleur, et cela se verrait.

    C'est ce qui fait de « aucun composant ne porte de valeur littérale » une PROPRIÉTÉ
    TENUE PAR L'OUTIL, et non une intention à surveiller en revue. Même mécanique que D111
    sur `defaultValue` et que le reset des points de rupture.

    ⚠️ POSÉ EN DERNIER, ET C'EST OBLIGATOIRE : il casse tout écran non migré. Le balayage de
    l'étape 2c doit rendre ZÉRO AVANT que cette ligne existe.
  */
  --color-*: initial;
```

**2c. Le balayage qui autorise ce retrait** — **contrôle positif d'abord** :

```bash
printf 'const a = "text-red-600"\nconst b = "bg-neutral-900"\n' > /tmp/temoin-palette.tsx
grep -rEn "\b(bg|text|border|divide|ring|fill|stroke|from|to|via)-(red|amber|green|blue|neutral|gray|slate|zinc|stone)-[0-9]{2,3}\b" /tmp/temoin-palette.tsx | wc -l
```

Attendu : **2**.

```bash
grep -rEn "\b(bg|text|border|divide|ring|fill|stroke|from|to|via)-(red|amber|green|blue|neutral|gray|slate|zinc|stone)-[0-9]{2,3}\b" src/ | wc -l
grep -rEn "\b(bg|text|border)-(white|black)\b" src/ | wc -l
```

Attendu : **0** et **0**.

**⚠️ SI CE BALAYAGE NE REND PAS ZÉRO, NE PAS POSER `--color-*: initial`.** Corriger d'abord
les occurrences restantes, **ou** consigner pourquoi elles subsistent et **ne pas poser le
reset**. Un reset posé sur un dépôt non balayé produit des écrans sans couleur, et le `build`
reste **vert** — c'est un défaut silencieux, le mode de défaillance que ce projet combat.

- [ ] **Étape 3 : PREUVE N°1 (D118) — aucun fichier sous `supabase/`**

```bash
git diff --stat main...HEAD -- supabase/
```

**SUR LA PLAGE `main...HEAD`, JAMAIS SUR L'ARBRE DE TRAVAIL.** Un `git diff --stat` sans plage
rend toujours zéro sur un arbre propre et **ne peut pas échouer** — défaut relevé en phase 5.

Attendu : **sortie vide**. **Contrôle positif** — vérifier que la commande sait détecter
quelque chose :

```bash
git diff --stat main...HEAD -- src/ | tail -1
```

Attendu : **une ligne de récapitulatif non vide**. Si elle est vide aussi, la plage est
mal formée et le premier zéro ne vaut rien.

- [ ] **Étape 4 : PREUVE N°2 (D109) — aucune couleur littérale sous `src/composants/`**

**Contrôle positif d'abord** (§7 l'exige explicitement : « la commande doit d'abord prouver
qu'elle sait en trouver une, sur un fichier témoin, avant que son zéro veuille dire quelque
chose ») :

```bash
printf 'const c = "#ABCDEF"\nconst d = "text-red-600"\n' > /tmp/temoin-couleur.tsx
grep -rEn "#[0-9a-fA-F]{3,8}|\b(bg|text|border|ring|divide)-(red|amber|green|blue|neutral|gray|slate|zinc|stone|white|black)(-[0-9]{2,3})?\b" /tmp/temoin-couleur.tsx | wc -l
```

Attendu : **2**.

```bash
grep -rEn "#[0-9a-fA-F]{3,8}|\b(bg|text|border|ring|divide)-(red|amber|green|blue|neutral|gray|slate|zinc|stone|white|black)(-[0-9]{2,3})?\b" src/composants/ | wc -l
```

Attendu : **0**.

- [ ] **Étape 5 : PREUVE N°3 (D111) — la compilation qui rougit, ET le zéro final**

**5a. Rejouer la preuve de la Task 3**, qui avait été supprimée après usage. Recréer
`src/composants/ui/preuve-defaultvalue.tsx` **à l'identique**, lancer `npx tsc --noEmit`,
constater le **rouge sur les six cas**, consigner la sortie verbatim, **puis supprimer le
fichier** et constater le **vert**.

**5b. Le décompte des `defaultValue` restants — ET SA PRÉCISION COMPTE.**

```bash
grep -rn "defaultValue\|defaultChecked" src --include="*.tsx"
```

**⚠️ CETTE COMMANDE COMPTE AUSSI LES COMMENTAIRES, ET C'EST UN PIÈGE MESURÉ.** Au 2026-08-16,
elle rendait **14 occurrences de `defaultValue`, dont QUATRE dans des commentaires** qui
disent « ne jamais revenir à `defaultValue` » (`inscription/formulaire-inscription.tsx:26`,
`membres/formulaire-membre.tsx:37`, `evenements/formulaire-evenement.tsx:63`,
`evenements/types/formulaire-type.tsx:13`). Un décompte brut les compterait comme des défauts,
exactement comme un premier passage de l'inventaire comptait un commentaire de
`formulaire-evenement.tsx` citant `<select name="typeId">` comme un vrai champ libre.

**Lire la sortie ligne à ligne.** Le relevé attendu à la fin de la phase :

| Occurrence | Nature | Verdict |
|---|---|---|
| `src/app/membres/page.tsx` ×2 | `<form method="get">` — filtre de l'annuaire | **légitime**, frontière déclarée Task 8 |
| `src/app/evenements/page.tsx` ×1 | `<form method="get">` — filtre des évènements | **légitime**, même frontière |
| les 4 mentions en commentaire | prose | **légitimes** |
| `src/app/comptes/ligne-compte.tsx` ×2 (`defaultChecked`) | cases à cocher dans un `<form onSubmit>` | **légitimes**, D123 et Task 3 |
| **tout le reste** | — | **DÉFAUT — 28 champs devaient être fermés** |

**Le compte des 28, tâche par tâche, est le tableau en tête du lot D.** Le vérifier ferme.

- [ ] **Étape 6 : PREUVE N°4 (D124) — zéro `window.confirm`, et le `Dialogue` prouvé**

```bash
printf 'if (!window.confirm("x")) return\n' > /tmp/temoin-confirm.ts
grep -rn "window.confirm" /tmp/temoin-confirm.ts | wc -l
grep -rn "window.confirm" src | wc -l
grep -rn "confirm(" src | wc -l
```

Attendu : **1**, **0**, **0**.

Les **trois comportements qui font la valeur du `Dialogue`** sont prouvés par
`tests/e2e/dialogue.spec.ts` (Task 15) : **focus piégé**, **`Échap` ferme sans rien
soumettre**, **focus restitué au déclencheur**. Vérifier que le fichier existe et que ses
tests passent :

```bash
npm run test:e2e -- tests/e2e/dialogue.spec.ts
```

- [ ] **Étape 7 : PREUVE N°5 (§5) — décompte des appelants de `Carte` et `EtatBadge`**

**C'est la preuve que la conception exige explicitement**, et sa raison est écrite :
« `Carte` et `EtatBadge` sont les deux seuls composants sans antécédent à extraire. Leur
risque n'est pas la divergence mais l'USAGE : un composant neuf que les écrans n'adoptent pas
uniformément recrée exactement le désordre que la phase corrige. »

```bash
grep -rln "<Carte" src/app --include="*.tsx" | wc -l
grep -rn "<Carte" src/app --include="*.tsx" | wc -l
grep -rln "<EtatBadge" src/app --include="*.tsx" | wc -l
grep -rn "<EtatBadge" src/app --include="*.tsx" | wc -l
```

**Il n'y a PAS de seuil à atteindre — il y a un décompte à ÉCRIRE, et à confronter aux motifs
d'origine :**

- **`Carte`** doit couvrir **au moins** les 8 `bg-amber-50` et les 2 `bg-green-50` mesurés par
  l'inventaire, soit **10 appelants au minimum**. **Moins de 10 signifie qu'un bandeau a été
  migré autrement**, et c'est le désordre qui recommence. **Les localiser.**
- **`EtatBadge`** n'a **aucun antécédent** (C4) : son décompte mesure **l'adoption**, pas la
  couverture. Les écrans qui affichent un état sont `/demandes` (Task 17), `/comptes` et
  `/tokens` (Task 20), `/membres/[id]` (Task 21), `/ael/seances` et `/ael/seances/[id]`
  (Task 23) — **six écrans**. **Un décompte inférieur à six signifie qu'un état est encore
  rendu en texte brut interpolé**, ce que D126 interdit. **Les localiser.**

**Écrire les quatre nombres dans le rapport de phase.** Un décompte qu'on ne compare à rien
n'est pas une preuve.

- [ ] **Étape 8 : PREUVE N°7 (D114) — focus visible partout, zéro `outline-none` sans remplacement**

```bash
grep -rn "outline-none\|outline: none\|outline-hidden" src/
```

Attendu : **zéro**, **sauf** dans `globals.css` s'il y figure comme partie d'un remplacement
explicite. Les deux occurrences d'origine
(`inscription/formulaire-inscription.tsx:230`, `membres/formulaire-membre.tsx:275`) ont été
**remplacées** par l'utilitaire `refus-focus`, jamais simplement retirées.

```bash
grep -c "focus-visible" src/app/globals.css
grep -c "refus-focus" src/app/globals.css
```

Attendu : **au moins 1** chacun.

**⚠️ VÉRIFICATION MANUELLE OBLIGATOIRE — aucun test automatisé du dépôt ne couvre le focus
visible.** Sur `/membres/nouveau`, **au clavier uniquement** :

1. `Tab` depuis le haut de la page → **chaque** élément interactif (lien de retour, champs,
   sélecteurs, boutons) porte un anneau **visible** ;
2. soumettre une création refusée → le focus atterrit sur le message, **et un contour en
   `--etat-refus` le montre** ;
3. répéter sur `/comptes` (densité compacte) → **les cibles font toujours 44 px**, et l'anneau
   est visible.

**C'est D113 et D114 ensemble, et c'est la seule chose qui rend l'application utilisable au
clavier.** Zéro classe de focus existait dans tout le dépôt avant cette phase.

- [ ] **Étape 9 : PREUVE N°8 (D122) — les deux barrières anti-cycle, chacune avec son test**

```bash
grep -n "basculeRefusee" src/lib/domaine/arbre-affichage.ts src/app/arborescence/arborescence.tsx
grep -n "noeudDeplie" src/lib/domaine/arbre-affichage.ts src/app/arborescence/noeud.tsx
grep -c "it(" src/lib/domaine/arbre-affichage.test.ts
npm test -- src/lib/domaine/arbre-affichage.test.ts
```

Attendu : chaque fonction **déclarée** et **appelée** ; au moins **10** cas ; **vert**.

**Rejouer la preuve par MUTATION de la Task 10** : amputer `noeudDeplie` de sa seconde
condition → **deux tests tombent**, dont celui d'invariant ; restaurer → **vert**. Consigner.

- [ ] **Étape 10 : PREUVE N°9 (D121) — les preuves de pagination n'ont pas bougé d'une ligne**

```bash
git diff main...HEAD --stat -- tests/
```

Attendu : **les 11 fichiers du harnais de la Task 15, et EUX SEULS**, plus les deux fichiers
créés (`tests/confirmation.ts`, `tests/e2e/dialogue.spec.ts`). **Aucun autre fichier de test
modifié.**

```bash
git diff main...HEAD -- tests/e2e/annuaire.spec.ts | grep -E "^[-+].*pagin" -i
```

Attendu : **zéro ligne** — le test de pagination de l'annuaire n'a **pas** été touché. C'est
ce qui établit que l'extraction de `bornerPage` est **à comportement identique**.

Vérifier de même que le bornage est bien extrait des **sept sites sur six fichiers** :

```bash
grep -rn "Math.ceil(total" src/app/ | wc -l
grep -rn "bornerPage" src/app/ | wc -l
```

Attendu : **0** et **7**.

- [ ] **Étape 11 : PREUVE N°6 (D119) — les 128 et les 10, sans modification**

```bash
grep -rhoE "^\s*test\(" tests/e2e --include="*.spec.ts" | grep -v dialogue | wc -l
grep -rhoE "^\s*test\(" tests/e2e-prod --include="*.spec.ts" | wc -l
```

Attendu : **128** et **10**.

**La seule exception de toute la phase est celle déclarée en C1**, appliquée à la Task 15 :
le remplacement du canal `page.once('dialog', …)` par un helper, **sans toucher une seule
assertion**. Elle est écrite dans le plan **avant** d'avoir été faite. **Toute autre
modification d'un fichier de test est un défaut.**

- [ ] **Étape 12 : les vérifications de cohérence du socle**

```bash
ls src/composants/ui/*.tsx | wc -l
```

Attendu : **12** — D110, douze composants et douze seulement.

```bash
grep -rn "className" src/composants/ui/index.ts
grep -rEn "className\?:" src/composants/ui/*.tsx | wc -l
```

Attendu : **zéro** et **zéro** — aucun composant n'expose de prop `className` (D109).

```bash
grep -rn "style={{" src/ | wc -l
```

Attendu : **0** — les deux `style={{ marginLeft }}` d'`arborescence.tsx` ont disparu à la
Task 10.

```bash
grep -rEn "\b(xl|2xl):" src/ --include="*.tsx" | wc -l
```

Attendu : **0** — D115, trois points de rupture réels, et les deux autres n'existent plus dans
le thème.

```bash
grep -rn "data-densite" src/app/ | wc -l
```

Attendu : **3** — `/comptes`, `/evenements/a-traiter`, `/demandes`, et **eux seuls** (D107).

```bash
ls tailwind.config.* 2>/dev/null | wc -l
```

Attendu : **0** — D108, aucun fichier de configuration JavaScript.

```bash
git diff main...HEAD --stat -- package.json package-lock.json
```

Attendu : **vide** — **aucune dépendance ajoutée** (§2 de la conception : « système de design
maison, aucune bibliothèque de composants, aucune dépendance ajoutée »).

- [ ] **Étape 13 : PREUVE DE D117 — aucun texte affiché modifié**

```bash
git diff main...HEAD -- src/ | grep -E "^[-+]" | grep -vE "^[-+]{3}" | grep -E "[A-Za-zÀ-ÿ]{4,}" | grep -vE "^[-+]\s*(//|/\*|\*)" | grep -viE "classname|import |const |function |return |export |type |interface " > /tmp/textes-changes.txt
wc -l /tmp/textes-changes.txt
```

**Ce fichier se lit LIGNE À LIGNE.** Chaque texte affiché retiré doit avoir son jumeau ajouté,
**à l'octet près**. La sortie sera longue — c'est une phase qui touche 70 fichiers sur 70 —
mais **c'est la seule preuve de D117 qui vaille**, et c'est la dernière occasion de l'obtenir.

**La SEULE déclaration de changement de texte de toute la phase** est celle de la Task 7 :
les libellés **`Confirmer`** et **`Annuler`** du `Dialogue`, qui remplacent les boutons du
navigateur et **n'ont aucun antécédent dans le dépôt**. Ils doivent apparaître dans ce fichier,
en `+` uniquement, sans `-` correspondant.

- [ ] **Étape 14 : les portes rapides, puis le commit**

```bash
npx tsc --noEmit && npm run lint && npm test && npm run test:rls
```

```bash
git add src/app/ src/app/globals.css
git commit -m "refactor(ui): les sept derniers ecrans, le rayon unique et le retrait de la palette par defaut" -m "--color-*: initial et --radius-*: initial ferment la phase. A partir d'ici, text-red-600 ou rounded-md ne produisent AUCUNE regle : la propriete « la direction visuelle coute un fichier » (D109) est tenue par l'outil, plus par la vigilance de revue. Meme mecanique que D111 sur defaultValue." -m "Les deux exceptions de taille de <h1> du depot (error.tsx:6 et not-found.tsx:6, text-xl au lieu de text-2xl) disparaissent avec EnTetePage." -m "not-found.tsx continue de pointer vers /membres et non vers /tableau-de-bord : c'est une incoherence relevee par l'inventaire, mais la corriger serait changer une destination de navigation, pas une presentation. Signalee, pas corrigee." -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Étape 15 : PORTE DE FIN DE LOT D — ET DE LA PHASE**

⚠️ **LE DÉLAI D'EXÉCUTION PLAFONNE À 600 000 ms, ET UNE DEMANDE SUPÉRIEURE EST IGNORÉE, PAS
REFUSÉE.** La suite e2e complète (**88 fichiers-tests sérialisés**, `workers: 1`, environ
**7,5 minutes**) a déjà été **tuée en cours** pour cette raison, et l'échec a été lu comme un
échec de test. **Lancer en lots.**

```bash
npm run build
```

```bash
npm run test:e2e -- tests/e2e/annuaire.spec.ts tests/e2e/arbre.spec.ts tests/e2e/arborescence.spec.ts tests/e2e/autorite.spec.ts tests/e2e/dialogue.spec.ts
```

```bash
npm run test:e2e -- tests/e2e/ael-pointage.spec.ts tests/e2e/ael-preuves.spec.ts tests/e2e/ael-seance-detail.spec.ts
```

```bash
npm run test:e2e -- tests/e2e/demandes.spec.ts tests/e2e/evenements.spec.ts tests/e2e/evenements-detail.spec.ts tests/e2e/evenements-liste.spec.ts tests/e2e/evenements-types.spec.ts
```

```bash
npm run test:e2e -- tests/e2e/antennes-membres.spec.ts tests/e2e/archivage-compte.spec.ts tests/e2e/connexion.spec.ts tests/e2e/creation-enrichie.spec.ts tests/e2e/inscription.spec.ts tests/e2e/notifications.spec.ts tests/e2e/statuts.spec.ts tests/e2e/tokens.spec.ts
```

```bash
npm run test:e2e:prod
```

**Attendu : 132 tests e2e verts (128 inchangés + 4 neufs), 10 preuves de production vertes.**

**⚠️ SI UNE PREUVE ROUGIT, C'EST UN SIGNAL, PAS UN TEST À AJUSTER (D119).** C'est le piège le
plus probable de cette phase, parce que le geste est petit et paraît raisonnable sur le
moment. **Établir quel commit l'a cassée par un rejeu en isolation** (`git checkout <commit>`
puis rejeu de la seule suite en cause), et le consigner. Ne jamais « corriger au jugé » une
suite rouge dont on n'a pas identifié le commit fautif : c'est ainsi qu'on empile deux
défauts.

---

## Récapitulatif des neuf preuves du §7, et de la tâche qui les rend

| # | Preuve | Rendue par |
|---|---|---|
| 1 | Aucun fichier sous `supabase/` dans le `--stat` de la **plage** | Task 24, étape 3 |
| 2 | Aucune couleur littérale sous `src/composants/`, **avec contrôle positif** | Tasks 2, 4, 5, 7 (à chaque commit) ; Task 24, étape 4 |
| 3 | `defaultValue` refusé **à la compilation**, prouvé par un cas qui **doit** rougir | Task 3, étapes 4-6 ; Task 24, étape 5 |
| 4 | Zéro `window.confirm`, et le `Dialogue` prouvé sur ses trois comportements | Task 14, étape 4 ; Task 15, étape 5 ; Task 24, étape 6 |
| 5 | Décompte des appelants de `Carte` et `EtatBadge` | Task 24, étape 7 |
| 6 | Les 128 e2e et les 10 preuves de production, **sans modification** | Task 24, étape 11 (exception unique déclarée en C1, Task 15) |
| 7 | Focus visible sur chaque composant interactif, zéro `outline-none` sans remplacement | Task 1 (couche de base) ; Task 4 (`refus-focus`) ; Task 24, étape 8 |
| 8 | Les **deux** barrières anti-cycle survivent, chacune avec son test | Task 10, étapes 1-3 ; Task 24, étape 9 |
| 9 | Les preuves de pagination ne bougent pas d'une ligne | Task 6 ; Task 24, étape 10 |

---

## Ce que la phase NE livre PAS, et pourquoi (§9)

- **Aucun thème sombre** (D116). Le bloc `prefers-color-scheme: dark` hérité de
  `create-next-app` est **retiré** (Task 1, C3) : il était actif en production et déjà cassé.
  La structure en deux niveaux (`:root` + `@theme inline`) rend un thème sombre futur
  réalisable par un unique bloc `:root[data-theme="sombre"]`, **sans toucher un composant**.
- **Aucune préférence de densité utilisateur** (D107). Trois écrans, un attribut, zéro
  stockage, zéro synchronisation entre onglets, zéro axe de test supplémentaire.
- **Aucune icône.** Le dépôt n'en contient aucune (`grep -rl '<svg' src` → liste vide), ce qui
  lui épargne la question du nom accessible des boutons à icône. En introduire ouvrirait ce
  dossier pour un gain esthétique.
- **Aucune animation**, hors les transitions d'état des composants interactifs, effacées sous
  `prefers-reduced-motion` (Task 1).
- **Aucune correction de `comptes/ligne-compte.tsx`** (D123, Task 20).
- **Aucun changement de texte affiché non déclaré** (D117). **Une seule déclaration dans tout
  le plan** : `Confirmer` et `Annuler`, les deux boutons du `Dialogue`, sans antécédent dans le
  dépôt (Task 7).
- **Aucun composant à un seul appelant** : pas de fil d'Ariane (un écran), pas de composant
  de message de succès (deux occurrences, absorbées par `Carte ton="succes"`), pas de composant
  d'état vide (une convention de texte, pas un motif visuel), pas de composant
  « catalogue basculable » (quatre appelants divergents, Task 16), pas de `ListeDefinition`
  (trois appelants déjà identiques, Task 19).
- **Aucune dépendance ajoutée.** Vérifié par `git diff --stat main...HEAD -- package.json`.

---

## Ce que ce plan a trouvé et que la conception ne dit pas

À relayer en revue, et à porter dans le rapport de phase :

1. **D119 et D124 sont incompatibles tels qu'écrits** (C1). 22 gestionnaires de dialogue sur
   11 fichiers de test, dont 1 des 10 preuves de production. Exception déclarée, bornée à la
   Task 15, aucune assertion touchée.
2. **Le dépôt charge deux polices Google** et les écrase aussitôt (C2). §4.2 les croyait
   absentes.
3. **Un mode sombre hérité est actif en production, et cassé** (C3). D116 devient un retrait,
   pas une abstention.
4. **D126 nomme cinq états dont trois n'existent pas** comme états, et les deux « pastilles »
   qu'elle attribue à `EtatBadge` sont des puces sans couleur (C4). Le code porte **quatre**
   vocabulaires d'état distincts, plus deux dérivés, et les statuts sont des **données**.
5. **Les quinze `window.confirm` sont de deux familles, pas d'une** (C5), et l'une porte un
   défaut réel : `evenement.currentTarget` nullifié après le premier `await`
   (`comptes/ligne-compte.tsx:89` et `:114`).
6. **La duplication de bornage de pagination est de SEPT sites sur six fichiers** :
   `demandes/page.tsx` en porte deux, et c'est le seul écran à double pagination du dépôt.
7. **L'inventaire du vocabulaire situe le bouton « danger » bordé à
   `comptes/ligne-compte.tsx:254`. C'est faux** : cette ligne porte une bordure neutre. Le seul
   `border-red-300` du dépôt est `demandes/ligne-demande-admin.tsx:186`.
8. **Les deux `<h1>` en `text-xl`** que l'inventaire signale sans les localiser sont
   `src/app/error.tsx:6` et `src/app/not-found.tsx:6`.
9. **Le rythme de 4 px existe déjà** : `--spacing: 0.25rem` est le défaut de Tailwind 4. Il
   n'est pas à instaurer, il est à **nommer** pour que D107 ait six jetons à remapper.
10. **Deux formulaires GET (`membres/page.tsx:88`, `evenements/page.tsx:62`) ne peuvent PAS
    passer par `Champ`/`Selecteur`** sans transformer deux pages serveur en pages clientes et
    sans créer deux libellés visibles nouveaux. Frontière déclarée, et il n'y en a que deux.
11. **`grep defaultValue` compte quatre commentaires** qui disent « ne jamais revenir à
    `defaultValue` ». Un décompte brut les prendrait pour des défauts — même piège qu'un
    premier passage de l'inventaire.
