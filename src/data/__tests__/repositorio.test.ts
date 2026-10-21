import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { usarRelogioReal } from '../../core/relogio'
import type { Etapa, Local, Viagem } from '../../core/tipos'
import { instante } from '../../core/tempo'
import { EdicaoBloqueada, LocalEmUso, novoId, type Repositorio } from '../repositorio'
import { semearDemonstracao } from '../semente-demo'
import { idsDe, planoParaPlanejar, repositorioDeTeste } from './ajudas'

let repo: Repositorio
const VIAGEM = 'demo-viagem'

beforeEach(async () => {
  repo = repositorioDeTeste('demo')
  await semearDemonstracao(repo)
})
afterEach(() => usarRelogioReal())

function etapaNova(extra: Partial<Etapa> = {}): Etapa {
  return {
    id: novoId(),
    viagemId: VIAGEM,
    ordem: 0,
    tipo: 'flexivel',
    localId: null,
    alternativas: [],
    permanenciaMin: 15,
    ...extra,
  }
}

describe('viagens, etapas e locais', () => {
  it('a semente grava a viagem em "planejando", sem plano original, com 6 etapas e 8 locais', async () => {
    const v = await repo.obterViagem(VIAGEM)
    expect(v?.status).toBe('planejando')
    expect(v?.planoOriginal).toBeNull()
    expect(await repo.listarEtapas(VIAGEM)).toHaveLength(6)
    expect(await repo.listarLocais()).toHaveLength(8)
  })

  it('etapa nova entra antes do destino e a ordem é renumerada', async () => {
    const nova = etapaNova({ categoria: 'banheiro' })
    await repo.salvarEtapa(nova)
    const lista = await repo.listarEtapas(VIAGEM)
    expect(idsDe(lista).at(-1)).toBe('demo-destino')
    expect(idsDe(lista).at(-2)).toBe(nova.id)
    expect(lista.map((e) => e.ordem)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('editar uma etapa mantém a posição', async () => {
    const [, , almoco] = await repo.listarEtapas(VIAGEM)
    await repo.salvarEtapa({ ...almoco!, permanenciaMin: 45 })
    const lista = await repo.listarEtapas(VIAGEM)
    expect(lista[2]).toMatchObject({ id: 'demo-almoco', permanenciaMin: 45 })
  })

  it('mover respeita origem e destino', async () => {
    await repo.moverEtapa('demo-cafe', 'subir')
    expect(idsDe(await repo.listarEtapas(VIAGEM))).toEqual([
      'demo-origem', 'demo-monlevade', 'demo-cafe', 'demo-almoco', 'demo-jantar', 'demo-destino',
    ])
    await repo.moverEtapa('demo-monlevade', 'subir')
    await repo.moverEtapa('demo-jantar', 'descer')
    expect(idsDe(await repo.listarEtapas(VIAGEM))[1]).toBe('demo-monlevade')
    expect(idsDe(await repo.listarEtapas(VIAGEM)).at(-2)).toBe('demo-jantar')
  })

  it('excluir etapa renumera e apaga os trechos dela', async () => {
    await repo.excluirEtapa('demo-almoco')
    const lista = await repo.listarEtapas(VIAGEM)
    expect(lista.map((e) => e.ordem)).toEqual([1, 2, 3, 4, 5])
    const trechos = await repo.listarTrechos(VIAGEM)
    expect(trechos.every((t) => t.etapaOrigemId !== 'demo-almoco' && t.etapaDestinoId !== 'demo-almoco')).toBe(true)
  })

  it('trocar de lugar apaga trechos que deixaram de ser entre vizinhas', async () => {
    expect((await repo.listarTrechos(VIAGEM)).length).toBe(4)
    await repo.moverEtapa('demo-cafe', 'subir')
    expect(await repo.listarTrechos(VIAGEM)).toEqual([])
  })

  it('remover uma alternativa apaga os trechos que passavam por ela', async () => {
    const almoco = (await repo.listarEtapas(VIAGEM)).find((e) => e.id === 'demo-almoco')!
    await repo.salvarEtapa({ ...almoco, alternativas: ['demo-l-rest-c'] })
    const trechos = await repo.listarTrechos(VIAGEM)
    expect(trechos).toHaveLength(2)
    expect(trechos.some((t) => t.localDestinoId === 'demo-l-rest-b' || t.localOrigemId === 'demo-l-rest-b')).toBe(false)
  })

  it('local em uso não pode ser excluído; local livre pode', async () => {
    await expect(repo.excluirLocal('demo-l-rest-b')).rejects.toBeInstanceOf(LocalEmUso)
    const livre: Local = { id: novoId(), nome: 'Posto fictício', cidade: 'Cidade X', tipo: 'posto', onibusPara: 'nao_sei' }
    await repo.salvarLocal(livre)
    await repo.excluirLocal(livre.id)
    expect((await repo.listarLocais()).some((l) => l.id === livre.id)).toBe(false)
  })

  it('excluir a viagem apaga etapas, trechos e eventos, e mantém os locais', async () => {
    await repo.iniciarViagem(VIAGEM)
    await repo.excluirViagem(VIAGEM)
    expect(await repo.listarViagens()).toEqual([])
    expect(await repo.listarEtapas(VIAGEM)).toEqual([])
    expect(await repo.listarTrechos(VIAGEM)).toEqual([])
    expect(await repo.listarLocais()).toHaveLength(8)
  })

  it('salvarViagem cria em "planejando" mesmo que venha outro status', async () => {
    const v: Viagem = {
      ...planoParaPlanejar().viagem,
      id: novoId(),
      status: 'em_andamento',
      planoOriginal: { congeladoEm: instante('2026-11-14T06:00:00-03:00'), etapas: [] },
    }
    await repo.salvarViagem(v)
    const gravada = await repo.obterViagem(v.id)
    expect(gravada?.status).toBe('planejando')
    expect(gravada?.planoOriginal).toBeNull()
  })
})

describe('data da viagem', () => {
  it('mudar a data de saída desloca os horários das etapas, sem mudar as horas', async () => {
    const v = (await repo.obterViagem(VIAGEM))!
    await repo.salvarViagem({ ...v, dataSaida: instante('2026-11-21T00:00:00-03:00') })
    const lista = await repo.listarEtapas(VIAGEM)
    expect(lista[0]?.chegadaRoteiro).toBe('2026-11-21T06:30:00-03:00')
    expect(lista.at(-1)?.chegadaRoteiro).toBe('2026-11-21T23:30:00-03:00')
    expect((await repo.iniciarViagem(VIAGEM)).ok).toBe(true)
  })

  it('mudar só o nome não mexe nos horários', async () => {
    const v = (await repo.obterViagem(VIAGEM))!
    await repo.salvarViagem({ ...v, nome: 'Outro' })
    expect((await repo.listarEtapas(VIAGEM))[0]?.chegadaRoteiro).toBe('2026-11-14T06:30:00-03:00')
  })
})

describe('trechos manuais', () => {
  const par = {
    etapaOrigemId: 'demo-cafe',
    localOrigemId: 'demo-l-cafe',
    etapaDestinoId: 'demo-jantar',
    localDestinoId: 'demo-l-jantar',
  }

  it('grava e substitui a duração, com fonte "manual"', async () => {
    await repo.salvarTrechoManual(VIAGEM, par, 240)
    await repo.salvarTrechoManual(VIAGEM, par, 250)
    const t = (await repo.listarTrechos(VIAGEM)).filter((x) => x.etapaOrigemId === 'demo-cafe')
    expect(t).toEqual([{ ...par, duracaoMin: 250, fonte: 'manual' }])
  })

  it('recusa duração zero, negativa ou fracionada', async () => {
    for (const ruim of [0, -5, 1.5]) await expect(repo.salvarTrechoManual(VIAGEM, par, ruim)).rejects.toThrow(RangeError)
  })

  it('remove o trecho', async () => {
    await repo.salvarTrechoManual(VIAGEM, par, 240)
    await repo.removerTrecho(VIAGEM, par)
    expect((await repo.listarTrechos(VIAGEM)).some((x) => x.etapaOrigemId === 'demo-cafe')).toBe(false)
  })
})

describe('iniciar a viagem', () => {
  it('grava o plano original, muda o status e registra o evento "início"', async () => {
    const r = await repo.iniciarViagem(VIAGEM)
    expect(r.ok).toBe(true)
    const v = await repo.obterViagem(VIAGEM)
    expect(v?.status).toBe('em_andamento')
    expect(v?.planoOriginal?.etapas).toHaveLength(6)
    expect(v?.planoOriginal?.congeladoEm).toBe('2026-11-14T06:00:00-03:00')
    const destino = v?.planoOriginal?.etapas.find((e) => e.etapaId === 'demo-destino')
    expect(destino?.chegada).toBe('2026-11-14T23:30:00-03:00')
  })

  it('bloqueado quando falta tempo: nada é gravado', async () => {
    await repo.salvarEtapa(etapaNova({ localId: 'demo-l-cafe' }))
    const r = await repo.iniciarViagem(VIAGEM)
    expect(r).toMatchObject({ ok: false, motivo: 'bloqueios' })
    expect(r.ok === false && r.motivo === 'bloqueios' && r.bloqueios.map((b) => b.tipo)).toContain('trecho_sem_tempo')
    const v = await repo.obterViagem(VIAGEM)
    expect(v?.status).toBe('planejando')
    expect(v?.planoOriginal).toBeNull()
  })

  it('depois de iniciada, o planejamento não pode ser editado', async () => {
    await repo.iniciarViagem(VIAGEM)
    const almoco = (await repo.listarEtapas(VIAGEM)).find((e) => e.id === 'demo-almoco')!
    await expect(repo.salvarEtapa({ ...almoco, permanenciaMin: 5 })).rejects.toBeInstanceOf(EdicaoBloqueada)
    await expect(repo.excluirEtapa('demo-almoco')).rejects.toBeInstanceOf(EdicaoBloqueada)
    await expect(repo.moverEtapa('demo-almoco', 'subir')).rejects.toBeInstanceOf(EdicaoBloqueada)
    await expect(repo.salvarTrechoManual(VIAGEM, { etapaOrigemId: 'a', localOrigemId: 'b', etapaDestinoId: 'c', localDestinoId: 'd' }, 10)).rejects.toBeInstanceOf(EdicaoBloqueada)
  })

  it('o plano original não muda nem se a viagem for salva de novo', async () => {
    await repo.iniciarViagem(VIAGEM)
    const antes = (await repo.obterViagem(VIAGEM))!
    await repo.salvarViagem({ ...antes, nome: 'Outro nome', status: 'planejando', planoOriginal: null })
    const depois = (await repo.obterViagem(VIAGEM))!
    expect(depois.planoOriginal).toEqual(antes.planoOriginal)
    expect(depois.status).toBe('em_andamento')
    expect(depois.nome).toBe('Outro nome')
  })

  it('iniciar duas vezes não faz nada na segunda', async () => {
    await repo.iniciarViagem(VIAGEM)
    expect(await repo.iniciarViagem(VIAGEM)).toEqual({ ok: false, motivo: 'nao_planejando' })
  })

  it('viagem inexistente', async () => {
    expect(await repo.iniciarViagem('nao-existe')).toEqual({ ok: false, motivo: 'viagem_inexistente' })
  })
})
