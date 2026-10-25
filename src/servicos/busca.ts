// Busca de endereço ou nome de lugar pelo Photon (OpenStreetMap, sem chave). Só no cadastro de
// local, com internet, e só quando a pessoa pede: nunca a cada tecla. Vai para a rede apenas o
// texto digitado.

import { CONFIG } from '../core/config'
import { interpretarBuscaPhoton, type ErroDeServico, type Ponto, type ResultadoDeBusca } from '../core/rotas'
import { pedirJson, type OpcoesDeRede } from './rede'

export type ResultadoDaBusca = { ok: true; resultados: ResultadoDeBusca[] } | { ok: false; erro: ErroDeServico }

export const TAMANHO_MINIMO_DA_BUSCA = 3

/**
 * `perto` (já arredondado a 2 casas) pede ao Photon que prefira resultados por perto: é só
 * ranking, não filtra. Vão para a rede o texto digitado e esse ponto, nunca dados de pessoas.
 */
export function urlDaBusca(texto: string, perto?: Ponto | null): string {
  const bias = perto ? `&lat=${perto.lat}&lon=${perto.lng}` : ''
  return `${CONFIG.geocodificadorUrl}?q=${encodeURIComponent(texto.trim())}&limit=${CONFIG.buscaMaxResultados}${bias}`
}

/** Lista vazia = o serviço respondeu e não achou nada (diferente de falha). */
export async function buscarEndereco(texto: string, opcoes: OpcoesDeRede & { perto?: Ponto | null } = {}): Promise<ResultadoDaBusca> {
  const { perto, ...rede } = opcoes
  const r = await pedirJson(urlDaBusca(texto, perto), rede)
  if (!r.ok) return { ok: false, erro: r.erro }
  return { ok: true, resultados: interpretarBuscaPhoton(r.json) }
}
