// Mudança de roteiro em viagem (seção "Mudança de roteiro em viagem" da especificação).
// Parte do caso 2: parados em Monlevade (chegada 08:55), saída prevista 09:10, almoço 12:30, destino 00:00, +30.

import { describe, expect, it } from 'vitest'
import { aplicarInclusoes, inclusaoDaEtapa, validarCancelamento, validarInclusao, validarLocalNovo, type DadosDaInclusao } from '../inclusao'
import { passageirosEsperados } from '../passageiros'
import { calcularEstado } from '../previsao'
import { validarRegistro } from '../registro'
import type { DadosPlano, Evento, Instante, Local, Trecho } from '../tipos'
import { avaliarAlternativas } from '../viabilidade'
import { congelar, esperarHorario, etapaDe, ev, EVENTOS_CASO_2, EVENTOS_CASO_3, h, PASSAGEIROS, PLANO } from './fixtures'

const MIRANTE: Local = { id: 'l-mirante', nome: 'Mirante', cidade: 'Cidade do mirante', tipo: 'parada', onibusPara: 'sim' }
const NOVO_ALMOCO: Local = { id: 'l-novo', nome: 'Restaurante Novo', cidade: 'Cidade do almoço', tipo: 'restaurante', onibusPara: 'sim' }
const D: DadosPlano = { ...PLANO, locais: [...PLANO.locais, MIRANTE, NOVO_ALMOCO] }
const ORIGINAL = congelar(PLANO)

const tr = (eo: string, lo: string, ed: string, ld: string, min: number): Trecho => ({
  etapaOrigemId: eo, localOrigemId: lo, etapaDestinoId: ed, localDestinoId: ld, duracaoMin: min, fonte: 'manual',
})

const INCLUSAO: DadosDaInclusao = {
  apos: 'monlevade',
  localId: 'l-mirante',
  categoria: 'visita',
  permanenciaMin: 40,
  trechos: [tr('monlevade', 'l-monlevade', 'n1', 'l-mirante', 30), tr('n1', 'l-mirante', 'almoco', 'l-rest-a', 180)],
}

const AGORA_PARADOS = h('09:00')
const inclui = (dados: DadosDaInclusao = INCLUSAO, base: Evento[] = EVENTOS_CASO_2) => [...base, ev.incluirParada('n1', dados, AGORA_PARADOS)]

function estadoCom(eventos: Evento[], agora: Instante = AGORA_PARADOS, d = D) {
  return calcularEstado(aplicarInclusoes(d, eventos), ORIGINAL, eventos, agora)
}

