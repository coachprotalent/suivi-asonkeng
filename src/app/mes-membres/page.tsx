import Link from 'next/link'
import { libelleFiche } from '@/lib/domaine/membre'
import { resumerSection } from '@/lib/domaine/mes-membres'
import { compteurAelMembre } from '@/lib/donnees/ael'
import {
  maDescendancePage,
  mesContactsPage,
  mesDirigesPage,
  mesDisciplesPage,
  TAILLE_PAGE_MES_MEMBRES,
} from '@/lib/donnees/mes-membres'
import { nombreDePages, pageDemandee } from '@/lib/donnees/pagination'
import { statutsDuMembre } from '@/lib/donnees/statuts'
import { exigerProfilActif } from '@/lib/securite/garde'
import { CLASSES_VARIANTE } from '@/composants/ui/bouton'
import { Carte } from '@/composants/ui/carte'
import { EnTetePage } from '@/composants/ui/en-tete-page'
import { Section } from './section'

/**
 * « Mes membres » — quatre sections, quatre questions différentes (phase 7, lot C).
 *
 * ═══ LES RECOUVREMENTS SONT ASSUMÉS, PAS SUBIS (D142) ═══
 * Une même personne peut être à la fois un disciple direct et quelqu'un dont je suis le
 * dirigeant : elle figure alors dans DEUX sections. N'afficher chacun que dans « la section
 * la plus forte » effacerait l'information « je suis AUSSI son contact ». Le sous-titre de
 * l'écran le dit, et chaque section porte sa légende.
 *
 * ═══ CHAQUE SECTION A SON PROPRE PARAMÈTRE DE PAGE ═══
 * `?disciples=2` ne doit pas repaginer les trois autres. `lien()` reconstruit donc les
 * quatre paramètres à chaque fois, en n'en changeant qu'un.
 *
 * Gardée par `exigerProfilActif` : ce n'est pas un écran d'administration. Chacun n'y voit
 * que SA portée — non par un filtre, mais parce que la page ne lit QUE la session : aucun
 * identifiant ne vient de l'URL, il n'y a donc aucune portée d'autrui à atteindre d'ici.
 */
