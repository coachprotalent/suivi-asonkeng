import Link from 'next/link'
import { notFound } from 'next/navigation'
import { compteurAelMembre } from '@/lib/donnees/ael'
import { libelleFiche, type EtatMembre } from '@/lib/domaine/membre'
import { disciplesDe } from '@/lib/donnees/arbre'
import { etatCompteLie } from '@/lib/donnees/comptes'
import { seminairesAssistes } from '@/lib/donnees/evenements'
import { membreBrefParId, membreParId } from '@/lib/donnees/membres'
import { rolesDuProfil } from '@/lib/donnees/profils'
import { statutsDuMembre } from '@/lib/donnees/statuts'
import { formaterDateSeule } from '@/lib/format/date'
import { aAutoriteSur, exigerProfilActif } from '@/lib/securite/garde'
import { CLASSES_VARIANTE } from '@/composants/ui/bouton'
import { Carte } from '@/composants/ui/carte'
import { EnTetePage } from '@/composants/ui/en-tete-page'
import { EtatBadge, type TonEtat } from '@/composants/ui/etat-badge'
import { LigneListe, Liste } from '@/composants/ui/ligne-liste'
import { archiverMembre, desarchiverMembre } from '../actions'
import { BoutonArchiver } from './bouton-archiver'

const LIBELLE_SITUATION: Record<string, string> = {
  etudiant: 'Étudiant',
  travailleur: 'Travailleur',
  autre: 'Autre',
}

/** `EtatBadge` sert à `membre.etat`, et à lui seul (D126). */
const TON_ETAT_MEMBRE: Record<EtatMembre, TonEtat> = {
  actif: 'acquis',
  en_attente: 'attente',
  archive: 'refus',
}

