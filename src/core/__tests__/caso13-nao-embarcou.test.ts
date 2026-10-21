import { describe, expect, it } from 'vitest'
import { esperadosNaSaida } from '../passageiros'
import { ETAPAS, ev, h, PASSAGEIROS } from './fixtures'

describe('caso 13: não embarcou', () => {
  it('1 de Monlevade marcado "não embarcou" → 37 esperados dali em diante', () => {
    const eventos = [ev.status('monlevade', 'p-37', 'nao_embarcou', 'Não apareceu no ponto', h('09:10'))]

    expect(esperadosNaSaida('origem', ETAPAS, PASSAGEIROS, eventos)).toBe(35)
    expect(esperadosNaSaida('monlevade', ETAPAS, PASSAGEIROS, eventos)).toBe(37)
    expect(esperadosNaSaida('almoco', ETAPAS, PASSAGEIROS, eventos)).toBe(37)
    expect(esperadosNaSaida('jantar', ETAPAS, PASSAGEIROS, eventos)).toBe(37)
  })
})
