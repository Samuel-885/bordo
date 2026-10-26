import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../../core/config'
import { arredondarPonto, linkConferirNoMaps, pontoDoTexto, vistaInicial } from '../mapa'
import { avisoDePrecisaoDoGps, dicaDePrecisao, textoDoErroDeBusca, textoDoErroDeGpsNoLocal } from '../servicos'

describe('mapa do cadastro de local', () => {
  it('abre no pino, senão no centro do catálogo, senão no Brasil', () => {
    expect(vistaInicial({ lat: -19.1, lng: -42.1 }, { lat: -20, lng: -43 })).toEqual({ centro: { lat: -19.1, lng: -42.1 }, zoom: 17 })
    expect(vistaInicial(null, { lat: -20, lng: -43 })).toEqual({ centro: { lat: -20, lng: -43 }, zoom: CONFIG.mapaZoomDoCatalogo })
    expect(vistaInicial(null, null).zoom).toBe(CONFIG.mapaZoomSemReferencia)
  })

  it('o pino segue o texto das coordenadas; texto vazio ou inválido não move nada', () => {
    expect(pontoDoTexto('-19.4687, -42.5367')).toEqual({ lat: -19.4687, lng: -42.5367 })
    expect(pontoDoTexto('')).toBeNull()
    expect(pontoDoTexto('abc')).toBeNull()
    expect(pontoDoTexto('95, 10')).toBeNull()
  })

  it('arredonda o pino a seis casas', () => {
    expect(arredondarPonto({ lat: -19.123456789, lng: -42.987654321 })).toEqual({ lat: -19.123457, lng: -42.987654 })
  })

  it('"Conferir no Google Maps" só existe com coordenadas válidas e aponta para o pino', () => {
    expect(linkConferirNoMaps('')).toBeNull()
    expect(linkConferirNoMaps('lixo')).toBeNull()
    expect(linkConferirNoMaps('-19.5, -42.5')).toBe('https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=-19.5,-42.5')
  })

  it('GPS: avisa acima de 50 m, sem bloquear; até 50 m, não avisa', () => {
    expect(avisoDePrecisaoDoGps(50)).toBeNull()
    expect(avisoDePrecisaoDoGps(120.4)).toContain('120 m')
  })

  it('textos das falhas do GPS no mapa e da busca sem internet', () => {
    expect(textoDoErroDeGpsNoLocal('negada')).toContain('Sem permissão')
    expect(textoDoErroDeGpsNoLocal('sem_sinal')).toContain('Sem sinal de GPS')
    expect(textoDoErroDeBusca('sem_internet')).toMatch(/^Sem internet ou sinal fraco/)
  })

  it('o aviso de resultado aproximado sugere ajustar o pino', () => {
    const r = { nome: 'Rua', lat: 0, lng: 0, cidade: '', estado: '', tipoDoLugar: 'Rua', precisao: 'aproximada' as const }
    expect(dicaDePrecisao(r)).toContain('ajuste o pino no mapa')
  })
})
