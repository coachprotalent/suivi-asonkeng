import Link from 'next/link'
import { seDeconnecter } from '@/app/connexion/actions'
import { libelleFiche } from '@/lib/domaine/membre'
import { compteurAelMembre } from '@/lib/donnees/ael'
import { membreBrefParId, membreParId } from '@/lib/donnees/membres'
import { rolesDuProfil, type RoleApp } from '@/lib/donnees/profils'
import { statutsDuMembre } from '@/lib/donnees/statuts'
import { formaterDateSeule } from '@/lib/format/date'
import { exigerProfilActif } from '@/lib/securite/garde'
import { Bouton, CLASSES_VARIANTE } from '@/composants/ui/bouton'
import { Carte } from '@/composants/ui/carte'
import { EnTetePage } from '@/composants/ui/en-tete-page'
import { LigneListe, Liste } from '@/composants/ui/ligne-liste'
import { FormulaireCoordonnees } from './formulaire-coordonnees'

const LIBELLE_SITUATION: Record<string, string> = {
  etudiant: 'Étudiant',
  travailleur: 'Travailleur',
  autre: 'Autre',
}

const LIBELLE_ROLE: Record<RoleApp, string> = {
  administrateur: 'Administrateur',
  moderateur: 'Modérateur',
}

/**
 * La page de profil de chaque compte (phase 7).
 *
 * Gardée par `exigerProfilActif` et par lui seul : c'est l'écran de TOUT compte actif, pas
 * un écran d'administration. Chacun n'y voit que son propre profil — non par un filtre, mais
 * parce que la page ne lit QUE la session : aucun identifiant ne vient de l'URL, il n'y a
 * donc aucune fiche d'autrui à atteindre depuis ici.
 */
