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

Le déploiement automatique sur `git push` **n'est pas actif** : la liaison entre GitHub et Vercel
n'a pas pu être établie. Seul `npx vercel --prod` déploie.

## Attention

Un **seul** projet Supabase sert au développement et à la production. Les migrations sont
strictement additives. **Ne jamais exécuter `supabase db reset`.**

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

### Règle de sécurité

Toute page et toute Server Action de l'application passent par `exigerProfilActif` ou
`exigerAdministrateur` (`src/lib/securite/garde.ts`) — c'est l'unique point d'entrée qui vérifie
la session et, le cas échéant, le rôle. Aucune écriture n'est possible depuis le navigateur : les
créations, modifications, archivages et bascules d'antenne passent exclusivement par des Server
Actions exécutées côté serveur, jamais par un appel direct du client à Supabase. Côté base, les
politiques RLS n'autorisent que des `SELECT` : toute écriture transite par le serveur, qui agit
avec la clé de service, jamais exposée au navigateur.
