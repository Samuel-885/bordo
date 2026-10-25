// Regras combinadas na aprovação do plano da fase 1, além dos 15 casos.

import { describe, expect, it } from 'vitest'
import { classificarAtraso } from '../atraso'
import { calcularEstado, calcularPlanoOriginal } from '../previsao'
import { validarRecalibracao } from '../recalibracao'
import { aplicarFatorOnibus, duracaoTrecho } from '../trechos'
import type { DadosPlano } from '../tipos'
import { classificar } from '../viabilidade'
import { congelar, esperarHorario, etapaDe, ev, EVENTOS_CASO_2, EVENTOS_CASO_3, ETAPAS, h, LOCAIS, PLANO } from './fixtures'

describe('recalibração feita parado na etapa anterior', () => {
  const original = congelar()
  // Parados em Monlevade desde 08:55 (caso 2); às 09:00 o Google Maps diz 12:40: trecho de 3h40.
  const recal = ev.recalibracao('almoco', h('12:40'), h('09:00'))
  const eventos = [...EVENTOS_CASO_2, recal]

  it('é aceita parado na etapa anterior', () => {
    expect(validarRecalibracao(PLANO, original, EVENTOS_CASO_2, 'almoco', h('12:40'), h('09:00'))).toEqual({ ok: true })
  })

  it('vira duração do trecho, aplicada a partir da saída prevista', () => {
    const estado = calcularEstado(PLANO, original, eventos, h('09:00'))
    esperarHorario(etapaDe(estado, 'monlevade').saida?.instante, h('09:10'))
    const chegada = etapaDe(estado, 'almoco').chegada
    esperarHorario(chegada?.instante, h('12:50'))
    expect(chegada?.origem).toBe('recalibracao')
  })

  it('se a saída atrasar, a chegada atrasa junto', () => {
    const atrasada = calcularEstado(PLANO, original, eventos, h('09:25'))
    esperarHorario(etapaDe(atrasada, 'almoco').chegada?.instante, h('13:05'))

    const saiu = calcularEstado(PLANO, original, [...eventos, ev.saida('monlevade', h('09:30'))], h('09:30'))
    esperarHorario(etapaDe(saiu, 'almoco').chegada?.instante, h('13:10'))
  })

  it('a regra do relógio continua valendo por cima', () => {
    const estado = calcularEstado(PLANO, original, [...eventos, ev.saida('monlevade', h('09:30'))], h('13:20'))
    const chegada = etapaDe(estado, 'almoco').chegada
    esperarHorario(chegada?.instante, h('13:20'))
    expect(chegada?.origem).toBe('relogio')
  })
})

describe('recalibração feita em trânsito', () => {
  const original = congelar()
  const eventos = [...EVENTOS_CASO_3, ev.recalibracao('almoco', h('13:02'), h('11:40'))]

  it('soma o tempo das paradas iniciadas depois dela', () => {
    const comParada = [...eventos, ev.parada('almoco', 'inicio', h('12:00')), ev.parada('almoco', 'fim', h('12:10'))]
    esperarHorario(etapaDe(calcularEstado(PLANO, original, comParada, h('12:15')), 'almoco').chegada?.instante, h('13:12'))
  })

  it('a regra do relógio continua valendo por cima', () => {
    const chegada = etapaDe(calcularEstado(PLANO, original, eventos, h('13:10')), 'almoco').chegada
    esperarHorario(chegada?.instante, h('13:10'))
    expect(chegada?.origem).toBe('relogio')
  })

  it('o destino só aceita recalibração quando é a próxima etapa (antes disso, não)', () => {
    expect(validarRecalibracao(PLANO, original, EVENTOS_CASO_3, 'destino', h('23:59'), h('11:40')).ok).toBe(false)
  })
})

