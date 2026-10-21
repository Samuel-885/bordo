// Relógio único do app: todo horário atual vem de agora().
// Este é o único arquivo onde Date.now() é permitido.

import { deMs } from './tempo'
import type { Instante } from './tipos'

export function agora(): Instante {
  return deMs(Date.now())
}
