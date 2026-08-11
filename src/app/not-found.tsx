import Link from 'next/link'

export default function Introuvable() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-6">
      <h1 className="text-xl font-semibold">Page introuvable</h1>
      <p className="text-sm text-neutral-600">
        Cette adresse ne correspond à rien. Le lien est peut-être périmé, ou la fiche a été
        supprimée.
      </p>
      <Link href="/membres" className="self-start underline underline-offset-4">
        Revenir à l&apos;annuaire
      </Link>
    </main>
  )
}
