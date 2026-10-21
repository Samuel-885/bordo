// Ordem das etapas no planejamento: a origem é sempre a primeira e o destino
// sempre o último; só as etapas do meio podem ser reordenadas.

import type { Etapa, TipoEtapa, Trecho } from './tipos'

function posto(tipo: TipoEtapa): number {
  return tipo === 'origem' ? 0 : tipo === 'destino' ? 2 : 1
}

/** Origem, depois as do meio pela ordem atual, depois o destino. Renumera de 1 em diante. */
export function normalizarOrdem(etapas: readonly Etapa[]): Etapa[] {
  return [...etapas]
    .sort((a, b) => posto(a.tipo) - posto(b.tipo) || a.ordem - b.ordem)
    .map((e, i) => ({ ...e, ordem: i + 1 }))
}

/** Quanto a etapa pode andar: só entre etapas do meio. */
export function podeMover(etapas: readonly Etapa[], etapaId: string, sentido: 'subir' | 'descer'): boolean {
  const lista = normalizarOrdem(etapas)
  const i = lista.findIndex((e) => e.id === etapaId)
  const vizinha = lista[sentido === 'subir' ? i - 1 : i + 1]
  const etapa = lista[i]
  if (!etapa || !vizinha) return false
  return posto(etapa.tipo) === 1 && posto(vizinha.tipo) === 1
}

/** Troca a etapa com a vizinha. Devolve a lista renumerada (igual à recebida se não puder mover). */
export function moverEtapa(etapas: readonly Etapa[], etapaId: string, sentido: 'subir' | 'descer'): Etapa[] {
  const lista = normalizarOrdem(etapas)
  if (!podeMover(lista, etapaId, sentido)) return lista
  const i = lista.findIndex((e) => e.id === etapaId)
  const j = sentido === 'subir' ? i - 1 : i + 1
  const a = lista[i]!
  const b = lista[j]!
  lista[i] = { ...b, ordem: i + 1 }
  lista[j] = { ...a, ordem: j + 1 }
  return lista
}

/** Etapas vizinhas na ordem atual, como pares (anterior, seguinte). */
export function paresVizinhos(etapas: readonly Etapa[]): Array<[Etapa, Etapa]> {
  const lista = normalizarOrdem(etapas)
  return lista.slice(1).map((e, i) => [lista[i]!, e])
}

/** A lista de etapas depois de gravar `etapa`: nova entra no fim do meio; existente mantém a posição. */
export function etapasAposSalvar(existentes: readonly Etapa[], etapa: Etapa): Etapa[] {
  const ja = existentes.find((e) => e.id === etapa.id)
  const ordem = ja ? ja.ordem : Math.max(0, ...existentes.map((e) => e.ordem)) + 1
  return normalizarOrdem([...existentes.filter((e) => e.id !== etapa.id), { ...etapa, ordem }])
}

export function etapasAposExcluir(existentes: readonly Etapa[], etapaId: string): Etapa[] {
  return normalizarOrdem(existentes.filter((e) => e.id !== etapaId))
}

/**
 * Trechos que não fazem mais sentido nesta lista de etapas: os que não ligam etapas
 * vizinhas ou que passam por um local que deixou de ser candidato.
 */
export function trechosQueDeixamDeValer(etapas: readonly Etapa[], trechos: readonly Trecho[]): Trecho[] {
  const vizinhas = new Set(paresVizinhos(etapas).map(([a, b]) => `${a.id}>${b.id}`))
  const candidatos = new Map(etapas.map((e) => [e.id, new Set([...(e.localId ? [e.localId] : []), ...e.alternativas])]))
  return trechos.filter(
    (t) =>
      !vizinhas.has(`${t.etapaOrigemId}>${t.etapaDestinoId}`) ||
      !candidatos.get(t.etapaOrigemId)?.has(t.localOrigemId) ||
      !candidatos.get(t.etapaDestinoId)?.has(t.localDestinoId),
  )
}
