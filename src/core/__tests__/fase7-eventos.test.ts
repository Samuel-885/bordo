// Fase 7: atualização gerada e observação são eventos sem efeito no cálculo.

import { describe, expect, it } from 'vitest'
import { calcularEstado, calcularPlanoOriginal, pendenciasDeRegistro } from '../previsao'
import {
  MAX_OBSERVACAO,
  situacaoDaViagem,
  validarCorrecaoDaObservacao,
  validarRegistro,
  validarTextoDaObservacao,
} from '../registro'
import { congelar, ev, EVENTOS_CASO_1, EVENTOS_CASO_2, EVENTOS_CASO_3, h, PASSAGEIROS, PLANO } from './fixtures'
import type { DadosPlano } from '../tipos'

const original = congelar()
const emAndamento: DadosPlano = { ...PLANO, viagem: { ...PLANO.viagem, status: 'em_andamento', planoOriginal: original } }

describe('atualização gerada e observação não mexem no cálculo', () => {
  const casos = [
    ['caso 1', EVENTOS_CASO_1, h('07:00')],
    ['caso 2', EVENTOS_CASO_2, h('09:03')],
    ['caso 3', EVENTOS_CASO_3, h('10:00')],
  ] as const

  it.each(casos)('%s: previsão, atraso, situação e pendências iguais com e sem os eventos', (_nome, eventos, agora) => {
    const com = [...eventos, ev.atualizacao(agora, h('23:47'), 17), ev.observacao('Parada rápida', agora)]
    expect(calcularEstado(PLANO, original, com, agora)).toEqual(calcularEstado(PLANO, original, eventos, agora))
    expect(pendenciasDeRegistro(PLANO, com)).toEqual(pendenciasDeRegistro(PLANO, eventos))
    const sem = situacaoDaViagem(PLANO, original, eventos, agora)
    expect(situacaoDaViagem(PLANO, original, com, agora)).toEqual(sem)
  })

  it('o plano original continua idêntico', () => {
    const antes = structuredClone(original)
    const eventos = [...EVENTOS_CASO_2, ev.atualizacao(h('09:00')), ev.observacao('x', h('09:01'))]
    calcularEstado(PLANO, original, eventos, h('09:05'))
    const recalculado = calcularPlanoOriginal(PLANO, h('06:00'))
    expect(original).toEqual(antes)
    expect(recalculado.ok && recalculado.plano).toEqual(original)
  })

  it('no meio de uma parada aberta, o cronômetro e a parada não mudam', () => {
    const eventos = [...EVENTOS_CASO_3, ev.parada('almoco', 'inicio', h('10:30'))]
    const com = [...eventos, ev.observacao('Pneu furado', h('10:31')), ev.atualizacao(h('10:32'))]
    expect(situacaoDaViagem(PLANO, original, com, h('10:40'))).toEqual(situacaoDaViagem(PLANO, original, eventos, h('10:40')))
  })
})

describe('registro da observação e da atualização gerada', () => {
  const agora = h('09:20')
  const registrar = (conteudo: Parameters<typeof validarRegistro>[3], horario = agora) =>
    validarRegistro(emAndamento, original, EVENTOS_CASO_2, conteudo, horario, agora, PASSAGEIROS)

  it('observação: aceita agora e no passado, recusa o futuro', () => {
    expect(registrar({ tipo: 'observacao', dados: { texto: 'Chuva forte' } }).ok).toBe(true)
    expect(registrar({ tipo: 'observacao', dados: { texto: 'Chuva forte' } }, h('09:00')).ok).toBe(true)
    const r = registrar({ tipo: 'observacao', dados: { texto: 'Chuva forte' } }, h('09:21'))
    expect(r.ok).toBe(false)
  })

  it('observação: texto vazio, só espaços ou maior que o limite são recusados', () => {
    expect(registrar({ tipo: 'observacao', dados: { texto: '' } })).toEqual({ ok: false, motivo: 'Escreva a observação.' })
    expect(registrar({ tipo: 'observacao', dados: { texto: '   ' } }).ok).toBe(false)
    expect(registrar({ tipo: 'observacao', dados: { texto: 'a'.repeat(MAX_OBSERVACAO) } }).ok).toBe(true)
    expect(registrar({ tipo: 'observacao', dados: { texto: 'a'.repeat(MAX_OBSERVACAO + 1) } }).ok).toBe(false)
  })

  it('só com a viagem em andamento', () => {
    const concluida: DadosPlano = { ...emAndamento, viagem: { ...emAndamento.viagem, status: 'concluida' } }
    const r = validarRegistro(concluida, original, EVENTOS_CASO_2, { tipo: 'observacao', dados: { texto: 'x' } }, agora, agora, PASSAGEIROS)
    expect(r).toEqual({ ok: false, motivo: 'A viagem não está em andamento.' })
    const planejando = { ...PLANO, viagem: { ...PLANO.viagem, status: 'planejando' as const } }
    expect(
      validarRegistro(planejando, original, EVENTOS_CASO_2, { tipo: 'atualizacao_gerada', dados: { previsaoDestino: null, atrasoMin: null } }, agora, agora).ok,
    ).toBe(false)
  })

  it('atualização gerada: vale em qualquer situação da viagem em andamento', () => {
    expect(registrar({ tipo: 'atualizacao_gerada', dados: { previsaoDestino: h('23:47'), atrasoMin: 17 } }).ok).toBe(true)
  })

  it('validarTextoDaObservacao', () => {
    expect(validarTextoDaObservacao('ok').ok).toBe(true)
    expect(validarTextoDaObservacao('\n').ok).toBe(false)
  })
})

describe('correção da observação pela timeline', () => {
  const obs = ev.observacao('Texto antigo', h('09:00'))
  const eventos = [...EVENTOS_CASO_2, obs]
  const agora = h('09:30')

  it('aceita novo texto e horário até agora', () => {
    expect(validarCorrecaoDaObservacao(eventos, obs.id, 'Texto novo', h('08:50'), agora).ok).toBe(true)
    expect(validarCorrecaoDaObservacao(eventos, obs.id, 'Texto novo', agora, agora).ok).toBe(true)
  })

  it('recusa horário depois de agora, texto vazio ou longo, e evento que não é observação', () => {
    expect(validarCorrecaoDaObservacao(eventos, obs.id, 'x', h('09:31'), agora).ok).toBe(false)
    expect(validarCorrecaoDaObservacao(eventos, obs.id, ' ', h('09:00'), agora).ok).toBe(false)
    expect(validarCorrecaoDaObservacao(eventos, obs.id, 'a'.repeat(501), h('09:00'), agora).ok).toBe(false)
    expect(validarCorrecaoDaObservacao(eventos, EVENTOS_CASO_2[1]!.id, 'x', h('09:00'), agora)).toEqual({
      ok: false,
      motivo: 'Este evento não é uma observação.',
    })
    expect(validarCorrecaoDaObservacao(eventos, 'nao-existe', 'x', h('09:00'), agora).ok).toBe(false)
  })
})
