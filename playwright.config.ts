import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  // Les suites partagent un unique serveur de développement Next et une unique
  // base Supabase, laquelle sert aussi de production (décision du projet).
  // Sous le parallélisme par défaut, cette absence d'isolement a produit des
  // échecs à symptômes variables (page introuvable, ou échec d'assertion sur
  // l'URL après enregistrement), non reproductibles en isolation, ainsi que
  // des nettoyages de données de test manqués. Le coût est réel et assumé :
  // la suite passe d'environ 1 min 15 à environ 2 min 15. Ce n'est pas un
  // contournement d'un défaut applicatif : le code n'est pas en cause,
  // l'isolement des suites l'est.
  workers: 1,
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
