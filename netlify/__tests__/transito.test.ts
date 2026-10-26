// A função de repasse ao TomTom, com o TomTom simulado (nenhum teste chama o TomTom de verdade).

import { afterEach, describe, expect, it, vi } from 'vitest'
import { criarTratador, type Buscador } from '../transito-tratador'

const SITE = 'https://bordo.exemplo.app'
const CHAVE = 'CHAVE-SECRETA-DE-TESTE-123'
const IPATINGA = { lat: -19.4687, lng: -42.5367 }
const BH = { lat: -19.9167, lng: -43.9345 }
const tomtomOk = { routes: [{ summary: { travelTimeInSeconds: 1260, noTrafficTravelTimeInSeconds: 1000, lengthInMeters: 20_500 } }] }

const pedido = (corpo: unknown, cabecalhos: Record<string, string> = { origin: SITE }, metodo = 'POST') =>
  new Request(`${SITE}/.netlify/functions/transito`, { method: metodo, headers: { 'content-type': 'application/json', ...cabecalhos }, body: metodo === 'POST' ? JSON.stringify(corpo) : undefined })
const valido = { origem: IPATINGA, destino: BH }
const buscadorOk = () => vi.fn<Buscador>(async () => new Response(JSON.stringify(tomtomOk), { status: 200 }))

afterEach(() => vi.restoreAllMocks())

