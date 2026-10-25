// Como uma viagem aparece em listas e avisos: nome, data e status (duas viagens podem ter o mesmo nome).

import type { Instante, Viagem } from '../../core/tipos'
import { formatarData } from './horarios'

export const STATUS_DA_VIAGEM = { planejando: 'Planejando', em_andamento: 'Em andamento', concluida: 'Concluída' } as const

/** "14/11/2026". */
export function dataBr(i: Instante): string {
  const [a, m, d] = formatarData(i).split('-')
  return `${d}/${m}/${a}`
}

/** "Teste · 14/11/2026 · Concluída". */
export function rotuloDaViagem(v: Pick<Viagem, 'nome' | 'dataSaida' | 'status'>): string {
  return `${v.nome || 'Sem nome'} · ${dataBr(v.dataSaida)} · ${STATUS_DA_VIAGEM[v.status]}`
}

/** Viagem iniciada ou concluída tem registros reais: a exclusão pede a caixa de confirmação e sugere o backup. */
export const exigeConfirmacaoForte = (v: Pick<Viagem, 'status'>): boolean => v.status !== 'planejando'
