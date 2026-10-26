// Repasse ao TomTom (Routing API) com trânsito: recebe só as coordenadas de origem e destino,
// chama o TomTom com `departAt=now` e devolve só o tempo e a distância. A chave vem da variável
// de ambiente TOMTOM_API_KEY do Netlify: nunca é escrita no código, devolvida nem registrada.
// As coordenadas também nunca vão para o log (só o código do erro). Fica fora de
// `netlify/functions` para o Netlify não a tratar como uma função; `functions/transito.ts` a usa.

import { CONFIG } from '../src/core/config'
import {
  erroDoStatusDoTomTom,
  interpretarTomTom,
  lerPedido,
  origemPermitida,
  statusDoErroDaFuncao,
  urlDoTomTom,
  type ErroDaFuncao,
} from '../src/core/transito'

export interface Ambiente {
  TOMTOM_API_KEY?: string
  /** O Netlify define estes com o endereço do site; valem como origens permitidas, além do endereço do próprio pedido. */
  URL?: string
  DEPLOY_PRIME_URL?: string
  DEPLOY_URL?: string
}

export type Buscador = (url: string, init?: RequestInit) => Promise<Response>

const CABECALHOS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }

const erro = (e: ErroDaFuncao) => new Response(JSON.stringify({ erro: e }), { status: statusDoErroDaFuncao(e), headers: CABECALHOS })

/** Só o código do erro vai para o log: nada de chave, coordenadas ou resposta do TomTom. */
function falha(e: ErroDaFuncao): Response {
  console.error(`transito: ${e}`)
  return erro(e)
}

export function criarTratador(ambiente: Ambiente, buscador: Buscador = (u, i) => fetch(u, i)) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') return new Response(JSON.stringify({ erro: 'pedido_invalido' }), { status: 405, headers: { ...CABECALHOS, Allow: 'POST' } })

    // Só pedidos vindos do próprio site: confere a origem declarada pelo navegador.
    const permitidas = [new URL(req.url).origin, ambiente.URL, ambiente.DEPLOY_PRIME_URL, ambiente.DEPLOY_URL]
    if (!origemPermitida(req.headers.get('origin'), permitidas)) return falha('origem_recusada')

    let corpo: unknown
    try {
      corpo = await req.json()
    } catch {
      return falha('pedido_invalido')
    }
    const pedido = lerPedido(corpo)
    if (!pedido) return falha('pedido_invalido')

    const chave = ambiente.TOMTOM_API_KEY
    if (!chave) return falha('sem_chave')

    const controle = new AbortController()
    const temporizador = setTimeout(() => controle.abort(), CONFIG.transitoFuncaoTempoLimiteMs)
    try {
      const r = await buscador(urlDoTomTom(pedido.origem, pedido.destino, chave), { signal: controle.signal, headers: { Accept: 'application/json' } })
      if (!r.ok) return falha(erroDoStatusDoTomTom(r.status))
      const tempo = interpretarTomTom(await r.json().catch(() => null))
      if (!tempo) return falha('fora')
      return new Response(JSON.stringify(tempo), { status: 200, headers: CABECALHOS })
    } catch {
      return falha(controle.signal.aborted ? 'tempo_esgotado' : 'fora')
    } finally {
      clearTimeout(temporizador)
    }
  }
}
