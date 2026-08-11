'use client'

export default function Erreur({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-6">
      <h1 className="text-xl font-semibold">Une erreur est survenue</h1>
      <p className="text-sm text-neutral-600">
        L&apos;opération n&apos;a pas pu aboutir. Réessayez ; si le problème persiste,
        signalez-le à un administrateur.
      </p>
      <button
        type="button"
        onClick={reset}
        className="self-start rounded-md bg-neutral-900 px-4 py-2 font-medium text-white"
      >
        Réessayer
      </button>
    </main>
  )
}
