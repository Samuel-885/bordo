import { describe, expect, it } from 'vitest'
import { calcularEstado, validarPulo } from '../previsao'
import { congelar, esperarHorario, etapaDe, ev, h, PLANO } from './fixtures'

describe('caso 10: pular etapa', () => {
  it('plano sem eventos, café pulado → trecho almoço → jantar 7h00 "estimado", jantar 20:00, destino 23:00, −30', () => {
    const original = congelar()
    const inicio = [ev.inicio(h('06:00'))]
    expect(validarPulo(PLANO, calcularEstado(PLANO, original, inicio, h('06:05')), 'cafe')).toEqual({ ok: true })

    const estado = calcularEstado(PLANO, original, [...inicio, ev.pular('cafe', h('06:05'))], h('06:10'))

    expect(etapaDe(estado, 'cafe').estado).toBe('pulada')
    const jantar = etapaDe(estado, 'jantar')
    expect(jantar.trechoChegada).toEqual({ minutos: 420, fonte: 'estimado' })
    esperarHorario(jantar.chegada?.instante, h('20:00'))
    esperarHorario(estado.chegadaDestino?.instante, h('23:00'))
    expect(estado.atrasoDestinoMin).toBe(-30)
  })

  it('ponto obrigatório nunca pode ser pulado', () => {
    const estado = calcularEstado(PLANO, congelar(), [ev.inicio(h('06:00'))], h('06:05'))
    expect(validarPulo(PLANO, estado, 'monlevade').ok).toBe(false)
  })
})
