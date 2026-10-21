import { describe, expect, it } from 'vitest'
import { formatarCoordenadas, lerCoordenadas } from '../coordenadas'

describe('coordenadas coladas', () => {
  it.each([
    ['-19.4687, -42.5367', -19.4687, -42.5367],
    ['-19.4687,-42.5367', -19.4687, -42.5367],
    ['  -19.4687   -42.5367 ', -19.4687, -42.5367],
    ['(-19.4687, -42.5367)', -19.4687, -42.5367],
    ['−19.4687, −42.5367', -19.4687, -42.5367],
    ['-19,4687; -42,5367', null, null],
    ['21.1775, -47.8103', 21.1775, -47.8103],
  ])('lê "%s"', (texto, lat, lng) => {
    const r = lerCoordenadas(texto)
    if (lat === null) return expect(r.ok).toBe(false)
    expect(r).toEqual({ ok: true, coordenadas: { lat, lng } })
  })

  it.each(['', 'abc', '10', '10, 20, 30', '91, 10', '-91, 10', '10, 181', '10, -181', '1,5 2,5'])('recusa "%s"', (texto) => {
    expect(lerCoordenadas(texto).ok).toBe(false)
  })

  it('formata de volta', () => {
    expect(formatarCoordenadas({ lat: -19.4687, lng: -42.5367 })).toBe('-19.4687, -42.5367')
  })
})
