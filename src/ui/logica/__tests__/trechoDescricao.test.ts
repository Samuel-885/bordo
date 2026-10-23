import { describe, expect, it } from 'vitest'
import { instante } from '../../../core/tempo'
import type { DuracaoTrecho, Trecho } from '../../../core/tipos'
import { descreverTrecho, formatarFator, lerFator, textoDaDataDoCalculo } from '../trechoDescricao'

const PAR = { etapaOrigemId: 'a', localOrigemId: 'la', etapaDestinoId: 'b', localDestinoId: 'lb' }
const QUANDO = instante('2026-10-23T15:30:00-03:00')
const daRota = (min: number): Trecho => ({ ...PAR, duracaoMin: min, fonte: 'rota', distanciaKm: 96.7, calculadoEm: QUANDO })
const manualComRota = (manual: number, carro: number): Trecho => ({ ...PAR, duracaoMin: manual, fonte: 'manual', rota: { duracaoMin: carro, distanciaKm: 96.7, calculadoEm: QUANDO } })

describe('fator ônibus em texto', () => {
  it('formata e lê com vírgula ou ponto', () => {
    expect(formatarFator(1.15)).toBe('1,15')
    expect(formatarFator(1)).toBe('1,00')
    expect(lerFator('1,15')).toBe(1.15)
    expect(lerFator(' 1.2 ')).toBe(1.2)
    expect(lerFator('abc')).toBeNull()
    expect(lerFator('')).toBeNull()
    expect(lerFator('1,2,3')).toBeNull()
    expect(lerFator('-1')).toBeNull()
  })

  it('data do cálculo', () => expect(textoDaDataDoCalculo(QUANDO)).toBe('23/10 às 15:30'))
})

describe('descrição da fonte de cada tempo (fase 8)', () => {
  it('rota: mostra carro × fator, distância e quando foi calculado', () => {
    const d: DuracaoTrecho = { minutos: 128, fonte: 'rota' }
    expect(descreverTrecho(d, daRota(111), 1.15)).toEqual({
      fonte: 'calculado pela rota',
      detalhes: ['carro 1h51 × fator 1,15 · 96,7 km · calculado em 23/10 às 15:30'],
      comparacao: null,
    })
  })

  it('roteiro com rota calculada: mostra o fator implícito', () => {
    const d: DuracaoTrecho = { minutos: 200, fonte: 'roteiro' }
    const r = descreverTrecho(d, daRota(170), 1.15)
    expect(r.fonte).toBe('do roteiro')
    expect(r.detalhes[0]).toBe('roteiro 3h20 · carro 2h50 · fator implícito 1,18')
    expect(r.detalhes[1]).toBe('96,7 km · calculado em 23/10 às 15:30')
  })

  it('roteiro sem rota calculada: só a fonte', () => {
    expect(descreverTrecho({ minutos: 200, fonte: 'roteiro' }, undefined, 1.15)).toEqual({ fonte: 'do roteiro', detalhes: [], comparacao: null })
  })

  it('manual com rota próxima: mostra a rota, sem pedir escolha', () => {
    const r = descreverTrecho({ minutos: 120, fonte: 'manual' }, manualComRota(120, 100), 1.15)
    expect(r.fonte).toBe('manual')
    expect(r.detalhes[0]).toBe('rota: 1h55 (carro 1h40 × fator 1,15) · 96,7 km · calculado em 23/10 às 15:30')
    expect(r.comparacao).toBeNull()
  })

  it('manual com rota muito diferente: mostra os dois e pede a escolha', () => {
    const r = descreverTrecho({ minutos: 200, fonte: 'manual' }, manualComRota(200, 100), 1.15)
    expect(r.comparacao).toMatchObject({ grande: true, manualMin: 200, onibusMin: 115, diferencaMin: 85 })
    expect(r.comparacao?.texto).toBe('Seu tempo 3h20 · rota 1h55 (diferença +1h25)')
    expect(descreverTrecho({ minutos: 60, fonte: 'manual' }, manualComRota(60, 100), 1.15).comparacao?.texto).toBe('Seu tempo 1h00 · rota 1h55 (diferença −55 min)')
  })

  it('sem tempo ou estimado não inventam nada', () => {
    expect(descreverTrecho(null, undefined, 1.15)).toEqual({ fonte: '', detalhes: [], comparacao: null })
    expect(descreverTrecho({ minutos: null, fonte: null }, undefined, 1.15).fonte).toBe('')
    expect(descreverTrecho({ minutos: 300, fonte: 'estimado' }, undefined, 1.15)).toEqual({ fonte: 'estimado', detalhes: [], comparacao: null })
  })
})
