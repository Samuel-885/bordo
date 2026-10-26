// Previsão com trânsito: a função e o TomTom são simulados (nenhum teste chama o TomTom de verdade).
// Sucesso, sem chave, cota esgotada, fora, tempo esgotado e reserva no OSRM.

import { describe, expect, it, vi } from 'vitest'
import { CONFIG } from '../../core/config'
import { rotaDaPosicaoAtual, rotaDaPosicaoPrecisa, type Geolocalizacao } from '../localizacao'
import type { Buscador } from '../rede'
import { calcularRotaComTransito, calcularRotasDaPosicao } from '../transito'

const resposta = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status })
const osrmOk = (duration: number, distance: number) => ({ code: 'Ok', routes: [{ duration, distance }] })
const funcaoOk = (tempoSegundos: number, distanciaM: number) => ({ tempoSegundos, semTransitoSegundos: tempoSegundos - 120, distanciaM })
const DE = { lat: -19.4687, lng: -42.5367 }
const ATE = { lat: -19.8097, lng: -43.1733 }
const gpsOk = (accuracy = 25): Geolocalizacao => ({ getCurrentPosition: (ok) => ok({ coords: { latitude: DE.lat, longitude: DE.lng, accuracy } }) })

/** Simula a função (POST em transitoUrl) e o OSRM (GET); cada um com a sua resposta. */
function servidor(funcao: () => Response | Promise<Response>, osrm: () => Response | Promise<Response> = () => resposta(osrmOk(17 * 60, 20_500))) {
  return vi.fn<Buscador>(async (url) => (url.startsWith(CONFIG.transitoUrl) ? funcao() : osrm()))
}
const chamadasA = (b: ReturnType<typeof servidor>, parte: string) => b.mock.calls.filter(([u]) => u.includes(parte))

describe('calcularRotaComTransito (função)', () => {
  it('sucesso: POST com só as coordenadas, sem cookies, tempo arredondado para cima', async () => {
    const buscador = servidor(() => resposta(funcaoOk(1201, 20_540)))
    const r = await calcularRotaComTransito(DE, ATE, { buscador })
    expect(r).toEqual({ ok: true, rota: { servico: 'tomtom', minutosCarro: 21, distanciaKm: 20.5 } })
    const [url, init] = buscador.mock.calls[0]!
    expect(url).toBe(CONFIG.transitoUrl)
    expect(init).toMatchObject({ method: 'POST', credentials: 'omit' })
    expect(JSON.parse(String(init!.body))).toEqual({ origem: DE, destino: ATE })
  })

  it.each([
    [500, 'sem_chave', 'sem_chave'],
    [429, 'cota_ou_chave', 'cota'],
    [502, 'fora', 'fora'],
    [504, 'tempo_esgotado', 'tempo_esgotado'],
    [422, 'sem_rota', 'sem_rota'],
  ] as const)('função com erro %s (%s) vira o motivo %s', async (status, erro, motivo) => {
    const r = await calcularRotaComTransito(DE, ATE, { buscador: servidor(() => resposta({ erro }, status)) })
    expect(r).toEqual({ ok: false, motivo })
  })

  it('função ausente (404), sem internet, resposta vazia ou inválida', async () => {
    expect(await calcularRotaComTransito(DE, ATE, { buscador: servidor(() => new Response('<html>', { status: 404 })) })).toEqual({ ok: false, motivo: 'fora' })
    expect(await calcularRotaComTransito(DE, ATE, { buscador: async () => { throw new TypeError('Failed to fetch') } })).toEqual({ ok: false, motivo: 'sem_internet' })
    expect(await calcularRotaComTransito(DE, ATE, { buscador: servidor(() => resposta({})) })).toEqual({ ok: false, motivo: 'fora' })
  })

  it('tempo esgotado do app', async () => {
    const buscador: Buscador = (_u, init) => new Promise((_ok, falha) => init?.signal?.addEventListener('abort', () => falha(new DOMException('abortado', 'AbortError'))))
    expect(await calcularRotaComTransito(DE, ATE, { buscador, tempoLimiteMs: 5 })).toEqual({ ok: false, motivo: 'tempo_esgotado' })
  })
})

