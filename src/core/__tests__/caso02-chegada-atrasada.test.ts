import { describe, expect, it } from 'vitest'
import { calcularEstado } from '../previsao'
import { congelar, esperarHorario, etapaDe, EVENTOS_CASO_2, h, PLANO } from './fixtures'

describe('caso 2: chegada atrasada', () => {
  it('chegada em Monlevade 08:55 → saída prevista 09:10, almoço 12:30, destino 00:00, atraso +30', () => {
    const estado = calcularEstado(PLANO, congelar(), EVENTOS_CASO_2, h('08:55'))

    const monlevade = etapaDe(estado, 'monlevade')
    expect(monlevade.estado).toBe('em_parada')
    expect(monlevade.chegada?.atrasoMin).toBe(30)
    esperarHorario(monlevade.saida?.instante, h('09:10'))
    esperarHorario(etapaDe(estado, 'almoco').chegada?.instante, h('12:30'))
    esperarHorario(estado.chegadaDestino?.instante, h('00:00', 1))
    expect(estado.atrasoDestinoMin).toBe(30)
  })
})
