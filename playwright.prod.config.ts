import { defineConfig } from '@playwright/test'

/**
 * Second projet Playwright, DISTINCT de `playwright.config.ts` (qui sert
 * `npm run dev`) — exigé par la revue de la Task 17 : « la suite e2e tourne
 * contre `npm run dev`, et aucun test de ce projet ne s'exécute contre un
 * build de production. Cette classe entière de défauts lui est invisible. »
 *
 * Constat établi empiriquement : une exception LEVÉE depuis une Server Action
 * perd son message avant même d'atteindre le `catch` du composant client — en
 * production seulement. `npm run dev` ne peut PAS le détecter, quel que soit
 * le soin mis à écrire le test : le mécanisme n'existe qu'au moment où React
 * minifie ses erreurs, ce qui n'arrive jamais en développement.
 *
 * Port DÉDIÉ (3100), distinct de celui de `playwright.config.ts` (3000) :
 * les deux suites peuvent tourner en parallèle sans se marcher dessus (voir
 * l'avertissement du rapport de vérification de la Task 17 — un agent
 * exécutait la suite de développement sur le port 3000 pendant que cette
 * vérification tournait sur le 3100).
 */
export default defineConfig({
  testDir: './tests/e2e-prod',
  timeout: 30_000,
  workers: 1,
  use: { baseURL: 'http://localhost:3100' },
  webServer: {
    // `npm run build` avant `next start` : ce projet doit toujours tester le
    // code source ACTUEL, jamais un `.next/` périmé laissé par une exécution
    // précédente.
    command: 'npm run build && npm run start -- -p 3100',
    url: 'http://localhost:3100/connexion',
    reuseExistingServer: false,
    timeout: 300_000,
  },
})
