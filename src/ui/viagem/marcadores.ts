// Situação de cada parada no roteiro (feita, estamos aqui, próxima, adiante, pulada) e as
// alternativas da próxima parada flexível. A lista de paradas e o mapa usam o mesmo critério.

import { avaliarAlternativas, paradasFlexiveisPendentes } from '../../core/viabilidade'
import type { AvaliacaoAlternativa } from '../../core/viabilidade'
import type { Consulta, EstadoEtapa, Etapa } from '../../core/tipos'
import type { ContextoDaViagem } from './dados'
import type { Derivados } from './derivados'

export type Marcador = 'feita' | 'aqui' | 'proxima' | 'futura' | 'pulada'

export function marcadorDa(estado: EstadoEtapa | undefined, etapa: Etapa, d: Derivados): Marcador {
  if (!estado) return 'futura'
  if (estado.estado === 'pulada') return 'pulada'
  if (estado.estado === 'concluida') return 'feita'
  if (etapa.tipo === 'destino' && estado.chegada?.origem === 'real') return 'feita'
  if (estado.estado === 'em_parada' || (etapa.tipo === 'origem' && d.s.situacao === 'aguardando_saida')) return 'aqui'
  return etapa.id === d.proxima ? 'proxima' : 'futura'
}

/** A próxima parada flexível com alternativas e a avaliação de cada uma (a mesma da lista de paradas). */
export function alternativasDaProxima(c: ContextoDaViagem, d: Derivados, consultas: readonly Consulta[]): { etapa: Etapa | null; avaliacoes: AvaliacaoAlternativa[] } {
  const etapa = paradasFlexiveisPendentes(c.plano, d.s.estado).find((e) => e.alternativas.length > 0) ?? null
  const avaliacoes = etapa ? avaliarAlternativas(c.plano, d.original, c.eventos, c.agora, etapa.id, consultas) : []
  return { etapa, avaliacoes }
}

export const ROTULO_MARCADOR: Record<Marcador, string> = {
  feita: 'Feita',
  aqui: 'Estamos aqui',
  proxima: 'Próxima',
  futura: 'Adiante',
  pulada: 'Pulada',
}
