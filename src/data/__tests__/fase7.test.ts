import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MODELO_PADRAO } from '../../core/modelos'
import { pendenciasDeRegistro } from '../../core/previsao'
import { definirSimulado, usarRelogioReal } from '../../core/relogio'
import { mesmoInstante } from '../../core/tempo'
import type { Evento } from '../../core/tipos'
import { ETAPA, horaDemo, PLANO_DEMO } from '../../demo/dados'
import { BancoBordo } from '../banco'
import { equipeValida, type Repositorio } from '../repositorio'
import { semearDemonstracao } from '../semente-demo'
import { repositorioDeTeste } from './ajudas'

const V = 'demo-viagem'
let repo: Repositorio
const relogio = (hora: string) => definirSimulado(horaDemo(hora))

async function registrar(conteudo: Parameters<Repositorio['registrarEvento']>[1], opcoes?: Parameters<Repositorio['registrarEvento']>[2]) {
  const r = await repo.registrarEvento(V, conteudo, opcoes)
  if (!r.ok) throw new Error(r.motivo)
  return r
}
const eventos = async (): Promise<Evento[]> => (await repo.listarEventos(V)).sort((a, b) => (a.sequencia ?? 0) - (b.sequencia ?? 0))

beforeEach(async () => {
  repo = repositorioDeTeste('demo')
  await semearDemonstracao(repo)
  relogio('06:00')
  const r = await repo.iniciarViagem(V)
  if (!r.ok) throw new Error('não iniciou')
})
afterEach(() => usarRelogioReal())

describe('modelos de mensagem guardados', () => {
  it('sem linha gravada, nada salvo (vale o padrão do código)', async () => {
    expect(await repo.obterModelos()).toEqual({ atualizacao: null, restaurante: null })
  })

  it('salva, lê e volta ao padrão apagando a linha', async () => {
    expect(await repo.salvarModelo('restaurante', 'Grupo de {grupo} às {chegada}')).toEqual({ ok: true })
    expect((await repo.obterModelos()).restaurante).toBe('Grupo de {grupo} às {chegada}')
    expect((await repo.obterModelos()).atualizacao).toBeNull()
    await repo.restaurarModelo('restaurante')
    expect(await repo.obterModelos()).toEqual({ atualizacao: null, restaurante: null })
  })

  it('recusa modelo com variável desconhecida ou vazio e não grava nada', async () => {
    const a = await repo.salvarModelo('atualizacao', 'Oi {xyz}')
    expect(a).toEqual({ ok: false, motivo: 'Variável desconhecida: {xyz}.' })
    expect((await repo.salvarModelo('atualizacao', '  ')).ok).toBe(false)
    expect((await repo.salvarModelo('atualizacao', 'Grupo {grupo}')).ok).toBe(false)
    expect(await repo.obterModelos()).toEqual({ atualizacao: null, restaurante: null })
  })

  it('cada espaço tem os seus modelos', async () => {
    await repo.salvarModelo('atualizacao', 'Só demonstração {agora}')
    const real = repositorioDeTeste('real')
    expect(await real.obterModelos()).toEqual({ atualizacao: null, restaurante: null })
    await real.salvarModelo('atualizacao', 'Só real {agora}')
    expect((await real.obterModelos()).atualizacao).toBe('Só real {agora}')
  })

  it('reiniciar a demonstração (limparTudo) não apaga os modelos, que são configuração do app', async () => {
    await repo.salvarModelo('restaurante', 'Oi, {grupo} pessoas')
    await repo.limparTudo()
    expect((await repo.obterModelos()).restaurante).toBe('Oi, {grupo} pessoas')
  })

  it('o padrão do código só tem variáveis válidas (salvar o padrão é aceito)', async () => {
    expect((await repo.salvarModelo('atualizacao', MODELO_PADRAO.atualizacao)).ok).toBe(true)
    expect((await repo.salvarModelo('restaurante', MODELO_PADRAO.restaurante)).ok).toBe(true)
  })
})

