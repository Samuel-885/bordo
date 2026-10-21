import { describe, expect, it } from 'vitest'
import {
  alternarPassageiro,
  aplicarContagem,
  contextoDeSaida,
  contextoDeVolta,
  decisoesCompletas,
  eventosDaConferencia,
  iniciarConferencia,
  listaParaTela,
  modoPadrao,
  podeSair,
  quadroDeSituacao,
  resultadoDa,
  resumoABordo,
  validarConferencia,
  validarStatus,
} from '../conferencia'
import { passageirosEmTransito, passageirosEsperados } from '../passageiros'
import { situacaoDaViagem } from '../registro'
import type { Conferencia, Etapa } from '../tipos'
import { congelar, ETAPAS, ev, h, PASSAGEIROS, PLANO } from './fixtures'

const etapa = (id: string): Etapa => ETAPAS.find((e) => e.id === id)!
const ctxOrigem = () => contextoDeSaida('origem', PLANO, PASSAGEIROS, [])
const ctxMonlevade = () => contextoDeSaida('monlevade', PLANO, PASSAGEIROS, [])

describe('modo inicial da conferência', () => {
  it('origem e refeições: todos desceram; banheiro, descanso, ponto obrigatório e volta: só alguns', () => {
    expect(modoPadrao(etapa('origem'), 'saida')).toBe('todos_desceram')
    for (const categoria of ['almoco', 'cafe', 'jantar']) {
      expect(modoPadrao({ tipo: 'flexivel', categoria }, 'saida')).toBe('todos_desceram')
    }
    for (const categoria of ['banheiro', 'descanso']) {
      expect(modoPadrao({ tipo: 'flexivel', categoria }, 'saida')).toBe('so_alguns')
    }
    expect(modoPadrao(etapa('monlevade'), 'saida')).toBe('so_alguns')
    expect(modoPadrao({ tipo: 'flexivel', categoria: 'almoco' }, 'volta')).toBe('so_alguns')
  })

  it('o modo definido na etapa manda', () => {
    expect(modoPadrao({ tipo: 'flexivel', categoria: 'almoco', modoConferencia: 'so_alguns' }, 'saida')).toBe('so_alguns')
  })
})

describe('estado inicial', () => {
  it('origem: todos pendentes', () => {
    const ctx = ctxOrigem()
    const e = iniciarConferencia(ctx, PLANO.etapas, modoPadrao(etapa('origem'), 'saida'), etapa('origem'))
    expect(e.confirmados).toEqual([])
    expect(podeSair(ctx, e)).toBe(false)
  })

  it('ponto de embarque: quem já estava a bordo confirmado, quem embarca ali pendente', () => {
    const eventos = [ev.inicio(h('06:00')), ev.saida('origem', h('06:30')), ev.chegada('monlevade', h('08:25'))]
    const ctx = contextoDeSaida('monlevade', PLANO, PASSAGEIROS, eventos)
    const e = iniciarConferencia(ctx, PLANO.etapas, 'so_alguns', etapa('monlevade'))
    expect(ctx.esperados).toHaveLength(38)
    expect(e.confirmados).toHaveLength(35)
    expect(listaParaTela(ctx, e).slice(0, 3).map((i) => i.passageiro.id)).toEqual(['p-36', 'p-37', 'p-38'])
    expect(quadroDeSituacao(ctx, e)).toMatchObject({ todosABordo: false, confirmados: 35, total: 38 })
  })

  it('refeição: todos pendentes; banheiro: todos confirmados', () => {
    const almoco = { ...etapa('almoco'), categoria: 'almoco' }
    const ctx = ctxMonlevade()
    expect(iniciarConferencia(ctx, PLANO.etapas, 'todos_desceram', almoco).confirmados).toEqual([])
    const banheiro = { ...etapa('almoco'), categoria: 'banheiro' }
    expect(iniciarConferencia(ctx, PLANO.etapas, 'so_alguns', banheiro).confirmados).toHaveLength(ctx.esperados.length)
  })

  it('trocar o modo reinicia a lista no estado do novo modo', () => {
    const ctx = ctxMonlevade()
    const almoco = { ...etapa('almoco'), categoria: 'almoco' }
    let e = iniciarConferencia(ctx, PLANO.etapas, 'todos_desceram', almoco)
    e = alternarPassageiro(e, 'p-01')
    expect(e.confirmados).toEqual(['p-01'])
    e = iniciarConferencia(ctx, PLANO.etapas, 'so_alguns', almoco)
    expect(e.confirmados).toHaveLength(ctx.esperados.length)
    e = iniciarConferencia(ctx, PLANO.etapas, 'todos_desceram', almoco)
    expect(e.confirmados).toEqual([])
  })

  it('na volta à estrada o modo é "só alguns": todos confirmados', () => {
    const eventos = [ev.inicio(h('06:00')), ev.saida('origem', h('06:30'))]
    const ctx = contextoDeVolta('monlevade', PLANO, PASSAGEIROS, eventos)
    const e = iniciarConferencia(ctx, PLANO.etapas, modoPadrao(etapa('monlevade'), 'volta'), etapa('monlevade'))
    expect(ctx.esperados).toHaveLength(35)
    expect(e.confirmados).toHaveLength(35)
    expect(podeSair(ctx, e)).toBe(true)
  })
})

