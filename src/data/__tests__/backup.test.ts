import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { serializarBackup, validarBackup, type Backup } from '../../core/backup'
import { calcularEstado, pendenciasDeRegistro } from '../../core/previsao'
import { paradaAberta, situacaoDaViagem } from '../../core/registro'
import { usarRelogioReal } from '../../core/relogio'
import { cenarioPorId } from '../../demo/cenarios'
import { ETAPA, horaDemo, PLANO_DEMO, VIAGEM_DEMO_ID } from '../../demo/dados'
import { ExecutorNoBanco } from '../../demo/executorNoBanco'
import { BancoBordo } from '../banco'
import { ErroDeEspaco, Repositorio } from '../repositorio'
import { repositorioDeTeste } from './ajudas'

const V = VIAGEM_DEMO_ID
const TABELAS = ['viagens', 'etapas', 'locais', 'trechos', 'eventos', 'passageiros', 'modelos'] as const
let contador = 0

afterEach(() => {
  vi.useRealTimers()
  usarRelogioReal()
})

/** Roda o cenário da demonstração (até o passo `ate`) num banco próprio e devolve o banco, com a viagem como ficou. */
async function viagemDoCenario(id: string, ate?: number): Promise<BancoBordo> {
  const banco = new BancoBordo(`origem-${(contador += 1)}`)
  const demo = new Repositorio(banco, 'demo')
  const executor = await ExecutorNoBanco.iniciar(demo, cenarioPorId(id))
  const total = ate ?? executor.totalPassos
  for (let i = 0; i < total; i++) await executor.avancarPasso()
  return banco
}

/** Copia as tabelas de um banco para o banco do espaço real (o jeito de ter dados reais sem passar pelo relógio simulado). */
async function repositorioRealCom(origem?: BancoBordo): Promise<{ repo: Repositorio; banco: BancoBordo }> {
  usarRelogioReal()
  const banco = new BancoBordo(`real-${(contador += 1)}`)
  if (origem) for (const t of TABELAS) await banco.table(t).bulkPut(await origem.table(t).toArray())
  return { repo: new Repositorio(banco, 'real'), banco }
}

async function tabelas(banco: BancoBordo) {
  const lido: Record<string, unknown[]> = {}
  for (const t of TABELAS) lido[t] = (await banco.table(t).toArray()).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  return lido
}

async function arquivoDe(repo: Repositorio): Promise<Backup> {
  const r = await validarBackup(serializarBackup(await repo.gerarBackup()))
  if (!r.ok) throw new Error(r.motivo)
  return r.backup
}

describe('backup: gerar e restaurar', () => {
  it('restaurar num celular limpo devolve tudo igual: plano original, sequência dos eventos e passageiros', async () => {
    const origem = await viagemDoCenario('passageiro-faltando')
    const { repo } = await repositorioRealCom(origem)
    const backup = await arquivoDe(repo)

    const { repo: novo, banco: bancoNovo } = await repositorioRealCom()
    const r = await novo.restaurarBackup(backup, { modo: 'substituir_tudo' })
    expect(r).toEqual({ ok: true, viagemIds: [V] })
    expect(await tabelas(bancoNovo)).toEqual(await tabelas(origem))

    const viagem = (await novo.obterViagem(V))!
    expect(viagem.planoOriginal).toEqual((await origem.viagens.get(V))!.planoOriginal)
    expect(viagem.planoOriginal).not.toBeNull()
    const sequencia = (await novo.listarEventos(V)).sort((a, b) => a.sequencia! - b.sequencia!).map((e) => [e.sequencia, e.tipo])
    expect(sequencia).toEqual((await origem.eventos.toArray()).sort((a, b) => a.sequencia! - b.sequencia!).map((e) => [e.sequencia, e.tipo]))
    expect(await novo.listarPassageiros(V)).toHaveLength(38)
  })

  it('as consultas ao Google Maps ficam fora do arquivo e não existem depois de restaurar', async () => {
    const origem = await viagemDoCenario('parada-estourando')
    const { repo, banco } = await repositorioRealCom(origem)
    await banco.consultas.put({ viagemId: V, etapaId: ETAPA.almoco, localId: 'demo-l-rest-b', horario: horaDemo('12:30'), consultadoEm: horaDemo('10:00'), parado: false, base: 1 })
    const conteudo = (await repo.gerarBackup()).conteudo
    expect(Object.keys(conteudo)).not.toContain('consultas')
    expect(JSON.stringify(conteudo)).not.toContain('consultadoEm')

    const { repo: novo, banco: bancoNovo } = await repositorioRealCom()
    await novo.restaurarBackup(await arquivoDe(repo), { modo: 'substituir_tudo' })
    expect(await bancoNovo.consultas.count()).toBe(0)
  })

  it('restaurar por cima apaga as consultas das viagens restauradas', async () => {
    const origem = await viagemDoCenario('parada-estourando')
    const { repo, banco } = await repositorioRealCom(origem)
    const backup = await arquivoDe(repo)
    await banco.consultas.put({ viagemId: V, etapaId: ETAPA.almoco, localId: 'demo-l-rest-b', horario: horaDemo('12:30'), consultadoEm: horaDemo('10:00'), parado: false, base: 1 })
    await repo.restaurarBackup(backup, { modo: 'juntar', viagemIds: [V] })
    expect(await banco.consultas.count()).toBe(0)
  })

  it('só existe no espaço real: a demonstração recusa gerar e restaurar', async () => {
    const origem = await viagemDoCenario('passageiro-faltando')
    const { repo } = await repositorioRealCom(origem)
    const backup = await arquivoDe(repo)
    const demo = repositorioDeTeste('demo')
    await expect(demo.gerarBackup()).rejects.toBeInstanceOf(ErroDeEspaco)
    await expect(demo.restaurarBackup(backup, { modo: 'substituir_tudo' })).rejects.toBeInstanceOf(ErroDeEspaco)
  })
})

