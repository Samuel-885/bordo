// Relógio único do app: todo horário atual vem de agora().
// Este é o único arquivo onde Date.now() é permitido.
//
// O app sempre começa no relógio real. O relógio simulado (modo demonstração)
// fica só nesta variável de módulo: não é persistido e some ao recarregar a página.

import { deMs, somarMinutos, truncarMinuto } from './tempo'
import type { Instante } from './tipos'

export type PassoRelogio = 5 | 15 | 60

/** Vazio = relógio real. Parado: só muda por avançar ou definir. */
let simulado: Instante | null = null
/** Vazio = simulado parado. Correndo: o momento do relógio do sistema em que `simulado` valia. */
let correndoDesdeMs: number | null = null

/** O simulado agora: parado, `simulado`; correndo, `simulado` mais o tempo real decorrido. */
function atualSimulado(base: Instante): Instante {
  return correndoDesdeMs === null ? base : deMs(Date.parse(base) + (Date.now() - correndoDesdeMs))
}

export function agora(): Instante {
  return simulado ? atualSimulado(simulado) : deMs(Date.now())
}

/** Liga o relógio simulado, parado em `inicio` (arredondado para baixo, para o minuto). */
export function usarRelogioSimulado(inicio: Instante): void {
  simulado = truncarMinuto(inicio)
  correndoDesdeMs = null
}

/** Volta ao relógio do sistema. */
export function usarRelogioReal(): void {
  simulado = null
  correndoDesdeMs = null
}

/** Verdadeiro enquanto o relógio simulado está ligado: a interface mostra "MODO DEMONSTRAÇÃO". */
export function simuladoAtivo(): boolean {
  return simulado !== null
}

function exigirSimulado(): Instante {
  if (simulado === null) throw new Error('O relógio simulado não está ligado.')
  return simulado
}

/** Correndo, avançar e definir continuam valendo e o relógio segue correndo dali. */
export function avancarSimulado(minutos: PassoRelogio): void {
  const atual = atualSimulado(exigirSimulado())
  simulado = somarMinutos(truncarMinuto(atual), minutos)
  if (correndoDesdeMs !== null) correndoDesdeMs = Date.now()
}

export function definirSimulado(horario: Instante): void {
  exigirSimulado()
  simulado = truncarMinuto(horario)
  if (correndoDesdeMs !== null) correndoDesdeMs = Date.now()
}

/** O simulado passa a avançar em tempo real, a partir do horário simulado atual. */
export function correrSimulado(): void {
  const atual = exigirSimulado()
  if (correndoDesdeMs === null) correndoDesdeMs = Date.now()
  simulado = atual
}

/** Para o simulado no horário em que está (arredondado para baixo, para o minuto). */
export function pararSimulado(): void {
  const atual = exigirSimulado()
  simulado = truncarMinuto(atualSimulado(atual))
  correndoDesdeMs = null
}

export function simuladoCorrendo(): boolean {
  return simulado !== null && correndoDesdeMs !== null
}
