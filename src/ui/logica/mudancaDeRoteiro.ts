// Formulário da mudança de roteiro em viagem: o tempo de cada trecho novo (digitado ou calculado
// pela rota) e os textos. Nenhuma regra: as validações e a previsão vêm de `core/inclusao.ts`.

import { aplicarFatorOnibus } from '../../core/trechos'
import type { ParDeTrecho } from '../../core/trechos'
import type { Instante, Trecho } from '../../core/tipos'
import { formatarDuracao, minutosDeHorasEMinutos } from './duracao'

/** O tempo de um trecho novo: digitado (minutos de ônibus) ou calculado pela rota (minutos de carro). */
export type Perna =
  | { tipo: 'manual'; horas: string; minutos: string }
  | { tipo: 'rota'; minutosCarro: number; distanciaKm: number; calculadoEm: Instante }

export const pernaVazia = (): Perna => ({ tipo: 'manual', horas: '', minutos: '' })

/** O trecho guardado no evento, ou vazio se o tempo ainda não está preenchido (nada é inventado). */
export function trechoDaPerna(par: ParDeTrecho, perna: Perna): Trecho | null {
  if (perna.tipo === 'rota') {
    return { ...par, duracaoMin: perna.minutosCarro, fonte: 'rota', distanciaKm: perna.distanciaKm, calculadoEm: perna.calculadoEm }
  }
  const minutos = minutosDeHorasEMinutos(perna.horas, perna.minutos)
  return minutos === null ? null : { ...par, duracaoMin: minutos, fonte: 'manual' }
}

/** "carro 1h40 × fator 1,15 = 1h55 · 90 km · estimativa sem trânsito". */
export function textoDaRotaDaPerna(perna: Extract<Perna, { tipo: 'rota' }>, fator: number): string {
  const onibus = aplicarFatorOnibus(perna.minutosCarro, fator)
  const km = perna.distanciaKm.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
  return `carro ${formatarDuracao(perna.minutosCarro)} × fator ${fator.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} = ${formatarDuracao(onibus)} · ${km} km · estimativa sem trânsito`
}

/** Explica o que a mudança custa: "+50 min no destino", "sem efeito no destino", "−5 min no destino". */
export function textoDoImpactoNoDestino(minutos: number | null): string {
  if (minutos === null) return 'impacto no destino: sem tempo definido'
  if (minutos === 0) return 'sem efeito no destino'
  return `${minutos > 0 ? '+' : '−'}${Math.abs(minutos)} min no destino`
}
