import { describe, expect, it } from 'vitest'
import { calcularEstado } from '../previsao'
import { validarRecalibracao } from '../recalibracao'
import { congelar, esperarHorario, etapaDe, ev, EVENTOS_CASO_3, h, PLANO } from './fixtures'

describe('caso 7: recalibração no passado', () => {
  it('continuando do caso 6, relógio 12:10, informa 12:05 → recusada com aviso, nada muda', () => {
    const original = congelar()
    const eventos = [...EVENTOS_CASO_3, ev.recalibracao('almoco', h('13:02'), h('11:40'))]
    const antesDaTentativa = calcularEstado(PLANO, original, eventos, h('12:10'))

    const r = validarRecalibracao(PLANO, original, eventos, 'almoco', h('12:05'), h('12:10'))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toMatch(/anterior ao horário atual/)

    // Recusada, a recalibração não vira evento: o estado é o mesmo.
    const depois = calcularEstado(PLANO, original, eventos, h('12:10'))
    expect(depois).toEqual(antesDaTentativa)
    esperarHorario(etapaDe(depois, 'almoco').chegada?.instante, h('13:02'))
  })
})
