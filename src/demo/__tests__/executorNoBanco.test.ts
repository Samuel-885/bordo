import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { calcularEstado } from '../../core/previsao'
import { agora, usarRelogioReal } from '../../core/relogio'
import { mesmoInstante } from '../../core/tempo'
import { repositorioDeTeste } from '../../data/__tests__/ajudas'
import { CENARIOS } from '../cenarios'
import { VIAGEM_DEMO_ID } from '../dados'
import { ExecutorNoBanco } from '../executorNoBanco'
import { SessaoDemo } from '../executor'

afterEach(() => usarRelogioReal())

describe('cenários no banco da demonstração', () => {
  for (const cenario of CENARIOS) {
    it(`"${cenario.id}" dá o mesmo resultado que a sessão em memória`, async () => {
      const memoria = new SessaoDemo(cenario)
      memoria.executarTudo()
      const estadoMemoria = memoria.estado()
      const relogioMemoria = agora()
      const tiposMemoria = memoria.eventos.map((e) => e.tipo)

      const repo = repositorioDeTeste('demo')
      const executor = await ExecutorNoBanco.iniciar(repo, cenario)
      while (await executor.avancarPasso()) {
        /* roda todos os passos */
      }
      expect(executor.passo).toBe(cenario.passos.length)
      expect(mesmoInstante(agora(), relogioMemoria)).toBe(true)

      const dados = (await repo.carregarPlano(VIAGEM_DEMO_ID))!
      const eventos = await repo.listarEventos(VIAGEM_DEMO_ID)
      const original = dados.viagem.planoOriginal!
      expect(original.etapas).toEqual(memoria.original.etapas)
      expect(eventos.map((e) => e.tipo).sort()).toEqual([...tiposMemoria].sort())

      const estado = calcularEstado(dados, original, eventos, agora())
      expect(estado.atrasoDestinoMin).toBe(estadoMemoria.atrasoDestinoMin)
      expect(estado.etapas.map((e) => [e.etapaId, e.estado, e.chegada?.instante, e.saida?.instante])).toEqual(
        estadoMemoria.etapas.map((e) => [e.etapaId, e.estado, e.chegada?.instante, e.saida?.instante]),
      )
    })
  }

  it('a chegada ao destino conclui a viagem no banco', async () => {
    const repo = repositorioDeTeste('demo')
    const executor = await ExecutorNoBanco.iniciar(repo, CENARIOS.find((c) => c.id === 'chegada-ao-destino')!)
    while (await executor.avancarPasso()) {
      /* roda todos os passos */
    }
    expect((await repo.obterViagem(VIAGEM_DEMO_ID))!.status).toBe('concluida')
  })

  it('o modo livre desliga o próximo passo; reiniciar volta ao passo 0', async () => {
    const repo = repositorioDeTeste('demo')
    const cenario = CENARIOS[0]!
    const executor = await ExecutorNoBanco.iniciar(repo, cenario)
    await executor.avancarPasso()
    executor.entrarNoModoLivre()
    expect(executor.proximoPasso).toBeNull()
    expect(await executor.avancarPasso()).toBe(false)
    const novo = await ExecutorNoBanco.iniciar(repo, cenario)
    expect(novo.passo).toBe(0)
    expect(novo.modoLivre).toBe(false)
    expect(await repo.listarEventos(VIAGEM_DEMO_ID)).toHaveLength(1)
  })

  it('recusa rodar no banco real', async () => {
    const repo = repositorioDeTeste('real')
    await expect(ExecutorNoBanco.iniciar(repo, CENARIOS[0]!)).rejects.toThrow()
  })
})
