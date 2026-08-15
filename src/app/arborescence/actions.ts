'use server'

import { cheminAvecLibelles, type MaillonNomme } from '@/lib/domaine/arbre'
import {
  ancetresDeMembre,
  disciplesPage,
  nomsMaillonsChemin,
  pageDuDisciple,
} from '@/lib/donnees/arbre'
import { TAILLE_PAGE_DISCIPLES } from '@/lib/donnees/arbre-lots'
import { exigerProfilActif } from '@/lib/securite/garde'

/**
 * ═══ AUCUNE ÉCRITURE DANS CE FICHIER (D92). ═══
 * La phase 5, volet 2, n'ajoute aucune Server Action d'écriture, aucune passerelle, aucun
 * marqueur, aucune politique, aucun déclencheur. Un écran d'arbre qui rattacherait serait
 * le QUATRIÈME chemin d'écriture vers `faiseur_de_disciple_id`, sur un écran où l'on
 * navigue vite et où l'on clique par erreur. Les rattachements restent sur
 * `/membres/[id]/arbre`, où la portée d'autorité, le verrou consultatif et le garde-fou
 * anti-cycle sont déjà éprouvés.
 *
 * Ce vide est une ASSERTION À VÉRIFIER, pas un constat : `tests/rls/arborescence.test.ts`
 * balaye ce dossier à la recherche de tout `insert`, `update`, `delete`, `rpc` d'écriture
 * ou `clientAdmin()`.
 */

export type DiscipleLigne = { id: string; nom: string; prenom: string }

export type PageDisciples = {
  disciples: DiscipleLigne[]
  total: number
  page: number
  pages: number
}

/**
 * Les disciples actifs d'un nœud, une page à la fois (D94, D101).
 *
 * ═══ LE GARDE EST LA PREMIÈRE INSTRUCTION (D103) ═══
 * Toute fonction exportée d'un fichier `'use server'` est appelable depuis le navigateur,
 * Y COMPRIS quand elle ne fait que LIRE. Précédent exact et commenté :
 * `src/app/membres/recherche-action.ts` (1c). D2 ouvre l'annuaire à tout compte actif —
 * pas aux visiteurs.
 *
 * ═══ AUCUN INDICATEUR « CE NŒUD A DES DISCIPLES » N'EST CALCULÉ D'AVANCE (D101) ═══
 * Un indicateur par enfant, c'est UNE REQUÊTE PAR ENFANT — N+1 sur chaque page dépliée —
 * et PostgREST ne sait pas agréger. L'alternative serait une vue d'agrégation : un objet
 * permanent en base, avec sa RLS à écrire et à prouver, POUR UN CHEVRON. On préfère un
 * aller-retour de trop, à la demande de l'utilisateur, à N requêtes systématiques que
 * personne n'a demandées. Tout membre actif est donc dépliable, et déplier une feuille
 * affiche « Aucun disciple actif rattaché. »
 *
 * `pages` vaut TOUJOURS au moins 1, même sur un nœud sans disciple : l'appelant s'en sert
 * pour borner sa navigation, et un `0` y produirait des comparaisons fausses.
 */
export async function chargerDisciples(membreId: string, page: number): Promise<PageDisciples> {
  await exigerProfilActif()

  const pageDemandee = Number.isInteger(page) && page > 0 ? page : 1
  // `disciplesPage` LÈVE sur un échec de lecture, et ne rend jamais `[]` : un échec ne doit
  // pas être indistinguable d'un nœud sans disciple. L'exception remonte ici telle quelle,
  // et le composant client l'attrape pour afficher un message STATIQUE.
  const { lignes, total } = await disciplesPage(membreId, pageDemandee)

  return {
    disciples: lignes,
    total,
    page: pageDemandee,
    pages: Math.max(1, Math.ceil(total / TAILLE_PAGE_DISCIPLES)),
  }
}