describe('banco: esquema v4 só adiciona a tabela de modelos', () => {
  it('preserva tudo e cria a tabela vazia', async () => {
    const nome = 'teste-migracao-v3'
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
    await antigo.table('viagens').put(PLANO_DEMO.viagem)
    await antigo.table('etapas').bulkPut(PLANO_DEMO.etapas)
    antigo.close()

    const novo = new BancoBordo(nome)
    await novo.open()
    expect(novo.verno).toBe(4)
    expect(await novo.viagens.count()).toBe(1)
    expect((await novo.viagens.get(PLANO_DEMO.viagem.id))?.nome).toBe(PLANO_DEMO.viagem.nome)
    expect(await novo.etapas.count()).toBe(PLANO_DEMO.etapas.length)
    expect(await novo.modelos.count()).toBe(0)
    novo.close()
  })
})

describe('identificação e equipe da viagem', () => {
  it('equipeValida: inteiro de 0 a 99, o resto vale 0', () => {
    expect([undefined, 0, -3, 2.5, Number.NaN, 4, 99, 150].map(equipeValida)).toEqual([0, 0, 0, 0, 0, 4, 99, 99])
  })

  it('planejando: grava, apara e remove quando vazio', async () => {
    const nova = repositorioDeTeste('demo')
    await semearDemonstracao(nova)
    const v = (await nova.obterViagem(V))!
    await nova.salvarViagem({ ...v, identificacao: '  Unidade X — Ipatinga  ', equipe: 3 })
    expect(await nova.obterViagem(V)).toMatchObject({ identificacao: 'Unidade X — Ipatinga', equipe: 3, status: 'planejando' })
    await nova.salvarViagem({ ...v, identificacao: '  ', equipe: 0 })
    const vazia = (await nova.obterViagem(V))!
    expect('identificacao' in vazia).toBe(false)
    expect('equipe' in vazia).toBe(false)
  })

  it('em andamento: nome, identificação e equipe mudam; status e plano original não', async () => {
    const antes = (await repo.obterViagem(V))!
    await repo.salvarViagem({ ...antes, nome: 'Outro nome', identificacao: 'Unidade Y', equipe: 2, tipo: 'volta', fatorOnibus: 2, status: 'planejando', planoOriginal: null })
    const depois = (await repo.obterViagem(V))!
    expect(depois).toMatchObject({ nome: 'Outro nome', identificacao: 'Unidade Y', equipe: 2, status: 'em_andamento', tipo: antes.tipo, fatorOnibus: antes.fatorOnibus })
    expect(depois.planoOriginal).toEqual(antes.planoOriginal)
  })

  it('concluída: a equipe não muda, a identificação e o nome sim', async () => {
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
    await registrar({ tipo: 'chegada', etapaId: ETAPA.destino })
    const v = (await repo.obterViagem(V))!
    expect(v.status).toBe('concluida')
    await repo.salvarViagem({ ...v, equipe: 5, identificacao: 'Nova', nome: 'Final' })
    const depois = (await repo.obterViagem(V))!
    expect(depois).toMatchObject({ identificacao: 'Nova', nome: 'Final', status: 'concluida' })
    expect(depois.equipe).toBeUndefined()
  })
})

describe('atualização gerada', () => {
  it('grava só o horário e a previsão informada, no horário atual', async () => {
    relogio('06:50')
    const r = await registrar({ tipo: 'atualizacao_gerada', dados: { previsaoDestino: horaDemo('23:47'), atrasoMin: 17 } })
    const e = r.eventos[0]!
    expect(e).toMatchObject({ tipo: 'atualizacao_gerada', dados: { atrasoMin: 17 } })
    expect(mesmoInstante(e.horarioFato, horaDemo('06:50'))).toBe(true)
    expect(Object.keys(e)).not.toContain('texto')
    expect(JSON.stringify(e)).not.toMatch(/Situação|Atualização da viagem/)
  })

  it('o DESFAZER ignora a atualização: o registro anterior continua desfazível', async () => {
    relogio('06:47')
    const saida = await registrar({ tipo: 'saida', etapaId: ETAPA.origem })
    relogio('06:48')
    const gerada = await registrar({ tipo: 'atualizacao_gerada', dados: { previsaoDestino: null, atrasoMin: null } })
    // A atualização gerada em si não é desfeita pelo desfazer.
    expect((await repo.desfazerRegistro(V, gerada.eventos.map((e) => e.id))).ok).toBe(false)
    expect((await eventos()).some((e) => e.tipo === 'atualizacao_gerada')).toBe(true)
    // Mas não impede desfazer a saída feita antes dela.
    expect(await repo.desfazerRegistro(V, saida.eventos.map((e) => e.id))).toEqual({ ok: true })
    expect((await eventos()).map((e) => e.tipo)).toEqual(['inicio', 'atualizacao_gerada'])
  })

  it('não altera a previsão, o plano original nem as pendências', async () => {
    const original = (await repo.obterViagem(V))!.planoOriginal
    relogio('06:47')
    await registrar({ tipo: 'saida', etapaId: ETAPA.origem })
    await registrar({ tipo: 'atualizacao_gerada', dados: { previsaoDestino: null, atrasoMin: null } })
    expect((await repo.obterViagem(V))!.planoOriginal).toEqual(original)
    const plano = (await repo.carregarPlano(V))!
    expect(pendenciasDeRegistro(plano, await repo.listarEventos(V))).toEqual([])
  })
})

