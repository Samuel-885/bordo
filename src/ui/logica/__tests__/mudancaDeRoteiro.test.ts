import { describe, expect, it } from 'vitest'
import { instante } from '../../../core/tempo'
import { pernaVazia, textoDaRotaDaPerna, textoDoImpactoNoDestino, trechoDaPerna } from '../mudancaDeRoteiro'

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

  it('o texto da rota mostra carro, fator, ônibus, distância e que é estimativa sem trânsito', () => {
    expect(textoDaRotaDaPerna({ tipo: 'rota', minutosCarro: 100, distanciaKm: 80.4, calculadoEm: quando }, 1.15)).toBe(
      'carro 1h40 × fator 1,15 = 1h55 · 80,4 km · estimativa sem trânsito',
    )
  })

  it('o impacto no destino', () => {
    expect(textoDoImpactoNoDestino(50)).toBe('+50 min no destino')
    expect(textoDoImpactoNoDestino(-5)).toBe('−5 min no destino')
    expect(textoDoImpactoNoDestino(0)).toBe('sem efeito no destino')
    expect(textoDoImpactoNoDestino(null)).toContain('sem tempo definido')
  })
})