describe('quadro de situação e lista', () => {
  it('ATENÇÃO com X/Y e quem falta; TODOS A BORDO quando completa', () => {
    const ctx = ctxOrigem()
    let e = iniciarConferencia(ctx, PLANO.etapas, 'so_alguns', etapa('almoco'))
    expect(quadroDeSituacao(ctx, e)).toEqual({ todosABordo: true, confirmados: 35, total: 35 })
    e = alternarPassageiro(e, 'p-07')
    expect(quadroDeSituacao(ctx, e)).toEqual({ todosABordo: false, confirmados: 34, total: 35, faltam: ['Passageiro 07'] })
  })

  it('pendentes primeiro; toque marca e desmarca', () => {
    const ctx = ctxOrigem()
    let e = iniciarConferencia(ctx, PLANO.etapas, 'so_alguns', etapa('almoco'))
    e = alternarPassageiro(e, 'p-20')
    expect(listaParaTela(ctx, e)[0]).toMatchObject({ confirmado: false, passageiro: { id: 'p-20' } })
    e = alternarPassageiro(e, 'p-20')
    expect(listaParaTela(ctx, e).every((i) => i.confirmado)).toBe(true)
  })
})

describe('contagem rápida na conferência', () => {
  it('número igual aos esperados confirma todos e registra "completa por contagem"', () => {
    const ctx = ctxOrigem()
    const inicial = iniciarConferencia(ctx, PLANO.etapas, 'todos_desceram', etapa('origem'))
    const r = aplicarContagem(ctx, inicial, 35)
    expect(r.resposta.completa).toBe(true)
    expect(podeSair(ctx, r.estado)).toBe(true)
    expect(resultadoDa(ctx, r.estado)).toBe('completa_por_contagem')
  })

  it('número diferente mostra a diferença e não altera ninguém', () => {
    const ctx = ctxOrigem()
    const inicial = alternarPassageiro(iniciarConferencia(ctx, PLANO.etapas, 'todos_desceram', etapa('origem')), 'p-03')
    const r = aplicarContagem(ctx, inicial, 34)
    expect(r.resposta).toEqual({ completa: false, diferenca: 1, sentido: 'faltando' })
    expect(r.estado).toBe(inicial)
  })

  it('mexer em alguém depois da contagem volta o resultado para "completa"', () => {
    const ctx = ctxOrigem()
    let e = aplicarContagem(ctx, iniciarConferencia(ctx, PLANO.etapas, 'todos_desceram', etapa('origem')), 35).estado
    e = alternarPassageiro(alternarPassageiro(e, 'p-01'), 'p-01')
    expect(resultadoDa(ctx, e)).toBe('completa')
  })
})

