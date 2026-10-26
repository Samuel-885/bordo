// Previsão com trânsito (TomTom): leitura das respostas, pedido à função, textos e o campo
// `servico` da recalibração (opcional e aditivo: backup formato 1 e versão anterior).

import { describe, expect, it } from 'vitest'
import { FORMATO_ATUAL, montarBackup, serializarBackup, validarBackup, type ConteudoBackup } from '../backup'
import { CONFIG } from '../config'
import { chegadaDaPrevia, criarPrevia } from '../localizacao'
import { calcularEstado } from '../previsao'
import {
  erroDoStatusDoTomTom,
  interpretarRespostaDaFuncao,
  interpretarTomTom,
  lerPedido,
  motivoDaFalhaDaFuncao,
  origemPermitida,
  pontoNoBrasil,
  servicoDoEvento,
  statusDoErroDaFuncao,
  textoDoServico,
  urlDoTomTom,
} from '../transito'
import { ETAPAS, EVENTOS_CASO_3, LOCAIS, PASSAGEIROS, PLANO, congelar, etapaDe, ev, h } from './fixtures'

const IPATINGA = { lat: -19.4687, lng: -42.5367 }
const BH = { lat: -19.9167, lng: -43.9345 }
const resumo = (travelTimeInSeconds: unknown, lengthInMeters: unknown, noTraffic: unknown = 900) => ({
  routes: [{ summary: { travelTimeInSeconds, lengthInMeters, noTrafficTravelTimeInSeconds: noTraffic } }],
})

describe('pedido à função', () => {
  it('aceita só origem e destino com lat e lng dentro da caixa do Brasil', () => {
    expect(lerPedido({ origem: IPATINGA, destino: BH })).toEqual({ origem: IPATINGA, destino: BH })
  })

  it('recusa campos extras, pontos incompletos, não numéricos e fora dos limites', () => {
    expect(lerPedido(null)).toBeNull()
    expect(lerPedido({ origem: IPATINGA })).toBeNull()
    expect(lerPedido({ origem: IPATINGA, destino: BH, chave: 'x' })).toBeNull()
    expect(lerPedido({ origem: { ...IPATINGA, nome: 'Ana' }, destino: BH })).toBeNull()
    expect(lerPedido({ origem: { lat: '-19', lng: '-42' }, destino: BH })).toBeNull()
    expect(lerPedido({ origem: { lat: Number.NaN, lng: -42 }, destino: BH })).toBeNull()
    expect(lerPedido({ origem: { lat: 95, lng: -42 }, destino: BH })).toBeNull()
    expect(lerPedido([IPATINGA, BH])).toBeNull()
  })

  it('caixa do Brasil: origem e destino fora (Lisboa, Buenos Aires) são recusados', () => {
    expect(pontoNoBrasil({ lat: 38.7223, lng: -9.1393 })).toBe(false)
    expect(pontoNoBrasil({ lat: -34.6037, lng: -58.3816 })).toBe(false)
    expect(lerPedido({ origem: { lat: 38.7223, lng: -9.1393 }, destino: BH })).toBeNull()
    expect(lerPedido({ origem: IPATINGA, destino: { lat: -34.6037, lng: -58.3816 } })).toBeNull()
    expect(pontoNoBrasil({ lat: CONFIG.caixaDoBrasil.latMin, lng: CONFIG.caixaDoBrasil.lngMin })).toBe(true)
    expect(pontoNoBrasil({ lat: CONFIG.caixaDoBrasil.latMax + 0.1, lng: -50 })).toBe(false)
  })

  it('a origem do pedido tem de ser a do próprio site; sem cabeçalho, recusa', () => {
    const site = ['https://bordo.exemplo.app', undefined, '']
    expect(origemPermitida('https://bordo.exemplo.app', site)).toBe(true)
    expect(origemPermitida('https://outro.exemplo.app', site)).toBe(false)
    expect(origemPermitida(null, site)).toBe(false)
    expect(origemPermitida('', site)).toBe(false)
    expect(origemPermitida('https://bordo.exemplo.app', ['https://bordo.exemplo.app/'])).toBe(true)
  })

  it('o TomTom é chamado com carro, trânsito e partida agora (departAt=now)', () => {
    const url = new URL(urlDoTomTom(IPATINGA, BH, 'CHAVE-DE-TESTE'))
    expect(url.origin + url.pathname).toBe(`https://api.tomtom.com/routing/1/calculateRoute/${IPATINGA.lat},${IPATINGA.lng}:${BH.lat},${BH.lng}/json`)
    expect(Object.fromEntries(url.searchParams)).toEqual({ key: 'CHAVE-DE-TESTE', travelMode: 'car', traffic: 'true', departAt: 'now', computeTravelTimeFor: 'all' })
  })
})

