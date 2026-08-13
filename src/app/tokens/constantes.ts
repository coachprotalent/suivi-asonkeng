/**
 * Séparée de `actions.ts` (contrainte de ce Next.js : un fichier `'use server'` ne
 * peut exporter que des fonctions async — voir AGENTS.md, « This is NOT the
 * Next.js you know ». `actions.ts` et `formulaire-generation.tsx` ('use client')
 * importent tous deux cette constante ; elle ne peut donc pas non plus vivre dans
 * `src/lib/domaine/token-inscription.ts`, qui importe `node:crypto` et échouerait
 * bruyamment à la compilation d'un bundle navigateur (voir son en-tête).
 */

/** D37 : proposée par défaut, modifiable par l'administrateur avant génération. */
export const VALIDITE_JOURS_DEFAUT = 7