export default async function PageProfil({
  searchParams,
}: {
  searchParams: Promise<{ enregistre?: string }>
}) {
  const profil = await exigerProfilActif()
  const { enregistre } = await searchParams
  const roles = await rolesDuProfil(profil.id)

  // La fiche n'est lue QUE si le compte en a une (D139). Cette lecture-ci est en série :
  // les suivantes dépendent de ce qu'elle rend, et il n'y a rien à paralléliser avant elle.
  const membre = profil.membreId ? await membreParId(profil.membreId) : null
  // `Promise.all` pour les cinq suivantes : cinq allers-retours séquentiels seraient payés à
  // chaque affichage d'un écran de consultation.
  const [faiseur, dirigeant, contact, statuts, compteurAel] = membre
    ? await Promise.all([
        membre.faiseurDeDiscipleId
          ? membreBrefParId(membre.faiseurDeDiscipleId)
          : Promise.resolve(null),
        membre.dirigeantId ? membreBrefParId(membre.dirigeantId) : Promise.resolve(null),
        membre.contactId ? membreBrefParId(membre.contactId) : Promise.resolve(null),
        statutsDuMembre(membre.id),
        compteurAelMembre(membre.id),
      ])
    : [null, null, null, [], null]

  const lignesCompte: Array<[string, string]> = [
    ['Identifiant de connexion', profil.identifiant],
    ["Nom d'affichage", profil.nomAffichage],
    [
      'Rôles',
      // « Utilisateur » n'est pas stocké dans `roles_profil` : c'est le socle implicite de
      // tout compte actif. Afficher « aucun » serait faux — ce compte a bien des droits.
      roles.length === 0 ? 'Utilisateur' : roles.map((role) => LIBELLE_ROLE[role]).join(', '),
    ],
    ['Compte créé le', formaterDateSeule(profil.creeLe)],
  ]

  return (
    <main className="mx-auto w-full max-w-3xl px-esp-6 py-esp-10">
      <EnTetePage
        retour={{ href: '/tableau-de-bord', libelle: 'Retour au pilotage' }}
        titre="Mon profil"
        soustitre={`${profil.nomAffichage} (${profil.identifiant})`}
        action={
          <form action={seDeconnecter}>
            <Bouton type="submit" variante="secondaire">
              Se déconnecter
            </Bouton>
          </form>
        }
      />

      {enregistre ? (
        <div className="mb-esp-6">
          <Carte ton="succes" role="status">
            Vos coordonnées ont été enregistrées.
          </Carte>
        </div>
      ) : null}

      <section className="mb-esp-8">
        <h2 className="mb-esp-3 text-section">Mon compte</h2>
        {/*
          LE NOM D'AFFICHAGE EST AFFICHÉ, JAMAIS ÉDITABLE ICI (D138), et l'absence de champ
          est ÉNONCÉE par la phrase sous la liste — une absence muette se lirait comme un
          oubli. `journal_statuts.par_nom_affichage` fige le nom de l'auteur au moment de
          chaque écriture (migration 20260813160000) : le laisser libre permettrait de signer
          ses futurs mouvements du nom de quelqu'un d'autre. Décision de l'utilisateur, prise
          après que ce risque lui a été exposé.
        */}
        <dl className="divide-y divide-filet">
          {lignesCompte.map(([intitule, valeur]) => (
            <div key={intitule} className="flex justify-between gap-esp-4 py-esp-3">
              <dt className="text-petit text-encre-attenuee">{intitule}</dt>
              <dd className="text-corps">{valeur}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-esp-3 text-petit text-encre-attenuee">
          Votre identifiant, votre nom d&apos;affichage et vos rôles sont gérés par
          l&apos;administrateur.
        </p>
      </section>

      {/*
        D139 — UN COMPTE SANS FICHE MEMBRE VOIT UN ENCART QUI LE DIT, ET AUCUN FORMULAIRE.
        C'est le cas du compte racine (contrainte `profils_racine_sans_membre`) et de tout
        compte qu'un administrateur n'a pas encore relié à une personne. Une page à moitié
        vide laisserait croire à une fiche vide plutôt qu'à une absence de fiche — et la
        personne chercherait à remplir des champs qui n'existent pas.
      */}
      {!membre ? (
        <Carte ton="avertissement">
          Ce compte n&apos;est relié à aucune fiche de suivi. Il n&apos;y a donc pas de
          coordonnées à afficher ni à modifier ici. Demandez à un administrateur de relier
          votre compte à votre fiche.
        </Carte>
      ) : (
        <>
          <section className="mb-esp-8">
            <div className="mb-esp-3 flex items-baseline justify-between gap-esp-4">
              <h2 className="text-section">Ma fiche</h2>
              <Link href={`/membres/${membre.id}`} className={CLASSES_VARIANTE.lien}>
                Voir la fiche complète
              </Link>
            </div>

            <dl className="divide-y divide-filet">
              <div className="flex justify-between gap-esp-4 py-esp-3">
                <dt className="text-petit text-encre-attenuee">Antenne</dt>
                <dd className="text-corps">{membre.antenneNom ?? '—'}</dd>
              </div>
              <div className="flex justify-between gap-esp-4 py-esp-3">
                <dt className="text-petit text-encre-attenuee">Situation</dt>
                <dd className="text-corps">
                  {membre.situation ? LIBELLE_SITUATION[membre.situation] : '—'}
                </dd>
              </div>
              <div className="flex justify-between gap-esp-4 py-esp-3">
                <dt className="text-petit text-encre-attenuee">Compteur AEL</dt>
                {/*
                  Le TOTAL calculé (D4, D44), pas le seul report initial. `null` n'est pas
                  zéro : il signale que la ligne de la vue `compteurs_ael` n'est pas visible,
                  et écrire « 0 » ferait dire à l'écran « aucun AEL suivi ».
                */}
                <dd className="text-corps">
                  {compteurAel !== null ? String(compteurAel) : '—'}
                </dd>
              </div>

              {/*
                ⚠️ MARQUE DE FILIATION (D106) — les DEUX relations de discipulat de cette
                personne, vues depuis son propre profil. Le CONTACT, juste en dessous, ne la
                porte PAS (D134) : ce n'est pas une relation de discipulat, et lui donner le
                rail ferait de la marque un ornement de « lien vers une autre fiche ».
              */}
              <div className="rail-filiation flex justify-between gap-esp-4 py-esp-3">
                <dt className="text-petit text-encre-attenuee">Mon faiseur de disciple</dt>
                <dd className="text-corps">
                  {libelleFiche(membre.faiseurDeDiscipleId, faiseur) ?? '—'}
                </dd>
              </div>
              <div className="rail-filiation flex justify-between gap-esp-4 py-esp-3">
                <dt className="text-petit text-encre-attenuee">Mon dirigeant</dt>
                <dd className="text-corps">{libelleFiche(membre.dirigeantId, dirigeant) ?? '—'}</dd>
              </div>
              <div className="flex justify-between gap-esp-4 py-esp-3">
                <dt className="text-petit text-encre-attenuee">Mon contact</dt>
                <dd className="text-corps">{libelleFiche(membre.contactId, contact) ?? '—'}</dd>
              </div>
            </dl>

            <h3 className="mb-esp-2 mt-esp-6 text-nom">Mes statuts</h3>
            {statuts.length === 0 ? (
              <p className="text-petit text-encre-attenuee">Aucun statut attribué.</p>
            ) : (
              // ⚠️ PUCE DE CATALOGUE, PAS UN `EtatBadge` (C4) : un statut de catalogue ne
              // porte aucune couleur d'état, et lui en attribuer une inventerait une
              // information que la donnée n'a pas.
              <ul className="flex flex-wrap gap-esp-2">
                {statuts.map((statut) => (
                  <li
                    key={statut.statutId}
                    className="rounded-full border border-bord-carte px-esp-3 py-esp-1 text-petit"
                  >
                    {statut.libelle}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mb-esp-8">
            <h2 className="mb-esp-3 text-section">Mes coordonnées</h2>
            <p className="mb-esp-4 text-petit text-encre-attenuee">
              Ces six informations sont les seules que vous pouvez modifier vous-même. Votre
              nom, votre antenne et votre place dans l&apos;arbre relèvent de
              l&apos;administrateur.
            </p>
            <FormulaireCoordonnees membre={membre} />
          </section>
        </>
      )}

      <section>
        <h2 className="mb-esp-3 text-section">Mon compte au quotidien</h2>
        <Liste variante="navigation">
          <LigneListe lien="/mes-membres" principal="Mes membres" />
          <LigneListe lien="/changer-mot-de-passe" principal="Changer mon mot de passe" />
          <LigneListe lien="/notifications" principal="Mes notifications" />
        </Liste>
      </section>
    </main>
  )
}