describe('sair sem todos', () => {
  it('cada pendente precisa de status e motivo', () => {
    const ctx = ctxOrigem()
    const e = alternarPassageiro(iniciarConferencia(ctx, PLANO.etapas, 'so_alguns', etapa('almoco')), 'p-05')
    const pendentes = [PASSAGEIROS[4]!]
    expect(decisoesCompletas(pendentes, [])).toBe(false)
    expect(decisoesCompletas(pendentes, [{ passageiroId: 'p-05', status: 'nao_embarcou', motivo: ' ' }])).toBe(false)
    expect(decisoesCompletas(pendentes, [{ passageiroId: 'p-05', status: null, motivo: 'x' }])).toBe(false)
    expect(decisoesCompletas(pendentes, [{ passageiroId: 'p-05', status: 'nao_embarcou', motivo: 'Não apareceu' }])).toBe(true)
    expect(() => eventosDaConferencia(ctx, e, [])).toThrow()
  })

  it('gera a conferência incompleta e um status por pendente, ligados à etapa', () => {
    const ctx = ctxOrigem()
    const e = alternarPassageiro(iniciarConferencia(ctx, PLANO.etapas, 'so_alguns', etapa('almoco')), 'p-05')
    const [conf, status, ...resto] = eventosDaConferencia(ctx, e, [{ passageiroId: 'p-05', status: 'saiu_da_viagem', motivo: ' Foi de carro ' }])
    expect(resto).toEqual([])
    expect(conf).toMatchObject({
      tipo: 'conferencia',
      etapaId: 'origem',
      dados: { momento: 'saida', resultado: 'incompleta', pendentes: ['p-05'] },
    })
    expect(status).toEqual({
      tipo: 'status_passageiro',
      etapaId: 'origem',
      dados: { passageiroId: 'p-05', status: 'saiu_da_viagem', motivo: 'Foi de carro' },
    })
  })

  it('o status vale da etapa em diante: o esperado seguinte já não o inclui (caso 13 com conferência)', () => {
    const ctx = ctxMonlevade()
    expect(ctx.esperados).toHaveLength(38)
    const status = ev.status('monlevade', 'p-38', 'nao_embarcou', 'Não apareceu', h('08:40'))
    expect(passageirosEsperados('monlevade', PLANO.etapas, PASSAGEIROS, [status])).toHaveLength(37)
  })
})

describe('esperados em trânsito', () => {
  it('quem desembarca na próxima etapa ainda está a bordo; quem saiu da viagem na volta não conta', () => {
    const passageiros = [
      ...PASSAGEIROS.slice(0, 2),
      { ...PASSAGEIROS[2]!, etapaDesembarqueId: 'monlevade' },
    ]
    expect(passageirosEmTransito('monlevade', PLANO.etapas, passageiros, [])).toHaveLength(3)
    expect(passageirosEmTransito('almoco', PLANO.etapas, passageiros, [])).toHaveLength(2)
    const saiu = ev.status('monlevade', 'p-01', 'saiu_da_viagem', 'Foi de carro', h('07:30'))
    expect(passageirosEmTransito('monlevade', PLANO.etapas, passageiros, [saiu]).map((p) => p.id)).toEqual(['p-02', 'p-03'])
  })
})

