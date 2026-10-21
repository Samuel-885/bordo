import { describe, expect, it } from 'vitest'
import {
  avisoDaMarcacao,
  contextoDeDescidaNaEtapa,
  contextoDeDescidaNaoPlanejada,
  contextoDeSaida,
  contextoDeVolta,
  descidaParaConferencia,
  iniciarConferencia,
  ehRefeicao,
  marcacaoDeDescida,
  oferecerDescidaAoChegar,
  podeSair,
  alternarPassageiro,
  trocarModo,
} from '../conferencia'
import { passageirosABordoNaParada } from '../passageiros'
import { calcularEstado } from '../previsao'
import { validarRegistro } from '../registro'
import type { Etapa } from '../tipos'
import { congelar, ETAPAS, ev, h, PASSAGEIROS, PLANO } from './fixtures'

const etapa = (id: string, extra: Partial<Etapa> = {}): Etapa => ({ ...ETAPAS.find((e) => e.id === id)!, ...extra })
const ate = (n: number) => PASSAGEIROS.slice(0, n).map((p) => p.id)

const aMonlevade = [ev.inicio(h('06:00')), ev.saida('origem', h('06:30')), ev.chegada('monlevade', h('08:25'))]
const aoAlmoco = [...aMonlevade, ev.saida('monlevade', h('08:40')), ev.chegada('almoco', h('12:00'))]

describe('quem está a bordo na parada', () => {
  it('só os esperados que já embarcaram antes: quem embarca ali ainda não está a bordo', () => {
    expect(passageirosABordoNaParada('monlevade', PLANO.etapas, PASSAGEIROS, aMonlevade)).toHaveLength(35)
    expect(passageirosABordoNaParada('almoco', PLANO.etapas, PASSAGEIROS, aoAlmoco)).toHaveLength(38)
    const sem = ev.status('monlevade', 'p-01', 'saiu_da_viagem', 'x', h('08:30'))
    expect(passageirosABordoNaParada('almoco', PLANO.etapas, PASSAGEIROS, [...aoAlmoco, sem])).toHaveLength(37)
  })

  it('parada não planejada: os esperados em trânsito', () => {
    const ctx = contextoDeDescidaNaoPlanejada('monlevade', PLANO, PASSAGEIROS, [ev.inicio(h('06:00')), ev.saida('origem', h('06:30'))])
    expect(ctx.aBordo).toHaveLength(35)
  })
})

describe('marcação de quem desceu: a mais recente vale', () => {
  it('sem marcação, nada; com marcação, a lista; uma nova substitui a anterior', () => {
    expect(marcacaoDeDescida(aoAlmoco, 'etapa', 'almoco')).toBeNull()
    const primeira = ev.desceram('almoco', 'etapa', ate(5), h('12:01'))
    const segunda = ev.desceram('almoco', 'etapa', ate(2), h('12:05'))
    expect(marcacaoDeDescida([...aoAlmoco, primeira], 'etapa', 'almoco')).toEqual(ate(5))
    expect(marcacaoDeDescida([...aoAlmoco, primeira, segunda], 'etapa', 'almoco')).toEqual(ate(2))
  })

  it('apagar a nova (DESFAZER) devolve a anterior; marcação vazia é "ninguém desceu"', () => {
    const primeira = ev.desceram('almoco', 'etapa', ate(5), h('12:01'))
    expect(marcacaoDeDescida([...aoAlmoco, primeira], 'etapa', 'almoco')).toEqual(ate(5))
    expect(marcacaoDeDescida([...aoAlmoco, ev.desceram('almoco', 'etapa', [], h('12:02'))], 'etapa', 'almoco')).toEqual([])
  })

  it('a parada da etapa e a parada não planejada ligada a ela não se misturam', () => {
    const naoPlanejada = ev.desceram('almoco', 'nao_planejada', ate(3), h('10:00'))
    expect(marcacaoDeDescida([naoPlanejada], 'etapa', 'almoco')).toBeNull()
    expect(marcacaoDeDescida([ev.desceram('almoco', 'etapa', ate(1), h('12:00'))], 'nao_planejada', 'almoco')).toBeNull()
  })

  it('um PARAMOS novo começa uma parada nova, sem a marcação da anterior', () => {
    const eventos = [
      ev.parada('almoco', 'inicio', h('09:00')),
      ev.desceram('almoco', 'nao_planejada', ate(3), h('09:05')),
      ev.parada('almoco', 'fim', h('09:20')),
      ev.parada('almoco', 'inicio', h('10:00')),
    ]
    expect(marcacaoDeDescida(eventos.slice(0, 2), 'nao_planejada', 'almoco')).toEqual(ate(3))
    expect(marcacaoDeDescida(eventos, 'nao_planejada', 'almoco')).toBeNull()
  })

  it('não tem efeito no cálculo: o estado da viagem é o mesmo com e sem a marcação', () => {
    const original = congelar()
    const com = [...aoAlmoco, ev.desceram('almoco', 'etapa', ate(5), h('12:01'))]
    expect(calcularEstado(PLANO, original, com, h('12:10'))).toEqual(calcularEstado(PLANO, original, aoAlmoco, h('12:10')))
  })
})

