import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { aplicarInclusoes } from '../../core/inclusao'
import { calcularEstado } from '../../core/previsao'
import { definirSimulado, usarRelogioReal } from '../../core/relogio'
import type { Local, Trecho } from '../../core/tipos'
import { ETAPA, horaDemo, LOCAL } from '../../demo/dados'
import { LocalEmUso, novoId, type Repositorio } from '../repositorio'
import { semearDemonstracao } from '../semente-demo'
import { repositorioDeTeste } from './ajudas'

let repo: Repositorio
const V = 'demo-viagem'
const relogio = (hora: string) => definirSimulado(horaDemo(hora))
const MIRANTE: Local = { id: 'l-mirante', nome: 'Mirante', cidade: 'Cidade do mirante', tipo: 'parada', onibusPara: 'sim' }
const NOVO: Local = { id: 'l-novo', nome: 'Restaurante Novo', cidade: 'Cidade do almoço', tipo: 'restaurante', onibusPara: 'sim' }
const tr = (eo: string, lo: string, ed: string, ld: string, min: number): Trecho => ({
  etapaOrigemId: eo, localOrigemId: lo, etapaDestinoId: ed, localDestinoId: ld, duracaoMin: min, fonte: 'manual',
})

async function registrar(hora: string, conteudo: Parameters<Repositorio['registrarEvento']>[1]) {
  relogio(hora)
  const r = await repo.registrarEvento(V, conteudo)
  if (!r.ok) throw new Error(r.motivo)
  return r
}

const dadosDaParada = (n1: string) => ({
  apos: ETAPA.monlevade,
  localId: 'l-mirante',
  categoria: 'visita',
  permanenciaMin: 40,
  trechos: [tr(ETAPA.monlevade, LOCAL.monlevade, n1, 'l-mirante', 30), tr(n1, 'l-mirante', ETAPA.almoco, LOCAL.restA, 180)],
})

/** Parados em Monlevade desde 08:25, com o relógio em 08:30. */
beforeEach(async () => {
  repo = repositorioDeTeste('demo')
  await semearDemonstracao(repo)
  await repo.salvarLocal(MIRANTE)
  await repo.salvarLocal(NOVO)
  relogio('06:00')
  const r = await repo.iniciarViagem(V)
  if (!r.ok) throw new Error('não iniciou')
  await registrar('06:30', { tipo: 'saida', etapaId: ETAPA.origem })
  await registrar('08:25', { tipo: 'chegada', etapaId: ETAPA.monlevade })
  relogio('08:30')
})
afterEach(() => usarRelogioReal())

async function estado() {
  const plano = (await repo.carregarPlano(V))!
  return { plano, estado: calcularEstado(plano, plano.viagem.planoOriginal!, await repo.listarEventos(V), horaDemo('08:30')) }
}

