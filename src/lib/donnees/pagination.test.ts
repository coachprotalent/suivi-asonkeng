import { describe, expect, it } from 'vitest'
import { nombreDePages, pageDemandee, totalObligatoire, verifierTaillePage } from './pagination'

describe('nombreDePages', () => {
  /*
    L'INVARIANT QUI REND LE BORNAGE NON BOUCLANT. Ce n'est pas un cas limite : une liste
    vide est l'état normal d'un écran filtré. Si `pages` pouvait valoir 0, la redirection de
    bornage viserait `page=0`, que `pageDemandee` ramène à 1, qui redéclencherait `1 > 0` —
    et l'écran tournerait en rond.
  */
  it('vaut au moins 1 sur un total nul', () => {
    expect(nombreDePages(0, 25)).toBe(1)
  })

  it('ne cree pas de page supplementaire quand le total remplit exactement la derniere', () => {
    expect(nombreDePages(25, 25)).toBe(1)
    expect(nombreDePages(50, 25)).toBe(2)
  })

  it('cree une page pour le reste', () => {
    expect(nombreDePages(26, 25)).toBe(2)
    expect(nombreDePages(1, 25)).toBe(1)
  })
})

describe('pageDemandee', () => {
  /*
    M5 DE LA RONDE DU 2026-08-14, VERROUILLÉ ICI POUR LA PREMIÈRE FOIS. `Number('2.5') || 1`
    vaut `2.5` — un nombre NON ENTIER qui franchit le garde `page > pages` (`2.5 > 2` est
    vrai) et s'affiche sous l'étiquette « page 2.5 sur N » tout en rendant le contenu de la
    page 1. `Number.parseInt` le ramène à 2. Cette fonction existait depuis la phase 5 sans
    aucun test.
  */
  it('tronque une page non entiere au lieu de la propager', () => {
    expect(pageDemandee('2.5')).toBe(2)
  })

  it('retombe sur 1 pour une valeur absente, vide, negative ou non numerique', () => {
    expect(pageDemandee(undefined)).toBe(1)
    expect(pageDemandee('')).toBe(1)
    expect(pageDemandee('0')).toBe(1)
    expect(pageDemandee('-3')).toBe(1)
    expect(pageDemandee('abc')).toBe(1)
  })
})

describe('verifierTaillePage', () => {
  /*
    PostgREST tronque EN SILENCE au-delà de `max_rows = 1000` (`supabase/config.toml:18`).
    Cette garde LÈVE plutôt que de borner en douce — borner masquerait un appel erroné
    derrière un comportement différent de celui demandé.
  */
  it('leve au seuil de max_rows, et pas un cran avant', () => {
    expect(() => verifierTaillePage(999, 'test')).not.toThrow()
    expect(() => verifierTaillePage(1000, 'test')).toThrow(/max_rows/)
  })

  it('leve sur un entier invalide', () => {
    expect(() => verifierTaillePage(0, 'test')).toThrow()
    expect(() => verifierTaillePage(2.5, 'test')).toThrow()
  })
})

describe('totalObligatoire', () => {
  /*
    Retomber sur la longueur de la page serait un MENSONGE : l'écran annoncerait
    « 25 lignes » pour une base qui en compte mille, et la pagination s'arrêterait à la
    première page.
  */
  it('leve quand PostgREST omet le comptage', () => {
    expect(() => totalObligatoire(null, 'test')).toThrow(/comptage absent/)
  })

  it('laisse passer un comptage nul, qui est une reponse et non une absence', () => {
    expect(totalObligatoire(0, 'test')).toBe(0)
  })
})
