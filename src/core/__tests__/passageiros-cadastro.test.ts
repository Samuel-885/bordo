import { describe, expect, it } from 'vitest'
import { avisosDoPlano } from '../avisos'
import { eventosDaConferencia, contextoDeSaida, iniciarConferencia, alternarPassageiro } from '../conferencia'
import {
  etapasDeDesembarque,
  etapasDeEmbarque,
  validarCadastro,
  validarExclusao,
} from '../passageiros'
import { estadosDoPlano } from '../previsao'
import { validarRegistro } from '../registro'
import { criarEvento } from '../eventos'
import { congelar, ETAPAS, ev, h, PASSAGEIROS, PLANO } from './fixtures'

const novo = { nome: 'Maria S.', etapaEmbarqueId: 'origem', etapaDesembarqueId: null }
const planejando = { statusViagem: 'planejando', eventos: [] } as const

describe('etapas dos selects', () => {
  it('embarque: origem e pontos obrigatórios; desembarque: pontos obrigatórios e destino', () => {
    expect(etapasDeEmbarque(ETAPAS).map((e) => e.id)).toEqual(['origem', 'monlevade'])
    expect(etapasDeDesembarque(ETAPAS).map((e) => e.id)).toEqual(['monlevade', 'destino'])
  })
})

describe('cadastro de passageiro', () => {
  it('aceita nome, embarque e desembarque padrão (destino)', () => {
    expect(validarCadastro(novo, ETAPAS, planejando).ok).toBe(true)
  })

  it('recusa nome vazio, etapa fora das permitidas e desembarque que não vem depois do embarque', () => {
    expect(validarCadastro({ ...novo, nome: '  ' }, ETAPAS, planejando).ok).toBe(false)
    expect(validarCadastro({ ...novo, etapaEmbarqueId: 'almoco' }, ETAPAS, planejando).ok).toBe(false)
    expect(validarCadastro({ ...novo, etapaEmbarqueId: 'destino' }, ETAPAS, planejando).ok).toBe(false)
    expect(validarCadastro({ ...novo, etapaDesembarqueId: 'origem' }, ETAPAS, planejando).ok).toBe(false)
    expect(validarCadastro({ ...novo, etapaDesembarqueId: 'cafe' }, ETAPAS, planejando).ok).toBe(false)
    expect(validarCadastro({ ...novo, etapaEmbarqueId: 'monlevade', etapaDesembarqueId: 'monlevade' }, ETAPAS, planejando).ok).toBe(false)
    expect(validarCadastro({ ...novo, etapaDesembarqueId: 'monlevade' }, ETAPAS, planejando).ok).toBe(true)
  })

  it('viagem em andamento: adicionar alguém de última hora só em etapa de onde ainda não saímos', () => {
    const eventos = [ev.inicio(h('06:00')), ev.saida('origem', h('06:30'))]
    const contexto = { statusViagem: 'em_andamento', eventos } as const
    expect(validarCadastro({ ...novo, etapaEmbarqueId: 'monlevade' }, ETAPAS, contexto).ok).toBe(true)
    const r = validarCadastro(novo, ETAPAS, contexto)
    expect(r).toEqual({ ok: false, motivo: 'O ônibus já saiu desse ponto de embarque.' })
  })

  it('viagem em andamento: editar só o nome de quem embarcou em etapa já deixada é permitido', () => {
    const eventos = [ev.inicio(h('06:00')), ev.saida('origem', h('06:30'))]
    const atual = PASSAGEIROS[0]!
    const r = validarCadastro({ nome: 'Outro nome', etapaEmbarqueId: atual.etapaEmbarqueId, etapaDesembarqueId: null }, ETAPAS, {
      statusViagem: 'em_andamento',
      eventos,
      atual,
    })
    expect(r.ok).toBe(true)
  })

  it('quem já passou por conferência só pode mudar o nome', () => {
    const ctx = contextoDeSaida('origem', PLANO, PASSAGEIROS, [])
    const conteudos = eventosDaConferencia(ctx, iniciarConferencia(ctx, PLANO.etapas, 'so_alguns', ETAPAS[2]!), [])
    const eventos = [ev.inicio(h('06:00')), criarEvento({ id: 'c', viagemId: 'v', horarioFato: h('06:30'), registradoEm: h('06:30') }, conteudos[0]!)]
    const atual = PASSAGEIROS[36]! // embarca em Monlevade, ainda não deixada
    const mudaEtapa = validarCadastro({ nome: atual.nome, etapaEmbarqueId: 'origem', etapaDesembarqueId: null }, ETAPAS, {
      statusViagem: 'em_andamento',
      eventos,
      atual: { ...atual, etapaEmbarqueId: 'origem', viagemId: 'v' },
    })
    expect(mudaEtapa.ok).toBe(true) // não aparece na conferência de Ipatinga: ainda pode mudar
    const noHistorico = PASSAGEIROS[0]!
    const r = validarCadastro({ nome: noHistorico.nome, etapaEmbarqueId: 'monlevade', etapaDesembarqueId: null }, ETAPAS, {
      statusViagem: 'em_andamento',
      eventos,
      atual: noHistorico,
    })
    expect(r.ok).toBe(false)
  })

  it('viagem concluída não aceita mudança', () => {
    expect(validarCadastro(novo, ETAPAS, { statusViagem: 'concluida', eventos: [] }).ok).toBe(false)
  })
})