describe('backup: juntar e substituir', () => {
  async function celularComOutraViagem() {
    const { repo, banco } = await repositorioRealCom(await viagemDoCenario('parada-para-cafe', 4))
    // Uma segunda viagem, que não está no arquivo.
    await banco.viagens.put({ id: 'v-outra', nome: 'Outra', tipo: 'volta', dataSaida: horaDemo('06:00', 3), status: 'planejando', fatorOnibus: 1.15, planoOriginal: null })
    await banco.etapas.put({ id: 'e-outra', viagemId: 'v-outra', ordem: 1, tipo: 'origem', localId: 'demo-l-saida', alternativas: [], permanenciaMin: 0 })
    return { repo, banco }
  }

  it('juntar: a viagem escolhida é trocada inteira e a outra viagem do celular continua', async () => {
    const arquivo = await arquivoDe((await repositorioRealCom(await viagemDoCenario('passageiro-faltando'))).repo)
    const { repo, banco } = await celularComOutraViagem()
    expect(await banco.eventos.where('viagemId').equals(V).count()).toBeLessThan(arquivo.conteudo.eventos.length)

    expect(await repo.restaurarBackup(arquivo, { modo: 'juntar', viagemIds: [V] })).toEqual({ ok: true, viagemIds: [V] })
    expect((await repo.listarViagens()).map((v) => v.id).sort()).toEqual(['v-outra', V].sort())
    expect((await repo.listarEventos(V)).sort((a, b) => a.sequencia! - b.sequencia!)).toEqual(
      arquivo.conteudo.eventos.sort((a, b) => a.sequencia! - b.sequencia!),
    )
    expect(await repo.listarEtapas('v-outra')).toHaveLength(1)
    expect(await banco.passageiros.where('viagemId').equals(V).count()).toBe(38)
  })

  it('juntar sem escolher viagem, ou com viagem que não está no arquivo, é recusado sem mudar nada', async () => {
    const arquivo = await arquivoDe((await repositorioRealCom(await viagemDoCenario('passageiro-faltando'))).repo)
    const { repo, banco } = await celularComOutraViagem()
    const antes = await tabelas(banco)
    expect((await repo.restaurarBackup(arquivo, { modo: 'juntar', viagemIds: [] })).ok).toBe(false)
    expect((await repo.restaurarBackup(arquivo, { modo: 'juntar', viagemIds: ['fantasma'] })).ok).toBe(false)
    expect(await tabelas(banco)).toEqual(antes)
  })

  it('substituir tudo: o celular vira o arquivo, e a outra viagem some', async () => {
    const origem = await viagemDoCenario('passageiro-faltando')
    const arquivo = await arquivoDe((await repositorioRealCom(origem)).repo)
    const { repo, banco } = await celularComOutraViagem()
    await repo.restaurarBackup(arquivo, { modo: 'substituir_tudo' })
    expect(await tabelas(banco)).toEqual(await tabelas(origem))
  })

  it('modelos: ao juntar, o modelo editado no celular fica e só entra o que faltava; ao substituir, vale o do arquivo', async () => {
    const origem = await viagemDoCenario('passageiro-faltando')
    await origem.modelos.bulkPut([
      { id: 'atualizacao', texto: 'do arquivo {agora}', atualizadoEm: horaDemo('07:00') },
      { id: 'restaurante', texto: 'restaurante do arquivo {grupo}', atualizadoEm: horaDemo('07:00') },
    ])
    const arquivo = await arquivoDe((await repositorioRealCom(origem)).repo)

    const { repo } = await celularComOutraViagem()
    await repo.salvarModelo('atualizacao', 'do celular {agora}')
    await repo.restaurarBackup(arquivo, { modo: 'juntar', viagemIds: [V] })
    expect(await repo.obterModelos()).toEqual({ atualizacao: 'do celular {agora}', restaurante: 'restaurante do arquivo {grupo}' })

    await repo.restaurarBackup(arquivo, { modo: 'substituir_tudo' })
    expect(await repo.obterModelos()).toEqual({ atualizacao: 'do arquivo {agora}', restaurante: 'restaurante do arquivo {grupo}' })
  })

  it('tudo ou nada: se a gravação falha no meio, o celular continua como estava', async () => {
    const arquivo = await arquivoDe((await repositorioRealCom(await viagemDoCenario('passageiro-faltando'))).repo)
    const { repo, banco } = await celularComOutraViagem()
    const antes = await tabelas(banco)
    vi.spyOn(banco.passageiros, 'bulkPut').mockRejectedValueOnce(new Error('disco cheio'))
    await expect(repo.restaurarBackup(arquivo, { modo: 'substituir_tudo' })).rejects.toThrow('disco cheio')
    expect(await tabelas(banco)).toEqual(antes)
    expect(await repo.obterRestauradoDe()).toBeNull()
  })
})

