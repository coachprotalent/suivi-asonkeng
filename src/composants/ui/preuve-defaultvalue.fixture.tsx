/*
  ═══ FIXTURE PERMANENT — D111, LA BARRIÈRE `defaultValue`/`defaultChecked` NE DOIT
  JAMAIS TOMBER SANS QUE `tsc` LE VOIE ═══

  Ajouté par constat Important de la revue des Tasks 3/4 (`task-3-4-review.md`) : la
  preuve par mutation de la Task 3 a établi que `Omit` SEUL NE FERME PAS l'étalement de
  props — retirer `defaultValue?: never` de `champ.tsx` fait tomber le décompte d'erreurs
  de six à cinq. Mais le fichier qui portait cette preuve
  (`preuve-defaultvalue.tsx`) a été supprimé après usage, sur instruction du brief
  lui-même (Task 3, étape 6, « obligatoire »). Rien n'empêchait alors un futur commit de
  retirer `defaultValue?: never` en le jugeant redondant avec `Omit`, sans qu'AUCUNE porte
  automatique ne rougisse : aucun des 28 champs consommateurs réels ne fait organiquement
  un étalement de props portant `defaultValue`.

  CE FICHIER-CI N'EST PAS SUPPRIMÉ. Chaque cas est annoté `@ts-expect-error` : TypeScript
  exige alors que la ligne suivante produise RÉELLEMENT une erreur, et signale
  « Unused '@ts-expect-error' directive » si elle n'en produit plus. Le fichier compile
  donc INDÉFINIMENT tant que la barrière tient, et `tsc --noEmit` — déjà une porte de
  chaque commit — rougit tout seul dès qu'elle tombe. Aucune étape manuelle, aucun fichier
  à recréer.

  Le cas n°2 (étalement) est celui qui compte : c'est le SEUL des six que `Omit` seul ne
  ferme pas, et c'est précisément celui que la mutation de la Task 3 a vu tomber. Les
  cinq autres (littéraux JSX, `defaultChecked`, `value` omis) sont déjà fermés par `Omit`
  seul ou par le caractère obligatoire de `value` — ils sont conservés pour ne pas
  rétrécir la couverture d'origine, mais le n°2 est celui qui, seul, justifie ce fichier.

  Vérifié par mutation le 2026-08-16 (voir le rapport de tâche pour les deux sorties
  verbatim) : retirer `defaultValue?: never` de `champ.tsx` fait rougir CE FICHIER sur le
  cas n°2 (« Unused '@ts-expect-error' directive »), la ligne exacte que la mutation de
  la Task 3 avait identifiée. La ligne restaurée, le fichier redevient vert.

  ═══ CAS N°7, AJOUTÉ APRÈS LA REVUE DES TASKS 10/11 — L'ÉTALEMENT SUR `Selecteur` N'AVAIT
  PAS SON CAS ═══

  Le type de `Selecteur` a été RÉÉCRIT à la Task 11 pour accepter les groupes
  (`GroupeSelecteur`, options mutuellement exclusives avec `groupes`). Cette réécriture est
  exactement le genre de changement qui peut faire tomber `defaultValue?: never` sans que
  personne ne le remarque — la barrière qu'on vient de toucher est celle qui compte le
  plus. Le cas n°7 couvre l'étalement sur `Selecteur`, symétrique du cas n°2 sur `Champ`.

  Vérifié par mutation le 2026-08-16 (même méthode que le cas n°2, voir le rapport de
  tâche pour les deux sorties verbatim) : retirer `defaultValue?: never` de
  `selecteur.tsx` fait rougir CE FICHIER sur le cas n°7 (« Unused '@ts-expect-error'
  directive »). La ligne restaurée, le fichier redevient vert.
*/
import { Champ } from './champ'
import { Selecteur } from './selecteur'
import { ZoneTexte } from './zone-texte'

const proprietesEtalees = { defaultValue: 'valeur passee par etalement' }

export function CasQuiDoiventRougir() {
  return (
    <>
      {/* 1. littéral JSX sur Champ — déjà fermé par Omit seul. */}
      {/* @ts-expect-error D111 — defaultValue est retiré du type de base par Omit sur Champ. */}
      <Champ label="A" value="" onChange={() => {}} defaultValue="x" />

      {/*
        2. ÉTALEMENT sur Champ — LE CAS CENTRAL. Le contrôle des propriétés excédentaires
        de TypeScript ne s'applique PAS à un étalement : sans `defaultValue?: never` dans
        le type de `Champ`, cette ligne compilerait malgré le `Omit`. C'est la ligne que la
        preuve par mutation de la Task 3 a vue tomber (décompte 6 -> 5).
      */}
      {/* @ts-expect-error D111 — sans defaultValue?: never, cet étalement échapperait à Omit et compilerait. */}
      <Champ label="B" value="" onChange={() => {}} {...proprietesEtalees} />

      {/* 3. defaultChecked sur Champ — déjà fermé par Omit seul. */}
      {/* @ts-expect-error D111 — defaultChecked est retiré du type de base par Omit sur Champ. */}
      <Champ label="C" value="" onChange={() => {}} defaultChecked />

      {/* 4. littéral JSX sur Selecteur — déjà fermé par Omit seul. */}
      {/* @ts-expect-error D111 — defaultValue est retiré du type de base par Omit sur Selecteur. */}
      <Selecteur label="D" value="" onChange={() => {}} options={[]} defaultValue="x" />

      {/* 5. littéral JSX sur ZoneTexte — déjà fermé par Omit seul. */}
      {/* @ts-expect-error D111 — defaultValue est retiré du type de base par Omit sur ZoneTexte. */}
      <ZoneTexte label="E" value="" onChange={() => {}} defaultValue="x" />

      {/* 6. `value` OMIS — un champ sans valeur est non contrôlé par un autre chemin. */}
      {/* @ts-expect-error D111 — value est obligatoire sur Champ ; l'omettre doit rougir. */}
      <Champ label="F" onChange={() => {}} />

      {/*
        7. ÉTALEMENT sur Selecteur — symétrique du cas 2, sur le type réécrit à la Task 11
        pour les groupes (`options`/`groupes` mutuellement exclusifs). Sans
        `defaultValue?: never` dans `ProprietesSelecteurBase`, cette ligne compilerait
        malgré le `Omit`.
      */}
      {/* @ts-expect-error D111 — sans defaultValue?: never, cet étalement échapperait à Omit et compilerait sur Selecteur. */}
      <Selecteur label="G" value="" onChange={() => {}} options={[]} {...proprietesEtalees} />
    </>
  )
}
