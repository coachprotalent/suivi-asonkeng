import Link from 'next/link'
import { notFound } from 'next/navigation'
import { formaterDateSeule } from '@/lib/format/date'
import { seanceParId, presencesDeSeance } from '@/lib/donnees/ael'
import { membresBrefsParIds, membresDesAntennes } from '@/lib/donnees/membres'
import { estModerateurOuAdministrateur, exigerProfilActif } from '@/lib/securite/garde'
import { annulerSeance, remettrePrevue } from './actions'
import { BoutonTransitionEtat } from './bouton-transition-etat'
import { FormulaireSeance } from './formulaire-seance'
import { Pointage } from './pointage'

const LIBELLE_ETAT: Record<string, string> = {
  prevue: 'Prévue',
  tenue: 'Tenue',
  annulee: 'Annulée',
}

/**
 * Nom d'un intervenant pour l'affichage en LECTURE SEULE. Distingue « aucun » de
 * « désigné mais non consultable » (même discipline que `ChampIntervenant`, côté
 * édition) : un `xxxMembreId` non nul dont l'embed est `null` signifie une fiche que la
 * RLS cache à ce compte, pas une absence d'intervenant.
 */
function libelleIntervenant(
  membreId: string | null,
  membre: { nom: string; prenom: string } | null,
  libre: string | null,
): string | null {
  if (membreId) {
    return membre ? `${membre.prenom} ${membre.nom}` : 'Fiche non consultable'
  }
  return libre
}

