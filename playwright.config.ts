import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  use: { baseURL: 'http://localhost:3000' },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000/connexion',
    // Réutiliser un serveur déjà lancé fait courir le risque de tester du code
    // périmé, laissé par une session précédente. On l'accepte en local, où c'est
    // un confort, jamais en intégration continue.
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