export default async function PageMesMembres({
  searchParams,
}: {
  searchParams: Promise<{
    disciples?: string
    descendance?: string
    diriges?: string
    contacts?: string
  }>
}) {
  const profil = await exigerProfilActif()
  const parametres = await searchParams

  // D146 — UN COMPTE SANS FICHE MEMBRE VOIT UN ENCART, PAS QUATRE LISTES VIDES. Quatre listes
  // vides feraient croire à un membre sans disciples au lieu d'un compte sans fiche. C'est le
  // cas du compte racine (contrainte `profils_racine_sans_membre`).
  if (!profil.membreId) {
    return (
      <main className="mx-auto w-full max-w-3xl px-esp-6 py-esp-10">
        <EnTetePage
          retour={{ href: '/tableau-de-bord', libelle: 'Retour au pilotage' }}
          titre="Mes membres"
        />
        <Carte ton="avertissement">
          Ce compte n&apos;est relié à aucune fiche de suivi. Il n&apos;a donc ni disciples ni
          personnes à suivre à afficher ici. Demandez à un administrateur de relier votre
          compte à votre fiche.
        </Carte>
      </main>
    )
  }

  const membreId = profil.membreId
  const pageDisciples = pageDemandee(parametres.disciples)
  const pageDescendance = pageDemandee(parametres.descendance)
  const pageDiriges = pageDemandee(parametres.diriges)
  const pageContacts = pageDemandee(parametres.contacts)

  const [disciples, descendance, diriges, contacts] = await Promise.all([
    mesDisciplesPage(membreId, pageDisciples),
    maDescendancePage(membreId, pageDescendance),
    mesDirigesPage(membreId, pageDiriges),
    mesContactsPage(membreId, pageContacts),
  ])

  // D144 — SYNTHÈSE LUE EN LOT, jamais une requête par ligne rendue en SÉRIE.
  // `compteurAelMembre` et `statutsDuMembre` prennent un identifiant à la fois : on les
  // appelle EN PARALLÈLE sur les seuls identifiants DISTINCTS de la page courante. Les
  // recouvrements entre sections (D142) jouent ici en notre faveur : une personne présente
  // dans trois sections n'est lue qu'une fois.
  const identifiants = [
    ...new Set([
      ...disciples.lignes.map((membre) => membre.id),
      ...descendance.lignes.map((ligne) => ligne.membre.id),
      ...diriges.lignes.map((membre) => membre.id),
      ...contacts.lignes.map((membre) => membre.id),
    ]),
  ]
  const synthese = await Promise.all(
    identifiants.map(async (identifiant) => {
      const [compteur, statuts] = await Promise.all([
        compteurAelMembre(identifiant),
        statutsDuMembre(identifiant),
      ])
      return { identifiant, compteur, statuts: statuts.map((statut) => statut.libelle) }
    }),
  )

  const compteurs: Record<string, number> = {}
  const statuts: Record<string, string[]> = {}
  for (const ligne of synthese) {
    // `null` N'EST PAS 0 : un compteur absent laisse la clé absente, et `resumerSection` rend
    // alors `complement: null`. Écrire 0 ferait dire à l'écran « aucun AEL suivi » là où la
    // vérité est « la ligne de la vue n'est pas visible ».
    if (ligne.compteur !== null) compteurs[ligne.identifiant] = ligne.compteur
    statuts[ligne.identifiant] = ligne.statuts
  }

  // « via X » pour la descendance. `libelleFiche` et non le nom brut : un parent non lisible
  // affiche « Fiche non consultable » à sa place, jamais un blanc (D98, D100).
  const provenance: Record<string, string> = {}
  for (const ligne of descendance.lignes) {
    const nomParent = libelleFiche(ligne.parentId, ligne.parent)
    if (nomParent) provenance[ligne.membre.id] = `via ${nomParent}`
  }

  function lien(section: string, page: number): string {
    const suivants = new URLSearchParams({
      disciples: String(pageDisciples),
      descendance: String(pageDescendance),
      diriges: String(pageDiriges),
      contacts: String(pageContacts),
    })
    suivants.set(section, String(page))
    return `/mes-membres?${suivants.toString()}`
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-esp-6 py-esp-10">
      <EnTetePage
        retour={{ href: '/tableau-de-bord', libelle: 'Retour au pilotage' }}
        titre="Mes membres"
        soustitre="Quatre façons d'être lié à quelqu'un. Une même personne peut figurer dans plusieurs sections."
        action={
          <Link href="/demandes/nouvelle" className={CLASSES_VARIANTE.lien}>
            Proposer une personne à suivre
          </Link>
        }
      />

      <Section
        titre="Mes disciples directs"
        legende="Les personnes dont vous êtes le faiseur de disciple."
        resumes={resumerSection(disciples.lignes, statuts, compteurs)}
        total={disciples.total}
        page={pageDisciples}
        pages={nombreDePages(disciples.total, TAILLE_PAGE_MES_MEMBRES)}
        lienVersPage={(page) => lien('disciples', page)}
        // « actif » n'est pas un ornement : la liste ne rend que les disciples ACTIFS, et
        // « aucun disciple rattaché » se lirait comme « n'en a jamais eu ».
        messageVide="Aucun disciple actif rattaché."
        gestesStatuts
        rail
      />

      <Section
        titre="Disciples de mes disciples"
        legende="Toute votre descendance au-delà du premier niveau, quelle qu'en soit la profondeur."
        resumes={resumerSection(
          descendance.lignes.map((ligne) => ligne.membre),
          statuts,
          compteurs,
        )}
        total={descendance.total}
        page={pageDescendance}
        pages={nombreDePages(descendance.total, TAILLE_PAGE_MES_MEMBRES)}
        lienVersPage={(page) => lien('descendance', page)}
        messageVide="Aucun disciple de disciple actif."
        gestesStatuts
        rail
        provenance={provenance}
      />

      <Section
        titre="Ceux dont je suis dirigeant"
        legende="Les personnes qui vous ont pour dirigeant désigné."
        resumes={resumerSection(diriges.lignes, statuts, compteurs)}
        total={diriges.total}
        page={pageDiriges}
        pages={nombreDePages(diriges.total, TAILLE_PAGE_MES_MEMBRES)}
        lienVersPage={(page) => lien('diriges', page)}
        messageVide="Vous n'êtes le dirigeant d'aucun membre actif."
        gestesStatuts
        rail
      />

      {/*
        ⚠️ LA SEULE SECTION SANS GESTES ET SANS RAIL, ET ELLE DIT POURQUOI.

        `gestesStatuts={false}` : `peutModifier` (src/lib/domaine/arbre.ts) donne autorité à
        l'administrateur, à l'ancêtre à toute profondeur et au dirigeant désigné — JAMAIS au
        contact (D143). Proposer « Gérer les statuts » ici mènerait à un écran sans formulaire,
        ce qui se lirait comme un défaut de l'application. L'absence est ÉNONCÉE dans la
        légende, jamais laissée muette : une absence muette se « corrige » toute seule au
        premier passage d'un relecteur pressé.

        `rail={false}` : le contact n'est pas une relation de discipulat (D134), même raison
        que sur la fiche membre.
      */}
      <Section
        titre="Ceux dont je suis contact"
        legende="Les personnes qui vous ont désigné comme contact. Ce lien ne donne aucun droit sur leur fiche : vous ne pouvez pas y gérer les statuts."
        resumes={resumerSection(contacts.lignes, statuts, compteurs)}
        total={contacts.total}
        page={pageContacts}
        pages={nombreDePages(contacts.total, TAILLE_PAGE_MES_MEMBRES)}
        lienVersPage={(page) => lien('contacts', page)}
        messageVide="Personne ne vous a désigné comme contact."
        gestesStatuts={false}
        rail={false}
      />
    </main>
  )
}
