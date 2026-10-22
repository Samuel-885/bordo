import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  alternarPassageiro,
  contextoDeSaida,
  contextoDeVolta,
  iniciarConferencia,
  modoPadrao,
  type DecisaoDePendente,
} from '../../core/conferencia'
import { definirSimulado, usarRelogioReal } from '../../core/relogio'
import { ETAPA, horaDemo, PASSAGEIROS_DEMO, PLANO_DEMO } from '../../demo/dados'
import { BancoBordo } from '../banco'
import { EdicaoBloqueada, type Repositorio } from '../repositorio'
import { semearDemonstracao } from '../semente-demo'
import { repositorioDeTeste } from './ajudas'

const V = 'demo-viagem'
let repo: Repositorio
const relogio = (hora: string) => definirSimulado(horaDemo(hora))

afterEach(() => usarRelogioReal())

describe('migração do banco da versão 1 para a 2', () => {
  it('preserva viagens, etapas, locais, trechos e eventos e cria a tabela de passageiros vazia', async () => {
    const nome = 'teste-migracao-v1'
    const antigo = new Dexie(nome)
    antigo.version(1).stores({
      viagens: 'id, status',
      etapas: 'id, viagemId, [viagemId+ordem]',
      locais: 'id, cidade',
      trechos: '[etapaOrigemId+localOrigemId+etapaDestinoId+localDestinoId], etapaOrigemId, etapaDestinoId',
      eventos: 'id, viagemId, [viagemId+horarioFato]',
    })
    await antigo.table('viagens').put(PLANO_DEMO.viagem)
    await antigo.table('etapas').bulkPut(PLANO_DEMO.etapas)
    await antigo.table('locais').bulkPut(PLANO_DEMO.locais)
    await antigo.table('trechos').bulkPut(PLANO_DEMO.trechos)
    await antigo.table('eventos').put({ id: 'e1', viagemId: V, tipo: 'inicio', horarioFato: horaDemo('06:00'), registradoEm: horaDemo('06:00'), sequencia: 1 })
    antigo.close()

    const novo = new BancoBordo(nome)
    await novo.open()
    expect(novo.verno).toBe(3)
    expect(await novo.viagens.count()).toBe(1)
    expect(await novo.etapas.count()).toBe(PLANO_DEMO.etapas.length)
    expect(await novo.locais.count()).toBe(PLANO_DEMO.locais.length)
    expect(await novo.trechos.count()).toBe(PLANO_DEMO.trechos.length)
    expect((await novo.eventos.get('e1'))?.tipo).toBe('inicio')
    expect(await novo.passageiros.count()).toBe(0)
    await novo.passageiros.put(PASSAGEIROS_DEMO[0]!)
    expect(await novo.passageiros.where('viagemId').equals(V).count()).toBe(1)
    novo.close()
  })
})

describe('semente e cadastro', () => {
  beforeEach(async () => {
    repo = repositorioDeTeste('demo')
    await semearDemonstracao(repo)
  })

  it('a semente da demonstração grava os 38 passageiros fictícios na viagem', async () => {
    const lista = await repo.listarPassageiros(V)
    expect(lista).toHaveLength(38)
    expect(lista.every((p) => p.viagemId === V && p.status === 'ativo')).toBe(true)
  })

  it('planejando: cria, edita e exclui; o status gravado é sempre ativo', async () => {
    const criado = await repo.salvarPassageiro(V, { nome: ' Ana Fictícia S. ', etapaEmbarqueId: ETAPA.origem, etapaDesembarqueId: null })
    expect(criado).toMatchObject({ nome: 'Ana Fictícia S.', status: 'ativo', viagemId: V })
    await repo.salvarPassageiro(V, { nome: 'Ana Fictícia T.', etapaEmbarqueId: ETAPA.monlevade, etapaDesembarqueId: null }, criado.id)
    const lista = await repo.listarPassageiros(V)
    expect(lista).toHaveLength(39)
    expect(lista.find((p) => p.id === criado.id)).toMatchObject({ nome: 'Ana Fictícia T.', etapaEmbarqueId: ETAPA.monlevade })
    await repo.excluirPassageiro(criado.id)
    expect(await repo.listarPassageiros(V)).toHaveLength(38)
  })

  it('recusa dados inválidos com a mensagem do núcleo', async () => {
    await expect(repo.salvarPassageiro(V, { nome: '', etapaEmbarqueId: ETAPA.origem, etapaDesembarqueId: null })).rejects.toThrow(EdicaoBloqueada)
    await expect(repo.salvarPassageiro(V, { nome: 'X', etapaEmbarqueId: ETAPA.almoco, etapaDesembarqueId: null })).rejects.toThrow('ponto de embarque')
  })

  it('excluir a viagem apaga os passageiros dela', async () => {
    await repo.excluirViagem(V)
    expect(await repo.listarPassageiros(V)).toHaveLength(0)
  })
})