const LIBELLE_ETAT_MEMBRE: Record<EtatMembre, string> = {
  actif: 'Actif',
  en_attente: 'En attente',
  archive: 'Archivé',
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

  const libelleFaiseur = libelleFiche(membre.faiseurDeDiscipleId, faiseur)
  const nomDirigeant = libelleFiche(membre.dirigeantId, dirigeant)

  return (
    <main className="mx-auto max-w-3xl px-esp-6 py-esp-10">
      <EnTetePage
        retour={{ href: '/membres', libelle: "Retour à l'annuaire" }}
        titre={`${membre.prenom} ${membre.nom}`}
        soustitre={
          <span className="inline-flex flex-wrap items-center gap-esp-2">
            <EtatBadge ton={TON_ETAT_MEMBRE[membre.etat]} libelle={LIBELLE_ETAT_MEMBRE[membre.etat]} />
            {/*
              L'état vit en base et n'était affiché nulle part : une fiche archivée
              était indiscernable d'une fiche active, et un administrateur arrivant
              par un lien périmé pouvait la modifier en croyant suivre un membre actif.
            */}
            {membre.etat !== 'actif' ? (
              <span>
                {membre.etat === 'archive'
                  ? "Fiche archivée — elle ne figure plus dans l'annuaire."
                  : 'Fiche en attente de validation.'}
              </span>
            ) : null}
          </span>
        }
        action={
          estAdmin ? (
            <div className="flex items-center gap-esp-4">
              <Link href={`/membres/${membre.id}/modifier`} className={CLASSES_VARIANTE.lien}>
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
            </div>
          ) : null
        }
      />

      {archivageRefuse ? (
        <div className="mb-esp-6">
          <Carte ton="avertissement" role="alert">
            Cette fiche ne peut pas être archivée : {archivageRefuse} en dépendent encore comme
            faiseur de disciple. Rattachez ces personnes à quelqu&apos;un d&apos;autre, puis
            recommencez.
          </Carte>
        </div>
      ) : null}

      {archivageRefuseAdministrateur ? (
        <div className="mb-esp-6">
          <Carte ton="avertissement" role="alert">
            Cette fiche ne peut pas être archivée : le compte qui lui est lié est le dernier
            administrateur actif de l&apos;application. Archiver cette fiche le désactiverait et
            laisserait l&apos;application sans administrateur. Donnez le rôle administrateur à
            quelqu&apos;un d&apos;autre, sur l&apos;écran des comptes, puis recommencez.
          </Carte>
        </div>
      ) : null}

      {desarchivageRefuse ? (
        <div className="mb-esp-6">
          <Carte ton="avertissement" role="alert">
            Cette fiche ne peut pas être rétablie : {desarchivageRefuse} est archivé. Rattachez
            cette fiche à un faiseur de disciple actif, ou rétablissez d&apos;abord{' '}
            {desarchivageRefuse}, puis recommencez.
          </Carte>
        </div>
      ) : null}

      <dl className="divide-y divide-filet">
        {lignes.map(([intitule, valeur]) => (
          <div key={intitule} className="flex justify-between gap-esp-4 py-esp-3">
            <dt className="text-petit text-encre-attenuee">{intitule}</dt>
            <dd className="text-corps">{valeur ?? '—'}</dd>
          </div>
        ))}

        {/*
          ⚠️ MARQUE DE FILIATION (D106) — l'un des trois seuls emplacements légitimes de
          cette fiche (voir globals.css) : c'est LA relation de discipulat de cette
          personne. NULLE PART ailleurs sur ce `<dl>` — Antenne, Ville et Compteur AEL ne
          sont pas des relations.
        */}
        <div className="rail-filiation flex justify-between gap-esp-4 py-esp-3">
          <dt className="text-petit text-encre-attenuee">Faiseur de disciple</dt>
          <dd className="text-corps">{libelleFaiseur ?? '—'}</dd>
        </div>

        {/*
          `dirigeant_force` atteste seulement que la valeur n'a pas été saisie à la main —
          rien de plus. « Calculé » affirmerait que c'est ce que le calcul rendrait
          maintenant, ce que le commit 907bcf7 a jugé faux et corrigé sur l'écran de
          rattachement (un dirigeant « calculé » peut devenir périmé sans réécriture).
          On ne republie pas ce mensonge ici : l'absence de mention n'affirme rien, ce que
          le booléen soutient réellement.

          ⚠️ MARQUE DE FILIATION (D106), relation DÉRIVÉE de la précédente
          (`proposerDirigeant`) — deuxième des trois seuls emplacements légitimes.
        */}
        <div className="rail-filiation flex justify-between gap-esp-4 py-esp-3">
          <dt className="text-petit text-encre-attenuee">Dirigeant</dt>
          <dd className="text-corps">
            {nomDirigeant ? `${nomDirigeant}${membre.dirigeantForce ? ' (défini manuellement)' : ''}` : '—'}
          </dd>
        </div>
      </dl>

      <section className="mt-esp-8">
        <div className="mb-esp-3 flex items-baseline justify-between gap-esp-4">
          <h2 className="text-section">Statuts</h2>
          {/*
            « Gérer » promettrait un pouvoir que ce compte n'a pas : sans autorité sur
            ce membre, il atteint le même écran mais n'y trouve ni formulaire
            d'attribution ni bouton de retrait, seulement la consultation et le
            journal — c'est ce dernier qui décrit le mieux ce que l'écran lui apporte
            de plus que cette fiche.
          */}
          <Link href={`/membres/${membre.id}/statuts`} className={CLASSES_VARIANTE.lien}>
            {peutEcrireStatuts ? 'Gérer' : 'Journal'}
          </Link>
        </div>
        {statuts.length === 0 ? (
          <p className="text-petit text-encre-attenuee">Aucun statut attribué.</p>
        ) : (
          // ⚠️ PUCE DE CATALOGUE, PAS UN `EtatBadge` (voir C4) : `rounded-full border
          // border-bord-carte`, SANS couleur. Un `EtatBadge` attribuerait une couleur
          // d'état à un statut de catalogue, que la donnée ne porte pas.
          <ul className="flex flex-wrap gap-esp-2">
            {statuts.map((statut) => (
              <li
                key={statut.statutId}
                className="rounded-full border border-bord-carte px-esp-3 py-esp-1 text-petit"
              >
                {statut.libelle}
                {statut.dateAcquisition ? (
                  <span className="text-encre-attenuee"> · {formaterDateSeule(statut.dateAcquisition)}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-esp-8">
        <h2 className="mb-esp-3 text-section">Séminaires assistés</h2>
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

          ⚠️ PAS DE MARQUE DE FILIATION ICI (piège n°6) : un séminaire n'est pas une
          relation de discipulat.
        */}
        {seminaires.length === 0 ? (
          <p className="text-petit text-encre-attenuee">Aucun séminaire enregistré.</p>
        ) : (
          // ⚠️ PUCE DE CATALOGUE, PAS UN `EtatBadge` : même raison que ci-dessus.
          <ul className="flex flex-wrap gap-esp-2">
            {seminaires.map((seminaire) => (
              <li
                key={seminaire.evenementId}
                className="rounded-full border border-bord-carte px-esp-3 py-esp-1 text-petit"
              >
                <Link
                  href={`/evenements/${seminaire.evenementId}`}
                  className="text-action underline underline-offset-4"
                >
                  {seminaire.titre}
                </Link>
                <span className="text-encre-attenuee">
                  {' '}
                  · {seminaire.type} · {formaterDateSeule(seminaire.dateDebut)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-esp-8">
        <div className="mb-esp-3 flex items-baseline justify-between gap-esp-4">
          <h2 className="text-section">Disciples actifs</h2>
          <div className="flex items-center gap-esp-4">
            <Link href="/arborescence" className={CLASSES_VARIANTE.lien}>
              Arborescence
            </Link>
            {estAdmin ? (
              <Link href={`/membres/${membre.id}/arbre`} className={CLASSES_VARIANTE.lien}>
                Rattacher
              </Link>
            ) : null}
          </div>
        </div>
        {/*
          `disciplesDe` ne rend que les disciples encore ACTIFS (voir arbre.ts) : un
          membre peut avoir eu des disciples, tous archivés depuis, et se retrouver ici
          avec une liste vide. Sans qualificatif, « Aucun disciple rattaché » lirait
          comme « n'en a jamais eu », ce que la donnée ne dit pas.

          ⚠️ MARQUE DE FILIATION (D106) — troisième et dernier des trois seuls
          emplacements légitimes de cette fiche : la relation de discipulat, vue depuis
          l'autre bout.
        */}
        {disciples.length === 0 ? (
          <p className="text-petit text-encre-attenuee">Aucun disciple actif rattaché.</p>
        ) : (
          <Liste>
            {disciples.map((disciple) => (
              <LigneListe
                key={disciple.id}
                lien={`/membres/${disciple.id}`}
                principal={`${disciple.prenom} ${disciple.nom}`}
                rail
              />
            ))}
          </Liste>
        )}
      </section>
    </main>
  )
}
