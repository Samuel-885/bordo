import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { descidaParaConferencia, contextoDeSaida, marcacaoDeDescida } from '../../core/conferencia'
import { calcularEstado } from '../../core/previsao'
import { definirSimulado, usarRelogioReal } from '../../core/relogio'
import { ETAPA, horaDemo, PASSAGEIROS_DEMO } from '../../demo/dados'
import type { Repositorio } from '../repositorio'
import { semearDemonstracao } from '../semente-demo'
import { repositorioDeTeste } from './ajudas'

const V = 'demo-viagem'
let repo: Repositorio
const relogio = (hora: string) => definirSimulado(horaDemo(hora))
const ids = (n: number) => PASSAGEIROS_DEMO.slice(0, n).map((p) => p.id)

async function marcar(etapaId: string, local: 'etapa' | 'nao_planejada', passageiroIds: string[]) {
  const r = await repo.registrarEvento(V, { tipo: 'desceram', etapaId, dados: { local, passageiroIds } })
  if (!r.ok) throw new Error(r.motivo)
  return r
}
const vigente = async (etapaId: string, local: 'etapa' | 'nao_planejada') => marcacaoDeDescida(await repo.listarEventos(V), local, etapaId)

beforeEach(async () => {
  repo = repositorioDeTeste('demo')
  await semearDemonstracao(repo)
  relogio('06:00')
  expect((await repo.iniciarViagem(V)).ok).toBe(true)
  relogio('06:30')
  expect((await repo.registrarEvento(V, { tipo: 'saida', etapaId: ETAPA.origem })).ok).toBe(true)
})
afterEach(() => usarRelogioReal())

describe('marcar quem desceu no banco', () => {
  it('na parada de uma etapa: a nova marcação substitui a anterior e o DESFAZER devolve a anterior', async () => {
    relogio('08:25')
    expect((await repo.registrarChegada(V, ETAPA.monlevade)).ok).toBe(true)
    const primeira = await marcar(ETAPA.monlevade, 'etapa', ids(5))
    expect(await vigente(ETAPA.monlevade, 'etapa')).toEqual(ids(5))
    relogio('08:30')
    const segunda = await marcar(ETAPA.monlevade, 'etapa', ids(2))
    expect(await vigente(ETAPA.monlevade, 'etapa')).toEqual(ids(2))

    expect((await repo.desfazerRegistro(V, segunda.eventos.map((e) => e.id))).ok).toBe(true)
    expect(await vigente(ETAPA.monlevade, 'etapa')).toEqual(ids(5))
    expect((await repo.desfazerRegistro(V, primeira.eventos.map((e) => e.id))).ok).toBe(true)
    expect(await vigente(ETAPA.monlevade, 'etapa')).toBeNull()
  })

  it('recusa marcar fora da parada, e quem embarca ali ainda não está a bordo', async () => {
    const fora = await repo.registrarEvento(V, { tipo: 'desceram', etapaId: ETAPA.monlevade, dados: { local: 'etapa', passageiroIds: ids(1) } })
    expect(fora.ok).toBe(false)
    relogio('08:25')
    await repo.registrarChegada(V, ETAPA.monlevade)
    const embarcante = await repo.registrarEvento(V, {
      tipo: 'desceram',
      etapaId: ETAPA.monlevade,
      dados: { local: 'etapa', passageiroIds: [PASSAGEIROS_DEMO[36]!.id] },
    })
    expect(embarcante.ok).toBe(false)
  })

  it('na parada não planejada: liga à próxima etapa e alimenta o estado inicial da conferência do VOLTAMOS', async () => {
    relogio('07:00')
    const p = await repo.registrarEvento(V, { tipo: 'parada_nao_planejada', etapaId: ETAPA.monlevade, dados: { fase: 'inicio', motivo: 'banheiro' } })
    expect(p.ok).toBe(true)
    const m = await marcar(ETAPA.monlevade, 'nao_planejada', ids(4))
    expect(m.eventos[0]).toMatchObject({ tipo: 'desceram', etapaId: ETAPA.monlevade })
    const eventos = await repo.listarEventos(V)
    const ctx = { momento: 'volta' as const, etapaId: ETAPA.monlevade, esperados: PASSAGEIROS_DEMO.slice(0, 35) }
    expect(descidaParaConferencia(ctx, eventos)).toEqual(ids(4))
  })

  it('não muda o cálculo da previsão', async () => {
    relogio('08:25')
    await repo.registrarChegada(V, ETAPA.monlevade)
    relogio('08:30')
    const plano = (await repo.carregarPlano(V))!
    const original = plano.viagem.planoOriginal!
    const antes = calcularEstado(plano, original, await repo.listarEventos(V), horaDemo('08:30'))
    await marcar(ETAPA.monlevade, 'etapa', ids(3))
    const depois = calcularEstado(plano, original, await repo.listarEventos(V), horaDemo('08:30'))
    expect(depois).toEqual(antes)
  })

  it('a conferência da saída parte da marcação', async () => {
    relogio('08:25')
    await repo.registrarChegada(V, ETAPA.monlevade)
    await marcar(ETAPA.monlevade, 'etapa', ids(3))
    const plano = (await repo.carregarPlano(V))!
    const eventos = await repo.listarEventos(V)
    const ctx = contextoDeSaida(ETAPA.monlevade, plano, await repo.listarPassageiros(V), eventos)
    expect(descidaParaConferencia(ctx, eventos)).toEqual(ids(3))
  })
})
