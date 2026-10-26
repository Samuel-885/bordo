// "Atualizar pela minha localização" com GPS e OSRM simulados: nenhum teste usa GPS ou rede de verdade.

import { describe, expect, it, vi } from 'vitest'
import { CONFIG } from '../../core/config'
import { criarPrevia, chegadaDaPrevia } from '../../core/localizacao'
import { instante } from '../../core/tempo'
import { lerPosicao, rotaDaPosicaoAtual, rotaDaPosicaoPrecisa, type Geolocalizacao } from '../localizacao'
import type { Buscador } from '../rede'

const resposta = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status })
const osrmOk = (duration: number, distance: number) => ({ code: 'Ok', routes: [{ duration, distance }] })
const DESTINO = { lat: -19.8097, lng: -43.1733 }

const gpsOk = (accuracy = 25): Geolocalizacao => ({
  getCurrentPosition: (ok) => ok({ coords: { latitude: -19.4687, longitude: -42.5367, accuracy } }),
})
const gpsComErro = (code: number): Geolocalizacao => ({ getCurrentPosition: (_ok, erro) => erro({ code }) })

describe('lerPosicao (GPS)', () => {
  it('lê uma vez, sem cache e com tempo limite', async () => {
    const getCurrentPosition = vi.fn<Geolocalizacao['getCurrentPosition']>((ok) => ok({ coords: { latitude: -19.4, longitude: -42.5, accuracy: 30 } }))
    const r = await lerPosicao({ getCurrentPosition })
    expect(r).toEqual({ ok: true, posicao: { lat: -19.4, lng: -42.5, precisaoM: 30 } })
    expect(getCurrentPosition).toHaveBeenCalledTimes(1)
    expect(getCurrentPosition.mock.calls[0]![2]).toMatchObject({ maximumAge: 0, timeout: CONFIG.gpsTempoLimiteMs })
  })

  it('permissão negada, sem sinal e tempo esgotado têm erro próprio', async () => {
    expect(await lerPosicao(gpsComErro(1))).toEqual({ ok: false, erro: 'negada' })
    expect(await lerPosicao(gpsComErro(2))).toEqual({ ok: false, erro: 'sem_sinal' })
    expect(await lerPosicao(gpsComErro(3))).toEqual({ ok: false, erro: 'gps_tempo_esgotado' })
  })

  it('sem geolocalização no aparelho: sem suporte', async () => {
    expect(await lerPosicao(undefined as never)).toEqual({ ok: false, erro: 'sem_suporte' })
  })

  it('coordenadas inválidas viram "sem sinal"', async () => {
    const geo: Geolocalizacao = { getCurrentPosition: (ok) => ok({ coords: { latitude: Number.NaN, longitude: 0, accuracy: 10 } }) }
    expect(await lerPosicao(geo)).toEqual({ ok: false, erro: 'sem_sinal' })
  })

  it('se o aparelho não responde nada, a guarda encerra com tempo esgotado', async () => {
    vi.useFakeTimers()
    try {
      const pendente = lerPosicao({ getCurrentPosition: () => {} })
      await vi.advanceTimersByTimeAsync(CONFIG.gpsTempoLimiteMs + 2000)
      expect(await pendente).toEqual({ ok: false, erro: 'gps_tempo_esgotado' })
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('rotaDaPosicaoAtual (GPS + OSRM)', () => {
  it('manda só as coordenadas da posição e do destino, sem cookies, e devolve a rota', async () => {
    const buscador = vi.fn<Buscador>(async () => resposta(osrmOk(16 * 60 + 5, 12_400)))
    const r = await rotaDaPosicaoAtual(DESTINO, { geo: gpsOk(), buscador, online: true })
    expect(r).toEqual({ ok: true, posicao: { lat: -19.4687, lng: -42.5367, precisaoM: 25 }, rota: { minutosCarro: 17, distanciaKm: 12.4, servico: 'osrm' }, rotas: [{ minutosCarro: 17, distanciaKm: 12.4, servico: 'osrm' }], semTransito: 'desligado' })
    const url = buscador.mock.calls[0]![0]
    expect(url).toBe(`${CONFIG.rotasUrl}/-42.5367,-19.4687;-43.1733,-19.8097?overview=false`)
    expect(buscador.mock.calls[0]![1]).toMatchObject({ credentials: 'omit' })
  })

  it('a prévia sai do resultado: chegada = hora do cálculo + carro × fator', async () => {
    const r = await rotaDaPosicaoAtual(DESTINO, { geo: gpsOk(), buscador: async () => resposta(osrmOk(17 * 60, 12_400)), online: true })
    if (!r.ok) throw new Error('esperava sucesso')
    const previa = criarPrevia(r.rota, r.posicao.precisaoM, instante('2026-11-14T08:20:00-03:00'))
    expect(chegadaDaPrevia(previa, 1.15, true)).toBe('2026-11-14T08:40:00-03:00')
  })

  it('sem internet: nem pede o GPS nem chama a rede', async () => {
    const geo = { getCurrentPosition: vi.fn() }
    const buscador = vi.fn<Buscador>()
    expect(await rotaDaPosicaoAtual(DESTINO, { geo, buscador, online: false })).toEqual({ ok: false, erro: 'sem_internet' })
    expect(geo.getCurrentPosition).not.toHaveBeenCalled()
    expect(buscador).not.toHaveBeenCalled()
  })

  it('GPS com falha: não chama a rede', async () => {
    const buscador = vi.fn<Buscador>()
    expect(await rotaDaPosicaoAtual(DESTINO, { geo: gpsComErro(1), buscador, online: true })).toEqual({ ok: false, erro: 'negada' })
    expect(buscador).not.toHaveBeenCalled()
  })

  it('falha de rede depois do GPS: sem internet', async () => {
    const buscador: Buscador = async () => {
      throw new TypeError('Failed to fetch')
    }
    expect(await rotaDaPosicaoAtual(DESTINO, { geo: gpsOk(), buscador, online: true })).toEqual({ ok: false, erro: 'sem_internet' })
  })

  it('serviço fora (503), limite (429) e sem caminho', async () => {
    expect(await rotaDaPosicaoAtual(DESTINO, { geo: gpsOk(), buscador: async () => resposta('', 503), online: true })).toEqual({ ok: false, erro: 'fora' })
    expect(await rotaDaPosicaoAtual(DESTINO, { geo: gpsOk(), buscador: async () => resposta('', 429), online: true })).toEqual({ ok: false, erro: 'limite' })
    expect(await rotaDaPosicaoAtual(DESTINO, { geo: gpsOk(), buscador: async () => resposta({ code: 'NoRoute' }, 400), online: true })).toEqual({ ok: false, erro: 'sem_rota' })
  })

  it('resposta vazia: sem rota, nada inventado', async () => {
    expect(await rotaDaPosicaoAtual(DESTINO, { geo: gpsOk(), buscador: async () => resposta({ code: 'Ok', routes: [] }), online: true })).toEqual({ ok: false, erro: 'sem_rota' })
  })

  it('serviço que não responde: tempo esgotado', async () => {
    const buscador: Buscador = (_u, init) => new Promise((_ok, falha) => init!.signal!.addEventListener('abort', () => falha(new DOMException('x', 'AbortError'))))
    expect(await rotaDaPosicaoAtual(DESTINO, { geo: gpsOk(), buscador, tempoLimiteMs: 20, online: true })).toEqual({ ok: false, erro: 'tempo_esgotado' })
  })
})

describe('rotaDaPosicaoPrecisa (modo automático)', () => {
  const rede = () => vi.fn<Buscador>(async () => resposta(osrmOk(1000, 12_400)))

  it('GPS acima de 1 km: termina sem chamar a rede, com o erro "impreciso"', async () => {
    const buscador = rede()
    expect(await rotaDaPosicaoPrecisa(DESTINO, { geo: gpsOk(CONFIG.gpsPrecisaoRuimM + 1), buscador, online: true })).toEqual({ ok: false, erro: 'impreciso' })
    expect(buscador).not.toHaveBeenCalled()
  })

  it('até 1 km: calcula a rota normalmente', async () => {
    const buscador = rede()
    const r = await rotaDaPosicaoPrecisa(DESTINO, { geo: gpsOk(CONFIG.gpsPrecisaoRuimM), buscador, online: true })
    expect(r.ok).toBe(true)
    expect(buscador).toHaveBeenCalledTimes(1)
  })

  it('o botão manual continua só avisando: calcula mesmo com GPS impreciso', async () => {
    const buscador = rede()
    const r = await rotaDaPosicaoAtual(DESTINO, { geo: gpsOk(2500), buscador, online: true })
    expect(r.ok).toBe(true)
    expect(buscador).toHaveBeenCalledTimes(1)
  })

  it('sem internet nem pede o GPS', async () => {
    const getCurrentPosition = vi.fn<Geolocalizacao['getCurrentPosition']>()
    expect(await rotaDaPosicaoPrecisa(DESTINO, { geo: { getCurrentPosition }, online: false })).toEqual({ ok: false, erro: 'sem_internet' })
    expect(getCurrentPosition).not.toHaveBeenCalled()
  })
})