describe('recalibração do destino (liberada em 25/10/2026)', () => {
  const original = congelar()
  // Tudo no horário do plano até o jantar: chegada 20:30, saída 21:20.
  const NO_JANTAR = [
    ev.inicio(h('06:00')),
    ev.saida('origem', h('06:30')),
    ev.chegada('monlevade', h('08:25')),
    ev.saida('monlevade', h('08:40')),
    ev.chegada('almoco', h('12:00')),
    ev.saida('almoco', h('13:00')),
    ev.chegada('cafe', h('16:00')),
    ev.saida('cafe', h('16:30')),
    ev.chegada('jantar', h('20:30')),
  ]
  const EM_TRANSITO = [...NO_JANTAR, ev.saida('jantar', h('21:20'))]

  it('em trânsito para o destino: o horário informado é a chegada prevista (origem Google Maps)', () => {
    expect(validarRecalibracao(PLANO, original, EM_TRANSITO, 'destino', h('23:50'), h('21:30'))).toEqual({ ok: true })
    const estado = calcularEstado(PLANO, original, [...EM_TRANSITO, ev.recalibracao('destino', h('23:50'), h('21:30'))], h('21:30'))
    const chegada = etapaDe(estado, 'destino').chegada
    esperarHorario(chegada?.instante, h('23:50'))
    expect(chegada?.origem).toBe('recalibracao')
    esperarHorario(estado.chegadaDestino?.instante, h('23:50'))
    expect(estado.atrasoDestinoMin).toBe(20)
  })

  it('parado no jantar (etapa anterior): vira duração do trecho, a partir da saída prevista', () => {
    // Parados no jantar desde 20:30 (saída prevista 21:20). Às 20:40 o Maps diz 2h30 até o destino (23:10).
    expect(validarRecalibracao(PLANO, original, NO_JANTAR, 'destino', h('23:10'), h('20:40'))).toEqual({ ok: true })
    const eventos = [...NO_JANTAR, ev.recalibracao('destino', h('23:10'), h('20:40'))]
    const parado = calcularEstado(PLANO, original, eventos, h('20:40'))
    esperarHorario(etapaDe(parado, 'destino').chegada?.instante, h('23:50'))
    // Se a saída atrasar, a chegada atrasa junto.
    const saiu = calcularEstado(PLANO, original, [...eventos, ev.saida('jantar', h('21:40'))], h('21:40'))
    esperarHorario(etapaDe(saiu, 'destino').chegada?.instante, h('00:10', 1))
  })

  it('o horário no passado continua recusado, e o destino já alcançado também', () => {
    expect(validarRecalibracao(PLANO, original, EM_TRANSITO, 'destino', h('21:00'), h('21:30')).ok).toBe(false)
    const chegou = [...EM_TRANSITO, ev.chegada('destino', h('23:40'))]
    expect(validarRecalibracao(PLANO, original, chegou, 'destino', h('23:59'), h('23:45')).ok).toBe(false)
  })

  it('a regra do relógio continua valendo por cima', () => {
    const eventos = [...EM_TRANSITO, ev.recalibracao('destino', h('23:50'), h('21:30'))]
    const chegada = etapaDe(calcularEstado(PLANO, original, eventos, h('23:55')), 'destino').chegada
    esperarHorario(chegada?.instante, h('23:55'))
    expect(chegada?.origem).toBe('relogio')
  })
})

describe('duração dos trechos', () => {
  it('rota × fator ônibus arredonda para cima', () => {
    expect(aplicarFatorOnibus(100, 1.15)).toBe(115)
    expect(aplicarFatorOnibus(60, 1.15)).toBe(69)
    expect(aplicarFatorOnibus(97, 1.15)).toBe(112)
  })

  it('alternativa fora do roteiro usa rota com fator; sem trecho fica sem tempo', () => {
    const plano: DadosPlano = {
      ...PLANO,
      trechos: [{ etapaOrigemId: 'monlevade', localOrigemId: 'l-monlevade', etapaDestinoId: 'almoco', localDestinoId: 'l-rest-b', duracaoMin: 97, fonte: 'rota' }],
    }
    const [, monlevade, almoco] = ETAPAS
    expect(duracaoTrecho(plano, monlevade!, 'l-monlevade', almoco!, 'l-rest-b')).toEqual({ minutos: 112, fonte: 'rota' })
    expect(duracaoTrecho(plano, monlevade!, 'l-monlevade', almoco!, 'l-rest-c')).toEqual({ minutos: null, fonte: null })
    expect(duracaoTrecho(plano, monlevade!, 'l-monlevade', almoco!, 'l-rest-a')).toEqual({ minutos: 200, fonte: 'roteiro' })
  })

  it('trecho sem tempo bloqueia o início da viagem', () => {
    // Almoço sem horário de roteiro e sem trechos guardados.
    const plano: DadosPlano = {
      ...PLANO,
      etapas: ETAPAS.map((e) => (e.id === 'almoco' ? { ...e, chegadaRoteiro: undefined } : e)),
    }
    const r = calcularPlanoOriginal(plano, h('06:00'))
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.bloqueios).toEqual([
        { tipo: 'trecho_sem_tempo', etapaDestinoId: 'almoco' },
        { tipo: 'trecho_sem_tempo', etapaDestinoId: 'cafe' },
      ])
    }
  })
})

describe('funcionamento dos locais', () => {
  const bar = { ...LOCAIS[0]!, abre: '18:00', fecha: '02:00' }

  it('fecha antes de abrir = fecha no dia seguinte', () => {
    expect(classificar(bar, h('23:00'), 60)).toMatchObject({ classe: 'viavel', margemMin: 120 })
    expect(classificar(bar, h('00:30', 1), 60)).toMatchObject({ classe: 'viavel', margemMin: 30 })
    expect(classificar(bar, h('01:30', 1), 60)).toMatchObject({ classe: 'pouca_margem', margemMin: -30 })
    expect(classificar(bar, h('02:00', 1), 60).classe).toBe('inviavel')
    expect(classificar(bar, h('17:59'), 60).classe).toBe('inviavel')
  })

  it('sem horário cadastrado mostra só a chegada; sem chegada é sem tempo', () => {
    expect(classificar(LOCAIS[0]!, h('12:00'), 60).classe).toBe('sem_horario')
    expect(classificar(bar, null, 60).classe).toBe('sem_tempo')
  })
})

describe('exibição do atraso', () => {
  it('até 5 min para mais ou para menos é "no horário"; adiantamento é negativo', () => {
    expect(classificarAtraso(5).situacao).toBe('no_horario')
    expect(classificarAtraso(-5).situacao).toBe('no_horario')
    expect(classificarAtraso(6).situacao).toBe('atrasado')
    expect(classificarAtraso(-6)).toEqual({ situacao: 'adiantado', minutos: -6 })
  })
})
