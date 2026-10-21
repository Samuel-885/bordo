import { describe, expect, it } from 'vitest'
import { calcularEstado } from '../previsao'
import { congelar, esperarHorario, etapaDe, EVENTOS_CASO_3, h, PLANO } from './fixtures'

describe('caso 5: trânsito estourando', () => {
  it('a partir do caso 3, relógio 12:50 sem chegada → almoço 12:50, destino 00:20, atraso +50', () => {
    const estado = calcularEstado(PLANO, congelar(), EVENTOS_CASO_3, h('12:50'))

    const chegada = etapaDe(estado, 'almoco').chegada
    esperarHorario(chegada?.instante, h('12:50'))
    expect(chegada?.origem).toBe('relogio')
    esperarHorario(estado.chegadaDestino?.instante, h('00:20', 1))
    expect(estado.atrasoDestinoMin).toBe(50)
  })
})
