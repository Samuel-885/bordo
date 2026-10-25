import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { usarRelogioReal, usarRelogioSimulado } from '../../core/relogio'
import type { Local, Viagem } from '../../core/tipos'
import { BancoBordo } from '../banco'
import { LocalEmUso, novoId, Repositorio } from '../repositorio'
import { INICIO_DEMO, semearDemonstracao } from '../semente-demo'
import { ETAPA, LOCAL, horaDemo } from '../../demo/dados'

const A = 'demo-viagem'
let db: BancoBordo
let repo: Repositorio
let n = 0

beforeEach(async () => {
  usarRelogioSimulado(INICIO_DEMO)
  n += 1
  db = new BancoBordo(`teste-excluir-viagem-${n}`)
  repo = new Repositorio(db, 'demo')
  await semearDemonstracao(repo)
})
afterEach(() => usarRelogioReal())

/** Uma segunda viagem, em planejamento, com um local só dela e o ponto de saída compartilhado. */
async function viagemB() {
  const viagem: Viagem = { id: novoId(), nome: 'Teste', tipo: 'ida', dataSaida: horaDemo('00:00'), status: 'planejando', fatorOnibus: 1.15, planoOriginal: null }
  const solo: Local = { id: novoId(), nome: 'Local só da viagem B', cidade: 'Cidade X', tipo: 'parada', onibusPara: 'sim' }
  await repo.salvarLocal(solo)
  await repo.salvarViagem(viagem)
  await repo.salvarEtapa({ id: novoId(), viagemId: viagem.id, ordem: 1, tipo: 'origem', localId: LOCAL.saida, alternativas: [], permanenciaMin: 0, chegadaRoteiro: horaDemo('06:30') })
  await repo.salvarEtapa({ id: novoId(), viagemId: viagem.id, ordem: 2, tipo: 'destino', localId: solo.id, alternativas: [], permanenciaMin: 0, chegadaRoteiro: horaDemo('08:00') })
  return { viagem, solo }
}

const contar = async (viagemId: string) => ({
  etapas: await db.etapas.where('viagemId').equals(viagemId).count(),
  eventos: await db.eventos.where('viagemId').equals(viagemId).count(),
  passageiros: await db.passageiros.where('viagemId').equals(viagemId).count(),
  consultas: await db.consultas.where('viagemId').equals(viagemId).count(),
  viagem: await db.viagens.get(viagemId),
})

describe('excluir viagem em qualquer status', () => {
  it('viagem iniciada: apaga etapas, trechos, eventos, passageiros e consultas, e deixa os locais', async () => {
    const r = await repo.iniciarViagem(A)
    if (!r.ok) throw new Error('não iniciou')
    usarRelogioSimulado(horaDemo('06:30'))
    const saida = await repo.registrarEvento(A, { tipo: 'saida', etapaId: ETAPA.origem })
    if (!saida.ok) throw new Error('não saiu')
    await db.consultas.put({ viagemId: A, etapaId: ETAPA.almoco, localId: LOCAL.restB, horario: horaDemo('14:20'), consultadoEm: horaDemo('06:40'), parado: false, base: 1 })
    expect((await contar(A)).eventos).toBeGreaterThan(0)
    expect((await contar(A)).passageiros).toBe(38)
    expect((await contar(A)).consultas).toBe(1)

    await repo.excluirViagem(A)
    expect(await contar(A)).toEqual({ etapas: 0, eventos: 0, passageiros: 0, consultas: 0, viagem: undefined })
    expect(await db.trechos.count()).toBe(0)
    expect(await repo.listarLocais()).toHaveLength(8)
  })

  it('viagem concluída também pode ser excluída', async () => {
    await db.viagens.update(A, { status: 'concluida' })
    await repo.excluirViagem(A)
    expect(await repo.listarViagens()).toEqual([])
  })

  it('a outra viagem não é tocada', async () => {
    const { viagem } = await viagemB()
    const antes = await contar(viagem.id)
    await repo.excluirViagem(A)
    expect(await contar(viagem.id)).toEqual(antes)
    expect(antes.etapas).toBe(2)
  })

  it('depois da exclusão, o local que só a viagem usava pode ser excluído; o compartilhado continua preso', async () => {
    const { viagem, solo } = await viagemB()
    await expect(repo.excluirLocal(solo.id)).rejects.toThrow(LocalEmUso)
    await repo.excluirViagem(viagem.id)
    await repo.excluirLocal(solo.id)
    expect((await repo.listarLocais()).some((l) => l.id === solo.id)).toBe(false)
    await expect(repo.excluirLocal(LOCAL.saida)).rejects.toThrow(LocalEmUso)
  })

  it('a viagem some da lista "restaurada de um backup"; sem nenhuma restante, o aviso inteiro some', async () => {
    const { viagem } = await viagemB()
    const base = { geradoEm: horaDemo('06:00'), restauradoEm: horaDemo('06:00'), dispensado: false }
    await db.meta.put({ chave: 'restauradoDe', valor: { ...base, viagemIds: [A, viagem.id] } })
    await repo.excluirViagem(viagem.id)
    expect((await repo.obterRestauradoDe())?.viagemIds).toEqual([A])
    await repo.excluirViagem(A)
    expect(await repo.obterRestauradoDe()).toBeNull()
  })
})
