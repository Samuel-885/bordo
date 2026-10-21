import { describe, expect, it } from 'vitest'
import { classificarAtraso } from '../atraso'
import { calcularEstado } from '../previsao'
import { congelar, esperarHorario, EVENTOS_CASO_3, h, PLANO } from './fixtures'

describe('caso 11: virada do dia', () => {
  it('destino previsto 00:04 → tratado como dia seguinte: atraso +34, não −23h26', () => {
    const estado = calcularEstado(PLANO, congelar(), EVENTOS_CASO_3, h('09:14'))

    esperarHorario(estado.chegadaDestino?.instante, h('00:04', 1))
    expect(estado.atrasoDestinoMin).toBe(34)
    expect(classificarAtraso(estado.atrasoDestinoMin!)).toEqual({ situacao: 'atrasado', minutos: 34 })
  })
})
