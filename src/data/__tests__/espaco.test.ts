import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { simuladoAtivo, usarRelogioReal, usarRelogioSimulado } from '../../core/relogio'
import { BancoBordo, NOME_DO_BANCO } from '../banco'
import { entrarNaDemonstracao, entrarNoEspacoReal, sairDaDemonstracao } from '../espaco'
import { ErroDeEspaco, novoId, Repositorio } from '../repositorio'
import { INICIO_DEMO } from '../semente-demo'
import { planoParaPlanejar } from './ajudas'

afterEach(() => usarRelogioReal())

describe('o relógio acompanha o espaço', () => {
  it('entrar no espaço real liga o relógio real, mesmo vindo da demonstração', async () => {
    await entrarNaDemonstracao()
    expect(simuladoAtivo()).toBe(true)
    entrarNoEspacoReal()
    expect(simuladoAtivo()).toBe(false)
  })

  it('entrar na demonstração liga o relógio simulado no início da demonstração', async () => {
    usarRelogioReal()
    await entrarNaDemonstracao()
    expect(simuladoAtivo()).toBe(true)
  })

  it('sair da demonstração volta ao relógio real', async () => {
    await entrarNaDemonstracao()
    sairDaDemonstracao()
    expect(simuladoAtivo()).toBe(false)
  })

  it('o banco real se recusa a trabalhar com o relógio simulado ligado', async () => {
    const real = entrarNoEspacoReal()
    usarRelogioSimulado(INICIO_DEMO)
    await expect(real.listarViagens()).rejects.toBeInstanceOf(ErroDeEspaco)
    await expect(real.salvarViagem({ ...planoParaPlanejar().viagem, id: novoId() })).rejects.toBeInstanceOf(ErroDeEspaco)
    await expect(real.listarLocais()).rejects.toBeInstanceOf(ErroDeEspaco)
    await expect(real.iniciarViagem('x')).rejects.toBeInstanceOf(ErroDeEspaco)
  })

  it('o banco da demonstração se recusa a trabalhar com o relógio real', async () => {
    const demo = await entrarNaDemonstracao()
    usarRelogioReal()
    await expect(demo.listarViagens()).rejects.toBeInstanceOf(ErroDeEspaco)
  })
})

describe('isolamento entre real e demonstração', () => {
  it('nada da demonstração chega ao banco real', async () => {
    const real = entrarNoEspacoReal()
    await real.limparTudo()

    const demo = await entrarNaDemonstracao()
    await demo.salvarLocal({ id: 'demo-novo', nome: 'Local da demonstração', cidade: 'Cidade X', tipo: 'outro', onibusPara: 'sim' })
    await demo.iniciarViagem('demo-viagem')
    expect(await demo.listarViagens()).toHaveLength(1)

    sairDaDemonstracao()
    const depois = entrarNoEspacoReal()
    expect(await depois.listarViagens()).toEqual([])
    expect(await depois.listarLocais()).toEqual([])

    // Confere direto no banco do navegador, sem passar pelo repositório.
    const cru = new BancoBordo(NOME_DO_BANCO.real)
    expect(await Promise.all([cru.viagens.count(), cru.etapas.count(), cru.locais.count(), cru.trechos.count(), cru.eventos.count()])).toEqual([0, 0, 0, 0, 0])
    cru.close()
  })

  it('nada do banco real aparece na demonstração', async () => {
    const real = entrarNoEspacoReal()
    await real.salvarLocal({ id: 'real-1', nome: 'Posto fictício', cidade: 'Cidade Y', tipo: 'posto', onibusPara: 'sim' })
    const demo = await entrarNaDemonstracao()
    expect((await demo.listarLocais()).some((l) => l.id === 'real-1')).toBe(false)
    sairDaDemonstracao()
    await entrarNoEspacoReal().limparTudo()
  })

  it('reentrar na demonstração apaga as edições e regrava o plano fictício', async () => {
    let demo = await entrarNaDemonstracao()
    await demo.excluirEtapa('demo-almoco')
    await demo.iniciarViagem('demo-viagem')
    demo = await entrarNaDemonstracao()
    expect(await demo.listarEtapas('demo-viagem')).toHaveLength(6)
    expect((await demo.obterViagem('demo-viagem'))?.status).toBe('planejando')
  })

  it('a semente se recusa a rodar no banco real', async () => {
    const { semearDemonstracao } = await import('../semente-demo')
    const real = new Repositorio(new BancoBordo('teste-semente-real'), 'real')
    await expect(semearDemonstracao(real)).rejects.toBeInstanceOf(ErroDeEspaco)
  })
})