describe('leitura das respostas', () => {
  it('TomTom: tempo com trânsito, sem trânsito e distância', () => {
    expect(interpretarTomTom(resumo(1260, 20500))).toEqual({ tempoSegundos: 1260, semTransitoSegundos: 900, distanciaM: 20500 })
    expect(interpretarTomTom(resumo(1260, 20500, null))?.semTransitoSegundos).toBeNull()
  })

  it('TomTom: resposta vazia, sem resumo ou inválida não vira tempo', () => {
    for (const ruim of [null, {}, { routes: [] }, { routes: [{}] }, resumo(0, 100), resumo('x', 100), resumo(600, -1), resumo(Number.NaN, 5), resumo(600, 'x')]) {
      expect(interpretarTomTom(ruim)).toBeNull()
    }
  })

  it('função → app: minutos arredondados para cima e distância em km, servico "tomtom"', () => {
    expect(interpretarRespostaDaFuncao({ tempoSegundos: 1201, semTransitoSegundos: 900, distanciaM: 20_540 })).toEqual({ servico: 'tomtom', minutosCarro: 21, distanciaKm: 20.5 })
    expect(interpretarRespostaDaFuncao({ tempoSegundos: 1200, distanciaM: 1000 })?.minutosCarro).toBe(20)
    expect(interpretarRespostaDaFuncao({ tempoSegundos: 0, distanciaM: 1 })).toBeNull()
    expect(interpretarRespostaDaFuncao({ distanciaM: 1 })).toBeNull()
    expect(interpretarRespostaDaFuncao('texto')).toBeNull()
  })

  it('erros do TomTom: 429 e 403 são cota ou chave; 5xx é fora; 400 é sem rota', () => {
    expect(erroDoStatusDoTomTom(429)).toBe('cota_ou_chave')
    expect(erroDoStatusDoTomTom(403)).toBe('cota_ou_chave')
    expect(erroDoStatusDoTomTom(400)).toBe('sem_rota')
    expect(erroDoStatusDoTomTom(500)).toBe('fora')
    expect(erroDoStatusDoTomTom(503)).toBe('fora')
    expect(statusDoErroDaFuncao('sem_chave')).toBe(500)
    expect(statusDoErroDaFuncao('cota_ou_chave')).toBe(429)
    expect(statusDoErroDaFuncao('origem_recusada')).toBe(403)
    expect(statusDoErroDaFuncao('pedido_invalido')).toBe(400)
  })

  it('motivo da falha da função, no app', () => {
    expect(motivoDaFalhaDaFuncao(null, null)).toBe('sem_internet')
    expect(motivoDaFalhaDaFuncao(500, { erro: 'sem_chave' })).toBe('sem_chave')
    expect(motivoDaFalhaDaFuncao(429, { erro: 'cota_ou_chave' })).toBe('cota')
    expect(motivoDaFalhaDaFuncao(504, { erro: 'tempo_esgotado' })).toBe('tempo_esgotado')
    expect(motivoDaFalhaDaFuncao(422, { erro: 'sem_rota' })).toBe('sem_rota')
    expect(motivoDaFalhaDaFuncao(404, null)).toBe('fora') // função ausente (por exemplo, no servidor de desenvolvimento)
    expect(motivoDaFalhaDaFuncao(502, { erro: 'fora' })).toBe('fora')
  })
})

