import Link from 'next/link'
import { listerComptes } from '@/lib/donnees/comptes'
import { exigerAdministrateur } from '@/lib/securite/garde'

const LIBELLE_ROLE: Record<string, string> = {
  administrateur: 'Administrateur',
  moderateur: 'Modérateur',
}

export default async function PageComptes() {
  await exigerAdministrateur()
  const comptes = await listerComptes()

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <Link href="/tableau-de-bord" className="text-sm underline underline-offset-4">
        Retour au tableau de bord
      </Link>
      <h1 className="mt-4 mb-2 text-2xl font-semibold">Comptes</h1>
      <p className="mb-8 text-sm text-neutral-500">
        {comptes.length} compte{comptes.length > 1 ? 's' : ''}
      </p>

      <ul className="divide-y divide-neutral-200">
        {comptes.map((compte) => (
          <li key={compte.id} className="py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium">{compte.nomAffichage}</span>
              <span className="text-sm text-neutral-500">{compte.identifiant}</span>
            </div>
            <p className="mt-1 text-sm text-neutral-600">
              {compte.actif ? 'Actif' : 'Désactivé'}
              {' · '}
              {compte.roles.length > 0
                ? compte.roles.map((role) => LIBELLE_ROLE[role] ?? role).join(', ')
                : 'Utilisateur'}
              {' · '}
              {compte.membreNom ? `Fiche : ${compte.membreNom}` : 'Aucune fiche liée'}
              {compte.estRacine ? ' · Compte racine' : ''}
            </p>
          </li>
        ))}
      </ul>
    </main>
  )
}
