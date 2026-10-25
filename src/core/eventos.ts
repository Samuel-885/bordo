// Criação de eventos. Todo horário de evento é arredondado para baixo, para o
// minuto, ao ser criado ou corrigido: o app trabalha só com minutos inteiros.

import { truncarMinuto } from './tempo'
import type { Evento, EventoBase, Instante } from './tipos'

type SemBase<T> = T extends unknown ? Omit<T, keyof EventoBase> : never
/** O tipo do evento e seus dados, sem id e horários. */
export type ConteudoEvento = SemBase<Evento>

function truncarDados(conteudo: ConteudoEvento): ConteudoEvento {
  if (conteudo.tipo === 'recalibracao') {
    const { calculadoEm } = conteudo.dados
    return {
      ...conteudo,
      dados: { ...conteudo.dados, horario: truncarMinuto(conteudo.dados.horario), ...(calculadoEm ? { calculadoEm: truncarMinuto(calculadoEm) } : {}) },
    }
  }
  return conteudo
}

export function criarEvento(base: EventoBase, conteudo: ConteudoEvento): Evento {
  return {
    ...truncarDados(conteudo),
    ...base,
    horarioFato: truncarMinuto(base.horarioFato),
    registradoEm: truncarMinuto(base.registradoEm),
  } as Evento
}

/** Corrigir um horário muda só o do fato. */
export function corrigirHorario(evento: Evento, horarioFato: Instante): Evento {
  return { ...evento, horarioFato: truncarMinuto(horarioFato) }
}

/**
 * Os eventos na ordem de gravação: a sequência, quando existe; senão a posição na lista (um
 * evento acrescentado no fim, como o simulado da avaliação das alternativas, vale por último).
 * Quem depois ordena pelo horário do fato (`ordenarPor`, que é estável) desempata o mesmo
 * minuto pela ordem de gravação, e não pela ordem em que o banco devolveu a lista.
 */
export function emOrdemDeGravacao(eventos: readonly Evento[]): Evento[] {
  const chave = (e: Evento, i: number) => e.sequencia ?? 1e9 + i
  return eventos
    .map((e, i) => ({ e, k: chave(e, i) }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.e)
}
