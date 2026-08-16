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
