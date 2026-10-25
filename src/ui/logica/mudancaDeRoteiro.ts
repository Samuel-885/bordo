// Formulário da mudança de roteiro em viagem: o tempo de cada trecho novo (digitado ou calculado
// pela rota) e os textos. Nenhuma regra: as validações e a previsão vêm de `core/inclusao.ts`.

import { aplicarFatorOnibus } from '../../core/trechos'
import type { ParDeTrecho } from '../../core/trechos'
import type { Instante, Trecho } from '../../core/tipos'
import { formatarDuracao, minutosDeHorasEMinutos } from './duracao'
import { formatarHora } from './horarios'

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

const formatarFator = (f: number) => f.toLocaleString('pt-BR', { minimumFractionDigits: 2 })

/** Minutos de ônibus de um trecho calculado pela rota (carro × fator, para cima). */
export const minutosDeOnibusDaRota = (perna: Extract<Perna, { tipo: 'rota' }>, fator: number): number =>
  aplicarFatorOnibus(perna.minutosCarro, fator)

/** "De Mirante até Sogra: 7 min · pela rota (carro 6 min × 1,15)". */
export function textoDoTrechoPelaRota(titulo: string, perna: Extract<Perna, { tipo: 'rota' }>, fator: number): string {
  return `${titulo}: ${formatarDuracao(minutosDeOnibusDaRota(perna, fator))} · pela rota (carro ${formatarDuracao(perna.minutosCarro)} × ${formatarFator(fator)})`
}

/** "Até Mirante: 20 min · pela sua localização, sem trânsito, calculado às 09:29". */
export function textoDoTrechoPelaLocalizacao(titulo: string, minutosOnibus: number, calculadoEm: Instante): string {
  return `${titulo}: ${formatarDuracao(minutosOnibus)} · pela sua localização, sem trânsito, calculado às ${formatarHora(calculadoEm)}`
}

/** Explica o que a mudança custa: "+50 min no destino", "sem efeito no destino", "−5 min no destino". */
export function textoDoImpactoNoDestino(minutos: number | null): string {
  if (minutos === null) return 'impacto no destino: sem tempo definido'
  if (minutos === 0) return 'sem efeito no destino'
  return `${minutos > 0 ? '+' : '−'}${Math.abs(minutos)} min no destino`
}
