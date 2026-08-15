import Link from 'next/link'
import { notFound } from 'next/navigation'
import { compteurAelMembre } from '@/lib/donnees/ael'
import { libelleFiche } from '@/lib/domaine/membre'
import { disciplesDe } from '@/lib/donnees/arbre'
import { etatCompteLie } from '@/lib/donnees/comptes'
import { seminairesAssistes } from '@/lib/donnees/evenements'
import { membreBrefParId, membreParId } from '@/lib/donnees/membres'
import { rolesDuProfil } from '@/lib/donnees/profils'
import { statutsDuMembre } from '@/lib/donnees/statuts'
import { formaterDateSeule } from '@/lib/format/date'
import { aAutoriteSur, exigerProfilActif } from '@/lib/securite/garde'
import { archiverMembre, desarchiverMembre } from '../actions'
import { BoutonArchiver } from './bouton-archiver'

const LIBELLE_SITUATION: Record<string, string> = {
  etudiant: 'Étudiant',
  travailleur: 'Travailleur',
  autre: 'Autre',
}

export default async function PageFicheMembre({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{
    archivageRefuse?: string
    archivageRefuseAdministrateur?: string
    desarchivageRefuse?: string
  }>
}) {
  const profil = await exigerProfilActif()
  const { id } = await params
  const { archivageRefuse, archivageRefuseAdministrateur, desarchivageRefuse } = await searchParams
  const membre = await membreParId(id)
  if (!membre) {
    notFound()
  }

  const [
    roles,
    statuts,
    disciples,
    faiseur,
    dirigeant,
    peutEcrireStatuts,
    compteLie,
    compteurAel,
    seminaires,
  ] = await Promise.all([
    rolesDuProfil(profil.id),
    statutsDuMembre(membre.id),
    disciplesDe(membre.id),
    membre.faiseurDeDiscipleId
      ? membreBrefParId(membre.faiseurDeDiscipleId)
      : Promise.resolve(null),
    membre.dirigeantId ? membreBrefParId(membre.dirigeantId) : Promise.resolve(null),
    aAutoriteSur(membre.id),
    etatCompteLie(membre.id),
    compteurAelMembre(membre.id),
    seminairesAssistes(membre.id),
  ])
  const estAdmin = roles.includes('administrateur')

  const lignes: Array<[string, string | null]> = [
    ['Antenne', membre.antenneNom],
    ['Ville', membre.ville],
    ['Pays', membre.pays],
    ['Situation', membre.situation ? LIBELLE_SITUATION[membre.situation] : null],
    ["Domaine d'étude", membre.domaineEtude],
    ['Téléphone', membre.telephone],
    ['Contact', membre.emailContact],
    // Le TOTAL calculé (D4, D44), pas le seul report initial : `compteurAel` vaut
    // `null` si la ligne de la vue `compteurs_ael` n'est pas visible par ce compte —
    // en pratique jamais atteignable ici, puisque la vue part de `membres` et que
    // cette fiche est déjà visible par l'appelant (même politique de lecture). Le
    // repli existe quand même, plutôt que de crasher sur une garantie qu'aucune
    // preuve locale à ce fichier n'établit.
    ['Compteur AEL', compteurAel !== null ? String(compteurAel) : '—'],
  ]

  lignes.push(['Faiseur de disciple', libelleFiche(membre.faiseurDeDiscipleId, faiseur)])
  const nomDirigeant = libelleFiche(membre.dirigeantId, dirigeant)
  lignes.push([
    'Dirigeant',
    // `dirigeant_force` atteste seulement que la valeur n'a pas été saisie à la main —
    // rien de plus. « Calculé » affirmerait que c'est ce que le calcul rendrait
    // maintenant, ce que le commit 907bcf7 a jugé faux et corrigé sur l'écran de
    // rattachement (un dirigeant « calculé » peut devenir périmé sans réécriture).
    // On ne republie pas ce mensonge ici : l'absence de mention n'affirme rien, ce que
    // le booléen soutient réellement.
    nomDirigeant ? `${nomDirigeant}${membre.dirigeantForce ? ' (défini manuellement)' : ''}` : null,
  ])

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/membres" className="text-sm underline underline-offset-4">
        Retour à l&apos;annuaire
      </Link>

      <header className="mt-4 mb-8 flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            {membre.prenom} {membre.nom}
          </h1>
          {/*
            L'état vit en base et n'était affiché nulle part : une fiche archivée
            était indiscernable d'une fiche active, et un administrateur arrivant
            par un lien périmé pouvait la modifier en croyant suivre un membre actif.
          */}
          {membre.etat !== 'actif' ? (
            <p className="mt-1 text-sm text-amber-700">
              {membre.etat === 'archive'
                ? "Fiche archivée — elle ne figure plus dans l'annuaire."
                : 'Fiche en attente de validation.'}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-4">
          {estAdmin ? (
            <>
              <Link href={`/membres/${membre.id}/modifier`} className="text-sm underline underline-offset-4">
                Modifier
              </Link>
              {/*
                Pas de bouton d'archivage sur une fiche déjà archivée : l'action
                n'aurait aucun effet, et la proposer laisserait croire le contraire.
                À la place, un rétablissement : sur mobile, un archivage accidentel
                serait sinon définitif sans intervention en base, alors que la
                confirmation promet « rien n'est supprimé ».
              */}
              {membre.etat === 'actif' ? (
                <form action={archiverMembre}>
                  <input type="hidden" name="id" value={membre.id} />
                  <BoutonArchiver
                    nomComplet={`${membre.prenom} ${membre.nom}`}
                    archiver
                    compteLie={compteLie}
                  />
                </form>
              ) : null}
              {membre.etat === 'archive' ? (
                <form action={desarchiverMembre}>
                  <input type="hidden" name="id" value={membre.id} />
                  <BoutonArchiver
                    nomComplet={`${membre.prenom} ${membre.nom}`}
                    archiver={false}
                    compteLie={compteLie}
                  />
                </form>
              ) : null}
            </>
          ) : null}
        </div>
      </header>

      {archivageRefuse ? (
        <p role="alert" className="mb-6 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          Cette fiche ne peut pas être archivée : {archivageRefuse} en dépendent encore comme
          faiseur de disciple. Rattachez ces personnes à quelqu&apos;un d&apos;autre, puis
          recommencez.
        </p>
      ) : null}

      {archivageRefuseAdministrateur ? (
        <p role="alert" className="mb-6 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          Cette fiche ne peut pas être archivée : le compte qui lui est lié est le dernier
          administrateur actif de l&apos;application. Archiver cette fiche le désactiverait et
          laisserait l&apos;application sans administrateur. Donnez le rôle administrateur à
          quelqu&apos;un d&apos;autre, sur l&apos;écran des comptes, puis recommencez.
        </p>
      ) : null}

      {desarchivageRefuse ? (
        <p role="alert" className="mb-6 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          Cette fiche ne peut pas être rétablie : {desarchivageRefuse} est archivé. Rattachez
          cette fiche à un faiseur de disciple actif, ou rétablissez d&apos;abord{' '}
          {desarchivageRefuse}, puis recommencez.
        </p>
      ) : null}

      <dl className="divide-y divide-neutral-200">
        {lignes.map(([intitule, valeur]) => (
          <div key={intitule} className="flex justify-between gap-4 py-3">
            <dt className="text-sm text-neutral-500">{intitule}</dt>
            <dd className="text-sm">{valeur ?? '—'}</dd>
          </div>
        ))}
      </dl>

      <section className="mt-8">
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-medium">Statuts</h2>
          {/*
            « Gérer » promettrait un pouvoir que ce compte n'a pas : sans autorité sur
            ce membre, il atteint le même écran mais n'y trouve ni formulaire
            d'attribution ni bouton de retrait, seulement la consultation et le
            journal — c'est ce dernier qui décrit le mieux ce que l'écran lui apporte
            de plus que cette fiche.
          */}
          <Link href={`/membres/${membre.id}/statuts`} className="text-sm underline underline-offset-4">
            {peutEcrireStatuts ? 'Gérer' : 'Journal'}
          </Link>
        </div>
        {statuts.length === 0 ? (
          <p className="text-sm text-neutral-600">Aucun statut attribué.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {statuts.map((statut) => (
              <li
                key={statut.statutId}
                className="rounded-full border border-neutral-300 px-3 py-1 text-sm"
              >
                {statut.libelle}
                {statut.dateAcquisition ? (
                  <span className="text-neutral-500"> · {formaterDateSeule(statut.dateAcquisition)}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-medium">Séminaires assistés</h2>
        {/*
          Lue depuis la vue `seminaires_assistes` (D70, D71), la SEULE vue du projet en
          `security_invoker = false` : elle contourne délibérément la RLS de
          `participations` — OUVERTE au seul administrateur et modérateur (policy
          `participations_lecture`, `prive.est_moderateur_ou_admin()`), FERMÉE à tout
          compte ordinaire — pour rendre le seul FAIT de la participation lisible de tout
          compte actif (§4.4, D2, D16). Elle ne contourne PAS la RLS de `membres` —
          `prive.peut_lire_membre` (D72) la réimpose.

          L'HISTORIQUE DES CONVERTIS EST COMPRIS : la seconde branche de la vue projette les
          participations d'externes convertis sur `converti_en_membre_id`, résolu à la
          LECTURE. Aucune écriture passée n'a bougé (D69) — repointer
          `participations.membre_id` effacerait le fait que cette personne est entrée par un
          séminaire, ce que D13 veut précisément mesurer.

          SI CETTE SECTION EST VIDE SUR TOUTES LES FICHES, la première chose à vérifier est
          `reloptions` de la vue : `security_invoker = true` la rendrait silencieusement
          vide pour tout compte ordinaire, sans la moindre erreur (piège n°8 du design).
          AUCUN DÉSIR N'EST AFFICHÉ ICI, et la vue n'en expose aucun (D73) : ils restent
          réservés à l'administrateur et au modérateur, sur l'écran de l'évènement.
        */}
        {seminaires.length === 0 ? (
          <p className="text-sm text-neutral-600">Aucun séminaire enregistré.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {seminaires.map((seminaire) => (
              <li
                key={seminaire.evenementId}
                className="rounded-full border border-neutral-300 px-3 py-1 text-sm"
              >
                <Link href={`/evenements/${seminaire.evenementId}`} className="underline underline-offset-4">
                  {seminaire.titre}
                </Link>
                <span className="text-neutral-500">
                  {' '}
                  · {seminaire.type} · {formaterDateSeule(seminaire.dateDebut)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-medium">Disciples actifs</h2>
          {estAdmin ? (
            <Link
              href={`/membres/${membre.id}/arbre`}
              className="text-sm underline underline-offset-4"
            >
              Rattacher
            </Link>
          ) : null}
        </div>
        {/*
          `disciplesDe` ne rend que les disciples encore ACTIFS (voir arbre.ts) : un
          membre peut avoir eu des disciples, tous archivés depuis, et se retrouver ici
          avec une liste vide. Sans qualificatif, « Aucun disciple rattaché » lirait
          comme « n'en a jamais eu », ce que la donnée ne dit pas.
        */}
        {disciples.length === 0 ? (
          <p className="text-sm text-neutral-600">Aucun disciple actif rattaché.</p>
        ) : (
          <ul className="divide-y divide-neutral-200">
            {disciples.map((disciple) => (
              <li key={disciple.id}>
                <Link href={`/membres/${disciple.id}`} className="block py-2 text-sm">
                  {disciple.prenom} {disciple.nom}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