describe('backup: marcas do aparelho (tabela meta)', () => {
  it('registra o backup entregue e conta os registros feitos depois', async () => {
    const { repo } = await repositorioRealCom(await viagemDoCenario('passageiro-faltando'))
    expect(await repo.obterUltimoBackup()).toBeNull()
    const backup = await repo.gerarBackup()
    await repo.silenciarSugestaoDeBackup(horaDemo('12:00'))
    await repo.registrarBackupEntregue(backup)
    expect(await repo.obterUltimoBackup()).toEqual({ geradoEm: backup.geradoEm, totalEventos: backup.conteudo.eventos.length })
    expect(await repo.contarEventos()).toBe(backup.conteudo.eventos.length)
    expect(await repo.obterSilencioDoBackup()).toBeNull()
  })

  it('meta fica fora do backup', async () => {
    const { repo } = await repositorioRealCom(await viagemDoCenario('passageiro-faltando'))
    await repo.registrarBackupEntregue(await repo.gerarBackup())
    expect(Object.keys((await repo.gerarBackup()).conteudo).sort()).toEqual(['etapas', 'eventos', 'locais', 'modelos', 'passageiros', 'trechos', 'viagens'])
  })

  it('restaurar guarda de qual backup veio e vale como último backup; o aviso pode ser dispensado', async () => {
    const arquivo = await arquivoDe((await repositorioRealCom(await viagemDoCenario('passageiro-faltando'))).repo)
    const { repo } = await repositorioRealCom()
    await repo.restaurarBackup(arquivo, { modo: 'substituir_tudo' })
    expect(await repo.obterRestauradoDe()).toMatchObject({ geradoEm: arquivo.geradoEm, viagemIds: [V], dispensado: false })
    expect(await repo.obterUltimoBackup()).toEqual({ geradoEm: arquivo.geradoEm, totalEventos: arquivo.conteudo.eventos.length })
    await repo.dispensarAvisoDeRestauracao()
    expect((await repo.obterRestauradoDe())?.dispensado).toBe(true)
  })

  it('ao juntar deixando de fora uma viagem com registros que o arquivo não tem, o último backup não muda', async () => {
    const arquivo = await arquivoDe((await repositorioRealCom(await viagemDoCenario('passageiro-faltando'))).repo)
    const { repo, banco } = await repositorioRealCom(await viagemDoCenario('parada-para-cafe', 4))
    await banco.viagens.put({ id: 'v-outra', nome: 'Outra', tipo: 'volta', dataSaida: horaDemo('06:00', 3), status: 'em_andamento', fatorOnibus: 1.15, planoOriginal: null })
    await banco.etapas.put({ id: 'e-outra', viagemId: 'v-outra', ordem: 1, tipo: 'origem', localId: 'demo-l-saida', alternativas: [], permanenciaMin: 0 })
    await banco.eventos.put({ id: 'x', viagemId: 'v-outra', tipo: 'inicio', horarioFato: horaDemo('06:00', 3), registradoEm: horaDemo('06:00', 3), sequencia: 1 })
    await repo.restaurarBackup(arquivo, { modo: 'juntar', viagemIds: [V] })
    expect(await repo.obterRestauradoDe()).not.toBeNull()
    expect(await repo.obterUltimoBackup()).toBeNull()
  })
})

