// Cálculo de atraso: horário (real ou previsto) − original do mesmo evento.
// Nunca soma de diferenças.

import { CONFIG } from './config'
import { diferencaMin } from './tempo'
import type { Instante } from './tipos'

/** Positivo = atraso, negativo = adiantamento. */
export function atrasoMin(horario: Instante, original: Instante): number {
  return diferencaMin(horario, original)
}

export type SituacaoAtraso = 'no_horario' | 'atrasado' | 'adiantado'

/** Até a tolerância, para mais ou para menos, é "no horário". */
export function classificarAtraso(
  minutos: number,
  tolerancia: number = CONFIG.toleranciaNoHorarioMin,
): { situacao: SituacaoAtraso; minutos: number } {
  if (Math.abs(minutos) <= tolerancia) return { situacao: 'no_horario', minutos }
  return { situacao: minutos > 0 ? 'atrasado' : 'adiantado', minutos }
}
