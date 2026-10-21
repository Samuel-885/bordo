import { describe, expect, it } from 'vitest'
import { calcularEstado } from '../previsao'
import { congelar, esperarHorario, etapaDe, ev, EVENTOS_CASO_3, h, PLANO } from './fixtures'

describe('caso 8: parada não planejada', () => {
  const original = congelar()
  const paramos = ev.parada('almoco', 'inicio', h('10:00'))
  const voltamos = ev.parada('almoco', 'fim', h('10:20'))

  it('a partir do caso 3, 20 min parados antes do almoço → almoço 12:54, destino 00:24, atraso +54', () => {
    const estado = calcularEstado(PLANO, original, [...EVENTOS_CASO_3, paramos, voltamos], h('10:30'))

    esperarHorario(etapaDe(estado, 'almoco').chegada?.instante, h('12:54'))
    esperarHorario(estado.chegadaDestino?.instante, h('00:24', 1))
    expect(estado.atrasoDestinoMin).toBe(54)
  })

  it('enquanto dura, o tempo parado até agora soma na chegada prevista', () => {
    const estado = calcularEstado(PLANO, original, [...EVENTOS_CASO_3, paramos], h('10:10'))

    esperarHorario(etapaDe(estado, 'almoco').chegada?.instante, h('12:44'))
  })
})
