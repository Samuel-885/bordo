// Busca de endereço ou nome de lugar pelo Photon (OpenStreetMap, sem chave). Só no cadastro de
// local, com internet, e só quando a pessoa pede: nunca a cada tecla. Vai para a rede apenas o
// texto digitado.

import { CONFIG } from '../core/config'
import { interpretarBuscaPhoton, type ErroDeServico, type ResultadoDeBusca } from '../core/rotas'
import { pedirJson, type OpcoesDeRede } from './rede'

export type ResultadoDaBusca = { ok: true; resultados: ResultadoDeBusca[] } | { ok: false; erro: ErroDeServico }

export const TAMANHO_MINIMO_DA_BUSCA = 3

export function urlDaBusca(texto: string): string {
  return `${CONFIG.geocodificadorUrl}?q=${encodeURIComponent(texto.trim())}&limit=${CONFIG.buscaMaxResultados}`
}

/** Lista vazia = o serviço respondeu e não achou nada (diferente de falha). */
export async function buscarEndereco(texto: string, opcoes: OpcoesDeRede = {}): Promise<ResultadoDaBusca> {
  const r = await pedirJson(urlDaBusca(texto), opcoes)
  if (!r.ok) return { ok: false, erro: r.erro }
  return { ok: true, resultados: interpretarBuscaPhoton(r.json) }
}
