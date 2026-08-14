import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { evenementParId, participantsDEvenement, typesEvenementActifs } from '@/lib/donnees/evenements'
import { TAILLE_PAGE_PARTICIPANTS, type PageLue, type ParticipantLigne } from '@/lib/donnees/evenements-lots'
import { formaterDateSeule } from '@/lib/format/date'
import { estModerateurOuAdministrateur, exigerProfilActif } from '@/lib/securite/garde'
import { FormulaireEvenement } from '../formulaire-evenement'
import { modifierEvenement } from './actions'
import { SectionParticipants } from './participants'

export default async function PageEvenement({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ pageParticipants?: string }>
}) {
  // Consultation de l'en-tête : TOUT COMPTE ACTIF.
  await exigerProfilActif()
  const { id } = await params

  const evenement = await evenementParId(id)
  if (!evenement) {
    notFound()
  }

  const [types, peutGerer] = await Promise.all([
    typesEvenementActifs(),
    estModerateurOuAdministrateur(),
  ])

  const { pageParticipants: pageBrute } = await searchParams
  // `Number.parseInt`, pas `Number(...)` : `Number('2.5') || 1` vaut `2.5`, non entier,
  // qui franchit le garde de borne haute plus bas et s'afficherait sous l'étiquette
  // « Page 2.5 sur N » (M5, ronde du 2026-08-14). Même garde que
  // `src/app/membres/page.tsx:32-33`.
  const pageParticipantsBrute = Number.parseInt(pageBrute ?? '1', 10)
  const pageParticipants =
    Number.isFinite(pageParticipantsBrute) && pageParticipantsBrute > 0 ? pageParticipantsBrute : 1

  // LA LECTURE N'EST PAS FAITE DU TOUT hors modérateur et administrateur, et ce n'est pas
  // une optimisation. Un compte ordinaire lit `participations` sous RLS et obtient ZÉRO
  // ligne : un évènement à cent participants lui paraîtrait DÉSERT. Charger puis ne pas
  // afficher laisserait ce zéro se glisser un jour dans un compteur ou dans un « aucun
  // participant » — c'est le pendant exact du mode de défaillance de D71, dans l'autre
  // sens : une lecture VIDÉE PAR LA RLS ne doit jamais être affichée comme un résultat.
  //
  // BORNE HAUTE DE LA PAGINATION — UN SEUL ALLER-RETOUR, PAS DEUX. Une adresse pointant
  // au-delà de la dernière page réelle est un signet périmé (ou une liste qui a rétréci
  // depuis une suppression, D78) : sans garde, l'écran afficherait EN MÊME TEMPS trois
  // vérités contradictoires (total, « aucun participant », et un numéro de page qui
  // n'existe pas). UN PREMIER CORRECTIF (Task 19) précalculait la borne par un aller-retour
  // séparé AVANT de lire la page — plus fragile que le motif qu'il imitait : une
  // suppression ou une conversion concurrente ENTRE les deux appels périmait la borne déjà
  // calculée, et le second appel (la lecture elle-même) échouait à son tour avec
  // `PGRST103`, non attrapé ici, faisant PLANTER l'écran au lieu de rediriger — sur cet
  // écran précis, où deux modérateurs travaillent ensemble. CORRIGÉ (I1, ronde du
  // 2026-08-14) en reprenant le motif éprouvé de `listerMembres` (membres.ts:185-188) :
  // `participantsDEvenement` lit directement la page DEMANDÉE, et attrape `PGRST103`
  // SUR CETTE LECTURE ELLE-MÊME (evenements-lots.ts) pour retomber sur un comptage sans
  // `range`, toujours satisfiable — un seul aller-retour dans le cas normal, deux
  // uniquement dans le cas déjà en échec, sans jamais rouvrir de fenêtre entre les deux.
  // `pagesParticipants` est calculé APRÈS coup, à partir du `total` REÇU DE CETTE MÊME
  // LECTURE — jamais d'un second calcul séparé qui pourrait diverger.
  // PAS DE BOUCLE POSSIBLE : `pagesParticipants` vaut toujours au moins 1, et la cible de
  // la redirection est `pagesParticipants` lui-même — la page rechargée aura donc
  // `pageParticipants === pagesParticipants`, qui ne redéclenche pas la condition.
  // HORS DE TOUT `try` : `redirect()` lève une exception de contrôle Next.js que ce fichier
  // ne doit pas intercepter (aucun `try` dans ce fichier — vérifié).
  // Sous `if (peutGerer)` : hors modérateur et administrateur, rien n'est lu, il n'y a
  // aucune page à borner, et rediriger serait divulguer qu'il y a des participants.
  let participants: PageLue<ParticipantLigne> | null = null
  let pagesParticipants = 1
  if (peutGerer) {
    participants = await participantsDEvenement(evenement.id, pageParticipants)
    pagesParticipants = Math.max(1, Math.ceil(participants.total / TAILLE_PAGE_PARTICIPANTS))
    if (pageParticipants > pagesParticipants) {
      redirect(`/evenements/${evenement.id}?pageParticipants=${pagesParticipants}`)
    }
  }

  const lignes: Array<[string, string | null]> = [
    ['Type', evenement.typeLibelle],
    ['Début', formaterDateSeule(evenement.dateDebut)],
    ['Fin', evenement.dateFin ? formaterDateSeule(evenement.dateFin) : null],
    // `heure_debut` est une colonne `time`, sérialisée `HH:MM:SS` par PostgREST. Affichée
    // telle quelle en la rognant aux minutes : la passer par `formaterDateHeure`
    // supposerait un instant, ce que D56 refuse précisément de faire.
    ['Heure', evenement.heureDebut ? evenement.heureDebut.slice(0, 5) : null],
    ['Lieu', evenement.lieu],
  ]

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/evenements" className="text-sm underline underline-offset-4">
        Retour aux évènements
      </Link>

      <h1 className="mt-4 mb-6 text-2xl font-semibold">{evenement.titre}</h1>

      <dl className="divide-y divide-neutral-200">
        {lignes.map(([intitule, valeur]) => (
          <div key={intitule} className="flex justify-between gap-4 py-3">
            <dt className="text-sm text-neutral-500">{intitule}</dt>
            <dd className="text-sm">{valeur ?? '—'}</dd>
          </div>
        ))}
      </dl>

      {evenement.description ? (
        <p className="mt-6 text-sm whitespace-pre-line">{evenement.description}</p>
      ) : null}

      {peutGerer ? (
        <section className="mt-10">
          <details>
            <summary className="cursor-pointer text-sm underline underline-offset-4">
              Modifier l&apos;évènement
            </summary>
            <div className="mt-4">
              <FormulaireEvenement
                action={modifierEvenement}
                types={types}
                libelleBouton="Enregistrer"
                champsCaches={{ evenementId: evenement.id }}
                valeurs={{
                  titre: evenement.titre,
                  typeId: evenement.typeId,
                  dateDebut: evenement.dateDebut,
                  dateFin: evenement.dateFin ?? '',
                  heureDebut: evenement.heureDebut ? evenement.heureDebut.slice(0, 5) : '',
                  lieu: evenement.lieu ?? '',
                  description: evenement.description ?? '',
                }}
                // Le type COURANT même s'il a été désactivé depuis : sans lui, le `select`
                // ne le proposerait pas et le premier enregistrement BASCULERAIT
                // SILENCIEUSEMENT l'évènement vers un autre type. Un type désactivé
                // disparaît des NOUVELLES attributions, pas de l'existant (spec §7).
                typeCourant={{ id: evenement.typeId, libelle: evenement.typeLibelle }}
              />
            </div>
          </details>
        </section>
      ) : null}

      {/*
        LA SECTION NE SE VIDE PAS PAR RLS, ELLE NE SE REND PAS DU TOUT hors modérateur et
        administrateur (design §8.1). Un compte ordinaire obtiendrait zéro ligne sous RLS,
        et un évènement à cent participants lui paraîtrait désert — un mensonge, pas une
        protection.

        `pages` reçoit `pagesParticipants`, calculé plus haut EN MÊME TEMPS que le garde de
        borne haute — surtout PAS une seconde expression recalculée ici. Deux calculs
        séparés de la même quantité divergeraient au premier changement de
        `TAILLE_PAGE_PARTICIPANTS`, et le pied de page se remettrait à annoncer une page
        que le garde interdit d'atteindre.
      */}
      {peutGerer && participants ? (
        <SectionParticipants
          evenementId={evenement.id}
          participants={participants.lignes}
          total={participants.total}
          page={pageParticipants}
          pages={pagesParticipants}
        />
      ) : null}
    </main>
  )
}
