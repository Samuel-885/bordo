// Serviços de rede da fase 8 com respostas simuladas: nenhum teste usa a rede de verdade.

import { describe, expect, it, vi } from 'vitest'
import { CONFIG } from '../../core/config'
import type { ParaCalcular } from '../../core/rotas'
import { buscarEndereco, urlDaBusca } from '../busca'
import { Cancelado, pedirJson, type Buscador } from '../rede'
import { calcularLote, calcularRota, urlDaRota } from '../rotas'

const resposta = (corpo: unknown, status = 200) => new Response(typeof corpo === 'string' ? corpo : JSON.stringify(corpo), { status })
const osrmOk = (duration: number, distance: number) => ({ code: 'Ok', routes: [{ duration, distance }] })
const A = { lat: -19.4687, lng: -42.5367 }
const B = { lat: -19.8097, lng: -43.1733 }

const par = (n: number): ParaCalcular => ({
  par: { etapaOrigemId: `e${n}`, localOrigemId: `l${n}`, etapaDestinoId: `e${n + 1}`, localDestinoId: `l${n + 1}` },
  de: A,
  ate: B,
})

describe('rede: pedirJson', () => {
  it('devolve o JSON de uma resposta boa, sem cookies', async () => {
    const buscador = vi.fn<Buscador>(async () => resposta({ a: 1 }))
    expect(await pedirJson('https://x', { buscador })).toEqual({ ok: true, json: { a: 1 } })
    expect(buscador.mock.calls[0]![1]).toMatchObject({ credentials: 'omit' })
  })

  it('429 é limite excedido; 500 é serviço fora', async () => {
    expect(await pedirJson('https://x', { buscador: async () => resposta('', 429) })).toMatchObject({ ok: false, erro: 'limite', status: 429 })
    expect(await pedirJson('https://x', { buscador: async () => resposta('', 503) })).toMatchObject({ ok: false, erro: 'fora', status: 503 })
  })

  it('falha de rede (fetch lança) é "sem internet"', async () => {
    const buscador: Buscador = async () => {
      throw new TypeError('Failed to fetch')
    }
    expect(await pedirJson('https://x', { buscador })).toMatchObject({ ok: false, erro: 'sem_internet' })
  })

  it('serviço que não responde estoura o tempo limite', async () => {
    const buscador: Buscador = (_url, init) => new Promise((_ok, falha) => init!.signal!.addEventListener('abort', () => falha(new DOMException('abortado', 'AbortError'))))
    expect(await pedirJson('https://x', { buscador, tempoLimiteMs: 20 })).toMatchObject({ ok: false, erro: 'tempo_esgotado' })
  })

  it('corpo que não é JSON, com status bom, vira json nulo (quem chama trata como resposta vazia)', async () => {
    expect(await pedirJson('https://x', { buscador: async () => resposta('<html>') })).toEqual({ ok: true, json: null })
  })

  it('cancelar pelo sinal lança Cancelado', async () => {
    const parar = new AbortController()
    const buscador: Buscador = (_url, init) => new Promise((_ok, falha) => init!.signal!.addEventListener('abort', () => falha(new DOMException('abortado', 'AbortError'))))
    const p = pedirJson('https://x', { buscador, sinal: parar.signal, tempoLimiteMs: 5000 })
    parar.abort()
    await expect(p).rejects.toBeInstanceOf(Cancelado)
    parar.abort()
    await expect(pedirJson('https://x', { buscador, sinal: parar.signal })).rejects.toBeInstanceOf(Cancelado)
  })
})

