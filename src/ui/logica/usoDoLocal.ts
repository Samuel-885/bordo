// Onde um local do catálogo está sendo usado (para explicar por que não pode ser excluído).
// A trava em si é do repositório (LocalEmUso); aqui só se monta o texto.

import type { Etapa, Local, Viagem } from '../../core/tipos'
import { nomeDaEtapa } from './textos'
import { dataBr, STATUS_DA_VIAGEM } from './viagens'

export interface PlanoParaUso {
  viagem: Pick<Viagem, 'nome' | 'dataSaida' | 'status'>
  etapas: Etapa[]
  locais: Local[]
}

/** Uma linha por uso: `Teste (14/11/2026, Concluída): Almoço (preferido)`; a data distingue viagens de mesmo nome. */
export function usosDoLocal(localId: string, planos: PlanoParaUso[]): string[] {
  return planos.flatMap(({ viagem, etapas, locais }) =>
    etapas.flatMap((e) => {
      const papel = e.localId === localId ? 'preferido' : e.alternativas.includes(localId) ? 'alternativa' : null
      return papel ? [`${viagem.nome || 'Viagem sem nome'} (${dataBr(viagem.dataSaida)}, ${STATUS_DA_VIAGEM[viagem.status]}): ${nomeDaEtapa(e, locais)} (${papel})`] : []
    }),
  )
}
