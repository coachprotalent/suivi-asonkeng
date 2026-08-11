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

## Attention

Un **seul** projet Supabase sert au développement et à la production. Les migrations sont
strictement additives. **Ne jamais exécuter `supabase db reset`.**