describe('continuar a viagem depois de restaurar', () => {
  /** Backup feito em `horaDoBackup` (passos do cenário já rodados); o celular novo está no relógio real em `agoraReal`. */
  async function restauradoEm(cenario: string, passos: number, agoraReal: string) {
    const arquivo = await arquivoDe((await repositorioRealCom(await viagemDoCenario(cenario, passos))).repo)
    const { repo, banco } = await repositorioRealCom()
    await repo.restaurarBackup(arquivo, { modo: 'substituir_tudo' })
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(agoraReal))
    return { repo, banco, arquivo }
  }

  it('parada não planejada aberta no backup: continua aberta, VOLTAMOS e CHEGAMOS aceitam o horário em que aconteceu', async () => {
    // Backup às 10:00 com a parada para café aberta (passos até o PARAMOS, 8); celular novo às 11:30.
    const { repo, arquivo } = await restauradoEm('parada-para-cafe', 8, '2026-11-14T11:30:00-03:00')
    const plano = (await repo.carregarPlano(V))!
    const original = plano.viagem.planoOriginal!
    const eventos = await repo.listarEventos(V)
    expect(paradaAberta(eventos, ETAPA.almoco)).toMatchObject({ inicio: horaDemo('10:00'), motivo: 'cafe', onde: 'Padaria Exemplo', tempoPrevistoMin: 20 })
    expect(situacaoDaViagem(plano, original, eventos, '2026-11-14T11:30:00-03:00' as never).situacao).toBe('parada_nao_planejada')

    // CHEGAMOS sem informar a volta é recusado; com a hora real da volta (10:25) grava VOLTAMOS e depois a chegada.
    expect((await repo.registrarChegada(V, ETAPA.almoco)).ok).toBe(false)
    const r = await repo.registrarChegada(V, ETAPA.almoco, { retornoEm: horaDemo('10:25'), horarioFato: horaDemo('11:20') })
    expect(r.ok).toBe(true)
    const depois = await repo.listarEventos(V)
    expect(paradaAberta(depois)).toBeNull()
    const fim = depois.find((e) => e.tipo === 'parada_nao_planejada' && e.dados.fase === 'fim')!
    expect(fim.horarioFato).toBe(horaDemo('10:25'))
    expect(fim.sequencia).toBe(Math.max(...arquivo.conteudo.eventos.map((e) => e.sequencia ?? 0)) + 1)
    // O plano original continua o do arquivo.
    expect((await repo.obterViagem(V))!.planoOriginal).toEqual(original)
    // O que veio da restauração mais o que foi completado vira um estado calculável (duração real da parada: 25 min).
    const estado = calcularEstado(plano, original, depois, '2026-11-14T11:30:00-03:00' as never)
    expect(estado.etapas.find((e) => e.etapaId === ETAPA.almoco)?.chegada?.origem).toBe('real')
  })

  it('VOLTAMOS com o horário real também fecha a parada sem chegar (registro retroativo)', async () => {
    const { repo } = await restauradoEm('parada-para-cafe', 8, '2026-11-14T10:40:00-03:00')
    const r = await repo.registrarEvento(V, { tipo: 'parada_nao_planejada', etapaId: ETAPA.almoco, dados: { fase: 'fim' } }, { horarioFato: horaDemo('10:25') })
    expect(r.ok).toBe(true)
    expect(paradaAberta(await repo.listarEventos(V))).toBeNull()
  })

  it('o que aconteceu depois do backup entra pelos botões de sempre, com o horário corrigido na timeline', async () => {
    // Backup às 09:14, na saída de Monlevade (passos até o SAÍMOS); celular novo às 13:40, com o almoço já feito.
    const { repo } = await restauradoEm('parada-para-cafe', 6, '2026-11-14T13:40:00-03:00')
    const chegada = await repo.registrarEvento(V, { tipo: 'chegada', etapaId: ETAPA.almoco })
    expect(chegada.ok).toBe(true)
    if (!chegada.ok) return
    expect((await repo.corrigirHorarioDoEvento(V, chegada.eventos[0]!.id, horaDemo('12:20'))).ok).toBe(true)
    const saida = await repo.registrarEvento(V, { tipo: 'saida', etapaId: ETAPA.almoco })
    expect(saida.ok).toBe(true)
    if (!saida.ok) return
    expect((await repo.corrigirHorarioDoEvento(V, saida.eventos[0]!.id, horaDemo('13:20'))).ok).toBe(true)
    // Nada pendente: os registros ficaram em ordem.
    const plano = (await repo.carregarPlano(V))!
    expect(pendenciasDeRegistro(plano, await repo.listarEventos(V))).toEqual([])
  })

  it('registro esquecido: com um evento fora de ordem no arquivo, a pendência aparece e aceita o horário digitado', async () => {
    // Banco montado com a chegada em Monlevade sem a saída da origem (como no teste de pendência da fase 4).
    const origem = await viagemDoCenario('saida-atrasada', 2)
    const eventosOrigem = await origem.eventos.toArray()
    const saidaOrigem = eventosOrigem.find((e) => e.tipo === 'saida')!
    await origem.eventos.delete(saidaOrigem.id)
    await origem.eventos.put({ id: 'chegada-monlevade', viagemId: V, tipo: 'chegada', etapaId: ETAPA.monlevade, horarioFato: horaDemo('08:55'), registradoEm: horaDemo('08:55'), sequencia: 3 })
    const arquivo = await arquivoDe((await repositorioRealCom(origem)).repo)

    const { repo } = await repositorioRealCom()
    await repo.restaurarBackup(arquivo, { modo: 'substituir_tudo' })
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-14T12:00:00-03:00'))
    const plano = (await repo.carregarPlano(V))!
    expect(pendenciasDeRegistro(plano, await repo.listarEventos(V))).toEqual([{ etapaId: ETAPA.origem, momento: 'saida' }])
    expect((await repo.registrarPendencia(V, ETAPA.origem, 'saida', horaDemo('06:47'))).ok).toBe(true)
    expect(pendenciasDeRegistro(plano, await repo.listarEventos(V))).toEqual([])
  })
})