describe('rotas: calcularRota', () => {
  it('monta a URL só com as coordenadas (longitude, latitude) no perfil de carro', () => {
    const url = urlDaRota(A, B)
    expect(url).toBe('https://routing.openstreetmap.de/routed-car/route/v1/driving/-42.5367,-19.4687;-43.1733,-19.8097?overview=false')
    expect(url.startsWith(CONFIG.rotasUrl)).toBe(true)
  })

  it('sucesso: minutos de carro para cima e distância', async () => {
    const buscador = vi.fn<Buscador>(async () => resposta(osrmOk(5566.6, 96699.2)))
    expect(await calcularRota(A, B, { buscador })).toEqual({ ok: true, rota: { minutosCarro: 93, distanciaKm: 96.7 } })
    expect(buscador.mock.calls[0]![0]).toBe(urlDaRota(A, B))
  })

  it('resposta vazia (rotas vazias, JSON inválido, duração zero) é "sem rota"', async () => {
    for (const corpo of [{ code: 'Ok', routes: [] }, '<html>', osrmOk(0, 0), {}]) {
      expect(await calcularRota(A, B, { buscador: async () => resposta(corpo) })).toEqual({ ok: false, erro: 'sem_rota' })
    }
  })

  it('"NoRoute" em erro 400 é "sem rota", não falha do serviço', async () => {
    expect(await calcularRota(A, B, { buscador: async () => resposta({ code: 'NoRoute', message: 'x' }, 400) })).toEqual({ ok: false, erro: 'sem_rota' })
  })

  it('limite excedido, servidor fora e sem internet viram erro de serviço', async () => {
    expect(await calcularRota(A, B, { buscador: async () => resposta('', 429) })).toEqual({ ok: false, erro: 'limite' })
    expect(await calcularRota(A, B, { buscador: async () => resposta('', 502) })).toEqual({ ok: false, erro: 'fora' })
    expect(
      await calcularRota(A, B, {
        buscador: async () => {
          throw new TypeError('x')
        },
      }),
    ).toEqual({ ok: false, erro: 'sem_internet' })
  })
})

describe('rotas: calcularLote', () => {
  const esperar = vi.fn(async (_ms: number) => {})
  const gravados = () => {
    const lista: string[] = []
    return { lista, aoCalcular: async (p: { etapaOrigemId: string }) => void lista.push(p.etapaOrigemId) }
  }

  it('calcula em sequência, grava cada rota na hora e espera entre as requisições (não antes da primeira)', async () => {
    esperar.mockClear()
    const g = gravados()
    const andamento: string[] = []
    const r = await calcularLote([par(1), par(2), par(3)], {
      buscador: async () => resposta(osrmOk(3600, 50000)),
      esperar,
      aoCalcular: g.aoCalcular,
      aoAndamento: (f, t) => void andamento.push(`${f}/${t}`),
    })
    expect(r).toEqual({ calculados: 3, semRota: [], interrompido: null })
    expect(g.lista).toEqual(['e1', 'e2', 'e3'])
    expect(esperar.mock.calls).toEqual([[1100], [1100]])
    expect(andamento).toEqual(['0/3', '1/3', '2/3', '3/3'])
  })

  it('limite excedido no meio interrompe sem insistir e conta o que sobrou', async () => {
    const g = gravados()
    let chamadas = 0
    const r = await calcularLote([par(1), par(2), par(3), par(4)], {
      buscador: async () => (++chamadas === 3 ? resposta('', 429) : resposta(osrmOk(3600, 50000))),
      esperar,
      aoCalcular: g.aoCalcular,
    })
    expect(r).toEqual({ calculados: 2, semRota: [], interrompido: { erro: 'limite', restantes: 2 } })
    expect(chamadas).toBe(3)
    expect(g.lista).toEqual(['e1', 'e2'])
  })

  it('servidor fora e falha de rede também interrompem', async () => {
    const g = gravados()
    expect((await calcularLote([par(1), par(2)], { buscador: async () => resposta('', 500), esperar, aoCalcular: g.aoCalcular })).interrompido).toEqual({ erro: 'fora', restantes: 2 })
    const semRede: Buscador = async () => {
      throw new TypeError('x')
    }
    expect((await calcularLote([par(1)], { buscador: semRede, esperar, aoCalcular: g.aoCalcular })).interrompido).toEqual({ erro: 'sem_internet', restantes: 1 })
    expect(g.lista).toEqual([])
  })

  it('"sem rota" de um par marca só aquele par e o lote continua', async () => {
    const g = gravados()
    let chamadas = 0
    const r = await calcularLote([par(1), par(2), par(3)], {
      buscador: async () => (++chamadas === 2 ? resposta({ code: 'Ok', routes: [] }) : resposta(osrmOk(3600, 50000))),
      esperar,
      aoCalcular: g.aoCalcular,
    })
    expect(r.calculados).toBe(2)
    expect(r.semRota).toEqual([par(2).par])
    expect(r.interrompido).toBeNull()
  })

  it('lote vazio não chama a rede', async () => {
    const buscador = vi.fn<Buscador>()
    expect(await calcularLote([], { buscador, esperar, aoCalcular: async () => {} })).toEqual({ calculados: 0, semRota: [], interrompido: null })
    expect(buscador).not.toHaveBeenCalled()
  })

  it('cancelar interrompe com "cancelado"', async () => {
    const parar = new AbortController()
    const g = gravados()
    const r = await calcularLote([par(1), par(2), par(3)], {
      buscador: async () => resposta(osrmOk(3600, 50000)),
      esperar,
      sinal: parar.signal,
      aoCalcular: async (p) => {
        await g.aoCalcular(p)
        parar.abort()
      },
    })
    expect(r).toEqual({ calculados: 1, semRota: [], interrompido: { erro: 'cancelado', restantes: 2 } })
  })

  it('erro ao gravar não é engolido', async () => {
    await expect(
      calcularLote([par(1)], {
        buscador: async () => resposta(osrmOk(3600, 50000)),
        esperar,
        aoCalcular: async () => {
          throw new Error('banco fechado')
        },
      }),
    ).rejects.toThrow('banco fechado')
  })
})