describe('exclusão de passageiro', () => {
  it('planejando: livre. Em andamento: só quem nunca apareceu em conferência nem teve status', () => {
    expect(validarExclusao('p-01', planejando).ok).toBe(true)
    const status = ev.status('origem', 'p-01', 'nao_embarcou', 'x', h('06:30'))
    expect(validarExclusao('p-01', { statusViagem: 'em_andamento', eventos: [status] }).ok).toBe(false)
    expect(validarExclusao('p-02', { statusViagem: 'em_andamento', eventos: [status] }).ok).toBe(true)
    expect(validarExclusao('p-02', { statusViagem: 'concluida', eventos: [] }).ok).toBe(false)
  })
})

describe('aviso de nenhum passageiro cadastrado', () => {
  const estados = estadosDoPlano(PLANO)
  it('avisa sem bloquear quando a lista está vazia', () => {
    expect(avisosDoPlano(PLANO, estados, [])).toContainEqual({ tipo: 'sem_passageiros' })
  })
  it('não avisa com passageiros; sem a lista, não opina', () => {
    expect(avisosDoPlano(PLANO, estados, PASSAGEIROS)).not.toContainEqual({ tipo: 'sem_passageiros' })
    expect(avisosDoPlano(PLANO, estados)).not.toContainEqual({ tipo: 'sem_passageiros' })
  })
})

describe('registro dos eventos de conferência (travas)', () => {
  const original = congelar()
  const agora = h('09:00')
  const base = [ev.inicio(h('06:00')), ev.saida('origem', h('06:30')), ev.chegada('monlevade', h('08:25'))]
  const validar = (eventos: typeof base, conteudo: Parameters<typeof validarRegistro>[3]) =>
    validarRegistro(PLANO, original, eventos, conteudo, agora, agora, PASSAGEIROS)

  it('conferência na etapa em que estamos, cobrindo os esperados', () => {
    const ctx = contextoDeSaida('monlevade', PLANO, PASSAGEIROS, base)
    const e = iniciarConferencia(ctx, PLANO.etapas, 'so_alguns', ETAPAS[1]!)
    const todos = ['p-36', 'p-37', 'p-38'].reduce(alternarPassageiro, e)
    const [conf] = eventosDaConferencia(ctx, todos, [])
    expect(validar(base, conf!).ok).toBe(true)
    expect(validar(base, { ...conf!, etapaId: 'almoco' } as typeof conf & object).ok).toBe(false)
  })

  it('status: só de esperado, na etapa em que estamos', () => {
    const status = { tipo: 'status_passageiro', etapaId: 'monlevade', dados: { passageiroId: 'p-38', status: 'nao_embarcou', motivo: 'x' } } as const
    expect(validar(base, status).ok).toBe(true)
    expect(validar(base, { ...status, dados: { ...status.dados, status: 'ativo' } }).ok).toBe(false)
    expect(validar(base, { ...status, etapaId: 'almoco' }).ok).toBe(false)
  })

  it('sem a lista de passageiros, só a trava de horário (demonstração em memória)', () => {
    const status = { tipo: 'status_passageiro', etapaId: 'almoco', dados: { passageiroId: 'x', status: 'ativo', motivo: '' } } as const
    expect(validarRegistro(PLANO, original, base, status, agora, agora).ok).toBe(true)
  })
})