describe('observação', () => {
  it('grava o texto, com horário anterior a agora, e recusa o futuro e o texto vazio', async () => {
    relogio('09:00')
    const r = await registrar({ tipo: 'observacao', dados: { texto: 'Chuva forte na serra' } }, { horarioFato: horaDemo('08:50') })
    expect(r.eventos[0]).toMatchObject({ tipo: 'observacao', dados: { texto: 'Chuva forte na serra' } })
    expect(mesmoInstante(r.eventos[0]!.horarioFato, horaDemo('08:50'))).toBe(true)
    expect((await repo.registrarEvento(V, { tipo: 'observacao', dados: { texto: 'x' } }, { horarioFato: horaDemo('09:01') })).ok).toBe(false)
    expect((await repo.registrarEvento(V, { tipo: 'observacao', dados: { texto: '  ' } })).ok).toBe(false)
  })

  it('DESFAZER funciona como nos outros registros, e recusa se houve outro depois', async () => {
    relogio('09:00')
    const a = await registrar({ tipo: 'observacao', dados: { texto: 'A' } })
    expect(await repo.desfazerRegistro(V, a.eventos.map((e) => e.id))).toEqual({ ok: true })
    expect((await eventos()).some((e) => e.tipo === 'observacao')).toBe(false)

    const b = await registrar({ tipo: 'observacao', dados: { texto: 'B' } })
    await registrar({ tipo: 'observacao', dados: { texto: 'C' } })
    expect((await repo.desfazerRegistro(V, b.eventos.map((e) => e.id))).ok).toBe(false)
  })

  it('corrige o texto e o horário pela timeline, sem mexer no resto do evento', async () => {
    relogio('09:00')
    const r = await registrar({ tipo: 'observacao', dados: { texto: 'Texto antigo' } })
    const antes = r.eventos[0]!
    relogio('09:30')
    expect(await repo.corrigirObservacao(V, antes.id, '  Texto novo  ', horaDemo('08:45'))).toEqual({ ok: true })
    const depois = (await repo.listarEventos(V)).find((e) => e.id === antes.id)!
    expect(depois).toMatchObject({ tipo: 'observacao', dados: { texto: 'Texto novo' }, sequencia: antes.sequencia, registradoEm: antes.registradoEm })
    expect(mesmoInstante(depois.horarioFato, horaDemo('08:45'))).toBe(true)
  })

  it('a correção recusa horário no futuro, texto vazio e evento que não é observação', async () => {
    relogio('09:00')
    const r = await registrar({ tipo: 'observacao', dados: { texto: 'Texto' } })
    const id = r.eventos[0]!.id
    expect((await repo.corrigirObservacao(V, id, 'Texto', horaDemo('09:01'))).ok).toBe(false)
    expect((await repo.corrigirObservacao(V, id, ' ', horaDemo('08:00'))).ok).toBe(false)
    const inicio = (await eventos())[0]!
    expect((await repo.corrigirObservacao(V, inicio.id, 'x', horaDemo('08:00'))).ok).toBe(false)
    expect((await repo.listarEventos(V)).find((e) => e.id === id)).toMatchObject({ dados: { texto: 'Texto' } })
  })
})
