// Tempo e distância de carro entre dois pontos pelo OSRM público do FOSSGIS (perfil de carro,
// dados do OpenStreetMap, sem chave). O servidor pede no máximo 1 requisição por segundo: o lote
// espera entre uma e outra. Se ele cair, o trecho continua "sem tempo" e o tempo pode ser digitado.

import { CONFIG } from '../core/config'
import { interpretarRotaOsrm, respostaSemCaminho, type ErroDeServico, type ParaCalcular, type Ponto, type RotaCalculada } from '../core/rotas'
import type { ParDeTrecho } from '../core/trechos'
import { Cancelado, pedirJson, type OpcoesDeRede } from './rede'

export type ResultadoDaRota =
  | { ok: true; rota: RotaCalculada }
  /** O serviço respondeu, mas não há rota utilizável (sem caminho, resposta vazia ou inválida). */
  | { ok: false; erro: 'sem_rota' }
  | { ok: false; erro: ErroDeServico }

/** Só as coordenadas dos dois locais vão na requisição: nenhum dado de passageiro. */
export function urlDaRota(de: Ponto, ate: Ponto): string {
  return `${CONFIG.rotasUrl}/${de.lng},${de.lat};${ate.lng},${ate.lat}?overview=false`
}

export async function calcularRota(de: Ponto, ate: Ponto, opcoes: OpcoesDeRede = {}): Promise<ResultadoDaRota> {
  const r = await pedirJson(urlDaRota(de, ate), opcoes)
  if (r.ok) {
    const rota = interpretarRotaOsrm(r.json)
    return rota ? { ok: true, rota } : { ok: false, erro: 'sem_rota' }
  }
  // O OSRM explica "sem caminho" no corpo de um erro 400.
  if (respostaSemCaminho(r.json)) return { ok: false, erro: 'sem_rota' }
  return { ok: false, erro: r.erro }
}

export interface OpcoesDoLote extends OpcoesDeRede {
  /** Chamada a cada rota calculada, para gravar na hora (o que já foi calculado não se perde). */
  aoCalcular: (par: ParDeTrecho, rota: RotaCalculada) => Promise<void>
  aoAndamento?: (feitos: number, total: number) => void
  /** Padrão: temporizador. Os testes passam uma espera instantânea. */
  esperar?: (ms: number) => Promise<void>
  intervaloMs?: number
}

export interface ResultadoDoLote {
  calculados: number
  /** Pares em que o serviço não achou rota. Não interrompem o lote. */
  semRota: ParDeTrecho[]
  /** Falha do serviço (ou cancelamento): os pares que sobraram não foram tentados. */
  interrompido: { erro: ErroDeServico | 'cancelado'; restantes: number } | null
}

const esperarComTemporizador = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Calcula os pares em sequência, com intervalo entre as requisições. Para na primeira falha do
 * serviço (rede, limite, servidor fora, tempo esgotado), sem insistir; "sem rota" de um par só
 * marca aquele par.
 */
export async function calcularLote(pares: readonly ParaCalcular[], opcoes: OpcoesDoLote): Promise<ResultadoDoLote> {
  const esperar = opcoes.esperar ?? esperarComTemporizador
  const intervalo = opcoes.intervaloMs ?? CONFIG.rotasIntervaloMs
  const resultado: ResultadoDoLote = { calculados: 0, semRota: [], interrompido: null }
  opcoes.aoAndamento?.(0, pares.length)
  for (const [i, p] of pares.entries()) {
    try {
      if (i > 0) await esperar(intervalo)
      if (opcoes.sinal?.aborted) throw new Cancelado()
      const r = await calcularRota(p.de, p.ate, opcoes)
      if (r.ok) {
        await opcoes.aoCalcular(p.par, r.rota)
        resultado.calculados += 1
      } else if (r.erro === 'sem_rota') {
        resultado.semRota.push(p.par)
      } else {
        resultado.interrompido = { erro: r.erro, restantes: pares.length - i }
        break
      }
    } catch (e) {
      if (!(e instanceof Cancelado)) throw e
      resultado.interrompido = { erro: 'cancelado', restantes: pares.length - i }
      break
    }
    opcoes.aoAndamento?.(i + 1, pares.length)
  }
  return resultado
}
