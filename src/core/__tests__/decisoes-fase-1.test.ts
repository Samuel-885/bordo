// Decisões tomadas na revisão da fase 1 (seção "Decisões da fase 1" da especificação).

import { describe, expect, it } from 'vitest'
import { corrigirHorario, criarEvento } from '../eventos'
import { calcularEstado, calcularPlanoOriginal, pendenciasDeRegistro } from '../previsao'
import { validarRecalibracao } from '../recalibracao'
import { instante } from '../tempo'
import { congelar, esperarHorario, etapaDe, ev, EVENTOS_CASO_2, EVENTOS_CASO_3, h, PLANO } from './fixtures'

describe('recalibração aguardando a saída da origem', () => {
  const original = congelar()
  const inicio = [ev.inicio(h('06:00'))]
  // Às 06:10, ainda na origem, o Google Maps diz Monlevade 08:20: trecho de 2h10.
  const eventos = [...inicio, ev.recalibracao('monlevade', h('08:20'), h('06:10'))]

  it('é aceita antes da saída', () => {
    expect(validarRecalibracao(PLANO, original, inicio, 'monlevade', h('08:20'), h('06:10'))).toEqual({ ok: true })
  })

  it('só para a primeira etapa depois da origem', () => {
    expect(validarRecalibracao(PLANO, original, inicio, 'almoco', h('12:20'), h('06:10')).ok).toBe(false)
  })

  it('vira duração do trecho, a partir da saída prevista', () => {
    const chegada = etapaDe(calcularEstado(PLANO, original, eventos, h('06:10')), 'monlevade').chegada
    esperarHorario(chegada?.instante, h('08:40'))
    expect(chegada?.origem).toBe('recalibracao')
  })

  it('acompanha a saída real e a saída que atrasa pelo relógio', () => {
    esperarHorario(etapaDe(calcularEstado(PLANO, original, eventos, h('06:45')), 'monlevade').chegada?.instante, h('08:55'))
    const saiu = [...eventos, ev.saida('origem', h('06:47'))]
    esperarHorario(etapaDe(calcularEstado(PLANO, original, saiu, h('06:47')), 'monlevade').chegada?.instante, h('08:57'))
  })
})

describe('pendências de registro', () => {
  it('sem esquecimentos, não há pendências', () => {
    expect(pendenciasDeRegistro(PLANO, EVENTOS_CASO_3)).toEqual([])
    expect(pendenciasDeRegistro(PLANO, [ev.inicio(h('06:00'))])).toEqual([])
  })

  it('chegada registrada sem a saída da origem', () => {
    const eventos = [ev.inicio(h('06:00')), ev.chegada('monlevade', h('08:30'))]
    expect(pendenciasDeRegistro(PLANO, eventos)).toEqual([{ etapaId: 'origem', momento: 'saida' }])
  })

  it('chegada registrada sem a saída da etapa anterior', () => {
    const eventos = [
      ev.inicio(h('06:00')),
      ev.saida('origem', h('06:30')),
      ev.chegada('monlevade', h('08:25')),
      ev.chegada('almoco', h('12:00')),
    ]
    expect(pendenciasDeRegistro(PLANO, eventos)).toEqual([{ etapaId: 'monlevade', momento: 'saida' }])
  })

  it('etapa pulada não gera pendência', () => {
    const eventos = [
      ...EVENTOS_CASO_3,
      ev.chegada('almoco', h('12:34')),
      ev.saida('almoco', h('13:34')),
      ev.pular('cafe', h('14:00')),
      ev.chegada('jantar', h('20:30')),
    ]
    expect(pendenciasDeRegistro(PLANO, eventos)).toEqual([])
  })
})

describe('horários de evento em minutos inteiros', () => {
  const base = {
    id: 'ev-x',
    viagemId: 'viagem-teste',
    horarioFato: instante('2026-11-14T06:47:42-03:00'),
    registradoEm: instante('2026-11-14T06:48:05.123-03:00'),
  }

  it('arredonda para baixo horário do fato e do registro ao criar', () => {
    const e = criarEvento(base, { tipo: 'saida', etapaId: 'origem' })
    esperarHorario(e.horarioFato, h('06:47'))
    esperarHorario(e.registradoEm, h('06:48'))
    expect(e.horarioFato).toBe('2026-11-14T06:47:00-03:00')
  })

  it('arredonda para baixo o horário informado na recalibração', () => {
    const e = criarEvento(base, { tipo: 'recalibracao', etapaId: 'almoco', dados: { horario: instante('2026-11-14T13:02:59-03:00') } })
    expect(e.tipo === 'recalibracao' && e.dados.horario).toBe('2026-11-14T13:02:00-03:00')
  })

  it('arredonda para baixo ao corrigir, sem mudar o registro', () => {
    const e = criarEvento(base, { tipo: 'chegada', etapaId: 'monlevade' })
    const corrigido = corrigirHorario(e, instante('2026-11-14T08:55:30-03:00'))
    esperarHorario(corrigido.horarioFato, h('08:55'))
    expect(corrigido.registradoEm).toBe(e.registradoEm)
  })

  it('atraso sai em minutos inteiros', () => {
    const eventos = [
      ev.inicio(h('06:00')),
      ev.saida('origem', instante('2026-11-14T06:47:42-03:00')),
    ]
    expect(calcularEstado(PLANO, congelar(), eventos, h('06:50')).atrasoDestinoMin).toBe(17)
  })
})

describe('relógio arredondado para baixo, para o minuto, na entrada do cálculo', () => {
  const original = congelar()

  it('a regra do relógio puxa a previsão para o minuto atual, sem segundos', () => {
    const estado = calcularEstado(PLANO, original, EVENTOS_CASO_2, instante('2026-11-14T09:20:37-03:00'))
    const saida = etapaDe(estado, 'monlevade').saida
    expect(saida?.instante).toBe('2026-11-14T09:20:00-03:00')
    expect(saida?.origem).toBe('relogio')
    expect(estado.atrasoDestinoMin).toBe(40)
  })

  it('a parada não planejada em andamento conta minutos inteiros', () => {
    const eventos = [...EVENTOS_CASO_3, ev.parada('almoco', 'inicio', h('10:00'))]
    const estado = calcularEstado(PLANO, original, eventos, instante('2026-11-14T10:10:59-03:00'))
    esperarHorario(etapaDe(estado, 'almoco').chegada?.instante, h('12:44'))
  })

  it('a validação da recalibração compara com o minuto atual', () => {
    const r = validarRecalibracao(PLANO, original, EVENTOS_CASO_3, 'almoco', h('12:05'), instante('2026-11-14T12:05:30-03:00'))
    expect(r).toEqual({ ok: true })
  })

  it('o plano original é congelado no minuto', () => {
    const r = calcularPlanoOriginal(PLANO, instante('2026-11-14T06:00:45-03:00'))
    expect(r.ok && r.plano.congeladoEm).toBe('2026-11-14T06:00:00-03:00')
  })
})
