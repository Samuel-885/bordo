import { describe, expect, it } from 'vitest'
import { calcularEstado } from '../previsao'
import { congelar, esperarHorario, etapaDe, EVENTOS_CASO_2, h, PLANO } from './fixtures'

describe('caso 4: parada estourando', () => {
  it('a partir do caso 2, relógio 09:20 sem saída → saída prevista 09:20, destino 00:10, atraso +40', () => {
    const estado = calcularEstado(PLANO, congelar(), EVENTOS_CASO_2, h('09:20'))

    const saida = etapaDe(estado, 'monlevade').saida
    esperarHorario(saida?.instante, h('09:20'))
    expect(saida?.origem).toBe('relogio')
    esperarHorario(estado.chegadaDestino?.instante, h('00:10', 1))
    expect(estado.atrasoDestinoMin).toBe(40)
  })
})
