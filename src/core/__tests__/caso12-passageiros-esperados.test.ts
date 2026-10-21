import { describe, expect, it } from 'vitest'
import { esperadosNaSaida } from '../passageiros'
import { ETAPAS, PASSAGEIROS } from './fixtures'

describe('caso 12: passageiros esperados', () => {
  it('35 em Ipatinga e 3 em Monlevade → 35 na saída de Ipatinga, 38 na saída de Monlevade', () => {
    expect(esperadosNaSaida('origem', ETAPAS, PASSAGEIROS, [])).toBe(35)
    expect(esperadosNaSaida('monlevade', ETAPAS, PASSAGEIROS, [])).toBe(38)
  })
})
