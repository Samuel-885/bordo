import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { definirSimulado, usarRelogioReal } from '../../core/relogio'
import { mesmoInstante } from '../../core/tempo'
import type { Evento } from '../../core/tipos'
import { criarEvento } from '../../core/eventos'
import { pendenciasDeRegistro } from '../../core/previsao'
import { ETAPA, horaDemo } from '../../demo/dados'
import { BancoBordo } from '../banco'
import { Repositorio } from '../repositorio'
import { semearDemonstracao } from '../semente-demo'
import { repositorioDeTeste } from './ajudas'

let repo: Repositorio
const V = 'demo-viagem'
const relogio = (hora: string, dias = 0) => definirSimulado(horaDemo(hora, dias))

async function eventos(): Promise<Evento[]> {
  return (await repo.listarEventos(V)).sort((a, b) => (a.sequencia ?? 0) - (b.sequencia ?? 0))
}
async function registrar(conteudo: Parameters<Repositorio['registrarEvento']>[1], opcoes?: Parameters<Repositorio['registrarEvento']>[2]) {
  const r = await repo.registrarEvento(V, conteudo, opcoes)
  if (!r.ok) throw new Error(r.motivo)
  return r
}
const saida = (etapaId: string) => ({ tipo: 'saida', etapaId }) as const
const chegada = (etapaId: string) => ({ tipo: 'chegada', etapaId }) as const

beforeEach(async () => {
  repo = repositorioDeTeste('demo')
  await semearDemonstracao(repo)
  relogio('06:00')
  const r = await repo.iniciarViagem(V)
  if (!r.ok) throw new Error('não iniciou')
})
afterEach(() => usarRelogioReal())

describe('registrar chegadas e saídas', () => {
  it('grava no horário atual, com sequência crescente e plano original intacto', async () => {
    const antes = (await repo.obterViagem(V))!.planoOriginal
    relogio('06:47')
    const a = await registrar(saida(ETAPA.origem))
    relogio('08:55')
    const b = await registrar(chegada(ETAPA.monlevade))
    expect(mesmoInstante(a.eventos[0]!.horarioFato, horaDemo('06:47'))).toBe(true)
    expect(b.eventos[0]!.sequencia).toBeGreaterThan(a.eventos[0]!.sequencia!)
    expect((await repo.obterViagem(V))!.planoOriginal).toEqual(antes)
  })

  it('recusa registro fora do estado (chegada sem ter saído)', async () => {
    relogio('07:00')
    const r = await repo.registrarEvento(V, chegada(ETAPA.monlevade))
    expect(r.ok).toBe(false)
  })

  it('chegada no destino grava chegada e fim e conclui a viagem; desfazer reabre', async () => {
    const percurso: Array<[string, 'saida' | 'chegada', string]> = [
      ['06:30', 'saida', ETAPA.origem], ['08:25', 'chegada', ETAPA.monlevade], ['08:40', 'saida', ETAPA.monlevade],
      ['12:00', 'chegada', ETAPA.almoco], ['13:00', 'saida', ETAPA.almoco], ['16:00', 'chegada', ETAPA.cafe],
      ['16:30', 'saida', ETAPA.cafe], ['20:30', 'chegada', ETAPA.jantar], ['21:20', 'saida', ETAPA.jantar],
    ]
    for (const [hora, tipo, etapaId] of percurso) {
      relogio(hora)
      await registrar({ tipo, etapaId })
    }
    relogio('23:30')
    const r = await registrar(chegada(ETAPA.destino))
    expect(r.eventos.map((e) => e.tipo)).toEqual(['chegada', 'fim'])
    expect((await repo.obterViagem(V))!.status).toBe('concluida')
    expect((await repo.registrarEvento(V, { tipo: 'imprevisto', dados: { categoria: 'clima' } })).ok).toBe(false)

    const d = await repo.desfazerRegistro(V, r.eventos.map((e) => e.id))
    expect(d.ok).toBe(true)
    expect((await repo.obterViagem(V))!.status).toBe('em_andamento')
    expect((await eventos()).some((e) => e.tipo === 'fim')).toBe(false)
  })
})

describe('desfazer', () => {
  it('desfaz o evento pelo id quando ainda é o último', async () => {
    relogio('06:47')
    const a = await registrar(saida(ETAPA.origem))
    expect(await repo.desfazerRegistro(V, [a.eventos[0]!.id])).toEqual({ ok: true })
    expect((await eventos()).map((e) => e.tipo)).toEqual(['inicio'])
  })

  it('não desfaz se houve outro registro depois, mesmo no mesmo minuto', async () => {
    relogio('06:47')
    const a = await registrar(saida(ETAPA.origem))
    await registrar({ tipo: 'imprevisto', dados: { categoria: 'transito' } })
    const r = await repo.desfazerRegistro(V, [a.eventos[0]!.id])
    expect(r.ok).toBe(false)
    expect(await eventos()).toHaveLength(3)
  })

  it('o início da viagem não pode ser desfeito', async () => {
    const inicio = (await eventos())[0]!
    expect((await repo.desfazerRegistro(V, [inicio.id])).ok).toBe(false)
  })
})

