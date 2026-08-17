import Link from 'next/link'
import { seDeconnecter } from '@/app/connexion/actions'
import { rolesDuProfil } from '@/lib/donnees/profils'
import { exigerProfilActif } from '@/lib/securite/garde'
import { EmblemeMission } from '@/composants/identite/embleme-mission'
import { Bouton, CLASSES_VARIANTE } from '@/composants/ui/bouton'
import { EnTetePage } from '@/composants/ui/en-tete-page'
import { LigneListe, Liste } from '@/composants/ui/ligne-liste'

export default async function PageTableauDeBord() {
  const profil = await exigerProfilActif()
  const roles = await rolesDuProfil(profil.id)
  const estAdmin = roles.includes('administrateur')
  const estModerateur = roles.includes('moderateur')

  return (
    <main className="mx-auto w-full max-w-5xl px-esp-6 py-esp-10">
      <section className="hero-mission mb-esp-8" aria-labelledby="mission-titre">
        <div className="hero-mission-contenu">
          <p className="surtitre-mission">Notre feuille de route · La Bible</p>
          <h1 id="mission-titre" className="titre-mission">
            Gagner les âmes. Former. Envoyer.
          </h1>
          <p className="promesse-mission">
            Un mouvement évangélique de bâtisseurs mobilisés pour porter l&apos;Évangile de
            Jésus dans toutes les nations.
          </p>
        </div>
        <EmblemeMission />
      </section>
      <div className="panneau-mission">
        {/*
        LE SEUL ÉCRAN QUI AFFICHE L'ÉTAT DE SESSION (Task 24) — c'est le hub, pas une
        destination de retour : `EnTetePage` SANS `retour`.
      */}
        <EnTetePage
        titre="Pilotage de la mission"
        // L'état de session devient la porte d'entrée du profil (phase 7) : c'est le seul
        // endroit de l'application qui nomme déjà le compte connecté, et le lire donne
        // naturellement envie d'aller voir ce qu'il contient.
        soustitre={
          <Link href="/profil" className={CLASSES_VARIANTE.lien}>
            {`Connecté en tant que ${profil.nomAffichage} (${profil.identifiant})`}
          </Link>
        }
        action={
          <form action={seDeconnecter}>
            <Bouton type="submit" variante="secondaire">
              Se déconnecter
            </Bouton>
          </form>
        }
      />

      {/*
        Les libellés ne changent pas d'un octet (D117) : un modérateur ne voit toujours
        pas /antennes, /statuts, /comptes, /tokens.
      */}
        <Liste variante="navigation">
        {/*
          LES DEUX ÉCRANS PERSONNELS EN TÊTE, avant les écrans collectifs (phase 7) : c'est
          par eux que la plupart des comptes entrent, et ils sont visibles de TOUT compte
          actif — aucune condition de rôle, ce ne sont pas des écrans d'administration.
        */}
        <LigneListe lien="/mes-membres" principal="Mes membres" />
        <LigneListe lien="/profil" principal="Mon profil" />
        <LigneListe lien="/membres" principal="Consulter l'annuaire" />
        <LigneListe lien="/arborescence" principal="Parcourir l'arborescence" />
        <LigneListe lien="/demandes/nouvelle" principal="Proposer une personne à suivre" />
        <LigneListe lien="/demandes" principal="Voir les demandes" />
        <LigneListe lien="/evenements" principal="Voir les évènements" />
        {estAdmin || estModerateur ? <LigneListe lien="/ael/seances" principal="Gérer l'AEL" /> : null}
        {estAdmin || estModerateur ? (
          <LigneListe lien="/evenements/a-traiter" principal="Participants à traiter" />
        ) : null}
        {estAdmin ? <LigneListe lien="/antennes" principal="Gérer les antennes" /> : null}
        {estAdmin ? <LigneListe lien="/statuts" principal="Gérer les statuts" /> : null}
        {estAdmin ? <LigneListe lien="/comptes" principal="Gérer les comptes" /> : null}
        {estAdmin ? (
          <LigneListe lien="/tokens" principal="Générer des tokens d'inscription" />
        ) : null}
        </Liste>
      </div>
    </main>
  )
}
