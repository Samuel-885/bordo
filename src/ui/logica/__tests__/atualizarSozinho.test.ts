// "Atualizar sozinho": a timeline não mostra atualizações de previsão, o cartão diz a origem e o estado.

import { describe, expect, it } from 'vitest'
import { calcularEstado } from '../../../core/previsao'
import { EVENTOS_CASO_3, PLANO, congelar, etapaDe, ev, h } from '../../../core/__tests__/fixtures'
import { linhasDoAutomatico } from '../atualizarSozinho'
import { montarTimeline, textoDaOrigemDaPrevisao } from '../textosViagem'

const original = congelar()

describe('timeline e origem da previsão', () => {
  const automatica = ev.recalibracaoAutomatica('almoco', h('13:02'), h('11:40'), h('11:41'))
  const doBotao = ev.recalibracaoPelaLocalizacao('almoco', h('13:10'), h('11:45'), h('11:46'))

  it('nenhuma atualização de previsão aparece na timeline (automática, do botão ou digitada)', () => {
    const digitada = ev.recalibracao('almoco', h('13:15'), h('11:47'))
    const base = montarTimeline(PLANO, original, EVENTOS_CASO_3, h('11:41'))
    const todas = montarTimeline(PLANO, original, [...EVENTOS_CASO_3, automatica, doBotao, digitada], h('11:48'))
    expect(todas.some((i) => i.titulo.startsWith('Previsão atualizada'))).toBe(false)
    expect(todas).toHaveLength(base.length)
  })

  it('o cartão diz "atualizado pela localização às 10:42" só quando a previsão vigente é automática', () => {
    const chegada = (eventos: typeof EVENTOS_CASO_3, agora: string) =>
      etapaDe(calcularEstado(PLANO, original, eventos, h(agora)), 'almoco').chegada
    expect(textoDaOrigemDaPrevisao(chegada([...EVENTOS_CASO_3, automatica], '11:41'))).toBe('Atualizado pela localização às 11:40, sem trânsito (OSRM)')
    expect(textoDaOrigemDaPrevisao(chegada([...EVENTOS_CASO_3, doBotao], '11:46'))).toBe('Pela localização, sem trânsito (OSRM), calculado às 11:45')
  })
})

describe('linhas do cartão', () => {
  const base = { pausa: null, lendo: false, ultimaEm: null, falha: null, tentaEm: null }

  it('antes da primeira leitura', () => {
    expect(linhasDoAutomatico(base)).toEqual(['Aguardando a primeira leitura…'])
    expect(linhasDoAutomatico({ ...base, lendo: true })).toEqual(['Lendo a posição…'])
  })

  it('mostra a última atualização', () => {
    expect(linhasDoAutomatico({ ...base, ultimaEm: h('10:42') })).toEqual(['Última atualização às 10:42'])
  })

  it('falha: última atualização, motivo e quando tenta de novo', () => {
    expect(linhasDoAutomatico({ ...base, ultimaEm: h('10:42'), falha: 'sem internet', tentaEm: h('10:47') })).toEqual([
      'Última atualização às 10:42',
      'Não atualizou agora: sem internet. Tenta de novo às 10:47.',
    ])
    expect(linhasDoAutomatico({ ...base, falha: 'GPS sem sinal', tentaEm: h('10:47') })).toEqual([
      'Não atualizou agora: GPS sem sinal. Tenta de novo às 10:47.',
    ])
  })

  it('pausado: diz por quê e não fala de falha', () => {
    expect(linhasDoAutomatico({ ...base, pausa: 'Pausado: parados.', ultimaEm: h('10:42') })).toEqual(['Pausado: parados.', 'Última atualização às 10:42'])
  })
})
