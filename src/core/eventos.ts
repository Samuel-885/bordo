// Criação de eventos. Todo horário de evento é arredondado para baixo, para o
// minuto, ao ser criado ou corrigido: o app trabalha só com minutos inteiros.

import { truncarMinuto } from './tempo'
import type { Evento, EventoBase, Instante } from './tipos'

type SemBase<T> = T extends unknown ? Omit<T, keyof EventoBase> : never
/** O tipo do evento e seus dados, sem id e horários. */
export type ConteudoEvento = SemBase<Evento>

function truncarDados(conteudo: ConteudoEvento): ConteudoEvento {
  if (conteudo.tipo === 'recalibracao') {
    return { ...conteudo, dados: { ...conteudo.dados, horario: truncarMinuto(conteudo.dados.horario) } }
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
