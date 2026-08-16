import { EnTetePage } from '@/composants/ui/en-tete-page'
import { LigneListe, Liste } from '@/composants/ui/ligne-liste'
import { listerToutesAntennes } from '@/lib/donnees/antennes'
import { exigerAdministrateur } from '@/lib/securite/garde'
import { desactiverAntenne, reactiverAntenne } from './actions'
import { BoutonBasculeAntenne } from './bouton-bascule-antenne'
import { FormulaireAntenne } from './formulaire-antenne'

export default async function PageAntennes() {
  await exigerAdministrateur()
  const antennes = await listerToutesAntennes()
  const antennesActives = antennes.filter((antenne) => antenne.actif)
  const antennesInactives = antennes.filter((antenne) => !antenne.actif)

  return (
    <main className="mx-auto max-w-2xl px-esp-6 py-esp-10">
      <EnTetePage
        retour={{ href: '/tableau-de-bord', libelle: 'Retour au tableau de bord' }}
        titre="Antennes"
      />

      <div className="mb-esp-10">
        <Liste>
          {antennesActives.map((antenne) => (
            <LigneListe
              key={antenne.id}
              lien={`/antennes/${antenne.id}`}
              principal={antenne.nom}
              meta={antenne.pays}
              actions={
                <form action={desactiverAntenne}>
                  <input type="hidden" name="id" value={antenne.id} />
                  <BoutonBasculeAntenne nom={antenne.nom} desactiver />
                </form>
              }
            />
          ))}
        </Liste>
      </div>

      {/*
        Une antenne désactivée reste visible ici, contrairement à une simple
        disparition : sans cette section, seule la clé de service permettrait de la
        rétablir. Une fiche membre archivée, elle, reste consultable ; une antenne
        désactivée doit rester au moins réactivable.

        ⚠️ `text-neutral-500` attenuait le lien ENTIER (nom + pays). `LigneListe` attenue
        déjà `meta` par défaut (`text-encre-attenuee`, code de `ligne-liste.tsx`) : seul
        `principal` a besoin d'un canal supplémentaire, ici un `<span>` imbriqué qui pose
        SA PROPRE couleur — elle l'emporte sur celle, héritée, du `<span>` ambiant de
        `LigneListe`, sans conflit de spécificité puisque ce sont deux éléments distincts.
      */}
      {antennesInactives.length > 0 ? (
        <>
          <h2 className="mb-esp-4 text-section">Antennes désactivées</h2>
          <div className="mb-esp-10">
            <Liste>
              {antennesInactives.map((antenne) => (
                <LigneListe
                  key={antenne.id}
                  lien={`/antennes/${antenne.id}`}
                  principal={<span className="text-encre-attenuee">{antenne.nom}</span>}
                  meta={antenne.pays}
                  actions={
                    <form action={reactiverAntenne}>
                      <input type="hidden" name="id" value={antenne.id} />
                      <BoutonBasculeAntenne nom={antenne.nom} desactiver={false} />
                    </form>
                  }
                />
              ))}
            </Liste>
          </div>
        </>
      ) : null}

      <h2 className="mb-esp-4 text-section">Ajouter une antenne</h2>
      <FormulaireAntenne />
    </main>
  )
}
