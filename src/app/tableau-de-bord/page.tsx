import Link from 'next/link'
import { seDeconnecter } from '@/app/connexion/actions'
import { rolesDuProfil } from '@/lib/donnees/profils'
import { exigerProfilActif } from '@/lib/securite/garde'

export default async function PageTableauDeBord() {
  const profil = await exigerProfilActif()
  const roles = await rolesDuProfil(profil.id)
  const estAdmin = roles.includes('administrateur')
  const estModerateur = roles.includes('moderateur')

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-10 flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Suivi Asonkeng</h1>
          <p className="text-sm text-neutral-500">
            Connecté en tant que {profil.nomAffichage} ({profil.identifiant})
          </p>
        </div>
        <form action={seDeconnecter}>
          <button type="submit" className="text-sm underline underline-offset-4">
            Se déconnecter
          </button>
        </form>
      </header>

      <div className="flex flex-wrap gap-6">
        <Link href="/membres" className="underline underline-offset-4">
          Consulter l&apos;annuaire
        </Link>
        <Link href="/demandes/nouvelle" className="underline underline-offset-4">
          Proposer une personne à suivre
        </Link>
        <Link href="/demandes" className="underline underline-offset-4">
          Voir les demandes
        </Link>
        <Link href="/evenements" className="underline underline-offset-4">
          Voir les évènements
        </Link>
        {estAdmin || estModerateur ? (
          <Link href="/ael/seances" className="underline underline-offset-4">
            Gérer l&apos;AEL
          </Link>
        ) : null}
        {estAdmin || estModerateur ? (
          <Link href="/evenements/a-traiter" className="underline underline-offset-4">
            Participants à traiter
          </Link>
        ) : null}
        {estAdmin ? (
          <Link href="/antennes" className="underline underline-offset-4">
            Gérer les antennes
          </Link>
        ) : null}
        {estAdmin ? (
          <Link href="/statuts" className="underline underline-offset-4">
            Gérer les statuts
          </Link>
        ) : null}
        {estAdmin ? (
          <Link href="/comptes" className="underline underline-offset-4">
            Gérer les comptes
          </Link>
        ) : null}
        {estAdmin ? (
          <Link href="/tokens" className="underline underline-offset-4">
            Générer des tokens d&apos;inscription
          </Link>
        ) : null}
      </div>
    </main>
  )
}
