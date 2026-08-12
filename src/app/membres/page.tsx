import Link from 'next/link'
import { redirect } from 'next/navigation'
import { listerAntennes } from '@/lib/donnees/antennes'
import { listerMembres, TAILLE_PAGE_ANNUAIRE } from '@/lib/donnees/membres'
import { rolesDuProfil } from '@/lib/donnees/profils'
import { exigerProfilActif } from '@/lib/securite/garde'

const LIBELLE_SITUATION: Record<string, string> = {
  etudiant: 'Étudiant',
  travailleur: 'Travailleur',
  autre: 'Autre',
}

export default async function PageAnnuaire({
  searchParams,
}: {
  searchParams: Promise<{ recherche?: string; antenne?: string; page?: string }>
}) {
  const profil = await exigerProfilActif()
  const parametres = await searchParams

  // Le filtre vient de l'adresse, donc du client. Une valeur qui n'est pas un
  // identifiant ferait échouer la requête sur une colonne `uuid` — un signet périmé
  // suffit. On l'ignore plutôt que de faire tomber l'écran.
  const antenneFiltre = /^[0-9a-f-]{36}$/i.test(parametres.antenne ?? '')
    ? parametres.antenne
    : undefined

  // Même prudence que pour le filtre d'antenne : la valeur vient de l'adresse, donc du
  // client. Une page non numérique ou négative est ramenée à 1 plutôt que de faire
  // tomber l'écran.
  const pageDemandee = Number.parseInt(parametres.page ?? '1', 10)
  const page = Number.isFinite(pageDemandee) && pageDemandee > 0 ? pageDemandee : 1

  const [{ membres, total }, antennes, roles] = await Promise.all([
    listerMembres({ recherche: parametres.recherche, antenneId: antenneFiltre, page }),
    listerAntennes(),
    rolesDuProfil(profil.id),
  ])
  const estAdmin = roles.includes('administrateur')
  const pages = Math.max(1, Math.ceil(total / TAILLE_PAGE_ANNUAIRE))

  function lienPage(numero: number): string {
    const params = new URLSearchParams()
    if (parametres.recherche) params.set('recherche', parametres.recherche)
    if (antenneFiltre) params.set('antenne', antenneFiltre)
    params.set('page', String(numero))
    return `/membres?${params.toString()}`
  }

  // Une adresse pointant au-delà de la dernière page réelle est un signet périmé
  // (ou un résultat qui a rétréci depuis) : sans ce garde, l'en-tête affichait
  // « N membres · page 99 sur 2 » pendant que le corps affirmait qu'aucun membre
  // ne correspond — deux vérités contradictoires sur le même écran. On corrige
  // l'adresse vers la dernière page réelle plutôt que de laisser tenir ce mensonge.
  // Pas de boucle possible : `pages` vaut toujours au moins 1, et la cible de la
  // redirection est `pages` lui-même, donc la page rechargée aura page === pages,
  // qui ne redéclenche pas la condition `page > pages`.
  // Hors de tout `try` : `redirect()` lève une exception de contrôle Next.js que
  // ce fichier ne doit pas intercepter (aucun `try` ici de toute façon — vérifié).
  if (page > pages) {
    redirect(lienPage(pages))
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <Link href="/tableau-de-bord" className="text-sm underline underline-offset-4">
        Retour au tableau de bord
      </Link>
      <header className="mt-4 mb-8 flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Annuaire</h1>
          <p className="text-sm text-neutral-500">
            {total} membre{total > 1 ? 's' : ''}
            {pages > 1 ? ` · page ${page} sur ${pages}` : ''}
          </p>
        </div>
        {estAdmin ? (
          <Link
            href="/membres/nouveau"
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
          >
            Nouveau membre
          </Link>
        ) : null}
      </header>

      <form className="mb-8 flex flex-wrap gap-3" method="get">
        <input
          name="recherche"
          type="search"
          defaultValue={parametres.recherche ?? ''}
          placeholder="Nom, prénom ou ville"
          aria-label="Rechercher"
          className="min-w-48 flex-1 rounded-md border border-neutral-300 px-3 py-2"
        />
        <select
          name="antenne"
          defaultValue={antenneFiltre ?? ''}
          aria-label="Antenne"
          className="rounded-md border border-neutral-300 px-3 py-2"
        >
          <option value="">Toutes les antennes</option>
          {antennes.map((antenne) => (
            <option key={antenne.id} value={antenne.id}>
              {antenne.nom}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-md border border-neutral-300 px-4 py-2">
          Filtrer
        </button>
      </form>

      {membres.length === 0 ? (
        <p className="text-neutral-600">Aucun membre ne correspond à cette recherche.</p>
      ) : (
        <ul className="divide-y divide-neutral-200">
          {membres.map((membre) => (
            <li key={membre.id}>
              <Link href={`/membres/${membre.id}`} className="flex justify-between gap-4 py-3">
                <span className="font-medium">
                  {membre.prenom} {membre.nom}
                </span>
                <span className="text-sm text-neutral-500">
                  {[membre.antenneNom, membre.ville, membre.situation ? LIBELLE_SITUATION[membre.situation] : null]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 ? (
        <nav aria-label="Pagination" className="mt-8 flex items-center justify-between gap-4">
          {page > 1 ? (
            <Link href={lienPage(page - 1)} className="text-sm underline underline-offset-4">
              Page précédente
            </Link>
          ) : (
            <span />
          )}
          {page < pages ? (
            <Link href={lienPage(page + 1)} className="text-sm underline underline-offset-4">
              Page suivante
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </main>
  )
}
