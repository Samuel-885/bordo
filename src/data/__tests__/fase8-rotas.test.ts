import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { definirSimulado, usarRelogioReal } from '../../core/relogio'
import { duracaoTrecho } from '../../core/trechos'
import { ETAPA, horaDemo, LOCAL } from '../../demo/dados'
import type { Repositorio } from '../repositorio'
import { semearDemonstracao } from '../semente-demo'
import { repositorioDeTeste } from './ajudas'

const V = 'demo-viagem'
let repo: Repositorio

const parMonlevadeAteB = { etapaOrigemId: ETAPA.monlevade, localOrigemId: LOCAL.monlevade, etapaDestinoId: ETAPA.almoco, localDestinoId: LOCAL.restB }
const parOrigemAteMonlevade = { etapaOrigemId: ETAPA.origem, localOrigemId: LOCAL.saida, etapaDestinoId: ETAPA.monlevade, localDestinoId: LOCAL.monlevade }
const rota = { minutosCarro: 93, distanciaKm: 96.7 }
const achar = async (par: typeof parMonlevadeAteB) =>
  (await repo.listarTrechos(V)).find((t) => t.etapaOrigemId === par.etapaOrigemId && t.localOrigemId === par.localOrigemId && t.etapaDestinoId === par.etapaDestinoId && t.localDestinoId === par.localDestinoId)

beforeEach(async () => {
  repo = repositorioDeTeste('demo')
  definirSimulado(horaDemo('06:00'))
  await semearDemonstracao(repo)
  await repo.removerTrecho(V, parMonlevadeAteB)
})
afterEach(() => usarRelogioReal())

