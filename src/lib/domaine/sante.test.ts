import { describe, expect, it } from 'vitest'

describe('environnement de test', () => {
  it('tourne sur Node 24 ou plus récent', () => {
    const majeure = Number(process.versions.node.split('.')[0])
    expect(majeure).toBeGreaterThanOrEqual(24)
  })

  it('résout les fichiers de test sous src/', () => {
    expect(import.meta.url).toContain('/src/lib/domaine/')
  })
})