describe('corrigir horário', () => {
  it('muda só o horário do fato e respeita as travas', async () => {
    relogio('06:47')
    await registrar(saida(ETAPA.origem))
    relogio('08:55')
    const c = await registrar(chegada(ETAPA.monlevade))
    const id = c.eventos[0]!.id
    expect((await repo.corrigirHorarioDoEvento(V, id, horaDemo('08:50'))).ok).toBe(true)
    const corrigido = (await eventos()).find((e) => e.id === id)!
    expect(mesmoInstante(corrigido.horarioFato, horaDemo('08:50'))).toBe(true)
    expect(mesmoInstante(corrigido.registradoEm, horaDemo('08:55'))).toBe(true)
    expect(await repo.corrigirHorarioDoEvento(V, id, horaDemo('06:00'))).toMatchObject({ ok: false })
    expect(await repo.corrigirHorarioDoEvento(V, id, horaDemo('09:00'))).toMatchObject({ ok: false })
  })

  it('corrigir a chegada no destino move também o fim', async () => {
    const percurso: Array<[string, 'saida' | 'chegada', string]> = [
      ['06:30', 'saida', ETAPA.origem], ['08:25', 'chegada', ETAPA.monlevade], ['08:40', 'saida', ETAPA.monlevade],
      ['12:00', 'chegada', ETAPA.almoco], ['13:00', 'saida', ETAPA.almoco], ['16:00', 'chegada', ETAPA.cafe],
      ['16:30', 'saida', ETAPA.cafe], ['20:30', 'chegada', ETAPA.jantar], ['21:20', 'saida', ETAPA.jantar],
    ]
    for (const [hora, tipo, etapaId] of percurso) {
      relogio(hora)
      await registrar({ tipo, etapaId })
    }
    relogio('23:40')
    const r = await registrar(chegada(ETAPA.destino))
    expect((await repo.corrigirHorarioDoEvento(V, r.eventos[0]!.id, horaDemo('23:35'))).ok).toBe(true)
    const fim = (await eventos()).find((e) => e.tipo === 'fim')!
    expect(mesmoInstante(fim.horarioFato, horaDemo('23:35'))).toBe(true)
  })
})

describe('parada não planejada aberta (acréscimo A)', () => {
  async function ateOTrecho() {
    relogio('06:47')
    await registrar(saida(ETAPA.origem))
    relogio('08:55')
    await registrar(chegada(ETAPA.monlevade))
    relogio('09:14')
    await registrar(saida(ETAPA.monlevade))
    relogio('10:00')
    await registrar({ tipo: 'parada_nao_planejada', etapaId: ETAPA.almoco, dados: { fase: 'inicio', motivo: 'pneu' } })
  }

  it('CHEGAMOS sem informar a volta é recusado e nada é gravado', async () => {
    await ateOTrecho()
    relogio('12:30')
    const antes = (await eventos()).length
    const r = await repo.registrarChegada(V, ETAPA.almoco)
    expect(r.ok).toBe(false)
    expect((await eventos()).length).toBe(antes)
  })

  it('com a hora da volta grava VOLTAMOS antes da chegada, e desfaz os dois juntos', async () => {
    await ateOTrecho()
    relogio('12:30')
    const r = await repo.registrarChegada(V, ETAPA.almoco, { retornoEm: horaDemo('10:20') })
    if (!r.ok) throw new Error(r.motivo)
    expect(r.eventos.map((e) => e.tipo)).toEqual(['parada_nao_planejada', 'chegada'])
    const [volta, cheg] = r.eventos
    expect(mesmoInstante(volta!.horarioFato, horaDemo('10:20'))).toBe(true)
    expect(volta!.sequencia).toBeLessThan(cheg!.sequencia!)

    expect(await repo.desfazerRegistro(V, r.eventos.map((e) => e.id))).toEqual({ ok: true })
    expect((await eventos()).some((e) => e.tipo === 'parada_nao_planejada' && e.dados.fase === 'fim')).toBe(false)
  })

  it('a volta antes do PARAMOS ou depois de agora é recusada, sem gravar nada', async () => {
    await ateOTrecho()
    relogio('12:30')
    const antes = (await eventos()).length
    expect((await repo.registrarChegada(V, ETAPA.almoco, { retornoEm: horaDemo('09:50') })).ok).toBe(false)
    expect((await repo.registrarChegada(V, ETAPA.almoco, { retornoEm: horaDemo('12:40') })).ok).toBe(false)
    expect((await eventos()).length).toBe(antes)
  })
})

describe('registro esquecido', () => {
  it('grava a pendência com o horário digitado, respeitando as travas', async () => {
    // Chegada em Monlevade sem a saída da origem: gravada fora dos botões, para criar a pendência.
    const banco = new BancoBordo('teste-pendencia')
    const repoP = new Repositorio(banco, 'demo')
    await semearDemonstracao(repoP)
    relogio('06:00')
    await repoP.iniciarViagem(V)
    relogio('08:55')
    const base = { id: 'x1', viagemId: V, horarioFato: horaDemo('08:55'), registradoEm: horaDemo('08:55'), sequencia: 2 }
    await banco.eventos.add(criarEvento(base, { tipo: 'chegada', etapaId: ETAPA.monlevade }))

    const dados = (await repoP.carregarPlano(V))!
    expect(pendenciasDeRegistro(dados, await repoP.listarEventos(V))).toEqual([{ etapaId: ETAPA.origem, momento: 'saida' }])

    // A saída esquecida não pode ser depois da chegada da etapa seguinte nem depois de agora.
    expect((await repoP.registrarPendencia(V, ETAPA.origem, 'saida', horaDemo('09:00'))).ok).toBe(false)
    const r = await repoP.registrarPendencia(V, ETAPA.origem, 'saida', horaDemo('06:47'))
    expect(r.ok).toBe(true)
    expect(pendenciasDeRegistro(dados, await repoP.listarEventos(V))).toEqual([])
    expect((await repoP.registrarPendencia(V, ETAPA.origem, 'saida', horaDemo('06:50'))).ok).toBe(false)
  })
})
