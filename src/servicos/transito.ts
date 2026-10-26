// Tempo da posição até a próxima parada com trânsito (TomTom), pela Netlify Function do próprio
// site: o navegador nunca vê a chave. Só as coordenadas de origem e destino vão no pedido. Se a
// função ou o TomTom falham, o OSRM responde como antes e a tela diz qual serviço foi usado.

import { CONFIG } from '../core/config'
import type { ErroDeServico, Ponto } from '../core/rotas'
import { interpretarRespostaDaFuncao, motivoDaFalhaDaFuncao, type MotivoSemTransito, type RotaDoServico } from '../core/transito'
import { calcularRota } from './rotas'
import { pedirJson, type OpcoesDeRede } from './rede'

export type ResultadoDoTransito = { ok: true; rota: RotaDoServico } | { ok: false; motivo: MotivoSemTransito }

/** Pede à função (que chama o TomTom com trânsito, `departAt=now`). Nunca lança, exceto o cancelamento. */
export async function calcularRotaComTransito(de: Ponto, ate: Ponto, opcoes: OpcoesDeRede = {}): Promise<ResultadoDoTransito> {
  const r = await pedirJson(CONFIG.transitoUrl, {
    ...opcoes,
    tempoLimiteMs: opcoes.tempoLimiteMs ?? CONFIG.transitoTempoLimiteMs,
    corpo: { origem: { lat: de.lat, lng: de.lng }, destino: { lat: ate.lat, lng: ate.lng } },
  })
  if (!r.ok) return { ok: false, motivo: r.status === null ? (r.erro === 'tempo_esgotado' ? 'tempo_esgotado' : 'sem_internet') : motivoDaFalhaDaFuncao(r.status, r.json) }
  const rota = interpretarRespostaDaFuncao(r.json)
  return rota ? { ok: true, rota } : { ok: false, motivo: 'fora' }
}

export type ResultadoDasRotas =
  /** `rotas`: a do TomTom primeiro (quando respondeu), depois a do OSRM. `semTransito` diz por que o TomTom não entrou. */
  | { ok: true; rotas: RotaDoServico[]; semTransito: MotivoSemTransito | null }
  | { ok: false; erro: ErroDeServico | 'sem_rota' }

export interface OpcoesDasRotas extends OpcoesDeRede {
  /** Preferência "Usar trânsito (TomTom)" de Mais. Desligada, nada chama a função. */
  usarTransito: boolean
  /** "ambos": consulta os dois ao mesmo tempo (botão, para comparar). "reserva": o OSRM só se o TomTom falhar. */
  modo: 'ambos' | 'reserva'
}

async function osrm(de: Ponto, ate: Ponto, opcoes: OpcoesDeRede) {
  const r = await calcularRota(de, ate, opcoes)
  return r.ok ? ({ ok: true, rota: { ...r.rota, servico: 'osrm' } } as const) : r
}

/**
 * A rota da posição até a próxima parada. Preferência desligada: só o OSRM, exatamente como na
 * versão anterior. Ligada: o TomTom; se falhar (sem chave, cota, fora, tempo esgotado), o OSRM.
 */
export async function calcularRotasDaPosicao(de: Ponto, ate: Ponto, opcoes: OpcoesDasRotas): Promise<ResultadoDasRotas> {
  const { usarTransito, modo, ...rede } = opcoes
  if (!usarTransito) {
    const r = await osrm(de, ate, rede)
    return r.ok ? { ok: true, rotas: [r.rota], semTransito: 'desligado' } : { ok: false, erro: r.erro }
  }
  if (modo === 'ambos') {
    const [t, o] = await Promise.all([calcularRotaComTransito(de, ate, rede), osrm(de, ate, rede)])
    const rotas = [...(t.ok ? [t.rota] : []), ...(o.ok ? [o.rota] : [])]
    if (rotas.length === 0) return { ok: false, erro: o.ok ? 'fora' : o.erro }
    return { ok: true, rotas, semTransito: t.ok ? null : t.motivo }
  }
  const t = await calcularRotaComTransito(de, ate, rede)
  if (t.ok) return { ok: true, rotas: [t.rota], semTransito: null }
  const o = await osrm(de, ate, rede)
  return o.ok ? { ok: true, rotas: [o.rota], semTransito: t.motivo } : { ok: false, erro: o.erro }
}