describe('estado inicial da conferência com e sem marcação', () => {
  const almoco = etapa('almoco', { categoria: 'almoco' })
  const ctx = () => contextoDeSaida('almoco', PLANO, PASSAGEIROS, aoAlmoco)

  it('sem marcação: como antes (refeição = todos pendentes)', () => {
    expect(iniciarConferencia(ctx(), PLANO.etapas, 'todos_desceram', almoco).confirmados).toEqual([])
    expect(iniciarConferencia(ctx(), PLANO.etapas, 'todos_desceram', almoco, null).confirmados).toEqual([])
  })

  it('com marcação: só quem desceu fica pendente e os demais são confirmados', () => {
    const e = iniciarConferencia(ctx(), PLANO.etapas, 'todos_desceram', almoco, ate(3))
    expect(e.confirmados).toHaveLength(35)
    expect(e.confirmados).not.toContain('p-01')
    expect(e.confirmados).toContain('p-04')
    expect(podeSair(ctx(), e)).toBe(false)
  })

  it('"Todos" equivale a todos desceram; ninguém desceu = todos confirmados', () => {
    const todos = ctx().esperados.map((p) => p.id)
    expect(iniciarConferencia(ctx(), PLANO.etapas, 'todos_desceram', almoco, todos).confirmados).toEqual([])
    expect(iniciarConferencia(ctx(), PLANO.etapas, 'todos_desceram', almoco, []).confirmados).toHaveLength(38)
  })

  it('banheiro (só alguns): confirma todos menos quem desceu', () => {
    const banheiro = etapa('almoco', { categoria: 'banheiro' })
    const e = iniciarConferencia(ctx(), PLANO.etapas, 'so_alguns', banheiro, ate(2))
    expect(e.confirmados).toHaveLength(36)
  })

  it('ponto de embarque: quem vai embarcar continua pendente, além de quem desceu', () => {
    const c = contextoDeSaida('monlevade', PLANO, PASSAGEIROS, aMonlevade)
    const e = iniciarConferencia(c, PLANO.etapas, 'so_alguns', etapa('monlevade'), ate(2))
    expect(e.confirmados).toHaveLength(33)
    expect(e.confirmados).not.toContain('p-36')
  })

  it('trocar para o outro modo reinicia a lista, sem a marcação', () => {
    const marcado = iniciarConferencia(ctx(), PLANO.etapas, 'todos_desceram', almoco, ate(3))
    const trocado = trocarModo(ctx(), PLANO.etapas, marcado, 'so_alguns', almoco)
    expect(marcado.confirmados).toHaveLength(35)
    expect(trocado.modo).toBe('so_alguns')
    expect(trocado.confirmados).toHaveLength(38)
  })

  it('tocar no modo que já está selecionado não faz nada: a lista e a marcação ficam', () => {
    const marcado = alternarPassageiro(iniciarConferencia(ctx(), PLANO.etapas, 'todos_desceram', almoco, ate(3)), 'p-01')
    expect(trocarModo(ctx(), PLANO.etapas, marcado, 'todos_desceram', almoco)).toBe(marcado)
  })

  it('a marcação da conferência só leva quem é esperado (quem saiu da viagem no meio fica de fora)', () => {
    const saiu = ev.status('almoco', 'p-01', 'saiu_da_viagem', 'x', h('12:02'))
    const eventos = [...aoAlmoco, saiu, ev.desceram('almoco', 'etapa', ate(3), h('12:03'))]
    const c = contextoDeSaida('almoco', PLANO, PASSAGEIROS, eventos)
    expect(descidaParaConferencia(c, eventos)).toEqual(['p-02', 'p-03'])
  })

  it('na volta à estrada usa a marcação da parada não planejada', () => {
    const eventos = [ev.inicio(h('06:00')), ev.saida('origem', h('06:30')), ev.parada('monlevade', 'inicio', h('07:00')), ev.desceram('monlevade', 'nao_planejada', ate(4), h('07:05')), ev.parada('monlevade', 'fim', h('07:20'))]
    const c = contextoDeVolta('monlevade', PLANO, PASSAGEIROS, eventos)
    expect(descidaParaConferencia(c, eventos)).toEqual(ate(4))
  })
})