describe('banco: esquema v5 só adiciona a tabela meta', () => {
  it('preserva tudo (inclusive os modelos) e cria a tabela vazia', async () => {
    const nome = 'teste-migracao-v4'
    const antigo = new Dexie(nome)
    antigo.version(1).stores({
      viagens: 'id, status',
      etapas: 'id, viagemId, [viagemId+ordem]',
      locais: 'id, cidade',
      trechos: '[etapaOrigemId+localOrigemId+etapaDestinoId+localDestinoId], etapaOrigemId, etapaDestinoId',
      eventos: 'id, viagemId, [viagemId+horarioFato]',
    })
    antigo.version(2).stores({ passageiros: 'id, viagemId' })
    antigo.version(3).stores({ consultas: '[viagemId+etapaId+localId], viagemId' })
    antigo.version(4).stores({ modelos: 'id' })
    await antigo.table('viagens').put(PLANO_DEMO.viagem)
    await antigo.table('etapas').bulkPut(PLANO_DEMO.etapas)
    await antigo.table('modelos').put({ id: 'atualizacao', texto: 'meu {agora}', atualizadoEm: horaDemo('07:00') })
    antigo.close()

    const novo = new BancoBordo(nome)
    await novo.open()
    expect(novo.verno).toBe(5)
    expect(await novo.viagens.count()).toBe(1)
    expect(await novo.etapas.count()).toBe(PLANO_DEMO.etapas.length)
    expect((await novo.modelos.get('atualizacao'))?.texto).toBe('meu {agora}')
    expect(await novo.meta.count()).toBe(0)
    novo.close()
  })
})
