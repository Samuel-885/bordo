import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { calcularEstado } from '../../core/previsao'
import { definirSimulado, usarRelogioReal } from '../../core/relogio'
import { mesmoInstante } from '../../core/tempo'
import { ETAPA, horaDemo, LOCAL, PLANO_DEMO } from '../../demo/dados'
import { BancoBordo } from '../banco'
import type { Repositorio } from '../repositorio'
import { semearDemonstracao } from '../semente-demo'
import { repositorioDeTeste } from './ajudas'

let repo: Repositorio
const V = 'demo-viagem'
const relogio = (hora: string) => definirSimulado(horaDemo(hora))

async function registrar(conteudo: Parameters<Repositorio['registrarEvento']>[1], hora: string) {
  relogio(hora)
  const r = await repo.registrarEvento(V, conteudo)
  if (!r.ok) throw new Error(r.motivo)
}
const saida = (etapaId: string, hora: string) => registrar({ tipo: 'saida', etapaId }, hora)
const chegada = (etapaId: string, hora: string) => registrar({ tipo: 'chegada', etapaId }, hora)

beforeEach(async () => {
  repo = repositorioDeTeste('demo')
  await semearDemonstracao(repo)
  relogio('06:00')
  const r = await repo.iniciarViagem(V)
  if (!r.ok) throw new Error('não iniciou')
})
afterEach(() => usarRelogioReal())

async function estado(hora: string) {
  const plano = (await repo.carregarPlano(V))!
  return { plano, e: calcularEstado(plano, plano.viagem.planoOriginal!, await repo.listarEventos(V), horaDemo(hora)) }
}

describe('migração do banco da versão 2 para a 3', () => {
  it('preserva tudo e cria a tabela de consultas vazia', async () => {
    const nome = 'teste-migracao-v2'
    const antigo = new Dexie(nome)
    antigo.version(1).stores({
      viagens: 'id, status',
      etapas: 'id, viagemId, [viagemId+ordem]',
      locais: 'id, cidade',
      trechos: '[etapaOrigemId+localOrigemId+etapaDestinoId+localDestinoId], etapaOrigemId, etapaDestinoId',
      eventos: 'id, viagemId, [viagemId+horarioFato]',
    })
    antigo.version(2).stores({ passageiros: 'id, viagemId' })
    await antigo.table('viagens').put(PLANO_DEMO.viagem)
    await antigo.table('etapas').bulkPut(PLANO_DEMO.etapas)
    antigo.close()

    const novo = new BancoBordo(nome)
    await novo.open()
    expect(novo.verno).toBe(4)
    expect(await novo.viagens.count()).toBe(1)
    expect(await novo.etapas.count()).toBe(PLANO_DEMO.etapas.length)
    expect(await novo.consultas.count()).toBe(0)
    novo.close()
  })
})