describe('inclusão: parada nova', () => {
  it('I1 recalcula a previsão e o destino', () => {
    const e = estadoCom(inclui())
    esperarHorario(etapaDe(e, 'n1').chegada?.instante, h('09:40'))
    esperarHorario(etapaDe(e, 'n1').saida?.instante, h('10:20'))
    esperarHorario(etapaDe(e, 'almoco').chegada?.instante, h('13:20'))
    esperarHorario(e.chegadaDestino?.instante, h('00:50', 1))
    expect(e.atrasoDestinoMin).toBe(80)
  })

  it('I2 o plano original continua idêntico', () => {
    const antes = JSON.stringify(ORIGINAL)
    estadoCom(inclui())
    expect(JSON.stringify(ORIGINAL)).toBe(antes)
    expect(ORIGINAL.etapas.some((x) => x.etapaId === 'n1')).toBe(false)
  })

  it('I3 a parada incluída não tem atraso próprio; o destino segue medido contra o original', () => {
    const e = estadoCom(inclui())
    expect(etapaDe(e, 'n1').chegada?.atrasoMin).toBeNull()
    expect(etapaDe(e, 'n1').saida?.atrasoMin).toBeNull()
    expect(e.atrasoDestinoMin).toBe(80)
  })

  it('I4 sem o tempo até a etapa seguinte, recusa', () => {
    const r = validarInclusao(D, ORIGINAL, EVENTOS_CASO_2, AGORA_PARADOS, 'n1', { ...INCLUSAO, trechos: [INCLUSAO.trechos[0]!] })
    expect(r).toEqual({ ok: false, motivo: expect.stringContaining('Falta o tempo de Mirante até Restaurante A') })
  })

  it('aceita quando os tempos estão em dia', () => {
    expect(validarInclusao(D, ORIGINAL, EVENTOS_CASO_2, AGORA_PARADOS, 'n1', INCLUSAO)).toEqual({ ok: true })
  })

  it('sem o tempo até a parada, parado, recusa e diz qual', () => {
    const r = validarInclusao(D, ORIGINAL, EVENTOS_CASO_2, AGORA_PARADOS, 'n1', { ...INCLUSAO, trechos: [INCLUSAO.trechos[1]!] })
    expect(r).toEqual({ ok: false, motivo: expect.stringContaining('Falta o tempo de Ponto de embarque até Mirante') })
  })

  it('parado, a chegada pelo Maps cobre o trecho até a parada', () => {
    const r = validarInclusao(D, ORIGINAL, EVENTOS_CASO_2, AGORA_PARADOS, 'n1', { ...INCLUSAO, trechos: [INCLUSAO.trechos[1]!] }, h('09:50'))
    expect(r).toEqual({ ok: true })
  })

  it('I5 em trânsito, só vale com a chegada pelo Maps', () => {
    const agora = h('10:00')
    const so = { ...INCLUSAO, trechos: [INCLUSAO.trechos[1]!] }
    expect(validarInclusao(D, ORIGINAL, EVENTOS_CASO_3, agora, 'n1', so)).toEqual({
      ok: false,
      motivo: expect.stringContaining('chegada pelo Google Maps'),
    })
    expect(validarInclusao(D, ORIGINAL, EVENTOS_CASO_3, agora, 'n1', so, h('11:00'))).toEqual({ ok: true })
    // O horário passa pelas travas da recalibração: não pode ser anterior a agora.
    expect(validarInclusao(D, ORIGINAL, EVENTOS_CASO_3, agora, 'n1', so, h('09:30')).ok).toBe(false)
  })

  it('I6 em trânsito, duração digitada para o trecho em curso é recusada', () => {
    const r = validarInclusao(D, ORIGINAL, EVENTOS_CASO_3, h('10:00'), 'n1', INCLUSAO, h('11:00'))
    expect(r).toEqual({ ok: false, motivo: expect.stringContaining('trecho em curso') })
  })

  it('I5 com a chegada pelo Maps, a parada vira a próxima etapa e a previsão usa o horário informado', () => {
    const so = { ...INCLUSAO, trechos: [INCLUSAO.trechos[1]!] }
    const eventos = [...EVENTOS_CASO_3, ev.incluirParada('n1', so, h('10:00')), ev.recalibracao('n1', h('11:00'), h('10:00'))]
    const e = estadoCom(eventos, h('10:00'))
    esperarHorario(etapaDe(e, 'n1').chegada?.instante, h('11:00'))
    expect(e.proximaEtapaId).toBe('n1')
    expect(validarRegistro(aplicarInclusoes(D, eventos), ORIGINAL, eventos.slice(0, -1), { tipo: 'recalibracao', etapaId: 'n1', dados: { horario: h('11:00') } }, h('10:00'), h('10:00')).ok).toBe(true)
  })

  it('I7 posição inválida: etapa já deixada (que não é a última), destino, etapa inexistente', () => {
    const emTransito = EVENTOS_CASO_3
    const base = (apos: string) => validarInclusao(D, ORIGINAL, emTransito, h('10:00'), 'n1', { ...INCLUSAO, apos }, h('11:00'))
    expect(base('origem').ok).toBe(false)
    expect(base('destino').ok).toBe(false)
    expect(base('nada').ok).toBe(false)
  })

  it('I7 pode entrar depois de uma etapa pendente adiante', () => {
    const dados: DadosDaInclusao = {
      apos: 'cafe',
      localId: 'l-mirante',
      categoria: 'visita',
      permanenciaMin: 30,
      trechos: [tr('cafe', 'l-cafe', 'n1', 'l-mirante', 20), tr('n1', 'l-mirante', 'jantar', 'l-jantar', 60)],
    }
    expect(validarInclusao(D, ORIGINAL, EVENTOS_CASO_2, AGORA_PARADOS, 'n1', dados)).toEqual({ ok: true })
  })

  it('I8 viagem concluída ou em planejamento: recusa', () => {
    for (const status of ['concluida', 'planejando'] as const) {
      const d = { ...D, viagem: { ...D.viagem, status } }
      expect(validarInclusao(d, ORIGINAL, EVENTOS_CASO_2, AGORA_PARADOS, 'n1', INCLUSAO).ok).toBe(false)
    }
  })

  it('valida categoria, permanência (1 a 600) e motivo', () => {
    const v = (x: Partial<DadosDaInclusao>) => validarInclusao(D, ORIGINAL, EVENTOS_CASO_2, AGORA_PARADOS, 'n1', { ...INCLUSAO, ...x }).ok
    expect(v({ categoria: 'almoco' })).toBe(false)
    expect(v({ permanenciaMin: 0 })).toBe(false)
    expect(v({ permanenciaMin: 601 })).toBe(false)
    expect(v({ permanenciaMin: 600 })).toBe(true)
    expect(v({ permanenciaMin: 1.5 })).toBe(false)
    expect(v({ motivo: 'x'.repeat(61) })).toBe(false)
    expect(v({ motivo: '   ' })).toBe(false)
    expect(v({ motivo: 'Foto do grupo' })).toBe(true)
    expect(v({ localId: 'inexistente' })).toBe(false)
  })

  it('recusa trecho que não liga a parada nova à vizinha, ou fonte rota sem distância', () => {
    const estranho = tr('monlevade', 'l-monlevade', 'almoco', 'l-rest-a', 10)
    expect(validarInclusao(D, ORIGINAL, EVENTOS_CASO_2, AGORA_PARADOS, 'n1', { ...INCLUSAO, trechos: [...INCLUSAO.trechos, estranho] }).ok).toBe(false)
    const rotaIncompleta: Trecho = { ...INCLUSAO.trechos[1]!, fonte: 'rota' }
    expect(validarInclusao(D, ORIGINAL, EVENTOS_CASO_2, AGORA_PARADOS, 'n1', { ...INCLUSAO, trechos: [INCLUSAO.trechos[0]!, rotaIncompleta] }).ok).toBe(false)
  })

  it('trecho de rota completo entra com o fator ônibus', () => {
    const rota: Trecho = { ...INCLUSAO.trechos[1]!, fonte: 'rota', duracaoMin: 100, distanciaKm: 80, calculadoEm: h('09:00') }
    const e = estadoCom(inclui({ ...INCLUSAO, trechos: [INCLUSAO.trechos[0]!, rota] }))
    // 100 min de carro × 1,15 = 115 min depois da saída de N (10:20)
    esperarHorario(etapaDe(e, 'almoco').chegada?.instante, h('12:15'))
  })

  it('recusa com parada não planejada aberta', () => {
    const eventos = [...EVENTOS_CASO_3, ev.parada('almoco', 'inicio', h('09:50'))]
    expect(validarInclusao(D, ORIGINAL, eventos, h('10:00'), 'n1', INCLUSAO, h('11:00'))).toEqual({
      ok: false,
      motivo: expect.stringContaining('VOLTAMOS'),
    })
  })

  it('recusa quando o trecho em curso já teve parada ou previsão do Maps (ficariam atribuídas à etapa errada)', () => {
    const comParada = [...EVENTOS_CASO_3, ev.parada('almoco', 'inicio', h('09:50')), ev.parada('almoco', 'fim', h('09:55'))]
    const so = { ...INCLUSAO, trechos: [INCLUSAO.trechos[1]!] }
    expect(validarInclusao(D, ORIGINAL, comParada, h('10:00'), 'n1', so, h('11:00')).ok).toBe(false)
    const comPrevisao = [...EVENTOS_CASO_3, ev.recalibracao('almoco', h('13:00'), h('09:50'))]
    expect(validarInclusao(D, ORIGINAL, comPrevisao, h('10:00'), 'n1', so, h('11:00')).ok).toBe(false)
  })

  it('I9 a regra do relógio vale para a parada nova como próximo evento', () => {
    const e = estadoCom(inclui(), h('09:30'))
    // A saída de Monlevade acompanha o relógio (09:30), a parada chega 10:00 e o resto atrasa junto.
    esperarHorario(etapaDe(e, 'n1').chegada?.instante, h('10:00'))
    esperarHorario(etapaDe(e, 'almoco').chegada?.instante, h('13:40'))
  })

  it('I10 recalibração na parada nova vale como em qualquer etapa (parado: vira duração do trecho)', () => {
    const eventos = [...inclui(), ev.recalibracao('n1', h('10:00'), AGORA_PARADOS)]
    const e = estadoCom(eventos)
    // Informada às 09:00 para 10:00: duração de 60 min a partir da saída prevista (09:10).
    esperarHorario(etapaDe(e, 'n1').chegada?.instante, h('10:10'))
    expect(etapaDe(e, 'n1').chegada?.origem).toBe('recalibracao')
  })

  it('I12 duas inclusões em sequência respeitam o apos e a ordem de gravação', () => {
    const segunda: DadosDaInclusao = {
      apos: 'n1',
      localId: 'l-novo',
      categoria: 'banheiro',
      permanenciaMin: 10,
      trechos: [tr('n1', 'l-mirante', 'n2', 'l-novo', 15), tr('n2', 'l-novo', 'almoco', 'l-rest-a', 150)],
    }
    const eventos = [...inclui(), ev.incluirParada('n2', segunda, AGORA_PARADOS)]
    const d2 = aplicarInclusoes(D, eventos)
    expect(d2.etapas.map((x) => x.id)).toEqual(['origem', 'monlevade', 'n1', 'n2', 'almoco', 'cafe', 'jantar', 'destino'])
    expect(d2.etapas.map((x) => x.ordem)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    esperarHorario(etapaDe(estadoCom(eventos), 'almoco').chegada?.instante, h('13:15'))
  })

  it('I13 aplicarInclusoes é idempotente e o plano gravado não é alterado', () => {
    const eventos = inclui()
    const uma = aplicarInclusoes(D, eventos)
    const duas = aplicarInclusoes(uma, eventos)
    expect(duas.etapas).toEqual(uma.etapas)
    expect(duas.trechos).toEqual(uma.trechos)
    expect(D.etapas).toHaveLength(6)
    expect(D.trechos).toHaveLength(0)
  })

  it('I13 sem os eventos (DESFAZER), tudo volta ao cálculo anterior', () => {
    const antes = estadoCom(EVENTOS_CASO_2)
    esperarHorario(antes.chegadaDestino?.instante, h('00:00', 1))
    expect(aplicarInclusoes(D, EVENTOS_CASO_2)).toBe(D)
  })

  it('o plano efetivo só acrescenta, e a etapa nova é flexível, sem horário de roteiro', () => {
    const n1 = aplicarInclusoes(D, inclui()).etapas.find((x) => x.id === 'n1')!
    expect(n1).toMatchObject({ tipo: 'flexivel', localId: 'l-mirante', categoria: 'visita', permanenciaMin: 40, alternativas: [] })
    expect(n1.chegadaRoteiro).toBeUndefined()
  })
})

describe('inclusão cancelada', () => {
  const incluida = ev.incluirParada('n1', INCLUSAO, AGORA_PARADOS)
  const eventos = [...EVENTOS_CASO_2, incluida]

  it('I11 A e B voltam a ser vizinhas e o roteiro volta a valer', () => {
    const cancelado = [...eventos, ev.cancelarInclusao('n1', incluida.id, AGORA_PARADOS)]
    expect(validarCancelamento(aplicarInclusoes(D, eventos), ORIGINAL, eventos, AGORA_PARADOS, incluida.id)).toEqual({ ok: true })
    const e = estadoCom(cancelado)
    expect(e.etapas.some((x) => x.etapaId === 'n1')).toBe(false)
    expect(etapaDe(e, 'almoco').trechoChegada).toEqual({ minutos: 200, fonte: 'roteiro' })
    esperarHorario(e.chegadaDestino?.instante, h('00:00', 1))
    expect(e.atrasoDestinoMin).toBe(30)
    expect(inclusaoDaEtapa(cancelado, 'n1')).toBeNull()
  })

  it('I11 a recalibração da parada cancelada deixa de valer', () => {
    const cancelado = [...eventos, ev.recalibracao('n1', h('10:00'), AGORA_PARADOS), ev.cancelarInclusao('n1', incluida.id, AGORA_PARADOS)]
    esperarHorario(estadoCom(cancelado).chegadaDestino?.instante, h('00:00', 1))
  })

  it('I11b com chegada registrada, duas vezes ou id que não é inclusão: recusa', () => {
    const d = aplicarInclusoes(D, eventos)
    const chegou = [...eventos, ev.saida('monlevade', h('09:10')), ev.chegada('n1', h('09:40'))]
    expect(validarCancelamento(d, ORIGINAL, chegou, h('09:45'), incluida.id).ok).toBe(false)
    const ja = [...eventos, ev.cancelarInclusao('n1', incluida.id, AGORA_PARADOS)]
    expect(validarCancelamento(D, ORIGINAL, ja, AGORA_PARADOS, incluida.id)).toEqual({ ok: false, motivo: expect.stringContaining('já foi cancelada') })
    expect(validarCancelamento(d, ORIGINAL, eventos, AGORA_PARADOS, EVENTOS_CASO_2[0]!.id).ok).toBe(false)
    expect(validarCancelamento(d, ORIGINAL, eventos, AGORA_PARADOS, 'nao-existe').ok).toBe(false)
  })

  it('não cancela a parada que tem outra incluída depois dela', () => {
    const segunda = ev.incluirParada('n2', { apos: 'n1', localId: 'l-novo', categoria: 'outro', permanenciaMin: 10, trechos: [tr('n1', 'l-mirante', 'n2', 'l-novo', 15), tr('n2', 'l-novo', 'almoco', 'l-rest-a', 150)] }, AGORA_PARADOS)
    const todos = [...eventos, segunda]
    expect(validarCancelamento(aplicarInclusoes(D, todos), ORIGINAL, todos, AGORA_PARADOS, incluida.id)).toEqual({
      ok: false,
      motivo: expect.stringContaining('cancele-a primeiro'),
    })
  })

  it('passa pelo validarRegistro e o DESFAZER (retirar o evento) devolve a parada', () => {
    const d = aplicarInclusoes(D, eventos)
    const r = validarRegistro(d, ORIGINAL, eventos, { tipo: 'inclusao_cancelada', etapaId: 'n1', dados: { eventoId: incluida.id } }, AGORA_PARADOS, AGORA_PARADOS)
    expect(r).toEqual({ ok: true })
    expect(aplicarInclusoes(D, eventos).etapas.some((x) => x.id === 'n1')).toBe(true)
  })

  it('I11c pular a parada incluída continua valendo: trecho "estimado" pela soma', () => {
    const eventos2 = [...eventos, ev.pular('n1', AGORA_PARADOS)]
    const e = estadoCom(eventos2)
    expect(etapaDe(e, 'almoco').trechoChegada).toEqual({ minutos: 210, fonte: 'estimado' })
  })
})

describe('inclusão: local novo numa parada flexível', () => {
  const dados = {
    localId: 'l-novo',
    trechos: [tr('monlevade', 'l-monlevade', 'almoco', 'l-novo', 200), tr('almoco', 'l-novo', 'cafe', 'l-cafe', 170)],
  }
  const aplicar = (eventos: Evento[]) => aplicarInclusoes(D, eventos)

  it('T1 aceita com os dois tempos e recalcula chegada e destino', () => {
    expect(validarLocalNovo(D, ORIGINAL, EVENTOS_CASO_2, AGORA_PARADOS, 'almoco', dados)).toEqual({ ok: true })
    const eventos = [...EVENTOS_CASO_2, ev.localIncluido('almoco', dados, AGORA_PARADOS), ev.troca('almoco', 'l-novo', AGORA_PARADOS)]
    const e = calcularEstado(aplicar(eventos), ORIGINAL, eventos, AGORA_PARADOS)
    expect(etapaDe(e, 'almoco').localId).toBe('l-novo')
    esperarHorario(etapaDe(e, 'cafe').chegada?.instante, h('16:20'))
    esperarHorario(e.chegadaDestino?.instante, h('23:50'))
    expect(e.atrasoDestinoMin).toBe(20)
  })

  it('T2 sem o tempo do local novo até a etapa seguinte, recusa', () => {
    const r = validarLocalNovo(D, ORIGINAL, EVENTOS_CASO_2, AGORA_PARADOS, 'almoco', { ...dados, trechos: [dados.trechos[0]!] })
    expect(r).toEqual({ ok: false, motivo: expect.stringContaining('Falta o tempo de Restaurante Novo até Lanchonete do café') })
  })

  it('T3 dá para voltar ao local original depois do novo (e o novo segue candidato)', () => {
    const eventos = [...EVENTOS_CASO_2, ev.localIncluido('almoco', dados, AGORA_PARADOS), ev.troca('almoco', 'l-novo', AGORA_PARADOS)]
    const d = aplicar(eventos)
    expect(validarRegistro(d, ORIGINAL, eventos, { tipo: 'troca_local', etapaId: 'almoco', dados: { localId: 'l-rest-a' } }, AGORA_PARADOS, AGORA_PARADOS)).toEqual({ ok: true })
    expect(d.etapas.find((x) => x.id === 'almoco')!.alternativas).toContain('l-novo')
  })

  it('T4 o local novo é classificado pelo horário de funcionamento', () => {
    const comHorario: DadosPlano = { ...D, locais: D.locais.map((l) => (l.id === 'l-novo' ? { ...l, abre: '11:00', fecha: '12:00' } : l)) }
    const eventos = [...EVENTOS_CASO_2, ev.localIncluido('almoco', dados, AGORA_PARADOS)]
    const lista = avaliarAlternativas(aplicarInclusoes(comHorario, eventos), ORIGINAL, eventos, AGORA_PARADOS, 'almoco')
    // Chegada 12:30 com o local fechado desde as 12:00.
    expect(lista.find((a) => a.localId === 'l-novo')).toMatchObject({ classe: 'inviavel' })
  })

  it('T5 em trânsito, só com a chegada pelo Maps', () => {
    const agora = h('10:00')
    const so = { ...dados, trechos: [dados.trechos[1]!] }
    expect(validarLocalNovo(D, ORIGINAL, EVENTOS_CASO_3, agora, 'almoco', so)).toEqual({
      ok: false,
      motivo: expect.stringContaining('chegada pelo Google Maps'),
    })
    expect(validarLocalNovo(D, ORIGINAL, EVENTOS_CASO_3, agora, 'almoco', so, h('12:40'))).toEqual({ ok: true })
    // Duração digitada para o trecho em curso: recusada.
    expect(validarLocalNovo(D, ORIGINAL, EVENTOS_CASO_3, agora, 'almoco', dados, h('12:40')).ok).toBe(false)
  })

  it('T6 ponto obrigatório não troca de local', () => {
    const eventos = [ev.inicio(h('06:00'))]
    const r = validarLocalNovo(D, ORIGINAL, eventos, h('06:10'), 'monlevade', {
      localId: 'l-novo',
      trechos: [tr('origem', 'l-saida', 'monlevade', 'l-novo', 100), tr('monlevade', 'l-novo', 'almoco', 'l-rest-a', 200)],
    })
    expect(r).toEqual({ ok: false, motivo: expect.stringContaining('flexíveis') })
  })

  it('recusa local que já é candidato, parada já alcançada e local inexistente', () => {
    expect(validarLocalNovo(D, ORIGINAL, EVENTOS_CASO_2, AGORA_PARADOS, 'almoco', { localId: 'l-rest-b', trechos: [] }).ok).toBe(false)
    const chegou = [...EVENTOS_CASO_3, ev.chegada('almoco', h('12:40'))]
    expect(validarLocalNovo(D, ORIGINAL, chegou, h('12:45'), 'almoco', dados).ok).toBe(false)
    expect(validarLocalNovo(D, ORIGINAL, EVENTOS_CASO_2, AGORA_PARADOS, 'almoco', { localId: 'nada', trechos: [] }).ok).toBe(false)
  })

  it('passa pelo validarRegistro', () => {
    expect(validarRegistro(D, ORIGINAL, EVENTOS_CASO_2, { tipo: 'local_incluido', etapaId: 'almoco', dados }, AGORA_PARADOS, AGORA_PARADOS)).toEqual({ ok: true })
  })
})

describe('inclusão: alternativas da etapa seguinte (A1)', () => {
  it('ficam "sem tempo" até informar o tempo da parada nova até elas', () => {
    const eventos = inclui()
    const d = aplicarInclusoes(D, eventos)
    const antes = avaliarAlternativas(d, ORIGINAL, eventos, AGORA_PARADOS, 'almoco')
    expect(antes.find((a) => a.localId === 'l-rest-b')?.classe).toBe('sem_tempo')
    const comTempo: DadosPlano = {
      ...d,
      trechos: [...d.trechos, tr('n1', 'l-mirante', 'almoco', 'l-rest-b', 200), tr('almoco', 'l-rest-b', 'cafe', 'l-cafe', 180)],
    }
    const depois = avaliarAlternativas(comTempo, ORIGINAL, eventos, AGORA_PARADOS, 'almoco')
    expect(depois.find((a) => a.localId === 'l-rest-b')?.classe).not.toBe('sem_tempo')
  })
})

describe('inclusão: passageiros (P1)', () => {
  it('as contagens não mudam e ninguém fica ligado à parada nova', () => {
    const d = aplicarInclusoes(D, inclui())
    expect(passageirosEsperados('n1', d.etapas, PASSAGEIROS, inclui())).toHaveLength(38)
    expect(passageirosEsperados('monlevade', d.etapas, PASSAGEIROS, inclui())).toHaveLength(38)
    expect(PASSAGEIROS.some((p) => p.etapaEmbarqueId === 'n1' || p.etapaDesembarqueId === 'n1')).toBe(false)
  })
})
