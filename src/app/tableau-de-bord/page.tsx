import { redirect } from 'next/navigation'
import { seDeconnecter } from '@/app/connexion/actions'
import { profilCourant } from '@/lib/donnees/profils'

export default async function PageTableauDeBord() {
  const profil = await profilCourant()
  if (!profil) {
    // Vers /deconnexion et non /connexion : le jeton peut encore être valide alors
    // que le profil est absent ou le compte désactivé. Rediriger vers /connexion
    // ferait boucler le middleware indéfiniment. La route de déconnexion efface la
    // session, ce qu'un composant serveur ne peut pas faire pendant son rendu.
    redirect('/deconnexion')
  }

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

      <p className="text-neutral-600">
        Le socle est en place. Les membres, les statuts et l&apos;arborescence arrivent en phase 1.
      </p>
    </main>
  )
}