describe('validação dos eventos de conferência', () => {
  const esperados = ctxOrigem().esperados

  it('a conferência cobre exatamente os esperados', () => {
    const ids = esperados.map((p) => p.id)
    const ok: Conferencia = { modo: 'so_alguns', confirmados: ids, pendentes: [], resultado: 'completa' }
    expect(validarConferencia(ok, esperados).ok).toBe(true)
    expect(validarConferencia({ ...ok, confirmados: ids.slice(1) }, esperados).ok).toBe(false)
    expect(validarConferencia({ ...ok, confirmados: [...ids, 'p-99'] }, esperados).ok).toBe(false)
    expect(validarConferencia({ ...ok, confirmados: ids.slice(1), pendentes: [ids[0]!] }, esperados).ok).toBe(false)
    expect(validarConferencia({ ...ok, confirmados: ids.slice(1), pendentes: [ids[0]!], resultado: 'incompleta' }, esperados).ok).toBe(true)
  })

  it('status só "não embarcou" ou "saiu da viagem", para esperado', () => {
    expect(validarStatus('p-01', 'nao_embarcou', esperados).ok).toBe(true)
    expect(validarStatus('p-01', 'ativo', esperados).ok).toBe(false)
    expect(validarStatus('p-38', 'nao_embarcou', esperados).ok).toBe(false)
  })
})

describe('a bordo na tela principal', () => {
  const original = congelar()
  const resumo = (eventos: Parameters<typeof situacaoDaViagem>[2], passageiros = PASSAGEIROS) => {
    const s = situacaoDaViagem(PLANO, original, eventos, h('13:00'))
    return resumoABordo(PLANO, passageiros, eventos, s)
  }
  const conferencia = (etapaId: string, horario: ReturnType<typeof h>, momento?: 'saida' | 'volta') =>
    ev.conferencia(etapaId, horario, momento)

  it('sem passageiros cadastrados, nada', () => {
    expect(resumo([ev.inicio(h('06:00'))], [])).toBeNull()
  })

  it('aguardando a saída e parado: esperados na saída, sem X', () => {
    expect(resumo([ev.inicio(h('06:00'))])).toEqual({ tipo: 'esperados', total: 35 })
    const parado = [ev.inicio(h('06:00')), ev.saida('origem', h('06:30')), ev.chegada('monlevade', h('08:25'))]
    expect(resumo(parado)).toEqual({ tipo: 'esperados', total: 38 })
  })

  it('em trânsito: Y/Y com o horário da última conferência', () => {
    const eventos = [ev.inicio(h('06:00')), conferencia('origem', h('06:30')), ev.saida('origem', h('06:30'))]
    expect(resumo(eventos)).toEqual({ tipo: 'conferido', total: 35, conferidoEm: h('06:30') })
  })

  it('em trânsito com a saída gravada sem conferência: sem conferência', () => {
    const eventos = [ev.inicio(h('06:00')), ev.saida('origem', h('06:30'))]
    expect(resumo(eventos)).toEqual({ tipo: 'conferido', total: 35, conferidoEm: null })
  })

  it('a conferência da saída anterior não vale para a saída seguinte sem conferência', () => {
    const eventos = [
      ev.inicio(h('06:00')),
      conferencia('origem', h('06:30')),
      ev.saida('origem', h('06:30')),
      ev.chegada('monlevade', h('08:25')),
      ev.saida('monlevade', h('08:40')),
    ]
    expect(resumo(eventos)).toEqual({ tipo: 'conferido', total: 38, conferidoEm: null })
  })

  it('a conferência da volta à estrada é a mais recente do trecho', () => {
    const eventos = [
      ev.inicio(h('06:00')),
      conferencia('origem', h('06:30')),
      ev.saida('origem', h('06:30')),
      ev.parada('monlevade', 'inicio', h('07:00')),
      ev.parada('monlevade', 'fim', h('07:20')),
      conferencia('monlevade', h('07:20'), 'volta'),
    ]
    expect(resumo(eventos)).toEqual({ tipo: 'conferido', total: 35, conferidoEm: h('07:20') })
  })

  it('viagem concluída: nada', () => {
    const s = { situacao: 'chegamos', etapaAtualId: null, proximaEtapaId: null }
    expect(resumoABordo(PLANO, PASSAGEIROS, [], s)).toBeNull()
  })
})