/**
 * Le chemin d'une personne, de la RACINE jusqu'à elle, prêt à afficher (D97, D98).
 *
 * ═══ DEUX LECTURES, DEUX RÉGIMES, ET C'EST LE POINT LE PLUS DÉLICAT DE L'ÉCRAN ═══
 *
 * | Étape | Lecture | Sous RLS ? | Filtre d'état ? |
 * |---|---|---|---|
 * | la FORME du chemin | `public.ancetres_membre`, `security definer` | NON (D19) | aucun |
 * | les NOMS | `nomsMaillonsChemin` via `clientServeur()` | OUI | `etat = 'actif'`, EXPLICITE |
 * | l'AFFICHAGE de chaque maillon | `libelleFiche` (D100) | — | — |
 *
 * AUCUN NOM LU AFFRANCHI DE LA RLS N'ATTEINT JAMAIS L'ÉCRAN : la lecture affranchie ne
 * rend que des IDENTIFIANTS, et les noms sont relus sous RLS, comme partout ailleurs. Un
 * maillon que l'appelant ne peut pas lire devient « Fiche non consultable », À SA PLACE
 * dans le chemin, jamais effacé ni sauté — l'effacer ferait mentir l'écran sur la
 * profondeur et pourrait détacher toute la descendance.
 *
 * ═══ LE FILTRE `etat = 'actif'` EST EXPLICITE ICI AUSSI, ET POUR TOUS LES RÔLES (D93) ═══
 *
 * `nomsMaillonsChemin` porte un `.eq('etat', 'actif')` ÉCRIT. Ce n'est pas une précaution
 * décorative : la politique `membres_lecture` délègue à `prive.peut_lire_membre`, qui
 * ouvre TOUTE fiche à l'administrateur. Nommer les maillons par une lecture sans filtre
 * d'état produirait donc DEUX ARBRES : l'administrateur lirait le nom d'un maillon
 * archivé ou en attente, là où un compte ordinaire lit « Fiche non consultable » — et
 * l'écran, qui annonce que seuls les membres actifs y figurent, mentirait à l'un des deux.
 * Un filtre explicite est une RÈGLE ÉNONCÉE ; un trou creusé par la RLS est un MENSONGE.
 * NE JAMAIS remplacer cet appel par une lecture sans filtre d'état pour « simplifier ».
 *
 * ═══ L'INVARIANT QUE TROIS DÉCLENCHEURS TIENNENT, ET CE QU'IL COUVRE EXACTEMENT (D99) ═══
 *
 *   AUCUN MEMBRE `actif` N'A D'ANCÊTRE QUI NE SOIT PAS `actif`.
 *
 * `public.etat_membre` a TROIS valeurs — `en_attente`, `actif`, `archive` — et l'énoncé
 * porte bien sur les trois : l'arborescence exclut `en_attente` EXACTEMENT comme
 * `archive`, et un maillon `en_attente` rendrait toute sa descendance active
 * INATTEIGNABLE depuis la liste des racines. Trois barrières le tiennent, chacune fermant
 * une porte différente :
 *  - `membres_archivage_faiseur_de_disciple` (20260814120000, élargie en phase 5) refuse
 *    à un membre de QUITTER l'état actif tant qu'il a des disciples actifs — vers
 *    `archive` comme vers `en_attente` ;
 *  - `membres_desarchivage_faiseur_archive` (20260814140000, élargie en phase 5) est
 *    `before update of etat` et couvre TOUTE transition vers `actif`, y compris
 *    `en_attente -> actif`, donc la validation d'une demande ; elle refuse un faiseur qui
 *    n'est pas actif ;
 *  - `membres_faiseur_de_disciple_archive` (20260814150000, élargie en phase 5) refuse de
 *    rattacher à un faiseur qui n'est pas actif, à l'`insert` COMME à l'`update`.
 *
 * Les deux gardes qui lisent l'état du faiseur le lisent SOUS VERROU DE LIGNE
 * (`for share`), et `public.definir_arbre` aussi : sans cela, un rattachement et un
 * archivage concurrents ne se voyaient pas et validaient tous les deux — la classe de
 * défaut que la 1c a jugée inacceptable.
 *
 * ═══ ET POURTANT « FICHE NON CONSULTABLE » EST TRAITÉ, ET CE N'EST PAS UNE REDONDANCE ═══
 *
 * Cet écran ne s'appuie PAS sur l'invariant pour être correct. Ce n'est pas une défense
 * théorique : la RLS, elle, ne connaît pas cet invariant, et un compte ordinaire ne lit de
 * toute façon pas toutes les fiches. Le filtre explicite ci-dessus et le repli
 * « Fiche non consultable » rendent l'écran juste QUE L'INVARIANT TIENNE OU NON — c'est la
 * seule parade qui ne dépende pas d'une propriété maintenue ailleurs, par du code que ce
 * module ne relit jamais.
 *
 * Le chemin est borné à 64 niveaux par `ancetres_membre` elle-même — borne posée en 1c et
 * qualifiée de « seule protection restante si une donnée corrompue franchissait un jour
 * les barrières ».
 */
