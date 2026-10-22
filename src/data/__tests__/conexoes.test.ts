import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { describe, expect, it, vi } from 'vitest'
import { assinarAvisosDoBanco, avisarBanco, mensagemDeErroDoBanco, TEXTO_ATUALIZADO } from '../avisoBanco'
import { BancoBordo, ligarAvisosDeConexao } from '../banco'

const ESQUEMA_V1 = {
  viagens: 'id, status',
  etapas: 'id, viagemId, [viagemId+ordem]',
  locais: 'id, cidade',
  trechos: '[etapaOrigemId+localOrigemId+etapaDestinoId+localDestinoId], etapaOrigemId, etapaDestinoId',
  eventos: 'id, viagemId, [viagemId+horarioFato]',
}

let n = 0
const nomeUnico = () => `teste-conexoes-${++n}`

async function conexaoAntiga(nome: string): Promise<Dexie> {
  const antiga = new Dexie(nome)
  antiga.version(1).stores(ESQUEMA_V1)
  await antiga.open()
  await antiga.table('viagens').put({ id: 'v1', status: 'em_andamento' })
  return antiga
}

describe('app aberto em mais de um lugar', () => {
  it('a conexão antiga (v1) se fecha sozinha, avisa "atualizado" e a versão nova abre sem perder dados', async () => {
    const nome = nomeUnico()
    const antiga = await conexaoAntiga(nome)
    const avisos = vi.fn()
    ligarAvisosDeConexao(antiga, avisos)

    const nova = new BancoBordo(nome)
    await nova.open()

    expect(antiga.isOpen()).toBe(false)
    expect(avisos).toHaveBeenCalledWith('atualizado')
    expect(nova.verno).toBe(4)
    expect((await nova.viagens.get('v1'))?.status).toBe('em_andamento')
    expect(await nova.passageiros.count()).toBe(0)
    nova.close()
  })

  it('abertura bloqueada: avisa "bloqueado" e abre assim que a outra conexão se fecha', async () => {
    const nome = nomeUnico()
    const antiga = await conexaoAntiga(nome)
    // Uma conexão antiga que não solta o banco (outra aba travada).
    antiga.on('versionchange', () => false)

    const avisos = vi.fn()
    const nova = new BancoBordo(nome)
    ligarAvisosDeConexao(nova, avisos)
    const abrindo = nova.open()

    await vi.waitFor(() => expect(avisos).toHaveBeenCalledWith('bloqueado'))
    expect(nova.isOpen()).toBe(false)

    antiga.close()
    await abrindo
    expect(nova.isOpen()).toBe(true)
    expect(avisos).toHaveBeenLastCalledWith(null)
    expect((await nova.viagens.get('v1'))?.status).toBe('em_andamento')
    nova.close()
  })

  it('o banco do app liga os avisos por padrão: o aviso chega aos assinantes', async () => {
    const nome = nomeUnico()
    const visto: Array<string | null> = []
    const parar = assinarAvisosDoBanco((a) => visto.push(a))
    const antigo = new BancoBordo(nome)
    await antigo.open()
    // Uma versão futura do app sobe o esquema da mesma base.
    const futura = new Dexie(nome)
    futura.version(4).stores({ passageiros: 'id, viagemId', consultas: '[viagemId+etapaId+localId], viagemId', extra: 'id' })
    await futura.open()
    expect(antigo.isOpen()).toBe(false)
    expect(visto).toContain('atualizado')
    futura.close()
    parar()
    avisarBanco(null)
  })

  it('banco fechado vira a mensagem para a pessoa, sem o erro técnico', () => {
    const erro = new Dexie.DatabaseClosedError()
    expect(mensagemDeErroDoBanco(erro, 'padrão')).toBe(TEXTO_ATUALIZADO)
    expect(mensagemDeErroDoBanco(new Error('outro'), 'padrão')).toBe('outro')
    expect(mensagemDeErroDoBanco('x', 'padrão')).toBe('padrão')
  })
})