describe('calcularRotasDaPosicao', () => {
  it('desligado: só o OSRM, a função nem é chamada', async () => {
    const b = servidor(() => resposta(funcaoOk(1500, 20_500)))
    const r = await calcularRotasDaPosicao(DE, ATE, { buscador: b, usarTransito: false, modo: 'ambos' })
    expect(r).toEqual({ ok: true, rotas: [{ servico: 'osrm', minutosCarro: 17, distanciaKm: 20.5 }], semTransito: 'desligado' })
    expect(chamadasA(b, CONFIG.transitoUrl)).toHaveLength(0)
  })

  it('ambos: os dois respondem, TomTom primeiro', async () => {
    const b = servidor(() => resposta(funcaoOk(22 * 60, 20_500)))
    const r = await calcularRotasDaPosicao(DE, ATE, { buscador: b, usarTransito: true, modo: 'ambos' })
    expect(r).toEqual({
      ok: true,
      rotas: [{ servico: 'tomtom', minutosCarro: 22, distanciaKm: 20.5 }, { servico: 'osrm', minutosCarro: 17, distanciaKm: 20.5 }],
      semTransito: null,
    })
  })

  it('ambos: com a função fora, só o OSRM, com o motivo', async () => {
    const r = await calcularRotasDaPosicao(DE, ATE, { buscador: servidor(() => resposta({ erro: 'fora' }, 502)), usarTransito: true, modo: 'ambos' })
    expect(r).toEqual({ ok: true, rotas: [{ servico: 'osrm', minutosCarro: 17, distanciaKm: 20.5 }], semTransito: 'fora' })
  })

  it('ambos: com o OSRM fora e o TomTom bem, vale o TomTom', async () => {
    const r = await calcularRotasDaPosicao(DE, ATE, { buscador: servidor(() => resposta(funcaoOk(22 * 60, 20_500)), () => resposta({}, 503)), usarTransito: true, modo: 'ambos' })
    expect(r).toEqual({ ok: true, rotas: [{ servico: 'tomtom', minutosCarro: 22, distanciaKm: 20.5 }], semTransito: null })
  })

  it('reserva: o TomTom respondeu, o OSRM nem é chamado', async () => {
    const b = servidor(() => resposta(funcaoOk(22 * 60, 20_500)))
    const r = await calcularRotasDaPosicao(DE, ATE, { buscador: b, usarTransito: true, modo: 'reserva' })
    expect(r).toEqual({ ok: true, rotas: [{ servico: 'tomtom', minutosCarro: 22, distanciaKm: 20.5 }], semTransito: null })
    expect(chamadasA(b, 'routed-car')).toHaveLength(0)
  })

  it.each([
    ['sem chave', 500, 'sem_chave', 'sem_chave'],
    ['cota esgotada', 429, 'cota_ou_chave', 'cota'],
    ['fora do ar', 502, 'fora', 'fora'],
  ] as const)('reserva: %s no TomTom → OSRM, sem travar', async (_nome, status, erro, motivo) => {
    const b = servidor(() => resposta({ erro }, status))
    const r = await calcularRotasDaPosicao(DE, ATE, { buscador: b, usarTransito: true, modo: 'reserva' })
    expect(r).toEqual({ ok: true, rotas: [{ servico: 'osrm', minutosCarro: 17, distanciaKm: 20.5 }], semTransito: motivo })
    expect(chamadasA(b, 'routed-car')).toHaveLength(1)
  })

  it('reserva: a função demora (tempo esgotado) → OSRM', async () => {
    const buscador: Buscador = (url, init) =>
      url.startsWith(CONFIG.transitoUrl)
        ? new Promise((_ok, falha) => init?.signal?.addEventListener('abort', () => falha(new DOMException('abortado', 'AbortError'))))
        : Promise.resolve(resposta(osrmOk(17 * 60, 20_500)))
    const r = await calcularRotasDaPosicao(DE, ATE, { buscador, usarTransito: true, modo: 'reserva', tempoLimiteMs: 5 })
    expect(r).toMatchObject({ ok: true, rotas: [{ servico: 'osrm' }], semTransito: 'tempo_esgotado' })
  })

  it('os dois falham: erro do OSRM, nada inventado', async () => {
    const r = await calcularRotasDaPosicao(DE, ATE, { buscador: servidor(() => resposta({ erro: 'fora' }, 502), () => resposta({}, 503)), usarTransito: true, modo: 'reserva' })
    expect(r).toEqual({ ok: false, erro: 'fora' })
  })
})

describe('pela posição (GPS simulado)', () => {
  it('rotaDaPosicaoAtual no modo ambos devolve as duas rotas e o TomTom como preferida', async () => {
    const r = await rotaDaPosicaoAtual(ATE, { geo: gpsOk(), online: true, usarTransito: true, modo: 'ambos', buscador: servidor(() => resposta(funcaoOk(22 * 60, 20_500))) })
    if (!r.ok) throw new Error('esperava sucesso')
    expect(r.rota.servico).toBe('tomtom')
    expect(r.rotas.map((x) => x.servico)).toEqual(['tomtom', 'osrm'])
    expect(r.semTransito).toBeNull()
  })

  it('o automático (rotaDaPosicaoPrecisa) com GPS impreciso não chama nem a função nem o OSRM', async () => {
    const b = servidor(() => resposta(funcaoOk(22 * 60, 20_500)))
    const r = await rotaDaPosicaoPrecisa(ATE, { geo: gpsOk(1800), online: true, usarTransito: true, buscador: b })
    expect(r).toEqual({ ok: false, erro: 'impreciso' })
    expect(b).not.toHaveBeenCalled()
  })

  it('sem internet, nem pede o GPS nem chama a função', async () => {
    const b = servidor(() => resposta(funcaoOk(60, 1000)))
    const r = await rotaDaPosicaoAtual(ATE, { geo: gpsOk(), online: false, usarTransito: true, buscador: b })
    expect(r).toEqual({ ok: false, erro: 'sem_internet' })
    expect(b).not.toHaveBeenCalled()
  })
})
