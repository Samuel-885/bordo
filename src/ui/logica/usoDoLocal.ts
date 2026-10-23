// Onde um local do catálogo está sendo usado (para explicar por que não pode ser excluído).
// A trava em si é do repositório (LocalEmUso); aqui só se monta o texto.

import type { Etapa, Local, Viagem } from '../../core/tipos'
import { nomeDaEtapa } from './textos'

export interface PlanoParaUso {
  viagem: Pick<Viagem, 'nome'>
  etapas: Etapa[]
  locais: Local[]
}

/** Uma linha por uso: `Viagem X: Almoço (preferido)` ou `Viagem X: Café (alternativa)`. */
export function usosDoLocal(localId: string, planos: PlanoParaUso[]): string[] {
  return planos.flatMap(({ viagem, etapas, locais }) =>
    etapas.flatMap((e) => {
      const papel = e.localId === localId ? 'preferido' : e.alternativas.includes(localId) ? 'alternativa' : null
      return papel ? [`${viagem.nome || 'Viagem sem nome'}: ${nomeDaEtapa(e, locais)} (${papel})`] : []
    }),
  )
}