describe('fase 8: rota guardada pelo repositório', () => {
  it('guarda tempo de carro, distância e a data do cálculo (agora())', async () => {
    await repo.salvarRotaDoTrecho(V, parMonlevadeAteB, rota)
    expect(await achar(parMonlevadeAteB)).toEqual({ ...parMonlevadeAteB, duracaoMin: 93, fonte: 'rota', distanciaKm: 96.7, calculadoEm: horaDemo('06:00') })
  })

  it('calcular de novo refaz o trecho de rota, com a data nova', async () => {
    await repo.salvarRotaDoTrecho(V, parMonlevadeAteB, rota)
    definirSimulado(horaDemo('07:30'))
    await repo.salvarRotaDoTrecho(V, parMonlevadeAteB, { minutosCarro: 100, distanciaKm: 99.1 })
    expect(await achar(parMonlevadeAteB)).toMatchObject({ duracaoMin: 100, fonte: 'rota', distanciaKm: 99.1, calculadoEm: horaDemo('07:30') })
  })

  it('o cálculo usa a rota × fator ônibus (para cima)', async () => {
    await repo.salvarRotaDoTrecho(V, parMonlevadeAteB, rota)
    await repo.salvarFatorOnibus(V, 1.2)
    const plano = (await repo.carregarPlano(V))!
    const almoco = plano.etapas.find((e) => e.id === ETAPA.almoco)!
    const monlevade = plano.etapas.find((e) => e.id === ETAPA.monlevade)!
    expect(duracaoTrecho(plano, monlevade, LOCAL.monlevade, almoco, LOCAL.restB)).toEqual({ minutos: 112, fonte: 'rota' }) // 93 × 1,2 = 111,6
  })

  it('tempo manual nunca é sobrescrito: a rota fica ao lado', async () => {
    await repo.salvarTrechoManual(V, parMonlevadeAteB, 200)
    await repo.salvarRotaDoTrecho(V, parMonlevadeAteB, rota)
    expect(await achar(parMonlevadeAteB)).toEqual({
      ...parMonlevadeAteB,
      duracaoMin: 200,
      fonte: 'manual',
      rota: { duracaoMin: 93, distanciaKm: 96.7, calculadoEm: horaDemo('06:00') },
    })
  })

  it('digitar um tempo sobre um trecho de rota guarda a rota ao lado; editar o manual não a perde', async () => {
    await repo.salvarRotaDoTrecho(V, parMonlevadeAteB, rota)
    await repo.salvarTrechoManual(V, parMonlevadeAteB, 150)
    expect(await achar(parMonlevadeAteB)).toMatchObject({ duracaoMin: 150, fonte: 'manual', rota: { duracaoMin: 93 } })
    await repo.salvarTrechoManual(V, parMonlevadeAteB, 160)
    expect(await achar(parMonlevadeAteB)).toMatchObject({ duracaoMin: 160, fonte: 'manual', rota: { duracaoMin: 93 } })
  })

  it('"Usar a rota" troca o manual pela rota; "Manter o meu" descarta só a rota', async () => {
    await repo.salvarTrechoManual(V, parMonlevadeAteB, 200)
    await repo.salvarRotaDoTrecho(V, parMonlevadeAteB, rota)
    await repo.manterTempoManual(V, parMonlevadeAteB)
    expect(await achar(parMonlevadeAteB)).toEqual({ ...parMonlevadeAteB, duracaoMin: 200, fonte: 'manual' })

    await repo.salvarRotaDoTrecho(V, parMonlevadeAteB, rota)
    await repo.usarRotaNoLugarDoManual(V, parMonlevadeAteB)
    expect(await achar(parMonlevadeAteB)).toMatchObject({ duracaoMin: 93, fonte: 'rota', distanciaKm: 96.7 })
    await expect(repo.usarRotaNoLugarDoManual(V, parMonlevadeAteB)).rejects.toThrow(/rota calculada/)
  })

  it('rota de trecho com roteiro é guardada (só para exibir) e o cálculo segue o roteiro', async () => {
    await repo.salvarRotaDoTrecho(V, parOrigemAteMonlevade, { minutosCarro: 100, distanciaKm: 90 })
    const plano = (await repo.carregarPlano(V))!
    const a = plano.etapas.find((e) => e.id === ETAPA.origem)!
    const b = plano.etapas.find((e) => e.id === ETAPA.monlevade)!
    expect(duracaoTrecho(plano, a, LOCAL.saida, b, LOCAL.monlevade).fonte).toBe('roteiro')
  })

  it('recusa rota inválida e par que não existe no roteiro', async () => {
    await expect(repo.salvarRotaDoTrecho(V, parMonlevadeAteB, { minutosCarro: 0, distanciaKm: 1 })).rejects.toThrow(/não é válida/)
    await expect(repo.salvarRotaDoTrecho(V, parMonlevadeAteB, { minutosCarro: 1.5, distanciaKm: 1 })).rejects.toThrow(/não é válida/)
    await expect(repo.salvarRotaDoTrecho(V, { ...parMonlevadeAteB, localDestinoId: 'nao-existe' }, rota)).rejects.toThrow(/não existe mais/)
    await expect(repo.salvarRotaDoTrecho(V, { ...parMonlevadeAteB, etapaDestinoId: ETAPA.cafe }, rota)).rejects.toThrow(/não existe mais/)
  })

  it('só no planejamento: depois de iniciada a viagem, rota e fator são recusados', async () => {
    const r = await repo.iniciarViagem(V)
    expect(r.ok).toBe(true)
    await expect(repo.salvarRotaDoTrecho(V, parMonlevadeAteB, rota)).rejects.toThrow(/já foi iniciada/)
    await expect(repo.salvarFatorOnibus(V, 1.3)).rejects.toThrow(/já foi iniciada/)
    await expect(repo.manterTempoManual(V, parMonlevadeAteB)).rejects.toThrow(/já foi iniciada/)
  })

  it('trecho de rota que deixa de valer (alternativa removida) é apagado como os outros', async () => {
    await repo.salvarRotaDoTrecho(V, parMonlevadeAteB, rota)
    const plano = (await repo.carregarPlano(V))!
    const almoco = plano.etapas.find((e) => e.id === ETAPA.almoco)!
    await repo.salvarEtapa({ ...almoco, alternativas: almoco.alternativas.filter((id) => id !== LOCAL.restB) })
    expect(await achar(parMonlevadeAteB)).toBeUndefined()
  })
})

describe('fase 8: fator ônibus', () => {
  it('grava o fator entre 1,00 e 2,00, com duas casas', async () => {
    await repo.salvarFatorOnibus(V, 1.234)
    expect((await repo.obterViagem(V))?.fatorOnibus).toBe(1.23)
    await repo.salvarFatorOnibus(V, 1)
    await repo.salvarFatorOnibus(V, 2)
    expect((await repo.obterViagem(V))?.fatorOnibus).toBe(2)
  })

  it('recusa fora dos limites e não mexe no valor', async () => {
    await repo.salvarFatorOnibus(V, 1.3)
    await expect(repo.salvarFatorOnibus(V, 0.99)).rejects.toThrow(/entre 1,00 e 2,00/)
    await expect(repo.salvarFatorOnibus(V, 2.01)).rejects.toThrow(/entre 1,00 e 2,00/)
    await expect(repo.salvarFatorOnibus(V, NaN)).rejects.toThrow()
    expect((await repo.obterViagem(V))?.fatorOnibus).toBe(1.3)
  })
})
