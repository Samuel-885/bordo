// Horário digitado em "HH:MM" nas folhas da tela principal, resolvido para um instante.

import { rotuloHorario, resolverHoraPassada } from '../../core/registro'
import { diferencaMin, naHoraDoDia, truncarMinuto } from '../../core/tempo'
import type { Instante } from '../../core/tipos'

const FORMATO = /^([01]\d|2[0-3]):[0-5]\d$/

export const horaValida = (texto: string): boolean => FORMATO.test(texto)

/**
 * Registro esquecido, correção, imprevisto e VOLTAMOS: a ocorrência mais recente que
 * não seja depois de agora. Se violar uma trava, quem chama mostra a trava.
 */
export function resolverHorarioPassado(hora: string, agora: Instante): Instante | null {
  return horaValida(hora) ? resolverHoraPassada(hora, agora) : null
}

/**
 * Previsão informada (futuro próximo): entre hoje e amanhã, o que fica mais perto de
 * agora. Assim 12:05 às 12:10 vale hoje (e é recusada), e 00:10 às 23:50 vale amanhã.
 */
export function resolverHorarioProximo(hora: string, agora: Instante): Instante | null {
  if (!horaValida(hora)) return null
  const ref = truncarMinuto(agora)
  const hoje = naHoraDoDia(ref, hora)
  const amanha = naHoraDoDia(ref, hora, 1)
  return Math.abs(diferencaMin(amanha, ref)) < Math.abs(diferencaMin(hoje, ref)) ? amanha : hoje
}

/** "HH:MM" se for hoje; "23:55 do dia 14" se for outro dia. */
export const rotuloComDia = rotuloHorario

/** Para mostrar o horário resolvido ao lado do campo, só quando não é hoje. */
export function avisoDeDia(resolvido: Instante | null, agora: Instante): string | null {
  if (!resolvido) return null
  const texto = rotuloHorario(resolvido, agora)
  return texto.length > 5 ? texto : null
}

