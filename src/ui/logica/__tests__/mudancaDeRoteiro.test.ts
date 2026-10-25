import { describe, expect, it } from 'vitest'
import { instante } from '../../../core/tempo'
import { pernaVazia, minutosDeOnibusDaRota, textoDoTrechoPelaLocalizacao, textoDoTrechoPelaRota, textoDoImpactoNoDestino, trechoDaPerna } from '../mudancaDeRoteiro'

const par = { etapaOrigemId: 'a', localOrigemId: 'la', etapaDestinoId: 'b', localDestinoId: 'lb' }
const quando = instante('2026-11-14T09:00:00-03:00')

describe('mudança de roteiro: tempo dos trechos', () => {
  it('sem tempo preenchido não há trecho (nada é inventado)', () => {
    expect(trechoDaPerna(par, pernaVazia())).toBeNull()
    expect(trechoDaPerna(par, { tipo: 'manual', horas: '0', minutos: '0' })).toBeNull()
    expect(trechoDaPerna(par, { tipo: 'manual', horas: '1', minutos: '75' })).toBeNull()
  })

  it('o tempo digitado vira trecho manual, em minutos de ônibus', () => {
    expect(trechoDaPerna(par, { tipo: 'manual', horas: '1', minutos: '30' })).toEqual({ ...par, duracaoMin: 90, fonte: 'manual' })
  })

  it('a rota vira trecho de rota com o tempo de carro, a distância e a data (o fator entra no cálculo)', () => {
    expect(trechoDaPerna(par, { tipo: 'rota', minutosCarro: 100, distanciaKm: 80.4, calculadoEm: quando })).toEqual({
      ...par,
      duracaoMin: 100,
      fonte: 'rota',
      distanciaKm: 80.4,
      calculadoEm: quando,
    })
  })

  it('o texto do trecho pela rota diz qual tempo vale (ônibus) e de onde ele vem (carro × fator)', () => {
    const perna = { tipo: 'rota' as const, minutosCarro: 6, distanciaKm: 3, calculadoEm: quando }
    expect(minutosDeOnibusDaRota(perna, 1.15)).toBe(7)
    expect(textoDoTrechoPelaRota('De Mirante até Sogra', perna, 1.15)).toBe('De Mirante até Sogra: 7 min · pela rota (carro 6 min × 1,15)')
  })

  it('o texto do trecho pela localização traz o horário do cálculo', () => {
    expect(textoDoTrechoPelaLocalizacao('Até Mirante', 20, instante('2026-11-14T09:29:40-03:00'))).toBe(
      'Até Mirante: 20 min · pela sua localização, sem trânsito, calculado às 09:29',
    )
  })

  it('o impacto no destino', () => {
    expect(textoDoImpactoNoDestino(50)).toBe('+50 min no destino')
    expect(textoDoImpactoNoDestino(-5)).toBe('−5 min no destino')
    expect(textoDoImpactoNoDestino(0)).toBe('sem efeito no destino')
    expect(textoDoImpactoNoDestino(null)).toContain('sem tempo definido')
  })
})
