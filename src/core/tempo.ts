// Toda conta e comparação de horários passa por aqui, com valor numérico.
// Ipatinga e Ribeirão Preto estão no mesmo fuso, sem horário de verão.

import type { HoraDoDia, Instante } from './tipos'

export const FUSO = '-03:00'
const DESLOCAMENTO_MS = -3 * 60 * 60_000
const MINUTO_MS = 60_000

const FORMATO_INSTANTE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/
const FORMATO_HORA = /^([01]\d|2[0-3]):[0-5]\d$/

/** Valida um texto ISO completo, com fuso, e o transforma em Instante. */
export function instante(texto: string): Instante {
  if (!FORMATO_INSTANTE.test(texto) || Number.isNaN(Date.parse(texto))) {
    throw new Error(`Horário inválido (precisa de data completa e fuso): ${texto}`)
  }
  return texto as Instante
}

function paraMs(i: Instante): number {
  return Date.parse(i)
}

/** Formata no fuso -03:00, em segundos. */
export function deMs(ms: number): Instante {
  const local = new Date(ms + DESLOCAMENTO_MS).toISOString().slice(0, 19)
  return `${local}${FUSO}` as Instante
}

export function somarMinutos(i: Instante, minutos: number): Instante {
  return deMs(paraMs(i) + minutos * MINUTO_MS)
}

/** a − b, em minutos. */
export function diferencaMin(a: Instante, b: Instante): number {
  return (paraMs(a) - paraMs(b)) / MINUTO_MS
}

export function antes(a: Instante, b: Instante): boolean {
  return paraMs(a) < paraMs(b)
}

export function mesmoInstante(a: Instante, b: Instante): boolean {
  return paraMs(a) === paraMs(b)
}

export function maisTarde(a: Instante, b: Instante): Instante {
  return antes(a, b) ? b : a
}

/** Ordena por horário, sem alterar a lista recebida. */
export function ordenarPor<T>(lista: readonly T[], horario: (item: T) => Instante): T[] {
  return [...lista].sort((x, y) => paraMs(horario(x)) - paraMs(horario(y)))
}

/** O horário "HH:MM" no dia (em -03:00) de `referencia`, mais `dias`. */
export function naHoraDoDia(referencia: Instante, hora: HoraDoDia, dias = 0): Instante {
  if (!FORMATO_HORA.test(hora)) throw new Error(`Hora inválida (use HH:MM): ${hora}`)
  const data = deMs(paraMs(referencia)).slice(0, 10)
  return somarMinutos(instante(`${data}T${hora}:00${FUSO}`), dias * 24 * 60)
}

/** "HH:MM" em minutos desde a meia-noite. */
export function minutosDoDia(hora: HoraDoDia): number {
  if (!FORMATO_HORA.test(hora)) throw new Error(`Hora inválida (use HH:MM): ${hora}`)
  const [h, m] = hora.split(':').map(Number)
  return h! * 60 + m!
}

/** Arredonda para baixo, para o minuto. */
export function truncarMinuto(i: Instante): Instante {
  const ms = paraMs(i)
  return deMs(ms - (((ms % MINUTO_MS) + MINUTO_MS) % MINUTO_MS))
}
