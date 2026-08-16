/*
  ═══ D126 — PASTILLE **ET** LIBELLÉ, JAMAIS L'UN SANS L'AUTRE ═══

  La direction « Filiation » ne colore PAS le fond de l'étiquette. La couleur reste donc un
  SECOND CANAL, jamais le seul : la pastille aide au repérage, le libellé porte le sens.
  Une couleur seule serait invisible à qui ne la distingue pas ; un libellé seul perdrait le
  bénéfice de repérage qui a justifié la densité compacte de D107.

  `libelle` est OBLIGATOIRE et `aria-hidden` est posé sur la pastille : le nom accessible du
  badge est exactement son libellé, sans « pastille verte » parasite.

  ═══ POURQUOI UN TON, ET NON UNE UNION DE LIBELLÉS (RECTIFICATION DE D126) ═══

  D126 nomme cinq états — Repenti, Baptisé, Affermi, En attente, Archivé — dont TROIS ne
  sont pas des états dans le code : `Repenti` et `Baptisé d'eau` sont des LIGNES DE
  CATALOGUE en base (20260813100000_statuts.sql:60-66), qu'un administrateur ajoute et
  désactive depuis `/statuts`, et `Affermi` n'existe NULLE PART dans le dépôt. Le code porte
  en réalité QUATRE vocabulaires d'état distincts, plus deux dérivés :

    EtatMembre               en_attente | actif | archive      src/lib/domaine/membre.ts:2
    DemandeListe['etat']     en_attente | validee | rejetee | annulee
                                                              src/lib/donnees/demandes.ts:50
    EtatSeanceAel            prevue | tenue | annulee          src/lib/domaine/ael.ts:4
    compte                   actif (booleen)                   comptes/ligne-compte.tsx:144
    token                    valide | expire | revoque | utilise  tokens/ligne-token.tsx:7-12
    statuts                  DONNEES, libelles libres

  Une union fermée de cinq libellés serait donc FAUSSE à l'écriture, et fausse à nouveau à
  la première ligne ajoutée au catalogue. La correspondance état -> ton est déclarée PAR
  ÉCRAN, à côté du `Record` de libellés qui y existe déjà (`LIBELLE_ETAT`, `LIBELLE_ORIGINE`,
  `LIBELLE_SITUATION`, `LIBELLE_ROLE`) — c'est-à-dire là où le vocabulaire vit vraiment.
*/
export type TonEtat = 'acquis' | 'attente' | 'refus' | 'neutre'

/*
  Constantes littérales, jamais construites : Tailwind balaye le source à la recherche de
  noms de classe complets, et `bg-etat-${ton}` ne produirait aucune règle. La pastille
  sortirait alors transparente — un défaut silencieux, qui ne casse rien et n'affiche rien.
*/
const CLASSES_PASTILLE: Record<TonEtat, string> = {
  acquis: 'bg-etat-acquis',
  attente: 'bg-etat-attente',
  refus: 'bg-etat-refus',
  neutre: 'bg-etat-neutre',
}

export type ProprietesEtatBadge = { ton: TonEtat; libelle: string }

export function EtatBadge({ ton, libelle }: ProprietesEtatBadge) {
  return (
    <span className="inline-flex items-center gap-esp-2 text-petit text-encre">
      <span
        aria-hidden="true"
        /*
          `size-pastille` et NON `size-esp-2` : la densite compacte (D107) remappe les six
          jetons d'espacement, et la pastille RETRECIRAIT sur les trois ecrans denses —
          c'est-a-dire la ou le reperage par la couleur a justifie la densite.
        */
        className={`inline-block size-pastille shrink-0 rounded-full ${CLASSES_PASTILLE[ton]}`}
      />
      {libelle}
    </span>
  )
}
