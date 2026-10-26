// Previsão com trânsito (TomTom Routing API, via Netlify Function de repasse): só lógica pura. A
// função (netlify/) e o cliente (src/servicos/transito.ts) usam estas conferências e leituras.
// Só as coordenadas de origem e destino vão ao TomTom; nada de passageiros, nada guardado.

import { CONFIG } from './config'
import type { Ponto, RotaCalculada } from './rotas'

/** Qual serviço calculou o tempo da posição até a próxima parada. */
export type ServicoDeRota = 'tomtom' | 'osrm'

export interface RotaDoServico extends RotaCalculada {
  servico: ServicoDeRota
}

/** Por que o TomTom não foi usado (a reserva no OSRM cobre todos). */
export type MotivoSemTransito = 'desligado' | 'sem_chave' | 'cota' | 'fora' | 'tempo_esgotado' | 'sem_internet' | 'sem_rota'

/** Códigos de erro que a função devolve (campo `erro` do corpo). */
export type ErroDaFuncao = 'sem_chave' | 'cota_ou_chave' | 'fora' | 'sem_rota' | 'tempo_esgotado' | 'pedido_invalido' | 'origem_recusada'

export const textoDoServico = (s: ServicoDeRota): string => (s === 'tomtom' ? 'com trânsito (TomTom)' : 'sem trânsito (OSRM)')

/** Evento sem o campo `servico` (versão anterior) foi calculado pelo OSRM. */
export const servicoDoEvento = (servico: ServicoDeRota | undefined): ServicoDeRota => servico ?? 'osrm'

export function textoDoMotivoSemTransito(m: MotivoSemTransito): string {
  switch (m) {
    case 'desligado':
      return 'O trânsito (TomTom) está desligado em Mais.'
    case 'sem_chave':
      return 'O serviço de trânsito não está configurado.'
    case 'cota':
      return 'O serviço de trânsito recusou o pedido (cota esgotada ou chave recusada).'
    case 'fora':
      return 'O serviço de trânsito está fora do ar.'
    case 'tempo_esgotado':
      return 'O serviço de trânsito demorou demais.'
    case 'sem_internet':
      return 'Sem internet para o serviço de trânsito.'
    case 'sem_rota':
      return 'O serviço de trânsito não achou rota.'
  }
}

// ---------- Pedido à função ----------

const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export function pontoNoBrasil(p: Ponto): boolean {
  const c = CONFIG.caixaDoBrasil
  return p.lat >= c.latMin && p.lat <= c.latMax && p.lng >= c.lngMin && p.lng <= c.lngMax
}

function lerPonto(v: unknown): Ponto | null {
  if (!ehObjeto(v)) return null
  const chaves = Object.keys(v)
  if (chaves.length !== 2 || !('lat' in v) || !('lng' in v)) return null
  const { lat, lng } = v
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) return null
  const p = { lat, lng }
  return pontoNoBrasil(p) ? p : null
}

/** Só `origem` e `destino`, cada um só com `lat` e `lng` válidos e dentro da caixa do Brasil. */
export function lerPedido(corpo: unknown): { origem: Ponto; destino: Ponto } | null {
  if (!ehObjeto(corpo) || Object.keys(corpo).length !== 2) return null
  const origem = lerPonto(corpo.origem)
  const destino = lerPonto(corpo.destino)
  return origem && destino ? { origem, destino } : null
}

/** A origem do pedido (cabeçalho `Origin`) tem de ser uma das permitidas. Sem cabeçalho, recusa. */
export function origemPermitida(origin: string | null, permitidas: readonly (string | undefined)[]): boolean {
  if (!origin) return false
  return permitidas.some((p) => p !== undefined && p !== '' && p.replace(/\/+$/, '') === origin)
}

// ---------- TomTom ----------

/** A chave só entra aqui, na hora de chamar; nunca é devolvida nem registrada. */
export function urlDoTomTom(origem: Ponto, destino: Ponto, chave: string): string {
  const pontos = `${origem.lat},${origem.lng}:${destino.lat},${destino.lng}`
  const consulta = new URLSearchParams({ key: chave, travelMode: 'car', traffic: 'true', departAt: 'now', computeTravelTimeFor: 'all' })
  return `https://api.tomtom.com/routing/1/calculateRoute/${pontos}/json?${consulta.toString()}`
}

export interface TempoComTransito {
  tempoSegundos: number
  semTransitoSegundos: number | null
  distanciaM: number
}

const positivo = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0

/** Tempo com trânsito e distância da primeira rota; vazio se a resposta não traz rota utilizável. */
export function interpretarTomTom(json: unknown): TempoComTransito | null {
  if (!ehObjeto(json) || !Array.isArray(json.routes)) return null
  const rota = json.routes[0]
  if (!ehObjeto(rota) || !ehObjeto(rota.summary)) return null
  const { travelTimeInSeconds, noTrafficTravelTimeInSeconds, lengthInMeters } = rota.summary
  if (!positivo(travelTimeInSeconds) || typeof lengthInMeters !== 'number' || !Number.isFinite(lengthInMeters) || lengthInMeters < 0) return null
  return {
    tempoSegundos: travelTimeInSeconds,
    semTransitoSegundos: positivo(noTrafficTravelTimeInSeconds) ? noTrafficTravelTimeInSeconds : null,
    distanciaM: lengthInMeters,
  }
}

/** Erro de HTTP do TomTom → código da função. 403 pode ser chave recusada ou cota: não dá para separar. */
export function erroDoStatusDoTomTom(status: number): ErroDaFuncao {
  if (status === 429 || status === 403) return 'cota_ou_chave'
  if (status === 400 || status === 404) return 'sem_rota'
  return 'fora'
}

/** Status HTTP que a função devolve para cada código de erro. */
export function statusDoErroDaFuncao(e: ErroDaFuncao): number {
  switch (e) {
    case 'pedido_invalido':
      return 400
    case 'origem_recusada':
      return 403
    case 'sem_chave':
      return 500
    case 'cota_ou_chave':
      return 429
    case 'sem_rota':
      return 422
    case 'tempo_esgotado':
      return 504
    case 'fora':
      return 502
  }
}

// ---------- Resposta da função (lida no app) ----------

/** Mesmo arredondamento do OSRM: segundos para o minuto, para cima, sem deixar erro de ponto flutuante ganhar um minuto. */
export function interpretarRespostaDaFuncao(json: unknown): RotaDoServico | null {
  if (!ehObjeto(json) || !positivo(json.tempoSegundos) || typeof json.distanciaM !== 'number' || !Number.isFinite(json.distanciaM) || json.distanciaM < 0) return null
  const minutosCarro = Math.ceil(Math.round((json.tempoSegundos / 60) * 1e6) / 1e6)
  return { servico: 'tomtom', minutosCarro, distanciaKm: Math.round(json.distanciaM / 100) / 10 }
}

/** Código de erro do corpo da resposta da função, ou o que o status HTTP indica. */
export function motivoDaFalhaDaFuncao(status: number | null, json: unknown): MotivoSemTransito {
  if (status === null) return 'sem_internet'
  const erro = ehObjeto(json) && typeof json.erro === 'string' ? json.erro : null
  switch (erro) {
    case 'sem_chave':
      return 'sem_chave'
    case 'cota_ou_chave':
      return 'cota'
    case 'sem_rota':
      return 'sem_rota'
    case 'tempo_esgotado':
      return 'tempo_esgotado'
    default:
      return 'fora'
  }
}
