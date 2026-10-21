import { describe, expect, it } from 'vitest'
import { calcularEstado } from '../previsao'
import { validarRecalibracao } from '../recalibracao'
import { avaliarAlternativas } from '../viabilidade'
import { congelar, ev, EVENTOS_CASO_1, EVENTOS_CASO_2, EVENTOS_CASO_3, h, PLANO } from './fixtures'

function congelarFundo<T>(valor: T): T {
  if (valor && typeof valor === 'object') {
    Object.values(valor).forEach(congelarFundo)
    Object.freeze(valor)
  }
  return valor
}

describe('caso 15: original intacto', () => {
  it('depois de todos os casos, o plano original é idêntico ao do início e nenhuma entrada foi alterada', () => {
    const original = congelar()
    const copiaOriginal = structuredClone(original)
    const copiaPlano = structuredClone(PLANO)

    const cenarios = [
      { eventos: EVENTOS_CASO_1, agora: h('06:47') },
      { eventos: EVENTOS_CASO_2, agora: h('08:55') },
      { eventos: EVENTOS_CASO_3, agora: h('09:14') },
      { eventos: EVENTOS_CASO_2, agora: h('09:20') },
      { eventos: EVENTOS_CASO_3, agora: h('12:50') },
      { eventos: [...EVENTOS_CASO_3, ev.recalibracao('almoco', h('13:02'), h('11:40'))], agora: h('12:10') },
      { eventos: [...EVENTOS_CASO_3, ev.parada('almoco', 'inicio', h('10:00'))], agora: h('10:10') },
      { eventos: [...EVENTOS_CASO_3, ev.troca('almoco', 'l-rest-c', h('10:00'))], agora: h('10:00') },
      { eventos: [ev.inicio(h('06:00')), ev.pular('cafe', h('06:05'))], agora: h('06:10') },
    ]

    congelarFundo(PLANO)
    congelarFundo(original)
    for (const { eventos, agora } of cenarios) {
      const copiaEventos = structuredClone(eventos)
      congelarFundo(eventos)

      calcularEstado(PLANO, original, eventos, agora)
      validarRecalibracao(PLANO, original, eventos, 'almoco', h('13:30'), agora)
      avaliarAlternativas(PLANO, original, eventos, agora, 'almoco')

      expect(eventos).toEqual(copiaEventos)
    }

    expect(original).toEqual(copiaOriginal)
    expect(PLANO).toEqual(copiaPlano)
    // E continua sendo exatamente o que as regras dão sem eventos.
    expect(congelar()).toEqual(copiaOriginal)
    expect(original.etapas.find((e) => e.etapaId === 'almoco')?.localId).toBe('l-rest-a')
  })
})