describe('aviso na conferência', () => {
  it('X desceram, Y ficaram no ônibus, com singular', () => {
    expect(avisoDaMarcacao(3, 32)).toBe('3 desceram, 32 ficaram no ônibus. Se tiver dúvida, use a contagem rápida.')
    expect(avisoDaMarcacao(1, 1)).toBe('1 desceu, 1 ficou no ônibus. Se tiver dúvida, use a contagem rápida.')
  })
})

describe('registro da marcação (travas)', () => {
  const original = congelar()
  const agora = h('12:30')
  const validar = (eventos: typeof aoAlmoco, conteudo: Parameters<typeof validarRegistro>[3]) =>
    validarRegistro(PLANO, original, eventos, conteudo, agora, agora, PASSAGEIROS)
  const marca = (ids: string[], local: 'etapa' | 'nao_planejada' = 'etapa', etapaId = 'almoco') =>
    ({ tipo: 'desceram', etapaId, dados: { local, passageiroIds: ids } }) as const

  it('na parada em que estamos, só com gente que está a bordo', () => {
    expect(validar(aoAlmoco, marca(ate(3))).ok).toBe(true)
    expect(validar(aoAlmoco, marca([])).ok).toBe(true)
    expect(validar(aoAlmoco, marca(['p-99'])).ok).toBe(false)
    expect(validar(aoAlmoco, marca(['p-01', 'p-01'])).ok).toBe(false)
  })

  it('quem embarca na própria parada ainda não está a bordo', () => {
    expect(validar(aMonlevade, marca(['p-36'], 'etapa', 'monlevade')).ok).toBe(false)
    expect(validar(aMonlevade, marca(['p-01'], 'etapa', 'monlevade')).ok).toBe(true)
  })

  it('fora da parada recusa; parada não planejada só durante a parada', () => {
    const emViagem = [...aMonlevade, ev.saida('monlevade', h('08:40'))]
    expect(validar(emViagem, marca(ate(1))).ok).toBe(false)
    expect(validar(emViagem, marca(ate(1), 'nao_planejada')).ok).toBe(false)
    const parados = [...emViagem, ev.parada('almoco', 'inicio', h('10:00'))]
    expect(validar(parados, marca(ate(1), 'nao_planejada')).ok).toBe(true)
    expect(validar(parados, marca(ate(1), 'etapa')).ok).toBe(false)
  })

  it('o contexto da etapa lista os esperados a bordo', () => {
    expect(contextoDeDescidaNaEtapa('almoco', PLANO, PASSAGEIROS, aoAlmoco).aBordo).toHaveLength(38)
  })
})

describe('quando o CHEGAMOS oferece "Quem desceu?"', () => {
  it('em toda parada, menos refeições e destino', () => {
    expect(oferecerDescidaAoChegar(etapa('monlevade'))).toBe(true)
    expect(oferecerDescidaAoChegar(etapa('almoco', { categoria: 'banheiro' }))).toBe(true)
    expect(oferecerDescidaAoChegar(etapa('almoco', { categoria: 'descanso' }))).toBe(true)
    expect(oferecerDescidaAoChegar(etapa('almoco'))).toBe(true)
    for (const categoria of ['almoco', 'cafe', 'jantar']) {
      expect(ehRefeicao(categoria)).toBe(true)
      expect(oferecerDescidaAoChegar(etapa('almoco', { categoria }))).toBe(false)
    }
    expect(oferecerDescidaAoChegar(etapa('destino'))).toBe(false)
  })
})
