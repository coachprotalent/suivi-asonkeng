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
| `npm run test:e2e` | Parcours de bout en bout (Playwright) |
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
> arrêter un code fautif : lancez les six suites localement avant de pousser.

## Attention

Un **seul** projet Supabase sert au développement et à la production. Les migrations sont
strictement additives. **Ne jamais exécuter `supabase db reset`.**

L'amorçage des antennes dans `20260812110000_antennes.sql` n'est **pas idempotent** : il insère
Batouri, Cameroun et France sans vérifier leur présence. Une restauration depuis zéro échouera sur
la contrainte d'unicité (`antennes_nom_key`) si ces antennes existent déjà.

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
- **Motif facultatif au retrait** — un administrateur peut retirer un statut sans en préciser la
  raison ; s'il en donne une, elle est journalisée avec le mouvement.
- **Catalogue administrable** — un administrateur crée des groupes et des statuts, désactive un
  statut existant (il disparaît du formulaire d'attribution sans effacer les attributions déjà
  posées) et le réactive depuis le même écran.

### Règle de sécurité

Toute page et toute Server Action de l'application passent par `exigerProfilActif` ou
`exigerAdministrateur` (`src/lib/securite/garde.ts`) — c'est l'unique point d'entrée qui vérifie
la session et, le cas échéant, le rôle ; aucun appel direct à `profilCourant` n'existe ailleurs
dans le code de l'application. Aucune écriture n'est possible depuis le navigateur : les
créations, modifications, archivages, bascules d'antenne, attributions et retraits de statuts
passent exclusivement par des Server Actions exécutées côté serveur, jamais par un appel direct
du client à Supabase. Côté base, les politiques RLS n'autorisent que des `SELECT` sur toutes les
tables : toute écriture transite par le serveur, qui agit avec la clé de service, jamais exposée
au navigateur.
