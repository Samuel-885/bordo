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

export function agora(): Instante {
  return simulado ?? deMs(Date.now())
}

/** Liga o relógio simulado, parado em `inicio` (arredondado para baixo, para o minuto). */
export function usarRelogioSimulado(inicio: Instante): void {
  simulado = truncarMinuto(inicio)
}

/** Volta ao relógio do sistema. */
export function usarRelogioReal(): void {
  simulado = null
}

/** Verdadeiro enquanto o relógio simulado está ligado: a interface mostra "MODO DEMONSTRAÇÃO". */
export function simuladoAtivo(): boolean {
  return simulado !== null
}

function exigirSimulado(): Instante {
  if (simulado === null) throw new Error('O relógio simulado não está ligado.')
  return simulado
}

export function avancarSimulado(minutos: PassoRelogio): void {
  simulado = somarMinutos(exigirSimulado(), minutos)
}

export function definirSimulado(horario: Instante): void {
  exigirSimulado()
  simulado = truncarMinuto(horario)
}
