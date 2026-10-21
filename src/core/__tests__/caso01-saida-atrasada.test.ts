import { describe, expect, it } from 'vitest'
import { calcularEstado } from '../previsao'
import { congelar, esperarHorario, etapaDe, EVENTOS_CASO_1, h, PLANO } from './fixtures'

describe('caso 1: saída atrasada', () => {
  it('saída real 06:47 → Monlevade 08:42, almoço 12:17, destino 23:47, atraso +17', () => {
    const estado = calcularEstado(PLANO, congelar(), EVENTOS_CASO_1, h('06:47'))

    esperarHorario(etapaDe(estado, 'monlevade').chegada?.instante, h('08:42'))
    esperarHorario(etapaDe(estado, 'almoco').chegada?.instante, h('12:17'))
    esperarHorario(estado.chegadaDestino?.instante, h('23:47'))
    expect(estado.atrasoDestinoMin).toBe(17)
    expect(estado.emTransito).toBe(true)
  })
})