describe('viagem em andamento', () => {
  beforeEach(async () => {
    repo = repositorioDeTeste('demo')
    await semearDemonstracao(repo)
    relogio('06:00')
    const r = await repo.iniciarViagem(V)
    if (!r.ok) throw new Error('não iniciou')
  })

  async function conferir(
    etapaId: string,
    tocar: string[] = [],
    decisoes: DecisaoDePendente[] = [],
    modo?: 'todos_desceram' | 'so_alguns',
  ) {
    const plano = (await repo.carregarPlano(V))!
    const etapa = plano.etapas.find((e) => e.id === etapaId)!
    const eventos = await repo.listarEventos(V)
    const contexto = contextoDeSaida(etapaId, plano, await repo.listarPassageiros(V), eventos)
    let estado = iniciarConferencia(contexto, plano.etapas, modo ?? modoPadrao(etapa, 'saida'), etapa)
    for (const id of tocar) estado = alternarPassageiro(estado, id)
    return { contexto, estado, decisoes }
  }
  const todosDeIpatinga = PASSAGEIROS_DEMO.slice(0, 35).map((p) => p.id)

  it('adicionar alguém de última hora: embarque em etapa futura sim, em etapa deixada não', async () => {
    relogio('06:30')
    await repo.registrarEvento(V, { tipo: 'saida', etapaId: ETAPA.origem })
    const tarde = await repo.salvarPassageiro(V, { nome: 'Última Hora F.', etapaEmbarqueId: ETAPA.monlevade, etapaDesembarqueId: null })
    expect(tarde.etapaEmbarqueId).toBe(ETAPA.monlevade)
    await expect(repo.salvarPassageiro(V, { nome: 'Atrasado F.', etapaEmbarqueId: ETAPA.origem, etapaDesembarqueId: null })).rejects.toThrow(
      'já saiu',
    )
  })

  it('SAÍMOS com conferência completa grava conferência e saída; DESFAZER desfaz as duas', async () => {
    relogio('06:30')
    const r = await repo.registrarSaidaComConferencia(V, ETAPA.origem, await conferir(ETAPA.origem, todosDeIpatinga))
    if (!r.ok) throw new Error(r.motivo)
    expect(r.eventos.map((e) => e.tipo)).toEqual(['conferencia', 'saida'])
    expect(r.eventos[0]).toMatchObject({ dados: { momento: 'saida', resultado: 'completa', pendentes: [] } })
    expect((await repo.listarEventos(V)).map((e) => e.tipo).sort()).toEqual(['conferencia', 'inicio', 'saida'])

    const d = await repo.desfazerRegistro(V, r.eventos.map((e) => e.id))
    expect(d.ok).toBe(true)
    expect((await repo.listarEventos(V)).map((e) => e.tipo)).toEqual(['inicio'])
  })

  it('sair sem todos: status dos pendentes gravados com a saída, na ordem certa', async () => {
    relogio('06:30')
    const decisoes: DecisaoDePendente[] = [{ passageiroId: todosDeIpatinga[0]!, status: 'nao_embarcou', motivo: 'Não apareceu' }]
    const r = await repo.registrarSaidaComConferencia(V, ETAPA.origem, await conferir(ETAPA.origem, todosDeIpatinga.slice(1), decisoes))
    if (!r.ok) throw new Error(r.motivo)
    expect(r.eventos.map((e) => e.tipo)).toEqual(['conferencia', 'status_passageiro', 'saida'])
    expect(r.eventos[0]).toMatchObject({ dados: { resultado: 'incompleta', pendentes: [todosDeIpatinga[0]] } })
    expect(r.eventos[1]).toMatchObject({ etapaId: ETAPA.origem, dados: { status: 'nao_embarcou', motivo: 'Não apareceu' } })
    const seq = r.eventos.map((e) => e.sequencia!)
    expect(seq).toEqual([...seq].sort((a, b) => a - b))
  })

  it('tudo ou nada: conferência que não bate com os esperados não grava a saída', async () => {
    relogio('06:30')
    const c = await conferir(ETAPA.origem, todosDeIpatinga)
    const adulterada = { ...c, contexto: { ...c.contexto, esperados: c.contexto.esperados.slice(1) } }
    const r = await repo.registrarSaidaComConferencia(V, ETAPA.origem, adulterada)
    expect(r.ok).toBe(false)
    expect((await repo.listarEventos(V)).map((e) => e.tipo)).toEqual(['inicio'])
  })

  it('em Monlevade: pendentes de embarque saem como "não embarcou" e o esperado seguinte cai para 37', async () => {
    relogio('06:30')
    const a = await repo.registrarSaidaComConferencia(V, ETAPA.origem, await conferir(ETAPA.origem, todosDeIpatinga))
    expect(a.ok).toBe(true)
    relogio('08:25')
    expect((await repo.registrarChegada(V, ETAPA.monlevade)).ok).toBe(true)
    const novo = PASSAGEIROS_DEMO.slice(35)
    const decisoes: DecisaoDePendente[] = [{ passageiroId: novo[2]!.id, status: 'nao_embarcou', motivo: 'Não apareceu' }]
    const c = await conferir(ETAPA.monlevade, [novo[0]!.id, novo[1]!.id], decisoes)
    expect(c.contexto.esperados).toHaveLength(38)
    const r = await repo.registrarSaidaComConferencia(V, ETAPA.monlevade, c)
    if (!r.ok) throw new Error(r.motivo)
    const plano = (await repo.carregarPlano(V))!
    const proximo = contextoDeSaida(ETAPA.almoco, plano, await repo.listarPassageiros(V), await repo.listarEventos(V))
    expect(proximo.esperados).toHaveLength(37)
    // quem já passou por conferência não pode mais ser excluído
    await expect(repo.excluirPassageiro(novo[2]!.id)).rejects.toThrow('conferência')
  })

  it('VOLTAMOS com conferência: fim da parada, conferência e status ligados à próxima etapa', async () => {
    relogio('06:30')
    await repo.registrarSaidaComConferencia(V, ETAPA.origem, await conferir(ETAPA.origem, todosDeIpatinga))
    relogio('07:00')
    const p = await repo.registrarEvento(V, { tipo: 'parada_nao_planejada', etapaId: ETAPA.monlevade, dados: { fase: 'inicio', motivo: 'banheiro' } })
    expect(p.ok).toBe(true)
    relogio('07:15')

    const plano = (await repo.carregarPlano(V))!
    const eventos = await repo.listarEventos(V)
    const contexto = contextoDeVolta(ETAPA.monlevade, plano, await repo.listarPassageiros(V), eventos)
    const etapa = plano.etapas.find((e) => e.id === ETAPA.monlevade)!
    const estado = alternarPassageiro(iniciarConferencia(contexto, plano.etapas, 'so_alguns', etapa), PASSAGEIROS_DEMO[3]!.id)
    const decisoes: DecisaoDePendente[] = [{ passageiroId: PASSAGEIROS_DEMO[3]!.id, status: 'saiu_da_viagem', motivo: 'Ficou na cidade' }]
    const r = await repo.registrarVoltaComConferencia(V, { contexto, estado, decisoes })
    if (!r.ok) throw new Error(r.motivo)
    expect(r.eventos.map((e) => e.tipo)).toEqual(['parada_nao_planejada', 'conferencia', 'status_passageiro'])
    expect(r.eventos.every((e) => !('etapaId' in e) || e.etapaId === ETAPA.monlevade)).toBe(true)
    expect(r.eventos[1]).toMatchObject({ dados: { momento: 'volta', modo: 'so_alguns', resultado: 'incompleta' } })

    const depois = contextoDeVolta(ETAPA.monlevade, plano, await repo.listarPassageiros(V), await repo.listarEventos(V))
    expect(depois.esperados).toHaveLength(34)
    expect((await repo.listarPassageiros(V)).every((p) => p.status === 'ativo')).toBe(true)
  })
})
