import Link from 'next/link'
import type { ResumeMembre } from '@/lib/domaine/mes-membres'
import { CLASSES_VARIANTE } from '@/composants/ui/bouton'
import { LigneListe, Liste } from '@/composants/ui/ligne-liste'
import { Pagination } from '@/composants/ui/pagination'

/**
 * Une des quatre sections de `/mes-membres` (D142).
 *
 * UN SEUL COMPOSANT POUR QUATRE SECTIONS : elles ne diffèrent que par leurs textes, leur
 * source et deux booléens. Quatre copies divergeraient, et la section qu'on regarde le moins
 * — « ceux dont je suis contact » — serait la première à perdre sa légende.
 */
type Props = {
  titre: string
  /**
   * Ce que cette section montre, en une phrase. JAMAIS omis : quatre listes de noms sans
   * légende seraient indiscernables les unes des autres, et le recouvrement voulu (D142)
   * passerait pour un doublon.
   */
  legende: string
  resumes: ResumeMembre[]
  total: number
  page: number
  pages: number
  lienVersPage: (page: number) => string
  /** Affiché quand la section est vide. Jamais « aucun disciple » sans qualificatif. */
  messageVide: string
  /**
   * Les gestes de statut sont-ils proposés sur les lignes de cette section ? (D143)
   * FAUX pour la seule section « dont je suis contact » : le contact ne confère aucun droit,
   * et `peutModifier` ne le connaît pas.
   */
  gestesStatuts: boolean
  /** Marque de filiation sur les lignes (D106). FAUX pour la section « contact » (D134). */
  rail: boolean
  /** Complément par identifiant : « via X » pour la descendance. */
  provenance?: Readonly<Record<string, string>>
}

export function Section({
  titre,
  legende,
  resumes,
  total,
  page,
  pages,
  lienVersPage,
  messageVide,
  gestesStatuts,
  rail,
  provenance,
}: Props) {
  return (
    <section className="mt-esp-8">
      <div className="mb-esp-1 flex items-baseline justify-between gap-esp-4">
        <h2 className="text-section">{titre}</h2>
        {/* Le TOTAL de l'ensemble, jamais la longueur de la page. */}
        <span className="chiffres-alignes text-petit text-encre-attenuee">{total}</span>
      </div>
      <p className="mb-esp-3 text-petit text-encre-attenuee">{legende}</p>

      {resumes.length === 0 ? (
        <p className="text-petit text-encre-attenuee">{messageVide}</p>
      ) : (
        <Liste>
          {resumes.map((resume) => (
            <LigneListe
              key={resume.id}
              lien={`/membres/${resume.id}`}
              principal={resume.libelle}
              rail={rail}
              meta={
                <span className="flex flex-wrap items-center gap-esp-2">
                  {provenance?.[resume.id] ? <span>{provenance[resume.id]}</span> : null}
                  {resume.complement ? <span>{resume.complement}</span> : null}
                  {/*
                    ⚠️ PUCES DE CATALOGUE, PAS DES `EtatBadge` (C4) : un statut de catalogue
                    ne porte aucune couleur d'état, et lui en attribuer une inventerait une
                    information que la donnée n'a pas.
                  */}
                  {resume.statuts.map((statut) => (
                    <span
                      key={statut}
                      className="rounded-full border border-bord-carte px-esp-2 py-esp-1 text-petit"
                    >
                      {statut}
                    </span>
                  ))}
                </span>
              }
              actions={
                gestesStatuts ? (
                  /*
                    D147 — « gérer depuis la liste » = les statuts PORTÉS affichés en ligne
                    (ci-dessus) plus ce lien vers l'écran qui porte déjà le formulaire ET son
                    garde `exigerAutoriteSur`. Le formulaire d'attribution n'est PAS recopié
                    dans chaque ligne : ce serait dupliquer un écran entier — son `<select>`
                    groupé, sa date, sa note, son contrôle d'exclusivité, son bouton de
                    retrait — dans quatre sections de vingt-cinq lignes, et deux copies d'un
                    même geste, c'est celle qui n'est pas exercée qui dérive.
                  */
                  <Link href={`/membres/${resume.id}/statuts`} className={CLASSES_VARIANTE.lien}>
                    Gérer les statuts
                  </Link>
                ) : null
              }
            />
          ))}
        </Liste>
      )}

      {pages > 1 ? (
        <div className="mt-esp-4">
          <Pagination page={page} pages={pages} lienVersPage={lienVersPage} indicateur />
        </div>
      ) : null}
    </section>
  )
}
