import { expect, type Page } from '@playwright/test'

/**
 * ═══ LE HARNAIS DE CONFIRMATION, APRÈS LE PASSAGE AU `<dialog>` NATIF (phase 6, D124) ═══
 *
 * AVANT, les quinze confirmations passaient par `window.confirm()`, et Playwright REJETAIT
 * automatiquement toute boîte native non gérée — d'où les gestionnaires
 * `page.once('dialog', …)` répartis sur onze fichiers de test. Ces gestionnaires ne se
 * déclenchent QUE pour les boîtes natives : après la refonte, ils deviennent INERTES. Ils ne
 * cassent pas bruyamment ; les clics qu'ils débloquaient restent bloqués derrière un
 * `<dialog>` que personne ne confirme, et les tests échouent en TIMEOUT, loin de la cause.
 *
 * ⚠️ CE FICHIER EST L'UNIQUE EXCEPTION À D119 DE LA PHASE 6, DÉCLARÉE AVANT D'ÊTRE ÉCRITE
 * (plan, Task 15). Il change le CANAL, jamais la PREUVE : aucune assertion des suites
 * existantes n'est touchée, et le texte rendu par le dialogue est celui-là même que
 * `dialogue.message()` rendait — les messages n'ont pas bougé d'un octet.
 *
 * ═══ POURQUOI L'APPEL SE FAIT APRÈS LE CLIC, ET NON AVANT ═══
 *
 * `page.once('dialog', …)` s'enregistrait AVANT le clic, parce qu'une boîte native est
 * synchrone et qu'il n'y avait pas d'autre moment. Un `<dialog>` est un ÉLÉMENT DU DOM : il
 * n'existe qu'après le clic, et on l'attend comme n'importe quel élément. La substitution
 * est donc : SUPPRIMER la ligne `page.once(…)` avant le clic, AJOUTER un `await` après.
 *
 * ═══ PLACÉ À LA RACINE DE `tests/`, ET NON SOUS `tests/e2e/` ═══
 *
 * Il est POSITIONNÉ pour servir les deux projets Playwright — `testDir` ne restreint que la
 * découverte des fichiers de test, jamais les imports —, mais un seul fichier l'importe à ce
 * jour : `tests/e2e/dialogue.spec.ts`. Ce commentaire affirmait qu'il servait « dans les DEUX
 * projets, dont `tests/e2e-prod/refus-evenements-production.spec.ts` » ; c'était faux, et
 * c'est corrigé à la revue finale de branche. Cinq suites gardent par ailleurs leur propre
 * copie locale d'`accepterDialogue` (`ael-seance-detail`, `arbre`, `archivage-compte`,
 * `demandes`, `tokens`) : l'adoption reste à faire, et elle est hors du périmètre de la
 * phase 6.
 */

/** Le dialogue de confirmation ouvert. `<dialog>` a le rôle ARIA `dialog` implicite. */
function dialogue(page: Page) {
  return page.getByRole('dialog')
}

/**
 * Attend le dialogue, RETOURNE SON MESSAGE, et clique « Confirmer ».
 *
 * Le message est rendu même quand l'appelant l'ignore : c'est ce qui permet aux tests qui
 * l'assertaient déjà de garder leurs `expect(...).toContain(...)` inchangés.
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