export default async function PageSeanceAel({ params }: { params: Promise<{ id: string }> }) {
  await exigerProfilActif()
  const { id } = await params

  const seance = await seanceParId(id)
  if (!seance) {
    notFound()
  }

  const [peutGerer, presences] = await Promise.all([
    estModerateurOuAdministrateur(),
    presencesDeSeance(seance.id),
  ])
  // La liste complète des membres n'est chargée QUE pour qui pointe (D50 avant D29 :
  // le rattachement d'antenne est le préalable, mais charger cette liste pour un
  // simple consultant serait une lecture inutile — lui n'a droit qu'au compteur).
  const membres = peutGerer
    ? await membresDesAntennes(seance.antennes.map((antenne) => antenne.id))
    : []
  const presentsCount = Object.values(presences).filter(Boolean).length

  // Correction I1 de la ronde : `presences` (toutes les lignes réellement pointées,
  // via `presencesDeSeanceParLots`) peut contenir des identifiants absents de
  // `membres` (limité aux membres ACTIFS des antennes ciblées) — ajoutés hors antenne
  // (D47), archivés depuis (D48 : leur présence RESTE et reste comptée), ou déplacés
  // vers une autre antenne. Sans ce rattrapage, ces présences n'avaient ni case, ni
  // nom, ni total : le motif « absent et vide indiscernables », sans aucune condition
  // de volume. On les relève ici et on lit leur nom séparément — la RLS reste seule
  // juge : un identifiant que ce compte ne peut pas consulter (typiquement archivé,
  // vu par un modérateur) rend « Fiche non consultable », jamais un silence, même
  // discipline que `libelleIntervenant` ci-dessous pour l'enseignant/le modérateur.
  let presencesHorsListe: { id: string; libelle: string }[] = []
  if (peutGerer) {
    const idsMembres = new Set(membres.map((m) => m.id))
    const idsHorsListe = Object.keys(presences).filter((id) => !idsMembres.has(id))
    const membresHorsListe = await membresBrefsParIds(idsHorsListe)
    const parId = new Map(membresHorsListe.map((m) => [m.id, m]))
    presencesHorsListe = idsHorsListe.map((id) => {
      const trouve = parId.get(id)
      return {
        id,
        // IMPORTANT 7 de la revue de la Task 19 : sans référence, DEUX fiches masquées
        // rendaient deux lignes strictement identiques — même texte, même nom
        // accessible — chacune portant une case dont le décochage ÉCRIT RÉELLEMENT en
        // base (`pointerPresence` passe par `clientAdmin()`, la RLS ne s'y oppose pas).
        // La clé React évitait la collision technique, jamais la confusion humaine : un
        // contrôle destructif sans étiquette discriminante. Les huit premiers caractères
        // de l'identifiant suffisent à distinguer les lignes sans rien révéler d'une
        // fiche que la RLS cache — c'est un identifiant technique déjà présent dans
        // l'URL de la page membre, pas une donnée personnelle.
        libelle: trouve
          ? `${trouve.prenom} ${trouve.nom}`
          : `Fiche non consultable (réf. ${id.slice(0, 8)})`,
      }
    })
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Link href="/ael/seances" className="text-sm underline underline-offset-4">
        Retour aux séances
      </Link>
      <header className="mt-4 mb-8">
        <h1 className="text-2xl font-semibold">{formaterDateSeule(seance.date)}</h1>
        <p className="text-sm text-neutral-500">
          {seance.antennes.map((a) => a.nom).join(', ') || 'Aucune antenne'} · {LIBELLE_ETAT[seance.etat]}
        </p>
      </header>

      {peutGerer ? (
        <FormulaireSeance seance={seance} />
      ) : (
        <dl className="divide-y divide-neutral-200">
          <div className="flex justify-between gap-4 py-3">
            <dt className="text-sm text-neutral-500">Thème</dt>
            <dd className="text-sm">{seance.theme ?? '—'}</dd>
          </div>
          <div className="flex justify-between gap-4 py-3">
            <dt className="text-sm text-neutral-500">Enseignant</dt>
            <dd className="text-sm">
              {libelleIntervenant(seance.enseignantMembreId, seance.enseignantMembre, seance.enseignantLibre) ?? '—'}
            </dd>
          </div>
          <div className="flex justify-between gap-4 py-3">
            <dt className="text-sm text-neutral-500">Modérateur</dt>
            <dd className="text-sm">
              {libelleIntervenant(seance.moderateurMembreId, seance.moderateurMembre, seance.moderateurLibre) ?? '—'}
            </dd>
          </div>
        </dl>
      )}

      {/*
        I1 de la revue finale de branche — `annulee` ÉTAIT UN ÉTAT TERMINAL, ET RIEN NE LE
        DISAIT. Cette condition externe (`!== 'prevue'`) couvre `tenue` ET `annulee` ; la
        condition interne la rétrécissait à `tenue`, si bien qu'une séance annulée ne se
        voyait offrir AUCUN retour : `remettrePrevue` existait et faisait exactement le
        travail, elle n'était jamais proposée. Et la génération ne la recréait pas non
        plus — son `on conflict (calendrier_id, genere_pour_le) do nothing`
        (`20260817140000:38`) la voit déjà présente, quel que soit son état. Un clic de
        trop sur « Annuler la séance » détruisait donc l'occurrence définitivement, la
        seule sortie restante étant de la déclarer TENUE.
        DIRECTION RETENUE : rendre l'annulation RÉVERSIBLE plutôt que documenter son
        irréversibilité. Une donnée détruite par un clic mal placé coûte plus cher qu'un
        bouton de plus, la Server Action existe déjà, et D49 pose la réversibilité comme
        la règle de cet écran — la restreindre à `tenue` était l'exception non dite. Le
        déclencheur de complétude ne s'y oppose pas : il ne surveille que le sens VERS
        `tenue` (`20260817120000`, `is distinct from`).
      */}
      {peutGerer && seance.etat !== 'prevue' ? (
        <div className="mt-6 flex flex-wrap gap-4">
          <form action={remettrePrevue}>
            <input type="hidden" name="seanceId" value={seance.id} />
            <BoutonTransitionEtat
              libelle="Repasser à prévue"
              message={
                seance.etat === 'tenue'
                  ? 'Repasser cette séance à « prévue » ?\n\n' +
                    "Le pointage déjà fait n'est pas effacé : il redevient visible si vous " +
                    'remarquez la séance « tenue » ensuite.'
                  : 'Repasser cette séance à « prévue » ?\n\n' +
                    "La séance redevient modifiable et pointable, et le pointage déjà fait, " +
                    "s'il y en a, n'est pas effacé."
              }
            />
          </form>
        </div>
      ) : null}

      {peutGerer && seance.etat !== 'annulee' ? (
        <div className="mt-2 flex flex-wrap gap-4">
          <form action={annulerSeance}>
            <input type="hidden" name="seanceId" value={seance.id} />
            {/*
              Le texte rassurait sur le point qui ne risquait rien (le pointage) et taisait
              celui qui était irréversible. La seconde phrase dit désormais ce que le bouton
              ci-dessus rend vrai — sans elle, un modérateur n'aurait aucun moyen de savoir
              que le geste se défait.
            */}
            <BoutonTransitionEtat
              libelle="Annuler la séance"
              message={
                "Annuler cette séance ? Le pointage déjà fait, s'il y en a, n'est pas effacé.\n\n" +
                'Ce geste se défait : « Repasser à prévue » reste offert sur une séance annulée.'
              }
              accent
            />
          </form>
        </div>
      ) : null}

      <section className="mt-10">
        <h2 className="mb-3 text-lg font-medium">Présences</h2>
        {peutGerer ? (
          <Pointage
            seanceId={seance.id}
            membres={membres}
            presencesInitiales={presences}
            presencesHorsListe={presencesHorsListe}
          />
        ) : (
          <p className="text-sm text-neutral-600">
            {presentsCount} présent{presentsCount > 1 ? 's' : ''}.
          </p>
        )}
      </section>
    </main>
  )
}
