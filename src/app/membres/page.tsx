import Link from 'next/link'
import { EnTetePage } from '@/composants/ui/en-tete-page'
import { LigneListe, Liste } from '@/composants/ui/ligne-liste'
import { Pagination } from '@/composants/ui/pagination'
import { CLASSES_VARIANTE } from '@/composants/ui/bouton'
import { listerAntennes } from '@/lib/donnees/antennes'
import { listerMembres, TAILLE_PAGE_ANNUAIRE } from '@/lib/donnees/membres'
import { pageDemandee } from '@/lib/donnees/pagination'
import { rolesDuProfil } from '@/lib/donnees/profils'
import { bornerPage } from '@/lib/navigation/bornage'
import { exigerProfilActif } from '@/lib/securite/garde'

const LIBELLE_SITUATION: Record<string, string> = {
  etudiant: 'Étudiant',
  travailleur: 'Travailleur',
  autre: 'Autre',
}

/*
  ⚠️ LE FORMULAIRE DE FILTRE CI-DESSOUS N'EMPLOIE NI `Champ` NI `Selecteur`, ET C'EST VOULU.

  C'est un `<form method="get">`, pas un `<form action>`. Le mécanisme que D111 ferme —
  React réinitialise les champs NON CONTRÔLÉS d'un `<form action>` à toute complétion de
  l'action — N'EXISTE PAS ICI : un formulaire GET NAVIGUE, la page est re-rendue depuis le
  serveur, et les `defaultValue` sont rechargés DEPUIS L'ADRESSE. C'est ce qui fait survivre
  le filtre à un rafraîchissement et à un signet.

  Le rendre contrôlé exigerait `'use client'` sur cette page, donc de déplacer les trois
  lectures et le garde `exigerProfilActif` — un changement d'architecture, pas de
  présentation (D118). Et les deux champs n'ont pas de libellé visible, seulement un
  `aria-label` : leur en donner un serait un texte affiché NOUVEAU (D117).

  DEUX FORMULAIRES GET DANS TOUT LE DÉPÔT — celui-ci et `evenements/page.tsx:62`. Il n'y en
  aura pas un troisième sans que ce commentaire soit relu.
*/
const CLASSE_CHAMP_FILTRE =
  'cible-tactile rounded-bord border border-bord-carte bg-surface px-esp-3 py-esp-2 text-corps text-encre'

export default async function PageAnnuaire({
  searchParams,
}: {
  searchParams: Promise<{ recherche?: string; antenne?: string; page?: string }>
}) {
  const profil = await exigerProfilActif()
  const parametres = await searchParams

  // Le filtre vient de l'adresse, donc du client. Une valeur qui n'est pas un
  // identifiant ferait échouer la requête sur une colonne `uuid` — un signet périmé
  // suffit. On l'ignore plutôt que de faire tomber l'écran.
  const antenneFiltre = /^[0-9a-f-]{36}$/i.test(parametres.antenne ?? '')
    ? parametres.antenne
    : undefined

  // `pageDemandee` (src/lib/donnees/pagination.ts) remplace le `Number.parseInt` recopié
  // ici : même code, même garde M5 (`Number('2.5') || 1` vaut 2.5, non entier, qui
  // franchissait la borne haute et s'affichait « page 2.5 sur N »).
  const page = pageDemandee(parametres.page)

  const [{ membres, total }, antennes, roles] = await Promise.all([
    listerMembres({ recherche: parametres.recherche, antenneId: antenneFiltre, page }),
    listerAntennes(),
    rolesDuProfil(profil.id),
  ])
  const estAdmin = roles.includes('administrateur')

  function lienPage(numero: number): string {
    const params = new URLSearchParams()
    if (parametres.recherche) params.set('recherche', parametres.recherche)
    if (antenneFiltre) params.set('antenne', antenneFiltre)
    params.set('page', String(numero))
    return `/membres?${params.toString()}`
  }

  // D121 — LE BORNAGE EST EXTRAIT, À COMPORTEMENT IDENTIQUE (src/lib/navigation/bornage.ts).
  // Une adresse pointant au-delà de la dernière page réelle est un signet périmé (ou un
  // résultat qui a rétréci depuis) : sans ce garde, l'en-tête affichait « N membres · page
  // 99 sur 2 » pendant que le corps affirmait qu'aucun membre ne correspond — deux vérités
  // contradictoires sur le même écran.
  // `total` vient de la LECTURE ELLE-MÊME, jamais d'un aller-retour préalable (I1, ronde du
  // 2026-08-14). HORS DE TOUT `try` : `bornerPage` appelle `redirect()`, qui lève une
  // exception de contrôle Next.js (aucun `try` dans ce fichier — vérifié).
  const pages = bornerPage(page, total, TAILLE_PAGE_ANNUAIRE, lienPage)

  return (
    <main className="mx-auto max-w-4xl px-esp-6 py-esp-10">
      <EnTetePage
        retour={{ href: '/tableau-de-bord', libelle: 'Retour au tableau de bord' }}
        titre="Annuaire"
        soustitre={
          <>
            {total} membre{total > 1 ? 's' : ''}
            {pages > 1 ? ` · page ${page} sur ${pages}` : ''}
          </>
        }
        action={
          estAdmin ? (
            <Link href="/membres/nouveau" className={CLASSES_VARIANTE.principal}>
              Nouveau membre
            </Link>
          ) : null
        }
      />

      {/* Formulaire GET — voir le commentaire de tête. Aucun `Champ`, aucun `Selecteur`. */}
      <form className="mb-esp-8 flex flex-wrap gap-esp-3" method="get">
        <input
          name="recherche"
          type="search"
          defaultValue={parametres.recherche ?? ''}
          placeholder="Nom, prénom ou ville"
          aria-label="Rechercher"
          className={`min-w-48 flex-1 ${CLASSE_CHAMP_FILTRE}`}
        />
        <select
          name="antenne"
          defaultValue={antenneFiltre ?? ''}
          aria-label="Antenne"
          className={CLASSE_CHAMP_FILTRE}
        >
          <option value="">Toutes les antennes</option>
          {antennes.map((antenne) => (
            <option key={antenne.id} value={antenne.id}>
              {antenne.nom}
            </option>
          ))}
        </select>
        <button type="submit" className={CLASSES_VARIANTE.secondaire}>
          Filtrer
        </button>
      </form>

      {membres.length === 0 ? (
        <p className="text-corps text-encre-attenuee">
          Aucun membre ne correspond à cette recherche.
        </p>
      ) : (
        <Liste>
          {membres.map((membre) => (
            /*
              ⚠️ PAS DE RAIL DE FILIATION ICI (piège n°6). L'annuaire affiche antenne, ville
              et situation — JAMAIS un faiseur de disciple. Un rail y marquerait une
              relation qui n'est pas affichée : une décoration qui affirme quelque chose de
              faux, la forme de défaut la plus coûteuse de ce projet. Les cinq écrans où le
              rail est légitime sont nommés dans les contraintes globales du plan.
            */
            <LigneListe
              key={membre.id}
              lien={`/membres/${membre.id}`}
              principal={`${membre.prenom} ${membre.nom}`}
              meta={[
                membre.antenneNom,
                membre.ville,
                membre.situation ? LIBELLE_SITUATION[membre.situation] : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            />
          ))}
        </Liste>
      )}

      <div className="mt-esp-8">
        <Pagination page={page} pages={pages} lienVersPage={lienPage} />
      </div>
    </main>
  )
}
