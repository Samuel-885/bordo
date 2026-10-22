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
    ['-19.4746895,-42.5481009.', -19.4746895, -42.5481009],
    ['-19.4746895,-42.5481009;', -19.4746895, -42.5481009],
    ['-19.4746895, -42.5481009,', -19.4746895, -42.5481009],
    ['  -19.4746895 ,  -42.5481009  ', -19.4746895, -42.5481009],
    ['-19.4746895 , -42.5481009 .', -19.4746895, -42.5481009],
    ['\n-19.4746895,-42.5481009\n', -19.4746895, -42.5481009],
    ['(-19.4687, -42.5367).', -19.4687, -42.5367],
    ['-90, 180', -90, 180],
  ])('lê "%s"', (texto, lat, lng) => {
    const r = lerCoordenadas(texto)
    if (lat === null) return expect(r.ok).toBe(false)
    expect(r).toEqual({ ok: true, coordenadas: { lat, lng } })
  })

  it.each(['', 'abc', '10', '10, 20, 30', '91, 10', '-91, 10', '10, 181', '10, -181', '1,5 2,5', '.', ',', '-19.4687,', '-19.4687. -42.5367 -1', 'lat -19.4687, lng -42.5367'])('recusa "%s"', (texto) => {
    expect(lerCoordenadas(texto).ok).toBe(false)
  })

  describe('link do Google Maps', () => {
    it.each([
      ['https://www.google.com/maps/@-19.4746895,-42.5481009,17z', -19.4746895, -42.5481009],
      ['https://www.google.com/maps/place/Restaurante+A/@-19.4746895,-42.5481009,17z/data=!3m1!4b1', -19.4746895, -42.5481009],
      ['https://www.google.com/maps?q=-19.4746895,-42.5481009', -19.4746895, -42.5481009],
      ['https://www.google.com/maps?q=-19.4746895%2C-42.5481009', -19.4746895, -42.5481009],
      ['https://maps.google.com/?q=-19.4746895, -42.5481009&z=15', -19.4746895, -42.5481009],
      ['https://www.google.com/maps/search/?api=1&query=-19.4746895,-42.5481009', -19.4746895, -42.5481009],
      ['https://www.google.com/maps/dir/?api=1&destination=21.1775,-47.8103', 21.1775, -47.8103],
      ['https://www.google.com/maps/place/X/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d-19.4746895!4d-42.5481009', -19.4746895, -42.5481009],
      ['  https://www.google.com/maps/@-19.4746895,-42.5481009,17z  ', -19.4746895, -42.5481009],
      ['HTTPS://WWW.GOOGLE.COM/MAPS/@-19.4746895,-42.5481009,17z', -19.4746895, -42.5481009],
    ])('extrai de "%s"', (link, lat, lng) => {
      expect(lerCoordenadas(link)).toEqual({ ok: true, coordenadas: { lat, lng } })
    })

    it('o "@" do link vale mesmo com o nome do local antes', () => {
      const r = lerCoordenadas('https://www.google.com/maps/place/Padaria+do+Zé/@-19.5,-42.6,15z')
      expect(r).toEqual({ ok: true, coordenadas: { lat: -19.5, lng: -42.6 } })
    })

    it.each([
      'https://www.google.com/maps/@91.0,-42.5,17z',
      'https://www.google.com/maps/@-19.4,-181.0,17z',
      'https://www.google.com/maps?q=-19.4746895,-200',
    ])('recusa link com coordenadas fora do intervalo: %s', (link) => {
      expect(lerCoordenadas(link).ok).toBe(false)
    })

    it.each([
      'https://www.google.com/maps/place/Restaurante+A',
      'https://maps.app.goo.gl/abc123',
      'https://example.com/pagina',
      'https://',
    ])('recusa link sem coordenadas: %s', (link) => {
      const r = lerCoordenadas(link)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.motivo).toContain('link')
    })
  })

  it('formata de volta', () => {
    expect(formatarCoordenadas({ lat: -19.4687, lng: -42.5367 })).toBe('-19.4687, -42.5367')
  })
})