describe('busca de endereço', () => {
  const feature = (name: string) => ({ type: 'Feature', properties: { name, city: 'Cidade', state: 'Minas Gerais' }, geometry: { type: 'Point', coordinates: [-43.17, -19.81] } })

  it('a URL leva só o texto digitado, codificado, e pede 5 resultados', () => {
    expect(urlDaBusca('  Posto Tal, João Monlevade ')).toBe('https://photon.komoot.io/api/?q=Posto%20Tal%2C%20Jo%C3%A3o%20Monlevade&limit=5')
  })

  it('com o centro dos locais, pede ao Photon que prefira resultados por perto (só ranking)', () => {
    expect(urlDaBusca('Posto Tal', { lat: -19.64, lng: -42.86 })).toBe('https://photon.komoot.io/api/?q=Posto%20Tal&limit=5&lat=-19.64&lon=-42.86')
    expect(urlDaBusca('Posto Tal', null)).toBe('https://photon.komoot.io/api/?q=Posto%20Tal&limit=5')
  })

  it('o ponto de referência vai na URL e não em outro lugar', async () => {
    let pedida = ''
    await buscarEndereco('Posto Tal', { perto: { lat: -19.64, lng: -42.86 }, buscador: async (url) => ((pedida = String(url)), resposta({ features: [] })) })
    expect(pedida).toBe('https://photon.komoot.io/api/?q=Posto%20Tal&limit=5&lat=-19.64&lon=-42.86')
  })

  it('devolve até 5 resultados com as coordenadas', async () => {
    const features = Array.from({ length: 7 }, (_, i) => feature(`Lugar ${i}`))
    const r = await buscarEndereco('lugar', { buscador: async () => resposta({ features }) })
    expect(r.ok && r.resultados).toHaveLength(5)
    expect(r.ok && r.resultados[0]).toEqual({ nome: 'Lugar 0', cidade: 'Cidade', estado: 'Minas Gerais', lat: -19.81, lng: -43.17, precisao: 'aproximada', tipoDoLugar: 'Região' })
  })

  it('sem resultados é sucesso com lista vazia', async () => {
    expect(await buscarEndereco('zzzz', { buscador: async () => resposta({ features: [] }) })).toEqual({ ok: true, resultados: [] })
    expect(await buscarEndereco('zzzz', { buscador: async () => resposta('<html>') })).toEqual({ ok: true, resultados: [] })
  })

  it('limite, servidor fora e sem internet viram erro', async () => {
    expect(await buscarEndereco('x', { buscador: async () => resposta('', 429) })).toEqual({ ok: false, erro: 'limite' })
    expect(await buscarEndereco('x', { buscador: async () => resposta('', 500) })).toEqual({ ok: false, erro: 'fora' })
    expect(
      await buscarEndereco('x', {
        buscador: async () => {
          throw new TypeError('x')
        },
      }),
    ).toEqual({ ok: false, erro: 'sem_internet' })
  })
})
