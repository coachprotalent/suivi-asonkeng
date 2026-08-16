import { seDeconnecter } from '@/app/connexion/actions'
import { rolesDuProfil } from '@/lib/donnees/profils'
import { exigerProfilActif } from '@/lib/securite/garde'
import { Bouton } from '@/composants/ui/bouton'
import { EnTetePage } from '@/composants/ui/en-tete-page'
import { LigneListe, Liste } from '@/composants/ui/ligne-liste'

export default async function PageTableauDeBord() {
  const profil = await exigerProfilActif()
  const roles = await rolesDuProfil(profil.id)
  const estAdmin = roles.includes('administrateur')
  const estModerateur = roles.includes('moderateur')

  return (
    <main className="mx-auto max-w-3xl px-esp-6 py-esp-10">
      {/*
        LE SEUL ÉCRAN QUI AFFICHE L'ÉTAT DE SESSION (Task 24) — c'est le hub, pas une
        destination de retour : `EnTetePage` SANS `retour`.
      */}
      <EnTetePage
        titre="Suivi Asonkeng"
        soustitre={`Connecté en tant que ${profil.nomAffichage} (${profil.identifiant})`}
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
      <Liste>
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
    </main>
  )
}