export async function chargerChemin(membreId: string): Promise<MaillonNomme[]> {
  await exigerProfilActif()

  // `ancetresDeMembre` rend les ancêtres du PLUS PROCHE au PLUS LOINTAIN, le membre
  // lui-même EXCLU (nul n'est son propre ancêtre, §5.1). On inverse pour partir de la
  // racine, et on ajoute le membre visé en queue : c'est LUI que l'écran met en évidence.
  const ancetres = await ancetresDeMembre(membreId)
  const identifiants = [...ancetres].reverse().concat(membreId)

  // Les NOMS, sous RLS ET filtrés `etat = 'actif'` explicitement. Découpage en lots de
  // 500 : le chemin est borné à 64, donc un seul lot — mais on ne s'appuie pas sur ce
  // raisonnement, la fonction partagée porte déjà la garantie.
  const brefs = await nomsMaillonsChemin(identifiants)

  return cheminAvecLibelles(identifiants, brefs)
}

/**
 * Numéro de la page de disciples de `parentId` qui CONTIENT `discipleId` (D97).
 *
 * ═══ LE GARDE EST LA PREMIÈRE INSTRUCTION (D103) ═══
 * Toute fonction exportée d'un fichier `'use server'` est appelable depuis le navigateur,
 * Y COMPRIS quand elle ne fait que LIRE et ne rend qu'un nombre. Un numéro de page est
 * déjà une information sur l'arbre : combien de personnes précèdent celle-là sous ce
 * faiseur. Précédent exact et commenté : `src/app/membres/recherche-action.ts` (1c).
 *
 * ═══ POURQUOI L'ÉCRAN EN A BESOIN ═══
 * La recherche déplie le chemin maillon par maillon. Sans ce calcul, elle chargerait
 * toujours la PAGE 1 de chaque maillon : au premier maillon à plus de
 * `TAILLE_PAGE_DISCIPLES` disciples dont le suivant n'est pas dans la première page, la
 * branche s'arrêterait là. La personne cherchée ne serait jamais rendue, rien ne la
 * mettrait en évidence, et AUCUN message ne signalerait l'interruption — pendant que le
 * fil d'Ariane continuerait d'afficher le chemin complet.
 *
 * ═══ ELLE NE GARANTIT RIEN, ET L'APPELANT DOIT LE SAVOIR ═══
 * Si le disciple visé n'est pas lisible ou n'est pas actif, elle rend `1` : elle ne
 * prétend pas savoir où il est. C'est à l'appelant de constater, après chargement, que le
 * maillon suivant figure bien dans la page obtenue, et de le DIRE à l'écran sinon.
 */
export async function pageContenant(parentId: string, discipleId: string): Promise<number> {
  await exigerProfilActif()
  return pageDuDisciple(parentId, discipleId)
}
