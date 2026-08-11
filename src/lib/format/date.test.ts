import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { formaterDateHeure, formaterDateSeule, fuseauDateSeule } from './date'

const cheminModule = path.join(path.dirname(fileURLToPath(import.meta.url)), 'date.ts')

describe('formaterDateSeule', () => {
  it('formate des dates ordinaires en milieu de mois au format français', () => {
    expect(formaterDateSeule('2025-03-12')).toBe('12/03/2025')
    expect(formaterDateSeule('2026-07-15')).toBe('15/07/2026')
  })

  // Contrôle négatif d'abord : ce test prouve que le piège existe réellement, sur
  // n'importe quelle machine, sans dépendre du fuseau du poste d'exécution. Un
  // formatage naïf (sans `timeZone: 'UTC'`) rendu explicitement dans un fuseau à
  // l'ouest de Greenwich fait bien basculer le 1er janvier 2026 au 31 décembre 2025.
  // Sans cette assertion, le test suivant ne prouverait rien sur une machine déjà en
  // UTC (comme celle-ci) : il y passerait aussi bien avec un `formaterDateSeule`
  // fautif qu'avec la version correcte.
  it("le piège existe réellement : un formatage naïf à l'ouest de Greenwich bascule le 1er janvier", () => {
    const naif = new Intl.DateTimeFormat('fr-FR', {
      dateStyle: 'short',
      timeZone: 'America/Los_Angeles',
    }).format(new Date('2026-01-01'))
    expect(naif).toBe('31/12/2025')
  })

  // Le vrai test de non-régression : quel que soit le fuseau du poste d'exécution,
  // `formaterDateSeule` force `timeZone: 'UTC'` et n'y tombe donc pas.
  it("n'y tombe pas : le 1er janvier reste le 1er janvier, quel que soit le fuseau du poste", () => {
    expect(formaterDateSeule('2026-01-01')).toBe('01/01/2026')
  })

  it('résiste au même piège en fin de mois (dernier jour vs premier jour du mois suivant)', () => {
    expect(formaterDateSeule('2025-12-31')).toBe('31/12/2025')
  })

  // Invariant, indépendant du fuseau du poste d'exécution : le formateur de dates
  // seules doit être épinglé sur UTC, et pas seulement se comporter comme tel par
  // coïncidence. `resolvedOptions()` donne le fuseau effectivement retenu par Intl —
  // voir `fuseauDateSeule`, exposé par le module dans ce seul but.
  it('le formateur de dates seules résout son fuseau sur UTC', () => {
    expect(fuseauDateSeule).toBe('UTC')
  })

  // Ce poste précis est justement déjà configuré en UTC (fuseau Windows « UTC », pas
  // un fuseau à décalage nul par coïncidence comme « Europe/London » en hiver) :
  // sans épinglage explicite, Intl y résout le fuseau par défaut sur cette même
  // chaîne « UTC ». L'assertion ci-dessus ne peut donc pas, à elle seule, distinguer
  // sur cette machine un épinglage réel d'un épinglage absent — elle protège les
  // postes où le fuseau par défaut diffère d'UTC, ce qui reste la majorité des cas,
  // mais pas celui-ci. Cette assertion-ci verrouille la promesse dans le code source
  // lui-même, quel que soit le fuseau du poste : c'est elle qui tombe si
  // `timeZone: 'UTC'` disparaît du module, y compris ici.
  it("le code source épingle explicitement timeZone: 'UTC' pour le formateur de dates seules", () => {
    const source = readFileSync(cheminModule, 'utf-8')
    const debut = source.indexOf('FORMAT_DATE_SEULE')
    const fin = source.indexOf('FORMAT_DATE_HEURE')
    expect(debut).toBeGreaterThanOrEqual(0)
    expect(fin).toBeGreaterThan(debut)
    expect(source.slice(debut, fin)).toMatch(/timeZone:\s*'UTC'/)
  })
})

describe('formaterDateHeure', () => {
  // `formaterDateHeure` ne force volontairement aucun fuseau — c'est un `timestamptz`,
  // un instant réel qui doit se lire dans le fuseau local, pas rester figé sur UTC (voir
  // le commentaire du module). Le résultat dépend donc du fuseau du poste d'exécution,
  // et ne peut pas être fixé à une valeur unique dans un test qui doit passer partout :
  // ce qui suit vérifie sa forme et sa cohérence, pas une heure précise.
  it('accepte aussi bien une chaîne ISO qu\'un objet Date, avec un résultat identique', () => {
    const iso = '2026-01-01T12:00:00.000Z'
    expect(formaterDateHeure(iso)).toBe(formaterDateHeure(new Date(iso)))
  })

  it('produit une date et une heure au format court français (JJ/MM/AAAA HH:MM)', () => {
    expect(formaterDateHeure('2026-01-01T12:00:00.000Z')).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/)
  })
})
