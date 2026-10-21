import { describe, expect, it } from 'vitest'
import { calcularEstado } from '../previsao'
import { validarRecalibracao } from '../recalibracao'
import { congelar, esperarHorario, etapaDe, ev, EVENTOS_CASO_3, h, PLANO } from './fixtures'

describe('caso 6: recalibração', () => {
  it('a partir do caso 3, informa almoço 13:02 → almoço 13:02, destino 00:32, atraso +62', () => {
    const original = congelar()
    expect(validarRecalibracao(PLANO, original, EVENTOS_CASO_3, 'almoco', h('13:02'), h('11:40'))).toEqual({ ok: true })

    const eventos = [...EVENTOS_CASO_3, ev.recalibracao('almoco', h('13:02'), h('11:40'))]
    const estado = calcularEstado(PLANO, original, eventos, h('11:40'))

    const chegada = etapaDe(estado, 'almoco').chegada
    esperarHorario(chegada?.instante, h('13:02'))
    expect(chegada?.origem).toBe('recalibracao')
    esperarHorario(chegada?.recalibradoEm, h('11:40'))
    esperarHorario(estado.chegadaDestino?.instante, h('00:32', 1))
    expect(estado.atrasoDestinoMin).toBe(62)
  })
})