describe('consultas ao Google Maps', () => {
  it('guardam sem criar evento nem mexer na previsão ou no plano original', async () => {
    await saida(ETAPA.origem, '06:30')
    await chegada(ETAPA.monlevade, '08:25')
    await saida(ETAPA.monlevade, '10:55')
    relogio('10:57')
    const antes = JSON.stringify([(await repo.listarEventos(V)).length, (await estado('10:57')).e, (await repo.obterViagem(V))!.planoOriginal])
    expect(await repo.salvarConsulta(V, ETAPA.almoco, LOCAL.restC, horaDemo('15:05'))).toEqual({ ok: true })
    const [c] = await repo.listarConsultas(V)
    expect(c).toMatchObject({ localId: LOCAL.restC, parado: false })
    expect(mesmoInstante(c!.horario, horaDemo('15:05'))).toBe(true)
    expect(JSON.stringify([(await repo.listarEventos(V)).length, (await estado('10:57')).e, (await repo.obterViagem(V))!.planoOriginal])).toBe(antes)
  })

  it('uma consulta nova no mesmo local substitui a anterior', async () => {
    await saida(ETAPA.origem, '06:30')
    await chegada(ETAPA.monlevade, '08:25')
    await saida(ETAPA.monlevade, '10:55')
    relogio('10:57')
    await repo.salvarConsulta(V, ETAPA.almoco, LOCAL.restC, horaDemo('15:05'))
    relogio('11:00')
    await repo.salvarConsulta(V, ETAPA.almoco, LOCAL.restC, horaDemo('15:02'))
    const lista = await repo.listarConsultas(V)
    expect(lista).toHaveLength(1)
    expect(mesmoInstante(lista[0]!.horario, horaDemo('15:02'))).toBe(true)
  })

  it('recusa horário no passado, parada que não é a próxima e viagem sem condição', async () => {
    await saida(ETAPA.origem, '06:30')
    await chegada(ETAPA.monlevade, '08:25')
    await saida(ETAPA.monlevade, '10:55')
    relogio('10:57')
    expect(await repo.salvarConsulta(V, ETAPA.almoco, LOCAL.restC, horaDemo('10:50'))).toMatchObject({ ok: false })
    expect(await repo.salvarConsulta(V, ETAPA.cafe, LOCAL.cafe, horaDemo('19:00'))).toMatchObject({ ok: false })
    expect(await repo.listarConsultas(V)).toHaveLength(0)
  })

  it('aplicar no não escolhido grava troca + recalibração com o horário consultado; desfazer retira os dois', async () => {
    await saida(ETAPA.origem, '06:30')
    await chegada(ETAPA.monlevade, '08:25')
    await saida(ETAPA.monlevade, '10:55')
    relogio('10:57')
    await repo.salvarConsulta(V, ETAPA.almoco, LOCAL.restB, horaDemo('14:20'))
    const antes = (await repo.listarEventos(V)).length
    const r = await repo.aplicarConsulta(V, ETAPA.almoco, LOCAL.restB)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.eventos.map((e) => e.tipo)).toEqual(['troca_local', 'recalibracao'])
    expect((await repo.listarEventos(V)).length).toBe(antes + 2)
    const { e } = await estado('10:57')
    const almoco = e.etapas.find((x) => x.etapaId === ETAPA.almoco)!
    expect(almoco).toMatchObject({ localId: LOCAL.restB })
    expect(mesmoInstante(almoco.chegada!.instante, horaDemo('14:20'))).toBe(true)
    expect(almoco.chegada?.origem).toBe('recalibracao')
    expect(await repo.listarConsultas(V)).toHaveLength(0)
    expect((await repo.desfazerRegistro(V, r.eventos.map((x) => x.id))).ok).toBe(true)
    expect((await repo.listarEventos(V)).length).toBe(antes)
  })

  it('aplicar no já escolhido grava só a recalibração (ATUALIZAR PREVISÃO)', async () => {
    await saida(ETAPA.origem, '06:30')
    await chegada(ETAPA.monlevade, '08:25')
    await saida(ETAPA.monlevade, '10:55')
    relogio('10:57')
    await repo.salvarConsulta(V, ETAPA.almoco, LOCAL.restA, horaDemo('14:30'))
    const r = await repo.aplicarConsulta(V, ETAPA.almoco, LOCAL.restA)
    expect(r.ok && r.eventos.map((x) => x.tipo)).toEqual(['recalibracao'])
  })

  it('consulta antiga (mais de 30 min) não é aplicada e nada é gravado', async () => {
    await saida(ETAPA.origem, '06:30')
    await chegada(ETAPA.monlevade, '08:25')
    await saida(ETAPA.monlevade, '10:55')
    relogio('10:57')
    await repo.salvarConsulta(V, ETAPA.almoco, LOCAL.restB, horaDemo('14:20'))
    relogio('11:30')
    const antes = (await repo.listarEventos(V)).length
    expect(await repo.aplicarConsulta(V, ETAPA.almoco, LOCAL.restB)).toMatchObject({ ok: false, motivo: expect.stringContaining('não vale mais') })
    expect((await repo.listarEventos(V)).length).toBe(antes)
  })

  it('consultado parado às 08:30 (chegada 12:00) e aplicado às 08:38 → chegada 12:08', async () => {
    await saida(ETAPA.origem, '06:30')
    await chegada(ETAPA.monlevade, '08:25')
    relogio('08:30')
    await repo.salvarConsulta(V, ETAPA.almoco, LOCAL.restC, horaDemo('12:00'))
    expect((await repo.listarConsultas(V))[0]!.parado).toBe(true)
    relogio('08:38')
    const r = await repo.aplicarConsulta(V, ETAPA.almoco, LOCAL.restC)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const recal = r.eventos.find((x) => x.tipo === 'recalibracao')
    expect(recal?.tipo === 'recalibracao' && mesmoInstante(recal.dados.horario, horaDemo('12:08'))).toBe(true)
  })

  it('a saída depois de consultar parado descarta a consulta', async () => {
    await saida(ETAPA.origem, '06:30')
    await chegada(ETAPA.monlevade, '08:25')
    relogio('08:30')
    await repo.salvarConsulta(V, ETAPA.almoco, LOCAL.restC, horaDemo('12:00'))
    await saida(ETAPA.monlevade, '08:40')
    relogio('08:41')
    expect(await repo.aplicarConsulta(V, ETAPA.almoco, LOCAL.restC)).toMatchObject({ ok: false })
  })

  it('excluir a viagem apaga as consultas', async () => {
    await saida(ETAPA.origem, '06:30')
    await chegada(ETAPA.monlevade, '08:25')
    await saida(ETAPA.monlevade, '10:55')
    relogio('10:57')
    await repo.salvarConsulta(V, ETAPA.almoco, LOCAL.restB, horaDemo('14:20'))
    await repo.excluirViagem(V)
    expect(await repo.listarConsultas(V)).toHaveLength(0)
  })
})