describe('parada incluída pelo repositório', () => {
  it('grava o evento, o plano carregado já tem a etapa e o original não muda', async () => {
    const original = JSON.stringify((await repo.carregarPlano(V))!.viagem.planoOriginal)
    const n1 = novoId()
    const r = await repo.registrarInclusao(V, n1, dadosDaParada(n1))
    expect(r.ok).toBe(true)
    const { plano, estado: e } = await estado()
    expect(plano.etapas.map((x) => x.id)).toContain(n1)
    expect(e.etapas.find((x) => x.etapaId === n1)?.chegada?.atrasoMin).toBeNull()
    expect(JSON.stringify(plano.viagem.planoOriginal)).toBe(original)
    expect((await repo.listarEtapas(V)).some((x) => x.id === n1)).toBe(false)
  })

  it('o DESFAZER retira a parada', async () => {
    const n1 = novoId()
    const r = await repo.registrarInclusao(V, n1, dadosDaParada(n1))
    if (!r.ok) throw new Error(r.motivo)
    expect((await repo.desfazerRegistro(V, r.eventos.map((e) => e.id))).ok).toBe(true)
    expect((await repo.carregarPlano(V))!.etapas.some((x) => x.id === n1)).toBe(false)
  })

  it('recusa sem o tempo até a etapa seguinte e não grava nada', async () => {
    const n1 = novoId()
    const antes = (await repo.listarEventos(V)).length
    const r = await repo.registrarInclusao(V, n1, { ...dadosDaParada(n1), trechos: [dadosDaParada(n1).trechos[0]!] })
    expect(r).toMatchObject({ ok: false })
    expect((await repo.listarEventos(V)).length).toBe(antes)
  })

  it('com a chegada pelo Maps, grava a parada e a recalibração numa transação, e o desfazer retira as duas', async () => {
    const n1 = novoId()
    const so = { ...dadosDaParada(n1), trechos: [dadosDaParada(n1).trechos[1]!] }
    const r = await repo.registrarInclusao(V, n1, so, horaDemo('09:50'))
    if (!r.ok) throw new Error(r.motivo)
    expect(r.eventos.map((e) => e.tipo)).toEqual(['parada_incluida', 'recalibracao'])
    expect((await repo.desfazerRegistro(V, r.eventos.map((e) => e.id))).ok).toBe(true)
  })

  it('cancelar a parada antes de chegar: ela some e o roteiro entre as vizinhas volta', async () => {
    const n1 = novoId()
    const r = await repo.registrarInclusao(V, n1, dadosDaParada(n1))
    if (!r.ok) throw new Error(r.motivo)
    const antes = (await estado()).estado.chegadaDestino?.instante
    const c = await repo.cancelarInclusao(V, r.eventos[0]!.id)
    expect(c.ok).toBe(true)
    const { plano, estado: e } = await estado()
    expect(plano.etapas.some((x) => x.id === n1)).toBe(false)
    expect(e.etapas.find((x) => x.etapaId === ETAPA.almoco)?.trechoChegada?.fonte).toBe('roteiro')
    expect(e.chegadaDestino?.instante).not.toBe(antes)
    // O DESFAZER do cancelamento devolve a parada.
    expect((await repo.desfazerRegistro(V, c.ok ? c.eventos.map((x) => x.id) : [])).ok).toBe(true)
    expect((await repo.carregarPlano(V))!.etapas.some((x) => x.id === n1)).toBe(true)
  })

  it('não cancela id que não é uma parada incluída', async () => {
    const inicio = (await repo.listarEventos(V)).find((e) => e.tipo === 'inicio')!
    expect(await repo.cancelarInclusao(V, inicio.id)).toMatchObject({ ok: false })
  })

  it('informar o tempo de um trecho da parada nova fica guardado e listado (A1)', async () => {
    const n1 = novoId()
    const r = await repo.registrarInclusao(V, n1, dadosDaParada(n1))
    if (!r.ok) throw new Error(r.motivo)
    const par = { etapaOrigemId: n1, localOrigemId: 'l-mirante', etapaDestinoId: ETAPA.almoco, localDestinoId: LOCAL.restB }
    expect(await repo.salvarTrechoManualEmViagem(V, par, 200)).toEqual({ ok: true })
    expect((await repo.listarTrechos(V)).some((t) => t.etapaOrigemId === n1 && t.localDestinoId === LOCAL.restB)).toBe(true)
    const plano = (await repo.carregarPlano(V))!
    expect(aplicarInclusoes(plano, await repo.listarEventos(V)).trechos.length).toBeGreaterThan(2)
  })

  it('L1 o local incluído não pode ser excluído, e o de fora pode', async () => {
    const n1 = novoId()
    const r = await repo.registrarInclusao(V, n1, dadosDaParada(n1))
    if (!r.ok) throw new Error(r.motivo)
    await expect(repo.excluirLocal('l-mirante')).rejects.toThrow(LocalEmUso)
    await expect(repo.excluirLocal('l-novo')).resolves.toBeUndefined()
  })

  it('excluir a viagem apaga também os trechos da parada incluída', async () => {
    const n1 = novoId()
    await repo.registrarInclusao(V, n1, dadosDaParada(n1))
    await repo.excluirViagem(V)
    expect(await repo.carregarPlano(V)).toBeNull()
  })
})

describe('local novo numa parada flexível pelo repositório', () => {
  const dados = {
    localId: 'l-novo',
    trechos: [tr(ETAPA.monlevade, LOCAL.monlevade, ETAPA.almoco, 'l-novo', 200), tr(ETAPA.almoco, 'l-novo', ETAPA.cafe, LOCAL.cafe, 170)],
  }

  it('T1 grava o local, a troca e o desfazer retira os dois', async () => {
    const r = await repo.registrarLocalNovo(V, ETAPA.almoco, dados)
    if (!r.ok) throw new Error(r.motivo)
    expect(r.eventos.map((e) => e.tipo)).toEqual(['local_incluido', 'troca_local'])
    const { plano, estado: e } = await estado()
    expect(e.etapas.find((x) => x.etapaId === ETAPA.almoco)?.localId).toBe('l-novo')
    expect(plano.etapas.find((x) => x.id === ETAPA.almoco)?.alternativas).toContain('l-novo')
    expect((await repo.desfazerRegistro(V, r.eventos.map((x) => x.id))).ok).toBe(true)
    expect((await estado()).estado.etapas.find((x) => x.etapaId === ETAPA.almoco)?.localId).toBe(LOCAL.restA)
  })

  it('T2 sem o tempo até a etapa seguinte, recusa sem gravar nada', async () => {
    const antes = (await repo.listarEventos(V)).length
    const r = await repo.registrarLocalNovo(V, ETAPA.almoco, { ...dados, trechos: [dados.trechos[0]!] })
    expect(r).toMatchObject({ ok: false })
    expect((await repo.listarEventos(V)).length).toBe(antes)
  })

  it('T6 ponto obrigatório não troca de local', async () => {
    expect(await repo.registrarLocalNovo(V, ETAPA.monlevade, dados)).toMatchObject({ ok: false })
  })

  it('T5 com a chegada pelo Maps grava local, troca e recalibração juntos', async () => {
    const so = { ...dados, trechos: [dados.trechos[1]!] }
    const r = await repo.registrarLocalNovo(V, ETAPA.almoco, so, horaDemo('12:40'))
    if (!r.ok) throw new Error(r.motivo)
    expect(r.eventos.map((e) => e.tipo)).toEqual(['local_incluido', 'troca_local', 'recalibracao'])
  })
})
