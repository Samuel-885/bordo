import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { definirSimulado, usarRelogioReal } from '../../core/relogio'
import { calcularEstado } from '../../core/previsao'
import { ETAPA, horaDemo, LOCAL } from '../../demo/dados'
import type { Repositorio } from '../repositorio'
import { semearDemonstracao } from '../semente-demo'
import { repositorioDeTeste } from './ajudas'

let repo: Repositorio
const V = 'demo-viagem'
const relogio = (hora: string) => definirSimulado(horaDemo(hora))
const troca = (localId: string) => ({ tipo: 'troca_local', etapaId: ETAPA.almoco, dados: { localId } }) as const
const parBAteCafe = { etapaOrigemId: ETAPA.almoco, localOrigemId: LOCAL.restB, etapaDestinoId: ETAPA.cafe, localDestinoId: LOCAL.cafe }
const parMonlevadeAteC = { etapaOrigemId: ETAPA.monlevade, localOrigemId: LOCAL.monlevade, etapaDestinoId: ETAPA.almoco, localDestinoId: LOCAL.restC }

async function sair(etapaId: string, hora: string) {
  relogio(hora)
  const r = await repo.registrarEvento(V, { tipo: 'saida', etapaId })
  if (!r.ok) throw new Error(r.motivo)
}
async function chegar(etapaId: string, hora: string) {
  relogio(hora)
  const r = await repo.registrarEvento(V, { tipo: 'chegada', etapaId })
  if (!r.ok) throw new Error(r.motivo)
}

/** Demonstração iniciada, sem o trecho do B até o café e sem o de Monlevade até o C. */
beforeEach(async () => {
  repo = repositorioDeTeste('demo')
  await semearDemonstracao(repo)
  await repo.removerTrecho(V, parBAteCafe)
  await repo.removerTrecho(V, parMonlevadeAteC)
  relogio('06:00')
  const r = await repo.iniciarViagem(V)
  if (!r.ok) throw new Error('não iniciou')
})
afterEach(() => usarRelogioReal())

describe('troca de local pelo repositório', () => {
  it('grava a troca, recalcula e o desfazer a retira', async () => {
    await sair(ETAPA.origem, '06:30')
    relogio('06:31')
    const r = await repo.registrarEvento(V, troca(LOCAL.restB))
    // Sem o trecho do B até o café a troca é recusada: o B não pode ser escolhido.
    expect(r).toMatchObject({ ok: false })
    await repo.salvarTrechoManualEmViagem(V, parBAteCafe, 180)
    const ok = await repo.registrarEvento(V, troca(LOCAL.restB))
    expect(ok.ok).toBe(true)
    if (!ok.ok) return
    const plano = (await repo.carregarPlano(V))!
    let estado = calcularEstado(plano, plano.viagem.planoOriginal!, await repo.listarEventos(V), horaDemo('06:31'))
    expect(estado.etapas.find((e) => e.etapaId === ETAPA.almoco)?.localId).toBe(LOCAL.restB)
    expect((await repo.desfazerRegistro(V, ok.eventos.map((e) => e.id))).ok).toBe(true)
    estado = calcularEstado(plano, plano.viagem.planoOriginal!, await repo.listarEventos(V), horaDemo('06:31'))
    expect(estado.etapas.find((e) => e.etapaId === ETAPA.almoco)?.localId).toBe(LOCAL.restA)
  })

  it('recusa a troca sem tempo e não grava nada', async () => {
    await sair(ETAPA.origem, '06:30')
    const antes = (await repo.listarEventos(V)).length
    const r = await repo.registrarEvento(V, troca(LOCAL.restC))
    expect(r).toMatchObject({ ok: false, motivo: expect.stringContaining('Falta o tempo de') })
    expect((await repo.listarEventos(V)).length).toBe(antes)
  })

  it('recusa local fora dos candidatos e parada já alcançada', async () => {
    await sair(ETAPA.origem, '06:30')
    expect(await repo.registrarEvento(V, troca(LOCAL.cafe))).toMatchObject({ ok: false })
    await chegar(ETAPA.monlevade, '08:25')
    await sair(ETAPA.monlevade, '08:40')
    await chegar(ETAPA.almoco, '12:00')
    expect(await repo.registrarEvento(V, troca(LOCAL.restB))).toMatchObject({ ok: false })
  })
})

describe('trecho manual com a viagem em andamento', () => {
  it('é aceito em trecho futuro e deixa o plano original intacto', async () => {
    await sair(ETAPA.origem, '06:30')
    const antes = (await repo.obterViagem(V))!.planoOriginal
    expect(await repo.salvarTrechoManualEmViagem(V, parBAteCafe, 180)).toEqual({ ok: true })
    const trechos = await repo.listarTrechos(V)
    expect(trechos).toContainEqual({ ...parBAteCafe, duracaoMin: 180, fonte: 'manual' })
    expect((await repo.obterViagem(V))!.planoOriginal).toEqual(antes)
  })

  it('é aceito da etapa em que estamos para a seguinte', async () => {
    await sair(ETAPA.origem, '06:30')
    await chegar(ETAPA.monlevade, '08:25')
    expect(await repo.salvarTrechoManualEmViagem(V, parMonlevadeAteC, 250)).toEqual({ ok: true })
  })

  it('é recusado em trecho já percorrido ou em curso', async () => {
    await sair(ETAPA.origem, '06:30')
    await chegar(ETAPA.monlevade, '08:25')
    await sair(ETAPA.monlevade, '08:40')
    const r = await repo.salvarTrechoManualEmViagem(V, parMonlevadeAteC, 250)
    expect(r).toMatchObject({ ok: false, motivo: expect.stringContaining('já foi percorrido') })
    expect((await repo.listarTrechos(V)).some((t) => t.localDestinoId === LOCAL.restC && t.etapaOrigemId === ETAPA.monlevade)).toBe(false)
  })

  it('é recusado antes de a viagem iniciar (planejando usa o outro método)', async () => {
    const outro = repositorioDeTeste('demo')
    await semearDemonstracao(outro)
    expect(await outro.salvarTrechoManualEmViagem(V, parBAteCafe, 180)).toMatchObject({ ok: false })
  })
})