describe('função de trânsito', () => {
  it('sucesso: devolve só tempo, tempo sem trânsito e distância; chama o TomTom com trânsito e partida agora', async () => {
    const buscador = buscadorOk()
    const r = await criarTratador({ TOMTOM_API_KEY: CHAVE }, buscador)(pedido(valido))
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ tempoSegundos: 1260, semTransitoSegundos: 1000, distanciaM: 20_500 })
    const url = new URL(buscador.mock.calls[0]![0])
    expect(url.hostname).toBe('api.tomtom.com')
    expect(url.searchParams.get('travelMode')).toBe('car')
    expect(url.searchParams.get('traffic')).toBe('true')
    expect(url.searchParams.get('departAt')).toBe('now')
    expect(url.searchParams.get('key')).toBe(CHAVE)
  })

  it('a resposta nunca devolve a chave nem as coordenadas', async () => {
    const r = await criarTratador({ TOMTOM_API_KEY: CHAVE }, buscadorOk())(pedido(valido))
    const texto = await r.text()
    expect(texto).not.toContain(CHAVE)
    expect(texto).not.toContain('19.4687')
  })

  it('aceita a origem do endereço do site definido pelo Netlify (URL)', async () => {
    const r = await criarTratador({ TOMTOM_API_KEY: CHAVE, URL: 'https://bordo-app.netlify.app' }, buscadorOk())(pedido(valido, { origin: 'https://bordo-app.netlify.app' }))
    expect(r.status).toBe(200)
  })

  it('origem de outro site, sem origem: 403, e o TomTom nem é chamado', async () => {
    const buscador = buscadorOk()
    const tratar = criarTratador({ TOMTOM_API_KEY: CHAVE }, buscador)
    for (const cab of [{ origin: 'https://malicioso.exemplo' }, {} as Record<string, string>]) {
      const r = await tratar(pedido(valido, cab))
      expect(r.status).toBe(403)
      expect(await r.json()).toEqual({ erro: 'origem_recusada' })
    }
    expect(buscador).not.toHaveBeenCalled()
  })

  it('método diferente de POST: 405', async () => {
    const r = await criarTratador({ TOMTOM_API_KEY: CHAVE }, buscadorOk())(pedido(null, { origin: SITE }, 'GET'))
    expect(r.status).toBe(405)
  })

  it('coordenadas inválidas, fora da caixa do Brasil, campos extras ou corpo que não é JSON: 400, sem chamar o TomTom', async () => {
    const buscador = buscadorOk()
    const tratar = criarTratador({ TOMTOM_API_KEY: CHAVE }, buscador)
    const ruins = [
      { origem: { lat: 999, lng: 0 }, destino: BH },
      { origem: { lat: 38.7223, lng: -9.1393 }, destino: BH },
      { origem: IPATINGA, destino: { lat: -34.6037, lng: -58.3816 } },
      { origem: IPATINGA, destino: BH, extra: 1 },
      { origem: IPATINGA },
      { origem: 'a', destino: 'b' },
    ]
    for (const corpo of ruins) {
      const r = await tratar(pedido(corpo))
      expect(r.status).toBe(400)
      expect(await r.json()).toEqual({ erro: 'pedido_invalido' })
    }
    const naoJson = await tratar(new Request(`${SITE}/x`, { method: 'POST', headers: { origin: SITE }, body: 'isto não é json' }))
    expect(naoJson.status).toBe(400)
    expect(buscador).not.toHaveBeenCalled()
  })

  it('sem chave configurada: 500 "sem_chave", sem chamar o TomTom', async () => {
    const buscador = buscadorOk()
    const r = await criarTratador({}, buscador)(pedido(valido))
    expect(r.status).toBe(500)
    expect(await r.json()).toEqual({ erro: 'sem_chave' })
    expect(buscador).not.toHaveBeenCalled()
  })

  it.each([
    [429, 429, 'cota_ou_chave'],
    [403, 429, 'cota_ou_chave'],
    [500, 502, 'fora'],
    [503, 502, 'fora'],
    [400, 422, 'sem_rota'],
  ])('TomTom responde %s: a função devolve %s "%s"', async (statusTomTom, status, erro) => {
    const r = await criarTratador({ TOMTOM_API_KEY: CHAVE }, async () => new Response('{}', { status: statusTomTom }))(pedido(valido))
    expect(r.status).toBe(status)
    expect(await r.json()).toEqual({ erro })
  })

  it('TomTom fora do ar (a rede falha) ou com resposta inválida: 502 "fora"', async () => {
    const semRede = await criarTratador({ TOMTOM_API_KEY: CHAVE }, async () => { throw new TypeError('rede') })(pedido(valido))
    expect(semRede.status).toBe(502)
    const invalida = await criarTratador({ TOMTOM_API_KEY: CHAVE }, async () => new Response(JSON.stringify({ routes: [] }), { status: 200 }))(pedido(valido))
    expect(invalida.status).toBe(502)
    expect(await invalida.json()).toEqual({ erro: 'fora' })
  })

  it('TomTom que não responde a tempo: 504 "tempo_esgotado"', async () => {
    vi.useFakeTimers()
    try {
      const buscador: Buscador = (_u, init) => new Promise((_ok, falha) => init?.signal?.addEventListener('abort', () => falha(new DOMException('abortado', 'AbortError'))))
      const pendente = criarTratador({ TOMTOM_API_KEY: CHAVE }, buscador)(pedido(valido))
      await vi.advanceTimersByTimeAsync(7000)
      const r = await pendente
      expect(r.status).toBe(504)
      expect(await r.json()).toEqual({ erro: 'tempo_esgotado' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('nenhum log traz a chave, coordenadas ou o que o TomTom respondeu: só o código do erro', async () => {
    const espioes = [vi.spyOn(console, 'log'), vi.spyOn(console, 'error'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'info'), vi.spyOn(console, 'debug')].map((e) => e.mockImplementation(() => {}))
    const tratar = (b: Buscador, amb = { TOMTOM_API_KEY: CHAVE }) => criarTratador(amb, b)
    await tratar(buscadorOk())(pedido(valido))
    await tratar(async () => new Response('{"detail":"quota -19.4687"}', { status: 429 }))(pedido(valido))
    await tratar(async () => { throw new TypeError(`falha em ${CHAVE} -19.4687`) })(pedido(valido))
    await tratar(buscadorOk(), {} as never)(pedido(valido))
    await tratar(buscadorOk())(pedido(valido, { origin: 'https://malicioso.exemplo' }))
    await tratar(buscadorOk())(pedido({ origem: IPATINGA }))
    const registrado = espioes.flatMap((e) => e.mock.calls.flat()).join(' | ')
    expect(registrado).not.toContain(CHAVE)
    expect(registrado).not.toMatch(/19\.\d|42\.\d|43\.\d/)
    expect(registrado).toContain('transito: cota_ou_chave')
  })
})
