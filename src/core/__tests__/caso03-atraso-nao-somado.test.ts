import { describe, expect, it } from 'vitest'
import { calcularEstado } from '../previsao'
import { congelar, esperarHorario, etapaDe, EVENTOS_CASO_3, h, PLANO } from './fixtures'

describe('caso 3: atraso não somado', () => {
  it('saída de Monlevade 09:14 → atraso na saída +34, destino 00:04, atraso +34 (não +81)', () => {
    const estado = calcularEstado(PLANO, congelar(), EVENTOS_CASO_3, h('09:14'))

    expect(etapaDe(estado, 'origem').saida?.atrasoMin).toBe(17)
    expect(etapaDe(estado, 'monlevade').chegada?.atrasoMin).toBe(30)
    expect(etapaDe(estado, 'monlevade').saida?.atrasoMin).toBe(34)
    esperarHorario(estado.chegadaDestino?.instante, h('00:04', 1))
    expect(estado.atrasoDestinoMin).toBe(34)
    expect(estado.atrasoDestinoMin).not.toBe(17 + 30 + 34)
  })
})