describe('prévia e textos do serviço', () => {
  const tomtom = { minutosCarro: 22, distanciaKm: 20.5, servico: 'tomtom' as const }
  const osrm = { minutosCarro: 17, distanciaKm: 20.5, servico: 'osrm' as const }

  it('a prévia carrega o serviço e o horário segue a escolha (fator ônibus por cima do tempo com trânsito)', () => {
    const t = criarPrevia(tomtom, 20, h('08:20'))
    const o = criarPrevia(osrm, 20, h('08:20'))
    expect(t.servico).toBe('tomtom')
    expect(chegadaDaPrevia(t, 1.15, true)).toBe(h('08:46')) // 22 × 1,15 = 25,3 → 26
    expect(chegadaDaPrevia(o, 1.15, true)).toBe(h('08:40')) // 17 × 1,15 = 19,55 → 20
    expect(chegadaDaPrevia(t, 1.15, false)).toBe(h('08:42'))
  })

  it('textos: "com trânsito (TomTom)" e "sem trânsito (OSRM)"; sem o campo vale OSRM', () => {
    expect(textoDoServico('tomtom')).toBe('com trânsito (TomTom)')
    expect(textoDoServico('osrm')).toBe('sem trânsito (OSRM)')
    expect(servicoDoEvento(undefined)).toBe('osrm')
    expect(servicoDoEvento('tomtom')).toBe('tomtom')
  })
})

describe('servico na recalibração: aditivo e compatível com a versão anterior', () => {
  const original = congelar()
  const doTomTom = ev.recalibracaoComServico('almoco', h('13:10'), h('11:45'), h('11:46'), 'tomtom')
  const doOsrm = ev.recalibracaoComServico('almoco', h('13:10'), h('11:45'), h('11:46'), 'osrm')
  const antiga = ev.recalibracaoPelaLocalizacao('almoco', h('13:10'), h('11:45'), h('11:46'))

  it('o campo não muda nenhum cálculo: a previsão é a mesma com ou sem ele; só a marca muda', () => {
    const chegada = (e: typeof doOsrm) => etapaDe(calcularEstado(PLANO, original, [...EVENTOS_CASO_3, e], h('11:50')), 'almoco').chegada!
    expect(chegada(doTomTom).instante).toBe(chegada(antiga).instante)
    expect(chegada(doOsrm).instante).toBe(chegada(antiga).instante)
    expect(chegada(doTomTom).servicoDaLocalizacao).toBe('tomtom')
    expect(chegada(doOsrm).servicoDaLocalizacao).toBe('osrm')
    expect(chegada(antiga).servicoDaLocalizacao).toBeUndefined()
  })

  function conteudo(eventos: typeof EVENTOS_CASO_3): ConteudoBackup {
    return { viagens: [{ ...PLANO.viagem, planoOriginal: congelar() }], etapas: ETAPAS, locais: LOCAIS, trechos: [], eventos, passageiros: PASSAGEIROS, modelos: [] }
  }
  const voltar = async (texto: string) => validarBackup(texto)
  async function comHash(alterar: (c: any) => void, base: ConteudoBackup) {
    const c = JSON.parse(JSON.stringify(base))
    alterar(c)
    const arquivo = JSON.parse(serializarBackup(await montarBackup(base, h('12:00'))))
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(c)))), (b) => b.toString(16).padStart(2, '0')).join('')
    return JSON.stringify({ ...arquivo, conteudo: c, integridade: { algoritmo: 'SHA-256', hash } })
  }

  it('backup formato 1 com servico faz ida e volta sem perder nada', async () => {
    expect(FORMATO_ATUAL).toBe(1)
    const c = conteudo([...EVENTOS_CASO_3, doTomTom])
    const r = await voltar(serializarBackup(await montarBackup(c, h('12:00'))))
    if (!r.ok) throw new Error(r.motivo)
    expect(r.backup.conteudo).toEqual(c)
    expect(r.backup.formato).toBe(1)
  })

  it('arquivo antigo, sem o campo, restaura como antes', async () => {
    const c = conteudo([...EVENTOS_CASO_3, antiga])
    const r = await voltar(serializarBackup(await montarBackup(c, h('12:00'))))
    expect(r.ok).toBe(true)
  })

  it('servico inválido é recusado', async () => {
    const base = conteudo([...EVENTOS_CASO_3, doTomTom])
    const r = await voltar(await comHash((c) => { c.eventos[c.eventos.length - 1].dados.servico = 'google' }, base))
    expect(r.ok).toBe(false)
  })

  it('origem continua "localizacao": a versão anterior recusa qualquer outro valor nela, então nunca é usado', () => {
    expect(doTomTom.tipo === 'recalibracao' && doTomTom.dados.origem).toBe('localizacao')
  })
})
