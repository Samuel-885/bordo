// Posição do GPS (só quando a pessoa toca) e rota até a próxima parada pelo OSRM. A posição vai
// apenas como coordenadas na requisição e nunca é guardada. O GPS, a rede e o estado de conexão
// entram por parâmetro: os testes não usam GPS nem rede de verdade.

import { CONFIG } from '../core/config'
import { posicaoValida, type ErroDeGps, type PosicaoGps } from '../core/localizacao'
import type { ErroDeServico, Ponto, RotaCalculada } from '../core/rotas'
import type { OpcoesDeRede } from './rede'
import { calcularRota } from './rotas'

/** O que usamos de `navigator.geolocation` (facilita simular). */
export interface Geolocalizacao {
  getCurrentPosition(
    ok: (p: { coords: { latitude: number; longitude: number; accuracy: number } }) => void,
    erro: (e: { code: number }) => void,
    opcoes?: { enableHighAccuracy?: boolean; timeout?: number; maximumAge?: number },
  ): void
}

export type ResultadoDoGps = { ok: true; posicao: PosicaoGps } | { ok: false; erro: ErroDeGps }

/** Uma leitura só, sem cache (`maximumAge: 0`), com tempo limite. Códigos: 1 negada, 2 sem sinal, 3 tempo esgotado. */
export function lerPosicao(geo: Geolocalizacao | undefined = typeof navigator === 'undefined' ? undefined : navigator.geolocation): Promise<ResultadoDoGps> {
  if (!geo) return Promise.resolve({ ok: false, erro: 'sem_suporte' })
  return new Promise((resolve) => {
    // Rede de proteção: alguns aparelhos não chamam nenhum retorno quando o GPS trava.
    const guarda = setTimeout(() => resolve({ ok: false, erro: 'gps_tempo_esgotado' }), CONFIG.gpsTempoLimiteMs + 2000)
    const concluir = (r: ResultadoDoGps) => {
      clearTimeout(guarda)
      resolve(r)
    }
    try {
      geo.getCurrentPosition(
        ({ coords }) => {
          const posicao = { lat: coords.latitude, lng: coords.longitude, precisaoM: coords.accuracy }
          concluir(posicaoValida(posicao) ? { ok: true, posicao } : { ok: false, erro: 'sem_sinal' })
        },
        (e) => concluir({ ok: false, erro: e.code === 1 ? 'negada' : e.code === 3 ? 'gps_tempo_esgotado' : 'sem_sinal' }),
        { enableHighAccuracy: true, timeout: CONFIG.gpsTempoLimiteMs, maximumAge: 0 },
      )
    } catch {
      concluir({ ok: false, erro: 'sem_suporte' })
    }
  })
}

export type ResultadoDaLocalizacao =
  | { ok: true; posicao: PosicaoGps; rota: RotaCalculada }
  | { ok: false; erro: ErroDeGps }
  | { ok: false; erro: ErroDeServico | 'sem_rota' }

export interface OpcoesDaLocalizacao extends OpcoesDeRede {
  geo?: Geolocalizacao
  /** Padrão: `navigator.onLine`. */
  online?: boolean
}

/**
 * Posição atual → próxima parada. Sem internet, nem pede o GPS. Só as coordenadas (a posição e a
 * do destino) vão ao OSRM; nada é guardado.
 */
export async function rotaDaPosicaoAtual(destino: Ponto, opcoes: OpcoesDaLocalizacao = {}): Promise<ResultadoDaLocalizacao> {
  if (!(opcoes.online ?? navigator.onLine)) return { ok: false, erro: 'sem_internet' }
  const gps = await lerPosicao(opcoes.geo)
  if (!gps.ok) return gps
  const r = await calcularRota({ lat: gps.posicao.lat, lng: gps.posicao.lng }, destino, opcoes)
  return r.ok ? { ok: true, posicao: gps.posicao, rota: r.rota } : r
}
