// Chamada de rede dos serviços da fase 8 (rotas e busca de endereço). Só no planejamento, com
// internet. O `fetch` e a espera entram por parâmetro: os testes e os fluxos e2e não usam rede.
// Nada aqui lê o relógio do sistema: o tempo limite é um temporizador, não um horário.

import { CONFIG } from '../core/config'
import type { ErroDeServico } from '../core/rotas'

export type Buscador = (url: string, init?: RequestInit) => Promise<Response>

export interface OpcoesDeRede {
  /** Padrão: o `fetch` do navegador. */
  buscador?: Buscador
  tempoLimiteMs?: number
  /** Cancelamento pedido pela pessoa. */
  sinal?: AbortSignal
}

export type RespostaDeRede =
  | { ok: true; json: unknown }
  | { ok: false; erro: ErroDeServico; status: number | null; json: unknown }

/** Erro de HTTP → falha do serviço. Só o 429 é "limite excedido"; os demais (5xx, 4xx) são "serviço fora". */
export function erroDoStatus(status: number): ErroDeServico {
  return status === 429 ? 'limite' : 'fora'
}

/** O cancelamento pedido pela pessoa não é falha de serviço. */
export class Cancelado extends Error {
  constructor() {
    super('cancelado')
  }
}

/**
 * GET que devolve o JSON. Falhas de rede, tempo esgotado e status de erro viram `ok: false` com o
 * tipo do erro; o corpo (quando é JSON) vem junto, porque o OSRM explica "sem caminho" no corpo de
 * um erro 400. Lança `Cancelado` se a pessoa cancelou.
 */
export async function pedirJson(url: string, opcoes: OpcoesDeRede = {}): Promise<RespostaDeRede> {
  const buscador: Buscador = opcoes.buscador ?? ((u, i) => fetch(u, i))
  const controle = new AbortController()
  let esgotou = false
  const aoCancelar = () => controle.abort()
  if (opcoes.sinal?.aborted) throw new Cancelado()
  opcoes.sinal?.addEventListener('abort', aoCancelar)
  const temporizador = setTimeout(() => {
    esgotou = true
    controle.abort()
  }, opcoes.tempoLimiteMs ?? CONFIG.servicoTempoLimiteMs)
  try {
    const r = await buscador(url, { signal: controle.signal, credentials: 'omit', headers: { Accept: 'application/json' } })
    const json: unknown = await r.json().catch(() => null)
    if (!r.ok) return { ok: false, erro: erroDoStatus(r.status), status: r.status, json }
    return { ok: true, json }
  } catch {
    if (opcoes.sinal?.aborted) throw new Cancelado()
    return { ok: false, erro: esgotou ? 'tempo_esgotado' : 'sem_internet', status: null, json: null }
  } finally {
    clearTimeout(temporizador)
    opcoes.sinal?.removeEventListener('abort', aoCancelar)
  }
}
